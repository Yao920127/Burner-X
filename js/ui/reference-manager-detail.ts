// js/ui/reference-manager-detail.js
// 參考文獻管理器 - 詳情頁專用版本

(function(global) {
    'use strict';

    let currentDocumentId = null;
    let currentReferences = [];
    let isFloatingPanelOpen = false;
    let citationLocations = {}; // 記錄每個文獻的參考位置 {refIndex: [citationElementIds]}
    let activeTooltipLinkElement = null; // 記錄當前啟用tooltip的連結元素
    let hideTooltipTimer = null; // 記錄隱藏tooltip的定時器

    /**
     * 初始化參考文獻管理器（詳情頁版本）
     */
    function initReferenceManagerForDetail() {
        // 獲取文件ID
        const urlParams = new URLSearchParams(window.location.search);
        currentDocumentId = urlParams.get('id');

        if (!currentDocumentId) {
            console.warn('[ReferenceManagerDetail] No document ID found');
            return;
        }

        // 綁定dock點選事件
        bindDockClickEvent();

        // 監聽內容渲染完成事件
        document.addEventListener('contentRendered', () => {
            loadAndDisplayReferences();
        });

        // 監聽子塊分割完成事件（如果存在）
        document.addEventListener('subBlocksSegmented', () => {
            console.log('[ReferenceManagerDetail] 子塊分割完成，重新標記參考');
            if (currentReferences.length > 0) {
                appendReferencesToContent(currentReferences);
            }
        });

        // 使用MutationObserver監聽DOM變化，自動重新標記參考
        setupDOMMutationObserver();

        // 建立懸浮面板
        createFloatingPanel();

        // 處理頁面重新整理：僅在內容已就緒或資料已可用時嘗試一次，
        // 否則等待 contentRendered 事件再處理，避免早期取不到內容
        setTimeout(() => {
            const hasData = !!(window.data && (window.data.ocr || window.data.translation || (Array.isArray(window.data.ocrChunks) && window.data.ocrChunks.length > 0)));
            if (window.contentReady || hasData) {
                loadAndDisplayReferences();
            } else {
                console.log('[ReferenceManagerDetail] 等待內容渲染完成後再嘗試提取參考文獻');
            }
        }, 200);

        console.log('[ReferenceManagerDetail] Initialized for document:', currentDocumentId);
    }

    /**
     * 綁定dock點選事件
     */
    function bindDockClickEvent() {
        const refStat = document.querySelector('[data-stat-type="reference"]');
        if (refStat) {
            refStat.addEventListener('click', (e) => {
                e.preventDefault();
                toggleFloatingPanel();
            });
            refStat.style.cursor = 'pointer';
        }
    }

    /**
     * 載入並顯示參考文獻
     */
    async function loadAndDisplayReferences() {
        // 從儲存載入
        const data = await global.ReferenceStorage?.loadReferences(currentDocumentId);

        if (data && data.references) {
            currentReferences = data.references;
            updateReferenceCount(currentReferences.length);
            appendReferencesToContent(currentReferences);
            addToTOC();
        } else {
            // 嘗試自動提取
            await autoExtractReferences();
        }
    }

    /**
     * 自動提取參考文獻
     */
    async function autoExtractReferences() {
        const markdown = await getCurrentMarkdownContent();
        if (!markdown) return;

        const section = global.ReferenceDetector?.detectReferenceSection(markdown);
        if (!section || section.entries.length === 0) {
            console.log('[ReferenceManagerDetail] No references detected');
            return;
        }

        console.log(`[ReferenceManagerDetail] Auto-detected ${section.entries.length} references`);

        // 顯示提取方式選擇對話方塊
        await showExtractionMethodDialog(section, markdown);
    }

    /**
     * 顯示提取方式選擇對話方塊
     */
    async function showExtractionMethodDialog(section, markdown) {
        const message = `檢測到 ${section.entries.length} 條文獻\n\n` +
                       `請選擇提取方式：\n` +
                       `1. 正規表示式（快速，適合標準格式）\n` +
                       `2. AI智慧提取（準確，適合任意格式）\n` +
                       `3. 混合模式（推薦，先正則再AI）\n\n` +
                       `請輸入數字 1、2 或 3（取消將不再提示）：`;

        const choice = prompt(message);

        // 使用者點選取消：儲存空陣列，避免反覆提示
        if (!choice) {
            console.log('[ReferenceManagerDetail] User cancelled extraction, saving empty state');
            if (global.ReferenceStorage) {
                await global.ReferenceStorage.saveReferences(currentDocumentId, [], {
                    extractionSkipped: true,
                    skippedAt: new Date().toISOString()
                });
                console.log('[ReferenceManagerDetail] Empty state saved successfully');
            }
            return;
        }

        switch (choice.trim()) {
            case '1':
                extractWithRegex(section, markdown);
                break;
            case '2':
                extractWithAI(section, markdown);
                break;
            case '3':
                extractWithHybrid(section, markdown);
                break;
            default:
                alert('無效的選擇，請重新開啟文件並輸入 1、2 或 3');
        }
    }

    /**
     * 使用正規表示式提取
     */
    function extractWithRegex(section, markdown) {
        const extracted = global.ReferenceExtractor?.batchExtract(section.entries) || section.entries;

        // 建立索引
        let indexed = extracted;
        if (global.ReferenceIndexer) {
            indexed = global.ReferenceIndexer.buildIndex(
                currentDocumentId,
                markdown,
                extracted
            );
        }

        // 儲存
        global.ReferenceStorage?.saveReferences(
            currentDocumentId,
            indexed,
            {
                extractedAt: new Date().toISOString(),
                method: 'regex'
            }
        );

        // 顯示
        currentReferences = indexed;
        updateReferenceCount(indexed.length);
        appendReferencesToContent(indexed);
        addToTOC();

        alert(`正則提取完成\n成功提取 ${indexed.length} 條文獻`);
    }

    /**
     * 使用AI提取
     */
    async function extractWithAI(section, markdown) {
        const simpleEntries = section.entries.map((e, idx) => ({
            index: idx,
            rawText: e.rawText || e,
            needsAIProcessing: true
        }));

        await processWithAI(simpleEntries, markdown);
    }

    /**
     * 使用混合模式提取
     */
    async function extractWithHybrid(section, markdown) {
        // 先用正則提取
        const extracted = global.ReferenceExtractor?.batchExtract(section.entries) || section.entries;

        // 找出需要AI處理的
        const needsAI = extracted.filter(e => e.needsAIProcessing);

        if (needsAI.length > 0) {
            const message = `正則提取: ${extracted.length - needsAI.length}/${extracted.length} 成功\n` +
                          `需要AI處理: ${needsAI.length} 條\n\n` +
                          `是否繼續使用AI處理剩餘文獻？`;

            if (confirm(message)) {
                await processWithAI(extracted, markdown);
            } else {
                // 只儲存正則提取的結果
                saveExtractedReferences(extracted, markdown);
            }
        } else {
            // 全部正則提取成功
            saveExtractedReferences(extracted, markdown);
            alert(`提取完成\n全部 ${extracted.length} 條文獻已透過正則成功提取`);
        }
    }

    /**
     * 在原文中標記參考（不插入參考文獻列表）
     */
    function appendReferencesToContent(references) {
        console.log('[appendReferencesToContent] 開始標記參考，references.length:', references.length);

        if (!references || references.length === 0) {
            console.warn('[appendReferencesToContent] 沒有參考文獻資料');
            return;
        }

        // 查詢內容容器（使用正確的ID）
        const containers = ['#ocr-content-wrapper', '#translation-content-wrapper'];

        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (!container) {
                console.log('[appendReferencesToContent] 容器不存在:', selector);
                return;
            }

            console.log('[appendReferencesToContent] 找到容器:', selector);

            // 清除之前的標記（避免重複標記）
            const existingCitations = container.querySelectorAll('.reference-citation');
            console.log('[appendReferencesToContent] 清除現有參考:', existingCitations.length);
            existingCitations.forEach(citation => {
                // 將連結替換回原始文字
                const text = document.createTextNode(citation.textContent);
                citation.parentNode.replaceChild(text, citation);
            });

            // 標記原文中的參考（如[1], [2]）
            markCitationsInContent(container, references.length);

            // 使用事件委託，在容器級別監聽參考連結的滑鼠事件
            setupCitationEventDelegation(container);

            console.log('[appendReferencesToContent] 已標記原文中的參考，不插入文獻列表');
        });

        // 更新懸浮面板內容
        updatePanelContent();
    }

    /**
     * 設定DOM變化監聽器，自動重新標記參考
     */
    function setupDOMMutationObserver() {
        const containers = ['#ocr-content-wrapper', '#translation-content-wrapper'];
        let remarkerTimer = null;

        containers.forEach(selector => {
            const container = document.querySelector(selector);
            if (!container) return;

            const observer = new MutationObserver((mutations) => {
                // 檢查是否有子塊被新增或修改
                let needRemark = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' || mutation.type === 'subtree') {
                        // 檢查是否有新增的子塊
                        if (mutation.addedNodes.length > 0) {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE &&
                                    (node.classList?.contains('sub-block') ||
                                     node.querySelector?.('.sub-block'))) {
                                    needRemark = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (needRemark) break;
                }

                if (needRemark && currentReferences.length > 0) {
                    // 防抖：延遲執行，避免頻繁重新標記
                    if (remarkerTimer) clearTimeout(remarkerTimer);
                    remarkerTimer = setTimeout(() => {
                        console.log('[MutationObserver] 檢測到DOM變化，重新標記參考');
                        appendReferencesToContent(currentReferences);
                    }, 500);
                }
            });

            observer.observe(container, {
                childList: true,
                subtree: true
            });

            console.log('[setupDOMMutationObserver] 已設定DOM監聽器:', selector);
        });
    }

    /**
     * 設定參考連結的事件委託
     */
    function setupCitationEventDelegation(container) {
        // 移除舊的事件監聽器（如果存在）
        if (container._citationEventSetup) {
            return; // 已經設定過了
        }
        container._citationEventSetup = true;

        // 使用事件委託監聽mouseenter
        container.addEventListener('mouseover', (e) => {
            const target = e.target;
            if (target.classList && target.classList.contains('reference-citation')) {
                // 獲取所有文獻編號
                const refNumbers = target.dataset.refNumbers;
                if (refNumbers) {
                    console.log('[delegation mouseenter] 觸發懸停事件，refNumbers:', refNumbers);
                    // 清除之前的隱藏定時器
                    if (hideTooltipTimer) {
                        clearTimeout(hideTooltipTimer);
                        hideTooltipTimer = null;
                    }
                    showReferenceDetailTooltip(target, refNumbers);
                }
            }
        });

        // 使用事件委託監聽mouseleave
        container.addEventListener('mouseout', (e) => {
            const target = e.target;
            if (target.classList && target.classList.contains('reference-citation')) {
                // 從 dataset 獲取參考編號
                const refNumbers = target.dataset.refNumbers;
                if (refNumbers) {
                    console.log('[delegation mouseleave] 觸發離開事件，refNumbers:', refNumbers, 'activeElement:', activeTooltipLinkElement === target);
                    // 延遲隱藏，給使用者時間移動到tooltip上
                    hideTooltipTimer = setTimeout(() => {
                        const tooltip = document.getElementById('reference-detail-tooltip');
                        const tooltipHover = tooltip ? tooltip.matches(':hover') : false;
                        const isActive = activeTooltipLinkElement === target;
                        console.log('[delegation mouseleave timer] refNumbers:', refNumbers, 'tooltip hover:', tooltipHover, 'is active:', isActive);
                        // 只有當滑鼠既不在tooltip上且當前連結不再是活躍連結時才隱藏
                        if (tooltip && !tooltipHover && !isActive) {
                            hideReferenceDetailTooltip();
                        }
                    }, 100);
                }
            }
        });

        // 監聽點選事件
        container.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList && target.classList.contains('reference-citation')) {
                e.preventDefault();
                const refIndex = parseInt(target.dataset.refIndex, 10);
                if (!isNaN(refIndex)) {
                    window.scrollToReferenceItem(refIndex);
                }
            }
        });

        console.log('[setupCitationEventDelegation] 已設定事件委託');
    }

    /**
     * 更新面板內容
     */
    function updatePanelContent() {
        const content = document.getElementById('reference-panel-content');
        if (!content) return;

        if (currentReferences.length === 0) {
            content.innerHTML = `
                <div class="ref-panel-placeholder">
                    <i class="fa fa-book fa-3x"></i>
                    <p>暫無文獻資料</p>
                    <button onclick="window.extractReferencesFromContent()">提取文獻</button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="ref-panel-list">
                    ${renderPanelList(currentReferences)}
                </div>
            `;
        }
    }

    /**
     * 渲染面板列表
     */
    function renderPanelList(references) {
        return references.map((ref, idx) => {
            const authors = ref.authors && ref.authors.length > 0
                ? (ref.authors.length > 2
                    ? `${ref.authors.slice(0, 2).join(', ')} 等`
                    : ref.authors.join(', '))
                : '作者未知';

            const citationCount = citationLocations[idx] ? citationLocations[idx].length : 0;

            return `
                <div class="ref-panel-item">
                    <div class="ref-panel-header">
                        <div class="ref-panel-number">[${idx + 1}]</div>
                        <div class="ref-panel-title">${ref.title || '未提取標題'}</div>
                    </div>
                    <div class="ref-panel-meta">
                        <div class="ref-panel-authors">${authors}</div>
                        ${ref.year ? `<span class="ref-panel-year">${ref.year}</span>` : ''}
                        ${ref.journal ? `<span class="ref-panel-journal">${ref.journal}</span>` : ''}
                    </div>
                    ${citationCount > 0 ? `
                        <div class="ref-panel-citations">
                            <i class="fa fa-quote-left"></i> 參考 ${citationCount} 次
                        </div>
                    ` : ''}
                    <div class="ref-panel-actions">
                        <button class="ref-panel-action-btn" onclick="window.scrollToCitationInText(${idx})" title="跳轉到原文">
                            <i class="fa fa-arrow-up"></i> 原文
                        </button>
                        <button class="ref-panel-action-btn" onclick="window.scrollToReferenceItem(${idx})" title="檢視詳情">
                            <i class="fa fa-eye"></i> 詳情
                        </button>
                        ${ref.doi ? `
                            <a href="https://doi.org/${ref.doi}" target="_blank" class="ref-panel-action-btn" title="開啟DOI">
                                <i class="fa fa-external-link"></i> DOI
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 滾動到文獻詳情（原References區域的具體文獻條目）
     */
    global.scrollToReferenceItem = function(index) {
        // 查詢原文中的References標題
        const containers = ['#ocr-content-wrapper', '#translation-content-wrapper'];

        for (const selector of containers) {
            const container = document.querySelector(selector);
            if (!container) continue;

            const referenceHeading = findReferenceHeading(container);
            if (referenceHeading) {
                // 先滾動到References標題
                referenceHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // 醒目提示整個References區域
                setTimeout(() => {
                    let currentElement = referenceHeading.nextElementSibling;
                    let highlightElements = [];

                    // 收集References區域的所有元素
                    while (currentElement) {
                        const isNextSection = currentElement.tagName && /^H[1-3]$/i.test(currentElement.tagName);
                        if (isNextSection) {
                            const headingText = currentElement.textContent.trim().toLowerCase();
                            const sectionKeywords = ['acknowledgment', 'appendix', 'supplementary', '致謝', '附錄'];
                            const isNewSection = sectionKeywords.some(keyword => headingText.includes(keyword));
                            if (isNewSection) break;
                        }
                        highlightElements.push(currentElement);
                        currentElement = currentElement.nextElementSibling;
                    }

                    // 新增醒目提示
                    highlightElements.forEach(el => {
                        el.style.backgroundColor = '#fff3cd';
                        el.style.transition = 'background-color 0.3s';
                    });

                    // 3秒後移除醒目提示
                    setTimeout(() => {
                        highlightElements.forEach(el => {
                            el.style.backgroundColor = '';
                        });
                    }, 3000);
                }, 500);

                console.log('[scrollToReferenceItem] 已跳轉到References區域並醒目提示文獻', index + 1);
                return;
            }
        }

        alert('未找到References區域');
    };

    /**
     * 查詢參考文獻標題元素
     */
    function findReferenceHeading(container) {
        if (!container) return null;

        // 參考文獻標題的常見關鍵詞
        const keywords = [
            'references', 'reference', 'bibliography', 'works cited',
            'literature cited', 'citations',
            '參考文獻', '參考文獻', '文獻參考', '參考資料'
        ];

        // 查詢所有標題元素
        const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

        for (const heading of headings) {
            const text = heading.textContent.trim().toLowerCase();

            // 檢查是否包含參考文獻關鍵詞
            for (const keyword of keywords) {
                if (text === keyword || text === keyword + 's') {
                    return heading;
                }
            }
        }

        return null;
    }

    /**
     * 在原文中標記參考並新增點選跳轉功能
     */
    function markCitationsInContent(container, refCount) {
        if (!container) return;

        // 重置參考位置記錄
        citationLocations = {};
        for (let i = 0; i < refCount; i++) {
            citationLocations[i] = [];
        }

        // 使用TreeWalker走訪文位元組點
        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 跳過參考文獻區域本身
                    if (node.parentElement.closest('.reference-section')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 跳過已經處理過的參考連結
                    if (node.parentElement.classList?.contains('reference-citation')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 跳過註解系統建立的醒目提示span
                    if (node.parentElement.classList?.contains('annotated-block') ||
                        node.parentElement.classList?.contains('annotated-sub-block') ||
                        node.parentElement.classList?.contains('partial-subblock-highlight')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 跳過公式
                    let p = node.parentElement;
                    while (p) {
                        if (p.classList && (p.classList.contains('katex') ||
                            p.classList.contains('katex-display') ||
                            p.classList.contains('katex-inline'))) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        p = p.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        // 正則比對參考標記：[1], [2,3], [1-5], [1~5] 等
        // 支援的分隔符：逗號(,)、短橫線(-)、en dash(–)、波浪號(~)
        const citationPattern = /\[(\d+(?:\s*[-–,~]\s*\d+)*)\]/g;

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const matches = [];
            let match;

            // 收集所有比對
            while ((match = citationPattern.exec(text)) !== null) {
                const numbers = parseReferenceNumbers(match[1]);
                // 只處理有效的參考（編號在範圍內）
                const validNumbers = numbers.filter(num => num > 0 && num <= refCount);
                if (validNumbers.length > 0) {
                    matches.push({
                        index: match.index,
                        length: match[0].length,
                        text: match[0],
                        numbers: validNumbers
                    });
                }
            }

            // 如果有比對，替換為連結
            if (matches.length > 0) {
                const parent = textNode.parentElement;
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;

                matches.forEach(m => {
                    // 新增前面的文字
                    if (m.index > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.index)));
                    }

                    // 為整個參考建立一個連結（不管它包含多少個文獻編號）
                    const firstRefNum = m.numbers[0];
                    const refIndex = firstRefNum - 1;
                    const occurrenceIndex = citationLocations[refIndex] ? citationLocations[refIndex].length : 0;
                    const citationId = `citation-source-${refIndex}-${occurrenceIndex}`;

                    // 建立參考連結
                    const link = document.createElement('a');
                    link.href = `#ref-${firstRefNum}`;
                    link.className = 'reference-citation';
                    link.id = citationId;
                    link.textContent = m.text;  // 顯示完整的參考文字，如 [1] 或 [1,2,3]
                    link.dataset.refIndex = refIndex;
                    // 儲存0-based索引（用於陣列訪問）
                    link.dataset.refNumbers = m.numbers.map(num => num - 1).join(',');

                    // 不在這裡綁定事件，而是使用事件委託
                    // 事件委託在setupCitationEventDelegation中設定

                    fragment.appendChild(link);
                    console.log('[markCitationsInContent] 建立連結:', citationId, '文字:', m.text, 'refIndex:', refIndex);

                    // 記錄所有參考的文獻的位置
                    m.numbers.forEach(num => {
                        const idx = num - 1;
                        if (!citationLocations[idx]) {
                            citationLocations[idx] = [];
                        }
                        citationLocations[idx].push(citationId);
                    });

                    lastIndex = m.index + m.length;
                });

                // 新增剩餘的文字
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }

                // 替換原文位元組點
                parent.replaceChild(fragment, textNode);
                console.log('[markCitationsInContent] 替換了', matches.length, '個參考連結');
            }
        });

        console.log('[markCitationsInContent] 已標記原文中的參考', citationLocations);

        // 驗證連結是否真的在DOM中
        setTimeout(() => {
            const allLinks = container.querySelectorAll('.reference-citation');
            console.log('[markCitationsInContent] DOM中的參考連結數量:', allLinks.length);
            if (allLinks.length > 0) {
                console.log('[markCitationsInContent] 第一個連結樣例:', allLinks[0], '文字:', allLinks[0].textContent);
                console.log('[markCitationsInContent] 第一個連結的計算樣式 color:', window.getComputedStyle(allLinks[0]).color);
                console.log('[markCitationsInContent] 第一個連結的計算樣式 cursor:', window.getComputedStyle(allLinks[0]).cursor);
            }
        }, 100);
    }

    /**
     * 解析參考編號字串
     */
    function parseReferenceNumbers(numbersStr) {
        const result = [];
        const parts = numbersStr.split(/\s*,\s*/);

        parts.forEach(part => {
            // 檢查是否是範圍（如 2-5, 2~5, 2–5）
            const rangeMatch = part.match(/(\d+)\s*[-–~]\s*(\d+)/);
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                for (let i = start; i <= end; i++) {
                    result.push(i);
                }
            } else {
                const num = parseInt(part);
                if (!isNaN(num)) {
                    result.push(num);
                }
            }
        });

        return result;
    }

    /**
     * 滾動到指定的文獻條目
     */
    function scrollToReferenceItem(index) {
        const refItem = document.querySelector(`[data-ref-id="ref-${index + 1}"]`);
        if (refItem) {
            refItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 新增醒目提示動畫
            refItem.classList.add('reference-item-highlight');
            setTimeout(() => {
                refItem.classList.remove('reference-item-highlight');
            }, 3000);

            console.log('[scrollToReferenceItem] 已定位到文獻:', index + 1);
        } else {
            console.warn('[scrollToReferenceItem] 未找到文獻:', index + 1);
        }
    }

    /**
     * 顯示參考詳細懸浮卡片（改進版，顯示更多資訊）
     * @param {HTMLElement} linkElement - 參考連結元素
     * @param {string} refNumbersStr - 文獻編號字串，如 "0,1,2" (0-based索引)
     */
    function showReferenceDetailTooltip(linkElement, refNumbersStr) {
        // 解析文獻編號
        const refIndices = refNumbersStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));

        console.log('[showReferenceDetailTooltip] 開始顯示tooltip，refIndices:', refIndices, 'currentReferences.length:', currentReferences.length);

        if (refIndices.length === 0) {
            console.warn('[showReferenceDetailTooltip] 沒有有效的文獻編號');
            return;
        }

        // 記錄當前啟用的連結
        activeTooltipLinkElement = linkElement;

        // 建立或獲取tooltip元素
        let tooltip = document.getElementById('reference-detail-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'reference-detail-tooltip';
            tooltip.className = 'reference-detail-tooltip';
            document.body.appendChild(tooltip);

            // 滑鼠移出tooltip時隱藏
            tooltip.addEventListener('mouseleave', () => {
                console.log('[tooltip mouseleave] 觸發');
                hideTooltipTimer = setTimeout(() => {
                    console.log('[tooltip mouseleave timer] 準備隱藏');
                    hideReferenceDetailTooltip();
                }, 100);
            });

            // 滑鼠進入tooltip時取消隱藏
            tooltip.addEventListener('mouseenter', () => {
                console.log('[tooltip mouseenter] 取消隱藏定時器');
                if (hideTooltipTimer) {
                    clearTimeout(hideTooltipTimer);
                    hideTooltipTimer = null;
                }
            });
        }

        // 構建多個文獻的詳細內容
        let contentHTML = '';

        if (refIndices.length === 1) {
            // 單個文獻，顯示完整資訊
            const refIndex = refIndices[0];
            const ref = currentReferences[refIndex];

            if (!ref) {
                console.warn('[showReferenceDetailTooltip] 未找到參考文獻資料，refIndex:', refIndex);
                return;
            }

            const authors = ref.authors && ref.authors.length > 0
                ? ref.authors.join(', ')
                : '作者未知';

            const citationCount = citationLocations[refIndex] ? citationLocations[refIndex].length : 0;

            contentHTML = `
                <div class="tooltip-detail-header">
                    <span class="tooltip-detail-number">[${refIndex + 1}]</span>
                    <button class="tooltip-detail-close" onclick="document.getElementById('reference-detail-tooltip').classList.remove('show')">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
                <div class="tooltip-detail-content">
                    ${ref.title ? `<h4 class="tooltip-detail-title">${ref.title}</h4>` : '<h4 class="tooltip-detail-title">未提取標題</h4>'}

                    <div class="tooltip-detail-authors">
                        <i class="fa fa-user"></i> ${authors}
                    </div>

                    <div class="tooltip-detail-meta">
                        ${ref.year ? `<span><i class="fa fa-calendar"></i> ${ref.year}</span>` : ''}
                        ${ref.journal ? `<span><i class="fa fa-book"></i> ${ref.journal}</span>` : ''}
                        ${ref.volume ? `<span>Vol. ${ref.volume}</span>` : ''}
                    </div>

                    ${ref.abstract ? `
                        <div class="tooltip-detail-abstract">
                            <strong>摘要：</strong>
                            <p>${ref.abstract}</p>
                        </div>
                    ` : ''}

                    ${ref.doi ? `
                        <div class="tooltip-detail-doi">
                            <strong>DOI:</strong>
                            <a href="https://doi.org/${ref.doi}" target="_blank">${ref.doi} <i class="fa fa-external-link"></i></a>
                        </div>
                    ` : ''}

                    ${citationCount > 0 ? `
                        <div class="tooltip-detail-citations">
                            <i class="fa fa-quote-left"></i> 本文參考 <strong>${citationCount}</strong> 次
                        </div>
                    ` : ''}
                </div>
                <div class="tooltip-detail-actions">
                    <button class="tooltip-action-btn" onclick="window.scrollToCitationInText(${refIndex}); document.getElementById('reference-detail-tooltip').classList.remove('show');">
                        <i class="fa fa-arrow-up"></i> 跳轉參考
                    </button>
                    <button class="tooltip-action-btn" onclick="window.scrollToReferenceItem(${refIndex}); document.getElementById('reference-detail-tooltip').classList.remove('show');">
                        <i class="fa fa-list"></i> 檢視詳情
                    </button>
                </div>
            `;
        } else {
            // 多個文獻，顯示簡化列表
            const refNumbersDisplay = refIndices.map(i => i + 1).join(', ');

            contentHTML = `
                <div class="tooltip-detail-header">
                    <span class="tooltip-detail-number">[${refNumbersDisplay}]</span>
                    <button class="tooltip-detail-close" onclick="document.getElementById('reference-detail-tooltip').classList.remove('show')">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
                <div class="tooltip-detail-content" style="padding: 12px 14px;">
                    <div style="margin-bottom: 8px; color: #64748b; font-size: 12px;">
                        <i class="fa fa-info-circle"></i> 共 ${refIndices.length} 篇文獻，點選展開檢視詳情
                    </div>
                    <div class="tooltip-multiple-refs">
                        ${refIndices.map(refIndex => {
                            const ref = currentReferences[refIndex];
                            if (!ref) return '';

                            const authors = ref.authors && ref.authors.length > 0
                                ? ref.authors.slice(0, 2).join(', ') + (ref.authors.length > 2 ? ' 等' : '')
                                : '作者未知';

                            const allAuthors = ref.authors && ref.authors.length > 0
                                ? ref.authors.join(', ')
                                : '作者未知';

                            const citationCount = citationLocations[refIndex] ? citationLocations[refIndex].length : 0;

                            return `
                                <div class="tooltip-ref-item" data-ref-index="${refIndex}">
                                    <div class="tooltip-ref-header" onclick="window.toggleReferenceDetail(${refIndex})">
                                        <div class="tooltip-ref-number">[${refIndex + 1}]</div>
                                        <div class="tooltip-ref-info">
                                            <div class="tooltip-ref-title">${ref.title || '未提取標題'}</div>
                                            <div class="tooltip-ref-authors">${authors}${ref.year ? ` · ${ref.year}` : ''}</div>
                                        </div>
                                        <i class="fa fa-chevron-down tooltip-ref-toggle"></i>
                                    </div>
                                    <div class="tooltip-ref-detail" style="display: none;">
                                        <div class="tooltip-ref-detail-section">
                                            <strong><i class="fa fa-user"></i> 作者：</strong>
                                            <span>${allAuthors}</span>
                                        </div>
                                        ${ref.year ? `
                                            <div class="tooltip-ref-detail-section">
                                                <strong><i class="fa fa-calendar"></i> 年份：</strong>
                                                <span>${ref.year}</span>
                                            </div>
                                        ` : ''}
                                        ${ref.journal ? `
                                            <div class="tooltip-ref-detail-section">
                                                <strong><i class="fa fa-book"></i> 期刊：</strong>
                                                <span>${ref.journal}${ref.volume ? ` Vol. ${ref.volume}` : ''}</span>
                                            </div>
                                        ` : ''}
                                        ${ref.abstract ? `
                                            <div class="tooltip-ref-detail-section">
                                                <strong><i class="fa fa-file-text-o"></i> 摘要：</strong>
                                                <p style="margin: 4px 0 0 0; line-height: 1.4; color: #475569;">${ref.abstract}</p>
                                            </div>
                                        ` : ''}
                                        ${ref.doi ? `
                                            <div class="tooltip-ref-detail-section">
                                                <strong><i class="fa fa-link"></i> DOI：</strong>
                                                <a href="https://doi.org/${ref.doi}" target="_blank" style="color: #3b82f6; text-decoration: none;">
                                                    ${ref.doi} <i class="fa fa-external-link" style="font-size: 10px;"></i>
                                                </a>
                                            </div>
                                        ` : ''}
                                        ${citationCount > 0 ? `
                                            <div class="tooltip-ref-detail-section">
                                                <strong><i class="fa fa-quote-left"></i> 參考：</strong>
                                                <span>本文參考 ${citationCount} 次</span>
                                            </div>
                                        ` : ''}
                                        <div class="tooltip-ref-detail-actions">
                                            <button onclick="window.scrollToCitationInText(${refIndex}); event.stopPropagation();" class="tooltip-ref-action-btn">
                                                <i class="fa fa-arrow-up"></i> 跳轉參考
                                            </button>
                                            <button onclick="window.scrollToReferenceItem(${refIndex}); document.getElementById('reference-detail-tooltip').classList.remove('show'); event.stopPropagation();" class="tooltip-ref-action-btn">
                                                <i class="fa fa-list"></i> 檢視原文
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        tooltip.innerHTML = contentHTML;

        // 先移除show類（重置狀態）
        const wasVisible = tooltip.classList.contains('show');
        tooltip.classList.remove('show');
        console.log('[showReferenceDetailTooltip] 重置show類，之前是否可見:', wasVisible);

        // 使用requestAnimationFrame確保版面完成後再定位
        requestAnimationFrame(() => {
            // 獲取連結和tooltip的位置資訊
            const linkRect = linkElement.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            // 預設顯示在連結右側
            let top = linkRect.top + window.scrollY;
            let left = linkRect.right + window.scrollX + 10;

            // 如果右側空間不足，顯示在左側
            if (left + tooltipRect.width > window.innerWidth - 20) {
                left = linkRect.left + window.scrollX - tooltipRect.width - 10;
            }

            // 如果左側也不夠，顯示在下方
            if (left < 20) {
                left = linkRect.left + window.scrollX;
                top = linkRect.bottom + window.scrollY + 10;
            }

            // 防止tooltip超出視口頂部
            if (top < window.scrollY + 20) {
                top = window.scrollY + 20;
            }

            // 防止tooltip超出視口底部
            if (top + tooltipRect.height > window.scrollY + window.innerHeight - 20) {
                top = window.scrollY + window.innerHeight - tooltipRect.height - 20;
            }

            // 設定位置
            tooltip.style.top = top + 'px';
            tooltip.style.left = left + 'px';

            // 下一幀新增show類，觸發過渡動畫
            requestAnimationFrame(() => {
                tooltip.classList.add('show');
            });

            console.log('[showReferenceDetailTooltip] 顯示詳細tooltip，文獻編號:', refIndices.map(i => i + 1).join(','));
        });
    }

    /**
     * 隱藏詳細懸浮卡片
     */
    function hideReferenceDetailTooltip() {
        const tooltip = document.getElementById('reference-detail-tooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
            activeTooltipLinkElement = null;
        }
        if (hideTooltipTimer) {
            clearTimeout(hideTooltipTimer);
            hideTooltipTimer = null;
        }
        console.log('[hideReferenceDetailTooltip] 隱藏tooltip');
    }

    /**
     * 切換文獻詳情的展開/收起狀態
     */
    global.toggleReferenceDetail = function(refIndex) {
        const item = document.querySelector(`.tooltip-ref-item[data-ref-index="${refIndex}"]`);
        if (!item) return;

        const detail = item.querySelector('.tooltip-ref-detail');
        const toggle = item.querySelector('.tooltip-ref-toggle');

        if (!detail || !toggle) return;

        if (detail.style.display === 'none') {
            // 展開
            detail.style.display = 'block';
            toggle.classList.add('expanded');
            item.classList.add('expanded');

            // 平滑滾動到該項
            setTimeout(() => {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } else {
            // 收起
            detail.style.display = 'none';
            toggle.classList.remove('expanded');
            item.classList.remove('expanded');
        }
    };

    /**
     * 顯示參考文獻詳細卡片（模態框）
     */
    function showReferenceDetailCard(refIndex) {
        if (!currentReferences[refIndex]) return;

        const ref = currentReferences[refIndex];

        // 先隱藏tooltip
        hideReferenceTooltip();

        // 建立或獲取模態框
        let modal = document.getElementById('reference-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reference-detail-modal';
            modal.className = 'reference-detail-modal';
            document.body.appendChild(modal);

            // 點選背景關閉
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }

        // 構建詳細內容
        const authors = ref.authors && ref.authors.length > 0
            ? ref.authors.join(', ')
            : '作者未知';

        const citationCount = citationLocations[refIndex] ? citationLocations[refIndex].length : 0;

        modal.innerHTML = `
            <div class="reference-detail-card">
                <div class="reference-detail-header">
                    <div class="reference-detail-number">[${refIndex + 1}]</div>
                    <button class="reference-detail-close" onclick="document.getElementById('reference-detail-modal').classList.remove('show')">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
                <div class="reference-detail-content">
                    ${ref.title ? `<h3 class="reference-detail-title">${ref.title}</h3>` : '<h3 class="reference-detail-title">未提取標題</h3>'}

                    <div class="reference-detail-meta">
                        <div class="reference-detail-authors">
                            <i class="fa fa-user"></i> ${authors}
                        </div>
                        ${ref.year ? `<div class="reference-detail-year"><i class="fa fa-calendar"></i> ${ref.year}</div>` : ''}
                        ${ref.journal ? `<div class="reference-detail-journal"><i class="fa fa-book"></i> ${ref.journal}</div>` : ''}
                    </div>

                    ${ref.volume || ref.issue || ref.pages ? `
                        <div class="reference-detail-publication">
                            ${ref.volume ? `<span>Vol. ${ref.volume}</span>` : ''}
                            ${ref.issue ? `<span>No. ${ref.issue}</span>` : ''}
                            ${ref.pages ? `<span>pp. ${ref.pages}</span>` : ''}
                        </div>
                    ` : ''}

                    ${ref.abstract ? `
                        <div class="reference-detail-abstract">
                            <h4><i class="fa fa-file-text"></i> 摘要</h4>
                            <p>${ref.abstract}</p>
                        </div>
                    ` : ''}

                    ${ref.doi ? `
                        <div class="reference-detail-doi">
                            <strong>DOI:</strong>
                            <a href="https://doi.org/${ref.doi}" target="_blank">${ref.doi} <i class="fa fa-external-link"></i></a>
                        </div>
                    ` : ''}

                    ${citationCount > 0 ? `
                        <div class="reference-detail-citations">
                            <i class="fa fa-quote-left"></i> 本文參考此文獻 <strong>${citationCount}</strong> 次
                        </div>
                    ` : ''}
                </div>
                <div class="reference-detail-actions">
                    <button class="ref-detail-btn" onclick="window.scrollToCitationInText(${refIndex})">
                        <i class="fa fa-arrow-up"></i> 跳轉到原文參考
                    </button>
                    <button class="ref-detail-btn" onclick="window.scrollToReferenceItem(${refIndex})">
                        <i class="fa fa-list"></i> 檢視References區域
                    </button>
                    ${ref.doi ? `
                        <a href="https://doi.org/${ref.doi}" target="_blank" class="ref-detail-btn ref-detail-btn-primary">
                            <i class="fa fa-external-link"></i> 開啟DOI連結
                        </a>
                    ` : ''}
                </div>
            </div>
        `;

        // 顯示模態框
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        console.log('[showReferenceDetailCard] 顯示詳細卡片:', refIndex + 1);
    }

    /**
     * 隱藏參考懸浮卡片
     */
    function hideReferenceTooltip() {
        const tooltip = document.getElementById('reference-citation-tooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    }

    /**
     * 跳轉到原文中的參考位置
     */
    function scrollToCitationInText(refIndex) {
        const citationIds = citationLocations[refIndex];
        if (!citationIds || citationIds.length === 0) {
            console.warn('[scrollToCitationInText] 未找到參考位置:', refIndex);
            alert('未找到該文獻在原文中的參考位置');
            return;
        }

        // 跳轉到第一個參考位置
        const firstCitationId = citationIds[0];
        const citationElement = document.getElementById(firstCitationId);

        if (citationElement) {
            citationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // 新增臨時醒目提示
            citationElement.style.backgroundColor = '#fff3cd';
            citationElement.style.padding = '2px 4px';
            citationElement.style.borderRadius = '3px';

            setTimeout(() => {
                citationElement.style.backgroundColor = '';
                citationElement.style.padding = '';
                citationElement.style.borderRadius = '';
            }, 2000);

            console.log('[scrollToCitationInText] 已跳轉到參考位置:', firstCitationId);
        } else {
            console.warn('[scrollToCitationInText] 未找到參考元素:', firstCitationId);
        }
    }

    // 暴露給全域，供HTML按鈕呼叫
    global.scrollToCitationInText = scrollToCitationInText;

    /**
     * 新增到TOC - 點選開啟懸浮面板
     */
    function addToTOC() {
        const tocList = document.getElementById('toc-list');
        if (!tocList) return;

        // 移除已存在的文獻連結
        const existing = tocList.querySelector('.toc-reference-link');
        if (existing) {
            existing.remove();
        }

        // 新增新連結（點選開啟懸浮面板）
        const li = document.createElement('li');
        li.className = 'toc-reference-link';
        li.innerHTML = `
            <a href="#" class="toc-ref-link" onclick="window.toggleReferencePanel(); return false;">
                <i class="fa fa-book"></i> 參考文獻 (${currentReferences.length})
            </a>
        `;
        tocList.appendChild(li);
    }

    /**
     * 更新文獻計數
     */
    function updateReferenceCount(count) {
        const countEl = document.getElementById('reference-count');
        if (countEl) {
            countEl.textContent = count;
        } else {
            // 如果元素還不存在，延遲重試
            console.warn('[ReferenceManagerDetail] reference-count element not found, retrying...');
            setTimeout(() => {
                const retryCountEl = document.getElementById('reference-count');
                if (retryCountEl) {
                    retryCountEl.textContent = count;
                }
            }, 500);
        }
    }

    /**
     * 建立懸浮面板（類似chatbot）
     */
    function createFloatingPanel() {
        const panel = document.createElement('div');
        panel.id = 'reference-floating-panel';
        panel.className = 'reference-floating-panel';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="reference-panel-header">
                <h3><i class="fa fa-book"></i> 參考文獻管理</h3>
                <div class="reference-panel-actions">
                    <button class="ref-panel-minimize" onclick="window.toggleReferencePanel()">
                        <i class="fa fa-minus"></i>
                    </button>
                    <button class="ref-panel-close" onclick="window.toggleReferencePanel()">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="reference-panel-toolbar">
                <button class="ref-toolbar-btn" onclick="window.extractReferencesFromContent()">
                    <i class="fa fa-sync"></i> 提取
                </button>
                <button class="ref-toolbar-btn" onclick="window.showFullReferenceManager()">
                    <i class="fa fa-th"></i> 完整管理
                </button>
                <button class="ref-toolbar-btn" onclick="window.exportReferences()">
                    <i class="fa fa-download"></i> 匯出
                </button>
            </div>
            <div class="reference-panel-content" id="reference-panel-content">
                <div class="ref-panel-placeholder">
                    <i class="fa fa-book fa-3x"></i>
                    <p>暫無文獻資料</p>
                    <button onclick="window.extractReferencesFromContent()">提取文獻</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // 使面板可拖拽
        makePanelDraggable(panel);
    }

    /**
     * 使面板可拖拽
     */
    function makePanelDraggable(panel) {
        const header = panel.querySelector('.reference-panel-header');
        let isDragging = false;
        let currentX, currentY, initialX, initialY;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;

            isDragging = true;

            // 在拖動開始前，將bottom定位轉換為top定位
            if (panel.style.bottom || getComputedStyle(panel).bottom !== 'auto') {
                const rect = panel.getBoundingClientRect();
                panel.style.top = rect.top + 'px';
                panel.style.left = rect.left + 'px';
                panel.style.bottom = 'auto';
                panel.style.right = 'auto';
            }

            initialX = e.clientX - panel.offsetLeft;
            initialY = e.clientY - panel.offsetTop;
            header.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // 限制面板在視口內
            const maxX = window.innerWidth - panel.offsetWidth;
            const maxY = window.innerHeight - panel.offsetHeight;

            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            panel.style.left = currentX + 'px';
            panel.style.top = currentY + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            header.style.cursor = 'grab';
        });
    }

    /**
     * 切換懸浮面板
     */
    function toggleFloatingPanel() {
        const panel = document.getElementById('reference-floating-panel');
        if (!panel) return;

        if (isFloatingPanelOpen) {
            panel.style.display = 'none';
            isFloatingPanelOpen = false;
        } else {
            panel.style.display = 'flex';
            isFloatingPanelOpen = true;

            // 開啟時重新載入資料（如果還沒有載入）
            if (currentReferences.length === 0) {
                const data = global.ReferenceStorage?.loadReferences(currentDocumentId);
                if (data && data.references) {
                    currentReferences = data.references;
                    console.log('[toggleFloatingPanel] 重新載入文獻資料:', currentReferences.length);
                }
            }

            updatePanelContent();
        }
    }

    /**
     * 更新面板內容
     */
    function updatePanelContent() {
        const content = document.getElementById('reference-panel-content');
        if (!content) return;

        if (currentReferences.length === 0) {
            content.innerHTML = `
                <div class="ref-panel-placeholder">
                    <i class="fa fa-book fa-3x"></i>
                    <p>暫無文獻資料</p>
                    <button onclick="window.extractReferencesFromContent()">提取文獻</button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="ref-panel-list">
                    ${renderPanelList(currentReferences)}
                </div>
            `;
        }
    }

    /**
     * 獲取當前Markdown內容
     */
    async function getCurrentMarkdownContent() {
        const active = window.globalCurrentContentIdentifier || window.currentVisibleTabId || 'ocr';

        // 優先：根據當前可見內容獲取（translation 優先使用譯文）
        if (window.data) {
            if (active === 'translation' && typeof window.data.translation === 'string' && window.data.translation.length > 0) {
                console.log('[ReferenceManagerDetail] 使用 window.data.translation，長度:', window.data.translation.length);
                return window.data.translation;
            }
            if (typeof window.data.ocr === 'string' && window.data.ocr.length > 0) {
                console.log('[ReferenceManagerDetail] 使用 window.data.ocr，長度:', window.data.ocr.length);
                return window.data.ocr;
            }
            // 備用：從分塊重建
            if (Array.isArray(window.data.ocrChunks) && window.data.ocrChunks.length > 0) {
                const joined = window.data.ocrChunks.filter(Boolean).join('\n\n');
                if (joined && joined.trim().length > 0) {
                    console.log('[ReferenceManagerDetail] 使用 window.data.ocrChunks 重建內容，塊數:', window.data.ocrChunks.length);
                    return joined;
                }
            }
        }

        // 方式：歷史資料（若存在）
        if (window.currentHistoryData && window.currentHistoryData.ocrResult) {
            console.log('[ReferenceManagerDetail] 使用 currentHistoryData.ocrResult');
            return window.currentHistoryData.ocrResult;
        }

        // 方式：從DOM中的文字內容獲取（依據當前標籤）
        const selector = active === 'translation'
            ? '#translation-content-wrapper'
            : '#tab-ocr-content, #ocr-content-wrapper';
        const contentEl = document.querySelector(selector) || document.querySelector('#tabContent .markdown-body');
        if (contentEl && contentEl.textContent && contentEl.textContent.trim()) {
            console.log('[ReferenceManagerDetail] 使用 DOM textContent, selector:', selector);
            return contentEl.textContent;
        }

        console.error('[ReferenceManagerDetail] 無法獲取文件內容，嘗試的方法:', {
            active,
            hasWindowData: !!window.data,
            hasOcr: !!(window.data && window.data.ocr),
            hasTranslation: !!(window.data && window.data.translation),
            hasOcrChunks: !!(window.data && Array.isArray(window.data.ocrChunks) && window.data.ocrChunks.length > 0),
            contentReady: !!window.contentReady,
            hasCurrentHistoryData: !!window.currentHistoryData,
            hasDOMContent: !!document.querySelector(selector) || !!document.querySelector('#tabContent .markdown-body')
        });
        return null;
    }

    /**
     * 全域函式：切換面板
     */
    global.toggleReferencePanel = function() {
        toggleFloatingPanel();
    };

    /**
     * 全域函式：提取文獻
     */
    global.extractReferencesFromContent = async function() {
        const markdown = await getCurrentMarkdownContent();
        if (!markdown) {
            alert('無法獲取文件內容');
            return;
        }

        const section = global.ReferenceDetector?.detectReferenceSection(markdown);
        if (!section) {
            alert('未檢測到參考文獻部分');
            return;
        }

        // 使用統一的提取方式選擇對話方塊
        await showExtractionMethodDialog(section, markdown);
    };

    /**
     * 儲存提取的文獻
     */
    function saveExtractedReferences(references, markdown) {
        // 建立索引
        let indexed = references;
        if (markdown && global.ReferenceIndexer) {
            indexed = global.ReferenceIndexer.buildIndex(
                currentDocumentId,
                markdown,
                references
            );
        }

        // 儲存
        global.ReferenceStorage?.saveReferences(
            currentDocumentId,
            indexed,
            {
                extractedAt: new Date().toISOString(),
                method: 'hybrid'
            }
        );

        // 顯示
        currentReferences = indexed;
        updateReferenceCount(indexed.length);
        appendReferencesToContent(indexed);
        addToTOC();
        updatePanelContent();
    }

    /**
     * 使用AI處理文獻
     */
    async function processWithAI(extracted, markdown) {
        // 獲取API配置（使用與Chatbot相同的方式）
        const apiConfig = await getAPIConfig();
        if (!apiConfig) {
            return;
        }

        console.log('[ReferenceManagerDetail] 開始AI批次處理，總數:', extracted.length);

        try {
            // 提取原始文字
            const rawTexts = extracted.map(e => e.rawText || (typeof e === 'string' ? e : ''));

            // 使用批次處理API
            const processed = await global.ReferenceAIProcessor.batchProcessReferences(
                rawTexts,
                apiConfig,
                'auto',
                (progress) => {
                    const percent = Math.round((progress.processed / progress.total) * 100);
                    console.log(`[AI處理] ${progress.processed}/${progress.total} (${percent}%) - 批次 ${progress.batchIndex + 1}/${progress.totalBatches}`);
                }
            );

            // 合併原始資訊
            const finalReferences = processed.map((ref, idx) => ({
                ...ref,
                index: idx,
                rawText: rawTexts[idx],
                extractedBy: 'ai',
                confidence: 0.9
            }));

            saveExtractedReferences(finalReferences, markdown);
            alert(`AI處理完成\n共提取 ${finalReferences.length} 條文獻`);
        } catch (error) {
            console.error('[ReferenceManagerDetail] AI處理失敗:', error);
            alert('AI處理失敗: ' + error.message + '\n\n請檢查模型配置和API Key');
        }
    }

    /**
     * 獲取API配置（使用與Chatbot相同的方式）
     */
    async function getAPIConfig() {
        // 使用Chatbot的配置獲取函式
        if (typeof window.MessageSender?.getChatbotConfig === 'function') {
            const config = window.MessageSender.getChatbotConfig();

            if (!config || !config.apiKey) {
                alert('請先配置AI模型和API Key\n\n提示：開啟Chatbot設定配置模型');
                return null;
            }

            console.log('[ReferenceManagerDetail] 獲取到配置:', {
                model: config.model,
                hasApiKey: !!config.apiKey,
                cms: config.cms
            });

            // 如果是自定義模型，使用Chatbot的buildCustomApiConfig
            if (config.model === 'custom' || config.model.startsWith('custom_source_')) {
                const endpoint = config.cms.apiEndpoint || config.cms.apiBaseUrl;

                if (!endpoint || !config.cms.modelId) {
                    alert('自定義模型配置不完整');
                    return null;
                }

                // 使用Chatbot的buildCustomApiConfig函式（保證一致性）
                if (typeof window.ApiConfigBuilder?.buildCustomApiConfig === 'function') {
                    const builtConfig = window.ApiConfigBuilder.buildCustomApiConfig(
                        config.apiKey,
                        endpoint,
                        config.cms.modelId || config.cms.preferredModelId,
                        config.cms.requestFormat,
                        parseFloat(config.cms.temperature) || 0.1,
                        parseInt(config.cms.max_tokens) || 4000,
                        {
                            endpointMode: config.cms.endpointMode || 'auto'
                        }
                    );

                    console.log('[ReferenceManagerDetail] 使用buildCustomApiConfig構建的配置:', builtConfig);
                    return builtConfig;
                }

                console.error('[ReferenceManagerDetail] buildCustomApiConfig函式不可用');
                return null;
            }

            // 預設模型
            return global.ReferenceAIProcessor.buildAPIConfig(config.model, config.apiKey);
        }

        alert('無法獲取AI配置，請確保Chatbot模組已載入');
        return null;
    }

    /**
     * 全域函式：編輯文獻
     */
    global.editReference = function(index) {
        // 開啟完整管理器並定位到該文獻
        if (global.ReferenceManagerUI) {
            global.ReferenceManagerUI.show(currentDocumentId);
            // TODO: 定位到特定文獻
        }
    };

    /**
     * 全域函式：顯示完整管理器
     */
    global.showFullReferenceManager = function() {
        if (global.ReferenceManagerUI) {
            global.ReferenceManagerUI.show(currentDocumentId);
        }
    };

    /**
     * 全域函式：匯出文獻
     */
    global.exportReferences = function() {
        const format = prompt('選擇匯出格式:\n1. BibTeX\n2. JSON\n3. CSV\n\n請輸入數字:');

        if (!format) return;

        let content = '';
        let filename = '';

        switch (format) {
            case '1':
                content = global.ReferenceStorage?.exportToBibTeX(currentDocumentId) || '';
                filename = 'references.bib';
                break;
            case '2':
                content = global.ReferenceStorage?.exportToJSON(currentDocumentId) || '';
                filename = 'references.json';
                break;
            case '3':
                content = exportToCSV();
                filename = 'references.csv';
                break;
            default:
                alert('無效的選擇');
                return;
        }

        if (content) {
            downloadFile(content, filename);
        }
    };

    /**
     * 匯出為CSV
     */
    function exportToCSV() {
        const headers = ['Index', 'Authors', 'Title', 'Year', 'Journal', 'DOI'];
        const rows = currentReferences.map((ref, idx) => [
            idx + 1,
            (ref.authors || []).join('; '),
            ref.title || '',
            ref.year || '',
            ref.journal || '',
            ref.doi || (ref.doiFallback ? '(未找到)' : '')
        ]);

        const csv = [headers, ...rows].map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        return csv;
    }

    /**
     * 下載檔案
     */
    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 頁面載入完成後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReferenceManagerForDetail);
    } else {
        initReferenceManagerForDetail();
    }

    console.log('[ReferenceManagerDetail] Module loaded. v1.0.1 - Fixed refIndex error');

})(window);
