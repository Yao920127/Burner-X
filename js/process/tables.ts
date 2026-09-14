// process/tables.js

/**
 * 在翻譯前對Markdown表格進行特殊處理，將其替換為佔位符，以確保表格結構在翻譯過程中保持完整性。
 *
 * 主要步驟：
 * 1. **預處理**：
 *    - 標準化換行字元為 `\n`。
 *    - 移除每行表格前可能存在的影響識別的行首空格或製表符。
 * 2. **表格邊界檢測**：
 *    - 使用更可靠的方法檢測表格：尋找連續的表格行（包括表頭、分隔行和資料行）。
 *    - 定義表格行 (`tableRowRegex`) 和表格分隔行 (`tableSepRegex`) 的正規表示式。
 *    - 掃描文字行，識別潛在的表格標題（以 "TABLE", "Table", "表" 開頭且下一行是表格行的行）。
 * 3. **表格範圍確定**：
 *    - 走訪文字行，標記表格的開始和結束行號，存入 `tableRanges`。
 *    - 考慮最小有效表格行數 (`minTableRows`)，避免將非表格內容誤認為表格。
 *    - 如果表格前有識別到的標題，則將標題行也包含在表格範圍內。
 *    - 特殊處理文件末尾的表格。
 * 4. **合併相鄰表格**：
 *    - 走訪 `tableRanges`，如果兩個表格範圍相鄰或僅由空行/特定註釋行隔開，則將它們合併為一個範圍。
 *      這有助於處理因 Markdown 解析不完美或原始文件格式問題導致的表格被錯誤分割的情況。
 * 5. **提取表格並替換為佔位符**：
 *    - 從後向前走訪 `tableRanges`（避免替換影響後續行號的準確性）。
 *    - 對每個表格範圍，提取其完整的 Markdown 內容。
 *    - 生成唯一的佔位符，如 `__TABLE_PLACEHOLDER_0__`。
 *    - 將原始表格內容儲存在 `tablePlaceholders` 物件中，鍵為佔位符，值為表格 Markdown 文字。
 *    - 在原始文字 (`processedText`) 中，用佔位符替換掉實際的表格內容。
 *    - 同時更新 `lines` 陣列（用於內部處理），將表格內容替換為佔位符，以便後續步驟的正確索引。
 * 6. **返回結果**：返回一個物件，包含：
 *    - `processedText`：表格已被佔位符替換的 Markdown 文字。
 *    - `tablePlaceholders`：一個對映物件，鍵是佔位符，值是對應的原始表格 Markdown 內容。
 *
 * @param {string} markdown - 原始的 Markdown 文字內容。
 * @returns {Object} 一個包含兩部分的物件：
 *                   `{ processedText: string, tablePlaceholders: Object }`。
 */
function protectMarkdownTables(markdown) {
    // 預處理：標準化換行字元並確保每行表格前沒有空格影響識別
    let normalizedMarkdown = markdown.replace(/\r\n/g, '\n').replace(/^[ \t]+(\|[\s\S]+)$/gm, '$1');

    // 首先檢測所有表格邊界
    // 使用一種更可靠的表格檢測方法：尋找連續的表格行（包括表頭、分隔行和資料行）

    // 表格相關的正規表示式
    const tableRowRegex = /^\s*\|.*\|\s*$/;  // 表格行: | 內容 |
    const tableSepRegex = /^\s*\|[\s\-:]+\|\s*$/;  // 表格分隔行: | --:-- |

    // 按行分割文字
    const lines = normalizedMarkdown.split('\n');
    const tableRanges = [];  // 儲存表格的範圍 [開始行, 結束行]

    // 查詢所有可能的表格標題
    const tableTitles = {};  // 行號 -> 標題文字
    for (let i = 0; i < lines.length; i++) {
        if ((lines[i].trim().startsWith('TABLE') ||
             lines[i].trim().startsWith('Table') ||
             lines[i].trim().startsWith('表')) &&
            i < lines.length - 1 &&
            tableRowRegex.test(lines[i+1])) {
            tableTitles[i] = lines[i];
        }
    }

    // 掃描查詢所有表格的範圍
    let inTable = false;
    let tableStart = -1;
    let minTableRows = 3;  // 最小的有效表格行數

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isTableRow = tableRowRegex.test(line);

        if (!inTable && isTableRow) {
            // 找到表格開始
            tableStart = i;
            inTable = true;
        } else if (inTable && !isTableRow) {
            // 找到表格結束
            if (i - tableStart >= minTableRows) {
                // 表格有足夠多的行，是有效表格
                // 檢查是否有表格標題
                const titleIndex = tableStart - 1;
                if (tableTitles[titleIndex]) {
                    tableRanges.push([titleIndex, i - 1]);
                    delete tableTitles[titleIndex]; // 已使用此標題
                } else {
                    tableRanges.push([tableStart, i - 1]);
                }
            }
            inTable = false;
            tableStart = -1;
        }
    }

    // 處理文件頁尾的表格
    if (inTable && lines.length - tableStart >= minTableRows) {
        const titleIndex = tableStart - 1;
        if (tableTitles[titleIndex]) {
            tableRanges.push([titleIndex, lines.length - 1]);
            delete tableTitles[titleIndex];
        } else {
            tableRanges.push([tableStart, lines.length - 1]);
        }
    }

    // 合併相鄰的表格（處理錯誤分割的表格）
    if (tableRanges.length > 1) {
        const mergedRanges = [tableRanges[0]];
        for (let i = 1; i < tableRanges.length; i++) {
            const lastRange = mergedRanges[mergedRanges.length - 1];
            const currentRange = tableRanges[i];

            // 檢查兩個表格是否相鄰或只隔了一個空行或註釋行
            if (currentRange[0] - lastRange[1] <= 2) {
                // 檢查中間行是否為註釋行或空行
                const middleLines = lines.slice(lastRange[1] + 1, currentRange[0]);
                const areAllMiddleLinesNonTable = middleLines.every(line => {
                    return line.trim() === '' ||
                           line.trim().startsWith('^') ||
                           line.trim().startsWith('*') ||
                           line.trim().startsWith('$') ||
                           /^\s*\[\^\d+\]:/.test(line.trim()) ||
                           line.trim().match(/^[a-zA-Z]?\s*\{\s*\^\s*[a-z]+\s*\}/) ||
                           line.trim().match(/^\$\{\s*\^\s*\\?[a-z]+\s*\}\$/);
                });

                if (areAllMiddleLinesNonTable) {
                    // 合併這兩個表格範圍
                    lastRange[1] = currentRange[1];
                } else {
                    mergedRanges.push(currentRange);
                }
            } else {
                mergedRanges.push(currentRange);
            }
        }
        tableRanges.length = 0;
        tableRanges.push(...mergedRanges);
    }

    // 提取表格並替換為佔位符
    let tableCounter = 0;
    const tablePlaceholders = {};
    let processedText = normalizedMarkdown;

    // 從後向前處理，避免替換影響索引
    for (let i = tableRanges.length - 1; i >= 0; i--) {
        const [start, end] = tableRanges[i];
        const tableLines = lines.slice(start, end + 1);
        const tableContent = tableLines.join('\n');

        // 生成佔位符
        const placeholder = `__TABLE_PLACEHOLDER_${tableCounter}__`;
        tablePlaceholders[placeholder] = tableContent;
        tableCounter++;

        // 替換原文中的表格內容
        const beforeTable = lines.slice(0, start).join('\n');
        const afterTable = lines.slice(end + 1).join('\n');
        processedText = beforeTable + (beforeTable ? '\n' : '') +
                        placeholder +
                        (afterTable ? '\n' : '') + afterTable;

        // 更新lines陣列，以便後續處理
        lines.splice(start, end - start + 1, placeholder);
    }

    // 為日誌新增識別結果
    console.log(`表格識別完成：找到 ${tableCounter} 個表格`);

    return {
        processedText,
        tablePlaceholders
    };
}

/**
 * 從大語言模型翻譯返回的文字中提取並清理出 Markdown 表格內容。
 * 模型返回的表格有時可能被包裹在程式碼塊中，或者包含額外的解釋性文字，此函式旨在儘可能準確地提取核心表格。
 *
 * 主要步驟：
 * 1. **初步清理**：移除字串首尾的空格。
 * 2. **移除程式碼塊標記**：如果文字以 ` ``` `開始和結束，則移除這些標記。
 *    - 如果程式碼塊內部有語言標識 (如 `markdown` 或 `md`)，也一併移除。
 * 3. **提取潛在表格標題**：檢查清理後文字的第一行是否以 "TABLE" 或 "表" 開頭，如果是，則將其視為表格標題並暫存。
 * 4. **提取表格行**：
 *    - 走訪剩餘的文字行。
 *    - 如果一行以 `|` 開頭，則認為進入了表格內容，將其加入 `tableLines` 陣列。
 *    - 如果已在表格內部，但當前行不以 `|` 開頭：
 *      - 若該行為空行或包含表格分隔符特徵 (`---`)，則仍視為表格的一部分。
 *      - 否則，認為表格內容結束。
 * 5. **組合結果**：將提取到的標題行（如果有）和表格行重新組合成完整的表格 Markdown 文字。
 * 6. **返回結果**：如果成功提取到表格內容，則返回該內容；否則返回 `null`。
 *
 * @param {string} translatedText - 從翻譯 API 收到的原始響應文字，可能包含表格。
 * @returns {string|null} 清理並提取出的 Markdown 表格文字。如果未找到有效表格結構，則返回 `null`。
 */
function extractTableFromTranslation(translatedText) {
    // 清理可能的引號或程式碼塊
    let cleanedText = translatedText.trim();

    // 移除可能的程式碼塊標記
    if (cleanedText.startsWith('```') && cleanedText.endsWith('```')) {
        cleanedText = cleanedText.substring(3, cleanedText.length - 3).trim();

        // 可能的語言標識
        if (cleanedText.startsWith('markdown') || cleanedText.startsWith('md')) {
            cleanedText = cleanedText.substring(cleanedText.indexOf('\n')).trim();
        }
    }

    // 檢查是否有表格標題 - 以TABLE或表開頭的行
    let titleLine = '';
    const lines = cleanedText.split('\n');
    const firstLine = lines[0].trim();
    if (firstLine.startsWith('TABLE') || firstLine.startsWith('表')) {
        titleLine = lines.shift();
    }

    // 提取表格內容 - 以|開頭的連續行
    const tableLines = [];
    let inTable = false;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('|')) {
            inTable = true;
            tableLines.push(line);
        } else if (inTable) {
            // 如果已經在表格內，但當前行不以|開頭，檢查是否是表格分隔行或空行
            if (trimmedLine === '' || trimmedLine.includes('---')) {
                tableLines.push(line);
            } else {
                // 真正的非表格內容，表格結束
                inTable = false;
            }
        }
    }

    // 組合標題和表格內容
    const result = titleLine ? (titleLine + '\n' + tableLines.join('\n')) : tableLines.join('\n');
    return result.length > 0 ? result : null;
}

/**
 * 在翻譯後的文字中恢復 Markdown 表格，並將原始表格內容（儲存在佔位符中的）進行翻譯後再替換回去。
 * 此函式旨在確保表格結構在整個翻譯流程中保持不變，同時表格內的文字得到正確翻譯。
 *
 * 主要步驟：
 * 1. **收集待翻譯表格**：走訪 `tablePlaceholders` 物件，將每個佔位符及其對應的原始表格內容收集到 `tablesToTranslate` 陣列中。
 * 2. **批次翻譯表格 (如果提供了 API 配置)**：
 *    - 檢查是否提供了 `apiConfig` 和 `targetLang`。如果未提供或沒有需要翻譯的表格，則跳過翻譯步驟，直接用原始表格替換佔位符。
 *    - **構建專用提示詞**：為表格翻譯建立特定的系統提示 (`tableSystemPrompt`) 和使用者提示 (`tableUserPrompt`)。
 *      這些提示詞強調保持表格結構（分隔符 `|`, 對齊標記 `:--:`, 行列數, 數學公式等）不變，僅翻譯文字內容。
 *    - **逐個翻譯表格**：
 *      - 對 `tablesToTranslate` 中的每個表格：
 *        - 使用 `apiConfig.bodyBuilder` 構建請求體。
 *        - 呼叫 `callTranslationApi` 傳送翻譯請求。
 *        - 使用 `extractTableFromTranslation` 從翻譯結果中提取並清理表格內容。
 *        - 如果成功提取到翻譯後的表格 (`cleanedTable`)，則在主文字 (`result`) 中用它替換掉對應的佔位符。
 *        - 如果提取失敗或翻譯出錯，則記錄警告/錯誤，並使用原始表格內容替換佔位符作為兜底。
 * 3. **直接恢復原始表格 (如果未提供 API 配置或無表格)**：
 *    - 如果跳過了翻譯步驟，則直接走訪 `tablePlaceholders`，用原始表格內容替換主文字中的佔位符。
 * 4. **返回結果**：返回已恢復（並可能已翻譯）表格的完整 Markdown 文字。
 *
 * @param {string} translatedText - 包含表格佔位符的、已經過初步翻譯的 Markdown 文字。
 * @param {Object} tablePlaceholders - 一個物件，鍵是表格佔位符 (如 `__TABLE_PLACEHOLDER_0__`)，值是對應的原始表格 Markdown 內容。
 * @param {Object} [apiConfig=null] - (可選) 用於翻譯表格的 API 配置物件。如果為 `null`，表格將不被翻譯，直接用原文恢復。
 * @param {string} [targetLang=null] - (可選) 目標翻譯語言。與 `apiConfig` 一同提供時用於翻譯表格。
 * @param {string} [model=null] - (可選, 未直接使用，但暗示了 apiConfig 的來源) 使用的模型名稱。
 * @param {string} [apiKey=null] - (可選, 未直接使用，但暗示了 apiConfig 的來源) API 金鑰。
 * @param {string} [logContext=""] - (可選) 日誌記錄的上下文字首。
 * @returns {Promise<string>} 已恢復表格（內容可能已翻譯）的 Markdown 文字。
 */
async function restoreMarkdownTables(translatedText, tablePlaceholders, apiConfig = null, targetLang = null, model = null, apiKey = null, logContext = "") {
    let result = translatedText;
    const tablesToTranslate = [];

    // 第一步：收集所有需要翻譯的表格
    for (const [placeholder, tableContent] of Object.entries(tablePlaceholders)) {
        tablesToTranslate.push({
            placeholder,
            content: tableContent
        });
    }

    // 第二步：批次翻譯所有表格（如果提供了API配置）
    if (apiConfig && targetLang && tablesToTranslate.length > 0) {
        if (typeof addProgressLog === "function") {
            addProgressLog(`${logContext} 準備翻譯 ${tablesToTranslate.length} 個表格...`);
        }

        // 為表格翻譯構建專門的系統提示詞
        const tableSystemPrompt = `你是一個精確翻譯表格的助手。請將表格翻譯成${targetLang}，嚴格保持以下格式要求：
1. 保持所有表格分隔符（|）和結構完全不變
2. 保持表格對齊標記（:--:、:--、--:）不變
3. 保持表格的行數和列數完全一致
4. 保持數學公式、符號和百分比等專業內容不變
5. 翻譯表格標題（如有）和表格內的文字內容
6. 表格內容與表格外內容要明確區分`;

        for (let i = 0; i < tablesToTranslate.length; i++) {
            const table = tablesToTranslate[i];
            try {
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${logContext} 正在翻譯第 ${i+1}/${tablesToTranslate.length} 個表格...`);
                }

                // 使用者提示詞
                const tableUserPrompt = `請將以下Markdown表格翻譯成${targetLang}，請確保完全保持表格結構和格式：

${table.content}

注意：請保持表格格式完全不變，包括所有的 | 符號、對齊標記、數學公式和符號。`;

                // 構建請求體
                const requestBody = apiConfig.bodyBuilder
                    ? apiConfig.bodyBuilder(tableSystemPrompt, tableUserPrompt)
                    : {
                        model: apiConfig.modelName,
                        messages: [
                            { role: "system", content: tableSystemPrompt },
                            { role: "user", content: tableUserPrompt }
                        ]
                    };

                // 呼叫API翻譯表格
                const translatedTable = await callTranslationApi(apiConfig, requestBody);

                // 提取和清理翻譯結果中的表格部分
                const cleanedTable = extractTableFromTranslation(translatedTable);

                if (cleanedTable) {
                    // 替換原始佔位符為翻譯後的表格
                    result = result.replace(table.placeholder, cleanedTable);
                } else {
                    // 如果沒有提取到表格，使用原始表格
                    console.warn(`${logContext} 無法從翻譯結果中提取表格結構，將使用原始表格`);
                    result = result.replace(table.placeholder, table.content);
                }
            } catch (tableError) {
                console.error(`表格翻譯失敗:`, tableError);
                if (typeof addProgressLog === "function") {
                    addProgressLog(`${logContext} 表格 ${i+1} 翻譯失敗: ${tableError.message}，將使用原表格`);
                }
                // 如果翻譯失敗，使用原表格
                result = result.replace(table.placeholder, table.content);
            }
        }
    } else {
        // 沒有提供翻譯配置，直接恢復原表格
        for (const [placeholder, tableContent] of Object.entries(tablePlaceholders)) {
            result = result.replace(placeholder, tableContent);
        }
    }

    return result;
}

/**
 * 診斷並嘗試修復 Markdown 表格的常見格式問題。
 * 此函式主要關注表頭與分隔行的一致性，以及資料行列數與表頭的一致性。
 *
 * 主要步驟：
 * 1. **預處理**：按行分割表格內容，移除空行和行首尾空格。
 * 2. **基本檢查**：如果行數少於3行（表頭、分隔、至少一行資料），則認為不是有效表格或過於簡單，直接返回原內容。
 * 3. **表頭分析**：分割表頭行，計算列數 (`columnCount`)。
 * 4. **分隔行修復**：
 *    - 檢查分隔行 (`lines[1]`) 是否包含必要的 `-` 和 `|` 字元。
 *    - 如果格式明顯錯誤（如缺少 `-`），則根據 `columnCount` 生成一個標準的分隔行 (`| --- | --- | ... |`) 並替換原分隔行。
 *    - 如果格式基本正確，但其單元格數量與表頭不比對，也重新生成標準分隔行並替換。
 * 5. **資料行修復**：
 *    - 走訪從第三行開始的所有資料行。
 *    - 分割每行資料，計算其單元格數量。
 *    - 如果單元格數量與 `columnCount` 不比對，則嘗試透過新增或截斷單元格來修復該行，使其列數與表頭一致。
 *      （當前實現是補齊空單元格 `| |`）。
 * 6. **返回結果**：返回修復後的表格內容（行透過 `\n` 連線）。
 *
 * @param {string} tableContent - 存在格式問題的 Markdown 表格文字。
 * @returns {string} 嘗試修復後的 Markdown 表格文字。
 */
function diagnoseAndFixTableFormat(tableContent) {
    // 按行分割表格
    const lines = tableContent.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length < 3) {
        console.log("表格行數不足");
        return tableContent; // 行數不足，可能不是表格
    }

    // 檢查第一行（表頭）
    const headerRow = lines[0];
    const headerCells = headerRow.split('|').filter(cell => cell.trim() !== '');
    const columnCount = headerCells.length;

    // 檢查第二行（分隔行）
    const separatorRow = lines[1];
    // 如果分隔行不包含足夠的"-"，可能是格式錯誤
    if (!separatorRow.includes('-') || !separatorRow.includes('|')) {
        console.log("分隔行格式錯誤，嘗試修復");

        // 建立正確的分隔行
        let newSeparatorRow = '|';
        for (let i = 0; i < columnCount; i++) {
            newSeparatorRow += ' --- |';
        }

        // 插入新的分隔行
        lines.splice(1, 1, newSeparatorRow);
    } else {
        // 檢查分隔行的列數是否與表頭比對
        const separatorCells = separatorRow.split('|').filter(cell => cell.trim() !== '');
        if (separatorCells.length !== columnCount) {
            console.log("分隔行列數與表頭不比對，嘗試修復");

            // 建立正確的分隔行
            let newSeparatorRow = '|';
            for (let i = 0; i < columnCount; i++) {
                newSeparatorRow += ' --- |';
            }

            // 替換分隔行
            lines.splice(1, 1, newSeparatorRow);
        }
    }

    // 檢查並修復所有資料行
    for (let i = 2; i < lines.length; i++) {
        const dataRow = lines[i];
        const dataCells = dataRow.split('|').filter(cell => cell.trim() !== '');

        // 如果資料行的列數與表頭不比對，進行修復
        if (dataCells.length !== columnCount) {
            console.log(`行 ${i+1} 列數與表頭不比對，嘗試修復`);

            // 建立正確的資料行
            let newDataRow = '|';
            for (let j = 0; j < columnCount; j++) {
                newDataRow += (j < dataCells.length ? ` ${dataCells[j].trim()} |` : ' |');
            }

            // 替換資料行
            lines.splice(i, 1, newDataRow);
        }
    }

    return lines.join('\n');
}

/**
 * 嘗試修復並驗證 Markdown 表格的格式，特別是處理對齊標記行錯位的問題。
 * 此函式首先呼叫 `diagnoseAndFixTableFormat` 進行初步的格式修復，
 * 然後專門檢查是否存在多行對齊標記或對齊標記行不在第二行（分隔行）的情況。
 *
 * 主要步驟：
 * 1. **初步修復**：呼叫 `diagnoseAndFixTableFormat(tableContent)` 對錶格進行基礎的格式修正。
 * 2. **對齊標記行檢查**：
 *    - 將修復後的表格按行分割，並過濾掉空行。
 *    - 查詢所有包含對齊標記（`:--:`, `:--`, `--:`）的行 (`alignmentLines`)。
 *    - **錯位處理**：如果找到了對齊標記行，並且表格的第二行（預期的分隔行位置）並不包含連字元 `-`（表明它可能不是一個正常的分隔行）：
 *      - 找到第一個包含對齊標記的行的索引 (`alignmentLineIndex`)。
 *      - 如果該對齊標記行不在第二行 (`alignmentLineIndex > 1`)，則將其移動到第二行的位置，即先刪除原來的對齊標記行，然後在第二行處插入它。
 * 3. **返回結果**：返回經過上述處理（可能被進一步修復）的表格 Markdown 文字。
 *
 * @param {string} tableContent - 可能包含格式問題（尤其是對齊標記錯位）的 Markdown 表格文字。
 * @returns {string} 修復後的 Markdown 表格文字。
 */
function fixTableFormat(tableContent) {
    // 先嚐試基本的修復
    let fixedTable = diagnoseAndFixTableFormat(tableContent);

    // 檢測是否有特殊的對齊標記行放在錯誤位置的情況
    const lines = fixedTable.split('\n').map(l => l.trim()).filter(l => l);

    // 檢查是否有多行包含對齊標記
    const alignmentLines = lines.filter(line =>
        line.includes(':--:') || line.includes(':--') || line.includes('--:')
    );

    if (alignmentLines.length > 0 && !lines[1].includes('-')) {
        // 找到第一個包含對齊標記的行
        const alignmentLineIndex = lines.findIndex(line =>
            line.includes(':--:') || line.includes(':--') || line.includes('--:')
        );

        if (alignmentLineIndex > 1) {
            // 移動對齊行到正確位置
            const alignmentLine = lines[alignmentLineIndex];
            lines.splice(alignmentLineIndex, 1);
            lines.splice(1, 0, alignmentLine);

            fixedTable = lines.join('\n');
        }
    }

    return fixedTable;
}

// 將函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.protectMarkdownTables = protectMarkdownTables;
    processModule.extractTableFromTranslation = extractTableFromTranslation;
    processModule.restoreMarkdownTables = restoreMarkdownTables;
    processModule.diagnoseAndFixTableFormat = diagnoseAndFixTableFormat;
    processModule.fixTableFormat = fixTableFormat;
}