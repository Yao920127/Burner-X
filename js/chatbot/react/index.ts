// index.js
// ReAct 模組主入口檔案

/**
 * ReAct (Reasoning + Acting) 模組
 *
 * 架構說明：
 * - json-parser.js: 增強的 JSON 解析器，提高容錯性
 * - system-prompt.js: 簡化的系統提示詞構建器（從 800 行減到 150 行）
 * - context-builder.js: 上下文構建器（改進初始上下文策略）
 * - tool-registry.js: 工具登入檔（10個檢索工具）
 * - token-budget.js: Token 預算管理器
 * - engine.js: 簡化的核心引擎（移除強制模式比對）
 *
 * 使用方法：
 * ```javascript
 * const engine = new window.ReActEngine({
 *   maxIterations: 5,
 *   tokenBudget: {
 *     totalBudget: 32000,
 *     contextTokens: 18000
 *   },
 *   llmConfig: {...}
 * });
 *
 * const generator = engine.run(userQuestion, docContent, systemPrompt, chatHistory);
 * for await (const event of generator) {
 *   console.log(event);
 * }
 * ```
 *
 * 改進要點（相比原版）：
 * 1. ✅ JSON 解析更可靠（多策略解析 + 修復常見錯誤）
 * 2. ✅ 提示詞簡化 70%（從 800 行減到 150 行）
 * 3. ✅ 移除強制模式比對（checkForcedAction）
 * 4. ✅ 改進初始上下文（包含文件概覽而非完全空白）
 * 5. ✅ 模組化架構（易於維護和擴充）
 *
 * 版本：v2.0.0
 * 更新日期：2025-01-18
 */

(function(window) {
  'use strict';

  // 檢查依賴項
  const requiredModules = [
    'ReActJsonParser',
    'SystemPromptBuilder',
    'ContextBuilder',
    'ToolRegistry',
    'TokenBudgetManager',
    'ReActEngine'
  ];

  const missingModules = requiredModules.filter(module => !window[module]);

  if (missingModules.length > 0) {
    console.error('[ReAct Module] 缺少必需的模組:', missingModules.join(', '));
    console.error('[ReAct Module] 請確保按順序載入所有模組檔案');
  } else {
    console.log('[ReAct Module] ✓ 所有模組已成功載入');
    console.log('[ReAct Module] 可用元件:', requiredModules.join(', '));
  }

  // 匯出版本資訊
  window.ReActModule = {
    version: '2.0.0',
    components: {
      JsonParser: window.ReActJsonParser,
      SystemPromptBuilder: window.SystemPromptBuilder,
      ContextBuilder: window.ContextBuilder,
      ToolRegistry: window.ToolRegistry,
      TokenBudgetManager: window.TokenBudgetManager,
      Engine: window.ReActEngine
    },
    changelog: {
      'v2.0.0': [
        '模組化重構',
        'JSON 解析增強（多策略 + 容錯）',
        '提示詞簡化 70%',
        '移除強制模式比對',
        '改進初始上下文策略'
      ],
      'v1.2.0': ['並行工具呼叫', '詳細工具描述'],
      'v1.1.0': ['工具擴充到 10 個'],
      'v1.0.0': ['首次釋出']
    }
  };

  console.log(`[ReAct Module] v${window.ReActModule.version} 已就緒`);

})(window);
