// js/processing/annotation_plugin_ast.js
// AST-based annotation plugin for markdown-it
// 基於 AST 的註釋外掛，比字串替換更精準、更高效

(function(global) {
    'use strict';

    /**
     * 建立 AST 註釋外掛
     * @param {Array} annotations - 註釋陣列 [{text, id, ...}, ...]
     * @param {Object} options - 配置選項
     * @returns {Function} markdown-it 外掛函式
     */
    function createAnnotationPlugin(annotations, options = {}) {
        const config = {
            debug: false,
            contentIdentifier: 'default',
            skipCodeBlocks: true,
            skipMathBlocks: true,
            ...options
        };

        // 構建註釋索引（最佳化效能）
        const annotationMap = new Map();
        if (Array.isArray(annotations)) {
            annotations.forEach(ann => {
                if (ann && ann.text) {
                    const key = ann.text.toLowerCase();
                    if (!annotationMap.has(key)) {
                        annotationMap.set(key, []);
                    }
                    annotationMap.get(key).push(ann);
                }
            });
        }

        return function annotationPluginImpl(md) {
            if (config.debug) {
                console.log('[AnnotationPluginAST] Loaded with', annotationMap.size, 'annotations');
            }

            // 在 inline 處理後注入註釋
            md.core.ruler.after('inline', 'annotations', function(state) {
                if (annotationMap.size === 0) {
                    return; // 沒有註釋，跳過
                }

                const tokens = state.tokens;

                for (let i = 0; i < tokens.length; i++) {
                    const token = tokens[i];

                    // 只處理包含 inline 內容的 token
                    if (token.type === 'inline' && token.children) {
                        processInlineTokens(token.children, config);
                    }
                }
            });
        };

        /**
         * 處理 inline tokens
         */
        function processInlineTokens(children, config) {
            const newChildren = [];

            for (let i = 0; i < children.length; i++) {
                const child = children[i];

                // 只處理文位元組點
                if (child.type === 'text') {
                    // 檢查上下文
                    const context = getTokenContext(children, i);

                    if (shouldSkipToken(child, context, config)) {
                        newChildren.push(child);
                        continue;
                    }

                    // 嘗試注入註釋
                    const annotatedTokens = injectAnnotations(child, config);
                    newChildren.push(...annotatedTokens);
                } else {
                    newChildren.push(child);
                }
            }

            // 替換原始 children
            children.length = 0;
            children.push(...newChildren);
        }

        /**
         * 獲取 token 的上下文資訊
         */
        function getTokenContext(siblings, index) {
            const context = {
                inCode: false,
                inMath: false,
                prevToken: index > 0 ? siblings[index - 1] : null,
                nextToken: index < siblings.length - 1 ? siblings[index + 1] : null
            };

            // 檢查是否在程式碼中
            if (context.prevToken) {
                if (context.prevToken.type === 'code_inline' ||
                    context.prevToken.markup === '`') {
                    context.inCode = true;
                }
            }

            // 檢查是否在公式中
            if (context.prevToken && context.prevToken.type === 'math_inline') {
                context.inMath = true;
            }

            return context;
        }

        /**
         * 判斷是否應該跳過該 token
         */
        function shouldSkipToken(token, context, config) {
            // 跳過空文字
            if (!token.content || !token.content.trim()) {
                return true;
            }

            // 跳過程式碼塊
            if (config.skipCodeBlocks && context.inCode) {
                return true;
            }

            // 跳過公式
            if (config.skipMathBlocks && context.inMath) {
                return true;
            }

            // 跳過純數字/標點
            if (/^[\d\s\.,;:!?\-()]+$/.test(token.content)) {
                return true;
            }

            return false;
        }

        /**
         * 在文字 token 中注入註釋
         * @returns {Array} 拆分後的 token 陣列
         */
        function injectAnnotations(textToken, config) {
            const text = textToken.content;
            const matches = [];

            // 查詢所有比對的註釋
            annotationMap.forEach((anns, key) => {
                anns.forEach(ann => {
                    const searchText = ann.text;
                    let index = 0;

                    while ((index = text.indexOf(searchText, index)) !== -1) {
                        matches.push({
                            start: index,
                            end: index + searchText.length,
                            annotation: ann,
                            text: searchText
                        });
                        index += searchText.length;
                    }
                });
            });

            // 如果沒有比對，返回原 token
            if (matches.length === 0) {
                return [textToken];
            }

            // 按位置排序並去重
            matches.sort((a, b) => a.start - b.start);
            const dedupedMatches = deduplicateMatches(matches);

            // 拆分 token
            return splitTokenWithAnnotations(textToken, dedupedMatches, config);
        }

        /**
         * 去除重疊的註釋比對
         */
        function deduplicateMatches(matches) {
            const result = [];
            let lastEnd = -1;

            for (const match of matches) {
                if (match.start >= lastEnd) {
                    result.push(match);
                    lastEnd = match.end;
                }
            }

            return result;
        }

        /**
         * 拆分 token 並插入註釋標記
         */
        function splitTokenWithAnnotations(textToken, matches, config) {
            const result = [];
            let lastIndex = 0;
            const text = textToken.content;

            matches.forEach(match => {
                // 新增註釋前的文字
                if (match.start > lastIndex) {
                    const beforeToken = createTextToken(text.substring(lastIndex, match.start));
                    result.push(beforeToken);
                }

                // 新增註釋標記的 HTML token
                const annToken = createAnnotationToken(match.text, match.annotation, config);
                result.push(annToken);

                lastIndex = match.end;
            });

            // 新增最後的文字
            if (lastIndex < text.length) {
                const afterToken = createTextToken(text.substring(lastIndex));
                result.push(afterToken);
            }

            return result;
        }

        /**
         * 建立文字 token
         */
        function createTextToken(content) {
            return {
                type: 'text',
                content: content,
                level: 0
            };
        }

        /**
         * 建立註釋 HTML token
         */
        function createAnnotationToken(text, annotation, config) {
            // 轉義 HTML
            const escapedText = escapeHtml(text);

            // 構建屬性
            const attrs = {
                'data-annotation-text': escapedText,
                'data-content-id': config.contentIdentifier,
                'class': 'annotation-highlight'
            };

            if (annotation.id) {
                attrs['data-annotation-id'] = annotation.id;
            }

            // 構建 HTML
            const attrString = Object.entries(attrs)
                .map(([key, val]) => `${key}="${escapeHtml(String(val))}"`)
                .join(' ');

            const html = `<span ${attrString}>${escapedText}</span>`;

            return {
                type: 'html_inline',
                content: html,
                level: 0
            };
        }

        /**
         * HTML 轉義
         */
        function escapeHtml(text) {
            const htmlEscapes = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return String(text).replace(/[&<>"']/g, (match) => htmlEscapes[match]);
        }
    }

    // 匯出到全域
    global.createAnnotationPluginAST = createAnnotationPlugin;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = createAnnotationPlugin;
    }

})(window);
