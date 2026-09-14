/**
 * pdf-compare-renderer.js
 * PDF 對照檢視 - 文字渲染引擎模組
 * 負責：文字自適應渲染、公式處理、白色背景繪製
 */

class PDFCompareRenderer {
  constructor(view) {
    this.view = view;
    this.textFittingEngine = view.textFittingEngine;
  }

  /**
   * 繪製頁面的白色背景覆蓋層（覆蓋原始文字）
   */
  renderPageBboxesToCtx(ctx, pageNum, yOffset, pageWidth, pageHeight) {
    const pageItems = this.view.contentListJson.filter(item => item.page_idx === pageNum - 1 && item.type === 'text');
    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
    const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

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
  }

  /**
   * 分段：將譯文繪製到指定 ctx，並將公式 DOM 插入到 wrapper
   */
  async renderPageTranslationToCtx(ctx, wrapperEl, pageNum, yOffset, pageWidth, pageHeight) {
    // 確保已經完成預處理
    if (!this.view.hasPreprocessed) {
      this.view.preprocessGlobalFontSizes();
    }

    const pageItems = this.view.contentListJson.filter(item => item.page_idx === pageNum - 1 && item.type === 'text');
    const BBOX_NORMALIZED_RANGE = 1000;
    const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
    const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

    // 第一步：在 overlay 層繪製白色背景（覆蓋原始文字）
    this.renderPageBboxesToCtx(ctx, pageNum, yOffset, pageWidth, pageHeight);

    // 第二步：繪製翻譯文字（在白色背景上）
    pageItems.forEach((item) => {
      const originalIdx = this.view.contentListJson.indexOf(item);
      const translatedItem = this.view.translatedContentList[originalIdx];
      if (!translatedItem || !item.bbox) return;

      const bb = item.bbox;
      const x = bb[0] * scaleX;
      const y = bb[1] * scaleY + yOffset;
      const w = (bb[2] - bb[0]) * scaleX;
      const h = (bb[3] - bb[1]) * scaleY;

      // 使用預處理的字號資訊
      const cachedInfo = this.view.globalFontSizeCache.get(originalIdx);

      // 使用新的文字自適應引擎渲染
      this.drawTextInBox(ctx, translatedItem.text, x, y, w, h, pageNum, wrapperEl, cachedInfo);
    });
  }

  /**
   * 在指定區域內繪製自適應大小的文字
   */
  drawTextInBox(ctx, text, x, y, width, height, pageNum = null, wrapperEl = null, cachedInfo = null) {
    if (!text) return;

    // 檢查是否為短文字/小標題（與 bbox 擴充判斷保持一致）
    const isShortText = text.length < 30;

    // 暫時禁用公式渲染（用於測試）
    // 所有文字都用 Canvas 渲染

    // 使用預處理的字號資訊或直接傳遞 cachedInfo
    const suggestedFontSize = cachedInfo ? cachedInfo.estimatedFontSize : null;
    this.drawPlainTextInBox(ctx, text, x, y, width, height, isShortText, cachedInfo);
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
    for (let size = 16; size >= 6; size -= 1) {
      ctx.font = `${size}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const lines = this.wrapText(ctx, text, width - 4);

      // 計算總高度
      const lineHeight = size * 1.3;
      const totalHeight = lines.length * lineHeight;

      if (totalHeight <= height - 4) {
        bestFontSize = size;
        bestLines = lines;
        break;
      }
    }

    // 繪製最佳結果
    ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';

    const lineHeight = bestFontSize * 1.3;

    bestLines.forEach((line, i) => {
      const lineY = y + 4 + i * lineHeight;
      // 所有已經過裁剪的行都應該繪製
      // 因為 bestLines 已經在上面被裁剪到只包含能完整顯示的行
      ctx.fillText(line, x + 2, lineY);
    });
  }

  /**
   * 使用文字自適應演算法繪製文字（新演算法）
   * @param {number} suggestedFontSize - 可選的建議字號（來自預處理）
   */
  drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText = false, suggestedFontSize = null) {
    try {
      // 估算原始字型大小（基於 bbox 高度）
      const estimatedFontSize = suggestedFontSize || (height * 0.90); // 平衡字號與內容完整性

      // 判斷是否為 CJK 語言（簡單判斷：檢查文字中是否有中文字元）
      const isCJK = /[\u4e00-\u9fa5]/.test(text);

      // 使用文字自適應引擎計算最優縮放
      const result = this.textFittingEngine.calculateOptimalScale(
        text,
        [x, y, x + width, y + height], // bbox
        estimatedFontSize,
        'Arial, "Microsoft YaHei", "SimHei", sans-serif',
        isCJK,
        { firstLineIndent: false }
      );

      // 計算最終字型大小
      let finalFontSize = estimatedFontSize * result.scale;

      // 獲取行距
      const lineSkip = isCJK ? this.textFittingEngine.LINE_SKIP_CJK : this.textFittingEngine.LINE_SKIP_WESTERN;

      // 動態縮放迴圈：不斷嘗試直到所有內容都裝下（參考 其他開源專案）
      const minReadableFontSize = 10; // 提高最小字號到 10px，保證可讀性
      const minFontSize = Math.max(estimatedFontSize * 0.2, minReadableFontSize); // 允許縮到 20%

      // 確保至少從一個合理的字號開始嘗試
      if (finalFontSize < estimatedFontSize * 0.6) {
        // 如果 TextFittingEngine 給出的字號太小，忽略它，從估算字號開始
        finalFontSize = estimatedFontSize;
      }

      let attempts = 0;
      const maxAttempts = 40; // 嘗試次數

      // 允許適度的底部溢位（像 其他開源專案 一樣）
      const allowedBottomOverflow = height * 0.15; // 允許 15% 底部溢位

      while (finalFontSize >= minFontSize && attempts < maxAttempts) {
        attempts++;

        // 設定字型
        ctx.font = `${finalFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
        ctx.fillStyle = '#000';
        ctx.textBaseline = 'top';

        // 分行繪製
        const lines = this.wrapText(ctx, text, width - 4);
        const lineHeight = finalFontSize * lineSkip;

        // 檢查所有行是否都能裝下
        let allLinesFit = true;
        let fittingLineCount = 0;

        for (let i = 0; i < lines.length; i++) {
          const lineY = y + 2 + i * lineHeight;
          // 允許適度溢位底部邊界
          if (lineY + lineHeight <= y + height + allowedBottomOverflow) {
            fittingLineCount++;
          } else {
            allLinesFit = false;
            break;
          }
        }

        // 如果所有行都裝下了，開始繪製
        if (allLinesFit) {
          lines.forEach((line, i) => {
            const lineY = y + 2 + i * lineHeight; // 減小頂部 padding 從 4 到 2
            ctx.fillText(line, x + 2, lineY);
          });

          // 除錯資訊
          if (attempts > 1) {
            console.log(`[TextFitting] 動態縮放成功: 文字="${text.substring(0, 30)}..." 嘗試=${attempts}次, 最終字號=${finalFontSize.toFixed(1)}px, 行數=${lines.length}`);
          }
          return; // 成功，退出函式
        }

        // 裝不下，減小字號重試
        if (finalFontSize > estimatedFontSize * 0.6) {
          finalFontSize -= estimatedFontSize * 0.04; // 減小 4%
        } else {
          finalFontSize -= estimatedFontSize * 0.08; // 加速減小 8%
        }
      }

      // 如果迴圈結束還是裝不下，優先保證字號可讀性
      // 使用最小可讀字號繪製，即使會跳過部分行
      const fallbackFontSize = Math.max(finalFontSize, minReadableFontSize);
      ctx.font = `${fallbackFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'top';
      const lines = this.wrapText(ctx, text, width - 4);
      const lineHeight = fallbackFontSize * lineSkip;

      let drawnLines = 0;
      let skippedLines = 0;

      lines.forEach((line, i) => {
        const lineY = y + 2 + i * lineHeight; // 減小頂部 padding 從 4 到 2
        if (lineY + lineHeight <= y + height) {
          ctx.fillText(line, x + 2, lineY);
          drawnLines++;
        } else {
          skippedLines++;
        }
      });

      if (skippedLines > 0) {
        console.warn(`[TextFitting] 文字過長: "${text.substring(0, 30)}..." 嘗試=${attempts}次, 字號=${fallbackFontSize.toFixed(1)}px, 繪製=${drawnLines}/${lines.length}行`);
      }

    } catch (error) {
      console.error('[PDFCompareView] 文字自適應渲染失敗:', error);
      // 使用最小的回退渲染
      ctx.font = '8px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
      ctx.fillStyle = '#000';
      ctx.textBaseline = 'top';
      const lines = this.wrapText(ctx, text, width - 4);
      lines.forEach((line, i) => {
        const lineY = y + 4 + i * 12;
        if (lineY < y + height) {
          ctx.fillText(line, x + 2, lineY);
        }
      });
    }
  }

  /**
   * 文字換行（根據寬度）
   */
  wrapText(ctx, text, maxWidth) {
    const words = [];

    // 對於中文，按字元分割；對於英文，按空格和標點分割
    const isCJK = /[\u4e00-\u9fa5]/.test(text);

    if (isCJK) {
      // 中文按字元分割，保留標點
      const segments = text.split(/([。？！，、；：\n])/);

      for (let segment of segments) {
        if (!segment) continue;

        // 如果是單個標點符號，作為獨立 token
        if (/^[。？！，、；：]$/.test(segment)) {
          words.push(segment);
        } else if (segment === '\n') {
          words.push('\n');
        } else {
          // 普通字元，逐字分割
          words.push(...segment.split(''));
        }
      }
    } else {
      // 英文按空格和標點分割
      const tokens = text.match(/\S+|\s+/g) || [];
      words.push(...tokens);
    }

    const lines = [];
    let currentLine = '';
    let currentWidth = 0;

    for (let word of words) {
      // 處理換行字元
      if (word === '\n') {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
          currentWidth = 0;
        }
        continue;
      }

      // 中文標點：嘗試新增到當前行，允許略微超出
      if (isCJK && /^[。？！，、；：]$/.test(word)) {
        currentLine += word;
        currentWidth += ctx.measureText(word).width;
        continue;
      }

      const wordWidth = ctx.measureText(word).width;

      // 檢查是否需要換行
      if (currentWidth + wordWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
        currentWidth = wordWidth;
      } else {
        currentLine += word;
        currentWidth += wordWidth;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}

// 暴露到全域
if (typeof window !== 'undefined') {
  window.PDFCompareRenderer = PDFCompareRenderer;
}
