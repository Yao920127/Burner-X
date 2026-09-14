// js/chatbot/chatbot-image-utils.js

/**
 * ChatbotImageUtils 聊天機器人圖片工具集
 *
 * 主要功能：
 * 1. 管理使用者在聊天輸入中選擇的圖片（預覽、選擇、壓縮等）。
 * 2. 支援圖片選擇彈出視窗、圖片壓縮、圖片預覽彈出視窗等操作。
 * 3. 限制圖片選擇數量，處理圖片壓縮失敗等異常。
 */
window.ChatbotImageUtils = {
  /**
   * 當前已選中的圖片資訊陣列。
   * 每個元素包含 originalSrc、fullBase64、thumbnailBase64。
   */
  selectedChatbotImages: [],

  /**
   * 更新聊天輸入區已選圖片的預覽區域。
   *
   * 主要邏輯：
   * 1. 獲取預覽容器元素。
   * 2. 清空之前的預覽內容。
   * 3. 若有已選圖片，則依次生成縮圖並展示。
   * 4. 若無已選圖片，則隱藏預覽區域。
   */
  updateSelectedImagesPreview: function() {
    const previewContainer = document.getElementById('chatbot-selected-images-preview');
    if (!previewContainer) {
      // console.error('ChatbotImageUtils: chatbot-selected-images-preview element not found.');
      return;
    }
    previewContainer.innerHTML = ''; // 清空之前的預覽
    if (this.selectedChatbotImages && this.selectedChatbotImages.length > 0) {
      previewContainer.style.display = 'flex';
      previewContainer.style.flexWrap = 'wrap';
      previewContainer.style.gap = '8px';
      previewContainer.style.paddingBottom = '8px';

      this.selectedChatbotImages.forEach(imgInfo => {
        const imgElement = document.createElement('img');
        imgElement.src = imgInfo.thumbnailBase64 || imgInfo.fullBase64; // 優先使用縮圖
        imgElement.alt = 'Selected image';
        imgElement.style.width = '50px';
        imgElement.style.height = '50px';
        imgElement.style.objectFit = 'cover';
        imgElement.style.borderRadius = '4px';
        previewContainer.appendChild(imgElement);
      });
    } else {
      previewContainer.style.display = 'none';
    }
  },

  /**
   * 開啟圖片選擇彈出視窗，允許使用者從文件圖片中選擇。
   *
   * 主要邏輯：
   * 1. 若彈出視窗不存在則動態建立。
   * 2. 展示所有可選圖片，支援點選選擇/取消選擇。
   * 3. 限制最多選擇5張圖片。
   * 4. 選擇後自動壓縮圖片並生成縮圖。
   * 5. 選擇完成後關閉彈出視窗並重新整理預覽。
   */
  openImageSelectionModal: function() {
    let modal = document.getElementById('chatbot-image-selection-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'chatbot-image-selection-modal';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
      modal.style.zIndex = '100002';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      // 點選遮罩關閉彈出視窗
      modal.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };

      const contentDiv = document.createElement('div');
      contentDiv.style.background = 'white';
      contentDiv.style.padding = '20px';
      contentDiv.style.borderRadius = '8px';
      contentDiv.style.maxWidth = '80vw';
      contentDiv.style.maxHeight = '80vh';
      contentDiv.style.overflowY = 'auto';
      // 阻止內容區點選冒泡到遮罩
      contentDiv.onclick = function(e) { e.stopPropagation(); };

      const title = document.createElement('h3');
      title.textContent = '選擇要新增到訊息的圖片';
      title.style.marginTop = '0';
      contentDiv.appendChild(title);

      const imageGrid = document.createElement('div');
      imageGrid.id = 'chatbot-doc-image-grid';
      imageGrid.style.display = 'grid';
      imageGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
      imageGrid.style.gap = '10px';
      imageGrid.style.marginTop = '15px';
      contentDiv.appendChild(imageGrid);

      const footer = document.createElement('div');
      footer.style.marginTop = '20px';
      footer.style.textAlign = 'right';

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '完成選擇';
      closeBtn.style.padding = '8px 16px';
      closeBtn.style.border = 'none';
      closeBtn.style.background = '#3b82f6';
      closeBtn.style.color = 'white';
      closeBtn.style.borderRadius = '6px';
      closeBtn.style.cursor = 'pointer';
      const self = this; // 用於回撥中訪問this
      closeBtn.onclick = function() {
        modal.style.display = 'none';
        self.updateSelectedImagesPreview();
      };
      footer.appendChild(closeBtn);
      contentDiv.appendChild(footer);
      modal.appendChild(contentDiv);
      document.body.appendChild(modal);
    }

    const imageGrid = modal.querySelector('#chatbot-doc-image-grid');
    imageGrid.innerHTML = ''; // 清空之前的圖片

    // 獲取文件圖片資料
    const docImages = (window.data && window.data.images) ? window.data.images : [];

    if (docImages.length === 0) {
      imageGrid.innerHTML = '<p>當前文件沒有圖片可供選擇。</p>';
    } else {
      const self = this; // 用於非同步回撥
      docImages.forEach((imgData, index) => {
        const imgContainer = document.createElement('div');
        imgContainer.style.position = 'relative';
        imgContainer.style.border = '2px solid transparent';
        imgContainer.style.borderRadius = '6px';
        imgContainer.style.cursor = 'pointer';
        imgContainer.style.transition = 'border-color 0.2s';

        // 判斷當前圖片是否已被選中
        const isSelected = self.selectedChatbotImages.some(sImg => sImg.originalSrc === (imgData.name || `doc-img-${index}`));
        if (isSelected) {
          imgContainer.style.borderColor = '#3b82f6';
        }

        const imgElement = document.createElement('img');
        let imgSrc = '';
        if(imgData.data && imgData.data.startsWith('data:image')) {
          imgSrc = imgData.data;
        } else if (imgData.data) {
          imgSrc = 'data:image/png;base64,' + imgData.data;
        }
        imgElement.src = imgSrc;
        imgElement.style.width = '100%';
        imgElement.style.height = 'auto';
        imgElement.style.maxHeight = '120px';
        imgElement.style.objectFit = 'contain';
        imgElement.style.display = 'block';
        imgElement.style.borderRadius = '4px';

        imgContainer.appendChild(imgElement);

        // 壓縮引數
        const MAX_IMAGE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB
        const MAX_THUMBNAIL_SIZE_BYTES = 60 * 1024; // 60KB
        const MAX_DIMENSION = 1024;
        const THUMB_DIMENSION = 200;

        // 點選圖片選擇/取消選擇
        imgContainer.onclick = async function() {
          const originalSrcIdentifier = imgData.name || `doc-img-${index}`;
          const selectedIndex = self.selectedChatbotImages.findIndex(sImg => sImg.originalSrc === originalSrcIdentifier);

          if (selectedIndex > -1) {
            // 已選中則取消選擇
            self.selectedChatbotImages.splice(selectedIndex, 1);
            imgContainer.style.borderColor = 'transparent';
          } else {
            // 限制最多選擇5張
            if (self.selectedChatbotImages.length >= 5) {
              if (typeof ChatbotUtils !== 'undefined' && ChatbotUtils.showToast) {
                ChatbotUtils.showToast('最多選擇 5 張圖片。');
              } else {
                alert('最多選擇 5 張圖片。');
              }
              return;
            }
            imgContainer.style.borderColor = '#3b82f6';
            try {
              // 壓縮原圖和縮圖
              const fullBase64 = await self.compressImage(imgSrc, MAX_IMAGE_SIZE_BYTES, MAX_DIMENSION, 0.85);
              const thumbnailBase64 = await self.compressImage(imgSrc, MAX_THUMBNAIL_SIZE_BYTES, THUMB_DIMENSION, 0.7);

              self.selectedChatbotImages.push({
                originalSrc: originalSrcIdentifier,
                fullBase64: fullBase64,
                thumbnailBase64: thumbnailBase64,
              });
            } catch (error) {
              if (typeof ChatbotUtils !== 'undefined' && ChatbotUtils.showToast) {
                 ChatbotUtils.showToast('圖片處理失敗: ' + error.message);
              } else {
                alert('圖片處理失敗: ' + error.message);
              }
              imgContainer.style.borderColor = 'transparent';
            }
          }
        };
        imageGrid.appendChild(imgContainer);
      });
    }
    modal.style.display = 'flex';
  },

  /**
   * 壓縮圖片到目標大小和尺寸。
   *
   * 主要邏輯：
   * 1. 載入圖片並按最大寬高等比縮放。
   * 2. 透過 canvas 反覆調整壓縮質量，直到檔案大小不超過目標值或達到最小質量。
   * 3. 返回壓縮後的 base64 資料。
   *
   * @param {string} base64Src - base64 編碼的圖片資料。
   * @param {number} targetSizeBytes - 目標檔案大小（位元組）。
   * @param {number} maxDimension - 最大寬/高。
   * @param {number} initialQuality - 初始壓縮質量（0-1）。
   * @returns {Promise<string>} - 壓縮後的 base64 圖片資料。
   */
  compressImage: async function(base64Src, targetSizeBytes, maxDimension, initialQuality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        let width = img.width;
        let height = img.height;

        // 按最大寬高等比縮放
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = initialQuality;
        let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        let iterations = 0;
        const maxIterations = 10;

        // 反覆降低質量直到滿足大小或達到最小質量
        while (compressedBase64.length * 0.75 > targetSizeBytes && quality > 0.1 && iterations < maxIterations) {
          quality -= 0.1;
          compressedBase64 = canvas.toDataURL('image/jpeg', Math.max(0.1, quality));
          iterations++;
        }

        if (compressedBase64.length * 0.75 > targetSizeBytes && targetSizeBytes < 100 * 1024) {
           console.warn(`Image compression for small target (${targetSizeBytes}B) resulted in ${Math.round(compressedBase64.length * 0.75 / 1024)}KB. Quality: ${quality.toFixed(2)}`);
        }
        resolve(compressedBase64);
      };
      img.onerror = (err) => {
        console.error("Image loading error for compression:", err, base64Src.substring(0,100));
        reject(new Error('無法載入圖片進行壓縮'));
      };
      img.src = base64Src;
    });
  },

  /**
   * 顯示圖片大圖預覽彈出視窗。
   *
   * 主要邏輯：
   * 1. 若彈出視窗不存在則動態建立。
   * 2. 設定圖片內容並展示。
   * 3. 支援點選遮罩或關閉按鈕關閉彈出視窗。
   *
   * @param {string} imageSrc - 要顯示的圖片（URL 或 base64）。
   */
  showImageModal: function(imageSrc) {
    let modal = document.getElementById('chatbot-image-display-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'chatbot-image-display-modal';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.backgroundColor = 'rgba(0,0,0,0.75)';
      modal.style.zIndex = '100003';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.cursor = 'pointer';
      // 點選遮罩或關閉按鈕關閉彈出視窗
      modal.onclick = function(e) {
        if (e.target === modal || e.target.id === 'chatbot-image-display-close-btn') {
          modal.style.display = 'none';
        }
      };

      const imageContainer = document.createElement('div');
      imageContainer.style.position = 'relative';
      imageContainer.style.maxWidth = '90vw';
      imageContainer.style.maxHeight = '90vh';

      const imgElement = document.createElement('img');
      imgElement.id = 'chatbot-displayed-image';
      imgElement.style.display = 'block';
      imgElement.style.maxWidth = '100%';
      imgElement.style.maxHeight = '100%';
      imgElement.style.borderRadius = '8px';
      imgElement.style.boxShadow = '0 5px 25px rgba(0,0,0,0.3)';
      imgElement.style.objectFit = 'contain';
      imgElement.style.cursor = 'default';
      // 阻止圖片點選冒泡到遮罩
      imgElement.onclick = function(e) { e.stopPropagation(); };

      const closeButton = document.createElement('button');
      closeButton.id = 'chatbot-image-display-close-btn';
      closeButton.textContent = '×';
      closeButton.style.position = 'absolute';
      closeButton.style.top = '10px';
      closeButton.style.right = '10px';
      closeButton.style.background = 'rgba(0,0,0,0.5)';
      closeButton.style.color = 'white';
      closeButton.style.border = 'none';
      closeButton.style.borderRadius = '50%';
      closeButton.style.width = '30px';
      closeButton.style.height = '30px';
      closeButton.style.fontSize = '20px';
      closeButton.style.lineHeight = '30px';
      closeButton.style.textAlign = 'center';
      closeButton.style.cursor = 'pointer';

      imageContainer.appendChild(closeButton);
      imageContainer.appendChild(imgElement);
      modal.appendChild(imageContainer);
      document.body.appendChild(modal);
    }

    const displayedImage = modal.querySelector('#chatbot-displayed-image');
    if (displayedImage) {
      displayedImage.src = imageSrc;
    }
    modal.style.display = 'flex';
  }
};