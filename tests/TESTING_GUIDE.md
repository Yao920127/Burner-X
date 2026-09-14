# PDF Compare View 重構測試指南

本文件說明如何測試重構後的 PDF 對比功能。

## 📋 重構概況

已將 `history_pdf_compare.js` (2606行) 拆分為：
- **TextFitting.js** (~450行) - 文字自適應渲染
- **PDFExporter.js** (~450行) - PDF匯出功能
- **SegmentManager.js** (~400行) - 長畫布分段管理
- **主類** (~1300行) - 協調器和核心邏輯

## 🔧 測試前準備

### 1. 確保新模組已載入
在 `index.html` 或相關HTML檔案中，在載入 `history_pdf_compare.js` **之前**新增：

```html
<!-- 載入新的模組 -->
<script src="js/history/modules/TextFitting.js"></script>
<script src="js/history/modules/PDFExporter.js"></script>
<script src="js/history/modules/SegmentManager.js"></script>

<!-- 載入主類 -->
<script src="js/history/history_pdf_compare.js"></script>
```

### 2. 清除瀏覽器快取
重要！使用 Ctrl+Shift+R (或 Cmd+Shift+R) 強制重新整理頁面。

## ✅ 測試清單

### 測試1: PDF載入和顯示
**目的**: 驗證PDF能正常載入和顯示

1. 開啟應用並選擇一個PDF檔案
2. 等待PDF載入完成
3. **預期結果**:
   - ✅ 左側顯示原文PDF
   - ✅ 右側顯示翻譯後的PDF
   - ✅ 頁面滾動流暢，無白屏
   - ✅ 主控台無錯誤

### 測試2: 文字自適應渲染
**目的**: 驗證 TextFitting.js 模組工作正常

1. 檢查右側翻譯區域的文字顯示
2. **預期結果**:
   - ✅ 文字完整顯示在bbox框內
   - ✅ 字號自適應，未超出邊界
   - ✅ 中文和英文換行正確
   - ✅ 數學公式(如有)正確渲染

**驗證程式碼** (在瀏覽器主控台):
```javascript
// 檢查 TextFittingAdapter 是否載入
console.log('TextFittingAdapter:', typeof TextFittingAdapter);

// 檢查主類是否使用了模組
const view = window.pdfCompareView; // 假設例項儲存在這裡
console.log('使用TextFittingAdapter:', view.textFittingAdapter);
```

### 測試3: 長畫布分段渲染
**目的**: 驗證 SegmentManager.js 模組工作正常

1. 滾動PDF頁面，從第一頁滾動到最後一頁
2. 快速滾動和慢速滾動都要測試
3. **預期結果**:
   - ✅ 滾動流暢，無卡頓
   - ✅ 頁面內容按需載入(懶載入)
   - ✅ 所有頁面都能正確顯示
   - ✅ 記憶體佔用穩定(檢視工作管理員)

**驗證程式碼**:
```javascript
// 檢查 SegmentManager 是否載入
console.log('SegmentManager:', typeof SegmentManager);

// 檢查分段資訊
const view = window.pdfCompareView;
console.log('分段數量:', view.segmentManager?.segments?.length);
console.log('頁面資訊:', view.segmentManager?.pageInfos?.length);
```

### 測試4: PDF匯出功能
**目的**: 驗證 PDFExporter.js 模組工作正常

1. 點選"匯出譯文PDF"按鈕
2. 等待PDF生成和下載
3. 開啟下載的PDF檔案
4. **預期結果**:
   - ✅ PDF成功下載
   - ✅ 譯文文字正確顯示在原文位置
   - ✅ 文字大小與Canvas顯示一致
   - ✅ 文字未超出bbox邊界
   - ✅ 中文字型正確顯示

**驗證程式碼**:
```javascript
// 檢查 PDFExporter 是否載入
console.log('PDFExporter:', typeof PDFExporter);

// 手動觸發匯出(如果需要)
const view = window.pdfCompareView;
view.pdfExporter?.exportStructuredTranslation(
  view.originalPdfBase64,
  view.translatedContentList,
  showNotification
);
```

### 測試5: 互動功能
**目的**: 驗證使用者互動功能未受影響

1. 點選左側PDF的文字塊
2. **預期結果**:
   - ✅ 左側bbox醒目提示
   - ✅ 右側對應區域醒目提示
   - ✅ 醒目提示顏色正確(紫紅色)

3. 測試滾動聯動
4. **預期結果**:
   - ✅ 左右側滾動保持同步
   - ✅ 滾動流暢無延遲

### 測試6: 記憶體洩漏檢測
**目的**: 驗證事件監聽器正確清理

1. 開啟瀏覽器開發者工具 → Performance → Memory
2. 載入PDF，滾動幾次
3. 切換到其他頁面或關閉PDF檢視
4. 點選"Collect garbage"按鈕
5. **預期結果**:
   - ✅ 記憶體使用量下降
   - ✅ 沒有持續增長的記憶體佔用

**驗證程式碼**:
```javascript
// 檢查事件監聽器是否被清理
const view = window.pdfCompareView;
view.segmentManager?.destroy();

// 驗證清理後的狀態
console.log('Segments:', view.segmentManager?.segments?.length); // 應該為 0
console.log('Handlers:', view.segmentManager?._originalScrollHandler); // 應該為 null
```

## 🐛 常見問題排查

### 問題1: 主控台報錯 "TextFittingAdapter is not defined"
**原因**: 模組未正確載入
**解決**:
1. 檢查HTML中的script標籤順序
2. 確保模組檔案路徑正確
3. 清除瀏覽器快取

### 問題2: 文字大小與預期不符
**原因**: PDF匯出和Canvas渲染的公式不一致
**解決**:
1. 檢查是否使用了最新的修復版本
2. 確認PDFExporter.js中的文字高度公式為 `mid * 1.2`

### 問題3: 滾動時記憶體持續增長
**原因**: 事件監聽器未正確清理
**解決**:
1. 確認SegmentManager.js的destroy方法正確實現
2. 檢查事件處理函式是否儲存了參考

### 問題4: 頁面載入緩慢或白屏
**原因**: 懶載入未生效
**解決**:
1. 檢查SegmentManager的配置
2. 驗證maxSegmentPixels設定是否合理

## 📊 效能對比

重構前後效能對比：

| 指標 | 重構前 | 重構後 | 改進 |
|------|--------|--------|------|
| 程式碼行數 | 2606行 | 1300行+1270行(模組) | 模組化 ✅ |
| 首次載入時間 | 測試中 | 測試中 | - |
| 滾動幀率 | 測試中 | 測試中 | - |
| 記憶體佔用 | 測試中 | 測試中 | - |
| 匯出時間 | 測試中 | 測試中 | - |

## 🔍 除錯技巧

### 啟用詳細日誌
在瀏覽器主控台執行：
```javascript
// 設定日誌級別
localStorage.setItem('debug', 'true');
location.reload();
```

### 檢視模組狀態
```javascript
const view = window.pdfCompareView;

// 檢查所有模組
console.log('TextFittingAdapter:', view.textFittingAdapter);
console.log('PDFExporter:', view.pdfExporter);
console.log('SegmentManager:', view.segmentManager);

// 檢視快取
console.log('Font cache size:', view.textFittingAdapter?.globalFontSizeCache?.size);
console.log('Formula cache size:', view.textFittingAdapter?._formulaCache?.size);
```

### 效能分析
```javascript
// 測量渲染時間
console.time('render-segment');
await view.segmentManager.renderSegment(view.segmentManager.segments[0]);
console.timeEnd('render-segment');

// 測量匯出時間
console.time('export-pdf');
await view.pdfExporter.exportStructuredTranslation(...);
console.timeEnd('export-pdf');
```

## 📝 測試報告模板

完成測試後，請填寫以下報告：

```markdown
## 測試環境
- 瀏覽器: [Chrome 120 / Firefox 121 / Safari 17]
- 作業系統: [Windows 11 / macOS 14 / Linux]
- PDF檔案大小: [XX MB, XX頁]
- 測試時間: [YYYY-MM-DD HH:MM]

## 測試結果
- [ ] 測試1: PDF載入和顯示 - [透過/失敗]
- [ ] 測試2: 文字自適應渲染 - [透過/失敗]
- [ ] 測試3: 長畫布分段渲染 - [透過/失敗]
- [ ] 測試4: PDF匯出功能 - [透過/失敗]
- [ ] 測試5: 互動功能 - [透過/失敗]
- [ ] 測試6: 記憶體洩漏檢測 - [透過/失敗]

## 發現的問題
1. [問題描述]
   - 重現步驟:
   - 預期結果:
   - 實際結果:
   - 主控台錯誤:

## 總體評價
- 功能完整性: [0-100%]
- 效能表現: [優秀/良好/一般/較差]
- 穩定性: [優秀/良好/一般/較差]
- 建議:
```

## 🚀 回滾方案

如果測試發現嚴重問題，可以快速回滾到原始版本：

```bash
# 檢視最近的提交
git log --oneline -5

# 回滾到重構前的版本
git checkout <commit-hash> -- js/history/history_pdf_compare.js

# 或者切換到main分支
git checkout main
```

## 📞 支援

如有問題，請：
1. 檢視瀏覽器主控台的詳細錯誤資訊
2. 檢查本文件的"常見問題排查"部分
3. 提供完整的測試報告和錯誤日誌

---

**測試重點**: 確保重構後的功能與原始版本**完全一致**，無功能退化。
