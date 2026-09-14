window.ChatbotPresetQuestionsUI = {
  /**
   * 渲染預設問題區域。
   * @param {HTMLElement} parentElement - presetContainer 將被新增到的父元素 (通常是 chatbotWindow 或 mainContentArea)。
   * @param {boolean} isCustomModel - 當前是否為自定義模型。
   * @param {string} currentDocId - 當前文件ID，用於自動收起邏輯。
   * @param {function} updateChatbotUICallback - 用於在按鈕點選時觸發主UI更新的回撥。
   * @param {function} handlePresetQuestionCallback - 處理預設問題點選的回撥。
   * @returns {HTMLElement} 建立的 presetContainer 元素，或在失敗時返回 null。
   */
  render: function(parentElement, isCustomModel, currentDocId, updateChatbotUICallback, handlePresetQuestionCallback) {
    // 確保清除舊的 presetContainer (如果存在)
    let existingPresetContainer = document.getElementById('chatbot-preset-container');
    if (existingPresetContainer) existingPresetContainer.remove();

    const presetContainer = document.createElement('div');
    presetContainer.id = 'chatbot-preset-container';
    presetContainer.style.position = 'absolute';
    presetContainer.style.top = '58px'; // 稍微增加頂部距離，避免過於擁擠 (原53px)
    presetContainer.style.left = '0px';
    presetContainer.style.right = '0px';
    presetContainer.style.zIndex = '5'; // 確保在聊天內容之上但在模態框之內
    presetContainer.style.padding = '6px 24px'; // 恢復適度的內邊距，增加呼吸感 (原4px 20px)

    const newPresetHeader = document.createElement('div');
    newPresetHeader.id = 'chatbot-preset-header';
    newPresetHeader.style.display = 'flex';
    newPresetHeader.style.alignItems = 'center';
    newPresetHeader.style.justifyContent = 'space-between';
    newPresetHeader.style.marginBottom = '6px'; // 稍微增加底部間距 (原4px)
    newPresetHeader.style.padding = '0';

    const presetTitle = document.createElement('span');
    presetTitle.textContent = '快捷指令';
    presetTitle.style.fontWeight = '600';
    presetTitle.style.fontSize = '0.9em';
    presetTitle.style.color = '#4b5563'; // 深灰色標題

    const presetToggleBtn = document.createElement('button');
    presetToggleBtn.id = 'chatbot-preset-toggle-btn';
    presetToggleBtn.style.background = 'none';
    presetToggleBtn.style.border = 'none';
    presetToggleBtn.style.cursor = 'pointer';
    presetToggleBtn.style.padding = '4px';
    presetToggleBtn.style.color = '#4b5563';
    presetToggleBtn.innerHTML = window.isPresetQuestionsCollapsed
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' // 向下箭頭表示"顯示"
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>'; // 向上箭頭表示"隱藏"
    presetToggleBtn.title = window.isPresetQuestionsCollapsed ? "展開快捷指令" : "收起快捷指令";
    presetToggleBtn.onclick = function() {
      window.isPresetQuestionsCollapsed = !window.isPresetQuestionsCollapsed;
      updateChatbotUICallback(); // 呼叫主UI更新
    };

    const headerLeftGroup = document.createElement('div');
    headerLeftGroup.style.display = 'flex';
    headerLeftGroup.style.alignItems = 'center';
    headerLeftGroup.style.gap = '8px';
    headerLeftGroup.appendChild(presetTitle);
    headerLeftGroup.appendChild(presetToggleBtn);
    newPresetHeader.appendChild(headerLeftGroup);

    // 齒輪按鈕（模型配置）- 始終顯示
    const gearBtn = document.createElement('button');
    gearBtn.id = 'chatbot-model-gear-btn';
    gearBtn.title = '模型配置';
    gearBtn.innerHTML = '<i class="fa-solid fa-gear" style="color:#2563eb;font-size:16px;display:block;"></i>';
    gearBtn.style.display = 'flex';
    gearBtn.style.alignItems = 'center';
    gearBtn.style.justifyContent = 'center';
    gearBtn.style.background = 'none';
    gearBtn.style.border = 'none';
    gearBtn.style.cursor = 'pointer';
    gearBtn.style.padding = '2.5px';
    gearBtn.style.borderRadius = '50%';
    gearBtn.style.transition = 'background 0.16s, box-shadow 0.16s';
    gearBtn.onmouseover = function(){
      this.style.background = '#e0f2fe';
      this.style.boxShadow = '0 1.5px 6px 0 rgba(59,130,246,0.10)';
    };
    gearBtn.onmouseout = function(){
      this.style.background = 'none';
      this.style.boxShadow = 'none';
    };
    gearBtn.onclick = function(){
      // 開啟獨立的chatbot模型配置彈出視窗
      if (typeof window !== 'undefined' && window.ChatbotModelConfigModal) {
        window.ChatbotModelConfigModal.open();
      } else {
        console.warn('[Chatbot Gear] ChatbotModelConfigModal 不可用，回退到舊版選擇器');
        window.isModelSelectorOpen = true; // 設定全域狀態
        updateChatbotUICallback();        // 呼叫主UI更新
      }
    };
    newPresetHeader.appendChild(gearBtn);
    presetContainer.appendChild(newPresetHeader);

    const newPresetBody = document.createElement('div');
    newPresetBody.id = 'chatbot-preset-body';
    newPresetBody.style.display = 'flex';
    newPresetBody.style.flexWrap = 'wrap';
    newPresetBody.style.gap = '6px 8px';
    newPresetBody.style.transition = 'opacity 0.3s ease-out, max-height 0.4s ease-out, margin-bottom 0.4s ease-out, visibility 0.3s ease-out';
    newPresetBody.style.overflow = 'hidden';
    newPresetBody.style.width = '100%'; // 確保它佔據其父容器的全部寬度
    presetContainer.appendChild(newPresetBody);

    if (!parentElement) {
        console.error("ChatbotPresetQuestionsUI: Parent element for presetContainer is not provided or not found.");
        return null;
    }
    // 將 presetContainer 新增到指定的父元素
    parentElement.appendChild(presetContainer);


    // 填充預設問題按鈕
    const presetQuestions = (window.ChatbotPreset && window.ChatbotPreset.PRESET_QUESTIONS) ? window.ChatbotPreset.PRESET_QUESTIONS : [
      '總結本文', '有哪些關鍵公式？', '研究背景與意義？', '研究方法及發現？',
      '應用與前景？', '用通俗語言解釋全文', '生成思維導圖🧠', '生成流程圖🔄',
      '生成更多配圖🎨'
    ];
    presetQuestions.forEach(q => {
      const button = document.createElement('button');
      button.className = 'preset-btn';
      // 使用 encodeURIComponent/decodeURIComponent 來處理特殊字元
      button.onclick = function() {
        const text = decodeURIComponent(encodeURIComponent(q));
        // 對“生成更多配圖”做特殊處理：只幫使用者打出字首 [加入配圖]，不直接傳送複雜提示
        if (text.startsWith('生成更多配圖')) {
          const input = document.getElementById('chatbot-input');
          if (input) {
            input.value = '[加入配圖] ';
            input.focus();
          }
          return;
        }
        handlePresetQuestionCallback(text);
      };
      button.textContent = q;
      newPresetBody.appendChild(button);
    });

    // 自動收起邏輯 (依賴全域狀態 window.isPresetQuestionsCollapsed, window.presetAutoCollapseTriggeredForDoc, window.isModelSelectorOpen 和 ChatbotCore)
    let userMessageCount = 0;
    if (window.ChatbotCore && window.ChatbotCore.chatHistory) {
      userMessageCount = window.ChatbotCore.chatHistory.filter(m => m.role === 'user').length;
    }

    if (userMessageCount >= 3 &&
        currentDocId && window.presetAutoCollapseTriggeredForDoc && !window.presetAutoCollapseTriggeredForDoc[currentDocId] &&
        !window.isPresetQuestionsCollapsed &&
        !window.isModelSelectorOpen) {
      window.isPresetQuestionsCollapsed = true;
      window.presetAutoCollapseTriggeredForDoc[currentDocId] = true;
      // 按鈕的圖示和標題將在下一次 updateChatbotUICallback 呼叫時由 presetToggleBtn 自身邏輯更新
      // 但為了即時性，如果狀態因此改變，可以手動更新一下按鈕
       presetToggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
       presetToggleBtn.title = "展開快捷指令";
    }

    // 控制 chatbot-preset-body 和 presetContainer 的顯隱與動畫
    // (依賴全域狀態 window.isPresetQuestionsCollapsed, window.isModelSelectorOpen)
    if (window.isPresetQuestionsCollapsed || window.isModelSelectorOpen) {
      newPresetBody.style.opacity = '0';
      newPresetBody.style.maxHeight = '0';
      newPresetBody.style.marginBottom = '0';
      newPresetBody.style.visibility = 'hidden';
      presetContainer.style.boxShadow = 'none';
      presetContainer.style.background = 'transparent';
      presetContainer.style.paddingTop = '0px';    // 摺疊時移除垂直內邊距
      presetContainer.style.paddingBottom = '0px';
    } else {
      newPresetBody.style.opacity = '1';
      newPresetBody.style.maxHeight = '150px'; // 或者一個更合適的計算值
      newPresetBody.style.marginBottom = '0px'; // 或者根據需要調整
      newPresetBody.style.visibility = 'visible';
      presetContainer.style.boxShadow = 'none'; // 可以設定展開時的陰影
      presetContainer.style.paddingTop = '6px';     // 恢復垂直內邊距
      presetContainer.style.paddingBottom = '6px';

      // 背景漸變邏輯 (依賴父視窗背景色)
      const chatWindowBgElement = document.querySelector('#chatbot-modal .chatbot-window');
      let chatWinBg = 'rgb(255,255,255)'; // 預設背景
      if (chatWindowBgElement) {
          chatWinBg = getComputedStyle(chatWindowBgElement).getPropertyValue('background-color') || 'rgb(255,255,255)';
      }
      let opaqueBg = chatWinBg;
      if (opaqueBg.startsWith('rgba')) { // 轉換為不透明的rgb
          const parts = opaqueBg.match(/[\d.]+/g);
          if (parts && parts.length === 4) { // rgba(r,g,b,a)
              opaqueBg = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
          } else if (parts && parts.length === 3) { // 可能已經是 rgb 字串
              opaqueBg = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
          }
      } else if (opaqueBg === 'transparent') {
          opaqueBg = 'rgb(255,255,255)'; // 透明時的回退
      }
      presetContainer.style.background = `linear-gradient(to bottom, ${opaqueBg} 0%, ${opaqueBg} 70%, transparent 100%)`;
    }
    return presetContainer; // 返回建立的容器，主UI函式可以用它來計算版面
  }
};
