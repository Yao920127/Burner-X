/**
 * 計算指數退避的重試延遲，並加入抖動以減少多個例項同時重試的機率。
 *
 * 主要邏輯:
 * 1. 根據重試次數計算基礎的指數延遲 (baseDelay * 2^retryCount)。
 * 2. 生成一個抖動值，其範圍是指數延遲的 ±10% (即 exponentialDelay * 0.2 * (Math.random() - 0.5))。
 * 3. 將抖動值加到指數延遲上。
 * 4. 確保總延遲不超過 `maxDelay`。
 * 5. 確保總延遲不小於 `baseDelay` (以防抖動導致延遲過小)。
 *
 * @param {number} retryCount - 當前重試次數 (從0開始計數)。
 * @param {number} baseDelay - 基礎延遲時間 (毫秒)，預設為 500ms。
 * @param {number} maxDelay - 最大延遲時間 (毫秒)，預設為 30000ms。
 * @returns {number} 計算後並應用了抖動和上下限的延遲時間 (毫秒)。
 */
function getRetryDelay(retryCount, baseDelay = 500, maxDelay = 30000) {
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    // 抖動: 在 ±10% 範圍內隨機浮動
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    const totalDelay = Math.min(exponentialDelay + jitter, maxDelay);
    return Math.max(totalDelay, baseDelay);
}

/**
 * 基於文字特性估算其 token 數量。
 * 此方法為啟發式估算，並非精確計數，主要針對不同語言特性採用不同策略。
 *
 * 主要邏輯:
 * 1. 如果文字為空或未定義，直接返回 0。
 * 2. 計算文字中非 ASCII 字元 (粗略地判斷為 CJK 字元等) 的比例。
 * 3. **CJK 語言處理**: 如果非 ASCII 字元的比例超過一個閾值 (例如 0.3)，則認為文字主要由 CJK 字元構成。
 *    此時，token 數大致估算為 `text.length * 1.1` (一個字元約等於 1.1 個 token)。
 * 4. **其他語言處理 (如英文、程式碼)**: 否則，認為文字主要由 ASCII 字元構成。
 *    此時，token 數大致估算為 `text.length / 3.5` (約 3-4 個字元為一個 token)。
 * 5. 對估算結果向上取整。
 *
 * @param {string} text - 需要估算 token 數的輸入文字。
 * @returns {number} 估算出的 token 數量。
 */
function estimateTokenCount(text) {
    if (!text) return 0;
    // 針對CJK等非ASCII字元的最佳化估算
    const nonAsciiRatio = (text.match(/[^ - ]/g) || []).length / text.length;
    if (nonAsciiRatio > 0.3) { // 中日韓等語言的啟發式判斷
        return Math.ceil(text.length * 1.1);
    } else {
        // 英文和程式碼大約3-4個字元一個token
        return Math.ceil(text.length / 3.5);
    }
}

/**
 * 跳脫字元串中的正規表示式特殊字元。
 * 當需要將一個普通字串用作正規表示式的一部分進行精確比對時，
 * 該字串中可能包含的正規表示式特殊字元 (如 `.`、`*`、`+`、`?` 等) 需要被轉義，
 * 以確保它們被解釋為字面量字元而不是元字元。
 *
 * 主要邏輯:
 * - 使用 `String.prototype.replace()` 方法。
 * - 正規表示式 `/[.*+?^${}()|[\\]\\]/g` 比對所有常見的正規表示式特殊字元。
 * - 替換函式 `$&` 表示比對到的整個子字串，在其前面加上反斜槓 `\\` 進行轉義。
 *
 * @param {string} string - 需要轉義的原始字串。
 * @returns {string} 特殊字元已被轉義的字串，可以直接安全地用於構建新的正規表示式。
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 將工具函式新增到processModule物件
if (typeof processModule !== 'undefined') {
    processModule.getRetryDelay = getRetryDelay;
    processModule.estimateTokenCount = estimateTokenCount;
    processModule.escapeRegex = escapeRegex;
}