// app.js - 主入口點和事件協調器

// =====================
// 全域狀態變數與並行控制
// =====================
/**
 * @file app.js
 * @description
 * 該檔案是應用程式的主入口點和事件協調器。它負責管理使用者介面互動、
 * 檔案處理流程（包括 OCR 和翻譯）、API 金鑰管理、設定載入與儲存、
 * 以及整體應用程式狀態。
 *
 * 主要功能包括：
 * - **初始化**: DOMContentLoaded後載入設定、處理記錄，並綁定事件監聽器。
 * - **UI互動**: 管理檔案列表、處理按鈕狀態、進度顯示、翻譯設定等UI元素的更新。
 * - **檔案處理**:
 *   - 協調PDF、MD、TXT檔案的讀取、分塊、OCR（使用Mistral API）。
 *   - 呼叫翻譯模組對提取的文字進行翻譯（支援多種預設及自定義模型）。
 * - **API金鑰管理**:
 *   - 透過 `KeyProvider` 類管理不同模型（Mistral、翻譯模型）的API金鑰。
 *   - 支援金鑰的輪詢使用、狀態標記（有效/無效）、以及從localStorage載入和儲存。
 * - **並行控制**:
 *   - 管理檔案處理的並行數量。
 *   - 透過訊號量 (`translationSemaphore`) 控制翻譯任務的並行。
 * - **錯誤處理與重試**: 實現檔案處理失敗時的重試機制。
 * - **結果處理**: 收集處理結果，並提供下載功能。
 * - **設定管理**: 載入和儲存使用者設定（如分塊大小、並行數、所選模型等）。
 * - **提示詞管理**: 根據使用者選擇的目標語言或自定義設定，生成或載入相應的翻譯提示詞。
 */

// =====================
// XSS 防護工具函式
// =====================
/**
 * 轉義 HTML 特殊字元，防止 XSS 攻擊
 * @param {string} str - 需要轉義的字串
 * @returns {string} 轉義後的安全字串
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
  });
}

// =====================
// 全域狀態變數
// =====================
/**
 * @type {File[]}
 * @description 儲存使用者選擇的待處理檔案列表。
 */
let pdfFiles = [];
/**
 * @type {Array<Object>}
 * @description 儲存所有檔案處理後的結果物件。每個物件通常包含檔名、OCR文字、翻譯文字等。
 */
let allResults = [];
/**
 * @type {Object}
 * @description 從 localStorage 載入的已處理檔案記錄，用於跳過已處理的檔案。鍵為檔案識別符號，值為 true。
 */
let processedFilesRecord = {};
/**
 * @type {boolean}
 * @description 標記當前是否正在進行檔案處理流程。
 */
let isProcessing = false;
/**
 * @type {number}
 * @description 當前活動的（正在處理中的）檔案數量。
 */
let activeProcessingCount = 0;
/**
 * @type {Map<string, number>}
 * @description 記錄每個檔案（以其識別符號為鍵）當前的重試次數。
 */
let retryAttempts = new Map();
/**
 * @const {number} MAX_RETRIES
 * @description 單個檔案處理失敗時的最大重試次數。
 */
const MAX_RETRIES = 3;
/**
 * @const {string} LAST_SUCCESSFUL_KEYS_LS_KEY
 * @description 用於在 localStorage 中儲存各模型最後一次成功使用的 API Key ID 的鍵名。
 */
const LAST_SUCCESSFUL_KEYS_LS_KEY = 'paperBurnerLastSuccessfulKeys';

/**
 * @typedef {Object} Semaphore
 * @property {number} limit - 訊號量允許的最大並行數。
 * @property {number} count - 當前已佔用的並行數。
 * @property {Array<Function>} queue - 等待獲取訊號量的任務佇列。
 */

/**
 * @type {Semaphore}
 * @description 用於控制翻譯任務並行的訊號量。
 */
let translationSemaphore = {
    limit: 2, // 預設翻譯並行數，可由設定覆蓋
    count: 0,
    queue: []
};

/**
 * @const {string}
 * @description 批次匯出的預設命名模板。
 */
const DEFAULT_BATCH_TEMPLATE = '{original_name}_{output_language}_{processing_time:YYYYMMDD-HHmmss}.{original_type}';

const SUPPORTED_FILE_EXTENSIONS = ['pdf', 'md', 'txt', 'docx', 'pptx', 'html', 'htm', 'epub', 'yaml', 'yml', 'json', 'csv', 'ini', 'cfg', 'log', 'tex'];
const SUPPORTED_ARCHIVE_EXTENSIONS = ['zip'];

/**
 * @type {boolean}
 * @description 使用者是否開啟批次模式的偏好設定。
 */
let batchModeEnabled = false;
/**
 * @type {string}
 * @description 批次匯出使用的命名模板。
 */
let batchModeTemplate = DEFAULT_BATCH_TEMPLATE;
/**
 * @type {string[]}
 * @description 批次匯出需要生成的格式集合。
 */
let batchModeFormats = ['original', 'markdown'];
/**
 * @type {boolean}
 * @description 批次匯出時是否強制打包為 ZIP。
 */
let batchModeZipEnabled = false;

/**
 * @type {boolean}
 * @description 批次配置面板是否摺疊。
 */
let batchConfigCollapsed = true;

/**
 * @type {Set<string>}
 * @description 被排除的副檔名集合。
 */
const excludedExtensions = new Set();
/**
 * @type {{id:string,total:number,template:string,formats:string[],outputLanguage:string,startedAt:string,counter:number}|null}
 * @description 當前批次處理的上下文資訊，在一次處理流程記憶體在。
 */
let activeBatchSession = null;

/**
 * @class KeyProvider
 * @description 負責載入、篩選、排序和輪詢特定模型的API Keys。
 * 它從 localStorage 讀取儲存的金鑰，管理其狀態（如'valid', 'untested', 'invalid'），
 * 並在處理過程中提供下一個可用的金鑰。
 */
class KeyProvider {
    /**
     * KeyProvider 建構函式。
     * @param {string} modelName - 需要管理 API Keys 的模型名稱 (例如 'mistral', 'gemini', 或自定義源站點 'custom_source_xxx')。
     */
    constructor(modelName) {
        /** @type {string} */
        this.modelName = modelName;
        /**
         * @type {Array<Object>}
         * @description 儲存從localStorage載入的原始key物件陣列。
         * 每個物件結構: {id: string, value: string, remark: string, status: string, order: number}
         */
        this.keys = [];
        /**
         * @type {Array<Object>}
         * @description 儲存經過篩選和排序的、當前輪次可用的key物件陣列 (status為 'valid' 或 'untested')。
         */
        this.availableKeys = [];
        /**
         * @type {number}
         * @description 當前輪詢可用金鑰列表的索引。
         */
        this.currentIndex = 0;
        this.loadAndPrepareKeys();
    }

    /**
     * 載入並準備指定模型的API Keys。
     * 它會呼叫 `loadModelKeys` 從 localStorage 獲取金鑰，
     * 然後篩選出狀態為 'valid' 或 'untested' 的金鑰，並按 `order` 排序。
     */
    loadAndPrepareKeys() {
        this.keys = typeof loadModelKeys === 'function' ? loadModelKeys(this.modelName) : [];
        // 篩選出 'valid' 或 'untested' 的 keys，並按 order 排序 (loadModelKeys 內部已排序)
        this.availableKeys = this.keys.filter(key => key.status === 'valid' || key.status === 'untested');
        this.currentIndex = 0;
        if (this.availableKeys.length === 0) {
            console.warn(`KeyProvider: No 'valid' or 'untested' keys found for model ${this.modelName}`);
        }
    }

    /**
     * 獲取下一個可用的API Key物件。
     * 實現輪詢機制，迴圈使用 `availableKeys` 列表中的金鑰。
     * @returns {Object|null} 返回一個金鑰物件 {id, value, status, remark, order}，如果沒有可用金鑰則返回 null。
     */
    getNextKey() {
        if (this.availableKeys.length === 0) {
            return null; // 沒有可用的key
        }
        const keyObject = this.availableKeys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.availableKeys.length;
        return keyObject; // 返回整個key物件，包含 {id, value, status, remark, order}
    }

    /**
     * 將指定的API Key標記為無效。
     * 這會更新該金鑰在 `this.keys` 中的狀態，並將其從 `this.availableKeys` 中移除。
     * 同時，會嘗試非同步儲存更新後的金鑰列表到 localStorage，並重新整理Key管理介面的UI（如果存在）。
     * @param {string} keyId - 要標記為無效的金鑰的ID。
     * @async
     */
    async markKeyAsInvalid(keyId) {
        const keyIndexInAll = this.keys.findIndex(k => k.id === keyId);
        if (keyIndexInAll !== -1) {
            this.keys[keyIndexInAll].status = 'invalid';
            if (typeof saveModelKeys === 'function') {
                await saveModelKeys(this.modelName, this.keys); // 非同步儲存
            }
        }
        // 從當前可用列表中移除，並重置索引以確保正確輪詢剩餘的key
        this.availableKeys = this.availableKeys.filter(k => k.id !== keyId);
        this.currentIndex = this.availableKeys.length > 0 ? this.currentIndex % this.availableKeys.length : 0;

        // 如果Key管理彈出視窗正好顯示這個模型, 更新其UI
        if (typeof window.refreshKeyManagerForModel === 'function') {
            window.refreshKeyManagerForModel(this.modelName, keyId, 'invalid');
        }
    }

    /**
     * 檢查是否有可用的 API Keys。
     * @returns {boolean} 如果 `availableKeys` 列表不為空，則返回 true，否則返回 false。
     */
    hasAvailableKeys() {
        return this.availableKeys.length > 0;
    }
}

/**
 * 獲取一個翻譯並行槽（基於訊號量實現）。
 * 如果當前並行數未達到上限，則立即獲取槽位。
 * 否則，將請求加入等待佇列，直到有槽位釋放。
 * @returns {Promise<void>} 當成功獲取槽位時 resolve 的 Promise。
 * @async
 */
async function acquireTranslationSlot() {
    if (translationSemaphore.count < translationSemaphore.limit) {
        translationSemaphore.count++;
        return Promise.resolve();
    } else {
        return new Promise(resolve => {
            translationSemaphore.queue.push(resolve);
        });
    }
}

/**
 * 釋放一個翻譯並行槽。
 * 減少當前並行數，並檢查等待佇列中是否有任務，如果有，則喚醒佇列中的下一個任務。
 */
function releaseTranslationSlot() {
    translationSemaphore.count--;
    if (translationSemaphore.queue.length > 0) {
        const nextResolve = translationSemaphore.queue.shift();
        acquireTranslationSlot().then(nextResolve);
    }
}

// =====================
// DOMContentLoaded 入口初始化
// =====================
/**
 * 當DOM完全載入並解析後執行的初始化函式。
 * 主要任務包括：
 * 1. 載入使用者設定和已處理檔案記錄。
 * 2. 將載入的設定應用到UI元素上。
 * 3. 初始化UI元件狀態（如檔案列表、處理按鈕等）。
 * 4. 綁定所有必要的事件監聽器。
 * 5. 初始化自定義模型檢測UI（如果相關功能已定義）。
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. 載入設定和已處理檔案記錄
    const settings = loadSettings();
    processedFilesRecord = loadProcessedFilesRecord();

    // 2. 應用設定到 UI
    applySettingsToUI(settings);

    // 3. 載入 API Keys（如有記住） - 此功能已透過KeyProvider實現，且UI元素已移除
    // loadApiKeysFromStorage(); // 刪除此行

    // 4. 初始化 UI 狀態
    updateFileListUI(pdfFiles, isProcessing, handleRemoveFile);
    updateProcessButtonState(pdfFiles, isProcessing);
    updateTranslationUIVisibility(isProcessing);
    refreshFormatFilters();
    refreshFormatFilters();

    // 暴露重新整理驗證狀態的全域函式
    window.refreshValidationState = function() {
        console.log('[Validation] Refreshing validation state');
        updateProcessButtonState(pdfFiles, isProcessing);
    };

    // 5. 綁定所有事件
    setupEventListeners();

    // 初始化自定義模型檢測UI
    if (typeof initModelDetectorUI === 'function') {
        initModelDetectorUI();
    }
});

// =====================
// UI 設定應用
// =====================
/**
 * 將載入的設定物件應用到各個UI元素上。
 * 例如，設定滑塊的值、核取方塊的選中狀態、下拉選單的選定項等。
 * @param {Object} settings - 從 `loadSettings` 載入的設定物件。
 */
function applySettingsToUI(settings) {
    // 解構所有設定項
    const {
        maxTokensPerChunk: maxTokensVal,
        skipProcessedFiles,
        selectedTranslationModel: modelVal,
        selectedCustomSourceSiteId, // 新增：載入選定的自定義源站點ID
        concurrencyLevel: concurrencyVal,
        translationConcurrencyLevel: translationConcurrencyVal,
        targetLanguage: targetLangVal,
        customTargetLanguageName: customLangNameVal,
        defaultSystemPrompt: defaultSysPromptVal,
        defaultUserPromptTemplate: defaultUserPromptVal,
        useCustomPrompts: useCustomPromptsVal,
        enableGlossary: enableGlossaryVal,
        batchModeEnabled: batchEnabledVal = false,
        batchModeTemplate: batchTemplateVal = DEFAULT_BATCH_TEMPLATE,
        batchModeFormats: batchFormatsVal = ['original', 'markdown'],
        batchModeZipEnabled: batchZipVal = false
    } = settings;

    batchModeEnabled = !!batchEnabledVal;
    batchModeTemplate = typeof batchTemplateVal === 'string' && batchTemplateVal.trim()
        ? batchTemplateVal
        : DEFAULT_BATCH_TEMPLATE;
    batchModeFormats = Array.isArray(batchFormatsVal) && batchFormatsVal.length > 0
        ? Array.from(new Set(['original', ...batchFormatsVal]))
        : ['original', 'markdown'];
    batchModeZipEnabled = !!batchZipVal;
    batchConfigCollapsed = true;

    // 應用到各 DOM 元素
    const maxTokensSlider = document.getElementById('maxTokensPerChunk');
    if (maxTokensSlider) {
        maxTokensSlider.value = maxTokensVal;
        document.getElementById('maxTokensPerChunkValue').textContent = maxTokensVal;
    }
    document.getElementById('skipProcessedFiles').checked = skipProcessedFiles;
    const translationModelSelect = document.getElementById('translationModel');
    if (translationModelSelect) {
        const normalizedModel = (modelVal === 'gemini-preview') ? 'gemini' : modelVal;
        translationModelSelect.value = normalizedModel;
    }

    // ----- 新增：處理自定義源站點下拉選單的邏輯 -----
    const customSourceSiteDropdown = document.getElementById('customSourceSiteSelect');
    if (modelVal === 'custom' && customSourceSiteDropdown) {
        customSourceSiteDropdown.classList.remove('hidden');
        if (typeof window.populateCustomSourceSitesDropdown_ui === 'function') {
            // 假設 ui.js 中有這個函式來填充下拉選單
            window.populateCustomSourceSitesDropdown_ui(selectedCustomSourceSiteId);
        } else {
            console.warn('populateCustomSourceSitesDropdown_ui function not found on window.');
            // 可選：如果函式不存在，至少清空並禁用它
            customSourceSiteDropdown.innerHTML = '<option value="">未找到源站點載入函式</option>';
            customSourceSiteDropdown.disabled = true;
        }
    } else if (customSourceSiteDropdown) {
        customSourceSiteDropdown.classList.add('hidden');
        customSourceSiteDropdown.innerHTML = ''; // 清空選項
        customSourceSiteDropdown.disabled = true;
    }
    // ----- 結束新增 -----

    const concurrencyInput = document.getElementById('concurrencyLevel');
    if (concurrencyInput) concurrencyInput.value = concurrencyVal;
    const translationConcurrencyInput = document.getElementById('translationConcurrencyLevel');
    if (translationConcurrencyInput) translationConcurrencyInput.value = translationConcurrencyVal;
    const targetLanguageSelect = document.getElementById('targetLanguage');
    if (targetLanguageSelect) targetLanguageSelect.value = targetLangVal || 'chinese';
    const customTargetLanguageInput = document.getElementById('customTargetLanguageInput');
    if (customTargetLanguageInput) customTargetLanguageInput.value = customLangNameVal || '';

    const batchTemplateInput = document.getElementById('batchModeTemplate');
    if (batchTemplateInput) {
        batchTemplateInput.value = batchModeTemplate;
    }
    const batchFormatCheckboxes = document.querySelectorAll('[data-batch-format]');
    const batchZipCheckbox = document.querySelector('[data-batch-zip]');
    if (batchFormatCheckboxes.length > 0) {
        let matched = false;
        batchFormatCheckboxes.forEach(cb => {
            const fmt = cb.getAttribute('data-batch-format');
            const isChecked = batchModeFormats.includes(fmt);
            cb.checked = isChecked;
            if (isChecked) matched = true;
        });
        const originalCheckbox = document.querySelector('[data-batch-format="original"]');
        if (originalCheckbox && !originalCheckbox.checked) {
            originalCheckbox.checked = true;
            if (!batchModeFormats.includes('original')) batchModeFormats.unshift('original');
        }
        if (!matched) {
            batchModeFormats = ['original', 'markdown'];
            batchFormatCheckboxes.forEach(cb => {
                if (['original', 'markdown'].includes(cb.getAttribute('data-batch-format'))) {
                    cb.checked = true;
                } else {
                    cb.checked = false;
                }
            });
        }
    }
    if (batchZipCheckbox) {
        batchZipCheckbox.checked = batchModeZipEnabled;
    }

    if (typeof updateCustomLanguageInputVisibility === 'function') {
        updateCustomLanguageInputVisibility();
    }

    // 單個自定義提示詞：填充預設或使用者上次修改
    const defaultSystemPromptTextarea = document.getElementById('defaultSystemPrompt');
    const defaultUserPromptTemplateTextarea = document.getElementById('defaultUserPromptTemplate');
    const sysDefault = '你是專業的文件翻譯助手。請將使用者提供的內容精準翻譯為指定語言，嚴格保留 Markdown 結構與標記，不新增任何說明性文字。';
    const userDefault = '請將以下內容翻譯為${targetLangName}：\n\n${content}';
    if (defaultSystemPromptTextarea) {
        defaultSystemPromptTextarea.value = (defaultSysPromptVal && defaultSysPromptVal.trim()) ? defaultSysPromptVal : sysDefault;
    }
    if (defaultUserPromptTemplateTextarea) {
        defaultUserPromptTemplateTextarea.value = (defaultUserPromptVal && defaultUserPromptVal.trim()) ? defaultUserPromptVal : userDefault;
    }
    
    // 設定提示詞模式
    const promptMode = settings.promptMode || 'builtin';
    const promptModeRadio = document.querySelector(`input[name="promptMode"][value="${promptMode}"]`);
    if (promptModeRadio) promptModeRadio.checked = true;

    // 備擇庫開關
    const enableGlossaryToggle = document.getElementById('enableGlossaryToggle');
    if (enableGlossaryToggle) enableGlossaryToggle.checked = !!enableGlossaryVal;

    // 自定義模型設定 (舊版邏輯，現在主要由源站點管理)
    // 這裡不再直接從 settings.customModelSettings 讀取並填充舊的自定義模型輸入欄位
    // 因為這些設定現在應該透過 key-manager-ui.js 中的源站點表單進行管理。
    // 如果需要，可以在選擇特定源站點時，由 ui.js 更新這些顯示（如果這些輸入欄位還保留用於顯示目的）。

    // 觸發 UI 相關聯動
    updateTranslationUIVisibility(isProcessing);
    updateCustomLanguageInputVisibility();

    if (typeof syncBatchModeControls === 'function') {
        syncBatchModeControls(pdfFiles.length);
    }
    updateBatchConfigCollapse();
}

// =====================
// API Key 載入 (舊版UI的，現在已不需要)
// =====================
/* // 函式整體註釋掉或刪除
function loadApiKeysFromStorage() {
    const mistralKeysText = localStorage.getItem('mistralApiKeys');
    const translationKeysText = localStorage.getItem('translationApiKeys');

    const mistralTextArea = document.getElementById('mistralApiKeys'); // 這些元素已不存在
    const translationTextArea = document.getElementById('translationApiKeys'); // 這些元素已不存在

    if (mistralKeysText && mistralTextArea) {
        mistralTextArea.value = mistralKeysText;
    }
    if (translationKeysText && translationTextArea) {
        translationTextArea.value = translationKeysText;
    }
}
*/

// =====================
// 事件監聽器綁定
// =====================
/**
 * 綁定應用程式中所有主要的DOM事件監聽器。
 * 包括API Key輸入、模型選擇、高階設定切換、檔案上傳、處理按鈕點選等。
 */
function setupEventListeners() {
    // (需要從 ui.js 獲取 DOM 元素參考)
    // const mistralTextArea = document.getElementById('mistralApiKeys'); // 已移除
    // const translationTextArea = document.getElementById('translationApiKeys'); // 已移除
    const translationModelSelect = document.getElementById('translationModel');
    const advancedSettingsToggle = document.getElementById('advancedSettingsToggle');
    const maxTokensSlider = document.getElementById('maxTokensPerChunk');
    const skipFilesCheckbox = document.getElementById('skipProcessedFiles');
    const concurrencyInput = document.getElementById('concurrencyLevel');
    const translationConcurrencyInput = document.getElementById('translationConcurrencyLevel'); // Get ref to new input
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('pdfFileInput');
    const folderInput = document.getElementById('folderInput');
    const browseBtn = document.getElementById('browseFilesBtn');
    const browseFolderBtn = document.getElementById('browseFolderBtn');
    const urlImportBtn = document.getElementById('urlImportBtn');
    const githubImportBtn = document.getElementById('githubImportBtn');
    const clearBtn = document.getElementById('clearFilesBtn');
    const processBtn = document.getElementById('processBtn');
    const downloadBtn = document.getElementById('downloadAllBtn');
    const formatFilterContainer = document.getElementById('fileFormatFilters');
    const batchToggle = document.getElementById('batchModeToggle');
    const batchTemplateInput = document.getElementById('batchModeTemplate');
    const batchFormatInputs = document.querySelectorAll('[data-batch-format]');
    const batchZipCheckbox = document.querySelector('[data-batch-zip]');
    const batchConfigToggle = document.getElementById('batchModeConfigToggle');
    const targetLanguageSelect = document.getElementById('targetLanguage'); 
    const customTargetLanguageInput = document.getElementById('customTargetLanguageInput');
    const defaultSystemPromptTextarea = document.getElementById('defaultSystemPrompt');
    const defaultUserPromptTemplateTextarea = document.getElementById('defaultUserPromptTemplate');
    const customModelInputs = [
        document.getElementById('customApiEndpoint'),
        document.getElementById('customModelId'),
        document.getElementById('customRequestFormat'),
        document.getElementById('customTemperature'),
        document.getElementById('customMaxTokens')
    ];
    const customSourceSiteDropdown = document.getElementById('customSourceSiteSelect');
    const customSourceSiteToggleBtn = document.getElementById('customSourceSiteToggle');
    const customSourceSiteDiv = document.getElementById('customSourceSite');
    const customSourceSiteToggleIconEl = document.getElementById('customSourceSiteToggleIcon');
    const enableGlossaryToggle = document.getElementById('enableGlossaryToggle');

    // API Key 儲存 - 相關邏輯已移除，因為輸入欄位已移除
    /* // mistralTextArea 的監聽器已無意義
    mistralTextArea.addEventListener('input', () => {
        localStorage.setItem('mistralApiKeys', mistralTextArea.value); // 直接儲存
        updateProcessButtonState(pdfFiles, isProcessing);
    });
    */
    /* // translationTextArea 的監聽器已無意義
    translationTextArea.addEventListener('input', () => {
        localStorage.setItem('translationApiKeys', translationTextArea.value); // 直接儲存
        updateTranslationUIVisibility(isProcessing);
    });
    */

    // 翻譯模型和自定義設定
    translationModelSelect.addEventListener('change', () => {
        updateTranslationUIVisibility(isProcessing);
        if (typeof window.updateDeeplxTargetLangHint === 'function') {
            window.updateDeeplxTargetLangHint();
        }
        saveCurrentSettings(); // 儲存包括模型選擇在內的所有設定
    });

    // 新增: Event-Listener für das customSourceSiteSelect Dropdown-Menü
    if (customSourceSiteDropdown) {
        customSourceSiteDropdown.addEventListener('change', () => {
            saveCurrentSettings(); // Speichere die aktuellen Einstellungen, wenn die Auswahl der benutzerdefinierten Quelle geändert wird
            // Optional: Log or update UI based on the new selection if needed immediately
            const settings = loadSettings();
            console.log("Custom source site selection changed and saved:", settings.selectedCustomSourceSiteId);
        });
    }

    // 新增：為"自定義源站點設定"的切換按鈕新增事件監聽器
    if (customSourceSiteToggleBtn && customSourceSiteDiv && customSourceSiteToggleIconEl) {
        customSourceSiteToggleBtn.addEventListener('click', () => {
            customSourceSiteDiv.classList.toggle('hidden');
            if (customSourceSiteDiv.classList.contains('hidden')) {
                customSourceSiteToggleIconEl.setAttribute('icon', 'carbon:chevron-down');
            } else {
                customSourceSiteToggleIconEl.setAttribute('icon', 'carbon:chevron-up');
            }
        });
    }

    customModelInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('change', saveCurrentSettings);
        input.addEventListener('input', saveCurrentSettings); // 實時儲存
    });

    if (enableGlossaryToggle) {
        enableGlossaryToggle.addEventListener('change', saveCurrentSettings);
    }

    if (batchToggle) {
        batchToggle.addEventListener('change', () => {
            batchModeEnabled = batchToggle.checked;
            syncBatchModeControls(pdfFiles.length);
            saveCurrentSettings();
        });
    }
    if (batchTemplateInput) {
        const syncTemplateValue = () => {
            const raw = batchTemplateInput.value;
            batchModeTemplate = raw && raw.trim() ? raw.trim() : DEFAULT_BATCH_TEMPLATE;
        };
        batchTemplateInput.addEventListener('input', () => {
            syncTemplateValue();
            saveCurrentSettings();
        });
        batchTemplateInput.addEventListener('blur', () => {
            if (!batchTemplateInput.value.trim()) {
                batchTemplateInput.value = DEFAULT_BATCH_TEMPLATE;
                batchModeTemplate = DEFAULT_BATCH_TEMPLATE;
                saveCurrentSettings();
            }
        });
    }
    if (batchFormatInputs && batchFormatInputs.length > 0) {
        batchFormatInputs.forEach(input => {
            input.addEventListener('change', () => {
                const selected = Array.from(document.querySelectorAll('[data-batch-format]:checked'))
                    .map(el => el.getAttribute('data-batch-format'))
                    .filter(Boolean);
                if (!selected.includes('original')) {
                    const originalCheckbox = document.querySelector('[data-batch-format="original"]');
                    if (originalCheckbox) {
                        originalCheckbox.checked = true;
                    }
                    selected.unshift('original');
                    if (typeof showNotification === 'function') {
                        showNotification('已自動保留“原格式”匯出項。', 'info');
                    }
                }
                if (selected.length === 0) {
                    const fallback = document.querySelector('[data-batch-format="original"]');
                    if (fallback) fallback.checked = true;
                    selected.push('original');
                }
                batchModeFormats = Array.from(new Set(selected));
                saveCurrentSettings();
            });
        });
    }
    if (batchZipCheckbox) {
        batchZipCheckbox.addEventListener('change', () => {
            batchModeZipEnabled = batchZipCheckbox.checked;
            saveCurrentSettings();
        });
    }

    if (formatFilterContainer) {
        formatFilterContainer.addEventListener('change', handleFormatFilterChange);
        formatFilterContainer.addEventListener('click', handleFormatFilterClick);
    }

    if (batchConfigToggle) {
        batchConfigToggle.addEventListener('click', () => {
            batchConfigCollapsed = !batchConfigCollapsed;
            updateBatchConfigCollapse();
        });
    }

    // 高階設定
    advancedSettingsToggle.addEventListener('click', () => {
        const settingsDiv = document.getElementById('advancedSettings');
        const icon = document.getElementById('advancedSettingsIcon');
        settingsDiv.classList.toggle('hidden');
        icon.setAttribute('icon', settingsDiv.classList.contains('hidden') ? 'carbon:chevron-down' : 'carbon:chevron-up');
        // 不需要單獨儲存，由內部控制元件處理
    });
    maxTokensSlider.addEventListener('input', () => {
        document.getElementById('maxTokensPerChunkValue').textContent = maxTokensSlider.value;
        saveCurrentSettings();
    });
    skipFilesCheckbox.addEventListener('change', saveCurrentSettings);
    concurrencyInput.addEventListener('input', () => {
        // 輸入驗證
        let value = parseInt(concurrencyInput.value);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 50) value = 50; // Allow higher concurrency for file processing
        concurrencyInput.value = value;
        saveCurrentSettings();
    });
    translationConcurrencyInput.addEventListener('input', () => { // Add listener for new input
        // 輸入驗證
        let value = parseInt(translationConcurrencyInput.value);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 150) value = 150; // Increase limit for translation concurrency
        translationConcurrencyInput.value = value;
        saveCurrentSettings();
    });

    // 檔案上傳
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    browseBtn.addEventListener('click', () => { if (!isProcessing) fileInput.click(); });
    fileInput.addEventListener('change', handleFileSelect);
    if (browseFolderBtn && folderInput) {
        browseFolderBtn.addEventListener('click', () => { if (!isProcessing) folderInput.click(); });
    }
    if (folderInput) {
        folderInput.addEventListener('change', handleFolderSelect);
    }
    if (urlImportBtn) {
        urlImportBtn.addEventListener('click', async () => {
            if (isProcessing) return;
            await handleUrlImport();
        });
    }
    if (githubImportBtn) {
        githubImportBtn.addEventListener('click', async () => {
            if (isProcessing) return;
            await handleGithubImport();
        });
    }
    clearBtn.addEventListener('click', handleClearFiles);

    // 目標語言選擇
    targetLanguageSelect.addEventListener('change', () => {
        updateCustomLanguageInputVisibility(); // Update visibility based on selection
        if (typeof window.updateDeeplxTargetLangHint === 'function') {
            window.updateDeeplxTargetLangHint();
        }
        saveCurrentSettings(); // Save the new selection
    });
    customTargetLanguageInput.addEventListener('input', () => {
        saveCurrentSettings();
        if (typeof window.updateDeeplxTargetLangHint === 'function') {
            window.updateDeeplxTargetLangHint();
        }
    }); // Save custom language name changes

    // 預設提示編輯
    if (defaultSystemPromptTextarea) {
        defaultSystemPromptTextarea.addEventListener('input', saveCurrentSettings);
    }
    if (defaultUserPromptTemplateTextarea) {
        defaultUserPromptTemplateTextarea.addEventListener('input', saveCurrentSettings);
    }

    // 處理和下載
    processBtn.addEventListener('click', handleProcessClick);
    downloadBtn.addEventListener('click', handleDownloadClick);

    if (typeof window.updateDeeplxTargetLangHint === 'function') {
        window.updateDeeplxTargetLangHint();
    }
}

// =====================
// 事件處理函式
// =====================

/**
 * 處理檔案拖拽到上傳區域時的 `dragover` 事件。
 * @param {DragEvent} e - 拖拽事件物件。
 */
function handleDragOver(e) {
    e.preventDefault();
    if (!isProcessing) {
        e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
    }
}

/**
 * 處理檔案拖拽離開上傳區域時的 `dragleave` 事件。
 * @param {DragEvent} e - 拖拽事件物件。
 */
function handleDragLeave(e) {
    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
}

/**
 * 處理檔案拖放到上傳區域時的 `drop` 事件。
 * @param {DragEvent} e - 拖拽事件物件。
 */
async function handleDrop(e) {
    e.preventDefault();
    if (isProcessing) return;
    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
    const files = await extractFilesFromDataTransfer(e.dataTransfer);
    await addFilesToList(files);
}

/**
 * 處理透過檔案輸入欄位選擇檔案後的 `change` 事件。
 * @param {Event} e - 事件物件，`e.target` 是檔案輸入欄位。
 */
async function handleFileSelect(e) {
    if (isProcessing) return;
    await addFilesToList(e.target.files);
    e.target.value = null; // 允許重新選擇相同檔案
}

async function handleFolderSelect(e) {
    if (isProcessing) return;
    await addFilesToList(e.target.files);
    e.target.value = null;
}

/**
 * 處理點選"清空列表"按鈕的事件。
 * 清空 `pdfFiles` 陣列和 `allResults` 陣列，並更新UI。
 * 同時清空 `window.data` 用於除錯或特定UI顯示。
 */
function handleClearFiles() {
    if (isProcessing) return;
    pdfFiles = [];
    allResults = []; // 清空結果
    // ========== 新增：清空檔案時重新整理 window.data ==========
    window.data = {};
    updateFileListUI(pdfFiles, isProcessing, handleRemoveFile);
    updateProcessButtonState(pdfFiles, isProcessing);
    refreshFormatFilters();
}

/**
 * 根據當前已選擇的檔案數量同步批次模式相關控制元件的狀態。
 *
 * @param {number} fileCount - 當前列表中的檔案數量。
 */
function syncBatchModeControls(fileCount) {
    const wrapper = document.getElementById('batchModeToggleWrapper');
    const toggle = document.getElementById('batchModeToggle');
    const configPanel = document.getElementById('batchModeConfig');
    const configBody = document.getElementById('batchModeConfigBody');

    const available = fileCount >= 2;
    if (wrapper) {
        wrapper.classList.toggle('hidden', !available);
    }
    if (toggle) {
        toggle.disabled = !available;
        toggle.checked = available && batchModeEnabled;
    }
    if (configPanel) {
        const shouldShowConfig = available && batchModeEnabled;
        configPanel.classList.toggle('hidden', !shouldShowConfig);
        if (!shouldShowConfig) {
            batchConfigCollapsed = true;
        }
    }

    if (configPanel && configBody) {
        updateBatchConfigCollapse();
    }
}

window.syncBatchModeControls = syncBatchModeControls;

/**
 * 處理從檔案列表中移除單個檔案的操作。
 * @param {number} indexToRemove - 要從 `pdfFiles` 陣列中移除的檔案的索引。
 */
function handleRemoveFile(indexToRemove) {
    pdfFiles.splice(indexToRemove, 1);
    // ========== 新增：移除檔案時重新整理 window.data ==========
    if (pdfFiles.length === 1) {
        window.data = { name: pdfFiles[0].name, ocr: '', translation: '', images: [], summaries: {} };
    } else if (pdfFiles.length === 0) {
        window.data = {};
    } else {
        window.data = { summaries: {} };
    }
    updateFileListUI(pdfFiles, isProcessing, handleRemoveFile);
    updateProcessButtonState(pdfFiles, isProcessing);
    refreshFormatFilters();
}

/**
 * 將使用者選擇的檔案新增到待處理列表 `pdfFiles` 中。
 * 會進行檔案型別檢查（支援 PDF / MD / TXT / DOCX / PPTX / HTML / EPUB）和重複檔案檢查（基於檔名和大小）。
 * 新增檔案後會更新UI。
 * @param {FileList} selectedFiles - 使用者透過拖拽或檔案對話方塊選擇的檔案列表。
 */
async function addFilesToList(selectedFiles) {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const fileArray = Array.from(selectedFiles);
    const incomingFiles = [];

    for (const rawFile of fileArray) {
        const ext = deriveExtension(rawFile && rawFile.name ? rawFile.name : '');
        if (SUPPORTED_ARCHIVE_EXTENSIONS.includes(ext)) {
            const extracted = await extractFilesFromZip(rawFile);
            if (extracted.length === 0) {
                showNotification && showNotification(`壓縮包 "${rawFile.name}" 中沒有可處理的檔案`, 'info');
            }
            incomingFiles.push(...extracted);
            continue;
        }

        if (!isSupportedFileExtension(ext)) {
            const supportedLabel = SUPPORTED_FILE_EXTENSIONS.map(v => v.toUpperCase()).join(' / ');
            showNotification && showNotification(`檔案 "${rawFile.name}" 不是支援的檔案型別 (${supportedLabel})，已忽略`, 'warning');
            continue;
        }

        annotateFileMetadata(rawFile);
        incomingFiles.push(rawFile);
    }

    if (incomingFiles.length === 0) return;

    let filesAdded = false;
    incomingFiles.forEach(file => {
        const identifier = buildFileIdentifier(file);
        const duplication = pdfFiles.some(existing => buildFileIdentifier(existing) === identifier);
        if (duplication) {
            showNotification && showNotification(`檔案 "${getFileDisplayName(file)}" 已在列表中`, 'info');
            return;
        }
        pdfFiles.push(file);
        filesAdded = true;
    });

    if (filesAdded) {
        if (pdfFiles.length === 1) {
            window.data = { name: pdfFiles[0].name, ocr: '', translation: '', images: [], summaries: {} };
        } else if (pdfFiles.length > 1) {
            window.data = { summaries: {} };
        }
        updateFileListUI(pdfFiles, isProcessing, handleRemoveFile);
        updateProcessButtonState(pdfFiles, isProcessing);
        syncBatchModeControls(pdfFiles.length);
        refreshFormatFilters();
    }
}

function deriveExtension(name) {
    if (!name || typeof name !== 'string') return '';
    const cleaned = name.split('?')[0].split('#')[0];
    const parts = cleaned.split('.');
    if (parts.length <= 1) return '';
    return parts.pop().trim().toLowerCase();
}

function isExtensionExcluded(ext) {
    return excludedExtensions.has((ext || '').toLowerCase());
}

window.isExtensionExcluded = isExtensionExcluded;

function isSupportedFileExtension(ext) {
    return SUPPORTED_FILE_EXTENSIONS.includes((ext || '').toLowerCase());
}

function getFileRelativePath(file) {
    if (!file) return '';
    return file.pbxRelativePath || file.webkitRelativePath || file.relativePath || file.fullPath || file.name || '';
}

function getFileDisplayName(file) {
    const rel = getFileRelativePath(file);
    if (!rel) return file && file.name ? file.name : '';
    const normalized = rel.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || rel;
}

function annotateFileMetadata(file, providedPath) {
    if (!file) return;
    const relativePath = providedPath || file.webkitRelativePath || file.relativePath || file.fullPath || file.name || '';
    try {
        file.pbxRelativePath = relativePath;
        file.originalName = file.originalName || file.name;
    } catch (e) {
        // ignore readonly property assignment errors
    }
}

function buildFileIdentifier(file) {
    const rel = getFileRelativePath(file).toLowerCase();
    return `${rel}__${file && typeof file.size === 'number' ? file.size : '0'}`;
}

async function extractFilesFromZip(zipFile, options = {}) {
    if (typeof JSZip === 'undefined') {
        showNotification && showNotification('缺少 JSZip 依賴，無法解壓 ZIP', 'error');
        return [];
    }
    try {
        const zip = await JSZip.loadAsync(zipFile);
        const entries = [];
        const zipFiles = Object.keys(zip.files);
        const pathPrefix = options.pathPrefix ? options.pathPrefix.replace(/\\/g, '/') : '';
        const stripRoot = options.stripRoot || false;

        for (const key of zipFiles) {
            const entry = zip.files[key];
            if (!entry || entry.dir) continue;
            const normalizedPath = key.replace(/\\/g, '/');

            if (pathPrefix) {
                if (!normalizedPath.startsWith(pathPrefix)) continue;
            }

            const ext = deriveExtension(normalizedPath);
            if (!isSupportedFileExtension(ext)) continue;

            const blob = await entry.async('blob');
            const baseNameParts = normalizedPath.split('/');
            let displayName = baseNameParts.pop();
            let relativePath = normalizedPath;

            if (pathPrefix) {
                relativePath = normalizedPath.substring(pathPrefix.length);
                if (relativePath.startsWith('/')) {
                    relativePath = relativePath.slice(1);
                }
            } else if (stripRoot && baseNameParts.length > 0) {
                // remove first segment (top-level directory)
                const segments = normalizedPath.split('/');
                segments.shift();
                relativePath = segments.join('/');
                displayName = segments.pop() || displayName;
            }

            if (!relativePath) {
                relativePath = displayName;
            }

            const derivedName = displayName || normalizedPath;
            const newFile = new File([blob], derivedName, {
                type: blob.type || 'application/octet-stream',
                lastModified: zipFile.lastModified || Date.now()
            });
            annotateFileMetadata(newFile, relativePath);
            try {
                newFile.virtualSource = 'zip';
                newFile.sourceArchive = zipFile.name;
            } catch (_) {}
            entries.push(newFile);
        }

        return entries;
    } catch (error) {
        console.error('解壓 ZIP 檔案失敗:', error);
        showNotification && showNotification(`解壓 "${zipFile && zipFile.name ? zipFile.name : 'ZIP'}" 失敗: ${error.message || error}`, 'error');
        return [];
    }
}

async function extractFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];
    const itemsSnapshot = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    const fallbackSnapshot = dataTransfer.files ? Array.from(dataTransfer.files) : [];
    const firstItem = itemsSnapshot.length > 0 ? itemsSnapshot[0] : null;
    const hasEntryApi = firstItem && typeof firstItem.webkitGetAsEntry === 'function';

    if (hasEntryApi) {
        const entryPromises = [];
        for (let i = 0; i < itemsSnapshot.length; i++) {
            const item = itemsSnapshot[i];
            if (!item || typeof item.webkitGetAsEntry !== 'function') continue;
            const entry = item.webkitGetAsEntry();
            if (!entry) continue; // In insecure contexts Chrome returns null – fall back later
            entryPromises.push(traverseFileSystemEntry(entry));
        }

        if (entryPromises.length > 0) {
            const results = await Promise.all(entryPromises);
            const flattened = results.flat().filter(Boolean);
            if (flattened.length > 0) {
                return flattened;
            }
            console.warn('extractFilesFromDataTransfer: FileSystemEntry API returned no files, using fallback.');
        }
    }

    fallbackSnapshot.forEach(file => annotateFileMetadata(file));
    return fallbackSnapshot;
}

function refreshFormatFilters() {
    const container = document.getElementById('fileFormatFilters');
    if (!container) return;
    const counts = new Map();
    pdfFiles.forEach(file => {
        const ext = deriveExtension(file.name || '') || '';
        counts.set(ext, (counts.get(ext) || 0) + 1);
    });
    // 清理不存在的擴充
    Array.from(excludedExtensions).forEach(ext => {
        if (!counts.has(ext)) {
            excludedExtensions.delete(ext);
        }
    });

    if (counts.size === 0) {
        container.innerHTML = '<span class="text-gray-500">暫無檔案</span>';
        return;
    }

    const fragments = [];
    const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    entries.forEach(([ext, count]) => {
        const checked = !isExtensionExcluded(ext) ? 'checked' : '';
        const label = ext ? ext.toUpperCase() : '未知';
        // XSS 防護：轉義副檔名，防止惡意檔名注入
        const safeExt = escapeHtml(ext);
        const safeLabel = escapeHtml(label);
        fragments.push(`
            <label class="flex items-center space-x-1 bg-white border border-gray-200 rounded px-2 py-1 shadow-sm">
                <input type="checkbox" class="format-filter-checkbox" data-ext="${safeExt}" ${checked}>
                <span>${safeLabel} <span class="text-gray-400">(${count})</span></span>
            </label>
        `);
    });

    fragments.push('<div class="flex-grow"></div><button type="button" id="resetFormatFilters" class="text-xs text-blue-600">重置</button>');
    container.innerHTML = `<div class="flex flex-wrap gap-2 items-center">${fragments.join('')}</div>`;
}

function getActiveFiles() {
    return pdfFiles.filter(file => {
        const ext = deriveExtension(file.name || '');
        return !isExtensionExcluded(ext);
    });
}

window.getActiveFiles = getActiveFiles;

function updateBatchConfigCollapse() {
    const body = document.getElementById('batchModeConfigBody');
    const toggleLabel = document.getElementById('batchModeConfigToggleLabel');
    const toggleIcon = document.getElementById('batchModeConfigToggleIcon');
    if (!body || !toggleLabel || !toggleIcon) return;

    if (batchConfigCollapsed) {
        body.classList.add('hidden');
        toggleLabel.textContent = '展開設定';
        toggleIcon.setAttribute('icon', 'carbon:chevron-down');
    } else {
        body.classList.remove('hidden');
        toggleLabel.textContent = '收起設定';
        toggleIcon.setAttribute('icon', 'carbon:chevron-up');
    }
}

function handleFormatFilterChange(event) {
    const target = event.target;
    if (!target || !target.classList.contains('format-filter-checkbox')) return;
    const ext = target.getAttribute('data-ext');
    if (!ext) return;
    if (target.checked) {
        excludedExtensions.delete(ext);
    } else {
        excludedExtensions.add(ext);
    }
    updateFileListUI(pdfFiles, isProcessing, handleRemoveFile);
    refreshFormatFilters();
    updateProcessButtonState(pdfFiles, isProcessing);
    syncBatchModeControls(pdfFiles.length);
}

function handleFormatFilterClick(event) {
    const target = event.target;
    if (target && target.id === 'resetFormatFilters') {
        excludedExtensions.clear();
        updateFileListUI(pdfFiles, isProcessing, handleRemoveFile);
        refreshFormatFilters();
        updateProcessButtonState(pdfFiles, isProcessing);
        syncBatchModeControls(pdfFiles.length);
    }
}

function traverseFileSystemEntry(entry, path = '') {
    return new Promise((resolve) => {
        if (!entry) {
            resolve([]);
            return;
        }

        if (entry.isFile) {
            entry.file(file => {
                const relativePath = path ? `${path}/${file.name}` : file.name;
                annotateFileMetadata(file, relativePath);
                resolve([file]);
            }, () => resolve([]));
        } else if (entry.isDirectory) {
            const directoryReader = entry.createReader();
            const accumulated = [];

            const readEntries = () => {
                directoryReader.readEntries(async batch => {
                    if (!batch.length) {
                        const nestedResults = [];
                        for (const child of accumulated) {
                            const childPath = path ? `${path}/${child.name}` : child.name;
                            const childFiles = await traverseFileSystemEntry(child, childPath);
                            nestedResults.push(...childFiles);
                        }
                        resolve(nestedResults);
                    } else {
                        accumulated.push(...batch);
                        readEntries();
                    }
                }, () => resolve([]));
            };

            readEntries();
        } else {
            resolve([]);
        }
    });
}

async function handleGithubImport() {
    const rawUrl = prompt('請輸入 GitHub 倉庫或目錄連結 (例如 https://github.com/user/repo 或 https://github.com/user/repo/tree/branch/path):');
    if (!rawUrl) return;

    const parsed = parseGithubUrl(rawUrl.trim());
    if (!parsed) {
        showNotification && showNotification('無法解析 GitHub 連結，請檢查格式。', 'error');
        return;
    }

    const { owner, repo, ref, pathPrefix } = parsed;

    try {
        showNotification && showNotification('正在從 GitHub 獲取檔案列表，請稍候...', 'info');
        const treeEntries = await fetchGithubTree(owner, repo, ref, pathPrefix);
        if (!treeEntries.length) {
            showNotification && showNotification('在指定路徑中未找到可處理的檔案。', 'warning');
            return;
        }

        const files = await downloadGithubFiles(owner, repo, ref, treeEntries, pathPrefix);
        if (!files.length) {
            showNotification && showNotification('獲取 GitHub 檔案失敗或沒有可處理的檔案。', 'warning');
            return;
        }

        await addFilesToList(files);
        showNotification && showNotification(`已從 ${owner}/${repo} 匯入 ${files.length} 個檔案`, 'success');
    } catch (error) {
        console.error('GitHub 匯入失敗:', error);
        showNotification && showNotification(`GitHub 匯入失敗：${error.message || error}`, 'error');
    }
}

/**
 * 處理 URL 匯入（支援 arXiv 和任意 PDF 連結）
 */
async function handleUrlImport() {
    const rawUrls = prompt('請輸入 PDF URL（支援 arXiv 連結），多個連結請用換行分隔:\n\n例如:\nhttps://arxiv.org/abs/2301.12345\nhttps://example.com/paper.pdf');
    if (!rawUrls) return;

    const urls = rawUrls.trim().split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    try {
        showNotification && showNotification(`正在下載 ${urls.length} 個 PDF 檔案...`, 'info');
        const downloadResults = await Promise.allSettled(
            urls.map(url => downloadPdfFromUrl(url))
        );

        const successFiles = [];
        const failedUrls = [];

        downloadResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                successFiles.push(result.value);
            } else {
                failedUrls.push({ url: urls[index], error: result.reason?.message || '未知錯誤' });
            }
        });

        if (successFiles.length > 0) {
            await addFilesToList(successFiles);
        }

        if (failedUrls.length > 0) {
            console.error('部分 URL 下載失敗:', failedUrls);
            const failedList = failedUrls.map(f => `${f.url}: ${f.error}`).join('\n');
            showNotification && showNotification(
                `成功匯入 ${successFiles.length} 個檔案，失敗 ${failedUrls.length} 個\n\n失敗列表:\n${failedList}`,
                successFiles.length > 0 ? 'warning' : 'error'
            );
        } else {
            showNotification && showNotification(`成功從 URL 匯入 ${successFiles.length} 個檔案`, 'success');
        }
    } catch (error) {
        console.error('URL 匯入失敗:', error);
        showNotification && showNotification(`URL 匯入失敗：${error.message || error}`, 'error');
    }
}

/**
 * 從 URL 下載 PDF（支援 arXiv 連結識別和 failback 機制）
 * @param {string} url - PDF URL 或 arXiv 連結
 * @returns {Promise<File>} - 下載的檔案物件
 */
async function downloadPdfFromUrl(url) {
    // 解析 URL，識別 arXiv 連結
    const parsedUrl = parseArxivUrl(url);
    const pdfUrl = parsedUrl.pdfUrl || url;
    const filename = parsedUrl.filename || extractFilenameFromUrl(url);

    console.log(`[URL Import] Downloading: ${pdfUrl}`);

    try {
        // 1. 先嚐試直接下載
        const file = await downloadPdfDirect(pdfUrl, filename);
        console.log(`[URL Import] Direct download successful: ${filename}`);
        return file;
    } catch (directError) {
        console.warn(`[URL Import] Direct download failed, trying proxy:`, directError.message);

        try {
            // 2. 失敗後嘗試透過代理下載
            const file = await downloadPdfViaProxy(pdfUrl, filename);
            console.log(`[URL Import] Proxy download successful: ${filename}`);
            return file;
        } catch (proxyError) {
            console.error(`[URL Import] Both direct and proxy download failed:`, proxyError.message);
            throw new Error(`下載失敗: ${proxyError.message}`);
        }
    }
}

/**
 * 解析 arXiv URL，提取 arXiv ID 並轉換為 PDF 下載連結
 * @param {string} url - 輸入的 URL
 * @returns {Object} - { pdfUrl, filename, arxivId }
 */
function parseArxivUrl(url) {
    // 比對 arXiv URL 格式
    // 支援: https://arxiv.org/abs/2301.12345, https://arxiv.org/pdf/2301.12345.pdf
    const arxivAbsPattern = /arxiv\.org\/abs\/([0-9.]+)/i;
    const arxivPdfPattern = /arxiv\.org\/pdf\/([0-9.]+)/i;

    let match = url.match(arxivAbsPattern) || url.match(arxivPdfPattern);
    if (match) {
        const arxivId = match[1];
        return {
            pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
            filename: `arxiv_${arxivId}.pdf`,
            arxivId: arxivId
        };
    }

    return { pdfUrl: null, filename: null, arxivId: null };
}

/**
 * 從 URL 提取檔名
 * @param {string} url - URL
 * @returns {string} - 檔名
 */
function extractFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const parts = pathname.split('/').filter(Boolean);
        const lastPart = parts[parts.length - 1];

        // 確保檔名有 .pdf 副檔名
        if (lastPart && lastPart.endsWith('.pdf')) {
            return lastPart;
        } else if (lastPart) {
            return `${lastPart}.pdf`;
        }

        // 使用時間戳作為預設檔名
        return `downloaded_${Date.now()}.pdf`;
    } catch (e) {
        return `downloaded_${Date.now()}.pdf`;
    }
}

/**
 * 直接下載 PDF（不透過代理）
 * @param {string} url - PDF URL
 * @param {string} filename - 檔名
 * @returns {Promise<File>} - 檔案物件
 */
async function downloadPdfDirect(url, filename) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/pdf'
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('pdf')) {
        throw new Error(`不是 PDF 檔案 (Content-Type: ${contentType})`);
    }

    const blob = await response.blob();
    return new File([blob], filename, { type: 'application/pdf' });
}

/**
 * 透過 academic-search-proxy 代理下載 PDF（支援分片下載）
 * @param {string} url - PDF URL
 * @param {string} filename - 檔名
 * @returns {Promise<File>} - 檔案物件
 */
async function downloadPdfViaProxy(url, filename) {
    // 獲取代理配置
    const proxyConfig = getAcademicSearchProxyConfig();
    if (!proxyConfig.baseUrl) {
        throw new Error('未配置 Academic Search Proxy');
    }

    const proxyUrl = `${proxyConfig.baseUrl}/api/pdf/download?url=${encodeURIComponent(url)}`;

    const headers = {
        'Accept': 'application/pdf'
    };

    // 新增認證頭（如果配置了）
    if (proxyConfig.authKey) {
        headers['X-Auth-Key'] = proxyConfig.authKey;
    }

    console.log(`[URL Import] Using proxy: ${proxyUrl}`);

    const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: headers
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`代理下載失敗 (HTTP ${response.status}): ${errorText}`);
    }

    const contentType = response.headers.get('Content-Type');
    console.log(`[URL Import] Proxy response Content-Type: ${contentType}`);

    // 檢查 Content-Type（放寬檢查，允許 octet-stream 或 HTML 但檢查實際內容）
    if (contentType && (contentType.includes('json') || contentType.includes('xml'))) {
        // 如果是 JSON 或 XML，可能是錯誤響應
        const text = await response.text();
        console.error(`[URL Import] Proxy returned non-PDF content:`, text.substring(0, 500));
        throw new Error(`代理返回的不是 PDF 檔案 (Content-Type: ${contentType})`);
    }

    const blob = await response.blob();

    // 驗證 blob 大小（PDF 檔案至少應該有一些內容）
    if (blob.size < 100) {
        throw new Error(`下載的檔案過小 (${blob.size} bytes)，可能不是有效的 PDF`);
    }

    console.log(`[URL Import] Downloaded PDF blob: ${blob.size} bytes`);
    return new File([blob], filename, { type: 'application/pdf' });
}

/**
 * 獲取 Academic Search Proxy 配置
 * @returns {Object} - { baseUrl, authKey }
 */
function getAcademicSearchProxyConfig() {
    // 從 localStorage 讀取配置（與 reference-doi-resolver.js 保持一致）
    const storedConfig = localStorage.getItem('academicSearchProxyConfig');
    if (storedConfig) {
        try {
            const config = JSON.parse(storedConfig);
            return {
                baseUrl: config.baseUrl || '',
                authKey: config.authKey || ''
            };
        } catch (e) {
            console.error('[URL Import] Failed to parse proxy config:', e);
        }
    }

    return { baseUrl: '', authKey: '' };
}


function parseGithubUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (!/github\.com$/i.test(url.hostname)) {
            return null;
        }
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length < 2) {
            return null;
        }
        const owner = decodeURIComponent(segments[0]);
        const repo = decodeURIComponent(segments[1].replace(/\.git$/i, ''));
        let ref = 'main';
        let pathPrefix = '';

        if (segments[2] === 'tree' || segments[2] === 'blob') {
            if (segments.length >= 4) {
                ref = decodeURIComponent(segments[3]);
                if (segments.length > 4) {
                    pathPrefix = segments.slice(4).map(decodeURIComponent).join('/');
                }
            }
        }

        return { owner, repo, ref, pathPrefix };
    } catch (error) {
        console.warn('parseGithubUrl error:', error);
        return null;
    }
}

async function fetchGithubTree(owner, repo, ref, pathPrefix) {
    const encodedRef = encodeURIComponent(ref);
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodedRef}?recursive=1`;
    const response = await fetch(treeUrl, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (response.status === 404) {
        throw new Error('未找到倉庫或分支，請檢查連結');
    }
    if (response.status === 403) {
        throw new Error('GitHub API 速率限制，請稍後再試');
    }
    if (!response.ok) {
        throw new Error(`GitHub API 返回錯誤狀態 ${response.status}`);
    }
    const data = await response.json();
    if (!data || !Array.isArray(data.tree)) {
        throw new Error('GitHub API 返回資料不完整');
    }

    const prefix = pathPrefix ? pathPrefix.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '') : '';
    const matched = data.tree.filter(item => {
        if (!item || item.type !== 'blob') return false;
        if (!prefix) return true;
        if (!item.path) return false;
        return item.path === prefix || item.path.startsWith(prefix + '/');
    });

    return matched;
}

async function downloadGithubFiles(owner, repo, ref, treeEntries, pathPrefix) {
    const files = [];
    const prefix = pathPrefix ? pathPrefix.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '') : '';
    const repoIdentifier = `${owner}/${repo}@${ref}`;

    const queue = treeEntries.slice();
    const concurrency = 4;
    const workers = new Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0) {
            const entry = queue.shift();
            if (!entry || !entry.path) continue;
            let relativePath = entry.path;
            if (prefix) {
                if (!entry.path.startsWith(prefix + '/')) {
                    continue;
                }
                relativePath = entry.path.slice(prefix.length + 1);
            }
            if (!relativePath || relativePath.endsWith('/')) continue;
            const ext = deriveExtension(relativePath);
            if (!isSupportedFileExtension(ext)) continue;

            const rawPathParts = entry.path.split('/').map(encodeURIComponent).join('/');
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rawPathParts}`;
            try {
                const fileResponse = await fetch(rawUrl);
                if (!fileResponse.ok) {
                    console.warn(`無法獲取 ${rawUrl}: ${fileResponse.status}`);
                    continue;
                }
                const blob = await fileResponse.blob();
                const displayName = relativePath.split('/').pop();
                const file = new File([blob], displayName || 'document', {
                    type: blob.type || 'application/octet-stream',
                    lastModified: Date.now()
                });
                const pathSegments = [repo];
                if (prefix) pathSegments.push(prefix);
                pathSegments.push(relativePath);
                const annotatedPath = pathSegments
                    .filter(Boolean)
                    .join('/')
                    .replace(/\/+/g, '/');
                annotateFileMetadata(file, annotatedPath);
                try {
                    file.virtualSource = 'github';
                    file.sourceArchive = repoIdentifier;
                } catch (_) {}
                files.push(file);
            } catch (error) {
                console.warn('下載 GitHub 檔案失敗:', error);
            }
        }
    });

    await Promise.all(workers);
    return files;
}

/**
 * 根據目標語言下拉選單的選擇，更新自定義語言輸入欄位的可見性。
 * 如果選擇了 "custom"，則顯示自定義語言名稱輸入欄位，否則隱藏。
 */
function updateCustomLanguageInputVisibility() {
    const targetLangValue = document.getElementById('targetLanguage').value;
    const customInputContainer = document.getElementById('customTargetLanguageContainer');
    if (targetLangValue === 'custom') {
        customInputContainer.classList.remove('hidden');
    } else {
        customInputContainer.classList.add('hidden');
    }

    if (typeof window.updateDeeplxTargetLangHint === 'function') {
        window.updateDeeplxTargetLangHint();
    }
}

function updateDeeplxTargetLangHint() {
    const hintEl = document.getElementById('deeplxTargetLangHint');
    if (!hintEl) return;
    const modelSelect = document.getElementById('translationModel');
    const modelValue = modelSelect ? modelSelect.value : '';
    if (modelValue !== 'deeplx') {
        hintEl.textContent = '選擇 DeepLX 後會顯示對應的目標語言程式碼。';
        return;
    }

    const targetSelect = document.getElementById('targetLanguage');
    let langValue = targetSelect ? targetSelect.value : '';
    if (langValue === 'custom') {
        const customInput = document.getElementById('customTargetLanguageInput');
        if (customInput && customInput.value.trim()) {
            langValue = customInput.value.trim();
        } else {
            langValue = '';
        }
    }

    const mapper = (typeof window.mapToDeeplxLangCode === 'function') ? window.mapToDeeplxLangCode : null;
    const code = mapper ? mapper(langValue) : undefined;
    if (code) {
        const displayMap = (typeof window.DEEPLX_LANG_DISPLAY === 'object') ? window.DEEPLX_LANG_DISPLAY : null;
        const display = displayMap && displayMap[code];
        const zhName = display && display.zh ? display.zh : '';
        hintEl.textContent = zhName ? `當前目標語言程式碼：${code}（${zhName}）` : `當前目標語言程式碼：${code}`;
    } else {
        hintEl.textContent = '請在目標語言中選擇 DeepL 支援的語言，或在自定義輸入欄位中手動填寫如 EN、DE 等程式碼。';
    }
}

window.updateDeeplxTargetLangHint = updateDeeplxTargetLangHint;

/**
 * 儲存當前所有使用者設定到 localStorage。
 * 從UI元素讀取各項配置值，構建設定物件，然後呼叫 `saveSettings` (來自 storage.js)。
 */
function saveCurrentSettings() {
    // 從 DOM 讀取當前所有設定值
    const targetLangValue = document.getElementById('targetLanguage').value;
    const selectedModel = document.getElementById('translationModel').value;
    let selectedSiteId = null;
    if (selectedModel === 'custom') {
        const siteDropdown = document.getElementById('customSourceSiteSelect');
        if (siteDropdown) {
            selectedSiteId = siteDropdown.value;
        }
    }

    const settingsData = {
        maxTokensPerChunk: document.getElementById('maxTokensPerChunk').value,
        skipProcessedFiles: document.getElementById('skipProcessedFiles').checked,
        selectedTranslationModel: selectedModel,
        selectedCustomSourceSiteId: selectedSiteId,
        concurrencyLevel: document.getElementById('concurrencyLevel').value,
        translationConcurrencyLevel: document.getElementById('translationConcurrencyLevel').value,
        targetLanguage: targetLangValue,
        customTargetLanguageName: targetLangValue === 'custom' ? document.getElementById('customTargetLanguageInput').value : '',
        defaultSystemPrompt: document.getElementById('defaultSystemPrompt').value,
        defaultUserPromptTemplate: document.getElementById('defaultUserPromptTemplate').value,
        promptMode: document.querySelector('input[name="promptMode"]:checked')?.value || 'builtin',
        enableGlossary: document.getElementById('enableGlossaryToggle')?.checked || false,
        batchModeEnabled: batchModeEnabled,
        batchModeTemplate: batchModeTemplate,
        batchModeFormats: Array.from(new Set(batchModeFormats)),
        batchModeZipEnabled: batchModeZipEnabled
    };
    if (!settingsData.batchModeFormats.includes('original')) {
        settingsData.batchModeFormats.unshift('original');
    }
    // 呼叫 storage.js 中的儲存函式
    saveSettings(settingsData);

    // 舊的自定義模型設定儲存邏輯已移除，因為它們透過源站點配置進行管理和儲存。
    // If a specific custom source site is selected, its details are already saved via key-manager-ui.js
    // and `loadAllCustomSourceSites()` in `handleProcessClick` will fetch them.
}

// =====================
// 核心處理流程啟動
// =====================
/**
 * 處理點選"開始處理"按鈕的事件，啟動核心的檔案處理流程。
 * 步驟包括：
 * 1. 載入最新設定。
 * 2. 根據是否需要OCR（PDF檔案）和使用者選擇的翻譯模型，初始化 `KeyProvider` 例項。
 * 3. 檢查所需API Keys是否可用，若不可用則提示使用者並中止。
 * 4. 檢查是否有檔案被選中。
 * 5. 設定處理狀態變數，更新UI（如進度條、按鈕狀態）。
 * 6. 獲取並行數、重試次數、目標語言等處理引數。
 * 7. 走訪檔案列表，對於需要處理的檔案（未跳過），將其加入處理佇列。
 * 8. 啟動非同步處理佇列 `processQueue`，該佇列會並行地呼叫 `processSinglePdf` 處理每個檔案。
 * 9. `processSinglePdf` 會處理單個檔案的OCR、分塊、翻譯，並處理可能的Key失效和重試。
 * 10. 收集每個檔案的處理結果（成功、失敗、跳過）。
 * 11. 處理完成後，更新UI，儲存已處理檔案記錄，並顯示結果下載區域。
 * @async
 */
async function handleProcessClick() {
    if (isProcessing) return;

    // 1. 獲取設定，包括選定的翻譯模型
    const settings = loadSettings(); // 從儲存載入最新設定
    // const selectedTranslationModelName = document.getElementById('translationModel').value; // 舊的直接讀取方式
    const selectedTranslationModelName = settings.selectedTranslationModel;

    const hasPdfFiles = pdfFiles.some(file => file.name.toLowerCase().endsWith('.pdf'));
    const filesToProcess = getActiveFiles();

    // 2. 檢查 OCR 配置（如果有 PDF 檔案）
    if (hasPdfFiles) {
        let ocrEngine = 'mistral';
        try {
            if (window.ocrSettingsManager && typeof window.ocrSettingsManager.getCurrentConfig === 'function') {
                ocrEngine = window.ocrSettingsManager.getCurrentConfig().engine || 'mistral';
                const validation = window.ocrSettingsManager.validateConfig();
                if (!validation.valid) {
                    const engineNames = { mistral: 'Mistral OCR', mineru: 'MinerU', doc2x: 'Doc2X', none: '不需要 OCR' };
                    const engineName = engineNames[ocrEngine] || ocrEngine;
                    showNotification(`OCR 引擎（${engineName}）配置不完整：${validation.message}`, 'error');
                    return;
                }
            } else {
                // 回退邏輯：檢查 Mistral Keys
                const mistralKeyProvider = new KeyProvider('mistral');
                if (!mistralKeyProvider.hasAvailableKeys()) {
                    showNotification('檢測到 PDF 檔案，但沒有可用的 Mistral API Key (請在Key管理中新增並確保狀態為有效或未測試)', 'error');
                    return;
                }
            }
        } catch (e) {
            console.error('[OCR Check] Failed:', e);
            showNotification('OCR 配置檢查失敗，請重新整理頁面重試', 'error');
            return;
        }
    }

    // 初始化翻譯 Key Provider
    let translationKeyProvider = null;
    /** @type {string|null}  用於 KeyProvider 的模型名 (例如 'gemini', 'custom_source_xxx') */
    let currentTranslationModelForProvider = null;
    /** @type {Object|null} 用於 processSinglePdf 的模型配置物件 (包含baseUrl, modelId等) */
    let translationModelConfigForProcess = null;

    if (selectedTranslationModelName !== 'none') {
        if (selectedTranslationModelName === 'custom') {
            const selectedCustomSourceId = settings.selectedCustomSourceSiteId; // 從儲存的設定中獲取
            if (!selectedCustomSourceId) {
                isProcessing = false;
                updateProcessButtonState(pdfFiles, isProcessing);
                showNotification('請先在主頁面選擇一個自定義源站點，並確保已配置API Key。', 'error');
                addProgressLog('錯誤: 未選擇自定義源站點 (從設定載入失敗)。');

                // 嘗試自動展開自定義源站點設定區域
                const customSourceSiteToggle = document.getElementById('customSourceSiteToggle');
                const customSourceSite = document.getElementById('customSourceSite');
                const customSourceSiteToggleIcon = document.getElementById('customSourceSiteToggleIcon');

                if (customSourceSiteToggle && customSourceSite && customSourceSite.classList.contains('hidden')) {
                    customSourceSite.classList.remove('hidden');
                    if (customSourceSiteToggleIcon) {
                        customSourceSiteToggleIcon.setAttribute('icon', 'carbon:chevron-up');
                    }
                }

                return;
            }
            const allSourceSites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
            const siteConfig = allSourceSites[selectedCustomSourceId];

            if (!siteConfig) {
                isProcessing = false;
                updateProcessButtonState(pdfFiles, isProcessing);
                showNotification(`未能載入ID為 "${selectedCustomSourceId}" 的自定義源站配置。`, 'error');
                addProgressLog(`錯誤: 未能載入自定義源站配置 (ID: ${selectedCustomSourceId})。`);
                // UI 清理和返回的邏輯...
                return;
            }
            currentTranslationModelForProvider = `custom_source_${selectedCustomSourceId}`;
            translationModelConfigForProcess = siteConfig; // siteConfig 包含 apiBaseUrl, modelId 等
            addProgressLog(`使用自定義源站: ${siteConfig.displayName || selectedCustomSourceId}`);
        } else {
            // For preset models
            currentTranslationModelForProvider = selectedTranslationModelName;
            translationModelConfigForProcess = typeof loadModelConfig === 'function' ? loadModelConfig(selectedTranslationModelName) : {}; // 可能包含預設的baseUrl等
            if (!translationModelConfigForProcess && selectedTranslationModelName !== 'none'){
                 //嘗試從舊的 customModelSettings 載入，以相容舊版單自定義模型設定，但這部分應逐漸淘汰
                console.warn(`Preset model config for ${selectedTranslationModelName} not found via loadModelConfig. Attempting fallback (legacy).`);
            }
            addProgressLog(`使用預設翻譯模型: ${selectedTranslationModelName}`);
        }

        if (currentTranslationModelForProvider) {
            translationKeyProvider = new KeyProvider(currentTranslationModelForProvider);
            if (!translationKeyProvider.hasAvailableKeys()) {
                // 最佳化：更友好的錯誤提示訊息
                const modelDisplayName = translationModelConfigForProcess?.displayName || currentTranslationModelForProvider;
                const isCustomSource = currentTranslationModelForProvider.startsWith('custom_source_');
                let errorMsg = '';

                if (isCustomSource) {
                    const sourceSiteId = currentTranslationModelForProvider.replace('custom_source_', '');
                    errorMsg = `源站 "${modelDisplayName}" 沒有可用的 API Key。請點選源站資訊下方的"管理該站點 API Key"按鈕新增Key。`;

                    // 如果當前在處理頁，則嘗試自動觸發API Key管理
                    if (typeof showNotification === 'function') {
                        setTimeout(() => {
                            const manageBtn = document.getElementById('manageSourceSiteKeyBtn');
                            if (manageBtn && !manageBtn.classList.contains('hidden')) {
                                if (confirm(`是否立即開啟源站 "${modelDisplayName}" 的API Key管理介面新增Key？`)) {
                                    manageBtn.click();
                                }
                            }
                        }, 1000);
                    }
                } else {
                    errorMsg = `模型 "${modelDisplayName}" 沒有可用的 API Key。請點選頁面右上方的"模型與Key管理"按鈕新增Key。`;
                }

                showNotification(errorMsg, 'error');
                return;
            }
        }
    } else {
        addProgressLog('未選擇翻譯模型，跳過翻譯步驟。');
    }

    if (filesToProcess.length === 0) {
        showNotification('請選擇至少一個可處理的檔案（檢查格式篩選是否排除全部檔案）', 'error');
        return;
    }

    // 4. 設定處理狀態等...
    isProcessing = true;
    if (typeof window !== 'undefined' && window.promptPoolUI && typeof window.promptPoolUI.resetSessionLock === 'function') {
        window.promptPoolUI.resetSessionLock();
    }
    activeProcessingCount = 0;
    retryAttempts.clear();
    allResults = new Array(filesToProcess.length);
    updateProcessButtonState(pdfFiles, isProcessing);
    showProgressSection();
    addProgressLog('=== 開始批次處理 ===');

    // 5. 獲取並行和重試設定等...
    const concurrencyLevel = parseInt(settings.concurrencyLevel) || 1;
    const translationConcurrencyLevel = parseInt(settings.translationConcurrencyLevel) || 2;
    const skipEnabled = settings.skipProcessedFiles;
    const maxTokensValue = parseInt(settings.maxTokensPerChunk) || 2000;
    const targetLanguageSetting = settings.targetLanguage;
    const customTargetLanguageNameSetting = settings.customTargetLanguageName;
    const defaultSystemPromptSetting = settings.defaultSystemPrompt;
    const defaultUserPromptTemplateSetting = settings.defaultUserPromptTemplate;
    const useCustomPromptsSetting = settings.useCustomPrompts;

    const effectiveTargetLanguage = targetLanguageSetting === 'custom'
        ? customTargetLanguageNameSetting.trim() || 'English'
        : targetLanguageSetting;

    if (batchModeEnabled && pdfFiles.length >= 2) {
        const uniqueFormats = Array.from(new Set(batchModeFormats && batchModeFormats.length > 0 ? batchModeFormats : ['markdown']));
        activeBatchSession = {
            id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            total: pdfFiles.length,
            template: batchModeTemplate && batchModeTemplate.trim() ? batchModeTemplate.trim() : DEFAULT_BATCH_TEMPLATE,
            formats: uniqueFormats,
            outputLanguage: effectiveTargetLanguage,
            startedAt: new Date().toISOString(),
            counter: 0,
            zipOutput: batchModeZipEnabled
        };
    } else {
        activeBatchSession = null;
    }

    translationSemaphore.limit = translationConcurrencyLevel;
    translationSemaphore.count = 0;
    translationSemaphore.queue = [];

    addProgressLog(`檔案並行: ${concurrencyLevel}, 翻譯並行: ${translationConcurrencyLevel}, 最大重試: ${MAX_RETRIES}, 跳過已處理: ${skipEnabled}`);
    updateConcurrentProgress(0);

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const pendingIndices = new Set();

    for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const fileIdentifier = `${file.name}_${file.size}`;
        if (skipEnabled && isAlreadyProcessed(fileIdentifier, processedFilesRecord)) {
            addProgressLog(`[${file.name}] 已處理過，跳過。`);
            skippedCount++;
            allResults[i] = { file: file, skipped: true };
        } else {
            pendingIndices.add(i);
        }
    }

    updateOverallProgress(successCount, skippedCount, errorCount, filesToProcess.length);

    /**
     * 非同步處理佇列，負責排程單個檔案的處理。
     * 它會根據設定的並行數 (`concurrencyLevel`) 來啟動 `processSinglePdf` 任務。
     * 內部維護一個待處理檔案索引集合 `pendingIndices` 和當前活動處理數 `activeProcessingCount`。
     * @async
     */
    const processQueue = async () => {
        while (pendingIndices.size > 0 || activeProcessingCount > 0) {
            while (pendingIndices.size > 0 && activeProcessingCount < concurrencyLevel) {
                const currentFileIndex = pendingIndices.values().next().value;
                pendingIndices.delete(currentFileIndex);

                const currentFile = filesToProcess[currentFileIndex];
                const fileIdentifier = `${currentFile.name}_${currentFile.size}`;
                const currentRetry = retryAttempts.get(fileIdentifier) || 0;

                activeProcessingCount++;
                updateConcurrentProgress(activeProcessingCount);

                const retryText = currentRetry > 0 ? ` (重試 ${currentRetry}/${MAX_RETRIES})` : '';
                addProgressLog(`--- [${successCount + skippedCount + errorCount + 1}/${filesToProcess.length}] 開始處理: ${currentFile.name}${retryText} ---`);

                // OCR Key 管理現在由 OcrManager 和各個介面卡內部處理，不再需要在這裡檢查

                let translationKeyObject = null;
                // 使用 currentTranslationModelForProvider 來決定是否需要翻譯以及獲取Key
                if (translationKeyProvider && currentTranslationModelForProvider && currentTranslationModelForProvider !== 'none') {
                    if (!translationKeyProvider.hasAvailableKeys()) {
                        const modelDisplayName = translationModelConfigForProcess?.displayName || currentTranslationModelForProvider;
                        addProgressLog(`[${currentFile.name}] 警告: ${modelDisplayName} 模型無可用Key，將跳過翻譯。`);
                    } else {
                        translationKeyObject = translationKeyProvider.getNextKey();
                        if (!translationKeyObject) {
                            const modelDisplayName = translationModelConfigForProcess?.displayName || currentTranslationModelForProvider;
                            addProgressLog(`[${currentFile.name}] 警告: ${modelDisplayName} Key Provider 返回 null Key。將跳過翻譯。`);
                        }
                    }
                }
                // 對於自定義模型，再次確認配置完整性 (translationModelConfigForProcess 應該已經包含所需資訊)
                if (
                    selectedTranslationModelName === 'custom' &&
                    (
                        !translationModelConfigForProcess ||
                        (!translationModelConfigForProcess.apiEndpoint && !translationModelConfigForProcess.apiBaseUrl) ||
                        !translationModelConfigForProcess.modelId
                    )
                ) {
                    addProgressLog(`[${currentFile.name}] 錯誤: 自定義翻譯模型 (${translationModelConfigForProcess?.displayName || '未知'}) 配置不完整，將跳過翻譯。`);
                    translationKeyObject = null; // 強制跳過翻譯
                }

                console.log('translationKeyProvider', translationKeyProvider);
                console.log('currentTranslationModelForProvider', currentTranslationModelForProvider);
                console.log('translationKeyProvider.hasAvailableKeys()', translationKeyProvider && translationKeyProvider.hasAvailableKeys());
                console.log('translationKeyProvider.availableKeys', translationKeyProvider && translationKeyProvider.availableKeys);
                console.log('handleProcessClick: translationKeyObject', translationKeyObject);

                let batchContextForFile = null;
                if (activeBatchSession) {
                    activeBatchSession.counter += 1;
                    batchContextForFile = {
                        id: activeBatchSession.id,
                        total: activeBatchSession.total,
                        template: activeBatchSession.template,
                        formats: activeBatchSession.formats,
                        outputLanguage: activeBatchSession.outputLanguage,
                        startedAt: activeBatchSession.startedAt,
                        order: currentFileIndex + 1,
                        originalIndex: currentFileIndex,
                        attempt: activeBatchSession.counter
                    };
                }

                processSinglePdf(
                    currentFile,
                    null, // mistralKeyObject - OCR Key 現在由 OcrManager 內部管理
                    translationKeyObject,
                    selectedTranslationModelName, // 'custom' or preset model name
                    translationModelConfigForProcess, // Specific site config or preset model config
                    maxTokensValue,
                    effectiveTargetLanguage,
                    acquireTranslationSlot,
                    releaseTranslationSlot,
                    defaultSystemPromptSetting,
                    defaultUserPromptTemplateSetting,
                    useCustomPromptsSetting,
                    batchContextForFile,
                    function onFileSuccess(fileObj) {
                        // ... (onFileSuccess logic)
                    }
                )
                    .then(async result => {
                        if (result && result.keyInvalid) {
                            const { type, keyIdToInvalidate, modelName: invalidModelNameFromCallback } = result.keyInvalid;
                            // OCR Key 失效由 OcrManager 內部處理，這裡只處理翻譯 Key 失效
                            if (type === 'mistral') {
                                addProgressLog(`[${currentFile.name}] Mistral OCR Key 失效，由 OCR Manager 處理。`);
                                // 不需要額外處理，OcrManager 會自動切換到下一個 Key
                            } else {
                                const affectedKeyProvider = translationKeyProvider;
                                // 使用 currentTranslationModelForProvider (如 custom_source_id) 或 invalidModelNameFromCallback
                                const modelNameToLog = (currentTranslationModelForProvider && currentTranslationModelForProvider.startsWith('custom_source_') ?
                                     (translationModelConfigForProcess?.displayName || currentTranslationModelForProvider) :
                                     (invalidModelNameFromCallback || selectedTranslationModelName));

                                if (affectedKeyProvider && keyIdToInvalidate) {
                                    addProgressLog(`[${currentFile.name}] 檢測到 ${modelNameToLog} API Key (ID: ${keyIdToInvalidate.slice(0,8)}...) 失效。`);
                                    await affectedKeyProvider.markKeyAsInvalid(keyIdToInvalidate);

                                    if (affectedKeyProvider.hasAvailableKeys()) {
                                        pendingIndices.add(currentFileIndex);
                                        addProgressLog(`[${currentFile.name}] 將使用下一個可用的 ${modelNameToLog} Key 重試檔案。`);
                                    } else {
                                        addProgressLog(`[${currentFile.name}] ${modelNameToLog} 模型已無可用Key，檔案處理失敗。`);
                                        allResults[currentFileIndex] = { file: currentFile, error: `${modelNameToLog} 模型已無可用Key` };
                                        errorCount++;
                                        retryAttempts.delete(fileIdentifier);
                                    }
                                } else {
                                    addProgressLog(`[${currentFile.name}] Key失效報告不完整，無法標記。檔案可能處理失敗。`);
                                    allResults[currentFileIndex] = { file: currentFile, error: result.error || 'Key失效報告不完整' };
                                    errorCount++;
                                    retryAttempts.delete(fileIdentifier);
                                }
                            }
                        } else if (result && !result.error) {
                            allResults[currentFileIndex] = result;
                            markFileAsProcessed(fileIdentifier, processedFilesRecord);
                            addProgressLog(`[${currentFile.name}] 處理成功！`);
                            successCount++;
                            retryAttempts.delete(fileIdentifier);

                            // 單檔案模式：更新 window.data
                            if (filesToProcess.length === 1 && result.markdown !== undefined) {
                                window.data = {
                                    name: currentFile.name,
                                    ocr: result.markdown || '',
                                    translation: result.translation || '',
                                    images: result.images || [],
                                    summaries: {}
                                };
                            }

                            // OCR Key 成功記錄現在由 OcrManager 內部處理
                            // 僅記錄翻譯 Key 的成功使用
                            // 當翻譯成功時，使用 currentTranslationModelForProvider 記錄Key
                            if (translationKeyObject && currentTranslationModelForProvider && currentTranslationModelForProvider !== 'none') {
                                recordLastSuccessfulKey(currentTranslationModelForProvider, translationKeyObject.id);
                            }

                        } else {
                            const errorMsg = result?.error || '未知錯誤';
                            const nextRetryCount = (retryAttempts.get(fileIdentifier) || 0) + 1;

                            if (nextRetryCount <= MAX_RETRIES) {
                                retryAttempts.set(fileIdentifier, nextRetryCount);
                                pendingIndices.add(currentFileIndex);
                                addProgressLog(`[${currentFile.name}] 處理失敗: ${errorMsg}. 稍後重試 (${nextRetryCount}/${MAX_RETRIES}).`);
                            } else {
                                addProgressLog(`[${currentFile.name}] 處理失敗: ${errorMsg}. 已達最大重試次數.`);
                                allResults[currentFileIndex] = result || { file: currentFile, error: errorMsg };
                                errorCount++;
                                retryAttempts.delete(fileIdentifier);
                            }
                        }
                    })
                    .catch(error => {
                        console.error(`處理檔案 ${currentFile.name} 時發生意外錯誤:`, error);
                        addProgressLog(`錯誤: 處理 ${currentFile.name} 失敗 - ${error.message}`);
                        allResults[currentFileIndex] = { file: currentFile, error: error.message };
                        errorCount++;
                        retryAttempts.delete(fileIdentifier);
                    })
                    .finally(() => {
                        activeProcessingCount--;
                        updateConcurrentProgress(activeProcessingCount);
                        updateOverallProgress(successCount, skippedCount, errorCount, filesToProcess.length);
                    });

                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (pendingIndices.size > 0 || activeProcessingCount > 0) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    };

    try {
        await processQueue();
    } catch (err) {
        console.error("處理佇列時發生嚴重錯誤:", err);
        addProgressLog(`嚴重錯誤: 處理佇列失敗 - ${err.message}`);
        const currentCompleted = successCount + skippedCount + errorCount;
        errorCount = filesToProcess.length - currentCompleted;
    } finally {
        addProgressLog('=== 批次處理完成 ===');
        updateOverallProgress(successCount, skippedCount, errorCount, filesToProcess.length);
        updateProgress('全部完成!', 100);
        updateConcurrentProgress(0);

        activeBatchSession = null;
        isProcessing = false;
        updateProcessButtonState(pdfFiles, isProcessing);
        showResultsSection(successCount, skippedCount, errorCount, filesToProcess.length);
        saveProcessedFilesRecord(processedFilesRecord);

        allResults = allResults.filter(r => r !== undefined && r !== null);
        console.log("Final results count:", allResults.length);
    }
}

// =====================
// 下載處理
// =====================
/**
 * 處理點選"下載全部結果"按鈕的事件。
 * 如果 `allResults` 陣列中有內容，則呼叫 `downloadAllResults` (來自 ui.js) 來打包並下載結果。
 */
function handleDownloadClick() {
    if (allResults.length > 0) {
        downloadAllResults(allResults);
    } else {
        showNotification('沒有可下載的結果', 'warning');
    }
}

// =====================
// 內建提示模板獲取
// =====================
/**
 * 根據指定的目標語言名稱，獲取內建的翻譯系統提示和使用者提示模板。
 * @param {string} languageName - 目標語言的名稱 (例如 'chinese', 'english', 'japanese', 或自定義語言名)。
 * @returns {{systemPrompt: string, userPromptTemplate: string}} 包含系統提示和使用者提示模板的物件。
 */
function getBuiltInPrompts(languageName) {
    const langLower = languageName.toLowerCase();
    let sys_prompt = '';
    let user_prompt_template = '';
    const sourceLang = 'English'; // Assume source is always English

    switch (langLower) {
        case 'chinese':
            sys_prompt = "你是一個專業的文件翻譯助手，擅長將文字精確翻譯為繁體中文，同時保留原始的 Markdown 格式。";
            user_prompt_template = `請將以下內容翻譯為 **繁體中文**。\n要求:\n\n1. 保持所有 Markdown 語法元素不變（如 # 標題、 *斜體*、 **粗體**、 [連結]()、 ![圖片]()、 \`\`\`程式碼塊\`\`\` 等）。\n2. 程式碼塊必須保持原樣，不要翻譯程式碼塊內的內容，保留程式碼塊的語言標記（如 \`\`\`python, \`\`\`javascript 等）。\n3. 學術/專業術語應準確翻譯。\n4. 保持原文的段落結構和格式。\n5. 僅輸出翻譯後的內容，不要包含任何額外的解釋或註釋。\n6. 對於行間公式，使用 $$...$$ 標記。\n\n請主動區分該內容是行間公式還是行內公式，使用準確的公式標記。輸出$$,$$$$的公式時候：前後需要帶空格或換行，公式內部不需要帶空格。\n\n文件內容:\n\n\${content}`;
            break;
        case 'japanese':
            sys_prompt = "あなたはプロの文書翻訳アシスタントで、テキストを正確に日本語に翻訳し、元の Markdown 形式を維持することに長けています。";
            user_prompt_template = `以下の內容を **日本語** に翻訳してください。\n要件:\n\n1. すべての Markdown 構文要素（例: # 見出し、 *イタリック*、 **太字**、 [リンク]()、 ![畫像]()、 \`\`\`コードブロック\`\`\` など）は変更しないでください。\n2. コードブロックはそのまま保持し、コードブロック內の內容は翻訳しないでください。言語指定（例: \`\`\`python, \`\`\`javascript など）も保持してください。\n3. 學術/専門用語は正確に翻訳してください。\n4. 元の段落構造と書式を維持してください。\n5. 翻訳された內容のみを出力し、餘分な説明や注釈は含めないでください。\n6. 表示數式には $$...$$ を使用してください。\n\n數式がディスプレイ數式（行間）かインライン數式かを必ず區別し、正しい數式記號を使用してください。$$や$$$$の數式を出力する際は、前後にスペースまたは改行を入れ、數式內部にはスペースを入れないでください。\n\nドキュメント內容:\n\n\${content}`;
            break;
        case 'korean':
            sys_prompt = "당신은 전문 문서 번역 도우미로, 텍스트를 정확하게 한국어로 번역하고 원본 마크다운 형식을 유지하는 데 능숙합니다.";
            user_prompt_template = `다음 내용을 **한국어** 로 번역해 주세요。\n요구 사항:\n\n1. 모든 마크다운 구문 요소(예: # 제목, *기울임꼴*, **굵게**, [링크](), ![이미지](), \`\`\`코드 블록\`\`\` 등)를 변경하지 마십시오.\n2. 코드 블록은 그대로 유지하고, 코드 블록 내의 내용은 번역하지 마십시오. 언어 지정(예: \`\`\`python, \`\`\`javascript 등)도 유지하십시오.\n3. 학술/전문 용어는 정확하게 번역하십시오.\n4. 원본 단락 구조와 서식을 유지하십시오.\n5. 번역된 내용만 출력하고 추가 설명이나 주석을 포함하지 마십시오.\n6. 수식 표시는 $$...$$ 를 사용하십시오。\n\n수식이 디스플레이 수식(행간)인지 인라인 수식인지 반드시 구분하고, 정확한 수식 표기법을 사용하세요. $$, $$$$ 수식을 출력할 때는 앞뒤에 공백 또는 줄바꿈을 넣고, 수식 내부에는 공백을 넣지 마세요.\n\n문서 내용:\n\n\${content}`;
            break;
        case 'french':
            sys_prompt = "Vous êtes un assistant de traduction de documents professionnel, compétent pour traduire avec précision le texte en français tout en préservant le format Markdown d'origine.";
            user_prompt_template = `Veuillez traduire le contenu suivant en **Français**。\nExigences:\n\n1. Conserver tous les éléments de syntaxe Markdown inchangés (par exemple, # titres, *italique*, **gras**, [liens](), ![images](), \`\`\`blocs de code\`\`\`).\n2. Les blocs de code doivent rester intacts, ne traduisez pas le contenu à l'intérieur des blocs de code. Conservez les spécifications de langage (par exemple, \`\`\`python, \`\`\`javascript, etc.).\n3. Traduire avec précision les termes académiques/professionnels.\n4. Maintenir la structure et le formatage des paragraphes d'origine.\n5. Produire uniquement le contenu traduit, sans explications ni annotations supplémentaires.\n6. Pour les formules mathématiques, utiliser \\$\$...\$\$.\n\nVeuillez distinguer explicitement entre les formules en ligne et les formules en display, et utilisez la notation appropriée. Lors de la sortie des formules $$ ou $$$$, ajoutez un espace ou un saut de ligne avant et après, sans espace à l'intérieur de la formule.\n\nContenu du document:\n\n\${content}`;
            break;
        case 'english':
            sys_prompt = "You are a professional document translation assistant, skilled at accurately translating text into English while preserving the original document format.";
            user_prompt_template = `Please translate the following content into **English**.\n Requirements:\n\n 1. Keep all Markdown syntax elements unchanged (e.g., #headings, *italics*, **bold**, [links](), ![images](), \`\`\`code blocks\`\`\`).\n 2. Code blocks must remain intact. Do not translate the content inside code blocks. Preserve language specifications (e.g., \`\`\`python, \`\`\`javascript, etc.).\n 3. Translate academic/professional terms accurately. Maintain a formal, academic tone.\n 4. Maintain the original paragraph structure and formatting.\n 5. Output only the translated content.\n 6. For display math formulas, use:\n \\$\$\n ...\n \\$\$\n\nPlease explicitly distinguish between display (block) and inline formulas, and use the correct formula markers. When outputting formulas with $$ or $$$$, add a space or line break before and after, and do not add spaces inside the formula.\n\n Document Content:\n\n \${content}`;
            break;
        default: // Fallback for custom languages or other cases
            const targetLangDisplayName = languageName; // Use the passed name directly
            sys_prompt = `You are a professional document translation assistant, skilled at accurately translating content into ${targetLangDisplayName} while preserving the original document format.`;
            user_prompt_template = `Please translate the following content into **${targetLangDisplayName}**. \nRequirements:\n\n1. Keep all Markdown syntax elements unchanged (e.g., #headings, *italics*, **bold**, [links](), ![images](), \`\`\`code blocks\`\`\`).\n2. Code blocks must remain intact. Do not translate the content inside code blocks. Preserve language specifications (e.g., \`\`\`python, \`\`\`javascript, etc.).\n3. Translate academic/professional terms accurately. If necessary, keep the original term in parentheses if unsure about the translation in ${targetLangDisplayName}.\n4. Maintain the original paragraph structure and formatting.\n5. Translate only the content; do not add extra explanations.\n6. For display math formulas, use:\n\$\$\n...\n\$\$\n\nPlease explicitly distinguish between display (block) and inline formulas, and use the correct formula markers. When outputting formulas with $$ or $$$$, add a space or line break before and after, and do not add spaces inside the formula.\n\nDocument Content:\n\n\${content}`;
            break;
    } // End of switch
    //console.log('getBuiltInPrompts 返回:', {systemPrompt: sys_prompt, userPromptTemplate: user_prompt_template});
    return { systemPrompt: sys_prompt, userPromptTemplate: user_prompt_template };
} // End of getBuiltInPrompts function

// =====================
// 提示區內容與狀態聯動
// =====================
// updatePromptTextareasContent函式已移除，因為新的提示詞系統透過promptPoolUI處理

// =====================
// 其他協調邏輯
// =====================
// ...（如有其他 app.js 級別的協調邏輯，可在此補充）...

/**
 * 更新本地儲存中指定模型最後成功使用的Key ID。
 * @param {string} modelName - 模型名稱 (例如 'mistral', 'gemini', 或 'custom_source_xxx')。
 * @param {string} keyId - 成功使用的 API Key 的 ID。
 */
function recordLastSuccessfulKey(modelName, keyId) {
    if (!modelName || !keyId) return;
    try {
        let records = JSON.parse(localStorage.getItem(LAST_SUCCESSFUL_KEYS_LS_KEY) || '{}');
        records[modelName] = keyId;
        localStorage.setItem(LAST_SUCCESSFUL_KEYS_LS_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('Failed to record last successful key:', e);
    }
}

/**
 * 獲取本地儲存中指定模型最後成功使用的Key ID。
 * @param {string} modelName - 模型名稱。
 * @returns {string | null} 儲存的 Key ID，如果未找到則返回 null。
 */
function getLastSuccessfulKeyId(modelName) {
    if (!modelName) return null;
    try {
        const records = JSON.parse(localStorage.getItem(LAST_SUCCESSFUL_KEYS_LS_KEY) || '{}');
        return records[modelName] || null;
    } catch (e) {
        console.error('Failed to get last successful key ID:', e);
        return null;
    }
}
