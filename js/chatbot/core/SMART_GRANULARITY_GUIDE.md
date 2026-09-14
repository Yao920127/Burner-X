# 智慧粒度選擇器使用指南

## 📖 概述

智慧粒度選擇器根據問題型別自動選擇最佳的意群粒度（summary/digest/full），在資訊完整性和Token消耗之間取得最優平衡。

---

## 🎯 核心功能

### 1. 問題型別分析

自動識別4種問題型別：

| 問題型別 | 特徵 | 示例 |
|---------|------|------|
| **overview** | 概覽性問題 | "這篇文章講了什麼？"、"總結一下主要內容" |
| **analytical** | 分析性問題 | "為什麼會出現這個現象？"、"比較兩種方法的優缺點" |
| **extraction** | 資訊提取問題 | "實驗的具體步驟是什麼？"、"表3的資料是多少？" |
| **specific** | 具體性問題 | 其他具體查詢（預設型別） |

### 2. 粒度自動選擇

根據問題型別選擇最佳粒度：

| 問題型別 | 推薦粒度 | 意群數量上限 | 說明 |
|---------|---------|------------|------|
| **overview** | summary | 10 | 快速掃描更多意群，獲得全域檢視 |
| **analytical** | digest | 5 | 平衡細節與數量，支援深入分析 |
| **extraction** | full | 3 | 確保資訊完整，精確提取資料 |
| **specific** | digest | 5 | 通用平衡策略 |

### 3. 動態調整

- **意群數量少時自動提升粒度**：
  - 2個意群：summary → digest
  - 1個意群：任何粒度 → full

- **Token超限時自動降級**：
  - full → digest
  - digest → summary
  - 或減少意群數量

- **根據意群特徵調整**：
  - 意群<2000字：直接用full
  - 缺少digest：用full或summary替代

---

## 🚀 使用方法

### 基礎用法

```javascript
// 1. 單粒度選擇
const strategy = window.SmartGranularitySelector.selectGranularity(
  "這篇論文的主要貢獻是什麼？",
  semanticGroups,
  { maxTokens: 8000 }
);

console.log(strategy);
// {
//   granularity: 'digest',
//   maxGroups: 5,
//   queryType: 'analytical',
//   reasoning: '分析性查詢：使用精要提供足夠細節',
//   estimatedTokens: 2500
// }
```

### 混合粒度選擇

```javascript
// 2. 混合粒度選擇（更智慧）
const rankedGroups = [
  { group: semanticGroups[3], score: 0.95 },
  { group: semanticGroups[1], score: 0.82 },
  { group: semanticGroups[5], score: 0.71 },
  // ...
];

const selections = window.SmartGranularitySelector.selectMixedGranularity(
  "詳細說明第三章的實驗步驟",
  rankedGroups,
  { maxTokens: 8000 }
);

console.log(selections);
// [
//   { group: {...}, granularity: 'full', score: 0.95, tokens: 4000 },   // 最相關：full
//   { group: {...}, granularity: 'digest', score: 0.82, tokens: 2000 }, // 次相關：digest
//   { group: {...}, granularity: 'summary', score: 0.71, tokens: 500 }  // 其他：summary
// ]
```

### 構建上下文

```javascript
// 3. 構建混合粒度上下文
const context = window.SmartGranularitySelector.buildMixedContext(selections);

console.log(context);
// 【group-3 - full】
// 關鍵詞: 實驗設計、對照組、變數控制
// 內容:
// [完整文字...]
//
// 【group-1 - digest】
// 關鍵詞: 統計分析、假設檢驗
// 內容:
// [精要內容...]
//
// 【group-5 - summary】
// 關鍵詞: 結果討論、侷限性
// 內容:
// [摘要...]
```

---

## 🔧 整合到多輪取材

智慧粒度選擇器已整合到流式多輪取材中：

```javascript
// streaming-multi-hop.js 中的使用
async function* streamingMultiHopRetrieve(userQuestion, docContentInfo, config, options) {
  // 1. 自動分析問題型別
  const granularityStrategy = window.SmartGranularitySelector.selectGranularity(
    userQuestion,
    groups,
    { maxTokens: options.maxTokens || 8000 }
  );

  // 2. 通知UI
  yield {
    type: 'granularity_analysis',
    strategy: granularityStrategy
  };

  // 3. 在系統Prompt中提供建議
  const sys = `...
智慧粒度建議：
- 問題型別: ${granularityStrategy.queryType}
- 推薦粒度: ${granularityStrategy.granularity}
- 建議: ${granularityStrategy.reasoning}
- 意群數量上限: ${granularityStrategy.maxGroups}
...`;

  // LLM會參考這些建議生成fetch_group指令
}
```

---

## 📊 效能最佳化

### Token使用對比

| 場景 | 固定粒度 | 智慧粒度 | 節省 |
|-----|---------|---------|------|
| **概覽問題** | digest×5 = 5000 tokens | summary×10 = 800 tokens | 84% |
| **分析問題** | full×5 = 10000 tokens | digest×5 = 5000 tokens | 50% |
| **提取問題** | digest×5 = 5000 tokens | full×3 = 6000 tokens | -20% (值得) |

### 典型場景示例

**場景1：總結性問題**
```javascript
問題: "這本書的核心觀點是什麼？"
分析: overview型別
策略: summary × 10個意群 = 800 tokens
效果: 快速掃描全書，提取核心觀點
```

**場景2：詳細查詢**
```javascript
問題: "第五章表2的實驗資料是多少？"
分析: extraction型別
策略: full × 2個意群 = 8000 tokens
效果: 確保資料精確，不遺漏細節
```

**場景3：混合查詢**
```javascript
問題: "比較兩種演算法的效能差異，並解釋原因"
分析: analytical型別
策略:
  - 最相關意群: full × 1 = 4000 tokens
  - 次相關意群: digest × 2 = 2000 tokens
  - 其他意群: summary × 2 = 200 tokens
總計: 6200 tokens
效果: 平衡細節與覆蓋範圍
```

---

## 🎨 自定義規則

### 修改問題型別模式

```javascript
// 新增新的問題型別
window.SmartGranularitySelector.QUERY_PATTERNS.extraction.push(
  /列表|清單|list|enumerate/
);
```

### 調整粒度規則

```javascript
// 修改分析性問題的策略
window.SmartGranularitySelector.GRANULARITY_RULES.analytical = {
  default: 'full',      // 改為使用full
  maxGroups: 3,         // 減少意群數量
  description: '分析性查詢：使用全文深入分析'
};
```

### 自定義Token估算

```javascript
// 根據實際模型調整估算比例
const originalEstimate = window.SmartGranularitySelector.estimateTokenUsage;
window.SmartGranularitySelector.estimateTokenUsage = function(groups, granularity) {
  const baseTokens = originalEstimate(groups, granularity);
  // 為GPT-4調整係數（中文token比例更高）
  return Math.ceil(baseTokens * 1.3);
};
```

---

## 🐛 除錯技巧

### 檢視分析結果

```javascript
// 在瀏覽器主控台測試
const query = "這篇文章的主要結論是什麼？";
const groups = window.data.semanticGroups;

const strategy = window.SmartGranularitySelector.selectGranularity(query, groups);
console.table(strategy);
```

### 對比不同問題型別

```javascript
const queries = [
  "總結全文",
  "為什麼會出現這個結果？",
  "表3的資料是多少？",
  "第二章講了什麼？"
];

queries.forEach(q => {
  const s = window.SmartGranularitySelector.selectGranularity(q, groups);
  console.log(`\n問題: ${q}`);
  console.log(`型別: ${s.queryType}`);
  console.log(`粒度: ${s.granularity}`);
  console.log(`Token: ${s.estimatedTokens}`);
});
```

### 混合粒度視覺化

```javascript
const rankedGroups = groups.map((g, i) => ({
  group: g,
  score: 1 - i * 0.1
}));

const selections = window.SmartGranularitySelector.selectMixedGranularity(
  "詳細分析主要觀點",
  rankedGroups,
  { maxTokens: 8000 }
);

console.table(selections.map(s => ({
  groupId: s.group.groupId,
  granularity: s.granularity,
  score: s.score.toFixed(2),
  tokens: s.tokens
})));
```

---

## 🔍 常見問題

### Q1: 為什麼有時粒度和預期不一致？

**原因**：
1. Token限制觸發降級
2. 意群數量少自動提升粒度
3. 意群本身缺少某個粒度的資料

**解決**：
- 檢查`estimatedTokens`是否超限
- 檢視`adjustByGroupFeatures()`的調整邏輯
- 確保意群資料完整（summary/digest/full都存在）

### Q2: 如何強制使用特定粒度？

```javascript
const strategy = window.SmartGranularitySelector.selectGranularity(
  query,
  groups,
  { forceGranularity: 'full' }  // 強制使用full
);
```

### Q3: 混合粒度和單一粒度哪個更好？

| 特性 | 單一粒度 | 混合粒度 |
|-----|---------|---------|
| **實現複雜度** | 簡單 | 複雜 |
| **Token效率** | 一般 | 優秀 |
| **資訊完整性** | 一致 | 自適應 |
| **推薦場景** | 簡單查詢 | 複雜查詢 |

**建議**：
- 概覽問題：單一粒度（summary）
- 分析問題：混合粒度（最相關用full，其他用digest/summary）
- 提取問題：單一粒度（full）

### Q4: 如何最佳化Token使用？

```javascript
// 方案1：更激進的降級策略
const strategy = window.SmartGranularitySelector.selectGranularity(
  query,
  groups,
  { maxTokens: 5000 }  // 設定更低的限制
);

// 方案2：使用混合粒度
const selections = window.SmartGranularitySelector.selectMixedGranularity(
  query,
  rankedGroups,
  {
    maxTokens: 6000,
    // 自定義排序：確保最相關的在前面
  }
);

// 方案3：手動過濾低分意群
const filteredGroups = rankedGroups.filter(item => item.score > 0.5);
const selections = window.SmartGranularitySelector.selectMixedGranularity(
  query,
  filteredGroups,
  { maxTokens: 8000 }
);
```

---

## 🎁 最佳實踐

### 1. 結合向量搜尋

```javascript
// 先用向量搜尋獲取相關意群並排序
const rankedGroups = await window.SemanticVectorSearch.search(query, groups, {
  topK: 12,
  threshold: 0.3
});

// 再用智慧粒度選擇器決定每個意群的粒度
const selections = window.SmartGranularitySelector.selectMixedGranularity(
  query,
  rankedGroups,
  { maxTokens: 8000 }
);

// 構建上下文
const context = window.SmartGranularitySelector.buildMixedContext(selections);
```

### 2. 根據文件型別調整

```javascript
// 學術論文：更傾向使用digest
if (documentType === 'academic-paper') {
  window.SmartGranularitySelector.GRANULARITY_RULES.overview.default = 'digest';
}

// 小說：傾向使用full（保持情節連貫）
if (documentType === 'novel') {
  window.SmartGranularitySelector.GRANULARITY_RULES.analytical.default = 'full';
  window.SmartGranularitySelector.GRANULARITY_RULES.analytical.maxGroups = 3;
}
```

### 3. 監控和最佳化

```javascript
// 記錄粒度策略和實際效果
const strategy = window.SmartGranularitySelector.selectGranularity(query, groups);

console.log({
  query,
  queryType: strategy.queryType,
  granularity: strategy.granularity,
  estimatedTokens: strategy.estimatedTokens,
  actualTokens: null, // 實際呼叫後填充
  responseQuality: null, // 使用者反饋後填充
});

// 根據資料最佳化規則
```

---

## 📝 總結

智慧粒度選擇器透過以下方式最佳化對話質量：

1. **自動化**：無需使用者手動選擇粒度
2. **智慧化**：根據問題型別自動調整
3. **高效化**：在保證資訊完整的前提下最小化Token消耗
4. **靈活化**：支援混合粒度和動態調整

**核心價值**：
- 概覽問題節省 **80%+** Token
- 分析問題節省 **50%** Token
- 提取問題提升 **資訊完整性**
- 混合粒度兼顧 **效率與質量**

---

## 📄 相關文件

- [意群功能使用指南](../agents/SEMANTIC_GROUPS_USAGE.md)
- [向量搜尋使用指南](../agents/VECTOR_SEARCH_USAGE.md)
- [BM25檢索指南](../agents/BM25_SEARCH_GUIDE.md)
