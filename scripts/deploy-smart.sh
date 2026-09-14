#!/bin/bash

# 智慧部署腳本 - 自動檢測部署模式

echo "======================================"
echo "   Paper Burner X - 智慧部署"
echo "======================================"
echo ""

# 檢測部署模式
if [ -d "server" ] && [ -f "docker-compose.yml" ]; then
    echo "✓ 檢測到後端程式碼，使用 Docker 完整模式"
    DEPLOY_MODE="docker"
else
    echo "✓ 檢測到純前端程式碼，使用 Vercel 模式"
    DEPLOY_MODE="frontend"
fi

echo ""

# 根據模式部署
case $DEPLOY_MODE in
    docker)
        echo "🐳 啟動 Docker 部署..."

        # 檢查 .env
        if [ ! -f ".env" ]; then
            echo "→ 建立 .env 檔案"
            cp .env.example .env
            echo "⚠️  請配置 .env 檔案後重新執行"
            exit 1
        fi

        # 安裝依賴
        echo "→ 安裝後端依賴..."
        cd server && npm install && npx prisma generate && cd ..

        # 啟動服務
        echo "→ 啟動 Docker 服務..."
        docker-compose up -d

        echo ""
        echo "✅ Docker 部署完成！"
        echo "   訪問: http://localhost:3000"
        echo "   管理: http://localhost:3000/admin"
        ;;

    frontend)
        echo "🌐 前端部署指南..."
        echo ""
        echo "方式 1: Vercel 部署"
        echo "  1. 訪問 https://vercel.com"
        echo "  2. 匯入此 GitHub 倉庫"
        echo "  3. 點選部署"
        echo ""
        echo "方式 2: 本地預覽"
        echo "  python -m http.server 8000"
        echo "  訪問 http://localhost:8000"
        ;;
esac

echo ""
