// context-builder.js
// 上下文構建器 - 改進初始上下文策略

(function(window) {
  'use strict';

  class ContextBuilder {
    /**
     * 簡單字串雜湊（用於內容去重）
     */
    static simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return hash.toString(36);
    }

    /**
     * 構建初始上下文（改進策略：包含文件摘要）
     * @param {Object} docContent - 文件內容物件
     * @returns {string} 初始上下文
     */
    static buildInitialContext(docContent) {
      const parts = [];

      // 1. 文件基本資訊
      parts.push('=== 文件資訊 ===');
      parts.push(`名稱: ${docContent.name || '未知'}`);

      if (docContent.pageCount) {
        parts.push(`頁數: ${docContent.pageCount}`);
      }
      if (docContent.language) {
        parts.push(`語言: ${docContent.language}`);
      }
      parts.push('');

      // 2. 文件狀態（決定可用工具）
      // 優先檢查 docContent 傳入的資料，回退到 window.data
      const hasSemanticGroups = (
        (Array.isArray(docContent.semanticGroups) && docContent.semanticGroups.length > 0) ||
        (Array.isArray(window.data?.semanticGroups) && window.data.semanticGroups.length > 0)
      );

      const hasVectorIndex = !!(
        window.data?.vectorIndexReady ||
        window.data?.vectorIndex ||
        docContent.vectorIndexReady ||
        docContent.vectorIndex
      );

      const groupCount = docContent.semanticGroups?.length || window.data?.semanticGroups?.length || 0;

      parts.push('=== 可用工具 ===');
      if (hasSemanticGroups) {
        parts.push(`✓ 結構化工具: map, search_semantic_groups, fetch (共 ${groupCount} 個意群)`);
      } else {
        parts.push('✗ 結構化工具不可用（意群未生成）');
      }

      if (hasVectorIndex) {
        parts.push('✓ 語義搜尋: vector_search');
      } else {
        parts.push('✗ 語義搜尋不可用（向量索引未構建）');
      }

      parts.push('✓ 精確搜尋: grep, keyword_search, regex_search, boolean_search (始終可用)');
      parts.push('');

      // 3. 強制檢索說明（參考 Roo Code 風格）
      parts.push('=== 當前狀態 ===');
      parts.push('文件內容尚未載入到上下文中。');
      parts.push('');
      parts.push('你必須使用上述工具檢索文件內容。在檢索到相關內容之前，不要嘗試回答使用者問題。');
      parts.push('');

      return parts.join('\n');
    }

    /**
     * 格式化工具結果為上下文（支援去重）
     * @param {string} toolName - 工具名稱
     * @param {Object} result - 工具執行結果
     * @param {Set} seenHashes - 已見過的內容雜湊
     * @param {Map} seenSummaries - 雜湊 -> 摘要對映
     * @returns {string} 格式化後的上下文
     */
    static formatToolResult(toolName, result, seenHashes = new Set(), seenSummaries = new Map()) {
      const parts = [`【工具: ${toolName}】`];

      if (!result.success) {
        parts.push(`錯誤: ${result.error}`);
        return parts.join('\n');
      }

      switch (toolName) {
        case 'vector_search':
          parts.push(`找到 ${result.count || 0} 個語義相關結果:`);
          if (result.results && result.results.length > 0) {
            result.results.forEach((r, idx) => {
              parts.push(`${idx + 1}. [${r.groupId}] (相關度: ${(r.score || 0).toFixed(2)})`);
              parts.push(`   ${(r.text || '').slice(0, 200)}...`);
            });
          }
          break;

        case 'keyword_search':
          parts.push(`找到 ${result.count || 0} 個比對結果:`);
          if (result.results && result.results.length > 0) {
            result.results.forEach((r, idx) => {
              parts.push(`${idx + 1}. [${r.groupId}] (評分: ${(r.score || 0).toFixed(2)})`);
              parts.push(`   ${(r.text || '').slice(0, 200)}...`);
            });
          }
          break;

        case 'grep':
          parts.push(`找到 ${result.count || 0} 處比對:`);
          if (result.matches && result.matches.length > 0) {
            let newCount = 0;
            let duplicateCount = 0;

            result.matches.slice(0, 10).forEach((m) => {
              const preview = (m.preview || '').slice(0, 300);
              const hash = this.simpleHash(preview);

              if (seenHashes.has(hash)) {
                // 已見過此內容，只顯示參考
                duplicateCount++;
              } else {
                // 新內容，展示並記錄
                newCount++;
                seenHashes.add(hash);
                const summary = preview.slice(0, 80) + '...';
                seenSummaries.set(hash, summary);
                parts.push(`${newCount}. ${preview}`);
              }
            });

            if (duplicateCount > 0) {
              parts.push(`\n[已省略 ${duplicateCount} 個重複片段]`);
            }
          }
          break;

        case 'search_semantic_groups':
          parts.push(`找到 ${result.results?.length || 0} 個相關意群:`);
          if (result.results && result.results.length > 0) {
            result.results.forEach((r, idx) => {
              parts.push(`${idx + 1}. [${r.groupId}] ${r.keywords?.join(', ') || ''}`);
              parts.push(`   ${(r.summary || '').slice(0, 150)}...`);
            });
          }
          break;

        case 'fetch':
        case 'fetch_group_text':
          parts.push(`意群 [${result.groupId}]:`);
          parts.push(`字數: ${result.charCount || result.text?.length || 0}`);
          parts.push('');
          parts.push((result.text || '').slice(0, 1500));
          if ((result.text || '').length > 1500) {
            parts.push('...(內容較長，已截斷)');
          }
          break;

        case 'map':
          parts.push(`文件結構 (${result.returnedGroups}/${result.totalGroups} 個意群):`);
          if (result.map && result.map.length > 0) {
            result.map.forEach((g, idx) => {
              parts.push(`${idx + 1}. [${g.groupId}] ${g.charCount}字 - ${g.keywords?.join(', ') || ''}`);
            });
          }
          break;

        default:
          parts.push(JSON.stringify(result, null, 2).slice(0, 500));
      }

      return parts.join('\n');
    }

    /**
     * 裁剪上下文以適應 token 預算
     * @param {string} context - 當前上下文
     * @param {number} maxTokens - 最大 token 數
     * @returns {string} 裁剪後的上下文
     */
    static pruneContext(context, maxTokens) {
      const targetChars = Math.floor(maxTokens * 2.5); // 粗略估算

      if (context.length <= targetChars) {
        return context;
      }

      // 保留前 30% 和後 50%（保留更多最新資訊）
      const keepStart = Math.floor(targetChars * 0.3);
      const keepEnd = Math.floor(targetChars * 0.5);

      const startPart = context.slice(0, keepStart);
      const endPart = context.slice(-keepEnd);

      return startPart + '\n\n[...中間部分已省略以節省空間...]\n\n' + endPart;
    }
  }

  // 匯出到全域
  window.ContextBuilder = ContextBuilder;

  console.log('[ContextBuilder] 模組已載入');

})(window);
