// js/chatbot/chatbot-mermaid-renderer.js

/**
 * 本地 HTML 轉義函式（用於錯誤訊息防護）
 * 如果 ChatbotUtils.escapeHtml 不可用時的降級方案
 * @param {string} str - 需要轉義的字串
 * @returns {string} 轉義後的安全字串
 */
function localEscapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
  });
}

/**
 * 安全地轉義 HTML（優先使用 ChatbotUtils，降級到本地實現）
 * @param {string} str - 需要轉義的字串
 * @returns {string} 轉義後的安全字串
 */
function safeEscapeHtml(str) {
  if (typeof window.ChatbotUtils !== 'undefined' && typeof window.ChatbotUtils.escapeHtml === 'function') {
    return window.ChatbotUtils.escapeHtml(str);
  }
  return localEscapeHtml(str);
}

/**
 * 渲染聊天內容中的所有 Mermaid 程式碼塊。
 *
 * 主要流程：
 * 1. 查詢所有 code.language-mermaid 程式碼塊。
 * 2. 對每個程式碼塊：
 *    - 清理和修正 Mermaid 程式碼（如去除 HTML 標籤、<br>等）。
 *    - 建立 div.mermaid 容器，設定唯一ID。
 *    - 使用 mermaid.init 渲染 SVG。
 *    - 渲染成功則顯示 SVG，並新增"放大"按鈕。
 *    - 渲染失敗則回退顯示上一次成功的 SVG，或顯示錯誤資訊。
 *    - 支援多次嘗試渲染（非同步載入 mermaid.js 時）。
 * @param {HTMLElement} chatBodyElement - 聊天訊息容器 DOM 元素。
 */
async function renderAllMermaidBlocksInternal(chatBodyElement) {
  if (!window.mermaidLoaded || typeof window.mermaid === 'undefined') return;
  if (!chatBodyElement) {
    console.warn('ChatbotMermaidRenderer: chatBodyElement 為空，跳過 Mermaid 渲染。');
    return;
  }

  // 按鈕新增輔助函式（避免程式碼重複）
  const addMermaidButtons = (mermaidDiv, currentCodeForError) => {
    setTimeout(() => {
      try {
        // 檢視程式碼按鈕
        if (!mermaidDiv.querySelector('.mermaid-code-btn')) {
          const codeBtn = document.createElement('button');
          codeBtn.className = 'mermaid-action-btn mermaid-code-btn';
          codeBtn.title = '檢視/隱藏程式碼';
          codeBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"></path><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.404a1.651 1.651 0 010 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.404zM10 15a5 5 0 100-10 5 5 0 000 10z" clip-rule="evenodd"></path></svg>`;
          codeBtn.style.cssText = `
            position:absolute; top:12px; right:48px;
            background: transparent; color: #64748b;
            border: none; border-radius: 6px; padding: 4px;
            cursor: pointer; opacity:0.7; transition: opacity 0.2s, background-color 0.2s;
            display:flex; align-items:center; justify-content:center;
          `;
          codeBtn.onmouseover = function() { this.style.opacity = '1'; this.style.backgroundColor = 'rgba(0,0,0,0.05)'; };
          codeBtn.onmouseout = function() { this.style.opacity = '0.7'; this.style.backgroundColor = 'transparent'; };
          codeBtn.onclick = function() {
            const codeContainer = mermaidDiv.querySelector('.mermaid-original-code');
            if (codeContainer) {
              if (codeContainer.style.display === 'none') {
                codeContainer.style.display = 'block';
              } else {
                codeContainer.style.display = 'none';
              }
            } else {
              const originalCode = document.createElement('pre');
              originalCode.className = 'mermaid-original-code';
              originalCode.style.cssText = `
                position:relative;
                background:#f8f9fa;
                border:1px solid #e9ecef;
                border-radius:6px;
                padding:12px;
                margin-top:12px;
                font-family:monospace;
                font-size:13px;
                white-space:pre-wrap;
                word-break:break-all;
                max-height:300px;
                overflow-y:auto;
              `;
              originalCode.textContent = currentCodeForError;
              const copyBtn = document.createElement('button');
              copyBtn.textContent = '複製';
              copyBtn.style.cssText = `
                position:absolute;top:8px;right:8px;
                background:#e9ecef;border:none;
                border-radius:4px;padding:2px 8px;
                font-size:12px;cursor:pointer;
              `;
              copyBtn.onclick = function(e) {
                e.stopPropagation();
                navigator.clipboard.writeText(currentCodeForError)
                  .then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '已複製!';
                    setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
                  })
                  .catch(err => {
                    console.error('複製失敗:', err);
                    alert('複製失敗: ' + err);
                  });
              };
              originalCode.appendChild(copyBtn);
              mermaidDiv.appendChild(originalCode);
            }
          };
          mermaidDiv.appendChild(codeBtn);
        }
        // 放大按鈕（完整功能複用）
        if (!mermaidDiv.querySelector('.mermaid-zoom-btn')) {
          const zoomBtn = document.createElement('button');
          zoomBtn.className = 'mermaid-action-btn mermaid-zoom-btn';
          zoomBtn.title = '放大檢視';
          zoomBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"></path><path fill-rule="evenodd" d="M9 5.5a.5.5 0 01.5.5v2.5h2.5a.5.5 0 010 1h-2.5v2.5a.5.5 0 01-1 0v-2.5h-2.5a.5.5 0 010-1h2.5v-2.5a.5.5 0 01.5-.5z" clip-rule="evenodd"></path></svg>`;
          zoomBtn.style.cssText = `
            position:absolute; top:12px; right:12px;
            background: transparent; color: #64748b;
            border: none; border-radius: 6px; padding: 4px;
            cursor: pointer; opacity:0.7; transition: opacity 0.2s, background-color 0.2s;
            display:flex; align-items:center; justify-content:center;
          `;
          zoomBtn.onmouseover = function() { this.style.opacity = '1'; this.style.backgroundColor = 'rgba(0,0,0,0.05)'; };
          zoomBtn.onmouseout = function() { this.style.opacity = '0.7'; this.style.backgroundColor = 'transparent'; };
          zoomBtn.onclick = function() {
            try {
              // 建立遮罩和彈出視窗，顯示 SVG 大圖
              const overlay = document.createElement('div');
              overlay.style.cssText = 'position:fixed;z-index:999999;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
              const popup = document.createElement('div');
              popup.style.cssText = 'background:var(--chatbot-bg, #fff);padding:24px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05);width:95vw;max-width:1200px;height:90vh;overflow:auto;position:relative;display:flex;flex-direction:column;align-items:center;';
              const title = document.createElement('div');
              title.textContent = 'Mermaid 圖表預覽';
              title.style.cssText = 'font-weight:bold;font-size:18px;margin-bottom:18px;';
              popup.appendChild(title);
              const svgInMermaidDiv = mermaidDiv.querySelector('svg');
              if (svgInMermaidDiv) {
                const svgClone = svgInMermaidDiv.cloneNode(true);
                svgClone.style.width = '100%';
                svgClone.style.maxWidth = '100%';
                svgClone.style.height = 'auto';
                svgClone.style.flexGrow = '1';
                svgClone.style.display = 'block';
                svgClone.style.margin = '0 auto 16px auto';
                popup.appendChild(svgClone);

                // 彈出視窗底部操作按鈕（匯出PNG、SVG、程式碼、Mermaid.live）
                const popupActions = document.createElement('div');
                popupActions.style.cssText = 'display:flex; flex-wrap:wrap; gap:12px; justify-content:center; padding-top:16px; border-top: 1px solid rgba(0,0,0,0.08); width:100%;';

                // Helper function to create icon buttons for popup
                const createPopupActionButton = (btnTitle, svgIcon, onClickAction) => {
                  const button = document.createElement('button');
                  button.title = btnTitle;
                  button.innerHTML = svgIcon;
                  button.style.cssText = `
                    background: rgba(0,0,0,0.05); color: #334155;
                    border: none; border-radius: 8px; padding: 8px 12px;
                    cursor: pointer; transition: background-color 0.2s, color 0.2s;
                    display: flex; align-items: center; gap: 6px; font-size: 13px;
                  `;
                  button.onmouseover = function() { this.style.backgroundColor = 'rgba(0,0,0,0.1)'; };
                  button.onmouseout = function() { this.style.backgroundColor = 'rgba(0,0,0,0.05)'; };
                  button.onclick = onClickAction;
                  popupActions.appendChild(button);
                  return button;
                };

                // Icons (Heroicons - Outline)
                const iconDownload = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>';
                const iconCode = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>';
                const iconExternalLink = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>';
                const iconPhoto = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.158 0L10.5 9.75M16.5 12L18 10.5m-1.5 1.5l-1.5-1.5m0 0L13.5 9.75M12 12.75l1.5-1.5" /></svg>';

                // Export PNG Button (使用 html2canvas)
                const exportPngBtn = createPopupActionButton('匯出PNG', iconPhoto + 'PNG', async function() {
                  try {
                    exportPngBtn.innerHTML = iconPhoto + '匯出中...';
                    exportPngBtn.disabled = true;

                    // 檢查 html2canvas 是否可用
                    if (typeof html2canvas === 'undefined') {
                      throw new Error('html2canvas 庫未載入');
                    }

                    // 建立一個臨時容器來包裹 SVG
                    const tempContainer = document.createElement('div');
                    tempContainer.style.cssText = 'position: absolute; left: -9999px; top: 0; background: white; padding: 20px;';
                    const svgForExport = svgClone.cloneNode(true);

                    // 獲取 SVG 的原始尺寸
                    const svgRect = svgClone.getBoundingClientRect();
                    const originalWidth = svgRect.width || 800;
                    const originalHeight = svgRect.height || 600;

                    // 放大 SVG 以提高畫質晰度
                    const scaleFactor = 4; // 4倍放大
                    svgForExport.setAttribute('width', originalWidth * scaleFactor);
                    svgForExport.setAttribute('height', originalHeight * scaleFactor);
                    svgForExport.style.display = 'block';
                    svgForExport.style.width = (originalWidth * scaleFactor) + 'px';
                    svgForExport.style.height = (originalHeight * scaleFactor) + 'px';

                    tempContainer.appendChild(svgForExport);
                    document.body.appendChild(tempContainer);

                    // 使用 html2canvas 螢幕截圖容器（高解析度）
                    const canvas = await html2canvas(tempContainer, {
                      backgroundColor: '#ffffff',
                      scale: 1, // SVG 已經放大了，這裡用 1 即可
                      logging: false,
                      useCORS: true,
                      allowTaint: true,
                      width: originalWidth * scaleFactor + 40, // 加上 padding
                      height: originalHeight * scaleFactor + 40
                    });

                    // 清理臨時容器
                    document.body.removeChild(tempContainer);

                    // 下載 PNG
                    canvas.toBlob(function(blob) {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'mermaid-diagram.png';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);

                      exportPngBtn.innerHTML = iconPhoto + '匯出PNG';
                      exportPngBtn.disabled = false;
                    }, 'image/png');

                  } catch (e) {
                    console.error('PNG 匯出失敗:', e);
                    alert('PNG 匯出失敗: ' + (e.message || e) + '\n\n建議：先匯出 SVG，然後使用線上工具轉換。');
                    exportPngBtn.innerHTML = iconPhoto + '匯出PNG';
                    exportPngBtn.disabled = false;
                  }
                });
                exportPngBtn.innerHTML = iconPhoto + '匯出PNG';

                // Export SVG Button
                const exportSvgBtn = createPopupActionButton('匯出SVG', iconDownload + 'SVG', function() {
                  try {
                    // 克隆 SVG 用於匯出
                    const svgCloneForExport = svgClone.cloneNode(true);

                    // 複製所有計算後的樣式到內聯樣式
                    const copyComputedStyles = (source, target) => {
                      const sourceElements = source.querySelectorAll('*');
                      const targetElements = target.querySelectorAll('*');
                      for (let i = 0; i < sourceElements.length && i < targetElements.length; i++) {
                        const computedStyle = window.getComputedStyle(sourceElements[i]);
                        const cssText = computedStyle.cssText;
                        if (cssText) {
                          targetElements[i].setAttribute('style', cssText);
                        }
                      }
                    };
                    copyComputedStyles(svgClone, svgCloneForExport);

                    const serializer = new XMLSerializer();
                    let svgString = serializer.serializeToString(svgCloneForExport);

                    // 新增 XML 宣告
                    svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;

                    // 確保有正確的名稱空間
                    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
                      svgString = svgString.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"');
                    }

                    const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'mermaid-diagram.svg';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                  } catch (e) {
                    console.error('SVG 匯出失敗:', e);
                    alert('SVG 匯出失敗: ' + (e.message || e));
                  }
                });
                exportSvgBtn.innerHTML = iconDownload + '匯出SVG';

                // Export Code Button
                const exportCodeBtn = createPopupActionButton('匯出程式碼', iconCode + 'MMD', function() {
                  const blob = new Blob([currentCodeForError], {type: 'text/plain'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'mermaid-code.mmd';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                });
                exportCodeBtn.innerHTML = iconCode + '匯出MMD';

                // Open in Mermaid.live Button
                const openLiveBtn = createPopupActionButton('在Mermaid.live中開啟', iconExternalLink + 'Mermaid.live', function() {
                  const data = { code: currentCodeForError, mermaid: { theme: 'default' } };
                  const json = JSON.stringify(data);
                  const encoded = btoa(unescape(encodeURIComponent(json)));
                  const liveUrl = `https://mermaid.live/edit#${encoded}`;
                  window.open(liveUrl, '_blank');
                });
                openLiveBtn.innerHTML = iconExternalLink + 'Mermaid.live';

                popup.appendChild(popupActions);
              }

              // 關閉按鈕
              const closeBtn = document.createElement('button');
              closeBtn.title = '關閉';
              closeBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"></path></svg>`;
              closeBtn.style.cssText = `
                position:absolute; top:16px; right:16px;
                background: transparent; color: #64748b;
                border: none; border-radius: 50%; padding: 6px;
                cursor: pointer; opacity:0.7; transition: opacity 0.2s, background-color 0.2s;
                display:flex; align-items:center; justify-content:center;
              `;
              closeBtn.onmouseover = function() { this.style.opacity = '1'; this.style.backgroundColor = 'rgba(0,0,0,0.05)';};
              closeBtn.onmouseout = function() { this.style.opacity = '0.7'; this.style.backgroundColor = 'transparent';};
              closeBtn.onclick = function() { document.body.removeChild(overlay); };
              popup.appendChild(closeBtn);
              overlay.appendChild(popup);
              document.body.appendChild(overlay);
            } catch (e) {
              alert('放大預覽彈出視窗出錯：'+(e.message||e));
            }
          };
          mermaidDiv.appendChild(zoomBtn);
        }
      } catch (btnError) {
        console.error('新增按鈕時發生錯誤:', btnError);
      }
    }, 100);
  };

  // 查詢所有 mermaid 程式碼塊（code.language-mermaid 或 pre code.language-mermaid）
  const mermaidBlocks = chatBodyElement.querySelectorAll('code.language-mermaid, pre code.language-mermaid');

  // 使用 for...of 替代 forEach，確保順序執行，避免競態條件
  let blockIndex = 0;
  for (const block of mermaidBlocks) {
    const idx = blockIndex++;
    let currentCodeForError = '';

    try {
      // 檢查是否已經渲染過（防止重複渲染）
      if (block.hasAttribute('data-mermaid-rendered')) {
        console.log(`Mermaid 程式碼塊 ${idx} 已渲染，跳過`);
        continue;
      }

      // 標記為正在渲染
      block.setAttribute('data-mermaid-rendered', 'true');
      // 增強的程式碼清理和預處理
      let rawCode = block.textContent || '';
      if (!rawCode.trim()) {
        console.warn('ChatbotMermaidRenderer: 空的Mermaid程式碼塊，跳過處理');
        return;
      }

      currentCodeForError = rawCode; // Assign for potential error reporting

      // 1. 將 <br> 標籤替換為換行
      rawCode = rawCode.replace(/<br\s*\/?\>/gi, '\n');

      // 2. 移除所有 HTML 標籤，但保留內容
      rawCode = rawCode.replace(/<[^>]+>/g, '');

      // 3. 移除零寬字元和特殊空白字元
      rawCode = rawCode.replace(/[\u200B-\u200D\uFEFF]/g, '');

      // 4. 統一換行字元為 \n
      rawCode = rawCode.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // 5. 移除多餘的空行（超過2個連續換行）
      rawCode = rawCode.replace(/\n{3,}/g, '\n\n');

      // 6. 移除每行首尾空白，但保持縮排結構
      rawCode = rawCode.split('\n').map(line => line.trimEnd()).join('\n');

      // 7. **關鍵修正：處理節點標籤內的多行文字**
      // Mermaid 不支援 [...] 內的換行字元，需要將多行標籤轉為單行
      rawCode = rawCode.replace(/([A-Za-z0-9_]+)\[([^\]]+)\]/g, (match, nodeId, labelContent) => {
        // 將標籤內的換行替換為空格
        let cleanLabel = labelContent.replace(/\n+/g, ' ');
        // 壓縮多餘空格
        cleanLabel = cleanLabel.replace(/\s+/g, ' ').trim();
        // **替換特殊符號為全形（避免 Mermaid 解析錯誤）**
        cleanLabel = cleanLabel
          .replace(/\[/g, '［')  // 方括號左
          .replace(/\]/g, '］')  // 方括號右
          .replace(/\(/g, '（')
          .replace(/\)/g, '）')
          .replace(/\|/g, '｜');
        // 限制標籤長度（最多80字元）
        if (cleanLabel.length > 80) {
          cleanLabel = cleanLabel.substring(0, 77) + '...';
        }
        return `${nodeId}[${cleanLabel}]`;
      });

      // 8. 修正常見的語法錯誤
      // 8.1 修正箭頭語法（-- > 改為 -->）
      rawCode = rawCode.replace(/--\s+>/g, '-->');
      rawCode = rawCode.replace(/<\s+--/g, '<--');

      // 8.2 修正節點定義後多餘的節點名（A[text]A --> B 改為 A[text] --> B）
      // 必須在 8.3 之前執行，避免誤判
      // 比對：節點ID + [ + 內容(可能包含全形］) + ] + 重複的節點ID
      rawCode = rawCode.replace(/([A-Za-z0-9_]+)\[([^\]]*(?:］[^\]]*)*)\]\1(?=\s|$)/g, '$1[$2]');

      // 8.3 修正節點定義後缺少空格的問題（]D --> 改為 ]\nD -->）
      // 只處理半形右括號後緊跟字母的情況
      rawCode = rawCode.replace(/\]([A-Za-z0-9_]+)(\s+-->)/g, ']\n$1$2');
      rawCode = rawCode.replace(/\]([A-Za-z0-9_]+)(\s*$)/gm, ']\n$1');

      // 8.4 修復缺少箭頭的節點連線
      // 修復菱形節點缺少結束花括號的情況（如 J{文字 K[...] 改為 J{文字} --> K[...]）
      rawCode = rawCode.replace(/\{([^}]*?)\s{2,}([A-Z][A-Za-z0-9_]*)\[/g, '{$1} --> $2[');
      // 修復 }  [  或 }[  的情況（菱形節點後缺少箭頭）
      rawCode = rawCode.replace(/\}(\s{2,}|\s*)\[/g, '} --> [');
      // 修復 ]  [  的情況（方括號節點後缺少箭頭，至少2個空格）
      rawCode = rawCode.replace(/\](\s{2,})\[/g, '] --> [');
      // 修復 )  [  的情況（圓括號節點後缺少箭頭）
      rawCode = rawCode.replace(/\)(\s{2,})\[/g, ') --> [');

      // 8.5 移除空的 graph 宣告
      rawCode = rawCode.replace(/^\s*graph\s*$/gim, '');

      // 9. 修正 subgraph 語法
      rawCode = rawCode.replace(/^\s*subgraph\s+([^\n]+)$/gm, (match, name) => {
        // 移除 subgraph 名稱中的括號內容
        let cleanName = name.replace(/\([^\)]*\)/g, '').trim();
        // 移除逗號和句號
        cleanName = cleanName.replace(/[.,，。]/g, '');
        // 壓縮多餘空格
        cleanName = cleanName.replace(/\s+/g, ' ');
        return cleanName ? `subgraph ${cleanName}` : 'subgraph';
      });

      // 10. 修正 class 語句語法（移除多餘的 class 關鍵字）
      // 例如：class A,B,C class stage1 → class A,B,C stage1
      rawCode = rawCode.replace(/^\s*class\s+([A-Za-z0-9_,\s]+)\s+class\s+([A-Za-z0-9_]+)\s*$/gm, 'class $1 $2');

      // 11. Trim 最終結果
      rawCode = rawCode.trim();
      // 選擇父節點（相容 pre > code 或單獨 code）
      let parent;
      try {
        parent = block.parentElement.tagName === 'PRE' ? block.parentElement : block;
      } catch (e) {
        parent = block; // 兜底
      }
      const code = rawCode;
      currentCodeForError = code;

      // 建立 Mermaid 渲染容器
      const mermaidDiv = document.createElement('div');

      // 生成絕對唯一的 ID（使用時間戳 + 索引 + 隨機數 + 效能計時器）
      const uniqueId = `mermaid-${Date.now()}-${idx}-${Math.floor(Math.random()*100000)}-${Math.floor(performance.now()*1000)}`;
      mermaidDiv.className = 'mermaid';
      mermaidDiv.id = uniqueId;
      mermaidDiv.setAttribute('data-mermaid-index', idx.toString());
      // 卡片樣式
      mermaidDiv.style.background = 'var(--chatbot-bg, #fff)';
      mermaidDiv.style.borderRadius = '12px';
      mermaidDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)';
      mermaidDiv.style.padding = '20px';
      mermaidDiv.style.position = 'relative';
      mermaidDiv.style.width = 'fit-content';
      mermaidDiv.style.maxWidth = '100%';
      mermaidDiv.style.margin = '12px auto';
      mermaidDiv.textContent = code;

      // 檢查內容有效性
      const codeTrimmed = code.replace(/\s+/g, '');
      if (!codeTrimmed || /^graph(TD|LR|RL|BT|TB)?$/i.test(codeTrimmed)) {
        mermaidDiv.innerHTML = '<div style="color:#64748b;">無有效Mermaid內容</div>';
        parent.replaceWith(mermaidDiv);
        return;
      }

      // 記錄上一次渲染成功的 SVG（用於回退）
      let lastSVG = null;
      if (parent.id && parent.id.startsWith('mermaid-') && parent.querySelector('svg')) {
        lastSVG = parent.querySelector('svg').cloneNode(true);
      } else if (parent.firstElementChild && parent.firstElementChild.id && parent.firstElementChild.id.startsWith('mermaid-') && parent.firstElementChild.querySelector('svg')){
        lastSVG = parent.firstElementChild.querySelector('svg').cloneNode(true);
      }

      // 用新的 mermaidDiv 替換原始碼塊
      parent.replaceWith(mermaidDiv);

      try {
        // 使用 mermaid.init 渲染 SVG
        await window.mermaid.init(undefined, '#' + uniqueId);
        // 渲染成功，清除錯誤邊框
        mermaidDiv.style.border = '';
        const existingWarning = mermaidDiv.querySelector('.mermaid-render-warning');
        if (existingWarning) existingWarning.remove();

        // 新增按鈕
        addMermaidButtons(mermaidDiv, currentCodeForError);
      } catch (renderError) {
        /**
         * Mermaid 渲染失敗處理（增強版）：
         * 1. 自動嘗試多級修正（無需 data-mermaid-final 標記）
         * 2. 若修正成功則渲染，否則繼續下一個修正
         * 3. 若所有修正都失敗，顯示詳細錯誤資訊
         * 4. 若有上一次成功 SVG，可回退顯示
         */
        console.warn('Mermaid 初次渲染失敗，嘗試自動修正...', renderError);

        // 增強的修正函式集合（從最保守到最激進）
        const mermaidFixers = [
          // 修正0a: 修復缺少箭頭的節點連線（如 J{text}  K[text] 改為 J{text} --> K[text]）
          code => {
            // 修復菱形節點缺少結束花括號的情況
            code = code.replace(/\{([^}]*?)\s{2,}([A-Z][A-Za-z0-9_]*)\[/g, '{$1} --> $2[');
            // 修復 }  [  或 }[  的情況（菱形節點後缺少箭頭）
            code = code.replace(/\}(\s{2,}|\s*)\[/g, '} --> [');
            // 修復 ]  [  的情況（方括號節點後缺少箭頭）
            code = code.replace(/\](\s{2,})\[/g, '] --> [');
            // 修復 )  [  的情況（圓括號節點後缺少箭頭）
            code = code.replace(/\)(\s{2,})\[/g, ') --> [');
            return code;
          },
          // 修正0b: 處理節點標籤中的括號、方括號和管道符（最常見問題）
          code => {
            return code.replace(/\[([^\]]+)\]/g, (match, labelContent) => {
              let cleanLabel = labelContent
                .replace(/\[/g, '［')  // 方括號左
                .replace(/\]/g, '］')  // 方括號右
                .replace(/\(/g, '（')
                .replace(/\)/g, '）')
                .replace(/\|/g, '｜');
              return `[${cleanLabel}]`;
            });
          },
          // 修正1: 處理多行文字和長度限制
          code => {
            return code.replace(/\[([^\]]+)\]/g, (match, labelContent) => {
              let cleanLabel = labelContent.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
              if (cleanLabel.length > 60) {
                cleanLabel = cleanLabel.substring(0, 57) + '...';
              }
              return `[${cleanLabel}]`;
            });
          },
          // 修正2: 修正常見的引號問題
          code => {
            return code.replace(/["']/g, '');
          },
          // 修正3: 將節點標籤中的斜槓替換為全形
          code => {
            return code.replace(/\[([^\]]*)\]/g, match => match.replace(/\//g, '／'));
          },
          // 修正4: 移除節點標籤中的冒號和破折號
          code => {
            return code.replace(/\[([^\]]*)\]/g, match => match.replace(/[:\-]/g, ''));
          },
          // 修正5: 將所有特殊符號替換為全形或空格
          code => {
            return code.replace(/\[([^\]]*)\]/g, match => {
              return match
                .replace(/\(/g, '（')
                .replace(/\)/g, '）')
                .replace(/\|/g, '｜')
                .replace(/</g, '＜')
                .replace(/>/g, '＞')
                .replace(/\{/g, '｛')
                .replace(/\}/g, '｝');
            });
          },
          // 修正6: 極端修正 - 只保留節點內的中英文、數字和常見符號
          code => {
            return code.replace(/\[([^\]]*)\]/g, match => {
              return match.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\[\]\s\.]/g, '');
            });
          },
          // 修正7: 最激進 - 簡化所有節點名稱為純文字
          code => {
            return code.replace(/\[([^\]]*)\]/g, match => {
              const inner = match.slice(1, -1).trim();
              // 只保留前20個字元
              return '[' + inner.substring(0, 20).replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '') + ']';
            });
          }
        ];

        let fixSuccess = false;
        let successfulCode = null;

        for (let i = 0; i < mermaidFixers.length && !fixSuccess; i++) {
          try {
            const fixedCode = mermaidFixers[i](code);
            if (fixedCode === code) continue; // 跳過沒有改變的修正

            // 重新設定 mermaid div 內容
            mermaidDiv.textContent = fixedCode;
            await window.mermaid.init(undefined, '#' + uniqueId);

            // 驗證 SVG 是否真正生成
            const svgElement = mermaidDiv.querySelector('svg');
            if (!svgElement) {
              console.warn(`修正器 ${i + 1} 執行完成但未生成 SVG`);
              continue; // 未生成 SVG，嘗試下一個修正器
            }

            // 修正成功！
            fixSuccess = true;
            successfulCode = fixedCode;
            console.log(`Mermaid 修正成功 (修正器 ${i + 1})`, fixedCode);

            // 清除錯誤邊框
            mermaidDiv.style.border = '';

            // 顯示警告提示
            const warningDiv = document.createElement('div');
            warningDiv.className = 'mermaid-auto-fix-warning';
            warningDiv.style.cssText = `
              color: #d97706;
              font-size: 12px;
              background: #fef3c7;
              border: 1px solid #fcd34d;
              border-radius: 6px;
              padding: 8px 12px;
              margin-top: 12px;
              text-align: center;
            `;
            warningDiv.innerHTML = `
              <strong>⚠️ 已自動修正語法</strong><br>
              原始程式碼存在語法問題，已應用修正器 ${i + 1} 進行渲染
            `;
            mermaidDiv.appendChild(warningDiv);

            // 更新 currentCodeForError 為修正後的程式碼
            currentCodeForError = fixedCode;

            // 新增按鈕
            addMermaidButtons(mermaidDiv, currentCodeForError);

            break;
          } catch (e) {
            // 這個修正器失敗了，繼續嘗試下一個
            console.warn(`修正器 ${i + 1} 失敗:`, e);
          }
        }

        // 如果所有修正都失敗
        if (!fixSuccess) {
          // XSS 防護：安全地轉義錯誤訊息和程式碼
          const escapedErrorMessage = safeEscapeHtml(renderError.str || renderError.message);
          const escapedCode = safeEscapeHtml(currentCodeForError);

          if (lastSVG) {
            // 回退到上一次成功的 SVG
            mermaidDiv.innerHTML = '';
            mermaidDiv.appendChild(lastSVG);
            mermaidDiv.style.border = '2px dashed #f59e0b';
            let warn = mermaidDiv.querySelector('.mermaid-render-warning');
            if (!warn) {
              warn = document.createElement('div');
              warn.className = 'mermaid-render-warning';
              warn.style.cssText = 'color:#d97706;font-size:12px;margin-top:4px;text-align:center;';
              mermaidDiv.appendChild(warn);
            }
            warn.textContent = '⚠️ 當前程式碼解析失敗，顯示上一版本。錯誤: ' + escapedErrorMessage;
          } else {
            // 顯示詳細錯誤資訊
            mermaidDiv.innerHTML = `
              <div style="color:#e53e3e;font-weight:bold;margin-bottom:8px;">
                ❌ Mermaid 渲染失敗
              </div>
              <div style="color:#64748b;font-size:13px;margin-bottom:8px;">
                錯誤資訊: ${escapedErrorMessage}
              </div>
              <details style="margin-top:8px;">
                <summary style="cursor:pointer;color:#6366f1;font-size:13px;font-weight:500;">
                  檢視原始程式碼
                </summary>
                <pre style="color:#64748b;font-size:12px;background:#f3f4f6;border-radius:6px;padding:8px 12px;overflow-x:auto;margin-top:8px;white-space:pre-wrap;word-break:break-all;">${escapedCode}</pre>
              </details>
              <div style="margin-top:12px;font-size:12px;color:#64748b;">
                💡 提示: 可嘗試在 <a href="https://mermaid.live" target="_blank" style="color:#6366f1;text-decoration:underline;">Mermaid.live</a> 中除錯程式碼
              </div>
            `;
            mermaidDiv.style.border = '2px solid #e53e3e';
          }
        }
      }
    } catch (generalBlockError) {
      // 兜底：處理 block 解析或 DOM 操作異常
      // XSS 防護：安全地轉義錯誤訊息
      const escapedGeneralErrorMessage = safeEscapeHtml(generalBlockError.message);
      console.error('處理Mermaid block時發生一般錯誤:', generalBlockError, block);
      let errorDisplayDiv = block.parentElement || document.createElement('div');
      if (block.parentElement) {
         let tempDiv = document.createElement('div');
         tempDiv.innerHTML = '<div style="color:#e53e3e;">Mermaid block處理異常: ' + escapedGeneralErrorMessage + '</div>';
         block.replaceWith(tempDiv);
      } else {
        block.innerHTML = '<div style="color:#e53e3e;">Mermaid block處理異常: ' + escapedGeneralErrorMessage + '</div>';
      }
    }
  } // 結束 for...of 迴圈
}

// 掛載到全域名稱空間
if (typeof window.ChatbotRenderingUtils === 'undefined') {
  window.ChatbotRenderingUtils = {};
}
window.ChatbotRenderingUtils.renderAllMermaidBlocks = renderAllMermaidBlocksInternal;