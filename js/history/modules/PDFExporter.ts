/**
 * PDFExporter.js
 * PDF匯出模組
 * 負責將翻譯內容匯出為PDF檔案
 */

class PDFExporter {
  constructor(options = {}) {
    this.options = Object.assign({
      fontUrl: 'https://gcore.jsdelivr.net/npm/source-han-sans-cn@1.0.0/SourceHanSansCN-Normal.otf',
      pdfLibUrl: 'https://gcore.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
      fontkitUrl: 'https://gcore.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
      bboxNormalizedRange: 1000
    }, options);

    // 庫載入狀態
    this.pdfLibLoaded = false;
    this.fontkitLoaded = false;
  }

  /**
   * 匯出結構化翻譯PDF
   * @param {string} originalPdfBase64 - 原始PDF的Base64編碼
   * @param {Array} translatedContentList - 翻譯內容列表
   * @param {Function} showNotification - 通知函式
   */
  async exportStructuredTranslation(originalPdfBase64, translatedContentList, showNotification = null) {
    try {
      // 檢查是否有翻譯資料
      if (!translatedContentList || translatedContentList.length === 0) {
        if (showNotification) {
          showNotification('沒有翻譯內容可匯出', 'warning');
        }
        return;
      }

      // 檢查是否有原始PDF資料
      if (!originalPdfBase64) {
        if (showNotification) {
          showNotification('原始PDF資料不可用', 'error');
        }
        return;
      }

      // 顯示進度提示
      if (showNotification) {
        showNotification('正在生成譯文PDF，請稍候...', 'info');
      }

      // 動態載入 pdf-lib
      if (typeof PDFLib === 'undefined') {
        console.log('[PDFExporter] 正在載入 pdf-lib...');
        await this.loadPdfLib();
      }

      const { PDFDocument, rgb } = PDFLib;

      // 載入原始PDF
      const pdfBytes = this.base64ToUint8Array(originalPdfBase64);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // 註冊 fontkit
      if (typeof fontkit !== 'undefined') {
        pdfDoc.registerFontkit(fontkit);
        console.log('[PDFExporter] fontkit 已註冊');
      } else {
        console.warn('[PDFExporter] fontkit 未載入，無法嵌入自定義字型');
      }

      // 載入中文字型
      let font = null;
      try {
        if (typeof fontkit === 'undefined') {
          throw new Error('fontkit 未載入，無法嵌入中文字型');
        }

        console.log('[PDFExporter] 正在載入中文字型...');
        const fontBytes = await fetch(this.options.fontUrl).then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.arrayBuffer();
        });

        font = await pdfDoc.embedFont(fontBytes);
        console.log('[PDFExporter] 中文字型載入成功');
      } catch (fontError) {
        console.error('[PDFExporter] 中文字型載入失敗:', fontError);
        if (showNotification) {
          showNotification('中文字型載入失敗，無法匯出PDF: ' + fontError.message, 'error');
        }
        throw fontError;
      }

      // ✅ 預處理：計算全域字號限制（與Canvas渲染保持一致）
      const fontSizeLimits = this.preprocessPdfFontSizes(pdfDoc, font, translatedContentList);

      // 按頁面分組翻譯內容
      const pageContentMap = new Map();
      translatedContentList.forEach((item, idx) => {
        if (item.type !== 'text' || !item.text || !item.bbox) return;

        const pageIdx = item.page_idx !== undefined ? item.page_idx : 0;
        if (!pageContentMap.has(pageIdx)) {
          pageContentMap.set(pageIdx, []);
        }
        pageContentMap.get(pageIdx).push({ ...item, originalIndex: idx });
      });

      const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;

      // 走訪每一頁，覆蓋翻譯文字
      for (const [pageIdx, items] of pageContentMap.entries()) {
        if (pageIdx >= pdfDoc.getPageCount()) continue;

        const page = pdfDoc.getPage(pageIdx);
        const { width: pageWidth, height: pageHeight } = page.getSize();

        // 計算縮放因子
        const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
        const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

        console.log(`[PDFExporter] 頁面 ${pageIdx}: PDF尺寸=${pageWidth.toFixed(2)}x${pageHeight.toFixed(2)}pt, 縮放比例=${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);

        // 用白色矩形覆蓋原文
        items.forEach(item => {
          const bbox = item.bbox;
          const x = bbox[0] * scaleX;
          const y = pageHeight - (bbox[3] * scaleY);
          const width = (bbox[2] - bbox[0]) * scaleX;
          const height = (bbox[3] - bbox[1]) * scaleY;

          page.drawRectangle({
            x: x,
            y: y,
            width: width,
            height: height,
            color: rgb(1, 1, 1),
          });
        });

        // 繪製翻譯文字
        items.forEach(item => {
          const bbox = item.bbox;
          const text = item.text || '';

          if (!text.trim()) return;

          // 計算bbox在PDF座標系中的位置
          const x = bbox[0] * scaleX;
          const boxWidth = (bbox[2] - bbox[0]) * scaleX;
          const boxHeight = (bbox[3] - bbox[1]) * scaleY;
          const bboxTop = pageHeight - (bbox[1] * scaleY);
          const bboxBottom = pageHeight - (bbox[3] * scaleY);

          // 判斷是否為短文字（與TextFittingAdapter保持一致）
          const isShortText = text.length < 50 || (/\n/.test(text) && text.length < 80);

          // 使用文字版面演算法（應用全域字號限制）
          const layout = this.calculatePdfTextLayout(font, text, boxWidth, boxHeight, isShortText, fontSizeLimits);
          const { fontSize, lines, lineHeight } = layout;

          const paddingTop = 2;
          const paddingX = 2;
          const availableHeight = boxHeight - paddingTop * 2;

          // 計算總高度並垂直居中
          const totalHeight = lines.length > 0
            ? (lines.length - 1) * lineHeight + fontSize
            : 0;
          const yOffset = (availableHeight - totalHeight) / 2;

          // 繪製每一行（PDF座標系：Y軸從下往上，所以從頂部開始往下繪製）
          lines.forEach((line, lineIdx) => {
            // 從頂部開始，每一行往下偏移
            const lineY = bboxTop - paddingTop - yOffset - (lineIdx * lineHeight);

            if (lineY < bboxBottom || lineY > bboxTop) return;

            page.drawText(line, {
              x: x + paddingX,
              y: lineY,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
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

      // 下載檔案
      if (typeof saveAs === 'function') {
        saveAs(blob, filename);
        if (showNotification) {
          showNotification('譯文PDF匯出成功！', 'success');
        }
      } else {
        // 後備方案
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (showNotification) {
          showNotification('譯文PDF匯出成功！', 'success');
        }
      }

    } catch (error) {
      console.error('[PDFExporter] 匯出PDF失敗:', error);
      if (showNotification) {
        showNotification('匯出失敗: ' + error.message, 'error');
      }
    }
  }

  /**
   * 預處理PDF字號：計算全域字號限制（與TextFittingAdapter演算法一致）
   * @param {Object} pdfDoc - pdf-lib文件物件
   * @param {Object} font - pdf-lib字型物件
   * @param {Array} translatedContentList - 翻譯內容列表
   * @returns {Object} { shortTextLimit, longTextLimit } 字號限制（單位：pt）
   */
  preprocessPdfFontSizes(pdfDoc, font, translatedContentList) {
    console.log('[PDFExporter] 開始預處理全域字號（計算百分位數限制）...');
    const startTime = performance.now();

    const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;
    const allScales = [];
    const allBboxHeights = [];

    // 收集所有段落的最優縮放因子和bbox高度
    translatedContentList.forEach((item, idx) => {
      if (item.type !== 'text' || !item.text || !item.bbox) return;

      const bbox = item.bbox;
      const pageIdx = item.page_idx !== undefined ? item.page_idx : 0;

      if (pageIdx >= pdfDoc.getPageCount()) return;

      const page = pdfDoc.getPage(pageIdx);
      const { width: pageWidth, height: pageHeight } = page.getSize();

      const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
      const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;

      const boxWidth = (bbox[2] - bbox[0]) * scaleX;
      const boxHeight = (bbox[3] - bbox[1]) * scaleY;
      const text = item.text;

      // 收集bbox高度（用於計算平均值）
      allBboxHeights.push(boxHeight);

      // 檢測公式和短文字
      const hasFormula = /\$\$?[\s\S]*?\$\$?/.test(text);
      const isShortText = text.length < 50 || (/\n/.test(text) && text.length < 80);

      // 計算最優縮放（字號/bbox高度）
      const optimalScale = this._calculateOptimalScaleForPdf(font, text, boxWidth, boxHeight, hasFormula);

      // 按字元數加權取樣
      const unitCount = Math.max(1, Math.floor(text.length / 10));
      for (let i = 0; i < unitCount; i++) {
        allScales.push(optimalScale);
      }
    });

    // 計算百分位數（縮放因子的百分位數，不是字號）
    const percentile60 = this._calculatePercentile(allScales, 0.60);
    const percentile80 = this._calculatePercentile(allScales, 0.80);

    const result = {
      shortTextLimitScale: percentile80,  // 短文字縮放因子上限（80%百分位）
      longTextLimitScale: percentile60    // 長文字縮放因子上限（60%百分位）
    };

    console.log(`[PDFExporter] 預處理完成: 樣本數=${allScales.length}`);
    console.log(`[PDFExporter] 百分位數: 60%=${percentile60.toFixed(3)}, 80%=${percentile80.toFixed(3)}, 耗時=${(performance.now() - startTime).toFixed(0)}ms`);
    console.log(`[PDFExporter] 縮放因子限制: 短文字≤${result.shortTextLimitScale.toFixed(3)} (80%分位), 長文字≤${result.longTextLimitScale.toFixed(3)} (60%分位)`);

    return result;
  }

  /**
   * 計算單個段落的最優縮放因子（PDF版本）
   * @private
   */
  _calculateOptimalScaleForPdf(font, text, boxWidth, boxHeight, hasFormula = false) {
    if (hasFormula) return 0.5; // 公式使用保守縮放

    const isCJK = /[\u4e00-\u9fa5]/.test(text);
    const hasNewlines = /\n/.test(text);
    const textLength = text.length;
    const initialLineSkip = isCJK ? 1.5 : 1.3;

    // 迭代嘗試不同縮放因子
    for (const scale of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
      const fontSize = boxHeight * scale;
      const estimatedCharWidth = fontSize * (isCJK ? 1.0 : 0.6);
      const effectiveWidth = boxWidth * 0.9;
      const charsPerLine = Math.max(1, Math.floor(effectiveWidth / estimatedCharWidth));
      const estimatedLines = hasNewlines ? text.split('\n').length : Math.ceil(textLength / charsPerLine);

      const lineHeight = fontSize * initialLineSkip;
      const totalHeight = estimatedLines === 1 ? fontSize * 1.2 : (estimatedLines - 1) * lineHeight + fontSize * 1.2;

      if (totalHeight <= boxHeight) {
        return scale; // 找到第一個可行的縮放
      }
    }

    return 0.3; // 最小縮放
  }

  /**
   * 計算百分位數（線性插值法）
   * @private
   */
  _calculatePercentile(arr, percentile) {
    if (arr.length === 0) return 0.85; // 預設值

    const sorted = [...arr].sort((a, b) => a - b);
    const index = percentile * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * 計算PDF文字版面（與Canvas渲染演算法一致）
   * @param {Object} font - pdf-lib字型物件
   * @param {string} text - 文字內容
   * @param {number} boxWidth - 區域寬度
   * @param {number} boxHeight - 區域高度
   * @param {boolean} isShortText - 是否為短文字
   * @param {Object} fontSizeLimits - 全域字號限制 { shortTextLimit, longTextLimit }
   * @returns {Object} { fontSize, lines, lineHeight }
   */
  calculatePdfTextLayout(font, text, boxWidth, boxHeight, isShortText = false, fontSizeLimits = null) {
    // 判斷是否為 CJK 語言
    const isCJK = /[\u4e00-\u9fa5]/.test(text);
    // ✅ 使用與Canvas渲染一致的初始行距
    const lineSkip = isCJK ? 1.5 : 1.3;

    // 內邊距：對小bbox減少padding避免裁剪
    const paddingTop = boxHeight < 20 ? 0.5 : 2;
    const paddingX = 2;
    const availableHeight = boxHeight - paddingTop * 2;
    const availableWidth = boxWidth - paddingX * 2;

    // 字號範圍
    const estimatedSingleLineFontSize = boxHeight * 0.8;

    // 最小字號：動態調整（基於bbox高度）
    let minFontSize;
    if (boxHeight < 20) {
      minFontSize = Math.max(6, boxHeight * 0.35);  // 小bbox：最小6px
    } else {
      minFontSize = isShortText ? 10 : 8;  // 正常bbox：10px/8px
    }

    let maxFontSize = Math.min(estimatedSingleLineFontSize * 1.5, boxHeight * 1.2);

    // ✅ 應用全域縮放因子限制（與Canvas渲染保持一致）
    if (fontSizeLimits) {
      const limitScale = isShortText ? fontSizeLimits.shortTextLimitScale : fontSizeLimits.longTextLimitScale;
      const limitFontSize = boxHeight * limitScale;  // 縮放因子 × bbox高度 = 字號上限
      maxFontSize = Math.min(maxFontSize, limitFontSize);
    }

    const hasNewlines = text.includes('\n');
    const textLength = text.length;

    // 寬度因子
    const widthFactors = (textLength < 20 || hasNewlines)
      ? [1.0]
      : [1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70];

    let bestSolution = null;

    // 二分查詢最大可用字號
    for (const widthFactor of widthFactors) {
      const effectiveWidth = availableWidth * widthFactor;

      let low = minFontSize;
      let high = maxFontSize;
      let foundFontSize = null;
      let foundLines = null;

      while (high - low > 0.5) {
        const mid = (low + high) / 2;

        const lines = this.wrapTextForPdf(font, text, effectiveWidth, mid);
        const lineHeight = mid * lineSkip;

        // 與Canvas渲染保持一致：最後一行使用 mid * 1.2 留出垂直空間
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

      if (foundFontSize && (!bestSolution || foundFontSize > bestSolution.fontSize)) {
        bestSolution = {
          fontSize: foundFontSize,
          widthFactor: widthFactor,
          lines: foundLines,
          lineHeight: foundFontSize * lineSkip
        };
      }
    }

    // 返回最優解
    if (bestSolution) {
      return bestSolution;
    }

    // 後備方案
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
   * PDF文字換行（使用pdf-lib字型測量）
   * @param {Object} font - pdf-lib字型物件
   * @param {string} text - 文字內容
   * @param {number} maxWidth - 最大寬度
   * @param {number} fontSize - 字號
   * @returns {Array} 換行後的文字陣列
   */
  wrapTextForPdf(font, text, maxWidth, fontSize) {
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
    // 載入 pdf-lib
    if (typeof PDFLib === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = this.options.pdfLibUrl;
        script.onload = () => {
          console.log('[PDFExporter] pdf-lib 載入成功');
          this.pdfLibLoaded = true;
          resolve();
        };
        script.onerror = (error) => {
          console.error('[PDFExporter] pdf-lib 載入失敗:', error);
          reject(new Error('Failed to load pdf-lib library'));
        };
        document.head.appendChild(script);
      });
    }

    // 載入 fontkit
    if (typeof fontkit === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = this.options.fontkitUrl;
        script.onload = () => {
          console.log('[PDFExporter] fontkit 載入成功');
          this.fontkitLoaded = true;
          resolve();
        };
        script.onerror = (error) => {
          console.warn('[PDFExporter] fontkit 載入失敗:', error);
          resolve(); // fontkit失敗不阻止流程
        };
        document.head.appendChild(script);
      });
    }
  }

  /**
   * Base64 轉 Uint8Array
   * @param {string} base64 - Base64編碼字串
   * @returns {Uint8Array} 位元組陣列
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
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PDFExporter;
}
