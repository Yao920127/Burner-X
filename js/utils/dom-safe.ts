/**
 * @file js/utils/dom-safe.js
 * @description 安全的 DOM 操作工具 - 防止 XSS 攻擊
 *
 * 核心原則：
 * 1. 優先使用 textContent 而不是 innerHTML
 * 2. 必須使用 innerHTML 時，先轉義或使用白名單
 * 3. 禁止設定事件屬性（onclick, onload 等）
 */

(function(window) {
  'use strict';

  /**
   * 安全的 DOM 操作工具集
   */
  const DomSafe = {
  /**
   * 安全地設定文字內容（推薦）
   * @param {HTMLElement} element - 目標元素
   * @param {string} text - 要設定的文字
   */
  setText(element, text) {
    if (!element) {
      console.error('DomSafe.setText: element is null');
      return;
    }
    element.textContent = text;
  },

  /**
   * 安全地建立元素
   * @param {string} tag - 元素標籤名
   * @param {string} text - 文字內容（可選）
   * @param {Object} attributes - 屬性物件（可選）
   * @returns {HTMLElement}
   */
  createElement(tag, text = '', attributes = {}) {
    const el = document.createElement(tag);

    if (text) {
      el.textContent = text;
    }

    // 安全地設定屬性
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(el, key, value);
    }

    return el;
  },

  /**
   * 轉義 HTML 特殊字元
   * @param {string} str - 要轉義的字串
   * @returns {string}
   */
  escapeHtml(str) {
    if (typeof str !== 'string') return str;

    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * 安全地設定屬性
   * @param {HTMLElement} element - 目標元素
   * @param {string} attr - 屬性名
   * @param {string} value - 屬性值
   */
  setAttribute(element, attr, value) {
    // 禁止設定事件屬性
    if (attr.toLowerCase().startsWith('on')) {
      console.error(`DomSafe: 不允許設定事件屬性: ${attr}`);
      return;
    }

    // 檢查危險的 URL 協議
    if (attr === 'href' || attr === 'src') {
      const urlStr = String(value).trim().toLowerCase();
      if (urlStr.startsWith('javascript:') || urlStr.startsWith('data:text/html')) {
        console.error(`DomSafe: 不允許的 URL 協議: ${urlStr}`);
        return;
      }
    }

    element.setAttribute(attr, value);
  },

  /**
   * 安全地清空元素內容
   * @param {HTMLElement} element - 目標元素
   */
  empty(element) {
    if (!element) return;
    element.innerHTML = '';
  },

  /**
   * 安全地新增 HTML（使用白名單）
   * 僅用於必須使用 HTML 的場景（如渲染 Markdown）
   * @param {HTMLElement} element - 目標元素
   * @param {string} html - HTML 字串
   * @param {Array<string>} allowedTags - 允許的標籤白名單（可選）
   */
  setHTML(element, html, allowedTags = null) {
    if (!element) {
      console.error('DomSafe.setHTML: element is null');
      return;
    }

    if (!html) {
      element.innerHTML = '';
      return;
    }

    // 如果沒有白名單，使用純文字
    if (!allowedTags || allowedTags.length === 0) {
      element.textContent = html;
      return;
    }

    // 簡單的白名單過濾（僅用於基本場景）
    // 注意：這不是完整的 HTML sanitizer，複雜場景請使用 DOMPurify
    const allowedPattern = allowedTags.join('|');
    const regex = new RegExp(`<(?!\/?(${allowedPattern})\\b)[^>]*>`, 'gi');
    const sanitized = html.replace(regex, '');

    element.innerHTML = sanitized;
  },

  /**
   * 批次替換元素的 innerHTML 為安全方式
   * 用於遷移舊程式碼
   * @param {HTMLElement} element - 父元素
   * @param {string} selector - 選擇器
   * @param {Function} contentFn - 返回內容的函式 (element) => content
   */
  batchSetText(element, selector, contentFn) {
    const elements = element.querySelectorAll(selector);
    elements.forEach(el => {
      const content = contentFn(el);
      this.setText(el, content);
    });
  }
  };

  /**
   * 檢查字串是否包含潛在的 XSS 攻擊
   * @param {string} str - 要檢查的字串
   * @returns {boolean}
   */
  function hasPotentialXSS(str) {
    if (typeof str !== 'string') return false;

    const patterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // onclick, onload, etc.
      /<iframe/gi,
      /<object/gi,
      /<embed/gi
    ];

    return patterns.some(pattern => pattern.test(str));
  }

  /**
   * 記錄不安全的 innerHTML 使用（開發模式）
   * 用於遷移期間的監控
   */
  function warnUnsafeInnerHTML(location, content) {
    if (hasPotentialXSS(content)) {
      console.warn(`⚠️  檢測到潛在的 XSS 風險: ${location}`, content.substring(0, 100));
    }
  }

  // 匯出到全域
  window.DomSafe = DomSafe;
  window.DomSafe.hasPotentialXSS = hasPotentialXSS;
  window.DomSafe.warnUnsafeInnerHTML = warnUnsafeInnerHTML;

  console.log('[DomSafe] 安全 DOM 工具已載入');

})(window);
