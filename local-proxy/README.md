# Paper Burner 本地代理伺服器

輕量級本地代理伺服器，功能完全等同於 Cloudflare Worker，讓你無需部署到雲端即可使用。

> **重要提示**：此本地代理僅支援 HTTP 協議，必須配合**本地執行的 Paper Burner 前端**使用。
> 如果你從 HTTPS 網站（如 `https://paperburner.viwoplus.site`）訪問，由於瀏覽器安全限制（Mixed Content），無法連線到本地 HTTP 服務。
> 請使用我們提供的 Cloudflare Worker 或自行部署 HTTPS 代理。

## 功能

- **OCR 代理**: MinerU / Doc2X
- **學術搜尋代理**: Semantic Scholar / PubMed / CrossRef / OpenAlex / arXiv
- **檔案下載代理**: PDF / ZIP（解決跨域問題）

## 快速開始

### 1. 啟動本地代理

```bash
cd local-proxy
npm install
npm start
```

### 2. 啟動本地前端

在專案根目錄啟動一個本地伺服器：

```bash
# 方式一：使用 npx serve
npx serve -p 8080

# 方式二：使用 Python
python -m http.server 8080

# 方式三：使用 VS Code Live Server 外掛
```

### 3. 配置使用

1. 訪問 `http://localhost:8080`
2. 進入設定頁面
3. 將代理地址設定為：`http://localhost:3456`
4. 儲存設定

## 配置

1. 複製配置檔案：
   ```bash
   cp .env.example .env
   ```

2. 編輯 `.env` 檔案，填入你的 API Token（可選）：
   ```
   MINERU_API_TOKEN=your_mineru_token
   DOC2X_API_TOKEN=your_doc2x_token
   ```

3. 啟動伺服器：
   ```bash
   npm start
   ```

## API 路由

### OCR 服務

| 路由 | 方法 | 說明 |
|------|------|------|
| `/mineru/upload` | POST | MinerU 檔案上傳 |
| `/mineru/result/:batchId` | GET | 獲取 MinerU 處理結果 |
| `/doc2x/upload` | POST | Doc2X 檔案上傳 |
| `/doc2x/status/:uid` | GET | 查詢 Doc2X 狀態 |
| `/doc2x/convert` | POST | Doc2X 格式轉換 |
| `/doc2x/convert/result/:uid` | GET | 獲取轉換結果 |
| `/mineru/zip?url=` | GET | MinerU ZIP 代理下載 |
| `/doc2x/zip?url=` | GET | Doc2X ZIP 代理下載 |

### 學術搜尋

| 路由 | 方法 | 說明 |
|------|------|------|
| `/api/semanticscholar/*` | GET | Semantic Scholar 代理 |
| `/api/pubmed/*` | GET | PubMed 代理 |
| `/api/crossref/*` | GET | CrossRef 代理 |
| `/api/openalex/*` | GET | OpenAlex 代理 |
| `/api/arxiv/*` | GET | arXiv 代理 |
| `/api/pdf/download?url=` | GET | PDF 下載代理 |

### 其他

| 路由 | 方法 | 說明 |
|------|------|------|
| `/health` | GET | 健康檢查 |

## 請求頭

可以透過請求頭傳遞 API Token（優先順序高於環境變數）：

- `X-MinerU-Key`: MinerU API Token
- `X-Doc2X-Key`: Doc2X API Token
- `X-Api-Key`: Semantic Scholar / PubMed API Key

## 系統要求

- Node.js >= 18.0.0

## 使用場景對比

| 場景 | 推薦方案 |
|------|----------|
| 本地開發/測試 | 本地代理 + 本地前端 |
| 日常使用（線上） | Cloudflare Worker |
| 私有部署 | 自建 HTTPS 代理伺服器 |

## 為什麼不支援 HTTPS 網站？

瀏覽器的 **Mixed Content** 安全策略禁止 HTTPS 頁面請求 HTTP 資源。雖然可以透過自簽名證書啟用 HTTPS，但：

1. 自簽名證書需要手動信任，使用者體驗差
2. 防毒軟體（如卡巴斯基）可能攔截自簽名 HTTPS 流量
3. 每次證書過期都需要重新配置

因此，本地代理僅推薦用於**本地開發和測試**場景。

## License

GPL-2.0
