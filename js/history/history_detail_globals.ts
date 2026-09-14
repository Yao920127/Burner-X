// ---- 一鍵遮蔽非錯誤 console.log ----
const PRODUCTION_MODE = false; // 設定為 true 來遮蔽 console.log, false 則不遮蔽
if (PRODUCTION_MODE) {
  const originalConsoleLog = console.log;
  console.log = function() {
    // 可以選擇在這裡什麼都不做，或者記錄到一個備用日誌系統
    // originalConsoleLog.apply(console, arguments); // 如果需要，可以取消註釋來保留原始日誌
  };
}

// ========== 新增：防止 showTab 重複渲染的鎖 ==========
let renderingTab = null;
// =====================================================


let isOriginalFirstInChunkCompare = true; // 狀態變數：原文是否在左側
let docIdForLocalStorage = null; // To store the current document ID for localStorage keys
window.docIdForLocalStorage = null; // 將變數掛載到 window 物件上，使其成為全域變數
var currentVisibleTabId = null;  // To store the ID of the currently visible tab
window.currentVisibleTabId = null; // 將變數掛載到 window 物件上，使其成為全域變數
// let progressPercentageSpan = null; // MOVED to dock_logic.js
// let progressPercentageVerboseSpan = null; // MOVED to dock_logic.js
// let dockElement = null; // MOVED to dock_logic.js

// NEW FUNCTION DEFINITION
function getCurrentScrollableElementForHistoryDetail() {
    // console.log(`[getCurrentScrollableElementForHistoryDetail] 開始查詢可滾動元素, 沉浸模式=${window.ImmersiveLayout && window.ImmersiveLayout.isActive() ? '是' : '否'}`);

    if (window.ImmersiveLayout && window.ImmersiveLayout.isActive()) {
        const immersiveMainArea = document.getElementById('immersive-main-content-area');
        // console.log(`[getCurrentScrollableElementForHistoryDetail] 找到immersiveMainArea:`, immersiveMainArea ? true : false);

        if (immersiveMainArea) {
            // Try to find the specific, scrollable tab content area first
            const tabContentScroller = immersiveMainArea.querySelector('.tab-content[style*="overflow-y: auto"], .tab-content[style*="overflow: auto"]');
            // console.log(`[getCurrentScrollableElementForHistoryDetail] 嘗試查詢tabContentScroller:`, tabContentScroller ? {
            //     id: tabContentScroller.id || '無ID',
            //     className: tabContentScroller.className || '無類名',
            //     overflowY: tabContentScroller.style.overflowY,
            //     overflow: tabContentScroller.style.overflow,
            //     computedOverflowY: window.getComputedStyle(tabContentScroller).overflowY
            // } : '未找到');

            if (tabContentScroller) return tabContentScroller;

            // Fallback: look for a .content-wrapper or .chunk-compare-container within .tab-content
            const activeTabContentBlock = immersiveMainArea.querySelector('.tab-content .content-wrapper, .tab-content .chunk-compare-container');
            // console.log(`[getCurrentScrollableElementForHistoryDetail] 嘗試查詢activeTabContentBlock:`, activeTabContentBlock ? {
            //     id: activeTabContentBlock.id || '無ID',
            //     className: activeTabContentBlock.className || '無類名'
            // } : '未找到');

            if (activeTabContentBlock) {
                // It might be that the .tab-content itself is the designated scroller
                const parentTabContent = activeTabContentBlock.closest('.tab-content');
                // console.log(`[getCurrentScrollableElementForHistoryDetail] 嘗試查詢parentTabContent:`, parentTabContent ? {
                //     id: parentTabContent.id || '無ID',
                //     className: parentTabContent.className || '無類名',
                //     overflowY: parentTabContent.style.overflowY,
                //     overflow: parentTabContent.style.overflow,
                //     computedOverflowY: window.getComputedStyle(parentTabContent).overflowY
                // } : '未找到');

                if (parentTabContent && (parentTabContent.style.overflowY === 'auto' || parentTabContent.style.overflow === 'auto' ||
                                       window.getComputedStyle(parentTabContent).overflowY === 'auto')) {
                    // console.log(`[getCurrentScrollableElementForHistoryDetail] 返回parentTabContent作為滾動元素`);
                    return parentTabContent;
                }
                // console.log(`[getCurrentScrollableElementForHistoryDetail] 返回activeTabContentBlock作為滾動元素`);
                return activeTabContentBlock; // Fallback to the content wrapper itself if .tab-content isn't the scroller
            }
            // Fallback to the general .container if present inside immersive main area
            const containerInImmersive = immersiveMainArea.querySelector('.container');
            // console.log(`[getCurrentScrollableElementForHistoryDetail] 嘗試查詢containerInImmersive:`, containerInImmersive ? {
            //     id: containerInImmersive.id || '無ID',
            //     className: containerInImmersive.className || '無類名'
            // } : '未找到');

            if(containerInImmersive) {
                // console.log(`[getCurrentScrollableElementForHistoryDetail] 返回containerInImmersive作為滾動元素`);
                return containerInImmersive;
            }

            // console.log(`[getCurrentScrollableElementForHistoryDetail] 返回immersiveMainArea作為滾動元素`);
            return immersiveMainArea; // Last fallback for immersive mode
        }
    }

    // 非沉浸模式：使用 .app-main（側邊欄版面中的主內容區）
    const appMain = document.querySelector('.app-main');
    if (appMain) {
        // console.log(`[getCurrentScrollableElementForHistoryDetail] 返回.app-main作為滾動元素`);
        return appMain;
    }

    // 最終回退到 document.documentElement（舊版面或特殊情況）
    // console.log(`[getCurrentScrollableElementForHistoryDetail] 返回document.documentElement作為滾動元素`);
    return document.documentElement;
}

function adjustLongHeadingsToParagraphs(parentElement) {
  if (!parentElement) return;

  // console.log('[adjustLongHeadingsToParagraphs] 開始處理，父元素:', parentElement);

  // 建立一個陣列來儲存所有需要處理的markdown-body元素
  let markdownBodies = [];

  // 檢查父元素本身是否有markdown-body類
  if (parentElement.classList && parentElement.classList.contains('markdown-body')) {
    markdownBodies.push(parentElement);
    // console.log('[adjustLongHeadingsToParagraphs] 父元素本身是markdown-body');
  }

  // 查詢父元素內的所有markdown-body元素
  const childMarkdownBodies = parentElement.querySelectorAll('.markdown-body');
  childMarkdownBodies.forEach(el => {
    if (!markdownBodies.includes(el)) { // 避免重複
      markdownBodies.push(el);
    }
  });

  // console.log('[adjustLongHeadingsToParagraphs] 找到 markdown-body 元素數量:', markdownBodies.length);

  markdownBodies.forEach((markdownBody, mbIdx) => {
    const headings = Array.from(markdownBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    //console.log(`[adjustLongHeadingsToParagraphs] markdown-body #${mbIdx} 中找到標題元素數量:`, headings.length);

    // 逆序走訪，防止DOM結構變化影響
    for (let hIdx = headings.length - 1; hIdx >= 0; hIdx--) {
      const heading = headings[hIdx];
      // Skip the main fileName heading if it's somehow caught by this logic
      if (heading.id === 'fileName') {
          // console.log('[adjustLongHeadingsToParagraphs] 跳過 fileName 標題');
          continue;
      }

      // 補丁：如果沒有 id，分配唯一 id
      if (!heading.id) heading.id = 'auto-hx-' + hIdx;

      const textContent = heading.textContent || "";
      //console.log(`[adjustLongHeadingsToParagraphs] 標題 #${hIdx} (${heading.tagName}), ID: ${heading.id}, 文字長度: ${textContent.length}, 文字: "${textContent.substring(0, 50)}${textContent.length > 50 ? '...' : ''}"`);

      if (textContent.length > 30) {
        //console.log(`[adjustLongHeadingsToParagraphs] 標題 #${hIdx} 文字長度 > 30，準備轉換為段落`);

        try {
          const p = document.createElement('p');
          const originalTagName = heading.tagName.toLowerCase(); // 儲存原始標籤名

          // 遞迴移動所有子節點，徹底保留結構
          while (heading.firstChild) {
            p.appendChild(heading.firstChild);
          }

          // Copy all attributes from heading to p
          for (let i = 0; i < heading.attributes.length; i++) {
            const attr = heading.attributes[i];
            p.setAttribute(attr.name, attr.value);
          }

          // Add a class to indicate this was a converted heading,
          // in case specific styling is needed later.
          p.classList.add('converted-from-heading');
          p.dataset.originalTag = originalTagName; // 將原始標籤名儲存到 data-* 屬性
          p.style.fontWeight = 'bold'; // 直接設定字型加粗

          heading.parentNode.replaceChild(p, heading);
          //console.log(`[adjustLongHeadingsToParagraphs] 成功將標題 #${hIdx} 轉換為段落（遞迴移動子節點）`);
        } catch (error) {
          console.error(`[adjustLongHeadingsToParagraphs] 轉換標題 #${hIdx} 時出錯:`, error);
        }
      }
    }
  });

  // console.log('[adjustLongHeadingsToParagraphs] 處理完成');
}

function debounce(func, delay) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

function saveScrollPosition() {
  if (!docIdForLocalStorage || !currentVisibleTabId) return;
  const scrollableElement = getCurrentScrollableElementForHistoryDetail();
  const isImmersive = window.ImmersiveLayout && window.ImmersiveLayout.isActive();
  const modePrefix = isImmersive ? 'immersive_' : 'normal_';

  if (scrollableElement) {
    const scrollKey = `scrollPos_${modePrefix}${docIdForLocalStorage}_${currentVisibleTabId}`;
    localStorage.setItem(scrollKey, scrollableElement.scrollTop);

    let bestAnchorId = null;
    if (typeof window.getTocNodes === 'function') {
        const tocElements = window.getTocNodes(); // 獲取TOC節點
        let minPositiveTop = Infinity;
        let lastVisibleAboveFoldId = null;

        for (const el of tocElements) {
            if (!el || !el.id) continue;
            const rect = el.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

            if (rect.top >= 0 && rect.top < viewportHeight / 3) { // 在視口頂部三分之一
                if (rect.top < minPositiveTop) {
                    minPositiveTop = rect.top;
                    bestAnchorId = el.id;
                }
            } else if (rect.bottom < 0) { // 完全滾出視口上方
                lastVisibleAboveFoldId = el.id; // 記錄最後一個滾出上方的
            }
        }
        if (!bestAnchorId && lastVisibleAboveFoldId) { // 如果頂部三分之一沒有，用最後一個滾出上方的
            bestAnchorId = lastVisibleAboveFoldId;
        }
    }

    if (bestAnchorId) {
        const anchorKey = `scrollAnchorId_${modePrefix}${docIdForLocalStorage}_${currentVisibleTabId}`;
        localStorage.setItem(anchorKey, bestAnchorId);
        // console.log(`[saveScrollPosition] 儲存滾動錨點: ${anchorKey} = ${bestAnchorId}`);
    } else {
        const anchorKey = `scrollAnchorId_${modePrefix}${docIdForLocalStorage}_${currentVisibleTabId}`;
        localStorage.removeItem(anchorKey); // 如果沒有合適的錨點，清除舊的
        // console.log(`[saveScrollPosition] 未找到合適錨點，清除舊錨點 (如有): ${anchorKey}`);
    }

    // console.log(`[saveScrollPosition] 儲存滾動位置: ${scrollKey} = ${scrollableElement.scrollTop}, 元素: ${scrollableElement.tagName}, 模式: ${isImmersive ? '沉浸式' : '普通'}`, {
    //   元素ID: scrollableElement.id || '無ID',
    //   元素類名: scrollableElement.className || '無類名',
    //   元素標籤: scrollableElement.tagName,
    //   scrollTop: scrollableElement.scrollTop,
    //   scrollHeight: scrollableElement.scrollHeight,
    //   clientHeight: scrollableElement.clientHeight,
    //   maxScrollTop: scrollableElement.scrollHeight - scrollableElement.clientHeight,
    //   scrollPercent: ((scrollableElement.scrollTop / (scrollableElement.scrollHeight - scrollableElement.clientHeight)) * 100).toFixed(2) + '%',
    //   路徑: getElementPath(scrollableElement),
    //   錨點ID: bestAnchorId
    // });
  } else {
    console.warn(`[saveScrollPosition] 未找到可滾動元素，無法儲存滾動位置`);
  }
}

// 使用debounce函式建立一個防抖動的儲存滾動位置函式
const debouncedSaveScrollPosition = debounce(saveScrollPosition, 200);

// 動態綁定/解綁滾動事件到當前滾動容器
let lastScrollableElementForSave = null;

function bindScrollForSavePosition() {
  // 解綁舊的滾動監聽
  if (lastScrollableElementForSave) {
    lastScrollableElementForSave.removeEventListener('scroll', debouncedSaveScrollPosition);
    lastScrollableElementForSave = null;
  }

  // 獲取當前滾動元素
  const el = getCurrentScrollableElementForHistoryDetail();
  if (el) {
    console.log(`[bindScrollForSavePosition] 綁定滾動事件到元素:`, el.id || el.className || el.tagName);
    el.addEventListener('scroll', debouncedSaveScrollPosition);
    lastScrollableElementForSave = el;
  } else {
    console.warn(`[bindScrollForSavePosition] 未找到可滾動元素，無法綁定滾動事件`);
  }
}

function unbindScrollForSavePosition() {
  if (lastScrollableElementForSave) {
    lastScrollableElementForSave.removeEventListener('scroll', debouncedSaveScrollPosition);
    lastScrollableElementForSave = null;
  }
}

// 輔助函式：獲取元素的DOM路徑
function getElementPath(element) {
  if (!element) return "null";
  let path = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let selector = element.nodeName.toLowerCase();
    if (element.id) {
      selector += '#' + element.id;
      path.unshift(selector);
      break;
    } else {
      let sibling = element;
      let siblingIndex = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.nodeName.toLowerCase() === selector) siblingIndex++;
      }
      if (siblingIndex > 1) selector += ':nth-of-type(' + siblingIndex + ')';
    }
    path.unshift(selector);
    element = element.parentNode;
  }
  return path.join(' > ');
}

function saveChatbotStateOnUnload() {
  if (docIdForLocalStorage && typeof window.isChatbotOpen !== 'undefined') {
    localStorage.setItem(`chatbotOpenState_${docIdForLocalStorage}`, window.isChatbotOpen);
    // console.log(`Saved chatbot state on beforeunload for ${docIdForLocalStorage}: ${window.isChatbotOpen}`);
  }
}

// MOVED to dock_logic.js: function updateReadingProgress() { ... }
// MOVED to dock_logic.js: const debouncedUpdateReadingProgress = debounce(updateReadingProgress, 100);

// MOVED to dock_logic.js: function updateHighlightSummary() { ... }
// MOVED to dock_logic.js: function updateAnnotationSummary() { ... }
// MOVED to dock_logic.js: function updateImageCount() { ... }
// MOVED to dock_logic.js: function updateTableCount(contentElement) { ... }
// MOVED to dock_logic.js: function updateFormulaCount(contentElement) { ... }
// MOVED to dock_logic.js: function updateWordCount(contentElement) { ... }
// MOVED to dock_logic.js: function updateAllDockStats() { ... }

/**
 * 預處理 Markdown 文字，以安全地渲染圖片、自定義語法（如上下標）併相容 KaTeX。
 * - 將 Markdown 中的本地圖片參考 (e.g., `![alt](images/img-1.jpeg.png)`) 替換為 Base64 嵌入式圖片。
 * - 解析自定義的上下標語法 (e.g., `${base}^{sup}$`, `${base}_{sub}$`) 並轉換為 HTML `<sup>` 和 `<sub>` 標籤。
 * - 其他如 `$formula$` 和 `$$block formula$$` 的 LaTeX 標記會保留，交由後續的 `renderWithKatexFailback` 處理。
 *
 * @param {string} md -輸入的 Markdown 文字。
 * @param {Array<Object>} images -一個包含圖片物件的陣列，每個物件應有 `name` 或 `id` (用於比對) 和 `data` (Base64 圖片資料或其字首)。
 * @returns {string} 處理後的 Markdown 文字，其中圖片被替換，自定義語法被轉換。
 */
// MOVED to js/markdown_processor.js: function safeMarkdown(md, images) { ... }

/**
 * 使用 KaTeX 渲染 Markdown 文字中的數學公式，並提供降級處理。
 * 它會按以下順序處理：
 * 1. 將長度較短 (<=10字元) 的塊級公式 `$$...$$` 轉換為行內公式 `$...\$`。
 * 2. 嘗試使用 KaTeX 渲染行內公式 `$...\$`。如果渲染失敗，則將公式內容包裹在 `<code>` 標籤中顯示。
 * 3. 嘗試使用 KaTeX 渲染剩餘的（通常是多行的）塊級公式 `$$...$$`。如果渲染失敗，則同樣包裹在 `<code>` 標籤中。
 * 4. 對處理完公式的文字，使用 `marked.parse()` 將其餘 Markdown 內容轉換為 HTML。
 *
 * @param {string} md - 經過 `safeMarkdown` 處理的 Markdown 文字。
 * @param {Function} customRenderer - 自定義的 Markdown 渲染器函式，用於處理特殊內容。
 * @returns {string} 包含渲染後公式和其餘 Markdown 內容的 HTML 字串。
 */
// MOVED to js/markdown_processor.js: function renderWithKatexFailback(md, customRenderer) { ... }

/**
 * 從當前頁面的 URL 中獲取指定查詢引數的值。
 * @param {string} name - 要獲取的查詢引數的名稱。
 * @returns {string|null} 查詢引數的值，如果不存在則返回 null。
 */
function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}
/**
 * @type {Object|null}
 * @description 儲存從 IndexedDB 載入的當前歷史記錄的詳細資料。
 */
let data = null;

/**
 * 將塊級元素內容按標點分割成子塊 (span.sub-block)。
 * @param {HTMLElement} blockElement - 要分割的塊級元素 (如 p, h1-h6)。
 * @param {string|number} parentBlockIndex - 父塊的索引。
 */
// MOVED to js/sub_block_segmenter.js: function segmentBlockIntoSubBlocks(blockElement, parentBlockIndex) { ... }

function restoreScrollPositionForCurrentTab() {
    if (docIdForLocalStorage && currentVisibleTabId) {
        const isImmersive = window.ImmersiveLayout && window.ImmersiveLayout.isActive();
        const modePrefix = isImmersive ? 'immersive_' : 'normal_';
        const anchorKey = `scrollAnchorId_${modePrefix}${docIdForLocalStorage}_${currentVisibleTabId}`;
        const savedAnchorId = localStorage.getItem(anchorKey);

        console.log(`[restoreScrollPosition] 模式: ${modePrefix}, 嘗試恢復錨點: ${anchorKey}, 儲存的錨點ID: ${savedAnchorId}`);

        if (savedAnchorId) {
            const targetElement = document.getElementById(savedAnchorId);
            if (targetElement) {
                console.log(`[restoreScrollPosition] 找到錨點元素 ${savedAnchorId}, 滾動到該元素。`);
                requestAnimationFrame(() => {
                     if (localStorage.getItem(`activeTab_${docIdForLocalStorage}`) === currentVisibleTabId) {
                        targetElement.scrollIntoView({ behavior: 'auto', block: 'start' }); // 'auto' for instant jump
                        // 立即儲存一次當前scrollTop，因為scrollIntoView後可能需要微調
                        setTimeout(saveScrollPosition, 50);
                    }
                });
                // 新增：每次恢復滾動後都綁定 scroll 事件到正確容器
                if (window.DockLogic && typeof window.DockLogic.bindScrollForCurrentScrollable === 'function') {
                    window.DockLogic.bindScrollForCurrentScrollable();
                }
                return; // 成功透過錨點恢復，直接返回
            }
            console.warn(`[restoreScrollPosition] 未找到ID為 ${savedAnchorId} 的錨點元素。回退到scrollTop恢復。`);
        }

        // 如果錨點恢復失敗或沒有錨點，則回退到scrollTop恢復
        const scrollKey = `scrollPos_${modePrefix}${docIdForLocalStorage}_${currentVisibleTabId}`;
        const savedScrollTop = localStorage.getItem(scrollKey);
        console.log(`[restoreScrollPosition] (回退)嘗試恢復scrollTop: ${scrollKey}, 儲存的值: ${savedScrollTop}`);

        if (savedScrollTop !== null && !isNaN(parseInt(savedScrollTop, 10))) {
            const scrollableElement = getCurrentScrollableElementForHistoryDetail();
            if (scrollableElement) {
                console.log(`[restoreScrollPosition] (回退)找到可滾動元素:`, {
                    元素ID: scrollableElement.id || '無ID',
                    元素類名: scrollableElement.className || '無類名',
                    元素標籤: scrollableElement.tagName,
                    當前scrollTop: scrollableElement.scrollTop,
                    將要設定的scrollTop: parseInt(savedScrollTop, 10)
                });
                requestAnimationFrame(() => {
                    if (localStorage.getItem(`activeTab_${docIdForLocalStorage}`) === currentVisibleTabId) {
                        const scrollTopToSet = parseInt(savedScrollTop, 10);
                        scrollableElement.scrollTop = scrollTopToSet;
                        setTimeout(() => {
                            if (Math.abs(scrollTopToSet - scrollableElement.scrollTop) > 5) {
                                console.warn(`[restoreScrollPosition] (回退)警告: scrollTop設定可能未生效! 嘗試再次設定...`);
                                scrollableElement.scrollTop = scrollTopToSet;
                            }
                            // 即使是scrollTop恢復，也儲存一次，這可能會更新錨點（如果之前沒有）
                            saveScrollPosition();
                        }, 100);
                    }
                });
            } else {
                console.warn(`[restoreScrollPosition] (回退)未找到可滾動元素，無法恢復scrollTop`);
            }
        } else {
            console.log(`[restoreScrollPosition] (回退)沒有儲存的scrollTop或值無效: ${savedScrollTop}`);
        }
    } else {
        console.log(`[restoreScrollPosition] 缺少必要引數: docId=${docIdForLocalStorage}, tabId=${currentVisibleTabId}`);
    }
    // 新增：每次恢復滾動後都綁定 scroll 事件到正確容器
    if (window.DockLogic && typeof window.DockLogic.bindScrollForCurrentScrollable === 'function') {
        window.DockLogic.bindScrollForCurrentScrollable();
    }
}

// Listen for immersive mode changes
document.addEventListener('immersiveModeEntered', function() {
    setTimeout(() => {
        console.log("[HistoryDetail] 進入沉浸模式事件觸發");
        const normalModeAnchorKey = `scrollAnchorId_normal_${docIdForLocalStorage}_${currentVisibleTabId}`;
        const savedNormalAnchorId = localStorage.getItem(normalModeAnchorKey);
        let restoredByAnchor = false;

        if (savedNormalAnchorId) {
            const targetElement = document.getElementById(savedNormalAnchorId);
            if (targetElement && document.body.contains(targetElement)) { // 確保元素在當前DOM中
                 const immersiveScrollableElement = getCurrentScrollableElementForHistoryDetail();
                 if(immersiveScrollableElement && immersiveScrollableElement.contains(targetElement)){
                    console.log(`[HistoryDetail-ImmersiveEnter] 應用普通模式錨點 ${savedNormalAnchorId} 到沉浸式元素`);
                    targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
                    restoredByAnchor = true;
                 } else {
                    console.warn("[HistoryDetail-ImmersiveEnter] 錨點元素不在當前沉浸模式滾動容器內，無法精確恢復。");
                 }
            } else {
                 console.warn("[HistoryDetail-ImmersiveEnter] 普通模式錨點 ${savedNormalAnchorId} 在沉浸模式DOM中未找到。");
            }
        }

        if (restoredByAnchor) {
            // 錨點恢復成功，立即為沉浸模式儲存當前狀態（包括scrollTop和新計算的錨點）
            console.log("[HistoryDetail-ImmersiveEnter] 透過錨點恢復成功，立即為沉浸模式儲存狀態");
            saveScrollPosition();
        } else {
            console.log("[HistoryDetail-ImmersiveEnter] 普通模式錨點恢復失敗或無錨點，嘗試恢復上次沉浸式位置(錨點優先，後scrollTop)");
            restoreScrollPositionForCurrentTab(); // 會嘗試恢復 immersive_ 錨點，然後 immersive_ scrollTop
        }

        if (window.DockLogic) {
            if (typeof window.DockLogic.forceUpdateReadingProgress === 'function') {
                window.DockLogic.forceUpdateReadingProgress();
            }
            if (typeof window.DockLogic.bindScrollForCurrentScrollable === 'function') {
                 window.DockLogic.bindScrollForCurrentScrollable();
            }
        }

        // 重新綁定滾動事件以儲存滾動位置
        if (typeof bindScrollForSavePosition === 'function') {
            bindScrollForSavePosition();
        }
    }, 450); // 增加延遲確保DOM和TOC更新
});

document.addEventListener('immersiveModeExited', function() {
    setTimeout(() => {
        console.log("[HistoryDetail] 退出沉浸模式事件觸發");
        const immersiveModeAnchorKey = `scrollAnchorId_immersive_${docIdForLocalStorage}_${currentVisibleTabId}`;
        const savedImmersiveAnchorId = localStorage.getItem(immersiveModeAnchorKey);
        let restoredByAnchor = false;

        if (savedImmersiveAnchorId) {
            const targetElement = document.getElementById(savedImmersiveAnchorId);
            // 退出沉浸模式後，內容移回主容器，檢查 targetElement 是否在 document.body (或其他主內容區) 中
            if (targetElement && document.body.contains(targetElement)) {
                const normalScrollableElement = getCurrentScrollableElementForHistoryDetail();
                if(normalScrollableElement && (normalScrollableElement === document.documentElement || normalScrollableElement.contains(targetElement))){
                    console.log(`[HistoryDetail-ImmersiveExit] 應用沉浸模式錨點 ${savedImmersiveAnchorId} 到普通模式元素`);
                    targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
                    restoredByAnchor = true;
                } else {
                     console.warn("[HistoryDetail-ImmersiveExit] 錨點元素不在當前普通模式滾動容器內，無法精確恢復。");
                }
            } else {
                console.warn("[HistoryDetail-ImmersiveExit] 沉浸模式錨點 ${savedImmersiveAnchorId} 在普通模式DOM中未找到。");
            }
        }

        if (restoredByAnchor) {
            // 錨點恢復成功，立即為普通模式儲存當前狀態
            console.log("[HistoryDetail-ImmersiveExit] 透過錨點恢復成功，立即為普通模式儲存狀態");
            saveScrollPosition();
        } else {
            console.log("[HistoryDetail-ImmersiveExit] 沉浸模式錨點恢復失敗或無錨點，嘗試恢復上次普通模式位置(錨點優先，後scrollTop)");
            restoreScrollPositionForCurrentTab(); // 會嘗試恢復 normal_ 錨點，然後 normal_ scrollTop
        }

        if (window.DockLogic) {
            if (typeof window.DockLogic.forceUpdateReadingProgress === 'function') {
                window.DockLogic.forceUpdateReadingProgress();
            }
            if (typeof window.DockLogic.bindScrollForCurrentScrollable === 'function') {
                 window.DockLogic.bindScrollForCurrentScrollable();
            }
        }

        // 重新綁定滾動事件以儲存滾動位置
        if (typeof bindScrollForSavePosition === 'function') {
            bindScrollForSavePosition();
        }
    }, 450); // 增加延遲
});


window.addEventListener('beforeunload', function cleanupLargeRefs() {
  try {
    if (window.ChunkCompareOptimizer && window.ChunkCompareOptimizer.instance && typeof window.ChunkCompareOptimizer.instance.cleanup === 'function') {
      window.ChunkCompareOptimizer.instance.cleanup();
    }
  } catch {}
  try {
    if (window.chunkParseCache) {
      Object.keys(window.chunkParseCache).forEach(k => delete window.chunkParseCache[k]);
    }
  } catch {}
  try {
    if (typeof window.__lastChunkCompareTotalBlocks === 'number') {
      for (let i = 0; i <= window.__lastChunkCompareTotalBlocks; i++) {
        delete window[`blockRawContent_${i}`];
      }
    }
  } catch {}
  window.largeDocumentData = null;
});

// 自動恢復 globalCurrentContentIdentifier
(function restoreContentIdentifierFromLocalStorage() {
  try {
    // 優先用 docIdForLocalStorage，如果沒有則嘗試從URL獲取
    let docId = window.docIdForLocalStorage;
    if (!docId && typeof getQueryParam === 'function') {
      docId = getQueryParam('id');
    }
    if (!docId) return;
    const savedTabKey = `activeTab_${docId}`;
    const savedTab = localStorage.getItem(savedTabKey);
    if (savedTab === 'ocr' || savedTab === 'translation') {
      window.globalCurrentContentIdentifier = savedTab;
      console.log('[auto-restore] 恢復 globalCurrentContentIdentifier =', savedTab);
    }
  } catch (e) {
    // 忽略
  }
})();
