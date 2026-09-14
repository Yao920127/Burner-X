// js/chatbot/core/smart-granularity-selector.js
// 智慧粒度選擇器 - 根據問題型別和意群特徵自動選擇最佳粒度
(function(window) {
  'use strict';

  /**
   * 問題型別分類
   * - overview: 概覽性問題（需要summary）
   * - specific: 具體細節問題（需要digest或full）
   * - extraction: 資訊提取問題（需要full）
   * - analytical: 分析性問題（需要digest）
   */
  const QUERY_PATTERNS = {
    overview: [
      /總結|概括|概述|簡述|大意|主要內容|主題|講.*什麼|關於什麼/,
      /整體|全文|全部|所有|overall|summary|general/i,
      /介紹|背景|目的|意義|作用/,
      /有哪些|包括.*什麼|涉及.*什麼/
    ],
    extraction: [
      /具體|詳細|準確|精確|原文|exact|specific|detail/i,
      /資料|數值|數字|結果|table|figure|chart/i,
      /步驟|流程|過程|方法|algorithm|procedure/i,
      /公式|方程|equation|formula/,
      /參考|citation|reference|出處/,
      /程式碼|code|實現|implementation/
    ],
    analytical: [
      /分析|解釋|說明|explain|analyze|why|how/i,
      /原因|理由|依據|根據|原理|機制/,
      /比較|對比|區別|差異|聯絡|關係|compare/i,
      /優缺點|利弊|advantage|disadvantage/,
      /影響|作用|效果|impact|effect/
    ]
  };

  /**
   * 粒度選擇規則
   * - summary: 摘要（80字）- 用於快速瀏覽、索引比對
   * - digest: 精要（1000字）- 用於一般性分析、問答
   * - full: 全文（完整文字）- 用於精確查詢、詳細分析
   */
  const GRANULARITY_RULES = {
    overview: {
      default: 'summary',
      maxGroups: 10,  // 概覽問題可以返回更多意群
      description: '概覽性查詢：使用摘要快速掃描'
    },
    analytical: {
      default: 'digest',
      maxGroups: 5,
      description: '分析性查詢：使用精要提供足夠細節'
    },
    extraction: {
      default: 'full',
      maxGroups: 3,  // 精確查詢限制意群數量，避免上下文過長
      description: '提取性查詢：使用全文確保資訊完整'
    },
    specific: {
      default: 'digest',
      maxGroups: 5,
      description: '具體性查詢：使用精要平衡細節與長度'
    }
  };

  /**
   * 分析查詢型別
   * @param {string} query - 使用者查詢
   * @returns {string} 查詢型別 (overview/analytical/extraction/specific)
   */
  function analyzeQueryType(query) {
    const q = String(query || '').trim();
    if (!q) return 'specific';

    // 檢查各型別模式
    for (const [type, patterns] of Object.entries(QUERY_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(q)) {
          return type;
        }
      }
    }

    // 預設使用specific型別
    return 'specific';
  }

  /**
   * 根據意群特徵調整粒度
   * @param {Object} group - 意群物件
   * @param {string} baseGranularity - 基礎粒度
   * @returns {string} 調整後的粒度
   */
  function adjustByGroupFeatures(group, baseGranularity) {
    if (!group) return baseGranularity;

    const charCount = group.charCount || 0;
    const hasDigest = !!(group.digest && group.digest.length > 100);
    const hasFull = !!(group.fullText && group.fullText.length > 500);

    // 如果意群本身很短（<2000字），直接使用full
    if (charCount < 2000 && hasFull) {
      return 'full';
    }

    // 如果沒有digest，降級到summary或升級到full
    if (!hasDigest) {
      if (baseGranularity === 'digest') {
        return hasFull ? 'full' : 'summary';
      }
    }

    // 如果沒有full，digest是最高粒度
    if (!hasFull && baseGranularity === 'full') {
      return hasDigest ? 'digest' : 'summary';
    }

    return baseGranularity;
  }

  /**
   * 智慧選擇粒度
   * @param {string} query - 使用者查詢
   * @param {Array} groups - 候選意群列表
   * @param {Object} options - 選項
   * @returns {Object} { granularity, maxGroups, queryType, reasoning }
   */
  function selectGranularity(query, groups = [], options = {}) {
    // 分析查詢型別
    const queryType = analyzeQueryType(query);
    const rule = GRANULARITY_RULES[queryType] || GRANULARITY_RULES.specific;

    let granularity = options.forceGranularity || rule.default;
    let maxGroups = options.maxGroups || rule.maxGroups;

    // 如果候選意群少，可以使用更高粒度
    if (groups.length <= 2 && granularity === 'summary') {
      granularity = 'digest';
    } else if (groups.length === 1 && granularity !== 'full') {
      granularity = 'full';
    }

    // Token限制檢查
    const estimatedTokens = estimateTokenUsage(groups.slice(0, maxGroups), granularity);
    if (options.maxTokens && estimatedTokens > options.maxTokens) {
      // Token超限，降級粒度或減少意群數
      if (granularity === 'full') {
        granularity = 'digest';
      } else if (granularity === 'digest' && estimatedTokens > options.maxTokens * 1.5) {
        granularity = 'summary';
      } else {
        // 減少意群數量
        maxGroups = Math.max(1, Math.floor(maxGroups * 0.6));
      }
    }

    return {
      granularity,
      maxGroups,
      queryType,
      reasoning: rule.description,
      estimatedTokens: estimateTokenUsage(groups.slice(0, maxGroups), granularity)
    };
  }

  /**
   * 估算Token使用量
   * @param {Array} groups - 意群列表
   * @param {string} granularity - 粒度
   * @returns {number} 估算的token數
   */
  function estimateTokenUsage(groups, granularity) {
    if (!Array.isArray(groups) || groups.length === 0) return 0;

    let totalChars = 0;
    groups.forEach(g => {
      if (granularity === 'summary') {
        totalChars += (g.summary || '').length;
      } else if (granularity === 'digest') {
        totalChars += (g.digest || '').length;
      } else if (granularity === 'full') {
        totalChars += g.charCount || (g.fullText || '').length;
      }
    });

    // 中文平均1.5字元=1token，英文平均4字元=1token
    // 這裡簡化為平均2字元=1token
    return Math.ceil(totalChars / 2);
  }

  /**
   * 批次選擇意群的粒度（支援混合粒度）
   * @param {string} query - 使用者查詢
   * @param {Array} rankedGroups - 已排序的候選意群（相關性從高到低）
   * @param {Object} options - 選項
   * @returns {Array} [ { group, granularity, score } ]
   */
  function selectMixedGranularity(query, rankedGroups = [], options = {}) {
    const queryType = analyzeQueryType(query);
    const baseRule = GRANULARITY_RULES[queryType] || GRANULARITY_RULES.specific;

    const maxTokens = options.maxTokens || 8000;
    const result = [];
    let accumulatedTokens = 0;

    for (let i = 0; i < rankedGroups.length; i++) {
      const item = rankedGroups[i];
      const group = item.group || item;
      const score = item.score || 1.0;

      // 排名越靠前，使用越高粒度
      let granularity;
      if (i === 0) {
        // 最相關的意群：使用最高粒度
        granularity = queryType === 'overview' ? 'digest' : 'full';
      } else if (i < 3) {
        // 前3個意群：使用中等粒度
        granularity = baseRule.default;
      } else {
        // 其他意群：使用低粒度
        granularity = 'summary';
      }

      // 根據意群特徵調整
      granularity = adjustByGroupFeatures(group, granularity);

      // 估算token
      const tokens = estimateTokenUsage([group], granularity);

      // 檢查是否會超限
      if (accumulatedTokens + tokens > maxTokens) {
        // 嘗試降級
        if (granularity === 'full') {
          granularity = 'digest';
        } else if (granularity === 'digest') {
          granularity = 'summary';
        } else {
          // 已經是summary，無法繼續新增
          break;
        }
      }

      const finalTokens = estimateTokenUsage([group], granularity);
      if (accumulatedTokens + finalTokens > maxTokens) {
        break; // 無法新增更多意群
      }

      accumulatedTokens += finalTokens;
      result.push({
        group,
        granularity,
        score,
        tokens: finalTokens
      });

      // 檢查是否已有足夠的意群
      if (result.length >= (baseRule.maxGroups || 5)) {
        break;
      }
    }

    return result;
  }

  /**
   * 構建混合粒度上下文
   * @param {Array} selections - selectMixedGranularity的結果
   * @returns {string} 組合後的上下文文字
   */
  function buildMixedContext(selections) {
    if (!Array.isArray(selections) || selections.length === 0) return '';

    const parts = [];
    selections.forEach(sel => {
      const g = sel.group;
      const gran = sel.granularity;

      let text = '';
      if (gran === 'summary') {
        text = g.summary || '';
      } else if (gran === 'digest') {
        text = g.digest || g.summary || '';
      } else if (gran === 'full') {
        text = g.fullText || g.digest || g.summary || '';
      }

      if (text) {
        const keywords = (g.keywords || []).join('、');
        parts.push(`【${g.groupId} - ${gran}】\n關鍵詞: ${keywords}\n內容:\n${text}`);
      }
    });

    return parts.join('\n\n');
  }

  // 匯出
  window.SmartGranularitySelector = {
    analyzeQueryType,
    selectGranularity,
    selectMixedGranularity,
    buildMixedContext,
    estimateTokenUsage,
    adjustByGroupFeatures,
    // 暴露規則以便測試和調整
    GRANULARITY_RULES,
    QUERY_PATTERNS
  };

  console.log('[SmartGranularitySelector] 智慧粒度選擇器已載入');

})(window);
