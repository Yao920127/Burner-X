// chat-history-manager.js
// 聊天曆史管理模組 - 支援前端 localStorage 和後端 API 雙模式

(function() {
  'use strict';

  // =============== 儲存模式檢測 ===============

  /**
   * 判斷是否為後端模式
   * @returns {boolean}
   */
  function isBackendMode() {
    return window.storageAdapter && window.storageAdapter.isFrontendMode === false;
  }

  // =============== 對話歷史持久化 ===============

  /**
   * 儲存當前文件的聊天曆史
   * @param {string} docId
   * @param {Array} history
   */
  async function saveChatHistory(docId, history) {
    try {
      if (isBackendMode()) {
        // 後端模式：使用 API
        // 注意：為避免頻繁請求，這裡只是在記憶體中更新
        // 真正的儲存發生在每條訊息新增時（saveSingleMessage）
        // 或者在清空歷史時
        console.log(`[saveChatHistory] Backend mode - history tracked in memory`);
      } else {
        // 前端模式：localStorage
        localStorage.setItem('chatHistory_' + docId, JSON.stringify(history));
      }
    } catch (e) {
      console.error('[saveChatHistory] Error saving chat history:', e);
    }
  }

  /**
   * 儲存單條聊天訊息（最佳化版，用於後端模式）
   * @param {string} docId
   * @param {Object} message - { role, content, metadata }
   */
  async function saveSingleMessage(docId, message) {
    if (!isBackendMode()) {
      // 前端模式不需要單獨儲存，使用 saveChatHistory 即可
      return;
    }

    try {
      await window.storageAdapter.saveChatMessage(docId, {
        role: message.role,
        content: message.content,
        metadata: message.metadata || {}
      });
    } catch (e) {
      console.error('[saveSingleMessage] Error saving message to backend:', e);
    }
  }

  /**
   * 載入當前文件的聊天曆史
   * @param {string} docId
   * @returns {Promise<Array>}
   */
  async function loadChatHistory(docId) {
    try {
      let history = [];

      if (isBackendMode()) {
        // 後端模式：從 API 載入
        history = await window.storageAdapter.loadChatHistory(docId);
      } else {
        // 前端模式：localStorage
        const raw = localStorage.getItem('chatHistory_' + docId);
        if (raw) {
          history = JSON.parse(raw);
        }
      }

      // 清理可能包含未正確格式化的toolCallHtml（修復舊版本的相容性問題）
      history.forEach(msg => {
        if (msg.toolCallHtml && typeof msg.toolCallHtml === 'string') {
          // 檢查是否包含超大的未格式化JSON資料（可能導致顯示問題）
          const hasLargeJsonData = msg.toolCallHtml.includes('tool-step-detail">{') &&
                                   msg.toolCallHtml.length > 10000;

          // 檢查是否有HTML結構被破壞的跡象（如不比對的div標籤）
          const openDivs = (msg.toolCallHtml.match(/<div/g) || []).length;
          const closeDivs = (msg.toolCallHtml.match(/<\/div>/g) || []).length;
          const structureBroken = Math.abs(openDivs - closeDivs) > 2;

          if (hasLargeJsonData || structureBroken) {
            console.warn('[loadChatHistory] 檢測到有問題的toolCallHtml，已清除', {
              hasLargeJsonData,
              structureBroken,
              length: msg.toolCallHtml.length
            });
            delete msg.toolCallHtml;
          }
        }
      });

      return history;
    } catch (e) {
      console.error('[loadChatHistory] Error loading chat history:', e);
      return [];
    }
  }

  /**
   * 清空當前文件的聊天曆史
   * @param {string} docId
   */
  async function clearChatHistory(docId) {
    try {
      if (isBackendMode()) {
        // 後端模式：呼叫 API 清空
        await window.storageAdapter.clearChatHistory(docId);
      } else {
        // 前端模式：清空 localStorage
        localStorage.removeItem('chatHistory_' + docId);
      }
    } catch (e) {
      console.error('[clearChatHistory] Error clearing chat history:', e);
    }
  }

  /**
   * 重新載入當前文件的聊天曆史，並重新整理UI
   * @param {function} updateChatbotUI
   * @param {function} getCurrentDocId - 獲取當前文件ID的函式
   * @param {Array} chatHistory - 聊天曆史陣列的參考
   */
  async function reloadChatHistoryAndUpdateUI(updateChatbotUI, getCurrentDocId, chatHistory) {
    const docId = getCurrentDocId();
    const loaded = await loadChatHistory(docId);
    chatHistory.length = 0;
    loaded.forEach(m => chatHistory.push(m));
    if (typeof updateChatbotUI === 'function') updateChatbotUI();
  }

  /**
   * 清空當前文件的聊天曆史（記憶體和儲存），並重新整理UI
   * @param {function} updateChatbotUI - 更新UI的回撥函式
   * @param {function} getCurrentDocId - 獲取當前文件ID的函式
   * @param {Array} chatHistory - 聊天曆史陣列的參考
   */
  async function clearCurrentDocChatHistory(updateChatbotUI, getCurrentDocId, chatHistory) {
    const docId = getCurrentDocId();
    chatHistory.length = 0; // 清空記憶體中的歷史
    await clearChatHistory(docId); // 清除儲存
    console.log(`Chat history for docId '${docId}' cleared.`);
    if (typeof updateChatbotUI === 'function') {
      updateChatbotUI(); // 重新整理UI
    }
  }

  /**
   * 刪除指定索引的聊天訊息
   * @param {string} docId 當前文件的ID
   * @param {number} index 要刪除訊息的索引
   * @param {function} updateUIAfterDelete 刪除後更新UI的回撥函式
   * @param {Array} chatHistory - 聊天曆史陣列的參考
   */
  async function deleteMessageFromHistory(docId, index, updateUIAfterDelete, chatHistory) {
    if (index >= 0 && index < chatHistory.length) {
      chatHistory.splice(index, 1); // 從陣列中移除訊息

      if (isBackendMode()) {
        // 後端模式：重新同步整個歷史（簡化實現）
        // TODO: 可最佳化為刪除單條 API
        await clearChatHistory(docId);
        for (const msg of chatHistory) {
          await saveSingleMessage(docId, msg);
        }
      } else {
        // 前端模式：儲存到 localStorage
        await saveChatHistory(docId, chatHistory);
      }

      console.log(`Message at index ${index} for docId '${docId}' deleted.`);
      if (typeof updateUIAfterDelete === 'function') {
        updateUIAfterDelete(); // 呼叫回撥更新UI
      }
    } else {
      console.error(`[deleteMessageFromHistory] Invalid index: ${index} for chatHistory of length ${chatHistory.length}`);
    }
  }

  // 匯出
  window.ChatHistoryManager = {
    saveChatHistory,
    saveSingleMessage, // 新增：用於後端模式逐條儲存
    loadChatHistory,
    clearChatHistory,
    reloadChatHistoryAndUpdateUI,
    clearCurrentDocChatHistory,
    deleteMessageFromHistory
  };

})();
