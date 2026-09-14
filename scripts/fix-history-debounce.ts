/**
 * 手動修復歷史記錄搜尋防抖最佳化
 */

const fs = require('fs');
const path = require('path');

const historyJsPath = path.join(__dirname, '../js/history/history.js');
let content = fs.readFileSync(historyJsPath, 'utf8');

// 檢查是否已經應用
if (content.includes('debouncedRenderHistoryList')) {
    console.log('✅ 防抖最佳化已存在');
    process.exit(0);
}

// 在 historySearchInput 定義後新增防抖函式
const lines = content.split('\n');
const newLines = [];
let inserted = false;

for (let i = 0; i < lines.length; i++) {
    newLines.push(lines[i]);

    // 在 "const historyFolderSelectMobile" 這行後插入
    if (!inserted && lines[i].includes('const historyFolderSelectMobile')) {
        newLines.push('');
        newLines.push('    // 效能最佳化：防抖函式（減少頻繁的渲染呼叫）');
        newLines.push('    function debounce(fn, delay) {');
        newLines.push('        let timer = null;');
        newLines.push('        return function debounced(...args) {');
        newLines.push('            const context = this;');
        newLines.push('            if (timer) clearTimeout(timer);');
        newLines.push('            timer = setTimeout(() => {');
        newLines.push('                timer = null;');
        newLines.push('                fn.apply(context, args);');
        newLines.push('            }, delay);');
        newLines.push('        };');
        newLines.push('    }');
        newLines.push('');
        newLines.push('    // 建立防抖版本的渲染函式（300ms 延遲）');
        newLines.push('    const debouncedRenderHistoryList = debounce(function() {');
        newLines.push('        renderHistoryList();');
        newLines.push('    }, 300);');
        inserted = true;
    }

    // 替換 renderHistoryList() 為 debouncedRenderHistoryList()
    if (inserted && lines[i].includes('historyUIState.searchQuery = event.target.value') && i + 1 < lines.length) {
        // 檢查下一行是否是 renderHistoryList();
        if (lines[i + 1].trim() === 'renderHistoryList();') {
            newLines.push(lines[i + 1].replace('renderHistoryList();', 'debouncedRenderHistoryList();  // 使用防抖版本，減少渲染次數'));
            i++; // 跳過下一行，因為我們已經處理了
        }
    }
}

const newContent = newLines.join('\n');
fs.writeFileSync(historyJsPath, newContent, 'utf8');

console.log('✅ 歷史記錄搜尋防抖最佳化已應用');
