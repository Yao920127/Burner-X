# PB OCR Proxy (Cloudflare Worker) - 部署與使用指南

> 單個 Worker 同時支援 MinerU 與 Doc2X 兩種 OCR 服務。無需 Vercel 配置，直接在 Cloudflare 主控台部署即可使用。

---

## 🚀 Fast Deploy · 快速部署

本節用最短路徑告訴你如何上線與如何在 Paper Burner X 裡配置。

### 1) 環境變數一覽

- 必選（至少二選一）：
  - Secret `MINERU_API_TOKEN`（MinerU 令牌）
  - Secret `DOC2X_API_TOKEN`（Doc2X 令牌）
- 可選（推薦生產）：
  - Variable `ENABLE_AUTH` = `true|false`（是否開啟鑑權）
  - Secret `AUTH_SECRET`（鑑權金鑰，開啟 ENABLE_AUTH 時必填）
  - Variable/Secret `ALLOWED_ORIGINS` = `https://your-frontend.com,https://another.com`（CORS 白名單）

備註：令牌值只填 Token 本體，不要帶 `Bearer ` 字首。請求頭裡同理。

### 2) Cloudflare 主控台 3 步上線

1. 建立 Worker → Delete 示例程式碼 → 貼上 `src/index.js` → Save & Deploy
2. Settings → Variables/Secrets：按上面的變數一覽新增
3. 複製你的 URL（如 `https://xxx.workers.dev`），用於前端配置

### 3) 常見使用場景與如何配置

場景 A：多人共享 Worker，各自用自己的 Key（推薦“前端透傳模式”）
- Cloudflare Worker：
  - 可不配置 `MINERU_API_TOKEN` / `DOC2X_API_TOKEN`
  - 建議開啟鑑權：`ENABLE_AUTH=true`，配置 `AUTH_SECRET`，並設定 `ALLOWED_ORIGINS`
- Paper Burner X：
  - 開啟“模型與Key管理” → MinerU / Doc2X：
    - Worker URL：填你的 Worker 地址
    - Worker Auth Key：填 `AUTH_SECRET`（若開啟鑑權）
    - Token 模式：選擇“前端透傳模式”，在 PBX 內填入各自的服務 Token
  - OCR 引擎：在主介面 OCR 設定裡選擇 MinerU / Doc2X
  - 點選“測試連線”確認可達

場景 B：個人 Worker（或你提供統一 Key 給他人使用）
- Cloudflare Worker：
  - 配置 `MINERU_API_TOKEN` / `DOC2X_API_TOKEN`
  - 開啟鑑權：`ENABLE_AUTH=true` + `AUTH_SECRET`
  - 配置 `ALLOWED_ORIGINS`（只允許你的前端域）
- Paper Burner X：
  - 開啟“模型與Key管理” → MinerU / Doc2X：
    - Worker URL：填你的 Worker 地址
    - Worker Auth Key：填 `AUTH_SECRET`
    - Token 模式：選擇“Worker 配置模式”（前端不再填 Token）
  - OCR 引擎：在主介面 OCR 設定裡選擇 MinerU / Doc2X
  - 點選“測試連線”確認可達

優先順序說明（兩服務一致）：如果同時提供了“請求頭 Token（前端透傳）”與“Worker 環境變數”，請求頭優先。

---

## 一、功能概覽

Worker 提供以下統一端點（均基於你的 workers.dev 子域或自定義域）：

- MinerU
  - POST `/mineru/upload`    上傳檔案（表單）並行起處理
  - GET  `/mineru/result/{batch_id}` 輪詢處理結果（含 `__health__` 測活）
  - GET  `/mineru/zip?url=...` 代理下載 ZIP（解決瀏覽器跨域）
- Doc2X
  - POST `/doc2x/upload`     預上傳並上傳檔案
  - GET  `/doc2x/status/{uid}` 輪詢處理狀態（含 `__health__` 測活）
  - POST `/doc2x/convert`    觸發匯出（可選）
  - GET  `/doc2x/convert/result/{uid}` 查詢匯出結果（可選）
  - GET  `/doc2x/zip?url=...` 代理下載 ZIP（解決瀏覽器跨域）
- 通用
  - GET  `/health` 健康檢查（不校驗 Token）

鑑權與 CORS：
- 可選開啟 `ENABLE_AUTH=true`，啟用後所有業務端點需攜帶請求頭 `X-Auth-Key: <AUTH_SECRET>`。
- Token 傳遞方式：優先讀取請求頭（前端透傳）→ 若不存在則讀取 Worker 環境變數。
- CORS：支援 `ALLOWED_ORIGINS` 白名單與標準預檢（OPTIONS）。

---

## 二、部署步驟（主控台，無需 wrangler）

1. 登入 Cloudflare Dashboard → Workers & Pages → Create Application → Create Worker
2. 命名（如 `pb-ocr-proxy`）→ Deploy → Edit Code
3. 刪除示例程式碼，貼上 `src/index.js` 全部內容 → Save and Deploy
4. Settings → Variables and Secrets：
   - 必填（至少二選一，根據使用場景）：
     - Secret `MINERU_API_TOKEN`（MinerU 令牌）
     - Secret `DOC2X_API_TOKEN`（Doc2X 令牌）
   - 可選（推薦生產）：
     - Variable `ENABLE_AUTH` = `true|false`
     - Secret `AUTH_SECRET`（開啟 ENABLE_AUTH 時必填）
     - Variable/Secret `ALLOWED_ORIGINS` = `https://your-frontend.com,https://another.com`
   - 注意：令牌值只填 Token 本體，不要帶 `Bearer ` 字首。
5. 複製你的 Worker URL（如 `https://pb-ocr-proxy.yourname.workers.dev`）用於前端配置。

> 相容日期（Compatibility Date）建議設定為 >= 2024-10-01。

---

## 三、環境變數說明

- MinerU/Doc2X Token
  - `MINERU_API_TOKEN`（Secret）：MinerU 令牌
  - `DOC2X_API_TOKEN`（Secret）：Doc2X 令牌
- 鑑權與 CORS（可選）
  - `ENABLE_AUTH`（Variable，預設不啟用）：`true` 時開啟鑑權
  - `AUTH_SECRET`（Secret）：開啟鑑權後，所有業務端點需攜帶 `X-Auth-Key: <AUTH_SECRET>`
  - `ALLOWED_ORIGINS`（Variable/Secret）：逗號分隔的白名單 Origin；啟用後僅白名單域可透過預檢

Token 查詢順序（兩服務一致）：
1. 請求頭：`X-MinerU-Key` 或 `X-Doc2X-Key`
2. 環境變數：`MINERU_API_TOKEN` 或 `DOC2X_API_TOKEN`

---

## 四、端點與示例

通用健康：
```bash
curl https://your-worker.workers.dev/health
```

MinerU 測活（含 Token 校驗）：
```bash
# 成功（200）：帶 Token 或 Worker 已配置 Token
curl -i https://your-worker.workers.dev/mineru/result/__health__ \
  -H "X-Auth-Key: <AUTH_SECRET>" \
  -H "X-MinerU-Key: <MINERU_API_TOKEN>"

# 未授權（401）：未提供 Token 且 Worker 未配置 Token
curl -i https://your-worker.workers.dev/mineru/result/__health__
```

Doc2X 測活：
```bash
curl -i https://your-worker.workers.dev/doc2x/status/__health__ \
  -H "X-Auth-Key: <AUTH_SECRET>" \
  -H "X-Doc2X-Key: <DOC2X_API_TOKEN>"
```

MinerU 工作流：
```bash
# 1) 上傳
curl -X POST https://your-worker.workers.dev/mineru/upload \
  -H "X-Auth-Key: <AUTH_SECRET>" \
  -H "X-MinerU-Key: <MINERU_API_TOKEN>" \
  -F file=@/path/to/file.pdf \
  -F is_ocr=true -F enable_formula=true -F enable_table=true -F language=ch

# 響應 { success:true, batch_id:"..." }

# 2) 輪詢結果
curl https://your-worker.workers.dev/mineru/result/<batch_id> \
  -H "X-Auth-Key: <AUTH_SECRET>"

# 3) ZIP 代理下載（解決瀏覽器跨域）
curl -L "https://your-worker.workers.dev/mineru/zip?url=<full_zip_url>" \
  -o result.zip
```

Doc2X 工作流：
```bash
# 1) 上傳
curl -X POST https://your-worker.workers.dev/doc2x/upload \
  -H "X-Auth-Key: <AUTH_SECRET>" \
  -H "X-Doc2X-Key: <DOC2X_API_TOKEN>" \
  -F file=@/path/to/file.pdf

# 響應 { success:true, uid:"..." }

# 2) 輪詢狀態
curl https://your-worker.workers.dev/doc2x/status/<uid> \
  -H "X-Auth-Key: <AUTH_SECRET>"

# 3) （可選）觸發匯出並查詢匯出結果
curl -X POST https://your-worker.workers.dev/doc2x/convert \
  -H "X-Auth-Key: <AUTH_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"uid":"<uid>","to":"md","formula_mode":"dollar"}'

curl https://your-worker.workers.dev/doc2x/convert/result/<uid> \
  -H "X-Auth-Key: <AUTH_SECRET>"

# 4) ZIP 代理下載（解決瀏覽器跨域）
curl -L "https://your-worker.workers.dev/doc2x/zip?url=<zip_url>" -o result.zip
```

CORS 與預檢（OPTIONS）：
- Worker 自動處理預檢請求，允許的請求頭：`Content-Type, X-Auth-Key, X-MinerU-Key, X-Doc2X-Key`
- 設定 `ALLOWED_ORIGINS` 後，只有白名單域可透過預檢並訪問

---

## 五、前端整合要點

- 在前端 UI 中配置 Worker URL（如 `https://your-worker.workers.dev`）即可，無需 Vercel 側代理/重寫
- 鑑權啟用時，在請求中帶 `X-Auth-Key: <AUTH_SECRET>`
- Token 傳遞有兩種模式：
  - 前端透傳：請求頭 `X-MinerU-Key` / `X-Doc2X-Key`
  - Worker 持有：在 Cloudflare 環境變數中配置 `MINERU_API_TOKEN` / `DOC2X_API_TOKEN`
- 對於從第三方返回的 ZIP 下載連結，前端應透過 `/mineru/zip?url=...` 或 `/doc2x/zip?url=...` 代理，避免瀏覽器直連跨域

---

## 六、wrangler CLI 部署（推薦用於生產）

如需使用 wrangler CLI 進行本地開發和自動化部署，專案已包含 `wrangler.toml` 配置檔案。

### 1) 安裝 wrangler

```bash
npm install -g wrangler
# 或使用 pnpm/yarn
pnpm add -g wrangler
```

### 2) 登入 Cloudflare

```bash
wrangler login
```

### 3) 配置環境變數

**Secrets（敏感資訊）：**
```bash
# 至少配置一個 OCR Token
wrangler secret put MINERU_API_TOKEN
wrangler secret put DOC2X_API_TOKEN

# 可選：啟用鑑權
wrangler secret put AUTH_SECRET
```

**Variables（非敏感配置）：**

編輯 `wrangler.toml`，取消註釋需要的變數：
```toml
[vars]
ENABLE_AUTH = "true"
ALLOWED_ORIGINS = "https://yourdomain.com,https://another.com"
```

或使用命令列設定：
```bash
wrangler secret put ALLOWED_ORIGINS --env production
```

### 4) 本地開發

```bash
cd workers/pb-ocr-proxy
wrangler dev
```

訪問 `http://localhost:8787/health` 測試。

### 5) 部署到生產

```bash
wrangler deploy
```

部署成功後會顯示 Worker URL，如 `https://pb-ocr-proxy.yourname.workers.dev`。

### 6) 檢視日誌

```bash
wrangler tail
```

### 7) 管理 Secrets

```bash
# 列出所有 secrets（不顯示值）
wrangler secret list

# 刪除 secret
wrangler secret delete MINERU_API_TOKEN
```

---

## 七、與 Vercel 的關係

- 本倉庫前端在 Vercel 部署；Workers 在 Cloudflare 部署，二者獨立
- 已在倉庫根新增 `.vercelignore` 排除 `workers/` 目錄，避免 Workers 程式碼被當作靜態檔案釋出
- 無需在 `vercel.json` 中為 Workers 寫任何配置

---

## 八、故障排查

- 401 未授權：
  - 未攜帶 `X-Auth-Key`（在開啟鑑權時）或 `X-Auth-Key` 與 `AUTH_SECRET` 不一致
  - 未攜帶服務 Token（請求頭或環境變數），`X-MinerU-Key` / `X-Doc2X-Key` 均為空
- 403 預檢失敗：
  - 設定了 `ALLOWED_ORIGINS`，但請求來源不在白名單
- ZIP 跨域：
  - 直接訪問第三方下載地址跨域失敗；使用 `/mineru/zip?url=...` 或 `/doc2x/zip?url=...` 代理
- 健康與測活：
  - `/health` 僅測試可達性
  - `/mineru/result/__health__` 與 `/doc2x/status/__health__` 用於測試 Token/鑑權鏈路

如需更多示例，請參考 `workers/pb-ocr-proxy/examples/test.html`。
