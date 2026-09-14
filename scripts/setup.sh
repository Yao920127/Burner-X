#!/bin/bash

# Paper Burner X - 部署前檢查和修復腳本

echo "======================================"
echo "Paper Burner X - 部署前檢查"
echo "======================================"
echo ""

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 檢查函式
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 已安裝"
        return 0
    else
        echo -e "${RED}✗${NC} $1 未安裝"
        return 1
    fi
}

# 1. 檢查必要的命令
echo "1. 檢查系統依賴..."
check_command docker || DOCKER_MISSING=1
check_command docker-compose || DOCKER_COMPOSE_MISSING=1
check_command node || NODE_MISSING=1
check_command npm || NPM_MISSING=1
echo ""

# 2. 檢查環境變數檔案
echo "2. 檢查配置檔案..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env 檔案存在"
else
    echo -e "${YELLOW}!${NC} .env 檔案不存在，從模板複製..."
    cp .env.example .env
    echo -e "${YELLOW}⚠${NC} 請編輯 .env 檔案並配置必要的環境變數！"
    echo "   必須修改："
    echo "   - DB_PASSWORD"
    echo "   - JWT_SECRET"
    echo "   - ADMIN_EMAIL"
    echo "   - ADMIN_PASSWORD"
fi
echo ""

# 3. 安裝後端依賴
echo "3. 安裝後端依賴..."
if [ -d "server/node_modules" ]; then
    echo -e "${GREEN}✓${NC} 後端依賴已安裝"
else
    echo -e "${YELLOW}→${NC} 正在安裝後端依賴..."
    cd server
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} 後端依賴安裝成功"
    else
        echo -e "${RED}✗${NC} 後端依賴安裝失敗"
        exit 1
    fi
    cd ..
fi
echo ""

# 4. 生成 Prisma Client
echo "4. 生成 Prisma Client..."
cd server
npx prisma generate
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Prisma Client 生成成功"
else
    echo -e "${RED}✗${NC} Prisma Client 生成失敗"
    exit 1
fi
cd ..
echo ""

# 5. 檢查前端檔案
echo "5. 檢查前端檔案..."
if [ -f "index.html" ]; then
    echo -e "${GREEN}✓${NC} index.html 存在"
else
    echo -e "${RED}✗${NC} index.html 不存在"
    exit 1
fi

if [ -f "js/storage/storage-adapter.js" ]; then
    echo -e "${GREEN}✓${NC} storage-adapter.js 存在"
else
    echo -e "${RED}✗${NC} storage-adapter.js 不存在"
    exit 1
fi
echo ""

# 6. 提供部署選項
echo "======================================"
echo "部署選項："
echo "======================================"
echo ""
echo "選擇部署模式："
echo "  1) Vercel 前端部署（純靜態）"
echo "  2) Docker 後端部署（完整功能）"
echo "  3) 本地開發模式"
echo ""
read -p "請選擇 (1-3): " choice

case $choice in
    1)
        echo ""
        echo "Vercel 前端部署步驟："
        echo "1. 訪問 https://vercel.com"
        echo "2. 匯入此 GitHub 倉庫"
        echo "3. 保持預設配置點選部署"
        echo "4. 完成！"
        echo ""
        echo "注意：Vercel 模式下資料儲存在瀏覽器本地"
        ;;
    2)
        echo ""
        echo "正在啟動 Docker 服務..."

        # 檢查 .env 是否配置
        if grep -q "changeme" .env; then
            echo -e "${RED}⚠${NC} 警告：.env 檔案包含預設值！"
            echo "   請編輯 .env 檔案後再啟動服務"
            exit 1
        fi

        # 啟動 Docker
        docker-compose up -d

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓${NC} Docker 服務啟動成功！"
            echo ""
            echo "訪問地址："
            echo "  主應用: http://localhost:3000"
            echo "  管理面板: http://localhost:3000/admin"
            echo ""
            echo "檢視日誌: docker-compose logs -f app"
        else
            echo -e "${RED}✗${NC} Docker 服務啟動失敗"
            exit 1
        fi
        ;;
    3)
        echo ""
        echo "啟動本地開發伺服器..."
        cd server
        npm run dev &
        SERVER_PID=$!
        echo ""
        echo -e "${GREEN}✓${NC} 開發伺服器已啟動"
        echo "  後端 API: http://localhost:3000/api"
        echo "  前端: 直接開啟 index.html"
        echo ""
        echo "按 Ctrl+C 停止伺服器"
        wait $SERVER_PID
        ;;
    *)
        echo "無效選擇"
        exit 1
        ;;
esac
