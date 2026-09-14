# PB OCR Proxy Worker

Cloudflare Worker 支援 MinerU 和 Doc2X 雙 OCR 引擎，解決 CORS 與 API 金鑰管理。

## 快速開始

詳見 [DEPLOY.md](./DEPLOY.md)

## 目錄結構

```
pb-ocr-proxy/
├── src/index.js       # Worker 核心程式碼
├── wrangler.toml      # Wrangler 配置
├── examples/          # 測試頁面
├── DEPLOY.md          # 完整部署文件
└── README.md
```

## 核心特性

- **雙引擎**: MinerU + Doc2X
- **靈活 Token**: 前端透傳或 Worker 持有
- **零成本**: Cloudflare 免費額度 10 萬次/天
- **安全**: CORS 白名單、API Key 驗證

## API 端點

### MinerU
- `POST /mineru/upload` - 上傳檔案
- `GET /mineru/result/{batch_id}` - 查詢結果
- `GET /mineru/zip?url=...` - 代理下載

### Doc2X
- `POST /doc2x/upload` - 上傳檔案
- `GET /doc2x/status/{uid}` - 查詢狀態
- `POST /doc2x/convert` - 觸發匯出
- `GET /doc2x/convert/result/{uid}` - 查詢匯出
- `GET /doc2x/zip?url=...` - 代理下載

### 通用
- `GET /health` - 健康檢查

## 環境變數

**Token（至少配置一個）:**
- `MINERU_API_TOKEN` (Secret)
- `DOC2X_API_TOKEN` (Secret)

**鑑權（可選）:**
- `ENABLE_AUTH` = "true" (Variable)
- `AUTH_SECRET` (Secret, 需 ENABLE_AUTH)
- `ALLOWED_ORIGINS` = "https://your-domain.com" (Variable)

## Token 優先順序

`X-MinerU-Key` / `X-Doc2X-Key` 請求頭 > Worker 環境變數

## 部署

### 方式 1: Cloudflare Dashboard
1. Workers & Pages → Create Worker
2. 貼上 `src/index.js` → Deploy
3. Settings → Variables 配置環境變數

### 方式 2: Wrangler CLI
```bash
wrangler secret put MINERU_API_TOKEN
wrangler secret put DOC2X_API_TOKEN
wrangler deploy
```

## 許可證

MIT
