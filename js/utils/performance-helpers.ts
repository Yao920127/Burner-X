/**
 * 效能最佳化工具模組
 *
 * 提供常用的效能最佳化工具函式：
 * - 防抖 (debounce)
 * - 節流 (throttle)
 * - LRU 快取
 * - 安全定時器管理
 *
 * @module PerformanceHelpers
 */

export const PerformanceHelpers = {
    /**
     * 防抖函式
     * 在事件觸發後等待指定時間才執行，如果在等待期間再次觸發則重新計時
     *
     * @param {Function} fn - 要執行的函式
     * @param {number} delay - 延遲時間（毫秒）
     * @returns {Function} 防抖後的函式
     *
     * @example
     * const debouncedSearch = PerformanceHelpers.debounce((query) => {
     *     console.log('Searching for:', query);
     * }, 300);
     *
     * input.addEventListener('input', (e) => debouncedSearch(e.target.value));
     */
    debounce(fn, delay) {
        let timer = null;

        return function debounced(...args) {
            const context = this;

            // 清除之前的定時器
            if (timer) {
                clearTimeout(timer);
            }

            // 設定新的定時器
            timer = setTimeout(() => {
                timer = null;
                fn.apply(context, args);
            }, delay);
        };
    },

    /**
     * 節流函式
     * 在指定時間內只執行一次，無論觸發多少次
     *
     * @param {Function} fn - 要執行的函式
     * @param {number} delay - 時間間隔（毫秒）
     * @param {Object} options - 配置選項
     * @param {boolean} options.leading - 是否在開始時立即執行（預設 true）
     * @param {boolean} options.trailing - 是否在結束時執行（預設 true）
     * @returns {Function} 節流後的函式
     *
     * @example
     * const throttledScroll = PerformanceHelpers.throttle(() => {
     *     console.log('Scroll position:', window.scrollY);
     * }, 200);
     *
     * window.addEventListener('scroll', throttledScroll);
     */
    throttle(fn, delay, options = {}) {
        const { leading = true, trailing = true } = options;

        let lastCall = 0;
        let timer = null;

        return function throttled(...args) {
            const context = this;
            const now = Date.now();
            const timeSinceLastCall = now - lastCall;

            // 首次呼叫且 leading 為 true
            if (leading && lastCall === 0) {
                lastCall = now;
                return fn.apply(context, args);
            }

            // 清除之前的尾呼叫定時器
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            // 如果距離上次呼叫超過了延遲時間
            if (timeSinceLastCall >= delay) {
                lastCall = now;
                return fn.apply(context, args);
            }

            // 設定尾呼叫
            if (trailing) {
                timer = setTimeout(() => {
                    lastCall = Date.now();
                    timer = null;
                    fn.apply(context, args);
                }, delay - timeSinceLastCall);
            }
        };
    },

    /**
     * LRU (Least Recently Used) 快取
     * 當快取達到最大容量時，自動刪除最久未使用的項
     *
     * @param {number} maxSize - 最大快取數量
     * @returns {Object} 快取物件，包含 get/set/clear/getStats 方法
     *
     * @example
     * const cache = PerformanceHelpers.createLRUCache(100);
     * cache.set('key1', 'value1');
     * const value = cache.get('key1');  // 'value1'
     * const stats = cache.getStats();   // { size: 1, hits: 1, misses: 0, ... }
     */
    createLRUCache(maxSize = 1000) {
        const cache = new Map();

        // 效能統計
        const stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            sets: 0
        };

        return {
            /**
             * 獲取快取值
             * @param {*} key - 快取鍵
             * @returns {*} 快取值，不存在返回 undefined
             */
            get(key) {
                if (!cache.has(key)) {
                    stats.misses++;
                    return undefined;
                }

                stats.hits++;
                const value = cache.get(key);

                // 移到最後（標記為最近使用）
                cache.delete(key);
                cache.set(key, value);

                return value;
            },

            /**
             * 設定快取值
             * @param {*} key - 快取鍵
             * @param {*} value - 快取值
             */
            set(key, value) {
                stats.sets++;

                // 如果已存在，先刪除（會重新新增到末尾）
                if (cache.has(key)) {
                    cache.delete(key);
                } else if (cache.size >= maxSize) {
                    // 刪除最久未使用的（第一個）
                    const firstKey = cache.keys().next().value;
                    cache.delete(firstKey);
                    stats.evictions++;
                }

                cache.set(key, value);
            },

            /**
             * 檢查鍵是否存在
             * @param {*} key - 快取鍵
             * @returns {boolean}
             */
            has(key) {
                return cache.has(key);
            },

            /**
             * 刪除指定鍵
             * @param {*} key - 快取鍵
             * @returns {boolean} 是否刪除成功
             */
            delete(key) {
                return cache.delete(key);
            },

            /**
             * 清空快取
             */
            clear() {
                cache.clear();
                stats.hits = 0;
                stats.misses = 0;
                stats.evictions = 0;
                stats.sets = 0;
            },

            /**
             * 獲取當前大小
             * @returns {number}
             */
            get size() {
                return cache.size;
            },

            /**
             * 獲取統計資訊
             * @returns {Object} 包含命中率、大小等資訊
             */
            getStats() {
                const total = stats.hits + stats.misses;
                return {
                    size: cache.size,
                    maxSize: maxSize,
                    hits: stats.hits,
                    misses: stats.misses,
                    sets: stats.sets,
                    evictions: stats.evictions,
                    hitRate: total > 0 ? (stats.hits / total) : 0,
                    hitRatePercent: total > 0 ? ((stats.hits / total) * 100).toFixed(2) + '%' : '0%'
                };
            }
        };
    },

    /**
     * 安全定時器管理器
     * 自動跟蹤所有定時器，確保在頁面解除安裝時清理
     *
     * @returns {Object} 定時器管理器，包含 setTimeout/setInterval/clearAll 方法
     *
     * @example
     * const timers = PerformanceHelpers.createManagedTimer();
     * const id = timers.setTimeout(() => console.log('Hello'), 1000);
     * // 頁面解除安裝時自動清理
     * window.addEventListener('beforeunload', () => timers.clearAll());
     */
    createManagedTimer() {
        const timers = new Set();

        return {
            /**
             * 設定延遲定時器
             * @param {Function} fn - 回撥函式
             * @param {number} delay - 延遲時間（毫秒）
             * @returns {number} 定時器 ID
             */
            setTimeout(fn, delay) {
                const id = setTimeout(() => {
                    timers.delete(id);
                    fn();
                }, delay);

                timers.add(id);
                return id;
            },

            /**
             * 設定迴圈定時器
             * @param {Function} fn - 回撥函式
             * @param {number} delay - 時間間隔（毫秒）
             * @returns {number} 定時器 ID
             */
            setInterval(fn, delay) {
                const id = setInterval(fn, delay);
                timers.add(id);
                return id;
            },

            /**
             * 清除指定定時器
             * @param {number} id - 定時器 ID
             */
            clear(id) {
                clearTimeout(id);
                clearInterval(id);
                timers.delete(id);
            },

            /**
             * 清除所有定時器
             */
            clearAll() {
                timers.forEach(id => {
                    clearTimeout(id);
                    clearInterval(id);
                });
                timers.clear();
            },

            /**
             * 獲取活躍定時器數量
             * @returns {number}
             */
            get activeCount() {
                return timers.size;
            }
        };
    },

    /**
     * 輪詢管理器
     * 支援頁面可見性檢測，在頁面隱藏時自動暫停
     *
     * @param {Function} checkFn - 輪詢執行的函式
     * @param {number} interval - 輪詢間隔（毫秒）
     * @param {Object} options - 配置選項
     * @param {boolean} options.pauseWhenHidden - 頁面隱藏時是否暫停（預設 true）
     * @returns {Object} 輪詢管理器，包含 start/stop/pause/resume 方法
     *
     * @example
     * const poller = PerformanceHelpers.createPoller(
     *     () => checkForUpdates(),
     *     5000,
     *     { pauseWhenHidden: true }
     * );
     * poller.start();
     */
    createPoller(checkFn, interval = 1000, options = {}) {
        const { pauseWhenHidden = true } = options;

        let timerId = null;
        let isActive = false;
        let isPaused = false;

        const poll = () => {
            if (!isActive) return;

            // 如果頁面隱藏且配置了暫停，則跳過執行
            if (!isPaused && (!pauseWhenHidden || !document.hidden)) {
                try {
                    checkFn();
                } catch (error) {
                    console.error('[Poller] Error in check function:', error);
                }
            }

            // 繼續下一次輪詢
            timerId = setTimeout(poll, interval);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log('[Poller] Page hidden, pausing...');
            } else {
                console.log('[Poller] Page visible, resuming...');
            }
        };

        // 設定頁面可見性監聽
        if (pauseWhenHidden) {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return {
            /**
             * 啟動輪詢
             */
            start() {
                if (isActive) {
                    console.warn('[Poller] Already active');
                    return;
                }

                isActive = true;
                isPaused = false;
                poll();
            },

            /**
             * 停止輪詢
             */
            stop() {
                isActive = false;
                isPaused = false;

                if (timerId) {
                    clearTimeout(timerId);
                    timerId = null;
                }
            },

            /**
             * 暫停輪詢（不清除定時器）
             */
            pause() {
                isPaused = true;
            },

            /**
             * 恢復輪詢
             */
            resume() {
                isPaused = false;
            },

            /**
             * 獲取狀態
             * @returns {Object}
             */
            getStatus() {
                return {
                    isActive,
                    isPaused,
                    interval
                };
            },

            /**
             * 銷燬輪詢器
             */
            destroy() {
                this.stop();

                if (pauseWhenHidden) {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                }
            }
        };
    },

    /**
     * 效能測量工具
     * 簡化 Performance API 的使用
     *
     * @example
     * PerformanceHelpers.measure('render', () => {
     *     renderList();
     * });
     */
    measure: {
        /**
         * 測量函式執行時間
         * @param {string} label - 標籤
         * @param {Function} fn - 要測量的函式
         * @returns {*} 函式返回值
         */
        sync(label, fn) {
            const startMark = `${label}-start`;
            const endMark = `${label}-end`;

            performance.mark(startMark);
            const result = fn();
            performance.mark(endMark);

            performance.measure(label, startMark, endMark);
            const measure = performance.getEntriesByName(label)[0];

            console.log(`[Measure] ${label}: ${measure.duration.toFixed(2)}ms`);

            // 清理
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
            performance.clearMeasures(label);

            return result;
        },

        /**
         * 測量非同步函式執行時間
         * @param {string} label - 標籤
         * @param {Function} fn - 要測量的非同步函式
         * @returns {Promise<*>} 函式返回值
         */
        async async(label, fn) {
            const startMark = `${label}-start`;
            const endMark = `${label}-end`;

            performance.mark(startMark);
            const result = await fn();
            performance.mark(endMark);

            performance.measure(label, startMark, endMark);
            const measure = performance.getEntriesByName(label)[0];

            console.log(`[Measure] ${label}: ${measure.duration.toFixed(2)}ms`);

            // 清理
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
            performance.clearMeasures(label);

            return result;
        }
    }
};

// 匯出預設物件（相容 CommonJS）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceHelpers;
}
