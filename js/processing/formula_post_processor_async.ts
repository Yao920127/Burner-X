// js/processing/formula_post_processor_async.js
// 非同步公式後處理器 - 使用 Web Worker 渲染公式，避免阻塞主執行緒
// 注意：匯出功能仍使用同步版本（formula_post_processor.js）

(function(global) {
    'use strict';

    /**
     * 非同步公式後處理器
     * 使用 Web Worker 在後臺渲染 KaTeX 公式
     */
    class FormulaPostProcessorAsync {
        constructor() {
            this.worker = null;
            this.workerReady = false;
            this.pendingCallbacks = new Map();
            this.requestId = 0;
            this.initWorker();
        }

        /**
         * 初始化 Web Worker（使用 Blob URL 支援 file:// 協議）
         */
        initWorker() {
            try {
                // 建立內聯 Worker 程式碼（Blob URL 方案，支援 file:// 協議）
                const workerCode = this.getWorkerCode();
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const workerUrl = URL.createObjectURL(blob);

                this.worker = new Worker(workerUrl);

                // 清理 Blob URL（Worker 已建立，不再需要）
                URL.revokeObjectURL(workerUrl);

                this.worker.onmessage = (e) => {
                    const { type } = e.data;

                    if (type === 'ready') {
                        this.workerReady = true;
                        console.log('[FormulaPostProcessorAsync] Worker ready (Blob URL)');
                        return;
                    }

                    if (type === 'batch_complete') {
                        const { batchId, results } = e.data;
                        const callback = this.pendingCallbacks.get(batchId);
                        if (callback) {
                            callback(results);
                            this.pendingCallbacks.delete(batchId);
                        }
                        return;
                    }

                    if (type === 'error') {
                        console.error('[FormulaPostProcessorAsync] Worker error:', e.data.error);
                        return;
                    }
                };

                this.worker.onerror = (error) => {
                    console.error('[FormulaPostProcessorAsync] Worker error:', error);
                    this.workerReady = false;
                };

            } catch (error) {
                console.warn('[FormulaPostProcessorAsync] Failed to create Worker, falling back to sync:', error);
                this.workerReady = false;
            }
        }

        /**
         * 獲取 Worker 程式碼（內聯版本，避免 file:// 協議限制）
         */
        getWorkerCode() {
            return `
'use strict';

// 匯入 KaTeX 庫
try {
    importScripts('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js');
} catch (error) {
    self.postMessage({ type: 'error', error: 'Failed to load KaTeX library' });
}

// 修復公式錯誤
function fixFormulaErrors(formula, isDisplay) {
    let fixed = formula;
    if (!isDisplay && /\\\\tag\\{[^}]*\\}/.test(fixed)) {
        fixed = fixed.replace(/\\\\tag\\{[^}]*\\}/g, '');
    }
    if (/\\\\;\\s*\\^\\\\circ/.test(fixed)) {
        fixed = fixed.replace(/\\\\;\\s*\\^\\\\circ/g, '\\\\,^{\\\\circ}');
    }
    if (/\\\\;\\s*\\^([^{])/.test(fixed)) {
        fixed = fixed.replace(/\\\\;\\s*\\^([^{])/g, (match, char) => \`\\\\,^{\${char}}\`);
    }
    if (/\\{\\{/.test(fixed)) {
        while (/\\{\\{/.test(fixed)) {
            fixed = fixed.replace(/\\{\\{([^}]*)\\}\\}/g, '{$1}');
        }
    }
    if (/\\\\mathrm\\{[^}]*\\\\;[^}]*\\^\\s*\\\\circ[^}]*\\}/.test(fixed)) {
        fixed = fixed.replace(/\\\\mathrm\\{\\s*\\\\;\\s*\\^\\s*\\\\circ\\s+([^}]+)\\}/g, '\\\\,^{\\\\circ}\\\\mathrm{$1}');
    }
    fixed = fixed.replace(/\\^([a-zA-Z]{2,})/g, '^{$1}');
    return fixed.trim();
}

// 渲染單個公式
function renderFormula(id, formula, options) {
    try {
        if (typeof katex === 'undefined') {
            throw new Error('KaTeX is not available');
        }
        const fixed = fixFormulaErrors(formula, options.displayMode || false);
        const html = katex.renderToString(fixed, {
            displayMode: options.displayMode || false,
            throwOnError: false,
            strict: 'ignore',
            output: 'html',
            ...options
        });
        return { type: 'success', id, html, originalFormula: formula };
    } catch (error) {
        return {
            type: 'error',
            id,
            error: error.message,
            originalFormula: formula,
            html: \`<span class="katex-fallback" title="\${error.message}">\${formula}</span>\`
        };
    }
}

// 批次渲染
function renderBatch(batchId, formulas) {
    const results = formulas.map(item => renderFormula(item.id, item.formula, item.options || {}));
    return { type: 'batch_complete', batchId, results };
}

// 訊息處理
self.onmessage = function(e) {
    const { type, id, formula, options, batchId, formulas } = e.data;
    if (type === 'render') {
        self.postMessage(renderFormula(id, formula, options || {}));
    } else if (type === 'batch') {
        self.postMessage(renderBatch(batchId, formulas));
    } else if (type === 'ping') {
        self.postMessage({ type: 'pong' });
    } else {
        self.postMessage({ type: 'error', error: \`Unknown message type: \${type}\` });
    }
};

self.postMessage({ type: 'ready' });
            `.trim();
        }

        /**
         * 掃描元素中的所有公式（不渲染，只收集）
         * 包括：1. 純文字中的 $...$ 公式  2. 渲染失敗的 .katex-fallback 元素
         * @param {HTMLElement} rootElement - 要掃描的根元素
         * @returns {Array} 公式列表
         */
        collectFormulas(rootElement) {
            if (!rootElement) return [];

            const formulas = [];
            let formulaId = 0;

            // 1. 收集渲染失敗的公式（.katex-fallback 元素）
            const fallbackElements = rootElement.querySelectorAll('.katex-fallback');
            fallbackElements.forEach(el => {
                const text = el.textContent.trim();
                const isDisplay = el.classList.contains('katex-block');

                // 檢測不完整的環境標記（這些需要被刪除，不是重新渲染）
                if (/^\\begin\{(aligned|array|matrix|cases|split|gather)\}$/.test(text) ||
                    /^\\end\{(aligned|array|matrix|cases|split|gather)\}$/.test(text)) {
                    // 標記為刪除
                    formulas.push({
                        id: formulaId++,
                        formula: null,  // null 表示刪除
                        isDisplay: isDisplay,
                        fallbackElement: el,
                        shouldDelete: true
                    });
                    return;
                }

                // 正常的失敗公式，嘗試重新渲染
                if (text.length > 0) {
                    formulas.push({
                        id: formulaId++,
                        formula: text,
                        isDisplay: isDisplay,
                        fallbackElement: el,
                        shouldDelete: false
                    });
                }
            });

            // 2. 掃描純文位元組點中的公式（不常見，但保留此功能）
            function processNode(node) {
                // 跳過已渲染的 katex 元素
                if (node.classList && (
                    node.classList.contains('katex') ||
                    node.classList.contains('katex-block') ||
                    node.classList.contains('katex-inline') ||
                    node.classList.contains('katex-display') ||
                    node.classList.contains('katex-fallback')  // 跳過 fallback（已在上面處理）
                )) {
                    return;
                }

                // 處理文位元組點
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    const formulaRegex = /\$\$([^\$]+?)\$\$|\$([^\$\n]+?)\$/g;

                    let match;
                    while ((match = formulaRegex.exec(text)) !== null) {
                        const formula = match[1] || match[2];
                        const isDisplay = !!match[1];

                        formulas.push({
                            id: formulaId++,
                            formula: formula,
                            isDisplay: isDisplay,
                            textNode: node,
                            matchIndex: match.index,
                            matchLength: match[0].length
                        });
                    }
                }
                // 遞迴處理子節點
                else if (node.childNodes) {
                    Array.from(node.childNodes).forEach(processNode);
                }
            }

            processNode(rootElement);
            return formulas;
        }

        /**
         * 非同步渲染元素中的所有公式
         * @param {HTMLElement} rootElement - 要處理的根元素
         * @param {Object} options - 選項
         * @param {Function} onProgress - 進度回撥 (processed, total)
         * @param {Function} onComplete - 完成回撥
         * @returns {Promise} 完成時 resolve
         */
        async processFormulasInElement(rootElement, options = {}) {
            if (!rootElement) {
                console.warn('[FormulaPostProcessorAsync] rootElement is null');
                return;
            }

            const startTime = performance.now();
            const {
                onProgress = null,
                onComplete = null,
                useWorker = true  // 是否使用 Worker（匯出時設為 false）
            } = options;

            // 統計已渲染的公式（除錯資訊）
            const renderedFormulas = rootElement.querySelectorAll('.katex, .katex-block, .katex-inline, .katex-display');
            const fallbackFormulas = rootElement.querySelectorAll('.katex-fallback');
            console.log(`[FormulaPostProcessorAsync] 📊 文件公式統計: ${renderedFormulas.length} 個已渲染, ${fallbackFormulas.length} 個失敗`);

            // 如果不使用 Worker 或 Worker 不可用，回退到同步版本
            if (!useWorker || !this.workerReady || !this.worker) {
                console.log('[FormulaPostProcessorAsync] Falling back to sync processing');
                if (global.FormulaPostProcessor && global.FormulaPostProcessor.processFormulasInElement) {
                    global.FormulaPostProcessor.processFormulasInElement(rootElement);
                }
                if (onComplete) onComplete();
                return;
            }

            // 1. 收集所有公式（包括失敗的公式）
            const formulas = this.collectFormulas(rootElement);

            if (formulas.length === 0) {
                console.log('[FormulaPostProcessorAsync] ✅ 無需後處理（所有公式已在 Markdown 階段成功渲染）');
                const endTime = performance.now();
                console.log(`[FormulaPostProcessorAsync] 完成，耗時: ${(endTime - startTime).toFixed(2)}ms`);
                if (onComplete) onComplete();
                return;
            }

            console.log(`[FormulaPostProcessorAsync] Found ${formulas.length} formulas, processing...`);

            // 2. 分離刪除和渲染任務
            const toDelete = formulas.filter(f => f.shouldDelete);
            const toRender = formulas.filter(f => !f.shouldDelete);

            let processedCount = 0;

            // 3a. 先處理刪除任務（不需要 Worker）
            toDelete.forEach(formulaData => {
                this.replaceFormulaInDOM(formulaData, null);
                processedCount++;
                if (onProgress) {
                    onProgress(processedCount, formulas.length);
                }
            });

            console.log(`[FormulaPostProcessorAsync] 刪除了 ${toDelete.length} 個不完整的環境標記`);

            // 3b. 如果有需要渲染的公式，傳送到 Worker
            if (toRender.length > 0) {
                console.log(`[FormulaPostProcessorAsync] 使用 Worker 渲染 ${toRender.length} 個失敗的公式...`);

                const batchSize = 20;  // 每批處理 20 個公式
                const batches = [];

                for (let i = 0; i < toRender.length; i += batchSize) {
                    batches.push(toRender.slice(i, i + batchSize));
                }

                // 逐批渲染
                for (const batch of batches) {
                    await this.renderBatch(batch, (results) => {
                        // 替換 DOM
                        results.forEach(result => {
                            const formulaData = batch.find(f => f.id === result.id);
                            if (!formulaData) return;

                            this.replaceFormulaInDOM(formulaData, result.html);
                            processedCount++;

                            if (onProgress) {
                                onProgress(processedCount, formulas.length);
                            }
                        });
                    });

                    // 每批之間讓出主執行緒，允許使用者互動
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            const endTime = performance.now();
            console.log(`[FormulaPostProcessorAsync] 完成渲染 ${formulas.length} 個公式，耗時: ${(endTime - startTime).toFixed(2)}ms`);

            if (onComplete) {
                onComplete();
            }
        }

        /**
         * 渲染一批公式
         * @param {Array} formulas - 公式陣列
         * @param {Function} callback - 完成回撥
         * @returns {Promise}
         */
        renderBatch(formulas, callback) {
            return new Promise((resolve) => {
                const batchId = this.requestId++;

                this.pendingCallbacks.set(batchId, (results) => {
                    callback(results);
                    resolve();
                });

                // 傳送到 Worker
                this.worker.postMessage({
                    type: 'batch',
                    batchId: batchId,
                    formulas: formulas.map(f => ({
                        id: f.id,
                        formula: f.formula,
                        options: {
                            displayMode: f.isDisplay,
                            throwOnError: false,
                            strict: 'ignore'
                        }
                    }))
                });
            });
        }

        /**
         * 在 DOM 中替換公式文字為渲染後的 HTML
         * @param {Object} formulaData - 公式資料
         * @param {string} html - 渲染後的 HTML
         */
        replaceFormulaInDOM(formulaData, html) {
            // 場景 1: 處理 .katex-fallback 元素（失敗的公式）
            if (formulaData.fallbackElement) {
                const fallbackEl = formulaData.fallbackElement;

                // 檢查元素是否仍在 DOM 中
                if (!fallbackEl.parentNode) {
                    console.warn('[FormulaPostProcessorAsync] Fallback element not in DOM');
                    return;
                }

                // 子場景 1a: 需要刪除（不完整的環境標記）
                if (formulaData.shouldDelete) {
                    console.log(`[FormulaPostProcessorAsync] 刪除不完整的 LaTeX 環境: ${fallbackEl.textContent.substring(0, 30)}...`);
                    fallbackEl.parentNode.removeChild(fallbackEl);
                    return;
                }

                // 子場景 1b: 重新渲染（正常的失敗公式）
                if (html) {
                    const temp = document.createElement('span');
                    temp.innerHTML = html;
                    const renderedNode = temp.firstChild;

                    if (renderedNode) {
                        console.log(`[FormulaPostProcessorAsync] 修復失敗的公式: ${formulaData.formula.substring(0, 30)}...`);
                        fallbackEl.parentNode.replaceChild(renderedNode, fallbackEl);
                    }
                }
                return;
            }

            // 場景 2: 處理文位元組點中的公式（原有邏輯，用於 $...$ 格式）
            const { textNode, matchIndex, matchLength } = formulaData;

            if (!textNode || !textNode.parentNode) {
                console.warn('[FormulaPostProcessorAsync] Text node not in DOM');
                return;
            }

            const text = textNode.textContent;
            const before = text.substring(0, matchIndex);
            const after = text.substring(matchIndex + matchLength);

            // 建立一個臨時容器
            const temp = document.createElement('span');
            temp.innerHTML = html;
            const renderedNode = temp.firstChild;

            // 建立新的文位元組點
            const beforeNode = before ? document.createTextNode(before) : null;
            const afterNode = after ? document.createTextNode(after) : null;

            const parent = textNode.parentNode;

            // 替換節點
            if (beforeNode) {
                parent.insertBefore(beforeNode, textNode);
            }
            parent.insertBefore(renderedNode, textNode);
            if (afterNode) {
                parent.insertBefore(afterNode, textNode);
            }
            parent.removeChild(textNode);
        }

        /**
         * 清理 Worker
         */
        destroy() {
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
                this.workerReady = false;
                console.log('[FormulaPostProcessorAsync] Worker terminated');
            }
        }
    }

    // 建立全域單例
    global.FormulaPostProcessorAsync = new FormulaPostProcessorAsync();

    // 頁面解除安裝時清理
    window.addEventListener('beforeunload', () => {
        if (global.FormulaPostProcessorAsync) {
            global.FormulaPostProcessorAsync.destroy();
        }
    });

    console.log('[FormulaPostProcessorAsync] 模組已載入');

})(window);
