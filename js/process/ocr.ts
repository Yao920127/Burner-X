// process/ocr.js

/**
 * 處理 OCR (光學字元識別) API 返回的 JSON 響應，從中提取 Markdown 文字和圖片資料。
 *
 * 主要邏輯：
 * 1. **走訪頁面**：迭代 `ocrResponse.pages` 陣列中的每個頁面物件。
 * 2. **提取圖片**：
 *    - 如果 `page.images` 存在且為陣列，則走訪其中的每個圖片物件。
 *    - 對於每個圖片，如果包含 `id` 和 `image_base64` 資料，則將其作為一個物件 `{ id, data }` 新增到 `imagesData` 陣列中。
 *    - 同時，為當前頁面建立一個 `pageImages` 對映，鍵為圖片 ID，值為 Markdown 中參考的相對路徑 (如 `images/IMAGE_ID.png`)。
 * 3. **處理頁面 Markdown**：
 *    - 獲取 `page.markdown` 內容。
 *    - **圖片路徑替換**：走訪 `pageImages` 對映，使用正規表示式將 Markdown 中對原始圖片 ID 的參考 (如 `![alt](IMAGE_ID)`)
 *      替換為新的相對路徑 (如 `![alt](images/IMAGE_ID.png)`)。這裡會使用全域的 `escapeRegex` 函式（如果可用）來確保圖片 ID 中的特殊字元被正確轉義，
 *      避免正規表示式執行錯誤。如果 `altText` 為空，則使用圖片ID作為預設的 alt 文字。
 * 4. **合併 Markdown**：將處理後的每個頁面的 Markdown 內容追加到 `markdownContent` 字串後，並用兩個換行字元分隔。
 * 5. **返回結果**：返回一個包含 `markdown` (合併後的完整 Markdown 文字) 和 `images` (提取的圖片資料陣列) 的物件。
 * 6. **錯誤處理**：如果在處理過程中發生任何錯誤，則記錄錯誤日誌，並返回一個包含錯誤資訊的 Markdown 內容和空圖片陣列的物件。
 *
 * @param {Object} ocrResponse - OCR API 返回的原始 JSON 物件。
 *                                通常包含一個 `pages` 陣列，每個頁面物件包含 `markdown` 文字和可選的 `images` 陣列。
 * @returns {Object} 一個包含處理結果的物件，結構為：
 *                   `{ markdown: string, images: Array<{id: string, data: string}> }`。
 *                   `markdown` 是從所有頁面提取並處理圖片參考後的合併文字。
 *                   `images` 是一個包含所有提取到的圖片資料的陣列，每個圖片物件有 `id` 和 `data` (Base64 編碼的圖片字串)。
 */
function processOcrResults(ocrResponse) {
    let markdownContent = '';
    let imagesData = [];

    try {
        for (const page of ocrResponse.pages) {
            const pageImages = {};

            if (page.images && Array.isArray(page.images)) {
                for (const img of page.images) {
                    if (img.id && img.image_base64) {
                        const imgId = img.id;
                        const imgData = img.image_base64;
                        imagesData.push({ id: imgId, data: imgData });
                        // 記錄圖片 ID 到 markdown 路徑的對映
                        // 檢查 imgId 是否已包含副檔名，避免雙重副檔名問題（如 img-0.jpeg.png）
                        const imgPath = /\.[a-z0-9]+$/i.test(imgId)
                            ? `images/${imgId}`
                            : `images/${imgId}.png`;
                        pageImages[imgId] = imgPath;
                    }
                }
            }

            let pageMarkdown = page.markdown || '';

            // 修正正規表示式轉義，所有 \\ 都要寫成 \\\\，否則括號不比對
            for (const [imgName, imgPath] of Object.entries(pageImages)) {
                // 使用全域函式 escapeRegex
                const escapedImgName = typeof escapeRegex === 'function' ?
                                        escapeRegex(imgName) :
                                        imgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                const imgRegex = new RegExp(`!\\[([^\\]]*?)\\]\\(${escapedImgName}\\)`, 'g');
                pageMarkdown = pageMarkdown.replace(imgRegex, (match, altText) => {
                    const finalAltText = altText || imgName;
                    return `![${finalAltText}](${imgPath})`;
                });
            }

            markdownContent += pageMarkdown + '\n\n';
        }

        return { markdown: markdownContent.trim(), images: imagesData };
    } catch (error) {
        console.error('處理OCR結果時出錯:', error);
        if (typeof addProgressLog === "function") {
            addProgressLog(`錯誤：處理 OCR 結果失敗 - ${error.message}`);
        }
        return { markdown: `[錯誤：處理OCR結果時發生錯誤 - ${error.message}]`, images: [] };
    }
}

// 將函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.processOcrResults = processOcrResults;
}