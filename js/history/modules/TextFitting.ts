/**
 * TextFitting.js
 * 文字自適應渲染模組
 * 負責文字的自適應版面、換行、公式渲染等功能
 */

class TextFittingAdapter {
  constructor(options = {}) {
    this.textFittingEngine = null;
    this.globalFontSizeCache = new Map(); // idx -> { estimatedFontSize, bbox }
    this.hasPreprocessed = false;

    // 公式快取
    this._formulaCache = new Map();
    this._katexWarned = false;
    this._katexUnavailableWarned = false;

    // 可配置選項
    this.options = Object.assign({
      initialScale: 1.0,
      minScale: 0.3,
      scaleStepHigh: 0.05,
      scaleStepLow: 0.1,
      lineSkipCJK: 1.5,
      lineSkipWestern: 1.3,
      minLineHeight: 1.05,
      globalFontScale: 0.85,
      bboxNormalizedRange: 1000
    }, options);
  }

  /**
   * 初始化文字自適應引擎
   */
  initialize() {
    // 檢查 TextFittingEngine 是否已載入
    if (typeof TextFittingEngine === 'undefined') {
      console.error('[TextFittingAdapter] TextFittingEngine 未載入！請確保 js/utils/text-fitting.js 已正確引入');
      console.error('[TextFittingAdapter] 當前可用類:', typeof TextFittingEngine, typeof PDFTextRenderer);
      return;
    }

    try {
      this.textFittingEngine = new TextFittingEngine({
        initialScale: this.options.initialScale,
        minScale: this.options.minScale,
        scaleStepHigh: this.options.scaleStepHigh,
        scaleStepLow: this.options.scaleStepLow,
        lineSkipCJK: this.options.lineSkipCJK,
        lineSkipWestern: this.options.lineSkipWestern,
        minLineHeight: this.options.minLineHeight
      });

      console.log('[TextFittingAdapter] 文字自適應引擎已啟用');
    } catch (error) {
      console.error('[TextFittingAdapter] 文字自適應引擎初始化失敗:', error);
    }
  }

  /**
   * 預處理：使用眾數統計計算全域統一的字號
   * @param {Array} contentListJson - 原文內容列表
   * @param {Array} translatedContentList - 譯文內容列表
   */
  preprocessGlobalFontSizes(contentListJson, translatedContentList) {
    if (this.hasPreprocessed) return;

    console.log('[TextFittingAdapter] 開始預處理全域字號（使用眾數統計）...');
    const startTime = performance.now();

    const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange || 1000;

    // 第一步：收集所有段落的最優縮放因子
    const allScales = [];
    const tempCache = new Map(); // 臨時儲存每個段落的最優縮放

    contentListJson.forEach((item, idx) => {
      if (item.type !== 'text' || !item.bbox) return;

      const translatedItem = translatedContentList[idx];
      if (!translatedItem || !translatedItem.text) return;

      const bbox = item.bbox;
      const bboxHeight = (bbox[3] - bbox[1]) / BBOX_NORMALIZED_RANGE;
      const bboxWidth = (bbox[2] - bbox[0]) / BBOX_NORMALIZED_RANGE;
      const text = translatedItem.text;

      // 檢測是否包含公式
      const hasFormula = /\$\$?[\s\S]*?\$\$?/.test(text);

      // 判斷是否為短文字（標題、圖注等）
      // 短文字定義：字元數 < 50（更寬鬆），或者包含換行字元且總字元數 < 80
      const isShortText = text.length < 50 || (/\n/.test(text) && text.length < 80);

      // 計算該段落的最優縮放因子（模擬實際渲染）
      const optimalScale = this._calculateOptimalScale(text, bboxWidth, bboxHeight);

      // 根據文字單元數量加權（字元數越多，權重越大）
      const unitCount = Math.max(1, Math.floor(text.length / 10));
      for (let i = 0; i < unitCount; i++) {
        allScales.push(optimalScale);
      }

      tempCache.set(idx, {
        optimalScale: optimalScale,
        bbox: bbox,
        bboxHeight: bboxHeight,
        hasFormula: hasFormula,  // 儲存公式標記
        isShortText: isShortText  // 儲存短文字標記
      });
    });

    // 第二步：計算眾數和關鍵百分位數
    const modeScale = this._calculateMode(allScales);
    const percentile50 = this._calculatePercentile(allScales, 0.50); // 中位數
    const percentile60 = this._calculatePercentile(allScales, 0.60);
    const percentile70 = this._calculatePercentile(allScales, 0.70);
    const percentile80 = this._calculatePercentile(allScales, 0.80);

    // ✅ 使用分層限制策略：短文字用80%分位，長文字用60%分位
    const shortTextLimitScale = percentile80;  // 短文字（標題、圖注等）使用更寬鬆的限制
    const longTextLimitScale = percentile60;   // 長文字（正文）使用更嚴格的限制

    // 統計公式段落數量
    let formulaCount = 0;
    let shortTextCount = 0;
    tempCache.forEach((data) => {
      if (data.hasFormula) formulaCount++;
      if (data.isShortText) shortTextCount++;
    });

    console.log(`[TextFittingAdapter] 收集了 ${allScales.length} 個縮放樣本，其中 ${formulaCount} 個包含公式，${shortTextCount} 個短文字`);
    console.log(`[TextFittingAdapter] 50%分位=${percentile50.toFixed(3)}, 60%分位=${percentile60.toFixed(3)}, 70%分位=${percentile70.toFixed(3)}, 80%分位=${percentile80.toFixed(3)}, 眾數=${modeScale.toFixed(3)}`);
    console.log(`[TextFittingAdapter] 短文字上限=${shortTextLimitScale.toFixed(3)} (80%分位), 長文字上限=${longTextLimitScale.toFixed(3)} (60%分位)`);

    // 第三步：應用分層分位數限制，避免字號過大
    tempCache.forEach((data, idx) => {
      // 根據文字長度選擇不同的上限
      const limitScale = data.isShortText ? shortTextLimitScale : longTextLimitScale;
      const finalScale = Math.min(data.optimalScale, limitScale);
      const estimatedFontSize = data.bboxHeight * finalScale;

      this.globalFontSizeCache.set(idx, {
        estimatedFontSize: estimatedFontSize,
        bbox: data.bbox,
        scale: finalScale
      });
    });

    console.log(`[TextFittingAdapter] 預處理完成：眾數=${modeScale.toFixed(3)}, 短文字限制=${shortTextLimitScale.toFixed(3)}, 長文字限制=${longTextLimitScale.toFixed(3)}, 耗時=${(performance.now() - startTime).toFixed(0)}ms`);
    this.hasPreprocessed = true;
  }

  /**
   * 計算單個段落的最優縮放因子
   * ⚠️ 必須與 drawPlainTextWithFitting 使用相同的引數，避免估算偏差
   * @private
   */
  _calculateOptimalScale(text, bboxWidth, bboxHeight) {
    const textLength = text.length;
    const isCJK = /[\u4e00-\u9fa5]/.test(text);
    const hasNewlines = /\n/.test(text);

    // ✅ 檢測公式：如果有公式，使用更保守的估算
    const hasFormula = /\$\$?[\s\S]*?\$\$?/.test(text);
    if (hasFormula) {
      // 公式通常佔用更多垂直空間，使用保守的縮放
      return 0.5; // 固定返回較小的縮放因子
    }

    // ✅ 使用與實際渲染相同的初始行距（關鍵修復！）
    const initialLineSkip = isCJK ? 1.5 : 1.3;

    // 估算：假設使用 bboxHeight * 某個縮放因子作為字號
    // 從一個合理的縮放因子開始迭代（0.7 是常見的中等值）
    let testScale = 0.7;
    let bestScale = 0.3; // 最小值

    // 簡化迭代：嘗試幾個典型縮放值
    for (const scale of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
      const fontSize = bboxHeight * scale;

      // 估算字元寬度（基於字號）
      const estimatedCharWidth = fontSize * (isCJK ? 1.0 : 0.6);

      // 估算每行字元數（考慮90%的可用寬度）
      const effectiveWidth = bboxWidth * 0.9;
      const charsPerLine = Math.max(1, Math.floor(effectiveWidth / estimatedCharWidth));

      // 估算行數
      const estimatedLines = hasNewlines
        ? text.split('\n').length
        : Math.ceil(textLength / charsPerLine);

      // 計算總高度（使用初始行距，與實際渲染一致）
      const lineHeight = fontSize * initialLineSkip;
      const totalHeight = estimatedLines === 1
        ? fontSize * 1.2
        : (estimatedLines - 1) * lineHeight + fontSize * 1.2;

      // 如果能放下，這就是一個可行的縮放
      if (totalHeight <= bboxHeight) {
        bestScale = scale;
        break; // 找到第一個可行的（最大的）縮放就停止
      }
    }

    return bestScale;
  }

  /**
   * 計算陣列的眾數（mode）
   * @private
   */
  _calculateMode(arr) {
    if (arr.length === 0) return this.options.globalFontScale; // 回退到預設值

    // 將連續值離散化（四捨五入到0.05精度）
    const rounded = arr.map(v => Math.round(v * 20) / 20);

    // 統計頻率
    const frequency = new Map();
    rounded.forEach(val => {
      frequency.set(val, (frequency.get(val) || 0) + 1);
    });

    // 找到出現次數最多的值
    let maxCount = 0;
    let modeValue = this.options.globalFontScale;

    frequency.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        modeValue = value;
      }
    });

    return modeValue;
  }

  /**
   * 計算百分位數
   * @param {number[]} arr - 數值陣列
   * @param {number} percentile - 百分位 (0-1)，如 0.70 表示 70% 分位數
   * @returns {number} 百分位數值
   * @private
   */
  _calculatePercentile(arr, percentile) {
    if (arr.length === 0) return this.options.globalFontScale;
    if (percentile < 0 || percentile > 1) {
      console.warn('[TextFittingAdapter] 百分位引數超出範圍，使用預設值');
      return this.options.globalFontScale;
    }

    // 排序陣列（升序）
    const sorted = [...arr].sort((a, b) => a - b);

    // 計算百分位位置
    const index = percentile * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    // 線性插值
    if (lower === upper) {
      return sorted[lower];
    }
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * 繪製純文字到指定區域（帶回退方案）
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {string} text - 文字內容
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @param {number} width - 區域寬度
   * @param {number} height - 區域高度
   * @param {boolean} isShortText - 是否為短文字（如標題）
   * @param {Object} cachedInfo - 預處理的字號資訊
   */
  drawPlainTextInBox(ctx, text, x, y, width, height, isShortText = false, cachedInfo = null) {
    // 優先使用新的文字自適應引擎
    if (this.textFittingEngine) {
      const suggestedFontSize = cachedInfo ? cachedInfo.estimatedFontSize : null;
      return this.drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText, suggestedFontSize);
    }

    // 回退方案：如果引擎未初始化
    let bestFontSize = 8;
    let bestLines = [];

    let maxFontSize = Math.min(width / 10, height / 3);
    if (isShortText) {
      maxFontSize = Math.max(maxFontSize, 18);
    }

    // 從大到小尋找最佳字號
    let foundPerfectFit = false;
    for (let fontSize = maxFontSize; fontSize >= 3; fontSize -= 0.5) {
      ctx.font = `${fontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const lines = this.wrapText(ctx, text, width - 4);
      const lineHeight = fontSize * 1.5;

      const totalHeight = lines.length > 1
        ? (lines.length - 1) * lineHeight + fontSize * 1.3 + 8
        : fontSize * 1.3 + 8;

      if (totalHeight <= height) {
        bestFontSize = fontSize;
        bestLines = lines;
        foundPerfectFit = true;
        break;
      }
    }

    // 極端情況處理
    if (!foundPerfectFit) {
      bestFontSize = 3;
      ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      const allLines = this.wrapText(ctx, text, width - 4);
      const lineHeight = bestFontSize * 1.5;

      const totalHeight = allLines.length > 1
        ? (allLines.length - 1) * lineHeight + bestFontSize * 1.3 + 8
        : bestFontSize * 1.3 + 8;

      if (totalHeight > height) {
        const availableHeight = height - 8;
        const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
        bestLines = allLines.slice(0, maxLines);
      } else {
        bestLines = allLines;
      }
    }

    // 短文字最小字號限制
    if (isShortText && bestLines.length === 1 && bestFontSize < 14) {
      bestFontSize = 14;
      ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
      bestLines = this.wrapText(ctx, text, width - 4);
    }

    // 繪製文字
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.font = `${bestFontSize}px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;

    const lineHeight = bestFontSize * 1.5;

    bestLines.forEach((line, i) => {
      const lineY = y + 4 + i * lineHeight;
      ctx.fillText(line, x + 2, lineY);
    });
  }

  /**
   * 使用文字自適應演算法繪製文字（最佳化版，支援動態行距調整）
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {string} text - 文字內容
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @param {number} width - 區域寬度
   * @param {number} height - 區域高度
   * @param {boolean} isShortText - 是否為短文字
   * @param {number} suggestedFontSize - 建議字號（來自預處理）
   */
  drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText = false, suggestedFontSize = null) {
    try {
      // 判斷是否為 CJK 語言
      const isCJK = /[\u4e00-\u9fa5]/.test(text);

      // 內邊距：對小bbox減少padding避免裁剪
      const paddingTop = height < 20 ? 0.5 : 2;
      const paddingX = 2;
      const availableHeight = height - paddingTop * 2;
      const availableWidth = width - paddingX * 2;

      // 字號範圍估算
      const estimatedSingleLineFontSize = height * 0.8;

      // 最小字號：動態調整（基於bbox高度）
      let minFontSize;
      if (height < 20) {
        minFontSize = Math.max(6, height * 0.35);  // 小bbox：最小6px
      } else {
        minFontSize = isShortText ? 10 : 8;  // 正常bbox：10px/8px
      }

      const maxFontSize = Math.min(estimatedSingleLineFontSize * 1.5, height * 1.2);

      const hasNewlines = text.includes('\n');
      const textLength = text.length;

      console.log(`[TextFitting] 開始: "${text.substring(0, 30)}..." bbox=${width.toFixed(0)}x${height.toFixed(0)}, 字號範圍=${minFontSize.toFixed(1)}-${maxFontSize.toFixed(1)}px, 文字長度=${textLength}, 有換行=${hasNewlines}`);

      // 寬度因子（優先使用全寬）
      const widthFactors = (textLength < 20 || hasNewlines)
        ? [1.0]
        : [1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70];

      let bestSolution = null;

      // 動態行距策略：初始值 → 逐步縮小
      const initialLineSkip = isCJK ? 1.5 : 1.3;
      const lineSkipStep = 0.1;
      const minLineSkip = 1.1; // 最小行距

      // 對每個寬度因子和行距組合，使用二分查詢找到最大可用字號
      for (const widthFactor of widthFactors) {
        const effectiveWidth = availableWidth * widthFactor;

        // 嘗試不同的行距
        for (let currentLineSkip = initialLineSkip; currentLineSkip >= minLineSkip; currentLineSkip -= lineSkipStep) {
          let low = minFontSize;
          let high = maxFontSize;
          let foundFontSize = null;
          let foundLines = null;

          while (high - low > 0.5) {
            const mid = (low + high) / 2;

            ctx.font = `${mid}px Arial, "Microsoft YaHei", "SimHei", sans-serif`;
            const lines = this.wrapText(ctx, text, effectiveWidth);
            const lineHeight = mid * currentLineSkip;

            const totalHeight = lines.length === 1
              ? mid * 1.2
              : (lines.length - 1) * lineHeight + mid * 1.2;

            if (totalHeight <= availableHeight) {
              foundFontSize = mid;
              foundLines = lines;
              low = mid;
            } else {
              high = mid;
            }
          }

          if (foundFontSize) {
            // 找到可行方案，優先選擇字號大、行距大的方案
            const quality = foundFontSize * currentLineSkip; // 綜合質量評分
            if (!bestSolution || quality > (bestSolution.fontSize * bestSolution.lineSkip)) {
              bestSolution = {
                fontSize: foundFontSize,
                widthFactor,
                lines: foundLines,
                lineSkip: currentLineSkip
              };
            }
            break; // 找到可行方案後，不需要繼續縮小行距
          }
        }
      }

      // 沒找到合適方案，使用最小字號和最小行距
      if (!bestSolution) {
        ctx.font = `${minFontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`;
        const lines = this.wrapText(ctx, text, availableWidth);
        const lineHeight = minFontSize * minLineSkip;
        const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
        bestSolution = {
          fontSize: minFontSize,
          widthFactor: 1.0,
          lines: lines.slice(0, maxLines),
          lineSkip: minLineSkip
        };
      }

      // 繪製文字
      const { fontSize, lines, lineSkip } = bestSolution;
      const lineHeight = fontSize * lineSkip;

      ctx.fillStyle = '#000';
      ctx.textBaseline = 'top';
      ctx.font = `${fontSize}px Arial, "Microsoft YaHei", "SimHei", sans-serif`;

      const totalTextHeight = lines.length === 1
        ? fontSize
        : (lines.length - 1) * lineHeight + fontSize;

      const startY = y + paddingTop + (availableHeight - totalTextHeight) / 2;

      lines.forEach((line, i) => {
        const lineY = startY + i * lineHeight;
        const lineWidth = ctx.measureText(line).width;
        const lineX = x + paddingX + (availableWidth - lineWidth) / 2;
        ctx.fillText(line, lineX, lineY);
      });

      console.log(`[TextFitting] 完成: 字號=${fontSize.toFixed(1)}px, 行數=${lines.length}, 行距=${lineSkip.toFixed(2)}, 寬度因子=${bestSolution.widthFactor}`);

    } catch (error) {
      console.error('[TextFitting] 渲染失敗:', error);
      // 回退到簡單繪製
      ctx.fillStyle = '#000';
      ctx.font = '12px "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
      ctx.fillText(text.substring(0, 50), x + 2, y + 2);
    }
  }

  /**
   * 文字換行演算法（支援中英文混排間距）
   * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
   * @param {string} text - 文字內容
   * @param {number} maxWidth - 最大寬度
   * @returns {Array} 換行後的文字陣列
   */
  wrapText(ctx, text, maxWidth) {
    if (!text) return [];

    const lines = [];
    let currentLine = '';

    // 按自然斷句分段
    const segments = text.split(/([。？！，、；：\n])/);

    for (let segment of segments) {
      if (!segment) continue;

      // 標點符號直接加到當前行
      if (/^[。？！，、；：]$/.test(segment)) {
        currentLine += segment;
        continue;
      }

      // 換行字元強制換行
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

        // 計算寬度時考慮中英文混排間距
        const lineWidth = this._measureTextWithCJKSpacing(ctx, testLine);

        if (lineWidth > maxWidth && currentLine.length > 0) {
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
   * 測量文字寬度（考慮中英文混排間距）
   * @private
   */
  _measureTextWithCJKSpacing(ctx, text) {
    if (!text) return 0;

    let totalWidth = ctx.measureText(text).width;
    let spacingCount = 0;

    // 計算需要新增間距的位置數量
    for (let i = 0; i < text.length - 1; i++) {
      if (this._needsCJKWesternSpacing(text[i], text[i + 1])) {
        spacingCount++;
      }
    }

    // 每個間距新增0.5個字元寬度
    const avgCharWidth = ctx.measureText('中').width; // 使用CJK字元寬度作為基準
    totalWidth += spacingCount * avgCharWidth * 0.5;

    return totalWidth;
  }

  /**
   * 判斷兩個字元之間是否需要新增間距
   * @private
   */
  _needsCJKWesternSpacing(char1, char2) {
    // 黑名單：這些字元不需要新增間距
    // 包括：中文標點、數學公式標記符號($)、括號等
    const punctuationBlacklist = /[，。、；：！？""''（）《》【】…—$]/;

    if (punctuationBlacklist.test(char1) || punctuationBlacklist.test(char2)) {
      return false;
    }

    const isCJK1 = /[\u4e00-\u9fa5]/.test(char1);
    const isCJK2 = /[\u4e00-\u9fa5]/.test(char2);
    const isWestern1 = /[a-zA-Z0-9]/.test(char1);
    const isWestern2 = /[a-zA-Z0-9]/.test(char2);

    // CJK → Western 或 Western → CJK 需要間距
    return (isCJK1 && isWestern2) || (isWestern1 && isCJK2);
  }

  /**
   * 渲染文字中的數學公式（KaTeX）
   * @param {string} text - 包含公式的文字
   * @returns {string} 渲染後的 HTML
   */
  renderFormulasInText(text) {
    // 使用快取避免重複渲染
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

        // 快取結果（最多 500 條）
        if (this._formulaCache.size < 500) {
          this._formulaCache.set(text, result);
        }

        return result;
      } catch (e) {
        if (!this._katexWarned) {
          console.warn('[TextFittingAdapter] KaTeX 渲染失敗:', e);
          this._katexWarned = true;
        }
        return text;
      }
    } else {
      if (!this._katexUnavailableWarned) {
        console.warn('[TextFittingAdapter] renderMathInElement 不可用');
        this._katexUnavailableWarned = true;
      }
      return text;
    }
  }

  /**
   * 清除快取
   */
  clearCache() {
    this.globalFontSizeCache.clear();
    this._formulaCache.clear();
    this.hasPreprocessed = false;
  }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextFittingAdapter;
}
