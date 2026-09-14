/**
 * KaTeX Web Worker
 * 在後臺執行緒渲染數學公式，避免阻塞主執行緒
 *
 * 使用方式：
 * const worker = new Worker('js/workers/katex-worker.js');
 * worker.postMessage({ id: 1, formula: 'E = mc^2', options: { displayMode: true } });
 * worker.onmessage = (e) => { console.log(e.data.html); };
 */

'use strict';

// 匯入 KaTeX 庫（透過 importScripts）
try {
  // 嘗試載入 KaTeX 庫
  importScripts(
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'
  );
  console.log('[KaTeX Worker] KaTeX library loaded successfully');
} catch (error) {
  console.error('[KaTeX Worker] Failed to load KaTeX library:', error);
  // 通知主執行緒載入失敗
  self.postMessage({
    type: 'error',
    error: 'Failed to load KaTeX library in Worker'
  });
}

/**
 * 修復公式中的常見 LaTeX 錯誤（複製自 formula_post_processor.js）
 */
function fixFormulaErrors(formula, isDisplay) {
  let fixed = formula;

  // 修復 1: 移除行內公式中的 \tag{...}
  if (!isDisplay && /\\tag\{[^}]*\}/.test(fixed)) {
    fixed = fixed.replace(/\\tag\{[^}]*\}/g, '');
  }

  // 修復 2: 修復 \;^\circ 語法錯誤
  if (/\\;\s*\^\\circ/.test(fixed)) {
    fixed = fixed.replace(/\\;\s*\^\\circ/g, '\\,^{\\circ}');
  }

  // 修復 2b: 修復其他 \;^ 的情況
  if (/\\;\s*\^([^{])/.test(fixed)) {
    fixed = fixed.replace(/\\;\s*\^([^{])/g, (match, char) => `\\,^{${char}}`);
  }

  // 修復 3: 修復雙花括號 {{...}} → {...}
  if (/\{\{/.test(fixed)) {
    while (/\{\{/.test(fixed)) {
      fixed = fixed.replace(/\{\{([^}]*)\}\}/g, '{$1}');
    }
  }

  // 修復 4: 修復 \mathrm{\;^\circ C} 的情況
  if (/\\mathrm\{[^}]*\\;[^}]*\^\s*\\circ[^}]*\}/.test(fixed)) {
    fixed = fixed.replace(/\\mathrm\{\s*\\;\s*\^\s*\\circ\s+([^}]+)\}/g, '\\,^{\\circ}\\mathrm{$1}');
  }

  // 修復 5: 確保上標總是用花括號包圍
  fixed = fixed.replace(/\^([a-zA-Z]{2,})/g, '^{$1}');

  return fixed.trim();
}

/**
 * 渲染單個公式
 */
function renderFormula(id, formula, options) {
  try {
    // 檢查 KaTeX 是否可用
    if (typeof katex === 'undefined') {
      throw new Error('KaTeX is not available in Worker');
    }

    // 修復常見錯誤
    const fixed = fixFormulaErrors(formula, options.displayMode || false);

    // 渲染公式
    const html = katex.renderToString(fixed, {
      displayMode: options.displayMode || false,
      throwOnError: false,  // 不丟擲錯誤，返回原始文字
      strict: 'ignore',
      output: 'html',
      ...options
    });

    return {
      type: 'success',
      id: id,
      html: html,
      originalFormula: formula
    };

  } catch (error) {
    // 渲染失敗，返回錯誤資訊
    return {
      type: 'error',
      id: id,
      error: error.message,
      originalFormula: formula,
      // 返回一個錯誤回退 HTML
      html: `<span class="katex-fallback" title="${error.message}">${formula}</span>`
    };
  }
}

/**
 * 批次渲染公式
 */
function renderBatch(batchId, formulas) {
  const results = [];

  for (const item of formulas) {
    const result = renderFormula(item.id, item.formula, item.options || {});
    results.push(result);
  }

  return {
    type: 'batch_complete',
    batchId: batchId,
    results: results
  };
}

/**
 * 訊息處理器
 */
self.onmessage = function(e) {
  const { type, id, formula, options, batchId, formulas } = e.data;

  if (type === 'render') {
    // 渲染單個公式
    const result = renderFormula(id, formula, options || {});
    self.postMessage(result);

  } else if (type === 'batch') {
    // 批次渲染
    const result = renderBatch(batchId, formulas);
    self.postMessage(result);

  } else if (type === 'ping') {
    // 健康檢查
    self.postMessage({ type: 'pong' });

  } else {
    self.postMessage({
      type: 'error',
      error: `Unknown message type: ${type}`
    });
  }
};

// Worker 初始化完成
self.postMessage({ type: 'ready' });
