// js/model-detector.js

// =====================
// 自定義模型檢測與相關工具
// =====================

/**
 * @file js/model-detector.js
 * @description
 * 負責處理與自定義翻譯模型檢測相關的功能。允許使用者輸入 API Base URL 和 Key (透過 KeyManager 獲取)，
 * 然後嘗試從該 Base URL 的 `/v1/models` 端點獲取可用的模型列表，並更新 UI 元素以供選擇。
 * 功能也擴充到了在特定模態框或配置介面中按需檢測模型。
 *
 * 主要功能:
 * - 初始化與自定義模型相關的 UI 元素 (輸入欄位、按鈕、顯示區域)。
 * - 根據使用者輸入的 Base URL 動態更新預期的完整 API 端點顯示。
 * - (舊版) `detectAvailableModels`: 針對主介面全域自定義設定區域的可用模型檢測邏輯。
 * - `detectModelsForModal`: 專門為模態框或特定配置介面設計的模型檢測邏輯，接收 Base URL 和 API Key 作為引數。
 * - 更新模型選擇器 (`customModelId` 下拉選單或 `customModelIdInput` 輸入欄位) 以展示檢測到的模型，或允許手動輸入。
 * - 將檢測到的可用模型列表以及使用者上次選擇的模型ID持久化到 localStorage，並在載入時恢復。
 * - 提供獲取當前選定模型ID和完整API端點的輔助函式。
 * - 透過 `window.modelDetector` 物件暴露公共介面。
 *
 * 注意: 此檔案包含兩套 `window.modelDetector` 的定義，後者 (IIFE內部) 是較新的版本，
 * 前者可能是舊版或過渡版本。在維護時需注意它們之間的功能重疊和最終應該使用的版本。
 */

function appendQueryParamToUrl(urlString, param, value) {
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

function normalizeOpenAIModelsUrl(baseUrlInput, endpointMode = 'auto') {
    if (!baseUrlInput || typeof baseUrlInput !== 'string') {
        throw new Error('API Base URL 不能為空');
    }
    let base = baseUrlInput.trim();
    if (!base) {
        throw new Error('API Base URL 不能為空');
    }
    base = base.replace(/\/+$/, '');
    let lower = base.toLowerCase();

    let mode = endpointMode || 'auto';
    const normalizedSegment = 'models';
    const v1Segment = `v1/${normalizedSegment}`;

    if (mode === 'manual') {
        const stripped = base
            .replace(/\/(?:v\d+\/)?chat\/completions$/i, '')
            .replace(/\/(?:v\d+\/)?messages$/i, '')
            .replace(/\/(?:v\d+\/)?completions$/i, '');
        if (stripped !== base) {
            base = stripped.replace(/\/+$/, '');
            lower = base.toLowerCase();
            mode = 'auto';
        } else {
            return base;
        }
    }

    const terminalPaths = [
        normalizedSegment,
        `/${normalizedSegment}`,
        v1Segment,
        `/${v1Segment}`
    ];

    if (terminalPaths.some(path => lower.endsWith(path))) {
        return base;
    }

    if (mode === 'chat') {
        return `${base}/${normalizedSegment}`;
    }

    if (lower.endsWith('/v1')) {
        return `${base}/${normalizedSegment}`;
    }

    return `${base}/${v1Segment}`;
}

function normalizeGeminiModelsUrl(baseUrlInput) {
    if (!baseUrlInput || typeof baseUrlInput !== 'string') {
        throw new Error('Gemini API Base URL 不能為空');
    }
    let url;
    try {
        url = new URL(baseUrlInput.trim());
    } catch (error) {
        try {
            url = new URL(`https://${baseUrlInput.trim()}`);
        } catch (_) {
            throw new Error('Gemini API Base URL 必須包含協議（例如 https://generativelanguage.googleapis.com）');
        }
    }

    url.searchParams.delete('key');

    let path = url.pathname || '';
    if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
    }

    if (!path || path === '/') {
        path = '/v1beta/models';
    } else if (/\/models\/[^/]+$/i.test(path)) {
        path = path.replace(/\/models\/[^/]+$/i, '/models');
    } else if (!/\/models$/i.test(path)) {
        if (/\/v1beta$/i.test(path) || /\/v1$/i.test(path)) {
            path = `${path}/models`;
        } else {
            path = `${path}/v1beta/models`;
        }
    }

    url.pathname = path;
    url.search = '';
    return url.toString();
}

function mapGeminiModelsResponse(modelsArray) {
    if (!Array.isArray(modelsArray)) return [];
    const mapped = modelsArray
        .map(model => {
            if (!model) return null;
            const fullName = model.name || model.id || '';
            if (!fullName) return null;
            const normalizedId = fullName.includes('/') ? fullName.split('/').pop() : fullName;
            if (!normalizedId) return null;

            return {
                id: normalizedId,
                name: normalizedId,
                rawName: fullName,
                rawDisplayName: model.displayName || ''
            };
        })
        .filter(Boolean);

    const uniqueById = new Map();
    for (const item of mapped) {
        if (!uniqueById.has(item.id)) {
            uniqueById.set(item.id, item);
        }
    }

    return Array.from(uniqueById.values());
}

function isGeminiFormat(requestFormat, baseUrl) {
    const formatLower = (requestFormat || '').toLowerCase();
    if (formatLower === 'gemini' || formatLower === 'gemini-preview') {
        return true;
    }
    if (typeof baseUrl === 'string' && /generativelanguage\.googleapis\.com/i.test(baseUrl)) {
        return true;
    }
    return false;
}

async function performModelDetection(baseUrlInput, apiKey, requestFormat = 'openai', endpointMode = 'auto') {
    if (!baseUrlInput || typeof baseUrlInput !== 'string') {
        throw new Error('進行模型檢測需要有效的 API Base URL。');
    }
    if (!apiKey) {
        throw new Error('進行模型檢測需要一個 API Key。');
    }

    const treatAsGemini = isGeminiFormat(requestFormat, baseUrlInput);

    const normalizedUrl = treatAsGemini
        ? normalizeGeminiModelsUrl(baseUrlInput)
        : normalizeOpenAIModelsUrl(baseUrlInput, endpointMode);

    const requestUrl = treatAsGemini
        ? appendQueryParamToUrl(normalizedUrl, 'key', apiKey)
        : normalizedUrl;

    const headers = treatAsGemini
        ? { 'Content-Type': 'application/json' }
        : { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    const response = await fetch(requestUrl, {
        method: 'GET',
        headers
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 錯誤 (${response.status}): ${response.statusText}. ${errorText ? 'Details: ' + errorText.substring(0, 200) : ''}`);
    }

    const data = await response.json();

    if (treatAsGemini) {
        const mapped = mapGeminiModelsResponse(data.models);
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        return mapped;
    }

    if (!data || !Array.isArray(data.data)) {
        throw new Error('API返回格式不符合預期');
    }

    const popularModels = ['gpt-4', 'gpt-3.5-turbo', 'grok-', 'claude-'];
    return data.data
        .filter(model => model && model.id)
        .sort((a, b) => {
            const aPriority = popularModels.some(m => a.id.includes(m));
            const bPriority = popularModels.some(m => b.id.includes(m));
            if (aPriority && !bPriority) return -1;
            if (!aPriority && bPriority) return 1;
            return a.id.localeCompare(b.id);
        })
        .map(model => ({ id: model.id, name: model.id, created: model.created }));
}

let availableModels = []; // 儲存透過舊版 detectAvailableModels 函式檢測到的可用模型列表。
let lastSelectedModel = ''; // 儲存使用者在舊版模型選擇器中上次選擇或輸入的模型ID。

/**
 * 初始化與舊版自定義模型檢測相關的UI元素。
 * 主要操作:
 * - 獲取必要的 DOM 元素 (如 Base URL 輸入欄位, 模型ID選擇器/輸入欄位, 完整端點顯示區域)。
 * - 初始狀態下，隱藏模型ID下拉選擇框 (`customModelId`)，顯示模型ID手動輸入欄位 (`customModelIdInput`)。
 * - 為 Base URL 輸入欄位新增 `input` 事件監聽，當其值變化時呼叫 `updateApiEndpointDisplay` 更新完整API端點的顯示。
 * - 為模型ID下拉選擇框新增 `change` 事件監聽，處理選擇不同模型（包括"手動輸入"選項）時的邏輯：
 *   - 選擇"手動輸入"時，顯示輸入欄位並聚焦，如果之前有選中的模型ID，則填充到輸入欄位。
 *   - 選擇列表中的具體模型時，隱藏輸入欄位，並記錄當前選擇的模型ID到 `lastSelectedModel`。
 * - 呼叫 `loadModelsFromStorage` 嘗試從本地儲存載入並恢復之前檢測到的模型列表和使用者選擇。
 * @deprecated 此函式主要服務於舊的全域自定義模型配置UI，新版可能使用 KeyManager 內部的配置或模態框。
 */
function initModelDetectorUI() {
    const customApiEndpoint = document.getElementById('customApiEndpoint');
    const customModelId = document.getElementById('customModelId');
    const customModelIdInput = document.getElementById('customModelIdInput');
    const fullApiEndpointDisplay = document.getElementById('fullApiEndpointDisplay');
    const detectModelsBtn = document.getElementById('detectModelsBtn');

    if (customModelId && customModelIdInput) {
        // 初始隱藏下拉選擇框，顯示輸入欄位
        customModelId.style.display = 'none';
    }

    if (customApiEndpoint) {
        updateApiEndpointDisplay();
        // 當Base URL輸入欄位值變化時，更新完整API端點顯示
        customApiEndpoint.addEventListener('input', updateApiEndpointDisplay);
    }

    if (customModelId) {
        // 當模型選擇器變化時，更新輸入欄位值
        customModelId.addEventListener('change', function() {
            if (this.value === 'manual-input') {
                // 選擇"其他模型"時，顯示輸入欄位，並聚焦
                if(customModelIdInput) customModelIdInput.style.display = 'block';
                if(customModelIdInput) customModelIdInput.focus();
                // 如果有上次選擇的模型，填入輸入欄位
                if (lastSelectedModel && lastSelectedModel !== 'manual-input') {
                    if(customModelIdInput) customModelIdInput.value = lastSelectedModel;
                }
            } else {
                // 選擇列表中的模型時，隱藏輸入欄位
                if(customModelIdInput) customModelIdInput.style.display = 'none';
                lastSelectedModel = this.value;
            }
        });
    }

    // 從本地儲存載入之前的可用模型
    loadModelsFromStorage();
}

/**
 * 根據使用者在 Base URL 輸入欄位 (`customApiEndpoint`) 中輸入的內容，
 * 動態更新一個用於顯示完整 OpenAI 相容 API 端點 (`fullApiEndpointDisplay`) 的文字區域。
 * 通常它會在 Base URL 後追加 `/v1/chat/completions`。
 * 如果 Base URL 為空，則顯示 "-"。
 * @deprecated 此函式與舊版 UI 相關聯。
 */
function updateApiEndpointDisplay() {
    const baseUrlInput = document.getElementById('customApiEndpoint');
    const fullApiEndpointDisplay = document.getElementById('fullApiEndpointDisplay');

    if (!baseUrlInput || !fullApiEndpointDisplay) return;

    const baseUrl = baseUrlInput.value.trim();

    if (baseUrl) {
        // 移除末尾的斜槓（如果有）
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        fullApiEndpointDisplay.textContent = `${cleanBaseUrl}/v1/chat/completions`;
    } else {
        fullApiEndpointDisplay.textContent = '-';
    }
}

/**
 * (舊版全域模型檢測功能)
 * 嘗試從使用者在主設定介面提供的自定義 API Base URL (`customApiEndpoint`) 和 API Key (`translationApiKeys` - 已移除或邏輯變更)
 * 來檢測可用的模型列表。檢測成功後會更新模型選擇 UI 並將結果儲存到 localStorage。
 *
 * 主要步驟:
 * 1. 獲取必要的 UI 元素。
 * 2. 檢查 API Key 是否提供 (此邏輯可能已過時，因為 Key 現在由 KeyManager 管理)。
 * 3. 儲存當前使用者在模型選擇器或輸入欄位中的值到 `lastSelectedModel`。
 * 4. 校驗 Base URL 是否已輸入。
 * 5. 禁用檢測按鈕並顯示載入狀態。
 * 6. 構建指向 `/v1/models` 的請求 URL。
 * 7. 使用提供的 API Key (舊邏輯) 發起 GET 請求到該 URL。
 * 8. 處理響應：
 *    - 如果請求不成功，丟擲錯誤。
 *    - 如果響應成功但資料格式不符合預期 (不是包含 `data` 陣列的 JSON)，丟擲錯誤。
 *    - 提取 `data` 陣列中的模型物件，篩選有效模型ID，並按特定優先順序 (如 GPT 模型在前) 和字母順序排序。
 * 9. 呼叫 `updateModelSelector` 更新 UI 中的模型選擇器。
 * 10. 呼叫 `saveModelsToStorage` 將檢測到的模型列表儲存到 localStorage。
 * 11. 顯示成功或失敗的通知。
 * 12. 無論成功或失敗，最後都恢復檢測按鈕的狀態。
 *
 * @async
 * @deprecated 此函式依賴於現已更改或移除的全域 API Key 輸入方式，並且其功能正被更模組化的方法 (如 `detectModelsForModal` 或 KeyManager 內的檢測) 所取代。
 */
async function detectAvailableModels() {
    const customApiEndpoint = document.getElementById('customApiEndpoint');
    const apiKeyInput = document.getElementById('translationApiKeys');
    const modelSelector = document.getElementById('customModelId');
    const modelInput = document.getElementById('customModelIdInput');
    const detectBtn = document.getElementById('detectModelsBtn');

    if (!customApiEndpoint || !modelSelector || !modelInput) {
        showNotification('舊版自定義模型檢測所需的UI元素缺失。請使用模型管理彈出視窗中的功能。 ', 'warning');
        console.warn('detectAvailableModels: Missing one or more required elements (customApiEndpoint, customModelId, customModelIdInput).');
        return;
    }

    if (!apiKeyInput || !apiKeyInput.value) {
         showNotification('舊版自定義模型檢測需要API Key，但相關輸入欄位已移除。請使用模型管理。 ', 'warning');
         console.warn('detectAvailableModels: translationApiKeys input not found or empty.');
         return;
    }

    const apiKey = apiKeyInput.value.trim().split('\n')[0];

    // 儲存當前選擇/輸入的模型ID
    lastSelectedModel = modelSelector.style.display !== 'none' ?
        modelSelector.value : modelInput.value;

    if (!customApiEndpoint.value) {
        showNotification('請先輸入有效的Base URL', 'error');
        return;
    }

    // API Key is now handled by KeyManager for each source/model.
    // This generic apiKey from translationApiKeys might not be relevant.
    // if (!apiKey) {
    //     showNotification('請先輸入API Key', 'error');
    //     return;
    // }

    // 禁用按鈕，顯示載入中狀態
    if (detectBtn) {
        detectBtn.disabled = true;
        detectBtn.innerHTML = '<iconify-icon icon="carbon:circle-dash" class="mr-2 animate-spin" width="16"></iconify-icon>正在檢測...';
    }

    try {
        const requestFormatSelect = document.getElementById('customRequestFormat');
        const requestFormat = requestFormatSelect ? requestFormatSelect.value : 'openai';

        const detectedModels = await performModelDetection(customApiEndpoint.value.trim(), apiKey, requestFormat);
        availableModels = detectedModels.map(model => ({ ...model }));

        // 更新UI
        updateModelSelector(availableModels);

        // 儲存到本地儲存
        saveModelsToStorage(availableModels);

        showNotification(`成功檢測到 ${availableModels.length} 個可用模型`, 'success');
    } catch (error) {
        console.error('檢測模型失敗:', error);
        showNotification(`檢測失敗: ${error.message}`, 'error');

        // 如果發生錯誤，保持輸入欄位可見
        modelSelector.style.display = 'none';
        modelInput.style.display = 'block';
    } finally {
        // 恢復按鈕狀態
        if (detectBtn) {
            detectBtn.disabled = false;
            detectBtn.innerHTML = '<iconify-icon icon="carbon:model-alt" class="mr-2" width="16"></iconify-icon>檢測可用模型';
        }
    }
}

/**
 * (舊版 UI 更新)
 * 根據提供的模型列表 (`models`) 更新主介面上的模型選擇器 (`customModelId`) 和模型輸入欄位 (`customModelIdInput`) 的狀態和內容。
 *
 * 主要邏輯:
 * - 清空模型選擇器的現有選項。
 * - 如果模型列表不為空:
 *   - 走訪模型列表，為每個模型建立一個 `<option>`元素並新增到選擇器中。
 *   - 新增一個特殊的"其他模型" (`manual-input`) 選項到選擇器末尾。
 *   - 顯示模型選擇器，隱藏手動輸入欄位。
 *   - 嘗試恢復 `lastSelectedModel`：如果 `lastSelectedModel` 存在且在新的模型列表中，則選中它；
 *     如果不在列表中，則選中"其他模型"並將 `lastSelectedModel` 的值填入輸入欄位。
 * - 如果模型列表為空，則隱藏模型選擇器，僅顯示手動輸入欄位。
 *
 * @param {Array<Object>} models - 檢測到的可用模型物件陣列，每個物件應至少包含 `id` 屬性。
 * @deprecated 此函式與舊版全域自定義模型UI相關。
 */
function updateModelSelector(models) {
    const modelSelector = document.getElementById('customModelId');
    const modelInput = document.getElementById('customModelIdInput');

    if (!modelSelector || !modelInput) {
        console.warn('updateModelSelector: customModelId or customModelIdInput element not found. Cannot update selector.');
        return;
    }

    // 清空當前選項
    modelSelector.innerHTML = '';

    if (models.length > 0) {
        // 新增模型選項
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            modelSelector.appendChild(option);
        });

        // 新增"其他模型"選項
        const manualOption = document.createElement('option');
        manualOption.value = 'manual-input';
        manualOption.textContent = '- 輸入其他模型 -';
        modelSelector.appendChild(manualOption);

        // 顯示下拉選擇框，隱藏輸入欄位
        modelSelector.style.display = 'block';
        modelInput.style.display = 'none';

        // 如果之前有選擇的模型，嘗試選中它
        if (lastSelectedModel && lastSelectedModel !== 'manual-input') {
            const option = Array.from(modelSelector.options).find(opt => opt.value === lastSelectedModel);
            if (option) {
                modelSelector.value = lastSelectedModel;
            } else {
                // 如果之前選擇的模型不在列表中，選擇"其他模型"並顯示輸入欄位
                modelSelector.value = 'manual-input';
                modelInput.style.display = 'block';
                modelInput.value = lastSelectedModel;
            }
        }
    } else {
        // 沒有檢測到模型時，僅顯示輸入欄位
        modelSelector.style.display = 'none';
        modelInput.style.display = 'block';
    }
}

/**
 * (舊版儲存)
 * 將透過 `detectAvailableModels` 檢測到的模型列表和檢測時間儲存到 localStorage。
 * - 模型列表以 JSON 字串形式儲存在 `availableCustomModels`鍵下。
 * - 檢測時間的時間戳儲存在 `lastDetectedModelTime`鍵下。
 *
 * @param {Array<Object>} models - 要儲存的可用模型物件陣列。
 * @deprecated 與舊版模型檢測流程綁定。
 */
function saveModelsToStorage(models) {
    try {
        localStorage.setItem('availableCustomModels', JSON.stringify(models));
        localStorage.setItem('lastDetectedModelTime', Date.now());
    } catch (e) {
        console.error('儲存模型列表到本地儲存失敗:', e);
    }
}

/**
 * (舊版載入)
 * 從 localStorage 載入先前儲存的可用模型列表和使用者最後選擇的模型ID，並嘗試更新相關的舊版 UI 元素。
 *
 * 主要邏輯:
 * - 檢查相關的 UI 元素 (`customModelId`, `customModelIdInput`) 是否存在於當前上下文中。如果不存在，則不執行 UI 更新。
 * - 從 `localStorage` 讀取 `availableCustomModels` 和 `lastDetectedModelTime`。
 * - 如果儲存的模型列表存在，並且檢測時間在最近7天內，則認為快取有效，呼叫 `updateModelSelector` 使用這些模型更新 UI。
 * - 從 `localStorage` 讀取 `lastSelectedCustomModel` 並賦值給 `lastSelectedModel` 變數。
 *
 * @deprecated 與舊版模型檢測和 UI 相關。
 */
function loadModelsFromStorage() {
    const modelSelector = document.getElementById('customModelId');
    const modelInput = document.getElementById('customModelIdInput');

    // If the target elements for the model selector don't exist globally,
    // then there's no UI to update with stored models in this context.
    // So, we can skip calling updateModelSelector.
    if (!modelSelector || !modelInput) {
        // console.warn('loadModelsFromStorage: Target elements (customModelId/customModelIdInput) not found. Skipping model list update for global UI.');
        // Still try to load lastSelectedModel as it might be used elsewhere or by other logic.
        try {
            lastSelectedModel = localStorage.getItem('lastSelectedCustomModel') || '';
        } catch (e) {
            console.error('Failed to load lastSelectedCustomModel from storage:', e);
        }
        return;
    }

    try {
        const storedModels = localStorage.getItem('availableCustomModels');
        const lastDetectedTime = localStorage.getItem('lastDetectedModelTime');

        if (storedModels) {
            const models = JSON.parse(storedModels);

            // 檢查是否是在過去7天內檢測的
            const isRecent = lastDetectedTime &&
                (Date.now() - parseInt(lastDetectedTime)) < 7 * 24 * 60 * 60 * 1000;

            if (models.length > 0 && isRecent) {
                availableModels = models;
                updateModelSelector(models);
            }
        }

        // 從儲存中載入最後選擇的模型
        lastSelectedModel = localStorage.getItem('lastSelectedCustomModel') || '';
    } catch (e) {
        console.error('從本地儲存載入模型列表失敗:', e);
    }
}

/**
 * (舊版獲取)
 * 獲取當前在舊版全域自定義模型UI中選擇或輸入的模型ID。
 * 它會檢查模型選擇器 (`customModelId`) 是否可見且選中的不是"手動輸入"選項。
 * 如果是，則返回選擇器的值；否則，返回模型手動輸入欄位 (`customModelIdInput`) 的值。
 *
 * @returns {string} 當前選定或輸入的模型ID。如果相關UI元素不存在，則返回空字串。
 * @deprecated 與舊版全域自定義模型UI相關。
 */
function getCurrentModelId() {
    const modelSelector = document.getElementById('customModelId');
    const modelInput = document.getElementById('customModelIdInput');

    if (!modelSelector || !modelInput) {
        console.warn('getCurrentModelId: modelSelector or modelInput not found.');
        return '';
    }

    if (modelSelector.style.display !== 'none' && modelSelector.value !== 'manual-input') {
        // 從選擇器獲取
        return modelSelector.value;
    } else {
        // 從輸入欄位獲取
        return modelInput.value.trim();
    }
}

/**
 * (舊版獲取)
 * 根據舊版全域自定義 Base URL 輸入欄位 (`customApiEndpoint`) 的值，構建並返回一個完整的、
 * 通常與 OpenAI 相容的聊天模型 API 端點 (例如，追加 `/v1/chat/completions`)。
 *
 * @returns {string} 構建的完整 API 端點。如果 Base URL 輸入欄位不存在或為空，則返回空字串。
 * @deprecated 與舊版全域自定義模型UI相關。
 */
function getFullApiEndpoint() {
    const baseUrlInput = document.getElementById('customApiEndpoint');
    if (!baseUrlInput) {
        console.warn('getFullApiEndpoint: customApiEndpoint input not found.');
        return '';
    }
    const baseUrl = baseUrlInput.value.trim();
    if (!baseUrl) return '';

    // 移除末尾的斜槓（如果有）
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBaseUrl}/v1/chat/completions`;
}

/**
 * (舊版更新配置)
 * 收集當前在舊版全域自定義模型 UI 中設定的模型 ID 和完整 API 端點，
 * 並將選擇的模型 ID 儲存到 localStorage (`lastSelectedCustomModel`)。
 *
 * @returns {{modelId: string, endpoint: string}} 包含當前模型ID和端點的物件。
 * @deprecated 與舊版全域自定義模型UI相關。
 */
function updateCustomApiConfig() {
    const modelId = getCurrentModelId();
    const fullEndpoint = getFullApiEndpoint();

    // 儲存最後選擇的模型
    if (modelId) {
        localStorage.setItem('lastSelectedCustomModel', modelId);
    }

    return {
        modelId: modelId,
        endpoint: fullEndpoint
    };
}

/**
 * 當 DOM 完全載入後，如果 `window.modelDetectorInitialized` 尚未定義，
 * 則呼叫 `initModelDetectorUI` 初始化舊版的模型檢測器 UI，並設定標誌。
 * @deprecated 依賴於舊版UI初始化。
 */
document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.modelDetectorInitialized === 'undefined') {
        initModelDetectorUI();
        window.modelDetectorInitialized = true;
    }
});

/**
 * 為特定模態框或配置介面設計的模型檢測函式。
 * 它向指定的 API Base URL 的 `/v1/models` 端點發起請求，使用提供的 API Key 進行認證。
 *
 * 主要步驟:
 * 1. 引數校驗：確保 `baseUrl` 和 `apiKey` 已提供。
 * 2. URL 構建：清理 `baseUrl` (移除末尾斜槓)，並構建完整的 `/v1/models` 端點 URL。
 * 3. API 請求：使用 `fetch` 傳送 GET 請求，攜帶 `Authorization: Bearer {apiKey}` 標頭。
 * 4. 響應處理：
 *    - 如果響應不成功 (`!response.ok`)，嘗試獲取錯誤文字，並丟擲一個包含狀態碼和詳情的錯誤。
 *    - 如果響應成功但資料格式不符合預期 (例如，JSON 中沒有 `data` 陣列)，丟擲錯誤。
 *    - 從 `data` 陣列中提取模型資訊，篩選有效模型，按特定優先順序和字母順序排序，並簡化為 `{id, name}` 物件陣列。
 * 5. 返回結果：返回檢測到的模型物件陣列。
 * 6. 錯誤處理：捕獲任何在過程中發生的錯誤，並將其向上丟擲，以便呼叫方能夠處理並向使用者顯示。
 *
 * @async
 * @param {string} baseUrl - 要檢測模型的 API 基礎 URL (例如 `https://api.openai.com`)。
 * @param {string} apiKey - 用於認證的 API 金鑰。
 * @returns {Promise<Array<Object>>} 返回一個承諾，解析為檢測到的模型物件陣列 (每個物件包含 `id` 和 `name`)。
 * @throws {Error} 如果檢測過程中發生任何錯誤 (如網路問題、API錯誤、資料格式錯誤)。
 */
async function detectModelsForModal(baseUrl, apiKey, requestFormat = 'openai', endpointMode = 'auto') {
    if (!baseUrl) {
        throw new Error('進行模型檢測需要有效的 API Base URL。');
    }
    if (!apiKey) {
        throw new Error('進行模型檢測需要一個 API Key。');
    }

    try {
        return await performModelDetection(baseUrl, apiKey, requestFormat, endpointMode);
    } catch (error) {
        console.error('模型檢測 (彈出視窗內) 失敗:', error);
        throw error;
    }
}

/**
 * @global
 * @namespace modelDetector (舊版定義)
 * @description (可能已部分過時) 全域暴露的模型檢測器相關函式集合。
 * 這個版本的 `window.modelDetector` 包含了與舊版全域自定義模型設定UI互動的函式。
 * @property {function} updateApiEndpointDisplay - 更新API端點顯示。
 * @property {function} detectAvailableModels - (舊版) 檢測可用模型。
 * @property {function} detectModelsForModal - (新版介面，也在此處暴露) 為模態框檢測模型。
 * @property {function} getCurrentModelId - (舊版) 獲取當前選擇的模型ID。
 * @property {function} getFullApiEndpoint - (舊版) 獲取完整API端點。
 * @property {function} updateCustomApiConfig - (舊版) 更新自定義API配置。
 */
window.modelDetector = {
    updateApiEndpointDisplay,
    detectAvailableModels,    // 保留舊的，用於主設定區
    detectModelsForModal,     // 新增的，用於彈出視窗
    getCurrentModelId,
    getFullApiEndpoint,
    updateCustomApiConfig
};

/**
 * @file 立即執行函式表示式 (IIFE) 內部的模型檢測器實現。
 * 這部分似乎是較新的或重構後的模型檢測邏輯，旨在提供更通用的模型檢測功能。
 * 它也將其介面暴露到 `window.modelDetector`，可能會覆蓋上面較舊的定義。
 */
(function () {
    /**
     * 建立一個在指定毫秒數後解析的 Promise，用於實現延遲。
     * @param {number} ms - 延遲的毫秒數。
     * @returns {Promise<void>} 在延遲結束後解析的 Promise。
     * @private
     */
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * (IIFE內部核心函式)
     * 檢測指定 API 端點支援的模型列表。
     * 它會規範化 `apiEndpoint` (確保以 `/` 結尾，移除多餘的 `v1/` 等)，
     * 然後向構建好的 `/v1/models` URL 傳送 GET 請求，並處理響應。
     *
     * @async
     * @private
     * @param {string} apiEndpoint - API 的基礎端點 URL。
     * @param {string} apiKey - 用於認證的 API 金鑰。
     * @returns {Promise<Array<Object>>} 返回一個承諾，解析為經過 `processModelsResponse` 處理後的模型物件陣列。
     * @throws {Error} 如果 API 請求失敗或發生其他錯誤。
     */
    async function detectModels(apiEndpoint, apiKey, requestFormat = 'openai', endpointMode = 'auto') {
        try {
            return await performModelDetection(apiEndpoint, apiKey, requestFormat, endpointMode);
        } catch (error) {
            console.error('檢測模型時出錯:', error);
            throw error;
        }
    }

    /**
     * (IIFE內部輔助函式)
     * 處理從 `/v1/models` 端點返回的原始響應資料，將其轉換為統一格式的模型物件陣列。
     * 支援處理多種可能的響應格式，例如：
     *  - OpenAI 格式: 響應包含一個 `data` 陣列，其中每個元素是一個模型物件。
     *  - Anthropic 格式 (推測): 響應包含一個 `models` 陣列。
     *  - 其他格式: 響應的 `models` 屬性是一個物件，其鍵是模型ID。
     * 模型物件至少包含 `id` 和 `name` 屬性。OpenAI 格式的模型還會嘗試按 GPT 版本排序，然後按字母順序排序。
     *
     * @private
     * @param {Object} responseData - 從 API 獲取的原始 JSON 響應資料。
     * @returns {Array<Object>} 處理和規範化後的模型物件陣列。
     */
    function processModelsResponse(responseData) {
        let models = [];

        if (responseData && responseData.data && Array.isArray(responseData.data)) {
            // OpenAI格式
            models = responseData.data.map(model => ({
                id: model.id,
                name: model.id,
                created: model.created,
                // 可能的其他資訊
            }));

            // 根據模型名稱排序
            models.sort((a, b) => {
                // 首先嚐試按GPT模型版本排序
                const gptRegex = /gpt-(\d)/;
                const aMatch = a.id.match(gptRegex);
                const bMatch = b.id.match(gptRegex);

                if (aMatch && bMatch) {
                    return parseInt(bMatch[1]) - parseInt(aMatch[1]); // 新版本在前
                }

                // 然後按名稱排序
                return a.id.localeCompare(b.id);
            });
        } else if (responseData && Array.isArray(responseData.models)) {
            // Anthropic格式
            models = responseData.models.map(model => ({
                id: model.id || model.name,
                name: model.name || model.id,
                // 其他Anthropic特定資訊
            }));
        } else if (responseData && responseData.models && !Array.isArray(responseData.models)) {
            // 某些API可能以物件形式返回模型
            models = Object.keys(responseData.models).map(key => ({
                id: key,
                name: responseData.models[key].name || key,
                // 其他可能的資訊
            }));
        }

        return models;
    }

    /**
     * (IIFE內部介面)
     * 為模態框或特定的UI互動場景檢測模型。
     * 實際上是 `detectModels` 函式的一個封裝，提供了專門的錯誤處理上下文日誌。
     *
     * @async
     * @param {string} apiEndpoint - API 的基礎端點 URL。
     * @param {string} apiKey - 用於認證的 API 金鑰。
     * @returns {Promise<Array<Object>>} 返回一個承諾，解析為模型物件陣列。
     * @throws {Error} 如果模型檢測失敗。
     */
    async function detectModelsForModal(apiEndpoint, apiKey, requestFormat = 'openai', endpointMode = 'auto') {
        try {
            return await detectModels(apiEndpoint, apiKey, requestFormat, endpointMode);
        } catch (error) {
            console.error('透過模態框檢測模型失敗:', error);
            throw error;
        }
    }

    /**
     * (IIFE內部介面)
     * 為已配置的源站點直接檢測模型。
     * 也是 `detectModels` 函式的封裝，用於特定場景的錯誤日誌。
     *
     * @async
     * @param {string} apiEndpoint - 源站點的 API 基礎端點 URL。
     * @param {string} apiKey - 用於認證的 API 金鑰。
     * @returns {Promise<Array<Object>>} 返回一個承諾，解析為模型物件陣列。
     * @throws {Error} 如果模型檢測失敗。
     */
    async function detectModelsForSite(apiEndpoint, apiKey, requestFormat = 'openai', endpointMode = 'auto') {
        try {
            return await detectModels(apiEndpoint, apiKey, requestFormat, endpointMode);
        } catch (error) {
            console.error('為源站點檢測模型失敗:', error);
            throw error;
        }
    }

    /**
     * (IIFE內部佔位符/未使用)
     * 模型檢測器 UI 的初始化函式。
     * 在這個 IIFE 版本的 `modelDetector` 中，此函式體為空，表明 UI 初始化可能由外部處理，
     * 或者此版本的檢測器更側重於純粹的API互動邏輯而非直接的UI管理。
     * @private
     */
    function initModelDetectorUI() {
        // UI初始化邏輯 (在此版本中為空)
    }

    /**
     * @global
     * @namespace modelDetector (IIFE版本定義)
     * @description (較新版本) 全域暴露的模型檢測器 API。
     * 此版本更側重於通用的模型檢測邏輯，可能旨在替換或增強舊版定義。
     * @property {function} detectModelsForModal - 為模態框檢測模型。
     * @property {function} detectModelsForSite - 為已配置的源站點檢測模型。
     * @property {function} initModelDetectorUI - (佔位符) UI 初始化函式。
     */
    window.modelDetector = {
        detectModelsForModal,
        detectModelsForSite,
        initModelDetectorUI
    };
})();
