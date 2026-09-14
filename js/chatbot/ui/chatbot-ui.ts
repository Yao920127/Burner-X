// chatbot-ui.js

/**
 * 全域函式，強制聊天機器人介面彈出（或切換到）模型選擇器。
 *
 * 主要邏輯：
 * 1. 設定 `window.isModelSelectorOpen = true`。
 * 2. 呼叫 `ChatbotUI.updateChatbotUI()` 重新整理介面以顯示模型選擇器。
 */
window.showModelSelectorForChatbot = function() {
  window.isModelSelectorOpen = true;
  if (typeof window.ChatbotUI === 'object' && typeof window.ChatbotUI.updateChatbotUI === 'function') {
    window.ChatbotUI.updateChatbotUI();
  }
};

// 全域狀態變數
window.isChatbotPositionedLeft = localStorage.getItem('chatbotPosition') === 'left' || false;
window.isPresetQuestionsCollapsed = false; // 預設問題預設展開
window.presetAutoCollapseTriggeredForDoc = {}; // 記錄文件是否已觸發自動收起

// 全屏和寬度管理狀態
window.isChatbotFullscreen = localStorage.getItem('chatbotFullscreen') === 'true' || false;
window.forceChatbotWidthReset = false; // 是否強制重置聊天視窗寬度
window.lastIsChunkCompareActive = undefined; // 上一次 Chunk Compare 分頁的啟用狀態
window.chatbotInitialLoad = true; // 是否為首次載入

// 浮動模式狀態
window.isChatbotFloating = localStorage.getItem('chatbotFloating') === 'true' || false;
window.chatbotFloatingPosition = JSON.parse(localStorage.getItem('chatbotFloatingPosition') || '{"x": 100, "y": 100}');
window.chatbotFloatingSize = JSON.parse(localStorage.getItem('chatbotFloatingSize') || '{"width": 420, "height": 580}');

// 高階聊天功能選項
window.chatbotActiveOptions = {
  useContext: true, // 是否使用上下文
  useReActMode: false, // 是否啟用ReAct框架（推理+工具呼叫）
  enableSemanticFeatures: true, // 是否啟用意群和向量搜尋功能（預設開啟）
  multiHopRetrieval: false, // 是否啟用多輪取材（先選片段再回答）
  contentLengthStrategy: 'default', // 內容長度策略: 'default', 'segmented'
  summarySource: 'ocr',   // 總結來源: 'ocr', 'none', 'translation'
  interestPointsActive: false,    // 興趣點功能 (佔位)
  memoryManagementActive: false   // 記憶管理功能 (佔位)
};

/**
 * 處理暫停對話按鈕的點選事件。
 *
 * 主要邏輯：
 * 1. 呼叫中止控制器來停止正在進行的請求。
 * 2. 更新UI狀態。
 */
function handleChatbotStop() {
  if (window.chatbotAbortController) {
    window.chatbotAbortController.abort();
    console.log('[Chatbot] 使用者中止了對話');
  }
}

/**
 * 處理聊天機器人傳送按鈕的點選事件。
 *
 * 主要邏輯：
 * 1. 獲取輸入欄位內容和已選圖片。
 * 2. 如果文字和圖片均為空，則不傳送。
 * 3. 構造訊息內容 (支援文字和圖片混合)。
 * 4. 若使用 PromptConstructor，則增強使用者輸入。
 * 5. 清空輸入欄位和已選圖片預覽。
 * 6. 呼叫 `ChatbotCore.sendChatbotMessage` 傳送訊息。
 */
function handleChatbotSend() {
  const input = document.getElementById('chatbot-input');
  if (!input) return;
  let val = input.value.trim();

  const selectedImages = window.ChatbotImageUtils.selectedChatbotImages || [];

  if (!val && selectedImages.length === 0) return;

  let messageContent = [];
  let displayMessageContent = []; // 用於UI顯示，可能包含縮圖

  if (val) {
    messageContent.push({ type: 'text', text: val });
    displayMessageContent.push({ type: 'text', text: val });
  }

  selectedImages.forEach(img => {
    if (img.fullBase64) {
      messageContent.push({
        type: 'image_url',
        image_url: { url: img.fullBase64 }
      });
      displayMessageContent.push({
        type: 'image_url',
        image_url: {
          url: img.thumbnailBase64 || img.fullBase64, // 優先用縮圖顯示
          fullUrl: img.fullBase64, // 點選放大用原圖
          originalSrc: img.originalSrc
        }
      });
    }
  });

  // 相容舊的單模態模型，如果只有一個文字部分，則直接傳送文字字串
  let sendVal = messageContent.length === 1 && messageContent[0].type === 'text' ? messageContent[0].text : messageContent;
  let displayVal = displayMessageContent.length === 1 && displayMessageContent[0].type === 'text' ? displayMessageContent[0].text : displayMessageContent;

  if (window.PromptConstructor && typeof window.PromptConstructor.enhanceUserPrompt === 'function') {
    sendVal = window.PromptConstructor.enhanceUserPrompt(sendVal);
  }

  input.value = '';
  window.ChatbotImageUtils.selectedChatbotImages = [];
  window.ChatbotImageUtils.updateSelectedImagesPreview();

  window.ChatbotCore.sendChatbotMessage(sendVal, updateChatbotUI, null, displayVal);
}

/**
 * 處理預設問題的點選事件 (UI層面)。
 *
 * 主要邏輯：
 * 1. 將預設問題填充到輸入欄位。
 * 2. 呼叫 `handleChatbotSend` 傳送。
 *
 * @param {string} q - 預設問題文字。
 */
// handlePresetQuestion 已在 ChatbotPreset 中定義（包含 Mermaid 和其他 prompt 注入邏輯）
// 不再在此重複定義，避免覆蓋

/**
 * 更新聊天機器人介面的核心函式。
 *
 * 主要邏輯：
 * 1. **顯隱控制**：根據 `isChatbotOpen` 控制 modal 和 fab。
 * 2. **寬度/全屏管理**：根據 `isChatbotFullscreen` 和 `forceChatbotWidthReset` 等狀態調整視窗大小和樣式。
 * 3. **模型資訊獲取**：從 `ChatbotCore` 獲取模型配置。
 * 4. **模型選擇器模式** (`isModelSelectorOpen`)：
 *    - 若為自定義模型且 `isModelSelectorOpen` 為 true，則呼叫 `ChatbotModelSelectorUI.render` 顯示模型選擇器。
 *    - 否則，確保模型選擇器被移除，聊天區和預設問題區可見。
 * 5. **預設問題區渲染**：呼叫 `ChatbotPresetQuestionsUI.render`。
 * 6. **聊天訊息渲染**：呼叫 `ChatbotMessageRenderer` 模組渲染歷史訊息和載入指示器。
 * 7. **滾動行為**：智慧滾動聊天區域，確保新訊息可見或保持使用者當前視口。
 * 8. **Mermaid圖渲染**：呼叫 `ChatbotRenderingUtils.renderAllMermaidBlocks`。
 * 9. **輸入欄位與傳送按鈕狀態更新**：根據載入狀態啟用/禁用。
 * 10. **免責宣告與清空歷史按鈕更新**。
 * 11. **浮動高階選項按鈕更新**：呼叫 `_updateFloatingOptionsDisplay`。
 */
function updateChatbotUI() {
  const modal = document.getElementById('chatbot-modal');
  const fab = document.getElementById('chatbot-fab');
  if (!modal || !fab) return;

  // 檢測沉浸式模式
  const inImmersive = !!(window.ImmersiveLayout && typeof window.ImmersiveLayout.isActive === 'function' && window.ImmersiveLayout.isActive());
  // 在沉浸式模式下強制禁用浮動模式
  if (inImmersive && window.isChatbotFloating) {
    window.isChatbotFloating = false;
  }

  const currentDocId = window.ChatbotCore && typeof window.ChatbotCore.getCurrentDocId === 'function' ? window.ChatbotCore.getCurrentDocId() : 'default_doc';
  const fullscreenButton = document.getElementById('chatbot-fullscreen-toggle-btn');

  // --- 寬度重置邏輯 ---
  if (window.chatbotInitialLoad) {
    window.forceChatbotWidthReset = true;
    window.chatbotInitialLoad = false;
  }
  const chatbotWindowForCheck = modal.querySelector('.chatbot-window');
  const isOnHistoryDetailForCheck = window.location.pathname.includes('history_detail.html');
  const chunkCompareTabElementForCheck = document.getElementById('tab-chunk-compare');
  const currentChunkCompareActive = isOnHistoryDetailForCheck && chunkCompareTabElementForCheck && chunkCompareTabElementForCheck.classList.contains('active');
  if (window.lastIsChunkCompareActive !== undefined && window.lastIsChunkCompareActive !== currentChunkCompareActive) {
    window.forceChatbotWidthReset = true;
  }

  // --- 聊天視窗顯隱與樣式調整 ---
  if (window.isChatbotOpen) {
    fab.style.display = 'none';
    const chatbotWindow = modal.querySelector('.chatbot-window');
    if (chatbotWindow) {
      if (window.isChatbotFullscreen) {
        // 全屏樣式
        modal.style.display = 'block';
        modal.style.position = 'fixed';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.top = '0px';
        modal.style.left = '0px';
        modal.style.bottom = '0px';
        modal.style.right = '0px';
        modal.style.padding = '0px';
        modal.style.margin = '0px';
        modal.style.border = 'none';
        modal.style.background = 'var(--chat-bg,#ffffff)';
        modal.style.pointerEvents = 'auto';
        modal.style.zIndex = '100000';

        chatbotWindow.style.position = 'absolute';
        chatbotWindow.style.width = '100%';
        chatbotWindow.style.height = '100%';
        chatbotWindow.style.minWidth = '100%';
        chatbotWindow.style.minHeight = '100%';
        chatbotWindow.style.maxWidth = '100%';
        chatbotWindow.style.maxHeight = '100%';
        chatbotWindow.style.top = '0px';
        chatbotWindow.style.left = '0px';
        chatbotWindow.style.right = '0px';
        chatbotWindow.style.bottom = '0px';
        chatbotWindow.style.borderRadius = '0px';
        chatbotWindow.style.padding = '0px';
        chatbotWindow.style.margin = '0px';
        chatbotWindow.style.border = 'none';
        chatbotWindow.style.boxSizing = 'border-box';
        chatbotWindow.style.overflow = 'hidden';
        chatbotWindow.style.resize = 'none';

        if (fullscreenButton) {
          fullscreenButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
          fullscreenButton.title = "退出全屏";
        }
      } else {
        // 非全屏樣式
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.width = 'auto';
        modal.style.height = 'auto';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.bottom = '0';
        modal.style.right = '0';
        modal.style.padding = '0px';
        modal.style.margin = '0px';
        modal.style.border = 'none';
        modal.style.background = 'transparent';
        modal.style.pointerEvents = 'none';

        if (window.isChatbotFloating) {
          // 浮動模式
          chatbotWindow.style.position = 'fixed';
          chatbotWindow.style.left = window.chatbotFloatingPosition.x + 'px';
          chatbotWindow.style.top = window.chatbotFloatingPosition.y + 'px';
          chatbotWindow.style.right = 'auto';
          chatbotWindow.style.bottom = 'auto';
          chatbotWindow.style.width = window.chatbotFloatingSize.width + 'px';
          chatbotWindow.style.height = window.chatbotFloatingSize.height + 'px';
          chatbotWindow.style.maxWidth = '90vw';
          chatbotWindow.style.maxHeight = '90vh';
          chatbotWindow.style.minWidth = '320px';
          chatbotWindow.style.minHeight = '400px';
          // 樣式由 CSS .chatbot-window.floating-mode 控制
          chatbotWindow.style.boxShadow = '';
          chatbotWindow.style.zIndex = '100001';
          chatbotWindow.classList.add('floating-mode');
        } else {
          // 固定位置模式
          chatbotWindow.classList.remove('floating-mode');
          chatbotWindow.style.position = 'absolute';
          let newMaxWidth = '720px';
          let newWidth = '92vw';
          let newMinHeight = 'calc(520px * 1.1)';
          let newMaxHeight = 'calc(85vh * 1.1)';

          const isOnHistoryDetail = window.location.pathname.includes('history_detail.html');
          const chunkCompareTabElement = document.getElementById('tab-chunk-compare');
          const isChunkCompareActive = isOnHistoryDetail && chunkCompareTabElement && chunkCompareTabElement.classList.contains('active');

          if (isChunkCompareActive) {
            newMinHeight = 'calc(520px * 1.25)';
            newMaxHeight = '99vh';
            newMaxWidth = 'calc(720px * 0.90)';
            newWidth = 'calc(92vw * 0.90)';
          }

          if (window.forceChatbotWidthReset || !chatbotWindow.style.width.endsWith('px')) {
            chatbotWindow.style.width = newWidth;
          }
          chatbotWindow.style.maxWidth = newMaxWidth;
          chatbotWindow.style.minWidth = `calc(${newWidth} * 0.32)`;
          chatbotWindow.style.minHeight = newMinHeight;
          chatbotWindow.style.maxHeight = newMaxHeight;
          if (window.forceChatbotWidthReset || !chatbotWindow.style.height.endsWith('px')) {
              chatbotWindow.style.height = '';
          }

          if (window.isChatbotPositionedLeft) {
            chatbotWindow.style.left = '44px';
            chatbotWindow.style.right = 'auto';
          } else {
            chatbotWindow.style.right = '44px';
            chatbotWindow.style.left = 'auto';
          }
          chatbotWindow.style.top = 'auto';
          chatbotWindow.style.bottom = '44px';
          // 樣式由 CSS .chatbot-window 控制
          chatbotWindow.style.borderRadius = '';
          chatbotWindow.style.boxShadow = '';
        }

        chatbotWindow.style.padding = '';
        chatbotWindow.style.margin = '';
        chatbotWindow.style.border = '';
        chatbotWindow.style.boxSizing = 'border-box';
        chatbotWindow.style.overflow = 'auto';
        chatbotWindow.style.resize = 'none'; // 禁用預設resize，使用自定義拖拽

        if (fullscreenButton) {
          fullscreenButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
          fullscreenButton.title = "全屏模式";
        }
      }
    }
  } else {
    modal.style.display = 'none';
    // 在沉浸式模式下不顯示 FAB，以免與沉浸版面衝突
    fab.style.display = inImmersive ? 'none' : 'block';
  }
  window.forceChatbotWidthReset = false;
  window.lastIsChunkCompareActive = currentChunkCompareActive;

  const posToggleBtn = document.getElementById('chatbot-position-toggle-btn');
  if (posToggleBtn) {
    if (window.isChatbotFloating) {
      // 浮動模式下隱藏位置切換按鈕
      posToggleBtn.style.display = 'none';
    } else {
      posToggleBtn.style.display = 'flex';
      if (window.isChatbotPositionedLeft) {
        posToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline><path d="M20 4v16"></path></svg>`;
        posToggleBtn.title = "切換到右下角";
      } else {
        posToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline><path d="M4 4v16"></path></svg>`;
        posToggleBtn.title = "切換到左下角";
      }
    }
  }

  const floatToggleBtn = document.getElementById('chatbot-float-toggle-btn');
  if (floatToggleBtn) {
    // 在沉浸式模式隱藏浮動切換按鈕
    if (inImmersive) {
      floatToggleBtn.style.display = 'none';
    } else {
      floatToggleBtn.style.display = 'flex';
    }
    if (window.isChatbotFloating) {
      floatToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>`;
      floatToggleBtn.title = "固定模式";
    } else {
      floatToggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
      floatToggleBtn.title = "浮動模式";
    }
  }

  const chatBody = document.getElementById('chatbot-body');
  const chatbotPresetHeader = document.getElementById('chatbot-preset-header');
  const chatbotPresetBody = document.getElementById('chatbot-preset-body');
  let modelSelectorDiv = document.getElementById('chatbot-model-selector');

  const existingPresetContainer = document.getElementById('chatbot-preset-container');
  if (existingPresetContainer) existingPresetContainer.remove();

  const chatbotWindow = modal.querySelector('.chatbot-window');
  if (!chatbotWindow) {
    console.error("Chatbot UI: .chatbot-window not found for preset container.");
    return;
  }

  let isCustomModel = false;
  let availableModels = [];
  let currentSettings = {};
  try {
    // 快取配置,避免流式更新時頻繁載入
    // 只在模型選擇器開啟或快取失效時重新獲取
    if (!window._cachedChatbotConfig || window.isModelSelectorOpen) {
      window._cachedChatbotConfig = window.ChatbotCore.getChatbotConfig();
    }
    const config = window._cachedChatbotConfig;
    currentSettings = config.settings || {};
    isCustomModel = config.model === 'custom' || (typeof config.model === 'string' && config.model.startsWith('custom_source_'));
    availableModels = config.siteSpecificAvailableModels || [];
  } catch (e) {
    console.error("Error getting chatbot config for UI:", e);
  }

  const presetContainer = window.ChatbotPresetQuestionsUI.render(
    chatbotWindow,
    isCustomModel,
    currentDocId,
    updateChatbotUI,
    window.ChatbotPreset?.handlePresetQuestion || window.handlePresetQuestion
  );

  chatbotWindow.appendChild(presetContainer);

  let userMessageCount = 0;
  if (window.ChatbotCore && window.ChatbotCore.chatHistory) {
    userMessageCount = window.ChatbotCore.chatHistory.filter(m => m.role === 'user').length;
  }

  if (userMessageCount >= 3 &&
      !window.presetAutoCollapseTriggeredForDoc[currentDocId] &&
      !window.isPresetQuestionsCollapsed &&
      !window.isModelSelectorOpen) {
    window.isPresetQuestionsCollapsed = true;
    window.presetAutoCollapseTriggeredForDoc[currentDocId] = true;
    const presetToggleBtn = presetContainer.querySelector('#chatbot-preset-toggle-btn');
    if (presetToggleBtn) {
      presetToggleBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      presetToggleBtn.title = "展開快捷指令";
    }
  }

  // 獲取 mainContentArea 元素
  const mainContentArea = document.getElementById('chatbot-main-content-area');

  if (mainContentArea) {
    let current_padding_top_for_main_content_area = 12;
    if (presetContainer && presetContainer.style.display !== 'none' && presetContainer.offsetHeight) {
        current_padding_top_for_main_content_area = presetContainer.offsetHeight;
    }
    mainContentArea.style.paddingTop = current_padding_top_for_main_content_area + 'px';

    // 僅在“固定模式”下根據內容自適應高度；浮動/全屏不改動使用者設定的尺寸
    if (!window.isChatbotFloating && !window.isChatbotFullscreen) {
      const titleBar = document.getElementById('chatbot-title-bar');
      const inputContainer = document.getElementById('chatbot-input-container');

      if (titleBar && inputContainer && chatbotWindow) {
          const h_title_bar = titleBar.offsetHeight;
          const h_input_container = inputContainer.offsetHeight;
          const h_chat_body_target = 250;

          const desired_window_height = h_title_bar + current_padding_top_for_main_content_area + h_chat_body_target + h_input_container;

          const min_win_h_px = parseFloat(getComputedStyle(chatbotWindow).minHeight) || 520;
          const max_win_h_px = parseFloat(getComputedStyle(chatbotWindow).maxHeight) || (0.85 * window.innerHeight);

          chatbotWindow.style.height = Math.max(min_win_h_px, Math.min(max_win_h_px, desired_window_height)) + 'px';
      }
    }
  }

  if (isCustomModel && window.isModelSelectorOpen) {
    if (window.ChatbotModelSelectorUI && typeof window.ChatbotModelSelectorUI.render === 'function') {
      window.ChatbotModelSelectorUI.render(mainContentArea, chatBody, availableModels, currentSettings, updateChatbotUI);
    } else {
      console.error("ChatbotModelSelectorUI.render is not available.");
    }
    return;
  } else {
    const existingModelSelectorDiv = document.getElementById('chatbot-model-selector');
    if (existingModelSelectorDiv) existingModelSelectorDiv.remove();
    if (presetContainer) presetContainer.style.display = '';
    if (chatBody) chatBody.style.display = '';
  }
  if (chatBody) {
    const oldScrollTop = chatBody.scrollTop;
    const oldScrollHeight = chatBody.scrollHeight;
    const oldClientHeight = chatBody.clientHeight;

    // Phase 3.5 提前定義訊息計數（用於後續滾動邏輯）
    // 使用統一的狀態管理物件，避免全域變數汙染
    if (!window.ChatbotRenderState) {
      window.ChatbotRenderState = { lastRenderedMessageCount: 0 };
    }
    const currentMessageCount = window.ChatbotCore.chatHistory.length;
    const lastRenderedCount = window.ChatbotRenderState.lastRenderedMessageCount || 0;

    let docName = 'unknown_doc';
    let docId = 'unknown_doc'; // 完整的 docId，用於 draw.io 等功能
    let dataForMindmap = { images: [], ocr: '', translation: '' };
    if (window.ChatbotCore && typeof window.ChatbotCore.getCurrentDocContent === 'function') {
        const currentDoc = window.ChatbotCore.getCurrentDocContent();
        if (currentDoc) {
            docName = currentDoc.name || 'unknown_doc';
            dataForMindmap = {
                images: currentDoc.images || [],
                ocr: currentDoc.ocr || '',
                translation: currentDoc.translation || ''
            };
        }
    }
    // 獲取完整的 docId（包含文件名、圖片數量、OCR長度、翻譯長度）
    if (window.ChatbotCore && typeof window.ChatbotCore.getCurrentDocId === 'function') {
        docId = window.ChatbotCore.getCurrentDocId();
    }

    if (window.ChatbotMessageRenderer) {
        // Phase 3.5 增量渲染: 只渲染變化的訊息，避免重新渲染整個歷史

        // 如果是流式更新（訊息數量沒變），只更新最後一條訊息
        if (window.ChatbotCore.isChatbotLoading && currentMessageCount === lastRenderedCount && currentMessageCount > 0) {
          const lastMessage = window.ChatbotCore.chatHistory[currentMessageCount - 1];
          const lastMessageContainer = chatBody.querySelector(`.assistant-message[data-message-index="${currentMessageCount - 1}"]`);

          // 檢查是否需要完整渲染（reasoning 第一次出現）
          let needFullRender = false;
          if (lastMessage.reasoningContent && lastMessageContainer) {
            const reasoningBlockId = `reasoning-block-${currentMessageCount - 1}`;
            const reasoningBlock = lastMessageContainer.querySelector(`#${reasoningBlockId}`);
            if (!reasoningBlock) {
              needFullRender = true; // reasoning 塊不存在，需要完整渲染
            }
          }

          // 如果需要完整渲染，跳過增量更新
          if (!needFullRender && lastMessageContainer && lastMessage.role === 'assistant') {
            // 0. 更新 ReAct 視覺化 (reactLog) - 增量追加
            if (lastMessage.reactLog && lastMessage.reactLog.length > 0) {
              const vizId = `react-viz-${currentMessageCount - 1}`;
              let vizContainer = lastMessageContainer.querySelector(`#${vizId}`);
              
              // 如果容器不存在，說明是第一次出現 ReAct 日誌，需要完整渲染
              if (!vizContainer) {
                needFullRender = true;
              } else {
                // 增量更新步驟
                const stepsContainer = vizContainer.querySelector('.react-steps-container');
                if (stepsContainer) {
                  const currentStepsCount = stepsContainer.children.length;
                  const newStepsCount = lastMessage.reactLog.length;
                  
                  if (newStepsCount > currentStepsCount) {
                    // 追加新步驟
                    const stepsToAdd = lastMessage.reactLog.slice(currentStepsCount);
                    let newStepsHtml = '';
                    
                    stepsToAdd.forEach((step, i) => {
                        let icon = '';
                        let title = '';
                        let typeClass = '';
                        let content = '';
                        const stepIndex = currentStepsCount + i + 1;

                        if (step.type === 'thought') {
                            icon = 'carbon:idea';
                            title = `Thought ${step.iteration || stepIndex}`;
                            typeClass = 'step-thought';
                            content = step.content;
                        } else if (step.type === 'action') {
                            icon = 'carbon:tools';
                            title = `Action ${step.iteration || stepIndex}`;
                            typeClass = 'step-action';
                            content = `Tool: ${step.tool}\nInput: ${JSON.stringify(step.params, null, 2)}`;
                        } else if (step.type === 'observation') {
                            icon = 'carbon:view';
                            title = `Observation ${step.iteration || stepIndex}`;
                            typeClass = 'step-observation';
                            content = typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2);
                            if (content.length > 500) content = content.slice(0, 500) + '... (truncated)';
                        }

                        if (content) {
                            content = window.ChatbotUtils.escapeHtml(content);
                            // 新增 slideIn 動畫
                            newStepsHtml += `
                                <div class="react-step-item ${typeClass}" style="animation: slideIn 0.3s ease-out forwards;">
                                    <div class="react-step-header">
                                        <iconify-icon icon="${icon}"></iconify-icon>
                                        <span>${title}</span>
                                    </div>
                                    <div class="react-step-content">${content}</div>
                                </div>
                            `;
                        }
                    });
                    
                    if (newStepsHtml) {
                        stepsContainer.insertAdjacentHTML('beforeend', newStepsHtml);
                        stepsContainer.scrollTop = stepsContainer.scrollHeight;
                        
                        // 更新狀態徽章
                        const statusBadge = vizContainer.querySelector('.react-status-badge');
                        if (statusBadge) {
                            const lastStep = lastMessage.reactLog[lastMessage.reactLog.length - 1];
                            if (lastStep.type === 'action') {
                                statusBadge.textContent = 'Executing...';
                                statusBadge.className = 'react-status-badge react-status-executing';
                            } else if (lastStep.type === 'thought') {
                                statusBadge.textContent = 'Thinking...';
                                statusBadge.className = 'react-status-badge react-status-thinking';
                            }
                        }
                    }
                  }
                }
              }
            }
            
            // 如果在上述檢查中發現需要完整渲染，則跳出
            if (needFullRender) {
               // Fall through to full render logic below
            } else {

            // 1. 更新思考過程 (reasoning)
            if (lastMessage.reasoningContent) {
              const reasoningBlockId = `reasoning-block-${currentMessageCount - 1}`;
              let reasoningBlock = lastMessageContainer.querySelector(`#${reasoningBlockId}`);

              // 更新 reasoning 內容
              // Phase 4.x 修復：使用更快的選擇器（優先使用類名，回退到子元素選擇器）
              const reasoningContentDiv = reasoningBlock
                ? (reasoningBlock.querySelector('.reasoning-content') || reasoningBlock.querySelector(':scope > div:last-child'))
                : null;
              if (reasoningContentDiv) {
                const newReasoningLength = lastMessage.reasoningContent.length;
                const lastReasoningLength = parseInt(reasoningBlock.dataset.lastReasoningLength || '0', 10);

                if (newReasoningLength !== lastReasoningLength) {
                  try {
                    if (typeof renderWithKatexStreaming === 'function') {
                      reasoningContentDiv.innerHTML = renderWithKatexStreaming(lastMessage.reasoningContent);
                    } else {
                      reasoningContentDiv.innerHTML = lastMessage.reasoningContent.replace(/\n/g, '<br>');
                    }
                    reasoningBlock.dataset.lastReasoningLength = newReasoningLength.toString();
                  } catch (e) {
                    if (window.PerfLogger) {
                      window.PerfLogger.error('Reasoning 增量渲染失敗:', e);
                    }
                    reasoningContentDiv.textContent = lastMessage.reasoningContent;
                  }
                }
              }
            }

            // 2. 更新主內容 (content)
            const contentDiv = lastMessageContainer.querySelector('.markdown-content');
            if (contentDiv && lastMessage.content) {
              // 使用內容長度與內容本身判斷是否有變化
              const newContent = String(lastMessage.content);
              const newContentLength = newContent.length;
              const lastContentLength = parseInt(contentDiv.dataset.lastLength || '0', 10);
              const lastContent = contentDiv.dataset.lastContent || '';

              if (newContentLength !== lastContentLength) {
                try {
                  const isPureExtension =
                    newContentLength > lastContentLength &&
                    lastContent &&
                    newContent.indexOf(lastContent) === 0;
                  const appendedText = isPureExtension ? newContent.slice(lastContent.length) : '';

                  const canUseIncrementalAppend =
                    isPureExtension &&
                    !lastMessage.isRawHtml && // 純 HTML 內容不使用增量渲染
                    isChatbotSafePlainAppend(lastContent, appendedText);

                  let didIncrementalUpdate = false;

                  if (canUseIncrementalAppend && typeof renderWithKatexStreaming === 'function') {
                    // Phase 4.2: 簡單增量渲染（純文字追加場景）
                    const appendedHtml = renderWithKatexStreaming(appendedText);
                    const temp = document.createElement('div');
                    temp.innerHTML = appendedHtml;
                    while (temp.firstChild) {
                      contentDiv.appendChild(temp.firstChild);
                    }
                    didIncrementalUpdate = true;
                  } else if (
                    isPureExtension &&
                    !lastMessage.isRawHtml && // 純 HTML 內容不使用增量渲染
                    appendedText &&
                    window.ChatbotMathStreaming &&
                    typeof window.ChatbotMathStreaming.renderIncremental === 'function'
                  ) {
                    // Phase 4.2（原型）: 長公式增量渲染，僅在擴充場景下啟用
                    let prevState = null;
                    const stateRaw = contentDiv.dataset.mathStreamingState || '';
                    if (stateRaw) {
                      try {
                        prevState = JSON.parse(stateRaw);
                      } catch (e) {
                        prevState = null;
                      }
                    }

                    const result = window.ChatbotMathStreaming.renderIncremental(prevState, appendedText);
                    if (result && typeof result.html === 'string' && result.html) {
                      const temp = document.createElement('div');
                      temp.innerHTML = result.html;
                      while (temp.firstChild) {
                        contentDiv.appendChild(temp.firstChild);
                      }
                      if (result.state) {
                        try {
                          contentDiv.dataset.mathStreamingState = JSON.stringify(result.state);
                        } catch (e) {
                          contentDiv.dataset.mathStreamingState = '';
                        }
                      }
                      didIncrementalUpdate = true;
                    }
                  }

                  if (!didIncrementalUpdate) {
                    // 回退：完整重渲染
                    let contentToRender = newContent;

                    // 🔧 檢測並修復歷史資料中被轉義的 HTML（向後相容）
                    if (!lastMessage.isRawHtml &&
                        (contentToRender.includes('&lt;div') || contentToRender.includes('&lt;button')) &&
                        (contentToRender.includes('配圖 XML') || contentToRender.includes('手動修復'))) {
                      console.log('[UI] 檢測到被轉義的 HTML，自動反轉義');
                      // 建立臨時元素進行反轉義
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = contentToRender;
                      contentToRender = tempDiv.innerHTML; // 使用 innerHTML 而不是 textContent
                      lastMessage.isRawHtml = true; // 標記為純 HTML
                    }

                    // 檢查是否為純 HTML 內容（不需要 Markdown 解析）
                    if (lastMessage.isRawHtml) {
                      contentDiv.innerHTML = contentToRender;
                    } else if (typeof renderWithKatexStreaming === 'function') {
                      contentDiv.innerHTML = renderWithKatexStreaming(contentToRender);
                    } else if (typeof marked !== 'undefined') {
                      contentDiv.innerHTML = marked.parse(contentToRender);
                    } else {
                      contentDiv.textContent = contentToRender;
                    }
                    // 重渲染後清理流式狀態，避免狀態與內容不一致
                    delete contentDiv.dataset.mathStreamingState;
                  }

                  contentDiv.dataset.lastLength = newContentLength.toString();
                  contentDiv.dataset.lastContent = newContent;
                } catch (e) {
                  if (window.PerfLogger) {
                    window.PerfLogger.error('增量渲染失敗:', e);
                  }
                  contentDiv.textContent = newContent;
                }
              }
            }

            } // End of else block for needFullRender check

            // 3. 更新工具呼叫塊 (toolCallHtml) - 支援流式多輪取材實時更新
            if (lastMessage.toolCallHtml) {
              const toolCallBlockContainer = lastMessageContainer.querySelector('.tool-thinking-block');
              const newToolCallHtml = String(lastMessage.toolCallHtml);

              // 檢查是否需要更新（比較HTML內容）
              if (toolCallBlockContainer) {
                const currentHtml = toolCallBlockContainer.outerHTML;
                if (currentHtml !== newToolCallHtml) {
                  // 更新工具呼叫塊HTML
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = newToolCallHtml;
                  const newToolCallBlock = tempDiv.firstElementChild;
                  if (newToolCallBlock) {
                    toolCallBlockContainer.replaceWith(newToolCallBlock);
                  }
                }
              } else if (newToolCallHtml) {
                // 工具呼叫塊不存在，插入新的塊（在主內容之前）
                const contentDiv = lastMessageContainer.querySelector('.markdown-content');
                if (contentDiv && contentDiv.parentNode) {
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = newToolCallHtml;
                  const newToolCallBlock = tempDiv.firstElementChild;
                  if (newToolCallBlock) {
                    contentDiv.parentNode.insertBefore(newToolCallBlock, contentDiv);
                  }
                }
              }
            }
          }

          // Phase 3.5 智慧滾動：流式更新時保持使用者閱讀位置
          // 只有在使用者主動停留在底部附近時才自動滾動
          if (!needFullRender) {
            const scrollThreshold = window.PerformanceConfig?.SCROLL?.BOTTOM_THRESHOLD || 50;
            const isUserAtBottom = oldScrollHeight - oldClientHeight <= oldScrollTop + scrollThreshold;
            if (isUserAtBottom) {
              chatBody.scrollTop = chatBody.scrollHeight;
            }
            // 如果使用者正在檢視上方內容，不做任何滾動操作
            return; // 跳過完整重新渲染
          }
          // needFullRender = true 時，繼續執行完整渲染（不 return）
        }

        // 完整渲染：新訊息或非流式更新
        let messagesHtml = window.ChatbotCore.chatHistory.map((m, index) => {
            if (m.role === 'segment-summary') {
                return '';
            }
            if (m.role === 'final-summary') {
                return window.ChatbotMessageRenderer.renderFinalSummaryMessage(m);
            }
            if (m.role === 'user') {
                return window.ChatbotMessageRenderer.renderUserMessage(m, index);
            }
            return window.ChatbotMessageRenderer.renderAssistantMessage(m, index, docName, dataForMindmap, docId);
        }).join('');

        // Prevent double typing indicators:
        // Only show the standalone typing indicator if the last message is NOT from the assistant.
        // If the last message IS from the assistant, it means the response has started (even if empty/reasoning),
        // so the assistant message itself will render the appropriate state (Logo, Reasoning, or Content).
        const lastMsg = window.ChatbotCore.chatHistory[window.ChatbotCore.chatHistory.length - 1];
        const isLastMsgAssistant = lastMsg && lastMsg.role === 'assistant';

        if (window.ChatbotCore.isChatbotLoading && !isLastMsgAssistant) {
            messagesHtml += window.ChatbotMessageRenderer.renderTypingIndicator();
        }

        chatBody.innerHTML = messagesHtml + window.ChatbotMessageRenderer.getMarkdownStyles();
        window.ChatbotRenderState.lastRenderedMessageCount = currentMessageCount;
        if (window.PerfLogger) {
          window.PerfLogger.debug(`增量渲染: 完整渲染 ${currentMessageCount} 條訊息`);
        }
    } else {
        console.error("ChatbotMessageRenderer is not loaded!");
        chatBody.innerHTML = "<p style='color:red;'>錯誤：訊息渲染模組載入失敗。</p>";
    }

    setTimeout(() => {
      if (!window.ChatbotCore.isChatbotLoading) {
        chatBody.querySelectorAll('code.language-mermaid, pre code.language-mermaid').forEach(block => {
          block.setAttribute('data-mermaid-final', 'true');
        });
      }
    }, 0);

    // Phase 3.5 智慧滾動：完整渲染時保持使用者閱讀位置
    const isUserAtBottom = oldScrollHeight - oldClientHeight <= oldScrollTop + 50; // 增加容差到 50px
    const isNewMessageArrival = currentMessageCount > lastRenderedCount; // 檢測是否有新訊息到達

    // 自動滾動到底部的條件：
    // 1. 有新訊息到達（使用者傳送訊息或助手開始回覆）
    // 2. 或者使用者已經停留在底部附近
    if (isNewMessageArrival || isUserAtBottom) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    // 否則保持使用者當前的閱讀位置（即使正在載入也不強制滾動）

    if (window.ChatbotRenderingUtils && typeof window.ChatbotRenderingUtils.renderAllMermaidBlocks === 'function') {
      if (window.mermaidLoaded && typeof window.mermaid !== 'undefined') {
        window.ChatbotRenderingUtils.renderAllMermaidBlocks(chatBody);
      } else {
        setTimeout(() => {
          if (window.ChatbotRenderingUtils && typeof window.ChatbotRenderingUtils.renderAllMermaidBlocks === 'function') {
            window.ChatbotRenderingUtils.renderAllMermaidBlocks(chatBody);
          }
        }, 600);
        setTimeout(() => {
          if (window.ChatbotRenderingUtils && typeof window.ChatbotRenderingUtils.renderAllMermaidBlocks === 'function') {
            window.ChatbotRenderingUtils.renderAllMermaidBlocks(chatBody);
          }
        }, 1200);
      }
    } else {
      console.warn('ChatbotUI: ChatbotRenderingUtils.renderAllMermaidBlocks is not available.');
    }

    // Phase 4.1: 表格滾動效能最佳化 - 使用 IntersectionObserver 優先，回退到 requestAnimationFrame 節流
    setupChatbotTableScrollHints(chatBody);
  }

  const input = document.getElementById('chatbot-input');
  const sendBtn = document.getElementById('chatbot-send-btn');
  const stopBtn = document.getElementById('chatbot-stop-btn');

  if (input && sendBtn) {
    input.disabled = window.ChatbotCore.isChatbotLoading;
    sendBtn.disabled = window.ChatbotCore.isChatbotLoading;

    if (window.ChatbotCore.isChatbotLoading) {
      sendBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'flex';
    } else {
      sendBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
    }
  }

  const disclaimerDiv = document.querySelector('.chatbot-disclaimer');
  if (disclaimerDiv) {
    const currentChatHistory = window.ChatbotCore && window.ChatbotCore.chatHistory ? window.ChatbotCore.chatHistory : [];
    if (currentChatHistory.length > 0) {
      disclaimerDiv.innerHTML = '<span>AI助手可能會犯錯。請核實重要資訊。</span>丨<span id="chatbot-clear-history-btn" style="color:#2563eb;cursor:pointer;font-weight:500;">刪除對話記錄</span>';
      const clearBtn = document.getElementById('chatbot-clear-history-btn');
      if (clearBtn) {
        clearBtn.onclick = function() {
          if (confirm('確定要刪除當前對話的所有記錄嗎？')) {
            if (window.ChatbotCore && typeof window.ChatbotCore.clearCurrentDocChatHistory === 'function') {
              const docIdToClear = window.ChatbotCore.getCurrentDocId ? window.ChatbotCore.getCurrentDocId() : 'default_doc';
              window.ChatbotCore.clearCurrentDocChatHistory(updateChatbotUI);
              window.isPresetQuestionsCollapsed = false;
              if (window.presetAutoCollapseTriggeredForDoc) {
                delete window.presetAutoCollapseTriggeredForDoc[docIdToClear];
              }
            } else {
              console.error("clearCurrentDocChatHistory function not found on ChatbotCore");
            }
          }
        };
      }
    } else {
      disclaimerDiv.innerHTML = '<p style="margin:0;">AI助手可能會犯錯。請核實重要資訊。</p>';
    }
  }

  // 將呼叫 _updateFloatingOptionsDisplay() 改為呼叫獨立模組
  if (window.ChatbotFloatingOptionsUI && typeof window.ChatbotFloatingOptionsUI.updateDisplay === 'function') {
    window.ChatbotFloatingOptionsUI.updateDisplay();
  }
}

/**
 * Phase 4.1 - 表格滾動提示效能最佳化
 * 目標：在保持現有視覺行為（滾動到最右側隱藏漸變陰影）的前提下，減少滾動事件壓力。
 *
 * 策略：
 * 1. 優先使用 IntersectionObserver 觀察表格中“最右側單元格”是否完全進入視口。
 *    - root: table，自身作為滾動容器。
 *    - threshold: 1.0，僅當最後單元格完全可見時認為滾動到末尾。
 * 2. 當瀏覽器不支援 IntersectionObserver 時，回退到 requestAnimationFrame 節流的 scroll 監聽。
 * 3. 每次呼叫都會清理舊的監聽器和觀察器，避免重複綁定和記憶體洩漏。
 */
function setupChatbotTableScrollHints(chatBody) {
  if (!chatBody) return;

  const tables = chatBody.querySelectorAll('.markdown-content table');
  tables.forEach(function(table) {
    // 清理舊的 IntersectionObserver（如有）
    if (table._scrollObserver && typeof table._scrollObserver.disconnect === 'function') {
      try {
        table._scrollObserver.disconnect();
      } catch (e) {
        if (window.PerfLogger) {
          window.PerfLogger.warn('ChatbotUI: disconnect table._scrollObserver failed', e);
        }
      }
    }
    table._scrollObserver = null;

    // 清理舊的 scroll 監聽器（如有）
    if (table._scrollListener) {
      table.removeEventListener('scroll', table._scrollListener);
    }
    table._scrollListener = null;

    // 如果瀏覽器支援 IntersectionObserver，則優先使用
    if (window.IntersectionObserver) {
      let lastCell = table.querySelector('tr:last-child td:last-child');
      if (!lastCell) {
        lastCell = table.querySelector('td:last-child, th:last-child');
      }

      // 如果找不到可觀察的單元格，則直接視為已滾動到底部（不顯示漸變陰影）
      if (!lastCell) {
        table.classList.add('scrolled-to-end');
        return;
      }

      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          // 當最後一個單元格完全進入視口時，認為滾動到了最右端
          const isEnd = entry.isIntersecting && entry.intersectionRatio >= 1;
          if (isEnd) {
            table.classList.add('scrolled-to-end');
          } else {
            table.classList.remove('scrolled-to-end');
          }
        });
      }, {
        root: table,
        threshold: 1.0
      });

      observer.observe(lastCell);
      table._scrollObserver = observer;
      return;
    }

    // 回退方案：使用 requestAnimationFrame 節流 scroll 事件
    let scrollRAF = null;
    const scrollListener = function() {
      if (scrollRAF) return;
      // 若瀏覽器不支援 requestAnimationFrame，則直接同步執行
      if (typeof window.requestAnimationFrame !== 'function') {
        const isScrolledToEnd = table.scrollLeft >= (table.scrollWidth - table.clientWidth - 5);
        if (isScrolledToEnd) {
          table.classList.add('scrolled-to-end');
        } else {
          table.classList.remove('scrolled-to-end');
        }
        return;
      }

      scrollRAF = window.requestAnimationFrame(function() {
        const isScrolledToEnd = table.scrollLeft >= (table.scrollWidth - table.clientWidth - 5);
        if (isScrolledToEnd) {
          table.classList.add('scrolled-to-end');
        } else {
          table.classList.remove('scrolled-to-end');
        }
        scrollRAF = null;
      });
    };

    table._scrollListener = scrollListener;
    table.addEventListener('scroll', scrollListener);

    // 初始檢查（表格首次渲染時）
    scrollListener();
  });
}

/**
 * Phase 4.2 - 簡單增量追加判定（純文字場景）
 * 僅在追加內容較為“安全”時啟用增量渲染：
 * - newContent 以 oldContent 為字首（純追加，而非回退/編輯）
 * - 追加部分不包含明顯的結構/公式標記（如 ```、$$、\[…\] 等）
 * 複雜 Markdown / LaTeX 場景仍回退到完整重渲染，避免破壞結構。
 */
function isChatbotSafePlainAppend(oldContent, appendedText) {
  if (!appendedText) return false;

  // 邊界檢查 1：若舊內容末尾處位於未閉合的塊級結構中（程式碼塊/公式等），則不做增量。
  // 這裡採用“保守策略”：一旦存在疑似未閉合結構，就直接回退完整渲染，以換取更高的渲染正確性。
  try {
    if (isChatbotInsideUnclosedBlock(oldContent)) {
      return false;
    }
  } catch (e) {
    // 檢測異常時同樣回退完整渲染
    if (window.PerfLogger) {
      window.PerfLogger.warn('ChatbotUI: isChatbotInsideUnclosedBlock failed, fallback to full render.', e);
    }
    return false;
  }

  // 若追加部分包含明顯的程式碼塊/公式/複雜結構標記，則不做增量
  const riskyPatterns = [
    /```/,          // 程式碼塊
    /\$\$/,         // 塊級公式
    /\\\[/,         // \[ ... \]
    /\\\(/,         // \( ... \)
    /<\/?[a-zA-Z]/, // HTML 標籤
    /^#{1,6}\s/m,   // 標題
    /^\s{0,3}[-*+]\s/m, // 無序列表
    /^\s{0,3}\d+\.\s/m, // 有序列表
    /^\s{0,3}>\s/m  // 參考
  ];

  for (let i = 0; i < riskyPatterns.length; i++) {
    if (riskyPatterns[i].test(appendedText)) {
      return false;
    }
  }

  return true;
}

/**
 * Phase 4.2.2 - Markdown 結構邊界檢測
 * 檢測 oldContent 末尾是否位於未閉合的 Markdown 塊級結構中：
 * - ``` fenced code block
 * - $$ 塊級公式
 * - \[ \] / \( \) LaTeX 公式包裹
 *
 * 為保證效能：
 * - 優先僅分析結尾一段文字（TAIL_WINDOW），減少在極長訊息上的全量掃描開銷；
 * - 對 fenced code / $$ 使用“奇偶計數”策略；對 \[ / \] 與 \( / \) 使用“數量差值”近似判斷；
 * - 一旦存在“不確定”或“可能未閉合”的結構，則視為不安全，回退完整渲染。
 */
function isChatbotInsideUnclosedBlock(oldContent) {
  if (!oldContent || typeof oldContent !== 'string') return false;

  // 限制分析視窗，避免在超長內容上多次全量掃描
  const TAIL_WINDOW = 4000;
  const text = oldContent.length > TAIL_WINDOW
    ? oldContent.slice(-TAIL_WINDOW)
    : oldContent;

  // 輔助函式：統計比對次數
  function countMatches(pattern) {
    const re = new RegExp(pattern, 'g');
    let count = 0;
    while (re.exec(text) !== null) {
      count++;
    }
    return count;
  }

  // 1) Fenced code block: ``` ... ```
  // 使用出現次數的奇偶性近似判斷是否在未閉合的程式碼塊中。
  const codeFenceCount = countMatches('```');
  if (codeFenceCount % 2 === 1) {
    return true;
  }

  // 2) Block math: $$ ... $$
  const blockMathCount = countMatches('\\$\\$');
  if (blockMathCount % 2 === 1) {
    return true;
  }

  // 3) LaTeX-style delimiters: \[ ... \], \( ... \)
  const openBracket = countMatches('\\\\\\[');
  const closeBracket = countMatches('\\\\\\]');
  if (openBracket > closeBracket) {
    return true;
  }

  const openParen = countMatches('\\\\\\(');
  const closeParen = countMatches('\\\\\\)');
  if (openParen > closeParen) {
    return true;
  }

  return false;
}

/**
 * 初始化聊天機器人浮動按鈕 (FAB) 和主彈出視窗 (Modal) 的 UI。
 *
 * 主要步驟：
 * 1. **FAB 初始化**：建立 FAB，設定樣式和點選事件（開啟聊天彈出視窗）。
 * 2. **Modal 初始化**：建立 Modal，包含標頭、預設區、聊天內容區、輸入區等。
 *    - 標頭：標題、全屏/位置切換/關閉按鈕。
 *    - 主內容區：承載預設區和聊天內容區。
 *    - 輸入區：圖片新增、文字輸入、傳送按鈕、免責宣告。
 *    - 注入基礎 CSS (捲軸、響應式、暗黑模式等)。
 * 3. **浮動高階選項初始化**：呼叫 `_createFloatingOptionsBar` 建立選項按鈕並插入到輸入區。
 * 4. **事件綁定**：為全屏、位置切換、關閉按鈕綁定事件。
 * 5. **初始UI更新**：呼叫 `updateChatbotUI`。
 */
function initChatbotUI() {
  // --- FAB (浮動操作按鈕) 初始化 ---
  let fab = document.getElementById('chatbot-fab');
  if (!fab) {
    fab = document.createElement('div');
    fab.id = 'chatbot-fab';
    // 設定 FAB 的固定定位、初始位置（根據 isChatbotPositionedLeft 決定左右）和層級
    fab.style.position = 'fixed';
    fab.style.bottom = '32px';
    if (window.isChatbotPositionedLeft) {
      fab.style.left = '32px';
      fab.style.right = 'auto';
    } else {
      fab.style.right = '32px';
      fab.style.left = 'auto';
    }
    fab.style.zIndex = '99999';
    // FAB 內部的按鈕 HTML，使用響應式尺寸和CSS變數
    fab.innerHTML = `
      <button class="chatbot-fab-button"
        onmouseover="this.style.transform='scale(1.05)';"
        onmouseout="this.style.transform='scale(1)';">
        <i class="fa-solid fa-robot"></i>
      </button>
    `;
    document.body.appendChild(fab);
  }
  // FAB 點選事件：開啟聊天視窗，預設展開預設問題，並強制重置視窗寬度
  fab.onclick = function() {
    window.isChatbotOpen = true;
    window.isPresetQuestionsCollapsed = false;
    window.forceChatbotWidthReset = true;
    updateChatbotUI();
  };

  // --- Modal (主聊天視窗) 初始化 ---
  let modal = document.getElementById('chatbot-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'chatbot-modal';
    // Modal 作為聊天視窗的容器，初始隱藏，透過 flex 版面控制 chatbot-window 的居中（非全屏時）
    modal.style.position = 'fixed';
    modal.style.inset = '0'; // 等同於 top:0, left:0, bottom:0, right:0
    modal.style.zIndex = '100000';
    modal.style.background = 'transparent'; // 背景透明，依賴內部 chatbot-window 的背景
    modal.style.display = 'none'; // 初始隱藏
    modal.style.pointerEvents = 'none'; // 自身不接收滑鼠事件，允許穿透
    // Modal 內部的 HTML 結構
    modal.innerHTML = `
      <div class="chatbot-window">
        <!-- 拖拽調整大小的控制代碼 -->
        <div class="chatbot-resize-handles">
          <div class="chatbot-resize-handle chatbot-resize-n" data-direction="n"></div>
          <div class="chatbot-resize-handle chatbot-resize-s" data-direction="s"></div>
          <div class="chatbot-resize-handle chatbot-resize-w" data-direction="w"></div>
          <div class="chatbot-resize-handle chatbot-resize-e" data-direction="e"></div>
          <div class="chatbot-resize-handle chatbot-resize-nw" data-direction="nw"></div>
          <div class="chatbot-resize-handle chatbot-resize-ne" data-direction="ne"></div>
          <div class="chatbot-resize-handle chatbot-resize-sw" data-direction="sw"></div>
          <div class="chatbot-resize-handle chatbot-resize-se" data-direction="se"></div>
        </div>
        <!-- 浮動切換按鈕 -->
        <div style="position:absolute;top:12px;right:138px;z-index:11;">
          <button id="chatbot-float-toggle-btn" title="浮動模式" style="width:32px;height:32px;border-radius:16px;border:none;background:rgba(0,0,0,0.06);color:#666;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.06);" onmouseover="this.style.background='rgba(0,0,0,0.1)';this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(0,0,0,0.06)';this.style.transform='scale(1)'">
            {/* 圖示由 updateChatbotUI 動態設定 */}
          </button>
        </div>
        <!-- 全屏切換按鈕 -->
        <div style="position:absolute;top:12px;right:98px;z-index:11;">
          <button id="chatbot-fullscreen-toggle-btn" title="全屏模式" style="width:32px;height:32px;border-radius:16px;border:none;background:rgba(0,0,0,0.06);color:#666;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.06);" onmouseover="this.style.background='rgba(0,0,0,0.1)';this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(0,0,0,0.06)';this.style.transform='scale(1)'">
            {/* 圖示由 updateChatbotUI 動態設定 */}
          </button>
        </div>
        <!-- 位置切換按鈕 -->
        <div style="position:absolute;top:12px;right:58px;z-index:11;">
          <button id="chatbot-position-toggle-btn" title="切換位置" style="width:32px;height:32px;border-radius:16px;border:none;background:rgba(0,0,0,0.06);color:#666;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.06);" onmouseover="this.style.background='rgba(0,0,0,0.1)';this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(0,0,0,0.06)';this.style.transform='scale(1)'">
            {/* 圖示由 updateChatbotUI 動態設定 */}
          </button>
        </div>
        <!-- 關閉按鈕 -->
        <div style="position:absolute;top:12px;right:18px;z-index:10;">
          <button id="chatbot-close-btn" style="width:32px;height:32px;border-radius:16px;border:none;background:rgba(0,0,0,0.06);color:#666;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.06);" onmouseover="this.style.background='rgba(0,0,0,0.1)';this.style.transform='scale(1.05)'" onmouseout="this.style.background='rgba(0,0,0,0.06)';this.style.transform='scale(1)'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <!-- 標題欄 (可拖拽移動視窗) -->
        <div id="chatbot-title-bar" class="chatbot-draggable-header" style="padding:12px 24px;display:flex;align-items:center;gap:8px;border-bottom:1px dashed rgba(0,0,0,0.1);flex-shrink:0;">
          <div style="width:32px;height:32px;border-radius:16px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;">
            <i class="fa-solid fa-robot" style="font-size: 14px; color: white;"></i>
          </div>
          <span style="font-weight:600;font-size:1.05em;color:#111;">AI 智慧助手</span>
        </div>
        <!-- 主內容區域，包含聊天記錄和可能的預設問題區 -->
        <div id="chatbot-main-content-area" style="padding:12px 20px 0 20px;flex:1;display:flex;flex-direction:column;overflow:hidden;transition: padding-top 0.4s ease-out;">
          <!-- 聊天訊息顯示主體 -->
          <div id="chatbot-body"></div>
        </div>
        <!-- 輸入區域容器 (Refactored) -->
        <div id="chatbot-input-container" class="chatbot-input-container">
          <!-- 浮動高階選項將由JS插入此處 -->
          <!-- 已選圖片預覽區 -->
          <div id="chatbot-selected-images-preview" class="chatbot-image-preview-area">
            {/* 圖片預覽由 ChatbotImageUtils.updateSelectedImagesPreview 更新 */}
          </div>
          <!-- 輸入欄位和傳送按鈕的 flex 容器 -->
          <div class="chatbot-input-wrapper">
            <!-- 新增圖片按鈕 -->
            <button id="chatbot-add-image-btn" title="新增圖片"
              class="chatbot-input-btn chatbot-add-image-btn"
              onclick="window.ChatbotImageUtils.openImageSelectionModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            </button>
            <!-- 文字輸入欄位 -->
            <input id="chatbot-input" type="text" placeholder="請輸入問題..."
              class="chatbot-input-field"
              onkeydown="if(event.key==='Enter'){window.handleChatbotSend();}"
            />
            <!-- 傳送按鈕 -->
            <button id="chatbot-send-btn"
              class="chatbot-input-btn chatbot-send-btn"
              onclick="window.handleChatbotSend()"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
            <!-- 暫停按鈕 -->
            <button id="chatbot-stop-btn"
              class="chatbot-input-btn chatbot-stop-btn"
              onclick="window.handleChatbotStop()"
              title="停止對話"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="position:relative;z-index:1;">
                <circle cx="12" cy="12" r="10"></circle>
                <rect x="9" y="9" width="6" height="6" fill="currentColor"></rect>
              </svg>
            </button>
          </div>
          <!-- 免責宣告 -->
          <div class="chatbot-disclaimer">
            <p style="margin:0;">AI助手可能會犯錯。請核實重要資訊。</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // --- 浮動高階選項初始化 ---
  const inputContainerElement = document.getElementById('chatbot-input-container');
  if (window.ChatbotFloatingOptionsUI && typeof window.ChatbotFloatingOptionsUI.createBar === 'function') {
    window.ChatbotFloatingOptionsUI.createBar(inputContainerElement, updateChatbotUI);
  }

  // --- 核心控制按鈕事件綁定 ---
  // 浮動模式切換按鈕點選事件
  document.getElementById('chatbot-float-toggle-btn').onclick = function() {
    // 沉浸式模式下禁用浮動模式切換
    if (window.ImmersiveLayout && typeof window.ImmersiveLayout.isActive === 'function' && window.ImmersiveLayout.isActive()) {
      return; // 直接忽略
    }
    window.isChatbotFloating = !window.isChatbotFloating;
    localStorage.setItem('chatbotFloating', String(window.isChatbotFloating));

    if (window.isChatbotFloating) {
      // 切換到浮動模式時，記錄當前位置和大小
      const chatbotWindow = modal.querySelector('.chatbot-window');
      if (chatbotWindow) {
        const rect = chatbotWindow.getBoundingClientRect();
        window.chatbotFloatingPosition = { x: rect.left, y: rect.top };
        window.chatbotFloatingSize = { width: rect.width, height: rect.height };
        localStorage.setItem('chatbotFloatingPosition', JSON.stringify(window.chatbotFloatingPosition));
        localStorage.setItem('chatbotFloatingSize', JSON.stringify(window.chatbotFloatingSize));
      }
    }
    updateChatbotUI();
  };

  // 全屏切換按鈕點選事件
  document.getElementById('chatbot-fullscreen-toggle-btn').onclick = function() {
    const wasFullscreen = window.isChatbotFullscreen;
    window.isChatbotFullscreen = !window.isChatbotFullscreen; // 切換全屏狀態
    localStorage.setItem('chatbotFullscreen', String(window.isChatbotFullscreen)); // 儲存到localStorage
    if (wasFullscreen && !window.isChatbotFullscreen) { // 如果是從全屏退出
      window.forceChatbotWidthReset = true; // 強制重置寬度
    }
    updateChatbotUI();
  };

  // 位置切換按鈕點選事件
  document.getElementById('chatbot-position-toggle-btn').onclick = function() {
    window.isChatbotPositionedLeft = !window.isChatbotPositionedLeft; // 切換左右位置狀態
    localStorage.setItem('chatbotPosition', window.isChatbotPositionedLeft ? 'left' : 'right'); // 儲存到localStorage
    window.forceChatbotWidthReset = true; // 位置變化也應重置寬度
    updateChatbotUI();
  };

  // 關閉按鈕點選事件
  document.getElementById('chatbot-close-btn').onclick = function() {
    window.isChatbotOpen = false; // 關閉聊天視窗
    updateChatbotUI();
  };

  // --- 拖拽和調整大小功能初始化 ---
  initChatbotDragAndResize();

  updateChatbotUI(); // 首次完整渲染或更新UI
}

/**
 * 初始化聊天機器人的拖拽移動和調整大小功能
 */
function initChatbotDragAndResize() {
  const modal = document.getElementById('chatbot-modal');
  if (!modal) return;

  let isDragging = false;
  let isResizing = false;
  let dragStartX, dragStartY;
  let initialX, initialY, initialWidth, initialHeight;
  let resizeDirection = '';

  // 拖拽移動功能 (僅在浮動模式下生效)
  function handleDragStart(e) {
    if (!window.isChatbotFloating || window.isChatbotFullscreen) return;

    const chatbotWindow = modal.querySelector('.chatbot-window');
    if (!chatbotWindow) return;

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = chatbotWindow.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;

    document.body.classList.add('chatbot-dragging');
    e.preventDefault();
  }

  function handleDragMove(e) {
    if (!isDragging || !window.isChatbotFloating) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    const newX = Math.max(0, Math.min(window.innerWidth - 320, initialX + deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 200, initialY + deltaY));

    window.chatbotFloatingPosition = { x: newX, y: newY };
    localStorage.setItem('chatbotFloatingPosition', JSON.stringify(window.chatbotFloatingPosition));

    const chatbotWindow = modal.querySelector('.chatbot-window');
    if (chatbotWindow) {
      chatbotWindow.style.left = newX + 'px';
      chatbotWindow.style.top = newY + 'px';
    }
  }

  function handleDragEnd() {
    if (isDragging) {
      isDragging = false;
      document.body.classList.remove('chatbot-dragging');
    }
  }

  // 調整大小功能
  function handleResizeStart(e) {
    if (window.isChatbotFullscreen || !window.isChatbotFloating) return;

    const chatbotWindow = modal.querySelector('.chatbot-window');
    if (!chatbotWindow) return;

    isResizing = true;
    resizeDirection = e.target.dataset.direction;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = chatbotWindow.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    initialWidth = rect.width;
    initialHeight = rect.height;

    document.body.classList.add('chatbot-dragging');
    e.preventDefault();
    e.stopPropagation();
  }

  function handleResizeMove(e) {
    if (!isResizing || !window.isChatbotFloating) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    let newX = initialX;
    let newY = initialY;
    let newWidth = initialWidth;
    let newHeight = initialHeight;

    // 根據拖拽方向調整大小和位置
    if (resizeDirection.includes('n')) {
      newY = initialY + deltaY;
      newHeight = initialHeight - deltaY;
    }
    if (resizeDirection.includes('s')) {
      newHeight = initialHeight + deltaY;
    }
    if (resizeDirection.includes('w')) {
      newX = initialX + deltaX;
      newWidth = initialWidth - deltaX;
    }
    if (resizeDirection.includes('e')) {
      newWidth = initialWidth + deltaX;
    }

    // 應用最小和最大尺寸限制
    newWidth = Math.max(320, Math.min(window.innerWidth * 0.9, newWidth));
    newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, newHeight));

    // 確保視窗不會超出螢幕邊界
    newX = Math.max(0, Math.min(window.innerWidth - newWidth, newX));
    newY = Math.max(0, Math.min(window.innerHeight - newHeight, newY));

    // 更新全域狀態
    window.chatbotFloatingPosition = { x: newX, y: newY };
    window.chatbotFloatingSize = { width: newWidth, height: newHeight };
    localStorage.setItem('chatbotFloatingPosition', JSON.stringify(window.chatbotFloatingPosition));
    localStorage.setItem('chatbotFloatingSize', JSON.stringify(window.chatbotFloatingSize));

    // 應用新的位置和大小
    const chatbotWindow = modal.querySelector('.chatbot-window');
    if (chatbotWindow) {
      chatbotWindow.style.left = newX + 'px';
      chatbotWindow.style.top = newY + 'px';
      chatbotWindow.style.width = newWidth + 'px';
      chatbotWindow.style.height = newHeight + 'px';
    }
  }

  function handleResizeEnd() {
    if (isResizing) {
      isResizing = false;
      resizeDirection = '';
      document.body.classList.remove('chatbot-dragging');
    }
  }

  // 綁定拖拽移動事件 (標題欄)
  modal.addEventListener('mousedown', function(e) {
    if (e.target.closest('.chatbot-draggable-header')) {
      handleDragStart(e);
    } else if (e.target.closest('.chatbot-resize-handle')) {
      handleResizeStart(e);
    }
  });

  // 全域滑鼠移動和釋放事件
  document.addEventListener('mousemove', function(e) {
    if (isDragging) {
      handleDragMove(e);
    } else if (isResizing) {
      handleResizeMove(e);
    }
  });

  document.addEventListener('mouseup', function() {
    handleDragEnd();
    handleResizeEnd();
  });

  // ==========================================
  // Phase 3: 初始化訊息事件管理器（事件委託）
  // ==========================================
  if (window.ChatMessageEventManager) {
    try {
      window.chatMessageEventManager = new ChatMessageEventManager('#chatbot-body');
      console.log('[ChatbotUI] ✅ Phase 3: 訊息事件管理器已初始化（事件委託模式）');
    } catch (error) {
      console.error('[ChatbotUI] ❌ Phase 3: 訊息事件管理器初始化失敗:', error);
    }
  } else {
    console.warn('[ChatbotUI] ⚠️ Phase 3: ChatMessageEventManager 類未載入，將使用內聯事件（回滾模式）');
  }
}

// 將核心函式掛載到 window 物件和 ChatbotUI 名稱空間下，便於外部呼叫
window.handleChatbotSend = handleChatbotSend;
window.handleChatbotStop = handleChatbotStop;
// handlePresetQuestion 使用 ChatbotPreset 中的版本（包含完整的 prompt 注入邏輯）
window.handlePresetQuestion = window.ChatbotPreset?.handlePresetQuestion || function(q) {
  // 降級方案：如果 ChatbotPreset 未載入，使用簡單版本
  const input = document.getElementById('chatbot-input');
  if (!input) return;
  input.value = q;
  if (typeof window.handleChatbotSend === 'function') window.handleChatbotSend();
};
window.ChatbotUI = {
  updateChatbotUI,
  initChatbotUI
};

// 當DOM內容載入完成後，執行初始化函式
// 這是確保所有需要的DOM元素都已存在後再進行操作的標準做法
if (document.readyState === 'loading') {
  // 如果文件仍在載入中，則等待 DOMContentLoaded 事件
  document.addEventListener('DOMContentLoaded', initChatbotUI);
} else {
  // 如果文件已經載入完畢，則直接執行初始化
  initChatbotUI();
}
