# Paper-Burner 前端效能最佳化實施計劃

> **建立日期**: 2025-11-12
> **目標**: 系統性提升前端效能，改善使用者體驗
> **原則**: 漸進式最佳化，充分測試，可回滾

---

## 📋 總體策略

### 最佳化原則
1. **安全第一**: 每個修改都要有完整的測試覆蓋
2. **漸進式**: 從低風險最佳化開始，逐步推進
3. **可回滾**: 使用 Git 分支，保持每個最佳化獨立
4. **可驗證**: 每個最佳化都要有效能指標對比

### 分支策略
```
main
  └─ optimize/frontend-performance (當前分支)
      ├─ optimize/phase1-low-risk
      ├─ optimize/phase2-cache-strategy
      ├─ optimize/phase3-event-delegation
      └─ optimize/phase4-virtual-scroll
```

---

## 🎯 Phase 1: 低風險快速最佳化（1-2天）

### 1.1 建立效能工具模組
**檔案**: `js/utils/performance-helpers.js`
**風險**: 🟢 極低（新增檔案，不影響現有程式碼）
**預期收益**: 為後續最佳化提供基礎工具

#### 實施步驟
1. 建立工具模組（防抖、節流、LRU快取、安全定時器）
2. 新增單元測試
3. 在一個非關鍵模組試用（如設定面板）
4. 驗證無問題後推廣

#### 測試檢查點
- [ ] 防抖函式在300ms內只執行一次
- [ ] 節流函式在滾動時按預期頻率觸發
- [ ] LRU快取正確淘汰最久未使用項
- [ ] 定時器在頁面解除安裝時全部清理

#### 回滾方案
刪除新檔案，無需其他操作

---

### 1.2 搜尋輸入防抖最佳化
**檔案**: `js/history/history.js`
**行數**: 352-355
**風險**: 🟢 低（邏輯簡單，易測試）
**預期收益**: 減少50-80%的渲染次數

#### 修改前程式碼
```javascript
historySearchInput.addEventListener('input', function(event) {
    historyUIState.searchQuery = event.target.value || '';
    renderHistoryList();  // 每次按鍵都觸發
});
```

#### 修改後程式碼
```javascript
import { PerformanceHelpers } from '../utils/performance-helpers.js';

const debouncedRenderHistory = PerformanceHelpers.debounce(renderHistoryList, 300);

historySearchInput.addEventListener('input', function(event) {
    historyUIState.searchQuery = event.target.value || '';
    debouncedRenderHistory();
});
```

#### 測試檢查點
- [ ] 快速輸入"test"（4個字元），只觸發1次渲染
- [ ] 輸入後停頓300ms，觸發渲染
- [ ] 搜尋結果正確顯示
- [ ] 清空搜尋框，恢復完整列表

#### 效能對比
| 操作 | 最佳化前 | 最佳化後 |
|------|--------|--------|
| 輸入5個字元 | 5次渲染 | 1次渲染 |
| 渲染耗時 | 450ms × 5 = 2.25s | 450ms × 1 = 450ms |

---

### 1.3 正規表示式提升最佳化
**檔案**: `js/processing/markdown_processor_ast.js`
**行數**: 140-155
**風險**: 🟢 低（只是提升作用域，不改變邏輯）
**預期收益**: 大文件處理速度提升10-15%

#### 修改策略
```javascript
// 在模組頂部定義正則常量
const MATH_DELIMITER_PATTERNS = Object.freeze({
    dollarWithComma: /\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$\s*，\s*\$/g,
    doubleDollar: /\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$\$/g,
    singleDollarEnd: /\$\\\$\s*([^\$\n]{1,200}?)\s*\\\$/g,
    // ... 其他模式
});

// 每次使用前重置 lastIndex（重要！）
function normalizeMathDelimiters(text) {
    let s = text;

    MATH_DELIMITER_PATTERNS.dollarWithComma.lastIndex = 0;
    s = s.replace(MATH_DELIMITER_PATTERNS.dollarWithComma, '$$  $1  $$');

    MATH_DELIMITER_PATTERNS.doubleDollar.lastIndex = 0;
    s = s.replace(MATH_DELIMITER_PATTERNS.doubleDollar, '$$  $1  $$');

    return s;
}
```

#### 測試檢查點
- [ ] 公式修復功能正常（測試文件: test-formula-issues.html）
- [ ] 行內公式識別正確
- [ ] 塊公式識別正確
- [ ] 邊界情況：巢狀公式、特殊字元

#### 效能對比
使用 `performance.mark()` 測量：
```javascript
performance.mark('normalize-start');
normalizeMathDelimiters(largeText);
performance.mark('normalize-end');
performance.measure('normalize', 'normalize-start', 'normalize-end');
console.log(performance.getEntriesByName('normalize')[0].duration);
```

---

### 1.4 輪詢定時器最佳化
**檔案**: `js/annotations/annotations_summary_modal.js`
**行數**: 996
**風險**: 🟡 中低（需要測試頁面隱藏邏輯）
**預期收益**: 減少50%的後臺CPU佔用

#### 修改策略
```javascript
class ColorPollingManager {
    constructor(checkFn, interval = 1000) {
        this.checkFn = checkFn;
        this.interval = interval;
        this.timerId = null;
        this.isActive = false;

        this._setupVisibilityListener();
    }

    _setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });

        window.addEventListener('beforeunload', () => this.stop());
    }

    _poll() {
        if (!this.isActive) return;

        if (!document.hidden) {
            this.checkFn();
        }

        this.timerId = setTimeout(() => this._poll(), this.interval);
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this._poll();
    }

    pause() {
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    resume() {
        if (this.isActive && !this.timerId) {
            this._poll();
        }
    }

    stop() {
        this.isActive = false;
        this.pause();
    }
}

// 使用
const colorPoller = new ColorPollingManager(checkForNewColors, 1000);
colorPoller.start();
```

#### 測試檢查點
- [ ] 頁面可見時，輪詢正常執行
- [ ] 切換到其他標籤，輪詢暫停
- [ ] 切回標籤，輪詢恢復
- [ ] 關閉頁面，定時器被清理
- [ ] 批註顏色更新功能正常

#### 效能對比
使用 Chrome DevTools Performance 監控：
- 頁面隱藏時 CPU 佔用應降至 0%

---

## 🔧 Phase 2: 中等風險最佳化（3-5天）

### 2.1 LRU 快取實現
**檔案**: `js/processing/markdown_processor_ast.js`
**行數**: 17-18
**風險**: 🟡 中（需要驗證快取命中率）
**預期收益**: 記憶體佔用減少30-40%

#### 實施步驟

**Step 1: 建立 LRU 快取類**
```javascript
class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();

        // 效能指標
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            size: 0
        };
    }

    get(key) {
        if (!this.cache.has(key)) {
            this.stats.misses++;
            return undefined;
        }

        this.stats.hits++;
        const value = this.cache.get(key);

        // 移到最後（最新使用）
        this.cache.delete(key);
        this.cache.set(key, value);

        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // 刪除最久未使用的（第一個）
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.stats.evictions++;
        }

        this.cache.set(key, value);
        this.stats.size = this.cache.size;
    }

    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };
    }

    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }
}
```

**Step 2: 替換現有快取**
```javascript
// 替換
const renderCache = new Map();

// 為
const renderCache = new LRUCache(CONFIG.cacheSize);

// 使用方式保持不變
renderCache.get(key);
renderCache.set(key, value);
```

**Step 3: 新增監控**
```javascript
// 在主控台暴露快取統計
if (CONFIG.debug) {
    window.__markdownCacheStats = () => renderCache.getStats();
}

// 定期列印（僅 debug 模式）
if (CONFIG.debug) {
    setInterval(() => {
        const stats = renderCache.getStats();
        console.log('[Markdown Cache]', {
            hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
            size: stats.size,
            evictions: stats.evictions
        });
    }, 30000);  // 每30秒
}
```

#### 測試檢查點
- [ ] 快取命中率 > 70%（使用 `window.__markdownCacheStats()`）
- [ ] 快取大小穩定在配置值附近
- [ ] 渲染結果與之前完全一致
- [ ] 記憶體佔用未異常增長

#### 效能監控
```javascript
// 新增到測試頁面
async function testCachePerformance() {
    const testText = '重複的長文字...';

    console.time('首次渲染');
    await processMarkdown(testText);
    console.timeEnd('首次渲染');

    console.time('快取命中渲染');
    await processMarkdown(testText);
    console.timeEnd('快取命中渲染');

    console.log('快取統計:', window.__markdownCacheStats());
}
```

---

### 2.2 批註系統 DOM 快取最佳化
**檔案**: `js/annotations/annotation_logic.js`
**行數**: 440-500
**風險**: 🟡 中（需要處理 DOM 更新同步）
**預期收益**: 右鍵響應速度提升70-85%

#### 架構設計

```javascript
/**
 * 批註 DOM 快取管理器
 *
 * 職責：
 * 1. 快取常用的 DOM 查詢結果
 * 2. 監聽 DOM 變化，自動重新整理快取
 * 3. 提供快速查詢方法
 */
class AnnotationDOMCache {
    constructor(containerSelector) {
        this.containerSelector = containerSelector;
        this.container = document.querySelector(containerSelector);

        if (!this.container) {
            throw new Error(`Container not found: ${containerSelector}`);
        }

        // 快取資料
        this.cache = {
            subBlocks: [],
            blocks: [],
            subBlockMap: new Map(),  // id -> element
            blockMap: new Map()      // index -> element
        };

        // 初始化
        this.refresh();
        this._setupObserver();
    }

    /**
     * 重新整理所有快取
     */
    refresh() {
        // 子塊
        this.cache.subBlocks = Array.from(
            this.container.querySelectorAll('.sub-block[data-sub-block-id]')
        );

        // 構建 Map 索引
        this.cache.subBlockMap.clear();
        this.cache.subBlocks.forEach(block => {
            const id = block.getAttribute('data-sub-block-id');
            if (id) this.cache.subBlockMap.set(id, block);
        });

        // 塊
        this.cache.blocks = Array.from(
            this.container.querySelectorAll('[data-block-index]')
        );

        this.cache.blockMap.clear();
        this.cache.blocks.forEach(block => {
            const index = block.getAttribute('data-block-index');
            if (index) this.cache.blockMap.set(index, block);
        });

        console.log('[AnnotationDOMCache] Refreshed:', {
            subBlocks: this.cache.subBlocks.length,
            blocks: this.cache.blocks.length
        });
    }

    /**
     * 監聽 DOM 變化，自動重新整理快取
     */
    _setupObserver() {
        const observer = new MutationObserver((mutations) => {
            // 檢查是否有結構性變化
            const hasStructuralChange = mutations.some(mutation =>
                mutation.type === 'childList' && mutation.addedNodes.length > 0
            );

            if (hasStructuralChange) {
                console.log('[AnnotationDOMCache] DOM changed, refreshing...');
                this.refresh();
            }
        });

        observer.observe(this.container, {
            childList: true,
            subtree: true
        });

        this.observer = observer;
    }

    /**
     * 根據座標查詢子塊
     */
    findSubBlockAtPoint(x, y) {
        // 使用快取的陣列，而不是重新查詢
        return this.cache.subBlocks.find(block => {
            const rect = block.getBoundingClientRect();
            return x >= rect.left && x <= rect.right &&
                   y >= rect.top && y <= rect.bottom;
        });
    }

    /**
     * 根據 ID 獲取子塊
     */
    getSubBlockById(id) {
        return this.cache.subBlockMap.get(id);
    }

    /**
     * 根據索引獲取塊
     */
    getBlockByIndex(index) {
        return this.cache.blockMap.get(String(index));
    }

    /**
     * 獲取所有子塊
     */
    getAllSubBlocks() {
        return this.cache.subBlocks;
    }

    /**
     * 獲取所有塊
     */
    getAllBlocks() {
        return this.cache.blocks;
    }

    /**
     * 清理
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.cache.subBlockMap.clear();
        this.cache.blockMap.clear();
    }
}
```

#### 整合到現有程式碼

**修改前**:
```javascript
mainContainer.addEventListener('contextmenu', function(event) {
    event.preventDefault();
    event.stopPropagation();

    // ❌ 每次都查詢全文件
    let allSubBlocks = document.querySelectorAll('.sub-block[data-sub-block-id]');
    const blocks = document.querySelectorAll('[data-block-index]');

    // ... 查詢邏輯
});
```

**修改後**:
```javascript
// 初始化快取（在 DOMContentLoaded 時）
let domCache;

function initAnnotationDOMCache() {
    const mainContainer = document.querySelector('#mainContainer, #detail-ocr-section, #detail-translated-section');
    if (mainContainer) {
        domCache = new AnnotationDOMCache('#mainContainer, #detail-ocr-section, #detail-translated-section');
    }
}

// 使用快取
mainContainer.addEventListener('contextmenu', function(event) {
    event.preventDefault();
    event.stopPropagation();

    // ✅ 使用快取
    const clickedSubBlock = domCache.findSubBlockAtPoint(event.clientX, event.clientY);

    if (clickedSubBlock) {
        const subBlockId = clickedSubBlock.getAttribute('data-sub-block-id');
        // ... 後續邏輯
    }
});
```

#### 測試檢查點
- [ ] 右鍵選單響應速度 < 50ms
- [ ] 批註建立功能正常
- [ ] 批註醒目提示顯示正確
- [ ] 文件切換時快取正確重新整理
- [ ] 翻譯完成後快取正確更新

#### 效能對比
```javascript
// 測試腳本
console.time('DOM查詢-最佳化前');
for (let i = 0; i < 100; i++) {
    document.querySelectorAll('.sub-block[data-sub-block-id]');
}
console.timeEnd('DOM查詢-最佳化前');

console.time('DOM查詢-最佳化後');
for (let i = 0; i < 100; i++) {
    domCache.getAllSubBlocks();
}
console.timeEnd('DOM查詢-最佳化後');
```

---

### 2.3 字串拼接最佳化
**檔案**: `js/chatbot/ui/chatbot-message-renderer.js`
**行數**: 95-105
**風險**: 🟢 低（區域性修改）
**預期收益**: 大訊息渲染速度提升15-20%

#### 修改策略
```javascript
// 修改前
let userMessageHtml = '';
contentToDisplay.forEach(part => {
    if (part.type === 'text') {
        userMessageHtml += `<div class="whitespace-pre-wrap">${escapeHtml(part.text)}</div>`;
    } else if (part.type === 'image_url') {
        userMessageHtml += `<img src="${part.image_url.url}" class="max-w-full h-auto rounded" />`;
    }
});

// 修改後
const htmlParts = contentToDisplay.map(part => {
    if (part.type === 'text') {
        return `<div class="whitespace-pre-wrap">${escapeHtml(part.text)}</div>`;
    } else if (part.type === 'image_url') {
        return `<img src="${part.image_url.url}" class="max-w-full h-auto rounded" />`;
    }
    return '';
});
const userMessageHtml = htmlParts.join('');
```

#### 測試檢查點
- [ ] 訊息渲染結果一致
- [ ] 圖片正常顯示
- [ ] 文字換行正確
- [ ] 混合內容（文字+圖片）正確

---

## ⚡ Phase 3: 高風險重構（5-7天）

### 3.1 聊天訊息事件委託重構
**檔案**: `js/chatbot/ui/chatbot-message-renderer.js`
**風險**: 🔴 高（涉及核心互動邏輯）
**預期收益**: 記憶體佔用減少40-60%，互動流暢度提升

#### 重構計劃

**Step 1: 建立事件管理器**
```javascript
/**
 * 聊天訊息事件管理器
 * 使用事件委託處理所有訊息操作
 */
class ChatMessageEventManager {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            throw new Error(`Container not found: ${containerSelector}`);
        }

        this._setupEventDelegation();
    }

    _setupEventDelegation() {
        // 單一點選事件監聽器
        this.container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const index = parseInt(target.dataset.index);

            switch (action) {
                case 'delete':
                    this._handleDelete(index, e);
                    break;
                case 'resend':
                    this._handleResend(index, e);
                    break;
                case 'copy':
                    this._handleCopy(index, e);
                    break;
                case 'toggle-raw':
                    this._handleToggleRaw(index, e);
                    break;
            }
        });

        // 鍵盤快捷鍵
        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && e.target.closest('.message-item')) {
                const item = e.target.closest('.message-item');
                const index = parseInt(item.dataset.messageIndex);
                this._handleDelete(index, e);
            }
        });
    }

    _handleDelete(index, event) {
        event.stopPropagation();
        if (window.ChatbotActions && window.ChatbotActions.deleteMessage) {
            window.ChatbotActions.deleteMessage(index);
        }
    }

    _handleResend(index, event) {
        event.stopPropagation();
        if (window.ChatbotActions && window.ChatbotActions.resendUserMessage) {
            window.ChatbotActions.resendUserMessage(index);
        }
    }

    _handleCopy(index, event) {
        event.stopPropagation();
        // 複製邏輯
    }

    _handleToggleRaw(index, event) {
        event.stopPropagation();
        // 切換原始內容顯示
    }
}
```

**Step 2: 修改訊息渲染器**

修改前（內聯事件）:
```html
<button onclick="window.ChatbotActions.deleteMessage(${index})"
        onmouseover="this.style.background='rgba(239,68,68,0.1)';">
```

修改後（資料屬性 + CSS）:
```html
<button class="message-action-btn delete-btn"
        data-action="delete"
        data-index="${index}">
```

```css
/* 使用 CSS 處理 hover 效果 */
.message-action-btn {
    transition: background-color 0.2s;
}

.delete-btn:hover {
    background-color: rgba(239, 68, 68, 0.1);
}

.resend-btn:hover {
    background-color: rgba(59, 130, 246, 0.1);
}
```

**Step 3: 分階段遷移**

```javascript
// 階段 1: 雙模式執行（相容期）
const USE_EVENT_DELEGATION = true;  // 特性開關

function renderMessageActions(index) {
    if (USE_EVENT_DELEGATION) {
        return `
            <button class="message-action-btn delete-btn"
                    data-action="delete"
                    data-index="${index}">
                刪除
            </button>
        `;
    } else {
        // 舊版本（回退）
        return `
            <button onclick="window.ChatbotActions.deleteMessage(${index})">
                刪除
            </button>
        `;
    }
}

// 階段 2: 充分測試後移除舊程式碼
```

#### 測試檢查點
- [ ] 刪除訊息功能正常
- [ ] 重新傳送功能正常
- [ ] 複製功能正常
- [ ] Hover 效果正常
- [ ] 鍵盤快捷鍵正常
- [ ] 多個聊天視窗（浮動模式）不衝突
- [ ] 快速連續點選不出錯

#### 效能對比
```javascript
// 測試記憶體佔用
function measureMemoryUsage() {
    if (performance.memory) {
        console.log('Heap Size:', (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2), 'MB');
    }
}

// 最佳化前：渲染 50 條訊息
measureMemoryUsage();  // 例如: 45.2 MB

// 最佳化後：渲染 50 條訊息
measureMemoryUsage();  // 預期: 28.5 MB (減少 37%)
```

---

## 🚀 Phase 4: 架構級最佳化（1-2周）

### 4.1 歷史記錄虛擬滾動實現
**檔案**: `js/history/history.js`
**風險**: 🔴 高（核心功能重寫）
**預期收益**: 大列表（100+）渲染速度提升80-90%

#### 架構設計

```javascript
/**
 * 虛擬滾動列表管理器
 *
 * 原理：
 * 1. 只渲染可視區域的專案
 * 2. 根據滾動位置動態更新顯示項
 * 3. 使用 CSS transform 模擬滾動
 */
class VirtualScrollList {
    constructor(options) {
        this.container = options.container;          // 容器元素
        this.itemHeight = options.itemHeight;        // 每項高度（固定）
        this.renderItem = options.renderItem;        // 渲染函式
        this.items = [];                             // 所有資料

        // 可視區域計算
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.visibleCount = Math.ceil(this.container.clientHeight / this.itemHeight) + 2;

        // DOM 元素
        this.viewport = null;
        this.content = null;

        this._init();
    }

    _init() {
        // 建立虛擬滾動結構
        this.container.innerHTML = `
            <div class="virtual-scroll-viewport" style="overflow-y: auto; height: 100%;">
                <div class="virtual-scroll-content" style="position: relative;">
                    <!-- 動態內容 -->
                </div>
            </div>
        `;

        this.viewport = this.container.querySelector('.virtual-scroll-viewport');
        this.content = this.container.querySelector('.virtual-scroll-content');

        // 監聽滾動
        this.viewport.addEventListener('scroll', () => this._handleScroll());
    }

    /**
     * 設定資料
     */
    setItems(items) {
        this.items = items;

        // 設定內容區域總高度
        this.content.style.height = `${items.length * this.itemHeight}px`;

        // 重新渲染
        this._render();
    }

    /**
     * 處理滾動
     */
    _handleScroll() {
        const scrollTop = this.viewport.scrollTop;
        const newVisibleStart = Math.floor(scrollTop / this.itemHeight);

        // 只在變化時重新渲染
        if (newVisibleStart !== this.visibleStart) {
            this.visibleStart = newVisibleStart;
            this.visibleEnd = Math.min(
                newVisibleStart + this.visibleCount,
                this.items.length
            );
            this._render();
        }
    }

    /**
     * 渲染可見項
     */
    _render() {
        const visibleItems = this.items.slice(this.visibleStart, this.visibleEnd);

        const html = visibleItems.map((item, index) => {
            const absoluteIndex = this.visibleStart + index;
            const top = absoluteIndex * this.itemHeight;

            return `
                <div class="virtual-item"
                     style="position: absolute;
                            top: ${top}px;
                            height: ${this.itemHeight}px;
                            left: 0;
                            right: 0;">
                    ${this.renderItem(item, absoluteIndex)}
                </div>
            `;
        }).join('');

        this.content.innerHTML = html;
    }

    /**
     * 滾動到指定項
     */
    scrollToIndex(index) {
        const targetScrollTop = index * this.itemHeight;
        this.viewport.scrollTop = targetScrollTop;
    }

    /**
     * 重新整理
     */
    refresh() {
        this._render();
    }
}
```

#### 整合到歷史記錄頁面

**Step 1: 建立介面卡**
```javascript
// js/history/history-virtual-scroll.js

class HistoryVirtualList {
    constructor() {
        this.virtualList = null;
        this.ITEM_HEIGHT = 120;  // 歷史項高度（需要測量）
    }

    init(containerSelector) {
        const container = document.querySelector(containerSelector);

        this.virtualList = new VirtualScrollList({
            container: container,
            itemHeight: this.ITEM_HEIGHT,
            renderItem: (record, index) => this._renderHistoryItem(record, index)
        });
    }

    _renderHistoryItem(record, index) {
        // 複用現有的 renderHistoryItem 邏輯
        const isBatch = record.batchId && record.batchChildren && record.batchChildren.length > 0;

        if (isBatch) {
            return this._renderBatchItem(record);
        } else {
            return this._renderSingleItem(record);
        }
    }

    _renderSingleItem(record) {
        // 從原有程式碼提取渲染邏輯
        return `
            <div class="history-item" data-id="${record.id}">
                <div class="history-item-name">${escapeHtml(record.name)}</div>
                <div class="history-item-time">${formatTime(record.time)}</div>
                <div class="history-item-actions">
                    <button data-action="view" data-id="${record.id}">檢視</button>
                    <button data-action="delete" data-id="${record.id}">刪除</button>
                </div>
            </div>
        `;
    }

    _renderBatchItem(record) {
        // 批次渲染邏輯
        // ...
    }

    setData(records) {
        this.virtualList.setItems(records);
    }

    scrollToTop() {
        this.virtualList.scrollToIndex(0);
    }
}

// 全域例項
window.historyVirtualList = new HistoryVirtualList();
```

**Step 2: 修改 history.js**
```javascript
// 特性開關
const USE_VIRTUAL_SCROLL = true;

function renderHistoryList() {
    // ... 獲取和過濾資料

    if (USE_VIRTUAL_SCROLL) {
        // 新方法：虛擬滾動
        if (!window.historyVirtualList) {
            window.historyVirtualList = new HistoryVirtualList();
            window.historyVirtualList.init('#history-list-container');
        }
        window.historyVirtualList.setData(filteredRecords);
    } else {
        // 舊方法：直接渲染
        const fragments = filteredRecords.map(r => renderHistoryItem(r));
        listDiv.innerHTML = fragments.join('');
    }
}
```

#### 挑戰和解決方案

**挑戰 1: 歷史項高度不固定**
- 批次項和單項高度不同
- 檔名過長時會換行

**解決方案**:
```javascript
// 方案 A: 估算平均高度
const ITEM_HEIGHT = 120;  // 平均高度

// 方案 B: 動態高度（更復雜）
class DynamicHeightVirtualScroll {
    constructor() {
        this.itemHeights = new Map();  // 快取每項的真實高度
        this.estimatedHeight = 120;
    }

    // 渲染後測量實際高度
    _measureHeights() {
        const items = this.content.querySelectorAll('.virtual-item');
        items.forEach((item, index) => {
            const height = item.offsetHeight;
            this.itemHeights.set(this.visibleStart + index, height);
        });
    }
}
```

**挑戰 2: 搜尋和過濾**
- 過濾後專案數量變化

**解決方案**:
```javascript
function filterAndRender(searchQuery) {
    const filteredRecords = allRecords.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // 虛擬列表自動處理資料變化
    window.historyVirtualList.setData(filteredRecords);
}
```

**挑戰 3: 批次展開/收起**
- 展開批次會改變列表長度

**解決方案**:
```javascript
function toggleBatch(batchId) {
    // 更新資料模型
    const batch = allRecords.find(r => r.batchId === batchId);
    batch.expanded = !batch.expanded;

    // 重新計算扁平化列表
    const flatRecords = flattenRecords(allRecords);

    // 更新虛擬列表
    window.historyVirtualList.setData(flatRecords);
}
```

#### 測試檢查點
- [ ] 100 條記錄渲染時間 < 100ms
- [ ] 滾動流暢（60 FPS）
- [ ] 搜尋過濾正常
- [ ] 批次展開/收起正常
- [ ] 刪除記錄後列表正確更新
- [ ] 跳轉到最新記錄功能正常
- [ ] 不同螢幕尺寸下正常工作

#### 效能對比
```javascript
// 測試腳本
async function testVirtualScrollPerformance() {
    // 生成測試資料
    const testRecords = Array.from({ length: 500 }, (_, i) => ({
        id: `test-${i}`,
        name: `測試文件 ${i}.pdf`,
        time: new Date(Date.now() - i * 60000),
        // ...
    }));

    // 最佳化前
    console.time('傳統渲染-500項');
    listDiv.innerHTML = testRecords.map(r => renderHistoryItem(r)).join('');
    console.timeEnd('傳統渲染-500項');

    // 最佳化後
    console.time('虛擬滾動-500項');
    window.historyVirtualList.setData(testRecords);
    console.timeEnd('虛擬滾動-500項');
}
```

預期結果:
| 專案數 | 傳統渲染 | 虛擬滾動 | 提升 |
|--------|----------|----------|------|
| 50     | 180ms    | 40ms     | 78%  |
| 100    | 450ms    | 45ms     | 90%  |
| 500    | 2300ms   | 50ms     | 98%  |

---

## 📊 效能監控和測試

### 自動化效能測試套件

建立 `tests/performance/performance-suite.js`:

```javascript
/**
 * 效能測試套件
 */
class PerformanceTestSuite {
    constructor() {
        this.results = [];
    }

    /**
     * 測試渲染效能
     */
    async testRenderPerformance(testName, renderFn, iterations = 10) {
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const startTime = performance.now();
            await renderFn();
            const endTime = performance.now();
            times.push(endTime - startTime);
        }

        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);

        this.results.push({
            test: testName,
            avg: avg.toFixed(2),
            min: min.toFixed(2),
            max: max.toFixed(2),
            iterations
        });

        console.log(`[${testName}] 平均: ${avg.toFixed(2)}ms, 最小: ${min.toFixed(2)}ms, 最大: ${max.toFixed(2)}ms`);
    }

    /**
     * 測試記憶體佔用
     */
    measureMemory(testName) {
        if (performance.memory) {
            const mb = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
            console.log(`[${testName}] 記憶體佔用: ${mb} MB`);
            this.results.push({
                test: testName,
                memory: `${mb} MB`
            });
        }
    }

    /**
     * 測試 FPS
     */
    async measureFPS(testName, actionFn, duration = 2000) {
        let frames = 0;
        let lastTime = performance.now();

        const measure = () => {
            frames++;
            const currentTime = performance.now();

            if (currentTime - lastTime >= duration) {
                const fps = frames / (duration / 1000);
                console.log(`[${testName}] FPS: ${fps.toFixed(2)}`);
                this.results.push({
                    test: testName,
                    fps: fps.toFixed(2)
                });
                return;
            }

            requestAnimationFrame(measure);
        };

        actionFn();  // 觸發操作（如滾動）
        requestAnimationFrame(measure);

        await new Promise(resolve => setTimeout(resolve, duration + 100));
    }

    /**
     * 生成報告
     */
    generateReport() {
        console.table(this.results);
        return this.results;
    }
}

// 使用示例
const perfTest = new PerformanceTestSuite();

// 測試歷史列表渲染
await perfTest.testRenderPerformance('歷史列表-50項', async () => {
    await renderHistoryList(generate50Records());
});

await perfTest.testRenderPerformance('歷史列表-100項', async () => {
    await renderHistoryList(generate100Records());
});

// 測試記憶體
perfTest.measureMemory('初始載入');
await loadChatMessages(100);
perfTest.measureMemory('載入100條訊息後');

// 測試滾動 FPS
await perfTest.measureFPS('歷史列表滾動', () => {
    // 模擬滾動
    const container = document.querySelector('#history-list');
    let scrollTop = 0;
    const scroll = () => {
        scrollTop += 10;
        container.scrollTop = scrollTop;
        if (scrollTop < 5000) requestAnimationFrame(scroll);
    };
    scroll();
}, 2000);

// 生成報告
perfTest.generateReport();
```

---

## 🔄 回滾計劃

每個 Phase 都在獨立分支上開發，便於回滾：

```bash
# 如果 Phase 1 出現問題
git checkout optimize/frontend-performance
git revert <phase1-merge-commit>

# 如果某個具體最佳化有問題
git checkout optimize/frontend-performance
git revert <specific-commit>
git push origin optimize/frontend-performance
```

### 回滾檢查清單
- [ ] 確認問題嚴重性（是否需要立即回滾）
- [ ] 記錄問題詳情和復現步驟
- [ ] 執行回滾操作
- [ ] 驗證回滾後功能正常
- [ ] 通知團隊成員
- [ ] 分析問題原因，修復後重新部署

---

## ✅ 驗收標準

### Phase 1 驗收
- [ ] 所有單元測試透過
- [ ] 搜尋輸入防抖生效
- [ ] 定時器在頁面隱藏時暫停
- [ ] 正規表示式提升後功能正常
- [ ] 無新增 bug

### Phase 2 驗收
- [ ] LRU 快取命中率 > 70%
- [ ] DOM 快取使右鍵響應 < 50ms
- [ ] 記憶體佔用穩定
- [ ] 所有批註功能正常

### Phase 3 驗收
- [ ] 事件委託重構後所有互動正常
- [ ] 記憶體佔用減少 > 30%
- [ ] 無事件監聽器洩漏
- [ ] 效能測試套件全部透過

### Phase 4 驗收
- [ ] 虛擬滾動流暢度 60 FPS
- [ ] 大列表（500+）渲染 < 100ms
- [ ] 搜尋、過濾、批次操作正常
- [ ] 所有瀏覽器相容

---

## 📝 開發日誌

### 日誌模板
```markdown
## [日期] Phase X - [功能名稱]

### 實施內容
- 修改了 xxx.js 的 xxx 函式
- 新增了 xxx 工具類

### 測試結果
- ✅ 功能測試透過
- ✅ 效能測試：xxx 提升 xx%
- ⚠️ 發現問題：xxx

### 遺留問題
- [ ] 問題 1
- [ ] 問題 2

### 下一步
- 繼續 xxx
```

---

## 🎯 總結

本最佳化計劃採用**漸進式、可回滾、充分測試**的策略，預期在 2-3 周內完成所有最佳化，實現：

- **渲染效能**: 提升 70-90%
- **記憶體佔用**: 減少 40-60%
- **互動流暢度**: 達到 60 FPS
- **使用者體驗**: 顯著改善

所有最佳化都會保持程式碼可維護性和可讀性，不會引入複雜的依賴。
