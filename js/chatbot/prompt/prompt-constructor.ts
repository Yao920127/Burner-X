/**
 * @file Manages the construction of prompts and message payloads for the chatbot.
 */

window.PromptConstructor = (function() {

  /**
   * Builds the system prompt string based on document information and request type.
   * @param {object} docContentInfo - Object containing document details (name, ocr, translation).
   * @param {boolean} isMindMapRequest - Flag indicating if the request is for a mind map.
   * @param {string} plainTextInput - The user's plain text input (used to check for mind map keywords if isMindMapRequest is not directly passed).
   * @returns {string} The constructed system prompt.
   */
  function buildSystemPrompt(docContentInfo, isMindMapRequest, plainTextInput) {
    // 使用 ChatbotPreset 中的基礎系統提示詞
    let basePrompt = window.ChatbotPreset && window.ChatbotPreset.BASE_SYSTEM_PROMPT
      ? window.ChatbotPreset.BASE_SYSTEM_PROMPT
      : `你現在是 PDF 文件智慧助手，使用者正在檢視文件"{docName}"。\n你的回答應該：\n1. 基於PDF文件內容\n2. 簡潔清晰\n3. 學術準確`;

    // 替換文件名稱佔位符
    let systemPrompt = basePrompt.replace('{docName}', docContentInfo.name || '當前文件');

    // 檢查是否是思維導圖請求
    let actuallyIsMindMapRequest = isMindMapRequest;

    // 如果未明確指定是思維導圖請求，則檢查輸入文字中是否包含相關關鍵詞
    if (!actuallyIsMindMapRequest && window.ChatbotPreset && typeof window.ChatbotPreset.isMindMapRequest === 'function') {
      actuallyIsMindMapRequest = window.ChatbotPreset.isMindMapRequest(plainTextInput);
    } else if (!actuallyIsMindMapRequest && plainTextInput) {
      // 後備邏輯：如果 ChatbotPreset 不可用，使用內建檢測
      actuallyIsMindMapRequest = plainTextInput.includes('思維導圖') || plainTextInput.includes('腦圖');
    }

    // 新增思維導圖提示
    if (actuallyIsMindMapRequest) {
      const mindMapPrompt = window.ChatbotPreset && window.ChatbotPreset.MINDMAP_PROMPT
        ? window.ChatbotPreset.MINDMAP_PROMPT
        : `\n\n請注意：使用者請求生成思維導圖。請按照以下Markdown格式返回思維導圖結構：
# 文件主題（根節點）
## 一級主題1
### 二級主題1.1
### 二級主題1.2
## 一級主題2
### 二級主題2.1
#### 三級主題2.1.1

只需提供思維導圖的結構，不要新增額外的解釋。結構應該清晰反映文件的層次關係和主要內容。`;

      systemPrompt += mindMapPrompt;
    }

    // 檢查是否是配圖（draw.io）請求：基於字首 [加入配圖]
    let isDrawioPicturesRequest = false;
    if (window.ChatbotPreset && typeof window.ChatbotPreset.isDrawioPicturesRequest === 'function') {
      isDrawioPicturesRequest = window.ChatbotPreset.isDrawioPicturesRequest(plainTextInput);
    } else if (plainTextInput) {
      isDrawioPicturesRequest = plainTextInput.trim().startsWith('[加入配圖]');
    }

    if (isDrawioPicturesRequest) {
      const drawioPrompt = window.ChatbotPreset && window.ChatbotPreset.DRAWIO_PICTURES_PROMPT
        ? window.ChatbotPreset.DRAWIO_PICTURES_PROMPT
        : '\n\n請根據當前文章內容和使用者要求，為讀者補充所需的配圖，並以 diagrams.net / draw.io 相容的 XML 格式輸出，僅輸出 XML。';
      systemPrompt += drawioPrompt;
    }

    // 檢查是否是 Mermaid 流程圖請求：基於關鍵詞"流程圖"
    let isMermaidFlowchartRequest = false;
    if (plainTextInput) {
      isMermaidFlowchartRequest = plainTextInput.includes('流程圖') && !plainTextInput.includes('Mermaid語法');
    }

    if (isMermaidFlowchartRequest) {
      const mermaidPrompt = window.ChatbotPreset && window.ChatbotPreset.MERMAID_FLOWCHART_PROMPT
        ? window.ChatbotPreset.MERMAID_FLOWCHART_PROMPT
        : `
請用Mermaid語法輸出流程圖，節點用[]包裹，箭頭用-->連線。
- 每一條流程圖語句必須單獨一行，不能多條語句寫在一行。
- 節點內容必須全部在一行內，不能有任何換行、不能有 <br>、不能有 \\n。
- **節點標籤內禁止使用特殊符號**：不能包含 [ ] ( ) | { } < > 等符號。`;
      systemPrompt += mermaidPrompt;
    }

    // 獲取文件內容（優先翻譯，沒有就用OCR）
    let content = '';
    // Read the active summary source from global options, default to 'translation'
    const activeSummarySource = (window.chatbotActiveOptions && window.chatbotActiveOptions.summarySource) || 'translation';

    if (activeSummarySource === 'translation') {
      content = docContentInfo.translation || docContentInfo.ocr || '';
      // console.log('[PromptConstructor] Using translation or fallback to OCR for content.');
    } else if (activeSummarySource === 'ocr') {
      content = docContentInfo.ocr || docContentInfo.translation || '';
      // console.log('[PromptConstructor] Using OCR or fallback to translation for content.');
    } else if (activeSummarySource === 'none') {
      content = ''; // Explicitly no content from document
      // console.log('[PromptConstructor] Content source is NONE. No document content will be used.');
    }

    // ===== 新增：智慧分段策略 =====
    // 檢查是否啟用智慧分段模式（contentLengthStrategy === 'segmented'）
    const contentStrategy = (window.chatbotActiveOptions && window.chatbotActiveOptions.contentLengthStrategy) || 'default';

    if (contentStrategy === 'segmented' && content.length >= 50000) {
      // 智慧分段模式：使用意群摘要
      console.log('[PromptConstructor] 文件較長且啟用智慧分段，使用意群模式');

      if (docContentInfo.semanticGroups && docContentInfo.semanticGroups.length > 0) {
        // 已有意群，構建意群摘要
        const docGist = (docContentInfo.semanticDocGist && typeof docContentInfo.semanticDocGist === 'string')
          ? `文件總覽：${docContentInfo.semanticDocGist}\n\n` : '';
        if (docContentInfo.selectedGroupContext) {
          // 多輪取材：已選擇意群上下文，優先提供所選上下文
          content = `${docGist}已根據使用者問題聚焦以下意群上下文：\n\n${docContentInfo.selectedGroupContext}\n\n如需更多細節，可繼續請求深入具體意群。`;
          console.log('[PromptConstructor] 使用已選擇意群上下文模式');
        } else {
          const groupSummaries = docContentInfo.semanticGroups.map((group, idx) => {
            return `【意群${idx + 1}】${group.summary}\n關鍵詞: ${(group.keywords || []).join(', ')}`;
          }).join('\n\n');
          content = `${docGist}文件已分為 ${docContentInfo.semanticGroups.length} 個意群，以下是各意群概要：\n\n${groupSummaries}\n\n如需深入瞭解某個意群，請明確指出。`;
          console.log('[PromptConstructor] 使用意群摘要模式，共', docContentInfo.semanticGroups.length, '個意群');
        }
      } else {
        // 未生成意群，降級到截斷
        console.warn('[PromptConstructor] 啟用了分段模式但未找到意群資料，降級到截斷模式');
        if (content.length > 50000) {
          content = content.slice(0, 50000) + '\n\n[文件過長，已截斷]';
        }
      }
    } else {
      // 全文模式：但如果有多輪搜尋的結果，優先使用搜尋結果
      if (docContentInfo.selectedGroupContext) {
        const docGist = (docContentInfo.semanticDocGist && typeof docContentInfo.semanticDocGist === 'string')
          ? `文件總覽：${docContentInfo.semanticDocGist}\n\n` : '';
        content = `${docGist}已根據使用者問題檢索到以下相關內容：\n\n${docContentInfo.selectedGroupContext}`;
        console.log('[PromptConstructor] 全文模式下使用多輪搜尋結果');
      } else if (content.length > 50000) {
        // 沒有搜尋結果，使用傳統截斷
        content = content.slice(0, 50000);
      }
    }

    if (content) { // Only add "文件內容" section if content is not empty
      systemPrompt += `\n\n文件內容：\n${content}`;
    }
    // 追加回答行為規範，避免模型輸出"沒有外部工具"等無關免責宣告
    systemPrompt += `\n\n回答規則補充：
- 不要宣告你是否具備外部工具/聯網等能力，也不要輸出與回答無關的免責宣告。
- 優先依據文件內容回答；若文件資訊不足，請基於常識給出概覽性解答並明確不確定之處。
- **遇到公式、資料、圖表等關鍵資訊時，必須直接參考原文展示完整內容，不要僅概括描述**。
  * 例如使用者問"有什麼公式"時，應直接展示公式的完整表示式，而不是說"文件提到了公式7但未給出"。
  * 如果檢索到的內容包含公式、資料表、關鍵數值，務必完整參考，保留原文格式。
  * 對於數學公式，優先使用LaTeX格式展示（$$公式$$或$公式$）。`;

    // 如果使用了多輪檢索結果，新增簡要說明
    if (docContentInfo.selectedGroupContext) {
      systemPrompt += `\n\n注：上述內容透過智慧檢索系統（語義搜尋、關鍵詞比對、文件地圖等）多輪獲取。請充分利用所有材料，進行深入分析和綜合，提供全面準確的回答。`;
    }
    // console.log('[PromptConstructor.buildSystemPrompt] Final systemPrompt:', systemPrompt);
    return systemPrompt;
  }

  /**
   * 增強使用者輸入的提示詞
   * 整合各種提示詞增強邏輯，目前主要處理流程圖提示詞
   *
   * @param {string|Array} userInput - 使用者輸入，可能是字串或多模態訊息陣列
   * @returns {string|Array} - 增強後的使用者輸入
   */
  function enhanceUserPrompt(userInput) {
    // 如果ChatbotPreset已載入並提供了enhanceUserPrompt函式，則使用它
    if (window.ChatbotPreset && typeof window.ChatbotPreset.enhanceUserPrompt === 'function') {
      return window.ChatbotPreset.enhanceUserPrompt(userInput);
    }

    // 如果沒有 ChatbotPreset 或其函式不可用，則返回原始輸入
    return userInput;
  }

  /**
   * 構建完整的訊息負載
   * 處理系統提示詞和使用者輸入增強
   *
   * @param {object} docContentInfo - 文件內容資訊物件
   * @param {string|Array} userInput - 使用者輸入
   * @param {object} options - 額外選項
   * @returns {object} 包含系統提示詞和增強使用者輸入的訊息負載
   */
  function buildMessagePayload(docContentInfo, userInput, options = {}) {
    const { isMindMapRequest } = options;

    // 獲取原始的文字輸入(用於系統提示詞中檢測思維導圖關鍵詞)
    let plainTextInput = '';
    if (typeof userInput === 'string') {
      plainTextInput = userInput;
    } else if (Array.isArray(userInput)) {
      const textPart = userInput.find(p => p.type === 'text');
      plainTextInput = textPart ? textPart.text : '';
    }

    // 構建系統提示詞
    const systemPrompt = buildSystemPrompt(docContentInfo, isMindMapRequest, plainTextInput);

    // 增強使用者輸入
    const enhancedUserInput = enhanceUserPrompt(userInput);

    return {
      systemPrompt,
      userInput: enhancedUserInput
    };
  }

  // Future functions for more complex context management can be added here.
  // For example:
  // function buildContextualizedUserInput(userInput, interestPoints, memory) { ... }
  // function manageConversationHistory(history, contextPolicy) { ... }

  return {
    buildSystemPrompt,
    enhanceUserPrompt,
    buildMessagePayload
    // expose other functions as needed
  };

})();
