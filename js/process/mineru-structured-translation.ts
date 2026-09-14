// process/mineru-structured-translation.js
// MinerU 結構化翻譯 - 基於 content_list.json 的批次翻譯

/**
 * MinerU 結構化翻譯管理器
 * 核心功能：
 * 1. 從 content_list.json 提取可翻譯內容並分批（10個/批）
 * 2. 構建批次翻譯提示詞（複用現有的術語庫和提示詞池機制）
 * 3. 執行批次翻譯並保留格式後設資料
 */
class MinerUStructuredTranslation {
  constructor() {
    this.BATCH_SIZE = 10; // 每批處理的片段數量
    this.MAX_RETRIES = 2; // 批次呼叫最大重試次數（指數退避）
    this.RETRY_BASE_DELAY = 800; // 初始重試延遲(ms)
    // 注意：不再使用 failedItems 陣列，失敗項由 main.js 從 translatedContentList 統一收集
  }

  /**
   * 檢查是否支援結構化翻譯
   * @param {Object} ocrResult - OCR 結果物件
   * @returns {boolean}
   */
  supportsStructuredTranslation(ocrResult) {
    if (!ocrResult || !ocrResult.metadata) return false;
    return ocrResult.metadata.engine === 'mineru' &&
           ocrResult.metadata.contentListJson &&
           ocrResult.metadata.supportsStructuredTranslation === true;
  }

  /**
   * 提取可翻譯內容
   * @param {Array} contentList - content_list.json 陣列
   * @returns {Array} 可翻譯內容陣列
   */
  extractTranslatableContent(contentList) {
    if (!Array.isArray(contentList)) {
      console.error('[MinerU Structured] contentList 不是陣列');
      return [];
    }

    return contentList.map((item, index) => {
      const translatable = {
        id: this.generateId(item, index),
        type: item.type,
        bbox: item.bbox,
        page_idx: item.page_idx || 0,
        originalItem: item // 儲存原始項以便後續重建
      };

      // 根據型別提取需要翻譯的欄位
      switch (item.type) {
        case 'text':
          translatable.text = item.text || item.content || '';
          translatable.text_level = item.text_level;
          break;

        case 'image':
          translatable.img_path = item.img_path || item.image_path || '';
          translatable.image_caption = item.image_caption || [];
          break;

        case 'formula':
          translatable.latex = item.latex || '';
          // 公式不翻譯，但需要保留
          break;

        case 'table':
          translatable.table_caption = item.table_caption || '';
          translatable.table_data = item.table_data || '';
          // 表格資料不翻譯，僅翻譯標題
          break;

        default:
          translatable.text = item.text || item.content || '';
      }

      return translatable;
    });
  }

  /**
   * 分批處理內容
   * @param {Array} content - 可翻譯內容陣列
   * @returns {Array} 批次陣列
   */
  splitIntoBatches(content) {
    if (!Array.isArray(content) || content.length === 0) {
      return [];
    }

    const batches = [];

    for (let i = 0; i < content.length; i += this.BATCH_SIZE) {
      batches.push({
        batchIndex: Math.floor(i / this.BATCH_SIZE),
        startIndex: i,
        endIndex: Math.min(i + this.BATCH_SIZE, content.length),
        items: content.slice(i, i + this.BATCH_SIZE),
        // 保留上一批的最後一項作為上下文（如果存在）
        context: i > 0 ? content[i - 1] : null
      });
    }

    return batches;
  }

  /**
   * 構建批次翻譯提示詞
   * @param {Object} batch - 批次資料
   * @param {string} targetLang - 目標語言
   * @param {string} baseSystemPrompt - 基礎系統提示詞（來自提示詞池或預設）
   * @param {string} baseUserPromptTemplate - 基礎使用者提示詞模板
   * @returns {Object} { systemPrompt, userPrompt }
   */
  buildBatchTranslationPrompt(batch, targetLang, baseSystemPrompt = '', baseUserPromptTemplate = '') {
    // 1. 構建上下文提示
    let contextHint = '';
    if (batch.context) {
      const contextText = this.formatContextItem(batch.context);
      if (contextText) {
        contextHint = `\n【上文參考】：${contextText}\n`;
      }
    }

    // 2. 構建結構化翻譯規則
    const structuredRules = `

【結構化翻譯規則】：
1. 輸入是 JSON 陣列格式的文件片段（共 ${batch.items.length} 個片段）
2. 每個片段只包含必要欄位：
   - "id"（唯一識別符號，必須保持不變）
   - "type"（型別，必須保持不變）
   - 需要翻譯的欄位（根據型別而定）
3. 翻譯規則：
   - type="text"：翻譯 "text" 欄位的內容
   - type="image"：翻譯 "image_caption" 陣列中的內容
   - type="table"：翻譯 "table_caption" 欄位的內容
   - type="formula"：無需翻譯，保持原樣即可
4. 翻譯要求：
   - 術語保持一致（專有名詞、學術術語等）
   - 考慮上文內容（如有），確保術語和表述一致
   - 保持段落間邏輯關係
5. **JSON 格式要求（極其重要）**：
   - 字串中的特殊字元必須正確轉義：
     * 雙引號：使用 \\"
     * 換行字元：使用 \\n
     * 製表符：使用 \\t
     * 反斜槓：使用 \\\\
   - 確保輸出是**合法的 JSON 格式**，可以被 JSON.parse() 解析
6. **輸出格式**：
   - 返回翻譯後的完整 JSON 陣列，結構與輸入完全一致
   - 使用 JSON 程式碼塊包裹：\`\`\`json\n...\n\`\`\`
   - **id 和 type 欄位必須與輸入完全一致**`;

    // 3. 合併系統提示詞
    const systemPrompt = (baseSystemPrompt || '你是一位專業的文件翻譯助手。') +
                         contextHint +
                         structuredRules;

    // 4. 構建使用者提示詞 - 只提取必要欄位傳送給AI
    // 簡化資料結構，減少token消耗和JSON解析錯誤
    const simplifiedItems = batch.items.map(item => {
      const simplified = {
        id: item.id,
        type: item.type
      };

      // 根據型別提取需要翻譯的欄位
      if (item.type === 'text') {
        simplified.text = item.text || '';
      } else if (item.type === 'image' && Array.isArray(item.image_caption)) {
        simplified.image_caption = item.image_caption;
      } else if (item.type === 'table') {
        if (item.table_caption) simplified.table_caption = item.table_caption;
      }
      // formula型別不需要翻譯任何內容

      return simplified;
    });

    const jsonContent = JSON.stringify(simplifiedItems, null, 2);

    // 如果有使用者提示詞模板，使用它；否則使用預設模板
    let userPrompt;
    if (baseUserPromptTemplate && baseUserPromptTemplate.includes('${content}')) {
      userPrompt = baseUserPromptTemplate
        .replace(/\$\{targetLangName\}/g, targetLang)
        .replace(/\$\{content\}/g, `以下是需要翻譯的 JSON 陣列：\n\n\`\`\`json\n${jsonContent}\n\`\`\``);
    } else {
      userPrompt = `請將以下結構化文件片段翻譯成${targetLang}。

**待翻譯內容（JSON 格式）**：
\`\`\`json
${jsonContent}
\`\`\`

請嚴格按照上述規則返回翻譯後的 JSON 陣列。`;
    }

    return { systemPrompt, userPrompt };
  }

  /**
   * 格式化上下文項為文字
   * @param {Object} contextItem
   * @returns {string}
   */
  formatContextItem(contextItem) {
    if (!contextItem) return '';

    switch (contextItem.type) {
      case 'text':
        return contextItem.text || '';
      case 'image':
        if (Array.isArray(contextItem.image_caption) && contextItem.image_caption.length > 0) {
          return contextItem.image_caption.join(' ');
        }
        return '（圖片）';
      case 'table':
        return contextItem.table_caption || '（表格）';
      case 'formula':
        return '（公式）';
      default:
        return '';
    }
  }

  /**
   * 執行批次翻譯
   * @param {Array} batches - 分批後的內容
   * @param {string} targetLang - 目標語言
   * @param {string} model - 翻譯模型
   * @param {string} apiKey - API Key
   * @param {Object} options - 額外選項
   * @param {Function} onProgress - 進度回撥
   * @param {Function} acquireSlot - 獲取並行槽位
   * @param {Function} releaseSlot - 釋放並行槽位
   * @returns {Promise<Array>} 翻譯後的完整內容陣列
   */
  async translateBatches(batches, targetLang, model, apiKey, options = {}, onProgress, acquireSlot, releaseSlot) {
    const totalBatches = batches.length;
    let completedCount = 0;

    if (typeof addProgressLog === 'function') {
      addProgressLog(`[結構化翻譯] 開始翻譯 ${totalBatches} 個批次（共 ${batches.reduce((sum, b) => sum + b.items.length, 0)} 個片段）`);
    }

    // 並行翻譯所有批次
    const translateBatch = async (batch, batchIndex) => {
      const logContext = `[批次 ${batchIndex + 1}/${totalBatches}]`;
      let boundPrompt = null; // 移到外層，以便 catch 塊可以訪問
      let apiStartTime = 0; // 移到外層，以便 catch 塊可以訪問

      // 獲取並行槽位
      if (typeof acquireSlot === 'function') {
        await acquireSlot();
      }

      try {
        // 1. 獲取基礎提示詞（來自提示詞池或預設）
        let baseSystemPrompt = '';
        let baseUserPromptTemplate = '';

        if (typeof window !== 'undefined' && window.promptPoolUI) {
          const poolPrompt = window.promptPoolUI.getPromptForTranslation();
          if (poolPrompt && poolPrompt.id && poolPrompt.systemPrompt && poolPrompt.userPromptTemplate) {
            baseSystemPrompt = poolPrompt.systemPrompt;
            baseUserPromptTemplate = poolPrompt.userPromptTemplate;
            boundPrompt = poolPrompt;

            // 記錄到提示詞池（用於統計和監控）
            if (typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.enqueueRequest === 'function') {
              const requestId = `req_structured_${Date.now()}_${Math.random().toString(36).slice(2,8)}_b${batchIndex}`;
              window.translationPromptPool.enqueueRequest(poolPrompt.id, { requestId, model: model });
            }

            // 介面日誌顯示
            if (typeof addProgressLog === 'function') {
              addProgressLog(`${logContext} 使用提示詞池: ${poolPrompt.name || poolPrompt.id}`);
            }
            console.log(`${logContext} 使用提示詞池的提示詞:`, poolPrompt.id);
          }
        }

        // 如果沒有提示詞池，使用內建模板
        if (!baseSystemPrompt && typeof getBuiltInPrompts === 'function') {
          const prompts = getBuiltInPrompts(targetLang);
          baseSystemPrompt = prompts.systemPrompt;
          baseUserPromptTemplate = prompts.userPromptTemplate;
        }

        // 2. 構建批次翻譯提示詞
        const { systemPrompt, userPrompt } = this.buildBatchTranslationPrompt(
          batch,
          targetLang,
          baseSystemPrompt,
          baseUserPromptTemplate
        );

        // 3. 注入術語庫（如果啟用）
        let finalSystemPrompt = systemPrompt;
        try {
          const settings = (typeof loadSettings === 'function') ? loadSettings() : {};
          if (settings.enableGlossary && typeof getGlossaryMatchesForText === 'function') {
            // 合併所有批次項的文字進行術語比對
            const batchText = batch.items.map(item => {
              if (item.type === 'text') return item.text || '';
              if (item.type === 'image' && Array.isArray(item.image_caption)) {
                return item.image_caption.join(' ');
              }
              if (item.type === 'table') return item.table_caption || '';
              return '';
            }).filter(Boolean).join('\n');

            const matches = getGlossaryMatchesForText(batchText);
            if (matches && matches.length > 0) {
              const instruction = (typeof buildGlossaryInstruction === 'function')
                ? buildGlossaryInstruction(matches, targetLang)
                : '';
              if (instruction) {
                finalSystemPrompt += '\n\n' + instruction;
                if (typeof addProgressLog === 'function') {
                  const names = matches.slice(0, 3).map(m => m.term).join(', ');
                  addProgressLog(`${logContext} 命中術語庫 ${matches.length} 條：${names}${matches.length > 3 ? '...' : ''}`);
                }
              }
            }
          }
        } catch (e) {
          console.warn(`${logContext} 術語庫注入失敗:`, e);
        }

        // 4. 呼叫翻譯 API（帶重試機制）
        if (typeof addProgressLog === 'function') {
          addProgressLog(`${logContext} 正在翻譯 ${batch.items.length} 個片段...`);
        }

        let lastErr = null;
        let translatedItems = null;
        const maxRetries = options.maxRetries != null ? options.maxRetries : this.MAX_RETRIES;
        const baseDelay = options.retryDelay != null ? options.retryDelay : this.RETRY_BASE_DELAY;
        apiStartTime = Date.now(); // 更新開始時間

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const translatedJson = await this.callTranslationAPI(
              finalSystemPrompt,
              userPrompt,
              model,
              apiKey,
              options
            );
            const parsed = this.parseTranslationResponse(translatedJson);
            if (!this.validateTranslation(batch.items, parsed)) {
              throw new Error('翻譯結果結構不比對');
            }
            translatedItems = parsed;

            // 記錄提示詞池使用成功
            if (boundPrompt && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.recordPromptUsage === 'function') {
              window.translationPromptPool.recordPromptUsage(
                boundPrompt.id,
                true,
                Date.now() - apiStartTime,
                null,
                { model: model, endpoint: 'structured-translation' }
              );
            }

            break; // 成功
          } catch (e) {
            lastErr = e;
            if (attempt < maxRetries) {
              const delay = Math.min(baseDelay * Math.pow(2, attempt), 10000);
              console.warn(`${logContext} 翻譯失敗（第 ${attempt + 1}/${maxRetries + 1} 次），${delay}ms 後重試:`, e?.message || e);
              await this.delay(delay);
              continue;
            }
          }
        }

        if (!translatedItems) {
          // 全批失敗：標記該批所有項失敗並返回原文
          const failed = batch.items.map((it, idx) => {
            const clone = { ...it, failed: true };
            // 不在這裡新增到 failedItems，讓 main.js 統一收集
            return clone;
          });

          // 記錄提示詞池使用失敗
          if (boundPrompt && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.recordPromptUsage === 'function') {
            window.translationPromptPool.recordPromptUsage(
              boundPrompt.id,
              false,
              Date.now() - apiStartTime,
              lastErr?.message || '未知錯誤',
              { model: model, endpoint: 'structured-translation' }
            );
          }

          if (typeof addProgressLog === 'function') {
            addProgressLog(`${logContext} 翻譯失敗：${lastErr?.message || '未知錯誤'}（已達最大重試次數）`);
          }
          return { batchIndex, items: failed };
        }

        // 5. 細粒度失敗標記 + 合併翻譯結果到原始物件
        // 關鍵：保留原始物件的所有欄位（bbox、page_idx、originalItem等），只更新翻譯欄位
        const markedItems = translatedItems.map((it, idx) => {
          const orig = batch.items[idx];
          let isFailed = false;
          let failureReason = '';  // 記錄失敗原因

          // 先複製原始完整物件，保留所有後設資料（bbox、page_idx等，用於定位）
          const out = { ...orig };

          if (orig && it) {
            if (orig.type === 'text') {
              const a = this._normalizeText(orig.text);
              const b = this._normalizeText(it.text);

              // 只有原文不為空但譯文為空時才標記為失敗（譯文與原文相同是正常行為）
              if (!b && !!a) {
                isFailed = true;
                failureReason = 'empty';  // 空譯文，需要自動重試

                // 除錯日誌：記錄失敗判定詳情
                console.log(`[結構化翻譯] 專案 ${idx} 判定為失敗: 譯文為空`, {
                  原文前50字: a.substring(0, 50),
                  原文長度: a.length
                });
              } else if (b === a) {
                // 譯文與原文相同，記錄日誌但不標記為失敗（可能是專有名詞、公式等）
                console.log(`[結構化翻譯] 專案 ${idx} 譯文與原文相同（正常）`, {
                  文字前50字: a.substring(0, 50)
                });
              }

              // 更新翻譯後的文字
              if (!isFailed && it.text !== undefined) {
                out.text = it.text;
              }
            } else if (orig.type === 'image') {
              const a = this._normalizeText(Array.isArray(orig.image_caption) ? orig.image_caption.join(' ') : orig.image_caption);
              const b = this._normalizeText(Array.isArray(it.image_caption) ? it.image_caption.join(' ') : it.image_caption);

              // 只有譯文為空時才標記為失敗
              if (!b && !!a) {
                isFailed = true;
                failureReason = 'empty';
                console.log(`[結構化翻譯] 專案 ${idx} (image) 判定為失敗: 圖片說明為空`);
              }

              // 更新翻譯後的圖片說明
              if (!isFailed && it.image_caption !== undefined) {
                out.image_caption = it.image_caption;
              }
            } else if (orig.type === 'table') {
              const a = this._normalizeText(orig.table_caption);
              const b = this._normalizeText(it.table_caption);

              // 只有譯文為空時才標記為失敗
              if (!b && !!a) {
                isFailed = true;
                failureReason = 'empty';
                console.log(`[結構化翻譯] 專案 ${idx} (table) 判定為失敗: 表格標題為空`);
              }

              // 更新翻譯後的表格標題
              if (!isFailed && it.table_caption !== undefined) {
                out.table_caption = it.table_caption;
              }
            } else if (orig.type === 'formula') {
              isFailed = false; // 公式不需要翻譯
            }
          }

          if (isFailed) {
            out.failed = true;
            out.failureReason = failureReason;  // 儲存失敗原因
          } else {
            // 翻譯成功：明確移除 failed 標記（如果原來有的話）
            delete out.failed;
            delete out.failureReason;
          }
          return out;
        });

        // 6. 對"譯文為空"的項進行單獨重試（最多2次）
        const emptyFailedIndices = [];
        markedItems.forEach((item, idx) => {
          if (item.failed && item.failureReason === 'empty') {
            emptyFailedIndices.push(idx);
          }
        });

        if (emptyFailedIndices.length > 0) {
          console.log(`[結構化翻譯] 批次 ${batchIndex + 1}: 發現 ${emptyFailedIndices.length} 個空譯文項，開始單獨重試...`);

          for (const idx of emptyFailedIndices) {
            const item = markedItems[idx];
            const origItem = batch.items[idx];
            let retrySuccess = false;

            // 最多重試2次
            for (let retryAttempt = 1; retryAttempt <= 2 && !retrySuccess; retryAttempt++) {
              try {
                console.log(`[結構化翻譯] 重試專案 ${idx} (第 ${retryAttempt} 次)...`);

                // 構建單條翻譯的簡化資料
                const singleItem = {
                  id: origItem.id,
                  type: origItem.type
                };

                if (origItem.type === 'text') {
                  singleItem.text = origItem.text || '';
                } else if (origItem.type === 'image' && Array.isArray(origItem.image_caption)) {
                  singleItem.image_caption = origItem.image_caption;
                } else if (origItem.type === 'table') {
                  if (origItem.table_caption) singleItem.table_caption = origItem.table_caption;
                }

                // 構建單條翻譯提示詞（使用與批次翻譯相同的 prompt 構建邏輯）
                const singleBatch = { items: [singleItem] };
                const { systemPrompt: retrySysPrompt, userPrompt: retryUserPrompt } = this.buildBatchTranslationPrompt(
                  singleBatch,
                  targetLang,
                  baseSystemPrompt,
                  baseUserPromptTemplate
                );

                // 呼叫API翻譯單條
                const singleResponse = await this.callTranslationAPI(
                  retrySysPrompt,
                  retryUserPrompt,
                  model,
                  apiKey,
                  options
                );

                // 解析單條翻譯結果
                const singleTranslated = this.parseTranslationResponse(singleResponse);

                if (singleTranslated && singleTranslated.length > 0) {
                  const translatedItem = singleTranslated[0];

                  // 檢查是否真的翻譯成功了
                  let isStillEmpty = false;
                  if (origItem.type === 'text') {
                    const b = this._normalizeText(translatedItem.text);
                    isStillEmpty = !b;
                  } else if (origItem.type === 'image') {
                    const b = this._normalizeText(Array.isArray(translatedItem.image_caption) ? translatedItem.image_caption.join(' ') : translatedItem.image_caption);
                    isStillEmpty = !b;
                  } else if (origItem.type === 'table') {
                    const b = this._normalizeText(translatedItem.table_caption);
                    isStillEmpty = !b;
                  }

                  if (!isStillEmpty) {
                    // 重試成功！更新 markedItems
                    if (origItem.type === 'text') {
                      markedItems[idx].text = translatedItem.text;
                    } else if (origItem.type === 'image') {
                      markedItems[idx].image_caption = translatedItem.image_caption;
                    } else if (origItem.type === 'table') {
                      markedItems[idx].table_caption = translatedItem.table_caption;
                    }

                    delete markedItems[idx].failed;
                    delete markedItems[idx].failureReason;
                    retrySuccess = true;

                    console.log(`[結構化翻譯] ✓ 專案 ${idx} 重試成功`);

                    if (typeof addProgressLog === 'function') {
                      addProgressLog(`${logContext} 專案 ${idx} 重試成功`);
                    }
                  } else {
                    console.warn(`[結構化翻譯] 專案 ${idx} 第 ${retryAttempt} 次重試仍為空`);
                  }
                }

                // 如果還有下一次重試，等待一下
                if (!retrySuccess && retryAttempt < 2) {
                  await this.delay(500);
                }

              } catch (retryError) {
                console.error(`[結構化翻譯] 專案 ${idx} 第 ${retryAttempt} 次重試失敗:`, retryError);
              }
            }

            if (!retrySuccess) {
              console.warn(`[結構化翻譯] ✗ 專案 ${idx} 重試 2 次後仍然失敗`);
              if (typeof addProgressLog === 'function') {
                addProgressLog(`${logContext} 專案 ${idx} 重試失敗`);
              }
            }
          }
        }

        // 7. 統計本批次失敗情況（重試後）
        const batchFailedCount = markedItems.filter(item => item.failed === true).length;
        const batchSuccessCount = markedItems.length - batchFailedCount;

        console.log(`[結構化翻譯] 批次 ${batchIndex + 1} 完成: ${batchSuccessCount}/${markedItems.length} 成功, ${batchFailedCount} 失敗`);

        // 8. 更新進度
        completedCount++;
        onProgress?.({
          current: completedCount,
          total: totalBatches,
          percentage: Math.floor((completedCount / totalBatches) * 100),
          message: `已完成 ${completedCount}/${totalBatches} 批次 (${batchSuccessCount}/${markedItems.length} 成功)`
        });

        if (typeof addProgressLog === 'function') {
          addProgressLog(`${logContext} 翻譯完成 (${batchSuccessCount}/${markedItems.length} 成功)`);
        }

        return { batchIndex, items: markedItems };

      } catch (error) {
        console.error(`${logContext} 翻譯失敗:`, error);

        // 記錄提示詞池使用失敗（捕獲未預期的異常）
        if (boundPrompt && typeof window.translationPromptPool !== 'undefined' && typeof window.translationPromptPool.recordPromptUsage === 'function') {
          const duration = apiStartTime > 0 ? (Date.now() - apiStartTime) : 0;
          window.translationPromptPool.recordPromptUsage(
            boundPrompt.id,
            false,
            duration,
            error?.message || String(error),
            { model: model, endpoint: 'structured-translation' }
          );
        }

        if (typeof addProgressLog === 'function') {
          addProgressLog(`${logContext} 翻譯失敗: ${error.message}，將使用原文`);
        }
        // 回退：使用原文並標記失敗
        const failed = batch.items.map((it, idx) => {
          const clone = { ...it, failed: true };
          // 不在這裡新增到 failedItems，讓 main.js 統一收集
          return clone;
        });
        return { batchIndex, items: failed };
      } finally {
        // 釋放並行槽位
        if (typeof releaseSlot === 'function') {
          releaseSlot();
        }
      }
    };

    // 並行執行所有批次翻譯
    const batchPromises = batches.map((batch, index) => translateBatch(batch, index));
    const batchResults = await Promise.all(batchPromises);

    // 按批次索引排序，確保結果順序正確
    batchResults.sort((a, b) => a.batchIndex - b.batchIndex);

    // 合併所有翻譯結果
    const results = [];
    for (const result of batchResults) {
      results.push(...result.items);
    }

    // 統計整體翻譯情況
    const totalItems = results.length;
    const failedItems = results.filter(item => item.failed === true);
    const failedCount = failedItems.length;
    const successCount = totalItems - failedCount;

    console.log(`[結構化翻譯] 全部完成: ${successCount}/${totalItems} 成功, ${failedCount} 失敗`);

    if (failedCount > 0) {
      console.warn(`[結構化翻譯] 失敗項索引:`, failedItems.map((item, idx) => {
        const originalIdx = results.indexOf(item);
        return `#${originalIdx} (${item.type})`;
      }).join(', '));
    }

    if (typeof addProgressLog === 'function') {
      addProgressLog(`結構化翻譯完成: ${successCount}/${totalItems} 成功${failedCount > 0 ? `, ${failedCount} 失敗` : ''}`);
    }

    return results;
  }

  /**
   * 呼叫翻譯 API
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {string} model
   * @param {string} apiKey
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async callTranslationAPI(systemPrompt, userPrompt, model, apiKey, options = {}) {
    // 複用 translation.js 的配置構建邏輯
    if (typeof processModule === 'undefined' ||
        typeof processModule.buildPredefinedApiConfig !== 'function' ||
        typeof processModule.buildCustomApiConfig !== 'function') {
      throw new Error('translation.js 尚未載入');
    }

    if (typeof callTranslationApi !== 'function') {
      throw new Error('callTranslationApi 函式不可用');
    }

    console.log('[MinerU Structured] callTranslationAPI 呼叫引數:', {
      model,
      hasApiKey: !!apiKey,
      options,
      hasModelConfig: !!(options && options.modelConfig),
      modelConfig: options ? options.modelConfig : null
    });

    // 構建 API 配置
    let apiConfig;
    if (model === 'custom') {
      const modelConfig = options.modelConfig;

      // 修復：支援 apiBaseUrl 或 apiEndpoint
      const apiEndpoint = modelConfig && (modelConfig.apiEndpoint || modelConfig.apiBaseUrl);
      const modelId = modelConfig && modelConfig.modelId;

      console.log('[MinerU Structured] 自定義模型配置檢查:', {
        hasModelConfig: !!modelConfig,
        hasApiEndpoint: !!apiEndpoint,
        hasModelId: !!modelId,
        modelConfig
      });

      if (!modelConfig || !apiEndpoint || !modelId) {
        console.error('[MinerU Structured] 自定義模型配置不完整!', {
          modelConfig,
          options,
          apiEndpoint,
          modelId
        });
        throw new Error('自定義模型配置不完整');
      }
      apiConfig = processModule.buildCustomApiConfig(
        apiKey,
        apiEndpoint,
        modelId,
        modelConfig.requestFormat || 'openai',
        modelConfig.temperature !== undefined ? modelConfig.temperature : 0.5,
        modelConfig.max_tokens !== undefined ? modelConfig.max_tokens : 8000,
        { endpointMode: modelConfig.endpointMode || 'auto' }
      );
    } else {
      // 預設模型 - 從 translation.js 獲取配置
      const settings = typeof loadSettings === 'function' ? loadSettings() : {};
      const temperature = (settings.customModelSettings && settings.customModelSettings.temperature) || 0.5;
      const maxTokens = (settings.customModelSettings && settings.customModelSettings.max_tokens) || 8000;

      // 簡化：僅支援常用模型
      const predefinedConfigs = {
        'deepseek': {
          endpoint: 'https://api.deepseek.com/v1/chat/completions',
          modelName: 'DeepSeek',
          headers: { 'Content-Type': 'application/json' },
          bodyBuilder: (sys, user) => ({
            model: 'deepseek-chat',
            messages: [{ role: "system", content: sys }, { role: "user", content: user }],
            temperature,
            max_tokens: maxTokens
          }),
          responseExtractor: (data) => data?.choices?.[0]?.message?.content
        },
        'mistral': {
          endpoint: 'https://api.mistral.ai/v1/chat/completions',
          modelName: 'Mistral Large',
          headers: { 'Content-Type': 'application/json' },
          bodyBuilder: (sys, user) => ({
            model: 'mistral-large-latest',
            messages: [{ role: "system", content: sys }, { role: "user", content: user }],
            temperature,
            max_tokens: maxTokens
          }),
          responseExtractor: (data) => data?.choices?.[0]?.message?.content
        }
      };

      if (!predefinedConfigs[model]) {
        throw new Error(`不支援的翻譯模型: ${model}`);
      }

      apiConfig = processModule.buildPredefinedApiConfig(predefinedConfigs[model], apiKey);
    }

    // 構建請求體
    const requestBody = apiConfig.bodyBuilder
      ? apiConfig.bodyBuilder(systemPrompt, userPrompt)
      : {
          model: apiConfig.modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        };

    // 呼叫API
    let result = await callTranslationApi(apiConfig, requestBody);

    // 清理指令塊（防止系統提示詞洩露到翻譯結果中）
    if (typeof stripInstructionBlocks === 'function') {
      result = stripInstructionBlocks(result);
    } else if (typeof processModule !== 'undefined' && typeof processModule.stripInstructionBlocks === 'function') {
      result = processModule.stripInstructionBlocks(result);
    } else {
      // 回退：手動清理
      if (typeof result === 'string') {
        result = result.replace(/\s*\[\[PBX_INSTR_START\]\][\s\S]*?\[\[PBX_INSTR_END\]\]\s*/gi, '').trim();
      }
    }

    return result;
  }

  /**
   * 修復JSON字串值中的未轉義換行字元
   * @param {string} jsonStr
   * @returns {string}
   */
  _fixUnescapedNewlinesInJsonStrings(jsonStr) {
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        // 當前字元被轉義，直接新增
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        // 下一個字元將被轉義
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        // 切換字串狀態
        inString = !inString;
        result += char;
        continue;
      }

      if (inString && char === '\n') {
        // 在字串內部遇到換行字元，轉義為 \\n
        result += '\\n';
        continue;
      }

      // 其他字元直接新增
      result += char;
    }

    return result;
  }

  /**
   * 解析翻譯響應（提取 JSON）
   * @param {string} response
   * @returns {Array}
   */
  parseTranslationResponse(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('翻譯響應為空或不是文字');
    }

    // 1) 優先提取程式碼塊（相容 ```json / ``` JSON / ``` 任意）
    let raw = null;
    let m = response.match(/```\s*json\s*([\s\S]*?)\s*```/i);
    if (!m) m = response.match(/```\s*([\s\S]*?)\s*```/);
    if (m) raw = m[1]; else raw = response;

    // 2) 去掉前後噪聲，裁剪到 {..} 或 [..]
    const startObj = raw.indexOf('{');
    const startArr = raw.indexOf('[');
    let start = -1;
    if (startObj === -1 && startArr === -1) start = -1;
    else if (startObj === -1) start = startArr; else if (startArr === -1) start = startObj; else start = Math.min(startObj, startArr);
    if (start > 0) raw = raw.slice(start);
    const endObj = raw.lastIndexOf('}');
    const endArr = raw.lastIndexOf(']');
    let end = Math.max(endObj, endArr);
    if (end >= 0) raw = raw.slice(0, end + 1);

    // 3) 規範化：替換花引號、清理無效轉義、移除尾隨逗號
    let cleaned = raw
      .replace(/[""]/g, '"')  // 中文引號
      .replace(/,\s*([}\]])/g, '$1')  // 尾隨逗號
      .replace(/\r\n/g, '\n')  // 統一換行字元
      .replace(/\r/g, '\n');

    // 4) 修復字串值中的未轉義換行字元
    // 這是導致 "Unterminated string" 錯誤的主要原因
    // 需要在JSON字串值內部將真實換行字元轉義為 \\n
    cleaned = this._fixUnescapedNewlinesInJsonStrings(cleaned);

    // 5) 修復常見的無效轉義（但保留合法的轉義序列）
    // 合法的 JSON 轉義：\" \\ \/ \b \f \n \r \t \uXXXX
    // 先處理已經雙反斜槓的情況（避免重複轉義）
    const placeholder = '\u0000ESCAPED_BACKSLASH\u0000';
    cleaned = cleaned.replace(/\\\\/g, placeholder);

    // 然後處理無效的單反斜槓轉義（除了合法的 JSON 轉義）
    cleaned = cleaned.replace(/\\(?!["\\\/bfnrtu]|u[0-9a-fA-F]{4})/g, '\\\\');

    // 恢復佔位符
    cleaned = cleaned.replace(new RegExp(placeholder, 'g'), '\\\\');

    // 5) 嘗試解析
    try {
      return JSON.parse(cleaned);
    } catch (e1) {
      console.error('JSON 解析失敗（清理後）:', e1);
      console.error('清理後的內容（前500字元）:', cleaned.substring(0, 500));

      // 最後嘗試：更激進的修復
      try {
        // 把所有單反斜槓都轉義（可能會破壞一些內容，但至少能解析）
        const aggressive = cleaned.replace(/\\/g, '\\\\');
        return JSON.parse(aggressive);
      } catch (e2) {
        console.error('激進清理也失敗:', e2);
        throw new Error('無法解析翻譯結果為 JSON 格式');
      }
    }
  }

  /**
   * 驗證翻譯結果
   * @param {Array} original
   * @param {Array} translated
   * @returns {boolean}
   */
  validateTranslation(original, translated) {
    if (!Array.isArray(original) || !Array.isArray(translated)) {
      console.error('[MinerU Structured] 驗證失敗：輸入不是陣列');
      return false;
    }

    if (original.length !== translated.length) {
      console.error('[MinerU Structured] 驗證失敗：長度不一致', original.length, translated.length);
      return false;
    }

    // 驗證每個元素的關鍵欄位
    // 注意：由於傳送給AI的是簡化資料（只有id、type和翻譯欄位），
    // AI返回的也只有這些欄位，不包含page_idx、bbox等後設資料
    for (let i = 0; i < original.length; i++) {
      const orig = original[i];
      const trans = translated[i];

      // 驗證 id 是否比對（用於正確對應原始項）
      if (orig.id !== trans.id) {
        console.error(`[MinerU Structured] 驗證失敗：索引 ${i} 的 id 不比對`, orig.id, trans.id);
        return false;
      }

      // 驗證 type 是否比對
      if (orig.type !== trans.type) {
        console.error(`[MinerU Structured] 驗證失敗：索引 ${i} 的 type 不比對`, orig.type, trans.type);
        return false;
      }

      // 不再驗證 page_idx、bbox 等後設資料欄位，因為AI返回的簡化資料中不包含這些
    }

    return true;
  }

  /**
   * 提取用於重試展示的文字
   */
  extractItemText(item) {
    if (!item) return '';
    if (item.type === 'text') return item.text || '';
    if (item.type === 'image') return Array.isArray(item.image_caption) ? item.image_caption.join(' ') : '';
    if (item.type === 'table') return item.table_caption || '';
    return '';
  }

  _normalizeText(v) {
    if (v == null) return '';
    try {
      if (Array.isArray(v)) return v.join(' ').trim();
      if (typeof v === 'string') return v.trim();
      return String(v).trim();
    } catch (_) { return ''; }
  }

  /**
   * 生成唯一 ID
   * @param {Object} item
   * @param {number} index
   * @returns {string}
   */
  generateId(item, index) {
    const page = item.page_idx || 0;
    const bbox = item.bbox ? item.bbox.join('_') : 'nobbox';
    return `p${page}_${bbox}_${index}`;
  }

  /**
   * 延遲函式
   * @param {number} ms
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重建 Markdown（可選功能，暫不實現）
   * 如果需要基於翻譯後的 JSON 重新生成 Markdown，可在此實現
   */
  rebuildMarkdown(translatedContent) {
    // TODO: 實現 Markdown 重建邏輯
    // 目前直接使用原始的 markdown，僅在後設資料中儲存翻譯後的 JSON
    return null;
  }
}

// 匯出到全域
if (typeof window !== 'undefined') {
  window.MinerUStructuredTranslation = MinerUStructuredTranslation;
}

// 模組化匯出
if (typeof processModule !== 'undefined') {
  processModule.MinerUStructuredTranslation = MinerUStructuredTranslation;
}
