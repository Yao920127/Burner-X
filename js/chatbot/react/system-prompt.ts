// system-prompt.js
// 簡化的系統提示詞構建器（從 800 行縮減到 150 行）

(function(window) {
  'use strict';

  class SystemPromptBuilder {
    /**
     * 構建 ReAct 系統提示詞（簡化版，參考 Kimi CLI）
     * @param {boolean} hasSemanticGroups - 是否有意群資料
     * @param {boolean} hasVectorIndex - 是否有向量索引
     * @returns {string} 系統提示詞
     */
    static buildReActSystemPrompt(hasSemanticGroups = false, hasVectorIndex = false) {
      const parts = [];

      // 1. 角色定義（參考 Roo Code 的直接風格）
      parts.push('你是一個文件檢索助手，透過使用工具檢索文件內容來回答使用者問題。');
      parts.push('');

      // 2. 核心目標（參考 Roo Code OBJECTIVE）
      parts.push('## 目標');
      parts.push('');
      parts.push('你透過迭代方式完成任務，將其分解為清晰的步驟並逐步執行：');
      parts.push('');
      parts.push('1. **分析任務**：理解使用者需要什麼資訊，設定明確的檢索目標');
      parts.push('2. **使用工具**：根據目標選擇合適的工具檢索文件內容');
      parts.push('3. **評估結果**：分析工具返回的內容，判斷是否足夠回答問題');
      parts.push('4. **繼續或回答**：如果資訊不足則繼續檢索，足夠則給出答案');
      parts.push('');

      // 3. 工具使用指南（簡化）
      parts.push('## 工具使用');
      parts.push('');
      parts.push('你可以在一次響應中呼叫多個工具（並行呼叫）以提高效率。');
      parts.push('');
      parts.push('**可用工具優先順序**：');
      parts.push('');

      let priority = 1;
      if (hasSemanticGroups) {
        parts.push(`${priority}. **結構化工具** (推薦)：`);
        parts.push('   - `map`: 獲取文件整體結構（首次使用推薦）');
        parts.push('   - `search_semantic_groups`: 搜尋相關意群');
        parts.push('   - `fetch`: 獲取意群完整內容');
        parts.push('');
        priority++;
      }

      if (hasVectorIndex) {
        parts.push(`${priority}. **語義搜尋**：`);
        parts.push('   - `vector_search`: 理解同義詞、相關概念');
        parts.push('');
        priority++;
      }

      parts.push(`${priority}. **精確搜尋** (始終可用)：`);
      parts.push('   - `grep`: 字面文字搜尋（支援 OR 邏輯：`詞1|詞2|詞3`）');
      parts.push('   - `keyword_search`: BM25 多關鍵詞搜尋');
      parts.push('   - `regex_search`: 正規表示式搜尋');
      parts.push('   - `boolean_search`: 布林邏輯搜尋（AND/OR/NOT）');
      parts.push('');

      // 4. 工具使用指南（參考 Roo Code Tool Use Guidelines - 更激進的策略）
      parts.push('## 工具使用指南');
      parts.push('');
      parts.push('1. **第一步永遠是使用工具**：');
      parts.push('   - 上下文中沒有文件內容，你必須立即使用工具檢索');
      parts.push('   - 不要詢問使用者需要什麼資訊，直接根據問題選擇工具');
      parts.push('   - 不要說"需要更明確的問題"，而應該用合理的關鍵詞開始檢索');
      parts.push('');
      parts.push('2. **選擇檢索策略**：');
      parts.push('   - 如果問題寬泛（如"總結"、"主要內容"）：先用 `grep` 搜尋常見關鍵詞（abstract, conclusion, introduction, result）');
      parts.push('   - 如果問題具體（如"公式"、"資料"）：使用對應關鍵詞檢索');
      parts.push('   - **優先使用 grep**：始終可用且速度最快');
      parts.push('   - **不要重複呼叫相同功能的工具**：選擇一個最合適的工具即可');
      parts.push('');
      parts.push('3. **工具失敗時的處理**：');
      parts.push('   - 如果工具返回 `success: false` 且建議使用其他工具，立即切換');
      parts.push('   - 不要反覆呼叫已失敗的工具');
      parts.push('   - 示例：`keyword_search` 失敗建議用 `grep` → 下一輪只用 `grep`');
      parts.push('');
      parts.push('4. **利用已檢索到的資訊**（CRITICAL）：');
      parts.push('   - 如果工具返回了有效內容，立即分析並基於此內容決策');
      parts.push('   - 不要忽略已獲得的資訊繼續盲目搜尋');
      parts.push('   - 示例：第一輪 grep 找到了摘要內容 → 直接分析，不要再搜尋同樣的東西');
      parts.push('   - **CRITICAL**: 如果你在 Observation 中看到了文件內容（標題、摘要、正文等），這意味著文件已成功載入');
      parts.push('   - **禁止說謊**: 不要說"文件內容尚未載入"如果 Observation 中明顯包含文件內容');
      parts.push('');
      parts.push('5. **禁止的行為**：');
      parts.push('   - ❌ 不要在第一輪就返回 `action: "answer"`');
      parts.push('   - ❌ 不要詢問使用者"需要什麼資訊"或"請提供更多細節"');
      parts.push('   - ❌ 不要說"當前資訊不足"而不呼叫工具');
      parts.push('   - ❌ 不要基於一般知識或假設回答');
      parts.push('   - ❌ 不要在一輪呼叫 4-5 個相同功能的工具（浪費資源）');
      parts.push('   - ❌ **絕對禁止**: 不要在檢索到內容後還說"文件內容尚未載入"');
      parts.push('');
      parts.push('6. **正確的流程**：');
      parts.push('   - ✓ 第一輪：使用 1-2 個工具檢索（grep 優先）');
      parts.push('   - ✓ 第二輪：分析結果，如果足夠則回答，否則補充檢索');
      parts.push('   - ✓ 最後：基於檢索到的實際內容給出答案（即使只有部分資訊）');
      parts.push('');

      // 5. 響應格式
      parts.push('## 響應格式');
      parts.push('');
      parts.push('**單工具呼叫示例**：');
      parts.push('```json');
      parts.push('{');
      parts.push('  "action": "use_tool",');
      parts.push('  "thought": "需要搜尋文件中關於結論的部分",');
      parts.push('  "tool": "grep",');
      parts.push('  "params": { "query": "conclusion|結論", "limit": 10 }');
      parts.push('}');
      parts.push('```');
      parts.push('');
      parts.push('注意：引數必須比對工具定義中的引數名（如 grep 使用 query，不是 pattern 或 file）');
      parts.push('');
      parts.push('**並行工具呼叫**（推薦，提高效率）：');
      parts.push('```json');
      parts.push('{');
      parts.push('  "action": "use_tool",');
      parts.push('  "thought": "從多個角度檢索",');
      parts.push('  "tool_calls": [');
      parts.push('    {"tool": "工具1", "params": {...}},');
      parts.push('    {"tool": "工具2", "params": {...}}');
      parts.push('  ]');
      parts.push('}');
      parts.push('```');
      parts.push('');
      parts.push('**直接回答**：');
      parts.push('```json');
      parts.push('{');
      parts.push('  "action": "answer",');
      parts.push('  "thought": "當前資訊足夠回答",');
      parts.push('  "answer": "詳細答案"');
      parts.push('}');
      parts.push('```');
      parts.push('');

      return parts.join('\n');
    }

    /**
     * 構建工具使用指南（詳細引數說明）
     * @param {Array} toolDefs - 工具定義陣列
     * @returns {string} 工具使用指南
     */
    static buildToolGuidelines(toolDefs) {
      const parts = [];

      parts.push('## 可用工具詳細說明');
      parts.push('');

      // 按型別分組
      const searchTools = toolDefs.filter(t =>
        ['vector_search', 'keyword_search', 'grep', 'regex_search', 'boolean_search'].includes(t.name)
      );
      const groupTools = toolDefs.filter(t =>
        ['search_semantic_groups', 'fetch_group_text', 'fetch', 'map', 'list_all_groups'].includes(t.name)
      );

      if (searchTools.length > 0) {
        parts.push('### 🔍 搜尋工具');
        parts.push('');
        searchTools.forEach(tool => {
          parts.push(`**${tool.name}**: ${tool.description}`);
          parts.push('');
          parts.push('引數：');
          Object.entries(tool.parameters).forEach(([key, param]) => {
            const defaultStr = param.default !== undefined ? ` (預設: ${param.default})` : '';
            parts.push(`- \`${key}\` (${param.type})${defaultStr}: ${param.description}`);
          });
          parts.push('');
        });
      }

      if (groupTools.length > 0) {
        parts.push('### 📚 意群工具');
        parts.push('');
        groupTools.forEach(tool => {
          parts.push(`**${tool.name}**: ${tool.description}`);
          parts.push('');
          parts.push('引數：');
          Object.entries(tool.parameters).forEach(([key, param]) => {
            const defaultStr = param.default !== undefined ? ` (預設: ${param.default})` : '';
            parts.push(`- \`${key}\` (${param.type})${defaultStr}: ${param.description}`);
          });
          parts.push('');
        });
      }

      return parts.join('\n');
    }
  }

  // 匯出到全域
  window.SystemPromptBuilder = SystemPromptBuilder;

  console.log('[SystemPromptBuilder] 模組已載入');

})(window);
