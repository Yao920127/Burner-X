// js/chatbot/agents/semantic-grouper.js
// -----------------------------------------
// 意群聚合模組：將現有翻譯分段聚合成更大的語義意群
// 用於長文件（>5萬字）的智慧分段處理

(function(window) {
  'use strict';

  /**
   * 帶重試的LLM呼叫包裝器（指數退避 + 抖動）
   * - 重試條件：408/429/5xx 或明顯的網路錯誤
   * - 預設為 3 次重試，基準延遲 600ms，上限 5000ms
   * @param {Function} fn - 要執行的非同步函式
   * @param {Object} opts
   * @param {number} opts.maxRetries
   * @param {number} opts.baseDelay
   * @param {number} opts.maxDelay
   * @returns {Promise<any>} 函式執行結果
   */
  async function retryWithBackoff(fn, opts = {}) {
    const extractStatusFromMessage = (msg) => {
      if (!msg) return undefined;
      const m = String(msg).match(/\b(\d{3})\b/);
      return m ? parseInt(m[1], 10) : undefined;
    };

    const shouldRetry = (err) => {
      const status = err && (err.status || extractStatusFromMessage(err.message));
      // 將 401/403 也視作可重試（上游號池問題）
      if (status === 401 || status === 403) return true;
      if (status === 408 || status === 429) return true;
      if (status >= 500 && status <= 599) return true;
      if (!status && (err?.name === 'TypeError' || /fetch|network|timeout/i.test(String(err && err.message)))) {
        return true; // 網路類錯誤
      }
      return false;
    };

    const maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : 3;
    const baseDelay = typeof opts.baseDelay === 'number' ? opts.baseDelay : 600;
    const maxDelay = typeof opts.maxDelay === 'number' ? opts.maxDelay : 5000;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }
        const jitter = Math.floor(Math.random() * 250);
        const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) + jitter;
        console.warn(`[SemanticGrouper] API呼叫失敗，${delay}ms後重試 (${attempt + 1}/${maxRetries})...`, error?.message || error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    if (lastError) throw lastError;
  }

  /**
   * 將分段陣列聚合成意群
   * @param {Array<string>} chunks - 原始分段陣列（ocrChunks 或 translatedChunks）
   * @param {Object} options - 配置選項
   * @param {number} options.targetChars - 目標字數（預設 5000）
   * @param {number} options.minChars - 最小字數（預設 2500）
   * @param {number} options.maxChars - 最大字數（預設 6000）
   * @param {Function} options.onProgress - 進度回撥函式 (current, total, message)
   * @returns {Promise<Object>} 返回 {groups: 意群陣列, enrichedChunks: 帶後設資料的chunks}
   */
  async function aggregateIntoSemanticGroups(chunks, options = {}) {
    const {
      targetChars = 5000,
      minChars = 2500,
      maxChars = 6000,
      concurrency = 20,  // 恢復預設並行數
      docContext = (window.data && window.data.semanticDocGist) ? window.data.semanticDocGist : '',
      onProgress = null
    } = options;

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      console.warn('[SemanticGrouper] 無效的輸入分段');
      return { groups: [], enrichedChunks: [] };
    }

    console.log(`[SemanticGrouper] 開始聚合 ${chunks.length} 個分段，目標字數: ${targetChars}`);

    // 建立帶後設資料的chunks
    const enrichedChunks = chunks.map((text, index) => ({
      chunkId: `chunk-${index}`,
      text: text,
      belongsToGroup: null, // 稍後填充
      position: index,
      charCount: text.length
    }));

    const candidates = [];
    let currentGroup = {
      segments: [],
      texts: [],
      charCount: 0
    };

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] || '';
      const chunkLength = chunk.length;

      // 決策邏輯：是否將當前塊加入當前組
      if (currentGroup.charCount > 0) {
        const potentialTotal = currentGroup.charCount + chunkLength;
        // 情況1：加入後仍在合理範圍內（不超過最大）
        if (potentialTotal <= maxChars) {
          currentGroup.segments.push(i);
          currentGroup.texts.push(chunk);
          currentGroup.charCount = potentialTotal;
          continue;
        }
        // 情況2：加入後超過最大限制 -> 完成當前組（最小要求為軟約束，允許 < min）
        candidates.push(currentGroup);
        currentGroup = {
          segments: [i],
          texts: [chunk],
          charCount: chunkLength
        };
        continue;
      } else {
        // 空組，直接加入
        currentGroup.segments.push(i);
        currentGroup.texts.push(chunk);
        currentGroup.charCount = chunkLength;
      }
    }

    // 處理最後一組
    if (currentGroup.segments.length > 0) {
      candidates.push(currentGroup);
    }

    console.log(`[SemanticGrouper] 初步分組完成，共 ${candidates.length} 個候選意群。開始並行處理，最大並行: ${concurrency}`);

    // 呼叫進度回撥：開始處理
    if (onProgress && typeof onProgress === 'function') {
      onProgress(0, candidates.length, '開始生成意群摘要和關鍵詞...');
    }

    const groups = await finalizeGroupsInParallel(candidates, concurrency, docContext, onProgress);

    // 更新enrichedChunks的belongsToGroup欄位
    groups.forEach(group => {
      group.segments.forEach(segmentIndex => {
        enrichedChunks[segmentIndex].belongsToGroup = group.groupId;
      });
    });

    console.log(`[SemanticGrouper] 聚合完成，生成 ${groups.length} 個意群`);

    return {
      groups: groups,
      enrichedChunks: enrichedChunks
    };
  }

  /**
   * 完成意群的處理（生成摘要和關鍵詞）
   * @param {Object} currentGroup - 當前意群
   * @param {Array} groups - 意群陣列
   */
  async function finalizeGroup(currentGroup, groupIndex, docContext) {
    const fullText = currentGroup.texts.join('\n\n');
    const groupId = `group-${groupIndex}`;

    console.log(`[SemanticGrouper] 處理意群 ${groupId}，包含 ${currentGroup.segments.length} 個分段，共 ${currentGroup.charCount} 字`);

    try {
      // 並行生成摘要、關鍵詞和結構化資訊
      const [summary, keywords, structure] = await Promise.all([
        generateSummary(fullText, 400, docContext), // 400字詳細摘要
        extractKeywords(fullText, docContext),
        extractStructure(fullText, docContext)      // 提取圖表、章節、要點
      ]);

      const result = {
        groupId,
        segments: currentGroup.segments,  // 保留原始分段索引
        charCount: currentGroup.charCount,
        summary,      // 400字詳細摘要
        keywords,     // 關鍵詞陣列
        structure,    // 結構化資訊（圖表、章節、要點）
        fullText      // 完整文字
      };

      console.log(`[SemanticGrouper] 意群 ${groupId} 處理完成:`, {
        segments: currentGroup.segments,
        charCount: currentGroup.charCount,
        keywords: (keywords || []).join(', '),
        figures: structure.figures?.length || 0,
        tables: structure.tables?.length || 0,
        sections: structure.sections?.length || 0
      });

      return result;
    } catch (error) {
      console.error(`[SemanticGrouper] 處理意群 ${groupId} 失敗:`, error);

      // 降級：不生成摘要，僅儲存基本資訊
      return {
        groupId,
        segments: currentGroup.segments,
        charCount: currentGroup.charCount,
        summary: `該意群包含 ${currentGroup.segments.length} 個分段，共 ${currentGroup.charCount} 字`,
        keywords: [],
        structure: { figures: [], tables: [], sections: [], keyPoints: [] },
        fullText,
        error: error.message
      };
    }
  }

  async function finalizeGroupsInParallel(candidates, concurrency, docContext, onProgress) {
    const results = new Array(candidates.length);
    let nextIndex = 0;
    let completedCount = 0;
    const total = candidates.length;

    async function runNext() {
      const i = nextIndex++;
      if (i >= candidates.length) return;

      // 新增隨機延遲，避免同時發起大量請求
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
      }

      results[i] = await finalizeGroup(candidates[i], i, docContext);

      // 更新進度
      completedCount++;
      if (onProgress && typeof onProgress === 'function') {
        onProgress(completedCount, total, `正在處理意群 ${completedCount}/${total}`);
      }

      return runNext();
    }

    const poolSize = Math.max(1, Math.min(concurrency || 1, candidates.length));
    const runners = [];
    for (let i = 0; i < poolSize; i++) {
      runners.push(runNext());
    }
    await Promise.all(runners);
    return results;
  }

  /**
   * 生成意群摘要
   * @param {string} text - 完整文字
   * @param {number} maxLength - 最大長度
   * @returns {Promise<string>} 摘要文字
   */
  async function generateSummary(text, maxLength, docContext = '') {
    // 檢查依賴
    if (!window.ChatbotCore || typeof window.ChatbotCore.singleChunkSummary !== 'function') {
      console.warn('[SemanticGrouper] ChatbotCore 未載入，使用截斷作為摘要');
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    try {
      const config = window.ChatbotCore.getChatbotConfig();
      const apiKey = config.apiKey;

      if (!apiKey) {
        throw new Error('未配置 API Key');
      }

      // 限制輸入文字長度（避免 token 過多）
      const inputText = text.length > 5000 ? text.substring(0, 5000) + '...' : text;

      const ctx = (docContext || '').slice(0, 1000);
      const prompt = `${ctx ? `背景（整篇文件總覽）：\n${ctx}\n\n` : ''}請用不超過${maxLength}字概括以下內容的核心要點，保持專業性和準確性：

${inputText}

要求：
1. 概括核心內容和主要觀點，並保持與背景一致性
2. ${maxLength <= 100 ? '極度精簡' : '突出重點'}
3. 不要新增"本段講述"等描述性字首`;

      // 使用重試包裝器
      const summary = await retryWithBackoff(async () => {
        return await window.ChatbotCore.singleChunkSummary(
          prompt,
          inputText,
          config,
          apiKey
        );
      }, { maxRetries: 3, baseDelay: 600, maxDelay: 5000 });

      return summary.trim();
    } catch (error) {
      console.error('[SemanticGrouper] 生成摘要失敗:', error);
      // 降級：使用截斷
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    }
  }

  /**
   * 提取關鍵詞
   * @param {string} text - 完整文字
   * @returns {Promise<Array<string>>} 關鍵詞陣列
   */
  async function extractKeywords(text, docContext = '') {
    if (!window.ChatbotCore || typeof window.ChatbotCore.singleChunkSummary !== 'function') {
      console.warn('[SemanticGrouper] ChatbotCore 未載入，無法提取關鍵詞');
      return [];
    }

    try {
      const config = window.ChatbotCore.getChatbotConfig();
      const apiKey = config.apiKey;

      if (!apiKey) {
        throw new Error('未配置 API Key');
      }

      const inputText = text.length > 3000 ? text.substring(0, 3000) + '...' : text;

      const ctx = (docContext || '').slice(0, 500);
      const prompt = `${ctx ? `背景（整篇文件總覽）：\n${ctx}\n\n` : ''}請從以下內容中提取4-6個最重要的關鍵詞，優先提取：
1. 專有名詞（公司名、人名、產品名、機構名、地名）
2. 核心概念（重要術語、技術名稱）
3. 主題詞（核心話題）

要求：
- **優先順序**：實體 > 專業術語 > 概念詞
- **具體性**：優先提取具體名稱（如"雷曼公司"而非"公司"）
- **完整性**：保留實體的完整表達（如"雷曼兄弟公司"而非拆分）
- 用逗號分隔，只返回關鍵詞列表，不要解釋

文件內容：
${inputText}`;

      // 使用重試包裝器
      const result = await retryWithBackoff(async () => {
        return await window.ChatbotCore.singleChunkSummary(
          prompt,
          inputText,
          config,
          apiKey
        );
      }, { maxRetries: 3, baseDelay: 600, maxDelay: 5000 });

      // 解析關鍵詞
      const keywords = result
        .split(/[,，、]/)
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length < 20)
        .slice(0, 5);

      return keywords;
    } catch (error) {
      console.error('[SemanticGrouper] 提取關鍵詞失敗:', error);
      return [];
    }
  }

  /**
   * 提取結構化資訊（圖表、章節、要點）
   * @param {string} text - 完整文字
   * @param {string} docContext - 文件上下文
   * @returns {Promise<Object>} 結構化資訊物件
   */
  async function extractStructure(text, docContext = '') {
    const structure = {
      orderedElements: [],  // 按文件順序的結構化元素
      // 保留舊格式用於相容
      figures: [],
      tables: [],
      sections: [],
      keyPoints: []
    };

    try {
      // 使用LLM提取有序的結構化資訊
      if (window.ChatbotCore && typeof window.ChatbotCore.singleChunkSummary === 'function') {
        const config = window.ChatbotCore.getChatbotConfig();
        const apiKey = config.apiKey;

        if (apiKey) {
          const inputText = text.length > 4000 ? text.substring(0, 4000) + '...' : text;
          const ctx = (docContext || '').slice(0, 500);
          const prompt = `${ctx ? `背景（文件總覽）：\n${ctx}\n\n` : ''}請按照文件順序，提取以下結構化資訊（每行一個，保持原文件順序）：

1. 大標題（章節主標題，如"第三章 XXX"）- 標記為 [TITLE]
2. 小節標題（如"3.1 XXX"）- 標記為 [SECTION]
3. 核心要點（重要論點或觀點，不超過30字）- 標記為 [POINT]
4. 圖片標題（如"圖3.1: XXX"）- 標記為 [FIGURE]
5. 表格標題（如"表3.1: XXX"）- 標記為 [TABLE]
6. 公式標題/說明（如"公式3.1: XXX"或"E=mc²"）- 標記為 [FORMULA]

格式示例：
[TITLE] 第三章 理想投資的判斷標準
[SECTION] 3.1 風險與收益的平衡
[POINT] 投資需要在風險與收益之間尋找最優平衡點
[FIGURE] 圖3.1: 風險收益曲線
[FORMULA] 公式3.1: 夏普比率 = (Rp - Rf) / σp
[TABLE] 表3.1: 不同資產類別的歷史表現

要求：
- **嚴格保持原文表達**：標題、圖表名稱、公式等必須完全參考原文，不要改寫或概括，這對後續關鍵詞搜尋至關重要
- 嚴格按照內容在文件中的出現順序提取
- 每個元素不超過50字
- 只提取最重要的10-15個元素
- 如果沒有某類元素，跳過即可

文件內容：
${inputText}`;

          try {
            // 使用重試包裝器
            const result = await retryWithBackoff(async () => {
              return await window.ChatbotCore.singleChunkSummary(
                prompt,
                inputText,
                config,
                apiKey
              );
            });

            // 解析結果
            const lines = result.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            for (const line of lines) {
              if (line.startsWith('[TITLE]')) {
                const content = line.replace('[TITLE]', '').trim();
                structure.orderedElements.push({ type: 'title', content });
                structure.sections.push(content); // 相容
              } else if (line.startsWith('[SECTION]')) {
                const content = line.replace('[SECTION]', '').trim();
                structure.orderedElements.push({ type: 'section', content });
                structure.sections.push(content); // 相容
              } else if (line.startsWith('[POINT]')) {
                const content = line.replace('[POINT]', '').trim();
                structure.orderedElements.push({ type: 'keypoint', content });
                structure.keyPoints.push(content); // 相容
              } else if (line.startsWith('[FIGURE]')) {
                const content = line.replace('[FIGURE]', '').trim();
                structure.orderedElements.push({ type: 'figure', content });
                structure.figures.push(content); // 相容
              } else if (line.startsWith('[TABLE]')) {
                const content = line.replace('[TABLE]', '').trim();
                structure.orderedElements.push({ type: 'table', content });
                structure.tables.push(content); // 相容
              } else if (line.startsWith('[FORMULA]')) {
                const content = line.replace('[FORMULA]', '').trim();
                structure.orderedElements.push({ type: 'formula', content });
              }
            }

            console.log(`[SemanticGrouper] 提取了 ${structure.orderedElements.length} 個有序結構元素`);
          } catch (e) {
            console.warn('[SemanticGrouper] LLM提取結構失敗，使用正則降級:', e.message);
            // 降級到正則提取（無順序）
            fallbackRegexExtraction(text, structure);
          }
        } else {
          // 無API Key，使用正則降級
          fallbackRegexExtraction(text, structure);
        }
      } else {
        // 無ChatbotCore，使用正則降級
        fallbackRegexExtraction(text, structure);
      }

      return structure;
    } catch (error) {
      console.error('[SemanticGrouper] 提取結構化資訊失敗:', error);
      return structure;
    }
  }

  /**
   * 降級方案：使用正則提取（不保證順序）
   */
  function fallbackRegexExtraction(text, structure) {
    const figureRegex = /(?:圖|Figure|Fig\.?)\s*(\d+)[：:：]?\s*([^\n]{0,50})/gi;
    const tableRegex = /(?:表|Table)\s*(\d+)[：:：]?\s*([^\n]{0,50})/gi;
    const formulaRegex = /(?:公式|Formula|Equation)\s*(\d+)[：:：]?\s*([^\n]{0,50})/gi;
    const sectionRegex = /^(?:#+\s*)?(\d+(?:\.\d+)*)\s+([^\n]{3,60})$/gm;

    let match;
    while ((match = figureRegex.exec(text)) !== null) {
      const content = `圖${match[1]}: ${match[2].trim()}`;
      structure.figures.push(content);
      structure.orderedElements.push({ type: 'figure', content });
    }
    while ((match = tableRegex.exec(text)) !== null) {
      const content = `表${match[1]}: ${match[2].trim()}`;
      structure.tables.push(content);
      structure.orderedElements.push({ type: 'table', content });
    }
    while ((match = formulaRegex.exec(text)) !== null) {
      const content = `公式${match[1]}: ${match[2].trim()}`;
      structure.orderedElements.push({ type: 'formula', content });
    }
    while ((match = sectionRegex.exec(text)) !== null) {
      const content = `${match[1]} ${match[2].trim()}`;
      structure.sections.push(content);
      structure.orderedElements.push({ type: 'section', content });
    }

    // 去重
    structure.figures = [...new Set(structure.figures)].slice(0, 5);
    structure.tables = [...new Set(structure.tables)].slice(0, 5);
    structure.sections = structure.sections.slice(0, 5);
  }

  /**
   * 快速比對：根據關鍵詞查詢相關意群
   * @param {string} query - 使用者查詢
   * @param {Array<Object>} groups - 意群陣列
   * @returns {Array<Object>} 比對的意群（按相關度排序）
   */
  function quickMatch(query, groups) {
    if (!query || !groups || groups.length === 0) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/[\s，,、。.]+/).filter(w => w.length > 1);

    // 為每個意群計算相關度分數
    const scored = groups.map(group => {
      let score = 0;

      // 關鍵詞比對（權重 3）
      if (group.keywords && group.keywords.length > 0) {
        group.keywords.forEach(kw => {
          if (queryLower.includes(kw.toLowerCase())) {
            score += 3;
          }
        });
      }

      // 摘要比對（權重 2）
      if (group.summary) {
        const summaryLower = group.summary.toLowerCase();
        queryWords.forEach(word => {
          if (summaryLower.includes(word)) {
            score += 2;
          }
        });
      }

      // digest 比對（權重 1）
      if (group.digest) {
        const digestLower = group.digest.toLowerCase();
        queryWords.forEach(word => {
          if (digestLower.includes(word)) {
            score += 1;
          }
        });
      }

      return { group, score };
    });

    // 按分數降序排序
    scored.sort((a, b) => b.score - a.score);

    // 返回有分數的意群
    return scored.filter(item => item.score > 0).map(item => item.group);
  }

  // 匯出公共介面
  window.SemanticGrouper = {
    aggregate: aggregateIntoSemanticGroups,
    quickMatch: quickMatch,
    // 輔助方法（供測試使用）
    generateSummary: generateSummary,
    extractKeywords: extractKeywords
  };

  console.log('[SemanticGrouper] 意群聚合模組已載入');

})(window);
