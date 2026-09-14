/**
 * @file js/ui/glossary-progress.js
 * @description 術語庫匯入進度條元件
 */

(function() {
  let progressModal = null;

  /**
   * 顯示匯入進度條
   * @param {string} title - 標題
   */
  function showImportProgress(title = '正在匯入術語庫...') {
    // 如果已存在，先移除
    hideImportProgress();

    // 建立進度條 Modal
    progressModal = document.createElement('div');
    progressModal.id = 'glossaryImportProgressModal';
    progressModal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm';
    progressModal.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md mx-4">
        <div class="flex items-center gap-3 mb-4">
          <iconify-icon icon="carbon:import" width="24" class="text-blue-500"></iconify-icon>
          <h3 class="text-lg font-semibold text-gray-800" id="glossaryProgressTitle">${title}</h3>
        </div>

        <!-- 主進度條 -->
        <div class="mb-4">
          <div class="flex justify-between text-sm text-gray-600 mb-2">
            <span id="glossaryProgressText">準備匯入...</span>
            <span id="glossaryProgressPercent">0%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div id="glossaryProgressBar"
                 class="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-300 ease-out"
                 style="width: 0%"></div>
          </div>
        </div>

        <!-- 詳細資訊 -->
        <div class="text-sm text-gray-500 space-y-1">
          <div class="flex justify-between">
            <span>已處理:</span>
            <span id="glossaryProgressCurrent">0</span>
          </div>
          <div class="flex justify-between">
            <span>總計:</span>
            <span id="glossaryProgressTotal">0</span>
          </div>
          <div class="flex justify-between">
            <span>速度:</span>
            <span id="glossaryProgressSpeed">-</span>
          </div>
          <div class="flex justify-between">
            <span>預計剩餘:</span>
            <span id="glossaryProgressETA">-</span>
          </div>
        </div>

        <!-- 提示 -->
        <div class="mt-4 text-xs text-gray-400 text-center">
          <iconify-icon icon="carbon:information" width="14" class="inline-block"></iconify-icon>
          請勿關閉頁面，資料正在儲存中...
        </div>
      </div>
    `;

    document.body.appendChild(progressModal);

    // 重置狀態
    progressState = {
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      lastProcessed: 0
    };
  }

  let progressState = {
    startTime: 0,
    lastUpdateTime: 0,
    lastProcessed: 0
  };

  /**
   * 更新進度條
   * @param {number} current - 當前進度
   * @param {number} total - 總數
   * @param {string} message - 自定義訊息
   */
  function updateImportProgress(current, total, message) {
    if (!progressModal) return;

    const percent = Math.min(100, Math.round((current / total) * 100));
    const now = Date.now();
    const elapsed = now - progressState.startTime;
    const recentElapsed = now - progressState.lastUpdateTime;
    const processed = current - progressState.lastProcessed;

    // 更新進度條
    const progressBar = document.getElementById('glossaryProgressBar');
    const progressPercent = document.getElementById('glossaryProgressPercent');
    const progressText = document.getElementById('glossaryProgressText');
    const progressCurrent = document.getElementById('glossaryProgressCurrent');
    const progressTotal = document.getElementById('glossaryProgressTotal');
    const progressSpeed = document.getElementById('glossaryProgressSpeed');
    const progressETA = document.getElementById('glossaryProgressETA');

    if (progressBar) progressBar.style.width = percent + '%';
    if (progressPercent) progressPercent.textContent = percent + '%';
    if (progressText) progressText.textContent = message || `正在儲存 (${current.toLocaleString()} / ${total.toLocaleString()})`;
    if (progressCurrent) progressCurrent.textContent = current.toLocaleString();
    if (progressTotal) progressTotal.textContent = total.toLocaleString();

    // 計算速度（條/秒）
    if (recentElapsed > 0 && processed > 0) {
      const speed = Math.round(processed / (recentElapsed / 1000));
      if (progressSpeed) progressSpeed.textContent = speed.toLocaleString() + ' 條/秒';

      // 計算預計剩餘時間
      const remaining = total - current;
      const eta = Math.ceil(remaining / speed);
      if (progressETA && eta > 0) {
        if (eta < 60) {
          progressETA.textContent = eta + ' 秒';
        } else {
          const minutes = Math.floor(eta / 60);
          const seconds = eta % 60;
          progressETA.textContent = `${minutes} 分 ${seconds} 秒`;
        }
      }
    }

    // 更新狀態
    progressState.lastUpdateTime = now;
    progressState.lastProcessed = current;
  }

  /**
   * 隱藏進度條
   */
  function hideImportProgress() {
    if (progressModal) {
      progressModal.remove();
      progressModal = null;
    }
  }

  /**
   * 顯示完成訊息
   * @param {string} message - 訊息內容
   * @param {boolean} success - 是否成功
   */
  function showImportComplete(message, success = true) {
    if (!progressModal) return;

    const icon = success ? 'carbon:checkmark-filled' : 'carbon:error-filled';
    const iconColor = success ? 'text-green-500' : 'text-red-500';

    progressModal.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md mx-4 text-center">
        <iconify-icon icon="${icon}" width="48" class="${iconColor} mb-4"></iconify-icon>
        <h3 class="text-lg font-semibold text-gray-800 mb-2">${success ? '匯入完成' : '匯入失敗'}</h3>
        <p class="text-gray-600 mb-4">${message}</p>
        <button onclick="window.glossaryProgress.hide()"
                class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors">
          確定
        </button>
      </div>
    `;

    // 自動關閉
    if (success) {
      setTimeout(() => {
        hideImportProgress();
      }, 2000);
    }
  }

  // 暴露到全域
  window.glossaryProgress = {
    show: showImportProgress,
    update: updateImportProgress,
    hide: hideImportProgress,
    complete: showImportComplete
  };

  console.log('[GlossaryProgress] Progress component loaded');
})();
