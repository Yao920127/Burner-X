// utils/text-fitting-integration.js
// PDF 文字自適應整合模組 - 連線 text-fitting.js 和 PDF 渲染器

/**
 * PDF 文字渲染器（帶自適應縮放）
 *
 * 使用方法：
 * 1. 在 MinerU 結構化翻譯完成後呼叫
 * 2. 自動計算最優字型大小
 * 3. 在 Canvas 上渲染格式保留的譯文
 */
class PDFTextRenderer {
  constructor(options = {}) {
    this.fittingEngine = new TextFittingEngine(options.fittingConfig || {});
    this.defaultFontFamily = options.fontFamily || 'Arial, "Microsoft YaHei", "SimHei", sans-serif';
    this.defaultFontColor = options.fontColor || '#000000';
    this.showDebugBorders = options.debugMode || false;
  }

  /**
   * 渲染翻譯後的文字到 Canvas
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {Array<Object>} translatedItems - 翻譯後的 content_list 資料
   * @param {Object} pageInfo - 頁面資訊 { width, height, pageIndex }
   * @param {string} targetLang - 目標語言
   */
  renderTranslatedText(ctx, translatedItems, pageInfo, targetLang = 'zh-TW') {
    if (!ctx || !translatedItems || !Array.isArray(translatedItems)) {
      console.error('[PDFTextRenderer] 無效的輸入引數');
      return;
    }

    // 過濾當前頁的文字項
    const pageItems = translatedItems.filter(item =>
      item.page_idx === pageInfo.pageIndex &&
      item.type === 'text' &&
      item.text &&
      item.bbox
    );

    if (pageItems.length === 0) {
      console.log(`[PDFTextRenderer] 頁面 ${pageInfo.pageIndex} 沒有可渲染的文字`);
      return;
    }

    // 第一步：批次計算全域最優縮放（保持字型一致性）
    const { globalScale, itemScales } = this.fittingEngine.calculateGlobalScale(
      pageItems,
      this.defaultFontFamily,
      targetLang
    );

    console.log(`[PDFTextRenderer] 頁面 ${pageInfo.pageIndex} 全域縮放: ${globalScale.toFixed(2)}`);

    // 第二步：逐項渲染
    pageItems.forEach((item, index) => {
      const scaleInfo = itemScales[index];
      if (!scaleInfo) return;

      this._renderTextItem(ctx, item, scaleInfo, pageInfo, targetLang);
    });
  }

  /**
   * 渲染單個文字項
   *
   * @private
   */
  _renderTextItem(ctx, item, scaleInfo, pageInfo, targetLang) {
    const [x0, y0, x1, y1] = item.bbox;
    const bboxWidth = x1 - x0;
    const bboxHeight = y1 - y0;

    // 估算原始字型大小
    const originalFontSize = bboxHeight * 0.8;
    const scaledFontSize = originalFontSize * scaleInfo.scale;

    // 判斷是否為 CJK 語言
    const isCJK = this._isTargetLangCJK(targetLang);
    const lineSkip = isCJK ? this.fittingEngine.LINE_SKIP_CJK : this.fittingEngine.LINE_SKIP_WESTERN;

    // 設定字型
    ctx.font = `${scaledFontSize}px ${this.defaultFontFamily}`;
    ctx.fillStyle = this.defaultFontColor;
    ctx.textBaseline = 'top';

    // 除錯模式：繪製 bbox 邊框
    if (this.showDebugBorders) {
      ctx.strokeStyle = scaleInfo.fitsWithoutExpansion ? '#00ff00' : '#ff0000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, bboxWidth, bboxHeight);
    }

    // 版面並渲染文字
    const layout = this._layoutTextForRender(
      item.text,
      bboxWidth,
      bboxHeight,
      scaledFontSize,
      ctx,
      lineSkip,
      isCJK
    );

    let currentY = y0;
    const lineHeight = scaledFontSize * lineSkip;

    for (const line of layout.lines) {
      if (currentY + scaledFontSize > y1) {
        // 超出邊界，停止渲染（理論上不應該發生）
        console.warn(`[PDFTextRenderer] 文字超出邊界: ${item.text.substring(0, 20)}...`);
        break;
      }

      ctx.fillText(line, x0, currentY);
      currentY += lineHeight;
    }
  }

  /**
   * 版面文字並返回行陣列
   *
   * @private
   */
  _layoutTextForRender(text, maxWidth, maxHeight, fontSize, ctx, lineSkip, isCJK) {
    const lines = [];
    const words = isCJK ? text.split('') : text.match(/\S+|\s+/g) || [];
    let currentLine = '';
    let currentWidth = 0;

    for (const word of words) {
      const wordWidth = ctx.measureText(word).width;
      const totalWidth = currentWidth + wordWidth;

      if (totalWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
        currentWidth = wordWidth;
      } else {
        currentLine += word;
        currentWidth = totalWidth;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return { lines };
  }

  /**
   * 判斷目標語言是否為 CJK
   *
   * @private
   */
  _isTargetLangCJK(targetLang) {
    if (!targetLang) return false;
    const upper = targetLang.toUpperCase();
    return upper.includes('ZH') ||
           upper.includes('JA') ||
           upper.includes('JP') ||
           upper.includes('KO') ||
           upper.includes('KR');
  }

  /**
   * 匯出渲染配置（用於除錯）
   *
   * @param {Array<Object>} translatedItems
   * @param {string} targetLang
   * @returns {Object}
   */
  exportRenderConfig(translatedItems, targetLang = 'zh-TW') {
    const { globalScale, itemScales } = this.fittingEngine.calculateGlobalScale(
      translatedItems,
      this.defaultFontFamily,
      targetLang
    );

    return {
      globalScale,
      itemCount: translatedItems.length,
      scaleDistribution: this._analyzeScaleDistribution(itemScales),
      recommendations: this._generateRecommendations(itemScales)
    };
  }

  /**
   * 分析縮放分佈
   *
   * @private
   */
  _analyzeScaleDistribution(itemScales) {
    const scales = itemScales.filter(s => s != null).map(s => s.scale);
    const min = Math.min(...scales);
    const max = Math.max(...scales);
    const avg = scales.reduce((a, b) => a + b, 0) / scales.length;

    return { min, max, avg, count: scales.length };
  }

  /**
   * 生成最佳化建議
   *
   * @private
   */
  _generateRecommendations(itemScales) {
    const recommendations = [];
    const needsExpansion = itemScales.filter(s => s && s.requiresExpansion).length;

    if (needsExpansion > 0) {
      recommendations.push({
        type: 'warning',
        message: `有 ${needsExpansion} 個文字塊需要擴充容器才能完整顯示`
      });
    }

    const lowScaleCount = itemScales.filter(s => s && s.scale < 0.5).length;
    if (lowScaleCount > 0) {
      recommendations.push({
        type: 'info',
        message: `有 ${lowScaleCount} 個文字塊的字型被縮小到 50% 以下，可能影響可讀性`
      });
    }

    return recommendations;
  }
}

/**
 * 與 history_pdf_compare.js 的整合示例
 *
 * 在 PDFCompareView 類中使用：
 */
class PDFCompareViewEnhanced {
  constructor() {
    // ... 原有程式碼 ...

    // 初始化文字渲染器
    this.textRenderer = new PDFTextRenderer({
      fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
      fontColor: '#000000',
      debugMode: false, // 設定為 true 可顯示 bbox 邊框
      fittingConfig: {
        // 自定義配置（可選）
        initialScale: 1.0,
        minScale: 0.3,
        lineSkipCJK: 1.5,
        lineSkipWestern: 1.3
      }
    });
  }

  /**
   * 渲染翻譯側的頁面（增強版）
   */
  async renderTranslationPage(pageIndex) {
    // ... 獲取 Canvas 上下文 ...
    const ctx = this.translationContext;

    // 渲染原始 PDF 背景
    await this.renderOriginalPDFPage(ctx, pageIndex);

    // 渲染翻譯文字（帶自適應縮放）
    this.textRenderer.renderTranslatedText(
      ctx,
      this.translatedContentList, // 來自 mineru-structured-translation.js
      {
        width: this.pageImageSizes[pageIndex]?.width || 595,
        height: this.pageImageSizes[pageIndex]?.height || 842,
        pageIndex: pageIndex
      },
      this.targetLang || 'zh-TW'
    );

    console.log('[PDFCompareView] 翻譯頁面渲染完成:', pageIndex);
  }
}

// 匯出到全域
if (typeof window !== 'undefined') {
  window.PDFTextRenderer = PDFTextRenderer;
  window.PDFCompareViewEnhanced = PDFCompareViewEnhanced;
}

// 模組化匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PDFTextRenderer, PDFCompareViewEnhanced };
}
