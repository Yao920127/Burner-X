// content-processor.js
// 內容處理模組

(function() {
  'use strict';

  /**
   * 獲取當前文件的內容資訊
   * @returns {object} 文件內容物件
   */
  function getCurrentDocContent() {
  if (window.data) {
    return {
      ocr: window.data.ocr || '',
      translation: window.data.translation || '',
      images: window.data.images || [],
      name: window.data.name || '',
      // 新增：傳遞意群資料
      semanticGroups: window.data.semanticGroups || null,
      ocrChunks: window.data.ocrChunks || null,
      translatedChunks: window.data.translatedChunks || null
    };
  }
  return { ocr: '', translation: '', images: [], name: '', semanticGroups: null, ocrChunks: null, translatedChunks: null };
}

/**
 * 根據聊天曆史和使用者當前輸入構建對話訊息列表。
 * 訊息格式遵循大語言模型 API 的標準，通常是 `{ role: 'user'/'assistant', content: '...' }`。
 *
 * @param {Array<object>} history 包含先前對話的陣列，每個元素是一個訊息物件。
 * @param {string} userInput 使用者當前的輸入文字。
 * @returns {Array<object>} 構建好的完整訊息列表，準備傳送給大模型。
 */
function buildChatMessages(history, userInput) {
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: userInput });
  return messages;
}

/**
 * 智慧分段函式，用於將長文字內容分割成適合模型處理的塊。
 *
 * 主要策略：
 * 1. 限制總長度：如果內容超過 50000 字元，則擷取前 50000 字元。
 * 2. 短內容直接返回：如果內容長度小於等於 `maxChunk`，則直接返回包含單個塊的陣列。
 * 3. 長內容分割：
 *    - 迭代處理內容，每次嘗試分割出一個 `maxChunk` 大小的塊。
 *    - 優先在塊的後半部分（`maxChunk * 0.3` 之後）尋找 Markdown 標題 (`#`, `##`, `###`) 作為分割點，
 *      以保持段落完整性。如果找到，則在該標題前分割。
 *    - 如果未找到合適的 Markdown 標題，則按 `maxChunk` 長度硬分割。
 * 4. 返回分割後的文字塊陣列。
 *
 * @param {string} content 需要分割的文字內容。
 * @param {number} [maxChunk=8192] 每個分塊的最大字元數。
 * @returns {Array<string>} 分割後的文字塊陣列。
 */
function splitContentSmart(content, maxChunk = 8192) {
  // 最多隻取前5萬字
  if (content.length > 50000) content = content.slice(0, 50000);
  if (content.length <= maxChunk) return [content];
  const chunks = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + maxChunk, content.length);
    // 優先在靠近中間的 markdown 標題處分割
    if (end < content.length) {
      const sub = content.slice(start, end);
      // 查詢靠近結尾的 markdown 標題
      let idx = sub.lastIndexOf('\n#');
      if (idx === -1) idx = sub.lastIndexOf('\n##');
      if (idx === -1) idx = sub.lastIndexOf('\n###');
      if (idx > maxChunk * 0.3) {
        end = start + idx + 1; // +1補回\n
      }
    }
    chunks.push(content.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * 生成當前文件的唯一 ID。
 * 該 ID 用於區分不同文件的聊天上下文或相關資料儲存 (如思維導圖資料)。
 * ID 的生成基於文件名稱、圖片數量、OCR 文字長度和翻譯文字長度的組合，
 * 以期在實際使用中具有足夠的唯一性。
 *
 * @returns {string} 當前文件的唯一 ID。
 */
function getCurrentDocId() {
  const doc = getCurrentDocContent();
  // 用檔名+圖片數量+ocr長度+translation長度做唯一性（可根據實際情況調整）
  return `${doc.name || 'unknown'}_${(doc.images||[]).length}_${(doc.ocr||'').length}_${(doc.translation||'').length}`;
}

/**
 * 將選中的意群上下文附加到文件內容資訊
 * @param {object} docContentInfo - 文件內容資訊
 * @param {object} selection - 選中的意群資訊
 * @returns {object} 附加了選中上下文的文件資訊
 */
function attachSelectedContextToDoc(docContentInfo, selection) {
  if (!selection) return docContentInfo;
  const ids = Array.isArray(selection.groups) ? selection.groups : [];
  const granularity = selection.granularity || 'digest';
  const byId = new Map((docContentInfo.semanticGroups || []).map(g => [g.groupId, g]));
  const parts = [];
  ids.forEach((id, idx) => {
    const g = byId.get(id);
    if (!g) return;
    const gran = (selection.detail && selection.detail.find(d => d.groupId===id)?.granularity) || granularity;
    const body = gran === 'full' ? (g.fullText || '').slice(0, 6000)
               : gran === 'digest' ? (g.digest || '').slice(0, 3000)
               : (g.summary || '').slice(0, 800);
    parts.push(`【意群${idx+1} - ${id}】\n關鍵詞: ${(g.keywords||[]).join('、')}\n內容(${gran}):\n${body}`);
  });
  const ctx = parts.join('\n\n');
  return Object.assign({}, docContentInfo, { selectedGroupContext: ctx, selectedGroupsMeta: selection });
}

/**
 * 構建降級語義上下文（多輪工具式取材）
 * @param {string} userQuestion - 使用者問題
 * @param {Array} groups - 意群陣列
 * @returns {object|null} 語義上下文物件
 */
function buildFallbackSemanticContext(userQuestion, groups) {
  try {
    if (!Array.isArray(groups) || groups.length === 0) return null;
    let picks = [];
    try {
      if (window.SemanticGrouper && typeof window.SemanticGrouper.quickMatch === 'function') {
        picks = window.SemanticGrouper.quickMatch(String(userQuestion || ''), groups) || [];
      }
    } catch (_) {}
    if (!picks || picks.length === 0) {
      picks = groups.slice(0, Math.min(3, groups.length));
    }
    const unique = new Set();
    const detail = [];
    const parts = [];
    picks.forEach(g => {
      if (!g || unique.size >= 3 || unique.has(g.groupId)) return;
      unique.add(g.groupId);
      let fetched = null;
      try {
        if (window.SemanticTools && typeof window.SemanticTools.fetchGroupText === 'function') {
          fetched = window.SemanticTools.fetchGroupText(g.groupId, 'digest');
        }
      } catch (_) {}
      const text = (fetched && fetched.text) || g.digest || g.summary || g.fullText || '';
      if (!text) return;
      const gran = (fetched && fetched.granularity) || 'digest';
      parts.push(`【${g.groupId}】\n關鍵詞: ${(g.keywords || []).join('、')}\n內容(${gran}):\n${text}`);
      detail.push({ groupId: g.groupId, granularity: gran });
    });
    if (parts.length === 0) return null;
    return { groups: Array.from(unique), granularity: 'mixed', detail, context: parts.join('\n\n') };
  } catch (e) {
    console.warn('[buildFallbackSemanticContext] 失敗:', e);
    return null;
  }
}

  // 匯出
  window.ContentProcessor = {
    getCurrentDocContent,
    buildChatMessages,
    splitContentSmart,
    getCurrentDocId,
    attachSelectedContextToDoc,
    buildFallbackSemanticContext
  };

})();
