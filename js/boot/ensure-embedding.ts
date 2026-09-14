(function(window){
  'use strict';

  if (window.EmbeddingClient && typeof window.EmbeddingClient.saveConfig === 'function') return;

  function loadCfg() {
    try {
      const saved = localStorage.getItem('embeddingConfig');
      return saved ? JSON.parse(saved) : {};
    } catch(_) { return {}; }
  }

  const client = {
    // 預設配置（與主客戶端欄位名保持一致）
    config: Object.assign({
      provider: 'openai',
      apiKey: '',
      endpoint: '',
      model: 'text-embedding-3-small',
      dimensions: null,
      maxBatchSize: 2048,
      concurrency: 5,
      enabled: false
    }, loadCfg()),

    saveConfig: function(cfg){
      this.config = Object.assign({}, this.config, cfg);
      try { localStorage.setItem('embeddingConfig', JSON.stringify(this.config)); } catch(_) {}
    },

    // 內部：延時 + 重試策略
    _delay: function(ms){ return new Promise(r => setTimeout(r, ms)); },
    _shouldRetry: function(status){
      if (status === 401 || status === 403) return true; // 賬號池/閘道器抖動
      if (status === 429 || status === 408) return true; // 限流/超時
      if (status >= 500 && status <= 599) return true;   // 伺服器錯誤
      return false;
    },
    _fetchWithRetry: async function(url, options, retryOpts){
      retryOpts = retryOpts || {}; const max = retryOpts.maxRetries ?? 3; const base = retryOpts.baseDelay ?? 600; const cap = retryOpts.maxDelay ?? 5000;
      let lastErr = null;
      for (let attempt = 0; attempt <= max; attempt++) {
        try {
          const res = await fetch(url, options);
          if (res.ok) return res;
          if (!this._shouldRetry(res.status) || attempt === max) return res;
          const jitter = Math.floor(Math.random()*250);
          const delay = Math.min(cap, base * Math.pow(2, attempt)) + jitter;
          await this._delay(delay);
        } catch (e) {
          lastErr = e; if (attempt === max) throw e;
          const jitter = Math.floor(Math.random()*250);
          const delay = Math.min(cap, base * Math.pow(2, attempt)) + jitter;
          await this._delay(delay);
        }
      }
      if (lastErr) throw lastErr; // 理論上到不了
      return fetch(url, options);
    },

    // 直接呼叫相容 /embeddings 介面（支援陣列輸入 + 重試）
    embed: async function(input){
      if (!this.config || !this.config.apiKey || !this.config.endpoint || !this.config.model) {
        throw new Error('配置不完整');
      }
      const isBatch = Array.isArray(input);
      const texts = isBatch ? input : [input];
      let endpoint = this.config.endpoint;
      if (!/\/embeddings\/?$/.test(endpoint)) endpoint = endpoint.replace(/\/+$/, '') + '/embeddings';
      const body = { model: this.config.model, input: texts };
      if (this.config.dimensions) body.dimensions = this.config.dimensions;
      const resp = await this._fetchWithRetry(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.config.apiKey },
        body: JSON.stringify(body)
      }, { maxRetries: 3, baseDelay: 600, maxDelay: 5000 });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error('HTTP ' + resp.status + ': ' + t);
      }
      const data = await resp.json();
      const embs = (data && data.data) ? data.data.map(it => it.embedding) : [];
      return isBatch ? embs : embs[0];
    },

    // 與主客戶端一致的批次介面（分批 + 進度回撥）
    batchEmbed: async function(texts, options){
      options = options || {};
      const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      const maxBatchSize = this.config.maxBatchSize || 2048;

      // 粗略估算 token 並按 maxBatchSize 分批
      const batches = [];
      let cur = []; let curTok = 0;
      for (const t of texts) {
        const est = Math.ceil((t || '').length * 1.5);
        if (cur.length>0 && curTok + est > maxBatchSize) { batches.push(cur); cur=[]; curTok=0; }
        cur.push(t); curTok += est;
      }
      if (cur.length>0) batches.push(cur);

      const results = new Array(texts.length);
      let completed = 0; let offset = 0;
      for (const b of batches) {
        try {
          const embs = await this.embed(b);
          for (let i=0;i<b.length;i++) results[offset+i] = embs[i];
        } catch (e) {
          // 標記失敗項為 null，保持位置對齊
          for (let i=0;i<b.length;i++) results[offset+i] = null;
        }
        completed++;
        if (onProgress) onProgress(completed, batches.length, '批次 ' + completed + '/' + batches.length);
        offset += b.length;
      }
      return results;
    }
  };

  window.EmbeddingClient = client;
  console.warn('[EnsureEmbedding] 提供了臨時 EmbeddingClient（主腳本未就緒時的兜底）');
})(window);
