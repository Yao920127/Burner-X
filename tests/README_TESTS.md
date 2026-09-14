# 📚 Tests 目錄

本目錄包含所有與表格渲染修複相關的測試檔案和文件。

---

## 📂 目錄結構

### 🎯 核心文件（必讀）
- **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - 實施完成報告
- **[TABLE_RENDERING_FIX_SUMMARY.md](TABLE_RENDERING_FIX_SUMMARY.md)** - 詳細技術文件
- **[TEST_FILES_GUIDE.md](TEST_FILES_GUIDE.md)** - 測試檔案使用指南

### ⭐ 推薦測試頁面
1. **[test-table-fix-visual-comparison.html](test-table-fix-visual-comparison.html)** - 前後對比（最佳視覺效果）
2. **[test-renderbatch-table-fix.html](test-renderbatch-table-fix.html)** - 完整渲染流程測試
3. **[test-fix-diagnostic.html](test-fix-diagnostic.html)** - 診斷頁面

### 📋 表格渲染測試
- `test-table-rendering.html` - 基礎表格渲染測試（5個測試用例）
- `test-compressed-table-fix.html` - 壓縮表格修復演示
- `test-compressed-debug.html` - 壓縮表格除錯
- `test-table-debug.html` - 表格除錯頁面

### 🔬 公式渲染測試
- `test-all-formula-fixes.html` - 綜合公式測試
- `test-formula-issues.html` - 常見公式問題
- `test-brace-issue.html` - 花括號公式
- `test-double-dollar.html` - 塊級公式
- `test-inline-formula-fix.html` - 行內公式
- `test-specific-formulas.html` - 特定公式案例

### 🧪 其他測試檔案
本目錄還包含專案其他部分的測試檔案（如註釋、詞彙表、AST 等）。

---

## 🚀 快速開始

### 從專案根目錄執行測試

```bash
# Windows
start tests/test-table-fix-visual-comparison.html

# 或使用 macOS/Linux
open tests/test-table-fix-visual-comparison.html
```

### 檢視文件

```bash
# 在 VSCode 中開啟主文件
code tests/IMPLEMENTATION_COMPLETE.md

# 檢視測試檔案使用指南
code tests/TEST_FILES_GUIDE.md
```

---

## ✅ 驗證修復效果

### 1. 開啟推薦測試頁面
```bash
start tests/test-table-fix-visual-comparison.html
```

### 2. 重新整理實際應用
- 按 `Ctrl + Shift + R` 清除快取並重新整理
- 開啟包含表格的文件（如 Block #31）

### 3. 檢查主控台日誌
按 `F12` 開啟瀏覽器開發者工具，應該看到：
```
[renderBatch] 檢測到 paragraph token 包含表格語法
[SubBlockSegmenter] 跳過分塊以保持表格完整性
[renderBatch] 重新渲染表格成功
```

### 4. 驗證表格渲染
- 所有表格應顯示為 `<table>` 元素（而非 `<p>`）
- 表格應有邊框和表頭背景色
- 壓縮表格已自動展開為多行格式

---

## 📖 詳細說明

### 三層修復機制

1. **第一層**：Token 型別檢測與強制轉換
   - 檢測被誤判為 paragraph 的表格
   - 強制修正 token 型別為 table

2. **第二層**：優先使用 AST 渲染器
   - MarkdownProcessorAST 支援壓縮表格修復
   - 自動展開單行表格為多行格式

3. **第三層**：後驗檢查與重新渲染
   - 如果仍然是 `<p>` 則提取內容重新渲染
   - 兜底保護確保表格正確顯示

### 修復的問題

- ✅ 壓縮表格自動修復（單行表格展開）
- ✅ Sub-block 分割器保護表格（不分割）
- ✅ 強制正確的 token 型別
- ✅ 60+ LaTeX 公式錯誤自動修正
- ✅ 表格中的公式正確渲染

---

## 🐛 故障排除

如果表格仍然無法正確顯示：

1. **清除快取**：`Ctrl + Shift + R`
2. **檢查腳本載入**：開啟主控台，執行：
   ```javascript
   console.log(typeof MarkdownProcessorAST); // 應該輸出 'object'
   console.log(typeof FormulaPostProcessor); // 應該輸出 'object'
   ```
3. **啟用除錯模式**：
   ```javascript
   localStorage.setItem('ENABLE_SUBBLOCK_DEBUG', 'true');
   ```
4. **檢視詳細文件**：[TEST_FILES_GUIDE.md](TEST_FILES_GUIDE.md) 中有完整的故障排除指南

---

## 📞 更多資訊

- **技術實現詳情**：檢視 [TABLE_RENDERING_FIX_SUMMARY.md](TABLE_RENDERING_FIX_SUMMARY.md)
- **測試流程建議**：檢視 [TEST_FILES_GUIDE.md](TEST_FILES_GUIDE.md)
- **完整實施報告**：檢視 [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)

---

**狀態**: ✅ 所有修復已完成並測試透過

**最後更新**: 2025-11-12
