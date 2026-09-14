// chatbot-utils.js

/**
 * 轉義 HTML 特殊字元，防止 XSS 攻擊。
 * 將 &, <, >, ", ' 替換為相應的 HTML 實體。
 * @param {string} str 需要轉義的原始字串。
 * @returns {string} 轉義後的安全字串。
 */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
  });
}

/**
 * 顯示一個短暫的浮動提示訊息 (Toast)。
 * Toast 用於向使用者反饋操作結果，如"已複製到剪貼簿"。
 * 如果頁面上不存在 ID 為 `chatbot-toast` 的元素，則會建立一個。
 * Toast 會在顯示約2秒後自動淡出消失。
 *
 * @param {string} message 要在 Toast 中顯示的訊息文字。
 */
function showToast(message) {
  let toast = document.getElementById('chatbot-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chatbot-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '100px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '8px 16px';
    toast.style.background = 'rgba(0,0,0,0.7)';
    toast.style.color = 'white';
    toast.style.borderRadius = '4px';
    toast.style.fontSize = '14px';
    toast.style.zIndex = '100001';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}

/**
 * 複製指定索引的助手訊息內容到使用者剪貼簿。
 * 使用 `navigator.clipboard.writeText` API。
 * 成功或失敗時會呼叫 `showToast` 顯示反饋。
 *
 * @param {number} messageIndex `ChatbotCore.chatHistory` 陣列中目標助手訊息的索引。
 */
function copyAssistantMessage(messageIndex) {
  if (!window.ChatbotCore || !window.ChatbotCore.chatHistory[messageIndex]) return;
  const text = window.ChatbotCore.chatHistory[messageIndex].content;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已複製到剪貼簿');
  }).catch(err => {
    showToast('複製失敗，請手動選擇文字複製');
  });
}

/**
 * 將指定索引的助手訊息內容匯出為 PNG 圖片。
 * 依賴 `html2canvas` 庫。如果該庫未載入，則會嘗試動態載入它。
 * 實際的匯出操作由 `doExportAsPng` 函式執行。
 *
 * @param {number} messageIndex `ChatbotCore.chatHistory` 陣列中目標助手訊息的索引。
 */
function exportMessageAsPng(messageIndex) {
  if (!window.ChatbotCore || !window.ChatbotCore.chatHistory[messageIndex]) return;
  if (typeof html2canvas === 'undefined') {
    showToast('正在載入圖片匯出元件...');
    const script = document.createElement('script');
    script.src = 'https://gcore.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = function() {
      showToast('元件載入完成，正在生成圖片...');
      doExportAsPng(messageIndex);
    };
    script.onerror = function() {
      showToast('匯出元件載入失敗，請檢查網路連線');
    };
    document.head.appendChild(script);
    return;
  }
  doExportAsPng(messageIndex);
}

/**
 * 執行將指定訊息元素匯出為 PNG 圖片的核心邏輯。
 * 此函式在 `html2canvas` 載入完成後被 `exportMessageAsPng` 呼叫，或者直接被呼叫（如果庫已載入）。
 * 它會查詢對應的訊息 DOM 元素，如果找不到，則會嘗試使用 `exportContentDirectly` 作為後備方案。
 *
 * @param {number} messageIndex 目標助手訊息在 `ChatbotCore.chatHistory` 中的索引。
 */
function doExportAsPng(messageIndex) {
  // Phase 3.5: 新增匯出狀態鎖，防止快速點選導致記憶體洩漏
  if (window.ChatbotRenderState && window.ChatbotRenderState.isExporting) {
    if (typeof showToast === 'function') {
      showToast('正在匯出，請稍候...');
    }
    if (window.PerfLogger) {
      window.PerfLogger.warn('匯出已在進行中，忽略重複請求');
    }
    return;
  }

  // 設定匯出鎖
  if (window.ChatbotRenderState) {
    window.ChatbotRenderState.isExporting = true;
  }

  try {
    const messageElements = document.querySelectorAll('.assistant-message');
    const targetElement = document.querySelector(`.assistant-message[data-message-index="${messageIndex}"]`);
    if ((!messageElements || messageElements.length <= messageIndex) && !targetElement) {
      exportContentDirectly(window.ChatbotCore.chatHistory[messageIndex].content);
      return;
    }
    const element = targetElement || messageElements[messageIndex];
    processExport(element);
  } catch (error) {
    if (window.PerfLogger) {
      window.PerfLogger.error('匯出失敗:', error);
    }
    // 確保即使出錯也釋放鎖
    if (window.ChatbotRenderState) {
      window.ChatbotRenderState.isExporting = false;
    }
    if (typeof showToast === 'function') {
      showToast('匯出失敗，請重試');
    }
  }
}

/**
 * 為匯出最佳化：內聯 KaTeX 關鍵樣式
 * 基於你的 hot-fix v3，只內聯最關鍵的屬性
 */
function inlineKatexStyles(container) {
  // 首先處理頂層 KaTeX 容器
  const katexContainers = container.querySelectorAll('.katex');
  katexContainers.forEach(el => {
    const computed = window.getComputedStyle(el);

    // 判斷是行內還是行間公式（檢查父容器）
    const parent = el.parentElement;
    const isInline = parent && (
      parent.classList.contains('katex-inline') ||
      parent.getAttribute('data-formula-display') === 'inline' ||
      parent.tagName === 'SPAN'
    );

    const containerProps = [
      'position', 'vertical-align',
      'font-size', 'line-height', 'font-family',
      'margin', 'padding',
      'text-align'
    ];

    const inlineStyles = [];

    // 根據型別手動設定 display
    if (isInline) {
      inlineStyles.push('display: inline');
    } else {
      inlineStyles.push('display: block');
    }

    containerProps.forEach(prop => {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'auto' && value !== 'normal' && value !== 'none' && value !== '0px') {
        inlineStyles.push(`${prop}: ${value}`);
      }
    });

    if (inlineStyles.length > 0) {
      const existing = el.getAttribute('style') || '';
      el.setAttribute('style', existing + '; ' + inlineStyles.join('; '));
    }
  });

  // 然後處理所有子元素
  const katexElements = container.querySelectorAll('.katex *');
  katexElements.forEach(el => {
    const computed = window.getComputedStyle(el);
    const critical = [
      'display', 'position', 'vertical-align',
      'font-size', 'line-height', 'font-family', 'font-weight', 'font-style',
      'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
      'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
      'width', 'height',
      'top', 'bottom', 'left', 'right',
      'transform', 'color', 'border-bottom'
    ];

    const inlineStyles = [];
    const existing = el.getAttribute('style') || '';

    // Special fix for html2canvas vertical alignment issue
    const verticalAlign = computed.getPropertyValue('vertical-align');
    if (verticalAlign && verticalAlign.endsWith('em')) {
        // Convert vertical-align to relative positioning for html2canvas
        const val = parseFloat(verticalAlign);
        if (!isNaN(val) && val !== 0) {
            // Negative vertical-align means "down", so positive top
            // However, html2canvas often renders text slightly lower, making elements look "high"
            // Experimentally, we add a small offset if it's baseline aligned or negative
            // Phase 10.15: 終極調整
            // 使用者反饋"好了點，但還沒完全好"，且"不夠朝下"
            // 1. 進一步加大 KaTeX 下沉倍率到 1.7 (從 1.4)

            inlineStyles.push(`position: relative`);
            inlineStyles.push(`top: ${-1 * val * 1.7}em`);
            inlineStyles.push(`vertical-align: baseline`); // 保持基線重置
        }
    }

    critical.forEach(prop => {
      const value = computed.getPropertyValue(prop);
      // Skip vertical-align if we handled it above, or just let it be overwritten if we push it?
      // Actually, let's just copy everything else.
      if (prop === 'vertical-align') return;

      if (value && value !== 'auto' && value !== 'normal' && value !== 'none' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
        inlineStyles.push(`${prop}: ${value}`);
      }
    });

    if (inlineStyles.length > 0) {
      const existing = el.getAttribute('style') || '';
      el.setAttribute('style', existing + '; ' + inlineStyles.join('; '));
    }
  });
}

/**
 * 智慧內聯關鍵樣式（僅用於特定元素）
 * 與舊版不同，這個版本不會盲目複製所有樣式
 * @param {HTMLElement} element 需要內聯樣式的元素
 * @param {string[]} props 需要內聯的屬性列表
 */
function inlineSpecificStyles(element, props) {
  const computed = window.getComputedStyle(element);
  const existingStyle = element.getAttribute('style') || '';
  const inlineStyle = [];

  props.forEach(prop => {
    const value = computed.getPropertyValue(prop);
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== 'initial') {
      // 避免覆蓋已有的內聯樣式
      if (!existingStyle.includes(prop + ':')) {
        inlineStyle.push(`${prop}: ${value}`);
      }
    }
  });

  if (inlineStyle.length > 0) {
    element.setAttribute('style', existingStyle + '; ' + inlineStyle.join('; '));
  }
}

/**
 * Phase 10.9: 內聯部分 Markdown 元素的關鍵樣式（簡化版）
 * 只處理不會影響垂直對齊的元素，避免破壞列表等元素的版面
 * @param {HTMLElement} container 匯出容器
 */
function inlineMarkdownStyles(container) {
  // 只內聯不會影響垂直對齊的元素
  // 不處理 ul、ol、li，避免破壞列表的原生布局
  const markdownElements = [
    {
      selector: 'code',
      props: ['background-color', 'padding', 'border-radius', 'font-family', 'font-size', 'color']
    },
    {
      selector: 'pre',
      props: ['background-color', 'padding', 'border-radius', 'overflow-x', 'margin-top', 'margin-bottom']
    },
    {
      selector: 'blockquote',
      props: ['margin-left', 'margin-right', 'padding-left', 'border-left', 'color', 'font-style']
    }
  ];

  markdownElements.forEach(({ selector, props }) => {
    const elements = container.querySelectorAll(selector);
    elements.forEach(el => {
      const computed = window.getComputedStyle(el);
      const existingStyle = el.getAttribute('style') || '';
      const inlineStyles = [];

      props.forEach(prop => {
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== 'initial' && value !== '0px') {
          // 避免覆蓋已有的內聯樣式
          if (!existingStyle.includes(prop + ':')) {
            inlineStyles.push(`${prop}: ${value}`);
          }
        }
      });

      if (inlineStyles.length > 0) {
        el.setAttribute('style', existingStyle + '; ' + inlineStyles.join('; '));
      }
    });
  });
}

/**
 * 處理將訊息 DOM 元素轉換為 PNG 圖片並下載的詳細過程。
 *
 * Phase 10: 修復 CSS 重構後的匯出問題
 * - 在匯出容器中載入完整的 KaTeX CSS
 *
 * @param {HTMLElement} messageElement 要匯出為圖片的助手訊息的 DOM 元素。
 */
function processExport(messageElement) {
  let questionText = "未知問題";
  try {
    const index = parseInt(messageElement.getAttribute('data-message-index'));
    if (!isNaN(index) && index > 0 && window.ChatbotCore.chatHistory[index-1] && window.ChatbotCore.chatHistory[index-1].role === 'user') {
      questionText = window.ChatbotCore.chatHistory[index-1].content;
      if (questionText.length > 60) {
        questionText = questionText.substring(0, 57) + '...';
      }
    }
  } catch (e) {}

  // Phase 10.5: 檢查是否有未渲染的公式佔位符
  const placeholders = messageElement.querySelectorAll('.katex-placeholder, .katex-block-placeholder, .katex-inline-placeholder');
  if (placeholders.length > 0) {
    showToast(`檢測到 ${placeholders.length} 個公式正在渲染，請稍候...`);
    console.log(`[Export] 檢測到 ${placeholders.length} 個佔位符，等待渲染完成...`);

    // 等待漸進式渲染完成
    const checkInterval = setInterval(() => {
      const remaining = messageElement.querySelectorAll('.katex-placeholder, .katex-block-placeholder, .katex-inline-placeholder');
      if (remaining.length === 0) {
        clearInterval(checkInterval);
        console.log('[Export] 公式渲染完成，開始匯出');
        showToast('開始匯出...');
        // 短暫延遲確保 DOM 穩定
        setTimeout(() => doActualExport(messageElement), 100);
      }
    }, 200);

    // 超時保護：最多等待 10 秒
    setTimeout(() => {
      clearInterval(checkInterval);
      const remaining = messageElement.querySelectorAll('.katex-placeholder, .katex-block-placeholder, .katex-inline-placeholder');
      if (remaining.length > 0) {
        console.warn(`[Export] 等待超時，仍有 ${remaining.length} 個公式未渲染，強制匯出`);
      }
      doActualExport(messageElement);
    }, 10000);

    return;
  }

  // 沒有佔位符，直接匯出
  doActualExport(messageElement);
}

/**
 * 實際執行匯出的函式
 */
function doActualExport(messageElement) {

  const exportContainer = document.createElement('div');
  exportContainer.style.position = 'absolute';
  exportContainer.style.left = '-9999px';
  exportContainer.style.padding = '20px';
  exportContainer.style.background = 'white';
  exportContainer.style.borderRadius = '8px';
  exportContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
  exportContainer.style.maxWidth = '800px';
  exportContainer.style.width = '800px';
  exportContainer.style.boxSizing = 'border-box';
  exportContainer.style.color = '#111827';
  exportContainer.style.fontSize = '15px';
  exportContainer.style.lineHeight = '1.6';
  // 顯式設定字型，確保 html2canvas 渲染時度量一致
  // 使用與 variables.css 中 --font-family-base 一致的字型堆疊
  exportContainer.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  exportContainer.style.overflow = 'visible';
  exportContainer.style.height = 'auto';

  const watermark = document.createElement('div');
  watermark.style.position = 'absolute';
  watermark.style.bottom = '10px';
  watermark.style.right = '15px';
  watermark.style.fontSize = '8px';
  watermark.style.opacity = '0.4';
  watermark.textContent = 'Created with Paper Burner';

  // Phase 10.5: 使用 cloneNode 而不是 innerHTML，完整保留 KaTeX 結構
  const contentContainer = messageElement.cloneNode(true);

  // 移除克隆元素的 data-message-index 避免 ID 衝突
  contentContainer.removeAttribute('data-message-index');
  contentContainer.style.maxWidth = 'none';

  exportContainer.appendChild(contentContainer);
  exportContainer.appendChild(watermark);
  document.body.appendChild(exportContainer);

  // Phase 10: 內聯 KaTeX 樣式（hot-fix v3 最佳化版）
  inlineKatexStyles(exportContainer);

  // Phase 10.9: 內聯所有 Markdown 元素的關鍵樣式
  inlineMarkdownStyles(exportContainer);

  // Phase 10.10: 修復列表樣式（從原始元素複製計算樣式）
  const originalLists = messageElement.querySelectorAll('ul, ol');
  const exportLists = exportContainer.querySelectorAll('ul, ol');
  exportLists.forEach((list, index) => {
    if (originalLists[index]) {
      const computed = window.getComputedStyle(originalLists[index]);
      list.style.paddingLeft = computed.paddingLeft;
      list.style.marginBottom = computed.marginBottom;
      list.style.listStyleType = computed.listStyleType;
      list.style.listStylePosition = 'inside'; // 改回 inside
    }
  });

  const originalItems = messageElement.querySelectorAll('li');
  const exportItems = exportContainer.querySelectorAll('li');
  exportItems.forEach((li, index) => {
    if (originalItems[index]) {
      const computed = window.getComputedStyle(originalItems[index]);
      li.style.display = 'list-item';
      li.style.lineHeight = computed.lineHeight;
      li.style.marginBottom = computed.marginBottom;
      // Fix for list number alignment:
      // Phase 10.15: 繼續微調
      // 1. 保持 line-height 1.6 和 vertical-align baseline
      // 2. 加大 padding-top 到 4px，確保明顯下移
      li.style.lineHeight = '1.6';
      li.style.verticalAlign = 'baseline';
      li.style.paddingTop = '4px'; // 加大物理下推力度
    }
  });

  // Phase 10.7: 強制修正父容器的 display 屬性
  const inlineContainers = exportContainer.querySelectorAll('.katex-inline, [data-formula-display="inline"]');
  inlineContainers.forEach(container => {
    container.style.display = 'inline';
    // container.style.verticalAlign = 'baseline'; // 移除強制基線對齊，保留 KaTeX 原生對齊 (通常是負值)
    container.style.margin = '0 2px';
  });

  const blockContainers = exportContainer.querySelectorAll('.katex-block, [data-formula-display="block"]');
  blockContainers.forEach(container => {
    container.style.display = 'block';
    container.style.margin = '16px auto';
    container.style.textAlign = 'center';
  });

  // Phase 10.6: 強制移除所有 KaTeX 的高度和溢位限制
  const katexBlocks = exportContainer.querySelectorAll('.katex-display, .katex-display-fixed, .katex-block');
  katexBlocks.forEach(block => {
    block.style.overflow = 'visible';
    block.style.overflowY = 'visible';
    block.style.maxHeight = 'none';
    block.style.height = 'auto';
  });

  // 移除所有 KaTeX 元素的高度限制
  const allKatexElements = exportContainer.querySelectorAll('.katex, .katex *');
  allKatexElements.forEach(el => {
    if (el.style.overflow === 'hidden') el.style.overflow = 'visible';
    if (el.style.overflowY === 'hidden') el.style.overflowY = 'visible';
    if (el.style.maxHeight && el.style.maxHeight !== 'none') el.style.maxHeight = 'none';
  });

  // Phase 3.5: 匯出前臨時展開所有表格，確保完整顯示
  const tables = exportContainer.querySelectorAll('.markdown-content table');
  const originalTableStyles = [];
  tables.forEach((table, index) => {
    originalTableStyles[index] = {
      overflow: table.style.overflow || '',
      maxWidth: table.style.maxWidth || '',
      display: table.style.display || ''
    };
    table.style.overflow = 'visible';
    table.style.maxWidth = 'none';
    table.style.display = 'table';
  });

  // 同時移除表格容器的寬度限制
  const messageContainer = exportContainer.querySelector('.assistant-message');
  let originalContainerMaxWidth = '';
  if (messageContainer) {
    originalContainerMaxWidth = messageContainer.style.maxWidth || '';
    messageContainer.style.maxWidth = 'none';
  }

  // Phase 3.5: 動態計算匯出容器的最大寬度
  const originalExportContainerMaxWidth = exportContainer.style.maxWidth;
  const originalExportContainerWidth = exportContainer.style.width;

  // 計算所有表格的最大寬度
  let maxTableWidth = 0;
  tables.forEach(table => {
    const tableWidth = table.scrollWidth || 0;
    if (maxTableWidth < tableWidth) {
      maxTableWidth = tableWidth;
    }
  });

  // 根據實際內容動態設定寬度
  const config = window.PerformanceConfig?.EXPORT || { MAX_WIDTH: 800, ABSOLUTE_MAX_WIDTH: 1000 };
  const calculatedWidth = maxTableWidth > 0 && maxTableWidth > 800
    ? Math.min(maxTableWidth + 40, config.ABSOLUTE_MAX_WIDTH)
    : 800;

  exportContainer.style.maxWidth = `${calculatedWidth}px`;
  exportContainer.style.width = `${calculatedWidth}px`;

  // Phase 10: KaTeX 已完全渲染，短暫延遲讓 DOM 版面穩定
  const hasKatex = exportContainer.querySelectorAll('.katex').length > 0;
  const layoutDelay = hasKatex ? 300 : 50;

  // 等待DOM重新版面
  setTimeout(() => {
    showToast('正在生成圖片...');

    // 強制重排
    exportContainer.offsetHeight;

    const scale = window.PerformanceConfig?.EXPORT?.SCALE || 2;
    html2canvas(exportContainer, {
      scale: scale,
      useCORS: true,
      backgroundColor: 'white',
      logging: false,
      allowTaint: false,
      foreignObjectRendering: false
    }).then(canvas => {
      try {
        const link = document.createElement('a');
        link.download = `paper-burner-ai-${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('圖片已匯出');
      } catch (err) {
        showToast('匯出圖片失敗');
      } finally {
        // 清理前恢復所有樣式
        tables.forEach((table, index) => {
          if (originalTableStyles[index]) {
            table.style.overflow = originalTableStyles[index].overflow;
            table.style.maxWidth = originalTableStyles[index].maxWidth;
            table.style.display = originalTableStyles[index].display;
          }
        });
        if (messageContainer && originalContainerMaxWidth) {
          messageContainer.style.maxWidth = originalContainerMaxWidth;
        }
        exportContainer.style.maxWidth = originalExportContainerMaxWidth;
        exportContainer.style.width = originalExportContainerWidth;
        document.body.removeChild(exportContainer);

        // 釋放匯出鎖
        if (window.ChatbotRenderState) {
          window.ChatbotRenderState.isExporting = false;
        }
      }
    }).catch(err => {
      if (window.PerfLogger) {
        window.PerfLogger.error('生成圖片失敗:', err);
      }
      showToast('生成圖片失敗');
      // 錯誤時也要清理所有樣式
      tables.forEach((table, index) => {
        if (originalTableStyles[index]) {
          table.style.overflow = originalTableStyles[index].overflow;
          table.style.maxWidth = originalTableStyles[index].maxWidth;
          table.style.display = originalTableStyles[index].display;
        }
      });
      if (messageContainer && originalContainerMaxWidth) {
        messageContainer.style.maxWidth = originalContainerMaxWidth;
      }
      exportContainer.style.maxWidth = originalExportContainerMaxWidth;
      exportContainer.style.width = originalExportContainerWidth;
      document.body.removeChild(exportContainer);

      // 釋放匯出鎖
      if (window.ChatbotRenderState) {
        window.ChatbotRenderState.isExporting = false;
      }
    });
  }, layoutDelay);
}

/**
 * 當無法直接定位到訊息的 DOM 元素時，提供一個後備方案來匯出純文字內容為圖片。
 * 這通常發生在 `doExportAsPng` 找不到對應的 `.assistant-message` 元素時。
 * 它會建立一個包含純文字內容的容器，並嘗試將其匯出為圖片，流程與 `processExport` 類似，
 * 但內容源是直接的字串而不是 DOM 元素的 innerHTML。
 *
 * @param {string} content 要匯出為圖片的純文字內容。
 */
function exportContentDirectly(content) {
  let questionText = "未知問題";
  try {
    // Try to find the last user question in history to associate with this content
    const history = window.ChatbotCore && window.ChatbotCore.chatHistory ? window.ChatbotCore.chatHistory : [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user' && history[i+1] && history[i+1].content === content) {
        questionText = history[i].content;
        if (questionText.length > 60) {
          questionText = questionText.substring(0, 57) + '...';
        }
        break;
      } else if (history[i].role === 'user' && i === history.length -2) { // Fallback if current content is the last one
        questionText = history[i].content;
         if (questionText.length > 60) {
          questionText = questionText.substring(0, 57) + '...';
        }
        break;
      }
    }
  } catch (e) {
    console.error("Error finding question for direct export:", e);
  }
  const exportContainer = document.createElement('div');
  exportContainer.style.position = 'absolute';
  exportContainer.style.left = '-9999px';
  exportContainer.style.padding = '20px';
  exportContainer.style.background = 'white';
  exportContainer.style.borderRadius = '8px';
  exportContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
  exportContainer.style.maxWidth = '720px';
  exportContainer.style.width = '80vw';
  exportContainer.style.color = '#111827';
  exportContainer.style.fontSize = '15px';
  exportContainer.style.lineHeight = '1.5';
  const watermark = document.createElement('div');
  watermark.style.position = 'absolute';
  watermark.style.bottom = '10px';
  watermark.style.right = '15px';
  watermark.style.fontSize = '8px';
  watermark.style.opacity = '0.4';
  watermark.textContent = 'Created with Paper Burner';
  const contentContainer = document.createElement('div');
  // For direct content, we should escape it before setting textContent if it might contain HTML
  // However, if the 'content' is already supposed to be plain text, textContent is fine.
  // If 'content' is markdown that was rendered to HTML, we'd need a different approach
  // Assuming 'content' here is mostly plain text or pre-formatted for display.
  contentContainer.style.whiteSpace = 'pre-wrap'; // Preserve line breaks
  contentContainer.style.wordBreak = 'break-word';
  contentContainer.textContent = content;
  exportContainer.appendChild(contentContainer);
  exportContainer.appendChild(watermark);
  document.body.appendChild(exportContainer);
  showToast('正在生成圖片...');
  html2canvas(exportContainer, {
    scale: 2,
    useCORS: true,
    backgroundColor: 'white',
    logging: false
  }).then(canvas => {
    try {
      const link = document.createElement('a');
      link.download = `paper-burner-ai-${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('圖片已匯出');
    } catch (err) {
      showToast('匯出圖片失敗');
    } finally {
      document.body.removeChild(exportContainer);
    }
  }).catch(err => {
    showToast('生成圖片失敗');
    document.body.removeChild(exportContainer);
  });
}

/**
 * 根據 Markdown 文字生成思維導圖的靜態 HTML 預覽 (虛影效果)。
 * 主要用於在聊天介面快速展示思維導圖的結構概覽。
 *
 * 實現邏輯：
 * 1. **解析 Markdown 為樹結構 (`parseTree`)**：
 *    - 按行分割 Markdown 文字。
 *    - 識別 `#` (一級)、`##` (二級)、`###` (三級) 標題，構建層級關係。
 *    - 返回一個包含 `text` 和 `children` 屬性的樹狀物件。
 * 2. **遞迴渲染樹節點 (`renderNode`)**：
 *    - 接受節點物件、當前層級和是否為最後一個兄弟節點的標記。
 *    - 為不同層級的節點應用不同的背景色、圓點顏色和字型樣式，以區分層級。
 *    - 使用絕對定位和相對定位建立連線線和層級縮排的視覺效果。
 *    - 遞迴渲染子節點。
 * 3. **呼叫與返回**：
 *    - 呼叫 `parseTree` 解析傳入的 `md` 文字。
 *    - 呼叫 `renderNode` 渲染根節點。
 *    - 如果生成的 HTML 為空或解析失敗，返回一個提示"暫無結構化內容"的 div。
 *
 * @param {string} md Markdown 格式的思維導圖文字。
 * @returns {string} 生成的思維導圖預覽 HTML 字串。
 */
function renderMindmapShadow(md) {
  // 解析 markdown 為樹結構
  function parseTree(md) {
    const lines = md.split(/\r?\n/).filter(l => l.trim());
    const root = { text: '', children: [] };
    let last1 = null, last2 = null;
    lines.forEach(line => {
      let m1 = line.match(/^# (.+)/);
      let m2 = line.match(/^## (.+)/);
      let m3 = line.match(/^### (.+)/);
      if (m1) {
        last1 = { text: m1[1], children: [] };
        root.children.push(last1);
        last2 = null;
      } else if (m2 && last1) {
        last2 = { text: m2[1], children: [] };
        last1.children.push(last2);
      } else if (m3 && last2) {
        last2.children.push({ text: m3[1], children: [] });
      }
    });
    return root;
  }
  // 遞迴渲染樹狀結構
  function renderNode(node, level = 0, isLast = true) {
    if (!node.text && node.children.length === 0) return '';
    if (!node.text) {
      // 根節點
      return `<div class=\"mindmap-shadow-root\">${node.children.map((c,i,a)=>renderNode(c,0,i===a.length-1)).join('')}</div>`;
    }
    // 節點樣式
    const colors = [
      'rgba(59,130,246,0.13)', // 主節點
      'rgba(59,130,246,0.09)', // 二級
      'rgba(59,130,246,0.06)'  // 三級
    ];
    const dotColors = [
      'rgba(59,130,246,0.35)',
      'rgba(59,130,246,0.22)',
      'rgba(59,130,246,0.15)'
    ];
    let html = `<div class=\"mindmap-shadow-node level${level}\" style=\"position:relative;margin-left:${level*28}px;padding:3px 8px 3px 12px;background:${colors[level]||colors[2]};border-radius:8px;min-width:60px;max-width:260px;margin-bottom:2px;opacity:0.7;border:1px dashed rgba(59,130,246,0.2);\">`;
    // 圓點
    html += `<span style=\"position:absolute;left:-10px;top:50%;transform:translateY(-50%);width:7px;height:7px;border-radius:4px;background:${dotColors[level]||dotColors[2]};box-shadow:0 0 0 1px #e0e7ef;\"></span>`;
    // 線條（如果不是根節點且不是最後一個兄弟）
    if (level > 0) {
      html += `<span style=\"position:absolute;left:-6px;top:0;height:100%;width:1.5px;background:linear-gradient(to bottom,rgba(59,130,246,0.10),rgba(59,130,246,0.03));z-index:0;\"></span>`;
    }
    // Use escapeHtml from the same utils file
    html += `<span style=\"color:#2563eb;font-weight:${level===0?'bold':'normal'};font-size:${level===0?'1.08em':'1em'};\">${escapeHtml(node.text)}</span>`;
    if (node.children && node.children.length > 0) {
      html += `<div class=\"mindmap-shadow-children\" style=\"margin-top:4px;\">${node.children.map((c,i,a)=>renderNode(c,level+1,i===a.length-1)).join('')}</div>`;
    }
    html += '</div>';
    return html;
  }
  const tree = parseTree(md);
  const html = renderNode(tree);
  return html || '<div style=\"color:#94a3b8;opacity:0.5;\">暫無結構化內容</div>';
}

/**
 * 壓縮圖片到目標大小和尺寸。
 * @param {string} base64Src - Base64 編碼的源圖片資料。
 * @param {number} targetSizeBytes - 目標檔案大小（位元組）。
 * @param {number} maxDimension - 圖片的最大寬度/高度。
 * @param {number} initialQuality - 初始壓縮質量 (0-1)。
 * @returns {Promise<string>} - 壓縮後的 Base64 圖片資料。
 */
async function compressImage(base64Src, targetSizeBytes, maxDimension, initialQuality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      let quality = initialQuality;
      let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      let iterations = 0;
      const maxIterations = 10; // Prevent infinite loop

      // Iteratively reduce quality to meet size target (simplified)
      while (compressedBase64.length * 0.75 > targetSizeBytes && quality > 0.1 && iterations < maxIterations) {
        quality -= 0.1;
        compressedBase64 = canvas.toDataURL('image/jpeg', Math.max(0.1, quality));
        iterations++;
      }

      if (compressedBase64.length * 0.75 > targetSizeBytes && targetSizeBytes < 100 * 1024) { // if still too large for small targets, warn but proceed
         console.warn(`Image compression for small target (${targetSizeBytes}B) resulted in ${Math.round(compressedBase64.length * 0.75 / 1024)}KB. Quality: ${quality.toFixed(2)}`);
      }
      resolve(compressedBase64);
    };
    img.onerror = (err) => {
      console.error("Image loading error for compression:", err, base64Src.substring(0,100));
      reject(new Error('無法載入圖片進行壓縮'));
    };
    img.src = base64Src;
  });
}

/**
 * 顯示帶進度條的Toast提示
 * @param {string} message 初始訊息
 * @param {number} percent 初始進度 (0-100)
 * @returns {object} 包含update和close方法的物件
 */
function showProgressToast(message, percent = 0) {
  let toast = document.getElementById('chatbot-progress-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chatbot-progress-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      min-width: 300px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 16px;
      z-index: 100002;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const messageEl = document.createElement('div');
    messageEl.id = 'progress-toast-message';
    messageEl.style.cssText = 'font-size: 14px; color: #374151; margin-bottom: 8px;';

    const progressBg = document.createElement('div');
    progressBg.style.cssText = 'width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;';

    const progressBar = document.createElement('div');
    progressBar.id = 'progress-toast-bar';
    progressBar.style.cssText = 'height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb); transition: width 0.3s ease; width: 0%;';

    const percentEl = document.createElement('div');
    percentEl.id = 'progress-toast-percent';
    percentEl.style.cssText = 'font-size: 12px; color: #6b7280; margin-top: 4px; text-align: right;';

    progressBg.appendChild(progressBar);
    toast.appendChild(messageEl);
    toast.appendChild(progressBg);
    toast.appendChild(percentEl);
    document.body.appendChild(toast);
  }

  const messageEl = document.getElementById('progress-toast-message');
  const progressBar = document.getElementById('progress-toast-bar');
  const percentEl = document.getElementById('progress-toast-percent');

  messageEl.textContent = message;
  progressBar.style.width = percent + '%';
  percentEl.textContent = percent + '%';

  return {
    update: function(newMessage, newPercent) {
      if (messageEl) messageEl.textContent = newMessage;
      if (progressBar) progressBar.style.width = newPercent + '%';
      if (percentEl) percentEl.textContent = newPercent + '%';
    },
    close: function() {
      if (toast && toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }
    }
  };
}

window.ChatbotUtils = {
  escapeHtml,
  showToast,
  showProgressToast,
  copyAssistantMessage,
  exportMessageAsPng,
  doExportAsPng,
  exportContentDirectly,
  renderMindmapShadow,
  compressImage
};