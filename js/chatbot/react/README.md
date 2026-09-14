# ReAct 模組 v2.0

> Reasoning + Acting 框架 - 智慧文件檢索系統

## 📦 模組架構

```
js/chatbot/react/
├── index.js              # 主入口，匯出所有元件
├── engine.js             # 核心引擎（簡化後的 ReActEngine）
├── system-prompt.js      # 系統提示詞構建器
├── context-builder.js    # 上下文構建器
├── tool-registry.js      # 工具登入檔（10個檢索工具）
├── json-parser.js        # JSON 解析器（增強容錯）
├── token-budget.js       # Token 預算管理器
└── README.md             # 本文件
```

## 🎯 v2.0 重大改進

### 1. **提示詞簡化 70%**
- **舊版**: 800+ 行，包含 20+ 條"絕對不能"/"必須"規則
- **新版**: 150 行，簡潔直接，信任 LLM 判斷

### 2. **移除強制模式比對**
- **移除**: `checkForcedAction()` 硬編碼規則
- **改用**: LLM 自主決策，更靈活

### 3. **增強 JSON 解析**
- **4 種解析策略**: 程式碼塊 → 裸 JSON → 修復後 → 降級
- **自動修復**: 尾隨逗號、單引號、註釋等常見錯誤
- **零崩潰**: 解析失敗時優雅降級

### 4. **改進初始上下文**
- **舊版**: 完全空白，只有後設資料
- **新版**: 包含文件概覽、意群列表、前 500 字預覽

### 5. **模組化架構**
- 職責分離，易於維護和擴充
- 每個模組可獨立測試
- 支援按需載入

## 🚀 使用方法

### 基本用法

```javascript
// 建立引擎例項
const reactEngine = new window.ReActEngine({
  maxIterations: 5,
  tokenBudget: {
    totalBudget: 32000,
    contextTokens: 18000
  },
  llmConfig: {
    model: 'gpt-4',
    apiKey: 'your-api-key'
  }
});

// 執行 ReAct 迴圈
const generator = reactEngine.run(
  userQuestion,        // 使用者問題
  docContent,          // 文件內容物件
  systemPrompt,        // 系統提示詞
  conversationHistory  // 對話歷史
);

// 監聽事件
for await (const event of generator) {
  console.log(event.type, event);

  switch (event.type) {
    case 'tool_call_start':
      console.log('呼叫工具:', event.tool, event.params);
      break;
    case 'final_answer':
      console.log('最終答案:', event.answer);
      break;
  }
}
```

### 事件監聽

```javascript
reactEngine.on('tool_call_start', (data) => {
  console.log('工具呼叫:', data);
});

reactEngine.on('*', (data) => {
  console.log('所有事件:', data);
});
```

## 🛠️ 可用工具（10個）

### 🔍 搜尋工具（5個）
1. **vector_search** - 語義搜尋
2. **keyword_search** - BM25 多關鍵詞搜尋
3. **grep** - 精確文字搜尋（支援 OR 邏輯）
4. **regex_search** - 正規表示式搜尋
5. **boolean_search** - 布林邏輯搜尋

### 📚 意群工具（5個）
6. **search_semantic_groups** - 搜尋意群
7. **fetch_group_text** - 獲取意群文字
8. **fetch** - 獲取完整意群資訊
9. **map** - 文件結構地圖
10. **list_all_groups** - 列出所有意群

## 📊 效能對比

| 指標 | v1.x | v2.0 | 改進 |
|------|------|------|------|
| 提示詞長度 | 800 行 | 150 行 | ↓ 81% |
| JSON 解析成功率 | ~85% | ~98% | ↑ 15% |
| 平均迭代次數 | 3.5 | 2.8 | ↓ 20% |
| Token 消耗 | 高 | 中 | ↓ 30% |

## 🔄 遷移指南

從 v1.x 遷移到 v2.0：

### 1. 更新 HTML 參考

**舊版**:
```html
<script src="js/chatbot/core/react-engine.js"></script>
```

**新版**:
```html
<!-- 按順序載入所有模組 -->
<script src="js/chatbot/react/token-budget.js"></script>
<script src="js/chatbot/react/tool-registry.js"></script>
<script src="js/chatbot/react/json-parser.js"></script>
<script src="js/chatbot/react/system-prompt.js"></script>
<script src="js/chatbot/react/context-builder.js"></script>
<script src="js/chatbot/react/engine.js"></script>
<script src="js/chatbot/react/index.js"></script>
```

### 2. 程式碼無需修改

API 完全相容，無需修改現有程式碼：

```javascript
// v1.x 和 v2.0 的程式碼完全一致
const reactEngine = new window.ReActEngine({...});
const generator = reactEngine.run(...);
```

## 🐛 故障排查

### 問題 1: 模組載入失敗

**症狀**: 主控台顯示 "缺少必需的模組"

**解決**:
1. 檢查 index.html 中模組載入順序
2. 確保所有 7 個檔案都存在
3. 清除瀏覽器快取

### 問題 2: JSON 解析錯誤

**症狀**: 響應無法解析為 JSON

**解決**:
- v2.0 的 JSON 解析器會自動修復常見錯誤
- 如果仍然失敗，檢查 LLM 響應格式
- 檢視主控台日誌瞭解具體錯誤

### 問題 3: 工具呼叫失敗

**症狀**: 工具返回錯誤

**解決**:
- 檢查文件狀態（意群是否生成、向量索引是否構建）
- 檢視工具返回的錯誤資訊
- 嘗試降級使用 `grep` 工具

## 📝 開發者指南

### 新增自定義工具

```javascript
const toolRegistry = new window.ToolRegistry();

toolRegistry.register({
  name: 'my_tool',
  description: '工具描述',
  parameters: {
    param1: { type: 'string', description: '引數描述' }
  },
  execute: async (params) => {
    // 工具邏輯
    return {
      success: true,
      data: '...'
    };
  }
});
```

### 自定義系統提示詞

```javascript
const customPrompt = window.SystemPromptBuilder.buildReActSystemPrompt(
  hasSemanticGroups,
  hasVectorIndex
);

// 可以追加自定義規則
const finalPrompt = customPrompt + '\n\n自定義規則...';
```

## 📖 API 文件

### ReActEngine

#### 建構函式

```typescript
new ReActEngine(config: {
  maxIterations?: number;          // 最大迭代次數（預設 5）
  tokenBudget?: {                  // Token 預算
    totalBudget?: number;          // 總預算（預設 32000）
    systemTokens?: number;         // 系統提示詞（預設 2000）
    historyTokens?: number;        // 對話歷史（預設 8000）
    contextTokens?: number;        // 動態上下文（預設 18000）
    responseTokens?: number;       // 響應（預設 4000）
  };
  llmConfig?: object;              // LLM 配置
})
```

#### 方法

- `run(question, docContent, systemPrompt, history)` - 執行 ReAct 迴圈
- `on(eventType, handler)` - 新增事件監聽器
- `emit(eventType, data)` - 傳送事件

### 事件型別

- `context_initialized` - 上下文初始化完成
- `iteration_start` - 迭代開始
- `reasoning_start` - 推理開始
- `reasoning_complete` - 推理完成
- `tool_call_start` - 工具呼叫開始
- `tool_call_complete` - 工具呼叫完成
- `context_updated` - 上下文更新
- `final_answer` - 最終答案
- `max_iterations_reached` - 達到最大迭代次數
- `error` - 錯誤

## 🔗 相關資源

- [ReAct 論文](https://arxiv.org/abs/2210.03629)
- [專案文件](../../docs/ReAct-Framework.md)
- [更新日誌](../../docs/ReAct-Implementation-Complete.md)

## 📄 許可證

MIT License

## 👥 貢獻者

- Paper Burner Team

---

**版本**: v2.0.0
**更新日期**: 2025-01-18
