/**
 * @namespace TocFeature
 * @description 管理頁面右側浮動的目錄 (Table of Contents) 功能。
 * 包括TOC按鈕的點選事件、TOC懸浮窗的顯示/隱藏、
 * 以及動態生成TOC列表項。
 */
(function TocFeature(){
  const tocBtn = document.getElementById('toc-float-btn');
  const tocPopup = document.getElementById('toc-popup');
  const tocList = document.getElementById('toc-list');
  const tocCloseBtn = document.getElementById('toc-popup-close-btn');

  // 新增 TOC 模式切換按鈕容器，改為分頁形式
  let tocModeSelector = document.createElement('div');
  tocModeSelector.className = 'toc-mode-selector';
  tocModeSelector.innerHTML = `
    <button class="toc-mode-btn active" data-mode="both">雙語</button>
    <button class="toc-mode-btn" data-mode="ocr">原文</button>
    <button class="toc-mode-btn" data-mode="translation">譯文</button>
  `;

  // 當前 TOC 顯示模式：both, ocr, translation
  let currentTocMode = 'both';

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
      currentTocMode = mode;

      // 更新按鈕狀態
      tocModeSelector.querySelectorAll('.toc-mode-btn').forEach(b => {
        b.classList.remove('active');
      });
      this.classList.add('active');

      // 重新渲染 TOC 列表
      renderTocList();
    });
  });

  // 新增底部控制區域（合併展開目錄按鈕和全部展開/摺疊按鈕）
  const tocControls = document.createElement('div');
  tocControls.className = 'toc-controls';
  tocControls.innerHTML = `
    <button class="toc-control-btn" id="toc-expand-btn" title="展開目錄" aria-label="展開目錄">
      <i class="fa-solid fa-angles-right"></i>
    </button>
    <button class="toc-control-btn" id="toc-expand-all" title="全部展開" aria-label="全部展開">
      <i class="fa-solid fa-angle-double-down"></i>
    </button>
    <button class="toc-control-btn" id="toc-collapse-all" title="全部摺疊" aria-label="全部摺疊">
      <i class="fa-solid fa-angle-double-up"></i>
    </button>
  `;

  // 將控制區域新增到TOC彈出視窗
  if (tocPopup) {
    tocPopup.appendChild(tocControls);
  }

  /**
   * @const {Object<string, string>} tocMap
   * @description 用於TOC中標題的中文到英文的簡單對映表。
   */
  const tocMap = {
    '歷史詳情': 'History Detail',
    'OCR內容': 'OCR Content',
    '僅OCR': 'OCR Only',
    '翻譯內容': 'Translation',
    '僅翻譯': 'Translation Only',
    '分塊對比': 'Chunk Compare',
  };
  /**
   * @type {Array<HTMLElement>}
   * @description 儲存TOC列表項對應的頁面內標題DOM元素。
   */
  let tocNodes = []; // 儲存目錄對應的標題DOM元素

  /**
   * 判斷兩個文字是否相似
   * @param {string} text1 - 第一個文字
   * @param {string} text2 - 第二個文字
   * @returns {boolean} 是否相似
   */
  function areTextsSimilar(text1, text2) {
    // 如果兩個字串長度差距大於2，認為不相似
    if (Math.abs(text1.length - text2.length) > 2) {
      return false;
    }

    // 簡單的模糊相似度判斷
    let similarity = 0;
    const minLength = Math.min(text1.length, text2.length);

    for (let i = 0; i < minLength; i++) {
      if (text1[i] === text2[i]) {
        similarity++;
      }
    }

    const similarityRatio = similarity / minLength;
    return similarityRatio > 0.8; // 相似度大於80%認為是相似的
  }

  /**
   * 智慧截斷長文字
   * @param {string} text - 要截斷的文字
   * @returns {string} 截斷後的文字
   */
  function truncateText(text) {
    // 如果文字不超過35個字元，直接返回
    if (text.length <= 35) {
      return text;
    }

    // 檢查文字是否是圖表標題（以"圖"或"表"開頭，後跟數字）
    const isChartTitle = /^(圖|表)\s*\d+\.?\s*/.test(text);

    // 如果是圖表標題，優先在第一個句號或逗號處截斷
    if (isChartTitle) {
      const dotIndex = text.indexOf('。');
      const commaIndex = text.indexOf('，');
      // 也檢查英文句號和逗號
      const enDotIndex = text.indexOf('.');
      const enCommaIndex = text.indexOf(',');

      // 找到第一個有效的截斷標點位置
      let firstCutIndex = -1;
      // 優先使用句號，其次使用逗號
      if (dotIndex !== -1) {
        firstCutIndex = dotIndex;
      } else if (enDotIndex !== -1) {
        // 確保英文句號不是數字的一部分
        const charBeforeDot = text.charAt(enDotIndex-1);
        const charAfterDot = text.charAt(enDotIndex+1);
        // 如果句號前後都是數字，可能是小數點，繼續檢查其他標點
        if (!(/\d/.test(charBeforeDot) && /\d/.test(charAfterDot))) {
          firstCutIndex = enDotIndex;
        }
      }

      // 如果沒有找到句號，嘗試使用逗號
      if (firstCutIndex === -1) {
        if (commaIndex !== -1) {
          firstCutIndex = commaIndex;
        } else if (enCommaIndex !== -1) {
          firstCutIndex = enCommaIndex;
        }
      }

      // 如果仍然沒有找到有效的截斷點，使用所有標點中最早的一個
      if (firstCutIndex === -1) {
        const allPunctIndices = [dotIndex, commaIndex, enDotIndex, enCommaIndex].filter(idx => idx !== -1);
        if (allPunctIndices.length > 0) {
          firstCutIndex = Math.min(...allPunctIndices);
        }
      }

      // 確保標點不是圖表編號的一部分（如"圖5."中的句號）
      if (firstCutIndex > 5) {
        // 特殊處理英文句號，可能是小數點
        if (firstCutIndex === enDotIndex) {
          const charBeforeDot = text.charAt(firstCutIndex-1);
          const charAfterDot = text.charAt(firstCutIndex+1);

          // 如果句號前後都是數字，這可能是編號的一部分
          if (/\d/.test(charBeforeDot) && /\d/.test(charAfterDot)) {
            // 繼續尋找下一個標點，同樣優先使用句號
            const nextText = text.substring(firstCutIndex + 1);
            const nextDotIndex = nextText.indexOf('。');
            const nextEnDotIndex = nextText.indexOf('.');

            // 優先檢查中文句號
            if (nextDotIndex !== -1) {
              return text.substring(0, firstCutIndex + 1 + nextDotIndex + 1);
            }
            // 再檢查英文句號
            else if (nextEnDotIndex !== -1) {
              // 確保這個英文句號不是小數點
              const nextCharBefore = firstCutIndex + 1 + nextEnDotIndex - 1 < text.length ?
                                     text.charAt(firstCutIndex + 1 + nextEnDotIndex - 1) : '';
              const nextCharAfter = firstCutIndex + 1 + nextEnDotIndex + 1 < text.length ?
                                    text.charAt(firstCutIndex + 1 + nextEnDotIndex + 1) : '';

              if (!(/\d/.test(nextCharBefore) && /\d/.test(nextCharAfter))) {
                return text.substring(0, firstCutIndex + 1 + nextEnDotIndex + 1);
              }
            }

            // 如果沒有找到句號，檢查逗號
            const nextCommaIndex = nextText.indexOf('，');
            const nextEnCommaIndex = nextText.indexOf(',');

            if (nextCommaIndex !== -1) {
              return text.substring(0, firstCutIndex + 1 + nextCommaIndex + 1);
            } else if (nextEnCommaIndex !== -1) {
              return text.substring(0, firstCutIndex + 1 + nextEnCommaIndex + 1);
            }

            // 如果都沒找到，使用所有下一個標點中最早的一個
            const nextPunctIndices = [nextDotIndex, nextCommaIndex, nextEnDotIndex, nextEnCommaIndex].filter(idx => idx !== -1);
            if (nextPunctIndices.length > 0) {
              const nextCutIndex = Math.min(...nextPunctIndices);
              return text.substring(0, firstCutIndex + 1 + nextCutIndex + 1);
            }
          } else {
            return text.substring(0, firstCutIndex + 1);
          }
        } else {
          return text.substring(0, firstCutIndex + 1);
        }
      }
    }

    // 優先使用中文句號作為截斷點
    const chineseDotIndex = text.substring(0, 35).indexOf('。');
    if (chineseDotIndex !== -1) {
      return text.substring(0, chineseDotIndex + 1);
    }

    // 其次使用英文句號（確保不是小數點）
    const englishDotIndex = text.substring(0, 35).indexOf('.');
    if (englishDotIndex !== -1 && englishDotIndex > 0) {
      const charBeforeDot = text.charAt(englishDotIndex - 1);
      const charAfterDot = englishDotIndex + 1 < text.length ? text.charAt(englishDotIndex + 1) : '';

      // 如果不是小數點，使用英文句號截斷
      if (!(/\d/.test(charBeforeDot) && /\d/.test(charAfterDot))) {
        return text.substring(0, englishDotIndex + 1);
      }
    }

    // 再使用中文逗號
    const chineseCommaIndex = text.substring(0, 35).indexOf('，');
    if (chineseCommaIndex !== -1) {
      return text.substring(0, chineseCommaIndex + 1);
    }

    // 最後使用英文逗號
    const englishCommaIndex = text.substring(0, 35).indexOf(',');
    if (englishCommaIndex !== -1) {
      return text.substring(0, englishCommaIndex + 1);
    }

    // 如果以上都沒找到，使用其他中文標點
    const otherChinesePunctuationRegex = /[；：！？]/;
    const otherChinesePunctuationMatch = text.substring(0, 35).match(otherChinesePunctuationRegex);
    if (otherChinesePunctuationMatch) {
      return text.substring(0, otherChinesePunctuationMatch.index + 1);
    }

    // 如果中文標點都沒有，嘗試使用其他英文標點
    const otherEnglishPunctuationRegex = /[;:!?]/;
    const otherEnglishPunctuationMatch = text.substring(0, 35).match(otherEnglishPunctuationRegex);
    if (otherEnglishPunctuationMatch) {
      return text.substring(0, otherEnglishPunctuationMatch.index + 1);
    }

    // 如果都沒有找到合適的標點符號，擷取前32個字元加省略號
    return text.substring(0, 32) + "...";
  }

  /**
   * 在TOC導航時，如果目標章節與當前視口距離較遠，顯示一個臨時的載入/導航效果。
   * @param {string} sectionName - 正在導航到的章節名稱。
   */
  function showTemporaryLoadingEffect(sectionName) {
    let effectDiv = document.getElementById('toc-loading-effect');
    const mainContainer = document.querySelector('.container');

    if (!effectDiv) {
      effectDiv = document.createElement('div');
      effectDiv.id = 'toc-loading-effect';
      // 使用CSS類而不是直接設定樣式
      effectDiv.className = 'loading-effect';
      document.body.appendChild(effectDiv);
    }

    if (mainContainer) {
      // 使用CSS類而不是直接設定樣式
      mainContainer.classList.add('content-blurred');
    }

    // 確保截斷顯示的章節名
    const truncatedSectionName = truncateText(sectionName);
    effectDiv.textContent = `正在前往: ${truncatedSectionName}`;

    // 使用CSS類管理可見性
    requestAnimationFrame(() => {
      effectDiv.classList.add('loading-effect-visible');
    });

    setTimeout(() => {
      effectDiv.classList.remove('loading-effect-visible');
      if (mainContainer) {
        mainContainer.classList.remove('content-blurred');
      }
    }, 1500); // 效果持續時間
  }

  /**
   * 切換TOC項的摺疊狀態
   * @param {HTMLElement} toggleBtn - 摺疊/展開按鈕元素
   * @param {HTMLElement} childrenContainer - 子項容器元素
   */
  function toggleTocItem(toggleBtn, childrenContainer) {
    const isCollapsed = toggleBtn.classList.contains('collapsed');

    if (isCollapsed) {
      // 展開
      toggleBtn.classList.remove('collapsed');
      childrenContainer.classList.remove('collapsed');

      // 設定高度以實現動畫效果
      const originalHeight = childrenContainer.scrollHeight;
      childrenContainer.style.height = '0';

      // 觸發迴流
      childrenContainer.offsetHeight;

      childrenContainer.style.height = originalHeight + 'px';

      // 延遲後移除固定高度，允許自動調整
      setTimeout(() => {
        childrenContainer.style.height = 'auto';
      }, 300);
    } else {
      // 摺疊
      toggleBtn.classList.add('collapsed');

      // 先設定當前高度，然後過渡到0
      childrenContainer.style.height = childrenContainer.scrollHeight + 'px';

      // 強制迴流
      childrenContainer.offsetHeight;

      childrenContainer.style.height = '0';
      childrenContainer.classList.add('collapsed');
    }
  }

  // 開啟/關閉懸浮窗
  tocBtn.onclick = function() {
    const isOpen = tocPopup.classList.contains('toc-popup-visible');
    if (isOpen) {
      // 使用CSS類管理狀態
      tocPopup.classList.remove('toc-popup-visible');
      tocPopup.classList.add('toc-popup-hiding');
      setTimeout(() => {
        tocPopup.classList.remove('toc-popup-hiding');
        tocPopup.classList.add('toc-popup-hidden');
      }, 200);
    } else {
      // 檢查當前顯示的Tab是否為分塊對比
      updateTocModeSelectorVisibility();
      renderTocList(); // 每次開啟時重新渲染，確保內容最新
      tocPopup.classList.remove('toc-popup-hidden', 'toc-popup-hiding');
      tocPopup.classList.add('toc-popup-visible');
    }
  };

  // 關閉懸浮窗按鈕
  tocCloseBtn.onclick = function() {
    tocPopup.classList.remove('toc-popup-visible');
    tocPopup.classList.add('toc-popup-hiding');
    setTimeout(() => {
      tocPopup.classList.remove('toc-popup-hiding');
      tocPopup.classList.add('toc-popup-hidden');
    }, 200);
  };

  /**
   * 更新TOC模式選擇器的可見性，僅在分塊對比模式下顯示
   */
  function updateTocModeSelectorVisibility() {
    // 獲取當前顯示的Tab內容
    const visibleTab = document.querySelector('.tab-btn.active');
    const currentTabId = visibleTab ? visibleTab.id : null;

    // 判斷當前是否在分塊對比模式
    const isChunkCompareMode = currentTabId === 'tab-chunk-compare';

    // 僅在分塊對比模式下顯示模式選擇器
    if (isChunkCompareMode) {
      tocModeSelector.style.display = 'flex';
    } else {
      tocModeSelector.style.display = 'none';
      // 如果不是分塊對比模式，強制使用both模式
      if (currentTocMode !== 'both') {
        currentTocMode = 'both';
        // 更新按鈕狀態
        tocModeSelector.querySelectorAll('.toc-mode-btn').forEach(b => {
          b.classList.remove('active');
        });
        tocModeSelector.querySelector('[data-mode="both"]').classList.add('active');
      }
    }
  }

  /**
   * 生成並渲染TOC目錄列表。
   * - 清空現有列表。
   * - 從 `.container` 中查詢所有 `h1`, `h2`, `h3`, `h4`, `h5`, `h6` 元素作為TOC條目。
   * - 為每個標題元素生成一個列表項，包含其文字和可選的英文翻譯（來自 `tocMap`）。
   * - 列表項鍊接到對應標題的ID，點選時平滑滾動到該標題，並根據距離觸發載入效果。
   * - 儲存標題DOM節點到 `tocNodes` 陣列。
   * - 新增：構建層級結構並支援摺疊/展開功能。
   * - 新增：智慧識別標題格式，根據標題格式自動調整層級。
   */
  function renderTocList() {
    tocList.innerHTML = '';
    tocNodes = []; // 每次渲染時清空並重新填充
    const container = document.querySelector('.container');
    if (!container) return;

    let potentialHeadings = [];
    // 1. 獲取標準的 Hx 標題和被轉換的長標題
    container.querySelectorAll('h1, h2:not(#fileName), h3, h4, h5, h6, p.converted-from-heading').forEach(h => {
      potentialHeadings.push(h);
    });

    // 2. 獲取可能是圖表標題的 P 標籤
    // 正規表示式：比對 "圖/表/Figure/Table" + 空格 + 數字/字母/./- + 單詞邊界 (確保是獨立編號)
    const captionRegex = /^(圖|表|Figure|Table)\s*[\d\w.-]+\b/i;
    container.querySelectorAll('p').forEach(p => {
      const text = p.textContent.trim();
      if (captionRegex.test(text)) {
        // 標記為圖表標題，以便後續處理和樣式化
        p.dataset.isCaptionToc = "true";
        // 同時設定一個標誌，表示是圖表標題
        p.dataset.isChartCaption = "true";
        potentialHeadings.push(p);
      }
    });

    // 3. 按文件順序對所有潛在標題進行排序
    potentialHeadings.sort((a, b) => {
      if (a === b) return 0;
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1; // a 在 b 之前
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;  // a 在 b 之後
      }
      return 0; // 通常不應發生，除非元素不在同一文件樹或存在包含關係
    });

    const headingElements = potentialHeadings;

    // 根據當前模式過濾標題
    let filteredHeadings = [];
    if (currentTocMode === 'both') {
      filteredHeadings = headingElements;
    } else {
      // 獲取當前顯示的Tab內容
      const visibleTab = document.querySelector('.tab-btn.active');
      const currentTabId = visibleTab ? visibleTab.id : null;

      // 判斷當前是否在分塊對比模式
      const isChunkCompareMode = currentTabId === 'tab-chunk-compare';

      if (isChunkCompareMode) {
        // 在分塊對比模式下，根據currentTocMode篩選標題
        if (currentTocMode === 'ocr') {
          // 篩選左側原文塊的標題
          filteredHeadings = Array.from(headingElements).filter(el => {
            const closestAlignBlock = el.closest('.align-block-ocr');
            return closestAlignBlock !== null;
          });
        } else if (currentTocMode === 'translation') {
          // 篩選右側譯文塊的標題
          filteredHeadings = Array.from(headingElements).filter(el => {
            const closestAlignBlock = el.closest('.align-block-trans');
            return closestAlignBlock !== null;
          });
        }
      } else {
        // 非分塊對比模式下，檢查當前顯示的是否是與所選模式比對的分頁
        if ((currentTabId === 'tab-ocr' && currentTocMode === 'ocr') ||
            (currentTabId === 'tab-translation' && currentTocMode === 'translation')) {
          filteredHeadings = headingElements;
        } else {
          // 如果當前分頁與所選模式不比對，顯示一個提示
          const li = document.createElement('li');
          li.className = 'toc-info';
          li.textContent = `請切換到${currentTocMode === 'ocr' ? '原文' : '譯文'}分頁檢視對應目錄`;
          tocList.appendChild(li);
          return;
        }
      }
    }

    // 建立一個層級結構物件
    const tocStructure = {
      root: true,
      children: []
    };

    // 儲存上一個處理過的TOC項，用於比較和合並
    let previousTocItem = null;
    let previousHeadingLevel = 0;
    let currentPath = [tocStructure]; // 當前路徑，從根開始

    // 結構化標題格式的正規表示式
    const chapterPattern = /^第[一二三四五六七八九十百千]+[章節篇部]/; // 比對"第一章"、"第二節"等
    const numericPattern = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/; // 比對"1"、"1.1"、"1.1.1"等
    const romanPattern = /^([IVX]+)(?:\.([IVX]+))?(?:\.([IVX]+))?/i; // 比對羅馬數字標題
    const letterPattern = /^([A-Za-z])(?:\.([A-Za-z]))?(?:\.([A-Za-z]))?/; // 比對字母標題如"A"、"A.1"

    // 新的正規表示式，增強比對能力
    const spacedNumericPattern = /^(\d+)\.?\s+(\d+(?:\.?\d+)*)\s+/; // 比對"3. 1.1 xxxx"和"4. 5 xxxx"格式

    // 新增：多種列表項比對模式
    const bulletListPattern = /^[•\*\-]\s+/; // 比對"• xxx"、"* xxx"、"- xxx"等無序列表
    const numberedListPattern = /^(\d+)(?:[\.、]|\s*[\(\（])\s*/; // 比對"1. xxx"、"2、xxx"、"3) xxx"、"4（xxx"等
    const chineseNumberedListPattern = /^[一二三四五六七八九十]+[\.、]/; // 比對"一、xxx"等中文編號
    const alphaListPattern = /^[(（]?([a-zA-Z])[\)）\.、]\s*/; // 比對"(a) xxx"、"(A) xxx"、"a. xxx"、"A、xxx"等
    const specialSymbolListPattern = /^[(（]?[\*\#\+\-][\)）]\s*/; // 比對"(*) xxx"、"(#) xxx"等特殊符號列表

    // 論文特殊章節標題模式
    const specialSectionPattern = /^(摘要|Abstract|引言|Introduction|參考文獻|References|附錄|Appendix|致謝|Acknowledgements|結論|Conclusion|討論|Discussion|實驗|Experiment|方法|Methods|材料|Materials)/i;

    // 智慧層級管理物件
    let levelManager = {
      // 結構化字首到層級的對映
      prefixMapping: {},
      // 當前處理到的章節編號
      currentChapter: null,
      currentSection: null,
      currentSubsection: null,

      // 新增屬性，用於跟蹤更復雜的上下文
      lastStructureType: null, // 上一個結構化標題的型別
      lastStructureLevel: 0,   // 上一個結構化標題的層級
      lastNumericPrefix: null, // 上一個數字字首，如"1.5"
      lastSimpleNumber: null,  // 上一個簡單數字，如"2."中的"2"
      inSimpleList: false,     // 是否在簡單數字列表中（如"1. 2. 3."）
      simpleListParentLevel: 0, // 簡單數字列表的父級層級

      // 分析標題文字，提取結構化資訊
      analyzeHeading: function(text) {
        let structureInfo = {
          type: 'normal', // 預設為普通標題
          level: null,    // 結構化層級
          prefix: '',     // 標題字首
          content: text,  // 標題內容
          isSimpleNumbered: false // 是否是簡單數字編號（如"1. 2. 3."）
        };

        // 檢查是否為論文特殊章節標題
        const specialSectionMatch = text.match(specialSectionPattern);
        if (specialSectionMatch) {
          this.lastStructureType = 'special';
          this.lastStructureLevel = 1;
          this.inSimpleList = false;

          structureInfo.type = 'special';
          structureInfo.level = 1; // 特殊章節通常是頂級
          structureInfo.prefix = specialSectionMatch[0];
          structureInfo.content = text;
          return structureInfo;
        }

        // 檢查是否為章節標題（如"第一章"）
        const chapterMatch = text.match(chapterPattern);
        if (chapterMatch) {
          this.lastStructureType = 'chapter';
          this.lastStructureLevel = 1;
          this.inSimpleList = false;

          structureInfo.type = 'chapter';
          structureInfo.level = 1; // 章節一般是頂級
          structureInfo.prefix = chapterMatch[0];
          structureInfo.content = text.substring(chapterMatch[0].length).trim();
          return structureInfo;
        }

        // 檢查是否為帶空格的多級編號格式（如"3. 1.1 xxxx"或"4. 5 xxxx"）
        const spacedNumericMatch = text.match(spacedNumericPattern);
        if (spacedNumericMatch) {
          // 提取主要數字部分
          const mainNumber = spacedNumericMatch[1];
          const subNumbers = spacedNumericMatch[2];

          // 檢查子編號是否已經包含點號，如果沒有，需要新增
          let formattedSubNumbers = subNumbers;
          if (!subNumbers.includes('.')) {
            formattedSubNumbers = subNumbers; // 如"4. 5 xxxx"中的"5"
          }

          // 組合成標準格式，確保格式正確
          const combinedNumber = mainNumber + "." + formattedSubNumbers.replace(/\s+/g, '');

          // 計算層級（根據點的數量+1）
          const dots = (combinedNumber.match(/\./g) || []).length;

          // 檢查是否可能是章節的子節
          let isSubSection = false;
          if (this.lastStructureType === 'chapter' && this.currentChapter === mainNumber) {
            isSubSection = true;
          }

          // 設定適當的層級
          let level = dots + 1;
          if (isSubSection) {
            // 如果是章節的子節，層級應該是章節層級+1
            level = this.lastStructureLevel + 1;
          }

          // 更新狀態
          this.lastStructureType = 'numeric';
          this.lastStructureLevel = level;
          this.lastNumericPrefix = combinedNumber;
          this.inSimpleList = false;

          structureInfo.type = 'numeric';
          structureInfo.level = level;
          structureInfo.prefix = spacedNumericMatch[0]; // 保留原始字首，包括空格
          structureInfo.originalPrefix = combinedNumber; // 儲存標準化的字首
          structureInfo.content = text.substring(spacedNumericMatch[0].length).trim();
          structureInfo.isSubSection = isSubSection; // 標記是否為章節的子節

          // 更新當前處理到的章節編號
          const numParts = combinedNumber.split('.');
          if (numParts.length > 0) this.currentChapter = numParts[0];
          if (numParts.length > 1) this.currentSection = numParts[1];
          if (numParts.length > 2) this.currentSubsection = numParts[2];

          return structureInfo;
        }

        // 新增：檢查各種列表項格式
        // 無序列表項
        const bulletMatch = text.match(bulletListPattern);
        if (bulletMatch) {
          // 無序列表通常是當前層級的子層級
          const parentLevel = this.lastStructureLevel || 1;

          this.inSimpleList = true;
          this.simpleListParentLevel = parentLevel;

          structureInfo.type = 'bullet-list';
          structureInfo.level = parentLevel + 1;
          structureInfo.prefix = bulletMatch[0];
          structureInfo.content = text.substring(bulletMatch[0].length).trim();
          structureInfo.isSimpleNumbered = true;
          return structureInfo;
        }

        // 檢查是否為各種數字編號列表項（如"1. "、"2、"、"3) "等）
        const numberedMatch = text.match(numberedListPattern);
        if (numberedMatch) {
          const number = numberedMatch[1];
          const parentLevel = this.lastStructureLevel || 1;

          // 判斷是否是簡單數字列表的開始或延續
          if (!this.inSimpleList) {
            // 如果前一個標題是結構化的，那麼這個簡單數字可能是其子項
            if (this.lastStructureType && this.lastStructureType !== 'bullet-list') {
              // 設定為簡單數字列表模式
              this.inSimpleList = true;
              this.simpleListParentLevel = parentLevel;
              this.lastSimpleNumber = number;

              // 層級為父級層級+1
              structureInfo.level = parentLevel + 1;
              structureInfo.type = 'simple-numbered';
              structureInfo.prefix = numberedMatch[0];
              structureInfo.content = text.substring(numberedMatch[0].length).trim();
              structureInfo.isSimpleNumbered = true;
              return structureInfo;
            }
          } else {
            // 已經在簡單數字列表中，繼續使用相同的層級
            this.lastSimpleNumber = number;

            structureInfo.level = this.simpleListParentLevel + 1;
            structureInfo.type = 'simple-numbered';
            structureInfo.prefix = numberedMatch[0];
            structureInfo.content = text.substring(numberedMatch[0].length).trim();
            structureInfo.isSimpleNumbered = true;
            return structureInfo;
          }
        }

        // 檢查中文數字編號列表項（如"一、"）
        const chineseNumberedMatch = text.match(chineseNumberedListPattern);
        if (chineseNumberedMatch) {
          const parentLevel = this.lastStructureLevel || 1;

          this.inSimpleList = true;
          this.simpleListParentLevel = parentLevel;

          structureInfo.type = 'chinese-numbered';
          structureInfo.level = parentLevel + 1;
          structureInfo.prefix = chineseNumberedMatch[0];
          structureInfo.content = text.substring(chineseNumberedMatch[0].length).trim();
          structureInfo.isSimpleNumbered = true;
          return structureInfo;
        }

        // 檢查字母編號列表項（如"(a) "、"A. "）
        const alphaMatch = text.match(alphaListPattern);
        if (alphaMatch) {
          const parentLevel = this.lastStructureLevel || 1;

          this.inSimpleList = true;
          this.simpleListParentLevel = parentLevel;

          structureInfo.type = 'alpha-list';
          structureInfo.level = parentLevel + 1;
          structureInfo.prefix = alphaMatch[0];
          structureInfo.content = text.substring(alphaMatch[0].length).trim();
          structureInfo.isSimpleNumbered = true;
          return structureInfo;
        }

        // 檢查特殊符號列表項（如"(*) "）
        const specialSymbolMatch = text.match(specialSymbolListPattern);
        if (specialSymbolMatch) {
          const parentLevel = this.lastStructureLevel || 1;

          this.inSimpleList = true;
          this.simpleListParentLevel = parentLevel;

          structureInfo.type = 'special-symbol-list';
          structureInfo.level = parentLevel + 1;
          structureInfo.prefix = specialSymbolMatch[0];
          structureInfo.content = text.substring(specialSymbolMatch[0].length).trim();
          structureInfo.isSimpleNumbered = true;
          return structureInfo;
        }

        // 檢查是否為簡單數字列表項（如"1. "、"2. "，不包含子編號）
        const simpleNumberMatch = text.match(/^(\d+)\.\s+/);
        if (simpleNumberMatch) {
          const number = simpleNumberMatch[1];

          // 判斷是否是簡單數字列表的開始或延續
          if (!this.inSimpleList) {
            // 如果前一個標題是結構化的（如"1.5"），那麼這個簡單數字可能是其子項
            if (this.lastStructureType === 'numeric' && this.lastNumericPrefix) {
              // 設定為簡單數字列表模式
              this.inSimpleList = true;
              this.simpleListParentLevel = this.lastStructureLevel;
              this.lastSimpleNumber = number;

              // 層級為父級層級+1
              structureInfo.level = this.simpleListParentLevel + 1;
              structureInfo.type = 'simple-numbered';
              structureInfo.prefix = simpleNumberMatch[0];
              structureInfo.content = text.substring(simpleNumberMatch[0].length).trim();
              structureInfo.isSimpleNumbered = true;
              return structureInfo;
            }
          } else {
            // 已經在簡單數字列表中，繼續使用相同的層級
            this.lastSimpleNumber = number;

            structureInfo.level = this.simpleListParentLevel + 1;
            structureInfo.type = 'simple-numbered';
            structureInfo.prefix = simpleNumberMatch[0];
            structureInfo.content = text.substring(simpleNumberMatch[0].length).trim();
            structureInfo.isSimpleNumbered = true;
            return structureInfo;
          }
        }

        // 檢查是否為數字編號標題（如"1.1"）
        const numericMatch = text.match(numericPattern);
        if (numericMatch) {
          // 計算層級（根據實際比對到的數字段數）
          let level = 0;
          for (let i = 1; i < numericMatch.length; i++) {
            if (numericMatch[i]) {
              level++;
            }
          }

          // 獲取當前編號的主部分（如"1.5"中的"1"）
          const mainNumber = numericMatch[1];

          // 如果之前在簡單數字列表中，但現在遇到了正式的結構化編號
          // 例如從"1. 2. 3."列表跳轉到"1.6"
          if (this.inSimpleList) {
            // 檢查當前編號是否是與父級編號相同的系列
            // 例如，如果父級是"1.5"，那麼當前"1.6"應該是同級的
            if (this.lastNumericPrefix && this.lastNumericPrefix.startsWith(mainNumber + '.')) {
              // 退出簡單數字列表模式
              this.inSimpleList = false;
            }
          }

          // 更新狀態
          this.lastStructureType = 'numeric';
          this.lastStructureLevel = level;
          this.lastNumericPrefix = numericMatch[0];

          structureInfo.type = 'numeric';
          structureInfo.level = level;
          structureInfo.prefix = numericMatch[0];
          structureInfo.content = text.substring(numericMatch[0].length).trim();

          // 更新當前處理到的章節編號
          if (level === 1) {
            this.currentChapter = numericMatch[1];
            this.currentSection = null;
            this.currentSubsection = null;
          } else if (level === 2) {
            this.currentSection = numericMatch[2];
            this.currentSubsection = null;
          } else if (level === 3) {
            this.currentSubsection = numericMatch[3];
          }

          return structureInfo;
        }

        // 檢查是否為羅馬數字標題
        const romanMatch = text.match(romanPattern);
        if (romanMatch) {
          // 類似處理邏輯...
          this.lastStructureType = 'roman';
          this.inSimpleList = false;

          let dots = 0;
          for (let i = 1; i < romanMatch.length; i++) {
            if (romanMatch[i]) dots++;
          }
          this.lastStructureLevel = dots + 1;

          structureInfo.type = 'roman';
          structureInfo.level = dots + 1;
          structureInfo.prefix = romanMatch[0];
          structureInfo.content = text.substring(romanMatch[0].length).trim();
          return structureInfo;
        }

        // 檢查是否為字母標題
        const letterMatch = text.match(letterPattern);
        if (letterMatch) {
          // 類似處理邏輯...
          this.lastStructureType = 'letter';
          this.inSimpleList = false;

          let dots = 0;
          for (let i = 1; i < letterMatch.length; i++) {
            if (letterMatch[i]) dots++;
          }
          this.lastStructureLevel = dots + 1;

          structureInfo.type = 'letter';
          structureInfo.level = dots + 1;
          structureInfo.prefix = letterMatch[0];
          structureInfo.content = text.substring(letterMatch[0].length).trim();
          return structureInfo;
        }

        // 無法識別結構，重置簡單列表狀態
        this.inSimpleList = false;

        // 無法識別結構，返回預設值
        return structureInfo;
      },

      // 根據標題文字和標籤確定層級
      determineLevel: function(text, tagName) {
        // 首先分析標題結構
        const structureInfo = this.analyzeHeading(text);

        // 如果能識別結構化層級，則使用識別的層級
        if (structureInfo.level !== null) {
          return {
            level: structureInfo.level,
            structureInfo: structureInfo
          };
        }

        // 無法識別結構，則根據標籤名確定層級
        let headingLevel = 0;
        if (tagName.match(/^h[1-6]$/)) {
          headingLevel = parseInt(tagName.substring(1));
        } else {
          headingLevel = 3; // 預設級別
        }

        return {
          level: headingLevel,
          structureInfo: structureInfo
        };
      }
    };

    filteredHeadings.forEach((nodeEl, idx) => {
      // 補丁1：強制給沒有 id 的標題分配唯一 id
      if (!nodeEl.id) nodeEl.id = 'toc-auto-' + idx;
      tocNodes.push(nodeEl); // 儲存DOM節點

      let zh = nodeEl.textContent.trim();

      // 過濾掉 "原文塊" 或 "譯文塊" 標題
      if (zh.includes('原文塊') || zh.includes('譯文塊')) {
        return;
      }

      // 應用智慧截斷
      let displayText = truncateText(zh);
      let en = tocMap[zh]; // 獲取英文翻譯

      // 檢查與前一個TOC項是否相似，如果相似則合併
      if (previousTocItem && areTextsSimilar(previousTocItem, zh)) {
        // 不建立新的TOC項，而是更新前一個的參考
        const lastItem = currentPath[currentPath.length - 1].children[currentPath[currentPath.length - 1].children.length - 1];
        if (lastItem) {
          lastItem.additionalTargetId = nodeEl.id;
        }
        return; // 跳過建立新的TOC項
      }

      // 記錄當前項以供下一次比較
      previousTocItem = zh;

      // 確定標題級別
      let headingLevel = 0;
      let nodeTagName = nodeEl.tagName.toLowerCase();
      let isChartCaption = nodeEl.dataset.isChartCaption === "true";

      if (nodeEl.classList.contains('converted-from-heading') && nodeEl.dataset.originalTag) {
        nodeTagName = nodeEl.dataset.originalTag; // 使用原始標籤名決定TOC層級
      }

      // 圖表標題處理邏輯
      if (nodeEl.dataset.isCaptionToc === "true") {
        // 圖表標題預設為其父章節的下一級，先使用預設值
        headingLevel = 4;
        isChartCaption = true;
      } else {
        // 使用結構化識別確定層級
        const { level, structureInfo } = levelManager.determineLevel(zh, nodeTagName);
        headingLevel = level;

        // 如果標題有結構化字首，儲存原始文字用於顯示
        if (structureInfo.prefix) {
          nodeEl.dataset.structuredPrefix = structureInfo.prefix;
          // 儲存結構資訊
          nodeEl.dataset.structureType = structureInfo.type;
        }
      }

      // 如果是圖表標題，應用特殊的截斷邏輯
      if (isChartCaption) {
        // 首先識別圖表標題的字首部分（如"圖5."）
        const titlePrefixMatch = zh.match(/^(圖|表)\s*\d+\.?\s*/);
        const titlePrefix = titlePrefixMatch ? titlePrefixMatch[0] : '';
        const contentStart = titlePrefix.length;

        // 在圖表標題內容部分查詢標點符號作為截斷點
        const dotIndex = zh.indexOf('。', contentStart);
        const commaIndex = zh.indexOf('，', contentStart);

        // 找到最近的中文標點
        let firstPunctIndex = -1;
        if (dotIndex !== -1 && commaIndex !== -1) {
          firstPunctIndex = Math.min(dotIndex, commaIndex);
        } else if (dotIndex !== -1) {
          firstPunctIndex = dotIndex;
        } else if (commaIndex !== -1) {
          firstPunctIndex = commaIndex;
        }

        if (firstPunctIndex !== -1) {
          // 找到了中文標點，在此處截斷
          displayText = zh.substring(0, firstPunctIndex + 1);
        } else {
          // 嘗試查詢英文標點
          const enDotIndex = zh.indexOf('.', contentStart);
          const enCommaIndex = zh.indexOf(',', contentStart);

          let firstEnPunctIndex = -1;
          if (enDotIndex !== -1 && enCommaIndex !== -1) {
            firstEnPunctIndex = Math.min(enDotIndex, enCommaIndex);
          } else if (enDotIndex !== -1) {
            firstEnPunctIndex = enDotIndex;
          } else if (enCommaIndex !== -1) {
            firstEnPunctIndex = enCommaIndex;
          }

          // 確保句號不是數字後的小數點（如：圖5.1中的點）
          if (firstEnPunctIndex === enDotIndex && firstEnPunctIndex !== -1) {
            let validDotIndex = firstEnPunctIndex;
            while (validDotIndex !== -1) {
              const charBeforeDot = zh.charAt(validDotIndex - 1);
              const charAfterDot = zh.charAt(validDotIndex + 1);

              // 如果句號前是數字，後也是數字，那麼這可能是小數點，繼續尋找下一個句號
              if (/\d/.test(charBeforeDot) && /\d/.test(charAfterDot)) {
                validDotIndex = zh.indexOf('.', validDotIndex + 1);
              } else {
                // 找到了有效的句號
                break;
              }
            }

            if (validDotIndex !== -1) {
              displayText = zh.substring(0, validDotIndex + 1);
            } else if (enCommaIndex !== -1) {
              // 如果沒有有效的句號但有逗號，使用逗號截斷
              displayText = zh.substring(0, enCommaIndex + 1);
            }
          } else if (firstEnPunctIndex !== -1) {
            displayText = zh.substring(0, firstEnPunctIndex + 1);
          }
        }

        // 圖表標題特殊處理：將其歸屬到當前層級的下一級
        // 計算其應該屬於的層級
        headingLevel = previousHeadingLevel + 1;
        // 限制最大層級，防止層級過深
        if (headingLevel > 6) headingLevel = 6;
      }

      // 新增：讀取真實的 data-block-index
      let realBlockIndex = nodeEl.dataset.blockIndex ? parseInt(nodeEl.dataset.blockIndex, 10) : null;

      // 根據標題級別調整當前路徑
      if (headingLevel > previousHeadingLevel) {
        // 進入更深層級
        // 確保有父節點
        if (currentPath[currentPath.length - 1].children.length === 0) {
          // 如果當前路徑的最後一個節點沒有子節點，新增一個佔位節點
          // 獲取當前檔名作為未命名章節的替代文字
          const fileNameElement = document.getElementById('fileName');
          const fileName = fileNameElement ? fileNameElement.textContent : '未命名章節';

          const placeholderItem = {
            id: 'placeholder-' + idx,
            text: fileName,
            level: previousHeadingLevel,
            children: []
          };
          currentPath[currentPath.length - 1].children.push(placeholderItem);
        }
        // 將最後一個子節點作為新的當前節點
        currentPath.push(currentPath[currentPath.length - 1].children[currentPath[currentPath.length - 1].children.length - 1]);
      } else if (headingLevel < previousHeadingLevel) {
        // 返回上層
        const levelsToGoUp = previousHeadingLevel - headingLevel;
        for (let i = 0; i < levelsToGoUp && currentPath.length > 1; i++) {
          currentPath.pop();
        }
      }

      // 建立新的TOC項
      const tocItem = {
        id: nodeEl.id,
        text: displayText,
        originalText: zh,
        translation: en,
        level: headingLevel,
        children: [],
        isChartCaption: isChartCaption,
        structuredPrefix: nodeEl.dataset.structuredPrefix || null,
        structureType: nodeEl.dataset.structureType || null,
        structureInfo: levelManager.analyzeHeading(zh),
        blockIndex: realBlockIndex // 新增，真實內容流 blockIndex
      };

      // 將TOC項新增到當前路徑的最後一個節點
      currentPath[currentPath.length - 1].children.push(tocItem);
      previousHeadingLevel = headingLevel;
    });

    // === 在原有 TOC 節點生成後，補充 blockIndex/startBlockIndex/endBlockIndex 欄位 ===
    function parseBlockIndexFromId(id) {
      if (!id) return null;
      let match = id.match(/block-(\d+)/);
      if (match) return parseInt(match[1], 10);
      match = id.match(/toc-anchor-(\d+)/);
      if (match) return parseInt(match[1], 10);
      match = id.match(/toc-auto-(\d+)/);
      if (match) return parseInt(match[1], 10);
      match = id.match(/auto-hx-(\d+)/); // 新增支援 auto-hx-數字
      if (match) return parseInt(match[1], 10);
      return null;
    }
    function supplementBlockIndexRecursive(nodes) {
      for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        node.blockIndex = parseBlockIndexFromId(node.id);
        node.startBlockIndex = node.blockIndex;
        if (i < nodes.length - 1) {
          node.endBlockIndex = nodes[i + 1].blockIndex !== null ? nodes[i + 1].blockIndex - 1 : null;
        } else {
          node.endBlockIndex = null;
        }
        if (node.children && node.children.length > 0) {
          supplementBlockIndexRecursive(node.children);
        }
        if (node.blockIndex == null && node.el && node.el.dataset && node.el.dataset.blockIndex) {
          node.blockIndex = parseInt(node.el.dataset.blockIndex, 10);
        }
      }
    }
    if (tocStructure && tocStructure.children && tocStructure.children.length > 0) {
      supplementBlockIndexRecursive(tocStructure.children);
    }

    // 遞迴構建TOC HTML
    function buildTocHtml(items, parentElement) {
      items.forEach(item => {
        // 跳過佔位符和空標題
        // 1. 空標題
        // 2. "未命名章節"佔位符
        // 3. placeholder- 開頭的ID（佔位符標識）
        // 4. undefined/null 文字
        if (!item.text ||
            item.text === '未命名章節' ||
            item.text === 'undefined' ||
            item.text === 'null' ||
            (item.id && item.id.indexOf('placeholder-') === 0)) {
          return;
        }

        const li = document.createElement('li');
        const hasChildren = item.children && item.children.length > 0;

        // 設定CSS類
        if (item.level) {
          // 只基於item屬性判斷
          if (item.isCaption || item.isChartCaption) {
            li.className = 'toc-caption';
          } else {
            li.className = `toc-h${item.level}`;
          }

          // 檢查是否為簡單數字列表項或帶空格的多級編號標題
          const isSimpleNumbered = item.structureInfo && item.structureInfo.isSimpleNumbered;
          const hasSpacedNumeric = item.structureInfo && item.structureInfo.originalPrefix;
          const structureType = item.structureInfo && item.structureInfo.type;

          // 如果有結構化字首、是簡單數字列表項或帶空格的多級編號，新增結構化樣式類
          if (item.structuredPrefix || isSimpleNumbered || hasSpacedNumeric ||
              (structureType && structureType !== 'normal')) {
            li.classList.add(`toc-structured`);

            // 對於簡單數字列表項，使用特殊樣式類
            if (isSimpleNumbered) {
              li.classList.add('toc-simple-numbered');
              li.classList.add(`toc-structure-simple-numbered`);
            }
            // 對於帶空格的多級編號，使用標準數字編號樣式
            else if (hasSpacedNumeric) {
              li.classList.add(`toc-structure-numeric`);
              li.classList.add('toc-spaced-numeric');
            }
            // 處理各種新增的列表項型別
            else if (structureType) {
              li.classList.add(`toc-structure-${structureType}`);
            }
            else {
              li.classList.add(`toc-structure-${item.structureType || 'normal'}`);
            }
          }
        }

        if (hasChildren) {
          li.classList.add('has-children');
        }

        // 構建連結HTML
        let linkHTML = '';

        if (hasChildren) {
          linkHTML += `<span class="toc-toggle">▼</span>`;
        }

        // 包裝文字內容在一個span中，以便更好地控制多行顯示
        linkHTML += `<span class="toc-text">`;

        // 如果有結構化字首、是簡單數字列表項或帶空格的多級編號，特殊顯示字首
        if (item.structuredPrefix || (item.structureInfo && item.structureInfo.prefix)) {
          // 對於帶空格的多級編號，優先使用標準化的字首
          let prefix = item.structuredPrefix || item.structureInfo.prefix;
          if (item.structureInfo && item.structureInfo.originalPrefix) {
            prefix = item.structureInfo.originalPrefix; // 使用標準化的格式，如"3.1.1"
          }
          linkHTML += `<span class="toc-prefix">${prefix}</span> `;
        }

        // 如果是圖表標題，新增特殊圖示
        if (item.isChartCaption) {
          // 根據圖表型別顯示不同圖示
          const isTable = item.originalText && item.originalText.trim().startsWith('表');
          const icon = isTable ? '📊' : '📈';
          linkHTML += `<span class="toc-chart-icon">${icon}</span> `;
        }

        // 顯示主要文字內容
        let displayText = item.text;

        // 如果有結構化字首，從顯示文字中移除
        if (item.structuredPrefix && displayText.indexOf(item.structuredPrefix) === 0) {
          displayText = displayText.replace(item.structuredPrefix, '').trim();
        }
        // 如果是簡單數字列表項，從顯示文字中移除字首
        else if (item.structureInfo && item.structureInfo.prefix &&
                 displayText.indexOf(item.structureInfo.prefix) === 0) {
          displayText = displayText.replace(item.structureInfo.prefix, '').trim();
        }

        // 將文字內容包裝在span中，確保正確顯示
        linkHTML += `<span class="toc-content">${displayText}</span>`;

        if (item.translation && item.translation !== item.originalText) {
          linkHTML += ` <span class="toc-en-translation">／ ${item.translation}</span>`;
        }

        linkHTML += `</span>`;

        const link = document.createElement('a');
        link.href = `#${item.id}`;
        link.innerHTML = linkHTML;
        if (item.originalText) {
          link.dataset.originalText = item.originalText;
        }

        if (item.additionalTargetId) {
          link.dataset.additionalTargetId = item.additionalTargetId;
        }

        // 新增點選事件
        link.onclick = function(e) {
        e.preventDefault();
          const targetElement = document.getElementById(item.id);
        if (targetElement) {
            const clickedNodeIndex = tocNodes.findIndex(n => n.id === item.id);
          let currentTopNodeIndex = 0;

          if (tocNodes.length > 0) {
            let minPositiveTop = Infinity;
            let foundPositive = false;
            for (let i = 0; i < tocNodes.length; i++) {
              const rect = tocNodes[i].getBoundingClientRect();
              if (rect.top >= 0 && rect.top < minPositiveTop) {
                minPositiveTop = rect.top;
                currentTopNodeIndex = i;
                foundPositive = true;
              }
            }
            if (!foundPositive) {
              let maxNegativeTop = -Infinity;
              let foundNegative = false;
              for (let i = 0; i < tocNodes.length; i++) {
                const rect = tocNodes[i].getBoundingClientRect();
                if (rect.top < 0 && rect.top > maxNegativeTop) {
                  maxNegativeTop = rect.top;
                  currentTopNodeIndex = i;
                  foundNegative = true;
                }
              }
              if (!foundNegative && tocNodes.length > 0) {
                 currentTopNodeIndex = 0;
              }
            }
          }

          const indexDifference = Math.abs(clickedNodeIndex - currentTopNodeIndex);

          if (indexDifference >= 6) {
            // 使用原始文字而非截斷後的文字顯示載入效果
              const originalText = this.dataset.originalText || item.originalText;
            showTemporaryLoadingEffect(originalText || "目標章節");
          }

            // 修復：在沉浸模式下使用自定義滾動邏輯，避免版面偏移
            if (window.ImmersiveLayout && window.ImmersiveLayout.isActive()) {
              // 沉浸模式下使用自定義滾動定位
              const scrollContainer = document.querySelector('#immersive-main-content-area .tab-content');
              if (scrollContainer && scrollContainer.style.overflowY === 'auto') {
                // 計算目標元素相對於滾動容器的位置
                const containerRect = scrollContainer.getBoundingClientRect();
                const targetRect = targetElement.getBoundingClientRect();
                const currentScrollTop = scrollContainer.scrollTop;
                
                // 計算目標位置（將元素置於容器中心）
                const targetScrollTop = currentScrollTop + targetRect.top - containerRect.top - (containerRect.height / 2) + (targetRect.height / 2);
                
                // 平滑滾動到目標位置
                scrollContainer.scrollTo({
                  top: Math.max(0, targetScrollTop),
                  behavior: 'smooth'
                });
              } else {
                // 備用方案：使用原生scrollIntoView
                targetElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                  inline: 'nearest'
                });
              }
            } else {
              // 普通模式下使用原生scrollIntoView
              targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
              });
            }

            // 新增臨時醒目提示效果
            targetElement.classList.add('toc-target-highlight');

            // 3秒後移除醒目提示效果
            setTimeout(() => {
              targetElement.classList.remove('toc-target-highlight');
            }, 3000);

          // 檢查是否有額外的目標節點
          const additionalTargetId = this.dataset.additionalTargetId;
          if (additionalTargetId) {
            const additionalTarget = document.getElementById(additionalTargetId);
            if (additionalTarget) {
                // 也為額外目標新增醒目提示效果
                additionalTarget.classList.add('toc-target-highlight');
              setTimeout(() => {
                  additionalTarget.classList.remove('toc-target-highlight');
                }, 3000);
            }
          }
        }
      };

        li.appendChild(link);

        // 如果有子項，建立子項容器
        if (hasChildren) {
          const childrenContainer = document.createElement('ul');
          childrenContainer.className = 'toc-children';
          buildTocHtml(item.children, childrenContainer);
          li.appendChild(childrenContainer);

          // 為摺疊按鈕新增點選事件，確保事件正確處理
          const toggleBtn = li.querySelector('.toc-toggle');
          if (toggleBtn) {
            // 移除現有的事件監聽器（如果有）
            toggleBtn.replaceWith(toggleBtn.cloneNode(true));

            // 重新獲取按鈕並新增事件
            const newToggleBtn = li.querySelector('.toc-toggle');
            newToggleBtn.addEventListener('click', function(e) {
              e.stopPropagation(); // 阻止事件冒泡
              e.preventDefault(); // 防止連結被點選

              // 獲取子項容器
              const childContainer = this.closest('li').querySelector('.toc-children');
              if (childContainer) {
                toggleTocItem(this, childContainer);
              }
            });
          }
        }

        parentElement.appendChild(li);
      });
    }

    // 構建TOC HTML
    buildTocHtml(tocStructure.children, tocList);

    window.getCurrentTocStructure = function() {
      return tocStructure;
    };

    // Expose getTocNodes to window
    window.getTocNodes = function() {
      return tocNodes;
    };
  }

  // 點選頁面其他地方關閉目錄 (可選，如果需要請取消註釋)
  /*
  document.addEventListener('click', function(event) {
    if (tocPopup.classList.contains('toc-popup-visible') &&
        !tocPopup.contains(event.target) &&
        !tocBtn.contains(event.target)) {
      tocPopup.classList.remove('toc-popup-visible');
      tocPopup.classList.add('toc-popup-hiding');
      setTimeout(() => {
        tocPopup.classList.remove('toc-popup-hiding');
        tocPopup.classList.add('toc-popup-hidden');
      }, 200);
    }
  });
  */
  window.refreshTocList = function() {
    updateTocModeSelectorVisibility();
    renderTocList();
  };

  // 初始化TOC介面
  updateTocModeSelectorVisibility();

  // 監聽分頁切換事件，當分頁切換時更新TOC模式選擇器可見性
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', updateTocModeSelectorVisibility);
  });

  // 展開/收起TOC的功能
  document.getElementById('toc-expand-btn').addEventListener('click', function() {
    const isExpanded = tocPopup.classList.contains('toc-expanded');
    const icon = this.querySelector('i');
    if (isExpanded) {
      tocPopup.classList.remove('toc-expanded');
      icon.classList.remove('fa-angles-left');
      icon.classList.add('fa-angles-right');
      this.title = '展開目錄';
    } else {
      tocPopup.classList.add('toc-expanded');
      icon.classList.remove('fa-angles-right');
      icon.classList.add('fa-angles-left');
      this.title = '收起目錄';
    }
  });

  // 全部展開功能
  document.getElementById('toc-expand-all').addEventListener('click', function() {
    const allToggleButtons = tocList.querySelectorAll('.toc-toggle.collapsed');
    allToggleButtons.forEach(btn => {
      const childrenContainer = btn.closest('li').querySelector('.toc-children');
      if (childrenContainer) {
        toggleTocItem(btn, childrenContainer);
      }
    });
  });

  // 全部摺疊功能
  document.getElementById('toc-collapse-all').addEventListener('click', function() {
    const allToggleButtons = tocList.querySelectorAll('.toc-toggle:not(.collapsed)');
    allToggleButtons.forEach(btn => {
      const childrenContainer = btn.closest('li').querySelector('.toc-children');
      if (childrenContainer) {
        toggleTocItem(btn, childrenContainer);
      }
    });
  });

  // 目前的結構中，TocFeature 是一個IIFE，它會立即執行。
  // 它將 refreshTocList 函式暴露到 window 物件。
  // 在 history_detail.html 中，showTab 函式會呼叫 window.refreshTocList()。
  // 因此，只要 toc_logic.js 在呼叫 showTab 的主腳本之前載入，這個設定就應該能工作。
})();