// Dock Settings Modal Logic
const dockSettingsModal = document.getElementById('dock-settings-modal');
const openDockSettingsBtn = document.getElementById('settings-link'); // This is the cog icon in the dock
const closeDockSettingsBtn = document.getElementById('dock-settings-close-btn');
const saveDockSettingsBtn = document.getElementById('dock-settings-save-btn');
const cancelDockSettingsBtn = document.getElementById('dock-settings-cancel-btn');
const dockSettingsCheckboxes = dockSettingsModal.querySelectorAll('.checkbox-group input[type="checkbox"]');

console.log('Dock Settings Modal Logic: Script block reached.'); // Log: Script block reached
if (dockSettingsModal) {
    console.log('Dock Settings Modal Logic: dockSettingsModal element found.', dockSettingsModal);
} else {
    console.error('Dock Settings Modal Logic: dockSettingsModal element NOT found!');
}

if (openDockSettingsBtn) {
    console.log('Dock Settings Modal Logic: openDockSettingsBtn element (settings-link) found.', openDockSettingsBtn);
    openDockSettingsBtn.addEventListener('click', function(event) {
        console.log('Dock Settings Modal Logic: settings-link clicked.'); // Log: Click event triggered
        event.preventDefault();
        event.stopPropagation();
        openDockSettingsModal();
    });
    console.log('Dock Settings Modal Logic: Click event listener attached to settings-link.'); // Log: Listener attached
} else {
    console.error('Dock Settings Modal Logic: openDockSettingsBtn (settings-link) element NOT found! Cannot attach click listener.');
}

function openDockSettingsModal() {
  console.log('Dock Settings Modal Logic: openDockSettingsModal() called.'); // 新增日誌
  try {
    if (!window.DockLogic || typeof window.DockLogic.getCurrentDisplayConfig !== 'function') {
      alert('DockLogic 功能尚未準備好。');
      console.error('DockLogic or getCurrentDisplayConfig is not available. Modal will not open.'); // 更詳細的錯誤
      return;
    }
    console.log('Dock Settings Modal Logic: DockLogic and getCurrentDisplayConfig are available.'); // 新增日誌

    const currentConfig = window.DockLogic.getCurrentDisplayConfig();
    if (!currentConfig) { // Further check if getCurrentDisplayConfig returned something valid
        alert('無法獲取當前的 Dock 顯示配置。');
        console.error('Failed to get current display config from DockLogic. Modal will not open.'); // 更詳細的錯誤
        return;
    }
    console.log('Dock Settings Modal Logic: currentConfig obtained:', currentConfig); // 新增日誌

    dockSettingsCheckboxes.forEach(checkbox => {
      const key = checkbox.dataset.configKey;
      if (currentConfig.hasOwnProperty(key)) {
        checkbox.checked = currentConfig[key];
      }
    });
    console.log('Dock Settings Modal Logic: Checkboxes updated.'); // 新增日誌

    // 同步 TOC 模式設定
    updateTocModeRadioButtons();

    dockSettingsModal.classList.add('visible');
    console.log('Dock Settings Modal Logic: "visible" class ADDED to dockSettingsModal. Modal should be visible now if CSS is correct.'); // 新增日誌
  } catch (error) {
    console.error('Error opening dock settings modal:', error);
    alert('開啟設定時發生錯誤，請檢視主控台瞭解詳情。');
    // Even if an error occurs, ensure the default link action is prevented if possible,
    // though the event object might not be in scope here directly unless passed.
    // The preventDefault in the calling handler should ideally cover this.
  }
}

function closeDockSettingsModal() {
  console.log('Dock Settings Modal Logic: closeDockSettingsModal() called.'); // 新增日誌
  // dockSettingsModal.style.display = 'none'; // OLD way
  dockSettingsModal.classList.remove('visible'); // NEW way: use CSS class for visibility
  console.log('Dock Settings Modal Logic: "visible" class REMOVED from dockSettingsModal.'); // 新增日誌
}

function saveDockSettings() {
  if (!window.DockLogic || typeof window.DockLogic.updateDisplayConfig !== 'function') {
    alert('DockLogic 功能尚未準備好。');
    return;
  }
  const newConfig = {};
  dockSettingsCheckboxes.forEach(checkbox => {
    newConfig[checkbox.dataset.configKey] = checkbox.checked;
  });
  window.DockLogic.updateDisplayConfig(newConfig);

  // 儲存 TOC 模式設定
  const selectedTocMode = document.querySelector('input[name="toc-mode"]:checked');
  if (selectedTocMode) {
    const tocMode = selectedTocMode.value;
    // 如果 window.TocFeature 存在則直接呼叫其方法，否則透過模擬點選實現
    const tocPopup = document.getElementById('toc-popup'); // 修復：在函式內獲取 tocPopup 元素
    if (tocPopup) {
      const tocModeBtn = tocPopup.querySelector(`.toc-mode-btn[data-mode="${tocMode}"]`);
      if (tocModeBtn) {
        tocModeBtn.click(); // 模擬點選對應的模式按鈕
      }
    }
    // 儲存到 localStorage 以便頁面重新整理後恢復
    // 安全地訪問 docIdForLocalStorage
    const docId = window.docIdForLocalStorage || '';
    if (docId) {
      localStorage.setItem(`tocMode_${docId}`, tocMode);
    }
  }

  closeDockSettingsModal();
}

if (closeDockSettingsBtn) closeDockSettingsBtn.onclick = closeDockSettingsModal;
if (saveDockSettingsBtn) saveDockSettingsBtn.onclick = saveDockSettings;
if (cancelDockSettingsBtn) cancelDockSettingsBtn.onclick = closeDockSettingsModal;

// Close modal if user clicks outside the modal content
if (dockSettingsModal) {
    dockSettingsModal.addEventListener('click', function(event) {
        if (event.target === dockSettingsModal) {
            closeDockSettingsModal();
        }
    });
}


// 處理 TOC 模式設定與 TOC 彈出視窗中的按鈕同步
function syncTocModeSettings() {
  // 從 localStorage 載入儲存的 TOC 模式
  // 安全地訪問 docIdForLocalStorage
  const docId = window.docIdForLocalStorage || '';
  if (docId) {
    const savedTocMode = localStorage.getItem(`tocMode_${docId}`);
    if (savedTocMode && ['both', 'ocr', 'translation'].includes(savedTocMode)) {
      // 更新單選按鈕狀態
      const radioBtn = document.getElementById(`toc-mode-${savedTocMode}`);
      if (radioBtn) {
        radioBtn.checked = true;
      }

      // 如果 TOC 彈出視窗已載入，同步其按鈕狀態
      const tocPopup = document.getElementById('toc-popup');
      if (tocPopup) {
        const tocModeBtn = tocPopup.querySelector(`.toc-mode-btn[data-mode="${savedTocMode}"]`);
        if (tocModeBtn) {
          // 模擬點選以更新狀態
          tocModeBtn.click();
        }
      }
    }
  }
}

// 在頁面載入完成後同步 TOC 模式設定
document.addEventListener('DOMContentLoaded', syncTocModeSettings);

// 在開啟設定對話方塊前同步當前 TOC 模式到單選按鈕
function updateTocModeRadioButtons() {
  const tocPopup = document.getElementById('toc-popup');
  if (tocPopup) {
    const activeTocModeBtn = tocPopup.querySelector('.toc-mode-btn.active');
    if (activeTocModeBtn) {
      const mode = activeTocModeBtn.dataset.mode;
      const radioBtn = document.getElementById(`toc-mode-${mode}`);
      if (radioBtn) {
        radioBtn.checked = true;
      }
    }
  }
}