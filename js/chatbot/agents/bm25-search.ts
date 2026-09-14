// js/chatbot/agents/bm25-search.js
// BM25 檢索演算法實現（向量搜尋的降級方案）
(function(window) {
  'use strict';

  /**
   * BM25 (Best Matching 25) 檢索演算法
   * 基於機率資訊檢索模型，考慮詞頻(TF)和逆文件頻率(IDF)
   * 適合作為向量搜尋失敗時的降級方案
   */
  class BM25Search {
    constructor() {
      this.index = null;
      this.documents = [];
      this.avgDocLength = 0;

      // BM25引數（經驗最優值）
      this.k1 = 1.5;  // 詞頻飽和引數（1.2-2.0）
      this.b = 0.75;  // 文件長度歸一化引數（0.5-0.8）
    }

    /**
     * 中文分詞（n-gram + 完整詞保留）
     * @param {string} text - 待分詞文字
     * @returns {Array<string>} 詞語陣列
     */
    tokenize(text) {
      if (!text) return [];

      // 移除標點符號
      const cleaned = text.replace(/[，。！？；：、""''（）《》【】\s]+/g, ' ');

      const tokens = [];

      // 處理中文：生成2-gram, 3-gram, 和單字
      const chineseChars = cleaned.match(/[\u4e00-\u9fa5]/g) || [];

      // 2-gram（如"雷曼"）
      for (let i = 0; i < chineseChars.length - 1; i++) {
        tokens.push(chineseChars[i] + chineseChars[i + 1]);
      }

      // 3-gram（如"雷曼公"、"曼公司"）
      for (let i = 0; i < chineseChars.length - 2; i++) {
        tokens.push(chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2]);
      }

      // 單字（兜底）
      tokens.push(...chineseChars);

      // 提取英文單詞（轉小寫）
      const englishWords = cleaned.match(/[a-zA-Z]+/g) || [];
      tokens.push(...englishWords.map(w => w.toLowerCase()));

      // 提取數字
      const numbers = cleaned.match(/\d+/g) || [];
      tokens.push(...numbers);

      // 不去重：保留重複以反映真實詞頻（TF）
      // 若需限制記憶體，可在此處做頻次上限截斷（例如每詞最多計數 N 次）
      return tokens;
    }

    /**
     * 構建BM25索引
     * @param {Array<Object>} groups - 意群陣列
     */
    buildIndex(groups) {
      if (!groups || groups.length === 0) {
        console.warn('[BM25Search] 輸入意群為空');
        return;
      }

      this.documents = groups.map(g => ({
        id: g.groupId,
        text: this.prepareDocumentText(g),
        tokens: [],
        length: 0,
        metadata: {
          summary: g.summary,
          keywords: g.keywords,
          charCount: g.charCount
        }
      }));

      // 分詞
      this.documents.forEach(doc => {
        doc.tokens = this.tokenize(doc.text);
        doc.length = doc.tokens.length;
      });

      // 計算平均文件長度
      this.avgDocLength = this.documents.reduce((sum, doc) => sum + doc.length, 0) / this.documents.length;

      // 構建倒排索引
      this.index = this.buildInvertedIndex();

      console.log(`[BM25Search] 索引構建完成，文件數: ${this.documents.length}，平均長度: ${this.avgDocLength.toFixed(1)}`);
    }

    /**
     * 準備文件文字（用於索引）
     */
    prepareDocumentText(group) {
      const parts = [];

      // 關鍵詞（權重最高，重複3次）
      if (group.keywords && group.keywords.length > 0) {
        const keywordText = group.keywords.join(' ');
        parts.push(keywordText, keywordText, keywordText);
      }

      // 摘要（權重次之，重複2次）
      if (group.summary) {
        parts.push(group.summary, group.summary);
      }

      // digest（權重正常）
      if (group.digest) {
        parts.push(group.digest.slice(0, 1000)); // 取前1000字
      }

      // 正文兜底：優先使用 text，其次 fullText（較低權重，單次加入）
      // 在 chunks 索引中，text 即為 chunk 正文；在意群中 fullText 為整段內容
      if (group.text && typeof group.text === 'string' && group.text.length > 0) {
        parts.push(group.text.slice(0, 1200));
      } else if (group.fullText && typeof group.fullText === 'string' && group.fullText.length > 0) {
        parts.push(group.fullText.slice(0, 1200));
      }

      return parts.join(' ');
    }

    /**
     * 構建倒排索引
     * @returns {Map} 倒排索引 { term: [{ docIndex, freq }, ...] }
     */
    buildInvertedIndex() {
      const index = new Map();

      this.documents.forEach((doc, docIndex) => {
        // 計算詞頻
        const termFreq = new Map();
        doc.tokens.forEach(token => {
          termFreq.set(token, (termFreq.get(token) || 0) + 1);
        });

        // 更新倒排索引
        termFreq.forEach((freq, term) => {
          if (!index.has(term)) {
            index.set(term, []);
          }
          index.get(term).push({ docIndex, freq });
        });
      });

      return index;
    }

    /**
     * 計算IDF (Inverse Document Frequency)
     * IDF(q) = log((N - df(q) + 0.5) / (df(q) + 0.5) + 1)
     */
    calculateIDF(term) {
      const N = this.documents.length;
      const df = this.index.has(term) ? this.index.get(term).length : 0;
      return Math.log((N - df + 0.5) / (df + 0.5) + 1);
    }

    /**
     * 計算BM25分數
     * BM25(D,Q) = Σ IDF(q) * (f(q,D) * (k1 + 1)) / (f(q,D) + k1 * (1 - b + b * |D| / avgdl))
     */
    calculateBM25Score(docIndex, queryTerms) {
      const doc = this.documents[docIndex];
      let score = 0;

      queryTerms.forEach(term => {
        if (!this.index.has(term)) return;

        const idf = this.calculateIDF(term);

        // 查詢該詞在文件中的頻率
        const postings = this.index.get(term);
        const posting = postings.find(p => p.docIndex === docIndex);

        if (!posting) return;

        const freq = posting.freq;
        const docLength = doc.length;

        // BM25公式
        const numerator = freq * (this.k1 + 1);
        const denominator = freq + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength));

        score += idf * (numerator / denominator);
      });

      return score;
    }

    /**
     * 搜尋
     * @param {string} query - 查詢文字
     * @param {number} topK - 返回top K結果
     * @param {number} threshold - 最低分數閾值（可選）
     * @returns {Array<{id: string, score: number, metadata: Object}>}
     */
    search(query, topK = 5, threshold = 0) {
      if (!this.index || this.documents.length === 0) {
        console.warn('[BM25Search] 索引未構建');
        return [];
      }

      // 分詞
      const queryTerms = this.tokenize(query);
      if (queryTerms.length === 0) {
        console.warn('[BM25Search] 查詢為空');
        return [];
      }

      console.log(`[BM25Search] 查詢詞: ${queryTerms.slice(0, 10).join(', ')}${queryTerms.length > 10 ? '...' : ''}`);

      // 計算所有文件的BM25分數
      const scores = this.documents.map((doc, docIndex) => ({
        id: doc.id,
        score: this.calculateBM25Score(docIndex, queryTerms),
        metadata: doc.metadata
      }));

      // 過濾低分結果
      const filtered = scores.filter(s => s.score > threshold);

      // 排序並返回topK
      filtered.sort((a, b) => b.score - a.score);

      const results = filtered.slice(0, topK);

      console.log(`[BM25Search] 返回 ${results.length} 個結果，分數範圍: ${results[0]?.score.toFixed(3)} - ${results[results.length - 1]?.score.toFixed(3)}`);

      return results;
    }

    /**
     * 關鍵詞精確搜尋（使用n-gram分詞+短語比對加權）
     * @param {Array<string>} keywords - 關鍵詞陣列
     * @param {number} topK - 返回結果數
     * @param {number} threshold - 最低分數閾值
     * @returns {Array<{id: string, score: number, metadata: Object}>}
     */
    searchKeywords(keywords, topK = 5, threshold = 0) {
      if (!this.index || this.documents.length === 0) {
        console.warn('[BM25Search] 索引未構建');
        return [];
      }

      if (!Array.isArray(keywords) || keywords.length === 0) {
        console.warn('[BM25Search] 關鍵詞為空');
        return [];
      }

      const originalKeywords = keywords.filter(kw => kw && typeof kw === 'string' && kw.trim());

      // 對每個關鍵詞生成n-gram查詢詞
      const queryTerms = keywords.flatMap(kw => {
        if (!kw || typeof kw !== 'string') return [];
        const cleaned = kw.trim();
        if (!cleaned) return [];

        const terms = [];

        // 提取中文部分，生成2-gram和3-gram
        const chineseChars = cleaned.match(/[\u4e00-\u9fa5]/g) || [];

        if (chineseChars.length > 0) {
          // 2-gram
          for (let i = 0; i < chineseChars.length - 1; i++) {
            terms.push(chineseChars[i] + chineseChars[i + 1]);
          }

          // 3-gram
          for (let i = 0; i < chineseChars.length - 2; i++) {
            terms.push(chineseChars[i] + chineseChars[i + 1] + chineseChars[i + 2]);
          }

          // 單字
          terms.push(...chineseChars);
        }

        // 提取英文部分（轉小寫）
        const englishMatches = cleaned.match(/[a-zA-Z]+/g) || [];
        terms.push(...englishMatches.map(w => w.toLowerCase()));

        // 提取數字部分
        const numberMatches = cleaned.match(/\d+/g) || [];
        terms.push(...numberMatches);

        return terms;
      });

      if (queryTerms.length === 0) {
        console.warn('[BM25Search] 關鍵詞處理後為空');
        return [];
      }

      console.log(`[BM25Search-Keywords] 原始關鍵詞: ${originalKeywords.join(', ')}`);
      console.log(`[BM25Search-Keywords] 分詞後查詢詞(前10個): ${[...new Set(queryTerms)].slice(0, 10).join(', ')}${queryTerms.length > 10 ? '...' : ''}`);

      // 計算所有文件的BM25分數
      const scores = this.documents.map((doc, docIndex) => {
        const bm25Score = this.calculateBM25Score(docIndex, queryTerms);

        // 短語比對加權：檢查原文是否包含完整關鍵詞
        let phraseBoost = 1.0;
        for (const keyword of originalKeywords) {
          if (doc.text.includes(keyword)) {
            phraseBoost *= 3.0; // 包含完整短語，分數×3.0
          }
        }

        return {
          id: doc.id,
          score: bm25Score * phraseBoost,
          metadata: doc.metadata,
          _phraseBoost: phraseBoost // 用於debug
        };
      });

      // 過濾低分結果
      const filtered = scores.filter(s => s.score > threshold);

      // 排序並返回topK
      filtered.sort((a, b) => b.score - a.score);

      const results = filtered.slice(0, topK);

      if (results.length > 0) {
        const boostedCount = results.filter(r => r._phraseBoost > 1).length;
        console.log(`[BM25Search-Keywords] 返回 ${results.length} 個結果，分數範圍: ${results[0]?.score.toFixed(3)} - ${results[results.length - 1]?.score.toFixed(3)}${boostedCount > 0 ? ` (${boostedCount}個短語加權)` : ''}`);
      } else {
        console.log(`[BM25Search-Keywords] 未找到比對結果`);
      }

      // 移除debug欄位
      results.forEach(r => delete r._phraseBoost);

      return results;
    }

    /**
     * 獲取索引統計資訊
     */
    getStats() {
      if (!this.index) return null;

      return {
        documentCount: this.documents.length,
        termCount: this.index.size,
        avgDocLength: this.avgDocLength.toFixed(1),
        totalTokens: this.documents.reduce((sum, doc) => sum + doc.length, 0)
      };
    }

    /**
     * 清空索引
     */
    clear() {
      this.index = null;
      this.documents = [];
      this.avgDocLength = 0;
      console.log('[BM25Search] 索引已清空');
    }
  }

  /**
   * 意群BM25搜尋引擎（整合到現有系統）
   */
  class SemanticBM25Search {
    constructor() {
      this.bm25 = new BM25Search();
      this.indexedDocId = null;
    }

    /**
     * 為意群建立BM25索引
     */
    indexGroups(groups, docId) {
      if (!groups || groups.length === 0) {
        console.warn('[SemanticBM25Search] 意群為空');
        return;
      }

      this.bm25.buildIndex(groups);
      this.indexedDocId = docId;

      console.log('[SemanticBM25Search] BM25索引建立完成');
    }

    /**
     * 為chunks建立BM25索引
     */
    indexChunks(chunks, docId) {
      if (!chunks || chunks.length === 0) {
        console.warn('[SemanticBM25Search] chunks為空');
        return;
      }

      // 將chunks轉換為類似意群的結構
      const chunkDocs = chunks.map(c => ({
        groupId: c.chunkId, // 使用chunkId作為id
        text: c.text,
        summary: c.text.substring(0, 150), // 前150字作為摘要
        keywords: [], // chunks沒有keywords
        charCount: c.charCount
      }));

      this.bm25.buildIndex(chunkDocs);
      this.indexedDocId = docId;

      console.log(`[SemanticBM25Search] BM25索引建立完成，共 ${chunks.length} 個chunks`);
    }

    /**
     * 搜尋chunks（返回完整chunk物件）
     */
    searchChunks(query, chunks, options = {}) {
      const { topK = 10, threshold = 0.1 } = options;

      // 檢查索引是否存在
      if (!this.bm25.index || this.bm25.documents.length === 0) {
        console.warn('[SemanticBM25Search] 索引未建立，現在建立...');
        const docId = this.getCurrentDocId();
        this.indexChunks(chunks, docId);
      }

      // BM25搜尋
      const results = this.bm25.search(query, topK, threshold);

      // 從chunks中找出對應的完整物件
      const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));
      const matchedChunks = results
        .map(r => {
          const chunk = chunkMap.get(r.id);
          if (chunk) {
            return {
              ...chunk,
              score: r.score
            };
          }
          return null;
        })
        .filter(Boolean);

      return matchedChunks;
    }

    /**
     * 關鍵詞精確搜尋chunks（返回完整chunk物件，不做n-gram拆分）
     */
    searchChunksKeywords(keywords, chunks, options = {}) {
      const { topK = 10, threshold = 0.0 } = options; // 放寬閾值，儘量召回

      // 即時短語優先比對（無需索引）：直接在 chunk 文字里找完整關鍵詞
      const normalizedKeywords = (Array.isArray(keywords) ? keywords : [String(keywords || '')])
        .map(k => (k || '').trim())
        .filter(Boolean);

      const phraseHits = [];
      if (normalizedKeywords.length > 0 && Array.isArray(chunks)) {
        for (const chunk of chunks) {
          const text = String(chunk.text || '');
          if (!text) continue;
          const matched = normalizedKeywords.filter(kw => kw && text.includes(kw));
          if (matched.length > 0) {
            // 簡單打分：完整短語優先，按比對個數和最早出現位置加權
            const firstPos = Math.min(...matched.map(kw => Math.max(0, text.indexOf(kw))));
            const score = 1000 + matched.length * 10 - Math.floor(firstPos / 50);
            phraseHits.push({
              ...chunk,
              score,
              _matchedKeywords: matched
            });
          }
        }

        phraseHits.sort((a, b) => b.score - a.score);
      }

      // 若短語命中已有足量結果，優先返回
      if (phraseHits.length > 0) {
        return phraseHits.slice(0, topK).map(hit => ({
          ...hit,
          matchedKeywords: hit._matchedKeywords
        }));
      }

      // 短語無命中則走 BM25（需要索引）
      if (!this.bm25.index || this.bm25.documents.length === 0) {
        console.warn('[SemanticBM25Search] 索引未建立，現在建立...');
        const docId = this.getCurrentDocId();
        this.indexChunks(chunks, docId);
      }

      const results = this.bm25.searchKeywords(normalizedKeywords, topK, threshold);

      const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));
      const matchedChunks = results
        .map(r => {
          const chunk = chunkMap.get(r.id);
          if (chunk) {
            // 標註比對關鍵詞（便於UI展示）
            const text = String(chunk.text || '');
            const matched = normalizedKeywords.filter(kw => kw && text.includes(kw));
            return {
              ...chunk,
              score: r.score,
              matchedKeywords: matched
            };
          }
          return null;
        })
        .filter(Boolean);

      return matchedChunks;
    }

    /**
     * 搜尋意群（返回完整意群物件）
     */
    search(query, groups, options = {}) {
      const { topK = 8, threshold = 0.1 } = options;

      // 檢查索引是否存在
      if (!this.bm25.index || this.bm25.documents.length === 0) {
        console.warn('[SemanticBM25Search] 索引未建立，現在建立...');
        const docId = this.getCurrentDocId();
        this.indexGroups(groups, docId);
      }

      // BM25搜尋
      const results = this.bm25.search(query, topK, threshold);

      // 從groups中找出對應的完整物件
      const groupMap = new Map(groups.map(g => [g.groupId, g]));
      const matchedGroups = results
        .map(r => groupMap.get(r.id))
        .filter(Boolean);

      return matchedGroups;
    }

    /**
     * 獲取當前文件ID
     */
    getCurrentDocId() {
      if (window.ChatbotCore?.getCurrentDocId) {
        return window.ChatbotCore.getCurrentDocId();
      }
      if (window.data?.id) {
        return window.data.id;
      }
      return 'default';
    }

    /**
     * 清空索引
     */
    clear() {
      this.bm25.clear();
      this.indexedDocId = null;
    }

    /**
     * 獲取統計資訊
     */
    getStats() {
      return this.bm25.getStats();
    }
  }

  // 匯出
  window.BM25Search = BM25Search;
  window.SemanticBM25Search = new SemanticBM25Search();

  console.log('[BM25Search] BM25檢索引擎已載入');

})(window);
