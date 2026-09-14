/**
 * ChatbotModelSelectorUI 模型選擇器介面渲染與互動邏輯
 *
 * 主要功能：
 * 1. 渲染自定義模型選擇介面，支援多模型、Batch模型、引數調節等。
 * 2. 負責模型、溫度、最大token、並行等引數的選擇與本地儲存。
 * 3. 綁定所有相關互動事件（切換、引數同步、幫助提示、返回等）。
 * 4. 支援引數的本地持久化與回顯。
 */

/**
 * XSS 防護：安全地轉義 HTML（優先使用 ChatbotUtils，降級到本地實現）
 * @param {string} str - 需要轉義的字串
 * @returns {string} 轉義後的安全字串
 */
function safeEscapeHtmlForModel(str) {
  if (typeof str !== 'string') return '';
  if (typeof window.ChatbotUtils !== 'undefined' && typeof window.ChatbotUtils.escapeHtml === 'function') {
    return window.ChatbotUtils.escapeHtml(str);
  }
  // 降級方案
  return str.replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
  });
}

window.ChatbotModelSelectorUI = {
  /**
   * 渲染模型選擇器主介面，並綁定所有互動事件。
   *
   * 主要邏輯：
   * 1. 隱藏 preset 區和聊天區，顯示模型選擇器。
   * 2. 渲染模型下拉、特殊模型、溫度、並行、最大token等引數輸入。
   * 3. 綁定所有輸入、切換、幫助、返回等事件。
   * 4. 引數變更自動儲存到 localStorage 或呼叫 saveSettings。
   *
   * @param {HTMLElement} mainContentArea - 主內容區容器。
   * @param {HTMLElement} chatBody - 聊天內容區。
   * @param {Array} availableModels - 可用模型列表。
   * @param {object} currentSettings - 當前設定。
   * @param {function} updateChatbotUI - UI重新整理回撥。
   */
  render: function(mainContentArea, chatBody, availableModels, currentSettings, updateChatbotUI) {
    // 隱藏預設和聊天區
    const presetContainer = document.getElementById('chatbot-preset-container');
    if (presetContainer) presetContainer.style.display = 'none';
    if (chatBody) chatBody.style.display = 'none';

    // 處理模型列表和預設選中
    let models = availableModels;
    if (!Array.isArray(models) || models.length === 0) models = [];
    let settings = currentSettings;
    let defaultModelId = settings.selectedCustomModelId || localStorage.getItem('lastSelectedCustomModel') || (models[0]?.id || models[0] || '');

    // 移除已存在的選擇器，防止重複渲染
    let modelSelectorDiv = document.getElementById('chatbot-model-selector');
    if (modelSelectorDiv) modelSelectorDiv.remove();

    // 建立主容器
    modelSelectorDiv = document.createElement('div');
    modelSelectorDiv.id = 'chatbot-model-selector';
    modelSelectorDiv.style.margin = '-30px auto 0 auto';
    modelSelectorDiv.style.maxWidth = '340px';
    modelSelectorDiv.style.background = 'linear-gradient(135deg,#f0f9ff 80%,#e0f2fe 100%)';
    modelSelectorDiv.style.border = '2px dashed #93c5fd';
    modelSelectorDiv.style.borderRadius = '16px';
    modelSelectorDiv.style.padding = '20px 16px 16px 16px';
    modelSelectorDiv.style.maxHeight = '100%';
    modelSelectorDiv.style.overflowY = 'auto';

    // 讀取預設引數
    let defaultTemperature = 0.5;
    let defaultMaxTokens = 8000;
    try {
      if (settings.customModelSettings) {
        defaultTemperature = typeof settings.customModelSettings.temperature === 'number' ? settings.customModelSettings.temperature : defaultTemperature;
        defaultMaxTokens = typeof settings.customModelSettings.max_tokens === 'number' ? settings.customModelSettings.max_tokens : defaultMaxTokens;
      }
    } catch (e) {
      console.error("Error accessing customModelSettings:", e);
    }
    const defaultConcurrency = (window.chatbotActiveOptions && Number.isInteger(window.chatbotActiveOptions.segmentConcurrency))
        ? window.chatbotActiveOptions.segmentConcurrency : 20;

    // 主體HTML結構
    modelSelectorDiv.innerHTML = `
      <div style="text-align:center;font-size:17px;font-weight:700;color:#2563eb;margin-bottom:8px;">選擇自定義模型</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;">
        <span style="font-size:14px;font-weight:500;">預設模型</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="chatbot-detect-gemini-btn" title="檢測 Gemini 可用模型" style="border:1px dashed #93c5fd;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 8px;font-size:12px;">檢測 Gemini</button>
          <button id="chatbot-detect-deepseek-btn" title="檢測 DeepSeek 可用模型" style="border:1px dashed #93c5fd;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 8px;font-size:12px;">檢測 DeepSeek</button>
          <button id="chatbot-detect-tongyi-btn" title="檢測 通義可用模型" style="border:1px dashed #93c5fd;background:#eff6ff;color:#2563eb;border-radius:6px;padding:4px 8px;font-size:12px;">檢測 通義</button>
          <button id="chatbot-add-special-models-btn" style="width:24px;height:24px;border:none;background:transparent;font-size:18px;cursor:pointer;line-height:18px;">＋</button>
        </div>
      </div>
      <div id="chatbot-special-models-container" style="display:none;flex-direction:column;gap:12px;margin-bottom:12px;">
        <div>
          <div style="font-size:14px;color:#1e3a8a;font-weight:500;margin-bottom:4px;">多模態模型</div>
          <select id="chatbot-multimodal-model-select" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #93c5fd;">
            <option value="">使用預設模型</option>
            ${models.map(m => {
              // XSS 防護：轉義模型 ID 和名稱
              const modelId = typeof m === 'string' ? safeEscapeHtmlForModel(m) : safeEscapeHtmlForModel(m.id);
              const modelName = typeof m === 'string' ? safeEscapeHtmlForModel(m) : safeEscapeHtmlForModel(m.name || m.id);
              return `<option value="${modelId}">${modelName}</option>`;
            }).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:14px;color:#1e3a8a;font-weight:500;margin-bottom:4px;">Batch模型</div>
          <select id="chatbot-batch-model-select" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #93c5fd;">
            <option value="">使用預設模型</option>
            ${models.map(m => {
              // XSS 防護：轉義模型 ID 和名稱
              const modelId = typeof m === 'string' ? safeEscapeHtmlForModel(m) : safeEscapeHtmlForModel(m.id);
              const modelName = typeof m === 'string' ? safeEscapeHtmlForModel(m) : safeEscapeHtmlForModel(m.name || m.id);
              return `<option value="${modelId}">${modelName}</option>`;
            }).join('')}
          </select>
        </div>
      </div>
      <select id="chatbot-model-select" style="width:100%;margin-bottom:12px;padding:12px 16px;border-radius:10px;border:2px solid #93c5fd;background:white;color:#1e3a8a;font-size:15px;font-weight:600;outline:none;">
        ${models.length === 0 ? '<option value="">（無可用模型）</option>' : models.map(m => {
          // XSS 防護：轉義模型 ID 和名稱
          const modelId = typeof m === 'string' ? safeEscapeHtmlForModel(m) : safeEscapeHtmlForModel(m.id);
          const modelName = typeof m === 'string' ? safeEscapeHtmlForModel(m) : safeEscapeHtmlForModel(m.name || m.id);
          const rawId = typeof m === 'string' ? m : m.id;
          const selected = rawId === defaultModelId ? ' selected' : '';
          return `<option value="${modelId}"${selected}>${modelName}</option>`;
        }).join('')}
      </select>
      <div style="display:flex;justify-content:space-between;gap:16px;margin:4px 0;">
        <div style="flex:1;">
          <div style="font-size:14px;color:#1e3a8a;font-weight:500;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:4px;">
              <span>溫度 (0-1)</span><button id="chatbot-temp-help-btn" style="background:none;border:none;color:#2563eb;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-circle-info"></i></button>
            </div>
            <input id="chatbot-temp-input" type="number" min="0" max="1" step="0.01" value="${defaultTemperature}" style="width:50px;padding:2px;border-radius:4px;border:1px solid #93c5fd;font-size:14px;" />
          </div>
          <input id="chatbot-temp-range" type="range" min="0" max="1" step="0.01" value="${defaultTemperature}" style="width:100%;margin-top:4px;height:20px;" />
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;color:#1e3a8a;font-weight:500;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:4px;">
              <span>並行上限</span><button id="chatbot-concurrency-help-btn" style="background:none;border:none;color:#2563eb;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-circle-info"></i></button>
            </div>
            <input id="chatbot-concurrency-input" type="number" min="1" max="50" step="1" value="${defaultConcurrency}" style="width:50px;padding:2px;border-radius:4px;border:1px solid #93c5fd;font-size:14px;" />
          </div>
          <input id="chatbot-concurrency-range" type="range" min="1" max="50" step="1" value="${defaultConcurrency}" style="width:100%;margin-top:4px;height:20px;" />
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;color:#1e3a8a;font-weight:500;">
          <div style="display:flex;align-items:center;gap:4px;">
            <span>回覆長度</span><button id="chatbot-maxtokens-help-btn" style="background:none;border:none;color:#2563eb;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-circle-info"></i></button>
          </div>
          <span style="font-size:12px;color:#64748b;">(max_tokens)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <input id="chatbot-maxtokens-range" type="range" min="256" max="32768" step="64" value="${defaultMaxTokens}" style="flex:1;height:24px;" />
          <input id="chatbot-maxtokens-input" type="number" min="256" max="32768" step="1" value="${defaultMaxTokens}" style="width:70px;height:24px;padding:0 4px;border-radius:4px;border:1px solid #93c5fd;font-size:14px;" />
        </div>
      </div>
      <button id="chatbot-model-back-btn" style="margin-top:8px;width:100%;padding:8px 0;font-size:15px;font-weight:600;background:linear-gradient(90deg,#3b82f6,#2563eb);color:white;border:none;border-radius:8px;cursor:pointer;transition:all 0.2s;">返回</button>
    `;

    mainContentArea.insertBefore(modelSelectorDiv, chatBody);

    // 事件綁定區域
    // 展開/收起特殊模型
    const addSpecialBtn = modelSelectorDiv.querySelector('#chatbot-add-special-models-btn');
    const specialContainer = modelSelectorDiv.querySelector('#chatbot-special-models-container');
    if (addSpecialBtn && specialContainer) {
      addSpecialBtn.onclick = () => {
        if (specialContainer.style.display === 'none') {
          specialContainer.style.display = 'flex';
          addSpecialBtn.textContent = '－';
        } else {
          specialContainer.style.display = 'none';
          addSpecialBtn.textContent = '＋';
        }
      };
    }

    // 多模態模型選擇
    const multiSelect = modelSelectorDiv.querySelector('#chatbot-multimodal-model-select');
    if (multiSelect) {
      multiSelect.onchange = e => {
        window.chatbotActiveOptions.multimodalModel = e.target.value;
        let settings = {};
        try { settings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}'); } catch {}
        settings.multimodalModel = e.target.value;
        if (typeof saveSettings === 'function') {
            saveSettings(settings);
        } else {
            localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
        }
      };
      let userSettings = {};
      try { userSettings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}'); } catch {}
      multiSelect.value = userSettings.multimodalModel || '';
      window.chatbotActiveOptions.multimodalModel = userSettings.multimodalModel || '';
    }

    // Batch模型選擇
    const batchSelect = modelSelectorDiv.querySelector('#chatbot-batch-model-select');
    if (batchSelect) {
      batchSelect.onchange = e => {
        window.chatbotActiveOptions.batchModel = e.target.value;
        let settings = {};
        try { settings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}'); } catch {}
        settings.batchModel = e.target.value;
        if (typeof saveSettings === 'function') {
            saveSettings(settings);
        } else {
            localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
        }
      };
      let userSettings = {};
      try { userSettings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}'); } catch {}
      batchSelect.value = userSettings.batchModel || '';
      window.chatbotActiveOptions.batchModel = userSettings.batchModel || '';
    }

    // 並行引數綁定
    const concurrencyInput = modelSelectorDiv.querySelector('#chatbot-concurrency-input');
    const concurrencyRange = modelSelectorDiv.querySelector('#chatbot-concurrency-range');
    function saveConcurrency() {
      let v = parseInt(concurrencyInput.value);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 50) v = 50;
      concurrencyInput.value = v;
      concurrencyRange.value = v;
      window.chatbotActiveOptions.segmentConcurrency = v;
      let settings = {};
      try { settings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}'); } catch {};
      settings.segmentConcurrency = v;
      if (typeof saveSettings === 'function') saveSettings(settings);
      else localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
    }
    if (concurrencyInput && concurrencyRange) {
      concurrencyInput.oninput = saveConcurrency;
      concurrencyRange.oninput = saveConcurrency; // Should be oninput or onchange, not saveConcurrency directly
      concurrencyRange.oninput = () => { concurrencyInput.value = concurrencyRange.value; saveConcurrency(); };
      concurrencyInput.oninput = () => { concurrencyRange.value = concurrencyInput.value; saveConcurrency(); };
    }

    // 幫助按鈕
    const tempHelpBtn = modelSelectorDiv.querySelector('#chatbot-temp-help-btn');
    if (tempHelpBtn) tempHelpBtn.onclick = () => ChatbotUtils.showToast('溫度：調節模型生成的隨機性，0表示最確定，1表示最隨機', 'info', 3000);
    const concurrencyHelpBtn = modelSelectorDiv.querySelector('#chatbot-concurrency-help-btn');
    if (concurrencyHelpBtn) concurrencyHelpBtn.onclick = () => ChatbotUtils.showToast('並行上限：控制同時處理分段的最大並行請求數', 'info', 3000);
    const maxTokensHelpBtn = modelSelectorDiv.querySelector('#chatbot-maxtokens-help-btn');
    if (maxTokensHelpBtn) maxTokensHelpBtn.onclick = () => ChatbotUtils.showToast('回覆長度：模型最大輸出的token數量', 'info', 3000);

    // 主模型選擇
    const select = document.getElementById('chatbot-model-select');
    if (select) {
      select.onchange = function() {
        localStorage.setItem('lastSelectedCustomModel', this.value);
        let settings = {};
        try {
          settings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}');
        } catch (e) {}
        settings.selectedCustomModelId = this.value;
        if (typeof saveSettings === 'function') {
          saveSettings(settings);
        } else {
          localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
        }
      };
    }

    // 工具：將新模型ID列表追加到主下拉
    async function appendModelsToMainSelect(ids) {
      const mainSelect = document.getElementById('chatbot-model-select');
      if (!mainSelect || !Array.isArray(ids)) return 0;
      const existing = new Set(Array.from(mainSelect.options).map(o => o.value));
      let added = 0;
      ids.forEach(id => {
        const mid = String(id || '').trim();
        if (!mid || existing.has(mid)) return;
        const opt = document.createElement('option');
        opt.value = mid; opt.textContent = mid;
        mainSelect.appendChild(opt);
        added++;
      });
      return added;
    }

    // 檢測 Gemini 可用模型並填充列表（僅噹噹前選擇或預設選擇是 Gemini 時生效）
    const detectGeminiBtn = modelSelectorDiv.querySelector('#chatbot-detect-gemini-btn');
    if (detectGeminiBtn) {
      detectGeminiBtn.onclick = async () => {
        try {
          // 僅在可用 Key 存在時進行
          const keys = (typeof loadModelKeys === 'function') ? (loadModelKeys('gemini') || []) : [];
          const usableKeys = keys.filter(k => k.status !== 'invalid' && k.value);
          if (usableKeys.length === 0) {
            return ChatbotUtils.showToast('請先在模型與Key管理中配置 Gemini 的 API Key', 'warning', 3000);
          }
          const apiKey = usableKeys[0].value.trim();
          detectGeminiBtn.disabled = true;
          detectGeminiBtn.textContent = '檢測中...';
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
          if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
          const data = await resp.json();
          const items = Array.isArray(data.models || data.data) ? (data.models || data.data) : [];
          if (items.length === 0) {
            return ChatbotUtils.showToast('未返回模型列表', 'info', 3000);
          }
          const ids = items.map(m => (m.name ? String(m.name).split('/').pop() : (m.id || ''))).filter(Boolean);
          const added = await appendModelsToMainSelect(ids);
          if (added > 0) ChatbotUtils.showToast(`已加入 ${added} 個 Gemini 模型到列表`, 'success', 3000);
        } catch (e) {
          ChatbotUtils.showToast(`檢測失敗：${e.message}`, 'error', 3000);
        } finally {
          detectGeminiBtn.disabled = false;
          detectGeminiBtn.textContent = '檢測 Gemini';
        }
      };
    }

    // 檢測 DeepSeek 可用模型
    const detectDeepseekBtn = modelSelectorDiv.querySelector('#chatbot-detect-deepseek-btn');
    if (detectDeepseekBtn) {
      detectDeepseekBtn.onclick = async () => {
        try {
          const keys = (typeof loadModelKeys === 'function') ? (loadModelKeys('deepseek') || []) : [];
          const usable = keys.filter(k => k.status !== 'invalid' && k.value);
          if (usable.length === 0) {
            return ChatbotUtils.showToast('請先配置 DeepSeek 的 API Key', 'warning', 3000);
          }
          const apiKey = usable[0].value.trim();
          detectDeepseekBtn.disabled = true; detectDeepseekBtn.textContent = '檢測中...';
          const resp = await fetch('https://api.deepseek.com/v1/models', { headers: { 'Authorization': `Bearer ${apiKey}` } });
          if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
          const data = await resp.json();
          const items = Array.isArray(data.data) ? data.data : [];
          const ids = items.map(m => m.id).filter(Boolean);
          const added = await appendModelsToMainSelect(ids);
          ChatbotUtils.showToast(added > 0 ? `已加入 ${added} 個 DeepSeek 模型到列表` : '未返回模型列表', added > 0 ? 'success' : 'info', 3000);
        } catch (e) {
          ChatbotUtils.showToast(`檢測失敗：${e.message}`, 'error', 3000);
        } finally {
          detectDeepseekBtn.disabled = false; detectDeepseekBtn.textContent = '檢測 DeepSeek';
        }
      };
    }

    // 檢測 通義（DashScope）可用模型
    const detectTongyiBtn = modelSelectorDiv.querySelector('#chatbot-detect-tongyi-btn');
    if (detectTongyiBtn) {
      detectTongyiBtn.onclick = async () => {
        try {
          // 統一使用 'tongyi' 的 Key 列表
          let keys = [];
          if (typeof loadModelKeys === 'function') {
            keys = loadModelKeys('tongyi') || [];
          }
          const usable = keys.filter(k => k.status !== 'invalid' && k.value);
          if (usable.length === 0) {
            return ChatbotUtils.showToast('請先配置 通義 的 API Key', 'warning', 3000);
          }
          const apiKey = usable[0].value.trim();
          detectTongyiBtn.disabled = true; detectTongyiBtn.textContent = '檢測中...';
          // 使用 OpenAI 相容模式的模型列表端點（使用者指定）
          const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', { headers: { 'Authorization': `Bearer ${apiKey}` } });
          if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
          const data = await resp.json();
          const items = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : (Array.isArray(data?.data?.models) ? data.data.models : []));
          const ids = items.map(m => (m.model || m.id || m.name)).filter(Boolean);
          const added = await appendModelsToMainSelect(ids);
          ChatbotUtils.showToast(added > 0 ? `已加入 ${added} 個 通義 模型到列表` : '未返回模型列表', added > 0 ? 'success' : 'info', 3000);
        } catch (e) {
          ChatbotUtils.showToast(`檢測失敗：${e.message}`, 'error', 3000);
        } finally {
          detectTongyiBtn.disabled = false; detectTongyiBtn.textContent = '檢測 通義';
        }
      };
    }

    // 檢測 火山（Ark）可用模型
    const detectVolcanoBtn = modelSelectorDiv.querySelector('#chatbot-detect-volcano-btn');
    if (detectVolcanoBtn) {
      // 按使用者要求：不提供線上檢測，改為手動填寫
      detectVolcanoBtn.style.display = 'none';
    }

    // 溫度、最大token引數綁定
    const tempInput = document.getElementById('chatbot-temp-input');
    const tempRange = document.getElementById('chatbot-temp-range');
    const maxTokensInput = document.getElementById('chatbot-maxtokens-input');
    const maxTokensRange = document.getElementById('chatbot-maxtokens-range');

    function saveCustomModelParams() {
      let settings = {};
      try {
        settings = typeof loadSettings === 'function' ? loadSettings() : JSON.parse(localStorage.getItem('paperBurnerSettings') || '{}');
      } catch (e) {}
      if (!settings.customModelSettings) settings.customModelSettings = {};
      let t = parseFloat(tempInput.value);
      if (isNaN(t) || t < 0) t = 0;
      if (t > 1) t = 1;
      let m = parseInt(maxTokensInput.value);
      if (isNaN(m) || m < 256) m = 256;
      if (m > 32768) m = 32768;
      tempInput.value = t;
      tempRange.value = t;
      maxTokensInput.value = m;
      maxTokensRange.value = m;
      settings.customModelSettings.temperature = t;
      settings.customModelSettings.max_tokens = m;
      if (typeof saveSettings === 'function') {
        saveSettings(settings);
      } else {
        localStorage.setItem('paperBurnerSettings', JSON.stringify(settings));
      }
    }

    if (tempInput && tempRange) {
      tempInput.oninput = function() { tempRange.value = tempInput.value; saveCustomModelParams(); };
      tempRange.oninput = function() { tempInput.value = tempRange.value; saveCustomModelParams(); };
    }
    if (maxTokensInput && maxTokensRange) {
      maxTokensInput.oninput = function() { maxTokensRange.value = maxTokensInput.value; saveCustomModelParams(); };
      maxTokensRange.oninput = function() { maxTokensInput.value = maxTokensRange.value; saveCustomModelParams(); };
    }

    // 返回按鈕
    const backBtn = document.getElementById('chatbot-model-back-btn');
    if (backBtn) {
      backBtn.onclick = function() {
        window.isModelSelectorOpen = false;
        // 清除配置快取,以便下次獲取最新配置
        window._cachedChatbotConfig = null;
        updateChatbotUI();
      };
    }
  }
};
