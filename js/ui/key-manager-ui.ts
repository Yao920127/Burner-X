/**
 * KeyManagerUI 類負責渲染和管理單個模型的 API Key 池。
 *
 * 主要功能：
 *  - 渲染 API Key 的增刪改查介面。
 *  - 支援批次匯入/匯出特定模型或所有模型的 Key 配置。
 *  - 支援 Key 的優先順序調整（上移/下移）、狀態標記（untested, testing, valid, invalid）、備註編輯。
 *  - 提供"全部測試"、"單個測試"的 UI 入口，透過回撥與外部測試邏輯互動。
 *  - 支援自定義源站點模型的友好顯示名稱。
 *  - 從 localStorage 載入和儲存 Key 資料，並能響應外部對上次成功使用 Key 的記錄。
 *
 * 設計說明：
 *  - 該類主要關注 UI 的構建和使用者互動，實際的 Key 儲存、載入和測試邏輯透過建構函式中傳遞的回撥函式與外部模組（如 app.js, storage.js, api.js）解耦。
 *  - 每個 KeyManagerUI 例項管理一個特定模型（`modelName`）的 Key 池。
 *  - UI 元素動態建立，支援響應式更新（例如，Key 狀態變化後僅更新對應條目）。
 *
 * @param {string} modelName - 當前 KeyManagerUI 例項管理的模型名稱 (例如 'mistral', 'deepseek', 'custom_source_abcdef123')。
 * @param {HTMLElement} containerElement - Key 池 UI 將被渲染到的父級 DOM 容器元素。
 * @param {function(string, Object): Promise<void>} onTestKey - 測試單個 Key 的非同步回撥函式。
 *   接收 `modelName` (string) 和 `keyObject` (Object) 作為引數。
 * @param {function(string, Array<Object>): Promise<void>} onTestAllKeys - 測試當前模型所有 Key 的非同步回撥函式。
 *   接收 `modelName` (string) 和 `keysArray` (Array<Object>) 作為引數。
 * @param {function(string): Array<Object>} loadKeysFunction - 載入指定模型 Key 列表的函式。
 *   接收 `modelName` (string) 作為引數，應返回一個 Key 物件陣列。
 * @param {function(string, Array<Object>): void} saveKeysFunction - 儲存指定模型 Key 列表的函式。
 *   接收 `modelName` (string) 和 `keysArray` (Array<Object>) 作為引數。
 */
const LAST_SUCCESSFUL_KEYS_LS_KEY_FOR_UI = 'paperBurnerLastSuccessfulKeys'; // 與 app.js 中保持一致

class KeyManagerUI {
    /**
     * 建構函式：初始化 KeyManagerUI 例項。
     *
     * 主要步驟:
     * 1. 儲存傳入的引數（模型名、容器元素、回撥函式等）到例項屬性。
     * 2. 呼叫 `loadKeysFunction` 載入當前模型的 Key 資料，如果不存在則初始化為空陣列。
     * 3. 從 localStorage 讀取當前模型上次成功使用的 Key ID (如果有記錄的話)，用於 UI 醒目提示顯示。
     * 4. 呼叫 `render` 方法，首次渲染 Key 管理介面。
     *
     * @param {string} modelName - 當前管理的模型名稱 (e.g., 'mistral', 'custom')。
     * @param {HTMLElement} containerElement - Key 池 UI 將被渲染到的 DOM 容器元素。
     * @param {function(string, Object)} onTestKey - 測試單個 Key 的回撥函式 (引數: modelName, keyObject)。
     * @param {function(string, Array<Object>)} onTestAllKeys - 測試當前模型所有 Key 的回撥 (引數: modelName, keysArray)。
     * @param {function(string): Array<Object>} loadKeysFunction - 載入指定模型 Key 的函式。
     * @param {function(string, Array<Object>)} saveKeysFunction - 儲存指定模型 Key 的函式。
     */
    constructor(modelName, containerElement, onTestKey, onTestAllKeys, loadKeysFunction, saveKeysFunction) {
        this.modelName = modelName;
        this.containerElement = containerElement;
        this.onTestKey = onTestKey; // Callback to initiate testing for a single key
        this.onTestAllKeys = onTestAllKeys; // Callback to initiate testing for all keys
        this.loadKeys = loadKeysFunction;
        this.saveKeys = saveKeysFunction;

        this.keys = this.loadKeys(this.modelName) || [];
        // 讀取當前模型上次成功使用的 Key ID
        try {
            const records = JSON.parse(localStorage.getItem(LAST_SUCCESSFUL_KEYS_LS_KEY_FOR_UI) || '{}');
            this.lastSuccessfulKeyId = records[this.modelName] || null;
        } catch (e) {
            console.error('KeyManagerUI: Failed to get last successful key ID for model ' + this.modelName, e);
            this.lastSuccessfulKeyId = null;
        }
        this.render();
    }

    /**
     * 重新載入指定模型的 Key 資料並完全重新渲染 Key 列表 UI。
     * 當外部資料來源（例如 localStorage 中的 Key 列表）發生變化，且需要 KeyManagerUI
     * 例項更新其顯示時，可以呼叫此方法。
     *
     * 主要步驟:
     * 1. 呼叫 `this.loadKeys` (即構造時傳入的 `loadKeysFunction`) 重新獲取當前模型的 Key 列表。
     * 2. 呼叫 `this.render()` 方法，用最新的 Key 資料徹底重建 UI。
     */
    refreshKeys() {
        this.keys = this.loadKeys(this.modelName) || [];
        this.render();
    }

    /**
     * 渲染整個 Key 池 UI 到指定的容器元素中。
     * 此方法會先清空容器，然後逐步構建並新增以下區域：
     *  - 按鈕操作區：包含"全部測試"、"匯出配置"、"匯入配置"以及"新增新 Key"的觸發按鈕。
     *  - 新增新 Key 輸入區（初始隱藏）：提供文字域批次輸入新 Key 及備註。
     *  - Key 列表區：如果存在 Key，則走訪 `this.keys` 陣列，為每個 Key 物件呼叫 `_createKeyItemElement` 生成對應的 UI 條目並新增到列表中；如果不存在 Key，則顯示提示資訊。
     *
     * 此方法是 UI 更新的核心，當 Key 列表發生較大變化（如增刪、匯入）或需要強制重新整理時被呼叫。
     */
    render() {
        this.containerElement.innerHTML = ''; // 清空容器

        // Create a header for buttons
        const buttonHeader = document.createElement('div');
        buttonHeader.className = 'flex items-center justify-between mb-3'; // Use flex to align items

        const leftButtons = document.createElement('div');
        leftButtons.className = 'flex items-center space-x-2';

        // 2. "全部測試"按鈕 (如果存在Key)
        if (this.keys.length > 0) {
            const testAllButton = document.createElement('button');
            testAllButton.innerHTML = '<iconify-icon icon="carbon:chemistry" class="mr-1"></iconify-icon>全部測試';
            testAllButton.className = 'px-2.5 py-1 text-xs rounded-md border border-slate-200 hover:border-blue-300 text-slate-600 transition-colors flex items-center';
            testAllButton.addEventListener('click', () => {
                if (this.onTestAllKeys) {
                    this.onTestAllKeys(this.modelName, this.keys);
                }
            });
            leftButtons.appendChild(testAllButton);
        }

        // 匯出配置按鈕
        const exportButton = document.createElement('button');
        exportButton.innerHTML = '<iconify-icon icon="carbon:export" class="mr-1"></iconify-icon>匯出配置';
        exportButton.className = 'px-2.5 py-1 text-xs rounded-md border border-slate-200 hover:border-blue-300 text-slate-600 transition-colors flex items-center';
        exportButton.addEventListener('click', () => {
            this._exportKeys();
        });
        leftButtons.appendChild(exportButton);

        // 匯入配置按鈕
        const importButton = document.createElement('button');
        importButton.innerHTML = '<iconify-icon icon="carbon:import" class="mr-1"></iconify-icon>匯入配置';
        importButton.className = 'px-2.5 py-1 text-xs rounded-md border border-slate-200 hover:border-blue-300 text-slate-600 transition-colors flex items-center';
        importButton.addEventListener('click', () => {
            this._importKeys();
        });
        leftButtons.appendChild(importButton);

        buttonHeader.appendChild(leftButtons);

        // "Add New Key" button (plus icon)
        const addNewKeyButton = document.createElement('button');
        addNewKeyButton.innerHTML = '<iconify-icon icon="carbon:add" width="14"></iconify-icon><span class="ml-1">新增新 Key</span>';
        addNewKeyButton.title = '新增新的 API Key';
        addNewKeyButton.className = 'px-2.5 py-1 text-xs rounded-md border border-slate-200 hover:border-green-400 text-green-600 transition-colors flex items-center';
        buttonHeader.appendChild(addNewKeyButton); // Add to the right part of the header

        this.containerElement.appendChild(buttonHeader);

        const importExportHint = document.createElement('p');
        importExportHint.className = 'text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2 mb-3 flex items-center gap-2';
        importExportHint.innerHTML = '<iconify-icon icon="carbon:information" width="14"></iconify-icon><span>匯入/匯出的配置檔案採用 Paper Burner X 固定格式 JSON，請勿修改欄位結構。</span>';
        this.containerElement.appendChild(importExportHint);

        // 1. "新增新 Key"區域 (initially hidden)
        const addKeySection = this._createAddKeySection();
        addKeySection.style.display = 'none'; // Initially hidden
        this.containerElement.appendChild(addKeySection);

        addNewKeyButton.addEventListener('click', () => {
            addKeySection.style.display = addKeySection.style.display === 'none' ? 'block' : 'none';
        });

        // 3. Key 列表區域
        const keyListContainer = document.createElement('div');
        keyListContainer.className = 'space-y-3';

        if (this.keys.length === 0) {
            const noKeysMessage = document.createElement('p');
            noKeysMessage.textContent = `${this.modelName} 當前沒有已儲存的 API Key。`;
            noKeysMessage.className = 'text-sm text-gray-500';
            keyListContainer.appendChild(noKeysMessage);
        } else {
            this.keys.forEach((keyObj, index) => {
                const keyItemElement = this._createKeyItemElement(keyObj, index);
                keyListContainer.appendChild(keyItemElement);
            });
        }
        this.containerElement.appendChild(keyListContainer);
    }

    /**
     * 建立"新增新 Key"區域的 DOM 結構。
     * 該區域允許使用者輸入一個或多個 API Key（透過文字域，每行一個 Key 被視為一個獨立的 Key），
     * 併為這些 Key 新增一個統一的備註。
     *
     * DOM 結構包括:
     * - 區域標題 (根據 `this.modelName` 動態生成，對自定義源站點有特殊顯示)。
     * - 一個 `textarea` 用於輸入 Key 值(支援批次)。
     * - 一個 `input[type=text]` 用於輸入備註。
     * - 一個"新增 Key(s)"按鈕，點選後會處理輸入、呼叫 `_addKey` 方法，並清空輸入欄位。
     *
     * @returns {HTMLElement} 包含新增新 Key 表單元素的 `div` 容器。
     * @private
     */
    _createAddKeySection() {
        const section = document.createElement('div');
        section.className = 'mb-4 p-3 border rounded-md bg-gray-50';

        const title = document.createElement('h4');
        let titleText = `為 ${this.modelName} 新增新的 API Key`;
        if (this.modelName && this.modelName.startsWith('custom_source_')) {
            try {
                const sourceSiteId = this.modelName.replace('custom_source_', '');
                if (typeof window.loadAllCustomSourceSites === 'function') {
                    const sites = window.loadAllCustomSourceSites();
                    const site = sites[sourceSiteId];
                    if (site && site.displayName) {
                        titleText = `為 "${site.displayName}" 新增新的 API Key`;
                    } else {
                        titleText = `為源站點 (ID: ...${sourceSiteId.slice(-8)}) 新增新的 API Key`;
                    }
                }
            } catch (e) {
                console.error("Error getting display name for custom source in KeyManagerUI:", e);
            }
        }
        title.textContent = titleText;
        title.className = 'text-md font-semibold mb-2 text-gray-700';
        section.appendChild(title);

        // 將 valueInput 從 input 改為 textarea 以支援批次輸入
        const valueTextarea = document.createElement('textarea');
        valueTextarea.rows = 3;
        valueTextarea.placeholder = 'API Key 值 (可每行輸入一個實現批次新增)';
        valueTextarea.className = 'w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm focus:ring-blue-500 focus:border-blue-500';

        const remarkInput = document.createElement('input');
        remarkInput.type = 'text';
        remarkInput.placeholder = '備註 (可選, 應用於本批次所有Key)';
        remarkInput.className = 'w-full px-3 py-2 border border-gray-300 rounded-md mb-2 text-sm focus:ring-blue-500 focus:border-blue-500';

        const addButton = document.createElement('button');
        addButton.innerHTML = '<iconify-icon icon="carbon:add" class="mr-1"></iconify-icon>新增 Key(s)';
        addButton.className = 'px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm transition-colors flex items-center';

        addButton.addEventListener('click', () => {
            const rawValues = valueTextarea.value.trim();
            const remark = remarkInput.value.trim();

            if (rawValues) {
                const individualKeyValues = rawValues.replace(/,/g, '\n').split('\n').map(k => k.trim()).filter(k => k !== '');
                if (individualKeyValues.length > 0) {
                    individualKeyValues.forEach(keyValue => {
                        this._addKey(keyValue, remark);
                    });
                    valueTextarea.value = ''; // 清空文字域
                    remarkInput.value = '';   // 清空備註

                    // 獲取模型顯示名稱用於通知
                    let modelDisplayNameForNotification = this.modelName;
                    if (this.modelName && this.modelName.startsWith('custom_source_')) {
                        try {
                            const sourceSiteId = this.modelName.replace('custom_source_', '');
                            if (typeof window.loadAllCustomSourceSites === 'function') {
                                const sites = window.loadAllCustomSourceSites();
                                const site = sites[sourceSiteId];
                                if (site && site.displayName) {
                                    modelDisplayNameForNotification = `"${site.displayName}"`;
                                } else {
                                    modelDisplayNameForNotification = `源站點 (ID: ...${sourceSiteId.slice(-8)})`;
                                }
                            }
                        } catch (e) { /* 保持 this.modelName 作為 fallback */ }
                    }

                    if (typeof showNotification === 'function') {
                        showNotification(`${individualKeyValues.length} 個 Key 已為 ${modelDisplayNameForNotification} 新增`, 'success', 3000);
                    }
                } else {
                    alert('請輸入至少一個有效的 API Key 值！');
                }
            } else {
                alert('API Key 值不能為空！');
            }
        });

        section.appendChild(valueTextarea); // 修改為 textarea
        section.appendChild(remarkInput);
        section.appendChild(addButton);
        return section;
    }

    /**
     * 為單個 Key 物件建立並返回其在列表中的 DOM 元素表示。
     * 每個 Key 條目 UI 包含以下部分：
     *  - Key 值顯示：預設部分隱藏，點選可切換完整顯示/隱藏。旁邊可能會有"上次成功使用"的星形圖示。
     *  - 狀態指示器：顯示 Key 的當前狀態 (untested, testing, valid, invalid)，並根據狀態應用不同樣式。
     *  - 備註輸入欄位：允許使用者編輯和檢視 Key 的備註。
     *  - 操作按鈕區：
     *    - 上移/下移按鈕：調整 Key 在列表中的順序（優先順序）。
     *    - 測試按鈕：觸發 `onTestKey` 回撥以測試當前 Key。
     *    - 刪除按鈕：呼叫 `_deleteKey` 方法刪除當前 Key。
     *
     * @param {Object} keyObj - 要渲染的 Key 物件。應包含 `id`, `value`, `remark`, `status`, `order` 屬性。
     * @param {number} index - Key 物件在 `this.keys` 陣列中的當前索引，用於判斷是否禁用上移/下移按鈕。
     * @returns {HTMLElement} 代表單個 Key 條目的 `div` 元素。
     * @private
     */
    _createKeyItemElement(keyObj, index) {
        const item = document.createElement('div');
        item.className = 'p-3 border rounded-md shadow-sm bg-white flex flex-col space-y-2';
        item.dataset.keyId = keyObj.id;

        // Key 值顯示與操作
        const valueContainer = document.createElement('div');
        valueContainer.className = 'flex items-center justify-between';

        const valueDisplayGroup = document.createElement('div'); // 新增: 用於組合 key value 和 last used 圖示
        valueDisplayGroup.className = 'flex items-center flex-grow mr-2';

        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'text-sm font-mono cursor-pointer text-gray-700 hover:underline';
        const maskedValue = keyObj.value.length > 8 ? `${keyObj.value.substring(0, 4)}...${keyObj.value.substring(keyObj.value.length - 4)}` : keyObj.value;
        valueDisplay.textContent = maskedValue;
        valueDisplay.title = '點選顯示/隱藏完整 Key';
        let isValueVisible = false;
        valueDisplay.addEventListener('click', () => {
            isValueVisible = !isValueVisible;
            valueDisplay.textContent = isValueVisible ? keyObj.value : maskedValue;
        });
        valueDisplayGroup.appendChild(valueDisplay);

        // 檢查並新增"上次成功使用"圖示
        if (keyObj.id === this.lastSuccessfulKeyId) {
            const lastUsedIcon = document.createElement('iconify-icon');
            lastUsedIcon.setAttribute('icon', 'carbon:star-filled');
            lastUsedIcon.className = 'text-yellow-500 ml-1.5 flex-shrink-0'; // 調整了ml-1到ml-1.5
            lastUsedIcon.title = '此 Key 上次成功使用';
            lastUsedIcon.setAttribute('width', '14'); // 稍微小一點
            lastUsedIcon.setAttribute('height', '14');
            valueDisplayGroup.appendChild(lastUsedIcon);
        }

        // 狀態指示器
        const statusIndicator = document.createElement('span');
        statusIndicator.className = 'text-xs px-2 py-0.5 rounded-full ml-2 font-medium key-status-indicator flex-shrink-0'; // 新增 flex-shrink-0
        this._updateKeyStatusIndicator(statusIndicator, keyObj.status);

        valueContainer.appendChild(valueDisplayGroup); // 新增組合元素
        valueContainer.appendChild(statusIndicator);
        item.appendChild(valueContainer);

        // 備註輸入欄位
        const remarkInput = document.createElement('input');
        remarkInput.type = 'text';
        remarkInput.value = keyObj.remark || '';
        remarkInput.placeholder = '新增備註...';
        remarkInput.className = 'w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-blue-500 focus:border-blue-500';
        remarkInput.addEventListener('change', (e) => {
            this._updateRemark(keyObj.id, e.target.value);
        });
        item.appendChild(remarkInput);


        // 操作按鈕區域
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'flex items-center space-x-2 mt-1 pt-2 border-t border-gray-200';

        const upButton = document.createElement('button');
        upButton.innerHTML = '<iconify-icon icon="carbon:arrow-up" width="16"></iconify-icon>';
        upButton.title = '上移 (提高優先順序)';
        upButton.className = 'p-1 text-gray-500 hover:text-blue-600 disabled:opacity-50';
        upButton.disabled = index === 0;
        upButton.addEventListener('click', () => this._moveKey(index, -1));

        const downButton = document.createElement('button');
        downButton.innerHTML = '<iconify-icon icon="carbon:arrow-down" width="16"></iconify-icon>';
        downButton.title = '下移 (降低優先順序)';
        downButton.className = 'p-1 text-gray-500 hover:text-blue-600 disabled:opacity-50';
        downButton.disabled = index === this.keys.length - 1;
        downButton.addEventListener('click', () => this._moveKey(index, 1));

        const testButton = document.createElement('button');
        testButton.innerHTML = '<iconify-icon icon="carbon:play-outline" width="16"></iconify-icon>';
        testButton.title = '測試此 Key';
        testButton.className = 'p-1 text-gray-500 hover:text-green-600';
        testButton.addEventListener('click', () => {
            if (this.onTestKey) {
                this.onTestKey(this.modelName, keyObj);
            }
        });

        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<iconify-icon icon="carbon:trash-can" width="16"></iconify-icon>';
        deleteButton.title = '刪除此 Key';
        deleteButton.className = 'p-1 text-gray-500 hover:text-red-600';
        deleteButton.addEventListener('click', () => this._deleteKey(keyObj.id));

        actionsContainer.appendChild(upButton);
        actionsContainer.appendChild(downButton);
        actionsContainer.appendChild(document.createTextNode(' ')); // 小間隔
        actionsContainer.appendChild(testButton);
        actionsContainer.appendChild(deleteButton);
        item.appendChild(actionsContainer);

        return item;
    }

     /**
     * 更新 Key 狀態的視覺指示器（DOM 元素）的樣式和內容。
     * 根據傳入的 `status`，此方法會修改 `indicatorElement` 的文字內容和 CSS 類名，
     * 以便直觀地展示 Key 的當前狀態。
     *
     * 支援的狀態及其對應樣式:
     * - `valid`: 綠色背景，表示 Key 有效。
     * - `invalid`: 紅色背景，表示 Key 無效。
     * - `testing`: 黃色背景，並顯示一個旋轉圖示，表示 Key 正在測試中。
     * - `untested` (或任何其他未知狀態): 灰色背景，表示 Key 尚未測試。
     *
     * @param {HTMLElement} indicatorElement - 要更新的狀態指示器 DOM 元素 (通常是一個 `<span>`)。
     * @param {string} status - Key 的當前狀態字串 (e.g., 'valid', 'invalid', 'testing', 'untested')。
     * @private
     */
    _updateKeyStatusIndicator(indicatorElement, status) {
        const labelMap = {
            valid: '可用',
            invalid: '不可用',
            testing: '檢測中',
            untested: '未測試'
        };
        const normalized = (status || 'untested').toLowerCase();
        const label = labelMap[normalized] || labelMap.untested;
        indicatorElement.textContent = label;
        switch (status) {
            case 'valid':
                indicatorElement.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700';
                break;
            case 'invalid':
                indicatorElement.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700';
                break;
            case 'testing':
                indicatorElement.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 flex items-center gap-1';
                indicatorElement.innerHTML = '<iconify-icon icon="carbon:circle-dash" class="animate-spin" ></iconify-icon><span>檢測中</span>';
                break;
            case 'untested':
            default:
                indicatorElement.className = 'text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600';
                indicatorElement.textContent = label;
                break;
        }
    }


    /**
     * 向當前模型的 Key 池中新增一個新的 Key 物件。
     * 新 Key 將具有一個唯一生成的 ID (`_generateUUID`)，初始狀態為 'untested'，
     * `order` 屬性根據其在陣列中的位置（末尾）設定。
     * 新增後，會呼叫 `saveKeys` 儲存更新後的 Key 列表，並呼叫 `render` 重新整理整個 UI。
     *
     * @param {string} value - 新 Key 的 API Key 字串值。
     * @param {string} remark - 新 Key 的備註資訊（可選）。
     * @private
     */
    _addKey(value, remark) {
        const newKey = {
            id: this._generateUUID(), // 需要一個 UUID 生成器
            value: value,
            remark: remark,
            status: 'untested',
            order: this.keys.length // 新增到末尾
        };
        this.keys.push(newKey);
        this.saveKeys(this.modelName, this.keys);
        this.render(); // 重新渲染以顯示新 Key
    }

    /**
     * 從當前模型的 Key 池中刪除具有指定 ID 的 Key。
     * 刪除後，會重新計算剩餘 Key 的 `order` 屬性以保持連續性，
     * 然後呼叫 `saveKeys` 儲存更改，並呼叫 `render` 重新整理 UI。
     *
     * @param {string} keyId - 要刪除的 Key 物件的 `id` 屬性。
     * @private
     */
    _deleteKey(keyId) {
        this.keys = this.keys.filter(key => key.id !== keyId);
        // 重新計算 order
        this.keys.forEach((key, index) => key.order = index);
        this.saveKeys(this.modelName, this.keys);
        this.render();
    }

    /**
     * 更新具有指定 ID 的 Key 物件的備註資訊。
     * 找到對應的 Key 物件後，修改其 `remark` 屬性，並呼叫 `saveKeys` 儲存更改。
     * 此操作通常不會觸發完整的 UI `render`，除非備註的顯示非常複雜。
     * （當前實現中，由於輸入欄位直接綁定，可能不需要顯式 UI 更新，但儲存是必要的。）
     *
     * @param {string} keyId - 要更新備註的 Key 物件的 `id` 屬性。
     * @param {string} newRemark - 新的備註文字。
     * @private
     */
    _updateRemark(keyId, newRemark) {
        const key = this.keys.find(k => k.id === keyId);
        if (key) {
            key.remark = newRemark;
            this.saveKeys(this.modelName, this.keys);
            // 不需要完全重新渲染，但如果備註顯示區域複雜則可能需要
        }
    }

    /**
     * 調整指定索引處的 Key 在列表中的順序（即優先順序）。
     * 根據 `direction` 引數，將 Key 向上或向下移動一位。
     * 實現方式是透過交換目標 Key 與相鄰 Key 的 `order` 屬性值，
     * 然後對整個 `this.keys` 陣列按 `order` 重新排序。
     * 操作完成後，呼叫 `saveKeys` 儲存更改，並呼叫 `render` 重新整理 UI。
     *
     * @param {number} index - 要移動的 Key 在 `this.keys` 陣列中的當前索引。
     * @param {number} direction - 移動方向：-1 表示上移（提高優先順序），1 表示下移（降低優先順序）。
     * @private
     */
    _moveKey(index, direction) {
        if (direction === -1 && index === 0) return; // 不能將第一個元素上移
        if (direction === 1 && index === this.keys.length - 1) return; // 不能將最後一個元素下移

        const targetIndex = index + direction;
        const keyToMove = this.keys[index];

        // 交換 order 值
        const tempOrder = this.keys[targetIndex].order;
        this.keys[targetIndex].order = keyToMove.order;
        keyToMove.order = tempOrder;

        // 根據 order 重新排序陣列
        this.keys.sort((a, b) => a.order - b.order);

        this.saveKeys(this.modelName, this.keys);
        this.render();
    }

    /**
     * 更新具有指定 ID 的 Key 物件的狀態，並相應地重新整理其在 UI 中的狀態指示器。
     * 此方法旨在實現更細粒度的 UI 更新：當 Key 狀態改變時，
     * 它會嘗試只更新該 Key 對應條目中的狀態指示器部分，而不是重新渲染整個列表，以提高效能。
     * 如果找不到對應的 DOM 元素，則會回退到完整的 `render` 呼叫。
     * 狀態更改後會呼叫 `saveKeys` 儲存。
     *
     * @param {string} keyId - 要更新狀態的 Key 物件的 `id` 屬性。
     * @param {string} newStatus - Key 的新狀態 (e.g., 'untested', 'valid', 'invalid', 'testing')。
     */
    updateKeyStatus(keyId, newStatus) {
        const key = this.keys.find(k => k.id === keyId);
        if (key) {
            key.status = newStatus;
            this.saveKeys(this.modelName, this.keys); // 儲存狀態變更

            // 最佳化：只更新特定 key item 的狀態顯示，而不是整個列表
            const keyItemElement = this.containerElement.querySelector(`div[data-key-id="${keyId}"]`);
            if (keyItemElement) {
                const statusIndicator = keyItemElement.querySelector('.key-status-indicator');
                if (statusIndicator) {
                    this._updateKeyStatusIndicator(statusIndicator, newStatus);
                }
            } else {
                 this.render(); // 如果找不到元素，回退到完整渲染
            }
        }
    }


    /**
     * 生成一個符合 RFC4122 version 4 的 UUID (Universally Unique Identifier)。
     * 優先嚐試使用全域作用域下可能已定義的 `generateUUID` 函式 (例如由 `storage.js` 提供)。
     * 如果全域函式不可用，則使用一個內建的回退演算法生成一個隨機的 UUID 字串。
     *
     * @returns {string} 生成的 UUID 字串，格式如 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'。
     * @private
     */
    _generateUUID() {
        // 嘗試使用全域的 generateUUID (如果已在 storage.js 中定義並掛載到 window 或透過模組匯入)
        if (typeof generateUUID === 'function') {
            return generateUUID();
        }
        // Fallback UUID generator
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 將當前模型 (`this.modelName`) 的所有 Key 配置匯出為一個 JSON 檔案。
     * JSON 檔案內容是 `this.keys` 陣列的字串表示。
     * 檔名格式為 `<modelName>-keys.json`。
     * 透過動態建立 `<a>` 標籤並模擬點選來實現瀏覽器下載。
     * 匯出成功後會嘗試顯示一個通知（如果 `showNotification` 函式可用）。
     *
     * @private
     */
    _exportKeys() {
        const dataStr = JSON.stringify(this.keys, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.modelName}-keys.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
        if (typeof showNotification === 'function') {
            showNotification('Key 配置已匯出', 'success', 2000);
        }
    }

    /**
     * 匯入 Key 配置（覆蓋當前模型的 Key）。
     * 支援格式校驗與錯誤提示。
     *
     * 檔案內容需為 Key 物件陣列。
     */
    _importKeys() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedKeys = JSON.parse(e.target.result);
                    if (!Array.isArray(importedKeys)) throw new Error('格式錯誤');
                    // 簡單校驗每個 key
                    for (const k of importedKeys) {
                        if (typeof k.id !== 'string' || typeof k.value !== 'string') {
                            throw new Error('Key 資料缺失 id 或 value 欄位');
                        }
                    }
                    this.keys = importedKeys;
                    this.saveKeys(this.modelName, this.keys);
                    this.render();
                    if (typeof showNotification === 'function') {
                        showNotification('Key 配置已匯入並覆蓋', 'success', 2000);
                    }
                } catch (err) {
                    alert('匯入失敗：' + err.message);
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }
}

// 如果希望在全域訪問（例如直接在 <script> 標籤中使用），可以取消下一行的註釋
window.KeyManagerUI = KeyManagerUI;

KeyManagerUI.exportAllModelKeys = function(loadKeysFunc) {
    // 獲取所有模型名
    let allModelNames = [];
    try {
        const raw = localStorage.getItem('translationModelKeys');
        if (raw) allModelNames = Object.keys(JSON.parse(raw));
    } catch {}
    // 組裝匯出物件
    const allKeys = {};
    allModelNames.forEach(model => {
        allKeys[model] = (typeof loadKeysFunc === 'function' ? loadKeysFunc(model) : []);
    });
    // 匯出為 JSON
    const dataStr = JSON.stringify(allKeys, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-model-keys.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
    if (typeof showNotification === 'function') {
        showNotification('所有模型 Key 配置已匯出', 'success', 2000);
    }
};

KeyManagerUI.importAllModelKeys = function(saveKeysFunc, refreshUIFunc) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error('格式錯誤');
                for (const model in imported) {
                    if (!Array.isArray(imported[model])) throw new Error(`模型 ${model} 的 Key 列表格式錯誤`);
                    if (typeof saveKeysFunc === 'function') saveKeysFunc(model, imported[model]);
                }
                if (typeof refreshUIFunc === 'function') refreshUIFunc();
                if (typeof showNotification === 'function') {
                    showNotification('所有模型 Key 配置已匯入並覆蓋', 'success', 2000);
                }
            } catch (err) {
                alert('匯入失敗：' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

KeyManagerUI.exportAllModelData = function() {
    // 僅匯出新版規範欄位，保持"乾淨"
    const translationModelKeys = JSON.parse(localStorage.getItem('translationModelKeys') || '{}');
    const translationModelConfigs = JSON.parse(localStorage.getItem('translationModelConfigs') || '{}');
    const paperBurnerCustomSourceSites = JSON.parse(localStorage.getItem('paperBurnerCustomSourceSites') || '{}');
    const embeddingConfig = JSON.parse(localStorage.getItem('embeddingConfig') || 'null');
    const rerankConfig = JSON.parse(localStorage.getItem('rerankConfig') || 'null');

    // 新增 OCR 配置匯出
    const ocrConfig = {
        engine: localStorage.getItem('ocrEngine') || 'mistral',
        mistralKeys: localStorage.getItem('ocrMistralKeys') || '',
        workerAuthKey: localStorage.getItem('ocrWorkerAuthKey') || '',
        mineruToken: localStorage.getItem('ocrMinerUToken') || '',
        mineruWorkerUrl: localStorage.getItem('ocrMinerUWorkerUrl') || '',
        mineruTokenMode: localStorage.getItem('ocrMinerUTokenMode') || 'frontend',
        mineruEnableOcr: localStorage.getItem('ocrMinerUEnableOcr') || 'true',
        mineruEnableFormula: localStorage.getItem('ocrMinerUEnableFormula') || 'true',
        mineruEnableTable: localStorage.getItem('ocrMinerUEnableTable') || 'true',
        doc2xToken: localStorage.getItem('ocrDoc2XToken') || '',
        doc2xWorkerUrl: localStorage.getItem('ocrDoc2XWorkerUrl') || '',
        doc2xTokenMode: localStorage.getItem('ocrDoc2XTokenMode') || 'frontend'
    };

    // 新增學術搜尋與代理配置匯出
    const academicSearchConfig = JSON.parse(localStorage.getItem('academicSearchProxyConfig') || 'null');
    const academicSearchSourcesConfig = JSON.parse(localStorage.getItem('academicSearchSourcesConfig') || 'null');

    const data = {
        translationModelKeys,
        translationModelConfigs,
        paperBurnerCustomSourceSites,
        embeddingConfig,
        rerankConfig,
        ocrConfig,  // OCR 配置
        academicSearchConfig,  // 學術搜尋與代理配置
        academicSearchSourcesConfig  // 學術搜尋源配置
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-model-data.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
    if (typeof showNotification === 'function') {
        showNotification('所有模型配置和Key已匯出', 'success', 2000);
    }
};

KeyManagerUI.importAllModelData = function(refreshUIFunc) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);

                // 1) 容錯提取不同歷史欄位名
                let importedModelKeys = imported.modelKeys
                    || imported.translationModelKeys
                    || imported.keys
                    || imported.keyStore
                    || {};
                let importedModelConfigs = imported.modelConfigs
                    || imported.translationModelConfigs
                    || imported.configs
                    || imported.modelConfig
                    || {};
                let importedCustomSourceSites = imported.customSourceSites
                    || imported.paperBurnerCustomSourceSites
                    || imported.customSites
                    || imported.sourceSites
                    || {};
                let importedEmbeddingConfig = imported.embeddingConfig || null;
                let importedRerankConfig = imported.rerankConfig || imported.rerank || null;

                // 2) 歸一化 modelKeys（陣列項可為字串或物件）
                const genUUID = (function(){
                    if (typeof generateUUID === 'function') return generateUUID;
                    return function(){
                        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                    }
                })();

                const normalizedModelKeys = {};
                if (typeof importedModelKeys === 'object' && importedModelKeys) {
                    Object.keys(importedModelKeys).forEach(modelName => {
                        const arr = Array.isArray(importedModelKeys[modelName]) ? importedModelKeys[modelName] : [];
                        const normArr = arr.map((item, idx) => {
                            if (typeof item === 'string') {
                                return { id: genUUID(), value: item, remark: '', status: 'untested', order: idx };
                            } else if (item && typeof item === 'object') {
                                const value = (typeof item.value === 'string' && item.value) ? item.value
                                              : (typeof item.key === 'string' ? item.key : '');
                                return {
                                    id: typeof item.id === 'string' && item.id ? item.id : genUUID(),
                                    value,
                                    remark: typeof item.remark === 'string' ? item.remark : (item.note || ''),
                                    status: typeof item.status === 'string' ? item.status : 'untested',
                                    order: typeof item.order === 'number' ? item.order : idx
                                };
                            } else {
                                return null;
                            }
                        }).filter(Boolean);
                        normalizedModelKeys[modelName] = normArr;
                    });
                }

                // 3) 歸一化 modelConfigs（確保為物件）
                const normalizedModelConfigs = (typeof importedModelConfigs === 'object' && importedModelConfigs) ? importedModelConfigs : {};

                // 4) 歸一化 customSourceSites：支援物件或陣列
                let normalizedCustomSourceSites = {};
                if (Array.isArray(importedCustomSourceSites)) {
                    importedCustomSourceSites.forEach((site, idx) => {
                        if (!site || typeof site !== 'object') return;
                        const id = (typeof site.id === 'string' && site.id) ? site.id : genUUID();
                        normalizedCustomSourceSites[id] = {
                            id,
                            displayName: site.displayName || site.name || `自定義源站 ${idx+1}`,
                            apiBaseUrl: site.apiBaseUrl || site.baseUrl || site.apiBase || '',
                            modelId: site.modelId || site.defaultModel || '',
                            availableModels: Array.isArray(site.availableModels) ? site.availableModels : [],
                            requestFormat: site.requestFormat || 'openai',
                            temperature: (typeof site.temperature === 'number') ? site.temperature : 0.5,
                            max_tokens: (typeof site.max_tokens === 'number') ? site.max_tokens : 8000
                        };
                    });
                } else if (typeof importedCustomSourceSites === 'object' && importedCustomSourceSites) {
                    // 已是物件結構，儘量保留
                    normalizedCustomSourceSites = importedCustomSourceSites;
                } else {
                    normalizedCustomSourceSites = {};
                }

                // 5) 可選匯入 lastSuccessfulKeys（若存在）
                const lastSuccessful = imported.lastSuccessfulKeys
                    || imported.paperBurnerLastSuccessfulKeys
                    || imported.lastSuccessful
                    || null;

                // 6) 寫入 localStorage（允許任意子集存在，不再強制三者齊備）
                localStorage.setItem('translationModelKeys', JSON.stringify(normalizedModelKeys));
                localStorage.setItem('translationModelConfigs', JSON.stringify(normalizedModelConfigs));
                localStorage.setItem('paperBurnerCustomSourceSites', JSON.stringify(normalizedCustomSourceSites));
                if (lastSuccessful && typeof lastSuccessful === 'object') {
                    localStorage.setItem('paperBurnerLastSuccessfulKeys', JSON.stringify(lastSuccessful));
                }
                // 匯入向量搜尋配置（如果存在）
                if (importedEmbeddingConfig && typeof importedEmbeddingConfig === 'object') {
                    localStorage.setItem('embeddingConfig', JSON.stringify(importedEmbeddingConfig));
                    // 更新 EmbeddingClient 配置
                    if (window.EmbeddingClient && typeof window.EmbeddingClient.saveConfig === 'function') {
                        window.EmbeddingClient.saveConfig(importedEmbeddingConfig);
                    }
                }

                // 匯入重排配置（如果存在）
                if (importedRerankConfig && typeof importedRerankConfig === 'object') {
                    localStorage.setItem('rerankConfig', JSON.stringify(importedRerankConfig));
                    if (window.RerankClient && typeof window.RerankClient.saveConfig === 'function') {
                        window.RerankClient.saveConfig(importedRerankConfig);
                    }
                }

                // 匯入 OCR 配置（如果存在）
                const importedOcrConfig = imported.ocrConfig || {};
                if (importedOcrConfig && typeof importedOcrConfig === 'object') {
                    if (importedOcrConfig.engine) localStorage.setItem('ocrEngine', importedOcrConfig.engine);
                    if (importedOcrConfig.mistralKeys !== undefined) localStorage.setItem('ocrMistralKeys', importedOcrConfig.mistralKeys);
                    if (importedOcrConfig.workerAuthKey !== undefined) localStorage.setItem('ocrWorkerAuthKey', importedOcrConfig.workerAuthKey);
                    if (importedOcrConfig.mineruToken !== undefined) localStorage.setItem('ocrMinerUToken', importedOcrConfig.mineruToken);
                    if (importedOcrConfig.mineruWorkerUrl !== undefined) localStorage.setItem('ocrMinerUWorkerUrl', importedOcrConfig.mineruWorkerUrl);
                    if (importedOcrConfig.mineruTokenMode !== undefined) localStorage.setItem('ocrMinerUTokenMode', importedOcrConfig.mineruTokenMode);
                    if (importedOcrConfig.mineruEnableOcr !== undefined) localStorage.setItem('ocrMinerUEnableOcr', importedOcrConfig.mineruEnableOcr);
                    if (importedOcrConfig.mineruEnableFormula !== undefined) localStorage.setItem('ocrMinerUEnableFormula', importedOcrConfig.mineruEnableFormula);
                    if (importedOcrConfig.mineruEnableTable !== undefined) localStorage.setItem('ocrMinerUEnableTable', importedOcrConfig.mineruEnableTable);
                    if (importedOcrConfig.doc2xToken !== undefined) localStorage.setItem('ocrDoc2XToken', importedOcrConfig.doc2xToken);
                    if (importedOcrConfig.doc2xWorkerUrl !== undefined) localStorage.setItem('ocrDoc2XWorkerUrl', importedOcrConfig.doc2xWorkerUrl);
                    if (importedOcrConfig.doc2xTokenMode !== undefined) localStorage.setItem('ocrDoc2XTokenMode', importedOcrConfig.doc2xTokenMode);

                    // 更新 OCR 設定管理器
                    if (window.ocrSettingsManager && typeof window.ocrSettingsManager.loadSettings === 'function') {
                        window.ocrSettingsManager.loadSettings();
                    }
                }

                // 匯入學術搜尋配置（如果存在）
                const importedAcademicSearchConfig = imported.academicSearchConfig || null;
                if (importedAcademicSearchConfig && typeof importedAcademicSearchConfig === 'object') {
                    localStorage.setItem('academicSearchProxyConfig', JSON.stringify(importedAcademicSearchConfig));
                }

                const importedAcademicSearchSourcesConfig = imported.academicSearchSourcesConfig || null;
                if (importedAcademicSearchSourcesConfig && typeof importedAcademicSearchSourcesConfig === 'object') {
                    localStorage.setItem('academicSearchSourcesConfig', JSON.stringify(importedAcademicSearchSourcesConfig));
                }

                // 更新學術搜尋設定管理器（如果存在）
                if (window.academicSearchSettingsManager && typeof window.academicSearchSettingsManager.loadSettings === 'function') {
                    window.academicSearchSettingsManager.loadSettings();
                }

                if (typeof refreshUIFunc === 'function') refreshUIFunc();
                if (typeof showNotification === 'function') {
                    showNotification('所有模型配置和Key已匯入並覆蓋', 'success', 2000);
                }
            } catch (err) {
                alert('匯入失敗：' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
};
