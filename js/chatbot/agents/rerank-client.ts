// js/chatbot/agents/rerank-client.js
// Rerank API 客戶端
(function(window) {
  'use strict';

  /**
   * Rerank API 配置
   * 支援的服務：
   * - Jina AI: jina-reranker-v2-base-multilingual
   * - Cohere: rerank-english-v2.0, rerank-multilingual-v2.0
   * - OpenAI格式：相容OpenAI API格式的重排服務
   */
  class RerankClient {
    constructor() {
      this.config = this.loadConfig();
    }

    /**
     * 從localStorage載入配置
     */
    loadConfig() {
      try {
        const saved = localStorage.getItem('rerankConfig');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('[RerankClient] 載入配置失敗:', e);
      }

      // 預設配置
      return {
        enabled: false,
        scope: 'vector-only', // 'vector-only' | 'all'
        provider: 'jina',
        apiKey: '',
        endpoint: '',
        model: 'jina-reranker-v2-base-multilingual',
        topN: 10
      };
    }

    /**
     * 儲存配置到localStorage
     */
    saveConfig(config) {
      this.config = { ...this.config, ...config };
      try {
        localStorage.setItem('rerankConfig', JSON.stringify(this.config));
      } catch (e) {
        console.error('[RerankClient] 儲存配置失敗:', e);
      }
    }

    /**
     * 檢查是否應該對某種搜尋型別使用重排
     * @param {string} searchType - 搜尋型別: 'vector' | 'bm25' | 'hybrid'
     * @returns {boolean}
     */
    shouldRerank(searchType) {
      if (!this.config.enabled) return false;
      if (this.config.scope === 'all') return true;
      if (this.config.scope === 'vector-only' && searchType === 'vector') return true;
      return false;
    }

    /**
     * 重排文件（帶容錯）
     * @param {string} query - 查詢文字
     * @param {Array<string|Object>} documents - 文件陣列，可以是字串或包含text欄位的物件
     * @param {Object} options - 可選引數
     * @returns {Promise<Array>} 排序後的結果，包含index和relevance_score。失敗時返回原始順序
     */
    async rerank(query, documents, options = {}) {
      if (!this.config.enabled || !this.config.apiKey) {
        console.warn('[RerankClient] 重排未啟用，返回原始順序');
        return documents.map((doc, idx) => ({ index: idx, relevance_score: 1.0 - idx * 0.01 }));
      }

      if (!query || !documents || documents.length === 0) {
        console.warn('[RerankClient] 查詢或文件為空，返回原始順序');
        return documents.map((doc, idx) => ({ index: idx, relevance_score: 1.0 - idx * 0.01 }));
      }

      const { topN = this.config.topN, searchType = 'vector' } = options;

      // 檢查是否應該對這種搜尋型別使用重排
      if (!this.shouldRerank(searchType)) {
        console.log(`[RerankClient] ${searchType} 搜尋不使用重排，返回原始順序`);
        return documents.map((doc, idx) => ({ index: idx, relevance_score: 1.0 - idx * 0.01 }));
      }

      // 統一文件格式
      const formattedDocs = documents.map(doc =>
        typeof doc === 'string' ? doc : (doc.text || doc.content || '')
      );

      try {
        let result;

        switch (this.config.provider) {
          case 'jina':
            result = await this.rerankWithJina(query, formattedDocs, topN);
            break;
          case 'cohere':
            result = await this.rerankWithCohere(query, formattedDocs, topN);
            break;
          case 'openai':
            result = await this.rerankWithOpenAI(query, formattedDocs, topN);
            break;
          default:
            throw new Error(`不支援的重排服務商: ${this.config.provider}`);
        }

        console.log(`[RerankClient] 重排成功，返回 ${result.length} 個結果`);
        return result;
      } catch (error) {
        console.error('[RerankClient] 重排失敗，降級為原始順序:', error);
        // 失敗時返回原始順序
        return documents.map((doc, idx) => ({
          index: idx,
          relevance_score: 1.0 - idx * 0.01,
          document: typeof doc === 'string' ? { text: doc } : doc
        }));
      }
    }

    /**
     * 使用Jina AI重排
     */
    async rerankWithJina(query, documents, topN) {
      const endpoint = this.config.endpoint || 'https://api.jina.ai/v1/rerank';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          query: query,
          documents: documents,
          top_n: topN
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Jina AI 重排失敗: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.results || [];
    }

    /**
     * 使用Cohere重排
     */
    async rerankWithCohere(query, documents, topN) {
      const endpoint = this.config.endpoint || 'https://api.cohere.ai/v1/rerank';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          query: query,
          documents: documents,
          top_n: topN
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cohere 重排失敗: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.results || [];
    }

    /**
     * 使用OpenAI格式API重排
     */
    async rerankWithOpenAI(query, documents, topN) {
      if (!this.config.endpoint) {
        throw new Error('OpenAI格式需要配置endpoint');
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          query: query,
          documents: documents,
          top_n: topN
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI格式重排失敗: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.results || [];
    }
  }

  // 匯出到全域
  window.RerankClient = new RerankClient();

  console.log('[RerankClient] 客戶端已載入');

})(window);

