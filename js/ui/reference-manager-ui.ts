// js/ui/reference-manager-ui.js
// 參考文獻管理UI

(function(global) {
    'use strict';

    /**
     * 參考文獻管理UI類
     */
    class ReferenceManagerUI {
        constructor() {
            this.currentDocumentId = null;
            this.references = [];
            this.filteredReferences = [];
            this.selectedReferences = new Set();
            this.sortColumn = 'index';
            this.sortDirection = 'asc';
        }

        /**
         * 初始化UI
         */
        initialize() {
            this.createManagerModal();
            this.attachEventListeners();
            console.log('[ReferenceManagerUI] Initialized.');
        }

        /**
         * 建立管理介面模態框
         */
        createManagerModal() {
            const modal = document.createElement('div');
            modal.id = 'reference-manager-modal';
            modal.className = 'reference-modal';
            modal.innerHTML = `
                <div class="reference-modal-content">
                    <div class="reference-modal-header">
                        <h2><i class="fa fa-book"></i> 參考文獻管理</h2>
                        <button class="reference-modal-close" aria-label="關閉">&times;</button>
                    </div>

                    <div class="reference-toolbar">
                        <div class="reference-toolbar-left">
                            <button id="ref-extract-btn" class="ref-btn ref-btn-primary">
                                <i class="fa fa-search"></i> 提取文獻
                            </button>
                            <button id="ref-enrich-doi-btn" class="ref-btn ref-btn-success">
                                <i class="fa fa-magic"></i> 豐富後設資料
                            </button>
                            <button id="ref-enrich-config-btn" class="ref-btn" title="配置後設資料更新策略">
                                <i class="fa fa-cog"></i>
                            </button>
                            <button id="ref-add-btn" class="ref-btn">
                                <i class="fa fa-plus"></i> 新增
                            </button>
                            <button id="ref-import-btn" class="ref-btn">
                                <i class="fa fa-upload"></i> 匯入
                            </button>
                            <button id="ref-export-btn" class="ref-btn">
                                <i class="fa fa-download"></i> 匯出
                            </button>
                        </div>
                        <div class="reference-toolbar-right">
                            <input type="text" id="ref-search-input" placeholder="搜尋文獻..." />
                            <select id="ref-filter-select">
                                <option value="all">全部</option>
                                <option value="recent">最近</option>
                                <option value="classic">經典</option>
                                <option value="verified">已驗證</option>
                                <option value="has-doi">有DOI</option>
                                <option value="no-doi">缺失DOI</option>
                            </select>
                        </div>
                    </div>

                    <div class="reference-stats" id="ref-stats">
                        <span>總計: <strong>0</strong></span>
                        <span>已驗證: <strong>0</strong></span>
                        <span>有DOI: <strong>0</strong></span>
                    </div>

                    <div class="reference-table-container">
                        <table class="reference-table" id="ref-table">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="ref-select-all" /></th>
                                    <th data-sort="index">#</th>
                                    <th data-sort="authors">作者</th>
                                    <th data-sort="title">標題</th>
                                    <th data-sort="year">年份</th>
                                    <th data-sort="journal">期刊/會議</th>
                                    <th data-sort="doi">DOI</th>
                                    <th data-sort="abstract">摘要</th>
                                    <th data-sort="tags">標籤</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody id="ref-table-body">
                                <tr class="ref-empty-state">
                                    <td colspan="10">暫無文獻資料,請點選"提取文獻"按鈕開始</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="reference-modal-footer">
                        <div class="reference-footer-left">
                            <span id="ref-selection-info">未選中</span>
                        </div>
                        <div class="reference-footer-right">
                            <button id="ref-batch-delete-btn" class="ref-btn ref-btn-danger" disabled>
                                刪除選中
                            </button>
                            <button id="ref-close-btn" class="ref-btn">關閉</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        }

        /**
         * 建立編輯模態框
         */
        createEditModal() {
            const modal = document.createElement('div');
            modal.id = 'reference-edit-modal';
            modal.className = 'reference-modal';
            modal.innerHTML = `
                <div class="reference-modal-content reference-edit-content">
                    <div class="reference-modal-header">
                        <h2><i class="fa fa-edit"></i> 編輯文獻</h2>
                        <button class="reference-modal-close" aria-label="關閉">&times;</button>
                    </div>

                    <div class="reference-edit-form">
                        <div class="ref-form-row">
                            <label>作者 *</label>
                            <input type="text" id="edit-authors" placeholder="用逗號分隔多個作者" />
                        </div>
                        <div class="ref-form-row">
                            <label>標題 *</label>
                            <input type="text" id="edit-title" placeholder="文獻標題" />
                        </div>
                        <div class="ref-form-row">
                            <label>年份</label>
                            <input type="number" id="edit-year" placeholder="發表年份" min="1900" max="2100" />
                        </div>
                        <div class="ref-form-row">
                            <label>期刊/會議</label>
                            <input type="text" id="edit-journal" placeholder="期刊或會議名稱" />
                        </div>
                        <div class="ref-form-row ref-form-row-half">
                            <div>
                                <label>卷號</label>
                                <input type="text" id="edit-volume" placeholder="Vol." />
                            </div>
                            <div>
                                <label>期號</label>
                                <input type="text" id="edit-issue" placeholder="No." />
                            </div>
                        </div>
                        <div class="ref-form-row">
                            <label>頁碼</label>
                            <input type="text" id="edit-pages" placeholder="例: 1-10" />
                        </div>
                        <div class="ref-form-row">
                            <label>DOI</label>
                            <input type="text" id="edit-doi" placeholder="10.xxxx/xxxxx" />
                        </div>
                        <div class="ref-form-row">
                            <label>URL</label>
                            <input type="url" id="edit-url" placeholder="https://" />
                        </div>
                        <div class="ref-form-row">
                            <label>型別</label>
                            <select id="edit-type">
                                <option value="journal">期刊</option>
                                <option value="conference">會議</option>
                                <option value="book">書籍</option>
                                <option value="thesis">論文</option>
                                <option value="other">其他</option>
                            </select>
                        </div>
                        <div class="ref-form-row">
                            <label>標籤</label>
                            <input type="text" id="edit-tags" placeholder="用逗號分隔標籤" />
                        </div>
                        <div class="ref-form-row">
                            <label>摘要</label>
                            <textarea id="edit-abstract" placeholder="文獻摘要" rows="4"></textarea>
                        </div>
                    </div>

                    <div class="reference-modal-footer">
                        <button id="ref-edit-cancel-btn" class="ref-btn">取消</button>
                        <button id="ref-edit-save-btn" class="ref-btn ref-btn-primary">儲存</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        }

        /**
         * 綁定事件監聽
         */
        attachEventListeners() {
            // 關閉按鈕
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('reference-modal-close') ||
                    e.target.id === 'ref-close-btn') {
                    this.closeManager();
                }
            });

            // 提取文獻
            document.getElementById('ref-extract-btn')?.addEventListener('click', () => {
                this.extractReferences();
            });

            // 豐富後設資料
            document.getElementById('ref-enrich-doi-btn')?.addEventListener('click', () => {
                this.enrichMetadata();
            });

            // 配置後設資料更新策略
            document.getElementById('ref-enrich-config-btn')?.addEventListener('click', () => {
                this.showEnrichmentConfigModal();
            });

            // 新增文獻
            document.getElementById('ref-add-btn')?.addEventListener('click', () => {
                this.showEditModal();
            });

            // 匯出
            document.getElementById('ref-export-btn')?.addEventListener('click', () => {
                this.showExportMenu();
            });

            // 搜尋
            document.getElementById('ref-search-input')?.addEventListener('input', (e) => {
                this.filterReferences(e.target.value);
            });

            // 篩選
            document.getElementById('ref-filter-select')?.addEventListener('change', (e) => {
                this.applyFilter(e.target.value);
            });

            // 全選
            document.getElementById('ref-select-all')?.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });

            // 批次刪除
            document.getElementById('ref-batch-delete-btn')?.addEventListener('click', () => {
                this.batchDelete();
            });

            // 表格排序
            document.querySelectorAll('[data-sort]').forEach(th => {
                th.addEventListener('click', () => {
                    this.sortTable(th.dataset.sort);
                });
            });
        }

        /**
         * 顯示管理介面
         * @param {string} documentId - 文件ID
         */
        async show(documentId) {
            this.currentDocumentId = documentId;
            await this.loadReferences();

            const modal = document.getElementById('reference-manager-modal');
            if (modal) {
                modal.style.display = 'flex';
                // 鎖定背景滾動，避免模態框開啟時頁面抖動
                this._prevBodyOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
            }
        }

        /**
         * 關閉管理介面
         */
        closeManager() {
            const modal = document.getElementById('reference-manager-modal');
            if (modal) {
                modal.style.display = 'none';
            }
            if (this._prevBodyOverflow !== undefined) {
                document.body.style.overflow = this._prevBodyOverflow;
                this._prevBodyOverflow = undefined;
            }
        }

        /**
         * 載入文獻資料
         */
        async loadReferences() {
            if (!this.currentDocumentId) return;

            const data = await global.ReferenceStorage.loadReferences(this.currentDocumentId);
            if (data && data.references) {
                this.references = data.references;
                this.filteredReferences = [...this.references];
                this.renderTable();
                this.updateStats();
            }
        }

        /**
         * 渲染表格
         */
        renderTable() {
            const tbody = document.getElementById('ref-table-body');
            if (!tbody) return;

            if (this.filteredReferences.length === 0) {
                tbody.innerHTML = `
                    <tr class="ref-empty-state">
                        <td colspan="10">暫無文獻資料</td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = this.filteredReferences.map(ref => `
                <tr data-index="${ref.index}">
                    <td><input type="checkbox" class="ref-checkbox" data-index="${ref.index}" /></td>
                    <td>${ref.index + 1}</td>
                    <td class="ref-authors" title="${(ref.authors || []).join(', ')}">
                        ${this.formatAuthors(ref.authors)}
                    </td>
                    <td class="ref-title" title="${ref.title || ''}">
                        ${ref.title || '<em>未提取</em>'}
                    </td>
                    <td>${ref.year || '-'}</td>
                    <td class="ref-journal" title="${ref.journal || ''}">
                        ${ref.journal || '-'}
                    </td>
                    <td>
                        ${ref.doi ?
                            `<a href="https://doi.org/${ref.doi}" target="_blank" class="ref-doi">${ref.doi}</a>` :
                            ref.doiFallback ?
                                `<div style="display: flex; align-items: center; gap: 4px; color: #f59e0b;">
                                    <span title="${ref.doiFallbackMessage || '未找到DOI'}">⚠️</span>
                                    <a href="${ref.doiFallbackUrl}" target="_blank" style="color: #3b82f6; font-size: 0.9em;" title="在Google中搜尋">🔍</a>
                                </div>` :
                                '-'}
                    </td>
                    <td class="ref-abstract" title="${ref.abstract || ''}">
                        ${this.formatAbstract(ref.abstract)}
                    </td>
                    <td>
                        ${this.renderTags(ref.tags)}
                    </td>
                    <td class="ref-actions">
                        <button class="ref-action-btn" data-action="edit" data-index="${ref.index}" title="編輯"><i class="fa fa-edit"></i></button>
                        <button class="ref-action-btn" data-action="view" data-index="${ref.index}" title="檢視原文"><i class="fa fa-eye"></i></button>
                        <button class="ref-action-btn" data-action="delete" data-index="${ref.index}" title="刪除"><i class="fa fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');

            // 綁定操作按鈕事件
            tbody.querySelectorAll('.ref-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = e.currentTarget.dataset.action;
                    const index = parseInt(e.currentTarget.dataset.index);
                    this.handleAction(action, index);
                });
            });

            // 綁定核取方塊事件
            tbody.querySelectorAll('.ref-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const index = parseInt(e.currentTarget.dataset.index);
                    if (e.currentTarget.checked) {
                        this.selectedReferences.add(index);
                    } else {
                        this.selectedReferences.delete(index);
                    }
                    this.updateSelectionInfo();
                });
            });
        }

        /**
         * 格式化作者顯示
         */
        formatAuthors(authors) {
            if (!authors || authors.length === 0) {
                return '<em>未提取</em>';
            }
            if (authors.length === 1) {
                return authors[0];
            }
            return `${authors[0]} 等 ${authors.length} 人`;
        }

        /**
         * 格式化摘要顯示
         */
        formatAbstract(abstract) {
            if (!abstract) {
                return '-';
            }
            // 限制長度，顯示前100個字元
            const maxLength = 100;
            if (abstract.length <= maxLength) {
                return abstract;
            }
            return abstract.substring(0, maxLength) + '...';
        }

        /**
         * 渲染標籤
         */
        renderTags(tags) {
            if (!tags || tags.length === 0) {
                return '-';
            }
            return tags.map(tag => `<span class="ref-tag">${tag}</span>`).join(' ');
        }

        /**
         * 更新統計資訊
         */
        updateStats() {
            const statsEl = document.getElementById('ref-stats');
            if (!statsEl) return;

            const total = this.references.length;
            const withDOI = this.references.filter(ref => !!ref.doi).length;

            statsEl.innerHTML = `
                <span>總計: <strong>${total}</strong></span>
                <span>已驗證: <strong>${withDOI}</strong></span>
                <span>有DOI: <strong>${withDOI}</strong></span>
            `;
        }

        /**
         * 更新選中資訊
         */
        updateSelectionInfo() {
            const info = document.getElementById('ref-selection-info');
            const deleteBtn = document.getElementById('ref-batch-delete-btn');

            if (this.selectedReferences.size === 0) {
                info.textContent = '未選中';
                deleteBtn.disabled = true;
            } else {
                info.textContent = `已選中 ${this.selectedReferences.size} 項`;
                deleteBtn.disabled = false;
            }
        }

        /**
         * 提取文獻
         */
        async extractReferences() {
            // 獲取當前文件內容
            const markdown = await this.getCurrentDocumentContent();
            if (!markdown) {
                alert('無法獲取文件內容');
                return;
            }

            // 檢測參考文獻
            const section = global.ReferenceDetector.detectReferenceSection(markdown);
            if (!section) {
                alert('未檢測到參考文獻部分。請確保文件包含"References"或"參考文獻"等標題。');
                return;
            }

            console.log(`檢測到 ${section.entries.length} 條文獻`);

            // 讓使用者選擇提取方式
            this.showExtractionMethodModal(section);
        }

        /**
         * 顯示提取方式選擇模態框
         */
        showExtractionMethodModal(section) {
            // 建立模態框
            const modal = document.createElement('div');
            modal.className = 'reference-modal';
            modal.style.display = 'flex';
            modal.innerHTML = `
                <div class="reference-modal-content reference-edit-content">
                    <div class="reference-modal-header">
                        <h2><i class="fa fa-search"></i> 選擇提取方式</h2>
                        <button class="reference-modal-close">&times;</button>
                    </div>
                    <div class="reference-edit-form">
                        <div style="margin-bottom: 20px; padding: 15px; background: #f0f4f8; border-radius: 8px;">
                            <p style="margin: 0 0 10px 0; color: #555;">
                                <i class="fa fa-info-circle" style="color: #3b82f6;"></i>
                                檢測到 <strong>${section.entries.length}</strong> 條文獻
                            </p>
                        </div>

                        <div class="extraction-method-options">
                            <div class="extraction-method-item" data-method="regex">
                                <div class="method-icon">
                                    <i class="fa fa-code"></i>
                                </div>
                                <div class="method-info">
                                    <h3>正規表示式提取</h3>
                                    <p>使用規則比對，速度快，適合格式規範的文獻</p>
                                    <ul>
                                        <li>✓ 速度快，無需API</li>
                                        <li>✓ 支援標準格式（APA、IEEE等）</li>
                                        <li>✗ 格式不規範時可能失敗</li>
                                    </ul>
                                </div>
                            </div>

                            <div class="extraction-method-item" data-method="ai">
                                <div class="method-icon">
                                    <i class="fa fa-magic"></i>
                                </div>
                                <div class="method-info">
                                    <h3>AI智慧提取</h3>
                                    <p>使用AI理解文獻內容，準確度高，適合任何格式</p>
                                    <ul>
                                        <li>✓ 支援任意格式</li>
                                        <li>✓ 準確度高</li>
                                        <li>✗ 需要API，速度較慢</li>
                                    </ul>
                                </div>
                            </div>

                            <div class="extraction-method-item" data-method="hybrid">
                                <div class="method-icon">
                                    <i class="fa fa-bolt"></i>
                                </div>
                                <div class="method-info">
                                    <h3>混合模式（推薦）</h3>
                                    <p>先用正則提取，失敗的文獻再用AI處理</p>
                                    <ul>
                                        <li>✓ 兼顧速度和準確度</li>
                                        <li>✓ 最大化成功率</li>
                                        <li>✓ 節省API呼叫</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="reference-modal-footer">
                        <div class="reference-footer-left"></div>
                        <div class="reference-footer-right">
                            <button id="extraction-cancel-btn" class="ref-btn">取消</button>
                        </div>
                    </div>
                </div>
            `;

            // 新增到頁面
            document.body.appendChild(modal);

            // 綁定點選事件
            modal.querySelectorAll('.extraction-method-item').forEach(item => {
                item.addEventListener('click', () => {
                    const method = item.dataset.method;
                    document.body.removeChild(modal);
                    this.startExtraction(section, method);
                });
            });

            // 關閉按鈕
            modal.querySelector('.reference-modal-close').addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            modal.querySelector('#extraction-cancel-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            // 點選背景關閉
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            });
        }

        /**
         * 開始提取
         */
        async startExtraction(section, method) {
            if (method === 'regex') {
                // 純正則提取
                const extracted = global.ReferenceExtractor.batchExtract(section.entries);
                this.saveExtractedReferences(extracted);
            } else if (method === 'ai') {
                // 純AI提取
                await this.extractWithAI(section.entries);
            } else if (method === 'hybrid') {
                // 混合模式
                const extracted = global.ReferenceExtractor.batchExtract(section.entries);
                const needsAI = extracted.filter(e => e.needsAIProcessing);

                if (needsAI.length > 0) {
                    const message = `正則成功提取: ${extracted.length - needsAI.length} 條\n` +
                                  `需要AI處理: ${needsAI.length} 條\n\n` +
                                  `是否繼續使用AI處理剩餘文獻？`;

                    if (confirm(message)) {
                        await this.processWithAI(extracted);
                    } else {
                        this.saveExtractedReferences(extracted);
                    }
                } else {
                    this.saveExtractedReferences(extracted);
                }
            }
        }

        /**
         * 純AI提取
         */
        async extractWithAI(entries) {
            // 獲取API配置
            const apiConfig = await this.getAPIConfig();
            if (!apiConfig) {
                alert('請先配置AI模型');
                return;
            }

            // 顯示進度
            this.showProgress('正在使用AI提取文獻...');

            try {
                // 建立原始參考物件
                const rawReferences = entries.map(entry => ({
                    rawText: entry.text,
                    lineStart: entry.lineStart,
                    lineEnd: entry.lineEnd,
                    needsAIProcessing: true
                }));

                const processed = await global.ReferenceAIProcessor.smartProcessReferences(
                    rawReferences,
                    apiConfig,
                    'auto',
                    (progress) => {
                        this.updateProgress(
                            `處理進度: ${progress.processed}/${progress.total} (${progress.batchIndex + 1}/${progress.totalBatches} 批)`
                        );
                    }
                );

                this.hideProgress();
                this.saveExtractedReferences(processed);
            } catch (error) {
                this.hideProgress();
                alert('AI處理失敗: ' + error.message);
            }
        }

        /**
         * 顯示處理選項
         */
        showProcessingOptions(extracted) {
            const needsAI = extracted.filter(e => e.needsAIProcessing).length;

            const message = `檢測到 ${extracted.length} 條文獻\n` +
                          `正規表示式成功提取: ${extracted.length - needsAI} 條\n` +
                          `需要AI處理: ${needsAI} 條\n\n` +
                          `是否使用AI處理剩餘文獻？`;

            if (needsAI > 0 && confirm(message)) {
                this.processWithAI(extracted);
            } else {
                // 直接儲存正則提取的結果
                this.saveExtractedReferences(extracted);
            }
        }

        /**
         * AI處理文獻
         */
        async processWithAI(extracted) {
            // 獲取API配置
            const apiConfig = await this.getAPIConfig();
            if (!apiConfig) {
                alert('請先配置AI模型');
                return;
            }

            // 顯示進度
            this.showProgress('正在使用AI處理文獻...');

            try {
                const processed = await global.ReferenceAIProcessor.smartProcessReferences(
                    extracted,
                    apiConfig,
                    'auto',
                    (progress) => {
                        this.updateProgress(
                            `處理進度: ${progress.processed}/${progress.total} (${progress.batchIndex + 1}/${progress.totalBatches} 批)`
                        );
                    }
                );

                this.hideProgress();
                this.saveExtractedReferences(processed);
            } catch (error) {
                this.hideProgress();
                alert('AI處理失敗: ' + error.message);
            }
        }

        /**
         * 儲存提取的文獻
         */
        async saveExtractedReferences(references) {
            // 建立索引
            const markdown = await this.getCurrentDocumentContent();
            if (markdown && window.ReferenceIndexer) {
                const indexedReferences = window.ReferenceIndexer.buildIndex(
                    this.currentDocumentId,
                    markdown,
                    references
                );
                references = indexedReferences;
            }

            const success = await global.ReferenceStorage.saveReferences(
                this.currentDocumentId,
                references,
                {
                    extractedAt: new Date().toISOString(),
                    method: 'auto'
                }
            );

            if (success) {
                alert(`成功儲存 ${references.length} 條文獻`);
                await this.loadReferences();
            } else {
                alert('儲存失敗');
            }
        }

        /**
         * 獲取當前文件內容
         */
        async getCurrentDocumentContent() {
            // 方式1: 從 window.data 獲取（詳情頁）
            if (window.data && window.data.ocr) {
                return window.data.ocr;
            }

            // 方式2: 從currentOcrResult獲取（主頁面）
            if (window.currentOcrResult && window.currentOcrResult.markdown) {
                return window.currentOcrResult.markdown;
            }

            // 方式3: 從currentHistoryData獲取
            if (window.currentHistoryData && window.currentHistoryData.ocrResult) {
                return window.currentHistoryData.ocrResult;
            }

            console.error('[ReferenceManagerUI] 無法獲取文件內容');
            return null;
        }

        /**
         * 獲取API配置（使用與Chatbot相同的配置獲取方式）
         */
        async getAPIConfig() {
            // 使用與Chatbot相同的配置獲取函式
            if (typeof window.MessageSender?.getChatbotConfig === 'function') {
                const config = window.MessageSender.getChatbotConfig();

                if (!config || !config.apiKey) {
                    alert('請先配置AI模型和API Key');
                    return null;
                }

                // 如果是自定義模型，使用Chatbot的buildCustomApiConfig
                if (config.model === 'custom' || config.model.startsWith('custom_source_')) {
                    const endpoint = config.cms.apiEndpoint || config.cms.apiBaseUrl;

                    if (!endpoint || !config.cms.modelId) {
                        alert('自定義模型配置不完整');
                        return null;
                    }

                    // 使用Chatbot的buildCustomApiConfig函式（保證一致性）
                    if (typeof window.ApiConfigBuilder?.buildCustomApiConfig === 'function') {
                        const builtConfig = window.ApiConfigBuilder.buildCustomApiConfig(
                            config.apiKey,
                            endpoint,
                            config.cms.modelId || config.cms.preferredModelId,
                            config.cms.requestFormat,
                            parseFloat(config.cms.temperature) || 0.1,
                            parseInt(config.cms.max_tokens) || 4000,
                            {
                                endpointMode: config.cms.endpointMode || 'auto'
                            }
                        );

                        console.log('[ReferenceManagerUI] 使用buildCustomApiConfig構建的配置:', builtConfig);
                        return builtConfig;
                    }

                    console.error('[ReferenceManagerUI] buildCustomApiConfig函式不可用');
                    return null;
                }

                // 預設模型
                return global.ReferenceAIProcessor.buildAPIConfig(config.model, config.apiKey);
            }

            // 備用方案：使用舊的獲取方式
            const settings = typeof loadSettings === 'function' ? loadSettings() : {};
            const model = settings.selectedTranslationModel || 'gemini';
            const apiKey = settings.apiKeys?.[model] || '';

            if (!apiKey) {
                alert('請先配置AI模型和API Key');
                return null;
            }

            return global.ReferenceAIProcessor.buildAPIConfig(model, apiKey);
        }

        /**
         * 處理操作
         */
        handleAction(action, index) {
            const ref = this.references.find(r => r.index === index);
            if (!ref) return;

            switch (action) {
                case 'edit':
                    this.showEditModal(ref);
                    break;
                case 'view':
                    this.viewInDocument(ref);
                    break;
                case 'delete':
                    if (confirm('確定要刪除這條文獻嗎？')) {
                        this.deleteReference(index);
                    }
                    break;
            }
        }

        /**
         * 顯示編輯模態框
         */
        showEditModal(ref = null) {
            if (!document.getElementById('reference-edit-modal')) {
                this.createEditModal();
            }

            const modal = document.getElementById('reference-edit-modal');

            // 填充資料
            if (ref) {
                document.getElementById('edit-authors').value = (ref.authors || []).join(', ');
                document.getElementById('edit-title').value = ref.title || '';
                document.getElementById('edit-year').value = ref.year || '';
                document.getElementById('edit-journal').value = ref.journal || '';
                document.getElementById('edit-volume').value = ref.volume || '';
                document.getElementById('edit-issue').value = ref.issue || '';
                document.getElementById('edit-pages').value = ref.pages || '';
                document.getElementById('edit-doi').value = ref.doi || '';
                document.getElementById('edit-url').value = ref.url || '';
                document.getElementById('edit-type').value = ref.type || 'journal';
                document.getElementById('edit-tags').value = (ref.tags || []).join(', ');
                document.getElementById('edit-abstract').value = ref.abstract || '';
            }

            modal.style.display = 'flex';

            // 綁定儲存按鈕
            const saveBtn = document.getElementById('ref-edit-save-btn');
            saveBtn.onclick = () => this.saveEdit(ref);

            // 綁定取消按鈕
            const cancelBtn = document.getElementById('ref-edit-cancel-btn');
            cancelBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }

        /**
         * 儲存編輯
         */
        async saveEdit(originalRef) {
            const updates = {
                authors: document.getElementById('edit-authors').value.split(',').map(s => s.trim()).filter(Boolean),
                title: document.getElementById('edit-title').value,
                year: parseInt(document.getElementById('edit-year').value) || null,
                journal: document.getElementById('edit-journal').value,
                volume: document.getElementById('edit-volume').value,
                issue: document.getElementById('edit-issue').value,
                pages: document.getElementById('edit-pages').value,
                doi: document.getElementById('edit-doi').value,
                url: document.getElementById('edit-url').value,
                type: document.getElementById('edit-type').value,
                tags: document.getElementById('edit-tags').value.split(',').map(s => s.trim()).filter(Boolean),
                abstract: document.getElementById('edit-abstract').value
            };

            if (originalRef) {
                // 更新現有文獻
                await global.ReferenceStorage.updateReference(this.currentDocumentId, originalRef.index, updates);
            } else {
                // 新增新文獻
                await global.ReferenceStorage.addReference(this.currentDocumentId, updates);
            }

            document.getElementById('reference-edit-modal').style.display = 'none';
            await this.loadReferences();
        }

        /**
         * 在文件中檢視
         */
        viewInDocument(ref) {
            // 使用索引器滾動到文獻在原文中的位置
            if (window.ReferenceIndexer) {
                const success = window.ReferenceIndexer.scrollToReference(
                    this.currentDocumentId,
                    ref.index
                );

                if (success) {
                    // 關閉管理器以顯示原文
                    this.closeManager();
                } else {
                    alert('無法定位到原文位置，文獻可能不在當前文件中');
                }
            } else {
                console.error('[ReferenceManagerUI] Indexer not available');
                alert('索引器未載入，無法定位原文位置');
            }
        }

        /**
         * 刪除文獻
         */
        async deleteReference(index) {
            await global.ReferenceStorage.removeReference(this.currentDocumentId, index);
            await this.loadReferences();
        }

        /**
         * 批次刪除
         */
        async batchDelete() {
            if (!confirm(`確定要刪除選中的 ${this.selectedReferences.size} 條文獻嗎？`)) {
                return;
            }

            // 從大到小刪除，避免索引變化
            const indices = Array.from(this.selectedReferences).sort((a, b) => b - a);
            for (const index of indices) {
                await global.ReferenceStorage.removeReference(this.currentDocumentId, index);
            }

            this.selectedReferences.clear();
            await this.loadReferences();
        }

        /**
         * 篩選文獻
         */
        filterReferences(query) {
            if (!query) {
                this.filteredReferences = [...this.references];
            } else {
                const lowerQuery = query.toLowerCase();
                this.filteredReferences = this.references.filter(ref => {
                    const searchText = [
                        ref.title,
                        ...(ref.authors || []),
                        ref.journal,
                        ref.doi
                    ].filter(Boolean).join(' ').toLowerCase();

                    return searchText.includes(lowerQuery);
                });
            }

            this.renderTable();
        }

        /**
         * 應用篩選器
         */
        applyFilter(filter) {
            switch (filter) {
                case 'all':
                    this.filteredReferences = [...this.references];
                    break;
                case 'recent':
                    this.filteredReferences = this.references.filter(ref =>
                        ref.tags && ref.tags.includes('Recent')
                    );
                    break;
                case 'classic':
                    this.filteredReferences = this.references.filter(ref =>
                        ref.tags && ref.tags.includes('Classic')
                    );
                    break;
                case 'verified':
                    this.filteredReferences = this.references.filter(ref => ref.doi);
                    break;
            }

            this.renderTable();
        }

        /**
         * 排序表格
         */
        sortTable(column) {
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }

            this.filteredReferences.sort((a, b) => {
                let aVal = a[column];
                let bVal = b[column];

                if (column === 'authors') {
                    aVal = (a.authors || [])[0] || '';
                    bVal = (b.authors || [])[0] || '';
                }

                if (aVal === bVal) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;

                const comparison = aVal < bVal ? -1 : 1;
                return this.sortDirection === 'asc' ? comparison : -comparison;
            });

            this.renderTable();
        }

        /**
         * 全選/取消全選
         */
        toggleSelectAll(checked) {
            this.selectedReferences.clear();

            if (checked) {
                this.filteredReferences.forEach(ref => {
                    this.selectedReferences.add(ref.index);
                });
            }

            document.querySelectorAll('.ref-checkbox').forEach(checkbox => {
                checkbox.checked = checked;
            });

            this.updateSelectionInfo();
        }

        /**
         * 顯示匯出選單
         */
        showExportMenu() {
            const options = ['BibTeX', 'JSON', 'CSV'];
            const choice = prompt(`選擇匯出格式:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`);

            if (!choice) return;

            const index = parseInt(choice) - 1;
            if (index >= 0 && index < options.length) {
                this.exportReferences(options[index].toLowerCase());
            }
        }

        /**
         * 匯出文獻
         */
        exportReferences(format) {
            let content = '';
            let filename = '';

            switch (format) {
                case 'bibtex':
                    content = global.ReferenceStorage.exportToBibTeX(this.currentDocumentId);
                    filename = 'references.bib';
                    break;
                case 'json':
                    content = global.ReferenceStorage.exportToJSON(this.currentDocumentId);
                    filename = 'references.json';
                    break;
                case 'csv':
                    content = this.exportToCSV();
                    filename = 'references.csv';
                    break;
            }

            if (content) {
                this.downloadFile(content, filename);
            }
        }

        /**
         * 匯出為CSV
         */
        exportToCSV() {
            const headers = ['Index', 'Authors', 'Title', 'Year', 'Journal', 'Volume', 'Issue', 'Pages', 'DOI', 'URL', 'Type', 'Tags'];
            const rows = this.references.map(ref => [
                ref.index + 1,
                (ref.authors || []).join('; '),
                ref.title || '',
                ref.year || '',
                ref.journal || '',
                ref.volume || '',
                ref.issue || '',
                ref.pages || '',
                ref.doi || '',
                ref.url || '',
                ref.type || '',
                (ref.tags || []).join('; ')
            ]);

            const csv = [headers, ...rows].map(row =>
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ).join('\n');

            return csv;
        }

        /**
         * 下載檔案
         */
        downloadFile(content, filename) {
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        /**
         * 顯示進度
         */
        showProgress(message) {
            // 簡單實現，可以改進為更好的進度條
            const progress = document.createElement('div');
            progress.id = 'ref-progress';
            progress.className = 'ref-progress';
            progress.innerHTML = `<div class="ref-progress-content">${message}</div>`;
            document.body.appendChild(progress);
        }

        /**
         * 更新進度
         */
        updateProgress(message) {
            const progress = document.getElementById('ref-progress');
            if (progress) {
                progress.querySelector('.ref-progress-content').textContent = message;
            }
        }

        /**
         * 隱藏進度
         */
        hideProgress() {
            const progress = document.getElementById('ref-progress');
            if (progress) {
                progress.remove();
            }
        }

        /**
         * 顯示後設資料更新策略配置模態框
         */
        showEnrichmentConfigModal() {
            const config = this.getEnrichmentConfig();

            const modal = document.createElement('div');
            modal.className = 'ref-modal';
            modal.innerHTML = `
                <div class="ref-modal-content" style="max-width: 600px;">
                    <div class="ref-modal-header">
                        <h3><i class="fa fa-cog"></i> 後設資料更新策略配置</h3>
                        <button class="ref-modal-close">&times;</button>
                    </div>
                    <div class="ref-modal-body">
                        <div class="enrichment-config-section">
                            <p class="enrichment-config-desc">
                                <i class="fa fa-info-circle"></i>
                                配置從外部資料來源獲取資料後，如何更新現有文獻的各個欄位
                            </p>

                            <div class="enrichment-field-config">
                                <div class="field-config-item">
                                    <label>
                                        <strong><i class="fa fa-link"></i> DOI</strong>
                                        <span class="field-desc">數字物件識別符號</span>
                                    </label>
                                    <select id="config-doi" data-field="doi">
                                        <option value="always" ${config.doi === 'always' ? 'selected' : ''}>總是更新</option>
                                        <option value="if_empty" ${config.doi === 'if_empty' ? 'selected' : ''}>僅為空時更新</option>
                                        <option value="keep_original" ${config.doi === 'keep_original' ? 'selected' : ''}>保持原資料</option>
                                    </select>
                                </div>

                                <div class="field-config-item">
                                    <label>
                                        <strong><i class="fa fa-file-text-o"></i> 摘要</strong>
                                        <span class="field-desc">文獻摘要資訊</span>
                                    </label>
                                    <select id="config-abstract" data-field="abstract">
                                        <option value="always" ${config.abstract === 'always' ? 'selected' : ''}>總是更新</option>
                                        <option value="if_empty" ${config.abstract === 'if_empty' ? 'selected' : ''}>僅為空時更新</option>
                                        <option value="prefer_new" ${config.abstract === 'prefer_new' ? 'selected' : ''}>優先新資料</option>
                                        <option value="keep_original" ${config.abstract === 'keep_original' ? 'selected' : ''}>保持原資料</option>
                                    </select>
                                </div>

                                <div class="field-config-item">
                                    <label>
                                        <strong><i class="fa fa-user"></i> 作者</strong>
                                        <span class="field-desc">文獻作者列表</span>
                                    </label>
                                    <select id="config-authors" data-field="authors">
                                        <option value="always" ${config.authors === 'always' ? 'selected' : ''}>總是更新</option>
                                        <option value="if_empty" ${config.authors === 'if_empty' ? 'selected' : ''}>僅為空時更新</option>
                                        <option value="prefer_new" ${config.authors === 'prefer_new' ? 'selected' : ''}>優先新資料</option>
                                        <option value="keep_original" ${config.authors === 'keep_original' ? 'selected' : ''}>保持原資料</option>
                                    </select>
                                </div>

                                <div class="field-config-item">
                                    <label>
                                        <strong><i class="fa fa-calendar"></i> 年份</strong>
                                        <span class="field-desc">發表年份</span>
                                    </label>
                                    <select id="config-year" data-field="year">
                                        <option value="always" ${config.year === 'always' ? 'selected' : ''}>總是更新</option>
                                        <option value="if_empty" ${config.year === 'if_empty' ? 'selected' : ''}>僅為空時更新</option>
                                        <option value="prefer_new" ${config.year === 'prefer_new' ? 'selected' : ''}>優先新資料</option>
                                        <option value="keep_original" ${config.year === 'keep_original' ? 'selected' : ''}>保持原資料</option>
                                    </select>
                                </div>

                                <div class="field-config-item">
                                    <label>
                                        <strong><i class="fa fa-book"></i> 期刊/會議</strong>
                                        <span class="field-desc">發表期刊或會議名稱</span>
                                    </label>
                                    <select id="config-journal" data-field="journal">
                                        <option value="always" ${config.journal === 'always' ? 'selected' : ''}>總是更新</option>
                                        <option value="if_empty" ${config.journal === 'if_empty' ? 'selected' : ''}>僅為空時更新</option>
                                        <option value="prefer_new" ${config.journal === 'prefer_new' ? 'selected' : ''}>優先新資料</option>
                                        <option value="keep_original" ${config.journal === 'keep_original' ? 'selected' : ''}>保持原資料</option>
                                    </select>
                                </div>

                                <div class="field-config-item">
                                    <label>
                                        <strong><i class="fa fa-link"></i> URL</strong>
                                        <span class="field-desc">文獻訪問連結</span>
                                    </label>
                                    <select id="config-url" data-field="url">
                                        <option value="always" ${config.url === 'always' ? 'selected' : ''}>總是更新</option>
                                        <option value="if_empty" ${config.url === 'if_empty' ? 'selected' : ''}>僅為空時更新</option>
                                        <option value="prefer_new" ${config.url === 'prefer_new' ? 'selected' : ''}>優先新資料</option>
                                        <option value="keep_original" ${config.url === 'keep_original' ? 'selected' : ''}>保持原資料</option>
                                    </select>
                                </div>
                            </div>

                            <div class="enrichment-strategy-legend">
                                <h4>更新策略說明：</h4>
                                <ul>
                                    <li><strong>總是更新：</strong>用新資料覆蓋現有資料（推薦用於DOI）</li>
                                    <li><strong>僅為空時更新：</strong>只有欄位為空時才填充（保守策略）</li>
                                    <li><strong>優先新資料：</strong>新資料更完整時使用新資料（智慧策略）</li>
                                    <li><strong>保持原資料：</strong>不更新該欄位（保護原始資料）</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="ref-modal-footer">
                        <button class="ref-btn" id="enrichment-config-reset">
                            <i class="fa fa-undo"></i> 恢復預設
                        </button>
                        <button class="ref-btn ref-btn-primary" id="enrichment-config-save">
                            <i class="fa fa-save"></i> 儲存配置
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // 綁定事件
            modal.querySelector('.ref-modal-close').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

            // 恢復預設
            document.getElementById('enrichment-config-reset').addEventListener('click', () => {
                const defaultConfig = this.getDefaultEnrichmentConfig();
                Object.keys(defaultConfig).forEach(field => {
                    const select = modal.querySelector(`[data-field="${field}"]`);
                    if (select) select.value = defaultConfig[field];
                });
            });

            // 儲存配置
            document.getElementById('enrichment-config-save').addEventListener('click', () => {
                const newConfig = {};
                modal.querySelectorAll('[data-field]').forEach(select => {
                    newConfig[select.dataset.field] = select.value;
                });
                this.saveEnrichmentConfig(newConfig);
                alert('配置已儲存');
                modal.remove();
            });
        }

        /**
         * 獲取預設後設資料更新策略
         */
        getDefaultEnrichmentConfig() {
            return {
                doi: 'always',          // DOI總是更新
                abstract: 'if_empty',   // 摘要僅為空時更新
                authors: 'if_empty',    // 作者僅為空時更新
                year: 'if_empty',       // 年份僅為空時更新
                journal: 'prefer_new',  // 期刊優先新資料
                url: 'if_empty'         // URL僅為空時更新
            };
        }

        /**
         * 獲取後設資料更新策略配置
         */
        getEnrichmentConfig() {
            try {
                const saved = localStorage.getItem('referenceEnrichmentConfig');
                return saved ? JSON.parse(saved) : this.getDefaultEnrichmentConfig();
            } catch (error) {
                console.warn('[ReferenceManagerUI] Failed to load enrichment config:', error);
                return this.getDefaultEnrichmentConfig();
            }
        }

        /**
         * 儲存後設資料更新策略配置
         */
        saveEnrichmentConfig(config) {
            try {
                localStorage.setItem('referenceEnrichmentConfig', JSON.stringify(config));
            } catch (error) {
                console.error('[ReferenceManagerUI] Failed to save enrichment config:', error);
            }
        }

        /**
         * 豐富後設資料（新版）
         */
        async enrichMetadata() {
            if (!this.references || this.references.length === 0) {
                alert('請先提取文獻');
                return;
            }
            if (!window.DOIResolver) {
                alert('DOI解析器未載入');
                return;
            }

            // 獲取配置
            const config = this.getEnrichmentConfig();

            // 根據配置決定需要更新的文獻
            const needsEnrichment = this.references.filter(ref => {
                if (!ref.title) return false;

                // 檢查是否有任何欄位需要更新
                return (
                    (config.doi !== 'keep_original' && (!ref.doi || config.doi === 'always')) ||
                    (config.abstract !== 'keep_original' && (!ref.abstract || config.abstract === 'always' || config.abstract === 'prefer_new')) ||
                    (config.authors !== 'keep_original' && (!ref.authors || config.authors === 'always' || config.authors === 'prefer_new')) ||
                    (config.year !== 'keep_original' && (!ref.year || config.year === 'always' || config.year === 'prefer_new')) ||
                    (config.journal !== 'keep_original' && (!ref.journal || config.journal === 'always' || config.journal === 'prefer_new'))
                );
            });

            if (needsEnrichment.length === 0) {
                alert('根據當前配置，沒有文獻需要豐富後設資料');
                return;
            }

            // 構建確認訊息
            let strategyMsg = '更新策略：\n';
            Object.keys(config).forEach(field => {
                const label = {
                    doi: 'DOI',
                    abstract: '摘要',
                    authors: '作者',
                    year: '年份',
                    journal: '期刊',
                    url: 'URL'
                }[field] || field;
                const strategy = {
                    always: '總是更新',
                    if_empty: '僅為空時更新',
                    prefer_new: '優先新資料',
                    keep_original: '保持原資料'
                }[config[field]] || config[field];
                strategyMsg += `${label}: ${strategy}\n`;
            });

            const confirmed = confirm(
                `檢測到 ${needsEnrichment.length}/${this.references.length} 條文獻需要豐富後設資料\n\n` +
                `${strategyMsg}\n` +
                `將透過 CrossRef、OpenAlex、arXiv、PubMed 並行查詢\n` +
                `失敗的文獻將使用 Semantic Scholar 託底\n\n` +
                `是否繼續？`
            );

            if (!confirmed) return;

            this.showProgress(`準備豐富 ${needsEnrichment.length} 條文獻的後設資料...`);

            try {
                // 建立resolver
                const resolver = window.DOIResolver.create();
                const results = await resolver.batchResolve(needsEnrichment, (progress) => {
                    if (progress.phase === 'fallback') {
                        this.updateProgress(`Semantic Scholar 託底查詢中...`);
                    } else {
                        this.updateProgress(`正在豐富後設資料: ${progress.completed}/${progress.total}`);
                    }
                });

                this.hideProgress();

                let successCount = 0;
                let fallbackCount = 0;

                // 應用更新策略
                results.forEach(result => {
                    if (result.success && result.resolved) {
                        const originalRef = this.references.find(r => r === result.original);
                        if (originalRef) {
                            // 檢查是否是fallback（Google搜尋連結）
                            if (result.resolved.fallback) {
                                originalRef.doiFallback = true;
                                originalRef.doiFallbackUrl = result.resolved.url;
                                originalRef.doiFallbackMessage = result.resolved.message;
                                fallbackCount++;
                            } else {
                                // 應用欄位更新策略
                                const resolved = result.resolved;

                                // DOI
                                if (resolved.doi && this.shouldUpdateField(originalRef, 'doi', resolved.doi, config.doi)) {
                                    originalRef.doi = resolved.doi;
                                    successCount++;
                                }

                                // 摘要
                                if (resolved.abstract && this.shouldUpdateField(originalRef, 'abstract', resolved.abstract, config.abstract)) {
                                    originalRef.abstract = resolved.abstract;
                                }

                                // 作者
                                if (resolved.authors && this.shouldUpdateField(originalRef, 'authors', resolved.authors, config.authors)) {
                                    originalRef.authors = resolved.authors;
                                }

                                // 年份
                                if (resolved.year && this.shouldUpdateField(originalRef, 'year', resolved.year, config.year)) {
                                    originalRef.year = resolved.year;
                                }

                                // 期刊
                                if (resolved.journal && this.shouldUpdateField(originalRef, 'journal', resolved.journal, config.journal)) {
                                    originalRef.journal = resolved.journal;
                                }

                                // URL
                                if (resolved.url && this.shouldUpdateField(originalRef, 'url', resolved.url, config.url)) {
                                    originalRef.url = resolved.url;
                                }
                            }
                        }
                    }
                });

                await global.ReferenceStorage.saveReferences(this.currentDocumentId, this.references, {
                    updatedAt: new Date().toISOString(),
                    metadataEnriched: true
                });
                await this.loadReferences();

                let message = `後設資料豐富完成\n\n成功: ${successCount}/${needsEnrichment.length}`;
                if (fallbackCount > 0) {
                    message += `\n未找到: ${fallbackCount}（已生成搜尋連結）`;
                }
                const failedCount = needsEnrichment.length - successCount - fallbackCount;
                if (failedCount > 0) {
                    message += `\n失敗: ${failedCount}`;
                }
                alert(message);
            } catch (error) {
                this.hideProgress();
                alert('後設資料豐富失敗: ' + error.message);
                console.error('[ReferenceManagerUI] Metadata enrichment failed:', error);
            }
        }

        /**
         * 判斷是否應該更新欄位
         */
        shouldUpdateField(originalRef, fieldName, newValue, strategy) {
            const originalValue = originalRef[fieldName];

            switch (strategy) {
                case 'always':
                    return true;

                case 'if_empty':
                    return !originalValue || (Array.isArray(originalValue) && originalValue.length === 0);

                case 'prefer_new':
                    // 如果原值為空，使用新值
                    if (!originalValue || (Array.isArray(originalValue) && originalValue.length === 0)) {
                        return true;
                    }
                    // 如果新值更完整（例如作者列表更長），使用新值
                    if (Array.isArray(newValue) && Array.isArray(originalValue)) {
                        return newValue.length > originalValue.length;
                    }
                    // 如果新值更長（例如摘要更詳細），使用新值
                    if (typeof newValue === 'string' && typeof originalValue === 'string') {
                        return newValue.length > originalValue.length * 1.2; // 至少長20%才算更完整
                    }
                    return false;

                case 'keep_original':
                default:
                    return false;
            }
        }
    }

    // 建立全域例項
    const ui = new ReferenceManagerUI();

    // 匯出API
    global.ReferenceManagerUI = ui;

    // 自動初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ui.initialize());
    } else {
        ui.initialize();
    }

    console.log('[ReferenceManagerUI] Reference manager UI loaded.');

})(window);
