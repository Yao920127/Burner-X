# Phase 1.2: 歷史記錄搜尋輸入防抖最佳化

## 檔案: js/history/history.js

### 修改 1: 新增防抖函式定義

**位置**: 檔案標頭，第 6 行後

**新增內容**:
```javascript
/**
 * 防抖函式 - 效能最佳化工具
 * 在事件觸發後等待指定時間才執行，如果在等待期間再次觸發則重新計時
 *
 * @param {Function} fn - 要執行的函式
 * @param {number} delay - 延遲時間（毫秒）
 * @returns {Function} 防抖後的函式
 */
function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
        const context = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(context, args);
        }, delay);
    };
}
```

### 修改 2: 建立防抖版本的 renderHistoryList

**位置**: 第 451 行 renderHistoryList 函式定義之前

**新增內容**:
```javascript
// 建立防抖版本的渲染函式（300ms 延遲）
let debouncedRenderHistoryList;
```

### 修改 3: 在 DOMContentLoaded 中初始化防抖函式

**位置**: renderHistoryList 函式定義之後

**新增內容**:
```javascript
// 初始化防抖版本
debouncedRenderHistoryList = debounce(renderHistoryList, 300);
```

### 修改 4: 更新搜尋輸入事件監聽器

**位置**: 約第 353-356 行

**修改前**:
```javascript
historySearchInput.addEventListener('input', function(event) {
    historyUIState.searchQuery = event.target.value || '';
    renderHistoryList();
});
```

**修改後**:
```javascript
historySearchInput.addEventListener('input', function(event) {
    historyUIState.searchQuery = event.target.value || '';
    debouncedRenderHistoryList();
});
```

## 預期效果

- 使用者快速輸入時，只在停止輸入 300ms 後才觸發渲染
- 渲染次數減少 70-90%
- 輸入流暢度明顯提升

## 測試步驟

1. 開啟歷史記錄頁面
2. 在搜尋框中快速輸入 "test"（4 個字元）
3. 觀察主控台或效能監控
4. 預期：只觸發 1 次 renderHistoryList，而不是 4 次

## 回滾方案

如果出現問題，將修改 4 的程式碼改回原樣即可。
