// tool-registry.js
// 工具登入檔（從 react-engine.js 提取）

(function(window) {
  'use strict';

  /**
   * 工具登入檔
   * 管理所有可用的檢索工具
   */
  class ToolRegistry {
    constructor() {
      this.tools = new Map();
      this.registerBuiltinTools();
    }

    /**
     * 註冊內建工具
     */
    registerBuiltinTools() {
      // === 搜尋工具類 ===

      // 1. 向量語義搜尋
      this.register({
        name: 'vector_search',
        description: '智慧語義搜尋，理解同義詞、相關概念、隱含關係。適合概念性、開放性、探索性問題。',
        parameters: {
          query: { type: 'string', description: '語義描述或問題' },
          limit: { type: 'number', description: '返回結果數量', default: 10 }
        },
        execute: async (params) => {
          if (!window.SemanticVectorSearch || !window.SemanticVectorSearch.search) {
            return {
              success: false,
              error: '向量搜尋功能未啟用，建議使用 keyword_search 或 grep'
            };
          }

          if (!window.data?.vectorIndex && !window.data?.semanticGroups) {
            return {
              success: false,
              error: '向量索引未構建，建議使用 keyword_search 或 grep'
            };
          }

          try {
            const results = await window.SemanticVectorSearch.search(params.query, params.limit || 10);
            return {
              success: true,
              count: results.length,
              results: results.map(r => ({
                groupId: r.groupId,
                score: r.score,
                text: r.text,
                keywords: r.keywords
              }))
            };
          } catch (error) {
            return {
              success: false,
              error: `向量搜尋失敗: ${error.message}`
            };
          }
        }
      });

      // 2. BM25關鍵詞搜尋
      this.register({
        name: 'keyword_search',
        description: '多關鍵詞加權搜尋（BM25演算法）。適用於精確查詢特定關鍵片語合。',
        parameters: {
          keywords: { type: 'array', description: '關鍵詞陣列，如["詞1", "詞2"]' },
          limit: { type: 'number', description: '返回結果數量', default: 8 }
        },
        execute: async (params) => {
          if (!window.BM25Search || !window.BM25Search.search) {
            return {
              success: false,
              error: 'BM25搜尋功能未載入，建議使用 grep'
            };
          }

          if (!window.data?.semanticGroups && !window.data?.ocrChunks && !window.data?.translatedChunks) {
            return {
              success: false,
              error: '文件chunks未生成，建議使用 grep'
            };
          }

          try {
            const results = await window.BM25Search.search(params.keywords, params.limit || 8);
            return {
              success: true,
              count: results.length,
              results: results.map(r => ({
                groupId: r.groupId,
                score: r.score,
                text: r.text,
                matchedKeywords: r.matchedKeywords
              }))
            };
          } catch (error) {
            return {
              success: false,
              error: `BM25搜尋失敗: ${error.message}`
            };
          }
        }
      });

      // 3. GREP字面文字搜尋
      this.register({
        name: 'grep',
        description: '字面文字搜尋（精確比對）。支援OR邏輯（用|分隔多個關鍵詞，如"詞1|詞2|詞3"）。',
        parameters: {
          query: { type: 'string', description: '搜尋關鍵詞或短語' },
          limit: { type: 'number', description: '返回結果數量', default: 20 },
          context: { type: 'number', description: '上下文長度（字元數）', default: 2000 },
          caseInsensitive: { type: 'boolean', description: '是否忽略大小寫', default: true }
        },
        execute: async (params) => {
          const docContent = (window.data?.translation || window.data?.ocr || '');
          if (!docContent) {
            return { success: false, error: '文件內容為空' };
          }

          const query = params.query || '';
          const limit = params.limit || 20;
          const context = params.context || 2000;
          const caseInsensitive = params.caseInsensitive !== false;

          const results = [];
          const keywords = query.split('|').map(k => k.trim()).filter(k => k);

          for (const keyword of keywords) {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseInsensitive ? 'gi' : 'g');
            let match;
            while ((match = regex.exec(docContent)) !== null && results.length < limit) {
              const start = Math.max(0, match.index - context);
              const end = Math.min(docContent.length, match.index + keyword.length + context);
              results.push({
                keyword: keyword,
                position: match.index,
                preview: docContent.slice(start, end)
              });

              if (match.index === regex.lastIndex) regex.lastIndex++;
            }

            if (results.length >= limit) break;
          }

          return {
            success: true,
            count: results.length,
            matches: results
          };
        }
      });

      // 4. 正規表示式搜尋
      this.register({
        name: 'regex_search',
        description: '正規表示式搜尋，比對特定格式。適用於：日期、編號、公式參考、圖表標註等。',
        parameters: {
          pattern: { type: 'string', description: '正規表示式模式（需轉義特殊字元）' },
          limit: { type: 'number', description: '返回結果數量', default: 10 },
          context: { type: 'number', description: '上下文長度（字元數）', default: 1500 }
        },
        execute: async (params) => {
          if (!window.AdvancedSearchTools || !window.AdvancedSearchTools.regexSearch) {
            return { success: false, error: 'AdvancedSearchTools未載入' };
          }

          const docContent = (window.data?.translation || window.data?.ocr || '');
          if (!docContent) {
            return { success: false, error: '文件內容為空' };
          }

          try {
            const results = window.AdvancedSearchTools.regexSearch(
              params.pattern,
              docContent,
              {
                limit: params.limit || 10,
                context: params.context || 1500
              }
            );

            return {
              success: true,
              count: results.length,
              matches: results
            };
          } catch (error) {
            return {
              success: false,
              error: error.message || '正則搜尋失敗'
            };
          }
        }
      });

      // 5. 布林邏輯搜尋
      this.register({
        name: 'boolean_search',
        description: '布林邏輯搜尋（支援AND/OR/NOT和括號）。語法示例："(詞1 OR 詞2) AND 詞3 NOT 詞4"',
        parameters: {
          query: { type: 'string', description: '布林查詢表示式' },
          limit: { type: 'number', description: '返回結果數量', default: 10 },
          context: { type: 'number', description: '上下文長度（字元數）', default: 1500 }
        },
        execute: async (params) => {
          if (!window.AdvancedSearchTools || !window.AdvancedSearchTools.booleanSearch) {
            return { success: false, error: 'AdvancedSearchTools未載入' };
          }

          const docContent = (window.data?.translation || window.data?.ocr || '');
          if (!docContent) {
            return { success: false, error: '文件內容為空' };
          }

          try {
            const results = window.AdvancedSearchTools.booleanSearch(
              params.query,
              docContent,
              {
                limit: params.limit || 10,
                context: params.context || 1500
              }
            );

            return {
              success: true,
              count: results.length,
              matches: results
            };
          } catch (error) {
            return {
              success: false,
              error: error.message || '布林搜尋失敗'
            };
          }
        }
      });

      // === 意群工具類 ===

      // 6. 搜尋意群
      this.register({
        name: 'search_semantic_groups',
        description: '在文件的語義意群中搜尋相關內容。返回意群ID、摘要和關鍵詞。',
        parameters: {
          query: { type: 'string', description: '搜尋查詢' },
          limit: { type: 'number', description: '返回結果數量', default: 5 }
        },
        execute: async (params) => {
          if (!window.SemanticTools) {
            return {
              success: false,
              error: 'SemanticTools未載入，建議使用 grep'
            };
          }

          if (!window.data?.semanticGroups || window.data.semanticGroups.length === 0) {
            return {
              success: false,
              error: '文件意群未生成，建議使用 grep 或 vector_search'
            };
          }

          const results = window.SemanticTools.searchGroups(params.query, params.limit || 5);
          return {
            success: true,
            results: results.map(r => ({
              groupId: r.groupId,
              summary: r.summary,
              keywords: r.keywords,
              charCount: r.charCount
            }))
          };
        }
      });

      // 7. 獲取意群詳細內容
      this.register({
        name: 'fetch_group_text',
        description: '獲取指定意群的詳細文字內容。granularity可選：summary(摘要), digest(精華), full(全文)。',
        parameters: {
          groupId: { type: 'string', description: '意群ID' },
          granularity: { type: 'string', description: '詳細程度', default: 'digest', enum: ['summary', 'digest', 'full'] }
        },
        execute: async (params) => {
          if (!window.SemanticTools) {
            throw new Error('SemanticTools未載入');
          }
          const result = window.SemanticTools.fetchGroupText(params.groupId, params.granularity || 'digest');
          return {
            success: true,
            groupId: result.groupId,
            granularity: result.granularity,
            text: result.text,
            charCount: result.text.length
          };
        }
      });

      // 8. 獲取意群完整資訊
      this.register({
        name: 'fetch',
        description: '獲取意群的完整詳細資訊（包含完整論述、公式、資料、圖表、結構資訊）。',
        parameters: {
          groupId: { type: 'string', description: '意群ID' }
        },
        execute: async (params) => {
          if (!window.SemanticTools || !window.SemanticTools.fetchGroupDetailed) {
            throw new Error('SemanticTools.fetchGroupDetailed未載入');
          }
          const result = window.SemanticTools.fetchGroupDetailed(params.groupId);
          return {
            success: true,
            groupId: result.groupId,
            text: result.text,
            structure: result.structure,
            keywords: result.keywords,
            summary: result.summary,
            digest: result.digest,
            charCount: result.charCount
          };
        }
      });

      // 9. 文件結構地圖
      this.register({
        name: 'map',
        description: '獲取文件整體結構地圖（意群ID、字數、關鍵詞、摘要、章節/圖表/公式）。適用於瞭解文件整體脈絡。',
        parameters: {
          limit: { type: 'number', description: '返回意群數量', default: 50 },
          includeStructure: { type: 'boolean', description: '是否包含結構資訊（章節、圖表等）', default: true }
        },
        execute: async (params) => {
          if (!window.SemanticTools) {
            return {
              success: false,
              error: 'SemanticTools未載入，可嘗試使用 grep'
            };
          }

          const groups = window.data?.semanticGroups || [];

          if (groups.length === 0) {
            return {
              success: false,
              error: '文件意群未生成，建議使用 grep 或 vector_search'
            };
          }

          const limit = Math.min(params.limit || 50, groups.length);
          const includeStructure = params.includeStructure !== false;

          const mapData = groups.slice(0, limit).map(g => {
            const entry = {
              groupId: g.groupId,
              charCount: g.charCount || 0,
              keywords: g.keywords || [],
              summary: g.summary || ''
            };

            if (includeStructure && g.structure) {
              entry.structure = {
                sections: g.structure.sections || [],
                figures: g.structure.figures || [],
                formulas: g.structure.formulas || [],
                tables: g.structure.tables || []
              };
            }

            return entry;
          });

          return {
            success: true,
            totalGroups: groups.length,
            returnedGroups: mapData.length,
            docGist: window.data?.semanticDocGist || '',
            map: mapData
          };
        }
      });

      // 10. 列出所有意群概覽
      this.register({
        name: 'list_all_groups',
        description: '列出文件中所有意群的概覽資訊（ID、關鍵詞、摘要）。',
        parameters: {
          limit: { type: 'number', description: '返回數量限制', default: 20 },
          includeDigest: { type: 'boolean', description: '是否包含精華摘要', default: false }
        },
        execute: async (params) => {
          if (!window.SemanticTools) {
            throw new Error('SemanticTools未載入');
          }
          const results = window.SemanticTools.listGroups(params.limit || 20, params.includeDigest || false);
          return {
            success: true,
            count: results.length,
            groups: results
          };
        }
      });
    }

    /**
     * 註冊新工具
     */
    register(tool) {
      if (!tool.name || !tool.execute) {
        throw new Error('工具必須包含name和execute欄位');
      }
      this.tools.set(tool.name, tool);
    }

    /**
     * 獲取所有工具定義
     */
    getToolDefinitions() {
      return Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));
    }

    /**
     * 根據文件狀態獲取可用的工具定義（動態過濾）
     */
    getAvailableToolDefinitions(hasSemanticGroups = false, hasVectorIndex = false, hasChunks = false) {
      const allTools = Array.from(this.tools.values());

      const requiresSemanticGroups = ['search_semantic_groups', 'fetch_group_text', 'fetch', 'map', 'list_all_groups'];
      const requiresVectorIndex = ['vector_search'];
      const requiresChunks = ['keyword_search'];

      const availableTools = allTools.filter(tool => {
        if (requiresSemanticGroups.includes(tool.name)) {
          return hasSemanticGroups;
        }
        if (requiresVectorIndex.includes(tool.name)) {
          return hasVectorIndex;
        }
        if (requiresChunks.includes(tool.name)) {
          return hasSemanticGroups || hasChunks;
        }
        return true;
      });

      return availableTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));
    }

    /**
     * 執行工具
     */
    async execute(toolName, params) {
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`未找到工具: ${toolName}`);
      }
      try {
        return await tool.execute(params);
      } catch (error) {
        return {
          success: false,
          error: error.message || String(error)
        };
      }
    }
  }

  // 匯出到全域
  window.ToolRegistry = ToolRegistry;

  console.log('[ToolRegistry] 模組已載入');

})(window);
