// semantic-groups-manager.js
// 語義意群管理模組

(function() {
  'use strict';

  /**
   * 顯示多輪檢索配置對話方塊
   * @param {string} docId - 文件ID
   * @returns {Promise<object|null>} 使用者配置或null（取消）
   */
  async function showMultiHopConfigDialog(docId) {
  return new Promise((resolve) => {
    // 建立遮罩層
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100003;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // 建立對話方塊
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 480px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937;">檢索Agent配置</h3>
      <p style="margin: 0 0 20px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        這是您首次在此文件使用檢索Agent。請選擇啟用的功能：
      </p>

      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: flex-start; cursor: pointer; padding: 12px; border-radius: 8px; transition: background 0.2s;"
               onmouseover="this.style.background='#f3f4f6'"
               onmouseout="this.style.background='transparent'">
          <input type="checkbox" id="use-semantic-groups" checked style="margin-top: 2px; margin-right: 12px; cursor: pointer;">
          <div>
            <div style="font-weight: 500; color: #1f2937; margin-bottom: 4px;">意群分析</div>
            <div style="font-size: 13px; color: #6b7280;">將文件智慧分割為語義單元，提高檢索準確性</div>
          </div>
        </label>
      </div>

      <div style="margin-bottom: 24px;">
        <label style="display: flex; align-items: flex-start; cursor: pointer; padding: 12px; border-radius: 8px; transition: background 0.2s;"
               onmouseover="this.style.background='#f3f4f6'"
               onmouseout="this.style.background='transparent'">
          <input type="checkbox" id="use-vector-search" checked style="margin-top: 2px; margin-right: 12px; cursor: pointer;">
          <div>
            <div style="font-weight: 500; color: #1f2937; margin-bottom: 4px;">向量搜尋與重排</div>
            <div style="font-size: 13px; color: #6b7280;">使用AI理解語義進行智慧搜尋，結果可選重排最佳化（需消耗API token）</div>
          </div>
        </label>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="dialog-cancel" style="
          padding: 8px 16px;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          color: #374151;
          transition: all 0.2s;
        " onmouseover="this.style.background='#f9fafb'"
           onmouseout="this.style.background='white'">取消</button>
        <button id="dialog-confirm" style="
          padding: 8px 16px;
          border: none;
          background: #059669;
          color: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        " onmouseover="this.style.background='#047857'"
           onmouseout="this.style.background='#059669'">確認</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 綁定事件
    const confirmBtn = dialog.querySelector('#dialog-confirm');
    const cancelBtn = dialog.querySelector('#dialog-cancel');
    const semanticGroupsCheckbox = dialog.querySelector('#use-semantic-groups');
    const vectorSearchCheckbox = dialog.querySelector('#use-vector-search');

    const closeDialog = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    confirmBtn.onclick = () => {
      const config = {
        useSemanticGroups: semanticGroupsCheckbox.checked,
        useVectorSearch: vectorSearchCheckbox.checked
      };
      closeDialog(config);
    };

    cancelBtn.onclick = () => {
      closeDialog(null); // 取消返回null
    };
  });
}

/**
 * 確保意群資料已準備好
 * 根據文件大小和使用者設定，決定是否需要生成意群
 * @param {Object} docContentInfo - 文件內容資訊
 * @param {Function} getCurrentDocId - 獲取當前文件ID的函式
 * @param {Function} getChatbotConfig - 獲取聊天機器人配置的函式
 * @param {Function} singleChunkSummary - 單輪摘要函式
 */
async function ensureSemanticGroupsReady(docContentInfo, getCurrentDocId, getChatbotConfig, singleChunkSummary) {
  // 檢查是否啟用多輪檢索（只有啟用多輪檢索時才需要意群和向量索引）
  const multiHopEnabled = (window.chatbotActiveOptions && window.chatbotActiveOptions.multiHopRetrieval === true);
  if (!multiHopEnabled) {
    console.log('[ChatbotCore] 多輪檢索未啟用，跳過意群生成');
    return;
  }

  // 檢查 window.data 是否存在
  if (!window.data) {
    return;
  }

  const docId = window.data.currentPdfName || 'unknown';

  // 檢查是否已經配置過（針對當前文件）
  if (!window.data.multiHopConfig) {
    window.data.multiHopConfig = {};
  }

  // 如果當前文件未配置過，顯示選擇對話方塊
  if (!window.data.multiHopConfig[docId]) {
    console.log('[ChatbotCore] 首次使用多輪檢索，顯示配置對話方塊');

    const config = await showMultiHopConfigDialog(docId);

    if (!config) {
      // 使用者取消了
      console.log('[ChatbotCore] 使用者取消了多輪檢索配置');
      window.chatbotActiveOptions.multiHopRetrieval = false; // 關閉多輪檢索
      if (window.ChatbotFloatingOptionsUI?.updateDisplay) {
        window.ChatbotFloatingOptionsUI.updateDisplay();
      }
      return;
    }

    // 儲存配置
    window.data.multiHopConfig[docId] = config;
    console.log('[ChatbotCore] 儲存多輪檢索配置:', config);
  }

  // 讀取文件配置
  const docConfig = window.data.multiHopConfig[docId];
  console.log('[ChatbotCore] 當前文件多輪檢索配置:', docConfig);

  // 如果不使用意群，建立簡單的enrichedChunks（不分組）然後返回
  if (!docConfig.useSemanticGroups) {
    console.log('[ChatbotCore] 使用者選擇不使用意群分析，建立簡單chunks用於BM25搜尋');

    // 獲取原始chunks
    const translationText = docContentInfo.translation || '';
    const ocrText = docContentInfo.ocr || '';
    const chunkCandidates = [];
    if (Array.isArray(docContentInfo.translatedChunks)) {
      chunkCandidates.push(...docContentInfo.translatedChunks);
    }
    if (Array.isArray(docContentInfo.ocrChunks)) {
      chunkCandidates.push(...docContentInfo.ocrChunks);
    }

    // 建立簡單的enrichedChunks（不帶意群分組資訊）
    if (chunkCandidates.length > 0) {
      const simpleEnrichedChunks = chunkCandidates.map((text, idx) => ({
        chunkId: `chunk-${idx}`,
        text: typeof text === 'string' ? text : '',
        position: idx,
        charCount: typeof text === 'string' ? text.length : 0,
        belongsToGroup: null  // 不屬於任何意群
      })).filter(c => c.text);

      window.data.enrichedChunks = simpleEnrichedChunks;
      console.log(`[ChatbotCore] 建立了 ${simpleEnrichedChunks.length} 個簡單chunks（無意群分組）`);

      // 建立BM25索引（輕量級，不需要API）
      // 使用前面儲存配置時的同一個 docId，而不是重新獲取
      console.log(`[ChatbotCore][DEBUG] 使用 docId=${docId} 來建立索引`);
      // 向量索引改為後臺生成，避免阻塞對話流程
      await ensureIndexesBuilt(simpleEnrichedChunks, [], docId, true);
    }

    return;
  }

  // 檢查 SemanticGrouper 是否載入
  if (!window.SemanticGrouper || typeof window.SemanticGrouper.aggregate !== 'function') {
    console.warn('[ChatbotCore] SemanticGrouper 未載入，跳過意群生成');
    return;
  }

  // 檢查 window.data 是否存在
  if (!window.data) {
    return;
  }

  // 如果已經有意群資料，直接返回
  if (window.data.semanticGroups && window.data.semanticGroups.length > 0) {
    console.log('[ChatbotCore] 意群資料已存在，跳過生成');
    return;
  }

  // 獲取文件內容和策略
  const translationText = docContentInfo.translation || '';
  const ocrText = docContentInfo.ocr || '';
  const chunkCandidates = [];
  if (Array.isArray(docContentInfo.translatedChunks)) {
    chunkCandidates.push(...docContentInfo.translatedChunks);
  }
  if (Array.isArray(docContentInfo.ocrChunks)) {
    chunkCandidates.push(...docContentInfo.ocrChunks);
  }

  let contentLength = Math.max(translationText.length, ocrText.length);
  if (contentLength < 50000 && chunkCandidates.length > 0) {
    const chunkLength = chunkCandidates.reduce((sum, chunk) => sum + (typeof chunk === 'string' ? chunk.length : 0), 0);
    contentLength = Math.max(contentLength, chunkLength);
  }

  let content = translationText || ocrText;
  if (!content && chunkCandidates.length > 0) {
    content = chunkCandidates.slice(0, 60).join('\n\n');
  }

  const contentStrategy = (window.chatbotActiveOptions && window.chatbotActiveOptions.contentLengthStrategy) || 'default';
  // 智慧檢索開啟時，自動視為智慧分段模式
  const strategySegmented = contentStrategy === 'segmented' || multiHopEnabled;

  // 短文件檢查：如果文件長度 < 50000 且未明確開啟智慧分段，跳過意群生成
  if (contentLength < 50000 && contentStrategy !== 'segmented') {
    console.log(`[ChatbotCore] 文件長度 ${contentLength} < 50000 且未明確開啟智慧分段，跳過意群生成`);
    return;
  }

  if (!strategySegmented) {
    console.log('[ChatbotCore] 當前策略非智慧分段且未開啟智慧檢索，跳過意群生成');
    return;
  }

  // 優先嚐試從 IndexedDB 讀取快取
  try {
    const docId = getCurrentDocId();
    if (typeof window.loadSemanticGroupsFromDB === 'function') {
      const cached = await window.loadSemanticGroupsFromDB(docId);
      if (cached && Array.isArray(cached.groups) && cached.groups.length > 0) {
        window.data.semanticGroups = cached.groups;
        if (cached.docGist) window.data.semanticDocGist = cached.docGist;

        // 恢復enrichedChunks，如果快取中沒有則從原始chunks重建
        let enrichedChunks = cached.enrichedChunks || [];

        // 相容舊資料：如果快取中沒有enrichedChunks，從ocrChunks/translatedChunks重建
        if (!enrichedChunks || enrichedChunks.length === 0) {
          // 根據使用者設定的 summarySource 選項決定使用哪個chunks
          const summarySource = (window.chatbotActiveOptions && window.chatbotActiveOptions.summarySource) || 'ocr';
          let rawChunks = [];

          if (summarySource === 'translation') {
            // 優先使用translatedChunks，但如果全是空字串則降級到ocrChunks
            rawChunks = docContentInfo.translatedChunks || [];
            const hasValidTranslation = rawChunks.some(chunk => chunk && typeof chunk === 'string' && chunk.trim().length > 0);
            if (!hasValidTranslation) {
              rawChunks = docContentInfo.ocrChunks || [];
            }
          } else if (summarySource === 'ocr') {
            // 優先使用ocrChunks，如果沒有則使用translatedChunks
            rawChunks = docContentInfo.ocrChunks || docContentInfo.translatedChunks || [];
          } else if (summarySource === 'none') {
            // 明確不使用文件內容
            rawChunks = [];
          }

          if (rawChunks.length > 0) {
            enrichedChunks = rawChunks
              .filter(text => text && typeof text === 'string' && text.trim().length > 0)  // 過濾無效chunk
              .map((text, index) => ({
                chunkId: `chunk-${index}`,
                text: text,
                belongsToGroup: null,
                position: index,
                charCount: text.length
              }));
            console.log(`[ChatbotCore] 從原始chunks(${summarySource})重建了 ${enrichedChunks.length} 個enrichedChunks`);
          }
        } else {
          // 驗證enrichedChunks的有效性
          enrichedChunks = enrichedChunks.filter(chunk =>
            chunk && typeof chunk.text === 'string' && chunk.text.trim().length > 0
          );
          if (enrichedChunks.length === 0) {
            console.warn('[ChatbotCore] 快取的enrichedChunks無效，嘗試從原始chunks重建');
            // 根據使用者設定的 summarySource 選項決定使用哪個chunks
            const summarySource = (window.chatbotActiveOptions && window.chatbotActiveOptions.summarySource) || 'ocr';
            let rawChunks = [];

            if (summarySource === 'translation') {
              rawChunks = docContentInfo.translatedChunks || [];
              const hasValidTranslation = rawChunks.some(chunk => chunk && typeof chunk === 'string' && chunk.trim().length > 0);
              if (!hasValidTranslation) {
                rawChunks = docContentInfo.ocrChunks || [];
              }
            } else if (summarySource === 'ocr') {
              rawChunks = docContentInfo.ocrChunks || docContentInfo.translatedChunks || [];
            }

            if (rawChunks.length > 0) {
              enrichedChunks = rawChunks
                .filter(text => text && typeof text === 'string' && text.trim().length > 0)
                .map((text, index) => ({
                  chunkId: `chunk-${index}`,
                  text: text,
                  belongsToGroup: null,
                  position: index,
                  charCount: text.length
                }));
              console.log(`[ChatbotCore] 重建了 ${enrichedChunks.length} 個enrichedChunks(${summarySource})`);
            }
          }
        }

        window.data.enrichedChunks = enrichedChunks;

        console.log(`[ChatbotCore] 已從快取讀取意群，共 ${cached.groups.length} 個意群，${enrichedChunks.length} 個chunks`);

        // 檢測意群-chunks不比對：比較快取中的chunks數量和當前實際chunks數量
        const cachedChunkCount = (cached.enrichedChunks && cached.enrichedChunks.length) || 0;
        const isOutdated = cachedChunkCount > 0 && enrichedChunks.length > 0 &&
                          Math.abs(cachedChunkCount - enrichedChunks.length) > Math.max(cachedChunkCount, enrichedChunks.length) * 0.1;

        if (isOutdated) {
          console.warn(`[ChatbotCore] 檢測到意群快取與chunks不比對（快取${cachedChunkCount}個chunk，實際${enrichedChunks.length}個），清除快取並重新生成`);
          // 刪除舊快取
          if (typeof window.deleteSemanticGroupsFromDB === 'function') {
            await window.deleteSemanticGroupsFromDB(docId);
          }
          delete window.data.semanticGroups;
          delete window.data.enrichedChunks;
          // 不要return，繼續走下面的重新生成流程
        } else {
          // 檢查並建立索引（向量索引和BM25索引），引數順序：chunks, groups, docId
          await ensureIndexesBuilt(enrichedChunks, cached.groups, docId);
          return;
        }
      }
    }
  } catch (e) {
    console.warn('[ChatbotCore] 讀取意群快取失敗，繼續生成:', e);
  }

  // 檢查是否有現成的分段資料
  // 根據使用者設定的 summarySource 選項決定使用哪個chunks
  const summarySource = (window.chatbotActiveOptions && window.chatbotActiveOptions.summarySource) || 'ocr';
  let chunks = [];

  if (summarySource === 'translation') {
    chunks = docContentInfo.translatedChunks || [];
    const hasValidTranslation = chunks.some(chunk => chunk && typeof chunk === 'string' && chunk.trim().length > 0);
    if (!hasValidTranslation) {
      chunks = docContentInfo.ocrChunks || [];
    }
  } else if (summarySource === 'ocr') {
    chunks = docContentInfo.ocrChunks || docContentInfo.translatedChunks || [];
  } else if (summarySource === 'none') {
    chunks = [];
  }

  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    console.warn('[ChatbotCore] 沒有可用的分段資料（ocrChunks/translatedChunks），無法生成意群');
    return;
  }

  if (contentLength < 50000) {
    console.log(`[ChatbotCore] 文件估算字數 ${contentLength} < 50000，但已啟用智慧分段，繼續生成意群`);
  }

  console.log(`[ChatbotCore] 開始生成意群，估算字數: ${contentLength}，分段數: ${chunks.length}`);

  try {
    // 顯示載入提示
    if (window.ChatbotUtils && typeof window.ChatbotUtils.showToast === 'function') {
      window.ChatbotUtils.showToast('正在生成文件意群，請稍候...', 'info', 3000);
    }

    // 先生成文件總覽（前2萬字），作為後續分組摘要的背景資訊
    try {
      const preview = content.slice(0, 20000);
      const cfg = getChatbotConfig();
      if (!window.data.semanticDocGist && cfg && cfg.apiKey && typeof singleChunkSummary === 'function') {
        const gistPrompt = `你是學術文件分析助手。請基於提供的文件開標頭分，生成一段不超過400字的中文總覽，涵蓋：主題/研究問題、物件/範圍、方法/框架、主要結論或結構。儘量客觀、概括，不參考無關細節。`;
        const gist = await singleChunkSummary(gistPrompt, preview, cfg, cfg.apiKey);
        window.data.semanticDocGist = (gist || '').trim();
        console.log('[ChatbotCore] 文件總覽（前2萬字）已生成');
      }
    } catch (e) {
      console.warn('[ChatbotCore] 文件總覽生成失敗，將跳過：', e);
      if (!window.data.semanticDocGist) {
        window.data.semanticDocGist = content.slice(0, 400);
      }
    }

    // 生成意群（可由使用者設定覆蓋預設值）
    const s = (window.semanticGroupsSettings || {});

    // 建立進度顯示UI元素
    let progressToast = null;
    if (window.ChatbotUtils && typeof window.ChatbotUtils.showProgressToast === 'function') {
      progressToast = window.ChatbotUtils.showProgressToast('生成意群中...', 0);
    }

    const result = await window.SemanticGrouper.aggregate(chunks, {
      targetChars: Number(s.targetChars) > 0 ? Number(s.targetChars) : 5000,
      minChars: Number(s.minChars) > 0 ? Number(s.minChars) : 2500,
      maxChars: Number(s.maxChars) > 0 ? Number(s.maxChars) : 6000,
      concurrency: Number(s.concurrency) > 0 ? Number(s.concurrency) : 20,  // 恢復預設並行數
      docContext: window.data.semanticDocGist || '',
      onProgress: (current, total, message) => {
        const percent = Math.round((current / total) * 100);
        if (progressToast && typeof progressToast.update === 'function') {
          progressToast.update(`${message} (${percent}%)`, percent);
        }
        console.log(`[ChatbotCore] 意群生成進度: ${current}/${total} (${percent}%)`);
      }
    });

    // 關閉進度提示
    if (progressToast && typeof progressToast.close === 'function') {
      progressToast.close();
    }

    const semanticGroups = result.groups || [];
    const enrichedChunks = result.enrichedChunks || [];

    // 儲存到 window.data
    window.data.semanticGroups = semanticGroups;
    window.data.enrichedChunks = enrichedChunks; // 儲存帶後設資料的chunks

    console.log(`[ChatbotCore] 意群生成完成，共 ${semanticGroups.length} 個意群，${enrichedChunks.length} 個chunks`);

    // 獲取docId（後續索引構建也需要）
    const docId = getCurrentDocId();

    // 持久化到 IndexedDB
    try {
      if (typeof window.saveSemanticGroupsToDB === 'function') {
        await window.saveSemanticGroupsToDB(docId, semanticGroups, {
          version: 3, // 版本號升級
          docGist: window.data.semanticDocGist || '',
          enrichedChunks: enrichedChunks
        });
        console.log('[ChatbotCore] 意群和chunks已寫入快取');
      }
    } catch (e) {
      console.warn('[ChatbotCore] 寫入快取失敗:', e);
    }

    // 更新浮動選項欄的顯示（出現"意群"按鈕）
    try {
      if (window.ChatbotFloatingOptionsUI && typeof window.ChatbotFloatingOptionsUI.updateDisplay === 'function') {
        window.ChatbotFloatingOptionsUI.updateDisplay();
      }
      if (window.SemanticGroupsUI && typeof window.SemanticGroupsUI.update === 'function') {
        window.SemanticGroupsUI.update();
      }
    } catch (_) {}

    // 顯示成功提示
    if (window.ChatbotUtils && typeof window.ChatbotUtils.showToast === 'function') {
      window.ChatbotUtils.showToast(`文件已分析完成，生成 ${semanticGroups.length} 個意群`, 'success', 2000);
    }

    // 非同步建立索引（不阻塞）
    await ensureIndexesBuilt(enrichedChunks, semanticGroups, docId, true);

  } catch (e) {
    console.error('[ChatbotCore] 意群生成失敗:', e);
    if (window.ChatbotUtils && typeof window.ChatbotUtils.showToast === 'function') {
      window.ChatbotUtils.showToast('意群生成失敗: ' + e.message, 'error', 3000);
    }
  }
}

/**
 * 確保向量索引和BM25索引已建立
 * @param {Array} chunks - chunks陣列
 * @param {Array} groups - 意群陣列
 * @param {string} docId - 文件ID
 * @param {boolean} async - 是否非同步建立索引（不阻塞）
 */
async function ensureIndexesBuilt(chunks, groups, docId, async = false) {
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return;
  }

  // 檢查是否啟用多輪檢索
  const multiHopEnabled = (window.chatbotActiveOptions && window.chatbotActiveOptions.multiHopRetrieval === true);

  // 讀取文件配置
  const docConfig = window.data?.multiHopConfig?.[docId];
  const useVectorSearch = docConfig?.useVectorSearch !== false; // 預設true

  // 非同步建立向量索引（僅在使用者配置允許且啟用了向量搜尋時）
  const buildVectorIndex = async () => {
    try {
      console.log(`[ChatbotCore][DEBUG] 向量索引檢查: useVectorSearch=${useVectorSearch}, multiHopEnabled=${multiHopEnabled}, docId=${docId}`);
      console.log('[ChatbotCore][DEBUG] 文件配置:', docConfig);

      // 僅在多輪檢索開啟且文件允許向量搜尋時建立向量索引
      if (!useVectorSearch) {
        console.log('[ChatbotCore] 使用者選擇不使用向量搜尋，跳過向量索引生成');
        return;
      }
      if (!multiHopEnabled) {
        console.log('[ChatbotCore] 多輪檢索未啟用，跳過向量索引生成');
        return;
      }

      if (window.EmbeddingClient && window.EmbeddingClient.config && window.EmbeddingClient.config.enabled && window.SemanticVectorSearch) {
        console.log(`[ChatbotCore] 檢測到向量搜尋已啟用，開始為 ${chunks.length} 個chunks建立索引...`);
        await window.SemanticVectorSearch.indexChunks(chunks, docId, {
          showProgress: true,
          forceRebuild: false
        });
        // 更新UI顯示
        if (window.ChatbotFloatingOptionsUI && window.ChatbotFloatingOptionsUI.updateDisplay) {
          window.ChatbotFloatingOptionsUI.updateDisplay();
        }
      } else {
        console.warn('[ChatbotCore] 向量索引未啟動：Embedding 未啟用或 SemanticVectorSearch 未載入');
        if (window.ChatbotUtils && window.ChatbotUtils.showToast) {
          window.ChatbotUtils.showToast('向量索引未啟動：請在“向量配置”中啟用並測試連線', 'warning', 3000);
        }
      }
    } catch (vectorErr) {
      console.warn('[ChatbotCore] 建立向量索引失敗（不影響意群功能）:', vectorErr);
      // 不再自動禁用向量搜尋，避免後續索引被永久跳過；僅提示使用者檢查配置
      if (window.ChatbotUtils && window.ChatbotUtils.showToast) {
        window.ChatbotUtils.showToast('向量索引失敗：請檢查向量服務配置或稍後重試', 'warning', 3000);
      }
    }
  };

  // 始終建立BM25索引（輕量級，無需API，作為fallback）
  try {
    if (window.SemanticBM25Search) {
      console.log('[ChatbotCore] 為chunks建立BM25索引...');
      window.SemanticBM25Search.indexChunks(chunks, docId);
      console.log('[ChatbotCore] BM25索引建立完成');
    }
  } catch (bm25Err) {
    console.warn('[ChatbotCore] 建立BM25索引失敗:', bm25Err);
  }

  // 如果是非同步模式，向量索引在後臺進行
  if (async) {
    buildVectorIndex(); // 不await，讓它在後臺執行
    if (multiHopEnabled && useVectorSearch) {
      console.log('[ChatbotCore] 向量索引將在後臺生成（已開啟多輪檢索）');
    }
  } else {
    await buildVectorIndex(); // 同步等待完成
  }
}

  // 匯出
  window.SemanticGroupsManager = {
    showMultiHopConfigDialog,
    ensureSemanticGroupsReady,
    ensureIndexesBuilt
  };

})();
