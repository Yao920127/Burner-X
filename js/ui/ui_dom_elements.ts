/**
 * UI DOM 元素參考管理模組
 * 集中管理所有 DOM 元素的參考，便於維護和訪問
 */

(function(window) {
  'use strict';

  /**
   * DOM 元素參考物件
   * 包含頁面上所有需要被 JavaScript 操作的 DOM 元素
   */
  const DOMElements = {
    // ===== API Key 配置相關 =====
    mistralApiKeysTextarea: document.getElementById('mistralApiKeys'),
    rememberMistralKeyCheckbox: document.getElementById('rememberMistralKey'),
    translationApiKeysTextarea: document.getElementById('translationApiKeys'),
    rememberTranslationKeyCheckbox: document.getElementById('rememberTranslationKey'),
    translationModelSelect: document.getElementById('translationModel'),

    // ===== 自定義模型設定 =====
    customModelSettingsContainer: document.getElementById('customModelSettingsContainer'),
    customModelSettings: document.getElementById('customModelSettings'),
    customModelSettingsToggle: document.getElementById('customModelSettingsToggle'),
    customModelSettingsToggleIcon: document.getElementById('customModelSettingsToggleIcon'),

    // ===== 高階設定 =====
    advancedSettingsToggle: document.getElementById('advancedSettingsToggle'),
    advancedSettings: document.getElementById('advancedSettings'),
    advancedSettingsIcon: document.getElementById('advancedSettingsIcon'),

    // ===== 處理引數配置 =====
    maxTokensPerChunk: document.getElementById('maxTokensPerChunk'),
    maxTokensPerChunkValue: document.getElementById('maxTokensPerChunkValue'),
    skipProcessedFilesCheckbox: document.getElementById('skipProcessedFiles'),
    concurrencyLevelInput: document.getElementById('concurrencyLevel'),

    // ===== 檔案管理 =====
    dropZone: document.getElementById('dropZone'),
    pdfFileInput: document.getElementById('pdfFileInput'),
    browseFilesBtn: document.getElementById('browseFilesBtn'),
    fileListContainer: document.getElementById('fileListContainer'),
    fileList: document.getElementById('fileList'),
    clearFilesBtn: document.getElementById('clearFilesBtn'),

    // ===== 主要操作按鈕 =====
    targetLanguage: document.getElementById('targetLanguage'),
    processBtn: document.getElementById('processBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),

    // ===== 批次模式 =====
    batchModeToggleWrapper: document.getElementById('batchModeToggleWrapper'),
    batchModeToggle: document.getElementById('batchModeToggle'),
    batchModeConfigPanel: document.getElementById('batchModeConfig'),

    // ===== 結果顯示 =====
    resultsSection: document.getElementById('resultsSection'),
    resultsSummary: document.getElementById('resultsSummary'),

    // ===== 進度顯示 =====
    progressSection: document.getElementById('progressSection'),
    batchProgressText: document.getElementById('batchProgressText'),
    concurrentProgressText: document.getElementById('concurrentProgressText'),
    progressStep: document.getElementById('progressStep'),
    progressPercentage: document.getElementById('progressPercentage'),
    progressBar: document.getElementById('progressBar'),
    progressLog: document.getElementById('progressLog'),

    // ===== 通知系統 =====
    notificationContainer: document.getElementById('notification-container'),

    // ===== 自定義源站點 =====
    customSourceSiteContainer: document.getElementById('customSourceSiteContainer'),
    customSourceSiteSelect: document.getElementById('customSourceSiteSelect'),
    customSourceSiteToggleIcon: document.getElementById('customSourceSiteToggleIcon'),
    detectModelsBtn: document.getElementById('detectModelsBtn'),

    // ===== 模型 Key 管理器 =====
    modelKeyManagerBtn: document.getElementById('modelKeyManagerBtn'),
    modelKeyManagerModal: document.getElementById('modelKeyManagerModal'),
    closeModelKeyManager: document.getElementById('closeModelKeyManager'),
    modelListColumn: document.getElementById('modelListColumn'),
    modelConfigColumn: document.getElementById('modelConfigColumn'),
    keyManagerColumn: document.getElementById('keyManagerColumn'),
  };

  /**
   * 獲取 DOM 元素
   * @param {string} key - 元素鍵名
   * @returns {HTMLElement|null} DOM 元素
   */
  function getElement(key) {
    return DOMElements[key] || null;
  }

  /**
   * 批次獲取 DOM 元素
   * @param {string[]} keys - 元素鍵名陣列
   * @returns {Object} 包含請求元素的物件
   */
  function getElements(keys) {
    const result = {};
    keys.forEach(key => {
      result[key] = DOMElements[key] || null;
    });
    return result;
  }

  /**
   * 檢查元素是否存在
   * @param {string} key - 元素鍵名
   * @returns {boolean} 元素是否存在
   */
  function hasElement(key) {
    return DOMElements[key] !== null && DOMElements[key] !== undefined;
  }

  /**
   * 獲取所有 DOM 元素參考
   * @returns {Object} 所有 DOM 元素的參考物件
   */
  function getAllElements() {
    return { ...DOMElements };
  }

  // 匯出到全域
  window.UIElements = {
    ...DOMElements,
    getElement,
    getElements,
    hasElement,
    getAllElements
  };

  // 為了向後相容，也將各個元素單獨匯出到 window
  // 這樣原有程式碼中直接使用 mistralApiKeysTextarea 等變數的地方不需要修改
  Object.keys(DOMElements).forEach(key => {
    if (window[key] === undefined) {
      window[key] = DOMElements[key];
    }
  });

})(window);
