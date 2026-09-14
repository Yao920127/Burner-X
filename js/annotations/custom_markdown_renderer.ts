/**
 * 建立一個自定義的 marked.js 渲染器，用於在HTML輸出中嵌入批註ID。
 * @param {Array<Object>} annotations - 當前文件的批註列表。
 * @param {string} contentIdentifier - 當前內容型別的識別符號 ('ocr' 或 'translation')。
 * @param {Function} getKatexProcessedHtml - (此引數目前未被直接使用，但保留以便將來擴充) 一個獲取KaTeX處理後HTML的函式。
 * @returns {marked.Renderer} 一個 marked.js 渲染器例項。
 */
function createCustomMarkdownRenderer(annotations, contentIdentifier, getKatexProcessedHtml) {
    const __ANNOTATION_DEBUG__ = (function(){
        try { return !!(window && (window.ENABLE_ANNOTATION_DEBUG || localStorage.getItem('ENABLE_ANNOTATION_DEBUG') === 'true')); } catch { return false; }
    })();
    const renderer = new marked.Renderer();
    const originalTextRenderer = renderer.text;
    const originalParagraphRenderer = renderer.paragraph;
    const originalLinkRenderer = renderer.link;
    const originalImageRenderer = renderer.image;
    const originalHeadingRenderer = renderer.heading;
    const originalTableRenderer = renderer.table;
    const originalBlockquoteRenderer = renderer.blockquote;
    const originalListRenderer = renderer.list;
    const originalListItemRenderer = renderer.listitem;
    const originalCheckboxRenderer = renderer.checkbox;
    const originalCodeRenderer = renderer.code; // For fenced code blocks
    const originalCodespanRenderer = renderer.codespan; // For inline code

    // 輔助函式：轉義HTML特殊字元，用於屬性或內容
    function escapeHtml(html) {
        return html.replace(/[&<>"']/g, function (match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    // Helper function to find relevant annotations for a given text block.
    // This is a simplified version. A more robust solution would handle overlaps
    // and nested annotations more gracefully by segmenting the text.
    function getAnnotationsForText(text, relevantAnnotations) {
        const foundAnnotations = [];
        if (!text || !relevantAnnotations || relevantAnnotations.length === 0) {
            return foundAnnotations;
        }
        relevantAnnotations.forEach(ann => {
            const exact = ann.target.selector[0].exact;
            if (text.includes(exact)) { // Simple check
                foundAnnotations.push(ann);
            }
        });
        return foundAnnotations;
    }

    // 這個新的文字渲染器嘗試對文字進行分段並應用span標籤。
    // 在marked.js的渲染器字串拼接模型中，完美地完成這項任務具有挑戰性，
    // 特別是處理重疊批註和複雜的Markdown結構時。
    renderer.text = function(token) {
        let textToProcess; // 將用於批註處理的實際文字字串

        if (typeof token === 'string') {
            textToProcess = token;
        } else if (token && typeof token === 'object' && typeof token.text === 'string') {
            textToProcess = token.text;
            // console.log('[CustomMarkdownRenderer] Token 是物件，使用 token.text:', textToProcess);
        } else if (token && typeof token === 'object' && typeof token.raw === 'string') {
            textToProcess = token.raw; // 後備到 token.raw
            // console.warn('[CustomMarkdownRenderer] Token 是物件，token.text 不是字串，使用 token.raw:', textToProcess);
        } else {
            if (__ANNOTATION_DEBUG__) console.warn('[CustomMarkdownRenderer] 輸入 `token` 不是字串或無法識別的 token 物件。型別:', typeof token, '值:', token, '. 強制轉換為字串。');
            textToProcess = String(token); // 最後手段
        }

        let processedTextString = textToProcess; // 我們將在此字串上進行替換

        // const currentContentIdentifierForFilter = window.globalCurrentContentIdentifier; // 移除對全域變數的依賴
        // 使用傳遞給 createCustomMarkdownRenderer 的 contentIdentifier 引數 (在 renderer.text 的閉包中可用)
        const relevantAnnotations = (window.data && window.data.annotations ? window.data.annotations : []).filter(
            ann => ann.targetType === contentIdentifier && // 直接使用引數 contentIdentifier
                   ann.target && Array.isArray(ann.target.selector) &&
                   ann.target.selector[0] && typeof ann.target.selector[0].exact === 'string' &&
                   ann.target.selector[0].exact.trim() !== ''
        ).sort((a, b) => b.target.selector[0].exact.length - a.target.selector[0].exact.length);

        if (relevantAnnotations.length > 0) {
            relevantAnnotations.forEach(ann => {
                const exact = ann.target.selector[0].exact;
                // 修正正規表示式特殊字元的轉義，並使空白比對更靈活
                // 1. 標準的正規表示式特殊字元轉義
                let pattern = exact.replace(/[.*+?^${}()|[\\\]\\]/g, '\\$&');
                // 2. 將原始標註文字中的任何空白字元序列（包括換行字元）替換為 \\s+，
                //    使其能比對文字中的一個或多個任意空白字元。
                pattern = pattern.replace(/\s+/g, '\\\\s+');
                const regex = new RegExp(pattern, 'g');

                if (typeof processedTextString !== 'string') {
                    console.error('[CustomMarkdownRenderer] 嚴重錯誤: processedTextString 在迴圈中變為非字串。值:', processedTextString);
                    processedTextString = String(processedTextString);
                }

                processedTextString = processedTextString.replace(regex, (match) => {
                    let textToWrapInSpan;
                    // 檢查傳遞給 renderer.text 的原始 `token` 的型別
                    if (typeof token === 'object') {
                        // 如果原始 token 是一個物件，originalTextRenderer 可能期望一個物件。
                        // 由於 'match' 只是該 token 文字的一部分字串，
                        // 我們應該自己對 'match' 進行轉義幷包裹它，
                        // 而不是呼叫 originalTextRenderer(match)，因為這會導致 "Cannot use 'in' operator" 錯誤。
                        textToWrapInSpan = escapeHtml(match); // 使用已有的 escapeHtml 函式
                    } else {
                        // 如果原始 token 是一個字串，那麼用 'match' (也是字串) 呼叫 originalTextRenderer 應該是安全的。
                        let originalRenderedOutput = originalTextRenderer.call(this, match);
                        if (typeof originalRenderedOutput !== 'string') {
                            if (__ANNOTATION_DEBUG__) console.warn(`[CustomMarkdownRenderer] originalTextRenderer 對於比對 "${match}" (原始token是字串) 未返回字串。得到 ${typeof originalRenderedOutput}。強制轉換。`);
                            originalRenderedOutput = String(originalRenderedOutput);
                        }
                        textToWrapInSpan = originalRenderedOutput;
                    }
                    return `<span data-annotation-id="${escapeHtml(ann.id)}" class="pre-annotated">${textToWrapInSpan}</span>`;
                });
            });

            if (typeof processedTextString !== 'string') {
                 console.error('[CustomMarkdownRenderer] 嚴重錯誤: 註解迴圈最終的 processedTextString 不是字串。值:', processedTextString);
                 return String(processedTextString);
            }
            return processedTextString; // 返回帶有批註span的HTML字串
        }

        // 預設路徑: 使用原始 token 呼叫 originalTextRenderer
        let defaultOutput = originalTextRenderer.call(this, token);
        if (typeof defaultOutput !== 'string') {
            if (__ANNOTATION_DEBUG__) console.warn(`[CustomMarkdownRenderer] originalTextRenderer 對於 token "${JSON.stringify(token)}" (預設路徑) 未返回字串。得到 ${typeof defaultOutput}。強制轉換。`);
            defaultOutput = String(defaultOutput);
        }
        return defaultOutput;
    };

    // 通常來說，如果一個批註針對整個塊（例如段落），更安全的做法是包裹整個塊，
    // 或者在完全渲染好的HTML上進行後處理步驟。
    renderer.paragraph = function(text) {
        // 此處的 `text` 引數已經是內部元素（如文字、連結、圖片）渲染後的HTML字串。
        // 如果我們想包裹整個段落，需要識別是否有任何批註在概念上針對此段落。
        // 僅使用 TextQuoteSelector 很難做到這一點。
        // 目前，我們只使用預設的段落渲染器。
        // 如果 `text` 中包含了我們新增的 `data-annotation-id` span，它們將被保留。
        return originalParagraphRenderer.call(this, text);
    };


    // 如果需要，你可以擴充其他渲染器 (例如 image, heading 等)，
    // 比如，如果一個批註專門針對一張圖片，可以新增 `data-annotation-target="true"`。
    // renderer.image = function(href, title, text) {
    //     // 檢查是否有批註針對此圖片 (例如，基於 href 或 alt 文字)
    //     // 如果有，新增一個包裝元素或 data 屬性。
    //     return originalImageRenderer.call(this, href, title, text);
    // };

    return renderer;
}

// 如果不使用模組系統，則暴露到全域作用域；如果使用模組，則匯出。
window.createCustomMarkdownRenderer = createCustomMarkdownRenderer;
