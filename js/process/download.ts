// process/download.js

/**
 * 將所有成功處理的文件結果打包成一個 ZIP 檔案並觸發下載。
 *
 * 主要流程：
 * 1. **篩選結果**：從 `allResultsData` 中篩選出沒有錯誤、包含 Markdown 內容且未被跳過的成功處理結果。
 * 2. **空結果檢查**：如果沒有成功的處理結果，則顯示通知並退出。
 * 3. **JSZip 依賴檢查**：如果 `JSZip` 庫未載入，則顯示錯誤通知並退出。
 * 4. **建立 ZIP 例項**：初始化一個新的 `JSZip` 物件。
 * 5. **走訪並新增檔案到 ZIP**：
 *    - 對每個成功的處理結果：
 *      - 根據原始 PDF 檔名建立一個安全的資料夾名 (`safeFolderName`)。
 *      - 在 ZIP 內建立此資料夾。
 *      - 將處理得到的 Markdown 內容儲存為 `document.md`。
 *      - 如果存在翻譯內容 (`result.translation`)：
 *        - 構建包含免責宣告的翻譯內容 (`contentToDownload`)。
 *        - 將其儲存為 `translation.md`。
 *      - 如果存在圖片資料 (`result.images`)：
 *        - 在當前資料夾內建立一個 `images` 子資料夾。
 *        - 走訪圖片資料，將每張圖片（Base64 編碼）儲存為 PNG 檔案到 `images` 資料夾中。
 *        - 對圖片資料進行有效性檢查，跳過無效資料並記錄日誌。
 *        - 捕獲並記錄新增圖片到 ZIP 時的潛在錯誤。
 * 6. **最終檔案數檢查**：如果最終沒有檔案被新增到 ZIP 包 (例如，所有結果都只有資料夾)，則顯示警告並退出。
 * 7. **生成並下載 ZIP**：
 *    - 使用 `zip.generateAsync` 以 DEFLATE 壓縮方式生成 ZIP 檔案的 Blob 資料。
 *    - 生成帶時間戳的檔名 (如 `PaperBurner_Results_YYYY-MM-DDTHH-MM-SS-mmmZ.zip`)。
 *    - 使用 `saveAs` 函式 (FileSaver.js 提供) 觸發瀏覽器下載該 Blob。
 *    - 如果 `saveAs` 未定義，則記錄錯誤。
 * 8. **錯誤處理**：捕獲在建立或下載 ZIP 檔案過程中可能發生的任何錯誤，並顯示通知。
 * 9. **日誌記錄**：在關鍵步驟透過 `addProgressLog` (如果可用) 輸出日誌。
 *
 * @param {Array<Object>} allResultsData - 包含所有檔案處理結果的物件陣列。
 *                                       每個物件應包含 `file`, `error`, `markdown`, `translation`, `images`, `skipped` 等屬性。
 * @returns {Promise<void>} 函式沒有顯式返回值，主要副作用是觸發檔案下載。
 */
function sanitizeFileName(name) {
    return (name || 'document').replace(/[\\/:*?"<>|]/g, '_');
}

function sanitizePath(path) {
    return (path || '').split('/').map(segment => sanitizeFileName(segment)).filter(Boolean).join('/');
}

function removeExtension(name) {
    if (!name) return '';
    const idx = name.lastIndexOf('.');
    return idx === -1 ? name : name.slice(0, idx);
}

function ensureFileName(baseName, ext) {
    const sanitized = sanitizeFileName(baseName || 'document');
    if (!ext) return sanitized;
    if (sanitized.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
        return sanitized;
    }
    return `${sanitized}.${ext}`;
}

async function downloadAllResults(allResultsData) {
    const successfulResults = allResultsData.filter(result => result && !result.error && result.markdown && !result.skipped);

    if (successfulResults.length === 0) {
        if (typeof showNotification === "function") {
            showNotification('沒有成功的處理結果可供下載', 'warning');
        }
        return;
    }

    if (typeof addProgressLog === "function") {
        addProgressLog('開始打包下載結果...');
    }

    if (typeof JSZip === 'undefined') {
        if (typeof showNotification === "function") {
            showNotification('JSZip 載入失敗，無法打包下載', 'error');
        }
        return;
    }

    const zip = new JSZip();
    let filesAdded = 0;

    for (const result of successfulResults) {
        const relativePath = (result.relativePath || (result.file && result.file.pbxRelativePath) || (result.file && result.file.name) || 'document').replace(/\\/g, '/');
        const dirPath = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
        const baseName = relativePath.includes('/') ? relativePath.slice(relativePath.lastIndexOf('/') + 1) : relativePath;
        const baseWithoutExt = removeExtension(baseName);
        const sanitizedDir = sanitizePath(dirPath);
        const sanitizedBase = sanitizeFileName(baseWithoutExt || 'document').substring(0, 120) || 'document';
        const folderPath = sanitizedDir ? `${sanitizedDir}/${sanitizedBase}` : sanitizedBase;
        const folder = zip.folder(folderPath);

        folder.file('document.md', result.markdown);

        if (result.translation) {
            const currentDate = new Date().toISOString().split('T')[0];
            const headerDeclaration = `> *本文件由 Paper Burner 工具製作 (${currentDate})。內容由 AI 大模型翻譯生成，不保證翻譯內容的準確性和完整性。*\n\n`;
            const footerDeclaration = `\n\n---\n> *免責宣告：本文件內容由大模型API自動翻譯生成，Paper Burner 工具不對翻譯內容的準確性、完整性和合法性負責。*`;
            const contentToDownload = headerDeclaration + result.translation + footerDeclaration;
            folder.file('translation.md', contentToDownload);
        }

        if (result.images && result.images.length > 0) {
            const imagesFolder = folder.folder('images');
            for (let i = 0; i < result.images.length; i++) {
                const img = result.images[i];
                try {
                    const raw = img.data || '';
                    const base64Data = raw.includes(',') ? raw.split(',')[1] : raw;
                    if (!base64Data) {
                        console.warn(`Skipping image ${img.id} in ${folderPath} due to missing data.`);
                        if (typeof addProgressLog === "function") {
                            addProgressLog(`警告: 跳過圖片 ${img.id} (檔案: ${folderPath})，資料缺失。`);
                        }
                        continue;
                    }
                    let filename = (img.name || img.id || `img-${i+1}.jpg`).toString();
                    // 確保有副檔名
                    if (!/\.[a-z0-9]+$/i.test(filename)) {
                        // 從 data URI 推斷
                        const mime = (raw.split(';')[0] || '').replace(/^data:/, '').toLowerCase();
                        let ext = 'jpg';
                        if (mime.includes('png')) ext = 'png';
                        else if (mime.includes('gif')) ext = 'gif';
                        else if (mime.includes('webp')) ext = 'webp';
                        else if (mime.includes('bmp')) ext = 'bmp';
                        else if (mime.includes('svg')) ext = 'svg';
                        filename = `${filename}.${ext}`;
                    }
                    imagesFolder.file(filename, base64Data, { base64: true });
                } catch (imgError) {
                    console.error(`Error adding image ${img.id} to zip for ${folderPath}:`, imgError);
                    if (typeof addProgressLog === "function") {
                        addProgressLog(`警告: 打包圖片 ${img.id} (檔案: ${folderPath}) 時出錯: ${imgError.message}`);
                    }
                }
            }
        }
        filesAdded++;
    }

    if (filesAdded === 0) {
        if (typeof showNotification === "function") {
            showNotification('沒有成功處理的檔案可以打包下載', 'warning');
        }
        if (typeof addProgressLog === "function") {
            addProgressLog('沒有可打包的檔案。');
        }
        return;
    }

    try {
        if (typeof addProgressLog === "function") {
            addProgressLog(`正在生成包含 ${filesAdded} 個檔案結果的 ZIP 包...`);
        }
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        if (typeof saveAs === "function") {
            saveAs(zipBlob, `PaperBurner_Results_${timestamp}.zip`);
            if (typeof addProgressLog === "function") {
                addProgressLog('ZIP 檔案生成完畢，開始下載。');
            }
        } else {
            console.error('saveAs 函式未定義，無法下載檔案');
            if (typeof addProgressLog === "function") {
                addProgressLog('錯誤: saveAs 函式未定義，無法下載檔案');
            }
        }
    } catch (error) {
        console.error('建立或下載 ZIP 檔案失敗:', error);
        if (typeof showNotification === "function") {
            showNotification('建立 ZIP 檔案失敗: ' + error.message, 'error');
        }
        if (typeof addProgressLog === "function") {
            addProgressLog('錯誤: 建立 ZIP 檔案失敗 - ' + error.message);
        }
    }
}

// 將函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.downloadAllResults = downloadAllResults;
}
