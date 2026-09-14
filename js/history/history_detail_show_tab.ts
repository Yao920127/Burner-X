// ========== Phase 2.1: 效能最佳化 - DOM 快取和防抖 ==========
// DOM 元素快取：避免重複查詢
const DOM_CACHE = {
  tabs: {
    ocr: null,
    translation: null,
    chunkCompare: null,
    pdfCompare: null
  },
  layout: {
    title: null,
    meta: null,
    tabsContainer: null
  },
  // 初始化快取
  init: function() {
    this.tabs.ocr = document.getElementById('tab-ocr');
    this.tabs.translation = document.getElementById('tab-translation');
    this.tabs.chunkCompare = document.getElementById('tab-chunk-compare');
    this.tabs.pdfCompare = document.getElementById('tab-pdf-compare');
    this.layout.title = document.getElementById('fileName');
    this.layout.meta = document.getElementById('fileMeta');
    this.layout.tabsContainer = document.querySelector('.tabs-container');
  },
  // 懶初始化：第一次使用時自動初始化
  ensureInitialized: function() {
    if (!this.tabs.ocr) {
      this.init();
    }
  }
};

// 防抖定時器：防止快速切換標籤導致重複渲染
let showTabDebounceTimer = null;
let pendingTab = null;

/**
 * 帶防抖的標籤切換函式（使用者介面）
 * 快速點選多個標籤時，只渲染最後一個
 */
function showTab(tab) {
  // 記錄待處理的標籤
  pendingTab = tab;

  // 清除之前的定時器
  if (showTabDebounceTimer) {
    clearTimeout(showTabDebounceTimer);
  }

  // 設定新的延遲執行（100ms）
  showTabDebounceTimer = setTimeout(() => {
    showTabDebounceTimer = null;
    showTabImmediate(pendingTab);
  }, 100);
}

/**
 * 立即執行標籤切換（內部函式）
 * 原 showTab 邏輯移至此處
 */
function showTabImmediate(tab) {
  // 確保 DOM 快取已初始化
  DOM_CACHE.ensureInitialized();

  // Phase 2.3: 清空批註系統快取（標籤切換時）
  if (window.AnnotationDOMCache && window.AnnotationDOMCache.initialized) {
    window.AnnotationDOMCache.clear();
  }

  // ========== 先嚐試清理上一檢視的資源（尤其 chunk-compare） ==========
  try {
    const prevTab = window.currentVisibleTabId;
    if (prevTab === 'chunk-compare' && tab !== 'chunk-compare') {
      // 斷開觀察器並清空最佳化器快取
      if (window.ChunkCompareOptimizer && window.ChunkCompareOptimizer.instance && typeof window.ChunkCompareOptimizer.instance.cleanup === 'function') {
        window.ChunkCompareOptimizer.instance.cleanup();
      }
      // 清空分塊解析快取，釋放大陣列
      if (window.chunkParseCache) {
        Object.keys(window.chunkParseCache).forEach(k => delete window.chunkParseCache[k]);
      }
      // 釋放塊級原始內容參考
      if (typeof window.__lastChunkCompareTotalBlocks === 'number') {
        for (let i = 0; i <= window.__lastChunkCompareTotalBlocks; i++) {
          try { delete window[`blockRawContent_${i}`]; } catch(e) { /* ignore */ }
        }
        window.__lastChunkCompareTotalBlocks = 0;
      }
      // 清理大型臨時資料
      if (window.largeDocumentData) window.largeDocumentData = null;
    }
  } catch (e) {
    console.warn('[showTab] 清理上一檢視資源時出錯:', e);
  }
  // === 新增：沒有翻譯內容時禁止切換到翻譯和對比頁 ===
  if ((tab === 'translation' || tab === 'chunk-compare') && (!data || !data.translation || data.translation.trim() === "")) {
    alert('沒有翻譯內容，無法顯示該頁面');
    return;
  }
  // ========== 保證內容識別符號始終正確 ==========
  if (tab === 'ocr') {
    window.globalCurrentContentIdentifier = 'ocr';
  } else if (tab === 'translation') {
    window.globalCurrentContentIdentifier = 'translation';
  } else {
    window.globalCurrentContentIdentifier = '';
  }
  // ========== 防抖鎖：防止同一 tab 重複渲染 ==========
  if (renderingTab === tab) {
    console.log(`[showTab] Tab ${tab} 正在渲染中，跳過重複渲染`);
    return;
  }
  renderingTab = tab;
  // ================================================
  // 效能測試斷點 - 總渲染
  console.time('[效能] showTab_總渲染');
  currentVisibleTabId = tab; // Update global current tab ID
  window.currentVisibleTabId = tab; // 同時更新掛載到 window 物件上的變數
  window.currentBlockTokensForCopy = window.currentBlockTokensForCopy || {}; // Initialize if not exists

  // ========== 新增：用區域性變數儲存內容識別符號 ==========
  let contentIdentifier = '';
  if (tab === 'ocr') {
    contentIdentifier = 'ocr';
  } else if (tab === 'translation') {
    contentIdentifier = 'translation';
  }
  window.globalCurrentContentIdentifier = contentIdentifier;
  console.log('[showTab] 設定 window.globalCurrentContentIdentifier =', contentIdentifier);
  // ==================================================

  if (docIdForLocalStorage) {
    const activeTabKey = `activeTab_${docIdForLocalStorage}`;
    localStorage.setItem(activeTabKey, tab);
    // console.log(`Saved active tab for ${docIdForLocalStorage}: ${tab}`);
  }

  // 使用快取的 DOM 元素：移除所有標籤的 active 狀態
  DOM_CACHE.tabs.ocr.classList.remove('active');
  DOM_CACHE.tabs.translation.classList.remove('active');
  // document.getElementById('tab-compare').classList.remove('active'); // 對應按鈕已註釋，此行也可註釋
  DOM_CACHE.tabs.chunkCompare.classList.remove('active');
  if (DOM_CACHE.tabs.pdfCompare) DOM_CACHE.tabs.pdfCompare.classList.remove('active');

  // 恢復頂部區域顯示（退出 PDF 對照模式時）- 使用快取
  if (DOM_CACHE.layout.title) DOM_CACHE.layout.title.style.display = '';
  if (DOM_CACHE.layout.meta) DOM_CACHE.layout.meta.style.display = '';
  if (DOM_CACHE.layout.tabsContainer) DOM_CACHE.layout.tabsContainer.style.display = '';

  let html = '';
  let contentContainerId = ''; // 用於 applyAnnotationsToContent
  let activeContentElement = null; // 用於 applyAnnotationsToContent
  const significantTokenTypes = ['paragraph', 'heading', 'code', 'table', 'blockquote', 'list', 'html', 'hr'];

  // ---- 增加日誌 ----
  // 日誌現在可以準確反映 globalCurrentContentIdentifier
  console.log(`[showTab - ${tab}] 即將渲染。當前 window.globalCurrentContentIdentifier:`, window.globalCurrentContentIdentifier);
  if (data && data.annotations) {
      console.log(`[showTab - ${tab}] data.annotations (長度 ${data.annotations.length}):`, JSON.parse(JSON.stringify(data.annotations)));
  } else {
      console.log(`[showTab - ${tab}] data.annotations 不可用或為空。`);
  }
  // ---- 日誌結束 ----

  if (tab === 'chunk-compare') {
    // 安全校驗：需要 ocrChunks/transChunks 同步存在且長度一致
    if (!data || !Array.isArray(data.ocrChunks) || !Array.isArray(data.translatedChunks) || data.ocrChunks.length === 0 || data.translatedChunks.length === 0 || data.ocrChunks.length !== data.translatedChunks.length) {
      DOM_CACHE.tabs.chunkCompare.classList.add('active');
      const warn = `<div class="warning-box" style="padding:12px;border:1px solid #fbbf24;background:#fffbeb;color:#92400e;border-radius:8px;">`
                 + `無法進入"分塊對比"：當前記錄的原文分塊數量與譯文分塊數量不一致，或缺少分塊資訊。`
                 + `<br>請先檢視"僅OCR/僅翻譯"，或重新生成分塊以使用對比功能。`
                 + `</div>`;
      document.getElementById('tabContent').innerHTML = warn;
      if (typeof window.refreshTocList === 'function') window.refreshTocList();
      renderingTab = null;
      console.timeEnd && console.timeEnd('[效能] showTab_總渲染');
      return;
    }
  }

  if(tab === 'ocr') {
    DOM_CACHE.tabs.ocr.classList.add('active');
    contentContainerId = 'ocr-content-wrapper';
    let ocrText = data.ocr || '';
    // 效能測試斷點 - OCR渲染
    console.time('[效能] OCR分批渲染');
    html = `<h3>OCR內容</h3><div id="${contentContainerId}" class="markdown-body content-wrapper"></div>`;
  } else if(tab === 'translation') {
    DOM_CACHE.tabs.translation.classList.add('active');
    contentContainerId = 'translation-content-wrapper';
    html = `<h3>翻譯內容</h3><div id="${contentContainerId}" class="markdown-body content-wrapper"></div>`;
    console.time('[效能] 翻譯分批渲染');
  } else if (tab === 'pdf-compare') {
    // ========== MinerU PDF 對照檢視 ==========
    if (DOM_CACHE.tabs.pdfCompare) DOM_CACHE.tabs.pdfCompare.classList.add('active');

    // 隱藏頂部區域以獲得更大空間 - 使用快取
    if (DOM_CACHE.layout.title) DOM_CACHE.layout.title.style.display = 'none';
    if (DOM_CACHE.layout.meta) DOM_CACHE.layout.meta.style.display = 'none';
    if (DOM_CACHE.layout.tabsContainer) DOM_CACHE.layout.tabsContainer.style.display = 'none';

    // 驗證必要資料
    if (!data.metadata || !data.metadata.originalPdfBase64 || !data.metadata.contentListJson || !data.metadata.translatedContentList) {
      const warn = `<div class="warning-box" style="padding:12px;border:1px solid #fbbf24;background:#fffbeb;color:#92400e;border-radius:8px;">`
                 + `無法進入"PDF對照"：缺少必要的 MinerU 結構化翻譯資料。`
                 + `</div>`;
      document.getElementById('tabContent').innerHTML = warn;
      if (typeof window.refreshTocList === 'function') window.refreshTocList();
      renderingTab = null;
      console.timeEnd && console.timeEnd('[效能] showTab_總渲染');
      return;
    }

    // 設定 HTML 容器
    document.getElementById('tabContent').innerHTML = '<div id="pdf-compare-container"></div>';

    // 建立並初始化 PDF 對照檢視
    (async () => {
      try {
        // 清理之前的例項
        if (window.pdfCompareViewInstance) {
          window.pdfCompareViewInstance.destroy();
        }

        // 建立新例項
        const pdfCompareView = new PDFCompareView();
        window.pdfCompareViewInstance = pdfCompareView;

        console.log('[PDFCompareView] 開始初始化 PDF 對照檢視');
        await pdfCompareView.initialize(
          data.metadata.originalPdfBase64,
          data.metadata.contentListJson,
          data.metadata.translatedContentList,
          data.metadata.layoutJson  // 傳入 layoutJson
        );

        // 為多輪檢索生成chunks（如果還沒有的話）
        if (!data.ocrChunks || data.ocrChunks.length === 0) {
          console.log('[PDFCompareView] 檢測到缺少chunks資料，嘗試從contentListJson生成');

          if (typeof generateChunksFromContentList === 'function') {
            const chunks = generateChunksFromContentList(
              data.metadata.contentListJson,
              data.metadata.translatedContentList
            );
            window.data.ocrChunks = chunks.ocrChunks;
            window.data.translatedChunks = chunks.translatedChunks;
            console.log(`[PDFCompareView] 已生成 ${chunks.ocrChunks.length} 個chunks用於多輪檢索`);
          } else {
            // 備用方案：從完整文字生成chunks
            if (data.ocr && typeof generateChunksFromFullText === 'function') {
              const chunks = generateChunksFromFullText(data.ocr, data.translation);
              window.data.ocrChunks = chunks.ocrChunks;
              window.data.translatedChunks = chunks.translatedChunks;
              console.log(`[PDFCompareView] 使用備用方案從完整文字生成了 ${chunks.ocrChunks.length} 個chunks`);
            } else {
              console.warn('[PDFCompareView] 無法生成chunks，多輪檢索功能將受限');
            }
          }
        } else {
          console.log(`[PDFCompareView] 使用現有的 ${data.ocrChunks.length} 個chunks`);
        }

        await pdfCompareView.render('pdf-compare-container');
        console.log('[PDFCompareView] PDF 對照檢視渲染完成');
      } catch (error) {
        console.error('[PDFCompareView] 渲染失敗:', error);
        document.getElementById('pdf-compare-container').innerHTML = `
          <div class="error-box" style="padding:12px;border:1px solid #ef4444;background:#fef2f2;color:#991b1b;border-radius:8px;">
            PDF 對照檢視載入失敗: ${error.message}
          </div>
        `;
      } finally {
        renderingTab = null;
        console.timeEnd && console.timeEnd('[效能] showTab_總渲染');
      }
    })();

    // 提前返回，因為是非同步渲染
    if (typeof window.refreshTocList === 'function') window.refreshTocList();
    return;
  } else if (tab === 'chunk-compare') {
    // 效能監控：記錄分塊對比開始時間
    window.chunkCompareStartTime = performance.now();
    console.log(`[效能] 開始渲染分塊對比，總塊數: ${data.ocrChunks ? data.ocrChunks.length : 0}`);

    // ========== 超長文字降級策略開關 ==========
    (function computeLargeDocFlag(){
      const LARGE_TEXT_THRESHOLD = 120000; // 8萬字閾值
      let totalLen = 0;
      try {
        if (Array.isArray(data.ocrChunks)) {
          for (let i = 0; i < data.ocrChunks.length; i++) totalLen += (data.ocrChunks[i] ? data.ocrChunks[i].length : 0);
        }
        if (Array.isArray(data.translatedChunks)) {
          for (let i = 0; i < data.translatedChunks.length; i++) totalLen += (data.translatedChunks[i] ? data.translatedChunks[i].length : 0);
        }
      } catch(e) { /* ignore */ }
      window.disableEqualizeForLargeDoc = totalLen > LARGE_TEXT_THRESHOLD;
      console.log(`[Chunk-Compare] 文字總長度=${totalLen}，等高降級=${window.disableEqualizeForLargeDoc}`);
      // 記錄用於後續清理的塊數量
      try { window.__lastChunkCompareTotalBlocks = (Array.isArray(data.ocrChunks) ? data.ocrChunks.length : 0); } catch(e) { window.__lastChunkCompareTotalBlocks = 0; }
    })();

    // window.globalCurrentContentIdentifier = ''; // 已在函式開頭正確設定
    DOM_CACHE.tabs.chunkCompare.classList.add('active');
    if (data.ocrChunks && data.ocrChunks.length > 0 && data.translatedChunks && data.translatedChunks.length === data.ocrChunks.length) {
        // 使用最佳化器進行分塊對比渲染
        if (false && window.ChunkCompareOptimizer && window.ChunkCompareOptimizer.instance) {
            console.log('[效能] 使用最佳化後的分塊對比渲染器');
            html = window.ChunkCompareOptimizer.instance.optimizeChunkComparison(
                data.ocrChunks,
                data.translatedChunks,
                {
                    images: data.images,
                    isOriginalFirst: window.isOriginalFirstInChunkCompare !== false
                }
            );
        } else {
            // 回退到原有渲染邏輯
            console.log('[效能] 使用舊版分塊對比渲染');
            html = `
              <div class="chunk-compare-title-bar">
                <h3>分塊對比</h3>
                <button id="swap-chunks-btn" title="切換原文/譯文位置">⇆</button>
              </div>
              <div class="chunk-compare-container">
            `;
            // 繼續使用原有的渲染邏輯...
        }
        // 強制走舊版渲染邏輯（禁用最佳化器路徑）
        if (true) {
        /**
         * 解析Markdown文字為邏輯塊陣列，主要基於標題進行分割。
         * 程式碼塊 (```...```) 會被視為單個塊的一部分，不會被分割。
         * @param {string} md - Markdown文字。
         * @returns {Array<Object>} 每個物件包含 `{ content: string }`。
         */
        function parseMarkdownBlocks(md) {
          const lines = (md || '').split(/\r?\n/);
          const blocks = [];
          let buffer = [];
          let inCode = false;
          let isFirstBlock = true;
          function flush() {
            if (buffer.length) {
              blocks.push({ content: buffer.join('\n') });
              buffer = [];
            }
          }
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*```/.test(line)) { // 程式碼塊
              inCode = !inCode;
              buffer.push(line);
              continue;
            }
            if (inCode) {
              buffer.push(line);
              continue;
            }
            if (/^\s*#/.test(line)) { // 標題作為新分塊的起點
              if (!isFirstBlock) flush();
              isFirstBlock = false;
              buffer.push(line);
              continue;
            }
            // 普通內容、列表、空行等都合併到當前塊
            buffer.push(line);
          }
          flush();
          return blocks;
        }
        /**
         * 對齊兩組Markdown邏輯塊，用於並排顯示。
         * 簡單地按索引逐個配對，如果某一組塊少，則對應位置為空字串。
         * @param {Array<Object>} blocks1 - 第一組塊。
         * @param {Array<Object>} blocks2 - 第二組塊。
         * @returns {Array<Array<string>>} 每個內部陣列包含兩個字串 `[block1_content, block2_content]`。
         */
        function alignBlocks(blocks1, blocks2) {
          // 簡單按型別和順序對齊
          const maxLen = Math.max(blocks1.length, blocks2.length);
          const aligned = [];
          for (let i = 0; i < maxLen; i++) {
            aligned.push([
              blocks1[i] ? blocks1[i].content : '',
              blocks2[i] ? blocks2[i].content : ''
            ]);
          }
          return aligned;
        }
        /**
         * 渲染單個OCR塊和其對應的翻譯塊的對齊檢視，支援分層結構。
         * - 它首先使用 `parseMarkdownBlocks` 將OCR和翻譯文字分割成小塊（基於標題）。
         * - 然後使用 `alignBlocks` 對齊這些小塊。
         * - 為每個對齊的小塊對生成並排的HTML結構，用於顯示原文和譯文。
         * - 提供工具列按鈕，用於切換顯示模式（對比、僅原文、僅譯文）、複製整塊內容以及導航到上下塊。
         * - 原始塊內容儲存在 `window.blockRawContent_[blockIndex]` 中，供複製功能使用。
         *
         * @param {string} ocrChunk - OCR文字塊。
         * @param {string} translatedChunk - 對應的翻譯文字塊。
         * @param {Array<Object>} images - 與此文件關聯的圖片資料。
         * @param {number} blockIndex - 當前大塊在整個文件分塊中的索引。
         * @param {number} totalBlocks - 文件分塊的總數。
         * @returns {string} 生成的HTML字串，用於顯示對齊的塊內容。
         */
        function renderLevelAlignedFlex(ocrChunk, translatedChunk, images, blockIndex, totalBlocks) {
          // 效能最佳化：快取解析結果避免重複計算
          const cacheKey = `${blockIndex}_${ocrChunk.length}_${translatedChunk.length}`;
          if (window.chunkParseCache && window.chunkParseCache[cacheKey]) {
            const cachedResult = window.chunkParseCache[cacheKey];
            const ocrBlocks = cachedResult.ocrBlocks;
            const transBlocks = cachedResult.transBlocks;
            const aligned = cachedResult.aligned;
            let showMode = window[`showMode_block_${blockIndex}`] || 'both';

            // 使用快取的解析結果渲染HTML
            return renderAlignedHTML(ocrBlocks, transBlocks, aligned, images, blockIndex, totalBlocks, showMode);
          }

          const ocrBlocks = parseMarkdownBlocks(ocrChunk);
          const transBlocks = parseMarkdownBlocks(translatedChunk);
          const aligned = alignBlocks(ocrBlocks, transBlocks);

          // 快取解析結果
          if (!window.chunkParseCache) window.chunkParseCache = {};
          window.chunkParseCache[cacheKey] = { ocrBlocks, transBlocks, aligned };

          let showMode = window[`showMode_block_${blockIndex}`] || 'both';
          return renderAlignedHTML(ocrBlocks, transBlocks, aligned, images, blockIndex, totalBlocks, showMode);
        }

        /**
         * 渲染對齊後的HTML內容
         */
        function renderAlignedHTML(ocrBlocks, transBlocks, aligned, images, blockIndex, totalBlocks, showMode) {
          // ========== 輔助：媒體與段落對齊增強 ==========
          function normalizeHtml(html) {
            return (html || '')
              .replace(/\s+/g, ' ')
              .replace(/\u00A0/g, ' ')
              .trim();
          }
          function extractFirstMatch(html, regex) {
            const m = (html || '').match(regex);
            if (!m) return { match: null, rest: html };
            const before = html.slice(0, m.index);
            const after = html.slice(m.index + m[0].length);
            return { match: m[0], rest: before + after };
          }
          function extractFirstTable(html) {
            // 支援 HTML 表格；Markdown 表格在本階段不易可靠識別，先處理 HTML
            const res = extractFirstMatch(html, /<table[\s\S]*?<\/table>/i);
            return { table: res.match, rest: res.rest };
          }
          function extractFirstImage(html) {
            // 支援 <img> 或 markdown 圖片
            const imgHtml = extractFirstMatch(html, /<img\b[\s\S]*?>/i);
            if (imgHtml.match) return { image: imgHtml.match, rest: imgHtml.rest };
            const mdImg = extractFirstMatch(html, /!\[[^\]]*\]\([^\)]+\)/);
            return { image: mdImg.match, rest: mdImg.rest };
          }
          function isSameImage(imgA, imgB) {
            if (!imgA || !imgB) return false;
            const srcA = (imgA.match(/src\s*=\s*"([^"]+)"/) || [])[1] || (imgA.match(/\]\(([^\)]+)\)/) || [])[1];
            const srcB = (imgB.match(/src\s*=\s*"([^"]+)"/) || [])[1] || (imgB.match(/\]\(([^\)]+)\)/) || [])[1];
            if (!srcA || !srcB) return false;
            return normalizeHtml(srcA) === normalizeHtml(srcB);
          }
          function areTablesSimilar(tblA, tblB) {
            if (!tblA || !tblB) return false;
            const a = normalizeHtml(tblA.replace(/<thead[\s\S]*?<\/thead>/ig, '').replace(/<tbody[\s\S]*?<\/tbody>/ig, '').replace(/<[^>]+>/g, ''));
            const b = normalizeHtml(tblB.replace(/<thead[\s\S]*?<\/thead>/ig, '').replace(/<tbody[\s\S]*?<\/tbody>/ig, '').replace(/<[^>]+>/g, ''));
            if (!a || !b) return false;
            const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
            return lenRatio >= 0.7;
          }
          function splitParagraphs(text) {
            return (text || '')
              .split(/\n{2,}/)
              .map(s => s.trim())
              .filter(Boolean);
          }

          // 統一去掉段落首尾多餘空格/空行，避免不可見換行導致高度不一致
          function stripEdgeWhitespace(md) {
            if (!md) return md;
            // 標準化不可見空白（NBSP、零寬字元）
            md = md.replace(/\u00A0/g, ' '); // NBSP → 普通空格
            md = md.replace(/[\u200B-\u200D\uFEFF]/g, ''); // 零寬空白
            md = md.replace(/^\uFEFF/, ''); // BOM
            md = md.replace(/^[\s\t\r\n]+/, '');    // 開頭空白/換行
            md = md.replace(/[\s\t\r\n]+$/, '');    // 結尾空白/換行
            // 再次清理尾隨 NBSP（有的瀏覽器不把 NBSP 視為 \s）
            md = md.replace(/\u00A0+$/, '');
            return md;
          }

          // 判斷是否包含表格語法（markdown 管道表格或已渲染 HTML 表格）
          function containsTableSyntax(src) {
            if (!src) return false;
            if (/<table\b/i.test(src)) return true; // 已渲染 HTML 表格
            // 僅當“塊的起始位置”就是 Markdown 表格表頭，才認為是表格
            const lines = src.split(/\n/).map(l => (l || '').trim());
            // 找到首個非空行
            let i = 0; while (i < lines.length && lines[i] === '') i++;
            if (i >= lines.length - 1) return false;
            const a = lines[i];
            // 找到表頭後的首個非空行
            let j = i + 1; while (j < lines.length && lines[j] === '') j++;
            if (j >= lines.length) return false;
            const b = lines[j];
            const looksLikeHeader = /^\|.*\|$/.test(a);
            const looksLikeDivider = /^\|\s*:?[-]{2,}.*\|$/.test(b);
            return looksLikeHeader && looksLikeDivider;
          }

          // ========== 新增：對比模式“軟換行” ===========
          function softWrapLongFormulasInCompare(container) {
            if (!container || !window.katex) return;
            const blocks = container.querySelectorAll('.align-content .katex-block');
            blocks.forEach(function(el){
              try {
                const parent = el.parentElement;
                const cw = parent ? parent.clientWidth : 0;
                const rect = el.getBoundingClientRect();
                const w = rect.width || 0;
                const tex = el.getAttribute('data-original-text') || '';
                if (!tex || /\\begin\{|\\\\\\\n/.test(tex)) return; // 已有環境/顯式換行不處理
                if (cw > 0 && w > cw * 1.05) {
                  const wrapped = buildWrappedTeX(tex, Math.max(48, Math.floor(cw / 7)));
                  try {
                    const html = katex.renderToString(wrapped, { displayMode: true, throwOnError: true, strict: 'ignore', output: 'html' });
                    el.innerHTML = html;
                  } catch (e) { /* ignore */ }
                }
              } catch (e) { /* ignore */ }
            });
          }

          function buildWrappedTeX(tex, maxLen) {
            const src = String(tex || '').replace(/\s+/g, ' ').trim();
            if (/\\begin\{|\\end\{|aligned|matrix|cases|array/.test(src)) return src;
            const hasEq = /=/.test(src);
            const parts = [];
            let buf = '';
            let depthBrace = 0;
            for (let i = 0; i < src.length; i++) {
              const ch = src[i];
              if (ch === '{') depthBrace++;
              if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
              buf += ch;
              if (depthBrace === 0 && (ch === ',' || ch === ';' || ch === '+' || ch === '-' || ch === '=')) {
                if (buf.length >= maxLen) { parts.push(buf.trim()); buf = ''; }
              }
              if (buf.length >= maxLen * 1.5) { parts.push(buf.trim()); buf = ''; }
            }
            if (buf.trim()) parts.push(buf.trim());
            if (parts.length <= 1) return src;
            const lines = parts.map(function(line){ return hasEq ? line.replace(/=\s*/, '&= ') : line; });
            return `\\begin{aligned} ${lines.join(' \\ ')} \\ \\end{aligned}`;
          }

          // 針對整塊層級做一次媒體“拿出來”與對齊增強
          let oWhole = (ocrBlocks || []).map(b => b.content).join('\n\n');
          let tWhole = (transBlocks || []).map(b => b.content).join('\n\n');

          let hoistedParts = [];

          // 表格不再抽出合併，保持左右對齊並在開屏時逐對等高微調

          // 3) 圖片相同則抽出一個顯示
          const exImgO = extractFirstImage(oWhole);
          const exImgT = extractFirstImage(tWhole);
          if (exImgO.image && exImgT.image && isSameImage(exImgO.image, exImgT.image)) {
            hoistedParts.push({ type: 'merged-image', html: exImgO.image });
            oWhole = exImgO.rest.trim();
            tWhole = exImgT.rest.trim();
          }

          // 4) 對剩餘內容嘗試逐段落對齊（僅當段落數一致）
          let paragraphPairs = null;
          const parasO = splitParagraphs(oWhole);
          const parasT = splitParagraphs(tWhole);
          if (parasO.length > 0 && parasO.length === parasT.length) {
            paragraphPairs = parasO.map((p, i) => [p, parasT[i]]);
          }

          // 在分塊對比內部也嘗試使用自定義渲染器
          // 注意：這裡的 annotations 應該是整個文件的，contentIdentifier 需要根據當前塊是原文還是譯文來確定
          // 為了簡化，我們暫時假設分塊對比中的內容不直接參與這種精細的預標註，
          // 或者需要更復雜的邏輯來傳遞正確的 contentIdentifier
          // MODIFIED: Pass empty array for annotations in chunk-compare mode to disable highlights/annotations
          const annotationsForChunkRender = [];
          const ocrRenderer = createCustomMarkdownRenderer(annotationsForChunkRender, 'ocr', MarkdownProcessor.renderWithKatexFailback);
          const transRenderer = createCustomMarkdownRenderer(annotationsForChunkRender, 'translation', MarkdownProcessor.renderWithKatexFailback);

          // 整塊複製按鈕
          let html = `
            <div class="block-toolbar" data-block-toolbar="${blockIndex}">
              <div class="block-toolbar-left">
                <span class="block-mode-btn ${showMode === 'both' ? 'active' : ''}" data-mode="both" data-block="${blockIndex}">對比</span>
                <span class="block-mode-btn ${showMode === 'ocr' ? 'active' : ''}" data-mode="ocr" data-block="${blockIndex}">原文</span>
                <span class="block-mode-btn ${showMode === 'trans' ? 'active' : ''}" data-mode="trans" data-block="${blockIndex}">譯文</span>
                <button class="block-copy-btn" data-block="${blockIndex}" title="複製本塊內容">複製本塊</button>
              </div>
              <div class="block-toolbar-right">
                ${blockIndex > 0 ? `<button class="block-nav-btn" data-dir="prev" data-block="${blockIndex}" title="上一段">↑</button>` : ''}
                ${blockIndex < totalBlocks-1 ? `<button class="block-nav-btn" data-dir="next" data-block="${blockIndex}" title="下一段">↓</button>` : ''}
              </div>
            </div>
          `;

          // 效能最佳化：批次構建HTML字串（按序：先 hoisted，再對齊對，再fallback）
          const alignedHTML = [];
          // 先渲染抽出的媒體（圖片單列）
          if (hoistedParts.length > 0) {
            hoistedParts.forEach((part, idx) => {
              if (part.type === 'merged-image') {
                const rendered = (window.MarkdownProcessor && window.MarkdownProcessor.renderWithKatexFailback)
                  ? window.MarkdownProcessor.renderWithKatexFailback(window.MarkdownProcessor.safeMarkdown(part.html, images))
                  : part.html;
                alignedHTML.push(`
                  <div class="align-flex block-flex block-flex-${blockIndex} block-mode-both" data-block="${blockIndex}" data-align-index="hoisted-${idx}">
                    <div class="align-block" style="flex:1 1 100%">
                      <div class="align-title"><span>圖片</span></div>
                      <div class="align-content markdown-body">${rendered}</div>
                    </div>
                  </div>
                `);
              }
            });
          }

          // 再渲染逐段落對齊（若可用）
          if (paragraphPairs) {
            for (let i = 0; i < paragraphPairs.length; i++) {
              const [pO, pT] = paragraphPairs[i];
              const isTablePair = containsTableSyntax(pO) && containsTableSyntax(pT);
              const titleLeft = isTablePair ? '表格' : '原文';
              const titleRight = isTablePair ? '表格' : '譯文';
              alignedHTML.push(`
                <div class="align-flex block-flex block-flex-${blockIndex} ${isTablePair ? 'table-pair ' : ''}${showMode==='ocr'?'block-mode-ocr-only':showMode==='trans'?'block-mode-trans-only':'block-mode-both'}" data-block="${blockIndex}" data-align-index="para-${i}">
                  <div class="align-block align-block-ocr">
                    <div class="align-title">
                      <span>${titleLeft}</span>
                      <div class="align-actions">
                        <button class="block-struct-copy-btn block-icon-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${i}" title="複製原文結構">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="block-edit-btn block-icon-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${i}" title="編輯此段（僅供預覽）">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                        </button>
                        <button class="block-edit-reset-btn block-icon-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${i}" title="重置為原文" style="display:none;">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        </button>
                      </div>
                    </div>
                    <div class="align-content markdown-body" data-raw-markdown="${encodeURIComponent(stripEdgeWhitespace(pO))}">${MarkdownProcessor.renderWithKatexFailback(MarkdownProcessor.safeMarkdown(stripEdgeWhitespace((()=>{const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${i}_ocr`; const ov = localStorage.getItem(key); return ov ? ov : pO;})()), images), isOriginalFirstInChunkCompare ? ocrRenderer : transRenderer)}</div>
                    <div class="align-edit-panel" style="display:none;">
                      <textarea class="align-edit-area" style="width:100%;min-height:120px;box-sizing:border-box;"></textarea>
                      <div class="align-edit-actions" style="margin-top:6px;display:flex;gap:8px;">
                        <button class="align-edit-save" data-block="${blockIndex}" data-type="ocr" data-idx="para-${i}">儲存</button>
                        <button class="align-edit-cancel" data-block="${blockIndex}" data-type="ocr" data-idx="para-${i}">取消</button>
                      </div>
                    </div>
                  </div>
                  <div class="splitter" title="拖動調整比例"></div>
                  <div class="align-block align-block-trans">
                    <div class="align-title">
                      <span>${titleRight}</span>
                      <div class="align-actions">
                        <button class="block-struct-copy-btn block-icon-btn" data-block="${blockIndex}" data-type="trans" data-idx="${i}" title="複製譯文結構">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="block-edit-btn block-icon-btn" data-block="${blockIndex}" data-type="trans" data-idx="${i}" title="編輯此段（僅供預覽）">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                        </button>
                        <button class="block-edit-reset-btn block-icon-btn" data-block="${blockIndex}" data-type="trans" data-idx="${i}" title="重置為原文" style="display:none;">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        </button>
                      </div>
                    </div>
                    <div class="align-content markdown-body" data-raw-markdown="${encodeURIComponent(stripEdgeWhitespace(pT))}">${MarkdownProcessor.renderWithKatexFailback(MarkdownProcessor.safeMarkdown(stripEdgeWhitespace((()=>{const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${i}_trans`; const ov = localStorage.getItem(key); return ov ? ov : pT;})()), images), isOriginalFirstInChunkCompare ? transRenderer : ocrRenderer)}</div>
                    <div class="align-edit-panel" style="display:none;">
                      <textarea class="align-edit-area" style="width:100%;min-height:120px;"></textarea>
                      <div class="align-edit-actions" style="margin-top:6px;display:flex;gap:8px;">
                        <button class="align-edit-save" data-block="${blockIndex}" data-type="trans" data-idx="para-${i}">儲存</button>
                        <button class="align-edit-cancel" data-block="${blockIndex}" data-type="trans" data-idx="para-${i}">取消</button>
                      </div>
                    </div>
                  </div>
                </div>
              `);
            }
          } else {
            // 最後 fallback：使用原有的 aligned 對
            for (let i = 0; i < aligned.length; i++) {
              const isTablePair = containsTableSyntax(aligned[i][0]) && containsTableSyntax(aligned[i][1]);
              const titleLeft = isTablePair ? '表格' : '原文';
              const titleRight = isTablePair ? '表格' : '譯文';
              alignedHTML.push(`
                <div class="align-flex block-flex block-flex-${blockIndex} ${isTablePair ? 'table-pair ' : ''}${showMode==='ocr'?'block-mode-ocr-only':showMode==='trans'?'block-mode-trans-only':'block-mode-both'}" data-block="${blockIndex}" data-align-index="${i}">
                   <div class="align-block align-block-ocr">
                     <div class="align-title">
                      <span>${titleLeft}</span>
                      <div class="align-actions">
                        <button class="block-struct-copy-btn block-icon-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${i}" title="複製原文結構">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="block-edit-btn block-icon-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${i}" title="編輯此段（僅供預覽）">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                        </button>
                        <button class="block-edit-reset-btn block-icon-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${i}" title="重置為原文" style="display:none;">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        </button>
                      </div>
                     </div>
                    <div class="align-content markdown-body" data-raw-markdown="${encodeURIComponent(stripEdgeWhitespace(aligned[i][0]))}">${MarkdownProcessor.renderWithKatexFailback(MarkdownProcessor.safeMarkdown(stripEdgeWhitespace((()=>{const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${i}_ocr`; const ov = localStorage.getItem(key); return ov ? ov : aligned[i][0];})()), images), isOriginalFirstInChunkCompare ? ocrRenderer : transRenderer)}</div>
                    <div class="align-edit-panel" style="display:none;">
                      <textarea class="align-edit-area" style="width:100%;min-height:120px;"></textarea>
                      <div class="align-edit-actions" style="margin-top:6px;display:flex;gap:8px;">
                        <button class="align-edit-save" data-block="${blockIndex}" data-type="ocr" data-idx="${i}">儲存</button>
                        <button class="align-edit-cancel" data-block="${blockIndex}" data-type="ocr" data-idx="${i}">取消</button>
                      </div>
                    </div>
                  </div>
                  <div class="splitter" title="拖動調整比例"></div>
                   <div class="align-block align-block-trans">
                     <div class="align-title">
                      <span>${titleRight}</span>
                      <div class="align-actions">
                        <button class="block-struct-copy-btn block-icon-btn" data-block="${blockIndex}" data-type="trans" data-idx="${i}" title="複製譯文結構">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="block-edit-btn block-icon-btn" data-block="${blockIndex}" data-type="trans" data-idx="${i}" title="編輯此段（僅供預覽）">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                        </button>
                        <button class="block-edit-reset-btn block-icon-btn" data-block="${blockIndex}" data-type="trans" data-idx="${i}" title="重置為原文" style="display:none;">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        </button>
                      </div>
                     </div>
                    <div class="align-content markdown-body" data-raw-markdown="${encodeURIComponent(stripEdgeWhitespace(aligned[i][1]))}">${MarkdownProcessor.renderWithKatexFailback(MarkdownProcessor.safeMarkdown(stripEdgeWhitespace((()=>{const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${i}_trans`; const ov = localStorage.getItem(key); return ov ? ov : aligned[i][1];})()), images), isOriginalFirstInChunkCompare ? transRenderer : ocrRenderer)}</div>
                    <div class="align-edit-panel" style="display:none;">
                      <textarea class="align-edit-area" style="width:100%;min-height:120px;"></textarea>
                      <div class="align-edit-actions" style="margin-top:6px;display:flex;gap:8px;">
                        <button class="align-edit-save" data-block="${blockIndex}" data-type="trans" data-idx="${i}">儲存</button>
                        <button class="align-edit-cancel" data-block="${blockIndex}" data-type="trans" data-idx="${i}">取消</button>
                      </div>
                    </div>
                  </div>
                </div>
              `);
            }
          }

          html += alignedHTML.join('');

          // 記錄原始內容，供複製用
          window[`blockRawContent_${blockIndex}`] = aligned;
          return html;
        }

        // 恢復原始渲染邏輯：渲染每個分塊，增加唯一id
        for (let i = 0; i < data.ocrChunks.length; i++) {
            const ocrChunk = data.ocrChunks[i] || '';
            const translatedChunk = data.translatedChunks[i] || '';
            let blockHtmlToRender;
            let outerBlockTitle;

            if (isOriginalFirstInChunkCompare) {
                // 當原文在左側時，呼叫 renderLevelAlignedFlex(原文, 譯文)
                // window[`blockRawContent_${i}`] 將儲存 [原文子塊, 譯文子塊]
                blockHtmlToRender = renderLevelAlignedFlex(ocrChunk, translatedChunk, data.images, i, data.ocrChunks.length);
                outerBlockTitle = `原文塊 ${i+1}`;
            } else {
                // 當譯文在左側時，呼叫 renderLevelAlignedFlex(譯文, 原文)
                // window[`blockRawContent_${i}`] 將儲存 [譯文子塊, 原文子塊]
                blockHtmlToRender = renderLevelAlignedFlex(translatedChunk, ocrChunk, data.images, i, data.ocrChunks.length);
                outerBlockTitle = `譯文塊 ${i+1}`; // 標題也反映左側內容
            }
            html += `<div class="chunk-pair">`;
            html += `<div id="block-${i}" class="block-outer">`; // id 用於導航
            html += `<h4>${outerBlockTitle}</h4>`;
            html += blockHtmlToRender;
            html += `</div></div>`;
        }
        // 綁定每個分塊的切換按鈕和導航按鈕事件
        setTimeout(() => {
          // 拖動分割條實現 - 使用CSS變數而不是直接設定樣式
          let ratio = window.chunkCompareRatio;
          if (typeof ratio !== 'number' || isNaN(ratio)) ratio = 0.5;
          window.chunkCompareRatio = ratio;

          function applyRatioToAll() {
            const currentRatio = window.chunkCompareRatio || 0.5;
            document.querySelectorAll('.align-flex').forEach(flex => {
              // 優先使用每對的等高比例
              if (flex.hasAttribute('data-equalized')) {
                const ratioSaved = parseFloat(flex.getAttribute('data-equalized'));
                if (isFinite(ratioSaved)) {
                  flex.style.setProperty('--ocr-ratio', (ratioSaved * 100) + '%');
                  flex.style.setProperty('--trans-ratio', ((1 - ratioSaved) * 100) + '%');
                  return;
                }
              }
              const hasTableOCR = !!flex.querySelector('.align-block-ocr table');
              const hasTableTRANS = !!flex.querySelector('.align-block-trans table');
              const anyTable = hasTableOCR || hasTableTRANS;
              // 表格對若未等高，臨時使用0.5；文字對使用全域
              const ratio = anyTable ? 0.5 : currentRatio;
              flex.style.setProperty('--ocr-ratio', (ratio * 100) + '%');
              flex.style.setProperty('--trans-ratio', ((1 - ratio) * 100) + '%');
            });
          }

          // 一次性、逐卡片的簡化等高（避免視口進入時抖動）：
          // 在當前版面基礎上，以 0.5 為初始，按 hL/(hL+hR) 估算每對的專屬比例，僅設定一次
          function equalizePairsOnce() {
            if (window.disableEqualizeForLargeDoc) {
              // 超長文字時跳過逐對等高，避免大量 reflow
              return;
            }
            const pairs = document.querySelectorAll('.align-flex');
            pairs.forEach(flex => {
              if (flex.hasAttribute('data-equalized')) return;
              const left = flex.querySelector('.align-block-ocr .align-content');
              const right = flex.querySelector('.align-block-trans .align-content');
              if (!left || !right) return;
              // 統一先設為 0.5 以獲得一致的初始測量
              flex.style.setProperty('--ocr-ratio', '50%');
              flex.style.setProperty('--trans-ratio', '50%');
              const hL = left.getBoundingClientRect().height;
              const hR = right.getBoundingClientRect().height;
              if (!isFinite(hL) || !isFinite(hR) || (hL + hR) === 0) return;
              let r = hL / (hL + hR);
              r = Math.max(0.3, Math.min(0.7, r));
              flex.setAttribute('data-equalized', String(r));
              flex.style.setProperty('--ocr-ratio', (r * 100) + '%');
              flex.style.setProperty('--trans-ratio', ((1 - r) * 100) + '%');
            });
          }
          // 超長文字時不對所有對齊對寫入比例，保留預設 50/50（避免全量 DOM 迴圈）
          if (!window.disableEqualizeForLargeDoc) {
            applyRatioToAll();
            // 簡化的一次性等高（無複驗、無視口觸發，避免抖動）
            try { equalizePairsOnce(); } catch {}
          }
          // 渲染後為對比區域的大公式做軟換行
          try {
            const container = document.querySelector('.chunk-compare-container');
            softWrapLongFormulasInCompare(container);
          } catch (e) { /* ignore */ }

          // 效能最佳化：快取DOM查詢結果
          const blockModeButtons = document.querySelectorAll('.block-mode-btn');
          const allSplitters = document.querySelectorAll('.splitter');
          const blockCopyButtons = document.querySelectorAll('.block-copy-btn');
          const blockStructCopyButtons = document.querySelectorAll('.block-struct-copy-btn');
          const blockNavButtons = document.querySelectorAll('.block-nav-btn');

          // 效能最佳化：使用事件委託減少事件監聽器數量
          const chunkCompareContainer = document.querySelector('.chunk-compare-container');
          if (chunkCompareContainer && !chunkCompareContainer.dataset.delegateSet) {
            // 為複製按鈕新增事件委託
            chunkCompareContainer.addEventListener('click', function(e) {
              // 段落編輯：進入編輯
              if (e.target.classList.contains('block-edit-btn') || e.target.closest('.block-edit-btn')) {
                const btn = e.target.closest('.block-edit-btn');
                const blockIndex = btn.dataset.block;
                const idx = btn.dataset.idx;
                const type = btn.dataset.type; // 'ocr' | 'trans'
                const flex = btn.closest('.align-block');
                const content = flex.querySelector('.align-content.markdown-body');
                const panel = flex.querySelector('.align-edit-panel');
                const textarea = panel && panel.querySelector('.align-edit-area');
                if (!content || !panel || !textarea) return;
                // 初始文案：優先已儲存覆蓋，其次 data-raw-markdown
                const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${idx}_${type}`;
                const saved = localStorage.getItem(key);
                const raw = decodeURIComponent(content.getAttribute('data-raw-markdown') || '') || '';
                textarea.value = saved || raw;
                // 讓編輯區域儘量佔滿當前卡片高度
                const h = Math.max(content.offsetHeight, 120);
                textarea.style.minHeight = h + 'px';
                content.style.display = 'none';
                panel.style.display = '';
                // 顯示重置按鈕（如果存在覆蓋）
                const resetBtn = flex.querySelector('.block-edit-reset-btn[data-block="'+blockIndex+'"][data-type="'+type+'"][data-idx="'+idx+'"]');
                if (resetBtn) resetBtn.style.display = saved ? '' : 'none';
                return;
              }
              // 段落編輯：儲存
              if (e.target.classList.contains('align-edit-save')) {
                const btn = e.target;
                const blockIndex = btn.dataset.block;
                const idx = btn.dataset.idx;
                const type = btn.dataset.type; // 'ocr' | 'trans'
                const block = btn.closest('.align-block');
                const content = block.querySelector('.align-content.markdown-body');
                const panel = block.querySelector('.align-edit-panel');
                const textarea = panel && panel.querySelector('.align-edit-area');
                if (!content || !panel || !textarea) return;
                const md = (textarea.value || '').trim();
                const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${idx}_${type}`;
                if (md) localStorage.setItem(key, md); else localStorage.removeItem(key);
                // 重新渲染該側
                try {
                  const imgs = (window.data && window.data.images) || [];
                  const html = window.MarkdownProcessor && window.MarkdownProcessor.renderWithKatexFailback
                    ? window.MarkdownProcessor.renderWithKatexFailback(window.MarkdownProcessor.safeMarkdown(md, imgs))
                    : md.replace(/\n/g, '<br>');
                  content.innerHTML = html;
                  content.setAttribute('data-raw-markdown', encodeURIComponent(md));
                } catch { content.textContent = md; }
                panel.style.display = 'none';
                content.style.display = '';
                // 顯示重置按鈕
                const resetBtn = block.querySelector('.block-edit-reset-btn[data-block="'+blockIndex+'"][data-type="'+type+'"][data-idx="'+idx+'"]');
                if (resetBtn) resetBtn.style.display = md ? '' : 'none';
                return;
              }
              // 段落編輯：取消
              if (e.target.classList.contains('align-edit-cancel')) {
                const btn = e.target;
                const block = btn.closest('.align-block');
                const content = block.querySelector('.align-content.markdown-body');
                const panel = block.querySelector('.align-edit-panel');
                if (!content || !panel) return;
                panel.style.display = 'none';
                content.style.display = '';
                return;
              }
              // 段落編輯：重置覆蓋
              if (e.target.classList.contains('block-edit-reset-btn')) {
                const btn = e.target;
                const blockIndex = btn.dataset.block;
                const idx = btn.dataset.idx;
                const type = btn.dataset.type;
                const key = `chunkOverride_${window.docIdForLocalStorage||'default'}_${blockIndex}_${idx}_${type}`;
                localStorage.removeItem(key);
                // 還原為原始 data-raw-markdown
                const block = btn.closest('.align-block');
                const content = block.querySelector('.align-content.markdown-body');
                const panel = block.querySelector('.align-edit-panel');
                if (content) {
                  const md = decodeURIComponent(content.getAttribute('data-raw-markdown') || '') || '';
                  try {
                    const imgs = (window.data && window.data.images) || [];
                    const html = window.MarkdownProcessor && window.MarkdownProcessor.renderWithKatexFailback
                      ? window.MarkdownProcessor.renderWithKatexFailback(window.MarkdownProcessor.safeMarkdown(md, imgs))
                      : md.replace(/\n/g, '<br>');
                    content.innerHTML = html;
                  } catch { content.textContent = md; }
                }
                if (panel) panel.style.display = 'none';
                if (content) content.style.display = '';
                // 隱藏重置按鈕
                btn.style.display = 'none';
                return;
              }
              if (e.target.classList.contains('block-copy-btn')) {
                // 複製按鈕邏輯保持不變，但透過事件委託觸發
                const btn = e.target;
                const blockIndex = btn.dataset.block;
                const rawBlockContent = window[`blockRawContent_${blockIndex}`];
                const currentMode = window[`showMode_block_${blockIndex}`] || 'both';

                // 複製邏輯保持原樣...
                if (rawBlockContent && Array.isArray(rawBlockContent)) {
                  let textToCopy = "";
                  let alertMessage = "";

                  if (currentMode === 'ocr') {
                    rawBlockContent.forEach(pair => {
                      const ocrText = isOriginalFirstInChunkCompare ? (pair && pair[0]) : (pair && pair[1]);
                      if (ocrText) textToCopy += ocrText + "\n\n";
                    });
                    textToCopy = textToCopy.trim();
                    alertMessage = `第 ${parseInt(blockIndex) + 1} 塊的 原文 已複製!`;
                  } else if (currentMode === 'trans') {
                    rawBlockContent.forEach(pair => {
                      const transText = isOriginalFirstInChunkCompare ? (pair && pair[1]) : (pair && pair[0]);
                      if (transText) textToCopy += transText + "\n\n";
                    });
                    textToCopy = textToCopy.trim();
                    alertMessage = `第 ${parseInt(blockIndex) + 1} 塊的 譯文 已複製!`;
                  } else {
                    rawBlockContent.forEach(pair => {
                      const ocrText = isOriginalFirstInChunkCompare ? (pair && pair[0]) : (pair && pair[1]);
                      const transText = isOriginalFirstInChunkCompare ? (pair && pair[1]) : (pair && pair[0]);
                      if (ocrText) textToCopy += "原文:\n" + ocrText + "\n\n";
                      if (transText) textToCopy += "譯文:\n" + transText + "\n\n";
                    });
                    textToCopy = textToCopy.trim();
                    alertMessage = `第 ${parseInt(blockIndex) + 1} 塊的 原文和譯文 已複製!`;
                  }

                  if (textToCopy) {
                    navigator.clipboard.writeText(textToCopy)
                      .then(() => alert(alertMessage))
                      .catch(err => {
                        console.error('複製失敗:', err);
                        alert('複製失敗，請檢視主控台。');
                      });
                  } else {
                    alert('沒有內容可複製。');
                  }
                } else {
                  alert('沒有內容可複製。');
                }
              }
            });

            chunkCompareContainer.dataset.delegateSet = 'true';
          }

          // 保留原有的獨立事件綁定（為了相容性）
          blockModeButtons.forEach(btn => {
            btn.onclick = function() {
              const blockIndex = this.dataset.block;
              const mode = this.dataset.mode;
              window[`showMode_block_${blockIndex}`] = mode;

              // 更新按鈕啟用狀態
              document.querySelectorAll(`.block-mode-btn[data-block="${blockIndex}"]`).forEach(b => {
                b.classList.remove('active');
              });
              this.classList.add('active');

              // 使用CSS類管理顯示模式，而不是直接操作樣式
              document.querySelectorAll(`.block-flex-${blockIndex}`).forEach(flexPair => {
                // 移除所有模式類
                flexPair.classList.remove('block-mode-ocr-only', 'block-mode-trans-only', 'block-mode-both');

                // 新增對應的模式類
                if (mode === 'ocr') {
                  flexPair.classList.add('block-mode-ocr-only');
                } else if (mode === 'trans') {
                  flexPair.classList.add('block-mode-trans-only');
                } else { // mode === 'both'
                  flexPair.classList.add('block-mode-both');
                  // 當切換回 both 模式時，重新應用拖動條的比例
                  applyRatioToAllFlexPairsInBlock(blockIndex);
                }
              });
            };
          });

          // 輔助函式：將當前拖動比例應用到指定blockIndex的所有flexPair
          function applyRatioToAllFlexPairsInBlock(blockIndexToUpdate) {
            const currentRatio = window.chunkCompareRatio || 0.5;
            document.querySelectorAll(`.block-flex-${blockIndexToUpdate}`).forEach(flex => {
              if (flex.hasAttribute('data-equalized')) {
                const ratioSaved = parseFloat(flex.getAttribute('data-equalized'));
                if (isFinite(ratioSaved)) {
                  flex.style.setProperty('--ocr-ratio', (ratioSaved * 100) + '%');
                  flex.style.setProperty('--trans-ratio', ((1 - ratioSaved) * 100) + '%');
                  return;
                }
              }
              const hasTableOCR = !!flex.querySelector('.align-block-ocr table');
              const hasTableTRANS = !!flex.querySelector('.align-block-trans table');
              const anyTable = hasTableOCR || hasTableTRANS;
              const ratio = anyTable ? 0.5 : currentRatio;
              flex.style.setProperty('--ocr-ratio', (ratio * 100) + '%');
              flex.style.setProperty('--trans-ratio', ((1 - ratio) * 100) + '%');
            });
          }

          // 初始化拖動比例應用到所有分塊的所有對比對
          // 確保在按鈕事件綁定之後，但在第一次渲染時就能正確設定
          if (document.querySelector('.align-flex')) { // 確保有可操作的元素
            const allBlockIndexes = new Set();
            document.querySelectorAll('[data-block]').forEach(el => allBlockIndexes.add(el.dataset.block));
            allBlockIndexes.forEach(idx => {
                if(window[`showMode_block_${idx}`] === undefined || window[`showMode_block_${idx}`] === 'both') {
                    applyRatioToAllFlexPairsInBlock(idx);
                }
            });
          }

          // 拖動分割條實現
          let draggingSplitterInfo = null; // {splitter, flexContainer, startX, initialOcrBasisPx}

          allSplitters.forEach(splitter => {
            splitter.onmousedown = function(e) {
              const flexContainer = e.target.closest('.align-flex');
              if (!flexContainer) return;
              const ocrBlock = flexContainer.querySelector('.align-block-ocr');
              if (!ocrBlock || getComputedStyle(ocrBlock).display === 'none') return; // 只在對比模式下拖動

              // 使用者手動操作該對比對，清除自動等高的固定比例標記
              if (flexContainer.hasAttribute('data-equalized')) {
                flexContainer.removeAttribute('data-equalized');
              }

              draggingSplitterInfo = {
                splitter: e.target,
                flexContainer: flexContainer,
                startX: e.clientX,
                initialOcrBasisPx: ocrBlock.offsetWidth
              };

              e.target.classList.add('active');
              // 使用CSS類而不是直接設定樣式
              document.body.classList.add('dragging-cursor');
              e.preventDefault();
            };
          });

          document.addEventListener('mousemove', function(e) {
            if (!draggingSplitterInfo) return;

            const { splitter, flexContainer, startX, initialOcrBasisPx } = draggingSplitterInfo;
            const ocrBlock = flexContainer.querySelector('.align-block-ocr');
            const transBlock = flexContainer.querySelector('.align-block-trans');
            if (!ocrBlock || !transBlock) return;

            const dx = e.clientX - startX;
            const containerWidth = flexContainer.offsetWidth;
            if (containerWidth === 0) return;

            let newOcrWidthPx = initialOcrBasisPx + dx;
            // 限制最小/最大寬度，例如總寬度的20%到80%
            const minWidthPx = containerWidth * 0.2;
            const maxWidthPx = containerWidth * 0.8;
            newOcrWidthPx = Math.max(minWidthPx, Math.min(newOcrWidthPx, maxWidthPx));

            const newOcrRatio = newOcrWidthPx / containerWidth;

            // 更新當前拖動的塊的比例
            flexContainer.style.setProperty('--ocr-ratio', (newOcrRatio * 100) + '%');
            flexContainer.style.setProperty('--trans-ratio', ((1 - newOcrRatio) * 100) + '%');

            // 僅更新當前對比對比例（取消聯動）
            draggingSplitterInfo.currentRatio = newOcrRatio;
          });

          document.addEventListener('mouseup', function() {
            if (draggingSplitterInfo) {
              draggingSplitterInfo.splitter.classList.remove('active');
              // 使用CSS類而不是直接設定樣式
              document.body.classList.remove('dragging-cursor');
              // 將當前對比對的最終比例寫入專屬 data-equalized，保持獨立
              try {
                const { flexContainer, currentRatio } = draggingSplitterInfo;
                if (flexContainer && typeof currentRatio === 'number' && isFinite(currentRatio)) {
                  flexContainer.setAttribute('data-equalized', String(currentRatio));
                  // 若之前有硬等高 min-height，拖動後移除，完全以使用者設定為準
                  const left = flexContainer.querySelector('.align-block-ocr .align-content');
                  const right = flexContainer.querySelector('.align-block-trans .align-content');
                  if (left) left.style.minHeight = '';
                  if (right) right.style.minHeight = '';
                }
              } catch {}
              draggingSplitterInfo = null;
            }
          });

          // ============= 智慧比例建議（僅預設比例、每文件一次） =============
          (function smartRatioBootstrap() {
            try {
              const docId = window.docIdForLocalStorage;
              if (!docId) return;
              const promptFlagKey = `chunkCompareSmartRatioPromptShown_${docId}`;
              const alreadyPrompted = localStorage.getItem(promptFlagKey) === 'true';
              // 若已有使用者自定義比例，或已彈過提示，則不再計算
              const savedRatioText = localStorage.getItem(`chunkCompareRatio_${docId}`);
              const hasCustomRatio = savedRatioText !== null && !isNaN(parseFloat(savedRatioText)) && parseFloat(savedRatioText) !== 0.5;
              if (alreadyPrompted || hasCustomRatio) return;

              // 延遲執行，等待列表 DOM 渲染完成
              setTimeout(() => maybeSuggestSmartRatio(docId, promptFlagKey), 800);
            } catch (e) { console.warn('smartRatioBootstrap error:', e); }
          })();

          // 等高工具：更穩的幀同步+測量、粗取樣+細化、困難對硬等高
          if (false) (function setupPairEqualization() {
            const docId = window.docIdForLocalStorage || 'default';
            window.__pairEqualizer = window.__pairEqualizer || {};
            const state = window.__pairEqualizer;

            const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            async function waitImages(el, ms=150) {
              const imgs = el.querySelectorAll('img');
              if (imgs.length === 0) { await new Promise(r=>setTimeout(r, ms)); return; }
              await Promise.race([
                new Promise(r=>setTimeout(r, ms)),
                Promise.all(Array.from(imgs).map(img=> new Promise(r=>{ if (img.complete) return r(); img.addEventListener('load', r, {once:true}); img.addEventListener('error', r, {once:true}); })))
              ]);
            }
            async function measureDiff(flex, leftEl, rightEl, ratio) {
              flex.style.setProperty('--ocr-ratio', (ratio * 100) + '%');
              flex.style.setProperty('--trans-ratio', ((1 - ratio) * 100) + '%');
              await raf2();
              const hL = leftEl.getBoundingClientRect().height;
              const hR = rightEl.getBoundingClientRect().height;
              return { diff: hL - hR, hL, hR };
            }
            async function equalizePair(flex) {
              try {
                if (flex.dataset.equalizedDone === 'true') return;
                const left = flex.querySelector('.align-block-ocr .align-content');
                const right = flex.querySelector('.align-block-trans .align-content');
                if (!left || !right) { flex.dataset.equalizedDone = 'true'; return; }
                if (flex.classList.contains('block-mode-ocr-only') || flex.classList.contains('block-mode-trans-only')) { return; }
                await waitImages(flex, 120);
                await raf2();
                const isTablePair = !!flex.querySelector('.align-block-ocr table') && !!flex.querySelector('.align-block-trans table');
                const coarse = [0.35,0.45,0.5,0.55,0.65];
                let best = 0.5, bestAbs = Infinity;
                for (const r of coarse) {
                  const m = await measureDiff(flex, left, right, r);
                  const a = Math.abs(m.diff);
                  if (a < bestAbs) { bestAbs = a; best = r; }
                }
                let low = Math.max(0.3, best - 0.1);
                let high = Math.min(0.7, best + 0.1);
                const tol = isTablePair ? 4 : 6;
                for (let i=0;i<(isTablePair?7:6);i++) {
                  const mid = (low+high)/2;
                  const m = await measureDiff(flex, left, right, mid);
                  const a = Math.abs(m.diff);
                  if (a < bestAbs) { bestAbs = a; best = mid; }
                  if (a <= tol) break;
                  if (m.diff > 0) { low = mid; } else { high = mid; }
                }
                // 複驗微調
                for (let step=0.04, k=0; k<3; k++, step*=0.5) {
                  const candidates = [best-step, best, best+step].map(r=> Math.max(0.3, Math.min(0.7, r)));
                  for (const r of candidates) {
                    const m = await measureDiff(flex, left, right, r);
                    const a = Math.abs(m.diff);
                    if (a < bestAbs) { bestAbs = a; best = r; }
                  }
                  if (bestAbs <= (isTablePair?2:3)) break;
                }
                // 困難對硬等高：誤差仍過大
                if (bestAbs > (isTablePair?4:6)) {
                  const last = await measureDiff(flex, left, right, best);
                  const target = Math.max(last.hL, last.hR);
                  left.style.minHeight = target + 'px';
                  right.style.minHeight = target + 'px';
                  flex.setAttribute('data-equalized', 'hard');
                } else {
                  flex.setAttribute('data-equalized', String(best));
                }
                flex.dataset.equalizedDone = 'true';
              } catch (e) { /* ignore per pair */ }
            }

            // 進入視口再等高（首屏優先）
            if (!state.observer) {
              state.observer = new IntersectionObserver(async entries => {
                for (const entry of entries) {
                  if (entry.isIntersecting) {
                    const flex = entry.target;
                    state.observer.unobserve(flex);
                    await equalizePair(flex);
                  }
                }
              }, { root: null, rootMargin: '200px', threshold: 0.1 });
            }
            document.querySelectorAll('.align-flex').forEach(flex => {
              // 清理因硬等高設定的 min-height（避免歷史殘留影響）
              const left = flex.querySelector('.align-block-ocr .align-content');
              const right = flex.querySelector('.align-block-trans .align-content');
              if (left) left.style.minHeight = '';
              if (right) right.style.minHeight = '';
              state.observer.observe(flex);
            });
          })();

          // 主控台除錯入口：window.forceSmartRatioPrompt({ resetPrompt:true, resetRatio:true })
          window.forceSmartRatioPrompt = function(opts={}) {
            try {
              const docId = window.docIdForLocalStorage;
              if (!docId) return console.warn('forceSmartRatioPrompt: missing docId');
              const promptFlagKey = `chunkCompareSmartRatioPromptShown_${docId}`;
              if (opts.resetPrompt) localStorage.removeItem(promptFlagKey);
              if (opts.resetRatio) localStorage.removeItem(`chunkCompareRatio_${docId}`);
              maybeSuggestSmartRatio(docId, promptFlagKey);
            } catch(e) { console.warn('forceSmartRatioPrompt error:', e); }
          };

          async function maybeSuggestSmartRatio(docId, promptFlagKey) {
            try {
              // 再次確認是否已經設定過比例
              const savedRatioText = localStorage.getItem(`chunkCompareRatio_${docId}`);
              const hasCustomRatio = savedRatioText !== null && !isNaN(parseFloat(savedRatioText)) && parseFloat(savedRatioText) !== 0.5;
              if (hasCustomRatio) return;

              if (!window.data || !Array.isArray(window.data.ocrChunks) || !Array.isArray(window.data.translatedChunks)) return;
              const total = Math.min(window.data.ocrChunks.length, window.data.translatedChunks.length);
              if (total === 0) return;

              // 選取最多15個候選塊（優先無圖、長度>=150）
              const candidates = selectCandidateBlockIndices(window.data.ocrChunks, window.data.translatedChunks, 15);
              // 除錯日誌
              try { console.log('[SmartRatio] candidates:', candidates); } catch {}
              // 需要至少2個候選塊
              if (candidates.length < 2) return;

              // 統一設定當前比率為0.5，確保測量一致
              window.chunkCompareRatio = 0.5;
              applyRatioToAll();

              const ratios = [];
              // 逐個確保載入完整塊並測量
              for (const idx of candidates) {
                const ok = await ensureChunkPresent(idx, 4000);
                if (!ok) continue;
                const loaded = await ensureChunkLoaded(idx, 6000);
                if (!loaded) continue;

                // 對新載入的flex對也應用0.5比例
                applyRatioToAll();

                const r = measureRecommendedRatioForBlock(idx);
                if (typeof r === 'number' && isFinite(r) && r > 0 && r < 1) {
                  ratios.push(r);
                }
                if (ratios.length >= 15) break;
              }

              // 至少需要2個有效測量結果
              if (ratios.length < 2) { try { console.log('[SmartRatio] Not enough measured ratios:', ratios); } catch {}; return; }
              // 剔除極端值：簡單去頭去尾（10%）；n>=6時各去1個
              ratios.sort((a,b)=>a-b);
              let trimmed = ratios.slice();
              if (ratios.length >= 6) {
                trimmed = ratios.slice(1, ratios.length - 1);
              }
              const avg = trimmed.reduce((s,v)=>s+v,0) / trimmed.length;
              let suggested = Math.max(0.3, Math.min(0.7, avg));
              try { console.log('[SmartRatio] ratios:', ratios, 'trimmed:', trimmed, 'avg:', avg, 'suggested:', suggested); } catch {}

              // 主動彈出視窗（每文件只彈一次）
              localStorage.setItem(promptFlagKey, 'true');
              const pct = Math.round(suggested * 100);
              const use = confirm(`已根據前 ${trimmed.length} 個塊估算出建議對比比例為 ${pct}%（原文）/ ${100-pct}%（譯文）。是否應用？`);
              if (use) {
                window.chunkCompareRatio = suggested;
                applyRatioToAll();
                localStorage.setItem(`chunkCompareRatio_${docId}`, String(suggested));
                if (typeof showNotification === 'function') {
                  showNotification(`已應用智慧比例：原文 ${pct}%`, 'success');
                }
              }
            } catch (e) {
              console.warn('maybeSuggestSmartRatio error:', e);
            }
          }

          function selectCandidateBlockIndices(ocrChunks, transChunks, limit) {
            const n = Math.min(ocrChunks.length, transChunks.length);
            const items = [];
            for (let i = 0; i < n; i++) {
              const o = ocrChunks[i] || '';
              const t = transChunks[i] || '';
              const lenOk = (o.length >= 150) && (t.length >= 150);
              const hasImg = /!\[[^\]]*\]\([^)]*\)|<img\b/i.test(o) || /!\[[^\]]*\]\([^)]*\)|<img\b/i.test(t);
              const hasMdTable = /(^|[\r\n])\s*\|.*\|/m.test(o) || /(^|[\r\n])\s*\|.*\|/m.test(t) || /<table\b/i.test(o) || /<table\b/i.test(t);
              items.push({ idx: i, lenOk, hasImg, hasMdTable });
            }
            // 過濾：長度達標
            const filtered = items.filter(it => it.lenOk && !it.hasMdTable);
            // 優先無圖，再有圖，再按索引
            filtered.sort((a,b)=> (a.hasImg===b.hasImg?0:(a.hasImg?1:-1)) || (a.idx-b.idx));
            return filtered.slice(0, limit).map(it=>it.idx);
          }

          function measureRecommendedRatioForBlock(blockIndex) {
            try {
              // 相容舊版與新版容器：優先舊版 #block-{i}，再嘗試 #chunk-{i} 或 data-chunk-index
              const container =
                document.getElementById(`block-${blockIndex}`) ||
                document.getElementById(`chunk-${blockIndex}`) ||
                document.querySelector(`.chunk-pair[data-chunk-index="${blockIndex}"]`);
              if (!container) return null;
              // 跳過包含表格的塊，避免對建議比例產生干擾
              if (container.querySelector('table')) return null;
              const ocrNodes = container.querySelectorAll('.align-block-ocr .align-content');
              const transNodes = container.querySelectorAll('.align-block-trans .align-content');
              if (ocrNodes.length === 0 || transNodes.length === 0) return null;
              let hOcr = 0, hTrans = 0;
              ocrNodes.forEach(n => { hOcr += n.getBoundingClientRect().height; });
              transNodes.forEach(n => { hTrans += n.getBoundingClientRect().height; });
              if (!isFinite(hOcr) || !isFinite(hTrans) || hOcr <= 0 || hTrans <= 0) return null;
              // 基於 h ~ A/r, 推導 r* = hOcr / (hOcr + hTrans)
              const r = hOcr / (hOcr + hTrans);
              return r;
            } catch (e) {
              return null;
            }
          }

          function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

          async function ensureChunkPresent(index, timeoutMs = 4000) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              const el = document.getElementById(`block-${index}`) ||
                          document.getElementById(`chunk-${index}`) ||
                          document.querySelector(`.chunk-pair[data-chunk-index="${index}"]`);
              if (el) return true;
              await wait(60);
            }
            return false;
          }

          async function ensureChunkLoaded(index, timeoutMs = 6000) {
            try {
              const container = document.getElementById(`block-${index}`) ||
                                document.getElementById(`chunk-${index}`) ||
                                document.querySelector(`.chunk-pair[data-chunk-index="${index}"]`);
              if (!container) return false;
              // 舊版一次性渲染，存在 .align-flex 即視為已載入
              if (container.querySelector('.align-flex')) return true;
              // 新版需觸發懶載入
              if (window.ChunkCompareOptimizer && window.ChunkCompareOptimizer.instance && typeof window.ChunkCompareOptimizer.instance.loadFullChunk === 'function') {
                window.ChunkCompareOptimizer.instance.loadFullChunk(index);
              }
              const start = Date.now();
              while (Date.now() - start < timeoutMs) {
                if (container.querySelector('.align-flex')) return true;
                await wait(80);
              }
            } catch {}
            return false;
          }

          blockCopyButtons.forEach(btn => {
            btn.onclick = function() {
              const blockIndex = this.dataset.block;
              const rawBlockContent = window[`blockRawContent_${blockIndex}`];
              const currentMode = window[`showMode_block_${blockIndex}`] || 'both'; // 獲取當前模式

              if (rawBlockContent && Array.isArray(rawBlockContent)) {
                let textToCopy = "";
                let alertMessage = "";

                if (currentMode === 'ocr') {
                  rawBlockContent.forEach(pair => {
                    // 如果原文在左，pair[0]是原文；如果譯文在左，pair[0]是譯文
                    const ocrText = isOriginalFirstInChunkCompare ? (pair && pair[0]) : (pair && pair[1]);
                    if (ocrText) textToCopy += ocrText + "\n\n";
                  });
                  textToCopy = textToCopy.trim();
                  alertMessage = `第 ${parseInt(blockIndex) + 1} 塊的 原文 已複製!`;
                } else if (currentMode === 'trans') {
                  rawBlockContent.forEach(pair => {
                    // 如果原文在左，pair[1]是譯文；如果譯文在左，pair[1]是原文
                    const transText = isOriginalFirstInChunkCompare ? (pair && pair[1]) : (pair && pair[0]);
                    if (transText) textToCopy += transText + "\n\n";
                  });
                  textToCopy = textToCopy.trim();
                  alertMessage = `第 ${parseInt(blockIndex) + 1} 塊的 譯文 已複製!`;
                } else { // mode === 'both'
                  rawBlockContent.forEach(pair => {
                    const ocrText = isOriginalFirstInChunkCompare ? (pair && pair[0]) : (pair && pair[1]);
                    const transText = isOriginalFirstInChunkCompare ? (pair && pair[1]) : (pair && pair[0]);
                    if (ocrText) textToCopy += "原文:\n" + ocrText + "\n\n";
                    if (transText) textToCopy += "譯文:\n" + transText + "\n\n";
                  });
                  textToCopy = textToCopy.trim();
                  alertMessage = `第 ${parseInt(blockIndex) + 1} 塊的 原文和譯文 已複製!`;
                }

                if (textToCopy) {
                  navigator.clipboard.writeText(textToCopy)
                    .then(() => alert(alertMessage))
                    .catch(err => {
                      console.error('複製失敗:', err);
                      alert('複製失敗，請檢視主控台。');
                    });
                } else {
                  alert('沒有內容可複製。');
                }
              }
            };
          });

          blockStructCopyButtons.forEach(btn => {
            btn.onclick = function() {
              const blockIndex = this.dataset.block;
              const type = this.dataset.type; // 'ocr' or 'trans'
              const structIdx = parseInt(this.dataset.idx);
              const rawBlockContent = window[`blockRawContent_${blockIndex}`];
              if (rawBlockContent && rawBlockContent[structIdx]) {
                const textToCopy = (type === 'ocr') ? rawBlockContent[structIdx][0] : rawBlockContent[structIdx][1];
                navigator.clipboard.writeText(textToCopy)
                  .then(() => alert(`第 ${parseInt(blockIndex) + 1} 塊的 ${type === 'ocr' ? '原文' : '譯文'} (結構 ${structIdx + 1}) 已複製!`))
                  .catch(err => console.error('複製失敗:', err));
              }
            };
          });

          blockNavButtons.forEach(btn => {
            btn.onclick = function() {
              const blockIndex = parseInt(this.dataset.block);
              const direction = this.dataset.dir;
              let targetIndex = direction === 'prev' ? blockIndex - 1 : blockIndex + 1;
              const targetElement = document.getElementById(`block-${targetIndex}`);
              if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // 可選：新增醒目提示效果
                targetElement.classList.add('block-highlight');
                setTimeout(() => targetElement.classList.remove('block-highlight'), 1500);
              }
            };
          });

          // 效能監控：記錄分塊對比渲染時間
          const renderEndTime = performance.now();
          console.log(`[效能] 分塊對比渲染完成，總塊數: ${data.ocrChunks.length}，耗時: ${(renderEndTime - window.chunkCompareStartTime || 0).toFixed(2)}ms`);

          // 記憶體最佳化：清理舊的快取（如果太多的話）
          if (window.chunkParseCache && Object.keys(window.chunkParseCache).length > 100) {
            console.log('[效能] 清理部分解析快取以釋放記憶體');
            // 超長文件更激進地清理快取
            const MAX_CACHE_ITEMS = (window.disableEqualizeForLargeDoc ? 5 : 50);
            const cacheKeys = Object.keys(window.chunkParseCache);
            const keysToDelete = cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ITEMS);
            keysToDelete.forEach(key => delete window.chunkParseCache[key]);
          }

        }, 0);
        } // end fallback (no optimizer)
    } else {
        html = '<h3>分塊對比</h3><p>此記錄沒有有效的分塊對比資料。</p>';
        if (!data.ocrChunks || !data.translatedChunks) {
             html += '<p>原因：缺少分塊資料 (ocrChunks or translatedChunks missing)。</p>';
        } else if (data.ocrChunks.length !== data.translatedChunks.length) {
             html += `<p>原因：原文塊數量 (${data.ocrChunks.length}) 與譯文塊數量 (${data.translatedChunks.length}) 不比對。</p>`;
        } else {
             html += '<p>原因：分塊資料為空。</p>';
        }
    }
  }
  document.getElementById('tabContent').innerHTML = html;
  // 分批渲染邏輯（僅對 OCR 和翻譯分頁生效）
  if(tab === 'ocr' || tab === 'translation') {
    const contentText = tab === 'ocr' ? (data.ocr || '') : (data.translation || '');
    const contentContainer = document.getElementById(contentContainerId);
    const batchSize = 30; // 每批渲染的段落數，可調整
    const tokens = marked.lexer(contentText).filter(token => ['paragraph','heading','code','table','blockquote','list','html','hr'].includes(token.type));
    window.currentBlockTokensForCopy[tab] = tokens;
    // 效能最佳化：禁用預標註（inline span 注入），統一改為渲染完成後由 applyBlockAnnotations 處理
    // 這樣可避免在長文字上進行大量正則比對與 DOM 拼接。
    const customRenderer = createCustomMarkdownRenderer([], tab, MarkdownProcessor.renderWithKatexFailback);

    // Define segmentInBatches here, so it's in scope for renderBatch's callback
    function segmentInBatches(containerElement, batchSize = 10, delay = 50, onDone) {
        const blocks = Array.from(containerElement.children).filter(node => node.nodeType === Node.ELEMENT_NODE);
        let i = 0;
        function runBatch() {
            const end = Math.min(i + batchSize, blocks.length);
            for (; i < end; i++) {
                const el = blocks[i];
                el.dataset.blockIndex = String(i);
                if (window.SubBlockSegmenter && typeof window.SubBlockSegmenter.segment === 'function') {
                    // 強制分段，保證英文/短段也有子塊，便於精確醒目提示
                    window.SubBlockSegmenter.segment(el, i, true);
                } else {
                    console.error("SubBlockSegmenter.segment is not available.");
                }
            }
            if (i < blocks.length) {
                setTimeout(runBatch, delay);
            } else {
                // 所有父塊的子塊分割完成
                onDone && onDone();
            }
        }
        runBatch();
    }

  function renderBatch(startIdx, onDoneAllBatchesCallback) { // Added onDoneAllBatchesCallback parameter
      const fragment = document.createDocumentFragment();
      for(let i=startIdx;i<Math.min(tokens.length, startIdx+batchSize);i++){
        const tokenRaw = tokens[i].raw || '';

        // 檢測：如果 token 型別是 paragraph 但包含表格語法，強制作為表格處理
        const hasTableSyntax = /\|(:?-+:?\|)+/.test(tokenRaw);
        if (tokens[i].type === 'paragraph' && hasTableSyntax) {
          console.log('[renderBatch] 檢測到 paragraph token 包含表格語法，強制作為表格處理');
          tokens[i].type = 'table'; // 強制改為 table 型別
        }

        // 優先使用 AST 處理器（支援壓縮表格修復）
        let htmlStr;
        if (typeof MarkdownIntegration !== 'undefined' && MarkdownIntegration.smartRender) {
          htmlStr = MarkdownIntegration.smartRender(tokenRaw, data.images, customRenderer, contentIdentifier);
        } else if (typeof MarkdownProcessorAST !== 'undefined' && MarkdownProcessorAST.render) {
          htmlStr = MarkdownProcessorAST.render(tokenRaw, data.images);
        } else {
          // 降級到舊版
          htmlStr = MarkdownProcessor.renderWithKatexFailback(MarkdownProcessor.safeMarkdown(tokenRaw, data.images), customRenderer);
        }

        // 後驗檢查：如果渲染後仍然是 <p> 但包含表格 Markdown，嘗試直接渲染表格
        if (hasTableSyntax && htmlStr.trim().startsWith('<p')) {
          console.warn('[renderBatch] 渲染後仍然是 <p>，嘗試直接提取並渲染表格部分');
          // 提取 <p> 中的文字內容
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlStr;
          const pElement = tempDiv.querySelector('p');
          if (pElement && pElement.textContent.includes('|')) {
            const tableMarkdown = pElement.textContent;
            // 重新渲染表格
            if (typeof MarkdownProcessorAST !== 'undefined' && MarkdownProcessorAST.render) {
              htmlStr = MarkdownProcessorAST.render(tableMarkdown, data.images);
              console.log('[renderBatch] 重新渲染表格成功');
            }
          }
        }

        const wrap = document.createElement('div');
        wrap.innerHTML = htmlStr;
        while(wrap.firstChild) fragment.appendChild(wrap.firstChild);
      }
      contentContainer.appendChild(fragment);
      if(startIdx+batchSize<tokens.length) {
        setTimeout(()=>renderBatch(startIdx+batchSize, onDoneAllBatchesCallback),0); // Pass callback along
      } else {
        // 所有批次渲染完成
        if(tab==='ocr') console.timeEnd('[效能] OCR分批渲染');
        if(tab==='translation') console.timeEnd('[效能] 翻譯分批渲染');

        // Use requestAnimationFrame to allow browser to paint/layout before further DOM manipulation
        requestAnimationFrame(() => {
          console.log(`[showTab - ${tab}] RAF triggered after all batches rendered.`);
          const currentTabContentWrapper = document.getElementById(contentContainerId);
          if (currentTabContentWrapper) {
              adjustLongHeadingsToParagraphs(currentTabContentWrapper);
              // 兜底修復：將相對圖片 src 替換為 data URL（若前置替換未命中）
              try {
                const imgs = (window.data && Array.isArray(window.data.images)) ? window.data.images : [];
                if (imgs && imgs.length > 0) {
                  const map = new Map();
                  imgs.forEach((im, idx) => {
                    const id = (im.id || '').toString();
                    const name = (im.name || id || `img-${idx+1}.jpg`).toString();
                    const base = id || name;
                    const keys = [
                      base,
                      name,
                      `images/${base}`,
                      `images/${name}`,
                      base.replace(/\.[^.]+$/, ''),
                      name.replace(/\.[^.]+$/, '')
                    ];
                    const dataUri = (im.data && im.data.startsWith && im.data.startsWith('data:')) ? im.data : `data:image/jpeg;base64,${im.data || ''}`;
                    keys.forEach(k => { if (k) map.set(k, dataUri); });
                  });
                  currentTabContentWrapper.querySelectorAll('img').forEach(imgEl => {
                    const src = imgEl.getAttribute('src') || '';
                    if (!src || /^data:|^https?:|^\/\//i.test(src)) return;
                    const clean = src.split('?')[0].split('#')[0].replace(/^\.\//, '');
                    const nameOnly = clean.split('/').pop();
                    const candidates = [clean, nameOnly, `images/${nameOnly}`];
                    for (const key of candidates) {
                      if (map.has(key)) {
                        imgEl.setAttribute('src', map.get(key));
                        break;
                      }
                    }
                  });
                }
              } catch (e) { console.warn('[showTab] fix images fallback failed:', e); }
          }

          // Now, call segmentInBatches on the fully rendered content
          activeContentElement = document.getElementById(contentContainerId); // Re-affirm activeContentElement
          if (activeContentElement) {
            segmentInBatches(activeContentElement, 10, 50, () => {
                // This is the onDone callback for segmentInBatches
                // All segmentation is complete, now apply annotations and listeners

                // 後處理：渲染表格和其他地方的純文字公式（非同步版本，不阻塞主執行緒）
                console.log('[showTab] 開始後處理公式（非同步）');
                console.time('[效能] 公式渲染');

                // 優先使用非同步 Worker 版本（頁面顯示時）
                if (typeof FormulaPostProcessorAsync !== 'undefined') {
                    FormulaPostProcessorAsync.processFormulasInElement(activeContentElement, {
                        useWorker: true,  // 頁面顯示時使用 Worker，避免阻塞主執行緒
                        onComplete: () => {
                            console.timeEnd('[效能] 公式渲染');
                            console.log('[showTab] 公式渲染完成');
                        }
                    });
                } else if (typeof FormulaPostProcessor !== 'undefined' && FormulaPostProcessor.processFormulasInElement) {
                    // 回退到同步版本（如果非同步版本未載入）
                    console.warn('[showTab] 非同步公式處理器不可用，使用同步版本');
                    FormulaPostProcessor.processFormulasInElement(activeContentElement);
                    console.timeEnd('[效能] 公式渲染');
                }

                if (data && data.annotations && typeof window.applyBlockAnnotations === 'function') {
                    window.applyBlockAnnotations(activeContentElement, data.annotations, contentIdentifier);
                }
                // Finally, update Dock stats and TOC as content and structure are finalized
                if (window.DockLogic && typeof window.DockLogic.updateStats === 'function') {
                  console.log(`[showTab - ${tab}] OCR/Translation: segmentInBatches done, forcing Dock stats update.`);
                  window.DockLogic.updateStats(window.data, currentVisibleTabId);
                }
                if (typeof window.refreshTocList === 'function') {
                  console.log(`[showTab - ${tab}] OCR/Translation: segmentInBatches done, forcing TOC refresh.`);
                  window.refreshTocList();
                }
                // ========== 渲染完成，解鎖 ==========='
                renderingTab = null;
                // ====================================
                // ========== 內容載入完成 =============
                window.contentReady = true;
                console.log('[DEBUG] window.contentReady = true (after OCR/Translation segmentInBatches)');

                // Phase 2.3: 初始化批註系統 DOM 快取
                if (window.AnnotationDOMCache) {
                  window.AnnotationDOMCache.init();
                }
                // ====================================
            });
          } else {
            // ========== 渲染完成，解鎖 ==========='
            renderingTab = null;
            // ====================================
            // ========== 內容載入完成 =============
            window.contentReady = true;
            console.log('[DEBUG] window.contentReady = true (after OCR/Translation segmentInBatches, no activeContentElement)');

            // Phase 2.3: 初始化批註系統 DOM 快取
            if (window.AnnotationDOMCache) {
              window.AnnotationDOMCache.init();
            }
            // ====================================
          }
        }); // End of requestAnimationFrame
      }
    }

    // Start rendering batches and provide a callback for when all are done
    renderBatch(0, () => {
      // This callback is executed after all batches for OCR/Translation are rendered
      console.log(`[showTab - ${tab}] All batches rendered. Proceeding with DOM processing.`);

      // Use requestAnimationFrame to allow browser to paint/layout before further DOM manipulation
      requestAnimationFrame(() => {
        console.log(`[showTab - ${tab}] RAF triggered after all batches rendered.`);
        const currentTabContentWrapper = document.getElementById(contentContainerId);
        if (currentTabContentWrapper) {
            adjustLongHeadingsToParagraphs(currentTabContentWrapper);
        }

        // Now, call segmentInBatches on the fully rendered content
        activeContentElement = document.getElementById(contentContainerId); // Re-affirm activeContentElement
        if (activeContentElement) {
          segmentInBatches(activeContentElement, 10, 50, () => {
              // This is the onDone callback for segmentInBatches
              // All segmentation is complete, now apply annotations and listeners

              // 後處理：渲染表格和其他地方的純文字公式（非同步版本，不阻塞主執行緒）
              console.log('[showTab] 開始後處理公式（非同步）');
              console.time('[效能] 公式渲染');

              // 優先使用非同步 Worker 版本（頁面顯示時）
              if (typeof FormulaPostProcessorAsync !== 'undefined') {
                  FormulaPostProcessorAsync.processFormulasInElement(activeContentElement, {
                      useWorker: true,  // 頁面顯示時使用 Worker，避免阻塞主執行緒
                      onComplete: () => {
                          console.timeEnd('[效能] 公式渲染');
                          console.log('[showTab] 公式渲染完成');
                      }
                  });
              } else if (typeof FormulaPostProcessor !== 'undefined' && FormulaPostProcessor.processFormulasInElement) {
                  // 回退到同步版本（如果非同步版本未載入）
                  console.warn('[showTab] 非同步公式處理器不可用，使用同步版本');
                  FormulaPostProcessor.processFormulasInElement(activeContentElement);
                  console.timeEnd('[效能] 公式渲染');
              }

              if (data && data.annotations && typeof window.applyBlockAnnotations === 'function') {
                  window.applyBlockAnnotations(activeContentElement, data.annotations, contentIdentifier);
              }
              // Finally, update Dock stats and TOC as content and structure are finalized
              if (window.DockLogic && typeof window.DockLogic.updateStats === 'function') {
                console.log(`[showTab - ${tab}] OCR/Translation: segmentInBatches done, forcing Dock stats update.`);
                window.DockLogic.updateStats(window.data, currentVisibleTabId);
              }
              if (typeof window.refreshTocList === 'function') {
                console.log(`[showTab - ${tab}] OCR/Translation: segmentInBatches done, forcing TOC refresh.`);
                window.refreshTocList();
              }
              // ========== 渲染完成，解鎖 ==========='
              renderingTab = null;
              // ====================================
              // ========== 內容載入完成 =============
              window.contentReady = true;
              console.log('[DEBUG] window.contentReady = true (after OCR/Translation segmentInBatches)');

              // Phase 2.3: 初始化批註系統 DOM 快取
              if (window.AnnotationDOMCache) {
                window.AnnotationDOMCache.init();
              }

              try {
                // 通知其他模組（例如參考文獻管理器）內容已渲染
                document.dispatchEvent(new CustomEvent('contentRendered', { detail: { tab } }));
              } catch (e) { /* no-op */ }
              // ====================================
          });
        } else {
          // ========== 渲染完成，解鎖 ==========='
          renderingTab = null;
          // ====================================
          // ========== 內容載入完成 =============
          window.contentReady = true;
          console.log('[DEBUG] window.contentReady = true (after OCR/Translation segmentInBatches, no activeContentElement)');

          // Phase 2.3: 初始化批註系統 DOM 快取
          if (window.AnnotationDOMCache) {
            window.AnnotationDOMCache.init();
          }

          try {
            // 通知其他模組（例如參考文獻管理器）內容已渲染
            document.dispatchEvent(new CustomEvent('contentRendered', { detail: { tab } }));
          } catch (e) { /* no-op */ }
          // ====================================
        }
      }); // End of requestAnimationFrame
    });
  }

  // NEW: Adjust long headings. This should be called AFTER innerHTML is set
  // and BEFORE refreshTocList is called.
  // MOVED: adjustLongHeadingsToParagraphs is now called after renderBatch completes for OCR/Translation
  // const tabContentElement = document.getElementById('tabContent');
  // if (tabContentElement) {
  //     adjustLongHeadingsToParagraphs(tabContentElement);
  // }

  // MOVED: refreshTocList is now called later for OCR/Translation
  // if (typeof window.refreshTocList === 'function') {
  //   window.refreshTocList(); // 更新TOC
  // }

  // Update reading progress when tab changes and content is rendered - CALLING DOCK_LOGIC
  if (window.DockLogic && typeof window.DockLogic.forceUpdateReadingProgress === 'function') {
    window.DockLogic.forceUpdateReadingProgress();
  }

  // 如果是分塊對比檢視，並且按鈕存在，則綁定事件
  if (tab === 'chunk-compare') {
    const swapBtn = document.getElementById('swap-chunks-btn');
    if (swapBtn) {
        swapBtn.onclick = function() {
            isOriginalFirstInChunkCompare = !isOriginalFirstInChunkCompare;
            showTab('chunk-compare'); // 重新渲染分塊對比檢視
        };
    }
  }

  // After tab content is updated, refresh chatbot UI if it's open
  if (window.isChatbotOpen && typeof window.ChatbotUI !== 'undefined' && typeof window.ChatbotUI.updateChatbotUI === 'function') {
    window.ChatbotUI.updateChatbotUI();
  }

  // 應用醒目提示和批註
  // MOVED: The logic for applying annotations and adding listeners for OCR/Translation
  // is now inside the callback chain starting from renderBatch a few lines above.
  /*
  if ((tab === 'ocr' || tab === 'translation') && contentContainerId) {
    activeContentElement = document.getElementById(contentContainerId);
    if (activeContentElement) {
        // 分批非同步分割子塊，避免一次性阻塞
        function segmentInBatches(containerElement, batchSize = 10, delay = 50, onDone) {
            const blocks = Array.from(containerElement.children).filter(node => node.nodeType === Node.ELEMENT_NODE);
            let i = 0;
            function runBatch() {
                const end = Math.min(i + batchSize, blocks.length);
                for (; i < end; i++) {
                    const el = blocks[i];
                    el.dataset.blockIndex = String(i);
                    if (window.SubBlockSegmenter && typeof window.SubBlockSegmenter.segment === 'function') {
                        // 強制分段，保證英文/短段也有子塊，便於精確醒目提示
                        window.SubBlockSegmenter.segment(el, i, true);
                    } else {
                        console.error("SubBlockSegmenter.segment is not available.");
                    }
                }
                if (i < blocks.length) {
                    setTimeout(runBatch, delay);
                } else {
                    // 所有父塊的子塊分割完成
                    onDone && onDone();
                }
            }
            runBatch();
        }

        segmentInBatches(activeContentElement, 10, 50, () => {
            // 所有分割完成後，應用批註和監聽器
            if (data && data.annotations && typeof window.applyBlockAnnotations === 'function') {
                window.applyBlockAnnotations(activeContentElement, data.annotations, window.globalCurrentContentIdentifier);
            }
            // **** 新增：在所有子塊分割和批註應用完成後，再次更新Dock統計 ****
            if (window.DockLogic && typeof window.DockLogic.updateStats === 'function') {
              console.log(`[showTab - ${tab}] OCR/Translation content and annotations processed, forcing Dock stats update.`);
              window.DockLogic.updateStats(window.data, currentVisibleTabId);
            }
            // TOC refresh will be handled later
        });
    }
  } else if (tab === 'chunk-compare') {
  */
  // The chunk-compare logic for annotations and Dock stats remains, as it has its own processing path.
  // We only moved the OCR/Translation specific part.
  if (tab === 'chunk-compare') { // This is the original start of the else if block
     // 對於分塊對比檢視，為每個原文和譯文塊單獨處理
     setTimeout(() => { //確保DOM更新完畢
        // 清理工具：移除區域末尾的換行/空白/空段落，避免不可見換行導致高度不齊
        function trimTrailingBreaks(area) {
          if (!area) return;
          try {
            function isWhitespaceText(n) {
              if (!n || n.nodeType !== Node.TEXT_NODE) return false;
              let t = n.textContent || '';
              t = t.replace(/\u00A0/g, ' '); // NBSP → space
              t = t.replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-width
              return /^\s*$/.test(t);
            }
            function isEmptyElement(n) {
              if (!n || n.nodeType !== Node.ELEMENT_NODE) return false;
              // 沒有可見文字與可見子節點（如圖片/表格）
              const hasMedia = n.querySelector('img, table, video, svg');
              let txt = (n.textContent || '');
              txt = txt.replace(/\u00A0/g, ' ');
              txt = txt.replace(/[\u200B-\u200D\uFEFF]/g, '');
              txt = txt.replace(/\s+/g, '');
              return !hasMedia && txt.length === 0;
            }
            function removeTrailingIn(el) {
              let node = el && el.lastChild;
              // 先清理內部子節點的末尾 <br> 與空白
              if (node && node.nodeType === Node.ELEMENT_NODE) {
                while (node.lastChild && (node.lastChild.nodeType === Node.ELEMENT_NODE && node.lastChild.tagName.toLowerCase() === 'br' || isWhitespaceText(node.lastChild))) {
                  node.removeChild(node.lastChild);
                }
              }
              // 再清理當前容器的末尾
              while (node) {
                if (isWhitespaceText(node)) {
                  const prev = node.previousSibling; el.removeChild(node); node = prev; continue;
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const tag = node.tagName.toLowerCase();
                  if (tag === 'br') { const prev = node.previousSibling; el.removeChild(node); node = prev; continue; }
                  // 清理元素內末尾 <br> 以及純空元素
                  while (node.lastChild && (node.lastChild.nodeType === Node.ELEMENT_NODE && node.lastChild.tagName.toLowerCase() === 'br' || isWhitespaceText(node.lastChild))) {
                    node.removeChild(node.lastChild);
                  }
                  if (isEmptyElement(node)) { const prev = node.previousSibling; el.removeChild(node); node = prev; continue; }
                }
                break;
              }
            }
            removeTrailingIn(area);
          } catch (e) { /* ignore */ }
        }
        const ocrContentAreas = document.querySelectorAll('.chunk-compare-container .align-block-ocr .align-content.markdown-body');
        const transContentAreas = document.querySelectorAll('.chunk-compare-container .align-block-trans .align-content.markdown-body');
        let areasProcessed = 0;
        const totalAreasToProcess = ocrContentAreas.length + transContentAreas.length;

        function singleAreaProcessed() {
            areasProcessed++;
            if (areasProcessed === totalAreasToProcess) {
                // 所有分塊對比區域處理完畢後更新Dock統計和TOC
                if (window.DockLogic && typeof window.DockLogic.updateStats === 'function') {
                    console.log(`[showTab - ${tab}] Chunk-compare: all areas processed, forcing Dock stats update.`);
                    window.DockLogic.updateStats(window.data, currentVisibleTabId);
                }
                if (typeof window.refreshTocList === 'function') {
                    console.log(`[showTab - ${tab}] Chunk-compare: all areas processed, forcing TOC refresh.`);
                    window.refreshTocList();
                }
            }
        }

        function processContentAreaAsync(area, isOcrArea, callback) { // Renamed for clarity
            if (!area.id) {
                area.id = 'chunk-content-' + _page_generateUUID();
            }
            // 渲染完成後立即清理頁尾換行/空白
            trimTrailingBreaks(area);
            const effectiveContentIdentifier = isOriginalFirstInChunkCompare ? (isOcrArea ? 'ocr' : 'translation') : (isOcrArea ? 'translation' : 'ocr');
            const blockElements = Array.from(area.children).filter(node => node.nodeType === Node.ELEMENT_NODE);

            let i = 0;
            const batchSize = 5;
            function runChunkSubBatch() {
                const end = Math.min(i + batchSize, blockElements.length);
                for (; i < end; i++) {
                    const element = blockElements[i];
                    element.dataset.blockIndex = String(i);
                    if (typeof window.SubBlockSegmenter !== 'undefined' && typeof window.SubBlockSegmenter.segment === 'function') {
                        window.SubBlockSegmenter.segment(element, i);
                    } else {
                        console.error("SubBlockSegmenter.segment is not available for chunk processing.");
                    }
                }
                if (i < blockElements.length) {
                    setTimeout(runChunkSubBatch, 20);
                } else {
                    // 後處理：渲染表格和其他地方的純文字公式
                    if (typeof FormulaPostProcessor !== 'undefined' && FormulaPostProcessor.processFormulasInElement) {
                        FormulaPostProcessor.processFormulasInElement(area);
                    }

                    if (data && data.annotations && typeof window.applyBlockAnnotations === 'function') {
                        const annotationsToApply = (currentVisibleTabId === 'chunk-compare') ? [] : data.annotations;
                        window.applyBlockAnnotations(area, annotationsToApply, effectiveContentIdentifier);
                    }
                    callback(); // Signal completion for this area
                }
            }
            runChunkSubBatch();
        }

        if (totalAreasToProcess === 0) { // Handle case with no content areas
             if (window.DockLogic && typeof window.DockLogic.updateStats === 'function') {
                console.log(`[showTab - ${tab}] Chunk-compare has no content areas, forcing Dock stats update.`);
                window.DockLogic.updateStats(window.data, currentVisibleTabId);
            }
            // TOC refresh will be handled later -> Actually, should be called here too if no areas.
            if (typeof window.refreshTocList === 'function') {
                console.log(`[showTab - ${tab}] Chunk-compare has no content areas, forcing TOC refresh.`);
                window.refreshTocList();
            }
        } else {
            ocrContentAreas.forEach(area => processContentAreaAsync(area, true, singleAreaProcessed));
            transContentAreas.forEach(area => processContentAreaAsync(area, false, singleAreaProcessed));
        }
     }, 0);
     // ========== 渲染完成，解鎖 ===========
     renderingTab = null;
     // ====================================
  }

  // Attempt to restore scroll position for the current tab
  if (docIdForLocalStorage && currentVisibleTabId) {
    // 新增模式標識到儲存鍵中
    const isImmersive = window.ImmersiveLayout && window.ImmersiveLayout.isActive();
    const modePrefix = isImmersive ? 'immersive_' : 'normal_';
    const scrollKey = `scrollPos_${modePrefix}${docIdForLocalStorage}_${currentVisibleTabId}`;
    const savedScrollTop = localStorage.getItem(scrollKey);
    console.log(`[showTab] 嘗試恢復滾動位置: ${scrollKey}, 儲存的值: ${savedScrollTop}, 沉浸模式: ${isImmersive ? '是' : '否'}`);

    if (savedScrollTop !== null && !isNaN(parseInt(savedScrollTop, 10))) {
      const scrollableElement = getCurrentScrollableElementForHistoryDetail(); // MODIFIED
      if (scrollableElement) {
        console.log(`[showTab] 找到可滾動元素:`, {
          元素ID: scrollableElement.id || '無ID',
          元素類名: scrollableElement.className || '無類名',
          元素標籤: scrollableElement.tagName,
          當前scrollTop: scrollableElement.scrollTop,
          將要設定的scrollTop: parseInt(savedScrollTop, 10),
          scrollHeight: scrollableElement.scrollHeight,
          clientHeight: scrollableElement.clientHeight,
          路徑: getElementPath(scrollableElement)
        });

        // 使用多次嘗試確保滾動位置被正確設定
        const scrollTopToSet = parseInt(savedScrollTop, 10);
        let attemptCount = 0;

        function attemptToSetScroll() {
          if (currentVisibleTabId !== tab) {
            console.log(`[showTab] 標籤已切換，取消恢復滾動位置`);
            return;
          }

          attemptCount++;
          console.log(`[showTab] 第${attemptCount}次嘗試設定滾動位置: ${scrollTopToSet}`);
          scrollableElement.scrollTop = scrollTopToSet;

          // 檢查是否成功設定
          setTimeout(() => {
            const currentScrollTop = scrollableElement.scrollTop;
            const difference = Math.abs(scrollTopToSet - currentScrollTop);
            console.log(`[showTab] 設定後檢查: 預期=${scrollTopToSet}, 實際=${currentScrollTop}, 差值=${difference}`);

            // 如果差異大於閾值且嘗試次數小於最大次數，則重試
            if (difference > 5 && attemptCount < 8) {
              console.warn(`[showTab] 警告: 滾動位置設定可能未生效! 將在300ms後重試...`);
              // 等待版面穩定（scrollHeight 兩次相等）後再重試
              let checks = 0;
              let lastHeight = scrollableElement.scrollHeight;
              const interval = setInterval(() => {
                const h = scrollableElement.scrollHeight;
                if (h === lastHeight || checks > 5) {
                  clearInterval(interval);
                  requestAnimationFrame(() => setTimeout(attemptToSetScroll, 50));
                } else {
                  lastHeight = h;
                  checks++;
                }
              }, 80);
            } else if (difference > 5) {
              console.warn(`[showTab] 警告: 滾動位置設定失敗，已達到最大嘗試次數`);
            } else {
              console.log(`[showTab] 滾動位置設定成功!`);
            }
          }, 50);
        }

        // 使用requestAnimationFrame確保DOM已更新
        requestAnimationFrame(() => {
          if(currentVisibleTabId === tab) { // Ensure tab hasn't changed during async operation
            attemptToSetScroll();
          } else {
            console.log(`[showTab] 標籤已切換，取消恢復滾動位置`);
          }
        });
      } else {
        console.warn(`[showTab] 未找到可滾動元素，無法恢復滾動位置`);
      }
    } else {
      console.log(`[showTab] 沒有儲存的滾動位置或值無效: ${savedScrollTop}`);
    }
  } else {
    console.log(`[showTab] 缺少必要引數: docId=${docIdForLocalStorage}, tabId=${currentVisibleTabId}`);
  }

  // Call updateReadingProgress after potential scroll restoration and content rendering - CALLING DOCK_LOGIC
  // 延遲呼叫，確保滾動位置恢復後再更新閱讀進度
  setTimeout(() => {
    if (window.DockLogic && typeof window.DockLogic.forceUpdateReadingProgress === 'function') {
      console.log("[showTab] 延遲呼叫 forceUpdateReadingProgress 更新閱讀進度");
      window.DockLogic.forceUpdateReadingProgress();
    }
  }, 300);

  // 新增：每次渲染後都綁定 scroll 事件到正確容器
  if (window.DockLogic && typeof window.DockLogic.bindScrollForCurrentScrollable === 'function') {
    window.DockLogic.bindScrollForCurrentScrollable();
  }

  // 重新綁定滾動事件以儲存滾動位置
  if (typeof bindScrollForSavePosition === 'function') {
    bindScrollForSavePosition();
  }

  // 效能測試斷點 - 總渲染結束
  console.timeEnd('[效能] showTab_總渲染');
}
