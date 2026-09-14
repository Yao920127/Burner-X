// js/chatbot/chatbot-actions.js

window.ChatbotActions = {
  /**
   * 刪除指定索引的訊息。
   * @param {number} index - 要刪除訊息的索引。
   */
  deleteMessage: function(index) {
    if (confirm('確定要刪除這條訊息嗎？此操作無法撤銷。')) {
      if (window.ChatbotCore && typeof window.ChatbotCore.deleteMessageFromHistory === 'function' && typeof window.ChatbotCore.getCurrentDocId === 'function') {
        const docId = window.ChatbotCore.getCurrentDocId();
        window.ChatbotCore.deleteMessageFromHistory(docId, index, window.ChatbotUI.updateChatbotUI);
      } else {
        console.error('ChatbotActions: ChatbotCore.deleteMessageFromHistory or ChatbotCore.getCurrentDocId function is not defined.');
        alert('刪除訊息的功能暫未完全配置，請聯絡管理員。');
      }
    }
  },

  /**
   * 重新傳送指定索引的使用者訊息。
   * 將刪除此訊息之後的所有歷史記錄，然後重新傳送此訊息。
   * @param {number} index - 要重發訊息的索引。
   */
  resendUserMessage: function(index) {
    if (!window.ChatbotCore || !window.ChatbotCore.chatHistory || !window.ChatbotCore.chatHistory[index] || typeof window.ChatbotCore.getCurrentDocId !== 'function' || typeof window.ChatbotCore.saveChatHistory !== 'function') {
      console.error('ChatbotActions: Cannot resend message, core functions or history/message index is invalid.');
      alert('無法重發訊息，核心功能或聊天記錄無效。');
      return;
    }

    const docId = window.ChatbotCore.getCurrentDocId();
    const messageToResend = { ...window.ChatbotCore.chatHistory[index] }; // 淺複製以防意外修改

    if (messageToResend.role !== 'user') {
      alert('只能重發您傳送的訊息。');
      return;
    }

    let textContent = '';
    let hasNonTextContent = false;
    let originalUserMessageParts = []; // 用於重新傳送

    if (Array.isArray(messageToResend.content)) {
      originalUserMessageParts = messageToResend.content.map(part => ({ ...part })); // 深複製parts
      const textPart = originalUserMessageParts.find(part => part.type === 'text');
      if (textPart) {
        textContent = textPart.text;
      }
      if (originalUserMessageParts.some(part => part.type === 'image_url')) {
        hasNonTextContent = true;
      }
    } else if (typeof messageToResend.content === 'string') {
      textContent = messageToResend.content;
      originalUserMessageParts = [{ type: 'text', text: textContent }];
    }

    if (hasNonTextContent && textContent) {
      if (!confirm('此訊息包含圖片。目前重發功能僅支援文字部分。是否繼續重發文字內容？（此操作將刪除後續所有對話）')) {
        return;
      }
      // 如果使用者確認，我們只重發文字部分
      originalUserMessageParts = [{ type: 'text', text: textContent }];
    } else if (hasNonTextContent && !textContent) {
      alert('此訊息僅包含圖片，目前無法直接重發。請嘗試重新上傳圖片並輸入文字。');
      return;
    } else {
      // 純文字訊息，或使用者已確認僅重發文字
      if (!confirm('確定要重發這條訊息嗎？此操作將刪除該訊息之後的所有對話記錄。')) {
        return;
      }
    }

    if (!textContent.trim() && !hasNonTextContent) { // 如果清除了圖片後沒有文字了
        alert('沒有可重發的文字內容。');
        return;
    }


    // 刪除此訊息之後的所有歷史記錄
    if (index < window.ChatbotCore.chatHistory.length -1) { // 確保不是最後一條訊息
        window.ChatbotCore.chatHistory.splice(index + 1);
    }
    // 注意：此時 messageToResend 自身還在 chatHistory 中，我們會在 sendChatbotMessage 前將其移除，或者 sendChatbotMessage 內部會處理好上下文。
    // 為了簡化，我們先從歷史記錄中移除舊的這條，sendChatbotMessage 會重新新增它。
    window.ChatbotCore.chatHistory.splice(index, 1);


    // 更新並儲存被截斷的歷史記錄
    window.ChatbotCore.saveChatHistory(docId, window.ChatbotCore.chatHistory);
    window.ChatbotUI.updateChatbotUI(); // 更新UI以反映歷史記錄的變化


    // 清空當前輸入欄位（如果使用者正在輸入）
    const inputField = document.getElementById('chatbot-input');
    if (inputField) inputField.value = '';

    // 清空已選圖片 (因為我們只重發提取的文字或原始訊息的圖片)
    if (window.ChatbotImageUtils) {
        window.ChatbotImageUtils.selectedChatbotImages = [];
        window.ChatbotImageUtils.updateSelectedImagesPreview();
    }

    // 準備傳送內容，可以是字串或陣列
    let sendVal = originalUserMessageParts.length === 1 && originalUserMessageParts[0].type === 'text'
                  ? originalUserMessageParts[0].text
                  : originalUserMessageParts;
    let displayVal = sendVal; // 簡單起見，讓顯示值和傳送值一致

    if (window.PromptConstructor && typeof window.PromptConstructor.enhanceUserPrompt === 'function') {
      sendVal = window.PromptConstructor.enhanceUserPrompt(sendVal);
    }

    // 確保 ChatbotCore.sendChatbotMessage 的引數和行為
    // 第三個引數是 onComplete (通常是null), 第四個是 displayVal
    window.ChatbotCore.sendChatbotMessage(sendVal, window.ChatbotUI.updateChatbotUI, null, displayVal);
  }
};