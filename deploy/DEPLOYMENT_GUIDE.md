# Paper Burner X 部署指南

本指南介紹如何部署 Paper Burner X 的 Docker 版本（包含後端和資料庫）。

---

## 📋 目錄

1. [快速開始](#快速開始)
2. [環境變數配置](#環境變數配置)
3. [部署方式](#部署方式)
4. [常見問題](#常見問題)

---

## 🚀 快速開始

### 前置要求

- Docker 和 Docker Compose 已安裝
- Git 已安裝（用於克隆倉庫）

### 快速部署步驟

```bash
# 1. 克隆倉庫
git clone https://github.com/Feather-2/paper-burner-x.git
cd paper-burner-x

# 2. 複製環境變數模板
cp .env.example .env

# 3. 編輯環境變數（重要！）
nano .env  # 或使用其他編輯器

# 4. 啟動服務
docker-compose up -d

# 5. 檢視日誌
docker-compose logs -f
```

---

## 🔧 環境變數配置

### 第一步：複製模板檔案

```bash
cp .env.example .env
```

### 第二步：編輯 `.env` 檔案

開啟 `.env` 檔案並修改以下**必須配置**的專案：

#### ⚠️ 必須修改的配置

```bash
# 1. 資料庫密碼（強烈建議修改）
DB_PASSWORD=你的超強密碼123!@#

# 2. JWT 金鑰（必須修改，至少 32 個字元）
JWT_SECRET=你的超級安全金鑰-至少32個字元-請使用隨機字串

# 3. 管理員賬戶（首次啟動時建立）
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=你的管理員密碼
ADMIN_NAME=管理員
```

#### 🔑 生成安全金鑰的方法

**方法 1：使用 OpenSSL（推薦）**
```bash
# 生成 JWT 金鑰
openssl rand -base64 32

# 生成資料庫密碼
openssl rand -base64 24
```

**方法 2：使用 Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**方法 3：線上生成器**
訪問 https://randomkeygen.com/ 生成強密碼

#### 📝 可選配置

```bash
# OCR 服務（如果需要 OCR 功能）
MINERU_API_TOKEN=your_mineru_token
DOC2X_API_TOKEN=your_doc2x_token

# AI 翻譯模型（如果需要後端提供 API keys）
DEEPSEEK_API_KEY=your_deepseek_key
GEMINI_API_KEY=your_gemini_key
CLAUDE_API_KEY=your_claude_key
TONGYI_API_KEY=your_tongyi_key
VOLCANO_API_KEY=your_volcano_key

# CORS 配置（如果需要限制訪問域名）
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# 其他配置
MAX_UPLOAD_SIZE=100  # 檔案上傳大小限制（MB）
LOG_LEVEL=info       # 日誌級別
```

### 第三步：驗證配置

檢查你的 `.env` 檔案是否包含所有必要的配置：

```bash
# 檢查關鍵配置是否存在
grep -E "DB_PASSWORD|JWT_SECRET|ADMIN_EMAIL|ADMIN_PASSWORD" .env
```

---

## 🐳 部署方式

### 方式 1：使用 Docker Compose（推薦）

**啟動服務：**
```bash
docker-compose up -d
```

**檢視日誌：**
```bash
docker-compose logs -f
```

**停止服務：**
```bash
docker-compose down
```

**重啟服務：**
```bash
docker-compose restart
```

**檢視執行狀態：**
```bash
docker-compose ps
```

### 方式 2：使用一鍵部署腳本

**Linux/Mac：**
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**Windows (PowerShell)：**
```powershell
.\scripts\deploy.ps1
```

### 方式 3：從 Docker Hub 拉取映象

```bash
# 拉取最新映象
docker pull feather2dev/paper-burner-x:latest

# 手動執行（需要先啟動 PostgreSQL）
docker run -d \
  --name paper-burner-x \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  -e JWT_SECRET="your-secret-key" \
  -e ADMIN_EMAIL="admin@example.com" \
  -e ADMIN_PASSWORD="admin-password" \
  feather2dev/paper-burner-x:latest
```

---

## 🔍 驗證部署

### 1. 檢查服務狀態

```bash
# 檢查容器是否執行
docker-compose ps

# 應該看到兩個服務都是 "Up" 狀態：
# - paper-burner-x_app
# - paper-burner-x_postgres
```

### 2. 訪問服務

- **前端介面**: http://localhost:3000
- **管理面板**: http://localhost:3000/admin
- **API 健康檢查**: http://localhost:3000/api/health

### 3. 測試管理員登入

1. 訪問 http://localhost:3000/admin
2. 使用 `.env` 中配置的管理員郵箱和密碼登入
3. 如果登入成功，說明後端和資料庫都正常工作

---

## 🔄 更新部署

### 從 Git 倉庫更新

```bash
# 1. 停止服務
docker-compose down

# 2. 拉取最新程式碼
git pull origin main

# 3. 重新構建映象
docker-compose build --no-cache

# 4. 啟動服務
docker-compose up -d
```

### 從 Docker Hub 更新

```bash
# 1. 停止服務
docker-compose down

# 2. 拉取最新映象
docker-compose pull

# 3. 啟動服務
docker-compose up -d
```

---

## 📊 資料管理

### 資料庫備份

```bash
# 備份資料庫
docker-compose exec postgres pg_dump -U paperburner paperburner > backup_$(date +%Y%m%d).sql

# 或使用 Docker 卷備份
docker run --rm \
  -v paper-burner-x_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data_backup.tar.gz /data
```

### 資料庫恢復

```bash
# 從 SQL 檔案恢復
docker-compose exec -T postgres psql -U paperburner paperburner < backup_20250115.sql
```

### 檢視資料庫

```bash
# 進入資料庫容器
docker-compose exec postgres psql -U paperburner -d paperburner

# 常用 SQL 命令
\dt              # 列出所有表
\d User          # 檢視 User 表結構
SELECT * FROM "User" LIMIT 5;  # 檢視使用者資料
```

---

## 🐛 常見問題

### 1. 資料庫連線失敗

**錯誤資訊：**
```
Error: Environment variable not found: DATABASE_URL
```

**解決方法：**
- 檢查 `.env` 檔案是否存在
- 檢查 `docker-compose.yml` 是否正確參考了 `.env`
- 確保 PostgreSQL 容器已啟動：`docker-compose ps`

### 2. 管理員賬戶無法登入

**可能原因：**
- 首次啟動時 `.env` 中的管理員配置不正確
- 資料庫中管理員賬戶未建立

**解決方法：**
```bash
# 檢視容器日誌，確認管理員是否建立成功
docker-compose logs app | grep -i admin

# 重新建立管理員賬戶
docker-compose exec app node server/src/utils/initAdmin.js
```

### 3. 埠衝突

**錯誤資訊：**
```
Error: port is already allocated
```

**解決方法：**
修改 `docker-compose.yml` 中的埠對映：
```yaml
ports:
  - "3001:3000"  # 改為 3001 或其他可用埠
```

### 4. 容器啟動後立即退出

**排查步驟：**
```bash
# 1. 檢視詳細日誌
docker-compose logs

# 2. 檢查環境變數
docker-compose config

# 3. 重新構建
docker-compose build --no-cache
docker-compose up
```

### 5. OpenSSL 相容性問題（已修復）

如果你使用舊版本的程式碼遇到以下錯誤：
```
Error loading shared library libssl.so.1.1
```

**解決方法：**
拉取最新程式碼，已修復此問題（使用 OpenSSL 3.x）

---

## 🔒 生產環境安全建議

### 1. 使用 HTTPS

使用 Nginx 或 Traefik 作為反向代理，配置 SSL 證書：

```bash
# 在 docker-compose.yml 中啟用 Nginx 服務
# 取消註釋 nginx 服務部分
```

### 2. 修改預設密碼

- ✅ 修改 `DB_PASSWORD`
- ✅ 修改 `JWT_SECRET`（至少 32 個字元）
- ✅ 修改 `ADMIN_PASSWORD`

### 3. 限制 CORS

```bash
# 在 .env 中設定允許的域名
CORS_ORIGIN=https://yourdomain.com
```

### 4. 啟用防火牆

```bash
# 只允許特定埠訪問
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3000/tcp  # 禁止直接訪問應用埠
```

### 5. 定期備份

設定定時任務自動備份資料庫：
```bash
# 新增到 crontab
0 2 * * * /path/to/backup-script.sh
```

---

## 📚 相關文件

- [README.md](./README.md) - 專案介紹
- [LOCAL_TESTING.md](./LOCAL_TESTING.md) - 本地測試指南
- [docker-compose.yml](./docker-compose.yml) - Docker Compose 配置
- [Dockerfile](./Dockerfile) - Docker 映象構建配置

---

## 💡 需要幫助？

- 📖 檢視文件：[GitHub Wiki](https://github.com/Feather-2/paper-burner-x/wiki)
- 🐛 報告問題：[GitHub Issues](https://github.com/Feather-2/paper-burner-x/issues)
- 💬 討論交流：[GitHub Discussions](https://github.com/Feather-2/paper-burner-x/discussions)

---

**祝部署順利！🎉**
