// js/process/ocr-adapters/base-adapter.js
// OCR 介面卡基類

/**
 * OCR 介面卡基類（抽象類）
 */
class BaseOcrAdapter {
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
   * 生成唯一 ID
   * @returns {string}
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 延遲函式
   * @param {number} ms - 毫秒
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 延遲函式（別名，相容性）
   * @param {number} ms - 毫秒
   * @returns {Promise<void>}
   */
  delay(ms) {
    return this.sleep(ms);
  }
}

// 匯出到全域（向後相容 OcrAdapter 名稱）
if (typeof window !== 'undefined') {
  window.BaseOcrAdapter = BaseOcrAdapter;
  window.OcrAdapter = BaseOcrAdapter; // 相容舊程式碼
}
