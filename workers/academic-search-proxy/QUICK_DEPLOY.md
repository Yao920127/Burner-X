# 快速部署指南

Academic Search Proxy 提供兩種部署方案，適合不同使用場景。

**部署方式：**
- **方式 A：使用 Wrangler CLI**（推薦，快速）
- **方式 B：在 Cloudflare Dashboard 手動部署**（無需命令列）

---

## 📋 方案對比

| 方案 | 適用場景 | API Key 位置 | 認證要求 | 安全性 |
|------|---------|-------------|---------|--------|
| **方案一：透傳模式** | 個人使用/分享給他人 | 客戶端 | 可選 | ⭐⭐⭐⭐⭐ |
| **方案二：共享金鑰模式** | 團隊內部/受控環境 | Worker | **必須** | ⭐⭐⭐ |

---

## 🎯 方案一：透傳模式（推薦）

**適合：**
- ✅ 個人使用
- ✅ 分享給他人使用（使用者自帶 API Key）
- ✅ 最安全（你的 Key 不會洩露）

### A. 使用 Wrangler CLI 部署

#### 1. 部署 Worker

```bash
cd workers/academic-search-proxy
npx wrangler deploy
```

記錄輸出的 URL，例如：
```
https://academic-search-proxy.your-subdomain.workers.dev
```

#### 2. 配置 Worker（透傳模式）

編輯 `wrangler.toml`：

```toml
[vars]
# 認證（可選，不強制）
ENABLE_AUTH = "false"

# 允許的來源（根據需要調整）
ALLOWED_ORIGINS = "*"

# 速率限制
RATE_LIMIT_ENABLED = "true"
RATE_LIMIT_TPS = "10"
RATE_LIMIT_TPM = "300"
RATE_LIMIT_PER_IP_TPS = "5"
RATE_LIMIT_PER_IP_TPM = "100"
RATE_LIMIT_PUBMED_TPS = "3"
RATE_LIMIT_SEMANTICSCHOLAR_TPS = "5"
RATE_LIMIT_SEMANTICSCHOLAR_TPM = "20"
```

**不設定任何 Secrets**（不配置 API Key）：
```bash
# 不需要執行這些命令
# npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY  ← 跳過
# npx wrangler secret put PUBMED_API_KEY            ← 跳過
```

重新部署：
```bash
npx wrangler deploy
```

---

### B. 在 Cloudflare Dashboard 手動部署

#### 1. 建立 Worker

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 進入 **Workers & Pages**
3. 點選 **Create Application** → **Create Worker**
4. 命名：`academic-search-proxy`
5. 點選 **Deploy**

#### 2. 上傳程式碼

1. 在 Worker 頁面，點選 **Edit Code**
2. 刪除預設程式碼
3. 複製 `workers/academic-search-proxy/src/index.js` 的全部內容
4. 貼上到編輯器
5. 點選 **Save and Deploy**

#### 3. 配置環境變數（透傳模式）

在 Worker 頁面：

1. 點選 **Settings** 選項卡
2. 滾動到 **Variables** 部分
3. 點選 **Add variable**

**新增以下變數：**

| 變數名 | 型別 | 值 | 說明 |
|-------|------|---|------|
| `ENABLE_AUTH` | Text | `false` | 不啟用認證（透傳模式） |
| `ALLOWED_ORIGINS` | Text | `*` | 允許所有來源（或填入你的域名） |
| `RATE_LIMIT_ENABLED` | Text | `true` | 啟用速率限制 |
| `RATE_LIMIT_TPS` | Text | `10` | 全域每秒請求數 |
| `RATE_LIMIT_TPM` | Text | `300` | 全域每分鐘請求數 |
| `RATE_LIMIT_PER_IP_TPS` | Text | `5` | 每IP每秒請求數 |
| `RATE_LIMIT_PER_IP_TPM` | Text | `100` | 每IP每分鐘請求數 |
| `RATE_LIMIT_PUBMED_TPS` | Text | `3` | PubMed每秒請求數 |
| `RATE_LIMIT_PUBMED_TPM` | Text | `180` | PubMed每分鐘請求數 |
| `RATE_LIMIT_SEMANTICSCHOLAR_TPS` | Text | `5` | S2每秒請求數 |
| `RATE_LIMIT_SEMANTICSCHOLAR_TPM` | Text | `20` | S2每分鐘請求數 |

**注意：** 全部選擇 **Text** 型別（不是 Secret）

4. 點選 **Save and Deploy**

#### 4. 獲取 Worker URL

在 Worker 頁面頂部，複製你的 Worker URL：
```
https://academic-search-proxy.your-subdomain.workers.dev
```

#### 5. 測試

訪問健康檢查端點：
```
https://academic-search-proxy.your-subdomain.workers.dev/health
```

應該返回：
```json
{
  "status": "ok",
  "services": { ... },
  "rateLimit": { "enabled": true, ... }
}
```

#### 3. 客戶端配置

**方式 A：透過 UI 配置**（推薦）

在設定介面：
```
代理地址: https://academic-search-proxy.your-subdomain.workers.dev
Semantic Scholar API Key: [使用者自己的 Key]
PubMed API Key: [使用者自己的 Key]
```

**方式 B：透過 localStorage**

```javascript
localStorage.setItem('academicSearchSettings', JSON.stringify({
    proxyEnabled: true,
    proxyUrl: 'https://academic-search-proxy.your-subdomain.workers.dev',
    proxyAuthKey: null,  // 透傳模式不需要
    semanticScholarApiKey: 'your-s2-api-key',  // 使用者自己的
    pubmedApiKey: 'your-pubmed-api-key'        // 使用者自己的
}));
```

#### 4. 客戶端透傳實現（已實現）

在 `reference-doi-resolver.js` 中：

```javascript
// Semantic Scholar 查詢
const headers = {};
const userApiKey = getUserApiKey('semanticscholar');  // 從設定讀取
if (userApiKey) {
    headers['X-Api-Key'] = userApiKey;  // 透傳給 Worker
}

const response = await fetch(proxyUrl, { headers });
```

Worker 會自動將客戶端的 `X-Api-Key` 轉發給上游 API。

---

## 🔐 方案二：共享金鑰模式

**適合：**
- ⚠️ 團隊內部使用
- ⚠️ 信任的使用者群體
- ⚠️ 你願意分享你的 API Key

**⚠️ 警告：**
- **必須啟用認證**（否則任何人都能用你的 Key）
- **必須設定強密碼**
- **定期監控用量**

### A. 使用 Wrangler CLI 部署

#### 1. 部署 Worker

```bash
cd workers/academic-search-proxy
npx wrangler deploy
```

#### 2. 配置 Worker（共享金鑰模式）

編輯 `wrangler.toml`：

```toml
[vars]
# ⚠️ 必須啟用認證
ENABLE_AUTH = "true"

# 限制來源（推薦）
ALLOWED_ORIGINS = "https://yourdomain.com,https://trusted-domain.com"

# 更嚴格的速率限制（保護你的 API Key）
RATE_LIMIT_ENABLED = "true"
RATE_LIMIT_TPS = "5"               # 降低全侷限制
RATE_LIMIT_TPM = "200"
RATE_LIMIT_PER_IP_TPS = "2"        # 每個 IP 更嚴格
RATE_LIMIT_PER_IP_TPM = "50"
RATE_LIMIT_PUBMED_TPS = "3"
RATE_LIMIT_SEMANTICSCHOLAR_TPS = "3"
RATE_LIMIT_SEMANTICSCHOLAR_TPM = "20"
```

#### 3. 設定 Secrets

```bash
# ⚠️ 必須：設定認證金鑰（強密碼）
npx wrangler secret put AUTH_SECRET
# 輸入：例如 "xK9$mP2#vL8@nR5%qW3^tY7&zH4!"

# 可選：你的 Semantic Scholar API Key
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
# 輸入：你的 S2 Key

# 可選：你的 PubMed API Key
npx wrangler secret put PUBMED_API_KEY
# 輸入：你的 PubMed Key
```

重新部署：
```bash
npx wrangler deploy
```

---

### B. 在 Cloudflare Dashboard 手動部署

#### 1. 建立 Worker

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 進入 **Workers & Pages**
3. 點選 **Create Application** → **Create Worker**
4. 命名：`academic-search-proxy`
5. 點選 **Deploy**

#### 2. 上傳程式碼

1. 在 Worker 頁面，點選 **Edit Code**
2. 刪除預設程式碼
3. 複製 `workers/academic-search-proxy/src/index.js` 的全部內容
4. 貼上到編輯器
5. 點選 **Save and Deploy**

#### 3. 配置環境變數（共享金鑰模式）

在 Worker 頁面：

1. 點選 **Settings** 選項卡
2. 滾動到 **Variables** 部分

**3.1 新增普通變數（Text）：**

點選 **Add variable**，新增以下變數（型別選擇 **Text**）：

| 變數名 | 型別 | 值 | 說明 |
|-------|------|---|------|
| `ENABLE_AUTH` | Text | `true` | ⚠️ 必須啟用認證 |
| `ALLOWED_ORIGINS` | Text | `https://yourdomain.com` | 限制來源域名 |
| `RATE_LIMIT_ENABLED` | Text | `true` | 啟用速率限制 |
| `RATE_LIMIT_TPS` | Text | `5` | 全域每秒請求數（更嚴格） |
| `RATE_LIMIT_TPM` | Text | `200` | 全域每分鐘請求數 |
| `RATE_LIMIT_PER_IP_TPS` | Text | `2` | 每IP每秒請求數（更嚴格） |
| `RATE_LIMIT_PER_IP_TPM` | Text | `50` | 每IP每分鐘請求數 |
| `RATE_LIMIT_PUBMED_TPS` | Text | `3` | PubMed每秒請求數 |
| `RATE_LIMIT_PUBMED_TPM` | Text | `180` | PubMed每分鐘請求數 |
| `RATE_LIMIT_SEMANTICSCHOLAR_TPS` | Text | `3` | S2每秒請求數 |
| `RATE_LIMIT_SEMANTICSCHOLAR_TPM` | Text | `20` | S2每分鐘請求數 |

**3.2 新增加密變數（Secret）：**

⚠️ **重要：這些是敏感資訊，必須使用 Secret 型別！**

點選 **Add variable**，**勾選 "Encrypt"**，新增：

| 變數名 | 型別 | 值 | 說明 |
|-------|------|---|------|
| `AUTH_SECRET` | **Secret** ✅ | `xK9$mP2#vL8@nR5%qW3^tY7&zH4!` | ⚠️ 認證金鑰（強密碼，至少32字元） |
| `SEMANTIC_SCHOLAR_API_KEY` | **Secret** ✅ | `your-s2-api-key` | （可選）你的 S2 API Key |
| `PUBMED_API_KEY` | **Secret** ✅ | `your-pubmed-api-key` | （可選）你的 PubMed API Key |

**如何新增 Secret：**
1. 點選 **Add variable**
2. 輸入變數名（如 `AUTH_SECRET`）
3. **勾選 "Encrypt"** 核取方塊 ⚠️
4. 輸入值（如 `xK9$mP2#vL8@nR5%qW3^tY7&zH4!`）
5. 點選 **Save**

**驗證 Secret 已加密：**
- Secret 變數顯示為 `••••••••`
- 儲存後無法檢視原始值

4. 點選 **Save and Deploy**

#### 4. 生成強密碼（AUTH_SECRET）

**推薦方法：**

```bash
# Linux/Mac
openssl rand -base64 32

# 或線上生成器
# https://www.random.org/passwords/?num=1&len=32&format=plain
```

示例強密碼：
```
xK9$mP2#vL8@nR5%qW3^tY7&zH4!aB6*cD1%
```

#### 5. 測試

訪問健康檢查（需要帶 Auth Key）：

```bash
curl -H "X-Auth-Key: xK9$mP2#vL8@nR5%qW3^tY7&zH4!" \
  https://academic-search-proxy.your-subdomain.workers.dev/health
```

應該返回：
```json
{
  "status": "ok",
  "authentication": { "required": true }
}
```

---

## 📊 環境變數完整列表

### 通用變數（Text 型別）

| 變數名 | 預設值 | 說明 | 方案一 | 方案二 |
|-------|-------|------|-------|-------|
| `ENABLE_AUTH` | `"false"` | 是否啟用認證 | `false` | ⚠️ `true` |
| `ALLOWED_ORIGINS` | `"*"` | 允許的來源（CORS） | `"*"` | 特定域名 |
| `RATE_LIMIT_ENABLED` | `"true"` | 啟用速率限制 | `true` | `true` |
| `RATE_LIMIT_TPS` | `"10"` | 全域每秒請求數 | `10` | `5` |
| `RATE_LIMIT_TPM` | `"300"` | 全域每分鐘請求數 | `300` | `200` |
| `RATE_LIMIT_PER_IP_TPS` | `"5"` | 每IP每秒請求數 | `5` | `2` |
| `RATE_LIMIT_PER_IP_TPM` | `"100"` | 每IP每分鐘請求數 | `100` | `50` |
| `RATE_LIMIT_PUBMED_TPS` | `"3"` | PubMed每秒請求數 | `3` | `3` |
| `RATE_LIMIT_PUBMED_TPM` | `"180"` | PubMed每分鐘請求數 | `180` | `180` |
| `RATE_LIMIT_SEMANTICSCHOLAR_TPS` | `"5"` | S2每秒請求數 | `5` | `3` |
| `RATE_LIMIT_SEMANTICSCHOLAR_TPM` | `"20"` | S2每分鐘請求數 | `20` | `20` |

### 加密變數（Secret 型別）⚠️

| 變數名 | 方案一 | 方案二 | 說明 |
|-------|-------|-------|------|
| `AUTH_SECRET` | 不設定 | ⚠️ **必須設定** | 認證金鑰（強密碼） |
| `SEMANTIC_SCHOLAR_API_KEY` | 不設定 | 可選 | 你的 S2 API Key |
| `PUBMED_API_KEY` | 不設定 | 可選 | 你的 PubMed API Key |

---

## 🎨 Dashboard 配置螢幕截圖說明

### 新增 Text 變數

```
Settings → Variables → Add variable
┌─────────────────────────────────┐
│ Variable name                   │
│ ENABLE_AUTH                     │
├─────────────────────────────────┤
│ Value                           │
│ false                           │
├─────────────────────────────────┤
│ □ Encrypt                       │  ← 不勾選
└─────────────────────────────────┘
         [Save]
```

### 新增 Secret 變數

```
Settings → Variables → Add variable
┌─────────────────────────────────┐
│ Variable name                   │
│ AUTH_SECRET                     │
├─────────────────────────────────┤
│ Value                           │
│ xK9$mP2#vL8@nR5%qW3^tY7&zH4!   │
├─────────────────────────────────┤
│ ☑ Encrypt                       │  ← 必須勾選！
└─────────────────────────────────┘
         [Save]
```

儲存後顯示為：
```
AUTH_SECRET: •••••••• (encrypted)
```

#### 4. 分發給使用者

**給使用者提供：**
1. Worker URL: `https://academic-search-proxy.your-subdomain.workers.dev`
2. Auth Key: `xK9$mP2#vL8@nR5%qW3^tY7&zH4!` ⚠️（保密分享）

**使用者配置：**

```javascript
localStorage.setItem('academicSearchSettings', JSON.stringify({
    proxyEnabled: true,
    proxyUrl: 'https://academic-search-proxy.your-subdomain.workers.dev',
    proxyAuthKey: 'xK9$mP2#vL8@nR5%qW3^tY7&zH4!',  // ⚠️ 你提供的
    // 不需要配置 API Key，Worker 會用你的
}));
```

#### 5. 監控和保護

**定期檢查用量：**
```bash
# Cloudflare Dashboard
# Workers & Pages → academic-search-proxy → Analytics
```

**如果發現濫用：**
```bash
# 立即更換認證金鑰
npx wrangler secret put AUTH_SECRET
# 輸入新密碼

# 通知使用者新金鑰
```

**設定告警：**
- Cloudflare Dashboard → Workers → academic-search-proxy
- 設定請求數告警（如超過 10,000/天）

---

## 📊 兩種方案對比詳解

### 方案一：透傳模式

```
使用者瀏覽器
  ├─ 使用者的 S2 Key
  └─ 使用者的 PubMed Key
         ↓ (透過 X-Api-Key 頭)
     你的 Worker (無 Key)
         ↓ (轉發 X-Api-Key)
  Semantic Scholar / PubMed
```

**優點：**
- ✅ 你的 Key 不會洩露
- ✅ 每個使用者用自己的限額
- ✅ 無需擔心濫用
- ✅ 可以公開分享

**缺點：**
- ⚠️ 使用者需要自己申請 API Key

---

### 方案二：共享金鑰模式

```
使用者瀏覽器
  └─ Auth Key (xK9$mP2#...)
         ↓
     你的 Worker
       ├─ 你的 S2 Key (在 Worker 中)
       └─ 你的 PubMed Key (在 Worker 中)
         ↓
  Semantic Scholar / PubMed
```

**優點：**
- ✅ 使用者無需申請 Key
- ✅ 即開即用

**缺點：**
- ⚠️ 所有人共享你的 Key 限額
- ⚠️ 必須啟用認證
- ⚠️ Auth Key 洩露 = 你的 API Key 被濫用
- ⚠️ 需要監控用量

---

## 🎯 選擇建議

| 場景 | 推薦方案 |
|------|---------|
| 個人使用 | **方案一** |
| 開源專案 | **方案一** |
| 公開分享 | **方案一** |
| 小團隊（< 5人） | 方案二（謹慎） |
| 大團隊 | **方案一** |
| 商業產品 | **方案一** |

**預設推薦：方案一（透傳模式）** ✅

---

## ⚡ 一鍵部署腳本

### 方案一（透傳模式）

```bash
# 1. 進入目錄
cd workers/academic-search-proxy

# 2. 確認配置（wrangler.toml）
cat wrangler.toml

# 3. 部署
npx wrangler deploy

# 4. 測試
curl https://your-worker.workers.dev/health

# 完成！分享 Worker URL 給使用者
```

### 方案二（共享金鑰模式）

```bash
# 1. 進入目錄
cd workers/academic-search-proxy

# 2. 修改配置
# 編輯 wrangler.toml，設定 ENABLE_AUTH = "true"

# 3. 設定金鑰
npx wrangler secret put AUTH_SECRET
# 輸入強密碼（至少 32 字元）

# 可選：新增你的 API Keys
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
npx wrangler secret put PUBMED_API_KEY

# 4. 部署
npx wrangler deploy

# 5. 測試
curl https://your-worker.workers.dev/health

# 6. 分發給使用者
echo "Worker URL: https://your-worker.workers.dev"
echo "Auth Key: [你設定的密碼]"
```

---

## 🔧 故障排查

### Worker 健康檢查失敗

```bash
# 檢查部署狀態
npx wrangler deployments list

# 檢視日誌
npx wrangler tail

# 重新部署
npx wrangler deploy
```

### 認證失敗（方案二）

```bash
# 檢查 Secret 是否設定
npx wrangler secret list

# 重新設定
npx wrangler secret put AUTH_SECRET
```

### 速率限制觸發

```toml
# 編輯 wrangler.toml，調高限制
RATE_LIMIT_TPS = "20"
RATE_LIMIT_TPM = "600"
```

```bash
# 重新部署
npx wrangler deploy
```

---

## 📚 更多資源

- [完整文件](./README.md)
- [詳細部署指南](./DEPLOY.md)
- [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文件](https://developers.cloudflare.com/workers/wrangler/)

## 💡 最佳實踐

1. **優先使用方案一**（透傳模式）
2. **定期檢查 Worker 使用量**
3. **設定合理的速率限制**
4. **方案二必須啟用認證**
5. **定期輪換 Auth Key**（方案二）
6. **監控 Cloudflare Dashboard**
