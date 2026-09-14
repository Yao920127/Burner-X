/**
 * Paper Burner - KaTeX 快取持久化系統
 * Phase 4.2+: 自動儲存和恢復公式快取到 localStorage
 *
 * 功能：
 * - 頁面關閉時自動儲存快取
 * - 頁面載入時自動恢復快取
 * - 自動清理過期快取（7 天）
 * - 管理儲存配額（最多 5MB）
 *
 * 預期收益：
 * - 二次訪問時公式渲染速度提升 99%
 * - 完全消除重複公式的渲染時間
 */

(function() {
  'use strict';

  const STORAGE_CONFIG = {
    KEY: 'paperburner_katex_cache',
    VERSION: 1,
    MAX_AGE_DAYS: 7,                    // 快取有效期（天）
    MAX_SIZE_MB: 5,                     // 最大儲存空間（MB）
    AUTO_SAVE_INTERVAL: 30000,          // 自動儲存間隔（30秒）
    ENABLE_AUTO_SAVE: true,             // 是否啟用自動儲存
    ENABLE_DEBUG: false                 // 除錯模式
  };

  /**
   * KaTeX 快取持久化管理器
   */
  class KaTeXCachePersistence {
    constructor(cache, options = {}) {
      this.cache = cache;
      this.storageKey = options.storageKey || STORAGE_CONFIG.KEY;
      this.maxAgeDays = options.maxAgeDays || STORAGE_CONFIG.MAX_AGE_DAYS;
      this.maxSizeMB = options.maxSizeMB || STORAGE_CONFIG.MAX_SIZE_MB;
      this.autoSaveInterval = options.autoSaveInterval || STORAGE_CONFIG.AUTO_SAVE_INTERVAL;
      this.enableAutoSave = options.enableAutoSave !== false;
      this.enableDebug = options.enableDebug || STORAGE_CONFIG.ENABLE_DEBUG;

      this.autoSaveTimer = null;
      this.lastSaveTime = 0;
      this.saveCount = 0;

      this.init();
    }

    /**
     * 初始化持久化系統
     */
    init() {
      // 載入快取
      this.load();

      // 設定自動儲存
      if (this.enableAutoSave) {
        this.startAutoSave();
      }

      // 頁面解除安裝時儲存
      window.addEventListener('beforeunload', () => {
        this.save();
      });

      // 頁面隱藏時儲存（行動裝置）
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.save();
        }
      });

      this.log('Persistence system initialized', 'info');
    }

    /**
     * 從 localStorage 載入快取
     */
    load() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) {
          this.log('No cached data found', 'info');
          return false;
        }

        const data = JSON.parse(stored);

        // 驗證版本
        if (data.version !== STORAGE_CONFIG.VERSION) {
          this.log(`Version mismatch: ${data.version} vs ${STORAGE_CONFIG.VERSION}`, 'warn');
          this.clear();
          return false;
        }

        // 檢查過期時間
        const age = Date.now() - data.timestamp;
        const maxAge = this.maxAgeDays * 24 * 60 * 60 * 1000;

        if (age > maxAge) {
          this.log(`Cache expired: ${Math.round(age / 86400000)} days old`, 'warn');
          this.clear();
          return false;
        }

        // 匯入快取
        const success = this.cache.import(data.cacheData);

        if (success) {
          const size = this.estimateSize(stored);
          this.log(`✅ Loaded ${data.cacheData.entries.length} formulas from cache (${size} KB, ${Math.round(age / 60000)} min old)`, 'success');
          return true;
        } else {
          this.log('Failed to import cache data', 'error');
          return false;
        }
      } catch (error) {
        this.log(`Load error: ${error.message}`, 'error');
        this.clear();
        return false;
      }
    }

    /**
     * 儲存快取到 localStorage
     */
    save() {
      try {
        const cacheData = this.cache.export();

        const data = {
          version: STORAGE_CONFIG.VERSION,
          timestamp: Date.now(),
          cacheData: cacheData
        };

        const json = JSON.stringify(data);
        const size = this.estimateSize(json);

        // 檢查大小限制
        if (size > this.maxSizeMB * 1024) {
          this.log(`Cache too large: ${size} KB > ${this.maxSizeMB * 1024} KB`, 'warn');

          // 嘗試清理舊條目
          this.pruneCache(cacheData);
          return this.save(); // 遞迴儲存清理後的快取
        }

        localStorage.setItem(this.storageKey, json);

        this.lastSaveTime = Date.now();
        this.saveCount++;

        this.log(`💾 Saved ${cacheData.entries.length} formulas (${size} KB) [#${this.saveCount}]`, 'success');
        return true;
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          this.log('Storage quota exceeded, clearing old cache', 'warn');
          this.clear();
          return false;
        }

        this.log(`Save error: ${error.message}`, 'error');
        return false;
      }
    }

    /**
     * 清理快取（保留最近使用的條目）
     */
    pruneCache(cacheData) {
      const maxEntries = Math.floor(cacheData.entries.length * 0.7); // 保留 70%
      const prunedEntries = cacheData.entries.slice(-maxEntries);

      this.log(`Pruning cache: ${cacheData.entries.length} → ${prunedEntries.length}`, 'warn');

      cacheData.entries = prunedEntries;
      this.cache.import(cacheData);
    }

    /**
     * 清空快取
     */
    clear() {
      try {
        localStorage.removeItem(this.storageKey);
        this.cache.clear();
        this.log('Cache cleared', 'info');
        return true;
      } catch (error) {
        this.log(`Clear error: ${error.message}`, 'error');
        return false;
      }
    }

    /**
     * 啟動自動儲存
     */
    startAutoSave() {
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }

      this.autoSaveTimer = setInterval(() => {
        const stats = this.cache.getStats();

        // 只有快取有更新時才儲存
        if (stats.hits > 0 || stats.misses > 0) {
          this.save();
        }
      }, this.autoSaveInterval);

      this.log(`Auto-save enabled: every ${this.autoSaveInterval / 1000}s`, 'info');
    }

    /**
     * 停止自動儲存
     */
    stopAutoSave() {
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = null;
        this.log('Auto-save disabled', 'info');
      }
    }

    /**
     * 估算資料大小（KB）
     */
    estimateSize(data) {
      const bytes = new Blob([data]).size;
      return Math.round(bytes / 1024);
    }

    /**
     * 獲取持久化統計資訊
     */
    getStats() {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) {
          return {
            exists: false,
            size: 0,
            age: 0,
            entries: 0
          };
        }

        const data = JSON.parse(stored);
        const size = this.estimateSize(stored);
        const age = Date.now() - data.timestamp;

        return {
          exists: true,
          size: size,
          sizeFormatted: `${size} KB`,
          age: age,
          ageFormatted: this.formatAge(age),
          entries: data.cacheData?.entries?.length || 0,
          version: data.version,
          lastSaveTime: this.lastSaveTime,
          saveCount: this.saveCount
        };
      } catch (error) {
        return {
          exists: false,
          error: error.message
        };
      }
    }

    /**
     * 格式化時間差
     */
    formatAge(ms) {
      const minutes = Math.floor(ms / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days} 天前`;
      if (hours > 0) return `${hours} 小時前`;
      if (minutes > 0) return `${minutes} 分鐘前`;
      return '剛剛';
    }

    /**
     * 日誌輸出
     */
    log(message, type = 'info') {
      if (!this.enableDebug && type !== 'error') return;

      const prefix = '[KaTeXCache Persistence]';
      const timestamp = new Date().toLocaleTimeString();

      switch (type) {
        case 'success':
          console.log(`%c${prefix} ${message}`, 'color: #48bb78; font-weight: bold');
          break;
        case 'warn':
          console.warn(`${prefix} ${message}`);
          break;
        case 'error':
          console.error(`${prefix} ${message}`);
          break;
        default:
          console.log(`${prefix} ${message}`);
      }
    }
  }

  // 自動初始化持久化系統
  if (window.katexCache && !window.katexCachePersistence) {
    window.KaTeXCachePersistence = KaTeXCachePersistence;
    window.katexCachePersistence = new KaTeXCachePersistence(window.katexCache, {
      enableAutoSave: STORAGE_CONFIG.ENABLE_AUTO_SAVE,
      enableDebug: STORAGE_CONFIG.ENABLE_DEBUG
    });

    console.log('[KaTeXCache] Cache persistence enabled (auto-save every 30s)');

    // 提供全域檢視方法
    window.getKatexPersistenceStats = function() {
      const stats = window.katexCachePersistence.getStats();
      console.log('KaTeX 快取持久化統計：');
      console.table(stats);
      return stats;
    };

    // 提供手動儲存方法
    window.saveKatexCache = function() {
      return window.katexCachePersistence.save();
    };

    // 提供手動清除方法
    window.clearKatexCache = function() {
      return window.katexCachePersistence.clear();
    };
  } else if (!window.katexCache) {
    console.warn('[KaTeXCache Persistence] Cannot initialize: katexCache not found');
  }
})();

console.log('[KaTeXCache Persistence] System loaded');
console.log('  Stats: getKatexPersistenceStats()');
console.log('  Manual save: saveKatexCache()');
console.log('  Clear cache: clearKatexCache()');
