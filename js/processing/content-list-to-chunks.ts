// js/processing/content-list-to-chunks.js
// 將 MinerU contentList 轉換為 chunks 格式

(function(global) {
    'use strict';

    /**
     * 從 contentList 生成 chunks
     * @param {Array} contentListJson - MinerU content_list.json 資料
     * @param {Array} translatedContentList - 翻譯後的內容列表
     * @param {number} maxTokensPerChunk - 每個chunk的最大token數（預設2000）
     * @returns {Object} { ocrChunks: Array<string>, translatedChunks: Array<string> }
     */
    function generateChunksFromContentList(contentListJson, translatedContentList, maxTokensPerChunk = 2000) {
        if (!contentListJson || !Array.isArray(contentListJson)) {
            console.warn('[ContentListToChunks] Invalid contentListJson');
            return { ocrChunks: [], translatedChunks: [] };
        }

        // 按頁面分組
        const pageGroups = groupByPage(contentListJson);
        const translatedPageGroups = groupByPage(translatedContentList || []);

        const ocrChunks = [];
        const translatedChunks = [];

        // 走訪每一頁
        Object.keys(pageGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(pageIdx => {
            const pageItems = pageGroups[pageIdx];
            const translatedPageItems = translatedPageGroups[pageIdx] || [];

            // 將頁面內容按token限制分塊
            const pageChunks = chunkPageContent(pageItems, translatedPageItems, maxTokensPerChunk);

            ocrChunks.push(...pageChunks.ocrChunks);
            translatedChunks.push(...pageChunks.translatedChunks);
        });

        console.log(`[ContentListToChunks] 生成了 ${ocrChunks.length} 個chunks`);

        return {
            ocrChunks,
            translatedChunks
        };
    }

    /**
     * 按頁面分組
     */
    function groupByPage(contentList) {
        const groups = {};

        contentList.forEach(item => {
            const pageIdx = item.page_idx !== undefined ? item.page_idx : 0;
            if (!groups[pageIdx]) {
                groups[pageIdx] = [];
            }
            groups[pageIdx].push(item);
        });

        return groups;
    }

    /**
     * 將單頁內容分塊
     */
    function chunkPageContent(ocrItems, translatedItems, maxTokens) {
        const ocrChunks = [];
        const translatedChunks = [];

        // 按型別分組（text, image, table等）
        const sections = groupBySection(ocrItems);
        const translatedSections = groupBySection(translatedItems);

        let currentOcrChunk = [];
        let currentTranslatedChunk = [];
        let currentTokens = 0;

        sections.forEach((section, idx) => {
            const translatedSection = translatedSections[idx] || section;

            // 提取文字內容
            const ocrText = extractTextFromSection(section);
            const translatedText = extractTextFromSection(translatedSection);

            // 估算token數
            const tokens = estimateTokens(ocrText);

            // 如果當前塊加上這個section會超過限制，先儲存當前塊
            if (currentTokens + tokens > maxTokens && currentOcrChunk.length > 0) {
                ocrChunks.push(currentOcrChunk.join('\n\n'));
                translatedChunks.push(currentTranslatedChunk.join('\n\n'));
                currentOcrChunk = [];
                currentTranslatedChunk = [];
                currentTokens = 0;
            }

            // 新增到當前塊
            if (ocrText) {
                currentOcrChunk.push(ocrText);
                currentTranslatedChunk.push(translatedText || ocrText);
                currentTokens += tokens;
            }
        });

        // 儲存最後一個塊
        if (currentOcrChunk.length > 0) {
            ocrChunks.push(currentOcrChunk.join('\n\n'));
            translatedChunks.push(currentTranslatedChunk.join('\n\n'));
        }

        return { ocrChunks, translatedChunks };
    }

    /**
     * 按section分組（相鄰的相同型別元素合併）
     */
    function groupBySection(items) {
        const sections = [];
        let currentSection = [];
        let lastType = null;

        items.forEach(item => {
            const type = item.type || 'text';

            // 如果型別改變，開始新section
            if (type !== lastType && currentSection.length > 0) {
                sections.push(currentSection);
                currentSection = [];
            }

            currentSection.push(item);
            lastType = type;
        });

        if (currentSection.length > 0) {
            sections.push(currentSection);
        }

        return sections;
    }

    /**
     * 從section提取文字
     */
    function extractTextFromSection(section) {
        if (!section || !Array.isArray(section)) {
            return '';
        }

        const texts = section.map(item => {
            if (item.type === 'text' || !item.type) {
                return item.text || item.content || '';
            } else if (item.type === 'title') {
                const level = item.level || 1;
                const prefix = '#'.repeat(Math.min(level, 6));
                return `${prefix} ${item.text || item.content || ''}`;
            } else if (item.type === 'table') {
                // 表格內容
                return item.text || item.markdown || item.content || '';
            } else if (item.type === 'image') {
                // 圖片描述
                return item.caption || item.text || '';
            }
            return item.text || item.content || '';
        });

        return texts.filter(Boolean).join('\n\n');
    }

    /**
     * 估算token數
     */
    function estimateTokens(text) {
        if (typeof global.estimateTokenCount === 'function') {
            return global.estimateTokenCount(text);
        }
        // 簡單估算：中文按2字元/token，英文按4字元/token
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const totalChars = text.length;
        const englishChars = totalChars - chineseChars;
        return Math.ceil(chineseChars / 2 + englishChars / 4);
    }

    /**
     * 從完整的OCR和翻譯文字生成chunks（備用方法）
     */
    function generateChunksFromFullText(ocrText, translatedText, maxTokensPerChunk = 2000) {
        const estimator = typeof global.estimateTokenCount === 'function'
            ? global.estimateTokenCount
            : (t) => Math.ceil(t.length / 4);

        const splitter = typeof global.splitMarkdownIntoChunks === 'function'
            ? global.splitMarkdownIntoChunks
            : simpleSplit;

        const ocrChunks = splitter(ocrText, maxTokensPerChunk, '[GenerateChunks OCR]');
        const translatedChunks = translatedText
            ? splitter(translatedText, maxTokensPerChunk, '[GenerateChunks Translation]')
            : ocrChunks.map(() => '');

        return { ocrChunks, translatedChunks };
    }

    /**
     * 簡單分割（備用）
     */
    function simpleSplit(text, tokenLimit, logContext) {
        const lines = text.split('\n');
        const chunks = [];
        let currentChunk = [];
        let currentTokens = 0;

        lines.forEach(line => {
            const lineTokens = Math.ceil(line.length / 4);

            if (currentTokens + lineTokens > tokenLimit && currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentTokens = 0;
            }

            currentChunk.push(line);
            currentTokens += lineTokens;
        });

        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'));
        }

        return chunks;
    }

    // 匯出到全域
    global.generateChunksFromContentList = generateChunksFromContentList;
    global.generateChunksFromFullText = generateChunksFromFullText;

    console.log('[ContentListToChunks] Content list to chunks converter loaded.');

})(window);



