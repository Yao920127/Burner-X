/**
 * @namespace TocFeature - Enhanced Modern Version
 * @description 管理頁面側邊浮動的現代化目錄 (Table of Contents) 功能。
 * 包括TOC按鈕的點選事件、TOC懸浮窗的顯示/隱藏、
 * 智慧層級識別、平滑滾動導航以及動態生成TOC列表項。
 * 
 * 特性：
 * - 現代化UI設計
 * - 智慧標題識別
 * - 平滑動畫過渡
 * - 響應式版面
 * - 層級視覺化
 * - 快速導航
 */
(function EnhancedTocFeature(){
  const tocBtn = document.getElementById('toc-float-btn');
  const tocPopup = document.getElementById('toc-popup');
  const tocList = document.getElementById('toc-list');
  const tocCloseBtn = document.getElementById('toc-popup-close-btn');

  // 智慧TOC快取系統
  let tocCache = {
    lastUpdate: 0,
    structure: null,
    nodes: [],
    clearCache: function() {
      this.lastUpdate = 0;
      this.structure = null;
      this.nodes = [];
    },
    isValid: function() {
      return Date.now() - this.lastUpdate < 30000; // 30秒快取
    }
  };

  // 效能監控
  let performanceMetrics = {
    renderTime: 0,
    nodeCount: 0,
    structureComplexity: 0
  };

  // 智慧觀察器，監控DOM變化
  let contentObserver = null;
  
  // 建立內容變化觀察器
  function initContentObserver() {
    if (!window.MutationObserver) return;
    
    contentObserver = new MutationObserver(function(mutations) {
      let shouldRefresh = false;
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          // 檢查是否有標題元素的變化
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && 
                (node.matches && node.matches('h1,h2,h3,h4,h5,h6,p') ||
                 node.querySelector && node.querySelector('h1,h2,h3,h4,h5,h6,p'))) {
              shouldRefresh = true;
            }
          });
        }
      });
      
      if (shouldRefresh) {
        tocCache.clearCache();
        if (tocPopup.classList.contains('toc-popup-visible')) {
          setTimeout(renderTocList, 500); // 延遲重新整理避免頻繁更新
        }
      }
    });
    
    const container = document.querySelector('.container');
    if (container) {
      contentObserver.observe(container, {
        childList: true,
        subtree: true
      });
    }
  }

  // 當前 TOC 顯示模式：both, ocr, translation
  let currentTocMode = 'both';
  
  // TOC 偏好設定
  let tocPreferences = {
    autoExpand: localStorage.getItem('toc-auto-expand') !== 'false',
    showPreview: localStorage.getItem('toc-show-preview') !== 'false',
    compactMode: localStorage.getItem('toc-compact-mode') === 'true',
    smartGrouping: localStorage.getItem('toc-smart-grouping') !== 'false'
  };

  // 新增 TOC 模式切換按鈕容器，改為現代化分頁形式
  let tocModeSelector = document.createElement('div');
  tocModeSelector.className = 'toc-mode-selector';
  tocModeSelector.innerHTML = `
    <button class="toc-mode-btn active" data-mode="both" title="顯示雙語目錄">
      <i class="fas fa-layer-group"></i> 雙語
    </button>
    <button class="toc-mode-btn" data-mode="ocr" title="僅顯示原文目錄">
      <i class="fas fa-file-text"></i> 原文
    </button>
    <button class="toc-mode-btn" data-mode="translation" title="僅顯示譯文目錄">
      <i class="fas fa-language"></i> 譯文
    </button>
  `;

  // 將模式選擇器插入到 TOC 彈出視窗標頭下方
  if (tocPopup) {
    const tocHeader = tocPopup.querySelector('#toc-popup-header');
    if (tocHeader) {
      tocHeader.parentNode.insertBefore(tocModeSelector, tocHeader.nextSibling);
    }
  }

  // 綁定模式切換按鈕事件
  tocModeSelector.querySelectorAll('.toc-mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const mode = this.dataset.mode;
      if (currentTocMode === mode) return; // 避免重複切換
      
      currentTocMode = mode;
      tocCache.clearCache(); // 清除快取

      // 更新按鈕狀態
      tocModeSelector.querySelectorAll('.toc-mode-btn').forEach(b => {
        b.classList.remove('active');
      });
      this.classList.add('active');

      // 新增切換動畫
      const tocListElement = document.getElementById('toc-list');
      tocListElement.style.opacity = '0.5';
      tocListElement.style.transform = 'translateY(10px)';
      
      // 重新渲染 TOC 列表
      setTimeout(() => {
        renderTocList();
        tocListElement.style.opacity = '';
        tocListElement.style.transform = '';
      }, 150);
    });
  });

  // 新增現代化底部控制區域
  const tocControls = document.createElement('div');
  tocControls.className = 'toc-controls';
  tocControls.innerHTML = `
    <button class="toc-control-btn" id="toc-expand-btn" title="展開/收起目錄" aria-label="展開目錄">
      <i class="fas fa-expand-arrows-alt"></i>
      <span>展開</span>
    </button>
    <button class="toc-control-btn" id="toc-expand-all" title="全部展開" aria-label="全部展開">
      <i class="fas fa-angle-double-down"></i>
      <span>全展開</span>
    </button>
    <button class="toc-control-btn" id="toc-collapse-all" title="全部摺疊" aria-label="全部摺疊">
      <i class="fas fa-angle-double-up"></i>
      <span>全摺疊</span>
    </button>
  `;

  // 將控制區域新增到TOC彈出視窗
  if (tocPopup) {
    tocPopup.appendChild(tocControls);
  }

  /**
   * TOC對映表 - 支援更多語言對照
   */
  const tocMap = {
    '歷史詳情': 'History Detail',
    'OCR內容': 'OCR Content',
    '僅OCR': 'OCR Only',
    '翻譯內容': 'Translation',
    '僅翻譯': 'Translation Only',
    '分塊對比': 'Chunk Compare',
    '摘要': 'Abstract',
    '引言': 'Introduction',
    '方法': 'Methods',
    '結果': 'Results',
    '討論': 'Discussion',
    '結論': 'Conclusion',
    '參考文獻': 'References',
    '附錄': 'Appendix'
  };

  /**
   * 儲存TOC列表項對應的頁面內標題DOM元素
   */
  let tocNodes = [];

  /**
   * 現代化智慧文字截斷函式
   * @param {string} text - 要截斷的文字
   * @param {number} maxLength - 最大長度
   * @returns {string} 截斷後的文字
   */
  function smartTruncateText(text, maxLength = 35) {
    if (!text || text.length <= maxLength) return text;

    // 檢查是否是圖表標題
    const isChartTitle = /^(圖|表|Figure|Table)\s*\d+/i.test(text);
    
    // 對於圖表標題，使用更智慧的截斷策略
    if (isChartTitle) {
      const titleMatch = text.match(/^(圖|表|Figure|Table)\s*\d+[\.:\：]?\s*(.*)$/i);
      if (titleMatch) {
        const prefix = titleMatch[1];
        const content = titleMatch[2] || '';
        
        // 在內容中查詢合適的截斷點
        const sentenceEnd = content.search(/[。！？\.!?]/); 
        if (sentenceEnd > 0 && sentenceEnd <= maxLength - prefix.length - 5) {
          return prefix + content.substring(0, sentenceEnd + 1);
        }
      }
    }

    // 智慧截斷：優先在標點符號處截斷
    const punctuationRegex = /[。，！？；：、\.,!?;:]/g;
    let match;
    let lastPunctIndex = -1;
    
    while ((match = punctuationRegex.exec(text)) !== null) {
      if (match.index < maxLength - 3) {
        lastPunctIndex = match.index;
      } else {
        break;
      }
    }
    
    if (lastPunctIndex > maxLength * 0.6) {
      return text.substring(0, lastPunctIndex + 1);
    }
    
    // 在空格處截斷
    const spaceIndex = text.lastIndexOf(' ', maxLength - 3);
    if (spaceIndex > maxLength * 0.7) {
      return text.substring(0, spaceIndex) + '...';
    }
    
    // 最後使用硬截斷
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * 現代化臨時載入效果，帶進度指示
   * @param {string} sectionName - 正在導航到的章節名稱
   */
  function showEnhancedLoadingEffect(sectionName) {
    let effectDiv = document.getElementById('toc-loading-effect');
    const mainContainer = document.querySelector('.container');

    if (!effectDiv) {
      effectDiv = document.createElement('div');
      effectDiv.id = 'toc-loading-effect';
      effectDiv.className = 'loading-effect';
      document.body.appendChild(effectDiv);
    }

    if (mainContainer) {
      mainContainer.classList.add('content-blurred');
    }

    const truncatedSectionName = smartTruncateText(sectionName, 30);
    effectDiv.innerHTML = `
      <div class="loading-content">
        <div class="loading-icon">
          <i class="fas fa-compass"></i>
        </div>
        <div class="loading-text">正在前往</div>
        <div class="loading-target">${truncatedSectionName}</div>
        <div class="loading-progress">
          <div class="progress-bar"></div>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      effectDiv.classList.add('loading-effect-visible');
      
      // 啟動進度條動畫
      const progressBar = effectDiv.querySelector('.progress-bar');
      if (progressBar) {
        progressBar.style.width = '0%';
        setTimeout(() => {
          progressBar.style.width = '100%';
        }, 100);
      }
    });

    setTimeout(() => {
      effectDiv.classList.remove('loading-effect-visible');
      if (mainContainer) {
        mainContainer.classList.remove('content-blurred');
      }
    }, 1800);
  }

  /**
   * 現代化平滑切換TOC項的摺疊狀態
   * @param {HTMLElement} toggleBtn - 摺疊/展開按鈕元素
   * @param {HTMLElement} childrenContainer - 子項容器元素
   */
  function toggleTocItem(toggleBtn, childrenContainer) {
    const isCollapsed = toggleBtn.classList.contains('collapsed');
    const listItem = toggleBtn.closest('li');

    if (isCollapsed) {
      // 展開動畫
      toggleBtn.classList.remove('collapsed');
      childrenContainer.classList.remove('collapsed');

      // 計算目標高度
      childrenContainer.style.height = '0';
      childrenContainer.style.opacity = '0';
      childrenContainer.style.transform = 'translateY(-10px)';
      
      const targetHeight = Array.from(childrenContainer.children)
        .reduce((height, child) => height + child.offsetHeight, 0);

      // 觸發動畫
      requestAnimationFrame(() => {
        childrenContainer.style.height = targetHeight + 'px';
        childrenContainer.style.opacity = '1';
        childrenContainer.style.transform = 'translateY(0)';
      });

      // 動畫完成後清理樣式
      setTimeout(() => {
        childrenContainer.style.height = 'auto';
      }, 300);
      
      // 新增展開狀態指示
      if (listItem) {
        listItem.classList.add('toc-expanded');
      }
    } else {
      // 摺疊動畫
      const currentHeight = childrenContainer.offsetHeight;
      childrenContainer.style.height = currentHeight + 'px';
      
      requestAnimationFrame(() => {
        toggleBtn.classList.add('collapsed');
        childrenContainer.style.height = '0';
        childrenContainer.style.opacity = '0';
        childrenContainer.style.transform = 'translateY(-10px)';
      });
      
      setTimeout(() => {
        childrenContainer.classList.add('collapsed');
      }, 300);
      
      // 移除展開狀態指示
      if (listItem) {
        listItem.classList.remove('toc-expanded');
      }
    }
    
    // 儲存使用者的摺疊偏好
    const itemId = listItem?.querySelector('a')?.getAttribute('href');
    if (itemId) {
      const collapsedItems = JSON.parse(localStorage.getItem('toc-collapsed-items') || '[]');
      if (isCollapsed) {
        // 展開：從摺疊列表中移除
        const index = collapsedItems.indexOf(itemId);
        if (index > -1) collapsedItems.splice(index, 1);
      } else {
        // 摺疊：新增到摺疊列表
        if (!collapsedItems.includes(itemId)) {
          collapsedItems.push(itemId);
        }
      }
      localStorage.setItem('toc-collapsed-items', JSON.stringify(collapsedItems));
    }
  }

  // 現代化開啟/關閉懸浮窗
  tocBtn.onclick = function() {
    const isOpen = tocPopup.classList.contains('toc-popup-visible');
    if (isOpen) {
      // 關閉動畫
      tocPopup.classList.remove('toc-popup-visible');
      tocPopup.classList.add('toc-popup-hiding');
      setTimeout(() => {
        tocPopup.classList.remove('toc-popup-hiding');
        tocPopup.classList.add('toc-popup-hidden');
      }, 400);
    } else {
      // 開啟前檢查和更新內容
      updateTocModeSelectorVisibility();
      
      // 如果快取無效，重新渲染
      if (!tocCache.isValid()) {
        renderTocList();
      }
      
      // 開啟動畫
      tocPopup.classList.remove('toc-popup-hidden', 'toc-popup-hiding');
      tocPopup.classList.add('toc-popup-visible');
      
      // 延遲聚焦以改善使用者體驗
      setTimeout(() => {
        const firstLink = tocPopup.querySelector('#toc-list a');
        if (firstLink) {
          firstLink.focus();
        }
      }, 100);
    }
  };

  // 關閉懸浮窗按鈕
  tocCloseBtn.onclick = function() {
    tocPopup.classList.remove('toc-popup-visible');
    tocPopup.classList.add('toc-popup-hiding');
    setTimeout(() => {
      tocPopup.classList.remove('toc-popup-hiding');
      tocPopup.classList.add('toc-popup-hidden');
    }, 400);
  };

  /**
   * 更新TOC模式選擇器的可見性，僅在分塊對比模式下顯示
   */
  function updateTocModeSelectorVisibility() {
    const visibleTab = document.querySelector('.tab-btn.active');
    const currentTabId = visibleTab ? visibleTab.id : null;
    const isChunkCompareMode = currentTabId === 'tab-chunk-compare';

    if (isChunkCompareMode) {
      tocModeSelector.style.display = 'flex';
    } else {
      tocModeSelector.style.display = 'none';
      if (currentTocMode !== 'both') {
        currentTocMode = 'both';
        tocModeSelector.querySelectorAll('.toc-mode-btn').forEach(b => {
          b.classList.remove('active');
        });
        tocModeSelector.querySelector('[data-mode="both"]').classList.add('active');
      }
    }
  }

  /**
   * 增強的智慧層級管理器
   */
  let enhancedLevelManager = {
    prefixMapping: {},
    contextStack: [],
    lastStructureInfo: null,
    
    analyzeHeading: function(text) {
      const patterns = {
        chapter: /^第[一二三四五六七八九十百千萬]+[章節篇部]/,
        numeric: /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/,
        roman: /^([IVX]+)(?:\.([IVX]+))?(?:\.([IVX]+))?/i,
        bulletList: /^[•\*\-]\s+/,
        numberedList: /^(\d+)(?:[\.、]|\s*[\(\（])\s*/,
        specialSection: /^(摘要|Abstract|引言|Introduction|參考文獻|References|附錄|Appendix|致謝|Acknowledgements|結論|Conclusion|討論|Discussion|實驗|Experiment|方法|Methods|材料|Materials)/i
      };

      let structureInfo = {
        type: 'normal',
        level: null,
        prefix: '',
        content: text,
        confidence: 0
      };

      // 檢測各種模式並計算置信度
      for (const [type, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match) {
          structureInfo.type = type;
          structureInfo.prefix = match[0];
          structureInfo.content = text.substring(match[0].length).trim();
          structureInfo.confidence = this.calculateConfidence(type, match);
          
          // 根據型別確定層級
          structureInfo.level = this.determineLevelByType(type, match);
          break;
        }
      }

      // 更新上下文堆疊
      this.updateContextStack(structureInfo);
      this.lastStructureInfo = structureInfo;
      
      return structureInfo;
    },

    calculateConfidence: function(type, match) {
      // 基於模式複雜度和比對質量計算置信度
      const confidenceMap = {
        'specialSection': 0.95,
        'chapter': 0.9,
        'numeric': 0.85,
        'roman': 0.8,
        'numberedList': 0.7,
        'bulletList': 0.6
      };
      return confidenceMap[type] || 0.5;
    },

    determineLevelByType: function(type, match) {
      switch (type) {
        case 'specialSection':
        case 'chapter':
          return 1;
        case 'numeric':
          return (match[0].match(/\./g) || []).length + 1;
        case 'roman':
          return (match[0].match(/\./g) || []).length + 1;
        case 'numberedList':
        case 'bulletList':
          return (this.lastStructureInfo?.level || 1) + 1;
        default:
          return 2;
      }
    },

    updateContextStack: function(structureInfo) {
      // 維護結構化上下文堆疊
      if (structureInfo.level) {
        // 移除更深層級的專案
        this.contextStack = this.contextStack.filter(item => item.level < structureInfo.level);
        this.contextStack.push(structureInfo);
      }
    }
  };

  /**
   * 主要的TOC渲染函式 - 增強版
   */
  function renderTocList() {
    const startTime = performance.now();
    
    // 檢查快取
    if (tocCache.isValid() && tocCache.structure) {
      buildTocHtml(tocCache.structure.children, tocList);
      return;
    }

    tocList.innerHTML = '';
    tocNodes = [];
    
    const container = document.querySelector('.container');
    if (!container) return;

    // 收集所有潛在標題
    let potentialHeadings = [];
    container.querySelectorAll('h1, h2:not(#fileName), h3, h4, h5, h6, p.converted-from-heading').forEach(h => {
      potentialHeadings.push(h);
    });

    // 新增圖表標題
    const captionRegex = /^(圖|表|Figure|Table)\s*[\d\w.-]+\b/i;
    container.querySelectorAll('p').forEach(p => {
      const text = p.textContent.trim();
      if (captionRegex.test(text)) {
        p.dataset.isCaptionToc = "true";
        p.dataset.isChartCaption = "true";
        potentialHeadings.push(p);
      }
    });

    // 按文件順序排序
    potentialHeadings.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // 根據當前模式過濾
    let filteredHeadings = filterHeadingsByMode(potentialHeadings);

    // 構建TOC結構
    const tocStructure = buildTocStructure(filteredHeadings);
    
    // 快取結果
    tocCache.structure = tocStructure;
    tocCache.nodes = tocNodes;
    tocCache.lastUpdate = Date.now();

    // 渲染HTML
    buildTocHtml(tocStructure.children, tocList);

    // 恢復摺疊狀態
    restoreCollapsedState();

    // 記錄效能指標
    performanceMetrics.renderTime = performance.now() - startTime;
    performanceMetrics.nodeCount = tocNodes.length;
    
    console.log(`TOC渲染完成: ${performanceMetrics.nodeCount}個節點, 耗時${performanceMetrics.renderTime.toFixed(2)}ms`);
  }

  /**
   * 根據模式過濾標題
   */
  function filterHeadingsByMode(headings) {
    if (currentTocMode === 'both') {
      return headings;
    }

    const visibleTab = document.querySelector('.tab-btn.active');
    const currentTabId = visibleTab ? visibleTab.id : null;
    const isChunkCompareMode = currentTabId === 'tab-chunk-compare';

    if (isChunkCompareMode) {
      const selector = currentTocMode === 'ocr' ? '.align-block-ocr' : '.align-block-trans';
      return headings.filter(el => el.closest(selector) !== null);
    } else {
      const expectedTabId = currentTocMode === 'ocr' ? 'tab-ocr' : 'tab-translation';
      if (currentTabId === expectedTabId) {
        return headings;
      } else {
        // 顯示提示資訊
        const li = document.createElement('li');
        li.className = 'toc-info';
        li.innerHTML = `
          <div class="toc-mode-hint">
            <i class="fas fa-info-circle"></i>
            <span>請切換到${currentTocMode === 'ocr' ? '原文' : '譯文'}分頁檢視對應目錄</span>
          </div>
        `;
        tocList.appendChild(li);
        return [];
      }
    }
  }

  /**
   * 構建TOC層級結構
   */
  function buildTocStructure(headings) {
    const structure = { root: true, children: [] };
    let currentPath = [structure];
    let previousLevel = 0;

    headings.forEach((nodeEl, idx) => {
      if (!nodeEl.id) nodeEl.id = 'toc-auto-' + idx;
      tocNodes.push(nodeEl);

      const text = nodeEl.textContent.trim();
      if (text.includes('原文塊') || text.includes('譯文塊')) return;

      // 使用增強的層級管理器分析
      const structureInfo = enhancedLevelManager.analyzeHeading(text);
      const level = structureInfo.level || getDefaultLevel(nodeEl);

      // 調整路徑
      adjustPath(currentPath, level, previousLevel);

      // 建立TOC項
      const tocItem = createTocItem(nodeEl, text, level, structureInfo);
      currentPath[currentPath.length - 1].children.push(tocItem);
      
      previousLevel = level;
    });

    return structure;
  }

  /**
   * 獲取預設層級
   */
  function getDefaultLevel(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName.match(/^h[1-6]$/)) {
      return parseInt(tagName.substring(1));
    }
    return element.dataset.isChartCaption === "true" ? 4 : 3;
  }

  /**
   * 調整當前路徑
   */
  function adjustPath(path, currentLevel, previousLevel) {
    if (currentLevel > previousLevel) {
      // 進入更深層級
      while (path.length < currentLevel) {
        if (path[path.length - 1].children.length === 0) {
          // 建立佔位符
          const placeholder = {
            id: 'placeholder-' + Date.now(),
            text: '未命名章節',
            level: path.length,
            children: []
          };
          path[path.length - 1].children.push(placeholder);
        }
        path.push(path[path.length - 1].children[path[path.length - 1].children.length - 1]);
      }
    } else if (currentLevel < previousLevel) {
      // 返回上層
      const levelsToGoUp = previousLevel - currentLevel;
      for (let i = 0; i < levelsToGoUp && path.length > 1; i++) {
        path.pop();
      }
    }
  }

  /**
   * 建立TOC項
   */
  function createTocItem(element, text, level, structureInfo) {
    const displayText = smartTruncateText(text);
    const translation = tocMap[text];
    
    return {
      id: element.id,
      text: displayText,
      originalText: text,
      translation: translation,
      level: level,
      children: [],
      isChartCaption: element.dataset.isChartCaption === "true",
      structureInfo: structureInfo,
      element: element
    };
  }

  /**
   * 構建TOC HTML - 增強版
   */
  function buildTocHtml(items, parentElement) {
    items.forEach(item => {
      if (item.id?.indexOf('placeholder') === 0 && !item.text) return;

      const li = document.createElement('li');
      const hasChildren = item.children && item.children.length > 0;

      // 設定CSS類
      li.className = getTocItemClasses(item, hasChildren);

      // 構建連結HTML
      const linkHTML = buildLinkHTML(item, hasChildren);
      const link = document.createElement('a');
      link.href = `#${item.id}`;
      link.innerHTML = linkHTML;
      link.dataset.originalText = item.originalText;

      // 新增現代化點選事件
      addEnhancedClickHandler(link, item);

      li.appendChild(link);

      // 新增子項
      if (hasChildren) {
        const childrenContainer = document.createElement('ul');
        childrenContainer.className = 'toc-children';
        buildTocHtml(item.children, childrenContainer);
        li.appendChild(childrenContainer);

        // 新增摺疊按鈕事件
        addToggleHandler(li);
      }

      parentElement.appendChild(li);
    });
  }

  /**
   * 獲取TOC項的CSS類
   */
  function getTocItemClasses(item, hasChildren) {
    let classes = [];
    
    if (item.level) {
      if (item.isChartCaption) {
        classes.push('toc-caption');
      } else {
        classes.push(`toc-h${item.level}`);
      }
    }

    if (hasChildren) {
      classes.push('has-children');
    }

    if (item.structureInfo?.type && item.structureInfo.type !== 'normal') {
      classes.push('toc-structured', `toc-structure-${item.structureInfo.type}`);
    }

    return classes.join(' ');
  }

  /**
   * 構建連結HTML
   */
  function buildLinkHTML(item, hasChildren) {
    let html = '';

    if (hasChildren) {
      html += '<span class="toc-toggle">▼</span>';
    }

    html += '<span class="toc-text">';

    // 新增結構化字首
    if (item.structureInfo?.prefix) {
      html += `<span class="toc-prefix">${item.structureInfo.prefix}</span>`;
    }

    // 新增圖表圖示
    if (item.isChartCaption) {
      const isTable = item.originalText?.startsWith('表');
      const icon = isTable ? '📊' : '📈';
      html += `<span class="toc-chart-icon">${icon}</span>`;
    }

    // 新增內容
    let displayText = item.text;
    if (item.structureInfo?.prefix && displayText.startsWith(item.structureInfo.prefix)) {
      displayText = displayText.substring(item.structureInfo.prefix.length).trim();
    }
    
    html += `<span class="toc-content">${displayText}</span>`;

    // 新增翻譯
    if (item.translation && item.translation !== item.originalText) {
      html += `<span class="toc-en-translation">/ ${item.translation}</span>`;
    }

    html += '</span>';
    return html;
  }

  /**
   * 新增增強的點選處理器
   */
  function addEnhancedClickHandler(link, item) {
    link.onclick = function(e) {
      e.preventDefault();

      console.log('[TOC Debug] TOC 點選事件觸發:', item.id);

      const targetElement = document.getElementById(item.id);
      if (!targetElement) {
        console.log('[TOC Debug] 未找到目標元素:', item.id);
        return;
      }

      // 計算距離並決定是否顯示載入效果
      const clickedNodeIndex = tocNodes.findIndex(n => n.id === item.id);
      const currentTopNodeIndex = getCurrentTopNodeIndex();
      const indexDifference = Math.abs(clickedNodeIndex - currentTopNodeIndex);

      if (indexDifference >= 6) {
        showEnhancedLoadingEffect(item.originalText || "目標章節");
      }

      console.log('[TOC Debug] 檢查沉浸模式:', {
        hasImmersiveLayout: !!window.ImmersiveLayout,
        isActive: window.ImmersiveLayout?.isActive()
      });

      // 修復：在沉浸模式下使用自定義滾動邏輯，避免版面偏移
      if (window.ImmersiveLayout && window.ImmersiveLayout.isActive()) {
        console.log('[TOC Debug] 進入沉浸模式分支');
        // 沉浸模式下使用自定義滾動定位
        // 優先查詢 .content-wrapper（真正的滾動容器）
        let scrollContainer = document.querySelector('#immersive-main-content-area .content-wrapper');

        // 後備方案 1：查詢 .js-scroll-container 標記
        if (!scrollContainer) {
          scrollContainer = document.querySelector('#immersive-main-content-area .js-scroll-container');
        }

        // 後備方案 2：查詢 .tab-content
        if (!scrollContainer) {
          scrollContainer = document.querySelector('#immersive-main-content-area .tab-content');
        }

        if (scrollContainer) {
          // 使用 computed style 檢查是否可滾動（而不是檢查內聯樣式）
          const computedStyle = getComputedStyle(scrollContainer);
          const overflowY = computedStyle.overflowY;
          const isScrollable = (overflowY === 'auto' || overflowY === 'scroll');

          console.log('[TOC Debug] 沉浸模式滾動檢測:', {
            scrollContainer: scrollContainer.className,
            overflowY,
            isScrollable,
            scrollHeight: scrollContainer.scrollHeight,
            clientHeight: scrollContainer.clientHeight
          });

          // 只要找到了滾動容器，就嘗試滾動（即使當前沒有捲軸）
          if (isScrollable) {
            // 計算目標元素在滾動容器內的絕對位置
            const containerRect = scrollContainer.getBoundingClientRect();
            const targetRect = targetElement.getBoundingClientRect();
            const currentScrollTop = scrollContainer.scrollTop;

            // 目標元素相對於容器內容的絕對位置 = 當前滾動位置 + 目標相對於容器視口的位置
            const targetOffsetInContainer = currentScrollTop + (targetRect.top - containerRect.top);

            // 改進的滾動邏輯：確保目標元素可見，但不滾動過頭
            // 如果目標元素已經在視口內，就不滾動
            const viewportTop = containerRect.top;
            const viewportBottom = containerRect.bottom;
            const targetTop = targetRect.top;
            const targetBottom = targetRect.bottom;

            // 目標元素已經完全可見，不需要滾動
            if (targetTop >= viewportTop && targetBottom <= viewportBottom) {
              return;
            }

            // 目標元素在視口上方，需要向上滾動
            if (targetTop < viewportTop) {
              const scrollDelta = targetTop - viewportTop;
              scrollContainer.scrollTo({
                top: currentScrollTop + scrollDelta,
                behavior: 'smooth'
              });
              return;
            }

            // 目標元素在視口下方，需要向下滾動
            // 將目標元素滾動到視口底部附近
            if (targetBottom > viewportBottom) {
              const scrollDelta = targetBottom - viewportBottom + 20; // 底部留 20px 空隙
              scrollContainer.scrollTo({
                top: currentScrollTop + scrollDelta,
                behavior: 'smooth'
              });
              return;
            }
          }
        }

        // 如果沒有找到滾動容器，不呼叫 scrollIntoView，避免滾動 overflow:hidden 的祖先容器
        return;
      } else {
        // 普通模式下，檢查是否需要滾動 .tab-content 容器（OCR/翻譯模式）
        const tabContent = document.querySelector('.tab-content');

        // 檢查 tabContent 是否是滾動容器
        if (tabContent) {
          const computedStyle = getComputedStyle(tabContent);
          const overflowY = computedStyle.overflowY;
          const overflow = computedStyle.overflow;
          // 支援 auto 和 scroll
          const isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll');
          const hasScroll = tabContent.scrollHeight > tabContent.clientHeight;

          if (isScrollable && hasScroll) {
            // 計算目標元素相對於滾動容器的位置
            const containerRect = tabContent.getBoundingClientRect();
            const targetRect = targetElement.getBoundingClientRect();
            const currentScrollTop = tabContent.scrollTop;

            // 計算目標位置（將元素置於容器中心）
            const targetScrollTop = currentScrollTop + targetRect.top - containerRect.top - (containerRect.height / 2) + (targetRect.height / 2);

            // 平滑滾動到目標位置
            tabContent.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            // 如果 tab-content 不是滾動容器或不需要滾動，使用原生 scrollIntoView
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        } else {
          // tab-content 不存在，使用原生 scrollIntoView
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }

      // 新增醒目提示效果
      addHighlightEffect(targetElement);
    };
  }

  /**
   * 獲取當前頂部節點索引
   */
  function getCurrentTopNodeIndex() {
    if (tocNodes.length === 0) return 0;

    let minPositiveTop = Infinity;
    let topIndex = 0;

    for (let i = 0; i < tocNodes.length; i++) {
      const rect = tocNodes[i].getBoundingClientRect();
      if (rect.top >= 0 && rect.top < minPositiveTop) {
        minPositiveTop = rect.top;
        topIndex = i;
      }
    }

    return topIndex;
  }

  /**
   * 新增醒目提示效果
   */
  function addHighlightEffect(element) {
    element.classList.add('toc-target-highlight');
    setTimeout(() => {
      element.classList.remove('toc-target-highlight');
    }, 3000);
  }

  /**
   * 新增摺疊按鈕處理器
   */
  function addToggleHandler(li) {
    const toggleBtn = li.querySelector('.toc-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();

        const childContainer = this.closest('li').querySelector('.toc-children');
        if (childContainer) {
          toggleTocItem(this, childContainer);
        }
      });
    }
  }

  /**
   * 恢復摺疊狀態
   */
  function restoreCollapsedState() {
    const collapsedItems = JSON.parse(localStorage.getItem('toc-collapsed-items') || '[]');
    
    collapsedItems.forEach(itemId => {
      const link = tocList.querySelector(`a[href="${itemId}"]`);
      if (link) {
        const li = link.closest('li');
        const toggleBtn = li.querySelector('.toc-toggle');
        const childrenContainer = li.querySelector('.toc-children');
        
        if (toggleBtn && childrenContainer) {
          toggleBtn.classList.add('collapsed');
          childrenContainer.classList.add('collapsed');
        }
      }
    });
  }

  // 鍵盤導航支援
  function addKeyboardNavigation() {
    tocPopup.addEventListener('keydown', function(e) {
      const focusedElement = document.activeElement;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          navigateToNext(focusedElement);
          break;
        case 'ArrowUp':
          e.preventDefault();
          navigateToPrevious(focusedElement);
          break;
        case 'Enter':
        case ' ':
          if (focusedElement.classList.contains('toc-toggle')) {
            e.preventDefault();
            focusedElement.click();
          }
          break;
        case 'Escape':
          e.preventDefault();
          tocCloseBtn.click();
          break;
      }
    });
  }

  function navigateToNext(current) {
    const allFocusable = tocPopup.querySelectorAll('a, .toc-toggle, .toc-control-btn');
    const currentIndex = Array.from(allFocusable).indexOf(current);
    const nextElement = allFocusable[currentIndex + 1];
    if (nextElement) nextElement.focus();
  }

  function navigateToPrevious(current) {
    const allFocusable = tocPopup.querySelectorAll('a, .toc-toggle, .toc-control-btn');
    const currentIndex = Array.from(allFocusable).indexOf(current);
    const prevElement = allFocusable[currentIndex - 1];
    if (prevElement) prevElement.focus();
  }

  // 控制按鈕事件綁定
  function bindControlEvents() {
    // 展開/收起目錄
    document.getElementById('toc-expand-btn').addEventListener('click', function() {
      const isExpanded = tocPopup.classList.contains('toc-expanded');
      const icon = this.querySelector('i');
      const text = this.querySelector('span');
      
      if (isExpanded) {
        tocPopup.classList.remove('toc-expanded');
        icon.className = 'fas fa-expand-arrows-alt';
        text.textContent = '展開';
        this.title = '展開目錄';
      } else {
        tocPopup.classList.add('toc-expanded');
        icon.className = 'fas fa-compress-arrows-alt';
        text.textContent = '收起';
        this.title = '收起目錄';
      }
    });

    // 全部展開
    document.getElementById('toc-expand-all').addEventListener('click', function() {
      const allToggleButtons = tocList.querySelectorAll('.toc-toggle.collapsed');
      allToggleButtons.forEach(btn => {
        const childrenContainer = btn.closest('li').querySelector('.toc-children');
        if (childrenContainer) {
          toggleTocItem(btn, childrenContainer);
        }
      });
    });

    // 全部摺疊
    document.getElementById('toc-collapse-all').addEventListener('click', function() {
      const allToggleButtons = tocList.querySelectorAll('.toc-toggle:not(.collapsed)');
      allToggleButtons.forEach(btn => {
        const childrenContainer = btn.closest('li').querySelector('.toc-children');
        if (childrenContainer) {
          toggleTocItem(btn, childrenContainer);
        }
      });
    });
  }

  // 全域重新整理函式
  window.refreshTocList = function() {
    tocCache.clearCache();
    updateTocModeSelectorVisibility();
    renderTocList();
  };

  // 初始化
  function init() {
    updateTocModeSelectorVisibility();
    renderTocList();
    addKeyboardNavigation();
    bindControlEvents();
    initContentObserver();
    
    // 監聽分頁切換
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        setTimeout(updateTocModeSelectorVisibility, 100);
      });
    });

    console.log('Enhanced TOC initialized successfully');
  }

  // 啟動初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露API
  window.EnhancedTocFeature = {
    refresh: window.refreshTocList,
    getNodes: () => tocNodes,
    getStructure: () => tocCache.structure,
    getMetrics: () => performanceMetrics,
    setMode: (mode) => {
      if (['both', 'ocr', 'translation'].includes(mode)) {
        currentTocMode = mode;
        renderTocList();
      }
    }
  };

})();