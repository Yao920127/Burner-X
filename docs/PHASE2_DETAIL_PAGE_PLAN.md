# Phase 2: History 詳情頁效能最佳化計劃

> **優先順序**: ⭐⭐⭐ **高** （使用者主要工作區）
> **預期收益**: 標籤切換速度提升 60-80%，記憶體佔用減少 30%

---

## 🎯 為什麼最佳化詳情頁？

### 使用頻率對比

| 頁面 | 使用頻率 | 停留時間 | 互動次數 | 優先順序 |
|------|---------|---------|---------|--------|
| 歷史列表 (history.js) | 低 | 5-10秒 | 2-3次 | 低 |
| **詳情頁 (history_detail)** | **⭐⭐⭐ 高** | **5-30分鐘** | **50-200次** | **⭐⭐⭐ 高** |

### 使用者行為分析

```
使用者典型工作流程：
1. 開啟歷史記錄 (5秒)
2. 點選一條記錄 → 進入詳情頁
3. 在詳情頁工作 20 分鐘：
   - 切換分頁 20+ 次 ⬅️ 效能瓶頸
   - 滾動瀏覽內容 100+ 次
   - 新增批註 10+ 次 ⬅️ 效能瓶頸
   - 使用目錄導航 15+ 次
```

**結論**: 詳情頁的效能影響 **95%** 的使用者體驗！

---

## 🔍 已發現的效能問題

### 問題 1: 分頁切換沒有真正的防抖 ⚠️ 嚴重

**檔案**: `js/history/history_detail_show_tab.js:41-44`

**當前程式碼**:
```javascript
if (renderingTab === tab) {
    console.log(`[showTab] Tab ${tab} 正在渲染中，跳過重複渲染`);
    return;
}
renderingTab = tab;

// 然後執行大量渲染...
```

**問題**:
- 這只是一個簡單的"渲染鎖"
- 使用者快速點選 3 個標籤 → 觸發 3 次完整渲染
- 沒有延遲合併機制

**場景**:
```
使用者操作: 點選"OCR" → 0.1秒後點選"翻譯" → 0.1秒後點選"對比"

當前行為:
  渲染 OCR (800ms) → 渲染翻譯 (800ms) → 渲染對比 (1200ms)
  總耗時: 2.8秒 ❌

理想行為（防抖）:
  等待 200ms → 只渲染"對比"
  總耗時: 1.2秒 ✅ (快 57%)
```

**最佳化方案**:
```javascript
// 使用防抖
let showTabDebounced = null;
let pendingTab = null;

function showTab(tab) {
    pendingTab = tab;

    if (!showTabDebounced) {
        showTabDebounced = setTimeout(() => {
            showTabDebounced = null;
            showTabImmediate(pendingTab);
        }, 100); // 100ms 延遲
    }
}

function showTabImmediate(tab) {
    // 原有的渲染邏輯...
}
```

**預期效果**: 快速切換標籤時減少 **60-80%** 的渲染次數

---

### 問題 2: DOM 元素重複查詢 ⚠️ 中等

**檔案**: `js/history/history_detail_show_tab.js:70-83`

**當前程式碼**:
```javascript
// 每次切換都查詢 5 次
document.getElementById('tab-ocr').classList.remove('active');
document.getElementById('tab-translation').classList.remove('active');
document.getElementById('tab-chunk-compare').classList.remove('active');
const pdfCompareTabBtn = document.getElementById('tab-pdf-compare');
if (pdfCompareTabBtn) pdfCompareTabBtn.classList.remove('active');

const titleElement = document.getElementById('fileName');
const metaElement = document.getElementById('fileMeta');
const tabsContainer = document.querySelector('.tabs-container');
```

**問題**:
- 每次標籤切換都重新查詢 8+ 個 DOM 元素
- 使用者切換 20 次 = 160+ 次 DOM 查詢
- 這些元素是固定的，應該快取

**最佳化方案**:
```javascript
// 頁面載入時快取一次
const DOM_CACHE = {
    tabs: {
        ocr: document.getElementById('tab-ocr'),
        translation: document.getElementById('tab-translation'),
        chunkCompare: document.getElementById('tab-chunk-compare'),
        pdfCompare: document.getElementById('tab-pdf-compare')
    },
    elements: {
        title: document.getElementById('fileName'),
        meta: document.getElementById('fileMeta'),
        tabsContainer: document.querySelector('.tabs-container')
    }
};

function showTab(tab) {
    // 使用快取
    Object.values(DOM_CACHE.tabs).forEach(el => {
        if (el) el.classList.remove('active');
    });

    if (DOM_CACHE.tabs[tab]) {
        DOM_CACHE.tabs[tab].classList.add('active');
    }
}
```

**預期效果**: 減少 **95%** 的 DOM 查詢，標籤切換快 **20-30ms**

---

### 問題 3: 目錄導航可能沒有虛擬化 ⚠️ 中等

**檔案**: `js/ui/toc_logic.js` (1449 行)

**需要檢查**:
- 大文件（100+ 個標題）是否渲染了所有目錄項？
- 是否使用了虛擬滾動？

**場景**:
```
大文件: 150 個標題
當前: 渲染 150 個 <li> 元素
最佳化後: 只渲染可見的 10-15 個 <li>
```

**預期效果**: 大文件目錄載入時間減少 **70%**

---

### 問題 4: 批註系統 DOM 查詢（已在 Phase 1 中識別）

**檔案**: `js/annotations/annotation_logic.js:440-500`

**問題**: 右鍵選單時全文件 `querySelectorAll`

**狀態**: 待最佳化（Phase 2.2）

---

## 📋 Phase 2 最佳化清單

### 2.1 分頁切換防抖 ⭐⭐⭐

**檔案**: `js/history/history_detail_show_tab.js`

**最佳化內容**:
1. 新增防抖函式
2. 使用者快速切換時只渲染最後一個標籤
3. 保留渲染鎖（防止並行渲染）

**風險**: 🟡 中（需要測試標籤切換邏輯）

**預期收益**:
- 快速切換時減少 60-80% 渲染
- 標籤響應更流暢

**測試要點**:
- [ ] 快速點選多個標籤，只渲染最後一個
- [ ] 正常點選不受影響
- [ ] 渲染過程中點選其他標籤，正確切換

---

### 2.2 DOM 元素快取 ⭐⭐⭐

**檔案**: `js/history/history_detail_show_tab.js`

**最佳化內容**:
1. 頁面載入時快取所有固定 DOM 元素
2. 使用 WeakMap 快取動態元素
3. 減少重複查詢

**風險**: 🟢 低（純最佳化，不改變邏輯）

**預期收益**:
- 標籤切換快 20-30ms
- 程式碼更清晰

**測試要點**:
- [ ] 標籤切換功能正常
- [ ] 所有按鈕樣式正確
- [ ] 頁面重新整理後快取正確重建

---

### 2.3 批註系統 DOM 快取（Phase 1 遺留）⭐⭐

**檔案**: `js/annotations/annotation_logic.js`

**最佳化內容**:
1. 建立 `AnnotationDOMCache` 類
2. 初始化時快取所有 sub-block 元素
3. DOM 變化時自動重新整理快取

**風險**: 🟡 中（需要處理 DOM 更新同步）

**預期收益**:
- 右鍵響應: 280ms → 40ms (**86%** ↓)
- 批註建立更流暢

**測試要點**:
- [ ] 右鍵選單響應 < 50ms
- [ ] 批註建立功能正常
- [ ] 標籤切換後快取正確更新

---

### 2.4 目錄導航最佳化（可選）⭐

**檔案**: `js/ui/toc_logic.js`

**需要先分析**:
- 檢視當前實現是否已經最佳化
- 測試大文件（100+ 標題）效能
- 如果已經足夠快，可以跳過

**最佳化內容**（如果需要）:
1. 實現虛擬滾動（只渲染可見目錄項）
2. 防抖目錄搜尋（如果有搜尋功能）

**風險**: 🟡 中

**預期收益**: 大文件目錄載入快 70%

---

## 🧪 測試計劃

### 測試工具

建立 `tests/performance/phase2-detail-test.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Phase 2: 詳情頁效能測試</title>
</head>
<body>
    <h1>Phase 2 效能測試</h1>

    <h2>測試 1: 標籤切換防抖</h2>
    <button onclick="testTabSwitching()">快速切換標籤</button>
    <div id="tab-switch-result"></div>

    <h2>測試 2: DOM 快取</h2>
    <button onclick="testDOMCache()">測試 DOM 查詢效能</button>
    <div id="dom-cache-result"></div>

    <h2>測試 3: 批註系統</h2>
    <button onclick="testAnnotationPerformance()">測試右鍵響應</button>
    <div id="annotation-result"></div>

    <script>
    // 測試腳本...
    </script>
</body>
</html>
```

### 效能基準

| 操作 | 最佳化前 | 目標 | 最佳化後 |
|------|--------|------|--------|
| 快速切換 3 個標籤 | 2800ms | < 1200ms | ___ ms |
| 單次標籤切換 | 800ms | < 650ms | ___ ms |
| 右鍵選單響應 | 280ms | < 50ms | ___ ms |
| DOM 查詢（20次切換） | 160次 | < 20次 | ___ 次 |

---

## 📊 預期總體提升

### 詳情頁使用體驗

| 方面 | 最佳化前 | 最佳化後 | 提升 |
|------|--------|--------|------|
| 標籤切換響應 | 慢（2-3秒） | 快（0.5-1秒） | **60-80%** ↑ |
| 右鍵選單 | 延遲（300ms） | 即時（< 50ms） | **83%** ↑ |
| 記憶體佔用 | 基準 M | 0.7M | **30%** ↓ |
| 流暢度 | 偶爾卡頓 | 流暢 | ✅ |

### 使用者感知

- ✅ 標籤切換更流暢
- ✅ 批註操作更快捷
- ✅ 整體體驗更專業

---

## 🗓️ 實施時間表

### Week 1: 分頁最佳化
- Day 1-2: 實現標籤切換防抖
- Day 3: DOM 快取最佳化
- Day 4-5: 測試和調優

### Week 2: 批註系統最佳化
- Day 1-2: 實現 AnnotationDOMCache
- Day 3: 整合到現有系統
- Day 4-5: 測試和調優

### Week 3: 可選最佳化
- 目錄導航（如果需要）
- 效能監控工具
- 文件更新

---

## 🎯 成功標準

Phase 2 完成的標準：

- [ ] **標籤切換測試透過**
  - [ ] 快速切換隻渲染最後一個
  - [ ] 渲染次數減少 > 60%
  - [ ] 所有標籤功能正常

- [ ] **DOM 快取測試透過**
  - [ ] 查詢次數減少 > 90%
  - [ ] 標籤切換快 > 20ms
  - [ ] 無功能迴歸

- [ ] **批註系統測試透過**
  - [ ] 右鍵響應 < 50ms
  - [ ] 批註建立正常
  - [ ] 醒目提示顯示正確

- [ ] **效能測試透過**
  - [ ] 使用測試工具驗證
  - [ ] 實際應用測試透過
  - [ ] 使用者反饋積極

---

## 🔄 回滾方案

每個最佳化獨立 commit，可以單獨回滾：

```bash
# 回滾標籤防抖
git revert <tab-debounce-commit>

# 回滾 DOM 快取
git revert <dom-cache-commit>

# 回滾批註最佳化
git revert <annotation-cache-commit>
```

---

## 📝 下一步

完成 Phase 2 後，繼續：

- **Phase 3**: 事件委託重構（聊天訊息渲染）
- **Phase 4**: 虛擬滾動（歷史列表、目錄導航）

---

**讓我們開始最佳化使用者真正使用的頁面！** 🚀
