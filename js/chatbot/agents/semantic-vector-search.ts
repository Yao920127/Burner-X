// js/chatbot/agents/semantic-vector-search.js
// 意群向量搜尋整合層
(function(window) {
  'use strict';

  /**
   * 意群向量搜尋引擎
   * 整合 EmbeddingClient 和 VectorStore
   */
  class SemanticVectorSearch {
    constructor() {
      this.vectorStore = null;
      this.initialized = false;
      this.indexedDocs = new Set(); // 已建立索引的文件ID
      this._rerankLoading = null; // 懶載入 RerankClient
    }

    /**
     * 初始化（檢查配置）
     */
    async init() {
      if (this.initialized) return true;

      // 檢查依賴
      if (!window.EmbeddingClient || !window.VectorStore) {
        console.warn('[SemanticVectorSearch] 依賴未載入');
        return false;
      }

      // 檢查Embedding配置
      if (!window.EmbeddingClient.config.enabled || !window.EmbeddingClient.config.apiKey) {
        console.warn('[SemanticVectorSearch] Embedding API未配置');
        return false;
      }

      this.initialized = true;
      return true;
    }

    /**
     * 為意群建立向量索引
     * @param {Array<Object>} groups - 意群陣列
     * @param {string} docId - 文件ID
     * @param {Object} options - 選項
     */
    async indexGroups(groups, docId, options = {}) {
      const { showProgress = true, forceRebuild = false } = options;

      if (!await this.init()) {
        throw new Error('向量搜尋未初始化');
      }

      // 檢查是否已索引
      if (this.indexedDocs.has(docId) && !forceRebuild) {
        console.log(`[SemanticVectorSearch] 文件 ${docId} 已建立索引，跳過`);
        return;
      }

      // 建立或獲取VectorStore
      if (!this.vectorStore || this.vectorStore.namespace !== docId) {
        this.vectorStore = new window.VectorStore(docId);
        await this.vectorStore.init();
      }

      if (showProgress && window.ChatbotUtils?.showToast) {
        window.ChatbotUtils.showToast('正在建立向量索引...', 'info', 3000);
      }

      try {
        // 準備文字：關鍵詞 + 摘要 + 完整digest
        const texts = groups.map(g => {
          const keywords = (g.keywords || []).join(' ');
          const summary = g.summary || '';
          const digest = g.digest || ''; // 使用完整digest，不截斷
          return `${keywords}\n${summary}\n${digest}`.trim();
        });

        console.log(`[SemanticVectorSearch] 開始生成 ${texts.length} 個向量...`);

        // 批次生成向量
        const vectors = await window.EmbeddingClient.batchEmbed(texts);

        // 批次儲存（過濾失敗的向量）
        const items = [];
        let skipped = 0;
        groups.forEach((g, idx) => {
          const vec = vectors[idx];
          if (!Array.isArray(vec)) { skipped++; return; }
          items.push({
            id: g.groupId,
            vector: vec,
            metadata: {
              docId: docId,
              groupId: g.groupId,
              charCount: g.charCount,
              keywords: g.keywords,
              summary: g.summary,
              segments: g.segments
            }
          });
        });

        await this.vectorStore.batchUpsert(items);

        // 載入到記憶體索引
        await this.vectorStore.loadMemoryIndex();

        this.indexedDocs.add(docId);

        console.log(`[SemanticVectorSearch] 向量索引建立完成，共 ${items.length} 個意群${skipped>0?`（跳過 ${skipped} 個失敗向量）`:''}`);

        if (showProgress && window.ChatbotUtils?.showToast) {
          window.ChatbotUtils.showToast('向量索引建立完成', 'success', 2000);
        }

        // 儲存索引狀態到 window.data
        if (window.data) {
          window.data.vectorIndexReady = true;
          window.data.vectorIndexTimestamp = Date.now();
        }

      } catch (error) {
        console.error('[SemanticVectorSearch] 建立索引失敗:', error);
        if (showProgress && window.ChatbotUtils?.showToast) {
          window.ChatbotUtils.showToast('向量索引建立失敗', 'error', 3000);
        }
        throw error;
      }
    }

    /**
     * 為chunks建立向量索引（新版）
     * @param {Array<Object>} chunks - enrichedChunks陣列
     * @param {string} docId - 文件ID
     * @param {Object} options - 選項
     */
    async indexChunks(chunks, docId, options = {}) {
      const { showProgress = true, forceRebuild = false } = options;

      if (!await this.init()) {
        throw new Error('向量搜尋未初始化');
      }

      // 建立或獲取VectorStore
      if (!this.vectorStore || this.vectorStore.namespace !== docId) {
        this.vectorStore = new window.VectorStore(docId);
        await this.vectorStore.init();
      }

      // 檢查IndexedDB中是否已有向量（而不是僅檢查記憶體）
      if (!forceRebuild) {
        try {
          await this.vectorStore.loadMemoryIndex();
          const existingCount = this.vectorStore.memoryIndex?.length || 0;

          // 如果向量數量比對，說明已索引，直接使用
          if (existingCount === chunks.length) {
            console.log(`[SemanticVectorSearch] 文件 ${docId} 已有 ${existingCount} 個向量快取，直接使用`);
            this.indexedDocs.add(docId);

            if (window.data) {
              window.data.vectorIndexReady = true;
              window.data.vectorIndexTimestamp = Date.now();
            }

            if (showProgress && window.ChatbotUtils?.showToast) {
              window.ChatbotUtils.showToast('向量索引已就緒（從快取載入）', 'success', 2000);
            }

            return;
          } else if (existingCount > 0) {
            console.warn(`[SemanticVectorSearch] 向量數量不比對（快取${existingCount}個，當前${chunks.length}個），重新生成`);
          }
        } catch (err) {
          console.warn('[SemanticVectorSearch] 載入向量快取失敗，將重新生成:', err);
        }
      }

      // 建立進度toast
      let progressToast = null;
      if (showProgress && window.ChatbotUtils && typeof window.ChatbotUtils.showProgressToast === 'function') {
        progressToast = window.ChatbotUtils.showProgressToast('開始生成向量索引...', 0);
      }

      try {
        // 準備文字：直接使用chunk的text
        const texts = chunks.map(c => c.text);

        console.log(`[SemanticVectorSearch] 開始生成 ${texts.length} 個chunk向量...`);

        // 批次生成向量（帶進度回撥）
        const vectors = await window.EmbeddingClient.batchEmbed(texts, {
          onProgress: (current, total, message) => {
            const percent = Math.round((current / total) * 100);
            if (progressToast && typeof progressToast.update === 'function') {
              progressToast.update(`${message} (${percent}%)`, percent);
            }
            console.log(`[SemanticVectorSearch] 向量生成進度: ${current}/${total} (${percent}%)`);
          }
        });

        // 批次儲存（過濾失敗的向量）
        const items = [];
        let skipped = 0;
        chunks.forEach((chunk, idx) => {
          const vec = vectors[idx];
          if (!Array.isArray(vec)) { skipped++; return; }
          items.push({
            id: chunk.chunkId,
            vector: vec,
            metadata: {
              docId: docId,
              chunkId: chunk.chunkId,
              belongsToGroup: chunk.belongsToGroup,
              position: chunk.position,
              charCount: chunk.charCount,
              text: (chunk.text || '').substring(0, 200) // 只儲存前200字作為預覽
            }
          });
        });

        await this.vectorStore.batchUpsert(items);

        // 載入到記憶體索引
        await this.vectorStore.loadMemoryIndex();

        this.indexedDocs.add(docId);

        console.log(`[SemanticVectorSearch] 向量索引建立完成，共 ${items.length} 個chunks${skipped>0?`（跳過 ${skipped} 個失敗向量）`:''}`);

        // 關閉進度toast，顯示成功提示
        if (progressToast && typeof progressToast.close === 'function') {
          progressToast.close();
        }
        if (showProgress && window.ChatbotUtils?.showToast) {
          window.ChatbotUtils.showToast('向量索引建立完成', 'success', 2000);
        }

        // 儲存索引狀態到 window.data
        if (window.data) {
          window.data.vectorIndexReady = true;
          window.data.vectorIndexTimestamp = Date.now();
        }

      } catch (error) {
        console.error('[SemanticVectorSearch] 建立索引失敗:', error);

        // 關閉進度toast
        if (progressToast && typeof progressToast.close === 'function') {
          progressToast.close();
        }

        if (showProgress && window.ChatbotUtils?.showToast) {
          window.ChatbotUtils.showToast('向量索引建立失敗', 'error', 3000);
        }
        throw error;
      }
    }

    /**
     * 向量檢索chunks（純向量搜尋，不做降級）
     * @param {string} query - 使用者查詢
     * @param {Array<Object>} chunks - enrichedChunks陣列（用於返回完整chunk物件）
     * @param {Object} options - 選項
     * @returns {Promise<Array<Object>>} 比對的chunks
     */
    async search(query, chunks = [], options = {}) {
      const { topK = 10, threshold = 0.3 } = options;

      if (!await this.init()) {
        console.warn('[SemanticVectorSearch] 向量搜尋未初始化');
        return [];
      }

      const docId = this.getCurrentDocId();

      // 確保有VectorStore
      if (!this.vectorStore || this.vectorStore.namespace !== docId) {
        this.vectorStore = new window.VectorStore(docId);
        await this.vectorStore.init();
      }

      // 檢查索引是否存在
      const stats = await this.vectorStore.stats();
      if (stats.count === 0) {
        console.warn('[SemanticVectorSearch] 索引為空');
        return [];
      }

      try {
        // 生成查詢向量
        const queryVector = await window.EmbeddingClient.embed(query);

        // 向量檢索
        const results = await this.vectorStore.search(queryVector, topK);

        // 過濾低分結果
        const filtered = results.filter(r => r.score >= threshold);

        console.log(`[SemanticVectorSearch] 向量檢索比對 ${filtered.length} 個chunks，分數範圍: ${filtered[0]?.score.toFixed(3)} - ${filtered[filtered.length - 1]?.score.toFixed(3)}`);

        // 從chunks中找出對應的完整chunk物件
        const chunkMap = new Map(chunks.map(c => [c.chunkId, c]));
        const matchedChunks = filtered
          .map(r => {
            const chunk = chunkMap.get(r.metadata.chunkId);
            if (chunk) {
              return {
                ...chunk,
                score: r.score
              };
            }
            return null;
          })
          .filter(Boolean)
          .slice(0, topK);

        // 嘗試使用重排（如果啟用）
        // 若尚未載入 RerankClient，嘗試懶載入一次
        if (!window.RerankClient) {
          await this._ensureRerankClientLoaded();
        }
        // 診斷日誌：列印是否載入、觸發條件與精簡配置
        (function(){
          try {
            const hasRerank = !!window.RerankClient;
            const should = hasRerank ? window.RerankClient.shouldRerank('vector') : false;
            const cfg = hasRerank ? window.RerankClient.config || {} : {};
            console.log('[SemanticVectorSearch][diag] Rerank loaded:', hasRerank, '| shouldRerank(vector):', should, '| cfg:', {
              enabled: cfg.enabled,
              scope: cfg.scope,
              provider: cfg.provider,
              endpoint: cfg.endpoint,
              model: cfg.model,
              topN: cfg.topN
            });
          } catch (e) { /* ignore diag errors */ }
        })();

        if (window.RerankClient && window.RerankClient.shouldRerank('vector')) {
          try {
            console.log(`[SemanticVectorSearch] 對 ${matchedChunks.length} 個結果進行重排...`);

            // 準備文件文字
            const docs = matchedChunks.map(c => c.text || '');

            // 呼叫重排
            const rerankResults = await window.RerankClient.rerank(query, docs, {
              topN: topK,
              searchType: 'vector'
            });

            // 根據重排結果重新排序
            const rerankedChunks = rerankResults.map(r => ({
              ...matchedChunks[r.index],
              rerankScore: r.relevance_score,
              originalScore: matchedChunks[r.index].score,
              score: r.relevance_score // 使用重排分數作為最終分數
            }));

            console.log(`[SemanticVectorSearch] 重排完成，返回 ${rerankedChunks.length} 個結果`);
            return rerankedChunks;
          } catch (error) {
            console.warn('[SemanticVectorSearch] 重排失敗，使用原始結果:', error);
            // 失敗時返回原始結果
            return matchedChunks;
          }
          } else {
            console.log('[SemanticVectorSearch] 跳過重排（shouldRerank=false 或 RerankClient 未載入）');
          }

        return matchedChunks;

      } catch (error) {
        console.error('[SemanticVectorSearch] 檢索失敗:', error);
        return [];
      }
    }

    /**
     * 懶載入 RerankClient 腳本（避免某些頁面未引入導致無法重排）
     */
    async _ensureRerankClientLoaded() {
      if (window.RerankClient) return true;
      if (this._rerankLoading) return this._rerankLoading;

      const pickCandidates = () => {
        const candidates = [];
        const scripts = Array.from(document.getElementsByTagName('script'));
        // 1) 與當前 semantic-vector-search.js 同目錄
        const sem = scripts.find(s => (s.src || '').includes('semantic-vector-search.js'));
        if (sem && sem.src) {
          try { candidates.push(sem.src.replace('semantic-vector-search.js', 'rerank-client.js')); } catch {}
        }
        // 2) 與已載入的 embedding-client.js 同目錄
        const emb = scripts.find(s => (s.src || '').includes('embedding-client.js'));
        if (emb && emb.src) {
          try { candidates.push(emb.src.replace('embedding-client.js', 'rerank-client.js')); } catch {}
        }
        // 3) 文件相對路徑（可能不適配 views/history 場景，但作為兜底）
        try { candidates.push(new URL('js/chatbot/agents/rerank-client.js', document.baseURI).toString()); } catch {}
        // 4) 去重
        return Array.from(new Set(candidates.filter(Boolean)));
      };

      const candidates = pickCandidates();
      console.log('[SemanticVectorSearch][diag] 試圖動態載入 RerankClient，候選URL:', candidates);

      this._rerankLoading = new Promise((resolve) => {
        try {
          // 若已有任意 rerank-client 腳本標籤，等待就緒
          const existingTag = Array.from(document.getElementsByTagName('script')).find(s => (s.src || '').includes('rerank-client.js'));
          if (existingTag) {
            setTimeout(() => resolve(!!window.RerankClient), 150);
            return;
          }

          const tryLoad = (idx) => {
            if (idx >= candidates.length) {
              console.warn('[SemanticVectorSearch][diag] 動態載入 RerankClient 失敗（無可用URL）');
              resolve(false);
              return;
            }
            const url = candidates[idx];
            const s = document.createElement('script');
            s.src = url;
            s.async = true;
            s.onload = () => {
              console.log('[SemanticVectorSearch][diag] 動態載入 RerankClient 成功:', url);
              resolve(!!window.RerankClient);
            };
            s.onerror = () => {
              console.warn('[SemanticVectorSearch][diag] 載入失敗，嘗試下一個URL:', url);
              // 嘗試下一個候選
              tryLoad(idx + 1);
            };
            document.head.appendChild(s);
          };

          tryLoad(0);
        } catch (e) {
          console.warn('[SemanticVectorSearch][diag] 懶載入 RerankClient 異常:', e);
          resolve(false);
        }
      });
      const ok = await this._rerankLoading;
      this._rerankLoading = null;
      return ok;
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
     * 刪除文件索引
     */
    async deleteIndex(docId) {
      if (!this.vectorStore) {
        this.vectorStore = new window.VectorStore(docId);
        await this.vectorStore.init();
      }

      await this.vectorStore.deleteByDocId(docId);
      this.indexedDocs.delete(docId);

      console.log(`[SemanticVectorSearch] 已刪除文件 ${docId} 的向量索引`);
    }

    /**
     * 檢查索引狀態
     */
    async getIndexStatus(docId) {
      if (!this.vectorStore || this.vectorStore.namespace !== docId) {
        this.vectorStore = new window.VectorStore(docId);
        await this.vectorStore.init();
      }

      const stats = await this.vectorStore.stats();
      return {
        indexed: stats.count > 0,
        count: stats.count,
        dimensions: stats.dimensions,
        size: (stats.size / 1024).toFixed(2) + ' KB'
      };
    }
  }

  // 匯出全域例項
  window.SemanticVectorSearch = new SemanticVectorSearch();

  console.log('[SemanticVectorSearch] 意群向量搜尋已載入');

})(window);
