# Paper Burner X - API 參考文件

## 認證

所有需要認證的端點都需要在請求頭中包含 JWT Token：

```
Authorization: Bearer <token>
```

## 使用者相關 API

### 使用者設定

#### 獲取使用者設定
```
GET /api/user/settings
```

#### 更新使用者設定
```
PUT /api/user/settings
Content-Type: application/json

{
  "ocrProvider": "mineru",
  "translationModel": "deepseek",
  "targetLanguage": "chinese",
  ...
}
```

---

### API Keys 管理

#### 獲取 API Keys 列表
```
GET /api/user/api-keys

Response:
[
  {
    "id": "uuid",
    "provider": "deepseek",
    "remark": "主要金鑰",
    "status": "VALID",
    "order": 0,
    "lastUsedAt": "2025-01-17T...",
    "createdAt": "2025-01-01T..."
  }
]
```

#### 新增 API Key
```
POST /api/user/api-keys
Content-Type: application/json

{
  "provider": "deepseek",
  "keyValue": "sk-...",
  "remark": "備用金鑰",
  "order": 1
}

Response:
{
  "id": "uuid",
  "provider": "deepseek",
  "remark": "備用金鑰",
  "status": "UNTESTED",
  "order": 1
}
```

#### 更新 API Key 狀態
```
PATCH /api/user/api-keys/:id/status
Content-Type: application/json

{
  "status": "VALID"
}
```

#### 刪除 API Key
```
DELETE /api/user/api-keys/:id
```

---

### 術語庫管理

#### 獲取術語庫列表
```
GET /api/user/glossaries
```

#### 建立術語庫
```
POST /api/user/glossaries
Content-Type: application/json

{
  "name": "醫學術語",
  "enabled": true,
  "entries": [
    {"source": "protein", "target": "蛋白質"},
    {"source": "cell", "target": "細胞"}
  ]
}
```

#### 更新術語庫
```
PUT /api/user/glossaries/:id
```

#### 刪除術語庫
```
DELETE /api/user/glossaries/:id
```

---

### 已處理檔案記錄

#### 獲取已處理檔案列表
```
GET /api/user/processed-files

Response:
[
  {
    "fileIdentifier": "paper.pdf_1024000_1705478400000",
    "fileName": "paper.pdf",
    "processedAt": "2025-01-17T..."
  }
]
```

#### 標記檔案為已處理
```
POST /api/user/processed-files
Content-Type: application/json

{
  "fileIdentifier": "paper.pdf_1024000_1705478400000",
  "fileName": "paper.pdf"
}
```

#### 檢查單個檔案是否已處理
```
GET /api/user/processed-files/check/:identifier

Response:
{
  "processed": true
}
```

#### 批次檢查檔案是否已處理
```
POST /api/user/processed-files/check-batch
Content-Type: application/json

{
  "identifiers": [
    "file1_id",
    "file2_id",
    "file3_id"
  ]
}

Response:
{
  "file1_id": true,
  "file2_id": false,
  "file3_id": true
}
```

#### 清空已處理檔案記錄
```
DELETE /api/user/processed-files
```

---

## 文件管理 API

### 文件 CRUD

#### 獲取文件列表
```
GET /api/documents?page=1&limit=20&status=COMPLETED

Response:
{
  "documents": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

#### 獲取文件詳情
```
GET /api/documents/:id

Response:
{
  "id": "uuid",
  "fileName": "paper.pdf",
  "fileType": "pdf",
  "status": "COMPLETED",
  "ocrText": "...",
  "translatedText": "...",
  "annotations": [...],
  "semanticGroups": {...}
}
```

#### 建立文件記錄
```
POST /api/documents
Content-Type: application/json

{
  "fileName": "paper.pdf",
  "fileSize": 1024000,
  "fileType": "pdf",
  "status": "PENDING"
}

Response:
{
  "id": "uuid",
  ...
}

Error (配額超出):
{
  "error": "Monthly document quota exceeded (100 documents)"
}
```

#### 更新文件
```
PUT /api/documents/:id
Content-Type: application/json

{
  "status": "OCR_COMPLETED",
  "ocrText": "...",
  "ocrProvider": "mineru"
}
```

#### 刪除文件
```
DELETE /api/documents/:id
```

---

### 標註管理

#### 獲取文件的所有標註
```
GET /api/documents/:id/annotations

Response:
[
  {
    "id": "uuid",
    "type": "highlight",
    "color": "#ffff00",
    "startIndex": 100,
    "endIndex": 200,
    "text": "醒目提示文字",
    "note": "我的筆記"
  }
]
```

#### 建立標註
```
POST /api/documents/:id/annotations
Content-Type: application/json

{
  "type": "highlight",
  "color": "#ffff00",
  "startIndex": 100,
  "endIndex": 200,
  "text": "醒目提示文字",
  "note": "我的筆記"
}
```

#### 更新標註
```
PUT /api/documents/:documentId/annotations/:annotationId
Content-Type: application/json

{
  "note": "更新後的筆記"
}
```

#### 刪除標註
```
DELETE /api/documents/:documentId/annotations/:annotationId
```

---

### 意群資料

#### 儲存/更新意群資料
```
POST /api/documents/:id/semantic-groups
Content-Type: application/json

{
  "groups": [
    {
      "id": 1,
      "text": "語義組1",
      "translation": "翻譯1"
    },
    {
      "id": 2,
      "text": "語義組2",
      "translation": "翻譯2"
    }
  ],
  "version": "1.0",
  "source": "auto"
}
```

#### 獲取意群資料
```
GET /api/documents/:id/semantic-groups

Response:
{
  "id": "uuid",
  "documentId": "doc-uuid",
  "groups": [...],
  "version": "1.0",
  "source": "auto",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## 管理員 API

所有管理員 API 都需要 ADMIN 角色。

### 使用者管理

#### 獲取所有使用者
```
GET /api/admin/users

Response:
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "USER",
    "isActive": true,
    "createdAt": "..."
  }
]
```

#### 更新使用者狀態
```
PUT /api/admin/users/:id/status
Content-Type: application/json

{
  "isActive": false
}
```

---

### 統計資訊

#### 獲取基礎統計
```
GET /api/admin/stats

Response:
{
  "totalUsers": 150,
  "activeUsers": 120,
  "totalDocuments": 5432,
  "documentsToday": 45
}
```

#### 獲取詳細統計
```
GET /api/admin/stats/detailed

Response:
{
  "basic": {
    "totalUsers": 150,
    "activeUsers": 120,
    "totalDocuments": 5432,
    "totalStorageMB": 2048,
    "documentsToday": 45,
    "documentsThisWeek": 234,
    "documentsThisMonth": 987
  },
  "documentsByStatus": [
    {"status": "COMPLETED", "count": 4500},
    {"status": "FAILED", "count": 100}
  ],
  "topUsers": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "documentCount": 234
    }
  ]
}
```

#### 獲取使用趨勢
```
GET /api/admin/stats/trends?days=30

Response:
[
  {
    "date": "2025-01-01",
    "total": 150,
    "completed": 140,
    "failed": 10
  },
  {
    "date": "2025-01-02",
    "total": 180,
    "completed": 170,
    "failed": 10
  }
]
```

---

### 使用者配額管理

#### 獲取使用者配額
```
GET /api/admin/users/:userId/quota

Response:
{
  "id": "uuid",
  "userId": "user-uuid",
  "maxDocumentsPerDay": -1,
  "maxDocumentsPerMonth": 100,
  "maxStorageSize": 1024,
  "maxApiKeysCount": -1,
  "documentsThisMonth": 45,
  "currentStorageUsed": 256,
  "lastMonthlyReset": "2025-01-01T..."
}
```

#### 更新使用者配額
```
PUT /api/admin/users/:userId/quota
Content-Type: application/json

{
  "maxDocumentsPerMonth": 200,
  "maxStorageSize": 2048
}
```

---

### 使用者活動日誌

#### 獲取使用者活動
```
GET /api/admin/users/:userId/activity?limit=50&offset=0

Response:
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "action": "document_create",
    "resourceId": "doc-uuid",
    "metadata": {
      "fileName": "paper.pdf",
      "fileType": "pdf"
    },
    "createdAt": "2025-01-17T..."
  }
]
```

---

### 系統配置

#### 獲取系統配置
```
GET /api/admin/config

Response:
{
  "allowRegistration": "true",
  "maxUploadSize": "100"
}
```

#### 更新系統配置
```
PUT /api/admin/config
Content-Type: application/json

{
  "key": "allowRegistration",
  "value": "false",
  "description": "是否允許使用者註冊"
}
```

---

### 自定義源站管理

#### 獲取全域源站列表
```
GET /api/admin/source-sites

Response:
[
  {
    "id": "uuid",
    "displayName": "自定義模型",
    "apiBaseUrl": "https://api.example.com",
    "modelId": "model-name",
    "availableModels": ["model-1", "model-2"],
    "requestFormat": "openai"
  }
]
```

#### 建立全域源站
```
POST /api/admin/source-sites
Content-Type: application/json

{
  "displayName": "自定義模型",
  "apiBaseUrl": "https://api.example.com",
  "modelId": "model-name",
  "availableModels": ["model-1"],
  "requestFormat": "openai"
}
```

#### 更新源站
```
PUT /api/admin/source-sites/:id
```

#### 刪除源站
```
DELETE /api/admin/source-sites/:id
```

---

## 認證 API

### 註冊
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "User Name"
}

Response:
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "USER"
  }
}
```

### 登入
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "USER"
  }
}
```

### 獲取當前使用者
```
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "USER",
    "createdAt": "..."
  }
}
```

---

## 健康檢查

```
GET /api/health

Response:
{
  "status": "ok",
  "timestamp": 1705478400000,
  "mode": "docker",
  "version": "1.0.0"
}
```

---

## 錯誤響應

所有錯誤響應遵循以下格式：

```json
{
  "error": "錯誤描述資訊"
}
```

常見 HTTP 狀態碼：
- `200` - 成功
- `201` - 建立成功
- `400` - 請求引數錯誤
- `401` - 未認證
- `403` - 許可權不足 / 配額超出
- `404` - 資源不存在
- `409` - 衝突（如郵箱已存在）
- `500` - 伺服器錯誤

---

## 分頁

支援分頁的端點使用以下引數：

```
?page=1&limit=20
```

響應格式：

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## 使用示例

### JavaScript / Fetch

```javascript
// 登入
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});
const { token } = await loginResponse.json();

// 獲取文件列表
const docsResponse = await fetch('/api/documents?page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { documents, pagination } = await docsResponse.json();

// 建立文件
const createResponse = await fetch('/api/documents', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileName: 'paper.pdf',
    fileSize: 1024000,
    fileType: 'pdf',
    status: 'PENDING'
  })
});
const newDoc = await createResponse.json();
```

### cURL

```bash
# 登入
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@paperburner.local","password":"admin123456"}' \
  | jq -r '.token')

# 獲取統計
curl http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer $TOKEN"

# 建立 API Key
curl -X POST http://localhost:3000/api/user/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"deepseek","keyValue":"sk-...","remark":"主金鑰"}'
```

---

**最後更新**: 2025-01-17
