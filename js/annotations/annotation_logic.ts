// js/annotation_logic.js

// 假設以下全域變數由 history_detail.html 或 window 提供:
// - window.data (包含批註資訊)
// - window.globalCurrentContentIdentifier (字串, 'ocr' 或 'translation')
// - window.globalCurrentSelection (物件 {text, range, annotationId?, blockIndex?, subBlockId?, targetElement?, contentIdentifierForSelection?})
// - window.globalCurrentTargetElement (DOM 元素) - 將被 globalCurrentSelection.targetElement 取代或輔助
// - window.globalCurrentHighlightStatus (布林值)
// - getQueryParam (來自 history_detail.html 的函式)
// 以及來自 storage.js 的函式:
// - saveAnnotationToDB, deleteAnnotationFromDB, updateAnnotationInDB, getAnnotationsForDocFromDB

var annotationContextMenuElement; // 右鍵選單的HTML元素

// ========== Phase 2.3: 批註系統 DOM 快取最佳化 ==========
/**
 * 批註系統 DOM 快取類
 * 快取 sub-block 元素，避免右鍵時全文件 querySelectorAll
 */
const AnnotationDOMCache = {
    // 快取的 sub-block 元素陣列
    subBlocks: null,

    // 快取的 sub-block 對映 (subBlockId -> element)
    subBlockMap: null,

    // 快取是否已初始化
    initialized: false,

    /**
     * 初始化快取
     * 在內容渲染完成後呼叫
     */
    init: function() {
        console.time('[AnnotationCache] 初始化 sub-block 快取');

        // 查詢所有 sub-block 元素
        this.subBlocks = Array.from(document.querySelectorAll('.sub-block[data-sub-block-id]'));

        // 建立對映表
        this.subBlockMap = new Map();
        this.subBlocks.forEach(subBlock => {
            const subBlockId = subBlock.dataset.subBlockId;
            if (subBlockId) {
                this.subBlockMap.set(subBlockId, subBlock);
            }
        });

        this.initialized = true;
        console.timeEnd('[AnnotationCache] 初始化 sub-block 快取');
        console.log(`[AnnotationCache] 已快取 ${this.subBlocks.length} 個 sub-block 元素`);

        return this;
    },

    /**
     * 獲取所有 sub-block 元素（從快取）
     * 如果快取未初始化，則動態查詢
     */
    getAllSubBlocks: function() {
        if (!this.initialized) {
            console.warn('[AnnotationCache] 快取未初始化，執行動態查詢');
            return document.querySelectorAll('.sub-block[data-sub-block-id]');
        }
        return this.subBlocks;
    },

    /**
     * 根據 subBlockId 獲取元素
     */
    getSubBlockById: function(subBlockId) {
        if (!this.initialized) {
            console.warn('[AnnotationCache] 快取未初始化，執行動態查詢');
            return document.querySelector(`.sub-block[data-sub-block-id="${subBlockId}"]`);
        }
        return this.subBlockMap.get(subBlockId) || null;
    },

    /**
     * 清空快取
     * 在標籤切換或內容重新渲染時呼叫
     */
    clear: function() {
        this.subBlocks = null;
        this.subBlockMap = null;
        this.initialized = false;
        console.log('[AnnotationCache] 快取已清空');
    },

    /**
     * 重新初始化快取
     * 在內容更新（如自動分塊）後呼叫
     */
    refresh: function() {
        console.log('[AnnotationCache] 重新整理快取...');
        this.clear();
        return this.init();
    }
};

// 掛載到全域，方便外部呼叫
window.AnnotationDOMCache = AnnotationDOMCache;

// 這些全域變數將在 history_detail.html 的主腳本中初始化和管理。
// 此腳本將使用它們。
// let globalCurrentSelection = null; // 全域當前選區物件
// let globalCurrentTargetElement = null; // 全域當前右鍵選單目標元素
// let globalCurrentHighlightStatus = false; // 全域當前醒目提示狀態
// let globalCurrentContentIdentifier = ''; // 全域當前內容識別符號 (例如 'ocr', 'translation')，將由 history_detail.html 中的 showTab 函式設定


function _page_generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeRegExp(string) {
  // 更安全地轉義所有正規表示式特殊字元
  return string.replace(/[.*+?^${}()|[\\\]\\\\]/g, '\\\\$&');
}

function fuzzyRegFromExact(exact) {
  // 先轉義所有正規表示式特殊字元
  let pattern = escapeRegExp(exact);
  // 將所有空白替換為 \\s+，允許跨行、多個空格
  pattern = pattern.replace(/\\\\s+/g, '\\\\s+');
  // 可選：忽略前後空白
  pattern = '\\\\s*' + pattern + '\\\\s*';
  return new RegExp(pattern, 'gi');
}

/**
 * 模糊比對兩個字串，忽略所有空白和換行
 * @param {string} a 字串a
 * @param {string} b 字串b
 * @returns {boolean} 如果比對則返回true，否則返回false
 */
function fuzzyMatch(a, b) {
    const cleanA = String(a).replace(/\\s+/g, '');
    const cleanB = String(b).replace(/\\s+/g, '');
    return cleanA === cleanB;
}

/**
 * 通用函式：檢查指定目標是否已被醒目提示。
 * @param {string} [annotationId=null] - 可選的批註ID。
 * @param {string} contentIdentifier - 當前內容的識別符號 ('ocr' 或 'translation')。
 * @param {string} [targetIdentifier=null] - 目標元素的識別符號 (blockIndex 或 subBlockId)。
 * @param {'blockIndex'|'subBlockId'} identifierType - 識別符號的型別。
 * @returns {boolean} 是否已醒目提示。
 */
function checkIfTargetIsHighlighted(annotationId = null, contentIdentifier, targetIdentifier = null, identifierType) {
    // console.log(`[checkIfTargetIsHighlighted] ID: ${annotationId}, ContentID: ${contentIdentifier}, TargetID: ${targetIdentifier}, Type: ${identifierType}`);
    if (!window.data || !window.data.annotations) {
        return false;
    }

    let annotation;
    if (annotationId) {
        // ID 優先比對
        annotation = window.data.annotations.find(ann =>
            ann.targetType === contentIdentifier && ann.id === annotationId
        );
    } else if (targetIdentifier !== null && identifierType) {
        // 透過目標識別符號查詢，與removeAnnotationFromTarget保持一致的比對邏輯
        const targetIdStr = String(targetIdentifier).trim();

        annotation = window.data.annotations.find(ann => {
            // 確保基本條件比對
            if (ann.targetType !== contentIdentifier) return false;
            if (!ann.target || !Array.isArray(ann.target.selector) || !ann.target.selector[0]) return false;

            // 獲取選擇器中的識別符號，確保轉換為字串進行比較
            const selectorId = ann.target.selector[0][identifierType];
            if (selectorId === undefined) return false;

            const selectorIdStr = String(selectorId).trim();

            // 使用與removeAnnotationFromTarget相同的比較邏輯
            return selectorIdStr === targetIdStr || Math.abs(Number(selectorIdStr) - Number(targetIdStr)) < 0.001;
        });
    }

    // console.log('[checkIfTargetIsHighlighted] 找到的批註:', annotation, '結果:', !!annotation);
    return !!annotation;
}

/**
 * 通用函式：檢查指定目標是否已有批註內容。
 * @param {string} [annotationId=null] - 可選的批註ID。
 * @param {string} contentIdentifier - 當前內容的識別符號 ('ocr' 或 'translation')。
 * @param {string} [targetIdentifier=null] - 目標元素的識別符號 (blockIndex 或 subBlockId)。
 * @param {'blockIndex'|'subBlockId'} identifierType - 識別符號的型別。
 * @returns {boolean} 是否已有批註內容。
 */
function checkIfTargetHasNote(annotationId = null, contentIdentifier, targetIdentifier = null, identifierType) {
    // console.log(`[checkIfTargetHasNote] ID: ${annotationId}, ContentID: ${contentIdentifier}, TargetID: ${targetIdentifier}, Type: ${identifierType}`);
    if (!window.data || !window.data.annotations) return false;

    let annotation;
    if (annotationId) {
        // ID 優先比對
        annotation = window.data.annotations.find(ann =>
            ann.targetType === contentIdentifier &&
            ann.id === annotationId &&
            ann.body && ann.body.length > 0 && ann.body[0].value && ann.body[0].value.trim() !== ''
        );
    } else if (targetIdentifier !== null && identifierType) {
        // 透過目標識別符號查詢，與其他函式保持一致的比對邏輯
        const targetIdStr = String(targetIdentifier).trim();

        annotation = window.data.annotations.find(ann => {
            // 確保基本條件比對
            if (ann.targetType !== contentIdentifier) return false;
            if (!ann.target || !Array.isArray(ann.target.selector) || !ann.target.selector[0]) return false;

            // 獲取選擇器中的識別符號，確保轉換為字串進行比較
            const selectorId = ann.target.selector[0][identifierType];
            if (selectorId === undefined) return false;

            const selectorIdStr = String(selectorId).trim();

            // 使用與其他函式相同的比較邏輯
            const idMatch = selectorIdStr === targetIdStr || Math.abs(Number(selectorIdStr) - Number(targetIdStr)) < 0.001;

            // 還需要檢查是否有批註內容
            return idMatch && ann.body && ann.body.length > 0 && ann.body[0].value && ann.body[0].value.trim() !== '';
        });
    }

    // console.log('[checkIfTargetHasNote] 找到的批註:', annotation, '結果:', !!annotation);
    return !!annotation;
}

/**
 * 根據是否已醒目提示和是否有批註來更新上下文選單選項的顯示
 * @param {boolean} isHighlighted - 是否已醒目提示
 * @param {boolean} hasNote - 是否已有批註
 */
function updateContextMenuOptions(isHighlighted, hasNote = false, isReadOnlyMode = false) {
    if (!annotationContextMenuElement) return;

    const highlightOption = annotationContextMenuElement.querySelector('[data-action="highlight-block"]') ||
                            annotationContextMenuElement.querySelector('[data-action="highlight-paragraph"]');
    const removeHighlightOption = document.getElementById('remove-highlight-option');
    const addNoteOption = document.getElementById('add-note-option');
    const editNoteOption = document.getElementById('edit-note-option');
    const copyContentOption = document.getElementById('copy-content-option');
    const highlightActionsDivider = document.getElementById('highlight-actions-divider');
    const noteActionsDivider = document.getElementById('note-actions-divider');

    if (isReadOnlyMode) {
        if (highlightOption) highlightOption.style.display = 'none';
        if (removeHighlightOption) removeHighlightOption.style.display = 'none';
        if (addNoteOption) addNoteOption.style.display = 'none';
        if (editNoteOption) editNoteOption.style.display = 'none';
        if (copyContentOption) copyContentOption.style.display = 'none';
        if (highlightActionsDivider) highlightActionsDivider.style.display = 'none';
        if (noteActionsDivider) noteActionsDivider.style.display = 'none';
        return;
    }

    // 放寬：只要存在非空選區即可醒目提示，內部會自動對映到子塊/跨子塊
    let canHighlight = false;
    try {
        const sel = window.getSelection();
        canHighlight = !!(sel && sel.rangeCount && !sel.getRangeAt(0).collapsed);
    } catch { canHighlight = false; }
    if (highlightOption) {
        highlightOption.style.display = canHighlight ? 'block' : 'none';
        try { highlightOption.textContent = '醒目提示選中內容'; } catch { /* noop */ }
    }

    if (removeHighlightOption) removeHighlightOption.style.display = isHighlighted ? 'block' : 'none';

    if (copyContentOption) {
        const sel = window.getSelection();
        const hasRange = sel && sel.rangeCount && !sel.getRangeAt(0).collapsed;
        copyContentOption.style.display = hasRange ? 'block' : 'none';
    }

    if (isHighlighted) {
        if (addNoteOption) addNoteOption.style.display = hasNote ? 'none' : 'block';
        if (editNoteOption) editNoteOption.style.display = hasNote ? 'block' : 'none';
    } else {
        if (addNoteOption) addNoteOption.style.display = 'none';
        if (editNoteOption) editNoteOption.style.display = 'none';
    }

    if (highlightActionsDivider) {
        highlightActionsDivider.style.display = isHighlighted ? 'block' : 'none';
    }
    if (noteActionsDivider) {
        const noteOptionsVisible = (addNoteOption && addNoteOption.style.display === 'block') || (editNoteOption && editNoteOption.style.display === 'block');
        noteActionsDivider.style.display = isHighlighted && noteOptionsVisible ? 'block' : 'none';
    }
}

/**
 * 顯示上下文選單
 * @param {number} x - x座標
 * @param {number} y - y座標
 */
function showContextMenu(x, y) {
    if (!annotationContextMenuElement) return;
    annotationContextMenuElement.style.left = x + 'px';
    annotationContextMenuElement.style.top = y + 'px';
    annotationContextMenuElement.classList.remove('context-menu-hidden');
    annotationContextMenuElement.classList.add('context-menu-visible');
}

/**
 * 隱藏上下文選單並重置相關狀態
 */
function hideContextMenu() {
    if (!annotationContextMenuElement) return;
    annotationContextMenuElement.classList.remove('context-menu-visible');
    annotationContextMenuElement.classList.add('context-menu-hidden');

    // 重置由 history_detail.html 管理的全域變數
    window.globalCurrentSelection = null;
    // window.globalCurrentTargetElement = null; // 作用減弱
    window.globalCurrentHighlightStatus = false;
}

/**
 * 通用函式：從資料庫中移除指定目標的批註。
 * @param {string} docId - 文件ID。
 * @param {string} [annotationId=null] - 可選的批註ID。
 * @param {string} [targetIdentifier=null] - 目標元素的識別符號 (blockIndex 或 subBlockId)。
 * @param {string} contentIdentifier - 內容識別符號。
 * @param {'blockIndex'|'subBlockId'} identifierType - 識別符號的型別。
 */
async function removeAnnotationFromTarget(docId, annotationId = null, targetIdentifier = null, contentIdentifier, identifierType) {
    if (!window.data.annotations) {
        console.warn(`[批註邏輯] removeAnnotationFromTarget: window.data.annotations 未定義。`);
        return;
    }
    if (!annotationId && targetIdentifier === null) {
        console.error(`[批註邏輯] removeAnnotationFromTarget: 需要 annotationId 或 targetIdentifier。`);
        throw new Error('未指定要刪除的批註 (無ID或目標識別符號)。');
    }

    // 增強日誌：記錄所有相關引數
    console.log(`[批註邏輯] removeAnnotationFromTarget 引數: docId=${docId}, annotationId=${annotationId}, targetIdentifier=${targetIdentifier}, contentIdentifier=${contentIdentifier}, identifierType=${identifierType}`);

    // 記錄當前所有批註的數量和型別
    if (window.data.annotations) {
        console.log(`[批註邏輯] 當前批註總數: ${window.data.annotations.length}`);
        const typeCounts = {};
        window.data.annotations.forEach(ann => {
            const type = ann.targetType || 'unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        console.log(`[批註邏輯] 批註型別統計:`, typeCounts);
    }

    let annotationsToRemove = [];
    if (annotationId) {
        // 透過ID查詢批註
        annotationsToRemove = window.data.annotations.filter(ann => ann.id === annotationId && ann.targetType === contentIdentifier);
        console.log(`[批註邏輯] 透過ID查詢批註: ${annotationsToRemove.length}個比對`);
    } else if (targetIdentifier !== null && identifierType) {
        // 透過目標識別符號查詢批註，增強型別比較
        const targetIdStr = String(targetIdentifier).trim();

        annotationsToRemove = window.data.annotations.filter(ann => {
            // 確保基本條件比對
            if (ann.targetType !== contentIdentifier) return false;
            if (!ann.target || !Array.isArray(ann.target.selector) || !ann.target.selector[0]) return false;

            // 獲取選擇器中的識別符號，確保轉換為字串進行比較
            const selectorId = ann.target.selector[0][identifierType];
            if (selectorId === undefined) return false;

            const selectorIdStr = String(selectorId).trim();

            // 記錄詳細的比較資訊以便除錯
            const isMatch = selectorIdStr === targetIdStr;
            if (selectorIdStr === targetIdStr || Math.abs(Number(selectorIdStr) - Number(targetIdStr)) < 0.001) {
                console.log(`[批註邏輯] 找到比對: ${selectorIdStr} == ${targetIdStr} (${identifierType})`);
                return true;
            }
            return false;
        });

        console.log(`[批註邏輯] 透過${identifierType}查詢批註: ${annotationsToRemove.length}個比對 (目標值: ${targetIdStr})`);

        // 如果沒有找到比對，記錄所有可能的值以便除錯
        if (annotationsToRemove.length === 0) {
            const allValues = window.data.annotations
                .filter(ann => ann.targetType === contentIdentifier && ann.target && ann.target.selector && ann.target.selector[0])
                .map(ann => {
                    const val = ann.target.selector[0][identifierType];
                    return val !== undefined ? String(val) : 'undefined';
                });
            console.log(`[批註邏輯] 當前所有${identifierType}值:`, allValues);
        }
    }

    if (annotationsToRemove.length === 0) {
        console.warn(`[批註邏輯] removeAnnotationFromTarget: 未找到要刪除的批註。 ID: ${annotationId}, TargetID: ${targetIdentifier}, Type: ${identifierType}`);
        return;
    }

    console.log(`[批註邏輯] 將刪除${annotationsToRemove.length}個批註:`, annotationsToRemove);

    for (const annotation of annotationsToRemove) {
        try {
            await deleteAnnotationFromDB(annotation.id);
            const index = window.data.annotations.findIndex(ann => ann.id === annotation.id);
            if (index > -1) {
                window.data.annotations.splice(index, 1);
                console.log(`[批註邏輯] 成功從記憶體中刪除批註 ID: ${annotation.id}`);
            } else {
                console.warn(`[批註邏輯] 無法從記憶體中刪除批註 ID: ${annotation.id} (未找到索引)`);
            }
        } catch (error) {
            console.error(`[批註邏輯] removeAnnotationFromTarget: 刪除批註失敗:`, error);
            throw error;
        }
    }
}

/**
 * 通用函式：為現有的已醒目提示目標新增或更新批註內容。
 * @param {string} noteText - 批註內容。
 * @param {string} docId - 文件ID。
 * @param {string} [annotationId=null] - 可選的批註ID。
 * @param {string} [targetIdentifier=null] - 目標元素的識別符號 (blockIndex 或 subBlockId)。
 * @param {string} contentIdentifier - 內容識別符號。
 * @param {'blockIndex'|'subBlockId'} identifierType - 識別符號的型別。
 */
async function addNoteToAnnotation(noteText, docId, annotationId = null, targetIdentifier = null, contentIdentifier, identifierType) {
    if (!window.data.annotations) {
        throw new Error('沒有找到批註資料');
    }
    if (!annotationId && targetIdentifier === null) {
        console.error(`[批註邏輯] addNoteToAnnotation: 需要 annotationId 或 targetIdentifier。`);
        throw new Error('未指定要新增批註的目標 (無ID或目標識別符號)。');
    }

    // 增強日誌：記錄所有相關引數
    console.log(`[批註邏輯] addNoteToAnnotation 引數: docId=${docId}, annotationId=${annotationId}, targetIdentifier=${targetIdentifier}, contentIdentifier=${contentIdentifier}, identifierType=${identifierType}`);

    let existingAnnotation;
    if (annotationId) {
        // 透過ID查詢批註
        existingAnnotation = window.data.annotations.find(ann =>
            ann.id === annotationId &&
            ann.targetType === contentIdentifier &&
            (ann.motivation === 'highlighting' || ann.motivation === 'commenting')
        );
        console.log(`[批註邏輯] 透過ID查詢批註進行新增/更新批註: ${existingAnnotation ? '找到' : '未找到'}`);
    } else if (targetIdentifier !== null && identifierType) {
        // 透過目標識別符號查詢批註，使用與其他函式一致的比對邏輯
        const targetIdStr = String(targetIdentifier).trim();

        existingAnnotation = window.data.annotations.find(ann => {
            // 確保基本條件比對
            if (ann.targetType !== contentIdentifier) return false;
            if (!ann.target || !Array.isArray(ann.target.selector) || !ann.target.selector[0]) return false;
            if (!(ann.motivation === 'highlighting' || ann.motivation === 'commenting')) return false;

            // 獲取選擇器中的識別符號，確保轉換為字串進行比較
            const selectorId = ann.target.selector[0][identifierType];
            if (selectorId === undefined) return false;

            const selectorIdStr = String(selectorId).trim();

            // 使用與其他函式相同的比較邏輯
            return selectorIdStr === targetIdStr || Math.abs(Number(selectorIdStr) - Number(targetIdStr)) < 0.001;
        });

        console.log(`[批註邏輯] 透過${identifierType}查詢批註進行新增/更新批註: ${existingAnnotation ? '找到' : '未找到'} (目標值: ${targetIdStr})`);
    }

    if (!existingAnnotation) {
        console.warn(`[批註邏輯] addNoteToAnnotation: 未找到對應的醒目提示批註。 ID: ${annotationId}, TargetID: ${targetIdentifier}, Type: ${identifierType}`);
        throw new Error('未找到對應的醒目提示批註進行批註操作');
    }

    existingAnnotation.body = [{
        type: 'TextualBody',
        value: noteText,
        format: 'text/plain',
        purpose: 'commenting'
    }];
    existingAnnotation.modified = new Date().toISOString();
    existingAnnotation.motivation = 'commenting';

    try {
        await updateAnnotationInDB(existingAnnotation);
        console.log(`[批註邏輯] 成功更新批註 ID: ${existingAnnotation.id}`);
        // 新增：批註內容變動後立即重新整理目標元素的title/class
        let targetElement = null;
        if (identifierType === 'subBlockId') {
            const containerId = contentIdentifier + '-content-wrapper';
            const container = document.getElementById(containerId);
            if (container) {
                targetElement = container.querySelector('.sub-block[data-sub-block-id="' + (existingAnnotation.target.selector[0].subBlockId || targetIdentifier) + '"]');
            }
        } else if (identifierType === 'blockIndex') {
            const containerId = contentIdentifier + '-content-wrapper';
            const container = document.getElementById(containerId);
            if (container) {
                targetElement = container.querySelector('[data-block-index="' + (existingAnnotation.target.selector[0].blockIndex || targetIdentifier) + '"]');
            }
        }
        if (targetElement && window.highlightBlockOrSubBlock) {
            window.highlightBlockOrSubBlock(targetElement, existingAnnotation, contentIdentifier, targetIdentifier, identifierType === 'subBlockId' ? 'subBlock' : 'block');
        }
    } catch (error) {
        console.error(`[批註邏輯] addNoteToAnnotation: 更新批註失敗:`, error);
        throw error;
    }
}

// 主初始化函式，由 history_detail.html 呼叫
function initAnnotationSystem() {
    annotationContextMenuElement = document.getElementById('custom-context-menu');
    if (!annotationContextMenuElement) {
        console.error("未找到批註上下文選單元素 ('custom-context-menu')！");
        return;
    }

    // ========== 事件委託：只在 .container 上全域綁定一次 contextmenu ==========
    const mainContainer = document.querySelector('.container');
    if (mainContainer) {
        if (mainContainer._annotationContextMenuBound) return;
        mainContainer._annotationContextMenuBound = true;
        mainContainer.addEventListener('contextmenu', function(event) {
            // 防呆：內容未載入完成時禁止右鍵
            if (!window.contentReady) {
                alert('請等待內容載入完成後再右鍵區塊。');
                return;
            }
            
            // ===== 防重複觸發機制 =====
            if (this._contextMenuProcessing) {
                console.log('[跨子塊檢測] 事件正在處理中，跳過重複觸發');
                return;
            }
            this._contextMenuProcessing = true;
            
            // 延遲重置標誌，避免快速重複觸發
            setTimeout(() => {
                this._contextMenuProcessing = false;
            }, 100);
            
            // ===== 新增：跨子塊選擇檢測 =====
            console.log('[跨子塊檢測] 開始檢測跨子塊選擇...');

            // 使用快取獲取所有子塊（Phase 2.3 最佳化）
            let allSubBlocks = window.AnnotationDOMCache.getAllSubBlocks();
            console.log('[跨子塊檢測] 頁面上的子塊總數:', allSubBlocks.length);

            if (allSubBlocks.length === 0) {
                console.log('[跨子塊檢測] ⚠️ 頁面上沒有找到任何子塊！內容可能還沒有分割。');
                const blocks = document.querySelectorAll('[data-block-index]');
                console.log('[跨子塊檢測] [data-block-index]元素數量:', blocks.length);
                if (blocks.length > 0 && window.SubBlockSegmenter && typeof window.SubBlockSegmenter.segment === 'function') {
                    console.log('[跨子塊檢測] 觸發自動分塊（英文/中文標點）');
                    blocks.forEach(el => {
                        try { window.SubBlockSegmenter.segment(el, el.dataset.blockIndex, true); }
                        catch (e) { console.warn('[跨子塊檢測] 自動分塊失敗:', e); }
                    });
                    // 自動分塊後重新整理快取
                    allSubBlocks = window.AnnotationDOMCache.refresh().getAllSubBlocks();
                    console.log('[跨子塊檢測] 自動分塊後 .sub-block數量:', allSubBlocks.length);
                }
            } else {
                console.log('[跨子塊檢測] 前5個子塊ID:', Array.from(allSubBlocks).slice(0, 5).map(sb => sb.dataset.subBlockId));
            }
            
            const crossBlockSelection = detectCrossBlockSelection();
            console.log('[跨子塊檢測] 檢測結果:', crossBlockSelection);
            if (crossBlockSelection.isCrossBlock) {
                console.log('[跨子塊檢測] 檢測到跨子塊選擇，處理跨子塊標註');
                event.preventDefault(); // 阻止預設行為
                return handleCrossBlockAnnotation(event, crossBlockSelection);
            } else {
                console.log('[跨子塊檢測] 未檢測到跨子塊選擇，繼續單子塊處理');
            }
            
            // 只處理 .sub-block 或 [data-block-index] 的右鍵 (僅在非跨子塊情況下)
            let targetSubBlock = event.target.closest('.sub-block[data-sub-block-id]');
            let targetBlock = event.target.closest('[data-block-index]');

            // 優先：使用當前選區的起點子塊作為目標，避免誤選到上一段
            try {
                const sel = window.getSelection();
                if (sel && sel.rangeCount) {
                    const r = sel.getRangeAt(0);
                    if (!r.collapsed) {
                        const startEl = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer;
                        const subFromSelection = startEl && startEl.closest ? startEl.closest('.sub-block[data-sub-block-id]') : null;
                        if (subFromSelection) {
                            targetSubBlock = subFromSelection;
                            targetBlock = subFromSelection.closest('[data-block-index]') || targetBlock;
                        } else if (!targetSubBlock) {
                            // 若選區存在但所在段落尚未分段，則對該段落強制分段並定位子塊
                            const blockEl = startEl && startEl.closest ? startEl.closest('[data-block-index]') : null;
                            if (blockEl && window.SubBlockSegmenter && typeof window.SubBlockSegmenter.segment === 'function') {
                                try {
                                    // 計算選區在塊內的文字偏移
                                    const getTextOffset = (elementNode, parentBlock) => {
                                        let offset = 0;
                                        const walker = document.createTreeWalker(parentBlock, NodeFilter.SHOW_TEXT, null, false);
                                        let n;
                                        while ((n = walker.nextNode())) {
                                            if (n === elementNode || n.parentElement === elementNode) break;
                                            offset += (n.textContent || '').length;
                                        }
                                        return offset;
                                    };
                                    const preOffset = getTextOffset(r.startContainer, blockEl);
                                    window.SubBlockSegmenter.segment(blockEl, blockEl.dataset.blockIndex, true);
                                    // 在新子塊中查詢對應的位置
                                    const subBlocks = blockEl.querySelectorAll('.sub-block[data-sub-block-id]');
                                    let acc = 0;
                                    subBlocks.forEach(sb => {
                                        const L = (sb.textContent || '').length;
                                        if (targetSubBlock) return;
                                        if (preOffset >= acc && preOffset < acc + L) targetSubBlock = sb;
                                        acc += L;
                                    });
                                    if (!targetSubBlock) {
                                        // 仍未定位到具體子塊：使用塊元素本身（虛擬子塊）併相容渲染器
                                        if (!blockEl.dataset.subBlockId) {
                                            blockEl._virtualSubBlockId = blockEl.dataset.blockIndex + '.0';
                                            blockEl.dataset.subBlockId = blockEl._virtualSubBlockId;
                                        }
                                        if (!blockEl.classList.contains('sub-block')) {
                                            blockEl.classList.add('sub-block');
                                        }
                                        targetSubBlock = blockEl;
                                    }
                                    if (!targetBlock) targetBlock = blockEl;
                                } catch (e) { /* ignore */ }
                            }
                        }
                    }
                }
            } catch(e){ /* ignore */ }
            if (!targetSubBlock && !targetBlock) {
                console.log('[單子塊檢測] 右鍵目標不是子塊或塊級元素，忽略');
                return;
            }

            // 新增：判斷是否為只讀檢視 (分塊對比模式)
            const isReadOnlyView = window.currentVisibleTabId === 'chunk-compare';
            if (isReadOnlyView) {
                event.preventDefault();
                hideContextMenu();
                return;
            }

            let targetElementForAnnotation;
            let identifier, identifierType, blockIndexForContext = null, selectedTextForContext;
            let isOnlySubBlock = false;

            if (targetSubBlock) {
                targetElementForAnnotation = targetSubBlock;
                identifier = targetSubBlock.dataset.subBlockId;
                identifierType = 'subBlockId';
                if (targetSubBlock.dataset.isOnlySubBlock === "true") {
                    isOnlySubBlock = true;
                }
                const parentBlockElement = targetSubBlock.closest('[data-block-index]');
                if (parentBlockElement) {
                    blockIndexForContext = parentBlockElement.dataset.blockIndex;
                }
            } else if (targetBlock) {
                targetElementForAnnotation = targetBlock;
                identifier = targetBlock.dataset.blockIndex;
                identifierType = 'blockIndex';
                blockIndexForContext = identifier;
            } else {
                hideContextMenu();
                return;
            }

            const annotationId = targetElementForAnnotation.dataset.annotationId;
            // 優先採用當前選區文字
            try {
                const sel = window.getSelection();
                if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) {
                    selectedTextForContext = sel.toString();
                } else {
                    selectedTextForContext = targetElementForAnnotation.textContent;
                }
            } catch { selectedTextForContext = targetElementForAnnotation.textContent; }

            // 選區設定：僅使用使用者當前選區（不再強制整塊選中）
            let effectiveRange;
            try {
                const sel = window.getSelection();
                if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed) {
                    effectiveRange = sel.getRangeAt(0).cloneRange();
                }
            } catch { /* noop */ }
            window.globalCurrentSelection = {
                text: selectedTextForContext,
                range: effectiveRange,
                annotationId: annotationId,
                targetElement: targetElementForAnnotation,
                contentIdentifierForSelection: window.globalCurrentContentIdentifier,
                [identifierType]: identifier,
                blockIndex: blockIndexForContext
            };

            // Store context directly on the menu element
            annotationContextMenuElement.dataset.contextContentIdentifier = window.globalCurrentContentIdentifier;
            annotationContextMenuElement.dataset.contextTargetIdentifier = identifier;
            annotationContextMenuElement.dataset.contextIdentifierType = identifierType;
            if (annotationId) {
                annotationContextMenuElement.dataset.contextAnnotationId = annotationId;
            } else {
                delete annotationContextMenuElement.dataset.contextAnnotationId;
            }
            if (selectedTextForContext) {
                annotationContextMenuElement.dataset.contextSelectedText = selectedTextForContext;
            } else {
                delete annotationContextMenuElement.dataset.contextSelectedText;
            }
            if (isOnlySubBlock && identifierType === 'subBlockId') {
                annotationContextMenuElement.dataset.contextIsOnlySubBlock = "true";
            } else {
                delete annotationContextMenuElement.dataset.contextIsOnlySubBlock;
            }
            if (blockIndexForContext) {
                annotationContextMenuElement.dataset.contextBlockIndex = blockIndexForContext;
            } else {
                delete annotationContextMenuElement.dataset.contextBlockIndex;
            }

            // 🔧 BUG FIX: 清除跨子塊相關屬性，避免單子塊操作時誤用舊的跨子塊資料
            delete annotationContextMenuElement.dataset.contextIsCrossBlock;
            delete annotationContextMenuElement.dataset.contextCrossBlockAnnotationId;
            delete annotationContextMenuElement.dataset.contextAffectedSubBlocks;

            console.log(`%c[AnnotationLogic ContxtMenu] Event triggered for container: ${mainContainer.id}, content type: ${window.globalCurrentContentIdentifier}`, 'color: blue; font-weight: bold;');
            console.log(`  Stored on menu - contentId: ${annotationContextMenuElement.dataset.contextContentIdentifier}, targetId: ${annotationContextMenuElement.dataset.contextTargetIdentifier}, type: ${annotationContextMenuElement.dataset.contextIdentifierType}, annId: ${annotationContextMenuElement.dataset.contextAnnotationId}, blockIdx: ${annotationContextMenuElement.dataset.contextBlockIndex}`);
            console.log(`  Selected text stored on menu: ${(annotationContextMenuElement.dataset.contextSelectedText || '').substring(0,50)}...`);

            const isHighlighted = checkIfTargetIsHighlighted(annotationId, window.globalCurrentContentIdentifier, identifier, identifierType);
            const hasNote = checkIfTargetHasNote(annotationId, window.globalCurrentContentIdentifier, identifier, identifierType);

            console.log(`  checkIfTargetIsHighlighted(...) returned: ${isHighlighted}`);
            console.log(`  checkIfTargetHasNote(...) returned: ${hasNote}`);

            window.globalCurrentHighlightStatus = isHighlighted;
            // 僅在可醒目提示（跨子塊或子塊記憶體在非空選區）或點選已有醒目提示時顯示選單
            let canHighlight = false;
            try {
                const sel = window.getSelection();
                const hasSelection = sel && sel.rangeCount && !sel.getRangeAt(0).collapsed;
                console.log(`[除錯] 選區檢測: hasSelection=${hasSelection}, targetSubBlock=${!!targetSubBlock}, annotationId=${annotationId}`);
                if (hasSelection) {
                    console.log(`[除錯] 選中文字: "${sel.toString().substring(0, 50)}..."`);
                }
                canHighlight = !!(hasSelection && targetSubBlock);
            } catch(e) {
                console.warn('[除錯] 選區檢測失敗:', e);
                canHighlight = false;
            }
            const clickedHighlighted = !!annotationId;
            console.log(`[除錯] canHighlight=${canHighlight}, clickedHighlighted=${clickedHighlighted}`);
            if (!canHighlight && !clickedHighlighted) {
                console.log('[除錯] ❌ 不顯示選單：既沒有有效選區，也沒有點選已有醒目提示');
                hideContextMenu();
                return; // 允許預設瀏覽器選單
            }

            updateContextMenuOptions(isHighlighted, hasNote, false);
            event.preventDefault(); // 僅在顯示自定義選單時阻止預設選單
            // 使用 clientX/clientY（相對於視口）配合 position: fixed
            showContextMenu(event.clientX, event.clientY);
        }, false);
    }
    // ...其餘初始化邏輯...
    annotationContextMenuElement.addEventListener('click', async (event) => {
        let target = event.target;
        let action, color;

        // Prevent menu from closing itself if a menu item is clicked
        event.stopPropagation();

        if (target.classList.contains('color-option')) {
            const parentLi = target.closest('li[data-action]');
            if (parentLi) {
                 action = parentLi.dataset.action;
                 color = target.dataset.color;
            }
        } else {
            const li = target.closest('li[data-action]');
            if (li) {
                action = li.dataset.action;
            }
        }

        if (!action) {
            hideContextMenu(); // If clicked on non-action area within menu, hide it.
            return;
        }

        // 更新：在分塊對比模式下阻止所有指定操作
        if (window.currentVisibleTabId === 'chunk-compare' &&
            action && //確保 action 已定義
            (action === 'highlight-block' || action === 'remove-highlight' || action === 'add-note' || action === 'edit-note' || action === 'copy-content')) { // 新增 copy-content
            console.warn(`[批註邏輯] 在分塊對比模式下嘗試執行操作 '${action}'。此操作應已被UI阻止。`);
            hideContextMenu();
            return; // 阻止操作
        }

        // ===== 新增：跨子塊操作檢測 =====
        const isCrossBlockOperation = annotationContextMenuElement.dataset.contextIsCrossBlock === "true";
        if (isCrossBlockOperation) {
            return handleCrossBlockMenuAction(action, color, event);
        }
        
        const docId = getQueryParam('id');
        if (!docId) {
            alert('錯誤：無法獲取文件ID。');
            hideContextMenu();
            return;
        }

        // Retrieve context from the menu's dataset
        let currentContentIdentifier = annotationContextMenuElement.dataset.contextContentIdentifier
            || (window.globalCurrentSelection && window.globalCurrentSelection.contentIdentifierForSelection)
            || window.globalCurrentContentIdentifier; // 兜底
        let targetIdentifier = annotationContextMenuElement.dataset.contextTargetIdentifier || (window.globalCurrentSelection && (window.globalCurrentSelection.subBlockId || window.globalCurrentSelection.blockIndex));
        let identifierType = annotationContextMenuElement.dataset.contextIdentifierType || (window.globalCurrentSelection && (window.globalCurrentSelection.subBlockId ? 'subBlockId' : 'blockIndex'));
        let targetAnnotationId = annotationContextMenuElement.dataset.contextAnnotationId || (window.globalCurrentSelection && window.globalCurrentSelection.annotationId);
        let originalSelectedText = annotationContextMenuElement.dataset.contextSelectedText || (window.globalCurrentSelection && window.globalCurrentSelection.text);

        if ((!(currentContentIdentifier && identifierType && targetIdentifier)) &&
            (action === 'highlight-block' || action === 'add-note' || action === 'edit-note' || action === 'remove-highlight')) {
            console.log('context debug', {currentContentIdentifier, targetIdentifier, identifierType, targetAnnotationId, windowGlobal: window.globalCurrentSelection, windowGlobalContent: window.globalCurrentContentIdentifier});
            alert('請重新右鍵點選目標區塊後再操作。');
            hideContextMenu();
            return;
        }
        const hasValidContext = targetIdentifier && identifierType;
        if (!hasValidContext && (action === 'highlight-block' || action === 'add-note' || action === 'edit-note' || action === 'remove-highlight' || action === 'copy-content')) {
            alert('操作目標無效。請重新右鍵點選目標區塊。');
            console.error('[批註邏輯] Context menu action failed: targetIdentifier or identifierType from menu dataset is missing.');
            hideContextMenu();
            return;
        }

        let refreshNeeded = false;

        try {
            if (action === 'remove-highlight') {
                // identifierType is already from dataset
                await removeAnnotationFromTarget(docId, targetAnnotationId, targetIdentifier, currentContentIdentifier, identifierType);
                // 新增：只移除目標元素的醒目提示
                let targetElement = null;
                if (identifierType === 'subBlockId') {
                    const containerId = currentContentIdentifier + '-content-wrapper';
                    const container = document.getElementById(containerId);
                    if (container) {
                        targetElement = container.querySelector('.sub-block[data-sub-block-id="' + targetIdentifier + '"]');
                    }
                } else if (identifierType === 'blockIndex') {
                    const containerId = currentContentIdentifier + '-content-wrapper';
                    const container = document.getElementById(containerId);
                    if (container) {
                        targetElement = container.querySelector('[data-block-index="' + targetIdentifier + '"]');
                    }
                }
                if (targetElement && window.removeHighlightFromBlockOrSubBlock) {
                    window.removeHighlightFromBlockOrSubBlock(targetElement);
                }
                // 新增：區域性重新整理所有醒目提示，保證同步
                if (typeof window.applyBlockAnnotations === 'function') {
                    const containerId = currentContentIdentifier + '-content-wrapper';
                    const container = document.getElementById(containerId);
                    if (container) {
                        window.applyBlockAnnotations(container, window.data.annotations, currentContentIdentifier);
                    }
                }
                console.log(`${identifierType} 醒目提示已嘗試取消`);
                refreshNeeded = false; // 不再全量重新整理
            } else if (action === 'add-note' || action === 'edit-note') {
                // identifierType is from dataset
                const isCurrentlyHighlighted = checkIfTargetIsHighlighted(targetAnnotationId, currentContentIdentifier, targetIdentifier, identifierType);
                if (!isCurrentlyHighlighted) {
                    alert('只能對已醒目提示的區塊/子區塊操作批註。請先醒目提示。');
                } else {
                    let noteText;
                    let currentNoteContent = '';
                    if (action === 'edit-note') {
                        const existingAnnotation = window.data.annotations.find(a =>
                            a.targetType === currentContentIdentifier &&
                            (a.id === targetAnnotationId ||
                             (targetIdentifier && identifierType && a.target && a.target.selector && a.target.selector[0] &&
                              (a.target.selector[0][identifierType] === targetIdentifier || String(a.target.selector[0][identifierType]) === targetIdentifier)
                             )) &&
                             a.body && a.body.length > 0
                        );
                        currentNoteContent = existingAnnotation && existingAnnotation.body[0] ? existingAnnotation.body[0].value : '';
                        noteText = prompt("編輯批註內容：", currentNoteContent);
                    } else { // add-note
                        noteText = prompt("請輸入批註內容：", "");
                    }

                    if (noteText === null) { /* User cancelled */ }
                    else if (noteText.trim() === '') {
                        alert('批註內容不能為空。');
                    } else {
                        // 新增：同步 exact 欄位
                        let annotationToUpdate = window.data.annotations.find(a =>
                            a.targetType === currentContentIdentifier &&
                            (a.id === targetAnnotationId ||
                             (targetIdentifier && identifierType && a.target && a.target.selector && a.target.selector[0] &&
                              (a.target.selector[0][identifierType] === targetIdentifier || String(a.target.selector[0][identifierType]) === targetIdentifier)
                             ))
                        );
                        if (annotationToUpdate && window.globalCurrentSelection && window.globalCurrentSelection.targetElement) {
                            annotationToUpdate.target.selector[0].exact = window.globalCurrentSelection.targetElement.textContent.trim();
                        }
                        await addNoteToAnnotation(noteText, docId, targetAnnotationId, targetIdentifier, currentContentIdentifier, identifierType);
                        console.log(action === 'edit-note' ? `${identifierType} 批註已更新` : `批註已新增到現有 ${identifierType} 醒目提示`);
                        refreshNeeded = true;
                    }
                }
            } else if (action === 'highlight-block') {
                // 可選：禁止整塊醒目提示（透過本地開關）
                try {
                    const disableBlock = localStorage.getItem('DISABLE_BLOCK_HIGHLIGHT') === 'true';
                    if (disableBlock && identifierType === 'blockIndex') {
                        alert('已禁用整塊醒目提示，請在子塊內選中要醒目提示的文字。');
                        hideContextMenu();
                        return;
                    }
                } catch { /* noop */ }

                // 優先按當前選區的起點子塊來醒目提示，避免“跳到上面一段”
                try {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount) {
                        const r = sel.getRangeAt(0);
                        if (!r.collapsed) {
                            const startEl = r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer;
                            const subFromSelection = startEl && startEl.closest ? startEl.closest('.sub-block[data-sub-block-id]') : null;
                            if (subFromSelection) {
                                identifierType = 'subBlockId';
                                identifier = subFromSelection.dataset.subBlockId;
                                targetIdentifier = identifier;
                                targetElementForAnnotation = subFromSelection;
                            }
                        }
                    }
                } catch { /* ignore */ }
                // 允許未選顏色，預設黃色
                if (!color) { color = 'yellow'; }
                {
                    // 預判是否為子塊內片段選擇
                    let isSubBlockRange = false;
                    try {
                        isSubBlockRange = (identifierType === 'subBlockId' && window.globalCurrentSelection && window.globalCurrentSelection.range && window.globalCurrentSelection.targetElement);
                    } catch { isSubBlockRange = false; }
                    // ====== 修正：醒目提示儲存前去重，保證唯一性 ======
                    // 先查詢所有同 target 的 annotation
                    const duplicateAnnotations = window.data.annotations.filter(ann =>
                        ann.targetType === currentContentIdentifier &&
                        ann.target && ann.target.selector && ann.target.selector[0] &&
                        (ann.target.selector[0][identifierType] === targetIdentifier || String(ann.target.selector[0][identifierType]) === targetIdentifier) &&
                        (ann.motivation === 'highlighting' || ann.motivation === 'commenting')
                    );
                    // 子塊內片段：允許同一子塊多段並存，不做去重/合併
                    let existingAnnotationForTarget = isSubBlockRange ? null : duplicateAnnotations[0];
                    if (!isSubBlockRange) {
                        // 如果有多個，移除多餘的，只保留第一個（僅限非片段場景）
                        if (duplicateAnnotations.length > 1) {
                            for (let i = 1; i < duplicateAnnotations.length; i++) {
                                await removeAnnotationFromTarget(docId, duplicateAnnotations[i].id, targetIdentifier, currentContentIdentifier, identifierType);
                            }
                        }
                    }
                    if (existingAnnotationForTarget) {
                        existingAnnotationForTarget.highlightColor = color;
                        existingAnnotationForTarget.modified = new Date().toISOString();
                        if (existingAnnotationForTarget.motivation !== 'commenting') {
                           existingAnnotationForTarget.motivation = 'highlighting';
                        }
                        // 如果是單子塊並且存在選區，則轉換/更新為區間選擇
                        if (identifierType === 'subBlockId' && window.globalCurrentSelection && window.globalCurrentSelection.range && window.globalCurrentSelection.targetElement) {
                            try {
                                const el = window.globalCurrentSelection.targetElement;
                                const selRange = window.globalCurrentSelection.range;
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
                                const fragTextLenExclFormula = (frag) => {
                                    const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null, false);
                                    let len = 0, node;
                                    while ((node = walker.nextNode())) { if (!isInFormula(node)) len += (node.nodeValue || '').length; }
                                    return len;
                                };
                                const calcOffset = (endNode, endOffset) => {
                                    const r = document.createRange();
                                    r.selectNodeContents(el);
                                    r.setEnd(endNode, endOffset);
                                    return fragTextLenExclFormula(r.cloneContents());
                                };
                                const sOff = calcOffset(selRange.startContainer, selRange.startOffset);
                                const eOff = calcOffset(selRange.endContainer, selRange.endOffset);
                                const startOffset = Math.max(0, Math.min(sOff, eOff));
                                const endOffset = Math.max(0, Math.max(sOff, eOff));
                                const exactSel = (window.globalCurrentSelection.text || '').trim();
                                if (!existingAnnotationForTarget.target.selector[0] || existingAnnotationForTarget.target.selector[0].type !== 'SubBlockRangeSelector') {
                                    existingAnnotationForTarget.target.selector[0] = { type: 'SubBlockRangeSelector', subBlockId: targetIdentifier };
                                }
                                existingAnnotationForTarget.target.selector[0].startOffset = startOffset;
                                existingAnnotationForTarget.target.selector[0].endOffset = endOffset;
                                if (exactSel) existingAnnotationForTarget.target.selector[0].exact = exactSel;
                            } catch (e) { /* ignore and fallback */ }
                        } else if (window.globalCurrentSelection && window.globalCurrentSelection.targetElement) {
                            // 同步 exact 欄位（整塊醒目提示）
                            existingAnnotationForTarget.target.selector[0].exact = window.globalCurrentSelection.targetElement.textContent.trim();
                        }
                        await updateAnnotationInDB(existingAnnotationForTarget);
                        // 新增：只醒目提示目標元素
                        let targetElement = null;
                        if (identifierType === 'subBlockId') {
                            const containerId = currentContentIdentifier + '-content-wrapper';
                            const container = document.getElementById(containerId);
                            if (container) {
                                targetElement = container.querySelector('.sub-block[data-sub-block-id="' + targetIdentifier + '"]');
                            }
                        } else if (identifierType === 'blockIndex') {
                            const containerId = currentContentIdentifier + '-content-wrapper';
                            const container = document.getElementById(containerId);
                            if (container) {
                                targetElement = container.querySelector('[data-block-index="' + targetIdentifier + '"]');
                            }
                        }
                        if (targetElement && window.highlightBlockOrSubBlock) {
                            window.highlightBlockOrSubBlock(targetElement, existingAnnotationForTarget, currentContentIdentifier, targetIdentifier, identifierType === 'subBlockId' ? 'subBlock' : 'block');
                        }
                        console.log(`${identifierType} 醒目提示顏色已更新:`, existingAnnotationForTarget);
                        refreshNeeded = true;
                    } else {
                        const newAnnotation = {
                            '@context': 'http://www.w3.org/ns/anno.jsonld',
                            id: 'urn:uuid:' + _page_generateUUID(),
                            type: 'Annotation',
                            motivation: 'highlighting',
                            created: new Date().toISOString(),
                            docId: docId,
                            targetType: currentContentIdentifier,
                            highlightColor: color,
                            target: {
                                source: docId,
                                selector: [{
                                    type: identifierType === 'subBlockId' ? 'SubBlockSelector' : 'BlockSelector',
                                }]
                            },
                            body: []
                        };
                        newAnnotation.target.selector[0][identifierType] = targetIdentifier;
                        // 單子塊 + 存在選區：改為區間選擇
                        if (identifierType === 'subBlockId' && window.globalCurrentSelection && window.globalCurrentSelection.range && window.globalCurrentSelection.targetElement) {
                            try {
                                const el = window.globalCurrentSelection.targetElement;
                                const selRange = window.globalCurrentSelection.range;
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
                                const fragTextLenExclFormula = (frag) => {
                                    const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null, false);
                                    let len = 0, node;
                                    while ((node = walker.nextNode())) { if (!isInFormula(node)) len += (node.nodeValue || '').length; }
                                    return len;
                                };
                                const calcOffset = (endNode, endOffset) => {
                                    const r = document.createRange();
                                    r.selectNodeContents(el);
                                    r.setEnd(endNode, endOffset);
                                    return fragTextLenExclFormula(r.cloneContents());
                                };
                                const sOff = calcOffset(selRange.startContainer, selRange.startOffset);
                                const eOff = calcOffset(selRange.endContainer, selRange.endOffset);
                                const startOffset = Math.max(0, Math.min(sOff, eOff));
                                const endOffset = Math.max(0, Math.max(sOff, eOff));
                                const exactSel = (window.globalCurrentSelection.text || '').trim();
                                newAnnotation.target.selector[0] = {
                                    type: 'SubBlockRangeSelector',
                                    subBlockId: targetIdentifier,
                                    startOffset: startOffset,
                                    endOffset: endOffset,
                                    exact: exactSel
                                };
                            } catch (e) {
                                // 回退整塊
                                if (window.globalCurrentSelection && window.globalCurrentSelection.targetElement) {
                                    newAnnotation.target.selector[0].exact = window.globalCurrentSelection.targetElement.textContent.trim();
                                } else if (originalSelectedText) {
                                    newAnnotation.target.selector[0].exact = originalSelectedText;
                                }
                            }
                        } else {
                            // 新建時寫入 exact（整塊）
                            if (window.globalCurrentSelection && window.globalCurrentSelection.targetElement) {
                                newAnnotation.target.selector[0].exact = window.globalCurrentSelection.targetElement.textContent.trim();
                            } else if (originalSelectedText) {
                                newAnnotation.target.selector[0].exact = originalSelectedText;
                            }
                        }
                        const contextBlockIndex = annotationContextMenuElement.dataset.contextBlockIndex;
                        if (identifierType === 'subBlockId' && contextBlockIndex) {
                            newAnnotation.target.selector[0].blockIndex = contextBlockIndex;
                        }
                        await saveAnnotationToDB(newAnnotation);
                        if (!window.data.annotations) window.data.annotations = [];
                        window.data.annotations.push(newAnnotation);
                        // 新增：只醒目提示目標元素
                        let targetElement = null;
                        if (identifierType === 'subBlockId') {
                            const containerId = currentContentIdentifier + '-content-wrapper';
                            const container = document.getElementById(containerId);
                            if (container) {
                                targetElement = container.querySelector('.sub-block[data-sub-block-id="' + targetIdentifier + '"]');
                            }
                        } else if (identifierType === 'blockIndex') {
                            const containerId = currentContentIdentifier + '-content-wrapper';
                            const container = document.getElementById(containerId);
                            if (container) {
                                targetElement = container.querySelector('[data-block-index="' + targetIdentifier + '"]');
                            }
                        }
                        if (targetElement && window.highlightBlockOrSubBlock) {
                            window.highlightBlockOrSubBlock(targetElement, newAnnotation, currentContentIdentifier, targetIdentifier, identifierType === 'subBlockId' ? 'subBlock' : 'block');
                        }
                        refreshNeeded = true;
                        console.log(`新 ${identifierType} 醒目提示已儲存:`, newAnnotation);
                    }
                    refreshNeeded = false; // 不再全量重新整理
                }
            } else if (action === 'copy-content') {
                let textToCopy = originalSelectedText; // Default to textContent
                const contextBlockIndex = annotationContextMenuElement.dataset.contextBlockIndex;
                // 唯一子塊判斷邏輯修正
                if (identifierType === 'blockIndex' && currentContentIdentifier && targetIdentifier) {
                    const blockIndex = parseInt(targetIdentifier, 10);
                    if (!isNaN(blockIndex) &&
                        window.currentBlockTokensForCopy &&
                        window.currentBlockTokensForCopy[currentContentIdentifier] &&
                        window.currentBlockTokensForCopy[currentContentIdentifier][blockIndex] &&
                        typeof window.currentBlockTokensForCopy[currentContentIdentifier][blockIndex].raw === 'string') {
                        textToCopy = window.currentBlockTokensForCopy[currentContentIdentifier][blockIndex].raw;
                        console.log(`[批註邏輯] 複製塊級內容: 使用來自 currentBlockTokensForCopy 的原始 Markdown (塊索引: ${blockIndex})。`);
                    } else {
                        console.warn(`[批註邏輯] 複製塊級內容: 無法從 currentBlockTokensForCopy 獲取原始 Markdown (塊索引: ${blockIndex})，回退到 textContent。`);
                    }
                } else if (identifierType === 'subBlockId' && currentContentIdentifier && contextBlockIndex) {
                    // 統計 annotation 裡所有屬於該父塊的唯一子塊
                    const parentBlockIndex = parseInt(contextBlockIndex, 10);
                    const allSubBlockIds = window.data.annotations
                        .map(a => a.target && a.target.selector && a.target.selector[0] && a.target.selector[0].subBlockId)
                        .filter(id => id && id.startsWith(`${parentBlockIndex}.`));
                    const uniqueSubBlockIds = Array.from(new Set(allSubBlockIds));
                    if (uniqueSubBlockIds.length === 1 &&
                        window.currentBlockTokensForCopy &&
                        window.currentBlockTokensForCopy[currentContentIdentifier] &&
                        window.currentBlockTokensForCopy[currentContentIdentifier][parentBlockIndex] &&
                        typeof window.currentBlockTokensForCopy[currentContentIdentifier][parentBlockIndex].raw === 'string') {
                        textToCopy = window.currentBlockTokensForCopy[currentContentIdentifier][parentBlockIndex].raw;
                        console.log(`[批註邏輯] 複製唯一的子塊: 使用其父塊的原始 Markdown (父塊索引: ${parentBlockIndex})。`);
                    } else {
                        // 不是唯一子塊，或無法獲取父塊內容，回退到子塊的 textContent
                        console.log(`[批註邏輯] 複製子塊 (非唯一或無父塊資訊) 或其他內容: 使用 textContent。`);
                        // textToCopy remains originalSelectedText (sub-block's textContent)
                    }
                } else {
                    // 其它情況
                    console.log(`[批註邏輯] 複製子塊 (非唯一或無父塊資訊) 或其他內容: 使用 textContent。`);
                    // textToCopy remains originalSelectedText (textContent)
                }

                if (!textToCopy) { // originalSelectedText could be empty if target has no text
                    alert('沒有可選擇的內容進行復制。');
                } else {
                    navigator.clipboard.writeText(textToCopy)
                        .then(() => {
                            console.log(`文字已複製 (來源: ${identifierType === 'blockIndex' ? '原始Markdown或textContent' : 'textContent'}): ${String(textToCopy).substring(0,50)}...`);
                            // alert('內容已複製!'); // Optional
                        })
                        .catch(err => {
                            console.error(`複製失敗:`, err);
                            alert('複製內容失敗。');
                        });
                }
            }
        } catch (error) {
            console.error(`[批註系統] 操作 '${action}' 失敗:`, error);
            alert(`操作失敗: ${error.message}`);
        } finally {
            hideContextMenu(); // Always hide menu after action or error
            if (refreshNeeded) {
                // ========== 最佳化：只區域性重新整理醒目提示和批註事件 ==========
                // 只在 OCR/translation tab 下區域性重新整理，不再全量 showTab
                const tab = window.currentVisibleTabId;
                let containerId = null;
                let contentIdentifier = null;
                if (tab === 'ocr') {
                    containerId = 'ocr-content-wrapper';
                    contentIdentifier = 'ocr';
                } else if (tab === 'translation') {
                    containerId = 'translation-content-wrapper';
                    contentIdentifier = 'translation';
                }
                if (containerId && typeof window.applyBlockAnnotations === 'function') {
                    const container = document.getElementById(containerId);
                    if (container) {
                        window.applyBlockAnnotations(container, window.data.annotations, contentIdentifier);
                    }
                }
                if (containerId && typeof window.addAnnotationListenersToContainer === 'function') {
                    window.addAnnotationListenersToContainer(containerId, contentIdentifier);
                }
                // Dock/TOC統計也可區域性重新整理（可選）
                if (window.DockLogic && typeof window.DockLogic.updateStats === 'function') {
                    window.DockLogic.updateStats(window.data, window.currentVisibleTabId);
                }
                if (typeof window.refreshTocList === 'function') {
                    window.refreshTocList();
                }
                if(typeof window.updateReadingProgress === 'function') window.updateReadingProgress();
                // =====================================================
                // 只有在內容結構變化時才需要全量 showTab
                // if (typeof window.showTab === 'function' && window.currentVisibleTabId) {
                //     const currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
                //     await Promise.resolve(window.showTab(window.currentVisibleTabId));
                //     requestAnimationFrame(() => {
                //         document.documentElement.scrollTop = document.body.scrollTop = currentScroll;
                //         if(typeof window.updateReadingProgress === 'function') window.updateReadingProgress();
                //     });
                // } else {
                //     console.warn("[批註系統] window.showTab 或 window.currentVisibleTabId 不可用，無法自動重新整理檢視。");
                // }
            }
        }
    });

    document.addEventListener('click', (event) => {
        if (annotationContextMenuElement && annotationContextMenuElement.classList.contains('context-menu-visible') &&
            !annotationContextMenuElement.contains(event.target)) {
            if (event.target.classList.contains('color-option')) return;
            hideContextMenu();
        }
    });
    // 額外：滾動/視窗變化/Esc 時隱藏選單，避免“選單殘留”
    try {
        document.addEventListener('scroll', hideContextMenu, true);
        window.addEventListener('resize', hideContextMenu);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); }, true);
    } catch { /* noop */ }
    // console.log("[批註系統] 事件監聽器已新增 (子塊/塊級模式)。");
}

// ===== 新增：跨子塊選擇檢測函式 =====
function detectCrossBlockSelection() {
    const selection = window.getSelection();
    console.log('[跨子塊檢測] 當前選區:', selection);
    console.log('[跨子塊檢測] 選區範圍數:', selection.rangeCount);
    
    if (!selection.rangeCount) {
        console.log('[跨子塊檢測] 沒有選區範圍');
        return { isCrossBlock: false };
    }
    
    const range = selection.getRangeAt(0);
    console.log('[跨子塊檢測] 選區範圍:', range);
    console.log('[跨子塊檢測] 選區是否摺疊:', range.collapsed);
    console.log('[跨子塊檢測] 選中文字:', selection.toString());
    
    if (range.collapsed) {
        console.log('[跨子塊檢測] 選區已摺疊，不是有效選擇');
        return { isCrossBlock: false };
    }
    
    // 檢測選擇範圍是否跨越多個子塊
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    console.log('[跨子塊檢測] 開始容器:', startContainer);
    console.log('[跨子塊檢測] 結束容器:', endContainer);
    
    // 輔助函式：獲取元素在父元素中的文字偏移（忽略公式內部文字）
    const getTextOffsetInElement = (element, parentElement) => {
        let offset = 0;
        const isFormulaNode = (n) => {
            let p = n && (n.nodeType === Node.TEXT_NODE ? n.parentElement : n);
            while (p) {
                if (p.classList && (p.classList.contains('katex') || p.classList.contains('katex-display') || p.classList.contains('katex-inline'))) return true;
                p = p.parentElement;
            }
            return false;
        };
        const walker = document.createTreeWalker(parentElement, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node === element || node.parentElement === element) break;
            if (!isFormulaNode(node)) offset += (node.textContent || '').length;
        }
        return offset;
    };
    
    // 輔助函式：根據文字偏移找到對應的子塊
    const findSubBlockByTextOffset = (blockElement, textOffset) => {
        const subBlocks = blockElement.querySelectorAll('.sub-block[data-sub-block-id]');
        let currentOffset = 0;
        
        for (const subBlock of subBlocks) {
            const subBlockTextLength = subBlock.textContent.length;
            if (textOffset >= currentOffset && textOffset < currentOffset + subBlockTextLength) {
                return subBlock;
            }
            currentOffset += subBlockTextLength;
        }
        return null;
    };
    
    // 改進：更準確地找到包含的子塊或塊級元素
    const findParentSubBlock = (node, debugPrefix = '') => {
        // 如果是文位元組點，從父元素開始查詢
        let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        // 若起點在公式內部，先提升到公式容器，以保證後續最近子塊判定穩定
        const formulaContainer = element.closest && element.closest('.katex, .katex-display, .katex-inline');
        if (formulaContainer) {
            element = formulaContainer;
        }
        
        // 查詢所屬的塊級元素，用於除錯
        const blockElement = element.closest('[data-block-index]');
        console.log(`[跨子塊檢測] ${debugPrefix}查詢子塊，起始元素:`, element);
        console.log(`[跨子塊檢測] ${debugPrefix}元素標籤:`, element.tagName);
        console.log(`[跨子塊檢測] ${debugPrefix}所屬段落:`, blockElement?.dataset?.blockIndex || '未找到');

        // 首先查詢最近的子塊
        const subBlock = element.closest('.sub-block[data-sub-block-id]');
        console.log(`[跨子塊檢測] ${debugPrefix}找到的子塊:`, subBlock?.dataset?.subBlockId || 'null');
        
        if (subBlock) {
            return subBlock;
        }
        
        // 如果沒找到子塊，查詢塊級元素
        console.log(`[跨子塊檢測] ${debugPrefix}找到的塊級元素:`, blockElement);
        
        if (blockElement) {
            // 檢查這個塊是否已經被分段成子塊
            const childSubBlocks = blockElement.querySelectorAll('.sub-block[data-sub-block-id]');
            console.log('[跨子塊檢測] 塊級元素的子塊數量:', childSubBlocks.length);
            
            if (childSubBlocks.length > 0) {
                // 如果有子塊，需要確定具體是哪個子塊
                // 根據selection的位置來判斷
                const textOffset = getTextOffsetInElement(element, blockElement);
                const targetSubBlock = findSubBlockByTextOffset(blockElement, textOffset);
                console.log('[跨子塊檢測] 根據文字偏移找到的子塊:', targetSubBlock);
                return targetSubBlock || childSubBlocks[0]; // 如果找不到就返回第一個
            } else {
                // 如果沒有子塊，優先嚐試自動分段（支援英文）
                if (window.SubBlockSegmenter && typeof window.SubBlockSegmenter.segment === 'function') {
                    try {
                        console.log('[跨子塊檢測] 塊級元素未分段，觸發針對該塊的自動分段 (force=true)');
                        // 在分段之前先計算選區在該塊內的文字偏移
                        const preTextOffset = getTextOffsetInElement(element, blockElement);
                        window.SubBlockSegmenter.segment(blockElement, blockElement.dataset.blockIndex, true);
                        const childAfter = blockElement.querySelectorAll('.sub-block[data-sub-block-id]');
                        console.log('[跨子塊檢測] 自動分段後子塊數量:', childAfter.length);
                        if (childAfter.length > 0) {
                            // 移除之前可能打在塊上的虛擬 subBlockId，避免與真實子塊衝突
                            if (blockElement._virtualSubBlockId) delete blockElement._virtualSubBlockId;
                            if (blockElement.dataset && blockElement.dataset.subBlockId) delete blockElement.dataset.subBlockId;
                            // 使用分段前計算的偏移，對映到具體子塊
                            const targetSubBlock2 = findSubBlockByTextOffset(blockElement, preTextOffset);
                            console.log('[跨子塊檢測] 自動分段後根據偏移找到的子塊:', targetSubBlock2);
                            return targetSubBlock2 || childAfter[0];
                        }
                    } catch (e) {
                        console.warn('[跨子塊檢測] 單塊自動分段失敗:', e);
                    }
                }
                // 仍無子塊，建立虛擬子塊標識
                console.log(`[跨子塊檢測] ${debugPrefix}塊級元素未分段，建立虛擬子塊標識`);
                
                // 改進：確保虛擬子塊ID的唯一性
                const proposedId = blockElement.dataset.blockIndex + '.0';
                
                // 檢查是否已經被標記過（避免重複標記）
                if (!blockElement.dataset.subBlockId) {
                    blockElement._virtualSubBlockId = proposedId;
                    blockElement.dataset.subBlockId = proposedId;
                    console.log(`[跨子塊檢測] ${debugPrefix}建立虛擬子塊ID: ${proposedId}`);
                } else {
                    console.log(`[跨子塊檢測] ${debugPrefix}塊級元素已有子塊ID: ${blockElement.dataset.subBlockId}`);
                }
                return blockElement;
            }
        }
        
        // 除錯：檢視父元素層次
        let parent = element;
        let level = 0;
        while (parent && level < 5) {
            console.log(`[跨子塊檢測] 父元素層次${level}:`, parent.tagName, parent.className, parent.dataset);
            parent = parent.parentElement;
            level++;
        }
        
        return null;
    };
    
    const startSubBlock = findParentSubBlock(startContainer, '開始容器-');
    const endSubBlock = findParentSubBlock(endContainer, '結束容器-');
    
    console.log('[跨子塊檢測] 開始子塊:', startSubBlock);
    console.log('[跨子塊檢測] 結束子塊:', endSubBlock);
    console.log('[跨子塊檢測] 開始子塊ID:', startSubBlock?.dataset?.subBlockId);
    console.log('[跨子塊檢測] 結束子塊ID:', endSubBlock?.dataset?.subBlockId);
    
    if (!startSubBlock || !endSubBlock) {
        console.log('[跨子塊檢測] 找不到開始或結束子塊');
        return { isCrossBlock: false };
    }
    
    // 比較子塊識別符號而不是DOM元素
    const startId = startSubBlock.dataset.subBlockId || startSubBlock._virtualSubBlockId;
    const endId = endSubBlock.dataset.subBlockId || endSubBlock._virtualSubBlockId;
    
    console.log('[跨子塊檢測] 開始子塊ID:', startId);
    console.log('[跨子塊檢測] 結束子塊ID:', endId);
    
    // 改進：更嚴格的跨子塊判斷邏輯
    if (startId !== endId) {
        // 跨子塊選擇
        console.log('[跨子塊檢測] ✅ 檢測到跨子塊選擇！');
        const affectedSubBlocks = getSubBlocksInRange(range, startSubBlock, endSubBlock);
        console.log('[跨子塊檢測] 影響的子塊:', affectedSubBlocks);
        return {
            isCrossBlock: true,
            startSubBlock: startSubBlock,
            endSubBlock: endSubBlock,
            affectedSubBlocks: affectedSubBlocks,
            selectedText: selection.toString(),
            range: range
        };
    }
    
    // 額外檢查：即使子塊ID相同，也要檢查是否真的是同一個DOM元素
    if (startSubBlock !== endSubBlock) {
        console.log('[跨子塊檢測] ✅ 檢測到跨DOM元素選擇（子塊ID相同但DOM不同）！');
        console.log('[跨子塊檢測] 開始DOM:', startSubBlock);
        console.log('[跨子塊檢測] 結束DOM:', endSubBlock);
        
        // 這種情況說明有問題，但仍然按跨子塊處理
        const affectedSubBlocks = getSubBlocksInRange(range, startSubBlock, endSubBlock);
        console.log('[跨子塊檢測] 影響的子塊:', affectedSubBlocks);
        return {
            isCrossBlock: true,
            startSubBlock: startSubBlock,
            endSubBlock: endSubBlock,
            affectedSubBlocks: affectedSubBlocks,
            selectedText: selection.toString(),
            range: range
        };
    }
    
    console.log('[跨子塊檢測] 選擇在同一個子塊內');
    return { isCrossBlock: false };
}

// ===== 新增：獲取範圍內的所有子塊 =====
function getSubBlocksInRange(range, startSubBlock, endSubBlock) {
    const subBlocks = [];
    const commonAncestor = range.commonAncestorContainer;
    const container = commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentElement : commonAncestor;
    
    console.log('[獲取範圍內子塊] 公共祖先容器:', container);
    console.log('[獲取範圍內子塊] 開始子塊:', startSubBlock);
    console.log('[獲取範圍內子塊] 結束子塊:', endSubBlock);
    
    // 獲取開始和結束子塊的ID
    const startId = startSubBlock.dataset.subBlockId || startSubBlock._virtualSubBlockId;
    const endId = endSubBlock.dataset.subBlockId || endSubBlock._virtualSubBlockId;
    
    console.log('[獲取範圍內子塊] 開始子塊ID:', startId);
    console.log('[獲取範圍內子塊] 結束子塊ID:', endId);
    
    // 首先確保包含開始和結束子塊
    if (startId) {
        subBlocks.push({
            element: startSubBlock,
            subBlockId: startId,
            text: startSubBlock.textContent || '',
            isFullySelected: false,
            isVirtual: !startSubBlock.classList.contains('sub-block')
        });
        console.log('[獲取範圍內子塊] 新增開始子塊:', startId);
    }
    
    if (endId && endId !== startId) {
        subBlocks.push({
            element: endSubBlock,
            subBlockId: endId,
            text: endSubBlock.textContent || '',
            isFullySelected: false,
            isVirtual: !endSubBlock.classList.contains('sub-block')
        });
        console.log('[獲取範圍內子塊] 新增結束子塊:', endId);
    }
    
    // 查詢中間的子塊（優先真實子塊，否則按塊級虛擬子塊）
    const allSubBlocks = container.querySelectorAll('.sub-block[data-sub-block-id]');
    console.log('[獲取範圍內子塊] 找到的真實子塊數量:', allSubBlocks.length);

    if (allSubBlocks.length > 0) {
        // 使用更準確的範圍檢測：先新增所有真實子塊
        for (const subBlock of allSubBlocks) {
            const subBlockId = subBlock.dataset.subBlockId;

            // 跳過已經新增的開始和結束子塊
            if (subBlockId === startId || subBlockId === endId) {
                continue;
            }

            // 檢查子塊是否在選擇範圍內
            if (range.intersectsNode(subBlock)) {
                subBlocks.push({
                    element: subBlock,
                    subBlockId: subBlockId,
                    text: subBlock.textContent || '',
                    isFullySelected: range.containsNode ? range.containsNode(subBlock) : false
                });
                console.log('[獲取範圍內子塊] 新增中間子塊(真實):', subBlockId);
            }
        }

        // 同時補充：對範圍內“沒有真實子塊”的段落，建立虛擬子塊，避免中間段落遺漏
        const top = container.closest && (container.closest('#ocr-content-wrapper, #translation-content-wrapper') || container.closest('[data-block-index]')?.parentElement) || document;
        const allBlocksInside = top.querySelectorAll('[data-block-index]');
        const startBlockEl = startSubBlock.closest('[data-block-index]') || startSubBlock;
        const endBlockEl = endSubBlock.closest('[data-block-index]') || endSubBlock;
        const startIdxNum = parseInt(startBlockEl.dataset.blockIndex, 10);
        const endIdxNum = parseInt(endBlockEl.dataset.blockIndex, 10);
        const lowIdx = Math.min(startIdxNum, endIdxNum);
        const highIdx = Math.max(startIdxNum, endIdxNum);

        allBlocksInside.forEach(blockEl => {
            const bi = parseInt(blockEl.dataset.blockIndex, 10);
            if (isNaN(bi) || bi < lowIdx || bi > highIdx) return;
            if (!range.intersectsNode(blockEl)) return;

            const childSbs = blockEl.querySelectorAll('.sub-block[data-sub-block-id]');
            const hasRealSubBlocks = childSbs.length > 0;
            const hasAnyAdded = subBlocks.some(sb => sb.subBlockId && String(sb.subBlockId).startsWith(String(bi) + '.'));
            const isStartOrEnd = (String(bi) + '.0' === startId) || (String(bi) + '.0' === endId);

            if (!hasRealSubBlocks && !hasAnyAdded) {
                // 為沒有真實子塊的段落建立虛擬子塊
                const virtualId = String(bi) + '.0';
                if (!isStartOrEnd) {
                    blockEl._virtualSubBlockId = virtualId;
                    blockEl.dataset.subBlockId = virtualId;
                }
                subBlocks.push({
                    element: blockEl,
                    subBlockId: virtualId,
                    text: blockEl.textContent || '',
                    isFullySelected: range.containsNode ? range.containsNode(blockEl) : false,
                    isVirtual: true
                });
                console.log('[獲取範圍內子塊] 新增中間子塊(虛擬，無真實子塊的段落):', virtualId);
            }
        });
    } else {
        // 沒有真實子塊：按塊級元素範圍生成虛擬子塊，確保中間塊不會漏掉
        console.log('[獲取範圍內子塊] 無真實子塊，採用塊級虛擬子塊走訪');
        // 嘗試找到更高的容器（如 ocr/translation 包裹）
        let topContainer = container.closest && (container.closest('#ocr-content-wrapper, #translation-content-wrapper') || container.closest('[data-block-index]')?.parentElement) || document;
        const allBlocks = topContainer.querySelectorAll('[data-block-index]');
        console.log('[獲取範圍內子塊] 塊級元素數量:', allBlocks.length);

        // 獲取起止 blockIndex
        const startBlockEl = startSubBlock.closest('[data-block-index]') || startSubBlock;
        const endBlockEl = endSubBlock.closest('[data-block-index]') || endSubBlock;
        const startIdx = parseInt(startBlockEl.dataset.blockIndex, 10);
        const endIdx = parseInt(endBlockEl.dataset.blockIndex, 10);
        const low = Math.min(startIdx, endIdx);
        const high = Math.max(startIdx, endIdx);

        allBlocks.forEach(blockEl => {
            const bi = parseInt(blockEl.dataset.blockIndex, 10);
            if (isNaN(bi) || bi < low || bi > high) return;
            if (!range.intersectsNode(blockEl)) return;

            // 如果已有真實子塊（某些頁面後續會動態分割），優先真實子塊
            const subBlocksOfBlock = blockEl.querySelectorAll('.sub-block[data-sub-block-id]');
            if (subBlocksOfBlock.length > 0) {
                subBlocksOfBlock.forEach(sb => {
                    const id = sb.dataset.subBlockId;
                    if (id === startId || id === endId) return;
                    subBlocks.push({
                        element: sb,
                        subBlockId: id,
                        text: sb.textContent || '',
                        isFullySelected: range.containsNode ? range.containsNode(sb) : false
                    });
                    console.log('[獲取範圍內子塊] 新增中間子塊(真實):', id);
                });
            } else {
                // 建立虛擬子塊ID：blockIndex.0
                const virtualId = blockEl.dataset.blockIndex + '.0';
                if (virtualId === startId || virtualId === endId) return;
                blockEl._virtualSubBlockId = virtualId;
                blockEl.dataset.subBlockId = virtualId;
                subBlocks.push({
                    element: blockEl,
                    subBlockId: virtualId,
                    text: blockEl.textContent || '',
                    isFullySelected: range.containsNode ? range.containsNode(blockEl) : false,
                    isVirtual: true
                });
                console.log('[獲取範圍內子塊] 新增中間子塊(虛擬):', virtualId);
            }
        });
    }
    
    // 去重
    const uniqueMap = new Map();
    subBlocks.forEach(sb => {
        if (!uniqueMap.has(sb.subBlockId)) uniqueMap.set(sb.subBlockId, sb);
    });
    let uniqueSubBlocks = Array.from(uniqueMap.values());

    // 按文件順序排序，確保從起點到終點連續
    uniqueSubBlocks.sort((a, b) => {
        if (a.element === b.element) return 0;
        const pos = a.element.compareDocumentPosition(b.element);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
    });

    console.log('[獲取範圍內子塊] 最終結果(文件順序):', uniqueSubBlocks);
    return uniqueSubBlocks;
}

// ===== 新增：處理跨子塊標註 =====
function handleCrossBlockAnnotation(event, crossBlockInfo) {
    event.preventDefault();
    
    console.log(`[跨子塊標註] 檢測到跨子塊選擇，涉及 ${crossBlockInfo.affectedSubBlocks.length} 個子塊`);
    
    // 新增：判斷是否為只讀檢視 (分塊對比模式)
    const isReadOnlyView = window.currentVisibleTabId === 'chunk-compare';
    if (isReadOnlyView) {
        hideContextMenu();
        return;
    }
    
    // 生成跨子塊標註ID
    const crossBlockAnnotationId = 'cross-' + _page_generateUUID();
    
    // 設定全域選擇資訊
    window.globalCurrentSelection = {
        text: crossBlockInfo.selectedText,
        range: crossBlockInfo.range.cloneRange(),
        isCrossBlock: true,
        crossBlockAnnotationId: crossBlockAnnotationId,
        affectedSubBlocks: crossBlockInfo.affectedSubBlocks,
        startSubBlock: crossBlockInfo.startSubBlock,
        endSubBlock: crossBlockInfo.endSubBlock,
        contentIdentifierForSelection: window.globalCurrentContentIdentifier,
        targetElement: crossBlockInfo.startSubBlock // 使用起始子塊作為代表
    };
    
    // 在上下文選單上儲存資訊
    annotationContextMenuElement.dataset.contextContentIdentifier = window.globalCurrentContentIdentifier;
    annotationContextMenuElement.dataset.contextIsCrossBlock = "true";
    annotationContextMenuElement.dataset.contextCrossBlockAnnotationId = crossBlockAnnotationId;
    annotationContextMenuElement.dataset.contextSelectedText = crossBlockInfo.selectedText;
    annotationContextMenuElement.dataset.contextAffectedSubBlocks = JSON.stringify(
        crossBlockInfo.affectedSubBlocks.map(sb => sb.subBlockId)
    );
    
    // 檢查是否已經有跨子塊標註
    const isHighlighted = checkCrossBlockHighlight(crossBlockInfo.affectedSubBlocks);
    const hasNote = checkCrossBlockNote(crossBlockInfo.affectedSubBlocks);
    
    console.log(`[跨子塊標註] 醒目提示狀態: ${isHighlighted}, 有批註: ${hasNote}`);

    window.globalCurrentHighlightStatus = isHighlighted;
    updateCrossBlockContextMenuOptions(isHighlighted, hasNote);
    // 使用 clientX/clientY（相對於視口）配合 position: fixed
    showContextMenu(event.clientX, event.clientY);
}

// ===== 修改：檢查跨子塊醒目提示狀態 =====
function checkCrossBlockHighlight(affectedSubBlocks) {
    if (!window.data || !window.data.annotations) return false;
    
    const affectedSubBlockIds = affectedSubBlocks.map(sb => sb.subBlockId);
    
    // 查詢跨子塊標註
    const crossBlockAnnotation = findCrossBlockAnnotation(affectedSubBlockIds, window.globalCurrentContentIdentifier);
    if (crossBlockAnnotation) {
        return true;
    }
    
    // 備用檢查：是否所有子塊都被獨立醒目提示（相容舊資料）
    for (const subBlock of affectedSubBlocks) {
        const hasHighlight = window.data.annotations.some(ann => 
            ann.targetType === window.globalCurrentContentIdentifier &&
            ann.target && ann.target.selector && ann.target.selector[0] &&
            ann.target.selector[0].subBlockId === subBlock.subBlockId &&
            (ann.motivation === 'highlighting' || ann.motivation === 'commenting')
        );
        if (!hasHighlight) {
            return false;
        }
    }
    return true;
}

// ===== 修改：檢查跨子塊批註狀態 =====
function checkCrossBlockNote(affectedSubBlocks) {
    if (!window.data || !window.data.annotations) return false;
    
    const affectedSubBlockIds = affectedSubBlocks.map(sb => sb.subBlockId);
    
    // 查詢跨子塊標註的批註
    const crossBlockAnnotation = findCrossBlockAnnotation(affectedSubBlockIds, window.globalCurrentContentIdentifier);
    if (crossBlockAnnotation && crossBlockAnnotation.body && crossBlockAnnotation.body.length > 0 && 
        crossBlockAnnotation.body[0].value && crossBlockAnnotation.body[0].value.trim() !== '') {
        return true;
    }
    
    // 備用檢查：是否有任意子塊有批註
    for (const subBlock of affectedSubBlocks) {
        const hasNote = window.data.annotations.some(ann => 
            ann.targetType === window.globalCurrentContentIdentifier &&
            ann.target && ann.target.selector && ann.target.selector[0] &&
            ann.target.selector[0].subBlockId === subBlock.subBlockId &&
            ann.body && ann.body.length > 0 && ann.body[0].value && ann.body[0].value.trim() !== ''
        );
        if (hasNote) {
            return true;
        }
    }
    return false;
}

// ===== 新增：更新跨子塊上下文選單 =====
function updateCrossBlockContextMenuOptions(isHighlighted, hasNote) {
    if (!annotationContextMenuElement) return;
    
    const highlightOption = annotationContextMenuElement.querySelector('[data-action="highlight-block"]');
    const removeHighlightOption = document.getElementById('remove-highlight-option');
    const addNoteOption = document.getElementById('add-note-option');
    const editNoteOption = document.getElementById('edit-note-option');
    const copyContentOption = document.getElementById('copy-content-option');
    
    // 顯示跨塊醒目提示選項，並新增顏色子選項
    if (highlightOption) {
        highlightOption.textContent = '醒目提示選中區域';
        highlightOption.style.display = isHighlighted ? 'none' : 'block';
        
        // 為跨子塊醒目提示選項新增顏色子選項
        if (!isHighlighted) {
            // 清除現有的顏色選項
            const existingColorOptions = highlightOption.querySelectorAll('.color-option');
            existingColorOptions.forEach(option => option.remove());
            
            // 新增顏色選項
            const colorOptions = [
                { color: 'rgba(255, 255, 0, 0.3)', name: '黃色', value: 'yellow' },
                { color: 'rgba(0, 255, 0, 0.3)', name: '綠色', value: 'green' },
                { color: 'rgba(255, 192, 203, 0.3)', name: '粉色', value: 'pink' },
                { color: 'rgba(135, 206, 235, 0.3)', name: '藍色', value: 'blue' },
                { color: 'rgba(255, 165, 0, 0.3)', name: '橙色', value: 'orange' }
            ];
            
            const colorContainer = document.createElement('div');
            colorContainer.className = 'color-submenu';
            colorContainer.style.display = 'flex';
            colorContainer.style.gap = '5px';
            colorContainer.style.marginTop = '5px';
            colorContainer.style.padding = '5px';
            
            colorOptions.forEach(option => {
                const colorDiv = document.createElement('div');
                colorDiv.className = 'color-option';
                colorDiv.dataset.color = option.value;
                colorDiv.title = option.name;
                colorDiv.style.width = '20px';
                colorDiv.style.height = '20px';
                colorDiv.style.backgroundColor = option.color;
                colorDiv.style.border = '1px solid #ccc';
                colorDiv.style.borderRadius = '3px';
                colorDiv.style.cursor = 'pointer';
                colorDiv.style.display = 'inline-block';
                
                // 新增懸停效果
                colorDiv.addEventListener('mouseenter', function() {
                    colorDiv.style.transform = 'scale(1.1)';
                    colorDiv.style.borderColor = '#333';
                });
                colorDiv.addEventListener('mouseleave', function() {
                    colorDiv.style.transform = 'scale(1)';
                    colorDiv.style.borderColor = '#ccc';
                });
                
                colorContainer.appendChild(colorDiv);
            });
            
            highlightOption.appendChild(colorContainer);
        }
    }
    
    if (removeHighlightOption) {
        removeHighlightOption.textContent = '移除選中區域醒目提示';
        removeHighlightOption.style.display = isHighlighted ? 'block' : 'none';
    }
    
    if (copyContentOption) {
        copyContentOption.style.display = 'block';
    }
    
    // 批註選項
    if (isHighlighted) {
        if (addNoteOption) {
            addNoteOption.textContent = '為選中區域新增批註';
            addNoteOption.style.display = hasNote ? 'none' : 'block';
        }
        if (editNoteOption) {
            editNoteOption.textContent = '編輯選中區域批註';
            editNoteOption.style.display = hasNote ? 'block' : 'none';
        }
    } else {
        if (addNoteOption) addNoteOption.style.display = 'none';
        if (editNoteOption) editNoteOption.style.display = 'none';
    }
}

// ===== 重新設計：跨子塊標註資料結構 =====
async function handleCrossBlockMenuAction(action, color, event) {
    const docId = getQueryParam('id');
    if (!docId) {
        alert('錯誤：無法獲取文件ID。');
        hideContextMenu();
        return;
    }
    
    const crossBlockAnnotationId = annotationContextMenuElement.dataset.contextCrossBlockAnnotationId;
    const affectedSubBlockIds = JSON.parse(annotationContextMenuElement.dataset.contextAffectedSubBlocks || '[]');
    const selectedText = annotationContextMenuElement.dataset.contextSelectedText;
    const currentContentIdentifier = annotationContextMenuElement.dataset.contextContentIdentifier;
    
    console.log(`[跨子塊操作] 執行操作: ${action}, 涉及 ${affectedSubBlockIds.length} 個子塊`);
    
    try {
        if (action === 'highlight-block') {
            // 如果沒有選擇顏色，使用預設顏色
            if (!color) {
                color = 'yellow'; // 預設黃色
                console.log("跨子塊醒目提示操作未選擇顏色，使用預設顏色: " + color);
            }
            
            // 建立單一的跨子塊標註物件
            await createCrossBlockAnnotation(docId, affectedSubBlockIds, currentContentIdentifier, color, '', selectedText);
            console.log(`[跨子塊醒目提示] 已建立跨子塊標註，涉及 ${affectedSubBlockIds.length} 個子塊`);
            
        } else if (action === 'remove-highlight') {
            // 移除跨子塊標註
            await removeCrossBlockAnnotation(affectedSubBlockIds, currentContentIdentifier);
            console.log(`[跨子塊去醒目提示] 已移除跨子塊標註`);
            
        } else if (action === 'add-note' || action === 'edit-note') {
            // 為跨子塊標註新增/編輯批註
            let noteText;
            if (action === 'edit-note') {
                const existingNote = findExistingCrossBlockNote(affectedSubBlockIds, currentContentIdentifier);
                noteText = prompt("編輯跨子塊批註內容：", existingNote || '');
            } else {
                noteText = prompt("為選中區域輸入批註內容：", "");
            }
            
            if (noteText === null) {
                // 使用者取消
            } else if (noteText.trim() === '') {
                alert('批註內容不能為空。');
            } else {
                await addNoteToCrossBlockAnnotation(noteText, affectedSubBlockIds, currentContentIdentifier);
                console.log(`[跨子塊批註] 已為選中區域新增批註`);
            }
            
        } else if (action === 'copy-content') {
            // 複製選中的跨子塊內容
            if (selectedText && selectedText.trim()) {
                navigator.clipboard.writeText(selectedText)
                    .then(() => {
                        console.log(`[跨子塊複製] 已複製跨子塊內容: ${selectedText.substring(0,50)}...`);
                    })
                    .catch(err => {
                        console.error('複製失敗:', err);
                        alert('複製內容失敗。');
                    });
            } else {
                alert('沒有可複製的內容。');
            }
        }
        
        // 重新整理醒目提示顯示
        if (action !== 'copy-content') {
            const containerId = currentContentIdentifier + '-content-wrapper';
            const container = document.getElementById(containerId);
            if (container && typeof window.applyBlockAnnotations === 'function') {
                window.applyBlockAnnotations(container, window.data.annotations, currentContentIdentifier);
            }
        }
        
    } catch (error) {
        console.error(`[跨子塊操作] 操作 '${action}' 失敗:`, error);
        alert(`跨子塊操作失敗: ${error.message}`);
    } finally {
        hideContextMenu();
    }
}

// ===== 新增：建立跨子塊標註 =====
async function createCrossBlockAnnotation(docId, affectedSubBlockIds, contentIdentifier, color, note = '', selectedText = '') {
    // 檢查是否已存在跨子塊標註
    const existingAnnotation = findCrossBlockAnnotation(affectedSubBlockIds, contentIdentifier);
    
    if (existingAnnotation) {
        // 更新現有標註
        existingAnnotation.highlightColor = color;
        existingAnnotation.modified = new Date().toISOString();
        if (note) {
            existingAnnotation.body = [{
                type: 'TextualBody',
                value: note,
                format: 'text/plain',
                purpose: 'commenting'
            }];
            existingAnnotation.motivation = 'commenting';
        }
        await updateAnnotationInDB(existingAnnotation);
    } else {
        // 建立新的跨子塊標註
        const rangeInfo = calculateCrossBlockRange(affectedSubBlockIds);
        
        const newAnnotation = {
            '@context': 'http://www.w3.org/ns/anno.jsonld',
            id: 'urn:uuid:' + _page_generateUUID(),
            type: 'Annotation',
            motivation: note ? 'commenting' : 'highlighting',
            created: new Date().toISOString(),
            docId: docId,
            targetType: contentIdentifier,
            highlightColor: color,
            isCrossBlock: true, // 標識這是跨子塊標註
            target: {
                source: docId,
                selector: [{
                    type: 'CrossBlockRangeSelector',
                    startSubBlockId: rangeInfo.startSubBlockId,
                    endSubBlockId: rangeInfo.endSubBlockId,
                    startOffset: rangeInfo.startOffset,
                    endOffset: rangeInfo.endOffset,
                    affectedSubBlocks: affectedSubBlockIds,
                    exact: selectedText || ''
                }]
            },
            body: note ? [{
                type: 'TextualBody',
                value: note,
                format: 'text/plain',
                purpose: 'commenting'
            }] : []
        };
        
        await saveAnnotationToDB(newAnnotation);
        if (!window.data.annotations) window.data.annotations = [];
        window.data.annotations.push(newAnnotation);
    }
}

// ===== 新增：計算跨子塊範圍資訊 =====
function calculateCrossBlockRange(affectedSubBlockIds) {
    if (!affectedSubBlockIds.length) return null;

    // 優先使用跨子塊檢測時儲存的原始 Range，避免上下文選單點選導致選區變化
    let range = (window.globalCurrentSelection && window.globalCurrentSelection.isCrossBlock && window.globalCurrentSelection.range)
        ? window.globalCurrentSelection.range.cloneRange()
        : null;
    if (!range) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        range = selection.getRangeAt(0);
    }

    // 找到起止子塊元素（優先使用 crossBlockInfo 存下來的 DOM）
    let startSubBlock = (window.globalCurrentSelection && window.globalCurrentSelection.startSubBlock) || null;
    let endSubBlock = (window.globalCurrentSelection && window.globalCurrentSelection.endSubBlock) || null;
    if (!startSubBlock) {
        startSubBlock = range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement.closest('.sub-block')
            : (range.startContainer.closest ? range.startContainer.closest('.sub-block') : null);
    }
    if (!endSubBlock) {
        endSubBlock = range.endContainer.nodeType === Node.TEXT_NODE
            ? range.endContainer.parentElement.closest('.sub-block')
            : (range.endContainer.closest ? range.endContainer.closest('.sub-block') : null);
    }

    const startSubBlockId = startSubBlock ? startSubBlock.dataset.subBlockId : affectedSubBlockIds[0];
    const endSubBlockId = endSubBlock ? endSubBlock.dataset.subBlockId : affectedSubBlockIds[affectedSubBlockIds.length - 1];

    // 計算相對各自子塊文字的字元偏移
    let startOffsetInSubBlock = 0;
    let endOffsetInSubBlock = 0;
    const fragmentTextLength = (frag) => {
        const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null);
        let len = 0;
        let n;
        const isInIndicator = (textNode) => {
            let p = textNode.parentNode;
            while (p) {
                if (p.nodeType === 1 && p.classList && p.classList.contains('cross-block-indicator')) return true;
                p = p.parentNode;
            }
            return false;
        };
        while ((n = walker.nextNode())) {
            if (!isInIndicator(n)) len += (n.nodeValue ? n.nodeValue.length : 0);
        }
        return len;
    };

    try {
        if (startSubBlock && startSubBlock.contains(range.startContainer)) {
            const r = document.createRange();
            r.selectNodeContents(startSubBlock);
            r.setEnd(range.startContainer, range.startOffset);
            startOffsetInSubBlock = fragmentTextLength(r.cloneContents());
        } else if (startSubBlock) {
            // 兜底：若瀏覽器把選區起點放到子塊外，則認為偏移為0
            startOffsetInSubBlock = 0;
        }
        if (endSubBlock && endSubBlock.contains(range.endContainer)) {
            const r2 = document.createRange();
            r2.selectNodeContents(endSubBlock);
            r2.setEnd(range.endContainer, range.endOffset);
            endOffsetInSubBlock = fragmentTextLength(r2.cloneContents());
        } else if (endSubBlock) {
            // 兜底：若瀏覽器把選區終點放到子塊外，則認為到達末尾
            const rr = document.createRange();
            rr.selectNodeContents(endSubBlock);
            endOffsetInSubBlock = fragmentTextLength(rr.cloneContents());
        }
    } catch (e) {
        console.warn('[跨子塊] 計算偏移失敗，使用回退 offset', e);
        startOffsetInSubBlock = range.startOffset || 0;
        endOffsetInSubBlock = range.endOffset || 0;
    }

    return {
        startSubBlockId: startSubBlockId,
        endSubBlockId: endSubBlockId,
        startOffset: startOffsetInSubBlock,
        endOffset: endOffsetInSubBlock,
        selectedText: (window.globalCurrentSelection && window.globalCurrentSelection.isCrossBlock && window.globalCurrentSelection.text)
            ? window.globalCurrentSelection.text
            : (window.getSelection ? window.getSelection().toString() : '')
    };
}

// ===== 新增：查詢跨子塊標註 =====
function findCrossBlockAnnotation(affectedSubBlockIds, contentIdentifier) {
    if (!window.data || !window.data.annotations) return null;
    
    return window.data.annotations.find(ann => {
        if (ann.targetType !== contentIdentifier || !ann.isCrossBlock) return false;
        if (!ann.target || !ann.target.selector || !ann.target.selector[0]) return false;
        
        const selector = ann.target.selector[0];
        if (!selector.affectedSubBlocks) return false;
        
        // 檢查是否包含相同的子塊ID集合
        const annotationSubBlocks = selector.affectedSubBlocks.sort();
        const targetSubBlocks = affectedSubBlockIds.sort();
        
        return JSON.stringify(annotationSubBlocks) === JSON.stringify(targetSubBlocks);
    });
}

// ===== 新增：移除跨子塊標註 =====
async function removeCrossBlockAnnotation(affectedSubBlockIds, contentIdentifier) {
    const annotation = findCrossBlockAnnotation(affectedSubBlockIds, contentIdentifier);
    if (annotation) {
        await deleteAnnotationFromDB(annotation.id);
        const index = window.data.annotations.findIndex(ann => ann.id === annotation.id);
        if (index > -1) {
            window.data.annotations.splice(index, 1);
        }
    }
}

// ===== 新增：為跨子塊標註新增批註 =====
async function addNoteToCrossBlockAnnotation(noteText, affectedSubBlockIds, contentIdentifier) {
    const annotation = findCrossBlockAnnotation(affectedSubBlockIds, contentIdentifier);
    if (annotation) {
        annotation.body = [{
            type: 'TextualBody',
            value: noteText,
            format: 'text/plain',
            purpose: 'commenting'
        }];
        annotation.modified = new Date().toISOString();
        annotation.motivation = 'commenting';
        
        await updateAnnotationInDB(annotation);
    }
}

// ===== 新增：建立或更新子塊標註 =====
async function createOrUpdateSubBlockAnnotation(docId, subBlockId, contentIdentifier, color, note = '', groupId = null) {
    // 查詢現有標註
    const existingAnnotation = window.data.annotations.find(ann => 
        ann.targetType === contentIdentifier &&
        ann.target && ann.target.selector && ann.target.selector[0] &&
        ann.target.selector[0].subBlockId === subBlockId
    );
    
    if (existingAnnotation) {
        // 更新現有標註
        existingAnnotation.highlightColor = color;
        existingAnnotation.modified = new Date().toISOString();
        if (groupId) existingAnnotation.groupId = groupId;
        if (note) {
            existingAnnotation.body = [{
                type: 'TextualBody',
                value: note,
                format: 'text/plain',
                purpose: 'commenting'
            }];
            existingAnnotation.motivation = 'commenting';
        } else if (!existingAnnotation.body || existingAnnotation.body.length === 0) {
            existingAnnotation.motivation = 'highlighting';
        }
        
        await updateAnnotationInDB(existingAnnotation);
    } else {
        // 建立新標註
        const newAnnotation = {
            '@context': 'http://www.w3.org/ns/anno.jsonld',
            id: 'urn:uuid:' + _page_generateUUID(),
            type: 'Annotation',
            motivation: note ? 'commenting' : 'highlighting',
            created: new Date().toISOString(),
            docId: docId,
            targetType: contentIdentifier,
            highlightColor: color,
            target: {
                source: docId,
                selector: [{
                    type: 'SubBlockSelector',
                    subBlockId: subBlockId
                }]
            },
            body: note ? [{
                type: 'TextualBody',
                value: note,
                format: 'text/plain',
                purpose: 'commenting'
            }] : []
        };
        
        if (groupId) newAnnotation.groupId = groupId;
        
        // 設定 exact 欄位
        const subBlockElement = document.querySelector(`[data-sub-block-id="${subBlockId}"]`);
        if (subBlockElement) {
            newAnnotation.target.selector[0].exact = subBlockElement.textContent.trim();
        }
        
        await saveAnnotationToDB(newAnnotation);
        if (!window.data.annotations) window.data.annotations = [];
        window.data.annotations.push(newAnnotation);
    }
}

// ===== 修改：查詢跨子塊批註 =====
function findExistingCrossBlockNote(affectedSubBlockIds, contentIdentifier) {
    if (!window.data || !window.data.annotations) return '';
    
    // 首先查詢跨子塊標註
    const crossBlockAnnotation = findCrossBlockAnnotation(affectedSubBlockIds, contentIdentifier);
    if (crossBlockAnnotation && crossBlockAnnotation.body && crossBlockAnnotation.body.length > 0 && 
        crossBlockAnnotation.body[0].value) {
        return crossBlockAnnotation.body[0].value;
    }
    
    // 備用：查詢第一個子塊的批註
    for (const subBlockId of affectedSubBlockIds) {
        const annotation = window.data.annotations.find(ann => 
            ann.targetType === contentIdentifier &&
            ann.target && ann.target.selector && ann.target.selector[0] &&
            ann.target.selector[0].subBlockId === subBlockId &&
            ann.body && ann.body.length > 0 && ann.body[0].value
        );
        
        if (annotation) {
            return annotation.body[0].value;
        }
    }
    
    return '';
}

// 暴露新功能
window.detectCrossBlockSelection = detectCrossBlockSelection;
window.handleCrossBlockAnnotation = handleCrossBlockAnnotation;

// 保留舊函式以保持向後相容性
window.checkIfTargetIsHighlighted = checkIfTargetIsHighlighted;
window.checkIfTargetHasNote = checkIfTargetHasNote;

// 保留舊函式以保持向後相容性
window.updateContextMenuOptions = updateContextMenuOptions;
window.showContextMenu = showContextMenu;

window.initializeGlobalAnnotationVariables = function() {
    window.globalCurrentSelection = null;
    // window.globalCurrentTargetElement = null; // 重要性降低
    window.globalCurrentHighlightStatus = false;
    window.globalCurrentContentIdentifier = ''; // 仍然初始化，但應減少直接依賴
};
