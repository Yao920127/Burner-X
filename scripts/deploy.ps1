# Paper Burner X - Windows 一鍵部署腳本
# PowerShell

Write-Host ""
Write-Host "======================================" -ForegroundColor Blue
Write-Host "   Paper Burner X - 一鍵部署腳本" -ForegroundColor Blue
Write-Host "======================================" -ForegroundColor Blue
Write-Host ""

# 1. 檢查 .env 檔案
Write-Host "[1/6] 檢查配置檔案..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "→ 建立 .env 檔案" -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "⚠️  請編輯 .env 檔案並配置以下必要項：" -ForegroundColor Red
    Write-Host "   - DB_PASSWORD"
    Write-Host "   - JWT_SECRET"
    Write-Host "   - ADMIN_EMAIL"
    Write-Host "   - ADMIN_PASSWORD"
    Write-Host ""
    Read-Host "配置完成後按換行繼續"
}
Write-Host "✓ 配置檔案檢查完成" -ForegroundColor Green
Write-Host ""

# 2. 安裝後端依賴
Write-Host "[2/6] 安裝後端依賴..." -ForegroundColor Yellow
Set-Location server
if (-not (Test-Path "node_modules")) {
    npm install
    Write-Host "✓ 依賴安裝完成" -ForegroundColor Green
} else {
    Write-Host "✓ 依賴已存在" -ForegroundColor Green
}
Set-Location ..
Write-Host ""

# 3. 生成 Prisma Client
Write-Host "[3/6] 生成 Prisma Client..." -ForegroundColor Yellow
Set-Location server
npx prisma generate
Write-Host "✓ Prisma Client 生成完成" -ForegroundColor Green
Set-Location ..
Write-Host ""

# 4. 啟動 Docker 服務
Write-Host "[4/6] 啟動 Docker 服務..." -ForegroundColor Yellow
docker-compose up -d postgres
Write-Host "→ 等待資料庫啟動..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "✓ 資料庫已啟動" -ForegroundColor Green
Write-Host ""

# 5. 執行資料庫遷移
Write-Host "[5/6] 初始化資料庫..." -ForegroundColor Yellow
Set-Location server
npx prisma migrate deploy
Write-Host "✓ 資料庫初始化完成" -ForegroundColor Green
Set-Location ..
Write-Host ""

# 6. 啟動應用
Write-Host "[6/6] 啟動應用服務..." -ForegroundColor Yellow
docker-compose up -d app
Write-Host "✓ 應用已啟動" -ForegroundColor Green
Write-Host ""

# 等待應用啟動
Write-Host "→ 等待應用啟動..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 檢查健康狀態
Write-Host "→ 檢查服務健康狀態..." -ForegroundColor Yellow
$healthy = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ 服務健康檢查透過" -ForegroundColor Green
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $healthy) {
    Write-Host "✗ 服務啟動失敗，請檢查日誌：" -ForegroundColor Red
    Write-Host "   docker-compose logs -f app"
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "   🎉 部署成功！" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "訪問地址：" -ForegroundColor Blue
Write-Host "  主應用:    http://localhost:3000" -ForegroundColor Green
Write-Host "  管理面板:  http://localhost:3000/admin" -ForegroundColor Green
Write-Host "  API健康:   http://localhost:3000/api/health" -ForegroundColor Green
Write-Host ""

$adminEmail = (Get-Content .env | Select-String "ADMIN_EMAIL=" | ForEach-Object { $_ -replace "ADMIN_EMAIL=", "" })
$adminPassword = (Get-Content .env | Select-String "ADMIN_PASSWORD=" | ForEach-Object { $_ -replace "ADMIN_PASSWORD=", "" })

Write-Host "管理員賬戶：" -ForegroundColor Blue
Write-Host "  郵箱: $adminEmail"
Write-Host "  密碼: $adminPassword"
Write-Host ""
Write-Host "常用命令：" -ForegroundColor Blue
Write-Host "  檢視日誌:   docker-compose logs -f app"
Write-Host "  停止服務:   docker-compose down"
Write-Host "  重啟服務:   docker-compose restart"
Write-Host ""
Write-Host "⚠️  首次登入後請立即修改管理員密碼！" -ForegroundColor Yellow
Write-Host ""
