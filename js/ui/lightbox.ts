/**
 * @file js/ui/lightbox.js
 * @description 圖片燈箱功能，用於全屏檢視文件中的圖片。
 */

(function() {
  let lightboxOverlay = null;
  let lightboxImage = null;
  let lightboxCaption = null;
  let lightboxSpinner = null;

  /**
   * 建立燈箱的 DOM 結構
   */
  function createLightboxDom() {
    if (document.querySelector('.lightbox-overlay')) return;

    lightboxOverlay = document.createElement('div');
    lightboxOverlay.className = 'lightbox-overlay';

    lightboxOverlay.innerHTML = `
      <div class="lightbox-spinner"></div>
      <div class="lightbox-content">
        <button class="lightbox-close-btn" aria-label="關閉">
          <i class="fas fa-times"></i>
        </button>
        <img class="lightbox-image" src="" alt="Lightbox image">
        <div class="lightbox-caption"></div>
      </div>
    `;

    document.body.appendChild(lightboxOverlay);

    lightboxImage = lightboxOverlay.querySelector('.lightbox-image');
    lightboxCaption = lightboxOverlay.querySelector('.lightbox-caption');
    lightboxSpinner = lightboxOverlay.querySelector('.lightbox-spinner');
    const closeBtn = lightboxOverlay.querySelector('.lightbox-close-btn');

    // 綁定關閉事件
    closeBtn.addEventListener('click', closeLightbox);
    lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === lightboxOverlay) {
        closeLightbox();
      }
    });

    // 圖片載入完成或失敗時隱藏載入動畫
    lightboxImage.addEventListener('load', () => {
      lightboxSpinner.style.display = 'none';
      lightboxImage.style.opacity = '1';
    });

    lightboxImage.addEventListener('error', () => {
      lightboxSpinner.style.display = 'none';
      // 可以顯示一個錯誤佔點陣圖
    });
  }

  /**
   * 開啟燈箱
   * @param {string} src 圖片地址
   * @param {string} alt 圖片描述
   */
  function openLightbox(src, alt) {
    if (!lightboxOverlay) createLightboxDom();

    // 顯示載入動畫，暫時隱藏舊圖片
    lightboxSpinner.style.display = 'block';
    lightboxImage.style.opacity = '0.5';

    lightboxImage.src = src;
    lightboxImage.alt = alt || '';
    lightboxCaption.textContent = alt || '';

    lightboxOverlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // 防止背景滾動
  }

  /**
   * 關閉燈箱
   */
  function closeLightbox() {
    if (lightboxOverlay) {
      lightboxOverlay.classList.remove('active');
      document.body.style.overflow = ''; // 恢復背景滾動
      
      // 清理 src 以避免下次開啟時顯示舊圖
      setTimeout(() => {
        if (!lightboxOverlay.classList.contains('active')) {
            lightboxImage.src = '';
        }
      }, 300);
    }
  }

  /**
   * 初始化全域事件監聽
   * 使用事件委託來處理動態載入的內容
   */
  function initLightbox() {
    createLightboxDom();

    // 監聽 ESC 鍵關閉
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightboxOverlay && lightboxOverlay.classList.contains('active')) {
        closeLightbox();
      }
    });

    // 使用事件委託監聽所有內容區域的圖片點選
    document.body.addEventListener('click', (e) => {
      // 查詢最近的 img 標籤
      const img = e.target.closest('img');
      if (!img) return;

      // 排除一些不需要燈箱的圖片（如圖示、頭像等）
      if (img.classList.contains('icon') || 
          img.closest('.dock-stat-item-wrapper-img') || // 排除 Dock 欄圖示
          img.closest('button') || // 排除按鈕內的圖片
          img.closest('.lightbox-content')) { // 排除燈箱自己的圖片
        return;
      }

      // 確保圖片在主要內容區域內
      if (img.closest('.tab-content') || img.closest('.markdown-body') || img.closest('#immersive-main-content-area')) {
         e.preventDefault();
         openLightbox(img.src, img.alt || img.title);
      }
    });
  }

  // 頁面載入完成後初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox);
  } else {
    initLightbox();
  }

})();