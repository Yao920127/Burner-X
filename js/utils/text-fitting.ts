// utils/text-fitting.js
// 文字自適應演算法 - 為 PDF 保留格式翻譯最佳化

/**
 * 文字自適應引擎
 *
 * 核心功能：
 * 1. 自動計算最優字型大小，讓翻譯文字完美適配原始 bbox
 * 2. 智慧換行和行距控制
 * 3. CJK 和西文混排最佳化
 * 4. 空間不足時自動縮放或擴充容器
 *
 * 設計原則：
 * - 漸進式縮放搜尋（從 100% 開始逐步縮小）
 * - 全域一致性（使用統計方法統一字型大小）
 * - 智慧空間擴充（優先向下，次選向右）
 */
class TextFittingEngine {
  constructor(options = {}) {
    // 核心引數
    this.INITIAL_SCALE = options.initialScale || 1.0;
    this.MIN_SCALE = options.minScale || 0.1;
    this.SCALE_STEP_HIGH = options.scaleStepHigh || 0.05; // >0.6 時的步長
    this.SCALE_STEP_LOW = options.scaleStepLow || 0.1;    // <0.6 時的步長
    this.EXPAND_THRESHOLD = options.expandThreshold || 0.7; // 觸發空間擴充的閾值

    // 行距配置（根據排版規範最佳化）
    this.LINE_SKIP_CJK = options.lineSkipCJK || 1.30;  // 降低中文行距，更緊湊
    this.LINE_SKIP_WESTERN = options.lineSkipWestern || 1.20;  // 降低西文行距
    this.MIN_LINE_HEIGHT = options.minLineHeight || 1.05;

    // 間距配置
    this.CJK_SPACE_WIDTH_RATIO = options.cjkSpaceRatio || 0.5;
    this.MIXED_LANG_SPACE_RATIO = options.mixedLangSpaceRatio || 0.5;
    this.FIRST_LINE_INDENT_SPACES = options.firstLineIndent || 4;

    // 擴充邊距
    this.BOTTOM_EXPAND_MARGIN = options.bottomExpandMargin || 2;
    this.RIGHT_EXPAND_MARGIN = options.rightExpandMargin || -5;

    // Canvas 上下文（用於精確測量文字寬度）
    this._measureCanvas = null;
    this._measureContext = null;
  }

  /**
   * 為單個段落計算最優縮放因子
   *
   * @param {string} text - 翻譯後的文字
   * @param {Object} bbox - 邊界框 [x0, y0, x1, y1]
   * @param {number} originalFontSize - 原始字型大小
   * @param {string} fontFamily - 字型族
   * @param {boolean} isCJK - 是否為 CJK 語言
   * @param {Object} options - 額外選項
   * @returns {Object} { scale, reason, fitsWithoutExpansion }
   */
  calculateOptimalScale(text, bbox, originalFontSize, fontFamily = 'Arial', isCJK = false, options = {}) {
    if (!text || !bbox || bbox.length < 4) {
      return { scale: 1.0, reason: 'invalid_input', fitsWithoutExpansion: true };
    }

    const [x0, y0, x1, y1] = bbox;
    const availableWidth = x1 - x0;
    const availableHeight = y1 - y0;

    if (availableWidth <= 0 || availableHeight <= 0) {
      return { scale: 1.0, reason: 'invalid_bbox', fitsWithoutExpansion: true };
    }

    // 獲取行距倍數
    const lineSkip = isCJK ? this.LINE_SKIP_CJK : this.LINE_SKIP_WESTERN;
    let currentScale = this.INITIAL_SCALE;

    // 漸進式搜尋最優縮放
    while (currentScale >= this.MIN_SCALE) {
      const scaledFontSize = originalFontSize * currentScale;
      const layout = this._layoutText(
        text,
        availableWidth,
        availableHeight,
        scaledFontSize,
        fontFamily,
        lineSkip,
        isCJK,
        options
      );

      // 如果所有文字都放得下
      if (layout.fitsCompletely) {
        return {
          scale: currentScale,
          reason: 'fits_perfectly',
          fitsWithoutExpansion: true,
          lineCount: layout.lineCount,
          actualHeight: layout.actualHeight
        };
      }

      // 減小縮放因子
      if (currentScale > 0.6) {
        currentScale -= this.SCALE_STEP_HIGH;
      } else {
        currentScale -= this.SCALE_STEP_LOW;
      }
    }

    // 無法適配，返回最小縮放
    return {
      scale: this.MIN_SCALE,
      reason: 'requires_expansion',
      fitsWithoutExpansion: false,
      requiresExpansion: true
    };
  }

  /**
   * 版面文字（模擬排版）
   *
   * @private
   * @param {string} text
   * @param {number} maxWidth
   * @param {number} maxHeight
   * @param {number} fontSize
   * @param {string} fontFamily
   * @param {number} lineSkip
   * @param {boolean} isCJK
   * @param {Object} options
   * @returns {Object} { fitsCompletely, lineCount, actualHeight }
   */
  _layoutText(text, maxWidth, maxHeight, fontSize, fontFamily, lineSkip, isCJK, options = {}) {
    const lines = [];
    const words = this._tokenizeText(text, isCJK);
    let currentLine = '';
    let currentWidth = 0;
    const spaceWidth = this._measureTextWidth(' ', fontSize, fontFamily);
    const cjkSpaceWidth = fontSize * this.CJK_SPACE_WIDTH_RATIO;

    // 首行縮排
    if (options.firstLineIndent) {
      currentWidth = cjkSpaceWidth * this.FIRST_LINE_INDENT_SPACES;
    }

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // 處理換行字元：強制換行（和 wrapText 保持一致）
      if (word === '\n') {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
          currentWidth = 0;
        }
        continue;
      }

      const wordWidth = this._measureTextWidth(word, fontSize, fontFamily);

      // 標點符號：直接加到當前行（和 wrapText 保持一致）
      if (isCJK && /^[。？！，、；：]$/.test(word)) {
        currentLine += word;
        currentWidth += wordWidth;
        continue;
      }

      // 中英文混排：新增間距
      const lastChar = currentLine.slice(-1);
      const needsMixedSpace = lastChar &&
                              this._isCJKChar(lastChar) !== this._isCJKChar(word[0]);
      const mixedSpaceWidth = needsMixedSpace ? (spaceWidth * this.MIXED_LANG_SPACE_RATIO) : 0;

      // 檢查是否需要換行
      const totalWidth = currentWidth + mixedSpaceWidth + wordWidth;
      if (totalWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = word;
        currentWidth = wordWidth;
      } else {
        if (needsMixedSpace) {
          currentWidth += mixedSpaceWidth;
        }
        currentLine += word;
        currentWidth += wordWidth;
      }
    }

    // 新增最後一行
    if (currentLine) {
      lines.push(currentLine);
    }

    // 計算總高度
    const lineHeight = fontSize * lineSkip;
    const actualHeight = lines.length * lineHeight;

    return {
      fitsCompletely: actualHeight <= maxHeight,
      lineCount: lines.length,
      actualHeight: actualHeight,
      lines: lines
    };
  }

  /**
   * 分詞（支援 CJK 和西文）
   *
   * 重要：這個方法的分詞邏輯必須和 history_pdf_compare.js 中的 wrapText() 保持一致！
   *
   * @private
   * @param {string} text
   * @param {boolean} isCJK
   * @returns {Array<string>}
   */
  _tokenizeText(text, isCJK) {
    if (!text) return [];

    if (isCJK) {
      // CJK：按標點符號分段，然後每個字元作為一個單元
      // 這和 wrapText() 的邏輯保持一致
      const tokens = [];
      const segments = text.split(/([。？！，、；：\n])/);

      for (let segment of segments) {
        if (!segment) continue;

        // 標點符號作為獨立 token
        if (/^[。？！，、；：]$/.test(segment)) {
          tokens.push(segment);
        } else if (segment === '\n') {
          tokens.push('\n'); // 換行字元作為獨立 token
        } else {
          // 其他字元逐個分割
          tokens.push(...segment.split(''));
        }
      }

      return tokens;
    } else {
      // 西文：按空格和標點分詞
      return text.match(/\S+|\s+/g) || [];
    }
  }

  /**
   * 判斷是否為 CJK 字元
   *
   * @private
   * @param {string} char
   * @returns {boolean}
   */
  _isCJKChar(char) {
    if (!char || char.length === 0) return false;
    const code = char.charCodeAt(0);
    return (
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
      (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols and Punctuation
      (code >= 0xFF00 && code <= 0xFFEF) ||   // Fullwidth Forms
      (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul Syllables
      (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
      (code >= 0x30A0 && code <= 0x30FF)      // Katakana
    );
  }

  /**
   * 測量文字寬度（使用 Canvas）
   *
   * @private
   * @param {string} text
   * @param {number} fontSize
   * @param {string} fontFamily
   * @returns {number}
   */
  _measureTextWidth(text, fontSize, fontFamily) {
    if (!this._measureContext) {
      this._measureCanvas = document.createElement('canvas');
      this._measureContext = this._measureCanvas.getContext('2d');
    }

    this._measureContext.font = `${fontSize}px ${fontFamily}`;
    return this._measureContext.measureText(text).width;
  }

  /**
   * 批次計算最優縮放（全域一致性）
   *
   * 實現策略：
   * 1. 計算每個段落的最優縮放
   * 2. 使用眾數作為全域縮放
   * 3. 統一所有段落的縮放
   *
   * @param {Array<Object>} items - content_list.json 的項陣列
   * @param {string} fontFamily
   * @param {string} targetLang
   * @returns {Object} { globalScale, itemScales }
   */
  calculateGlobalScale(items, fontFamily = 'Arial', targetLang = 'zh-TW') {
    const isCJK = this._isTargetLangCJK(targetLang);
    const scales = [];
    const itemScales = [];

    for (const item of items) {
      if (item.type !== 'text' || !item.text || !item.bbox) {
        itemScales.push(null);
        continue;
      }

      // 估算原始字型大小（基於 bbox 高度）
      const bboxHeight = item.bbox[3] - item.bbox[1];
      const estimatedFontSize = bboxHeight * 0.8; // 經驗值：bbox 高度的 80%

      const result = this.calculateOptimalScale(
        item.text,
        item.bbox,
        estimatedFontSize,
        fontFamily,
        isCJK
      );

      scales.push(result.scale);
      itemScales.push(result);
    }

    // 計算眾數（最常見的縮放因子）
    const globalScale = this._calculateMode(scales);

    // 統一所有段落的縮放（大於眾數的降為眾數）
    for (let i = 0; i < itemScales.length; i++) {
      if (itemScales[i] && itemScales[i].scale > globalScale) {
        itemScales[i].scale = globalScale;
        itemScales[i].reason = 'global_consistency';
      }
    }

    return { globalScale, itemScales };
  }

  /**
   * 計算眾數
   *
   * @private
   * @param {Array<number>} values
   * @returns {number}
   */
  _calculateMode(values) {
    if (!values || values.length === 0) return 1.0;

    const frequency = {};
    let maxFreq = 0;
    let mode = values[0];

    for (const value of values) {
      if (value == null) continue;
      const rounded = Math.round(value * 100) / 100; // 保留兩位小數
      frequency[rounded] = (frequency[rounded] || 0) + 1;

      if (frequency[rounded] > maxFreq) {
        maxFreq = frequency[rounded];
        mode = rounded;
      }
    }

    return mode;
  }

  /**
   * 判斷目標語言是否為 CJK
   *
   * @private
   * @param {string} targetLang
   * @returns {boolean}
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
   * 智慧擴充 bbox（當縮放無法解決時）
   *
   * @param {Array} bbox - [x0, y0, x1, y1]
   * @param {Array<Object>} allItems - 所有段落項（用於檢測障礙物）
   * @param {number} pageWidth
   * @param {number} pageHeight
   * @returns {Array} 擴充後的 bbox
   */
  expandBbox(bbox, allItems, pageWidth, pageHeight) {
    const [x0, y0, x1, y1] = bbox;
    let expandedBbox = [...bbox];
    let expanded = false;

    // 策略1：向下擴充
    const bottomSpace = this._getMaxBottomSpace(bbox, allItems, pageHeight);
    if (bottomSpace > y0) {
      expandedBbox[1] = bottomSpace + this.BOTTOM_EXPAND_MARGIN;
      expanded = true;
      console.log(`[TextFitting] 向下擴充: ${y0} -> ${expandedBbox[1]}`);
    }

    // 策略2：向右擴充（如果向下不夠）
    if (!expanded) {
      const rightSpace = this._getMaxRightSpace(bbox, allItems, pageWidth);
      if (rightSpace > x1) {
        expandedBbox[2] = rightSpace + this.RIGHT_EXPAND_MARGIN;
        expanded = true;
        console.log(`[TextFitting] 向右擴充: ${x1} -> ${expandedBbox[2]}`);
      }
    }

    return expandedBbox;
  }

  /**
   * 獲取下方最大可用空間
   *
   * @private
   */
  _getMaxBottomSpace(bbox, allItems, pageHeight) {
    const [x0, y0, x1, y1] = bbox;
    let minY = pageHeight * 0.1; // 頁面底部 10% 作為最小限制

    for (const item of allItems) {
      if (!item.bbox || item.bbox === bbox) continue;
      const [ix0, iy0, ix1, iy1] = item.bbox;

      // 檢查是否在當前 bbox 下方且有水平重疊
      const hasHorizontalOverlap = !(ix1 <= x0 || ix0 >= x1);
      if (iy1 < y0 && hasHorizontalOverlap) {
        minY = Math.max(minY, iy1);
      }
    }

    return minY;
  }

  /**
   * 獲取右側最大可用空間
   *
   * @private
   */
  _getMaxRightSpace(bbox, allItems, pageWidth) {
    const [x0, y0, x1, y1] = bbox;
    let maxX = pageWidth * 0.9; // 頁面右側 10% 作為最大限制

    for (const item of allItems) {
      if (!item.bbox || item.bbox === bbox) continue;
      const [ix0, iy0, ix1, iy1] = item.bbox;

      // 檢查是否在當前 bbox 右側且有垂直重疊
      const hasVerticalOverlap = !(iy1 <= y0 || iy0 >= y1);
      if (ix0 > x0 && hasVerticalOverlap) {
        maxX = Math.min(maxX, ix0);
      }
    }

    return maxX;
  }
}

// 匯出到全域
if (typeof window !== 'undefined') {
  window.TextFittingEngine = TextFittingEngine;
}

// 模組化匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextFittingEngine;
}
