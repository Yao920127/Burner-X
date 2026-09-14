// engine.js
// 簡化的 ReAct 核心引擎

(function(window) {
  'use strict';

  /**
   * ReAct 引擎核心
   * 簡化版本，移除了過度複雜的規則和強制模式比對
   */
  class ReActEngine {
    constructor(config = {}) {
      this.maxIterations = config.maxIterations || 5;
      this.budgetManager = new window.TokenBudgetManager(config.tokenBudget);
      this.toolRegistry = new window.ToolRegistry();
      this.eventHandlers = [];
      this.llmConfig = config.llmConfig || {};

      // 文件狀態（由 buildInitialContext 設定）
      this.hasSemanticGroups = false;
      this.hasVectorIndex = false;
      this.hasChunks = false;

      // 去重：記錄已檢索過的內容片段（避免重複展示）
      this.seenContentHashes = new Set();
      this.seenContentSummaries = new Map(); // hash -> summary
    }

    /**
     * 獲取系統提示詞（動態生成）
     */
    getSystemPrompt() {
      return window.SystemPromptBuilder.buildReActSystemPrompt(
        this.hasSemanticGroups,
        this.hasVectorIndex
      );
    }

    /**
     * 獲取工具使用指南
     */
    getToolGuidelines(hasSemanticGroups = false, hasVectorIndex = false, hasChunks = false) {
      const availableTools = this.toolRegistry.getAvailableToolDefinitions(hasSemanticGroups, hasVectorIndex, hasChunks);
      const availableToolNames = availableTools.map(t => t.name).join(', ');

      console.log(`[ReActEngine] 可用工具(${availableTools.length}個): ${availableToolNames}`);

      return window.SystemPromptBuilder.buildToolGuidelines(availableTools);
    }

    /**
     * 新增事件監聽器
     */
    on(eventType, handler) {
      this.eventHandlers.push({ type: eventType, handler });
    }

    /**
     * 傳送事件
     */
    emit(eventType, data) {
      this.eventHandlers
        .filter(h => h.type === eventType || h.type === '*')
        .forEach(h => {
          try {
            h.handler(data);
          } catch (e) {
            console.error('[ReActEngine] 事件處理器錯誤:', e);
          }
        });
    }

    /**
     * 構建初始上下文（改進策略：包含文件概覽）
     */
    buildInitialContext(docContent) {
      // 檢測文件狀態
      this.hasSemanticGroups = (
        (Array.isArray(docContent.semanticGroups) && docContent.semanticGroups.length > 0) ||
        (Array.isArray(window.data?.semanticGroups) && window.data.semanticGroups.length > 0)
      );
      this.hasVectorIndex = !!(
        docContent.vectorIndexReady ||
        docContent.vectorIndex ||
        window.data?.vectorIndexReady ||
        window.data?.vectorIndex
      );
      this.hasChunks = !!(
        (Array.isArray(docContent.translatedChunks) && docContent.translatedChunks.length > 0) ||
        (Array.isArray(docContent.ocrChunks) && docContent.ocrChunks.length > 0) ||
        (docContent.translation && docContent.translation.length > 0) ||
        (docContent.ocr && docContent.ocr.length > 0) ||
        (Array.isArray(window.data?.translatedChunks) && window.data.translatedChunks.length > 0) ||
        (Array.isArray(window.data?.ocrChunks) && window.data.ocrChunks.length > 0) ||
        (window.data?.translation && window.data.translation.length > 0) ||
        (window.data?.ocr && window.data.ocr.length > 0)
      );

      console.log('[ReActEngine] 文件狀態 - 意群:', this.hasSemanticGroups, ', 向量:', this.hasVectorIndex);

      // 使用 ContextBuilder 構建初始上下文
      return window.ContextBuilder.buildInitialContext(docContent);
    }

    /**
     * 檢測上下文是否為空（僅包含後設資料）
     */
    isContextEmpty(context) {
      if (!context || context.length < 100) return true;

      // 檢測是否只包含後設資料標記
      const hasMetadata = context.includes('=== DOCUMENT METADATA ===');
      const hasCritical = context.includes('=== CRITICAL ===');
      const hasActualContent = context.length > 800; // 超過800字元說明有實際內容

      return hasMetadata && hasCritical && !hasActualContent;
    }

    /**
     * 檢測是否存在重複工具呼叫
     */
    hasRepeatedCalls(toolResults) {
      if (toolResults.length < 2) return false;

      const lastCall = toolResults[toolResults.length - 1];
      const secondLastCall = toolResults[toolResults.length - 2];

      // 檢查工具名稱和引數是否相同
      if (lastCall.tool !== secondLastCall.tool) return false;

      const lastParams = JSON.stringify(lastCall.params);
      const secondLastParams = JSON.stringify(secondLastCall.params);

      return lastParams === secondLastParams;
    }

    /**
     * 檢測最後一次工具呼叫是否返回空結果
     */
    checkEmptyResults(toolResults) {
      if (toolResults.length === 0) return false;

      const lastResult = toolResults[toolResults.length - 1];

      // 檢查結果是否為空
      if (!lastResult.result || !lastResult.result.success) return false;

      const results = lastResult.result.results;
      if (!results) return false;

      // 陣列為空或長度為0
      return Array.isArray(results) && results.length === 0;
    }

    /**
     * 分析資訊充足性（修復：支援 grep 的 matches 欄位）
     */
    analyzeInformationSufficiency(toolResults, question) {
      if (toolResults.length === 0) return 'insufficient';

      // 計算總檢索內容長度
      let totalContentLength = 0;
      let successfulCalls = 0;
      let itemsFound = 0;

      for (const result of toolResults) {
        if (!result.result || !result.result.success) continue;

        // 支援不同工具的返回格式
        let items = null;
        if (result.result.results) {
          // vector_search, keyword_search, search_semantic_groups
          items = result.result.results;
        } else if (result.result.matches) {
          // grep, regex_search
          items = result.result.matches;
        } else if (result.result.text) {
          // fetch, fetch_group_text
          items = [{ text: result.result.text }];
        }

        if (items && items.length > 0) {
          totalContentLength += JSON.stringify(items).length;
          successfulCalls++;
          itemsFound += items.length;
        }
      }

      console.log(`[ReActEngine] 資訊充足性分析 - 總內容長度: ${totalContentLength}, 成功呼叫: ${successfulCalls}/${toolResults.length}, 檢索到 ${itemsFound} 條結果`);

      // 啟發式判斷（更寬鬆的閾值，因為去重後內容會減少）
      if (successfulCalls >= 2 && totalContentLength > 1500) {
        return 'likely_sufficient'; // 很可能足夠
      } else if (successfulCalls >= 1 && totalContentLength > 800) {
        return 'maybe_sufficient'; // 可能足夠
      } else {
        return 'insufficient'; // 不足
      }
    }

    /**
     * 總結已檢索的內容（用於警告提示）
     */
    summarizeRetrievedContent(toolResults) {
      const summaryParts = [];
      let totalItems = 0;

      for (const result of toolResults) {
        if (!result.result || !result.result.success) continue;

        const tool = result.tool;
        let count = 0;

        if (result.result.results) {
          count = result.result.results.length;
        } else if (result.result.matches) {
          count = result.result.matches.length;
        } else if (result.result.text) {
          count = 1;
        }

        if (count > 0) {
          totalItems += count;
          summaryParts.push(`${count} items from ${tool}`);
        }
      }

      if (summaryParts.length === 0) {
        return 'No content retrieved yet';
      }

      return `${totalItems} total items (${summaryParts.join(', ')})`;
    }

    /**
     * 推理階段（簡化版，移除所有強制性規則）
     */
    async reasoning(systemPrompt, conversationHistory, currentContext, userQuestion, toolResults = []) {
      // 構建推理提示詞（簡化版）
      const reasoningPrompt = this.buildReasoningPrompt(
        currentContext,
        userQuestion,
        toolResults
      );

      this.emit('reasoning_start', { prompt: reasoningPrompt });

      // 增強的系統提示詞
      const enhancedSystemPrompt = systemPrompt + '\n\n' + this.getSystemPrompt();

      // 呼叫 LLM
      const response = await this.callLLM(enhancedSystemPrompt, conversationHistory, reasoningPrompt);

      this.emit('reasoning_complete', { response });

      // 使用增強的 JSON 解析器
      return window.ReActJsonParser.parse(response);
    }

    /**
     * 構建推理提示詞（智慧版，動態新增警告）
     */
    buildReasoningPrompt(context, question, toolResults) {
      const parts = [];
      const iteration = toolResults.length + 1;

      // 1. 使用者問題（始終簡潔）
      parts.push('========================================');
      parts.push('使用者問題：');
      parts.push(question);
      parts.push('========================================');
      parts.push('');

      // 2. 當前已知資訊
      parts.push('---');
      parts.push('當前已知資訊:');
      parts.push(context);
      parts.push('');

      // 3. 工具呼叫歷史（如果有）
      if (toolResults.length > 0) {
        parts.push('工具呼叫歷史:');
        toolResults.forEach((result, idx) => {
          parts.push(`${idx + 1}. ${result.tool}(${JSON.stringify(result.params)})`);
          const resultStr = JSON.stringify(result.result);
          parts.push(`   結果: ${resultStr.length > 300 ? resultStr.slice(0, 300) + '...' : resultStr}`);
        });
        parts.push('');
      }

      // ===== 智慧警告系統 =====
      const warnings = [];

      // 檢測 1：首輪強制檢索（更嚴格）
      if (iteration === 1) {
        warnings.push('🚨 CRITICAL - FIRST ITERATION:');
        warnings.push('   - The context contains NO document content, only metadata');
        warnings.push('   - You MUST call a tool in this iteration');
        warnings.push('   - DO NOT return action: "answer" in the first iteration');
        warnings.push('   - DO NOT ask the user for more details');
        warnings.push('   - Choose appropriate search keywords based on the question and start retrieving');
        console.log('[ReActEngine] 首輪迭代，強制要求呼叫工具');
      }

      // 檢測 2：重複工具呼叫
      if (this.hasRepeatedCalls(toolResults)) {
        warnings.push('⚠️ You are repeating the same tool call with the same parameters. Consider trying a different tool, different parameters, or providing an answer based on available information.');
        console.log('[ReActEngine] 檢測到重複工具呼叫，新增警告');
      }

      // 檢測 3：空結果
      if (this.checkEmptyResults(toolResults)) {
        warnings.push('💡 Your last search returned no results. This may mean the information doesn\'t exist in the document, or you need different search terms. Consider answering based on available information or trying a different approach.');
        console.log('[ReActEngine] 檢測到空結果，新增提示');
      }

      // 檢測 4：資訊充足性（強化版 - 明確告訴 LLM 已檢索到什麼）
      const sufficiency = this.analyzeInformationSufficiency(toolResults, question);
      if (sufficiency === 'likely_sufficient' || sufficiency === 'maybe_sufficient') {
        const summary = this.summarizeRetrievedContent(toolResults);
        warnings.push(`💡 INFORMATION RETRIEVED SUMMARY:`);
        warnings.push(`   - You have made ${toolResults.length} tool calls`);
        warnings.push(`   - Retrieved content includes: ${summary}`);
        warnings.push(`   - CRITICAL: Review the "當前已知資訊" section above`);
        warnings.push(`   - If the information is sufficient to answer the question, provide an answer NOW`);
        warnings.push(`   - DO NOT say "文件內容尚未載入" if you can see content above`);
        console.log('[ReActEngine] 資訊可能充足，新增強化提示');
      }

      // 檢測 5：接近迭代上限
      if (iteration >= this.maxIterations - 1) {
        warnings.push(`🚨 FINAL ITERATION WARNING:`);
        warnings.push(`   - This is iteration ${iteration}/${this.maxIterations}`);
        warnings.push(`   - You MUST provide an answer based on available information`);
        warnings.push(`   - Even partial information is better than no answer`);
        warnings.push(`   - DO NOT end without attempting to answer`);
        console.log('[ReActEngine] 接近迭代上限，新增緊急警告');
      }

      // 如果有警告，插入警告區塊
      if (warnings.length > 0) {
        parts.push('=== SYSTEM NOTICES ===');
        warnings.forEach(w => parts.push(w));
        parts.push('');
        console.log(`[ReActEngine] 第${iteration}輪推理，觸發${warnings.length}個警告`);
      }

      // 4. 工具指南
      parts.push(this.getToolGuidelines(this.hasSemanticGroups, this.hasVectorIndex, this.hasChunks));
      parts.push('');

      // 5. 決策提示（根據迭代輪次調整）
      parts.push('---');
      if (iteration === 1) {
        parts.push('**第一輪決策（必須呼叫工具）**：');
        parts.push('- 分析使用者問題，提取關鍵概念');
        parts.push('- 選擇合適的工具和檢索關鍵詞');
        parts.push('- 返回 JSON 格式：{ "action": "use_tool", "thought": "...", "tool": "...", "params": {...} }');
      } else {
        parts.push('**後續輪次決策**：');
        parts.push('- 如果檢索到的內容足夠回答問題 → 返回答案');
        parts.push('- 如果需要更多資訊 → 繼續呼叫工具檢索');
        parts.push('- 返回 JSON 格式的決策');
      }
      parts.push('');

      return parts.join('\n');
    }

    /**
     * 呼叫 LLM
     */
    async callLLM(systemPrompt, conversationHistory, userPrompt) {
      if (!window.llmCaller) {
        throw new Error('LLMCaller未載入');
      }

      try {
        const response = await window.llmCaller.call(
          systemPrompt,
          conversationHistory,
          userPrompt,
          {
            externalConfig: this.llmConfig,
            timeout: 60000
          }
        );
        return response;
      } catch (error) {
        console.error('[ReActEngine] LLM呼叫失敗:', error);
        throw error;
      }
    }

    /**
     * 執行 ReAct 迴圈（核心流程）
     */
    async *run(userQuestion, docContent, systemPrompt, conversationHistory = []) {
      this.emit('session_start', { question: userQuestion });

      // 構建初始上下文
      let context = this.buildInitialContext(docContent);
      const toolResults = [];
      let iterations = 0;
      const reactLog = []; // Store the execution log

      console.log('[ReActEngine] 初始上下文長度:', context.length);

      yield { type: 'context_initialized', context: context.slice(0, 500) + '...', reactLog };

      while (iterations < this.maxIterations) {
        iterations++;

        const iterationPayload = { type: 'iteration_start', iteration: iterations, maxIterations: this.maxIterations };
        yield iterationPayload;
        this.emit('iteration_start', iterationPayload);
        yield { type: 'reasoning_start', iteration: iterations };

        let decision;
        try {
          decision = await this.reasoning(
            systemPrompt,
            conversationHistory,
            context,
            userQuestion,
            toolResults
          );
        } catch (error) {
          this.emit('error', { error: error.message || String(error), iteration: iterations });
          yield {
            type: 'error',
            error: '推理失敗: ' + (error.message || String(error)),
            iteration: iterations
          };
          break;
        }

        if (decision.thought) {
            reactLog.push({
                type: 'thought',
                iteration: iterations,
                content: decision.thought
            });
        }

        yield {
          type: 'reasoning_complete',
          iteration: iterations,
          thought: decision.thought,
          action: decision.action,
          reactLog
        };

        // 判斷是回答還是使用工具
        if (decision.action === 'answer') {
          const finalPayload = {
            type: 'final_answer',
            answer: decision.answer,
            iterations: iterations,
            toolCallCount: toolResults.length,
            reactLog
          };
          yield finalPayload;
          this.emit('final_answer', finalPayload);
          this.emit('session_complete', { answer: decision.answer, iterations, reactLog });
          return;
        }

        // 執行工具呼叫（支援並行）
        if (decision.action === 'use_tool') {
          const toolCalls = decision.parallel
            ? decision.tool_calls
            : [{ tool: decision.tool, params: decision.params }];

          // 傳送工具呼叫開始事件
          for (const call of toolCalls) {
            reactLog.push({
                type: 'action',
                iteration: iterations,
                tool: call.tool,
                params: call.params
            });

            const startPayload = {
              type: 'tool_call_start',
              iteration: iterations,
              tool: call.tool,
              params: call.params,
              parallel: decision.parallel,
              totalCalls: toolCalls.length,
              reactLog
            };
            yield startPayload;
            this.emit('tool_call_start', startPayload);
          }

          // 並行執行所有工具
          const executePromises = toolCalls.map(async (call) => {
            let toolResult;
            try {
              toolResult = await this.toolRegistry.execute(call.tool, call.params);
            } catch (error) {
              toolResult = {
                success: false,
                error: error.message || String(error)
              };
            }

            return {
              tool: call.tool,
              params: call.params,
              result: toolResult
            };
          });

          const completedCalls = await Promise.all(executePromises);

          // 傳送工具呼叫完成事件
          for (const call of completedCalls) {
            reactLog.push({
                type: 'observation',
                iteration: iterations,
                result: call.result
            });

            const completePayload = {
              type: 'tool_call_complete',
              iteration: iterations,
              tool: call.tool,
              params: call.params,
              result: call.result,
              parallel: decision.parallel,
              reactLog
            };
            yield completePayload;
            this.emit('tool_call_complete', completePayload);
          }

          // 更新上下文（支援去重）
          for (const call of completedCalls) {
            const newContext = window.ContextBuilder.formatToolResult(
              call.tool,
              call.result,
              this.seenContentHashes,
              this.seenContentSummaries
            );
            context += '\n\n' + newContext;

            toolResults.push({
              tool: call.tool,
              params: call.params,
              result: call.result
            });
          }

          // Token預算檢查
          const contextTokens = this.budgetManager.estimate(context);
          const budgetLimit = this.budgetManager.allocation.context;

          if (contextTokens > budgetLimit) {
            const prunedPayload = {
              type: 'context_pruned',
              before: contextTokens,
              after: budgetLimit,
              iteration: iterations
            };
            yield prunedPayload;
            this.emit('context_pruned', prunedPayload);
            context = window.ContextBuilder.pruneContext(context, budgetLimit);
          }

          yield {
            type: 'context_updated',
            iteration: iterations,
            contextSize: context.length,
            estimatedTokens: this.budgetManager.estimate(context),
            parallelCallsCount: decision.parallel ? toolCalls.length : 0
          };
        }
      }

      // 達到最大迭代次數
      yield {
        type: 'max_iterations_reached',
        iterations: this.maxIterations,
        toolCallCount: toolResults.length
      };

      const fallbackAnswer = `經過 ${iterations} 輪推理，我收集到了一些資訊，但未能在迭代限制內得出完整答案。\n\n基於當前資訊：\n\n${context.slice(0, 2000)}\n\n建議：\n1. 提供更具體的問題\n2. 或嘗試增加迭代次數限制`;

      const fallbackPayload = {
        type: 'final_answer',
        answer: fallbackAnswer,
        iterations: iterations,
        toolCallCount: toolResults.length,
        fallback: true,
        reactLog
      };
      yield fallbackPayload;
      this.emit('final_answer', fallbackPayload);

      this.emit('session_complete', { answer: fallbackAnswer, iterations, fallback: true, reactLog });
    }
  }

  // 匯出到全域
  window.ReActEngine = ReActEngine;

  console.log('[ReActEngine] 核心引擎已載入');

})(window);
