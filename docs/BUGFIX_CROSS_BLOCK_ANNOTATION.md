# Bug修復: 跨子塊批註狀態汙染

> **修復日期**: 2025-11-12
> **嚴重程度**: 🔴 高（影響批註核心功能）
> **影響範圍**: 批註和醒目提示系統
> **修復檔案**: `js/annotations/annotation_logic.js`

---

## 🐛 Bug 描述

### 問題表現

使用者在詳情頁進行批註操作時：

1. 先做一次**跨子塊醒目提示**（比如選中 8 個子塊）
2. 再做**單子塊內醒目提示**（比如只選中 109.0 內的文字）
3. **Bug**: 第 2 次操作卻執行了跨 8 個子塊的醒目提示 ❌

### 使用者日誌

```
[跨子塊檢測] 選擇在同一個子塊內 ✅ 檢測正確
[跨子塊檢測] 未檢測到跨子塊選擇，繼續單子塊處理 ✅ 流程正確

// 但是點選醒目提示按鈕後：
[跨子塊操作] 執行操作: highlight-block, 涉及 8 個子塊 ❌ 使用了舊資料！
```

---

## 🔍 根源分析

### 問題程式碼

**檔案**: `annotation_logic.js:804-806`

```javascript
const isCrossBlockOperation = annotationContextMenuElement.dataset.contextIsCrossBlock === "true";
if (isCrossBlockOperation) {
    return handleCrossBlockMenuAction(action, color, event);
}
```

### Bug 機制

#### 跨子塊操作時（第1次）

```javascript
// annotation_logic.js:1694-1699
annotationContextMenuElement.dataset.contextIsCrossBlock = "true";
annotationContextMenuElement.dataset.contextAffectedSubBlocks = JSON.stringify([...8個子塊ID]);
```

✅ 正確設定

#### 單子塊操作時（第2次）

```javascript
// annotation_logic.js:716-738 (修復前)
annotationContextMenuElement.dataset.contextContentIdentifier = ...;
annotationContextMenuElement.dataset.contextTargetIdentifier = ...;
// ... 設定很多屬性

// ❌ 問題：沒有清除跨子塊相關屬性！
// contextIsCrossBlock 仍然是 "true"
// contextAffectedSubBlocks 仍然是舊的 8 個子塊
```

#### 點選選單時

```javascript
// annotation_logic.js:804
const isCrossBlockOperation = dataset.contextIsCrossBlock === "true";  // ❌ 讀到舊值 "true"

if (isCrossBlockOperation) {
    return handleCrossBlockMenuAction(...);  // ❌ 誤呼叫跨子塊處理
    // 使用了舊的 contextAffectedSubBlocks（8個子塊）
}
```

### 時序圖

```
時間線：
  ┌─────────────────────────────────────────────────┐
  │ 第 1 次操作：跨子塊醒目提示（8 個子塊）              │
  ├─────────────────────────────────────────────────┤
  │ contextIsCrossBlock = "true" ✅                 │
  │ contextAffectedSubBlocks = [8個ID] ✅            │
  └─────────────────────────────────────────────────┘
                      ↓
  ┌─────────────────────────────────────────────────┐
  │ 第 2 次操作：單子塊醒目提示（109.0 內部分文字）      │
  ├─────────────────────────────────────────────────┤
  │ detectCrossBlockSelection() → false ✅          │
  │ 設定 contextContentIdentifier ✅                │
  │ 設定 contextTargetIdentifier ✅                 │
  │ ❌ 沒有清除 contextIsCrossBlock!                │
  │ ❌ 沒有清除 contextAffectedSubBlocks!           │
  └─────────────────────────────────────────────────┘
                      ↓
  ┌─────────────────────────────────────────────────┐
  │ 使用者點選"醒目提示"按鈕                               │
  ├─────────────────────────────────────────────────┤
  │ 讀取 contextIsCrossBlock = "true" ❌ (舊值)     │
  │ 呼叫 handleCrossBlockMenuAction ❌              │
  │ 使用 contextAffectedSubBlocks = [8個ID] ❌ (舊值│
  │ → 醒目提示了錯誤的 8 個子塊！                       │
  └─────────────────────────────────────────────────┘
```

---

## ✅ 修復方案

### 修復程式碼

**檔案**: `annotation_logic.js:740-743` (新增)

```javascript
// 🔧 BUG FIX: 清除跨子塊相關屬性，避免單子塊操作時誤用舊的跨子塊資料
delete annotationContextMenuElement.dataset.contextIsCrossBlock;
delete annotationContextMenuElement.dataset.contextCrossBlockAnnotationId;
delete annotationContextMenuElement.dataset.contextAffectedSubBlocks;
```

### 修復位置

在單子塊右鍵事件處理中（`annotation_logic.js:708-766`），設定完其他屬性後，**立即清除**跨子塊相關屬性。

### 修復後的流程

```
第 1 次操作：跨子塊醒目提示
  → contextIsCrossBlock = "true" ✅

第 2 次操作：單子塊醒目提示
  → 清除 contextIsCrossBlock ✅
  → 清除 contextAffectedSubBlocks ✅
  → 設定 contextTargetIdentifier = "109.0" ✅

點選醒目提示按鈕
  → contextIsCrossBlock === undefined ✅
  → isCrossBlockOperation = false ✅
  → 執行單子塊醒目提示 ✅
```

---

## 🧪 測試驗證

### 測試場景

1. **場景 A: 跨子塊 → 單子塊**
   - 先跨 5 個子塊醒目提示
   - 再在單個子塊內選擇文字醒目提示
   - **預期**: 只醒目提示選中的文字 ✅

2. **場景 B: 單子塊 → 跨子塊**
   - 先單子塊醒目提示
   - 再跨多個子塊醒目提示
   - **預期**: 正確醒目提示多個子塊 ✅

3. **場景 C: 連續單子塊操作**
   - 連續在不同段落做單子塊醒目提示
   - **預期**: 每次都正確醒目提示 ✅

### 測試步驟

```bash
# 1. 清除快取並重新整理
Ctrl + Shift + R

# 2. 開啟歷史詳情頁
# 3. 先選中多個段落 → 右鍵 → 醒目提示
# 4. 再選中單個段落內的部分文字 → 右鍵 → 醒目提示
# 5. 觀察主控台日誌
```

**預期日誌** ✅:
```
[跨子塊檢測] 選擇在同一個子塊內
[AnnotationLogic] 單子塊醒目提示操作...
（不應該出現 "[跨子塊操作] 執行操作"）
```

---

## 📊 影響評估

### 嚴重程度: 🔴 高

**原因**:
- 影響批註核心功能
- 可能導致錯誤的醒目提示範圍
- 使用者體驗差（醒目提示了不該醒目提示的內容）

### 影響範圍

| 功能 | 是否受影響 | 影響程度 |
|------|-----------|---------|
| 跨子塊醒目提示 | ✅ 是 | 🔴 高 |
| 單子塊醒目提示 | ✅ 是 | 🔴 高 |
| 批註新增 | ✅ 是 | 🔴 高 |
| 醒目提示移除 | ✅ 是 | 🟠 中 |
| 其他功能 | ❌ 否 | - |

### 復現條件

- ✅ 必須先做過跨子塊操作
- ✅ 然後做單子塊操作
- ✅ 兩次操作在同一個頁面會話中

**復現率**: 100%（符合條件時）

---

## 🚀 部署建議

### 優先順序: 🔴 高

建議**立即部署**，原因：
1. Bug 嚴重影響批註核心功能
2. 修復簡單（3 行程式碼），風險極低
3. 不影響其他功能

### 迴歸測試清單

```
[ ] 跨子塊醒目提示 → 單子塊醒目提示
[ ] 單子塊醒目提示 → 跨子塊醒目提示
[ ] 連續多次單子塊操作
[ ] 跨子塊批註新增
[ ] 單子塊批註新增
[ ] 醒目提示移除
[ ] 切換標籤後批註恢復
```

---

## 📝 相關 Issue

### 使用者報告

> "我選中某個段落裡面有公式的情況，就會出錯"

**根源不是公式**，而是：
- 使用者之前可能選中了包含公式的**多個段落**（跨子塊）
- 然後選中單個段落內的文字（單子塊）
- 觸發了狀態汙染 bug

**公式只是觸發場景之一**，任何跨子塊 → 單子塊操作都會觸發。

---

## 🔮 預防措施

### 程式碼模式

**原則**: 每次設定上下文選單的 dataset 時，**清除所有可能的舊狀態**

**推薦模式**:
```javascript
// 清除所有狀態
function clearContextMenuState() {
    const keys = Object.keys(annotationContextMenuElement.dataset);
    keys.filter(k => k.startsWith('context')).forEach(k => {
        delete annotationContextMenuElement.dataset[k];
    });
}

// 設定新狀態前先清除
clearContextMenuState();
annotationContextMenuElement.dataset.contextXXX = newValue;
```

### 未來改進

**建議**: 使用狀態機管理批註上下文，而不是依賴 dataset

```javascript
class AnnotationContext {
    constructor() {
        this.reset();
    }

    reset() {
        this.isCrossBlock = false;
        this.affectedSubBlocks = [];
        this.targetIdentifier = null;
        // ...
    }

    setCrossBlock(data) {
        this.reset();
        this.isCrossBlock = true;
        this.affectedSubBlocks = data.subBlocks;
        // ...
    }

    setSingleBlock(data) {
        this.reset();  // 自動清除舊狀態
        this.isCrossBlock = false;
        this.targetIdentifier = data.id;
        // ...
    }
}
```

---

## ✅ 驗收清單

- [x] Bug 根源分析完成
- [x] 修復程式碼實施完成
- [x] 語法檢查透過
- [ ] 功能測試透過
- [ ] 迴歸測試透過
- [ ] 使用者驗證透過
- [ ] 部署到生產環境

---

## 📌 總結

**Bug**: 跨子塊批註狀態汙染單子塊操作
**根源**: 單子塊處理時未清除跨子塊相關的 dataset 屬性
**修復**: 新增 3 行程式碼清除舊狀態
**影響**: 批註核心功能
**優先順序**: 🔴 高，建議立即部署

---

**修復完成！** 🎉

感謝使用者的詳細反饋，這個 bug 發現得非常及時！
