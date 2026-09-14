// js/processing/reference-extractor.js
// 參考文獻資訊提取器 - 使用正規表示式提取文獻後設資料

(function(global) {
    'use strict';

    /**
     * DOI 正規表示式
     */
    const DOI_PATTERNS = [
        /\b(doi:|DOI:)\s*(10\.\d{4,}\/[^\s]+)/i,
        /\bhttps?:\/\/doi\.org\/(10\.\d{4,}\/[^\s]+)/i,
        /\b(10\.\d{4,}\/[^\s,\.]+)/
    ];

    /**
     * URL 正規表示式
     */
    const URL_PATTERN = /https?:\/\/[^\s,)]+/g;

    /**
     * 年份正規表示式
     */
    const YEAR_PATTERNS = [
        /\((\d{4})\)/,           // (2023)
        /\b(\d{4})\b/,           // 2023
        /,\s*(\d{4})/            // , 2023
    ];

    /**
     * 作者名正規表示式
     */
    const AUTHOR_PATTERNS = [
        // 姓, 名首字母. 格式
        /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]\.(?:\s*[A-Z]\.)*)/,
        // 名首字母. 姓 格式
        /^([A-Z]\.\s*)+([A-Z][a-z]+)/,
        // 姓 名 格式
        /^([A-Z][a-z]+)\s+([A-Z][a-z]+)/
    ];

    /**
     * 期刊/會議資訊正規表示式
     */
    const JOURNAL_PATTERNS = [
        /\b([A-Z][^\.,]{5,})\s*,?\s*(Vol\.|vol\.|Volume)\s*\d+/i,
        /\b(Proceedings?\s+of\s+[^,\.]+)/i,
        /\bIn:?\s*([^,\.]{10,})/i,
        /\b([A-Z][A-Za-z\s&]{10,})\s*\d{4}/
    ];

    /**
     * 卷號、期號、頁碼正規表示式
     */
    const VOLUME_PATTERN = /\b(?:Vol\.|vol\.|Volume|v\.)\s*(\d+)/i;
    const ISSUE_PATTERN = /\b(?:No\.|no\.|Issue|Iss\.)\s*(\d+)/i;
    const PAGES_PATTERN = /\b(?:pp\.|pages?)\s*(\d+(?:\s*[-–]\s*\d+)?)/i;

    /**
     * 提取 DOI
     */
    function extractDOI(text) {
        for (const pattern of DOI_PATTERNS) {
            const match = text.match(pattern);
            if (match) {
                // 返回 DOI，去除字首
                return match[match.length - 1].replace(/[,.\s]+$/, '');
            }
        }
        return null;
    }

    /**
     * 提取 URL
     */
    function extractURLs(text) {
        const urls = text.match(URL_PATTERN);
        return urls ? urls.map(url => url.replace(/[,.)]+$/, '')) : [];
    }

    /**
     * 提取年份
     */
    function extractYear(text) {
        for (const pattern of YEAR_PATTERNS) {
            const match = text.match(pattern);
            if (match) {
                const year = parseInt(match[1]);
                // 驗證年份合理性（1900-2100）
                if (year >= 1900 && year <= 2100) {
                    return year;
                }
            }
        }
        return null;
    }

    /**
     * 提取作者
     */
    function extractAuthors(text) {
        const authors = [];

        // 移除編號字首
        let cleanText = text.replace(/^\[\d+\]\s*/, '').replace(/^\d+\.\s*/, '');

        // 按 'and' 或 '&' 分割作者
        const authorParts = cleanText.split(/\s+(?:and|&)\s+/i);

        for (const part of authorParts) {
            // 嘗試比對各種作者格式
            for (const pattern of AUTHOR_PATTERNS) {
                const match = part.trim().match(pattern);
                if (match) {
                    authors.push(match[0].trim());
                    break;
                }
            }

            // 如果已經找到作者，停止查詢（通常作者在開頭）
            if (authors.length > 0) break;
        }

        return authors;
    }

    /**
     * 提取標題
     * 標題通常在作者之後，年份或期刊之前
     */
    function extractTitle(text) {
        // 移除編號
        let cleanText = text.replace(/^\[\d+\]\s*/, '').replace(/^\d+\.\s*/, '');

        // 嘗試提取引號中的標題
        const quotedMatch = cleanText.match(/"([^"]+)"/);
        if (quotedMatch) {
            return quotedMatch[1].trim();
        }

        // 嘗試提取年份之前的部分
        const yearMatch = cleanText.match(/^(.+?)\s*\(\d{4}\)/);
        if (yearMatch) {
            // 移除作者部分
            let title = yearMatch[1];
            title = title.replace(/^[A-Z][a-z]+(?:\s+[A-Z]\.)*,?\s*/, '');
            return title.trim().replace(/^\.\s*/, '');
        }

        // 嘗試提取句號分隔的第二部分（通常是標題）
        const parts = cleanText.split(/\.\s+/);
        if (parts.length >= 2) {
            return parts[1].trim();
        }

        return null;
    }

    /**
     * 提取期刊/會議資訊
     */
    function extractJournal(text) {
        for (const pattern of JOURNAL_PATTERNS) {
            const match = text.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }

    /**
     * 提取卷號
     */
    function extractVolume(text) {
        const match = text.match(VOLUME_PATTERN);
        return match ? match[1] : null;
    }

    /**
     * 提取期號
     */
    function extractIssue(text) {
        const match = text.match(ISSUE_PATTERN);
        return match ? match[1] : null;
    }

    /**
     * 提取頁碼
     */
    function extractPages(text) {
        const match = text.match(PAGES_PATTERN);
        return match ? match[1].replace(/\s+/g, '') : null;
    }

    /**
     * 完整提取文獻資訊
     * @param {string} referenceText - 文獻條目文字
     * @returns {Object} 提取的文獻資訊
     */
    function extractReferenceInfo(referenceText) {
        if (!referenceText || typeof referenceText !== 'string') {
            return null;
        }

        const info = {
            rawText: referenceText,
            doi: extractDOI(referenceText),
            urls: extractURLs(referenceText),
            year: extractYear(referenceText),
            authors: extractAuthors(referenceText),
            title: extractTitle(referenceText),
            journal: extractJournal(referenceText),
            volume: extractVolume(referenceText),
            issue: extractIssue(referenceText),
            pages: extractPages(referenceText),
            extractedBy: 'regex',
            confidence: 0
        };

        // 計算提取置信度
        info.confidence = calculateConfidence(info);

        return info;
    }

    /**
     * 計算提取置信度（0-1）
     */
    function calculateConfidence(info) {
        let score = 0;
        let maxScore = 0;

        // DOI 權重最高
        if (info.doi) score += 3;
        maxScore += 3;

        // 年份
        if (info.year) score += 2;
        maxScore += 2;

        // 作者
        if (info.authors && info.authors.length > 0) score += 2;
        maxScore += 2;

        // 標題
        if (info.title) score += 2;
        maxScore += 2;

        // 期刊
        if (info.journal) score += 1;
        maxScore += 1;

        return maxScore > 0 ? score / maxScore : 0;
    }

    /**
     * 批次提取文獻資訊
     * @param {Array} entries - 文獻條目陣列
     * @returns {Array} 提取的文獻資訊陣列
     */
    function batchExtract(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }

        return entries.map(entry => {
            const text = entry.rawText || entry;
            const extracted = extractReferenceInfo(text);

            return {
                ...entry,
                ...extracted,
                needsAIProcessing: extracted.confidence < 0.5 // 置信度低於50%需要AI處理
            };
        });
    }

    /**
     * 生成文獻標籤
     */
    function generateTags(info) {
        const tags = [];

        // 基於年份的標籤
        if (info.year) {
            const currentYear = new Date().getFullYear();
            if (info.year >= currentYear - 2) tags.push('Recent');
            if (info.year < 2000) tags.push('Classic');
        }

        // 基於型別的標籤
        if (info.journal) {
            if (/proceedings?/i.test(info.journal)) {
                tags.push('Conference');
            } else if (/journal|review/i.test(info.journal)) {
                tags.push('Journal');
            }
        }

        // 基於DOI的標籤
        if (info.doi) {
            tags.push('Verified');
        }

        return tags;
    }

    // 匯出API
    global.ReferenceExtractor = {
        extractReferenceInfo,
        batchExtract,
        extractDOI,
        extractURLs,
        extractYear,
        extractAuthors,
        extractTitle,
        extractJournal,
        extractVolume,
        extractIssue,
        extractPages,
        calculateConfidence,
        generateTags,
        version: '1.0.0'
    };

    console.log('[ReferenceExtractor] Reference extractor loaded.');

})(window);



