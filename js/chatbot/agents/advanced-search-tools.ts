// js/chatbot/agents/advanced-search-tools.js
// 高階搜尋工具：正規表示式搜尋、布林邏輯搜尋、模糊搜尋
(function(window) {
  'use strict';

  if (window.AdvancedSearchTools) return;

  /**
   * 正規表示式搜尋
   * @param {string} pattern - 正規表示式模式
   * @param {string} text - 要搜尋的文字
   * @param {Object} options - 選項
   * @returns {Array} 比對結果
   */
  function regexSearch(pattern, text, options = {}) {
    const {
      limit = 20,
      context = 2000,
      caseInsensitive = true,
      multiline = true
    } = options;

    if (!pattern || !text) return [];

    const results = [];
    let regex;

    try {
      // 構建正規表示式
      let flags = 'g'; // 全域搜尋
      if (caseInsensitive) flags += 'i';
      if (multiline) flags += 'm';

      regex = new RegExp(pattern, flags);
    } catch (e) {
      console.error('[AdvancedSearchTools] 正規表示式語法錯誤:', e.message);
      throw new Error(`正規表示式語法錯誤: ${e.message}`);
    }

    let match;
    let count = 0;

    // 執行正則比對
    while ((match = regex.exec(text)) !== null && count < limit) {
      const matchText = match[0];
      const matchStart = match.index;
      const matchEnd = matchStart + matchText.length;

      // 提取上下文
      const contextStart = Math.max(0, matchStart - context);
      const contextEnd = Math.min(text.length, matchEnd + context);
      const snippet = text.slice(contextStart, contextEnd);

      results.push({
        match: matchText,
        matchOffset: matchStart,
        matchLength: matchText.length,
        preview: snippet,
        groups: match.slice(1) // 捕獲組
      });

      count++;

      // 防止無限迴圈（零寬度比對）
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }

    return results;
  }

  /**
   * 布林邏輯搜尋
   * 支援 AND, OR, NOT, 括號
   * 示例: "(CNN OR RNN) AND 對比 NOT 影象"
   */
  function booleanSearch(query, text, options = {}) {
    const {
      limit = 20,
      context = 2000,
      caseInsensitive = true
    } = options;

    if (!query || !text) return [];

    try {
      // 解析布林查詢表示式
      const parsedQuery = parseBooleanQuery(query, caseInsensitive);

      // 查詢所有可能的比對位置
      const matches = findBooleanMatches(parsedQuery, text, caseInsensitive);

      // 限制結果數量
      const limitedMatches = matches.slice(0, limit);

      // 為每個比對提取上下文
      return limitedMatches.map(match => {
        const contextStart = Math.max(0, match.position - context);
        const contextEnd = Math.min(text.length, match.position + match.length + context);
        const snippet = text.slice(contextStart, contextEnd);

        return {
          matchOffset: match.position,
          matchLength: match.length,
          preview: snippet,
          matchedTerms: match.matchedTerms,
          relevanceScore: match.score
        };
      });
    } catch (e) {
      console.error('[AdvancedSearchTools] 布林查詢解析錯誤:', e.message);
      throw new Error(`布林查詢語法錯誤: ${e.message}`);
    }
  }

  /**
   * 解析布林查詢表示式
   * 簡化版：支援 AND, OR, NOT 和括號
   */
  function parseBooleanQuery(query, caseInsensitive = true) {
    // 標準化查詢字串
    let normalized = query
      .replace(/\s+AND\s+/gi, ' AND ')
      .replace(/\s+OR\s+/gi, ' OR ')
      .replace(/\s+NOT\s+/gi, ' NOT ')
      .trim();

    // 將查詢解析為詞項和運算子
    const tokens = tokenizeBooleanQuery(normalized);

    return {
      tokens,
      caseInsensitive
    };
  }

  /**
   * 將布林查詢分詞
   */
  function tokenizeBooleanQuery(query) {
    const tokens = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < query.length) {
      const char = query[i];

      if (char === '"') {
        inQuotes = !inQuotes;
        i++;
        continue;
      }

      if (!inQuotes && (char === '(' || char === ')')) {
        if (current.trim()) {
          tokens.push({ type: 'term', value: current.trim() });
          current = '';
        }
        tokens.push({ type: char === '(' ? 'lparen' : 'rparen', value: char });
        i++;
        continue;
      }

      if (!inQuotes && char === ' ') {
        const word = current.trim();
        if (word) {
          if (word === 'AND' || word === 'OR' || word === 'NOT') {
            tokens.push({ type: 'operator', value: word });
          } else {
            tokens.push({ type: 'term', value: word });
          }
          current = '';
        }
        i++;
        continue;
      }

      current += char;
      i++;
    }

    if (current.trim()) {
      const word = current.trim();
      if (word === 'AND' || word === 'OR' || word === 'NOT') {
        tokens.push({ type: 'operator', value: word });
      } else {
        tokens.push({ type: 'term', value: word });
      }
    }

    return tokens;
  }

  /**
   * 查詢滿足布林條件的比對
   */
  function findBooleanMatches(parsedQuery, text, caseInsensitive) {
    const { tokens } = parsedQuery;

    // 簡化實現：先找出所有詞項的位置
    const termPositions = new Map();

    tokens.forEach(token => {
      if (token.type === 'term') {
        const positions = findTermPositions(token.value, text, caseInsensitive);
        termPositions.set(token.value, positions);
      }
    });

    // 評估布林表示式
    const matches = evaluateBooleanExpression(tokens, termPositions, text, caseInsensitive);

    // 按位置排序並去重
    const uniqueMatches = deduplicateMatches(matches);
    uniqueMatches.sort((a, b) => a.position - b.position);

    return uniqueMatches;
  }

  /**
   * 查詢單個詞項在文字中的所有位置
   */
  function findTermPositions(term, text, caseInsensitive) {
    const positions = [];
    const searchText = caseInsensitive ? text.toLowerCase() : text;
    const searchTerm = caseInsensitive ? term.toLowerCase() : term;

    let pos = 0;
    while ((pos = searchText.indexOf(searchTerm, pos)) !== -1) {
      positions.push({
        start: pos,
        end: pos + term.length,
        term: term
      });
      pos += 1;
    }

    return positions;
  }

  /**
   * 評估布林表示式
   * 簡化版：遞迴下降解析
   */
  function evaluateBooleanExpression(tokens, termPositions, text, caseInsensitive) {
    // 簡化實現：處理常見模式
    // 支援: "term1 AND term2", "term1 OR term2", "term1 NOT term2", "(term1 OR term2) AND term3"

    const matches = [];

    // 提取所有必須包含的詞項（AND）
    const mustTerms = [];
    const shouldTerms = [];
    const notTerms = [];

    let currentOperator = 'AND'; // 預設運算子

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'operator') {
        currentOperator = token.value;
      } else if (token.type === 'term') {
        if (currentOperator === 'NOT') {
          notTerms.push(token.value);
          currentOperator = 'AND'; // 重置
        } else if (currentOperator === 'OR') {
          shouldTerms.push(token.value);
        } else {
          mustTerms.push(token.value);
        }
      }
    }

    // 如果沒有 must 詞項，將 should 的第一個作為 must
    if (mustTerms.length === 0 && shouldTerms.length > 0) {
      mustTerms.push(shouldTerms.shift());
    }

    // 查詢同時滿足所有條件的位置
    if (mustTerms.length === 0) {
      return matches;
    }

    // 以第一個 must 詞項為基礎
    const basePositions = termPositions.get(mustTerms[0]) || [];

    basePositions.forEach(basePos => {
      let isValid = true;
      const matchedTerms = [mustTerms[0]];
      let minPos = basePos.start;
      let maxPos = basePos.end;
      let score = 1;

      // 檢查其他 must 詞項是否在附近（視窗範圍內）
      const windowSize = 500; // 500字元視窗

      for (let i = 1; i < mustTerms.length; i++) {
        const term = mustTerms[i];
        const positions = termPositions.get(term) || [];

        // 在視窗範圍內查詢
        const nearbyPos = positions.find(p =>
          Math.abs(p.start - basePos.start) <= windowSize
        );

        if (!nearbyPos) {
          isValid = false;
          break;
        }

        matchedTerms.push(term);
        minPos = Math.min(minPos, nearbyPos.start);
        maxPos = Math.max(maxPos, nearbyPos.end);
        score += 1;
      }

      // 檢查 should 詞項（加分項）
      shouldTerms.forEach(term => {
        const positions = termPositions.get(term) || [];
        const nearbyPos = positions.find(p =>
          Math.abs(p.start - basePos.start) <= windowSize
        );
        if (nearbyPos) {
          matchedTerms.push(term);
          minPos = Math.min(minPos, nearbyPos.start);
          maxPos = Math.max(maxPos, nearbyPos.end);
          score += 0.5;
        }
      });

      // 檢查 not 詞項（排除）
      notTerms.forEach(term => {
        const positions = termPositions.get(term) || [];
        const nearbyPos = positions.find(p =>
          Math.abs(p.start - basePos.start) <= windowSize
        );
        if (nearbyPos) {
          isValid = false;
        }
      });

      if (isValid) {
        matches.push({
          position: minPos,
          length: maxPos - minPos,
          matchedTerms: [...new Set(matchedTerms)],
          score
        });
      }
    });

    return matches;
  }

  /**
   * 去重比對結果
   */
  function deduplicateMatches(matches) {
    const seen = new Set();
    return matches.filter(match => {
      const key = `${match.position}-${match.length}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }


  // 匯出工具
  window.AdvancedSearchTools = {
    regexSearch,
    booleanSearch
  };

  console.log('[AdvancedSearchTools] 高階搜尋工具已載入');

})(window);

