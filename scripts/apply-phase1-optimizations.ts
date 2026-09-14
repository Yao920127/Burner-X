/**
 * Phase 1 效能最佳化自動應用腳本
 *
 * 使用方式: node scripts/apply-phase1-optimizations.js
 */

const fs = require('fs');
const path = require('path');

console.log('開始應用 Phase 1 效能最佳化...\n');

// ============================================
// 最佳化 1.2: 歷史記錄搜尋防抖
// ============================================
console.log('[1/3] 應用歷史記錄搜尋防抖最佳化...');

const historyJsPath = path.join(__dirname, '../js/history/history.js');
let historyContent = fs.readFileSync(historyJsPath, 'utf8');

// 檢查是否已經應用過
if (historyContent.includes('debouncedRenderHistoryList')) {
    console.log('  ⚠️  歷史記錄防抖最佳化已存在，跳過');
} else {
    // 在搜尋輸入事件監聽器前新增防抖函式
    const searchOld = `    const historySearchInput = document.getElementById('historySearchInput');
    const historyFolderSelectMobile = document.getElementById('historyFolderSelectMobile');
    if (historySearchInput) {
        historySearchInput.addEventListener('input', function(event) {
            historyUIState.searchQuery = event.target.value || '';
            renderHistoryList();
        });
    }`;

    const searchNew = `    const historySearchInput = document.getElementById('historySearchInput');
    const historyFolderSelectMobile = document.getElementById('historyFolderSelectMobile');

    // 效能最佳化：防抖函式（減少頻繁的渲染呼叫）
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

    // 建立防抖版本的渲染函式（300ms 延遲）
    const debouncedRenderHistoryList = debounce(function() {
        renderHistoryList();
    }, 300);

    if (historySearchInput) {
        historySearchInput.addEventListener('input', function(event) {
            historyUIState.searchQuery = event.target.value || '';
            debouncedRenderHistoryList();  // 使用防抖版本，減少渲染次數
        });
    }`;

    if (historyContent.includes(searchOld)) {
        historyContent = historyContent.replace(searchOld, searchNew);
        fs.writeFileSync(historyJsPath, historyContent, 'utf8');
        console.log('  ✅ 歷史記錄搜尋防抖最佳化已應用');
    } else {
        console.log('  ❌ 未找到預期的程式碼模式，請手動檢查');
    }
}

// ============================================
// 最佳化 1.3: 正規表示式提升
// ============================================
console.log('\n[2/3] 應用正規表示式提升最佳化...');

const markdownAstPath = path.join(__dirname, '../js/processing/markdown_processor_ast.js');
let markdownContent = fs.readFileSync(markdownAstPath, 'utf8');

// 檢查是否已經應用過
if (markdownContent.includes('MATH_DELIMITER_PATTERNS')) {
    console.log('  ⚠️  正規表示式提升最佳化已存在，跳過');
} else {
    // 在 normalizeMathDelimiters 函式前新增正則常量
    const regexOld = `function normalizeMathDelimiters(text) {`;
    const regexNew = `// 效能最佳化：提升正規表示式到模組級（避免重複編譯）
const MATH_DELIMITER_PATTERNS = Object.freeze({
    dollarWithComma: /\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$\s*，\s*\$/g,
    doubleDollar: /\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$\$/g,
    singleDollarEnd: /\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$/g,
    dollarSpaceDollar: /\$\s+\$/g,
    dollarDollarSpace: /\$\$\s+/g,
    spaceDollarDollar: /\s+\$\$/g,
    doubleDollarEOL: /\$\$\$/g
});

function normalizeMathDelimiters(text) {`;

    if (markdownContent.includes(regexOld)) {
        markdownContent = markdownContent.replace(regexOld, regexNew);

        // 替換函式內部的正則使用
        markdownContent = markdownContent.replace(
            /s = s\.replace\(\/\\\$\\\\\\\$\\s\*\(\[\\^\\\$\\n\]\{1,200\}\?\)\\s\*\\\\\\\$\\s\*，\\s\*\\\$\/g,/g,
            'MATH_DELIMITER_PATTERNS.dollarWithComma.lastIndex = 0;\n    s = s.replace(MATH_DELIMITER_PATTERNS.dollarWithComma,'
        );

        fs.writeFileSync(markdownAstPath, markdownContent, 'utf8');
        console.log('  ✅ 正規表示式提升最佳化已應用');
    } else {
        console.log('  ⚠️  未找到 normalizeMathDelimiters 函式，可能已經被重構');
    }
}

// ============================================
// 最佳化 1.4: 輪詢定時器最佳化
// ============================================
console.log('\n[3/3] 應用輪詢定時器最佳化...');

const annotationsPath = path.join(__dirname, '../js/annotations/annotations_summary_modal.js');

if (!fs.existsSync(annotationsPath)) {
    console.log('  ⚠️  annotations_summary_modal.js 不存在，跳過');
} else {
    let annotationsContent = fs.readFileSync(annotationsPath, 'utf8');

    if (annotationsContent.includes('ColorPollingManager')) {
        console.log('  ⚠️  輪詢定時器最佳化已存在，跳過');
    } else {
        // 查詢 setInterval(checkForNewColors
        if (annotationsContent.includes('setInterval(checkForNewColors')) {
            const pollerOld = `setInterval(checkForNewColors, 1000)`;
            const pollerNew = `// 效能最佳化：頁面隱藏時暫停輪詢
(function() {
    let timerId = null;
    let isActive = false;

    function poll() {
        if (!isActive) return;
        if (!document.hidden) {
            checkForNewColors();
        }
        timerId = setTimeout(poll, 1000);
    }

    function start() {
        if (isActive) return;
        isActive = true;
        poll();
    }

    function stop() {
        isActive = false;
        if (timerId) {
            clearTimeout(timerId);
            timerId = null;
        }
    }

    document.addEventListener('visibilitychange', () => {
        // 頁面隱藏/顯示時無需額外操作，poll 函式會自動跳過
    });

    window.addEventListener('beforeunload', stop);

    start();
})()`;

            annotationsContent = annotationsContent.replace(pollerOld, pollerNew);
            fs.writeFileSync(annotationsPath, annotationsContent, 'utf8');
            console.log('  ✅ 輪詢定時器最佳化已應用');
        } else {
            console.log('  ⚠️  未找到 setInterval(checkForNewColors)，可能已經被重構');
        }
    }
}

console.log('\n✅ Phase 1 效能最佳化應用完成！\n');
console.log('建議：');
console.log('1. 執行 git diff 檢視所有更改');
console.log('2. 在瀏覽器中測試所有修改功能');
console.log('3. 使用效能工具驗證最佳化效果');
console.log('4. 如有問題，使用 git checkout -- <file> 回滾特定檔案\n');
