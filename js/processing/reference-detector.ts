// js/processing/reference-detector.js
// 參考文獻識別器 - 自動識別文件中的參考文獻部分

(function(global) {
    'use strict';

    /**
     * 參考文獻部分的常見標題（多語言支援）
     */
    const REFERENCE_SECTION_PATTERNS = [
        // 英文
        /^#{1,3}\s*References?\s*$/im,
        /^#{1,3}\s*Bibliography\s*$/im,
        /^#{1,3}\s*Works?\s+Cited\s*$/im,
        /^#{1,3}\s*Literature\s+Cited\s*$/im,
        /^#{1,3}\s*Citations?\s*$/im,
        // 中文
        /^#{1,3}\s*參考文獻\s*$/im,
        /^#{1,3}\s*參考文獻\s*$/im,
        /^#{1,3}\s*文獻參考\s*$/im,
        /^#{1,3}\s*參考資料\s*$/im,
        // 其他語言
        /^#{1,3}\s*Références?\s*$/im,  // 法語
        /^#{1,3}\s*Referenzen\s*$/im,   // 德語
        /^#{1,3}\s*Referencias\s*$/im,  // 西班牙語
        /^#{1,3}\s*參考文獻\s*$/im,     // 日語
        // 純文字格式（無Markdown標記）
        /^References?\s*$/im,
        /^Bibliography\s*$/im,
        /^參考文獻\s*$/im
    ];

    /**
     * 檢測文字是否為參考文獻部分的標題
     */
    function isReferenceSectionTitle(line) {
        return REFERENCE_SECTION_PATTERNS.some(pattern => pattern.test(line.trim()));
    }

    /**
     * 檢測一行文字是否可能是參考文獻條目
     * 常見格式：
     * - [1] Author. Title. Journal, Year.
     * - 1. Author. Title. Journal, Year.
     * - Author. (Year). Title. Journal.
     */
    function isLikelyReferenceEntry(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 20) return false;

        // 檢測編號格式
        const numberPatterns = [
            /^\[\d+\]/,           // [1]
            /^\d+\./,             // 1.
            /^\(\d+\)/,           // (1)
            /^\d+\)\s/,           // 1)
            /^\[\d+\]/            // [1]
        ];

        const hasNumbering = numberPatterns.some(p => p.test(trimmed));

        // 檢測年份（常見的年份格式）
        const hasYear = /\b(19|20)\d{2}\b/.test(trimmed);

        // 檢測DOI
        const hasDOI = /\b(doi:|DOI:)\s*10\.\d+/.test(trimmed);

        // 檢測常見的期刊識別符號
        const hasJournalMarkers = /\b(Vol\.|vol\.|Volume|Issue|pp\.|pages?)\b/i.test(trimmed);

        // 檢測作者名格式（姓, 名. 或 姓 名首字母.）
        const hasAuthorFormat = /[A-Z][a-z]+,\s*[A-Z]\./.test(trimmed) ||
                               /[A-Z][a-z]+\s+[A-Z]\./.test(trimmed);

        // 綜合判斷
        const score =
            (hasNumbering ? 2 : 0) +
            (hasYear ? 1 : 0) +
            (hasDOI ? 2 : 0) +
            (hasJournalMarkers ? 1 : 0) +
            (hasAuthorFormat ? 1 : 0);

        return score >= 2;
    }

    /**
     * 在文件中查詢參考文獻部分
     * @param {string} markdown - Markdown文字
     * @returns {Object|null} { startLine, endLine, title, content, entries }
     */
    function detectReferenceSection(markdown) {
        if (!markdown || typeof markdown !== 'string') {
            return null;
        }

        const lines = markdown.split('\n');
        let referenceSectionStart = -1;
        let referenceSectionTitle = '';

        // 1. 查詢參考文獻標題
        for (let i = 0; i < lines.length; i++) {
            if (isReferenceSectionTitle(lines[i])) {
                referenceSectionStart = i;
                referenceSectionTitle = lines[i].trim();
                break;
            }
        }

        // 如果沒找到明確的標題，嘗試透過連續的文獻條目判斷
        if (referenceSectionStart === -1) {
            let consecutiveReferences = 0;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (isLikelyReferenceEntry(lines[i])) {
                    consecutiveReferences++;
                    if (consecutiveReferences >= 5) { // 至少5個連續的條目
                        referenceSectionStart = i;
                        referenceSectionTitle = 'References (auto-detected)';
                    }
                } else if (lines[i].trim() === '') {
                    continue; // 允許空行
                } else {
                    consecutiveReferences = 0;
                }
            }
        }

        if (referenceSectionStart === -1) {
            return null;
        }

        // 2. 確定參考文獻部分的結束位置
        let referenceSectionEnd = lines.length - 1;

        // 查詢下一個同級或更高階的標題
        const titleLevel = (referenceSectionTitle.match(/^#+/) || ['#'])[0].length;
        for (let i = referenceSectionStart + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(/^(#+)\s/);
            if (match && match[1].length <= titleLevel && !isReferenceSectionTitle(line)) {
                referenceSectionEnd = i - 1;
                break;
            }
        }

        // 3. 提取參考文獻內容
        const content = lines.slice(referenceSectionStart + 1, referenceSectionEnd + 1).join('\n');

        // 4. 解析各個文獻條目
        const entries = parseReferenceEntries(content);

        return {
            startLine: referenceSectionStart,
            endLine: referenceSectionEnd,
            title: referenceSectionTitle,
            content: content.trim(),
            entries: entries,
            totalCount: entries.length
        };
    }

    /**
     * 解析參考文獻條目
     * @param {string} content - 參考文獻部分的內容
     * @returns {Array} 文獻條目陣列
     */
    function parseReferenceEntries(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }

        const entries = [];
        const lines = content.split('\n');
        let currentLines = [];
        let lineStartIndex = 0;

        // 檢測是否是新條目的開始（必須有明確的編號）
        const isNewEntryStart = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;

            // 必須以編號開頭，且緊跟著是空格或內容
            const numberPatterns = [
                /^\[\d+\]\s+/,           // [1]
                /^\d+\.\s+/,             // 1.
                /^\(\d+\)\s+/,           // (1)
                /^\d+\)\s+/              // 1)
            ];

            return numberPatterns.some(p => p.test(trimmed));
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 空行：只在已有內容且下一行不是繼續時才結束當前條目
            if (line === '') {
                // 檢查下一個非空行是否是新條目
                let nextNonEmptyLine = null;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim()) {
                        nextNonEmptyLine = lines[j];
                        break;
                    }
                }

                // 如果下一個非空行是新條目，則儲存當前條目
                if (currentLines.length > 0 && nextNonEmptyLine && isNewEntryStart(nextNonEmptyLine)) {
                    const entryText = currentLines.join(' ');
                    if (entryText.trim()) {
                        entries.push({
                            index: entries.length,
                            rawText: entryText.trim(),
                            lineStart: lineStartIndex,
                            lineEnd: i - 1
                        });
                    }
                    currentLines = [];
                }
                continue;
            }

            // 檢測新條目的開始（必須有明確的編號）
            if (isNewEntryStart(line)) {
                // 儲存之前的條目
                if (currentLines.length > 0) {
                    const entryText = currentLines.join(' ');
                    if (entryText.trim()) {
                        entries.push({
                            index: entries.length,
                            rawText: entryText.trim(),
                            lineStart: lineStartIndex,
                            lineEnd: i - 1
                        });
                    }
                }
                // 開始新條目
                currentLines = [line];
                lineStartIndex = i;
            } else {
                // 繼續當前條目（換行內容）
                if (currentLines.length === 0) {
                    // 如果還沒有開始條目，嘗試作為新條目開始
                    if (isLikelyReferenceEntry(line)) {
                        currentLines = [line];
                        lineStartIndex = i;
                    }
                } else {
                    // 新增到當前條目
                    currentLines.push(line);
                }
            }
        }

        // 處理最後一個條目
        if (currentLines.length > 0) {
            const entryText = currentLines.join(' ');
            if (entryText.trim()) {
                entries.push({
                    index: entries.length,
                    rawText: entryText.trim(),
                    lineStart: lineStartIndex,
                    lineEnd: lines.length - 1
                });
            }
        }

        return entries;
    }

    /**
     * 統計文獻格式分佈
     */
    function analyzeReferenceFormats(entries) {
        const formats = {
            numbered: 0,        // [1] 或 1.
            apa: 0,            // Author. (Year).
            mla: 0,            // Author. "Title."
            chicago: 0,        // Author. Title.
            ieee: 0,           // [1] Author, "Title,"
            unknown: 0
        };

        entries.forEach(entry => {
            const text = entry.rawText;

            if (/^\[\d+\]/.test(text) || /^\d+\./.test(text)) {
                formats.numbered++;
                if (/^\[\d+\]\s+[A-Z]/.test(text)) {
                    formats.ieee++;
                }
            } else if (/^[A-Z][a-z]+.*\(\d{4}\)/.test(text)) {
                formats.apa++;
            } else if (/^[A-Z][a-z]+.*".*"/.test(text)) {
                formats.mla++;
            } else if (/^[A-Z][a-z]+.*\..*\d{4}/.test(text)) {
                formats.chicago++;
            } else {
                formats.unknown++;
            }
        });

        return formats;
    }

    /**
     * 獲取推薦的參考格式
     */
    function getRecommendedFormat(entries) {
        const formats = analyzeReferenceFormats(entries);
        const sorted = Object.entries(formats)
            .filter(([key]) => key !== 'unknown')
            .sort((a, b) => b[1] - a[1]);

        return sorted.length > 0 ? sorted[0][0] : 'unknown';
    }

    // 匯出API
    global.ReferenceDetector = {
        detectReferenceSection,
        parseReferenceEntries,
        isReferenceSectionTitle,
        isLikelyReferenceEntry,
        analyzeReferenceFormats,
        getRecommendedFormat,
        version: '1.0.0'
    };

    console.log('[ReferenceDetector] Reference detector loaded.');

})(window);



