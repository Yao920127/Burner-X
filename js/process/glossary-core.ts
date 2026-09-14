// process/glossary.js

/**
 * 翻譯備擇庫（術語庫）比對與注入工具。
 * 提供：
 * - 獲取啟用的術語條目
 * - 在給定文字中比對命中條目
 * - 構建注入到系統提示詞中的術語翻譯指引
 */

// 快取編譯好的正規表示式
let _glossaryRegexCache = null;
let _glossaryRegexVersion = 0;

function _loadEnabledGlossaryEntries() {
  if (typeof loadGlossaryEntries !== 'function') return [];
  const all = loadGlossaryEntries();
  return all.filter(e => e && e.enabled && e.term && e.translation);
}

function _buildRegexMapForEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    const re = _buildRegexForEntry(e.term, !!e.wholeWord, !!e.caseSensitive);
    if (re) {
      map.set(e, re);
    }
  }
  return map;
}

function _getOrBuildRegexMap() {
  const entries = _loadEnabledGlossaryEntries();
  const currentVersion = entries.length + entries.map(e => e.term).join('|');

  if (_glossaryRegexCache && _glossaryRegexVersion === currentVersion) {
    return _glossaryRegexCache;
  }

  _glossaryRegexCache = _buildRegexMapForEntries(entries);
  _glossaryRegexVersion = currentVersion;
  return _glossaryRegexCache;
}

function _buildRegexForEntry(term, wholeWord, caseSensitive) {
  // 基本轉義
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasAsciiWord = /[A-Za-z0-9_]/.test(term);
  const source = esc(term);
  let pattern = source;
  if (wholeWord && hasAsciiWord) {
    // 英文等使用 \b 邊界；對中文不加邊界
    pattern = `\\b${source}\\b`;
  }
  const flags = caseSensitive ? 'g' : 'gi';
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    console.warn('Invalid glossary regex from term:', term, e);
    return null;
  }
}

/**
 * 在文字中查詢命中的術語條目。
 * 使用高效的 Trie 樹多模式比對演算法（O(L+m) 複雜度）
 * @param {string} text
 * @returns {Array<{term:string, translation:string}>}
 */
function getGlossaryMatchesForText(text) {
  if (!text) return [];

  // 優先使用新的高效比對器
  if (typeof findGlossaryMatchesFast === 'function') {
    const matches = findGlossaryMatchesFast(text);
    return _filterAndSortMatches(matches, text);
  }

  // 降級到正規表示式方案
  const regexMap = _getOrBuildRegexMap();
  const matched = [];
  const seen = new Set();

  for (const [entry, regex] of regexMap) {
    if (regex.test(text)) {
      const key = `${entry.term}=>${entry.translation}`;
      if (!seen.has(key)) {
        matched.push({ term: entry.term, translation: entry.translation });
        seen.add(key);
      }
    }
  }
  return _filterAndSortMatches(matched, text);
}

/**
 * 檢查是否應該應用智慧過濾
 * 如果至少有一個啟用的術語庫開啟了智慧過濾，則返回 true
 * @returns {boolean}
 */
function _shouldApplySmartFilter() {
  if (typeof loadGlossarySets !== 'function') return true; // 預設啟用

  const sets = loadGlossarySets();
  const setIds = Object.keys(sets || {});

  // 如果沒有術語庫，預設啟用過濾
  if (setIds.length === 0) return true;

  // 檢查是否至少有一個啟用的術語庫開啟了智慧過濾
  for (const id of setIds) {
    const set = sets[id];
    if (set && set.enabled) {
      // enableSmartFilter 預設為 true（未定義時）
      if (set.enableSmartFilter !== false) {
        return true;
      }
    }
  }

  // 所有啟用的術語庫都禁用了智慧過濾
  return false;
}

/**
 * 過濾和排序比對結果，優先保留重要術語
 * @param {Array} matches - 原始比對結果
 * @returns {Array} 過濾和排序後的比對結果
 */
function _filterAndSortMatches(matches) {
  if (!matches || matches.length === 0) return [];

  // 檢查是否需要智慧過濾
  const shouldApplySmartFilter = _shouldApplySmartFilter();

  if (!shouldApplySmartFilter) {
    // 不應用智慧過濾，只做簡單排序
    return matches.slice().sort((a, b) => {
      return (b.term || '').length - (a.term || '').length;
    });
  }

  // 應用智慧過濾
  // 常見通用詞黑名單（這些詞不應該作為專業術語）
  const COMMON_WORDS_BLACKLIST = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
    'may', 'might', 'must', 'can', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
    'by', 'from', 'as', 'that', 'this', 'these', 'those', 'it', 'its',
    'and', 'or', 'but', 'if', 'so', 'not', 'no', 'yes', 'all', 'any', 'some',
    'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'our', 'their', 'one', 'two', 'three',
    'first', 'second', 'more', 'most', 'other', 'such', 'only', 'own', 'same',
    'up', 'out', 'over', 'under', 'above', 'below', 'between', 'through',
    'during', 'before', 'after', 'since', 'until', 'while', 'about', 'than',
    'also', 'very', 'just', 'here', 'there', 'where', 'when', 'why', 'how',
    'what', 'which', 'who', 'whom', 'whose', 'each', 'every', 'both', 'few',
    'many', 'much', 'several', 'now', 'then', 'always', 'never', 'often',
    'sometimes', 'usually', 'really', 'actually', 'basically', 'generally'
  ]);

  // 常見通用短語黑名單（多片語合但不是專業術語）
  const COMMON_PHRASES_BLACKLIST = new Set([
    'with regard to', 'with respect to', 'in terms of', 'in relation to',
    'with reference to', 'in connection with', 'in accordance with',
    'as a result', 'as a result of', 'in addition to', 'in spite of',
    'as well as', 'as long as', 'as soon as', 'in order to', 'in case of',
    'by means of', 'on behalf of', 'because of', 'instead of', 'in front of',
    'in place of', 'by way of', 'for the sake of', 'at the same time',
    'in the meantime', 'in the end', 'at the end', 'in the beginning',
    'for example', 'for instance', 'such as', 'and so on', 'and so forth',
    'in other words', 'in fact', 'in practice', 'in theory', 'in general',
    'in particular', 'in detail', 'in brief', 'in short', 'in conclusion',
    'on the other hand', 'on the contrary', 'by the way', 'in the way',
    'the situation', 'the case', 'the fact', 'the point', 'the problem',
    'the question', 'the answer', 'the reason', 'the result', 'the purpose',
    'at least', 'at most', 'at first', 'at last', 'at all', 'not at all',
    'as usual', 'as follows', 'as mentioned', 'as noted', 'as shown'
  ]);

  // 過濾邏輯
  const MIN_TERM_LENGTH = 3; // 最小長度提高到 3
  const filtered = matches.filter(m => {
    const term = (m.term || '').toLowerCase().trim();

    // 1. 過濾掉單詞黑名單中的通用詞
    if (COMMON_WORDS_BLACKLIST.has(term)) {
      return false;
    }

    // 2. 過濾掉短語黑名單中的通用短語
    if (COMMON_PHRASES_BLACKLIST.has(term)) {
      return false;
    }

    // 3. 保留長度 >= 3 的術語
    if (term.length < MIN_TERM_LENGTH) {
      // 除非是中文術語（中文術語可以更短）
      if (!/[\u4e00-\u9fa5]/.test(term)) {
        return false;
      }
    }

    // 4. 過濾掉純數字
    if (/^\d+$/.test(term)) {
      return false;
    }

    // 5. 保留包含大寫字母的術語（可能是縮寫或專有名詞，如 API, NASA）
    if (/[A-Z]/.test(m.term)) {
      return true;
    }

    // 6. 保留多個單片語成的短語（更可能是專業術語）
    // 但需要檢查是否包含過多常用詞
    if (/\s/.test(term)) {
      const words = term.split(/\s+/);
      const commonWordCount = words.filter(w => COMMON_WORDS_BLACKLIST.has(w)).length;
      // 如果超過一半是常用詞，則過濾掉
      if (commonWordCount > words.length / 2) {
        return false;
      }
      return true;
    }

    // 7. 保留包含連字元或特殊字元的術語（如 machine-learning, AI/ML）
    if (/[-_\/]/.test(term)) {
      return true;
    }

    return true;
  });

  // 計算術語的"重要性得分"並排序
  const scored = filtered.map(m => {
    let score = 0;
    const term = m.term || '';

    // 長度越長，得分越高（長術語通常更專業）
    score += term.length * 2;

    // 包含大寫字母（縮寫、專有名詞）+20
    if (/[A-Z]/.test(term)) {
      score += 20;
    }

    // 多詞短語 +30
    if (/\s/.test(term)) {
      score += 30;
    }

    // 包含特殊字元 +10
    if (/[-_\/]/.test(term)) {
      score += 10;
    }

    // 中文術語 +15
    if (/[\u4e00-\u9fa5]/.test(term)) {
      score += 15;
    }

    return { ...m, _score: score };
  });

  // 按得分降序排序
  scored.sort((a, b) => b._score - a._score);

  // 移除得分屬性並返回
  return scored.map(({ _score, ...rest }) => rest);
}

/**
 * 構建注入系統提示詞的術語指引段落。
 * 僅對當前分塊/表格生效，控制模型按指定譯法統一翻譯。
 * @param {Array<{term:string, translation:string}>} matches
 * @param {string} targetLangName - 目標語言展示名（可直接使用 settings 的 targetLanguage 值或使用者自定義）
 */
function buildGlossaryInstruction(matches, targetLangName) {
  if (!matches || matches.length === 0) return '';

  // 獲取數量限制配置（檢查所有啟用的術語庫，取最小值）
  let maxTerms = 50; // 預設值
  if (typeof loadGlossarySets === 'function') {
    const sets = loadGlossarySets();
    const setIds = Object.keys(sets || {});
    for (const id of setIds) {
      const set = sets[id];
      if (set && set.enabled && set.maxTermsInPrompt) {
        maxTerms = Math.max(1, Math.min(500, set.maxTermsInPrompt));
        break; // 使用第一個啟用的術語庫的配置
      }
    }
  }

  // 限制術語數量
  const limitedMatches = matches.slice(0, maxTerms);

  const items = limitedMatches.map(m => `${m.term}→${m.translation}`).join('、');

  return `[術語參考] ${items}

注：以上為本段可能涉及的專業術語建議譯法，僅供參考。請以自然流暢的翻譯為主，適當參考術語建議即可。`;
}

// 掛載到 processModule
if (typeof processModule !== 'undefined') {
  processModule.getGlossaryMatchesForText = getGlossaryMatchesForText;
  processModule.buildGlossaryInstruction = buildGlossaryInstruction;
}
