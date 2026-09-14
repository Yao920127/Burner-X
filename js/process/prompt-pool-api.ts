// process/prompt-pool-api.js
// 提示詞池 - 統一生成呼叫配置，複用 translation.js 的構建邏輯

(function() {
  /**
   * 構建用於提示詞池生成請求的 API 配置。
   * - 預設模型：使用與翻譯相同的端點與請求格式（deepseek/mistral/gemini）。
   * - 自定義源站點：複用 buildCustomApiConfig，自動補全相容端點（/v1/chat/completions 等）。
   *
   * @param {string} apiModel - 預設模型名（mistral/deepseek/gemini）或 "siteId:modelId"。
   * @param {string} apiKey - 對應模型的 API Key。
   * @returns {{endpoint:string, modelName:string, headers:Object, bodyBuilder:Function, responseExtractor:Function}}
   */
  function buildPromptPoolGenerationConfig(apiModel, apiKey) {
    if (!apiModel) throw new Error('未指定模型');
    if (!apiKey) throw new Error('未提供 API Key');

    // 延遲檢查，避免初始化時機問題
    const ensureBuilders = () => {
      if (typeof processModule === 'undefined' ||
          typeof processModule.buildCustomApiConfig !== 'function' ||
          typeof processModule.buildPredefinedApiConfig !== 'function') {
        throw new Error('translation.js 尚未載入，無法構建 API 配置');
      }
    };

    // 自定義源站點（格式：siteId:modelId）
    if (apiModel.includes(':')) {
      ensureBuilders();
      const separatorIndex = apiModel.indexOf(':');
      const siteId = apiModel.slice(0, separatorIndex);
      const modelId = apiModel.slice(separatorIndex + 1);
      const allSites = (typeof loadAllCustomSourceSites === 'function') ? loadAllCustomSourceSites() : {};
      const site = allSites[siteId];
      if (!site) throw new Error(`未找到源站點配置：${siteId}`);

      // 複用 translation.js 的自定義構建，自動處理端點字尾與請求格式
      return processModule.buildCustomApiConfig(
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
    }

    // 預設模型（與 translateMarkdown 保持一致）
    ensureBuilders();
    const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
    const temperature = (settings.customModelSettings && settings.customModelSettings.temperature) || 0.5;
    const maxTokens = (settings.customModelSettings && settings.customModelSettings.max_tokens) || 8000;

    const predefined = {
      deepseek: {
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        modelName: 'DeepSeek v3 (deepseek-v3)',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          model: 'deepseek-chat',
          messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ],
          temperature, max_tokens: maxTokens
        }),
        responseExtractor: d => d?.choices?.[0]?.message?.content
      },
      gemini: {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        modelName: 'Google Gemini 2.0 Flash',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          contents: [ { role: 'user', parts: [{ text: `${sys}\n\n${user}` }] } ],
          generationConfig: { temperature, maxOutputTokens: maxTokens }
        }),
        responseExtractor: d => d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      },
      mistral: {
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        modelName: 'Mistral Large (mistral-large-latest)',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, user) => ({
          model: 'mistral-large-latest',
          messages: [ { role: 'system', content: sys }, { role: 'user', content: user } ],
          temperature, max_tokens: maxTokens
        }),
        responseExtractor: d => d?.choices?.[0]?.message?.content
      }
    };

    if (!predefined[apiModel]) throw new Error(`不支援的模型：${apiModel}`);
    return processModule.buildPredefinedApiConfig(predefined[apiModel], apiKey);
  }

  // 暴露到全域
  if (typeof window !== 'undefined') {
    window.buildPromptPoolGenerationConfig = buildPromptPoolGenerationConfig;
  }
})();
