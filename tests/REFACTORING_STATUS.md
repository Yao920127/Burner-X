# PDF Compare View 重構狀態報告

## 📊 總體進度: 70% 完成

### ✅ 已完成 (70%)

#### 1. 模組提取 (100%)
- ✅ **TextFitting.js** (450行) - 文字自適應渲染
  - 包含: 文字換行、字號計算、公式渲染
  - 狀態: ✅ 已提取並修復bug

- ✅ **PDFExporter.js** (450行) - PDF匯出功能
  - 包含: PDF生成、文字覆蓋、字型嵌入
  - 狀態: ✅ 已提取並修復bug

- ✅ **SegmentManager.js** (400行) - 長畫布分段管理
  - 包含: 懶載入、分段渲染、事件管理
  - 狀態: ✅ 已提取並修復bug

#### 2. Bug修復 (100%)
- ✅ TextFitting: 新增 `bboxNormalizedRange` 配置
- ✅ PDFExporter: 統一文字高度計算公式
- ✅ SegmentManager: 修復事件監聽器記憶體洩漏

#### 3. 文件 (100%)
- ✅ 建立詳細的測試指南 ([TESTING_GUIDE.md](TESTING_GUIDE.md))
- ✅ Code Review 文件
- ✅ 本狀態報告

#### 4. 主類初始化 (30%)
- ✅ 修改建構函式，初始化模組
- ⏳ 方法包裝器適配 (進行中)

### 🔄 進行中 (20%)

#### 5. 主類方法適配
需要修改以下方法使用新模組：

**TextFittingAdapter 相關**:
- `initializeTextFitting()` - 呼叫模組的 initialize()
- `preprocessGlobalFontSizes()` - 呼叫模組方法
- `drawPlainTextInBox()` - 呼叫模組方法
- `drawPlainTextWithFitting()` - 呼叫模組方法
- `wrapText()` - 呼叫模組方法
- `renderFormulasInText()` - 呼叫模組方法

**PDFExporter 相關**:
- `exportStructuredTranslation()` - 呼叫模組的 exportStructuredTranslation()
- `calculatePdfTextLayout()` - 由模組內部處理
- `wrapTextForPdf()` - 由模組內部處理
- `loadPdfLib()` - 由模組內部處理

**SegmentManager 相關**:
- `renderAllPagesContinuous()` - 使用模組的 renderAllPagesContinuous()
- `createSegmentDom()` - 由模組內部處理
- `initLazyLoadingSegments()` - 由模組內部處理
- `renderVisibleSegments()` - 由模組內部處理
- `renderSegment()` - 由模組內部處理
- `renderSegmentOverlays()` - 由模組內部處理

### ⏳ 待完成 (10%)

#### 6. HTML檔案更新
需要在HTML中新增模組參考：
```html
<!-- 在 history_pdf_compare.js 之前新增 -->
<script src="js/history/modules/TextFitting.js"></script>
<script src="js/history/modules/PDFExporter.js"></script>
<script src="js/history/modules/SegmentManager.js"></script>
```

#### 7. 功能測試
按照 [TESTING_GUIDE.md](TESTING_GUIDE.md) 執行完整測試。

---

## 📋 詳細實施計劃

### 階段1: 方法介面卡包裝 (估計: 2小時)

建立包裝器方法，保持介面相容性：

```javascript
// 示例：TextFitting 方法包裝
initializeTextFitting() {
  if (this.textFittingAdapter) {
    this.textFittingAdapter.initialize();
    // 相容性: 同步到舊屬性
    this.textFittingEngine = this.textFittingAdapter.textFittingEngine;
  } else {
    // 回退到原有實現
    // ...(保留原有程式碼)
  }
}

preprocessGlobalFontSizes() {
  if (this.textFittingAdapter) {
    this.textFittingAdapter.preprocessGlobalFontSizes(
      this.contentListJson,
      this.translatedContentList
    );
    // 同步快取
    this.globalFontSizeCache = this.textFittingAdapter.globalFontSizeCache;
    this.hasPreprocessed = this.textFittingAdapter.hasPreprocessed;
  } else {
    // 回退實現
  }
}
```

### 階段2: SegmentManager 整合 (估計: 3小時)

最複雜的部分，需要：
1. 在 `renderAllPagesContinuous()` 中初始化 SegmentManager
2. 設定依賴注入
3. 替換原有的分段邏輯

```javascript
async renderAllPagesContinuous() {
  if (typeof SegmentManager !== 'undefined') {
    // 使用新模組
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

    // 設定依賴
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

    // 同步屬性
    this.pageInfos = this.segmentManager.pageInfos;
    this.scale = this.segmentManager.scale;
  } else {
    // 回退到原有實現
    // ...(保留原有程式碼)
  }
}
```

### 階段3: PDFExporter 整合 (估計: 1小時)

相對簡單：

```javascript
async exportStructuredTranslation() {
  if (this.pdfExporter) {
    await this.pdfExporter.exportStructuredTranslation(
      this.originalPdfBase64,
      this.translatedContentList,
      typeof showNotification === 'function' ? showNotification : null
    );
  } else {
    // 回退實現或提示使用者
    console.error('[PDFCompareView] PDFExporter 未載入');
    if (typeof showNotification === 'function') {
      showNotification('匯出功能不可用', 'error');
    }
  }
}
```

---

## 🎯 快速完成方案 (推薦)

為了快速完成並測試，建議採用**雙軌制**：

### 方案A: 保持原有程式碼 + 可選模組 (推薦, 風險低)
```javascript
// 在每個方法中檢查模組是否可用
drawPlainTextInBox(...) {
  if (this.textFittingAdapter) {
    // 使用新模組
    return this.textFittingAdapter.drawPlainTextInBox(...);
  } else {
    // 使用原有程式碼
    // ...(保留全部原有實現)
  }
}
```

**優點**:
- ✅ 安全：模組載入失敗時自動回退
- ✅ 可測試：可以對比新舊實現
- ✅ 漸進式：可以逐步遷移

**缺點**:
- ❌ 程式碼冗餘：需要保留原有程式碼
- ❌ 檔案仍然較大

### 方案B: 完全替換 (激進, 風險高)
直接刪除原有實現，只保留模組呼叫。

**優點**:
- ✅ 程式碼簡潔：檔案從2606行減少到~1300行
- ✅ 維護簡單：只需維護模組

**缺點**:
- ❌ 風險高：模組問題會導致功能完全失效
- ❌ 難以回滾：需要git revert

---

## 🚀 繼續重構的兩個選項

### 選項1: 完成當前檔案重構 (推薦)
**工作量**: ~6小時
**內容**:
1. 完成方法適配 (2小時)
2. 完成 SegmentManager 整合 (3小時)
3. 測試和修復 (1小時)

**優先順序**: ⭐⭐⭐⭐⭐

### 選項2: 重構其他大檔案
按照相同模式重構：
- [history.js](js/history/history.js) (2583行)
- [history_exporter_docx.js](js/history/exporter/history_exporter_docx.js) (2255行)
- [app.js](js/app.js) (2242行)

**工作量**: ~每個檔案 8-12小時

---

## 📈 程式碼行數對比

| 檔案 | 重構前 | 提取後 | 主類 (估計) | 減少 |
|------|--------|--------|-------------|------|
| history_pdf_compare.js | 2606行 | -1270行(模組) | ~1336行 | -49% |
| modules/TextFitting.js | - | +450行 | - | +新增 |
| modules/PDFExporter.js | - | +450行 | - | +新增 |
| modules/SegmentManager.js | - | +420行 | - | +新增 |
| **總計** | **2606行** | **2956行** | **-** | **+13.4%** |

**注意**: 總行數略有增加是因為：
1. 新增了模組匯出程式碼
2. 新增了詳細的文件註釋
3. 新增了引數驗證和錯誤處理

但模組化帶來的收益遠大於行數增加：
- ✅ 可維護性大幅提升
- ✅ 可測試性提升
- ✅ 可複用性提升
- ✅ 程式碼清晰度提升

---

## 🔍 已提交的Git記錄

```bash
git log --oneline -5
```

```
2181f18 docs: 新增PDF對比功能重構測試指南
06c5cf0 fix: 修復模組中的3個高優先順序bug
fe5056f refactor: 從history_pdf_compare.js中提取核心模組
...
```

---

## ✨ 下一步行動建議

### 立即行動 (今天)
1. ✅ 完成主類建構函式修改 (已完成)
2. 🔄 完成方法介面卡包裝
3. 🔄 更新HTML檔案參考
4. 🔄 基礎功能測試

### 本週內
5. 完成 SegmentManager 整合
6. 完整功能測試
7. 效能對比測試

### 後續計劃
8. 根據測試結果最佳化
9. 考慮重構其他大檔案
10. 編寫開發者文件

---

## 📞 需要決策

請選擇：
1. **繼續完成當前檔案** (推薦)
   - 採用方案A (保持回退) 還是 方案B (完全替換)?

2. **先測試當前進度**
   - 完成HTML更新
   - 測試基礎功能

3. **暫停並轉向其他檔案**
   - 開始重構 history.js

---

**當前分支**: `refactor/split-large-files`
**最後更新**: 2025-11-11
**下一個里程碑**: 完成 history_pdf_compare.js 整合並透過測試
