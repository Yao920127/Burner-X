// process/prompt-pool.js
// 翻譯提示詞池管理系統 - AI生成版本

/**
 * 翻譯提示詞池管理器 - AI生成版本 + 智慧健康管理
 */
class TranslationPromptPool {
    constructor() {
        this.storageKey = 'paperBurnerPromptPool';
        this.healthConfigKey = 'paperBurnerPromptHealthConfig';
        this.defaultGenerationCount = 10;
        this.promptPool = this.loadPromptPool();
        this.healthConfig = this.loadHealthConfig();
        this.activeRequestsQueue = new Map(); // 跟蹤正在進行的請求
        
        // 啟動健康監控和復活機制
        this.startHealthMonitoring();

        // 一次性遷移：如果歷史資料只有使用次數，沒有請求統計，則將其回填為成功請求
        this.migrateUsageToRequestsIfNeeded();

        // 後端模式：非同步從後端同步提示詞池與健康配置（不阻塞）
        try {
            if (typeof window !== 'undefined' && window.storageAdapter && window.storageAdapter.isFrontendMode === false && typeof window.storageAdapter.loadPromptPool === 'function') {
                this._syncFromBackend();
            }
        } catch (e) {
            console.warn('[PromptPool] 初始化後端同步失敗（忽略）:', e);
        }
    }

    /**
     * 載入健康管理配置
     */
    loadHealthConfig() {
        try {
            const stored = localStorage.getItem(this.healthConfigKey);
            const defaultConfig = {
                maxConsecutiveFailures: 2, // 最大連續失敗次數
                deactivationEnabled: true, // 是否啟用失活機制
                resurrectionTimeMinutes: 15, // 復活時間（分鐘）
                resurrectionEnabled: true, // 是否啟用自動復活
                switchOnFailure: true, // 失敗時是否自動切換
                queueManagementEnabled: true // 是否啟用佇列管理
            };
            return stored ? { ...defaultConfig, ...JSON.parse(stored) } : defaultConfig;
        } catch (error) {
            console.error('Failed to load health config:', error);
            return {
                maxConsecutiveFailures: 2,
                deactivationEnabled: true,
                resurrectionTimeMinutes: 15,
                resurrectionEnabled: true,
                switchOnFailure: true,
                queueManagementEnabled: true
            };
        }
    }

    /**
     * 儲存健康管理配置
     */
    saveHealthConfig() {
        try {
            this._persistLocalOnly();
            this._persistToBackend();
            this._notifyUpdated();
        } catch (error) {
            console.error('Failed to save health config:', error);
        }
    }

    /**
     * 啟動健康監控定時器
     */
    startHealthMonitoring() {
        // 每分鐘檢查一次復活條件
        setInterval(() => {
            if (this.healthConfig.resurrectionEnabled) {
                this.checkForResurrection();
            }
        }, 60000); // 1分鐘
    }

    /**
     * 從本地儲存載入提示詞池
     */
    loadPromptPool() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return [];

            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) return [];

            const dedupedMap = new Map();
            parsed.forEach(item => {
                if (!item || (!item.systemPrompt && !item.userPromptTemplate)) return;
                const key = this.getVariationKey(item);
                if (!key) return;

                if (!dedupedMap.has(key)) {
                    dedupedMap.set(key, item);
                    return;
                }

                const existing = dedupedMap.get(key);
                const existingUsage = existing?.usage_count || 0;
                const candidateUsage = item?.usage_count || 0;
                const existingRequests = existing?.healthStatus?.totalRequests || 0;
                const candidateRequests = item?.healthStatus?.totalRequests || 0;

                if (candidateUsage > existingUsage ||
                    (candidateUsage === existingUsage && candidateRequests > existingRequests)) {
                    dedupedMap.set(key, item);
                }
            });

            const deduped = Array.from(dedupedMap.values());
            if (deduped.length !== parsed.length) {
                console.info('[PromptPool] 去重提示詞條目:', parsed.length - deduped.length);
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify(deduped));
                } catch (persistError) {
                    console.warn('[PromptPool] 去重結果寫回失敗:', persistError);
                }
            }
            return deduped;
        } catch (error) {
            console.error('Failed to load prompt pool:', error);
            return [];
        }
    }

    /**
     * 儲存提示詞池到本地儲存
     */
    savePromptPool() {
        try {
            this._persistLocalOnly();
            this._persistToBackend(); // fire-and-forget
            this._notifyUpdated();
        } catch (error) {
            console.error('Failed to save prompt pool:', error);
        }
    }

    /**
     * 遷移歷史統計：當 totalRequests=0 且 success/failure 均為0，但 usage_count>0 時，
     * 將 usage_count 視為歷史成功請求數進行回填，避免出現“使用>0，請求=0”的誤導顯示。
     */
    migrateUsageToRequestsIfNeeded() {
        let changed = false;
        try {
            this.promptPool.forEach(p => {
                const h = p.healthStatus;
                if (!h) return;
                if ((h.totalRequests || 0) === 0 && (h.successCount || 0) === 0 && (h.failureCount || 0) === 0 && (p.usage_count || 0) > 0) {
                    h.totalRequests = p.usage_count;
                    h.successCount = p.usage_count;
                    changed = true;
                }
            });
            if (changed) this.savePromptPool();
        } catch (e) {
            console.warn('migrateUsageToRequestsIfNeeded failed:', e);
        }
    }

    /**
     * 使用AI生成提示詞變體
     * @param {string} referenceSystemPrompt - 參考的系統提示詞
     * @param {string} referenceUserPrompt - 參考的使用者提示詞
     * @param {number} count - 生成數量，預設10個
     * @param {number} similarity - 相似度控制 (0.1-0.9，0.1=差異很大，0.9=非常相似)
     * @param {string} apiModel - 使用的AI模型
     * @param {string} apiKey - API金鑰
     * @returns {Promise<Array>} 生成的提示詞變體陣列
     */
    async generateVariationsWithAI(referenceSystemPrompt, referenceUserPrompt, count = this.defaultGenerationCount, similarity = 0.7, apiModel = 'deepseek', apiKey, options = {}) {
        if (!apiKey) {
            throw new Error('需要提供API金鑰來生成提示詞變體');
        }

        // 構建AI生成提示詞的系統提示（風格鎖定：僅改寫措辭/語序，不改變風格與約束）
        let aiSystemPrompt = options.generatorSystemPrompt || `你是資深提示詞工程師，負責在不改變風格與約束的前提下，生成同風格的改寫變體。

任務：基於參考提示詞，生成 ${count} 個“同風格、同約束、同輸出要求”的翻譯提示詞變體；僅在措辭、語序、句式、連線詞與段落組織上做改寫，以提升穩定性與一致性。

強制要求：
1. 返回 JSON，包含欄位 variations（陣列）。
2. 每個變體包含：name（名稱）、systemPrompt（系統提示）、userPromptTemplate（使用者提示模板）、description（簡要說明）。
3. 相似度控制：${similarity}（${this.getSimilarityDescription(similarity)}）。注意：風格與約束必須完全一致，僅體現措辭與語序差異。
4. userPromptTemplate 必須且僅出現一次佔位符：\${targetLangName} 與 \${content}。
5. 嚴禁改變參考提示詞的風格、語氣、規則、術語偏好與輸出格式要求；嚴禁引入“學術/商務/口語/文學”等風格標籤的切換或暗示。
6. 允許調整表述順序、同義替換與句式變化，但要保持語義與約束等價。
7. 僅輸出嚴格的 JSON 物件（不包含 Markdown 程式碼塊、註釋或額外文字）。
8. 使用單行（minified）JSON 輸出：不得換行、不得縮排。

JSON 格式示例：
{
  "variations": [
    {
      "name": "同風格改寫-1",
      "systemPrompt": "（與參考風格一致，僅改寫措辭/語序）你是專業翻譯助手...",
      "userPromptTemplate": "請將以下內容翻譯為\${targetLangName}：\\n\\n\${content}",
      "description": "風格鎖定；僅做同義改寫與語序調整"
    }
  ]
}`;

        let aiUserPrompt = options.generatorUserPrompt || `參考提示詞（須保持風格/規則/輸出要求一致）：

**系統提示：**
${referenceSystemPrompt}

**使用者提示模板：**
${referenceUserPrompt}

請基於以上參考提示詞生成 ${count} 個“同風格改寫”變體：保持風格、語氣、規則與輸出要求不變，僅做措辭/語序/句式的等價改寫。相似度：${similarity}（${this.getSimilarityDescription(similarity)}）。

每個變體必須包含 systemPrompt 與 userPromptTemplate 兩個欄位；並確保 userPromptTemplate 都包含且僅包含一次 \${targetLangName} 與 \${content} 佔位符。嚴格輸出為單行 JSON（無任何額外文字/提示/程式碼塊）。`;

        try {
            // 呼叫AI API生成變體
            const aiResponse = await this.callAIForGeneration(aiSystemPrompt, aiUserPrompt, apiModel, apiKey);
            
            // 解析AI返回的JSON
            const parsedResponse = this.parseAIResponse(aiResponse);
            
            // 驗證和處理生成的變體
            const processedVariations = this.processGeneratedVariations(parsedResponse.variations);
            
            return processedVariations;
            
        } catch (error) {
            console.error('AI生成提示詞變體失敗:', error);
            throw new Error(`生成提示詞變體失敗: ${error.message}`);
        }
    }

    /**
     * 獲取相似度描述
     */
    getSimilarityDescription(similarity) {
        // 在風格鎖定前提下，對“措辭/語序”的差異程度描述
        if (similarity <= 0.3) return '改寫幅度很大（語序與措辭差異顯著）';
        if (similarity <= 0.5) return '改寫幅度中等（保持等價約束，表達有明顯變化）';
        if (similarity <= 0.7) return '改寫幅度適中（整體表達有所變化）';
        return '改寫幅度較小（細微措辭/順序調整）';
    }

    /**
     * 呼叫AI API生成變體（複用現有的翻譯API呼叫邏輯）
     */
    async callAIForGeneration(systemPrompt, userPrompt, apiModel, apiKey) {
        // 統一從 translation.js 的構建邏輯獲取配置，避免端點不一致
        if (typeof callTranslationApi !== 'function') {
            throw new Error('callTranslationApi函式不可用，請確保 api.js 已載入');
        }

        // 優先使用獨立的生成配置構建器
        let apiConfig;
        if (typeof window !== 'undefined' && typeof window.buildPromptPoolGenerationConfig === 'function') {
            apiConfig = window.buildPromptPoolGenerationConfig(apiModel, apiKey);
        } else if (typeof processModule !== 'undefined' && typeof processModule.buildCustomApiConfig === 'function') {
            // 回退（自定義站點）：儘量使用 buildCustomApiConfig 補全端點
            if (apiModel.includes(':')) {
                const separatorIndex = apiModel.indexOf(':');
                const siteId = apiModel.slice(0, separatorIndex);
                const modelId = apiModel.slice(separatorIndex + 1);
                const allSites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
                const site = allSites[siteId];
                if (!site) throw new Error(`未找到源站點配置：${siteId}`);
                apiConfig = processModule.buildCustomApiConfig(
                    apiKey,
                    site.apiEndpoint || site.apiBaseUrl,
                    modelId || site.modelId,
                    site.requestFormat || 'openai',
                    site.temperature !== undefined ? site.temperature : 0.5,
                    site.max_tokens !== undefined ? site.max_tokens : 8000,
                    {
                        endpointMode: site.endpointMode || 'auto'
                    }
                );
            } else {
                throw new Error('未能構建預設模型的配置，請檢查腳本載入順序');
            }
        } else {
            throw new Error('缺少構建 API 配置的函式，請檢查腳本載入順序');
        }

        const requestBody = apiConfig.bodyBuilder
            ? apiConfig.bodyBuilder(systemPrompt, userPrompt)
            : {
                model: apiConfig.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.8,
                max_tokens: 4000
            };

        try {
            const result = await callTranslationApi(apiConfig, requestBody);
            return result;
        } catch (error) {
            throw new Error(`API呼叫失敗: ${error.message}`);
        }
    }

    /**
     * 構建生成API配置（整合現有的模型管理系統）
     */
    buildGenerationApiConfig(apiModel, apiKey) {
        // 已由獨立模組統一實現，保留相容入口
        if (typeof window !== 'undefined' && typeof window.buildPromptPoolGenerationConfig === 'function') {
            return window.buildPromptPoolGenerationConfig(apiModel, apiKey);
        }
        throw new Error('構建API配置失敗：缺少 buildPromptPoolGenerationConfig');
    }

    /**
     * 解析AI返回的JSON響應
     */
    parseAIResponse(responseText) {
        if (!responseText || typeof responseText !== 'string') {
            throw new Error('AI響應為空或不是文字');
        }

        // 預清理：去掉 <think>...</think>、程式碼塊圍欄、前後雜項
        let text = responseText
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/```json/gi, '```')
            .trim();

        // 嘗試1：直接 JSON.parse（相容單行/多行）
        try { return JSON.parse(text); } catch {}

        // 嘗試2：```json 或 ``` 包裹的內容（逐塊嘗試）
        try {
            const blocks = text.match(/```\s*[\s\S]*?```/g);
            if (blocks) {
                for (const b of blocks) {
                    const body = b.replace(/```/g, '').trim();
                    // 允許裸換行修復
                    const obj = (function(raw){
                        let s = raw.replace(/,\s*(\}|\])/g, '$1');
                        let out = '', inStr=false, esc=false;
                        for (let i=0;i<s.length;i++){
                            const ch=s[i];
                            if(inStr){
                                if(esc){out+=ch;esc=false;continue;}
                                if(ch==='\\'){out+=ch;esc=true;continue;}
                                if(ch==='"'){inStr=false;out+=ch;continue;}
                                if(ch==='\n'||ch==='\r'){out+='\\n';continue;}
                                out+=ch;
                            }else{
                                if(ch==='"'){inStr=true;out+=ch;continue;}
                                out+=ch;
                            }
                        }
                        try{return JSON.parse(out);}catch{return null;}
                    })(body);
                    if (obj) {
                        if (Array.isArray(obj)) return {variations: obj};
                        if (Array.isArray(obj.variations)) return {variations: obj.variations};
                        if (obj.name && obj.systemPrompt && obj.userPromptTemplate) return {variations:[obj]};
                    }
                }
            }
        } catch {}

        // 嘗試3：基於 "variations" 關鍵詞做括號配對提取
        const keyIdx = text.indexOf('"variations"');
        if (keyIdx !== -1) {
            // 從 keyIdx 往左找到最近的 '{'
            let start = text.lastIndexOf('{', keyIdx);
            if (start !== -1) {
                // 自 start 往右做簡單括號配對（不考慮字串內花括號的極端情況，但一般足夠）
                let depth = 0, end = -1;
                for (let i = start; i < text.length; i++) {
                    const ch = text[i];
                    if (ch === '{') depth++;
                    else if (ch === '}') depth--;
                    if (depth === 0) { end = i; break; }
                }
                if (end !== -1) {
                    let candidate = text.slice(start, end + 1);
                    // 去掉可能存在的尾隨逗號
                    candidate = candidate.replace(/,\s*(\}|\])/g, '$1');
                    // 去掉可能存在的行內註釋（簡單處理）
                    candidate = candidate.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
                    try { return JSON.parse(candidate); } catch {}
                }
            }
        }

        // 嘗試4：寬泛比對第一個 {...} 快，做配對
        {
            const first = text.indexOf('{');
            const last = text.lastIndexOf('}');
            if (first !== -1 && last !== -1 && last > first) {
                let candidate = text.slice(first, last + 1);
                candidate = candidate.replace(/,\s*(\}|\])/g, '$1');
                try { return JSON.parse(candidate); } catch {}
            }
        }

        // 嘗試5：如果文字中包含有效的 JSON 片段行，拼接重嘗試（保守）
        try {
            const lines = text.split(/\n|\r/).map(l => l.trim());
            // 僅保留可能是 JSON 的行
            const filtered = lines.filter(l => /^[\[\]{},:\"\w\s\-\$]/.test(l)).join('');
            if (filtered.includes('{') && filtered.includes('}')) {
                const cleaned = filtered.replace(/,\s*(\}|\])/g, '$1');
                const obj = JSON.parse(cleaned);
                const norm = (function(o){
                    if (!o) return null;
                    if (Array.isArray(o)) return {variations:o};
                    if (Array.isArray(o.variations)) return {variations:o.variations};
                    if (o.name && o.systemPrompt && o.userPromptTemplate) return {variations:[o]};
                    return null;
                })(obj);
                if (norm) return norm;
            }
        } catch {}

        console.error('解析AI響應失敗:', responseText);
        throw new Error('AI返回的不是有效的JSON格式');
    }

    /**
     * 處理和驗證生成的變體
     */
    processGeneratedVariations(variations) {
        if (!Array.isArray(variations)) {
            throw new Error('AI返回的variations不是陣列格式');
        }

        const processedVariations = [];
        const baseId = Date.now();

        variations.forEach((variation, index) => {
            try {
                // 驗證必要欄位
                if (!variation.name || !variation.systemPrompt || !variation.userPromptTemplate) {
                    console.warn(`跳過無效變體 ${index}:`, variation);
                    return;
                }

                // 佔位符修復策略
                let userTemplate = variation.userPromptTemplate || '';
                let targetLangCount = (userTemplate.match(/\$\{targetLangName\}/g) || []).length;
                let contentCount = (userTemplate.match(/\$\{content\}/g) || []).length;
                if (targetLangCount === 0) {
                    userTemplate = `所需語言：\${targetLangName}\n` + userTemplate;
                    targetLangCount = 1;
                }
                if (contentCount === 0) {
                    userTemplate = userTemplate.replace(/\s*$/, '') + `\n\n需要翻譯的內容：\${content}`;
                    contentCount = 1;
                }
                variation.userPromptTemplate = userTemplate;

                // 構建標準變體物件
                const processedVariation = {
                    id: `${baseId}_${index}`,
                    name: variation.name || `同風格改寫-${index+1}`,
                    systemPrompt: variation.systemPrompt,
                    userPromptTemplate: variation.userPromptTemplate,
                    description: variation.description || '',
                    // 固定為通用類別，避免引入“學術/商務/口語”等風格標籤
                    category: 'general',
                    tags: this.generateTags(variation.name, variation.description || ''),
                    created_at: new Date().toISOString(),
                    usage_count: 0,
                    isActive: false,
                    userSelected: null,
                    aiGenerated: true,
                    // 健康狀態資訊
                    healthStatus: {
                        status: 'healthy', // healthy, degraded, failed, deactivated
                        totalRequests: 0,
                        successCount: 0,
                        failureCount: 0,
                        consecutiveFailures: 0,
                        lastUsed: null,
                        lastSuccess: null,
                        lastFailure: null,
                        deactivatedAt: null,
                        deactivationReason: null,
                        requestHistory: [], // 最近20次請求的記錄
                        averageResponseTime: 0
                    }
                };

                processedVariations.push(processedVariation);
            } catch (error) {
                console.warn(`處理變體 ${index} 時出錯:`, error);
            }
        });

        if (processedVariations.length === 0) {
            throw new Error('沒有生成有效的提示詞變體');
        }

        return processedVariations;
    }

    /**
     * 生成用於去重的提示詞鍵
     */
    getVariationKey(prompt) {
        if (!prompt) return '';
        const system = typeof prompt.systemPrompt === 'string' ? prompt.systemPrompt.trim() : '';
        const user = typeof prompt.userPromptTemplate === 'string' ? prompt.userPromptTemplate.trim() : '';
        if (!system && !user) return '';
        return `${system}||${user}`;
    }

    /**
     * 推斷變體類別
     */
    inferCategory(name, description) {
        const text = `${name} ${description}`.toLowerCase();
        
        if (text.includes('學術') || text.includes('論文') || text.includes('研究')) return 'academic';
        if (text.includes('技術') || text.includes('專業') || text.includes('工程')) return 'technical';
        if (text.includes('商務') || text.includes('正式') || text.includes('商業')) return 'business';
        if (text.includes('通俗') || text.includes('口語') || text.includes('簡單')) return 'casual';
        if (text.includes('文學') || text.includes('創意') || text.includes('藝術')) return 'literary';
        
        return 'general';
    }

    /**
     * 生成標籤
     */
    generateTags(name, description) {
        const text = `${name} ${description}`.toLowerCase();
        const tags = [];
        
        if (text.includes('準確') || text.includes('精確')) tags.push('準確');
        if (text.includes('詳細') || text.includes('全面')) tags.push('詳細');
        if (text.includes('簡潔') || text.includes('簡單')) tags.push('簡潔');
        if (text.includes('專業') || text.includes('權威')) tags.push('專業');
        if (text.includes('創意') || text.includes('創新')) tags.push('創意');
        if (text.includes('AI生成')) tags.push('AI生成');
        
        return tags.length > 0 ? tags : ['AI生成'];
    }

    /**
     * 記錄提示詞使用結果
     * @param {string} promptId - 提示詞ID
     * @param {boolean} success - 是否成功
     * @param {number} responseTime - 響應時間(ms)
     * @param {string} error - 錯誤資訊（如果失敗）
     * @param {Object} requestInfo - 請求相關資訊
     */
    recordPromptUsage(promptId, success, responseTime = 0, error = null, requestInfo = {}) {
        const promptIndex = this.promptPool.findIndex(p => p.id === promptId);
        if (promptIndex === -1) return;

        const prompt = this.promptPool[promptIndex];
        const now = new Date().toISOString();
        
        // 確保healthStatus存在
        if (!prompt.healthStatus) {
            prompt.healthStatus = {
                status: 'healthy',
                totalRequests: 0,
                successCount: 0,
                failureCount: 0,
                consecutiveFailures: 0,
                lastUsed: null,
                lastSuccess: null,
                lastFailure: null,
                deactivatedAt: null,
                deactivationReason: null,
                requestHistory: [],
                averageResponseTime: 0
            };
        }

        const health = prompt.healthStatus;
        
        // 更新基礎統計
        health.totalRequests++;
        health.lastUsed = now;
        
        // 建立請求記錄
        const requestRecord = {
            timestamp: now,
            success: success,
            responseTime: responseTime,
            error: error,
            consecutiveFailureCount: health.consecutiveFailures,
            ...requestInfo
        };
        
        // 新增到歷史記錄（保持最近20條）
        health.requestHistory.unshift(requestRecord);
        if (health.requestHistory.length > 20) {
            health.requestHistory = health.requestHistory.slice(0, 20);
        }
        
        if (success) {
            health.successCount++;
            health.consecutiveFailures = 0;
            health.lastSuccess = now;
            
            // 更新平均響應時間
            health.averageResponseTime = this.calculateAverageResponseTime(health.requestHistory);
            
            // 如果之前處於降級狀態，考慮恢復
            if (health.status === 'degraded') {
                health.status = 'healthy';
                console.log(`[PromptPool] 提示詞 ${prompt.name} 恢復健康狀態`);
            }
            
        } else {
            health.failureCount++;
            health.consecutiveFailures++;
            health.lastFailure = now;
            
            console.warn(`[PromptPool] 提示詞 ${prompt.name} 失敗，連續失敗次數: ${health.consecutiveFailures}`);
            
            // 更新健康狀態
            this.updatePromptHealthStatus(promptId);
            
            // 如果啟用了切換機制，處理佇列替換
            if (this.healthConfig.switchOnFailure && this.healthConfig.queueManagementEnabled) {
                this.handleQueueReplacement(promptId);
            }

            // 會話鎖場景：若當前會話鎖定提示詞即為失敗項，則打破鎖，允許後續任務挑選新提示詞
            if (typeof window !== 'undefined' && window.promptPoolUI && typeof window.promptPoolUI.breakSessionLockIfMatches === 'function') {
                window.promptPoolUI.breakSessionLockIfMatches(promptId);
            }
        }
        
        this.savePromptPool();
        
        // 通知UI更新（如果存在）
        if (typeof window !== 'undefined' && window.promptPoolUI && window.promptPoolUI.updateHealthDisplay) {
            window.promptPoolUI.updateHealthDisplay(promptId);
        }
    }

    /**
     * 更新提示詞健康狀態
     */
    updatePromptHealthStatus(promptId) {
        const prompt = this.promptPool.find(p => p.id === promptId);
        if (!prompt || !prompt.healthStatus) return;
        
        const health = prompt.healthStatus;
        const config = this.healthConfig;
        
        // 檢查是否需要失活
        if (config.deactivationEnabled && 
            health.consecutiveFailures >= config.maxConsecutiveFailures) {
            
            health.status = 'deactivated';
            health.deactivatedAt = new Date().toISOString();
            health.deactivationReason = `連續失敗${health.consecutiveFailures}次`;
            prompt.isActive = false;
            
            console.warn(`[PromptPool] 提示詞 ${prompt.name} 已失活: ${health.deactivationReason}`);
            
            // 觸發UI通知
            this.notifyPromptDeactivated(prompt);
            
        } else if (health.consecutiveFailures >= Math.floor(config.maxConsecutiveFailures / 2)) {
            // 進入降級狀態
            health.status = 'degraded';
            console.warn(`[PromptPool] 提示詞 ${prompt.name} 進入降級狀態`);
        }
    }

    /**
     * 處理佇列替換邏輯
     */
    handleQueueReplacement(failedPromptId) {
        try {
            // 獲取使用失敗提示詞的待處理請求
            const pendingRequests = this.activeRequestsQueue.get(failedPromptId) || [];
            
            if (pendingRequests.length > 0) {
                // 選擇新的提示詞
                const newPrompt = this.selectHealthyPrompt(failedPromptId);
                
                if (newPrompt) {
                    console.log(`[PromptPool] 替換佇列中的 ${pendingRequests.length} 個請求，從 ${failedPromptId} 到 ${newPrompt.id}`);
                    
                    // 將請求轉移到新提示詞
                    pendingRequests.forEach(request => {
                        request.promptId = newPrompt.id;
                        request.prompt = newPrompt;
                        request.replacedFrom = failedPromptId;
                        request.replacedAt = new Date().toISOString();
                    });
                    
                    // 更新佇列
                    this.activeRequestsQueue.set(newPrompt.id, 
                        (this.activeRequestsQueue.get(newPrompt.id) || []).concat(pendingRequests));
                    this.activeRequestsQueue.delete(failedPromptId);
                    
                } else {
                    console.warn(`[PromptPool] 沒有可用的健康提示詞來替換失敗的 ${failedPromptId}`);
                }
            }
            
        } catch (error) {
            console.error('[PromptPool] 佇列替換失敗:', error);
        }
    }

    /**
     * 將請求入隊（在任務開始前呼叫）。僅記錄待開始的請求，便於失敗時遷移。
     * @param {string} promptId
     * @param {{requestId:string, model?:string, meta?:Object}} request
     */
    enqueueRequest(promptId, request) {
        try {
            const arr = this.activeRequestsQueue.get(promptId) || [];
            arr.push({ ...request, enqueuedAt: Date.now() });
            this.activeRequestsQueue.set(promptId, arr);
        } catch (e) { console.warn('enqueueRequest failed:', e); }
    }

    /**
     * 請求出隊（在任務開始執行時或完成時呼叫，防止被當作待遷移）。
     * @param {string} promptId
     * @param {string} requestId
     */
    dequeueRequest(promptId, requestId) {
        try {
            const arr = this.activeRequestsQueue.get(promptId) || [];
            const next = arr.filter(r => r.requestId !== requestId);
            if (next.length === 0) this.activeRequestsQueue.delete(promptId);
            else this.activeRequestsQueue.set(promptId, next);
        } catch (e) { console.warn('dequeueRequest failed:', e); }
    }

    /**
     * 選擇健康的提示詞
     */
    selectHealthyPrompt(excludePromptId = null) {
        const healthyPrompts = this.promptPool.filter(prompt => 
            prompt.isActive && 
            prompt.userSelected === true &&
            prompt.id !== excludePromptId &&
            prompt.healthStatus &&
            ['healthy', 'degraded'].includes(prompt.healthStatus.status)
        );
        
        if (healthyPrompts.length === 0) return null;
        
        // 優先選擇完全健康的
        const fullyHealthy = healthyPrompts.filter(p => p.healthStatus.status === 'healthy');
        if (fullyHealthy.length > 0) {
            // 按成功率排序
            fullyHealthy.sort((a, b) => {
                const aSuccessRate = a.healthStatus.totalRequests > 0 ? 
                    a.healthStatus.successCount / a.healthStatus.totalRequests : 1;
                const bSuccessRate = b.healthStatus.totalRequests > 0 ? 
                    b.healthStatus.successCount / b.healthStatus.totalRequests : 1;
                return bSuccessRate - aSuccessRate;
            });
            return fullyHealthy[0];
        }
        
        // 如果沒有完全健康的，選擇降級狀態中最好的
        healthyPrompts.sort((a, b) => b.healthStatus.successCount - a.healthStatus.successCount);
        return healthyPrompts[0];
    }

    /**
     * 檢查復活條件
     */
    checkForResurrection() {
        const now = new Date();
        const resurrectionTimeMs = this.healthConfig.resurrectionTimeMinutes * 60 * 1000;
        
        const deactivatedPrompts = this.promptPool.filter(prompt => 
            prompt.healthStatus && 
            prompt.healthStatus.status === 'deactivated' &&
            prompt.healthStatus.deactivatedAt
        );
        
        deactivatedPrompts.forEach(prompt => {
            const deactivatedAt = new Date(prompt.healthStatus.deactivatedAt);
            const timeSinceDeactivation = now - deactivatedAt;
            
            if (timeSinceDeactivation >= resurrectionTimeMs) {
                this.resurrectPrompt(prompt.id);
            }
        });
    }

    /**
     * 復活提示詞
     */
    resurrectPrompt(promptId) {
        const prompt = this.promptPool.find(p => p.id === promptId);
        if (!prompt || !prompt.healthStatus) return;
        
        const health = prompt.healthStatus;
        
        // 重置健康狀態
        health.status = 'healthy';
        health.consecutiveFailures = 0;
        health.deactivatedAt = null;
        health.deactivationReason = null;
        
        // 如果使用者之前選擇了這個提示詞，重新啟用
        if (prompt.userSelected === true) {
            prompt.isActive = true;
        }
        
        console.log(`[PromptPool] 提示詞 ${prompt.name} 已自動復活`);
        
        this.savePromptPool();
        
        // 通知UI
        this.notifyPromptResurrected(prompt);
    }

    /**
     * 計算平均響應時間
     */
    calculateAverageResponseTime(history) {
        if (!history || history.length === 0) return 0;
        
        const validTimes = history.filter(record => record.success && record.responseTime > 0);
        if (validTimes.length === 0) return 0;
        
        const totalTime = validTimes.reduce((sum, record) => sum + record.responseTime, 0);
        return Math.round(totalTime / validTimes.length);
    }

    /**
     * 通知UI提示詞失活
     */
    notifyPromptDeactivated(prompt) {
        if (typeof window !== 'undefined' && window.promptPoolUI && window.promptPoolUI.showNotification) {
            window.promptPoolUI.showNotification(
                `提示詞"${prompt.name}"因連續失敗已自動失活`, 
                'warning'
            );
        }
    }

    /**
     * 通知UI提示詞復活
     */
    notifyPromptResurrected(prompt) {
        if (typeof window !== 'undefined' && window.promptPoolUI && window.promptPoolUI.showNotification) {
            window.promptPoolUI.showNotification(
                `提示詞"${prompt.name}"已自動復活`, 
                'success'
            );
        }
    }

    /**
     * 批次新增變體到提示詞池
     */
    addVariationsToPool(variations) {
        if (!Array.isArray(variations) || variations.length === 0) {
            return;
        }

        const existingKeys = new Set(this.promptPool.map(item => this.getVariationKey(item)).filter(Boolean));
        const newItems = [];

        for (const variation of variations) {
            if (!variation) continue;
            const key = this.getVariationKey(variation);
            if (!key || existingKeys.has(key)) continue;
            existingKeys.add(key);
            newItems.push(variation);
        }

        if (newItems.length === 0) {
            return;
        }

        this.promptPool.push(...newItems);
        this.savePromptPool();
    }

    /**
     * 更新提示詞專案
     */
    updatePromptItem(id, updates) {
        const index = this.promptPool.findIndex(item => item.id === id);
        if (index !== -1) {
            this.promptPool[index] = { ...this.promptPool[index], ...updates };
            this.savePromptPool();
            return true;
        }
        return false;
    }

    /**
     * 批次更新提示詞專案
     * @param {string[]} ids 
     * @param {Object} updates
     */
    updatePromptItems(ids, updates) {
        let changed = false;
        this.promptPool = this.promptPool.map(item => {
            if (ids.includes(item.id)) {
                changed = true;
                return { ...item, ...updates };
            }
            return item;
        });
        if (changed) this.savePromptPool();
        return changed;
    }

    /**
     * 批次復活提示詞
     * @param {string[]} ids
     */
    resurrectPrompts(ids) {
        ids.forEach(id => this.resurrectPrompt(id));
    }

    /**
     * 刪除提示詞專案
     */
    deletePromptItem(id) {
        const index = this.promptPool.findIndex(item => item.id === id);
        if (index !== -1) {
            this.promptPool.splice(index, 1);
            this.savePromptPool();
            return true;
        }
        return false;
    }

    /**
     * 獲取啟用的提示詞列表（健康狀態感知）
     */
    getActivePrompts() {
        return this.promptPool.filter(item => 
            item.isActive && 
            item.userSelected === true &&
            item.healthStatus &&
            ['healthy', 'degraded'].includes(item.healthStatus.status)
        );
    }

    /**
     * 獲取所有提示詞
     */
    getAllPrompts() {
        return this.promptPool;
    }

    /**
     * 清空提示詞池
     */
    clearPool() {
        this.promptPool = [];
        this.savePromptPool();
    }

    /**
     * 智慧隨機選擇一個啟用的提示詞（帶健康管理）
     */
    getRandomActivePrompt() {
        const activePrompts = this.getActivePrompts();
        if (activePrompts.length === 0) return null;
        
        // 按健康狀態和成功率權重選擇
        const weightedPrompts = this.calculatePromptWeights(activePrompts);
        const selectedPrompt = this.weightedRandomSelect(weightedPrompts);
        
        if (selectedPrompt) {
            // 更新使用次數
            this.updatePromptItem(selectedPrompt.id, { 
                usage_count: selectedPrompt.usage_count + 1 
            });
            
            // 記錄選擇到佇列（用於失敗時的佇列管理）
            this.recordPromptSelection(selectedPrompt.id);
        }
        
        return selectedPrompt;
    }

    /**
     * 按輪換方式選擇啟用的提示詞（帶健康管理）
     */
    getRotationActivePrompt() {
        const activePrompts = this.getActivePrompts();
        if (activePrompts.length === 0) return null;
        
        // 優先選擇健康狀態最好的，使用次數最少的
        activePrompts.sort((a, b) => {
            // 首先按健康狀態排序
            const healthPriority = { 'healthy': 0, 'degraded': 1 };
            const aPriority = healthPriority[a.healthStatus.status] || 2;
            const bPriority = healthPriority[b.healthStatus.status] || 2;
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            
            // 然後按使用次數排序
            return a.usage_count - b.usage_count;
        });
        
        const selectedPrompt = activePrompts[0];
        
        // 更新使用次數
        this.updatePromptItem(selectedPrompt.id, { 
            usage_count: selectedPrompt.usage_count + 1 
        });
        
        // 記錄選擇到佇列
        this.recordPromptSelection(selectedPrompt.id);
        
        return selectedPrompt;
    }

    /**
     * 計算提示詞的權重（基於健康狀態和成功率）
     */
    calculatePromptWeights(prompts) {
        return prompts.map(prompt => {
            let weight = 1;
            
            if (prompt.healthStatus) {
                const health = prompt.healthStatus;
                
                // 健康狀態權重
                if (health.status === 'healthy') {
                    weight *= 1.0;
                } else if (health.status === 'degraded') {
                    weight *= 0.5; // 降級狀態降低權重
                }
                
                // 成功率權重
                if (health.totalRequests > 0) {
                    const successRate = health.successCount / health.totalRequests;
                    weight *= (0.5 + successRate); // 0.5-1.5範圍
                }
                
                // 響應時間權重（響應時間越短權重越高）
                if (health.averageResponseTime > 0) {
                    const timeWeight = Math.max(0.1, 1 - (health.averageResponseTime / 10000)); // 10秒為基準
                    weight *= timeWeight;
                }
            }
            
            return { prompt, weight: Math.max(0.1, weight) };
        });
    }

    /**
     * 權重隨機選擇
     */
    weightedRandomSelect(weightedPrompts) {
        if (weightedPrompts.length === 0) return null;
        if (weightedPrompts.length === 1) return weightedPrompts[0].prompt;
        
        const totalWeight = weightedPrompts.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const item of weightedPrompts) {
            random -= item.weight;
            if (random <= 0) {
                return item.prompt;
            }
        }
        
        // 回退到最後一個
        return weightedPrompts[weightedPrompts.length - 1].prompt;
    }

    /**
     * 記錄提示詞選擇（用於佇列管理）
     */
    recordPromptSelection(promptId) {
        // 這裡可以記錄提示詞被選擇用於某個翻譯任務
        // 在實際翻譯失敗時，可以使用這些資訊進行佇列替換
    }

    /**
     * 獲取健康管理配置
     */
    getHealthConfig() {
        return this.healthConfig;
    }

    /**
     * 更新健康管理配置
     */
    updateHealthConfig(newConfig) {
        this.healthConfig = { ...this.healthConfig, ...newConfig };
        this.saveHealthConfig();
    }

    /**
     * 獲取提示詞健康統計
     */
    getHealthStats() {
        const stats = {
            total: this.promptPool.length,
            active: 0,
            healthy: 0,
            degraded: 0,
            deactivated: 0,
            totalRequests: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            averageSuccessRate: 0
        };
        
        this.promptPool.forEach(prompt => {
            if (prompt.isActive && prompt.userSelected === true) {
                stats.active++;
            }
            
            if (prompt.healthStatus) {
                const health = prompt.healthStatus;
                
                switch (health.status) {
                    case 'healthy':
                        stats.healthy++;
                        break;
                    case 'degraded':
                        stats.degraded++;
                        break;
                    case 'deactivated':
                        stats.deactivated++;
                        break;
                }
                
                stats.totalRequests += health.totalRequests;
                stats.totalSuccesses += health.successCount;
                stats.totalFailures += health.failureCount;
            }
        });
        
        stats.averageSuccessRate = stats.totalRequests > 0 ? 
            (stats.totalSuccesses / stats.totalRequests) : 0;
        
        return stats;
    }

    // ==================== 持久化與後端同步 ====================
    _persistLocalOnly() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.promptPool));
            localStorage.setItem(this.healthConfigKey, JSON.stringify(this.healthConfig));
        } catch (e) {
            console.warn('[PromptPool] 本地持久化失敗（忽略）:', e);
        }
    }

    async _persistToBackend() {
        try {
            if (typeof window === 'undefined') return;
            const sa = window.storageAdapter;
            if (!sa || sa.isFrontendMode !== false || typeof sa.savePromptPool !== 'function') return;
            await sa.savePromptPool({ prompts: this.promptPool, healthConfig: this.healthConfig });
        } catch (e) {
            console.warn('[PromptPool] 後端儲存失敗（忽略）:', e?.message || e);
        }
    }

    async _syncFromBackend() {
        try {
            const sa = window.storageAdapter;
            const data = await sa.loadPromptPool();
            if (data && Array.isArray(data.prompts)) {
                this.promptPool = data.prompts;
            }
            if (data && data.healthConfig) {
                this.healthConfig = { ...this.healthConfig, ...data.healthConfig };
            }
            this._persistLocalOnly();
            this._notifyUpdated();
            console.log('[PromptPool] 已從後端同步最新提示詞池');
        } catch (e) {
            console.warn('[PromptPool] 拉取後端提示詞池失敗（忽略）:', e?.message || e);
        }
    }

    _notifyUpdated() {
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('pb:prompt-pool-updated'));
            }
        } catch {}
    }
}

// 全域例項
if (typeof window !== 'undefined') {
    window.translationPromptPool = new TranslationPromptPool();
}

// 將類新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.TranslationPromptPool = TranslationPromptPool;
}
