// js/chatbot/prompt/drawio-lite-spec.js

/**
 * DrawioLite DSL 完整語法規範
 * 用於 AI 提示詞，確保 AI 生成正確的 DSL 程式碼
 * @version 1.0.0
 * @date 2025-01-16
 */

const DRAWIO_LITE_SPEC = `
# DrawioLite DSL 語法規範

DrawioLite 是一種極簡的文字語法，用於快速生成學術論文級別的 Draw.io 圖表。
AI 必須嚴格按照本規範生成程式碼。

---

## 1. 節點定義（Node）

### 語法
\`\`\`
node <ID> "<標籤文字>" <形狀> [顏色]
\`\`\`

### 引數說明
- **ID**：節點唯一識別符號（單個字母或單詞，如 A, B, node1）
- **標籤文字**：顯示在節點內的文字（必須用雙引號包圍）
- **形狀**：節點形狀型別（見下表）
- **顏色**：可選，節點配色方案（見下表）

### 支援的形狀
| 形狀關鍵詞 | 說明 | 適用場景 |
|-----------|------|---------|
| \`rect\` | 圓角矩形 | 處理步驟、模組、元件 |
| \`ellipse\` | 橢圓 | 開始/結束、資料來源 |
| \`diamond\` | 菱形 | 判斷、決策點 |
| \`circle\` | 圓形 | 節點、狀態 |
| \`cylinder\` | 圓柱體 | 資料庫、儲存 |
| \`hexagon\` | 六邊形 | 特殊處理、介面 |

### 支援的顏色（學術標準配色）
| 顏色關鍵詞 | fillColor | strokeColor | 語義 |
|-----------|-----------|-------------|------|
| \`gray\` | #F7F9FC | #2C3E50 | 預設/中性（黑白列印友好） |
| \`blue\` | #dae8fc | #3498DB | 主要流程/處理 |
| \`green\` | #d5e8d4 | #82b366 | 成功/透過/資料 |
| \`yellow\` | #fff2cc | #d6b656 | 警告/決策 |
| \`red\` | #f8cecc | #E74C3C | 錯誤/重點/瓶頸 |
| \`orange\` | #ffe6cc | #d79b00 | 次要流程 |

### 示例
\`\`\`
node A "資料採集" rect blue
node B "預處理" rect green
node C "有效？" diamond yellow
node D "資料庫" cylinder gray
node E "結束" ellipse green
\`\`\`

---

## 2. 連線定義（Edge）**【可選】**

### 語法
\`\`\`
<起點ID> -> <終點ID> ["標籤文字"]
\`\`\`

### 引數說明
- **起點ID**：源節點的 ID
- **終點ID**：目標節點的 ID
- **標籤文字**：可選，連線線上顯示的文字（用雙引號包圍）

### 重要說明
- **連線不是必需的**：節點可以獨立存在，不需要連線
- **適用場景**：
  - ✅ 流程圖、資料流圖：需要表示步驟順序或資料流向
  - ❌ 架構圖、分組圖：僅需要表示模組劃分，不需要連線
- **與 group 配合**：group 內的節點可以不連線，只表示邏輯分組

### 特性
- 自動使用正交路由（orthogonalEdgeStyle）
- LR 版面下強制從節點左右邊連線
- 自動避免連線交叉（Dagre 演算法）

### 示例
\`\`\`
# 有連線的流程圖
A -> B "原始資料"
B -> C
C -> D "是"
C -> E "否"

# 無連線的分組（僅分類）
node F "模組F" rect blue
node G "模組G" rect blue
# F 和 G 可以在 group 中，但不需要連線
\`\`\`

---

## 3. 分組/容器（Group）

### 語法
\`\`\`
group <ID> "<標題>" {
  <成員節點ID>, <成員節點ID>, ...
}
\`\`\`

### 引數說明
- **ID**：容器唯一識別符號（如 G1, layer1）
- **標題**：容器標題（顯示在容器頂部）
- **成員節點ID**：用逗號分隔的節點 ID 列表

### 特性
- 生成 Draw.io swimlane 容器
- 自動調整容器大小以包含所有成員
- **成員節點之間不需要連線**：group 的作用是邏輯分組，不是流程連線
- 適合表示層次結構、模組劃分、功能分類

### 使用場景
- ✅ **僅分組**：將相關模組放在一起，不需要連線
- ✅ **分組+連線**：既分組又有內部流程
- ✅ **跨組連線**：不同 group 的節點可以連線

### 示例
\`\`\`
# 示例1：僅分組（無連線）
node A "使用者模組" rect blue
node B "許可權模組" rect blue
node C "訂單模組" rect green
node D "支付模組" rect green

group G1 "使用者系統" {
  A, B
}

group G2 "交易系統" {
  C, D
}
# A, B, C, D 之間可以沒有連線，只是分類展示

# 示例2：分組+內部連線
group G1 "資料處理層" {
  B, C, D
}
B -> C -> D  # group 內部有流程連線

group G2 "輸出層" {
  E
}
D -> E  # 跨 group 連線
\`\`\`

---

## 4. 圖例（Legend）

### 語法
\`\`\`
legend {
  <形狀> <顏色> "<說明文字>"
  <形狀> <顏色> "<說明文字>"
  ...
}
\`\`\`

### 引數說明
- **形狀**：與節點定義中的形狀關鍵詞相同
- **顏色**：與節點定義中的顏色關鍵詞相同
- **說明文字**：該形狀/顏色的含義說明

### 特性
- 自動放置在圖表右上角
- 包含形狀示例和文字說明
- 學術論文必備元素

### 示例
\`\`\`
legend {
  rect blue "處理模組"
  diamond yellow "判斷節點"
  ellipse green "起始/結束"
}
\`\`\`

---

## 5. 註釋

### 語法
\`\`\`
# 這是註釋，會被忽略
\`\`\`

---

## 6. 多圖支援（高階功能）

### 6.1 並列子圖（Subgraph）

#### 語法
\`\`\`
subgraph <ID> "<標題>" {
  # 在這裡定義節點和連線
  node ...
  ... -> ...
}
\`\`\`

#### 特性
- 每個子圖獨立版面
- 自動左右或上下並列排列
- 適合對比分析圖、多階段流程圖

#### 示例：對比分析圖
\`\`\`
subgraph S1 "方案A" {
  node A1 "輸入" ellipse blue
  node A2 "處理A" rect blue
  node A3 "輸出" ellipse green
  A1 -> A2 -> A3
}

subgraph S2 "方案B" {
  node B1 "輸入" ellipse blue
  node B2 "處理B" rect orange
  node B3 "輸出" ellipse green
  B1 -> B2 -> B3
}

legend {
  rect blue "方案A模組"
  rect orange "方案B模組"
}
\`\`\`

### 6.2 多頁圖表（Multi-page）

#### 語法
\`\`\`
page "<頁面標題1>" {
  # 第一頁的內容
}

page "<頁面標題2>" {
  # 第二頁的內容
}
\`\`\`

#### 特性
- 生成多個 diagram 分頁
- 每頁獨立，可以不同型別的圖表
- 適合複雜系統的分模組展示

#### 示例：分層架構圖
\`\`\`
page "系統架構概覽" {
  node A "前端" rect blue
  node B "後端" rect orange
  node C "資料庫" cylinder gray
  A -> B -> C
}

page "前端詳細設計" {
  node F1 "React元件" rect blue
  node F2 "狀態管理" rect blue
  node F3 "路由" rect blue
  F1 -> F2 -> F3
}

page "後端詳細設計" {
  node B1 "API層" rect orange
  node B2 "業務邏輯" rect orange
  node B3 "資料訪問" rect orange
  B1 -> B2 -> B3
}
\`\`\`

### 6.3 跨子圖連線

#### 語法
\`\`\`
# 定義連線時使用 子圖ID.節點ID 格式
S1.A3 -> S2.B1 "資料傳遞"
\`\`\`

#### 示例
\`\`\`
subgraph S1 "資料採集" {
  node A1 "感測器" ellipse blue
  node A2 "採集器" rect blue
  A1 -> A2
}

subgraph S2 "資料處理" {
  node B1 "清洗" rect green
  node B2 "分析" rect green
  B1 -> B2
}

# 跨子圖連線
S1.A2 -> S2.B1 "原始資料"
\`\`\`

---

## 完整示例：實驗流程圖

\`\`\`drawiolite
# 定義節點
node A "開始" ellipse green
node B "資料採集" rect blue
node C "資料清洗" rect blue
node D "質量檢測" diamond yellow
node E "特徵提取" rect blue
node F "模型訓練" rect orange
node G "結果輸出" rect green
node H "結束" ellipse green

# 定義連線
A -> B "啟動"
B -> C "原始資料"
C -> D
D -> E "透過"
D -> C "失敗，重試"
E -> F "特徵向量"
F -> G "模型引數"
G -> H

# 分組
group G1 "預處理階段" {
  B, C, D
}

group G2 "建模階段" {
  E, F, G
}

# 圖例
legend {
  rect blue "資料處理"
  rect orange "模型相關"
  diamond yellow "質量檢查"
  ellipse green "流程控制"
}
\`\`\`

---

## 輸出要求

1. **只輸出 DrawioLite DSL 程式碼**
   - 不要輸出任何解釋文字
   - 不要使用 markdown 程式碼塊標記（如 \\\`\\\`\\\`）
   - 直接從第一個 node 或 # 註釋開始

2. **遵循學術規範**
   - 優先使用 gray 配色（黑白列印友好）
   - 僅在需要區分語義時使用彩色
   - 複雜圖表必須包含圖例

3. **保持簡潔**
   - 節點標籤簡短明確（不超過15字）
   - 避免冗餘連線
   - 合理使用分組，層次清晰

4. **命名規範**
   - 節點 ID 使用 A, B, C... 或 node1, node2...
   - 分組 ID 使用 G1, G2... 或 layer1, layer2...

---

## 錯誤示例（禁止）

❌ **錯誤1：缺少引號**
\`\`\`
node A 資料採集 rect blue  // 錯誤！標籤必須加引號
\`\`\`

❌ **錯誤2：使用不支援的形狀**
\`\`\`
node A "開始" star blue  // 錯誤！star 不是支援的形狀
\`\`\`

❌ **錯誤3：連線到不存在的節點**
\`\`\`
A -> Z  // 錯誤！節點 Z 未定義
\`\`\`

❌ **錯誤4：包含解釋文字**
\`\`\`
下面是流程圖：
node A "開始" ellipse  // 錯誤！不要輸出解釋文字
\`\`\`

---

## 正確示例（參考）

✅ **示例1：簡單流程圖**
\`\`\`
node A "開始" ellipse green
node B "處理" rect blue
node C "結束" ellipse green
A -> B
B -> C
\`\`\`

✅ **示例2：帶判斷的流程**
\`\`\`
node A "輸入資料" rect blue
node B "驗證" diamond yellow
node C "儲存" rect green
node D "拒絕" rect red
A -> B
B -> C "有效"
B -> D "無效"
\`\`\`

✅ **示例3：系統架構圖**
\`\`\`
node A "客戶端" rect blue
node B "API閘道器" hexagon orange
node C "業務邏輯" rect blue
node D "資料庫" cylinder gray

A -> B "HTTP請求"
B -> C "路由"
C -> D "查詢/寫入"

group G1 "後端系統" {
  B, C, D
}

legend {
  rect blue "服務元件"
  cylinder gray "資料儲存"
  hexagon orange "閘道器/介面"
}
\`\`\`
`;

// 匯出到全域
window.DRAWIO_LITE_SPEC = DRAWIO_LITE_SPEC;
