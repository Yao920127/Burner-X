/**
 * 分塊對比最佳化器整合腳本
 * 負責將最佳化器與現有的歷史詳情頁面整合
 */

(function() {
    'use strict';

    // 等待頁面和最佳化器載入完成
    function initializeChunkCompareOptimization() {
        // 避免重複初始化（多次 setTimeout 或腳本重複觸發）
        if (window.__chunkCompareIntegrationInitialized) {
            return;
        }
        if (!window.ChunkCompareOptimizer || !window.ChunkCompareOptimizer.instance) {
            console.warn('[ChunkIntegration] 最佳化器未載入，延遲初始化');
            setTimeout(initializeChunkCompareOptimization, 100);
            return;
        }

        console.log('[ChunkIntegration] 開始整合分塊對比最佳化器');

        // 標記已初始化，防止重複綁定事件
        window.__chunkCompareIntegrationInitialized = true;

        // 儲存原有的渲染函式參考（如需使用，可在後續擴充）
        const originalShowTab = window.showTab;

        // 增強切換按鈕功能
        enhanceSwapChunksButton();

        // 增強效能監控
        enhancePerformanceMonitoring();

        // 綁定最佳化器控制事件
        bindOptimizerControls();

        console.log('[ChunkIntegration] 分塊對比最佳化器整合完成');
    }

    /**
     * 增強切換按鈕功能
     */
    function enhanceSwapChunksButton() {
        // 使用事件委託處理切換按鈕
        document.addEventListener('click', function(e) {
            if (e.target.id === 'swap-chunks-btn') {
                e.preventDefault();
                handleChunkSwap();
            }

            // 處理效能模式切換
            if (e.target.id === 'performance-toggle-btn' || e.target.closest('#performance-toggle-btn')) {
                e.preventDefault();
                togglePerformanceMode();
            }
        });
    }

    /**
     * 處理分塊位置切換
     */
    function handleChunkSwap() {
        const startTime = performance.now();
        console.log('[ChunkIntegration] 開始切換分塊位置');

        // 切換全域標誌
        window.isOriginalFirstInChunkCompare = !window.isOriginalFirstInChunkCompare;
        
        // 儲存使用者偏好
        if (window.docIdForLocalStorage) {
            localStorage.setItem(
                `isOriginalFirst_${window.docIdForLocalStorage}`, 
                window.isOriginalFirstInChunkCompare
            );
        }

        // 更新按鈕狀態
        const swapBtn = document.getElementById('swap-chunks-btn');
        if (swapBtn) {
            swapBtn.style.transform = window.isOriginalFirstInChunkCompare ? 'rotate(0deg)' : 'rotate(180deg)';
            swapBtn.title = window.isOriginalFirstInChunkCompare ? '切換原文/譯文位置' : '切換譯文/原文位置';
        }

        // 如果使用最佳化器，需要重新渲染
        if (window.ChunkCompareOptimizer && window.ChunkCompareOptimizer.instance) {
            // 清除快取以重新渲染
            window.ChunkCompareOptimizer.instance.renderCache.clear();
            
            // 重新顯示當前標籤
            if (typeof window.showTab === 'function') {
                window.showTab('chunk-compare');
            }
        }

        const endTime = performance.now();
        console.log(`[ChunkIntegration] 分塊位置切換完成，耗時: ${(endTime - startTime).toFixed(2)}ms`);
    }

    /**
     * 切換效能模式
     */
    function togglePerformanceMode() {
        const container = document.querySelector('.chunk-compare-container');
        const toggleBtn = document.getElementById('performance-toggle-btn');
        
        if (!container || !toggleBtn) return;

        const isPerformanceMode = container.classList.contains('performance-mode');
        
        if (isPerformanceMode) {
            // 關閉效能模式
            container.classList.remove('performance-mode');
            toggleBtn.classList.remove('active');
            toggleBtn.title = '啟用效能模式';
            console.log('[ChunkIntegration] 效能模式已關閉');
        } else {
            // 啟用效能模式
            container.classList.add('performance-mode');
            toggleBtn.classList.add('active');
            toggleBtn.title = '關閉效能模式';
            console.log('[ChunkIntegration] 效能模式已啟用');
        }

        // 儲存使用者偏好
        localStorage.setItem('chunkComparePerformanceMode', !isPerformanceMode);
    }

    /**
     * 增強效能監控
     */
    function enhancePerformanceMonitoring() {
        // 監控分塊對比的渲染效能
        const originalConsoleTime = console.time;
        const originalConsoleTimeEnd = console.timeEnd;

        console.time = function(label) {
            if (label.includes('分塊對比') || label.includes('chunk')) {
                performance.mark(`${label}-start`);
            }
            return originalConsoleTime.apply(this, arguments);
        };

        console.timeEnd = function(label) {
            if (label.includes('分塊對比') || label.includes('chunk')) {
                performance.mark(`${label}-end`);
                try {
                    performance.measure(label, `${label}-start`, `${label}-end`);
                    const measure = performance.getEntriesByName(label, 'measure')[0];
                    if (measure) {
                        console.log(`[效能監控] ${label}: ${measure.duration.toFixed(2)}ms`);
                        
                        // 如果渲染時間過長，提示使用者
                        if (measure.duration > 2000) { // 超過2秒
                            showPerformanceWarning(label, measure.duration);
                        }
                    }
                } catch (error) {
                    console.warn('效能測量失敗:', error);
                }
            }
            return originalConsoleTimeEnd.apply(this, arguments);
        };
    }

    /**
     * 顯示效能警告
     */
    function showPerformanceWarning(operation, duration) {
        const warningEl = document.createElement('div');
        warningEl.className = 'performance-warning';
        warningEl.innerHTML = `
            <div class="warning-content">
                <i class="fas fa-exclamation-triangle"></i>
                <span>渲染耗時較長 (${(duration / 1000).toFixed(1)}秒)</span>
                <button onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        warningEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fef3cd;
            border: 1px solid #fecba1;
            border-radius: 6px;
            padding: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 10000;
            max-width: 300px;
        `;

        document.body.appendChild(warningEl);

        // 5秒後自動移除
        setTimeout(() => {
            if (warningEl.parentElement) {
                warningEl.remove();
            }
        }, 5000);
    }

    /**
     * 綁定最佳化器控制事件
     */
    function bindOptimizerControls() {
        // 恢復使用者偏好設定
        const savedPerformanceMode = localStorage.getItem('chunkComparePerformanceMode');
        if (savedPerformanceMode === 'true') {
            setTimeout(() => {
                const container = document.querySelector('.chunk-compare-container');
                const toggleBtn = document.getElementById('performance-toggle-btn');
                if (container && toggleBtn) {
                    container.classList.add('performance-mode');
                    toggleBtn.classList.add('active');
                }
            }, 100);
        }

        // 綁定鍵盤快捷鍵（僅綁定一次）
        if (!window.__chunkCompareKeydownBound) {
            window.__chunkCompareKeydownBound = true;
            document.addEventListener('keydown', function(e) {
                // Ctrl/Cmd + Shift + P: 切換效能模式
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
                    e.preventDefault();
                    togglePerformanceMode();
                }

                // Ctrl/Cmd + Shift + S: 切換原文/譯文位置
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
                    e.preventDefault();
                    const swapBtn = document.getElementById('swap-chunks-btn');
                    if (swapBtn && window.currentVisibleTabId === 'chunk-compare') {
                        handleChunkSwap();
                    }
                }
            });
        }

        // 新增快捷鍵提示
        addKeyboardShortcutHints();
    }

    /**
     * 新增鍵盤快捷鍵提示
     */
    function addKeyboardShortcutHints() {
        // 防止重複綁定觀察者
        if (window.__chunkCompareHintsObserverBound) return;
        window.__chunkCompareHintsObserverBound = true;

        // 監聽分塊對比標籤的啟用
        const observer = new MutationObserver(function(mutations) {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.id === 'tab-chunk-compare' && target.classList.contains('active')) {
                        showKeyboardHints(observer);
                    }
                }
            }
        });

        const chunkTab = document.getElementById('tab-chunk-compare');
        if (chunkTab) {
            observer.observe(chunkTab, { attributes: true });
        }
    }

    /**
     * 顯示鍵盤快捷鍵提示
     */
    function showKeyboardHints(observerInstance) {
        // 本地與記憶體雙重防抖：防止多次渲染
        if (window.__chunkCompareHintsShown || localStorage.getItem('chunkCompareHintsShown') === 'true') {
            return;
        }
        // 如果DOM中已存在同名元素，也不再渲染
        if (document.querySelector('.keyboard-hints')) return;

        // 先設定標記，避免短時間內重複觸發造成多次追加
        window.__chunkCompareHintsShown = true;
        localStorage.setItem('chunkCompareHintsShown', 'true');

        setTimeout(() => {
            // 若已存在，不重複建立
            if (document.querySelector('.keyboard-hints')) return;
            const hintsEl = document.createElement('div');
            hintsEl.className = 'keyboard-hints';
            hintsEl.innerHTML = `
                <div class="hints-content">
                    <h4>鍵盤快捷鍵</h4>
                    <div class="hint-item">
                        <kbd>Ctrl/Cmd + Shift + P</kbd>
                        <span>切換效能模式</span>
                    </div>
                    <div class="hint-item">
                        <kbd>Ctrl/Cmd + Shift + S</kbd>
                        <span>切換原文/譯文位置</span>
                    </div>
                    <button class="close-hints" onclick="this.parentElement.parentElement.remove()">知道了</button>
                </div>
            `;
            hintsEl.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10001;
                max-width: 300px;
            `;

            document.body.appendChild(hintsEl);

            // 10秒後自動移除
            setTimeout(() => {
                if (hintsEl.parentElement) {
                    hintsEl.remove();
                }
            }, 10000);
            // 觀察者可在首次顯示後斷開，避免無意義監聽
            if (observerInstance && typeof observerInstance.disconnect === 'function') {
                observerInstance.disconnect();
            }
        }, 500);
    }

    /**
     * 最佳化分塊導航
     */
    function enhanceChunkNavigation() {
        // 新增快速導航功能
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('block-nav-btn')) {
                e.preventDefault();
                const direction = e.target.dataset.dir;
                const currentBlock = parseInt(e.target.dataset.block);
                
                if (direction === 'prev' && currentBlock > 0) {
                    scrollToChunk(currentBlock - 1);
                } else if (direction === 'next') {
                    scrollToChunk(currentBlock + 1);
                }
            }
        });
    }

    /**
     * 滾動到指定分塊
     */
    function scrollToChunk(index) {
        const chunk = document.getElementById(`chunk-${index}`) || document.getElementById(`block-${index}`);
        if (chunk) {
            chunk.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            // 醒目提示顯示目標分塊
            chunk.classList.add('chunk-highlight');
            setTimeout(() => {
                chunk.classList.remove('chunk-highlight');
            }, 1500);
        }
    }

    /**
     * 新增分塊醒目提示樣式
     */
    function addChunkHighlightStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .chunk-highlight {
                box-shadow: 0 0 0 3px #3b82f6 !important;
                transition: box-shadow 0.3s ease !important;
            }
            
            .performance-warning .warning-content {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.9em;
                color: #92400e;
            }
            
            .keyboard-hints .hints-content h4 {
                margin: 0 0 12px 0;
                color: #1e293b;
                font-size: 1.1em;
            }
            
            .keyboard-hints .hint-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                font-size: 0.9em;
            }
            
            .keyboard-hints kbd {
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                border-radius: 3px;
                padding: 2px 6px;
                font-size: 0.8em;
                font-family: monospace;
            }
            
            .keyboard-hints .close-hints {
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                cursor: pointer;
                font-size: 0.9em;
                margin-top: 12px;
                width: 100%;
            }
        `;
        document.head.appendChild(style);
    }

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            addChunkHighlightStyles();
            enhanceChunkNavigation();
            initializeChunkCompareOptimization();
        });
    } else {
        addChunkHighlightStyles();
        enhanceChunkNavigation();
        initializeChunkCompareOptimization();
    }

})();
