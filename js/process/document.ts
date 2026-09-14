// process/document.js

/**
 * 將長文件分割為可翻譯的塊。
 * 此函式旨在將 Markdown 文字按照指定的 token 限制進行智慧分塊，
 * 以便適應大語言模型處理上下文長度的限制。
 *
 * 主要策略：
 * 1. **Token 估算與初步判斷**：
 *    - 使用 `estimateTokenCount` 估算整個文件的 token 數。
 *    - 如果文件未超過 token 限制的 1.1 倍，則不進行分割，直接返回原文作為一個塊。
 * 2. **行級初步分割**：
 *    - 走訪文字的每一行。
 *    - 跟蹤當前塊的 token 數和行內容。
 *    - 智慧分割點選擇：
 *      - 當 `currentTokenCount + lineTokens > tokenLimit` 且當前塊已有一定內容 (`currentTokenCount > tokenLimit * 0.1`) 時，進行分割。
 *      - 在非程式碼塊內，如果遇到一級或二級 Markdown 標題 (`#` 或 `##`)，並且當前塊內容已超過限制的 50%，則在此標題前分割，以保持章節完整性。
 *    - 維護 `inCodeBlock` 狀態，避免在程式碼塊內部錯誤地根據標題分割。
 * 3. **二次段落級分割（針對超大塊）**：
 *    - 對初步分割產生的每個塊進行檢查。
 *    - 如果某個塊的 token 數仍然超過限制的 1.1 倍，則呼叫 `splitByParagraphs` 對其進行更細緻的段落級分割。
 * 4. **日誌記錄**：在關鍵步驟透過 `addProgressLog` (如果可用) 輸出日誌，方便追蹤分割過程。
 *
 * @param {string} markdown - 要分割的Markdown文字。
 * @param {number} tokenLimit - 每塊的最大token數。
 * @param {string} [logContext=""] - 日誌字首，用於區分不同上下文的日誌輸出。
 * @returns {Array<string>} 分割後的文字塊陣列。
 */
function splitMarkdownIntoChunks(markdown, tokenLimit, logContext = "") {
    const estimatedTokens = estimateTokenCount(markdown);
    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 估算總 token 數: ~${estimatedTokens}, 分段限制: ${tokenLimit}`);
    }

    if (estimatedTokens <= tokenLimit * 1.1) {
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 文件未超過大小限制，不進行分割。`);
        }
        return [markdown];
    }

    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 文件超過大小限制，開始分割...`);
    }
    const lines = markdown.split('\n');
    const chunks = [];
    let currentChunkLines = [];
    let currentTokenCount = 0;
    let inCodeBlock = false;
    const headingRegex = /^(#+)\s+.*/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTokens = estimateTokenCount(line);

        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }

        let shouldSplit = false;

        if (currentChunkLines.length > 0) {
            if (currentTokenCount + lineTokens > tokenLimit) {
                if (currentTokenCount > tokenLimit * 0.1) {
                    shouldSplit = true;
                }
            }
            else if (!inCodeBlock && headingRegex.test(line)) {
                const match = line.match(headingRegex);
                if (match && match[1].length <= 2 && currentTokenCount > tokenLimit * 0.5) {
                    shouldSplit = true;
                }
            }
        }

        if (shouldSplit) {
            chunks.push(currentChunkLines.join('\n'));
            currentChunkLines = [];
            currentTokenCount = 0;
        }

        currentChunkLines.push(line);
        currentTokenCount += lineTokens;
    }

    if (currentChunkLines.length > 0) {
        chunks.push(currentChunkLines.join('\n'));
    }

    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 初始分割為 ${chunks.length} 個片段.`);
    }

    const finalChunks = [];
    for(let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        const chunkTokens = estimateTokenCount(chunk);
        if (chunkTokens > tokenLimit * 1.1) {
            if (typeof addProgressLog === "function") {
                addProgressLog(`${logContext} 警告: 第 ${j+1} 段 (${chunkTokens} tokens) 仍然超過限制 ${tokenLimit}. 嘗試段落分割.`);
            }
            const subChunks = splitByParagraphs(chunk, tokenLimit, logContext, j+1);
            finalChunks.push(...subChunks);
        } else {
            finalChunks.push(chunk);
        }
    }

    if (finalChunks.length !== chunks.length && typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 二次分割後總片段數: ${finalChunks.length}`);
    }

    return finalChunks;
}

/**
 * 按段落分割過大的文字塊。
 * 當 `splitMarkdownIntoChunks` 初步分割後，某些塊可能仍然過大，
 * 此函式嘗試將這些超大塊按照 Markdown 的段落（空行分隔）進一步細分。
 *
 * 主要邏輯：
 * 1. **段落分割**：使用 `text.split('\n\n')` 將文字塊分割成段落陣列。
 * 2. **逐段累加與分割**：
 *    - 走訪每個段落。
 *    - 估算段落的 token 數。
 *    - 如果單個段落本身就超過 `tokenLimit * 1.1`，則直接將其作為一個獨立的塊（不再細分），並記錄警告。
 *    - 否則，將段落加入當前子塊，並累加 token 數。
 *    - 如果加入當前段落會導致子塊超過 `tokenLimit`，並且子塊中已有內容，則先將當前子塊儲存，然後開始新的子塊。
 * 3. **日誌記錄**：記錄段落分割的過程和結果。
 *
 * @param {string} text - 需要按段落分割的文字塊。
 * @param {number} tokenLimit - 每塊的最大token數。
 * @param {string} logContext - 日誌字首。
 * @param {number} chunkIndex - 當前塊在原始分割結果中的索引 (用於日誌)。
 * @returns {Array<string>} 分割後的子塊陣列。
 */
function splitByParagraphs(text, tokenLimit, logContext, chunkIndex) {
    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 對第 ${chunkIndex} 段進行段落分割...`);
    }
    const paragraphs = text.split('\n\n');
    const chunks = [];
    let currentChunkLines = [];
    let currentTokenCount = 0;

    for (const paragraph of paragraphs) {
        const paragraphTokens = estimateTokenCount(paragraph);

        if (paragraphTokens > tokenLimit * 1.1) {
            if (typeof addProgressLog === "function") {
                addProgressLog(`${logContext} 警告: 第 ${chunkIndex} 段中的段落 (${paragraphTokens} tokens) 超過限制 ${tokenLimit}. 將嘗試按原樣處理.`);
            }
            if (currentChunkLines.length > 0) {
                chunks.push(currentChunkLines.join('\n\n'));
            }
            chunks.push(paragraph); // Keep the large paragraph as a single chunk
            currentChunkLines = [];
            currentTokenCount = 0;
            continue;
        }

        if (currentTokenCount + paragraphTokens > tokenLimit && currentChunkLines.length > 0) {
            chunks.push(currentChunkLines.join('\n\n'));
            currentChunkLines = [];
            currentTokenCount = 0;
        }

        currentChunkLines.push(paragraph);
        currentTokenCount += paragraphTokens;
    }

    if (currentChunkLines.length > 0) {
        chunks.push(currentChunkLines.join('\n\n'));
    }
    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 第 ${chunkIndex} 段分割為 ${chunks.length} 個子段.`);
    }
    return chunks;
}

/**
 * 翻譯長文件，支援分段、表格保護、並行控制和自定義模型配置。
 *
 * 核心流程：
 * 1. **引數準備與 Token 限制**：
 *    - 確保 `tokenLimitInput` 被正確解析為數字。
 * 2. **表格保護**：
 *    - 呼叫 `protectMarkdownTables` (如果可用) 將 Markdown 中的表格替換為佔位符 (如 `__TABLE_PLACEHOLDER_0__`)，
 *      並將原始表格內容儲存在 `tablePlaceholders` 物件中。這可以防止翻譯API破壞表格結構。
 *    - 如果檢測到表格，更新系統提示 `updatedSystemPrompt`，告知模型如何處理這些佔位符。
 * 3. **文字分塊**：
 *    - 使用 `splitMarkdownIntoChunks` 將經過表格保護處理的文字 (`processedText`) 分割成 `originalTextChunks`。
 * 4. **API 配置構建**：
 *    - 根據 `model` 引數是 'custom' 還是預定義模型，呼叫 `buildCustomApiConfig` 或 `buildPredefinedApiConfig` 來準備 API 請求所需的配置物件 (`apiConfig`)。
 *    - 對於自定義模型，會從 `modelConfig` 引數中獲取詳細配置（如端點、模型ID、請求格式等）。
 * 5. **建立翻譯任務佇列 (`allTranslationTasks`)**：
 *    - 將所有文字塊的翻譯任務新增到佇列中。
 *    - 如果有受保護的表格，將每個表格的翻譯也作為一個獨立的任務新增到佇列中。
 * 6. **並行翻譯與重試**：
 *    - 走訪 `allTranslationTasks`，為每個任務建立一個非同步翻譯 Promise。
 *    - 使用 `acquireSlot` 和 `releaseSlot` 控制並行翻譯的數量。
 *    - 對每個任務執行翻譯：
 *      - **文字塊翻譯**：呼叫 `translateMarkdown` (並根據模型型別傳遞必要的引數，如 `modelConfig` for custom)。
 *      - **表格翻譯**：構造特定的系統提示和使用者提示，指導模型僅翻譯表格內容並保持結構，然後呼叫 `callTranslationApi`。翻譯結果會經過 `extractTableFromTranslation` 清理。
 *    - 實現重試機制 (最多 `MAX_TRANSLATION_RETRIES` 次)，使用 `getRetryDelay` 計算退避延遲。
 *    - 如果任務在多次重試後仍然失敗，則記錄錯誤，並將原文（或原始表格內容）作為翻譯結果的兜底。
 *    - 將所有任務的翻譯結果（成功或失敗的兜底）儲存在 `translationResults` Map 中，鍵為 `text-{index}` 或 `table-{index}`。
 * 7. **等待所有任務完成**：使用 `Promise.all` 等待所有翻譯 Promise 執行完畢。
 * 8. **結果組裝與表格還原**：
 *    - **構建翻譯後表格對映**：從 `translationResults` 中提取已翻譯的表格內容，存入 `translatedTablePlaceholders`。
 *    - **還原分塊中的表格**：
 *      - 對 `originalTextChunks` 中的每個塊，使用 `restoreMarkdownTables` 和原始 `tablePlaceholders` 還原其包含的原始表格，得到 `restoredOcrChunks`。
 *      - 對 `translationResults` 中每個文字塊的翻譯結果，使用 `restoreMarkdownTables` 和 `translatedTablePlaceholders` 還原其包含的已翻譯表格，得到 `translatedTextChunks`。
 *    - **合併翻譯文字**：將 `translatedTextChunks` 連線起來得到 `combinedTranslation`。
 *    - **最終表格還原**：為保險起見，再次對 `combinedTranslation` 使用 `translatedTablePlaceholders` 進行一次整體的表格佔位符替換。
 * 9. **返回結果**：返回一個物件，包含最終的完整翻譯文字 `translatedText`，以及還原了表格的原文分塊 `originalChunks` 和譯文分塊 `translatedTextChunks`。
 *
 * @param {string} markdownText - 待翻譯的Markdown文字。
 * @param {string} targetLang - 目標語言程式碼 (如 'zh-TW', 'en')。
 * @param {string} model - 使用的翻譯模型名稱 (如 'mistral', 'custom')。
 * @param {string} apiKey - 對應翻譯模型的 API 金鑰。
 * @param {Object | null} modelConfig - 當 `model` 為 "custom" 時，提供自定義模型的配置物件，
 *                                   包含 `apiEndpoint` (或 `apiBaseUrl`), `modelId`, `requestFormat`, `temperature`, `max_tokens` 等。
 * @param {number | string} tokenLimitInput - 每個翻譯分塊的最大 token 限制。
 * @param {function} acquireSlot - 用於獲取並行執行槽位的函式。
 * @param {function} releaseSlot - 用於釋放並行執行槽位的函式。
 * @param {string} [logContext=""] - 日誌記錄的上下文字首。
 * @param {string} [defaultSystemPrompt=""] - 預設的系統提示詞。
 * @param {string} [defaultUserPromptTemplate=""] - 預設的使用者提示詞模板 (應包含 `${content}` 和 `${targetLangName}` 佔位符)。
 * @param {boolean} [useCustomPrompts=false] - 是否使用自定義的提示詞（如果為 false，則使用內建或預設提示詞）。
 * @returns {Promise<Object>} 一個包含翻譯結果的物件，結構為：
 *                          `{ translatedText: string, originalChunks: Array<string>, translatedTextChunks: Array<string> }`。
 *                          `originalChunks` 和 `translatedTextChunks` 是經過表格還原處理後的分塊陣列。
 * @throws {Error} 如果自定義模型配置不完整或發生其他嚴重錯誤。
 */
async function translateLongDocument(
    markdownText,
    targetLang,
    model,
    apiKey,
    modelConfig, // 新增引數
    tokenLimitInput,
    acquireSlot,
    releaseSlot,
    logContext = "",
    defaultSystemPrompt = "",
    defaultUserPromptTemplate = "",
    useCustomPrompts = false
) {
    console.log('translateLongDocument: apiKey', apiKey);
    const tokenLimit = parseInt(tokenLimitInput, 10) || 2000; // 確保是數字，提供預設值

    // 先進行表格保護處理
    let processedText = markdownText;
    let tablePlaceholders = {};
    let hasProtectedTables = false;

    if (typeof protectMarkdownTables === 'function') {
        const processed = protectMarkdownTables(markdownText);
        processedText = processed.processedText;
        tablePlaceholders = processed.tablePlaceholders;
        hasProtectedTables = Object.keys(tablePlaceholders).length > 0;

        if (hasProtectedTables) {
            console.log(`${logContext} 長文件中檢測到 ${Object.keys(tablePlaceholders).length} 個表格，已進行特殊保護`);
            if (typeof addProgressLog === "function") {
                addProgressLog(`${logContext} 長文件翻譯: 已保護 ${Object.keys(tablePlaceholders).length} 個表格結構，將作為整體處理`);
            }
        }
    }

    // 增加表格處理提示到系統提示中
    let updatedSystemPrompt = defaultSystemPrompt;
    if (hasProtectedTables) {
        updatedSystemPrompt = defaultSystemPrompt + "\n\n注意：文件中的表格已被特殊標記為佔位符（如__TABLE_PLACEHOLDER_0__），請直接翻譯佔位符以外的內容，保持佔位符不變。表格將在後續步驟中單獨處理。";
    }

    // 繼續原有的分塊處理邏輯 - 使用處理後的文字
    const originalTextChunks = splitMarkdownIntoChunks(processedText, tokenLimit, logContext);
    console.log(`${logContext} 文件分割為 ${originalTextChunks.length} 部分進行翻譯 (Limit: ${tokenLimit})`);
    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 文件被分割為 ${originalTextChunks.length} 部分進行翻譯`);
    }

    // 準備API配置用於文字和表格翻譯
    let apiConfig;
    if (model === "custom") {
        // 相容 apiEndpoint 和 apiBaseUrl
        const endpoint = modelConfig.apiEndpoint || modelConfig.apiBaseUrl;
        if (!modelConfig || !endpoint || !modelConfig.modelId) {
            throw new Error('Custom model configuration is incomplete for translateLongDocument. API Endpoint (或 apiBaseUrl) and Model ID are required.');
        }
        apiConfig = buildCustomApiConfig(
            apiKey,
            endpoint,    // 相容 apiEndpoint 和 apiBaseUrl
            modelConfig.modelId,        // 使用傳入的 modelConfig
            modelConfig.requestFormat,  // 使用傳入的 modelConfig
            modelConfig.temperature,
            modelConfig.max_tokens,
            {
                endpointMode: modelConfig.endpointMode || 'auto'
            }
        );
    } else {
        // 預設模型
        const settingsForModels = typeof loadSettings === 'function' ? loadSettings() : {};
        const customModelSettings = settingsForModels && settingsForModels.customModelSettings ? settingsForModels.customModelSettings : {};
        let temperature = 0.5;
        if (customModelSettings.temperature !== undefined && customModelSettings.temperature !== null && customModelSettings.temperature !== '') {
            const parsedTemp = parseFloat(customModelSettings.temperature);
            if (!Number.isNaN(parsedTemp)) {
                temperature = parsedTemp;
            }
        }
        let maxTokens = 8000;
        if (customModelSettings.max_tokens !== undefined && customModelSettings.max_tokens !== null && customModelSettings.max_tokens !== '') {
            const parsedMax = parseInt(customModelSettings.max_tokens, 10);
            if (!Number.isNaN(parsedMax) && parsedMax > 0) {
                maxTokens = parsedMax;
            }
        }

        let geminiEndpointDynamic = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
        try {
            if (typeof loadModelConfig === 'function') {
                const gcfg = loadModelConfig('gemini');
                const preferred = gcfg && (gcfg.preferredModelId || gcfg.modelId);
                if (preferred && typeof preferred === 'string' && preferred.trim()) {
                    geminiEndpointDynamic = `https://generativelanguage.googleapis.com/v1beta/models/${preferred.trim()}:generateContent`;
                }
            }
        } catch (e) {
            console.warn('載入 Gemini 配置失敗，將在長文件翻譯中使用預設模型。', e);
        }

        let deeplxEndpointTemplate = 'https://api.deeplx.org/<api-key>/translate';
        try {
            if (typeof loadModelConfig === 'function') {
                const dlcfg = loadModelConfig('deeplx');
                if (dlcfg) {
                    if (dlcfg.endpointTemplate && typeof dlcfg.endpointTemplate === 'string') {
                        deeplxEndpointTemplate = dlcfg.endpointTemplate.trim() || deeplxEndpointTemplate;
                    } else if (dlcfg.apiBaseUrlTemplate && typeof dlcfg.apiBaseUrlTemplate === 'string') {
                        deeplxEndpointTemplate = dlcfg.apiBaseUrlTemplate.trim() || deeplxEndpointTemplate;
                    } else if (dlcfg.apiBaseUrl && typeof dlcfg.apiBaseUrl === 'string') {
                        const base = dlcfg.apiBaseUrl.trim();
                        if (base) {
                            deeplxEndpointTemplate = base.endsWith('/') ? `${base}<api-key>/translate` : `${base}/<api-key>/translate`;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('載入 DeepLX 配置失敗，將在長文件翻譯中使用預設模板。', e);
        }

        const predefinedConfigs = {
            "mistral": {
                endpoint: "https://api.mistral.ai/v1/chat/completions",
                modelName: "mistral-large-latest",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user) => ({
                    model: "mistral-large-latest",
                    messages: [
                        { role: "system", content: sys },
                        { role: "user", content: user }
                    ],
                    temperature: temperature,
                    max_tokens: maxTokens
                }),
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            "deepseek": {
                endpoint: "https://api.deepseek.com/v1/chat/completions",
                modelName: "DeepSeek",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user) => {
                    let modelId = 'deepseek-chat';
                    try { const cfg = loadModelConfig && loadModelConfig('deepseek'); if (cfg && (cfg.preferredModelId || cfg.modelId)) modelId = cfg.preferredModelId || cfg.modelId; } catch (_) {}
                    return {
                        model: modelId,
                        messages: [
                            { role: "system", content: sys },
                            { role: "user", content: user }
                        ],
                        temperature: temperature,
                        max_tokens: maxTokens
                    };
                },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            "gemini": {
                endpoint: geminiEndpointDynamic,
                modelName: "Google Gemini",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user) => ({
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: `${sys}\n\n${user}` }]
                        }
                    ],
                    generationConfig: {
                        temperature: temperature,
                        maxOutputTokens: maxTokens
                    }
                }),
                responseExtractor: (data) => {
                    if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                        const parts = data.candidates[0].content.parts;
                        return parts && parts.length > 0 ? parts[0].text : '';
                    }
                    return '';
                }
            },
            "gemini-preview": {
                endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent",
                modelName: "Google gemini-2.5-flash-preview-05-20",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user) => ({
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: `${sys}\n\n${user}` }]
                        }
                    ],
                    generationConfig: {
                        temperature: temperature,
                        maxOutputTokens: maxTokens,
                        responseModalities: ["TEXT"],
                        responseMimeType: "text/plain"
                    }
                }),
                responseExtractor: (data) => {
                    if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                        const parts = data.candidates[0].content.parts;
                        return parts && parts.length > 0 ? parts[0].text : '';
                    }
                    return '';
                }
            },
            "tongyi": {
                endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                modelName: "通義百鍊",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user) => {
                    let modelId = 'qwen-turbo-latest';
                    try { const cfg = loadModelConfig && loadModelConfig('tongyi'); if (cfg && (cfg.preferredModelId || cfg.modelId)) modelId = cfg.preferredModelId || cfg.modelId; } catch (_) {}
                    const isQwenMT = typeof modelId === 'string' && modelId.toLowerCase().includes('qwen-mt');
                    const mergedContent = isQwenMT ? `${sys}\n\n${user}`.trim() : null;
                    return {
                        model: modelId,
                        messages: isQwenMT
                            ? [
                                { role: "user", content: mergedContent }
                            ]
                            : [
                                { role: "system", content: sys },
                                { role: "user", content: user }
                            ],
                        temperature: temperature,
                        max_tokens: maxTokens,
                        enable_thinking: false
                    };
                },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            "volcano": {
                endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                modelName: "火山引擎",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user) => {
                    let modelId = 'doubao-1-5-pro-32k-250115';
                    try { const cfg = loadModelConfig && loadModelConfig('volcano'); if (cfg && (cfg.preferredModelId || cfg.modelId)) modelId = cfg.preferredModelId || cfg.modelId; } catch (_) {}
                    return {
                        model: modelId,
                        messages: [
                            { role: "system", content: sys },
                            { role: "user", content: user }
                        ],
                        temperature: temperature,
                        max_tokens: Math.min(maxTokens, 16384)
                    };
                },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            "deeplx": {
                endpoint: deeplxEndpointTemplate,
                modelName: "DeepLX",
                headers: { "Content-Type": "application/json" },
                bodyBuilder: (sys, user, ctx = {}) => {
                    const payload = {
                        text: ctx && ctx.processedText ? ctx.processedText : user
                    };
                    const targetLangCode = (typeof mapToDeeplxLangCode === 'function')
                        ? mapToDeeplxLangCode(ctx && ctx.targetLang ? ctx.targetLang : undefined)
                        : undefined;
                    if (targetLangCode) {
                        payload.target_lang = targetLangCode;
                    }
                    if (ctx && ctx.sourceLang) {
                        const src = (typeof mapToDeeplxLangCode === 'function') ? mapToDeeplxLangCode(ctx.sourceLang) : undefined;
                        if (src) payload.source_lang = src;
                    }
                    return payload;
                },
                responseExtractor: (data) => {
                    if (!data) return '';
                    if (typeof data === 'string') return data;
                    if (typeof data.text === 'string') return data.text;
                    if (data.data) {
                        if (typeof data.data === 'string') return data.data;
                        if (typeof data.data.text === 'string') return data.data.text;
                    }
                    if (Array.isArray(data.translations) && data.translations.length > 0) {
                        const first = data.translations[0];
                        if (typeof first === 'string') return first;
                        if (first && typeof first.text === 'string') return first.text;
                    }
                    if (Array.isArray(data.alternatives) && data.alternatives.length > 0) {
                        const alt = data.alternatives[0];
                        if (typeof alt === 'string') return alt;
                        if (alt && typeof alt.text === 'string') return alt.text;
                    }
                    if (typeof data.result === 'string') return data.result;
                    if (data.result && typeof data.result.text === 'string') return data.result.text;
                    if (typeof data.translation === 'string') return data.translation;
                    return null;
                }
            }
        };

        if (!predefinedConfigs[model]) {
            throw new Error(`暫不支援模型 ${model} 的長文件處理。`);
        }
        apiConfig = buildPredefinedApiConfig(predefinedConfigs[model], apiKey);
    }

    // 建立所有翻譯任務的統一佇列（包括文字塊和表格）
    const allTranslationTasks = [];

    // 新增所有文字塊翻譯任務
    originalTextChunks.forEach((part, i) => {
        allTranslationTasks.push({
            type: 'text',
            index: i,
            content: part,
            context: `${logContext} (Part ${i+1}/${originalTextChunks.length})`
        });
    });

    // 新增所有表格翻譯任務（如果有）
    if (hasProtectedTables) {
        let tableIndex = 0;
        for (const [placeholder, tableContent] of Object.entries(tablePlaceholders)) {
            allTranslationTasks.push({
                type: 'table',
                index: tableIndex,
                placeholder: placeholder,
                content: tableContent,
                context: `${logContext} (Table ${tableIndex+1}/${Object.keys(tablePlaceholders).length})`
            });
            tableIndex++;
        }
    }

    if (typeof addProgressLog === "function") {
        addProgressLog(`${logContext} 總計待翻譯任務: ${allTranslationTasks.length} (文字塊: ${originalTextChunks.length}, 表格: ${hasProtectedTables ? Object.keys(tablePlaceholders).length : 0})`);
    }

    let hasErrors = false;
    const MAX_TRANSLATION_RETRIES = 3;
    const translationResults = new Map(); // 使用Map儲存翻譯結果

    // 為所有任務建立翻譯Promise
    const translationPromises = allTranslationTasks.map(async (task) => {
        const taskLogContext = task.context;
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_TRANSLATION_RETRIES; attempt++) {
            const attemptNum = attempt + 1;
            if (typeof addProgressLog === "function") {
                addProgressLog(`${taskLogContext} 排隊等待翻譯槽 (嘗試 ${attemptNum})...`);
            }
            await acquireSlot();
            if (typeof addProgressLog === "function") {
                addProgressLog(`${taskLogContext} 翻譯槽已獲取。開始翻譯 ${task.type === 'table' ? '表格' : '文字'} (嘗試 ${attemptNum})...`);
            }

            try {
                let result;

                if (task.type === 'text') {
                    // Step 1: 為任務預綁定提示詞併入隊，便於失敗時做“真正佇列替換”
                    let boundPrompt = null;
                    let requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2,8)}_t${task.index}`;
                    try {
                        if (typeof window !== 'undefined' && window.promptPoolUI && typeof window.promptPoolUI.getPromptForTranslation === 'function') {
                            const p = window.promptPoolUI.getPromptForTranslation();
                            // 僅當池模式返回 id/system/user 時認為可用
                            if (p && p.id && p.systemPrompt && p.userPromptTemplate) {
                                boundPrompt = p;
                                if (typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.enqueueRequest === 'function') {
                                    window.translationPromptPool.enqueueRequest(p.id, { requestId, model: (apiConfig && apiConfig.modelName) || model });
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[PromptPool] 預綁定提示詞失敗（跳過綁定）:', e);
                    }
                    // 翻譯文字塊
                    //console.log('document.js 呼叫 translateMarkdown 引數:', {
                    //    useCustomPrompts,
                    //    defaultUserPromptTemplate,
                    //    defaultSystemPrompt,
                    //    modelConfig,
                    //    content: task.content,
                    //    targetLang,
                    //    model,
                    //    apiKey,
                    //    taskLogContext
                    //});
                    if (model === 'custom') {
                        result = await translateMarkdown(
                            task.content,
                            targetLang,
                            model,
                            apiKey,
                            modelConfig,
                            taskLogContext,
                            updatedSystemPrompt,
                            defaultUserPromptTemplate,
                            useCustomPrompts,
                            false,
                            { boundPrompt, requestId }
                        );
                    } else {
                        result = await translateMarkdown(
                            task.content,
                            targetLang,
                            model,
                            apiKey,
                            taskLogContext,
                            updatedSystemPrompt,
                            defaultUserPromptTemplate,
                            useCustomPrompts,
                            false,
                            { boundPrompt, requestId }
                        );
                    }
                    //console.log('document.js translateMarkdown 返回:', result);
                    translationResults.set('text-' + task.index, result);
                } else if (task.type === 'table') {
                    // 翻譯表格
                    let tableSystemPrompt = `你是一個精確翻譯表格的助手。請將表格翻譯成${targetLang}，嚴格保持以下格式要求：
1. 保持所有表格分隔符（|）和結構完全不變
2. 保持表格對齊標記（:--:、:--、--:）不變
3. 保持表格的行數和列數完全一致
4. 保持數學公式、符號和百分比等專業內容不變
5. 翻譯表格標題（如有）和表格內的文字內容
6. 表格內容與表格外內容要明確區分`;

                    // 注入術語庫（如啟用且有命中）
                    try {
                        const settingsForGlossary = (typeof loadSettings === 'function') ? loadSettings() : {};
                        const glossaryEnabled = !!settingsForGlossary.enableGlossary;
                        if (glossaryEnabled && typeof getGlossaryMatchesForText === 'function') {
                            const matches = getGlossaryMatchesForText(task.content);
                            if (matches && matches.length > 0 && typeof buildGlossaryInstruction === 'function') {
                                const instr = buildGlossaryInstruction(matches, targetLang);
                                if (instr) {
                                    tableSystemPrompt = tableSystemPrompt + "\n\n" + instr;
                                    if (typeof addProgressLog === 'function') {
                                        const names = matches.slice(0, 6).map(m => m.term).join(', ');
                                        addProgressLog(`${taskLogContext} [表格] 命中備擇庫 ${matches.length} 條：${names}${matches.length>6?'...':''}`);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Glossary injection for table skipped due to error:', e);
                    }

                    // 使用者提示詞
                    const tableUserPrompt = `請將以下Markdown表格翻譯成${targetLang}，請確保完全保持表格結構和格式：

${task.content}

注意：請保持表格格式完全不變，包括所有的 | 符號、對齊標記、數學公式和符號。`;

                    // 構建請求體
                    const requestBody = apiConfig.bodyBuilder
                        ? apiConfig.bodyBuilder(tableSystemPrompt, tableUserPrompt, {
                            processedText: task.content,
                            rawText: task.content,
                            targetLang,
                            tablePlaceholder: task.placeholder,
                            requestType: 'table'
                        })
                        : {
                            model: apiConfig.modelName,
                            messages: [
                                { role: "system", content: tableSystemPrompt },
                                { role: "user", content: tableUserPrompt }
                            ]
                        };

                    // 呼叫API翻譯表格
                    const translatedTable = await callTranslationApi(apiConfig, requestBody);

                    // 提取和清理翻譯結果中的表格部分
                    const cleanedTable = typeof extractTableFromTranslation === 'function' ?
                                         (extractTableFromTranslation(translatedTable) || task.content) :
                                         task.content;

                    translationResults.set('table-' + task.index, {
                        placeholder: task.placeholder,
                        translatedContent: cleanedTable
                    });
                }

                if (typeof releaseSlot === "function") {
                    releaseSlot();
                }
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${taskLogContext} 翻譯槽已釋放 (成功)。`);
                }
                return; // 成功，退出重試迴圈

            } catch (error) {
                // 釋放翻譯槽
                if (typeof releaseSlot === "function") {
                    releaseSlot();
                }
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${taskLogContext} 翻譯槽已釋放 (失敗)。`);
                }
                lastError = error;
                console.error(`${taskLogContext} 翻譯失敗 (嘗試 ${attemptNum}/${MAX_TRANSLATION_RETRIES + 1}):`, error);
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${taskLogContext} 警告: 翻譯失敗 (嘗試 ${attemptNum}/${MAX_TRANSLATION_RETRIES + 1}) - ${error.message}.`);
                }

                if (attempt < MAX_TRANSLATION_RETRIES) {
                    const delay = typeof getRetryDelay === 'function' ?
                                  getRetryDelay(attempt) :
                                  Math.min(1000 * Math.pow(2, attempt), 30000);

                    if (typeof addProgressLog === "function") {
                        addProgressLog(`${taskLogContext} ${delay.toFixed(0)}ms 後重試...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    if (typeof addProgressLog === "function") {
                        addProgressLog(`${taskLogContext} 已達最大重試次數 (${MAX_TRANSLATION_RETRIES + 1}次嘗試)，使用原文。`);
                    }
                    hasErrors = true;

                    // 儲存原始內容作為結果
                    if (task.type === 'text') {
                        translationResults.set('text-' + task.index,
                            `\n\n> **[翻譯錯誤 (重試 ${MAX_TRANSLATION_RETRIES + 1} 次失敗) - 保留原文 Part ${task.index+1}]**\n\n${task.content}\n\n`);
                    } else if (task.type === 'table') {
                        translationResults.set('table-' + task.index, {
                            placeholder: task.placeholder,
                            translatedContent: task.content
                        });
                    }
                    return; // 結束重試
                }
            }
        }

        console.error(`${taskLogContext} Unexpected state reached after retry loop.`);
        if (typeof addProgressLog === "function") {
            addProgressLog(`${taskLogContext} 警告: 翻譯重試邏輯結束後狀態意外，保留原文。`);
        }
        hasErrors = true;

        // 安全兜底，儲存原始內容
        if (task.type === 'text') {
            translationResults.set('text-' + task.index,
                `\n\n> **[翻譯意外失敗 - 保留原文 Part ${task.index+1}]**\n\n${task.content}\n\n`);
        } else if (task.type === 'table') {
            translationResults.set('table-' + task.index, {
                placeholder: task.placeholder,
                translatedContent: task.content
            });
        }
    });

    // 等待所有並行翻譯任務完成
    try {
        await Promise.all(translationPromises);
    } catch (error) {
        console.error(`${logContext} An unexpected error occurred during Promise.all for translations:`, error);
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 錯誤: 並行翻譯過程中出現意外錯誤。`);
        }
        hasErrors = true;
    }

    if (hasErrors) {
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 部分或全部翻譯任務處理失敗 (已完成重試)。`);
        }
    } else {
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 所有翻譯任務處理完成。`);
        }
    }

    // 構建翻譯後表格佔位符對映
    let translatedTablePlaceholders = {};
    if (hasProtectedTables) {
        for (let i = 0; i < Object.keys(tablePlaceholders).length; i++) {
            const tableResult = translationResults.get('table-' + i);
            if (tableResult && tableResult.placeholder) {
                translatedTablePlaceholders[tableResult.placeholder] = tableResult.translatedContent;
            }
        }
    }

    // 收集所有文字塊的翻譯結果（原文和譯文都做表格還原）
    const restoredOcrChunks = [];
    const translatedTextChunks = [];
    for (let i = 0; i < originalTextChunks.length; i++) {
        let ocrChunk = originalTextChunks[i];
        let translatedChunk = translationResults.get('text-' + i);
        // 原文分塊還原原文表格
        if (hasProtectedTables && typeof restoreMarkdownTables === 'function') {
            ocrChunk = await restoreMarkdownTables(ocrChunk, tablePlaceholders);
        }
        // 譯文分塊還原翻譯後表格
        if (hasProtectedTables && typeof restoreMarkdownTables === 'function') {
            translatedChunk = await restoreMarkdownTables(translatedChunk, translatedTablePlaceholders);
        }
        restoredOcrChunks.push(ocrChunk);
        translatedTextChunks.push(translatedChunk || originalTextChunks[i]);
    }

    // 合併已翻譯的塊
    let combinedTranslation = translatedTextChunks.join('\n\n');

    // 如果有表格，替換所有表格佔位符（保險起見，整體再替換一遍）
    if (hasProtectedTables) {
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 正在替換表格佔位符...`);
        }

        for (let i = 0; i < Object.keys(translatedTablePlaceholders).length; i++) {
            const placeholder = Object.keys(translatedTablePlaceholders)[i];
            const translatedContent = translatedTablePlaceholders[placeholder];
            combinedTranslation = combinedTranslation.replace(
                placeholder,
                translatedContent
            );
        }

        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 表格佔位符替換完成。`);
        }
    }

    return {
        translatedText: combinedTranslation,
        originalChunks: restoredOcrChunks, // 現在是還原了表格的原文分塊
        translatedTextChunks: translatedTextChunks // 現在是還原了表格的譯文分塊
    };
}

// 將函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.splitMarkdownIntoChunks = splitMarkdownIntoChunks;
    processModule.splitByParagraphs = splitByParagraphs;
    processModule.translateLongDocument = translateLongDocument;
}
