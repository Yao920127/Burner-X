// message-sender.js
// 訊息傳送模組

(function() {
  'use strict';

  /**
   * 獲取聊天機器人配置
   * 該函式負責從使用者設定中載入並返回當前聊天機器人所需的配置資訊。
   * 主要包括模型選擇、API Key 載入、自定義模型設定的處理等。
   *
   * 主要邏輯：
   * 1. 如果提供了 `externalConfig`，則直接返回該配置，用於外部注入的特定配置。
   * 2. 載入使用者設定：透過 `loadSettings` 函式（如果可用）或從 `localStorage` 載入。
   * 3. 讀取翻譯模型設定 (`selectedTranslationModel`)，預設為 'mistral'。
   * 4. 自定義模型處理：
   * 5. API Key 載入：
   * 6. 返回包含 `model`, `apiKey`, `apiKeyId`, `cms`, `settings`, `siteSpecificAvailableModels` 的配置物件。
   *
   * @param {object} [externalConfig=null] 可選的外部配置物件，如果提供，則直接使用此配置。
   * @returns {object} 包含模型、API Key、自定義模型設定等的配置物件。
   */
  function getChatbotConfig(externalConfig = null) {
  if (externalConfig) return externalConfig;

  // 使用新的 ChatbotConfigManager 獲取配置
  if (typeof window !== 'undefined' && window.ChatbotConfigManager) {
    try {
      const chatbotConfig = window.ChatbotConfigManager.getChatbotModelConfig();
      const convertedConfig = window.ChatbotConfigManager.convertChatbotConfigToMessageSenderFormat(chatbotConfig);

      console.log('[getChatbotConfig] 使用chatbot專用配置:', {
        chatbotConfig,
        convertedConfig
      });

      return convertedConfig;
    } catch (error) {
      console.error('[getChatbotConfig] 使用chatbot配置失敗，回退到翻譯模型配置:', error);
    }
  }

  // 回退邏輯：如果 ChatbotConfigManager 不可用，使用原有的翻譯模型配置
  console.warn('[getChatbotConfig] ChatbotConfigManager 不可用，使用翻譯模型配置');
  const settings = (typeof loadSettings === 'function') ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}');
  let model = settings.selectedTranslationModel || 'mistral';
  let cms = settings.customModelSettings || {};
  let siteSpecificAvailableModels = [];

  if (model === 'custom' && settings.selectedCustomSourceSiteId) {
    const allSites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
    const site = allSites[settings.selectedCustomSourceSiteId];
    if (site) {
      cms = site;
      model = `custom_source_${settings.selectedCustomSourceSiteId}`;
      siteSpecificAvailableModels = site.availableModels || [];
    }
  }

  let activeApiKey = '';
  let activeKeyId = null;

  if (typeof loadModelKeys === 'function') {
    const keysForModel = loadModelKeys(model);
    if (keysForModel && Array.isArray(keysForModel)) {
      const usableKeys = keysForModel.filter(k => k.status === 'valid' || k.status === 'untested');
      if (usableKeys.length > 0) {
        activeApiKey = usableKeys[0].value;
        activeKeyId = usableKeys[0].id;
      }
    }
  }

  return {
    model,
    apiKey: activeApiKey,
    apiKeyId: activeKeyId,
    cms,
    settings,
    siteSpecificAvailableModels
  };
}

// 傳送訊息到大模型（支援思維導圖請求）
/**
 * 傳送訊息到大語言模型並處理響應，支援思維導圖生成請求。
 *
 * @param {string|Array<object>} userInput 使用者輸入的查詢或指令 (can be a string for text, or an array for multimodal content).
 * @param {function} updateChatbotUI 更新聊天介面顯示的回撥函式。
 * @param {object} [externalConfig=null] 可選的外部配置物件，用於覆蓋預設配置載入邏輯。
 * @param {string|Array<object>} [displayUserInput=null] Optional. The content to display in chat history for the user's turn. If null, userInput is used.
 * @param {Array} chatHistory - 聊天曆史陣列的參考
 * @param {object} isChatbotLoadingRef - isChatbotLoading的參考物件 {value: boolean}
 * @param {Function} getCurrentDocId - 獲取當前文件ID的函式
 * @param {Function} getCurrentDocContent - 獲取當前文件內容的函式
 * @param {Function} saveChatHistory - 儲存聊天曆史的函式
 * @param {Function} ensureSemanticGroupsReady - 確保意群準備就緒的函式
 * @returns {Promise<void>} 無明確返回值，主要透過回撥更新 UI 和內部狀態。
 */
async function sendChatbotMessage(userInput, updateChatbotUI, externalConfig = null, displayUserInput = null, chatHistory, isChatbotLoadingRef, getCurrentDocId, getCurrentDocContent, saveChatHistory, ensureSemanticGroupsReady) {
  // 建立中止控制器
  window.chatbotAbortController = new AbortController();

  // 輔助函式需要從外部引入
  const extractTextFromUserContent = window.ApiConfigBuilder ?
    ((userContent) => {
      if (Array.isArray(userContent)) {
        const textPart = userContent.find(part => part.type === 'text');
        return textPart ? textPart.text : '';
      }
      return userContent;
    }) : null;

  const convertOpenAIToGeminiParts = window.ApiConfigBuilder ?
    ((userContent) => {
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
      return [{ text: userContent }];
    }) : null;

  const convertOpenAIToAnthropicContent = window.ApiConfigBuilder ?
    ((userContent) => {
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
      return [{ type: 'text', text: userContent }];
    }) : null;

  const buildCustomApiConfig = window.ApiConfigBuilder?.buildCustomApiConfig;

  // 1. 在函式最開始獲取 docId，並列印
  const docIdForThisMessage = getCurrentDocId();

  if (isChatbotLoadingRef.value) {
    return;
  }
  isChatbotLoadingRef.value = true;

  chatHistory.push({ role: 'user', content: displayUserInput || userInput });

  // 儲存聊天曆史（前端 localStorage / 後端 API）
  await saveChatHistory(docIdForThisMessage, chatHistory);

  // 後端模式：立即儲存使用者訊息
  if (window.ChatHistoryManager && window.ChatHistoryManager.saveSingleMessage) {
    await window.ChatHistoryManager.saveSingleMessage(docIdForThisMessage, {
      role: 'user',
      content: displayUserInput || userInput
    });
  }

  if (typeof updateChatbotUI === 'function') updateChatbotUI();

  // 提取原始純文字輸入（可能帶有控制字首，如 [加入配圖]）
  let rawPlainTextInput = '';
  if (typeof userInput === 'string') {
    rawPlainTextInput = userInput;
  } else if (Array.isArray(userInput)) {
    const textPart = userInput.find(part => part.type === 'text');
    if (textPart) {
      rawPlainTextInput = textPart.text;
    }
  }

  // 識別思維導圖請求（基於原始輸入）
  const isMindMapRequest = rawPlainTextInput.includes('思維導圖') || rawPlainTextInput.includes('腦圖');

  // 識別配圖（draw.io）請求 - 基於字首 [加入配圖]（使用原始輸入做檢測，避免字首被提前剝離）
  let isDrawioPicturesRequest = false;
  if (window.ChatbotPreset && typeof window.ChatbotPreset.isDrawioPicturesRequest === 'function') {
    isDrawioPicturesRequest = window.ChatbotPreset.isDrawioPicturesRequest(rawPlainTextInput);
  } else if (rawPlainTextInput) {
    isDrawioPicturesRequest = rawPlainTextInput.trim().startsWith('[加入配圖]');
  }

  // 構造發給模型看的“乾淨”使用者文字：如果是配圖請求，則去掉字首 [加入配圖]
  let cleanedPlainTextInput = rawPlainTextInput;
  if (isDrawioPicturesRequest && cleanedPlainTextInput) {
    cleanedPlainTextInput = cleanedPlainTextInput.replace(/^\[加入配圖]\s*/, '');
  }
  const config = getChatbotConfig(externalConfig);
  let docContentInfo = getCurrentDocContent();

  // ===== 新增：智慧分段預處理 =====
  // 在首次對話時，檢測是否需要生成意群
  await ensureSemanticGroupsReady(docContentInfo);
  // 重要：生成後重新獲取文件內容以拿到 semanticGroups（避免使用舊的 docContentInfo 快照）
  docContentInfo = getCurrentDocContent();

  // ===== 新增：ReAct模式支援 =====
  // 檢查是否啟用ReAct模式（優先順序高於傳統多輪檢索）
  const useReActMode = !!(window.chatbotActiveOptions && window.chatbotActiveOptions.useReActMode);

  if (useReActMode && window.ReActEngine) {
    console.log('[ChatbotCore] 使用 ReAct 模式');

    // 提前建立助手訊息佔位符
    chatHistory.push({ role: 'assistant', content: '🤔 啟動 ReAct 推理引擎...' });
    const earlyAssistantMsgIndex = chatHistory.length - 1;
    if (typeof updateChatbotUI === 'function') updateChatbotUI();

    // 開始工具呼叫會話
    if (window.ChatbotToolTraceUI?.startSession) {
      window.ChatbotToolTraceUI.startSession();
    }

    try {
      // 建立ReAct引擎例項
      const reactEngine = new window.ReActEngine({
        maxIterations: (window.chatbotActiveOptions.reactMaxIterations) || 5,
        llmConfig: config,
        tokenBudget: {
          totalBudget: 32000,
          systemTokens: 2000,
          historyTokens: 8000,
          contextTokens: 18000,
          responseTokens: 4000
        }
      });

      // 簡化系統提示詞：ReActEngine 會自動注入完整的 ReAct 指令
      // 這裡只需要提供文件上下文資訊
      let reactSystemPrompt = `你正在協助使用者理解文件"${docContentInfo.name || '當前文件'}"。
嚴格按照 ReAct 流程工作，始終以 JSON 格式返回決策。`;

      // 構建對話歷史
      const conversationHistory = chatHistory.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // 執行ReAct迴圈
      let finalAnswer = null;
      let toolCallHtml = '';

      for await (const event of reactEngine.run(
        cleanedPlainTextInput,
        docContentInfo,
        reactSystemPrompt,
        conversationHistory
      )) {
        console.log('[MessageSender] 收到事件:', event.type, event);

        // 1. 捕獲 ReAct 日誌用於新版視覺化
        if (event.reactLog) {
          chatHistory[earlyAssistantMsgIndex].reactLog = event.reactLog;
        }

        // 2. 仍然通知舊版 UI 元件 (保持相容性，防止報錯)，但不使用其生成的 HTML
        if (window.ChatbotToolTraceUI?.handleReActEvent) {
          window.ChatbotToolTraceUI.handleReActEvent(event);
        }

        // 3. 強制重新整理 UI
        if (typeof updateChatbotUI === 'function') {
          updateChatbotUI();
        }

        // 儲存最終答案
        if (event.type === 'final_answer') {
          console.log('[MessageSender] ✓ 收到 final_answer 事件，立即清除 loading 狀態');
          finalAnswer = event.answer;

          // ⚠️ 關鍵：必須先清除 loading 狀態，再更新 UI
          // 因為 updateChatbotUI() 會檢查 isChatbotLoading 來決定是否顯示 typing indicator
          isChatbotLoadingRef.value = false;
          console.log('[MessageSender] ✓ loading 狀態已清除，isChatbotLoadingRef.value =', isChatbotLoadingRef.value);

          // 更新訊息內容並重新整理UI
          chatHistory[earlyAssistantMsgIndex].content = finalAnswer;
          // chatHistory[earlyAssistantMsgIndex].toolCallHtml = toolCallHtml; // 不再使用舊版 HTML
          if (typeof updateChatbotUI === 'function') updateChatbotUI();
          saveChatHistory(getCurrentDocId(), chatHistory);

          return; // 立即返回，終止迴圈
        }
      }

      // 備份：如果迴圈正常結束但沒有final_answer（不應該發生）
      if (finalAnswer) {
        chatHistory[earlyAssistantMsgIndex].content = finalAnswer;
        chatHistory[earlyAssistantMsgIndex].toolCallHtml = toolCallHtml;
        if (typeof updateChatbotUI === 'function') updateChatbotUI();
        saveChatHistory(getCurrentDocId(), chatHistory);
        isChatbotLoadingRef.value = false;
        return; // 完成，直接返回
      } else {
        // 沒有得到答案，降級到傳統模式
        console.warn('[ChatbotCore] ReAct模式未能產生答案，降級到傳統模式');
        chatHistory.splice(earlyAssistantMsgIndex, 1); // 移除佔位訊息
      }

    } catch (error) {
      console.error('[ChatbotCore] ReAct模式執行失敗:', error);
      chatHistory[earlyAssistantMsgIndex].content = `ReAct模式執行失敗: ${error.message}`;
      if (typeof updateChatbotUI === 'function') updateChatbotUI();
      saveChatHistory(getCurrentDocId(), chatHistory);
      isChatbotLoadingRef.value = false;
      return;
    }
  }

  // 如果啟用多輪取材，先讓模型選擇意群並附加上下文
  try {
    const multiHop = !!(window.chatbotActiveOptions && window.chatbotActiveOptions.multiHopRetrieval);
    // 智慧檢索開啟時，自動啟用智慧分段和流式顯示
    const segmented = multiHop ? true : ((window.chatbotActiveOptions && window.chatbotActiveOptions.contentLengthStrategy) === 'segmented');

    // 計算文件長度（與ensureSemanticGroupsReady保持一致）
    const translationText = docContentInfo.translation || '';
    const ocrText = docContentInfo.ocr || '';
    const chunkCandidates = [];
    if (Array.isArray(docContentInfo.translatedChunks)) {
      chunkCandidates.push(...docContentInfo.translatedChunks);
    }
    if (Array.isArray(docContentInfo.ocrChunks)) {
      chunkCandidates.push(...docContentInfo.ocrChunks);
    }
    let contentLength = Math.max(translationText.length, ocrText.length);
    if (contentLength < 50000 && chunkCandidates.length > 0) {
      const chunkLength = chunkCandidates.reduce((sum, chunk) => sum + (typeof chunk === 'string' ? chunk.length : 0), 0);
      contentLength = Math.max(contentLength, chunkLength);
    }
    const longDoc = contentLength >= 50000;

    console.log(`[ChatbotCore] 多輪檢索條件檢查: multiHop=${multiHop}, segmented=${segmented}, longDoc=${longDoc} (contentLength=${contentLength}), hasGroups=${Array.isArray(docContentInfo.semanticGroups) && docContentInfo.semanticGroups.length > 0}`);

    // 智慧檢索開啟時，自動啟用流式顯示
    const useStreaming = multiHop ? true : ((window.chatbotActiveOptions && typeof window.chatbotActiveOptions.streamingRetrieval === 'boolean') ? window.chatbotActiveOptions.streamingRetrieval : true);

    // 多輪檢索條件：啟用了多輪檢索 && 文件足夠長
    // 注意：即使沒有意群資料，仍然可以使用grep工具進行多輪檢索
    if (multiHop && longDoc) {
      const userSet = window.semanticGroupsSettings || {};

      // 使用流式多輪取材（如果啟用）
      if (useStreaming && typeof window.streamingMultiHopRetrieve === 'function') {
        console.log('[ChatbotCore] 使用流式多輪取材');

        // 提前建立助手訊息佔位符
        chatHistory.push({ role: 'assistant', content: '正在檢索相關內容...' });
        const earlyAssistantMsgIndex = chatHistory.length - 1;
        if (typeof updateChatbotUI === 'function') updateChatbotUI();

        // 開始新的工具呼叫會話
        if (window.ChatbotToolTraceUI?.startSession) {
          window.ChatbotToolTraceUI.startSession();
        }

        const stream = window.streamingMultiHopRetrieve(cleanedPlainTextInput, docContentInfo, config, { maxRounds: userSet.maxRounds || 3 });

        let selection = null;
        for await (const event of stream) {
          // 實時更新UI
          if (window.ChatbotToolTraceUI?.handleStreamEvent) {
            window.ChatbotToolTraceUI.handleStreamEvent(event);

            // 每次事件後實時更新HTML到訊息物件
            if (window.ChatbotToolTraceUI?.generateBlockHtml) {
              const toolCallHtml = window.ChatbotToolTraceUI.generateBlockHtml();
              // 僅在有內容時覆蓋佔位文字，避免空串刷屏
              if (toolCallHtml && toolCallHtml.length > 0) {
                chatHistory[earlyAssistantMsgIndex].toolCallHtml = toolCallHtml;
                chatHistory[earlyAssistantMsgIndex].content = '';
                if (typeof updateChatbotUI === 'function') {
                  updateChatbotUI();
                }
              }
            }
          }

          // 儲存最終結果
          if (event.type === 'complete' || (event.type === 'fallback' && event.context)) {
            selection = event.type === 'complete'
              ? { context: event.context, groups: event.summary.groups, detail: event.summary.detail }
              : event;
          }
        }

        if (selection && selection.context) {
          docContentInfo = Object.assign({}, docContentInfo, {
            selectedGroupContext: selection.context,
            selectedGroupsMeta: selection
          });
          console.log('[ChatbotCore] 流式多輪取材完成，組數', (selection.detail||selection.groups||[]).length);
        }

        // 標記這個訊息索引，後續使用
        window._earlyAssistantMsgIndex = earlyAssistantMsgIndex;
      }
    }
  } catch (e) {
    console.warn('[ChatbotCore] 多輪取材選擇失敗：', e);
  }

  // 使用新的 PromptConstructor 來構建 systemPrompt
  let systemPrompt = '';
  if (window.PromptConstructor && typeof window.PromptConstructor.buildSystemPrompt === 'function') {
    // 注意：這裡傳入原始 plainTextInput，以便 PromptConstructor 能看到控制字首（如 [加入配圖]），正確注入對應提示詞
    systemPrompt = window.PromptConstructor.buildSystemPrompt(docContentInfo, isMindMapRequest, rawPlainTextInput);
  } else {
    // Fallback or error handling if PromptConstructor is not available
    console.error("PromptConstructor.buildSystemPrompt is not available. Using basic prompt.");
    systemPrompt = `你現在是 PDF 文件智慧助手，使用者正在檢視文件\"${docContentInfo.name || '當前文件'}\"。`;
    if (docContentInfo.translation || docContentInfo.ocr) {
      systemPrompt += `\n\n文件內容：\n${(docContentInfo.translation || docContentInfo.ocr || '').slice(0, 50000)}`;
    }
  }

  let conversationHistory = []; // Initialize as empty
  // Check the global option for using context. Default to true if the option or its parent is not defined.
  if (window.chatbotActiveOptions && typeof window.chatbotActiveOptions.useContext === 'boolean' && window.chatbotActiveOptions.useContext === false) {
    // If useContext is explicitly false, conversationHistory remains empty (no context).
  } else {
    // Default behavior or if useContext is true: use chat history.
    conversationHistory = chatHistory.slice(0, -1).map(msg => ({
      role: msg.role,
      content: msg.content // This content can be rich (text or array of parts)
    }));
  }

  const apiKey = config.apiKey;

  if (!apiKey) {
    chatHistory.push({ role: 'assistant', content: '未檢測到有效的 API Key，請先在主頁面配置。' });
    isChatbotLoadingRef.value = false;
    if (typeof updateChatbotUI === 'function') updateChatbotUI();
    return;
  }

  // 構建 API 請求引數
  let apiConfig;
  let useStreamApi = true; // 預設使用流式API

  // 修正：支援 custom_source_xxx 也走自定義分支
  if (
    config.model === 'custom' ||
    (typeof config.model === 'string' && config.model.startsWith('custom_source_'))
  ) {
    // Chatbot 獨立配置：優先使用 Chatbot 配置，可回退到翻譯模型配置（單向隔離）
    let selectedModelId = '';
    try {
      // 1. 【最高優先順序】Chatbot 專用配置的模型ID（cms.modelId）
      if (config.cms && config.cms.modelId) {
        selectedModelId = config.cms.modelId;
        console.log('[Chatbot] ✓ 使用 Chatbot 獨立配置:', selectedModelId);
      }
      // 2. 【回退】翻譯模型配置（僅讀取，Chatbot 儲存時不會修改翻譯配置）
      if (!selectedModelId && config.settings && config.settings.selectedCustomModelId) {
        selectedModelId = config.settings.selectedCustomModelId;
        console.log('[Chatbot] ↩ 回退到翻譯模型配置:', selectedModelId);
      }
      // 3. 【進一步回退】可用模型列表的第一個
      if (!selectedModelId && Array.isArray(config.siteSpecificAvailableModels) && config.siteSpecificAvailableModels.length > 0) {
        selectedModelId = typeof config.siteSpecificAvailableModels[0] === 'object'
          ? config.siteSpecificAvailableModels[0].id
          : config.siteSpecificAvailableModels[0];
        console.log('[Chatbot] ↩ 使用可用模型列表的第一個:', selectedModelId);
      }
    } catch (e) {
      console.error('[Chatbot] ✗ 獲取模型ID失敗:', e);
    }
    // 新增：如果還是沒有模型ID，彈出模型選擇介面並阻止對話
    if (!selectedModelId) {
      if (typeof window.showModelSelectorForChatbot === 'function') {
        window.showModelSelectorForChatbot();
      }
      chatHistory.push({ role: 'assistant', content: '請先選擇一個可用模型後再進行對話。' });
      isChatbotLoadingRef.value = false;
      if (typeof updateChatbotUI === 'function') updateChatbotUI();
      return;
    }
    apiConfig = buildCustomApiConfig(
      apiKey,
      config.cms.apiEndpoint || config.cms.apiBaseUrl,
      selectedModelId,
      config.cms.requestFormat,
      config.cms.temperature,
      config.cms.max_tokens,
      {
        endpointMode: (config.cms && config.cms.endpointMode) || 'auto'
      }
    );
    useStreamApi = apiConfig.streamSupport && apiConfig.streamBodyBuilder;
    console.log('最終模型ID:', selectedModelId);
  } else {
    const predefinedConfigs = {
      'mistral': {
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        modelName: 'mistral-large-latest',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: 'mistral-large-latest',
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          stream: true
        }),
        streamHandler: true,
        responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'deepseek': {
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        modelName: 'deepseek-chat',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          stream: true
        }),
        streamHandler: true,
        responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'volcano': {
        endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        modelName: '火山引擎',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: (function(){ try{ const cfg = loadModelConfig && loadModelConfig('volcano'); if (cfg && (cfg.preferredModelId||cfg.modelId)) return cfg.preferredModelId||cfg.modelId; }catch(e){} return 'doubao-1-5-pro-32k-250115'; })(),
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          temperature: 0.5, max_tokens: 8192, stream: true
        }),
        streamHandler: true, responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'tongyi': {
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        modelName: '阿里雲通義百鍊',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: (function(){ try{ const cfg = loadModelConfig && loadModelConfig('tongyi'); if (cfg && (cfg.preferredModelId||cfg.modelId)) return cfg.preferredModelId||cfg.modelId; }catch(e){} return 'qwen-turbo-latest'; })(),
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          temperature: 0.5, max_tokens: 8192, stream: true
        }),
        streamHandler: true, responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'claude': {
        endpoint: 'https://api.anthropic.com/v1/messages',
        modelName: 'claude-3-sonnet-20240229',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        bodyBuilder: (sys, msgs, user_content) => {
          return {
            model: apiConfig.modelName || 'claude-3-sonnet-20240229',
            system: sys,
            messages: msgs.length ?
              [...msgs.map(m => ({role: m.role, content: convertOpenAIToAnthropicContent(m.content)})),
               { role: 'user', content: convertOpenAIToAnthropicContent(user_content) }] :
              [{ role: 'user', content: convertOpenAIToAnthropicContent(user_content) }],
            max_tokens: 2048,
            stream: true
          };
        },
        streamHandler: 'claude',
        responseExtractor: (data) => data?.content?.[0]?.text
      },
      'gemini': {
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        streamEndpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${apiKey}&alt=sse`,
        modelName: 'gemini-pro',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, msgs, user_content) => {
          const geminiMessages = [];
          if (msgs.length) {
            for (const msg of msgs) {
              geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: convertOpenAIToGeminiParts(msg.content) });
            }
          }
          geminiMessages.push({ role: 'user', parts: convertOpenAIToGeminiParts(user_content) });
          return {
            contents: geminiMessages,
            generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
            ...(sys && { systemInstruction: { parts: [{ text: sys }] }})
          };
        },
        streamHandler: 'gemini',
        responseExtractor: (data) => {
          if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            return parts && parts.length > 0 ? parts.map(p=>p.text).join('') : '';
          }
          return '';
        }
      },
      'gemini-preview': {
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        streamEndpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${apiKey}&alt=sse`,
        modelName: 'gemini-1.5-flash-latest',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, msgs, user_content) => {
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
              temperature: 0.5, maxOutputTokens: 2048,
              responseModalities: ["TEXT"], responseMimeType: "text/plain"
            },
            ...(sys && { systemInstruction: { parts: [{ text: sys }] }})
          };
        },
        streamHandler: 'gemini',
        responseExtractor: (data) => {
          if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            return parts && parts.length > 0 ? parts.map(p=>p.text).join('') : '';
          }
          return '';
        }
      }
    };
    apiConfig = predefinedConfigs[config.model] || predefinedConfigs['mistral'];

    // Special handling for API keys for certain predefined models
    if (config.model === 'mistral') {
      apiConfig.headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (config.model === 'claude') {
       apiConfig.headers['x-api-key'] = apiKey;
       if (config.cms && config.cms.modelId) {
           apiConfig.modelName = config.cms.modelId;
       }
    } else if (config.model.startsWith('gemini')) {
        let geminiModelId = 'gemini-pro';
        if (config.model === 'gemini-preview') geminiModelId = 'gemini-1.5-flash-latest';

        if (config.settings && config.settings.selectedCustomModelId &&
            (config.model === 'gemini' || config.model === 'gemini-preview' || (config.cms && config.cms.requestFormat && config.cms.requestFormat.startsWith('gemini')) )
           ) {
           geminiModelId = config.settings.selectedCustomModelId;
        } else if (config.cms && config.cms.modelId && (config.cms.requestFormat && config.cms.requestFormat.startsWith('gemini'))) {
            geminiModelId = config.cms.modelId;
        } else {
            try {
              if (typeof loadModelConfig === 'function') {
                const gcfg = loadModelConfig('gemini');
                if (gcfg && (gcfg.preferredModelId || gcfg.modelId)) {
                  geminiModelId = gcfg.preferredModelId || gcfg.modelId;
                }
              }
            } catch (e) { /* ignore */ }
        }

        apiConfig.modelName = geminiModelId;
        const modelPath = geminiModelId.startsWith('models/') ? geminiModelId.substring(7) : geminiModelId;
        apiConfig.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent?key=${apiKey}`;
        apiConfig.streamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:streamGenerateContent?key=${apiKey}&alt=sse`;
    }
  }

  const formattedHistory = conversationHistory;

  // 檢查是否已經提前建立了助手訊息（在工具呼叫時）
  let assistantMsgIndex = window._earlyAssistantMsgIndex;

  if (assistantMsgIndex !== undefined && assistantMsgIndex >= 0 && chatHistory[assistantMsgIndex]) {
    // 使用已建立的訊息
    console.log('[ChatbotCore] 使用已建立的助手訊息，索引:', assistantMsgIndex);
    window._earlyAssistantMsgIndex = undefined; // 清除標記
  } else {
    // 正常建立助手訊息
    chatHistory.push({ role: 'assistant', content: '' });
    assistantMsgIndex = chatHistory.length - 1;
  }

  try {
    if (typeof updateChatbotUI === 'function') updateChatbotUI();
    if (useStreamApi) {
      const requestBody = apiConfig.streamBodyBuilder
        ? apiConfig.streamBodyBuilder(systemPrompt, formattedHistory, userInput)
        : apiConfig.bodyBuilder(systemPrompt, formattedHistory, userInput);
      let collectedContent = '';

      // 為 Gemini 使用特定的流式端點（如果有）
      const requestEndpoint = ((config.model === 'gemini' || config.model === 'gemini-preview' ||
                              (apiConfig.streamHandler === 'gemini'))
                             && apiConfig.streamEndpoint) ? apiConfig.streamEndpoint : apiConfig.endpoint;

      const response = await fetch(requestEndpoint, {
        method: 'POST',
        headers: apiConfig.headers,
        body: JSON.stringify(requestBody),
        signal: window.chatbotAbortController?.signal
      });
      if (!response.ok) {
        if (response.status === 400 || response.status === 404 || response.status === 501) {
          throw new Error("stream_not_supported");
        } else {
          const errText = await response.text();
          throw new Error(`API 錯誤 (${response.status}): ${errText}`);
        }
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let parseChunk;
      if (apiConfig.streamHandler === 'claude') {
        parseChunk = (chunk) => {
          try {
            if (!chunk.trim()) return '';
            if (chunk.includes('"type":"content_block_delta"')) {
              const data = JSON.parse(chunk.replace(/^data: /, ''));
              return data.delta?.text || '';
            }
            return '';
          } catch (e) {
            return '';
          }
        };
      } else if (apiConfig.streamHandler === 'gemini') {
        parseChunk = (chunk) => {
          try {
            if (!chunk.trim()) return '';

            let data;
            try {
              data = JSON.parse(chunk);
            } catch (e) {
              if (chunk.startsWith('data: ')) {
                try {
                  data = JSON.parse(chunk.substring(6));
                } catch (e2) {
                  return '';
                }
              } else {
                return '';
              }
            }

            if (data.candidates && data.candidates.length > 0) {
              const candidate = data.candidates[0];

              if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                return candidate.content.parts[0].text || '';
              }

              if (candidate.delta && candidate.delta.textDelta) {
                return candidate.delta.textDelta || '';
              }

              if (candidate.parts && candidate.parts.length > 0) {
                return candidate.parts[0].text || '';
              }
            }

            return '';
          } catch (e) {
            console.log("Gemini 解析錯誤:", e);
            return '';
          }
        };
      } else {
        parseChunk = (chunk) => {
          try {
            if (!chunk.trim() || !chunk.startsWith('data:')) return { content: '', reasoning: '' };
            const data = JSON.parse(chunk.replace(/^data: /, ''));
            const delta = data.choices?.[0]?.delta || {};
            return {
              content: delta.content || '',
              reasoning: delta.reasoning_content || ''
            };
          } catch (e) {
            if (!chunk.includes('[DONE]') && chunk.trim() && !chunk.trim().startsWith(':')) {
              //console.warn("解析流式回覆塊錯誤:", chunk, e);
            }
            return { content: '', reasoning: '' };
          }
        };
      }
      let lastUpdateTime = Date.now();
      // Phase 3.5 超級降頻: 大幅降低更新頻率 + 智慧跳幀（使用統一配置）
      const intervals = window.PerformanceConfig?.UPDATE_INTERVALS || {
        FOREGROUND: 800,
        BACKGROUND: 3000
      };
      const BASE_UPDATE_INTERVAL = intervals.FOREGROUND;
      const BACKGROUND_UPDATE_INTERVAL = intervals.BACKGROUND;

      // Phase 3.5 智慧跳幀: 監測渲染效能（使用統一配置）
      const perfConfig = window.PerformanceConfig?.ADAPTIVE_RENDER || {
        HEAVY_THRESHOLD: 200,
        MIN_MULTIPLIER: 1,
        MAX_MULTIPLIER: 4,
        DECAY_THRESHOLD: 100
      };

      // 使用全域狀態管理，避免變數作用域問題
      if (!window.ChatbotRenderState) {
        window.ChatbotRenderState = { adaptiveMultiplier: 1, lastRenderDuration: 0 };
      }

      const getUpdateInterval = () => {
        const baseInterval = (typeof document !== 'undefined' && document.hidden)
          ? BACKGROUND_UPDATE_INTERVAL
          : BASE_UPDATE_INTERVAL;

        // 智慧跳幀: 使用衰減機制而非立即重置
        const lastDuration = window.ChatbotRenderState.lastRenderDuration;

        if (lastDuration > perfConfig.HEAVY_THRESHOLD) {
          // 渲染慢：逐步增加倍數（最多到 MAX_MULTIPLIER）；僅在倍數實際變化時輸出日誌
          const oldMultiplier = window.ChatbotRenderState.adaptiveMultiplier;
          const nextMultiplier = Math.min(
            perfConfig.MAX_MULTIPLIER,
            oldMultiplier * 2
          );
          window.ChatbotRenderState.adaptiveMultiplier = nextMultiplier;

          if (nextMultiplier !== oldMultiplier && window.PerfLogger) {
            window.PerfLogger.warn(
              `跳幀: 檢測到重渲染(${lastDuration.toFixed(0)}ms)，降頻×${window.ChatbotRenderState.adaptiveMultiplier}`
            );
          }
        } else if (lastDuration < perfConfig.DECAY_THRESHOLD && lastDuration > 0) {
          // 渲染快：逐步恢復倍數（最少到 MIN_MULTIPLIER）
          const oldMultiplier = window.ChatbotRenderState.adaptiveMultiplier;
          window.ChatbotRenderState.adaptiveMultiplier = Math.max(
            perfConfig.MIN_MULTIPLIER,
            window.ChatbotRenderState.adaptiveMultiplier / 2
          );
          if (oldMultiplier !== window.ChatbotRenderState.adaptiveMultiplier && window.PerfLogger) {
            window.PerfLogger.debug(
              `跳幀: 渲染恢復(${lastDuration.toFixed(0)}ms)，降頻×${window.ChatbotRenderState.adaptiveMultiplier}`
            );
          }
        }

        return baseInterval * window.ChatbotRenderState.adaptiveMultiplier;
      };

      let collectedReasoning = '';
      let debounceTimer = null;  // Phase 3 最佳化: 防抖計時器，避免流式結束時的多次渲染
      let isCollectingDrawioXml = false; // 標誌位：是否正在收集 draw.io XML（避免顯示原始 XML）

      // Phase 3.5 效能監控版 debouncedUpdateUI（使用統一配置）
      const debounceDelay = window.PerformanceConfig?.UPDATE_INTERVALS?.DEBOUNCE || 150;
      const debouncedUpdateUI = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const renderStart = performance.now();
          if (typeof updateChatbotUI === 'function') updateChatbotUI();
          const renderEnd = performance.now();
          window.ChatbotRenderState.lastRenderDuration = renderEnd - renderStart;

          // 使用統一的效能日誌工具
          if (window.PerfLogger) {
            window.PerfLogger.perf('渲染耗時', window.ChatbotRenderState.lastRenderDuration);
          }
        }, debounceDelay);
      };

      // 輸出智慧降頻狀態
      const initialInterval = getUpdateInterval();
      if (window.PerfLogger) {
        window.PerfLogger.info(
          `超級降頻: 流式更新間隔 ${initialInterval}ms (${document.hidden ? '後臺分頁' : '前臺分頁'})`
        );
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            const parsed = parseChunk(line);
            if (typeof parsed === 'string') {
              if (parsed) {
                collectedContent += parsed;

                // 🔥 實時攔截 draw.io XML 輸出
                // 如果是配圖請求，且檢測到 XML 內容，立即替換為友好提示
                if (isDrawioPicturesRequest && !isCollectingDrawioXml) {
                  // 檢測是否包含 XML 特徵
                  const hasXmlContent = collectedContent.includes('<?xml') ||
                                       collectedContent.includes('<mxfile') ||
                                       collectedContent.includes('<mxGraphModel');

                  if (hasXmlContent) {
                    // 立即替換為友好提示，避免使用者看到大量 XML 程式碼
                    isCollectingDrawioXml = true;
                    chatHistory[assistantMsgIndex].content = '⏳ 正在生成配圖，請稍候...';
                    debouncedUpdateUI();
                    console.log('[Draw.io] 檢測到 XML 輸出，已隱藏原始內容');
                  }
                }

                // 如果正在收集 draw.io XML，跳過常規的 UI 更新
                if (isCollectingDrawioXml) {
                  continue;
                }

                const now = Date.now();
                const currentInterval = getUpdateInterval();  // Phase 3.5: 智慧跳幀
                if (now - lastUpdateTime > currentInterval) {
                  chatHistory[assistantMsgIndex].content = collectedContent;
                  debouncedUpdateUI();  // Phase 3.5: 效能監控版
                  lastUpdateTime = now;
                }
              }
            } else if (parsed && (parsed.content || parsed.reasoning)) {
              if (parsed.reasoning) {
                collectedReasoning += parsed.reasoning;
                chatHistory[assistantMsgIndex].reasoningContent = collectedReasoning;
              }
              if (parsed.content) {
                collectedContent += parsed.content;
                chatHistory[assistantMsgIndex].content = collectedContent;
              }
              const now = Date.now();
              const currentInterval = getUpdateInterval();  // Phase 3.5: 智慧跳幀
              if (now - lastUpdateTime > currentInterval) {
                debouncedUpdateUI();  // Phase 3.5: 效能監控版
                lastUpdateTime = now;
              }
            }
          }
        }
      } catch (streamError) {
        //console.warn("流式讀取錯誤:", streamError);
      }
      chatHistory[assistantMsgIndex].content = collectedContent || '流式回覆處理出錯，請重試';
      if (collectedReasoning) chatHistory[assistantMsgIndex].reasoningContent = collectedReasoning;
    } else {
      // fallback 到非流式分支
      console.log('[非流式] 呼叫 bodyBuilder');
      // 將使用者輸入中的文字部分替換為清洗後的 plain text（去掉控制字首）
      let userInputForApi = userInput;
      if (Array.isArray(userInputForApi)) {
        userInputForApi = userInputForApi.map(part => {
          if (part.type === 'text' && typeof cleanedPlainTextInput === 'string') {
            return Object.assign({}, part, { text: cleanedPlainTextInput });
          }
          return part;
        });
      } else if (typeof userInputForApi === 'string' && typeof cleanedPlainTextInput === 'string') {
        userInputForApi = cleanedPlainTextInput;
      }

      const requestBody = apiConfig.bodyBuilder(systemPrompt, userInputForApi);
      console.log('API Endpoint:', apiConfig.endpoint);
      console.log('Headers:', apiConfig.headers);
      const response = await fetch(apiConfig.endpoint, {
        method: 'POST',
        headers: apiConfig.headers,
        body: JSON.stringify(requestBody),
        signal: window.chatbotAbortController?.signal
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 錯誤 (${response.status}): ${errText}`);
      }
      const data = await response.json();
      const answer = apiConfig.responseExtractor(data);
      console.log("[sendChatbotMessage] Raw AI response (non-streamed):", answer);
      if (!answer) {
        throw new Error("API 響應解析失敗，未能提取回復內容");
      }
      chatHistory[assistantMsgIndex].content = answer;
    }
    // 收集完內容後處理思維導圖
    if (isMindMapRequest && chatHistory[assistantMsgIndex].content) {
      try {
        const assistantResponseContent = chatHistory[assistantMsgIndex].content;
        console.log("[sendChatbotMessage] Mind Map: assistantResponseContent (before processing):", assistantResponseContent);

        let mindMapMarkdown = assistantResponseContent;
        const codeBlockMatch = assistantResponseContent.match(/```(?:markdown)?\s*([\s\S]+?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          mindMapMarkdown = codeBlockMatch[1].trim();
        }
        console.log("[sendChatbotMessage] Mind Map: mindMapMarkdown after extraction:", mindMapMarkdown);

        const originalContent = assistantResponseContent;
        let displayContent = originalContent;
        if (displayContent.length > 800) {
          const firstHeadingMatch = displayContent.match(/\n#+\s+.+/);
          if (firstHeadingMatch && firstHeadingMatch.index > 0) {
            const beforeHeading = displayContent.substring(0, firstHeadingMatch.index).trim();
            if (beforeHeading.length > 300) {
              displayContent = '以下是文件的思維導圖結構:\n\n' + displayContent.substring(firstHeadingMatch.index).trim();
            }
          }
        }
        let safeMindMapMarkdown = mindMapMarkdown;
        if (!safeMindMapMarkdown.trim() || !/^#/.test(safeMindMapMarkdown.trim()) || !/\n##?\s+/.test(safeMindMapMarkdown)) {
          safeMindMapMarkdown = '# 思維導圖\n\n暫無結構化內容';
          console.log("[sendChatbotMessage] Mind Map: Content defaulted to '暫無結構化內容'. Original mindMapMarkdown was:", mindMapMarkdown);
        }
        console.log('儲存到localStorage的思維導圖內容:', safeMindMapMarkdown);
        window.localStorage.setItem('mindmapData_' + docIdForThisMessage, safeMindMapMarkdown);
        chatHistory[assistantMsgIndex].content =
          `<div style="position:relative;">
            <div id="mindmap-container" style="width:100%;height:400px;margin-top:20px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;overflow:auto;filter:blur(2.5px);transition:filter 0.3s;"></div>
            <div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:2;">
              <button onclick="window.open((window.location.pathname.endsWith('/history_detail.html') ? '../mindmap/mindmap.html' : 'views/mindmap/mindmap.html') + '?docId=${encodeURIComponent(docIdForThisMessage)}','_blank')" style="padding:12px 28px;font-size:18px;background:rgba(59,130,246,0.92);color:#fff;border:none;border-radius:8px;box-shadow:0 2px 8px rgba(59,130,246,0.12);cursor:pointer;">放大檢視/編輯思維導圖</button>
            </div>
          </div>`;
        chatHistory[assistantMsgIndex].hasMindMap = true;
        chatHistory[assistantMsgIndex].mindMapData = safeMindMapMarkdown;
      } catch (error) {
        chatHistory[assistantMsgIndex].content +=
          '\n\n<div style="color:#e53e3e;background:#fee;padding:12px;border-radius:6px;margin-top:16px;">思維導圖資料處理失敗: ' + error.message + '</div>';
      }
    }

    // 收集完內容後處理配圖（draw.io XML）
    if (isDrawioPicturesRequest && chatHistory[assistantMsgIndex].content) {
      try {
        const assistantResponseContent = chatHistory[assistantMsgIndex].content || '';

        // 標誌：XML 是否已經過版面最佳化（來自 DrawioLite）
        let isAlreadyOptimized = false;

        // 提取並修復 XML 內容（直接從響應中提取標準 XML）
        const extractAndFixDrawioXml = (raw) => {
          let text = raw || '';

          // 優先檢測 DrawioLite DSL 並轉換
          if (window.DrawioLitePrompt && window.DrawioLitePrompt.isDrawioLiteDSL(text)) {
            console.log('[Draw.io] 檢測到 DrawioLite DSL，開始轉換...');
            try {
              if (window.DrawioLiteParser && window.DrawioLiteParser.convertDrawioLite) {
                text = window.DrawioLiteParser.convertDrawioLite(text);
                isAlreadyOptimized = true;  // 標記為已最佳化
                console.log('[Draw.io] ✅ DrawioLite → XML 轉換成功（已包含版面最佳化，跳過後續最佳化）');
                return text; // DSL已在parser中最佳化，直接返回，避免重複最佳化
              } else {
                console.error('[Draw.io] ❌ DrawioLite Parser 未載入');
              }
            } catch (error) {
              console.error('[Draw.io] ❌ DrawioLite 轉換失敗:', error);
              // 轉換失敗，繼續嘗試 XML 提取
            }
          }

          // 清理文字：移除 Markdown 程式碼塊標記（如果 AI 違規使用了）
          text = text.replace(/```xml\s*/gi, '').replace(/```\s*/g, '');

          // 1) 嘗試提取 <mxfile> ... </mxfile>
          let start = text.search(/<mxfile\b/i);
          let end = text.search(/<\/mxfile>/i);
          if (start !== -1 && end !== -1 && end > start) {
            text = text.slice(start, end + '</mxfile>'.length).trim();
          } else {
            // 2) 嘗試提取 <mxGraphModel> ... </mxGraphModel>，並自動包裹為完整 mxfile
            start = text.search(/<mxGraphModel\b/i);
            end = text.search(/<\/mxGraphModel>/i);
            if (start !== -1 && end !== -1 && end > start) {
              const inner = text.slice(start, end + '</mxGraphModel>'.length).trim();
              text = `<mxfile><diagram name="diagram">${inner}</diagram></mxfile>`;
            } else {
              throw new Error('未檢測到有效的 <mxfile> 或 <mxGraphModel> 片段');
            }
          }

          // 如果沒有 XML 宣告，自動新增
          if (!text.trim().startsWith('<?xml')) {
            text = '<?xml version="1.0" encoding="UTF-8"?>\n' + text;
          }

          return text;
        };

        // XML 清理函式：修復常見的 XML 格式問題
        const cleanDrawioXml = (xmlString) => {
          let cleaned = xmlString;

          // 步驟 1: 移除 XML 宣告前的空白字元
          cleaned = cleaned.trim();

          // 步驟 2: 確保有 XML 宣告（有助於正確解析）
          if (!cleaned.startsWith('<?xml')) {
            cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned;
          }

          // 步驟 3: 修復屬性值中的換行字元和製表符（最常見的問題）
          // 使用 /gs 標誌支援多行比對
          cleaned = cleaned.replace(/(\w+)=["']([^"']*?)["']/gs, (match, attrName, attrValue) => {
            let fixedValue = attrValue
              .replace(/[\r\n\t]+/g, ' ')           // 換行和製表符 → 空格
              .replace(/\s{2,}/g, ' ')              // 多個空格 → 單個空格
              .trim();                               // 去除首尾空格

            // 轉義屬性值中的特殊字元
            fixedValue = fixedValue
              .replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;')  // & → &amp;
              .replace(/</g, '&lt;')                               // < → &lt;
              .replace(/>/g, '&gt;');                              // > → &gt;

            // 檢查屬性值中是否有未轉義的引號
            if (fixedValue.includes('"')) {
              fixedValue = fixedValue.replace(/"/g, '&quot;');
              return `${attrName}='${fixedValue}'`;  // 使用單引號包裹
            }

            return `${attrName}="${fixedValue}"`;
          });

          // 步驟 4: 修復非法的屬性名（移除屬性名中的非法字元）
          cleaned = cleaned.replace(/([^\s<>="']+)\s*=\s*["']/g, (match, attrName) => {
            // 只保留字母、數字、連字元、下劃線、冒號（XML 名稱空間）
            const fixedAttrName = attrName.replace(/[^\w:.-]/g, '');
            if (!fixedAttrName) return ''; // 如果屬性名被完全移除，刪除整個屬性
            const quoteChar = match.slice(-1); // 保留原始引號
            return `${fixedAttrName}=${quoteChar}`;
          });

          // 步驟 5: 移除註釋中的雙連字元（-- 在註釋中是非法的）
          cleaned = cleaned.replace(/<!--([\s\S]*?)-->/g, (match, content) => {
            const fixedContent = content.replace(/--/g, '- -');
            return `<!--${fixedContent}-->`;
          });

          // 步驟 6: 修復自閉合標籤格式
          cleaned = cleaned.replace(/<(\w+)([^>]*?)\/>/g, (match, tagName, attrs) => {
            // 確保 /> 前有空格
            return `<${tagName}${attrs.trimEnd()} />`;
          });

          return cleaned;
        };

        // XML 驗證函式：檢查 XML 是否可以被解析
        const validateDrawioXml = (xmlString) => {
          try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            // 檢查解析錯誤
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
              const errorText = parserError.textContent || parserError.innerText || '';
              throw new Error(`XML 解析錯誤: ${errorText.substring(0, 200)}`);
            }

            // 檢查必要的元素
            const mxfile = xmlDoc.querySelector('mxfile');
            if (!mxfile) {
              throw new Error('缺少 <mxfile> 根元素');
            }

            const diagram = mxfile.querySelector('diagram');
            if (!diagram) {
              throw new Error('缺少 <diagram> 元素');
            }

            return true;
          } catch (error) {
            throw new Error(`XML 驗證失敗: ${error.message}`);
          }
        };

        // 提取原始 XML
        let xml = extractAndFixDrawioXml(assistantResponseContent);

        // 多輪修復策略：嘗試不同的修復方法
        const repairStrategies = [
          // 策略 1: 標準清理（處理換行、轉義等）
          (xmlStr) => cleanDrawioXml(xmlStr),

          // 策略 2: 激進清理（移除所有屬性中的問題字元）
          (xmlStr) => {
            let fixed = cleanDrawioXml(xmlStr);
            // 移除屬性值中的所有控制字元
            fixed = fixed.replace(/(\w+)=["']([^"']*?)["']/gs, (match, attrName, attrValue) => {
              const cleanValue = attrValue
                .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')  // 移除控制字元
                .replace(/\s+/g, ' ')                    // 合併空格
                .trim();
              return `${attrName}="${cleanValue}"`;
            });
            return fixed;
          },

          // 策略 3: 最小化修復（只處理關鍵問題）
          (xmlStr) => {
            let fixed = xmlStr.trim();
            // 只修復最關鍵的問題：換行字元
            fixed = fixed.replace(/(\w+)=["']([^"']*?)["']/gs, (match, attrName, attrValue) => {
              const cleanValue = attrValue.replace(/[\r\n]+/g, ' ').trim();
              return `${attrName}="${cleanValue}"`;
            });
            return fixed;
          },

          // 策略 4: 結構修復（補全缺失的結束標籤）
          (xmlStr) => {
            let fixed = cleanDrawioXml(xmlStr);

            // 檢測並補全缺失的結束標籤（常見錯誤：AI 忘記關閉結構標籤）
            const requiredEndTags = [
              { start: '<root>', end: '</root>' },
              { start: '<mxGraphModel', end: '</mxGraphModel>' },
              { start: '<diagram', end: '</diagram>' },
              { start: '<mxfile', end: '</mxfile>' }
            ];

            for (const { start, end } of requiredEndTags) {
              // 如果有開始標籤但缺少結束標籤
              if (fixed.includes(start) && !fixed.includes(end)) {
                console.log(`[Draw.io] 檢測到缺失的結束標籤: ${end}，嘗試自動補全`);
                fixed = fixed + '\n' + end;
              }
            }

            return fixed;
          },

          // 策略 5: 屬性錯誤修復（專門處理 attributes construct error）
          (xmlStr) => {
            let fixed = cleanDrawioXml(xmlStr);

            try {
              // 嘗試解析，捕獲錯誤資訊
              const parser = new DOMParser();
              const testDoc = parser.parseFromString(fixed, 'text/xml');
              const parserError = testDoc.querySelector('parsererror');

              if (parserError) {
                const errorText = parserError.textContent;
                const lineMatch = errorText.match(/error on line (\d+)/);

                if (lineMatch) {
                  const errorLine = parseInt(lineMatch[1]);
                  console.log(`[Draw.io] 檢測到第 ${errorLine} 行有錯誤，嘗試智慧修復`);

                  const lines = fixed.split('\n');
                  if (errorLine <= lines.length) {
                    let problematicLine = lines[errorLine - 1];
                    const originalLine = problematicLine;

                    console.log(`[Draw.io] 錯誤行 ${errorLine} 原始內容:`, problematicLine.substring(0, 150));

                    // 通用屬性格式修復策略（按順序執行）

                    // 1. 修復未閉合的引號（導致後續內容被誤認為屬性名）
                    // 統計引號數量，如果是奇數則在行尾補上引號
                    const quoteCount = (problematicLine.match(/"/g) || []).length;
                    if (quoteCount % 2 !== 0) {
                      // 找到最後一個 = 的位置，在該值的末尾（下一個空格或 > 之前）補引號
                      problematicLine = problematicLine.replace(/(=")([^"]*?)(\s|>|$)/g, '$1$2"$3');
                    }

                    // 2. 移除屬性名中的非法字元（屬性名只能包含字母、數字、下劃線、冒號、連字元）
                    // 例如：width 220 → width220，然後後續步驟會處理
                    problematicLine = problematicLine.replace(
                      /\s+([a-zA-Z_:][\w:.-]*)\s+=/g,
                      ' $1='
                    );

                    // 3. 修復屬性名後直接跟數字的情況（缺少等號和引號）
                    // 例如：width220 → width="220"
                    problematicLine = problematicLine.replace(
                      /\b(width|height|x|y|relative|vertex|edge)(\d+(?:\.\d+)?)/gi,
                      '$1="$2"'
                    );

                    // 4. 修復屬性名後跟字母但缺少等號的情況
                    // 例如：as geometry → as="geometry"
                    problematicLine = problematicLine.replace(
                      /\s(as|value|style|id|parent|source|target)\s+([a-zA-Z_][\w.-]*)/g,
                      ' $1="$2"'
                    );

                    // 5. 修復等號後缺少引號的情況
                    // 例如：width=220 → width="220"
                    problematicLine = problematicLine.replace(
                      /\b(width|height|x|y|as|relative|vertex|edge|source|target|parent|id)=([0-9.]+|[a-zA-Z_]\w*)(?!\s*")/g,
                      '$1="$2"'
                    );

                    // 6. 修復 style 屬性中缺少值的情況
                    problematicLine = problematicLine.replace(/;(\w+);/g, ';$1=0;');
                    problematicLine = problematicLine.replace(/;(\w+)"/g, ';$1=0"');

                    // 7. 修復多餘的分號和空格
                    problematicLine = problematicLine.replace(/;;+/g, ';');
                    problematicLine = problematicLine.replace(/;"/g, '"');
                    problematicLine = problematicLine.replace(/\s+>/g, '>');

                    // 8. 修復重複的等號
                    problematicLine = problematicLine.replace(/="+/g, '="');
                    problematicLine = problematicLine.replace(/=\s*=/g, '=');

                    // 9. 移除孤立的引號（不在屬性值內的引號）
                    // 這一步要謹慎，只移除明顯錯誤的引號
                    problematicLine = problematicLine.replace(/"\s+"/g, '');

                    lines[errorLine - 1] = problematicLine;
                    fixed = lines.join('\n');

                    if (originalLine !== problematicLine) {
                      console.log(`[Draw.io] 已修復第 ${errorLine} 行`);
                      console.log(`  修復前:`, originalLine.substring(0, 150));
                      console.log(`  修復後:`, problematicLine.substring(0, 150));
                    } else {
                      console.log(`[Draw.io] 第 ${errorLine} 行無法自動修復，可能需要手動檢查`);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[Draw.io] 屬性錯誤修復失敗:', e.message);
            }

            return fixed;
          },

          // 策略 6: 智慧截斷修復（定位錯誤行並嘗試移除）
          (xmlStr) => {
            try {
              // 嘗試解析，捕獲錯誤資訊
              const parser = new DOMParser();
              const testDoc = parser.parseFromString(xmlStr, 'text/xml');
              const parserError = testDoc.querySelector('parsererror');

              if (parserError) {
                const errorText = parserError.textContent;
                // 提取錯誤行號：error on line 142
                const lineMatch = errorText.match(/error on line (\d+)/);

                if (lineMatch) {
                  const errorLine = parseInt(lineMatch[1]);
                  console.log(`[Draw.io] 檢測到第 ${errorLine} 行有錯誤，嘗試智慧修復`);

                  // 獲取所有行
                  const lines = xmlStr.split('\n');

                  // 如果錯誤行存在，嘗試移除或修復它
                  if (errorLine <= lines.length) {
                    const problematicLine = lines[errorLine - 1];

                    // 如果這一行只是個多餘的結束標籤，直接移除
                    if (problematicLine.trim().match(/^<\/\w+>$/)) {
                      console.log(`[Draw.io] 移除多餘的結束標籤: ${problematicLine.trim()}`);
                      lines.splice(errorLine - 1, 1);
                      let fixed = lines.join('\n');

                      // 補全可能缺失的必要結束標籤
                      const requiredEndTags = ['</root>', '</mxGraphModel>', '</diagram>', '</mxfile>'];
                      for (const tag of requiredEndTags) {
                        if (!fixed.includes(tag)) {
                          fixed = fixed + '\n' + tag;
                        }
                      }

                      return fixed;
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[Draw.io] 智慧截斷修復失敗:', e.message);
            }

            // 如果智慧修復失敗，返回清理後的原始 XML
            return cleanDrawioXml(xmlStr);
          },

          // 策略 7: 使用原始 XML（不做任何處理）
          (xmlStr) => xmlStr
        ];

        let validXml = null;
        let usedStrategy = -1;

        // 依次嘗試每個修復策略
        for (let i = 0; i < repairStrategies.length; i++) {
          try {
            const repairedXml = repairStrategies[i](xml);
            validateDrawioXml(repairedXml);
            validXml = repairedXml;
            usedStrategy = i;
            console.log(`[Draw.io] 使用修復策略 ${i + 1} 成功`);
            break;
          } catch (error) {
            console.warn(`[Draw.io] 修復策略 ${i + 1} 失敗:`, error.message);
          }
        }

        // 如果所有策略都失敗，儲存原始 XML 並顯示友好的錯誤資訊
        if (!validXml) {
          console.error('[Draw.io] 所有修復策略均失敗，儲存原始 XML 供手動編輯');

          // 仍然儲存原始 XML 到 localStorage（使用者可以手動修復）
          window.localStorage.setItem('drawioData_' + docIdForThisMessage, xml);
          console.log('[Draw.io] 原始 XML 已儲存到 localStorage (需要手動修復), key:', 'drawioData_' + docIdForThisMessage);

          // 顯示友好的錯誤提示，包含手動編輯選項
          const errorHtml = `
            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;margin-top:16px;">
              <div style="display:flex;align-items:start;gap:12px;">
                <div style="font-size:24px;">⚠️</div>
                <div style="flex:1;">
                  <div style="font-weight:600;color:#856404;margin-bottom:8px;">配圖 XML 需要手動修復</div>
                  <div style="font-size:14px;color:#856404;margin-bottom:12px;">
                    AI 生成的 XML 包含格式錯誤，自動修復失敗。您可以：
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button onclick="window.open((window.location.pathname.endsWith('/history_detail.html') ? '../drawio/drawio.html' : 'views/drawio/drawio.html') + '?docId=${encodeURIComponent(docIdForThisMessage)}', '_blank')"
                            style="padding:8px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
                      🛠️ 在編輯器中手動修復
                    </button>
                    <button onclick="navigator.clipboard.writeText(\`${xml.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);this.textContent='✓ 已複製'"
                            style="padding:8px 16px;background:#6c757d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
                      📋 複製 XML
                    </button>
                    <button onclick="if(window.ChatbotActions && window.ChatbotActions.deleteMessage) window.ChatbotActions.deleteMessage(${assistantMsgIndex})"
                            style="padding:8px 16px;background:#dc3545;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
                      🗑️ 刪除此訊息
                    </button>
                  </div>
                  <div style="font-size:12px;color:#856404;margin-top:8px;line-height:1.4;">
                    💡 提示：點選"在編輯器中手動修復"可以在左側文字框中編輯 XML，修復後重新整理右側預覽。
                  </div>
                </div>
              </div>
            </div>
          `;

          chatHistory[assistantMsgIndex].content = errorHtml;
          chatHistory[assistantMsgIndex].isDrawioPictures = false; // 不顯示成功的卡片
          chatHistory[assistantMsgIndex].isRawHtml = true; // 標記為純 HTML，不進行 Markdown 解析
          return; // 不丟擲錯誤，避免進入 catch 塊
        }

        // 使用修復成功的 XML
        xml = validXml;

        // 🎨 應用版面最佳化（網格對齊、間距、連線等）
        // 注意：DrawioLite DSL 已在 parser 中最佳化，這裡只處理 AI 直接生成的 XML
        if (!isAlreadyOptimized) {
          try {
            if (window.DrawioLayoutOptimizer && typeof window.DrawioLayoutOptimizer.optimizeDrawioLayout === 'function') {
              console.log('[Draw.io] 🎨 正在應用版面最佳化（多頁支援）...');
              xml = window.DrawioLayoutOptimizer.optimizeDrawioLayout(xml, {
                dagreLayout: true,    // 使用 Dagre 演算法（現已支援多頁）
                gridAlignment: true,  // 網格對齊
                spacing: false,       // 禁用間距最佳化（Dagre 已處理）
                connections: true,    // 連線最佳化
                styles: false         // 不統一樣式（保留 AI 的顏色選擇）
              });
              console.log('[Draw.io] ✅ 版面最佳化完成');
            } else {
              console.warn('[Draw.io] 版面最佳化模組未載入，跳過最佳化');
            }
          } catch (optimizeError) {
            console.warn('[Draw.io] 版面最佳化失敗，使用原始 XML:', optimizeError);
            // 最佳化失敗不影響主流程，繼續使用未最佳化的 XML
          }
        } else {
          console.log('[Draw.io] ⏭️ 跳過版面最佳化（DrawioLite 已最佳化）');
        }

        // 🎓 應用學術增強（Paper Burner 專屬：語義配色 + 學術規範）
        // 注意：DrawioLite DSL 已有顏色規範，此處主要針對 AI 直接生成的 XML
        if (!isAlreadyOptimized) {
          try {
            if (window.DrawioAcademicEnhancer && typeof window.DrawioAcademicEnhancer.enhanceAcademicDiagram === 'function') {
              console.log('[Draw.io] 🎓 正在應用學術增強...');
              xml = window.DrawioAcademicEnhancer.enhanceAcademicDiagram(xml, {
                level: 2,           // Level 2: 基礎 + 語義配色（預設）
                autoDetect: true    // 自動檢測圖表型別
              });
              console.log('[Draw.io] ✅ 學術增強完成');
            } else {
              console.warn('[Draw.io] 學術增強模組未載入，跳過增強');
            }
          } catch (enhanceError) {
            console.warn('[Draw.io] 學術增強失敗，使用原始 XML:', enhanceError);
            // 增強失敗不影響主流程
          }
        } else {
          console.log('[Draw.io] ⏭️ 跳過學術增強（DrawioLite 已含顏色規範）');
        }

        // 存到 localStorage，key 與 mindmap 一致風格
        window.localStorage.setItem('drawioData_' + docIdForThisMessage, xml);
        console.log('[Draw.io] XML 已儲存到 localStorage, key:', 'drawioData_' + docIdForThisMessage);

        // 用一個輕量佔位內容替換聊天正文，後續由 MessageRenderer 渲染卡片
        chatHistory[assistantMsgIndex].content = '[DRAWIO_XML_EMBED]';
        chatHistory[assistantMsgIndex].isDrawioPictures = true;
      } catch (error) {
        console.error('[Draw.io] XML 處理失敗:', error);
        chatHistory[assistantMsgIndex].content += '\n\n<div style="color:#e53e3e;background:#fee;padding:12px;border-radius:6px;margin-top:16px;">⚠️ 配圖 XML 處理失敗: ' + error.message + '</div>';
        chatHistory[assistantMsgIndex].isDrawioPictures = false;
        chatHistory[assistantMsgIndex].isRawHtml = true; // 標記為純 HTML，不進行 Markdown 解析
      }
    }
  } catch (e) {
    // 處理使用者中止的情況
    if (e.name === 'AbortError') {
      chatHistory[assistantMsgIndex].content = '對話已被使用者中止。';
      isChatbotLoadingRef.value = false;
      if (typeof updateChatbotUI === 'function') updateChatbotUI();
      saveChatHistory(docIdForThisMessage, chatHistory);
      return;
    }

    if (e.message === "stream_not_supported" && (
          config.model === 'custom' ||
          (typeof config.model === 'string' && (
             config.model.startsWith('custom_source_') ||
             config.model === 'gemini' || config.model === 'gemini-preview' || config.model.startsWith('gemini')
          )))) {
      try {
        chatHistory[assistantMsgIndex].content = '流式請求失敗，嘗試以非流式傳送...';
        if (typeof updateChatbotUI === 'function') updateChatbotUI();
        const requestBody = apiConfig.bodyBuilder(systemPrompt, userInput);
        const response = await fetch(apiConfig.endpoint, {
          method: 'POST',
          headers: apiConfig.headers,
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API 錯誤 (${response.status}): ${errText}`);
        }
        const data = await response.json();
        const answer = apiConfig.responseExtractor(data);
        if (!answer) {
          throw new Error("API 響應解析失敗，未能提取回復內容");
        }
        chatHistory[assistantMsgIndex].content = answer;
      } catch (fallbackError) {
        chatHistory[assistantMsgIndex].content = `對話失敗: 當前模型配置可能有誤。錯誤細節: ${fallbackError.message}`;
      }
    } else {
      let errorMessage = '對話失敗';
      if (e.message.includes('429')) {
        errorMessage += ': 請求頻率超限，請稍後再試';
      } else if (e.message.includes('401') || e.message.includes('403')) {
        errorMessage += ': API Key 無效或無許可權';
      } else if (e.message.includes('bad_response_status_code')) {
        errorMessage += ': 模型可能不支援流式回覆，請在主頁面修改為其他模型';
      } else {
        errorMessage += ': ' + e.message;
      }
      if (chatHistory[assistantMsgIndex]) {
        chatHistory[assistantMsgIndex].content = errorMessage;
      }
    }
  } finally {
    // 清理中止控制器
    window.chatbotAbortController = null;

    isChatbotLoadingRef.value = false;
    if (typeof updateChatbotUI === 'function') updateChatbotUI();
    if (isMindMapRequest && chatHistory[assistantMsgIndex].hasMindMap) {
      setTimeout(() => {
        try {
          const mindmapContainer = document.getElementById('mindmap-container');
          if (mindmapContainer && window.MindMap) {
            const mindMapData = window.MindMap.parse(chatHistory[assistantMsgIndex].mindMapData);
            if (mindMapData) {
              window.MindMap.render('mindmap-container', mindMapData);
            } else {
              mindmapContainer.innerHTML = '<div style="padding:20px;color:#e53e3e;text-align:center;">思維導圖生成失敗，請重試</div>';
            }
          }
        } catch (err) {
          const container = document.getElementById('mindmap-container');
          if (container) {
            container.innerHTML = '<div style="padding:20px;color:#e53e3e;text-align:center;">思維導圖渲染出錯: ' + err.message + '</div>';
          }
        }
      }, 800);
    }

    saveChatHistory(docIdForThisMessage, chatHistory);

    // 後端模式：儲存助手訊息
    if (window.ChatHistoryManager && window.ChatHistoryManager.saveSingleMessage) {
      await window.ChatHistoryManager.saveSingleMessage(docIdForThisMessage, {
        role: 'assistant',
        content: chatHistory[assistantMsgIndex].content,
        metadata: {
          toolCallHtml: chatHistory[assistantMsgIndex].toolCallHtml,
          reactLog: chatHistory[assistantMsgIndex].reactLog, // 儲存 ReAct 日誌
          hasMindMap: chatHistory[assistantMsgIndex].hasMindMap,
          mindMapData: chatHistory[assistantMsgIndex].mindMapData,
          reasoningContent: chatHistory[assistantMsgIndex].reasoningContent
        }
      });
    }
  }
}

// =============== 新增：分段整理輔助函式 ===============
/**
 * 針對單個文字塊進行摘要或處理的輔助函式。
 * 主要用於長文字分塊處理的場景，例如對每個文件分塊進行初步總結。
 * 此函式不依賴聊天曆史，僅進行單輪請求。
 *
 * @param {string} sysPrompt 系統提示，指導模型如何處理輸入。
 * @param {string} userInput 需要處理的文字塊內容。
 * @param {object} config 聊天機器人配置物件 (通常來自 `getChatbotConfig`)。
 * @param {string} apiKey API 金鑰。
 * @returns {Promise<string>} 模型處理後的文字結果。
 * @throws {Error} 如果 API 請求失敗或響應解析失敗。
 */
async function singleChunkSummary(sysPrompt, userInput, config, apiKey) {
  const extractTextFromUserContent = (userContent) => {
    if (Array.isArray(userContent)) {
      const textPart = userContent.find(part => part.type === 'text');
      return textPart ? textPart.text : '';
    }
    return userContent;
  };

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
    return [{ text: userContent }];
  };

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
    return [{ type: 'text', text: userContent }];
  };

  const buildCustomApiConfig = window.ApiConfigBuilder?.buildCustomApiConfig;

  // 只做單輪整理，不帶歷史
  let apiConfig;
  const isCustomLike = config.model === 'custom' || (typeof config.model === 'string' && config.model.startsWith('custom_source_'));

  if (isCustomLike) {
    // 與 sendChatbotMessage 對齊：Chatbot 獨立配置，可回退到翻譯模型配置（單向隔離）
    let selectedModelId = '';
    try {
      // 1. 【最高優先順序】Chatbot 專用配置的模型ID
      if (config.cms && config.cms.modelId) {
        selectedModelId = config.cms.modelId;
      }
      // 2. 【回退】翻譯模型配置（僅讀取）
      if (!selectedModelId && config.settings && config.settings.selectedCustomModelId) {
        selectedModelId = config.settings.selectedCustomModelId;
      }
      // 3. 【進一步回退】可用模型列表的第一個
      if (!selectedModelId && Array.isArray(config.siteSpecificAvailableModels) && config.siteSpecificAvailableModels.length > 0) {
        selectedModelId = typeof config.siteSpecificAvailableModels[0] === 'object' ? config.siteSpecificAvailableModels[0].id : config.siteSpecificAvailableModels[0];
      }
    } catch (e) {
      console.error('[Chatbot/Summary] 獲取模型ID失敗:', e);
    }

    apiConfig = buildCustomApiConfig(
      apiKey,
      (config.cms.apiEndpoint || config.cms.apiBaseUrl),
      selectedModelId,
      config.cms.requestFormat,
      config.cms.temperature,
      config.cms.max_tokens,
      {
        endpointMode: (config.cms && config.cms.endpointMode) || 'auto'
      }
    );
  } else {
    const predefinedConfigs = {
      'mistral': {
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        modelName: 'mistral-large-latest',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: 'mistral-large-latest',
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          stream: true
        }),
        streamHandler: true,
        responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'deepseek': {
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        modelName: 'deepseek-chat',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          stream: true
        }),
        streamHandler: true,
        responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'volcano': {
        endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        modelName: '火山引擎',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: (function(){ try{ const cfg = loadModelConfig && loadModelConfig('volcano'); if (cfg && (cfg.preferredModelId||cfg.modelId)) return cfg.preferredModelId||cfg.modelId; }catch(e){} return 'doubao-1-5-pro-32k-250115'; })(),
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          temperature: 0.5, max_tokens: 8192, stream: true
        }),
        streamHandler: true, responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'tongyi': {
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        modelName: '阿里雲通義百鍊',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        bodyBuilder: (sys, msgs, user_content) => ({
          model: (function(){ try{ const cfg = loadModelConfig && loadModelConfig('tongyi'); if (cfg && (cfg.preferredModelId||cfg.modelId)) return cfg.preferredModelId||cfg.modelId; }catch(e){} return 'qwen-turbo-latest'; })(),
          messages: [
            { role: 'system', content: sys },
            ...msgs.map(m => ({ role: m.role, content: extractTextFromUserContent(m.content) })),
            { role: 'user', content: extractTextFromUserContent(user_content) }
          ],
          temperature: 0.5, max_tokens: 8192, stream: true
        }),
        streamHandler: true, responseExtractor: (data) => data?.choices?.[0]?.message?.content
      },
      'claude': {
        endpoint: 'https://api.anthropic.com/v1/messages',
        modelName: 'claude-3-sonnet-20240229',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        bodyBuilder: (sys, msgs, user_content) => {
          return {
            model: apiConfig.modelName || 'claude-3-sonnet-20240229',
            system: sys,
            messages: msgs.length ?
              [...msgs, { role: 'user', content: convertOpenAIToAnthropicContent(user_content) }] :
              [{ role: 'user', content: convertOpenAIToAnthropicContent(user_content) }],
            max_tokens: 2048,
            stream: true
          };
        },
        streamHandler: 'claude',
        responseExtractor: (data) => data?.content?.[0]?.text
      },
      'gemini': {
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        streamEndpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${apiKey}&alt=sse`,
        modelName: 'gemini-pro',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, msgs, user_content) => {
          const geminiMessages = [];
          if (msgs.length) {
            for (const msg of msgs) {
              geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: convertOpenAIToGeminiParts(msg.content) });
            }
          }
          geminiMessages.push({ role: 'user', parts: convertOpenAIToGeminiParts(user_content) });
          return {
            contents: geminiMessages,
            generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
            ...(sys && { systemInstruction: { parts: [{ text: sys }] }})
          };
        },
        streamHandler: 'gemini',
        responseExtractor: (data) => {
          if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            return parts && parts.length > 0 ? parts.map(p=>p.text).join('') : '';
          }
          return '';
        }
      },
      'gemini-preview': {
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        streamEndpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${apiKey}&alt=sse`,
        modelName: 'gemini-1.5-flash-latest',
        headers: { 'Content-Type': 'application/json' },
        bodyBuilder: (sys, msgs, user_content) => {
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
              temperature: 0.5, maxOutputTokens: 2048,
              responseModalities: ["TEXT"], responseMimeType: "text/plain"
            },
            ...(sys && { systemInstruction: { parts: [{ text: sys }] }})
          };
        },
        streamHandler: 'gemini',
        responseExtractor: (data) => {
          if (data?.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            return parts && parts.length > 0 ? parts.map(p=>p.text).join('') : '';
          }
          return '';
        }
      }
    };
    apiConfig = predefinedConfigs[config.model] || predefinedConfigs['mistral'];

    // Special handling for API keys for certain predefined models
    if (config.model === 'mistral') {
      apiConfig.headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (config.model === 'claude') {
       apiConfig.headers['x-api-key'] = apiKey;
       if (config.cms && config.cms.modelId) {
           apiConfig.modelName = config.cms.modelId;
       }
    } else if (config.model.startsWith('gemini')) {
        let geminiModelId = 'gemini-pro';
        if (config.model === 'gemini-preview') geminiModelId = 'gemini-1.5-flash-latest';

        if (config.settings && config.settings.selectedCustomModelId &&
            (config.model === 'gemini' || config.model === 'gemini-preview' || (config.cms && config.cms.requestFormat && config.cms.requestFormat.startsWith('gemini')) )
           ) {
           geminiModelId = config.settings.selectedCustomModelId;
        } else if (config.cms && config.cms.modelId && (config.cms.requestFormat && config.cms.requestFormat.startsWith('gemini'))) {
            geminiModelId = config.cms.modelId;
        } else {
            try {
              if (typeof loadModelConfig === 'function') {
                const gcfg = loadModelConfig('gemini');
                if (gcfg && (gcfg.preferredModelId || gcfg.modelId)) {
                  geminiModelId = gcfg.preferredModelId || gcfg.modelId;
                }
              }
            } catch (e) { /* ignore */ }
        }

        apiConfig.modelName = geminiModelId;
        const modelPath = geminiModelId.startsWith('models/') ? geminiModelId.substring(7) : geminiModelId;
        apiConfig.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent?key=${apiKey}`;
        apiConfig.streamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:streamGenerateContent?key=${apiKey}&alt=sse`;
    }
  }

  // 相容不同 bodyBuilder 簽名：自定義(2參) vs 預置(3參)
  let requestBody;
  try {
    if (typeof apiConfig.bodyBuilder === 'function') {
      if (apiConfig.bodyBuilder.length <= 2) {
        requestBody = apiConfig.bodyBuilder(sysPrompt, userInput);
      } else {
        requestBody = apiConfig.bodyBuilder(sysPrompt, [], userInput);
      }
    } else {
      throw new Error('apiConfig.bodyBuilder 未定義');
    }
  } catch (e) {
    console.error('[singleChunkSummary] 構建請求體失敗:', e);
    throw e;
  }
  try { console.log('[singleChunkSummary] POST', apiConfig.endpoint, apiConfig.headers); } catch(_) {}

  let response;
  try {
    response = await fetch(apiConfig.endpoint, {
      method: 'POST',
      headers: apiConfig.headers,
      body: JSON.stringify(requestBody)
    });
  } catch (networkErr) {
    if (isCustomLike && apiConfig.bodyBuilder && apiConfig.bodyBuilder.length > 2) {
      const retryBody = apiConfig.bodyBuilder(sysPrompt, [], userInput);
      response = await fetch(apiConfig.endpoint, {
        method: 'POST',
        headers: apiConfig.headers,
        body: JSON.stringify(retryBody)
      });
    } else {
      throw networkErr;
    }
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 錯誤 (${response.status}): ${errText}`);
  }
  const data = await response.json();
  const answer = apiConfig.responseExtractor(data);
  if (!answer) throw new Error('API 響應解析失敗，未能提取內容');
  return answer;
}

  // 匯出
  window.MessageSender = {
    getChatbotConfig,
    sendChatbotMessage,
    singleChunkSummary
  };

})();
