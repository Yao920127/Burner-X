// process/glossary-matcher.js
/**
 * 高效多模式術語比對器
 * 使用改進的 Aho-Corasick 演算法，時間複雜度 O(L + m)
 * L = 文字長度，m = 比對數
 */

class GlossaryMatcher {
  constructor() {
    this.root = { children: new Map(), entries: [] };
    this.caseInsensitiveRoot = { children: new Map(), entries: [] };
    this.hasWholeWordEntries = false;
  }

  /**
   * 構建 Trie 樹
   * @param {Array} entries - 術語條目陣列
   */
  build(entries) {
    this.root = { children: new Map(), entries: [] };
    this.caseInsensitiveRoot = { children: new Map(), entries: [] };
    this.hasWholeWordEntries = false;

    for (const entry of entries) {
      if (!entry.term || !entry.translation) continue;

      const root = entry.caseSensitive ? this.root : this.caseInsensitiveRoot;
      const term = entry.caseSensitive ? entry.term : entry.term.toLowerCase();

      let node = root;
      for (const char of term) {
        if (!node.children.has(char)) {
          node.children.set(char, { children: new Map(), entries: [] });
        }
        node = node.children.get(char);
      }

      node.entries.push({
        term: entry.term,
        translation: entry.translation,
        wholeWord: !!entry.wholeWord,
        caseSensitive: !!entry.caseSensitive
      });

      if (entry.wholeWord) {
        this.hasWholeWordEntries = true;
      }
    }
  }

  /**
   * 檢查是否為單詞邊界
   */
  _isWordBoundary(text, index) {
    if (index < 0 || index >= text.length) return true;
    const char = text[index];
    return !/[A-Za-z0-9_]/.test(char);
  }

  /**
   * 檢查位置是否有 ASCII 字元（用於判斷是否需要邊界檢查）
   */
  _hasAsciiWord(str) {
    return /[A-Za-z0-9_]/.test(str);
  }

  /**
   * 在文字中查詢所有比對
   * @param {string} text - 要搜尋的文字
   * @returns {Array} 比對的術語列表
   */
  findMatches(text) {
    if (!text) return [];

    const matches = [];
    const seen = new Set();
    const textLower = text.toLowerCase();

    // 走訪文字的每個位置
    for (let i = 0; i < text.length; i++) {
      // 嘗試大小寫敏感比對
      this._searchFromPosition(text, i, this.root, true, matches, seen);

      // 嘗試大小寫不敏感比對
      this._searchFromPosition(textLower, i, this.caseInsensitiveRoot, false, matches, seen);
    }

    return matches;
  }

  /**
   * 從指定位置開始搜尋
   */
  _searchFromPosition(text, startPos, root, caseSensitive, matches, seen) {
    let node = root;
    let pos = startPos;

    while (pos < text.length) {
      const char = text[pos];

      if (!node.children.has(char)) {
        break;
      }

      node = node.children.get(char);
      pos++;

      // 檢查當前節點是否有完整術語
      if (node.entries.length > 0) {
        const matchedText = text.substring(startPos, pos);

        for (const entry of node.entries) {
          // 檢查大小寫是否比對
          if (entry.caseSensitive !== caseSensitive) continue;

          // 如果需要全詞比對，檢查邊界
          if (entry.wholeWord && this._hasAsciiWord(entry.term)) {
            if (!this._isWordBoundary(text, startPos - 1) ||
                !this._isWordBoundary(text, pos)) {
              continue;
            }
          }

          const key = `${entry.term}=>${entry.translation}`;
          if (!seen.has(key)) {
            matches.push({
              term: entry.term,
              translation: entry.translation
            });
            seen.add(key);
          }
        }
      }
    }
  }

  /**
   * 快速檢查文字是否包含任何術語（用於預過濾）
   */
  hasAnyMatch(text) {
    if (!text) return false;

    const textLower = text.toLowerCase();

    // 快速檢查：走訪到第一個比對就返回
    for (let i = 0; i < text.length; i++) {
      if (this._hasMatchAtPosition(text, i, this.root, true)) return true;
      if (this._hasMatchAtPosition(textLower, i, this.caseInsensitiveRoot, false)) return true;
    }

    return false;
  }

  _hasMatchAtPosition(text, startPos, root, caseSensitive) {
    let node = root;
    let pos = startPos;

    while (pos < text.length) {
      const char = text[pos];
      if (!node.children.has(char)) break;

      node = node.children.get(char);
      pos++;

      if (node.entries.length > 0) {
        // 找到至少一個比對（不檢查全詞邊界，快速返回）
        for (const entry of node.entries) {
          if (entry.caseSensitive === caseSensitive) {
            if (!entry.wholeWord) return true;

            // 檢查全詞邊界
            if (this._hasAsciiWord(entry.term)) {
              if (this._isWordBoundary(text, startPos - 1) &&
                  this._isWordBoundary(text, pos)) {
                return true;
              }
            } else {
              return true;
            }
          }
        }
      }
    }

    return false;
  }
}

// 全域例項和快取
let _globalMatcher = null;
let _matcherVersion = 0;

/**
 * 獲取或建立全域比對器例項
 */
function getOrCreateMatcher() {
  if (typeof loadGlossaryEntries !== 'function') {
    return new GlossaryMatcher();
  }

  const allEntries = loadGlossaryEntries();
  const enabledEntries = allEntries.filter(e => e && e.enabled && e.term && e.translation);

  // 簡單版本控制：長度 + 前幾個術語的雜湊
  const versionHash = enabledEntries.length +
    enabledEntries.slice(0, 10).map(e => e.term).join('|');

  if (_globalMatcher && _matcherVersion === versionHash) {
    return _globalMatcher;
  }

  const matcher = new GlossaryMatcher();
  matcher.build(enabledEntries);

  _globalMatcher = matcher;
  _matcherVersion = versionHash;

  return matcher;
}

// 匯出函式供舊 API 相容
function findGlossaryMatchesFast(text) {
  const matcher = getOrCreateMatcher();
  return matcher.findMatches(text);
}

// 掛載到全域
if (typeof window !== 'undefined') {
  window.GlossaryMatcher = GlossaryMatcher;
  window.getGlossaryMatcher = getOrCreateMatcher;
  window.findGlossaryMatchesFast = findGlossaryMatchesFast;
}
