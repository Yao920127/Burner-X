// chatbot/ui/chatbot-model-config-modal.js
// Chatbot 獨立模型配置彈出視窗 UI（無 Tailwind 依賴版本）

(function() {
  'use strict';

  // 預設模型列表
  const PREDEFINED_MODELS = [
    { value: 'mistral', label: 'Mistral Large', description: 'Mistral AI 的旗艦模型', defaultModelId: 'mistral-large-latest' },
    { value: 'deepseek', label: 'DeepSeek', description: 'DeepSeek 對話模型', defaultModelId: 'deepseek-chat' },
    { value: 'gemini', label: 'Google Gemini', description: 'Google 的多模態模型', defaultModelId: 'gemini-1.5-flash' },
    { value: 'tongyi', label: '通義千問', description: '阿里雲通義千問', defaultModelId: 'qwen-plus' },
    { value: 'volcano', label: '火山引擎', description: '位元組跳動火山引擎', defaultModelId: 'doubao-pro-32k' }
  ];

  /**
   * 建立彈出視窗HTML
   */
  function createModalHTML() {
    return `
      <div id="chatbot-model-config-modal" class="chatbot-config-modal">
        <!-- 背景遮罩 -->
        <div class="chatbot-config-overlay" id="chatbot-model-config-overlay"></div>

        <!-- 彈出視窗內容 -->
        <div class="chatbot-config-wrapper">
          <div class="chatbot-config-content">

            <!-- 標頭 -->
            <div class="chatbot-config-header">
              <div class="chatbot-config-header-left">
                <div class="chatbot-config-icon">
                  <i class="fa-solid fa-sliders"></i>
                </div>
                <div>
                  <h3 class="chatbot-config-title">AI智慧助手 - 模型配置</h3>
                  <p class="chatbot-config-subtitle">獨立於翻譯模型的配置</p>
                </div>
              </div>
              <button id="chatbot-model-config-close-btn" class="chatbot-config-close-btn">
                <i class="fa-solid fa-xmark" style="font-size: 20px;"></i>
              </button>
            </div>

            <!-- 內容區域 -->
            <div class="chatbot-config-body">

              <!-- 模型來源選擇 -->
              <div class="chatbot-source-selector chatbot-config-section">
                <label class="chatbot-source-label">
                  <i class="fa-solid fa-layer-group"></i>
                  模型來源
                </label>
                <div class="chatbot-source-buttons">
                  <button id="chatbot-source-predefined-btn" class="chatbot-source-btn active" data-source="predefined">
                    <i class="fa-solid fa-boxes-stacked"></i>
                    <span>預設模型</span>
                  </button>
                  <button id="chatbot-source-custom-btn" class="chatbot-source-btn" data-source="custom">
                    <i class="fa-solid fa-server"></i>
                    <span>自定義源站點</span>
                  </button>
                </div>
              </div>

              <!-- 預設模型選擇區域 -->
              <div id="chatbot-predefined-model-section" class="chatbot-config-section">
                <div class="chatbot-form-group">
                  <label class="chatbot-form-label">
                    <i class="fa-solid fa-robot"></i>
                    選擇預設模型
                  </label>
                  <select id="chatbot-predefined-model-select" class="chatbot-form-select">
                    <option value="">-- 請選擇模型 --</option>
                  </select>
                  <div id="chatbot-predefined-model-description" class="chatbot-form-description chatbot-hidden">
                    <!-- 模型描述將動態插入 -->
                  </div>

                  <!-- 預設模型資訊顯示 -->
                  <div id="chatbot-predefined-model-info" class="chatbot-source-info chatbot-hidden">
                    <div class="chatbot-source-info-item">
                      <i class="fa-solid fa-link"></i>
                      <span class="chatbot-source-info-label">API端點:</span>
                      <span id="chatbot-predefined-endpoint" class="chatbot-source-info-value"></span>
                    </div>
                    <div class="chatbot-source-info-item">
                      <i class="fa-solid fa-cog"></i>
                      <span class="chatbot-source-info-label">請求格式:</span>
                      <span id="chatbot-predefined-format" class="chatbot-source-info-value">OpenAI</span>
                    </div>
                  </div>

                  <!-- 獲取模型列表按鈕 -->
                  <button id="chatbot-fetch-predefined-models-btn" class="chatbot-fetch-models-btn chatbot-hidden" type="button">
                    <i class="fa-solid fa-rotate"></i>
                    <span>獲取可用模型列表</span>
                  </button>
                </div>
              </div>

              <!-- 自定義源站點選擇區域 -->
              <div id="chatbot-custom-source-section" class="chatbot-config-section chatbot-hidden">
                <div class="chatbot-form-group">
                  <label class="chatbot-form-label">
                    <i class="fa-solid fa-server"></i>
                    選擇源站點
                  </label>
                  <select id="chatbot-custom-source-select" class="chatbot-form-select">
                    <option value="">-- 請選擇源站點 --</option>
                  </select>

                  <!-- 無源站點提示 -->
                  <div id="chatbot-no-custom-source-hint" class="chatbot-hint-box chatbot-hidden">
                    <div style="display: flex; align-items: flex-start; gap: 12px;">
                      <i class="fa-solid fa-circle-info" style="color: #3b82f6; font-size: 20px; margin-top: 2px;"></i>
                      <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 6px; color: #1e293b;">未找到自定義源站點</div>
                        <div style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 10px;">
                          請先在【全域設定】→【自定義源站管理】中新增您的自定義源站點，然後即可在此選擇使用。
                        </div>
                        <button id="chatbot-open-global-settings-btn" class="chatbot-hint-button" type="button">
                          <i class="fa-solid fa-gear"></i>
                          <span>開啟全域設定</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- 源站點資訊 -->
                  <div id="chatbot-custom-source-info" class="chatbot-source-info chatbot-hidden">
                    <div class="chatbot-source-info-item">
                      <i class="fa-solid fa-link"></i>
                      <span class="chatbot-source-info-label">API端點:</span>
                      <span id="chatbot-source-endpoint" class="chatbot-source-info-value"></span>
                    </div>
                    <div class="chatbot-source-info-item">
                      <i class="fa-solid fa-cog"></i>
                      <span class="chatbot-source-info-label">請求格式:</span>
                      <span id="chatbot-source-format" class="chatbot-source-info-value"></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 模型ID選擇 (支援搜尋) -->
              <div id="chatbot-model-id-section" class="chatbot-config-section">
                <div class="chatbot-form-group">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <label class="chatbot-form-label" style="margin-bottom: 0;">
                      <i class="fa-solid fa-microchip"></i>
                      模型ID
                      <span style="font-size: 12px; color: #64748b; font-weight: normal;">(可搜尋)</span>
                    </label>
                    <button id="chatbot-refresh-models-btn" class="chatbot-refresh-btn chatbot-hidden" type="button" title="重新整理模型列表">
                      <i class="fa-solid fa-rotate"></i>
                    </button>
                  </div>

                  <!-- 搜尋框 -->
                  <div class="chatbot-search-wrapper">
                    <input
                      type="text"
                      id="chatbot-model-id-search"
                      placeholder="搜尋或輸入模型ID..."
                      class="chatbot-form-input chatbot-search-input"
                    />
                    <i class="fa-solid fa-magnifying-glass chatbot-search-icon"></i>
                  </div>

                  <!-- 可用模型列表 -->
                  <div id="chatbot-available-models-list" class="chatbot-model-list chatbot-hidden">
                    <!-- 模型列表將動態生成 -->
                  </div>

                  <!-- 或者手動輸入 -->
                  <div class="chatbot-text-center" style="margin-top: 12px; font-size: 14px; color: #64748b;">
                    <span>或直接輸入自定義模型ID</span>
                  </div>
                </div>
              </div>

              <!-- 引數配置區域 -->
              <div class="chatbot-params-section chatbot-config-section">
                <h4 class="chatbot-params-title">
                  <i class="fa-solid fa-sliders"></i>
                  高階引數
                </h4>

                <!-- 溫度 -->
                <div class="chatbot-slider-group">
                  <div class="chatbot-slider-header">
                    <label class="chatbot-slider-label">溫度 (Temperature)</label>
                    <span id="chatbot-temperature-value" class="chatbot-slider-value">0.5</span>
                  </div>
                  <input
                    type="range"
                    id="chatbot-temperature-slider"
                    min="0"
                    max="1"
                    step="0.01"
                    value="0.5"
                    class="chatbot-slider"
                  />
                  <div class="chatbot-slider-labels">
                    <span>精確 (0)</span>
                    <span>平衡</span>
                    <span>創造 (1)</span>
                  </div>
                </div>

                <!-- 最大Token -->
                <div class="chatbot-form-group">
                  <label class="chatbot-form-label">最大Token</label>
                  <input
                    type="number"
                    id="chatbot-max-tokens-input"
                    min="100"
                    max="32000"
                    value="8000"
                    class="chatbot-form-input"
                  />
                </div>

                <!-- 並行數 -->
                <div class="chatbot-form-group">
                  <label class="chatbot-form-label">並行上限</label>
                  <input
                    type="number"
                    id="chatbot-concurrency-input"
                    min="1"
                    max="50"
                    value="10"
                    class="chatbot-form-input"
                  />
                </div>
              </div>

            </div>

            <!-- 底部按鈕 -->
            <div class="chatbot-config-footer">
              <button id="chatbot-model-config-cancel-btn" class="chatbot-btn chatbot-btn-cancel">
                取消
              </button>
              <button id="chatbot-model-config-save-btn" class="chatbot-btn chatbot-btn-save">
                <i class="fa-solid fa-save"></i>
                儲存配置
              </button>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初始化彈出視窗
   */
  function initModal() {
    // 檢查是否已經存在彈出視窗
    let modal = document.getElementById('chatbot-model-config-modal');
    if (modal) {
      console.log('[ChatbotModelConfigModal] 彈出視窗已存在，移除舊的');
      modal.remove();
    }

    // 建立新彈出視窗
    const modalHTML = createModalHTML();
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 獲取元素參考
    modal = document.getElementById('chatbot-model-config-modal');
    const overlay = document.getElementById('chatbot-model-config-overlay');
    const closeBtn = document.getElementById('chatbot-model-config-close-btn');
    const cancelBtn = document.getElementById('chatbot-model-config-cancel-btn');
    const saveBtn = document.getElementById('chatbot-model-config-save-btn');

    // 綁定關閉事件
    const closeModal = () => {
      modal.classList.remove('active');
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);

    // 初始化預設模型列表
    populatePredefinedModels();

    // 初始化源型別切換
    initSourceTypeSwitch();

    // 初始化模型ID搜尋
    initModelIdSearch();

    // 初始化引數控制
    initParameterControls();

    // 初始化儲存按鈕
    saveBtn.addEventListener('click', saveConfig);

    // 初始化重新整理按鈕
    const refreshBtn = document.getElementById('chatbot-refresh-models-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const sourceBtn = document.querySelector('.chatbot-source-btn.active');
        const sourceType = sourceBtn ? sourceBtn.dataset.source : 'predefined';

        if (sourceType === 'predefined') {
          // 重新整理預設模型列表
          const modelSelect = document.getElementById('chatbot-predefined-model-select');
          const selectedModel = modelSelect ? modelSelect.value : '';
          if (selectedModel && ['mistral', 'deepseek', 'gemini', 'tongyi'].includes(selectedModel)) {
            fetchPredefinedModels(selectedModel);
          }
        } else {
          // 重新整理自定義源站點模型列表
          const sourceSelect = document.getElementById('chatbot-custom-source-select');
          const selectedOption = sourceSelect ? sourceSelect.options[sourceSelect.selectedIndex] : null;
          if (selectedOption && selectedOption.dataset && selectedOption.dataset.site) {
            try {
              const site = JSON.parse(selectedOption.dataset.site);
              loadAvailableModels(site);
            } catch (error) {
              console.error('[ChatbotModelConfigModal] 重新整理模型列表失敗:', error);
            }
          }
        }
      });
    }

    // 檢查是否有全域設定彈出視窗
    const modelKeyManagerModal = document.getElementById('modelKeyManagerModal');
    const hasGlobalSettings = !!modelKeyManagerModal;

    // 通用函式：開啟全域設定彈出視窗
    const openGlobalSettings = () => {
      // 關閉當前彈出視窗
      modal.classList.remove('active');

      // 開啟 index.html 的模型與Key管理彈出視窗
      if (modelKeyManagerModal) {
        modelKeyManagerModal.classList.remove('hidden');
      } else {
        console.warn('[ChatbotModelConfigModal] modelKeyManagerModal 元素未找到，可能在詳情頁面');
        alert('請返回主頁面進行設定配置');
      }
    };

    // 初始化"開啟全域設定"按鈕（自定義源站點的）
    const openSettingsBtn = document.getElementById('chatbot-open-global-settings-btn');
    if (openSettingsBtn) {
      if (hasGlobalSettings) {
        openSettingsBtn.addEventListener('click', openGlobalSettings);
      } else {
        // 如果沒有全域設定彈出視窗，隱藏提示中的按鈕
        openSettingsBtn.style.display = 'none';
        // 修改提示文字
        const hintBox = document.getElementById('chatbot-no-custom-source-hint');
        if (hintBox) {
          const hintText = hintBox.querySelector('div[style*="font-size: 14px"]');
          if (hintText) {
            hintText.textContent = '請在主頁面的【全域設定】→【自定義源站管理】中新增您的自定義源站點，然後即可在此選擇使用。';
          }
        }
      }
    }

    console.log('[ChatbotModelConfigModal] 彈出視窗初始化完成');
  }

  /**
   * 填充預設模型列表
   */
  function populatePredefinedModels() {
    const select = document.getElementById('chatbot-predefined-model-select');
    const fetchBtn = document.getElementById('chatbot-fetch-predefined-models-btn');
    if (!select) return;

    // 清空現有選項（保留第一個佔位符）
    select.innerHTML = '<option value="">-- 請選擇模型 --</option>';

    // 新增預設模型（始終顯示所有模型，不管是否配置了API金鑰）
    PREDEFINED_MODELS.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      option.dataset.description = model.description;
      select.appendChild(option);
    });

    // 監聽選擇變化
    select.addEventListener('change', (e) => {
      if (!e.target || !e.target.options) {
        console.warn('[ChatbotModelConfigModal] select change: e.target.options 不可用');
        return;
      }

      const selectedIndex = e.target.selectedIndex;
      if (selectedIndex < 0 || selectedIndex >= e.target.options.length) {
        const descEl = document.getElementById('chatbot-predefined-model-description');
        if (descEl) descEl.classList.add('chatbot-hidden');
        hidePredefinedModelInfo();
        if (fetchBtn) fetchBtn.classList.add('chatbot-hidden');
        return;
      }

      const selectedOption = e.target.options[selectedIndex];
      const description = selectedOption && selectedOption.dataset ? selectedOption.dataset.description : null;
      const descEl = document.getElementById('chatbot-predefined-model-description');
      const modelValue = e.target.value;

      if (description && modelValue) {
        // 檢查該模型是否配置了API金鑰
        let hasApiKey = false;
        if (typeof loadModelKeys === 'function') {
          const keys = loadModelKeys(modelValue);
          if (keys && Array.isArray(keys) && keys.length > 0) {
            const usableKeys = keys.filter(k => k.status === 'valid' || k.status === 'untested');
            hasApiKey = usableKeys.length > 0;
          }
        }

        // 如果沒有配置API金鑰，提示使用者
        if (!hasApiKey) {
          const modelLabel = PREDEFINED_MODELS.find(m => m.value === modelValue)?.label || modelValue;
          alert(`尚未配置 ${modelLabel} 的API金鑰\n\n請到主頁面的【全域設定】→【翻譯模型設定】中配置 ${modelLabel} 的API金鑰，配置完成後重新整理本頁面即可使用。`);
          // 重置選擇
          e.target.selectedIndex = 0;
          if (descEl) descEl.classList.add('chatbot-hidden');
          hidePredefinedModelInfo();
          if (fetchBtn) fetchBtn.classList.add('chatbot-hidden');
          return;
        }

        if (descEl) {
          descEl.textContent = description;
          descEl.classList.remove('chatbot-hidden');
        }

        // 顯示預設模型端點資訊
        displayPredefinedModelInfo(modelValue);

        // 顯示"獲取模型列表"按鈕（僅支援的模型）
        if (fetchBtn && ['mistral', 'deepseek', 'gemini', 'tongyi'].includes(modelValue)) {
          fetchBtn.classList.remove('chatbot-hidden');
        } else if (fetchBtn) {
          fetchBtn.classList.add('chatbot-hidden');
        }
      } else {
        if (descEl) descEl.classList.add('chatbot-hidden');
        hidePredefinedModelInfo();
        if (fetchBtn) {
          fetchBtn.classList.add('chatbot-hidden');
        }
      }

      // 清空模型列表（統一使用 chatbot-available-models-list）
      const listDiv = document.getElementById('chatbot-available-models-list');
      if (listDiv) {
        listDiv.innerHTML = '';
        listDiv.classList.add('chatbot-hidden');
      }

      // 清空模型ID搜尋框
      const searchInput = document.getElementById('chatbot-model-id-search');
      if (searchInput) {
        searchInput.value = '';
      }

      // 隱藏重新整理按鈕
      const refreshBtn = document.getElementById('chatbot-refresh-models-btn');
      if (refreshBtn) {
        refreshBtn.classList.add('chatbot-hidden');
      }
    });

    // 綁定"獲取模型列表"按鈕事件
    if (fetchBtn) {
      fetchBtn.addEventListener('click', () => {
        const selectedModel = select.value;
        if (selectedModel) {
          fetchPredefinedModels(selectedModel);
        }
      });
    }
  }

  /**
   * 初始化源型別切換
   */
  function initSourceTypeSwitch() {
    const predefinedBtn = document.getElementById('chatbot-source-predefined-btn');
    const customBtn = document.getElementById('chatbot-source-custom-btn');
    const predefinedSection = document.getElementById('chatbot-predefined-model-section');
    const customSection = document.getElementById('chatbot-custom-source-section');

    const switchToSource = (sourceType) => {
      // 更新按鈕樣式
      if (sourceType === 'predefined') {
        predefinedBtn.classList.add('active');
        customBtn.classList.remove('active');

        // 顯示/隱藏相應區域
        predefinedSection.classList.remove('chatbot-hidden');
        customSection.classList.add('chatbot-hidden');
      } else {
        customBtn.classList.add('active');
        predefinedBtn.classList.remove('active');

        // 顯示/隱藏相應區域
        predefinedSection.classList.add('chatbot-hidden');
        customSection.classList.remove('chatbot-hidden');

        // 載入自定義源站點列表
        loadCustomSourceSites();
      }
    };

    predefinedBtn.addEventListener('click', () => switchToSource('predefined'));
    customBtn.addEventListener('click', () => switchToSource('custom'));

    // 初始化為預設模型
    switchToSource('predefined');
  }

  /**
   * 載入自定義源站點列表
   */
  function loadCustomSourceSites() {
    const select = document.getElementById('chatbot-custom-source-select');
    const hintBox = document.getElementById('chatbot-no-custom-source-hint');
    if (!select) return;

    // 清空現有選項
    select.innerHTML = '<option value="">-- 請選擇源站點 --</option>';

    // 獲取所有自定義源站點
    const sites = (typeof loadAllCustomSourceSites === 'function')
      ? loadAllCustomSourceSites()
      : {};

    const siteIds = Object.keys(sites);

    if (siteIds.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '無自定義源站點（請先在設定中新增）';
      select.appendChild(option);
      select.disabled = true;

      // 顯示提示框
      if (hintBox) {
        hintBox.classList.remove('chatbot-hidden');
      }
      return;
    }

    select.disabled = false;

    // 隱藏提示框（有源站點）
    if (hintBox) {
      hintBox.classList.add('chatbot-hidden');
    }

    // 新增源站點選項
    siteIds.forEach(id => {
      const site = sites[id];
      const option = document.createElement('option');
      option.value = id;
      option.textContent = site.displayName || `源站點 ${id.substring(0, 8)}...`;
      option.dataset.site = JSON.stringify(site);
      select.appendChild(option);
    });

    // 監聽選擇變化（使用once: false確保可以重複綁定）
    select.removeEventListener('change', handleCustomSourceChange);
    select.addEventListener('change', handleCustomSourceChange);
  }

  /**
   * 處理自定義源站點選擇變化
   */
  function handleCustomSourceChange(e) {
    if (!e.target || !e.target.options) {
      console.warn('[ChatbotModelConfigModal] handleCustomSourceChange: e.target.options 不可用');
      return;
    }

    const selectedIndex = e.target.selectedIndex;
    if (selectedIndex < 0 || selectedIndex >= e.target.options.length) {
      hideSourceSiteInfo();
      return;
    }

    const selectedOption = e.target.options[selectedIndex];
    if (selectedOption && selectedOption.dataset && selectedOption.dataset.site) {
      try {
        const site = JSON.parse(selectedOption.dataset.site);
        displaySourceSiteInfo(site);
        loadAvailableModels(site);
      } catch (error) {
        console.error('[ChatbotModelConfigModal] 解析源站點資料失敗:', error);
        hideSourceSiteInfo();
      }
    } else {
      hideSourceSiteInfo();
    }
  }

  /**
   * 顯示源站點資訊
   */
  function displaySourceSiteInfo(site) {
    const infoDiv = document.getElementById('chatbot-custom-source-info');
    const endpointSpan = document.getElementById('chatbot-source-endpoint');
    const formatSpan = document.getElementById('chatbot-source-format');

    if (site && infoDiv) {
      endpointSpan.textContent = site.apiEndpoint || site.apiBaseUrl || '未知';
      formatSpan.textContent = site.requestFormat || 'OpenAI';
      infoDiv.classList.remove('chatbot-hidden');
    }
  }

  /**
   * 隱藏源站點資訊
   */
  function hideSourceSiteInfo() {
    const infoDiv = document.getElementById('chatbot-custom-source-info');
    if (infoDiv) {
      infoDiv.classList.add('chatbot-hidden');
    }
  }

  /**
   * 顯示預設模型資訊
   */
  function displayPredefinedModelInfo(modelName) {
    const infoDiv = document.getElementById('chatbot-predefined-model-info');
    const endpointSpan = document.getElementById('chatbot-predefined-endpoint');

    if (!infoDiv || !endpointSpan) return;

    // 根據模型名稱設定端點
    const endpoints = {
      'mistral': 'https://api.mistral.ai/v1',
      'deepseek': 'https://api.deepseek.com/v1',
      'gemini': 'https://generativelanguage.googleapis.com/v1beta',
      'tongyi': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      'volcano': '火山引擎 API 端點'
    };

    const endpoint = endpoints[modelName] || '未知';
    endpointSpan.textContent = endpoint;
    infoDiv.classList.remove('chatbot-hidden');
  }

  /**
   * 隱藏預設模型資訊
   */
  function hidePredefinedModelInfo() {
    const infoDiv = document.getElementById('chatbot-predefined-model-info');
    if (infoDiv) {
      infoDiv.classList.add('chatbot-hidden');
    }
  }

  /**
   * 獲取預設模型的可用模型列表
   */
  async function fetchPredefinedModels(modelName) {
    const fetchBtn = document.getElementById('chatbot-fetch-predefined-models-btn');
    const listDiv = document.getElementById('chatbot-available-models-list'); // 使用統一的列表區域
    const searchInput = document.getElementById('chatbot-model-id-search');
    const refreshBtn = document.getElementById('chatbot-refresh-models-btn');

    if (!fetchBtn || !listDiv) return;

    // 獲取對應模型的API Key
    let apiKey = '';
    if (typeof loadModelKeys === 'function') {
      const keys = loadModelKeys(modelName);
      if (keys && Array.isArray(keys)) {
        const usableKeys = keys.filter(k => k.status === 'valid' || k.status === 'untested');
        if (usableKeys.length > 0) {
          apiKey = usableKeys[0].value;
        }
      }
    }

    if (!apiKey) {
      alert(`請先為 ${modelName} 配置有效的 API Key`);
      return;
    }

    // 禁用按鈕，顯示載入狀態
    fetchBtn.disabled = true;
    const originalText = fetchBtn.querySelector('span').textContent;
    fetchBtn.querySelector('span').textContent = '獲取中...';

    try {
      let models = [];

      if (modelName === 'mistral') {
        const resp = await fetch('https://api.mistral.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        models = Array.isArray(data.data) ? data.data.map(m => m.id).filter(Boolean) : [];
      } else if (modelName === 'deepseek') {
        const resp = await fetch('https://api.deepseek.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        models = Array.isArray(data.data) ? data.data.map(m => m.id).filter(Boolean) : [];
      } else if (modelName === 'gemini') {
        // Gemini API: 使用 Google AI Studio 的 models 端點
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        const items = Array.isArray(data.models || data.data) ? (data.models || data.data) : [];
        // 從 name 欄位提取模型 ID (e.g., "models/gemini-1.5-flash" -> "gemini-1.5-flash")
        models = items.map(m => {
          const id = m.name ? String(m.name).split('/').pop() : (m.id || '');
          return id;
        }).filter(Boolean);
      } else if (modelName === 'tongyi') {
        const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        const items = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : (Array.isArray(data?.data?.models) ? data.data.models : []));
        models = items.map(m => m.model || m.id || m.name).filter(Boolean);
      }

      if (models.length === 0) {
        listDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: #64748b;">未獲取到模型列表</div>';
        listDiv.classList.remove('chatbot-hidden');
        if (refreshBtn) {
          refreshBtn.classList.remove('chatbot-hidden');
        }
        return;
      }

      // 顯示模型列表
      loadPredefinedAvailableModels(models, searchInput, listDiv);

      // 顯示重新整理按鈕
      if (refreshBtn) {
        refreshBtn.classList.remove('chatbot-hidden');
      }

      // 自動選擇第一個模型
      if (searchInput && models.length > 0) {
        searchInput.value = models[0];
      }

      console.log(`[ChatbotModelConfigModal] 獲取到 ${modelName} 的 ${models.length} 個模型`);
    } catch (error) {
      console.error(`[ChatbotModelConfigModal] 獲取 ${modelName} 模型列表失敗:`, error);
      alert(`獲取模型列表失敗: ${error.message}`);
      listDiv.innerHTML = '';
      listDiv.classList.add('chatbot-hidden');
      if (refreshBtn) {
        refreshBtn.classList.add('chatbot-hidden');
      }
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.querySelector('span').textContent = originalText;
    }
  }

  /**
   * 載入預設模型的可用模型列表
   */
  function loadPredefinedAvailableModels(models, searchInput, listDiv) {
    if (!listDiv) return;

    // 清空列表
    listDiv.innerHTML = '';

    if (!models || models.length === 0) {
      listDiv.classList.add('chatbot-hidden');
      return;
    }

    listDiv.classList.remove('chatbot-hidden');

    // 生成模型列表項
    models.forEach(modelId => {
      const item = document.createElement('div');
      item.className = 'chatbot-model-item';
      item.textContent = modelId;
      item.dataset.modelId = modelId;

      item.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = modelId;
        }
        // 醒目提示選中項
        listDiv.querySelectorAll('.chatbot-model-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });

      listDiv.appendChild(item);
    });

    // 搜尋功能
    if (searchInput) {
      const handleSearch = (e) => {
        const query = e.target.value.toLowerCase();
        const items = listDiv.querySelectorAll('.chatbot-model-item');

        let hasVisibleItem = false;

        items.forEach(item => {
          const modelId = (item.dataset.modelId || '').toLowerCase();
          const modelName = (item.textContent || '').toLowerCase();

          if (modelId.includes(query) || modelName.includes(query)) {
            item.classList.remove('chatbot-hidden');
            hasVisibleItem = true;
          } else {
            item.classList.add('chatbot-hidden');
          }
        });

        // 如果有可見項，顯示列表；否則隱藏
        if (hasVisibleItem) {
          listDiv.classList.remove('chatbot-hidden');
        } else {
          listDiv.classList.add('chatbot-hidden');
        }
      };

      // 移除之前的監聽器（如果有）
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      newSearchInput.addEventListener('input', handleSearch);
    }
  }

  /**
   * 載入可用模型列表
   */
  function loadAvailableModels(site) {
    const listDiv = document.getElementById('chatbot-available-models-list');
    const searchInput = document.getElementById('chatbot-model-id-search');
    const refreshBtn = document.getElementById('chatbot-refresh-models-btn');
    if (!listDiv) return;

    // 清空現有列表
    listDiv.innerHTML = '';

    if (!site || !site.availableModels || site.availableModels.length === 0) {
      listDiv.classList.add('chatbot-hidden');
      if (refreshBtn) refreshBtn.classList.add('chatbot-hidden');
      return;
    }

    listDiv.classList.remove('chatbot-hidden');
    if (refreshBtn) refreshBtn.classList.remove('chatbot-hidden');

    // 生成模型列表項
    let firstModelId = null;
    site.availableModels.forEach((model, index) => {
      // 處理兩種情況：字串陣列或物件陣列
      let modelId, modelName;
      if (typeof model === 'string') {
        modelId = model;
        modelName = model;
      } else if (typeof model === 'object' && model !== null) {
        modelId = model.id || model.modelId || model.value || String(model);
        modelName = model.name || model.label || modelId;
      } else {
        return; // 跳過無效項
      }

      // 記錄第一個模型ID
      if (index === 0 || firstModelId === null) {
        firstModelId = modelId;
      }

      const item = document.createElement('div');
      item.className = 'chatbot-model-item';
      item.textContent = modelName;
      item.dataset.modelId = modelId;

      item.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = modelId;
        }
        // 醒目提示選中項
        listDiv.querySelectorAll('.chatbot-model-item').forEach(d => d.classList.remove('selected'));
        item.classList.add('selected');
      });

      listDiv.appendChild(item);
    });

    // 自動選擇第一個模型
    if (firstModelId && searchInput) {
      searchInput.value = firstModelId;
      // 醒目提示第一個項
      const firstItem = listDiv.querySelector('.chatbot-model-item');
      if (firstItem) {
        firstItem.classList.add('selected');
      }
    }
  }

  /**
   * 初始化模型ID搜尋
   */
  function initModelIdSearch() {
    const searchInput = document.getElementById('chatbot-model-id-search');
    const listDiv = document.getElementById('chatbot-available-models-list');

    if (!searchInput || !listDiv) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = listDiv.querySelectorAll('.chatbot-model-item');

      let hasVisibleItem = false;

      items.forEach(item => {
        const modelId = (item.dataset.modelId || '').toLowerCase();
        const modelName = (item.textContent || '').toLowerCase();
        // 搜尋模型ID和顯示名稱
        if (modelId.includes(query) || modelName.includes(query)) {
          item.classList.remove('chatbot-hidden');
          hasVisibleItem = true;
        } else {
          item.classList.add('chatbot-hidden');
        }
      });

      // 如果有可見項，顯示列表；否則隱藏
      if (hasVisibleItem && query) {
        listDiv.classList.remove('chatbot-hidden');
      } else if (!query) {
        // 如果搜尋框為空，顯示所有項
        items.forEach(item => item.classList.remove('chatbot-hidden'));
        listDiv.classList.remove('chatbot-hidden');
      }
    });
  }

  /**
   * 初始化引數控制
   */
  function initParameterControls() {
    // 溫度滑塊
    const tempSlider = document.getElementById('chatbot-temperature-slider');
    const tempValue = document.getElementById('chatbot-temperature-value');

    if (tempSlider && tempValue) {
      tempSlider.addEventListener('input', (e) => {
        tempValue.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }
  }

  /**
   * 儲存配置
   */
  function saveConfig() {
    const sourceBtn = document.querySelector('.chatbot-source-btn.active');
    const sourceType = sourceBtn ? sourceBtn.dataset.source : 'predefined';

    let config = {
      sourceType: sourceType,
      temperature: parseFloat(document.getElementById('chatbot-temperature-slider').value),
      max_tokens: parseInt(document.getElementById('chatbot-max-tokens-input').value),
      concurrency: parseInt(document.getElementById('chatbot-concurrency-input').value)
    };

    if (sourceType === 'predefined') {
      const modelSelect = document.getElementById('chatbot-predefined-model-select');
      config.model = modelSelect.value;
      config.customSourceSiteId = null;
      // 預設模型也可以有具體的modelId（如果使用者獲取了模型列表並選擇了）
      const modelIdInput = document.getElementById('chatbot-model-id-search');
      config.selectedModelId = modelIdInput ? modelIdInput.value : '';
    } else {
      const sourceSelect = document.getElementById('chatbot-custom-source-select');
      config.model = 'custom';
      config.customSourceSiteId = sourceSelect.value;
      config.selectedModelId = document.getElementById('chatbot-model-id-search').value;
    }

    // 驗證配置
    if (sourceType === 'predefined' && !config.model) {
      alert('請選擇一個預設模型');
      return;
    }

    if (sourceType === 'custom' && !config.customSourceSiteId) {
      alert('請選擇一個自定義源站點');
      return;
    }

    if (sourceType === 'custom' && !config.selectedModelId) {
      alert('請選擇或輸入一個模型ID');
      return;
    }

    // 儲存配置
    if (typeof window !== 'undefined' && window.ChatbotConfigManager) {
      const success = window.ChatbotConfigManager.saveChatbotConfig(config);
      if (success) {
        alert('✓ 配置已儲存！');
        closeModalAndRefresh();
      } else {
        alert('× 儲存配置失敗');
      }
    } else {
      console.error('[ChatbotModelConfigModal] ChatbotConfigManager 不可用');
      alert('× 配置管理器不可用');
    }
  }

  /**
   * 關閉彈出視窗並重新整理
   */
  function closeModalAndRefresh() {
    const modal = document.getElementById('chatbot-model-config-modal');
    if (modal) {
      modal.classList.remove('active');
    }

    // 觸發配置更新事件（如果需要通知其他元件）
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chatbot-config-updated'));
    }
  }

  /**
   * 開啟彈出視窗
   */
  function openModal() {
    const modal = document.getElementById('chatbot-model-config-modal');
    if (!modal) {
      initModal();
    }

    // 載入當前配置
    loadCurrentConfig();

    // 顯示彈出視窗
    const modalEl = document.getElementById('chatbot-model-config-modal');
    if (modalEl) {
      modalEl.classList.add('active');
    }
  }

  /**
   * 載入當前配置到UI
   */
  function loadCurrentConfig() {
    if (typeof window === 'undefined' || !window.ChatbotConfigManager) {
      console.warn('[ChatbotModelConfigModal] ChatbotConfigManager 不可用');
      return;
    }

    try {
      const config = window.ChatbotConfigManager.getChatbotModelConfig();

      // 設定源型別
      const sourceType = config.sourceType || 'predefined';
      const predefinedBtn = document.getElementById('chatbot-source-predefined-btn');
      const customBtn = document.getElementById('chatbot-source-custom-btn');

      if (sourceType === 'predefined') {
        predefinedBtn?.click();

        // 設定預設模型
        const modelSelect = document.getElementById('chatbot-predefined-model-select');
        if (modelSelect && config.model) {
          modelSelect.value = config.model;
          modelSelect.dispatchEvent(new Event('change'));
        }
      } else {
        customBtn?.click();

        // 設定自定義源站點
        const sourceSelect = document.getElementById('chatbot-custom-source-select');
        if (sourceSelect && config.customSourceSiteId) {
          sourceSelect.value = config.customSourceSiteId;
          sourceSelect.dispatchEvent(new Event('change'));
        }

        // 設定模型ID
        const modelIdInput = document.getElementById('chatbot-model-id-search');
        if (modelIdInput && config.selectedModelId) {
          // 確保 selectedModelId 是字串
          const modelId = typeof config.selectedModelId === 'string'
            ? config.selectedModelId
            : (config.selectedModelId.id || config.selectedModelId.modelId || config.selectedModelId.value || '');
          modelIdInput.value = modelId;
        }
      }

      // 設定引數
      const tempSlider = document.getElementById('chatbot-temperature-slider');
      const tempValue = document.getElementById('chatbot-temperature-value');
      if (tempSlider && config.temperature !== undefined) {
        tempSlider.value = config.temperature;
        if (tempValue) {
          tempValue.textContent = config.temperature.toFixed(2);
        }
      }

      const maxTokensInput = document.getElementById('chatbot-max-tokens-input');
      if (maxTokensInput && config.max_tokens) {
        maxTokensInput.value = config.max_tokens;
      }

      const concurrencyInput = document.getElementById('chatbot-concurrency-input');
      if (concurrencyInput && config.concurrency) {
        concurrencyInput.value = config.concurrency;
      }

      console.log('[ChatbotModelConfigModal] 配置已載入到UI:', config);
    } catch (error) {
      console.error('[ChatbotModelConfigModal] 載入配置失敗:', error);
    }
  }

  // 匯出到全域
  if (typeof window !== 'undefined') {
    window.ChatbotModelConfigModal = {
      init: initModal,
      open: openModal,
      close: () => {
        const modal = document.getElementById('chatbot-model-config-modal');
        if (modal) modal.classList.remove('active');
      }
    };
  }

  // 頁面載入時初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModal);
  } else {
    initModal();
  }

})();
