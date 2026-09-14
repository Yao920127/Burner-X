// process/index.js

// 建立一個包含所有將要匯出函式的物件
// 這個物件作為模組的名稱空間，用於集中管理和暴露 process 子模組中的功能。
// 在所有相關腳本載入完成後，這些函式會被掛載到全域 window 物件，以相容舊的呼叫方式。
const processModule = {
    // 工具函式
    getRetryDelay: null,
    estimateTokenCount: null,
    escapeRegex: null,

    // OCR處理
    processOcrResults: null,

    // 表格處理
    protectMarkdownTables: null,
    extractTableFromTranslation: null,
    restoreMarkdownTables: null,

    // 翻譯相關
    buildPredefinedApiConfig: null,
    buildCustomApiConfig: null,
    translateMarkdown: null,

    // 文件處理
    splitMarkdownIntoChunks: null,
    splitByParagraphs: null,
    translateLongDocument: null,

    // 下載功能
    downloadAllResults: null,

    // 主處理流程
    processSinglePdf: null
};

// 在各模組載入完成後執行此函式，將所有函式掛載到全域
/**
 * 初始化處理模組 (processModule)。
 * 此函式在所有依賴的 process 子模組腳本 (`utils.js`, `ocr.js`, 等) 載入完成後被呼叫。
 * 它的主要作用是將 `processModule` 物件中收集到的所有函式掛載到全域 `window` 物件上，
 * 這樣做是為了確保舊的、直接透過 `window.functionName()` 方式呼叫這些處理函式的地方能夠繼續工作。
 *
 * 走訪 `processModule` 中的每一個鍵值對：
 *  - 如果值 (函式) 不為 `null` (即已成功載入並賦值)，則 `window[key] = value`。
 *  - 如果值為 `null`，則在主控台列印一個警告，表明對應的函式未能正確載入。
 * 最後，在主控台列印一條訊息，表示模組載入和函式暴露已完成。
 */
function initializeProcessModule() {
    console.log('index.js: initializeProcessModule STARTING...');
    console.log('index.js: typeof processModule at init start:', typeof processModule);
    if (typeof processModule !== 'undefined') {
        console.log('index.js: processModule keys at init start:', Object.keys(processModule));
        console.log('index.js: typeof processModule.processSinglePdf at init start:', typeof processModule.processSinglePdf);
    }

    Object.entries(processModule).forEach(([key, value]) => {
        if (value !== null) {
            window[key] = value;
        } else {
            // 在這裡新增更詳細的日誌
            console.warn(`index.js: Function ${key} was not loaded correctly. Value is null.`);
            console.log(`index.js: Checking processModule.${key} again:`, processModule[key]);
        }
    });

    console.log("index.js: Process module loaded and functions exposed to global scope (initializeProcessModule ENDING)");
}

// 動態載入所有模組的腳本
/**
 * 動態載入所有 `process` 子模組的 JavaScript 檔案。
 * 這種方式允許按需或延遲載入這些處理邏輯，而不是在頁面初始載入時就全部引入。
 *
 * 主要步驟：
 * 1. **定義腳本列表**：`scripts` 陣列包含所有需要載入的子模組腳本的路徑。
 * 2. **計數器初始化**：`loaded` 變數用於跟蹤已成功載入的腳本數量。
 * 3. **走訪並建立 script 標籤**：
 *    - 對 `scripts` 陣列中的每個路徑：
 *      - 建立一個新的 `<script>` HTML 元素。
 *      - 設定其 `src` 屬性為腳本路徑。
 *      - **設定 `onload` 回撥**：當腳本成功載入並執行後，`loaded` 計數器加一。
 *        如果 `loaded` 等於腳本總數，說明所有腳本都已載入完畢，此時呼叫 `initializeProcessModule()` 來完成模組的初始化和全域暴露。
 *      - **設定 `onerror` 回撥**：如果腳本載入失敗，在主控台列印錯誤資訊。
 *      - 將建立的 `<script>` 標籤追加到文件的 `<head>` 中，瀏覽器會自動開始載入和執行它。
 * 4. **開始載入**：函式最後呼叫自身，啟動腳本載入過程。
 */
function loadProcessingScripts() {
    const scripts = [
        'js/process/utils.js',
        'js/process/ocr.js',
        'js/process/tables.js',
        'js/process/glossary-core.js',
        'js/process/translation.js',
        'js/process/document.js',
        'js/process/download.js',
        'js/process/main.js'
    ];

    let loaded = 0;

    scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loaded++;
            if (loaded === scripts.length) {
                // 所有腳本載入完成，初始化模組
                initializeProcessModule();
            }
        };
        script.onerror = (err) => {
            console.error(`Failed to load script: ${src}`, err);
        };
        document.head.appendChild(script);
    });
}

// 開始載入腳本
loadProcessingScripts();
