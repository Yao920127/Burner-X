
/**
 * history_pdf_compare.js
 * MinerU 結構化翻譯的 PDF 對照檢視（左右對照 + 長畫布 + 懶載入）
 */

class PDFCompareView {
  constructor() {
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.0;
    this.dpr = window.devicePixelRatio || 1;

    // 左右兩側畫布與覆蓋層（長畫布）
    this.originalCanvas = null;
    this.originalContext = null;
    this.originalOverlay = null;
    this.originalOverlayContext = null;
    this.translationCanvas = null;
    this.translationContext = null;
    this.translationOverlay = null;
    this.translationOverlayContext = null;

    // 資料
    this.contentListJson = null;
    this.translatedContentList = null;
    this.layoutJson = null;

    // 連續模式 & 懶載入
    this.mode = 'continuous';
    this.pageInfos = [];
    this._lazyScrollTimer = null;
    this._lazyInitialized = false;
    this._renderingVisible = false;
    this._pendingVisibleRender = false;

    // PDF.js 渲染序列佇列（避免同一 canvas 並行 render 報錯）
    this._renderQueueOriginal = Promise.resolve();
    this._renderQueueTranslation = Promise.resolve();

    // PDF 文字層快取（用於精確清除文字）
    this.pageTextLayers = new Map(); // pageNum -> textContent

    // ============ 新模組化架構 ============
    // 初始化文字自適應渲染模組
    this.textFittingAdapter = null;
    // 相容性：保留原有屬性
    this.textFittingEngine = null;
    this.globalFontSizeCache = new Map();
    this.hasPreprocessed = false;

    // 初始化PDF匯出模組
    this.pdfExporter = null;

    // 初始化分段管理模組
    this.segmentManager = null;

    // 初始化模組（延遲到 initialize 方法，確保依賴載入）
    this._initializeModules();
  }

  /**
   * 初始化各個功能模組
   */
  _initializeModules() {
    try {
      // 初始化文字自適應模組
      if (typeof TextFittingAdapter !== 'undefined') {
        this.textFittingAdapter = new TextFittingAdapter({
          initialScale: 1.0,
          minScale: 0.3,
          scaleStepHigh: 0.05,
          scaleStepLow: 0.1,
          lineSkipCJK: 1.5,
          lineSkipWestern: 1.3,
          minLineHeight: 1.05,
          globalFontScale: 0.85,
          bboxNormalizedRange: 1000
        });
        console.log('[PDFCompareView] TextFittingAdapter 已初始化');
      } else {
        console.warn('[PDFCompareView] TextFittingAdapter 未載入，將使用回退方案');
      }

      // 初始化PDF匯出模組
      if (typeof PDFExporter !== 'undefined') {
        this.pdfExporter = new PDFExporter({
          bboxNormalizedRange: 1000
        });
        console.log('[PDFCompareView] PDFExporter 已初始化');
      } else {
        console.warn('[PDFCompareView] PDFExporter 未載入，匯出功能將不可用');
      }

      // SegmentManager 將在 renderAllPagesContinuous 中初始化，因為需要 pdfDoc
    } catch (error) {
      console.error('[PDFCompareView] 模組初始化失敗:', error);
    }
  }

  /**
   * 初始化文字自適應引擎
   */
  initializeTextFitting() {
    // 優先使用新模組
    if (this.textFittingAdapter) {
      this.textFittingAdapter.initialize();
      // 相容性：同步到舊屬性
      this.textFittingEngine = this.textFittingAdapter.textFittingEngine;
      return;
    }

    // 回退：使用原有實現
    if (typeof TextFittingEngine === 'undefined') {
      console.error('[PDFCompareView] TextFittingEngine 未載入！請確保 js/utils/text-fitting.js 已正確引入');
      console.error('[PDFCompareView] 當前可用類:', typeof TextFittingEngine, typeof PDFTextRenderer);
      return;
    }

    try {
      this.textFittingEngine = new TextFittingEngine({
        initialScale: 1.0,
        minScale: 0.3,
        scaleStepHigh: 0.05,
        scaleStepLow: 0.1,
        lineSkipCJK: 1.5,
        lineSkipWestern: 1.3,
        minLineHeight: 1.05
      });

      console.log('[PDFCompareView] 文字自適應引擎已啟用');
    } catch (error) {
      console.error('[PDFCompareView] 文字自適應引擎初始化失敗:', error);
    }
  }

  /**
   * 預處理：計算全域統一的字號
   */
  preprocessGlobalFontSizes() {
    // 優先使用新模組
    if (this.textFittingAdapter) {
      this.textFittingAdapter.preprocessGlobalFontSizes(
        this.contentListJson,
        this.translatedContentList
      );
      // 相容性：同步快取
      this.globalFontSizeCache = this.textFittingAdapter.globalFontSizeCache;
      this.hasPreprocessed = this.textFittingAdapter.hasPreprocessed;
      return;
    }

    // 回退：使用原有實現
    if (this.hasPreprocessed) return;

    console.log('[PDFCompareView] 開始預處理全域字號...');
    const startTime = performance.now();

    const globalFontScale = 0.85;

    this.contentListJson.forEach((item, idx) => {
      if (item.type !== 'text' || !item.bbox) return;

      const translatedItem = this.translatedContentList[idx];
      if (!translatedItem || !translatedItem.text) return;

      const bbox = item.bbox;
      const BBOX_NORMALIZED_RANGE = 1000;
      const height = (bbox[3] - bbox[1]) / BBOX_NORMALIZED_RANGE;

      const estimatedFontSize = height * globalFontScale;

      this.globalFontSizeCache.set(idx, {
        estimatedFontSize: estimatedFontSize,
        bbox: bbox
      });
    });

    console.log(`[PDFCompareView] 預處理完成：全域縮放=${globalFontScale}, 耗時=${(performance.now() - startTime).toFixed(0)}ms`);
    this.hasPreprocessed = true;
  }

  /**
   * 獲取並快取頁面的文字層資訊
   * @param {number} pageNum - 頁碼（1-based）
   * @returns {Promise<Array>} 文字項陣列
   */
  async getPageTextLayer(pageNum) {
    // 檢查快取
    if (this.pageTextLayers.has(pageNum)) {
      return this.pageTextLayers.get(pageNum);
    }

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      // 快取結果
      this.pageTextLayers.set(pageNum, textContent.items);

      console.log(`[PDFCompareView] 頁面 ${pageNum} 文字層已快取，共 ${textContent.items.length} 個文字項`);
      return textContent.items;
    } catch (error) {
      console.error(`[PDFCompareView] 獲取頁面 ${pageNum} 文字層失敗:`, error);
      return [];
    }
  }

  /**
   * 精確清除 bbox 內的原始文字（只清除文字，保留背景）
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {number} pageNum - 頁碼（1-based）
   * @param {Object} bbox - 邊界框 { x, y, w, h }（canvas 座標）
   * @param {number} yOffset - Y 軸偏移（用於連續模式）
   */
  async clearTextInBbox(ctx, pageNum, bbox, yOffset = 0) {
    const textItems = await this.getPageTextLayer(pageNum);
    if (!textItems || textItems.length === 0) {
      console.warn(`[clearTextInBbox] 頁面 ${pageNum} 沒有文字層資料`);
      return;
    }

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale * this.dpr });

    console.log(`[clearTextInBbox] 頁面 ${pageNum}, bbox: x=${bbox.x.toFixed(1)}, y=${bbox.y.toFixed(1)}, w=${bbox.w.toFixed(1)}, h=${bbox.h.toFixed(1)}, yOffset=${yOffset.toFixed(1)}, viewport: ${viewport.width}x${viewport.height}`);

    let clearedCount = 0;
    let checkedCount = 0;

    // 走訪所有文字項，找出與 bbox 重疊的
    for (const item of textItems) {
      if (!item.transform) continue;
      checkedCount++;

      // PDF.js 文字項的座標轉換
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const transform = item.transform;
      const tx = transform[4] * this.scale * this.dpr;
      const ty = transform[5] * this.scale * this.dpr;
      const itemWidth = item.width * this.scale * this.dpr;
      const itemHeight = item.height * this.scale * this.dpr;

      // 轉換為 Canvas 座標（考慮 Y 軸翻轉）
      const textX = tx;
      const textY = viewport.height - ty - itemHeight;
      const textW = itemWidth;
      const textH = itemHeight;

      // 注意：這裡的 bbox.y 已經包含了 yOffset（在呼叫時計算好的）
      // 所以 textY 也需要加上 yOffset 才能對齊
      const textRect = { x: textX, y: textY + yOffset, w: textW, h: textH };

      // 除錯：顯示前幾個文字項的座標
      if (clearedCount === 0 && checkedCount <= 3) {
        console.log(`  文字項 ${checkedCount}: str="${item.str}", textRect: x=${textRect.x.toFixed(1)}, y=${textRect.y.toFixed(1)}, w=${textRect.w.toFixed(1)}, h=${textRect.h.toFixed(1)}`);
      }

      // 檢查是否與 bbox 重疊
      if (this.checkRectOverlap(textRect, bbox)) {
        // 在文字區域填充白色（略微擴大邊界以確保覆蓋完整）
        const padding = 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)'; // 完全不透明
        ctx.fillRect(
          textX - padding,
          textY + yOffset - padding,
          textW + padding * 2,
          textH + padding * 2
        );
        clearedCount++;

        // 除錯：繪製紅色邊框顯示清除區域（已關閉）
        if (false) {
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(textX - padding, textY + yOffset - padding, textW + padding * 2, textH + padding * 2);
        }

        // 除錯：顯示清除的文字
        if (clearedCount <= 5) {
          console.log(`  清除文字 ${clearedCount}: "${item.str}" at (${textX.toFixed(1)}, ${(textY + yOffset).toFixed(1)})`);
        }
      }
    }

    console.log(`[clearTextInBbox] 頁面 ${pageNum} 檢查了 ${checkedCount} 個文字項，清除了 ${clearedCount} 個`);
  }

  /**
   * 檢查兩個矩形是否重疊
   * @param {Object} rect1 - { x, y, w, h }
   * @param {Object} rect2 - { x, y, w, h }
   * @returns {boolean}
   */
  checkRectOverlap(rect1, rect2) {
    return !(
      rect1.x + rect1.w < rect2.x ||  // rect1 在 rect2 左邊
      rect1.x > rect2.x + rect2.w ||  // rect1 在 rect2 右邊
      rect1.y + rect1.h < rect2.y ||  // rect1 在 rect2 上邊
      rect1.y > rect2.y + rect2.h     // rect1 在 rect2 下邊
    );
  }

  /**
   * 初始化 PDF 對照檢視
   * @param {string} pdfBase64 - PDF 檔案的 base64 字串
   * @param {Array} contentListJson - content_list.json 資料
   * @param {Array} translatedContentList - 翻譯後的內容列表
   * @param {Object} layoutJson - layout.json 資料（包含頁面真實尺寸）
   */
  async initialize(pdfBase64, contentListJson, translatedContentList, layoutJson) {
    // 初始化文字自適應引擎
    this.initializeTextFitting();

    // 儲存原始PDF資料（用於匯出）
    this.originalPdfBase64 = pdfBase64;

    this.contentListJson = contentListJson;
    this.translatedContentList = translatedContentList;
    this.layoutJson = layoutJson;

    // 將 base64 轉換為 Uint8Array
    const pdfData = this.base64ToUint8Array(pdfBase64);

    // 載入 PDF
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    this.pdfDoc = await loadingTask.promise;
    this.totalPages = this.pdfDoc.numPages;

    console.log(`[PDFCompareView] PDF 載入成功，共 ${this.totalPages} 頁`);

    // 從 layout.json 和 contentListJson 提取每頁的影象尺寸
    this.pageImageSizes = {};

    // 方法1: 從 contentListJson 分析每頁的 bbox 最大值（最可靠）
    if (contentListJson && Array.isArray(contentListJson)) {
      console.log('[PDFCompareView] 從 contentListJson 分析 bbox 範圍...');
      contentListJson.forEach(item => {
        if (item.bbox && item.page_idx !== undefined) {
          const pageIdx = item.page_idx;
          if (!this.pageImageSizes[pageIdx]) {
            this.pageImageSizes[pageIdx] = { width: 0, height: 0 };
          }
          // bbox: [x0, y0, x1, y1]
          this.pageImageSizes[pageIdx].width = Math.max(this.pageImageSizes[pageIdx].width, item.bbox[2]);
          this.pageImageSizes[pageIdx].height = Math.max(this.pageImageSizes[pageIdx].height, item.bbox[3]);
        }
      });

      console.log('[PDFCompareView] 從 contentListJson 推斷的頁面尺寸:', this.pageImageSizes);
    }

    // 方法2: 從 layout.json 獲取（作為補充）
    if (layoutJson) {
      console.log('[PDFCompareView] layout.json 型別:', typeof layoutJson);

      // 檢查是否是 { "pdf_info": [...] } 格式
      let pdfInfoArray = null;
      if (layoutJson.pdf_info && Array.isArray(layoutJson.pdf_info)) {
        pdfInfoArray = layoutJson.pdf_info;
        console.log('[PDFCompareView] 從 layoutJson.pdf_info 獲取資料，共', pdfInfoArray.length, '頁');
      } else if (Array.isArray(layoutJson)) {
        pdfInfoArray = layoutJson;
        console.log('[PDFCompareView] layoutJson 直接是陣列');
      }

      if (pdfInfoArray) {
        pdfInfoArray.forEach((pageData) => {
          const index = pageData.page_idx !== undefined ? pageData.page_idx : pdfInfoArray.indexOf(pageData);

          // 從 preproc_blocks 獲取 bbox 最大值
          if (pageData.preproc_blocks && Array.isArray(pageData.preproc_blocks)) {
            let maxX = 0, maxY = 0;
            pageData.preproc_blocks.forEach(block => {
              if (block.bbox) {
                maxX = Math.max(maxX, block.bbox[2]);
                maxY = Math.max(maxY, block.bbox[3]);
              }
            });
            if (maxX > 0 && maxY > 0) {
              // 如果從 preproc_blocks 得到的尺寸更大，使用它
              if (!this.pageImageSizes[index] || maxX > this.pageImageSizes[index].width) {
                this.pageImageSizes[index] = { width: maxX, height: maxY };
                console.log(`[PDFCompareView] 頁面 ${index} 從 preproc_blocks 獲取尺寸:`, this.pageImageSizes[index]);
              }
            }
          }
        });
      }
    }

    console.log('[PDFCompareView] 最終頁面影象尺寸:', this.pageImageSizes);
  }

  /**
   * Base64 轉 Uint8Array
   */
  base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * 渲染 HTML 結構
   */
  renderHTML() {
    return `
      <div class="pdf-compare-container" style="display: flex; height: 100vh; gap: 0; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #f5f5f5; z-index: 1000;">
        <!-- 左側：原文 PDF (50% 寬度) -->
        <div class="pdf-viewer-area pdf-original" style="flex: 1; border-right: 1px solid #e0e0e0; overflow: auto; background: #fff; position: relative; display: flex; flex-direction: column;">
          <div class="pdf-controls" style="height: 56px; background: #ffffff; padding: 0 24px; border-bottom: 1px solid #e0e0e0; z-index: 10; display: flex; gap: 12px; align-items: center; flex-shrink: 0;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <button id="pdf-prev-page" style="padding: 7px 14px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; color: #495057; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;" onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='#f8f9fa'">← 上一頁</button>
              <button id="pdf-next-page" style="padding: 7px 14px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; color: #495057; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;" onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='#f8f9fa'">下一頁 →</button>
            </div>
            <span id="pdf-page-info" style="color: #6c757d; font-size: 13px; font-weight: 500; padding: 0 8px;">第 1 頁 / 共 0 頁</span>
            <div style="flex: 1;"></div>
            <div style="display: flex; gap: 6px; align-items: center; background: #f8f9fa; padding: 4px; border-radius: 6px;">
              <button id="pdf-zoom-out" style="width: 32px; height: 32px; background: transparent; border: none; color: #495057; cursor: pointer; font-size: 18px; font-weight: 600; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='transparent'">−</button>
              <span id="pdf-zoom-level" style="color: #495057; font-size: 13px; font-weight: 500; min-width: 48px; text-align: center;">100%</span>
              <button id="pdf-zoom-in" style="width: 32px; height: 32px; background: transparent; border: none; color: #495057; cursor: pointer; font-size: 18px; font-weight: 600; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='transparent'">+</button>
            </div>
            <button id="pdf-exit-fullscreen" style="padding: 7px 16px; background: #dc3545; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s;" onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">退出對照</button>
          </div>
          <div class="pdf-scroll-area" id="pdf-original-scroll" style="flex: 1; overflow: auto; padding: 20px; position: relative; background: #f5f5f5;">
            <div id="pdf-original-segments" class="pdf-segments" style="position: relative; display: block;"></div>
          </div>
        </div>

        <!-- 右側：譯文 PDF (50% 寬度) -->
        <div class="pdf-viewer-area pdf-translation" style="flex: 1; overflow: auto; background: #fff; position: relative; display: flex; flex-direction: column;">
          <div class="pdf-controls" style="height: 56px; background: #ffffff; padding: 0 24px; border-bottom: 1px solid #e0e0e0; z-index: 10; display: flex; gap: 12px; align-items: center; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 6px 16px; background: #e8f5e9; border-radius: 20px;">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink: 0;"><path d="M3 5.5C3 4.67157 3.67157 4 4.5 4H11.5C12.3284 4 13 4.67157 13 5.5V12.5C13 13.3284 12.3284 14 11.5 14H4.5C3.67157 14 3 13.3284 3 12.5V5.5Z" stroke="#2e7d32" stroke-width="1.5"/><path d="M5 7H11M5 9.5H9" stroke="#2e7d32" stroke-width="1.5" stroke-linecap="round"/></svg>
              <span style="color: #2e7d32; font-size: 13px; font-weight: 600;">譯文對照</span>
            </div>
            <!-- 匯出按鈕（右對齊） -->
            <div style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
              <button id="pdf-export-structured-translation" style="padding: 7px 16px; background: #1976d2; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; transition: all 0.2s; box-shadow: 0 2px 4px rgba(25, 118, 210, 0.2);" onmouseover="this.style.background='#1565c0'; this.style.boxShadow='0 4px 8px rgba(25, 118, 210, 0.3)'" onmouseout="this.style.background='#1976d2'; this.style.boxShadow='0 2px 4px rgba(25, 118, 210, 0.2)'" title="匯出保留原格式的譯文PDF">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;"><path d="M12 15V3M12 15L7 10M12 15L17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19V17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <span>匯出譯文PDF</span>
              </button>
            </div>
          </div>
          <div class="pdf-scroll-area" id="pdf-translation-scroll" style="flex: 1; overflow: auto; padding: 20px; position: relative; background: #f5f5f5;">
            <div id="pdf-translation-segments" class="pdf-segments" style="position: relative; display: block;"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染頁面並綁定事件
   */
  async render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[PDFCompareView] 容器不存在:', containerId);
      return;
    }

    container.innerHTML = this.renderHTML();

    // 隱藏所有浮動圖示，只保留 chatbot
    this.hideFloatingIcons();

    // 段容器（左右）
    this.originalScroll = document.getElementById('pdf-original-scroll');
    this.translationScroll = document.getElementById('pdf-translation-scroll');
    this.originalSegmentsContainer = document.getElementById('pdf-original-segments');
    this.translationSegmentsContainer = document.getElementById('pdf-translation-segments');

    // 段列表
    this.segments = []; // 每段包含左右兩側 canvas/overlay 與段內頁列表

    // 渲染所有頁面（連續滾動模式）
    await this.renderAllPagesContinuous();

    // 綁定事件
    this.bindEvents();

    // 綁定滾動聯動
    this.bindScrollSync();

    // 綁定 bbox 點選事件
    this.bindBboxClick();
  }

  /**
   * 連續滾動模式：懶載入渲染所有頁面到一個長畫布
   */
  async renderAllPagesContinuous() {
    this.mode = 'continuous';

    // 優先使用新模組
    if (typeof SegmentManager !== 'undefined') {
      // 初始化 SegmentManager
      this.segmentManager = new SegmentManager(this.pdfDoc, {
        maxSegmentPixels: this.dpr >= 2 ? 4096 : 8192,
        bufferRatio: 0.5,
        scrollDebounceMs: 80,
        bboxNormalizedRange: 1000
      });

      // 設定容器
      this.segmentManager.setContainers(
        this.originalSegmentsContainer,
        this.translationSegmentsContainer,
        document.getElementById('pdf-original-scroll'),
        document.getElementById('pdf-translation-scroll')
      );

      // 設定依賴注入
      this.segmentManager.setDependencies({
        renderPageBboxesToCtx: this.renderPageBboxesToCtx.bind(this),
        renderPageTranslationToCtx: this.renderPageTranslationToCtx.bind(this),
        clearTextInBbox: this.clearTextInBbox.bind(this),
        clearFormulaElementsForPageInWrapper: this.clearFormulaElementsForPageInWrapper.bind(this),
        onOverlayClick: this.onSegmentOverlayClick.bind(this),
        contentListJson: this.contentListJson
      });

      // 執行渲染
      await this.segmentManager.renderAllPagesContinuous();

      // 同步屬性（相容性）
      this.pageInfos = this.segmentManager.pageInfos;
      this.scale = this.segmentManager.scale;
      this.segments = this.segmentManager.segments;

      // 更新UI
      document.getElementById('pdf-page-info').textContent = `共 ${this.totalPages} 頁`;
      document.getElementById('pdf-zoom-level').textContent = `${Math.round(this.scale * 100)}%`;

      return;
    }

    // 回退：使用原有實現
    // 計算自適應縮放
    const firstPage = await this.pdfDoc.getPage(1);
    const originalViewport = firstPage.getViewport({ scale: 1.0 });
    const containerWidth = document.getElementById('pdf-original-scroll').clientWidth - 40;
    this.scale = Math.min(containerWidth / originalViewport.width, 1.5);

    const dpr = this.dpr;
    console.log(`[PDF連續模式] DPR=${dpr}, scale=${this.scale}`);

    // 計算所有頁面尺寸（物理畫素）並分段
    this.pageInfos = [];
    let totalHeight = 0;
    for (let i = 1; i <= this.totalPages; i++) {
      const page = await this.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: this.scale * dpr });
      const info = { pageNum: i, page, viewport, yOffset: totalHeight, width: viewport.width, height: viewport.height };
      this.pageInfos.push(info);
      totalHeight += viewport.height;
    }

    // 清空舊段容器
    this.originalSegmentsContainer.innerHTML = '';
    this.translationSegmentsContainer.innerHTML = '';
    this.segments = [];

    const MAX_SEG_PX = (dpr >= 2 ? 4096 : 8192);
    const canvasWidth = this.pageInfos.length > 0 ? this.pageInfos[0].width : Math.round(originalViewport.width * this.scale * dpr);
    let currentSeg = null;
    let currentSegHeight = 0;
    let currentSegTop = 0;

    const startNewSegment = () => {
      const segIndex = this.segments.length;
      if (currentSeg) currentSegTop += currentSegHeight;
      currentSegHeight = 0;
      const seg = {
        index: segIndex,
        topPx: currentSegTop,
        heightPx: 0,
        widthPx: canvasWidth,
        pages: [], // { pageNum, page, viewport, yInSegPx, width, height }
        left: null,
        right: null,
        rendered: false,
        rendering: false,
        textCleared: false, // 標記是否已清除文字（避免重複清除）
      };
      this.segments.push(seg);
      currentSeg = seg;
    };

    startNewSegment();
    for (const p of this.pageInfos) {
      if (currentSegHeight > 0 && (currentSegHeight + p.height) > MAX_SEG_PX) {
        currentSeg.heightPx = currentSegHeight;
        startNewSegment();
      }
      const yInSeg = currentSegHeight;
      currentSeg.pages.push({ pageNum: p.pageNum, page: p.page, viewport: p.viewport, yInSegPx: yInSeg, width: p.width, height: p.height });
      currentSegHeight += p.height;
    }
    if (currentSeg) currentSeg.heightPx = currentSegHeight;

    // 建立段 DOM
    for (const seg of this.segments) {
      this.createSegmentDom(seg, dpr);
    }

    // 初始化懶載入（按段）
    this.initLazyLoadingSegments();

    document.getElementById('pdf-page-info').textContent = `共 ${this.totalPages} 頁`;
    document.getElementById('pdf-zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
  }

  /**
   * 建立一個段的左右 DOM 和上下文
   */
  createSegmentDom(seg, dpr) {
    const cssWidth = seg.widthPx / dpr;
    const cssHeight = seg.heightPx / dpr;

    const buildSide = (container, side) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-segment-wrapper';
      wrapper.style.position = 'relative';
      wrapper.style.display = 'block';
      wrapper.style.width = cssWidth + 'px';
      wrapper.style.height = cssHeight + 'px';
      wrapper.style.margin = '0';

      const canvas = document.createElement('canvas');
      canvas.width = seg.widthPx;
      canvas.height = seg.heightPx;
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = cssHeight + 'px';
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      const overlay = document.createElement('canvas');
      overlay.width = seg.widthPx;
      overlay.height = seg.heightPx;
      overlay.style.width = cssWidth + 'px';
      overlay.style.height = cssHeight + 'px';
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.top = '0';
      const overlayCtx = overlay.getContext('2d', { willReadFrequently: true });

      wrapper.appendChild(canvas);
      wrapper.appendChild(overlay);
      container.appendChild(wrapper);

      const sideObj = { wrapper, canvas, ctx, overlay, overlayCtx };
      if (side === 'left') seg.left = sideObj; else seg.right = sideObj;

      if (side === 'left') {
        overlay.addEventListener('click', (e) => this.onSegmentOverlayClick(e, seg));
      }
    };

    buildSide(this.originalSegmentsContainer, 'left');
    buildSide(this.translationSegmentsContainer, 'right');
  }

  /**
   * 初始化懶載入：監聽滾動，渲染可見區域
   */
  initLazyLoadingSegments() {
    this.originalScroll = document.getElementById('pdf-original-scroll');
    this.translationScroll = document.getElementById('pdf-translation-scroll');
    if (!this.originalScroll || !this.translationScroll) return;

    // 初始渲染可見段
    this.renderVisibleSegments(this.originalScroll);

    const onScroll = (scroller) => {
      clearTimeout(this._lazyScrollTimer);
      this._lazyScrollTimer = setTimeout(() => {
        this.renderVisibleSegments(scroller);
      }, 80);
    };

    if (!this._lazyInitialized) {
      this.originalScroll.addEventListener('scroll', () => onScroll(this.originalScroll));
      this.translationScroll.addEventListener('scroll', () => onScroll(this.translationScroll));
      this._lazyInitialized = true;
    }
  }

  /**
   * 渲染當前可見的頁面（視口+緩衝區）
   */
  async renderVisibleSegments(container) {
    if (!this.segments || this.segments.length === 0 || !container) return;
    if (this._renderingVisible) { this._pendingVisibleRender = true; return; }
    this._renderingVisible = true;

    const dpr = this.dpr;
    const scrollTopCss = container.scrollTop;
    const viewportHeightCss = container.clientHeight;
    const bufferCss = viewportHeightCss * 0.5;
    const visibleStartPx = Math.max(0, (scrollTopCss - bufferCss) * dpr);
    const visibleEndPx = (scrollTopCss + viewportHeightCss + bufferCss) * dpr;

    for (const seg of this.segments) {
      const segStart = seg.topPx;
      const segEnd = seg.topPx + seg.heightPx;
      const isVisible = segEnd >= visibleStartPx && segStart <= visibleEndPx;
      // 關鍵：只要進入可見區且不在渲染中，就再次渲染該段
      if (isVisible && !seg.rendering) {
        try {
          seg.rendering = true;
          await this.renderSegment(seg);
          seg.rendered = true;
        } finally {
          seg.rendering = false;
        }
      }
    }

    this._renderingVisible = false;
    if (this._pendingVisibleRender) {
      this._pendingVisibleRender = false;
      this.renderVisibleSegments(container);
    }
  }

  /**
   * 在連續模式下渲染單個頁面
   */
  async renderSegment(seg) {
    // 逐頁渲染：先渲染到離屏小畫布，再繪製到段畫布，避免 pdf.js 在目標大畫布上可能的清除行為
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d', { willReadFrequently: true, alpha: false });
    for (const p of seg.pages) {
      if (off.width !== p.width) off.width = p.width;
      if (off.height !== p.height) off.height = p.height;
      // 清理離屏
      offCtx.clearRect(0, 0, off.width, off.height);
      await p.page.render({ canvasContext: offCtx, viewport: p.viewport }).promise;
      // 繪製到左右段 base 畫布
      seg.left.ctx.drawImage(off, 0, p.yInSegPx);
      seg.right.ctx.drawImage(off, 0, p.yInSegPx);
    }

    // 繪製 overlays（僅本段）
    // 注意：白色背景和翻譯文字都在 overlay 層繪製，不會被 PDF 覆蓋
    await this.renderSegmentOverlays(seg);
  }

  /**
   * 清除段內所有 bbox 的原始文字（在 base canvas 上操作）
   */
  async clearTextInSegment(seg) {
    const pageItems = this.contentListJson.filter(item => item.type === 'text');
    const BBOX_NORMALIZED_RANGE = 1000;

    for (const p of seg.pages) {
      const pageNum = p.pageNum;
      const scaleX = p.width / BBOX_NORMALIZED_RANGE;
      const scaleY = p.height / BBOX_NORMALIZED_RANGE;

      // 獲取當前頁的所有 bbox
      const currentPageItems = pageItems.filter(item => item.page_idx === pageNum - 1);

      for (const item of currentPageItems) {
        if (!item.bbox) continue;

        const bb = item.bbox;
        const x = bb[0] * scaleX;
        const y = bb[1] * scaleY + p.yInSegPx;
        const w = (bb[2] - bb[0]) * scaleX;
        const h = (bb[3] - bb[1]) * scaleY;

        // 在右側 base canvas 上精確清除文字
        await this.clearTextInBbox(seg.right.ctx, pageNum, { x, y, w, h }, p.yInSegPx);
      }
    }
  }

  async renderSegmentOverlays(seg) {
    const leftCtx = seg.left.overlayCtx;
    const rightCtx = seg.right.overlayCtx;
    // 清理段 overlay
    leftCtx.clearRect(0, 0, seg.widthPx, seg.heightPx);
    rightCtx.clearRect(0, 0, seg.widthPx, seg.heightPx);
    // 清理該段所有頁的公式 DOM
    for (const p of seg.pages) {
      this.clearFormulaElementsForPageInWrapper(p.pageNum, seg.right.wrapper);
    }

    // 繪製 overlays（序列執行以確保文字層正確清除）
    for (const p of seg.pages) {
      this.renderPageBboxesToCtx(leftCtx, p.pageNum, p.yInSegPx, p.width, p.height);
      await this.renderPageTranslationToCtx(rightCtx, seg.right.wrapper, p.pageNum, p.yInSegPx, p.width, p.height);
    }
  }

  /**
   * 將渲染任務加入到指定畫布的序列佇列，防止 PDF.js 並行渲染報錯
   */
  enqueueCanvasRender(target, taskFactory) {
    const key = target === 'original' ? '_renderQueueOriginal' : '_renderQueueTranslation';
    const chain = this[key].then(() => taskFactory()).catch(err => {
      console.warn('[PDFCompareView] render task failed:', err);
    });
    // 確保後續任務接在本次後面
    this[key] = chain.then(() => undefined);
    return chain;
  }

  /**
   * 渲染單頁的bbox
   */
  renderPageBboxes(pageNum, yOffset, pageWidth, pageHeight) {
    const pageItems = this.contentListJson.filter(item => item.page_idx === pageNum - 1 && item.type === 'text');

    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
    const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

    const ctx = this.originalOverlayContext;
    pageItems.forEach(item => {
      if (!item.bbox) return;
      const bbox = item.bbox;
      const x = bbox[0] * scaleX;
      const y = bbox[1] * scaleY + yOffset;
      const w = (bbox[2] - bbox[0]) * scaleX;
      const h = (bbox[3] - bbox[1]) * scaleY;

      ctx.strokeStyle = 'rgb(153, 0, 76)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1.0;
    });
  }

  /**
   * 渲染單頁的翻譯
   */
  renderPageTranslation(pageNum, yOffset, pageWidth, pageHeight) {
    const pageItems = this.contentListJson.filter(item => item.page_idx === pageNum - 1 && item.type === 'text');

    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
    const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

    const ctx = this.translationOverlayContext;
    // 清理該頁區域上的歷史繪製與公式 DOM
    ctx.clearRect(0, yOffset, pageWidth, pageHeight);
    this.clearFormulaElementsForPage(pageNum);

    pageItems.forEach((item, idx) => {
      const originalIdx = this.contentListJson.indexOf(item);
      const translatedItem = this.translatedContentList[originalIdx];
      if (!translatedItem || !item.bbox) return;

      const bbox = item.bbox;
      const x = bbox[0] * scaleX;
      const y = bbox[1] * scaleY + yOffset;
      const w = (bbox[2] - bbox[0]) * scaleX;
      const h = (bbox[3] - bbox[1]) * scaleY;

      // 直接使用原始 bbox（文字自適應引擎會自動處理）
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(x, y, w, h);

      this.drawTextInBox(ctx, translatedItem.text, x, y, w, h, pageNum);
    });
  }

  // 分段：將 bbox 繪製到指定 ctx
  renderPageBboxesToCtx(ctx, pageNum, yOffset, pageWidth, pageHeight) {
    const pageItems = this.contentListJson.filter(item => item.page_idx === pageNum - 1 && item.type === 'text');
    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
    const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;
    pageItems.forEach(item => {
      if (!item.bbox) return;
      const b = item.bbox;
      const x = b[0] * scaleX;
      const y = b[1] * scaleY + yOffset;
      const w = (b[2] - b[0]) * scaleX;
      const h = (b[3] - b[1]) * scaleY;
      ctx.strokeStyle = 'rgb(153, 0, 76)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1.0;
    });
  }

  // 分段：將譯文繪製到指定 ctx，並將公式 DOM 插入到 wrapper
  async renderPageTranslationToCtx(ctx, wrapperEl, pageNum, yOffset, pageWidth, pageHeight) {
    // 確保已經完成預處理
    if (!this.hasPreprocessed) {
      this.preprocessGlobalFontSizes();
    }

    const pageItems = this.contentListJson.filter(item => item.page_idx === pageNum - 1 && item.type === 'text');
    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
    const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

    // 第一步：在 overlay 層繪製白色背景（覆蓋原始文字）
    pageItems.forEach((item) => {
      if (!item.bbox) return;

      const bb = item.bbox;
      const x = bb[0] * scaleX;
      const y = bb[1] * scaleY + yOffset;
      const w = (bb[2] - bb[0]) * scaleX;
      const h = (bb[3] - bb[1]) * scaleY;

      // 向上下擴充白色背景（覆蓋更多原始文字）
      const verticalExpansion = h * 0.15; // 向上下各擴充 15%（配合溢位策略）
      const expandedY = y - verticalExpansion;
      const expandedH = h + verticalExpansion * 2;

      // 在 overlay 層繪製擴充後的白色背景（不透明，遮擋下層的原始文字）
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.fillRect(x, expandedY, w, expandedH);
    });

    // 第二步：繪製翻譯文字（在白色背景上）
    pageItems.forEach((item) => {
      const originalIdx = this.contentListJson.indexOf(item);
      const translatedItem = this.translatedContentList[originalIdx];
      if (!translatedItem || !item.bbox) return;

      const bb = item.bbox;
      const x = bb[0] * scaleX;
      const y = bb[1] * scaleY + yOffset;
      const w = (bb[2] - bb[0]) * scaleX;
      const h = (bb[3] - bb[1]) * scaleY;

      // 使用預處理的字號資訊
      const cachedInfo = this.globalFontSizeCache.get(originalIdx);

      // 使用新的文字自適應引擎渲染
      this.drawTextInBox(ctx, translatedItem.text, x, y, w, h, pageNum, wrapperEl, cachedInfo);
    });
  }

  /**
   * 渲染指定頁面（雙PDF）
   */
  async renderPage(pageNum) {
    if (!this.pdfDoc) return;

    this.currentPage = pageNum;
    const page = await this.pdfDoc.getPage(pageNum);

    // 計算自適應縮放比例
    const originalViewport = page.getViewport({ scale: 1.0 });
    const containerWidth = document.getElementById('pdf-original-scroll').clientWidth - 40; // 減去 padding
    const autoScale = containerWidth / originalViewport.width;

    // 如果是第一次渲染，使用自適應縮放
    if (this.scale === 1.0 && pageNum === 1) {
      this.scale = Math.min(autoScale, 1.5); // 最大不超過 150%
    }

    console.log(`[PDFCompareView] 自適應縮放計算: containerWidth=${containerWidth}, pdfWidth=${originalViewport.width}, autoScale=${autoScale}, 最終scale=${this.scale}`);

    // 考慮裝置畫素比，提高畫質晰度
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: this.scale * dpr });

    // 儲存頁面的原始尺寸（未縮放）用於 bbox 座標轉換
    this.currentPageOriginalWidth = originalViewport.width;
    this.currentPageOriginalHeight = originalViewport.height;

    // 設定原文 canvas 尺寸（物理畫素）
    this.originalCanvas.width = viewport.width;
    this.originalCanvas.height = viewport.height;
    this.originalOverlay.width = viewport.width;
    this.originalOverlay.height = viewport.height;

    // 設定 CSS 尺寸（邏輯畫素）
    this.originalCanvas.style.width = viewport.width / dpr + 'px';
    this.originalCanvas.style.height = viewport.height / dpr + 'px';
    this.originalOverlay.style.width = viewport.width / dpr + 'px';
    this.originalOverlay.style.height = viewport.height / dpr + 'px';

    // 設定譯文 canvas 尺寸（物理畫素）
    this.translationCanvas.width = viewport.width;
    this.translationCanvas.height = viewport.height;
    this.translationOverlay.width = viewport.width;
    this.translationOverlay.height = viewport.height;

    // 設定 CSS 尺寸（邏輯畫素）
    this.translationCanvas.style.width = viewport.width / dpr + 'px';
    this.translationCanvas.style.height = viewport.height / dpr + 'px';
    this.translationOverlay.style.width = viewport.width / dpr + 'px';
    this.translationOverlay.style.height = viewport.height / dpr + 'px';

    console.log(`[PDFCompareView] Canvas 尺寸設定: 物理=${viewport.width}x${viewport.height}, CSS=${viewport.width/dpr}x${viewport.height/dpr}, DPR=${dpr}`);

    // 渲染原文 PDF 頁面
    const renderContext = {
      canvasContext: this.originalContext,
      viewport: viewport
    };
    await page.render(renderContext).promise;

    // 渲染譯文 PDF 頁面（先複製原文）
    const translationRenderContext = {
      canvasContext: this.translationContext,
      viewport: viewport
    };
    await page.render(translationRenderContext).promise;

    // 更新頁碼顯示
    document.getElementById('pdf-page-info').textContent = `第 ${pageNum} 頁 / 共 ${this.totalPages} 頁`;

    console.log(`[PDFCompareView] 頁面 ${pageNum} 渲染完成，原始尺寸: ${this.currentPageOriginalWidth} x ${this.currentPageOriginalHeight}, 縮放後: ${viewport.width} x ${viewport.height}`);

    // 在譯文 PDF 上渲染翻譯文字
    this.renderTranslationOverlay(pageNum);

    // 繪製所有 bbox（可見性啟用）
    this.renderAllBboxes(pageNum);
  }

  /**
   * 渲染翻譯內容列表（已廢棄，改為雙 PDF 模式）
   */
  renderTranslationList() {
    // 雙 PDF 模式下不再需要翻譯列表
  }

  /**
   * 選中翻譯項，醒目提示對應 PDF 區域（已廢棄）
   */
  selectTranslationItem(index) {
    // 雙 PDF 模式下不再需要
  }

  /**
   * 在 PDF 上醒目提示 bbox 區域（保留用於相容）
   */
  highlightBboxOnPDF(index) {
    // 雙 PDF 模式下已廢棄此功能
  }

  /**
   * 渲染譯文 PDF 上的翻譯文字覆蓋層
   */
  renderTranslationOverlay(pageNum) {
    const currentPageIndex = pageNum - 1;
    const ctx = this.translationOverlayContext;

    console.log('[renderTranslationOverlay] 開始渲染翻譯層，頁碼:', pageNum);

    // 清空overlay
    ctx.clearRect(0, 0, this.translationOverlay.width, this.translationOverlay.height);

    // 僅清理該頁的公式 DOM 元素
    this.clearFormulaElementsForPage(pageNum);

    // 獲取當前頁的所有內容塊（只處理文字型別）
    const pageItems = this.contentListJson.filter(item =>
      item.page_idx === currentPageIndex && item.type === 'text'
    );

    console.log('[renderTranslationOverlay] 當前頁文字塊數量:', pageItems.length);

    const BBOX_NORMALIZED_RANGE = 1000;
    // 使用物理畫素尺寸進行計算
    const scaleX = this.translationOverlay.width / BBOX_NORMALIZED_RANGE;
    const scaleY = this.translationOverlay.height / BBOX_NORMALIZED_RANGE;

    // 轉換所有 bbox 到 canvas 座標，用於碰撞檢測
    const canvasBboxes = pageItems.map(item => {
      const bbox = item.bbox;
      return {
        x: bbox[0] * scaleX,
        y: bbox[1] * scaleY,
        w: (bbox[2] - bbox[0]) * scaleX,
        h: (bbox[3] - bbox[1]) * scaleY,
        originalItem: item
      };
    });

    // 記錄已繪製的文字塊（用於自適應碰撞檢測）
    const drawnTextBoxes = [];

    // 繪製每個文字 bbox 的背景色和翻譯文字
    pageItems.forEach((item, idx) => {
      const originalIdx = this.contentListJson.indexOf(item);
      const translatedItem = this.translatedContentList[originalIdx];

      if (!translatedItem || !item.bbox) return;

      const bbox = item.bbox;
      const x = bbox[0] * scaleX;
      const y = bbox[1] * scaleY;
      const w = (bbox[2] - bbox[0]) * scaleX;
      const h = (bbox[3] - bbox[1]) * scaleY;

      // 智慧擴充 bbox（針對小標題和短段落特殊處理）
      const text = translatedItem.text || '';
      const isShortText = text.length < 30; // 短文字（可能是標題，增加到30字元）
      const isVerySmallBox = w < 200 || h < 40; // 較小的 bbox（增加閾值）

      const expandedBox = this.expandBboxIfPossible(
        { x, y, w, h },
        canvasBboxes,
        idx,
        this.translationOverlay.width,
        this.translationOverlay.height,
        isShortText || isVerySmallBox // 傳遞標記，允許更大擴充
      );

      // 繪製白色/米色背景（覆蓋原文）
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(expandedBox.x, expandedBox.y, expandedBox.w, expandedBox.h);

      // 自適應繪製文字（檢測並避免與已繪製文字塊重疊）
      const actualBox = this.drawTextInBoxAdaptive(
        ctx,
        text,
        expandedBox.x,
        expandedBox.y,
        expandedBox.w,
        expandedBox.h,
        pageNum,
        drawnTextBoxes, // 傳入已繪製的文字塊
        isShortText
      );

      // 記錄已繪製的區域
      if (actualBox) {
        drawnTextBoxes.push(actualBox);
      }
    });

    console.log('[renderTranslationOverlay] 翻譯層渲染完成');
  }

  /**
   * 智慧擴充 bbox 區域（不與其他文字衝突）
   * 針對小標題和短段落特殊處理，允許更大擴充
   */
  expandBboxIfPossible(currentBox, allBboxes, currentIndex, canvasWidth, canvasHeight, allowLargeExpansion = false) {
    const { x, y, w, h } = currentBox;

    // 檢測四個方向的可用空間
    const availableSpace = {
      top: y,
      bottom: canvasHeight - (y + h),
      left: x,
      right: canvasWidth - (x + w)
    };

    const expansions = [];

    if (allowLargeExpansion) {
      // 小標題或短段落：允許大幅擴充，儘量一行顯示
      // 優先向右擴充（橫向擴充）
      const maxRightExpand = Math.min(availableSpace.right, canvasWidth * 0.5 - w); // 增加到50%
      for (let dw of [50, 100, 150, 200, 250, 300, 350, 400]) { // 增加更多擴充選項
        if (dw <= maxRightExpand) {
          expansions.push({ x, y, w: w + dw, h });
          // 也可以同時向下擴充一點
          expansions.push({ x, y, w: w + dw, h: h + 20 }); // 增加到20px
          expansions.push({ x, y, w: w + dw, h: h + 30 }); // 增加到30px
        }
      }

      // 也嘗試向下擴充
      for (let dh of [20, 30, 40, 50, 60]) { // 增加更多選項
        if (dh <= availableSpace.bottom) {
          expansions.push({ x, y, w, h: h + dh });
        }
      }

      // 嘗試雙向擴充
      const dw = Math.min(150, maxRightExpand); // 增加到150
      const dh = Math.min(30, availableSpace.bottom); // 增加到30
      if (dw > 0 && dh > 0) {
        expansions.push({ x, y, w: w + dw, h: h + dh });
      }
    } else {
      // 常規段落（多行）：嚴格保持在 bbox 內，不擴充
      // 只使用原始 bbox
      expansions.push({ x, y, w, h });
    }

    // 始終包含原始 bbox 作為後備選項
    if (expansions.length === 0) {
      expansions.push({ x, y, w, h });
    }

    // 找到最大的不衝突擴充
    let bestExpansion = { x, y, w, h };
    let maxArea = w * h;

    for (let expanded of expansions) {
      // 檢查是否與其他 bbox 衝突（增加邊距檢查，防止貼得太近）
      let hasCollision = false;
      const margin = allowLargeExpansion ? 5 : 2; // 小標題需要更大邊距

      for (let i = 0; i < allBboxes.length; i++) {
        if (i === currentIndex) continue;

        const other = allBboxes[i];
        // 新增邊距檢查
        const expandedWithMargin = {
          x: expanded.x - margin,
          y: expanded.y - margin,
          w: expanded.w + margin * 2,
          h: expanded.h + margin * 2
        };

        if (this.checkBboxCollision(expandedWithMargin, other)) {
          hasCollision = true;
          break;
        }
      }

      const area = expanded.w * expanded.h;
      if (!hasCollision && area > maxArea) {
        bestExpansion = expanded;
        maxArea = area;
      }
    }

    return bestExpansion;
  }

  /**
   * 檢查兩個矩形是否碰撞
   */
  checkBboxCollision(box1, box2) {
    return !(
      box1.x + box1.w < box2.x ||  // box1 在 box2 左邊
      box1.x > box2.x + box2.w ||  // box1 在 box2 右邊
      box1.y + box1.h < box2.y ||  // box1 在 box2 上邊
      box1.y > box2.y + box2.h     // box1 在 box2 下邊
    );
  }

  /**
   * 自適應繪製文字（檢測並避免與已繪製文字塊重疊）
   * @returns {Object|null} 返回實際繪製的區域 { x, y, w, h }
   */
  drawTextInBoxAdaptive(ctx, text, x, y, width, height, pageNum, drawnTextBoxes, isShortText) {
    if (!text) return null;

    // 檢查是否包含公式
    const hasBlockFormula = /\$\$[\s\S]+?\$\$/.test(text);
    const hasInlineFormula = /\$[^$]*[\\^_{}a-zA-Z][\s\S]*?\$/.test(text);
    const hasFormula = hasBlockFormula || hasInlineFormula;

    // 暫時禁用公式渲染（用於測試）
    if (false && hasFormula) {
      // 根據 bbox 高度和已繪製文字自適應選擇字號
      const heightCss = height / this.dpr;
      let bestFormulaFontSize;

      // 字號候選列表（從大到小）
      const fontSizeCandidates = isShortText
        ? [18, 16, 14, 12, 10, 8, 6]
        : [13, 11, 10, 9, 8, 7, 6, 5, 4];

      for (let fs of fontSizeCandidates) {
        const lineHeight = 1.5;
        const estimatedHeight = fs * lineHeight * 2.2; // 公式可能佔2-3行高度

        if (estimatedHeight <= heightCss) {
          // 檢查是否與已繪製文字重疊
          const testBox = { x, y, w: width, h: estimatedHeight * this.dpr };
          let hasCollision = false;

          for (const drawn of drawnTextBoxes) {
            if (this.checkBboxCollision(testBox, drawn)) {
              hasCollision = true;
              break;
            }
          }

          if (!hasCollision) {
            bestFormulaFontSize = fs;
            break;
          }
        }
      }

      // 如果都不行，使用最小字號
      if (!bestFormulaFontSize) {
        bestFormulaFontSize = isShortText ? 6 : 4;
      }

      this.drawTextWithFormulaInBoxAdaptive(text, x, y, width, height, pageNum, null, isShortText, bestFormulaFontSize);

      // 返回保守的高度估計（公式可能佔用更多空間）
      const actualHeight = Math.min(height, bestFormulaFontSize * 1.5 * 2.2 * this.dpr);
      return { x, y, w: width, h: actualHeight };
    }

    // 純文字：嘗試不同字號，找到最大的不重疊字號
    const maxFontSize = isShortText ? Math.max(width / 10, height / 3, 18) : Math.min(width / 10, height / 3);
    const minFontSize = 3; // 允許縮到 3px（除了單行小標題）

    let bestFontSize = minFontSize;
    let bestLines = [];
    let bestActualHeight = 0;

    // 從大到小嚐試字號
    for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 0.5) {
      ctx.font = `${fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const lines = this.wrapText(ctx, text, width - 4);
      const lineHeight = fontSize * 1.5; // 行間距 1.5

      // 正確計算總高度：前 n-1 行用 lineHeight，最後一行用 fontSize + 下方空間
      const actualHeight = lines.length > 1
        ? (lines.length - 1) * lineHeight + fontSize * 1.3 + 8 // 最後一行留足空間 + 上下邊距
        : fontSize * 1.3 + 8; // 單行也留足空間

      // 檢查1：是否在 bbox 內
      if (actualHeight > height) {
        continue; // 超出 bbox，嘗試更小字號
      }

      // 檢查2：是否與已繪製的文字塊重疊
      const textBox = { x, y, w: width, h: actualHeight };
      let hasCollision = false;

      for (const drawn of drawnTextBoxes) {
        if (this.checkBboxCollision(textBox, drawn)) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        // 找到了不重疊的字號
        bestFontSize = fontSize;
        bestLines = lines;
        bestActualHeight = actualHeight;
        break;
      }
    }

    // 如果所有字號都重疊，繼續降低字號直到 3px（強制繪製）
    if (bestLines.length === 0) {
      bestFontSize = 3;
      ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      bestLines = this.wrapText(ctx, text, width - 4);
      const lineHeight = bestFontSize * 1.5;

      // 正確計算總高度
      const totalHeight = bestLines.length > 1
        ? (bestLines.length - 1) * lineHeight + bestFontSize * 1.3 + 8
        : bestFontSize * 1.3 + 8;

      // 如果還是放不下，裁剪行數
      if (totalHeight > height) {
        const availableHeight = height - 8;
        const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
        bestLines = bestLines.slice(0, maxLines);
        bestActualHeight = bestLines.length * lineHeight + 8;
      } else {
        bestActualHeight = totalHeight;
      }
    }

    // 單行小標題最小字號限制（僅限單行）
    if (isShortText && bestLines.length === 1 && bestFontSize < 14) {
      bestFontSize = 14;
      ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      bestLines = this.wrapText(ctx, text, width - 4);
      bestActualHeight = bestFontSize * 1.3 + 8;
    }

    // 繪製文字
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    const lineHeight = bestFontSize * 1.5; // 行間距 1.5

    bestLines.forEach((line, i) => {
      const lineY = y + 4 + i * lineHeight; // 上邊距 4px
      ctx.fillText(line, x + 2, lineY);
    });

    // 返回實際繪製的區域
    return { x, y, w: width, h: bestActualHeight };
  }

  /**
   * 在指定區域內繪製自適應大小的文字
   */
  drawTextInBox(ctx, text, x, y, width, height, pageNum = null, wrapperEl = null, cachedInfo = null) {
    if (!text) return;

    // 檢查是否為短文字/小標題（與 bbox 擴充判斷保持一致）
    const isShortText = text.length < 30;

    // 檢查是否包含公式（更嚴格的檢測）
    // 1. $$ 包圍的塊公式
    // 2. $ 包圍且包含數學符號的行內公式（不是簡單的 $數字$）
    const hasBlockFormula = /\$\$[\s\S]+?\$\$/.test(text);
    const hasInlineFormula = /\$[^$]*[\\^_{}a-zA-Z][\s\S]*?\$/.test(text); // 必須包含 \、^、_、{、}、字母等數學符號
    const hasFormula = hasBlockFormula || hasInlineFormula;

    if (hasFormula && wrapperEl) {
      // 包含公式，使用 HTML 渲染（透過模組或回退方案）
      this.drawTextWithFormulaInBox(text, x, y, width, height, pageNum, wrapperEl, isShortText, cachedInfo);
    } else {
      // 純文字，使用 Canvas 渲染
      this.drawPlainTextInBox(ctx, text, x, y, width, height, isShortText, cachedInfo);
    }
  }

  /**
   * 繪製純文字（Canvas）
   * @param {boolean} isShortText - 是否為短文字/小標題（會使用更大的最小字號）
   * @param {Object} cachedInfo - 預處理的字號資訊（可選）
   */
  drawPlainTextInBox(ctx, text, x, y, width, height, isShortText = false, cachedInfo = null) {
    // 直接使用新的文字自適應引擎
    if (this.textFittingEngine) {
      const suggestedFontSize = cachedInfo ? cachedInfo.estimatedFontSize : null;
      return this.drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText, suggestedFontSize);
    }

    // 回退方案：如果引擎未初始化（不應該發生）
    let bestFontSize = 8;
    let bestLines = [];

    // 從較大字號開始嘗試，允許多行顯示
    // 多行文字使用更保守的最大字號
    let maxFontSize = Math.min(width / 10, height / 3); // 調小，從 width/8, height/2.5 改為 width/10, height/3

    // 小標題優先使用更大的字號
    if (isShortText) {
      maxFontSize = Math.max(maxFontSize, 18); // 小標題至少嘗試 18px（提高可讀性）
    }

    // 先嚐試找到能完整放下所有文字的最大字號（從大到小）
    let foundPerfectFit = false;
    for (let fontSize = maxFontSize; fontSize >= 3; fontSize -= 0.5) { // 降到 3px
      ctx.font = `${fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const lines = this.wrapText(ctx, text, width - 4);
      const lineHeight = fontSize * 1.5; // 行間距 1.5

      // 正確計算總高度：前 n-1 行用 lineHeight，最後一行用 fontSize + 下方空間
      const totalHeight = lines.length > 1
        ? (lines.length - 1) * lineHeight + fontSize * 1.3 + 8 // 最後一行留足空間 + 邊距
        : fontSize * 1.3 + 8; // 單行也留足空間

      // 確保所有行都能完整顯示（含行高）+ 額外留出緩衝空間
      if (totalHeight <= height) { // 直接比較，不再減去緩衝（已包含在計算中）
        bestFontSize = fontSize;
        bestLines = lines;
        foundPerfectFit = true;
        break;
      }
    }

    // 如果仍然找不到（極端情況），使用3px並裁剪行數
    if (!foundPerfectFit) {
      bestFontSize = 3;
      ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const allLines = this.wrapText(ctx, text, width - 4);
      const lineHeight = bestFontSize * 1.5;

      // 正確計算總高度
      const totalHeight = allLines.length > 1
        ? (allLines.length - 1) * lineHeight + bestFontSize * 1.3 + 8
        : bestFontSize * 1.3 + 8;

      // 如果還是放不下，裁剪行數
      if (totalHeight > height) {
        const availableHeight = height - 8;
        const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
        bestLines = allLines.slice(0, maxLines);
      } else {
        bestLines = allLines;
      }
    }

    // 應用小標題的最小字號限制（僅限單行情況）
    if (isShortText && bestLines.length === 1 && bestFontSize < 14) {
      // 單行小標題：強制使用至少 14px
      bestFontSize = 14;
      ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      bestLines = this.wrapText(ctx, text, width - 4);
    }

    // 繪製文字（確保不超出 bbox 高度）
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;

    const lineHeight = bestFontSize * 1.5; // 行間距 1.5

    bestLines.forEach((line, i) => {
      const lineY = y + 4 + i * lineHeight; // 上邊距 4px

      // 所有已經過裁剪的行都應該繪製
      // 因為 bestLines 已經在上面被裁剪到只包含能完整顯示的行
      ctx.fillText(line, x + 2, lineY);
    });
  }

  /**
   * 使用文字自適應演算法繪製文字（新演算法）
   * 策略：
   * 1. 儘可能保證和原來的 bbox 塊高度一致
   * 2. 儘可能放下所有的內容
   * 3. 在寬度和高度之間進行平衡，從而儘可能放大字型，但在 bbox 的框架內
   * @param {number} suggestedFontSize - 可選的建議字號（來自預處理）
   */
  drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText = false, suggestedFontSize = null) {
    try {
      // 判斷是否為 CJK 語言
      const isCJK = /[\u4e00-\u9fa5]/.test(text);
      const lineSkip = isCJK ? 1.5 : 1.3; // 使用統一的行距

      // 內邊距：對小bbox減少padding避免裁剪
      const paddingTop = height < 20 ? 0.5 : 2;  // 小bbox（<20px）：0.5px padding
      const paddingX = 2;
      const availableHeight = height - paddingTop * 2; // 上下都留邊距
      const availableWidth = width - paddingX * 2;

      // 字號範圍：基於 bbox 高度估算
      // 假設單行文字，字號約為 bbox 高度的 80%
      const estimatedSingleLineFontSize = height * 0.8;

      // 最小字號：動態調整（基於bbox高度）
      // 對於小bbox（高度<20px），允許使用更小的字號以避免裁剪
      // 對於正常bbox，使用10px/8px以平衡可讀性和容納率
      let minFontSize;
      if (height < 20) {
        minFontSize = Math.max(6, height * 0.35);  // 小bbox：最小6px, 35%係數
      } else {
        minFontSize = isShortText ? 10 : 8;  // 正常bbox：10px/8px（降低閾值）
      }

      // 最大字號：不超過單行估算值的 1.5 倍
      const maxFontSize = Math.min(estimatedSingleLineFontSize * 1.5, height * 1.2);

      // 檢查文字是否包含換行字元
      const hasNewlines = text.includes('\n');
      const textLength = text.length;

      // console.log(`[TextFitting] 開始: "${text.substring(0, 30)}..." bbox=${width.toFixed(0)}x${height.toFixed(0)}, 字號範圍=${minFontSize.toFixed(1)}-${maxFontSize.toFixed(1)}px, 文字長度=${textLength}, 有換行=${hasNewlines}`);

      // 嘗試不同的寬度因子（從 1.0 開始，優先使用全寬）
      // 如果文字很短或有原始換行字元，只使用全寬
      const widthFactors = (textLength < 20 || hasNewlines)
        ? [1.0]
        : [1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70];

      let bestSolution = null; // { fontSize, widthFactor, lines }

      // 對每個寬度因子，使用二分查詢找到最大可用字號
      for (const widthFactor of widthFactors) {
        const effectiveWidth = availableWidth * widthFactor;

        // 二分查詢最大字號
        let low = minFontSize;
        let high = maxFontSize;
        let foundFontSize = null;
        let foundLines = null;

        while (high - low > 0.5) { // 精度 0.5px
          const mid = (low + high) / 2;

          // 測試這個字號是否能裝下
          ctx.font = `${mid}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
          const lines = this.wrapText(ctx, text, effectiveWidth);
          const lineHeight = mid * lineSkip;

          // 計算總高度：最後一行不需要完整行高
          const totalHeight = lines.length > 0
            ? (lines.length - 1) * lineHeight + mid
            : 0;

          if (totalHeight <= availableHeight) {
            // 能裝下，嘗試更大的字號
            foundFontSize = mid;
            foundLines = lines;
            low = mid;
          } else {
            // 裝不下，嘗試更小的字號
            high = mid;
          }
        }

        // 如果找到了可行解，且比當前最優解更好（字號更大）
        if (foundFontSize && (!bestSolution || foundFontSize > bestSolution.fontSize)) {
          bestSolution = {
            fontSize: foundFontSize,
            widthFactor: widthFactor,
            lines: foundLines
          };
        }
      }

      // 如果找到了最優解，繪製
      if (bestSolution) {
        const { fontSize, widthFactor, lines } = bestSolution;
        const lineHeight = fontSize * lineSkip;

        ctx.font = `${fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
        ctx.fillStyle = '#000';
        ctx.textBaseline = 'top';

        // 計算水平偏移（如果使用了縮小的寬度，左對齊）
        const xOffset = 0; // 始終左對齊

        // 計算總高度並垂直居中
        const totalHeight = lines.length > 0
          ? (lines.length - 1) * lineHeight + fontSize
          : 0;
        const yOffset = (availableHeight - totalHeight) / 2;

        lines.forEach((line, i) => {
          const lineY = y + paddingTop + yOffset + i * lineHeight;
          ctx.fillText(line, x + paddingX + xOffset, lineY);
        });

        // 顯示前3行內容用於除錯（已註釋以減少日誌）
        // const previewLines = lines.slice(0, 3).map(l => `"${l}"`).join(', ');
        // console.log(`[TextFitting] ✓ 成功: "${text.substring(0, 30)}..." 字號=${fontSize.toFixed(1)}px, 行數=${lines.length}, 寬度=${(widthFactor*100).toFixed(0)}%, bbox高=${height.toFixed(1)}px, 實際高=${totalHeight.toFixed(1)}px`);
        // console.log(`[TextFitting]   前3行: ${previewLines}`);
        return;
      }

      // 如果所有方案都失敗，使用最小字號強制繪製（裁剪行數）
      console.warn(`[TextFitting] ⚠ 無法找到合適字號，使用最小字號: "${text.substring(0, 30)}..."`);

      const fallbackFontSize = minFontSize;
      const fallbackLineHeight = fallbackFontSize * lineSkip;
      ctx.font = `${fallbackFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'top';

      const allLines = this.wrapText(ctx, text, availableWidth);
      const maxLines = Math.floor(availableHeight / fallbackLineHeight);
      const linesToDraw = allLines.slice(0, Math.max(1, maxLines));

      linesToDraw.forEach((line, i) => {
        const lineY = y + paddingTop + i * fallbackLineHeight;
        ctx.fillText(line, x + paddingX, lineY);
      });

      console.warn(`[TextFitting] ✗ 裁剪: 字號=${fallbackFontSize.toFixed(1)}px, 繪製=${linesToDraw.length}/${allLines.length}行`);

    } catch (error) {
      console.error('[PDFCompareView] 文字自適應渲染失敗:', error);
      // 最小回退渲染
      ctx.font = '8px Arial, sans-serif';
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'top';
      const lines = this.wrapText(ctx, text, width - 4);
      lines.forEach((line, i) => {
        const lineY = y + 4 + i * 12;
        if (lineY + 12 <= y + height) {
          ctx.fillText(line, x + 2, lineY);
        }
      });
    }
  }

  /**
   * 繪製包含公式的文字（HTML + KaTeX）- 自適應字號版本
   * @param {number} fontSize - 動態計算的字號
   */
  drawTextWithFormulaInBoxAdaptive(text, x, y, width, height, pageNum = null, wrapperEl = null, isShortText = false, fontSize = 12) {
    // 建立臨時 DOM 元素來渲染公式
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    // 轉換為 CSS 畫素（邏輯畫素）
    tempDiv.style.left = `${x / this.dpr}px`;
    tempDiv.style.top = `${y / this.dpr}px`;
    tempDiv.style.width = `${width / this.dpr}px`;
    // 設定高度限制
    const targetHeightPx = height / this.dpr;
    tempDiv.style.height = `${targetHeightPx}px`;
    tempDiv.style.maxHeight = `${targetHeightPx}px`;
    tempDiv.style.overflow = 'hidden'; // 隱藏超出部分
    tempDiv.style.wordWrap = 'break-word';
    tempDiv.style.overflowWrap = 'break-word';

    // 使用傳入的自適應字號
    tempDiv.style.fontSize = `${fontSize}px`;
    tempDiv.style.lineHeight = '1.5'; // 行間距 1.5（與 Canvas 一致）
    tempDiv.style.padding = '4px 2px'; // 上下4px，左右2px
    tempDiv.style.paddingBottom = '4px'; // 確保底部也有足夠空間
    tempDiv.style.boxSizing = 'border-box';
    tempDiv.style.pointerEvents = 'none';
    tempDiv.style.color = '#000';
    tempDiv.style.zIndex = '10';
    tempDiv.style.fontFamily = 'sans-serif';
    tempDiv.style.webkitFontSmoothing = 'antialiased';
    tempDiv.setAttribute('data-pdf-compare', '1');
    if (pageNum != null) tempDiv.setAttribute('data-page', String(pageNum));

    // 渲染公式
    const processedText = this.renderFormulasInText(text);
    tempDiv.innerHTML = processedText;

    // 新增到傳入的段 wrapper（相對定位的容器）
    const targetWrapper = wrapperEl || this.translationSegmentsContainer || document.getElementById('pdf-translation-segments') || this.translationCanvas?.parentElement;
    if (targetWrapper) {
      targetWrapper.appendChild(tempDiv);

      // ✅ 修復公式超高問題：迭代縮小字號直到內容適配
      const minFontSize = 6; // 最小字號
      const fontSizeStep = 0.5; // 每次縮小 0.5px
      let currentFontSize = fontSize;
      let iterations = 0;
      const maxIterations = 20; // 最多嘗試 20 次

      // 等待 KaTeX 渲染完成後檢查高度
      setTimeout(() => {
        // 檢查實際內容高度是否超出容器
        while (tempDiv.scrollHeight > targetHeightPx && currentFontSize > minFontSize && iterations < maxIterations) {
          currentFontSize -= fontSizeStep;
          tempDiv.style.fontSize = `${currentFontSize}px`;
          iterations++;
        }

        // 如果經過迭代後仍然超高，記錄警告
        if (tempDiv.scrollHeight > targetHeightPx) {
          const overflowRatio = ((tempDiv.scrollHeight / targetHeightPx - 1) * 100).toFixed(1);
          console.warn(
            `[FormulaFitting] 公式內容超出bbox ${overflowRatio}%:`,
            `scrollHeight=${tempDiv.scrollHeight.toFixed(1)}px,`,
            `targetHeight=${targetHeightPx.toFixed(1)}px,`,
            `最終字號=${currentFontSize.toFixed(1)}px`,
            `(已達最小字號${minFontSize}px)`
          );
        } else if (iterations > 0) {
          // 成功縮小到合適大小，記錄除錯資訊
          console.log(
            `[FormulaFitting] 自動縮小字號: ${fontSize.toFixed(1)}px → ${currentFontSize.toFixed(1)}px`,
            `(迭代${iterations}次)`
          );
        }
      }, 10); // 等待 10ms 讓 KaTeX 渲染完成
    }
  }

  /**
   * 繪製包含公式的文字（HTML + KaTeX）- 相容舊介面
   * @param {boolean} isShortText - 是否為短文字/小標題（會使用更大的字號）
   */
  drawTextWithFormulaInBox(text, x, y, width, height, pageNum = null, wrapperEl = null, isShortText = false) {
    // 根據 bbox 高度自適應字號（避免壓住下一行）
    const heightCss = height / this.dpr;
    let fontSize;
    if (isShortText) {
      // 小標題：根據高度自適應，但最小 14px
      fontSize = Math.max(Math.min(heightCss / 2.5, 18), 14); // 14-18px，更保守的計算
    } else {
      // 常規文字：根據高度自適應，最小 6px
      fontSize = Math.max(Math.min(heightCss / 3.5, 13), 6); // 6-13px，更保守的計算
    }

    // 呼叫自適應版本
    this.drawTextWithFormulaInBoxAdaptive(text, x, y, width, height, pageNum, wrapperEl, isShortText, fontSize);
  }

  /**
   * 清理指定頁的公式 DOM
   */
  clearFormulaElementsForPage(pageNum) {
    const wrapper = this.translationSegmentsContainer || document.getElementById('pdf-translation-segments') || this.translationCanvas?.parentElement;
    if (!wrapper) return;
    const list = wrapper.querySelectorAll('[data-pdf-compare="1"][data-page="' + String(pageNum) + '"]');
    list.forEach(el => el.remove());
  }

  /**
   * 清理所有由我們建立的公式 DOM
   */
  clearAllFormulaElements() {
    const wrapper = this.translationSegmentsContainer || document.getElementById('pdf-translation-segments') || this.translationCanvas?.parentElement;
    if (!wrapper) return;
    const list = wrapper.querySelectorAll('[data-pdf-compare="1"]');
    list.forEach(el => el.remove());
  }

  // 僅在指定 wrapper 中清理指定頁的公式 DOM
  clearFormulaElementsForPageInWrapper(pageNum, wrapper) {
    if (!wrapper) return;
    const list = wrapper.querySelectorAll('[data-pdf-compare="1"][data-page="' + String(pageNum) + '"]');
    list.forEach(el => el.remove());
  }

  /**
   * 渲染文字中的公式（最佳化版：優先使用模組）
   */
  renderFormulasInText(text) {
    // 優先使用 TextFittingAdapter 的公式渲染
    if (this.textFittingAdapter && typeof this.textFittingAdapter.renderFormulasInText === 'function') {
      return this.textFittingAdapter.renderFormulasInText(text);
    }

    // 回退方案：使用本地實現
    if (!this._formulaCache) {
      this._formulaCache = new Map();
    }

    if (this._formulaCache.has(text)) {
      return this._formulaCache.get(text);
    }

    if (typeof window.renderMathInElement === 'function') {
      // 預處理公式：修復常見的非標準LaTeX命令
      let processedText = text;
      // 將 \plus 替換為 +（\plus 不是標準LaTeX命令）
      processedText = processedText.replace(/\\plus(?![a-zA-Z])/g, '+');

      const tempContainer = document.createElement('div');
      tempContainer.textContent = processedText;

      try {
        window.renderMathInElement(tempContainer, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false,
          strict: false
        });
        const result = tempContainer.innerHTML;

        // 快取結果（最多快取 500 條）
        if (this._formulaCache.size < 500) {
          this._formulaCache.set(text, result);
        }

        return result;
      } catch (e) {
        // 只在首次失敗時列印日誌
        if (!this._katexWarned) {
          console.warn('[PDFCompareView] KaTeX 渲染失敗:', e);
          this._katexWarned = true;
        }
        return text;
      }
    } else {
      // 只警告一次
      if (!this._katexUnavailableWarned) {
        console.warn('[renderFormulasInText] renderMathInElement 不可用');
        this._katexUnavailableWarned = true;
      }
      return text;
    }
  }

  /**
   * 將文字按寬度換行（智慧換行，支援中英文）
   */
  wrapText(ctx, text, maxWidth) {
    if (!text) return [];

    const lines = [];
    let currentLine = '';

    // 先按自然斷句分段（句號、問號、感嘆號、逗號等）
    const segments = text.split(/([。？！，、；：\n])/);

    for (let segment of segments) {
      if (!segment) continue;

      // 如果是標點符號，直接加到當前行
      if (/^[。？！，、；：]$/.test(segment)) {
        currentLine += segment;
        continue;
      }

      // 如果是換行字元，強制換行
      if (segment === '\n') {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        continue;
      }

      // 按字元逐個新增
      for (let i = 0; i < segment.length; i++) {
        const char = segment[i];
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine.length > 0) {
          // 當前行已滿，換行
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  /**
   * 根據型別獲取顏色
   */
  getTypeColor(type, alpha = 0.3) {
    switch (type) {
      case 'table':
        return `rgba(204, 204, 0, ${alpha})`;
      case 'image':
        return `rgba(153, 255, 51, ${alpha})`;
      case 'title':
        return `rgba(102, 102, 255, ${alpha})`;
      case 'text':
        return `rgba(153, 0, 76, ${alpha})`;
      default:
        return `rgba(255, 235, 59, ${alpha})`;
    }
  }

  /**
   * 渲染所有 bbox（啟用可見性）
   */
  renderAllBboxes(pageNum) {
    const currentPageIndex = pageNum - 1;
    const ctx = this.originalOverlayContext;

    // 清空
    ctx.clearRect(0, 0, this.originalOverlay.width, this.originalOverlay.height);

    // 獲取當前頁的所有內容塊（只顯示文字型別）
    const pageItems = this.contentListJson.filter(item =>
      item.page_idx === currentPageIndex && item.type === 'text'
    );

    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = this.originalOverlay.width / BBOX_NORMALIZED_RANGE;
    const scaleY = this.originalOverlay.height / BBOX_NORMALIZED_RANGE;

    // 繪製所有文字 bbox（紫紅色邊框，更明顯）
    pageItems.forEach((item, idx) => {
      if (!item.bbox) return;

      const bbox = item.bbox;
      const x = bbox[0] * scaleX;
      const y = bbox[1] * scaleY;
      const w = (bbox[2] - bbox[0]) * scaleX;
      const h = (bbox[3] - bbox[1]) * scaleY;

      // 使用紫紅色（text 型別的顏色），加深透明度
      ctx.strokeStyle = 'rgb(153, 0, 76)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7; // 從 0.3 改為 0.7，更明顯
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1.0;
    });
  }

  /**
   * 綁定左邊 bbox 的點選事件
   */
  bindBboxClick() {
    // 事件綁定在每個段的 overlay 上（見 createSegmentDom）
  }

  /**
   * 連續模式：處理每頁 overlay 的點選
   */
  /**
   * 連續模式：醒目提示左右對應 bbox（在長畫布上，僅該頁區域）
   */
  highlightBboxPairContinuous(item, pageInfo) {
    // 已改為分段醒目提示，保留簽名以相容但不再使用
  }

  // 段 overlay 點選命中測試並醒目提示左右
  async onSegmentOverlayClick(e, seg) {
    const overlay = e.currentTarget;
    const rect = overlay.getBoundingClientRect();
    const sx = overlay.width / overlay.clientWidth;
    const sy = overlay.height / overlay.clientHeight;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;

    // 找頁
    const page = seg.pages.find(p => y >= p.yInSegPx && y <= p.yInSegPx + p.height);
    if (!page) return;
    const pageNum = page.pageNum;
    const items = this.contentListJson.filter(it => it.page_idx === pageNum - 1 && it.type === 'text');
    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = page.width / BBOX_NORMALIZED_RANGE;
    const scaleY = page.height / BBOX_NORMALIZED_RANGE;

    for (const it of items) {
      if (!it.bbox) continue;
      const b = it.bbox;
      const bx = b[0] * scaleX;
      const by = b[1] * scaleY + page.yInSegPx;
      const bw = (b[2] - b[0]) * scaleX;
      const bh = (b[3] - b[1]) * scaleY;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        // 重繪本段 overlays
        await this.renderSegmentOverlays(seg);
        // 醒目提示左右
        const drawHL = (ctx) => {
          ctx.strokeStyle = 'rgb(255, 0, 0)';
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.8;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.globalAlpha = 1.0;
        };
        drawHL(seg.left.overlayCtx);
        drawHL(seg.right.overlayCtx);
        break;
      }
    }
  }

  /**
   * 醒目提示左右對應的 bbox
   */
  highlightBboxPair(index, pageItems) {
    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = this.originalOverlay.width / BBOX_NORMALIZED_RANGE;
    const scaleY = this.originalOverlay.height / BBOX_NORMALIZED_RANGE;
    const scaleXTrans = this.translationOverlay.width / BBOX_NORMALIZED_RANGE;
    const scaleYTrans = this.translationOverlay.height / BBOX_NORMALIZED_RANGE;

    const item = pageItems[index];
    if (!item || !item.bbox) return;

    // 醒目提示左邊原始 bbox
    const ctx = this.originalOverlayContext;
    const bbox = item.bbox;
    const x = bbox[0] * scaleX;
    const y = bbox[1] * scaleY;
    const w = (bbox[2] - bbox[0]) * scaleX;
    const h = (bbox[3] - bbox[1]) * scaleY;

    // 重繪所有 bbox（清除之前的醒目提示）
    this.renderAllBboxes(this.currentPage);

    // 醒目提示當前點選的 bbox（左邊）
    ctx.strokeStyle = 'rgb(255, 0, 0)'; // 紅色醒目提示
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = 1.0;

    // 重新渲染右邊的翻譯層（這樣翻譯文字不會消失）
    this.renderTranslationOverlay(this.currentPage);

    // 在翻譯層上疊加醒目提示邊框
    const ctxTrans = this.translationOverlayContext;
    const xTrans = bbox[0] * scaleXTrans;
    const yTrans = bbox[1] * scaleYTrans;
    const wTrans = (bbox[2] - bbox[0]) * scaleXTrans;
    const hTrans = (bbox[3] - bbox[1]) * scaleYTrans;

    ctxTrans.strokeStyle = 'rgb(255, 0, 0)'; // 紅色醒目提示
    ctxTrans.lineWidth = 3;
    ctxTrans.globalAlpha = 0.8;
    ctxTrans.strokeRect(xTrans, yTrans, wTrans, hTrans);
    ctxTrans.globalAlpha = 1.0;
  }

  /**
   * 獲取型別的邊框顏色
   */
  getTypeStrokeColor(type) {
    switch (type) {
      case 'table':
        return 'rgb(204, 204, 0)';
      case 'image':
        return 'rgb(153, 255, 51)';
      case 'title':
        return 'rgb(102, 102, 255)';
      case 'text':
        return 'rgb(153, 0, 76)';
      default:
        return 'rgb(251, 192, 45)';
    }
  }

  /**
   * 綁定滾動聯動
   */
  bindScrollSync() {
    const originalScroll = document.getElementById('pdf-original-scroll');
    const translationScroll = document.getElementById('pdf-translation-scroll');

    if (!originalScroll || !translationScroll) return;

    let isSyncing = false;
    let scrollSyncRaf = null;
    let renderDebounceTimer = null;

    // 使用 requestAnimationFrame + 防抖最佳化滾動效能
    const syncScroll = (source, target) => {
      if (isSyncing) return;

      if (scrollSyncRaf) {
        cancelAnimationFrame(scrollSyncRaf);
      }

      scrollSyncRaf = requestAnimationFrame(() => {
        isSyncing = true;
        target.scrollTop = source.scrollTop;
        target.scrollLeft = source.scrollLeft;

        // 立即取消同步標誌
        requestAnimationFrame(() => {
          isSyncing = false;
        });
      });

      // 延遲渲染可見段（防抖最佳化，150ms內只觸發一次）
      if (this.mode === 'continuous') {
        if (renderDebounceTimer) {
          clearTimeout(renderDebounceTimer);
        }
        renderDebounceTimer = setTimeout(() => {
          this.renderVisibleSegments(source);
        }, 150);
      }
    };

    // 滾動聯動（使用 passive 最佳化）
    originalScroll.addEventListener('scroll', () => syncScroll(originalScroll, translationScroll), { passive: true });
    translationScroll.addEventListener('scroll', () => syncScroll(translationScroll, originalScroll), { passive: true });
  }

  /**
   * 檢測是否需要自動載入下一頁
   */
  checkAutoLoadNextPage(scrollElement) {
    // 單頁模式下才啟用自動翻頁載入
    if (this.mode === 'continuous') return;
    const scrollTop = scrollElement.scrollTop;
    const scrollHeight = scrollElement.scrollHeight;
    const clientHeight = scrollElement.clientHeight;

    // 滾動到距離底部 100px 以內時，自動載入下一頁
    if (scrollHeight - scrollTop - clientHeight < 100) {
      if (this.currentPage < this.totalPages && !this.isLoadingPage) {
        this.isLoadingPage = true;
        setTimeout(() => {
          this.renderPage(this.currentPage + 1).then(() => {
            this.isLoadingPage = false;
          });
        }, 100);
      }
    }
  }

  /**
   * 綁定事件
   */
  bindEvents() {
    // 退出全屏對照模式
    document.getElementById('pdf-exit-fullscreen')?.addEventListener('click', () => {
      // 恢復浮動圖示
      this.showFloatingIcons();

      // 切換回其他標籤（優先切換到 OCR 標籤，避免沒有翻譯內容時報錯）
      if (typeof window.showTab === 'function') {
        // 如果有翻譯內容，切換到翻譯標籤；否則切換到 OCR 標籤
        const hasTranslation = window.data && window.data.translation && window.data.translation.trim() !== '';
        window.showTab(hasTranslation ? 'translation' : 'ocr');
      }
    });

    // 上一頁（連續模式下滾動定位；單頁模式下重新渲染）
    document.getElementById('pdf-prev-page')?.addEventListener('click', () => {
      if (this.mode === 'continuous') {
        const current = this.getCurrentVisiblePageNum();
        const target = Math.max(1, current - 1);
        this.scrollToPage(target);
      } else if (this.currentPage > 1) {
        this.renderPage(this.currentPage - 1);
      }
    });

    // 下一頁
    document.getElementById('pdf-next-page')?.addEventListener('click', () => {
      if (this.mode === 'continuous') {
        const current = this.getCurrentVisiblePageNum();
        const target = Math.min(this.totalPages, current + 1);
        this.scrollToPage(target);
      } else if (this.currentPage < this.totalPages) {
        this.renderPage(this.currentPage + 1);
      }
    });

    // 放大/縮小：連續模式下重建長畫布；單頁模式維持原邏輯
    document.getElementById('pdf-zoom-in')?.addEventListener('click', async () => {
      this.scale = Math.min(this.scale + 0.25, 3.0);
      document.getElementById('pdf-zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
      if (this.mode === 'continuous') {
        await this.rebuildContinuousViewAndKeepScroll();
      } else {
        this.renderPage(this.currentPage);
      }
    });

    document.getElementById('pdf-zoom-out')?.addEventListener('click', async () => {
      this.scale = Math.max(this.scale - 0.25, 0.5);
      document.getElementById('pdf-zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
      if (this.mode === 'continuous') {
        await this.rebuildContinuousViewAndKeepScroll();
      } else {
        this.renderPage(this.currentPage);
      }
    });

    // 匯出保留原格式的譯文PDF
    document.getElementById('pdf-export-structured-translation')?.addEventListener('click', async () => {
      await this.exportStructuredTranslation();
    });
  }

  /**
   * 重新構建連續模式檢視，並儘量保持滾動位置
   */
  async rebuildContinuousViewAndKeepScroll() {
    const left = document.getElementById('pdf-original-scroll');
    const right = document.getElementById('pdf-translation-scroll');
    if (!left || !right) return;

    // 記錄滾動比例，儘量保持位置
    const frac = left.scrollHeight > left.clientHeight ? left.scrollTop / (left.scrollHeight - left.clientHeight) : 0;

    // 不需要等待舊長畫布佇列；分段渲染按段順序進行

    // 清空 overlay 公式 DOM
    this.clearAllFormulaElements();

    // 重建長畫布
    await this.renderAllPagesContinuous();

    // 恢復滾動
    const newTop = frac * (left.scrollHeight - left.clientHeight);
    left.scrollTop = newTop;
    right.scrollTop = newTop;

    // 渲染當前可見頁
    await this.renderVisibleSegments(left);
  }

  /**
   * 獲取當前可見區所處的頁號（連續模式）
   */
  getCurrentVisiblePageNum() {
    const scroller = document.getElementById('pdf-original-scroll');
    if (!scroller || !this.pageInfos.length) return this.currentPage || 1;
    const dpr = this.dpr;
    const scrollTop = scroller.scrollTop * dpr;
    for (const pi of this.pageInfos) {
      if (pi.yOffset + pi.height > scrollTop) {
        return pi.pageNum;
      }
    }
    return this.pageInfos[this.pageInfos.length - 1].pageNum;
  }

  /**
   * 連續模式：滾動到指定頁
   */
  scrollToPage(pageNum) {
    if (!this.pageInfos || !this.pageInfos.length) return;
    const pageInfo = this.pageInfos.find(p => p.pageNum === pageNum);
    if (!pageInfo) return;
    const cssTop = pageInfo.yOffset / this.dpr;
    const originalScroll = document.getElementById('pdf-original-scroll');
    const translationScroll = document.getElementById('pdf-translation-scroll');
    if (originalScroll) originalScroll.scrollTop = cssTop;
    if (translationScroll) translationScroll.scrollTop = cssTop;
    // 進入視口後觸發渲染
    this.renderVisibleSegments(originalScroll);
  }

  /**
   * 隱藏浮動圖示（除了 chatbot）
   */
  hideFloatingIcons() {
    // 延遲執行，確保 DOM 已完全載入
    setTimeout(() => {
      const iconsToHide = [
        'toggle-immersive-btn',  // 沉浸式模式按鈕
        'toc-float-btn'           // 目錄浮動按鈕
      ];

      console.log('[PDFCompareView] 🔍 開始隱藏浮動圖示');
      iconsToHide.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          console.log(`[PDFCompareView] ✅ 找到圖示 ${id}，當前 display:`, element.style.display);
          element.style.setProperty('display', 'none', 'important');
          element.style.setProperty('visibility', 'hidden', 'important');
          element.style.setProperty('opacity', '0', 'important');
          element.style.setProperty('pointer-events', 'none', 'important');
          console.log(`[PDFCompareView] ✔️ 已隱藏 ${id}，新 display:`, element.style.display);
        } else {
          console.warn(`[PDFCompareView] ❌ 未找到圖示 ${id}`);
        }
      });
    }, 200);
  }

  /**
   * 恢復浮動圖示
   */
  showFloatingIcons() {
    const iconsToShow = [
      'toggle-immersive-btn',
      'toc-float-btn'
    ];

    iconsToShow.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.removeProperty('display');
        element.style.removeProperty('visibility');
        element.style.removeProperty('opacity');
        element.style.removeProperty('pointer-events');
      }
    });
  }

  /**
   * HTML 轉義
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 匯出保留原格式的譯文PDF
   * 使用 pdf-lib 在原始PDF上覆蓋翻譯後的文字
   */
  async exportStructuredTranslation() {
    // 優先使用新模組
    if (this.pdfExporter) {
      await this.pdfExporter.exportStructuredTranslation(
        this.originalPdfBase64,
        this.translatedContentList,
        typeof showNotification === 'function' ? showNotification : null
      );
      return;
    }

    // 回退：使用原有實現
    try {
      // 檢查是否有翻譯資料
      if (!this.translatedContentList || this.translatedContentList.length === 0) {
        if (typeof showNotification === 'function') {
          showNotification('沒有翻譯內容可匯出', 'warning');
        }
        return;
      }

      // 檢查是否有原始PDF資料
      if (!this.originalPdfBase64) {
        if (typeof showNotification === 'function') {
          showNotification('原始PDF資料不可用', 'error');
        }
        return;
      }

      // 顯示進度提示
      if (typeof showNotification === 'function') {
        showNotification('正在生成譯文PDF，請稍候...', 'info');
      }

      // 動態載入 pdf-lib（如果尚未載入）
      if (typeof PDFLib === 'undefined') {
        console.log('[PDFCompareView] 正在載入 pdf-lib...');
        await this.loadPdfLib();
      }

      const { PDFDocument, rgb, StandardFonts } = PDFLib;

      // 載入原始PDF
      const pdfBytes = this.base64ToUint8Array(this.originalPdfBase64);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // 註冊 fontkit（用於嵌入自定義字型）
      if (typeof fontkit !== 'undefined') {
        pdfDoc.registerFontkit(fontkit);
        console.log('[PDFCompareView] fontkit 已註冊');
      } else {
        console.warn('[PDFCompareView] fontkit 未載入，無法嵌入自定義字型');
      }

      // 嘗試嵌入中文字型（從CDN載入思源黑體）
      let font = null;
      try {
        if (typeof fontkit === 'undefined') {
          throw new Error('fontkit 未載入，無法嵌入中文字型');
        }

        console.log('[PDFCompareView] 正在載入中文字型...');
        const fontBytes = await fetch('https://gcore.jsdelivr.net/npm/source-han-sans-cn@1.0.0/SourceHanSansCN-Normal.otf').then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.arrayBuffer();
        });

        font = await pdfDoc.embedFont(fontBytes);
        console.log('[PDFCompareView] 中文字型載入成功');
      } catch (fontError) {
        console.error('[PDFCompareView] 中文字型載入失敗:', fontError);
        if (typeof showNotification === 'function') {
          showNotification('中文字型載入失敗，無法匯出PDF: ' + fontError.message, 'error');
        }
        throw fontError; // 中止匯出
      }

      // 按頁面分組翻譯內容
      const pageContentMap = new Map();
      this.translatedContentList.forEach((item, idx) => {
        if (item.type !== 'text' || !item.text || !item.bbox) return;

        const pageIdx = item.page_idx !== undefined ? item.page_idx : 0;
        if (!pageContentMap.has(pageIdx)) {
          pageContentMap.set(pageIdx, []);
        }
        pageContentMap.get(pageIdx).push({ ...item, originalIndex: idx });
      });

      // 常量：MinerU bbox 歸一化範圍（固定為1000，與canvas渲染邏輯一致）
      const BBOX_NORMALIZED_RANGE = 1000;

      // 走訪每一頁，覆蓋翻譯文字
      for (const [pageIdx, items] of pageContentMap.entries()) {
        if (pageIdx >= pdfDoc.getPageCount()) continue;

        const page = pdfDoc.getPage(pageIdx);
        const { width: pageWidth, height: pageHeight } = page.getSize();

        // 計算縮放因子（bbox歸一化範圍固定為1000）
        const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
        const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

        console.log(`[PDFCompareView] 頁面 ${pageIdx}: PDF尺寸=${pageWidth.toFixed(2)}x${pageHeight.toFixed(2)}pt, 縮放比例=${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);

        // 先用白色矩形覆蓋原文（清除原文）
        items.forEach(item => {
          const bbox = item.bbox;
          const x = bbox[0] * scaleX;
          const y = pageHeight - (bbox[3] * scaleY); // PDF座標系從下往上
          const width = (bbox[2] - bbox[0]) * scaleX;
          const height = (bbox[3] - bbox[1]) * scaleY;

          // 繪製白色矩形覆蓋原文
          page.drawRectangle({
            x: x,
            y: y,
            width: width,
            height: height,
            color: rgb(1, 1, 1), // 白色
          });
        });

        // 繪製翻譯文字（使用與canvas渲染相同的文字適配演算法）
        items.forEach(item => {
          const bbox = item.bbox;
          const text = item.text || '';

          if (!text.trim()) return;

          // 計算bbox在PDF座標系中的位置和尺寸
          const x = bbox[0] * scaleX;  // 左邊界
          const boxWidth = (bbox[2] - bbox[0]) * scaleX;
          const boxHeight = (bbox[3] - bbox[1]) * scaleY;
          // bbox頂部和底部在PDF座標系中的Y座標
          const bboxTop = pageHeight - (bbox[1] * scaleY);
          const bboxBottom = pageHeight - (bbox[3] * scaleY);

          // 判斷是否為短文字（與canvas渲染一致）
          const isShortText = text.length < 30;

          // 使用與canvas相同的文字版面演算法
          const layout = this.calculatePdfTextLayout(font, text, boxWidth, boxHeight, isShortText);
          const { fontSize, lines, lineHeight } = layout;

          // 內邊距（與canvas渲染一致）
          const paddingTop = 2;
          const paddingX = 2;
          const availableHeight = boxHeight - paddingTop * 2;

          // 計算總高度並垂直居中（與canvas渲染一致）
          const totalHeight = lines.length > 0
            ? (lines.length - 1) * lineHeight + fontSize
            : 0;
          const yOffset = (availableHeight - totalHeight) / 2;

          // 繪製每一行
          lines.forEach((line, lineIdx) => {
            // 計算baseline Y座標（從bbox底部開始，加上padding和居中偏移）
            const lineY = bboxBottom + paddingTop + yOffset + (lineIdx * lineHeight);

            // 確保不超出bbox範圍
            if (lineY < bboxBottom || lineY > bboxTop) return;

            page.drawText(line, {
              x: x + paddingX,
              y: lineY,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0), // 黑色文字
            });
          });
        });
      }

      // 生成PDF
      const modifiedPdfBytes = await pdfDoc.save();

      // 建立Blob並下載
      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `translated_${timestamp}.pdf`;

      // 使用FileSaver下載
      if (typeof saveAs === 'function') {
        saveAs(blob, filename);
        if (typeof showNotification === 'function') {
          showNotification('譯文PDF匯出成功！', 'success');
        }
      } else {
        // 後備方案：建立下載連結
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (typeof showNotification === 'function') {
          showNotification('譯文PDF匯出成功！', 'success');
        }
      }

    } catch (error) {
      console.error('[PDFCompareView] 匯出PDF失敗:', error);
      if (typeof showNotification === 'function') {
        showNotification('匯出失敗: ' + error.message, 'error');
      }
    }
  }

  /**
   * 為PDF匯出計算文字版面（使用與canvas渲染相同的演算法）
   * @param {Object} font - pdf-lib字型物件
   * @param {string} text - 要渲染的文字
   * @param {number} boxWidth - bbox寬度（PDF座標）
   * @param {number} boxHeight - bbox高度（PDF座標）
   * @param {boolean} isShortText - 是否為短文字
   * @returns {Object} { fontSize, lines, lineHeight }
   */
  calculatePdfTextLayout(font, text, boxWidth, boxHeight, isShortText = false) {
    // 判斷是否為 CJK 語言
    const isCJK = /[\u4e00-\u9fa5]/.test(text);
    const lineSkip = isCJK ? 1.25 : 1.15;

    // 內邊距（與canvas渲染一致）：對小bbox減少padding
    const paddingTop = boxHeight < 20 ? 0.5 : 2;
    const paddingX = 2;
    const availableHeight = boxHeight - paddingTop * 2;
    const availableWidth = boxWidth - paddingX * 2;

    // 字號範圍（與canvas渲染一致）
    const estimatedSingleLineFontSize = boxHeight * 0.8;

    // 最小字號：動態調整（基於bbox高度）
    let minFontSize;
    if (boxHeight < 20) {
      minFontSize = Math.max(6, boxHeight * 0.35);  // 小bbox：最小6px
    } else {
      minFontSize = isShortText ? 10 : 8;  // 正常bbox：10px/8px
    }

    const maxFontSize = Math.min(estimatedSingleLineFontSize * 1.5, boxHeight * 1.2);

    // 檢查文字是否包含換行字元
    const hasNewlines = text.includes('\n');
    const textLength = text.length;

    // 嘗試不同的寬度因子（與canvas渲染一致）
    const widthFactors = (textLength < 20 || hasNewlines)
      ? [1.0]
      : [1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70];

    let bestSolution = null;

    // 對每個寬度因子，使用二分查詢找到最大可用字號
    for (const widthFactor of widthFactors) {
      const effectiveWidth = availableWidth * widthFactor;

      // 二分查詢最大字號
      let low = minFontSize;
      let high = maxFontSize;
      let foundFontSize = null;
      let foundLines = null;

      while (high - low > 0.5) {
        const mid = (low + high) / 2;

        // 使用pdf-lib的字型測量API換行
        const lines = this.wrapTextForPdf(font, text, effectiveWidth, mid);
        const lineHeight = mid * lineSkip;

        // 計算總高度（與canvas渲染一致）
        const totalHeight = lines.length > 0
          ? (lines.length - 1) * lineHeight + mid
          : 0;

        if (totalHeight <= availableHeight) {
          foundFontSize = mid;
          foundLines = lines;
          low = mid;
        } else {
          high = mid;
        }
      }

      // 如果找到了可行解，且比當前最優解更好
      if (foundFontSize && (!bestSolution || foundFontSize > bestSolution.fontSize)) {
        bestSolution = {
          fontSize: foundFontSize,
          widthFactor: widthFactor,
          lines: foundLines,
          lineHeight: foundFontSize * lineSkip
        };
      }
    }

    // 如果找到了最優解，返回
    if (bestSolution) {
      return bestSolution;
    }

    // 後備方案：使用最小字號（與canvas渲染一致）
    const fallbackFontSize = minFontSize;
    const fallbackLineHeight = fallbackFontSize * lineSkip;
    const allLines = this.wrapTextForPdf(font, text, availableWidth, fallbackFontSize);
    const maxLines = Math.floor(availableHeight / fallbackLineHeight);
    const linesToDraw = allLines.slice(0, Math.max(1, maxLines));

    return {
      fontSize: fallbackFontSize,
      lines: linesToDraw,
      lineHeight: fallbackLineHeight,
      widthFactor: 1.0
    };
  }

  /**
   * 為PDF文字換行（使用pdf-lib字型測量）
   */
  wrapTextForPdf(font, text, maxWidth, fontSize) {
    if (!text) return [];

    const lines = [];
    let currentLine = '';

    // 先按自然斷句分段（與canvas wrapText一致）
    const segments = text.split(/([。？！，、；：\n])/);

    for (let segment of segments) {
      if (!segment) continue;

      // 如果是標點符號，直接加到當前行
      if (/^[。？！，、；：]$/.test(segment)) {
        currentLine += segment;
        continue;
      }

      // 如果是換行字元，強制換行
      if (segment === '\n') {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        continue;
      }

      // 按字元逐個新增
      for (let i = 0; i < segment.length; i++) {
        const char = segment[i];
        const testLine = currentLine + char;
        const width = font.widthOfTextAtSize(testLine, fontSize);

        if (width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  /**
   * 動態載入 pdf-lib 庫和 fontkit
   */
  async loadPdfLib() {
    // 先載入 pdf-lib
    if (typeof PDFLib === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://gcore.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        script.onload = () => {
          console.log('[PDFCompareView] pdf-lib 載入成功');
          resolve();
        };
        script.onerror = (error) => {
          console.error('[PDFCompareView] pdf-lib 載入失敗:', error);
          reject(new Error('Failed to load pdf-lib library'));
        };
        document.head.appendChild(script);
      });
    }

    // 再載入 fontkit（用於嵌入自定義字型）
    if (typeof fontkit === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://gcore.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
        script.onload = () => {
          console.log('[PDFCompareView] fontkit 載入成功');
          resolve();
        };
        script.onerror = (error) => {
          console.warn('[PDFCompareView] fontkit 載入失敗:', error);
          // fontkit載入失敗不應該阻止整個流程，只是無法使用自定義字型
          resolve();
        };
        document.head.appendChild(script);
      });
    }
  }

  /**
   * 清理資源
   */
  destroy() {
    // 清理模組
    if (this.segmentManager) {
      this.segmentManager.destroy();
      this.segmentManager = null;
    }

    if (this.textFittingAdapter) {
      this.textFittingAdapter.clearCache();
    }

    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }

    // 清理公式 DOM 元素
    if (this.formulaElements) {
      this.formulaElements.forEach(el => el.remove());
      this.formulaElements = [];
    }

    this.canvas = null;
    this.canvasContext = null;
    this.overlayCanvas = null;
    this.overlayContext = null;
    this.contentListJson = null;
    this.translatedContentList = null;
    this.selectedItemIndex = null;
  }
}

// 匯出到全域
window.PDFCompareView = PDFCompareView;
