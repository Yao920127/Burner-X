/**
 * @file js/chatbot/utils/safe-markdown-render.js
 * @description 安全的 Markdown 渲染工具 - 防止 XSS 攻擊
 *
 * 設計理念：
 * 1. 移除真正危險的東西（<script>、事件屬性、javascript: URL）
 * 2. 保留教學用的 HTML 程式碼（在程式碼塊中自動轉義）
 * 3. 保留正常的格式化標籤和 HTML 示例標籤
 * 4. 平衡安全與功能，不影響 AI 教學示例
 */

/**
 * 安全地渲染 Markdown 內容
 *
 * @param {string} markdown - Markdown 文字
 * @returns {string} 清理後的 HTML
 *
 * @example
 * // 正常 Markdown
 * safeRenderMarkdown("**粗體**")
 * // => "<strong>粗體</strong>"
 *
 * @example
 * // 程式碼塊中的 HTML（安全顯示）
 * safeRenderMarkdown("```html\n<script>alert()</script>\n```")
 * // => "<pre><code>&lt;script&gt;alert()&lt;/script&gt;</code></pre>"
 *
 * @example
 * // 惡意程式碼（被移除）
 * safeRenderMarkdown('<img src=x onerror="alert(\'XSS\')">')
 * // => "<img src='x'>"  // onerror 被移除
 */
function safeRenderMarkdown(markdown) {
  // 檢查依賴
  if (typeof marked === 'undefined') {
    console.error('safeRenderMarkdown: marked is not loaded');
    return escapeHtml(markdown).replace(/\n/g, '<br>');
  }

  if (typeof DOMPurify === 'undefined') {
    console.warn('safeRenderMarkdown: DOMPurify is not loaded, falling back to unsafe rendering');
    return marked.parse(markdown);
  }

  // 1. 使用 marked 解析 Markdown
  //    程式碼塊會被自動轉義為 &lt; &gt;，不會執行
  const rawHtml = marked.parse(markdown);

  // 2. 使用 DOMPurify 清理 - 寬鬆配置
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    // 允許的標籤（寬鬆配置，支援教學示例）
    ALLOWED_TAGS: [
      // === Markdown 標準標籤 ===
      'p', 'br', 'hr',
      'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
      'code', 'pre', 'kbd', 'samp', 'var',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',

      // === 擴充標籤（用於 KaTeX 和複雜版面） ===
      'span', 'div', 'section', 'article',
      'sup', 'sub', 'small', 'mark',

      // === 教學示例可能用到的標籤 ===
      // AI 可能在教學中返回這些 HTML 標籤作為示例
      // DOMPurify 會移除事件屬性，所以這些標籤是安全的
      'button', 'input', 'form', 'label', 'select', 'textarea', 'fieldset', 'legend',
      'iframe', 'video', 'audio', 'source', 'track',
      'details', 'summary',

      // 注意：<script> 標籤即使新增到這裡也會被 DOMPurify 移除
      // 這是 DOMPurify 的內建安全機制
    ],

    // 允許的屬性
    ALLOWED_ATTR: [
      // 連結和媒體
      'href', 'src', 'alt', 'title',

      // 樣式和版面（KaTeX 需要 style）
      'class', 'id', 'style',
      'width', 'height',

      // 連結屬性
      'target', 'rel',

      // 表格屬性
      'colspan', 'rowspan', 'align', 'valign',

      // 媒體屬性
      'controls', 'autoplay', 'loop', 'muted',

      // 表單屬性（移除了事件屬性）
      'type', 'name', 'value', 'placeholder', 'disabled', 'readonly',
      'checked', 'selected',

      // iframe 屬性
      'frameborder', 'allowfullscreen',

      // 注意：所有 on* 事件屬性會被自動移除
      // 例如：onclick, onerror, onload 等
    ],

    // 允許的 URL 協議（阻止 javascript: 等危險協議）
    ALLOWED_URI_REGEXP: /^(?:(?:https?|http|ftp|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,

    // 其他安全選項
    ALLOW_DATA_ATTR: false,        // 禁止 data-* 屬性（防止儲存惡意資料）
    SAFE_FOR_TEMPLATES: true,      // 移除模板語法 {{}} 等
    KEEP_CONTENT: true,            // 移除標籤但保留內容

    // 返回完整的 HTML（不僅僅是 body）
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });

  return cleanHtml;
}

/**
 * HTML 轉義（備用方案，當 DOMPurify 不可用時）
 * @private
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 檢查 DOMPurify 是否可用
 * @returns {boolean}
 */
function isDOMPurifyAvailable() {
  return typeof DOMPurify !== 'undefined';
}

/**
 * 獲取當前安全配置的統計資訊（用於除錯）
 * @returns {object}
 */
function getSecurityInfo() {
  return {
    hasDOMPurify: isDOMPurifyAvailable(),
    hasMarked: typeof marked !== 'undefined',
    config: {
      allowedTagsCount: 50,  // 近似值
      allowedAttributesCount: 25,
      blocksScriptTag: true,
      blocksEventAttributes: true,
      blocksJavascriptUrls: true,
    }
  };
}

// 全域暴露（支援 file:// 協議）
if (typeof window !== 'undefined') {
  window.safeRenderMarkdown = safeRenderMarkdown;
  window.isDOMPurifyAvailable = isDOMPurifyAvailable;
  window.getSecurityInfo = getSecurityInfo;
}
