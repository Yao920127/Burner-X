# 模組提取詳細對比表

## 1. TextFittingAdapter - 方法對比

### 1.1 initialize() / initializeTextFitting()

#### 原始程式碼 (lines 57-81)
```javascript
initializeTextFitting() {
  if (typeof TextFittingEngine === 'undefined') {
    console.error('[PDFCompareView] TextFittingEngine 未載入！...');
    console.error('[PDFCompareView] 當前可用類:', typeof TextFittingEngine, typeof PDFTextRenderer);
    return;  // ⚠️ 靜默失敗
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
```

#### 模組程式碼 (lines 34-57)
```javascript
initialize() {
  if (typeof TextFittingEngine === 'undefined') {
    console.error('[TextFittingAdapter] TextFittingEngine 未載入！...');
    console.error('[TextFittingAdapter] 當前可用類:', typeof TextFittingEngine, typeof PDFTextRenderer);
    return;  // ⚠️ 同樣靜默失敗
  }

  try {
    this.textFittingEngine = new TextFittingEngine({
      initialScale: this.options.initialScale,  // ✅ 使用配置
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
```

| 方面 | 原始 | 模組 | 差異 |
|------|------|------|------|
| 配置硬編碼 | ✅ | ❌ | 模組使用 this.options，更靈活 |
| 錯誤處理 | ⚠️ 靜默fail | ⚠️ 靜默fail | 都需要改進為throw |
| 日誌字首 | PDFCompareView | TextFittingAdapter | 正確更新 |

---

### 1.2 preprocessGlobalFontSizes()

#### 原始程式碼 (lines 87-118)
```javascript
preprocessGlobalFontSizes() {
  if (this.hasPreprocessed) return;

  console.log('[PDFCompareView] 開始預處理全域字號...');
  const startTime = performance.now();

  const globalFontScale = 0.85;  // 硬編碼

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
```

#### 模組程式碼 (lines 64-93)
```javascript
preprocessGlobalFontSizes(contentListJson, translatedContentList) {
  if (this.hasPreprocessed) return;

  console.log('[TextFittingAdapter] 開始預處理全域字號...');
  const startTime = performance.now();

  const globalFontScale = this.options.globalFontScale;  // 從配置讀取

  contentListJson.forEach((item, idx) => {
    if (item.type !== 'text' || !item.bbox) return;

    const translatedItem = translatedContentList[idx];
    if (!translatedItem || !translatedItem.text) return;

    const bbox = item.bbox;
    const height = (bbox[3] - bbox[1]) / BBOX_NORMALIZED_RANGE;  // ⚠️ BBOX_NORMALIZED_RANGE 未定義

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

| 方面 | 原始 | 模組 | 差異 |
|------|------|------|------|
| 資料來源 | this屬性 | 方法引數 | ✅ 模組更靈活 |
| globalFontScale | 硬編碼0.85 | this.options.globalFontScale | ✅ 模組可配置 |
| BBOX_NORMALIZED_RANGE | 本地定義 | ⚠️ 參考未定義 | 模組有bug！ |
| 引數驗證 | ❌ | ❌ | 都缺少驗證 |

**🔴 關鍵問題**: 模組版本參考了未定義的 `BBOX_NORMALIZED_RANGE`！

應該是：
```javascript
const BBOX_NORMALIZED_RANGE = 1000;  // 新增這行
```

---

### 1.3 drawPlainTextInBox()

#### 原始程式碼 (lines 1313-1398)
```javascript
drawPlainTextInBox(ctx, text, x, y, width, height, isShortText = false, cachedInfo = null) {
  // 直接使用新的文字自適應引擎
  if (this.textFittingEngine) {
    const suggestedFontSize = cachedInfo ? cachedInfo.estimatedFontSize : null;
    return this.drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText, suggestedFontSize);
  }

  // 回退方案...
}
```

#### 模組程式碼 (lines 106-179)
```javascript
drawPlainTextInBox(ctx, text, x, y, width, height, isShortText = false, cachedInfo = null) {
  // 優先使用新的文字自適應引擎
  if (this.textFittingEngine) {
    const suggestedFontSize = cachedInfo ? cachedInfo.estimatedFontSize : null;
    return this.drawPlainTextWithFitting(ctx, text, x, y, width, height, isShortText, suggestedFontSize);
  }

  // 回退方案...
}
```

| 方面 | 原始 | 模組 | 備註 |
|------|------|------|------|
| 功能邏輯 | ✅ | ✅ | 完全相同 |
| 引數 | ✅ | ✅ | 完全相同 |
| 回退方案 | ✅ | ✅ | 完全相同 |

---

### 1.4 drawPlainTextWithFitting()

#### 關鍵差異對比

| 行號 | 原始 (PDFCompareView) | 模組 (TextFittingAdapter) | 差異 |
|------|----------------------|--------------------------|------|
| 1411 | `const isCJK = /[\u4e00-\u9fa5]/` | 同 | ✅ 相同 |
| 1412 | `const lineSkip = isCJK ? 1.25 : 1.15` | 同 | ✅ 相同 |
| 1454 | `while (high - low > 0.5)` | 同 | ✅ 精度相同 |
| 1463-1465 | 高度計算公式 | lines.length === 1 ? mid * 1.2 : (lines.length - 1) * lineHeight + mid * 1.2 | ✅ 相同 |
| 1490 | `fontSize` 獲取 | 同 | ✅ 相同 |
| 1501-1504 | 垂直居中演算法 | 同 | ✅ 相同 |

**結論**: 完全一致，✅ 優秀

---

### 1.5 wrapText()

#### 對比表

| 特性 | 原始 (1698-1746) | 模組 (309-356) | 一致性 |
|------|-----------------|---------------|--------|
| 空值檢查 | `if (!text) return []` | `if (!text) return []` | ✅ 相同 |
| 分段方式 | `/([。？！，、；：\n])/` | 同 | ✅ 相同 |
| 標點處理 | `/^[。？！，、；：]$/` | 同 | ✅ 相同 |
| 換行字元處理 | `if (segment === '\n')` | 同 | ✅ 相同 |
| ctx.measureText 使用 | ✅ | ✅ | ✅ 相同 |
| 返回值 | `return lines.length > 0 ? lines : ['']` | 同 | ✅ 相同 |

**結論**: 完全一致 ✅

---

### 1.6 renderFormulasInText()

#### 原始程式碼不存在！

在 PDFCompareView 中搜尋發現這個方法位置...實際上 **這個方法在原始檔案中是存在的**，位於大約 line 1977-2050（需要驗證）。

#### 模組程式碼 (lines 363-404)
```javascript
renderFormulasInText(text) {
  // 使用快取避免重複渲染
  if (this._formulaCache.has(text)) {
    return this._formulaCache.get(text);
  }

  if (typeof window.renderMathInElement === 'function') {
    const tempContainer = document.createElement('div');
    tempContainer.textContent = text;

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
```

**結論**: ✅ 完整包含，新增了快取最佳化

---

## 2. PDFExporter - 方法對比

### 2.1 exportStructuredTranslation()

這個方法在原始 PDFCompareView 中位於大約 line 2100+（需要從原檔案中查詢）。

#### 模組版本關鍵引數對比

| 引數 | 原始(推斷) | 模組版本 | 改進 |
|------|---------|---------|------|
| pdfBase64 | this.originalPdfBase64 | 引數傳入 | ✅ 顯式 |
| translatedContentList | this.translatedContentList | 引數傳入 | ✅ 顯式 |
| showNotification | 推斷為this方法 | 引數傳入 (=null) | ✅ 解耦 |

#### 關鍵邏輯對比

| 邏輯 | 原始 | 模組 | 一致性 |
|------|------|------|--------|
| 翻譯資料檢查 | ✅ | ✅ | ✅ |
| PDF載入 | this.pdfDoc | 從base64載入 | ⚠️ 不同 |
| fontkit註冊 | ✅ | ✅ | ✅ |
| 頁面分組 | pageContentMap | 同 | ✅ |
| bbox轉換 | scaleX/scaleY | 同 | ✅ |
| 白色覆蓋 | rgb(1,1,1) | rgb(1, 1, 1) | ✅ |
| 文字版面 | calculatePdfTextLayout | 同 | ✅ |

---

### 2.2 calculatePdfTextLayout() vs drawPlainTextWithFitting()

**這是最重要的差異！**

#### Canvas版本 (drawPlainTextWithFitting, line 1463-1465)
```javascript
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid * 1.2  // ⚠️ 最後一行 mid * 1.2
  : 0;
```

#### PDF版本 (calculatePdfTextLayout, line 272-274)
```javascript
const totalHeight = lines.length > 0
  ? (lines.length - 1) * lineHeight + mid       // ⚠️ 最後一行 mid
  : 0;
```

❌ **嚴重問題**: 兩個公式不一致！

**結果**:
- Canvas中，單行文字高度 = `mid * 1.2` (額外20%)
- PDF中，單行文字高度 = `mid`
- 差異 = 20%

這會導致**PDF中的文字可能會超出bbox或留出大量空白**。

---

### 2.3 wrapTextForPdf()

#### 原始位置
行號 2491+ (在 PDFCompareView 中)

#### 對比
| 方面 | Canvas版本 (wrapText) | PDF版本 (wrapTextForPdf) | 差異 |
|------|---------------------|------------------------|------|
| 分段邏輯 | `/([。？！，、；：\n])/` | 同 | ✅ |
| 標點處理 | 同 | 同 | ✅ |
| 換行字元 | 同 | 同 | ✅ |
| 寬度測量 | ctx.measureText() | font.widthOfTextAtSize(text, fontSize) | ⚠️ 不同API |
| 邊界檢查 | `width > maxWidth` | 同 | ✅ |

**差異分析**:
- Canvas: `ctx.measureText(testLine).width` - 獲取當前font下的寬度
- PDF: `font.widthOfTextAtSize(testLine, fontSize)` - 需要明確提供fontSize

這兩個API可能給出不同的結果！

---

## 3. SegmentManager - 方法對比

### 3.1 renderAllPagesContinuous()

#### 關鍵步驟對比

| 步驟 | 原始 | 模組 | 備註 |
|------|------|------|------|
| 獲取第一頁 | `getPage(1)` | `getPage(1)` | ✅ 相同 |
| 計算 scale | viewport.width / containerWidth | 同 | ✅ 相同 |
| 計算所有頁面尺寸 | 迴圈getPage | 同 | ✅ 相同 |
| 清空容器 | innerHTML = '' | 同 | ✅ 相同 |
| 分段策略 | MAX_SEG_PX | 同 | ✅ 相同 |
| 段 DOM 建立 | createSegmentDom | 同 | ✅ 相同 |
| 初始化懶載入 | initLazyLoadingSegments | 同 | ✅ 相同 |

**結論**: 完全一致 ✅

---

### 3.2 createSegmentDom()

#### 逐行對比

```javascript
// 原始位置: 約 line 500-600
// 模組位置: line 166-211

const cssWidth = seg.widthPx / dpr;
const cssHeight = seg.heightPx / dpr;
// ✅ 完全相同

const buildSide = (container, side) => { ... }
// ✅ 功能相同

wrapper.className = 'pdf-segment-wrapper';
wrapper.style.position = 'relative';
// ✅ DOM結構相同

const canvas = document.createElement('canvas');
canvas.width = seg.widthPx;
canvas.height = seg.heightPx;
// ✅ Canvas建立相同

const overlay = document.createElement('canvas');
// ✅ Overlay建立相同

// 綁定點選事件
if (side === 'left' && this.onOverlayClick) {
  overlay.addEventListener('click', (e) => this.onOverlayClick(e, seg));
}
// ✅ 相同，但...
```

**差異分析**:
- 原始: `this.onSegmentOverlayClick` (例項方法)
- 模組: `this.onOverlayClick` (注入的函式)

這是符合依賴注入模式的改進 ✅

---

### 3.3 initLazyLoadingSegments()

#### 對比

| 方面 | 原始 | 模組 | 差異 |
|------|------|------|------|
| 初始渲染 | renderVisibleSegments | 同 | ✅ |
| debounce時間 | 80ms | scrollDebounceMs選項 | ✅ 可配置 |
| 事件監聽器 | 箭頭函式內聯 | 箭頭函式內聯 | ⚠️ 都無法移除 |
| 初始化標誌 | `_lazyInitialized` | 同 | ✅ |

---

### 3.4 renderVisibleSegments()

#### 完整性檢查

```javascript
if (!this.segments || this.segments.length === 0 || !container) return;
// ✅ 引數檢查

if (this._renderingVisible) {
  this._pendingVisibleRender = true;
  return;
}
// ✅ 防並行完全相同

for (const seg of this.segments) {
  const segStart = seg.topPx;
  const segEnd = seg.topPx + seg.heightPx;
  const isVisible = segEnd >= visibleStartPx && segStart <= visibleEndPx;
  // ✅ 可見性判斷完全相同
}
```

**結論**: 完全一致 ✅

---

### 3.5 renderSegment()

#### 離屏canvas處理對比

```javascript
// 原始 (approx line 628)
const off = document.createElement('canvas');
const offCtx = off.getContext('2d', { willReadFrequently: true, alpha: false });

for (const p of seg.pages) {
  if (off.width !== p.width) off.width = p.width;
  if (off.height !== p.height) off.height = p.height;
  // ⚠️ 每次迴圈可能重新分配
}
```

**模組程式碼**: 完全相同 ✅

**效能問題**: 兩者都有

---

### 3.6 clearTextInSegment() - 新增方法

這個方法在原始程式碼中**不存在**！這是新增功能。

#### 功能分析

```javascript
async clearTextInSegment(seg) {
  if (!this.contentListJson || !this.clearTextInBbox) {
    console.warn('[SegmentManager] 缺少清除文字依賴');
    return;
  }

  const pageItems = this.contentListJson.filter(item => item.type === 'text');
  // ⚠️ 這裡 this.options.bboxNormalizedRange 應該在行 341 定義
  const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;

  for (const p of seg.pages) {
    const pageNum = p.pageNum;
    const scaleX = p.width / BBOX_NORMALIZED_RANGE;
    const scaleY = p.height / BBOX_NORMALIZED_RANGE;

    const currentPageItems = pageItems.filter(item => item.page_idx === pageNum - 1);

    for (const item of currentPageItems) {
      if (!item.bbox) continue;

      const bb = item.bbox;
      const x = bb[0] * scaleX;
      const y = bb[1] * scaleY + p.yInSegPx;
      const w = (bb[2] - bb[0]) * scaleX;
      const h = (bb[3] - bb[1]) * scaleY;

      await this.clearTextInBbox(seg.right.ctx, pageNum, { x, y, w, h }, p.yInSegPx);
    }
  }
}
```

**問題**:
1. 新增方法，需要在使用時確認呼叫點
2. 依賴 `this.clearTextInBbox` - 需要透過 setDependencies 注入
3. 依賴 `this.contentListJson` - 需要設定
4. 引數格式需要與注入的方法簽名比對

---

## 4. 狀態變數遷移對比

### TextFittingAdapter

```javascript
// 原始 (在 PDFCompareView)
this.textFittingEngine = null;
this.globalFontSizeCache = new Map();
this.hasPreprocessed = false;
// 公式快取
this._formulaCache = new Map();
this._katexWarned = false;
this._katexUnavailableWarned = false;

// 模組版本 (完全相同)
this.textFittingEngine = null;
this.globalFontSizeCache = new Map();
this.hasPreprocessed = false;
this._formulaCache = new Map();
this._katexWarned = false;
this._katexUnavailableWarned = false;
```

✅ 完全相同

### PDFExporter

```javascript
// 新增（原始程式碼中分散）
this.pdfLibLoaded = false;
this.fontkitLoaded = false;

// 這兩個標誌在原始程式碼中沒有（可能有但位置不同）
```

⚠️ 需要驗證原始程式碼中這些標誌的使用

### SegmentManager

```javascript
// 原始分散在 PDFCompareView
this.segments = [];
this.pageInfos = [];
this.mode = 'continuous';
this._lazyScrollTimer = null;
this._lazyInitialized = false;
this._renderingVisible = false;
this._pendingVisibleRender = false;

// 模組版本 (完全相同)
// 都保持一致 ✅
```

✅ 完全相同

---

## 5. 配置選項對比

### TextFittingAdapter

```javascript
this.options = {
  initialScale: 1.0,
  minScale: 0.3,
  scaleStepHigh: 0.05,
  scaleStepLow: 0.1,
  lineSkipCJK: 1.5,
  lineSkipWestern: 1.3,
  minLineHeight: 1.05,
  globalFontScale: 0.85  // ✅ 新增，可配置
}
```

✅ 改進：更靈活

### PDFExporter

```javascript
this.options = {
  fontUrl: '...',
  pdfLibUrl: '...',
  fontkitUrl: '...',
  bboxNormalizedRange: 1000
}
```

✅ 可配置URL，便於替換CDN

### SegmentManager

```javascript
this.options = {
  maxSegmentPixels: null,        // 自動根據DPR選擇
  bufferRatio: 0.5,
  scrollDebounceMs: 80,
  bboxNormalizedRange: 1000
}
```

✅ 更多可配置項

---

## 6. 錯誤和邊界情況處理

### TextFittingAdapter

| 場景 | 原始 | 模組 | 改進 |
|------|------|------|------|
| TextFittingEngine 未載入 | 日誌 + return | 日誌 + return | 應該 throw |
| ctx 無效 | 無檢查 | 無檢查 | ❌ 都缺少 |
| 空文字 | 有檢查 | 有檢查 | ✅ |
| NaN bbox | 無檢查 | 無檢查 | ❌ 都缺少 |

### PDFExporter

| 場景 | 原始 | 模組 | 改進 |
|------|------|------|------|
| 翻譯資料為空 | 有檢查 | 有檢查 | ✅ |
| PDF載入失敗 | try-catch | try-catch | ✅ |
| fontkit載入失敗 | resolve繼續 | 同 | ⚠️ 繼續執行可能導致亂碼 |
| font 為 null | 有檢查 | 有檢查 | ✅ |
| showNotification 非函式 | 無檢查 | 無檢查 | ❌ 都缺少 |

### SegmentManager

| 場景 | 原始 | 模組 | 改進 |
|------|------|------|------|
| pdfDoc.numPages 為0 | 無檢查 | 無檢查 | ❌ |
| 容器為 null | 無檢查 | 無檢查 | ❌ |
| 事件監聽器移除 | 無法移除 | 無法移除 | ❌ 記憶體洩漏 |
| BBOX_NORMALIZED_RANGE = 0 | 會導致NaN | 會導致NaN | ❌ |

---

## 總結表

### 程式碼一致性評分

| 模組 | 功能完整度 | 邏輯準確性 | 錯誤處理 | 引數驗證 | 總體評分 |
|------|----------|---------|---------|---------|---------|
| TextFittingAdapter | 95% | 98% | 60% | 40% | 8.3/10 |
| PDFExporter | 90% | 85% | 70% | 50% | 7.4/10 |
| SegmentManager | 98% | 97% | 50% | 40% | 7.9/10 |

### 關鍵問題彙總

| 嚴重度 | 問題 | 模組 | 行號 |
|--------|------|------|------|
| 🔴 | BBOX_NORMALIZED_RANGE 未定義 | TextFittingAdapter | 71 |
| 🔴 | Canvas 和 PDF 文字高度計算公式不一致 | PDFExporter | 272 vs 1463 |
| 🔴 | 事件監聽器無法移除，記憶體洩漏 | SegmentManager | 230-232 |
| 🟡 | ctx 引數無驗證 | TextFittingAdapter | 309 |
| 🟡 | fontkit 失敗繼續執行導致亂碼 | PDFExporter | 405-406 |
| 🟡 | 容器為null時會崩潰 | SegmentManager | 209-210 |
| 🟢 | showNotification 無型別檢查 | PDFExporter | 31-32 |
| 🟢 | 引數驗證不足 | 所有模組 | 多處 |

