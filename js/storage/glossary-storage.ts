/**
 * @file js/storage/glossary-storage.js
 * @description
 * 術語庫儲存層 - 使用 IndexedDB 和後端資料庫儲存大容量術語庫資料
 * 解決 localStorage 配額限制問題
 */

const GLOSSARY_DB_NAME = 'PaperBurnerGlossaryDB';
const GLOSSARY_DB_VERSION = 1;
const GLOSSARY_SETS_STORE = 'glossary_sets';
const GLOSSARY_ENTRIES_STORE = 'glossary_entries';

// 後端 API 端點
const GLOSSARY_API_BASE = '/api/glossary';

/**
 * 開啟 IndexedDB 資料庫
 */
function openGlossaryDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(GLOSSARY_DB_NAME, GLOSSARY_DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open glossary database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 建立術語庫集合儲存（後設資料）
            if (!db.objectStoreNames.contains(GLOSSARY_SETS_STORE)) {
                const setsStore = db.createObjectStore(GLOSSARY_SETS_STORE, { keyPath: 'id' });
                setsStore.createIndex('enabled', 'enabled', { unique: false });
                setsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // 建立術語條目儲存（資料）
            if (!db.objectStoreNames.contains(GLOSSARY_ENTRIES_STORE)) {
                const entriesStore = db.createObjectStore(GLOSSARY_ENTRIES_STORE, { keyPath: 'id' });
                entriesStore.createIndex('setId', 'setId', { unique: false });
                entriesStore.createIndex('term', 'term', { unique: false });
                entriesStore.createIndex('enabled', 'enabled', { unique: false });
            }

            console.log('Glossary database schema created');
        };
    });
}

/**
 * 檢測是否有後端支援
 */
async function hasBackendSupport() {
    // 前端模式（file:// 協議）不支援後端
    if (window.location.protocol === 'file:') {
        return false;
    }

    // 檢查是否有 storageAdapter 且為前端模式
    if (typeof window.storageAdapter !== 'undefined' && window.storageAdapter.isFrontendMode) {
        return false;
    }

    try {
        const response = await fetch(`${GLOSSARY_API_BASE}/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(1000) // 1秒超時
        });
        return response.ok;
    } catch (err) {
        // 靜默失敗，不列印日誌
        return false;
    }
}

/**
 * 從 IndexedDB 載入所有術語庫集合
 */
async function loadGlossarySetsFromIDB() {
    const db = await openGlossaryDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(GLOSSARY_SETS_STORE, 'readonly');
        const store = transaction.objectStore(GLOSSARY_SETS_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const sets = {};
            (request.result || []).forEach(set => {
                sets[set.id] = set;
            });
            resolve(sets);
        };

        request.onerror = () => {
            console.error('Failed to load glossary sets from IndexedDB:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 儲存術語庫集合到 IndexedDB
 */
async function saveGlossarySetToIDB(set) {
    const db = await openGlossaryDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(GLOSSARY_SETS_STORE, 'readwrite');
        const store = transaction.objectStore(GLOSSARY_SETS_STORE);

        // 新增時間戳
        set.updatedAt = Date.now();

        const request = store.put(set);

        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to save glossary set to IndexedDB:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 從 IndexedDB 刪除術語庫集合
 */
async function deleteGlossarySetFromIDB(setId) {
    const db = await openGlossaryDB();

    // 刪除集合本身
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(GLOSSARY_SETS_STORE, 'readwrite');
        const store = transaction.objectStore(GLOSSARY_SETS_STORE);
        const request = store.delete(setId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });

    // 刪除該集合的所有條目
    await deleteAllEntriesForSetFromIDB(setId);
}

/**
 * 從 IndexedDB 載入指定術語庫的所有條目
 */
async function loadEntriesForSetFromIDB(setId) {
    const db = await openGlossaryDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(GLOSSARY_ENTRIES_STORE, 'readonly');
        const store = transaction.objectStore(GLOSSARY_ENTRIES_STORE);
        const index = store.index('setId');
        const request = index.getAll(setId);

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => {
            console.error('Failed to load entries from IndexedDB:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 批次儲存術語條目到 IndexedDB（最佳化版 - 分塊處理）
 * @param {string} setId - 術語庫 ID
 * @param {Array} entries - 術語條目陣列
 * @param {Function} onProgress - 進度回撥 (current, total) => void
 */
async function saveEntriesToIDB(setId, entries, onProgress) {
    const db = await openGlossaryDB();
    const CHUNK_SIZE = 1000; // 每次批次寫入 1000 條
    const totalEntries = entries.length;

    // 先刪除該集合的所有舊條目
    await deleteAllEntriesForSetFromIDB(setId);

    // 分塊批次插入
    for (let i = 0; i < totalEntries; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, Math.min(i + CHUNK_SIZE, totalEntries));

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(GLOSSARY_ENTRIES_STORE, 'readwrite');
            const store = transaction.objectStore(GLOSSARY_ENTRIES_STORE);

            // 批次插入這一塊
            chunk.forEach(entry => {
                entry.setId = setId;
                store.put(entry);
            });

            transaction.oncomplete = () => {
                // 報告進度
                if (onProgress) {
                    onProgress(Math.min(i + CHUNK_SIZE, totalEntries), totalEntries);
                }
                resolve();
            };

            transaction.onerror = () => {
                console.error('Failed to save entries chunk to IndexedDB:', transaction.error);
                reject(transaction.error);
            };
        });

        // 讓出主執行緒，避免阻塞 UI
        if (i + CHUNK_SIZE < totalEntries) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    console.log(`[GlossaryStorage] Saved ${totalEntries} entries in ${Math.ceil(totalEntries / CHUNK_SIZE)} chunks`);
}

/**
 * 刪除指定術語庫的所有條目
 */
async function deleteAllEntriesForSetFromIDB(setId) {
    const db = await openGlossaryDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(GLOSSARY_ENTRIES_STORE, 'readwrite');
        const store = transaction.objectStore(GLOSSARY_ENTRIES_STORE);
        const index = store.index('setId');
        const request = index.openCursor(IDBKeyRange.only(setId));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                resolve();
            }
        };

        request.onerror = () => {
            console.error('Failed to delete entries from IndexedDB:', request.error);
            reject(request.error);
        };
    });
}

/**
 * 從後端載入所有術語庫集合
 */
async function loadGlossarySetsFromBackend() {
    try {
        const response = await fetch(`${GLOSSARY_API_BASE}/sets`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const data = await response.json();
        return data.sets || {};
    } catch (err) {
        console.error('Failed to load glossary sets from backend:', err);
        throw err;
    }
}

/**
 * 儲存術語庫集合到後端
 */
async function saveGlossarySetToBackend(set, entries) {
    try {
        const response = await fetch(`${GLOSSARY_API_BASE}/sets/${set.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ set, entries })
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error('Failed to save glossary set to backend:', err);
        throw err;
    }
}

/**
 * 從後端刪除術語庫集合
 */
async function deleteGlossarySetFromBackend(setId) {
    try {
        const response = await fetch(`${GLOSSARY_API_BASE}/sets/${setId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error('Failed to delete glossary set from backend:', err);
        throw err;
    }
}

/**
 * 從後端載入指定術語庫的條目
 */
async function loadEntriesForSetFromBackend(setId) {
    try {
        const response = await fetch(`${GLOSSARY_API_BASE}/sets/${setId}/entries`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const data = await response.json();
        return data.entries || [];
    } catch (err) {
        console.error('Failed to load entries from backend:', err);
        throw err;
    }
}

/**
 * 統一介面：載入所有術語庫集合（優先使用後端，降級到 IndexedDB）
 */
async function loadGlossarySetsUnified() {
    const hasBackend = await hasBackendSupport();

    if (hasBackend) {
        try {
            const sets = await loadGlossarySetsFromBackend();
            // 同步到 IndexedDB 作為快取
            for (const setId in sets) {
                await saveGlossarySetToIDB(sets[setId]);
            }
            return sets;
        } catch (err) {
            console.warn('Backend failed, falling back to IndexedDB');
        }
    }

    // 降級使用 IndexedDB
    return await loadGlossarySetsFromIDB();
}

/**
 * 統一介面：儲存術語庫集合（同時儲存到 IndexedDB 和後端）
 * @param {Object} set - 術語庫後設資料
 * @param {Array} entries - 術語條目陣列
 * @param {Function} onProgress - 進度回撥 (current, total) => void
 */
async function saveGlossarySetUnified(set, entries, onProgress) {
    // 先儲存到 IndexedDB（快速響應）
    await saveGlossarySetToIDB(set);
    await saveEntriesToIDB(set.id, entries, onProgress);

    // 非同步同步到後端（如果可用）
    const hasBackend = await hasBackendSupport();
    if (hasBackend) {
        try {
            await saveGlossarySetToBackend(set, entries);
        } catch (err) {
            console.warn('Failed to sync to backend, data saved locally only');
        }
    }
}

/**
 * 統一介面：刪除術語庫集合（同時從 IndexedDB 和後端刪除）
 */
async function deleteGlossarySetUnified(setId) {
    // 從 IndexedDB 刪除
    await deleteGlossarySetFromIDB(setId);

    // 從後端刪除（如果可用）
    const hasBackend = await hasBackendSupport();
    if (hasBackend) {
        try {
            await deleteGlossarySetFromBackend(setId);
        } catch (err) {
            console.warn('Failed to delete from backend, deleted locally only');
        }
    }
}

/**
 * 統一介面：載入指定術語庫的條目
 */
async function loadEntriesForSetUnified(setId) {
    const hasBackend = await hasBackendSupport();

    if (hasBackend) {
        try {
            const entries = await loadEntriesForSetFromBackend(setId);
            // 同步到 IndexedDB 作為快取
            await saveEntriesToIDB(setId, entries);
            return entries;
        } catch (err) {
            console.warn('Backend failed, falling back to IndexedDB');
        }
    }

    // 降級使用 IndexedDB
    return await loadEntriesForSetFromIDB(setId);
}

/**
 * 從 localStorage 遷移資料到 IndexedDB
 */
async function migrateFromLocalStorage() {
    const GLOSSARY_SETS_KEY = 'translationGlossarySets';
    const MIGRATION_FLAG = 'glossaryMigratedToIDB';

    // 檢查是否已遷移
    if (localStorage.getItem(MIGRATION_FLAG)) {
        console.log('Glossary data already migrated');
        return { success: true, alreadyMigrated: true };
    }

    try {
        const rawData = localStorage.getItem(GLOSSARY_SETS_KEY);
        if (!rawData) {
            console.log('No glossary data to migrate');
            localStorage.setItem(MIGRATION_FLAG, 'true');
            return { success: true, noData: true };
        }

        const sets = JSON.parse(rawData);
        const setIds = Object.keys(sets);

        if (setIds.length === 0) {
            console.log('No glossary sets to migrate');
            localStorage.setItem(MIGRATION_FLAG, 'true');
            return { success: true, noData: true };
        }

        console.log(`Migrating ${setIds.length} glossary sets to IndexedDB...`);

        let migratedCount = 0;
        let totalEntries = 0;

        for (const setId of setIds) {
            const set = sets[setId];
            const entries = Array.isArray(set.entries) ? set.entries : [];

            // 儲存集合後設資料（不包含 entries）
            const setMeta = { ...set };
            delete setMeta.entries;

            await saveGlossarySetToIDB(setMeta);

            // 儲存條目
            if (entries.length > 0) {
                await saveEntriesToIDB(setId, entries);
                totalEntries += entries.length;
            }

            migratedCount++;
        }

        console.log(`Migration completed: ${migratedCount} sets, ${totalEntries} entries`);

        // 標記為已遷移
        localStorage.setItem(MIGRATION_FLAG, 'true');

        // 清理 localStorage（可選）
        try {
            localStorage.removeItem(GLOSSARY_SETS_KEY);
            console.log('Cleaned up localStorage glossary data');
        } catch (err) {
            console.warn('Failed to cleanup localStorage, but migration succeeded');
        }

        return {
            success: true,
            migratedSets: migratedCount,
            migratedEntries: totalEntries
        };
    } catch (err) {
        console.error('Failed to migrate glossary data:', err);
        return { success: false, error: err.message };
    }
}

// 暴露到全域作用域
if (typeof window !== 'undefined') {
    window.glossaryStorage = {
        loadGlossarySetsUnified,
        saveGlossarySetUnified,
        deleteGlossarySetUnified,
        loadEntriesForSetUnified,
        migrateFromLocalStorage,
        hasBackendSupport
    };

    // 自動初始化：遷移資料並載入到快取
    (async function initGlossaryStorage() {
        try {
            console.log('[GlossaryStorage] Initializing...');

            // 1. 執行遷移（如果需要）
            const migrationResult = await migrateFromLocalStorage();
            if (migrationResult.success && migrationResult.migratedSets > 0) {
                console.log(`[GlossaryStorage] Migrated ${migrationResult.migratedSets} sets with ${migrationResult.migratedEntries} entries`);
            }

            // 2. 載入資料到快取
            const sets = await loadGlossarySetsUnified();

            // 3. 載入每個術語庫的條目到記憶體
            for (const setId in sets) {
                const entries = await loadEntriesForSetUnified(setId);
                sets[setId].entries = entries;
            }

            // 4. 更新快取
            window._glossarySetsCache = sets;

            console.log(`[GlossaryStorage] Initialized with ${Object.keys(sets).length} glossary sets`);

            // 5. 觸發載入完成事件
            window.dispatchEvent(new CustomEvent('glossarySetsLoaded', { detail: sets }));
        } catch (err) {
            console.error('[GlossaryStorage] Initialization failed:', err);
        }
    })();

    console.log('[GlossaryStorage] Module loaded and exposed to window.glossaryStorage');
}
