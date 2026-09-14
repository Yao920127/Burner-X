# 模組修復建議清單

## 🔴 高優先順序 - 必須修復

### 1. TextFittingAdapter - 未定義的常量

**問題位置**: `TextFittingAdapter.js` line 71

**當前程式碼**:
```javascript
preprocessGlobalFontSizes(contentListJson, translatedContentList) {
  // ...
  contentListJson.forEach((item, idx) => {
    // ...
    const height = (bbox[3] - bbox[1]) / BBOX_NORMALIZED_RANGE;  // ❌ 未定義！
  });
}
```

**修復方案**:
```javascript
preprocessGlobalFontSizes(contentListJson, translatedContentList) {
  if (this.hasPreprocessed) return;

  console.log('[TextFittingAdapter] 開始預處理全域字號...');
  const startTime = performance.now();

  const globalFontScale = this.options.globalFontScale;
  const BBOX_NORMALIZED_RANGE = 1000;  // ✅ 新增這行

  contentListJson.forEach((item, idx) => {
    if (item.type !== 'text' || !item.bbox) return;

    const translatedItem = translatedContentList[idx];
    if (!translatedItem || !translatedItem.text) return;

    const bbox = item.bbox;
    const height = (bbox[3] - bbox[1]) / BBOX_NORMALIZED_RANGE;

    const estimatedFontSize = height * globalFontScale;

    this.globalFontSizeCache.set(idx, {
      estimatedFontSize: estimatedFontSize,
      bbox: bbox
    });
  });

  console.log(`[TextFittingAdapter] 預處理完成：全域縮放=${globalFontScale}, 耗時=${(performance.now() - startTime).toFixed(0)}ms`);
  this.hasPreprocessed = true;
}
```

**影響**: 🔴 嚴重 - 會導致執行時NaN錯誤

---

### 2. PDFExporter - Canvas和PDF文字高度公式不一致

**問題位置**:
- Canvas版本: `history_pdf_compare.js` line 1463-1465
- PDF版本: `PDFExporter.js` line 272-274

**當前程式碼對比**:

Canvas (錯誤):
```javascript
const totalHeight = lines.length === 1
  ? mid * 1.2  // 單行文字額外增加20%
  : (lines.length - 1) * lineHeight + mid * 1.2;
```

PDF (錯誤):
```javascript
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid  // 單行文字沒有增加
  : 0;
```

**修復方案** - 統一為一致的公式:

```javascript
// 在 PDFExporter.calculatePdfTextLayout() 中修復 (line 272-274)
// 改為與 Canvas 版本一致：

const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid * 1.2  // ✅ 與Canvas統一
  : 0;

// 同時在 drawPlainTextWithFitting() 中保持一致 (line 1463-1465)
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid * 1.2  // ✅ 保持一致
  : 0;
```

**說明**:
- 這個 `* 1.2` 是為了給文字留出額外的垂直空間
- Canvas 中確實使用了這個係數
- PDF 版本遺漏了，導致文字可能超出bbox

**影響**: 🔴 嚴重 - PDF匯出的文字大小會與Canvas顯示不同

---

### 3. SegmentManager - 事件監聽器無法清理

**問題位置**: `SegmentManager.js` lines 216-234, 397-413

**當前程式碼**:
```javascript
initLazyLoadingSegments() {
  if (!this._lazyInitialized) {
    this.originalScroll.addEventListener('scroll', () => onScroll(this.originalScroll));
    this.translationScroll.addEventListener('scroll', () => onScroll(this.translationScroll));
    // ❌ 這些匿名箭頭函式無法被移除
    this._lazyInitialized = true;
  }
}

destroy() {
  // 注意：由於事件監聽使用了箭頭函式，無法直接移除
  // 這裡設定標記位，防止繼續渲染
  // ❌ 這不能真正清理資源！
  this.segments = [];
  this.pageInfos = [];
}
```

**修復方案**:

```javascript
constructor(pdfDoc, options = {}) {
  // ... 其他初始化 ...

  this._destroyed = false;  // ✅ 新增銷燬標誌
  this._scrollHandler = null;  // ✅ 儲存事件處理函式參考
}

initLazyLoadingSegments() {
  if (!this.originalScroll || !this.translationScroll) return;

  // 初始渲染可見段
  this.renderVisibleSegments(this.originalScroll);

  const onScroll = (scroller) => {
    clearTimeout(this._lazyScrollTimer);
    this._lazyScrollTimer = setTimeout(() => {
      if (!this._destroyed) {  // ✅ 檢查銷燬標誌
        this.renderVisibleSegments(scroller);
      }
    }, this.options.scrollDebounceMs);
  };

  if (!this._lazyInitialized) {
    // ✅ 儲存事件處理函式參考以便後續移除
    this._scrollHandler = onScroll;

    const originalScrollHandler = () => onScroll(this.originalScroll);
    const translationScrollHandler = () => onScroll(this.translationScroll);

    // ✅ 儲存處理函式參考
    this._originalScrollHandler = originalScrollHandler;
    this._translationScrollHandler = translationScrollHandler;

    this.originalScroll.addEventListener('scroll', originalScrollHandler);
    this.translationScroll.addEventListener('scroll', translationScrollHandler);
    this._lazyInitialized = true;
  }
}

destroy() {
  this._destroyed = true;  // ✅ 設定銷燬標誌

  // ✅ 正確移除事件監聽器
  if (this._lazyInitialized && this.originalScroll && this.translationScroll) {
    if (this._originalScrollHandler) {
      this.originalScroll.removeEventListener('scroll', this._originalScrollHandler);
    }
    if (this._translationScrollHandler) {
      this.translationScroll.removeEventListener('scroll', this._translationScrollHandler);
    }
  }

  // ✅ 清除定時器
  if (this._lazyScrollTimer) {
    clearTimeout(this._lazyScrollTimer);
    this._lazyScrollTimer = null;
  }

  // ✅ 清空 DOM
  if (this.originalSegmentsContainer) {
    this.originalSegmentsContainer.innerHTML = '';
  }
  if (this.translationSegmentsContainer) {
    this.translationSegmentsContainer.innerHTML = '';
  }

  this.segments = [];
  this.pageInfos = [];
}
```

**影響**: 🔴 嚴重 - 記憶體洩漏，事件處理器持續執行

---

## 🟡 中優先順序 - 應該改進

### 4. TextFittingAdapter - 缺少錯誤處理改進

**問題位置**: `TextFittingAdapter.js` line 34-57

**當前程式碼**:
```javascript
initialize() {
  if (typeof TextFittingEngine === 'undefined') {
    console.error('[TextFittingAdapter] TextFittingEngine 未載入！...');
    return;  // ❌ 靜默失敗
  }
  // ...
}
```

**修復方案**:

```javascript
initialize() {
  // ✅ 改為throw，更容易被發現
  if (typeof TextFittingEngine === 'undefined') {
    throw new Error('[TextFittingAdapter] TextFittingEngine 未載入！請確保 js/utils/text-fitting.js 已正確引入');
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
    throw error;  // ✅ 將錯誤傳播給呼叫者
  }
}
```

**使用方式**:
```javascript
try {
  const textFitter = new TextFittingAdapter();
  textFitter.initialize();
} catch (error) {
  console.error('初始化失敗，將使用回退方案');
  // 處理回退...
}
```

**影響**: 🟡 中等 - 便於發現問題

---

### 5. TextFittingAdapter - 新增引數驗證

**問題位置**: `TextFittingAdapter.js` line 64-93

**當前程式碼**:
```javascript
preprocessGlobalFontSizes(contentListJson, translatedContentList) {
  // ❌ 沒有驗證引數
  if (this.hasPreprocessed) return;

  const globalFontScale = this.options.globalFontScale;

  contentListJson.forEach((item, idx) => {  // ❌ 可能不是陣列
    // ...
  });
}
```

**修復方案**:

```javascript
preprocessGlobalFontSizes(contentListJson, translatedContentList) {
  if (this.hasPreprocessed) return;

  // ✅ 新增引數驗證
  if (!contentListJson || !Array.isArray(contentListJson)) {
    console.warn('[TextFittingAdapter] 無效的 contentListJson，跳過預處理');
    return;
  }

  if (!translatedContentList || !Array.isArray(translatedContentList)) {
    console.warn('[TextFittingAdapter] 無效的 translatedContentList，跳過預處理');
    return;
  }

  console.log('[TextFittingAdapter] 開始預處理全域字號...');
  const startTime = performance.now();

  const globalFontScale = this.options.globalFontScale;
  const BBOX_NORMALIZED_RANGE = 1000;

  contentListJson.forEach((item, idx) => {
    if (item.type !== 'text' || !item.bbox) return;

    const translatedItem = translatedContentList[idx];
    if (!translatedItem || !translatedItem.text) return;

    const bbox = item.bbox;
    const height = (bbox[3] - bbox[1]) / BBOX_NORMALIZED_RANGE;

    const estimatedFontSize = height * globalFontScale;

    this.globalFontSizeCache.set(idx, {
      estimatedFontSize: estimatedFontSize,
      bbox: bbox
    });
  });

  console.log(`[TextFittingAdapter] 預處理完成：全域縮放=${globalFontScale}, 耗時=${(performance.now() - startTime).toFixed(0)}ms`);
  this.hasPreprocessed = true;
}
```

**影響**: 🟡 中等 - 防止崩潰

---

### 6. TextFittingAdapter - 新增ctx驗證

**問題位置**: `TextFittingAdapter.js` line 309

**當前程式碼**:
```javascript
wrapText(ctx, text, maxWidth) {
  if (!text) return [];

  const lines = [];
  let currentLine = '';

  // ...
  const metrics = ctx.measureText(testLine);  // ❌ ctx 可能無效
}
```

**修復方案**:

```javascript
wrapText(ctx, text, maxWidth) {
  // ✅ 新增驗證
  if (!text) return [];

  if (!ctx || typeof ctx.measureText !== 'function') {
    console.warn('[TextFittingAdapter] 無效的 canvas context');
    // 返回簡單分割
    return text.split('\n').length > 0 ? text.split('\n') : [''];
  }

  if (typeof maxWidth !== 'number' || maxWidth <= 0) {
    console.warn('[TextFittingAdapter] 無效的 maxWidth');
    return text.split('\n');
  }

  const lines = [];
  let currentLine = '';

  const segments = text.split(/([。？！，、；：\n])/);

  for (let segment of segments) {
    if (!segment) continue;

    if (/^[。？！，、；：]$/.test(segment)) {
      currentLine += segment;
      continue;
    }

    if (segment === '\n') {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      continue;
    }

    for (let i = 0; i < segment.length; i++) {
      const char = segment[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine.length > 0) {
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
```

**影響**: 🟡 中等 - 防止崩潰

---

### 7. PDFExporter - 改進fontkit失敗處理

**問題位置**: `PDFExporter.js` line 73-90, 395-410

**當前程式碼**:
```javascript
let font = null;
try {
  if (typeof fontkit === 'undefined') {
    throw new Error('fontkit 未載入，無法嵌入中文字型');
  }
  // ...
  font = await pdfDoc.embedFont(fontBytes);
} catch (fontError) {
  console.error('[PDFExporter] 中文字型載入失敗:', fontError);
  if (showNotification) {
    showNotification('中文字型載入失敗，無法匯出PDF: ' + fontError.message, 'error');
  }
  throw fontError;  // ❌ 中斷流程
}

// 但下面又有：
if (typeof fontkit === 'undefined') {
  await new Promise((resolve, reject) => {
    // ...
    script.onerror = (error) => {
      console.warn('[PDFExporter] fontkit 載入失敗:', error);
      resolve();  // ❌ 失敗也繼續！
    };
  });
}
```

**修復方案**:

```javascript
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

  // 載入 fontkit （可選，失敗不中斷）
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
        console.warn('[PDFExporter] fontkit 載入失敗，中文字型可能無法正確顯示:', error);
        this.fontkitLoaded = false;
        resolve();  // 不中斷流程，但記錄失敗
      };
      document.head.appendChild(script);
    });
  }
}

async exportStructuredTranslation(originalPdfBase64, translatedContentList, showNotification = null) {
  try {
    // ... 前面的檢查 ...

    // ✅ 改進字型載入
    let font = null;
    if (!this.fontkitLoaded) {
      console.warn('[PDFExporter] fontkit 未成功載入，中文字型可能無法正確顯示');
      if (showNotification) {
        showNotification('警告：中文字型可能無法正確顯示', 'warning');
      }
    } else {
      try {
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
          showNotification('警告：中文字型載入失敗，將使用預設字型', 'warning');
        }
        // ✅ 不中斷流程，繼續使用預設字型
      }
    }

    // 如果沒有字型，使用預設字型
    if (!font) {
      console.warn('[PDFExporter] 使用PDF預設字型，中文可能顯示為空');
      // 可以選擇使用內建字型或繼續
    }

    // ... 後續處理 ...
  } catch (error) {
    // ...
  }
}
```

**影響**: 🟡 中等 - 提高穩健性

---

### 8. PDFExporter - 新增showNotification型別檢查

**問題位置**: `PDFExporter.js` 多處

**當前程式碼**:
```javascript
if (showNotification) {
  showNotification('沒有翻譯內容可匯出', 'warning');  // ❌ 未檢查是否為函式
}
```

**修復方案**:

```javascript
// 在類中新增輔助方法
_notify(message, type = 'info') {
  if (typeof this._showNotification === 'function') {
    this._showNotification(message, type);
  } else if (!this._notificationDisabled) {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

constructor(options = {}, showNotification = null) {
  this.options = Object.assign({
    fontUrl: 'https://...',
    pdfLibUrl: 'https://...',
    fontkitUrl: 'https://...',
    bboxNormalizedRange: 1000
  }, options);

  this._showNotification = typeof showNotification === 'function' ? showNotification : null;
  this.pdfLibLoaded = false;
  this.fontkitLoaded = false;
}

async exportStructuredTranslation(originalPdfBase64, translatedContentList, showNotification = null) {
  // ✅ 更新 showNotification
  if (typeof showNotification === 'function') {
    this._showNotification = showNotification;
  }

  try {
    if (!translatedContentList || translatedContentList.length === 0) {
      this._notify('沒有翻譯內容可匯出', 'warning');
      return;
    }

    if (!originalPdfBase64) {
      this._notify('原始PDF資料不可用', 'error');
      return;
    }

    this._notify('正在生成譯文PDF，請稍候...', 'info');

    // ... 後續程式碼 ...
  } catch (error) {
    this._notify('匯出失敗: ' + error.message, 'error');
  }
}
```

**影響**: 🟡 中等 - 提高穩健性

---

### 9. SegmentManager - 改進離屏canvas重用

**問題位置**: `SegmentManager.js` line 280-299

**當前程式碼**:
```javascript
async renderSegment(seg) {
  const off = document.createElement('canvas');  // ❌ 每次建立
  const offCtx = off.getContext('2d', { willReadFrequently: true, alpha: false });

  for (const p of seg.pages) {
    if (off.width !== p.width) off.width = p.width;  // ❌ 頻繁重新分配
    if (off.height !== p.height) off.height = p.height;
    // ...
  }
  // ❌ canvas 沒有被清理，垃圾回收等待
}
```

**修復方案**:

```javascript
constructor(pdfDoc, options = {}) {
  // ... 其他初始化 ...
  this._offscreenCanvas = null;  // ✅ 快取離屏canvas
  this._offscreenCtx = null;      // ✅ 快取context
  this._maxOffscreenSize = { width: 0, height: 0 };  // ✅ 追蹤最大尺寸
}

_getOffscreenCanvas(width, height) {
  // ✅ 複用或建立離屏canvas
  if (!this._offscreenCanvas) {
    this._offscreenCanvas = document.createElement('canvas');
    this._offscreenCtx = this._offscreenCanvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false
    });
  }

  // ✅ 只在需要時擴大（不縮小，避免頻繁分配）
  if (width > this._maxOffscreenSize.width || height > this._maxOffscreenSize.height) {
    this._offscreenCanvas.width = Math.max(width, this._maxOffscreenSize.width);
    this._offscreenCanvas.height = Math.max(height, this._maxOffscreenSize.height);
    this._maxOffscreenSize.width = this._offscreenCanvas.width;
    this._maxOffscreenSize.height = this._offscreenCanvas.height;
    console.log(`[SegmentManager] 離屏canvas擴充為 ${this._offscreenCanvas.width}x${this._offscreenCanvas.height}`);
  }

  return { canvas: this._offscreenCanvas, ctx: this._offscreenCtx };
}

async renderSegment(seg) {
  for (const p of seg.pages) {
    const { canvas: off, ctx: offCtx } = this._getOffscreenCanvas(p.width, p.height);

    // ✅ 重新設定尺寸為當前page的尺寸（只是清除，不重新分配）
    off.width = p.width;
    off.height = p.height;

    offCtx.clearRect(0, 0, off.width, off.height);
    await p.page.render({ canvasContext: offCtx, viewport: p.viewport }).promise;

    // 繪製到左右段畫布
    seg.left.ctx.drawImage(off, 0, p.yInSegPx);
    seg.right.ctx.drawImage(off, 0, p.yInSegPx);
  }

  // 繪製 overlays
  await this.renderSegmentOverlays(seg);
}

destroy() {
  // ... 其他清理 ...

  // ✅ 清理離屏canvas
  this._offscreenCanvas = null;
  this._offscreenCtx = null;
  this._maxOffscreenSize = { width: 0, height: 0 };

  this.segments = [];
  this.pageInfos = [];
}
```

**影響**: 🟡 中等 - 效能最佳化

---

### 10. SegmentManager - 新增容器驗證

**問題位置**: `SegmentManager.js` line 209-210

**當前程式碼**:
```javascript
createSegmentDom(seg, dpr) {
  // ...
  buildSide(this.originalSegmentsContainer, 'left');  // ❌ 容器可能為null
  buildSide(this.translationSegmentsContainer, 'right');
}

const buildSide = (container, side) => {
  // ...
  container.appendChild(wrapper);  // ❌ 如果container為null會崩潰
};
```

**修復方案**:

```javascript
createSegmentDom(seg, dpr) {
  // ✅ 驗證容器
  if (!this.originalSegmentsContainer || !this.translationSegmentsContainer) {
    console.error('[SegmentManager] 容器未初始化，無法建立段DOM');
    return false;
  }

  const cssWidth = seg.widthPx / dpr;
  const cssHeight = seg.heightPx / dpr;

  const buildSide = (container, side) => {
    if (!container) {
      console.error(`[SegmentManager] ${side} 容器為null`);
      return;
    }

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
    if (side === 'left') seg.left = sideObj;
    else seg.right = sideObj;

    // 綁定點選事件
    if (side === 'left' && this.onOverlayClick) {
      overlay.addEventListener('click', (e) => this.onOverlayClick(e, seg));
    }
  };

  buildSide(this.originalSegmentsContainer, 'left');
  buildSide(this.translationSegmentsContainer, 'right');

  return true;
}
```

**影響**: 🟡 中等 - 防止崩潰

---

## 🟢 低優先順序 - 可選改進

### 11. SegmentManager - 新增BBOX_NORMALIZED_RANGE驗證

**問題位置**: `SegmentManager.js` line 334-365

**當前程式碼**:
```javascript
const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;
// ...
const scaleX = p.width / BBOX_NORMALIZED_RANGE;  // ❌ 如果為0會導致Infinity
```

**修復方案**:

```javascript
async clearTextInSegment(seg) {
  if (!this.contentListJson || !this.clearTextInBbox) {
    console.warn('[SegmentManager] 缺少清除文字依賴');
    return;
  }

  const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;

  // ✅ 新增驗證
  if (!BBOX_NORMALIZED_RANGE || BBOX_NORMALIZED_RANGE <= 0) {
    console.error('[SegmentManager] 無效的 bboxNormalizedRange:', BBOX_NORMALIZED_RANGE);
    return;
  }

  // ... 後續程式碼 ...
}
```

**影響**: 🟢 低 - 防止數值錯誤

---

### 12. PDFExporter - 改進rgb色值處理

**問題位置**: `PDFExporter.js` line 133

**當前程式碼**:
```javascript
page.drawRectangle({
  x: x,
  y: y,
  width: width,
  height: height,
  color: rgb(1, 1, 1),  // ⚠️ 這在pdf-lib中是正確的（0-1範圍）
});
```

**說明**: 實際上這是正確的，pdf-lib使用0-1範圍的RGB值。但建議新增註釋：

```javascript
page.drawRectangle({
  x: x,
  y: y,
  width: width,
  height: height,
  color: rgb(1, 1, 1),  // ✅ pdf-lib使用0-1範圍（不是0-255）
});
```

**影響**: 🟢 低 - 文件最佳化

---

## 修復優先順序排序

### Phase 1 - 立即修復 (必須在測試前)
1. ✅ TextFittingAdapter - 新增 BBOX_NORMALIZED_RANGE 定義
2. ✅ PDFExporter - 統一Canvas和PDF文字高度公式
3. ✅ SegmentManager - 修復事件監聽器清理

### Phase 2 - 儘快修復 (本週內)
4. ✅ TextFittingAdapter - 改進錯誤處理
5. ✅ TextFittingAdapter - 新增引數驗證
6. ✅ TextFittingAdapter - 新增ctx驗證
7. ✅ PDFExporter - 改進fontkit失敗處理
8. ✅ PDFExporter - 新增showNotification型別檢查

### Phase 3 - 後續最佳化 (下週)
9. ✅ SegmentManager - 改進離屏canvas重用
10. ✅ SegmentManager - 新增容器驗證
11. ✅ SegmentManager - 新增BBOX_NORMALIZED_RANGE驗證
12. ✅ PDFExporter - 改進rgb色值註釋

---

## 測試檢查清單

修復完成後，按以下順序測試：

- [ ] TextFittingAdapter.initialize() 失敗時是否正確丟擲錯誤
- [ ] preprocessGlobalFontSizes() 接收無效引數時是否正確處理
- [ ] wrapText() 接收無效ctx時是否降級處理
- [ ] PDFExporter 匯出的PDF文字大小是否與Canvas顯示一致
- [ ] PDFExporter fontkit載入失敗時是否繼續匯出（可能帶警告）
- [ ] SegmentManager 滾動時是否繼續渲染，銷燬後是否停止
- [ ] SegmentManager destroy() 呼叫後記憶體是否釋放
- [ ] SegmentManager setContainers(null, ...) 時是否正確處理
- [ ] 長PDF (100+頁) 是否能正確分段和渲染
- [ ] 切換PDF後舊的事件監聽器是否被清理

---

## 整合測試示例

```javascript
// 完整的整合測試
async function testModuleIntegration() {
  console.log('開始模組整合測試...');

  // 1. 測試TextFittingAdapter
  console.log('\n1. 測試 TextFittingAdapter');
  try {
    const textFitter = new TextFittingAdapter({
      globalFontScale: 0.9
    });

    // 應該throw而不是靜默失敗
    try {
      textFitter.initialize();
      console.warn('⚠️ initialize() 應該檢查TextFittingEngine');
    } catch (e) {
      console.log('✅ initialize() 正確丟擲錯誤');
    }

    // 測試引數驗證
    textFitter.preprocessGlobalFontSizes(null, null);
    console.log('✅ preprocessGlobalFontSizes() 接受無效引數');

    // 測試wrapText驗證
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const lines = textFitter.wrapText(null, 'test', 100);  // 應該降級
    console.log('✅ wrapText() 接受無效ctx，返回:', lines);

  } catch (error) {
    console.error('❌ TextFittingAdapter測試失敗:', error);
  }

  // 2. 測試PDFExporter
  console.log('\n2. 測試 PDFExporter');
  try {
    const exporter = new PDFExporter();

    // 測試沒有翻譯資料
    await exporter.exportStructuredTranslation('', [], (msg, type) => {
      console.log(`[${type}] ${msg}`);
    });
    console.log('✅ 空翻譯資料處理正確');

  } catch (error) {
    console.error('❌ PDFExporter測試失敗:', error);
  }

  // 3. 測試SegmentManager
  console.log('\n3. 測試 SegmentManager');
  try {
    // 模擬pdfDoc
    const mockPdfDoc = {
      numPages: 10,
      getPage: async (n) => ({
        getViewport: ({ scale }) => ({ width: 612, height: 792, scale }),
        render: async ({ canvasContext, viewport }) => ({ promise: Promise.resolve() })
      })
    };

    const manager = new SegmentManager(mockPdfDoc);

    // 設定依賴和容器
    const origContainer = document.createElement('div');
    const transContainer = document.createElement('div');

    manager.setContainers(origContainer, transContainer, window, window);

    // 測試setContainers(null)
    manager.setContainers(null, null, null, null);
    console.log('✅ setContainers() 接受null，createSegmentDom應該降級');

    // 測試destroy
    manager.destroy();
    console.log('✅ destroy() 執行成功');

  } catch (error) {
    console.error('❌ SegmentManager測試失敗:', error);
  }

  console.log('\n✅ 模組整合測試完成');
}

// 執行測試
testModuleIntegration();
```

