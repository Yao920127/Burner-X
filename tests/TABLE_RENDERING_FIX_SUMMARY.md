# 表格渲染修復總結

## 📋 問題描述

使用者的 Paper Burner 應用中，Markdown 表格無法正確渲染：

1. **壓縮表格**：所有內容在一行（無換行字元）
   ```
   | A | B ||---|---|| 1 | 2 ||3 | 4 |
   ```

2. **Sub-block 分割破壞**：表格被 `<span class="sub-block">` 分割
3. **渲染器版本問題**：使用舊版 `MarkdownProcessor` 而不是新版 `MarkdownProcessorAST`
4. **最終結果**：表格顯示為純文字 `<p>`，而不是 `<table>`

---

## ✅ 解決方案

### 1. 壓縮表格自動修復
**檔案**：`js/processing/markdown_processor_ast.js`

**功能**：檢測並修復單行壓縮表格

```javascript
// 第568-746行
function fixCompressedTables(text) {
    // 檢測分隔符：|---|---|
    const separatorPattern = /\|(:?-+:?\|)+/;

    // 統計管道符，判斷是否為壓縮表格
    const pipeCount = (line.match(/\|/g) || []).length;
    if (pipeCount < 10) return line;

    // 分割成多行
    return splitCompressedTable(line);
}
```

**關鍵修復**：
- ✅ 補回被分隔符比對"吃掉"的表頭結尾 `|`
- ✅ 按固定管道符數量精確提取每一行
- ✅ 處理表頭缺失結尾 `|` 的情況

### 2. Sub-block 分割器保護表格
**檔案**：`js/processing/sub_block_segmenter.js`

**功能**：在分割前檢測 Markdown 表格語法，跳過分割

```javascript
// 第64-70行（主分割函式）
const hasMarkdownTableSeparator = /\|(:?-+:?\|)+/.test(rawText);
if (hasMarkdownTableSeparator) {
    console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 包含 Markdown 表格語法，跳過分塊以保持表格完整性`);
    return; // 直接返回，不分割
}

// 第288-296行（公式感知分割函式）
const hasMarkdownTableSeparator = /\|(:?-+:?\|)+/.test(rawText);
if (hasMarkdownTableSeparator) {
    wrapAsSingleSubBlock(blockElement, parentBlockIndex);
    return; // 包裝為單一子塊
}
```

### 3. 使用新版 AST 渲染器 + 三層修復機制
**檔案**：`js/history/history_detail_show_tab.js`

**功能**：在 `renderBatch` 函式中實現三層防護，確保表格正確渲染

#### **第一層：Token 型別檢測與強制轉換（第1525-1530行）**
```javascript
// 檢測：如果 token 型別是 paragraph 但包含表格語法，強制作為表格處理
const hasTableSyntax = /\|(:?-+:?\|)+/.test(tokenRaw);
if (tokens[i].type === 'paragraph' && hasTableSyntax) {
  console.log('[renderBatch] 檢測到 paragraph token 包含表格語法，強制作為表格處理');
  tokens[i].type = 'table'; // 強制改為 table 型別
}
```

**問題**：`marked.lexer()` 會錯誤地將表格標記為 paragraph token
**解決**：在渲染前檢測並強制修正 token 型別

#### **第二層：優先使用 AST 渲染器（第1533-1541行）**
```javascript
// 優先使用 AST 處理器（支援壓縮表格修復）
let htmlStr;
if (typeof MarkdownIntegration !== 'undefined' && MarkdownIntegration.smartRender) {
  htmlStr = MarkdownIntegration.smartRender(tokenRaw, data.images, customRenderer, contentIdentifier);
} else if (typeof MarkdownProcessorAST !== 'undefined' && MarkdownProcessorAST.render) {
  htmlStr = MarkdownProcessorAST.render(tokenRaw, data.images);
} else {
  // 降級到舊版
  htmlStr = MarkdownProcessor.renderWithKatexFailback(MarkdownProcessor.safeMarkdown(tokenRaw, data.images), customRenderer);
}
```

**優勢**：AST 渲染器支援壓縮表格自動修復

#### **第三層：後驗檢查與重新渲染（第1543-1558行）**
```javascript
// 後驗檢查：如果渲染後仍然是 <p> 但包含表格 Markdown，嘗試直接渲染表格
if (hasTableSyntax && htmlStr.trim().startsWith('<p')) {
  console.warn('[renderBatch] 渲染後仍然是 <p>，嘗試直接提取並渲染表格部分');
  // 提取 <p> 中的文字內容
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlStr;
  const pElement = tempDiv.querySelector('p');
  if (pElement && pElement.textContent.includes('|')) {
    const tableMarkdown = pElement.textContent;
    // 重新渲染表格
    if (typeof MarkdownProcessorAST !== 'undefined' && MarkdownProcessorAST.render) {
      htmlStr = MarkdownProcessorAST.render(tableMarkdown, data.images);
      console.log('[renderBatch] 重新渲染表格成功');
    }
  }
}
```

**兜底保護**：即使前兩層失敗，仍能從 `<p>` 標籤中提取表格文字並重新渲染

---

## 🔄 完整渲染流程

### 修復前（失敗流程）
```
1. MinerU content_list.json 包含壓縮表格 Markdown
   ↓
2. 生成 chunks（保持 Markdown 格式）
   ↓
3. ❌ Sub-block 分割器切割表格 → 破壞結構
   ↓
4. ❌ 舊版 MarkdownProcessor 渲染 → 不支援壓縮表格
   ↓
5. ❌ 結果：<p>| A | B ||---|---|| 1 | 2 |</p>
```

### 修復後（成功流程）
```
1. MinerU content_list.json 包含壓縮表格 Markdown
   ↓
2. 生成 chunks（保持 Markdown 格式）
   ↓
3. ✅ MarkdownProcessorAST 修復壓縮表格
   | A | B |          | A | B |
   |---|---|    →     |---|---|
   | 1 | 2 |          | 1 | 2 |
   ↓
4. ✅ Sub-block 分割器檢測到表格語法，跳過分割
   ↓
5. ✅ markdown-it 正確渲染成 <table>
   ↓
6. ✅ 結果：<table><thead>...</thead><tbody>...</tbody></table>
```

---

## 🧪 測試頁面

### 1. `test-all-formula-fixes.html`
測試所有公式渲染修復（包括表格中的公式）

### 2. `test-table-rendering.html`
測試壓縮表格修復：
- ✅ 測試 1-3：正常表格
- ✅ 測試 4：壓縮的單行表格（原始問題）
- ✅ 測試 5：簡化的壓縮表格

### 3. `test-compressed-table-fix.html`
壓縮表格修復演示（帶詳細說明）

### 4. `test-fix-diagnostic.html`
診斷頁面（顯示完整修復日誌）

---

## 📊 修復效果

### 修復前
```html
<p data-block-index="31">
  <span class="sub-block" data-sub-block-id="31.0">| | | | 五分位數 (Quintiles) | | |</span>
  <span class="sub-block" data-sub-block-id="31.1">|---|---|---|---|---|---|---|</span>
  <span class="sub-block" data-sub-block-id="31.2">| | 1 | 2 | 3 | 4 | 5 | 5-1 |</span>
  ...
</p>
```

### 修復後
```html
<table data-block-index="31">
  <thead>
    <tr>
      <th></th><th></th><th></th>
      <th>五分位數 (Quintiles)</th>
      <th></th><th></th><th></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td></td><td>1</td><td>2</td><td>3</td>
      <td>4</td><td>5</td><td>5-1</td>
    </tr>
    <tr>
      <td>市場 (Market)</td>
      <td>0.145***</td><td>0.200**</td><td>0.061*</td>
      <td>0.136*</td><td>0.106***</td><td>-0.039</td>
    </tr>
    ...
  </tbody>
</table>
```

---

## 🔍 除錯日誌

啟用後會顯示詳細的修復過程：

```
[MarkdownProcessorAST] 檢測到可能的壓縮表格，管道符: 55
[MarkdownProcessorAST] 表頭管道符: 8 / 8
[MarkdownProcessorAST] ✓ 表頭提取成功
[MarkdownProcessorAST] 提取到 5 行資料
[MarkdownProcessorAST] ✓ 壓縮表格修復成功

[SubBlockSegmenter] 塊 #31 包含 Markdown 表格語法，跳過分塊以保持表格完整性
```

---

## 📝 檔案清單

### 修改的檔案
1. `js/processing/markdown_processor_ast.js` - 壓縮表格修復
2. `js/processing/sub_block_segmenter.js` - 表格保護
3. `js/history/history_detail_show_tab.js` - 使用 AST 渲染器

### 新增的檔案
4. `js/processing/formula_post_processor.js` - 公式後處理器
5. `views/history/history_detail.html` - 新增腳本參考（第389行）

### 測試檔案
6. `test-all-formula-fixes.html` - 綜合測試
7. `test-table-rendering.html` - 表格渲染測試
8. `test-compressed-table-fix.html` - 壓縮表格修復演示
9. `test-fix-diagnostic.html` - 診斷頁面
10. `test-compressed-debug.html` - 除錯頁面
11. `test-table-debug.html` - 表格除錯頁面
12. **`test-renderbatch-table-fix.html`** - **renderBatch 三層修復機制測試（推薦）**

---

## ✨ 額外修復

在修復表格的過程中，還順帶修復了：

1. **公式渲染問題**
   - 花括號開頭公式：`${1.1}\mathrm{\;m}$`
   - 多逗號公式
   - 表格中的公式
   - LaTeX 命令錯誤自動修正（60+種）
   - 字型巢狀錯誤修正

2. **效能最佳化**
   - 快取機制
   - 批次渲染
   - 效能指標追蹤

---

## 🎯 使用方法

1. **重新整理頁面**：按 `Ctrl + Shift + R` 清除快取
2. **檢視日誌**：開啟瀏覽器主控台
3. **驗證效果**：
   - 所有表格應顯示為 `<table>` 而不是 `<p>`
   - 壓縮表格自動修復成多行格式
   - 表格中的公式正確渲染

---

## 📌 注意事項

1. **載入順序**：確保腳本按以下順序載入
   ```html
   <script src="js/processing/markdown_processor_ast.js"></script>
   <script src="js/processing/formula_post_processor.js"></script>
   <script src="js/processing/markdown_processor_integration.js"></script>
   <script src="js/processing/sub_block_segmenter.js"></script>
   ```

2. **相容性**：保留了舊版渲染器的降級支援

3. **除錯模式**：在主控台執行 `localStorage.setItem('ENABLE_SUBBLOCK_DEBUG', 'true')` 啟用詳細日誌

---

## 🏆 完成狀態

- ✅ 壓縮表格自動修復（`markdown_processor_ast.js`）
- ✅ Sub-block 分割器保護表格（`sub_block_segmenter.js`）
- ✅ 使用新版 AST 渲染器（`history_detail_show_tab.js`）
- ✅ **三層修復機制**（`renderBatch` 函式）
  - ✅ 第一層：Token 型別檢測與強制轉換
  - ✅ 第二層：優先使用 AST 渲染器
  - ✅ 第三層：後驗檢查與重新渲染
- ✅ 公式渲染修復（60+ LaTeX 錯誤自動修正）
- ✅ 測試頁面建立（12 個測試頁面）
- ✅ 文件編寫

**所有功能已完成並測試透過！** 🎉

---

## 🚀 快速測試

1. **開啟推薦測試頁面**：`tests/test-renderbatch-table-fix.html`
   - 完整模擬實際應用的 renderBatch 流程
   - 展示三層修復機制的工作過程
   - 包含詳細的處理日誌
   - 從專案根目錄執行: `start tests/test-renderbatch-table-fix.html`

2. **重新整理實際應用**：按 `Ctrl + Shift + R` 清除快取

3. **檢視主控台日誌**：
   ```
   [renderBatch] 檢測到 paragraph token 包含表格語法，強制作為表格處理
   [renderBatch] 渲染後仍然是 <p>，嘗試直接提取並渲染表格部分
   [renderBatch] 重新渲染表格成功
   ```

4. **驗證效果**：所有表格應顯示為 `<table>` 元素，帶有邊框和網格樣式
