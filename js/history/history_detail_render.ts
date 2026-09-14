/**
 * 非同步渲染歷史詳情頁面的主函式。
 * - 從 URL 查詢引數中獲取記錄 ID。
 * - 使用 `getResultFromDB` (來自 storage.js) 從 IndexedDB 載入對應的歷史資料。
 * - 如果資料成功載入：
 *   - 更新頁面標題 (`#fileName`) 和後設資料 (`#fileMeta`)。
 *   - 根據資料中是否存在有效的分塊資訊 (`ocrChunks`, `translatedChunks`)，
 *     決定預設顯示的分頁（優先顯示分塊對比，否則顯示 OCR 內容）。
 * - 如果未找到資料，則顯示提示資訊。
 * @async
 */
async function renderDetail() {
  const id = getQueryParam('id');
  if (!id) return;
  docIdForLocalStorage = id; // Store doc ID for localStorage operations
  window.docIdForLocalStorage = id; // 同時更新掛載到 window 物件上的變數

  // Restore chatbot open state
  const savedChatbotOpenState = localStorage.getItem(`chatbotOpenState_${docIdForLocalStorage}`);
  if (savedChatbotOpenState === 'true') {
    window.isChatbotOpen = true;
  } else if (savedChatbotOpenState === 'false') {
    window.isChatbotOpen = false;
  }

  // 從localStorage恢復儲存的比例設定
  const savedChunkCompareRatio = localStorage.getItem(`chunkCompareRatio_${docIdForLocalStorage}`);
  if (savedChunkCompareRatio !== null && !isNaN(parseFloat(savedChunkCompareRatio))) {
    window.chunkCompareRatio = parseFloat(savedChunkCompareRatio);
  }

  // console.log(`Chatbot state after attempting restore from localStorage for ${docIdForLocalStorage}: ${window.isChatbotOpen}`);

  // Initialize Dock Logic once docIdForLocalStorage is available
  if (typeof window.DockLogic !== 'undefined' && typeof window.DockLogic.init === 'function') {
    window.DockLogic.init(docIdForLocalStorage);
  } else {
    console.error("DockLogic not available or init function missing.");
  }

  data = await getResultFromDB(id);
  window.data = data; // for debugging
  const fileMetaTimeEl = document.getElementById('fileMetaTime');
  const fileMetaImagesEl = document.getElementById('fileMetaImages');

  if (!data) {
    document.getElementById('fileName').textContent = '未找到資料';
    if (fileMetaTimeEl) fileMetaTimeEl.textContent = '時間: --';
    if (fileMetaImagesEl) fileMetaImagesEl.textContent = '圖片數: --';
    document.getElementById('tabContent').innerHTML = '';
    return;
  }

  // === 新增：如果沒有翻譯內容，隱藏"僅翻譯"和"分塊對比"按鈕 ===
  if (!data.translation || data.translation.trim() === "") {
    document.getElementById('tab-translation').style.display = 'none';
    document.getElementById('tab-chunk-compare').style.display = 'none';
  }

  // === 新增：檢測 MinerU 結構化翻譯資料，顯示 PDF 對照按鈕 ===
  const hasMinerUStructuredData =
    data.metadata &&
    data.metadata.originalPdfBase64 &&
    data.metadata.contentListJson &&
    data.metadata.translatedContentList &&
    data.metadata.supportsStructuredTranslation === true;

  const pdfCompareTab = document.getElementById('tab-pdf-compare');
  if (hasMinerUStructuredData && pdfCompareTab) {
    pdfCompareTab.style.display = 'inline-block';
    console.log('[renderDetail] MinerU 結構化翻譯資料檢測成功，顯示 PDF 對照按鈕');
  } else if (pdfCompareTab) {
    pdfCompareTab.style.display = 'none';
  }
  // ========================================================

  document.getElementById('fileName').textContent = data.name;
  if (fileMetaTimeEl) {
    fileMetaTimeEl.textContent = `時間: ${new Date(data.time).toLocaleString()}`;
  }
  if (fileMetaImagesEl) {
    const imageCount = Array.isArray(data.images) ? data.images.length : 0;
    fileMetaImagesEl.textContent = `圖片數: ${imageCount}`;
  }

  // ========== 確保批註資料在渲染前載入 ==========
  if (id) { // 確保我們有文件 ID
    try {
      const annotations = await getAnnotationsForDocFromDB(id);
      console.log(`Annotations for docId '${id}' (loaded in renderDetail):`, annotations);
      data.annotations = annotations || []; // 儲存到 data 物件，確保是陣列
      // updateAnnotationSummary(); // Handled by updateAllDockStats via showTab
      // updateHighlightSummary(); // Handled by updateAllDockStats via showTab
    } catch (error) {
      console.error(`Error loading annotations for docId '${id}' in renderDetail:`, error);
      data.annotations = []; // 出錯時也確保是個空陣列
      // updateAnnotationSummary(); // Handled by updateAllDockStats via showTab
      // updateHighlightSummary(); // Handled by updateAllDockStats via showTab
    }
  } else {
    // updateAnnotationSummary(); // Handled by updateAllDockStats via showTab
    // updateHighlightSummary(); // Handled by updateAllDockStats via showTab
  }
  // =============================================

  // ========== 在 window.data 設定並填充批註後，顯式載入聊天記錄 ==========
  if (window.data) {
    if (window.ChatbotCore && typeof window.ChatbotCore.reloadChatHistoryAndUpdateUI === 'function' &&
        window.ChatbotUI && typeof window.ChatbotUI.updateChatbotUI === 'function') {
      console.log('renderDetail: Calling reloadChatHistoryAndUpdateUI after window.data and annotations are set. Current docId:', window.ChatbotCore.getCurrentDocId ? window.ChatbotCore.getCurrentDocId() : 'unknown');
      window.ChatbotCore.reloadChatHistoryAndUpdateUI(window.ChatbotUI.updateChatbotUI);
    } else {
      console.error('renderDetail: ChatbotCore or ChatbotUI not fully available for history reload.');
    }
  }
  // =================================================================

  // Initialize annotation system after data is loaded and DOM is likely ready
  if (typeof window.initializeGlobalAnnotationVariables === 'function') {
    window.initializeGlobalAnnotationVariables();
  }
  if (typeof window.initAnnotationSystem === 'function') {
    window.initAnnotationSystem();
  } else {
    console.error("initAnnotationSystem is not defined. Check js/annotation_logic.js");
  }

  // Determine initial tab, AFTER annotations are loaded
  let initialTab = 'ocr'; // Default tab
  if (docIdForLocalStorage) {
    const savedTabKey = `activeTab_${docIdForLocalStorage}`;
    const savedTab = localStorage.getItem(savedTabKey);
    if (
      savedTab &&
      ['ocr', 'translation', 'chunk-compare', 'pdf-compare'].includes(savedTab) &&
      !(savedTab !== 'ocr' && (!data.translation || data.translation.trim() === ""))
    ) {
      initialTab = savedTab;
    } else if (
      data.ocrChunks && data.ocrChunks.length > 0 &&
      data.translatedChunks && data.translatedChunks.length > 0 &&
      data.ocrChunks.length === data.translatedChunks.length &&
      data.translation && data.translation.trim() !== ""
    ) {
      initialTab = 'chunk-compare';
    }
  } else if (
    data.ocrChunks && data.ocrChunks.length > 0 &&
    data.translatedChunks && data.translatedChunks.length > 0 &&
    data.ocrChunks.length === data.translatedChunks.length &&
    data.translation && data.translation.trim() !== ""
  ) {
    initialTab = 'chunk-compare';
  }

  // 現在，在批註肯定載入完畢後，才呼叫 showTab
  showTab(initialTab);

  // The block for loading annotations (previously around line 415) has been moved up.

  // Add scroll listener for saving scroll position (動態綁定到正確的滾動容器)
  if (typeof bindScrollForSavePosition === 'function') {
    bindScrollForSavePosition();
  } else {
    console.warn('[historyDetailRender] bindScrollForSavePosition function not found');
  }
  // Add scroll listener for updating reading progress - MOVED TO DOCK_LOGIC.JS
  // window.removeEventListener('scroll', debouncedUpdateReadingProgress);
  // window.addEventListener('scroll', debouncedUpdateReadingProgress);

  // Add listener to save chatbot state on page unload
  window.removeEventListener('beforeunload', saveChatbotStateOnUnload);
  window.addEventListener('beforeunload', saveChatbotStateOnUnload);

  // Manage Annotations Link Click - Changed to Settings Link - MOVED TO DOCK_LOGIC.JS
  // const settingsLink = document.getElementById('settings-link');
  // if (settingsLink) {
  //   settingsLink.onclick = function(event) {
  //     event.preventDefault();
  //     alert('管理頁面即將推出！'); // Updated alert message
  //   };
  // }

  // Dock Toggle Button Click - MOVED TO DOCK_LOGIC.JS
  // const dockToggleBtn = document.getElementById('dock-toggle-btn');
  // const dock = document.getElementById('bottom-left-dock');
  // if (dockToggleBtn && dock) {
  //   // Restore collapsed state
  //   const dockCollapsedKey = `dockCollapsed_${docIdForLocalStorage}`;
  //   const isCollapsed = localStorage.getItem(dockCollapsedKey) === 'true';
  //   if (isCollapsed) {
  //     dock.classList.add('dock-collapsed');
  //     dockToggleBtn.innerHTML = '<i class="fa fa-chevron-up"></i>';
  //     dockToggleBtn.title = '展開';
  //   }

  //   dockToggleBtn.onclick = function(event) {
  //     event.preventDefault();
  //     const currentlyCollapsed = dock.classList.toggle('dock-collapsed');
  //     if (currentlyCollapsed) {
  //       this.innerHTML = '<i class="fa fa-chevron-up"></i>';
  //       this.title = '展開';
  //       localStorage.setItem(dockCollapsedKey, 'true');
  //     } else {
  //       this.innerHTML = '<i class="fa fa-chevron-down"></i>';
  //       this.title = '摺疊';
  //       localStorage.setItem(dockCollapsedKey, 'false');
  //     }
  //   };
  // }
}

/**
 * 切換並顯示指定的分頁內容。
 * - 更新標籤按鈕的啟用狀態 (`active` class)。
 * - 根據傳入的 `tab` 引數 ( 'ocr', 'translation', 'chunk-compare' )，生成對應的 HTML 內容。
 * - OCR 和翻譯分頁：直接渲染 `data.ocr` 或 `data.translation` 欄位。
 * - 分塊對比分頁 (`chunk-compare`)：
 *   - 檢查 `data.ocrChunks` 和 `data.translatedChunks` 是否有效且數量比對。
 *   - 如果有效，則為每一對原文/譯文塊生成對比檢視。使用 `renderLevelAlignedFlex` 進行版面。
 *   - 提供一個按鈕 (`#swap-chunks-btn`) 用於切換原文和譯文在對比檢視中的左右位置。
 *   - 如果分塊資料無效，則顯示提示資訊。
 * - 將生成的 HTML 設定到 `#tabContent` 區域。
 * - 呼叫 `window.refreshTocList()` 更新目錄（TOC）。
 *
 * @param {string} tab - 要顯示的分頁識別符號 ('ocr', 'translation', or 'chunk-compare')。
 */

