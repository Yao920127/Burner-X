# 同步助手 (Sync Assistant) 設計文件

## 1. 總體目標

同步助手旨在為 Paper Burner 應用提供一個可選的本地後端服務，其核心目的是：

-   **資料持久化與備份**：將瀏覽器端（localStorage, IndexedDB）儲存的關鍵資料以及應用處理產生的核心內容（如分塊文字、OCR結果、Agent處理結果等）同步到使用者本地的資料庫中。
-   **防止資料丟失**：瀏覽器儲存有被使用者意外清除或因瀏覽器策略限制而丟失的風險，本地同步提供了一層額外保障。
-   **資料可訪問性與遷移**：本地儲存的資料理論上可以被使用者直接訪問或用於遷移到其他裝置/環境（配合未來的匯入匯出功能）。
-   **增強應用能力**：為未來可能需要本地計算資源或訪問本地檔案系統的功能（如本地OCR、本地模型執行）打下基礎。

此同步助手為可選元件，如果使用者未執行或未配置，Paper Burner 應用仍能獨立執行，但資料將僅儲存於瀏覽器。

## 2. 架構設計

同步助手採用客戶端-伺服器 (C/S) 架構，其中 Paper Burner 前端作為客戶端，本地執行的 Python 程式作為伺服器。

### 2.1. 前端 (Paper Burner - 瀏覽器端)

-   **助手檢測**:
    -   應用啟動時，嘗試透過預定義的本地埠（例如 `http://localhost:12345` 或 `ws://localhost:12345`）與本地同步助手建立連線。
    -   定期或在特定操作（如儲存重要資料）前進行連線狀態檢查。
    -   UI 介面應有明確的指示，告知使用者同步助手的連線狀態（例如：已連線、未連線、連線中、連線失敗）。
-   **連線方式**:
    -   優先考慮 **WebSocket**：實現長連線，方便雙向通訊和實時狀態更新。
    -   備選 **HTTP(S) 長輪詢/SSE**：如果 WebSocket 實現複雜或受限，可考慮。
-   **資料傳送邏輯**:
    -   **觸發時機**:
        -   定期批次同步（例如每隔幾分鐘）。
        -   在關鍵資料發生變化後立即/延遲同步（例如：儲存新的處理結果、API Key變更、新增醒目提示標註）。
        -   使用者手動觸發"立即同步"操作。
    -   **資料封裝**: 將需要同步的資料（如 `localStorage` 的特定條目、`IndexedDB` 的記錄、Orama索引的序列化資料）封裝成定義好的JSON格式。
    -   **差異同步 (可選，高階)**: 初期可以採用全量覆蓋或基於時間戳的增量同步，未來可考慮更復雜的差異比對同步以減少資料傳輸量。
-   **API 呼叫**: 前端將透過 WebSocket 訊息或 HTTP 請求呼叫後端定義的 API 介面來傳送資料。

### 2.2. 後端 (同步助手 - Python 程式)

-   **伺服器實現**:
    -   使用 Python Web 框架，如 **FastAPI** (推薦，效能高，非同步支援好，資料校驗方便) 或 Flask。
    -   **WebSocket 服務**: 如果選擇 WebSocket，需要實現 WebSocket 伺服器邏輯。
    -   **HTTP API 端點**: 定義 RESTful API 端點來接收和處理來自前端的同步請求。
-   **監聽埠**: 監聽一個本地埠 (例如 `12345`)，確保該埠不易與其他常用應用衝突。
-   **資料接收與處理**:
    -   接收前端傳送的 JSON 資料。
    -   根據資料型別（例如 `localStorage_item`, `indexeddb_record_results`, `orama_index` 等）呼叫相應的處理模組。
    -   將資料存入本地資料庫。
-   **資料儲存邏輯**:
    -   見"5. 本地資料庫選擇"。
    -   需要處理資料的插入、更新。刪除操作可以標記刪除或真實刪除。
-   **並行與佇列 (可選)**: 對於大量資料的寫入，可以考慮使用任務佇列（如 Celery，或 Python 內建的 `asyncio.Queue`）來非同步處理，避免阻塞主服務執行緒。

## 3. 同步的資料範圍

同步助手旨在覆蓋應用中的核心持久化資料和使用者生成內容：

### 3.1. 瀏覽器儲存 (`localStorage`)

由 `js/storage/storage.js` 管理的 `localStorage` 條目：

-   **使用者設定**: `userSettings` (包含預設處理選項、UI偏好等)
-   **已處理檔案記錄**: `processedFilesRecord`
-   **API Key 及模型配置**: `modelKeys` (包含各模型/源站的API Key列表、狀態、備註等)
-   **自定義源站配置**: `paperBurnerCustomSourceSites` (使用者新增的自定義API源站點及其配置)
-   **最近成功使用的Key記錄**: `paperBurnerLastSuccessfulKeys`
-   **(其他)** 任何未來新增的、需要持久化的全域配置。

*同步策略：通常可以採用覆蓋式更新。*

### 3.2. 瀏覽器資料庫 (`IndexedDB`)

由 `js/storage/storage.js` 管理的 `ResultDB` 資料庫：

-   **`results` 物件儲存區**:
    -   包含PDF處理結果的完整記錄 (後設資料、提取的文字、翻譯、摘要、分塊內容、OCR識別結果等)。
    -   每個檔案處理結果對應一條記錄。
-   **`annotations` 物件儲存區**:
    -   使用者對文件進行的醒目提示和批註資訊。
    -   每條標註對應一條記錄，關聯到特定的文件ID。
-   **Orama 索引資料**:
    -   如果 `RetrievalAgent` 使用 Orama 並透過 `@orama/plugin-data-persistence` 將索引持久化（例如序列化為 JSON 或其他格式儲存在 `localStorage` 或 `IndexedDB` 的特定鍵下），這部分序列化後的索引資料也需要同步。

*同步策略：可以基於記錄ID進行增量同步（新增、更新）。刪除操作需要前端通知後端。*

### 3.3. Agent 處理的中間/最終產物

-   **`LongTextAgent` 的"精簡內容樹"**: 如果此樹結構被快取（例如在 IndexedDB 或 localStorage），則需要同步。
-   其他由 Agents 生成的、有價值且需要跨會話保留的結構化資料。

### 3.4. 未來可能的 MCP (Model Context Protocol) 配置

-   使用者配置的 MCP 伺服器地址、認證資訊、可用工具列表等。

## 4. 通訊協議與資料格式

-   **主要通訊協議**: WebSocket。
-   **備選/輔助通訊協議**: HTTP/HTTPS (用於簡單的狀態檢測或一次性資料傳輸)。
-   **資料交換格式**: **JSON**。
-   **訊息結構 (WebSocket 示例)**:
    ```json
    {
      "type": "sync_data", // 訊息型別: sync_data, status_request, ack, error
      "payload": {
        "dataType": "localStorage_item", // 例如: localStorage_item, indexeddb_results_record, indexeddb_annotations_record, orama_index_chunk
        "key": "userSettings", // dataType 為 localStorage_item 時使用
        "data": { ... } // 實際資料物件或序列化的索引塊
      },
      "timestamp": "2023-10-27T10:30:00Z",
      "messageId": "unique_message_id" // 用於追蹤和確認 (ack)
    }
    ```
-   **HTTP API 端點 (示例)**:
    -   `POST /sync/localStorage`: 同步 localStorage 條目。
    -   `POST /sync/indexeddb/results`: 同步 IndexedDB results 表的單條/多條記錄。
    -   `POST /sync/orama_index`: 同步 Orama 索引。
    -   `GET /status`: 獲取同步助手狀態。

## 5. 本地資料庫選擇 (Python 後端)

-   **首選**: **SQLite**
    -   **優點**: 輕量級、單檔案資料庫、無需單獨的服務程式、Python 內建支援 (`sqlite3` 模組)、易於部署和備份。對於單使用者桌面應用場景非常合適。
    -   **缺點**: 高並行寫入效能一般（但對於單使用者同步場景通常足夠）。
-   **備選**:
    -   **TinyDB**: 如果資料結構非常簡單且不需複雜查詢，是一個更輕量級的純 Python JSON 文件資料庫。
    -   **PostgreSQL/MySQL**: 如果未來有更復雜的資料關係、查詢需求或多使用者可能（雖然目前不像），可以考慮，但會增加部署複雜性。
-   **表結構設計 (SQLite 示例)**:
    -   `local_storage_data`:
        -   `key` (TEXT, PRIMARY KEY)
        -   `value` (TEXT) -- 儲存 JSON 字串
        -   `last_synced_timestamp` (DATETIME)
    -   `indexeddb_results`:
        -   `id` (TEXT, PRIMARY KEY) -- 對應 IndexedDB 中的 `id`
        -   `doc_hash` (TEXT) -- 檔案內容的雜湊，用於關聯
        -   `metadata_json` (TEXT)
        -   `content_text` (TEXT)
        -   `translation_json` (TEXT)
        -   `summary_json` (TEXT)
        -   `chunks_json` (TEXT)
        -   `ocr_results_json` (TEXT)
        -   `created_at` (DATETIME)
        -   `updated_at` (DATETIME)
        -   `last_synced_timestamp` (DATETIME)
    -   `indexeddb_annotations`:
        -   `id` (TEXT, PRIMARY KEY)
        -   `doc_id` (TEXT, FOREIGN KEY references indexeddb_results(id)) -- 用於關聯到具體文件
        -   `annotation_data_json` (TEXT) -- 儲存醒目提示位置、評論等
        -   `created_at` (DATETIME)
        -   `updated_at` (DATETIME)
        -   `last_synced_timestamp` (DATETIME)
    -   `orama_indices`: (如果Orama索引可被拆分或版本化儲存)
        -   `index_name` (TEXT, PRIMARY KEY) -- 例如 'main_document_index'
        -   `serialized_index_chunk` (BLOB/TEXT) -- 儲存序列化後的Orama索引資料塊
        -   `version` (INTEGER)
        -   `last_synced_timestamp` (DATETIME)
    -   `raw_content_store`: (可選，用於儲存原始檔案或大型文字塊)
        -   `content_hash` (TEXT, PRIMARY KEY)
        -   `content_blob` (BLOB)
        -   `content_type` (TEXT) -- 例如 'pdf_chunk', 'ocr_page_text'
        -   `last_synced_timestamp` (DATETIME)

## 6. 錯誤處理與使用者提示

-   **前端**:
    -   明確提示同步助手未連線、連線失敗、同步中、同步成功、同步失敗等狀態。
    -   對於同步失敗的條目，應有重試機制或將其標記並在下次同步時嘗試。
    -   提供使用者手動觸發同步的選項。
-   **後端**:
    -   記錄詳細的錯誤日誌。
    -   對接收到的資料進行基本校驗，對非法資料返回錯誤響應。
    -   資料庫寫入失敗時，應有錯誤處理和日誌記錄。

## 7. 安全性考慮

-   **本地埠訪問**: 預設情況下，Python Web 服務 (如 FastAPI/Flask) 啟動時會綁定到 `127.0.0.1` (localhost)，這意味著只接受來自本機的連線。這是基礎的安全保障。
-   **跨域資源共享 (CORS)**: 如果使用 HTTP API，後端需要配置 CORS 策略，僅允許來自 Paper Burner 前端源的請求（如果前端透過 `file://` 或特定開發伺服器執行，需要相應配置）。WebSocket 通常不受標準CORS策略的嚴格限制，但仍需注意來源驗證。
-   **資料校驗**: 對前端傳入的資料進行嚴格的格式和型別校驗，防止潛在的注入或資料損壞。FastAPI 的 Pydantic 模型在這方面非常有用。
-   **無敏感操作**: 同步助手主要負責資料儲存，不應執行任何破壞性的本地系統操作。
-   **使用者確認 (可選)**: 首次連線或進行重大資料同步操作時，可考慮在前端向使用者請求確認。

## 8. 未來展望

-   **雙向同步**: 實現從本地資料庫恢復資料到新的瀏覽器環境或覆蓋當前瀏覽器資料的功能。
-   **選擇性同步**: 允許使用者選擇哪些型別的資料需要同步。
-   **雲同步整合**: 允許使用者將本地同步助手資料庫進一步備份/同步到他們選擇的雲端儲存服務 (如 Google Drive, Dropbox, S3，透過rclone等工具或API)。
-   **版本歷史 (高階)**: 對某些關鍵資料（如處理結果的文字內容）提供版本歷史記錄和回滾能力。
-   **加密 (高階)**: 對本地儲存的敏感資料提供可選的加密層。
-   **作為本地 MCP Server 的一部分**: 同步助手可以與本地MCP Server整合，統一管理本地AI能力和資料。

這個設計文件為構建一個強大的本地同步助手奠定了基礎。