/**
 * Paper Burner - 本地效能監控工具
 * Phase 4.4.3: 效能資料收集（僅本地，不上報）
 *
 * 使用方法：
 * - 啟動監控：PerfMonitor.start()
 * - 停止監控：PerfMonitor.stop()
 * - 檢視實時資料：PerfMonitor.getStats()
 * - 匯出資料：PerfMonitor.export()
 * - 清空資料：PerfMonitor.clear()
 */

window.PerfMonitor = (function() {
  // 效能資料儲存（僅記憶體，不持久化）
  var metrics = {
    renderTime: [],      // 渲染耗時記錄
    fps: [],             // FPS 記錄
    longTasks: [],       // 長任務記錄
    memoryUsage: [],     // 記憶體使用記錄
    scrollEvents: [],    // 滾動事件密度
    domNodes: []         // DOM 節點數量
  };

  // 監控狀態
  var state = {
    isRunning: false,
    startTime: null,
    fpsAnimationId: null,
    memoryIntervalId: null,
    longTaskObserver: null
  };

  // 配置
  var config = {
    maxSamples: 1000,           // 每個指標最多保留樣本數
    memoryCheckInterval: 5000,  // 記憶體檢測間隔 (ms)
    fpsCheckInterval: 1000,     // FPS 統計間隔 (ms)
    longTaskThreshold: 50       // 長任務閾值 (ms)
  };

  /**
   * FPS 監控
   */
  function measureFPS() {
    var lastTime = performance.now();
    var frames = 0;
    var lastRecordTime = lastTime;

    function loop() {
      if (!state.isRunning) return;

      frames++;
      var now = performance.now();

      // 每秒統計一次 FPS
      if (now >= lastRecordTime + config.fpsCheckInterval) {
        var fps = Math.round((frames * 1000) / (now - lastRecordTime));

        metrics.fps.push({
          fps: fps,
          timestamp: Date.now()
        });

        // 限制樣本數量
        if (metrics.fps.length > config.maxSamples) {
          metrics.fps.shift();
        }

        frames = 0;
        lastRecordTime = now;
      }

      state.fpsAnimationId = requestAnimationFrame(loop);
    }

    state.fpsAnimationId = requestAnimationFrame(loop);
  }

  /**
   * 記憶體監控（僅 Chrome 支援）
   */
  function measureMemory() {
    if (!performance.memory) return;

    try {
      metrics.memoryUsage.push({
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        timestamp: Date.now()
      });

      // 限制樣本數量
      if (metrics.memoryUsage.length > config.maxSamples) {
        metrics.memoryUsage.shift();
      }
    } catch (e) {
      console.warn('[PerfMonitor] Memory API error:', e);
    }
  }

  /**
   * 長任務監控（需要 PerformanceObserver 支援）
   */
  function observeLongTasks() {
    if (!window.PerformanceObserver) return;

    try {
      state.longTaskObserver = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (entry.duration >= config.longTaskThreshold) {
            metrics.longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime,
              timestamp: Date.now()
            });

            // 限制樣本數量
            if (metrics.longTasks.length > config.maxSamples) {
              metrics.longTasks.shift();
            }
          }
        }
      });

      // 監控 longtask（需要瀏覽器支援）
      state.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // longtask 型別可能不支援，降級為 measure
      try {
        state.longTaskObserver.observe({ entryTypes: ['measure'] });
      } catch (e2) {
        console.warn('[PerfMonitor] PerformanceObserver not supported');
      }
    }
  }

  /**
   * 記錄渲染耗時
   */
  function recordRenderTime(duration, context) {
    if (!state.isRunning) return;

    metrics.renderTime.push({
      duration: duration,
      context: context || 'unknown',
      timestamp: Date.now()
    });

    // 限制樣本數量
    if (metrics.renderTime.length > config.maxSamples) {
      metrics.renderTime.shift();
    }
  }

  /**
   * 記錄 DOM 節點數量
   */
  function recordDOMNodes() {
    if (!state.isRunning) return;

    var chatBody = document.querySelector('.chat-body');
    if (!chatBody) return;

    metrics.domNodes.push({
      total: document.querySelectorAll('*').length,
      chatMessages: chatBody.querySelectorAll('.message').length,
      timestamp: Date.now()
    });

    // 限制樣本數量
    if (metrics.domNodes.length > config.maxSamples) {
      metrics.domNodes.shift();
    }
  }

  /**
   * 計算統計資料
   */
  function calculateStats(arr, key) {
    if (!arr || arr.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    var values = key
      ? arr.map(function(item) { return item[key]; })
      : arr;

    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var sum = sorted.reduce(function(acc, val) { return acc + val; }, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * 獲取效能統計資料
   */
  function getStats() {
    var now = Date.now();
    var duration = state.startTime ? (now - state.startTime) / 1000 : 0;

    return {
      session: {
        isRunning: state.isRunning,
        duration: duration.toFixed(1) + 's',
        startTime: state.startTime ? new Date(state.startTime).toISOString() : null
      },
      device: {
        tier: window.PerformanceExperiment?.deviceTier || 'unknown',
        cores: navigator.hardwareConcurrency || 'unknown',
        memory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown',
        userAgent: navigator.userAgent
      },
      rendering: {
        samples: metrics.renderTime.length,
        stats: calculateStats(metrics.renderTime, 'duration')
      },
      fps: {
        samples: metrics.fps.length,
        stats: calculateStats(metrics.fps, 'fps'),
        current: metrics.fps.length > 0 ? metrics.fps[metrics.fps.length - 1].fps : null
      },
      memory: performance.memory ? {
        samples: metrics.memoryUsage.length,
        current: metrics.memoryUsage.length > 0 ? {
          used: (metrics.memoryUsage[metrics.memoryUsage.length - 1].used / 1024 / 1024).toFixed(1) + 'MB',
          total: (metrics.memoryUsage[metrics.memoryUsage.length - 1].total / 1024 / 1024).toFixed(1) + 'MB'
        } : null,
        peak: metrics.memoryUsage.length > 0 ? {
          used: (Math.max.apply(null, metrics.memoryUsage.map(function(m) { return m.used; })) / 1024 / 1024).toFixed(1) + 'MB'
        } : null
      } : { available: false },
      longTasks: {
        samples: metrics.longTasks.length,
        stats: calculateStats(metrics.longTasks, 'duration'),
        recent: metrics.longTasks.slice(-5)
      },
      dom: {
        samples: metrics.domNodes.length,
        current: metrics.domNodes.length > 0 ? metrics.domNodes[metrics.domNodes.length - 1] : null
      }
    };
  }

  /**
   * 匯出原始資料（JSON 格式）
   */
  function exportData() {
    var data = {
      exportTime: new Date().toISOString(),
      session: getStats().session,
      device: getStats().device,
      metrics: {
        renderTime: metrics.renderTime,
        fps: metrics.fps,
        longTasks: metrics.longTasks,
        memoryUsage: metrics.memoryUsage,
        domNodes: metrics.domNodes
      }
    };

    // 輸出到主控台
    console.log('[PerfMonitor] 匯出資料：');
    console.log(JSON.stringify(data, null, 2));

    // 返回資料，方便複製
    return data;
  }

  /**
   * 啟動監控
   */
  function start() {
    if (state.isRunning) {
      console.warn('[PerfMonitor] 監控已在執行中');
      return;
    }

    console.log('[PerfMonitor] 啟動效能監控...');
    state.isRunning = true;
    state.startTime = Date.now();

    // 啟動各項監控
    measureFPS();
    observeLongTasks();

    // 定期採集記憶體和 DOM 資訊
    state.memoryIntervalId = setInterval(function() {
      measureMemory();
      recordDOMNodes();
    }, config.memoryCheckInterval);

    console.log('[PerfMonitor] 監控已啟動。使用 PerfMonitor.getStats() 檢視實時資料');
  }

  /**
   * 停止監控
   */
  function stop() {
    if (!state.isRunning) {
      console.warn('[PerfMonitor] 監控未在執行');
      return;
    }

    console.log('[PerfMonitor] 停止效能監控...');
    state.isRunning = false;

    // 停止各項監控
    if (state.fpsAnimationId) {
      cancelAnimationFrame(state.fpsAnimationId);
      state.fpsAnimationId = null;
    }

    if (state.memoryIntervalId) {
      clearInterval(state.memoryIntervalId);
      state.memoryIntervalId = null;
    }

    if (state.longTaskObserver) {
      state.longTaskObserver.disconnect();
      state.longTaskObserver = null;
    }

    // 顯示統計摘要
    var stats = getStats();
    console.log('[PerfMonitor] 監控已停止。統計摘要：');
    console.table({
      '監控時長': stats.session.duration,
      '平均渲染耗時': stats.rendering.stats.avg.toFixed(1) + 'ms',
      'P95渲染耗時': stats.rendering.stats.p95.toFixed(1) + 'ms',
      '平均FPS': stats.fps.stats.avg.toFixed(0),
      '最低FPS': stats.fps.stats.min,
      '長任務數量': stats.longTasks.samples
    });
  }

  /**
   * 清空資料
   */
  function clear() {
    metrics.renderTime = [];
    metrics.fps = [];
    metrics.longTasks = [];
    metrics.memoryUsage = [];
    metrics.scrollEvents = [];
    metrics.domNodes = [];
    console.log('[PerfMonitor] 資料已清空');
  }

  // 公開 API
  return {
    start: start,
    stop: stop,
    clear: clear,
    getStats: getStats,
    export: exportData,
    recordRender: recordRenderTime,

    // 用於除錯
    _metrics: metrics,
    _state: state,
    _config: config
  };
})();

// 自動整合到現有的渲染流程
(function() {
  // 攔截 ChatbotRenderState，自動記錄渲染耗時
  if (window.ChatbotRenderState) {
    var originalRenderState = window.ChatbotRenderState;

    // 包裝 lastRenderDuration 的更新
    Object.defineProperty(window.ChatbotRenderState, 'lastRenderDuration', {
      get: function() {
        return this._lastRenderDuration || 0;
      },
      set: function(value) {
        this._lastRenderDuration = value;
        // 自動記錄到效能監控
        window.PerfMonitor.recordRender(value, 'chatbot_render');
      },
      configurable: true
    });
  }
})();

console.log('[PerfMonitor] 效能監控工具已載入。使用方法：');
console.log('  PerfMonitor.start()    - 啟動監控');
console.log('  PerfMonitor.stop()     - 停止監控');
console.log('  PerfMonitor.getStats() - 檢視統計');
console.log('  PerfMonitor.export()   - 匯出資料');
console.log('  PerfMonitor.clear()    - 清空資料');
