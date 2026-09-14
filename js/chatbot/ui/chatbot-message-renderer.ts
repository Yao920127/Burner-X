// js/chatbot/chatbot-message-renderer.js

/**
 * Phase 3: 事件委託特性開關
 * 設定為 true 啟用事件委託（減少記憶體佔用 40-60%）
 * 設定為 false 回滾到內聯事件（用於緊急回滾）
 */
const USE_EVENT_DELEGATION = true;  // 已修復流式更新配置載入問題

/**
 * ChatbotMessageRenderer 聊天訊息渲染工具
 *
 * 主要功能：
 * 1. 渲染使用者和助手的訊息內容（支援文字、圖片、思維導圖等）。
 * 2. 生成訊息操作按鈕（刪除、重發、複製、匯出等）。
 * 3. 支援訊息的富文字、Markdown、LaTeX 渲染。
 * 4. 渲染特殊訊息（最終彙總、輸入中指示器等）。
 * 5. 提供 Markdown 內容的樣式。
 */
window.ChatbotMessageRenderer = {
  /**
   * 生成訊息操作按鈕的 HTML（如刪除、重發等）。
   *
   * 主要邏輯：
   * 1. 使用者訊息包含"重發"和"刪除"按鈕，助手訊息僅有"刪除"按鈕。
   * 2. 按鈕位置根據訊息型別自動調整。
   *
   * @param {string} messageType - 'user' 或 'assistant'。
   * @param {number} index - 訊息在 chatHistory 中的索引。
   * @returns {string} HTML字串。
   * @private
   */
  _createActionButtonsHTML: function(messageType, index) {
    let buttons = '';

    // Phase 3: 使用事件委託
    if (USE_EVENT_DELEGATION) {
      // 通用刪除按鈕（事件委託版本）
      buttons += `
        <button class="msg-action-btn delete-msg-btn"
                data-action="delete"
                data-index="${index}"
                title="刪除訊息">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      `;

      if (messageType === 'user') {
        // 使用者訊息增加重發按鈕，且重發按鈕在前
        buttons = `
          <button class="msg-action-btn resend-msg-btn"
                  data-action="resend"
                  data-index="${index}"
                  title="重新傳送">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        ` + buttons;
      }
    } else {
      // 舊版本：內聯事件（用於回滾）
      // 為了程式碼簡潔，這裡僅保留核心功能，樣式由 CSS 控制
      buttons += `
        <button class="msg-action-btn delete-msg-btn"
                onclick="window.ChatbotActions.deleteMessage(${index})"
                title="刪除訊息">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      `;

      if (messageType === 'user') {
        buttons = `
          <button class="msg-action-btn resend-msg-btn"
                  onclick="window.ChatbotActions.resendUserMessage(${index})"
                  title="重新傳送">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        ` + buttons;
      }
    }

    // 按訊息型別調整按鈕位置
    const positionClass = messageType === 'user' ? 'user-actions' : 'assistant-actions';
    const positionStyle = messageType === 'user'
      ? 'position:absolute;top:-28px;right:8px;display:none;gap:5px;z-index:3;padding:4px;'
      : 'position:absolute;top:-28px;left:8px;display:none;gap:5px;z-index:3;padding:4px;';

    // Phase 3: 移除內聯 hover 事件，改用 CSS :hover
    if (USE_EVENT_DELEGATION) {
      // 使用 CSS 類控制位置 (需要在 message-actions.css 中新增相應類，或暫時保留內聯樣式以確保相容)
      // 暫時保留內聯樣式以確保位置正確，後續可遷移到 CSS
      return `
        <div class="message-actions action-buttons-container ${positionClass}"
             style="${positionStyle}">
          ${buttons}
        </div>
      `;
    } else {
      return `
        <div class="message-actions action-buttons-container ${positionClass}"
             style="${positionStyle}"
             onmouseenter="this.style.display='flex'"
             onmouseleave="this.style.display='none'">
          ${buttons}
        </div>
      `;
    }
  },

  /**
   * 渲染使用者訊息內容。
   *
   * 主要邏輯：
   * 1. 支援富文字（多段文字、圖片）和純文字兩種格式。
   * 2. 圖片支援點選放大。
   * 3. 滑鼠懸停時顯示操作按鈕。
   *
   * @param {object} m - 訊息物件。
   * @param {number} index - 訊息索引。
   * @returns {string} HTML字串。
   */
  renderUserMessage: function(m, index) {
    let userMessageHtml = '';
    // 判斷是否為富文字結構
    if (Array.isArray(m.displayContent) ? Array.isArray(m.displayContent) : Array.isArray(m.content)) {
      const contentToDisplay = Array.isArray(m.displayContent) ? m.displayContent : m.content;
      contentToDisplay.forEach(part => {
        if (part.type === 'text') {
          userMessageHtml += `<div style="margin-bottom:5px;">${window.ChatbotUtils.escapeHtml(part.text)}</div>`;
        } else if (part.type === 'image_url' && part.image_url && part.image_url.url) {
          const imageUrlForModal = part.image_url.fullUrl || part.image_url.url;

          // Phase 3: 圖片點選事件委託
          if (USE_EVENT_DELEGATION) {
            userMessageHtml += `
              <div class="message-image-container">
                <img src="${part.image_url.url}"
                     alt="使用者圖片"
                     class="user-message-image"
                     data-action="show-image"
                     data-image-url="${imageUrlForModal}">
              </div>`;
          } else {
            // 舊版本：內聯事件
            userMessageHtml += `
              <div class="message-image-container">
                <img src="${part.image_url.url}" alt="使用者圖片" class="user-message-image" onclick="window.ChatbotImageUtils.showImageModal('${imageUrlForModal}')">
              </div>`;
          }
        }
      });
    } else {
      // 純文字訊息
      userMessageHtml = window.ChatbotUtils.escapeHtml(m.displayContent !== undefined ? m.displayContent : m.content);
    }

    const actionButtons = this._createActionButtonsHTML('user', index);

    // CSS Refactor: 使用類名替代內聯樣式
    return `
      <div class="message-container user-message-container">
        ${actionButtons}
        <div class="chat-bubble user">
          ${userMessageHtml}
        </div>
      </div>
    `;
  },

  /**
   * 渲染助手訊息內容。
   *
   * 主要邏輯：
   * 1. 支援思維導圖、富文字、Markdown、LaTeX 等多種格式。
   * 2. 支援"思考過程"摺疊塊。
   * 3. 滑鼠懸停時顯示操作按鈕。
   * 4. 提供複製、匯出等快捷操作。
   *
   * @param {object} m - 訊息物件。
   * @param {number} index - 訊息索引。
   * @param {string} docName - 文件名（用於思維導圖）。
   * @param {object} dataForMindmap - 思維導圖相關資料。
   * @param {string} docId - 完整的文件 ID。
   * @returns {string} HTML字串。
   */
  renderAssistantMessage: function(m, index, docName, dataForMindmap, docId) {
    let renderedContent = '';
    // 思維導圖訊息特殊處理
    if (m.hasMindMap && m.mindMapData) {
      let safeMindMapData = m.mindMapData;
      if (!safeMindMapData.trim() || !/^#/.test(safeMindMapData.trim()) || !/\n##?\s+/.test(safeMindMapData)) {
        safeMindMapData = '# 思維導圖\n\n暫無結構化內容';
      }
      const mindmapUrlParams = `docId=${encodeURIComponent(docName || 'unknown')}_${(dataForMindmap.images||[]).length}_${(dataForMindmap.ocr|| '').length}_${(dataForMindmap.translation|| '').length}`;
      const mindmapUrl = (window.location.pathname.endsWith('/history_detail.html') ? '../mindmap/mindmap.html' : 'views/mindmap/mindmap.html') + '?' + mindmapUrlParams;

      // Phase 3: 思維導圖按鈕事件委託
      if (USE_EVENT_DELEGATION) {
        renderedContent = `
          <div class="mindmap-preview-container">
            <div class="mindmap-preview-content">
              ${window.ChatbotRenderingUtils.renderMindmapShadow(safeMindMapData)}
            </div>
            <div class="mindmap-preview-overlay">
              <button class="mindmap-open-btn"
                      data-action="open-mindmap"
                      data-mindmap-url="${mindmapUrl}">放大檢視/編輯思維導圖</button>
            </div>
          </div>
        `;
      } else {
        renderedContent = `
          <div class="mindmap-preview-container">
            <div class="mindmap-preview-content">
              ${window.ChatbotRenderingUtils.renderMindmapShadow(safeMindMapData)}
            </div>
            <div class="mindmap-preview-overlay">
              <button class="mindmap-open-btn" onclick="window.open('${mindmapUrl}','_blank')">放大檢視/編輯思維導圖</button>
            </div>
          </div>
        `;
      }
    } else if (m.isDrawioPictures) {
      // draw.io 配圖訊息特殊處理
      const docIdSafe = docId || 'unknown';
      const drawioUrl = (window.location.pathname.endsWith('/history_detail.html')
        ? '../drawio/drawio.html'
        : 'views/drawio/drawio.html') + `?docId=${encodeURIComponent(docIdSafe)}`;

      if (USE_EVENT_DELEGATION) {
        renderedContent = `
          <div class="drawio-preview-container">
            <div class="drawio-preview-text">
              已生成 draw.io 相容的配圖 XML，可點選下方按鈕在新視窗中檢視和編輯。
            </div>
            <div class="drawio-preview-overlay">
              <button class="mindmap-open-btn"
                      data-action="open-drawio"
                      data-drawio-url="${drawioUrl}">放大檢視/編輯配圖</button>
            </div>
          </div>
        `;
      } else {
        renderedContent = `
          <div class="drawio-preview-container">
            <div class="drawio-preview-text">
              已生成 draw.io 相容的配圖 XML，可點選下方按鈕在新視窗中檢視和編輯。
            </div>
            <div class="drawio-preview-overlay">
              <button class="mindmap-open-btn" onclick="window.open('${drawioUrl}','_blank')">放大檢視/編輯配圖</button>
            </div>
          </div>
        `;
      }
    } else {
      // 普通文字/Markdown/LaTeX
      // Only show the logo if there is NO content, NO reasoning, and NO tool calls.
      // If there is reasoning or tool calls, they serve as the "activity indicator".
      const isPurelyEmpty = (!m.content || String(m.content).trim() === '') && !m.reasoningContent && !m.toolCallHtml;

      if (m.role === 'assistant' && isPurelyEmpty) {
        // Determine the correct path for the logo based on the current page
        const isHistoryDetail = window.location.pathname.includes('/history_detail.html');
        const logoPath = isHistoryDetail ? '../../public/pure.svg' : 'public/pure.svg';
        renderedContent = `
          <div class="typing-indicator">
            <img src="${logoPath}" class="typing-logo" alt="Thinking..." />
          </div>
        `;
      } else {
        try {
          if (typeof marked !== 'undefined' && typeof katex !== 'undefined') {
            if (typeof renderWithKatexStreaming === 'function') {
              renderedContent = renderWithKatexStreaming(m.content);
            } else if (typeof renderWithKatexFailback === 'function') {
              renderedContent = renderWithKatexFailback(m.content);
            } else {
              // XSS 防護
              if (typeof window.safeRenderMarkdown === 'function') {
                renderedContent = window.safeRenderMarkdown(m.content);
              } else {
                renderedContent = marked.parse(m.content);
              }
            }
          } else {
            renderedContent = window.ChatbotUtils.escapeHtml(m.content).replace(/\n/g, '<br>');
          }
        } catch (e) {
          renderedContent = window.ChatbotUtils.escapeHtml(m.content).replace(/\n/g, '<br>');
        }
      }
    }

    // 思考過程摺疊塊
    let reasoningBlock = '';
    if (m.reasoningContent) {
      const reasoningId = `reasoning-block-${index}`;
      const collapsed = window[`reasoningCollapsed_${index}`] === true;
      let renderedReasoningContent = '';
      try {
        if (typeof renderWithKatexStreaming === 'function') {
          renderedReasoningContent = renderWithKatexStreaming(m.reasoningContent);
        } else {
          renderedReasoningContent = window.ChatbotUtils.escapeHtml(m.reasoningContent).replace(/\n/g, '<br>');
        }
      } catch (e) {
        renderedReasoningContent = window.ChatbotUtils.escapeHtml(m.reasoningContent).replace(/\n/g, '<br>');
      }

      // Phase 3: 思考過程摺疊按鈕事件委託
      if (USE_EVENT_DELEGATION) {
        reasoningBlock = `
          <div id="${reasoningId}" class="reasoning-block">
            <div class="reasoning-header">
              <span class="reasoning-title">思考過程</span>
              <button class="reasoning-toggle-btn"
                      data-action="toggle-reasoning"
                      data-index="${index}">
                ${collapsed ? '▼' : '▲'}
              </button>
            </div>
            <div class="reasoning-content" style="${collapsed ? 'display:none;' : ''}">
              ${renderedReasoningContent}
            </div>
          </div>
        `;
      } else {
        // 舊版本：內聯事件
        reasoningBlock = `
          <div id="${reasoningId}" class="reasoning-block">
            <div class="reasoning-header">
              <span class="reasoning-title">思考過程</span>
              <button class="reasoning-toggle-btn" onclick="(function(){window['reasoningCollapsed_${index}']=!window['reasoningCollapsed_${index}'];window.ChatbotUI.updateChatbotUI();})()">
                ${collapsed ? '▼' : '▲'}
              </button>
            </div>
            <div class="reasoning-content" style="${collapsed ? 'display:none;' : ''}">
              ${renderedReasoningContent}
            </div>
          </div>
        `;
      }
    }

    // ReAct Visualization Block
    let reactVizBlock = '';
    if (m.reactLog && m.reactLog.length > 0) {
        const vizId = `react-viz-${index}`;
        // Create a container for the visualization
        // Note: The actual visualization will be rendered by the ReActVisualization class
        // We just provide the container here.
        // To make it work with the static HTML string return, we might need to trigger the render after insertion.
        // However, since we are returning HTML string, we can't easily bind the instance here.
        // A better approach for this specific architecture might be to render the static HTML structure
        // that matches what ReActVisualization produces, or use a placeholder and hydrate it later.
        
        // Let's try to render a static snapshot of the ReAct log if available
        let stepsHtml = '';
        m.reactLog.forEach((step, i) => {
            let icon = '';
            let title = '';
            let typeClass = '';
            let content = '';

            if (step.type === 'thought') {
                icon = 'carbon:idea';
                title = `Thought ${step.iteration || i+1}`;
                typeClass = 'step-thought';
                content = step.content;
            } else if (step.type === 'action') {
                icon = 'carbon:tools';
                title = `Action ${step.iteration || i+1}`;
                typeClass = 'step-action';
                content = `Tool: ${step.tool}\nInput: ${JSON.stringify(step.params, null, 2)}`;
            } else if (step.type === 'observation') {
                icon = 'carbon:view';
                title = `Observation ${step.iteration || i+1}`;
                typeClass = 'step-observation';
                content = typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2);
                if (content.length > 500) content = content.slice(0, 500) + '... (truncated)';
            }

            if (content) {
                // Escape HTML and preserve newlines
                content = window.ChatbotUtils.escapeHtml(content);
                content = content.replace(/\n/g, '<br>');

                stepsHtml += `
                    <div class="react-step-item ${typeClass}">
                        <div class="react-step-header">
                            <iconify-icon icon="${icon}"></iconify-icon>
                            <span>${title}</span>
                        </div>
                        <div class="react-step-content">${content}</div>
                    </div>
                `;
            }
        });

        if (stepsHtml) {
            reactVizBlock = `
                <div id="${vizId}" class="react-viz-container">
                    <div class="react-viz-header">
                        <div class="react-viz-title">
                            <iconify-icon icon="carbon:ibm-watson-discovery" width="18"></iconify-icon>
                            <span>ReAct Reasoning Engine</span>
                        </div>
                        <div class="react-status-badge react-status-completed">Completed</div>
                    </div>
                    <div class="react-steps-container">
                        ${stepsHtml}
                    </div>
                </div>
            `;
        }
    }

    // 工具呼叫塊 (Legacy or Fallback)
    let toolCallBlock = '';
    if (m.toolCallHtml && !reactVizBlock) {
      toolCallBlock = m.toolCallHtml;
    }

    const actionButtons = this._createActionButtonsHTML('assistant', index);

    // Phase 3: 複製、匯出等快捷操作按鈕
    let existingActions = '';
    if (USE_EVENT_DELEGATION) {
      existingActions = `
        <div class="message-actions original-actions">
          <button class="copy-btn"
                  data-action="copy"
                  data-index="${index}"
                  title="複製內容">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="export-png-btn"
                  data-action="export-png"
                  data-index="${index}"
                  title="匯出為PNG">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      `;
    } else {
      // 舊版本：內聯事件
      existingActions = `
        <div class="message-actions original-actions" style="position:absolute;top:8px;left:12px;display:flex;gap:6px;opacity:0.6;transition:opacity 0.2s;z-index:2;"
             onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
          <button class="copy-btn" onclick="window.ChatbotUtils.copyAssistantMessage(${index})"
                  title="複製內容">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="export-png-btn" onclick="window.ChatbotUtils.exportMessageAsPng(${index})"
                  title="匯出為PNG">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
        </div>
      `;
    }

    // CSS Refactor: 使用類名替代內聯樣式
    const isThinkingOnly = m.role === 'assistant' && (!m.content || String(m.content).trim() === '') && !m.reasoningContent && !m.toolCallHtml;

    return `
      <div class="message-container assistant-message-container">
        ${actionButtons}
        <div class="chat-bubble assistant ${isThinkingOnly ? 'typing-bubble' : ''}">
          ${existingActions}
          <div class="assistant-message" data-message-index="${index}">
            ${reactVizBlock}
            ${toolCallBlock}
            ${reasoningBlock}
            <div class="markdown-content">${renderedContent}</div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 渲染最終彙總訊息。
   *
   * @param {object} m - 訊息物件。
   * @returns {string} HTML字串。
   */
  renderFinalSummaryMessage: function(m) {
    return `
      <div class="message-container assistant-message-container">
        <div class="chat-bubble summary">
          <div class="summary-title">最終彙總</div>
          <div class="markdown-content">${window.ChatbotUtils.escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    `;
  },

  /**
   * 渲染"輸入中..."指示器。
   *
   * @returns {string} HTML字串。
   */
  renderTypingIndicator: function() {
    // Determine the correct path for the logo based on the current page
    const isHistoryDetail = window.location.pathname.includes('/history_detail.html');
    const logoPath = isHistoryDetail ? '../../public/pure.svg' : 'public/pure.svg';

    return `
      <div class="message-container assistant-message-container">
        <div class="chat-bubble assistant typing-bubble">
          <div class="typing-indicator">
            <img src="${logoPath}" class="typing-logo" alt="Thinking..." />
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 獲取 Markdown 內容的樣式。
   *
   * @returns {string} style 標籤字串。
   */
  getMarkdownStyles: function() {
    // CSS 現已移至外部檔案 (css/history_detail/03-components/chatbot/index.css)
    // 此處返回空字串以保持 API 相容性，或僅返回必要的動態樣式
    return '';
  }
};
