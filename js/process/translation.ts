// process/translation.js

// 輔助函式：構建預定義 API 配置
/**
 * 為預定義的翻譯模型構建 API 請求配置。
 * 此函式接收一個基礎的 API 配置物件 (`apiConfig`) 和 API 金鑰 (`key`)，
 * 然後根據模型名稱（從 `apiConfig.modelName` 中提取並轉換為小寫）來設定特定的認證標頭。
 *
 * 主要邏輯：
 * 1. **配置淺複製**：建立 `apiConfig` 和 `apiConfig.headers` 的淺複製，以避免修改原始物件。
 * 2. **認證標頭設定**：
 *    - 將 `config.modelName` 轉為小寫進行比較。
 *    - 如果模型名稱包含 "claude"，則在標頭設定 `x-api-key`。
 *    - 如果模型名稱包含 "gemini"，則將 API 金鑰作為查詢引數 `key` 追加到端點 URL。
 *      它會正確處理端點 URL 中可能已存在的查詢引數。
 *    - 對於其他模型（如 Mistral, DeepSeek 等），預設在標頭設定 `Authorization: Bearer {key}`。
 * 3. **返回配置**：返回更新後的配置物件。
 *
 * @param {Object} apiConfig - 預定義模型的初始配置物件，通常包含 `endpoint`, `modelName`, `headers`, `bodyBuilder`, `responseExtractor`。
 * @param {string} key - 用於認證的 API 金鑰。
 * @returns {Object} 新增了認證標頭（或更新了端點）的完整 API 配置物件。
 */
function buildPredefinedApiConfig(apiConfig, key) {
    const config = { ...apiConfig }; // 淺複製
    config.headers = { ...config.headers }; // 淺複製 headers

    // 設定認證 - 新增防禦性檢查，避免在modelName為undefined時呼叫toLowerCase()
    const modelNameLower = config.modelName ? config.modelName.toLowerCase() : '';

    if (modelNameLower.includes('claude')) {
        config.headers['x-api-key'] = key;
    } else if (modelNameLower.includes('gemini')) {
        // Correctly handle potential existing query parameters
        let baseUrl = config.endpoint.split('?')[0];
        config.endpoint = `${baseUrl}?key=${key}`;
    } else if (modelNameLower.includes('deeplx')) {
        const encodedKey = encodeURIComponent(key.trim());
        const placeholderPatterns = ['{API_KEY}', '{api_key}', '{apiKey}', '{key}', '__API_KEY__', '<api-key>', '<API_KEY>', ':API_KEY', ':api_key', ':key', '${API_KEY}', '${api_key}'];
        let endpoint = config.endpoint || '';
        let replaced = false;
        placeholderPatterns.forEach(function(pattern) {
            if (endpoint.includes(pattern)) {
                endpoint = endpoint.replace(new RegExp(pattern, 'g'), encodedKey);
                replaced = true;
            }
        });
        if (!replaced) {
            // 如果模板中未包含佔位符，則嘗試在末尾追加 Key
            if (!endpoint.endsWith('/')) endpoint += '/';
            endpoint += encodedKey;
        }
        config.endpoint = endpoint;
        // DeepLX 介面通常不需要 Authorization 頭，確保移除可能的殘留
        if (config.headers['Authorization']) delete config.headers['Authorization'];
    } else {
        config.headers['Authorization'] = `Bearer ${key}`;
    }
    return config;
}


function buildInstructionBlock(content) {
    const trimmed = (content || '').trim();
    if (!trimmed) return '';
    return `[[PBX_INSTR_START]]
${trimmed}
[[PBX_INSTR_END]]

`;
}

function stripInstructionBlocks(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\s*\[\[PBX_INSTR_START\]\][\s\S]*?\[\[PBX_INSTR_END\]\]\s*/gi, '').trim();
}


function joinUrlSegments(base, segment) {
    if (!base) return segment || '';
    if (!segment) return base;
    const hasTrailingSlash = base.endsWith('/');
    const hasLeadingSlash = segment.startsWith('/');
    if (hasTrailingSlash && hasLeadingSlash) {
        return base + segment.slice(1);
    }
    if (!hasTrailingSlash && !hasLeadingSlash) {
        return `${base}/${segment}`;
    }
    return base + segment;
}

function appendQueryParam(urlString, param, value) {
    try {
        const url = new URL(urlString);
        url.searchParams.set(param, value);
        return url.toString();
    } catch (error) {
        const sanitized = urlString.replace(new RegExp(`([?&])${param}=[^&]*`, 'i'), '$1').replace(/[?&]$/, '');
        const separator = sanitized.includes('?') ? '&' : '?';
        return `${sanitized}${separator}${encodeURIComponent(param)}=${encodeURIComponent(value)}`;
    }
}

function extractGeminiModelId(pathname) {
    if (typeof pathname !== 'string') return null;
    const match = pathname.match(/\/models\/([^/:]+)(?::generatecontent)?$/i);
    return match ? match[1] : null;
}

function normalizeGeminiEndpoint(baseUrlInput, modelIdInput, requestFormat) {
    if (!baseUrlInput || typeof baseUrlInput !== 'string') {
        throw new Error('自定義 Gemini 模型需要提供有效的 API 地址');
    }

    let url;
    try {
        url = new URL(baseUrlInput.trim());
    } catch (error) {
        try {
            url = new URL(`https://${baseUrlInput.trim()}`);
        } catch (_) {
            throw new Error('Gemini API Base URL 必須包含協議，例如 https://generativelanguage.googleapis.com');
        }
    }

    url.searchParams.delete('key');

    let path = url.pathname || '';
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    const defaultModelId = requestFormat === 'gemini-preview'
        ? 'gemini-2.5-flash-preview-05-20'
        : 'gemini-2.0-flash';

    const inferredModelId = extractGeminiModelId(path);
    const resolvedModelId = (modelIdInput && modelIdInput.trim()) || inferredModelId || defaultModelId;
    const lowerPath = (path || '').toLowerCase();
    const endsWithGenerate = /:generatecontent$/i.test(lowerPath);

    if (!path || path === '/') {
        path = `/v1beta/models/${resolvedModelId}:generateContent`;
    } else if (/\/models\/$/i.test(path)) {
        path = `${path}${resolvedModelId}:generateContent`;
    } else if (/\/models$/i.test(path)) {
        path = `${path}/${resolvedModelId}:generateContent`;
    } else if (/\/models\/[^/]+$/i.test(path)) {
        path = path.replace(/\/models\/[^/]+$/i, `/models/${resolvedModelId}`);
        if (!endsWithGenerate) {
            path = `${path}:generateContent`;
        }
    } else if (/\/v1beta$/i.test(path) || /\/v1$/i.test(path)) {
        path = `${path}/models/${resolvedModelId}:generateContent`;
    } else if (!endsWithGenerate) {
        path = `${path}/v1beta/models/${resolvedModelId}:generateContent`;
    }

    if (!/:generatecontent$/i.test(path)) {
        path = `${path}:generateContent`;
    }

    url.pathname = path;
    url.search = '';

    return {
        endpoint: url.toString(),
        modelName: resolvedModelId
    };
}

function normalizeOpenAIEndpoint(baseApiUrlInput, format, endpointMode = 'auto', targetSegment) {
    if (!baseApiUrlInput || typeof baseApiUrlInput !== 'string') {
        throw new Error('自定義模型需要提供 API Base URL');
    }

    const trimmed = baseApiUrlInput.trim();
    if (!trimmed) {
        throw new Error('自定義模型需要提供 API Base URL');
    }

    const mode = endpointMode || 'auto';
    const normalizedSegment = (targetSegment
        ? targetSegment
        : (format === 'anthropic' ? 'messages' : 'chat/completions'))
        .replace(/^\/+/, '');

    const lower = trimmed.toLowerCase();
    const base = trimmed.replace(/\/+$/, '');
    const v1Segment = normalizedSegment.startsWith('v1/') ? normalizedSegment : `v1/${normalizedSegment}`;

    const terminalPaths = [
        normalizedSegment,
        `/${normalizedSegment}`,
        v1Segment,
        `/${v1Segment}`
    ];

    if (terminalPaths.some(path => lower.endsWith(path))) {
        return base;
    }

    if (mode === 'manual') {
        return base;
    }

    if (mode === 'chat') {
        return joinUrlSegments(base, normalizedSegment);
    }

    if (/\/v1$/.test(lower)) {
        return joinUrlSegments(base, normalizedSegment);
    }

    return joinUrlSegments(base, v1Segment);
}


const DEEPLX_LANG_CODE_MAP = {
    'bulgarian': 'BG', 'bg': 'BG', 'български': 'BG', '保加利亞語': 'BG',
    'chinese': 'ZH', 'zh': 'ZH', 'zh-cn': 'ZH', 'zh_cn': 'ZH', '中文': 'ZH', '中文(簡體)': 'ZH', '繁體中文': 'ZH', 'traditional chinese': 'ZH', 'zh-tw': 'ZH', 'zh_tw': 'ZH', '中文(繁體)': 'ZH', '繁體中文': 'ZH',
    'czech': 'CS', 'cs': 'CS', 'čeština': 'CS', '捷克語': 'CS',
    'danish': 'DA', 'da': 'DA', 'dansk': 'DA', '丹麥語': 'DA',
    'dutch': 'NL', 'nl': 'NL', 'nederlands': 'NL', '荷蘭語': 'NL',
    'english': 'EN', 'en': 'EN', 'english (uk)': 'EN', 'english (gb)': 'EN', 'en-gb': 'EN', 'english (us)': 'EN', 'en-us': 'EN', 'english (american)': 'EN', '英語': 'EN',
    'estonian': 'ET', 'et': 'ET', 'eesti': 'ET', '愛沙尼亞語': 'ET',
    'finnish': 'FI', 'fi': 'FI', 'suomi': 'FI', '芬蘭語': 'FI',
    'french': 'FR', 'fr': 'FR', 'français': 'FR', '法語': 'FR',
    'german': 'DE', 'de': 'DE', 'deutsch': 'DE', '德語': 'DE',
    'greek': 'EL', 'el': 'EL', 'ελληνικά': 'EL', '希臘語': 'EL',
    'hungarian': 'HU', 'hu': 'HU', 'magyar': 'HU', '匈牙利語': 'HU',
    'italian': 'IT', 'it': 'IT', 'italiano': 'IT', '義大利語': 'IT',
    'japanese': 'JA', 'ja': 'JA', '日本語': 'JA', '日語': 'JA',
    'latvian': 'LV', 'lv': 'LV', 'latviešu': 'LV', '拉脫維亞語': 'LV',
    'lithuanian': 'LT', 'lt': 'LT', 'lietuvių': 'LT', '立陶宛語': 'LT',
    'polish': 'PL', 'pl': 'PL', 'polski': 'PL', '波蘭語': 'PL',
    'portuguese': 'PT', 'pt': 'PT', 'português': 'PT', 'portuguese (portugal)': 'PT', '葡萄牙語': 'PT', '葡萄牙語（葡萄牙）': 'PT', '葡萄牙語（巴西）': 'PT', 'portuguese (brazil)': 'PT', 'pt-br': 'PT',
    'romanian': 'RO', 'ro': 'RO', 'română': 'RO', '羅馬尼亞語': 'RO',
    'russian': 'RU', 'ru': 'RU', 'русский': 'RU', '俄語': 'RU'
};



const DEEPLX_LANG_DISPLAY = {
    'BG': { zh: '保加利亞語', native: 'Български' },
    'ZH': { zh: '中文', native: '中文' },
    'CS': { zh: '捷克語', native: 'Česky' },
    'DA': { zh: '丹麥語', native: 'Dansk' },
    'NL': { zh: '荷蘭語', native: 'Nederlands' },
    'EN': { zh: '英語', native: 'English' },
    'ET': { zh: '愛沙尼亞語', native: 'Eesti' },
    'FI': { zh: '芬蘭語', native: 'Suomi' },
    'FR': { zh: '法語', native: 'Français' },
    'DE': { zh: '德語', native: 'Deutsch' },
    'EL': { zh: '希臘語', native: 'Ελληνικά' },
    'HU': { zh: '匈牙利語', native: 'Magyar' },
    'IT': { zh: '義大利語', native: 'Italiano' },
    'JA': { zh: '日語', native: '日本語' },
    'LV': { zh: '拉脫維亞語', native: 'Latviešu' },
    'LT': { zh: '立陶宛語', native: 'Lietuvių' },
    'PL': { zh: '波蘭語', native: 'Polski' },
    'PT': { zh: '葡萄牙語', native: 'Português' },
    'RO': { zh: '羅馬尼亞語', native: 'Română' },
    'RU': { zh: '俄語', native: 'Русский' }
};





function mapToDeeplxLangCode(targetLang) {
    if (!targetLang) return undefined;
    const normalized = String(targetLang).trim();
    if (!normalized) return undefined;
    const lower = normalized.toLowerCase();
    if (DEEPLX_LANG_CODE_MAP[lower]) {
        return DEEPLX_LANG_CODE_MAP[lower];
    }
    if (/^[a-z]{2}$/i.test(normalized)) {
        return normalized.toUpperCase();
    }
    if (/^[a-z]{2}-[a-z]{2}$/i.test(normalized)) {
        return normalized.toUpperCase();
    }
    return undefined;
}

if (typeof window !== 'undefined') {
    window.mapToDeeplxLangCode = mapToDeeplxLangCode;
    window.DEEPLX_LANG_CODE_MAP = DEEPLX_LANG_CODE_MAP;
    window.DEEPLX_LANG_DISPLAY = DEEPLX_LANG_DISPLAY;
    if (typeof window.updateDeeplxTargetLangHint === 'function') {
        try { window.updateDeeplxTargetLangHint(); } catch (e) { console.warn('updateDeeplxTargetLangHint failed', e); }
    }
}

// 輔助函式：構建自定義 API 配置
/**
 * 為使用者自定義的翻譯模型構建 API 請求配置（翻譯模組專用，避免與聊天模組衝突）。
 * 此函式根據使用者提供的基礎 URL、模型 ID、請求格式、金鑰以及可選的溫度和最大 token 數，
 * 生成一個完整的、可用於呼叫自定義翻譯 API 的配置物件。
 *
 * 主要邏輯：
 * 1. **格式歸一化**：根據 `customRequestFormat` 統一為小寫格式，預設視為 `openai`。
 * 2. **端點規範化**：
 *    - 對於 OpenAI 相容（含預設）與 Anthropic 格式，使用 `normalizeOpenAIEndpoint` 根據格式智慧拼接 `/v1/chat/completions` 或 `/v1/messages` 等常用字尾，避免重複追加。
 *    - 對於 Gemini (`gemini` / `gemini-preview`)，透過 `normalizeGeminiEndpoint` 解析或自動補全 `/v1beta/models/{modelId}:generateContent` 路徑，並移除可能殘留的 `key` 查詢引數。
 *    - Gemini 端點會在後續步驟中附加 `?key={API Key}` 查詢引數。
 * 3. **配置物件初始化**：建立包含 `endpoint`, `modelName`, `headers`, `bodyBuilder`, `responseExtractor` 的配置。
 * 4. **按格式生成請求構造器與響應解析器**：
 *    - `openai`：使用 Bearer Token 認證，構建傳統聊天補全請求體，並從 `choices[0].message.content` 中提取結果。
 *    - `anthropic`：設定 `x-api-key` 與 `anthropic-version` 標頭，構建 Claude 相容訊息體，從 `content[0].text` 中提取結果。
 *    - `gemini` / `gemini-preview`：將系統提示與使用者提示合併到 Gemini `contents` 結構，配置 `generationConfig`，並從 `candidates[0].content.parts[0].text` 中提取結果（預覽版本額外指定 `responseModalities`）。
 *    - 其他未知格式：回退到 OpenAI 相容請求結構並行出警告。
 * 5. **返回配置**：最終返回可直接用於請求翻譯 API 的配置物件。
 *
 * @param {string} key - API 金鑰。
 * @param {string} baseApiUrlInput - 使用者提供的 API 基礎 URL (例如 `https://api.example.com` 或 `https://api.gemini.example/v1beta/models/gemini-pro:generateContent`)。
 * @param {string} customModelId - 使用者指定的模型 ID (例如 `gpt-3.5-turbo`, `claude-2`, `gemini-pro`)。
 * @param {string} customRequestFormat - 請求體和響應體的格式型別 (如 'openai', 'anthropic', 'gemini')。
 * @param {number} [temperature] - (可選) 模型生成時的溫度引數。
 * @param {number} [max_tokens] - (可選) 模型生成的最大 token 數。
 * @returns {Object} 構建好的 API 配置物件，包含 `endpoint`, `modelName`, `headers`, `bodyBuilder`, `responseExtractor`。
 */
const buildCustomApiConfigForTranslation = function(key, baseApiUrlInput, customModelId, customRequestFormat, temperature, max_tokens, options = {}) {
    const format = (customRequestFormat || 'openai').toLowerCase();
    let effectiveModelId = (customModelId && customModelId.trim()) || '';
    const endpointMode = options.endpointMode || 'auto';

    let finalApiEndpoint;
    if (format === 'gemini' || format === 'gemini-preview') {
        const geminiInfo = normalizeGeminiEndpoint(baseApiUrlInput, effectiveModelId, format);
        finalApiEndpoint = appendQueryParam(geminiInfo.endpoint, 'key', key);
        effectiveModelId = geminiInfo.modelName;
    }
    else {
        finalApiEndpoint = normalizeOpenAIEndpoint(baseApiUrlInput, format, endpointMode);
    }

    const config = {
        endpoint: finalApiEndpoint,
        modelName: effectiveModelId,
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: null,
        responseExtractor: null
    };

    const temperatureValue = temperature ?? 0.5;
    const maxTokensValue = max_tokens ?? 8000;
    const modelToUse = effectiveModelId || customModelId;

    switch (format) {
        case 'openai':
            config.headers['Authorization'] = `Bearer ${key}`;
            config.bodyBuilder = (sys_prompt, user_prompt) => ({
                model: modelToUse,
                messages: [{ role: "system", content: sys_prompt }, { role: "user", content: user_prompt }],
                temperature: temperatureValue,
                max_tokens: maxTokensValue
            });
            config.responseExtractor = (data) => data?.choices?.[0]?.message?.content;
            break;
        case 'anthropic':
            config.headers['x-api-key'] = key;
            config.headers['anthropic-version'] = '2023-06-01';
            config.bodyBuilder = (sys_prompt, user_prompt) => ({
                model: modelToUse,
                system: sys_prompt,
                messages: [{ role: "user", content: user_prompt }],
                temperature: temperatureValue,
                max_tokens: maxTokensValue
            });
            config.responseExtractor = (data) => data?.content?.[0]?.text;
            break;
        case 'gemini':
        case 'gemini-preview':
            config.modelName = effectiveModelId;
            config.headers = { 'Content-Type': 'application/json' };
            const geminiMaxTokens = max_tokens ?? 8192;
            config.bodyBuilder = (sys_prompt, user_prompt) => ({
                contents: [{ role: "user", parts: [{ text: `${sys_prompt}\n\n${user_prompt}` }] }],
                generationConfig: {
                    temperature: temperatureValue,
                    maxOutputTokens: geminiMaxTokens,
                    ...(format === 'gemini-preview' ? { responseModalities: ["TEXT"], responseMimeType: 'text/plain' } : {})
                }
            });
            config.responseExtractor = (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text;
            break;
        default:
            config.headers['Authorization'] = `Bearer ${key}`;
            config.bodyBuilder = (sys_prompt, user_prompt) => ({
                model: modelToUse,
                messages: [{ role: "system", content: sys_prompt }, { role: "user", content: user_prompt }],
                temperature: temperatureValue,
                max_tokens: maxTokensValue
            });
            config.responseExtractor = (data) => data?.choices?.[0]?.message?.content;
            console.warn(`Unsupported custom request format: ${customRequestFormat}. Defaulting to OpenAI-like structure.`);
            break;
    }
    return config;
}

/**
 * 翻譯單個 Markdown 文字塊，支援預定義模型和自定義模型，並可選擇性處理內嵌的表格佔位符。
 *
 * 主要步驟：
 * 1. **引數處理與相容性**：
 *    - 由於函式簽名在支援自定義模型配置 (`modelConfig`) 時變得複雜，透過檢查 `arguments` 來正確解析傳入的引數，
 *      特別是當 `model` 為 "custom" 時，`modelConfigForCustom` 從 `arguments[4]` 獲取，後續引數依次順延。
 * 2. **表格預處理** (如果 `actualProcessTablePlaceholders` 為 true 且 `protectMarkdownTables` 函式可用)：
 *    - 呼叫 `protectMarkdownTables` 將 Markdown 中的表格替換為佔位符 (如 `__TABLE_PLACEHOLDER_0__`)。
 *    - 儲存原始表格內容在 `tablePlaceholders` 中。
 *    - 如果檢測到表格，則在系統提示中追加說明，告知模型如何處理這些佔位符（即保持不變）。
 * 3. **構建 Prompt**：
 *    - 初始化 `systemPrompt` 和 `userPrompt`。
 *    - 如果使用了表格保護，則向 `systemPrompt` 追加關於如何處理表格佔位符的指示。
 *    - 如果未使用自定義提示 (`!actualUseCustomPrompts`) 或者自定義提示為空，則呼叫 `getBuiltInPrompts` (如果可用) 獲取內建的針對目標語言的提示模板，否則使用非常基礎的兜底提示。
 *    - **替換模板變數**：在最終的 `userPrompt` 中，將 `${targetLangName}` 替換為實際的目標語言名稱，將 `${content}` 替換為經過表格預處理的文字 (`processedText`)。
 *    - *警告檢查*：如果最終的 `userPrompt` 未包含 `processedText`，則列印警告，因為模型可能無法接收到待翻譯內容。
 * 4. **構建 API 配置 (`apiConfig`)**：
 *    - 如果 `model` 是 "custom"：
 *      - 檢查 `modelConfigForCustom` 是否有效（包含端點和模型 ID）。
 *      - 呼叫 `buildCustomApiConfig` 生成配置。
 *    - 否則（預定義模型）：
 *      - 從全域設定 (`loadSettings`) 中獲取溫度和最大 token 數等引數。
 *      - 定義一個包含各預設模型（如 'deepseek', 'gemini', 'mistral', 'tongyi-...', 'volcano-...'）詳細配置的 `predefinedConfigs` 物件。
 *        每個模型的配置包括 `endpoint`, `modelName`, `headers`, `bodyBuilder`, `responseExtractor`。
 *      - 檢查選定的 `model` 是否在 `predefinedConfigs` 中，如果不在則丟擲錯誤。
 *      - 呼叫 `buildPredefinedApiConfig` 生成配置。
 * 5. **構建請求體 (`requestBody`)**：
 *    - 使用 `apiConfig.bodyBuilder` (如果存在) 並傳入 `systemPrompt` 和 `userPrompt` 來構建請求體。
 *    - 如果 `bodyBuilder` 不存在，則構建一個通用的包含 `model` 和 `messages` (system + user) 的請求體。
 * 6. **呼叫翻譯 API**：
 *    - 呼叫 `callTranslationApi` (應為實際的 fetch 呼叫封裝) 並傳入 `apiConfig` 和 `requestBody`，獲取翻譯結果 `result`。
 * 7. **表格後處理** (如果之前進行了表格保護且 `actualProcessTablePlaceholders` 為 true 且 `extractTableFromTranslation` 函式可用)：
 *    - **逐個翻譯表格內容**：
 *      - 走訪 `tablePlaceholders` 中的每個原始表格。
 *      - 為每個表格構建特定的翻譯提示（強調保持結構，僅翻譯文字）。
 *      - 再次呼叫 `callTranslationApi` 翻譯該表格。
 *      - 使用 `extractTableFromTranslation` 從翻譯結果中提取純淨的表格 Markdown。
 *      - 在主翻譯結果 `finalResult` (初始為 `result`) 中，用翻譯後的表格替換其佔位符。
 *      - 如果表格翻譯或提取失敗，則用原始表格替換佔位符作為兜底。
 *    - 返回包含已翻譯並恢復表格的 `finalResult`。
 * 8. **直接返回結果**：如果未進行表格處理，則直接返回步驟 6 中得到的 `result`。
 *
 * @param {string} markdown - 待翻譯的 Markdown 文字塊。
 * @param {string} targetLang - 目標翻譯語言程式碼 (如 'zh-TW', 'en')。
 * @param {string} model - 使用的翻譯模型名稱 (如 'mistral', 'custom', 'deepseek')。
 * @param {string} apiKey - 對應翻譯模型的 API 金鑰。
 * @param {string} [logContext=""] - (或 `modelConfig` 當 `model`='custom') 日誌記錄的上下文字首。如果 `model` 為 "custom"，此位置應為 `modelConfig` 物件，後續引數順延。
 * @param {string} [defaultSystemPrompt=""] - (順延引數) 翻譯時使用的預設系統提示詞。
 * @param {string} [defaultUserPromptTemplate=""] - (順延引數) 翻譯時使用的預設使用者提示詞模板 (應包含 `${content}` 和 `${targetLangName}` 佔位符)。
 * @param {boolean} [useCustomPrompts=false] - (順延引數) 是否使用使用者自定義的提示詞。
 * @param {boolean} [processTablePlaceholders=true] - (順延引數) 是否對文字中的 Markdown 表格進行佔位符保護和獨立翻譯處理。
 * @returns {Promise<string>} 翻譯後的 Markdown 文字塊。如果處理了表格，則表格內容也會被翻譯並恢復到文字中。
 * @throws {Error} 如果模型名稱不支援、自定義模型配置不完整，或在API呼叫過程中發生不可恢復的錯誤。
 */
async function translateMarkdown(
    markdown,
    targetLang,
    model,
    apiKey,
    logContext = "",
    defaultSystemPrompt = "",
    defaultUserPromptTemplate = "",
    useCustomPrompts = false,
    processTablePlaceholders = true,
    options = {}
) {
    //console.log('translateMarkdown 分塊內容:', markdown);

    let actualLogContext = logContext;
    let actualDefaultSystemPrompt = defaultSystemPrompt;
    let actualDefaultUserPromptTemplate = defaultUserPromptTemplate;
    let actualUseCustomPrompts = useCustomPrompts;
    let actualProcessTablePlaceholders = processTablePlaceholders;
    let modelConfigForCustom = null;

    if (model === "custom") {
        modelConfigForCustom = arguments[4]; // 這是從呼叫處傳來的 modelConfig
        actualLogContext = arguments[5] !== undefined ? arguments[5] : "";
        actualDefaultSystemPrompt = arguments[6] !== undefined ? arguments[6] : "";
        actualDefaultUserPromptTemplate = arguments[7] !== undefined ? arguments[7] : "";
        actualUseCustomPrompts = arguments[8] !== undefined ? arguments[8] : false;
        actualProcessTablePlaceholders = arguments[9] !== undefined ? arguments[9] : true;
        options = arguments[10] !== undefined ? arguments[10] : {};
    }

    // 表格預處理 - 僅當需要處理表格時
    let processedText = markdown;
    let tablePlaceholders = {};
    let hasProtectedTables = false;

    if (actualProcessTablePlaceholders && typeof protectMarkdownTables === 'function') {
        const processed = protectMarkdownTables(markdown);
        processedText = processed.processedText;
        tablePlaceholders = processed.tablePlaceholders;
        hasProtectedTables = Object.keys(tablePlaceholders).length > 0;

        if (hasProtectedTables) {
            console.log(`${actualLogContext} 檢測到 ${Object.keys(tablePlaceholders).length} 個表格，已進行特殊保護`);
            if (typeof addProgressLog === "function") {
                addProgressLog(`${actualLogContext} 檢測到 ${Object.keys(tablePlaceholders).length} 個表格，將作為整體處理`);
            }
        }
    }

    // 構建 prompt - 整合提示詞池支援
    let systemPrompt = actualDefaultSystemPrompt;
    let userPrompt = actualDefaultUserPromptTemplate;

    // 增加表格處理提示
    let tableHandlingNote = "";
    if (hasProtectedTables) {
        tableHandlingNote = "\n\n注意：文件中的表格已被特殊標記為佔位符（如__TABLE_PLACEHOLDER_0__），請直接翻譯佔位符以外的內容，保持佔位符不變。表格將在後續步驟中單獨處理。";
    }

    // 檢查是否應該使用提示詞池（支援外部綁定覆蓋）
    let usePromptPool = false;
    let promptFromPool = null;

    // 嘗試從提示詞池UI獲取提示詞（如果可用）
    if (!options.boundPrompt && typeof window !== 'undefined' && window.promptPoolUI) {
        const poolPrompt = window.promptPoolUI.getPromptForTranslation();
        if (poolPrompt) {
            // 僅當提示詞非空時才啟用提示詞池
            const sys = (poolPrompt.systemPrompt || '').trim();
            const usr = (poolPrompt.userPromptTemplate || '').trim();
            if (sys && usr) {
                promptFromPool = poolPrompt;
                usePromptPool = true;
            }
        }
    }
    // 如果呼叫方傳入 boundPrompt，則優先使用
    if (options.boundPrompt && options.boundPrompt.id && options.boundPrompt.systemPrompt && options.boundPrompt.userPromptTemplate) {
        promptFromPool = options.boundPrompt;
        usePromptPool = true;
    }

    // 根據提示詞來源設定提示詞
    if (usePromptPool && promptFromPool) {
        // 使用提示詞池的提示詞（再次防禦非空）
        const sys = (promptFromPool.systemPrompt || '').trim();
        const usr = (promptFromPool.userPromptTemplate || '').trim();
        if (sys && usr) {
            systemPrompt = sys + tableHandlingNote;
            userPrompt = usr;
            console.log(`[翻譯] 使用提示詞池的提示詞`);
        } else {
            usePromptPool = false; // 回退
        }
    }

    if (!usePromptPool) {
      if (!actualUseCustomPrompts || !systemPrompt || !userPrompt) {
        // 使用內建模板或後備方案
        if (typeof getBuiltInPrompts === "function") {
            const prompts = getBuiltInPrompts(targetLang);
            systemPrompt = prompts.systemPrompt + tableHandlingNote;
            userPrompt = prompts.userPromptTemplate;
        } else {
            // 兜底
            systemPrompt = "You are a professional document translation assistant." + tableHandlingNote;
            userPrompt = "Please translate the following content into the target language:\n\n${content}";
        }
      } else {
        // 使用自定義提示詞（再次檢查非空）
        const sys = (actualDefaultSystemPrompt || '').trim();
        const usr = (actualDefaultUserPromptTemplate || '').trim();
        if (sys && usr) {
            systemPrompt = sys + tableHandlingNote;
            userPrompt = usr;
        } else {
            // 回退到內建
            if (typeof getBuiltInPrompts === "function") {
                const prompts = getBuiltInPrompts(targetLang);
                systemPrompt = prompts.systemPrompt + tableHandlingNote;
                userPrompt = prompts.userPromptTemplate;
            } else {
                systemPrompt = "You are a professional document translation assistant." + tableHandlingNote;
                userPrompt = "Please translate the following content into the target language:\n\n${content}";
            }
        }
      }
    }

    // 注入：翻譯備擇庫（術語庫）命中與提示注入
    try {
        const settingsForGlossary = (typeof loadSettings === 'function') ? loadSettings() : {};
        const glossaryEnabled = !!settingsForGlossary.enableGlossary;
        if (glossaryEnabled && typeof getGlossaryMatchesForText === 'function') {
            const matches = getGlossaryMatchesForText(processedText);
            if (matches && matches.length > 0) {
                const instr = (typeof buildGlossaryInstruction === 'function') ? buildGlossaryInstruction(matches, targetLang) : '';
                if (instr) {
                    systemPrompt = (systemPrompt || '') + "\n\n" + instr;

                    // 獲取實際限制的數量
                    let actualLimit = 50; // 預設
                    if (typeof loadGlossarySets === 'function') {
                        const sets = loadGlossarySets();
                        const setIds = Object.keys(sets || {});
                        for (const id of setIds) {
                            const set = sets[id];
                            if (set && set.enabled && set.maxTermsInPrompt) {
                                actualLimit = set.maxTermsInPrompt;
                                break;
                            }
                        }
                    }
                    const actualCount = Math.min(matches.length, actualLimit);

                    if (typeof addProgressLog === 'function') {
                        const names = matches.slice(0, 6).map(m => m.term).join(', ');
                        const filterInfo = matches.length > actualCount ? ` (已過濾至 ${actualCount} 條)` : '';
                        addProgressLog(`${actualLogContext} 命中術語庫 ${matches.length} 條${filterInfo}：${names}${matches.length>6?'...':''}`);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Glossary injection skipped due to error:', e);
    }

    // 替換模板變數 - 使用預處理後的文字
    userPrompt = userPrompt
        .replace(/\$\{targetLangName\}/g, targetLang)
        .replace(/\$\{content\}/g, processedText);

    if (!userPrompt.includes(processedText)) {
        console.warn('警告：當前 userPrompt 模板未包含 ${content} 佔位符，AI 無法獲得正文內容！');
        //console.warn('當前 userPrompt:', userPrompt);
        //console.warn('當前 processedText:', processedText);
    }

    //console.log('translateMarkdown defaultUserPromptTemplate:', actualDefaultUserPromptTemplate);
    //console.log('translateMarkdown userPrompt (before replace):', userPrompt);

    // 構建 API 配置
    let apiConfig;
    if (model === "custom") {
        // 使用 modelConfigForCustom
        if (!modelConfigForCustom || (!modelConfigForCustom.apiEndpoint && !modelConfigForCustom.apiBaseUrl) || !modelConfigForCustom.modelId) {
            throw new Error('Custom model configuration is incomplete. API Endpoint (或 apiBaseUrl) and Model ID are required.');
        }
        //console.log('translateMarkdown activeModelConfig:', modelConfigForCustom);
        apiConfig = buildCustomApiConfigForTranslation(
            apiKey,
            modelConfigForCustom.apiEndpoint || modelConfigForCustom.apiBaseUrl,
            modelConfigForCustom.modelId,
            modelConfigForCustom.requestFormat || 'openai',
            modelConfigForCustom.temperature !== undefined ? modelConfigForCustom.temperature : 0.5,
            modelConfigForCustom.max_tokens !== undefined ? modelConfigForCustom.max_tokens : 8000,
            {
                endpointMode: modelConfigForCustom.endpointMode || 'auto'
            }
        );
    } else {
        // 預設模型
        // 獲取翻譯引數
        const settings = typeof loadSettings === "function" ? loadSettings() : {};
        const temperature = (settings.customModelSettings && settings.customModelSettings.temperature) || 0.5;
        const maxTokens = (settings.customModelSettings && settings.customModelSettings.max_tokens) || 8000;

        // 允許從配置覆蓋部分預設端點/模型（例如 Gemini 選擇具體模型）
        let geminiEndpointDynamic = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
        try {
            if (typeof loadModelConfig === 'function') {
                const gcfg = loadModelConfig('gemini');
                const preferred = gcfg && (gcfg.preferredModelId || gcfg.modelId);
                if (preferred && typeof preferred === 'string' && preferred.trim()) {
                    geminiEndpointDynamic = `https://generativelanguage.googleapis.com/v1beta/models/${preferred.trim()}:generateContent`;
                }
            }
        } catch (e) { /* ignore and use default */ }

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
                        // 相容舊欄位，自動附加佔位符
                        const base = dlcfg.apiBaseUrl.trim();
                        if (base) {
                            deeplxEndpointTemplate = base.endsWith('/') ? `${base}<api-key>/translate` : `${base}/<api-key>/translate`;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('載入 DeepLX 配置失敗，將使用預設模板。', e);
        }

        // 更新後的預設模型配置
        const predefinedConfigs = {

            'deeplx': {
                endpoint: deeplxEndpointTemplate,
                modelName: 'DeepLX',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: (sys, user, ctx = {}) => {
                    const instructionBlock = ctx && ctx.instructionBlock ? ctx.instructionBlock : buildInstructionBlock(sys);
                    const textContent = ctx && ctx.processedText ? ctx.processedText : user;
                    const payload = {
                        text: `${instructionBlock || ''}${textContent}`
                    };
                    const targetLangCode = mapToDeeplxLangCode(ctx && ctx.targetLang ? ctx.targetLang : undefined);
                    if (targetLangCode) {
                        payload.target_lang = targetLangCode;
                    }
                    if (ctx && ctx.sourceLang) {
                        const sourceCode = mapToDeeplxLangCode(ctx.sourceLang);
                        if (sourceCode) payload.source_lang = sourceCode;
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
            },

            'deepseek': {
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                modelName: 'DeepSeek',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: (sys, user) => {
                    let modelId = 'deepseek-chat';
                    try { const cfg = loadModelConfig && loadModelConfig('deepseek'); if (cfg && (cfg.preferredModelId||cfg.modelId)) modelId = cfg.preferredModelId||cfg.modelId; } catch {}
                    return ({
                    model: modelId,
                    messages: [
                        { role: "system", content: sys },
                        { role: "user", content: user }
                    ],
                    temperature: temperature,
                    max_tokens: maxTokens
                }); },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },

            'gemini': {
                endpoint: geminiEndpointDynamic,
                modelName: 'Google Gemini',
                headers: { 'Content-Type': 'application/json' },
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

            'mistral': {
                endpoint: 'https://api.mistral.ai/v1/chat/completions',
                modelName: 'Mistral Large (mistral-large-latest)',
                headers: { 'Content-Type': 'application/json' },
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
            'tongyi': {
                endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
                modelName: '通義百鍊',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: (sys, user) => {
                    let modelId = 'qwen-turbo-latest';
                    try { const cfg = loadModelConfig && loadModelConfig('tongyi'); if (cfg && (cfg.preferredModelId||cfg.modelId)) modelId = cfg.preferredModelId||cfg.modelId; } catch {}
                    const isQwenMT = typeof modelId === 'string' && modelId.toLowerCase().includes('qwen-mt');
                    const mergedContent = isQwenMT ? `${sys}\n\n${user}`.trim() : null;
                    return ({
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
                }); },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            'volcano': {
                endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
                modelName: '火山引擎',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: (sys, user) => {
                    let modelId = 'doubao-1-5-pro-32k-250115';
                    try { const cfg = loadModelConfig && loadModelConfig('volcano'); if (cfg && (cfg.preferredModelId||cfg.modelId)) modelId = cfg.preferredModelId||cfg.modelId; } catch {}
                    return ({
                    model: modelId,
                    messages: [
                        { role: "system", content: sys },
                        { role: "user", content: user }
                    ],
                    temperature: temperature,
                    max_tokens: Math.min(maxTokens, 16384)
                }); },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            },
            'gemini-preview': {
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent',
                modelName: 'Google gemini-2.5-flash-preview-05-20',
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: (sys, user) => ({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: `${sys}\n\n${user}`
                                }
                            ]
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
            }
        };

        // 檢查選擇的模型是否在預設配置中
        if (!predefinedConfigs[model]) {
            throw new Error(`不支援的翻譯模型: ${model}`);
        }

        apiConfig = buildPredefinedApiConfig(predefinedConfigs[model], apiKey);
    }

    // 構建請求體
    const bodyBuilderContext = {
        processedText,
        targetLang,
        originalText: markdown,
        hasProtectedTables,
        tablePlaceholders,
        options,
        requestType: 'initial',
        instructionBlock: buildInstructionBlock(systemPrompt)
    };

    const requestBody = apiConfig.bodyBuilder
        ? apiConfig.bodyBuilder(systemPrompt, userPrompt, bodyBuilderContext)
        : {
            model: apiConfig.modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        };

    // 實際呼叫（記錄提示詞池使用成功率 + 佇列入隊/出隊）
    let result;
    const poolPromptId = (usePromptPool && promptFromPool && promptFromPool.id) ? promptFromPool.id : null;
    // 入隊（如呼叫方未預入隊，則在此兜底入隊）
    const requestId = options.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    if (!options.requestId && poolPromptId && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.enqueueRequest === 'function') {
        window.translationPromptPool.enqueueRequest(poolPromptId, { requestId, model: apiConfig.modelName || 'unknown' });
    }
    const startTimeMs = Date.now();
    let primaryError = null;
    try {
        // 出隊（開始執行，不再算“待遷移”）
        if (poolPromptId && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.dequeueRequest === 'function') {
            window.translationPromptPool.dequeueRequest(poolPromptId, requestId);
        }
        result = await callTranslationApi(apiConfig, requestBody);
        result = stripInstructionBlocks(result);
        if (poolPromptId && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.recordPromptUsage === 'function') {
            window.translationPromptPool.recordPromptUsage(
                poolPromptId,
                true,
                Date.now() - startTimeMs,
                null,
                { model: apiConfig.modelName || 'unknown', endpoint: apiConfig.endpoint || '' }
            );
        }
    } catch (e) {
        // 出隊（失敗也確保不再算“待遷移”）
        if (poolPromptId && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.dequeueRequest === 'function') {
            window.translationPromptPool.dequeueRequest(poolPromptId, requestId);
        }
        if (poolPromptId && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.recordPromptUsage === 'function') {
            window.translationPromptPool.recordPromptUsage(
                poolPromptId,
                false,
                Date.now() - startTimeMs,
                e && e.message ? e.message : String(e),
                { model: apiConfig.modelName || 'unknown', endpoint: apiConfig.endpoint || '' }
            );
        }
        primaryError = e;
    }

    // 即時切換並重試一次（謹慎）：僅在提示詞池模式、允許失敗切換、存在健康替代時執行
    if (!result && poolPromptId && typeof window.translationPromptPool !== 'undefined') {
        try {
            const cfgOk = (typeof window.translationPromptPool.getHealthConfig === 'function') ? window.translationPromptPool.getHealthConfig() : null;
            const canSwitch = cfgOk && cfgOk.switchOnFailure;
            const newPrompt = (typeof window.translationPromptPool.selectHealthyPrompt === 'function')
                ? window.translationPromptPool.selectHealthyPrompt(poolPromptId)
                : null;

            if (canSwitch && newPrompt && newPrompt.id !== poolPromptId) {
                if (typeof addProgressLog === 'function') {
                    addProgressLog(`${actualLogContext} 首次失敗，嘗試切換至健康提示詞並重試一次...`);
                }

                // 重建基於新提示詞的 prompts
                let retrySystemPrompt = (newPrompt.systemPrompt || '') + tableHandlingNote;
                let retryUserPrompt = (newPrompt.userPromptTemplate || '')
                    .replace(/\$\{targetLangName\}/g, targetLang)
                    .replace(/\$\{content\}/g, processedText);

                // 重新評估術語庫命中並注入（確保重試也帶有一致的術語指引）
                try {
                    const st2 = (typeof loadSettings === 'function') ? loadSettings() : {};
                    if (st2 && st2.enableGlossary && typeof getGlossaryMatchesForText === 'function') {
                        const matches2 = getGlossaryMatchesForText(processedText);
                        if (matches2 && matches2.length > 0 && typeof buildGlossaryInstruction === 'function') {
                            const instr2 = buildGlossaryInstruction(matches2, targetLang);
                            if (instr2) retrySystemPrompt = retrySystemPrompt + "\n\n" + instr2;
                        }
                    }
                } catch (e) {
                    console.warn('Glossary injection (retry) skipped:', e);
                }

                // 入隊 + 出隊（重試請求）
                const retryRequestId = `${requestId}_r1`;
                if (typeof window.translationPromptPool.enqueueRequest === 'function') {
                    window.translationPromptPool.enqueueRequest(newPrompt.id, { requestId: retryRequestId, model: apiConfig.modelName || 'unknown' });
                }
                if (typeof window.translationPromptPool.dequeueRequest === 'function') {
                    window.translationPromptPool.dequeueRequest(newPrompt.id, retryRequestId);
                }

                const retryBody = apiConfig.bodyBuilder
                    ? apiConfig.bodyBuilder(retrySystemPrompt, retryUserPrompt, { ...bodyBuilderContext, requestType: 'retry' })
                    : {
                        model: apiConfig.modelName,
                        messages: [
                            { role: 'system', content: retrySystemPrompt },
                            { role: 'user', content: retryUserPrompt }
                        ]
                    };

                const retryStart = Date.now();
                try {
                result = await callTranslationApi(apiConfig, retryBody);
                result = stripInstructionBlocks(result);
                    if (typeof window.translationPromptPool.recordPromptUsage === 'function') {
                        window.translationPromptPool.recordPromptUsage(
                            newPrompt.id,
                            true,
                            Date.now() - retryStart,
                            null,
                            { model: apiConfig.modelName || 'unknown', endpoint: apiConfig.endpoint || '' }
                        );
                    }
                    if (typeof window !== 'undefined' && window.isProcessing && window.promptPoolUI) {
                        // 將會話鎖定到新的健康提示詞
                        window.promptPoolUI.sessionLockedPrompt = newPrompt;
                    }
                    if (typeof addProgressLog === 'function') {
                        addProgressLog(`${actualLogContext} 重試成功。`);
                    }
                } catch (e2) {
                    if (typeof window.translationPromptPool.recordPromptUsage === 'function') {
                        window.translationPromptPool.recordPromptUsage(
                            newPrompt.id,
                            false,
                            Date.now() - retryStart,
                            e2 && e2.message ? e2.message : String(e2),
                            { model: apiConfig.modelName || 'unknown', endpoint: apiConfig.endpoint || '' }
                        );
                    }
                    if (typeof addProgressLog === 'function') {
                        addProgressLog(`${actualLogContext} 重試失敗：${e2.message}`);
                    }
                }
            }
        } catch (swErr) {
            // 保守處理：任何切換邏輯錯誤都不影響主異常流
            console.warn('Immediate switch-retry failed silently:', swErr);
        }
    }

    if (!result) {
        // 兩次均失敗，丟擲原始異常
        throw primaryError || new Error('呼叫翻譯 API 失敗');
    }

    // 如果存在表格保護處理且需要處理表格佔位符，恢復表格
    if (hasProtectedTables && actualProcessTablePlaceholders && typeof extractTableFromTranslation === 'function') {
        if (typeof addProgressLog === "function") {
            addProgressLog(`${actualLogContext} 翻譯主文字完成，正在處理表格...`);
        }

        // 獲取表格翻譯結果並替換
        let finalResult = result;

        for (const [placeholder, tableContent] of Object.entries(tablePlaceholders)) {
            try {
                const tableSystemPrompt = `你是一個精確翻譯表格的助手。請將表格翻譯成${targetLang}，嚴格保持以下格式要求：
1. 保持所有表格分隔符（|）和結構完全不變
2. 保持表格對齊標記（:--:、:--、--:）不變
3. 保持表格的行數和列數完全一致
4. 保持數學公式、符號和百分比等專業內容不變
5. 翻譯表格標題（如有）和表格內的文字內容
6. 表格內容與表格外內容要明確區分`;

                const tableUserPrompt = `請將以下Markdown表格翻譯成${targetLang}，請確保完全保持表格結構和格式：

${tableContent}

注意：請保持表格格式完全不變，包括所有的 | 符號、對齊標記、數學公式和符號。`;

                const tableRequestBody = apiConfig.bodyBuilder
                    ? apiConfig.bodyBuilder(tableSystemPrompt, tableUserPrompt, {
                        processedText: tableContent,
                        rawText: tableContent,
                        targetLang,
                        tablePlaceholder: placeholder,
                        requestType: 'table'
                    })
                    : {
                        model: apiConfig.modelName,
                        messages: [
                            { role: "system", content: tableSystemPrompt },
                            { role: "user", content: tableUserPrompt }
                        ]
                    };

                if (typeof addProgressLog === "function") {
                    addProgressLog(`${actualLogContext} 正在翻譯表格...`);
                }
                const translatedTable = await callTranslationApi(apiConfig, tableRequestBody);
                const cleanedTable = extractTableFromTranslation(stripInstructionBlocks(translatedTable)) || tableContent;
                finalResult = finalResult.replace(placeholder, cleanedTable);

            } catch (tableError) {
                console.error(`表格翻譯失敗:`, tableError);
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${actualLogContext} 表格翻譯失敗: ${tableError.message}，將使用原表格`);
                }
                finalResult = finalResult.replace(placeholder, tableContent);
            }
        }

        if (typeof addProgressLog === "function") {
            addProgressLog(`${actualLogContext} 表格處理完成。`);
        }
        return finalResult;
    }

    return result;
}

// 將函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.buildPredefinedApiConfig = buildPredefinedApiConfig;
    processModule.buildCustomApiConfig = buildCustomApiConfigForTranslation; // 使用重新命名後的函式
    processModule.translateMarkdown = translateMarkdown;
    processModule.stripInstructionBlocks = stripInstructionBlocks;
    processModule.buildInstructionBlock = buildInstructionBlock;
}
