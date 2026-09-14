/**
 * Sidebar Integration - 側邊欄整合模組
 *
 * 職責：
 * 1. 從原有 TOC 資料同步到側邊欄 TOC
 * 2. 從原有 Dock 統計同步到側邊欄統計
 * 3. 處理側邊欄摺疊/展開（桌面端）
 * 4. 處理側邊欄顯示/隱藏（行動裝置）
 * 5. 處理可摺疊區域的展開/收起
 * 6. 保持狀態到 localStorage
 *
 * 注意：僅在非沉浸模式下工作，沉浸模式不受影響
 */

(function() {
  'use strict';

  // ==================== 配置 ====================

  const CONFIG = {
    storageKeys: {
      sidebarCollapsed: 'pbx_sidebar_collapsed',
      tocSectionExpanded: 'pbx_sidebar_toc_expanded'
    },
    selectors: {
      // Sidebar
      appShell: '#app-shell',
      appSidebar: '#appSidebar',
      sidebarOverlay: '#sidebarOverlay',
      sidebarToggleBtn: '#sidebarToggleBtn',
      sidebarToggleIcon: '#sidebarToggleIcon',
      sidebarCloseBtn: '#sidebarCloseBtn',
      mobileMenuBtn: '#mobileMenuBtn',
      sidebarLogo: '#sidebarLogo',
      sidebarSettingsLink: '#sidebarSettingsLink',

      // TOC Section
      sidebarTocSection: '#sidebarTocSection',
      sidebarTocToggle: '#sidebarTocToggle',
      sidebarTocList: '#sidebarTocList',
      originalTocList: '#toc-list',

      // Sidebar Footer Stats (緊湊版面)
      sidebarReadingProgress: '#sidebarReadingProgress',
      sidebarHighlightCount: '#sidebarHighlightCount',
      sidebarAnnotationCount: '#sidebarAnnotationCount',
      sidebarImageCount: '#sidebarImageCount',
      sidebarFormulaCount: '#sidebarFormulaCount',
      sidebarTableCount: '#sidebarTableCount',
      sidebarWordCount: '#sidebarWordCount',
      sidebarReferenceCount: '#sidebarReferenceCount',

      // Original Dock Elements
      originalReadingProgress: '#reading-progress-percentage-verbose',
      originalHighlightCount: '#highlight-count',
      originalAnnotationCount: '#annotation-count',
      originalImageCount: '#image-count',
      originalFormulaCount: '#formula-count',
      originalTableCount: '#table-count',
      originalWordCount: '#total-word-count',
      originalReferenceCount: '#reference-count',

      // Immersive Mode
      immersiveContainer: '#immersive-layout-container',
      immersiveToggleBtn: '#toggle-immersive-btn',

      // Settings Link
      originalSettingsLink: '#settings-link'
    },
    logos: {
      full: '../../public/h_with_name.svg',
      pure: '../../public/pure.svg'
    }
  };

  // ==================== 狀態管理 ====================

  let isImmersiveMode = false;
  let isMobile = window.innerWidth < 768;

  // ==================== DOM 元素快取 ====================

  const elements = {};

  /**
   * 初始化 DOM 元素快取
   */
  function cacheElements() {
    for (const [key, selector] of Object.entries(CONFIG.selectors)) {
      elements[key] = document.querySelector(selector);
    }
  }

  // ==================== 側邊欄顯示/隱藏 ====================

  /**
   * 顯示或隱藏 App Shell（根據沉浸模式）
   */
  function updateAppShellVisibility() {
    if (!elements.appShell) return;

    if (isImmersiveMode) {
      elements.appShell.style.display = 'none';
    } else {
      elements.appShell.style.display = 'flex';
    }
  }

  /**
   * 監聽沉浸模式切換
   */
  function watchImmersiveMode() {
    if (!elements.immersiveContainer) return;

    // 使用 MutationObserver 監聽 display 樣式變化
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const display = elements.immersiveContainer.style.display;
          const newImmersiveState = (display !== 'none');

          if (newImmersiveState !== isImmersiveMode) {
            isImmersiveMode = newImmersiveState;
            updateAppShellVisibility();
            console.log('[Sidebar] Immersive mode:', isImmersiveMode ? 'ON' : 'OFF');
          }
        }
      });
    });

    observer.observe(elements.immersiveContainer, {
      attributes: true,
      attributeFilter: ['style']
    });

    // 初始狀態
    const initialDisplay = elements.immersiveContainer.style.display;
    isImmersiveMode = (initialDisplay !== 'none');
    updateAppShellVisibility();
  }

  // ==================== 桌面端側邊欄摺疊 ====================

  /**
   * 設定側邊欄摺疊狀態
   * @param {boolean} collapsed - 是否摺疊
   */
  function setSidebarCollapsed(collapsed) {
    if (!elements.appSidebar || !elements.sidebarLogo) return;

    if (collapsed) {
      elements.appSidebar.classList.add('collapsed');
      elements.sidebarLogo.src = CONFIG.logos.pure;
      // 切換圖示為"開啟"圖示
      if (elements.sidebarToggleIcon) {
        elements.sidebarToggleIcon.setAttribute('icon', 'carbon:side-panel-open');
      }
    } else {
      elements.appSidebar.classList.remove('collapsed');
      elements.sidebarLogo.src = CONFIG.logos.full;
      // 切換圖示為"關閉"圖示
      if (elements.sidebarToggleIcon) {
        elements.sidebarToggleIcon.setAttribute('icon', 'carbon:side-panel-close');
      }
    }

    // 儲存狀態
    localStorage.setItem(CONFIG.storageKeys.sidebarCollapsed, collapsed.toString());
  }

  /**
   * 初始化桌面端摺疊狀態
   */
  function initDesktopCollapse() {
    if (!elements.sidebarToggleBtn) return;

    // 從 localStorage 讀取狀態
    const savedState = localStorage.getItem(CONFIG.storageKeys.sidebarCollapsed);
    const isCollapsed = savedState === 'true';
    setSidebarCollapsed(isCollapsed);

    // 綁定切換按鈕
    elements.sidebarToggleBtn.addEventListener('click', () => {
      const currentlyCollapsed = elements.appSidebar.classList.contains('collapsed');
      setSidebarCollapsed(!currentlyCollapsed);
    });
  }

  // ==================== 行動裝置側邊欄顯示/隱藏 ====================

  /**
   * 開啟行動裝置側邊欄
   */
  function openMobileSidebar() {
    if (!elements.appSidebar || !elements.sidebarOverlay) return;

    elements.appSidebar.classList.add('mobile-open');
    elements.sidebarOverlay.classList.add('show');
  }

  /**
   * 關閉行動裝置側邊欄
   */
  function closeMobileSidebar() {
    if (!elements.appSidebar || !elements.sidebarOverlay) return;

    elements.appSidebar.classList.remove('mobile-open');
    elements.sidebarOverlay.classList.remove('show');
  }

  /**
   * 初始化行動裝置側邊欄
   */
  function initMobileSidebar() {
    // 綁定開啟按鈕
    if (elements.mobileMenuBtn) {
      elements.mobileMenuBtn.addEventListener('click', openMobileSidebar);
    }

    // 綁定關閉按鈕
    if (elements.sidebarCloseBtn) {
      elements.sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
    }

    // 綁定遮罩層點選關閉
    if (elements.sidebarOverlay) {
      elements.sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }
  }

  // ==================== 可摺疊區域 ====================

  /**
   * 切換可摺疊區域的展開/收起狀態
   * @param {HTMLElement} section - 區域元素
   * @param {string} storageKey - localStorage 鍵名
   */
  function toggleSection(section, storageKey) {
    if (!section) return;

    const isExpanded = section.classList.contains('expanded');
    const newState = !isExpanded;

    if (newState) {
      section.classList.add('expanded');
    } else {
      section.classList.remove('expanded');
    }

    // 儲存狀態
    if (storageKey) {
      localStorage.setItem(storageKey, newState.toString());
    }
  }

  /**
   * 初始化可摺疊區域
   * @param {string} sectionSelector - 區域選擇器
   * @param {string} toggleSelector - 切換按鈕選擇器
   * @param {string} storageKey - localStorage 鍵名
   */
  function initCollapsibleSection(sectionSelector, toggleSelector, storageKey) {
    const section = document.querySelector(sectionSelector);
    const toggle = document.querySelector(toggleSelector);

    if (!section || !toggle) return;

    // 從 localStorage 讀取狀態
    const savedState = localStorage.getItem(storageKey);
    const isExpanded = savedState !== 'false'; // 預設展開

    if (isExpanded) {
      section.classList.add('expanded');
    } else {
      section.classList.remove('expanded');
    }

    // 綁定切換按鈕
    toggle.addEventListener('click', () => {
      toggleSection(section, storageKey);
    });
  }

  // ==================== TOC 資料同步 ====================

  /**
   * 從原有 TOC 同步資料到側邊欄 TOC
   */
  function syncTocData() {
    if (!elements.originalTocList || !elements.sidebarTocList) return;

    const originalItems = elements.originalTocList.querySelectorAll('li');

    if (originalItems.length === 0) {
      // 顯示空狀態
      elements.sidebarTocList.innerHTML = `
        <li class="sidebar-empty-state">
          <div class="sidebar-empty-icon">📄</div>
          <div>暫無目錄</div>
        </li>
      `;
      return;
    }

    // 清空現有內容
    elements.sidebarTocList.innerHTML = '';

    // 複製 TOC 專案
    originalItems.forEach(item => {
      const originalLink = item.querySelector('a');
      if (!originalLink) return;

      // 獲取並清理文字內容
      const text = originalLink.textContent.trim();
      const href = originalLink.href;

      // 跳過佔位符和空標題
      // 1. 空標題
      // 2. "未命名章節"佔位符
      // 3. placeholder- 開頭的ID（佔位符標識）
      if (!text ||
          text === '未命名章節' ||
          text === 'undefined' ||
          text === 'null' ||
          href.includes('#placeholder-')) {
        return;
      }

      const li = document.createElement('li');
      li.className = 'sidebar-toc-item';

      // 複製層級類（toc-h2, toc-h3 等）
      for (const className of item.classList) {
        if (className.startsWith('toc-')) {
          li.classList.add(className);
        }
      }

      const link = document.createElement('a');
      link.href = href;
      link.className = 'sidebar-toc-link';
      link.textContent = text; // 使用清理後的文字

      // 複製 active 狀態
      if (originalLink.classList.contains('active')) {
        link.classList.add('active');
      }

      // 綁定點選事件（跳轉後自動關閉行動裝置側邊欄）
      link.addEventListener('click', (e) => {
        // 觸發原有 TOC 連結的點選事件（保持原有滾動邏輯）
        originalLink.click();
        e.preventDefault();

        // 行動裝置關閉側邊欄
        if (isMobile) {
          closeMobileSidebar();
        }
      });

      li.appendChild(link);
      elements.sidebarTocList.appendChild(li);
    });
  }

  /**
   * 監聽原有 TOC 的變化並同步
   */
  function watchTocChanges() {
    if (!elements.originalTocList) return;

    // 使用 MutationObserver 監聽 TOC 列表的變化
    const observer = new MutationObserver(() => {
      syncTocData();
    });

    observer.observe(elements.originalTocList, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'] // 監聽 active 類變化
    });

    // 初始同步
    syncTocData();
  }

  // ==================== Dock 資料同步 ====================

  /**
   * 同步單個統計資料
   * @param {string} originalSelector - 原始元素選擇器
   * @param {string} sidebarSelector - 側邊欄元素選擇器
   * @param {string} suffix - 字尾（如 '%'）
   */
  function syncStat(originalSelector, sidebarSelector, suffix = '') {
    const originalEl = document.querySelector(originalSelector);
    const sidebarEl = document.querySelector(sidebarSelector);

    if (!originalEl || !sidebarEl) return;

    let value = originalEl.textContent.trim();

    // 如果需要新增字尾，先檢查是否已存在
    if (suffix && !value.endsWith(suffix)) {
      value = value + suffix;
    }

    sidebarEl.textContent = value;
  }

  /**
   * 檢查 Dock 資料是否已初始化（不全是 0）
   */
  function isDockDataReady() {
    const wordCountEl = document.querySelector(CONFIG.selectors.originalWordCount);
    const wordCount = wordCountEl?.textContent.trim();

    // 如果總字數不是 0，說明 Dock 資料已計算完成
    // 總字數是最可靠的指標，因為任何文件都應該有字數
    return wordCount && wordCount !== '0';
  }

  /**
   * 獲取當前滾動容器（從 main 分支的 DockLogic 移植 + 非沉浸模式修正）
   */
  function getCurrentScrollableElement() {
    if (window.ImmersiveLayout && window.ImmersiveLayout.isActive && window.ImmersiveLayout.isActive()) {
      // 沉浸模式：滾動容器取決於當前活動的分頁
      const immersiveMainArea = document.getElementById('immersive-main-content-area');
      if (immersiveMainArea) {
        // 1. 優先查詢帶有內聯樣式的 .tab-content
        const tabContentScroller = immersiveMainArea.querySelector('.tab-content[style*="overflow-y: auto"], .tab-content[style*="overflow: auto"]');
        if (tabContentScroller) return tabContentScroller;

        // 2. 查詢活動的內容包裝器
        const activeTabContent = immersiveMainArea.querySelector('.tab-content .content-wrapper, .tab-content .chunk-compare-container');
        if (activeTabContent) {
          // 檢查父元素 .tab-content 是否可滾動
          const tabContentParent = activeTabContent.closest('.tab-content');
          if (tabContentParent && (tabContentParent.style.overflowY === 'auto' ||
                                 tabContentParent.style.overflow === 'auto' ||
                                 getComputedStyle(tabContentParent).overflowY === 'auto')) {
            return tabContentParent;
          }
          // 回退到內容包裝器本身
          return activeTabContent;
        }

        // 3. 嘗試 .container
        const mainContainerInImmersive = immersiveMainArea.querySelector('.container');
        if (mainContainerInImmersive) return mainContainerInImmersive;

        // 4. 最後回退到 immersiveMainArea
        return immersiveMainArea;
      }
    }

    // 非沉浸模式：使用 .app-main（側邊欄版面中的主內容區）
    const appMain = document.querySelector('.app-main');
    if (appMain) {
      return appMain;
    }

    // 最終回退到 document.documentElement（舊版面或特殊情況）
    return document.documentElement;
  }

  /**
   * 計算並更新側邊欄的閱讀進度（直接計算，不依賴 Dock）
   */
  function updateSidebarReadingProgress() {
    const progressEl = document.querySelector(CONFIG.selectors.sidebarReadingProgress);
    if (!progressEl) return;

    // 動態獲取當前滾動容器
    const scrollableElement = getCurrentScrollableElement();
    if (!scrollableElement) {
      console.warn('[Sidebar] No scrollable element found');
      return;
    }

    const scrollTop = scrollableElement.scrollTop;
    const scrollHeight = scrollableElement.scrollHeight;
    const clientHeight = scrollableElement.clientHeight;

    // 如果內容適合視口（無捲軸），顯示 100%
    if (scrollHeight <= clientHeight) {
      progressEl.textContent = '100%';
      return;
    }

    // 計算滾動百分比
    const maxScrollTop = scrollHeight - clientHeight;
    const scrollFraction = maxScrollTop > 0 ? (scrollTop / maxScrollTop) : 0;
    const percentage = Math.min(100, Math.max(0, Math.round(scrollFraction * 100)));

    progressEl.textContent = percentage + '%';
  }

  /**
   * 同步所有 Dock 統計資料到側邊欄
   */
  function syncDockData() {
    console.log('[Sidebar] Syncing Dock data...');

    // 閱讀進度：直接計算，不從 Dock 同步
    updateSidebarReadingProgress();

    // 其他統計：從 Dock 同步
    syncStat(CONFIG.selectors.originalHighlightCount, CONFIG.selectors.sidebarHighlightCount);
    syncStat(CONFIG.selectors.originalAnnotationCount, CONFIG.selectors.sidebarAnnotationCount);
    syncStat(CONFIG.selectors.originalImageCount, CONFIG.selectors.sidebarImageCount);
    syncStat(CONFIG.selectors.originalFormulaCount, CONFIG.selectors.sidebarFormulaCount);
    syncStat(CONFIG.selectors.originalTableCount, CONFIG.selectors.sidebarTableCount);
    syncStat(CONFIG.selectors.originalWordCount, CONFIG.selectors.sidebarWordCount);
    syncStat(CONFIG.selectors.originalReferenceCount, CONFIG.selectors.sidebarReferenceCount);

    // 除錯：輸出同步後的值
    const progressEl = document.querySelector(CONFIG.selectors.sidebarReadingProgress);
    const highlightEl = document.querySelector(CONFIG.selectors.sidebarHighlightCount);
    const wordCountEl = document.querySelector(CONFIG.selectors.sidebarWordCount);
    console.log('[Sidebar] Synced values - Progress:', progressEl?.textContent, 'Highlights:', highlightEl?.textContent, 'Words:', wordCountEl?.textContent);
  }

  /**
   * 監聽原有 Dock 的變化並同步
   */
  function watchDockChanges() {
    // 使用 MutationObserver 監聽 Dock 元素的變化
    const observer = new MutationObserver(() => {
      syncDockData();
    });

    // 監聽所有原始統計元素
    const selectors = [
      CONFIG.selectors.originalReadingProgress,
      CONFIG.selectors.originalHighlightCount,
      CONFIG.selectors.originalAnnotationCount,
      CONFIG.selectors.originalImageCount,
      CONFIG.selectors.originalFormulaCount,
      CONFIG.selectors.originalTableCount,
      CONFIG.selectors.originalWordCount,
      CONFIG.selectors.originalReferenceCount
    ];

    selectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        observer.observe(el, {
          childList: true,
          characterData: true,
          subtree: true
        });
      }
    });

    // 智慧初始同步：等待 Dock 資料初始化完成
    let retryCount = 0;
    const maxRetries = 20; // 最多重試 20 次
    const retryDelay = 200; // 每次間隔 200ms

    function attemptInitialSync() {
      if (isDockDataReady()) {
        console.log('[Sidebar] Dock data is ready, syncing now');
        syncDockData();
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`[Sidebar] Dock data not ready yet, retry ${retryCount}/${maxRetries} in ${retryDelay}ms...`);
          setTimeout(attemptInitialSync, retryDelay);
        } else {
          console.warn('[Sidebar] Dock data still not ready after max retries, syncing anyway');
          syncDockData();
        }
      }
    }

    // 開始嘗試初始同步
    attemptInitialSync();
  }

  // ==================== 設定連結 ====================

  /**
   * 綁定側邊欄設定連結到原有設定連結
   */
  function bindSettingsLink() {
    if (!elements.sidebarSettingsLink || !elements.originalSettingsLink) return;

    elements.sidebarSettingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      elements.originalSettingsLink.click();

      // 行動裝置關閉側邊欄
      if (isMobile) {
        closeMobileSidebar();
      }
    });
  }

  // ==================== 可點選統計項 ====================

  /**
   * 綁定可點選統計項（醒目提示、批註）
   */
  function bindClickableStats() {
    const clickableStats = document.querySelectorAll('.sidebar-quick-stat');

    clickableStats.forEach(stat => {
      stat.addEventListener('click', () => {
        const statType = stat.dataset.statType;
        const originalStat = document.querySelector(`.stat-item-clickable[data-stat-type="${statType}"]`);

        if (originalStat && statType) {
          // 觸發原有統計項的點選事件
          originalStat.click();

          // 行動裝置關閉側邊欄
          if (isMobile) {
            closeMobileSidebar();
          }
        }
      });
    });
  }

  // ==================== 響應式處理 ====================

  /**
   * 動態綁定/解綁滾動事件到當前滾動容器
   */
  let lastScrollableElement = null;
  const debouncedProgressUpdate = debounce(updateSidebarReadingProgress, 100);

  function bindScrollForCurrentScrollable() {
    // 解綁舊的滾動監聽
    if (lastScrollableElement) {
      lastScrollableElement.removeEventListener('scroll', debouncedProgressUpdate);
      lastScrollableElement = null;
    }

    // 獲取當前滾動元素
    const el = getCurrentScrollableElement();
    if (el) {
      console.log(`[Sidebar] 綁定滾動事件到元素:`, el.id || el.className || el.tagName);
      el.addEventListener('scroll', debouncedProgressUpdate);
      lastScrollableElement = el;

      // 立即更新一次閱讀進度
      setTimeout(() => updateSidebarReadingProgress(), 50);
    } else {
      console.warn(`[Sidebar] 未找到可滾動元素，無法綁定滾動事件`);
    }
  }

  function unbindScrollForCurrentScrollable() {
    if (lastScrollableElement) {
      lastScrollableElement.removeEventListener('scroll', debouncedProgressUpdate);
      lastScrollableElement = null;
    }
  }

  /**
   * 處理視窗大小變化
   */
  function handleResize() {
    const newIsMobile = window.innerWidth < 768;

    if (newIsMobile !== isMobile) {
      isMobile = newIsMobile;

      // 切換到桌面端時，關閉行動裝置側邊欄
      if (!isMobile) {
        closeMobileSidebar();
      }
    }
  }

  // ==================== 初始化 ====================

  /**
   * 防抖函式
   */
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * 初始化側邊欄整合模組
   */
  function init() {
    console.log('[Sidebar] Initializing sidebar integration...');

    // 快取 DOM 元素
    cacheElements();

    // 監聽沉浸模式切換
    watchImmersiveMode();

    // 初始化桌面端摺疊功能
    initDesktopCollapse();

    // 初始化行動裝置側邊欄
    initMobileSidebar();

    // 初始化可摺疊區域
    initCollapsibleSection(
      CONFIG.selectors.sidebarTocSection,
      CONFIG.selectors.sidebarTocToggle,
      CONFIG.storageKeys.tocSectionExpanded
    );

    // 監聽 TOC 變化並同步
    watchTocChanges();

    // 監聽 Dock 變化並同步
    watchDockChanges();

    // 綁定設定連結
    bindSettingsLink();

    // 綁定可點選統計項
    bindClickableStats();

    // 監聽視窗大小變化
    window.addEventListener('resize', handleResize);

    // 動態綁定滾動事件到當前滾動容器
    bindScrollForCurrentScrollable();

    // 監聽分頁切換事件（重新綁定滾動事件）
    // 使用 MutationObserver 監聽 .tab-content 的變化
    const tabContent = document.getElementById('tabContent');
    if (tabContent) {
      const tabObserver = new MutationObserver(() => {
        console.log('[Sidebar] Tab content changed, rebinding scroll event');
        bindScrollForCurrentScrollable();
      });

      tabObserver.observe(tabContent, {
        childList: true,
        subtree: false
      });
    }

    // 監聽沉浸模式切換（重新綁定滾動事件）
    window.addEventListener('immersive-mode-changed', () => {
      console.log('[Sidebar] Immersive mode changed, rebinding scroll event');
      setTimeout(() => bindScrollForCurrentScrollable(), 100);
    });

    console.log('[Sidebar] Sidebar integration initialized successfully');
  }

  // ==================== 匯出 ====================

  // DOM 載入完成後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 匯出到全域（供除錯使用）
  window.SidebarIntegration = {
    syncTocData,
    syncDockData,
    updateReadingProgress: updateSidebarReadingProgress,
    bindScrollEvent: bindScrollForCurrentScrollable,
    unbindScrollEvent: unbindScrollForCurrentScrollable,
    openMobileSidebar,
    closeMobileSidebar,
    setSidebarCollapsed
  };

})();
