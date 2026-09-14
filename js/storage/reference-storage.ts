// js/storage/reference-storage.js
// 參考文獻儲存管理器 - 支援前端 localStorage 和後端 API 雙模式

(function(global) {
    'use strict';

    const STORAGE_KEY_PREFIX = 'pbx_references_';
    const STORAGE_KEY_INDEX = 'pbx_reference_index';

    /**
     * 判斷是否為後端模式
     */
    function isBackendMode() {
        return window.storageAdapter && window.storageAdapter.isFrontendMode === false;
    }

    /**
     * 參考文獻儲存類
     */
    class ReferenceStorage {
        constructor() {
            this.cache = new Map();
            this.loadIndex();
        }

        /**
         * 載入索引（僅前端模式）
         */
        loadIndex() {
            if (isBackendMode()) {
                this.documentIds = [];
                this.metadata = {};
                return;
            }

            try {
                const indexData = localStorage.getItem(STORAGE_KEY_INDEX);
                if (indexData) {
                    const index = JSON.parse(indexData);
                    this.documentIds = index.documentIds || [];
                    this.metadata = index.metadata || {};
                } else {
                    this.documentIds = [];
                    this.metadata = {};
                }
            } catch (error) {
                console.error('[ReferenceStorage] Failed to load index:', error);
                this.documentIds = [];
                this.metadata = {};
            }
        }

        /**
         * 儲存索引（僅前端模式）
         */
        saveIndex() {
            if (isBackendMode()) return;

            try {
                const index = {
                    documentIds: this.documentIds,
                    metadata: this.metadata,
                    lastUpdated: new Date().toISOString()
                };
                localStorage.setItem(STORAGE_KEY_INDEX, JSON.stringify(index));
            } catch (error) {
                console.error('[ReferenceStorage] Failed to save index:', error);
            }
        }

        /**
         * 儲存文件的參考文獻
         */
        async saveReferences(documentId, references, metadata = {}) {
            try {
                const data = {
                    documentId: documentId,
                    references: references,
                    metadata: {
                        ...metadata,
                        totalCount: references.length,
                        savedAt: new Date().toISOString()
                    }
                };

                if (isBackendMode()) {
                    // 後端模式：批次儲存參考
                    // 先清空舊的，再批次新增
                    const existing = await window.storageAdapter.loadReferences(documentId);
                    // TODO: 可最佳化為差異同步
                    for (const ref of references) {
                        await window.storageAdapter.saveReference(documentId, {
                            citationKey: ref.citationKey || `[${ref.index + 1}]`,
                            doi: ref.doi,
                            title: ref.title,
                            authors: ref.authors,
                            year: ref.year,
                            journal: ref.journal,
                            volume: ref.volume,
                            pages: ref.pages,
                            url: ref.url,
                            metadata: ref
                        });
                    }
                } else {
                    // 前端模式：localStorage
                    const key = STORAGE_KEY_PREFIX + documentId;
                    localStorage.setItem(key, JSON.stringify(data));

                    // 更新索引
                    if (!this.documentIds.includes(documentId)) {
                        this.documentIds.push(documentId);
                    }
                    this.metadata[documentId] = data.metadata;
                    this.saveIndex();
                }

                // 更新快取
                this.cache.set(documentId, data);

                console.log(`[ReferenceStorage] Saved ${references.length} references for document ${documentId}`);
                return true;
            } catch (error) {
                console.error('[ReferenceStorage] Failed to save references:', error);
                return false;
            }
        }

        /**
         * 載入文件的參考文獻
         */
        async loadReferences(documentId) {
            // 先檢查快取
            if (this.cache.has(documentId)) {
                return this.cache.get(documentId);
            }

            try {
                if (isBackendMode()) {
                    // 後端模式：從 API 載入
                    const backendRefs = await window.storageAdapter.loadReferences(documentId);
                    const data = {
                        documentId: documentId,
                        references: backendRefs.map((ref, idx) => ({
                            index: idx,
                            citationKey: ref.citationKey,
                            doi: ref.doi,
                            title: ref.title,
                            authors: ref.authors,
                            year: ref.year,
                            journal: ref.journal,
                            volume: ref.volume,
                            pages: ref.pages,
                            url: ref.url,
                            ...(ref.metadata || {})
                        })),
                        metadata: {
                            totalCount: backendRefs.length
                        }
                    };
                    this.cache.set(documentId, data);
                    return data;
                } else {
                    // 前端模式：localStorage
                    const key = STORAGE_KEY_PREFIX + documentId;
                    const storedData = localStorage.getItem(key);
                    if (storedData) {
                        const parsed = JSON.parse(storedData);
                        this.cache.set(documentId, parsed);
                        return parsed;
                    }
                }
                return null;
            } catch (error) {
                console.error('[ReferenceStorage] Failed to load references:', error);
                return null;
            }
        }

        /**
         * 刪除文件的參考文獻
         */
        async deleteReferences(documentId) {
            try {
                if (isBackendMode()) {
                    // 後端模式：呼叫 API 刪除
                    const refs = await window.storageAdapter.loadReferences(documentId);
                    for (const ref of refs) {
                        await window.storageAdapter.deleteReference(documentId, ref.id);
                    }
                } else {
                    // 前端模式：localStorage
                    const key = STORAGE_KEY_PREFIX + documentId;
                    localStorage.removeItem(key);

                    // 更新索引
                    this.documentIds = this.documentIds.filter(id => id !== documentId);
                    delete this.metadata[documentId];
                    this.saveIndex();
                }

                // 清除快取
                this.cache.delete(documentId);

                console.log(`[ReferenceStorage] Deleted references for document ${documentId}`);
                return true;
            } catch (error) {
                console.error('[ReferenceStorage] Failed to delete references:', error);
                return false;
            }
        }

        /**
         * 更新單個文獻
         */
        async updateReference(documentId, referenceIndex, updates) {
            const data = await this.loadReferences(documentId);
            if (!data || !data.references[referenceIndex]) {
                console.error('[ReferenceStorage] Reference not found');
                return false;
            }

            data.references[referenceIndex] = {
                ...data.references[referenceIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };

            return await this.saveReferences(documentId, data.references, data.metadata);
        }

        /**
         * 新增新文獻
         */
        async addReference(documentId, reference) {
            let data = await this.loadReferences(documentId);
            if (!data) {
                data = {
                    documentId: documentId,
                    references: [],
                    metadata: {}
                };
            }

            reference.index = data.references.length;
            reference.addedAt = new Date().toISOString();
            data.references.push(reference);

            return await this.saveReferences(documentId, data.references, data.metadata);
        }

        /**
         * 刪除單個文獻
         */
        async removeReference(documentId, referenceIndex) {
            const data = await this.loadReferences(documentId);
            if (!data) {
                return false;
            }

            data.references.splice(referenceIndex, 1);

            // 重新索引
            data.references.forEach((ref, idx) => {
                ref.index = idx;
            });

            return await this.saveReferences(documentId, data.references, data.metadata);
        }

        /**
         * 搜尋文獻
         */
        async searchReferences(documentId, query) {
            const data = await this.loadReferences(documentId);
            if (!data) {
                return [];
            }

            const lowerQuery = query.toLowerCase();
            return data.references.filter(ref => {
                const searchText = [
                    ref.title,
                    ...(ref.authors || []),
                    ref.journal,
                    ref.doi,
                    ref.rawText
                ].filter(Boolean).join(' ').toLowerCase();

                return searchText.includes(lowerQuery);
            });
        }

        /**
         * 按標籤篩選文獻
         */
        async filterByTag(documentId, tag) {
            const data = await this.loadReferences(documentId);
            if (!data) {
                return [];
            }

            return data.references.filter(ref =>
                ref.tags && ref.tags.includes(tag)
            );
        }

        /**
         * 獲取所有文件列表
         */
        getAllDocuments() {
            return this.documentIds.map(id => ({
                documentId: id,
                ...this.metadata[id]
            }));
        }

        /**
         * 匯出文獻資料（BibTeX格式）
         */
        async exportToBibTeX(documentId) {
            const data = await this.loadReferences(documentId);
            if (!data) {
                return '';
            }

            const bibtex = data.references.map((ref, idx) => {
                const key = `ref${idx + 1}`;
                const type = ref.type || 'article';
                const fields = [];

                if (ref.authors && ref.authors.length > 0) {
                    fields.push(`  author = {${ref.authors.join(' and ')}}`);
                }
                if (ref.title) {
                    fields.push(`  title = {${ref.title}}`);
                }
                if (ref.journal) {
                    fields.push(`  journal = {${ref.journal}}`);
                }
                if (ref.year) {
                    fields.push(`  year = {${ref.year}}`);
                }
                if (ref.volume) {
                    fields.push(`  volume = {${ref.volume}}`);
                }
                if (ref.issue) {
                    fields.push(`  number = {${ref.issue}}`);
                }
                if (ref.pages) {
                    fields.push(`  pages = {${ref.pages}}`);
                }
                if (ref.doi) {
                    fields.push(`  doi = {${ref.doi}}`);
                }
                if (ref.url) {
                    fields.push(`  url = {${ref.url}}`);
                }

                return `@${type}{${key},\n${fields.join(',\n')}\n}`;
            });

            return bibtex.join('\n\n');
        }

        /**
         * 匯出文獻資料（JSON格式）
         */
        async exportToJSON(documentId) {
            const data = await this.loadReferences(documentId);
            if (!data) {
                return '[]';
            }

            return JSON.stringify(data.references, null, 2);
        }

        /**
         * 清空快取
         */
        clearCache() {
            this.cache.clear();
        }

        /**
         * 獲取統計資訊
         */
        async getStatistics(documentId) {
            const data = await this.loadReferences(documentId);
            if (!data) {
                return null;
            }

            const stats = {
                total: data.references.length,
                withDOI: 0,
                byType: {},
                byYear: {},
                byTag: {},
                avgConfidence: 0
            };

            let totalConfidence = 0;

            data.references.forEach(ref => {
                // DOI統計
                if (ref.doi) stats.withDOI++;

                // 型別統計
                const type = ref.type || 'unknown';
                stats.byType[type] = (stats.byType[type] || 0) + 1;

                // 年份統計
                if (ref.year) {
                    stats.byYear[ref.year] = (stats.byYear[ref.year] || 0) + 1;
                }

                // 標籤統計
                if (ref.tags) {
                    ref.tags.forEach(tag => {
                        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
                    });
                }

                // 置信度統計
                if (ref.confidence !== undefined) {
                    totalConfidence += ref.confidence;
                }
            });

            stats.avgConfidence = stats.total > 0 ? totalConfidence / stats.total : 0;

            return stats;
        }
    }

    // 建立全域例項
    const storage = new ReferenceStorage();

    // 匯出API
    global.ReferenceStorage = storage;

    console.log('[ReferenceStorage] Reference storage loaded (supports frontend & backend modes).');

})(window);



