# 環境變數配置指南

本文件說明 Paper Burner X 專案的環境變數配置要求。

## 快速開始

### 開發環境（開箱即用）

開發環境可以使用預設值，系統會自動生成安全的開發金鑰並給出警告提示：

```bash
# 無需配置即可執行（會有警告提示）
npm run dev
```

### 生產環境（必須配置）

生產環境必須設定以下關鍵安全變數：

```bash
# 必需的環境變數
NODE_ENV=production
JWT_SECRET=<生成強隨機字串>
ENCRYPTION_SALT=<生成強隨機字串>
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# 推薦配置
FILE_VALIDATION_STRICT=true
DATABASE_URL=postgresql://...
```

## 環境變數說明

### 🔴 必需配置（生產環境）

| 變數名 | 說明 | 示例 | 開發環境 | 生產環境 |
|--------|------|------|----------|----------|
| `NODE_ENV` | 環境模式 | `production` | 可選 | **必需** |
| `JWT_SECRET` | JWT 簽名金鑰 | 隨機字串 | 自動生成 | **必需** |
| `ENCRYPTION_SALT` | 加密 salt | 隨機字串 | 使用預設值 | **必需** |

### 🟡 部署配置

| 變數名 | 說明 | 示例 | 預設值 |
|--------|------|------|--------|
| `DEPLOYMENT_MODE` | 部署模式 | `frontend` / `backend` | `frontend` |
| `CORS_ORIGIN` | CORS 允許的源 | `https://example.com` | 開發環境允許所有源 |
| `PORT` | 伺服器埠 | `3000` | `3000` |

### 🟢 安全配置

| 變數名 | 說明 | 示例 | 預設值 |
|--------|------|------|--------|
| `DISABLE_CSP` | 是否禁用 CSP | `true` / `false` | `false` |
| `CSP_ALLOW_INLINE` | 是否允許內聯腳本 | `true` / `false` | 前端模式自動啟用 |
| `FILE_VALIDATION_STRICT` | 檔案型別驗證嚴格模式 | `true` / `false` | `false` |
| `ALLOWED_MIME_TYPES` | 允許的檔案型別 | `application/pdf,text/markdown` | 內建白名單 |
| `MAX_UPLOAD_SIZE` | 最大檔案大小（MB） | `100` | `100` |

### 🔵 資料庫配置

| 變數名 | 說明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | Prisma 資料庫連線 URL | `postgresql://user:pass@localhost:5432/db` |

### 🟣 JWT 配置

| 變數名 | 說明 | 示例 | 預設值 |
|--------|------|------|--------|
| `JWT_EXPIRES_IN` | JWT 過期時間 | `7d` | `7d` |

## 生成安全金鑰

### 使用 OpenSSL

```bash
# 生成 JWT_SECRET（32 位元組 Base64）
openssl rand -base64 32

# 生成 ENCRYPTION_SALT（32 位元組 Base64）
openssl rand -base64 32
```

### 使用 Node.js

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 配置示例

### .env（開發環境）

```bash
NODE_ENV=development
DEPLOYMENT_MODE=frontend
# JWT_SECRET 和 ENCRYPTION_SALT 可以不設定，系統會自動生成
```

### .env（生產環境）

```bash
NODE_ENV=production
JWT_SECRET=<生成的強隨機字串>
ENCRYPTION_SALT=<生成的強隨機字串>
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
FILE_VALIDATION_STRICT=true
DATABASE_URL=postgresql://user:password@localhost:5432/paperburner
```

## 安全提示

1. **永遠不要將 `.env` 檔案提交到 Git**
2. **生產環境必須設定所有安全相關變數**
3. **定期輪換金鑰**（會影響現有使用者登入，需要配合遷移策略）
4. **使用強隨機字串作為金鑰**（至少 32 位元組）
5. **限制 CORS_ORIGIN 為實際需要的域名**

## 遷移注意事項

⚠️ **重要**：更改 `ENCRYPTION_SALT` 會導致已加密的資料無法解密。如需更改 salt，需要：

1. 先解密所有資料
2. 更改 salt
3. 重新加密資料

因此，建議在生產環境部署前就設定好 `ENCRYPTION_SALT`。

