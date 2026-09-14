// api-config-builder.js
// API配置構建模組

(function() {
  'use strict';

  // =====================
  // buildCustomApiConfig: 相容自定義模型呼叫
  // =====================
  /**
   * 構建自定義 API 訪問配置。
   * 該函式負責根據傳入的引數，生成一個完整的 API 請求配置物件，
   * 包括請求端點、模型ID、請求頭、請求體構建器、響應提取器以及流式支援等。
   *
   * 主要邏輯：
   * 1. 端點處理：如果 `window.modelDetector` 存在且能提供完整端點，則優先使用。
   *    否則，如果提供的 `customApiEndpoint` 不規範（不含 `/v1/` 或 `/v1` 結尾），
   *    會自動拼接 `/v1/chat/completions`。
   * 2. 請求格式自動推斷：如果 `customRequestFormat` 為空且端點以 `/v1/chat/completions` 結尾，
   *    則自動設定為 `openai` 格式。
   * 3. 模型ID獲取：如果 `window.modelDetector` 存在，則嘗試獲取當前選擇的模型ID。
   * 4. 根據 `customRequestFormat` (如 'openai', 'anthropic', 'gemini' 等) 構建特定配置：
   *    - 設定認證頭 (Authorization, x-api-key)。
   *    - 定義 `bodyBuilder` 用於構建非流式請求的請求體。
   *    - 定義 `streamBodyBuilder` 用於構建流式請求的請求體。
   *    - 定義 `responseExtractor` 用於從 API 響應中提取所需內容。
   *    - 設定 `streamSupport` 標記是否支援流式響應。
   *    - 為 Gemini 等特殊模型處理端點引數 (如 `alt=sse`)。
   * 5. 對於不支援的 `customRequestFormat`，會丟擲錯誤。
   * 6. 最終返回構建好的 `config` 物件。
   *
   * @param {string} key API 金鑰。
   * @param {string} customApiEndpoint 自定義 API 端點基礎 URL。
   * @param {string} customModelId 自定義模型 ID。
   * @param {string} customRequestFormat 自定義請求格式 (例如 'openai', 'anthropic', 'gemini')。
   * @param {number} [temperature] 模型溫度引數，控制生成文字的隨機性。
   * @param {number} [max_tokens] 模型最大輸出 token 數。
   * @returns {object} 構建好的 API 配置物件，包含 endpoint, modelName, headers, bodyBuilder, responseExtractor, streamSupport, streamBodyBuilder 等。
   * @throws {Error} 如果 customRequestFormat 不被支援。
   */

  // 輔助函式：如果 userContent 是陣列，則提取其中的文字內容
  const extractTextFromUserContent = (userContent) => {
    if (Array.isArray(userContent)) {
      const textPart = userContent.find(part => part.type === 'text');
      return textPart ? textPart.text : '';
    }
    return userContent; // 假設已經是字串
  };

  // 輔助函式：將 OpenAI 風格的 userContent 轉換為 Gemini 格式
  const convertOpenAIToGeminiParts = (userContent) => {
    if (Array.isArray(userContent)) {
      return userContent.map(part => {
        if (part.type === 'text') {
          return { text: part.text };
        } else if (part.type === 'image_url' && part.image_url && part.image_url.url) {
          const base64Data = part.image_url.url.split(',')[1];
          if (!base64Data) return null;
          const mimeType = part.image_url.url.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
          return { inlineData: { mimeType: mimeType, data: base64Data } };
        }
        return null;
      }).filter(p => p);
    }
    return [{ text: userContent }]; // 假設為字串
  };

  // 輔助函式：將 OpenAI 風格的 userContent 轉換為 Anthropic 格式
  const convertOpenAIToAnthropicContent = (userContent) => {
    if (Array.isArray(userContent)) {
      return userContent.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image_url' && part.image_url && part.image_url.url) {
          const base64Data = part.image_url.url.split(',')[1];
          if (!base64Data) return null;
          const mediaType = part.image_url.url.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
          return { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };
        }
        return null;
      }).filter(p => p);
    }
    return [{ type: 'text', text: userContent }]; // 假設為字串
  };

  const appendPathSegment = (base, segment) => {
    if (!base) return segment || '';
    if (!segment) return base;
    const hasTrailingSlash = base.endsWith('/');
    const hasLeadingSlash = segment.startsWith('/');
    if (hasTrailingSlash && hasLeadingSlash) {
      return base + segment.slice(1);
    }
    if (!hasTrailingSlash && !hasLeadingSlash) {
      return `${base}/${segment}`;
    }
    return base + segment;
  };

  const normalizeOpenAIEndpointForChatbot = (baseApiUrlInput, format, endpointMode = 'auto', targetSegment) => {
    if (!baseApiUrlInput || typeof baseApiUrlInput !== 'string') {
      throw new Error('自定義模型需要提供 API Base URL');
    }

    const trimmed = baseApiUrlInput.trim();
    if (!trimmed) {
      throw new Error('自定義模型需要提供 API Base URL');
    }

    const mode = endpointMode || 'auto';
    const normalizedSegment = (targetSegment
      ? targetSegment
      : ((format || '').toLowerCase() === 'anthropic' ? 'messages' : 'chat/completions'))
      .replace(/^\/+/, '');

    const lower = trimmed.toLowerCase();
    const base = trimmed.replace(/\/+$/, '');
    const v1Segment = normalizedSegment.startsWith('v1/') ? normalizedSegment : `v1/${normalizedSegment}`;

    const terminalPaths = [
      normalizedSegment,
      `/${normalizedSegment}`,
      v1Segment,
      `/${v1Segment}`
    ];

    if (terminalPaths.some(path => lower.endsWith(path))) {
      return base;
    }

    if (mode === 'manual') {
      return base;
    }

    if (mode === 'chat') {
      return appendPathSegment(base, normalizedSegment);
    }

    if (/\/v1$/.test(lower)) {
      return appendPathSegment(base, normalizedSegment);
    }

    return appendPathSegment(base, v1Segment);
  };

  function buildCustomApiConfig(key, customApiEndpoint, customModelId, customRequestFormat, temperature, max_tokens, options = {}) {
    let apiEndpoint = customApiEndpoint;
    let modelId = customModelId;
    const endpointMode = options.endpointMode || 'auto';
    let resolvedRequestFormat = customRequestFormat;

    // 獲取當前選擇的模型ID（如果有模型檢測模組）
    if (typeof window.modelDetector !== 'undefined') {
      const currentModelId = window.modelDetector.getCurrentModelId();
      if (currentModelId) {
        modelId = currentModelId;
      }
    }

    // 新增：如果 customRequestFormat 為空且 endpoint 以 /v1/chat/completions 結尾，則自動設為 openai
    if ((!resolvedRequestFormat || resolvedRequestFormat === '') && apiEndpoint && apiEndpoint.endsWith('/v1/chat/completions')) {
      resolvedRequestFormat = 'openai';
    }

    // 檢查是否有模型檢測模組，如果有則使用其提供的完整端點
    // 注意：現在 resolvedRequestFormat 已經確定，端點標準化會使用正確的路徑
    if (typeof window.modelDetector !== 'undefined' && typeof window.modelDetector.getFullApiEndpoint === 'function') {
      const fullEndpoint = window.modelDetector.getFullApiEndpoint();
      if (fullEndpoint) {
        apiEndpoint = fullEndpoint;
      } else {
        apiEndpoint = normalizeOpenAIEndpointForChatbot(apiEndpoint, resolvedRequestFormat, endpointMode);
      }
    } else {
      apiEndpoint = normalizeOpenAIEndpointForChatbot(apiEndpoint, resolvedRequestFormat, endpointMode);
    }

    const config = {
      endpoint: apiEndpoint,
      modelName: modelId, // 使用最新獲取的modelId
      headers: { 'Content-Type': 'application/json' },
      bodyBuilder: null,
      responseExtractor: null,
      streamSupport: false, // 預設不支援流式
      streamBodyBuilder: null // 流式請求構建器
    };

    const normalizedFormat = (resolvedRequestFormat || 'openai').toLowerCase();

    switch (normalizedFormat) {
      case 'openai':
      case 'openai-vision': // Add a specific format for vision-enabled OpenAI
        config.headers['Authorization'] = `Bearer ${key}`;
        config.bodyBuilder = (sys_prompt, user_content) => ({ // user_content can be string or array
          model: modelId,
          messages: [{ role: "system", content: sys_prompt }, { role: "user", content: user_content }],
          temperature: temperature ?? 0.5,
          max_tokens: max_tokens ?? 8000
        });

        // 流式請求構建器 - 針對轉接站相容性最佳化
        config.streamBodyBuilder = (sys, msgs, user_content) => {
          // 檢測是否是 Claude 模型 + OpenAI 格式（轉接站場景）
          const isClaudeViaProxy = modelId && typeof modelId === 'string' && modelId.toLowerCase().includes('claude');

          if (isClaudeViaProxy) {
            // 對於透過轉接站使用的 Claude 模型，將 system prompt 合併到第一條 user 訊息中
            // 因為很多轉接站不正確處理 system role
            console.log('[ApiConfigBuilder] 🔧 檢測到透過轉接站使用 Claude，將 system prompt 合併到 user 訊息');

            // 構建合併後的第一條使用者訊息
            let firstUserMessage = sys ? `${sys}\n\n---\n\n` : '';
            if (typeof user_content === 'string') {
              firstUserMessage += user_content;
            } else if (Array.isArray(user_content)) {
              // 如果是多模態內容，只提取文字部分合並
              const textPart = user_content.find(p => p.type === 'text');
              if (textPart) {
                firstUserMessage += textPart.text;
              }
            }

            return {
              model: modelId,
              messages: [
                ...msgs,
                { role: 'user', content: firstUserMessage }
              ],
              temperature: temperature ?? 0.5,
              max_tokens: max_tokens ?? 8000,
              stream: true
            };
          } else {
            // 其他模型使用標準格式
            return {
              model: modelId,
              messages: [
                { role: 'system', content: sys },
                ...msgs,
                { role: 'user', content: user_content }
              ],
              temperature: temperature ?? 0.5,
              max_tokens: max_tokens ?? 8000,
              stream: true
            };
          }
        };
        config.responseExtractor = (data) => data?.choices?.[0]?.message?.content;
        config.streamSupport = true;
        break;
      case 'anthropic':
        config.headers['x-api-key'] = key;
        config.headers['anthropic-version'] = '2023-06-01';
        config.bodyBuilder = (sys_prompt, user_content) => ({
          model: modelId,
          system: sys_prompt,
          messages: [{ role: "user", content: convertOpenAIToAnthropicContent(user_content) }],
          temperature: temperature ?? 0.5,
          max_tokens: max_tokens ?? 8000
        });
        config.streamBodyBuilder = (sys, msgs, user_content) => {
          return {
            model: modelId,
            system: sys,
            messages: msgs.length ?
              [...msgs, { role: 'user', content: convertOpenAIToAnthropicContent(user_content) }] :
              [{ role: 'user', content: convertOpenAIToAnthropicContent(user_content) }],
            max_tokens: max_tokens ?? 8000,
            temperature: temperature ?? 0.5,
            stream: true
          };
        };
        config.responseExtractor = (data) => data?.content?.[0]?.text;
        config.streamSupport = true;
        config.streamHandler = 'claude';
        break;
      case 'gemini':
      case 'gemini-preview': // Assuming gemini-preview also supports this
        let baseUrl = config.endpoint.split('?')[0];
        config.endpoint = `${baseUrl}?key=${key}`;
        config.streamEndpoint = `${baseUrl}?key=${key}&alt=sse`;
        const geminiModelIdToUse = modelId || (normalizedFormat === 'gemini-preview' ? 'gemini-1.5-flash-latest' : 'gemini-pro'); // Updated default for preview
        config.modelName = geminiModelIdToUse;

        config.bodyBuilder = (sys_prompt, user_content) => ({
          contents: [{ role: "user", parts: convertOpenAIToGeminiParts(user_content) }],
          generationConfig: { temperature: temperature ?? 0.5, maxOutputTokens: max_tokens ?? 8192 },
          ...(sys_prompt && { systemInstruction: { parts: [{ text: sys_prompt }] }})
        });
        config.streamBodyBuilder = (sys, msgs, user_content) => {
          const geminiMessages = [];
          if (msgs.length) {
            for (const msg of msgs) {
              geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: convertOpenAIToGeminiParts(msg.content) });
            }
          }
          geminiMessages.push({ role: 'user', parts: convertOpenAIToGeminiParts(user_content) });
          return {
            contents: geminiMessages,
            generationConfig: {
              temperature: temperature ?? 0.5,
              maxOutputTokens: max_tokens ?? 8192,
              ...(normalizedFormat === 'gemini-preview' && { responseModalities: ["TEXT"], responseMimeType: "text/plain" })
            },
            ...(sys && { systemInstruction: { parts: [{ text: sys }] }})
          };
        };
        config.responseExtractor = (data) => {
          if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            return parts && parts.length > 0 ? parts.map(p => p.text).join('') : ''; // Join text parts
          }
          return '';
        };
        config.streamSupport = true;
        config.streamHandler = 'gemini';
        break;
      case 'volcano':
      case 'tongyi':
        config.headers['Authorization'] = `Bearer ${key}`;
        let specificModelId = '';
        // 讀取儲存的預設模型ID作為具體模型
        try {
          const cfg = (customRequestFormat === 'volcano') ? (window.loadModelConfig && loadModelConfig('volcano')) : (window.loadModelConfig && loadModelConfig('tongyi'));
          if (cfg && (cfg.preferredModelId || cfg.modelId)) specificModelId = cfg.preferredModelId || cfg.modelId;
        } catch {}

        config.bodyBuilder = (sys_prompt, user_content) => ({
          model: modelId || specificModelId,
          messages: [
            { role: 'system', content: sys_prompt },
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          temperature: temperature ?? 0.5,
          max_tokens: max_tokens ?? 8192,
          stream: true
        });
        config.streamBodyBuilder = (sys, msgs, user_content) => ({
          model: modelId || specificModelId,
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          temperature: temperature ?? 0.5,
          max_tokens: max_tokens ?? 8192,
          stream: true
        });
        config.responseExtractor = (data) => data?.choices?.[0]?.message?.content;
        config.streamSupport = true;
        config.streamHandler = true;
        break;
      default:
        config.headers['Authorization'] = `Bearer ${key}`;
        config.bodyBuilder = (sys_prompt, user_content) => ({
          model: modelId,
          messages: [{ role: "system", content: sys_prompt }, { role: "user", content: extractTextFromUserContent(user_content) }],
          temperature: temperature ?? 0.5,
          max_tokens: max_tokens ?? 8000
        });
        config.streamBodyBuilder = (sys, msgs, user_content) => ({
          model: modelId,
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          stream: true,
          temperature: temperature ?? 0.5,
          max_tokens: max_tokens ?? 8000,
        });
        config.responseExtractor = (data) => data?.choices?.[0]?.message?.content;
        config.streamSupport = true;
        console.warn(`Custom request format "${resolvedRequestFormat}" is not explicitly handled for multimodal input. Defaulting to text-only for user messages if images are provided.`);
    }
    console.log('buildCustomApiConfig:', {
      customRequestFormat: resolvedRequestFormat,
      endpoint: apiEndpoint,
      modelId,
      streamSupport: config.streamSupport,
      hasStreamBodyBuilder: !!config.streamBodyBuilder
    });
    return config;
  }

  // 匯出到全域
  window.ApiConfigBuilder = {
    buildCustomApiConfig
  };

})();
