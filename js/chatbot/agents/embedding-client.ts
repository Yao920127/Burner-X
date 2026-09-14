// js/chatbot/agents/embedding-client.js
// 統一的 Embedding API 客戶端，支援 OpenAI 格式的各種服務
(function(window) {
  'use strict';

  /**
   * Embedding API 配置
   * 支援的服務：
   * - OpenAI: text-embedding-3-small, text-embedding-3-large
   * - BGE-M3: BAAI/bge-m3 (透過相容介面)
   * - Jina AI: jina-embeddings-v2-base-zh (多語言)
   * - 本地部署: 任何 OpenAI 相容的服務
   */
  function EmbeddingClient() {
    this.config = this.loadConfig();
    this.cache = new Map(); // 記憶體快取
  }

  // 簡單延時
  EmbeddingClient.prototype._delay = function(ms) { return new Promise(resolve => setTimeout(resolve, ms)); };

  // 是否應該重試（包含 401/403/429/408/5xx）
  EmbeddingClient.prototype._shouldRetry = function(status) {
    if (status === 401 || status === 403) return true;
    if (status === 429 || status === 408) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  };

  // 具備指數退避 + 抖動的重試封裝
  EmbeddingClient.prototype._fetchWithRetry = async function(url, options = {}, retryOpts = {}) {
    const {
      maxRetries = 3,
      baseDelay = 500,
      maxDelay = 4000,
    } = retryOpts;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return res;
        if (!this._shouldRetry(res.status) || attempt === maxRetries) {
          return res; // 交給上層解析/拋錯
        }
        const jitter = Math.floor(Math.random() * 250);
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) + jitter;
        await this._delay(delay);
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries) throw err; // 網路錯誤且用盡重試
        const jitter = Math.floor(Math.random() * 250);
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) + jitter;
        await this._delay(delay);
      }
    }
    if (lastError) throw lastError;
    return fetch(url, options);
  };

  EmbeddingClient.prototype.loadConfig = function() {
    try {
      const saved = localStorage.getItem('embeddingConfig');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('[EmbeddingClient] 載入配置失敗:', e);
    }

    return {
      provider: 'openai', // openai | jina | custom
      apiKey: '',
      endpoint: 'https://api.openai.com/v1/embeddings',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      maxBatchSize: 2048,
      concurrency: 5,
      enabled: false
    };
  };

  EmbeddingClient.prototype.saveConfig = function(config) {
    this.config = Object.assign({}, this.config, config);
    try {
      localStorage.setItem('embeddingConfig', JSON.stringify(this.config));
    } catch (e) {
      console.error('[EmbeddingClient] 儲存配置失敗:', e);
    }
  };

  /**
   * 獲取文字的向量表示
   */
  EmbeddingClient.prototype.embed = async function(input) {
      if (!this.config.enabled || !this.config.apiKey) {
        throw new Error('Embedding API 未配置或未啟用');
      }

      const isBatch = Array.isArray(input);
      const texts = isBatch ? input : [input];

      // 檢查快取
      const cachedResults = [];
      const uncachedTexts = [];
      const uncachedIndices = [];

      texts.forEach((text, idx) => {
        const cacheKey = this.getCacheKey(text);
        if (this.cache.has(cacheKey)) {
          cachedResults[idx] = this.cache.get(cacheKey);
        } else {
          uncachedTexts.push(text);
          uncachedIndices.push(idx);
        }
      });

      // 如果全部命中快取
      if (uncachedTexts.length === 0) {
        return isBatch ? cachedResults : cachedResults[0];
      }

      // 呼叫API
      const requestBody = {
        model: this.config.model,
        input: uncachedTexts
      };

      // 根據服務商新增特定引數
      const provider = this.config.provider || 'openai';
      
      if (provider === 'openai') {
        // OpenAI 支援 encoding_format 和 dimensions
        requestBody.encoding_format = 'float';
        
        // 對於支援降維的模型（如 OpenAI text-embedding-3-*）
        if (this.config.dimensions && this.config.dimensions < 1536) {
          requestBody.dimensions = this.config.dimensions;
        }
      } else if (provider === 'alibaba') {
        // 阿里雲百鍊支援 dimensions
        if (this.config.dimensions) {
          requestBody.dimensions = this.config.dimensions;
        }
      }
      // Jina AI 和其他服務商不需要額外引數

      try {
        const response = await this._fetchWithRetry(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify(requestBody)
        }, { maxRetries: 3, baseDelay: 600, maxDelay: 5000 });

        if (!response.ok) {
          const errText = await response.text();
          const err = new Error(`Embedding API 錯誤 (${response.status}): ${errText}`);
          err.status = response.status;
          // 401/403 等鑑權問題認定為不可重試
          err.retryable = this._shouldRetry(response.status);
          throw err;
        }

        const data = await response.json();

        // OpenAI 格式響應: { data: [{ embedding: [...] }], usage: {...} }
        const embeddings = data.data.map(item => item.embedding);

        // 快取結果
        uncachedTexts.forEach((text, idx) => {
          const cacheKey = this.getCacheKey(text);
          this.cache.set(cacheKey, embeddings[idx]);
          cachedResults[uncachedIndices[idx]] = embeddings[idx];
        });

        console.log(`[EmbeddingClient] 成功生成 ${embeddings.length} 個向量，使用token: ${(data && data.usage && data.usage.total_tokens) || '未知'}`);

        return isBatch ? cachedResults : cachedResults[0];
      } catch (error) {
        console.error('[EmbeddingClient] 呼叫API失敗:', error);
        const e = new Error(error.message || 'Embedding 呼叫失敗');
        e.status = error.status;
        e.retryable = error.retryable;
        throw e;
      }
  };

    EmbeddingClient.prototype.getCacheKey = function(text) {
      // 簡單的雜湊函式
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return `${this.config.model}_${hash}`;
    };

    /**
     * 批次生成向量（自動分批 + 並行處理）
     * @param {string[]} texts - 文字陣列
     * @param {Object} options - 選項
     * @param {Function} options.onProgress - 進度回撥 (current, total, message)
     * @returns {Promise<number[][]>} 向量陣列
     */
    EmbeddingClient.prototype.batchEmbed = async function(texts, options = {}) {
      const onProgress = (options && options.onProgress) ? options.onProgress : null;

      const batches = [];
      let currentBatch = [];
      let currentTokens = 0;

      for (const text of texts) {
        // 粗略估算 token 數（中文1字≈1.5token，英文1詞≈1token）
        const estimatedTokens = Math.ceil(text.length * 1.5);

        if (currentTokens + estimatedTokens > this.config.maxBatchSize && currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [text];
          currentTokens = estimatedTokens;
        } else {
          currentBatch.push(text);
          currentTokens += estimatedTokens;
        }
      }

      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      const concurrency = Math.max(1, Math.min(this.config.concurrency || 5, 50));
      console.log(`[EmbeddingClient] 分為 ${batches.length} 批次，並行數: ${concurrency}`);

      // 並行處理批次
      const results = new Array(batches.length);
      let nextIndex = 0;
      let completedCount = 0;

      let abortAll = false; // 硬錯誤（如 401/403）時中止

      async function processNext(self) {
        const i = nextIndex++;
        if (i >= batches.length) return;

        if (abortAll) return; // 已經判定為硬錯誤，停止排隊

        console.log(`[EmbeddingClient] 處理批次 ${i + 1}/${batches.length}`);
        try {
          results[i] = await self.embed(batches[i]);
        } catch (err) {
          // 對於 401/403：停止繼續排程新的批次，但保留已在飛的任務，返回部分結果
          if (err && (err.status === 401 || err.status === 403)) {
            abortAll = true;
            results[i] = new Array(batches[i].length).fill(null);
            if (onProgress && typeof onProgress === 'function') {
              onProgress(completedCount, batches.length, `鑑權失敗 (${err.status})，停止新的批次，保留部分結果`);
            }
            // 不丟擲，讓其餘並行任務自然結束，返回部分結果
          } else {
          // 其他錯誤（網路/429/5xx）在 _fetchWithRetry 已重試，此處標記該批失敗並繼續
          console.warn('[EmbeddingClient] 批次失敗，已跳過:', (err && err.message) || err);
          results[i] = new Array(batches[i].length).fill(null);
          }

        completedCount++;
        if (onProgress && typeof onProgress === 'function') {
          onProgress(completedCount, batches.length, `正在生成向量 ${completedCount}/${batches.length}`);
        }

        if (!abortAll) return processNext(self);
      }

      // 啟動並行worker
      const workers = [];
      for (let i = 0; i < Math.min(concurrency, batches.length); i++) {
        workers.push(processNext(this));
      }

      // 使用 Promise.allSettled 確保單個 worker 拋錯不影響清理
      const settled = await Promise.allSettled(workers);
      const rejected = settled.find(r => r.status === 'rejected');
      if (rejected) {
        throw rejected.reason;
      }

      // 合併結果
      const allEmbeddings = [];
      for (const batchResult of results) {
        // 允許 batchResult 為空（理論上不應），做兜底
        if (Array.isArray(batchResult)) {
          allEmbeddings.push(...batchResult);
        }
      }

      return allEmbeddings;
    };

  /** 清空快取 */
  EmbeddingClient.prototype.clearCache = function() {
    this.cache.clear();
    console.log('[EmbeddingClient] 快取已清空');
  };

  // 匯出全域例項
  window.EmbeddingClient = new EmbeddingClient();

  console.log('[EmbeddingClient] Embedding客戶端已載入');

}

})(window);
