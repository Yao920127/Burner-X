/**
 * 分塊對比預覽效能最佳化器
 * 解決歷史詳情頁分塊對比的渲染效能問題
 */

class ChunkCompareOptimizer {
    constructor() {
        this.renderCache = new Map();
        this.visibleChunks = new Set();
        this.currentScrollPosition = 0;
        this.observer = null;
        this.renderQueue = [];
        this.isRendering = false;
        this.batchSize = 3; // 每批渲染的分塊數量
        this.chunkHeight = 300; // 估算的分塊高度
        this.bufferSize = 2; // 緩衝區大小（上下各2個分塊）
    }

    /**
     * 初始化最佳化器
     */
    init() {
        this.setupIntersectionObserver();
        this.setupPerformanceMonitor();
    }

    /**
     * 最佳化分塊對比的渲染效能
     * @param {Array} ocrChunks OCR分塊資料
     * @param {Array} translatedChunks 翻譯分塊資料
     * @param {Object} options 渲染選項
     * @returns {string} 最佳化後的HTML
     */
    optimizeChunkComparison(ocrChunks, translatedChunks, options = {}) {
        const startTime = performance.now();
        const chunkCount = ocrChunks.length;
        console.log(`[ChunkOptimizer] 開始最佳化渲染 ${chunkCount} 個分塊`);

        // 建立帶骨架屏的容器
        const containerHTML = this.createSkeletonContainer(chunkCount);
        
        // 非同步開始渲染
        setTimeout(() => {
            this.scheduleProgressiveRender(ocrChunks, translatedChunks, options);
        }, 100);
        
        const endTime = performance.now();
        console.log(`[ChunkOptimizer] 初始化完成，耗時: ${(endTime - startTime).toFixed(2)}ms`);
        
        return containerHTML;
    }

    /**
     * 建立帶骨架屏的容器
     * @param {number} chunkCount 分塊數量
     * @returns {string} 容器HTML
     */
    createSkeletonContainer(chunkCount) {
        return `
            <div class="chunk-compare-container" id="chunk-compare-container">
                <!-- 分塊將在這裡渲染 -->
            </div>
        `;
    }

    /**
     * 生成骨架屏分塊
     * @param {number} count 骨架數量
     * @returns {string} 骨架HTML
     */
    generateSkeletonChunks(count) {
        let skeletonHTML = '';
        for (let i = 0; i < count; i++) {
            skeletonHTML += `
                <div class="chunk-pair skeleton-chunk">
                    <div class="block-outer">
                        <div class="chunk-header">
                            <div class="skeleton-line skeleton-title"></div>
                            <div class="skeleton-stats">
                                <div class="skeleton-line skeleton-stat"></div>
                                <div class="skeleton-line skeleton-stat"></div>
                            </div>
                        </div>
                        <div class="chunk-preview-container">
                            <div class="chunk-preview-row">
                                <div class="chunk-preview">
                                    <div class="skeleton-line skeleton-label"></div>
                                    <div class="skeleton-content">
                                        <div class="skeleton-line"></div>
                                        <div class="skeleton-line"></div>
                                        <div class="skeleton-line skeleton-short"></div>
                                    </div>
                                </div>
                                <div class="chunk-preview">
                                    <div class="skeleton-line skeleton-label"></div>
                                    <div class="skeleton-content">
                                        <div class="skeleton-line"></div>
                                        <div class="skeleton-line"></div>
                                        <div class="skeleton-line skeleton-short"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="skeleton-button"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        return skeletonHTML;
    }

    /**
     * 為超大文件建立特殊容器
     * @param {number} chunkCount 分塊數量
     * @param {Array} ocrChunks OCR分塊
     * @param {Array} translatedChunks 翻譯分塊
     * @param {Object} options 選項
     * @returns {string} 容器HTML
     */
    createLargeDocumentContainer(chunkCount, ocrChunks, translatedChunks, options) {
        // 立即儲存資料到window物件供後續使用
        window.largeDocumentData = {
            ocrChunks,
            translatedChunks,
            options,
            currentPage: 0,
            pageSize: 10 // 每頁顯示10個分塊
        };

        const totalPages = Math.ceil(chunkCount / 10);
        
        return `
            <div class="chunk-compare-title-bar">
                <h3>分塊對比 <span class="chunk-count">(${chunkCount}塊)</span></h3>
                <div class="chunk-controls">
                    <button id="swap-chunks-btn" title="切換原文/譯文位置">⇆</button>
                    <button id="performance-toggle-btn" title="切換效能模式" class="performance-btn active">⚡</button>
                </div>
            </div>
            <div class="large-document-notice">
                <i class="fas fa-info-circle"></i>
                <span>檢測到大型文件，已啟用高效瀏覽模式。使用分頁瀏覽以獲得更好的效能。</span>
            </div>
            <div class="chunk-pagination">
                <button id="prev-page-btn" onclick="ChunkCompareOptimizer.instance.navigateToPage(-1)" disabled>
                    ← 上一頁
                </button>
                <span class="page-info">
                    第 <span id="current-page">1</span> 頁，共 ${totalPages} 頁
                </span>
                <button id="next-page-btn" onclick="ChunkCompareOptimizer.instance.navigateToPage(1)">
                    下一頁 →
                </button>
                <div class="page-jump">
                    跳轉到第 
                    <input type="number" id="page-input" min="1" max="${totalPages}" value="1" style="width: 60px;">
                    頁
                    <button onclick="ChunkCompareOptimizer.instance.jumpToPage()">跳轉</button>
                </div>
            </div>
            <div class="chunk-compare-container large-document-mode" id="chunk-compare-container">
                ${this.renderPageChunks(0, ocrChunks, translatedChunks, options)}
                <div class="chunk-loading-indicator" style="display: none;">
                    <div class="loading-spinner"></div>
                    <span>正在載入分塊...</span>
                </div>
            </div>
        `;
    }

    /**
     * 渲染指定頁的分塊
     * @param {number} pageIndex 頁索引
     * @param {Array} ocrChunks OCR分塊
     * @param {Array} translatedChunks 翻譯分塊
     * @param {Object} options 選項
     * @returns {string} 分塊HTML
     */
    renderPageChunks(pageIndex, ocrChunks, translatedChunks, options) {
        const pageSize = 10;
        const startIndex = pageIndex * pageSize;
        const endIndex = Math.min(startIndex + pageSize, ocrChunks.length);
        
        let html = '';
        for (let i = startIndex; i < endIndex; i++) {
            const chunkElement = this.renderSingleChunkImmediate({
                index: i,
                ocrChunk: ocrChunks[i],
                translatedChunk: translatedChunks[i],
                options
            });
            html += chunkElement;
        }
        
        return html;
    }

    /**
     * 立即渲染單個分塊（用於分頁模式）
     * @param {Object} item 分塊資料
     * @returns {string} 分塊HTML
     */
    renderSingleChunkImmediate(item) {
        const { index, ocrChunk, translatedChunk, options } = item;
        return `
            <div class="chunk-pair" data-chunk-index="${index}" id="chunk-${index}">
                <div class="block-outer" data-block-index="${index}">
                    <div class="chunk-header">
                        <h4>第 ${index + 1} 塊</h4>
                        <div class="chunk-stats">
                            <span class="char-count">原文: ${ocrChunk.length}字</span>
                            <span class="char-count">譯文: ${translatedChunk.length}字</span>
                        </div>
                    </div>
                    <div class="chunk-loading" data-lazy-load="true">正在載入完整內容...</div>
                </div>
            </div>
        `;
    }

    /**
     * 導航到指定頁面
     * @param {number} direction 方向 (-1上一頁, 1下一頁)
     */
    navigateToPage(direction) {
        if (!window.largeDocumentData) return;
        
        const data = window.largeDocumentData;
        const totalPages = Math.ceil(data.ocrChunks.length / data.pageSize);
        const newPage = Math.max(0, Math.min(totalPages - 1, data.currentPage + direction));
        
        if (newPage === data.currentPage) return;
        
        this.loadPage(newPage);
    }

    /**
     * 跳轉到指定頁面
     */
    jumpToPage() {
        const pageInput = document.getElementById('page-input');
        if (!pageInput || !window.largeDocumentData) return;
        
        const targetPage = parseInt(pageInput.value) - 1; // 轉換為0基索引
        this.loadPage(targetPage);
    }

    /**
     * 載入指定頁面
     * @param {number} pageIndex 頁索引
     */
    loadPage(pageIndex) {
        if (!window.largeDocumentData) return;
        
        const data = window.largeDocumentData;
        const totalPages = Math.ceil(data.ocrChunks.length / data.pageSize);
        
        if (pageIndex < 0 || pageIndex >= totalPages) return;
        
        console.log(`[ChunkOptimizer] 載入第 ${pageIndex + 1} 頁`);
        
        // 顯示載入指示器
        const loadingIndicator = document.querySelector('.chunk-loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'flex';
        
        // 更新頁面內容
        setTimeout(() => {
            const container = document.getElementById('chunk-compare-container');
            if (container) {
                container.innerHTML = this.renderPageChunks(
                    pageIndex, 
                    data.ocrChunks, 
                    data.translatedChunks, 
                    data.options
                ) + `\n<div class=\"chunk-loading-indicator\" style=\"display: none;\">\n  <div class=\"loading-spinner\"></div>\n  <span>正在載入分塊...</span>\n</div>`;
                // 觀察新插入的分塊，進入視口即懶載入完整內容
                this.observeChunks(container);
            }
            
            // 更新頁面狀態
            data.currentPage = pageIndex;
            
            // 更新UI
            this.updatePageUI(pageIndex, totalPages);
            
            // 隱藏載入指示器
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            
            // 滾動到頂部
            const chunkContainer = document.getElementById('chunk-compare-container');
            if (chunkContainer) chunkContainer.scrollTop = 0;
            
        }, 100);
    }

    /**
     * 更新分頁UI
     * @param {number} currentPage 當前頁
     * @param {number} totalPages 總頁數
     */
    updatePageUI(currentPage, totalPages) {
        const currentPageSpan = document.getElementById('current-page');
        const pageInput = document.getElementById('page-input');
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        
        if (currentPageSpan) currentPageSpan.textContent = currentPage + 1;
        if (pageInput) pageInput.value = currentPage + 1;
        if (prevBtn) prevBtn.disabled = currentPage === 0;
        if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;
    }

    /**
     * 複製分塊內容
     * @param {number} chunkIndex 分塊索引
     */
    copyChunkContent(chunkIndex) {
        if (!window.largeDocumentData) return;
        
        const data = window.largeDocumentData;
        const ocrContent = data.ocrChunks[chunkIndex] || '';
        const transContent = data.translatedChunks[chunkIndex] || '';
        
        const contentToCopy = `第 ${chunkIndex + 1} 塊內容:\n\n原文:\n${ocrContent}\n\n譯文:\n${transContent}`;
        
        navigator.clipboard.writeText(contentToCopy)
            .then(() => {
                // 顯示覆製成功提示
                this.showTemporaryMessage(`第 ${chunkIndex + 1} 塊內容已複製到剪貼簿`);
            })
            .catch(err => {
                console.error('複製失敗:', err);
                this.showTemporaryMessage('複製失敗，請手動選擇複製', 'error');
            });
    }

    /**
     * 顯示臨時訊息
     * @param {string} message 訊息內容
     * @param {string} type 訊息型別
     */
    showTemporaryMessage(message, type = 'success') {
        const messageEl = document.createElement('div');
        messageEl.className = `temp-message temp-message-${type}`;
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 10000;
            font-size: 0.9em;
            opacity: 0;
            transform: translateY(-20px);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(messageEl);
        
        // 顯示動畫
        setTimeout(() => {
            messageEl.style.opacity = '1';
            messageEl.style.transform = 'translateY(0)';
        }, 10);
        
        // 3秒後移除
        setTimeout(() => {
            messageEl.style.opacity = '0';
            messageEl.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                if (messageEl.parentElement) {
                    messageEl.remove();
                }
            }, 300);
        }, 3000);
    }

    /**
     * 建立虛擬化容器
     * @param {number} totalChunks 總分塊數量
     * @returns {string} 容器HTML
     */
    createVirtualContainer(totalChunks) {
        // 對於大量分塊，不使用虛擬化高度佔位，避免巨大空白
        const useVirtualization = totalChunks > 20;
        const estimatedHeight = useVirtualization ? 0 : totalChunks * this.chunkHeight;
        
        return `
            <div class="chunk-compare-title-bar">
                <h3>分塊對比 <span class="chunk-count">(${totalChunks}塊)</span></h3>
                <div class="chunk-controls">
                    <button id="swap-chunks-btn" title="切換原文/譯文位置">⇆</button>
                    <button id="performance-toggle-btn" title="切換效能模式" class="performance-btn">⚡</button>
                </div>
            </div>
            <div class="chunk-compare-container" id="chunk-compare-container" style="position: relative;">
                <!-- 動態渲染的分塊將出現在這裡 -->
                <div class="chunk-loading-indicator" style="display: none;">
                    <div class="loading-spinner"></div>
                    <span>正在渲染分塊...</span>
                </div>
            </div>
        `;
    }

    /**
     * 計劃分批渲染
     * @param {Array} ocrChunks OCR分塊
     * @param {Array} translatedChunks 翻譯分塊
     * @param {Object} options 選項
     */
    scheduleProgressiveRender(ocrChunks, translatedChunks, options) {
        this.renderQueue = [];
        
        // 對於大量分塊，採用更保守的渲染策略
        const isLargeDocument = ocrChunks.length > 50;
        const initialRenderCount = isLargeDocument ? 
            Math.min(3, ocrChunks.length) : // 大文件只渲染前3塊
            Math.min(this.batchSize, ocrChunks.length);
        
        // 調整批次大小
        const dynamicBatchSize = isLargeDocument ? 2 : this.batchSize;
        
        for (let i = 0; i < ocrChunks.length; i++) {
            this.renderQueue.push({
                index: i,
                ocrChunk: ocrChunks[i],
                translatedChunk: translatedChunks[i],
                priority: i < initialRenderCount ? 'high' : 'normal',
                options
            });
        }

        // 更新批次大小
        this.currentBatchSize = dynamicBatchSize;

        // 開始渲染
        this.processRenderQueue();
    }

    /**
     * 處理渲染佇列
     */
    async processRenderQueue() {
        if (this.isRendering) return;
        this.isRendering = true;

        const container = document.getElementById('chunk-compare-container');
        
        if (!container) {
            this.isRendering = false;
            return;
        }

        // 按優先順序排序
        this.renderQueue.sort((a, b) => {
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (a.priority !== 'high' && b.priority === 'high') return 1;
            return a.index - b.index;
        });

        let rendered = 0;
        const total = this.renderQueue.length;

        while (this.renderQueue.length > 0) {
            const currentBatchSize = this.currentBatchSize || this.batchSize;
            const batch = this.renderQueue.splice(0, currentBatchSize);
            
            // 使用 requestIdleCallback 進行空閒時間渲染
            const anchor = container.querySelector('.chunk-loading-indicator');
            await this.renderBatchWithIdleTime(batch, container, anchor);
            
            rendered += batch.length;

            // 給瀏覽器時間處理其他任務，對大文件增加更多延遲
            const delay = total > 100 ? 32 : 16; // 大文件使用更長延遲
            await this.delay(delay);
        }

        this.isRendering = false;
        
        // 設定交叉觀察器
        this.observeChunks(container);
        
        console.log(`[ChunkOptimizer] 所有分塊渲染完成`);
    }

    /**
     * 在空閒時間渲染批次
     * @param {Array} batch 待渲染的批次
     * @param {Element} container 容器元素
     */
    renderBatchWithIdleTime(batch, container, anchor) {
        return new Promise((resolve) => {
            const renderBatch = (deadline) => {
                while (batch.length > 0 && deadline.timeRemaining() > 5) {
                    const item = batch.shift();
                    const chunkElement = this.renderSingleChunk(item);
                    if (chunkElement) {
                        if (anchor && anchor.parentNode === container) {
                            container.insertBefore(chunkElement, anchor);
                        } else {
                            container.appendChild(chunkElement);
                        }
                    }
                }
                
                if (batch.length > 0) {
                    // 還有未完成的渲染，繼續下一個空閒週期
                    if (window.requestIdleCallback) {
                        requestIdleCallback(renderBatch, { timeout: 100 });
                    } else {
                        setTimeout(() => renderBatch({ timeRemaining: () => 16 }), 16);
                    }
                } else {
                    resolve();
                }
            };

            if (window.requestIdleCallback) {
                requestIdleCallback(renderBatch, { timeout: 100 });
            } else {
                setTimeout(() => renderBatch({ timeRemaining: () => 16 }), 0);
            }
        });
    }

    /**
     * 渲染單個分塊
     * @param {Object} item 分塊資料
     * @returns {Element} 分塊DOM元素
     */
    renderSingleChunk(item) {
        const { index, ocrChunk, translatedChunk, options } = item;
        const cacheKey = `${index}_${ocrChunk.length}_${translatedChunk.length}`;
        
        // 檢查快取
        if (this.renderCache.has(cacheKey)) {
            const cachedElement = this.renderCache.get(cacheKey).cloneNode(true);
            this.updateChunkElement(cachedElement, index);
            return cachedElement;
        }

        const startTime = performance.now();
        
        // 建立分塊元素（僅使用 chunk-pair 作為容器，不新增多餘類）
        const chunkElement = document.createElement('div');
        chunkElement.className = 'chunk-pair';
        chunkElement.dataset.chunkIndex = index;
        chunkElement.id = `chunk-${index}`;
        
        // 延遲渲染複雜內容
        chunkElement.innerHTML = this.createChunkPlaceholder(index, ocrChunk, translatedChunk);
        
        // 快取元素
        this.renderCache.set(cacheKey, chunkElement.cloneNode(true));
        
        const endTime = performance.now();
        console.log(`[ChunkOptimizer] 分塊 ${index} 渲染完成，耗時: ${(endTime - startTime).toFixed(2)}ms`);
        
        return chunkElement;
    }

    /**
     * 更新從快取克隆出來的分塊元素的索引相關屬性
     * @param {Element} el - 分塊根元素（.chunk-pair）
     * @param {number} index - 目標分塊索引
     */
    updateChunkElement(el, index) {
        try {
            if (!el) return;
            // 根元素 id 與 dataset
            el.id = `chunk-${index}`;
            el.dataset.chunkIndex = index;
            // 內層 block-outer 的索引
            const outer = el.querySelector('.block-outer');
            if (outer) outer.setAttribute('data-block-index', String(index));
            // 懶載入容器保持即可；更新載入按鈕的 onclick（若存在）
            const loadBtn = el.querySelector('.load-full-content-btn');
            if (loadBtn) {
                loadBtn.setAttribute('onclick', `ChunkCompareOptimizer.instance.loadFullChunk(${index})`);
            }
            // 更新工具列上的 data-block 標記
            el.querySelectorAll('[data-block]').forEach(node => {
                node.setAttribute('data-block', String(index));
            });
        } catch (e) {
            console.warn('[ChunkOptimizer] updateChunkElement failed:', e);
        }
    }

    /**
     * 建立分塊佔位符
     * @param {number} index 分塊索引
     * @param {string} ocrChunk OCR內容
     * @param {string} translatedChunk 翻譯內容
     * @returns {string} 佔位符HTML
     */
    createChunkPlaceholder(index, ocrChunk, translatedChunk) {
        return `
            <div class="block-outer" data-block-index="${index}">
                <div class="chunk-header">
                    <h4>分塊 ${index + 1}</h4>
                    <div class="chunk-stats">
                        <span class="char-count">原文: ${ocrChunk.length}字</span>
                        <span class="char-count">譯文: ${translatedChunk.length}字</span>
                    </div>
                </div>
                <div class="chunk-loading" data-lazy-load="true">正在載入完整內容...</div>
            </div>
        `;
    }

    /**
     * 獲取內容預覽
     * @param {string} content 原始內容
     * @returns {string} 預覽內容
     */
    getContentPreview(content) {
        if (!content) return '(空內容)';
        
        // 移除Markdown語法和特殊字元，獲取純文字預覽
        const plainText = content
            .replace(/[#*`]/g, '') // 移除Markdown符號
            .replace(/\s+/g, ' ')  // 合併空白字元
            .trim();
            
        return plainText.length > 100 
            ? plainText.substring(0, 100) + '...' 
            : plainText;
    }

    /**
     * 載入完整分塊內容
     * @param {number} index 分塊索引
     */
    async loadFullChunk(index) {
        const chunkElement = document.querySelector(`.chunk-pair[data-chunk-index="${index}"]`);
        if (!chunkElement) return;

        const lazyContainer = chunkElement.querySelector('[data-lazy-load="true"]');
        if (!lazyContainer) return;

        // 顯示載入狀態
        lazyContainer.innerHTML = '<div class="chunk-loading">正在載入完整內容...</div>';

        try {
            // 獲取原始資料
            const ocrChunk = window.data?.ocrChunks?.[index] || '';
            const translatedChunk = window.data?.translatedChunks?.[index] || '';
            
            // 渲染完整內容
            const fullContent = await this.renderFullChunkContent(
                ocrChunk, 
                translatedChunk, 
                window.data?.images || [], 
                index, 
                window.data?.ocrChunks?.length || 0
            );

            // 用完整內容替換預覽容器，避免預覽樣式殘留在原文上方
            lazyContainer.outerHTML = fullContent;

            // 重新獲取 chunkElement（節點結構發生了變化，但根容器不變）
            const updatedChunkElement = document.querySelector(`.chunk-pair[data-chunk-index="${index}"]`) || chunkElement;

            // 綁定事件
            this.bindChunkEvents(updatedChunkElement);

            // 應用當前比例到新插入的 align-flex 容器
            try {
                const ratio = (typeof window.chunkCompareRatio === 'number' && isFinite(window.chunkCompareRatio)) ? window.chunkCompareRatio : 0.5;
                updatedChunkElement.querySelectorAll('.align-flex').forEach(flex => {
                    flex.style.setProperty('--ocr-ratio', (ratio * 100) + '%');
                    flex.style.setProperty('--trans-ratio', ((1 - ratio) * 100) + '%');
                });
            } catch (e) { /* ignore */ }

        } catch (error) {
            console.error(`載入分塊 ${index} 失敗:`, error);
            lazyContainer.innerHTML = '<div class="chunk-error">載入失敗，請重試</div>';
        }
    }

    /**
     * 渲染完整分塊內容
     * @param {string} ocrChunk OCR內容
     * @param {string} translatedChunk 翻譯內容
     * @param {Array} images 圖片資料
     * @param {number} blockIndex 分塊索引
     * @param {number} totalBlocks 總分塊數
     * @returns {string} 完整內容HTML
     */
    async renderFullChunkContent(ocrChunk, translatedChunk, images, blockIndex, totalBlocks) {
        // 使用原有的渲染邏輯，但進行效能最佳化
        const isOriginalFirstInChunkCompare = window.isOriginalFirstInChunkCompare !== false;
        
        // 使用 Web Worker 進行 Markdown 解析（如果可用）
        const ocrBlocks = await this.parseMarkdownAsync(ocrChunk);
        const transBlocks = await this.parseMarkdownAsync(translatedChunk);
        const aligned = this.alignBlocks(ocrBlocks, transBlocks);

        let showMode = window[`showMode_block_${blockIndex}`] || 'both';

        // 渲染工具列
        let html = `
            <div class="block-toolbar" data-block-toolbar="${blockIndex}">
                <div class="block-toolbar-left">
                    <span class="block-mode-btn ${showMode === 'both' ? 'active' : ''}" data-mode="both" data-block="${blockIndex}">對比</span>
                    <span class="block-mode-btn ${showMode === 'ocr' ? 'active' : ''}" data-mode="ocr" data-block="${blockIndex}">原文</span>
                    <span class="block-mode-btn ${showMode === 'trans' ? 'active' : ''}" data-mode="trans" data-block="${blockIndex}">譯文</span>
                    <button class="block-copy-btn" data-block="${blockIndex}" title="複製本塊內容">複製本塊</button>
                </div>
                <div class="block-toolbar-right">
                    ${blockIndex > 0 ? `<button class="block-nav-btn" data-dir="prev" data-block="${blockIndex}" title="上一段">↑</button>` : ''}
                    ${blockIndex < totalBlocks-1 ? `<button class="block-nav-btn" data-dir="next" data-block="${blockIndex}" title="下一段">↓</button>` : ''}
                </div>
            </div>
        `;

        // 批次渲染對齊的內容
        const alignedHTML = await this.renderAlignedContentAsync(aligned, images, blockIndex, isOriginalFirstInChunkCompare);
        html += alignedHTML;

        // 儲存原始內容供複製使用
        window[`blockRawContent_${blockIndex}`] = aligned;

        return html;
    }

    /**
     * 非同步解析Markdown
     * @param {string} markdown Markdown內容
     * @returns {Promise<Array>} 解析結果
     */
    parseMarkdownAsync(markdown) {
        return new Promise((resolve) => {
            // 簡化的Markdown解析，避免阻塞主執行緒
            const lines = (markdown || '').split(/\r?\n/);
            const blocks = [];
            let buffer = [];
            let inCode = false;
            let isFirstBlock = true;

            const parseChunk = (startIndex) => {
                const endIndex = Math.min(startIndex + 50, lines.length); // 每次處理50行
                
                for (let i = startIndex; i < endIndex; i++) {
                    const line = lines[i];
                    if (/^\s*```/.test(line)) {
                        inCode = !inCode;
                        buffer.push(line);
                        continue;
                    }
                    if (inCode) {
                        buffer.push(line);
                        continue;
                    }
                    if (/^\s*#/.test(line)) {
                        if (!isFirstBlock && buffer.length) {
                            blocks.push({ content: buffer.join('\n') });
                            buffer = [];
                        }
                        isFirstBlock = false;
                        buffer.push(line);
                        continue;
                    }
                    buffer.push(line);
                }

                if (endIndex < lines.length) {
                    // 繼續下一批
                    setTimeout(() => parseChunk(endIndex), 0);
                } else {
                    // 完成解析
                    if (buffer.length) {
                        blocks.push({ content: buffer.join('\n') });
                    }
                    resolve(blocks);
                }
            };

            parseChunk(0);
        });
    }

    /**
     * 非同步渲染對齊內容
     */
    async renderAlignedContentAsync(aligned, images, blockIndex, isOriginalFirstInChunkCompare) {
        const alignedHTML = [];
        const batchSize = 3; // 每批處理3個對齊塊

        for (let i = 0; i < aligned.length; i += batchSize) {
            const batch = aligned.slice(i, i + batchSize);
            const batchHTML = await this.renderAlignedBatch(batch, i, images, blockIndex, isOriginalFirstInChunkCompare);
            alignedHTML.push(...batchHTML);
            
            // 讓出控制權
            if (i + batchSize < aligned.length) {
                await this.delay(0);
            }
        }

        return alignedHTML.join('');
    }

    /**
     * 渲染對齊批次
     */
    async renderAlignedBatch(batch, startIndex, images, blockIndex, isOriginalFirstInChunkCompare) {
        return batch.map((alignedPair, batchIndex) => {
            const actualIndex = startIndex + batchIndex;
            const showMode = window[`showMode_block_${blockIndex}`] || 'both';
            
            return `
                <div class="align-flex block-flex block-flex-${blockIndex} ${showMode==='ocr'?'block-mode-ocr-only':showMode==='trans'?'block-mode-trans-only':'block-mode-both'}" data-block="${blockIndex}" data-align-index="${actualIndex}">
                    <div class="align-block align-block-ocr">
                        <div class="align-title">
                            <span>原文</span>
                            <button class="block-struct-copy-btn" data-block="${blockIndex}" data-type="ocr" data-idx="${actualIndex}" title="複製原文結構">複製</button>
                        </div>
                        <div class="align-content markdown-body">${this.renderContentSafely(alignedPair[0], images)}</div>
                    </div>
                    <div class="splitter" title="拖動調整比例"></div>
                    <div class="align-block align-block-trans">
                        <div class="align-title">
                            <span>譯文</span>
                            <button class="block-struct-copy-btn" data-block="${blockIndex}" data-type="trans" data-idx="${actualIndex}" title="複製譯文結構">複製</button>
                        </div>
                        <div class="align-content markdown-body">${this.renderContentSafely(alignedPair[1], images)}</div>
                    </div>
                </div>
            `;
        });
    }

    /**
     * 安全渲染內容
     */
    renderContentSafely(content, images) {
        try {
            if (!content || content.trim() === '') return '';
            
            // 使用簡化的渲染避免複雜的KaTeX解析
            if (window.MarkdownProcessor?.renderWithKatexFailback) {
                const safeContent = window.MarkdownProcessor.safeMarkdown(content, images);
                return window.MarkdownProcessor.renderWithKatexFailback(safeContent);
            } else {
                // 回退到簡單的文字渲染
                return content.replace(/\n/g, '<br>');
            }
        } catch (error) {
            console.warn('內容渲染失敗，使用簡單模式:', error);
            return content.replace(/\n/g, '<br>');
        }
    }

    /**
     * 對齊分塊
     */
    alignBlocks(blocks1, blocks2) {
        const maxLen = Math.max(blocks1.length, blocks2.length);
        const aligned = [];
        for (let i = 0; i < maxLen; i++) {
            aligned.push([
                blocks1[i] ? blocks1[i].content : '',
                blocks2[i] ? blocks2[i].content : ''
            ]);
        }
        return aligned;
    }

    /**
     * 綁定分塊事件
     */
    bindChunkEvents(chunkElement) {
        // 這裡可以新增特定的事件綁定邏輯
        // 例如模式切換、複製按鈕等
    }

    /**
     * 設定交叉觀察器進行懶載入
     */
    setupIntersectionObserver() {
        if (!window.IntersectionObserver) return;

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const chunkIndex = parseInt(entry.target.dataset.chunkIndex);
                    const lazyContainer = entry.target.querySelector('[data-lazy-load="true"]');
                    
                    if (lazyContainer) {
                        // 自動載入進入視口的分塊
                        this.loadFullChunk(chunkIndex);
                    }
                }
            });
        }, {
            rootMargin: '200px', // 提前200px開始載入
            threshold: 0.1
        });
    }

    /**
     * 觀察分塊元素
     */
    observeChunks(container) {
        if (!this.observer) return;

        const chunks = container.querySelectorAll('.chunk-pair');
        chunks.forEach(chunk => {
            this.observer.observe(chunk);
        });
    }

    /**
     * 設定效能監控
     */
    setupPerformanceMonitor() {
        // 監控記憶體使用
        if (performance.memory) {
            setInterval(() => {
                const memory = performance.memory;
                console.log(`[ChunkOptimizer] 記憶體使用: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
            }, 30000); // 每30秒檢查一次
        }
    }

    /**
     * 更新進度
     */
    updateProgress(rendered, total) {
        const progress = Math.round((rendered / total) * 100);
        console.log(`[ChunkOptimizer] 渲染進度: ${progress}% (${rendered}/${total})`);
        
        // 可以在這裡更新UI進度條
        const progressBar = document.querySelector('.chunk-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
    }

    /**
     * 延遲函式
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 清理資源
     */
    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.renderCache.clear();
        this.visibleChunks.clear();
    }
}

// 建立全域例項
ChunkCompareOptimizer.instance = new ChunkCompareOptimizer();

// 在頁面載入時初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ChunkCompareOptimizer.instance.init();
    });
} else {
    ChunkCompareOptimizer.instance.init();
}

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChunkCompareOptimizer;
} else {
    window.ChunkCompareOptimizer = ChunkCompareOptimizer;
}
