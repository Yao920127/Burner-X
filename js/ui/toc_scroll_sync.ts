/**
 * @file js/ui/toc_scroll_sync.js
 * @description 負責監聽頁面滾動，自動醒目提示當前視口中對應的 TOC 目錄項。
 * 支援普通檢視和沉浸式檢視的自動切換。
 */

(function() {
  let scrollTimeout = null;
  let lastActiveId = null;

  /**
   * 獲取當前的滾動容器
   * @returns {HTMLElement|Window}
   */
  function getScrollContainer() {
    if (document.body.classList.contains('immersive-active')) {
      return document.querySelector('#immersive-main-content-area .tab-content') || window;
    }
    return window;
  }

  /**
   * 核心邏輯：計算當前應該醒目提示的標題
   */
  function highlightActiveTocItem() {
    // 依賴 toc_logic.js 暴露的全域函式
    if (typeof window.getTocNodes !== 'function') return;

    const tocNodes = window.getTocNodes();
    if (!tocNodes || tocNodes.length === 0) return;

    const container = getScrollContainer();
    // 在沉浸模式下，容器頂部可能有偏移
    const containerTop = (container === window) ? 0 : container.getBoundingClientRect().top;
    // 定義“啟用區域”：視口頂部向下 150px 的範圍
    const activeZoneTop = containerTop + 150;

    let currentActiveNode = null;

    // 倒序走訪，找到第一個在啟用區域之上的標題
    for (let i = tocNodes.length - 1; i >= 0; i--) {
      const node = tocNodes[i];
      const rect = node.getBoundingClientRect();

      if (rect.top <= activeZoneTop) {
        currentActiveNode = node;
        break;
      }
    }

    // 如果頁面剛開啟，可能都在視口下方，預設醒目提示第一個
    if (!currentActiveNode && tocNodes.length > 0) {
        // 可選：currentActiveNode = tocNodes[0];
    }

    if (currentActiveNode) {
      const activeId = currentActiveNode.id;
      if (activeId !== lastActiveId) {
        updateTocUi(activeId);
        lastActiveId = activeId;
      }
    } else if (lastActiveId) {
        // 如果沒有找到啟用節點（例如滾動到最頂部之前），清除醒目提示
        clearTocUi();
        lastActiveId = null;
    }
  }

  /**
   * 更新 TOC UI 的醒目提示狀態
   * @param {string} activeId
   */
  function updateTocUi(activeId) {
    // 1. 移除所有舊的啟用狀態
    document.querySelectorAll('#toc-list a.active').forEach(link => {
      link.classList.remove('active');
    });

    // 2. 找到新的啟用連結
    // 可能有多個連結指向同一個ID（雖然不常見，但為了穩健性）
    // 使用屬性選擇器比對 href="#id"
    const activeLinks = document.querySelectorAll(`#toc-list a[href="#${CSS.escape(activeId)}"]`);
    
    activeLinks.forEach(link => {
        link.classList.add('active');
        
        // 可選：自動展開父級目錄
        // ensureParentExpanded(link);
        
        // 可選：確保醒目提示的目錄項在 TOC 視口中可見
        ensureTocItemVisible(link);
    });
  }

  function clearTocUi() {
      document.querySelectorAll('#toc-list a.active').forEach(link => {
          link.classList.remove('active');
      });
  }

  /**
   * 確保啟用的 TOC 項在滾動容器中可見
   * @param {HTMLElement} link 
   */
  function ensureTocItemVisible(link) {
      const tocPopup = document.getElementById('toc-popup');
      // 僅當 TOC 彈出視窗顯示時才自動滾動
      if (tocPopup && (getComputedStyle(tocPopup).display !== 'none' || document.body.classList.contains('immersive-active'))) {
          // 簡單的 scrollIntoView，使用 nearest 避免劇烈跳動
          link.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
  }

  /**
   * 節流滾動事件處理器
   */
  function handleScroll() {
    if (!scrollTimeout) {
      scrollTimeout = requestAnimationFrame(() => {
        highlightActiveTocItem();
        scrollTimeout = null;
      });
    }
  }

  /**
   * 初始化監聽器
   */
  function initScrollSync() {
    // 監聽全域滾動（普通模式）
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 監聽可能的內部容器滾動（沉浸模式或其他特定 Tab）
    // 使用事件代理或定期檢查可能更穩健，這裡先嚐試直接綁定常見容器
    const potentialContainers = document.querySelectorAll('.tab-content');
    potentialContainers.forEach(c => {
        c.addEventListener('scroll', handleScroll, { passive: true });
    });

    // 監聽沉浸模式切換，重新綁定或觸發一次計算
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class' && mutation.target === document.body) {
                // 模式切換後，稍等版面穩定再計算一次
                setTimeout(highlightActiveTocItem, 300);
                // 如果進入沉浸模式，可能需要重新綁定新的滾動容器
                if (document.body.classList.contains('immersive-active')) {
                     const immersiveContainer = document.querySelector('#immersive-main-content-area .tab-content');
                     if (immersiveContainer) {
                         immersiveContainer.removeEventListener('scroll', handleScroll); // 避免重複
                         immersiveContainer.addEventListener('scroll', handleScroll, { passive: true });
                     }
                }
            }
        }
    });
    observer.observe(document.body, { attributes: true });

    // 初始執行一次
    setTimeout(highlightActiveTocItem, 500);
  }

  // 頁面載入完成後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollSync);
  } else {
    initScrollSync();
  }

  // 暴露一個全域方法以便在內容重新渲染後手動觸發
  window.syncTocScroll = highlightActiveTocItem;

})();