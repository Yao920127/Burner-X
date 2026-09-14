// json-parser.js
// 增強的 JSON 解析器，提高容錯性

(function(window) {
  'use strict';

  /**
   * 從 LLM 響應中提取並解析 JSON
   * 支援多種格式的響應，提高容錯性
   */
  class ReActJsonParser {
    /**
     * 解析 LLM 響應，提取決策資訊
     * @param {string} response - LLM 的原始響應
     * @returns {Object} 解析後的決策物件
     */
    static parse(response) {
      console.log('[JsonParser] 開始解析響應，長度:', response.length);

      // 策略 1: 嘗試直接提取 JSON 塊（支援 markdown 程式碼塊）
      let parsed = this._extractFromCodeBlock(response);
      if (parsed) return parsed;

      // 策略 2: 嘗試提取裸 JSON（最常見）
      parsed = this._extractRawJson(response);
      if (parsed) return parsed;

      // 策略 3: 嘗試修復常見 JSON 錯誤後解析
      parsed = this._extractWithFixing(response);
      if (parsed) return parsed;

      // 策略 4: 如果完全無法解析，判斷是否是純文字回答
      console.warn('[JsonParser] 無法提取 JSON，嘗試作為純文字回答處理');
      return {
        action: 'answer',
        thought: '無法解析為工具呼叫，作為直接回答',
        answer: response.trim()
      };
    }

    /**
     * 從 markdown 程式碼塊中提取 JSON
     */
    static _extractFromCodeBlock(response) {
      const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try {
          const json = codeBlockMatch[1].trim();
          const parsed = JSON.parse(json);
          console.log('[JsonParser] 成功從程式碼塊提取 JSON');
          return this._normalizeDecision(parsed);
        } catch (e) {
          console.warn('[JsonParser] 程式碼塊中的 JSON 格式錯誤:', e.message);
        }
      }
      return null;
    }

    /**
     * 提取裸 JSON（最寬鬆的比對）
     */
    static _extractRawJson(response) {
      // 比對從第一個 { 到最後一個 }
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log('[JsonParser] 成功提取裸 JSON');
          return this._normalizeDecision(parsed);
        } catch (e) {
          console.warn('[JsonParser] 裸 JSON 格式錯誤:', e.message);
        }
      }
      return null;
    }

    /**
     * 嘗試修復常見 JSON 錯誤後解析
     */
    static _extractWithFixing(response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      let jsonStr = jsonMatch[0];

      // 修復 1: 移除尾隨逗號
      jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

      // 修復 2: 修復單引號為雙引號
      jsonStr = jsonStr.replace(/'/g, '"');

      // 修復 3: 移除註釋
      jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
      jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

      try {
        const parsed = JSON.parse(jsonStr);
        console.log('[JsonParser] 成功透過修復提取 JSON');
        return this._normalizeDecision(parsed);
      } catch (e) {
        console.warn('[JsonParser] 修復後的 JSON 仍然錯誤:', e.message);
      }

      return null;
    }

    /**
     * 規範化決策物件，確保欄位完整
     */
    static _normalizeDecision(parsed) {
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('解析結果不是物件');
      }

      // 驗證必須欄位
      if (!parsed.action) {
        throw new Error('缺少 action 欄位');
      }

      if (parsed.action === 'answer') {
        return {
          action: 'answer',
          thought: parsed.thought || '',
          answer: parsed.answer || ''
        };
      }

      if (parsed.action === 'use_tool') {
        // 支援兩種格式：單工具和並行工具
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          // 並行工具呼叫
          return {
            action: 'use_tool',
            thought: parsed.thought || '',
            parallel: true,
            tool_calls: parsed.tool_calls.map(call => ({
              tool: call.tool,
              params: call.params || {}
            }))
          };
        } else if (parsed.tool) {
          // 單工具呼叫
          return {
            action: 'use_tool',
            thought: parsed.thought || '',
            parallel: false,
            tool: parsed.tool,
            params: parsed.params || {}
          };
        } else {
          throw new Error('use_tool 需要指定 tool 或 tool_calls');
        }
      }

      throw new Error('未知的 action 型別: ' + parsed.action);
    }
  }

  // 匯出到全域
  window.ReActJsonParser = ReActJsonParser;

  console.log('[ReActJsonParser] 模組已載入');

})(window);
