# Paper Burner X - AI文獻識別、翻譯、閱讀與智慧分析工具

這是一款開源的、在瀏覽器中即開即用的 AI 工作站，專為掃除海量的 PDF 文獻、複雜的公式和跨語言的障礙。

它為需要進行精細、長文字閱讀的研究人員和深度學習者設計，致力於將複雜的文件處理、翻譯和分析流程整合到單一、流暢的體驗中。

<div align="center">
  <img src="https://img.shields.io/badge/版本-2.0.0-blue.svg" alt="版本">
  <img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="許可證">
  <img src="https://img.shields.io/badge/JavaScript-yellow.svg" alt="JavaScript">
  <img src="https://img.shields.io/badge/Docker-building-2496ED.svg" alt="Docker">
</div>

<div align="center">
  <p><strong> 瀏覽器即開即用 | 極速並行翻譯 | 智慧文件分析 </strong></p>
  <p>
    <a href="https://paperburner.viwoplus.site/views/landing/landing-page.html">📱 落地頁</a> •
    <a href="#-快速開始">🚀 快速開始</a> •
    <a href="#-特性概覽">✨ 特性</a> •
    <a href="deploy/DEPLOYMENT_GUIDE.md">📖 部署文件</a>
  </p>
</div>

---
* 專案分前端版本和後端版本，目前後端版本構建中，請暫時不要拉取docker映象。

<img width="3000" height="1431" alt="paper burner x" src="https://github.com/user-attachments/assets/23c3a4ab-835d-4475-89ff-ae40acfec11e" />

## 🎯 專案簡介

**Paper Burner X** 是為研究生和研究人員設計的 AI 驅動文獻處理工具。支援 PDF/DOCX/PPTX/EPUB 等多種格式，能夠進行 OCR 識別、高質量翻譯、智慧分析，完美保留公式、圖表和格式。

目前實現了：

*   **前端 Agent 驅動的智慧檢索：** 我們在前端實現了一個 Agentic RAG 系統。透過賦予 AI 全域的文章結構 和一系列工具（如 `grep`, `vector search`, `fetch`等等），AI 能夠自主決策、多步推理，並在長文字中實現複雜的分析和資訊提取任務。
*   **高效能批次處理：** 支援多種文件格式（PDF/DOCX/EPUB 等）和程式碼庫的直接匯入。利用並行 OCR 和翻譯，並結合術語庫（支援數萬詞條快速比對），顯著提升了文獻處理效率。
*   **高可擴充性與本地化：** 目前所有資料均在瀏覽器本地，支援使用者接入自定義 AI 模型端點，並提供了配套的 [OCR Server](https://github.com/Feather-2/PBX-DS-OCR-server) 和 Docker 部署選項(開發中)，讓使用者未來可以實現完全離線的本地化使用。

希望這個工具能成為研究人員和知識工作者的得力助手，歡迎試用和提出寶貴意見！

> 該專案擴充了諸多閱讀/AI工具上的便利，但如果您需要一個輕量化的文件處理工具，也歡迎使用 [Paper Burner](https://github.com/baoyudu/paper-burner) ， [baoyu](https://github.com/baoyudu) 的原分支。


## 具體介紹

### 一體化的文件處理引擎

我們為工具打造了一個強大的“入口”，使其能夠輕鬆消化各種來源的知識。

*   **廣泛的格式支援：** 能夠處理 PDF、DOCX、PPTX、EPUB、Markdown 甚至程式碼註釋等多種格式，並支援匯出為 DOCX、MD 等常用格式。
*   **智慧匯入與處理：** 不僅支援本地檔案上傳，更可一鍵從 GitHub 倉庫或任意 URL 匯入內容，自動完成解析。PDF可以使用OCR (支援mineru/doc2x等) 與翻譯引擎，並實現**保留原文格式翻譯**功能（基於mineru，目前最佳化中，並會支援更多模型）。
*   **術語備擇庫：** 進行了效能最佳化，支援一次性匯入數萬條術語並進行快速比對。
*   支援自定義模型端點，可以支援檢測、多key、快捷匯出等機制，使用靈活。


### 為深度閱讀最佳化的互動體驗

*   **沉浸式對照閱讀：** 提供智慧對齊的段落級原譯文對照、文件結構目錄（TOC）、醒目提示與標註功能，先進行無障礙的閱讀，再進行AI總結。
*   **增強學術內容展示：** 針對學術場景，特別最佳化了複雜公式的渲染。
*   **結構化資訊提取：** 內建了“文獻矩陣”等實用工具，能夠將非結構化的論文內容，智慧提取為清晰的結構化資料，方便進行橫向對比和分析。

### 不止於問答：前端 Agent 驅動的智慧分析

- 我們在純前端環境中，實現了一個長文字Agent。少量文字下，將使用全量的策略；而當提供長文字時候，使用長文字Agent。
-  **賦予 AI 全域視野：** 我們為 AI 構建了“分層意群/地圖”，讓它在處理長文字時擁有對全文結構的整體認知。
*   **為 AI 配備工具箱：** 我們給予 AI 一系列工具，如精確比對的 `grep`、向量搜尋 `vector search`、內容抓取 `fetch` 等。AI 會根據你的問題，自主分析並決定呼叫哪種工具組合來尋找最佳答案。

- 上述皆在純前端實現，瀏覽器開啟即用


### 專案正在活躍地迭代

*   **完全本地化部署：** 正在開發Docker 部署方案，還提供了可自託管的 [OCR Server](https://github.com/Feather-2/PBX-DS-OCR-server)，最終目標是讓使用者可以完全在離線環境中使用全部功能。
*   **從單文件到多文件：** 下一個里程碑是將能力從分析單篇文獻，擴充到處理多篇文獻，並基於此開發能自動生成文獻綜述的 **綜述 Agent**，成為真正的 AI 研究助理。

---

**核心優勢：**

- ⚡ **極速翻譯** - 並行處理，長論文僅需數十秒
- 🎨 **完美排版** - 保留公式、圖表、格式
- 🤖 **智慧分析** - AI 助手、思維導圖、流程圖生成
- 🔒 **隱私安全** - 純前端模式，資料完全本地化
- 🐳 **靈活部署** - 支援 Vercel 靜態部署和 Docker 完整部署


---

## 🚀 快速開始

Paper Burner X 提供**兩種部署模式**，根據你的需求選擇：

### 📱 模式 1：純前端部署（推薦個人使用）

**特點：**

- ✅ 無需伺服器，完全免費
- ✅ 5 分鐘快速部署到 Vercel
- ✅ 資料儲存在瀏覽器本地，隱私安全
- ✅ 適合個人使用和快速體驗

**部署步驟：**

```bash
# 1. Fork 本倉庫到你的 GitHub 賬號

# 2. 在 Vercel 中匯入專案
# 訪問 https://vercel.com/new
# 選擇你 fork 的倉庫
# 點選 Deploy

# 3. 部署完成！訪問你的域名即可使用
```

> 💡 **提示：** 純前端模式下，所有資料儲存在瀏覽器 localStorage/IndexedDB 中，不會上傳到任何伺服器。

**線上體驗：** [https://paperburner.viwoplus.site](https://paperburner.viwoplus.site)

---

### 🐳 模式 2：Docker 完整部署

該模式將盡快上線

**使用 Docker Hub 映象：**

```bash
docker pull feather2dev/paper-burner-x:latest
```

> 📖 **詳細文件：** [完整部署指南](deploy/DEPLOYMENT_GUIDE.md)

---

## ✨ 特性概覽

### 1. ⚡ 極速並行翻譯

- **多檔案並行處理** - 一次上傳多個檔案，自動排隊處理
- **高速並行翻譯** - 理想情況下，長論文翻譯僅需幾十秒
- **自定義並行數** - 可配置檔案處理和翻譯任務的並行數量
- **提示詞池機制** - 智慧健康管理提示詞，保證翻譯質量
- **資料夾批次匯入** - 支援整個庫/資料夾翻譯，保留資料夾層級

### 2. 🔧 靈活的配置管理

- **術語庫系統** - 維護多套術語庫，自動注入翻譯提示，保持術語一致性
- **自定義提示詞** - 支援自定義翻譯 Prompt，滿足客製化需求
- **提示詞池生成** - AI 自動生成提示詞變體，保證核心需求不變
- **模型自動檢測** - 透過 `/v1/models` API 自動檢測可用模型
- **多 Key 輪詢** - 支援多個 API Key 輪詢使用，提高穩定性
- **配置匯入匯出** - 方便遷移和備份配置

### 3. 📖 增強的閱讀體驗

- **歷史記錄面板** - 基於 IndexedDB 儲存，支援原文/譯文/對比模式
- **公式與表格渲染** - 完美支援 LaTeX 公式、圖片、表格渲染
- **分塊對比** - 原文與譯文智慧對齊，段落級精準對比
- **目錄導航 (TOC)** - 快速瀏覽文件結構，實現內容間快速跳轉
- **沉浸式閱讀** - 桌面端沉浸模式，所有要素集中在一個畫面
- **標註與醒目提示** - 字級醒目提示和標註，支援多種顏色

### 4. 🤖 智慧文件分析

- **AI 聊天助手** - 對長文件進行提問和分析，支援流式輸出
- **快捷指令** - 預置學術相關問題，快速提問
- **思維導圖生成** - 自動生成文件思維導圖
- **流程圖生成** - 支援 Mermaid 流程圖生成和編輯
- **對話匯出** - 將 AI 對話內容快速匯出為圖片
- **圖片上傳** - 支援上傳圖片進行多模態對話

### 5. 📁 多格式支援

**支援匯入：**

- PDF / Markdown / TXT / DOCX / PPTX / HTML / EPUB

**支援匯出：**

- HTML / PDF / DOCX / Markdown（支援圖片嵌入或連結）...

---

## 🔑 API 金鑰配置

### 純前端模式

需要在瀏覽器中配置以下 API 金鑰（本地儲存）：

1. **OCR 服務**

   - [MinerU](https://github.com/opendatalab/MinerU)
   - [Doc2X](https://doc2x.noedgeai.com/)
   - [Mistral](http://mistral.ai/)

2. **翻譯模型**

   - [DeepSeek](https://deepseek.com/)
   - [Google Gemini](https://makersuite.google.com/)
   - [Anthropic Claude](https://www.anthropic.com/)
   - [阿里通義千問](https://www.aliyun.com/)
   - [火山引擎](https://www.volcengine.com/)
   - 自定義模型端點...


## 🗺️ 路線圖

- [X] 純前端模式
- [X] Docker 部署支援
- [X] 多使用者系統
- [X] 管理員面板
- [X] 更多 OCR 引擎支援
- [X] 行動裝置適配最佳化
- [ ] UI 介面重構
- [ ] 雲端同步（可選）

---

## 🤝 貢獻指南

歡迎為 Paper Burner X 做出貢獻！

**參與方式：**

- 🐛 [報告 Bug](https://github.com/Feather-2/paper-burner-x/issues)
- 💡 [提出新功能建議](https://github.com/Feather-2/paper-burner-x/issues)
- 🔧 [提交 Pull Request](https://github.com/Feather-2/paper-burner-x/pulls)
- 📖 [改進文件](https://github.com/Feather-2/paper-burner-x/wiki)
- ⭐ [為專案點 Star](https://github.com/Feather-2/paper-burner-x)

---

## 📚 相關文件

- [部署指南](deploy/DEPLOYMENT_GUIDE.md) - 詳細的部署步驟
- [本地測試指南](deploy/LOCAL_TESTING.md) - 本地開發和測試

---

## ⚠️ 注意事項

- AI 模型翻譯結果僅供參考，重要內容請以原文為準
- 大型文件的處理可能需要較長時間，請耐心等待
- 對於包含特殊格式的 PDF，OCR 結果可能需要人工校對
- 使用 API 時請遵守相應服務提供商的使用條款
- 純前端模式下，資料儲存在瀏覽器本地，清除瀏覽器資料會丟失歷史記錄

---

## 📄 許可證

本專案採用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 許可證開源。

### 📋 關鍵要求

如果你部署本專案作為網路服務（包括但不限於）：

- 公開的 Web 服務
- SaaS 平台
- 內部企業服務

**你必須**：

1. 在使用者介面顯著位置提供"原始碼"連結
2. 使用者可以透過該連結免費獲取完整原始碼
3. 包括你所做的任何修改

### 📜 許可證說明

本專案基於 [Paper Burner](https://github.com/baoyudu/paper-burner) (GPL-2.0) 的創意開發（該專案是一款pdf極簡翻譯工具）：

**當前版本 (Paper Burner X)**:

- **許可證**: AGPL-3.0
- **適用範圍**: 所有當前程式碼（大部分為新開發內容），已在原始專案上進行了重構和各方面極多內容的擴充。
- **作者**: Feather-2 and contributors
- **版權**: Copyright (C) 2024-2025 Feather-2 and contributors

**歷史歸屬 (Original Paper Burner)**:

- **許可證**: GPL-2.0
- **適用範圍**: 重構前，與mistral翻譯相關的原始程式碼和部分ui（見 git 歷史記錄 before May 16, 2025）
- **作者**: Baoyu (baoyudu)
- **倉庫**: https://github.com/baoyudu/paper-burner

**為什麼使用 AGPL-3.0？**

作為我所寫這部分程式碼的版權持有人，我選擇 AGPL-3.0 是為了：

- ✅ 防止"雲服務漏洞"（部署為 SaaS 必須開源）
- ✅ 保護開源社群的利益（修改必須回饋）

詳見 [NOTICE](NOTICE) 檔案和 [LICENSE](LICENSE) 檔案。

---

## 🙏 致謝

> 本專案是在 [Paper Burner](https://github.com/baoyudu/paper-burner) 原專案基礎上進行擴充和修改的，為示尊重和區分，故命名為 Paper Burner X。
> 該專案擴充了諸多閱讀/AI工具上的便利，但如果您需要一個簡潔、輕量化的文件處理工具，也歡迎使用 [Paper Burner](https://github.com/baoyudu/paper-burner) ， [baoyu](https://github.com/baoyudu) 的原分支。

**貢獻者：**

<div align="center">
  <a href="https://github.com/feather-2/paper-burner-x/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=feather-2/paper-burner-x" />
  </a>
</div>

---

<div align="center">
  <p><strong>如果這個工具對您有幫助，請考慮給專案一個 ⭐</strong></p>
  <p>
    <a href="https://github.com/Feather-2/paper-burner-x">GitHub</a> •
    <a href="https://paperburner.viwoplus.site">線上體驗</a>
  </p>
</div>







