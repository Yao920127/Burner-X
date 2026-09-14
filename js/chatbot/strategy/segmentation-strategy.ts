// js/chatbot/segmentation-strategy.js
// 該檔案實現了基於目錄 (ToC) 的文件分段、處理和檢索策略，
// 以增強聊天機器人的問答能力。

/**
 * 從文件中解析目錄。
 *
 * @param {string | Object} tocInput - 原始目錄資訊，可以是純文字或結構化物件。
 * @returns {Object} 結構化的目錄物件 (例如樹形結構)。
 *                   示例: { title: "第一章", level: 1, children: [], startLine: 10, endLine: 50 }
 */
function parseTableOfContents(tocInput) {
    // TODO: 實現目錄解析邏輯。
    // 可能涉及對純文字的正規表示式處理，或對結構化輸入的直接處理。
    console.log('[segmentation-strategy] 正在解析目錄來源:', tocInput);
    // 佔位符實現
    return {
        title: "文件根節點",
        level: 0,
        children: [],
        // 子節點示例:
        // { title: "第一節", level: 1, children: [
        //     { title: "1.1 小節", level: 2, children: [], rawTextStartMarker: "1.1 小節文字起始處" }
        //   ],
        //   rawTextStartMarker: "第一節文字起始處" // 指示該節文字開始位置的唯一字串或行號
        // }
    };
}

/**
 * 根據結構化的目錄對文件文字進行分段。
 *
 * @param {string} fullDocumentText - 文件的完整文字內容 (例如 Markdown)。
 * @param {Object} structuredToC -由 parseTableOfContents 返回的目錄物件。
 * @returns {Array<Object>} 一個包含目錄章節的陣列，每個章節包含其文字和進一步分段的自然段落。
 *                          示例: [
 *                              {
 *                                  tocTitle: "1.1 小節",
 *                                  tocLevel: 2,
 *                                  rawSectionText: "1.1 小節的文字內容...",
 *                                  naturalSegments: [
 *                                      "這是1.1小節的第一個自然段落。",
 *                                      "這是第二個自然段落。"
 *                                  ]
 *                              },
 *                              // ... 更多章節
 *                          ]
 */
function segmentDocumentByToC(fullDocumentText, structuredToC) {
    // New: 基於 Markdown 標題解析分段
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    const matches = [];
    let m;
    while ((m = headingRegex.exec(fullDocumentText)) !== null) {
        matches.push({
            title: m[1].trim(),
            level: m[0].split(' ')[0].length, // '#' 數量
            index: m.index
        });
    }
    // 若無任何標題，退回全文一段
    if (matches.length === 0) {
        const all = fullDocumentText;
        return [{ tocTitle: "全文", tocLevel: 1, rawSectionText: all,
            naturalSegments: splitIntoNaturalParagraphs(all) }];
    }
    const sections = [];
    // 按順序提取每個章節文字
    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const start = current.index + fullDocumentText.slice(current.index).split("\n")[0].length + 1;
        const end = (i + 1 < matches.length) ? matches[i+1].index : fullDocumentText.length;
        const raw = fullDocumentText.slice(start, end).trim();
        // 超長時按自然段落拆分併合並至閾值
        const paras = splitIntoNaturalParagraphs(raw);
        const threshold = 10000;
        const segments = [];
        let buf = "";
        for (const p of paras) {
            if (buf.length + p.length <= threshold) {
                buf = buf ? buf + '\n\n' + p : p;
            } else {
                if (buf) segments.push(buf);
                buf = p;
            }
        }
        if (buf) segments.push(buf);
        sections.push({ tocTitle: current.title, tocLevel: current.level,
            rawSectionText: raw, naturalSegments: segments });
    }
    return sections;
}

/**
 * 輔助函式，將文字分割成"自然"段落。
 * 這是一個佔位符，可能需要更復雜的邏輯
 * (例如，基於雙換行字元，或更復雜的NLP方法)。
 * @param {string} text - 要分割的文字。
 * @returns {Array<string>} 段落字串陣列。
 */
function splitIntoNaturalParagraphs(text) {
    if (!text) return [];
    // 按一個或多個換行字元分割，然後去除首尾空格並過濾空字串。
    // 對於Markdown段落，更穩健的方法是按兩個或多個換行字元分割。
    return text.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0);
}


/**
 * 處理單個文字片段，提取摘要、細節等，
 * 透過呼叫已有的"理解"演算法 (例如，您的翻譯演算法)。
 *
 * @param {string} segmentText - 一個小的文字片段 (例如，一個自然段落)。
 * @returns {Promise<Object>} 一個Promise，解析為一個包含以下內容的物件：
 *                            { summary: string, details: Array<string>, length: number }。
 */
async function processSegment(segmentText) {
    try {
        // 使用 ChatbotCore.singleChunkSummary 生成摘要
        const config = window.ChatbotCore.getChatbotConfig();
        const apiKey = config.apiKey;
        // 構建系統提示：精簡摘要和要點，不超過200字
        const sysPrompt = `請提煉以下文字的大意和要點，儘量精簡，不超過200字：\n${segmentText}`;
        const summary = await window.ChatbotCore.singleChunkSummary(sysPrompt, segmentText, config, apiKey);
        return { summary: summary, details: [], length: segmentText.length };
    } catch (error) {
        console.error('[segmentation-strategy] 呼叫 singleChunkSummary 失敗:', error);
        return { summary: '片段處理失敗。', details: [error.message], length: segmentText.length };
    }
}

// 新增：帶重試機制的分段處理，指數退避
async function processSegmentWithRetry(segmentText, retries = 3, initialDelay = 500) {
    let attempt = 0;
    let delay = initialDelay;
    while (true) {
        try {
            return await processSegment(segmentText);
        } catch (error) {
            attempt++;
            console.warn(`[segmentation-strategy] 處理片段失敗，重試第 ${attempt}/${retries}`, error);
            if (attempt >= retries) {
                return { summary: "片段處理失敗。", details: [error.message], length: segmentText.length, error: true };
            }
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
}

/**
 * 從分段的文件和處理過的片段資料構建最終的預處理JSON結構。
 *
 * @param {Array<Object>} tocSections - segmentDocumentByToC的輸出。
 *                                      每個物件包含 tocTitle, tocLevel, rawSectionText, naturalSegments。
 * @param {Array<Array<Object>>} allProcessedSegmentsData - 一個陣列，其中每個內部陣列對應一個ToC章節的處理過的自然段落。
 *                                                       每個內部項是 processSegment的輸出。
 *                                                       示例: [
 *                                                                  [ {summary, details, length}, {summary, details, length}, ... 章節1的片段],
 *                                                                  [ {summary, details, length}, ... 章節2的片段]
 *                                                               ]
 * @returns {Array<Object>} 最終的JSON結構。
 *                          示例: [
 *                                       {
 *                                           tocTitle: "1.1 小節",
 *                                           tocLevel: 2,
 *                                           segments: [ // 為清晰起見，從processedSegments重新命名
 *                                               { originalText: "...", summary: "...", details: [], length: N },
 *                                               ...
 *                                           ],
 *                                           totalSectionLength: M
 *                                       },
 *                                       ...
 *                                   ]
 */
function buildPreprocessedJson(tocSections, allProcessedSegmentsData) {
    // TODO: 將ToC結構與每個片段的處理資料結合起來。
    console.log('[segmentation-strategy] 正在構建預處理JSON。');
    const finalJson = [];
    tocSections.forEach((section, sectionIndex) => {
        const processedNaturalSegments = allProcessedSegmentsData[sectionIndex] || [];
        let totalSectionLength = 0;
        const resultSegments = section.naturalSegments.map((originalText, segmentIdx) => {
            const processedData = processedNaturalSegments[segmentIdx] || { summary: "片段處理失敗。", details: [], length: originalText.length };
            totalSectionLength += processedData.length;
            return {
                originalText: originalText,
                summary: processedData.summary,
                details: processedData.details,
                length: processedData.length
            };
        });

        finalJson.push({
            tocTitle: section.tocTitle,
            tocLevel: section.tocLevel,
            segments: resultSegments, // 從processedSegments更改
            totalSectionLength: totalSectionLength
        });
    });
    return finalJson;
}

/**
 * 根據使用者查詢從預處理的JSON中檢索相關內容塊。
 * 這是呼叫LLM進行相關性排序的地方。
 *
 * @param {string} userQuery - 使用者的提問。
 * @param {Array<Object>} preprocessedJson - buildPreprocessedJson構建的JSON資料。
 * @param {number} [charLimit=50000] - 返回內容的最大總字元限制。
 * @param {number} [topN=10] - 返回的最大片段數量。
 * @returns {Promise<Array<string>>} 一個Promise，解析為相關originalText字串的陣列，
 *                                   按相關性排序，並遵守字元限制。
 */
async function retrieveRelevantContent(userQuery, preprocessedJson, charLimit = 50000, topN = 10) {
    // TODO:
    // 1. 為LLM構建一個prompt，包括userQuery和preprocessedJson的表示
    //    （如果上下文視窗太大，則為其摘要/子集）。
    // 2. 呼叫LLM獲取片段ID/索引的排序列表。
    // 3. 根據排序列表和charLimit，提取並連線最相關片段的originalText。
    console.log('[segmentation-strategy] 正在為查詢檢索相關內容:', userQuery);

    // 佔位符實現：透過簡單的關鍵字比對返回前N個片段（非常基礎）
    const relevantSegmentTexts = [];
    let currentLength = 0;
    const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2); // 過濾短詞

    const scoredSegments = [];

    preprocessedJson.forEach((tocEntry, tocIndex) => {
        tocEntry.segments.forEach((segment, segmentIndex) => {
            let score = 0;
            const combinedText = (segment.originalText + " " + segment.summary).toLowerCase();
            queryWords.forEach(word => {
                if (combinedText.includes(word)) {
                    score++;
                }
            });
            // 如果關鍵字在摘要中，增加分數
            queryWords.forEach(word => {
                if (segment.summary.toLowerCase().includes(word)) {
                    score += 2;
                }
            });
            // 如果關鍵字在ToC標題中，增加分數（權重較低）
            if (tocEntry.tocTitle.toLowerCase().split(/\s+/).some(titleWord => queryWords.includes(titleWord))) {
                score += 0.5;
            }

            if (score > 0) {
                // 如果LLM返回它們，則包括更精確檢索的識別符號
                scoredSegments.push({
                    text: segment.originalText,
                    score: score,
                    length: segment.length,
                    tocIndex: tocIndex,
                    segmentIndex: segmentIndex
                });
            }
        });
    });

    // 按分數降序排序
    scoredSegments.sort((a, b) => b.score - a.score);

    for (const seg of scoredSegments) {
        if (relevantSegmentTexts.length < topN && currentLength + seg.length <= charLimit) {
            relevantSegmentTexts.push(seg.text);
            currentLength += seg.length;
        }
        if (relevantSegmentTexts.length >= topN && currentLength >= charLimit) break;
    }

    // 如果未找到任何內容但JSON中有內容，則回退
    if (relevantSegmentTexts.length === 0 && preprocessedJson.length > 0 && preprocessedJson[0].segments.length > 0) {
        const firstSegment = preprocessedJson[0].segments[0];
        if (firstSegment.originalText.length <= charLimit) {
             relevantSegmentTexts.push(firstSegment.originalText);
        }
    }

    return relevantSegmentTexts;
}

// 新增：通用並行池，限制同時執行的非同步任務數量
async function processWithConcurrencyLimit(items, handler, limit) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = handler(item).then(res => {
            // 任務完成後從執行列表中移除
            executing.splice(executing.indexOf(p), 1);
            return res;
        });
        results.push(p);
        executing.push(p);
        if (executing.length >= limit) {
            // 等待最先完成的任務騰出名額
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

/**
 * 基於ToC的分段和處理策略的主協調函式。
 * 此函式將在文件的初始OCR/文字提取之後呼叫。
 *
 * @param {string} documentText - 文件的全文。
 * @param {string | Object} [tocInput] - 可選的ToC資料。如果未提供，可能會嘗試推斷或使用預設值。
 * @returns {Promise<Array<Object>>} 一個Promise，解析為預處理的JSON資料。
 */
async function runSegmentationAndProcessing(documentText, tocInput) {
    console.log("[segmentation-strategy] 開始基於ToC的分段和處理。");

    // 1. 解析ToC
    const effectiveTocInput = tocInput || documentText.substring(0, Math.min(documentText.length, 4000));
    const structuredToC = parseTableOfContents(effectiveTocInput);

    // 2. 按ToC分段
    const tocSections = segmentDocumentByToC(documentText, structuredToC);

    // 3. 並行處理每個自然段落，使用並行池
    const allProcessedNaturalSegmentsData = [];
    for (const section of tocSections) {
        let results = [];
        if (section.naturalSegments && section.naturalSegments.length > 0) {
            // 從全域選項獲取並行上限，預設20
            const limit = (window.chatbotActiveOptions && Number.isInteger(window.chatbotActiveOptions.segmentConcurrency))
                ? window.chatbotActiveOptions.segmentConcurrency : 20;
            results = await processWithConcurrencyLimit(
                section.naturalSegments,
                segText => processSegmentWithRetry(segText),
                limit
            );
        }
        allProcessedNaturalSegmentsData.push(results);
    }

    // 4. 構建JSON
    const preprocessedJson = buildPreprocessedJson(tocSections, allProcessedNaturalSegmentsData);

    console.log("[segmentation-strategy] 預處理完成。生成的JSON（第一個條目的示例）:",
        preprocessedJson.length > 0 ? JSON.stringify(preprocessedJson[0], null, 2).substring(0, 500) + "..." : "未生成條目。"
    );

    return preprocessedJson;
}

// 暴露函式以供應用程式的其他部分使用，例如chatbot-core.js或app.js
// 這使得可以透過SegmentationStrategy.functionName()訪問它們
if (typeof window.SegmentationStrategy === 'undefined') {
    window.SegmentationStrategy = {};
}
window.SegmentationStrategy.parseTableOfContents = parseTableOfContents;
window.SegmentationStrategy.segmentDocumentByToC = segmentDocumentByToC;
window.SegmentationStrategy.processSegment = processSegment;
window.SegmentationStrategy.processSegmentWithRetry = processSegmentWithRetry;
window.SegmentationStrategy.buildPreprocessedJson = buildPreprocessedJson;
window.SegmentationStrategy.retrieveRelevantContent = retrieveRelevantContent;
window.SegmentationStrategy.runSegmentationAndProcessing = runSegmentationAndProcessing;
window.SegmentationStrategy.splitIntoNaturalParagraphs = splitIntoNaturalParagraphs; // 同時暴露輔助函式


console.log('[segmentation-strategy.js] 已載入並附加到window.SegmentationStrategy。');