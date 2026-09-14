// js/processing/markdown_text_fix.js
// 專門修復數學文字顯示問題的補丁
(function MarkdownTextFix(global) {

    /**
     * 修復長段落中的數學公式顯示問題
     * @param {string} markdown - 原始 markdown 文字
     * @returns {string} 修復後的 markdown
     */
    function fixMathTextDisplay(markdown) {
        if (!markdown || typeof markdown !== 'string') {
            return markdown;
        }

        // 1. 保護已有的數學公式，避免被段落分割
        let processed = markdown;
        
        // 2. 修復段落內的公式換行問題
        // 將段落內不必要的換行轉換為空格，但保持公式完整
        processed = processed.replace(/([^.\n])\n(?![#\-*+\d\s])/g, '$1 ');
        
        // 3. 確保數學公式前後有適當的空格
        processed = processed.replace(/([^\s])\$\$/g, '$1 $$');
        processed = processed.replace(/\$\$([^\s])/g, '$$ $1');
        processed = processed.replace(/([^\s])\$([^$])/g, '$1 $$$2');
        processed = processed.replace(/([^$])\$([^\s])/g, '$1$ $2');
        
        // 4. 修復中文和公式之間的空格問題
        processed = processed.replace(/([\u4e00-\u9fff])\$\$/g, '$1 $$');
        processed = processed.replace(/\$\$([\u4e00-\u9fff])/g, '$$ $1');
        processed = processed.replace(/([\u4e00-\u9fff])\$([^$])/g, '$1 $$$2');
        processed = processed.replace(/([^$])\$([\u4e00-\u9fff])/g, '$1$ $2');

        return processed;
    }

    /**
     * 增強的 KaTeX 渲染選項
     */
    const enhancedKatexOptions = {
        displayMode: false,
        throwOnError: false,
        errorColor: '#cc0000',
        strict: 'ignore',
        output: 'html',
        trust: false,
        fleqn: false,
        leqno: false,
        minRuleThickness: 0.04,
        colorIsTextColor: false,
        maxSize: Infinity,
        maxExpand: 1000,
        globalGroup: false,
        macros: {
            "\\RR": "\\mathbb{R}",
            "\\NN": "\\mathbb{N}",
            "\\ZZ": "\\mathbb{Z}",
            "\\QQ": "\\mathbb{Q}",
            "\\CC": "\\mathbb{C}",
            "\\sum": "\\sum",
            "\\times": "\\times",
            "\\frac": "\\frac",
            "\\div": "\\div"
        }
    };

    /**
     * 改進的數學公式渲染函式
     * @param {string} content - 公式內容
     * @param {boolean} displayMode - 是否為顯示模式
     * @returns {string} 渲染後的 HTML
     */
    function renderMathImproved(content, displayMode = false) {
        if (!content || typeof content !== 'string') {
            return '';
        }

        const options = {
            ...enhancedKatexOptions,
            displayMode: displayMode
        };

        try {
            // 預處理公式內容
            let processedContent = content.trim();
            // 清理零寬字元/組合下劃線/誤入的中文標點等邊緣字元
            processedContent = processedContent
              .replace(/[\u200B-\u200D\uFEFF]/g, '')
              .replace(/^[\u0300-\u036F]+|[\u0300-\u036F]+$/g, '')
              .replace(/^[\s\u3000。，、；：：“”\(（\)）\[\]【】《》‘’'"–—-]+/, '')
              .replace(/[\s\u3000。，、；：：“”\(（\)）\[\]【】《》‘’'"–—-]+$/, '')
              .replace(/\s{2,}/g, ' ');
            
            // 修復常見的公式問題
            if (/\\right\s*$/.test(processedContent)) {
                let close = ')';
                try {
                    const re = /\\left\s*([\(\[\{])/g;
                    let m;
                    while ((m = re.exec(processedContent)) !== null) {
                        const ch = m[1];
                        close = ch === '(' ? ')' : ch === '[' ? ']' : '}';
                    }
                } catch(_) { /* ignore */ }
                processedContent = processedContent.replace(/\\right\s*$/, `\\right${close}`);
            }
            // Degree unit normalization: \mathrm{ ^\circ C } or \mathrm{ \;^\circ C }
            processedContent = processedContent.replace(/\\mathrm\{\s*(?:\\;|\s)*\^\s*\{?\s*\\?circ\s*\}?\s*([A-Za-z])\s*\}/g, '^{\\circ}\\mathrm{$1}');
            // Unicode triangles
            processedContent = processedContent.replace(/▲/g, '\\blacktriangle').replace(/△/g, '\\triangle');
            processedContent = processedContent.replace(/\\times/g, ' \\times ');
            processedContent = processedContent.replace(/([a-zA-Z])([0-9])/g, '$1_{$2}');
            
            const rendered = katex.renderToString(processedContent, options);
            const containerClass = displayMode ? 'katex-display-fixed' : 'katex-inline-fixed';
            const originalAttr = ` data-original-text="${escapeHtml(processedContent)}"`;
            
            return displayMode 
                ? `<div class="${containerClass}"${originalAttr}>${rendered}</div>`
                : `<span class="${containerClass}"${originalAttr}>${rendered}</span>`;
                
        } catch (error) {
            console.warn('[MathFix] KaTeX rendering failed:', error.message);
            
            const escapedContent = escapeHtml(content);
            const errorTitle = `數學公式渲染失敗: ${error.message}`;
            const ariaLabel = escapeHtml(errorTitle);
            const containerTag = displayMode ? 'div' : 'span';
            const innerTag = displayMode ? 'pre' : 'span';
            const containerClass = displayMode ? 'katex-fallback katex-block math-error-block' : 'katex-fallback katex-inline math-error-inline';
            const dataAttr = ` data-katex-error="${escapeHtml(error.message)}" title="${ariaLabel}"`;

            return displayMode
                ? `
<${containerTag} class="${containerClass}"${dataAttr}><${innerTag} class="katex-fallback-source">${escapedContent}</${innerTag}></${containerTag}>
`
                : `<${containerTag} class="${containerClass}"${dataAttr}><${innerTag} class="katex-fallback-source">${escapedContent}</${innerTag}></${containerTag}>`;
        }
    }

    /**
     * 改進的 markdown 渲染，專門處理數學文字
     * @param {string} markdown - 輸入的 markdown
     * @param {Array} images - 圖片陣列
     * @returns {string} 渲染後的 HTML
     */
    function renderMathMarkdown(markdown, images = []) {
        if (!markdown) return '';

        // 1. 預處理文字
        let processed = fixMathTextDisplay(markdown);
        
        // 2. 處理圖片
        if (Array.isArray(images) && images.length > 0) {
            const imgMap = new Map();
            images.forEach((img, idx) => {
                if (img && img.data) {
                    const keys = [
                        img.name, img.id,
                        `img-${idx}.jpeg.png`,
                        `img-${idx + 1}.jpeg.png`
                    ].filter(Boolean);
                    
                    keys.forEach(k => {
                        imgMap.set(k, img.data.startsWith('data:') ? img.data : `data:image/png;base64,${img.data}`);
                        imgMap.set(`images/${k}`, imgMap.get(k));
                    });
                }
            });

            processed = processed.replace(/!\[([^\]]*)\]\((?:images\/)?(img-\d+\.jpeg\.png)\)/gi, (match, alt, fname) => {
                return imgMap.has(fname) 
                    ? `![${alt || ''}](${imgMap.get(fname)})`
                    : `<span class="missing-image">[圖片: ${alt || fname}]</span>`;
            });
        }

        // 3. 處理數學公式
        // 先處理塊級公式
        processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
            return renderMathImproved(content, true);
        });

        // 再處理行內公式
        processed = processed.replace(/\$([^$\n]+?)\$/g, (match, content) => {
            return renderMathImproved(content, false);
        });

        // 4. 使用 marked 處理其餘 markdown
        try {
            return marked.parse(processed, {
                breaks: false, // 重要：不要將換行轉換為 <br>
                gfm: true,
                sanitize: false
            });
        } catch (error) {
            console.error('[MathFix] Marked parsing failed:', error);
            return `<div class="markdown-error">Markdown 解析失敗: ${escapeHtml(error.message)}</div>`;
        }
    }

    /**
     * HTML 轉義函式
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * 修復已渲染的 DOM 中的數學顯示問題
     * @param {Element} container - 容器元素
     */
    function fixRenderedMath(container) {
        if (!container) return;

        // 查詢所有可能的數學公式元素
        const mathElements = container.querySelectorAll('.katex, .katex-display, .katex-inline, [class*="katex"]');
        
        mathElements.forEach(el => {
            // 確保數學公式有適當的間距
            if (el.classList.contains('katex-display') || el.classList.contains('katex-display-fixed')) {
                el.style.margin = '16px 0';
                el.style.textAlign = 'center';
                el.style.display = 'block';
            } else if (el.classList.contains('katex-inline') || el.classList.contains('katex-inline-fixed')) {
                el.style.margin = '0 2px';
                el.style.display = 'inline';
            }
        });

        // 修復段落中的數學公式換行問題
        const paragraphs = container.querySelectorAll('p');
        paragraphs.forEach(p => {
            // 移除數學公式前後不必要的換行
            const html = p.innerHTML;
            const fixed = html
                .replace(/\s*(<(?:span|div)[^>]*katex[^>]*>.*?<\/(?:span|div)>)\s*/g, ' $1 ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            
            if (fixed !== html) {
                p.innerHTML = fixed;
            }
        });
    }

    // 暴露公共介面
    global.MarkdownTextFix = {
        fixMathTextDisplay: fixMathTextDisplay,
        renderMathImproved: renderMathImproved,
        renderMathMarkdown: renderMathMarkdown,
        fixRenderedMath: fixRenderedMath,
        enhancedKatexOptions: enhancedKatexOptions
    };

    // 如果 MarkdownProcessor 存在，則擴充它
    if (global.MarkdownProcessor) {
        global.MarkdownProcessor.fixMathTextDisplay = fixMathTextDisplay;
        global.MarkdownProcessor.renderMathMarkdown = renderMathMarkdown;
        global.MarkdownProcessor.fixRenderedMath = fixRenderedMath;
    }

    // 如果 MarkdownProcessorEnhanced 存在，則擴充它
    if (global.MarkdownProcessorEnhanced) {
        global.MarkdownProcessorEnhanced.fixMathTextDisplay = fixMathTextDisplay;
        global.MarkdownProcessorEnhanced.renderMathMarkdown = renderMathMarkdown;
        global.MarkdownProcessorEnhanced.fixRenderedMath = fixRenderedMath;
    }

})(window);
