// js/processing/markdown_processor_integration.js
// AST 註釋系統整合輔助函式
// 提供平滑的遷移路徑：從 marked.Renderer 到 AST 註釋

(function(global) {
    'use strict';

    // Phase 3.5: 警告標誌位，避免流式更新時重複輸出
    let _rendererWarningShown = false;

    /**
     * 智慧渲染函式：自動選擇最佳渲染方式
     * @param {string} markdown - Markdown 文字
     * @param {Array} images - 圖片陣列
     * @param {Array|Object} annotationsOrRenderer - 註釋陣列或自定義渲染器
     * @param {string} contentIdentifier - 內容識別符號
     * @returns {string} HTML
     */
    function smartRender(markdown, images, annotationsOrRenderer, contentIdentifier) {
        // 檢測是否使用 AST 處理器
        const useAST = global.MarkdownProcessorAST && global.MarkdownProcessorAST.render;

        if (!useAST) {
            // 降級到舊版
            return global.MarkdownProcessor.renderWithKatexFailback(
                global.MarkdownProcessor.safeMarkdown(markdown, images),
                annotationsOrRenderer  // 作為 customRenderer
            );
        }

        // 檢測傳入的是註釋陣列還是 Renderer
        const isAnnotationArray = Array.isArray(annotationsOrRenderer);
        const isRenderer = annotationsOrRenderer && typeof annotationsOrRenderer.heading === 'function';

        if (isAnnotationArray && annotationsOrRenderer.length > 0) {
            // 使用 AST 註釋外掛
            console.log('[Integration] 使用 AST 註釋外掛 -', annotationsOrRenderer.length, '個註釋');
            return global.MarkdownProcessorAST.renderWithAnnotations(
                markdown,
                images,
                annotationsOrRenderer,
                contentIdentifier
            );
        } else if (isRenderer) {
            // 傳入了 marked.Renderer（舊版方式）
            // 在 AST 模式下，renderer 會被忽略，應該使用後處理方式
            // Phase 3.5: 只輸出一次警告，避免流式更新時刷屏
            if (!_rendererWarningShown) {
                console.warn('[Integration] 檢測到 marked.Renderer，但 AST 模式不支援。請使用後處理或遷移到註釋陣列。');
                _rendererWarningShown = true;
            }
            return global.MarkdownProcessorAST.render(markdown, images);
        } else {
            // 沒有註釋或空陣列
            return global.MarkdownProcessorAST.render(markdown, images);
        }
    }

    /**
     * 相容舊版 API：替代 createCustomMarkdownRenderer
     *
     * 用法：
     * // 舊版（不再工作）
     * const renderer = createCustomMarkdownRenderer(annotations, 'ocr', ...);
     * marked(md, { renderer });
     *
     * // 新版（AST）
     * const config = createAnnotationConfig(annotations, 'ocr');
     * smartRender(md, images, config.annotations, config.identifier);
     */
    function createAnnotationConfig(annotations, contentIdentifier) {
        return {
            annotations: annotations || [],
            identifier: contentIdentifier || 'default',

            // 相容介面：提供渲染函式
            render: function(markdown, images) {
                return smartRender(markdown, images, this.annotations, this.identifier);
            }
        };
    }

    /**
     * 批次渲染 tokens（用於增量渲染）
     * @param {Array} tokens - marked.lexer() 的 tokens
     * @param {Array} images - 圖片陣列
     * @param {Array} annotations - 註釋陣列
     * @param {string} contentIdentifier - 內容識別符號
     * @returns {Array} HTML 字串陣列
     */
    function renderTokens(tokens, images, annotations, contentIdentifier) {
        return tokens.map(token => {
            const markdown = token.raw || '';
            return smartRender(markdown, images, annotations, contentIdentifier);
        });
    }

    /**
     * 檢測當前使用的渲染架構
     */
    function getActiveArchitecture() {
        if (global.MarkdownProcessorAST && global.MarkdownProcessor === global.MarkdownProcessorAST) {
            return 'AST';
        } else if (global.MarkdownProcessorEnhanced) {
            return 'Enhanced';
        } else {
            return 'Legacy';
        }
    }

    /**
     * 效能指標
     */
    function getMetrics() {
        const arch = getActiveArchitecture();
        const base = {
            architecture: arch,
            timestamp: Date.now()
        };

        if (arch === 'AST' && global.MarkdownProcessorAST.getMetrics) {
            return {
                ...base,
                ...global.MarkdownProcessorAST.getMetrics()
            };
        }

        return base;
    }

    // 匯出 API
    global.MarkdownIntegration = {
        // 核心函式
        smartRender: smartRender,
        createAnnotationConfig: createAnnotationConfig,
        renderTokens: renderTokens,

        // 工具函式
        getActiveArchitecture: getActiveArchitecture,
        getMetrics: getMetrics,

        // 版本資訊
        version: '1.0.0',
        description: 'Integration layer between marked.Renderer and AST annotations'
    };

    console.log('[MarkdownIntegration] 整合層已載入，當前架構:', getActiveArchitecture());

})(window);
