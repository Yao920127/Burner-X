// Phase 3 最佳化: Marked.js 輕量化配置
if (typeof marked !== 'undefined' && typeof marked.setOptions === 'function') {
  marked.setOptions({
    gfm: true,              // 啟用 GitHub Flavored Markdown
    breaks: true,           // 支援換行字元
    pedantic: false,
    sanitize: false,
    smartLists: false,      // 禁用智慧列表（效能最佳化）
    smartypants: false,     // 禁用智慧標點（效能最佳化）
    mangle: false,          // 禁用郵箱混淆（效能最佳化）
    headerIds: false        // 禁用標題ID生成（效能最佳化）
  });
}

window.renderWithKatexStreaming = function(md) {
  const codeBlocks = [];
  let codeBlockCounter = 0;

  const FORMULA_BLOCK_HINTS = [
    /\r|\n/,
    /\\\\/,
    /\\tag\b/,
    /\\label\b/,
    /\\eqref\b/,
    /\\display(?:style|limits)\b/,
    /\\begin\{(?:align\*?|aligned|flalign\*?|gather\*?|multline\*?|split|cases|array|pmatrix|bmatrix|vmatrix|Vmatrix|matrix|smallmatrix)\}/,
    /\\end\{(?:align\*?|aligned|flalign\*?|gather\*?|multline\*?|split|cases|array|pmatrix|bmatrix|vmatrix|Vmatrix|matrix|smallmatrix)\}/
  ];

  function escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, ch => map[ch]);
  }

  function analyzeFormula(tex, displayHint) {
    const normalized = typeof tex === 'string' ? tex.trim() : '';
    if (!normalized) {
      return { text: '', displayMode: !!displayHint };
    }

    let displayMode = !!displayHint;
    if (!displayMode) {
      displayMode = FORMULA_BLOCK_HINTS.some(pattern => pattern.test(normalized));
    }

    return { text: normalized, displayMode };
  }

  function buildFallback(tex, displayMode, error) {
    const sanitized = escapeHtml(tex || '');
    const message = error && error.message ? error.message : (typeof error === 'string' ? error : '');
    const dataAttr = message ? ` data-katex-error="${escapeHtml(message)}" title="Formula rendering failed: ${escapeHtml(message)}"` : '';

    if (displayMode) {
      return `
<div class="katex-fallback katex-block"${dataAttr}><pre class="katex-fallback-source">${sanitized}</pre></div>
`;
    }

    return `<span class="katex-fallback katex-inline"${dataAttr}><span class="katex-fallback-source">${sanitized}</span></span>`;
  }
  md = md.replace(/```([\s\S]+?)```/g, function(match) {
    const placeholder = `__CODE_BLOCK_${codeBlockCounter}__`;
    codeBlocks[codeBlockCounter] = match;
    codeBlockCounter++;
    return placeholder;
  });
  md = md.replace(/`([^`]+?)`/g, function(match) {
    const placeholder = `__CODE_BLOCK_${codeBlockCounter}__`;
    codeBlocks[codeBlockCounter] = match;
    codeBlockCounter++;
    return placeholder;
  });
  md = md.replace(/\$\$([\s\S]+?)\$\$/g, function(_, tex) {
    const analysis = analyzeFormula(tex, true);
    try {
      return `
<div class="katex-block" data-formula-display="block" data-original-text="${escapeHtml(analysis.text)}">${katex.renderToString(analysis.text, {
  displayMode: true,
  output: 'html',
  strict: 'ignore',
  throwOnError: false,
  trust: false,          // Phase 3: 禁用不安全命令
  macros: {},            // Phase 3: 使用空物件避免預設巨集初始化
  maxSize: 50,           // Phase 3: 限制公式大小
  maxExpand: 100         // Phase 3: 限制巨集展開
})}</div>
`;
    } catch (e) {
      return buildFallback(analysis.text, true, e);
    }
  });
  md = md.replace(/\\\[([\s\S]+?)\\\]/g, function(_, tex) {
    const analysis = analyzeFormula(tex, true);
    try {
      return `
<div class="katex-block" data-formula-display="block" data-original-text="${escapeHtml(analysis.text)}">${katex.renderToString(analysis.text, {
  displayMode: true,
  output: 'html',
  strict: 'ignore',
  throwOnError: false,
  trust: false,          // Phase 3: 禁用不安全命令
  macros: {},            // Phase 3: 使用空物件避免預設巨集初始化
  maxSize: 50,           // Phase 3: 限制公式大小
  maxExpand: 100         // Phase 3: 限制巨集展開
})}</div>
`;
    } catch (e) {
      return buildFallback(analysis.text, true, e);
    }
  });
  md = md.replace(/\$([^\$]+?)\$/g, function(_, tex) {
    const analysis = analyzeFormula(tex, false);
    try {
      if (analysis.displayMode) {
        return `
<div class="katex-block" data-formula-display="block" data-original-text="${escapeHtml(analysis.text)}">${katex.renderToString(analysis.text, {
  displayMode: true,
  output: 'html',
  strict: 'ignore',
  throwOnError: false,
  trust: false,          // Phase 3: 禁用不安全命令
  macros: {},            // Phase 3: 使用空物件避免預設巨集初始化
  maxSize: 50,           // Phase 3: 限制公式大小
  maxExpand: 100         // Phase 3: 限制巨集展開
})}</div>
`;
      }
      return `<span class="katex-inline" data-formula-display="inline" data-original-text="${escapeHtml(analysis.text)}">${katex.renderToString(analysis.text, {
  displayMode: false,
  output: 'html',
  strict: 'ignore',
  throwOnError: false,
  trust: false,          // Phase 3: 禁用不安全命令
  macros: {},            // Phase 3: 使用空物件避免預設巨集初始化
  maxSize: 50,           // Phase 3: 限制公式大小
  maxExpand: 100         // Phase 3: 限制巨集展開
})}</span>`;
    } catch (e) {
      return buildFallback(analysis.text, analysis.displayMode, e);
    }
  });
  md = md.replace(/\\\(([^)]+?)\\\)/g, function(_, tex) {
    const analysis = analyzeFormula(tex, false);
    try {
      if (analysis.displayMode) {
        return `
<div class="katex-block" data-formula-display="block" data-original-text="${escapeHtml(analysis.text)}">${katex.renderToString(analysis.text, {
  displayMode: true,
  output: 'html',
  strict: 'ignore',
  throwOnError: false,
  trust: false,          // Phase 3: 禁用不安全命令
  macros: {},            // Phase 3: 使用空物件避免預設巨集初始化
  maxSize: 50,           // Phase 3: 限制公式大小
  maxExpand: 100         // Phase 3: 限制巨集展開
})}</div>
`;
      }
      return `<span class="katex-inline" data-formula-display="inline" data-original-text="${escapeHtml(analysis.text)}">${katex.renderToString(analysis.text, {
  displayMode: false,
  output: 'html',
  strict: 'ignore',
  throwOnError: false,
  trust: false,          // Phase 3: 禁用不安全命令
  macros: {},            // Phase 3: 使用空物件避免預設巨集初始化
  maxSize: 50,           // Phase 3: 限制公式大小
  maxExpand: 100         // Phase 3: 限制巨集展開
})}</span>`;
    } catch (e) {
      return buildFallback(analysis.text, analysis.displayMode, e);
    }
  });
  for (let i = 0; i < codeBlockCounter; i++) {
    md = md.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

  // XSS 防護：使用 safeRenderMarkdown 替代直接 marked.parse()
  if (typeof window.safeRenderMarkdown === 'function') {
    return window.safeRenderMarkdown(md);
  }

  // 降級方案：如果 safeRenderMarkdown 不可用，仍使用 marked.parse
  // 但會在主控台警告
  console.warn('[Security] safeRenderMarkdown not available, using unsafe marked.parse()');
  return marked.parse(md);
};

/**
 * Phase 4.2 - 長公式增量渲染原型（ChatbotMathStreaming）
 * 目標：在流式生成長公式（特別是 $$...$$ / \[...\] 塊級公式）時，避免反覆對整條訊息做 KaTeX 渲染。
 *
 * 設計要點：
 * - 僅處理塊級公式標記：'$$ ... $$' 與 '\[ ... \]'；
 * - 利用 state 在多次呼叫之間記錄「是否在公式內部」以及已累積的公式文字；
 * - 每次只對“新補全的一整塊公式”呼叫 katex.renderToString，一塊公式只渲染一次；
 * - 普通文字片段使用 safeRenderMarkdown（若存在）單獨轉為 HTML；
 * - 如果出現異常或環境不滿足（如 window.katex 不存在），呼叫方應回退到完整重渲染。
 */
window.ChatbotMathStreaming = (function() {
  function escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, function(ch) {
      return map[ch];
    });
  }

  function renderPlainMarkdown(text) {
    if (!text) return '';
    if (typeof window.safeRenderMarkdown === 'function') {
      return window.safeRenderMarkdown(text);
    }
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      return marked.parse(text);
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function renderBlockFormula(tex) {
    const normalized = typeof tex === 'string' ? tex.trim() : '';
    if (!normalized) return '';

    if (typeof katex === 'undefined' || typeof katex.renderToString !== 'function') {
      // 環境不足，交給上層回退處理
      return escapeHtml(normalized);
    }

    try {
      const html = katex.renderToString(normalized, {
        displayMode: true,
        output: 'html',
        strict: 'ignore',
        throwOnError: false,
        trust: false,
        macros: {},
        maxSize: 50,
        maxExpand: 100
      });
      return `
<div class="katex-block" data-formula-display="block" data-original-text="${escapeHtml(normalized)}">${html}</div>
`;
    } catch (e) {
      const message = e && e.message ? e.message : '';
      const dataAttr = message
        ? ` data-katex-error="${escapeHtml(message)}" title="Formula rendering failed: ${escapeHtml(message)}"`
        : '';
      return `
<div class="katex-fallback katex-block"${dataAttr}><pre class="katex-fallback-source">${escapeHtml(normalized)}</pre></div>
`;
    }
  }

  /**
   * 增量渲染入口
   * @param {object|null} prevState  上一次呼叫時的狀態（可為 null）
   * @param {string} appendedText    本次新增的原始 Markdown 文字
   * @returns {{ html: string, state: object }} 渲染出的追加 HTML 片段與新的狀態
   */
  function renderIncremental(prevState, appendedText) {
    if (!appendedText) {
      return { html: '', state: prevState || null };
    }

    const state = prevState && typeof prevState === 'object'
      ? {
          pendingFormula: prevState.pendingFormula || null
        }
      : {
          pendingFormula: null
        };

    const text = String(appendedText);
    const len = text.length;
    let i = 0;
    let htmlParts = [];
    let plainBuffer = '';

    function flushPlain() {
      if (!plainBuffer) return;
      htmlParts.push(renderPlainMarkdown(plainBuffer));
      plainBuffer = '';
    }

    while (i < len) {
      // 不在公式內部：識別公式起始標記
      if (!state.pendingFormula) {
        if (text.startsWith('$$', i)) {
          flushPlain();
          state.pendingFormula = {
            delimiter: '$$',
            text: ''
          };
          i += 2;
          continue;
        }
        if (text.startsWith('\\[', i)) {
          flushPlain();
          state.pendingFormula = {
            delimiter: '\\[',
            text: ''
          };
          i += 2;
          continue;
        }

        plainBuffer += text[i];
        i += 1;
        continue;
      }

      // 在公式內部：識別結束標記
      const delimiter = state.pendingFormula.delimiter;
      if (delimiter === '$$' && text.startsWith('$$', i)) {
        const formulaText = state.pendingFormula.text;
        htmlParts.push(renderBlockFormula(formulaText));
        state.pendingFormula = null;
        i += 2;
        continue;
      }
      if (delimiter === '\\[' && text.startsWith('\\]', i)) {
        const formulaText = state.pendingFormula.text;
        htmlParts.push(renderBlockFormula(formulaText));
        state.pendingFormula = null;
        i += 2;
        continue;
      }

      // 繼續累積公式內容
      state.pendingFormula.text += text[i];
      i += 1;
    }

    // 本輪結束時，仍可安全輸出的普通文字
    flushPlain();

    return {
      html: htmlParts.join(''),
      state: state
    };
  }

  return {
    renderIncremental: renderIncremental
  };
})();
