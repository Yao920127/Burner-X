// chatbot/core/chatbot-config-manager.js
// Chatbot 獨立配置管理器 - 將chatbot模型配置與翻譯模型解耦

/**
 * Chatbot配置結構：
 * {
 *   sourceType: 'predefined' | 'custom',  // 模型來源型別
 *   model: string,                        // 預設模型名稱（mistral/deepseek等）或'custom'
 *   customSourceSiteId: string,           // 自定義源站點ID（當sourceType='custom'時）
 *   selectedModelId: string,              // 選擇的具體模型ID
 *   temperature: number,                  // 溫度引數
 *   max_tokens: number,                   // 最大token數
 *   concurrency: number                   // 並行數
 * }
 */

const CHATBOT_CONFIG_KEY = 'chatbotModelConfig';

/**
 * 儲存chatbot配置到localStorage
 * @param {Object} config - chatbot配置物件
 */
function saveChatbotConfig(config) {
  try {
    const configToSave = {
      sourceType: config.sourceType || 'predefined',
      model: config.model || 'mistral',
      customSourceSiteId: config.customSourceSiteId || null,
      selectedModelId: config.selectedModelId || '',
      temperature: config.temperature !== undefined ? config.temperature : 0.5,
      max_tokens: config.max_tokens || 8000,
      concurrency: config.concurrency || 10
    };

    localStorage.setItem(CHATBOT_CONFIG_KEY, JSON.stringify(configToSave));
    console.log('[Chatbot Config] 配置已儲存:', configToSave);

    // 清除UI配置快取,以便下次獲取最新配置
    window._cachedChatbotConfig = null;

    return true;
  } catch (e) {
    console.error('[Chatbot Config] 儲存配置失敗:', e);
    return false;
  }
}

/**
 * 從localStorage載入chatbot配置
 * @returns {Object|null} - chatbot配置物件，如果不存在則返回null
 */
function loadChatbotConfig() {
  try {
    const configStr = localStorage.getItem(CHATBOT_CONFIG_KEY);
    if (!configStr) {
      return null;
    }

    const config = JSON.parse(configStr);
    console.log('[Chatbot Config] 配置已載入:', config);
    return config;
  } catch (e) {
    console.error('[Chatbot Config] 載入配置失敗:', e);
    return null;
  }
}

/**
 * 從翻譯模型配置初始化chatbot配置（首次使用時的回退邏輯）
 * @returns {Object} - 初始化後的chatbot配置
 */
function initializeChatbotConfigFromTranslation() {
  console.log('[Chatbot Config] 首次初始化，從翻譯模型配置回退...');

  // 載入系統設定
  const settings = (typeof loadSettings === 'function')
    ? loadSettings()
    : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}');

  const translationModel = settings.selectedTranslationModel || 'mistral';
  const customModelSettings = settings.customModelSettings || {};

  let config = {
    sourceType: 'predefined',
    model: translationModel,
    customSourceSiteId: null,
    selectedModelId: '',
    temperature: customModelSettings.temperature !== undefined ? customModelSettings.temperature : 0.5,
    max_tokens: customModelSettings.max_tokens || 8000,
    concurrency: 10
  };

  // 如果翻譯模型是自定義源站點
  if (translationModel === 'custom' && settings.selectedCustomSourceSiteId) {
    config.sourceType = 'custom';
    config.customSourceSiteId = settings.selectedCustomSourceSiteId;

    // 嘗試載入源站點的可用模型列表，選擇第一個作為預設
    const allSites = (typeof loadAllCustomSourceSites === 'function')
      ? loadAllCustomSourceSites()
      : {};
    const site = allSites[settings.selectedCustomSourceSiteId];

    if (site) {
      // 從源站點載入配置
      config.temperature = site.temperature !== undefined ? site.temperature : 0.5;
      config.max_tokens = site.max_tokens || 8000;

      // 如果有可用模型列表，選擇第一個
      if (site.availableModels && site.availableModels.length > 0) {
        const firstModel = site.availableModels[0];
        // 處理物件和字串兩種情況
        if (typeof firstModel === 'string') {
          config.selectedModelId = firstModel;
        } else if (typeof firstModel === 'object' && firstModel !== null) {
          config.selectedModelId = firstModel.id || firstModel.modelId || firstModel.value || '';
        }
      } else if (site.modelId) {
        config.selectedModelId = site.modelId;
      }
    }
  }

  // 儲存初始化的配置
  saveChatbotConfig(config);

  console.log('[Chatbot Config] 初始化完成:', config);
  return config;
}

/**
 * 獲取chatbot配置，優先使用chatbot專用配置，否則從翻譯模型初始化
 * @returns {Object} - chatbot配置物件
 */
function getChatbotModelConfig() {
  let config = loadChatbotConfig();

  // 如果沒有chatbot配置，從翻譯模型初始化
  if (!config) {
    config = initializeChatbotConfigFromTranslation();
  }

  return config;
}

/**
 * 將chatbot配置轉換為message-sender.js需要的格式
 * @param {Object} chatbotConfig - chatbot配置物件
 * @returns {Object} - 包含model, apiKey, apiKeyId, cms, settings等的配置物件
 */
function convertChatbotConfigToMessageSenderFormat(chatbotConfig) {
  const settings = (typeof loadSettings === 'function')
    ? loadSettings()
    : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}');

  let model = chatbotConfig.model;
  let cms = {
    temperature: chatbotConfig.temperature,
    max_tokens: chatbotConfig.max_tokens
  };
  let siteSpecificAvailableModels = [];

  // 如果是自定義源站點
  if (chatbotConfig.sourceType === 'custom' && chatbotConfig.customSourceSiteId) {
    const allSites = (typeof loadAllCustomSourceSites === 'function')
      ? loadAllCustomSourceSites()
      : {};
    const site = allSites[chatbotConfig.customSourceSiteId];

    if (site) {
      cms = {
        ...site,
        temperature: chatbotConfig.temperature,
        max_tokens: chatbotConfig.max_tokens
      };
      model = `custom_source_${chatbotConfig.customSourceSiteId}`;
      siteSpecificAvailableModels = site.availableModels || [];

      // 如果指定了具體模型ID，覆蓋cms.modelId
      if (chatbotConfig.selectedModelId) {
        cms.modelId = chatbotConfig.selectedModelId;
      }
    }
  } else {
    // 預設模型
    cms.modelId = chatbotConfig.selectedModelId;
  }

  // 獲取API Key
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
    siteSpecificAvailableModels,
    chatbotConcurrency: chatbotConfig.concurrency
  };
}

/**
 * 重置chatbot配置（刪除獨立配置，下次將從翻譯模型重新初始化）
 */
function resetChatbotConfig() {
  try {
    localStorage.removeItem(CHATBOT_CONFIG_KEY);
    console.log('[Chatbot Config] 配置已重置');
    return true;
  } catch (e) {
    console.error('[Chatbot Config] 重置配置失敗:', e);
    return false;
  }
}

/**
 * 檢查chatbot是否已配置
 * @returns {boolean}
 */
function isChatbotConfigured() {
  const config = loadChatbotConfig();
  return config !== null;
}

// 匯出到全域
if (typeof window !== 'undefined') {
  window.ChatbotConfigManager = {
    saveChatbotConfig,
    loadChatbotConfig,
    getChatbotModelConfig,
    initializeChatbotConfigFromTranslation,
    convertChatbotConfigToMessageSenderFormat,
    resetChatbotConfig,
    isChatbotConfigured
  };
}

// ES Module 匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveChatbotConfig,
    loadChatbotConfig,
    getChatbotModelConfig,
    initializeChatbotConfigFromTranslation,
    convertChatbotConfigToMessageSenderFormat,
    resetChatbotConfig,
    isChatbotConfigured
  };
}
