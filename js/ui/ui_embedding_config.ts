/**
 * UI 嵌入與重排配置渲染模組
 * 提取嵌入模型（Embedding）和重排（Rerank）的配置介面渲染程式碼
 */

(function(window) {
  'use strict';

  // 確保 EmbeddingClient 已載入（必要時動態注入腳本）
  async function ensureEmbeddingClientLoaded() {
    if (window.EmbeddingClient && typeof window.EmbeddingClient.saveConfig === 'function') return true;

    // 從已載入腳本推斷候選路徑
    const candidates = [];
    try {
      const scripts = Array.from(document.getElementsByTagName('script'));
      const sem = scripts.find(s => (s.src || '').includes('semantic-vector-search.js'));
      if (sem && sem.src) candidates.push(sem.src.replace('semantic-vector-search.js', 'embedding-client.js'));
      const rer = scripts.find(s => (s.src || '').includes('rerank-client.js'));
      if (rer && rer.src) candidates.push(rer.src.replace('rerank-client.js', 'embedding-client.js'));
    } catch(_) {}

    // 兜底：相對當前頁面常見路徑
    candidates.push('js/chatbot/agents/embedding-client.js');

    // 動態載入（無論是否已存在舊標籤，均追加一個帶快取破壞引數的標籤）
    for (const base of Array.from(new Set(candidates))) {
      const url = base + (base.includes('?') ? '&' : '?') + 'v=' + Date.now();
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = url;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('load failed: ' + url));
          document.head.appendChild(s);
        });
        if (window.EmbeddingClient && typeof window.EmbeddingClient.saveConfig === 'function') return true;
      } catch(_) {
        // try next
      }
    }
    return !!(window.EmbeddingClient && typeof window.EmbeddingClient.saveConfig === 'function');
  }

  /**
   * 顯示嵌入模型選擇器對話方塊
   * @param {Array} models - 模型列表
   * @param {HTMLInputElement} targetInput - 目標輸入欄位
   */
  function showEmbeddingModelSelector(models, targetInput) {
    // 建立一個簡單的選擇對話方塊
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 400px; max-width: 90vw; max-height: 60vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      z-index: 100002; padding: 0; overflow: hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;';
    header.innerHTML = `
      <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">選擇嵌入模型</h4>
      <button class="model-selector-close" style="border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1;">&times;</button>
    `;

    const list = document.createElement('div');
    list.style.cssText = 'max-height: 400px; overflow-y: auto; padding: 8px;';

    models.forEach(model => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 16px; margin: 4px 0; border-radius: 8px;
        cursor: pointer; transition: all 0.2s;
        border: 1px solid #e5e7eb;
      `;
      item.innerHTML = `
        <div style="font-weight: 500; color: #111827;">${model.id}</div>
        ${model.owned_by ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">by ${model.owned_by}</div>` : ''}
      `;

      item.onmouseover = () => {
        item.style.background = '#f3f4f6';
        item.style.borderColor = '#3b82f6';
      };
      item.onmouseout = () => {
        item.style.background = '#fff';
        item.style.borderColor = '#e5e7eb';
      };
      item.onclick = () => {
        targetInput.value = model.id;
        document.body.removeChild(overlay);
        document.body.removeChild(container);
      };

      list.appendChild(item);
    });

    container.appendChild(header);
    container.appendChild(list);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5); z-index: 100001;
    `;

    const closeHandler = () => {
      document.body.removeChild(overlay);
      document.body.removeChild(container);
    };

    overlay.onclick = closeHandler;
    header.querySelector('.model-selector-close').onclick = closeHandler;

    document.body.appendChild(overlay);
    document.body.appendChild(container);
  }

  /**
   * 顯示重排模型選擇器對話方塊
   * @param {Array} models - 模型列表
   * @param {HTMLInputElement} targetInput - 目標輸入欄位
   */
  function showRerankModelSelector(models, targetInput) {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 420px; max-width: 92vw; max-height: 60vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      z-index: 100002; padding: 0; overflow: hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;';
    header.innerHTML = `
      <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">選擇重排模型</h4>
      <button class="model-selector-close" style="border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1;">&times;</button>
    `;

    const list = document.createElement('div');
    list.style.cssText = 'max-height: 400px; overflow-y: auto; padding: 8px;';

    (models || []).forEach(model => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 16px; margin: 4px 0; border-radius: 8px;
        cursor: pointer; transition: all 0.2s;
        border: 1px solid #e5e7eb;
      `;
      const id = model.id || model.name || '';
      item.innerHTML = `
        <div style="font-weight: 500; color: #111827;">${id}</div>
        ${model.owned_by ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">by ${model.owned_by}</div>` : ''}
      `;
      item.onmouseover = () => { item.style.background = '#f3f4f6'; item.style.borderColor = '#737373'; };
      item.onmouseout = () => { item.style.background = '#fff'; item.style.borderColor = '#e5e7eb'; };
      item.onclick = () => {
        if (id) targetInput.value = id;
        document.body.removeChild(overlay);
        document.body.removeChild(container);
      };
      list.appendChild(item);
    });

    container.appendChild(header);
    container.appendChild(list);

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5); z-index: 100001;
    `;
    const closeHandler = () => { document.body.removeChild(overlay); document.body.removeChild(container); };
    overlay.onclick = closeHandler;
    header.querySelector('.model-selector-close').onclick = closeHandler;
    document.body.appendChild(overlay);
    document.body.appendChild(container);
  }

  /**
   * 渲染嵌入模型配置介面（包含向量搜尋和重排兩個tab）
   * @param {HTMLElement} container - 配置容器元素（modelConfigColumn）
   */
  function renderEmbeddingConfig(container) {
      // 從localStorage載入配置
      const config = window.EmbeddingClient?.config || {};
      const rerankConfig = window.RerankClient?.config || {};
      const PRESETS = {
          openai: { name: 'OpenAI格式', endpoint: 'https://api.openai.com/v1/embeddings' },
          jina: { name: 'Jina AI', endpoint: 'https://api.jina.ai/v1/embeddings' },
          zhipu: { name: '智譜AI', endpoint: 'https://open.bigmodel.cn/api/paas/v4/embeddings' },
          alibaba: { name: '阿里雲百鍊', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings' }
      };

      // 阿里雲百鍊支援的模型和維度
      const ALIBABA_MODELS = {
          'text-embedding-v1': { name: 'text-embedding-v1 (中文)', dims: 1536 },
          'text-embedding-v2': { name: 'text-embedding-v2 (多語言)', dims: 1536 },
          'text-embedding-v3': { name: 'text-embedding-v3 (高效能)', dims: 1024 },
          'text-embedding-v4': { name: 'text-embedding-v4 (多語言，支援2048維)', dims: 2048 }
      };

      const mainContainer = document.createElement('div');

      // Tabs（樣式更內斂）
      const tabsDiv = document.createElement('div');
      tabsDiv.className = 'flex border-b border-gray-200 mb-4';
      tabsDiv.innerHTML = `
          <button id="emb-km-tab-vector" class="emb-km-tab flex-1 px-4 py-2 text-sm font-medium text-gray-800 border-b-2 border-gray-300 transition-colors">
              向量搜尋
          </button>
          <button id="emb-km-tab-rerank" class="emb-km-tab flex-1 px-4 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-gray-700 transition-colors">
              重排 (Rerank)
          </button>
      `;
      mainContainer.appendChild(tabsDiv);

      // 向量搜尋Tab內容
      const vectorContainer = document.createElement('div');
      vectorContainer.id = 'emb-km-vector-content';
      vectorContainer.className = 'emb-km-tab-content space-y-4';

      // 啟用開關
      const enabledDiv = document.createElement('div');
      enabledDiv.className = 'flex items-center gap-2';
      enabledDiv.innerHTML = `
          <input type="checkbox" id="emb-enabled-km" ${config.enabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
          <label for="emb-enabled-km" class="text-sm font-medium text-gray-700">啟用向量搜尋</label>
      `;
      vectorContainer.appendChild(enabledDiv);

      // 服務商選擇
      const providerDiv = document.createElement('div');
      providerDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">服務商</label>
          <select id="emb-provider-km" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <option value="openai" ${config.provider === 'openai' ? 'selected' : ''}>OpenAI格式</option>
              <option value="jina" ${config.provider === 'jina' ? 'selected' : ''}>Jina AI (多語言最佳化)</option>
              <option value="zhipu" ${config.provider === 'zhipu' ? 'selected' : ''}>智譜AI (GLM)</option>
              <option value="alibaba" ${config.provider === 'alibaba' ? 'selected' : ''}>阿里雲百鍊</option>
          </select>
      `;
      vectorContainer.appendChild(providerDiv);

      // API Key（帶顯示/隱藏按鈕）
      const keyDiv = document.createElement('div');
      keyDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <div class="flex items-center gap-2">
              <input type="password" id="emb-api-key-km" value="${config.apiKey || ''}" placeholder="sk-..." class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <button type="button" id="emb-api-key-toggle-km" class="px-2.5 py-2 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1">
                  <iconify-icon icon="carbon:view" width="16"></iconify-icon>顯示
              </button>
          </div>
      `;
      vectorContainer.appendChild(keyDiv);

      // Base URL
      const urlDiv = document.createElement('div');
      // 顯示時去掉 /embeddings 字尾
      const displayUrl = (config.endpoint || '').replace(/\/embeddings\/?$/, '');
      urlDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">
              Base URL
              <span class="text-xs text-gray-500">(如 https://api.openai.com/v1)</span>
          </label>
          <input type="text" id="emb-endpoint-km" value="${displayUrl}" placeholder="https://api.openai.com/v1" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
      `;
      vectorContainer.appendChild(urlDiv);

      // 模型選擇
      const modelDiv = document.createElement('div');
      modelDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">模型ID</label>
          <div class="flex gap-2">
              <input type="text" id="emb-model-km" value="${config.model || ''}" placeholder="請輸入模型ID，如: text-embedding-3-small" class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <button type="button" id="emb-fetch-models-km" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap" style="display: none;">
                  獲取列表
              </button>
          </div>
          <p id="emb-model-hint-km" class="mt-1 text-xs text-gray-500">請輸入服務商支援的嵌入模型ID</p>
      `;
      vectorContainer.appendChild(modelDiv);

      // 向量維度 (OpenAI可選)
      const dimsDiv = document.createElement('div');
      dimsDiv.id = 'emb-dims-wrap-km';
      dimsDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">
              向量維度
              <span class="text-xs text-gray-500">(可選，留空使用預設)</span>
          </label>
          <input type="number" id="emb-dimensions-km" value="${config.dimensions || ''}" placeholder="1536" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
          <p class="mt-1 text-xs text-gray-500">降低維度可減少儲存和計算，但可能影響精度</p>
      `;
      vectorContainer.appendChild(dimsDiv);

      // 並行數配置
      const concurrencyDiv = document.createElement('div');
      concurrencyDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">
              並行請求數
              <span class="text-xs text-gray-500">(建議 5-20，最大50)</span>
          </label>
          <input type="number" id="emb-concurrency-km" value="${config.concurrency || 5}" min="1" max="50" placeholder="5" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
          <p class="mt-1 text-xs text-gray-500">提高並行數可加快索引構建速度，但注意API速率限制</p>
      `;
      vectorContainer.appendChild(concurrencyDiv);

      // 測試和儲存按鈕
      const buttonsDiv = document.createElement('div');
      buttonsDiv.className = 'flex gap-3 pt-2';
      buttonsDiv.innerHTML = `
          <button id="emb-test-km" class="flex-1 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50">測試連線</button>
          <button id="emb-save-km" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">儲存配置</button>
      `;
      vectorContainer.appendChild(buttonsDiv);

      // 測試結果
      const resultDiv = document.createElement('div');
      resultDiv.id = 'emb-test-result-km';
      resultDiv.className = 'text-sm mt-2';
      resultDiv.style.display = 'none';
      vectorContainer.appendChild(resultDiv);

      mainContainer.appendChild(vectorContainer);

      // 重排Tab內容
      const rerankContainer = document.createElement('div');
      rerankContainer.id = 'emb-km-rerank-content';
      rerankContainer.className = 'emb-km-tab-content space-y-4 hidden';

      // 重排啟用開關
      const rerankEnabledDiv = document.createElement('div');
      rerankEnabledDiv.className = 'flex items-center gap-2';
      rerankEnabledDiv.innerHTML = `
          <input type="checkbox" id="rerank-enabled-km" ${rerankConfig.enabled ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
          <label for="rerank-enabled-km" class="text-sm font-medium text-gray-700">啟用重排</label>
      `;
      rerankContainer.appendChild(rerankEnabledDiv);

      // 應用範圍
      const rerankScopeDiv = document.createElement('div');
      const scope = rerankConfig.scope || 'vector-only';
      rerankScopeDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-2">應用範圍</label>
          <div class="space-y-2">
              <label class="flex items-center cursor-pointer">
                  <input type="radio" name="rerank-scope-km" value="vector-only" ${scope === 'vector-only' ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500">
                  <span class="ml-2 text-sm text-gray-700">僅向量搜尋使用重排</span>
              </label>
              <label class="flex items-center cursor-pointer">
                  <input type="radio" name="rerank-scope-km" value="all" ${scope === 'all' ? 'checked' : ''} class="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500">
                  <span class="ml-2 text-sm text-gray-700">所有搜尋都使用重排（包括BM25等）</span>
              </label>
          </div>
          <p class="mt-1 text-xs text-gray-500">選擇重排功能的應用範圍，失敗時自動降級為原始排序</p>
      `;
      rerankContainer.appendChild(rerankScopeDiv);

      // 服務商選擇
      const rerankProviderDiv = document.createElement('div');
      rerankProviderDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">服務商</label>
          <select id="rerank-provider-km" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <option value="jina" ${rerankConfig.provider === 'jina' ? 'selected' : ''}>Jina AI Reranker</option>
              <option value="cohere" ${rerankConfig.provider === 'cohere' ? 'selected' : ''}>Cohere Rerank</option>
              <option value="openai" ${rerankConfig.provider === 'openai' ? 'selected' : ''}>OpenAI格式</option>
          </select>
      `;
      rerankContainer.appendChild(rerankProviderDiv);

      // API Key（帶顯示/隱藏按鈕）
      const rerankKeyDiv = document.createElement('div');
      rerankKeyDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <div class="flex items-center gap-2">
              <input type="password" id="rerank-api-key-km" value="${rerankConfig.apiKey || ''}" placeholder="jina_..." class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <button type="button" id="rerank-api-key-toggle-km" class="px-2.5 py-2 border border-gray-300 rounded-md text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-1">
                  <iconify-icon icon="carbon:view" width="16"></iconify-icon>顯示
              </button>
          </div>
      `;
      rerankContainer.appendChild(rerankKeyDiv);

      // Base URL（顯示時去掉 /rerank 字尾）
      const rerankUrlDiv = document.createElement('div');
      const displayRerankBaseUrl = (rerankConfig.endpoint || '').replace(/\/rerank\/?$/, '');
      rerankUrlDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">
              Base URL
              <span class="text-xs text-gray-500">(如 https://api.jina.ai/v1 或 https://api.openai.com/v1)</span>
          </label>
          <input type="text" id="rerank-endpoint-km" value="${displayRerankBaseUrl}" placeholder="https://api.jina.ai/v1" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
      `;
      rerankContainer.appendChild(rerankUrlDiv);

      // 模型ID（支援 OpenAI 格式獲取列表與模型檢測）
      const rerankModelDiv = document.createElement('div');
      rerankModelDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">模型ID</label>
          <div class="flex gap-2">
              <input type="text" id="rerank-model-km" value="${rerankConfig.model || 'jina-reranker-v2-base-multilingual'}" placeholder="例如: jina-reranker-v2-base-multilingual 或 cohere/rerank-multilingual-v3.0" class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <button type="button" id="rerank-fetch-models-km" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap" style="display: none;">獲取列表</button>
              <button type="button" id="rerank-check-model-km" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors whitespace-nowrap">檢測模型</button>
          </div>
          <p id="rerank-model-hint-km" class="mt-1 text-xs text-gray-500">請輸入服務商支援的重排模型ID；OpenAI格式可點選“獲取列表”</p>
      `;
      rerankContainer.appendChild(rerankModelDiv);

      // Top N
      const rerankTopNDiv = document.createElement('div');
      rerankTopNDiv.innerHTML = `
          <label class="block text-sm font-medium text-gray-700 mb-1">
              Top N
              <span class="text-xs text-gray-500">(返回前N個結果)</span>
          </label>
          <input type="number" id="rerank-top-n-km" value="${rerankConfig.topN || 10}" min="1" max="50" placeholder="10" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
          <p class="mt-1 text-xs text-gray-500">建議 5-20，根據實際需求調整</p>
      `;
      rerankContainer.appendChild(rerankTopNDiv);

      // 重排測試和儲存按鈕
      const rerankButtonsDiv = document.createElement('div');
      rerankButtonsDiv.className = 'flex gap-3 pt-2';
      rerankButtonsDiv.innerHTML = `
          <button id="rerank-test-km" class="flex-1 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50">測試連線</button>
          <button id="rerank-save-km" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">儲存配置</button>
      `;
      rerankContainer.appendChild(rerankButtonsDiv);

      // 重排測試結果
      const rerankResultDiv = document.createElement('div');
      rerankResultDiv.id = 'rerank-test-result-km';
      rerankResultDiv.className = 'text-sm mt-2';
      rerankResultDiv.style.display = 'none';
      rerankContainer.appendChild(rerankResultDiv);

      // 說明
      const rerankNoticeDiv = document.createElement('div');
      rerankNoticeDiv.className = 'mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md';
      rerankNoticeDiv.innerHTML = `
          <p class="text-xs text-blue-900">💡 <strong>重排工作原理</strong>：對搜尋結果進行二次排序，使用更精確的模型計算相關性分數，提升最終結果的準確度。</p>
      `;
      rerankContainer.appendChild(rerankNoticeDiv);

      mainContainer.appendChild(rerankContainer);

      container.appendChild(mainContainer);

      // 事件綁定
      const $= (id) => document.getElementById(id);

      // API Key 顯示/隱藏切換（Embedding）
      (function() {
          const toggleBtn = $('emb-api-key-toggle-km');
          const input = $('emb-api-key-km');
          if (toggleBtn && input) {
              toggleBtn.addEventListener('click', () => {
                  const isPassword = input.type === 'password';
                  input.type = isPassword ? 'text' : 'password';
                  toggleBtn.innerHTML = isPassword
                      ? '<iconify-icon icon="carbon:view-off" width="16"></iconify-icon>隱藏'
                      : '<iconify-icon icon="carbon:view" width="16"></iconify-icon>顯示';
              });
          }
      })();

      // API Key 顯示/隱藏切換（Rerank）
      (function() {
          const toggleBtn = $('rerank-api-key-toggle-km');
          const input = $('rerank-api-key-km');
          if (toggleBtn && input) {
              toggleBtn.addEventListener('click', () => {
                  const isPassword = input.type === 'password';
                  input.type = isPassword ? 'text' : 'password';
                  toggleBtn.innerHTML = isPassword
                      ? '<iconify-icon icon="carbon:view-off" width="16"></iconify-icon>隱藏'
                      : '<iconify-icon icon="carbon:view" width="16"></iconify-icon>顯示';
              });
          }
      })();

      // Tabs切換事件（中性灰）
      const kmTabs = document.querySelectorAll('.emb-km-tab');
      const kmTabContents = document.querySelectorAll('.emb-km-tab-content');
      kmTabs.forEach(tab => {
          tab.addEventListener('click', () => {
              // 更新tab樣式
              kmTabs.forEach(t => {
                  t.classList.remove('text-gray-800', 'border-gray-300');
                  t.classList.add('text-gray-500', 'border-transparent');
              });
              tab.classList.remove('text-gray-500', 'border-transparent');
              tab.classList.add('text-gray-800', 'border-gray-300');

              // 切換內容
              const targetId = tab.id.replace('-tab-', '-') + '-content';
              kmTabContents.forEach(content => {
                  content.classList.add('hidden');
              });
              const targetContent = document.getElementById(targetId);
              if (targetContent) {
                  targetContent.classList.remove('hidden');
              }
          });
      });

      // 服務商切換
      $('emb-provider-km').onchange = function() {
          const provider = this.value;
          const fetchBtn = $('emb-fetch-models-km');
          const modelHint = $('emb-model-hint-km');

          // 顯示/隱藏獲取模型列表按鈕（僅 OpenAI格式支援）
          if (provider === 'openai') {
              fetchBtn.style.display = 'block';
              modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
          } else {
              fetchBtn.style.display = 'none';
              modelHint.textContent = '請輸入服務商支援的嵌入模型ID';
          }

          // 當選擇阿里雲百鍊時，更新維度提示
          if (provider === 'alibaba') {
              const dimsInput = $('emb-dimensions-km');
              const dimsHint = dimsInput.nextElementSibling;
              const modelInput = $('emb-model-km');

              // 根據當前模型更新預設維度
              const updateDimensionsForModel = () => {
                  const modelId = modelInput.value.trim();
                  const modelInfo = ALIBABA_MODELS[modelId];
                  if (modelInfo) {
                      dimsInput.placeholder = `預設: ${modelInfo.dims}`;
                      dimsHint.textContent = `預設維度: ${modelInfo.dims}。可輸入1-${modelInfo.dims}之間的整數，留空使用預設。`;
                  }
              };

              // 初始化時更新一次
              updateDimensionsForModel();

              // 模型改變時更新
              modelInput.addEventListener('change', updateDimensionsForModel);
          }
      };

      // 初始化時更新 UI
      (function() {
          const provider = config.provider || 'openai';
          const fetchBtn = $('emb-fetch-models-km');
          const modelHint = $('emb-model-hint-km');
          if (provider === 'openai') {
              fetchBtn.style.display = 'block';
              modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
          }
      })();

      // 獲取模型列表（僅 OpenAI格式）
      $('emb-fetch-models-km').onclick = async () => {
          const btn = $('emb-fetch-models-km');
          const modelInput = $('emb-model-km');
          const modelHint = $('emb-model-hint-km');
          const provider = $('emb-provider-km').value;
          const apiKey = $('emb-api-key-km').value;
          let endpoint = $('emb-endpoint-km').value;

          if (!apiKey) {
              modelHint.style.color = '#dc2626';
              modelHint.textContent = '❌ 請先輸入 API Key';
              setTimeout(() => {
                  modelHint.style.color = '#6b7280';
                  modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
              }, 3000);
              return;
          }

          if (!endpoint) {
              endpoint = PRESETS[provider]?.endpoint || '';
          }

          // 自動補全路徑
          if (endpoint && !endpoint.endsWith('/embeddings')) {
              endpoint = endpoint.replace(/\/+$/, '') + '/embeddings';
          }

          // 構建 models 端點
          let modelsEndpoint = endpoint.replace('/embeddings', '/models');

          btn.textContent = '獲取中...';
          btn.disabled = true;
          modelHint.style.color = '#6b7280';
          modelHint.textContent = '正在獲取模型列表...';

          try {
              const response = await fetch(modelsEndpoint, {
                  headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json'
                  }
              });

              if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }

              const data = await response.json();
              const models = data.data || [];

              // 過濾出嵌入模型（支援多種命名模式）
              const embeddingModels = models.filter(m => {
                  const id = (m.id || '').toLowerCase();
                  return id.includes('embedding') ||
                         id.includes('embed') ||
                         id.includes('bge') ||
                         id.includes('text-similarity') ||
                         id.includes('sentence') ||
                         id.includes('vector');
              });

              if (embeddingModels.length === 0) {
                  modelHint.style.color = '#f59e0b';
                  modelHint.textContent = `⚠️ 未找到嵌入模型（共 ${models.length} 個模型）`;
                  setTimeout(() => {
                      modelHint.style.color = '#6b7280';
                      modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
                  }, 3000);
                  return;
              }

              // 顯示模型選擇器
              showEmbeddingModelSelector(embeddingModels, modelInput);
              modelHint.style.color = '#059669';
              modelHint.textContent = `✅ 找到 ${embeddingModels.length} 個嵌入模型`;
              setTimeout(() => {
                  modelHint.style.color = '#6b7280';
                  modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
              }, 3000);

          } catch (error) {
              modelHint.style.color = '#dc2626';
              modelHint.textContent = `❌ 獲取失敗: ${error.message}`;
              setTimeout(() => {
                  modelHint.style.color = '#6b7280';
                  modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
              }, 3000);
          } finally {
              btn.textContent = '獲取列表';
              btn.disabled = false;
          }
      };

      // 測試連線
      $('emb-test-km').onclick = async () => {
          const btn = $('emb-test-km');
          const result = $('emb-test-result-km');

          let baseUrl = $('emb-endpoint-km').value.trim();
          // 自動補全 /embeddings 路徑
          if (baseUrl && !baseUrl.endsWith('/embeddings')) {
              baseUrl = baseUrl.replace(/\/+$/, '') + '/embeddings';
          }

          const testConfig = {
              provider: $('emb-provider-km').value,
              apiKey: $('emb-api-key-km').value,
              endpoint: baseUrl,
              model: $('emb-model-km').value,
              dimensions: parseInt($('emb-dimensions-km').value) || null
          };

          if (!testConfig.apiKey || !testConfig.endpoint || !testConfig.model) {
              result.style.display = 'block';
              result.style.color = '#dc2626';
              result.textContent = '❌ 請填寫完整配置';
              return;
          }

          btn.disabled = true;
          btn.textContent = '測試中...';
          result.style.display = 'none';

          try {
              if (!window.EmbeddingClient || typeof window.EmbeddingClient.saveConfig !== 'function') {
                  const ok = await ensureEmbeddingClientLoaded();
                  if (!ok) throw new Error('EmbeddingClient 未載入');
              }
              window.EmbeddingClient.saveConfig({ ...testConfig, enabled: true });
              const vector = await window.EmbeddingClient.embed('測試文字');

              result.style.display = 'block';
              result.style.color = '#059669';
              result.textContent = `✅ 連線成功！向量維度: ${vector.length}`;
          } catch (error) {
              result.style.display = 'block';
              result.style.color = '#dc2626';
              result.textContent = `❌ 連線失敗: ${error.message}`;
          } finally {
              btn.disabled = false;
              btn.textContent = '測試連線';
          }
      };

      // 儲存配置
      $('emb-save-km').onclick = async () => {
          let baseUrl = $('emb-endpoint-km').value.trim();
          // 自動補全 /embeddings 路徑
          if (baseUrl && !baseUrl.endsWith('/embeddings')) {
              baseUrl = baseUrl.replace(/\/+$/, '') + '/embeddings';
          }

          const newConfig = {
              enabled: $('emb-enabled-km').checked,
              provider: $('emb-provider-km').value,
              apiKey: $('emb-api-key-km').value,
              endpoint: baseUrl,
              model: $('emb-model-km').value,
              dimensions: parseInt($('emb-dimensions-km').value) || null,
              concurrency: Math.max(1, Math.min(parseInt($('emb-concurrency-km').value) || 5, 50))
          };

          if (!window.EmbeddingClient || typeof window.EmbeddingClient.saveConfig !== 'function') {
              const ok = await ensureEmbeddingClientLoaded();
              if (!ok) { alert('❌ 儲存失敗：EmbeddingClient 未載入'); return; }
          }
          window.EmbeddingClient.saveConfig(newConfig);
          if (typeof showNotification === 'function') {
              showNotification('向量搜尋配置已儲存', 'success');
          } else {
              alert('配置已儲存');
          }
      };

      // Rerank: 服務商切換（僅 OpenAI 格式顯示“獲取列表”）
      $('rerank-provider-km').onchange = function() {
          const provider = this.value;
          const fetchBtn = $('rerank-fetch-models-km');
          const hint = $('rerank-model-hint-km');
          const endpointInput = $('rerank-endpoint-km');

          if (provider === 'openai') {
              fetchBtn.style.display = 'block';
              hint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
              if (!endpointInput.value.trim()) endpointInput.placeholder = 'https://api.openai.com/v1';
          } else {
              fetchBtn.style.display = 'none';
              hint.textContent = '請輸入服務商支援的重排模型ID';
              if (!endpointInput.value.trim()) {
                  endpointInput.placeholder = provider === 'jina' ? 'https://api.jina.ai/v1' : 'https://api.cohere.ai/v1';
              }
          }
      };

      // 初始化 Rerank 提示與按鈕顯示
      (function() {
          const provider = ($('rerank-provider-km')?.value) || 'jina';
          const fetchBtn = $('rerank-fetch-models-km');
          const hint = $('rerank-model-hint-km');
          const endpointInput = $('rerank-endpoint-km');
          if (provider === 'openai') {
              fetchBtn.style.display = 'block';
              hint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
              if (!endpointInput.value.trim()) endpointInput.placeholder = 'https://api.openai.com/v1';
          } else {
              fetchBtn.style.display = 'none';
              hint.textContent = '請輸入服務商支援的重排模型ID';
          }
      })();

      // Rerank: 獲取模型列表（OpenAI 格式）
      $('rerank-fetch-models-km').onclick = async () => {
          const btn = $('rerank-fetch-models-km');
          const modelInput = $('rerank-model-km');
          const hint = $('rerank-model-hint-km');
          const apiKey = $('rerank-api-key-km').value;
          let baseUrl = $('rerank-endpoint-km').value.trim();

          if (!apiKey) {
              hint.style.color = '#dc2626';
              hint.textContent = '❌ 請先輸入 API Key';
              setTimeout(() => { hint.style.color = '#6b7280'; hint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取'; }, 3000);
              return;
          }

          if (!baseUrl) {
              baseUrl = 'https://api.openai.com/v1';
          }

          const modelsEndpoint = baseUrl.replace(/\/+$/, '') + '/models';

          btn.textContent = '獲取中...';
          btn.disabled = true;
          hint.style.color = '#6b7280';
          hint.textContent = '正在獲取模型列表...';

          try {
              const response = await fetch(modelsEndpoint, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
              if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              const data = await response.json();
              const models = data.data || [];
              const rerankModels = models.filter(m => {
                  const id = (m.id || '').toLowerCase();
                  return id.includes('rerank') || id.includes('rank') || id.includes('relevance') || id.includes('search');
              });
              const list = rerankModels.length > 0 ? rerankModels : models;
              if (list.length === 0) {
                  hint.style.color = '#f59e0b';
                  hint.textContent = '⚠️ 未從服務端獲取到模型列表';
                  setTimeout(() => { hint.style.color = '#6b7280'; hint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取'; }, 3000);
                  return;
              }
              showRerankModelSelector(list, modelInput);
              hint.style.color = '#059669';
              hint.textContent = `✅ 找到 ${list.length} 個模型`;
              setTimeout(() => { hint.style.color = '#6b7280'; hint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取'; }, 3000);
          } catch (error) {
              hint.style.color = '#dc2626';
              hint.textContent = `❌ 獲取失敗: ${error.message}`;
              setTimeout(() => { hint.style.color = '#6b7280'; hint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取'; }, 3000);
          } finally {
              btn.textContent = '獲取列表';
              btn.disabled = false;
          }
      };

      // Rerank: 模型檢測
      $('rerank-check-model-km').onclick = async () => {
          const btn = $('rerank-check-model-km');
          const modelId = $('rerank-model-km').value.trim();
          const provider = $('rerank-provider-km').value;
          const apiKey = $('rerank-api-key-km').value;
          let baseUrl = $('rerank-endpoint-km').value.trim();
          const hint = $('rerank-model-hint-km');

          if (!modelId) {
              hint.style.color = '#dc2626';
              hint.textContent = '❌ 請輸入模型ID';
              setTimeout(() => { hint.style.color = '#6b7280'; hint.textContent = '請輸入服務商支援的重排模型ID；OpenAI格式可點選“獲取列表”'; }, 2500);
              return;
          }
          if (!apiKey) {
              hint.style.color = '#dc2626';
              hint.textContent = '❌ 請輸入 API Key';
              setTimeout(() => { hint.style.color = '#6b7280'; hint.textContent = '請輸入服務商支援的重排模型ID；OpenAI格式可點選“獲取列表”'; }, 2500);
              return;
          }

          btn.disabled = true;
          btn.textContent = '檢測中...';
          hint.style.color = '#6b7280';
          hint.textContent = '正在檢測模型...';

          try {
              if (provider === 'openai') {
                  if (!baseUrl) baseUrl = 'https://api.openai.com/v1';
                  const modelsEndpoint = baseUrl.replace(/\/+$/, '') + '/models';
                  const resp = await fetch(modelsEndpoint, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                  const data = await resp.json();
                  const models = (data.data || []).map(m => m.id);
                  if (models.includes(modelId)) {
                      hint.style.color = '#059669';
                      hint.textContent = '✅ 模型可用';
                  } else {
                      hint.style.color = '#f59e0b';
                      hint.textContent = '⚠️ 未在列表中找到該模型（可能仍可用）';
                  }
              } else {
                  const endpoint = (baseUrl || (provider === 'jina' ? 'https://api.jina.ai/v1' : 'https://api.cohere.ai/v1')).replace(/\/+$/, '') + '/rerank';
                  const resp = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ model: modelId, query: 'ping', documents: ['pong'], top_n: 1 })
                  });
                  if (resp.ok) {
                      hint.style.color = '#059669';
                      hint.textContent = '✅ 模型可用';
                  } else {
                      const text = await resp.text();
                      throw new Error(`${resp.status} ${text}`);
                  }
              }
          } catch (error) {
              hint.style.color = '#dc2626';
              hint.textContent = `❌ 檢測失敗: ${error.message}`;
          } finally {
              btn.disabled = false;
              btn.textContent = '檢測模型';
          }
      };

      // 重排測試連線
      $('rerank-test-km').onclick = async () => {
          const btn = $('rerank-test-km');
          const result = $('rerank-test-result-km');

          // 自動補全 /rerank 路徑
          let rerankBase = $('rerank-endpoint-km').value.trim();
          if (rerankBase && !/\/rerank\/?$/.test(rerankBase)) {
              rerankBase = rerankBase.replace(/\/+$/, '') + '/rerank';
          }

          const testConfig = {
              provider: $('rerank-provider-km').value,
              apiKey: $('rerank-api-key-km').value,
              endpoint: rerankBase,
              model: $('rerank-model-km').value,
              topN: parseInt($('rerank-top-n-km').value) || 10
          };

          if (!testConfig.apiKey || !testConfig.model) {
              result.style.display = 'block';
              result.style.color = '#dc2626';
              result.textContent = '❌ 請填寫完整配置';
              return;
          }

          btn.disabled = true;
          btn.textContent = '測試中...';
          result.style.display = 'none';

          try {
              if (!window.RerankClient) {
                  throw new Error('RerankClient 未載入');
              }

              window.RerankClient.saveConfig({ ...testConfig, enabled: true });
              const testQuery = '測試查詢';
              const testDocs = ['文件1內容', '文件2內容', '文件3內容'];
              const results = await window.RerankClient.rerank(testQuery, testDocs);

              result.style.display = 'block';
              result.style.color = '#059669';
              result.textContent = `✅ 連線成功！返回 ${results.length} 個結果`;
          } catch (error) {
              result.style.display = 'block';
              result.style.color = '#dc2626';
              result.textContent = `❌ 連線失敗: ${error.message}`;
          } finally {
              btn.disabled = false;
              btn.textContent = '測試連線';
          }
      };

      // 重排儲存配置（補全 /rerank）
      $('rerank-save-km').onclick = () => {
          // 獲取選中的scope
          const scopeRadios = document.getElementsByName('rerank-scope-km');
          let scope = 'vector-only';
          for (const radio of scopeRadios) {
              if (radio.checked) {
                  scope = radio.value;
                  break;
              }
          }

          // 自動補全 /rerank 路徑
          let rerankBase = $('rerank-endpoint-km').value.trim();
          if (rerankBase && !/\/rerank\/?$/.test(rerankBase)) {
              rerankBase = rerankBase.replace(/\/+$/, '') + '/rerank';
          }

          const newConfig = {
              enabled: $('rerank-enabled-km').checked,
              scope: scope,
              provider: $('rerank-provider-km').value,
              apiKey: $('rerank-api-key-km').value,
              endpoint: rerankBase,
              model: $('rerank-model-km').value,
              topN: parseInt($('rerank-top-n-km').value) || 10
          };

          if (!window.RerankClient) {
              alert('RerankClient 未載入');
              return;
          }

          window.RerankClient.saveConfig(newConfig);
          if (typeof showNotification === 'function') {
              showNotification('重排配置已儲存', 'success');
          } else {
              alert('配置已儲存');
          }
      };
  }

  // 匯出到全域作用域
  window.UIEmbeddingConfigRenderer = {
    renderEmbeddingConfig
  };

})(window);
