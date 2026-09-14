// js/ui.js

// =====================
// UI 相關操作與互動函式
// =====================

// ---------------------
// DOM 元素獲取（集中管理，便於維護）
// ---------------------
/** @type {HTMLTextAreaElement | null} mistralApiKeysTextarea - Mistral API 金鑰輸入欄位。 */
const mistralApiKeysTextarea = document.getElementById('mistralApiKeys');
/** @type {HTMLInputElement | null} rememberMistralKeyCheckbox - "記住 Mistral 金鑰"核取方塊。 */
const rememberMistralKeyCheckbox = document.getElementById('rememberMistralKey');
/** @type {HTMLTextAreaElement | null} translationApiKeysTextarea - (通用)翻譯服務 API 金鑰輸入欄位。 */
const translationApiKeysTextarea = document.getElementById('translationApiKeys');
/** @type {HTMLInputElement | null} rememberTranslationKeyCheckbox - "記住翻譯金鑰"核取方塊。 */
const rememberTranslationKeyCheckbox = document.getElementById('rememberTranslationKey');
/** @type {HTMLSelectElement | null} translationModelSelect - 翻譯模型選擇下拉選單。 */
const translationModelSelect = document.getElementById('translationModel');
/** @type {HTMLElement | null} customModelSettingsContainer - (舊版)自定義模型設定區域的容器。 */
const customModelSettingsContainer = document.getElementById('customModelSettingsContainer');
/** @type {HTMLElement | null} customModelSettings - (舊版)自定義模型具體設定的容器。 */
const customModelSettings = document.getElementById('customModelSettings');
/** @type {HTMLElement | null} advancedSettingsToggle - 高階設定區域的切換按鈕。 */
const advancedSettingsToggle = document.getElementById('advancedSettingsToggle');
/** @type {HTMLElement | null} advancedSettings - 高階設定區域的容器。 */
const advancedSettings = document.getElementById('advancedSettings');
/** @type {HTMLElement | null} advancedSettingsIcon - 高階設定切換按鈕中的圖示。 */
const advancedSettingsIcon = document.getElementById('advancedSettingsIcon');
/** @type {HTMLInputElement | null} maxTokensPerChunk - 每個文字塊最大 Token 數的滑塊輸入。 */
const maxTokensPerChunk = document.getElementById('maxTokensPerChunk');
/** @type {HTMLElement | null} maxTokensPerChunkValue - 顯示當前最大 Token 數的元素。 */
const maxTokensPerChunkValue = document.getElementById('maxTokensPerChunkValue');
/** @type {HTMLInputElement | null} skipProcessedFilesCheckbox - "跳過已處理檔案"核取方塊。 */
const skipProcessedFilesCheckbox = document.getElementById('skipProcessedFiles');
/** @type {HTMLInputElement | null} concurrencyLevelInput - (OCR/通用)並行級別輸入欄位。 */
const concurrencyLevelInput = document.getElementById('concurrencyLevel');
/** @type {HTMLElement | null} dropZone - 檔案拖放區域。 */
const dropZone = document.getElementById('dropZone');
/** @type {HTMLInputElement | null} pdfFileInput - 檔案選擇輸入欄位 (type="file")。 */
const pdfFileInput = document.getElementById('pdfFileInput');
/** @type {HTMLButtonElement | null} browseFilesBtn - "瀏覽檔案"按鈕。 */
const browseFilesBtn = document.getElementById('browseFilesBtn');
/** @type {HTMLElement | null} fileListContainer - 檔案列表的容器。 */
const fileListContainer = document.getElementById('fileListContainer');
/** @type {HTMLElement | null} fileList - 檔案列表的 UL 或 OL 元素。 */
const fileList = document.getElementById('fileList');
/** @type {HTMLButtonElement | null} clearFilesBtn - "清空檔案列表"按鈕。 */
const clearFilesBtn = document.getElementById('clearFilesBtn');
/** @type {HTMLSelectElement | null} targetLanguage - 目標語言選擇下拉選單。 */
const targetLanguage = document.getElementById('targetLanguage');
/** @type {HTMLButtonElement | null} processBtn - "開始處理"按鈕。 */
const processBtn = document.getElementById('processBtn');
/** @type {HTMLButtonElement | null} downloadAllBtn - "全部下載"按鈕。 */
const downloadAllBtn = document.getElementById('downloadAllBtn');
/** @type {HTMLElement | null} batchModeToggleWrapper - 批次模式開關容器。 */
const batchModeToggleWrapper = document.getElementById('batchModeToggleWrapper');
/** @type {HTMLInputElement | null} batchModeToggle - 批次模式開關。 */
const batchModeToggle = document.getElementById('batchModeToggle');
/** @type {HTMLElement | null} batchModeConfigPanel - 批次模式配置面板。 */
const batchModeConfigPanel = document.getElementById('batchModeConfig');
/** @type {HTMLElement | null} resultsSection - 處理結果顯示區域。 */
const resultsSection = document.getElementById('resultsSection');
/** @type {HTMLElement | null} resultsSummary - 處理結果總結資訊的容器。 */
const resultsSummary = document.getElementById('resultsSummary');
/** @type {HTMLElement | null} progressSection - 進度顯示區域。 */
const progressSection = document.getElementById('progressSection');
/** @type {HTMLElement | null} batchProgressText - 批處理整體進度文字顯示元素。 */
const batchProgressText = document.getElementById('batchProgressText');
/** @type {HTMLElement | null} concurrentProgressText - 當前並行任務數文字顯示元素。 */
const concurrentProgressText = document.getElementById('concurrentProgressText');
/** @type {HTMLElement | null} progressStep - 當前處理步驟文字顯示元素。 */
const progressStep = document.getElementById('progressStep');
/** @type {HTMLElement | null} progressPercentage - 進度百分比文字顯示元素。 */
const progressPercentage = document.getElementById('progressPercentage');
/** @type {HTMLElement | null} progressBar - 進度條的內部填充元素。 */
const progressBar = document.getElementById('progressBar');
/** @type {HTMLElement | null} progressLog - 詳細進度日誌的容器。 */
const progressLog = document.getElementById('progressLog');
/** @type {HTMLElement | null} notificationContainer - 通知訊息的容器。 */
const notificationContainer = document.getElementById('notification-container');
/** @type {HTMLElement | null} customModelSettingsToggle - (舊版)自定義模型設定的切換按鈕。 */
const customModelSettingsToggle = document.getElementById('customModelSettingsToggle');
/** @type {HTMLElement | null} customModelSettingsToggleIcon - (舊版)自定義模型設定切換按鈕中的圖示。 */
const customModelSettingsToggleIcon = document.getElementById('customModelSettingsToggleIcon');
/** @type {HTMLElement | null} customSourceSiteContainer - 自定義API源站點選擇區域的容器。 */
const customSourceSiteContainer = document.getElementById('customSourceSiteContainer');
/** @type {HTMLSelectElement | null} customSourceSiteSelect - 自定義API源站點選擇下拉選單。 */
const customSourceSiteSelect = document.getElementById('customSourceSiteSelect');
/** @type {HTMLElement | null} customSourceSiteToggleIcon - 自定義源站點設定區域切換按鈕的圖示 (可能與高階設定共用或獨立)。 */
const customSourceSiteToggleIcon = document.getElementById('customSourceSiteToggleIcon'); // 注意：此ID可能與 advancedSettingsIcon 描述衝突，需確認實際HTML結構
/** @type {HTMLButtonElement | null} detectModelsBtn - "檢測可用模型"按鈕，通常用於自定義源站點。 */
const detectModelsBtn = document.getElementById('detectModelsBtn');

document.addEventListener('DOMContentLoaded', function() {
    // ... 其它初始化 ...
    if (customModelSettingsToggle && customModelSettings && customModelSettingsToggleIcon) {
        customModelSettingsToggle.addEventListener('click', function() {
            customModelSettings.classList.toggle('hidden');
            if (customModelSettings.classList.contains('hidden')) {
                customModelSettingsToggleIcon.setAttribute('icon', 'carbon:chevron-down');
            } else {
                customModelSettingsToggleIcon.setAttribute('icon', 'carbon:chevron-up');
            }
        });
    }

    // ===== 模型管理器變數宣告 =====
    const modelKeyManagerBtn = document.getElementById('modelKeyManagerBtn');
    const modelKeyManagerModal = document.getElementById('modelKeyManagerModal');
    const closeModelKeyManager = document.getElementById('closeModelKeyManager');
    const modelListColumn = document.getElementById('modelListColumn');
    const modelConfigColumn = document.getElementById('modelConfigColumn');
    const keyManagerColumn = document.getElementById('keyManagerColumn');

    let currentManagerUI = null;
    let currentSelectedSourceSiteId = null; // 用於自定義源站選擇
    let selectedModelForManager = null;
    const supportedModelsForKeyManager = window.supportedModelsForKeyManager || [];

    // 渲染模型列表 (委託給模組)
    function renderModelList() {
        if (window.modelManager) {
            window.modelManager.renderModelList();
        }
    }

    // 選擇模型 (委託給模組)
    function selectModelForManager(modelKey) {
        if (window.modelManager) {
            window.modelManager.selectModel(modelKey);
            selectedModelForManager = window.modelManager.getSelectedModel();
        }
        currentSelectedSourceSiteId = null;
    }

    function renderModelConfigSection(modelKey) {
        modelConfigColumn.innerHTML = '';
        const modelDefinition = supportedModelsForKeyManager.find(m => m.key === modelKey);
        if (!modelDefinition) return;

        const title = document.createElement('h3');
        title.className = 'text-lg font-semibold mb-3 text-gray-800';
        modelConfigColumn.appendChild(title);

        if (modelKey === 'custom') {
            title.textContent = `自定義源站管理`;

            const addNewButton = document.createElement('button');
            addNewButton.id = 'addNewSourceSiteBtn';
            addNewButton.innerHTML = '<iconify-icon icon="carbon:add-filled" class="mr-2"></iconify-icon>新增新源站';
            addNewButton.className = 'mb-4 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors flex items-center';
            addNewButton.addEventListener('click', () => {
                currentSelectedSourceSiteId = null; // 清除選中狀態，表示新增
                renderSourceSitesList(); // 更新列表，移除醒目提示
                renderSourceSiteForm(null);
            });
            modelConfigColumn.appendChild(addNewButton);

            const sitesListContainer = document.createElement('div');
            sitesListContainer.id = 'sourceSitesListContainer';
            modelConfigColumn.appendChild(sitesListContainer);

            const siteConfigFormContainer = document.createElement('div');
            siteConfigFormContainer.id = 'sourceSiteConfigFormContainer';
            siteConfigFormContainer.className = 'mt-4 p-4 border border-gray-200 rounded-md hidden';
            modelConfigColumn.appendChild(siteConfigFormContainer);

            renderSourceSitesList();

            if (!currentSelectedSourceSiteId && Object.keys(loadAllCustomSourceSites()).length === 0) {
                 keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">請新增並選擇一個源站以管理其 API Keys。</p>';
            } else if (!currentSelectedSourceSiteId) {
                keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">請從上方列表選擇一個源站以管理其 API Keys。</p>';
            }

        } else if (modelKey === 'embedding') {
            title.textContent = `向量搜尋與重排 - 配置`;
            renderEmbeddingConfig();
        } else if (modelKey === 'academicSearch') {
            title.textContent = `學術搜尋與代理 - 配置`;
            renderAcademicSearchConfig();
        } else if (modelKey === 'mistral') {
            title.textContent = `${modelDefinition.name} - 配置`;
            renderMistralOcrConfig();
        } else if (modelKey === 'mineru') {
            title.textContent = `${modelDefinition.name} - 配置`;
            renderMinerUConfig();
        } else if (modelKey === 'doc2x') {
            title.textContent = `${modelDefinition.name} - 配置`;
            renderDoc2XConfig();
        } else {
            title.textContent = `${modelDefinition.name} - 配置`;
        }
    }

    // 匯出到全域，供模組使用
    window.renderModelConfigSection = renderModelConfigSection;

    // ===== 初始化模型管理器模組 (在函式定義之後) =====
    if (window.modelManager) {
        window.modelManager.init({
            modelKeyManagerBtn,
            modelKeyManagerModal,
            closeModelKeyManager,
            modelListColumn,
            modelConfigColumn,
            keyManagerColumn
        });
    }

    // 顯示嵌入模型選擇器的輔助函式
    function showEmbeddingModelSelector(models, targetInput) {
        // 建立一個簡單的選擇對話方塊
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 400px; max-width: 90vw; max-height: 60vh;
            background: #fff; border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            z-index: 100002; padding: 0; overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">選擇嵌入模型</h4>
            <button class="model-selector-close" style="border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1;">&times;</button>
        `;

        const list = document.createElement('div');
        list.style.cssText = 'max-height: 400px; overflow-y: auto; padding: 8px;';

        models.forEach(model => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 12px 16px; margin: 4px 0; border-radius: 8px;
                cursor: pointer; transition: all 0.2s;
                border: 1px solid #e5e7eb;
            `;
            item.innerHTML = `
                <div style="font-weight: 500; color: #111827;">${model.id}</div>
                ${model.owned_by ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">by ${model.owned_by}</div>` : ''}
            `;

            item.onmouseover = () => {
                item.style.background = '#f3f4f6';
                item.style.borderColor = '#3b82f6';
            };
            item.onmouseout = () => {
                item.style.background = '#fff';
                item.style.borderColor = '#e5e7eb';
            };
            item.onclick = () => {
                targetInput.value = model.id;
                document.body.removeChild(overlay);
                document.body.removeChild(container);
            };

            list.appendChild(item);
        });

        container.appendChild(header);
        container.appendChild(list);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5); z-index: 100001;
        `;

        const closeHandler = () => {
            document.body.removeChild(overlay);
            document.body.removeChild(container);
        };

        overlay.onclick = closeHandler;
        header.querySelector('.model-selector-close').onclick = closeHandler;

        document.body.appendChild(overlay);
        document.body.appendChild(container);
    }

    function renderEmbeddingConfig() {
        // 委託給 ui_embedding_config.js 模組
        if (window.UIEmbeddingConfigRenderer) {
            window.UIEmbeddingConfigRenderer.renderEmbeddingConfig(modelConfigColumn);
        }
    }

    // Rerank 模型選擇器（與嵌入選擇器風格一致）
    function showRerankModelSelector(models, targetInput) {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 420px; max-width: 92vw; max-height: 60vh;
            background: #fff; border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            z-index: 100002; padding: 0; overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">選擇重排模型</h4>
            <button class="model-selector-close" style="border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1;">&times;</button>
        `;

        const list = document.createElement('div');
        list.style.cssText = 'max-height: 400px; overflow-y: auto; padding: 8px;';

        (models || []).forEach(model => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 12px 16px; margin: 4px 0; border-radius: 8px;
                cursor: pointer; transition: all 0.2s;
                border: 1px solid #e5e7eb;
            `;
            const id = model.id || model.name || '';
            item.innerHTML = `
                <div style="font-weight: 500; color: #111827;">${id}</div>
                ${model.owned_by ? `<div style=\"font-size: 12px; color: #6b7280; margin-top: 2px;\">by ${model.owned_by}</div>` : ''}
            `;
            item.onmouseover = () => { item.style.background = '#f3f4f6'; item.style.borderColor = '#737373'; };
            item.onmouseout = () => { item.style.background = '#fff'; item.style.borderColor = '#e5e7eb'; };
            item.onclick = () => {
                if (id) targetInput.value = id;
                document.body.removeChild(overlay);
                document.body.removeChild(container);
            };
            list.appendChild(item);
        });

        container.appendChild(header);
        container.appendChild(list);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5); z-index: 100001;
        `;
        const closeHandler = () => { document.body.removeChild(overlay); document.body.removeChild(container); };
        overlay.onclick = closeHandler;
        header.querySelector('.model-selector-close').onclick = closeHandler;
        document.body.appendChild(overlay);
        document.body.appendChild(container);
    }

    function renderMistralOcrConfig() {
        // 委託給 ui_model_ocr_config.js 模組
        if (window.UIModelOcrConfigRenderer) {
            window.UIModelOcrConfigRenderer.renderMistralOcrConfig(modelConfigColumn);
        }
    }

    function renderMinerUConfig() {
        // 委託給 ui_model_ocr_config.js 模組
        if (window.UIModelOcrConfigRenderer) {
            window.UIModelOcrConfigRenderer.renderMinerUConfig(modelConfigColumn);
        }
    }

    function renderDoc2XConfig() {
        // 委託給 ui_model_ocr_config.js 模組
        if (window.UIModelOcrConfigRenderer) {
            window.UIModelOcrConfigRenderer.renderDoc2XConfig(modelConfigColumn);
        }
    }

    function renderAcademicSearchConfig() {
        // 從 localStorage 載入配置
        const proxyConfig = JSON.parse(localStorage.getItem('academicSearchProxyConfig') || 'null') || {
            enabled: false,
            baseUrl: '',
            semanticScholarApiKey: '',
            pubmedApiKey: '',
            authKey: ''
        };

        // 學術搜尋源配置
        const sourcesConfig = JSON.parse(localStorage.getItem('academicSearchSourcesConfig') || 'null') || {
            sources: [
                { key: 'crossref', name: 'CrossRef', enabled: true, order: 0 },
                { key: 'openalex', name: 'OpenAlex', enabled: true, order: 1 },
                { key: 'arxiv', name: 'arXiv', enabled: true, order: 2 },
                { key: 'pubmed', name: 'PubMed', enabled: true, order: 3 },
                { key: 'semanticscholar', name: 'Semantic Scholar', enabled: true, order: 4 }
            ]
        };

        const container = document.createElement('div');
        container.className = 'space-y-4';

        // Tab 切換
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'border-b border-gray-200';
        tabsDiv.innerHTML = `
            <nav class="flex -mb-px space-x-4">
                <button id="academic-tab-sources" class="academic-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
                    搜尋源管理
                </button>
                <button id="academic-tab-proxy" class="academic-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">
                    代理配置
                </button>
            </nav>
        `;
        container.appendChild(tabsDiv);

        // Tab 1: 搜尋源管理
        const sourcesTab = document.createElement('div');
        sourcesTab.id = 'academic-sources-tab-content';
        sourcesTab.className = 'pt-4';
        sourcesTab.innerHTML = `
            <div class="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2 mb-3 flex items-center gap-1">
                <iconify-icon icon="carbon:information" width="14"></iconify-icon>
                <span>拖動調整查詢順序，取消勾選可禁用某個源</span>
            </div>
            <div id="academic-sources-list" class="space-y-2"></div>
        `;
        container.appendChild(sourcesTab);

        // Tab 2: 代理配置
        const proxyTab = document.createElement('div');
        proxyTab.id = 'academic-proxy-tab-content';
        proxyTab.className = 'pt-4 hidden';
        container.appendChild(proxyTab);

        modelConfigColumn.appendChild(container);

        // 渲染搜尋源列表
        renderAcademicSourcesList(sourcesConfig);

        // 渲染代理配置
        renderAcademicProxyConfig(proxyTab, proxyConfig);

        // Tab 切換邏輯
        document.querySelectorAll('.academic-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetId = e.target.id;

                // 更新 tab 樣式
                document.querySelectorAll('.academic-tab').forEach(t => {
                    t.classList.remove('border-blue-600', 'text-blue-600');
                    t.classList.add('border-transparent', 'text-gray-500');
                });
                e.target.classList.remove('border-transparent', 'text-gray-500');
                e.target.classList.add('border-blue-600', 'text-blue-600');

                // 切換內容
                if (targetId === 'academic-tab-sources') {
                    sourcesTab.classList.remove('hidden');
                    proxyTab.classList.add('hidden');
                } else {
                    sourcesTab.classList.add('hidden');
                    proxyTab.classList.remove('hidden');
                }
            });
        });
    }

    function renderAcademicSourcesList(config) {
        const listContainer = document.getElementById('academic-sources-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // 按 order 排序
        const sortedSources = [...config.sources].sort((a, b) => a.order - b.order);

        sortedSources.forEach((source, index) => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-md hover:shadow-sm transition-shadow cursor-move';
            item.draggable = true;
            item.dataset.sourceKey = source.key;

            item.innerHTML = `
                <iconify-icon icon="carbon:draggable" width="16" class="text-gray-400"></iconify-icon>
                <input type="checkbox" ${source.enabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 source-enable-checkbox" data-key="${source.key}">
                <span class="flex-grow text-sm text-gray-700 font-medium">${source.name}</span>
                <span class="text-xs text-gray-400">${source.key}</span>
            `;

            listContainer.appendChild(item);

            // 拖拽事件
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', source.key);
                item.classList.add('opacity-50');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('opacity-50');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('border-blue-400', 'bg-blue-50');
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('border-blue-400', 'bg-blue-50');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('border-blue-400', 'bg-blue-50');

                const draggedKey = e.dataTransfer.getData('text/plain');
                const targetKey = source.key;

                if (draggedKey !== targetKey) {
                    // 重新排序
                    const draggedIndex = config.sources.findIndex(s => s.key === draggedKey);
                    const targetIndex = config.sources.findIndex(s => s.key === targetKey);

                    const [draggedItem] = config.sources.splice(draggedIndex, 1);
                    config.sources.splice(targetIndex, 0, draggedItem);

                    // 更新 order
                    config.sources.forEach((s, idx) => s.order = idx);

                    // 儲存並重新渲染
                    localStorage.setItem('academicSearchSourcesConfig', JSON.stringify(config));
                    renderAcademicSourcesList(config);
                    showNotification && showNotification('搜尋源順序已更新', 'success', 2000);
                }
            });
        });

        // 啟用/禁用切換
        document.querySelectorAll('.source-enable-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const key = e.target.dataset.key;
                const source = config.sources.find(s => s.key === key);
                if (source) {
                    source.enabled = e.target.checked;
                    localStorage.setItem('academicSearchSourcesConfig', JSON.stringify(config));
                    showNotification && showNotification(`${source.name} 已${source.enabled ? '啟用' : '禁用'}`, 'success', 2000);
                }
            });
        });

        // 儲存按鈕
        const saveBtn = document.createElement('button');
        saveBtn.className = 'w-full mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700';
        saveBtn.textContent = '儲存配置';
        saveBtn.onclick = () => {
            localStorage.setItem('academicSearchSourcesConfig', JSON.stringify(config));
            showNotification && showNotification('搜尋源配置已儲存', 'success');
        };
        listContainer.appendChild(saveBtn);
    }

    function renderAcademicProxyConfig(container, config) {
        // 不要覆蓋 className，保留 hidden 類
        container.classList.add('space-y-4');
        if (!container.classList.contains('pt-4')) {
            container.classList.add('pt-4');
        }

        // 啟用開關
        const enableDiv = document.createElement('div');
        enableDiv.innerHTML = `
            <label class="flex items-center cursor-pointer">
                <input type="checkbox" id="academic-search-enabled" ${config.enabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                <span class="ml-2 text-sm font-medium text-gray-700">啟用學術搜尋代理</span>
            </label>
            <p class="mt-1 text-xs text-gray-500 ml-6">開啟後，PubMed、Semantic Scholar 和 arXiv 查詢將透過代理伺服器</p>
        `;
        container.appendChild(enableDiv);

        // Worker URL
        const urlDiv = document.createElement('div');
        urlDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-1">Worker URL</label>
            <input type="text" id="academic-search-base-url" value="${config.baseUrl}" placeholder="https://your-worker.workers.dev" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
            <p class="mt-1 text-xs text-gray-500">Cloudflare Worker 學術搜尋代理地址</p>
        `;
        container.appendChild(urlDiv);

        // 部署模式說明
        const modeInfoDiv = document.createElement('div');
        modeInfoDiv.className = 'border-t pt-4';
        modeInfoDiv.innerHTML = `
            <div class="text-xs bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                <div class="font-semibold text-blue-800 flex items-center gap-1">
                    <iconify-icon icon="carbon:information" width="14"></iconify-icon>
                    <span>支援兩種部署模式</span>
                </div>
                <div class="text-blue-700">
                    <strong>方案一：透傳模式（推薦）</strong><br>
                    • 在下方填寫 API Key，透過 <code class="bg-blue-100 px-1 rounded">X-Api-Key</code> 請求頭透傳給 Worker<br>
                    • Worker 可以選擇配置金鑰作為備用，如果前端沒有提供則使用 Worker 配置的金鑰<br>
                    • 適合個人使用或分享給他人
                </div>
                <div class="text-blue-700">
                    <strong>方案二：共享金鑰模式</strong><br>
                    • API Key 儲存在 Worker 環境變數中（必需）<br>
                    • 需要在下方填寫 Worker Auth Key（對應 Worker 的 <code class="bg-blue-100 px-1 rounded">AUTH_SECRET</code>）<br>
                    • 適合團隊共享，但需要保護好 Auth Key
                </div>
            </div>
        `;
        container.appendChild(modeInfoDiv);

        // Semantic Scholar API Key（透傳模式）
        const s2KeyDiv = document.createElement('div');
        s2KeyDiv.className = 'border-t pt-4';
        s2KeyDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-1">Semantic Scholar API Key（可選，透傳模式）</label>
            <div class="flex items-center gap-2">
                <input type="password" id="academic-search-s2-key" value="${config.semanticScholarApiKey || ''}" placeholder="留空則使用免費額度" class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                <button type="button" id="academic-search-s2-toggle" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors flex items-center gap-1">
                    <iconify-icon icon="carbon:view" width="16"></iconify-icon>
                    <span>顯示</span>
                </button>
            </div>
            <p class="mt-1 text-xs text-gray-500">從 <a href="https://www.semanticscholar.org/product/api" target="_blank" class="text-blue-600 hover:underline">Semantic Scholar</a> 獲取，提高請求限額</p>
        `;
        container.appendChild(s2KeyDiv);

        // PubMed API Key（透傳模式）
        const pubmedKeyDiv = document.createElement('div');
        pubmedKeyDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-1">PubMed API Key（可選，透傳模式）</label>
            <div class="flex items-center gap-2">
                <input type="password" id="academic-search-pubmed-key" value="${config.pubmedApiKey || ''}" placeholder="留空則使用免費額度" class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                <button type="button" id="academic-search-pubmed-toggle" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors flex items-center gap-1">
                    <iconify-icon icon="carbon:view" width="16"></iconify-icon>
                    <span>顯示</span>
                </button>
            </div>
            <p class="mt-1 text-xs text-gray-500">從 <a href="https://www.ncbi.nlm.nih.gov/account/" target="_blank" class="text-blue-600 hover:underline">NCBI</a> 獲取，提高請求限額</p>
        `;
        container.appendChild(pubmedKeyDiv);

        // Worker Auth Key（共享模式）
        const authKeyDiv = document.createElement('div');
        authKeyDiv.className = 'border-t pt-4';
        authKeyDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-1">Worker Auth Key（共享模式）</label>
            <div class="flex items-center gap-2">
                <input type="password" id="academic-search-auth-key" value="${config.authKey || ''}" placeholder="如果 Worker 啟用了 ENABLE_AUTH，填寫這裡" class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                <button type="button" id="academic-search-auth-toggle" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors flex items-center gap-1">
                    <iconify-icon icon="carbon:view" width="16"></iconify-icon>
                    <span>顯示</span>
                </button>
            </div>
            <p class="mt-1 text-xs text-gray-500">對應 Worker 環境變數 <code class="bg-gray-100 px-1 rounded">AUTH_SECRET</code>（僅在共享模式需要）</p>
        `;
        container.appendChild(authKeyDiv);

        // 聯絡郵箱（可選，用於 CrossRef 和 OpenAlex 的 polite pool）
        const emailDiv = document.createElement('div');
        emailDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-1">聯絡郵箱（可選）</label>
            <input type="email" id="academic-search-contact-email" value="${config.contactEmail || ''}" placeholder="your-email@example.com" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
            <p class="mt-1 text-xs text-gray-500">
                提供郵箱（<span class="font-semibold">Polite Pool</span>）可獲得
                <a href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/#00831" target="_blank" class="font-semibold text-blue-600 hover:underline">CrossRef</a> 和
                <a href="https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication#the-polite-pool" target="_blank" class="font-semibold text-blue-600 hover:underline">OpenAlex</a>
                更高的速率限制（點選連結以瞭解更多）
            </p>
        `;
        container.appendChild(emailDiv);

        // 測試/儲存按鈕
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2';
        buttonsDiv.innerHTML = `
            <button id="academic-search-test" class="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50">測試連線</button>
            <button id="academic-search-save" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">儲存配置</button>
        `;
        container.appendChild(buttonsDiv);

        // 測試結果顯示
        const resultDiv = document.createElement('div');
        resultDiv.id = 'academic-search-test-result';
        resultDiv.className = 'text-sm mt-2';
        resultDiv.style.display = 'none';
        container.appendChild(resultDiv);

        modelConfigColumn.appendChild(container);

        // 綁定顯示/隱藏切換事件
        const toggleButtons = [
            { btnId: 'academic-search-s2-toggle', inputId: 'academic-search-s2-key' },
            { btnId: 'academic-search-pubmed-toggle', inputId: 'academic-search-pubmed-key' },
            { btnId: 'academic-search-auth-toggle', inputId: 'academic-search-auth-key' }
        ];

        toggleButtons.forEach(({ btnId, inputId }) => {
            const btn = document.getElementById(btnId);
            const input = document.getElementById(inputId);
            if (btn && input) {
                btn.addEventListener('click', () => {
                    const isPassword = input.type === 'password';
                    input.type = isPassword ? 'text' : 'password';
                    btn.querySelector('span').textContent = isPassword ? '隱藏' : '顯示';
                    btn.querySelector('iconify-icon').setAttribute('icon', isPassword ? 'carbon:view-off' : 'carbon:view');
                });
            }
        });

        // 儲存配置
        document.getElementById('academic-search-save').onclick = () => {
            try {
                const newConfig = {
                    enabled: document.getElementById('academic-search-enabled').checked,
                    baseUrl: document.getElementById('academic-search-base-url').value.trim(),
                    semanticScholarApiKey: document.getElementById('academic-search-s2-key').value.trim(),
                    pubmedApiKey: document.getElementById('academic-search-pubmed-key').value.trim(),
                    authKey: document.getElementById('academic-search-auth-key').value.trim(),
                    contactEmail: document.getElementById('academic-search-contact-email').value.trim()
                };

                // 保留已有的 rateLimit 資訊（從測試連線獲取）
                const existingConfig = JSON.parse(localStorage.getItem('academicSearchProxyConfig') || '{}');
                if (existingConfig.rateLimit) {
                    newConfig.rateLimit = existingConfig.rateLimit;
                }

                localStorage.setItem('academicSearchProxyConfig', JSON.stringify(newConfig));
                showNotification && showNotification('學術搜尋配置已儲存', 'success');

                // 通知學術搜尋設定管理器重新載入（如果存在）
                if (window.academicSearchSettingsManager && typeof window.academicSearchSettingsManager.loadSettings === 'function') {
                    window.academicSearchSettingsManager.loadSettings();
                }
            } catch (e) {
                alert('儲存配置失敗：' + e.message);
            }
        };

        // 測試連線
        document.getElementById('academic-search-test').onclick = async () => {
            const baseUrl = document.getElementById('academic-search-base-url').value.trim();
            const authKey = document.getElementById('academic-search-auth-key').value.trim();
            const resultDiv = document.getElementById('academic-search-test-result');

            if (!baseUrl) {
                resultDiv.style.display = 'block';
                resultDiv.className = 'text-sm mt-2 p-2 bg-red-50 border border-red-200 text-red-700 rounded';
                resultDiv.textContent = '❌ 請填寫 Worker URL';
                return;
            }

            resultDiv.style.display = 'block';
            resultDiv.className = 'text-sm mt-2 p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded';
            resultDiv.textContent = '⏳ 正在測試連線...';

            try {
                const headers = {
                    'Content-Type': 'application/json'
                };

                // 如果配置了 Auth Key，加入請求頭
                if (authKey) {
                    headers['X-Auth-Key'] = authKey;
                }

                // 透傳 API 金鑰（用於金鑰狀態檢測）
                const proxyConfig = JSON.parse(localStorage.getItem('academicSearchProxyConfig') || '{}');
                if (proxyConfig.semanticScholarApiKey) {
                    headers['X-Api-Key'] = proxyConfig.semanticScholarApiKey;
                } else if (proxyConfig.pubmedApiKey) {
                    headers['X-Api-Key'] = proxyConfig.pubmedApiKey;
                }

                const response = await fetch(`${baseUrl}/health`, {
                    method: 'GET',
                    headers: headers
                });

                if (response.ok) {
                    const data = await response.json();

                    // 儲存速率限制資訊到配置中
                    const currentConfig = JSON.parse(localStorage.getItem('academicSearchProxyConfig') || '{}');
                    currentConfig.rateLimit = data.rateLimit || null;
                    localStorage.setItem('academicSearchProxyConfig', JSON.stringify(currentConfig));

                    // 格式化輸出
                    let servicesHtml = '';
                    if (data.services) {
                        servicesHtml = '<div class="mt-2"><strong>可用服務:</strong><ul class="list-disc list-inside text-xs mt-1">';
                        for (const [service, info] of Object.entries(data.services)) {
                            const status = info.enabled ? '✓' : '✗';
                            const apiKeyStatus = info.hasApiKey !== undefined ? (info.hasApiKey ? ' (有金鑰)' : ' (無金鑰)') : '';
                            servicesHtml += `<li>${status} ${service}${apiKeyStatus}</li>`;
                        }
                        servicesHtml += '</ul></div>';
                    }

                    let rateLimitHtml = '';
                    if (data.rateLimit) {
                        if (data.rateLimit.enabled) {
                            rateLimitHtml = `<div class="mt-2 text-xs">
                                <strong>速率限制:</strong> TPS: ${data.rateLimit.tps}, TPM: ${data.rateLimit.tpm}, 每IP TPS: ${data.rateLimit.perIpTps}, 每IP TPM: ${data.rateLimit.perIpTpm}`;

                            // 顯示服務級別速率限制
                            if (data.rateLimit.services) {
                                rateLimitHtml += '<div class="ml-4 mt-1 text-xs opacity-80">';
                                if (data.rateLimit.services.pubmed) {
                                    rateLimitHtml += `<div>• PubMed: TPS ${data.rateLimit.services.pubmed.tps}, TPM ${data.rateLimit.services.pubmed.tpm}</div>`;
                                }
                                if (data.rateLimit.services.semanticscholar) {
                                    rateLimitHtml += `<div>• Semantic Scholar: TPS ${data.rateLimit.services.semanticscholar.tps}, TPM ${data.rateLimit.services.semanticscholar.tpm}</div>`;
                                }
                                rateLimitHtml += '</div>';
                            }
                            rateLimitHtml += '</div>';
                        } else {
                            rateLimitHtml = '<div class="mt-2 text-xs"><strong>速率限制:</strong> 未啟用</div>';
                        }
                    }

                    let authHtml = '';
                    if (data.authentication) {
                        authHtml = `<div class="mt-1 text-xs"><strong>認證:</strong> ${data.authentication.required ? '必需' : '不需要'}</div>`;
                    }

                    resultDiv.className = 'text-sm mt-2 p-2 bg-green-50 border border-green-200 text-green-700 rounded';
                    resultDiv.innerHTML = `✅ 連線成功！速率限制配置已儲存${servicesHtml}${rateLimitHtml}${authHtml}`;
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                resultDiv.className = 'text-sm mt-2 p-2 bg-red-50 border border-red-200 text-red-700 rounded';
                resultDiv.textContent = `❌ 連線失敗：${error.message}`;
            }
        };
    }

    function renderSourceSitesList() {
        const sitesListContainer = document.getElementById('sourceSitesListContainer');
        if (!sitesListContainer) return;
        sitesListContainer.innerHTML = '';

        const sites = loadAllCustomSourceSites();
        const siteIds = Object.keys(sites);

        if (siteIds.length === 0) {
            sitesListContainer.innerHTML = '<p class="text-sm text-gray-500">還沒有自定義源站。請點選上方按鈕新增一個。</p>';
            document.getElementById('sourceSiteConfigFormContainer').classList.add('hidden');
            if (selectedModelForManager === 'custom') {
                 keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">請新增並選擇一個源站以管理其 API Keys。</p>';
            }
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'space-y-2';

        siteIds.forEach(id => {
            const site = sites[id];
            const li = document.createElement('li');
            li.className = `p-3 border rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors ${currentSelectedSourceSiteId === id ? 'bg-blue-50 border-blue-300 shadow-md' : 'bg-white'}`;
            li.dataset.siteId = id;

            li.addEventListener('click', () => {
                selectSourceSite(id);
            });

            const displayNameSpan = document.createElement('span');
            displayNameSpan.textContent = site.displayName || `源站 (ID: ${id.substring(0,8)}...)`;
            displayNameSpan.className = 'font-medium text-sm text-gray-700 flex-grow';

            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'space-x-2 flex-shrink-0';

            const editButton = document.createElement('button');
            editButton.innerHTML = '<iconify-icon icon="carbon:edit" width="16"></iconify-icon>';
            editButton.title = '編輯此源站配置';
            editButton.className = 'p-1.5 text-gray-500 hover:text-blue-700 rounded hover:bg-blue-100';
            editButton.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSelectedSourceSiteId = id;
                renderSourceSitesList();
                renderSourceSiteForm(site);
                keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">編輯源站配置中。儲存或取消以管理 Keys。</p>';
            });

            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<iconify-icon icon="carbon:trash-can" width="16"></iconify-icon>';
            deleteButton.title = '刪除此源站';
            deleteButton.className = 'p-1.5 text-gray-500 hover:text-red-700 rounded hover:bg-red-100';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`確定要刪除源站 "${site.displayName || id}" 嗎？其關聯的API Keys也將被刪除。`)) {
                    deleteCustomSourceSite(id);
                    if (typeof showNotification === 'function') showNotification(`源站 "${site.displayName || id}" 已刪除。`, 'success');
                    if (currentSelectedSourceSiteId === id) {
                        currentSelectedSourceSiteId = null;
                        keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">請選擇一個源站以管理其 API Keys。</p>';
                        document.getElementById('sourceSiteConfigFormContainer').classList.add('hidden');
                    }
                    renderSourceSitesList();
                }
            });

            buttonsDiv.appendChild(editButton);
            buttonsDiv.appendChild(deleteButton);

            li.appendChild(displayNameSpan);
            li.appendChild(buttonsDiv);
            ul.appendChild(li);
        });
        sitesListContainer.appendChild(ul);

        if (!currentSelectedSourceSiteId && siteIds.length > 0) {
            selectSourceSite(siteIds[0]);
        } else if (currentSelectedSourceSiteId && sites[currentSelectedSourceSiteId]) {
            renderKeyManagerForModel(`custom_source_${currentSelectedSourceSiteId}`);
        } else if (siteIds.length > 0) { // Has sites, but nothing selected (e.g. after a delete)
             keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">請選擇一個源站以管理其 API Keys。</p>';
             document.getElementById('sourceSiteConfigFormContainer').classList.add('hidden');
        }
    }

    function selectSourceSite(siteId) {
        currentSelectedSourceSiteId = siteId;
        const sites = loadAllCustomSourceSites();
        const site = sites[siteId];

        if (site) {
            renderKeyManagerForModel(`custom_source_${siteId}`);
            const formContainer = document.getElementById('sourceSiteConfigFormContainer');
            if (formContainer) {
                formContainer.classList.add('hidden');
                formContainer.innerHTML = '';
            }
        }
        renderSourceSitesList();
    }

    function renderSourceSiteForm(siteData) {
        const formContainer = document.getElementById('sourceSiteConfigFormContainer');
        if (!formContainer) return;
        formContainer.innerHTML = '';
        formContainer.classList.remove('hidden');

        const isEditing = siteData !== null;
        const formTitleText = isEditing ? `編輯源站: ${siteData.displayName || '未命名'}` : '新增新源站';

        const formTitle = document.createElement('h4');
        formTitle.textContent = formTitleText;
        formTitle.className = 'text-md font-semibold mb-3 text-gray-700';
        formContainer.appendChild(formTitle);

        const form = document.createElement('form');
        form.className = 'space-y-3';

        const siteIdForForm = isEditing ? siteData.id : _generateUUID_ui();

        form.appendChild(createConfigInput(`sourceDisplayName_${siteIdForForm}`, '顯示名稱 *', isEditing ? siteData.displayName : '', 'text', '例如: 我的備用 OpenAI', () => {}));
        form.appendChild(createConfigInput(`sourceApiBaseUrl_${siteIdForForm}`, 'API Base URL *', isEditing ? siteData.apiBaseUrl : '', 'url', '例如: https://api.openai.com', () => {}));

        const endpointModeOptions = [
            { value: 'auto', text: '自動補全（必要時追加 /v1/...）' },
            { value: 'chat', text: '僅追加 /chat/completions' },
            { value: 'manual', text: '已是完整端點（不追加）' }
        ];
        const endpointModeField = createConfigSelect(
            `sourceEndpointMode_${siteIdForForm}`,
            '端點補全方式',
            isEditing ? (siteData.endpointMode || 'auto') : 'auto',
            endpointModeOptions,
            () => {}
        );
        const endpointModeHint = document.createElement('p');
        endpointModeHint.className = 'mt-1 text-[11px] text-gray-500 leading-4';
        endpointModeHint.textContent = '若第三方已提供完整的 /chat/completions 或 /messages 地址，請選擇“已是完整端點”。';
        endpointModeField.appendChild(endpointModeHint);
        form.appendChild(endpointModeField);

        // --- Enhanced Model ID Input with Detection ---
        const modelIdGroup = document.createElement('div');
        modelIdGroup.className = 'mb-3';

        const modelIdLabel = document.createElement('label');
        modelIdLabel.htmlFor = `sourceModelId_${siteIdForForm}`;
        modelIdLabel.className = 'block text-xs font-medium text-gray-600 mb-1';
        modelIdLabel.textContent = '預設模型 ID *';
        modelIdGroup.appendChild(modelIdLabel);

        const modelIdInputContainer = document.createElement('div');
        modelIdInputContainer.id = `sourceModelIdInputContainer_${siteIdForForm}`; // Container to hold input/select
        modelIdInputContainer.className = 'flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0';

        let modelIdEditableElement = document.createElement('input');
        modelIdEditableElement.type = 'text';
        modelIdEditableElement.id = `sourceModelId_${siteIdForForm}`;
        modelIdEditableElement.name = `sourceModelId_${siteIdForForm}`;
        modelIdEditableElement.value = isEditing ? siteData.modelId : '';
        modelIdEditableElement.placeholder = '例如: gpt-4-turbo';
        modelIdEditableElement.className = 'w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors';
        modelIdInputContainer.appendChild(modelIdEditableElement);

        const detectModelsButton = document.createElement('button');
        detectModelsButton.type = 'button';
        detectModelsButton.innerHTML = '<iconify-icon icon="carbon:search-locate" class="mr-1"></iconify-icon>檢測';
        detectModelsButton.title = '從此 Base URL 檢測可用模型';
        detectModelsButton.className = 'px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center justify-center w-full sm:w-auto';
        modelIdInputContainer.appendChild(detectModelsButton);

        const searchModelsButton = document.createElement('button');
        searchModelsButton.type = 'button';
        searchModelsButton.id = `sourceModelSearchBtn_${siteIdForForm}`;
        searchModelsButton.innerHTML = '<iconify-icon icon="carbon:search" class="mr-1"></iconify-icon>搜尋模型';
        searchModelsButton.className = 'px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:text-blue-600 hover:border-blue-400 transition-colors flex-shrink-0 flex items-center disabled:opacity-60 disabled:cursor-not-allowed';
        searchModelsButton.disabled = true;
        modelIdInputContainer.appendChild(searchModelsButton);
        modelIdGroup.appendChild(modelIdInputContainer);

        // Temporary API Key for detection
        const tempApiKeyInput = createConfigInput(`sourceTempApiKey_${siteIdForForm}`, 'API Key (檢測時使用，可留空)', '', 'password', '如需臨時檢測可填寫 Key', null, {autocomplete: 'new-password'});
        tempApiKeyInput.classList.add('text-xs'); // Smaller label
        tempApiKeyInput.querySelector('label').classList.add('text-gray-500');
        tempApiKeyInput.querySelector('input').classList.add('text-xs', 'py-1');
        const tempHint = document.createElement('p');
        tempHint.className = 'mt-1 text-[11px] text-slate-400';
        tempHint.textContent = '如已在下方“API Key”列表中新增 Key，可留空自動使用。';
        tempApiKeyInput.appendChild(tempHint);
        modelIdGroup.appendChild(tempApiKeyInput); // Add it below the model ID input group

        form.appendChild(modelIdGroup);
        // Event listener for detectModelsButton
        detectModelsButton.addEventListener('click', async () => {
            const baseUrl = document.getElementById(`sourceApiBaseUrl_${siteIdForForm}`).value.trim();
            let tempApiKey = document.getElementById(`sourceTempApiKey_${siteIdForForm}`).value.trim();
            let usedStoredKey = false;

            if (!baseUrl) {
                showNotification('請輸入 API Base URL 以檢測模型。', 'warning');
                return;
            }
            if (!tempApiKey && typeof loadModelKeys === 'function') {
                const storedKeys = (loadModelKeys(`custom_source_${siteIdForForm}`) || [])
                    .filter(k => k && k.value && k.value.trim() && k.status !== 'invalid');
                if (storedKeys.length > 0) {
                    tempApiKey = storedKeys[0].value.trim();
                    usedStoredKey = true;
                }
            }
            if (!tempApiKey) {
                showNotification('未找到可用的 API Key，請在下方新增或臨時輸入再檢測。', 'warning');
                return;
            }

            detectModelsButton.disabled = true;
            detectModelsButton.innerHTML = '<iconify-icon icon="carbon:circle-dash" class="animate-spin mr-1"></iconify-icon>檢測中...';

            const endpointModeSelect = document.getElementById(`sourceEndpointMode_${siteIdForForm}`);
            const requestFormatSelect = document.getElementById(`sourceRequestFormat_${siteIdForForm}`);
            const endpointModeValue = endpointModeSelect ? endpointModeSelect.value : 'auto';
            const requestFormatValue = requestFormatSelect ? requestFormatSelect.value : 'openai';

            try {
                const detectedModels = await window.modelDetector.detectModelsForModal(baseUrl, tempApiKey, requestFormatValue, endpointModeValue);
                if (usedStoredKey) {
                    showNotification && showNotification('已使用已儲存的 Key 進行模型檢測。', 'info');
                }
                showNotification(`檢測到 ${detectedModels.length} 個模型。`, 'success');

                const cacheKey = `custom_source_${siteIdForForm}`;
                if (!detectedModels || detectedModels.length === 0) {
                    setModelSearchCache(cacheKey, []);
                    searchModelsButton.disabled = true;
                    if (typeof showNotification === 'function') {
                        showNotification('未返回模型列表，請檢查 Base URL 或 API Key。', 'info');
                    }
                    return;
                }

                const currentModelIdValue = document.getElementById(`sourceModelId_${siteIdForForm}`).value;
                const newSelect = document.createElement('select');
                newSelect.id = `sourceModelId_${siteIdForForm}`; // Keep the same ID for form submission
                newSelect.name = `sourceModelId_${siteIdForForm}`;
                newSelect.className = 'w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors';

                // Option for manual input
                const manualOption = document.createElement('option');
                manualOption.value = "__manual_input__"; // Special value
                manualOption.textContent = "-- 手動輸入其他模型 --";
                newSelect.appendChild(manualOption);

                const normalized = [];
                detectedModels.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = model.name || model.id;
                    newSelect.appendChild(option);
                    normalized.push({
                        value: model.id,
                        label: model.name || model.id,
                        description: model.rawName || ''
                    });
                });

                // Replace the input with the select
                const inputContainer = document.getElementById(`sourceModelIdInputContainer_${siteIdForForm}`);
                const oldInput = document.getElementById(`sourceModelId_${siteIdForForm}`);
                inputContainer.insertBefore(newSelect, oldInput); // Insert select before old input
                if(oldInput) oldInput.remove(); // Remove the old text input
                modelIdEditableElement = newSelect; // Update reference

                setModelSearchCache(cacheKey, normalized);
                registerModelSearchIntegration({
                    key: cacheKey,
                    selectEl: newSelect,
                    buttonEl: searchModelsButton,
                    title: `選擇模型（${document.getElementById(`sourceDisplayName_${siteIdForForm}`).value || '自定義源'}）`,
                    placeholder: '搜尋模型 ID...',
                    emptyMessage: '未找到比對的模型',
                    onEmpty: () => {
                        if (!detectModelsButton.disabled) detectModelsButton.click();
                        return true;
                    }
                });
                searchModelsButton.disabled = false;

                // Try to set the value
                let modelFoundInSelect = false;
                if (currentModelIdValue) {
                    const existingOption = Array.from(newSelect.options).find(opt => opt.value === currentModelIdValue);
                    if (existingOption) {
                        newSelect.value = currentModelIdValue;
                        modelFoundInSelect = true;
                    }
                }
                if (!modelFoundInSelect && detectedModels.length > 0 && !currentModelIdValue) {
                     newSelect.value = detectedModels[0].id; // Default to first detected if no prior value
                } else if (!modelFoundInSelect && currentModelIdValue) {
                    newSelect.value = "__manual_input__"; // Fallback to manual if current value not in list
                    // We might need to re-create a text input here if manual is selected and there was a value
                    // For now, this just selects "manual input" in the dropdown.
                }

                // If manual input is selected, and there was a value, we might want to show a text input again.
                // This part can be enhanced later for a smoother UX when switching back to manual from select.

            } catch (error) {
                showNotification(`模型檢測失敗: ${error.message}`, 'error');
                console.error("Model detection error in form:", error);
                setModelSearchCache(`custom_source_${siteIdForForm}`, []);
                searchModelsButton.disabled = true;
            } finally {
                detectModelsButton.disabled = false;
                detectModelsButton.innerHTML = '<iconify-icon icon="carbon:search-locate" class="mr-1"></iconify-icon>檢測';
            }
        });
        // --- End of Enhanced Model ID Input ---

        const requestFormatOptions = [
            { value: 'openai', text: 'OpenAI 格式' }, { value: 'anthropic', text: 'Anthropic 格式' }, { value: 'gemini', text: 'Google Gemini 格式' }
        ];
        form.appendChild(createConfigSelect(`sourceRequestFormat_${siteIdForForm}`, '請求格式', isEditing ? siteData.requestFormat : 'openai', requestFormatOptions, () => {}));

        form.appendChild(createConfigInput(`sourceTemperature_${siteIdForForm}`, '溫度 (0-2)', isEditing ? siteData.temperature : 0.5, 'number', '0.5', () => {}, {min:0, max:2, step:0.01}));
        form.appendChild(createConfigInput(`sourceMaxTokens_${siteIdForForm}`, '最大 Tokens', isEditing ? siteData.max_tokens : 8000, 'number', '8000', () => {}, {min:1, step:1}));

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'flex space-x-2 pt-3 border-t mt-2';

        const saveButton = document.createElement('button');
        saveButton.type = 'submit';
        saveButton.innerHTML = '<iconify-icon icon="carbon:save" class="mr-1"></iconify-icon>儲存';
        saveButton.className = 'px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = '取消';
        cancelButton.className = 'px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors';
        cancelButton.addEventListener('click', () => {
            formContainer.classList.add('hidden');
            formContainer.innerHTML = '';
            if (currentSelectedSourceSiteId) {
                selectSourceSite(currentSelectedSourceSiteId);
            } else if (Object.keys(loadAllCustomSourceSites()).length > 0){
                selectSourceSite(Object.keys(loadAllCustomSourceSites())[0]);
            } else {
                 keyManagerColumn.innerHTML = '<p class="text-sm text-gray-500">請選擇或新增一個源站以管理其 API Keys。</p>';
            }
        });

        buttonsDiv.appendChild(saveButton);
        buttonsDiv.appendChild(cancelButton);
        form.appendChild(buttonsDiv);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newSiteData = {
                id: siteIdForForm,
                displayName: document.getElementById(`sourceDisplayName_${siteIdForForm}`).value.trim(),
                apiBaseUrl: document.getElementById(`sourceApiBaseUrl_${siteIdForForm}`).value.trim(),
                // Get modelId from the input/select, which now shares the same ID
                modelId: document.getElementById(`sourceModelId_${siteIdForForm}`).value === '__manual_input__' ? '' : document.getElementById(`sourceModelId_${siteIdForForm}`).value.trim(),
                requestFormat: document.getElementById(`sourceRequestFormat_${siteIdForForm}`).value,
                temperature: parseFloat(document.getElementById(`sourceTemperature_${siteIdForForm}`).value),
                max_tokens: parseInt(document.getElementById(`sourceMaxTokens_${siteIdForForm}`).value),
                availableModels: isEditing && siteData.availableModels ? siteData.availableModels : [],
                endpointMode: document.getElementById(`sourceEndpointMode_${siteIdForForm}`).value
            };

            if (!newSiteData.displayName || !newSiteData.apiBaseUrl || !newSiteData.modelId) {
                if (typeof showNotification === 'function') showNotification('顯示名稱、API Base URL 和模型 ID 不能為空！', 'error');
                return;
            }

            saveCustomSourceSite(newSiteData);
            if (typeof showNotification === 'function') showNotification(`源站 "${newSiteData.displayName}" 已${isEditing ? '更新' : '新增'}。`, 'success');
            formContainer.classList.add('hidden');
            formContainer.innerHTML = '';
            currentSelectedSourceSiteId = siteIdForForm;
            renderSourceSitesList();
            selectSourceSite(siteIdForForm);
        });
        formContainer.appendChild(form);
        document.getElementById(`sourceDisplayName_${siteIdForForm}`).focus();
    }

    function renderKeyManagerForModel(modelKeyOrSourceSiteModelName) {
        keyManagerColumn.innerHTML = '';
        if (currentManagerUI && typeof currentManagerUI.destroy === 'function') {
             currentManagerUI.destroy();
        }
        currentManagerUI = new KeyManagerUI(
            modelKeyOrSourceSiteModelName,
            keyManagerColumn,
            handleTestKey,
            handleTestAllKeys,
            loadModelKeys,
            saveModelKeys
        );

        // 追加：對於 Gemini 提供“檢測可用模型並設為預設”的小面板
        if (modelKeyOrSourceSiteModelName === 'gemini') {
            const panel = document.createElement('div');
            panel.className = 'mt-4 p-3 border rounded-md bg-blue-50';
            panel.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div class="text-sm text-blue-800 font-medium">Gemini 可用模型檢測</div>
                    <button id="detectGeminiModelsBtn" class="px-2 py-1 text-xs border rounded hover:bg-white w-full sm:w-auto">檢測</button>
                </div>
                <div id="geminiModelsArea" class="mt-2 text-sm text-gray-700 space-y-2">
                    <span class="text-gray-500">點選“檢測”從 Google API 拉取模型列表</span>
                </div>
            `;
            keyManagerColumn.appendChild(panel);

            const detectBtn = panel.querySelector('#detectGeminiModelsBtn');
            const area = panel.querySelector('#geminiModelsArea');
            let searchBtn;
            detectBtn.onclick = async () => {
                const keys = (loadModelKeys('gemini') || []).filter(k => k.status !== 'invalid' && k.value);
                if (keys.length === 0) { area.innerHTML = '<span class="text-red-600">無可用 Gemini API Key</span>'; return; }
                const apiKey = keys[0].value.trim();
                detectBtn.disabled = true; detectBtn.textContent = '檢測中...';
                let searchBtn;
                try {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
                    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
                    const data = await resp.json();
                    const items = Array.isArray(data.models || data.data) ? (data.models || data.data) : [];
                    if (items.length === 0) { area.innerHTML = '<span class="text-gray-500">未返回模型列表</span>'; return; }
                    const select = document.createElement('select');
                    select.className = 'mt-2 w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors';
                    const normalized = [];
                    items.forEach(m => {
                        const id = m.name ? String(m.name).split('/').pop() : (m.id || '');
                        if (!id || normalized.some(n => n.value === id)) return;
                        const opt = document.createElement('option');
                        opt.value = id; opt.textContent = id;
                        select.appendChild(opt);
                        const display = m.displayName || m.description || '';
                        normalized.push({ value: id, label: id, description: display });
                    });
                    const cacheKey = 'gemini_key_manager_detect_list';
                    setModelSearchCache(cacheKey, normalized);
                    searchBtn = document.createElement('button');
                    searchBtn.className = 'mt-2 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:text-blue-600 hover:border-blue-400 transition-colors flex items-center justify-center w-full sm:w-auto';
                    searchBtn.innerHTML = '<iconify-icon icon="carbon:search" class="mr-1" width="14"></iconify-icon>搜尋模型';
                    registerModelSearchIntegration({
                        key: cacheKey,
                        selectEl: select,
                        buttonEl: searchBtn,
                        title: '選擇 Gemini 模型',
                        placeholder: '搜尋模型 ID 或名稱...',
                        emptyMessage: '未找到比對的模型',
                        onEmpty: () => {
                            detectBtn.click();
                            return true;
                        },
                        onSelect: (value) => {
                            if (select.value !== value) {
                                select.value = value;
                                select.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    });
                    searchBtn.disabled = normalized.length === 0;

                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'mt-2 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded w-full sm:w-auto';
                    saveBtn.textContent = '設為預設模型';
                    saveBtn.onclick = () => {
                        saveModelConfig('gemini', { preferredModelId: select.value });
                        if (typeof showNotification === 'function') showNotification(`Gemini 預設模型已設為 ${select.value}`, 'success');
                    };
                    area.innerHTML = '';
                    const controls = document.createElement('div');
                    controls.className = 'mt-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center gap-2';
                    controls.appendChild(select);
                    controls.appendChild(searchBtn);
                    controls.appendChild(saveBtn);
                    area.appendChild(controls);
                } catch (e) {
                    console.error(e);
                    area.innerHTML = `<span class="text-red-600">檢測失敗: ${e.message}</span>`;
                    setModelSearchCache('gemini_key_manager_detect_list', []);
                    if (searchBtn) searchBtn.disabled = true;
                } finally {
                    detectBtn.disabled = false; detectBtn.textContent = '檢測';
                }
            };
        }        // 追加：DeepSeek 檢測面板
        if (modelKeyOrSourceSiteModelName === 'deepseek') {
            const panel = document.createElement('div');
            panel.className = 'mt-4 p-3 border rounded-md bg-blue-50';
            panel.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div class="text-sm text-blue-800 font-medium">DeepSeek 可用模型檢測</div>
                    <button id="detectDeepseekModelsBtn" class="px-2 py-1 text-xs border rounded hover:bg-white w-full sm:w-auto">檢測</button>
                </div>
                <div id="deepseekModelsArea" class="mt-2 text-sm text-gray-700 space-y-2">
                    <span class="text-gray-500">點選“檢測”從 DeepSeek API 拉取模型列表</span>
                </div>
            `;
            keyManagerColumn.appendChild(panel);

            const detectBtn = panel.querySelector('#detectDeepseekModelsBtn');
            const area = panel.querySelector('#deepseekModelsArea');

            detectBtn.onclick = async () => {
                const keys = (loadModelKeys('deepseek') || []).filter(k => k.status !== 'invalid' && k.value);
                if (keys.length === 0) {
                    area.innerHTML = '<span class="text-red-600">無可用 DeepSeek API Key</span>';
                    return;
                }

                const apiKey = keys[0].value.trim();
                detectBtn.disabled = true;
                detectBtn.textContent = '檢測中...';

                let searchBtn;

                try {
                    const resp = await fetch('https://api.deepseek.com/v1/models', {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

                    const data = await resp.json();
                    const items = Array.isArray(data.data) ? data.data : [];

                    if (items.length === 0) {
                        area.innerHTML = '<span class="text-gray-500">未返回模型列表</span>';
                        setModelSearchCache('deepseek_key_manager_detect_list', []);
                        return;
                    }

                    const select = document.createElement('select');
                    select.className = 'mt-2 w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors';

                    const normalized = [];
                    items.forEach(m => {
                        const id = m.id;
                        if (!id || normalized.some(n => n.value === id)) return;
                        const opt = document.createElement('option');
                        opt.value = id;
                        opt.textContent = id;
                        select.appendChild(opt);
                        normalized.push({ value: id, label: id, description: '' });
                    });

                    const cacheKey = 'deepseek_key_manager_detect_list';
                    setModelSearchCache(cacheKey, normalized);

                    searchBtn = document.createElement('button');
                    searchBtn.className = 'mt-2 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:text-blue-600 hover:border-blue-400 transition-colors flex items-center justify-center w-full sm:w-auto';
                    searchBtn.innerHTML = '<iconify-icon icon="carbon:search" class="mr-1" width="14"></iconify-icon>搜尋模型';

                    registerModelSearchIntegration({
                        key: cacheKey,
                        selectEl: select,
                        buttonEl: searchBtn,
                        title: '選擇 DeepSeek 模型',
                        placeholder: '搜尋模型 ID...',
                        emptyMessage: '未找到比對的模型',
                        onEmpty: () => { detectBtn.click(); return true; },
                        onSelect: value => {
                            if (select.value !== value) {
                                select.value = value;
                                select.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    });
                    searchBtn.disabled = normalized.length === 0;

                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'mt-2 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded w-full sm:w-auto';
                    saveBtn.textContent = '設為預設模型';
                    saveBtn.onclick = () => {
                        saveModelConfig('deepseek', { preferredModelId: select.value });
                        showNotification && showNotification(`DeepSeek 預設模型已設為 ${select.value}`, 'success');
                    };

                    area.innerHTML = '';
                    const controls = document.createElement('div');
                    controls.className = 'mt-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center gap-2';
                    controls.appendChild(select);
                    controls.appendChild(searchBtn);
                    controls.appendChild(saveBtn);
                    area.appendChild(controls);
                } catch (error) {
                    console.error(error);
                    area.innerHTML = `<span class="text-red-600">檢測失敗: ${error.message}</span>`;
                    setModelSearchCache('deepseek_key_manager_detect_list', []);
                    if (searchBtn) searchBtn.disabled = true;
                } finally {
                    detectBtn.disabled = false;
                    detectBtn.textContent = '檢測';
                }
            };
        }

        if (modelKeyOrSourceSiteModelName === 'tongyi') {
        const panel = document.createElement('div');
        panel.className = 'mt-4 p-3 border rounded-md bg-blue-50';
        panel.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div class="text-sm text-blue-800 font-medium">通義 可用模型檢測</div>
                <button id="detectTongyiModelsBtn" class="px-2 py-1 text-xs border rounded hover:bg-white w-full sm:w-auto">檢測</button>
            </div>
            <div id="tongyiModelsArea" class="mt-2 text-sm text-gray-700 space-y-2">
                <span class="text-gray-500">點選“檢測”從 DashScope API 拉取模型列表</span>
            </div>
        `;
        keyManagerColumn.appendChild(panel);
        const detectBtn = panel.querySelector('#detectTongyiModelsBtn');
        const area = panel.querySelector('#tongyiModelsArea');
        detectBtn.onclick = async () => {
            let keys = (loadModelKeys('tongyi') || []);
            keys = keys.filter(k => k.status !== 'invalid' && k.value);
            if (keys.length === 0) {
                area.innerHTML = '<span class="text-red-600">無可用 通義 API Key</span>';
                return;
            }
            const apiKey = keys[0].value.trim();
            detectBtn.disabled = true;
            detectBtn.textContent = '檢測中...';
            let searchBtn;
            try {
                const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
                const data = await resp.json();
                const items = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : (Array.isArray(data?.data?.models) ? data.data.models : []));
                if (!items || items.length === 0) {
                    area.innerHTML = '<span class="text-gray-500">未返回模型列表</span>';
                    setModelSearchCache('tongyi_key_manager_detect_list', []);
                    return;
                }
                const select = document.createElement('select');
                select.className = 'mt-2 w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors';
                const normalized = [];
                items.forEach(m => {
                    const id = m.model || m.id || m.name;
                    if (!id || normalized.some(n => n.value === id)) return;
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = id;
                    select.appendChild(opt);
                    normalized.push({ value: id, label: id, description: '' });
                });
                const cacheKey = 'tongyi_key_manager_detect_list';
                setModelSearchCache(cacheKey, normalized);
                searchBtn = document.createElement('button');
                searchBtn.className = 'mt-2 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:text-blue-600 hover:border-blue-400 transition-colors flex items-center justify-center w-full sm:w-auto';
                searchBtn.innerHTML = '<iconify-icon icon="carbon:search" class="mr-1" width="14"></iconify-icon>搜尋模型';
                registerModelSearchIntegration({
                    key: cacheKey,
                    selectEl: select,
                    buttonEl: searchBtn,
                    title: '選擇通義模型',
                    placeholder: '搜尋模型 ID...',
                    emptyMessage: '未找到比對的模型',
                    onEmpty: () => { detectBtn.click(); return true; },
                    onSelect: value => {
                        if (select.value !== value) {
                            select.value = value;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
                searchBtn.disabled = normalized.length === 0;
                const saveBtn = document.createElement('button');
                saveBtn.className = 'mt-2 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded w-full sm:w-auto';
                saveBtn.textContent = '設為預設模型';
                saveBtn.onclick = () => {
                    saveModelConfig('tongyi', { preferredModelId: select.value });
                    showNotification && showNotification(`通義 預設模型已設為 ${select.value}`, 'success');
                };
                area.innerHTML = '';
                const controls = document.createElement('div');
                controls.className = 'mt-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center gap-2';
                controls.appendChild(select);
                controls.appendChild(searchBtn);
                controls.appendChild(saveBtn);
                area.appendChild(controls);
            } catch (e) {
                if (typeof console !== 'undefined') console.error(e);
                area.innerHTML = `<span class="text-red-600">檢測失敗: ${e.message}</span>`;
                setModelSearchCache('tongyi_key_manager_detect_list', []);
                if (searchBtn) searchBtn.disabled = true;
            } finally {
                detectBtn.disabled = false;
                detectBtn.textContent = '檢測';
            }
        };
        }

        // 追加：火山 檢測面板（兩個火山條目使用 'volcano'）
        if (modelKeyOrSourceSiteModelName === 'volcano') {
            const panel = document.createElement('div');
            panel.className = 'mt-4 p-3 border rounded-md bg-blue-50';
            panel.innerHTML = `
                <div class="flex items-center justify之間">
                    <div class="text-sm text-blue-800 font-medium">火山 可用模型檢測</div>
                    <button id="detectVolcanoModelsBtn" class="px-2 py-1 text-xs border rounded hover:bg白">檢測</button>
                </div>
                <div id="volcanoModelsArea" class="mt-2 text-sm text-gray-700">
                    <span class="text-gray-500">點選“檢測”從 Ark API 拉取模型列表</span>
                </div>
            `;
            // 修正誤植
            panel.innerHTML = panel.innerHTML.replace('之間', 'between').replace('白', 'white');
            keyManagerColumn.appendChild(panel);
            const detectBtn = panel.querySelector('#detectVolcanoModelsBtn');
            const area = panel.querySelector('#volcanoModelsArea');
            // 按使用者要求：不提供線上檢測，改為手動輸入並儲存
            if (detectBtn && area) {
                detectBtn.style.display = 'none';
                area.innerHTML = `
                    <div class="flex items-center gap-2">
                        <input id="volcanoKMManualInput" type="text" class="w-full sm:flex-grow px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500" placeholder="例如：doubao-1-5-pro-32k-250115">
                        <button id="volcanoKMSaveBtn" class="px-4 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded whitespace-nowrap">設為預設</button>
                    </div>
                    <div class="mt-1 text-xs text-gray-600">不提供線上檢測；請手動輸入模型ID。</div>
                `;
                try { const cfg = loadModelConfig && loadModelConfig('volcano'); if (cfg && (cfg.preferredModelId || cfg.modelId)) area.querySelector('#volcanoKMManualInput').value = cfg.preferredModelId || cfg.modelId; } catch {}
                const saveBtn = area.querySelector('#volcanoKMSaveBtn');
                saveBtn.onclick = () => {
                    const val = (area.querySelector('#volcanoKMManualInput').value || '').trim();
                    if (!val) { showNotification && showNotification('請輸入模型ID', 'warning'); return; }
                    saveModelConfig && saveModelConfig('volcano', { preferredModelId: val });
                    showNotification && showNotification(`火山 預設模型已設為 ${val}`, 'success');
                };
                // 不再綁定線上檢測
                return;
            }
            if (detectBtn) detectBtn.style.display = 'none';
            if (area) area.innerHTML = '<span class="text-gray-600">請手動輸入模型ID，或在設定中選擇。示例：<code>doubao-1-5-pro-32k-250115</code> / <code>deepseek-v3-250324</code></span>';
        }

        if (modelKeyOrSourceSiteModelName === 'deeplx') {
            const panel = document.createElement('div');
            panel.className = 'mt-4 p-3 border rounded-md bg-blue-50';
            const placeholderHtml = DEEPLX_DEFAULT_ENDPOINT_TEMPLATE.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            panel.innerHTML = `
                <div class="text-sm text-blue-800 font-medium mb-2">DeepLX 介面模板</div>
                <div class="flex items-center gap-2">
                    <input id="deeplxEndpointTemplateInput-manager" type="text" class="flex-1 px-3 py-1.5 border border-blue-200 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors" placeholder="${placeholderHtml}">
                    <button id="deeplxEndpointResetBtn-manager" type="button" class="px-2 py-1 text-xs border border-blue-300 rounded hover:bg-white">恢復預設</button>
                </div>
                <p class="mt-2 text-xs text-blue-900 leading-5">模板中的 <code>&lt;api-key&gt;</code> 或 {API_KEY} 會自動替換為當前使用的 Key，可用於自建代理地址。</p>
            `;
            keyManagerColumn.appendChild(panel);
            const inputEl = panel.querySelector('#deeplxEndpointTemplateInput-manager');
            const resetBtn = panel.querySelector('#deeplxEndpointResetBtn-manager');
            setupDeeplxEndpointInput(inputEl, resetBtn);
        }
    }

    // 匯出到全域，供模組使用
    window.renderKeyManagerForModel = renderKeyManagerForModel;

    async function handleTestKey(modelName, keyObject) {
        if (!currentManagerUI) return;
        currentManagerUI.updateKeyStatus(keyObject.id, 'testing');

        let modelConfigForTest = {};
        let apiEndpointForTest = null;
        // 獲取友好顯示名
        let modelDisplayNameForNotification = modelName;
        if (modelName.startsWith('custom_source_')) {
            const sourceSiteId = modelName.replace('custom_source_', '');
            if (typeof loadAllCustomSourceSites === 'function') {
                const sites = loadAllCustomSourceSites();
                const site = sites[sourceSiteId];
                if (site && site.displayName) {
                    modelDisplayNameForNotification = `"${site.displayName}"`;
                } else {
                    modelDisplayNameForNotification = `源站點 (ID: ...${sourceSiteId.slice(-8)})`;
                }
            }
        }

        if (modelName.startsWith('custom_source_')) {
            const sourceSiteId = modelName.replace('custom_source_', '');
            const allSites = loadAllCustomSourceSites();
            const siteConfig = allSites[sourceSiteId];
            if (siteConfig && siteConfig.apiBaseUrl && siteConfig.modelId) {
                apiEndpointForTest = siteConfig.apiBaseUrl;
                modelConfigForTest = {
                    ...siteConfig,
                    apiEndpoint: siteConfig.apiBaseUrl
                };
            } else {
                currentManagerUI.updateKeyStatus(keyObject.id, 'untested');
                showNotification(`源站配置不完整 (ID: ${sourceSiteId})，缺少 API Base URL 或模型 ID。請在配置區完善。`, 'error');
                return;
            }
        } else {
            modelConfigForTest = loadModelConfig(modelName) || {};
            apiEndpointForTest = modelConfigForTest.apiEndpoint;
        }

        try {
            let isValid = false;
            if (modelName === 'mistral') {
                // 特殊處理：使用 Mistral 的 /v1/models 端點快速測活
                try {
                    const resp = await fetch('https://api.mistral.ai/v1/models', {
                        headers: { 'Authorization': `Bearer ${keyObject.value}` }
                    });
                    isValid = resp.ok;
                } catch (e) {
                    isValid = false;
                }
            } else {
                const r = await testModelKey(modelName, keyObject.value, modelConfigForTest, apiEndpointForTest);
                isValid = !!r;
            }
            currentManagerUI.updateKeyStatus(keyObject.id, isValid ? 'valid' : 'invalid');
            showNotification(`Key (${keyObject.value.substring(0,4)}...) for ${modelDisplayNameForNotification} test: ${isValid ? '有效' : '無效'}`, isValid ? 'success' : 'error');
        } catch (error) {
            console.error("Key test error:", error);
            currentManagerUI.updateKeyStatus(keyObject.id, 'invalid');
            showNotification(`Key test for ${modelDisplayNameForNotification} failed: ${error.message}`, 'error');
        }
    }

    async function handleTestAllKeys(modelName, keysArray) {
        // 獲取友好顯示名
        let modelDisplayNameForNotification = modelName;
        if (modelName.startsWith('custom_source_')) {
            const sourceSiteId = modelName.replace('custom_source_', '');
            if (typeof loadAllCustomSourceSites === 'function') {
                const sites = loadAllCustomSourceSites();
                const site = sites[sourceSiteId];
                if (site && site.displayName) {
                    modelDisplayNameForNotification = `"${site.displayName}"`;
                } else {
                    modelDisplayNameForNotification = `源站點 (ID: ...${sourceSiteId.slice(-8)})`;
                }
            }
        }
        showNotification(`開始批次測試 ${modelDisplayNameForNotification} 的 ${keysArray.length} 個Key...`, 'info');
        for (const keyObj of keysArray) {
            await handleTestKey(modelName, keyObj);
        }
        showNotification(`${modelDisplayNameForNotification} 的所有 Key 測試完畢。`, 'info');
    }

    // 舊的 updateCustomModelConfig, handleDetectModelsInModal might need to be adapted or removed
    // if their functionality is now part of the source site form.
    // The functions createConfigInput and createConfigSelect are still useful for the new form.

    window.refreshKeyManagerForModel = (modelName, keyId, newStatus) => {
        if (modelKeyManagerModal && !modelKeyManagerModal.classList.contains('hidden') &&
            currentManagerUI && currentManagerUI.modelName === modelName) {
            currentManagerUI.updateKeyStatus(keyId, newStatus);
        }
    };

    // 新增: Event-Listener für das customSourceSiteSelect Dropdown-Menü
    if (customSourceSiteSelect) {
        customSourceSiteSelect.addEventListener('change', () => {
            // 儲存當前選中的源站點ID到設定
            let settings = typeof loadSettings === 'function' ? loadSettings() : {};
            settings.selectedCustomSourceSiteId = customSourceSiteSelect.value;
            if (typeof saveSettings === 'function') {
                saveSettings(settings);
            } else {
                localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
            }
            // 原有邏輯
            saveCurrentSettings && saveCurrentSettings();
            // 新增：切換後立即重新整理資訊面板
            if (typeof updateCustomSourceSiteInfo === 'function') {
                updateCustomSourceSiteInfo(customSourceSiteSelect.value);
            }
            if (typeof window.refreshCustomSourceSiteInfo === 'function') {
                window.refreshCustomSourceSiteInfo({ autoSelect: false });
            }
        });
    }

    // 新增：更新自定義源站點資訊函式
    function updateCustomSourceSiteInfo(siteId) {
        const infoContainer = document.getElementById('customSourceSiteInfo');
        const manageKeyBtn = document.getElementById('manageSourceSiteKeyBtn');

        if (!infoContainer || !manageKeyBtn) return;

        if (!siteId) {
            infoContainer.classList.add('hidden');
            manageKeyBtn.classList.add('hidden');
            return;
        }

        try {
            const sites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
            const site = sites[siteId];

            if (site) {
                // 顯示資訊面板和按鈕
                infoContainer.classList.remove('hidden');
                manageKeyBtn.classList.remove('hidden');

                // 獲取可用API Key數量 - 移到前面以便模板使用
                const customSourceKeysCount = typeof loadModelKeys === 'function' ?
                    (loadModelKeys(`custom_source_${siteId}`) || []).filter(k => k.status !== 'invalid').length : 0;

                const endpointModeLabels = {
                    auto: '自動補全 /v1/... (預設)',
                    chat: '僅追加 /chat/completions',
                    manual: '完整端點（不自動追加）'
                };
                const endpointModeLabel = endpointModeLabels[site.endpointMode] || endpointModeLabels.auto;

                // 構建HTML以展示站點資訊
                let infoHtml = `
                    <div class="p-3">
                        <h3 class="font-bold text-gray-800 text-xl mt-1 mb-2">${site.displayName || '未命名源站點'}</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div><span class="font-medium">API Base URL:</span> <span class="text-gray-600">${site.apiBaseUrl || '未設定'}</span></div>
                            <div><span class="font-medium">端點補全:</span> <span class="text-gray-600">${endpointModeLabel}</span></div>
                            <div><span class="font-medium">當前模型:</span> <span id="currentModelPreview_${siteId}" class="text-gray-600">${site.modelId || '未設定'}</span></div>
                            <div><span class="font-medium">請求格式:</span> <span class="text-gray-600">${site.requestFormat || 'openai'}</span></div>
                            <div><span class="font-medium">溫度:</span> <span class="text-gray-600">${site.temperature || '0.5'}</span></div>
                        </div>`;

                // 如果有可用模型列表，則展示為可選擇的下拉選單
                if (site.availableModels && site.availableModels.length > 0) {
                    infoHtml += `
                        <div class="mt-2 border-t border-dashed pt-2">
                            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div class="font-medium mb-1">選擇模型:</div>
                                <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-2 gap-2">
                                    <span class="text-xs text-green-600 flex items-center">
                                        <iconify-icon icon="carbon:checkmark-filled" class="mr-1" width="14"></iconify-icon>
                                        檢測到 ${site.availableModels.length} 個可用模型
                                    </span>
                                    <button id="reDetectModelsBtn_${siteId}" class="ml-1 px-1.5 py-0.5 bg-gray-100 hover:bg-blue-100 text-blue-600 rounded flex items-center" title="重新檢測模型">
                                        <iconify-icon icon="carbon:renew" class="animate-spin-slow" width="16"></iconify-icon>
                                    </button>
                                </div>
                            </div>
                            <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0 mt-2">
                                <select id="sourceSiteModelSelect_${siteId}" class="w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors">`;

                    site.availableModels.forEach(model => {
                        const modelName = model.name || model.id;
                        const modelId = model.id;
                        const isSelected = modelId === site.modelId;
                        infoHtml += `<option value="${modelId}" ${isSelected ? 'selected' : ''}>${modelName}</option>`;
                    });

                    // 新增當前使用的模型（如果不在列表中）
                    if (site.modelId && !site.availableModels.some(m => m.id === site.modelId)) {
                        infoHtml += `<option value="${site.modelId}" selected>${site.modelId} (當前使用)</option>`;
                    }

                    infoHtml += `</select>
                                <button id="sourceSiteModelSearchBtn_${siteId}" class="px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:text-blue-600 hover:border-blue-400 transition-colors flex items-center whitespace-nowrap">
                                    <iconify-icon icon="carbon:search" class="mr-1" width="14"></iconify-icon>
                                    搜尋模型
                                </button>
                            </div>
                        </div>`;
                } else {
                    // 沒有可用模型列表時，顯示更明確的提示和手動輸入選項
                    infoHtml += `<div class="mt-2 pt-2 border-t">
                        <div class="flex justify-between items-center">
                            <div class="font-medium mb-1">模型ID:</div>
                            <div class="text-xs text-gray-500">
                                <iconify-icon icon="carbon:information" class="mr-1" width="14"></iconify-icon>
                                <span>還未檢測模型</span>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                            <input type="text" id="manualModelId_${siteId}" class="w-full sm:flex-1 px-3 py-1.5 border border-gray-300 rounded-l-md text-sm" value="${site.modelId || ''}" placeholder="例如: gpt-4-turbo">
                            <button id="saveManualModelBtn_${siteId}" class="px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded sm:rounded-r-md text-xs flex items-center justify-center w-full sm:w-auto">
                                <iconify-icon icon="carbon:save" class="mr-1" width="14"></iconify-icon>
                                儲存
                            </button>
                        </div>
                        <div class="mt-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <span class="text-blue-600 inline-flex items-center">
                                <iconify-icon icon="carbon:arrow-right" class="mr-1" width="14"></iconify-icon>
                                點選
                                <button id="infoDetectModelsBtn_${siteId}" class="mx-1 px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center">
                                    <iconify-icon icon="carbon:model-alt" class="mr-1" width="12"></iconify-icon>
                                    檢測可用模型
                                </button>
                            </span>

                            <!-- 檢查是否有可用的API Key -->
                            <span class="${customSourceKeysCount > 0 ? 'text-green-600' : 'text-red-600'} inline-flex items-center">
                                ${customSourceKeysCount > 0 ?
                                  `<iconify-icon icon="carbon:checkmark" class="mr-1" width="14"></iconify-icon>${customSourceKeysCount}個可用Key` :
                                  `<iconify-icon icon="carbon:warning" class="mr-1" width="14"></iconify-icon>請先新增API Key`}
                            </span>
                        </div>
                    </div>`;
                }

                // 新增鍵檢查資訊和API Key管理按鈕
                infoHtml += `
                    <div class="mt-6 pt-3 border-t border-dashed ">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div class="flex flex-col sm:flex-row sm:items-center gap-3 h-full">
                                <span class="font-medium">API Keys:</span>
                                <span class="text-sm ${customSourceKeysCount > 0 ? 'text-green-600' : 'text-red-600'} flex items-center">
                                    ${customSourceKeysCount > 0 ?
                                      `<iconify-icon icon="carbon:checkmark-filled" class="mr-1" width="14"></iconify-icon>${customSourceKeysCount}個可用Key` :
                                      `<iconify-icon icon="carbon:warning-filled" class="mr-1" width="14"></iconify-icon>無可用Key`}
                                </span>
                            </div>
                            <button id="infoManageKeyBtn_${siteId}" class="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs flex items-center justify-center w-full sm:w-auto" style="min-height:2.4em;">
                                <iconify-icon icon="carbon:api" class="mr-1" width="14"></iconify-icon>
                                管理API Key
                            </button>
                        </div>
                    </div>`;

                infoHtml += `</div>`;
                infoContainer.innerHTML = infoHtml;

                const cacheKey = `custom_source_${siteId}`;
                const modelSelectEl = document.getElementById(`sourceSiteModelSelect_${siteId}`);
                const searchBtnEl = document.getElementById(`sourceSiteModelSearchBtn_${siteId}`);
                if (modelSelectEl) {
                    const normalizedModels = [];
                    const seenModelIds = new Set();
                    (site.availableModels || []).forEach(model => {
                        const modelId = model && (model.id || model.name);
                        if (!modelId || seenModelIds.has(modelId)) return;
                        seenModelIds.add(modelId);
                        normalizedModels.push({
                            value: modelId,
                            label: model.name || modelId,
                            description: model.rawName || model.description || ''
                        });
                    });
                    setModelSearchCache(cacheKey, normalizedModels);

                    if (searchBtnEl) {
                        registerModelSearchIntegration({
                            key: cacheKey,
                            selectEl: modelSelectEl,
                            buttonEl: searchBtnEl,
                            title: `選擇模型（${site.displayName || '自定義源'}）`,
                            placeholder: '搜尋模型 ID...',
                            emptyMessage: '未找到比對的模型',
                            onEmpty: () => {
                                const reDetectBtn = document.getElementById(`reDetectModelsBtn_${siteId}`) || document.getElementById(`infoDetectModelsBtn_${siteId}`);
                                if (reDetectBtn && !reDetectBtn.disabled) {
                                    reDetectBtn.click();
                                }
                                return true;
                            },
                            onSelect: (value) => {
                                if (!modelSelectEl || !value) return;
                                if (modelSelectEl.value !== value) {
                                    modelSelectEl.value = value;
                                    modelSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }
                        });
                    }
                } else if (searchBtnEl) {
                    searchBtnEl.disabled = true;
                }

                // 隱藏底部的管理按鈕 - 因為我們有了內聯的按鈕
                manageKeyBtn.classList.add('hidden');

                // 為內聯的管理API Key按鈕新增點選事件
                const infoManageKeyBtn = document.getElementById(`infoManageKeyBtn_${siteId}`);
                if (infoManageKeyBtn) {
                    infoManageKeyBtn.onclick = function() {
                        // 開啟模型Key管理彈出視窗
                        document.getElementById('modelKeyManagerBtn').click();

                        // 等待彈出視窗開啟，然後設定正確的模型和源站點
                        setTimeout(() => {
                            if (typeof selectModelForManager === 'function') {
                                // 選擇custom模型
                                selectModelForManager('custom');

                                // 再選擇特定源站點
                                if (typeof selectSourceSite === 'function') {
                                    selectSourceSite(siteId);
                                }
                            }
                        }, 100);
                    };
                }

                // 為內聯的檢測模型按鈕新增點選事件
                const infoDetectModelsBtn = document.getElementById(`infoDetectModelsBtn_${siteId}`);
                if (infoDetectModelsBtn) {
                    infoDetectModelsBtn.onclick = function() {
                        // 直接呼叫外部檢測按鈕的點選事件
                        const mainDetectBtn = document.getElementById('detectModelsBtn');
                        if (mainDetectBtn) {
                            mainDetectBtn.click();
                        }
                    };
                }
                // 為重新檢測按鈕新增事件
                const reDetectBtn = document.getElementById(`reDetectModelsBtn_${siteId}`);
                if (reDetectBtn) {
                    reDetectBtn.onclick = function() {
                        const mainDetectBtn = document.getElementById('detectModelsBtn');
                        if (mainDetectBtn) {
                            mainDetectBtn.click();
                        }
                    };
                }

                // 新增新功能：綁定模型選擇/儲存事件
                setTimeout(() => {
                    // 1. 如果有可用模型下拉選單，綁定儲存事件
                    const modelSelect = document.getElementById(`sourceSiteModelSelect_${siteId}`);

                    // 新增：如果 site.modelId 為空，自動選中第一個並儲存
                    if (modelSelect && (!site.modelId || !site.availableModels.some(m => m.id === site.modelId))) {
                        if (modelSelect.options.length > 0) {
                            const firstModelId = modelSelect.options[0].value;
                            if (!site.modelId || site.modelId !== firstModelId) {
                                site.modelId = firstModelId;
                                if (typeof saveCustomSourceSite === 'function') {
                                    saveCustomSourceSite(site);
                                }
                                modelSelect.value = firstModelId;
                                // 同步預覽
                                const previewText = document.getElementById(`currentModelPreview_${siteId}`);
                                if (previewText) {
                                    previewText.textContent = modelSelect.options[0].text || firstModelId;
                                }
                            }
                        }
                    }

                    if (modelSelect) {
                        // 下拉選單change事件 - 實現即時預覽並儲存
                        modelSelect.addEventListener('change', () => {
                            const selectedOption = modelSelect.options[modelSelect.selectedIndex];
                            const previewText = document.getElementById(`currentModelPreview_${siteId}`);
                            if (previewText) {
                                previewText.textContent = selectedOption.text || selectedOption.value;
                                previewText.classList.add('font-semibold', 'text-blue-600');
                                setTimeout(() => {
                                    previewText.classList.remove('font-semibold', 'text-blue-600');
                                }, 1500);
                            }
                            // 新增：切換時立即儲存
                            site.modelId = modelSelect.value;
                            // 新增：同步寫入 lastSelectedCustomModel
                            localStorage.setItem('lastSelectedCustomModel', modelSelect.value);
                            if (typeof saveCustomSourceSite === 'function') {
                                saveCustomSourceSite(site);
                            }
                        });
                    }

                    // 2. 如果有手動輸入模型ID，綁定儲存事件
                    const saveManualModelBtn = document.getElementById(`saveManualModelBtn_${siteId}`);
                    const manualModelInput = document.getElementById(`manualModelId_${siteId}`);

                    if (saveManualModelBtn && manualModelInput) {
                        saveManualModelBtn.addEventListener('click', () => {
                            if (manualModelInput && manualModelInput.value.trim()) {
                                saveSelectedModelForSite(siteId, manualModelInput.value.trim());

                                // 更新當前模型顯示
                                const previewText = document.getElementById(`currentModelPreview_${siteId}`);
                                if (previewText) {
                                    previewText.textContent = manualModelInput.value.trim();
                                    previewText.classList.add('font-semibold', 'text-blue-600');
                                    setTimeout(() => {
                                        previewText.classList.remove('font-semibold', 'text-blue-600');
                                    }, 1500);
                                }
                            } else {
                                showNotification('請輸入有效的模型ID', 'warning');
                            }
                        });

                        // 新增Enter鍵儲存功能
                        manualModelInput.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter' && manualModelInput.value.trim()) {
                                saveManualModelBtn.click();
                            }
                        });
                    }
                }, 100);
            } else {
                infoContainer.classList.add('hidden');
                manageKeyBtn.classList.add('hidden');
            }
        } catch (e) {
            console.error("Error updating custom source site info:", e);
            infoContainer.classList.add('hidden');
            manageKeyBtn.classList.add('hidden');
        }
    }

    /**
     * 儲存選定的模型ID到源站點配置
     * @param {string} siteId - 源站點ID
     * @param {string} modelId - 要儲存的模型ID
     */
    function saveSelectedModelForSite(siteId, modelId) {
        if (!siteId || !modelId) return;

        try {
            const sites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
            const site = sites[siteId];

            if (site) {
                // 更新模型ID
                site.modelId = modelId;

                // 儲存更新後的配置
                if (typeof saveCustomSourceSite === 'function') {
                    saveCustomSourceSite(site);
                    showNotification(`已將模型 "${modelId}" 設為源站 "${site.displayName || siteId}" 的預設模型`, 'success');

                    // 重新整理資訊顯示
                    updateCustomSourceSiteInfo(siteId);
                } else {
                    showNotification('儲存失敗：saveCustomSourceSite 函式不可用', 'error');
                }
            } else {
                showNotification(`儲存失敗：未找到ID為 "${siteId}" 的源站點配置`, 'error');
            }
        } catch (e) {
            console.error('Error saving selected model for site:', e);
            showNotification('儲存模型ID時發生錯誤', 'error');
        }
    }

    // 新增：自定義事件監聽，用於外部呼叫源站點選擇
    window.addEventListener('selectCustomSourceSiteForKeyManager', function(e) {
        if (e.detail && typeof e.detail === 'string') {
            if (typeof selectModelForManager === 'function') {
                selectModelForManager('custom');
                if (typeof selectSourceSite === 'function') {
                    selectSourceSite(e.detail);
                }
            }
        }
    });

    // 新增：選擇源站點完畢後首次載入資訊的鉤子
    // 新增：把選擇源站和顯示資訊函式暴露給全域
    window.updateCustomSourceSiteInfo = updateCustomSourceSiteInfo;

    // 新增：使管理函式可全域訪問
    window.selectModelForManager = selectModelForManager;
    window.selectSourceSite = selectSourceSite;

    // 新增：檢測可用模型按鈕事件
    if (detectModelsBtn) {
        detectModelsBtn.addEventListener('click', function() {
            const selectedSiteId = customSourceSiteSelect.value;
            if (!selectedSiteId) {
                showNotification('請先選擇一個源站點', 'warning');
                return;
            }

            // 先檢查該源站點是否已有API Key
            const keysForSite = typeof loadModelKeys === 'function' ?
                loadModelKeys(`custom_source_${selectedSiteId}`) : [];

            const validKeys = keysForSite.filter(key => key.status === 'valid' || key.status === 'untested');

            if (validKeys.length === 0) {
                // 沒有可用的Key，提示使用者先新增Key
                if (confirm(`源站點沒有可用的API Key。是否立即新增Key？`)) {
                    // 開啟模型管理器並直接跳到Key管理介面
                    document.getElementById('modelKeyManagerBtn').click();

                    setTimeout(() => {
                        if (typeof selectModelForManager === 'function') {
                            selectModelForManager('custom');
                            if (typeof selectSourceSite === 'function') {
                                selectSourceSite(selectedSiteId);
                            }
                        }
                    }, 100);
                }
                return;
            }

            // 有可用的Key，則直接開始檢測模型
            const sites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
            const site = sites[selectedSiteId];

            if (!site || !site.apiBaseUrl) {
                showNotification('源站點配置不完整，缺少API Base URL', 'error');
                return;
            }

            // 這裡使用已有的Key進行檢測，而不是要求使用者重新輸入
            showNotification('開始使用現有API Key檢測可用模型，請稍候...', 'info');

            // 修改為直接使用現有Key檢測
            if (typeof window.modelDetector === 'object' && typeof window.modelDetector.detectModelsForSite === 'function') {
                detectModelsWithExistingKeys(selectedSiteId, site, validKeys);
            } else {
                showNotification('模型檢測器不可用，請重新整理頁面重試', 'error');
            }
        });
    }

    /**
     * 使用現有API Key檢測源站點的可用模型
     * @param {string} siteId - 源站點ID
     * @param {object} site - 源站點配置物件
     * @param {array} validKeys - 可用的API Key列表
     */
    async function detectModelsWithExistingKeys(siteId, site, validKeys) {
        let detectBtn = document.getElementById('detectModelsBtn');
        let originalBtnText = detectBtn.innerHTML;

        try {
            // 修改按鈕狀態
            detectBtn.disabled = true;
            detectBtn.innerHTML = '<iconify-icon icon="carbon:circle-dash" class="animate-spin mr-1"></iconify-icon>檢測中...';

            // 嘗試每個Key，直到成功檢測到模型
            let modelsDetected = [];
            let successfulKey = null;

            const requestFormat = site.requestFormat || 'openai';
            const endpointMode = site.endpointMode || 'auto';

            for (const key of validKeys) {
                try {
                    showNotification(`正在嘗試使用Key (${key.value.substring(0, 4)}...) 檢測模型`, 'info');
                    modelsDetected = await window.modelDetector.detectModelsForSite(
                        site.apiBaseUrl,
                        key.value,
                        requestFormat,
                        endpointMode
                    );

                    if (modelsDetected && modelsDetected.length > 0) {
                        successfulKey = key;
                        break; // 成功檢測到模型，跳出迴圈
                    }
                } catch (keyError) {
                    console.warn(`Key (${key.value.substring(0, 4)}...) 檢測模型失敗:`, keyError);
                    // 繼續嘗試下一個Key
                }
            }

            if (modelsDetected.length === 0) {
                throw new Error('所有Key都無法成功檢測到模型');
            }

            // 更新源站點的可用模型列表
            site.availableModels = modelsDetected;

            // 如果源站點還沒有設定預設模型，則設定為第一個檢測到的模型
            if (!site.modelId && modelsDetected.length > 0) {
                site.modelId = modelsDetected[0].id;
            }

            // 儲存更新後的源站點配置
            if (typeof saveCustomSourceSite === 'function') {
                saveCustomSourceSite(site);
                showNotification(`已檢測到 ${modelsDetected.length} 個可用模型，並已儲存到源站點配置`, 'success');

                // 重新整理源站點資訊顯示
                updateCustomSourceSiteInfo(siteId);
            } else {
                throw new Error('儲存配置失敗：saveCustomSourceSite 函式不可用');
            }

            // 更新使用成功的Key狀態
            if (successfulKey && typeof window.refreshKeyManagerForModel === 'function') {
                // 標記為有效狀態
                window.refreshKeyManagerForModel(`custom_source_${siteId}`, successfulKey.id, 'valid');
            }

        } catch (error) {
            console.error('檢測模型失敗:', error);
            showNotification(`檢測模型失敗: ${error.message}`, 'error');
        } finally {
            // 恢復按鈕狀態
            detectBtn.disabled = false;
            detectBtn.innerHTML = originalBtnText;
        }
    }
});
