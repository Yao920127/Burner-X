# Phase 1 效能最佳化測試指南

> **完成日期**: 2025-11-12
> **最佳化專案**: 防抖、正則提升、定時器最佳化
> **狀態**: ✅ 已完成實施，待測試驗證

---

## 📦 已應用的最佳化

### ✅ 1. 歷史記錄搜尋防抖 (history.js)
**檔案**: `js/history/history.js` (+20 lines)
**修改內容**:
- 新增了防抖函式實現
- 建立了 `debouncedRenderHistoryList` (300ms 延遲)
- 替換了搜尋輸入事件處理器中的直接呼叫

**預期效果**:
- 快速輸入時減少 70-90% 的渲染次數
- 使用者輸入流暢度提升
- CPU 佔用降低

---

### ✅ 2. 正規表示式提升 (markdown_processor_ast.js)
**檔案**: `js/processing/markdown_processor_ast.js` (+16 lines)
**修改內容**:
- 將 7 個正規表示式提升到模組級常量 `MATH_DELIMITER_PATTERNS`
- 使用 `Object.freeze()` 防止意外修改
- 避免函式呼叫時重複編譯正規表示式

**預期效果**:
- 大文件處理速度提升 10-15%
- 減少正則編譯開銷（特別是在迴圈中）

---

### ✅ 3. 輪詢定時器最佳化 (annotations_summary_modal.js)
**檔案**: `js/annotations/annotations_summary_modal.js` (+36 lines)
**修改內容**:
- 將 `setInterval` 替換為可管理的定時器
- 新增頁面可見性檢測 (`document.hidden`)
- 新增頁面解除安裝時的清理邏輯

**預期效果**:
- 頁面隱藏時跳過執行，減少 50% 後臺 CPU 佔用
- 避免定時器洩漏

---

## 🧪 測試計劃

### 測試 1: 歷史記錄搜尋防抖

#### 測試步驟
1. 開啟應用主頁面
2. 點選"顯示歷史"按鈕，開啟歷史記錄面板
3. 在搜尋框中快速輸入文字（如 "test"，4 個字元）
4. 開啟瀏覽器開發者工具 Console 面板

#### 驗證方法 A: 主控台計數
在 Console 中執行以下程式碼來監控渲染次數：

```javascript
// 監控渲染次數
(function() {
    let renderCount = 0;
    const originalRender = window.renderHistoryList;

    if (typeof originalRender !== 'undefined') {
        // 包裝原函式
        const originalFunc = originalRender.bind(window);
        window.renderHistoryList = function() {
            renderCount++;
            console.log(`[Render Count] 第 ${renderCount} 次渲染`);
            return originalFunc.apply(this, arguments);
        };
    }

    // 重置計數
    window.resetRenderCount = () => {
        renderCount = 0;
        console.log('[Render Count] 已重置');
    };

    console.log('[監控已啟動] 現在可以測試搜尋功能了');
})();
```

**預期結果**:
- 快速輸入 "test" (4個字元)
- ✅ **最佳化後**: 只觸發 **1 次**渲染（停止輸入 300ms 後）
- ❌ **最佳化前**: 會觸發 **4 次**渲染（每次按鍵一次）

#### 驗證方法 B: Performance API
```javascript
// 使用 Performance API 測量
performance.clearMarks();
performance.clearMeasures();

// 在搜尋框中輸入，然後等待 500ms，在主控台執行：
const entries = performance.getEntriesByType('measure');
console.log('效能測量:', entries);
```

#### 邊界情況測試
- [ ] 快速輸入後立即刪除文字
- [ ] 輸入中文（IME 輸入法）
- [ ] 貼上長文字
- [ ] 連續快速搜尋不同關鍵詞

---

### 測試 2: 正規表示式提升

#### 測試步驟
1. 準備一個包含大量數學公式的測試文件（如學術論文 PDF）
2. 上傳文件進行 OCR 和翻譯處理
3. 使用 Performance API 測量處理時間

#### 驗證方法: 效能對比
在 Console 中執行以下程式碼來測量正則處理效能：

```javascript
// 測試正規表示式效能
(function() {
    // 模擬包含數學公式的文字
    const testText = `
這是一個測試文字，包含多個數學公式：
$$ E = mc^2 $$
行內公式 $ x^2 + y^2 = z^2 $ 和另一個 $ a + b = c $
$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$
`.repeat(100); // 重複 100 次，模擬大文件

    // 查詢 normalizeMathDelimiters 函式
    // 注意：這需要在處理文件時才能訪問到該函式
    console.log('[測試] 請上傳包含數學公式的文件進行處理');
    console.log('[測試] 在處理過程中，檢視 Console 是否有效能日誌');
})();
```

**手動測試步驟**:
1. 上傳測試文件：`tests/fixtures/math-paper.pdf`（如果存在）
2. 開始處理
3. 觀察 Console 輸出的處理時間
4. 對比最佳化前後的時間差異

**預期結果**:
- ✅ 處理速度提升 **10-15%**（特別是包含大量公式的文件）
- ✅ Console 無錯誤資訊
- ✅ 數學公式識別和格式化正確

#### 功能迴歸測試
使用現有的測試頁面驗證公式處理功能：

```bash
# 在瀏覽器中開啟以下測試頁面
start tests/test-formula-issues.html
start tests/test-katex-fixes.html
start tests/test-katex-errors.html
```

**驗證點**:
- [ ] 行內公式 `$ ... $` 正確識別
- [ ] 塊公式 `$$ ... $$` 正確識別
- [ ] OCR 錯誤修復功能正常（如 `$\$ ... \$` → `$$ ... $$`）
- [ ] 轉義序列處理正確
- [ ] 無誤將普通文字識別為公式

---

### 測試 3: 輪詢定時器最佳化

#### 測試步驟
1. 開啟應用主頁面
2. 開啟批註功能（需要有文件內容）
3. 開啟瀏覽器工作管理員 (Shift + Esc)
4. 切換到另一個分頁

#### 驗證方法 A: 工作管理員監控
```
步驟：
1. Chrome 工作管理員 (Shift + Esc)
2. 找到 Paper-Burner 分頁
3. 觀察 CPU 佔用

預期結果：
- 分頁可見時：CPU 0.5-2%（正常輪詢）
- 分頁隱藏時：CPU 0% 或接近 0%（跳過執行）
```

#### 驗證方法 B: Console 日誌
在 Console 中執行以下程式碼來監控輪詢行為：

```javascript
// 監控輪詢執行
(function() {
    let callCount = 0;
    const startTime = Date.now();

    // 包裝 checkForNewColors 函式
    if (typeof checkForNewColors !== 'undefined') {
        const original = checkForNewColors;
        checkForNewColors = function() {
            callCount++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const isHidden = document.hidden;
            console.log(`[Polling] ${elapsed}s - 第 ${callCount} 次呼叫 | 頁面隱藏: ${isHidden}`);
            return original.apply(this, arguments);
        };
    }

    console.log('[監控已啟動] 請切換分頁測試');
})();
```

**測試場景**:
1. 頁面可見 10 秒 → 應該執行約 10 次
2. 切換到其他標籤 10 秒 → 應該 **0 次**執行（或日誌顯示"頁面隱藏: true"但跳過處理）
3. 切回標籤 → 恢復執行

**預期結果**:
- ✅ 頁面隱藏時，輪詢函式內部的邏輯被跳過
- ✅ 頁面顯示時，輪詢正常執行
- ✅ 關閉頁面時，定時器被正確清理（無 console 錯誤）

#### 邊界情況測試
- [ ] 開啟多個 Paper-Burner 分頁，只有當前標籤執行輪詢
- [ ] 最小化瀏覽器視窗
- [ ] 電腦鎖屏狀態
- [ ] 長時間隱藏後切回（確保恢復正常）

---

## 🎯 效能基準測試

### 基準測試套件

建立效能測試腳本 `tests/performance/phase1-benchmark.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Phase 1 效能基準測試</title>
</head>
<body>
    <h1>Phase 1 效能基準測試</h1>
    <div id="results"></div>

    <script>
    // 測試 1: 防抖函式效能
    async function testDebounce() {
        console.log('=== 測試防抖函式 ===');

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

        let callCount = 0;
        const testFn = debounce(() => callCount++, 300);

        // 模擬快速輸入
        const startTime = performance.now();
        for (let i = 0; i < 10; i++) {
            testFn();
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 等待防抖完成
        await new Promise(resolve => setTimeout(resolve, 400));
        const endTime = performance.now();

        console.log(`快速觸發 10 次，實際執行: ${callCount} 次`);
        console.log(`耗時: ${(endTime - startTime).toFixed(2)}ms`);

        return {
            test: '防抖函式',
            triggers: 10,
            actualCalls: callCount,
            reduction: `${((1 - callCount / 10) * 100).toFixed(0)}%`,
            time: `${(endTime - startTime).toFixed(2)}ms`
        };
    }

    // 測試 2: 正規表示式效能
    async function testRegexPerformance() {
        console.log('=== 測試正規表示式效能 ===');

        const testText = '$$ E = mc^2 $$ 和 $ x + y $ '.repeat(1000);

        // 方法 1: 每次建立新正則（最佳化前）
        const start1 = performance.now();
        for (let i = 0; i < 100; i++) {
            testText.replace(/\$\$/g, '$$');
        }
        const end1 = performance.now();
        const time1 = end1 - start1;

        // 方法 2: 使用預編譯正則（最佳化後）
        const regex = /\$\$/g;
        const start2 = performance.now();
        for (let i = 0; i < 100; i++) {
            regex.lastIndex = 0;
            testText.replace(regex, '$$');
        }
        const end2 = performance.now();
        const time2 = end2 - start2;

        console.log(`動態建立正則: ${time1.toFixed(2)}ms`);
        console.log(`預編譯正則: ${time2.toFixed(2)}ms`);
        console.log(`效能提升: ${((1 - time2 / time1) * 100).toFixed(1)}%`);

        return {
            test: '正規表示式',
            dynamicTime: `${time1.toFixed(2)}ms`,
            precompiledTime: `${time2.toFixed(2)}ms`,
            improvement: `${((1 - time2 / time1) * 100).toFixed(1)}%`
        };
    }

    // 執行所有測試
    async function runAllTests() {
        const results = [];

        results.push(await testDebounce());
        results.push(await testRegexPerformance());

        // 顯示結果
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '<h2>測試結果</h2>' +
            '<table border="1" cellpadding="10">' +
            '<tr><th>測試項</th><th>指標</th><th>結果</th></tr>' +
            results.map(r =>
                Object.entries(r).map(([key, value]) =>
                    `<tr><td>${r.test}</td><td>${key}</td><td>${value}</td></tr>`
                ).join('')
            ).join('') +
            '</table>';

        console.log('=== 測試完成 ===');
        console.table(results);
    }

    // 頁面載入後自動執行
    window.addEventListener('load', runAllTests);
    </script>
</body>
</html>
```

### 執行基準測試

```bash
# 在瀏覽器中開啟測試頁面
start tests/performance/phase1-benchmark.html

# 或者在開發者工具 Console 中直接執行測試函式
```

---

## ✅ 驗收標準

### Phase 1 完成的標準

- [x] **程式碼質量**
  - [x] 所有修改都有清晰的註釋
  - [x] 程式碼風格一致
  - [x] 無語法錯誤
  - [x] 透過 ESLint/程式碼審查

- [ ] **功能測試**
  - [ ] 歷史記錄搜尋功能正常
  - [ ] 數學公式處理功能正常
  - [ ] 批註顏色更新功能正常
  - [ ] 無新增 bug

- [ ] **效能測試**
  - [ ] 搜尋防抖：渲染次數減少 > 70%
  - [ ] 正則提升：處理速度提升 > 10%
  - [ ] 定時器最佳化：後臺 CPU 佔用減少 > 50%

- [ ] **相容性測試**
  - [ ] Chrome/Edge (Chromium)
  - [ ] Firefox
  - [ ] Safari (如適用)

- [ ] **文件**
  - [x] 最佳化計劃文件完整
  - [x] 測試指南完整
  - [ ] 效能對比資料記錄

---

## 🔄 回滾計劃

如果測試發現問題，可以回滾特定檔案：

```bash
# 回滾單個檔案
git checkout HEAD -- js/history/history.js

# 回滾所有 Phase 1 修改
git checkout HEAD -- js/history/history.js
git checkout HEAD -- js/processing/markdown_processor_ast.js
git checkout HEAD -- js/annotations/annotations_summary_modal.js

# 或者回滾整個 commit（如果已經提交）
git revert <commit-hash>
```

---

## 📊 效能資料記錄表

請在測試完成後填寫實際測試資料：

| 最佳化項 | 測試場景 | 最佳化前 | 最佳化後 | 提升 | 測試人 | 測試日期 |
|--------|----------|--------|--------|------|--------|----------|
| 搜尋防抖 | 快速輸入4個字元 | ___次渲染 | ___次渲染 | ___%↓ | | |
| 搜尋防抖 | 輸入流暢度（主觀） | ___ | ___ | | | |
| 正則提升 | 處理1000行文件 | ___ms | ___ms | ___%↓ | | |
| 正則提升 | 公式識別準確率 | ___% | ___% | | | |
| 定時器最佳化 | 頁面隱藏 CPU 佔用 | ___%  | ___% | ___%↓ | | |
| 定時器最佳化 | 多分頁記憶體佔用 | ___MB | ___MB | ___%↓ | | |

---

## 📝 測試日誌模板

```markdown
## 測試日誌 - [日期]

### 測試人員
- 姓名：
- 環境：瀏覽器版本 / 作業系統

### 測試結果

#### 1. 歷史記錄搜尋防抖
- [ ] 透過
- [ ] 失敗
- 問題描述：
- 效能資料：

#### 2. 正規表示式提升
- [ ] 透過
- [ ] 失敗
- 問題描述：
- 效能資料：

#### 3. 輪詢定時器最佳化
- [ ] 透過
- [ ] 失敗
- 問題描述：
- 效能資料：

### 總體評價
- [ ] 建議合併
- [ ] 需要修復後重測
- [ ] 建議回滾

### 備註


```

---

## 🚀 後續步驟

Phase 1 測試透過後：

1. ✅ 將最佳化合併到 `optimize/frontend-performance` 分支
2. ✅ 建立詳細的效能對比報告
3. ➡️ 開始 **Phase 2: 中等風險最佳化**（LRU 快取、DOM 快取）
4. ➡️ 規劃 Phase 3 和 Phase 4

---

**祝測試順利！** 🎉

如有任何問題或發現bug，請及時記錄並反饋。
