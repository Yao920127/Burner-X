/**
 * 應用塊級或子塊級元素的醒目提示和互動。
 * 容器中的任何塊級元素（段落、標題、列表等）應具有 'data-block-index' 屬性。
 * 塊級元素內部的子塊 (span) 應具有 'data-sub-block-id' 屬性 (格式如 'parentIndex.subIndex')。
 * 批註應透過 'ann.target.selector[0].subBlockId' 或 'ann.target.selector[0].blockIndex' 來定位這些元素。
 *
 * @param {HTMLElement} containerElement - 內容的父容器元素。
 * @param {Array<Object>} allAnnotations - 文件的所有批註資料列表。
 * @param {string} contentIdentifier - 當前內容型別的識別符號 ('ocr' 或 'translation')。
 */
function applyBlockAnnotations(containerElement, allAnnotations, contentIdentifier) {
    const __ANNOTATION_DEBUG__ = (function(){
        try { return !!(window && (window.ENABLE_ANNOTATION_DEBUG || localStorage.getItem('ENABLE_ANNOTATION_DEBUG') === 'true')); } catch { return false; }
    })();
    // ====== 呼叫時機日誌 ======
    // console.log('[applyBlockAnnotations] 被呼叫', {
    //    contentIdentifier,
    //    containerElement,
    //    annotationCount: allAnnotations ? allAnnotations.length : 0,
    //    callStack: (new Error().stack)
    //});

    // ====== 新增：4.1日誌（入口） ======
    try {
        const sub41 = containerElement.querySelector('.sub-block[data-sub-block-id="4.1"]');
        if (sub41) {
            //console.log('[除錯][入口] 4.1 outerHTML:', sub41.outerHTML);
            //console.log('[除錯][入口] 4.1 textContent:', sub41.textContent);
        } else {
            //console.log('[除錯][入口] 4.1 不存在');
        }
    } catch (e) { console.error('[除錯][入口] 4.1 日誌異常', e); }

    // ====== 新增：醒目提示應用前全域檢測 ======
    if (__ANNOTATION_DEBUG__) {
        const allBlocksPre = containerElement.querySelectorAll('[data-block-index]');
        allBlocksPre.forEach(block => {
            const subs = block.querySelectorAll('.sub-block');
            // console.log(`[檢測][applyBlockAnnotations前] block#${block.dataset.blockIndex} 有${subs.length}個sub-block:`, Array.from(subs).map(sb => (sb.textContent || '').substring(0, 20)));
        });
    }

    // 列印所有 sub-block 的內容（分割後）
    if (__ANNOTATION_DEBUG__) {
        if (containerElement) {
            const allSubBlocks = containerElement.querySelectorAll('.sub-block');
            allSubBlocks.forEach(sb => {
                // console.log('[applyBlockAnnotations][分割後] sub-block', sb.dataset.subBlockId, '內容：', sb.textContent);
            });
        }
    }

    // ====== 日誌：醒目提示應用開始 ======
    //console.log(`[BlockHighlighter] 開始應用醒目提示，contentIdentifier=${contentIdentifier}`);
    const allSubBlocks = containerElement.querySelectorAll('.sub-block');
    //console.log(`[BlockHighlighter] 當前子塊數量: ${allSubBlocks.length}`);
    //console.log(`[BlockHighlighter] 當前子塊ID:`, Array.from(allSubBlocks).map(sb => sb.dataset.subBlockId));

    performance.mark('applyAnnotations-start');
    if (window.currentVisibleTabId === 'chunk-compare') {
        return;
    }
    if (!containerElement || !allAnnotations) {
        //console.log("[BlockHighlighter] 未提供容器元素或批註資料。");
        return;
    }
    // ====== 日誌：去重前 ======
    //console.log('[BlockHighlighter] 去重前 annotation 數量:', allAnnotations.length);
    const beforeAnnList = __ANNOTATION_DEBUG__ ? allAnnotations.map(ann => ann.target && ann.target.selector && ann.target.selector[0] && ann.target.selector[0].subBlockId).filter(Boolean) : [];
    //console.log('[BlockHighlighter] 去重前 subBlockId 列表:', beforeAnnList);
    // ========== 去重 ==========
    const seen = new Set();
    const dedupedAnnotations = [];
    for (const ann of allAnnotations) {
        if (ann.targetType !== contentIdentifier) {
            dedupedAnnotations.push(ann);
            continue;
        }
        let key = '';
        if (ann.target && ann.target.selector && ann.target.selector[0]) {
            if (ann.target.selector[0].subBlockId) {
                if (ann.target.selector[0].type === 'SubBlockRangeSelector' && (Number.isFinite(ann.target.selector[0].startOffset) || Number.isFinite(ann.target.selector[0].endOffset))) {
                    key = 'subBlockRange:' + ann.target.selector[0].subBlockId + ':' + (ann.target.selector[0].startOffset || 0) + ':' + (ann.target.selector[0].endOffset || 0);
                } else {
                    key = 'subBlockId:' + ann.target.selector[0].subBlockId;
                }
            } else if (ann.target.selector[0].blockIndex !== undefined) {
                key = 'blockIndex:' + ann.target.selector[0].blockIndex;
            }
        }
        if (!key) {
            dedupedAnnotations.push(ann);
            continue;
        }
        if (!seen.has(key)) {
            seen.add(key);
            dedupedAnnotations.push(ann);
        }
    }
    allAnnotations = dedupedAnnotations;
    // ====== 日誌：去重後 ======
    //console.log('[BlockHighlighter] 去重後 annotation 數量:', allAnnotations.length);
    const afterAnnList = __ANNOTATION_DEBUG__ ? allAnnotations.map(ann => ann.target && ann.target.selector && ann.target.selector[0] && ann.target.selector[0].subBlockId).filter(Boolean) : [];
    //console.log('[BlockHighlighter] 去重後 subBlockId 列表:', afterAnnList);

    // ====== 日誌：清理醒目提示前 ======
    const beforeCleanSubBlocks = __ANNOTATION_DEBUG__ ? containerElement.querySelectorAll('.sub-block') : [];
    //console.log(`[BlockHighlighter] 清理前子塊數量: ${beforeCleanSubBlocks.length}`);

    // 1. 只移除醒目提示樣式和屬性，不刪除子塊
    const existingAnnotationSpans = containerElement.querySelectorAll('[data-annotation-id]');
    function hasSubBlockDescendant(node) {
        if (!node || !node.querySelectorAll) return false;
        return node.querySelectorAll('.sub-block').length > 0;
    }

    existingAnnotationSpans.forEach(span => {
        if (span.classList.contains('sub-block')) {
            // 只移除醒目提示樣式和批註屬性，不刪除子塊
            span.style.backgroundColor = '';
            span.style.border = '';
            span.style.padding = '';
            span.style.borderRadius = '';
            span.style.boxShadow = '';
            span.classList.remove('annotated-sub-block', 'has-note', 'cross-block-highlight');
            span.removeAttribute('data-annotation-id');
            span.removeAttribute('title');
            // 移除跨子塊標識
            const indicator = span.querySelector('.cross-block-indicator');
            if (indicator) indicator.remove();
        } else if (span.classList.contains('annotation-wrapper')) {
            const parent = span.parentNode;
            // 清掉內部的跨子塊指示器
            const indicator = span.querySelector('.cross-block-indicator');
            if (indicator) indicator.remove();
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            span.remove();
        } else if (span.classList.contains('pre-annotated')) {
            // 只清理屬性，不刪除節點
            span.style.backgroundColor = '';
            span.style.border = '';
            span.style.padding = '';
            span.style.borderRadius = '';
            span.style.boxShadow = '';
            span.classList.remove('pre-annotated', 'annotated-block', 'annotated-sub-block', 'has-annotation', 'has-highlight', 'has-note', 'cross-block-highlight');
            span.removeAttribute('data-annotation-id');
            span.removeAttribute('data-highlight-color');
            span.removeAttribute('title');
        } else {
            // 遞迴檢測所有後代是否包含 .sub-block
            if (hasSubBlockDescendant(span)) {
                if (__ANNOTATION_DEBUG__) console.warn('[醒目提示清理保護-遞迴] 跳過包含 sub-block 的節點:', span.outerHTML);
                return;
            } else {
                // 通用“安全解包”：保留文字內容，不刪正文
                const parent = span.parentNode;
                // 移除內部跨子塊指示器
                const indicator = span.querySelector && span.querySelector('.cross-block-indicator');
                if (indicator) indicator.remove();
                if (span.childNodes && span.childNodes.length > 0) {
                    while (span.firstChild) {
                        parent.insertBefore(span.firstChild, span);
                    }
                    span.remove();
                } else {
                    // 僅文字內容（或為空）：將文位元組點放回去
                    const text = span.textContent || '';
                    if (text) parent.insertBefore(document.createTextNode(text), span);
                    span.remove();
                }
            }
        }
    });

    // 2. 移除所有帶有批註相關類的元素上的類和樣式
    const existingHighlights = containerElement.querySelectorAll('.annotated-block, .annotated-sub-block');
    existingHighlights.forEach(el => {
        el.style.backgroundColor = '';
        el.style.border = '';
        el.style.padding = '';
        el.style.borderRadius = '';
        el.style.boxShadow = '';
        if (el.classList.contains('katex-display') || el.tagName === 'IMG' || el.tagName === 'TABLE') {
            el.style.display = '';
            el.style.width = '';
            el.style.marginLeft = '';
            el.style.marginRight = '';
        }
        const katexChild = el.querySelector('.katex-display');
        if (katexChild) {
            katexChild.style.border = ''; katexChild.style.padding = '';
            katexChild.style.display = ''; katexChild.style.width = '';
            katexChild.style.marginLeft = ''; katexChild.style.marginRight = '';
            katexChild.style.borderRadius = ''; katexChild.style.boxShadow = '';
        }
        const imgChild = el.querySelector('img');
        if (imgChild) {
            imgChild.style.border = ''; imgChild.style.padding = '';
            imgChild.style.display = ''; imgChild.style.width = '';
            imgChild.style.marginLeft = ''; imgChild.style.marginRight = '';
            imgChild.style.borderRadius = ''; imgChild.style.boxShadow = '';
        }
        const tableChild = el.querySelector('table');
        if (tableChild) {
            tableChild.style.border = ''; tableChild.style.padding = '';
            tableChild.style.display = ''; tableChild.style.width = '';
            tableChild.style.marginLeft = ''; tableChild.style.marginRight = '';
            tableChild.style.borderRadius = ''; tableChild.style.boxShadow = '';
        }
        el.classList.remove('annotated-block', 'annotated-sub-block', 'has-annotation', 'has-highlight', 'cross-block-highlight');
        if (el.hasAttribute('data-annotation-id')) {
            el.removeAttribute('data-annotation-id');
        }
        if (el.hasAttribute('data-highlight-color')) {
            el.removeAttribute('data-highlight-color');
        }
        if (el.tagName === 'SPAN' && el.classList.contains('sub-block') &&
            el.parentElement && el.parentElement.tagName === 'TABLE') {
            const subBlockId = el.dataset.subBlockId;
            if (subBlockId) {
                const subBlockIdPrefix = subBlockId.split('.')[0];
                if (el.parentElement.dataset.blockIndex === subBlockIdPrefix) {
                    el.parentElement.style.border = '';
                    el.parentElement.style.padding = '';
                    el.parentElement.style.display = '';
                    el.parentElement.style.width = '';
                    el.parentElement.style.marginLeft = '';
                    el.parentElement.style.marginRight = '';
                    el.parentElement.style.borderRadius = '';
                    el.parentElement.style.boxShadow = '';
                }
            }
        }
        el.classList.remove('annotated-block', 'annotated-sub-block', 'has-note', 'cross-block-highlight');
        el.removeAttribute('title');
        el.removeAttribute('data-annotation-id');
        // 移除跨子塊標識
        const indicator = el.querySelector('.cross-block-indicator');
        if (indicator) indicator.remove();
    });

    // ====== 日誌：醒目提示應用前後子塊對比 ======
    const afterCleanSubBlocks = __ANNOTATION_DEBUG__ ? containerElement.querySelectorAll('.sub-block') : [];
    //console.log(`[BlockHighlighter] 清理後子塊數量: ${afterCleanSubBlocks.length}`);
    //console.log(`[BlockHighlighter] 清理後子塊ID:`, Array.from(afterCleanSubBlocks).map(sb => sb.dataset.subBlockId));

    // ====== 新增：4.1日誌（醒目提示清理後） ======
    try {
        const sub41 = containerElement.querySelector('.sub-block[data-sub-block-id="4.1"]');
        if (sub41) {
            //console.log('[除錯][醒目提示清理後] 4.1 outerHTML:', sub41.outerHTML);
            //console.log('[除錯][醒目提示清理後] 4.1 textContent:', sub41.textContent);
        } else {
            //console.log('[除錯][醒目提示清理後] 4.1 不存在');
        }
    } catch (e) { console.error('[除錯][醒目提示清理後] 4.1 日誌異常', e); }

    // ====== 新增：醒目提示清理後全域檢測 ======
    if (__ANNOTATION_DEBUG__) {
        const allBlocksAfterHighlight = containerElement.querySelectorAll('[data-block-index]');
        allBlocksAfterHighlight.forEach(block => {
            const subs = block.querySelectorAll('.sub-block');
            //console.log(`[檢測][醒目提示清理後] block#${block.dataset.blockIndex} 有${subs.length}個sub-block:`, Array.from(subs).map(sb => (sb.textContent || '').substring(0, 20)));
        });
    }

    // 優先處理子塊批註
    // 先構建索引，避免每個元素 O(n) 查詢
    const subBlockMap = new Map();
    const blockIndexMap = new Map();
    if (Array.isArray(allAnnotations)) {
        for (const ann of allAnnotations) {
            if (!ann || ann.targetType !== contentIdentifier || !ann.target || !Array.isArray(ann.target.selector)) continue;
            const sel = ann.target.selector[0];
            if (!sel) continue;
            if (sel.subBlockId && (ann.motivation === 'highlighting' || ann.motivation === 'commenting')) {
                // 支援同一子塊多個註解（尤其是區間標註）
                if (!subBlockMap.has(sel.subBlockId)) subBlockMap.set(sel.subBlockId, []);
                subBlockMap.get(sel.subBlockId).push(ann);
            } else if ((sel.blockIndex !== undefined) && (ann.motivation === 'highlighting' || ann.motivation === 'commenting')) {
                const key = String(sel.blockIndex);
                if (!blockIndexMap.has(key)) blockIndexMap.set(key, ann);
            }
        }
    }

    // 支援真實子塊(span)與虛擬子塊(段落等被臨時標記了 data-sub-block-id)
    const subBlockElements = containerElement.querySelectorAll('[data-sub-block-id]');
    subBlockElements.forEach((subBlockElement) => {
        const subBlockId = subBlockElement.dataset.subBlockId;
        if (typeof subBlockId === 'undefined') return;
        let annotationsForThis = subBlockMap.get(subBlockId);
        if (!annotationsForThis || annotationsForThis.length === 0) {
            // fallback: exact 文字比對（僅在除錯或確有 exact 才考慮）
            const text = subBlockElement.textContent && subBlockElement.textContent.trim();
            if (text) {
                const annotation = allAnnotations && allAnnotations.find(ann =>
                    ann.targetType === contentIdentifier && ann.target && Array.isArray(ann.target.selector) &&
                    ann.target.selector[0] && ann.target.selector[0].exact &&
                    text.replace(/\s+/g, '') === ann.target.selector[0].exact.trim().replace(/\s+/g, '') &&
                    (ann.motivation === 'highlighting' || ann.motivation === 'commenting')
                );
                if (annotation) {
                    annotationsForThis = [annotation];
                    if (__ANNOTATION_DEBUG__) console.warn(`[醒目提示fallback] subBlockId未命中，使用exact文字比對成功: "${text}"`);
                }
            }
        } else {
            // 檢查 exact 一致性（僅非區間註解提示）；區間註解不依賴 exact
            if (annotationsForThis.length === 1) {
                const ann = annotationsForThis[0];
                const s0 = ann && ann.target && ann.target.selector && ann.target.selector[0];
                const isRange = s0 && s0.type === 'SubBlockRangeSelector';
                if (!isRange && s0 && s0.exact && subBlockElement.textContent) {
                    const now = subBlockElement.textContent.trim().replace(/\s+/g, '');
                    const old = String(s0.exact).trim().replace(/\s+/g, '');
                    if (now !== old) {
                        if (__ANNOTATION_DEBUG__) console.warn(`[醒目提示提示] subBlockId=${subBlockId} 內容與 exact 不一致，已臨時糾正 exact 以避免誤差`);
                        try { ann.target.selector[0].exact = subBlockElement.textContent.trim(); } catch { /* noop */ }
                    }
                }
            }
        }
        if (annotationsForThis && annotationsForThis.length) {
            annotationsForThis.forEach(ann => applyAnnotationToElement(subBlockElement, ann, contentIdentifier, subBlockId, 'subBlock'));
        }
    });

    // 已移除：整塊醒目提示渲染（統一為跨子塊/子塊內區間模式）

    // ====== 日誌：醒目提示應用後子塊對比 ======
    const afterHighlightSubBlocks = __ANNOTATION_DEBUG__ ? containerElement.querySelectorAll('.sub-block') : [];
    ////console.log(`[BlockHighlighter] 醒目提示後子塊數量: ${afterHighlightSubBlocks.length}`);
    ////console.log(`[BlockHighlighter] 醒目提示後子塊ID:`, Array.from(afterHighlightSubBlocks).map(sb => sb.dataset.subBlockId));

    // ====== 新增：4.1日誌（醒目提示應用後） ======
    try {
        const sub41 = containerElement.querySelector('.sub-block[data-sub-block-id="4.1"]');
        if (sub41) {
            //console.log('[除錯][醒目提示應用後] 4.1 outerHTML:', sub41.outerHTML);
            //console.log('[除錯][醒目提示應用後] 4.1 textContent:', sub41.textContent);
        } else {
            //console.log('[除錯][醒目提示應用後] 4.1 不存在');
        }
    } catch (e) { console.error('[除錯][醒目提示應用後] 4.1 日誌異常', e); }

    // ====== 新增：醒目提示應用後全域檢測 ======
    if (__ANNOTATION_DEBUG__) {
        const allBlocksAfterHighlight = containerElement.querySelectorAll('[data-block-index]');
        allBlocksAfterHighlight.forEach(block => {
            const subs = block.querySelectorAll('.sub-block');
            //console.log(`[檢測][醒目提示應用後] block#${block.dataset.blockIndex} 有${subs.length}個sub-block:`, Array.from(subs).map(sb => (sb.textContent || '').substring(0, 20)));
        });
    }

    // ====== 新增：處理跨子塊批註 ======
    if (Array.isArray(allAnnotations)) {
        let crossBlockAnnotations = allAnnotations.filter(ann => 
            ann && ann.isCrossBlock === true && 
            ann.targetType === contentIdentifier &&
            ann.target && Array.isArray(ann.target.selector) &&
            ann.target.selector[0] && ann.target.selector[0].type === 'CrossBlockRangeSelector' &&
            Array.isArray(ann.target.selector[0].affectedSubBlocks)
        );

        // 跨子塊去重：按 id 優先，其次按子塊集合+偏移
        const seenCross = new Set();
        const deduped = [];
        crossBlockAnnotations.forEach(ann => {
            const sel = ann.target.selector[0];
            const keyId = ann.id || '';
            const keySet = (sel.affectedSubBlocks.slice().sort().join('|') + ':' + (sel.startOffset||'') + ':' + (sel.endOffset||''));
            const key = keyId ? ('id:' + keyId) : ('set:' + keySet);
            if (!seenCross.has(key)) { seenCross.add(key); deduped.push(ann); }
        });
        crossBlockAnnotations = deduped;

        console.log(`[跨子塊醒目提示] 找到 ${crossBlockAnnotations.length} 個跨子塊批註`);

        crossBlockAnnotations.forEach(annotation => {
            const selector = annotation.target.selector[0];
            const affectedSubBlocks = selector.affectedSubBlocks;
            
            console.log(`[跨子塊醒目提示] 處理跨子塊批註 ${annotation.id}，涉及子塊:`, affectedSubBlocks);

            // 呼叫跨子塊醒目提示功能
            if (typeof window.applyCrossBlockAnnotation === 'function') {
                console.log(`[跨子塊醒目提示] 呼叫 applyCrossBlockAnnotation，引數:`, {
                    containerElement,
                    annotation: annotation.id,
                    contentIdentifier,
                    affectedSubBlocks
                });
                window.applyCrossBlockAnnotation(containerElement, annotation, contentIdentifier);
            } else {
                console.error('[跨子塊醒目提示] applyCrossBlockAnnotation 函式未找到');
            }
        });
    }

    // 只在 annotation 沒有對應 DOM 時報警
    allAnnotations.forEach(ann => {
        if (ann.targetType === contentIdentifier && ann.target && ann.target.selector && ann.target.selector[0] && ann.target.selector[0].subBlockId) {
            const subBlockId = ann.target.selector[0].subBlockId;
            const dom = containerElement.querySelector(`.sub-block[data-sub-block-id=\"${subBlockId}\"]`);
            if (!dom) {
                console.warn(`[BlockHighlighter] annotation 指向的子塊 ${subBlockId} 頁面上不存在！`);
            }
        }
    });

    performance.mark('applyAnnotations-end');
    performance.measure('applyAnnotations', 'applyAnnotations-start', 'applyAnnotations-end');
}

/**
 * 輔助函式，將批註樣式和事件應用到指定的元素 (塊或子塊)
 * @param {HTMLElement} element - 目標DOM元素
 * @param {Object} annotation - 批註物件
 * @param {string} contentIdentifier - 內容識別符號 ('ocr' 或 'translation')
 * @param {string} elementIdentifier - 元素識別符號 (blockIndex 或 subBlockId)
 * @param {'block'|'subBlock'} elementType - 元素型別
 */
function applyAnnotationToElement(element, annotation, contentIdentifier, elementIdentifier, elementType) {
    // ====== 醒目提示空內容保護 ======
    if ((!element.textContent || !element.textContent.trim()) && !element.querySelector('img')) {
        console.warn(`[醒目提示保護] 跳過空內容的${elementType}，subBlockId/blockIndex: ${elementIdentifier}，annotationId: ${annotation.id}`);
        return;
    }
    
    // ====== 新增：公式型別檢測（僅當元素本身就是公式容器時才走公式醒目提示） ======
    // 子塊內含有公式時，不在這裡整體套用公式醒目提示；而是交給後續"區域性文字包裹 + 公式外層醒目提示"的組合邏輯處理。
    const isFormulaElement = element.classList && (element.classList.contains('katex') || element.classList.contains('katex-display') || element.classList.contains('katex-inline'));
    
    // 檢查是否是跨子塊標註的中間子塊
    const isCrossBlockAnnotation = annotation.target && 
        annotation.target.selector && 
        annotation.target.selector[0] && 
        annotation.target.selector[0].type === 'CrossBlockRangeSelector';
    
    if (isFormulaElement && !isCrossBlockAnnotation) {
        // 只有非跨子塊標註才走公式專用醒目提示
        const formulaInfo = detectFormulaType(element);
        if (formulaInfo && formulaInfo.hasFormula) {
            return applyFormulaAnnotation(element, annotation, contentIdentifier, elementIdentifier, elementType, formulaInfo);
        }
    }
    
    // ====== 醒目提示前日誌 ======
    //console.log(`[醒目提示應用] ${elementType}(${elementIdentifier}) 醒目提示前內容: "${element.textContent}"`);

    // ====== 子塊內區間醒目提示（優先於 exact 文字） ======
    if (elementType === 'subBlock' && annotation.target && annotation.target.selector && annotation.target.selector[0]) {
        const sel0 = annotation.target.selector[0];
        if (sel0.type === 'SubBlockRangeSelector' && (Number.isFinite(sel0.startOffset) || Number.isFinite(sel0.endOffset))) {
            const fullLen = (element.textContent || '').length;
            const s = Math.max(0, Math.min(Number(sel0.startOffset) || 0, fullLen));
            const e = Math.max(0, Math.min(Number(sel0.endOffset) || fullLen, fullLen));
            if (e > s) {
                applyPartialCrossBlockHighlight(element, annotation, getHighlightColor(annotation.highlightColor || 'yellow'),
                    (annotation.body && annotation.body[0] && annotation.body[0].value) ? annotation.body[0].value : '',
                    s, e, 0, 1, false, 'ocr');
                return; // 已完成區域性醒目提示
            }
        }
    }

    // ====== 精確醒目提示邏輯，僅對 subBlock 生效 ======
    if (elementType === 'subBlock' && annotation.target && annotation.target.selector && annotation.target.selector[0] && annotation.target.selector[0].exact) {
        const exact = annotation.target.selector[0].exact.trim();
        const elementText = extractTextIgnoringFormulas(element).trim();
        
        console.log('[精確醒目提示-DOM] 目標文字:', exact);
        console.log('[精確醒目提示-DOM] 元素文字(忽略公式):', elementText);
        
        if (exact && elementText !== exact) {
            // 在邏輯文字中查詢比對位置
            const idx = elementText.indexOf(exact);
            if (idx !== -1) {
                console.log('[精確醒目提示-DOM] 找到比對位置:', idx, '長度:', exact.length);
                
                // 嘗試新的文字搜尋方法
                const range = createRangeByTextSearch(element, exact);
                if (range) {
                    console.log('[精確醒目提示-DOM] 文字搜尋成功建立Range');
                    // 應用結構化醒目提示，保持DOM結構
                    const highlightElement = applyStructuredHighlight(range, annotation, 'exact-highlight');
                    if (highlightElement) {
                        // 綁定事件
                        bindStandardAnnotationEvents(highlightElement, annotation, elementType, elementIdentifier);
                        console.log('[精確醒目提示-DOM] 成功應用文字搜尋精確醒目提示');
                        return;
                    } else {
                        console.warn('[精確醒目提示-DOM] applyStructuredHighlight失敗');
                    }
                } else {
                    console.warn('[精確醒目提示-DOM] 文字搜尋建立Range失敗');
                }
                
                console.warn('[精確醒目提示-DOM] 文字搜尋方法失敗，fallback到字串方法');
                
                // Fallback：使用原來的字串方法
                const before = elementText.slice(0, idx);
                const match = elementText.slice(idx, idx + exact.length);
                const after = elementText.slice(idx + exact.length);
                // 構造醒目提示 span
                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'exact-highlight annotated-sub-block';
                highlightSpan.style.backgroundColor = getHighlightColor(annotation.highlightColor || 'yellow');
                highlightSpan.style.borderRadius = '6px';
                highlightSpan.style.boxShadow = `0 0 5px ${getHighlightColor(annotation.highlightColor || 'yellow')}`;
                highlightSpan.style.padding = '0 3px';
                highlightSpan.textContent = match;
                if (annotation.body && annotation.body.length > 0 && annotation.body[0].value) {
                    highlightSpan.title = annotation.body[0].value;
                    highlightSpan.classList.add('has-note');
                }
                highlightSpan.dataset.annotationId = annotation.id;
                // 事件綁定
                if (!highlightSpan._annotationEventBound) {
                    highlightSpan.addEventListener('click', function handleClick(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const range = document.createRange();
                        range.selectNodeContents(this);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                        window.globalCurrentSelection = {
                            text: this.textContent,
                            range: range.cloneRange(),
                            annotationId: this.dataset.annotationId,
                            targetElement: this,
                            subBlockId: elementIdentifier
                        };
                        const parentBlock = this.closest('[data-block-index]');
                        if (parentBlock) {
                            window.globalCurrentSelection.blockIndex = parentBlock.dataset.blockIndex;
                        }
                        if (typeof window.checkIfTargetIsHighlighted === 'function' &&
                            typeof window.checkIfTargetHasNote === 'function' &&
                            typeof window.updateContextMenuOptions === 'function' &&
                            typeof window.showContextMenu === 'function') {
                            const isHighlighted = window.checkIfTargetIsHighlighted(annotation.id, contentIdentifier, elementIdentifier, 'subBlockId');
                            const hasNoteForClick = window.checkIfTargetHasNote(annotation.id, contentIdentifier, elementIdentifier, 'subBlockId');
                            window.updateContextMenuOptions(isHighlighted, hasNoteForClick);
                            window.showContextMenu(e.pageX, e.pageY);
                        }
                    });
                    highlightSpan._annotationEventBound = true;
                }
                // 構造新內容
                element.innerHTML = '';
                if (before) element.appendChild(document.createTextNode(before));
                element.appendChild(highlightSpan);
                if (after) element.appendChild(document.createTextNode(after));
                // 只做精確醒目提示，不再整體醒目提示
                return;
            } else {
                // 沒找到 exact，降級為整體醒目提示
                console.warn(`[精確醒目提示] exact 未在 subBlock 中找到，降級為整體醒目提示: subBlockId=${elementIdentifier}, exact="${exact}", span內容="${elementText}"`);
            }
        }
    }

    // 應用標準醒目提示樣式
    applyStandardHighlight(element, annotation, elementIdentifier, elementType);
}

// ===== DOM樹精確分析工具函式 =====

// 檢查節點是否在公式內部
function isInsideFormula(node) {
    let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (current) {
        if (current.classList && (
            current.classList.contains('katex') || 
            current.classList.contains('katex-display') || 
            current.classList.contains('katex-inline')
        )) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}

// 提取元素的純文字內容（忽略公式）
function extractTextIgnoringFormulas(element) {
    let text = '';
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return isInsideFormula(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        text += node.textContent;
    }
    return text;
}

// 將邏輯文字偏移對映到實際DOM位置（改進版：處理公式間隙）
function mapLogicalToDOM(element, logicalOffset) {
    let currentOffset = 0;
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_ALL, // 檢查所有節點型別
        {
            acceptNode: function(node) {
                // 文位元組點：如果不在公式內，接受
                if (node.nodeType === Node.TEXT_NODE) {
                    return isInsideFormula(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
                }
                // 元素節點：如果是公式，跳過；否則繼續走訪子節點
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList && (
                        node.classList.contains('katex') || 
                        node.classList.contains('katex-display') || 
                        node.classList.contains('katex-inline')
                    )) {
                        return NodeFilter.FILTER_REJECT; // 跳過整個公式子樹
                    }
                    return NodeFilter.FILTER_SKIP; // 繼續走訪子節點
                }
                return NodeFilter.FILTER_REJECT;
            }
        }
    );
    
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            const nodeLength = node.textContent.length;
            console.log(`[邏輯對映] 檢查文位元組點: "${node.textContent}" 長度:${nodeLength} 當前偏移:${currentOffset} 目標:${logicalOffset}`);
            
            if (currentOffset + nodeLength >= logicalOffset) {
                const result = {
                    container: node,
                    offset: logicalOffset - currentOffset
                };
                console.log(`[邏輯對映] 找到目標位置:`, result);
                return result;
            }
            currentOffset += nodeLength;
        }
    }
    
    // 如果超出範圍，返回最後一個文位元組點的末尾
    console.warn(`[邏輯對映] 邏輯偏移${logicalOffset}超出範圍，當前偏移${currentOffset}`);
    
    // 重新走訪找到最後一個文位元組點
    const lastWalker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return isInsideFormula(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let lastNode = null;
    while (node = lastWalker.nextNode()) {
        lastNode = node;
    }
    
    if (lastNode) {
        return {
            container: lastNode,
            offset: lastNode.textContent.length
        };
    }
    
    return null;
}

// 建立跨越公式的精確Range（新方法：直接在DOM中查詢文字）
function createRangeByTextSearch(element, targetText, startOffset = 0) {
    console.log(`[文字搜尋Range] 在元素中搜尋: "${targetText}" 起始偏移: ${startOffset}`);
    
    // 使用瀏覽器原生的文字搜尋功能
    const tempSelection = window.getSelection();
    const originalRanges = [];
    
    // 儲存當前選擇
    for (let i = 0; i < tempSelection.rangeCount; i++) {
        originalRanges.push(tempSelection.getRangeAt(i).cloneRange());
    }
    
    tempSelection.removeAllRanges();
    
    try {
        // 建立搜尋範圍
        const searchRange = document.createRange();
        searchRange.selectNodeContents(element);
        
        // 搜尋目標文字
        if (window.find) {
            // 使用window.find進行搜尋
            const found = window.find(targetText, false, false, false, false, true, false);
            if (found && tempSelection.rangeCount > 0) {
                const foundRange = tempSelection.getRangeAt(0);
                console.log('[文字搜尋Range] 使用window.find找到文字');
                return foundRange.cloneRange();
            }
        }
        
        // Fallback: 手動搜尋
        console.log('[文字搜尋Range] window.find失敗，使用手動搜尋');
        return findTextInDOMRange(element, targetText);
        
    } finally {
        // 恢復原始選擇
        tempSelection.removeAllRanges();
        originalRanges.forEach(range => tempSelection.addRange(range));
    }
}

// 手動在DOM中搜尋文字並返回Range
function findTextInDOMRange(element, targetText) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return isInsideFormula(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let fullText = '';
    const textNodes = [];
    let node;
    
    // 收集所有非公式文位元組點
    while (node = walker.nextNode()) {
        textNodes.push({
            node: node,
            startOffset: fullText.length,
            endOffset: fullText.length + node.textContent.length
        });
        fullText += node.textContent;
    }
    
    console.log(`[手動搜尋] 完整文字: "${fullText}"`);
    console.log(`[手動搜尋] 搜尋目標: "${targetText}"`);
    
    // 在完整文字中查詢目標
    const textIndex = fullText.indexOf(targetText);
    if (textIndex === -1) {
        console.warn('[手動搜尋] 未找到目標文字');
        return null;
    }
    
    const textEndIndex = textIndex + targetText.length;
    console.log(`[手動搜尋] 找到文字位置: ${textIndex} - ${textEndIndex}`);
    
    // 找到起始和結束的文位元組點
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    
    for (const nodeInfo of textNodes) {
        // 找到起始位置
        if (startNode === null && textIndex >= nodeInfo.startOffset && textIndex < nodeInfo.endOffset) {
            startNode = nodeInfo.node;
            startOffset = textIndex - nodeInfo.startOffset;
            console.log(`[手動搜尋] 起始節點: "${nodeInfo.node.textContent}" 偏移: ${startOffset}`);
        }
        
        // 找到結束位置
        if (textEndIndex > nodeInfo.startOffset && textEndIndex <= nodeInfo.endOffset) {
            endNode = nodeInfo.node;
            endOffset = textEndIndex - nodeInfo.startOffset;
            console.log(`[手動搜尋] 結束節點: "${nodeInfo.node.textContent}" 偏移: ${endOffset}`);
            break;
        }
    }
    
    if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        console.log('[手動搜尋] 成功建立Range');
        return range;
    }
    
    console.warn('[手動搜尋] 無法建立Range');
    return null;
}

// 綁定標準標註事件
function bindStandardAnnotationEvents(element, annotation, elementType, elementIdentifier) {
    if (element._annotationEventBound) return;
    
    element.addEventListener('click', function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const range = document.createRange();
        range.selectNodeContents(this);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        window.globalCurrentSelection = {
            text: this.textContent,
            range: range.cloneRange(),
            annotationId: this.dataset.annotationId,
            targetElement: this,
            subBlockId: elementIdentifier
        };
        
        const parentBlock = this.closest('[data-block-index]');
        if (parentBlock) {
            window.globalCurrentSelection.blockIndex = parentBlock.dataset.blockIndex;
        }
        
        if (typeof window.checkIfTargetIsHighlighted === 'function' &&
            typeof window.checkIfTargetHasNote === 'function' &&
            typeof window.updateContextMenuOptions === 'function' &&
            typeof window.showContextMenu === 'function') {
            const isHighlighted = window.checkIfTargetIsHighlighted(annotation.id, 'ocr', elementIdentifier, 'subBlockId');
            const hasNoteForClick = window.checkIfTargetHasNote(annotation.id, 'ocr', elementIdentifier, 'subBlockId');
            window.updateContextMenuOptions(isHighlighted, hasNoteForClick);
            window.showContextMenu(e.pageX, e.pageY);
        }
    });
    
    element._annotationEventBound = true;
    console.log('[事件綁定] 成功綁定標註事件到元素:', element);
}

// 應用結構化醒目提示（保持DOM結構）
function applyStructuredHighlight(range, annotation, className = 'structured-highlight') {
    if (!range || range.collapsed) {
        console.warn('[結構化醒目提示] Range無效或為空');
        return null;
    }
    
    try {
        // 建立醒目提示包裝器
        const highlightWrapper = document.createElement('span');
        highlightWrapper.className = className + ' annotated-sub-block';
        highlightWrapper.style.backgroundColor = getHighlightColor(annotation.highlightColor || 'yellow');
        highlightWrapper.style.borderRadius = '6px';
        highlightWrapper.style.boxShadow = `0 0 5px ${getHighlightColor(annotation.highlightColor || 'yellow')}`;
        highlightWrapper.style.padding = '0 3px';
        highlightWrapper.dataset.annotationId = annotation.id;
        
        // 新增筆記
        if (annotation.body && annotation.body.length > 0 && annotation.body[0].value) {
            highlightWrapper.title = annotation.body[0].value;
            highlightWrapper.classList.add('has-note');
        }
        
        // 提取幷包裝內容
        const contents = range.extractContents();
        highlightWrapper.appendChild(contents);
        
        // 插入醒目提示元素
        range.insertNode(highlightWrapper);
        
        console.log('[結構化醒目提示] 成功應用醒目提示:', highlightWrapper);
        return highlightWrapper;
        
    } catch (e) {
        console.error('[結構化醒目提示] 應用失敗:', e);
        return null;
    }
}

// ===== 新增：標準醒目提示應用函式 =====
function applyStandardHighlight(element, annotation, elementIdentifier, elementType) {
    const originalColor = annotation.highlightColor || 'yellow';
    const color = getHighlightColor(originalColor);
    const note = annotation.body && annotation.body.length > 0 && annotation.body[0].value ? annotation.body[0].value : '';

    // 清除元素上的已有樣式
    element.style.backgroundColor = '';
    element.style.border = '';
    element.style.padding = '';
    element.style.borderRadius = '';
    element.style.boxShadow = '';

    const katexDisplayElement = element.classList.contains('katex-display') ? element : element.querySelector('.katex-display');
    const imgElement = element.querySelector('img');
    let effectiveTableToStyle = null;

    if (element.tagName === 'TABLE') {
        effectiveTableToStyle = element;
    } else if (element.parentElement && element.parentElement.tagName === 'TABLE' &&
               element.classList.contains('sub-block') && element.dataset.subBlockId) {
        const parentTable = element.parentElement;
        const subBlockIdPrefix = element.dataset.subBlockId.split('.')[0];
        if (parentTable.dataset.blockIndex === subBlockIdPrefix) {
            effectiveTableToStyle = parentTable;
        } else {
            const tableInsideSpan = element.querySelector('table');
            if (tableInsideSpan) effectiveTableToStyle = tableInsideSpan;
        }
    } else {
        const tableInsideElement = element.querySelector('table');
        if (tableInsideElement) effectiveTableToStyle = tableInsideElement;
    }

    if (katexDisplayElement && !effectiveTableToStyle) {
        katexDisplayElement.style.border = '2px solid ' + color.replace('0.75)', '1)');
        katexDisplayElement.style.borderRadius = '12px';
        katexDisplayElement.style.padding = '8px';
        katexDisplayElement.style.backgroundColor = color;
        katexDisplayElement.style.display = 'block';
        katexDisplayElement.style.width = 'fit-content';
        katexDisplayElement.style.marginLeft = 'auto';
        katexDisplayElement.style.marginRight = 'auto';
        katexDisplayElement.style.boxShadow = `0 0 8px ${color}`;
    } else if (imgElement && !effectiveTableToStyle) {
        element.style.border = '3px solid ' + color.replace('0.75)', '1)');
        element.style.borderRadius = '12px';
        element.style.padding = '8px';
        element.style.backgroundColor = color.replace('0.75)', '0.1)');
        element.style.display = 'inline-block';
        element.style.boxShadow = `0 0 10px ${color}`;
    } else if (effectiveTableToStyle) {
        effectiveTableToStyle.style.border = '2px solid ' + color.replace('0.75)', '1)');
        effectiveTableToStyle.style.borderRadius = '12px';
        effectiveTableToStyle.style.padding = '8px';
        effectiveTableToStyle.style.backgroundColor = color.replace('0.75)', '0.1)');
        effectiveTableToStyle.style.display = 'block';
        effectiveTableToStyle.style.width = 'fit-content';
        effectiveTableToStyle.style.marginLeft = 'auto';
        effectiveTableToStyle.style.marginRight = 'auto';
    } else {
        element.style.backgroundColor = color;
        element.style.borderRadius = '6px';
        element.style.boxShadow = `0 0 5px ${color}`;
        element.style.padding = '0 3px';
    }

    element.classList.add(elementType === 'subBlock' ? 'annotated-sub-block' : 'annotated-block');
    if (note) {
        element.title = note;
        element.classList.add('has-note');
    }
    element.dataset.annotationId = annotation.id;

    // 綁定標準事件
    bindStandardAnnotationEvents(element, annotation, elementType, elementIdentifier);
}

// ===== 新增：標準標註事件綁定函式 =====
function bindStandardAnnotationEvents(element, annotation, elementType, elementIdentifier) {
    if (!element._annotationEventBound) {
        element.addEventListener('click', function handleClick(e) {
            e.preventDefault();
            e.stopPropagation();

            const range = document.createRange();
            range.selectNodeContents(this);

            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            window.globalCurrentSelection = {
                text: this.textContent,
                range: range.cloneRange(),
                annotationId: this.dataset.annotationId,
                targetElement: this
            };

            if (elementType === 'subBlock') {
                window.globalCurrentSelection.subBlockId = elementIdentifier;
                const parentBlock = this.closest('[data-block-index]');
                if (parentBlock) {
                    window.globalCurrentSelection.blockIndex = parentBlock.dataset.blockIndex;
                }
            } else {
                window.globalCurrentSelection.blockIndex = elementIdentifier;
            }

            const idToCheck = this.dataset.annotationId;
            const identifierForCheck = elementType === 'subBlock' ? window.globalCurrentSelection.subBlockId : window.globalCurrentSelection.blockIndex;
            const typeForCheck = elementType === 'subBlock' ? 'subBlockId' : 'blockIndex';

            if (typeof window.checkIfTargetIsHighlighted === 'function' &&
                typeof window.checkIfTargetHasNote === 'function' &&
                typeof window.updateContextMenuOptions === 'function' &&
                typeof window.showContextMenu === 'function') {

                const isHighlighted = window.checkIfTargetIsHighlighted(idToCheck, window.globalCurrentContentIdentifier, identifierForCheck, typeForCheck);
                const hasNoteForClick = window.checkIfTargetHasNote(idToCheck, window.globalCurrentContentIdentifier, identifierForCheck, typeForCheck);

                window.updateContextMenuOptions(isHighlighted, hasNoteForClick);
                window.showContextMenu(e.pageX, e.pageY);
            } else {
                console.error("[標註醒目提示] 上下文選單相關函式未找到");
            }
        });
        element._annotationEventBound = true;
    }
}

// ===== 新增：公式型別檢測函式 =====
function detectFormulaType(element) {
    const info = {
        hasFormula: false,
        type: null, // 'block', 'inline', 'mixed'
        elements: []
    };
    
    const katexDisplay = element.querySelector('.katex-display');
    const katexInline = element.querySelector('.katex-inline, .katex:not(.katex-display)');
    const hasKatex = element.classList.contains('katex-display') || element.classList.contains('katex');
    
    if (katexDisplay || hasKatex) {
        info.hasFormula = true;
        info.type = 'block';
        info.elements.push(katexDisplay || element);
    } else if (katexInline) {
        info.hasFormula = true;
        info.type = 'inline';
        info.elements.push(katexInline);
    }
    
    // 檢測混合內容（同時有行內和塊級公式）
    if (katexDisplay && katexInline) {
        info.type = 'mixed';
        info.elements = [katexDisplay, katexInline];
    }
    
    return info;
}

// ===== 新增：公式標註應用函式 =====
function applyFormulaAnnotation(element, annotation, contentIdentifier, elementIdentifier, elementType, formulaInfo) {
    const color = getHighlightColor(annotation.highlightColor || 'yellow');
    const note = annotation.body && annotation.body.length > 0 && annotation.body[0].value ? annotation.body[0].value : '';
    
    console.log(`[公式醒目提示] 應用公式標註，型別: ${formulaInfo.type}, 元素: ${elementType}`);
    
    switch (formulaInfo.type) {
        case 'block':
            applyBlockFormulaHighlight(element, annotation, formulaInfo.elements[0], color, note);
            break;
        case 'inline':
            applyInlineFormulaHighlight(element, annotation, formulaInfo.elements[0], color, note);
            break;
        case 'mixed':
            applyMixedFormulaHighlight(element, annotation, formulaInfo.elements, color, note);
            break;
        default:
            // 降級到標準醒目提示
            applyStandardHighlight(element, annotation, elementIdentifier, elementType);
    }
    
    // 新增公式標註標識
    element.classList.add('annotated-formula', elementType === 'subBlock' ? 'annotated-sub-block' : 'annotated-block');
    element.dataset.annotationId = annotation.id;
    
    if (note) {
        element.title = note;
        element.classList.add('has-note');
    }
    
    // 綁定事件
    bindFormulaAnnotationEvents(element, annotation, contentIdentifier, elementIdentifier, elementType);
}

// ===== 新增：塊級公式醒目提示 =====
function applyBlockFormulaHighlight(element, annotation, formulaElement, color, note) {
    const targetFormula = formulaElement || element;
    
    // 增強的邊框和陰影效果
    targetFormula.style.border = `3px solid ${color.replace('0.75)', '1)')}`;  // 更不透明的邊框
    targetFormula.style.borderRadius = '12px';
    targetFormula.style.padding = '12px';
    targetFormula.style.margin = '8px 0';
    targetFormula.style.boxShadow = `0 0 12px ${color.replace('0.75)', '0.4)')}, inset 0 0 0 1px ${color.replace('0.75)', '0.2)')}`;  // 內外陰影
    targetFormula.style.backgroundColor = color.replace('0.75)', '0.05)');  // 極淡的背景色
    
    // 新增動畫效果
    targetFormula.style.transition = 'all 0.2s ease';
    
    console.log(`[公式醒目提示] 塊級公式醒目提示已應用，顏色: ${color}`);
}

// ===== 新增：行內公式醒目提示 =====
function applyInlineFormulaHighlight(element, annotation, formulaElement, color, note) {
    const targetFormula = formulaElement || element;
    
    // 行內公式使用更輕量的樣式
    targetFormula.style.border = `2px solid ${color.replace('0.75)', '0.8)')}`;  
    targetFormula.style.borderRadius = '6px';
    targetFormula.style.padding = '2px 6px';
    targetFormula.style.margin = '0 2px';
    targetFormula.style.backgroundColor = color.replace('0.75)', '0.1)');  
    targetFormula.style.boxShadow = `0 0 4px ${color.replace('0.75)', '0.3)')}`;  
    
    console.log(`[公式醒目提示] 行內公式醒目提示已應用`);
}

// ===== 新增：混合公式醒目提示 =====
function applyMixedFormulaHighlight(element, annotation, formulaElements, color, note) {
    // 為包含元素新增整體邊框
    element.style.border = `2px dashed ${color.replace('0.75)', '0.6)')}`;  
    element.style.borderRadius = '8px';
    element.style.padding = '8px';
    element.style.backgroundColor = color.replace('0.75)', '0.03)');  
    
    // 為每個公式元素新增獨立醒目提示
    formulaElements.forEach(formula => {
        if (formula.classList.contains('katex-display')) {
            applyBlockFormulaHighlight(null, annotation, formula, color, note);
        } else {
            applyInlineFormulaHighlight(null, annotation, formula, color, note);
        }
    });
    
    console.log(`[公式醒目提示] 混合公式醒目提示已應用，包含 ${formulaElements.length} 個公式`);
}

// ===== 新增：公式標註事件綁定 =====
function bindFormulaAnnotationEvents(element, annotation, contentIdentifier, elementIdentifier, elementType) {
    if (!element._annotationEventBound) {
        element.addEventListener('click', function handleFormulaClick(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // 公式選擇策略：選擇整個包含元素
            const range = document.createRange();
            range.selectNodeContents(this);
            
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            window.globalCurrentSelection = {
                text: this.textContent,
                range: range.cloneRange(),
                annotationId: this.dataset.annotationId,
                targetElement: this,
                isFormula: true  // 標識這是公式選擇
            };
            
            if (elementType === 'subBlock') {
                window.globalCurrentSelection.subBlockId = elementIdentifier;
                const parentBlock = this.closest('[data-block-index]');
                if (parentBlock) {
                    window.globalCurrentSelection.blockIndex = parentBlock.dataset.blockIndex;
                }
            } else {
                window.globalCurrentSelection.blockIndex = elementIdentifier;
            }
            
            console.log(`[公式醒目提示] 公式${elementType}點選，全域選區已設定`);
            
            // 呼叫上下文選單
            if (typeof window.checkIfTargetIsHighlighted === 'function' &&
                typeof window.checkIfTargetHasNote === 'function' &&
                typeof window.updateContextMenuOptions === 'function' &&
                typeof window.showContextMenu === 'function') {
                
                const idToCheck = this.dataset.annotationId;
                const identifierForCheck = elementType === 'subBlock' ? window.globalCurrentSelection.subBlockId : window.globalCurrentSelection.blockIndex;
                const typeForCheck = elementType === 'subBlock' ? 'subBlockId' : 'blockIndex';
                
                const isHighlighted = window.checkIfTargetIsHighlighted(idToCheck, contentIdentifier, identifierForCheck, typeForCheck);
                const hasNoteForClick = window.checkIfTargetHasNote(idToCheck, contentIdentifier, identifierForCheck, typeForCheck);
                
                window.updateContextMenuOptions(isHighlighted, hasNoteForClick);
                window.showContextMenu(e.pageX, e.pageY);
            }
        });
        
        // 公式懸停效果
        element.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.02)';
            this.style.zIndex = '10';
        });
        
        element.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.zIndex = '';
        });
        
        element._annotationEventBound = true;
    }
}


/**
 * 將顏色轉換為更淺的熒光版本
 * @param {string} color - 原始顏色
 * @returns {string} - 轉換後的熒光淺色
 */
function getHighlightColor(color) {
    // 顏色對映表 - 確保與CSS中的顏色比對，調整亮度平衡
    const colorMap = {
        'yellow': 'rgba(255, 255, 0, 0.75)',      // 增加不透明度
        'pink': 'rgba(253, 170, 200, 0.75)',      // 增加不透明度
        'lightblue': 'rgba(95, 211, 250, 0.75)',  // 增加不透明度
        'blue': 'rgba(95, 211, 250, 0.75)',       // 增加不透明度
        'lightgreen': 'rgba(178, 253, 178, 0.75)',// 增加不透明度
        'green': 'rgba(178, 253, 178, 0.75)',     // 增加不透明度
        'purple': 'rgba(221, 160, 221, 0.75)',    // 增加不透明度
        'orange': 'rgba(255, 165, 0, 0.75)',      // 增加不透明度
        'red': 'rgba(255, 99, 71, 0.75)',         // 增加不透明度
        'cyan': 'rgba(0, 204, 204, 0.75)'         // 增加不透明度
    };

    // 如果是常見顏色，使用對映表
    if (colorMap[color.toLowerCase()]) {
        return colorMap[color.toLowerCase()];
    }

    // 如果是十六進位制顏色，轉換為半透明的RGBA
    if (color.startsWith('#')) {
        let r = 0, g = 0, b = 0;
        if (color.length === 4) {
            // #RGB格式
            r = parseInt(color[1] + color[1], 16);
            g = parseInt(color[2] + color[2], 16);
            b = parseInt(color[3] + color[3], 16);
        } else if (color.length === 7) {
            // #RRGGBB格式
            r = parseInt(color.substring(1, 3), 16);
            g = parseInt(color.substring(3, 5), 16);
            b = parseInt(color.substring(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, 0.75)`;
    }

    // 如果是RGB或RGBA格式，轉換為更透明的版本
    if (color.startsWith('rgb')) {
        if (color.startsWith('rgba')) {
            // 已經是RGBA格式，調整其不透明度
            const rgbaMatch = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
            if (rgbaMatch) {
                const [, r, g, b, a] = rgbaMatch;
                // 調整不透明度，最小0.75
                const newAlpha = Math.max(parseFloat(a), 0.75);
                return `rgba(${r}, ${g}, ${b}, ${newAlpha})`;
            }
        } else {
            // RGB格式，轉換為RGBA
            const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
            if (rgbMatch) {
                const [, r, g, b] = rgbMatch;
                return `rgba(${r}, ${g}, ${b}, 0.75)`;
            }
        }
    }

    // 預設返回與CSS比對的黃色醒目提示
    return 'rgba(255, 255, 0, 0.75)';
}

// ========== 新增：單個塊/子塊醒目提示/取消醒目提示 ==========
/**
 * 只醒目提示一個塊或子塊
 * @param {HTMLElement} element - 目標DOM元素
 * @param {Object} annotation - 批註物件
 * @param {string} contentIdentifier - 內容識別符號 ('ocr' 或 'translation')
 * @param {string} elementIdentifier - 元素識別符號 (blockIndex 或 subBlockId)
 * @param {'block'|'subBlock'} elementType - 元素型別
 */
function highlightBlockOrSubBlock(element, annotation, contentIdentifier, elementIdentifier, elementType) {
    applyAnnotationToElement(element, annotation, contentIdentifier, elementIdentifier, elementType);
}

/**
 * 只移除一個塊或子塊的醒目提示
 * @param {HTMLElement} element - 目標DOM元素
 */
function removeHighlightFromBlockOrSubBlock(element) {
    if (!element) return;
    element.style.backgroundColor = '';
    element.style.border = '';
    element.style.padding = '';
    element.style.borderRadius = '';
    element.style.boxShadow = '';
    element.classList.remove('annotated-block', 'annotated-sub-block', 'has-note', 'has-highlight');
    element.removeAttribute('title');
    element.removeAttribute('data-annotation-id');
    element.removeAttribute('data-highlight-color');
    // 還原特殊元素樣式（如有）
    const katexDisplayElement = element.classList.contains('katex-display') ? element : element.querySelector('.katex-display');
    const imgElement = element.querySelector('img');
    const tableElement = element.tagName === 'TABLE' ? element : element.querySelector('table');
    [katexDisplayElement, imgElement, tableElement].forEach(el => {
        if (el) {
            el.style.border = '';
            el.style.padding = '';
            el.style.display = '';
            el.style.width = '';
            el.style.marginLeft = '';
            el.style.marginRight = '';
            el.style.borderRadius = '';
            el.style.boxShadow = '';
        }
    });
}

// 暴露新函式
window.applyBlockAnnotations = applyBlockAnnotations;

// 暫時保留舊的函式別名以便相容 (儘管其內部邏輯已更新)
window.applyParagraphAnnotations = applyBlockAnnotations;

// 移除原始的applyPreprocessedAnnotations (如果存在)
if (window.applyPreprocessedAnnotations) {
    delete window.applyPreprocessedAnnotations;
}

// 匯出到 window
window.highlightBlockOrSubBlock = highlightBlockOrSubBlock;
window.removeHighlightFromBlockOrSubBlock = removeHighlightFromBlockOrSubBlock;

// ===== 新增：跨子塊標註渲染函式 =====
function applyCrossBlockAnnotation(containerElement, annotation, contentIdentifier) {
    if (!annotation.target || !annotation.target.selector || !annotation.target.selector[0]) {
        console.warn('[跨子塊醒目提示] 標註資料結構不完整:', annotation);
        return;
    }

    const selector = annotation.target.selector[0];
    const affectedSubBlocks = selector.affectedSubBlocks || [];

    if (affectedSubBlocks.length === 0) {
        console.warn('[跨子塊醒目提示] 沒有找到影響的子塊:', annotation);
        return;
    }

    const __DEBUG__ = (function(){
        try { return !!(window && (window.ENABLE_ANNOTATION_DEBUG || localStorage.getItem('ENABLE_ANNOTATION_DEBUG') === 'true')); } catch { return false; }
    })();
    if (__DEBUG__) console.log(`[跨子塊醒目提示] 渲染跨子塊標註，影響 ${affectedSubBlocks.length} 個子塊:`, affectedSubBlocks);

    const color = getHighlightColor(annotation.highlightColor || 'yellow');
    const note = annotation.body && annotation.body.length > 0 && annotation.body[0].value ? annotation.body[0].value : '';

    let startId = selector.startSubBlockId || affectedSubBlocks[0];
    let endId = selector.endSubBlockId || affectedSubBlocks[affectedSubBlocks.length - 1];
    let hasStartOffset = Number.isFinite(selector.startOffset);
    let hasEndOffset = Number.isFinite(selector.endOffset);
    let startOffset = hasStartOffset ? selector.startOffset : 0;
    let endOffset = hasEndOffset ? selector.endOffset : 0;
    
    // 防禦性檢查：如果endOffset為0且不是單字元選擇，可能有問題
    if (hasEndOffset && endOffset === 0 && startId !== endId) {
        console.warn(`[跨子塊醒目提示] endOffset為0但這是跨子塊選擇，可能有資料問題`, {
            startId, endId, startOffset, endOffset, affectedSubBlocks
        });
        // 嘗試從容器中計算endOffset
        const endBlockIndex = endId.split('.')[0];
        const endElement = containerElement.querySelector(`[data-sub-block-id="${endId}"]`) || 
                          containerElement.querySelector(`[data-block-index="${endBlockIndex}"]`);
        if (endElement) {
            const endText = extractTextIgnoringFormulas(endElement);
            console.log(`[跨子塊醒目提示] 尾元素文字長度: ${endText.length}, 設定endOffset為文字長度`);
            endOffset = endText.length;
            hasEndOffset = true;
        }
    }

    // 可選：使用 exact 精準對齊（若存在）
    if (selector.exact && typeof selector.exact === 'string') {
        const texts = [];
        for (const id of affectedSubBlocks) {
            const el = containerElement.querySelector(`[data-sub-block-id="${id}"]`);
            texts.push(el ? (el.textContent || '') : '');
        }
        const combined = texts.join('');
        const exact = selector.exact;

        // 先嚐試直接比對
        let pos = combined.indexOf(exact);
        let used = 'direct';
        if (pos === -1) {
            // 忽略空白比對
            const isWs = (ch) => /[\s\u200B-\u200D\uFEFF]/.test(ch);
            const buildNormalized = (s) => {
                const norm = [];
                const map = [];
                for (let i = 0; i < s.length; i++) {
                    const ch = s[i];
                    if (!isWs(ch)) { norm.push(ch); map.push(i); }
                }
                return { norm: norm.join(''), map };
            };
            const comb = buildNormalized(combined);
            const ex = buildNormalized(exact);
            const posNorm = comb.norm.indexOf(ex.norm);
            if (posNorm !== -1) {
                const origStart = comb.map[posNorm];
                const origEndExclusive = comb.map[posNorm + ex.norm.length - 1] + 1;
                pos = origStart;
                used = 'ignore-space';
                // 對映為子塊與偏移
                let acc = 0, startBlockIdx = 0, localStart = 0;
                for (let i = 0; i < texts.length; i++) {
                    const L = texts[i].length;
                    if (origStart < acc + L) { startBlockIdx = i; localStart = origStart - acc; break; }
                    acc += L;
                }
                const endGlobal = origEndExclusive;
                acc = 0; let endBlockIdx = texts.length - 1; let localEnd = texts[endBlockIdx].length;
                for (let i = 0; i < texts.length; i++) {
                    const L = texts[i].length;
                    if (endGlobal <= acc + L) { endBlockIdx = i; localEnd = endGlobal - acc; break; }
                    acc += L;
                }
                startId = affectedSubBlocks[startBlockIdx];
                endId = affectedSubBlocks[endBlockIdx];
                startOffset = localStart;
                endOffset = localEnd;
                hasStartOffset = true;
                hasEndOffset = true;
            }
        }
        if (pos !== -1) {
            // 若是直接比對路徑，需要從 pos 反推子塊與偏移
            if (used === 'direct') {
                let acc = 0, startBlockIdx = 0, localStart = 0;
                for (let i = 0; i < texts.length; i++) {
                    const L = texts[i].length;
                    if (pos < acc + L) { startBlockIdx = i; localStart = pos - acc; break; }
                    acc += L;
                }
                const endGlobal = pos + exact.length;
                acc = 0; let endBlockIdx = texts.length - 1; let localEnd = texts[endBlockIdx].length;
                for (let i = 0; i < texts.length; i++) {
                    const L = texts[i].length;
                    if (endGlobal <= acc + L) { endBlockIdx = i; localEnd = endGlobal - acc; break; }
                    acc += L;
                }
                startId = affectedSubBlocks[startBlockIdx];
                endId = affectedSubBlocks[endBlockIdx];
                startOffset = localStart;
                endOffset = localEnd;
                hasStartOffset = true;
                hasEndOffset = true;
            }
            if (__DEBUG__) console.log(`[跨子塊對齊] 使用 exact(${used === 'direct' ? '直接' : '忽略空白'}) 重算偏移:`, { startId, endId, startOffset, endOffset });
        }
    }

    // 只對[startId..endId]之間的子塊應用醒目提示
    let startIdxInList = affectedSubBlocks.indexOf(startId);
    let endIdxInList = affectedSubBlocks.lastIndexOf(endId);
    
    // 改進：處理 exact 重計算導致的 ID 不比對問題
    if (startIdxInList === -1 || endIdxInList === -1) {
        console.warn(`[跨子塊醒目提示] startId(${startId})或endId(${endId})不在affectedSubBlocks中，使用全部子塊`);
        console.warn('[跨子塊醒目提示] 這通常是exact重計算導致的問題');
        startIdxInList = 0;
        endIdxInList = affectedSubBlocks.length - 1;
    }
    
    const effectiveSubBlocks = affectedSubBlocks.slice(startIdxInList, endIdxInList + 1);
    
    if (__DEBUG__) {
        console.log('[跨子塊除錯] effectiveSubBlocks計算:', {
            affectedSubBlocks: affectedSubBlocks,
            startId: startId,
            endId: endId,
            startIdxInList: startIdxInList,
            endIdxInList: endIdxInList,
            effectiveCount: effectiveSubBlocks.length,
            effectiveSubBlocks: effectiveSubBlocks
        });
    }

    // 為每個有效子塊應用跨子塊醒目提示樣式（首尾按偏移做部分醒目提示）
    let firstSubBlock = null;
    let lastSubBlock = null;
    const createdHighlightElements = [];

    effectiveSubBlocks.forEach((subBlockId, index) => {
        // 查詢子塊元素；若不存在，嘗試塊級元素（虛擬子塊）
        // 優先比對真實子塊，再回退虛擬子塊或塊級元素
        let subBlockElement = containerElement.querySelector(`.sub-block[data-sub-block-id="${subBlockId}"]`) ||
                               containerElement.querySelector(`[data-sub-block-id="${subBlockId}"]`);
        if (!subBlockElement) {
            const blockIndex = subBlockId.split('.')[0];
            subBlockElement = containerElement.querySelector(`[data-block-index="${blockIndex}"]`);
            if (__DEBUG__) console.log(`[跨子塊醒目提示] 透過塊級元素查詢: data-block-index="${blockIndex}"`, subBlockElement);
            
            // 如果還是找不到，嘗試查詢虛擬子塊
            if (!subBlockElement) {
                // 查詢具有虛擬子塊ID的元素
                subBlockElement = containerElement.querySelector(`[data-sub-block-id*="${blockIndex}."]`);
                if (subBlockElement && __DEBUG__) console.log(`[跨子塊醒目提示] 透過虛擬子塊查詢找到:`, subBlockElement);
                
                // 最後嘗試：查詢任何包含該塊索引的元素
                if (!subBlockElement) {
                    const allElements = containerElement.querySelectorAll('[data-block-index], [data-sub-block-id]');
                    for (const el of allElements) {
                        const elBlockIndex = el.dataset.blockIndex || el.dataset.subBlockId?.split('.')[0];
                        if (elBlockIndex === blockIndex) {
                            subBlockElement = el;
                            if (__DEBUG__) console.log(`[跨子塊醒目提示] 透過走訪找到比對元素:`, el);
                            break;
                        }
                    }
                }
            }
        }

        if (!subBlockElement) {
            console.warn(`[跨子塊醒目提示] 找不到子塊元素: ${subBlockId}`);
            return;
        }

        if (index === 0) firstSubBlock = subBlockElement;
        if (index === effectiveSubBlocks.length - 1) lastSubBlock = subBlockElement;

        const isRealSubBlock = subBlockElement.classList && subBlockElement.classList.contains('sub-block');
        if (__DEBUG__ && (subBlockId === startId || subBlockId === endId)) {
            const t = subBlockElement.textContent || '';
            if (subBlockId === startId && hasStartOffset) {
                console.log(`[跨子塊除錯] 首子塊(${startId}) 長度=${t.length}, startOffset=${startOffset}, 邊界字元='${t[startOffset]||''}'(#${t.charCodeAt(startOffset)||''})`);
            }
            if (subBlockId === endId && hasEndOffset) {
                console.log(`[跨子塊除錯] 尾子塊(${endId}) 長度=${t.length}, endOffset=${endOffset}, 邊界字元='${t[endOffset-1]||''}'(#${t.charCodeAt(endOffset-1)||''})`);
            }
        }

        // 單子塊跨塊場景：僅在同一子塊內區域性醒目提示
        if (hasStartOffset && hasEndOffset && startId === endId && subBlockId === startId) {
            const created = applyPartialCrossBlockHighlight(subBlockElement, annotation, color, note, startOffset, endOffset, index, effectiveSubBlocks.length, true, contentIdentifier);
            if (index === 0 && created) created.id = `ann-${annotation.id}`;
            if (created) createdHighlightElements.push(created);
            return;
        }

        // 首子塊：從 startOffset 到末尾
        if (hasStartOffset && subBlockId === startId) {
            const fullLen = (subBlockElement.textContent || '').length;
            const safeStart = Math.max(0, Math.min(startOffset, fullLen));
            const created = applyPartialCrossBlockHighlight(subBlockElement, annotation, color, note, safeStart, fullLen, index, effectiveSubBlocks.length, true, contentIdentifier);
            if (index === 0 && created) created.id = `ann-${annotation.id}`;
            if (created) createdHighlightElements.push(created);
            return;
        }

        // 尾子塊：從0到 endOffset
        if (hasEndOffset && subBlockId === endId) {
            const fullLen = (subBlockElement.textContent || '').length;
            const safeEnd = Math.max(0, Math.min(endOffset, fullLen));
            const created = applyPartialCrossBlockHighlight(subBlockElement, annotation, color, note, 0, safeEnd, index, effectiveSubBlocks.length, true, contentIdentifier);
            if (index === 0 && created) created.id = `ann-${annotation.id}`;
            if (created) createdHighlightElements.push(created);
            return;
        }

        // 中間子塊或虛擬子塊：整塊醒目提示
        const created = applyCrossBlockHighlightStyle(subBlockElement, annotation, color, note, index, effectiveSubBlocks.length);
        if (index === 0 && created) created.id = `ann-${annotation.id}`;
        if (created) createdHighlightElements.push(created);
    });

    // 為所有建立的醒目提示元素綁定事件（任意片段點選都可重新選擇整段）
    if (createdHighlightElements.length) {
        createdHighlightElements.forEach(el => bindCrossBlockAnnotationEvents(el, annotation, contentIdentifier, effectiveSubBlocks));
    } else if (firstSubBlock) {
        // 兜底：至少綁定在首子塊
        bindCrossBlockAnnotationEvents(firstSubBlock, annotation, contentIdentifier, effectiveSubBlocks);
    }

    // 除錯自檢：拼接已醒目提示文字與 exact 比對
    const __DEBUG__CHECK__ = (function(){
        try { return !!(window && (window.ENABLE_ANNOTATION_DEBUG || localStorage.getItem('ENABLE_ANNOTATION_DEBUG') === 'true')); } catch { return false; }
    })();
    if (__DEBUG__CHECK__ && selector.exact) {
        try {
            const spans = [];
            effectiveSubBlocks.forEach(id => {
                const host = containerElement.querySelector(`[data-sub-block-id="${id}"]`) || containerElement.querySelector(`[data-block-index="${String(id).split('.')[0]}"]`);
                if (!host) return;
                // 包含 host 自身（用於整塊醒目提示的中間段）
                if (host.matches && host.matches(`[data-annotation-id="${annotation.id}"]`)) spans.push(host);
                const nodes = host.querySelectorAll(`[data-annotation-id="${annotation.id}"]`);
                nodes.forEach(n => spans.push(n));
            });
            const actual = spans.map(s => s.textContent || '').join('');
            
            // 更寬容的文字比較：提取純文字內容進行比較
            const extractPureText = (text) => {
                return String(text)
                    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ') // 標準化空白
                    .replace(/\s+/g, ' ') // 多個空格合併為一個
                    .trim();
            };
            
            const expectedPure = extractPureText(selector.exact);
            const actualPure = extractPureText(actual);
            
            const ok = expectedPure === actualPure;
            if (!ok) {
                console.warn('[跨子塊自檢] 醒目提示結果與 exact 不一致', {
                    annId: annotation.id,
                    startId, endId, startOffset, endOffset,
                    expectedPreview: expectedPure.substring(0, 80),
                    actualPreview: actualPure.substring(0, 80),
                    expectedLength: expectedPure.length,
                    actualLength: actualPure.length,
                    spans: spans.length
                });
            } else {
                console.log('[跨子塊自檢] 醒目提示結果與 exact 一致');
            }
        } catch (e) {
            console.warn('[跨子塊自檢] 檢查失敗:', e);
        }
    }
}

// 在子塊內部應用"部分"跨子塊醒目提示（使用字元偏移切分）
function applyPartialCrossBlockHighlight(element, annotation, color, note, start, end, position, totalCount, isCrossBlock = true, contentIdentifier = null) {
    const text = element.textContent || '';
    const isInFormula = (n) => {
        let p = n && (n.nodeType === Node.TEXT_NODE ? n.parentElement : n);
        while (p) {
            if (p.classList && (
                p.classList.contains('katex') ||
                p.classList.contains('katex-display') ||
                p.classList.contains('katex-inline') ||
                p.classList.contains('reference-citation')  // 保護參考連結
            )) return true;
            p = p.parentElement;
        }
        return false;
    };
    const lenExcludingFormula = (() => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let len = 0, node; while ((node = walker.nextNode())) { if (!isInFormula(node)) len += (node.nodeValue || '').length; }
        return len;
    })();
    let s = Math.max(0, Math.min(start, lenExcludingFormula));
    let e = Math.max(0, Math.min(end, lenExcludingFormula));
    if (e <= s) return;

    // 輕量邊界吸附：去除邊界處不可見空白，避免看起來“多出一點”
    const isWs = (ch) => /[\s\u00A0\u200B-\u200D\uFEFF]/.test(ch);
    // 注意：s/e 是“忽略公式”的字元座標，需要在真實文位元組點上對映
    if (e <= s) return;

    // 將“忽略公式”的 s/e 對映到真實文位元組點位置（跳過公式）
    const mapOffsetToNode = (root, charOffset) => {
        let remaining = charOffset;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (isInFormula(node)) continue;
            const l = node.nodeValue ? node.nodeValue.length : 0;
            if (remaining <= l) return { node, offset: remaining };
            remaining -= l;
        }
        return null;
    };
    const startPos = mapOffsetToNode(element, s);
    const endPos = mapOffsetToNode(element, e);
    if (!startPos || !endPos) return;

    // 文位元組點內精確包裹（不穿公式）
    const wrapTextRange = (node, from, to) => {
        if (!node || to <= from) return null;
        const full = node.nodeValue || '';
        const before = full.slice(0, from);
        const mid = full.slice(from, to);
        const after = full.slice(to);
        const parent = node.parentNode;
        if (!parent) return null;
        const textBefore = before ? document.createTextNode(before) : null;
        const textAfter = after ? document.createTextNode(after) : null;
        const span = document.createElement('span');
        if (isCrossBlock) {
            span.className = 'cross-block-highlight annotated-sub-block';
            applyCrossBlockHighlightStyle(span, annotation, color, note, position, totalCount);
        } else {
            span.className = 'partial-subblock-highlight annotated-sub-block';
            span.style.backgroundColor = color;
            span.style.borderRadius = '6px';
            span.style.boxShadow = `0 0 5px ${color}`;
            span.style.padding = '0 3px';
            span.dataset.annotationId = annotation.id;
            if (note) { span.title = note; span.classList.add('has-note'); }
            bindStandardAnnotationEvents(span, annotation, 'subBlock', element.dataset && element.dataset.subBlockId ? element.dataset.subBlockId : undefined);
        }
        span.textContent = mid;
        parent.replaceChild(span, node);
        if (textAfter) parent.insertBefore(textAfter, span.nextSibling);
        if (textBefore) parent.insertBefore(textBefore, span);
        return span;
    };

    // 對起止節點進行包裹
    const createdSpans = [];
    if (startPos.node === endPos.node) {
        const created = wrapTextRange(startPos.node, startPos.offset, endPos.offset);
        if (created) createdSpans.push(created);
    } else {
        // 修復：在任何替換髮生之前，先收集“忽略公式”的所有文位元組點，
        //       並定位起止節點的索引，避免因替換導致走訪起點丟失。
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        let n;
        while ((n = walker.nextNode())) {
            if (isInFormula(n)) continue;
            textNodes.push(n);
        }

        const startIndex = textNodes.indexOf(startPos.node);
        const endIndex = textNodes.indexOf(endPos.node);
        if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
            // 兜底：若無法定位，保持舊邏輯（至少醒目提示首尾）
            const sNode = startPos.node;
            const sLen = (sNode.nodeValue || '').length;
            const firstSpan = wrapTextRange(sNode, startPos.offset, sLen);
            if (firstSpan) createdSpans.push(firstSpan);
            const lastSpan = wrapTextRange(endPos.node, 0, endPos.offset);
            if (lastSpan) createdSpans.push(lastSpan);
        } else {
            // 起點節點：from startOffset 到節點末尾
            const sNode = textNodes[startIndex];
            const sLen = (sNode.nodeValue || '').length;
            const firstSpan = wrapTextRange(sNode, startPos.offset, sLen);
            if (firstSpan) createdSpans.push(firstSpan);

            // 中間文位元組點：整段包裹（startIndex+1 ... endIndex-1）
            for (let i = startIndex + 1; i < endIndex; i++) {
                const midNode = textNodes[i];
                const fullLen = (midNode.nodeValue || '').length;
                const midSpan = wrapTextRange(midNode, 0, fullLen);
                if (midSpan) createdSpans.push(midSpan);
            }

            // 終點節點：從 0 到 endOffset
            const eNode = textNodes[endIndex];
            const lastSpan = wrapTextRange(eNode, 0, endPos.offset);
            if (lastSpan) createdSpans.push(lastSpan);
        }
    }

    // 精確的公式範圍檢測：只醒目提示真正在選擇範圍內的公式
    try {
        // 基於DOM位置精確判斷公式是否在選擇範圍內
        const isElementInRange = (targetElement) => {
            if (!createdSpans.length) return false;
            
            // 獲取選擇範圍的邊界
            const firstSpan = createdSpans[0];
            const lastSpan = createdSpans[createdSpans.length - 1];
            
            // 使用 compareDocumentPosition 進行精確的DOM位置比較
            const compareResult1 = targetElement.compareDocumentPosition(firstSpan);
            const compareResult2 = targetElement.compareDocumentPosition(lastSpan);
            
            // 檢查元素是否在選擇範圍內
            // DOCUMENT_POSITION_FOLLOWING (4): firstSpan在targetElement之後
            // DOCUMENT_POSITION_PRECEDING (2): lastSpan在targetElement之前
            const afterStart = (compareResult1 & Node.DOCUMENT_POSITION_FOLLOWING) || targetElement === firstSpan || firstSpan.contains(targetElement);
            const beforeEnd = (compareResult2 & Node.DOCUMENT_POSITION_PRECEDING) || targetElement === lastSpan || lastSpan.contains(targetElement);
            
            return afterStart && beforeEnd;
        };
        
        // 找出真正在範圍內的公式
        const formulas = element.querySelectorAll('.katex, .katex-display, .katex-inline');
        formulas.forEach(formula => {
            if (isElementInRange(formula)) {
                console.log('[精確公式醒目提示] 公式在範圍內，應用醒目提示:', formula);
                const formulaType = formula.classList.contains('katex-display') ? 'block' : 'inline';
                applyFormulaAnnotation(formula, annotation, contentIdentifier, element.dataset?.subBlockId, 'subBlock', { 
                    hasFormula: true, 
                    type: formulaType, 
                    elements: [formula] 
                });
            } else {
                console.log('[精確公式醒目提示] 公式不在範圍內，跳過:', formula);
            }
        });
    } catch (e) {
        console.warn('[公式醒目提示] 精確公式範圍檢測失敗:', e);
    }

    return createdSpans[0] || null;
}

// ===== 新增：跨子塊醒目提示樣式應用 =====
function applyCrossBlockHighlightStyle(element, annotation, color, note, position, totalCount) {
    // 基礎醒目提示樣式
    element.style.backgroundColor = color;
    // 跨子塊醒目提示不加水平內邊距，避免視覺上“吃到”前後字元
    element.style.padding = '0';
    element.classList.add('cross-block-highlight', 'annotated-sub-block');
    element.dataset.annotationId = annotation.id;
    
    if (note) {
        element.title = note;
        element.classList.add('has-note');
    }
    
    // 根據位置應用不同的邊框樣式，創造連續效果
    if (totalCount === 1) {
        // 單個子塊
        element.style.borderRadius = '6px';
        element.style.boxShadow = `0 0 5px ${color}`;
    } else if (position === 0) {
        // 第一個子塊
        element.style.borderRadius = '6px 0 0 6px';
        element.style.boxShadow = `0 0 3px ${color}`;
    } else if (position === totalCount - 1) {
        // 最後一個子塊
        element.style.borderRadius = '0 6px 6px 0';
        element.style.boxShadow = `0 0 3px ${color}`;
    } else {
        // 中間的子塊
        element.style.borderRadius = '0';
        element.style.boxShadow = `0 0 2px ${color}`;
    }
    
    // 新增跨子塊標識
    element.style.position = 'relative';
    if (position === 0) {
        // 只在第一個子塊新增標識
        const indicator = document.createElement('span');
        indicator.className = 'cross-block-indicator';
        indicator.style.cssText = `
            position: absolute;
            top: -8px;
            left: -4px;
            background: ${color.replace('0.75)', '1)')};
            color: white;
            font-size: 10px;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: bold;
            pointer-events: none;
            z-index: 10;
        `;
        indicator.textContent = `跨${totalCount}`;
        element.appendChild(indicator);
    }
    return element;
}

// ===== 新增：跨子塊標註事件綁定 =====
function bindCrossBlockAnnotationEvents(element, annotation, contentIdentifier, affectedSubBlocks) {
    if (!element._crossBlockAnnotationEventBound) {
        element.addEventListener('click', function handleCrossBlockClick(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // 建立跨子塊選區
            // 優先使用實際建立的醒目提示片段作為邊界
            const allParts = document.querySelectorAll(`[data-annotation-id="${annotation.id}"]\.cross-block-highlight`);
            const firstPart = allParts && allParts.length ? allParts[0] : null;
            const lastPart = allParts && allParts.length ? allParts[allParts.length - 1] : null;
            const firstSubBlock = document.querySelector(`[data-sub-block-id="${affectedSubBlocks[0]}"]`);
            const lastSubBlock = document.querySelector(`[data-sub-block-id="${affectedSubBlocks[affectedSubBlocks.length - 1]}"]`);

            if ((firstPart && lastPart) || (firstSubBlock && lastSubBlock)) {
                const range = document.createRange();
                if (firstPart && lastPart) {
                    range.setStartBefore(firstPart);
                    range.setEndAfter(lastPart);
                } else {
                    range.setStartBefore(firstSubBlock);
                    range.setEndAfter(lastSubBlock);
                }
                
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                
                window.globalCurrentSelection = {
                    text: selection.toString(),
                    range: range.cloneRange(),
                    annotationId: annotation.id,
                    targetElement: this,
                    isCrossBlock: true,
                    affectedSubBlocks: affectedSubBlocks.map(id => ({ subBlockId: id }))
                };
                
                console.log(`[跨子塊醒目提示] 跨子塊標註點選，已設定全域選區`);
                
                // 呼叫上下文選單
                if (typeof window.updateCrossBlockContextMenuOptions === 'function' &&
                    typeof window.showContextMenu === 'function') {
                    
                    const isHighlighted = true; // 當前已醒目提示
                    const hasNote = annotation.body && annotation.body.length > 0 && annotation.body[0].value && annotation.body[0].value.trim() !== '';
                    
                    window.updateCrossBlockContextMenuOptions(isHighlighted, hasNote);
                    window.showContextMenu(e.pageX, e.pageY);
                }
            }
        });
        
        element._crossBlockAnnotationEventBound = true;
    }
}

// ===== 新增：滾動到批註位置 =====
function scrollToAnnotation(annotationId, smooth = true) {
    // 優先錨點元素
    let target = document.getElementById(`ann-${annotationId}`);
    if (!target) {
        // 直接 CSS 選擇比對
        try { target = document.querySelector(`[data-annotation-id="${annotationId}"]`); } catch { target = null; }
    }
    if (!target) {
        // 兜底：走訪比對，避免 selector 因特殊字元失敗
        const all = document.querySelectorAll('[data-annotation-id]');
        for (const el of all) {
            if ((el.dataset && el.dataset.annotationId) === String(annotationId)) { target = el; break; }
        }
    }
    if (!target) return false;

    const emphasisTarget = (function(el){
        try {
            const sub = el.closest && el.closest('.sub-block[data-sub-block-id]');
            if (sub) return sub;
            const blk = el.closest && el.closest('[data-block-index]');
            if (blk) return blk;
        } catch { /* ignore */ }
        return el;
    })(target);

    const opts = { behavior: smooth ? 'smooth' : 'auto', block: 'center' };
    try {
        emphasisTarget.scrollIntoView(opts);
        // 統一的臨時強調
        const oldOutline = emphasisTarget.style.outline;
        emphasisTarget.classList && emphasisTarget.classList.add('jump-to-highlight-effect');
        emphasisTarget.style.outline = '2px solid rgba(59,130,246,0.8)';
        setTimeout(() => {
            emphasisTarget.style.outline = oldOutline || '';
            emphasisTarget.classList && emphasisTarget.classList.remove('jump-to-highlight-effect');
        }, 1500);
        return true;
    } catch { return false; }
}

// 非同步等待目標醒目提示/元素出現後再跳轉，解決延遲渲染/分批分塊導致的找不到問題
async function scrollToAnnotationAsync(annotationId, options = {}) {
    const {
        targetType = null,       // 'ocr' | 'translation'
        subBlockId = null,       // 可選：回退比對用
        blockIndex = null,       // 可選：回退比對用
        timeoutMs = 4000,        // 預設最多等待 4s
        pollIntervalMs = 120     // 輪詢間隔
    } = options;

    const deadline = Date.now() + timeoutMs;
    let lastError = null;

    while (Date.now() < deadline) {
        try {
            // 1) 優先按 annotationId 精準定位
            let target = document.getElementById(`ann-${annotationId}`);
            if (!target) {
                try { target = document.querySelector(`[data-annotation-id="${annotationId}"]`); } catch { target = null; }
            }
            if (!target) {
                // 兜底：走訪比對
                const allEl = document.querySelectorAll('[data-annotation-id]');
                for (const el of allEl) {
                    if ((el.dataset && el.dataset.annotationId) === String(annotationId)) { target = el; break; }
                }
            }
            if (!target) {
                // 2) 回退：在特定內容容器內按 subBlockId/blockIndex 查詢
                let scope = document;
                if (targetType) {
                    const cid = `${targetType}-content-wrapper`;
                    scope = document.getElementById(cid) || document;
                }
                if (subBlockId && !target) {
                    target = scope.querySelector(`.sub-block[data-sub-block-id="${subBlockId}"]`);
                }
                if (!target && blockIndex !== null && blockIndex !== undefined && String(blockIndex) !== '') {
                    target = scope.querySelector(`[data-block-index="${blockIndex}"]`);
                }
            }

            if (target) {
                // 將強調目標提升到包含的子塊/塊，保證滾動錨點與強調元素一致
                const emphasisTarget = (function(el){
                    try {
                        const sub = el.closest && el.closest('.sub-block[data-sub-block-id]');
                        if (sub) return sub;
                        const blk = el.closest && el.closest('[data-block-index]');
                        if (blk) return blk;
                    } catch { /* ignore */ }
                    return el;
                })(target);

                try {
                    emphasisTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 閃爍/描邊提示
                    const oldOutline = emphasisTarget.style.outline;
                    emphasisTarget.classList && emphasisTarget.classList.add('jump-to-highlight-effect');
                    emphasisTarget.style.outline = '2px solid rgba(59,130,246,0.8)';
                    setTimeout(() => {
                        emphasisTarget.style.outline = oldOutline || '';
                        emphasisTarget.classList && emphasisTarget.classList.remove('jump-to-highlight-effect');
                    }, 1500);
                } catch (_) { /* ignore */ }
                return true;
            }
        } catch (e) {
            lastError = e;
        }
        // 等待下一次輪詢
        await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    if (lastError) console.warn('[scrollToAnnotationAsync] 跳轉失敗（可能超時或DOM未準備好）:', lastError);
    return false;
}

// 暴露跨子塊醒目提示功能
window.applyCrossBlockAnnotation = applyCrossBlockAnnotation;
window.applyCrossBlockHighlightStyle = applyCrossBlockHighlightStyle;
window.bindCrossBlockAnnotationEvents = bindCrossBlockAnnotationEvents;
window.scrollToAnnotation = scrollToAnnotation;
window.scrollToAnnotationAsync = scrollToAnnotationAsync;

// 暴露公式相關功能
window.detectFormulaType = detectFormulaType;
window.applyFormulaAnnotation = applyFormulaAnnotation;
