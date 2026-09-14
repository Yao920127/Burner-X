// history_detail_scripts.js - 從history_detail.html中提取的JavaScript程式碼
// 這個檔案包含了歷史詳情頁面的主要JavaScript邏輯

window.addEventListener('storage', function(e) {
  if (e.key === 'paperBurnerSettings') {
    // 重新載入設定並重新整理 chatbot 配置
    if (window.ChatbotCore && typeof window.ChatbotCore.getChatbotConfig === 'function') {
      // 你可以強制重新整理 Chatbot UI 或過載配置
      window.ChatbotUI && window.ChatbotUI.updateChatbotUI && window.ChatbotUI.updateChatbotUI();
    }
  }
});

/**
 * 將 exact 文字轉為模糊正則，允許空格、換行模糊比對，大小寫不敏感
 * @param {string} exact
 * @returns {RegExp}
 */
function escapeRegExp(string) {
  // 更安全地轉義所有正則特殊字元
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fuzzyRegFromExact(exact) {
  // 先轉義所有正則特殊字元
  let pattern = escapeRegExp(exact);
  // 將所有空白替換為 \s+，允許跨行、多個空格
  pattern = pattern.replace(/\s+/g, '\\s+');
  // 可選：忽略前後空白
  pattern = '\\s*' + pattern + '\\s*';
  return new RegExp(pattern, 'gi');
}

// function highlightTextWithAnnotations(text, annotations, contentIdentifier) { // Obsolete due to block based.
//   console.warn('[highlightTextWithAnnotations] This function is part of the old text-based highlighting system and should ideally be phased out.');
//   if (!annotations || !Array.isArray(annotations) || !text) return text;
//   // 只處理當前內容型別的醒目提示
//   const relevant = annotations.filter(
//     ann =>
//       ann.targetType === contentIdentifier &&
//       ann.target &&
//       Array.isArray(ann.target.selector) &&
//       ann.target.selector[0] &&
//       ann.target.selector[0].exact
//   );
//   if (relevant.length === 0) return text;

//   // 按照 exact 長度降序排序，避免巢狀覆蓋
//   relevant.sort((a, b) => (b.target.selector[0].exact.length - a.target.selector[0].exact.length));

//   let result = text;
//   relevant.forEach(ann => {
//     const color = ann.highlightColor || 'yellow';
//     const note = ann.body && ann.body.length > 0 && ann.body[0].value ? ann.body[0].value : '';
//     const exact = ann.target.selector[0].exact;
//     const reg = fuzzyRegFromExact(exact);
//     result = result.replace(
//       reg,
//       `<mark class="annotation-highlight" style="background:${color}" title="${note.replace(/"/g, '&quot;')}">$&</mark>`
//     );
//   });
//   return result;
// }

// 以下是從原始HTML檔案中提取的其他JavaScript程式碼
// 注意：許多函式已經移動到其他JS檔案中，這裡保留了註釋以便於理解程式碼結構

// 綁定tab按鈕點選事件
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('tab-ocr')) {
    document.getElementById('tab-ocr').onclick = function() { showTab('ocr'); };
  }
  if (document.getElementById('tab-translation')) {
    document.getElementById('tab-translation').onclick = function() { showTab('translation'); };
  }
  if (document.getElementById('tab-chunk-compare')) {
    document.getElementById('tab-chunk-compare').onclick = function() { showTab('chunk-compare'); };
  }
  if (document.getElementById('tab-pdf-compare')) {
    document.getElementById('tab-pdf-compare').onclick = function() { showTab('pdf-compare'); };
  }

  // 頁面載入後渲染詳情
  if (typeof renderDetail === 'function') {
    renderDetail();
  }
});
