// js/processing/reference-ai-processor.js
// 參考文獻AI批次處理器 - 使用AI提取文獻後設資料

(function(global) {
    'use strict';

    /**
     * 批次大小（每批處理的文獻數量）
     */
    const BATCH_SIZE = 10;

    /**
     * 生成AI提示詞 - 用於提取文獻資訊（簡化版，讓AI自己決定欄位）
     */
    function generateExtractionPrompt(references, sourceLang = 'auto') {
        const langHint = sourceLang !== 'auto' ? `注意：文獻可能是${sourceLang}語言。` : '';

        // 構建 JSON 輸入格式，讓 AI 更容易對應每條文獻
        const inputJson = references.map((ref, idx) => ({
            id: idx,
            raw: ref
        }));

        return {
            system: `你是專業的文獻資訊提取助手。從參考文獻中提取結構化資訊，返回JSON格式。

輸入格式：
[
  {"id": 0, "raw": "文獻原始文字"},
  {"id": 1, "raw": "文獻原始文字"}
]

返回格式：
{
  "references": [
    {
      "id": 0,
      "authors": ["作者列表"],
      "title": "標題",
      "year": 2023,
      "journal": "期刊",
      "doi": "DOI",
      "url": "連結"
    }
  ]
}

提取規則：
- 提取所有能識別的欄位（authors, title, year, journal, volume, issue, pages, doi, url等）
- 無法提取的欄位設為null
- 保持原文格式
- ${langHint}
- 只返回JSON，不要任何其他文字

⚠️ 嚴格要求：
- 必須返回 ${references.length} 條文獻，每條文獻的 id 必須與輸入一一對應（0 到 ${references.length - 1}）
- 不要遺漏任何一條（檢查 id 是否連續）
- 不要新增額外的文獻
- 不要編造不存在的資訊
- 保持 id 順序與輸入完全一致`,

            user: JSON.stringify(inputJson, null, 2)
        };
    }

    /**
     * 呼叫AI API提取文獻資訊（帶指數退避重試）
     */
    async function callAIExtraction(references, apiConfig, sourceLang = 'auto') {
        const maxRetries = 3;
        const baseDelay = 1000;
        const maxDelay = 8000;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const prompt = generateExtractionPrompt(references, sourceLang);
                const requestBody = apiConfig.bodyBuilder
                    ? apiConfig.bodyBuilder(prompt.system, prompt.user)
                    : {
                        model: apiConfig.modelName,
                        messages: [
                            { role: "system", content: prompt.system },
                            { role: "user", content: prompt.user }
                        ],
                        temperature: 0.1
                    };

                if (attempt === 0) {
                    console.log('[ReferenceAIProcessor] 請求詳情:', {
                        endpoint: apiConfig.endpoint,
                        model: apiConfig.modelName,
                        hasApiKey: !!apiConfig.apiKey,
                        headers: apiConfig.headers,
                        bodyPreview: {
                            model: requestBody.model,
                            messagesCount: requestBody.messages?.length,
                            temperature: requestBody.temperature
                        }
                    });
                }

                const headers = apiConfig.headers || {};

                const response = await fetch(apiConfig.endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestBody)
                });

                console.log(`[ReferenceAIProcessor] 響應狀態 (嘗試 ${attempt + 1}/${maxRetries + 1}):`, response.status, response.statusText);

                if (!response.ok) {
                    const errorText = await response.text();
                    const isRetriable = [401, 403, 408, 429, 500, 502, 503, 504].includes(response.status);

                    console.error('[ReferenceAIProcessor] API錯誤響應:', {
                        status: response.status,
                        statusText: response.statusText,
                        preview: errorText.substring(0, 500),
                        retriable: isRetriable
                    });

                    if (isRetriable && attempt < maxRetries) {
                        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                        console.log(`[ReferenceAIProcessor] 等待 ${Math.round(delay)}ms 後重試...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw new Error(`API請求失敗 (${response.status}): ${response.statusText}`);
                }

                const responseText = await response.text();
                if (attempt === 0) {
                    console.log('[ReferenceAIProcessor] 原始響應前500字元:', responseText.substring(0, 500));
                }

                // 檢查是否是HTML響應
                if (responseText.trim().toLowerCase().startsWith('<!doctype') ||
                    responseText.trim().toLowerCase().startsWith('<html')) {
                    console.error('[ReferenceAIProcessor] API返回了HTML頁面而不是JSON');
                    throw new Error('API返回HTML而非JSON，請檢查端點配置和API Key');
                }

                const data = JSON.parse(responseText);

                // 檢查是否因長度限制被截斷
                const finishReason = data?.choices?.[0]?.finish_reason;
                if (finishReason === 'length') {
                    console.warn(`[ReferenceAIProcessor] 響應被截斷 (finish_reason: length)，嘗試 ${attempt + 1}/${maxRetries + 1}`);

                    // 如果批次大小 > 5，拆分成更小的子批次重試
                    if (references.length > 5) {
                        console.warn(`[ReferenceAIProcessor] 批次太大 (${references.length} 條)，拆分為 2 個子批次重試...`);
                        const mid = Math.ceil(references.length / 2);
                        const batch1 = references.slice(0, mid);
                        const batch2 = references.slice(mid);

                        // 遞迴呼叫，分別處理兩個子批次
                        const [results1, results2] = await Promise.all([
                            callAIExtraction(batch1, apiConfig, sourceLang),
                            callAIExtraction(batch2, apiConfig, sourceLang)
                        ]);

                        // 合併結果（保持 id 順序）
                        return [...results1, ...results2];
                    } else if (attempt < maxRetries) {
                        // 批次已經很小，延遲後重試
                        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                        console.warn(`[ReferenceAIProcessor] 批次較小 (${references.length} 條)，等待 ${Math.round(delay)}ms 後重試...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    } else {
                        throw new Error(`響應被截斷（finish_reason: length），批次大小已最小 (${references.length} 條)，無法繼續拆分`);
                    }
                }

                const extractedText = apiConfig.responseExtractor
                    ? apiConfig.responseExtractor(data)
                    : data?.choices?.[0]?.message?.content;

                if (!extractedText) {
                    console.error('[ReferenceAIProcessor] 響應資料:', data);

                    if (attempt < maxRetries) {
                        console.warn(`[ReferenceAIProcessor] 內容為空，嘗試 ${attempt + 1}/${maxRetries + 1}，將重試...`);
                        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw new Error('API返回的內容為空');
                }

                // 清理可能的markdown程式碼塊標記
                let cleanText = extractedText.trim();
                if (cleanText.startsWith('```json')) {
                    cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
                } else if (cleanText.startsWith('```')) {
                    cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '');
                }

                // 解析JSON響應
                try {
                    const parsed = JSON.parse(cleanText);
                    const extractedRefs = parsed.references || [];

                    // 驗證1：數量必須比對
                    if (extractedRefs.length !== references.length) {
                        console.error(`[ReferenceAIProcessor] 數量不比對: 輸入 ${references.length} 條，AI 返回 ${extractedRefs.length} 條`);
                        console.error('[ReferenceAIProcessor] 輸入文獻:', references.map((r, i) => `[${i}] ${r.substring(0, 100)}...`));
                        console.error('[ReferenceAIProcessor] AI 返回:', extractedRefs.map((r, i) => `[${i}] id=${r.id} ${r.title?.substring(0, 100)}`));

                        if (attempt < maxRetries) {
                            console.warn(`[ReferenceAIProcessor] 數量不比對（可能幻覺），嘗試 ${attempt + 1}/${maxRetries + 1}，將重試...`);
                            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }

                        throw new Error(`AI 返回數量錯誤：期望 ${references.length} 條，實際 ${extractedRefs.length} 條（可能產生幻覺）`);
                    }

                    // 驗證2：檢查 id 是否連續且完整（0 到 N-1）
                    const ids = extractedRefs.map(r => r.id).sort((a, b) => a - b);
                    const expectedIds = Array.from({ length: references.length }, (_, i) => i);
                    const missingIds = expectedIds.filter(id => !ids.includes(id));
                    const extraIds = ids.filter(id => !expectedIds.includes(id));

                    if (missingIds.length > 0 || extraIds.length > 0) {
                        console.error(`[ReferenceAIProcessor] ID 不比對:`);
                        if (missingIds.length > 0) {
                            console.error(`  缺失 ID: ${missingIds.join(', ')}`);
                        }
                        if (extraIds.length > 0) {
                            console.error(`  額外 ID: ${extraIds.join(', ')}`);
                        }
                        console.error('[ReferenceAIProcessor] AI 返回的 ID:', ids.join(', '));
                        console.error('[ReferenceAIProcessor] 期望的 ID:', expectedIds.join(', '));

                        if (attempt < maxRetries) {
                            console.warn(`[ReferenceAIProcessor] ID 不連續（可能幻覺或遺漏），嘗試 ${attempt + 1}/${maxRetries + 1}，將重試...`);
                            const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }

                        throw new Error(`AI 返回的 ID 不連續：缺失 [${missingIds.join(', ')}]，額外 [${extraIds.join(', ')}]`);
                    }

                    // 驗證3：按 id 排序確保順序正確
                    extractedRefs.sort((a, b) => a.id - b.id);

                    console.log(`[ReferenceAIProcessor] 成功提取 ${extractedRefs.length} 條文獻（驗證透過：數量✓ ID連續✓）`);
                    return extractedRefs;
                } catch (parseError) {
                    console.error('[ReferenceAIProcessor] JSON解析失敗:', parseError);
                    console.error('[ReferenceAIProcessor] 原始內容:', cleanText.substring(0, 1000));

                    if (attempt < maxRetries) {
                        console.warn(`[ReferenceAIProcessor] JSON格式錯誤，嘗試 ${attempt + 1}/${maxRetries + 1}，將重試...`);
                        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw parseError;
                }

            } catch (error) {
                // 網路錯誤也重試
                if (attempt < maxRetries && (error.name === 'TypeError' || error.message.includes('fetch'))) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
                    console.error(`[ReferenceAIProcessor] 網路錯誤，嘗試 ${attempt + 1}/${maxRetries + 1}，等待 ${Math.round(delay)}ms 後重試:`, error.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                console.error(`[ReferenceAIProcessor] AI extraction failed after ${attempt + 1} attempts:`, error);
                throw error;
            }
        }

        throw new Error(`AI提取失敗：已嘗試 ${maxRetries + 1} 次`);
    }

    /**
     * 批次處理文獻（分批並行）
     * @param {Array} references - 文獻條目陣列（原始文字）
     * @param {Object} apiConfig - API配置
     * @param {string} sourceLang - 源語言
     * @param {Function} progressCallback - 進度回撥
     * @returns {Promise<Array>} 處理結果
     */
    async function batchProcessReferences(references, apiConfig, sourceLang = 'auto', progressCallback = null) {
        if (!references || !Array.isArray(references) || references.length === 0) {
            return [];
        }

        // 分批
        const batches = [];
        for (let i = 0; i < references.length; i += BATCH_SIZE) {
            batches.push(references.slice(i, i + BATCH_SIZE));
        }

        console.log(`[ReferenceAIProcessor] Processing ${references.length} references in ${batches.length} batches (${BATCH_SIZE} per batch)`);

        const results = [];
        let processedCount = 0;

        // 並行處理所有批次
        const batchPromises = batches.map(async (batch, batchIndex) => {
            try {
                const batchResults = await callAIExtraction(batch, apiConfig, sourceLang);

                // 更新進度
                processedCount += batch.length;
                if (progressCallback) {
                    progressCallback({
                        processed: processedCount,
                        total: references.length,
                        batchIndex: batchIndex,
                        totalBatches: batches.length
                    });
                }

                return batchResults;
            } catch (error) {
                console.error(`[ReferenceAIProcessor] Batch ${batchIndex} failed:`, error);

                // 失敗時返回原始資料
                return batch.map((ref, idx) => ({
                    index: batchIndex * BATCH_SIZE + idx,
                    rawText: ref,
                    extractedBy: 'fallback',
                    error: error.message
                }));
            }
        });

        // 等待所有批次完成
        const batchResults = await Promise.all(batchPromises);

        // 合併結果
        batchResults.forEach(batchResult => {
            results.push(...batchResult);
        });

        return results;
    }

    /**
     * 智慧處理文獻（自動選擇正則或AI）
     * @param {Array} entries - 文獻條目（已經過正則提取）
     * @param {Object} apiConfig - API配置
     * @param {string} sourceLang - 源語言
     * @param {Function} progressCallback - 進度回撥
     * @param {Object} options - 額外選項 {enrichWithDOI: boolean}
     * @returns {Promise<Array>} 處理結果
     */
    async function smartProcessReferences(entries, apiConfig, sourceLang = 'auto', progressCallback = null, options = {}) {
        if (!entries || !Array.isArray(entries)) {
            return [];
        }

        // 分類：需要AI處理 vs 已成功提取
        const needsAI = entries.filter(e => e.needsAIProcessing);
        const alreadyExtracted = entries.filter(e => !e.needsAIProcessing);

        console.log(`[ReferenceAIProcessor] ${alreadyExtracted.length} references extracted by regex, ${needsAI.length} need AI processing`);

        if (needsAI.length === 0) {
            return entries.map(e => ({
                ...e,
                extractedBy: 'regex'
            }));
        }

        // AI處理需要處理的文獻
        const aiResults = await batchProcessReferences(
            needsAI.map(e => e.rawText),
            apiConfig,
            sourceLang,
            progressCallback
        );

        // 合併結果
        let finalResults = [...alreadyExtracted];

        aiResults.forEach((aiResult, idx) => {
            const original = needsAI[idx];
            finalResults.push({
                ...original,
                ...aiResult,
                extractedBy: 'ai',
                confidence: aiResult.error ? 0 : 0.8 // AI提取的置信度
            });
        });

        // 按原始索引排序
        finalResults.sort((a, b) => (a.index || 0) - (b.index || 0));

        // 可選：使用DOI解析器補充DOI資訊
        if (options.enrichWithDOI && typeof window.DOIResolver !== 'undefined') {
            console.log('[ReferenceAIProcessor] Enriching with DOI information...');
            finalResults = await enrichWithDOI(finalResults, progressCallback);
        }

        return finalResults;
    }

    /**
     * 使用DOI解析器補充文獻的DOI資訊
     * @param {Array} references - 文獻列表
     * @param {Function} progressCallback - 進度回撥
     * @returns {Promise<Array>} 補充後的文獻列表
     */
    async function enrichWithDOI(references, progressCallback = null) {
        if (!window.DOIResolver) {
            console.warn('[ReferenceAIProcessor] DOIResolver not available, skipping DOI enrichment');
            return references;
        }

        // 篩選出需要查詢DOI的文獻（沒有DOI或DOI不完整）
        const needsDOI = references.filter(ref => !ref.doi && ref.title);

        if (needsDOI.length === 0) {
            console.log('[ReferenceAIProcessor] All references already have DOI');
            return references;
        }

        console.log(`[ReferenceAIProcessor] Querying DOI for ${needsDOI.length} references`);

        // 建立DOI解析器
        const resolver = window.DOIResolver.create({
            queryOrder: ['crossref', 'openalex', 'pubmed'],
            timeout: 5000
        });

        // 批次解析
        const doiResults = await resolver.batchResolve(needsDOI, (progress) => {
            if (progressCallback) {
                progressCallback({
                    phase: 'doi-enrichment',
                    completed: progress.completed,
                    total: progress.total,
                    current: progress.current
                });
            }
        });

        // 合併DOI資訊回原始文獻列表
        const enrichedReferences = references.map(ref => {
            if (ref.doi) return ref; // 已有DOI，跳過

            const doiResult = doiResults.find(r => r.original === ref);
            if (doiResult && doiResult.resolved) {
                return {
                    ...ref,
                    doi: doiResult.resolved.doi,
                    url: doiResult.resolved.url || ref.url,
                    // 可選：用DOI查詢結果補充缺失的欄位
                    authors: ref.authors || doiResult.resolved.authors,
                    year: ref.year || doiResult.resolved.year,
                    journal: ref.journal || doiResult.resolved.journal,
                    doiSource: doiResult.resolved.source,
                    doiConfidence: doiResult.resolved.confidence
                };
            }

            return ref;
        });

        const successCount = enrichedReferences.filter(r => r.doi).length;
        console.log(`[ReferenceAIProcessor] DOI enrichment complete: ${successCount}/${references.length} now have DOI`);

        return enrichedReferences;
    }

    /**
     * 構建API配置（相容現有的翻譯API）
     */
    function buildAPIConfig(model, apiKey, modelConfig = null) {
        if (model === 'custom' && modelConfig) {
            const endpoint = modelConfig.apiEndpoint || modelConfig.apiBaseUrl;
            return {
                endpoint: endpoint,
                modelName: modelConfig.modelId,
                apiKey: apiKey,
                headers: { 'Content-Type': 'application/json' },
                bodyBuilder: (sys, user) => {
                    const messages = [
                        { role: 'system', content: sys },
                        { role: 'user', content: user }
                    ];

                    return {
                        model: modelConfig.modelId,
                        messages: messages,
                        temperature: 0.1,
                        max_tokens: modelConfig.max_tokens || 4000
                    };
                },
                responseExtractor: (data) => data?.choices?.[0]?.message?.content
            };
        }

        // 預設模型配置
        const configs = {
            'mistral': {
                endpoint: 'https://api.mistral.ai/v1/chat/completions',
                modelName: 'mistral-large-latest'
            },
            'deepseek': {
                endpoint: 'https://api.deepseek.com/v1/chat/completions',
                modelName: 'deepseek-chat'
            },
            'gemini': {
                endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                modelName: 'gemini-2.0-flash',
                bodyBuilder: (sys, user) => ({
                    contents: [{
                        role: 'user',
                        parts: [{ text: `${sys}\n\n${user}` }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 4000
                    }
                }),
                responseExtractor: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text
            }
        };

        const config = configs[model];
        if (!config) {
            throw new Error(`Unsupported model: ${model}`);
        }

        return {
            ...config,
            apiKey: apiKey,
            headers: { 'Content-Type': 'application/json' },
            bodyBuilder: config.bodyBuilder || ((sys, user) => ({
                model: config.modelName,
                messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: user }
                ],
                temperature: 0.1
            })),
            responseExtractor: config.responseExtractor || ((data) => data?.choices?.[0]?.message?.content)
        };
    }

    // 匯出API
    global.ReferenceAIProcessor = {
        batchProcessReferences,
        smartProcessReferences,
        enrichWithDOI,
        generateExtractionPrompt,
        buildAPIConfig,
        BATCH_SIZE,
        version: '1.1.0'
    };

    console.log('[ReferenceAIProcessor] Reference AI processor loaded.');

})(window);

