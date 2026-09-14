// js/processing/formula_post_processor.js
// 後處理：掃描 HTML 中的純文字公式並渲染

(function(global) {
    'use strict';

    /**
     * 修復公式中的常見 LaTeX 錯誤
     * @param {string} formula - 原始公式
     * @param {boolean} isDisplay - 是否為塊級公式
     * @returns {string} - 修復後的公式
     */
    function fixFormulaErrors(formula, isDisplay) {
        let fixed = formula;

        // 修復 1: 移除行內公式中的 \tag{...}
        // \tag 只能在塊級公式 (displayMode) 中使用
        if (!isDisplay && /\\tag\{[^}]*\}/.test(fixed)) {
            console.log('[FormulaPostProcessor] 移除行內公式中的 \\tag');
            fixed = fixed.replace(/\\tag\{[^}]*\}/g, '');
        }

        // 修復 2: 修復 \;^\circ 語法錯誤
        // \;^\circ → \,^{\circ} 或 ^{\circ}
        if (/\\;\s*\^\\circ/.test(fixed)) {
            console.log('[FormulaPostProcessor] 修復 \\;^\\circ → \\,^{\\circ}');
            fixed = fixed.replace(/\\;\s*\^\\circ/g, '\\,^{\\circ}');
        }

        // 修復 2b: 修復其他 \;^ 的情況
        if (/\\;\s*\^([^{])/.test(fixed)) {
            console.log('[FormulaPostProcessor] 修復 \\;^x → \\,^{x}');
            fixed = fixed.replace(/\\;\s*\^([^{])/g, (match, char) => `\\,^{${char}}`);
        }

        // 修復 3: 修復雙花括號 {{...}} → {...}
        // 雙花括號可能導致 "internal group" 錯誤
        if (/\{\{/.test(fixed)) {
            console.log('[FormulaPostProcessor] 修復雙花括號 {{...}} → {...}');
            // 遞迴移除雙花括號，直到沒有為止
            while (/\{\{/.test(fixed)) {
                fixed = fixed.replace(/\{\{([^}]*)\}\}/g, '{$1}');
            }
        }

        // 修復 4: 修復 \mathrm{\;^\circ C} 的情況
        if (/\\mathrm\{[^}]*\\;[^}]*\^\s*\\circ[^}]*\}/.test(fixed)) {
            console.log('[FormulaPostProcessor] 修復 \\mathrm{\\;^\\circ C}');
            // \mathrm{\;^\circ C} → \,^{\circ}\mathrm{C}
            fixed = fixed.replace(/\\mathrm\{\s*\\;\s*\^\s*\\circ\s+([^}]+)\}/g, '\\,^{\\circ}\\mathrm{$1}');
        }

        // 修復 5: 確保上標總是用花括號包圍（除非是單個字元）
        // ^xy → ^{xy} (如果 y 不是空格或特殊符號)
        fixed = fixed.replace(/\^([a-zA-Z]{2,})/g, '^{$1}');

        return fixed.trim();
    }

    /**
     * 掃描元素中的所有文位元組點，找到未渲染的公式並渲染
     * @param {HTMLElement} rootElement - 要掃描的根元素
     */
    function processFormulasInElement(rootElement) {
        if (!rootElement) return;

        const startTime = performance.now();
        let processedCount = 0;
        let removedCount = 0;

        // 先清理錯誤的 katex-fallback 元素（不完整的公式）
        const fallbackElements = rootElement.querySelectorAll('.katex-fallback');
        fallbackElements.forEach(el => {
            const text = el.textContent.trim();

            // 檢測不完整的環境標記
            if (/^\\begin\{(aligned|array|matrix|cases|split|gather)\}$/.test(text) ||
                /^\\end\{(aligned|array|matrix|cases|split|gather)\}$/.test(text)) {
                console.log('[FormulaPostProcessor] 刪除不完整的公式塊:', text);
                el.remove();
                removedCount++;
                return;
            }

            // 檢測常見的 LaTeX 錯誤並嘗試修正
            const errorTitle = el.getAttribute('title') || '';
            const errorMatch = errorTitle.match(/Undefined control sequence: (\\[A-Za-z]+)/);
            const fontMetricsError = errorTitle.includes('Font metrics not found');

            if (errorMatch || fontMetricsError) {
                const wrongCmd = errorMatch ? errorMatch[1] : '';
                let fixedText = text;
                let fixed = false;

                // 修復字型巢狀問題（如 \texttt{\textbf{M}} ）
                if (fontMetricsError) {
                    // 移除巢狀的字型命令，只保留外層
                    fixedText = text
                        // \texttt{\textbf{X}} → \texttt{X}
                        .replace(/\\texttt\s*\{\s*\\text(bf|it|rm)\s*\{([^}]+)\}\s*\}/g, '\\texttt{$2}')
                        // \textbf{\texttt{X}} → \textbf{X}
                        .replace(/\\text(bf|it|rm)\s*\{\s*\\texttt\s*\{([^}]+)\}\s*\}/g, '\\text$1{$2}')
                        // 任意巢狀字型 → 保留外層
                        .replace(/\\(text(tt|bf|it|rm|sf)|math(tt|bf|it|rm|sf|cal|bb))\s*\{\s*\\(text(tt|bf|it|rm|sf)|math(tt|bf|it|rm|sf|cal|bb))\s*\{([^}]+)\}\s*\}/g, '\\$1{$6}');

                    if (fixedText !== text) {
                        fixed = true;
                        console.log('[FormulaPostProcessor] 修正字型巢狀:', text.substring(0, 50), '→', fixedText.substring(0, 50));
                    }
                }

                // 常見錯誤對映
                if (!fixed && errorMatch) {
                const fixes = {
                    // 向量和重音符號（大寫→小寫）
                    '\\Vec': '\\vec',
                    '\\Hat': '\\hat',
                    '\\Bar': '\\bar',
                    '\\Tilde': '\\tilde',
                    '\\Dot': '\\dot',
                    '\\Ddot': '\\ddot',
                    '\\Check': '\\check',
                    '\\Acute': '\\acute',
                    '\\Grave': '\\grave',
                    '\\Breve': '\\breve',
                    '\\Overline': '\\overline',
                    '\\Underline': '\\underline',
                    '\\Widehat': '\\widehat',
                    '\\Widetilde': '\\widetilde',
                    '\\Overbrace': '\\overbrace',
                    '\\Underbrace': '\\underbrace',

                    // 字型命令（大寫→小寫）
                    '\\Mat': '\\mathrm',
                    '\\Bf': '\\mathbf',
                    '\\It': '\\mathit',
                    '\\Cal': '\\mathcal',
                    '\\Scr': '\\mathscr',
                    '\\Frak': '\\mathfrak',
                    '\\Bb': '\\mathbb',

                    // 小寫希臘字母（大寫→小寫）
                    '\\Alpha': '\\alpha',
                    '\\Beta': '\\beta',
                    '\\Epsilon': '\\epsilon',
                    '\\Zeta': '\\zeta',
                    '\\Eta': '\\eta',
                    '\\Iota': '\\iota',
                    '\\Kappa': '\\kappa',
                    '\\Mu': '\\mu',
                    '\\Nu': '\\nu',
                    '\\Omicron': '\\omicron',
                    '\\Rho': '\\rho',
                    '\\Tau': '\\tau',
                    '\\Chi': '\\chi',

                    // 數學運算子（大寫→小寫）
                    '\\Sum': '\\sum',
                    '\\Prod': '\\prod',
                    '\\Int': '\\int',
                    '\\Lim': '\\lim',
                    '\\Inf': '\\inf',
                    '\\Sup': '\\sup',
                    '\\Max': '\\max',
                    '\\Min': '\\min',
                    '\\Sin': '\\sin',
                    '\\Cos': '\\cos',
                    '\\Tan': '\\tan',
                    '\\Log': '\\log',
                    '\\Ln': '\\ln',
                    '\\Exp': '\\exp',

                    // 其他常見錯誤
                    '\\limit': '\\lim',
                    '\\Frac': '\\frac',
                    '\\Sqrt': '\\sqrt',
                    '\\Text': '\\text',
                    '\\Left': '\\left',
                    '\\Right': '\\right',
                    '\\Big': '\\big',
                    '\\Bigg': '\\bigg',
                };

                // 嘗試修正
                for (const [wrong, correct] of Object.entries(fixes)) {
                    if (text.includes(wrong)) {
                        fixedText = text.replace(new RegExp(wrong.replace('\\', '\\\\'), 'g'), correct);
                        fixed = true;
                        break;
                    }
                }
                } // 結束 if (!fixed && errorMatch)

                if (fixed) {
                    console.log('[FormulaPostProcessor] 修正公式錯誤:', wrongCmd, '→', fixedText.substring(0, 50));
                    try {
                        // 嘗試重新渲染
                        const isBlock = el.classList.contains('katex-block');
                        const span = document.createElement('span');
                        span.className = isBlock ? 'katex-block' : 'katex-inline';

                        if (typeof katex !== 'undefined') {
                            katex.render(fixedText, span, {
                                throwOnError: false,
                                displayMode: isBlock
                            });
                            el.replaceWith(span);
                            processedCount++;
                        }
                    } catch (err) {
                        console.warn('[FormulaPostProcessor] 修正後仍無法渲染:', err.message);
                    }
                }
            }
        });

        // 遞迴處理所有文位元組點
        function processNode(node) {
            // 跳過已經渲染過的 KaTeX 元素
            if (node.classList && (node.classList.contains('katex') || node.classList.contains('katex-inline') || node.classList.contains('katex-block'))) {
                return;
            }

            // 跳過 script、style、code 等標籤
            if (node.tagName && /^(SCRIPT|STYLE|CODE|PRE)$/.test(node.tagName)) {
                return;
            }

            // 處理文位元組點
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;

                // 檢查是否包含公式標記
                if (text.includes('$')) {
                    processTextNode(node);
                }
            }
            // 遞迴處理子節點
            else if (node.childNodes) {
                // 轉換為陣列避免在走訪時修改 DOM 導致問題
                Array.from(node.childNodes).forEach(processNode);
            }
        }

        /**
         * 處理單個文位元組點，將其中的公式替換為渲染後的 HTML
         */
        function processTextNode(textNode) {
            const text = textNode.textContent;

            // 比對所有公式：$...$ 和 $$...$$
            const formulaRegex = /\$\$([^\$]+?)\$\$|\$([^\$\n]+?)\$/g;

            if (!formulaRegex.test(text)) return;

            // 重置正則
            formulaRegex.lastIndex = 0;

            const fragments = [];
            let lastIndex = 0;
            let match;

            while ((match = formulaRegex.exec(text)) !== null) {
                // 新增公式前的文字
                if (match.index > lastIndex) {
                    fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
                }

                // 渲染公式
                let formula = match[1] || match[2]; // $$...$$ 或 $...$
                const isDisplay = !!match[1];

                // 預處理：修復常見的 LaTeX 錯誤
                formula = fixFormulaErrors(formula, isDisplay);

                try {
                    // 使用 KaTeX 渲染
                    const span = document.createElement('span');
                    span.className = isDisplay ? 'katex-block' : 'katex-inline';

                    if (typeof katex !== 'undefined') {
                        katex.render(formula, span, {
                            throwOnError: false,
                            displayMode: isDisplay
                        });
                        fragments.push(span);
                        processedCount++;
                    } else {
                        // KaTeX 不可用，保留原文
                        fragments.push(document.createTextNode(match[0]));
                    }
                } catch (error) {
                    console.warn('[FormulaPostProcessor] 渲染公式失敗:', formula, error);
                    // 渲染失敗，保留原文
                    fragments.push(document.createTextNode(match[0]));
                }

                lastIndex = formulaRegex.lastIndex;
            }

            // 新增剩餘文字
            if (lastIndex < text.length) {
                fragments.push(document.createTextNode(text.substring(lastIndex)));
            }

            // 替換原文位元組點
            if (fragments.length > 0) {
                const parent = textNode.parentNode;
                if (parent) {
                    fragments.forEach(fragment => {
                        parent.insertBefore(fragment, textNode);
                    });
                    parent.removeChild(textNode);
                }
            }
        }

        // 開始處理
        processNode(rootElement);

        const duration = performance.now() - startTime;

        // Phase 3.5: 只在有實際處理時才輸出日誌，避免流式更新時刷屏
        if (processedCount > 0 || removedCount > 0) {
            console.log(`[FormulaPostProcessor] 處理完成: 渲染 ${processedCount} 個公式, 刪除 ${removedCount} 個錯誤塊, 耗時 ${duration.toFixed(2)}ms`);
        }

        return { processedCount, removedCount };
    }

    // 匯出到全域
    global.FormulaPostProcessor = {
        processFormulasInElement: processFormulasInElement,
        version: '1.0.0'
    };

    console.log('[FormulaPostProcessor] Formula post processor loaded.');

})(window);
