// js/api.js

// =====================
// API 相關工具函式與管理器
// =====================

// 從 ui.js 或其他模組匯入所需的函式 (如果使用模組化)
// import { addProgressLog, showNotification } from './ui.js';

// ---------------------
// API 錯誤資訊提取工具
// ---------------------
/**
 * 統一從 API 響應中提取錯誤資訊，便於除錯和使用者提示。
 *
 * 主要邏輯:
 * 1. 嘗試讀取響應體文字。
 * 2. 嘗試將響應體文字解析為 JSON 物件。
 * 3. 從 JSON 物件中提取常見的錯誤資訊欄位 (如 `error.message`, `message`, `detail`)。
 * 4. 如果解析 JSON 失敗或不是 JSON 格式，則直接使用響應體文字或 HTTP 狀態資訊。
 * 5. 對最終的錯誤資訊進行截斷，以避免過長的資訊導致 UI 問題。
 *
 * @param {Response} response - Fetch API 的 Response 物件。
 * @param {string} defaultMessage - 當無法從響應中提取具體錯誤資訊時使用的預設訊息。
 * @returns {Promise<string>} 提取並格式化後的錯誤資訊字串。
 */
async function getApiError(response, defaultMessage) {
    let errorInfo = defaultMessage;
    try {
        const responseText = await response.text();
        console.error('API Error Response Text:', responseText);
        try {
            // 嘗試解析為 JSON 並提取常見錯誤欄位
            const jsonError = JSON.parse(responseText);
            errorInfo = jsonError.error?.message || jsonError.message || jsonError.detail || JSON.stringify(jsonError);
        } catch (e) {
            // 不是 JSON，直接返回文字
            errorInfo = responseText || `HTTP ${response.status} ${response.statusText}`;
        }
    } catch (e) {
        errorInfo = `${defaultMessage} (HTTP ${response.status} ${response.statusText})`;
    }
    // 限制錯誤資訊長度，避免 UI 崩潰
    return errorInfo.substring(0, 300) + (errorInfo.length > 300 ? '...' : '');
}

// =====================
// Mistral API 相關函式
// =====================

/**
 * 上傳檔案到 Mistral API。
 * 該函式用於將本地檔案傳送到 Mistral 的檔案服務，通常是進行 OCR 等操作的前置步驟。
 *
 * @param {File} fileToProcess - 需要上傳的 File 物件。
 * @param {string} mistralKey - Mistral API 金鑰。
 * @returns {Promise<string>} 上傳成功後返回 Mistral 檔案 ID。
 * @throws {Error} 如果上傳失敗（例如網路錯誤、認證失敗、API 返回錯誤），則丟擲錯誤。
 *                 特別地，如果狀態碼為 401，會提示 API Key 無效。
 */
async function uploadToMistral(fileToProcess, mistralKey) {
    const formData = new FormData();
    formData.append('file', fileToProcess);
    formData.append('purpose', 'ocr');

    const response = await fetch('https://api.mistral.ai/v1/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${mistralKey}` },
        body: formData
    });

    if (!response.ok) {
        const errorInfo = await getApiError(response, '檔案上傳失敗');
        if (response.status === 401) throw new Error(`Mistral API Key (...${mistralKey.slice(-4)}) 無效或未授權`);
        throw new Error(`檔案上傳失敗 (${response.status}): ${errorInfo}`);
    }

    const fileData = await response.json();
    if (!fileData || !fileData.id) throw new Error('上傳成功但未返回有效的檔案ID');
    return fileData.id;
}

/**
 * 獲取 Mistral 檔案的簽名 URL。
 * 此 URL 用於授權後續的操作，例如在該檔案上執行 OCR。
 *
 * @param {string} fileId - 已上傳到 Mistral 的檔案 ID。
 * @param {string} mistralKey - Mistral API 金鑰。
 * @returns {Promise<string>} 獲取到的簽名 URL。
 * @throws {Error} 如果獲取簽名 URL 失敗（例如檔案 ID 無效、認證失敗），則丟擲錯誤。
 */
async function getMistralSignedUrl(fileId, mistralKey) {
    const urlEndpoint = `https://api.mistral.ai/v1/files/${fileId}/url?expiry=24`;
    const response = await fetch(urlEndpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${mistralKey}`, 'Accept': 'application/json' }
    });

    if (!response.ok) {
        const errorInfo = await getApiError(response, '獲取簽名URL失敗');
        throw new Error(`獲取簽名URL失敗 (${response.status}): ${errorInfo}`);
    }

    const urlData = await response.json();
    if (!urlData || !urlData.url) throw new Error('獲取的簽名URL格式不正確');
    return urlData.url;
}

/**
 * 呼叫 Mistral OCR API 對指定文件進行文字識別。
 *
 * @param {string} signedUrl - 透過 `getMistralSignedUrl` 獲取到的已簽名文件 URL。
 * @param {string} mistralKey - Mistral API 金鑰。
 * @returns {Promise<Object>} OCR 處理成功後返回的 JSON 物件，包含識別出的頁面文字和結構資訊。
 * @throws {Error} 如果 OCR 處理失敗（例如 URL 無效、API Key 錯誤、處理超時），則丟擲錯誤。
 */
async function callMistralOcr(signedUrl, mistralKey) {
    const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${mistralKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            model: 'mistral-ocr-latest',
            document: { type: "document_url", document_url: signedUrl },
            include_image_base64: true
        })
    });

    if (!response.ok) {
        const errorInfo = await getApiError(response, 'OCR處理失敗');
        throw new Error(`OCR處理失敗 (${response.status}): ${errorInfo}`);
    }

    const ocrData = await response.json();
    if (!ocrData || !ocrData.pages) throw new Error('OCR處理成功但返回的資料格式不正確');
    return ocrData;
}

/**
 * 刪除已上傳到 Mistral 的檔案，以釋放雲端儲存空間。
 * 此函式在執行刪除操作時，如果遇到失敗，僅會在主控台列印警告，不會向上丟擲錯誤中斷主流程。
 *
 * @param {string} fileId - 需要刪除的 Mistral 檔案 ID。
 * @param {string} apiKey - Mistral API 金鑰。
 * @returns {Promise<void>} 無明確返回值。
 */
async function deleteMistralFile(fileId, apiKey) {
    if (!fileId || !apiKey) return; // 引數校驗
    const deleteUrl = `https://api.mistral.ai/v1/files/${fileId}`;
    try {
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) {
            const errorInfo = await getApiError(response, '檔案刪除失敗');
            console.warn(`Failed to delete Mistral file ${fileId}: ${response.status} - ${errorInfo}`);
            // 只記錄警告，不中斷主流程
        }
        // 可選: 檢查響應確認刪除成功
        // const data = await response.json();
        // console.log('Delete response:', data);
    } catch (error) {
        console.warn(`Error during Mistral file deletion ${fileId}:`, error);
        // 同樣不向上丟擲
    }
}

// =====================
// 翻譯 API 相關函式
// =====================

/**
 * 封裝實際的翻譯 API 呼叫邏輯。
 * 此函式根據傳入的配置物件 (`effectiveConfig`) 和請求體 (`requestBody`)，
 * 向指定的翻譯 API 端點傳送 POST 請求，並處理響應。
 *
 * 主要邏輯:
 * 1. 引數校驗：確保 `effectiveConfig` 包含 `endpoint`。
 * 2. 標頭設定：確保 `headers` 存在，並設定 `Accept` 標頭優先接受 JSON。
 * 3. 發起請求：使用 `fetch` API 傳送 POST 請求。
 * 4. 錯誤處理：
 *    - 如果響應不成功 (`!response.ok`)，呼叫 `getApiError` 提取錯誤資訊並丟擲。
 *    - 檢查響應的 `Content-Type` 是否為 JSON。如果不是，則丟擲錯誤，提示檢查 API Endpoint 配置。
 * 5. 結果提取：
 *    - 將響應體解析為 JSON。
 *    - 使用 `effectiveConfig.responseExtractor` (如果提供) 從 JSON 資料中提取翻譯後的文字內容。
 *      如果未提供提取器，則使用預設提取邏輯 (通常適用於 OpenAI 格式的響應)。
 *    - 如果無法提取到內容，則丟擲錯誤。
 * 6. 返回結果：返回提取並去除首尾空格的翻譯文字。
 *
 * @param {Object} effectiveConfig - 生效的 API 配置物件。
 *   必須包含 `endpoint` (string): API 請求的完整 URL。
 *   可選包含 `headers` (Object): HTTP 請求標頭。
 *   可選包含 `responseExtractor` (function): 從 API 響應 JSON 中提取翻譯結果的函式。
 * @param {Object} requestBody - 傳送給翻譯 API 的請求體 JSON 物件。
 * @returns {Promise<string>} 翻譯後的文字內容。
 * @throws {Error} 如果 API 呼叫失敗、響應格式不正確、或無法提取翻譯內容，則丟擲錯誤。
 */
async function callTranslationApi(effectiveConfig, requestBody) {
    // 新增防禦性檢查
    if (!effectiveConfig || !effectiveConfig.endpoint) {
        throw new Error('無效的 API 配置: 缺少必要的端點資訊');
    }

    if (!effectiveConfig.headers) {
        effectiveConfig.headers = { 'Content-Type': 'application/json' };
    }
    // 確保 Accept header 存在並優先 application/json
    effectiveConfig.headers['Accept'] = 'application/json, text/plain, */*';

    const response = await fetch(effectiveConfig.endpoint, {
        method: 'POST',
        headers: effectiveConfig.headers,
        body: JSON.stringify(requestBody)
    });

    const contentType = response.headers.get('content-type');
    if (!response.ok) {
        const errorText = await getApiError(response, '翻譯API返回錯誤');
        // 包含狀態碼和部分錯誤文字，更易除錯
        throw new Error(`翻譯 API 錯誤 (${response.status}): ${errorText}`);
    }

    // 檢查 Content-Type 是否為 JSON
    if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Translation API did not return JSON. Response:', responseText.substring(0, 500)); // Log first 500 chars
        throw new Error(`翻譯 API 未返回有效的 JSON 響應。收到的 Content-Type: ${contentType}. 響應內容可能為 HTML 或其他格式。請檢查 API Endpoint 配置。`);
    }

    const data = await response.json();
    // 透過配置的 responseExtractor 提取翻譯內容
    const extractor = effectiveConfig.responseExtractor || (d => d?.choices?.[0]?.message?.content);
    const translatedContent = extractor(data);

    if (translatedContent === null || translatedContent === undefined) {
        console.error(`Failed to extract translation from response:`, data);
        throw new Error('無法從 API 響應中提取翻譯內容');
    }

    return translatedContent.trim();
}

// 輔助函式：構建自定義 API 配置 (新增 bodyBuilder 引數)
// 注意：此函式與 js/process/translation.js 中的 buildCustomApiConfig 功能類似，
// 未來可以考慮合併或共享，但目前保持獨立，以明確 api.js 的職責是純粹的API互動。
// (此函式在當前版本中可能未被直接呼叫或功能已簡化，因為 testModelKey 現在依賴 translateMarkdown)
/**
 * [測試用/可能已部分廢棄] 構建用於測試的自定義 API 配置。
 * 此函式旨在為 `testModelKey` 或類似測試場景建立一個簡化的 API 配置物件。
 * 在當前實現中，由於 `testModelKey` 直接使用 `translateMarkdown`，此函式的完整構建邏輯可能已被省略或不再活躍。
 * 如果需要讓 `testModelKey` 獨立進行 API 呼叫，則需要在此處完整實現配置構建邏輯。
 *
 * @param {string} key - API 金鑰。
 * @param {string} customApiEndpoint - 自定義 API 的端點 URL。
 * @param {string} customModelId - 自定義模型的 ID。
 * @param {string} customRequestFormat - 自定義請求的格式 (如 'openai', 'anthropic', 'gemini')。
 * @param {number} [temperature] - (可選) 模型溫度引數。
 * @param {number} [max_tokens] - (可選) 最大 token 數。
 * @returns {Object} 一個包含 `endpoint`, `modelName`, `headers` 的基礎配置物件。
 *                   如果由此函式直接支援 `callTranslationApi`，則還應包含 `bodyBuilder` 和 `responseExtractor`。
 */
function buildCustomApiConfigForTest(key, customApiEndpoint, customModelId, customRequestFormat, temperature, max_tokens) {
    let apiEndpoint = customApiEndpoint;
    if (typeof window.modelDetector !== 'undefined') {
        const fullEndpoint = window.modelDetector.getFullApiEndpoint();
        if (fullEndpoint) apiEndpoint = fullEndpoint;
    }
    // ... (此處省略與 translation.js 中類似的具體格式構建邏輯，
    // 因為 testModelKey 直接呼叫 translateMarkdown, 而 translateMarkdown 內部會構建這些)
    // 這個函式如果僅由 testModelKey 的舊版間接使用，可能不再需要細節實現。
    // 如果 testModelKey 要獨立實現API呼叫，則這裡需要完整實現。
    // 當前 testModelKey 直接使用 translateMarkdown，所以此函式可能不再被直接呼叫。
    return {
        endpoint: apiEndpoint,
        modelName: customModelId,
        headers: { 'Content-Type': 'application/json' },
        // bodyBuilder and responseExtractor would be set here if callTranslationApi was used directly by testModelKey
    };
}


// =====================
// Key 測試函式
// =====================

/**
 * 測試指定模型及其 API Key 的可用性（"測活"）。
 * 此函式透過嘗試使用給定的模型和 Key 進行一次小規模的翻譯請求來驗證其有效性。
 * 它依賴於全域或 `processModule` 下可用的 `translateMarkdown` 函式來執行實際的 API 呼叫。
 *
 * 主要邏輯:
 * 1. 檢查 `translateMarkdown` 函式是否可用，如果不可用則丟擲錯誤。
 * 2. 構造一個簡短的測試文字和目標語言。
 * 3. 根據 `modelName` 判斷是預設模型還是自定義模型：
 *    - 如果 `modelName` 以 `custom_source_` 開頭，則視為自定義模型，並將 `modelConfig` 作為配置傳遞給 `translateMarkdown`。
 *    - 否則，視為預設模型，不傳遞 `modelConfig` 的詳細內容。
 * 4. 呼叫 `translateMarkdown` 發起測試翻譯。
 *    - 為 `translateMarkdown` 傳遞必要的引數，包括測試文字、目標語言、模型型別、API Key、以及針對性的日誌上下文和提示（或禁用它們）。
 *    - 特別注意，對於自定義模型，會將 `modelConfig` 引數 (即 `testModelKey` 的第三個引數) 傳遞給 `translateMarkdown`。
 * 5. 結果判斷：如果 `translateMarkdown` 返回一個非空字串，則認為 Key 有效。
 * 6. 錯誤處理：捕獲 `translateMarkdown` 可能丟擲的任何錯誤，並將其視為 Key 無效或配置錯誤。
 *
 * @param {string} modelName - 要測試的模型名稱。
 *   - 對於預設模型，例如 'mistral', 'deepseek'。
 *   - 對於自定義源站點模型，格式為 'custom_source_xxxx'，其中 xxxx 是源站點 ID。
 * @param {string} keyValue - 要測試的 API Key。
 * @param {Object} modelConfig - 模型的配置物件。
 *   - 對於 `modelName` 為 'custom' 或 'custom_source_...' 的情況，此物件包含自定義 API 的詳細資訊
 *     (如 `apiEndpoint`/`apiBaseUrl`, `modelId`, `requestFormat`, `temperature`, `max_tokens` 等)。
 *     這些資訊會傳遞給 `translateMarkdown` 內部的 `buildCustomApiConfig`。
 *   - 對於預設模型，此引數可能為空或不被 `translateMarkdown` 的預設模型路徑直接使用（因為它會自行查詢預設配置）。
 * @returns {Promise<boolean>} 如果 Key 測試成功（API 呼叫成功並返回了內容），則返回 `true`；否則返回 `false`。
 */
async function testModelKey(modelName, keyValue, modelConfig) {
    try {
        if (typeof window.translateMarkdown !== 'function') {
            // 嘗試從 processModule 載入 (如果專案結構如此)
            if (typeof processModule !== 'undefined' && typeof processModule.translateMarkdown === 'function') {
                window.translateMarkdown = processModule.translateMarkdown;
            } else {
                console.error('translateMarkdown function is not available globally or on processModule.');
                throw new Error('translateMarkdown 未載入，無法測試Key');
            }
        }

        // 構造最小請求內容
        const testText = 'Hello'; // 使用更短的文字進行測試
        const targetLang = 'zh'; // 使用語言程式碼，假設 translateMarkdown 內部能處理

        let effectiveModelTypeForTranslateMarkdown = modelName;
        // modelConfig is already the specific source site config when modelName starts with 'custom_source_'
        // or it's the general config for preset models.

        if (modelName.startsWith('custom_source_')) {
            effectiveModelTypeForTranslateMarkdown = 'custom';
            // modelConfig (the 3rd argument to testModelKey) is already the correct source site config object
            // passed from ui.js -> handleTestKey, so no change needed for it here for this case.
        }

        // 呼叫 translateMarkdown 進行測試。
        // 它內部會根據 modelName 和 modelConfig (特別是對custom模型) 來構建實際的API請求。
        let result;
        if (effectiveModelTypeForTranslateMarkdown === 'custom') {
            // custom 模型，傳 modelConfig
            result = await window.translateMarkdown(
                testText,
                targetLang,
                effectiveModelTypeForTranslateMarkdown,
                keyValue,
                modelConfig,
                '[KeyTest]',
                null,
                null,
                false,
                false
            );
        } else {
            // 預設模型，不傳 modelConfig
            result = await window.translateMarkdown(
                testText,
                targetLang,
                effectiveModelTypeForTranslateMarkdown,
                keyValue,
                '[KeyTest]',
                null,
                null,
                false,
                false
            );
        }

        // 簡單檢查是否有字串結果返回
        if (typeof result === 'string' && result.length > 0) {
            return true; // Key is considered valid
        }
        console.warn(`Key test for ${modelName} returned non-string or empty result:`, result);
        return false; // Key might be valid but API call didn't behave as expected for translation

    } catch (e) {
        console.error(`Key test failed for model ${modelName} (key: ...${keyValue.slice(-4)}):`, e.message);
        return false; // Error occurred, key is invalid or configuration is wrong
    }
}


// --- 匯出 API 相關函式 ---
// (如果使用模組化)
// export { uploadToMistral, getMistralSignedUrl, callMistralOcr, deleteMistralFile, callTranslationApi, getApiError, testModelKey };