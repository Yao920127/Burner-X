// js/processing/reference-indexer.js
// 參考文獻索引器 - 建立文獻與原文的關聯

(function(global) {
    'use strict';

    /**
     * 參考文獻索引器類
     */
    class ReferenceIndexer {
        constructor() {
            this.indices = new Map(); // documentId -> references with positions
        }

        /**
         * 為文件建立文獻索引
         * @param {string} documentId - 文件ID
         * @param {string} markdown - Markdown文字
         * @param {Array} references - 文獻陣列
         * @returns {Array} 帶有位置資訊的文獻陣列
         */
        buildIndex(documentId, markdown, references) {
            if (!markdown || !references || references.length === 0) {
                return references;
            }

            const indexedReferences = references.map(ref => {
                const position = this.findReferenceInText(markdown, ref);
                return {
                    ...ref,
                    position: position
                };
            });

            this.indices.set(documentId, indexedReferences);
            return indexedReferences;
        }

        /**
         * 在文字中查詢文獻的位置
         * @param {string} markdown - Markdown文字
         * @param {Object} reference - 文獻物件
         * @returns {Object|null} { lineStart, lineEnd, charStart, charEnd }
         */
        findReferenceInText(markdown, reference) {
            const lines = markdown.split('\n');

            // 如果文獻有原始行號資訊，直接使用
            if (reference.lineStart !== undefined && reference.lineEnd !== undefined) {
                const charStart = this.getCharPosition(lines, reference.lineStart);
                const charEnd = this.getCharPosition(lines, reference.lineEnd + 1);

                return {
                    lineStart: reference.lineStart,
                    lineEnd: reference.lineEnd,
                    charStart: charStart,
                    charEnd: charEnd
                };
            }

            // 否則，透過原始文字比對
            if (reference.rawText) {
                const rawText = reference.rawText.trim();
                const position = this.findTextPosition(markdown, rawText);
                if (position) {
                    return position;
                }
            }

            // 透過DOI查詢
            if (reference.doi) {
                const position = this.findTextPosition(markdown, reference.doi);
                if (position) {
                    return position;
                }
            }

            // 透過標題查詢
            if (reference.title) {
                const position = this.findTextPosition(markdown, reference.title);
                if (position) {
                    return position;
                }
            }

            return null;
        }

        /**
         * 在文字中查詢指定字串的位置
         * @param {string} text - 文字
         * @param {string} searchText - 搜尋文字
         * @returns {Object|null} { lineStart, lineEnd, charStart, charEnd }
         */
        findTextPosition(text, searchText) {
            const index = text.indexOf(searchText);
            if (index === -1) {
                return null;
            }

            const lines = text.split('\n');
            let currentPos = 0;

            for (let i = 0; i < lines.length; i++) {
                const lineLength = lines[i].length + 1; // +1 for newline

                if (currentPos + lineLength > index) {
                    // 找到了起始行
                    const charStart = index;
                    const charEnd = index + searchText.length;

                    // 計算結束行
                    let lineEnd = i;
                    let tempPos = currentPos;
                    for (let j = i; j < lines.length; j++) {
                        tempPos += lines[j].length + 1;
                        if (tempPos >= charEnd) {
                            lineEnd = j;
                            break;
                        }
                    }

                    return {
                        lineStart: i,
                        lineEnd: lineEnd,
                        charStart: charStart,
                        charEnd: charEnd
                    };
                }

                currentPos += lineLength;
            }

            return null;
        }

        /**
         * 獲取指定行號的字元位置
         * @param {Array} lines - 文字行陣列
         * @param {number} lineNumber - 行號
         * @returns {number} 字元位置
         */
        getCharPosition(lines, lineNumber) {
            let pos = 0;
            for (let i = 0; i < Math.min(lineNumber, lines.length); i++) {
                pos += lines[i].length + 1; // +1 for newline
            }
            return pos;
        }

        /**
         * 獲取文獻在原文中的位置
         * @param {string} documentId - 文件ID
         * @param {number} referenceIndex - 文獻索引
         * @returns {Object|null} 位置資訊
         */
        getReferencePosition(documentId, referenceIndex) {
            const refs = this.indices.get(documentId);
            if (!refs || !refs[referenceIndex]) {
                return null;
            }

            return refs[referenceIndex].position;
        }

        /**
         * 滾動到文獻在原文中的位置
         * @param {string} documentId - 文件ID
         * @param {number} referenceIndex - 文獻索引
         * @param {HTMLElement} targetElement - 目標元素（顯示原文的容器）
         */
        scrollToReference(documentId, referenceIndex, targetElement = null) {
            const position = this.getReferencePosition(documentId, referenceIndex);
            if (!position) {
                console.warn('[ReferenceIndexer] Position not found for reference', referenceIndex);
                return false;
            }

            // 查詢或建立目標元素
            const container = targetElement || this.findMarkdownContainer();
            if (!container) {
                console.warn('[ReferenceIndexer] Markdown container not found');
                return false;
            }

            // 醒目提示文獻位置
            this.highlightReference(container, position);

            // 滾動到位置
            const element = this.findElementAtPosition(container, position);
            if (element) {
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                // 新增閃爍動畫
                this.addFlashAnimation(element);
                return true;
            }

            return false;
        }

        /**
         * 查詢Markdown容器元素
         */
        findMarkdownContainer() {
            // 首先檢查當前可見的分頁
            const currentTab = window.currentVisibleTabId;
            if (currentTab === 'ocr') {
                const ocrContainer = document.getElementById('ocr-content-wrapper');
                if (ocrContainer) return ocrContainer;
            } else if (currentTab === 'translation') {
                const transContainer = document.getElementById('translation-content-wrapper');
                if (transContainer) return transContainer;
            }

            // 嘗試多種可能的容器ID（包括實際使用的）
            const possibleIds = [
                'ocr-content-wrapper',
                'translation-content-wrapper',
                'markdown-content',
                'ocrResult',
                'translation-result',
                'document-viewer'
            ];

            for (const id of possibleIds) {
                const element = document.getElementById(id);
                if (element) {
                    return element;
                }
            }

            // 嘗試透過類名查詢
            const possibleClasses = [
                'content-wrapper',
                'markdown-body',
                'markdown-content',
                'document-content'
            ];

            for (const className of possibleClasses) {
                const element = document.querySelector('.' + className);
                if (element) {
                    return element;
                }
            }

            return null;
        }

        /**
         * 在元素中查詢指定位置的元素
         * @param {HTMLElement} container - 容器元素
         * @param {Object} position - 位置資訊
         * @returns {HTMLElement|null}
         */
        findElementAtPosition(container, position) {
            // 簡化實現：透過文字內容查詢
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let currentPos = 0;
            let node;

            while (node = walker.nextNode()) {
                const nodeLength = node.textContent.length;

                if (currentPos + nodeLength >= position.charStart) {
                    // 找到包含目標位置的節點
                    return node.parentElement;
                }

                currentPos += nodeLength;
            }

            return null;
        }

        /**
         * 醒目提示文獻位置
         * @param {HTMLElement} container - 容器元素
         * @param {Object} position - 位置資訊
         */
        highlightReference(container, position) {
            // 移除之前的醒目提示
            const oldHighlights = container.querySelectorAll('.reference-highlight');
            oldHighlights.forEach(el => {
                el.classList.remove('reference-highlight');
            });

            // 查詢並醒目提示目標元素
            const element = this.findElementAtPosition(container, position);
            if (element) {
                element.classList.add('reference-highlight');

                // 3秒後移除醒目提示
                setTimeout(() => {
                    element.classList.remove('reference-highlight');
                }, 3000);
            }
        }

        /**
         * 新增閃爍動畫
         * @param {HTMLElement} element - 目標元素
         */
        addFlashAnimation(element) {
            element.style.transition = 'background-color 0.5s ease';
            const originalBg = element.style.backgroundColor;

            // 閃爍3次
            let count = 0;
            const interval = setInterval(() => {
                element.style.backgroundColor = count % 2 === 0 ? '#fff3cd' : originalBg;
                count++;

                if (count >= 6) {
                    clearInterval(interval);
                    element.style.backgroundColor = originalBg;
                }
            }, 300);
        }

        /**
         * 在文件中標記文獻參考（為參考新增連結）
         * @param {string} markdown - Markdown文字
         * @param {Array} references - 文獻陣列
         * @returns {string} 標記後的Markdown
         */
        markReferenceCitations(markdown, references) {
            if (!markdown || !references || references.length === 0) {
                return markdown;
            }

            let markedMarkdown = markdown;

            // 查詢參考標記，如 [1], [2, 3], [1-5] 等
            const citationPattern = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g;

            markedMarkdown = markedMarkdown.replace(citationPattern, (match, numbers) => {
                // 解析參考編號
                const refNumbers = this.parseReferenceNumbers(numbers);

                // 檢查是否都是有效的參考
                const validRefs = refNumbers.filter(num => num > 0 && num <= references.length);

                if (validRefs.length > 0) {
                    // 生成帶連結的標記
                    const refLinks = validRefs.map(num =>
                        `<a href="#ref-${num}" class="reference-citation" data-ref-index="${num - 1}">[${num}]</a>`
                    ).join('');

                    return refLinks;
                }

                return match;
            });

            return markedMarkdown;
        }

        /**
         * 解析參考編號
         * @param {string} numbers - 編號字串，如 "1", "2-5", "1,3,5"
         * @returns {Array} 編號陣列
         */
        parseReferenceNumbers(numbers) {
            const result = [];

            // 分割逗號
            const parts = numbers.split(/\s*,\s*/);

            parts.forEach(part => {
                // 檢查是否是範圍（如 2-5）
                const rangeMatch = part.match(/(\d+)\s*[-–]\s*(\d+)/);
                if (rangeMatch) {
                    const start = parseInt(rangeMatch[1]);
                    const end = parseInt(rangeMatch[2]);
                    for (let i = start; i <= end; i++) {
                        result.push(i);
                    }
                } else {
                    const num = parseInt(part);
                    if (!isNaN(num)) {
                        result.push(num);
                    }
                }
            });

            return result;
        }

        /**
         * 為參考連結綁定點選事件
         * @param {string} documentId - 文件ID
         * @param {HTMLElement} container - 容器元素
         */
        bindCitationLinks(documentId, container = null) {
            const targetContainer = container || document;

            targetContainer.querySelectorAll('.reference-citation').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const refIndex = parseInt(link.dataset.refIndex);

                    // 方式1: 滾動到文獻列表中的對應項
                    this.scrollToReferenceInList(refIndex);

                    // 方式2: 如果在管理器中，醒目提示對應行
                    this.highlightReferenceInManager(refIndex);
                });
            });
        }

        /**
         * 滾動到文獻列表中的項
         * @param {number} refIndex - 文獻索引
         */
        scrollToReferenceInList(refIndex) {
            const refElement = document.querySelector(`[data-ref-id="ref-${refIndex + 1}"]`);
            if (refElement) {
                refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.addFlashAnimation(refElement);
            }
        }

        /**
         * 在管理器中醒目提示文獻
         * @param {number} refIndex - 文獻索引
         */
        highlightReferenceInManager(refIndex) {
            const row = document.querySelector(`tr[data-index="${refIndex}"]`);
            if (row) {
                // 移除之前的醒目提示
                document.querySelectorAll('.ref-row-highlight').forEach(r => {
                    r.classList.remove('ref-row-highlight');
                });

                row.classList.add('ref-row-highlight');

                // 3秒後移除醒目提示
                setTimeout(() => {
                    row.classList.remove('ref-row-highlight');
                }, 3000);
            }
        }

        /**
         * 清空索引
         */
        clearIndex(documentId) {
            if (documentId) {
                this.indices.delete(documentId);
            } else {
                this.indices.clear();
            }
        }
    }

    // 建立全域例項
    const indexer = new ReferenceIndexer();

    // 匯出API
    global.ReferenceIndexer = indexer;

    // 新增CSS樣式
    const style = document.createElement('style');
    style.textContent = `
        .reference-citation {
            color: #2196F3;
            text-decoration: none;
            font-weight: 500;
            padding: 0 2px;
            border-radius: 2px;
            transition: background-color 0.2s;
        }

        .reference-citation:hover {
            background-color: #e3f2fd;
            text-decoration: underline;
        }

        .reference-highlight {
            background-color: #fff3cd !important;
            border-left: 3px solid #ffc107;
            padding-left: 8px;
            transition: all 0.3s ease;
        }

        .ref-row-highlight {
            background-color: #fff3cd !important;
            animation: pulse 0.5s ease 3;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
    `;
    document.head.appendChild(style);

    console.log('[ReferenceIndexer] Reference indexer loaded.');

})(window);



