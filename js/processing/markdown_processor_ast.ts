// js/processing/markdown_processor_ast.js
// AST-based Markdown processor using markdown-it
// 全新架構：基於抽象語法樹的 Markdown 處理器
(function MarkdownProcessorAST(global) {
    'use strict';

    // ========================================
    // 核心配置
    // ========================================
    const CONFIG = {
        version: '3.0.0-ast',
        cacheSize: 1000,
        debug: false
    };

    // 快取系統
    const renderCache = new Map();

    // Phase 3.5: 記錄已經警告過的圖片路徑，避免流式更新時重複警告
    const _warnedImages = new Set();

    // 效能指標
    const metrics = {
        cacheHits: 0,
        cacheMisses: 0,
        totalRenders: 0,
        formulaErrors: 0,
        formulaSuccesses: 0,
        tableFixCount: 0
    };

    // ========================================
    // Markdown-it 初始化
    // ========================================
    if (typeof markdownit === 'undefined') {
        console.error('[MarkdownProcessorAST] markdown-it not loaded!');
        return;
    }

    const md = markdownit({
        html: true,           // 允許 HTML 標籤
        breaks: false,        // 不自動轉換換行（避免破壞表格）
        linkify: false,       // 不自動轉換連結
        typographer: false    // 不進行印刷最佳化（避免干擾公式）
    });

    // ========================================
    // 工具函式
    // ========================================

    /**
     * HTML 轉義
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const htmlEscapes = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return text.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
    }

    /**
     * 檢測內容是否像段落（而非單個公式）
     */
    function looksLikeParagraph(text) {
        if (!text || typeof text !== 'string') return false;

        // 白名單：包含明顯的 LaTeX 命令，應該被識別為公式
        if (/\\(mathrm|mathbf|mathit|text|frac|sqrt|sum|int|limits|cdot|cdots|ldots|dots|times|div|pm|infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|mathbb|psi|rangle|langle|in)\b/.test(text)) {
            return false; // 不是段落，是公式
        }

        // 白名單：包含常見的 LaTeX 空格命令
        if (/\\[,;:!\s]/.test(text)) {
            return false; // 不是段落，是公式
        }

        // 白名單：包含數學符號（下標、上標、括號等），應該被識別為公式
        if (/[_^{}=+\-*/()]/.test(text)) {
            return false; // 包含數學符號，是公式
        }

        // 先移除 LaTeX 轉義序列（如 \; \, \! 等），避免誤判
        const cleanText = text.replace(/\\[,;:!]/g, '');

        // 包含句子標點
        if (/[。；;]/.test(cleanText)) return true;
        // 包含多個逗號（提高閾值到 10 個，因為數學公式中逗號很常見）
        if ((cleanText.match(/[，,]/g) || []).length > 10) return true;
        // 包含英文解釋性詞彙
        if (/\b(represents?|where|is|are|and|the|of)\b/i.test(text)) return true;
        return false;
    }

    /**
     * 記錄除錯資訊
     */
    function debug(...args) {
        if (CONFIG.debug) {
            console.log('[MarkdownProcessorAST]', ...args);
        }
    }

    // ========================================
    // 外掛 1: OCR 錯誤修復（Token 級別）
    // ========================================
    function ocrFixPlugin(md) {
        debug('Loading OCR fix plugin');

        // 在 inline 解析之前修覆文字
        md.core.ruler.before('inline', 'ocr_fix', function(state) {
            const tokens = state.tokens;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];

                // 只處理段落、表格單元格等文字容器
                if (token.type === 'inline' && token.content) {
                    token.content = normalizeMathDelimiters(token.content);
                }
            }
        });

        /**
         * 修復 OCR 錯誤的數學分隔符
         */
        function normalizeMathDelimiters(text) {
            if (typeof text !== 'string' || !text) return text;
            let s = text;

            // 基礎清理
            s = s.replace(/&(?:#0*36|dollar);/gi, '$');
            s = s.replace(/\uFF04/g, '$');
            s = s.replace(/\$[\u200B-\u200D\uFEFF\u0300-\u036F]+/g, '$');
            s = s.replace(/[\u200B-\u200D\uFEFF\u0300-\u036F]+\$/g, '$');

            // OCR 錯誤修復（帶防護）
            // 1. $\$ ... \$ ，$ → $$ ... $$ ，
            s = s.replace(/\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$\s*，\s*\$/g, (match, content) => {
                if (looksLikeParagraph(content)) return match;
                return `$$${content}$$ ，`;
            });

            // 2. $\$ ... \$$ → $$ ... $$
            s = s.replace(/\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$\$/g, (match, content) => {
                if (looksLikeParagraph(content)) return match;
                return `$$${content}$$`;
            });

            // 3. $\$ ... \$ → $$ ... $$
            s = s.replace(/\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$/g, (match, content) => {
                if (looksLikeParagraph(content)) return match;
                return `$$${content}$$`;
            });

            // 4. \$...\$ → $$...$$
            s = s.replace(/\\\$([^\$\n]+?)\\\$/g, '$$$$1$$');

            return s;
        }
    }

    // ========================================
    // 外掛 2: 表格修復（AST 級別）
    // ========================================
    function tableFixPlugin(md) {
        debug('Loading table fix plugin');

        md.core.ruler.after('inline', 'table_fix', function(state) {
            const tokens = state.tokens;
            let i = 0;

            while (i < tokens.length) {
                const token = tokens[i];

                // 找到表格開始
                if (token.type === 'table_open') {
                    const tableTokens = [];
                    let j = i;

                    // 收集整個表格的 tokens
                    while (j < tokens.length && tokens[j].type !== 'table_close') {
                        tableTokens.push(tokens[j]);
                        j++;
                    }
                    if (j < tokens.length) {
                        tableTokens.push(tokens[j]); // table_close
                    }

                    // 嘗試修復表格
                    const fixed = fixTableStructure(tableTokens);
                    if (fixed) {
                        // 替換原始 tokens
                        tokens.splice(i, j - i + 1, ...fixed);
                        metrics.tableFixCount++;
                        debug('Fixed table at token', i);
                    }

                    i = j + 1;
                } else {
                    i++;
                }
            }
        });

        /**
         * 修復表格結構
         * 主要處理：列數不一致、空單元格開頭的行（可能需要合併到上一行）
         */
        function fixTableStructure(tokens) {
            // 分析表格結構
            const rows = [];
            let currentRow = null;
            let columnCount = 0;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];

                if (token.type === 'tr_open') {
                    currentRow = { tokens: [token], cells: [] };
                } else if (token.type === 'tr_close') {
                    if (currentRow) {
                        currentRow.tokens.push(token);
                        rows.push(currentRow);

                        // 記錄最大列數（從標頭行）
                        if (rows.length === 1) {
                            columnCount = currentRow.cells.length;
                        }

                        currentRow = null;
                    }
                } else if (token.type === 'th_open' || token.type === 'td_open') {
                    const cell = { open: token, content: null, close: null };
                    if (currentRow) {
                        currentRow.cells.push(cell);
                        currentRow.tokens.push(token);
                    }
                } else if (token.type === 'inline') {
                    if (currentRow && currentRow.cells.length > 0) {
                        const lastCell = currentRow.cells[currentRow.cells.length - 1];
                        lastCell.content = token;
                        currentRow.tokens.push(token);
                    }
                } else if (token.type === 'th_close' || token.type === 'td_close') {
                    if (currentRow && currentRow.cells.length > 0) {
                        const lastCell = currentRow.cells[currentRow.cells.length - 1];
                        lastCell.close = token;
                        currentRow.tokens.push(token);
                    }
                } else {
                    if (currentRow) {
                        currentRow.tokens.push(token);
                    }
                }
            }

            // 檢測並修復問題行
            let needsFix = false;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const prevRow = rows[i - 1];

                // 情況1：當前行列數不足，且第一個單元格為空
                if (row.cells.length < columnCount &&
                    row.cells[0].content &&
                    !row.cells[0].content.content.trim()) {

                    needsFix = true;
                    debug('Table row', i, 'needs merge (empty first cell)');
                }

                // 情況2：當前行以括號開頭（可能是統計量）
                if (row.cells.length > 0 &&
                    row.cells[0].content &&
                    /^\s*\(/.test(row.cells[0].content.content)) {

                    needsFix = true;
                    debug('Table row', i, 'needs merge (starts with parenthesis)');
                }
            }

            // 如果不需要修復，返回 null
            if (!needsFix) {
                return null;
            }

            // TODO: 實際合併邏輯（複雜，暫時返回原始 tokens）
            // 這裡可以進一步實現行合併、單元格填充等
            debug('Table fix logic not yet implemented, returning original');
            return null;
        }
    }

    // ========================================
    // 外掛 3: 公式處理（替換為 KaTeX 渲染）
    // ========================================
    function mathPlugin(md) {
        debug('Loading math plugin');

        // 處理行內公式 $...$ 和 $$...$$
        md.inline.ruler.before('escape', 'math_inline', function(state, silent) {
            const start = state.pos;
            const max = state.posMax;

            // 必須以 $ 開頭
            if (state.src.charCodeAt(start) !== 0x24 /* $ */) {
                return false;
            }

            // 檢測是否是 $$（塊級公式在行內）
            const isDouble = (start + 1 < max && state.src.charCodeAt(start + 1) === 0x24);
            const searchStart = isDouble ? start + 2 : start + 1;
            const endMarker = isDouble ? '$$' : '$';

            // 尋找結束標記
            let pos = searchStart;
            let foundEnd = false;
            while (pos < max) {
                const char = state.src.charCodeAt(pos);

                // 遇到換行字元，停止搜尋（行內公式不應跨行）
                if (char === 0x0A /* \n */) {
                    break;
                }

                // 遇到反斜槓，跳過反斜槓和後面的字元
                if (char === 0x5C /* \ */) {
                    pos += 2;
                    continue;
                }

                // 找到 $
                if (char === 0x24 /* $ */) {
                    if (isDouble) {
                        // 需要確認是 $$
                        if (pos + 1 < max && state.src.charCodeAt(pos + 1) === 0x24) {
                            foundEnd = true;
                            break; // 找到 $$
                        }
                    } else {
                        foundEnd = true;
                        break; // 找到 $
                    }
                }

                pos++;
            }

            if (!foundEnd) {
                return false; // 沒有找到閉合標記
            }

            const content = state.src.slice(searchStart, pos);

            // 內容不能為空
            if (!content || !content.trim()) {
                return false;
            }

            // 快速檢查：跳過純中文（但允許單個漢字數學公式）
            if (content.length > 1 && /^[\u4e00-\u9fa5，、。；：！？""''（）【】《》\s]+$/.test(content)) {
                return false;
            }

            // 檢查是否像段落（只對單 $ 檢查，且長度超過3個字元）
            if (!isDouble && content.length > 3 && looksLikeParagraph(content)) {
                return false;
            }

            if (!silent) {
                // 在段落中的 $$...$$ 也使用 inline mode（不獨立成行）
                const token = state.push('math_inline', 'math', 0);
                token.content = content.trim();
                token.markup = endMarker;
                token.block = false; // 行內元素統一使用 inline mode
            }

            state.pos = pos + (isDouble ? 2 : 1);
            return true;
        });

        // 處理塊級公式 $$...$$
        md.block.ruler.before('fence', 'math_block', function(state, startLine, endLine, silent) {
            let pos = state.bMarks[startLine] + state.tShift[startLine];
            let max = state.eMarks[startLine];

            // 檢查是否以 $$ 開頭
            if (pos + 2 > max) return false;
            if (state.src.charCodeAt(pos) !== 0x24 || state.src.charCodeAt(pos + 1) !== 0x24) {
                return false;
            }

            pos += 2;
            let firstLine = state.src.slice(pos, max);

            // 單行塊公式: $$...$$ 在同一行
            if (firstLine.trim().slice(-2) === '$$') {
                firstLine = firstLine.trim().slice(0, -2);
                if (!silent) {
                    const token = state.push('math_block', 'math', 0);
                    token.content = firstLine;
                    token.markup = '$$';
                    token.block = true;
                    token.map = [startLine, startLine + 1];
                }
                state.line = startLine + 1;
                return true;
            }

            // 多行塊公式
            let nextLine = startLine;
            let lastLine;
            let lastPos;

            while (nextLine < endLine) {
                nextLine++;
                if (nextLine >= endLine) break;

                pos = state.bMarks[nextLine] + state.tShift[nextLine];
                max = state.eMarks[nextLine];

                if (pos < max && state.sCount[nextLine] < state.blkIndent) {
                    break;
                }

                // 檢查是否以 $$ 結尾
                if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
                    lastPos = state.src.slice(0, max).lastIndexOf('$$');
                    lastLine = state.src.slice(pos, lastPos);
                    break;
                }
            }

            if (!lastPos && lastPos !== 0) {
                return false;
            }

            if (!silent) {
                const oldParent = state.parentType;
                const oldLineMax = state.lineMax;
                state.parentType = 'math';

                const content = state.getLines(startLine + 1, nextLine, state.tShift[startLine], true);
                const token = state.push('math_block', 'math', 0);
                token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '') + content;
                token.markup = '$$';
                token.block = true;
                token.map = [startLine, nextLine + 1];

                state.parentType = oldParent;
                state.lineMax = oldLineMax;
            }

            state.line = nextLine + 1;
            return true;
        });

        // 渲染規則
        md.renderer.rules.math_inline = function(tokens, idx) {
            const content = tokens[idx].content;
            try {
                const rendered = katex.renderToString(content, {
                    displayMode: false,
                    throwOnError: true,
                    strict: 'ignore'
                });
                metrics.formulaSuccesses++;
                return `<span class="katex-inline">${rendered}</span>`;
            } catch (error) {
                metrics.formulaErrors++;
                console.warn('[MarkdownProcessorAST] KaTeX inline error:', error.message);
                return `<span class="katex-fallback katex-inline" title="${escapeHtml(error.message)}"><code>${escapeHtml(content)}</code></span>`;
            }
        };

        md.renderer.rules.math_block = function(tokens, idx) {
            const content = tokens[idx].content;
            try {
                const rendered = katex.renderToString(content, {
                    displayMode: true,
                    throwOnError: true,
                    strict: 'ignore'
                });
                metrics.formulaSuccesses++;
                return `<div class="katex-block">${rendered}</div>\n`;
            } catch (error) {
                metrics.formulaErrors++;
                console.warn('[MarkdownProcessorAST] KaTeX block error:', error.message);
                return `<div class="katex-fallback katex-block" title="${escapeHtml(error.message)}"><pre>${escapeHtml(content)}</pre></div>\n`;
            }
        };
    }

    // ========================================
    // 註冊外掛
    // ========================================
    md.use(ocrFixPlugin);
    md.use(tableFixPlugin);
    md.use(mathPlugin);

    // ========================================
    // 主渲染函式
    // ========================================

    /**
     * 預處理 Markdown（圖片替換等）
     */
    function preprocessMarkdown(mdText, images) {
        if (!mdText || typeof mdText !== 'string') {
            return '';
        }

        // 修復壓縮的單行表格（所有內容在一行）
        mdText = fixCompressedTables(mdText);

        // 修復表格列數不比對問題
        mdText = fixTableColumnMismatch(mdText);

        // 構建圖片對映
        const imgMap = new Map();
        if (Array.isArray(images)) {
            images.forEach((img, idx) => {
                if (!img || !img.data) return;

                const keys = new Set();
                if (img.name) keys.add(img.name);
                if (img.id) keys.add(img.id);
                keys.add(`img-${idx}.jpeg.png`);
                keys.add(`img-${idx + 1}.jpeg.png`);

                [...keys].forEach(k => keys.add('images/' + k));

                const src = img.data.startsWith('data:') ? img.data : `data:image/png;base64,${img.data}`;
                keys.forEach(k => imgMap.set(k, src));
            });
        }

        // 替換圖片路徑
        mdText = mdText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, path) => {
            const p = String(path).trim();
            if (/^(https?:|data:|\/\/)/i.test(p)) {
                return match;
            }

            const clean = p.split('?')[0].split('#')[0];
            const candidates = [
                clean,
                clean.replace(/^images\//, ''),
                clean.replace(/\.png$/i, ''),
                clean.replace(/^images\//, '').replace(/\.png$/i, ''),
                'images/' + clean,
                clean.split('/').pop(),
                'images/' + clean.split('/').pop()
            ];

            for (const key of candidates) {
                if (imgMap.has(key)) {
                    return `![${alt || ''}](${imgMap.get(key)})`;
                }
            }

            // Phase 3.5: 只警告一次，避免流式更新時重複輸出
            if (!_warnedImages.has(path)) {
                console.warn('[MarkdownProcessorAST] Image not found:', path);
                _warnedImages.add(path);
            }
            return match;
        });

        return mdText;
    }

    /**
     * 修復壓縮的單行表格
     * 將 "| a | b | |---|---| | c | d |" 轉換為多行格式
     */
    function fixCompressedTables(text) {
        if (!text || !text.includes('|')) return text;

        // 檢測表格分隔符行的模式：|---|---|... 或 |:---|---:| 等
        const separatorPattern = /\|(:?-+:?\|)+/;

        return text.split('\n').map(line => {
            // 只處理包含分隔符的行
            if (!separatorPattern.test(line)) {
                return line;
            }

            // 統計管道符數量，判斷是否可能是壓縮表格
            const pipeCount = (line.match(/\|/g) || []).length;
            if (pipeCount < 10) return line; // 至少需要多行表格的管道符數量

            // 嘗試分割表格
            try {
                const fixed = splitCompressedTable(line);
                if (fixed !== line) {
                    metrics.tableFixCount++;
                    console.log('[MarkdownProcessorAST] 修復壓縮表格，管道符:', pipeCount);
                }
                return fixed;
            } catch (err) {
                console.warn('[MarkdownProcessorAST] 表格修復失敗:', err.message);
                return line;
            }
        }).join('\n');
    }

    /**
     * 分割壓縮表格為多行
     */
    function splitCompressedTable(line) {
        // 找到分隔符行：|---|---|---|...
        const separatorMatch = line.match(/\|(:?-+:?\|)+/);
        if (!separatorMatch) return line;

        const separatorIndex = separatorMatch.index;
        const separator = separatorMatch[0];

        // 計算列數：分隔符中的 | 數量 - 1
        // 例如：|---|---|---| 有 4 個 |，對應 3 列
        const columnCount = (separator.match(/\|/g) || []).length - 1;
        if (columnCount < 2) return line; // 至少2列

        // 每行需要的管道符數量 = 列數 + 1
        const pipesPerRow = columnCount + 1;

        // 提取表頭（分隔符之前）
        // 注意：分隔符比對包含開頭的 |，所以需要把它補回表頭
        let beforeSeparator = line.substring(0, separatorIndex);
        if (line[separatorIndex] === '|') {
            beforeSeparator += '|'; // 補回被分隔符比對吃掉的 |
        }
        beforeSeparator = beforeSeparator.trim();

        const headerPipes = (beforeSeparator.match(/\|/g) || []).length;
        console.log('[MarkdownProcessorAST] 表頭管道符:', headerPipes, '/', pipesPerRow);

        let headerRow;
        const headerResult = extractRow(beforeSeparator, pipesPerRow);
        if (headerResult) {
            headerRow = headerResult.row;
            console.log('[MarkdownProcessorAST] ✓ 表頭提取成功');
        } else if (headerPipes === pipesPerRow - 1) {
            // 如果只差1個管道符，新增結尾的 |
            headerRow = beforeSeparator + ' |';
            console.log('[MarkdownProcessorAST] 修復表頭：新增缺失的結尾 |');
        } else {
            console.warn('[MarkdownProcessorAST] 表頭提取失敗，管道符:', headerPipes, '需要:', pipesPerRow);
            return line;
        }

        // 提取資料行（分隔符之後）
        const afterSeparator = line.substring(separatorIndex + separator.length);
        const dataRows = extractAllRows(afterSeparator, pipesPerRow);

        if (dataRows.length === 0) {
            console.warn('[MarkdownProcessorAST] 未提取到資料行');
            return line;
        }

        // 構建多行表格
        const result = [
            headerRow,
            separator,
            ...dataRows
        ].join('\n');

        console.log('[MarkdownProcessorAST] 壓縮表格分割:', {
            原始長度: line.length,
            列數: columnCount,
            表頭: headerRow.substring(0, 50) + '...',
            資料行數: dataRows.length
        });

        return result;
    }

    /**
     * 從文字開頭提取一行表格（包含指定數量的管道符）
     * @returns {Object} { row: 提取的行（trim後）, endIndex: 原始結束位置 }
     */
    function extractRow(text, pipesNeeded) {
        if (!text || !text.includes('|')) return null;

        // 找到所需數量的管道符
        let pipeCount = 0;
        let endIndex = -1;

        for (let i = 0; i < text.length; i++) {
            if (text[i] === '|') {
                pipeCount++;
                if (pipeCount === pipesNeeded) {
                    endIndex = i + 1;
                    break;
                }
            }
        }

        if (endIndex === -1) return null;

        return {
            row: text.substring(0, endIndex).trim(),
            endIndex: endIndex
        };
    }

    /**
     * 修復表格列數不比對問題
     * 確保表頭、分隔符和資料行的列數一致
     */
    function fixTableColumnMismatch(text) {
        if (!text || !text.includes('|')) return text;

        const lines = text.split('\n');
        const fixedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.includes('|')) {
                fixedLines.push(lines[i]);
                continue;
            }

            // 檢測是否為表格分隔符行
            const isSeparator = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)+\|?$/.test(line);

            if (isSeparator && i > 0) {
                // 這是分隔符行，檢查與上一行（表頭）的列數
                const prevLine = fixedLines[fixedLines.length - 1];
                if (prevLine && prevLine.includes('|')) {
                    const prevPipes = (prevLine.match(/\|/g) || []).length;
                    const currPipes = (line.match(/\|/g) || []).length;

                    if (prevPipes !== currPipes) {
                        console.log(`[MarkdownProcessorAST] 檢測到列數不比對：表頭 ${prevPipes} 列，分隔符 ${currPipes} 列`);

                        // 修復策略：調整分隔符以比對表頭
                        if (prevPipes < currPipes) {
                            // 表頭列數少，分隔符列數多 → 刪除分隔符的多餘列
                            const sepParts = line.split('|').filter(part => part.trim() !== '' || part === '');
                            while (sepParts.length > prevPipes) {
                                sepParts.pop();
                            }
                            // 確保開頭和結尾有 |
                            const fixedSep = '|' + sepParts.slice(1).join('|');
                            console.log(`[MarkdownProcessorAST] 修復分隔符：從 ${currPipes} 列減少到 ${prevPipes} 列`);
                            fixedLines.push(fixedSep);
                            continue;
                        } else {
                            // 表頭列數多，分隔符列數少 → 給分隔符新增列
                            let fixedSep = line;
                            let iterationCount = 0;
                            const maxIterations = 100; // 防止死迴圈
                            while ((fixedSep.match(/\|/g) || []).length < prevPipes && iterationCount < maxIterations) {
                                // 在結尾 | 之前新增 ---
                                if (fixedSep.endsWith('|')) {
                                    fixedSep = fixedSep.slice(0, -1) + '---|';
                                } else {
                                    fixedSep += '---|';
                                }
                                iterationCount++;
                            }
                            if (iterationCount >= maxIterations) {
                                console.warn(`[MarkdownProcessorAST] 修復分隔符時達到最大迭代次數，跳過該行`);
                                fixedLines.push(line); // 使用原始行
                            } else {
                                console.log(`[MarkdownProcessorAST] 修復分隔符：從 ${currPipes} 列增加到 ${prevPipes} 列`);
                                fixedLines.push(fixedSep);
                            }
                            continue;
                        }
                    }
                }
            }

            // 如果是表格資料行，檢查與分隔符的列數
            if (i >= 2 && lines[i-1] && /^\|[\s:]*-+/.test(lines[i-1])) {
                const separatorLine = fixedLines[fixedLines.length - 1];
                const sepPipes = (separatorLine.match(/\|/g) || []).length;
                const currPipes = (line.match(/\|/g) || []).length;

                if (currPipes !== sepPipes) {
                    console.log(`[MarkdownProcessorAST] 資料行列數不比對：${currPipes} vs ${sepPipes}`);

                    // 調整資料行以比對分隔符
                    if (currPipes < sepPipes) {
                        // 資料行列數少 → 新增空單元格
                        let fixedLine = line;
                        let iterationCount = 0;
                        const maxIterations = 100; // 防止死迴圈
                        while ((fixedLine.match(/\|/g) || []).length < sepPipes && iterationCount < maxIterations) {
                            // 直接在末尾新增空單元格（無論末尾是否有 |）
                            if (!fixedLine.endsWith('|')) {
                                fixedLine += '|';
                            }
                            fixedLine += ' |';
                            iterationCount++;
                        }
                        if (iterationCount >= maxIterations) {
                            console.warn(`[MarkdownProcessorAST] 修復資料行時達到最大迭代次數，跳過該行`);
                            fixedLines.push(line); // 使用原始行
                        } else {
                            fixedLines.push(fixedLine);
                        }
                        continue;
                    } else if (currPipes > sepPipes) {
                        // 資料行列數多 → 截斷多餘的列
                        const parts = line.split('|');
                        // 保留前 sepPipes+1 個部分（因為第一個部分通常是空的）
                        const truncatedParts = parts.slice(0, sepPipes + 1);
                        let fixedLine = truncatedParts.join('|');
                        // 確保結尾有 |
                        if (!fixedLine.endsWith('|')) {
                            fixedLine += '|';
                        }
                        console.log(`[MarkdownProcessorAST] 截斷資料行：從 ${currPipes} 列減少到 ${sepPipes} 列`);
                        fixedLines.push(fixedLine);
                        continue;
                    }
                }
            }

            fixedLines.push(lines[i]);
        }

        return fixedLines.join('\n');
    }

    /**
     * 從文字中提取所有表格行
     * 按照固定的管道符數量提取每一行
     */
    function extractAllRows(text, pipesPerRow) {
        const rows = [];
        let remaining = text.trim();
        let iterationCount = 0;
        const maxIterations = 10000; // 防止死迴圈（大文件可能有很多行）

        while (remaining.length > 0 && iterationCount < maxIterations) {
            iterationCount++;
            const previousLength = remaining.length;

            // 跳過開頭的空白和單個 |
            remaining = remaining.trimStart();
            if (remaining.startsWith('|')) {
                remaining = remaining.substring(1).trimStart();
            }

            if (remaining.length === 0) break;

            // 提取一行（找到 pipesPerRow 個管道符）
            const result = extractRow(remaining, pipesPerRow);
            if (!result) {
                // 如果提取失敗，嘗試查詢下一個 | | 分隔符
                const nextSep = remaining.indexOf(' | |');
                if (nextSep > 0) {
                    console.warn('[MarkdownProcessorAST] 跳過無效資料:', remaining.substring(0, Math.min(50, nextSep)));
                    remaining = remaining.substring(nextSep + 3);
                    continue;
                }
                break;
            }

            rows.push('|' + result.row);

            // 移動到下一行
            remaining = remaining.substring(result.endIndex).trim();

            // 檢測是否有進展（防止死迴圈）
            if (remaining.length >= previousLength) {
                console.error('[MarkdownProcessorAST] extractAllRows 檢測到無進展，退出迴圈');
                break;
            }

            // 防止無限迴圈
            if (rows.length > 100) {
                console.warn('[MarkdownProcessorAST] 表格行數超過限制，停止提取');
                break;
            }
        }

        console.log('[MarkdownProcessorAST] 提取到', rows.length, '行資料');
        return rows;
    }

    /**
     * 主渲染函式（帶快取）
     * @param {string} mdText - Markdown 文字
     * @param {Array} images - 圖片陣列
     * @param {Array} annotations - 註釋陣列（可選）
     * @param {string} contentIdentifier - 內容識別符號（可選）
     */
    function render(mdText, images, annotations, contentIdentifier) {
        metrics.totalRenders++;

        const cacheKey = `${CONFIG.version}:${mdText}:${annotations ? annotations.length : 0}`;

        // 檢查快取
        if (renderCache.has(cacheKey)) {
            metrics.cacheHits++;
            return renderCache.get(cacheKey);
        }

        metrics.cacheMisses++;

        try {
            // 預處理
            const processed = preprocessMarkdown(mdText, images);

            // 如果有註釋，動態註冊註釋外掛
            let mdInstance = md;
            if (annotations && annotations.length > 0 && global.createAnnotationPluginAST) {
                // 建立臨時的 markdown-it 例項（避免汙染全域例項）
                mdInstance = markdownit({
                    html: true,
                    breaks: false,
                    linkify: false,
                    typographer: false
                });

                // 註冊所有外掛
                mdInstance.use(ocrFixPlugin);
                mdInstance.use(tableFixPlugin);
                mdInstance.use(mathPlugin);

                // 註冊註釋外掛
                const annotationPlugin = global.createAnnotationPluginAST(annotations, {
                    contentIdentifier: contentIdentifier || 'default',
                    debug: CONFIG.debug
                });
                mdInstance.use(annotationPlugin);

                debug('Rendering with', annotations.length, 'annotations');
            }

            // AST 渲染
            const result = mdInstance.render(processed);

            // 快取結果（注意：帶註釋的渲染不應快取太久）
            if (!annotations || annotations.length === 0) {
                if (renderCache.size >= CONFIG.cacheSize) {
                    const firstKey = renderCache.keys().next().value;
                    renderCache.delete(firstKey);
                }
                renderCache.set(cacheKey, result);
            }

            return result;
        } catch (error) {
            console.error('[MarkdownProcessorAST] Render error:', error);
            return `<div class="markdown-error">渲染失敗: ${escapeHtml(error.message)}</div>`;
        }
    }

    // ========================================
    // 向後相容層
    // ========================================

    /**
     * 相容舊版 API: safeMarkdown
     */
    function safeMarkdown(md, images) {
        return preprocessMarkdown(md, images);
    }

    /**
     * 相容舊版 API: renderWithKatexFailback
     */
    function renderWithKatexFailback(md, customRenderer) {
        // customRenderer 在新架構中暫不支援
        // 只在 debug 模式下顯示警告
        if (customRenderer && CONFIG.debug) {
            console.warn('[MarkdownProcessorAST] Custom renderer not supported in AST mode');
        }
        return render(md, null);
    }

    /**
     * 新 API: 支援註釋的渲染
     * @param {string} md - Markdown 文字
     * @param {Array} images - 圖片陣列
     * @param {Array} annotations - 註釋陣列 [{text, id, ...}, ...]
     * @param {string} contentIdentifier - 內容識別符號
     */
    function renderWithAnnotations(md, images, annotations, contentIdentifier) {
        return render(md, images, annotations, contentIdentifier);
    }

    // ========================================
    // 管理函式
    // ========================================

    function getMetrics() {
        return {
            ...metrics,
            cacheSize: renderCache.size,
            cacheHitRate: metrics.totalRenders > 0 ?
                (metrics.cacheHits / metrics.totalRenders * 100).toFixed(2) + '%' : '0%',
            formulaErrorRate: (metrics.formulaErrors + metrics.formulaSuccesses) > 0 ?
                (metrics.formulaErrors / (metrics.formulaErrors + metrics.formulaSuccesses) * 100).toFixed(2) + '%' : '0%'
        };
    }

    function clearCache() {
        renderCache.clear();
        Object.keys(metrics).forEach(key => {
            if (typeof metrics[key] === 'number') {
                metrics[key] = 0;
            }
        });
        debug('Cache cleared');
    }

    function setDebug(enabled) {
        CONFIG.debug = !!enabled;
        debug('Debug mode', enabled ? 'enabled' : 'disabled');
    }

    // ========================================
    // 匯出 API
    // ========================================

    global.MarkdownProcessorAST = {
        // 核心函式
        render: render,
        safeMarkdown: safeMarkdown,
        renderWithKatexFailback: renderWithKatexFailback,
        renderWithAnnotations: renderWithAnnotations,  // 新增：支援註釋

        // 管理函式
        getMetrics: getMetrics,
        clearCache: clearCache,
        setDebug: setDebug,

        // 配置
        config: CONFIG,

        // 版本資訊
        version: CONFIG.version,
        compatibility: 'Backward compatible with MarkdownProcessor & MarkdownProcessorEnhanced'
    };

    // 向後相容：全域啟用新架構
    global.MarkdownProcessor = global.MarkdownProcessorAST;
    global.MarkdownProcessorEnhanced = global.MarkdownProcessorAST;

    console.log('%c[MarkdownProcessorAST] ✅ AST 架構已啟用', 'color: #10b981; font-weight: bold', CONFIG.version);
    debug('MarkdownProcessorAST initialized', CONFIG.version);

})(window);
