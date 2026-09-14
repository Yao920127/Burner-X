// process/main.js

/**
 * 處理單個 PDF 檔案或 Markdown/TXT 檔案的核心函式。
 * 該函式封裝了從檔案上傳、OCR（如果需要）、內容提取、分段翻譯（如果需要）、
 * 錯誤處理到結果儲存的完整流程。
 *
 * 主要流程：
 * 1. **初始化與日誌**：
 *    - 記錄檔案處理開始的日誌，包括檔名、型別和使用的 API Key 資訊（部分遮蔽）。
 * 2. **檔案型別判斷與內容提取**：
 *    - **PDF 檔案**：
 *      - 檢查 Mistral API Key 是否提供，未提供則丟擲錯誤。
 *      - 呼叫 `uploadToMistral` 上傳檔案。
 *      - 呼叫 `getMistralSignedUrl` 獲取簽名 URL。
 *      - 呼叫 `callMistralOcr` 進行 OCR 處理。
 *      - 呼叫 `processOcrResults` (如果可用) 處理 OCR 結果，提取 Markdown 內容和圖片資料。
 *      - 捕獲 OCR 過程中的錯誤，特別是 API Key 失效的錯誤 (如401)，如果發生則返回特定錯誤物件，以便上層進行 Key 失效處理。
 *    - **MD/TXT 檔案**：
 *      - 直接讀取檔案文字內容作為 Markdown 內容。
 *    - **DOCX 檔案**：
 *      - 使用 `mammoth` 將文件轉換為 HTML，再轉為 Markdown。
 *    - **HTML 檔案**：
 *      - 直接解析 HTML 並轉為 Markdown。
 *    - **PPTX 檔案**：
 *      - 解析各幻燈片 XML，提取文字內容並拼接。
 *    - **EPUB 檔案**：
 *      - 解析 OPF 清單與 spine，依次抽取章節 HTML 轉為 Markdown。
 *    - **不支援的檔案型別**：丟擲錯誤。
 * 3. **翻譯流程** (如果 `selectedTranslationModelName` 不是 'none')：
 *    - 檢查翻譯 API Key 是否提供，未提供則記錄警告，翻譯內容標記為未翻譯。
 *    - **估算 Token 數與分段判斷**：
 *      - 使用 `estimateTokenCount` (如果可用) 估算 Markdown 內容的 token 數。
 *      - 如果 token 數超過 `tokenLimit * 1.1`，則判斷為長文件，呼叫 `translateLongDocument` (如果可用) 進行分段翻譯。
 *        `translateLongDocument` 內部會處理表格保護、並行控制、自定義模型配置和重試邏輯。
 *      - 否則，判斷為短文件，直接呼叫 `translateMarkdown` (如果可用) 進行單塊翻譯。
 *        在呼叫 `translateMarkdown` 前後透過 `acquireSlot` 和 `releaseSlot` 控制並行。
 *    - **錯誤處理**：
 *      - 捕獲翻譯過程中的錯誤，特別是 API Key 失效的錯誤。如果發生，返回特定錯誤物件以便上層處理。
 *      - 其他翻譯錯誤，則將翻譯內容標記為失敗，但保留 OCR 結果（如果成功）。
 * 4. **結果儲存**：
 *    - 呼叫 `saveResultToDB` (如果可用) 將處理結果（包括原文、譯文、圖片、分塊資訊）儲存到 IndexedDB。
 * 5. **成功回撥**：
 *    - 呼叫 `onFileSuccess` 回撥函式，通知上層該檔案處理成功。
 * 6. **返回結果物件**：
 *    - 返回一個包含處理結果的物件，包括 `file`, `markdown`, `translation`, `images`, `ocrChunks`, `translatedChunks` 和 `error` (成功時為 `null`)。
 *    - 如果發生可識別的 Key 失效，`keyInvalid` 欄位會被設定。
 * 7. **異常捕獲 (Final Catch)**：
 *    - 捕獲整個流程中未被特定邏輯捕獲的嚴重錯誤，記錄日誌，並返回包含錯誤資訊的物件。
 * 8. **資源清理 (Finally Block)**：
 *    - 如果是 PDF 檔案且成功上傳到 Mistral，則呼叫 `deleteMistralFile` 清理在 Mistral 伺服器上的臨時檔案。
 *    - 捕獲並記錄清理過程中的潛在錯誤。
 *
 * @param {File} fileToProcess - 待處理的 PDF、Markdown 或 TXT 檔案物件。
 * @param {Object | null} mistralKeyObject - Mistral API Key 物件，包含 `id` 和 `value`，或為 `null`。
 * @param {Object | null} translationKeyObject - 選定翻譯模型對應的 API Key 物件，包含 `id` 和 `value`，或為 `null`。
 * @param {string} selectedTranslationModelName - 選定的翻譯模型名稱 (如 'deepseek', 'custom', 'none')。
 * @param {Object | null} translationModelConfig - 當 `selectedTranslationModelName` 為 'custom' 時，提供自定義模型的配置物件。
 * @param {number} maxTokensPerChunkValue - (用於長文件翻譯) 每個翻譯分塊的最大 token 限制。
 * @param {string} targetLanguageValue - 目標翻譯語言程式碼 (如 'zh-TW', 'en')。
 * @param {function} acquireSlot - 用於獲取並行執行槽位的函式。
 * @param {function} releaseSlot - 用於釋放並行執行槽位的函式。
 * @param {string} defaultSystemPromptSetting - 翻譯時使用的預設系統提示詞。
 * @param {string} defaultUserPromptTemplateSetting - 翻譯時使用的預設使用者提示詞模板。
 * @param {boolean} useCustomPromptsSetting - 是否使用使用者自定義的提示詞。
 * @param {function} onFileSuccess - 單個檔案處理成功後的回撥函式，引數為成功處理的 `File` 物件。
 * @returns {Promise<Object>} 一個包含處理結果的物件。成功時結構如：
 *   `{ file, markdown, translation, images, ocrChunks, translatedChunks, error: null }`。
 *   失敗或 Key 失效時，`error` 欄位會有錯誤資訊，`keyInvalid` 欄位可能被設定。
 */
function convertHtmlToMarkdown(htmlText) {
    const html = String(htmlText || '');
    if (typeof TurndownService === 'function') {
        try {
            const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            return turndown.turndown(html);
        } catch (err) {
            console.warn('[convertHtmlToMarkdown] turndown 轉換失敗，回退為純文字', err);
        }
    }
    return html
        .replace(/\r?\n/g, '\n')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n');
}

function arrayBufferToBase64(buffer) {
    if (!buffer) return null;
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || []);
    if (!bytes.length) return null;
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

async function processSinglePdf(
    fileToProcess,
    mistralKeyObject,
    translationKeyObject,
    selectedTranslationModelName,
    translationModelConfig,
    maxTokensPerChunkValue,
    targetLanguageValue,
    acquireSlot,
   releaseSlot,
   defaultSystemPromptSetting,
   defaultUserPromptTemplateSetting,
   useCustomPromptsSetting, // 新增引數
    batchContext,
    onFileSuccess
) {
    let currentMarkdownContent = '';
    let currentTranslationContent = '';
    let currentImagesData = [];
    let mistralFileId = null; // 重新命名 fileId to mistralFileId for clarity
const logPrefix = `[${fileToProcess.name}]`;
const fileType = fileToProcess.name.split('.').pop().toLowerCase();
    const relativePath = fileToProcess.pbxRelativePath || fileToProcess.webkitRelativePath || fileToProcess.relativePath || fileToProcess.fullPath || fileToProcess.name;
    const sourceArchive = fileToProcess.sourceArchive || null;
    let ocrChunks = [];
    let translatedChunks = [];
    let originalContent = null;
    let originalBinary = null;
    let originalEncoding = null;
    let originalExtension = fileType || '';
    let ocrResult = null; // 儲存 OCR 結果以便後續判斷是否使用結構化翻譯
    // 移除舊的內部重試和key切換邏輯，這些將由 app.js 處理

    console.log('processSinglePdf: translationKeyObject', translationKeyObject);

    try {
        let usedOcrEngine = null;
        let usedOcrSource = null;
        // 更合理的開始日誌：顯示 OCR 引擎而不是固定顯示 Mistral Key
        let ocrEngineForLog = 'mistral';
        try {
            if (typeof window !== 'undefined' && window.ocrSettingsManager && typeof window.ocrSettingsManager.getCurrentConfig === 'function') {
                const cfg = window.ocrSettingsManager.getCurrentConfig();
                if (cfg && cfg.engine) ocrEngineForLog = cfg.engine;
            } else {
                ocrEngineForLog = localStorage.getItem('ocrEngine') || 'mistral';
            }
        } catch {}
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logPrefix} 開始處理 (型別: ${fileType}, OCR 引擎: ${ocrEngineForLog})`);
        }

        // 檢查：如果選擇了"不需要 OCR"但檔案是 PDF，報錯
        if (ocrEngineForLog === 'none' && fileType === 'pdf') {
            throw new Error('處理 PDF 檔案需要選擇 OCR 引擎，當前選擇了"不需要 OCR"。請在設定中選擇 Mistral OCR、MinerU 或 Doc2X。');
        }

        if (fileType === 'pdf') {
            // 使用 OCR Manager 進行多引擎 OCR 處理
            try {
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 開始 OCR 處理...`);

                // 建立 OcrManager 例項
                if (typeof OcrManager === 'undefined') {
                    throw new Error('OcrManager 未載入，無法處理 PDF');
                }

                const ocrManager = new OcrManager();

                // 建立進度回撥包裝器
                const onProgress = (current, total, message) => {
                    if (typeof addProgressLog === "function") {
                        addProgressLog(`${logPrefix} ${message}`);
                    }
                };

                // 呼叫 OCR Manager 處理檔案
                ocrResult = await ocrManager.processFile(fileToProcess, onProgress);

                // 提取結果
                currentMarkdownContent = ocrResult.markdown;
                currentImagesData = ocrResult.images;
                usedOcrEngine = ocrResult && ocrResult.metadata && ocrResult.metadata.engine ? ocrResult.metadata.engine : null;
                usedOcrSource = ocrResult && ocrResult.metadata && ocrResult.metadata.source ? ocrResult.metadata.source : null;

                if (typeof addProgressLog === "function") {
                    addProgressLog(`${logPrefix} OCR 完成 (引擎: ${ocrResult.metadata.engine})`);
                }

            } catch (error) {
                // 判斷是否為 API Key 失效錯誤（相容 Mistral 舊邏輯）
                if (error.message && (
                    error.message.includes('無效') ||
                    error.message.includes('未授權') ||
                    error.message.includes('401') ||
                    error.message.toLowerCase().includes('invalid api key') ||
                    error.message.toLowerCase().includes('unauthorized') ||
                    error.message.includes('可能已失效')
                )) {
                    // 如果是 Mistral 引擎且有 Key 物件，返回 Key 失效資訊
                    if (mistralKeyObject && error.message.includes('Mistral')) {
                        if (typeof addProgressLog === "function") {
                            const mistralKeyValue = mistralKeyObject.value;
                            addProgressLog(`${logPrefix} Mistral API Key (...${mistralKeyValue.slice(-4)}) 可能已失效: ${error.message}`);
                        }
                        return {
                            file: fileToProcess,
                            keyInvalid: {
                                type: 'mistral',
                                keyIdToInvalidate: mistralKeyObject.id
                            },
                            error: `Mistral Key 失效: ${error.message}`
                        };
                    }
                }
                throw error; // 其他型別的OCR錯誤，向上丟擲由 app.js 的常規重試處理
            }
        } else if (fileType === 'md' || fileType === 'txt' || fileType === 'yaml' || fileType === 'yml' || fileType === 'json' || fileType === 'csv' || fileType === 'ini' || fileType === 'cfg' || fileType === 'log' || fileType === 'tex') {
            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 讀取 ${fileType.toUpperCase()} 檔案內容...`);
            try {
                originalContent = await fileToProcess.text();
                originalEncoding = 'text';
                currentMarkdownContent = originalContent;
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} ${fileType.toUpperCase()} 檔案內容讀取完成`);
                // 嘗試從歷史記錄參考中攜帶圖片：
                // 約定：如果 Markdown 以註釋行 "<!-- PBX-HISTORY-REF:<id> -->" 開頭，則從 IndexedDB 中取出該記錄的 images。
                try {
                    const refMatch = currentMarkdownContent.match(/^<!--\s*PBX-HISTORY-REF:([^>]+)\s*-->\s*/m);
                    const isRetryFailed = /<!--\s*PBX-MODE:retry-failed\s*-->/.test(currentMarkdownContent);
                    const isRetryStructuredFailed = /<!--\s*PBX-MODE:retry-structured-failed\s*-->/.test(currentMarkdownContent);
                    if (refMatch && typeof getResultFromDB === 'function') {
                        const refId = refMatch[1].trim();
                        const refRecord = await getResultFromDB(refId);
                        if (refRecord && Array.isArray(refRecord.images)) {
                            currentImagesData = refRecord.images;
                            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 關聯到歷史記錄 ${refId}，已載入 ${currentImagesData.length} 張圖片`);
                        } else {
                            currentImagesData = [];
                        }

                        // ============ 特殊模式：結構化翻譯失敗片段重試，直接寫回原歷史 ============
                        if (isRetryStructuredFailed) {
                            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 檢測到結構化翻譯失敗片段重試模式`);

                            // 解析失敗片段索引
                            const failedIndicesMatch = currentMarkdownContent.match(/<!--\s*PBX-FAILED-INDICES:([^>]+)\s*-->/);
                            if (!failedIndicesMatch) {
                                throw new Error('未找到失敗片段索引標記。');
                            }
                            const failedIndices = failedIndicesMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

                            if (failedIndices.length === 0) {
                                throw new Error('未找到可重試的失敗片段索引。');
                            }

                            if (!refRecord || !refRecord.metadata) {
                                throw new Error('未找到原歷史記錄或缺少後設資料。');
                            }

                            const meta = refRecord.metadata;
                            if (!meta.contentListJson || !Array.isArray(meta.translatedContentList)) {
                                throw new Error('缺少結構化翻譯資料，無法重試。');
                            }

                            if (typeof window.MinerUStructuredTranslation !== 'function') {
                                throw new Error('缺少結構化翻譯模組。');
                            }

                            if (typeof addProgressLog === "function") {
                                addProgressLog(`${logPrefix} 準備重試 ${failedIndices.length} 個失敗片段...`);
                            }

                            // 組裝待翻譯子集
                            const translator = new window.MinerUStructuredTranslation();
                            const fullTranslatable = translator.extractTranslatableContent(meta.contentListJson);
                            const subset = [];
                            const indexMap = [];

                            failedIndices.forEach(idx => {
                                if (idx >= 0 && idx < fullTranslatable.length) {
                                    subset.push(fullTranslatable[idx]);
                                    indexMap.push(idx);
                                }
                            });

                            if (subset.length === 0) {
                                throw new Error('沒有有效的失敗片段可重試。');
                            }

                            // 分批並翻譯
                            const batches = translator.splitIntoBatches(subset);
                            const targetLang = targetLanguageValue;
                            const modelName = selectedTranslationModelName;
                            const apiKeyVal = translationKeyObject ? translationKeyObject.value : null;

                            if (!apiKeyVal) {
                                throw new Error('缺少翻譯 API Key，無法執行失敗片段重試。');
                            }

                            let translationOptions = {};
                            if (modelName === 'custom') {
                                translationOptions.modelConfig = translationModelConfig;
                            }

                            const translatedSubset = await translator.translateBatches(
                                batches,
                                targetLang,
                                modelName,
                                apiKeyVal,
                                translationOptions,
                                (progress) => {
                                    if (typeof addProgressLog === 'function') {
                                        addProgressLog(`${logPrefix} 翻譯進度: ${progress.percentage}% (${progress.message})`);
                                    }
                                },
                                acquireSlot,
                                releaseSlot
                            );

                            // 寫回對應索引
                            const tlist = meta.translatedContentList.slice();
                            translatedSubset.forEach((item, i) => {
                                const origIdx = indexMap[i];
                                tlist[origIdx] = item;
                            });

                            // 重新計算失敗項
                            const newFailed = [];
                            const _norm = (v) => {
                                if (v == null) return '';
                                try {
                                    if (Array.isArray(v)) return v.join(' ').trim();
                                    if (typeof v === 'string') return v.trim();
                                    return String(v).trim();
                                } catch(_) { return ''; }
                            };

                            for (let i = 0; i < tlist.length; i++) {
                                const o = meta.contentListJson[i] || {};
                                const t = tlist[i] || {};
                                let failed = !!t.failed;
                                if (!failed) {
                                    // 只有譯文為空時才標記為失敗（譯文與原文相同是正常行為）
                                    if (o.type === 'text') {
                                        const a = _norm(o.text);
                                        const b = _norm(t.text);
                                        failed = a && !b;  // 移除 a === b 判斷
                                    } else if (o.type === 'image') {
                                        const a = _norm(o.image_caption);
                                        const b = _norm(t.image_caption);
                                        failed = a && !b;  // 移除 a === b 判斷
                                    } else if (o.type === 'table') {
                                        const a = _norm(o.table_caption);
                                        const b = _norm(t.table_caption);
                                        failed = a && !b;  // 移除 a === b 判斷
                                    }
                                }
                                if (failed) {
                                    const baseText = (o.type === 'text') ? (o.text || '')
                                                    : (o.type === 'image') ? (Array.isArray(o.image_caption) ? o.image_caption.join(' ') : o.image_caption)
                                                    : (o.type === 'table') ? (o.table_caption || '')
                                                    : '';
                                    const norm = _norm(baseText);
                                    if (norm) newFailed.push({ index: i, type: o.type, page_idx: o.page_idx || 0, text: norm });
                                }
                            }

                            // 更新並儲存記錄
                            refRecord.metadata.translatedContentList = tlist;
                            refRecord.metadata.failedStructuredItems = newFailed;
                            refRecord.metadata.structuredFailedCount = newFailed.length;
                            refRecord.time = new Date().toISOString();
                            await saveResultToDB(refRecord);

                            if (typeof addProgressLog === "function") {
                                addProgressLog(`${logPrefix} 已將 ${translatedSubset.length} 個片段寫回歷史記錄 ${refId}，剩餘失敗 ${newFailed.length} 個`);
                            }

                            // 準備返回物件並跳過後續的常規儲存邏輯
                            return {
                                file: fileToProcess,
                                markdown: refRecord.ocr || '',
                                translation: '',
                                images: refRecord.images || [],
                                ocrChunks: refRecord.ocrChunks || [],
                                translatedChunks: refRecord.translatedChunks || [],
                                metadata: refRecord.metadata,
                                error: null,
                                isRetryStructuredFailed: true,
                                refId: refId
                            };
                        }

                        // ============ 特殊模式：標準分塊失敗片段重試，直接寫回原歷史 ============
                        if (isRetryFailed) {
                            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 檢測到失敗片段重試模式，準備逐段翻譯並寫回歷史記錄 ${refId}`);

                            // 按 PBX-CHUNK-INDEX 解析出各段內容
                            const re = /<!--\s*PBX-CHUNK-INDEX:(\d+)\s*-->\s*([\s\S]*?)(?=(?:<!--\s*PBX-CHUNK-INDEX:\d+\s*-->)|$)/g;
                            const retryList = [];
                            let m;
                            while ((m = re.exec(currentMarkdownContent)) !== null) {
                                const idx = parseInt(m[1], 10);
                                const text = (m[2] || '').trim();
                                if (!isNaN(idx) && text) retryList.push({ index: idx, text });
                            }

                            if (retryList.length === 0) {
                                throw new Error('未找到可重試的失敗片段。');
                            }

                            // 獲取翻譯模型與引數
                            const targetLanguageValue = targetLanguage; // 來自引數
                            const modelName = selectedTranslationModelName;
                            const apiKeyVal = translationKeyObject ? translationKeyObject.value : null;
                            if (!apiKeyVal) throw new Error('缺少翻譯API Key，無法執行失敗片段重試。');

                            // 依次翻譯每段（受並行槽控制）
                            const translatedPieces = [];
                            for (let i = 0; i < retryList.length; i++) {
                                const item = retryList[i];
                                if (typeof acquireSlot === 'function') await acquireSlot();
                                try {
                                    let out;
                                    if (modelName === 'custom') {
                                        out = await translateMarkdown(
                                            item.text,
                                            targetLanguageValue,
                                            'custom',
                                            apiKeyVal,
                                            translationModelConfig,
                                            `${logPrefix}[retry ${i+1}/${retryList.length}]`,
                                            defaultSystemPromptSetting,
                                            defaultUserPromptTemplateSetting,
                                            useCustomPromptsSetting
                                        );
                                    } else {
                                        out = await translateMarkdown(
                                            item.text,
                                            targetLanguageValue,
                                            modelName,
                                            apiKeyVal,
                                            `${logPrefix}[retry ${i+1}/${retryList.length}]`,
                                            defaultSystemPromptSetting,
                                            defaultUserPromptTemplateSetting,
                                            useCustomPromptsSetting
                                        );
                                    }
                                    translatedPieces.push({ index: item.index, text: out });
                                } finally {
                                    if (typeof releaseSlot === 'function') releaseSlot();
                                }
                            }

                            // 寫回原歷史記錄：替換對應分塊譯文
                            if (!refRecord) throw new Error('未找到原歷史記錄，無法寫回。');
                            if (!Array.isArray(refRecord.ocrChunks) || !Array.isArray(refRecord.translatedChunks)) {
                                throw new Error('原歷史記錄缺少分塊資訊，無法寫回。');
                            }
                            translatedPieces.forEach(p => {
                                const safeIdx = Math.max(0, Math.min(p.index, refRecord.ocrChunks.length - 1));
                                refRecord.translatedChunks[safeIdx] = p.text;
                            });
                            refRecord.translation = (refRecord.translatedChunks || []).join('\n\n');
                            refRecord.time = new Date().toISOString();
                            await saveResultToDB(refRecord);
                            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 已將 ${translatedPieces.length} 個失敗片段寫回歷史記錄 ${refId}`);

                            // 準備返回物件並跳過後續的常規儲存邏輯
                            return {
                                file: fileToProcess,
                                markdown: currentMarkdownContent,
                                translation: translatedPieces.map(p => p.text).join('\n\n'),
                                images: currentImagesData,
                                ocrChunks: retryList.map(r => r.text),
                                translatedChunks: translatedPieces.map(p => p.text),
                                error: null
                            };
                        }
                    } else {
                        currentImagesData = [];
                    }
                } catch (e) {
                    console.warn(`${logPrefix} 讀取歷史圖片參考失敗:`, e);
                    currentImagesData = [];
                }
            } catch (readError) {
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 讀取 ${fileType.toUpperCase()} 檔案失敗: ${readError.message}`);
                throw new Error(`讀取 ${fileType.toUpperCase()} 檔案失敗: ${readError.message}`);
            }
        } else if (fileType === 'docx') {
            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 解析 DOCX 文件...`);
            if (typeof mammoth === 'undefined' || !mammoth || typeof mammoth.convertToHtml !== 'function') {
                throw new Error('缺少 mammoth 庫，無法解析 DOCX');
            }
            try {
                const arrayBuffer = await fileToProcess.arrayBuffer();
                originalBinary = arrayBuffer;
                originalEncoding = 'arraybuffer';

                // 用於儲存提取的圖片資料
                const docxImages = [];
                let imageCounter = 0;

                // 配置 mammoth，提取圖片資料並使用簡潔的參考
                // 這樣可以避免巨大的 base64 字串導致 token 估算錯誤（每張圖片可能幾十萬字元）
                const result = await mammoth.convertToHtml({
                    arrayBuffer,
                    convertImage: mammoth.images.imgElement(function(image) {
                        return image.read("base64").then(function(imageBuffer) {
                            // 生成圖片 ID
                            imageCounter++;
                            const imgId = `docx_img_${imageCounter}`;
                            const imgPath = `images/${imgId}.png`;

                            // 儲存圖片資料（格式與 OCR 保持一致）
                            docxImages.push({
                                id: imgId,
                                data: imageBuffer  // base64 字串
                            });

                            // 在 HTML 中使用簡潔的路徑參考，而不是完整的 base64
                            return {
                                src: imgPath
                            };
                        });
                    })
                });

                const html = result && result.value ? result.value : '';
                currentMarkdownContent = convertHtmlToMarkdown(html);

                // 將提取的圖片資料儲存到 currentImagesData
                currentImagesData = docxImages;

                // 提取並清理可能殘留的 base64 圖片資料（防止匯出再匯入的文件中有殘留）
                // 這些 base64 字串可能有幾十萬字元，會嚴重影響 token 估算
                const beforeClean = currentMarkdownContent.length;
                let extractedImageCount = 0;

                // 提取 Markdown 格式的 base64 圖片：![...](data:image/...;base64,...)
                currentMarkdownContent = currentMarkdownContent.replace(/!\[([^\]]*)\]\(data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)\)/g,
                    (match, altText, mimeType, base64Data) => {
                        extractedImageCount++;
                        const imgId = `docx_extracted_${extractedImageCount}`;
                        const imgPath = `images/${imgId}.png`;

                        // 儲存提取的圖片資料
                        currentImagesData.push({
                            id: imgId,
                            data: base64Data
                        });

                        // 替換為簡潔的參考
                        return `![${altText || '圖片'}](${imgPath})`;
                    });

                // 提取純 base64 字串（可能是文字中的殘留）
                // 比對至少 100 個字元的 base64 字串
                currentMarkdownContent = currentMarkdownContent.replace(/data:image\/([^;]+);base64,([A-Za-z0-9+/=]{100,})/g,
                    (match, mimeType, base64Data) => {
                        extractedImageCount++;
                        const imgId = `docx_extracted_${extractedImageCount}`;

                        // 儲存提取的圖片資料
                        currentImagesData.push({
                            id: imgId,
                            data: base64Data
                        });

                        return `[圖片${extractedImageCount}]`;
                    });

                const afterClean = currentMarkdownContent.length;
                const removedChars = beforeClean - afterClean;

                if (removedChars > 0 && typeof addProgressLog === "function") {
                    addProgressLog(`${logPrefix} 從文字中提取了 ${extractedImageCount} 張圖片 (清理了 ${Math.round(removedChars / 1024)} KB base64 資料)`);
                }

                if (typeof addProgressLog === "function") {
                    const charCount = currentMarkdownContent.length;
                    const estimatedTokens = typeof estimateTokenCount === 'function' ? estimateTokenCount(currentMarkdownContent) : 0;
                    const totalImages = docxImages.length + extractedImageCount;
                    addProgressLog(`${logPrefix} DOCX 文字轉換完成，共提取 ${totalImages} 張圖片 (標準: ${docxImages.length}, 嵌入: ${extractedImageCount}) (字元數: ${charCount}, 估算 tokens: ${estimatedTokens})`);
                }

                // 除錯：如果字元數與估算 tokens 差距過大，輸出前 500 字元到主控台
                if (currentMarkdownContent.length > 0 && typeof estimateTokenCount === 'function') {
                    const estimatedTokens = estimateTokenCount(currentMarkdownContent);
                    const ratio = estimatedTokens / currentMarkdownContent.length;
                    if (ratio > 10) { // 如果 token/字元 比例 > 10，說明有異常
                        console.warn(`${logPrefix} ⚠️ Token 估算異常！字元數: ${currentMarkdownContent.length}, 估算 tokens: ${estimatedTokens}, 比例: ${ratio.toFixed(2)}`);
                        console.log(`${logPrefix} Markdown 前 500 字元:`, currentMarkdownContent.substring(0, 500));
                        console.log(`${logPrefix} Markdown 後 500 字元:`, currentMarkdownContent.substring(currentMarkdownContent.length - 500));
                    }
                }
            } catch (error) {
                console.error('DOCX 解析失敗:', error);
                throw new Error(`DOCX 解析失敗: ${error.message || error}`);
            }
        } else if (fileType === 'html' || fileType === 'htm') {
            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 解析 HTML 文件...`);
            try {
                originalContent = await fileToProcess.text();
                originalEncoding = 'text';
                currentMarkdownContent = convertHtmlToMarkdown(originalContent);
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} HTML 文字轉換完成`);
            } catch (error) {
                console.error('HTML 解析失敗:', error);
                throw new Error(`HTML 解析失敗: ${error.message || error}`);
            }
        } else if (fileType === 'pptx') {
            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 解析 PPTX 文件...`);
            if (typeof JSZip === 'undefined') {
                throw new Error('缺少 JSZip 庫，無法解析 PPTX');
            }
            try {
                const arrayBuffer = await fileToProcess.arrayBuffer();
                originalBinary = arrayBuffer;
                originalEncoding = 'arraybuffer';
                const zip = await JSZip.loadAsync(arrayBuffer);
                const slidePaths = Object.keys(zip.files)
                    .filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                if (slidePaths.length === 0) {
                    throw new Error('未找到幻燈片內容');
                }
                const slides = [];
                const parser = new DOMParser();
                for (const slidePath of slidePaths) {
                    const xmlText = await zip.file(slidePath).async('string');
                    const doc = parser.parseFromString(xmlText, 'application/xml');
                    const textNodes = Array.from(doc.getElementsByTagName('a:t'));
                    const text = textNodes.map(node => node.textContent || '').join(' ').trim();
                    if (text) slides.push(text);
                }
                currentMarkdownContent = slides.length > 0 ? slides.join('\n\n---\n\n') : '[PPTX 無文字內容]';
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} PPTX 文字提取完成，共 ${slides.length} 頁`);
            } catch (error) {
                console.error('PPTX 解析失敗:', error);
                throw new Error(`PPTX 解析失敗: ${error.message || error}`);
            }
        } else if (fileType === 'epub') {
            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 解析 EPUB 文件...`);
            if (typeof JSZip === 'undefined') {
                throw new Error('缺少 JSZip 庫，無法解析 EPUB');
            }
            try {
                const arrayBuffer = await fileToProcess.arrayBuffer();
                originalBinary = arrayBuffer;
                originalEncoding = 'arraybuffer';
                const zip = await JSZip.loadAsync(arrayBuffer);
                const containerFile = zip.file('META-INF/container.xml');
                if (!containerFile) throw new Error('未找到 container.xml');
                const containerXml = await containerFile.async('string');
                const parser = new DOMParser();
                const containerDoc = parser.parseFromString(containerXml, 'application/xml');
                const rootfileEl = containerDoc.querySelector('rootfile');
                const opfPath = rootfileEl ? rootfileEl.getAttribute('full-path') : null;
                if (!opfPath) throw new Error('未找到 OPF 清單');
                const opfFile = zip.file(opfPath);
                if (!opfFile) throw new Error(`OPF 檔案缺失: ${opfPath}`);
                const opfXml = await opfFile.async('string');
                const opfDoc = parser.parseFromString(opfXml, 'application/xml');
                const manifest = {};
                opfDoc.querySelectorAll('manifest > item').forEach(item => {
                    const id = item.getAttribute('id');
                    const href = item.getAttribute('href');
                    if (id && href) manifest[id] = href;
                });
                const spineItems = [];
                opfDoc.querySelectorAll('spine > itemref').forEach(itemref => {
                    const idref = itemref.getAttribute('idref');
                    if (idref && manifest[idref]) spineItems.push(manifest[idref]);
                });
                if (spineItems.length === 0) throw new Error('未找到章節資訊');
                const baseDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
                const chapters = [];
                for (const href of spineItems) {
                    const relative = href.replace(/\\/g, '/');
                    const path = baseDir ? `${baseDir}${relative}` : relative;
                    let entry = zip.file(path) || zip.file(decodeURIComponent(path));
                    if (!entry && baseDir) {
                        const alt = `${baseDir}${decodeURIComponent(relative)}`;
                        entry = zip.file(alt);
                    }
                    if (!entry) continue;
                    const html = await entry.async('string');
                    const markdown = convertHtmlToMarkdown(html).trim();
                    if (markdown) chapters.push(markdown);
                }
                if (chapters.length === 0) throw new Error('未解析到章節正文');
                currentMarkdownContent = chapters.join('\n\n---\n\n');
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} EPUB 文字解析完成，共 ${chapters.length} 章`);
            } catch (error) {
                console.error('EPUB 解析失敗:', error);
                throw new Error(`EPUB 解析失敗: ${error.message || error}`);
            }
        } else {
            throw new Error(`不支援的檔案型別: ${fileType}`);
        }

        // --- 翻譯流程 (如果需要) ---
        if (selectedTranslationModelName !== 'none') {
            const translationKeyValue = translationKeyObject ? translationKeyObject.value : null;
            if (!translationKeyValue) {
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 警告: 需要翻譯但未提供有效的翻譯 API Key。跳過翻譯。`);
                currentTranslationContent = '[未翻譯：缺少API Key]';
                ocrChunks = [currentMarkdownContent];
                translatedChunks = [currentTranslationContent];
            } else {
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 開始翻譯 (${selectedTranslationModelName}, Key: ...${translationKeyValue.slice(-4)})`);

                // ===== MinerU 結構化翻譯檢測 =====
                let shouldUseStructuredTranslation = false;
                if (ocrResult && ocrResult.metadata) {
                    try {
                        const ocrConfig = (typeof window !== 'undefined' && window.ocrSettingsManager)
                            ? window.ocrSettingsManager.getCurrentConfig()
                            : null;

                        if (ocrConfig && ocrConfig.engine === 'mineru' && ocrConfig.translationMode === 'structured') {
                            // 檢查是否支援結構化翻譯
                            if (typeof MinerUStructuredTranslation !== 'undefined') {
                                const structuredTranslator = new MinerUStructuredTranslation();
                                shouldUseStructuredTranslation = structuredTranslator.supportsStructuredTranslation(ocrResult);

                                if (shouldUseStructuredTranslation) {
                                    if (typeof addProgressLog === "function") {
                                        addProgressLog(`${logPrefix} 檢測到 MinerU 結構化翻譯模式`);
                                    }
                                } else if (typeof addProgressLog === "function") {
                                    addProgressLog(`${logPrefix} MinerU 結構化翻譯模式已啟用，但 content_list.json 不可用，將使用標準翻譯`);
                                }
                            } else if (typeof addProgressLog === "function") {
                                addProgressLog(`${logPrefix} 警告：MinerU 結構化翻譯模組未載入，使用標準翻譯`);
                            }
                        }
                    } catch (e) {
                        console.warn(`${logPrefix} 檢測 MinerU 結構化翻譯時出錯:`, e);
                    }
                }

                // ===== 執行結構化翻譯或標準翻譯 =====
                if (shouldUseStructuredTranslation) {
                    // MinerU 結構化翻譯路徑
                    try {
                        if (typeof addProgressLog === "function") {
                            addProgressLog(`${logPrefix} 使用 MinerU 結構化翻譯 (基於 content_list.json)`);
                        }

                        const structuredTranslator = new MinerUStructuredTranslation();

                        // 1. 提取可翻譯內容
                        const translatableContent = structuredTranslator.extractTranslatableContent(
                            ocrResult.metadata.contentListJson
                        );

                        // 2. 分批
                        const batches = structuredTranslator.splitIntoBatches(translatableContent);

                        if (typeof addProgressLog === "function") {
                            addProgressLog(`${logPrefix} 提取 ${translatableContent.length} 個片段，分為 ${batches.length} 批`);
                        }

                        // 3. 準備翻譯選項
                        const translationOptions = selectedTranslationModelName === 'custom'
                            ? { modelConfig: translationModelConfig }
                            : {};

                        console.log('[MinerU Structured] 翻譯選項:', {
                            selectedTranslationModelName,
                            hasModelConfig: !!translationModelConfig,
                            translationOptions
                        });

                        // 4. 執行批次翻譯
                        const translatedContentList = await structuredTranslator.translateBatches(
                            batches,
                            targetLanguageValue,
                            selectedTranslationModelName,
                            translationKeyValue,
                            {
                                ...translationOptions,
                                // 允許從設定自定義重試，若無則用預設
                                maxRetries: (typeof loadSettings === 'function' ? (loadSettings().structuredMaxRetries || undefined) : undefined),
                                retryDelay: (typeof loadSettings === 'function' ? (loadSettings().structuredRetryDelayMs || undefined) : undefined)
                            },
                            (progress) => {
                                if (typeof addProgressLog === "function") {
                                    addProgressLog(`${logPrefix} 翻譯進度: ${progress.percentage}% (${progress.message})`);
                                }
                            },
                            acquireSlot,  // 傳遞並行槽位管理函式
                            releaseSlot   // 傳遞並行槽位管理函式
                        );

                        // 5. 儲存結果
                        // 結構化翻譯完成後：不生成常規譯文，以免展示譯文/分塊對比標籤
                        currentTranslationContent = '';

                        // 將翻譯後的 JSON 儲存在後設資料中供未來使用
                        if (!ocrResult.metadata.translatedContentList) {
                            ocrResult.metadata.translatedContentList = translatedContentList;
                        }
                        // 標記失敗項（供後續"重試失敗段"使用）
                        // 修復：統一從 translatedContentList 收集失敗項，避免重試成功後仍顯示失敗
                        try {
                            const failedItems = [];
                            (translatedContentList || []).forEach((it, idx) => {
                                if (it && it.failed === true) {
                                    failedItems.push({
                                        index: idx,
                                        type: it.type,
                                        page_idx: it.page_idx || 0,
                                        text: structuredTranslator.extractItemText ? structuredTranslator.extractItemText(it) : (it.text || '')
                                    });
                                }
                            });
                            // 去重（雖然現在不應該有重複，但保留容錯）
                            const seen = new Set();
                            const uniqFailed = failedItems.filter(x => {
                                const key = `${x.index}`;
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            ocrResult.metadata.failedStructuredItems = uniqFailed;
                            ocrResult.metadata.structuredFailedCount = uniqFailed.length;

                            if (typeof addProgressLog === 'function' && uniqFailed.length > 0) {
                                addProgressLog(`${logPrefix} 有 ${uniqFailed.length} 個片段未能成功翻譯`);
                            }
                        } catch (e) {
                            console.warn(`${logPrefix} 收集結構化失敗項時出錯(忽略):`, e);
                        }

                        // 不設定對比分塊，避免顯示“分塊對比”標籤
                        ocrChunks = [];
                        translatedChunks = [];

                        if (typeof addProgressLog === "function") {
                            addProgressLog(`${logPrefix} MinerU 結構化翻譯完成`);
                        }

                    } catch (error) {
                        // 結構化翻譯失敗，回退到標準翻譯
                        if (typeof addProgressLog === "function") {
                            addProgressLog(`${logPrefix} 結構化翻譯失敗，回退到標準翻譯: ${error.message}`);
                        }
                        console.error(`${logPrefix} MinerU 結構化翻譯錯誤:`, error);
                        shouldUseStructuredTranslation = false; // 觸發標準翻譯邏輯
                    }
                }

                // ===== 標準翻譯路徑（原有邏輯） =====
                if (!shouldUseStructuredTranslation) {
                    if (typeof estimateTokenCount !== 'function') throw new Error('estimateTokenCount函式未定義');
                    const estimatedTokens = estimateTokenCount(currentMarkdownContent);
                    const tokenLimit = parseInt(maxTokensPerChunkValue) || 2000;

                    try {
                    if (estimatedTokens > tokenLimit * 1.1) {
                        if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 文件較大 (~${Math.round(estimatedTokens/1000)}K tokens), 分段翻譯`);
                        if (typeof translateLongDocument !== 'function') throw new Error('translateLongDocument函式未定義');

                        console.log('main.js 呼叫 translateLongDocument 引數:', {
                            useCustomPromptsSetting,
                            defaultUserPromptTemplateSetting,
                            defaultSystemPromptSetting,
                            translationModelConfig,
                            currentMarkdownContent,
                            targetLanguageValue,
                            selectedTranslationModelName,
                            translationKeyValue,
                            tokenLimit,
                            logPrefix
                        });
                        let translationResult;
                        if (selectedTranslationModelName === 'custom') {
                            translationResult = await translateLongDocument(
                                currentMarkdownContent,
                                targetLanguageValue,
                                selectedTranslationModelName,
                                translationKeyValue,
                                translationModelConfig,
                                tokenLimit,
                                acquireSlot,
                                releaseSlot,
                                logPrefix,
                                defaultSystemPromptSetting,
                                defaultUserPromptTemplateSetting,
                                useCustomPromptsSetting
                            );
                        } else {
                            translationResult = await translateLongDocument(
                                currentMarkdownContent,
                                targetLanguageValue,
                                selectedTranslationModelName,
                                translationKeyValue,
                                tokenLimit,
                                acquireSlot,
                                releaseSlot,
                                logPrefix,
                                defaultSystemPromptSetting,
                                defaultUserPromptTemplateSetting,
                                useCustomPromptsSetting
                            );
                        }
                        console.log('main.js translateLongDocument 返回:', translationResult);
                        currentTranslationContent = translationResult.translatedText;
                        ocrChunks = translationResult.originalChunks;
                        translatedChunks = translationResult.translatedTextChunks;
                    } else {
                        if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 文件較小 (~${Math.round(estimatedTokens/1000)}K tokens), 直接翻譯`);
                        await acquireSlot();
                        if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 翻譯槽已獲取。呼叫 API...`);
                        try {
                            if (typeof translateMarkdown !== 'function') throw new Error('translateMarkdown函式未定義');
                            //console.log('main.js 呼叫 translateMarkdown 引數:', {
                            //    useCustomPromptsSetting,
                            //    defaultUserPromptTemplateSetting,
                            //    defaultSystemPromptSetting,
                            //    translationModelConfig,
                            //    currentMarkdownContent,
                            //    targetLanguageValue,
                            //    selectedTranslationModelName,
                            //    translationKeyValue,
                            //    logPrefix
                            //});
                            //console.log('main.js/document.js 實際傳遞的 defaultUserPromptTemplateSetting:', defaultUserPromptTemplateSetting);
                            //console.log('main.js/document.js 實際傳遞的 defaultSystemPromptSetting:', defaultSystemPromptSetting);
                            if (selectedTranslationModelName === 'custom') {
                                currentTranslationContent = await translateMarkdown(
                                    currentMarkdownContent,
                                    targetLanguageValue,
                                    selectedTranslationModelName,
                                    translationKeyValue,
                                    translationModelConfig,
                                    logPrefix,
                                    defaultSystemPromptSetting,
                                    defaultUserPromptTemplateSetting,
                                    useCustomPromptsSetting
                                );
                            } else {
                                currentTranslationContent = await translateMarkdown(
                                    currentMarkdownContent,
                                    targetLanguageValue,
                                    selectedTranslationModelName,
                                    translationKeyValue,
                                    logPrefix,
                                    defaultSystemPromptSetting,
                                    defaultUserPromptTemplateSetting,
                                    useCustomPromptsSetting
                                );
                            }
                            //console.log('main.js translateMarkdown 返回:', currentTranslationContent);
                            ocrChunks = [currentMarkdownContent];
                            translatedChunks = [currentTranslationContent];
                        } finally {
                            releaseSlot();
                            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} _翻譯槽已釋放。`);
                        }
                    }
                    if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 翻譯完成`);
                    } catch (error) {
                        // 判斷是否為翻譯 Key 失效錯誤
                        // 這裡的判斷條件可能需要根據實際API的錯誤響應來調整
                        if (error.message && (error.message.includes('無效') || error.message.includes('未授權') || error.message.includes('401') || error.message.toLowerCase().includes('invalid api key') || error.message.toLowerCase().includes('unauthorized') || error.message.includes('API key not valid') || error.message.includes('forbidden'))) {
                            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 翻譯 API Key (...${translationKeyValue.slice(-4)}) 可能已失效 (${selectedTranslationModelName}): ${error.message}`);
                            return {
                                file: fileToProcess,
                                keyInvalid: {
                                    type: 'translation',
                                    modelName: selectedTranslationModelName,
                                    keyIdToInvalidate: translationKeyObject.id
                                },
                                error: `翻譯 Key 失效: ${error.message}`
                            };
                        }
                        // 其他翻譯錯誤，標記為翻譯失敗，但OCR結果可能仍有效
                        if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 翻譯失敗: ${error.message}。將使用原文並標記錯誤。`);
                        currentTranslationContent = `[翻譯失敗: ${error.message}] ${currentMarkdownContent}`;
                        ocrChunks = [currentMarkdownContent];
                        translatedChunks = [currentTranslationContent];
                        // 不向上丟擲，允許OCR成功但翻譯失敗的情況，在最終結果中體現
                    }
                } // 結束 if (!shouldUseStructuredTranslation)
            } // 結束 else (translationKeyValue 有效)
        } else { // 結束 if (selectedTranslationModelName !== 'none')
            if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 不需要翻譯`);
            // 即使不翻譯，也需要檢查是否需要分塊（用於向量搜尋等後續功能）
            const estimatedTokens = typeof estimateTokenCount === 'function'
                ? estimateTokenCount(currentMarkdownContent)
                : currentMarkdownContent.length / 4; // 簡單估算
            const tokenLimit = parseInt(maxTokensPerChunkValue, 10) || 2000; // 與翻譯流程保持一致

            if (estimatedTokens > tokenLimit * 1.1 && typeof splitMarkdownIntoChunks === 'function') {
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${logPrefix} 文件較大 (~${Math.round(estimatedTokens/1000)}K tokens), 進行分塊處理以支援向量搜尋`);
                }
                ocrChunks = splitMarkdownIntoChunks(currentMarkdownContent, tokenLimit, logPrefix);
                translatedChunks = ocrChunks.map(() => ''); // 翻譯塊為空
            } else {
                ocrChunks = [currentMarkdownContent];
                translatedChunks = [''];
            }
        }

        const processedAt = new Date().toISOString();
        if (typeof saveResultToDB === "function") {
            // 準備後設資料
            const metadataToSave = {};

            // 如果是 MinerU 結構化翻譯，儲存額外的後設資料
            if (ocrResult && ocrResult.metadata) {
                // 儲存 layoutJson 和 contentListJson
                if (ocrResult.metadata.layoutJson) {
                    metadataToSave.layoutJson = ocrResult.metadata.layoutJson;
                }
                if (ocrResult.metadata.contentListJson) {
                    metadataToSave.contentListJson = ocrResult.metadata.contentListJson;
                }
                // 儲存翻譯後的結構化內容
                if (ocrResult.metadata.translatedContentList) {
                    metadataToSave.translatedContentList = ocrResult.metadata.translatedContentList;
                }
                // 儲存原始 PDF（轉為 base64）
                if (ocrResult.metadata.originalPdf) {
                    try {
                        const pdfBlob = ocrResult.metadata.originalPdf;
                        const pdfArrayBuffer = await pdfBlob.arrayBuffer();
                        metadataToSave.originalPdfBase64 = arrayBufferToBase64(pdfArrayBuffer);
                        if (typeof addProgressLog === "function") {
                            addProgressLog(`${logPrefix} 已儲存原始 PDF (${Math.round(pdfBlob.size / 1024)} KB)`);
                        }
                    } catch (e) {
                        console.warn(`${logPrefix} 儲存原始 PDF 失敗:`, e);
                    }
                }
                // 標記支援結構化翻譯
                metadataToSave.supportsStructuredTranslation = ocrResult.metadata.supportsStructuredTranslation;
                // 持久化結構化失敗項統計（如存在）
                if (Array.isArray(ocrResult.metadata.failedStructuredItems)) {
                    metadataToSave.failedStructuredItems = ocrResult.metadata.failedStructuredItems;
                }
                if (typeof ocrResult.metadata.structuredFailedCount === 'number') {
                    metadataToSave.structuredFailedCount = ocrResult.metadata.structuredFailedCount;
                }
            }

            await saveResultToDB({
                id: `${fileToProcess.name}_${fileToProcess.size}`,
                name: fileToProcess.name,
                size: fileToProcess.size,
                time: processedAt,
                ocr: currentMarkdownContent,
                translation: currentTranslationContent,
                images: currentImagesData,
                ocrChunks: ocrChunks,
                translatedChunks: translatedChunks,
                fileType: fileType,
                targetLanguage: targetLanguageValue,
                relativePath: relativePath,
                sourceArchive: sourceArchive,
                originalContent: originalEncoding === 'text' ? originalContent : null,
                originalEncoding: originalEncoding,
                originalBinary: originalEncoding && originalEncoding !== 'text' && originalBinary ? arrayBufferToBase64(originalBinary) : null,
                originalExtension: originalExtension,
                // 新增：模型元資訊（OCR/翻譯）
                ocrEngine: usedOcrEngine || ocrEngineForLog || (typeof window !== 'undefined' ? (window.ocrSettingsManager?.getCurrentConfig()?.engine || null) : null),
                ocrSource: usedOcrSource || null,
                translationModelName: selectedTranslationModelName || 'none',
                translationModelCustomName: (selectedTranslationModelName === 'custom' && translationModelConfig && (translationModelConfig.displayName || translationModelConfig.name)) ? (translationModelConfig.displayName || translationModelConfig.name) : null,
                translationModelId: (selectedTranslationModelName === 'custom' && translationModelConfig && translationModelConfig.modelId) ? translationModelConfig.modelId : null,
                batchId: batchContext ? batchContext.id : null,
                batchOrder: batchContext ? batchContext.order : null,
                batchTotal: batchContext ? batchContext.total : null,
                batchTemplate: batchContext ? batchContext.template : null,
                batchFormats: batchContext ? batchContext.formats : null,
                batchStartedAt: batchContext ? batchContext.startedAt : null,
                batchOutputLanguage: batchContext ? batchContext.outputLanguage : null,
                batchOriginalIndex: batchContext ? batchContext.originalIndex : null,
                batchAttempt: batchContext ? batchContext.attempt : null,
                batchZip: batchContext ? batchContext.zipOutput : null,
                // 新增：MinerU 結構化翻譯後設資料
                metadata: Object.keys(metadataToSave).length > 0 ? metadataToSave : null
            });
        }

        if (typeof onFileSuccess === 'function') {
            onFileSuccess(fileToProcess);
        }
        return {
            file: fileToProcess,
            markdown: currentMarkdownContent,
            translation: currentTranslationContent,
            images: currentImagesData,
            ocrChunks: ocrChunks,
            translatedChunks: translatedChunks,
            error: null, // 表示此檔案處理成功（即使翻譯部分可能僅標記了錯誤）
            processedAt,
            fileType,
            targetLanguage: targetLanguageValue,
            relativePath,
            sourceArchive,
            originalContent: originalEncoding === 'text' ? originalContent : null,
            originalEncoding,
            originalBinary: originalEncoding && originalEncoding !== 'text' && originalBinary ? arrayBufferToBase64(originalBinary) : null,
            originalExtension,
            // 回傳一份模型後設資料，便於上層使用
            ocrEngine: usedOcrEngine || ocrEngineForLog || (typeof window !== 'undefined' ? (window.ocrSettingsManager?.getCurrentConfig()?.engine || null) : null),
            ocrSource: usedOcrSource || null,
            translationModelName: selectedTranslationModelName || 'none',
            translationModelCustomName: (selectedTranslationModelName === 'custom' && translationModelConfig && (translationModelConfig.displayName || translationModelConfig.name)) ? (translationModelConfig.displayName || translationModelConfig.name) : null,
            translationModelId: (selectedTranslationModelName === 'custom' && translationModelConfig && translationModelConfig.modelId) ? translationModelConfig.modelId : null,
            batchId: batchContext ? batchContext.id : null,
            batchOrder: batchContext ? batchContext.order : null,
            batchTotal: batchContext ? batchContext.total : null,
            batchTemplate: batchContext ? batchContext.template : null,
            batchFormats: batchContext ? batchContext.formats : null,
            batchStartedAt: batchContext ? batchContext.startedAt : null,
            batchOutputLanguage: batchContext ? batchContext.outputLanguage : null,
            batchOriginalIndex: batchContext ? batchContext.originalIndex : null,
            batchAttempt: batchContext ? batchContext.attempt : null,
            batchZip: batchContext ? batchContext.zipOutput : null
        };


    } catch (error) { // 捕獲OCR流程中的致命錯誤，或其他未被特定keyInvalid邏輯捕獲的錯誤
        console.error(`${logPrefix} 處理檔案時發生嚴重錯誤:`, error);
        if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 嚴重錯誤: ${error.message}`);
        return {
            file: fileToProcess,
            markdown: null,
            translation: null,
            images: [],
            ocrChunks: [currentMarkdownContent || ''],
            translatedChunks: [`[處理錯誤: ${error.message}]`],
            error: error.message // 這個error會被 app.js 中的常規重試邏輯捕獲
        };
    } finally {
        if (mistralFileId && mistralKeyObject && mistralKeyObject.value && fileType === 'pdf') {
            try {
                await deleteMistralFile(mistralFileId, mistralKeyObject.value);
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 已清理 Mistral 臨時檔案 (ID: ${mistralFileId})`);
            } catch (deleteError) {
                console.warn(`${logPrefix} 清理 Mistral 檔案 ${mistralFileId} 失敗:`, deleteError);
                if (typeof addProgressLog === "function") addProgressLog(`${logPrefix} 警告: 清理 Mistral 檔案 ${mistralFileId} 失敗: ${deleteError.message}`);
            }
        }
    }
}

console.log('main.js: Checking before assignment...');
console.log('main.js: typeof processModule:', typeof processModule);
if (typeof processModule !== 'undefined') {
    console.log('main.js: processModule object keys:', Object.keys(processModule));
}
console.log('main.js: typeof processSinglePdf (the function):', typeof processSinglePdf);
console.log('main.js: Is processSinglePdf a function?', processSinglePdf instanceof Function);


// 將函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    console.log('main.js: Attempting to assign processSinglePdf to processModule...');
    processModule.processSinglePdf = processSinglePdf;
    console.log('main.js: Assignment done. typeof processModule.processSinglePdf:', typeof processModule.processSinglePdf);
    if (processModule.processSinglePdf === null) {
        console.warn('main.js: processModule.processSinglePdf is NULL immediately after assignment!');
    }
} else {
    console.warn('main.js: processModule is undefined at the point of assignment.');
}
