// ui/prompt-pool-ui.js
// 翻譯提示詞池 UI 控制器

/**
 * 提示詞池 UI 管理器
 */
class PromptPoolUI {
  constructor() {

        this.promptPool = window.translationPromptPool;
        this.currentEditingId = null;
        this.settingsKey = 'promptPoolSettings'; // localStorage鍵名
        this.sessionLockedPrompt = null; // 會話內固定提示詞
        this.selectedIds = new Set(); // 多選集合
        // 排序/過濾預設值
        this.sortKey = null;
        this.sortAsc = true;
        this.filterHealth = 'all';
        this.searchKeyword = '';

        // 先載入設定，再綁定事件，再根據設定渲染
        this.loadSettings();
        this.initializeEventListeners();
        this.handlePromptModeChange();
    this.updateUI();

    // 後端同步事件：Prompt Pool 更新後重新整理介面
    try {
      window.addEventListener('pb:prompt-pool-updated', () => {
        this.updateUI();
      });
    } catch {}

        // 延遲載入模型列表，確保其他腳本已載入
        setTimeout(() => { this.populateAvailableModels(); }, 1000);
  }

    /**
     * 載入儲存的設定
     */
    loadSettings() {
        try {
            const savedSettings = localStorage.getItem(this.settingsKey);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);

                // 恢復提示詞模式
                if (settings.promptMode) {
                    const modeRadio = document.getElementById(`promptMode${settings.promptMode.charAt(0).toUpperCase() + settings.promptMode.slice(1)}`);
                    if (modeRadio) {
                        modeRadio.checked = true;
                    }
                }

                // 恢復參考提示詞
                if (settings.referenceSystemPrompt) {
                    const systemPromptEl = document.getElementById('referenceSystemPrompt');
                    if (systemPromptEl) systemPromptEl.value = settings.referenceSystemPrompt;
                }
                if (settings.referenceUserPrompt) {
                    const userPromptEl = document.getElementById('referenceUserPrompt');
                    if (userPromptEl) userPromptEl.value = settings.referenceUserPrompt;
                }

                // 恢復生成引數
                if (settings.variationCount) {
                    const countEl = document.getElementById('variationCount');
                    if (countEl) countEl.value = settings.variationCount;
                }
                if (settings.similarityControl) {
                    const similarityEl = document.getElementById('similarityControl');
                    if (similarityEl) similarityEl.value = settings.similarityControl;
                }
                // 恢復生成並行
                if (settings.generationConcurrency) {
                    const ccEl = document.getElementById('generationConcurrency');
                    if (ccEl) ccEl.value = settings.generationConcurrency;
                }
                if (settings.generationModel) {
                    const modelEl = document.getElementById('generationModel');
                    if (modelEl) {
                        // 延遲設定，等模型列表載入完成
                        setTimeout(() => {
                            modelEl.value = settings.generationModel;
                        }, 1500);
                    }
                }

                // 恢復提示詞池模式
                if (settings.promptPoolMode) {
                    const poolModeEl = document.getElementById('promptPoolMode');
                    if (poolModeEl) poolModeEl.value = settings.promptPoolMode;
                }

                // 恢復生成器元提示詞；若沒有儲存值則填入預設
                const sysEl = document.getElementById('generatorSystemPrompt');
                const userEl = document.getElementById('generatorUserPrompt');
                if (sysEl) sysEl.value = settings.generatorSystemPrompt || this.buildDefaultGeneratorSystemPrompt();
                if (userEl) userEl.value = settings.generatorUserPrompt || this.buildDefaultGeneratorUserPrompt();

                // 恢復生成並行
                if (settings.generationConcurrency) {
                    const ccEl = document.getElementById('generationConcurrency');
                    if (ccEl) ccEl.value = settings.generationConcurrency;
                }

                // 恢復生成語言
                const langEl = document.getElementById('generatorLanguage');
                if (langEl) langEl.value = settings.generatorLanguage || '中文';
            }
        } catch (error) {
            console.error('[PromptPoolUI] 載入設定失敗:', error);
        }
    }

    /**
     * 儲存當前設定
     */
    saveSettings() {
        try {
            const settings = {
                // 提示詞模式
                promptMode: document.querySelector('input[name="promptMode"]:checked')?.value,

                // 參考提示詞
                referenceSystemPrompt: document.getElementById('referenceSystemPrompt')?.value,
                referenceUserPrompt: document.getElementById('referenceUserPrompt')?.value,

                // 生成引數
                variationCount: document.getElementById('variationCount')?.value,
                similarityControl: document.getElementById('similarityControl')?.value,
                generationModel: document.getElementById('generationModel')?.value,
                generationConcurrency: document.getElementById('generationConcurrency')?.value,
                generatorLanguage: document.getElementById('generatorLanguage')?.value || '中文',

                // 提示詞池模式
                promptPoolMode: document.getElementById('promptPoolMode')?.value,

                // 生成器元提示詞（可選）
                generatorSystemPrompt: document.getElementById('generatorSystemPrompt')?.value,
                generatorUserPrompt: document.getElementById('generatorUserPrompt')?.value,

                // 儲存時間戳
                savedAt: Date.now()
            };

            localStorage.setItem(this.settingsKey, JSON.stringify(settings));
        } catch (error) {
            console.error('[PromptPoolUI] 儲存設定失敗:', error);
        }
    }

    /**
     * 初始化事件監聽器
     */
    initializeEventListeners() {
        // 提示詞模式切換
        document.querySelectorAll('input[name="promptMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.handlePromptModeChange();
                this.saveSettings(); // 儲存設定
            });
        });
        // 提示詞池內部步驟 Tabs（已移除）

        // 生成變體按鈕
        const generateBtn = document.getElementById('generateVariationsBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateVariations());
        }

        // 生成器元提示詞面板開關
        const toggleGenBtn = document.getElementById('toggleGeneratorPromptsBtn');
        if (toggleGenBtn) {
            toggleGenBtn.addEventListener('click', () => {
                const panel = document.getElementById('generatorPromptsPanel');
                if (panel) {
                    panel.classList.toggle('hidden');
                    // 首次展開時，如未填寫，則填入預設生成器提示詞
                    if (!panel.classList.contains('hidden')) {
                        const sysEl = document.getElementById('generatorSystemPrompt');
                        const userEl = document.getElementById('generatorUserPrompt');
                        if (sysEl && !sysEl.value) sysEl.value = this.buildDefaultGeneratorSystemPrompt();
                        if (userEl && !userEl.value) userEl.value = this.buildDefaultGeneratorUserPrompt();
                    }
                }
            });
        }

        // 重置為預設
        const resetGenBtn = document.getElementById('resetGeneratorPromptsBtn');
        if (resetGenBtn) {
            resetGenBtn.addEventListener('click', () => {
                const sysEl = document.getElementById('generatorSystemPrompt');
                const userEl = document.getElementById('generatorUserPrompt');
                if (sysEl) sysEl.value = this.buildDefaultGeneratorSystemPrompt();
                if (userEl) userEl.value = this.buildDefaultGeneratorUserPrompt();
                this.saveSettings();
                this.showNotification('已重置為預設生成器提示詞', 'info');
                const panel = document.getElementById('generatorPromptsPanel');
                if (panel && panel.classList.contains('hidden')) panel.classList.remove('hidden');
            });
        }

        // 清空池按鈕
        const clearBtn = document.getElementById('clearPoolBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearPool());
        }

        // 匯入匯出按鈕
        const importBtn = document.getElementById('importPoolBtn');
        const exportBtn = document.getElementById('exportPoolBtn');
        if (importBtn) importBtn.addEventListener('click', () => this.importPool());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportPool());

        // 健康設定按鈕
        const healthSettingsBtn = document.getElementById('healthSettingsBtn');
        if (healthSettingsBtn) {
            healthSettingsBtn.addEventListener('click', () => this.openHealthSettings());
        }

        // 監聽引數變化並儲存設定
        const parameterInputs = [
            'referenceSystemPrompt',
            'referenceUserPrompt',
            'variationCount',
            'similarityControl',
            'generationModel',
            'promptPoolMode',
            'generatorSystemPrompt',
            'generatorUserPrompt',
            'generationConcurrency',
            'generatorLanguage'
        ];

        parameterInputs.forEach(inputId => {
            const element = document.getElementById(inputId);
            if (element) {
                const eventType = element.type === 'textarea' ? 'input' : 'change';
                element.addEventListener(eventType, () => {
                    // 延遲儲存，避免頻繁寫入
                    clearTimeout(this.saveTimeout);
                    this.saveTimeout = setTimeout(() => {
                        this.saveSettings();
                    }, 500);
                });
            }
        });

        // 初始化模式切換和可用模型列表
        this.handlePromptModeChange();
        this.populateAvailableModels();
        this.updateHealthOverview();

        // 定期更新健康狀態顯示
        setInterval(() => {
            this.updateHealthOverview();
        }, 30000); // 30秒更新一次
    }

    // ===== 生成器提示詞預設構造 =====
    getSimilarityDescriptionUI(similarity) {
        const s = parseFloat(similarity || '0.6');
        if (s <= 0.3) return '改寫幅度很大（語序與措辭差異顯著）';
        if (s <= 0.5) return '改寫幅度中等（保持等價約束，表達有明顯變化）';
        if (s <= 0.7) return '改寫幅度適中（整體表達有所變化）';
        return '改寫幅度較小（細微措辭/順序調整）';
    }

    buildDefaultGeneratorSystemPrompt() {
        // 預設使用 ${count} 佔位符，實際生成時再替換
        return (
`你是資深提示詞工程師，負責在不改變風格與約束的前提下，生成同風格的改寫變體。

任務：基於參考提示詞，生成 \${count} 個“同風格、同約束、同輸出要求”的翻譯提示詞變體；僅在措辭、語序、句式、連線詞與段落組織上做改寫，以提升穩定性與一致性。

強制要求：
1. 返回 JSON，包含欄位 variations（陣列）。
2. 每個變體包含：name（名稱）、systemPrompt（系統提示）、userPromptTemplate（使用者提示模板）、description（簡要說明）。必須同時給出 systemPrompt 與 userPromptTemplate 兩個欄位。
3. 相似度控制：請按請求給定的相似度要求理解（無需在文字中體現具體數值）。注意：風格與約束必須完全一致，僅體現措辭與語序差異。
4. userPromptTemplate 必須且僅出現一次佔位符：\${targetLangName} 與 \${content}。
5. 嚴禁改變參考提示詞的風格、語氣、規則、術語偏好與輸出格式要求；嚴禁引入“學術/商務/口語/文學”等風格標籤的切換或暗示。
6. 允許調整表述順序、同義替換與句式變化，但要保持語義與約束等價。
7. 僅輸出嚴格的 JSON 物件（不包含 Markdown 程式碼塊、註釋或額外文字）。
8. 使用單行（minified）JSON 輸出：不得換行、不得縮排。
9. 所有可讀文字（如 name/description）請使用 \${genlanguage} 編寫。`
        );
    }

    buildDefaultGeneratorUserPrompt() {
        const sysRef = document.getElementById('referenceSystemPrompt')?.value || '';
        const userRef = document.getElementById('referenceUserPrompt')?.value || '';
        return (
`參考提示詞（須保持風格/規則/輸出要求一致）：

**系統提示：**
${sysRef}

**使用者提示模板：**
${userRef}

請基於以上參考提示詞生成 \${count} 個“同風格改寫”變體：保持風格、語氣、規則與輸出要求不變，僅做措辭/語序/句式的等價改寫。

每個變體必須包含 systemPrompt 與 userPromptTemplate 兩個欄位；並且確保 userPromptTemplate 都包含且僅包含一次 \${targetLangName} 與 \${content} 佔位符。嚴格輸出為單行 JSON（無任何額外文字/提示/程式碼塊）。
請使用 \${genlanguage} 編寫所有需要人類閱讀的文字（如 name/description）。`
        );
    }

    /**
     * 填充可用的AI模型列表（使用當前源站點的模型列表）
     */
    populateAvailableModels() {
        const modelSelect = document.getElementById('generationModel');
        if (!modelSelect) return;

        // 儲存當前選擇
        const currentSelection = modelSelect.value;

        // 清空現有選項
        modelSelect.innerHTML = '';

        // 填充模型列表

        try {
            let hasAvailableModels = false;

            // 1. 新增預設模型選項
            const predefinedModels = [
                { value: 'mistral', name: 'Mistral Large' },
                { value: 'deepseek', name: 'DeepSeek V3' },
                { value: 'gemini', name: 'Gemini 2.0' }
            ];

            predefinedModels.forEach(model => {
                const keys = typeof loadModelKeys === 'function' ? loadModelKeys(model.value) : [];
                const validKeys = keys.filter(key => key.status === 'valid' || key.status === 'untested' || !key.status);

                if (validKeys.length > 0) {
                    const option = document.createElement('option');
                    option.value = model.value;
                    option.textContent = model.name;
                    modelSelect.appendChild(option);
                    hasAvailableModels = true;
                }
            });

            // 2. 獲取當前選中的自定義源站點及其模型列表
            if (typeof loadAllCustomSourceSites === 'function') {
                const allSites = loadAllCustomSourceSites();

                // 獲取當前選中的源站點ID（從設定中讀取）
                let settings = {};
                if (typeof loadSettings === 'function') {
                    settings = loadSettings();
                } else {
                    try { settings = JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}'); } catch (e) { settings = {}; }
                }

                const currentSiteId = settings.selectedCustomSourceSiteId;
                if (currentSiteId && allSites[currentSiteId]) {
                    const currentSite = allSites[currentSiteId];

                    // 檢查這個源站點是否有可用的API金鑰
                    const customModelKey = `custom_source_${currentSiteId}`;
                    const keys = typeof loadModelKeys === 'function' ? loadModelKeys(customModelKey) : [];
                    const validKeys = keys.filter(key => key.status === 'valid' || key.status === 'untested' || !key.status);

                    if (validKeys.length > 0) {
                        console.log(`[PromptPoolUI] 源站點 ${currentSiteId} 有可用金鑰`);

                        // 如果源站點有可用模型列表，新增所有模型
                        if (currentSite.availableModels && currentSite.availableModels.length > 0) {
                            console.log(`[PromptPoolUI] 新增源站點的 ${currentSite.availableModels.length} 個可用模型:`, currentSite.availableModels);

                            currentSite.availableModels.forEach(model => {
                                const option = document.createElement('option');
                                option.value = `${currentSiteId}:${model.id}`; // 使用站點ID:模型ID格式
                                option.textContent = `${model.name || model.id} (${currentSite.displayName || '自定義'})`;
                                modelSelect.appendChild(option);
                                hasAvailableModels = true;
                                //console.log(`[PromptPoolUI] 已新增模型選項: ${option.textContent} (value: ${option.value})`);
                            });
                        } else if (currentSite.modelId) {
                            // 如果沒有模型列表但有預設模型ID，新增預設模型
                            console.log(`[PromptPoolUI] 新增源站點的預設模型: ${currentSite.modelId}`);
                            const option = document.createElement('option');
                            option.value = `${currentSiteId}:${currentSite.modelId}`;
                            option.textContent = `${currentSite.modelId} (${currentSite.displayName || '自定義'})`;
                            modelSelect.appendChild(option);
                            hasAvailableModels = true;
                            console.log(`[PromptPoolUI] 已新增預設模型選項: ${option.textContent} (value: ${option.value})`);
                        } else {
                            console.log(`[PromptPoolUI] 源站點 ${currentSiteId} 既沒有availableModels也沒有modelId`);
                        }
                    } else {
                        console.warn(`[PromptPoolUI] 源站點 ${currentSiteId} 沒有可用金鑰。金鑰檢查結果:`, {
                            keys: keys,
                            validKeys: validKeys
                        });
                    }
                } else {
                    console.log('[PromptPoolUI] 沒有選中的源站點或源站點不存在。', {
                        currentSiteId: currentSiteId,
                        availableSites: Object.keys(allSites)
                    });
                }
            } else {
                console.error('[PromptPoolUI] loadAllCustomSourceSites函式不可用');
            }

            // 如果沒有可用模型，新增提示
            if (!hasAvailableModels) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '請先在模型管理中配置API金鑰和源站點';
                option.disabled = true;
                modelSelect.appendChild(option);
            }

            // 恢復之前的選擇（如果還存在）
            if (currentSelection && [...modelSelect.options].some(opt => opt.value === currentSelection)) {
                modelSelect.value = currentSelection;
            }

            console.log(`[PromptPoolUI] 模型列表填充完成，共 ${modelSelect.options.length} 個選項`);

        } catch (error) {
            console.error('填充可用模型列表失敗:', error);
            const errorOption = document.createElement('option');
            errorOption.value = "";
            errorOption.textContent = "載入模型列表失敗";
            modelSelect.appendChild(errorOption);
            modelSelect.disabled = true;
        }
    }

    /**
     * 檢查指定模型是否有可用的API金鑰（簡化版本，照抄ui.js）
     */
    hasAvailableKeys(modelName) {
        console.log(`[PromptPoolUI] 檢查模型 ${modelName} 的金鑰可用性`);

        const keys = typeof loadModelKeys === 'function' ? loadModelKeys(modelName) : [];
        const validKeys = keys.filter(key => key.status === 'valid' || key.status === 'untested' || !key.status);
        const hasKeys = validKeys.length > 0;

        console.log(`[PromptPoolUI] 模型 ${modelName} 金鑰檢查結果: ${hasKeys}`, keys);
        return hasKeys;
    }

    /**
     * 處理提示詞模式切換
     */
    handlePromptModeChange() {
        const selectedMode = document.querySelector('input[name="promptMode"]:checked')?.value;

        // 隱藏所有容器
        document.getElementById('customPromptsContainer')?.classList.add('hidden');
        document.getElementById('promptPoolContainer')?.classList.add('hidden');

        // 顯示對應容器
        if (selectedMode === 'custom') {
            document.getElementById('customPromptsContainer')?.classList.remove('hidden');
        } else if (selectedMode === 'pool') {
            document.getElementById('promptPoolContainer')?.classList.remove('hidden');
            this.updateUI();
        }

        // 更新Tabs樣式
        const tabMap = {
            builtin: document.getElementById('tabBuiltin'),
            custom: document.getElementById('tabCustom'),
            pool: document.getElementById('tabPool')
        };
        Object.entries(tabMap).forEach(([mode, el]) => {
            if (!el) return;
            if (mode === selectedMode) {
                el.classList.remove('text-gray-500','border-transparent','hover:text-gray-700','hover:border-gray-300');
                el.classList.add('text-blue-600','border-blue-600');
            } else {
                el.classList.remove('text-blue-600','border-blue-600');
                el.classList.add('text-gray-500','border-transparent','hover:text-gray-700','hover:border-gray-300');
            }
        });
    }

    /**
     * 生成提示詞變體
     */
    async generateVariations() {
        const generateBtn = document.getElementById('generateVariationsBtn');
        const generateStatus = document.getElementById('generateStatus');
        if (!generateBtn || !generateStatus) return;

        // 獲取引數
        const referenceSystemPrompt = document.getElementById('referenceSystemPrompt')?.value?.trim();
        const referenceUserPrompt = document.getElementById('referenceUserPrompt')?.value?.trim();
        const count = parseInt(document.getElementById('variationCount')?.value || '10');
        const similarity = parseFloat(document.getElementById('similarityControl')?.value || '0.6');
        const apiModel = document.getElementById('generationModel')?.value;
        const concurrencyRaw = document.getElementById('generationConcurrency')?.value || '1';
        let concurrency = parseInt(concurrencyRaw, 10);
        if (!Number.isFinite(concurrency) || concurrency < 1) concurrency = 1;
        if (concurrency > 10) concurrency = 10;
        const genLanguage = (document.getElementById('generatorLanguage')?.value || '中文').trim() || '中文';

        // 驗證引數
        if (!referenceSystemPrompt || !referenceUserPrompt) {
            this.showNotification('請先填寫參考提示詞', 'warning');
            return;
        }

        if (!apiModel) {
            this.showNotification('請選擇AI模型', 'warning');
            return;
        }

        // 驗證佔位符
        const targetLangCount = (referenceUserPrompt.match(/\$\{targetLangName\}/g) || []).length;
        const contentCount = (referenceUserPrompt.match(/\$\{content\}/g) || []).length;

        if (targetLangCount !== 1 || contentCount !== 1) {
            this.showNotification('參考使用者提示詞必須包含且僅包含一次 ${targetLangName} 和 ${content} 佔位符', 'error');
            return;
        }

        // 獲取API金鑰
        let apiKey;
        try {
            apiKey = await this.getApiKeyForModel(apiModel);
            if (!apiKey) {
                this.showNotification(`模型 ${apiModel} 沒有可用的API金鑰，請先在模型管理中配置`, 'error');
                return;
            }
        } catch (error) {
            this.showNotification(`獲取API金鑰失敗: ${error.message}`, 'error');
            return;
        }

        // 顯示生成狀態
        generateBtn.disabled = true;
        generateStatus.classList.remove('hidden');
        this.showGenerationProgress(`準備生成：${count} × 並行 ${concurrency}，共計 ${count*concurrency} 個`, 10);

        try {
            // 支援在生成器提示詞中使用 ${count} 與 ${genlanguage} 佔位符
            let genSysRaw = document.getElementById('generatorSystemPrompt')?.value?.trim();
            let genUserRaw = document.getElementById('generatorUserPrompt')?.value?.trim();
            if (!genSysRaw) genSysRaw = this.buildDefaultGeneratorSystemPrompt();
            if (!genUserRaw) genUserRaw = this.buildDefaultGeneratorUserPrompt();
            const genSys = genSysRaw
                .replace(/\$\{count\}/g, String(count))
                .replace(/\$\{genlanguage\}/g, genLanguage);
            const genUser = genUserRaw
                .replace(/\$\{count\}/g, String(count))
                .replace(/\$\{genlanguage\}/g, genLanguage);

            // 構造並行任務
            const tasks = [];
            let finished = 0;
            let successBatches = 0;
            let failedBatches = 0;
            const collected = [];
            const totalBatches = concurrency;

            const updateBatchProgress = () => {
                finished++;
                const pct = 30 + Math.round((finished / totalBatches) * 50); // 30%~80% 區間
                this.showGenerationProgress(`AI並行生成中... 已完成 ${finished}/${totalBatches} 次`, pct);
            };

            for (let i = 0; i < totalBatches; i++) {
                tasks.push(
                    (async () => {
                        // 輕微抖動，降低同秒觸發限流機率
                        await new Promise(r => setTimeout(r, 80 * i));
                        let success = false;
                        let lastErr = null;
                        const maxAttempts = 2;
                        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                            try {
                                const arr = await this.promptPool.generateVariationsWithAI(
                                    referenceSystemPrompt,
                                    referenceUserPrompt,
                                    count,
                                    similarity,
                                    apiModel,
                                    apiKey,
                                    { generatorSystemPrompt: genSys, generatorUserPrompt: genUser }
                                );
                                collected.push(...arr);
                                successBatches++;
                                success = true;
                                break;
                            } catch (err) {
                                lastErr = err;
                                const msg = (err && err.message) ? err.message : '';
                                if (attempt < maxAttempts && /429|rate|Too Many|limit/i.test(msg)) {
                                    // 指數退避 + 抖動
                                    const delay = 400 + Math.floor(Math.random()*400) * attempt;
                                    await new Promise(r => setTimeout(r, delay));
                                    continue;
                                }
                                break;
                            }
                        }
                        if (!success) {
                            console.warn('[PromptPoolUI] 並行批次失敗:', lastErr);
                            failedBatches++;
                        }
                        updateBatchProgress();
                    })()
                );
            }

            await Promise.allSettled(tasks);

            // 去重：按 systemPrompt + userPromptTemplate 組合鍵
            const seen = new Set();
            const unique = [];
            for (const v of collected) {
                const key = `${(v.systemPrompt||'').trim()}||${(v.userPromptTemplate||'').trim()}`;
                if (!seen.has(key)) { seen.add(key); unique.push(v); }
            }

            this.showGenerationProgress('驗證並寫入結果...', 90);

            // 新增到池中
            this.promptPool.addVariationsToPool(unique);

            // 更新UI
            this.updateUI();

            this.showGenerationProgress('完成！', 100);

            // 成功/失敗反饋
            const totalExpected = count * totalBatches;
            const msg = `成功生成 ${unique.length}/${totalExpected} 條；批次成功 ${successBatches}，失敗 ${failedBatches}`;
            this.showNotification(msg, failedBatches === 0 ? 'success' : 'warning');

        } catch (error) {
            console.error('AI生成提示詞變體失敗:', error);
            this.showNotification('生成提示詞變體失敗：' + error.message, 'error');
        } finally {
            // 恢復按鈕狀態
            generateBtn.disabled = false;
            generateStatus.classList.add('hidden');
            this.hideGenerationProgress();
        }
    }

    /**
     * 獲取指定模型的API金鑰（處理自定義源站點的新格式，新增詳細除錯）
     */
    async getApiKeyForModel(apiModel) {
        try {
            console.log(`[PromptPoolUI] 獲取模型 ${apiModel} 的API金鑰`);

            let actualModelName = apiModel;

            // 處理自定義源站點的格式: "siteId:modelId"
            if (apiModel.includes(':')) {
                const separatorIndex = apiModel.indexOf(':');
                const siteId = apiModel.slice(0, separatorIndex);
                actualModelName = `custom_source_${siteId}`;
            }

            // 先檢查 loadModelKeys 函式是否可用
            if (typeof loadModelKeys !== 'function') {
                console.error(`[PromptPoolUI] loadModelKeys函式不可用`);
                throw new Error('loadModelKeys函式不可用');
            }

            // 呼叫 loadModelKeys 獲取金鑰
            const keys = loadModelKeys(actualModelName);

            if (!keys) throw new Error('loadModelKeys返回null/undefined');

            if (!Array.isArray(keys)) throw new Error('loadModelKeys返回的不是陣列');

            if (keys.length > 0) {
                // 優先選擇已驗證有效的金鑰
                const validKeys = keys.filter(key => key.status === 'valid');

                if (validKeys.length > 0) {
                    return validKeys[0].value; // 應該是 .value 而不是 .key
                }

                // 如果沒有已驗證的，選擇未測試的
                const untestedKeys = keys.filter(key => key.status === 'untested' || !key.status);

                if (untestedKeys.length > 0) {
                    return untestedKeys[0].value; // 應該是 .value 而不是 .key
                }

                // 如果都沒有，返回第一個
                return keys[0].value; // 應該是 .value 而不是 .key
            }

            throw new Error('未找到可用的API金鑰');

        } catch (error) {
            console.error(`[PromptPoolUI] 獲取模型 ${apiModel} 的API金鑰失敗:`, error);
            throw error;
        }
    }

    /**
     * 顯示生成進度
     */
    showGenerationProgress(message, percentage) {
        // 檢查是否已存在進度條，如果沒有則建立
        let progressContainer = document.getElementById('promptGenerationProgress');
        if (!progressContainer) {
            progressContainer = document.createElement('div');
            progressContainer.id = 'promptGenerationProgress';
            progressContainer.className = 'fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4';
            progressContainer.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                    <div class="flex items-center mb-4">
                        <iconify-icon icon="carbon:ai-status" class="text-blue-600 mr-3" width="24"></iconify-icon>
                        <h3 class="text-lg font-semibold">AI生成提示詞變體</h3>
                    </div>
                    <div class="mb-4">
                        <div class="flex justify-between text-sm text-gray-700 mb-2">
                            <span id="ppProgressMessage">初始化...</span>
                            <span id="ppProgressPercentage">0%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div id="ppProgressBarFill" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 text-center">
                        請稍候，AI正在生成同風格改寫的提示詞...
                    </div>
                </div>
            `;
            document.body.appendChild(progressContainer);
        }

        // 更新進度
        const progressMessage = document.getElementById('ppProgressMessage');
        const progressPercentage = document.getElementById('ppProgressPercentage');
        const progressBarFill = document.getElementById('ppProgressBarFill');

        if (progressMessage) progressMessage.textContent = message;
        if (progressPercentage) progressPercentage.textContent = `${percentage}%`;
        if (progressBarFill) progressBarFill.style.width = `${percentage}%`;
    }

    /**
     * 隱藏生成進度
     */
    hideGenerationProgress() {
        const progressContainer = document.getElementById('promptGenerationProgress');
        if (progressContainer) {
            setTimeout(() => {
                progressContainer.remove();
            }, 1000);
        }
    }

    /**
     * 更新健康狀態概覽
     */
    updateHealthOverview() {
        if (!this.promptPool) return;

        const stats = this.promptPool.getHealthStats();

        // 更新健康狀態計數
        const healthyCountEl = document.getElementById('healthyCount');
        const degradedCountEl = document.getElementById('degradedCount');
        const deactivatedCountEl = document.getElementById('deactivatedCount');
        const successRateEl = document.getElementById('successRate');

        if (healthyCountEl) healthyCountEl.textContent = stats.healthy;
        if (degradedCountEl) degradedCountEl.textContent = stats.degraded;
        if (deactivatedCountEl) deactivatedCountEl.textContent = stats.deactivated;
        if (successRateEl) {
            successRateEl.textContent = `${Math.round(stats.averageSuccessRate * 100)}%`;
        }

        // 更新狀態顏色
        if (stats.deactivated > 0) {
            document.getElementById('healthOverview')?.classList.add('border-red-300');
            document.getElementById('healthOverview')?.classList.remove('border-blue-200');
        } else if (stats.degraded > 0) {
            document.getElementById('healthOverview')?.classList.add('border-yellow-300');
            document.getElementById('healthOverview')?.classList.remove('border-blue-200');
        } else {
            document.getElementById('healthOverview')?.classList.remove('border-red-300', 'border-yellow-300');
            document.getElementById('healthOverview')?.classList.add('border-blue-200');
        }
    }

    /**
     * 開啟健康設定對話方塊
     */
    openHealthSettings() {
        const config = this.promptPool.getHealthConfig();

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-semibold flex items-center">
                        <iconify-icon icon="carbon:health-cross" class="mr-2 text-blue-600" width="20"></iconify-icon>
                        提示詞健康管理設定
                    </h3>
                    <button id="closeHealthSettings" class="text-gray-400 hover:text-red-500">
                        <iconify-icon icon="carbon:close" width="20"></iconify-icon>
                    </button>
                </div>
                <div class="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="flex items-center">
                                <input type="checkbox" id="deactivationEnabled" ${config.deactivationEnabled ? 'checked' : ''} class="mr-2">
                                <span class="text-sm font-medium">啟用失活機制</span>
                            </label>
                            <p class="text-xs text-gray-500 mt-1">連續失敗時自動失活提示詞</p>
                        </div>
                        <div>
                            <label class="flex items-center">
                                <input type="checkbox" id="switchOnFailure" ${config.switchOnFailure ? 'checked' : ''} class="mr-2">
                                <span class="text-sm font-medium">失敗時自動切換</span>
                            </label>
                            <p class="text-xs text-gray-500 mt-1">失敗時切換到其他健康提示詞</p>
                        </div>
                        <div>
                            <label class="flex items-center">
                                <input type="checkbox" id="resurrectionEnabled" ${config.resurrectionEnabled ? 'checked' : ''} class="mr-2">
                                <span class="text-sm font-medium">啟用自動復活</span>
                            </label>
                            <p class="text-xs text-gray-500 mt-1">失活一段時間後自動復活</p>
                        </div>
                        <div>
                            <label class="flex items-center">
                                <input type="checkbox" id="queueManagementEnabled" ${config.queueManagementEnabled ? 'checked' : ''} class="mr-2">
                                <span class="text-sm font-medium">啟用佇列管理</span>
                            </label>
                            <p class="text-xs text-gray-500 mt-1">替換佇列中失敗提示詞的請求</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">最大連續失敗次數</label>
                            <input type="number" id="maxConsecutiveFailures" value="${config.maxConsecutiveFailures}" min="1" max="10" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            <p class="text-xs text-gray-500 mt-1">超過此次數後提示詞將被失活</p>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">復活時間（分鐘）</label>
                            <input type="number" id="resurrectionTimeMinutes" value="${config.resurrectionTimeMinutes}" min="1" max="1440" class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                            <p class="text-xs text-gray-500 mt-1">失活後等待多久自動復活</p>
                        </div>
                    </div>

                    <div class="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <div class="flex items-start">
                            <iconify-icon icon="carbon:information" class="text-blue-500 mr-2 mt-0.5" width="16"></iconify-icon>
                            <div class="text-sm text-blue-800">
                                <p class="font-medium mb-1">智慧健康管理說明：</p>
                                <ul class="text-xs space-y-1 text-blue-700">
                                    <li>• 系統會自動跟蹤每個提示詞的成功率和響應時間</li>
                                    <li>• 連續失敗的提示詞會被降級或失活，保護翻譯質量</li>
                                    <li>• 智慧選擇模式會根據健康狀態分配使用權重</li>
                                    <li>• 失活的提示詞會在指定時間後自動復活重新嘗試</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end space-x-2 p-4 border-t">
                    <button id="cancelHealthSettings" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
                    <button id="saveHealthSettings" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">儲存設定</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 新增事件監聽器
        modal.querySelector('#closeHealthSettings').addEventListener('click', () => {
            modal.remove();
        });
        modal.querySelector('#cancelHealthSettings').addEventListener('click', () => {
            modal.remove();
        });
        modal.querySelector('#saveHealthSettings').addEventListener('click', () => {
            this.saveHealthSettings(modal);
            modal.remove();
        });

        // 點選背景關閉
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * 儲存健康設定
     */
    saveHealthSettings(modal) {
        const newConfig = {
            deactivationEnabled: modal.querySelector('#deactivationEnabled').checked,
            switchOnFailure: modal.querySelector('#switchOnFailure').checked,
            resurrectionEnabled: modal.querySelector('#resurrectionEnabled').checked,
            queueManagementEnabled: modal.querySelector('#queueManagementEnabled').checked,
            maxConsecutiveFailures: parseInt(modal.querySelector('#maxConsecutiveFailures').value),
            resurrectionTimeMinutes: parseInt(modal.querySelector('#resurrectionTimeMinutes').value)
        };

        this.promptPool.updateHealthConfig(newConfig);
        this.showNotification('健康管理設定已更新', 'success');
        this.updateHealthOverview();
    }

    /**
     * 更新提示詞健康顯示
     */
    updateHealthDisplay(promptId) {
        // 更新特定提示詞的健康狀態顯示
        this.updatePromptList();
        this.updateHealthOverview();
    }

    resetFilters() {
        this.searchKeyword = '';
        this.filterHealth = 'all';
        this.sortKey = null;
        this.sortAsc = true;
        this.updatePromptList();
    }

    /**
     * 更新提示詞列表顯示
     */
    updatePromptList() {
        const container = document.getElementById('promptPoolList');
        if (!container) return;

        // 確保提示詞池例項可用
        if (!this.promptPool || typeof this.promptPool.getAllPrompts !== 'function') {
            this.promptPool = (typeof window !== 'undefined') ? window.translationPromptPool : null;
        }
        if (!this.promptPool || typeof this.promptPool.getAllPrompts !== 'function') {
            container.innerHTML = `
                <div class="text-center text-gray-500 text-sm py-8">
                    <iconify-icon icon="carbon:time" class="text-gray-400 mb-2" width="32"></iconify-icon>
                    <p>正在載入提示詞池...</p>
                </div>`;
            setTimeout(() => this.updatePromptList(), 400);
            return;
        }

        let prompts = this.promptPool.getAllPrompts() || [];

        // 過濾
        prompts = prompts.filter(p => {
            const h = p.healthStatus || {};
            const status = h.status || 'unknown';
            const healthPass = this.filterHealth === 'all' || status === this.filterHealth;
            if (!healthPass) return false;
            if (!this.searchKeyword) return true;
            const kw = this.searchKeyword.toLowerCase();
            const text = [p.name, p.systemPrompt, p.userPromptTemplate, (p.tags||[]).join(' ')].join(' ').toLowerCase();
            return text.includes(kw);
        });

        // 排序
        const key = this.sortKey;
        if (key) {
            const healthOrder = { healthy: 0, degraded: 1, deactivated: 2, unknown: 3 };
            const asc = this.sortAsc;
            prompts.sort((a, b) => {
                const ha = a.healthStatus || {}; const hb = b.healthStatus || {};
                const sa = ha.status || 'unknown'; const sb = hb.status || 'unknown';
                const ra = (ha.totalRequests>0)? (ha.successCount/ha.totalRequests): -1;
                const rb = (hb.totalRequests>0)? (hb.successCount/hb.totalRequests): -1;
                const va = {
                    name: a.name || '',
                    category: a.category || '',
                    health: healthOrder[sa],
                    success: ra,
                    requests: ha.totalRequests||0,
                    fails: ha.consecutiveFailures||0,
                    avg: ha.averageResponseTime||0,
                    usage: a.usage_count||0,
                    created: Date.parse(a.created_at||0) || 0
                }[key];
                const vb = {
                    name: b.name || '',
                    category: b.category || '',
                    health: healthOrder[sb],
                    success: rb,
                    requests: hb.totalRequests||0,
                    fails: hb.consecutiveFailures||0,
                    avg: hb.averageResponseTime||0,
                    usage: b.usage_count||0,
                    created: Date.parse(b.created_at||0) || 0
                }[key];
                let cmp = 0;
                if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
                else cmp = (va===vb)?0:((va>vb)?1:-1);
                return asc ? cmp : -cmp;
            });
        }
        
        const header = `
            <thead class="bg-white sticky top-0 z-10">
                <tr class="text-left text-xs text-gray-500">
                    <th class="px-2 py-2"><input type="checkbox" id="ppSelectAllTop" /></th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="name">名稱</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="category">類別</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="health">健康</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="success">成功率</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="requests">請求</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="fails">連續失敗</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="avg">平均耗時</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="usage">使用</th>
                    <th class="px-2 py-2 cursor-pointer" data-sort="created">建立時間</th>
                    <th class="px-2 py-2">操作</th>
                </tr>
            </thead>`;

        const rows = (prompts.length > 0)
            ? prompts.map(p => this.createPromptItemHTML(p)).join('')
            : `<tr><td colspan="11" class="px-3 py-8 text-center text-gray-500">
                   <iconify-icon icon="carbon:ai-status-queued" class="text-gray-400 mb-2" width="24"></iconify-icon>
                   <span>暫無比對的提示詞</span>
                   <button id="ppClearFiltersLink" class="ml-2 text-blue-600 hover:underline text-xs">清除篩選</button>
               </td></tr>`;
        const controls = `
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center space-x-2">
                    <input id="ppFilterInput" type="text" placeholder="搜尋名稱/內容/標籤" class="text-sm border rounded px-2 py-1 w-56" value="${this.searchKeyword.replace(/"/g,'&quot;')}">
                    <select id="ppHealthFilter" class="text-sm border rounded px-2 py-1">
                        <option value="all" ${this.filterHealth==='all'?'selected':''}>全部</option>
                        <option value="healthy" ${this.filterHealth==='healthy'?'selected':''}>健康</option>
                        <option value="degraded" ${this.filterHealth==='degraded'?'selected':''}>降級</option>
                        <option value="deactivated" ${this.filterHealth==='deactivated'?'selected':''}>失活</option>
                    </select>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="text-xs text-gray-500">共 ${prompts.length} 條</div>
                    <button id="ppClearFilters" class="text-xs px-2 py-1 border rounded hover:bg-gray-50 ${ (this.searchKeyword||this.sortKey||this.filterHealth!=='all') ? '' : 'hidden'}">清除篩選</button>
                </div>
            </div>`;

        const table = `
            ${controls}
            <div class="overflow-auto">
                <table class="min-w-full bg-white rounded-lg">
                    ${header}
                    <tbody class="divide-y divide-gray-100">
                        ${rows}
                    </tbody>
                </table>
            </div>`;

        container.innerHTML = table;

        // 頂部全選
        const selectAll = document.getElementById('ppSelectAllTop');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                const checked = e.target.checked;
                document.querySelectorAll('.prompt-select-checkbox').forEach(cb => {
                    cb.checked = checked; 
                    const id = cb.getAttribute('data-id');
                    if (checked) this.selectedIds.add(id); else this.selectedIds.delete(id);
                });
                this.updateBulkBar();
            });
        }

        // 頂部全選事件已綁定

        // 綁定排序點選
        container.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const k = th.getAttribute('data-sort');
                if (this.sortKey === k) {
                    this.sortAsc = !this.sortAsc;
                } else {
                    this.sortKey = k;
                    this.sortAsc = true;
                }
                this.updatePromptList();
            });
        });

        // 綁定過濾/搜尋
        const input = document.getElementById('ppFilterInput');
        if (input) {
            input.addEventListener('input', (e) => {
                this.searchKeyword = e.target.value.trim();
                clearTimeout(this._filterTimer); this._filterTimer = setTimeout(()=>this.updatePromptList(), 150);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { this.resetFilters(); }
            });
        }
        const sel = document.getElementById('ppHealthFilter');
        if (sel) {
            sel.addEventListener('change', (e) => {
                this.filterHealth = e.target.value;
                this.updatePromptList();
            });
        }

        const clearBtn = document.getElementById('ppClearFilters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.resetFilters());
        }
        const clearLink = document.getElementById('ppClearFiltersLink');
        if (clearLink) {
            clearLink.addEventListener('click', () => this.resetFilters());
        }

        // 新增事件監聽器
        this.attachPromptItemListeners();
        this.ensureBulkBar();
        this.updateBulkBar();
    }

    /**
     * 更新UI顯示
     */
    updateUI() {
        this.updatePromptList();
        this.updateStats();
        this.updateHealthOverview();
    }

    /**
     * 建立提示詞專案的HTML
     */
    createPromptItemHTML(prompt) {
        const isSelected = prompt.userSelected === true;
        const isRejected = prompt.userSelected === false;
        const isUnset = prompt.userSelected === null;
        
        // 健康狀態資訊
        const health = prompt.healthStatus || {};
        const healthStatus = health.status || 'unknown';
        const successRate = (health.totalRequests > 0)
            ? Math.round((health.successCount / health.totalRequests) * 100)
            : null;
        const successCls = successRate === null ? 'text-gray-500' : (successRate >= 80 ? 'text-green-600' : successRate >= 50 ? 'text-yellow-600' : 'text-red-600');
        const successText = successRate === null ? '-' : `${successRate}%`;
        const avgTime = health.averageResponseTime > 0 ? `${Math.round(health.averageResponseTime / 1000)}s` : '-';
        const healthText = healthStatus === 'healthy' ? '健康' : (healthStatus === 'degraded' ? '降級' : (healthStatus === 'deactivated' ? '失活' : '未知'));

        return `
            <tr class="align-top" data-id="${prompt.id}">
                <td class="px-2 py-2"><input type="checkbox" class="prompt-select-checkbox w-4 h-4" data-id="${prompt.id}" ${this.selectedIds.has(prompt.id) ? 'checked' : ''} /></td>
                <td class="px-2 py-2">
                    <div class="text-gray-800 text-sm font-medium">${prompt.name}</div>
                    <div class="text-xs text-gray-500 mt-0.5">系統: ${this.truncateText(prompt.systemPrompt, 60)}</div>
                    <div class="text-xs text-gray-500">使用者: ${this.truncateText(prompt.userPromptTemplate, 60)}</div>
                </td>
                <td class="px-2 py-2"><span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">${prompt.category}</span></td>
                <td class="px-2 py-2 text-xs">${healthText}</td>
                <td class="px-2 py-2 text-xs ${successCls}">${successText}</td>
                <td class="px-2 py-2 text-xs">${health.totalRequests || 0}</td>
                <td class="px-2 py-2 text-xs ${health.consecutiveFailures>0?'text-red-600':''}">${health.consecutiveFailures || 0}</td>
                <td class="px-2 py-2 text-xs">${avgTime}</td>
                <td class="px-2 py-2 text-xs">${prompt.usage_count || 0}</td>
                <td class="px-2 py-2 text-xs">${(prompt.created_at||'').replace('T',' ').replace('Z','')}</td>
                <td class="px-2 py-2">
                    <div class="flex items-center space-x-1">
                        <button class="prompt-select-btn p-1 rounded hover:bg-gray-100 ${healthStatus === 'deactivated' ? 'opacity-50 cursor-not-allowed' : ''}"
                                data-id="${prompt.id}" data-action="select" title="選擇使用" ${isSelected || healthStatus === 'deactivated' ? 'style=\"display:none\"' : ''}>
                            <iconify-icon icon="carbon:checkmark" class="text-green-600" width="16"></iconify-icon>
                        </button>
                        <button class="prompt-reject-btn p-1 rounded hover:bg-gray-100" data-id="${prompt.id}" data-action="reject" title="拒絕使用" ${isRejected ? 'style=\"display:none\"' : ''}>
                            <iconify-icon icon="carbon:close" class="text-red-600" width="16"></iconify-icon>
                        </button>
                        ${healthStatus === 'deactivated' ? `
                            <button class="prompt-resurrect-btn p-1 rounded hover:bg-gray-100" data-id="${prompt.id}" data-action="resurrect" title="手動復活">
                                <iconify-icon icon="carbon:restart" class="text-blue-600" width="16"></iconify-icon>
                            </button>
                        ` : ''}
                        <button class="prompt-edit-btn p-1 rounded hover:bg-gray-100" data-id="${prompt.id}" data-action="edit" title="編輯">
                            <iconify-icon icon="carbon:edit" class="text-blue-600" width="16"></iconify-icon>
                        </button>
                        <button class="prompt-delete-btn p-1 rounded hover:bg-gray-100" data-id="${prompt.id}" data-action="delete" title="刪除">
                            <iconify-icon icon="carbon:trash-can" class="text-red-600" width="16"></iconify-icon>
                        </button>
                    </div>
                </td>
            </tr>`;
    }

    /**
     * 附加提示詞專案的事件監聽器
     */
    attachPromptItemListeners() {
        // 多選核取方塊
        document.querySelectorAll('.prompt-select-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) this.selectedIds.add(id); else this.selectedIds.delete(id);
                this.updateBulkBar();
            });
        });
        // 選擇按鈕
        document.querySelectorAll('.prompt-select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePromptAction(e, 'select'));
        });

        // 拒絕按鈕
        document.querySelectorAll('.prompt-reject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePromptAction(e, 'reject'));
        });

        // 編輯按鈕
        document.querySelectorAll('.prompt-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePromptAction(e, 'edit'));
        });

        // 刪除按鈕
        document.querySelectorAll('.prompt-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePromptAction(e, 'delete'));
        });

        // 復活按鈕
        document.querySelectorAll('.prompt-resurrect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handlePromptAction(e, 'resurrect'));
        });
    }

    /**
     * 建立批次操作條（如未存在）
     */
    ensureBulkBar() {
        if (document.getElementById('promptPoolBulkBar')) return;
        const bar = document.createElement('div');
        bar.id = 'promptPoolBulkBar';
        bar.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 flex items-center space-x-2 hidden';
        bar.innerHTML = `
            <span id="bulkCount" class="text-sm text-gray-700 mr-2">已選 0 項</span>
            <button id="bulkSelectAll" class="text-xs px-2 py-1 border rounded hover:bg-gray-50">全選</button>
            <button id="bulkClear" class="text-xs px-2 py-1 border rounded hover:bg-gray-50">清空</button>
            <span class="mx-2 text-gray-300">|</span>
            <button id="bulkEnable" class="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">批次啟用</button>
            <button id="bulkResurrect" class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">批次復活</button>
            <button id="bulkDisable" class="text-xs px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700">批次禁用</button>
            <button id="bulkDelete" class="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">批次刪除</button>
        `;
        document.body.appendChild(bar);

        // 綁定事件
        document.getElementById('bulkSelectAll').addEventListener('click', () => {
            document.querySelectorAll('.prompt-select-checkbox').forEach(cb => { cb.checked = true; this.selectedIds.add(cb.getAttribute('data-id')); });
            this.updateBulkBar();
        });
        document.getElementById('bulkClear').addEventListener('click', () => {
            this.selectedIds.clear();
            document.querySelectorAll('.prompt-select-checkbox').forEach(cb => { cb.checked = false; });
            this.updateBulkBar();
        });
        document.getElementById('bulkEnable').addEventListener('click', () => this.handleBulkEnable());
        document.getElementById('bulkResurrect').addEventListener('click', () => this.handleBulkResurrect());
        document.getElementById('bulkDisable').addEventListener('click', () => this.handleBulkDisable());
        document.getElementById('bulkDelete').addEventListener('click', () => this.handleBulkDelete());
    }

    updateBulkBar() {
        const bar = document.getElementById('promptPoolBulkBar');
        if (!bar) return;
        const count = this.selectedIds.size;
        const countEl = document.getElementById('bulkCount');
        if (countEl) countEl.textContent = `已選 ${count} 項`;
        bar.classList.toggle('hidden', count === 0);
    }

    handleBulkEnable() {
        if (this.selectedIds.size === 0) return;
        const ids = Array.from(this.selectedIds);
        if (window.translationPromptPool && typeof window.translationPromptPool.updatePromptItems === 'function') {
            window.translationPromptPool.updatePromptItems(ids, { userSelected: true, isActive: true });
            this.showNotification('批次啟用完成', 'success');
            this.updateUI();
        }
    }

    handleBulkResurrect() {
        if (this.selectedIds.size === 0) return;
        const ids = Array.from(this.selectedIds);
        if (window.translationPromptPool && typeof window.translationPromptPool.resurrectPrompts === 'function') {
            window.translationPromptPool.resurrectPrompts(ids);
            this.showNotification('批次復活完成', 'success');
            this.updateUI();
        }
    }

    handleBulkDisable() {
        if (this.selectedIds.size === 0) return;
        const ids = Array.from(this.selectedIds);
        if (window.translationPromptPool && typeof window.translationPromptPool.updatePromptItems === 'function') {
            window.translationPromptPool.updatePromptItems(ids, { userSelected: false, isActive: false });
            this.showNotification('批次禁用完成', 'info');
            this.updateUI();
        }
    }

    handleBulkDelete() {
        if (this.selectedIds.size === 0) return;
        if (!confirm(`確定刪除選中的 ${this.selectedIds.size} 個提示詞嗎？`)) return;
        const ids = Array.from(this.selectedIds);
        if (window.translationPromptPool && typeof window.translationPromptPool.deletePromptItem === 'function') {
            ids.forEach(id => window.translationPromptPool.deletePromptItem(id));
            this.selectedIds.clear();
            this.showNotification('批次刪除完成', 'info');
            this.updateUI();
        }
    }

    /**
     * 處理提示詞操作
     */
    handlePromptAction(event, action) {
        const id = event.target.closest('[data-id]').dataset.id;

        switch (action) {
            case 'select':
                this.promptPool.updatePromptItem(id, {
                    userSelected: true,
                    isActive: true
                });
                this.showNotification('提示詞已選擇', 'success');
                break;
            case 'reject':
                this.promptPool.updatePromptItem(id, {
                    userSelected: false,
                    isActive: false
                });
                this.showNotification('提示詞已拒絕', 'info');
                break;
            case 'resurrect':
                this.promptPool.resurrectPrompt(id);
                this.showNotification('提示詞已手動復活', 'success');
                break;
            case 'edit':
                this.openEditModal(id);
                return;
            case 'delete':
                if (confirm('確定要刪除這個提示詞嗎？')) {
                    this.promptPool.deletePromptItem(id);
                    this.showNotification('提示詞已刪除', 'info');
                }
                break;
        }

        this.updateUI();
    }

    /**
     * 開啟編輯模態框
     */
    openEditModal(id) {
        const prompt = this.promptPool.getAllPrompts().find(p => p.id === id);
        if (!prompt) return;

        this.currentEditingId = id;

        // 建立模態框
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-semibold">編輯提示詞</h3>
                    <button id="closeEditModal" class="text-gray-400 hover:text-red-500">
                        <iconify-icon icon="carbon:close" width="20"></iconify-icon>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">名稱</label>
                        <input type="text" id="editPromptName" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500" value="${prompt.name}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">類別</label>
                        <select id="editPromptCategory" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500">
                            <option value="academic" ${prompt.category === 'academic' ? 'selected' : ''}>學術</option>
                            <option value="casual" ${prompt.category === 'casual' ? 'selected' : ''}>通俗</option>
                            <option value="technical" ${prompt.category === 'technical' ? 'selected' : ''}>技術</option>
                            <option value="business" ${prompt.category === 'business' ? 'selected' : ''}>商務</option>
                            <option value="literary" ${prompt.category === 'literary' ? 'selected' : ''}>文學</option>
                            <option value="custom" ${!['academic', 'casual', 'technical', 'business', 'literary'].includes(prompt.category) ? 'selected' : ''}>自定義</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">系統提示</label>
                        <textarea id="editSystemPrompt" rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500">${prompt.systemPrompt}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">使用者提示模板</label>
                        <textarea id="editUserPromptTemplate" rows="6" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500">${prompt.userPromptTemplate}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">標籤 (用空格分隔)</label>
                        <input type="text" id="editPromptTags" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500" value="${prompt.tags.join(' ')}">
                    </div>
                </div>
                <div class="flex justify-end space-x-2 p-4 border-t">
                    <button id="cancelEdit" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
                    <button id="saveEdit" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">儲存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 新增事件監聽器
        modal.querySelector('#closeEditModal').addEventListener('click', () => this.closeEditModal(modal));
        modal.querySelector('#cancelEdit').addEventListener('click', () => this.closeEditModal(modal));
        modal.querySelector('#saveEdit').addEventListener('click', () => this.saveEdit(modal));

        // 點選背景關閉
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeEditModal(modal);
        });
    }

    /**
     * 關閉編輯模態框
     */
    closeEditModal(modal) {
        modal.remove();
        this.currentEditingId = null;
    }

    /**
     * 儲存編輯
     */
    saveEdit(modal) {
        if (!this.currentEditingId) return;

        const updates = {
            name: modal.querySelector('#editPromptName').value,
            category: modal.querySelector('#editPromptCategory').value,
            systemPrompt: modal.querySelector('#editSystemPrompt').value,
            userPromptTemplate: modal.querySelector('#editUserPromptTemplate').value,
            tags: modal.querySelector('#editPromptTags').value.split(' ').filter(tag => tag.trim())
        };

        this.promptPool.updatePromptItem(this.currentEditingId, updates);
        this.updateUI();
        this.closeEditModal(modal);
        this.showNotification('提示詞已更新！', 'success');
    }

    /**
     * 更新統計資訊
     */
    updateStats() {
        const statsText = document.getElementById('poolStatsText');
        if (!statsText) return;

        const allPrompts = this.promptPool.getAllPrompts();
        const selectedCount = allPrompts.filter(p => p.userSelected === true).length;
        const totalCount = allPrompts.length;

        statsText.textContent = `(${selectedCount} / ${totalCount} 個已選)`;
    }

    /**
     * 清空提示詞池
     */
    clearPool() {
        if (!confirm('確定要清空所有提示詞嗎？此操作不可撤銷。')) return;

        this.promptPool.clearPool();
        this.updateUI();
        this.showNotification('提示詞池已清空', 'info');
    }

    /**
     * 匯出提示詞池
     */
    exportPool() {
        const prompts = this.promptPool.getAllPrompts();
        if (prompts.length === 0) {
            this.showNotification('沒有提示詞可以匯出', 'warning');
            return;
        }

        const dataStr = JSON.stringify(prompts, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `prompt-pool-${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        this.showNotification('提示詞池已匯出', 'success');
    }

    /**
     * 匯入提示詞池
     */
    importPool() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const prompts = JSON.parse(e.target.result);
                    if (!Array.isArray(prompts)) throw new Error('Invalid format');

                    this.promptPool.addVariationsToPool(prompts);
                    this.updateUI();
                    this.showNotification(`成功匯入 ${prompts.length} 個提示詞`, 'success');
                } catch (error) {
                    this.showNotification('匯入失敗：檔案格式無效', 'error');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    /**
     * 截斷文字
     */
    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * 顯示通知
     */
    showNotification(message, type = 'info') {
        // 簡單的通知實現，可以與現有通知系統整合
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };

        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * 獲取當前選擇的提示詞模式
     */
    getCurrentPromptMode() {
        return document.querySelector('input[name="promptMode"]:checked')?.value || 'builtin';
    }

    /**
     * 獲取用於翻譯的提示詞
     * 根據當前模式返回相應的提示詞
     */
    getPromptForTranslation() {
        const mode = this.getCurrentPromptMode();

        switch (mode) {
            case 'custom':
                {
                    const sys = (document.getElementById('defaultSystemPrompt')?.value || '').trim();
                    const usr = (document.getElementById('defaultUserPromptTemplate')?.value || '').trim();
                    // 若自定義為空，則返回 null，讓上層回退到內建提示詞
                    if (!sys || !usr) return null;
                    return { systemPrompt: sys, userPromptTemplate: usr };
                }
            case 'pool':
                // 會話內固定：處理進行中時鎖定首次選擇，確保單次處理的一致性
                if (typeof window !== 'undefined' && window.isProcessing && this.sessionLockedPrompt) {
                    return {
                        id: this.sessionLockedPrompt.id,
                        systemPrompt: this.sessionLockedPrompt.systemPrompt,
                        userPromptTemplate: this.sessionLockedPrompt.userPromptTemplate
                    };
                }

                const poolMode = document.getElementById('promptPoolMode')?.value || 'rotation';
                const activePrompt = poolMode === 'random'
                    ? this.promptPool.getRandomActivePrompt()
                    : this.promptPool.getRotationActivePrompt();

                if (typeof window !== 'undefined' && window.isProcessing && activePrompt) {
                    this.sessionLockedPrompt = activePrompt; // 鎖定本次會話
                }

                return activePrompt ? {
                    id: activePrompt.id,
                    systemPrompt: activePrompt.systemPrompt,
                    userPromptTemplate: activePrompt.userPromptTemplate
                } : null;
            default:
                return null; // 使用內建提示詞
        }
    }

    resetSessionLock() {
        this.sessionLockedPrompt = null;
    }

    breakSessionLockIfMatches(promptId) {
        if (this.sessionLockedPrompt && this.sessionLockedPrompt.id === promptId) {
            this.sessionLockedPrompt = null;
            this.showNotification('當前會話提示詞失效，已切換為動態挑選。', 'warning');
        }
    }
}

// 初始化提示詞池UI
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.promptPoolUI = new PromptPoolUI();
    });
}

// 匯出類
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromptPoolUI;
}
