// ui/ocr-settings.js
// OCR 配置管理模組 - 獨立於翻譯配置

/**
 * OCR 設定管理器
 * 負責：
 * 1. 載入/儲存 OCR 配置（獨立於翻譯配置）
 * 2. 引擎切換邏輯
 * 3. 首次使用提示
 */
class OcrSettingsManager {
  constructor() {
    this.BATCH_SIZE = 10; // MinerU V2 批次翻譯的批次大小

    // localStorage keys（所有以 'ocr' 開頭，與翻譯配置隔離）
    this.keys = {
      engine: 'ocrEngine',
      // Worker Auth Key (共享)
      workerAuthKey: 'ocrWorkerAuthKey',
      // Mistral OCR
      mistralKeys: 'ocrMistralKeys',
      mistralBaseUrl: 'ocrMistralBaseUrl',
      // MinerU
      mineruToken: 'ocrMinerUToken',
      mineruWorkerUrl: 'ocrMinerUWorkerUrl',
      mineruTokenMode: 'ocrMinerUTokenMode',
      mineruEnableOcr: 'ocrMinerUEnableOcr',
      mineruEnableFormula: 'ocrMinerUEnableFormula',
      mineruEnableTable: 'ocrMinerUEnableTable',
      mineruTranslationMode: 'ocrMinerUTranslationMode', // 新增：翻譯模式
      // Doc2X
      doc2xToken: 'ocrDoc2XToken',
      doc2xWorkerUrl: 'ocrDoc2XWorkerUrl',
      doc2xTokenMode: 'ocrDoc2XTokenMode',
      doc2xFormulaMode: 'ocrDoc2XFormulaMode',
      doc2xExportFormat: 'ocrDoc2XExportFormat',
      // 首次提示標記
      firstTimeTipShown: 'ocrFirstTimeTipShown'
    };

    // DOM 元素
    this.elements = {};

    this.init();
  }

  /**
   * 初始化
   */
  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.onDOMReady());
    } else {
      this.onDOMReady();
    }
  }

  /**
   * DOM 載入完成後的初始化
   */
  onDOMReady() {
    this.cacheElements();
    this.loadSettings();
    // 後端模式：非同步載入 settings.ocrConfig 並應用到表單
    this._loadFromBackendIfAvailable();
    this.bindEvents();
    this.showFirstTimeTip();

    console.log('[OCR Settings] Initialized');
  }

  /**
   * 快取 DOM 元素參考
   */
  cacheElements() {
    // OCR 引擎選擇
    this.elements.ocrEngine = document.getElementById('ocrEngine');
    this.elements.localOcrHint = document.getElementById('localOcrHint');

    // Mistral OCR
    this.elements.mistralOcrKeys = document.getElementById('mistralOcrKeys');
    this.elements.mistralBaseUrl = document.getElementById('mistralBaseUrl');
    this.elements.mistralOcrConfig = document.getElementById('mistralOcrConfig');

    // MinerU
    this.elements.mineruToken = document.getElementById('mineruToken');
    this.elements.mineruWorkerUrl = document.getElementById('mineruWorkerUrl');
    this.elements.mineruEnableOcr = document.getElementById('mineruEnableOcr');
    this.elements.mineruEnableFormula = document.getElementById('mineruEnableFormula');
    this.elements.mineruEnableTable = document.getElementById('mineruEnableTable');
    this.elements.mineruOcrConfig = document.getElementById('mineruOcrConfig');
    this.elements.mineruTranslationModeConfig = document.getElementById('mineruTranslationModeConfig'); // 新增
    this.elements.mineruTranslationModeRadios = document.getElementsByName('mineruTranslationMode'); // 新增

    // Doc2X
    this.elements.doc2xToken = document.getElementById('doc2xToken');
    this.elements.doc2xWorkerUrl = document.getElementById('doc2xWorkerUrl');
    this.elements.doc2xFormulaMode = document.getElementById('doc2xFormulaMode');
    this.elements.doc2xExportFormat = document.getElementById('doc2xExportFormat');
    this.elements.doc2xOcrConfig = document.getElementById('doc2xOcrConfig');
  }

  /**
   * 載入所有 OCR 配置
   */
  loadSettings() {
    try {
      // 引擎選擇
      const engine = localStorage.getItem(this.keys.engine) || 'mistral';
      if (this.elements.ocrEngine) {
        this.elements.ocrEngine.value = engine;
        this.switchEngine(engine); // 顯示對應的配置面板
      }

      // Mistral OCR
      if (this.elements.mistralOcrKeys) {
        this.elements.mistralOcrKeys.value = localStorage.getItem(this.keys.mistralKeys) || '';
      }
      if (this.elements.mistralBaseUrl) {
        this.elements.mistralBaseUrl.value = localStorage.getItem(this.keys.mistralBaseUrl) || 'https://api.mistral.ai';
      }

      // MinerU
      if (this.elements.mineruToken) {
        this.elements.mineruToken.value = localStorage.getItem(this.keys.mineruToken) || '';
      }
      if (this.elements.mineruWorkerUrl) {
        this.elements.mineruWorkerUrl.value = localStorage.getItem(this.keys.mineruWorkerUrl) || '';
      }
      if (this.elements.mineruEnableOcr) {
        this.elements.mineruEnableOcr.checked = localStorage.getItem(this.keys.mineruEnableOcr) !== 'false';
      }
      if (this.elements.mineruEnableFormula) {
        this.elements.mineruEnableFormula.checked = localStorage.getItem(this.keys.mineruEnableFormula) !== 'false';
      }
      if (this.elements.mineruEnableTable) {
        this.elements.mineruEnableTable.checked = localStorage.getItem(this.keys.mineruEnableTable) !== 'false';
      }
      // 載入翻譯模式
      if (this.elements.mineruTranslationModeRadios.length > 0) {
        const savedMode = localStorage.getItem(this.keys.mineruTranslationMode) || 'standard';
        Array.from(this.elements.mineruTranslationModeRadios).forEach(radio => {
          if (radio.value === savedMode) {
            radio.checked = true;
          }
        });
      }

      // Doc2X
      if (this.elements.doc2xToken) {
        this.elements.doc2xToken.value = localStorage.getItem(this.keys.doc2xToken) || '';
      }
      if (this.elements.doc2xWorkerUrl) {
        this.elements.doc2xWorkerUrl.value = localStorage.getItem(this.keys.doc2xWorkerUrl) || '';
      }
      if (this.elements.doc2xFormulaMode) {
        this.elements.doc2xFormulaMode.value = localStorage.getItem(this.keys.doc2xFormulaMode) || 'dollar';
      }
      if (this.elements.doc2xExportFormat) {
        this.elements.doc2xExportFormat.value = localStorage.getItem(this.keys.doc2xExportFormat) || '';
      }

      console.log('[OCR Settings] Settings loaded');
    } catch (error) {
      console.error('[OCR Settings] Failed to load settings:', error);
    }
  }

  /**
   * 如處於後端模式，則從後端 settings.ocrConfig 拉取配置並應用到表單，同時更新本地快取以保持其它模組相容。
   */
  async _loadFromBackendIfAvailable() {
    try {
      if (typeof window === 'undefined' || !window.storageAdapter || window.storageAdapter.isFrontendMode !== false) return;
      const settings = await window.storageAdapter.loadSettings();
      const cfg = (settings && settings.ocrConfig && typeof settings.ocrConfig === 'object') ? settings.ocrConfig : null;
      if (!cfg || !cfg.engine) return;

      // 將後端配置應用到 UI
      this._applyOcrConfigToDom(cfg);

      // 同步到 localStorage 以相容其它讀取路徑（例如 ui_model_ocr_config.js 等）
      this._mirrorOcrConfigToLocalStorage(cfg);

      console.log('[OCR Settings] Loaded ocrConfig from backend and applied.');
    } catch (e) {
      console.warn('[OCR Settings] Failed to load ocrConfig from backend (ignored):', e?.message || e);
    }
  }

  /**
   * 將後端 ocrConfig 應用到現有表單控制元件
   */
  _applyOcrConfigToDom(cfg) {
    try {
      if (!cfg || !cfg.engine) return;
      if (this.elements.ocrEngine) {
        this.elements.ocrEngine.value = cfg.engine;
      }
      this.switchEngine(cfg.engine);

      const setVal = (el, val) => { if (el && val !== undefined && val !== null) el.value = String(val); };
      const setChk = (el, val) => { if (el) el.checked = !!val; };

      if (cfg.engine === 'mistral') {
        setVal(this.elements.mistralBaseUrl, cfg.baseUrl || 'https://api.mistral.ai');
        if (Array.isArray(cfg.keys)) {
          setVal(this.elements.mistralOcrKeys, cfg.keys.join('\n'));
        }
      } else if (cfg.engine === 'mineru') {
        setVal(this.elements.mineruWorkerUrl, (cfg.workerUrl || '').replace(/\/+$/, ''));
        setVal(this.elements.mineruToken, cfg.token || '');
        setVal(document.getElementById('mineruAuthKey') || null, cfg.authKey || '');
        setChk(this.elements.mineruEnableOcr, cfg.enableOcr !== false);
        setChk(this.elements.mineruEnableFormula, cfg.enableFormula !== false);
        setChk(this.elements.mineruEnableTable, cfg.enableTable !== false);
        if (this.elements.mineruTranslationModeRadios && cfg.translationMode) {
          Array.from(this.elements.mineruTranslationModeRadios).forEach(r => { r.checked = (r.value === cfg.translationMode); });
        }
      } else if (cfg.engine === 'doc2x') {
        setVal(this.elements.doc2xWorkerUrl, (cfg.workerUrl || '').replace(/\/+$/, ''));
        setVal(this.elements.doc2xToken, cfg.token || '');
        setVal(this.elements.doc2xFormulaMode, cfg.formulaMode || 'dollar');
        setVal(this.elements.doc2xExportFormat, cfg.exportFormat || '');
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * 將後端 ocrConfig 寫入本地儲存鍵（用於相容仍從 localStorage 讀取的模組）
   */
  _mirrorOcrConfigToLocalStorage(cfg) {
    try {
      if (!cfg || !cfg.engine) return;
      localStorage.setItem(this.keys.engine, cfg.engine);
      if (cfg.engine === 'mistral') {
        if (Array.isArray(cfg.keys)) localStorage.setItem(this.keys.mistralKeys, cfg.keys.join('\n'));
        localStorage.setItem(this.keys.mistralBaseUrl, cfg.baseUrl || 'https://api.mistral.ai');
      } else if (cfg.engine === 'mineru') {
        localStorage.setItem(this.keys.mineruWorkerUrl, (cfg.workerUrl || '').replace(/\/+$/, ''));
        localStorage.setItem(this.keys.mineruToken, cfg.token || '');
        localStorage.setItem(this.keys.workerAuthKey, cfg.authKey || '');
        localStorage.setItem(this.keys.mineruTokenMode, cfg.tokenMode || 'frontend');
        localStorage.setItem(this.keys.mineruEnableOcr, cfg.enableOcr !== false);
        localStorage.setItem(this.keys.mineruEnableFormula, cfg.enableFormula !== false);
        localStorage.setItem(this.keys.mineruEnableTable, cfg.enableTable !== false);
        localStorage.setItem(this.keys.mineruTranslationMode, cfg.translationMode || 'standard');
      } else if (cfg.engine === 'doc2x') {
        localStorage.setItem(this.keys.doc2xWorkerUrl, (cfg.workerUrl || '').replace(/\/+$/, ''));
        localStorage.setItem(this.keys.doc2xToken, cfg.token || '');
        localStorage.setItem(this.keys.workerAuthKey, cfg.authKey || '');
        localStorage.setItem(this.keys.doc2xTokenMode, cfg.tokenMode || 'frontend');
        localStorage.setItem(this.keys.doc2xFormulaMode, cfg.formulaMode || 'dollar');
        localStorage.setItem(this.keys.doc2xExportFormat, cfg.exportFormat || '');
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * 儲存所有 OCR 配置
   */
  async saveSettings() {
    try {
      // 引擎選擇
      if (this.elements.ocrEngine) {
        localStorage.setItem(this.keys.engine, this.elements.ocrEngine.value);
      }

      // Mistral OCR
      if (this.elements.mistralOcrKeys) {
        localStorage.setItem(this.keys.mistralKeys, this.elements.mistralOcrKeys.value);
      }
      if (this.elements.mistralBaseUrl) {
        localStorage.setItem(this.keys.mistralBaseUrl, this.elements.mistralBaseUrl.value);
      }

      // MinerU
      if (this.elements.mineruToken) {
        localStorage.setItem(this.keys.mineruToken, this.elements.mineruToken.value);
      }
      if (this.elements.mineruWorkerUrl) {
        localStorage.setItem(this.keys.mineruWorkerUrl, this.elements.mineruWorkerUrl.value);
      }
      if (this.elements.mineruEnableOcr) {
        localStorage.setItem(this.keys.mineruEnableOcr, this.elements.mineruEnableOcr.checked);
      }
      if (this.elements.mineruEnableFormula) {
        localStorage.setItem(this.keys.mineruEnableFormula, this.elements.mineruEnableFormula.checked);
      }
      if (this.elements.mineruEnableTable) {
        localStorage.setItem(this.keys.mineruEnableTable, this.elements.mineruEnableTable.checked);
      }
      // 儲存翻譯模式
      if (this.elements.mineruTranslationModeRadios.length > 0) {
        const checkedRadio = Array.from(this.elements.mineruTranslationModeRadios).find(r => r.checked);
        if (checkedRadio) {
          localStorage.setItem(this.keys.mineruTranslationMode, checkedRadio.value);
        }
      }

      // Doc2X
      if (this.elements.doc2xToken) {
        localStorage.setItem(this.keys.doc2xToken, this.elements.doc2xToken.value);
      }
      if (this.elements.doc2xWorkerUrl) {
        localStorage.setItem(this.keys.doc2xWorkerUrl, this.elements.doc2xWorkerUrl.value);
      }
      if (this.elements.doc2xFormulaMode) {
        localStorage.setItem(this.keys.doc2xFormulaMode, this.elements.doc2xFormulaMode.value);
      }
      if (this.elements.doc2xExportFormat) {
        localStorage.setItem(this.keys.doc2xExportFormat, this.elements.doc2xExportFormat.value);
      }

      console.log('[OCR Settings] Settings saved');

      // 後端模式：寫入 settings.ocrConfig
      try {
        if (typeof window !== 'undefined' && window.storageAdapter && window.storageAdapter.isFrontendMode === false) {
          const settings = await window.storageAdapter.loadSettings();
          const cfg = this.getCurrentConfig();
          const merged = { ...(settings || {}), ocrConfig: cfg };
          await window.storageAdapter.saveSettings(merged);
          console.log('[OCR Settings] ocrConfig persisted to backend');
        }
      } catch (be) {
        console.warn('[OCR Settings] Persist ocrConfig to backend failed (ignored):', be?.message || be);
      }
    } catch (error) {
      console.error('[OCR Settings] Failed to save settings:', error);
    }
  }

  /**
   * 綁定事件監聽器
   */
  bindEvents() {
    // 引擎切換
    if (this.elements.ocrEngine) {
      this.elements.ocrEngine.addEventListener('change', (e) => {
        this.switchEngine(e.target.value);
        this.saveSettings();
      });
    }

    // MinerU 翻譯模式改變時自動儲存
    if (this.elements.mineruTranslationModeRadios.length > 0) {
      Array.from(this.elements.mineruTranslationModeRadios).forEach(radio => {
        radio.addEventListener('change', () => this.saveSettings());
      });
    }

    // 所有輸入欄位自動儲存
    const inputIds = [
      'mistralOcrKeys', 'mistralBaseUrl',
      'mineruToken', 'mineruWorkerUrl',
      'mineruEnableOcr', 'mineruEnableFormula', 'mineruEnableTable',
      'doc2xToken', 'doc2xWorkerUrl',
      'doc2xFormulaMode', 'doc2xExportFormat'
    ];

    inputIds.forEach(id => {
      const el = this.elements[id];
      if (el) {
        el.addEventListener('change', () => this.saveSettings());

        // 對於 textarea 和 text input，也監聽 input 事件（實時儲存）
        if (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'password') {
          el.addEventListener('input', this.debounce(() => this.saveSettings(), 500));
        }
      }
    });

    console.log('[OCR Settings] Events bound');
  }

  /**
   * 切換 OCR 引擎（顯示/隱藏對應配置面板）
   * @param {string} engine - 引擎名稱: 'none' | 'local' | 'mistral' | 'mineru' | 'doc2x'
   */
  switchEngine(engine) {
    // 隱藏所有配置面板
    if (this.elements.mistralOcrConfig) {
      this.elements.mistralOcrConfig.classList.add('hidden');
    }
    if (this.elements.mineruOcrConfig) {
      this.elements.mineruOcrConfig.classList.add('hidden');
    }
    if (this.elements.doc2xOcrConfig) {
      this.elements.doc2xOcrConfig.classList.add('hidden');
    }

    // 隱藏 MinerU 翻譯模式配置
    if (this.elements.mineruTranslationModeConfig) {
      this.elements.mineruTranslationModeConfig.classList.add('hidden');
    }

    // 隱藏本地解析提示
    if (this.elements.localOcrHint) {
      this.elements.localOcrHint.classList.add('hidden');
    }

    // 顯示選中的配置面板
    switch (engine) {
      case 'none':
        // 不需要 OCR，不顯示任何配置面板
        break;
      case 'local':
        // 顯示本地解析提示
        if (this.elements.localOcrHint) {
          this.elements.localOcrHint.classList.remove('hidden');
        }
        break;
      case 'mistral':
        if (this.elements.mistralOcrConfig) {
          this.elements.mistralOcrConfig.classList.remove('hidden');
        }
        break;
      case 'mineru':
        if (this.elements.mineruOcrConfig) {
          this.elements.mineruOcrConfig.classList.remove('hidden');
        }
        // 顯示 MinerU 翻譯模式配置
        if (this.elements.mineruTranslationModeConfig) {
          this.elements.mineruTranslationModeConfig.classList.remove('hidden');
        }
        break;
      case 'doc2x':
        if (this.elements.doc2xOcrConfig) {
          this.elements.doc2xOcrConfig.classList.remove('hidden');
        }
        break;
    }

    console.log(`[OCR Settings] Switched to ${engine}`);
  }

  /**
   * 首次使用提示（可選功能）
   * 檢測是否已有翻譯用的 Mistral Keys，提示使用者是否複製到 OCR 配置
   */
  showFirstTimeTip() {
    try {
      const ocrKeys = localStorage.getItem(this.keys.mistralKeys);
      const translationKeys = localStorage.getItem('mistralApiKeys'); // 翻譯用的 Keys
      const tipShown = localStorage.getItem(this.keys.firstTimeTipShown);

      // 條件：OCR 未配置 + 翻譯已配置 + 提示未顯示過
      if (!ocrKeys && translationKeys && !tipShown) {
        const message =
          '檢測到您已配置 Mistral 翻譯 API Keys。\n\n' +
          '提示：OCR 功能使用獨立的 API Key 配置。\n' +
          '是否將翻譯配置複製到 OCR 配置中作為初始值？\n\n' +
          '（您可以稍後在設定中單獨修改）';

        if (confirm(message)) {
          localStorage.setItem(this.keys.mistralKeys, translationKeys);
          if (this.elements.mistralOcrKeys) {
            this.elements.mistralOcrKeys.value = translationKeys;
          }
          console.log('[OCR Settings] Copied translation keys to OCR config');
        }

        // 標記提示已顯示
        localStorage.setItem(this.keys.firstTimeTipShown, 'true');
      }
    } catch (error) {
      console.error('[OCR Settings] Failed to show first time tip:', error);
    }
  }

  /**
   * 獲取當前選擇的 OCR 引擎配置
   * @returns {Object} 配置物件
   */
  getCurrentConfig() {
    const engine = localStorage.getItem(this.keys.engine) || 'mistral';

    switch (engine) {
      case 'none':
        return { engine: 'none' };

      case 'local':
        return { engine: 'local' };

      case 'mistral':
        // 優先從 Key 管理器讀取 Mistral Keys，若為空則回退到 legacy 文字框儲存（ocrMistralKeys）
        try {
          const loadFn = (typeof window !== 'undefined' && typeof window.loadModelKeys === 'function')
            ? window.loadModelKeys
            : (typeof loadModelKeys === 'function' ? loadModelKeys : null);
          let keysFromManager = [];
          if (loadFn) {
            const all = loadFn('mistral') || [];
            keysFromManager = all
              .filter(k => k && k.value && k.value.trim() && (k.status === 'valid' || k.status === 'untested'))
              .map(k => k.value.trim());
          }
          const legacy = (localStorage.getItem(this.keys.mistralKeys) || '')
            .split('\n')
            .map(k => k.trim())
            .filter(Boolean);
          const merged = (keysFromManager && keysFromManager.length > 0) ? keysFromManager : legacy;
          const baseUrl = localStorage.getItem(this.keys.mistralBaseUrl) || 'https://api.mistral.ai';
          return { engine: 'mistral', keys: merged, baseUrl };
        } catch (e) {
          console.warn('[OCR Settings] 讀取 Mistral Keys 失敗，回退 legacy。', e);
          const legacy = (localStorage.getItem(this.keys.mistralKeys) || '')
            .split('\n')
            .map(k => k.trim())
            .filter(Boolean);
          const baseUrl = localStorage.getItem(this.keys.mistralBaseUrl) || 'https://api.mistral.ai';
          return { engine: 'mistral', keys: legacy, baseUrl };
        }

      case 'mineru':
        return {
          engine: 'mineru',
          token: localStorage.getItem(this.keys.mineruToken) || '',
          workerUrl: (localStorage.getItem(this.keys.mineruWorkerUrl) || '').replace(/\/+$/, ''), // 去掉末尾斜槓
          authKey: localStorage.getItem(this.keys.workerAuthKey) || '',
          tokenMode: localStorage.getItem(this.keys.mineruTokenMode) || 'frontend',
          enableOcr: localStorage.getItem(this.keys.mineruEnableOcr) !== 'false',
          enableFormula: localStorage.getItem(this.keys.mineruEnableFormula) !== 'false',
          enableTable: localStorage.getItem(this.keys.mineruEnableTable) !== 'false',
          translationMode: localStorage.getItem(this.keys.mineruTranslationMode) || 'standard' // 新增
        };

      case 'doc2x':
        return {
          engine: 'doc2x',
          token: localStorage.getItem(this.keys.doc2xToken) || '',
          workerUrl: (localStorage.getItem(this.keys.doc2xWorkerUrl) || '').replace(/\/+$/, ''), // 去掉末尾斜槓
          authKey: localStorage.getItem(this.keys.workerAuthKey) || '',
          tokenMode: localStorage.getItem(this.keys.doc2xTokenMode) || 'frontend',
          formulaMode: localStorage.getItem(this.keys.doc2xFormulaMode) || 'dollar',
          exportFormat: localStorage.getItem(this.keys.doc2xExportFormat) || ''
        };

      default:
        throw new Error(`Unknown OCR engine: ${engine}`);
    }
  }

  /**
   * 驗證 OCR 配置是否完整
   * @returns {Object} { valid: boolean, message: string }
   */
  validateConfig() {
    const config = this.getCurrentConfig();

    switch (config.engine) {
      case 'none':
      case 'local':
        // 不需要 OCR 或本地解析，配置總是有效的
        return { valid: true, message: '' };

      case 'mistral':
        // 支援 Key 管理器 + legacy 兩種來源（由 getCurrentConfig 聚合）
        if (!config.keys || config.keys.length === 0) {
          return { valid: false, message: '請配置 Mistral OCR API Keys' };
        }
        break;

      case 'mineru':
        // 前端透傳模式需要 Token，Worker 配置模式不需要
        if (config.tokenMode === 'frontend' && !config.token) {
          return { valid: false, message: '請配置 MinerU Token（前端透傳模式）' };
        }
        if (!config.workerUrl) {
          return { valid: false, message: '請配置 MinerU Worker URL' };
        }
        break;

      case 'doc2x':
        // 前端透傳模式需要 Token，Worker 配置模式不需要
        if (config.tokenMode === 'frontend' && !config.token) {
          return { valid: false, message: '請配置 Doc2X Token（前端透傳模式）' };
        }
        if (!config.workerUrl) {
          return { valid: false, message: '請配置 Doc2X Worker URL' };
        }
        break;
    }

    return { valid: true, message: '' };
  }

  /**
   * 防抖函式
   * @param {Function} func - 要防抖的函式
   * @param {number} wait - 等待時間（毫秒）
   * @returns {Function} 防抖後的函式
   */
  debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
}

// 建立全域例項
if (typeof window !== 'undefined') {
  window.ocrSettingsManager = new OcrSettingsManager();
}

// 匯出（如果使用模組化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OcrSettingsManager;
}
