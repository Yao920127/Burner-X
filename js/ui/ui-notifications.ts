// js/ui/ui-notifications.js
// 控制通知浮層的顯示與關閉，供全域呼叫。
(function(global) {
    'use strict';

    const notificationContainer = document.getElementById('notification-container');

    function appendToContainer(element) {
        if (!notificationContainer) {
            console.warn('notification-container not found, notification skipped.');
            return null;
        }
        notificationContainer.appendChild(element);
        return element;
    }

    /**
     * 在螢幕右上角顯示一個通知訊息。
     * 通知可以有不同的型別（info, success, warning, error），並會在指定時間後自動消失。
     * 使用者也可以手動點選關閉按鈕來關閉通知。
     *
     * @param {string} message - 要顯示的通知訊息文字。
     * @param {'info' | 'success' | 'warning' | 'error'} [type='info'] - 通知的型別，決定了其圖示和邊框顏色。
     * @param {number} [duration=5000] - 通知顯示的持續時間（毫秒），之後會自動關閉。
     * @returns {HTMLElement | null} 返回建立的通知 DOM 元素，主要用於測試或特殊情況下的直接操作。
     */
    function showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = 'pointer-events-auto w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 mb-2 transition-all duration-300 ease-in-out transform translate-x-full opacity-0';

        let iconName, iconColor, borderColor;
        switch (type) {
            case 'success': iconName = 'carbon:checkmark-filled'; iconColor = 'text-green-500'; borderColor = 'border-green-500'; break;
            case 'error': iconName = 'carbon:error-filled'; iconColor = 'text-red-500'; borderColor = 'border-red-500'; break;
            case 'warning': iconName = 'carbon:warning-filled'; iconColor = 'text-yellow-500'; borderColor = 'border-yellow-500'; break;
            default: iconName = 'carbon:information-filled'; iconColor = 'text-blue-500'; borderColor = 'border-blue-500'; break;
        }

        notification.innerHTML = `
        <div class="p-4 border-l-4 ${borderColor}">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <iconify-icon icon="${iconName}" class="h-6 w-6 ${iconColor}" aria-hidden="true"></iconify-icon>
            </div>
            <div class="ml-3 flex-1 pt-0.5">
              <p class="text-sm font-medium text-gray-900">通知</p>
              <p class="mt-1 text-sm text-gray-500 break-words">${message}</p>
            </div>
            <div class="ml-4 flex flex-shrink-0">
              <button type="button" class="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                <span class="sr-only">關閉</span>
                <iconify-icon icon="carbon:close" class="h-5 w-5" aria-hidden="true"></iconify-icon>
              </button>
            </div>
          </div>
        </div>
    `;

        if (!appendToContainer(notification)) {
            return null;
        }

        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-full', 'opacity-0');
            notification.classList.add('translate-x-0', 'opacity-100');
        });

        const closeButton = notification.querySelector('button');
        const closeFunc = () => closeNotification(notification);
        closeButton.addEventListener('click', closeFunc);

        const timeout = setTimeout(closeFunc, duration);
        notification.dataset.timeout = timeout;

        return notification;
    }

    /**
     * 關閉指定的通知訊息元素。
     * 此函式會清除通知的自動關閉定時器，並應用 CSS 過渡效果使其平滑消失，
     * 然後從 DOM 中移除該通知元素。
     *
     * @param {HTMLElement} notification - 要關閉的通知 DOM 元素 (通常由 `showNotification` 返回或在事件處理中獲取)。
     */
    function closeNotification(notification) {
        if (!notification || !notification.parentNode) return;

        clearTimeout(notification.dataset.timeout);
        notification.classList.remove('translate-x-0', 'opacity-100');
        notification.classList.add('translate-x-full', 'opacity-0');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    global.showNotification = showNotification;
    global.closeNotification = closeNotification;
})(window);
