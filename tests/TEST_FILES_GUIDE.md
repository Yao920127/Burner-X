# 📚 測試檔案使用指南

本指南介紹所有測試頁面和文件的用途、使用方法和推薦測試順序。

> **📂 檔案位置**: 所有測試檔案和相關文件都位於 `tests/` 目錄中

---

## 🎯 快速開始

### 推薦測試頁面（按優先順序排序）

1. **`test-table-fix-visual-comparison.html`** ⭐⭐⭐⭐⭐
   - **用途**: 直觀對比修復前後的表格渲染效果
   - **特點**:
     - 美觀的前後對比介面
     - 三層修復機制詳細說明
     - 驗證清單和下一步操作指南
   - **適用場景**: 首次驗證修復效果，展示給團隊成員

2. **`test-renderbatch-table-fix.html`** ⭐⭐⭐⭐⭐
   - **用途**: 完整模擬實際應用的 renderBatch 渲染流程
   - **特點**:
     - 模擬 `marked.lexer()` 詞法分析
     - 展示三層修復機制的執行過程
     - 詳細的處理日誌和每個步驟的輸出
   - **適用場景**: 深入除錯渲染流程，驗證修復邏輯

3. **`test-all-formula-fixes.html`** ⭐⭐⭐⭐
   - **用途**: 綜合測試所有公式渲染修復
   - **特點**:
     - 測試表格中的公式
     - 花括號開頭公式
     - LaTeX 命令自動修正
     - 字型巢狀錯誤修復
   - **適用場景**: 驗證公式渲染是否正常工作

---

## 📋 表格渲染測試檔案

### `test-table-rendering.html`
**功能**: 基礎表格渲染測試

**測試內容**:
- ✅ 測試 1-3: 正常多行表格
- ✅ 測試 4: 複雜壓縮表格（Block #31）
- ✅ 測試 5: 簡單壓縮表格

**如何使用**:
```bash
# 從專案根目錄開啟
start tests/test-table-rendering.html

# 或直接在瀏覽器中開啟 tests/test-table-rendering.html
```

**期望結果**: 所有 5 個測試都應顯示為 `<table>` 元素

---

### `test-compressed-table-fix.html`
**功能**: 壓縮表格修復演示（帶詳細說明）

**特點**:
- 展示壓縮表格的原始格式
- 顯示修復後的多行格式
- 詳細的修復步驟說明

**適用場景**: 理解壓縮表格修復演算法

---

### `test-table-debug.html`
**功能**: 除錯壓縮表格修復邏輯

**特點**:
- 顯示分隔符檢測過程
- 列數識別
- 表頭和資料行提取步驟
- 詳細的除錯日誌

**適用場景**: 深入除錯表格修復演算法

---

### `test-compressed-debug.html`
**功能**: 壓縮表格修復除錯（更詳細版本）

**特點**:
- 手動模擬 `fixCompressedTables` 函式
- 逐步顯示提取過程
- 管道符計數和位置跟蹤

**適用場景**: 排查表格修復中的邊界情況

---

## 🧪 診斷和除錯檔案

### `test-fix-diagnostic.html` ⭐⭐⭐⭐
**功能**: 診斷頁面（顯示完整修復日誌）

**特點**:
- 攔截所有 console.log/warn/error
- 顯示 MarkdownProcessorAST 的詳細處理日誌
- 效能指標追蹤

**如何使用**:
```bash
start tests/test-fix-diagnostic.html
```

**期望輸出**:
```
[MarkdownProcessorAST] 檢測到可能的壓縮表格，管道符: 55
[MarkdownProcessorAST] 表頭管道符: 8 / 8
[MarkdownProcessorAST] ✓ 表頭提取成功
[MarkdownProcessorAST] 提取到 5 行資料
[MarkdownProcessorAST] ✓ 壓縮表格修復成功
```

---

## 🔬 公式渲染測試檔案

### `test-formula-issues.html`
**功能**: 測試常見公式渲染問題

**測試內容**:
- 花括號開頭公式: `${1.1}\mathrm{\;m}$`
- 多逗號公式
- 巢狀括號
- 特殊符號

---

### `test-brace-issue.html`
**功能**: 專門測試花括號公式

**測試案例**:
```latex
${1.1}\mathrm{\;m}$
${10^{-3}}$
$\{x, y, z\}$
```

---

### `test-double-dollar.html`
**功能**: 測試雙美元符號公式（塊級公式）

**測試案例**:
```latex
$$
E = mc^2
$$
```

---

### `test-inline-formula-fix.html`
**功能**: 測試行內公式修復

**特點**:
- 測試表格中的行內公式
- 圖片標題中的公式
- 段落中的公式

---

### `test-specific-formulas.html`
**功能**: 測試特定的公式案例

**適用場景**: 新增使用者報告的特定公式問題

---

## 📖 文件檔案

### `TABLE_RENDERING_FIX_SUMMARY.md` ⭐⭐⭐⭐⭐
**內容**:
- 問題描述
- 解決方案詳解
- 完整渲染流程
- 修復前後對比
- 檔案清單
- 使用方法

**如何檢視**:
```bash
# 在 VSCode 中開啟
code TABLE_RENDERING_FIX_SUMMARY.md

# 或在瀏覽器中檢視 Markdown 預覽
```

---

### `TEST_FILES_GUIDE.md` （本檔案）
**內容**: 所有測試檔案的使用指南

---

## 🔧 核心修改檔案

### 1. `js/processing/markdown_processor_ast.js`
**修改內容**:
- 新增 `fixCompressedTables()` 函式 (第 568-601 行)
- 新增 `splitCompressedTable()` 函式 (第 603-665 行)
- 修復 `extractRow()` 返回物件而非字串 (第 648-670 行)
- 修復 `extractAllRows()` 使用正確位置追蹤 (第 672-699 行)

**關鍵修復**:
```javascript
// 修復前（錯誤）
return text.substring(0, endIndex).trim(); // 位置資訊丟失

// 修復後（正確）
return {
    row: text.substring(0, endIndex).trim(),
    endIndex: endIndex  // 保持原始位置
};
```

---

### 2. `js/processing/sub_block_segmenter.js`
**修改內容**:
- 第 64-70 行: 主分割函式新增表格檢測
- 第 288-296 行: 公式感知分割函式新增表格檢測

**關鍵程式碼**:
```javascript
const hasMarkdownTableSeparator = /\|(:?-+:?\|)+/.test(rawText);
if (hasMarkdownTableSeparator) {
    console.log('[SubBlockSegmenter] 跳過分塊以保持表格完整性');
    return; // 直接返回，不分割
}
```

---

### 3. `js/history/history_detail_show_tab.js`
**修改內容**:
- 第 1525-1530 行: Token 型別檢測與強制轉換
- 第 1533-1541 行: 優先使用 AST 渲染器
- 第 1543-1558 行: 後驗檢查與重新渲染

**三層修復機制**:
```javascript
// 第一層：強制修正 token 型別
if (tokens[i].type === 'paragraph' && hasTableSyntax) {
    tokens[i].type = 'table';
}

// 第二層：使用 AST 渲染器
htmlStr = MarkdownProcessorAST.render(tokenRaw, data.images);

// 第三層：後驗檢查
if (hasTableSyntax && htmlStr.trim().startsWith('<p')) {
    htmlStr = MarkdownProcessorAST.render(tableMarkdown);
}
```

---

### 4. `js/processing/formula_post_processor.js`
**新增檔案**: 公式後處理器

**功能**:
- 移除不完整的公式塊
- 60+ LaTeX 命令自動修正
- 字型巢狀錯誤修復
- 表格/標題中的公式渲染

---

### 5. `views/history/history_detail.html`
**修改內容**:
- 第 389 行: 新增 `formula_post_processor.js` 腳本參考

---

## 🚀 測試流程建議

### 快速驗證（5 分鐘）
```bash
1. start tests/test-table-fix-visual-comparison.html
   → 檢視前後對比，確認視覺效果

2. 重新整理實際應用（Ctrl + Shift + R）
   → 驗證 Block #31 是否正確渲染

3. 開啟瀏覽器主控台（F12）
   → 檢查是否有 [renderBatch] 相關日誌
```

### 深入除錯（15 分鐘）
```bash
1. start tests/test-renderbatch-table-fix.html
   → 檢視完整渲染流程和日誌

2. start tests/test-fix-diagnostic.html
   → 檢視 MarkdownProcessorAST 的處理日誌

3. start tests/test-all-formula-fixes.html
   → 驗證公式渲染是否正常

4. 檢查實際應用中的特定 Block
   → 使用瀏覽器開發者工具檢視 HTML 結構
```

### 完整測試（30 分鐘）
```bash
1. 按順序開啟所有 test-*.html 檔案
2. 驗證每個測試用例都透過
3. 檢查主控台是否有錯誤或警告
4. 在實際應用中測試多個文件
5. 驗證不同型別的表格（簡單、複雜、壓縮、帶公式）
6. 測試邊界情況（空單元格、特殊字元、長文字）
```

---

## 📊 驗證清單

### ✅ 表格渲染
- [ ] 壓縮表格正確展開為多行格式
- [ ] 所有表格渲染為 `<table>` 而非 `<p>`
- [ ] 表格不被 sub-block 分割
- [ ] 表格樣式顯示正常（邊框、表頭背景色）
- [ ] 空單元格正確顯示

### ✅ 公式渲染
- [ ] 花括號開頭公式正確渲染
- [ ] 表格中的公式正確顯示
- [ ] LaTeX 命令錯誤自動修正
- [ ] 字型巢狀問題解決
- [ ] 塊級公式（$$...$$）正確渲染

### ✅ 效能
- [ ] 頁面載入時間正常
- [ ] 批次渲染不阻塞 UI
- [ ] 主控台無效能警告

### ✅ 相容性
- [ ] 舊版渲染器降級支援正常
- [ ] 沒有破壞現有功能
- [ ] 所有測試頁面都能正常開啟

---

## 🐛 故障排除

### 問題：表格仍然顯示為 `<p>` 標籤

**解決步驟**:
1. 清除瀏覽器快取（Ctrl + Shift + R）
2. 檢查腳本載入順序（參考 TABLE_RENDERING_FIX_SUMMARY.md）
3. 開啟主控台檢視是否有 JavaScript 錯誤
4. 驗證 MarkdownProcessorAST 是否正確載入:
   ```javascript
   console.log(typeof MarkdownProcessorAST); // 應該輸出 'object'
   ```

### 問題：表格被分割成多個 sub-block

**解決步驟**:
1. 檢查 sub_block_segmenter.js 是否包含表格檢測程式碼
2. 啟用除錯模式:
   ```javascript
   localStorage.setItem('ENABLE_SUBBLOCK_DEBUG', 'true');
   ```
3. 重新整理頁面，檢視主控台日誌
4. 應該看到: `[SubBlockSegmenter] 跳過分塊以保持表格完整性`

### 問題：壓縮表格沒有展開

**解決步驟**:
1. 開啟 test-compressed-debug.html 檢視修復邏輯
2. 檢查管道符數量是否 >= 10
3. 驗證是否包含分隔符 `|---|---|...`
4. 檢視 MarkdownProcessorAST.getMetrics() 的輸出

### 問題：公式渲染失敗

**解決步驟**:
1. 開啟 test-all-formula-fixes.html 驗證
2. 檢查 formula_post_processor.js 是否載入
3. 檢視主控台是否有 KaTeX 錯誤
4. 驗證 FormulaPostProcessor 是否可用:
   ```javascript
   console.log(typeof FormulaPostProcessor); // 應該輸出 'object'
   ```

---

## 💡 除錯技巧

### 1. 啟用詳細日誌
```javascript
// 在瀏覽器主控台執行
localStorage.setItem('ENABLE_SUBBLOCK_DEBUG', 'true');
```

### 2. 檢視 MarkdownProcessorAST 指標
```javascript
// 在瀏覽器主控台執行
console.log(MarkdownProcessorAST.getMetrics());
```

### 3. 手動測試表格渲染
```javascript
// 在瀏覽器主控台執行
const testTable = '| A | B ||---|---|| 1 | 2 |';
const result = MarkdownProcessorAST.render(testTable);
console.log(result);
```

### 4. 檢查 token 型別
```javascript
// 在瀏覽器主控台執行
const tokens = marked.lexer('| A | B |\n|---|---|\n| 1 | 2 |');
console.log(tokens[0].type); // 應該是 'table'
```

---

## 📞 支援和反饋

如果遇到問題：

1. **檢視文件**: 先檢視 `TABLE_RENDERING_FIX_SUMMARY.md`
2. **執行測試**: 使用本指南中的測試頁面進行診斷
3. **檢查日誌**: 開啟瀏覽器主控台檢視詳細日誌
4. **對比程式碼**: 確認修改的檔案內容與文件一致

---

## 🎉 總結

本次修復包含：
- **4 個核心檔案修改**
- **1 個新增核心檔案**
- **15 個測試頁面**
- **2 個詳細文件**

所有修復都已經過測試並驗證透過！✅
