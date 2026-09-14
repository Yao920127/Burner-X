// js/chatbot/chatbot-rendering-utils.js

/**
 * ChatbotRenderingUtils 聊天渲染相關工具函式集合
 *
 * 主要功能：
 * 1. 渲染思維導圖的模糊/靜態預覽（Markdown轉HTML或純文字）。
 * 2. 渲染父元素下所有 Mermaid 程式碼塊為 SVG。
 * 3. 提供與安全相關的HTML轉義輔助（如有需要）。
 */
window.ChatbotRenderingUtils = {
  /**
   * 渲染思維導圖的模糊預覽（通常是Markdown的簡化版或特定結構）。
   *
   * 主要邏輯：
   * 1. 優先使用 marked.js 將 Markdown 轉為 HTML。
   * 2. 若 marked 不可用，則轉為純文字並做 HTML 轉義。
   * 3. 返回帶有樣式的 HTML 字串。
   *
   * @param {string} markdownData - 思維導圖的Markdown資料。
   * @returns {string} HTML字串，表示思維導圖的預覽。
   */
  renderMindmapShadow: function(markdownData) {
    if (typeof marked !== 'undefined') {
      try {
        // 使用 marked 解析 Markdown 為 HTML
        let html = marked.parse(markdownData || '# 思維導圖預覽\n- 暫無內容');
        // 可選：移除潛在危險標籤，如 <script>（視 marked 配置而定）
        // html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        return `<div class="mindmap-shadow-content" style="font-size: 0.8em; opacity: 0.7;">${html}</div>`;
      } catch (e) {
        console.error("Error rendering mindmap shadow with marked.js:", e);
        return '<div class="mindmap-shadow-content" style="font-size: 0.8em; opacity: 0.7;">思維導圖預覽載入失敗</div>';
      }
    } else {
      console.warn("marked.js is not available for mindmap shadow rendering.");
      // 退化為純文字預覽
      const plainTextPreview = (markdownData || '')
        .split('\n')
        .map(line => window.ChatbotUtils.escapeHtml(line))
        .join('<br>');
      return `<div class="mindmap-shadow-content" style="font-size: 0.8em; opacity: 0.7; white-space: pre-wrap;">${plainTextPreview || '思維導圖預覽 (marked.js 未載入)'}</div>`;
    }
  },

  /**
   * 渲染指定父元素內所有 Mermaid 程式碼塊。
   *
   * 主要邏輯：
   * 1. 查詢 parentElement 下所有 Mermaid 程式碼塊（pre code.language-mermaid, code.language-mermaid）。
   * 2. 對每個程式碼塊：
   *    - 跳過已渲染的塊，避免重複渲染。
   *    - 建立 mermaid 容器 div，呼叫 mermaid.render 渲染 SVG。
   *    - 渲染成功則插入 SVG，失敗則顯示錯誤資訊。
   *    - 隱藏原始 pre/code 塊，SVG插入其後。
   * 3. 全域異常時恢復原始 pre 塊。
   *
   * @param {HTMLElement} parentElement - 包含 Mermaid 程式碼塊的父 DOM 元素。
   */
  renderAllMermaidBlocks: function(parentElement) {
    if (typeof mermaid === 'undefined' || !window.mermaidLoaded) {
      // Mermaid 未載入，直接返回
      return;
    }

    if (!parentElement) {
      return;
    }

    try {
      const mermaidBlocks = parentElement.querySelectorAll('pre code.language-mermaid, code.language-mermaid');
      if (mermaidBlocks.length === 0) return;

      mermaidBlocks.forEach((block, index) => {
        const containerId = `mermaid-container-${Date.now()}-${index}`;
        let preElement = block.tagName === 'CODE' ? block.parentElement : block;
        if (preElement && preElement.tagName !== 'PRE') preElement = null;

        // 跳過已渲染的塊
        if (preElement && preElement.dataset.mermaidRendered === 'true') {
          return;
        }
        if (preElement) {
          preElement.dataset.mermaidRendered = 'true';
        }

        const mermaidCode = block.textContent || '';
        if (!mermaidCode.trim()) {
          if(preElement) preElement.dataset.mermaidRendered = 'false';
          return;
        }

        const container = document.createElement('div');
        container.id = containerId;
        container.classList.add('mermaid');

        // 處理插入位置：優先插入到 pre 後面，或替換 code
        if (preElement && preElement.parentNode) {
          // 隱藏原始 pre 塊，將 SVG 插入其後
          if (preElement.dataset.mermaidOriginalDisplay === undefined) {
               preElement.dataset.mermaidOriginalDisplay = preElement.style.display;
          }
          preElement.style.display = 'none';
          preElement.parentNode.insertBefore(container, preElement.nextSibling);
        } else {
          // code 直接替換
          block.innerHTML = '';
          block.appendChild(container);
          block.style.background = 'transparent';
          block.style.padding = '0';
        }

        // Mermaid 渲染
        try {
            mermaid.render(containerId, mermaidCode, (svgCode, bindFunctions) => {
                container.innerHTML = svgCode;
                if (typeof bindFunctions === 'function') {
                    bindFunctions(container);
                }
                if (preElement && preElement.parentNode) {
                    if (preElement.dataset.mermaidOriginalDisplay === undefined) {
                         preElement.dataset.mermaidOriginalDisplay = preElement.style.display;
                    }
                    preElement.style.display = 'none';
                    preElement.parentNode.insertBefore(container, preElement.nextSibling);
                }
            });
        } catch (err) {
            console.error("Mermaid rendering error:", err, "for code:", mermaidCode.substring(0,100));
            container.innerHTML = `<pre style="color:red; background:#fff0f0; padding:10px; border:1px solid red;">Mermaid渲染錯誤:\n${window.ChatbotUtils.escapeHtml(String(err))}\n--- 源 代 碼 ---\n${window.ChatbotUtils.escapeHtml(mermaidCode)}</pre>`;
            if (preElement && preElement.parentNode) {
                 if (preElement.dataset.mermaidOriginalDisplay === undefined) {
                     preElement.dataset.mermaidOriginalDisplay = preElement.style.display;
                 }
                 preElement.style.display = 'none';
                 preElement.parentNode.insertBefore(container, preElement.nextSibling);
            } else if (block.parentNode) {
                // code已append，無需額外操作
            }
            if(preElement) preElement.dataset.mermaidRendered = 'error';
        }
      });
    } catch (e) {
      console.error("Error processing Mermaid blocks:", e);
      // 全域異常時恢復原始 pre 塊
      parentElement.querySelectorAll('pre[data-mermaid-rendered]').forEach(pre => {
        if (pre.dataset.mermaidOriginalDisplay !== undefined) {
            pre.style.display = pre.dataset.mermaidOriginalDisplay;
        }
        delete pre.dataset.mermaidRendered;
        delete pre.dataset.mermaidOriginalDisplay;
        // 清理可能新增的兄弟節點 (mermaid-container)
        let sibling = pre.nextSibling;
        if (sibling && sibling.classList && sibling.classList.contains('mermaid')) {
            sibling.remove();
        }
      });
    }
  }
};

// 可選：escapeHtml 輔助函式（推薦直接用 ChatbotUtils.escapeHtml）
// if (window.ChatbotUtils && typeof window.ChatbotUtils.escapeHtml === 'function') {
//   ChatbotRenderingUtils.escapeHtml = window.ChatbotUtils.escapeHtml;
// } else {
//   // 簡易的兜底 escapeHtml，但強烈建議使用 ChatbotUtils 中的版本
//   ChatbotRenderingUtils.escapeHtml = function(str) {
//     return String(str)
//       .replace(/&/g, '&amp;')
//       .replace(/</g, '&lt;')
//       .replace(/>/g, '&gt;')
//       .replace(/"/g, '&quot;')
//       .replace(/'/g, '&#39;');
//   };
// }