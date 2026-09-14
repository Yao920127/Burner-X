// token-budget.js
// Token預算管理器

(function(window) {
  'use strict';

  /**
   * Token預算管理器
   * 估算並管理token使用
   */
  class TokenBudgetManager {
    constructor(config = {}) {
      this.totalBudget = config.totalBudget || 32000;
      this.allocation = {
        system: config.systemTokens || 2000,
        history: config.historyTokens || 8000,
        context: config.contextTokens || 18000,
        response: config.responseTokens || 4000
      };
    }

    /**
     * 估算文字的token數量（粗略估算）
     * 中文1字≈1.5token，英文1字≈0.25token
     */
    estimate(text) {
      if (!text) return 0;
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const otherChars = text.length - chineseChars;
      return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
    }

    /**
     * 檢查是否超出預算
     */
    isOverBudget(contexts) {
      const total = Object.entries(contexts).reduce((sum, [key, text]) => {
        const allocated = this.allocation[key] || 0;
        const actual = this.estimate(text);
        return sum + Math.min(allocated, actual);
      }, 0);
      return total > this.totalBudget;
    }

    /**
     * 獲取上下文的剩餘token預算
     */
    getRemainingContextBudget(systemPrompt, history) {
      const used = this.estimate(systemPrompt) + this.estimate(history);
      return Math.max(0, this.allocation.context - used);
    }
  }

  // 匯出到全域
  window.TokenBudgetManager = TokenBudgetManager;

  console.log('[TokenBudgetManager] 模組已載入');

})(window);
