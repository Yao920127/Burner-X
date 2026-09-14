// js/sub_block_segmenter.js
(function SubBlockSegmenter(global) {
    /**
     * 將塊級元素內容按標點分割成子塊 (span.sub-block)。
     * @param {HTMLElement} blockElement - 要分割的塊級元素 (如 p, h1-h6)。
     * @param {string|number} parentBlockIndex - 父塊的索引。
     */
    function segmentBlockIntoSubBlocks(blockElement, parentBlockIndex, force = false) {
        // 效能埋點：分塊開始
        performance.mark('subBlock-start');
        // 除錯開關：本檔案的檢測/一致性類日誌統一受控
        const __SUBBLOCK_DEBUG__ = (function(){
            try {
                return !!(window && (window.ENABLE_SUBBLOCK_DEBUG || localStorage.getItem('ENABLE_SUBBLOCK_DEBUG') === 'true'));
            } catch { return false; }
        })();

        // ===== 新增：分割前檢測 =====
        const preSubBlocks = Array.from(blockElement.querySelectorAll('.sub-block'));
        if (__SUBBLOCK_DEBUG__ && preSubBlocks.length > 0) {
            console.warn(`[SubBlockSegmenter][檢測] 分割前已存在 ${preSubBlocks.length} 個 .sub-block，內容摘要：`, preSubBlocks.map(sb => (sb.textContent || '').substring(0, 30)));
        }
        const preTextContent = blockElement.textContent;

        // ===== 新增：詳細日誌 =====
        // console.log(`[SubBlockSegmenter] 開始分塊 #${parentBlockIndex}, 元素型別: ${blockElement.tagName}, 內容前20字元: "${(blockElement.textContent || '').substring(0, 20)}..."`);

        // 檢查是否已經有子塊，如果有則記錄它們
        const existingSubBlocks = blockElement.querySelectorAll('.sub-block');
        if (existingSubBlocks.length > 0) {
            // console.log(`[SubBlockSegmenter] 警告: 塊 #${parentBlockIndex} 已有 ${existingSubBlocks.length} 個子塊，這些將被重新生成`);
            // console.log(`[SubBlockSegmenter] 現有子塊ID列表:`, Array.from(existingSubBlocks).map(sb => sb.dataset.subBlockId));
        }

        // 最佳化：只有當文字足夠長且包含中文或英文句讀符號才進行分塊
        const rawText = (blockElement.textContent || '').trim();
        const containsCnPeriod = rawText.indexOf('。') !== -1;
        const containsEnPunct = /[\.!?;:]/.test(rawText);
        // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 文字長度: ${rawText.length}, CN句號: ${containsCnPeriod}, EN標點: ${containsEnPunct}`);

        // ===== 新增：公式感知檢測 =====
        const hasFormula = checkForFormulas(blockElement, rawText);
        if (__SUBBLOCK_DEBUG__ && hasFormula) {
            console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 包含數學公式，啟用公式感知分割`);
        }

        // 修改分割條件：包含公式的塊使用不同的分割策略
        // 僅當文字很短且也不含中英文句讀時才跳過；
        // 只要存在句讀符，即使很短也執行分塊以支援精確醒目提示。
        if (!force && !hasFormula && (rawText.length < 80 && (!containsCnPeriod && !containsEnPunct))) {
            // 跳過分割
            // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 不滿足分塊條件，跳過分塊`);
            performance.mark('subBlock-end');
            performance.measure('subBlockSegmentSkipping', 'subBlock-start', 'subBlock-end');
            return;
        }

        // 如果塊元素本身是表格，或者其內部有表格，則不進行分割處理
        if (blockElement.tagName === 'TABLE' || blockElement.querySelector('table')) {
            // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 是表格或包含表格，跳過分塊`);
            return; // 直接返回，不修改表格內容
        }

        // ===== 新增：檢測 Markdown 表格語法 =====
        // 檢測表格分隔符行：|---|---|... 或 |:---|---:| 等
        const hasMarkdownTableSeparator = /\|(:?-+:?\|)+/.test(rawText);
        if (hasMarkdownTableSeparator) {
            console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 包含 Markdown 表格語法，跳過分塊以保持表格完整性`);
            return; // 直接返回，不分割 Markdown 表格
        }

        // ===== 新增：公式感知分割處理 =====
        if (hasFormula) {
            return segmentFormulaAwareBlock(blockElement, parentBlockIndex, rawText, __SUBBLOCK_DEBUG__);
        }

        // ===== 新增：儲存原始內容，用於對比 =====
        const originalContent = blockElement.innerHTML;
        const originalTextContent = blockElement.textContent;

        let subBlockTrueCounter = 0; // Counter for non-empty sub-blocks
        const newChildNodesContainer = document.createDocumentFragment();
        let firstGeneratedSubBlockElement = null; // Store the first (potentially only) sub-block

        // Define delimiters: Chinese period or common English sentence punctuation
        // The regex captures the delimiter itself and any trailing whitespace.
        const delimiterRegex = /([。\.!?;:])(\s*)/g;

        let currentSpanContentNodes = []; // Nodes for the current sub-block being built

        function flushCurrentSpan(isEndOfBlock = false) {
            if (currentSpanContentNodes.length > 0) {
                const tempSpan = document.createElement('span'); // Temporary span to check if it's empty
                currentSpanContentNodes.forEach(n => tempSpan.appendChild(n.cloneNode(true))); // Use cloned nodes for check

                if (tempSpan.textContent.trim() !== "" || (isEndOfBlock && tempSpan.innerHTML.trim() !== "")) { // Ensure span is not just whitespace or empty HTML
                    const span = document.createElement('span');
                    span.className = 'sub-block';
                    const subBlockId = `${parentBlockIndex}.${subBlockTrueCounter}`;
                    span.dataset.subBlockId = subBlockId; // Corrected template literal

                    // ===== 新增：記錄子塊內容 =====
                    const subBlockContent = tempSpan.textContent;
                    // console.log(`[SubBlockSegmenter] 建立子塊 #${subBlockId}, 內容前20字元: "${subBlockContent.substring(0, 20)}..."`);

                    currentSpanContentNodes.forEach(n => span.appendChild(n)); // Append original nodes
                    newChildNodesContainer.appendChild(span);

                    if (subBlockTrueCounter === 0) { // If this is the first non-empty sub-block
                        firstGeneratedSubBlockElement = span;
                    } else { // If we've already found one and now found another, it's not the only one
                        firstGeneratedSubBlockElement = null; // Invalidate, as there are multiple
                    }
                    subBlockTrueCounter++;
                } else {
                    // console.log(`[SubBlockSegmenter] 跳過空子塊 #${parentBlockIndex}.${subBlockTrueCounter}`);
                }
                currentSpanContentNodes = [];
            }
        }

        function processNodesRecursive(nodes) {
            for (const node of nodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    let text = node.textContent;
                    let lastIndex = 0;
                    let match;
                    if (text.trim() === '' && currentSpanContentNodes.length === 0) { // Skip leading pure whitespace text nodes if current span is empty
                        continue;
                    }
                    while ((match = delimiterRegex.exec(text)) !== null) {
                        // Add text before delimiter
                        if (match.index > lastIndex) {
                            currentSpanContentNodes.push(document.createTextNode(text.substring(lastIndex, match.index)));
                        }
                        // Add the delimiter itself
                        currentSpanContentNodes.push(document.createTextNode(match[1]));
                        // Add trailing space if captured
                        if (match[2]) {
                            currentSpanContentNodes.push(document.createTextNode(match[2]));
                        }
                        flushCurrentSpan(); // End of a sub-block
                        lastIndex = match.index + match[0].length;
                    }
                    // Add remaining text after the last delimiter
                    if (lastIndex < text.length) {
                        currentSpanContentNodes.push(document.createTextNode(text.substring(lastIndex)));
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // For inline elements, clone them and add to current span content.
                    currentSpanContentNodes.push(node.cloneNode(true));
                } else {
                    // Other node types (comments, etc.), clone and add.
                    currentSpanContentNodes.push(node.cloneNode(true));
                }
            }
        }

        processNodesRecursive(Array.from(blockElement.childNodes));
        flushCurrentSpan(true); // Flush any remaining content, isEndOfBlock = true

        // ===== 新增：對比分塊前後的內容 =====
        // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 分塊前文字長度: ${originalTextContent.length}`);

        // Clear original content and append new sub-block spans
        blockElement.innerHTML = '';
        blockElement.appendChild(newChildNodesContainer);

        // ===== 新增：分割後檢測 =====
        const postSubBlocks = Array.from(blockElement.querySelectorAll('.sub-block'));
        const postTextContent = blockElement.textContent;
        if (preSubBlocks.length > 0) {
            if (__SUBBLOCK_DEBUG__ && postSubBlocks.length < preSubBlocks.length) {
                console.error(`[SubBlockSegmenter][檢測] 分割後子塊數量變少！分割前: ${preSubBlocks.length}，分割後: ${postSubBlocks.length}`);
                console.error(`[SubBlockSegmenter][檢測] 分割前內容摘要:`, preSubBlocks.map(sb => (sb.textContent || '').substring(0, 30)));
                console.error(`[SubBlockSegmenter][檢測] 分割後內容摘要:`, postSubBlocks.map(sb => (sb.textContent || '').substring(0, 30)));
            }
            // 檢查內容拼接（如前後內容合併到一個 span）
            if (__SUBBLOCK_DEBUG__ && postSubBlocks.length === 1 && preSubBlocks.length > 1) {
                const mergedContent = postSubBlocks[0].textContent || '';
                const preConcat = preSubBlocks.map(sb => sb.textContent || '').join('');
                if (mergedContent.replace(/\s+/g, '') === preConcat.replace(/\s+/g, '')) {
                    console.error(`[SubBlockSegmenter][檢測] 分割後所有內容被合併到一個子塊！內容：${mergedContent.substring(0, 50)}...`);
                }
            }
        }
        if (postSubBlocks.length > 0) {
            // 檢查是否有異常長的子塊（僅在開啟除錯時輸出）
            const maxLen = Math.max(...postSubBlocks.map(sb => (sb.textContent || '').length));
            if (__SUBBLOCK_DEBUG__ && maxLen > 500 && postSubBlocks.length > 1) {
                console.warn(`[SubBlockSegmenter][檢測] 存在異常長的子塊，長度: ${maxLen}`);
            }
        }

        // ===== 新增：驗證分塊後的內容完整性 =====
        const newTextContent = blockElement.textContent;
        // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 分塊後文字長度: ${newTextContent.length}`);

        if (__SUBBLOCK_DEBUG__ && originalTextContent.trim() !== newTextContent.trim()) {
            console.warn(`[SubBlockSegmenter] 警告: 塊 #${parentBlockIndex} 分塊前後內容不一致!`);
            console.warn(`[SubBlockSegmenter] 分塊前內容: "${originalTextContent.substring(0, 50)}..."`);
            console.warn(`[SubBlockSegmenter] 分塊後內容: "${newTextContent.substring(0, 50)}..."`);
        }

        // After all processing, if firstGeneratedSubBlockElement is still set (i.e., subBlockTrueCounter ended at 1)
        if (firstGeneratedSubBlockElement && subBlockTrueCounter === 1) {
            firstGeneratedSubBlockElement.dataset.isOnlySubBlock = "true";
            // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 只有一個子塊，標記為 isOnlySubBlock=true`);
        }

        // ===== 新增：記錄最終生成的子塊 =====
        const finalSubBlocks = blockElement.querySelectorAll('.sub-block');
        // console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 最終生成 ${finalSubBlocks.length} 個子塊`);
        // console.log(`[SubBlockSegmenter] 子塊ID列表:`, Array.from(finalSubBlocks).map(sb => sb.dataset.subBlockId));

        // 分割後檢測分割一致性
        if (window.data && window.data.annotations) {
            const allSubBlocks = Array.from(blockElement.querySelectorAll('.sub-block'));
            allSubBlocks.forEach(sb => {
                const subBlockId = sb.dataset.subBlockId;
                const content = (sb.textContent || '').trim();
                // 查詢 annotation 裡的 exact
                const ann = window.data.annotations.find(a => a.target && a.target.selector && a.target.selector[0] && a.target.selector[0].subBlockId === subBlockId);
                if (__SUBBLOCK_DEBUG__ && ann && ann.target.selector[0].exact) {
                    const exact = ann.target.selector[0].exact.trim();
                    if (content !== exact) {
                        console.warn(`[分割一致性檢測] subBlockId=${subBlockId} 分割內容與 annotation.exact 不一致！\n分割內容: "${content}"\nannotation.exact: "${exact}"`);
                    }
                }
                //console.log(`[分割一致性] subBlockId=${subBlockId} 內容: "${content.substring(0, 40)}..."`);
            });
        }

        // 效能埋點：分塊結束
        performance.mark('subBlock-end');
        performance.measure('subBlockSegment', 'subBlock-start', 'subBlock-end');
    }

    // Expose public interface
    // ===== 新增：公式檢測函式 =====
    function checkForFormulas(blockElement, rawText) {
        // 檢查LaTeX公式模式
        const latexPatterns = [
            /\$\$[\s\S]*?\$\$/,     // 塊級公式 $$...$$
            /\\\[[\s\S]*?\\\]/,   // 塊級公式 \[...\]
            /\$[^$\n]+\$/,          // 行內公式 $...$
            /\\\([^\n]*?\\\)/     // 行內公式 \(...\)
        ];
        
        // 檢查是否包含數學公式
        for (const pattern of latexPatterns) {
            if (pattern.test(rawText)) {
                return true;
            }
        }
        
        // 檢查是否已經渲染的KaTeX元素
        if (blockElement.querySelector('.katex, .katex-display, .katex-inline')) {
            return true;
        }
        
        return false;
    }

    // ===== 新增：將整個塊包裝為單一子塊（保留內部 DOM，不破壞 KaTeX） =====
    function wrapAsSingleSubBlock(blockElement, parentBlockIndex) {
        // 若已經是單一子塊則跳過
        const existing = blockElement.querySelectorAll(':scope > .sub-block');
        if (existing.length === 1 && existing[0].dataset && existing[0].dataset.isOnlySubBlock === 'true') {
            return;
        }
        const span = document.createElement('span');
        span.className = 'sub-block';
        span.dataset.subBlockId = `${parentBlockIndex}.0`;
        span.dataset.isOnlySubBlock = 'true';
        while (blockElement.firstChild) {
            span.appendChild(blockElement.firstChild);
        }
        blockElement.appendChild(span);
    }

    // ===== 新增：公式感知的分割函式 =====
    function segmentFormulaAwareBlock(blockElement, parentBlockIndex, rawText, debug) {
        if (debug) {
            console.log(`[SubBlockSegmenter] 開始公式感知分割，塊 #${parentBlockIndex}`);
        }

        // ===== 新增：檢測 Markdown 表格語法 =====
        const hasMarkdownTableSeparator = /\|(:?-+:?\|)+/.test(rawText);
        if (hasMarkdownTableSeparator) {
            if (debug) {
                console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 含表格語法，包裝為單一子塊（原子）`);
            }
            wrapAsSingleSubBlock(blockElement, parentBlockIndex);
            return;
        }

        // 檢測公式位置和型別
        const formulaInfo = analyzeFormulas(blockElement, rawText);

        // 為了避免切斷 KaTeX 或將 $$...$$ 拆分為多個子塊，
        // 對包含公式的塊統一包裝為一個原子子塊。
        if (formulaInfo.hasBlockFormula || formulaInfo.renderedFormulas.length > 0) {
            if (debug) {
                console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 含塊級/已渲染公式，包裝為單一子塊（原子）。`);
            }
            wrapAsSingleSubBlock(blockElement, parentBlockIndex);
            return;
        }

        if (formulaInfo.hasInlineFormula) {
            // 只有行內公式：使用保守分割策略，僅按句號分割且保留 DOM
            return segmentWithInlineFormulaProtection(blockElement, parentBlockIndex, debug);
        }

        // 沒有檢測到公式，交由普通分割邏輯（由呼叫方繼續執行）
        return;
    }

    // ===== 新增：分析公式資訊 =====
    function analyzeFormulas(blockElement, rawText) {
        const info = {
            hasBlockFormula: false,
            hasInlineFormula: false,
            blockFormulas: [],
            inlineFormulas: [],
            renderedFormulas: []
        };

        // 檢測塊級公式
        const blockFormulaRegex = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g;
        let match;
        while ((match = blockFormulaRegex.exec(rawText)) !== null) {
            info.hasBlockFormula = true;
            info.blockFormulas.push({
                content: match[0],
                start: match.index,
                end: match.index + match[0].length
            });
        }

        // 檢測行內公式
        const inlineFormulaRegex = /\$[^$\n]+\$|\\\([^\n]*?\\\)/g;
        while ((match = inlineFormulaRegex.exec(rawText)) !== null) {
            info.hasInlineFormula = true;
            info.inlineFormulas.push({
                content: match[0],
                start: match.index,
                end: match.index + match[0].length
            });
        }

        // 檢測已渲染的公式
        const katexElements = blockElement.querySelectorAll('.katex, .katex-display, .katex-inline');
        if (katexElements.length > 0) {
            Array.from(katexElements).forEach(el => {
                info.renderedFormulas.push({
                    element: el,
                    type: el.classList.contains('katex-display') ? 'block' : 'inline'
                });
            });
        }

        return info;
    }

    // ===== 新增：按公式邊界分割 =====
    function segmentByFormulaBreaks(blockElement, parentBlockIndex, formulaInfo, debug) {
        if (debug) {
            console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 按公式邊界分割，發現${formulaInfo.blockFormulas.length}個塊級公式`);
        }

        // 獲取所有分割點（句號 + 塊級公式邊界）
        const rawText = blockElement.textContent || '';
        const breakPoints = [];
        
        // 新增句號分割點
        let sentenceMatch;
        const sentenceRegex = /[。]/g;
        while ((sentenceMatch = sentenceRegex.exec(rawText)) !== null) {
            breakPoints.push(sentenceMatch.index + 1); // +1 to include the period
        }
        
        // 新增公式邊界分割點
        formulaInfo.blockFormulas.forEach(formula => {
            breakPoints.push(formula.start);
            breakPoints.push(formula.end);
        });
        
        // 排序並去重
        const uniqueBreakPoints = [...new Set(breakPoints)].sort((a, b) => a - b);
        
        if (uniqueBreakPoints.length <= 2) {
            // 分割點太少，跳過分割
            return;
        }
        
        // 執行分割
        return performSmartSegmentation(blockElement, parentBlockIndex, uniqueBreakPoints, rawText, debug);
    }

    // ===== 新增：行內公式保護分割 =====
    function segmentWithInlineFormulaProtection(blockElement, parentBlockIndex, debug) {
        if (debug) {
            console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 使用行內公式保護分割`);
        }
        
        // 只在句號處分割，避免切斷行內公式
        const rawText = blockElement.textContent || '';
        const breakPoints = [0]; // 起始點
        
        let match;
        const sentenceRegex = /[。]/g;
        while ((match = sentenceRegex.exec(rawText)) !== null) {
            breakPoints.push(match.index + 1);
        }
        
        breakPoints.push(rawText.length); // 結束點
        
        if (breakPoints.length <= 2) {
            return; // 沒有有效分割點
        }
        
        return performSmartSegmentation(blockElement, parentBlockIndex, breakPoints, rawText, debug);
    }

    // ===== 新增：智慧分割執行 =====
    function performSmartSegmentation(blockElement, parentBlockIndex, breakPoints, rawText, debug) {
        let subBlockTrueCounter = 0;
        const newChildNodesContainer = document.createDocumentFragment();
        let firstGeneratedSubBlockElement = null;

        for (let i = 0; i < breakPoints.length - 1; i++) {
            const start = breakPoints[i];
            const end = breakPoints[i + 1];
            const segmentText = rawText.substring(start, end).trim();
            
            if (segmentText.length === 0) continue;
            
            // 建立子塊
            const span = document.createElement('span');
            span.className = 'sub-block';
            const subBlockId = `${parentBlockIndex}.${subBlockTrueCounter}`;
            span.dataset.subBlockId = subBlockId;
            span.textContent = segmentText;
            
            if (debug) {
                console.log(`[SubBlockSegmenter] 建立智慧子塊 #${subBlockId}, 內容: "${segmentText.substring(0, 30)}..."`);
            }
            
            newChildNodesContainer.appendChild(span);
            
            if (subBlockTrueCounter === 0) {
                firstGeneratedSubBlockElement = span;
            } else {
                firstGeneratedSubBlockElement = null;
            }
            
            subBlockTrueCounter++;
        }
        
        if (subBlockTrueCounter > 0) {
            blockElement.innerHTML = '';
            blockElement.appendChild(newChildNodesContainer);
            
            // 標記唯一子塊
            if (firstGeneratedSubBlockElement && subBlockTrueCounter === 1) {
                firstGeneratedSubBlockElement.dataset.isOnlySubBlock = "true";
            }
            
            if (debug) {
                console.log(`[SubBlockSegmenter] 塊 #${parentBlockIndex} 智慧分割完成，生成 ${subBlockTrueCounter} 個子塊`);
            }
        }
    }

    global.SubBlockSegmenter = {
        segment: segmentBlockIntoSubBlocks,
        // 暴露新功能用於測試
        checkForFormulas: checkForFormulas,
        analyzeFormulas: analyzeFormulas
    };

})(window);
