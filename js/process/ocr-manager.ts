// process/ocr-manager.js
// OCR 管理器 - 統一的 OCR 介面

/**
 * OCR 管理器
 * 負責：
 * 1. 根據配置建立對應的介面卡
 * 2. 統一的上傳和處理介面
 * 3. 統一的輸出格式：{ markdown: string, images: [{id, data}], metadata: {} }
 */
class OcrManager {
  constructor() {
    this.adapter = null;
  }

  /**
   * 初始化介面卡
   * @returns {Promise<void>}
   */
  async initialize() {
    let config = this.getConfig();
    try {
      if (typeof window !== 'undefined' && window.storageAdapter && window.storageAdapter.isFrontendMode === false && typeof window.storageAdapter.loadSettings === 'function') {
        const settings = await window.storageAdapter.loadSettings();
        if (settings && settings.ocrConfig && typeof settings.ocrConfig === 'object') {
          // 後端統一配置優先
          config = settings.ocrConfig;
        }
      }
    } catch (e) {
      console.warn('[OCR Manager] 載入後端 ocrConfig 失敗，使用本地配置:', e);
    }
    this.adapter = this.createAdapter(config);
    console.log(`[OCR Manager] Initialized with ${config.engine} adapter`);
  }

  /**
   * 獲取當前 OCR 配置
   * @returns {Object} 配置物件
   */
  getConfig() {
    if (typeof window !== 'undefined' && window.ocrSettingsManager) {
      return window.ocrSettingsManager.getCurrentConfig();
    }

    // Fallback: 直接從 localStorage 讀取
    const engine = localStorage.getItem('ocrEngine') || 'mistral';

    switch (engine) {
      case 'local':
        // 本地解析不需要任何配置
        return { engine: 'local' };

      case 'mistral':
        // 使用 KeyManager 的統一 Key 池來管理 Mistral OCR 的 Keys
        // 讀取 KeyManager；若為空則回退到 ocrMistralKeys（相容舊配置）
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
          let keysFromLegacy = (localStorage.getItem('ocrMistralKeys') || '')
            .split('\n')
            .map(k => k.trim())
            .filter(Boolean);
          let merged = keysFromManager && keysFromManager.length > 0 ? keysFromManager : keysFromLegacy;

          // 可選：若管理器為空但 legacy 有值，嘗試遷移到 KeyManager（非強制）
          if ((!keysFromManager || keysFromManager.length === 0) && keysFromLegacy.length > 0) {
            try {
              const saveFn = (typeof window !== 'undefined' && typeof window.saveModelKeys === 'function')
                ? window.saveModelKeys : (typeof saveModelKeys === 'function' ? saveModelKeys : null);
              if (saveFn) {
                const objects = keysFromLegacy.map((v, i) => ({ id: (typeof generateUUID === 'function' ? generateUUID() : String(Date.now())+'-'+i), value: v, remark: '', status: 'untested', order: i }));
                saveFn('mistral', objects);
              }
            } catch (mErr) { /* ignore migration errors */ }
          }

          return { engine: 'mistral', keys: merged };
        } catch (e) {
          console.warn('[OCR Manager] 載入 Mistral Keys 出錯，回退到 ocrMistralKeys。', e);
          const legacy = (localStorage.getItem('ocrMistralKeys') || '')
            .split('\n')
            .map(k => k.trim())
            .filter(Boolean);
          return { engine: 'mistral', keys: legacy };
        }

      case 'mineru':
        return {
          engine: 'mineru',
          token: localStorage.getItem('ocrMinerUToken') || '',
          workerUrl: (localStorage.getItem('ocrMinerUWorkerUrl') || '').replace(/\/+$/, ''), // 去掉末尾斜槓
          authKey: localStorage.getItem('ocrWorkerAuthKey') || '',
          tokenMode: localStorage.getItem('ocrMinerUTokenMode') || 'frontend',
          enableOcr: localStorage.getItem('ocrMinerUEnableOcr') !== 'false',
          enableFormula: localStorage.getItem('ocrMinerUEnableFormula') !== 'false',
          enableTable: localStorage.getItem('ocrMinerUEnableTable') !== 'false'
        };

      case 'doc2x':
        return {
          engine: 'doc2x',
          token: localStorage.getItem('ocrDoc2XToken') || '',
          workerUrl: (localStorage.getItem('ocrDoc2XWorkerUrl') || '').replace(/\/+$/, ''), // 去掉末尾斜槓
          authKey: localStorage.getItem('ocrWorkerAuthKey') || '',
          tokenMode: localStorage.getItem('ocrDoc2XTokenMode') || 'frontend'
          // 注意：不再需要 exportFormat，因為我們總是匯出 Markdown + 圖片
        };

      default:
        throw new Error(`Unknown OCR engine: ${engine}`);
    }
  }

  /**
   * 建立介面卡
   * @param {Object} config - 配置物件
   * @returns {OcrAdapter} 介面卡例項
   */
  createAdapter(config) {
    switch (config.engine) {
      case 'local':
        if (typeof LocalPdfAdapter === 'undefined') {
          throw new Error('LocalPdfAdapter not loaded');
        }
        return new LocalPdfAdapter();

      case 'mistral':
        if (typeof MistralOcrAdapter === 'undefined') {
          throw new Error('MistralOcrAdapter not loaded');
        }
        return new MistralOcrAdapter(config);

      case 'mineru':
        if (typeof MinerUOcrAdapter === 'undefined') {
          throw new Error('MinerUOcrAdapter not loaded');
        }
        return new MinerUOcrAdapter(config);

      case 'doc2x':
        if (typeof Doc2XOcrAdapter === 'undefined') {
          throw new Error('Doc2XOcrAdapter not loaded');
        }
        return new Doc2XOcrAdapter(config);

      default:
        throw new Error(`Unknown OCR engine: ${config.engine}`);
    }
  }

  /**
   * 驗證配置
   * @returns {Object} { valid: boolean, message: string }
   */
  validateConfig() {
    if (typeof window !== 'undefined' && window.ocrSettingsManager) {
      return window.ocrSettingsManager.validateConfig();
    }

    // Fallback 驗證
    const config = this.getConfig();

    switch (config.engine) {
      case 'local':
        // 本地解析不需要配置，總是有效
        return { valid: true, message: '' };

      case 'mistral':
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
   * 上傳並處理檔案
   * @param {File} file - PDF 檔案
   * @param {Function} onProgress - 進度回撥 (current, total, message)
   * @returns {Promise<Object>} { markdown: string, images: [{id, data}], metadata: {} }
   */
  async processFile(file, onProgress) {
    // 驗證配置
    const validation = this.validateConfig();
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // 初始化介面卡
    await this.initialize();

    console.log(`[OCR Manager] Processing file: ${file.name} with ${this.adapter.constructor.name}`);

    // 呼叫介面卡處理
    return await this.adapter.processFile(file, onProgress);
  }
}

/**
 * OCR 介面卡基類（抽象類）
 */
class OcrAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * 處理檔案（子類必須實現）
   * @param {File} file - PDF 檔案
   * @param {Function} onProgress - 進度回撥
   * @returns {Promise<Object>} { markdown: string, images: [{id, data}], metadata: {} }
   */
  async processFile(file, onProgress) {
    throw new Error('processFile() must be implemented by subclass');
  }

  /**
   * Blob 轉 Base64
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 延遲
   * @param {number} ms - 毫秒
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 匯出到全域（非模組化環境）
if (typeof window !== 'undefined') {
  window.OcrManager = OcrManager;
  window.OcrAdapter = OcrAdapter;
}

// 模組化匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OcrManager, OcrAdapter };
}
