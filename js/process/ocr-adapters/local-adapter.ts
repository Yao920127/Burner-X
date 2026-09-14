// js/process/ocr-adapters/local-adapter.js
// 本地 PDF 解析介面卡 - 使用 PDF.js 直接提取 PDF 文字

/**
 * 本地 PDF 解析介面卡
 * 特點：
 * - 免費、快速、無需 API Key
 * - 僅適用於文字型 PDF（非掃描件）
 * - 不支援 OCR（掃描圖片轉文字）
 * - 盡力保留圖片和表格的位置順序
 */
class LocalPdfAdapter extends BaseOcrAdapter {
    constructor() {
        super();
        this.name = 'LocalPDF';

        // 檢查 PDF.js 是否載入
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js 庫未載入，無法使用本地 PDF 解析功能');
        }
    }

    /**
     * 驗證配置
     * 本地解析不需要任何配置
     */
    async validateConfig() {
        return { valid: true };
    }

    /**
     * 處理 PDF 檔案
     * @param {File} file - PDF 檔案物件
     * @param {Function} onProgress - 進度回撥 (current, total, message)
     * @returns {Promise<{markdown: string, images: Array}>}
     */
    async processFile(file, onProgress) {
        try {
            onProgress(0, 100, '開始本地解析 PDF...');

            // 讀取檔案為 ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            onProgress(10, 100, '載入 PDF 文件...');

            // 載入 PDF 文件
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            const numPages = pdf.numPages;
            onProgress(20, 100, `PDF 共 ${numPages} 頁，開始提取內容...`);

            const images = [];
            const pageContents = []; // 儲存每頁的內容片段（文字 + 圖片標記）
            const BATCH_SIZE = 50; // 每50頁處理一批，避免記憶體累積
            const totalBatches = Math.ceil(numPages / BATCH_SIZE);

            console.log(`[LocalPDF] 將分 ${totalBatches} 批處理，每批 ${BATCH_SIZE} 頁`);

            // 分批處理頁面
            for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
                const startPage = batchIdx * BATCH_SIZE + 1;
                const endPage = Math.min((batchIdx + 1) * BATCH_SIZE, numPages);

                console.log(`[LocalPDF] 處理第 ${batchIdx + 1}/${totalBatches} 批：第 ${startPage}-${endPage} 頁`);

                // 處理當前批次的頁面
                await this._processBatch(pdf, startPage, endPage, numPages, images, pageContents, onProgress);

                // 批次間休息，讓瀏覽器釋放記憶體
                if (batchIdx < totalBatches - 1) {
                    console.log(`[LocalPDF] 第 ${batchIdx + 1} 批完成，休息500ms...`);
                    await this.sleep(500);
                }
            }

            onProgress(90, 100, '啟發式文字重建中...');

            // 合併所有頁面內容（去掉頁間分隔符）
            const mergedText = pageContents.join('\n\n');

            // 啟發式文字重建
            const rebuiltText = this._heuristicRebuild(mergedText);

            onProgress(100, 100, '本地解析完成');

            return {
                markdown: rebuiltText,
                images: images,
                metadata: {
                    engine: 'local',
                    source: 'pdfjs',
                    pages: numPages,
                    note: '本地解析提取文字並保留圖片位置'
                }
            };
        } catch (error) {
            console.error('[LocalPDF] 處理失敗:', error);
            throw new Error(`本地 PDF 解析失敗: ${error.message}`);
        }
    }

    /**
     * 處理一批頁面
     * @private
     */
    async _processBatch(pdf, startPage, endPage, totalPages, images, pageContents, onProgress) {
        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            try {
                onProgress(
                    20 + Math.floor((pageNum / totalPages) * 70),
                    100,
                    `正在解析第 ${pageNum}/${totalPages} 頁...`
                );

                console.log(`[LocalPDF] 開始處理第 ${pageNum} 頁...`);
                const page = await pdf.getPage(pageNum);

                console.log(`[LocalPDF] 第 ${pageNum} 頁：提取文字...`);
                const textContent = await page.getTextContent();
                const pageText = this._extractTextFromPage(textContent);

                console.log(`[LocalPDF] 第 ${pageNum} 頁：檢測圖片...`);
                // 檢測圖片位置並插入佔位符（帶超時保護）
                const pageContentWithImages = await Promise.race([
                    this._insertImagePlaceholders(page, pageText, pageNum, images),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('圖片提取超時')), 30000) // 30秒超時
                    )
                ]).catch(err => {
                    console.warn(`[LocalPDF] 第 ${pageNum} 頁圖片提取失敗:`, err);
                    return pageText; // 失敗時只返回文字
                });

                pageContents.push(pageContentWithImages);

                // 清理頁面資源，避免記憶體洩漏
                page.cleanup();

                // 每10頁輸出一次進度日誌
                if (pageNum % 10 === 0) {
                    console.log(`[LocalPDF] ✓ 已處理 ${pageNum}/${totalPages} 頁，已提取 ${images.length} 個圖片`);
                    // 每10頁強制等待一下，讓瀏覽器釋放記憶體
                    await this.sleep(200);
                }
            } catch (pageError) {
                console.error(`[LocalPDF] ✗ 第 ${pageNum} 頁處理失敗:`, pageError);
                // 頁面失敗不中斷整體處理，記錄錯誤並繼續
                pageContents.push(`\n\n*[第 ${pageNum} 頁解析失敗: ${pageError.message}]*\n\n`);
            }
        }
    }

    /**
     * 在原頁面位置插入圖片佔位符
     * @private
     */
    async _insertImagePlaceholders(page, pageText, pageNum, images) {
        try {
            const ops = await page.getOperatorList();

            // 收集圖片物件名稱和位置
            const imageInfos = [];
            for (let i = 0; i < ops.fnArray.length; i++) {
                const fn = ops.fnArray[i];
                if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject) {
                    const imgName = ops.argsArray[i][0];
                    imageInfos.push({ name: imgName, opIndex: i });
                }
            }

            if (imageInfos.length === 0) {
                return pageText;
            }

            console.log(`[LocalPDF] 第 ${pageNum} 頁檢測到 ${imageInfos.length} 個圖片物件`);
            let result = pageText;
            let extractedCount = 0;
            let skippedCount = 0;

            // 嘗試提取每個圖片
            for (let idx = 0; idx < imageInfos.length; idx++) {
                const imageId = `page${pageNum}_img${idx + 1}`;
                const imgInfo = imageInfos[idx];

                try {
                    // 給每個圖片的獲取操作新增超時
                    // 使用更長的超時時間，但只對前幾個圖片嘗試
                    const timeout = (idx < 3) ? 2000 : 1000; // 前3個圖片等2秒，其他等1秒
                    const imgObj = await Promise.race([
                        new Promise((resolve) => {
                            page.objs.get(imgInfo.name, resolve);
                        }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('獲取圖片物件超時')), timeout)
                        )
                    ]);

                    if (!imgObj) {
                        console.warn(`[LocalPDF] 圖片物件 ${imageId} 為空，跳過`);
                        skippedCount++;
                        continue;
                    }

                    const width = imgObj.width;
                    const height = imgObj.height;

                    // 過濾規則：
                    // 1. 跳過超小圖（裝飾）：寬或高 < 30px
                    // 2. 保留合理寬高比：0.05 - 20
                    const aspectRatio = width / height;
                    const isTooSmall = width < 30 || height < 30;
                    const isBadAspectRatio = aspectRatio < 0.05 || aspectRatio > 20;

                    if (isTooSmall) {
                        console.log(`[LocalPDF] 跳過超小圖片 ${imageId}: ${width}x${height} (可能是圖示或裝飾)`);
                        skippedCount++;
                        continue;
                    }

                    if (isBadAspectRatio) {
                        console.log(`[LocalPDF] 跳過異常寬高比圖片 ${imageId}: ${width}x${height} (ratio: ${aspectRatio.toFixed(2)})`);
                        skippedCount++;
                        continue;
                    }

                    console.log(`[LocalPDF] 提取圖片 ${imageId}: ${width}x${height}`);
                    let base64Data = null;

                    // 方法1: ImageBitmap 物件（PDF.js 常見格式）
                    if (imgObj.bitmap && imgObj.bitmap instanceof ImageBitmap) {
                        // 限制圖片最大尺寸，進一步降低以減少記憶體
                        const maxDimension = 600; // 降低到600px
                        let targetWidth = width;
                        let targetHeight = height;

                        if (targetWidth > maxDimension || targetHeight > maxDimension) {
                            const scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
                            targetWidth = Math.floor(targetWidth * scale);
                            targetHeight = Math.floor(targetHeight * scale);
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = targetWidth;
                        canvas.height = targetHeight;
                        const ctx = canvas.getContext('2d', { willReadFrequently: false });

                        // 使用 drawImage 繪製並縮放 ImageBitmap
                        ctx.drawImage(imgObj.bitmap, 0, 0, targetWidth, targetHeight);
                        base64Data = canvas.toDataURL('image/jpeg', 0.7); // 降低質量到70%

                        // 立即釋放資源
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        canvas.width = 0;
                        canvas.height = 0;

                        // 關閉 ImageBitmap
                        if (imgObj.bitmap.close) {
                            imgObj.bitmap.close();
                        }
                    }
                    // 方法2: JPEG 原始資料
                    else if (imgObj.kind === 1 && imgObj.data) {
                        const bytes = imgObj.data;
                        const blob = new Blob([bytes], { type: 'image/jpeg' });
                        base64Data = await this.blobToBase64(blob);
                    }
                    // 方法3: 原始畫素資料
                    else if (imgObj.data) {
                        const imgData = imgObj.data;

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d', { willReadFrequently: false });

                        const imageData = ctx.createImageData(width, height);

                        if (imgData instanceof Uint8ClampedArray || imgData instanceof Uint8Array) {
                            imageData.data.set(imgData);
                        } else if (ArrayBuffer.isView(imgData)) {
                            imageData.data.set(new Uint8ClampedArray(imgData.buffer));
                        } else {
                            throw new Error(`Unsupported image data format: ${imgData.constructor.name}`);
                        }

                        ctx.putImageData(imageData, 0, 0);
                        base64Data = canvas.toDataURL('image/jpeg', 0.7); // 降低質量到70%

                        canvas.width = 0;
                        canvas.height = 0;
                    } else {
                        throw new Error('Unknown image format');
                    }

                    if (base64Data) {
                        images.push({
                            id: imageId,
                            data: base64Data
                        });

                        // 在文字末尾新增圖片參考
                        result += `\n\n![圖片${extractedCount + 1}](images/${imageId}.png)\n\n`;
                        extractedCount++;
                    }
                } catch (imgError) {
                    // 圖片提取失敗，靜默跳過，只在需要除錯時輸出
                    if (imgError.message.includes('超時')) {
                        // 超時錯誤不輸出，太多了
                        skippedCount++;
                    } else {
                        console.warn(`[LocalPDF] 提取圖片 ${imageId} 失敗:`, imgError.message);
                        skippedCount++;
                    }
                }

                // 每處理5個圖片休息一下，讓瀏覽器有時間釋放記憶體
                if ((idx + 1) % 5 === 0) {
                    await this.sleep(100);
                }
            }

            console.log(`[LocalPDF] 第 ${pageNum} 頁圖片處理完成: 提取 ${extractedCount} 個，跳過 ${skippedCount} 個`);
            return result;
        } catch (error) {
            console.warn(`[LocalPDF] 第 ${pageNum} 頁圖片處理失敗:`, error);
            return pageText;
        }
    }

    /**
     * 啟發式文字重建
     * @private
     */
    _heuristicRebuild(text) {
        let rebuilt = text;

        // 先保護圖片參考，避免被文字處理規則破壞
        const imageRefs = [];
        rebuilt = rebuilt.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
            const placeholder = `__IMG_PLACEHOLDER_${imageRefs.length}__`;
            imageRefs.push(match);
            return placeholder;
        });

        // 1. 修復被斷開的單詞（英文）
        // 比對：字母-空格-換行-字母 -> 字母字母
        rebuilt = rebuilt.replace(/([a-zA-Z])-\s*\n\s*([a-z])/g, '$1$2');

        // 2. 合併被打斷的句子
        // 如果行尾不是句號等結束符，且下一行不是大寫/數字/特殊字元開頭，則合併
        rebuilt = rebuilt.replace(/([^\n.!?。！？])\n([a-z\u4e00-\u9fa5])/g, '$1 $2');

        // 3. 修復標點符號周圍的空格
        // 中文標點前後不應有空格
        rebuilt = rebuilt.replace(/\s+([，。！？；：、）】」』])/g, '$1');
        rebuilt = rebuilt.replace(/([（【「『])\s+/g, '$1');

        // 英文標點後應有空格（如果後面是字母）
        rebuilt = rebuilt.replace(/([,.!?;:])([a-zA-Z])/g, '$1 $2');

        // 移除標點前的多餘空格
        rebuilt = rebuilt.replace(/\s+([,.!?;:])/g, '$1');

        // 4. 規範化空白字元
        // 多個空格變成一個
        rebuilt = rebuilt.replace(/ {2,}/g, ' ');

        // 保留段落分隔（最多2個換行）
        rebuilt = rebuilt.replace(/\n{3,}/g, '\n\n');

        // 5. 修復常見的格式問題
        // 修復：數字. 後面應該有空格（列表項）
        rebuilt = rebuilt.replace(/(\d+)\.\s*([a-zA-Z\u4e00-\u9fa5])/g, '$1. $2');

        // 修復：括號內不應有首尾空格
        rebuilt = rebuilt.replace(/\(\s+/g, '(');
        rebuilt = rebuilt.replace(/\s+\)/g, ')');

        // 6. 智慧段落識別
        // 如果連續的短行可能是同一段落，嘗試合併
        const lines = rebuilt.split('\n');
        const paragraphs = [];
        let currentPara = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line === '') {
                if (currentPara) {
                    paragraphs.push(currentPara.trim());
                    currentPara = '';
                }
                continue;
            }

            // 判斷是否應該換段
            const shouldBreak =
                // 當前段落為空
                currentPara === '' ||
                // 行以標題標記開頭
                /^#{1,6}\s/.test(line) ||
                // 行以列表標記開頭
                /^[\-\*\+]\s/.test(line) ||
                /^\d+\.\s/.test(line) ||
                // 上一行以句號等結束且本行首字母大寫
                (/[.!?。！？]\s*$/.test(currentPara) && /^[A-Z\u4e00-\u9fa5]/.test(line));

            if (shouldBreak) {
                if (currentPara) {
                    paragraphs.push(currentPara.trim());
                }
                currentPara = line;
            } else {
                currentPara += ' ' + line;
            }
        }

        if (currentPara) {
            paragraphs.push(currentPara.trim());
        }

        rebuilt = paragraphs.join('\n\n');

        // 恢復圖片參考
        imageRefs.forEach((ref, idx) => {
            rebuilt = rebuilt.replace(`__IMG_PLACEHOLDER_${idx}__`, ref);
        });

        return rebuilt.trim();
    }

    /**
     * 從 TextContent 中提取文字
     * @private
     */
    _extractTextFromPage(textContent) {
        const items = textContent.items;
        let text = '';
        let lastY = null;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // 檢測換行（Y 座標變化）
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                text += '\n';
            }

            text += item.str;

            // 如果下一個 item 有空格，新增空格
            if (i < items.length - 1) {
                const nextItem = items[i + 1];
                const spaceWidth = item.width * 0.3; // 估算空格寬度
                if (nextItem.transform[4] - item.transform[4] > spaceWidth) {
                    text += ' ';
                }
            }

            lastY = item.transform[5];
        }

        return text.trim();
    }
}

// 註冊到全域
if (typeof window !== 'undefined') {
    window.LocalPdfAdapter = LocalPdfAdapter;
}
