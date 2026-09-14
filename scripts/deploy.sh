#!/bin/bash

# Paper Burner X - 一鍵部署腳本

set -e  # 遇到錯誤立即退出

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "======================================"
echo "   Paper Burner X - 一鍵部署腳本"
echo "======================================"
echo -e "${NC}"
echo ""

# 1. 檢查 .env 檔案
echo -e "${YELLOW}[1/6] 檢查配置檔案...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}→ 建立 .env 檔案${NC}"
    cp .env.example .env
    echo -e "${RED}⚠️  請編輯 .env 檔案並配置以下必要項：${NC}"
    echo "   - DB_PASSWORD"
    echo "   - JWT_SECRET"
    echo "   - ADMIN_EMAIL"
    echo "   - ADMIN_PASSWORD"
    echo ""
    read -p "配置完成後按換行繼續..."
fi
echo -e "${GREEN}✓ 配置檔案檢查完成${NC}"
echo ""

# 2. 安裝後端依賴
echo -e "${YELLOW}[2/6] 安裝後端依賴...${NC}"
cd server
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ 依賴安裝完成${NC}"
else
    echo -e "${GREEN}✓ 依賴已存在${NC}"
fi
cd ..
echo ""

# 3. 生成 Prisma Client
echo -e "${YELLOW}[3/6] 生成 Prisma Client...${NC}"
cd server
npx prisma generate
echo -e "${GREEN}✓ Prisma Client 生成完成${NC}"
cd ..
echo ""

# 4. 啟動 Docker 服務
echo -e "${YELLOW}[4/6] 啟動 Docker 服務...${NC}"
docker-compose up -d postgres
echo -e "${YELLOW}→ 等待資料庫啟動...${NC}"
sleep 5
echo -e "${GREEN}✓ 資料庫已啟動${NC}"
echo ""

# 5. 執行資料庫遷移
echo -e "${YELLOW}[5/6] 初始化資料庫...${NC}"
cd server
npx prisma migrate deploy
echo -e "${GREEN}✓ 資料庫初始化完成${NC}"
cd ..
echo ""

# 6. 啟動應用
echo -e "${YELLOW}[6/6] 啟動應用服務...${NC}"
docker-compose up -d app
echo -e "${GREEN}✓ 應用已啟動${NC}"
echo ""

# 等待應用啟動
echo -e "${YELLOW}→ 等待應用啟動...${NC}"
sleep 3

# 檢查健康狀態
echo -e "${YELLOW}→ 檢查服務健康狀態...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 服務健康檢查透過${NC}"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}✗ 服務啟動失敗，請檢查日誌：${NC}"
        echo "   docker-compose logs -f app"
        exit 1
    fi
    sleep 2
done

echo ""
echo -e "${GREEN}"
echo "======================================"
echo "   🎉 部署成功！"
echo "======================================"
echo -e "${NC}"
echo ""
echo -e "${BLUE}訪問地址：${NC}"
echo -e "  主應用:    ${GREEN}http://localhost:3000${NC}"
echo -e "  管理面板:  ${GREEN}http://localhost:3000/admin${NC}"
echo -e "  API健康:   ${GREEN}http://localhost:3000/api/health${NC}"
echo ""
echo -e "${BLUE}管理員賬戶：${NC}"
echo -e "  郵箱: $(grep ADMIN_EMAIL .env | cut -d '=' -f2)"
echo -e "  密碼: $(grep ADMIN_PASSWORD .env | cut -d '=' -f2)"
echo ""
echo -e "${BLUE}常用命令：${NC}"
echo "  檢視日誌:   docker-compose logs -f app"
echo "  停止服務:   docker-compose down"
echo "  重啟服務:   docker-compose restart"
echo ""
echo -e "${YELLOW}⚠️  首次登入後請立即修改管理員密碼！${NC}"
echo ""
