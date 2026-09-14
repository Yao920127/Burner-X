/**
 * @file js/storage.js
 * @description
 * 此檔案負責管理應用程式中所有與瀏覽器本地儲存相關的功能，
 * 包括 localStorage 和 IndexedDB。它提供了統一的介面來儲存和載入使用者設定、
 * API 金鑰、已處理檔案記錄、模型配置以及其他需要持久化的資料。
 *
 * 主要功能包括：
 * - **常量定義**: 定義用於 localStorage 和 IndexedDB 儲存鍵的常量。
 * - **已處理檔案記錄**: 管理已上傳並處理過的檔案記錄，避免重複處理。
 * - **通用設定**: 儲存和載入應用的全域設定，如預設處理選項等。
 * - **IndexedDB 資料庫操作**:
 *   - 開啟和初始化名為 `ResultDB` 的 IndexedDB 資料庫，其中包含 `results` 物件儲存區。
 *   - 將PDF處理結果（包括後設資料、提取的文字、翻譯、摘要等）儲存到 IndexedDB。
 *   - 從 IndexedDB 檢索、刪除或清空處理結果。
 * - **UUID 生成**: 提供生成唯一識別符號的功能，主要用於 IndexedDB 中的記錄ID。
 * - **模型配置**: (部分可能為舊版) 儲存和載入與特定翻譯模型相關的配置，例如自定義模型的 Base URL。
 * - **API 金鑰管理**: 安全地儲存和載入使用者為不同翻譯服務或自定義模型配置的 API 金鑰。
 *   支援多模型/多源站點的金鑰管理，幷包含對舊版單一金鑰格式的相容和遷移邏輯。
 * - **舊配置遷移**: 實現將舊版本儲存的自定義模型配置遷移到新版多源站點結構的功能。
 * - **自定義源站點配置**: 管理使用者新增的自定義 API 源站點及其相關配置（如名稱、Base URL、API Key、預設模型等）。
 */

// =====================
// 常量定義
// =====================

/**
 * @const {string} SETTINGS_KEY
 * @description 用於在 localStorage 中儲存通用設定的鍵名。
 */
const SETTINGS_KEY = 'userSettings';

/**
 * @const {string} PROCESSED_FILES_KEY
 * @description 用於在 localStorage 中儲存已處理檔案記錄的鍵名。
 */
const PROCESSED_FILES_KEY = 'processedFilesRecord';

/**
 * @const {string} API_KEYS_STORAGE_KEY
 * @description 用於在 localStorage 中儲存（新版）多模型/多源站 API 金鑰列表的鍵名。
 * @deprecated 請使用 `MODEL_KEYS_STORAGE_KEY`。此常量可能指向舊的金鑰儲存方式或已被取代。
 */
const API_KEYS_STORAGE_KEY = 'apiKeys'; // 舊的或特定用途的, 新的統一用 modelKeys

/**
 * @const {string} CUSTOM_MODELS_KEY
 * @description 用於在 localStorage 中儲存自定義模型列表的鍵名 (可能指舊版可用模型列表)。
 */
const CUSTOM_MODELS_KEY = 'customModels'; // 儲存自定義模型列表

/**
 * @const {string} LEGACY_CUSTOM_CONFIG_KEY
 * @description 用於在 localStorage 中儲存舊版單一自定義模型配置的鍵名。
 * 這個配置通常包含一個自定義模型的 Base URL 和 API Key。
 */
const LEGACY_CUSTOM_CONFIG_KEY = 'custom_model_config'; // 舊的自定義配置key

/**
 * @const {string} MODEL_KEYS_STORAGE_KEY
 * @description 用於在 localStorage 中儲存（新版）與多個模型或源站點關聯的 API 金鑰及配置列表的鍵名。
 * 這個鍵名代表了當前推薦的儲存 API Keys 和相關源站資訊的方式。
 */
const MODEL_KEYS_STORAGE_KEY = 'modelKeys'; // 新的儲存key，用於多站點
/**
 * @const {string} GLOSSARY_KEY
 * @description 翻譯備擇庫（術語庫）儲存鍵名。
 */
const GLOSSARY_KEY = 'translationGlossary';
/**
 * @const {string} GLOSSARY_SETS_KEY
 * @description 多術語庫集合鍵名：{ [id]: { id, name, enabled, entries: [...] } }
 */
const GLOSSARY_SETS_KEY = 'translationGlossarySets';

/**
 * @const {string} DB_NAME
 * @description IndexedDB 資料庫的名稱。
 */
const DB_NAME = 'ResultDB';
/**
 * @const {string} DB_STORE_NAME
 * @description IndexedDB 中用於儲存處理結果的物件儲存區的名稱。
 */
const DB_STORE_NAME = 'results';
/**
 * @const {string} ANNOTATIONS_STORE_NAME
 * @description IndexedDB 中用於儲存醒目提示和批註的物件儲存區的名稱。
 */
const ANNOTATIONS_STORE_NAME = 'annotations';
/**
 * @const {number} DB_VERSION
 * @description IndexedDB 資料庫的版本號。更改此版本號會觸發 `onupgradeneeded` 事件。
 */
const DB_VERSION = 3;
/**
 * @const {string} SEMANTIC_GROUPS_STORE_NAME
 * @description IndexedDB 中用於儲存意群資料的物件儲存區名稱。
 */
const SEMANTIC_GROUPS_STORE_NAME = 'semantic_groups';

// =====================
// 本地儲存相關工具函式
// =====================

// 匯入依賴 (如果需要，例如 showNotification)
// import { showNotification } from './ui.js';

const MODEL_CONFIGS_KEY = 'translationModelConfigs';
const MODEL_KEYS_KEY = 'translationModelKeys';
const CUSTOM_SOURCE_SITES_KEY = 'paperBurnerCustomSourceSites'; // 新增：自定義源站列表的 Key
const LAST_SUCCESSFUL_KEYS_LS_KEY_STORAGE_REF = 'paperBurnerLastSuccessfulKeys'; // 新增：用於遷移和刪除時參考

// ---------------------
// API Key 儲存與管理
// ---------------------
/**
 * 更新 localStorage 中的 API Key
 * @param {string} keyName - 儲存鍵名（如 'mistralApiKeys'）
 * @param {string} value - 金鑰內容
 * @param {boolean} shouldRemember - 是否記住
 */
function updateApiKeyStorage(keyName, value, shouldRemember) {
    // keyName 應該是 'mistralApiKeys' 或 'translationApiKeys'
    if (shouldRemember) {
        localStorage.setItem(keyName, value);
    } else {
        localStorage.removeItem(keyName);
    }
}

// ---------------------
// 已處理檔案記錄
// ---------------------
/**
 * 載入已處理檔案記錄（防止重複處理）
 * @returns {Object} 檔案標識到 true 的對映
 */
function loadProcessedFilesRecord() {
    let record = {};
    try {
        const storedRecord = localStorage.getItem(PROCESSED_FILES_KEY);
        if (storedRecord) {
            record = JSON.parse(storedRecord);
            console.log("Loaded processed files record:", record);
        }
    } catch (e) {
        console.error("Failed to load processed files record from localStorage:", e);
        record = {}; // 重置為空物件
    }
    return record; // 返回載入的記錄
}

/**
 * 儲存已處理檔案記錄到 localStorage
 * @param {Object} processedFilesRecord - 檔案標識到 true 的對映
 */
function saveProcessedFilesRecord(processedFilesRecord) {
    try {
        localStorage.setItem(PROCESSED_FILES_KEY, JSON.stringify(processedFilesRecord));
        console.log("Saved processed files record.");
    } catch (e) {
        console.error("Failed to save processed files record to localStorage:", e);
        // showNotification("無法儲存已處理檔案記錄到瀏覽器快取", "error"); // 避免迴圈依賴
    }
}

/**
 * 判斷檔案是否已處理
 * @param {string} fileIdentifier - 檔案唯一標識
 * @param {Object} processedFilesRecord - 已處理記錄
 * @returns {boolean}
 */
function isAlreadyProcessed(fileIdentifier, processedFilesRecord) {
    return processedFilesRecord.hasOwnProperty(fileIdentifier) && processedFilesRecord[fileIdentifier] === true;
}

/**
 * 標記檔案為已處理
 * @param {string} fileIdentifier - 檔案唯一標識
 * @param {Object} processedFilesRecord - 已處理記錄
 */
function markFileAsProcessed(fileIdentifier, processedFilesRecord) {
    processedFilesRecord[fileIdentifier] = true;
    // 注意：儲存操作通常在批處理結束時進行，而不是每次標記時
}

// ---------------------
// 通用設定項儲存
// ---------------------
/**
 * 儲存設定項到 localStorage
 * @param {Object} settingsData - 設定物件
 */
function saveSettings(settingsData) {
    // settingsData 應該是一個包含所有要儲存設定的物件
    // 例如: { maxTokensPerChunk: ..., skipProcessedFiles: ..., ... }
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsData));
        //console.log("Settings saved:", settingsData);
    } catch (e) {
        console.error('儲存設定失敗:', e);
        // showNotification('無法儲存設定到瀏覽器快取', 'error'); // 避免迴圈依賴
    }
}

/**
 * 載入設定項（帶預設值）
 * @returns {Object} 設定物件
 */
function loadSettings() {
    let settings = {
        // 提供預設值
        maxTokensPerChunk: '2000',
        skipProcessedFiles: false,
        selectedTranslationModel: 'none',
        concurrencyLevel: '1',
        translationConcurrencyLevel: '15',
        targetLanguage: 'chinese',
        customTargetLanguageName: '',
        customModelSettings: {
            apiEndpoint: '',
            modelId: '',
            requestFormat: 'openai',
            temperature: 0.5,
            max_tokens: 8000
        },
        defaultSystemPrompt: '',
        defaultUserPromptTemplate: '',
        useCustomPrompts: false,
        enableGlossary: false,
        batchModeEnabled: false,
        batchModeTemplate: '{original_name}_{output_language}_{processing_time:YYYYMMDD-HHmmss}.{original_type}',
        batchModeFormats: ['original', 'markdown'],
        batchModeZipEnabled: false
    };
    try {
        const storedSettings = localStorage.getItem(SETTINGS_KEY);
        if (storedSettings) {
            const loaded = JSON.parse(storedSettings);
            // 合併載入的設定與預設值，確保所有鍵都存在
            settings = { ...settings, ...loaded };
            // 確保 customModelSettings 也是合併的
            if (loaded.customModelSettings) {
                settings.customModelSettings = { ...settings.customModelSettings, ...loaded.customModelSettings };
            }
            //console.log("Settings loaded:", settings);

            // 如果啟用了自定義模型檢測器，嘗試載入可用模型
            if (typeof initModelDetectorUI === 'function') {
                setTimeout(() => {
                    loadAvailableModels();
                }, 0);
            }
        } else {
             console.log("No settings found in localStorage, using defaults.");
        }
    } catch (e) {
        console.error('載入設定失敗，使用預設值:', e);
        // settings 保持為預設值
    }
    return settings; // 返回載入或預設的設定物件
}

/**
 * 載入可用模型列表
 */
function loadAvailableModels() {
    try {
        // 這裡我們只是觸發檢查和UI更新，不實際載入模型
        // 實際載入和UI更新由modelDetector模組負責
        if (typeof window.modelDetector !== 'undefined') {
            const customModelId = document.getElementById('customModelId');
            const customModelIdInput = document.getElementById('customModelIdInput');

            // 嘗試載入儲存的模型列表，如果有
            const savedModels = localStorage.getItem('availableCustomModels');
            if (savedModels) {
                const lastSelectedModel = localStorage.getItem('lastSelectedCustomModel');

                // 如果有lastSelectedModel，設定輸入欄位的值
                if (lastSelectedModel && customModelIdInput) {
                    customModelIdInput.value = lastSelectedModel;
                }
            }
        }
    } catch (e) {
        console.error('載入可用模型列表失敗:', e);
    }
}

// --- IndexedDB 歷史記錄儲存 ---

function openDB() {
    return new Promise(function(resolve, reject) {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
                db.createObjectStore(DB_STORE_NAME, { keyPath: 'id' });
            }
            // 新增：建立 annotations 物件儲存區
            if (!db.objectStoreNames.contains(ANNOTATIONS_STORE_NAME)) {
                const annotationsStore = db.createObjectStore(ANNOTATIONS_STORE_NAME, { keyPath: 'id' });
                annotationsStore.createIndex('docId', 'docId', { unique: false });
            }
            // 新增：建立 semantic_groups 物件儲存區（按 docId 存取）
            if (!db.objectStoreNames.contains(SEMANTIC_GROUPS_STORE_NAME)) {
                db.createObjectStore(SEMANTIC_GROUPS_STORE_NAME, { keyPath: 'docId' });
            }
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

async function saveResultToDB(resultObj) {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(DB_STORE_NAME, 'readwrite');
        tx.objectStore(DB_STORE_NAME).put(resultObj);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
    });
}

async function getAllResultsFromDB() {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(DB_STORE_NAME, 'readonly');
        const store = tx.objectStore(DB_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

async function getResultFromDB(id) {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(DB_STORE_NAME, 'readonly');
        const store = tx.objectStore(DB_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

async function deleteResultFromDB(id) {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(DB_STORE_NAME, 'readwrite');
        tx.objectStore(DB_STORE_NAME).delete(id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
    });
}

async function clearAllResultsFromDB() {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(DB_STORE_NAME, 'readwrite');
        tx.objectStore(DB_STORE_NAME).clear();
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
    });
}

// ========== 新增：多模型配置與Key存取 ==========

// --------- 新增：意群資料持久化（IndexedDB） ---------
/**
 * 將意群資料儲存到 IndexedDB。
 * @param {string} docId 文件唯一ID。
 * @param {Array<Object>} groups 意群陣列。
 * @param {Object} [extra] 額外資訊，例如版本、來源等。
 */
async function saveSemanticGroupsToDB(docId, groups, extra = {}) {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        try {
            const tx = db.transaction(SEMANTIC_GROUPS_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SEMANTIC_GROUPS_STORE_NAME);
            store.put({ docId, groups, updatedAt: Date.now(), ...extra });
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error); };
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * 從 IndexedDB 載入意群資料。
 * @param {string} docId 文件唯一ID。
 * @returns {Promise<{docId: string, groups: Array<Object>, updatedAt: number} | undefined>}
 */
async function loadSemanticGroupsFromDB(docId) {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        try {
            const tx = db.transaction(SEMANTIC_GROUPS_STORE_NAME, 'readonly');
            const store = tx.objectStore(SEMANTIC_GROUPS_STORE_NAME);
            const req = store.get(docId);
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * 刪除指定文件的意群資料。
 * @param {string} docId 文件唯一ID。
 */
async function deleteSemanticGroupsFromDB(docId) {
    const db = await openDB();
    return new Promise(function(resolve, reject) {
        try {
            const tx = db.transaction(SEMANTIC_GROUPS_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SEMANTIC_GROUPS_STORE_NAME);
            store.delete(docId);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error); };
        } catch (e) {
            reject(e);
        }
    });
}

// 暴露到全域（頁面透過 <script> 引入非模組腳本時，確保可從 window 訪問）
try {
    window.saveSemanticGroupsToDB = saveSemanticGroupsToDB;
    window.loadSemanticGroupsFromDB = loadSemanticGroupsFromDB;
    window.deleteSemanticGroupsFromDB = deleteSemanticGroupsFromDB;
} catch (e) {
    // 忽略：某些環境下 window 可能不可用（例如測試）
}

/**
 * 生成一個簡單的 UUID
 * @returns {string}
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 儲存某個模型的配置
 * @param {string} model
 * @param {Object} config
 */
function saveModelConfig(model, config) {
    let allConfigs = {};
    try {
        const raw = localStorage.getItem(MODEL_CONFIGS_KEY);
        if (raw) allConfigs = JSON.parse(raw);
    } catch {}
    allConfigs[model] = config;
    localStorage.setItem(MODEL_CONFIGS_KEY, JSON.stringify(allConfigs));
}

// ========== 新增：翻譯備擇庫（術語庫）存取 ==========

/**
 * 載入翻譯備擇庫條目列表。
 * @returns {Array<Object>} 條目陣列：[{ id, term, translation, caseSensitive, wholeWord, enabled }]
 */
function loadGlossaryEntries() {
    try {
        // 優先從多術語庫集合載入所有已啟用的條目
        const sets = loadGlossarySets();
        const setIds = Object.keys(sets || {});
        if (setIds.length > 0) {
            const out = [];
            setIds.forEach(id => {
                const s = sets[id];
                if (s && s.enabled && Array.isArray(s.entries)) {
                    s.entries.forEach(item => {
                        out.push({
                            id: item.id || generateUUID(),
                            term: String(item.term || '').trim(),
                            translation: String(item.translation || '').trim(),
                            caseSensitive: !!item.caseSensitive,
                            wholeWord: !!item.wholeWord,
                            enabled: item.enabled === undefined ? true : !!item.enabled
                        });
                    });
                }
            });
            return out;
        }
        // 相容舊版單庫
        const raw = localStorage.getItem(GLOSSARY_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        return list.filter(Boolean).map(item => ({
            id: item.id || generateUUID(),
            term: String(item.term || '').trim(),
            translation: String(item.translation || '').trim(),
            caseSensitive: !!item.caseSensitive,
            wholeWord: !!item.wholeWord,
            enabled: item.enabled === undefined ? true : !!item.enabled
        }));
    } catch (e) {
        console.error('Failed to load glossary entries:', e);
        return [];
    }
}

/**
 * 儲存翻譯備擇庫條目列表。
 * @param {Array<Object>} entries - 條目陣列
 */
function saveGlossaryEntries(entries) {
    try {
        const list = Array.isArray(entries) ? entries : [];
        localStorage.setItem(GLOSSARY_KEY, JSON.stringify(list));
    } catch (e) {
        console.error('Failed to save glossary:', e);
    }
}

/**
 * 匯出術語庫為 JSON 字串。
 * @returns {string}
 */
function exportGlossary() {
    try {
        const list = loadGlossaryEntries();
        return JSON.stringify(list, null, 2);
    } catch (e) {
        console.error('Failed to export glossary:', e);
        return '[]';
    }
}

/**
 * 從 JSON 文字匯入術語庫，返回匯入後的陣列。
 * @param {string} jsonText
 * @returns {Array<Object>}
 */
function importGlossary(jsonText) {
    try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) throw new Error('格式錯誤：應為陣列');
        const normalized = parsed.filter(Boolean).map((item, idx) => ({
            id: item.id || generateUUID(),
            term: String(item.term || '').trim(),
            translation: String(item.translation || '').trim(),
            caseSensitive: !!item.caseSensitive,
            wholeWord: !!item.wholeWord,
            enabled: item.enabled === undefined ? true : !!item.enabled
        })).filter(it => it.term && it.translation);
        saveGlossaryEntries(normalized);
        return normalized;
    } catch (e) {
        console.error('Failed to import glossary:', e);
        throw e;
    }
}

// ==== 多術語庫集合 API ====
// 注意：這些是相容性包裝函式，實際使用 IndexedDB 儲存
// 需要配合 glossary-storage.js 使用

/**
 * 載入所有術語庫集合（同步介面 - 優先使用快取）
 * 推薦使用 loadGlossarySetsAsync
 */
function loadGlossarySets() {
    // 嘗試從快取載入
    if (window._glossarySetsCache) {
        return window._glossarySetsCache;
    }

    // 觸發非同步載入並快取結果
    if (typeof window.glossaryStorage !== 'undefined') {
        loadGlossarySetsAsync()
            .then(sets => {
                window._glossarySetsCache = sets;
                // 觸發事件通知 UI 更新
                window.dispatchEvent(new CustomEvent('glossarySetsLoaded', { detail: sets }));
            })
            .catch(err => console.error('Failed to load glossary sets:', err));
    }

    // 返回空物件或快取
    return window._glossarySetsCache || {};
}

/**
 * 載入所有術語庫集合（推薦使用的非同步版本）
 */
async function loadGlossarySetsAsync() {
    try {
        if (typeof window.glossaryStorage === 'undefined') {
            console.error('glossary-storage.js not loaded');
            return {};
        }

        // 首先嚐試遷移舊資料
        await window.glossaryStorage.migrateFromLocalStorage();

        // 從 IndexedDB/後端載入
        return await window.glossaryStorage.loadGlossarySetsUnified();
    } catch (e) {
        console.error('Failed to load glossary sets:', e);
        return {};
    }
}

/**
 * 儲存術語庫集合（非同步版本）
 * @param {Object} sets - 術語庫集合物件
 * @param {Function} onProgress - 可選的進度回撥函式 (current, total, setId) => void
 */
async function saveGlossarySetsAsync(sets, onProgress) {
    try {
        if (typeof window.glossaryStorage === 'undefined') {
            console.error('glossary-storage.js not loaded');
            throw new Error('Storage module not available');
        }

        const setIds = Object.keys(sets);
        const totalSets = setIds.length;

        // 批次儲存所有集合
        for (let i = 0; i < totalSets; i++) {
            const setId = setIds[i];
            const set = sets[setId];
            const entries = Array.isArray(set.entries) ? set.entries : [];

            // 從集合中分離 entries
            const setMeta = { ...set };
            delete setMeta.entries;

            // 儲存單個集合，傳遞進度回撥
            await window.glossaryStorage.saveGlossarySetUnified(setMeta, entries, (current, total) => {
                if (onProgress) {
                    // 報告當前集合的進度
                    onProgress(current, total, setId, i + 1, totalSets);
                }
            });
        }

        console.log('Glossary sets saved successfully');
    } catch (e) {
        console.error('Failed to save glossary sets:', e);
        throw e;
    }
}

/**
 * 儲存術語庫集合（同步相容介面）
 */
function saveGlossarySets(sets) {
    // 立即更新快取
    window._glossarySetsCache = sets;

    // 非同步儲存到 IndexedDB
    if (typeof window.glossaryStorage !== 'undefined') {
        saveGlossarySetsAsync(sets)
            .then(() => {
                console.log('Glossary sets saved successfully');
                // 觸發儲存完成事件
                window.dispatchEvent(new CustomEvent('glossarySetsSaved', { detail: sets }));
            })
            .catch(err => {
                console.error('Failed to save glossary sets:', err);
                if (typeof showNotification === 'function') {
                    showNotification('儲存術語庫失敗: ' + err.message, 'error');
                }
            });
    } else {
        console.error('glossary-storage.js not loaded, cannot save');
        if (typeof showNotification === 'function') {
            showNotification('術語庫儲存模組未載入', 'error');
        }
    }
}

// 建立術語庫集合（非同步版本）
async function createGlossarySetAsync(name) {
    const id = generateUUID();
    const newSet = { id, name: name || ('術語庫-' + id.slice(0,8)), enabled: true };

    // 儲存到 IndexedDB
    await window.glossaryStorage.saveGlossarySetUnified(newSet, []);

    // 更新快取
    if (!window._glossarySetsCache) window._glossarySetsCache = {};
    window._glossarySetsCache[id] = { ...newSet, entries: [] };

    return window._glossarySetsCache[id];
}

function createGlossarySet(name) {
    const id = generateUUID();
    const newSet = { id, name: name || ('術語庫-' + id.slice(0,8)), enabled: true, entries: [] };

    // 立即更新快取
    if (!window._glossarySetsCache) window._glossarySetsCache = {};
    window._glossarySetsCache[id] = newSet;

    // 非同步儲存
    createGlossarySetAsync(name)
        .then(set => {
            console.log('Glossary set created:', set.id);
        })
        .catch(err => console.error('Failed to create glossary set:', err));

    return newSet;
}

// 刪除術語庫集合（非同步版本）
async function deleteGlossarySetAsync(id) {
    await window.glossaryStorage.deleteGlossarySetUnified(id);

    // 從快取中刪除
    if (window._glossarySetsCache && window._glossarySetsCache[id]) {
        delete window._glossarySetsCache[id];
    }
}

function deleteGlossarySet(id) {
    // 立即從快取中刪除
    if (window._glossarySetsCache && window._glossarySetsCache[id]) {
        delete window._glossarySetsCache[id];
    }

    // 非同步刪除
    deleteGlossarySetAsync(id)
        .then(() => {
            console.log('Glossary set deleted:', id);
        })
        .catch(err => console.error('Failed to delete glossary set:', err));
}

// 重新命名術語庫（非同步版本）
async function renameGlossarySetAsync(id, newName) {
    if (!window._glossarySetsCache || !window._glossarySetsCache[id]) return;

    const sets = window._glossarySetsCache;
    sets[id].name = String(newName || '').trim() || sets[id].name;

    const entries = sets[id].entries || [];
    await window.glossaryStorage.saveGlossarySetUnified(sets[id], entries);
}

function renameGlossarySet(id, newName) {
    // 立即更新快取
    if (window._glossarySetsCache && window._glossarySetsCache[id]) {
        window._glossarySetsCache[id].name = String(newName || '').trim() || window._glossarySetsCache[id].name;
    }

    // 非同步儲存
    renameGlossarySetAsync(id, newName)
        .then(() => {
            console.log('Glossary set renamed:', id);
        })
        .catch(err => console.error('Failed to rename glossary set:', err));
}

// 切換術語庫啟用狀態（非同步版本）
async function toggleGlossarySetAsync(id, enabled) {
    if (!window._glossarySetsCache || !window._glossarySetsCache[id]) return;

    const sets = window._glossarySetsCache;
    sets[id].enabled = !!enabled;

    const entries = sets[id].entries || [];
    await window.glossaryStorage.saveGlossarySetUnified(sets[id], entries);
}

function toggleGlossarySet(id, enabled) {
    // 立即更新快取
    if (window._glossarySetsCache && window._glossarySetsCache[id]) {
        window._glossarySetsCache[id].enabled = !!enabled;
    }

    // 非同步儲存
    toggleGlossarySetAsync(id, enabled)
        .then(() => {
            console.log('Glossary set toggled:', id, enabled);
        })
        .catch(err => console.error('Failed to toggle glossary set:', err));
}

// 更新術語庫條目（非同步版本）
async function updateGlossarySetEntriesAsync(id, entries, onProgress) {
    if (!window._glossarySetsCache || !window._glossarySetsCache[id]) return;

    const sets = window._glossarySetsCache;
    sets[id].entries = Array.isArray(entries) ? entries : [];

    await window.glossaryStorage.saveGlossarySetUnified(sets[id], entries, onProgress);
}

/**
 * 儲存單個術語庫（非同步版本）
 * @param {string} setId - 術語庫 ID
 * @param {string} name - 術語庫名稱
 * @param {boolean} enabled - 是否啟用
 * @param {Array} entries - 術語條目陣列
 * @param {Function} onProgress - 進度回撥函式
 */
async function saveGlossarySetAsync(setId, name, enabled, entries, onProgress) {
    if (!window.glossaryStorage) {
        throw new Error('glossary-storage.js not loaded');
    }

    const setMeta = {
        id: setId,
        name: String(name || '').trim(),
        enabled: !!enabled
    };

    const normalizedEntries = Array.isArray(entries) ? entries : [];

    // 儲存到 IndexedDB/後端
    await window.glossaryStorage.saveGlossarySetUnified(setMeta, normalizedEntries, onProgress);

    // 更新快取
    if (!window._glossarySetsCache) window._glossarySetsCache = {};
    window._glossarySetsCache[setId] = { ...setMeta, entries: normalizedEntries };
}

function updateGlossarySetEntries(id, entries) {
    // 立即更新快取
    if (window._glossarySetsCache && window._glossarySetsCache[id]) {
        window._glossarySetsCache[id].entries = Array.isArray(entries) ? entries : [];
    }

    // 非同步儲存
    updateGlossarySetEntriesAsync(id, entries)
        .then(() => {
            console.log('Glossary entries updated:', id);
        })
        .catch(err => console.error('Failed to update glossary entries:', err));
}

// 匯出術語庫（非同步版本）
async function exportGlossarySetAsync(id) {
    const sets = await loadGlossarySetsAsync();
    const s = sets[id];
    if (!s) return '{}';

    // 載入條目
    const entries = await window.glossaryStorage.loadEntriesForSetUnified(id);
    return JSON.stringify({ ...s, entries }, null, 2);
}

function exportGlossarySet(id) {
    // 返回空字串，實際使用非同步版本
    exportGlossarySetAsync(id)
        .then(data => {
            window.dispatchEvent(new CustomEvent('glossarySetExported', { detail: { id, data } }));
        })
        .catch(err => console.error('Failed to export glossary set:', err));
    return '{}';
}

// 匯入術語庫（非同步版本，支援進度回撥）
async function importGlossarySetAsync(jsonText, onProgress) {
    const obj = JSON.parse(jsonText);
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.entries)) {
        throw new Error('檔案不是有效的術語庫');
    }

    const id = generateUUID();
    const newSet = {
        id,
        name: String(obj.name || ('匯入庫-' + id.slice(0,8))),
        enabled: obj.enabled === undefined ? true : !!obj.enabled
    };

    const entries = obj.entries.filter(Boolean).map(item => ({
        id: item.id || generateUUID(),
        term: String(item.term || '').trim(),
        translation: String(item.translation || '').trim(),
        caseSensitive: !!item.caseSensitive,
        wholeWord: !!item.wholeWord,
        enabled: item.enabled === undefined ? true : !!item.enabled
    }));

    // 使用帶進度的儲存函式
    await window.glossaryStorage.saveGlossarySetUnified(newSet, entries, onProgress);

    // 更新快取
    if (!window._glossarySetsCache) window._glossarySetsCache = {};
    window._glossarySetsCache[id] = { ...newSet, entries };

    return { ...newSet, entries };
}

function importGlossarySet(jsonText) {
    importGlossarySetAsync(jsonText)
        .then(set => {
            window.dispatchEvent(new CustomEvent('glossarySetImported', { detail: set }));
        })
        .catch(err => {
            console.error('Failed to import glossary set:', err);
            throw err;
        });
    return { id: generateUUID(), name: '匯入中...', enabled: true, entries: [] };
}

// 匯出所有術語庫（非同步版本）
async function exportAllGlossarySetsAsync() {
    const sets = await loadGlossarySetsAsync();

    // 載入所有條目
    for (const setId in sets) {
        const entries = await window.glossaryStorage.loadEntriesForSetUnified(setId);
        sets[setId].entries = entries;
    }

    return JSON.stringify(sets, null, 2);
}

function exportAllGlossarySets() {
    exportAllGlossarySetsAsync()
        .then(data => {
            window.dispatchEvent(new CustomEvent('allGlossarySetsExported', { detail: data }));
        })
        .catch(err => console.error('Failed to export all glossary sets:', err));
    return '{}';
}

/**
 * 載入某個模型的配置
 * @param {string} model
 * @returns {Object|null}
 */
function loadModelConfig(model) {
    try {
        const raw = localStorage.getItem(MODEL_CONFIGS_KEY);
        if (raw) {
            const allConfigs = JSON.parse(raw);
            return allConfigs[model] || null;
        }
    } catch {}
    return null;
}

/**
 * 儲存某個模型的key列表 (支援物件陣列)
 * @param {string} model
 * @param {Array<Object>} keysArray - [{ id, value, remark, status, order }, ...]
 */
function saveModelKeys(model, keysArray) {
    let allModelKeyStores = {};
    try {
        const raw = localStorage.getItem(MODEL_KEYS_KEY);
        if (raw) allModelKeyStores = JSON.parse(raw);
    } catch (e) {
        console.error("Error parsing model keys from localStorage:", e);
    }
    // 確保 keysArray 是陣列
    if (!Array.isArray(keysArray)) {
        console.error(`Attempted to save non-array for model ${model}'s keys.`);
        return;
    }
    allModelKeyStores[model] = keysArray;
    localStorage.setItem(MODEL_KEYS_KEY, JSON.stringify(allModelKeyStores));
}

/**
 * 載入某個模型的key列表 (返回物件陣列, 帶相容性處理)
 * @param {string} model
 * @returns {Array<Object>} [{ id, value, remark, status, order }, ...]
 */
function loadModelKeys(model) {
    let modelKeyStore = [];
    try {
        const raw = localStorage.getItem(MODEL_KEYS_KEY);
        if (raw) {
            const allModelKeyStores = JSON.parse(raw);
            if (allModelKeyStores && Array.isArray(allModelKeyStores[model])) {
                const loadedKeys = allModelKeyStores[model];
                // 檢查是否是新格式 (物件陣列)
                if (loadedKeys.length > 0 && typeof loadedKeys[0] === 'object' && loadedKeys[0] !== null && 'value' in loadedKeys[0]) {
                    modelKeyStore = loadedKeys.sort((a, b) => (a.order || 0) - (b.order || 0));
                    return modelKeyStore; //已經是新格式，直接返回並排序
                } else if (loadedKeys.length > 0 && typeof loadedKeys[0] === 'string') {
                    // 舊格式 (字串陣列)，需要轉換
                    console.log(`Migrating keys for model ${model} to new format.`);
                    modelKeyStore = loadedKeys.map((keyString, index) => ({
                        id: generateUUID(),
                        value: keyString,
                        remark: '',
                        status: 'untested', // 'untested', 'valid', 'invalid', 'testing'
                        order: index
                    }));
                    saveModelKeys(model, modelKeyStore); // 儲存轉換後的新格式
                    return modelKeyStore.sort((a, b) => a.order - b.order);
                } else if (loadedKeys.length === 0) {
                    return []; // 空陣列，直接返回
                }
            }
        }
    } catch (e) {
        console.error("Error loading or migrating model keys from localStorage for model " + model + ":", e);
    }

    // 相容遷移：將舊命名的通義/火山 Key 合併到新命名下
    try {
        const raw = localStorage.getItem(MODEL_KEYS_KEY);
        if (raw) {
            const allModelKeyStores = JSON.parse(raw);
            if (model === 'tongyi') {
                const old1 = Array.isArray(allModelKeyStores['tongyi-deepseek-v3']) ? allModelKeyStores['tongyi-deepseek-v3'] : [];
                const old2 = Array.isArray(allModelKeyStores['tongyi-qwen-turbo']) ? allModelKeyStores['tongyi-qwen-turbo'] : [];
                const merged = [...old1, ...old2];
                if (merged.length > 0) {
                    // 統一為物件陣列格式
                    const normalized = merged.map((k, idx) => (typeof k === 'string') ? ({ id: generateUUID(), value: k, remark: '', status: 'untested', order: idx }) : k);
                    saveModelKeys('tongyi', normalized);
                    return normalized.sort((a,b)=> (a.order||0)-(b.order||0));
                }
            }
            if (model === 'volcano') {
                const old1 = Array.isArray(allModelKeyStores['volcano-deepseek-v3']) ? allModelKeyStores['volcano-deepseek-v3'] : [];
                const old2 = Array.isArray(allModelKeyStores['volcano-doubao']) ? allModelKeyStores['volcano-doubao'] : [];
                const merged = [...old1, ...old2];
                if (merged.length > 0) {
                    const normalized = merged.map((k, idx) => (typeof k === 'string') ? ({ id: generateUUID(), value: k, remark: '', status: 'untested', order: idx }) : k);
                    saveModelKeys('volcano', normalized);
                    return normalized.sort((a,b)=> (a.order||0)-(b.order||0));
                }
            }
        }
    } catch (e) { /* ignore */ }

    // 進一步相容非常舊的、獨立的 localStorage key (mistralApiKeys, translationApiKeys)
    let legacyKeysArray = [];
    if (model === 'mistral') {
        const mistralKeysText = localStorage.getItem('mistralApiKeys');
        if (mistralKeysText) {
            legacyKeysArray = mistralKeysText.split('\n').map(k => k.trim()).filter(Boolean);
        }
    } else if (model !== 'custom' && model !== 'mistral') { // 假設其他預設模型可能存在於 translationApiKeys
        const translationKeysText = localStorage.getItem('translationApiKeys');
        if (translationKeysText) {
            legacyKeysArray = translationKeysText.split('\n').map(k => k.trim()).filter(Boolean);
        }
    }

    if (legacyKeysArray.length > 0) {
        console.log(`Migrating legacy keys for model ${model} from separate localStorage items.`);
        modelKeyStore = legacyKeysArray.map((keyString, index) => ({
            id: generateUUID(),
            value: keyString,
            remark: '',
            status: 'untested',
            order: index
        }));
        saveModelKeys(model, modelKeyStore); // 儲存轉換後的新格式
        // 清理舊的獨立 localStorage 項 (可選，但推薦)
        // if (model === 'mistral') localStorage.removeItem('mistralApiKeys');
        // if (model !== 'custom' && model !== 'mistral') localStorage.removeItem('translationApiKeys'); // 要小心，這可能會影響其他尚未遷移的邏輯
        return modelKeyStore.sort((a, b) => a.order - b.order);
    }

    return []; // 預設返回空陣列
}

// ========== 新增：自定義源站配置管理 ==========

/**
 * 遷移舊的單一自定義模型配置到新的多源站結構。
 * 這應該只執行一次。
 * @returns {boolean} - 如果執行了遷移則返回 true，否則返回 false。
 */
async function migrateLegacyCustomConfig() {
    console.log("Checking for legacy custom config migration...");
    const oldCustomConfig = loadModelConfig('custom'); // 使用現有函式載入舊配置
    let existingSourceSites = {};
    try {
        const storedSites = localStorage.getItem(CUSTOM_SOURCE_SITES_KEY);
        if (storedSites) {
            existingSourceSites = JSON.parse(storedSites);
        }
    } catch (e) {
        console.error("Error parsing existing source sites for migration check:", e);
    }

    if (oldCustomConfig && Object.keys(existingSourceSites).length === 0) {
        console.log("Legacy 'custom' config found and no new source sites exist. Starting migration.");
        if (typeof showNotification === 'function') {
            showNotification("檢測到舊版自定義配置，正在遷移...", "info", 4000);
        }

        const newSourceSiteId = generateUUID();
        const migratedSite = {
            id: newSourceSiteId,
            displayName: "舊版自定義配置 (已遷移)",
            apiBaseUrl: oldCustomConfig.apiBaseUrl || oldCustomConfig.apiEndpoint || "",
            modelId: oldCustomConfig.modelId || "",
            availableModels: oldCustomConfig.availableModels || [], // 保留舊的可用模型（如果有）
            requestFormat: oldCustomConfig.requestFormat || "openai",
            temperature: oldCustomConfig.temperature !== undefined ? oldCustomConfig.temperature : 0.5,
            max_tokens: oldCustomConfig.max_tokens !== undefined ? oldCustomConfig.max_tokens : 8000,
            endpointMode: 'auto'
        };

        // 1. 儲存新的源站配置 (透過呼叫 saveCustomSourceSite 來確保統一處理)
        // 先直接寫入，避免 saveCustomSourceSite 中的 loadAllCustomSourceSites 再次觸發遷移
        existingSourceSites[newSourceSiteId] = migratedSite;
        localStorage.setItem(CUSTOM_SOURCE_SITES_KEY, JSON.stringify(existingSourceSites));
        console.log("Migrated site config saved to CUSTOM_SOURCE_SITES_KEY for ID:", newSourceSiteId);


        const newModelNameKey = `custom_source_${newSourceSiteId}`;

        // 2. 遷移 API Keys
        let allModelKeyStores = {};
        try {
            const rawKeys = localStorage.getItem(MODEL_KEYS_KEY);
            if (rawKeys) allModelKeyStores = JSON.parse(rawKeys);
        } catch (e) {
            console.error("Error parsing model keys during migration:", e);
        }

        if (allModelKeyStores && allModelKeyStores['custom']) {
            console.log(`Migrating API keys for 'custom' to '${newModelNameKey}'`);
            allModelKeyStores[newModelNameKey] = allModelKeyStores['custom'];
            delete allModelKeyStores['custom']; // Remove old key entry
            localStorage.setItem(MODEL_KEYS_KEY, JSON.stringify(allModelKeyStores));
        }

        // 3. 遷移上次成功使用的 Key ID
        try {
            let lastSuccessfulRecords = JSON.parse(localStorage.getItem(LAST_SUCCESSFUL_KEYS_LS_KEY_STORAGE_REF) || '{}');
            if (lastSuccessfulRecords && lastSuccessfulRecords['custom']) {
                console.log(`Migrating last successful key ID for 'custom' to '${newModelNameKey}'`);
                lastSuccessfulRecords[newModelNameKey] = lastSuccessfulRecords['custom'];
                delete lastSuccessfulRecords['custom']; // Remove old entry
                localStorage.setItem(LAST_SUCCESSFUL_KEYS_LS_KEY_STORAGE_REF, JSON.stringify(lastSuccessfulRecords));
            }
        } catch (e) {
            console.error("Error migrating last successful key ID:", e);
        }

        // 4. 刪除舊的 'custom' 模型配置
        let allConfigs = {};
        try {
            const rawConfigs = localStorage.getItem(MODEL_CONFIGS_KEY);
            if (rawConfigs) allConfigs = JSON.parse(rawConfigs);
        } catch {}
        if (allConfigs && allConfigs['custom']) {
            console.log("Removing old 'custom' entry from model configs.");
            delete allConfigs['custom'];
            localStorage.setItem(MODEL_CONFIGS_KEY, JSON.stringify(allConfigs));
        }

        if (typeof showNotification === 'function') {
            showNotification("舊版自定義配置已成功遷移到新的源站管理。", "success", 5000);
        }
        console.log("Legacy migration completed for ID:", newSourceSiteId);
        return true; // Migration happened
    } else if (oldCustomConfig && Object.keys(existingSourceSites).length > 0) {
        console.log("Legacy 'custom' config found, but new source sites already exist. Migration skipped. Removing old 'custom' config from MODEL_CONFIGS_KEY to prevent conflicts.");
        let allConfigs = {};
        try {
            const rawConfigs = localStorage.getItem(MODEL_CONFIGS_KEY);
            if (rawConfigs) allConfigs = JSON.parse(rawConfigs);
        } catch {}
        if (allConfigs && allConfigs['custom']) {
            delete allConfigs['custom'];
            localStorage.setItem(MODEL_CONFIGS_KEY, JSON.stringify(allConfigs));
            if (typeof showNotification === 'function') {
                showNotification("檢測到舊版自定義配置和新的源站點共存，已自動移除舊的獨立自定義配置。請在源站點管理中檢視。", "info", 7000);
            }
        }
    } else {
        console.log("No legacy 'custom' config to migrate or migration already effectively done (no old config or new sites exist).");
    }
    return false; // No migration happened or needed now
}

/**
 * 載入所有自定義源站配置。
 * 會在首次載入時嘗試遷移舊配置 (如果 migrateLegacyCustomConfig 還未被有效執行過)。
 * @returns {Object} 以源站 ID 為鍵，源站配置為值的物件，如果出錯則返回空物件。
 */
function loadAllCustomSourceSites() {
    // 確保遷移邏輯被考慮。migrateLegacyCustomConfig 有內部檢查防止重複執行。
    // 為了避免 loadAllCustomSourceSites -> migrateLegacyCustomConfig -> loadModelConfig (舊) -> ...
    // 的迴圈或多次不必要檢查，遷移最好在應用初始化時更明確地呼叫一次。
    // 但為確保資料一致性，這裡保留一次檢查。
    // 如果此函式在應用啟動早期被呼叫，遷移會發生。
    if (!localStorage.getItem(CUSTOM_SOURCE_SITES_KEY) && localStorage.getItem(MODEL_CONFIGS_KEY)) {
         // 僅當新結構不存在但舊的 MODEL_CONFIGS_KEY 可能含有 'custom' 時，才更積極地嘗試遷移。
        migrateLegacyCustomConfig();
    }

    let sites = {};
    try {
        const storedSites = localStorage.getItem(CUSTOM_SOURCE_SITES_KEY);
        if (storedSites) {
            sites = JSON.parse(storedSites);
        } else {
            // 如果 CUSTOM_SOURCE_SITES_KEY 不存在，也可能是遷移後第一次載入，
            // migrateLegacyCustomConfig 應該已經建立了它（如果需要遷移）。
            // 所以如果仍然是 null，說明確實沒有資料。
        }
    } catch (e) {
        console.error("Failed to load custom source sites from localStorage:", e);
        sites = {}; // 出錯時返回空物件
    }
    return sites;
}

/**
 * 儲存單個自定義源站的配置 (新增或更新)。
 * @param {Object} sourceSiteConfig - 要儲存的源站配置物件，必須包含 'id' 屬性。
 */
function saveCustomSourceSite(sourceSiteConfig) {
    if (!sourceSiteConfig || !sourceSiteConfig.id) {
        console.error("Cannot save source site: config is invalid or missing ID.", sourceSiteConfig);
        if (typeof showNotification === 'function') {
            showNotification("儲存源站配置失敗：ID缺失。", "error");
        }
        return;
    }
    // 不再從 loadAllCustomSourceSites 內部呼叫 migrateLegacyCustomConfig
    // 假設遷移已在應用啟動時或首次載入時處理完畢。
    let allSites = {};
    try {
        const storedSites = localStorage.getItem(CUSTOM_SOURCE_SITES_KEY);
        if (storedSites) {
            allSites = JSON.parse(storedSites);
        }
    } catch (e) {
        console.error("Error parsing existing source sites before saving:", e);
        // 繼續嘗試儲存，可能會覆蓋損壞的資料
    }

    allSites[sourceSiteConfig.id] = sourceSiteConfig;
    try {
        localStorage.setItem(CUSTOM_SOURCE_SITES_KEY, JSON.stringify(allSites));
        console.log("Custom source site saved:", sourceSiteConfig.id, sourceSiteConfig.displayName);
    } catch (e) {
        console.error("Failed to save custom source site to localStorage:", e);
        if (typeof showNotification === 'function') {
            showNotification(`儲存源站 ${sourceSiteConfig.displayName || sourceSiteConfig.id} 失敗。`, "error");
        }
    }
}

/**
 * 刪除指定的自定義源站配置及其關聯的API Keys和最後成功記錄。
 * @param {string} sourceSiteId - 要刪除的源站的 ID。
 */
function deleteCustomSourceSite(sourceSiteId) {
    if (!sourceSiteId) {
        console.error("Cannot delete source site: ID is missing.");
        return;
    }

    let allSites = {}; // Initialize as empty object
    try {
        const storedSites = localStorage.getItem(CUSTOM_SOURCE_SITES_KEY);
        if (storedSites) {
            allSites = JSON.parse(storedSites);
        }
    } catch (e) {
        console.error("Error parsing existing source sites before deletion:", e);
        // If parsing fails, we might not be able to confirm siteToDelete.displayName later.
        // However, we should still attempt to remove the entry by ID.
    }

    const siteToDelete = allSites[sourceSiteId]; // Get a reference before deleting

    if (siteToDelete || allSites.hasOwnProperty(sourceSiteId)) { // Check if key exists even if value is falsy
        delete allSites[sourceSiteId];
        try {
            localStorage.setItem(CUSTOM_SOURCE_SITES_KEY, JSON.stringify(allSites));
            console.log("Custom source site config removed from localStorage:", sourceSiteId);

            const modelNameKeyForSite = `custom_source_${sourceSiteId}`;

            // 刪除關聯的 API Keys
            let allModelKeyStores = {};
            try {
                const rawKeys = localStorage.getItem(MODEL_KEYS_KEY);
                if (rawKeys) allModelKeyStores = JSON.parse(rawKeys);
            } catch {} // Ignore parsing errors for key store, just try to delete if key exists
            if (allModelKeyStores && allModelKeyStores[modelNameKeyForSite]) {
                delete allModelKeyStores[modelNameKeyForSite];
                localStorage.setItem(MODEL_KEYS_KEY, JSON.stringify(allModelKeyStores));
                console.log("Deleted API keys for source site:", sourceSiteId);
            }

            // 刪除關聯的最後成功 Key 記錄
            try {
                let lastSuccessfulRecords = JSON.parse(localStorage.getItem(LAST_SUCCESSFUL_KEYS_LS_KEY_STORAGE_REF) || '{}');
                if (lastSuccessfulRecords && lastSuccessfulRecords[modelNameKeyForSite]) {
                    delete lastSuccessfulRecords[modelNameKeyForSite];
                    localStorage.setItem(LAST_SUCCESSFUL_KEYS_LS_KEY_STORAGE_REF, JSON.stringify(lastSuccessfulRecords));
                    console.log("Deleted last successful key record for source site:", sourceSiteId);
                }
            } catch (e) {
                 console.error("Error deleting last successful key record for source site:", sourceSiteId, e);
            }

            const displayName = siteToDelete ? siteToDelete.displayName : sourceSiteId;
            if (typeof showNotification === 'function') {
                showNotification(`源站 "${displayName}" 已成功刪除。`, "success");
            }

        } catch (e) {
            const displayName = siteToDelete ? siteToDelete.displayName : sourceSiteId;
            console.error(`Failed to delete custom source site "${displayName}" or its related data:`, e);
            if (typeof showNotification === 'function') {
                showNotification(`刪除源站 "${displayName}" 失敗。`, "error");
            }
        }
    } else {
        console.warn("Attempted to delete a non-existent source site:", sourceSiteId);
         if (typeof showNotification === 'function') {
            showNotification(`嘗試刪除不存在的源站 (ID: ${sourceSiteId})。`, "warning");
        }
    }
}

// ========== 新增：醒目提示與批註資料儲存 ==========

/**
 * 將醒目提示/批註物件儲存到 IndexedDB。
 * @param {Object} annotation - 醒目提示/批註物件，應包含 id, docId 等屬性。
 * @returns {Promise<void>}
 */
async function saveAnnotationToDB(annotation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ANNOTATIONS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(ANNOTATIONS_STORE_NAME);
        // 確保有 createdAt 和 updatedAt 時間戳
        const now = new Date().toISOString();
        annotation.createdAt = annotation.createdAt || now;
        annotation.updatedAt = now;
        store.put(annotation);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * 根據文件 ID 從 IndexedDB 獲取所有醒目提示/批註。
 * @param {string} docId - 文件 ID。
 * @returns {Promise<Array<Object>>} - 與該文件關聯的醒目提示/批註物件陣列。
 */
async function getAnnotationsForDocFromDB(docId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ANNOTATIONS_STORE_NAME, 'readonly');
        const store = tx.objectStore(ANNOTATIONS_STORE_NAME);
        const index = store.index('docId');
        const request = index.getAll(docId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 更新 IndexedDB 中的一個醒目提示/批註物件。
 * (等同於儲存，因為 put 會覆蓋)
 * @param {Object} annotation - 要更新的醒目提示/批註物件。
 * @returns {Promise<void>}
 */
async function updateAnnotationInDB(annotation) {
    // put 操作會覆蓋已存在的記錄（如果 key 相同），或者新增一條記錄。
    // 我們確保 updatedAt 時間戳被更新。
    return saveAnnotationToDB(annotation);
}

/**
 * 根據 ID 從 IndexedDB 刪除一個醒目提示/批註。
 * @param {string} annotationId - 要刪除的醒目提示/批註的 ID。
 * @returns {Promise<void>}
 */
async function deleteAnnotationFromDB(annotationId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ANNOTATIONS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(ANNOTATIONS_STORE_NAME);
        const request = store.delete(annotationId);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}

// --- 匯出多模型配置和key存取方法 ---
// export { saveModelConfig, loadModelConfig, saveModelKeys, loadModelKeys };

// --- 匯出 Storage 相關函式 ---

// --- 顯式暴露必要的函式到全域作用域 ---
if (typeof window !== 'undefined') {
    // 暴露提示詞池需要的關鍵函式
    window.loadAllCustomSourceSites = loadAllCustomSourceSites;
    // 糾正匯出名稱：函式為 saveCustomSourceSite（單數）
    window.saveCustomSourceSite = saveCustomSourceSite;
    window.loadKeys = loadModelKeys;  // 為了相容性，使用 loadKeys 作為別名
    window.loadModelKeys = loadModelKeys;
    window.loadSettings = loadSettings;
    window.saveSettings = saveSettings;
    console.log('[Storage] 函式已暴露到全域作用域:', {
        loadAllCustomSourceSites: typeof window.loadAllCustomSourceSites,
        saveCustomSourceSite: typeof window.saveCustomSourceSite,
        loadKeys: typeof window.loadKeys,
        loadModelKeys: typeof window.loadModelKeys,
        loadSettings: typeof window.loadSettings,
        saveSettings: typeof window.saveSettings
    });
}
// export { updateApiKeyStorage, loadProcessedFilesRecord, saveProcessedFilesRecord, isAlreadyProcessed, markFileAsProcessed, saveSettings, loadSettings };
