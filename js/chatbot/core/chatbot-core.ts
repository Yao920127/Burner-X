// chatbot-core.js
// 主入口模組 - 整合所有子模組並匯出統一介面

// =============== 全域狀態 ===============
let chatHistory = [];
let isChatbotLoading = false;

// 包裝 isChatbotLoading 為參考物件，以便傳遞給子模組
const isChatbotLoadingRef = {
  get value() { return isChatbotLoading; },
  set value(v) { isChatbotLoading = v; }
};

// =============== 從各模組匯入函式 ===============

// API 配置構建模組
const buildCustomApiConfig = window.ApiConfigBuilder?.buildCustomApiConfig;

// 聊天曆史管理模組
const saveChatHistory = window.ChatHistoryManager?.saveChatHistory;
const loadChatHistory = window.ChatHistoryManager?.loadChatHistory;
const clearChatHistory = window.ChatHistoryManager?.clearChatHistory;
const reloadChatHistoryAndUpdateUI = window.ChatHistoryManager?.reloadChatHistoryAndUpdateUI;
const clearCurrentDocChatHistory = window.ChatHistoryManager?.clearCurrentDocChatHistory;
const deleteMessageFromHistory = window.ChatHistoryManager?.deleteMessageFromHistory;

// 內容處理模組
const getCurrentDocContent = window.ContentProcessor?.getCurrentDocContent;
const buildChatMessages = window.ContentProcessor?.buildChatMessages;
const splitContentSmart = window.ContentProcessor?.splitContentSmart;
const getCurrentDocId = window.ContentProcessor?.getCurrentDocId;
const attachSelectedContextToDoc = window.ContentProcessor?.attachSelectedContextToDoc;
const buildFallbackSemanticContext = window.ContentProcessor?.buildFallbackSemanticContext;

// 語義意群管理模組
const showMultiHopConfigDialog = window.SemanticGroupsManager?.showMultiHopConfigDialog;
const ensureIndexesBuilt = window.SemanticGroupsManager?.ensureIndexesBuilt;

// 訊息傳送模組
const getChatbotConfig = window.MessageSender?.getChatbotConfig;
const singleChunkSummary = window.MessageSender?.singleChunkSummary;

// =============== 包裝函式 ===============

/**
 * 包裝 ensureSemanticGroupsReady，注入依賴
 */
async function ensureSemanticGroupsReady(docContentInfo) {
  if (!window.SemanticGroupsManager?.ensureSemanticGroupsReady) {
    console.warn('[ChatbotCore] SemanticGroupsManager.ensureSemanticGroupsReady not loaded');
    return;
  }
  return window.SemanticGroupsManager.ensureSemanticGroupsReady(
    docContentInfo,
    getCurrentDocId,
    getChatbotConfig,
    singleChunkSummary
  );
}

/**
 * 包裝 sendChatbotMessage，注入依賴
 */
async function sendChatbotMessage(userInput, updateChatbotUI, externalConfig = null, displayUserInput = null) {
  if (!window.MessageSender?.sendChatbotMessage) {
    console.error('[ChatbotCore] MessageSender.sendChatbotMessage not loaded');
    return;
  }
  return window.MessageSender.sendChatbotMessage(
    userInput,
    updateChatbotUI,
    externalConfig,
    displayUserInput,
    chatHistory,
    isChatbotLoadingRef,
    getCurrentDocId,
    getCurrentDocContent,
    saveChatHistory,
    ensureSemanticGroupsReady
  );
}

/**
 * 包裝 reloadChatHistoryAndUpdateUI，注入依賴
 */
function reloadChatHistoryAndUpdateUIWrapper(updateChatbotUI) {
  if (!window.ChatHistoryManager?.reloadChatHistoryAndUpdateUI) {
    console.warn('[ChatbotCore] ChatHistoryManager.reloadChatHistoryAndUpdateUI not loaded');
    return;
  }
  return reloadChatHistoryAndUpdateUI(updateChatbotUI, getCurrentDocId, chatHistory);
}

/**
 * 包裝 clearCurrentDocChatHistory，注入依賴
 */
function clearCurrentDocChatHistoryWrapper(updateChatbotUI) {
  if (!window.ChatHistoryManager?.clearCurrentDocChatHistory) {
    console.warn('[ChatbotCore] ChatHistoryManager.clearCurrentDocChatHistory not loaded');
    return;
  }
  return clearCurrentDocChatHistory(updateChatbotUI, getCurrentDocId, chatHistory);
}

/**
 * 包裝 deleteMessageFromHistory，注入依賴
 */
function deleteMessageFromHistoryWrapper(docId, index, updateUIAfterDelete) {
  if (!window.ChatHistoryManager?.deleteMessageFromHistory) {
    console.warn('[ChatbotCore] ChatHistoryManager.deleteMessageFromHistory not loaded');
    return;
  }
  return deleteMessageFromHistory(docId, index, updateUIAfterDelete, chatHistory);
}

// 匯出核心物件
window.ChatbotCore = {
  chatHistory,
  get isChatbotLoading() { return isChatbotLoading; },
  set isChatbotLoading(v) { isChatbotLoading = v; },
  getChatbotConfig,
  getCurrentDocContent,
  buildChatMessages,
  sendChatbotMessage,
  saveChatHistory,
  loadChatHistory,
  clearChatHistory,
  clearCurrentDocChatHistory: clearCurrentDocChatHistoryWrapper,
  deleteMessageFromHistory: deleteMessageFromHistoryWrapper,
  getCurrentDocId,
  reloadChatHistoryAndUpdateUI: reloadChatHistoryAndUpdateUIWrapper,
  // 匯出給意群聚合模組使用的單輪摘要工具
  singleChunkSummary,
  // 匯出內容處理工具
  splitContentSmart,
  attachSelectedContextToDoc,
  buildFallbackSemanticContext,
  // 重新生成意群（清空快取並根據設定重新生成）
  regenerateSemanticGroups: async function(newSettings) {
    try {
      if (newSettings && typeof newSettings === 'object') {
        window.semanticGroupsSettings = Object.assign({}, window.semanticGroupsSettings || {}, newSettings);
      }
      const docId = getCurrentDocId();
      if (typeof window.deleteSemanticGroupsFromDB === 'function') {
        await window.deleteSemanticGroupsFromDB(docId);
      }
      if (window.data) {
        delete window.data.semanticGroups;
      }
      const docContentInfo = getCurrentDocContent();
      await ensureSemanticGroupsReady(docContentInfo);
      if (window.ChatbotFloatingOptionsUI && typeof window.ChatbotFloatingOptionsUI.updateDisplay === 'function') {
        window.ChatbotFloatingOptionsUI.updateDisplay();
      }
      if (window.SemanticGroupsUI && typeof window.SemanticGroupsUI.update === 'function') {
        window.SemanticGroupsUI.update();
      }
    } catch (e) {
      console.error('[ChatbotCore] regenerateSemanticGroups 失敗:', e);
    }
  }
};
