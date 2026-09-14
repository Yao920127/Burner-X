# 本地測試指南 - 推送前驗證

## ✅ Vercel 配置檢查（已透過）

### 檢查結果：
- ✅ `.vercelignore` 正確配置，會忽略所有後端檔案
- ✅ `vercel.json` 配置正確
- ✅ 前端檔案完整：index.html, js/, css/, public/, views/
- ✅ 後端檔案會被忽略：server/, docker/, scripts/

**結論：Vercel 部署安全，不會上傳後端程式碼**

---

## 🧪 本地測試步驟

### 測試 1：前端模式（模擬 Vercel）

```bash
# 啟動簡單的 HTTP 伺服器
python -m http.server 8000

# 或使用 Node.js
npx http-server -p 8000

# 訪問 http://localhost:8000
```

**測試項**：
- [ ] 頁面正常載入
- [ ] 可以開啟檔案選擇
- [ ] localStorage 正常工作
- [ ] 所有現有功能正常
- [ ] 主控台無錯誤

---

### 測試 2：Docker 後端模式

#### 2.1 檢查 Docker 環境
```bash
docker --version
docker-compose --version
```

#### 2.2 配置環境變數
```bash
cp .env.example .env
nano .env
```

**最小配置**：
```env
DB_PASSWORD=test123456
JWT_SECRET=test-jwt-secret-minimum-32-characters-long
ADMIN_EMAIL=admin@test.local
ADMIN_PASSWORD=admin123456
```

#### 2.3 啟動 Docker
```bash
# 方式 1: 使用部署腳本
cd scripts
./deploy.sh

# 方式 2: 手動啟動
docker-compose up -d

# 檢視日誌
docker-compose logs -f app
```

#### 2.4 驗證服務
```bash
# 健康檢查
curl http://localhost:3000/api/health

# 訪問前端
open http://localhost:3000

# 訪問管理面板
open http://localhost:3000/admin
```

**測試項**：
- [ ] 所有容器正常執行
- [ ] 資料庫連線成功
- [ ] API 健康檢查透過
- [ ] 前端頁面正常載入
- [ ] 可以註冊使用者
- [ ] 可以登入管理面板
- [ ] 資料儲存到資料庫

#### 2.5 清理
```bash
# 停止服務
docker-compose down

# 完全清理（包括資料）
docker-compose down -v
```

---

## 🔍 關鍵驗證點

### 驗證 1：Vercel 不會受影響

**測試方法**：模擬 Vercel 只部署前端檔案
```bash
# 建立臨時目錄，只複製前端檔案
mkdir /tmp/vercel-test
cp index.html /tmp/vercel-test/
cp -r js css public views /tmp/vercel-test/
cd /tmp/vercel-test

# 啟動測試
python -m http.server 8001
# 訪問 http://localhost:8001

# 應該完全正常工作
```

### 驗證 2：admin/ 目錄是否需要

**檢查**：
```bash
# admin/ 是否在 .vercelignore 中？
grep admin .vercelignore
```

**結果**：`admin/` 沒有被忽略，會部署到 Vercel

**確認**：這是對的，因為管理面板的 HTML 也可以在前端模式下檢視（只是沒有後端 API）

### 驗證 3：儲存介面卡是否正確引入

```bash
# 檢查 index.html
grep storage-adapter.js index.html
```

**預期輸出**：
```html
<script src="js/storage/storage-adapter.js"></script>
```

**測試**：
1. 開啟瀏覽器主控台
2. 檢查 `window.storageAdapter` 是否存在
3. 檢查 `window.DEPLOYMENT_MODE` 的值

---

## 🎯 快速測試腳本

### 一鍵測試腳本

```bash
#!/bin/bash

echo "=================================="
echo "   Paper Burner X 本地測試"
echo "=================================="
echo ""

# 測試 1: 前端模式
echo "測試 1: 前端模式（模擬 Vercel）"
echo "啟動 HTTP 伺服器..."
python -m http.server 8000 &
SERVER_PID=$!
sleep 2

echo "→ 測試頁面訪問"
if curl -s http://localhost:8000 > /dev/null; then
    echo "✅ 前端伺服器啟動成功"
else
    echo "❌ 前端伺服器啟動失敗"
fi

echo "→ 開啟瀏覽器手動測試"
echo "   訪問: http://localhost:8000"
read -p "前端測試完成後按換行繼續..."

kill $SERVER_PID
echo ""

# 測試 2: Docker 模式
echo "測試 2: Docker 模式"
echo "→ 檢查 Docker 環境"
if command -v docker &> /dev/null; then
    echo "✅ Docker 已安裝"
else
    echo "❌ Docker 未安裝，跳過 Docker 測試"
    exit 0
fi

echo "→ 檢查 .env 配置"
if [ ! -f ".env" ]; then
    echo "⚠️  .env 不存在，建立預設配置"
    cp .env.example .env
fi

read -p "是否啟動 Docker 測試？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "→ 啟動 Docker 服務"
    docker-compose up -d

    echo "→ 等待服務啟動..."
    sleep 10

    echo "→ 測試 API"
    if curl -s http://localhost:3000/api/health > /dev/null; then
        echo "✅ Docker 服務啟動成功"
        echo "   訪問: http://localhost:3000"
        echo "   管理: http://localhost:3000/admin"
    else
        echo "❌ Docker 服務啟動失敗"
        docker-compose logs app
    fi

    read -p "Docker 測試完成後按換行清理..."
    docker-compose down
fi

echo ""
echo "=================================="
echo "   測試完成！"
echo "=================================="
```

---

## ✅ 測試透過標準

### 前端模式（Vercel）
- [ ] 頁面正常載入
- [ ] 功能完全正常
- [ ] 無 JavaScript 錯誤
- [ ] localStorage 工作正常

### Docker 模式
- [ ] 所有容器執行正常
- [ ] API 響應正常
- [ ] 可以註冊/登入
- [ ] 資料持久化工作

### 無衝突驗證
- [ ] 前端程式碼未被破壞
- [ ] 舊功能全部正常
- [ ] 沒有引入 breaking changes

---

## 🚀 測試透過後

如果所有測試都透過，你可以安全地：

```bash
git add .
git commit -m "feat: add Docker support with full backend"
git push origin main
```

**推送後監控**：
1. 立即檢查 Vercel 部署狀態
2. 訪問部署後的 URL
3. 測試主要功能
4. 如有問題立即 revert

---

## 🆘 如果測試失敗

### 前端測試失敗
```bash
# 檢查是否有檔案缺失
git status

# 恢復特定檔案
git restore <file>

# 檢視具體錯誤
瀏覽器主控台
```

### Docker 測試失敗
```bash
# 檢視日誌
docker-compose logs -f app

# 檢查資料庫
docker-compose logs postgres

# 重新構建
docker-compose down -v
docker-compose up --build
```

---

## 📞 現在做什麼？

選擇一個：

**A) 執行快速前端測試（5 分鐘）**
```bash
python -m http.server 8000
# 手動測試功能
```

**B) 執行完整測試（包括 Docker，15 分鐘）**
```bash
# 我幫你建立測試腳本
```

**C) 我相信配置沒問題，直接推送**
```bash
git add .
git commit -m "feat: add Docker support"
git push origin main
```

你選哪個？
