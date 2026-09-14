/**
 * Paper Burner - 效能最佳化配置
 * Phase 3.5: 統一管理所有效能相關的配置常量
 * Phase 4.4: 裝置自適應配置 + 基礎 A/B 測試框架
 */

/**
 * 裝置效能檢測
 * - 基於 navigator.deviceMemory 與 navigator.hardwareConcurrency
 * - 返回 'high' | 'medium' | 'low'
 */
function detectDevicePerformance() {
  try {
    var nav = window.navigator || {};
    var memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 4; // 預設按中等裝置處理
    var cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4;

    if (memory >= 8 && cores >= 8) return 'high';
    if (memory >= 4 && cores >= 4) return 'medium';
    return 'low';
  } catch (e) {
    return 'medium';
  }
}

/**
 * Phase 4.4 - 效能實驗配置
 * - 使用 localStorage('perf_variant') 控制實驗分組
 * - 預設分組為 'control'，保持與當前行為儘量接近
 * - 實驗分組可透過主控台手動切換：PerformanceExperiment.setVariant('variant_a')
 */
window.PerformanceExperiment = (function() {
  var STORAGE_KEY = 'perf_variant';
  var variant = 'control';

  try {
    var saved = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved === 'control' || saved === 'variant_a' || saved === 'variant_b') {
      variant = saved;
    }
  } catch (e) {
    // 本地儲存不可用時，保持預設值 'control'
  }

  var deviceTier = detectDevicePerformance();

  return {
    storageKey: STORAGE_KEY,
    variant: variant,
    deviceTier: deviceTier,

    setVariant: function(nextVariant) {
      if (nextVariant !== 'control' && nextVariant !== 'variant_a' && nextVariant !== 'variant_b') return;
      this.variant = nextVariant;
      try {
        if (window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, nextVariant);
        }
      } catch (e) {
        // 忽略本地儲存錯誤
      }
    },

    /**
     * 獲取當前分組下的配置覆蓋項
     * key 示例：'UPDATE_INTERVALS'
     */
    getConfig: function(key) {
      var variants = {
        control: {
          UPDATE_INTERVALS: { FOREGROUND: 400, DEBOUNCE: 100 }
        },
        // 更激進：更快的前臺更新 + 更短防抖
        variant_a: {
          UPDATE_INTERVALS: { FOREGROUND: 300, DEBOUNCE: 80 }
        },
        // 更保守：更慢的前臺更新 + 更長防抖
        variant_b: {
          UPDATE_INTERVALS: { FOREGROUND: 500, DEBOUNCE: 120 }
        }
      };
      var group = variants[this.variant] || variants.control;
      return group[key];
    }
  };
})();

// 裝置自適應基線配置（在實驗覆蓋前計算）
var __pbDeviceTier = window.PerformanceExperiment && window.PerformanceExperiment.deviceTier
  ? window.PerformanceExperiment.deviceTier
  : detectDevicePerformance();

// 基線更新間隔（未應用 A/B 實驗前）
var __pbBaseForegroundInterval = __pbDeviceTier === 'high' ? 300 : 400;
var __pbBaseDebounce = 100;

// 應用 A/B 實驗覆蓋（僅限 UPDATE_INTERVALS）
var __pbExperimentIntervals = window.PerformanceExperiment && typeof window.PerformanceExperiment.getConfig === 'function'
  ? window.PerformanceExperiment.getConfig('UPDATE_INTERVALS')
  : null;

if (__pbExperimentIntervals) {
  if (typeof __pbExperimentIntervals.FOREGROUND === 'number') {
    __pbBaseForegroundInterval = __pbExperimentIntervals.FOREGROUND;
  }
  if (typeof __pbExperimentIntervals.DEBOUNCE === 'number') {
    __pbBaseDebounce = __pbExperimentIntervals.DEBOUNCE;
  }
}

window.PerformanceConfig = {
  // 流式更新間隔配置（裝置自適應 + A/B 覆蓋）
  UPDATE_INTERVALS: {
    FOREGROUND: __pbBaseForegroundInterval, // 前臺分頁更新間隔 (ms)
    BACKGROUND: 1500,                       // 後臺分頁更新間隔 (ms)
    DEBOUNCE: __pbBaseDebounce              // 防抖延遲 (ms)
  },

  // 智慧跳幀配置（根據裝置效能調整閾值與最大倍數）
  ADAPTIVE_RENDER: {
    HEAVY_THRESHOLD: (function() {
      // 高核機器允許更高的“重渲染”閾值
      try {
        var cores = typeof window.navigator?.hardwareConcurrency === 'number'
          ? window.navigator.hardwareConcurrency
          : 4;
        return cores > 4 ? 300 : 200;
      } catch (e) {
        return 200;
      }
    })(),
    MIN_MULTIPLIER: 1,
    MAX_MULTIPLIER: __pbDeviceTier === 'low' ? 8 : 4,
    DECAY_THRESHOLD: 100,   // 衰減閾值 (ms) - 低於此值時逐步恢復
    WARN_THRESHOLD: 400     // 日誌警告閾值 (ms，用於效能日誌)
  },

  // PNG匯出配置
  EXPORT: {
    MAX_WIDTH: 1200,          // 匯出容器最大寬度 (px)
    ABSOLUTE_MAX_WIDTH: 2000, // 絕對最大寬度 (px)
    LAYOUT_DELAY: 50,         // DOM重排延遲 (ms)
    SCALE: 2                  // html2canvas縮放倍數
  },

  // 日誌配置
  LOGGING: {
    ENABLED: true,               // 是否啟用日誌
    LEVEL: 'warn',               // 日誌級別: 'debug' | 'info' | 'warn' | 'error'
    PERFORMANCE_LOGS: true,      // 是否啟用效能日誌
    PERF_MIN_INTERVAL_MS: 2000   // 效能日誌最小間隔，避免主控台被刷屏
  },

  // 滾動配置
  SCROLL: {
    BOTTOM_THRESHOLD: 50      // 判定使用者在底部的容差 (px)
  }
};

/**
 * 日誌工具 - 根據配置級別輸出日誌
 */
window.PerfLogger = {
  _shouldLog(level) {
    if (!window.PerformanceConfig.LOGGING.ENABLED) return false;

    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[window.PerformanceConfig.LOGGING.LEVEL] || 1;
    const currentLevel = levels[level] || 0;

    return currentLevel >= configLevel;
  },

  debug(...args) {
    if (this._shouldLog('debug')) console.log('[Phase 3.5 Debug]', ...args);
  },

  info(...args) {
    if (this._shouldLog('info')) console.log('[Phase 3.5 Info]', ...args);
  },

  warn(...args) {
    if (this._shouldLog('warn')) console.warn('[Phase 3.5 Warn]', ...args);
  },

  error(...args) {
    if (this._shouldLog('error')) console.error('[Phase 3.5 Error]', ...args);
  },

  perf(message, duration) {
    if (!window.PerformanceConfig.LOGGING.PERFORMANCE_LOGS) return;
    if (duration <= window.PerformanceConfig.ADAPTIVE_RENDER.WARN_THRESHOLD) return;

    // 限制效能日誌頻率，避免在流式場景中產生成千上萬條 warning
    const minInterval = window.PerformanceConfig.LOGGING.PERF_MIN_INTERVAL_MS || 2000;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

    if (this._perfLastLogTime && (now - this._perfLastLogTime) < minInterval) {
      return;
    }

    this._perfLastLogTime = now;
    this.warn(`效能: ${message} - ${duration.toFixed(0)}ms`);
  }
};

/**
 * 渲染狀態管理 - 避免全域變數汙染
 */
window.ChatbotRenderState = {
  lastRenderedMessageCount: 0,
  isExporting: false,
  adaptiveMultiplier: 1,
  lastRenderDuration: 0,

  reset() {
    this.lastRenderedMessageCount = 0;
    this.isExporting = false;
    this.adaptiveMultiplier = 1;
    this.lastRenderDuration = 0;
  }
};
