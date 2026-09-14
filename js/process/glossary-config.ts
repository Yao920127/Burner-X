// process/glossary-config.js
/**
 * 術語庫效能配置與最佳化工具
 */

/**
 * 根據裝置效能動態調整並行數
 */
function getOptimalConcurrency(userConcurrency) {
  // 檢測裝置記憶體
  const memory = navigator.deviceMemory || 4; // GB，預設 4GB

  // 檢測術語庫規模
  const termCount = (typeof loadGlossaryEntries === 'function')
    ? loadGlossaryEntries().filter(e => e.enabled).length
    : 0;

  // 根據術語數和記憶體計算推薦並行
  let recommended;
  if (termCount > 50000) {
    // 大型術語庫：降低並行
    recommended = memory >= 4 ? 30 : memory >= 2 ? 15 : 8;
  } else if (termCount > 10000) {
    // 中型術語庫
    recommended = memory >= 4 ? 50 : memory >= 2 ? 25 : 10;
  } else {
    // 小型術語庫：不限制
    recommended = memory >= 4 ? 100 : memory >= 2 ? 50 : 20;
  }

  // 不超過使用者設定
  return Math.min(userConcurrency, recommended);
}

/**
 * 獲取術語庫效能統計
 */
function getGlossaryStats() {
  if (typeof loadGlossaryEntries !== 'function') {
    return { enabled: 0, total: 0, memoryMB: 0 };
  }

  const all = loadGlossaryEntries();
  const enabled = all.filter(e => e && e.enabled && e.term && e.translation);

  // 估算記憶體佔用
  const avgTermLength = enabled.reduce((sum, e) => sum + (e.term.length + e.translation.length), 0) / (enabled.length || 1);
  const estimatedMemoryMB = Math.ceil((
    enabled.length * avgTermLength * 2 + // 術語內容
    enabled.length * 125 // Trie 節點
  ) / 1024 / 1024);

  return {
    total: all.length,
    enabled: enabled.length,
    memoryMB: estimatedMemoryMB,
    avgTermLength: Math.round(avgTermLength)
  };
}

/**
 * 檢查是否應啟用術語庫（效能預警）
 */
function shouldEnableGlossary() {
  const stats = getGlossaryStats();

  // 無術語時禁用
  if (stats.enabled === 0) return { enabled: false, reason: 'no_terms' };

  // 檢查記憶體
  const memory = navigator.deviceMemory || 4;
  if (stats.memoryMB > memory * 100) {
    // 術語庫佔用超過裝置記憶體的 10%
    return {
      enabled: false,
      reason: 'memory_limit',
      message: `術語庫需要 ${stats.memoryMB}MB 記憶體，超出裝置承受能力`
    };
  }

  return { enabled: true, stats };
}

/**
 * 顯示效能建議
 */
function showPerformanceRecommendation(concurrency, blockCount) {
  const stats = getGlossaryStats();
  if (stats.enabled === 0) return;

  const optimal = getOptimalConcurrency(concurrency);

  if (optimal < concurrency && stats.enabled > 10000) {
    console.warn(
      `[術語庫效能建議] 當前有 ${stats.enabled} 條術語，` +
      `建議將並行從 ${concurrency} 降至 ${optimal}，` +
      `以獲得最佳效能和穩定性。`
    );
  }

  // 估算耗時
  const matchTimePerBlock = stats.enabled > 50000 ? 100 : stats.enabled > 10000 ? 77 : 50; // ms
  const totalMatchTime = Math.ceil(blockCount * matchTimePerBlock / Math.min(concurrency, optimal) / 1000);

  console.info(
    `[術語庫效能預估] ${stats.enabled} 條術語 × ${blockCount} 個塊，` +
    `預計術語比對耗時: ${totalMatchTime} 秒 (並行 ${Math.min(concurrency, optimal)})`
  );
}

// 匯出到全域
if (typeof window !== 'undefined') {
  window.glossaryConfig = {
    getOptimalConcurrency,
    getGlossaryStats,
    shouldEnableGlossary,
    showPerformanceRecommendation
  };
}
