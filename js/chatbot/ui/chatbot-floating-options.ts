if (typeof window.ChatbotFloatingOptionsScriptLoaded === 'undefined') {
  /**
   * 聊天機器人應用的浮動高階選項欄 UI 管理模組。
   *
   * 主要功能：
   * 1. 定義高階選項的配置 (_chatbotOptionsConfig)。
   * 2. 建立選項欄的 HTML 結構並綁定互動事件 (createBar)。
   * 3. 更新選項欄中各個按鈕的顯示狀態，包括文字、樣式和可見性 (updateDisplay)。
   *
   * 使用方法：
   * - 在主 UI 初始化時，呼叫 ChatbotFloatingOptionsUI.createBar(parentElement, globalUpdateUICallback) 來建立並插入選項欄。
   * - 在主 UI 更新時，呼叫 ChatbotFloatingOptionsUI.updateDisplay() 來重新整理選項欄的狀態。
   */
  const _chatbotOptionsConfig = [
    { key: 'semanticGroups', texts: ['意群'], title: '檢視/搜尋意群', activeStyleColor: '#059669', isAction: true },
    { key: 'useContext', texts: ['上下文:關', '上下文:開'], values: [false, true], title: '切換是否使用對話歷史', activeStyleColor: '#1d4ed8' },
    { key: 'useReActMode', texts: ['ReAct'], activeStyleColor: '#9ca3af', isDisabled: true, title: 'ReAct框架（開發中）：推理+工具呼叫交織，智慧動態構建上下文' },
    { key: 'multiHopRetrieval', texts: ['檢索Agent:關', '檢索Agent:開'], values: [false, true], defaultKey: false, title: '開啟後自動啟用：多輪取材+流式顯示+意群分析+向量搜尋+重排', activeStyleColor: '#059669' },
    { key: 'summarySource', texts: ['提供全文:OCR', '提供全文:無', '提供全文:翻譯'], values: ['ocr', 'none', 'translation'], defaultKey: 'ocr', title: '切換總結時使用的文字源 (OCR/不使用文件內容/翻譯)', activeStyleColor: '#1d4ed8' },
    { key: 'interestPointsActive', texts: ['興趣點'], activeStyleColor: '#059669', isPlaceholder: true, title: '興趣點功能 (待實現)' },
    { key: 'memoryManagementActive', texts: ['記憶管理'], activeStyleColor: '#059669', isPlaceholder: true, title: '記憶管理功能 (待實現)' }
  ];

  /**
   * 建立浮動高階選項欄的HTML結構並綁定事件。
   * @param {HTMLElement} parentElement - 選項欄將被新增到的父容器。
   * @param {function} globalUpdateUICallback - 全域UI更新回撥函式，例如 window.ChatbotUI.updateChatbotUI。
   */
  function _createFloatingOptionsBar(parentElement, globalUpdateUICallback) {
    if (!parentElement || document.getElementById('chatbot-floating-options')) {
      return; // 如果父元素不存在或選項欄已存在，則不重複建立
    }

    const floatingOptionsContainer = document.createElement('div');
    floatingOptionsContainer.id = 'chatbot-floating-options';
    floatingOptionsContainer.style.cssText = `
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4px 0 8px 0;
      gap: 5px;
      font-size: 11px;
      color: #555;
      flex-wrap: wrap;
    `;

    _chatbotOptionsConfig.forEach((optConf, index) => {
      const optionButton = document.createElement('button');
      optionButton.id = `chatbot-option-${optConf.key}`;
      optionButton.style.cssText = `
        background: none;
        border: none;
        color: #4b5563;
        cursor: pointer;
        padding: 2px 4px;
        font-size: 11px;
        border-radius: 4px;
        transition: background-color 0.2s, color 0.2s;
      `;
      optionButton.title = optConf.title;

      optionButton.onclick = function() {
        if (optConf.isDisabled) {
          console.log(`${optConf.key} clicked, but is disabled.`);
          if (typeof ChatbotUtils !== 'undefined' && ChatbotUtils.showToast) {
            ChatbotUtils.showToast(`${optConf.texts[0]} 功能開發中，暫不可用。`, 'info', 2000);
          } else {
            alert(`${optConf.texts[0]} 功能開發中，暫不可用。`);
          }
          return; // 阻止後續邏輯執行
        }
        if (optConf.isPlaceholder) {
          console.log(`${optConf.key} clicked, placeholder for future feature.`);
          if (typeof ChatbotUtils !== 'undefined' && ChatbotUtils.showToast) {
            ChatbotUtils.showToast(`${optConf.texts[0]} 功能正在開發中。`, 'info', 2000);
          } else {
            alert(`${optConf.texts[0]} 功能正在開發中。`);
          }
        } else if (optConf.isAction && optConf.key === 'semanticGroups') {
          if (window.SemanticGroupsUI && typeof window.SemanticGroupsUI.toggle === 'function') {
            window.SemanticGroupsUI.toggle();
          } else if (typeof ChatbotUtils !== 'undefined' && ChatbotUtils.showToast) {
            ChatbotUtils.showToast('意群面板未就緒', 'warning', 2000);
          } else {
            alert('意群面板未就緒');
          }
        } else {
          const currentValue = window.chatbotActiveOptions[optConf.key];
          if (optConf.key === 'useContext') {
            window.chatbotActiveOptions.useContext = !currentValue;
          } else if (optConf.key === 'useReActMode') {
            window.chatbotActiveOptions.useReActMode = !currentValue;
            // ReAct模式開啟時，自動關閉傳統多輪檢索（避免衝突）
            if (window.chatbotActiveOptions.useReActMode) {
              window.chatbotActiveOptions.multiHopRetrieval = false;
            }
          } else if (optConf.key === 'contentLengthStrategy') {
            window.chatbotActiveOptions.contentLengthStrategy = currentValue === optConf.values[0] ? optConf.values[1] : optConf.values[0];
          } else if (optConf.key === 'multiHopRetrieval') {
            window.chatbotActiveOptions.multiHopRetrieval = !currentValue;
            // 傳統多輪檢索開啟時，自動關閉ReAct模式（避免衝突）
            if (window.chatbotActiveOptions.multiHopRetrieval) {
              window.chatbotActiveOptions.useReActMode = false;
            }
          } else if (optConf.key === 'streamingRetrieval') {
            window.chatbotActiveOptions.streamingRetrieval = !currentValue;
          } else if (optConf.key === 'summarySource') {
            const currentIndex = optConf.values.indexOf(currentValue);
            const nextIndex = (currentIndex + 1) % optConf.values.length;
            window.chatbotActiveOptions.summarySource = optConf.values[nextIndex];
          }
        }
        if (typeof globalUpdateUICallback === 'function') {
          globalUpdateUICallback(); // 更新UI以反映選項變化
        } else {
          console.error("ChatbotFloatingOptionsUI: globalUpdateUICallback is not provided or not a function.");
        }
      };
      floatingOptionsContainer.appendChild(optionButton);

      if (index < _chatbotOptionsConfig.length - 1) {
        const nextOptConf = _chatbotOptionsConfig[index + 1];
        const separator = document.createElement('span');
        separator.id = `chatbot-separator-${nextOptConf.key}`;
        separator.textContent = '丨';
        separator.style.color = '#cbd5e1';
        separator.style.margin = '0 2px';
        floatingOptionsContainer.appendChild(separator);
      }
    });

    // 將建立的選項欄插入到父容器的合適位置
    const selectedImagesPreview = parentElement.querySelector('#chatbot-selected-images-preview');
    if (selectedImagesPreview) {
      parentElement.insertBefore(floatingOptionsContainer, selectedImagesPreview);
    } else {
      const mainInputDiv = parentElement.querySelector('div[style*="display:flex;align-items:center;gap:12px;"]');
      if (mainInputDiv) {
        parentElement.insertBefore(floatingOptionsContainer, mainInputDiv);
      } else {
        parentElement.appendChild(floatingOptionsContainer); // Fallback
      }
    }
  }

  /**
   * 更新浮動高階選項欄中各個按鈕的顯示狀態（文字、樣式、可見性）。
   */
  function _updateFloatingOptionsDisplay() {
    const floatingOptionsContainer = document.getElementById('chatbot-floating-options');
    if (!floatingOptionsContainer) return;

    _chatbotOptionsConfig.forEach(optConf => {
      const button = document.getElementById(`chatbot-option-${optConf.key}`);
      // 注意：分隔符ID是基於 *下一個* 選項的key來建立的，所以查詢ID為 chatbot-separator-NEXT_KEY
      // 但是其顯示與否是基於 *當前* 按鈕的顯示狀態

      if (button) {
        let shouldBeVisible = true;
        // 處理 contentLengthStrategy 選項的可見性依賴
        if (optConf.dependsOn) {
          const dependencyKey = optConf.dependsOn;
          const dependencyValue = window.chatbotActiveOptions[dependencyKey];
          shouldBeVisible = dependencyValue !== optConf.dependsValueNot;

          // 特殊邏輯：當全文來源是OCR或翻譯，且內容較短時，不顯示"全文策略"按鈕
          if (shouldBeVisible && optConf.key === 'contentLengthStrategy' && (dependencyValue === 'ocr' || dependencyValue === 'translation')) {
            let relevantContent = '';
            if (window.ChatbotCore && typeof window.ChatbotCore.getCurrentDocContent === 'function') {
              const docContentInfo = window.ChatbotCore.getCurrentDocContent();
              if (docContentInfo) {
                if (dependencyValue === 'ocr') relevantContent = docContentInfo.ocr || '';
                else if (dependencyValue === 'translation') relevantContent = docContentInfo.translation || '';
              }
            }
            // 如果內容長度小於或等於50000字元，則不顯示"全文策略"按鈕
            if (relevantContent.length <= 50000) {
              shouldBeVisible = false;
            }
          }
        }

        // 語義分組按鈕：僅當已有意群資料時顯示
        if (optConf.key === 'semanticGroups') {
          const hasGroups = !!(window.data && Array.isArray(window.data.semanticGroups) && window.data.semanticGroups.length > 0);
          shouldBeVisible = hasGroups;
        }

        // 智慧檢索按鈕：僅當文件足夠長時顯示
        if (optConf.key === 'multiHopRetrieval') {
          let contentLength = 0;
          if (window.ChatbotCore && typeof window.ChatbotCore.getCurrentDocContent === 'function') {
            const docContentInfo = window.ChatbotCore.getCurrentDocContent();
            if (docContentInfo) {
              const translationText = docContentInfo.translation || '';
              const ocrText = docContentInfo.ocr || '';
              const chunkCandidates = [];
              if (Array.isArray(docContentInfo.translatedChunks)) {
                chunkCandidates.push(...docContentInfo.translatedChunks);
              }
              if (Array.isArray(docContentInfo.ocrChunks)) {
                chunkCandidates.push(...docContentInfo.ocrChunks);
              }

              contentLength = Math.max(translationText.length, ocrText.length);
              if (contentLength < 50000 && chunkCandidates.length > 0) {
                const chunkLength = chunkCandidates.reduce((sum, chunk) => sum + (typeof chunk === 'string' ? chunk.length : 0), 0);
                contentLength = Math.max(contentLength, chunkLength);
              }
            }
          }

          // 如果文件長度小於50000，則隱藏智慧檢索按鈕
          if (contentLength < 50000) {
            shouldBeVisible = false;
          }
        }

        button.style.display = shouldBeVisible ? '' : 'none';
      }
    });

    // 第二遍：更新所有分隔符的顯示狀態
    // 分隔符只在兩個連續可見按鈕之間顯示
    _chatbotOptionsConfig.forEach((optConf, index) => {
      if (index < _chatbotOptionsConfig.length - 1) {
        const currentButton = document.getElementById(`chatbot-option-${optConf.key}`);
        const nextOptConf = _chatbotOptionsConfig[index + 1];
        const nextButton = document.getElementById(`chatbot-option-${nextOptConf.key}`);
        const separator = document.getElementById(`chatbot-separator-${nextOptConf.key}`);

        if (separator) {
          // 只有當前按鈕和下一個按鈕都可見時，才顯示分隔符
          const currentVisible = currentButton && currentButton.style.display !== 'none';
          const nextVisible = nextButton && nextButton.style.display !== 'none';
          separator.style.display = (currentVisible && nextVisible) ? '' : 'none';
        }
      }
    });

    // 第三遍：更新按鈕文字和樣式
    _chatbotOptionsConfig.forEach(optConf => {
      const button = document.getElementById(`chatbot-option-${optConf.key}`);

      if (!button || button.style.display === 'none') {
        return; // 跳過不可見的按鈕
      }

      const currentOptionValue = window.chatbotActiveOptions[optConf.key];
      let currentText = '';
      let color = '#4b5563';
      let fontWeight = 'normal';
      let isActiveStyle = false;

      if (optConf.isAction && optConf.key === 'semanticGroups') {
        const count = (window.data && Array.isArray(window.data.semanticGroups)) ? window.data.semanticGroups.length : 0;
        currentText = count > 0 ? `意群(${count})` : '意群';
        // 顯示為啟用風格以便更醒目（當有意群時）
        if (count > 0) { color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true; }
      } else if (optConf.isPlaceholder) {
        currentText = optConf.texts[0];
      } else if (optConf.isDisabled) {
        // 禁用狀態：固定顯示灰色，無法切換
        currentText = optConf.texts[0];
        color = '#9ca3af';  // 灰色
        fontWeight = 'normal';
        isActiveStyle = false;
        button.style.opacity = '0.6';  // 降低透明度
        button.style.cursor = 'not-allowed';  // 禁用游標
      } else if (optConf.key === 'useContext') {
        currentText = currentOptionValue ? optConf.texts[1] : optConf.texts[0];
        if (currentOptionValue) { color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true; }
      } else if (optConf.key === 'useReActMode') {
        currentText = currentOptionValue ? optConf.texts[1] : optConf.texts[0];
        if (currentOptionValue) { color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true; }
      } else if (optConf.key === 'contentLengthStrategy') {
        currentText = currentOptionValue === optConf.defaultKey ? optConf.texts[0] : optConf.texts[1];
        if (currentOptionValue !== optConf.defaultKey) {
           color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true;
        }
      } else if (optConf.key === 'multiHopRetrieval') {
        currentText = currentOptionValue ? optConf.texts[1] : optConf.texts[0];
        if (currentOptionValue) { color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true; }
      } else if (optConf.key === 'streamingRetrieval') {
        currentText = currentOptionValue ? optConf.texts[1] : optConf.texts[0];
        if (currentOptionValue) { color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true; }
      } else if (optConf.key === 'summarySource') {
        const currentIndex = optConf.values.indexOf(currentOptionValue);
        currentText = optConf.texts[currentIndex] || optConf.texts[0];
        // 對於 summarySource, 'ocr' (index 0) 是預設狀態，'none' (index 1) 和 'translation' (index 2) 算作啟用狀態
        if (currentOptionValue !== optConf.defaultKey) {
            color = optConf.activeStyleColor; fontWeight = '600'; isActiveStyle = true;
        }
      }
      button.textContent = currentText;
      button.style.color = color;
      button.style.fontWeight = fontWeight;

      if (isActiveStyle) {
          button.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; // 淡藍色背景表示啟用
      } else {
          button.style.backgroundColor = 'transparent';
      }
    });
  }

  // 將核心函式掛載到 window 物件和 ChatbotFloatingOptionsUI 名稱空間下，便於外部呼叫
  window.ChatbotFloatingOptionsUI = {
    createBar: _createFloatingOptionsBar,
    updateDisplay: _updateFloatingOptionsDisplay,
    // 也暴露配置，以防外部需要參考（例如測試或進一步定製）
    // 但通常情況下，外部不應直接修改 _chatbotOptionsConfig
    _internalConfig: _chatbotOptionsConfig
  };
  window.ChatbotFloatingOptionsScriptLoaded = true;
}
