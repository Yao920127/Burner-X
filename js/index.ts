/**
 * @file js/index.js
 * @description
 * 主 UI 初始化和模組管理腳本。
 * 該檔案負責:
 *  - 初始化全域 `window.ui`名稱空間，用於掛載各個 UI 模組的功能。
 *  - 定義 UI 模組的序號產生器制 (`window.ui.registerModule`)。
 *  - 管理模組載入狀態 (`window.ui.moduleStatus`, `EXPECTED_UI_MODULES`, `_allModulesReady`)。
 *  - 提供一個就緒回撥佇列 (`window.ui.onReady`, `_pendingInitializations`)，確保在所有模組載入完畢且 DOM 就緒後執行初始化程式碼。
 *  - 包含核心的 UI 初始化邏輯 (`initializeAllUI_internal`)，用於綁定全域事件監聽器、初始化特定 UI 元件等。
 *  - 處理特定 UI 元素的動態顯隱和互動，如翻譯模型選擇相關的 UI (`updateTranslationUIVisibility`, `handleCustomModelSelection`)。
 *  - 監聽 `DOMContentLoaded` 事件以啟動整個 UI 初始化流程。
 */

if (typeof window.ui === 'undefined') {
  console.log('DEBUG index.js: Initializing window.ui object');
  window.ui = {};
} else {
  console.log('DEBUG index.js: window.ui object already exists.');
}

if (typeof window.ui.moduleStatus === 'undefined') {
  console.log('DEBUG index.js: Initializing window.ui.moduleStatus');
  window.ui.moduleStatus = {};
} else {
  console.log('DEBUG index.js: window.ui.moduleStatus already exists.');
}

// Placeholders for core methods - ensures they exist if called early by other scripts
window.ui.registerModule = window.ui.registerModule || function(name, funcs) {
    console.warn(`UI: Placeholder registerModule called for ${name}. Functions will not be registered globally yet.`);
    // Basic status update
    if (window.ui && window.ui.moduleStatus) {
        window.ui.moduleStatus[name] = true; // Mark as loaded for _allModulesReady check
        console.log(`UI模組 (via placeholder) 已記錄: ${name}`);
    }
     // Try to execute pending initializations if this was the last expected module according to a basic check
    if (typeof _allModulesReady === 'function' && _allModulesReady() && typeof _executePendingInitializations === 'function') {
        console.warn("Placeholder registerModule: All modules might be ready, attempting to execute initializations.");
        _executePendingInitializations();
    }
};
window.ui.onReady = window.ui.onReady || function(cb) {
    console.warn(`UI: Placeholder onReady called. Executing callback.`);
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(cb, 0); // Execute async if DOM is somewhat ready
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(cb, 0)); // Otherwise wait for DOM
    }
};
// END OF VERY TOP INITIALIZATION

const EXPECTED_UI_MODULES = ['helpers', 'form', 'fileList', 'progress', 'notification', 'sourceSite', 'keyHandlers', 'keyManager'];
// Initialize moduleStatus for expected modules if not already set by placeholders or previous runs
EXPECTED_UI_MODULES.forEach(name => {
    if (typeof window.ui.moduleStatus[name] === 'undefined' || window.ui.moduleStatus[name] === false) { // Check if false to allow re-init logic
        window.ui.moduleStatus[name] = false;
    }
});

/**
 * 根據是否選擇自定義翻譯模型，更新相關 UI 元素的可見性和狀態。
 * 當使用者在翻譯模型下拉選單中選擇 "custom" 或從 "custom" 切換到其他模型時，此函式被呼叫。
 *
 * 主要操作:
 * - 顯示或隱藏自定義源站點容器 (`customSourceSiteContainer`)。
 * - 啟用或禁用自定義源站點選擇下拉選單 (`customSourceSiteSelect`)，並在隱藏時清空其選擇。
 * - 顯示或隱藏自定義源站點資訊區域 (`customSourceSiteInfo`)，並在隱藏時清空其內容。
 *
 * @param {boolean} showCustomUI - 如果為 `true`，則顯示自定義模型相關的 UI 部分；否則隱藏它們。
 */
function updateTranslationUIVisibility(showCustomUI) {
    // console.log(`UI::updateTranslationUIVisibility, showCustom: ${showCustomUI}`); // Original log
    console.log(`DEBUG index.js: updateTranslationUIVisibility CALLED with showCustom: ${showCustomUI}`);
    if (typeof window.updateTranslationUIVisibility === 'function' && window.updateTranslationUIVisibility !== updateTranslationUIVisibility) {
        window.updateTranslationUIVisibility(showCustomUI);
        return;
    }
    const customSourceSiteContainer = document.getElementById('customSourceSiteContainer');
    const customSourceSiteSelect = document.getElementById('customSourceSiteSelect');
    const customSourceSiteInfo = document.getElementById('customSourceSiteInfo');

    if (customSourceSiteContainer) {
        customSourceSiteContainer.classList.toggle('hidden', !showCustomUI);
    }

    if (customSourceSiteSelect) {
        customSourceSiteSelect.disabled = !showCustomUI;
        if (!showCustomUI) {
            customSourceSiteSelect.value = ''; // Clear selection when hiding
        }
    }

    if (customSourceSiteInfo) {
        customSourceSiteInfo.classList.toggle('hidden', !showCustomUI);
        if (!showCustomUI) {
            customSourceSiteInfo.innerHTML = ''; // Clear info when hiding
        }
    }
}
// CORRECTED SPELLING HERE
window.ui.updateTranslationUIVisibility = updateTranslationUIVisibility;
console.log('DEBUG index.js: Assigned window.ui.updateTranslationUIVisibility. Type is now:', typeof window.ui.updateTranslationUIVisibility);
if (typeof window.ui.updateTranslationUIVisibility !== 'function') {
    console.error('CRITICAL DEBUG index.js: updateTranslationUIVisibility IS NOT A FUNCTION immediately after assignment!');
}

let _pendingInitializations = [];
let _modulesReadyStatus = {}; // This will be populated by the actual registerModule
let _domReady = false;
let _initializationExecuted = false; // Flag to prevent multiple executions


/**
 * 檢查所有在 `EXPECTED_UI_MODULES` 中定義的預期 UI 模組是否都已註冊並標記為就緒。
 * 它走訪 `EXPECTED_UI_MODULES` 陣列，並檢查 `window.ui.moduleStatus` 中對應模組的狀態。
 *
 * @returns {boolean} 如果所有預期模組都已就緒，則返回 `true`；否則返回 `false`。
 * @private
 */
function _allModulesReady() {
    for (const moduleName of EXPECTED_UI_MODULES) {
        if (!window.ui.moduleStatus[moduleName]) {
            // console.log(`DEBUG index.js: _allModulesReady - Module not ready: ${moduleName}`);
            return false;
        }
    }
    console.log("DEBUG index.js: _allModulesReady - All expected UI modules are ready.");
    return true;
}

/**
 * (全域 `window.ui` 介面)
 * 註冊一個 UI 模組及其提供的功能函式到全域 `window.ui` 物件上。
 * 每個模組透過呼叫此函式來宣告自身已載入，並將其公開的介面掛載到 `window.ui`。
 *
 * 主要步驟:
 * 1. 引數校驗：確保 `moduleName` 和 `functions` 物件有效。
 * 2. 函式掛載：走訪 `functions` 物件中的每個函式，將其賦值給 `window.ui[funcName]`。
 *    如果發生命名衝突（覆蓋已有的非核心 `window.ui` 屬性），會列印警告。
 * 3. 狀態更新：將 `window.ui.moduleStatus[moduleName]` 設定為 `true`，標記該模組已載入。
 * 4. 觸發初始化：呼叫 `_executePendingInitializations` 嘗試執行待處理的初始化任務，
 *    因為一個新模組的載入可能滿足了所有初始化條件。
 *
 * @param {string} moduleName - 要註冊的模組的名稱 (應與 `EXPECTED_UI_MODULES` 中的條目對應)。
 * @param {Object} functions -一個物件，其鍵是函式名，值是函式本身。這些函式將被新增到 `window.ui`。
 */
window.ui.registerModule = function(moduleName, functions) {
    console.log('DEBUG index.js: registerModule - START. Module:', moduleName, 'Functions:', Object.keys(functions));
    if (!moduleName || typeof moduleName !== 'string') {
        console.error('UI: registerModule - moduleName is invalid.', moduleName);
        return;
    }
    if (!functions || typeof functions !== 'object') {
        console.error(`UI: registerModule - functions for module '${moduleName}' is invalid.`, functions);
        return;
    }

    Object.keys(functions).forEach(funcName => {
        if (window.ui.hasOwnProperty(funcName) &&
            funcName !== 'registerModule' &&
            funcName !== 'onReady' &&
            funcName !== 'moduleStatus' &&
            funcName !== 'updateTranslationUIVisibility' &&
            funcName !== 'handleCustomModelSelection' &&
            funcName !== 'showNotification' &&
            !EXPECTED_UI_MODULES.includes(funcName)
        ) {
            // console.warn(`UI: Module '${moduleName}' is overwriting existing ui function '${funcName}'.`);
        }
        window.ui[funcName] = functions[funcName];
    });

    window.ui.moduleStatus[moduleName] = true;
    console.log(`UI模組已註冊: ${moduleName}`);

    // 檢查是否所有模組都已載入完成，並且DOM已準備好
    if (typeof _executePendingInitializations === 'function') {
        _executePendingInitializations();
    } else {
         console.error("DEBUG index.js: registerModule - _executePendingInitializations is not defined when trying to call it after module registration.");
    }
};

/**
 * 執行所有透過 `window.ui.onReady` 排隊的待處理初始化回撥函式。
 * 此函式僅在以下所有條件都滿足時才會實際執行回撥：
 *  - DOM 已載入完成 (`_domReady` 為 `true`)。
 *  - 所有預期的 UI 模組都已註冊 (`_allModulesReady()` 返回 `true`)。
 *  - 初始化流程尚未執行過 (`_initializationExecuted` 為 `false`)。
 *
 * 執行時，它會：
 * 1. 設定 `_initializationExecuted = true` 防止重入。
 * 2. 依次執行 `_pendingInitializations` 佇列中的所有回撥函式。
 * 3. 呼叫核心的 `initializeAllUI_internal()` 函式來完成最終的 UI 設定。
 * @private
 */
function _executePendingInitializations() {
    console.log(`DEBUG index.js: _executePendingInitializations called. DOM Ready: ${_domReady}, All Modules Ready: ${typeof _allModulesReady === 'function' ? _allModulesReady() : 'unknown'}, Executed: ${_initializationExecuted}`);
    if (_initializationExecuted) {
        console.log("DEBUG index.js: _executePendingInitializations - Already executed, skipping.");
        return;
    }

    if (_domReady && typeof _allModulesReady === 'function' && _allModulesReady()) {
        console.log('DEBUG index.js: All conditions met, executing pending initializations...');
        _initializationExecuted = true; // Set flag
        while (_pendingInitializations.length > 0) {
            const cb = _pendingInitializations.shift();
            try {
                console.log("DEBUG index.js: Executing a pending initialization callback.");
                cb();
            } catch (e) {
                console.error("Error executing pending initialization:", e);
            }
        }
        console.log("DEBUG index.js: All pending initializations executed.");

        // 確保核心的 initializeAllUI_internal 被呼叫
        if (typeof initializeAllUI_internal === 'function') {
            console.log("DEBUG index.js: Calling initializeAllUI_internal from _executePendingInitializations.");
            initializeAllUI_internal();
        } else {
            console.error("DEBUG index.js: initializeAllUI_internal is not defined when trying to call from _executePendingInitializations.");
        }

    } else {
        console.log("DEBUG index.js: _executePendingInitializations - Conditions not yet met (or _allModulesReady not defined).");
    }
}

/**
 * (全域 `window.ui` 介面)
 * 註冊一個回撥函式，該函式將在整個 UI（包括所有模組和 DOM）完全準備就緒後執行。
 * 如果呼叫此函式時 UI 已經就緒，則回撥會幾乎立即非同步執行。
 * 否則，回撥會被新增到一個佇列 (`_pendingInitializations`) 中，等待所有條件滿足後由 `_executePendingInitializations` 統一執行。
 *
 * @param {function} callback - 當 UI 完全就緒時要執行的回撥函式。
 */
window.ui.onReady = function(callback) {
    console.log("DEBUG index.js: window.ui.onReady called with a callback.");
    if (typeof callback !== 'function') {
        console.error('UI: onReady callback is not a function.');
        return;
    }
    if (_domReady && typeof _allModulesReady === 'function' && _allModulesReady() && _initializationExecuted) {
        console.log("DEBUG index.js: onReady - UI already fully initialized, executing callback immediately.");
        setTimeout(callback, 0); // 執行回撥，非同步以避免堆疊溢位
    } else {
        console.log("DEBUG index.js: onReady - UI not yet fully initialized or initializations not run, queueing callback.");
        _pendingInitializations.push(callback);
        // 如果DOM已就緒但初始化尚未執行（可能模組仍在載入），嘗試執行一次
        if (_domReady && typeof _executePendingInitializations === 'function' && !_initializationExecuted) {
            console.log("DEBUG index.js: onReady - DOM ready, trying to execute pending initializations.");
            _executePendingInitializations();
        }
    }
};

/**
 * 處理當翻譯模型下拉選單選擇發生變化時的邏輯，特別是針對"自定義模型"選項。
 * 當使用者選擇或取消選擇 "custom" 模型時，此函式負責：
 *  1. 呼叫 `window.ui.updateTranslationUIVisibility` 來切換相關 UI 元素的顯隱。
 *  2. 如果選擇了 "custom" 模型：
 *     - 嘗試呼叫 `window.ui.tryPopulateCustomSourceSitesDropdown` 來填充自定義源站點下拉選單。
 *     - 自動展開自定義源站點設定區域（如果該區域存在且當前是摺疊狀態）。
 * @private
 */
function handleCustomModelSelection() {
    console.log("DEBUG index.js: handleCustomModelSelection: 處理自定義模式選擇");
    const isCustomModel = document.getElementById('translationModel').value === 'custom';

    if (typeof window.ui.updateTranslationUIVisibility === 'function') {
        window.ui.updateTranslationUIVisibility(isCustomModel);
    } else {
        console.warn("DEBUG index.js: handleCustomModelSelection - updateTranslationUIVisibility is not available on window.ui.");
    }

    if (isCustomModel) {
        console.log("DEBUG index.js: Custom model selected. Attempting to populate dropdown and expand section.");
        if (typeof window.ui.tryPopulateCustomSourceSitesDropdown === 'function') {
            console.log("DEBUG index.js: Calling window.ui.tryPopulateCustomSourceSitesDropdown...");
            window.ui.tryPopulateCustomSourceSitesDropdown();
        } else {
            console.warn("DEBUG index.js: window.ui.tryPopulateCustomSourceSitesDropdown is not available.");
        }
        // 自動展開自定義源站點設定區域
        const customSourceSiteDiv = document.getElementById('customSourceSite');
        const customSourceSiteToggleIconEl = document.getElementById('customSourceSiteToggleIcon');
        if (customSourceSiteDiv && customSourceSiteDiv.classList.contains('hidden')) {
            customSourceSiteDiv.classList.remove('hidden');
            if (customSourceSiteToggleIconEl) {
                customSourceSiteToggleIconEl.setAttribute('icon', 'carbon:chevron-up');
            }
            console.log("DEBUG index.js: Custom source site section expanded.");
        }
    }
}
window.ui.handleCustomModelSelection = handleCustomModelSelection;


/**
 * 核心的內部 UI 初始化函式。
 * 此函式在所有模組載入完畢且 DOM 就緒後，由 `_executePendingInitializations` 呼叫。
 * 主要職責包括：
 *  - 呼叫 `window.ui.registerGlobalUIEventListeners` (如果由模組提供) 來註冊全域性的事件監聽器 (如鍵盤快捷鍵)。
 *  - 呼叫 `window.ui.registerSourceSiteListeners` (如果由模組提供) 來註冊與自定義源站點相關的事件監聽器。
 *  - 呼叫 `window.ui.initKeyManagerDisplay` (如果由模組提供) 來初始化 API Key 管理器的顯示。
 *  - 檢查初始的翻譯模型選擇狀態，並呼叫 `updateTranslationUIVisibility` 和/或 `handleCustomModelSelection` 以確保 UI 正確顯示。
 * @private
 */
function initializeAllUI_internal() {
    console.log("DEBUG index.js: Executing initializeAllUI_internal (event listeners, etc.)...");

    // 全域UI事件 (例如鍵盤快捷鍵、彈出視窗關閉等)
    if (typeof window.ui.registerGlobalUIEventListeners === 'function') {
        window.ui.registerGlobalUIEventListeners();
        console.log("DEBUG index.js: Registered global UI event listeners (from window.ui).");
    } else if (typeof registerGlobalUIEventListeners_internal === 'function') {
        // Fallback to a locally defined one if modules didn't provide it (e.g. if helpers.js moved it here)
        // registerGlobalUIEventListeners_internal(); // This function is no longer defined in index.js
        console.warn("DEBUG index.js: window.ui.registerGlobalUIEventListeners not found. Global listeners might not be set up by helpers.js.");
    }


    // 源站點特定的事件 (例如選擇自定義源站點時的行為)
    if (typeof window.ui.registerSourceSiteListeners === 'function') {
        window.ui.registerSourceSiteListeners();
        console.log("DEBUG index.js: Registered source site specific event listeners.");
    } else {
        console.warn("DEBUG index.js: window.ui.registerSourceSiteListeners is not available. Custom source site interactions might be limited.");
    }

    // 初始化Key管理器UI（如果它作為一個模組提供了初始化函式）
    if (typeof window.ui.initKeyManagerDisplay === 'function') {
        window.ui.initKeyManagerDisplay();
        console.log("DEBUG index.js: Initialized Key Manager UI display.");
    } else {
        console.warn("DEBUG index.js: window.ui.initKeyManagerDisplay is not available. Key manager UI might not initialize correctly.");
    }

    // 檢查初始翻譯模型選擇，並相應地更新UI
    const initialTranslationModel = document.getElementById('translationModel');
    if (initialTranslationModel) {
        console.log(`DEBUG index.js: Initial translation model value: ${initialTranslationModel.value}`);
        if (typeof window.ui.updateTranslationUIVisibility === 'function') {
            window.ui.updateTranslationUIVisibility(initialTranslationModel.value === 'custom');
            console.log("DEBUG index.js: Initial call to updateTranslationUIVisibility in initializeAllUI_internal done.");
        } else {
            console.warn("DEBUG index.js: updateTranslationUIVisibility function not available in initializeAllUI_internal for initial UI setup.");
        }
        // 如果初始模型是 'custom'，確保自定義源站點下拉選單已填充
        if (initialTranslationModel.value === 'custom') {
             if (typeof window.ui.handleCustomModelSelection === 'function') {
                //  window.ui.handleCustomModelSelection(); // This will also call updateTranslationUIVisibility
                 console.log("DEBUG index.js: Initial model is custom, handleCustomModelSelection should have run or will run via onReady.");
             } else {
                 console.warn("DEBUG index.js: window.ui.handleCustomModelSelection not available for initial custom model check.");
             }
        }
    } else {
        console.warn("DEBUG index.js: Translation model select element not found during initializeAllUI_internal.");
    }

    // 後端模式：隱藏/禁用模型與Key設定相關的前端編輯入口，僅保留“選擇使用哪個模型”
    try {
        const isBackendMode = (typeof window !== 'undefined' && window.storageAdapter && window.storageAdapter.isFrontendMode === false);
        if (isBackendMode) {
            const hide = (el) => { try { if (el) { el.classList.add('hidden'); el.setAttribute('aria-hidden', 'true'); } } catch {} };
            const disable = (el) => { try { if (el) { el.setAttribute('disabled', 'true'); el.classList.add('opacity-50','cursor-not-allowed'); } } catch {} };

            // 1) API Key 文字域與其標籤
            hide(document.querySelector('label[for="mistralApiKeys"]'));
            hide(document.getElementById('mistralApiKeys'));
            hide(document.querySelector('label[for="translationApiKeys"]'));
            hide(document.getElementById('translationApiKeys'));
            hide(document.getElementById('rememberMistralKey'));
            hide(document.getElementById('rememberTranslationKey'));

            // 2) Key 管理器按鈕與彈出視窗
            const keyBtn = document.getElementById('modelKeyManagerBtn');
            if (keyBtn) { disable(keyBtn); keyBtn.title = '後端模式：模型與Key管理已禁用'; }
            hide(document.getElementById('modelKeyManagerModal'));

            // 3) 自定義源站點相關（僅保留選擇模型，不提供站點/Key管理）
            hide(document.getElementById('customSourceSiteContainer'));
            hide(document.getElementById('customSourceSite'));
            hide(document.getElementById('customSourceSiteInfo'));
            hide(document.getElementById('manageSourceSiteKeyBtn'));
            hide(document.getElementById('detectModelsBtn'));

            // 4) 提示
            if (typeof window.showNotification === 'function') {
                window.showNotification('後端模式：已禁用前端的模型與Key設定；可直接選擇要使用的模型。', 'info');
            }
        }
    } catch (e) {
        console.warn('[Index] Backend-mode gating failed (ignored):', e?.message || e);
    }
    console.log("DEBUG index.js: initializeAllUI_internal finished.");
}


/**
 * DOMContentLoaded 事件的監聽器回撥。
 * 當 HTML 文件完全載入並解析完成後（不等待樣式表、影象和子框架），此函式被觸發。
 *
 * 主要操作:
 * 1. 設定全域標誌 `_domReady = true`。
 * 2. 呼叫 `_executePendingInitializations()` 嘗試啟動待處理的初始化任務。
 *    （如果此時模組尚未全部載入，`_executePendingInitializations` 內部邏輯會等待）。
 * 3. 為翻譯模型選擇器 (`#translationModel`) 綁定 `change` 事件監聽器：
 *    - 當選擇變化時，呼叫 `window.ui.handleCustomModelSelection` 更新相關 UI。
 *    - (註釋中提及) `saveCurrentSettings` 應由 `app.js` 處理，以避免邏輯衝突。
 * 4. (註釋中提及) 初始的自定義模型檢查和 UI 更新會由 `initializeAllUI_internal` 透過 `onReady` 流程處理，
 *    此處不再直接觸發 `handleCustomModelSelection`。
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('DEBUG index.js: DOMContentLoaded event fired.');
    _domReady = true;
    // 嘗試執行初始化。如果模組尚未全部註冊，_executePendingInitializations 內部會等待。
    if (typeof _executePendingInitializations === 'function') {
        _executePendingInitializations();
    } else {
        console.error('DEBUG index.js: _executePendingInitializations is not defined at DOMContentLoaded!');
    }

    // 為翻譯模型選擇器綁定事件 (如果存在)
    const translationModelSelect = document.getElementById('translationModel');
    if (translationModelSelect) {
        console.log("DEBUG index.js: Found translation model selector, adding change event listener.");
        translationModelSelect.addEventListener('change', function() {
            const selectedValue = this.value;
            console.log(`DEBUG index.js: Translation model changed to: ${selectedValue}`);

            // 先儲存設定
            if (typeof saveCurrentSettings === 'function') {
                saveCurrentSettings();
                console.log("DEBUG index.js: Settings saved after translation model change.");
            } else {
                console.warn("DEBUG index.js: saveCurrentSettings function not found.");
            }

            // 呼叫 handleCustomModelSelection 來處理UI聯動，它內部會呼叫 updateTranslationUIVisibility
            if (typeof window.ui.handleCustomModelSelection === 'function') {
                window.ui.handleCustomModelSelection();
            } else {
                 console.warn('DEBUG index.js: window.ui.handleCustomModelSelection function not available during translation model change.');
                 // Fallback: direct call if handleCustomModelSelection is missing
                 if (typeof window.ui.updateTranslationUIVisibility === 'function') {
                    window.ui.updateTranslationUIVisibility(selectedValue === 'custom');
                } else {
                    console.warn('DEBUG index.js: updateTranslationUIVisibility function also not available on window.ui during translation model change (fallback).');
                }
            }

            // 觸發驗證狀態更新（在設定儲存後）- 直接呼叫全域重新整理函式
            if (typeof window.refreshValidationState === 'function') {
                setTimeout(() => {
                    console.log('[DEBUG] Triggering refreshValidationState after settings save');
                    window.refreshValidationState();
                }, 100);
            } else {
                console.warn('[DEBUG] window.refreshValidationState not available');
            }
        });

        // 觸發一次初始檢查，以防頁面載入時已選擇了 "custom"
        // 這將由 initializeAllUI_internal -> onReady -> _executePendingInitializations -> initializeAllUI_internal 處理
        // if (typeof window.ui.handleCustomModelSelection === 'function') {
        //    console.log("DEBUG index.js: Triggering initial handleCustomModelSelection check post DOMContentLoaded and listener setup.");
        //    // window.ui.handleCustomModelSelection(); // Avoid direct call, let initialization flow handle it.
        // }

    } else {
        console.warn("DEBUG index.js: Translation model select element not found after DOMContentLoaded.");
    }
});

console.log("DEBUG index.js: End of script. Waiting for module registrations and DOMContentLoaded.");
