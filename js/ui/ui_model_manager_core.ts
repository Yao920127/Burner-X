/**
 * UI 模型管理器核心模組
 * 負責模型列表渲染、模型選擇、模型配置介面等核心邏輯
 * 從 ui.js 中提取，減少主檔案大小
 */

(function(window) {
  'use strict';

  // 支援的模型列表
  const SUPPORTED_MODELS = [
    { key: 'mistral', name: 'Mistral OCR', group: 'ocr' },
    { key: 'mineru', name: 'MinerU OCR', group: 'ocr' },
    { key: 'doc2x', name: 'Doc2X OCR', group: 'ocr' },
    { key: 'deepseek', name: 'DeepSeek 翻譯', group: 'translation' },
    { key: 'gemini', name: 'Gemini 翻譯', group: 'translation' },
    { key: 'tongyi', name: '通義百鍊', group: 'translation' },
    { key: 'volcano', name: '火山引擎', group: 'translation' },
    { key: 'deeplx', name: 'DeepLX (DeepL 介面)', group: 'translation' },
    { key: 'custom', name: '自定義翻譯模型', group: 'translation' },
    { key: 'embedding', name: '向量搜尋與重排', group: 'search' },
    { key: 'academicSearch', name: '學術搜尋與代理', group: 'search' }
  ];

  // 模型配置章節
  const MODEL_SECTIONS = [
    { title: '所有 OCR 方式', group: 'ocr', className: 'mt-4 mb-2' },
    { title: '翻譯和分析 API', group: 'translation', className: 'mt-5 mb-2' },
    { title: '搜尋和檢索', group: 'search', className: 'mt-5 mb-2' }
  ];

  /**
   * 模型管理器類
   * 管理模型列表、模型配置介面的渲染和互動
   */
  class ModelManager {
    constructor() {
      this.currentManagerUI = null;
      this.selectedModelForManager = null;
      this.currentSelectedSourceSiteId = null;

      this.modelListColumn = null;
      this.modelConfigColumn = null;
      this.keyManagerColumn = null;
    }

    /**
     * 初始化模型管理器
     * @param {Object} elements - DOM 元素物件
     */
    init(elements) {
      this.modelListColumn = elements.modelListColumn;
      this.modelConfigColumn = elements.modelConfigColumn;
      this.keyManagerColumn = elements.keyManagerColumn;

      const { modelKeyManagerBtn, modelKeyManagerModal, closeModelKeyManager } = elements;

      if (!modelKeyManagerBtn || !modelKeyManagerModal || !closeModelKeyManager) {
        console.warn('[ModelManager] Required elements not found');
        return;
      }

      // 後端模式下禁用模型與Key管理器彈出視窗
      const isBackendMode = (typeof window !== 'undefined' && window.storageAdapter && window.storageAdapter.isFrontendMode === false);
      if (isBackendMode) {
        modelKeyManagerBtn.setAttribute('title', '後端模式：模型與Key管理已禁用');
        modelKeyManagerBtn.classList.add('opacity-50', 'cursor-not-allowed');
        modelKeyManagerBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.showNotification === 'function') {
            window.showNotification('後端模式下無法開啟模型/Key設定，請在首頁僅選擇要使用的模型。', 'info');
          } else {
            alert('後端模式下無法開啟模型/Key設定，請在首頁僅選擇要使用的模型。');
          }
        });
        // 直接返回，不綁定開啟彈出視窗的邏輯
        return;
      }

      // 開啟模型管理器（前端模式）
      modelKeyManagerBtn.addEventListener('click', () => {
        if (typeof migrateLegacyCustomConfig === 'function') {
          migrateLegacyCustomConfig();
        }
        this.renderModelList();
        if (!this.selectedModelForManager && SUPPORTED_MODELS.length > 0) {
          this.selectModel(SUPPORTED_MODELS[0].key);
        } else if (this.selectedModelForManager) {
          this.selectModel(this.selectedModelForManager);
        }
        modelKeyManagerModal.classList.remove('hidden');
      });

      // 關閉模型管理器
      closeModelKeyManager.addEventListener('click', () => {
        modelKeyManagerModal.classList.add('hidden');
        this.currentSelectedSourceSiteId = null;

        setTimeout(() => {
          if (confirm('已關閉模型與Key管理。是否重新整理驗證狀態以更新配置檢查？')) {
            if (typeof window.refreshValidationState === 'function') {
              window.refreshValidationState();
            }
          }
        }, 100);
      });
    }

    /**
     * 檢查模型是否有可用的 Key
     * @param {string} modelKey - 模型鍵名
     * @returns {boolean} 是否有可用 Key
     */
    checkModelHasValidKey(modelKey) {
      const hasUsableKey = (keys = []) => keys.some(k => k && k.value && k.value.trim() && k.status !== 'invalid');

      // Embedding
      if (modelKey === 'embedding') {
        return !!(window.EmbeddingClient?.config?.enabled && window.EmbeddingClient?.config?.apiKey);
      }

      // Academic Search
      if (modelKey === 'academicSearch') {
        try {
          const config = JSON.parse(localStorage.getItem('academicSearchProxyConfig') || 'null');
          return !!(config && config.enabled && config.baseUrl);
        } catch (e) {
          return false;
        }
      }

      // 自定義源站
      if (modelKey === 'custom') {
        let anyCustomKey = false;
        const sites = typeof loadAllCustomSourceSites === 'function' ? loadAllCustomSourceSites() : {};
        if (typeof loadModelKeys === 'function') {
          Object.keys(sites || {}).forEach(siteId => {
            const siteKeys = loadModelKeys(`custom_source_${siteId}`) || [];
            if (hasUsableKey(siteKeys)) anyCustomKey = true;
          });
        }
        return anyCustomKey;
      }

      // OCR 引擎
      if (modelKey === 'local') {
        return true; // 本地解析不需要配置
      } else if (modelKey === 'mistral') {
        if (typeof loadModelKeys === 'function') {
          const keys = loadModelKeys('mistral') || [];
          return hasUsableKey(keys);
        } else {
          const legacy = (localStorage.getItem('ocrMistralKeys') || '').split('\n').map(s => s.trim()).filter(Boolean);
          return legacy.length > 0;
        }
      } else if (modelKey === 'mineru') {
        const workerUrl = (localStorage.getItem('ocrMinerUWorkerUrl') || '').trim();
        const mode = localStorage.getItem('ocrMinerUTokenMode') || 'frontend';
        const token = (localStorage.getItem('ocrMinerUToken') || '').trim();
        return !!workerUrl && (mode === 'worker' || !!token);
      } else if (modelKey === 'doc2x') {
        const workerUrl = (localStorage.getItem('ocrDoc2XWorkerUrl') || '').trim();
        const mode = localStorage.getItem('ocrDoc2XTokenMode') || 'frontend';
        const token = (localStorage.getItem('ocrDoc2XToken') || '').trim();
        return !!workerUrl && (mode === 'worker' || !!token);
      }

      // 其他預設翻譯模型
      if (typeof loadModelKeys === 'function') {
        const keys = loadModelKeys(modelKey) || [];
        return hasUsableKey(keys);
      }

      return false;
    }

    /**
     * 渲染模型列表
     */
    renderModelList() {
      if (!this.modelListColumn) return;

      this.modelListColumn.innerHTML = '';

      // 檢查所有模型的配置狀態
      const modelHasValidKey = {};
      SUPPORTED_MODELS.forEach(model => {
        modelHasValidKey[model.key] = this.checkModelHasValidKey(model.key);
      });

      // 檢查當前 OCR 引擎配置
      let currentOcrEngine = 'mistral';
      let currentOcrConfigured = false;
      try {
        if (window.ocrSettingsManager && typeof window.ocrSettingsManager.getCurrentConfig === 'function') {
          currentOcrEngine = window.ocrSettingsManager.getCurrentConfig().engine || (localStorage.getItem('ocrEngine') || 'mistral');
        } else {
          currentOcrEngine = localStorage.getItem('ocrEngine') || 'mistral';
        }

        if (currentOcrEngine === 'none' || currentOcrEngine === 'local') {
          currentOcrConfigured = true;
        } else {
          currentOcrConfigured = modelHasValidKey[currentOcrEngine] || false;
        }
      } catch (e) {
        console.warn('[ModelManager] Failed to check OCR config:', e);
      }

      const translationHasKey = SUPPORTED_MODELS
        .filter(m => m.group === 'translation')
        .some(m => modelHasValidKey[m.key]);

      // 匯入/匯出按鈕區域
      this._renderImportExportSection();

      const divider = document.createElement('div');
      divider.className = 'border-t border-dashed border-slate-200 my-3';
      this.modelListColumn.appendChild(divider);

      // 警告資訊
      if (!currentOcrConfigured && currentOcrEngine !== 'none' && currentOcrEngine !== 'local') {
        this._renderOcrWarning(currentOcrEngine);
      }

      if (!translationHasKey) {
        this._renderTranslationWarning();
      }

      // 渲染各個章節的模型
      MODEL_SECTIONS.forEach((section, idx) => {
        this._renderModelSection(section, modelHasValidKey, idx === MODEL_SECTIONS.length - 1);
      });
    }

    /**
     * 渲染匯入/匯出區域
     * @private
     */
    _renderImportExportSection() {
      const headerSection = document.createElement('div');
      headerSection.className = 'mb-3 space-y-1';

      const importExportRow = document.createElement('div');
      importExportRow.className = 'flex items-center gap-2 px-1';

      const exportIconBtn = document.createElement('button');
      exportIconBtn.type = 'button';
      exportIconBtn.innerHTML = '<iconify-icon icon="carbon:export" width="16"></iconify-icon><span class="ml-1">匯出全部</span>';
      exportIconBtn.className = 'px-2 py-1 text-xs rounded-md border border-slate-200 hover:border-blue-300 text-slate-600 transition-colors flex items-center';
      exportIconBtn.addEventListener('click', () => {
        if (typeof KeyManagerUI !== 'undefined' && KeyManagerUI.exportAllModelData) {
          KeyManagerUI.exportAllModelData();
        }
      });

      const importIconBtn = document.createElement('button');
      importIconBtn.type = 'button';
      importIconBtn.innerHTML = '<iconify-icon icon="carbon:import-export" width="16"></iconify-icon><span class="ml-1">匯入全部</span>';
      importIconBtn.className = 'px-2 py-1 text-xs rounded-md border border-slate-200 hover:border-blue-300 text-slate-600 transition-colors flex items-center';
      importIconBtn.addEventListener('click', () => {
        if (typeof KeyManagerUI !== 'undefined' && KeyManagerUI.importAllModelData) {
          KeyManagerUI.importAllModelData(() => {
            this.renderModelList();
            if (this.selectedModelForManager) {
              this.renderKeyManager(this.selectedModelForManager);
            }
          });
        }
      });

      importExportRow.appendChild(exportIconBtn);
      importExportRow.appendChild(importIconBtn);
      headerSection.appendChild(importExportRow);

      const importExportHint = document.createElement('div');
      importExportHint.className = 'text-[11px] text-slate-500 px-1';
      importExportHint.textContent = '配置檔案為 Paper Burner X 專用 JSON。';
      headerSection.appendChild(importExportHint);

      this.modelListColumn.appendChild(headerSection);
    }

    /**
     * 渲染 OCR 警告
     * @private
     */
    _renderOcrWarning(currentOcrEngine) {
      const ocrWarning = document.createElement('div');
      ocrWarning.className = 'mb-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2 flex items-start gap-2';
      const engineNames = { mistral: 'Mistral OCR', mineru: 'MinerU', doc2x: 'Doc2X' };
      const engineName = engineNames[currentOcrEngine] || currentOcrEngine;
      ocrWarning.innerHTML = `<iconify-icon icon="carbon:warning" width="14"></iconify-icon><span>當前 OCR 引擎（${engineName}）未配置完成，無法進行 PDF 的 OCR 操作。</span>`;
      this.modelListColumn.appendChild(ocrWarning);
    }

    /**
     * 渲染翻譯警告
     * @private
     */
    _renderTranslationWarning() {
      const translationWarning = document.createElement('div');
      translationWarning.className = 'mb-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-start gap-2';
      translationWarning.innerHTML = '<iconify-icon icon="carbon:warning" width="14"></iconify-icon><span>當前無有效翻譯 Key，無法進行翻譯操作。</span>';
      this.modelListColumn.appendChild(translationWarning);
    }

    /**
     * 渲染模型章節
     * @private
     */
    _renderModelSection(section, modelHasValidKey, isLast) {
      const header = document.createElement('div');
      header.className = `text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 ${section.className || ''}`;
      header.textContent = section.title;
      this.modelListColumn.appendChild(header);

      SUPPORTED_MODELS
        .filter(model => model.group === section.group)
        .forEach(model => {
          const button = document.createElement('button');
          button.dataset.modelKey = model.key;
          button.className = 'w-full text-left px-3 py-2 text-sm rounded-md transition-colors ';
          const indicator = modelHasValidKey[model.key]
            ? '<span class="inline-block w-1.5 h-1.5 mr-2 rounded-full bg-emerald-500"></span>'
            : '<span class="inline-block w-1.5 h-1.5 mr-2 rounded-full bg-slate-300"></span>';
          button.innerHTML = indicator + model.name;

          if (model.key === this.selectedModelForManager) {
            button.classList.add('bg-blue-100', 'text-blue-700', 'font-semibold');
          } else {
            button.classList.add('hover:bg-gray-200', 'text-gray-700');
          }

          button.addEventListener('click', () => this.selectModel(model.key));
          this.modelListColumn.appendChild(button);
        });

      if (!isLast) {
        const sectionDivider = document.createElement('div');
        sectionDivider.className = 'border-t border-dashed border-slate-200 my-3';
        this.modelListColumn.appendChild(sectionDivider);
      }
    }

    /**
     * 選擇模型
     * @param {string} modelKey - 模型鍵名
     */
    selectModel(modelKey) {
      this.selectedModelForManager = modelKey;
      this.currentSelectedSourceSiteId = null;
      this.renderModelList();

      // 渲染模型配置（由主 ui.js 中的 renderModelConfigSection 處理）
      if (typeof window.renderModelConfigSection === 'function') {
        window.renderModelConfigSection(modelKey);
      }

      // 渲染 Key 管理器
      if (modelKey === 'embedding' || modelKey === 'academicSearch' || modelKey === 'mineru' || modelKey === 'doc2x') {
        if (this.keyManagerColumn) {
          this.keyManagerColumn.innerHTML = '';
        }
      } else if (modelKey !== 'custom') {
        this.renderKeyManager(modelKey);
      }
    }

    /**
     * 渲染 Key 管理器
     * @param {string} modelKey - 模型鍵名
     */
    renderKeyManager(modelKey) {
      // 由主 ui.js 中的 renderKeyManagerForModel 處理
      if (typeof window.renderKeyManagerForModel === 'function') {
        window.renderKeyManagerForModel(modelKey);
      }
    }

    /**
     * 獲取支援的模型列表
     * @returns {Array} 模型列表
     */
    getSupportedModels() {
      return [...SUPPORTED_MODELS];
    }

    /**
     * 獲取當前選中的模型
     * @returns {string|null} 當前選中的模型鍵名
     */
    getSelectedModel() {
      return this.selectedModelForManager;
    }
  }

  // 建立全域例項
  const modelManager = new ModelManager();

  // 匯出到全域
  window.ModelManager = ModelManager;
  window.modelManager = modelManager;

  // 向後相容：匯出常量和函式
  window.supportedModelsForKeyManager = SUPPORTED_MODELS;

})(window);
