/**
 * SegmentManager.js
 * 長畫布分段管理模組
 * 負責PDF連續模式的分段渲染和懶載入
 */

class SegmentManager {
  constructor(pdfDoc, options = {}) {
    this.pdfDoc = pdfDoc;
    this.totalPages = pdfDoc.numPages;
    this.scale = 1.0;
    this.dpr = window.devicePixelRatio || 1;

    // 配置選項
    this.options = Object.assign({
      maxSegmentPixels: null, // 自動根據DPR選擇
      bufferRatio: 0.5,
      scrollDebounceMs: 80,
      bboxNormalizedRange: 1000
    }, options);

    // 段資料
    this.segments = [];
    this.pageInfos = [];
    this.mode = 'continuous';

    // 容器參考
    this.originalSegmentsContainer = null;
    this.translationSegmentsContainer = null;
    this.originalScroll = null;
    this.translationScroll = null;

    // 懶載入狀態
    this._lazyScrollTimer = null;
    this._lazyInitialized = false;
    this._renderingVisible = false;
    this._pendingVisibleRender = false;

    // 儲存事件處理函式參考，用於清理
    this._originalScrollHandler = null;
    this._translationScrollHandler = null;

    // 依賴的渲染函式（由外部注入）
    this.renderPageBboxesToCtx = null;
    this.renderPageTranslationToCtx = null;
    this.clearTextInBbox = null;
    this.clearFormulaElementsForPageInWrapper = null;
    this.onOverlayClick = null;
    this.contentListJson = null;
  }

  /**
   * 設定依賴的渲染函式
   */
  setDependencies(deps) {
    Object.assign(this, deps);
  }

  /**
   * 設定容器元素
   */
  setContainers(originalSegments, translationSegments, originalScroll, translationScroll) {
    this.originalSegmentsContainer = originalSegments;
    this.translationSegmentsContainer = translationSegments;
    this.originalScroll = originalScroll;
    this.translationScroll = translationScroll;
  }

  /**
   * 渲染所有頁面（連續模式）
   */
  async renderAllPagesContinuous() {
    this.mode = 'continuous';

    // 計算自適應縮放
    const firstPage = await this.pdfDoc.getPage(1);
    const originalViewport = firstPage.getViewport({ scale: 1.0 });
    const containerWidth = this.originalScroll.clientWidth - 40;
    this.scale = Math.min(containerWidth / originalViewport.width, 1.5);

    const dpr = this.dpr;
    console.log(`[SegmentManager] DPR=${dpr}, scale=${this.scale}`);

    // 計算所有頁面尺寸（物理畫素）
    this.pageInfos = [];
    let totalHeight = 0;
    for (let i = 1; i <= this.totalPages; i++) {
      const page = await this.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: this.scale * dpr });
      const info = {
        pageNum: i,
        page,
        viewport,
        yOffset: totalHeight,
        width: viewport.width,
        height: viewport.height
      };
      this.pageInfos.push(info);
      totalHeight += viewport.height;
    }

    // 清空舊段容器
    this.originalSegmentsContainer.innerHTML = '';
    this.translationSegmentsContainer.innerHTML = '';
    this.segments = [];

    // 分段策略
    const MAX_SEG_PX = this.options.maxSegmentPixels || (dpr >= 2 ? 4096 : 8192);
    const canvasWidth = this.pageInfos.length > 0
      ? this.pageInfos[0].width
      : Math.round(originalViewport.width * this.scale * dpr);

    let currentSeg = null;
    let currentSegHeight = 0;
    let currentSegTop = 0;

    const startNewSegment = () => {
      const segIndex = this.segments.length;
      if (currentSeg) currentSegTop += currentSegHeight;
      currentSegHeight = 0;
      const seg = {
        index: segIndex,
        topPx: currentSegTop,
        heightPx: 0,
        widthPx: canvasWidth,
        pages: [],
        left: null,
        right: null,
        rendered: false,
        rendering: false,
        textCleared: false,
      };
      this.segments.push(seg);
      currentSeg = seg;
    };

    startNewSegment();
    for (const p of this.pageInfos) {
      if (currentSegHeight > 0 && (currentSegHeight + p.height) > MAX_SEG_PX) {
        currentSeg.heightPx = currentSegHeight;
        startNewSegment();
      }
      const yInSeg = currentSegHeight;
      currentSeg.pages.push({
        pageNum: p.pageNum,
        page: p.page,
        viewport: p.viewport,
        yInSegPx: yInSeg,
        width: p.width,
        height: p.height
      });
      currentSegHeight += p.height;
    }
    if (currentSeg) currentSeg.heightPx = currentSegHeight;

    // 建立段 DOM
    for (const seg of this.segments) {
      this.createSegmentDom(seg, dpr);
    }

    // 初始化懶載入
    this.initLazyLoadingSegments();

    console.log(`[SegmentManager] 已建立 ${this.segments.length} 個段`);
  }

  /**
   * 建立一個段的左右 DOM 和上下文
   */
  createSegmentDom(seg, dpr) {
    const cssWidth = seg.widthPx / dpr;
    const cssHeight = seg.heightPx / dpr;

    const buildSide = (container, side) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-segment-wrapper';
      wrapper.style.position = 'relative';
      wrapper.style.display = 'block';
      wrapper.style.width = cssWidth + 'px';
      wrapper.style.height = cssHeight + 'px';
      wrapper.style.margin = '0';

      const canvas = document.createElement('canvas');
      canvas.width = seg.widthPx;
      canvas.height = seg.heightPx;
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = cssHeight + 'px';
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      const overlay = document.createElement('canvas');
      overlay.width = seg.widthPx;
      overlay.height = seg.heightPx;
      overlay.style.width = cssWidth + 'px';
      overlay.style.height = cssHeight + 'px';
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.top = '0';
      const overlayCtx = overlay.getContext('2d', { willReadFrequently: true });

      wrapper.appendChild(canvas);
      wrapper.appendChild(overlay);
      container.appendChild(wrapper);

      const sideObj = { wrapper, canvas, ctx, overlay, overlayCtx };
      if (side === 'left') seg.left = sideObj; else seg.right = sideObj;

      // 綁定點選事件
      if (side === 'left' && this.onOverlayClick) {
        overlay.addEventListener('click', (e) => this.onOverlayClick(e, seg));
      }
    };

    buildSide(this.originalSegmentsContainer, 'left');
    buildSide(this.translationSegmentsContainer, 'right');
  }

  /**
   * 初始化懶載入：監聽滾動，渲染可見區域
   */
  initLazyLoadingSegments() {
    if (!this.originalScroll || !this.translationScroll) return;

    // 初始渲染可見段
    this.renderVisibleSegments(this.originalScroll);

    const onScroll = (scroller) => {
      clearTimeout(this._lazyScrollTimer);
      this._lazyScrollTimer = setTimeout(() => {
        this.renderVisibleSegments(scroller);
      }, this.options.scrollDebounceMs);
    };

    if (!this._lazyInitialized) {
      // 儲存事件處理函式參考
      this._originalScrollHandler = () => onScroll(this.originalScroll);
      this._translationScrollHandler = () => onScroll(this.translationScroll);

      this.originalScroll.addEventListener('scroll', this._originalScrollHandler);
      this.translationScroll.addEventListener('scroll', this._translationScrollHandler);
      this._lazyInitialized = true;
    }
  }

  /**
   * 渲染當前可見的頁面（視口+緩衝區）
   */
  async renderVisibleSegments(container) {
    if (!this.segments || this.segments.length === 0 || !container) return;
    if (this._renderingVisible) {
      this._pendingVisibleRender = true;
      return;
    }
    this._renderingVisible = true;

    const dpr = this.dpr;
    const scrollTopCss = container.scrollTop;
    const viewportHeightCss = container.clientHeight;
    const bufferCss = viewportHeightCss * this.options.bufferRatio;
    const visibleStartPx = Math.max(0, (scrollTopCss - bufferCss) * dpr);
    const visibleEndPx = (scrollTopCss + viewportHeightCss + bufferCss) * dpr;

    for (const seg of this.segments) {
      const segStart = seg.topPx;
      const segEnd = seg.topPx + seg.heightPx;
      const isVisible = segEnd >= visibleStartPx && segStart <= visibleEndPx;

      if (isVisible && !seg.rendering) {
        try {
          seg.rendering = true;
          await this.renderSegment(seg);
          seg.rendered = true;
        } finally {
          seg.rendering = false;
        }
      }
    }

    this._renderingVisible = false;
    if (this._pendingVisibleRender) {
      this._pendingVisibleRender = false;
      this.renderVisibleSegments(container);
    }
  }

  /**
   * 渲染單個段
   */
  async renderSegment(seg) {
    // 使用離屏畫布避免 PDF.js 清除問題
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d', { willReadFrequently: true, alpha: false });

    for (const p of seg.pages) {
      if (off.width !== p.width) off.width = p.width;
      if (off.height !== p.height) off.height = p.height;

      offCtx.clearRect(0, 0, off.width, off.height);
      await p.page.render({ canvasContext: offCtx, viewport: p.viewport }).promise;

      // 繪製到左右段畫布
      seg.left.ctx.drawImage(off, 0, p.yInSegPx);
      seg.right.ctx.drawImage(off, 0, p.yInSegPx);
    }

    // 繪製 overlays
    await this.renderSegmentOverlays(seg);
  }

  /**
   * 渲染段的覆蓋層（bbox和翻譯）
   */
  async renderSegmentOverlays(seg) {
    if (!this.renderPageBboxesToCtx || !this.renderPageTranslationToCtx) {
      console.warn('[SegmentManager] 缺少渲染函式依賴');
      return;
    }

    const leftCtx = seg.left.overlayCtx;
    const rightCtx = seg.right.overlayCtx;

    // 清理段 overlay
    leftCtx.clearRect(0, 0, seg.widthPx, seg.heightPx);
    rightCtx.clearRect(0, 0, seg.widthPx, seg.heightPx);

    // 清理公式 DOM
    if (this.clearFormulaElementsForPageInWrapper) {
      for (const p of seg.pages) {
        this.clearFormulaElementsForPageInWrapper(p.pageNum, seg.right.wrapper);
      }
    }

    // 繪製 overlays（序列執行）
    for (const p of seg.pages) {
      this.renderPageBboxesToCtx(leftCtx, p.pageNum, p.yInSegPx, p.width, p.height);
      await this.renderPageTranslationToCtx(rightCtx, seg.right.wrapper, p.pageNum, p.yInSegPx, p.width, p.height);
    }
  }

  /**
   * 清除段內所有 bbox 的原始文字
   */
  async clearTextInSegment(seg) {
    if (!this.contentListJson || !this.clearTextInBbox) {
      console.warn('[SegmentManager] 缺少清除文字依賴');
      return;
    }

    const pageItems = this.contentListJson.filter(item => item.type === 'text');
    const BBOX_NORMALIZED_RANGE = this.options.bboxNormalizedRange;

    for (const p of seg.pages) {
      const pageNum = p.pageNum;
      const scaleX = p.width / BBOX_NORMALIZED_RANGE;
      const scaleY = p.height / BBOX_NORMALIZED_RANGE;

      // 獲取當前頁的所有 bbox
      const currentPageItems = pageItems.filter(item => item.page_idx === pageNum - 1);

      for (const item of currentPageItems) {
        if (!item.bbox) continue;

        const bb = item.bbox;
        const x = bb[0] * scaleX;
        const y = bb[1] * scaleY + p.yInSegPx;
        const w = (bb[2] - bb[0]) * scaleX;
        const h = (bb[3] - bb[1]) * scaleY;

        // 精確清除文字
        await this.clearTextInBbox(seg.right.ctx, pageNum, { x, y, w, h }, p.yInSegPx);
      }
    }
  }

  /**
   * 獲取當前可見的頁碼
   */
  getCurrentVisiblePageNum(container) {
    if (!container || !this.pageInfos || this.pageInfos.length === 0) return 1;

    const scrollTopCss = container.scrollTop;
    const scrollTopPx = scrollTopCss * this.dpr;

    for (const info of this.pageInfos) {
      if (scrollTopPx >= info.yOffset && scrollTopPx < info.yOffset + info.height) {
        return info.pageNum;
      }
    }
    return 1;
  }

  /**
   * 滾動到指定頁面
   */
  scrollToPage(pageNum, container) {
    if (!container || pageNum < 1 || pageNum > this.pageInfos.length) return;

    const info = this.pageInfos[pageNum - 1];
    const scrollTopCss = info.yOffset / this.dpr;
    container.scrollTop = scrollTopCss;
  }

  /**
   * 清理資源
   */
  destroy() {
    // 清理定時器
    if (this._lazyScrollTimer) {
      clearTimeout(this._lazyScrollTimer);
      this._lazyScrollTimer = null;
    }

    // 移除事件監聽
    if (this._lazyInitialized && this.originalScroll && this.translationScroll) {
      if (this._originalScrollHandler) {
        this.originalScroll.removeEventListener('scroll', this._originalScrollHandler);
        this._originalScrollHandler = null;
      }
      if (this._translationScrollHandler) {
        this.translationScroll.removeEventListener('scroll', this._translationScrollHandler);
        this._translationScrollHandler = null;
      }
      this._lazyInitialized = false;
    }

    // 清空資料
    this.segments = [];
    this.pageInfos = [];

    // 清空 DOM
    if (this.originalSegmentsContainer) {
      this.originalSegmentsContainer.innerHTML = '';
    }
    if (this.translationSegmentsContainer) {
      this.translationSegmentsContainer.innerHTML = '';
    }
  }
}

// 匯出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SegmentManager;
}
