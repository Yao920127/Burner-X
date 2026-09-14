// chatbot-preset.js


/**
 * @const {Array<string>} PRESET_QUESTIONS
 * 預設問題列表，用於在聊天機器人介面快速提問。
 * 這些問題通常是針對當前文件內容的常見查詢。
 */

const PRESET_QUESTIONS = [
  '總結本文', '有哪些關鍵公式？', '研究背景與意義？', '研究方法及發現？',
  '應用與前景？', '用通俗語言解釋全文', '生成思維導圖🧠', '生成流程圖🔄',
  '生成更多配圖🎨'
];

/**
 * @const {string} MERMAID_FLOWCHART_PROMPT
 * Mermaid 流程圖生成的提示詞模板
 */
const MERMAID_FLOWCHART_PROMPT = `
請用Mermaid語法輸出流程圖，節點用[]包裹，箭頭用-->連線。
- 每一條流程圖語句必須單獨一行，不能多條語句寫在一行。
- 節點內容必須全部在一行內，不能有任何換行、不能有 <br>、不能有 \\n。
- **節點標籤內禁止使用特殊符號**：不能包含 [ ] ( ) | { } < > 等符號，如需表示請用中文或文字描述。
  * ❌ 錯誤：D[PET成像 [11C]K-2] （包含方括號）
  * ✓ 正確：D[PET成像 11C-K-2] 或 D[PET成像使用11C標記的K-2]
- 不允許在節點內容中出現任何 HTML 標籤，只能用純文字。
- **每個節點都必須有連線，不能有孤立節點。**
- **節點定義後不要重複節點ID**：A[文字] --> B 而不是 A[文字]A --> B
- 如果文件內容有分支、並行、迴圈等，請在流程圖中體現出來，不要只畫一條直線。
- 如需使用subgraph，必須嚴格遵守Mermaid語法，subgraph必須單獨一行，內容縮排，最後用end結束。
- 只輸出程式碼塊，不要解釋，不要輸出除程式碼塊以外的任何內容。
- 例如：
\`\`\`mermaid
graph TD
A[開始] --> B{條件判斷}
B -- 是 --> C[處理1]
B -- 否 --> D[處理2]
subgraph 參與者流程
  C --> E[結束]
  D --> E
end
\`\`\`
`;

/**
 * @const {string} MINDMAP_PROMPT
 * 思維導圖生成的提示詞模板
 */
const MINDMAP_PROMPT = `
請注意：使用者請求生成思維導圖。請按照以下Markdown格式返回思維導圖結構：
# 文件主題（根節點）
## 一級主題1
### 二級主題1.1
### 二級主題1.2
## 一級主題2
### 二級主題2.1
#### 三級主題2.1.1

只需提供思維導圖的結構，不要新增額外的解釋。結構應該清晰反映文件的層次關係和主要內容。
`;

/**
 * @function getDrawioPicturesPrompt
 * draw.io 配圖生成的提示詞模板（配合 [加入配圖] 字首使用）。
 * 使用 DrawioLite DSL 代替 XML，減少格式錯誤
 * 動態獲取以確保 DrawioLite 模組已載入
 */
function getDrawioPicturesPrompt() {
  const drawioLitePrompt = window.DrawioLitePrompt?.DRAWIO_LITE_SYSTEM_PROMPT;

  if (!drawioLitePrompt) {
    console.error('[ChatbotPreset] ❌ DrawioLitePrompt 未載入！請檢查腳本載入順序');
    return `你現在處於「配圖生成模式」，請生成 DrawioLite DSL 程式碼。DrawioLite 極簡語法示例：
node A "標籤" rect blue
node B "標籤2" ellipse green
A -> B "連線"
只輸出 DSL 程式碼，不要解釋。`;
  }

  return `你現在處於「配圖生成模式」，本輪對話中不要充當通用問答助手，只充當 DrawioLite 圖表生成器。

請根據當前文章內容和使用者要求，為讀者補充所需的配圖。
使用者會在問題中自行說明需要哪類配圖（例如：整體結構、方法流程、實驗設定、變數關係、對比分析等），請充分理解後再設計圖形。

${drawioLitePrompt}`;
}

// 向後相容：lazy getter
Object.defineProperty(window.ChatbotPreset || {}, 'DRAWIO_PICTURES_PROMPT', {
  get: getDrawioPicturesPrompt,
  enumerable: true
});

// 立即求值版本（用於不支援動態獲取的舊程式碼）
const DRAWIO_PICTURES_PROMPT = getDrawioPicturesPrompt();

/**
 * @const {string} BASE_SYSTEM_PROMPT
 * 基礎系統提示詞模板
 */
const BASE_SYSTEM_PROMPT = `你現在是 PDF 文件智慧助手，使用者正在檢視文件"{docName}"。
你的回答應該：
1. 基於PDF文件內容
2. 簡潔清晰
3. 學術準確`;

/**
 * 處理預設問題的點選事件。
 * 當使用者點選一個預設問題時，此函式會將問題文字填充到聊天輸入欄位，
 * 並嘗試呼叫全域的 `window.handleChatbotSend` 函式來傳送訊息。
 *
 * 注意：Mermaid 流程圖的 prompt 不在這裡注入，而是在 buildSystemPrompt 中注入到系統提示詞
 *
 * @param {string} q被點選的預設問題文字。
 */
function handlePresetQuestion(q) {
  const input = document.getElementById('chatbot-input');
  if (!input) return;
  input.value = q;  // 直接設定問題文字，不拼接 prompt
  if (typeof window.handleChatbotSend === 'function') {
    window.handleChatbotSend();
  }
}

/**
 * 增強使用者輸入的提示詞
 * 注意：Mermaid 流程圖的 prompt 已改為在系統提示詞中注入（prompt-constructor.js），
 * 此函式不再處理流程圖 prompt
 *
 * @param {string|Array} userInput - 使用者輸入，可能是字串或多模態訊息陣列
 * @returns {string|Array} - 增強後的使用者輸入（目前保持不變）
 */
function enhanceUserPrompt(userInput) {
  // 目前不在使用者輸入中新增任何 prompt
  // 所有 prompt 都應在系統提示詞中注入
  return userInput;
}

/**
 * 檢查使用者輸入是否為配圖請求（基於字首 [加入配圖]）。
 *
 * @param {string} input - 使用者輸入文字
 * @returns {boolean} - 是否為配圖請求
 */
function isDrawioPicturesRequest(input) {
  if (!input) return false;
  return input.trim().startsWith('[加入配圖]');
}

/**
 * 檢查使用者輸入是否包含思維導圖請求關鍵詞
 *
 * @param {string} input - 使用者輸入文字
 * @returns {boolean} - 是否包含思維導圖關鍵詞
 */
function isMindMapRequest(input) {
  if (!input) return false;
  return input.includes('思維導圖') || input.includes('腦圖');
}

window.ChatbotPreset = {
  PRESET_QUESTIONS,
  MERMAID_FLOWCHART_PROMPT,
  MINDMAP_PROMPT,
  DRAWIO_PICTURES_PROMPT,
  BASE_SYSTEM_PROMPT,
  handlePresetQuestion,
  enhanceUserPrompt,
  isMindMapRequest,
  isDrawioPicturesRequest
};