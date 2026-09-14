# 部署指南 - Academic Search Proxy

## 前置要求

1. **Cloudflare 賬號**
   - 註冊地址：https://dash.cloudflare.com/sign-up
   - Workers 免費套餐：100,000 請求/天

2. **Wrangler CLI**
   ```bash
   npm install -g wrangler

   # 登入
   wrangler login
   ```

## 部署步驟

### 1. 本地測試

```bash
cd workers/academic-search-proxy

# 本地開發模式
npx wrangler dev

# 測試健康檢查
curl http://localhost:8787/health
```

### 2. 首次部署

```bash
# 部署到 Cloudflare
npx wrangler deploy

# 輸出示例：
# ✨ Published academic-search-proxy
# https://academic-search-proxy.your-subdomain.workers.dev
```

### 3. 配置環境變數

#### 3.1 公開變數（wrangler.toml）

編輯 `wrangler.toml`：

```toml
[vars]
ENABLE_AUTH = "false"  # 改為 "true" 啟用認證
ALLOWED_ORIGINS = "http://localhost:8080,https://yourdomain.com"
```

重新部署：
```bash
npx wrangler deploy
```

#### 3.2 金鑰變數（Secrets）

```bash
# Semantic Scholar API Key（可選）
# 獲取：https://www.semanticscholar.org/product/api
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
# 輸入你的 API Key 並換行

# PubMed API Key（可選）
# 獲取：https://www.ncbi.nlm.nih.gov/account/settings/
npx wrangler secret put PUBMED_API_KEY

# 認證金鑰（如果 ENABLE_AUTH = "true"）
npx wrangler secret put AUTH_SECRET
# 輸入一個強密碼，客戶端需要使用這個金鑰
```

### 4. 自定義域名（可選）

#### 4.1 透過 Cloudflare Dashboard

1. 進入 Dashboard：https://dash.cloudflare.com
2. 選擇你的 Worker：`academic-search-proxy`
3. 點選 **Triggers** → **Custom Domains**
4. 新增域名，如：`academic-search.yourdomain.com`

#### 4.2 透過 wrangler.toml

```toml
[[routes]]
pattern = "academic-search.yourdomain.com/*"
zone_name = "yourdomain.com"
```

```bash
npx wrangler deploy
```

## 客戶端配置

### 修改前端程式碼

找到 `js/processing/reference-doi-resolver.js`，新增代理配置：

```javascript
// 在檔案頂部新增
const ACADEMIC_PROXY = {
    enabled: true,  // 是否啟用代理
    baseUrl: 'https://academic-search-proxy.your-subdomain.workers.dev',
    authKey: null  // 如果啟用了認證，填入 AUTH_SECRET
};
```

修改各個 Resolver 的請求 URL（示例見下方）。

## 驗證部署

### 1. 健康檢查

```bash
curl https://your-worker.workers.dev/health
```

預期輸出：
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "services": {
    "semanticscholar": { "enabled": true, "hasApiKey": false },
    "pubmed": { "enabled": true, "hasApiKey": false },
    "crossref": { "enabled": true },
    "openalex": { "enabled": true },
    "arxiv": { "enabled": true }
  },
  "authentication": {
    "required": false
  }
}
```

### 2. 測試各個服務

```bash
# Semantic Scholar
curl "https://your-worker.workers.dev/api/semanticscholar/graph/v1/paper/search?query=test&limit=1"

# PubMed
curl "https://your-worker.workers.dev/api/pubmed/esearch.fcgi?db=pubmed&term=cancer&retmode=json&retmax=1"

# CrossRef
curl "https://your-worker.workers.dev/api/crossref/works?query.title=test&rows=1"

# OpenAlex
curl "https://your-worker.workers.dev/api/openalex/works?search=test"

# arXiv
curl "https://your-worker.workers.dev/api/arxiv/query?search_query=ti:test&max_results=1"
```

## 更新部署

修改程式碼後重新部署：

```bash
npx wrangler deploy
```

檢視部署歷史和回滾：

```bash
# 檢視部署歷史
npx wrangler deployments list

# 回滾到上一個版本
npx wrangler rollback
```

## 監控和日誌

### 實時日誌

```bash
npx wrangler tail
```

### Cloudflare Dashboard

1. 進入：https://dash.cloudflare.com
2. Workers & Pages → `academic-search-proxy`
3. 檢視：
   - 請求統計
   - 錯誤率
   - CPU 時間
   - 頻寬使用

## 安全配置

### 生產環境建議

1. **啟用認證**
   ```toml
   [vars]
   ENABLE_AUTH = "true"
   ```

2. **限制來源**
   ```toml
   [vars]
   ALLOWED_ORIGINS = "https://yourdomain.com,https://app.yourdomain.com"
   ```

3. **設定強金鑰**
   ```bash
   # 生成隨機金鑰
   openssl rand -base64 32

   # 設定為 AUTH_SECRET
   npx wrangler secret put AUTH_SECRET
   ```

4. **新增速率限制**（需要付費計劃）
   - 在 Cloudflare Dashboard 設定 Rate Limiting 規則

## 故障排查

### 部署失敗

```bash
# 檢查配置
npx wrangler whoami

# 重新登入
npx wrangler login

# 清理快取
rm -rf node_modules .wrangler
npx wrangler deploy
```

### CORS 錯誤

確認 `ALLOWED_ORIGINS` 包含你的域名：
```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:8080,https://yourdomain.com"
```

### 401 錯誤

檢查認證配置：
```bash
# 檢視當前變數
npx wrangler secret list

# 重新設定
npx wrangler secret put AUTH_SECRET
```

### 速率限制

新增 API Keys：
```bash
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
npx wrangler secret put PUBMED_API_KEY
```

## 成本

### 免費套餐

- **請求數**: 100,000 請求/天
- **CPU 時間**: 10ms/請求（免費額度：10ms x 100,000 = 1,000秒/天）
- **足夠覆蓋**: 中小型應用

### 付費套餐（$5/月）

- **請求數**: 10,000,000 請求/月
- **CPU 時間**: 30,000,000 CPU 毫秒/月
- **適合**: 大型應用

## 下一步

1. ✅ 部署 Worker
2. ✅ 配置環境變數
3. ✅ 測試所有端點
4. ⏭️ 修改前端程式碼使用代理（見 README.md）
5. ⏭️ 在設定介面新增配置選項

## 參考資料

- [Cloudflare Workers 文件](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文件](https://developers.cloudflare.com/workers/wrangler/)
- [Workers 定價](https://developers.cloudflare.com/workers/platform/pricing/)
