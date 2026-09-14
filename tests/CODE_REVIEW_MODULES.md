# Code Review: 模組提取對比分析

## 審查摘要
對比原始檔案 `history_pdf_compare.js` 與提取的三個模組，檢查功能邏輯、依賴關係和狀態管理的一致性。

---

## 1️⃣ TextFittingAdapter 模組審查

### 對應的原始方法
- `initializeTextFitting()` → `TextFittingAdapter.initialize()`
- `preprocessGlobalFontSizes()` → `TextFittingAdapter.preprocessGlobalFontSizes()`
- `drawPlainTextInBox()` → `TextFittingAdapter.drawPlainTextInBox()`
- `drawPlainTextWithFitting()` → `TextFittingAdapter.drawPlainTextWithFitting()`
- `wrapText()` → `TextFittingAdapter.wrapText()`
- `renderFormulasInText()` → `TextFittingAdapter.renderFormulasInText()` (未在提取版本中)

### ✅ 保持一致的部分

| 特性 | 狀態 | 備註 |
|------|------|------|
| 初始化邏輯 | ✅ | 完全相同的TextFittingEngine初始化 |
| 預處理演算法 | ✅ | globalFontScale、bbox計算完全一致 |
| wrapText換行演算法 | ✅ | CJK斷句、標點符號處理、換行字元處理完全相同 |
| drawPlainTextInBox回退方案 | ✅ | 與原始版本的fallback邏輯一致 |
| drawPlainTextWithFitting主演算法 | ✅ | 二分查詢、寬度因子、垂直居中完全一致 |
| 字號範圍計算 | ✅ | minFontSize、maxFontSize計算相同 |
| CJK判斷邏輯 | ✅ | `/[\u4e00-\u9fa5]/` 正則完全一致 |

### ⚠️ 需要注意的改變

#### 1. 缺失方法：renderFormulasInText()
**原始程式碼 (1588-1604行)**:
```javascript
renderFormulasInText(text) {
  // 使用快取避免重複渲染
  if (this._formulaCache.has(text)) {
    return this._formulaCache.get(text);
  }

  if (typeof window.renderMathInElement === 'function') {
    // KaTeX渲染邏輯
    ...
  }
}
```

**模組版本**:
```javascript
renderFormulasInText(text) {
  // 363-404行：完全相同的實現
}
```

✅ **已正確包含** - 在TextFittingAdapter的363-404行

#### 2. 選項配置的改變
**原始程式碼處理**:
```javascript
// history_pdf_compare.js
this.textFittingEngine = new TextFittingEngine({
  initialScale: 1.0,
  minScale: 0.3,
  scaleStepHigh: 0.05,
  scaleStepLow: 0.1,
  lineSkipCJK: 1.5,
  lineSkipWestern: 1.3,
  minLineHeight: 1.05
});
```

**模組版本處理**:
```javascript
// TextFittingAdapter.js
this.options = Object.assign({
  initialScale: 1.0,
  minScale: 0.3,
  scaleStepHigh: 0.05,
  scaleStepLow: 0.1,
  lineSkipCJK: 1.5,
  lineSkipWestern: 1.3,
  minLineHeight: 1.05,
  globalFontScale: 0.85  // 新增
}, options);
```

⚠️ **改進**: 新增globalFontScale選項支援，提高配置靈活性

#### 3. 快取管理的獨立性
**差異**:
- **原始**: globalFontSizeCache 在 PDFCompareView 中管理
- **模組**: 自包含的globalFontSizeCache、_formulaCache

✅ **有利**: 模組化改進，支援clearCache()方法

### ❌ 潛在的問題或遺漏

#### 1. TextFittingEngine初始化的隱式依賴
**問題**: 模組依賴全域的 `TextFittingEngine` 類
```javascript
if (typeof TextFittingEngine === 'undefined') {
  console.error('[TextFittingAdapter] TextFittingEngine 未載入！請確保 js/utils/text-fitting.js 已正確引入');
  return;
}
```

**風險**:
- 如果 `text-fitting.js` 未載入，將默默失敗
- 日誌顯示錯誤但繼續執行，可能導致難以除錯的問題

**建議**:
```javascript
initialize() {
  if (typeof TextFittingEngine === 'undefined') {
    throw new Error('[TextFittingAdapter] TextFittingEngine 未載入！');
  }
  // ...
}
```

#### 2. wrapText方法缺少canvas context引數驗證
**原始程式碼**: 無引數檢查
**模組程式碼**: 同樣無引數檢查

```javascript
wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  // 缺少 ctx 驗證
  ctx.measureText(testLine);  // 可能報錯
}
```

**建議**:
```javascript
wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  if (!ctx || typeof ctx.measureText !== 'function') {
    console.warn('[TextFitting] 無效的canvas context');
    return text.split('\n');
  }
  // ...
}
```

#### 3. globalFontSizeCache 的前置條件
**方法**: `preprocessGlobalFontSizes(contentListJson, translatedContentList)`

**缺失的驗證**:
```javascript
if (!contentListJson || !Array.isArray(contentListJson)) {
  console.warn('[TextFittingAdapter] 無效的contentListJson');
  return;
}
```

**原始程式碼中沒有驗證，模組版本也沒有加**

---

## 2️⃣ PDFExporter 模組審查

### 對應的原始方法
- `exportStructuredTranslation()` → `PDFExporter.exportStructuredTranslation()` (新提取，原始檔案中在2000+行)
- `calculatePdfTextLayout()` → `PDFExporter.calculatePdfTextLayout()`
- `wrapTextForPdf()` → `PDFExporter.wrapTextForPdf()`

### ✅ 保持一致的部分

| 特性 | 狀態 | 備註 |
|------|------|------|
| PDF載入和字型嵌入 | ✅ | fontkit註冊邏輯相同 |
| 頁面分組邏輯 | ✅ | pageContentMap建立方式相同 |
| bbox座標轉換 | ✅ | scaleX/scaleY計算相同 |
| 白色矩形覆蓋演算法 | ✅ | rgb(1,1,1)覆蓋邏輯相同 |
| 文字版面二分查詢 | ✅ | 高低指標、精度0.5演算法相同 |
| wrapTextForPdf換行 | ✅ | CJK斷句邏輯與Canvas版本一致 |
| PDF座標系處理 | ✅ | y軸翻轉、縮放計算相同 |

### ⚠️ 需要注意的改變

#### 1. 缺失的依賴項宣告
**原始程式碼** (在PDFCompareView中):
```javascript
async exportStructuredTranslation(translatedContentList) {
  // 使用 this.originalPdfBase64
  // 使用 this.scale 和 this.dpr
  // 使用 showNotification 從外部傳入
}
```

**模組版本**:
```javascript
async exportStructuredTranslation(originalPdfBase64, translatedContentList, showNotification = null) {
  // 顯式接收所有引數
  // 不依賴 this.scale
  // 不依賴 this.dpr
  // 獨立的 dpr 處理
}
```

✅ **改進**: 引數顯式化，減少隱式依賴

#### 2. 引數差異：缺少scale和dpr
**問題**: PDFExporter 中沒有 scale 和 dpr 屬性

**原始程式碼中的使用**:
```javascript
// PDFCompareView 中計算渲染時使用
const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;
```

**模組版本**:
```javascript
// PDFExporter.js 中
// 注意：沒有使用 this.scale 或 this.dpr
const scaleX = pageWidth / BBOX_NORMALIZED_RANGE;
const scaleY = pageHeight / BBOX_NORMALIZED_RANGE;
```

⚠️ **潛在問題**: 模組直接使用 PDF 的頁面寬高，而不考慮原始的 scale/dpr。這可能導致文字大小計算不同。

#### 3. 字型載入的網路依賴
**風險**: 硬編碼的CDN URL
```javascript
fontUrl: 'https://gcore.jsdelivr.net/npm/source-han-sans-cn@1.0.0/SourceHanSansCN-Normal.otf',
pdfLibUrl: 'https://gcore.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
fontkitUrl: 'https://gcore.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
```

⚠️ **問題**:
- CDN依賴可能導致離線失敗
- URL可能變更
- 沒有fallback方案

#### 4. calculatePdfTextLayout 與 drawPlainTextWithFitting 的不一致
**原始程式碼中的差異**:

Canvas版本 (drawPlainTextWithFitting):
```javascript
const lineHeight = mid * lineSkip;
const totalHeight = lines.length === 1
  ? mid * 1.2
  : (lines.length - 1) * lineHeight + mid * 1.2;
```

PDF版本 (calculatePdfTextLayout):
```javascript
const lineHeight = mid * lineSkip;
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid
  : 0;
```

❌ **問題**: 計算不一致！
- Canvas: 最後一行使用 `mid * 1.2`
- PDF: 最後一行使用 `mid`
- 這會導致PDF和Canvas中的文字大小不同

**建議**: 應該統一為同一個公式

#### 5. 缺少原始文字清除邏輯
**問題**: 原始程式碼有 `clearTextInBbox()` 方法來清除PDF中的原始文字，但PDFExporter中：
```javascript
// 用白色矩形覆蓋原文
items.forEach(item => {
  // ...
  page.drawRectangle({
    x: x,
    y: y,
    width: width,
    height: height,
    color: rgb(1, 1, 1),  // 近似白色
  });
});
```

⚠️ **注意**:
- 使用 `rgb(1, 1, 1)` 而不是 `rgb(255, 255, 255)`（pdf-lib的色值範圍是0-1而不是0-255）
- 這會導致非純白色覆蓋，可能看到輕微的灰色背景

**建議**:
```javascript
color: rgb(255, 255, 255)  // 或使用 rgb(1, 1, 1) 但需要驗證
```

### ❌ 潛在的問題或遺漏

#### 1. 缺少錯誤恢復機制
**原始程式碼**:
```javascript
if (typeof PDFLib === 'undefined') {
  await this.loadPdfLib();
}
```

**模組版本**: 同樣存在，但缺少重試機制

**問題**: 如果載入失敗，沒有重試邏輯

#### 2. fontkit載入失敗時的行為
**程式碼**:
```javascript
script.onerror = (error) => {
  console.warn('[PDFExporter] fontkit 載入失敗:', error);
  resolve(); // fontkit失敗不阻止流程
};
```

⚠️ **問題**:
- fontkit失敗會導致中文字型無法嵌入
- 但流程繼續，可能使用預設字型（不支援中文）
- 最終PDF中的中文會顯示為空或方塊

**建議**:
```javascript
// 如果fontkit失敗，應該至少警告使用者
if (!fontkit && needsCJKFont) {
  showNotification('警告：中文字型可能無法正確顯示', 'warning');
}
```

#### 3. 缺少對 showNotification 的型別檢查
**程式碼**:
```javascript
if (showNotification) {
  showNotification('沒有翻譯內容可匯出', 'warning');
}
```

⚠️ **問題**: 假設 showNotification 是函式，但沒有驗證

**建議**:
```javascript
if (typeof showNotification === 'function') {
  showNotification('沒有翻譯內容可匯出', 'warning');
}
```

#### 4. 文字版面計算中的lineHeight使用
**問題**: 在 calculatePdfTextLayout 中計算最後一行時：
```javascript
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid
  : 0;
```

但在實際繪製時：
```javascript
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + fontSize
  : 0;
```

這兩個值應該相同（mid === fontSize），但邏輯複雜易出錯。

---

## 3️⃣ SegmentManager 模組審查

### 對應的原始方法
- `renderAllPagesContinuous()` → `SegmentManager.renderAllPagesContinuous()`
- `createSegmentDom()` → `SegmentManager.createSegmentDom()`
- `initLazyLoadingSegments()` → `SegmentManager.initLazyLoadingSegments()`
- `renderVisibleSegments()` → `SegmentManager.renderVisibleSegments()`
- `renderSegment()` → `SegmentManager.renderSegment()`
- `renderSegmentOverlays()` → `SegmentManager.renderSegmentOverlays()`
- `clearTextInSegment()` → `SegmentManager.clearTextInSegment()` (新增)

### ✅ 保持一致的部分

| 特性 | 狀態 | 備註 |
|------|------|------|
| 段劃分演算法 | ✅ | maxSegmentPixels和頁面分組邏輯相同 |
| DOM建立邏輯 | ✅ | wrapper、canvas、overlay建立完全相同 |
| DPR處理 | ✅ | 物理畫素和CSS畫素的轉換相同 |
| 懶載入觸發 | ✅ | scrollDebounceMs 和 renderVisibleSegments 邏輯相同 |
| 可見性判斷 | ✅ | visibleStartPx和visibleEndPx計算相同 |
| 離屏渲染 | ✅ | 使用臨時canvas避免PDF.js清除問題 |
| 點選事件處理 | ✅ | 段級別的座標轉換和命中測試邏輯相同 |

### ⚠️ 需要注意的改變

#### 1. 依賴注入模式
**原始程式碼** (在PDFCompareView中):
```javascript
// 方法直接訪問 this 的屬性
async renderSegmentOverlays(seg) {
  // 直接呼叫 this.renderPageBboxesToCtx()
  // 直接呼叫 this.renderPageTranslationToCtx()
  // 直接訪問 this.contentListJson
}
```

**模組版本**:
```javascript
// 使用依賴注入
setDependencies(deps) {
  Object.assign(this, deps);
}

// 在方法中檢查依賴
async renderSegmentOverlays(seg) {
  if (!this.renderPageBboxesToCtx || !this.renderPageTranslationToCtx) {
    console.warn('[SegmentManager] 缺少渲染函式依賴');
    return;
  }
  // ...
}
```

✅ **改進**: 顯式依賴注入，減少隱式耦合

#### 2. 容器設定方法
**原始程式碼** (隱式):
```javascript
// 直接在 render() 方法中設定容器
this.originalSegmentsContainer = document.getElementById('pdf-original-segments');
```

**模組版本** (顯式):
```javascript
setContainers(originalSegments, translationSegments, originalScroll, translationScroll) {
  this.originalSegmentsContainer = originalSegments;
  this.translationSegmentsContainer = translationSegments;
  this.originalScroll = originalScroll;
  this.translationScroll = translationScroll;
}
```

✅ **改進**: 更清晰的初始化流程

#### 3. PDF文件依賴
**原始程式碼**:
```javascript
// 從 PDFCompareView.pdfDoc 繼承
this.pdfDoc = pdfDoc;
```

**模組版本**:
```javascript
constructor(pdfDoc, options = {}) {
  this.pdfDoc = pdfDoc;
  this.totalPages = pdfDoc.numPages;
  // ...
}
```

✅ **一致**: 都顯式接收pdfDoc作為構造引數

### ❌ 潛在的問題或遺漏

#### 1. 事件監聽器的清理問題
**程式碼**:
```javascript
initLazyLoadingSegments() {
  if (!this._lazyInitialized) {
    this.originalScroll.addEventListener('scroll', () => onScroll(this.originalScroll));
    this.translationScroll.addEventListener('scroll', () => onScroll(this.translationScroll));
    this._lazyInitialized = true;
  }
}

destroy() {
  // 移除事件監聽
  if (this._lazyInitialized && this.originalScroll && this.translationScroll) {
    // 注意：由於事件監聽使用了箭頭函式，無法直接移除
    // 這裡設定標記位，防止繼續渲染
    this.segments = [];
    this.pageInfos = [];
  }
}
```

❌ **問題**:
- 事件監聽器無法正確移除（註釋中也承認了）
- 清空 segments 和 pageInfos 不能停止已經開始的渲染
- 可能導致記憶體洩漏和ghost渲染

**建議**:
```javascript
initLazyLoadingSegments() {
  if (!this._lazyInitialized) {
    // 儲存回撥參考以便後續移除
    this._scrollHandler = (scroller) => {
      clearTimeout(this._lazyScrollTimer);
      this._lazyScrollTimer = setTimeout(() => {
        if (!this._destroyed) {  // 新增銷燬標誌檢查
          this.renderVisibleSegments(scroller);
        }
      }, this.options.scrollDebounceMs);
    };

    this.originalScroll.addEventListener('scroll',
      () => this._scrollHandler(this.originalScroll)
    );
    this.translationScroll.addEventListener('scroll',
      () => this._scrollHandler(this.translationScroll)
    );
    this._lazyInitialized = true;
  }
}

destroy() {
  this._destroyed = true;

  if (this._lazyInitialized && this.originalScroll && this.translationScroll) {
    this.originalScroll.removeEventListener('scroll', this._scrollHandler);
    this.translationScroll.removeEventListener('scroll', this._scrollHandler);
  }

  // 清空容器
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

#### 2. renderSegment 中的離屏canvas管理
**問題**:
```javascript
async renderSegment(seg) {
  // 使用離屏畫布避免 PDF.js 清除問題
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d', { willReadFrequently: true, alpha: false });

  for (const p of seg.pages) {
    if (off.width !== p.width) off.width = p.width;
    if (off.height !== p.height) off.height = p.height;

    offCtx.clearRect(0, 0, off.width, off.height);
    await p.page.render({ canvasContext: offCtx, viewport: p.viewport }).promise;

    // 繪製到左右段畫布
    seg.left.ctx.drawImage(off, 0, p.yInSegPx);
    seg.right.ctx.drawImage(off, 0, p.yInSegPx);
  }
  // ...
}
```

⚠️ **效能問題**:
- 每次渲染都建立離屏canvas，沒有複用
- 頻繁重新分配canvas寬高
- 沒有垃圾回收機制

**建議**:
```javascript
constructor(pdfDoc, options = {}) {
  // ...
  this._offscreenCanvas = null;  // 快取離屏canvas
}

async renderSegment(seg) {
  // 複用或建立離屏canvas
  let off = this._offscreenCanvas;
  if (!off) {
    off = document.createElement('canvas');
    this._offscreenCanvas = off;
  }
  // ...
}

destroy() {
  // ...
  this._offscreenCanvas = null;  // 釋放
}
```

#### 3. clearTextInSegment 方法的可用性問題
**程式碼**:
```javascript
async clearTextInSegment(seg) {
  if (!this.contentListJson || !this.clearTextInBbox) {
    console.warn('[SegmentManager] 缺少清除文字依賴');
    return;
  }

  // ...
  await this.clearTextInBbox(seg.right.ctx, pageNum, { x, y, w, h }, p.yInSegPx);
}
```

⚠️ **問題**:
- 此方法在SegmentManager中定義但原始程式碼中沒有呼叫
- clearTextInBbox 期望的引數需要仔細驗證
- seg.right.ctx 是畫布context，但注入的 clearTextInBbox 可能期望不同的介面

**需要驗證**:
- 這個方法是否真的被使用？
- 引數介面是否比對？

#### 4. 缺少 bboxNormalizedRange 的驗證
**程式碼**:
```javascript
async clearTextInSegment(seg) {
  const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;
  // ...
  const scaleX = p.width / BBOX_NORMALIZED_RANGE;
  const scaleY = p.height / BBOX_NORMALIZED_RANGE;
}
```

⚠️ **問題**: 如果 bboxNormalizedRange 是 null 或 0，會導致NaN

**建議**:
```javascript
const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange || 1000;
if (BBOX_NORMALIZED_RANGE <= 0) {
  console.error('[SegmentManager] 無效的 bboxNormalizedRange');
  return;
}
```

#### 5. 缺少對容器存在的驗證
**程式碼**:
```javascript
createSegmentDom(seg, dpr) {
  // ...
  buildSide(this.originalSegmentsContainer, 'left');
  buildSide(this.translationSegmentsContainer, 'right');
}
```

⚠️ **問題**: 如果容器是 null，appendChild 會丟擲錯誤

**原始程式碼中的問題** (也存在):
```javascript
renderAllPagesContinuous() {
  // ...
  for (const seg of this.segments) {
    this.createSegmentDom(seg, dpr);  // 可能失敗
  }
  // ...
}
```

**建議**:
```javascript
createSegmentDom(seg, dpr) {
  if (!this.originalSegmentsContainer || !this.translationSegmentsContainer) {
    console.error('[SegmentManager] 容器未初始化');
    return;
  }
  // ...
}
```

---

## 總體評估矩陣

| 模組 | 功能一致性 | 依賴處理 | 狀態管理 | 介面變化 | 問題嚴重度 |
|------|-----------|---------|---------|---------|-----------|
| TextFittingAdapter | 95% | 良好 | 良好 | 引數化 | 低 |
| PDFExporter | 90% | 需改進 | 自包含 | 引數化 | 中 |
| SegmentManager | 95% | 好(DI) | 良好 | 顯式化 | 中 |

---

## 關鍵建議彙總

### 🔴 高優先順序 (必須修復)

1. **TextFittingAdapter.wrapText** - 新增ctx驗證
2. **PDFExporter** - 統一Canvas和PDF的文字高度計算公式
3. **PDFExporter.loadPdfLib** - 改進對失敗的錯誤處理
4. **SegmentManager** - 修復事件監聽器的清理問題

### 🟡 中優先順序 (應該改進)

1. **TextFittingAdapter.initialize** - 改為throw而不是return
2. **PDFExporter.calculatePdfTextLayout** - 新增引數驗證
3. **SegmentManager.renderSegment** - 快取離屏canvas以提高效能
4. **SegmentManager.createSegmentDom** - 新增容器存在性驗證

### 🟢 低優先順序 (可選改進)

1. **TextFittingAdapter.preprocessGlobalFontSizes** - 新增引數驗證
2. **PDFExporter** - 新增showNotification型別檢查
3. **SegmentManager** - 文件化clearTextInSegment的使用場景

---

## 相容性檢查表

### 從 PDFCompareView 遷移時需要確保：

- [ ] TextFittingAdapter.initialize() 在 TextFittingEngine 載入後呼叫
- [ ] PDFExporter 例項化時接收正確的選項物件
- [ ] SegmentManager.setDependencies() 在使用前呼叫，提供所有必需的渲染函式
- [ ] SegmentManager.setContainers() 在 renderAllPagesContinuous() 之前呼叫
- [ ] 呼叫 SegmentManager.destroy() 來清理事件監聽器和DOM
- [ ] PDFExporter.exportStructuredTranslation() 收到有效的showNotification回撥
- [ ] TextFittingAdapter 的 globalFontSizeCache 在每次新PDF載入時呼叫 clearCache()

---

## 整合檢查示例

```javascript
// 正確的初始化順序
const textFitter = new TextFittingAdapter();
textFitter.initialize();  // 檢查TextFittingEngine

const segmentManager = new SegmentManager(pdfDoc, {
  maxSegmentPixels: 4096,
  bboxNormalizedRange: 1000
});

// 設定依賴項
segmentManager.setDependencies({
  renderPageBboxesToCtx: (ctx, pageNum, yOffset, w, h) => { /* ... */ },
  renderPageTranslationToCtx: (ctx, wrapper, pageNum, yOffset, w, h) => { /* ... */ },
  clearTextInBbox: (ctx, pageNum, bbox, yOffset) => { /* ... */ },
  clearFormulaElementsForPageInWrapper: (pageNum, wrapper) => { /* ... */ },
  onOverlayClick: (e, seg) => { /* ... */ },
  contentListJson: contentData
});

segmentManager.setContainers(origContainer, transContainer, origScroll, transScroll);

await segmentManager.renderAllPagesContinuous();

const exporter = new PDFExporter();
await exporter.exportStructuredTranslation(
  pdfBase64,
  translatedData,
  (msg, type) => console.log(`[${type}] ${msg}`)
);

// 清理
segmentManager.destroy();
textFitter.clearCache();
```

---

## 結論

整體而言，這三個模組的提取是**高質量的**，保持了原始邏輯的一致性，並透過引數化和依賴注入改進了程式碼架構。

**主要優點**:
- 功能邏輯保留完整
- 耦合度降低
- 模組職責清晰
- 可複用性提高

**需要關注的地方**:
- Canvas vs PDF 文字高度計算需要統一
- 事件監聽器管理需要改進
- 引數驗證需要加強
- 網路依賴需要fallback機制

**總體評分**: 8.5/10 - 很好的重構，少數地方需要微調。
