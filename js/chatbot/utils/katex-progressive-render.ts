/**
 * Paper Burner - KaTeX 漸進式渲染系統
 * Phase 4.2+: 解決複雜訊息首次渲染 4.6s 阻塞問題
 *
 * 核心策略：
 * 1. 先渲染 Markdown（不渲染公式），立即顯示內容框架
 * 2. 公式位置放佔位符
 * 3. 使用 requestIdleCallback 分批渲染公式，避免阻塞主執行緒
 *
 * 預期效果：
 * - 首次可見：< 300ms
 * - 流式更新：每次 < 50ms
 * - 使用者感知：10倍速度提升
 */

(function() {
  'use strict';

  /**
   * 漸進式渲染配置
   */
  const PROGRESSIVE_CONFIG = {
    BATCH_SIZE: 3,                    // 每批渲染的公式數量
    IDLE_TIMEOUT: 50,                 // 空閒回撥超時時間 (ms)
    PLACEHOLDER_CLASS: 'katex-placeholder',
    ENABLE: true                      // 是否啟用漸進式渲染
  };

  /**
   * 渲染佇列管理器
   */
  class KaTeXProgressiveRenderer {
    constructor() {
      this.renderQueue = [];          // 待渲染的公式佇列
      this.isRendering = false;       // 是否正在渲染
      this.renderedCount = 0;         // 已渲染數量
      this.totalCount = 0;            // 總公式數量
    }

    /**
     * 第一步：快速渲染 Markdown（不渲染公式）
     * 公式位置用佔位符代替
     */
    renderMarkdownWithPlaceholders(md) {
      const formulas = [];
      let formulaCounter = 0;

      // 提取並替換 $$ ... $$ 塊級公式
      md = md.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => {
        const id = `katex-formula-${formulaCounter++}`;
        formulas.push({
          id: id,
          tex: tex.trim(),
          displayMode: true
        });
        return this.createPlaceholder(id, true);
      });

      // 提取並替換 \[ ... \] 塊級公式
      md = md.replace(/\\\[([\s\S]+?)\\\]/g, (match, tex) => {
        const id = `katex-formula-${formulaCounter++}`;
        formulas.push({
          id: id,
          tex: tex.trim(),
          displayMode: true
        });
        return this.createPlaceholder(id, true);
      });

      // 提取並替換 $ ... $ 行內公式
      md = md.replace(/\$([^\$]+?)\$/g, (match, tex) => {
        const id = `katex-formula-${formulaCounter++}`;
        formulas.push({
          id: id,
          tex: tex.trim(),
          displayMode: false
        });
        return this.createPlaceholder(id, false);
      });

      // 提取並替換 \( ... \) 行內公式
      md = md.replace(/\\\(([^)]+?)\\\)/g, (match, tex) => {
        const id = `katex-formula-${formulaCounter++}`;
        formulas.push({
          id: id,
          tex: tex.trim(),
          displayMode: false
        });
        return this.createPlaceholder(id, false);
      });

      return { md, formulas };
    }

    /**
     * 建立公式佔位符
     */
    createPlaceholder(id, displayMode) {
      if (displayMode) {
        return `\n<div id="${id}" class="${PROGRESSIVE_CONFIG.PLACEHOLDER_CLASS} katex-block-placeholder" style="min-height: 40px; background: #f8f9fa; border-radius: 4px; padding: 12px; margin: 8px 0; display: flex; align-items: center; justify-content: center; color: #999;">
  <span style="font-size: 12px;">⏳ 渲染公式中...</span>
</div>\n`;
      } else {
        return `<span id="${id}" class="${PROGRESSIVE_CONFIG.PLACEHOLDER_CLASS} katex-inline-placeholder" style="display: inline-block; min-width: 20px; height: 1em; background: #f0f0f0; border-radius: 2px; padding: 0 4px; color: #999; font-size: 0.8em;">⏳</span>`;
      }
    }

    /**
     * 第二步：將公式新增到渲染佇列
     */
    queueFormulas(formulas) {
      this.renderQueue.push(...formulas);
      this.totalCount = this.renderQueue.length;
      this.renderedCount = 0;

      // 如果還沒開始渲染，啟動渲染
      if (!this.isRendering) {
        this.startRendering();
      }
    }

    /**
     * 啟動漸進式渲染
     */
    startRendering() {
      this.isRendering = true;
      this.renderNextBatch();
    }

    /**
     * 渲染下一批公式
     */
    renderNextBatch() {
      if (this.renderQueue.length === 0) {
        this.isRendering = false;
        console.log(`[KaTeX Progressive] ✅ 所有公式渲染完成 (${this.totalCount} 個)`);
        return;
      }

      const startTime = performance.now();

      // 取出一批公式
      const batch = this.renderQueue.splice(0, PROGRESSIVE_CONFIG.BATCH_SIZE);

      // 渲染這批公式
      batch.forEach(formula => {
        this.renderFormula(formula);
        this.renderedCount++;
      });

      const duration = performance.now() - startTime;

      // 效能監控
      if (window.PerfMonitor) {
        window.PerfMonitor.recordRender(duration, 'katex_progressive_batch');
      }

      // 使用 requestIdleCallback 或 setTimeout 排程下一批
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => this.renderNextBatch(), {
          timeout: PROGRESSIVE_CONFIG.IDLE_TIMEOUT
        });
      } else {
        setTimeout(() => this.renderNextBatch(), 0);
      }
    }

    /**
     * 渲染單個公式
     */
    renderFormula(formula) {
      const placeholder = document.getElementById(formula.id);
      if (!placeholder) {
        console.warn(`[KaTeX Progressive] 佔位符未找到: ${formula.id}`);
        return;
      }

      try {
        const startTime = performance.now();

        // 使用快取渲染
        const renderFn = window.renderKatexCached || katex.renderToString;
        const html = renderFn(formula.tex, {
          displayMode: formula.displayMode,
          output: 'html',
          strict: 'ignore',
          throwOnError: false,
          trust: false,
          macros: {},
          maxSize: 50,
          maxExpand: 100
        });

        const duration = performance.now() - startTime;

        // 替換佔位符
        if (formula.displayMode) {
          placeholder.outerHTML = `<div class="katex-block" data-formula-display="block">${html}</div>`;
        } else {
          placeholder.outerHTML = `<span class="katex-inline" data-formula-display="inline">${html}</span>`;
        }

        // 效能監控
        if (window.PerfMonitor && duration > 10) {
          window.PerfMonitor.recordRender(duration, 'katex_progressive_single');
        }
      } catch (error) {
        console.error(`[KaTeX Progressive] 渲染失敗:`, formula.tex, error);
        // 渲染失敗時顯示原始文字
        placeholder.outerHTML = formula.displayMode
          ? `<div class="katex-fallback katex-block"><pre>${formula.tex}</pre></div>`
          : `<span class="katex-fallback katex-inline">${formula.tex}</span>`;
      }
    }

    /**
     * 清空佇列
     */
    clear() {
      this.renderQueue = [];
      this.isRendering = false;
      this.renderedCount = 0;
      this.totalCount = 0;
    }
  }

  // 建立全域例項
  window.KaTeXProgressiveRenderer = KaTeXProgressiveRenderer;

  if (!window.katexProgressiveRenderer) {
    window.katexProgressiveRenderer = new KaTeXProgressiveRenderer();
    console.log('[KaTeX Progressive] 漸進式渲染系統已載入');
  }

  /**
   * 替換原有的 renderWithKatexStreaming
   * 使用漸進式渲染
   */
  if (PROGRESSIVE_CONFIG.ENABLE && window.renderWithKatexStreaming) {
    const originalRender = window.renderWithKatexStreaming;

    window.renderWithKatexStreaming = function(md) {
      const startTime = performance.now();

      // 第一步：快速渲染（帶佔位符）
      const { md: mdWithPlaceholders, formulas } = window.katexProgressiveRenderer.renderMarkdownWithPlaceholders(md);

      // 渲染 Markdown（不包含公式）
      let html;
      if (typeof window.safeRenderMarkdown === 'function') {
        html = window.safeRenderMarkdown(mdWithPlaceholders);
      } else if (typeof marked !== 'undefined') {
        html = marked.parse(mdWithPlaceholders);
      } else {
        html = mdWithPlaceholders;
      }

      const firstPassDuration = performance.now() - startTime;
      console.log(`[KaTeX Progressive] 首次渲染完成: ${firstPassDuration.toFixed(1)}ms, 公式數: ${formulas.length}`);

      // 第二步：將公式加入渲染佇列（非同步）
      if (formulas.length > 0) {
        // 使用 setTimeout 確保 DOM 已插入
        setTimeout(() => {
          window.katexProgressiveRenderer.queueFormulas(formulas);
        }, 0);
      }

      return html;
    };

    console.log('[KaTeX Progressive] 已啟用漸進式渲染模式');
  }
})();
