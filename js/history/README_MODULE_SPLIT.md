# history_pdf_compare.js 模組拆分方案

## 檔案結構

原檔案 (2205行) 拆分為 4 個模組：

```
js/history/
├── pdf-compare-renderer.js      (已建立 - 文字渲染引擎)
├── pdf-compare-segments.js       (待建立 - 分段和懶載入)
├── pdf-compare-ui.js             (待建立 - UI 互動)
└── history_pdf_compare.js        (簡化 - 主協調類)
```

## HTML 參考順序

```html
<!-- 1. 基礎依賴 -->
<script src="../../js/utils/text-fitting.js"></script>
<script src="../../js/utils/text-fitting-integration.js"></script>

<!-- 2. PDF 對照檢視模組 (按依賴順序載入) -->
<script src="../../js/history/pdf-compare-renderer.js"></script>
<script src="../../js/history/pdf-compare-segments.js"></script>
<script src="../../js/history/pdf-compare-ui.js"></script>
<script src="../../js/history/history_pdf_compare.js"></script>

<!-- 3. 頁面主邏輯 -->
<script src="../../js/history/history_detail_show_tab.js"></script>
```

## 模組職責

### 1. pdf-compare-renderer.js ✅
- 文字渲染引擎
- 白色背景繪製
- 文字自適應演算法
- 換行處理
- 暴露: `window.PDFCompareRenderer`

### 2. pdf-compare-segments.js (待建立)
- 分段建立和管理
- 懶載入邏輯
- 可見區域檢測
- Canvas 渲染佇列
- 暴露: `window.PDFCompareSegments`

### 3. pdf-compare-ui.js (待建立)
- 事件綁定 (點選、滾動)
- 醒目提示顯示
- 滾動同步
- bbox 互動
- 暴露: `window.PDFCompareUI`

### 4. history_pdf_compare.js (簡化主類)
- 核心資料管理
- 模組協調
- PDF 初始化
- 全域字號預處理
- 暴露: `window.PDFCompareView`

## 通訊方式

各模組透過主類例項通訊：

```javascript
class PDFCompareView {
  constructor() {
    // ... 初始化資料 ...

    // 建立子模組例項，傳入 this
    this.renderer = new PDFCompareRenderer(this);
    this.segments = new PDFCompareSegments(this);
    this.ui = new PDFCompareUI(this);
  }
}
```

子模組透過 `this.view` 訪問主類資料和方法。

## 相容性

- ✅ 不使用 ES6 模組 (import/export)
- ✅ 透過全域變數通訊
- ✅ 瀏覽器直接可用 (file:// 協議)
- ✅ 保持原有 API 不變
