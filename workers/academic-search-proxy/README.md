# Academic Search Proxy - Cloudflare Worker

CORS 代理服務，解決瀏覽器訪問學術搜尋 API 的跨域限制。

## 支援的服務

- ✅ **Semantic Scholar** - AI 驅動的學術搜尋
- ✅ **PubMed** - 醫學/生物學文獻資料庫
- ✅ **CrossRef** - DOI 序號產生器構資料庫
- ✅ **OpenAlex** - 開放學術圖譜
- ✅ **arXiv** - 預印本伺服器

## 快速開始

### 本地開發

```bash
cd workers/academic-search-proxy
npx wrangler dev
```

服務將在 `http://localhost:8787` 啟動。

### 部署到 Cloudflare

```bash
# 首次部署
npx wrangler deploy

# 設定環境變數（可選）
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY
npx wrangler secret put PUBMED_API_KEY
npx wrangler secret put AUTH_SECRET
```

## API 端點

### 健康檢查
```
GET /health
```

返回服務狀態和配置資訊。

### Semantic Scholar
```
GET /api/semanticscholar/graph/v1/paper/search?query=machine+learning&limit=5
```

### PubMed
```
GET /api/pubmed/esearch.fcgi?db=pubmed&term=cancer&retmode=json&retmax=5
GET /api/pubmed/efetch.fcgi?db=pubmed&id=12345&retmode=xml
```

### CrossRef
```
GET /api/crossref/works?query.title=deep+learning&rows=5
```

### OpenAlex
```
GET /api/openalex/works?search=neural+networks
```

### arXiv
```
GET /api/arxiv/query?search_query=ti:transformer&max_results=5
```

## 客戶端使用

修改前端程式碼，將直接 API 呼叫改為透過代理：

```javascript
// 配置代理地址
const PROXY_BASE = 'https://your-worker.workers.dev';

// Semantic Scholar
fetch(`${PROXY_BASE}/api/semanticscholar/graph/v1/paper/search?query=test`)

// PubMed
fetch(`${PROXY_BASE}/api/pubmed/esearch.fcgi?db=pubmed&term=cancer&retmode=json`)

// CrossRef
fetch(`${PROXY_BASE}/api/crossref/works?query.title=test`)

// OpenAlex
fetch(`${PROXY_BASE}/api/openalex/works?search=test`)

// arXiv
fetch(`${PROXY_BASE}/api/arxiv/query?search_query=ti:test`)
```

## 配置

### 環境變數

在 `wrangler.toml` 中配置（或使用 Cloudflare Dashboard）：

```toml
[vars]
ENABLE_AUTH = "false"
ALLOWED_ORIGINS = "http://localhost:8080,https://yourdomain.com"
```

### Secrets（敏感資訊）

使用 wrangler CLI 設定：

```bash
# Semantic Scholar API Key (可選，提高速率限制)
npx wrangler secret put SEMANTIC_SCHOLAR_API_KEY

# PubMed API Key (可選，提高速率限制)
npx wrangler secret put PUBMED_API_KEY

# 認證金鑰（如果啟用 ENABLE_AUTH）
npx wrangler secret put AUTH_SECRET
```

### 客戶端 API Key 透傳

如果不想在 Worker 中儲存 API Key，可以從客戶端傳遞：

```javascript
fetch(`${PROXY_BASE}/api/semanticscholar/...`, {
    headers: {
        'X-Api-Key': 'your-client-api-key'
    }
})
```

### 啟用認證

1. 設定 `ENABLE_AUTH = "true"`
2. 設定 `AUTH_SECRET`
3. 客戶端請求時包含認證頭：

```javascript
fetch(`${PROXY_BASE}/api/...`, {
    headers: {
        'X-Auth-Key': 'your-auth-secret'
    }
})
```

## 速率限制

### 無 API Key
- **Semantic Scholar**: 20 請求/分鐘
- **PubMed**: 3 請求/秒

### 有 API Key
- **Semantic Scholar**: 180 請求/分鐘（提升 9 倍）
- **PubMed**: 10 請求/秒（提升 3 倍）

### 獲取 API Key
- [Semantic Scholar API](https://www.semanticscholar.org/product/api)
- [NCBI API Key](https://www.ncbi.nlm.nih.gov/account/settings/)

## 安全建議

1. ✅ 在生產環境啟用 `ENABLE_AUTH`
2. ✅ 設定 `ALLOWED_ORIGINS` 限制來源
3. ✅ 使用 Secrets 儲存敏感資訊
4. ✅ 監控使用量，避免濫用
5. ✅ 定期輪換 `AUTH_SECRET`

## 故障排查

### CORS 錯誤
確保 Worker 返回正確的 CORS 頭。檢查：
- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

### 401 Unauthorized
- 檢查 `ENABLE_AUTH` 配置
- 確認 `X-Auth-Key` 頭正確
- 驗證 `ALLOWED_ORIGINS` 包含你的域名

### API 速率限制
- 考慮新增 API Key
- 實現客戶端快取
- 新增請求去重邏輯

## 開發

### 目錄結構
```
workers/academic-search-proxy/
├── src/
│   └── index.js        # Worker 主檔案
├── wrangler.toml       # Cloudflare 配置
├── README.md           # 本文件
└── DEPLOY.md           # 部署指南
```

### 測試

```bash
# 健康檢查
curl https://your-worker.workers.dev/health

# Semantic Scholar
curl "https://your-worker.workers.dev/api/semanticscholar/graph/v1/paper/search?query=test"

# PubMed
curl "https://your-worker.workers.dev/api/pubmed/esearch.fcgi?db=pubmed&term=cancer&retmode=json"
```

## License

MIT
