// js/chatbot/core/streaming-multi-hop.js
// 流式多輪取材 - 實時進度反饋
(function(window) {
  'use strict';

  /**
   * 估算文字的token數量（簡化版）
   * @param {string} text - 要估算的文字
   * @returns {number} 估算的token數
   */
  function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;

    // 中文字元：平均1.5字元 = 1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const chineseTokens = Math.ceil(chineseChars / 1.5);

    // 英文單詞：平均1個單詞 = 0.75 token
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const englishTokens = Math.ceil(englishWords * 0.75);

    // 數字和符號：粗略估算
    const otherChars = text.length - chineseChars - text.match(/[a-zA-Z\s]/g)?.length || 0;
    const otherTokens = Math.ceil(otherChars / 4);

    return chineseTokens + englishTokens + otherTokens;
  }

  /**
   * 流式多輪取材
   * 使用 Generator 函式實現流式輸出，每個步驟都實時反饋給UI
   *
   * @param {string} userQuestion - 使用者問題
   * @param {Object} docContentInfo - 文件內容資訊
   * @param {Object} config - 配置
   * @param {Object} options - 選項
   * @returns {AsyncGenerator} 非同步生成器
   */
  async function* streamingMultiHopRetrieve(userQuestion, docContentInfo, config, options = {}) {
    const userSet = window.semanticGroupsSettings || {};
    // 設定較大上限防止死迴圈，但主要由AI透過final標誌決定何時結束
    const maxRounds = Number(options.maxRounds ?? userSet.maxRounds) > 0 ? Number(options.maxRounds ?? userSet.maxRounds) : 10;

    try {
      const groups = Array.isArray(docContentInfo.semanticGroups) ? docContentInfo.semanticGroups : [];
      const hasGroups = groups.length > 0;

      if (!hasGroups) {
        console.log('[StreamingMultiHop] 沒有意群資料，將只使用grep工具進行檢索');
      }

      // 1. 分析問題，獲取候選意群（如果有的話）
      if (hasGroups) {
        yield {
          type: 'status',
          phase: 'analyze',
          message: '正在分析問題...'
        };
      }

      const candidates = groups;


      // 2. 多輪取材迴圈
      const fetched = new Map();
      const detail = [];
      let contextParts = [];
      const gist = (window.data && window.data.semanticDocGist) ? window.data.semanticDocGist : '';
      const searchHistory = []; // 記錄搜尋歷史

      // 任務追蹤狀態
      let taskStatusHistory = {
        completed: [],
        current: '',
        pending: []
      };

      /**
       * 升級或獲取意群內容
       * @param {Set<string>} groupIds - 意群ID集合
       * @param {string} targetGranularity - 目標粒度 (summary/digest/full)
       */
      const upgradeOrFetchGroups = async (groupIds, targetGranularity = 'digest') => {
        if (groupIds.size === 0) {
          console.warn('[StreamingMultiHop] upgradeOrFetchGroups: groupIds為空');
          return;
        }

        console.log(`[StreamingMultiHop] 開始升級/獲取 ${groupIds.size} 個意群到 ${targetGranularity}`);

        for (const groupId of groupIds) {
          if (window.SemanticTools && typeof window.SemanticTools.fetchGroupText === 'function') {
            try {
              const existing = fetched.get(groupId);
              const shouldFetch = !existing ||
                                  (existing.granularity === 'summary' && targetGranularity !== 'summary') ||
                                  (existing.granularity === 'digest' && targetGranularity === 'full');

              if (shouldFetch) {
                const groupRes = window.SemanticTools.fetchGroupText(groupId, targetGranularity);
                if (groupRes && groupRes.text) {
                  const isUpgrade = fetched.has(groupId);
                  fetched.set(groupId, { granularity: groupRes.granularity, text: groupRes.text });

                  console.log(`[StreamingMultiHop] ${isUpgrade ? '升級' : '新增'} ${groupId}: ${existing?.granularity || '無'} → ${groupRes.granularity}`);

                  // 更新detail和contextParts
                  if (isUpgrade) {
                    // 升級：替換原有內容
                    const idx = detail.findIndex(d => d.groupId === groupId);
                    if (idx >= 0) detail[idx].granularity = groupRes.granularity;

                    const ctxIdx = contextParts.findIndex(c => c.startsWith(`【${groupId}`));
                    if (ctxIdx >= 0) {
                      contextParts[ctxIdx] = `【${groupId} - ${groupRes.granularity}】\n${groupRes.text}`;
                    }
                  } else {
                    // 新增
                    detail.push({ groupId: groupId, granularity: groupRes.granularity });
                    contextParts.push(`【${groupId} - ${groupRes.granularity}】\n${groupRes.text}`);
                  }
                } else {
                  console.warn(`[StreamingMultiHop] fetchGroupText返回空: ${groupId}`);
                }
              } else {
                console.log(`[StreamingMultiHop] 跳過 ${groupId}: 已有${existing.granularity}，無需升級到${targetGranularity}`);
              }
            } catch (e) {
              console.error(`[StreamingMultiHop] 升級${groupId}失敗:`, e);
            }
          }
        }

        console.log(`[StreamingMultiHop] 升級完成，當前detail數量: ${detail.length}`);
      };

      // 預載入策略：第一輪給AI所有意群的summary，讓AI判斷哪些需要詳細內容
      // 後續輪會清理掉AI不感興趣的意群，只保留AI操作過的內容
      let preloadedInFirstRound = false;
      const interestedGroups = new Set(); // 記錄AI感興趣的意群（fetch過或搜尋命中）
      let aiRequestedMapInFinalContext = false; // AI決定是否在最終上下文中包含地圖
      let aiRequestedGroupListInFinalContext = false; // AI決定是否在最終上下文中包含意群簡要列表

      if (hasGroups && userSet && userSet.preloadFirstRound === true && groups.length <= 50) {
        yield {
          type: 'status',
          phase: 'preload',
          message: `預載入 ${groups.length} 個意群摘要供AI判斷...`
        };

        // 第一輪：預載入所有summary
        for (const g of groups) {
          if (window.SemanticTools?.fetchGroupText) {
            try {
              const res = window.SemanticTools.fetchGroupText(g.groupId, 'summary');
              if (res && res.text) {
                fetched.set(g.groupId, { granularity: 'summary', text: res.text });
                detail.push({ groupId: g.groupId, granularity: 'summary' });
                contextParts.push(`【${g.groupId} - summary】\n${res.text}`);
              }
            } catch (_) {}
          }
        }

        preloadedInFirstRound = true;
        yield {
          type: 'status',
          phase: 'preload_complete',
          message: `已預載入 ${fetched.size} 個意群摘要，等待AI判斷...`
        };
      }

      for (let round = 0; round < maxRounds; round++) {
        yield {
          type: 'round_start',
          round,
          message: `第 ${round + 1} 輪取材...`
        };

        // 地圖文字：僅在AI透過 map 工具請求後注入
        const listText = (typeof window._multiHopLastMapText === 'string' && window._multiHopLastMapText) ? window._multiHopLastMapText : '';

        // 構造已獲取內容的摘要
        let fetchedSummary = '無';
        if (fetched.size > 0) {
          const fetchedDetails = [];
          for (const [groupId, data] of fetched.entries()) {
            const preview = data.text.length > 500 ? data.text.substring(0, 500) + '...' : data.text;
            fetchedDetails.push(`【${groupId}】(${data.granularity})\n${preview}`);
          }
          fetchedSummary = fetchedDetails.join('\n\n');
        }

        // 構造搜尋歷史提示
        let searchHistoryText = '';
        if (searchHistory.length > 0) {
          const recentSearches = searchHistory.slice(-5); // 最近5次
          searchHistoryText = '\n\n【搜尋歷史】(避免重複搜尋這些查詢):\n' + recentSearches.map(s => {
            const status = s.resultCount > 0 ? `✓ ${s.resultCount}個結果` : '✗ 無結果';
            const toolName = {
              'vector_search': '向量',
              'keyword_search': '關鍵詞',
              'grep': 'GREP',
              'regex_search': '正則',
              'boolean_search': '布林'
            }[s.tool] || s.tool;
            return `- ${toolName}搜尋 "${s.query}" → ${status}`;
          }).join('\n');
        }

        const preloadedNotice = (round === 0 && fetched.size > 0) ? `

提示：已快取 ${fetched.size} 個意群摘要在【已獲取內容】中；若需整體地圖，請呼叫 map 工具。` : '';

        // 檢查文件配置
        const docId = (window.data && window.data.currentPdfName) || 'unknown';
        const docConfig = window.data?.multiHopConfig?.[docId];
        const useSemanticGroups = docConfig?.useSemanticGroups !== false; // 預設true
        const useVectorSearch = docConfig?.useVectorSearch !== false; // 預設true

        // 根據配置動態構建工具列表說明
        const vectorSearchTool = useVectorSearch ? `**推薦優先使用：**
- {"tool":"vector_search","args":{"query":"語義描述","limit":15}}
  用途：**智慧語義搜尋**（理解同義詞、相關概念、隱含關係）
  返回：語義最相關的chunks（每個1500-3000字）
  **優勢**：
    * 理解問題的深層含義，不侷限於字面比對
    * 能找到換了說法但意思相同的內容
    * 適合概念性、開放性、探索性問題
    * 召回率高，不會因為換詞而漏掉相關內容
  **你可以調整limit**：概念性問題可用limit=10-15，精確查詢可用limit=5

` : '';

        // BM25搜尋：無論是否有意群都可用（基於chunks）
        const keywordSearchTool = `
- {"tool":"keyword_search","args":{"keywords":["詞1","詞2"],"limit":8}}
  用途：多關鍵詞加權搜尋（BM25演算法）
  返回：包含關鍵詞的文件片段（按相關度評分）
  **使用時機**：精確查詢特定關鍵片語合${!useVectorSearch ? '（主要搜尋工具）' : '，或vector_search失敗時的降級方案'}
  **你可以調整limit**：關鍵詞明確可用limit=5，模糊查詢可用limit=10
`;

        const advancedSearchTools = `
**高階比對工具（特殊場景使用）：**
- {"tool":"regex_search","args":{"pattern":"\\\\d{4}年\\\\d{1,2}月","limit":10,"context":1500}}
  用途：正規表示式搜尋（比對特定格式）
  返回：符合正則模式的文字片段
  **適用場景**：
    * 搜尋特定格式（日期"2023年5月"、編號"公式3.2"、"Fig. 1"）
    * 比對複雜模式（電話、郵箱、特殊符號組合）
    * 數學公式編號、圖表參考等
    * OCR錯誤的容錯比對（如"注[意愈]力"可用"注.力"比對）
  **注意**：pattern需要轉義特殊字元（\\\\d 表示數字，\\\\. 表示點號）

- {"tool":"boolean_search","args":{"query":"(CNN OR RNN) AND 對比 NOT 影象","limit":10,"context":1500}}
  用途：布林邏輯搜尋（AND/OR/NOT組合）
  返回：同時滿足多個條件的文字片段
  **適用場景**：
    * 複雜邏輯查詢（必須包含A和B，但不包含C）
    * 多概念精確組合（比grep的OR更強大）
    * 排除干擾資訊（NOT關鍵詞）
  **語法**：支援 AND, OR, NOT 和括號，如 "(詞1 OR 詞2) AND 詞3 NOT 詞4"
`;

        const mapFetchTools = useSemanticGroups ? `
### 獲取詳細內容工具
- {"tool":"fetch","args":{"groupId":"group-1"}}
  用途：獲取指定意群詳細內容（包含完整論述、公式、資料、圖表）
  返回：完整文字（最多8000字）+ 結構資訊
  **使用時機**：當搜尋到的chunk片段資訊不足，需要看到完整上下文時

- {"tool":"map","args":{"limit":50,"includeStructure":true}}
  用途：獲取文件整體結構
  返回：意群地圖（ID、字數、關鍵詞、摘要、章節/圖表/公式）
${preloadedNotice}
` : `${preloadedNotice}
`;

        const sys = `你是檢索規劃助手，專門負責規劃如何從文件中檢索相關內容。

**重要：你的角色定位**
- ⚠️ **你不負責回答使用者問題**，你只負責規劃如何檢索文件內容
- ⚠️ **不要生成mermaid圖表、思維導圖或任何最終答案**
- ✓ 你的任務：分析使用者問題 → 規劃使用哪些工具檢索文件 → 輸出JSON格式的檢索計劃
- ✓ 檢索到的內容會交給另一個AI來回答使用者問題

**你的工作流程**
1. 分析使用者問題，判斷需要什麼型別的資訊
2. 選擇合適的檢索工具組合
3. **規劃任務清單**：將複雜問題拆解為多個檢索子任務
4. 輸出JSON格式的檢索計劃（不是答案！）

## 工具定義（JSON格式）

### 搜尋工具（返回chunk內容，由你決定是否需要完整意群）

${vectorSearchTool}**精確比對場景使用：**
- {"tool":"grep","args":{"query":"具體短語","limit":20,"context":2000,"caseInsensitive":true}}
  用途：字面文字搜尋（適合已知精確關鍵詞）
  返回：包含該短語的原文片段（前後2000字上下文）
  **適用場景**：
    * 搜尋專有名詞、特定數字、固定術語
    * 使用者問題中明確提到某個詞，需要找原文
    * 你已經知道文件中的確切表達方式
  **支援OR邏輯**：query可用 | 分隔多個關鍵詞，如 "方程|公式|equation"
  **你可以調整limit**：需要更多結果就增大limit，只需少量結果就減小limit

${keywordSearchTool}
${advancedSearchTools}
${mapFetchTools}

## 智慧決策流程

**第一步：分析問題複雜度，選擇工具組合策略**

**簡單問題（單工具足夠）：**
1. 精確實體查詢
   - 示例："雷曼公司何時破產？"
   → grep("雷曼|Lehman", limit=5)

${useVectorSearch ? `2. 單一概念解釋
   - 示例："什麼是注意力機制？"
   → vector_search("注意力機制 原理", limit=8)

` : ''}3. 特定格式查詢（編號、日期）
   - 示例："找出公式3.2的內容"
   → regex_search("公式\\\\s*3\\\\.2|式\\\\s*\\\\(3\\\\.2\\\\)", limit=5)
   - 示例："2023年的相關研究"
   → regex_search("2023年", limit=10)

4. 複雜邏輯排除
   - 示例："討論模型但不涉及訓練的內容"
   → boolean_search("模型 NOT (訓練 OR train)", limit=8)

**複雜問題（建議多工具並用）：**
${useVectorSearch && useSemanticGroups ? `1. 綜合性分析（如"研究背景與意義"）
   - 策略：**並行使用多個工具，全方位檢索**
   - 示例："研究背景與意義？"
   → 第1輪並行（推薦加入map獲取整體結構）：
     {"operations":[
       {"tool":"vector_search","args":{"query":"研究背景 意義 動機","limit":10}},
       {"tool":"grep","args":{"query":"背景|意義|動機|研究目的","limit":8}},
       {"tool":"map","args":{"limit":30}}
     ],"final":false}
   → 第2輪根據結果決定是否需要fetch關鍵意群

2. 多維度對比（如"CNN和RNN的區別"）
   - 策略：**搜尋兩個主體 + 對比關係**
   - 示例："CNN和RNN的區別"
   → {"operations":[
       {"tool":"vector_search","args":{"query":"CNN RNN 區別 對比","limit":12}},
       {"tool":"grep","args":{"query":"CNN|RNN","limit":10}}
     ],"final":false}

3. 歷史/因果關係（如"金融危機的原因和影響"）
   - 策略：**語義搜尋 + 關鍵詞 + 可能需要map**
   - 示例："金融危機的原因和影響"
   → {"operations":[
       {"tool":"vector_search","args":{"query":"金融危機 原因 影響","limit":12}},
       {"tool":"grep","args":{"query":"危機|原因|影響|導致","limit":8}},
       {"tool":"map","args":{"limit":30}}
     ],"final":false}

4. 整體理解類（如"文件的主要內容"）
   - 策略：**先map看結構，再fetch關鍵部分**
   - 示例："文件講了什麼？"
   → 第1輪：{"operations":[{"tool":"map","args":{"limit":50}}],"final":false}
   → 第2輪：根據地圖fetch重要意群

` : `1. 多關鍵詞搜尋
   - 策略：**使用grep進行關鍵詞檢索**
   - 示例："研究背景與意義？"
   → {"operations":[
       {"tool":"grep","args":{"query":"背景|意義|動機|研究目的","limit":15}}
     ],"final":false}

2. 特定概念搜尋
   - 策略：**使用keyword_search進行BM25搜尋**
   - 示例："什麼是注意力機制？"
   → {"operations":[
       {"tool":"keyword_search","args":{"keywords":["注意力","機制","attention"],"limit":10}}
     ],"final":false}

`}**工具組合原則：**
- **複雜問題優先多工具並用**（同一輪並行執行）
${useVectorSearch ? `- vector_search（語義）+ grep（精確）= 更高召回率和準確率
${useSemanticGroups ? `- **綜合性分析問題（如"研究背景與意義"）強烈建議使用map**：map提供文件整體結構，有助於理解背景脈絡
- 多維度問題建議3個工具：vector + grep + map
` : ''}` : `- grep（精確）+ keyword_search（BM25）= 提高召回率
- 多個關鍵片語合使用，提高搜尋準確性
`}- 簡單問題可以單工具，但不確定時寧可多用
- **優先順序判斷**：
  * 有明確格式（日期、編號、公式）→ 首選 regex_search
  * 需要排除干擾詞（NOT邏輯）→ 首選 boolean_search
  * 普通精確詞比對 → 使用 grep
  * 語義理解、同義詞 → 使用 vector_search
- regex和boolean是**特殊場景工具**，不要過度使用，普通查詢用grep/vector即可

${useSemanticGroups ? `**第二步：判斷是否需要fetch意群完整內容**
- 搜尋工具會返回：chunk內容 + suggestedGroups（所屬意群列表）
- 如果chunk片段**已包含足夠資訊**回答問題 → 不需要fetch，直接final=true
- 如果chunk片段**資訊不足**（如缺少公式細節、資料表、完整論述） → fetch相關意群
- **優先精準而非全面**：只fetch真正需要的意群，不要全部fetch

` : ''}**核心原則：提供充分、詳細、準確的上下文**
- 你的目標是為最終AI提供**足夠回答使用者問題的完整上下文**
- 不要因為擔心token浪費而過早結束檢索
- 寧可多獲取一些內容，也不要讓最終AI因為資訊不足而無法回答
- 【已獲取內容】為空時，**絕不能**返回空操作，必須至少執行一次檢索

**第三步：控制結果數量，避免噪音**
${useVectorSearch ? `- **優先用vector_search**，概念性問題用limit=10-15，精確查詢用limit=5-8
- grep僅用於精確比對場景，limit=5-10即可
` : `- **優先用grep**，精確比對場景用limit=10-15
`}- keyword_search作為降級方案，limit=8-10
- 避免一次性返回過多結果造成token浪費
- 如果第一次搜尋結果不足，可以增加limit或換工具

${useSemanticGroups ? `**第四步：地圖資訊的智慧使用**
- 【候選意群地圖】提供了文件結構概覽（如果執行過map工具）
- **你可以根據任務型別自主決定是否需要地圖資訊輔助回答**：
  * 巨集觀任務（如"總結主要內容"、"思維導圖"）：地圖很有用，可直接參考地圖結構
  * 微觀任務（如"雷曼公司何時破產"）：地圖意義不大，依賴具體檢索結果
  * 混合/長難任務（如"誰做了什麼經歷"）：地圖可提供流程框架，再用fetch補充細節
- **你的決策方式**：在final=true時，【已獲取內容】中包含的資訊應該足夠最終AI回答
  * 如果認為地圖有助於巨集觀理解，可以確保地圖已在【候選意群地圖】中（map工具已執行）
  * 如果地圖無關緊要，只需確保檢索到的chunks/groups足夠即可

**第五步：並行與結束**
` : `**第四步：並行與結束**
`}
- 可以在同一輪並行執行多個操作
- 獲取到足夠內容後立即final=true
- **嚴格檢查【搜尋歷史】避免重複搜尋**：
  * ⚠️ 如果【搜尋歷史】中已有完全相同的查詢（query相同），**絕對不要**再次執行
  * ⚠️ 如果【搜尋歷史】中顯示某個查詢"✗ 無結果"，不要換工具重試相同查詢（大機率還是無結果）
  * ✓ 應該換用不同的關鍵詞、或使用不同策略（如用map看整體結構）
- **只有當【已獲取內容】真正充足時**，才返回{"operations":[],"final":true}
- **如果【已獲取內容】為空或不足**，必須繼續檢索，不能直接final=true

## 任務追蹤機制（Task Status Tracking）

**多輪檢索時使用taskStatus追蹤進度**，幫助你在複雜問題中保持目標清晰：

**taskStatus欄位說明**（可選，但複雜問題強烈推薦）：
{
  "operations": [...],
  "final": false,
  "taskStatus": {
    "completed": ["✓ 已獲取研究背景(vector_search+grep, 找到18個chunks)"],
    "current": "→ 正在獲取方法論詳細描述",
    "pending": ["待檢索實驗設計", "待檢索結論和展望"]
  }
}

- **completed**: 已完成的檢索任務（附工具和結果數）
  * 示例："✓ 已獲取研究動機(vector_search, 3個chunks)"
  * **重要**：記錄已搜尋的query，避免下一輪重複執行
  * 作用：避免重複檢索，展示進度

- **current**: 當前正在執行的任務
  * 示例："→ 正在查詢公式推導過程"
  * 作用：明確本輪目標

- **pending**: 後續待完成的任務列表
  * 示例：["待補充圖表說明", "待驗證時間線"]
  * 作用：規劃下一步，防止遺漏

**使用場景**：
- **簡單問題**（1輪完成）：可省略taskStatus
- **複雜問題**（需多輪）：必須使用taskStatus
  * 第1輪：分解任務到pending，設定current
  * 中間輪：更新completed，調整current和pending
  * 最終輪：所有任務在completed，pending為空

**完整示例：複雜問題的追蹤**
問題："分析論文的背景、方法、實驗和結論"

第1輪規劃：
{"operations":[{"tool":"vector_search","args":{"query":"研究背景 動機","limit":10}}],"final":false,"taskStatus":{"completed":[],"current":"→ 檢索研究背景和動機","pending":["待檢索方法論","待檢索實驗","待檢索結論"]}}

第2輪規劃：
{"operations":[{"tool":"fetch","args":{"groupId":"group-5"}}],"final":false,"taskStatus":{"completed":["✓ 已獲取研究背景(vector+grep, 18個chunks)"],"current":"→ 獲取方法論詳細內容","pending":["待檢索實驗","待檢索結論"]}}

第3輪（完成）：
{"operations":[],"final":true,"taskStatus":{"completed":["✓ 研究背景","✓ 方法論","✓ 實驗結果","✓ 結論"],"current":"→ 檢索完成","pending":[]}}

## 示例決策

⚠️ **輸出示例對比**：
問題："生成思維導圖"

❌ 錯誤輸出（直接生成mermaid程式碼塊）：禁止！那是回答問題，不是規劃檢索。

✓ 正確輸出（規劃檢索+簡短說明）：
需要獲取文件結構和主要內容，使用map工具。
{"operations":[{"tool":"map","args":{"limit":50}}],"final":false,"includeMapInFinalContext":true}

說明：你只規劃"如何檢索"，不生成"最終答案"。另一個AI會用檢索結果生成mermaid。

---

示例1（複雜綜合問題，多工具並用）：
問題："研究背景與意義？"
→ {"operations":[
     {"tool":"vector_search","args":{"query":"研究背景 意義 動機","limit":10}},
     {"tool":"grep","args":{"query":"背景|意義|動機|研究目的","limit":8}}
   ],"final":false}
→ 返回vector: 8個語義相關chunk + grep: 5個精確比對chunk
→ 兩者互補，語義覆蓋+精確補充
→ {"operations":[{"tool":"fetch","args":{"groupId":"group-1"}}],"final":true}

示例2（對比分析，多工具）：
問題："CNN和RNN的區別"
→ {"operations":[
     {"tool":"vector_search","args":{"query":"CNN RNN 區別 對比","limit":12}},
     {"tool":"grep","args":{"query":"CNN|RNN","limit":10}}
   ],"final":false}
→ vector找語義關係，grep確保兩個主體都覆蓋
→ chunk足夠，{"operations":[],"final":true}

示例3（簡單精確查詢，單工具足夠）：
問題："雷曼公司何時破產"
→ {"operations":[{"tool":"grep","args":{"query":"雷曼|Lehman","limit":5}}],"final":true}
→ 返回3個chunk，包含"2008年9月15日申請破產"
→ 單工具足夠

示例4（查詢特定格式內容，使用正則）：
問題："找出文中所有的公式編號"
→ {"operations":[{"tool":"regex_search","args":{"pattern":"公式\\\\s*\\\\d+\\\\.\\\\d+|式\\\\s*\\\\(\\\\d+\\\\)","limit":20}}],"final":true}
→ 正則比對"公式3.2"、"式(15)"等格式
→ 比grep更精確，避免誤比對

示例5（複雜邏輯查詢，使用布林搜尋）：
問題："提到CNN但不涉及影象的內容"
→ {"operations":[{"tool":"boolean_search","args":{"query":"CNN AND (網路 OR 模型) NOT (影象 OR 視覺)","limit":10}}],"final":false}
→ 找到討論CNN網路結構但不涉及影象應用的段落
→ 比單獨用grep的OR更精確

示例6（查詢日期或時間資訊，用正則）：
問題："論文發表時間"
→ {"operations":[
     {"tool":"regex_search","args":{"pattern":"\\\\d{4}年|\\\\d{4}-\\\\d{2}|20\\\\d{2}","limit":10}},
     {"tool":"grep","args":{"query":"發表|出版|published","limit":5}}
   ],"final":true}
→ 正則找日期格式 + grep找相關詞彙

示例7（巨集觀理解，map+fetch）：
問題："生成思維導圖"
→ {"operations":[{"tool":"map","args":{"limit":50}}],"final":false}
→ 獲取意群地圖
→ {"operations":[
     {"tool":"fetch","args":{"groupId":"group-1"}},
     {"tool":"fetch","args":{"groupId":"group-5"}},
     {"tool":"fetch","args":{"groupId":"group-10"}}
   ],"final":true,"includeMapInFinalContext":true}
→ fetch關鍵意群 + 包含地圖

示例8（❌ 錯誤：重複搜尋）：
問題："找電影《猜火車》的參考"
第1輪：{"operations":[{"tool":"grep","args":{"query":"TRAINSPOTTING|猜火車","limit":20}}],"final":false}
→ 搜尋歷史顯示：GREP搜尋 "TRAINSPOTTING|猜火車" → ✓ 4個結果

❌ 第2輪錯誤做法：{"operations":[{"tool":"grep","args":{"query":"TRAINSPOTTING|猜火車","limit":20}}],"final":true}
（完全相同的query，禁止重複！）

✓ 第2輪正確做法：
- 如果4個結果已足夠 → {"operations":[],"final":true}
- 如果需要更多上下文 → {"operations":[{"tool":"fetch","args":{"groupId":"group-2"}}],"final":true}
  （fetch包含這些結果的意群，獲取完整上下文）

## 限制與原則
- 每輪最多5個操作
- **複雜問題優先多工具並用**（在同一輪operations陣列中並行執行）
- vector_search擅長語義理解，grep擅長精確比對，**兩者結合效果最佳**
- 簡單精確查詢可以只用grep，但綜合性/分析性問題**必須多工具**
- 搜尋limit不要超過20（避免噪音）
- 只fetch真正需要的意群（2-5個為宜）
- 優先chunk片段，確實不足才fetch意群

## 返回格式要求（嚴格遵守）

⚠️ **你只能返回JSON格式的檢索計劃，但可以在JSON前後新增簡短說明**

**允許的輸出格式**：
1. 純JSON（推薦）
2. 簡短說明 + JSON（可選，用於解釋檢索策略）
   例如："需要獲取研究背景資訊，使用向量搜尋和關鍵詞檢索。\n{...JSON...}"

**禁止輸出的內容**：
  * ❌ mermaid圖表、思維導圖程式碼
  * ❌ 對使用者問題的直接回答（如"該研究的背景是..."）
  * ❌ 詳細的論述或分析
  * ✓ 可以：簡短的檢索策略說明（1-2句話）

**正確格式**：
{
  "operations": [...],
  "final": true/false,
  "taskStatus": {  // 可選，複雜問題建議使用
    "completed": ["已完成的任務..."],
    "current": "當前任務",
    "pending": ["待做任務..."]
  },
  "includeMapInFinalContext": true/false,
  "includeGroupListInFinalContext": true/false
}

**給最終AI的上下文自主控制**（可選欄位，預設false）：
- **includeMapInFinalContext**: 是否包含完整地圖結構
  * 巨集觀任務（思維導圖、總結全文）→ true
  * 微觀任務（查詢具體事實）→ false

- **includeGroupListInFinalContext**: 是否包含所有意群的簡要列表（ID+字數+摘要）
  * 需要全域視角但不需要詳細地圖 → true
  * 只需要精確檢索結果 → false

- **你fetch的意群**: 會自動包含在最終上下文中（full/digest粒度）

**靈活組合示例**：
- 微觀查詢："公式7是什麼" → fetch(group-5) + 無地圖無列表
- 巨集觀總結："生成思維導圖" → map + includeMapInFinalContext:true + includeGroupListInFinalContext:true
- 混合任務："分析影響因素" → 搜尋 + fetch若干意群 + includeGroupListInFinalContext:true（提供背景）

示例JSON：
- 示例1（繼續檢索，帶任務追蹤）：
  {"operations":[{"tool":"fetch","args":{"groupId":"group-1"}}],"final":false,"taskStatus":{"completed":["✓ 已搜尋背景"],"current":"→ 獲取方法論","pending":["待查實驗"]}}
- 示例2（完成，僅fetch內容）：
  {"operations":[],"final":true}
- 示例3（完成，需要地圖+列表）：
  {"operations":[],"final":true,"includeMapInFinalContext":true,"includeGroupListInFinalContext":true}
- 示例4（完成，帶任務總結）：
  {"operations":[],"final":true,"taskStatus":{"completed":["✓ 背景","✓ 方法","✓ 實驗","✓ 結論"],"current":"→ 完成","pending":[]}}

**taskStatus欄位說明**（詳見上方"任務追蹤機制"章節）`;

        // 構建任務狀態提示文字
        let taskStatusText = '';
        if (round > 0 && (taskStatusHistory.completed.length > 0 || taskStatusHistory.current || taskStatusHistory.pending.length > 0)) {
          const parts = [];
          if (taskStatusHistory.completed.length > 0) {
            parts.push(`已完成: ${taskStatusHistory.completed.join('; ')}`);
          }
          if (taskStatusHistory.current) {
            parts.push(`上輪任務: ${taskStatusHistory.current}`);
          }
          if (taskStatusHistory.pending.length > 0) {
            parts.push(`待完成: ${taskStatusHistory.pending.join('; ')}`);
          }
          taskStatusText = '\n\n【任務追蹤狀態】\n' + parts.join('\n');
        }

        let content = `文件總覽:\n${gist}\n\n使用者問題:\n${String(userQuestion || '')}${searchHistoryText}${taskStatusText}\n\n${listText ? '【候選意群地圖】：\n' + listText + '\n\n' : ''}【已獲取內容】：\n${fetchedSummary}`;

        // 呼叫LLM規劃（支援重試）
        yield {
          type: 'status',
          phase: 'planning',
          round,
          message: 'LLM規劃中...'
        };

        const apiKey = config.apiKey;
        let plannerOutput = null;
        let retryCount = 0;
        const maxRetries = 2; // 最多重試2次
        let parseSuccess = false;
        let plan = null;

        // 重試迴圈：如果JSON解析失敗，給AI反饋並重試
        while (!parseSuccess && retryCount <= maxRetries) {
          if (retryCount > 0) {
            yield {
              type: 'info',
              message: `JSON格式錯誤，正在重試 (${retryCount}/${maxRetries})...`
            };
          }

          plannerOutput = await window.ChatbotCore.singleChunkSummary(sys, content, config, apiKey);

          // 統計規劃器token使用
          const plannerInputTokens = estimateTokens(sys) + estimateTokens(content);
          const plannerOutputTokens = estimateTokens(plannerOutput);
          const plannerTotalTokens = plannerInputTokens + plannerOutputTokens;

          yield {
            type: 'token_usage',
            phase: 'planner',
            round,
            tokens: {
              input: plannerInputTokens,
              output: plannerOutputTokens,
              total: plannerTotalTokens
            }
          };

          // 嘗試解析計劃
          try {
          let cleaned = plannerOutput
            .replace(/```jsonc?|```tool|```/gi,'')
            .replace(/[\u0000-\u001f]/g, ' ')
            .trim();

          if (!cleaned) {
            yield { type: 'warning', message: '規劃輸出為空，使用後備策略' };
            break;
          }

          // 如果輸出不是JSON（以中文或非{開頭），嘗試提取JSON
          if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
            // 嘗試提取JSON塊
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              cleaned = jsonMatch[0];
              console.log('[streamingMultiHop] 從文字中提取JSON:', cleaned.substring(0, 100));
            } else {
              // 嘗試從文字中提取operations和final資訊
              console.log('[streamingMultiHop] 嘗試從自然語言提取結構:', cleaned.substring(0, 200));

              // 檢查是否明確表達"已完成"、"足夠"等含義
              if (cleaned.match(/已.*足夠|無需.*操作|不需要.*繼續|已經.*完成|內容.*充足/i)) {
                plan = { operations: [], final: true };
                console.log('[streamingMultiHop] 識別為完成訊號，設定final=true');
              } else {
                // 完全沒有JSON且無法解析，返回空操作+final
                console.warn('[streamingMultiHop] LLM輸出非JSON格式，自動結束:', cleaned.substring(0, 100));
                yield {
                  type: 'warning',
                  message: `第 ${round + 1} 輪LLM返回非JSON格式，已獲取 ${fetched.size} 個意群，使用已有內容`
                };
                break;
              }
            }
          }

          if (!plan) {
            try {
              plan = JSON.parse(cleaned);
            } catch (parseErr) {
              // 嘗試各種清理策略
              let normalized = cleaned
                // 移除所有控制字元和特殊空白
                .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
                // 修復中文引號
                .replace(/[""]/g, '"')
                .replace(/['']/g, "'")
                // 修復JSON中的常見錯誤
                .replace(/"(\w+)"\s*:\s*'([^']*)'/g, '"$1":"$2"') // 單引號改雙引號
                .replace(/(\w+):/g, '"$1":') // 無引號鍵名加引號
                .replace(/,\s*}/g, '}') // 移除物件尾隨逗號
                .replace(/,\s*]/g, ']') // 移除陣列尾隨逗號
                // 修復 ," "final": 這種錯誤
                .replace(/,\s*"\s+"(\w+)"\s*:/g, ',"$1":')
                // 修復 "operations" " 這種空格
                .replace(/"(\w+)"\s+"/g, '"$1":')
                // 修復鍵名周圍的多餘空格
                .replace(/"\s+([\w-]+)"\s*:/g, '"$1":')
                // 修復值周圍的多餘空格
                .replace(/:\s*"\s+/g, ':"')
                .replace(/\s+"/g, '"')
                // 修復final前的空格
                .replace(/"\s*final\s*"/gi, '"final"')
                // 修復operations
                .replace(/"operations"\s*"/i, '"operations":')
                // 移除註釋
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*/g, '')
                // 壓縮空格
                .replace(/\s+/g, ' ')
                .trim();

              console.log('[streamingMultiHop] 清理後的JSON:', normalized.substring(0, 200));
              plan = JSON.parse(normalized);
            }
          }

          yield {
            type: 'plan',
            round,
            data: {
              operations: plan.operations || [],
              final: plan.final,
              taskStatus: plan.taskStatus || null  // 傳遞任務狀態
            }
          };

          // 捕獲AI的任務狀態更新
          if (plan.taskStatus) {
            // 更新任務追蹤歷史
            if (Array.isArray(plan.taskStatus.completed)) {
              taskStatusHistory.completed = plan.taskStatus.completed;
            }
            if (typeof plan.taskStatus.current === 'string') {
              taskStatusHistory.current = plan.taskStatus.current;
            }
            if (Array.isArray(plan.taskStatus.pending)) {
              taskStatusHistory.pending = plan.taskStatus.pending;
            }

            // 輸出任務狀態到UI
            yield {
              type: 'task_status',
              round,
              status: {
                completed: taskStatusHistory.completed,
                current: taskStatusHistory.current,
                pending: taskStatusHistory.pending
              }
            };

            console.log('[StreamingMultiHop] 任務狀態更新:', taskStatusHistory);
          }

          // 捕獲AI關於地圖包含的決策
          if (plan.includeMapInFinalContext === true) {
            aiRequestedMapInFinalContext = true;
            console.log('[StreamingMultiHop] AI請求在最終上下文中包含地圖概覽');
          }

          // 捕獲AI關於意群列表包含的決策
          if (plan.includeGroupListInFinalContext === true) {
            aiRequestedGroupListInFinalContext = true;
            console.log('[StreamingMultiHop] AI請求在最終上下文中包含意群簡要列表');
          }

          parseSuccess = true; // 成功解析，退出重試迴圈
        } catch (e) {
          console.error('[streamingMultiHop] 解析計劃失敗:', e.message);
          console.error('[streamingMultiHop] LLM原始輸出:', plannerOutput);

          retryCount++;

          if (retryCount <= maxRetries) {
            // 還有重試機會，構造錯誤提示
            const errorFeedback = `\n\n【上次輸出解析失敗】\n錯誤資訊: ${e.message}\n你的輸出: ${plannerOutput.substring(0, 300)}\n\n請注意：\n1. 必須輸出嚴格的JSON格式\n2. 字串中的特殊字元需要轉義（如 $ 應寫成 \\$ 或避免使用）\n3. 不要在JSON字串值中使用 | $ \\ 等特殊字元，或使用中文替代\n4. 示例正確格式：{"operations":[{"tool":"grep","args":{"query":"公式 模型 迴歸","limit":10}}],"final":false}\n\n請重新輸出正確的JSON：`;
            content = content + errorFeedback;
            console.log(`[streamingMultiHop] 準備第 ${retryCount} 次重試，已新增錯誤提示`);
          } else {
            // 重試耗盡，執行原有的fallback邏輯
            yield {
              type: 'error',
              phase: 'parse_plan',
              message: `解析計劃失敗（已重試${maxRetries}次）: ${e.message}`,
              raw: plannerOutput
            };

            // 如果已經獲取到內容，直接使用，不要丟棄
            if (fetched.size > 0) {
              yield {
                type: 'warning',
                message: `第 ${round + 1} 輪規劃失敗，但已獲取 ${fetched.size} 個意群，使用已有內容`
              };
              break; // 結束for迴圈，使用已fetch的內容
            }

            // 只有在完全沒有內容時才使用後備策略
            const fallback = buildFallbackSemanticContext(userQuestion, groups);
            if (fallback) {
              yield {
                type: 'fallback',
                reason: 'parse-error',
                context: fallback.context
              };
              return fallback;
            }
            break; // 結束for迴圈
          }
        }
        } // 結束重試while迴圈

        // 如果重試迴圈結束但沒有成功解析，跳過這一輪
        if (!parseSuccess) {
          console.log('[streamingMultiHop] 解析失敗且已耗盡重試次數，跳過本輪');
          continue; // 繼續下一輪round
        }

        let ops = Array.isArray(plan.operations) ? plan.operations : [];

        // 若首輪規劃為空且尚無任何已獲取內容，自動注入一次預設檢索，避免空轉
        if (round === 0 && ops.length === 0 && fetched.size === 0) {
          const buildDefaultOpsFromQuestion = (q, preferVector) => {
            try {
              const raw = String(q || '').toLowerCase();
              // 去掉無資訊量的泛化詞
              const stop = /(用通俗語言|通俗解釋|解釋一下|解釋|概述|總結|主要內容|全文|請|如何|是什麼|簡單|大致|大概|說明|講一講|講一下|闡述|簡介|介紹|說明一下)/g;
              const cleaned = raw.replace(stop, ' ').replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
              const tokens = cleaned.split(/\s+/).filter(w => w && w.length > 1);
              const query = tokens.slice(0, 6).join(' ');
              if (!query) return [];
              if (preferVector) {
                return [{ tool: 'vector_search', args: { query, limit: 8 } }];
              } else {
                return [{ tool: 'grep', args: { query, limit: 12, context: 2000, caseInsensitive: true } }];
              }
            } catch (_) { return []; }
          };

          // 判斷是否可用向量（來自前面的配置判斷）
          const docIdTmp = (window.data && window.data.currentPdfName) || 'unknown';
          const docCfgTmp = window.data?.multiHopConfig?.[docIdTmp];
          const preferVector = docCfgTmp?.useVectorSearch !== false;
          const injected = buildDefaultOpsFromQuestion(userQuestion, preferVector);
          if (injected && injected.length > 0) {
            ops = injected;
            yield { type: 'info', message: '規劃為空，已自動注入預設檢索' };
          }
        }

        // 如果operations為空但已有內容，說明AI認為當前內容已足夠
        if (ops.length === 0) {
          if (fetched.size > 0) {
            yield {
              type: 'info',
              message: `AI判斷已有 ${fetched.size} 個意群的內容足夠回答問題，結束取材`
            };
            break; // 直接使用已有內容，不觸發fallback
          }

          // 只有在完全沒有內容時才使用後備策略
          yield { type: 'warning', message: '規劃無操作且無已獲取內容，使用後備策略' };
          const fallback = buildFallbackSemanticContext(userQuestion, groups);
          if (fallback) {
            yield {
              type: 'fallback',
              reason: 'empty-ops',
              context: fallback.context
            };
            return fallback;
          }
          break;
        }

        // 3. 執行工具
        for (const [opIndex, op] of ops.entries()) {
          yield {
            type: 'tool_start',
            round,
            opIndex,
            tool: op.tool,
            args: op.args
          };

          try {
            // 檢查文件配置
            const docId = (window.data && window.data.currentPdfName) || 'unknown';
            const docConfig = window.data?.multiHopConfig?.[docId];
            const useSemanticGroups = docConfig?.useSemanticGroups !== false;
            const useVectorSearch = docConfig?.useVectorSearch !== false;

            if (op.tool === 'vector_search' && op.args) {
              if (!useVectorSearch) {
                throw new Error('向量搜尋功能已禁用，vector_search不可用');
              }

              // 向量語義搜尋chunks
              const query = String(op.args.query || userQuestion);
              const limit = Math.min(Number(op.args.limit) || 15, 30);

              if (window.SemanticVectorSearch && window.EmbeddingClient?.config?.enabled) {
                // 獲取enrichedChunks
                const chunks = window.data?.enrichedChunks || [];
                const res = await window.SemanticVectorSearch.search(query, chunks, {
                  topK: limit,
                  threshold: 0.3
                });

                // 記錄搜尋結果（包括無結果的情況）
                const resultCount = (Array.isArray(res) && res.length) ? res.length : 0;
                searchHistory.push({ tool: 'vector_search', query, resultCount });

                if (resultCount > 0) {
                  // 只新增搜尋到的chunks完整文字，不自動fetch意群
                  res.forEach((r, idx) => {
                    const chunkText = r.text || '';
                    if (chunkText) {
                      contextParts.push(`【向量搜尋片段${idx + 1}】(chunk-${r.chunkId}, 來自${r.belongsToGroup}, 相似度${r.score.toFixed(3)})\n${chunkText}`);
                    }
                  });

                  // 提取所屬意群資訊，供AI判斷
                  const groupIds = new Set();
                  res.forEach(r => {
                    if (r.belongsToGroup) {
                      groupIds.add(r.belongsToGroup);
                      interestedGroups.add(r.belongsToGroup); // 標記AI感興趣的意群
                    }
                  });

                  console.log(`[StreamingMultiHop] 向量搜尋命中 ${resultCount} 個chunks，所屬意群: [${Array.from(groupIds).join(', ')}]`);

                  // 計算返回內容的token數
                  const returnedText = res.map(r => r.text).join('\n');
                  const contentTokens = estimateTokens(returnedText);

                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'vector_search',
                    result: res.map(r => ({
                      chunkId: r.chunkId,
                      belongsToGroup: r.belongsToGroup,
                      score: r.score,
                      rerankScore: r.rerankScore, // 重排分數（如果有）
                      originalScore: r.originalScore, // 原始向量分數（如果有）
                      preview: r.text.substring(0, 500)
                    })),
                    suggestedGroups: Array.from(groupIds), // 提示AI可以fetch這些意群
                    tokens: contentTokens // 返回內容的token數
                  };
                } else {
                  // 明確返回空結果，便於UI閉環
                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'vector_search',
                    result: []
                  };
                }
              }

            } else if (op.tool === 'keyword_search' && op.args) {
              // 關鍵詞精確比對
              const keywords = Array.isArray(op.args.keywords) ? op.args.keywords : [String(op.args.keywords || '')];
              const limit = Math.min(Number(op.args.limit) || 8, 30);

              if (window.SemanticBM25Search) {
                // 使用BM25進行關鍵詞搜尋chunks（不做n-gram拆分）
                const chunks = window.data?.enrichedChunks || [];
                const res = window.SemanticBM25Search.searchChunksKeywords(keywords, chunks, {
                  topK: limit,
                  threshold: 0.0
                });

                // 記錄搜尋結果（包括無結果的情況）
                const resultCount = (Array.isArray(res) && res.length) ? res.length : 0;
                searchHistory.push({ tool: 'keyword_search', query: keywords.join(','), resultCount });

                if (resultCount > 0) {
                  // 只新增搜尋到的chunks完整文字，不自動fetch意群
                  res.forEach((r, idx) => {
                    const chunkText = r.text || '';
                    if (chunkText) {
                      const matched = keywords.filter(kw => chunkText.includes(kw)).join(', ');
                      contextParts.push(`【關鍵詞搜尋片段${idx + 1}】(chunk-${r.chunkId}, 來自${r.belongsToGroup}, 比對詞: ${matched})\n${chunkText}`);
                    }
                  });

                  // 提取所屬意群資訊，供AI判斷
                  const groupIds = new Set();
                  res.forEach(r => {
                    if (r.belongsToGroup) {
                      groupIds.add(r.belongsToGroup);
                      interestedGroups.add(r.belongsToGroup); // 標記AI感興趣的意群
                    }
                  });

                  console.log(`[StreamingMultiHop] 關鍵詞搜尋命中 ${resultCount} 個chunks，所屬意群: [${Array.from(groupIds).join(', ')}]`);

                  // 計算返回內容的token數
                  const returnedText = res.map(r => r.text).join('\n');
                  const contentTokens = estimateTokens(returnedText);

                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'keyword_search',
                    result: res.map(r => ({
                      chunkId: r.chunkId,
                      belongsToGroup: r.belongsToGroup,
                      preview: r.text.substring(0, 500),
                      matchedKeywords: keywords.filter(kw => r.text.includes(kw))
                    })),
                    suggestedGroups: Array.from(groupIds), // 提示AI可以fetch這些意群
                    tokens: contentTokens
                  };
                } else {
                  // 明確返回空結果，便於UI閉環
                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'keyword_search',
                    result: []
                  };
                }
              }

            } else if ((op.tool === 'fetch' || op.tool === 'fetch_group') && op.args) {
              if (!useSemanticGroups) {
                throw new Error('意群功能已禁用，fetch不可用');
              }

              const id = op.args.groupId;
              const gran = (op.args.granularity || (op.tool === 'fetch' ? 'full' : 'digest'));

              interestedGroups.add(id); // 標記AI感興趣的意群

              const existing = fetched.get(id);

              // 如果已經有了，檢查是否需要升級
              if (existing) {
                const needUpgrade = (existing.granularity === 'summary' && gran !== 'summary') ||
                                   (existing.granularity === 'digest' && gran === 'full');

                if (needUpgrade) {
                  // 需要升級，執行fetch（優先詳細介面）
                  let res = null;
                  if (op.tool === 'fetch' && typeof window.SemanticTools?.fetchGroupDetailed === 'function') {
                    res = window.SemanticTools.fetchGroupDetailed(id);
                  } else if (typeof window.SemanticTools?.fetchGroupText === 'function') {
                    res = window.SemanticTools.fetchGroupText(id, gran);
                  }
                  if (res && res.text) {
                    fetched.set(id, { granularity: res.granularity, text: res.text });

                    const idx = detail.findIndex(d => d.groupId === id);
                    if (idx >= 0) detail[idx].granularity = res.granularity;

                    const ctxIdx = contextParts.findIndex(c => c.startsWith(`【${id}`));
                    if (ctxIdx >= 0) {
                      contextParts[ctxIdx] = `【${id} - ${res.granularity}】\n${res.text}`;
                    }

                    yield {
                      type: 'tool_result',
                      round,
                      opIndex,
                      tool: op.tool,
                      result: {
                        groupId: id,
                        granularity: res.granularity,
                        preview: res.text.slice(0, 200),
                        action: 'upgraded'
                      },
                      tokens: estimateTokens(res.text)
                    };
                  }
                } else {
                  // 已有更高階別的，跳過
                  yield {
                    type: 'tool_skip',
                    round,
                    opIndex,
                    tool: op.tool,
                    reason: existing.granularity === gran ? 'already_fetched' : 'higher_granularity_exists',
                    groupId: id,
                    existingGranularity: existing.granularity
                  };
                }
              } else {
                // 不存在，執行fetch
                let res = null;
                if (op.tool === 'fetch' && typeof window.SemanticTools?.fetchGroupDetailed === 'function') {
                  res = window.SemanticTools.fetchGroupDetailed(id);
                } else if (typeof window.SemanticTools?.fetchGroupText === 'function') {
                  res = window.SemanticTools.fetchGroupText(id, gran);
                }

                if (res && res.text) {
                  fetched.set(id, { granularity: res.granularity, text: res.text });
                  detail.push({ groupId: id, granularity: res.granularity });
                  contextParts.push(`【${id} - ${res.granularity}】\n${res.text}`);

                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: op.tool,
                    result: {
                      groupId: id,
                      granularity: res.granularity,
                      preview: res.text.slice(0, 200)
                    },
                    tokens: estimateTokens(res.text)
                  };
                }
              }
            } else if (op.tool === 'map') {
              if (!useSemanticGroups) {
                throw new Error('意群功能已禁用，map不可用');
              }

              // 生成候選意群地圖（結構+摘要）
              const limit = Math.min(Number(op.args?.limit) || 50, candidates.length);
              const includeStructure = op.args?.includeStructure !== false;
              const items = candidates.slice(0, limit).map(g => {
                const struct = g.structure || {};
                const parts = [`【${g.groupId}】 ${g.charCount || 0}字`];
                if (includeStructure && struct.orderedElements && struct.orderedElements.length > 0) {
                  const typeIcons = { 'title': '📌', 'section': '▸', 'keypoint': '•', 'figure': '🖼', 'table': '📊', 'formula': '📐' };
                  struct.orderedElements.forEach(elem => {
                    const icon = typeIcons[elem.type] || '-';
                    parts.push(`  ${icon} ${elem.content}`);
                  });
                } else {
                  if (g.keywords && g.keywords.length > 0) parts.push(`關鍵詞: ${g.keywords.join('、')}`);
                  const s = g.structure || {};
                  if (s.sections && s.sections.length > 0) parts.push(`章節: ${s.sections.join('; ')}`);
                  if (s.keyPoints && s.keyPoints.length > 0) parts.push(`要點: ${s.keyPoints.join('; ')}`);
                }
                if (g.summary) parts.push(`摘要: ${g.summary}`);
                return parts.join('\n');
              });
              const mapText = items.join('\n\n');
              window._multiHopLastMapText = mapText; // 供下一輪規劃使用

              // 記錄已生成地圖（用於最終彙總時判斷是否需要包含地圖）
              window._multiHopHasMap = true;
              window._multiHopMapSummary = {
                text: mapText,
                count: items.length,
                includeStructure: includeStructure
              };

              // 自動策略：AI主動呼叫map工具，說明需要地圖資訊，自動包含到最終上下文
              aiRequestedMapInFinalContext = true;
              console.log('[StreamingMultiHop] AI呼叫map工具，自動將地圖包含到最終上下文');

              yield {
                type: 'tool_result',
                round,
                opIndex,
                tool: 'map',
                result: { count: items.length },
                tokens: estimateTokens(mapText)
              };
            } else if (op.tool === 'grep' && op.args) {
              // 傳統文字搜尋，支援多關鍵詞OR查詢（用|分隔）
              const q = String(op.args.query || '').trim();
              const limit = Math.min(Number(op.args.limit) || 20, 100);
              const ctxChars = Math.min(Number(op.args.context) || 2000, 4000); // 預設提升到2000字元
              const caseInsensitive = !!op.args.caseInsensitive;
              const chunks = window.data?.enrichedChunks || [];
              const hits = [];

              if (q) {
                // 支援OR邏輯：將 "方程|公式|k-ε" 拆分為多個關鍵詞
                const keywords = q.includes('|') ? q.split('|').map(k => k.trim()).filter(k => k) : [q];
                console.log(`[StreamingMultiHop] GREP搜尋關鍵詞: [${keywords.join(', ')}]`);

                // 1) 整篇文件
                const docText = String(docContentInfo.translation || docContentInfo.ocr || '');
                if (docText) {
                  const hay = caseInsensitive ? docText.toLowerCase() : docText;

                  for (const keyword of keywords) {
                    const needle = caseInsensitive ? keyword.toLowerCase() : keyword;
                    let from = 0;
                    while (from < hay.length) {
                      const pos = hay.indexOf(needle, from);
                      if (pos < 0) break;
                      const end = pos + keyword.length;
                      const s = Math.max(0, pos - ctxChars);
                      const e = Math.min(docText.length, end + ctxChars);
                      const snippet = docText.slice(s, e);
                      hits.push({
                        preview: snippet,
                        matchOffset: pos,
                        matchLength: keyword.length,
                        matchedKeyword: keyword  // 記錄比對的關鍵詞
                      });
                      from = end;
                      if (hits.length >= limit) break;
                    }
                    if (hits.length >= limit) break;
                  }
                }

                // 2) chunks 級（補充）
                if (hits.length < limit && Array.isArray(chunks) && chunks.length > 0) {
                  for (const keyword of keywords) {
                    const needle = caseInsensitive ? keyword.toLowerCase() : keyword;
                    for (const chunk of chunks) {
                      const text = String(chunk.text || '');
                      if (!text) continue;
                      const hay = caseInsensitive ? text.toLowerCase() : text;
                      const pos = hay.indexOf(needle);
                      if (pos >= 0) {
                        const end = pos + keyword.length;
                        const s = Math.max(0, pos - ctxChars);
                        const e = Math.min(text.length, end + ctxChars);
                        const snippet = text.slice(s, e);
                        hits.push({
                          chunkId: chunk.chunkId,
                          belongsToGroup: chunk.belongsToGroup,
                          preview: snippet,
                          matchOffset: pos,
                          matchLength: keyword.length,
                          matchedKeyword: keyword
                        });
                        if (hits.length >= limit) break;
                      }
                    }
                    if (hits.length >= limit) break;
                  }
                }
              }

              if (hits.length > 0) {
                // 新增grep搜尋到的片段（精確比對的上下文）
                console.log(`[StreamingMultiHop] GREP命中 ${hits.length} 個片段，準備新增到contextParts`);
                hits.forEach((h, idx) => {
                  const src = h.belongsToGroup ? `chunk-${h.chunkId}, 來自${h.belongsToGroup}` : '全文';
                  const contextItem = `【GREP片段${idx + 1}】(${src})\n${h.preview}`;
                  contextParts.push(contextItem);
                  console.log(`[StreamingMultiHop] 新增GREP片段${idx + 1}，長度: ${contextItem.length}字元`);
                });

                // 提取所屬意群資訊，供AI判斷
                const groupIds = new Set();
                hits.forEach(h => {
                  if (h.belongsToGroup) {
                    groupIds.add(h.belongsToGroup);
                    interestedGroups.add(h.belongsToGroup); // 標記AI感興趣的意群
                  }
                });

                if (groupIds.size > 0) {
                  console.log(`[StreamingMultiHop] GREP搜尋命中 ${hits.length} 個片段，所屬意群: [${Array.from(groupIds).join(', ')}]`);
                } else {
                  console.log(`[StreamingMultiHop] GREP搜尋命中 ${hits.length} 個片段（來自全文，無所屬意群）`);
                }
              } else {
                console.log(`[StreamingMultiHop] GREP搜尋"${q}"無結果`);
              }

              // 記錄搜尋結果（包括無結果的情況）
              searchHistory.push({ tool: 'grep', query: q, resultCount: hits.length });

              const groupIds = new Set();
              hits.forEach(h => { if (h.belongsToGroup) groupIds.add(h.belongsToGroup); });

              // 計算返回內容的token數
              const returnedText = hits.map(h => h.preview).join('\n');
              const contentTokens = estimateTokens(returnedText);

              yield {
                type: 'tool_result',
                round,
                opIndex,
                tool: 'grep',
                result: hits.map(h => ({
                  preview: h.preview.substring(0, 500),
                  belongsToGroup: h.belongsToGroup,
                  chunkId: h.chunkId
                })),
                suggestedGroups: Array.from(groupIds), // 提示AI可以fetch這些意群
                tokens: contentTokens
              };
            } else if (op.tool === 'regex_search' && op.args) {
              // 正規表示式搜尋
              if (!window.AdvancedSearchTools) {
                throw new Error('AdvancedSearchTools 模組未載入');
              }

              const pattern = String(op.args.pattern || '');
              const limit = Math.min(Number(op.args.limit) || 10, 50);
              const ctxChars = Math.min(Number(op.args.context) || 1500, 4000);
              const caseInsensitive = op.args.caseInsensitive !== false;

              const docText = String(docContentInfo.translation || docContentInfo.ocr || '');
              const chunks = window.data?.enrichedChunks || [];

              if (!docText && chunks.length === 0) {
                throw new Error('沒有可搜尋的文字內容');
              }

              try {
                const results = window.AdvancedSearchTools.regexSearch(
                  pattern,
                  docText,
                  { limit, context: ctxChars, caseInsensitive }
                );

                if (results.length > 0) {
                  // 新增正則搜尋結果到上下文
                  results.forEach((r, idx) => {
                    contextParts.push(`【正則搜尋片段${idx + 1}】(比對: "${r.match}")\n${r.preview}`);
                  });

                  // 嘗試關聯到chunks和意群
                  const groupIds = new Set();
                  results.forEach(r => {
                    // 查詢包含此比對的chunk
                    const matchingChunk = chunks.find(chunk =>
                      chunk.text && chunk.text.includes(r.match)
                    );
                    if (matchingChunk?.belongsToGroup) {
                      groupIds.add(matchingChunk.belongsToGroup);
                      interestedGroups.add(matchingChunk.belongsToGroup);
                    }
                  });

                  console.log(`[StreamingMultiHop] 正則搜尋命中 ${results.length} 個片段`);

                  const returnedText = results.map(r => r.preview).join('\n');
                  const contentTokens = estimateTokens(returnedText);

                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'regex_search',
                    result: results.map(r => ({
                      match: r.match,
                      preview: r.preview.substring(0, 500),
                      groups: r.groups
                    })),
                    suggestedGroups: Array.from(groupIds),
                    tokens: contentTokens
                  };
                } else {
                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'regex_search',
                    result: []
                  };
                }
              } catch (regexError) {
                throw new Error(`正規表示式錯誤: ${regexError.message}`);
              }

              // 記錄搜尋歷史
              searchHistory.push({ tool: 'regex_search', query: pattern, resultCount: results.length || 0 });

            } else if (op.tool === 'boolean_search' && op.args) {
              // 布林邏輯搜尋
              if (!window.AdvancedSearchTools) {
                throw new Error('AdvancedSearchTools 模組未載入');
              }

              const query = String(op.args.query || '');
              const limit = Math.min(Number(op.args.limit) || 10, 50);
              const ctxChars = Math.min(Number(op.args.context) || 1500, 4000);
              const caseInsensitive = op.args.caseInsensitive !== false;

              const docText = String(docContentInfo.translation || docContentInfo.ocr || '');
              const chunks = window.data?.enrichedChunks || [];

              if (!docText && chunks.length === 0) {
                throw new Error('沒有可搜尋的文字內容');
              }

              try {
                const results = window.AdvancedSearchTools.booleanSearch(
                  query,
                  docText,
                  { limit, context: ctxChars, caseInsensitive }
                );

                if (results.length > 0) {
                  // 新增布林搜尋結果到上下文
                  results.forEach((r, idx) => {
                    const terms = r.matchedTerms.join(', ');
                    contextParts.push(`【布林搜尋片段${idx + 1}】(比對詞: ${terms}, 相關度: ${r.relevanceScore})\n${r.preview}`);
                  });

                  // 嘗試關聯到chunks和意群
                  const groupIds = new Set();
                  results.forEach(r => {
                    const matchingChunk = chunks.find(chunk =>
                      chunk.text && r.matchedTerms.some(term => chunk.text.includes(term))
                    );
                    if (matchingChunk?.belongsToGroup) {
                      groupIds.add(matchingChunk.belongsToGroup);
                      interestedGroups.add(matchingChunk.belongsToGroup);
                    }
                  });

                  console.log(`[StreamingMultiHop] 布林搜尋命中 ${results.length} 個片段`);

                  const returnedText = results.map(r => r.preview).join('\n');
                  const contentTokens = estimateTokens(returnedText);

                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'boolean_search',
                    result: results.map(r => ({
                      preview: r.preview.substring(0, 500),
                      matchedTerms: r.matchedTerms,
                      relevanceScore: r.relevanceScore
                    })),
                    suggestedGroups: Array.from(groupIds),
                    tokens: contentTokens
                  };
                } else {
                  yield {
                    type: 'tool_result',
                    round,
                    opIndex,
                    tool: 'boolean_search',
                    result: []
                  };
                }
              } catch (boolError) {
                throw new Error(`布林查詢錯誤: ${boolError.message}`);
              }

              // 記錄搜尋歷史
              searchHistory.push({ tool: 'boolean_search', query, resultCount: results.length || 0 });
            }

          } catch (toolError) {
            yield {
              type: 'tool_error',
              round,
              opIndex,
              tool: op.tool,
              error: toolError.message
            };
          }
        }

        // 第一輪結束後，清理不相關的預載入內容
        // 保護機制：
        // 1. 只有當找到足夠多（>=3）的感興趣意群時才清理，避免在"大海撈針"場景中誤刪
        // 2. 如果第一輪沒有進行任何搜尋，不清理（可能AI還在探索階段）
        const hasSearch = searchHistory.some(h => h.tool === 'vector_search' || h.tool === 'keyword_search' || h.tool === 'grep');
        console.log(`[StreamingMultiHop] 第${round + 1}輪結束，hasSearch=${hasSearch}, interestedGroups.size=${interestedGroups.size}, contextParts.length=${contextParts.length}`);

        if (round === 0 && preloadedInFirstRound && interestedGroups.size >= 3 && hasSearch) {
          // 清理fetched：只保留AI感興趣的意群
          for (const [groupId] of fetched.entries()) {
            if (!interestedGroups.has(groupId)) {
              fetched.delete(groupId);
            }
          }

          // 清理detail：只保留AI感興趣的意群
          const filteredDetail = detail.filter(d => interestedGroups.has(d.groupId));
          detail.length = 0;
          detail.push(...filteredDetail);

          // 清理contextParts：只保留搜尋片段和AI感興趣的意群
          const filteredContextParts = contextParts.filter(part => {
            // 保留搜尋片段
            if (part.startsWith('【向量搜尋片段') ||
                part.startsWith('【關鍵詞搜尋片段') ||
                part.startsWith('【GREP片段') ||
                part.startsWith('【正則搜尋片段') ||
                part.startsWith('【布林搜尋片段')) {
              return true;
            }
            // 保留AI感興趣的意群
            for (const groupId of interestedGroups) {
              if (part.startsWith(`【${groupId}`)) {
                return true;
              }
            }
            return false;
          });
          contextParts.length = 0;
          contextParts.push(...filteredContextParts);

          const removedCount = groups.length - interestedGroups.size;
          if (removedCount > 0) {
            yield {
              type: 'info',
              message: `已清理 ${removedCount} 個不相關意群，保留 ${interestedGroups.size} 個AI感興趣的內容`
            };
          }
        }

        // 檢查是否final：優先尊重AI的final判斷
        const hadContextThisRound = contextParts.length > 0 || detail.length > 0;
        console.log(`[StreamingMultiHop] 第${round + 1}輪結束檢查：contextParts=${contextParts.length}, detail=${detail.length}, final=${plan.final}`);

        // 若首輪沒有任何搜尋也沒有上下文，發出提示，繼續下一輪（已在執行階段注入預設檢索）
        if (round === 0 && !hasSearch && !hadContextThisRound) {
          yield { type: 'warning', message: '首輪未產生上下文，將繼續並執行預設檢索' };
        }

        // 優先判斷：AI明確說final=true，直接結束
        if (plan.final === true) {
          yield {
            type: 'round_end',
            round,
            final: true,
            message: 'AI判斷內容已充分，取材完成'
          };
          break;
        }

        // 次要判斷：AI說final=false，但已經到最後一輪了，強制結束
        if (round === maxRounds - 1 && hadContextThisRound) {
          yield {
            type: 'round_end',
            round,
            final: true,
            message: '已達最大輪次，使用已獲取內容'
          };
          break;
        }

        // 繼續下一輪
        yield {
          type: 'round_end',
          round,
          final: false,
          message: '繼續下一輪取材...'
        };
      }

      // 4. 彙總上下文 - 智慧分層策略
      // 先構建AI請求的上下文元件（地圖和意群列表）
      let mapOverview = '';
      let groupListOverview = '';

      // 1. 地圖概覽（如果AI請求）
      if (aiRequestedMapInFinalContext && window._multiHopLastMapText) {
        mapOverview = `【📋 文件整體結構地圖】\n${window._multiHopLastMapText}\n\n`;
        console.log(`[StreamingMultiHop] AI請求包含地圖，已新增地圖概覽 (${window._multiHopLastMapText.length}字)`);
      }

      // 2. 意群簡要列表（如果AI請求）
      if (aiRequestedGroupListInFinalContext && groups && groups.length > 0) {
        const simplifiedList = groups.map(g => {
          const charCount = g.charCount || 0;
          const summary = g.summary || '無摘要';
          const keywords = (g.keywords && g.keywords.length > 0) ? ` [${g.keywords.slice(0, 3).join('、')}]` : '';
          return `【${g.groupId}】${charCount}字${keywords} - ${summary}`;
        }).join('\n');
        groupListOverview = `【📑 所有意群簡要列表】(共${groups.length}個意群)\n${simplifiedList}\n\n`;
        console.log(`[StreamingMultiHop] AI請求包含意群列表，已新增 ${groups.length} 個意群的簡要資訊`);
      }

      // 檢查是否有任何有用內容：搜尋片段 OR fetch的意群 OR 地圖 OR 意群列表
      const hasAnyContent = contextParts.length > 0 || mapOverview || groupListOverview;

      if (!hasAnyContent) {
        yield { type: 'warning', message: '未獲取到任何上下文，使用後備策略' };
        const fallback = buildFallbackSemanticContext(userQuestion, groups);
        if (fallback) {
          yield {
            type: 'fallback',
            reason: 'empty-context',
            context: fallback.context
          };
          return fallback;
        }
        return null;
      }

      // 分層組織：地圖概要(可選) + 搜尋片段(最精確) + 重點意群(digest) + 背景意群(summary)
      const searchFragments = [];  // 搜尋到的chunk完整文字
      const summaryParts = [];      // summary粒度的意群
      const detailParts = [];       // digest/full粒度的意群

      // 分類contextParts
      contextParts.forEach(part => {
        if (part.startsWith('【向量搜尋片段') ||
            part.startsWith('【關鍵詞搜尋片段') ||
            part.startsWith('【GREP片段') ||
            part.startsWith('【正則搜尋片段') ||
            part.startsWith('【布林搜尋片段')) {
          searchFragments.push(part);
        }
      });

      // 分類detail中的意群
      const granularityCount = { full: 0, digest: 0, summary: 0 };
      detail.forEach(d => {
        const data = fetched.get(d.groupId);
        const part = `【${d.groupId} - ${d.granularity}】\n${data.text}`;

        granularityCount[d.granularity] = (granularityCount[d.granularity] || 0) + 1;

        if (d.granularity === 'summary') {
          summaryParts.push(part);
        } else {
          detailParts.push(part);
        }
      });

      // 構建分層上下文 - AI自主控制的元件順序
      let selectedContext = '';
      const layers = [];

      // 1. 地圖概覽（AI請求時）
      if (mapOverview) {
        layers.push(mapOverview);
      }

      // 2. 意群簡要列表（AI請求時，提供全域視角）
      if (groupListOverview) {
        layers.push(groupListOverview);
      }

      // 3. 搜尋片段（最精確的檢索結果）
      if (searchFragments.length > 0) {
        layers.push(`【🎯 搜尋片段】(${searchFragments.length}個精確比對的chunk，最優先使用)\n${searchFragments.join('\n\n')}`);
      }

      // 4. 重點意群（AI fetch的詳細內容）
      if (detailParts.length > 0) {
        layers.push(`【📖 重點意群】(${detailParts.length}個詳細內容，提供上下文)\n${detailParts.join('\n\n')}`);
      }

      // 5. 背景意群（summary粒度）
      if (summaryParts.length > 0) {
        layers.push(`【📋 背景意群】(${summaryParts.length}個簡要摘要，提供全域視角)\n${summaryParts.join('\n\n')}`);
      }

      selectedContext = layers.join('\n\n---\n\n');

      // 統計最終給AI的總token數
      const finalContextTokens = estimateTokens(selectedContext);

      const stats = {
        totalGroups: detail.length,
        searchFragments: searchFragments.length,
        focusGroups: detailParts.length,
        backgroundGroups: summaryParts.length,
        hasMap: aiRequestedMapInFinalContext,
        hasGroupList: aiRequestedGroupListInFinalContext,
        finalContextTokens  // 最終上下文的token數
      };

      if (searchFragments.length > 0 || detailParts.length > 0) {
        const msg = [];
        if (searchFragments.length > 0) msg.push(`${searchFragments.length}個搜尋片段`);
        if (detailParts.length > 0) {
          const parts = [];
          if (granularityCount.full > 0) parts.push(`${granularityCount.full}個full`);
          if (granularityCount.digest > 0) parts.push(`${granularityCount.digest}個digest`);
          msg.push(`${detailParts.length}個重點意群(${parts.join('+') || 'mixed'})`);
        }
        if (summaryParts.length > 0) msg.push(`${summaryParts.length}個背景意群(summary)`);

        yield {
          type: 'info',
          message: `三層上下文：${msg.join(' + ')}`
        };
      }

      yield {
        type: 'complete',
        context: selectedContext,
        summary: {
          groups: detail.map(d => d.groupId),
          granularity: 'mixed',
          detail,
          contextLength: selectedContext.length,
          stats
        }
      };

      return {
        groups: detail.map(d => d.groupId),
        granularity: 'mixed',
        detail,
        context: selectedContext,
        stats
      };

    } catch (error) {
      yield {
        type: 'error',
        phase: 'unknown',
        message: error.message,
        stack: error.stack
      };
      return null;
    }
  }

  // 後備策略（同步版本）
  function buildFallbackSemanticContext(userQuestion, groups) {
    try {
      if (!Array.isArray(groups) || groups.length === 0) return null;

      let picks = [];
      try {
        if (window.SemanticGrouper && typeof window.SemanticGrouper.quickMatch === 'function') {
          picks = window.SemanticGrouper.quickMatch(String(userQuestion || ''), groups) || [];
        }
      } catch (_) {}

      if (!picks || picks.length === 0) {
        picks = groups.slice(0, Math.min(3, groups.length));
      }

      const unique = new Set();
      const detail = [];
      const parts = [];

      picks.forEach(g => {
        if (!g || unique.size >= 3 || unique.has(g.groupId)) return;
        unique.add(g.groupId);

        let fetched = null;
        try {
          if (window.SemanticTools && typeof window.SemanticTools.fetchGroupText === 'function') {
            fetched = window.SemanticTools.fetchGroupText(g.groupId, 'digest');
          }
        } catch (_) {}

        const text = (fetched && fetched.text) || g.digest || g.summary || g.fullText || '';
        if (!text) return;

        const gran = (fetched && fetched.granularity) || 'digest';
        parts.push(`【${g.groupId}】\n關鍵詞: ${(g.keywords || []).join('、')}\n內容(${gran}):\n${text}`);
        detail.push({ groupId: g.groupId, granularity: gran });
      });

      if (parts.length === 0) return null;

      return {
        groups: Array.from(unique),
        granularity: 'mixed',
        detail,
        context: parts.join('\n\n')
      };
    } catch (e) {
      console.warn('[buildFallbackSemanticContext] 失敗:', e);
      return null;
    }
  }

  // 匯出
  window.streamingMultiHopRetrieve = streamingMultiHopRetrieve;

  console.log('[StreamingMultiHop] 流式多輪取材已載入');

})(window);
