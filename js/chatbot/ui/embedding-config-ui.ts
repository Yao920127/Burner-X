// js/chatbot/ui/embedding-config-ui.js
// Embedding API 配置面板
(function(window, document) {
  'use strict';

  if (window.EmbeddingConfigUILoaded) return;

  const PRESETS = {
    openai: {
      name: 'OpenAI格式',
      endpoint: 'https://api.openai.com/v1/embeddings'
    },
    jina: {
      name: 'Jina AI',
      endpoint: 'https://api.jina.ai/v1/embeddings'
    },
    zhipu: {
      name: '智譜AI',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/embeddings'
    },
    alibaba: {
      name: '阿里雲百鍊',
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
    }
  };

  // 阿里雲百鍊支援的模型和維度
  const ALIBABA_MODELS = {
    'text-embedding-v1': { name: 'text-embedding-v1 (中文)', dims: 1536 },
    'text-embedding-v2': { name: 'text-embedding-v2 (多語言)', dims: 1536 },
    'text-embedding-v3': { name: 'text-embedding-v3 (高效能)', dims: 1024 },
    'text-embedding-v4': { name: 'text-embedding-v4 (多語言，支援2048維)', dims: 2048 }
  };

  function createModal() {
    let modal = document.getElementById('embedding-config-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'embedding-config-modal';
    modal.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 520px; max-width: 90vw; max-height: 80vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      display: none; z-index: 100001; padding: 0;
      overflow: hidden;
    `;

    modal.innerHTML = `
      <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">向量搜尋與重排配置</h3>
          <button id="emb-close-btn" style="border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer;">&times;</button>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display: flex; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
        <button id="emb-tab-vector" class="emb-tab active" style="flex: 1; padding: 12px 16px; border: none; background: none; font-size: 14px; font-weight: 600; color: #3b82f6; cursor: pointer; border-bottom: 2px solid #3b82f6; transition: all 0.2s;">
          向量搜尋
        </button>
        <button id="emb-tab-rerank" class="emb-tab" style="flex: 1; padding: 12px 16px; border: none; background: none; font-size: 14px; font-weight: 500; color: #6b7280; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s;">
          重排 (Rerank)
        </button>
      </div>

      <!-- Tab Content Container -->
      <div style="padding: 24px; max-height: calc(80vh - 130px); overflow-y: auto;">
        <!-- 向量搜尋 Tab -->
        <div id="emb-vector-content" class="emb-tab-content">
        <!-- 啟用開關 -->
        <div style="margin-bottom: 20px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="emb-enabled" style="width: 18px; height: 18px; margin-right: 10px; cursor: pointer;">
            <span style="font-weight: 600; color: #111827;">啟用向量搜尋</span>
          </label>
          <p style="margin: 8px 0 0 28px; font-size: 13px; color: #6b7280;">啟用後將使用語義相似度檢索，提升檢索準確率</p>
        </div>

        <!-- 服務商選擇 -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">服務商</label>
          <select id="emb-provider" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff;">
            <option value="openai">OpenAI格式</option>
            <option value="jina">Jina AI (多語言最佳化)</option>
            <option value="zhipu">智譜AI (GLM)</option>
            <option value="alibaba">阿里雲百鍊</option>
          </select>
        </div>

        <!-- API Key -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">API Key</label>
          <input type="password" id="emb-api-key" placeholder="sk-..." style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
        </div>

        <!-- API端點 -->
        <div id="emb-endpoint-wrap" style="margin-bottom: 20px; display: none;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
            Base URL
            <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(如 https://api.openai.com/v1)</span>
          </label>
          <input type="text" id="emb-endpoint" placeholder="https://api.openai.com/v1" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
        </div>

        <!-- 模型選擇 -->
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">模型ID</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="emb-model" placeholder="請輸入模型ID，如: text-embedding-3-small" style="flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
            <button id="emb-fetch-models-btn" style="display: none; padding: 10px 12px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap; transition: all 0.2s;">
              獲取列表
            </button>
          </div>
          <p id="emb-model-hint" style="margin-top: 6px; font-size: 12px; color: #6b7280;">
            請輸入服務商支援的嵌入模型ID
          </p>
        </div>

        <!-- 向量維度 (OpenAI可選) -->
        <div id="emb-dims-wrap" style="margin-bottom: 20px; display: none;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
            向量維度
            <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(可選，留空使用預設)</span>
          </label>
          <input type="number" id="emb-dimensions" placeholder="1536" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
          <p style="margin: 6px 0 0 0; font-size: 12px; color: #6b7280;">降低維度可減少儲存和計算，但可能影響精度</p>
        </div>

        <!-- 測試按鈕 -->
        <div style="margin-bottom: 20px;">
          <button id="emb-test-btn" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s;">
            測試連線
          </button>
          <div id="emb-test-result" style="margin-top: 8px; font-size: 13px; display: none;"></div>
        </div>

        <!-- 儲存按鈕 -->
        <div style="display: flex; gap: 12px;">
          <button id="emb-save-btn" style="flex: 1; padding: 12px; border: none; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
            儲存配置
          </button>
          <button id="emb-cancel-btn" style="flex: 1; padding: 12px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
            取消
          </button>
        </div>

        <!-- 索引管理 -->
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;">索引管理</h4>
          <div id="emb-index-status" style="padding: 10px 12px; background: #f9fafb; border-radius: 6px; font-size: 13px; color: #6b7280; margin-bottom: 12px;">
            未建立索引
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="emb-build-index-btn" style="flex: 1; padding: 8px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 6px; font-size: 13px; cursor: pointer;">
              建立索引
            </button>
            <button id="emb-rebuild-index-btn" style="flex: 1; padding: 8px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 6px; font-size: 13px; cursor: pointer;">
              重建索引
            </button>
          </div>
        </div>
        </div>

        <!-- 重排 Tab -->
        <div id="emb-rerank-content" class="emb-tab-content" style="display: none;">
          <!-- 啟用開關 -->
          <div style="margin-bottom: 20px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="rerank-enabled" style="width: 18px; height: 18px; margin-right: 10px; cursor: pointer;">
              <span style="font-weight: 600; color: #111827;">啟用重排</span>
            </label>
            <p style="margin: 8px 0 0 28px; font-size: 13px; color: #6b7280;">啟用後將對搜尋結果進行二次排序，提升相關性</p>
          </div>

          <!-- 應用範圍選擇 -->
          <div id="rerank-scope-wrap" style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">應用範圍</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="radio" name="rerank-scope" value="vector-only" style="width: 16px; height: 16px; margin-right: 8px; cursor: pointer;">
                <span style="font-size: 14px; color: #374151;">僅向量搜尋使用重排</span>
              </label>
              <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="radio" name="rerank-scope" value="all" style="width: 16px; height: 16px; margin-right: 8px; cursor: pointer;">
                <span style="font-size: 14px; color: #374151;">所有搜尋都使用重排（包括BM25等）</span>
              </label>
            </div>
            <p style="margin-top: 6px; font-size: 12px; color: #6b7280;">選擇重排功能的應用範圍，失敗時自動降級為原始排序</p>
          </div>

          <!-- 服務商選擇 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">服務商</label>
            <select id="rerank-provider" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff;">
              <option value="jina">Jina AI Reranker</option>
              <option value="cohere">Cohere Rerank</option>
              <option value="openai">OpenAI格式</option>
            </select>
          </div>

          <!-- API Key -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">API Key</label>
            <input type="password" id="rerank-api-key" placeholder="jina_..." style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
          </div>

          <!-- API端點 -->
          <div id="rerank-endpoint-wrap" style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              Base URL
              <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(可選)</span>
            </label>
            <input type="text" id="rerank-endpoint" placeholder="https://api.jina.ai/v1/rerank" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
          </div>

          <!-- 模型選擇 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">模型ID</label>
            <input type="text" id="rerank-model" placeholder="jina-reranker-v2-base-multilingual" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
            <p id="rerank-model-hint" style="margin-top: 6px; font-size: 12px; color: #6b7280;">
              請輸入服務商支援的重排模型ID
            </p>
          </div>

          <!-- Top N -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">
              Top N
              <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(返回前N個結果)</span>
            </label>
            <input type="number" id="rerank-top-n" placeholder="10" value="10" min="1" max="50" style="width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
            <p style="margin: 6px 0 0 0; font-size: 12px; color: #6b7280;">建議 5-20，根據實際需求調整</p>
          </div>

          <!-- 測試按鈕 -->
          <div style="margin-bottom: 20px;">
            <button id="rerank-test-btn" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s;">
              測試連線
            </button>
            <div id="rerank-test-result" style="margin-top: 8px; font-size: 13px; display: none;"></div>
          </div>

          <!-- 儲存按鈕 -->
          <div style="display: flex; gap: 12px;">
            <button id="rerank-save-btn" style="flex: 1; padding: 12px; border: none; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
              儲存配置
            </button>
            <button id="rerank-cancel-btn" style="flex: 1; padding: 12px; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
              取消
            </button>
          </div>

          <!-- 說明 -->
          <div style="margin-top: 24px; padding: 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;">
            <p style="margin: 0; font-size: 13px; color: #0c4a6e;">
              💡 <strong>重排工作原理</strong>：對向量搜尋的結果進行二次排序，使用更精確的模型計算相關性分數，提升最終結果的準確度。
            </p>
          </div>
        </div>
      </div>
    `;

    // 遮罩層
    const overlay = document.createElement('div');
    overlay.id = 'embedding-config-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5); display: none; z-index: 9999;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // 綁定事件
    bindEvents(modal, overlay);

    return modal;
  }

  function bindEvents(modal, overlay) {
    const $ = (id) => document.getElementById(id);

    // Tab切換
    const tabs = document.querySelectorAll('.emb-tab');
    const tabContents = document.querySelectorAll('.emb-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // 更新tab樣式
        tabs.forEach(t => {
          t.classList.remove('active');
          t.style.color = '#6b7280';
          t.style.fontWeight = '500';
          t.style.borderBottomColor = 'transparent';
        });
        tab.classList.add('active');
        tab.style.color = '#3b82f6';
        tab.style.fontWeight = '600';
        tab.style.borderBottomColor = '#3b82f6';

        // 切換內容
        const targetId = tab.id.replace('-tab-', '-') + '-content';
        tabContents.forEach(content => {
          content.style.display = 'none';
        });
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.style.display = 'block';
        }
      });
    });

    // 關閉
    $('emb-close-btn').onclick = () => close();
    $('emb-cancel-btn').onclick = () => close();
    $('rerank-cancel-btn').onclick = () => close();
    overlay.onclick = () => close();

    // 服務商切換
    $('emb-provider').onchange = function() {
      const provider = this.value;
      updateProviderUI(provider);
    };

    // 獲取模型列表（僅 OpenAI格式）
    $('emb-fetch-models-btn').onclick = async () => {
      await fetchModels();
    };

    // 測試連線
    $('emb-test-btn').onclick = async () => {
      await testConnection();
    };

    // 儲存
    $('emb-save-btn').onclick = () => {
      saveConfig();
    };

    // 建立索引
    $('emb-build-index-btn').onclick = async () => {
      await buildIndex(false);
    };

    // 重建索引
    $('emb-rebuild-index-btn').onclick = async () => {
      if (confirm('重建索引將刪除現有索引，確定繼續嗎?')) {
        await buildIndex(true);
      }
    };

    // 重排tab事件
    // 測試連線
    $('rerank-test-btn').onclick = async () => {
      await testRerankConnection();
    };

    // 儲存配置
    $('rerank-save-btn').onclick = () => {
      saveRerankConfig();
    };
  }

  function updateProviderUI(provider) {
    const $ = (id) => document.getElementById(id);
    const preset = PRESETS[provider];

    // 顯示/隱藏獲取模型列表按鈕（僅 OpenAI格式支援）
    const fetchBtn = $('emb-fetch-models-btn');
    const modelHint = $('emb-model-hint');
    if (provider === 'openai') {
      fetchBtn.style.display = 'block';
      modelHint.textContent = '可手動輸入模型ID，或點選"獲取列表"從伺服器獲取';
    } else {
      fetchBtn.style.display = 'none';
      modelHint.textContent = '請輸入服務商支援的嵌入模型ID';
    }

    // 更新端點（所有服務商都顯示，允許修改）
    $('emb-endpoint-wrap').style.display = 'block';
    $('emb-endpoint').value = preset?.endpoint || window.EmbeddingClient?.config.endpoint || '';

    // OpenAI和阿里雲百鍊支援自定義維度
    $('emb-dims-wrap').style.display = (provider === 'openai' || provider === 'alibaba') ? 'block' : 'none';

    // 當選擇阿里雲百鍊時，更新維度提示
    if (provider === 'alibaba') {
      const dimsInput = $('emb-dimensions');
      const dimsHint = dimsInput.nextElementSibling;
      const modelInput = $('emb-model');

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
  }


  async function fetchModels() {
    const $ = (id) => document.getElementById(id);
    const btn = $('emb-fetch-models-btn');
    const modelInput = $('emb-model');
    const modelHint = $('emb-model-hint');

    const provider = $('emb-provider').value;
    const apiKey = $('emb-api-key').value;
    let endpoint = $('emb-endpoint').value;

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

    // 構建 models 端點
    let modelsEndpoint = endpoint;
    if (modelsEndpoint.endsWith('/embeddings')) {
      modelsEndpoint = modelsEndpoint.replace('/embeddings', '/models');
    } else if (modelsEndpoint.endsWith('/v1')) {
      modelsEndpoint = modelsEndpoint + '/models';
    } else if (!modelsEndpoint.endsWith('/models')) {
      modelsEndpoint = modelsEndpoint.replace(/\/$/, '') + '/v1/models';
    }

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

      // 建立選擇對話方塊
      showModelSelector(embeddingModels, modelInput);
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
  }

  function showModelSelector(models, targetInput) {
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
      <button id="model-selector-close" style="border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1;">&times;</button>
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
    header.querySelector('#model-selector-close').onclick = closeHandler;

    document.body.appendChild(overlay);
    document.body.appendChild(container);
  }

  async function testConnection() {
    const $ = (id) => document.getElementById(id);
    const resultDiv = $('emb-test-result');
    const btn = $('emb-test-btn');

    const config = {
      provider: $('emb-provider').value,
      apiKey: $('emb-api-key').value,
      endpoint: $('emb-endpoint').value || PRESETS[$('emb-provider').value].endpoint,
      model: $('emb-model').value,
      dimensions: parseInt($('emb-dimensions').value) || null
    };

    if (!config.apiKey) {
      resultDiv.style.display = 'block';
      resultDiv.style.color = '#dc2626';
      resultDiv.textContent = '❌ 請輸入API Key';
      return;
    }

    btn.textContent = '測試中...';
    btn.disabled = true;
    resultDiv.style.display = 'none';

    try {
      // 確保 EmbeddingClient 已載入
      if (!window.EmbeddingClient || typeof window.EmbeddingClient.saveConfig !== 'function') {
        // 嘗試動態載入
        try {
          const scripts = Array.from(document.getElementsByTagName('script'));
          const sem = scripts.find(s => (s.src || '').includes('semantic-vector-search.js'));
          const candidates = [];
          if (sem && sem.src) candidates.push(sem.src.replace('semantic-vector-search.js', 'embedding-client.js'));
          const rer = scripts.find(s => (s.src || '').includes('rerank-client.js'));
          if (rer && rer.src) candidates.push(rer.src.replace('rerank-client.js', 'embedding-client.js'));
          candidates.push('../../js/chatbot/agents/embedding-client.js');
          for (const url of Array.from(new Set(candidates))) {
            await new Promise((resolve, reject) => { const s=document.createElement('script'); s.src=url; s.async=true; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); });
            if (window.EmbeddingClient && typeof window.EmbeddingClient.saveConfig === 'function') break;
          }
        } catch(_) {}
      }
      if (!window.EmbeddingClient || typeof window.EmbeddingClient.saveConfig !== 'function') {
        throw new Error('EmbeddingClient 未載入');
      }
      window.EmbeddingClient.saveConfig({ ...config, enabled: true });

      // 測試呼叫
      const testText = '測試文字';
      const vector = await window.EmbeddingClient.embed(testText);

      resultDiv.style.display = 'block';
      resultDiv.style.color = '#059669';
      resultDiv.textContent = `✅ 連線成功！向量維度: ${vector.length}`;

    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.style.color = '#dc2626';
      resultDiv.textContent = `❌ 連線失敗: ${error.message}`;
    } finally {
      btn.textContent = '測試連線';
      btn.disabled = false;
    }
  }

  function saveConfig() {
    const $ = (id) => document.getElementById(id);

    const config = {
      enabled: $('emb-enabled').checked,
      provider: $('emb-provider').value,
      apiKey: $('emb-api-key').value,
      endpoint: $('emb-endpoint').value || PRESETS[$('emb-provider').value].endpoint,
      model: $('emb-model').value,
      dimensions: parseInt($('emb-dimensions').value) || null
    };

    if (!window.EmbeddingClient || typeof window.EmbeddingClient.saveConfig !== 'function') {
      if (window.ChatbotUtils && window.ChatbotUtils.showToast) {
        window.ChatbotUtils.showToast('儲存失敗：EmbeddingClient 未載入', 'error', 3000);
      } else {
        alert('❌ 儲存失敗：EmbeddingClient 未載入');
      }
      return;
    }
    if (!window.EmbeddingClient || typeof window.EmbeddingClient.saveConfig !== 'function') {
      if (window.ChatbotUtils && window.ChatbotUtils.showToast) {
        window.ChatbotUtils.showToast('儲存失敗：EmbeddingClient 未載入', 'error', 3000);
      } else {
        alert('❌ 儲存失敗：EmbeddingClient 未載入');
      }
      return;
    }
    window.EmbeddingClient.saveConfig(config);

    if (window.ChatbotUtils?.showToast) {
      window.ChatbotUtils.showToast('配置已儲存', 'success', 2000);
    }

    close();
  }

  // 重排相關函式
  async function testRerankConnection() {
    const $ = (id) => document.getElementById(id);
    const resultDiv = $('rerank-test-result');
    const btn = $('rerank-test-btn');

    const config = {
      provider: $('rerank-provider').value,
      apiKey: $('rerank-api-key').value,
      endpoint: $('rerank-endpoint').value,
      model: $('rerank-model').value,
      topN: parseInt($('rerank-top-n').value) || 10
    };

    if (!config.apiKey) {
      resultDiv.style.display = 'block';
      resultDiv.style.color = '#dc2626';
      resultDiv.textContent = '❌ 請輸入API Key';
      return;
    }

    btn.textContent = '測試中...';
    btn.disabled = true;
    resultDiv.style.display = 'none';

    try {
      // 臨時儲存配置並測試
      if (!window.RerankClient) {
        throw new Error('RerankClient 未載入');
      }

      window.RerankClient.saveConfig({ ...config, enabled: true });

      // 測試呼叫
      const testQuery = '測試查詢';
      const testDocs = ['文件1內容', '文件2內容', '文件3內容'];
      const results = await window.RerankClient.rerank(testQuery, testDocs);

      resultDiv.style.display = 'block';
      resultDiv.style.color = '#059669';
      resultDiv.textContent = `✅ 連線成功！返回 ${results.length} 個結果`;

    } catch (error) {
      resultDiv.style.display = 'block';
      resultDiv.style.color = '#dc2626';
      resultDiv.textContent = `❌ 連線失敗: ${error.message}`;
    } finally {
      btn.textContent = '測試連線';
      btn.disabled = false;
    }
  }

  function saveRerankConfig() {
    const $ = (id) => document.getElementById(id);

    // 獲取選中的scope
    const scopeRadios = document.getElementsByName('rerank-scope');
    let scope = 'vector-only';
    for (const radio of scopeRadios) {
      if (radio.checked) {
        scope = radio.value;
        break;
      }
    }

    const config = {
      enabled: $('rerank-enabled').checked,
      scope: scope,
      provider: $('rerank-provider').value,
      apiKey: $('rerank-api-key').value,
      endpoint: $('rerank-endpoint').value,
      model: $('rerank-model').value,
      topN: parseInt($('rerank-top-n').value) || 10
    };

    if (!window.RerankClient) {
      alert('RerankClient 未載入');
      return;
    }

    window.RerankClient.saveConfig(config);

    if (window.ChatbotUtils?.showToast) {
      window.ChatbotUtils.showToast('重排配置已儲存', 'success', 2000);
    }

    close();
  }

  async function buildIndex(forceRebuild) {
    const groups = window.data?.semanticGroups;
    if (!groups || groups.length === 0) {
      alert('當前文件沒有意群資料，請先生成意群');
      return;
    }

    const docId = window.ChatbotCore?.getCurrentDocId() || window.data?.id || 'default';

    try {
      await window.SemanticVectorSearch.indexGroups(groups, docId, {
        showProgress: true,
        forceRebuild
      });
      await updateIndexStatus();
    } catch (error) {
      alert(`建立索引失敗: ${error.message}`);
    }
  }

  async function updateIndexStatus() {
    const $ = (id) => document.getElementById(id);
    const statusDiv = $('emb-index-status');

    if (!window.SemanticVectorSearch) {
      statusDiv.textContent = '向量搜尋模組未載入';
      return;
    }

    const docId = window.ChatbotCore?.getCurrentDocId() || window.data?.id || 'default';

    try {
      const status = await window.SemanticVectorSearch.getIndexStatus(docId);
      if (status.indexed) {
        statusDiv.innerHTML = `
          <div style="color: #059669; font-weight: 500;">✓ 已建立索引</div>
          <div style="margin-top: 4px; color: #6b7280;">
            意群數: ${status.count} | 維度: ${status.dimensions} | 大小: ${status.size}
          </div>
        `;
      } else {
        statusDiv.textContent = '未建立索引';
      }
    } catch (error) {
      statusDiv.textContent = '無法獲取索引狀態';
    }
  }

  function open() {
    const modal = createModal();
    const overlay = document.getElementById('embedding-config-overlay');
    const $ = (id) => document.getElementById(id);

    // 載入向量搜尋配置
    const config = window.EmbeddingClient?.config || {};
    $('emb-enabled').checked = config.enabled || false;
    $('emb-provider').value = config.provider || 'openai';
    $('emb-api-key').value = config.apiKey || '';
    $('emb-model').value = config.model || 'text-embedding-3-small';
    $('emb-dimensions').value = config.dimensions || '';

    updateProviderUI(config.provider || 'openai');
    updateIndexStatus();

    // 載入重排配置
    const rerankConfig = window.RerankClient?.config || {};
    $('rerank-enabled').checked = rerankConfig.enabled || false;
    $('rerank-provider').value = rerankConfig.provider || 'jina';
    $('rerank-api-key').value = rerankConfig.apiKey || '';
    $('rerank-endpoint').value = rerankConfig.endpoint || '';
    $('rerank-model').value = rerankConfig.model || 'jina-reranker-v2-base-multilingual';
    $('rerank-top-n').value = rerankConfig.topN || 10;

    // 設定scope單選按鈕
    const scope = rerankConfig.scope || 'vector-only';
    const scopeRadios = document.getElementsByName('rerank-scope');
    for (const radio of scopeRadios) {
      if (radio.value === scope) {
        radio.checked = true;
        break;
      }
    }

    overlay.style.display = 'block';
    modal.style.display = 'block';
  }

  function close() {
    const modal = document.getElementById('embedding-config-modal');
    const overlay = document.getElementById('embedding-config-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  // 匯出
  window.EmbeddingConfigUI = { open, close };
  window.EmbeddingConfigUILoaded = true;

  console.log('[EmbeddingConfigUI] 配置面板已載入');

})(window, document);
