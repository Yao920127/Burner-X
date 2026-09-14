// llm-caller.js
// LLM呼叫輔助模組 - 提供統一的API呼叫介面

(function(window) {
  'use strict';

  /**
   * LLM呼叫器 - 封裝API呼叫邏輯，供多個模組複用
   */
  class LLMCaller {
    constructor(config = {}) {
      this.config = config;
      this.defaultTimeout = config.timeout || 60000;
    }

    /**
     * 呼叫LLM API（非流式）
     * @param {string} systemPrompt - 系統提示詞
     * @param {Array} conversationHistory - 對話歷史 [{role, content}, ...]
     * @param {string} userPrompt - 使用者提示詞
     * @param {Object} options - 可選配置
     * @returns {Promise<string>} 模型響應
     */
    async call(systemPrompt, conversationHistory = [], userPrompt, options = {}) {
      // 獲取配置
      const config = this.getConfig(options.externalConfig);

      // 構建API配置
      const apiConfig = await this.buildApiConfig(config, options.modelId);

      if (!apiConfig) {
        throw new Error('無法構建API配置');
      }

      // 構建訊息列表
      const messages = this.buildMessages(systemPrompt, conversationHistory, userPrompt);

      // 呼叫API
      return await this.callApi(apiConfig, messages, options);
    }

    /**
     * 呼叫LLM API（流式）
     * @param {string} systemPrompt - 系統提示詞
     * @param {Array} conversationHistory - 對話歷史
     * @param {string} userPrompt - 使用者提示詞
     * @param {Function} onChunk - 流式回撥 (chunk) => void
     * @param {Object} options - 可選配置
     * @returns {Promise<string>} 完整響應
     */
    async callStream(systemPrompt, conversationHistory = [], userPrompt, onChunk, options = {}) {
      const config = this.getConfig(options.externalConfig);
      const apiConfig = await this.buildApiConfig(config, options.modelId);

      if (!apiConfig || !apiConfig.streamSupport) {
        // 不支援流式，降級到非流式
        const response = await this.call(systemPrompt, conversationHistory, userPrompt, options);
        if (onChunk) onChunk(response);
        return response;
      }

      const messages = this.buildMessages(systemPrompt, conversationHistory, userPrompt);

      return await this.callApiStream(apiConfig, messages, onChunk, options);
    }

    /**
     * 獲取配置
     */
    getConfig(externalConfig = null) {
      if (externalConfig) return externalConfig;

      // 使用 ChatbotConfigManager 獲取配置
      if (window.ChatbotConfigManager) {
        try {
          const chatbotConfig = window.ChatbotConfigManager.getChatbotModelConfig();
          return window.ChatbotConfigManager.convertChatbotConfigToMessageSenderFormat(chatbotConfig);
        } catch (error) {
          console.error('[LLMCaller] 獲取配置失敗:', error);
        }
      }

      // 回退：使用全域配置
      if (window.MessageSender && window.MessageSender.getChatbotConfig) {
        return window.MessageSender.getChatbotConfig();
      }

      throw new Error('無法獲取LLM配置');
    }

    /**
     * 構建API配置
     */
    async buildApiConfig(config, modelId = null) {
      let selectedModelId = modelId;

      // 如果未指定模型ID，按優先順序獲取
      if (!selectedModelId) {
        // 檢查是否為自定義源（與message-sender.js保持一致）
        if (config.model === 'custom' ||
            (typeof config.model === 'string' && config.model.startsWith('custom_source_'))) {
          // 1. 最高優先順序：Chatbot 專用配置的模型ID（cms.modelId）
          if (config.cms && config.cms.modelId) {
            selectedModelId = config.cms.modelId;
            console.log('[LLMCaller] ✓ 使用 Chatbot 獨立配置:', selectedModelId);
          }
          // 2. 回退：翻譯模型配置
          if (!selectedModelId && config.settings && config.settings.selectedCustomModelId) {
            selectedModelId = config.settings.selectedCustomModelId;
            console.log('[LLMCaller] ↩ 回退到翻譯模型配置:', selectedModelId);
          }
          // 3. 進一步回退：可用模型列表的第一個
          if (!selectedModelId && Array.isArray(config.siteSpecificAvailableModels) && config.siteSpecificAvailableModels.length > 0) {
            selectedModelId = typeof config.siteSpecificAvailableModels[0] === 'object'
              ? config.siteSpecificAvailableModels[0].id
              : config.siteSpecificAvailableModels[0];
            console.log('[LLMCaller] ↩ 使用可用模型列表的第一個:', selectedModelId);
          }
        } else {
          // 非自定義源，直接使用 config.model
          selectedModelId = config.selectedModelId || config.model;
        }
      }

      if (!selectedModelId) {
        throw new Error('未指定模型ID，請在Chatbot設定中選擇一個模型');
      }

      // 使用 ApiConfigBuilder
      if (window.ApiConfigBuilder && window.ApiConfigBuilder.buildCustomApiConfig) {
        console.log('[LLMCaller] 最終模型ID:', selectedModelId);
        return window.ApiConfigBuilder.buildCustomApiConfig(
          config.apiKey,
          config.cms.apiEndpoint || config.cms.apiBaseUrl,
          selectedModelId,
          config.cms.requestFormat,
          config.cms.temperature,
          config.cms.max_tokens,
          {
            endpointMode: (config.cms && config.cms.endpointMode) || 'auto'
          }
        );
      }

      throw new Error('ApiConfigBuilder未載入');
    }

    /**
     * 構建訊息列表
     */
    buildMessages(systemPrompt, conversationHistory, userPrompt) {
      const messages = [];

      // 新增系統提示詞
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      // 新增對話歷史
      if (Array.isArray(conversationHistory)) {
        conversationHistory.forEach(msg => {
          messages.push({
            role: msg.role,
            content: this.extractTextContent(msg.content)
          });
        });
      }

      // 新增使用者提示詞
      if (userPrompt) {
        messages.push({ role: 'user', content: userPrompt });
      }

      return messages;
    }

    /**
     * 提取文字內容（處理多模態訊息）
     */
    extractTextContent(content) {
      if (typeof content === 'string') {
        return content;
      }

      if (Array.isArray(content)) {
        const textParts = content.filter(part => part.type === 'text');
        return textParts.map(part => part.text).join('\n');
      }

      return String(content);
    }

    /**
     * 呼叫API（非流式）
     */
    async callApi(apiConfig, messages, options = {}) {
      let requestBody;

      if (apiConfig.bodyBuilder) {
        // 從 messages 陣列中提取 system、history、user
        const systemMsg = messages.find(m => m.role === 'system');
        const systemPrompt = systemMsg ? systemMsg.content : '';
        const historyMsgs = messages.filter(m => m.role !== 'system' && m !== messages[messages.length - 1]);
        const userMsg = messages[messages.length - 1];
        const userContent = userMsg ? userMsg.content : '';

        requestBody = apiConfig.bodyBuilder(systemPrompt, historyMsgs, userContent);
      } else {
        requestBody = { messages };
      }

      // 如果有自定義的請求體構建器，使用它
      if (options.customBodyBuilder) {
        Object.assign(requestBody, options.customBodyBuilder(messages));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeout);

      try {
        const response = await fetch(apiConfig.endpoint, {
          method: 'POST',
          headers: apiConfig.headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API呼叫失敗 (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // 使用responseExtractor提取響應
        if (apiConfig.responseExtractor) {
          return apiConfig.responseExtractor(data);
        }

        // 預設提取邏輯
        return data?.choices?.[0]?.message?.content || String(data);

      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          throw new Error('API呼叫超時');
        }

        throw error;
      }
    }

    /**
     * 呼叫API（流式）
     */
    async callApiStream(apiConfig, messages, onChunk, options = {}) {
      let requestBody;

      if (apiConfig.streamBodyBuilder) {
        // 從 messages 陣列中提取 system、history、user
        const systemMsg = messages.find(m => m.role === 'system');
        const systemPrompt = systemMsg ? systemMsg.content : '';
        const historyMsgs = messages.filter(m => m.role !== 'system' && m !== messages[messages.length - 1]);
        const userMsg = messages[messages.length - 1];
        const userContent = userMsg ? userMsg.content : '';

        requestBody = apiConfig.streamBodyBuilder(systemPrompt, historyMsgs, userContent);
      } else {
        requestBody = { messages, stream: true };
      }

      if (options.customBodyBuilder) {
        Object.assign(requestBody, options.customBodyBuilder(messages));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.defaultTimeout);

      try {
        const response = await fetch(apiConfig.endpoint, {
          method: 'POST',
          headers: apiConfig.headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        if (!response.ok) {
          clearTimeout(timeoutId);
          const errorText = await response.text();
          throw new Error(`API呼叫失敗 (${response.status}): ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            clearTimeout(timeoutId);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || line.trim() === 'data: [DONE]') continue;

            try {
              const jsonStr = line.replace(/^data:\s*/, '');
              const parsed = JSON.parse(jsonStr);

              let chunk = '';
              if (parsed.choices?.[0]?.delta?.content) {
                chunk = parsed.choices[0].delta.content;
              } else if (parsed.choices?.[0]?.text) {
                chunk = parsed.choices[0].text;
              }

              if (chunk) {
                fullResponse += chunk;
                if (onChunk) onChunk(chunk);
              }
            } catch (e) {
              // 忽略解析錯誤的行
            }
          }
        }

        return fullResponse;

      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          throw new Error('API呼叫超時');
        }

        throw error;
      }
    }

    /**
     * 快捷方法：簡單呼叫（只傳使用者提示詞）
     */
    async quick(userPrompt, systemPrompt = '', options = {}) {
      return await this.call(systemPrompt, [], userPrompt, options);
    }
  }

  // 建立全域單例
  window.LLMCaller = LLMCaller;
  window.llmCaller = new LLMCaller();

  console.log('[LLMCaller] 模組已載入');

})(window);
