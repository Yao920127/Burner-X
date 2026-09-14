# Paper Burner X - 快速開始指南

## 🚀 快速部署

### 前置要求

- Docker 和 Docker Compose
- 或者 Node.js 20+ 和 PostgreSQL 16+

---

## 方式一：使用 Docker Compose（推薦）

### 1. 克隆或下載專案

```bash
git clone https://github.com/your-repo/paper-burner-x.git
cd paper-burner-x
```

### 2. 配置環境變數

複製示例配置檔案：

```bash
cp .env.example .env
```

編輯 `.env` 檔案，**務必修改以下關鍵配置**：

```bash
# 資料庫密碼（必改）
DB_PASSWORD=your_secure_password_here

# JWT 金鑰（必改，至少32字元）
JWT_SECRET=your_super_secret_jwt_key_min_32_chars

# API Keys 加密金鑰（必改，至少32字元）
ENCRYPTION_SECRET=your_encryption_secret_min_32_chars

# 管理員賬戶（首次啟動使用）
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_admin_password
```

**生成安全金鑰的方法：**

```bash
# Linux/Mac
openssl rand -base64 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3. 啟動服務

```bash
docker-compose up -d
```

首次啟動會自動：
- 拉取 PostgreSQL 和應用映象
- 建立資料庫
- 執行資料庫遷移
- 建立管理員賬戶

### 4. 驗證部署

訪問：
- 應用主頁：http://localhost:3000
- 管理面板：http://localhost:3000/admin
- API 健康檢查：http://localhost:3000/api/health

### 5. 登入管理員賬戶

使用 `.env` 中配置的管理員郵箱和密碼登入管理面板。

**⚠️ 重要：首次登入後請立即修改管理員密碼！**

---

## 方式二：本地開發部署

### 1. 安裝依賴

```bash
# 安裝前端依賴（如有）
npm install

# 安裝後端依賴
cd server
npm install
```

### 2. 啟動 PostgreSQL

```bash
# 使用 Docker 啟動 PostgreSQL
docker run -d \
  --name paperburner-db \
  -e POSTGRES_USER=paperburner \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=paperburner \
  -p 5432:5432 \
  postgres:16-alpine

# 或使用本地 PostgreSQL 並建立資料庫
createdb paperburner
```

### 3. 配置環境變數

```bash
cd server
cp ../.env.example ../.env
# 編輯 .env 檔案
```

### 4. 執行資料庫遷移

```bash
cd server
npx prisma generate
npx prisma migrate deploy
```

### 5. 啟動後端服務

```bash
cd server
npm start
```

### 6. 訪問應用

http://localhost:3000

---

## 📊 管理員功能

### 登入管理面板

訪問 `/admin` 並使用管理員賬戶登入。

### 主要功能

1. **使用者管理**
   - 檢視所有使用者
   - 啟用/禁用使用者賬戶
   - 檢視使用者詳細資訊

2. **系統統計**
   - 總使用者數、活躍使用者
   - 文件處理量
   - 儲存使用情況

3. **配額管理**
   - 設定使用者文件數量限制
   - 設定儲存空間限制
   - 檢視當前使用量

4. **系統配置**
   - 全域設定
   - 自定義模型源站管理

---

## 👤 使用者註冊和使用

### 註冊賬戶

如果允許使用者註冊（預設允許），使用者可以：

1. 訪問主頁
2. 點選"註冊"
3. 填寫郵箱、密碼、姓名
4. 提交註冊

### 配置 API Keys

登入後：

1. 進入設定頁面
2. 新增翻譯服務的 API Keys（如 DeepSeek、Gemini、Claude 等）
3. 配置 OCR 服務 API Keys（MinerU 或 Doc2X）

**注意：所有 API Keys 都會自動加密儲存，確保安全。**

### 上傳和處理文件

1. 上傳 PDF 檔案
2. 選擇 OCR 服務和翻譯模型
3. 開始處理
4. 檢視結果、下載譯文

### 檢視歷史記錄

在歷史記錄頁面可以：
- 檢視所有處理過的文件
- 重新檢視翻譯結果
- 新增標註和醒目提示
- 匯出為 DOCX、Markdown 等格式

---

## 🔧 高階配置

### Nginx 反向代理（生產環境）

如需使用 Nginx，取消註釋 `docker-compose.yml` 中的 nginx 服務：

```yaml
services:
  nginx:
    # ... nginx 配置
    profiles:
      - production
```

然後使用：

```bash
docker-compose --profile production up -d
```

### 自定義埠

在 `.env` 中修改：

```bash
APP_PORT=8080  # 應用埠
DB_PORT=5433   # 資料庫埠
NGINX_PORT=80  # Nginx 埠
```

### CORS 配置

如果前後端分離部署，配置允許的域名：

```bash
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
```

### 檔案上傳大小限制

```bash
MAX_UPLOAD_SIZE=100  # MB
```

---

## 🛠️ 常見問題

### 1. 資料庫連線失敗

**問題**: `Error: connect ECONNREFUSED`

**解決**:
- 檢查 PostgreSQL 是否執行
- 檢查 `DATABASE_URL` 配置是否正確
- 確認資料庫埠沒有被佔用

### 2. 管理員賬戶未建立

**問題**: 無法登入管理面板

**解決**:
```bash
# 檢視容器日誌
docker-compose logs app

# 應該看到：
# ✓ Admin account created successfully
# Email: admin@paperburner.local
# Password: admin123456

# 如果未建立，手動建立：
docker-compose exec app node -e "require('./server/src/utils/initAdmin.js').initializeAdmin()"
```

### 3. 資料庫遷移失敗

**問題**: Prisma 遷移錯誤

**解決**:
```bash
# 重置資料庫（開發環境）
docker-compose exec app npx prisma migrate reset

# 生產環境
docker-compose exec app npx prisma migrate deploy
```

### 4. API Keys 加密錯誤

**問題**: 解密失敗

**解決**:
- 確保 `ENCRYPTION_SECRET` 沒有改變
- 如果更換了金鑰，需要重新新增所有 API Keys

### 5. 配額檢查不生效

**問題**: 使用者超出配額仍可建立文件

**解決**:
- 檢查使用者是否有配額設定：`GET /api/admin/users/:userId/quota`
- 設定配額：`PUT /api/admin/users/:userId/quota`

---

## 📝 資料備份

### 備份資料庫

```bash
# 使用 Docker
docker-compose exec postgres pg_dump -U paperburner paperburner > backup.sql

# 或使用 pg_dump
pg_dump -U paperburner -h localhost -p 5432 paperburner > backup.sql
```

### 恢復資料庫

```bash
# 使用 Docker
docker-compose exec -T postgres psql -U paperburner paperburner < backup.sql

# 或使用 psql
psql -U paperburner -h localhost -p 5432 paperburner < backup.sql
```

### 備份上傳檔案

```bash
# 備份 Docker Volume
docker run --rm \
  -v paperburner_app_uploads:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/uploads-backup.tar.gz -C /data .
```

---

## 🔐 安全建議

### 生產環境部署清單

- [ ] 修改所有預設密碼
- [ ] 使用強隨機金鑰（JWT_SECRET、ENCRYPTION_SECRET）
- [ ] 配置 HTTPS（使用 Nginx + Let's Encrypt）
- [ ] 設定防火牆規則
- [ ] 定期備份資料庫
- [ ] 監控系統日誌
- [ ] 啟用訪問日誌
- [ ] 限制管理員 IP 範圍（可選）
- [ ] 配置郵件通知（可選）

### HTTPS 配置示例

在 `docker/nginx.conf` 中配置 SSL：

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📚 下一步

- 閱讀 [BACKEND_IMPROVEMENTS.md](BACKEND_IMPROVEMENTS.md) 瞭解詳細功能
- 檢視 [API_REFERENCE.md](API_REFERENCE.md) 學習 API 使用
- 參考 [schema.prisma](server/prisma/schema.prisma) 瞭解資料模型

---

## 💬 獲取幫助

- GitHub Issues: https://github.com/your-repo/paper-burner-x/issues
- 文件: https://docs.yourproject.com
- Email: support@yourproject.com

---

**祝使用愉快！🎉**
