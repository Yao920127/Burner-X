// process/ocr-adapters/mistral-adapter.js
// Mistral OCR 介面卡 - 保持現有邏輯

/**
 * Mistral OCR 介面卡
 * 基於現有的 processOcrResults 邏輯
 */
class MistralOcrAdapter extends OcrAdapter {
  constructor(config) {
    super(config);
    this.keys = config.keys || [];
    this.currentKeyIndex = 0;
    this.baseUrl = (config.baseUrl || 'https://api.mistral.ai').replace(/\/+$/, ''); // 移除頁尾斜槓
  }

  /**
   * 處理檔案
   * @param {File} file - PDF 檔案
   * @param {Function} onProgress - 進度回撥
   * @returns {Promise<Object>} { markdown, images, metadata }
   */
  async processFile(file, onProgress) {
    console.log('[Mistral OCR] Processing file:', file.name);

    onProgress?.(0, 100, '準備上傳檔案...');

    // 呼叫 Mistral OCR API
    const ocrResponse = await this.callMistralOcr(file, onProgress);

    onProgress?.(80, 100, '處理 OCR 結果...');

    // 處理結果（使用現有的 processOcrResults 邏輯）
    const result = this.processOcrResults(ocrResponse);

    onProgress?.(100, 100, '完成');

    return {
      markdown: result.markdown,
      images: result.images,
      metadata: {
        engine: 'mistral',
        pageCount: ocrResponse.pages?.length || 0
      }
    };
  }

  /**
   * 呼叫 Mistral OCR API
   * @param {File} file
   * @param {Function} onProgress
   * @returns {Promise<Object>} OCR 響應
   */
  async callMistralOcr(file, onProgress) {
    if (this.keys.length === 0) {
      throw new Error('未配置 Mistral API Keys');
    }

    // 輪詢使用不同的 key（簡單負載均衡）
    const apiKey = this.keys[this.currentKeyIndex % this.keys.length];
    this.currentKeyIndex++;

    try {
      // 1. 上傳檔案到 Mistral
      onProgress?.(10, 100, '上傳到 Mistral...');
      const fileId = await this.uploadToMistral(file, apiKey);
      console.log('[Mistral OCR] File ID:', fileId);

      // 2. 等待檔案處理完成
      onProgress?.(30, 100, '等待檔案處理...');
      await this.sleep(1000);

      // 3. 獲取簽名 URL
      onProgress?.(40, 100, '獲取簽名 URL...');
      const signedUrl = await this.getMistralSignedUrl(fileId, apiKey);
      console.log('[Mistral OCR] Signed URL obtained');

      // 4. 呼叫 OCR API
      onProgress?.(50, 100, '開始 OCR 處理...');
      const ocrData = await this.callOcrApi(signedUrl, apiKey);

      // 5. 清理檔案（非同步，不阻塞）
      this.deleteMistralFile(fileId, apiKey).catch(err => {
        console.warn('[Mistral OCR] 檔案清理失敗:', err);
      });

      return ocrData;

    } catch (error) {
      // 判斷是否為 API Key 失效錯誤
      if (error.message && (
        error.message.includes('無效') ||
        error.message.includes('未授權') ||
        error.message.includes('401') ||
        error.message.toLowerCase().includes('invalid api key') ||
        error.message.toLowerCase().includes('unauthorized')
      )) {
        throw new Error(`Mistral API Key 可能已失效: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 上傳檔案到 Mistral
   * @param {File} file
   * @param {string} apiKey
   * @returns {Promise<string>} file_id
   */
  async uploadToMistral(file, apiKey) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'ocr');

    const response = await fetch(`${this.baseUrl}/v1/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`上傳到 Mistral 失敗 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data || !data.id) {
      throw new Error('上傳成功但未返回檔案 ID');
    }

    return data.id;
  }

  /**
   * 獲取 Mistral 簽名 URL
   * @param {string} fileId
   * @param {string} apiKey
   * @returns {Promise<string>} signed_url
   */
  async getMistralSignedUrl(fileId, apiKey) {
    const response = await fetch(`${this.baseUrl}/v1/files/${fileId}/url`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`獲取簽名 URL 失敗 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data || !data.url) {
      throw new Error('獲取的簽名 URL 格式不正確');
    }

    return data.url;
  }

  /**
   * 呼叫 OCR API
   * @param {string} signedUrl
   * @param {string} apiKey
   * @returns {Promise<Object>} OCR 資料
   */
  async callOcrApi(signedUrl, apiKey) {
    const response = await fetch(`${this.baseUrl}/v1/ocr`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: { type: 'document_url', document_url: signedUrl },
        include_image_base64: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`OCR 處理失敗 (${response.status}): ${errorText}`);
    }

    const ocrData = await response.json();
    if (!ocrData || !ocrData.pages) {
      throw new Error('OCR 處理成功但返回的資料格式不正確');
    }

    return ocrData;
  }

  /**
   * 刪除 Mistral 檔案
   * @param {string} fileId
   * @param {string} apiKey
   * @returns {Promise<void>}
   */
  async deleteMistralFile(fileId, apiKey) {
    if (!fileId || !apiKey) return;

    try {
      const response = await fetch(`${this.baseUrl}/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        console.warn(`[Mistral OCR] 檔案刪除失敗: ${response.status}`);
      }
    } catch (error) {
      console.warn('[Mistral OCR] 檔案刪除錯誤:', error);
    }
  }

  /**
   * 處理 OCR 結果
   * 來自 js/process/ocr.js 的 processOcrResults 函式
   * @param {Object} ocrResponse - OCR API 返回的 JSON
   * @returns {Object} { markdown: string, images: Array }
   */
  processOcrResults(ocrResponse) {
    let markdownContent = '';
    let imagesData = [];

    try {
      for (const page of ocrResponse.pages) {
        const pageImages = {};

        // 提取圖片
        if (page.images && Array.isArray(page.images)) {
          for (const img of page.images) {
            if (img.id && img.image_base64) {
              const imgId = img.id;
              const imgData = img.image_base64;
              imagesData.push({ id: imgId, data: imgData });
              // 記錄圖片 ID 到 markdown 路徑的對映
              // 檢查 imgId 是否已包含副檔名，避免雙重副檔名問題（如 img-0.jpeg.png）
              const imgPath = /\.[a-z0-9]+$/i.test(imgId)
                ? `images/${imgId}`
                : `images/${imgId}.png`;
              pageImages[imgId] = imgPath;
            }
          }
        }

        let pageMarkdown = page.markdown || '';

        // 替換圖片路徑
        for (const [imgName, imgPath] of Object.entries(pageImages)) {
          // 轉義特殊字元
          const escapedImgName = typeof escapeRegex === 'function'
            ? escapeRegex(imgName)
            : imgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          const imgRegex = new RegExp(`!\\[([^\\]]*?)\\]\\(${escapedImgName}\\)`, 'g');
          pageMarkdown = pageMarkdown.replace(imgRegex, (match, altText) => {
            const finalAltText = altText || imgName;
            return `![${finalAltText}](${imgPath})`;
          });
        }

        markdownContent += pageMarkdown + '\n\n';
      }

      return { markdown: markdownContent.trim(), images: imagesData };
    } catch (error) {
      console.error('[Mistral OCR] 處理結果時出錯:', error);
      throw new Error(`處理 OCR 結果失敗: ${error.message}`);
    }
  }
}

// 匯出到全域
if (typeof window !== 'undefined') {
  window.MistralOcrAdapter = MistralOcrAdapter;
}

// 模組化匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MistralOcrAdapter;
}
