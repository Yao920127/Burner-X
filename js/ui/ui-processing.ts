// js/ui/ui-processing.js
// 檔案列表展示與處理進度相關的 UI 邏輯。
(function(global) {
    'use strict';

    const fileListContainer = document.getElementById('fileListContainer');
    const fileList = document.getElementById('fileList');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const processBtn = document.getElementById('processBtn');
    const resultsSection = document.getElementById('resultsSection');
    const resultsSummary = document.getElementById('resultsSummary');
    const progressSection = document.getElementById('progressSection');
    const batchProgressText = document.getElementById('batchProgressText');
    const concurrentProgressText = document.getElementById('concurrentProgressText');
    const progressStep = document.getElementById('progressStep');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressBar = document.getElementById('progressBar');
    const progressLog = document.getElementById('progressLog');

    // 使用事件委託綁定驗證重新整理按鈕
    document.addEventListener('click', (e) => {
        const refreshBtn = e.target.closest('#validationRefreshBtn');
        if (refreshBtn) {
            console.log('[Validation] Refresh button clicked');
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.refreshValidationState === 'function') {
                window.refreshValidationState();
            } else {
                console.warn('[Validation] window.refreshValidationState not available');
            }
        }
    });

    function updateFileListUI(pdfFiles, isProcessing, onRemoveFile) {
        if (!fileList || !fileListContainer) return;
        fileList.innerHTML = '';
        if (pdfFiles.length > 0) {
            fileListContainer.classList.remove('hidden');
            pdfFiles.forEach((file, index) => {
                const displayPath = global.getFileDisplayPath(file);
                const displayName = (displayPath.split('/').pop() || file.name || '').trim() || file.name;
                const listItem = document.createElement('div');
                listItem.className = 'file-list-item';
                let virtualBadge = '';
                const vType = (file && file.virtualType) ? String(file.virtualType) : '';
                const nameLower = (file && file.name) ? file.name.toLowerCase() : '';
                const isRetranslate = vType === 'retranslate' || /-retranslate-/.test(nameLower);
                const isRetryFailed = vType === 'retry-failed' || /-retry-failed-/.test(nameLower);
                if (isRetranslate) {
                    virtualBadge = '<span class="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex-shrink-0">重譯</span>';
                } else if (isRetryFailed) {
                    virtualBadge = '<span class="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex-shrink-0">失敗重試</span>';
                }

                const extSource = displayName || file.name || '';
                const ext = (extSource.split('.').pop() || '').toLowerCase();
                const icon = ext === 'pdf' ? 'carbon:document-pdf' : 'carbon:document';
                const iconColor = ext === 'pdf' ? 'text-red-500' : 'text-gray-500';
                const isExcluded = typeof global.isExtensionExcluded === 'function' ? global.isExtensionExcluded(ext) : false;

                listItem.innerHTML = `
                <div class="flex items-center overflow-hidden mr-2">
                    <iconify-icon icon="${icon}" class="${iconColor} mr-2 flex-shrink-0" width="20"></iconify-icon>
                    <span class="flex flex-col overflow-hidden">
                        <span class="text-sm text-gray-800 truncate" title="${displayName}">${displayName}</span>
                        ${displayPath && displayPath !== displayName ? `<span class="text-[11px] text-gray-500 truncate" title="${displayPath}">${displayPath}</span>` : ''}
                    </span>
                    ${virtualBadge}
                    ${isExcluded ? '<span class="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 flex-shrink-0">已排除</span>' : ''}
                    <span class="text-xs text-gray-500 ml-2 flex-shrink-0">(${global.formatFileSize(file.size)})</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button data-index="${index}" class="preview-file-btn text-gray-400 hover:text-blue-600 flex-shrink-0" title="預覽">
                        <iconify-icon icon="carbon:search" width="16"></iconify-icon>
                    </button>
                    <button data-index="${index}" class="remove-file-btn text-gray-400 hover:text-red-600 flex-shrink-0" title="移除">
                        <iconify-icon icon="carbon:close" width="16"></iconify-icon>
                    </button>
                </div>
            `;
                if (isExcluded) {
                    listItem.classList.add('opacity-60');
                }
                fileList.appendChild(listItem);
            });

            document.querySelectorAll('.remove-file-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    if (isProcessing) return;
                    const indexToRemove = parseInt(e.currentTarget.getAttribute('data-index'));
                    onRemoveFile(indexToRemove);
                });
            });

            // 新增預覽按鈕事件監聽器
            document.querySelectorAll('.preview-file-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    const fileIndex = parseInt(e.currentTarget.getAttribute('data-index'));
                    const fileToPreview = pdfFiles[fileIndex];
                    if (fileToPreview) {
                        previewFile(fileToPreview);
                    }
                });
            });

            if (pdfFiles.length === 1) {
                global.data = { name: pdfFiles[0].name, ocr: '', translation: '', images: [], summaries: {} };
            } else if (pdfFiles.length === 0) {
                global.data = {};
            } else {
                global.data = { summaries: {} };
            }
            console.log('重新整理檔案列表:', pdfFiles.map(f => f.name));
        } else {
            fileListContainer.classList.add('hidden');
            global.data = {};
        }

        if (typeof global.syncBatchModeControls === 'function') {
            global.syncBatchModeControls(pdfFiles.length);
        }
    }

    function updateProcessButtonState(pdfFiles, isProcessing) {
        if (!processBtn) return;
        const getActiveFiles = typeof global.getActiveFiles === 'function' ? global.getActiveFiles : null;
        const effectiveFiles = getActiveFiles ? getActiveFiles() : pdfFiles;
        let ocrConfigAvailable = true;  // 重新命名：更清晰地表示 OCR 配置是否可用
        let translationKeysAvailable = true;
        const hasPdfFiles = effectiveFiles.some(file => file.name.toLowerCase().endsWith('.pdf'));

        // 檢查 OCR 引擎與所需配置
        let ocrEngine = 'mistral';
        let ocrConfigValid = true;
        let ocrConfigMessage = '';
        try {
            if (window.ocrSettingsManager && typeof window.ocrSettingsManager.getCurrentConfig === 'function') {
                ocrEngine = window.ocrSettingsManager.getCurrentConfig().engine || (localStorage.getItem('ocrEngine') || 'mistral');
                // 使用 validateConfig 檢查配置是否完整
                const validation = window.ocrSettingsManager.validateConfig();
                ocrConfigValid = validation.valid;
                ocrConfigMessage = validation.message;
            } else {
                ocrEngine = localStorage.getItem('ocrEngine') || 'mistral';
            }
        } catch {}

        if (hasPdfFiles) {
            if (ocrEngine === 'none') {
                // 選擇了"不需要 OCR"但有 PDF 檔案，標記為無效
                ocrConfigAvailable = false;
            } else if (!ocrConfigValid) {
                // 當前選擇的 OCR 引擎配置不完整
                ocrConfigAvailable = false;
            } else {
                // OCR 配置有效
                ocrConfigAvailable = true;
            }
        }

        // 檢查翻譯 Keys（如果需要翻譯）- 直接使用 app.js 的邏輯
        const settings = typeof global.loadSettings === 'function' ? global.loadSettings() : {};
        const selectedTranslationModelName = settings.selectedTranslationModel || 'none';
        let translationModelDisplayName = selectedTranslationModelName;
        let currentTranslationModelForProvider = null;
        let translationModelConfigForProcess = null;

        if (selectedTranslationModelName !== 'none') {
            if (selectedTranslationModelName === 'custom') {
                const selectedCustomSourceId = settings.selectedCustomSourceSiteId;
                if (!selectedCustomSourceId) {
                    translationKeysAvailable = false;
                } else {
                    const allSourceSites = typeof global.loadAllCustomSourceSites === 'function' ? global.loadAllCustomSourceSites() : {};
                    const siteConfig = allSourceSites[selectedCustomSourceId];
                    if (!siteConfig) {
                        translationKeysAvailable = false;
                    } else {
                        currentTranslationModelForProvider = `custom_source_${selectedCustomSourceId}`;
                        translationModelConfigForProcess = siteConfig;
                        translationModelDisplayName = siteConfig.displayName || siteConfig.name || selectedCustomSourceId;
                    }
                }
            } else {
                // 預設模型
                currentTranslationModelForProvider = selectedTranslationModelName;
                translationModelConfigForProcess = typeof global.loadModelConfig === 'function' ? global.loadModelConfig(selectedTranslationModelName) : {};
                translationModelDisplayName = translationModelConfigForProcess?.displayName || selectedTranslationModelName;
            }

            // 使用 KeyProvider 檢查
            if (currentTranslationModelForProvider) {
                const translationKeyProvider = new KeyProvider(currentTranslationModelForProvider);
                translationKeysAvailable = translationKeyProvider.hasAvailableKeys();
            }
        }

        // 更新按鈕禁用狀態和驗證提示
        const hasValidationIssues = (hasPdfFiles && !ocrConfigAvailable) || (!translationKeysAvailable && selectedTranslationModelName !== 'none');
        processBtn.disabled = effectiveFiles.length === 0 || isProcessing || hasValidationIssues;

        // 更新驗證狀態提示（傳遞 OCR 配置資訊）
        updateValidationAlert(effectiveFiles, hasPdfFiles, ocrConfigAvailable, translationKeysAvailable, selectedTranslationModelName, translationModelDisplayName, isProcessing, ocrEngine, ocrConfigValid, ocrConfigMessage);

        if (isProcessing) {
            processBtn.innerHTML = `<iconify-icon icon="carbon:hourglass" class="mr-1 animate-spin"></iconify-icon>處理中...`;
        } else {
            processBtn.innerHTML = `<iconify-icon icon="carbon:play" class="mr-1"></iconify-icon>開始處理`;
        }
    }


    function updateValidationAlert(effectiveFiles, hasPdfFiles, ocrConfigAvailable, translationKeysAvailable, selectedTranslationModel, translationModelDisplayName, isProcessing, ocrEngine, ocrConfigValid, ocrConfigMessage) {
        const validationAlert = document.getElementById('validationAlert');
        const validationIcon = document.getElementById('validationIcon');
        const validationTitle = document.getElementById('validationTitle');
        const validationMessage = document.getElementById('validationMessage');
        const validationActions = document.getElementById('validationActions');

        if (!validationAlert || !validationIcon || !validationTitle || !validationMessage || !validationActions) return;

        // 如果正在處理或沒有檔案，隱藏提示
        if (isProcessing || effectiveFiles.length === 0) {
            validationAlert.classList.add('hidden');
            return;
        }

        // 檢查各種驗證條件
        const issues = [];

        if (hasPdfFiles && !ocrConfigAvailable) {
            if (ocrEngine === 'none') {
                issues.push({
                    type: 'ocr-none-with-pdf',
                    title: 'PDF 檔案需要 OCR 引擎',
                    message: '您上傳了 PDF 檔案，但當前選擇了"不需要 OCR"。請在上方 OCR 設定中選擇 Mistral OCR、MinerU 或 Doc2X。',
                    icon: 'carbon:warning-alt',
                    actions: []
                });
            } else if (!ocrConfigValid) {
                const engineNames = { mistral: 'Mistral OCR', mineru: 'MinerU', doc2x: 'Doc2X' };
                const engineName = engineNames[ocrEngine] || ocrEngine;
                issues.push({
                    type: 'ocr-config-incomplete',
                    title: `${engineName} 配置不完整`,
                    message: ocrConfigMessage || `請完成 ${engineName} 的配置。`,
                    icon: 'carbon:warning-alt',
                    actions: [
                        { text: '去配置', onClick: () => {
                            const btn = document.getElementById('modelKeyManagerBtn');
                            if (btn) btn.click();
                        }}
                    ]
                });
            }
        }

        if (selectedTranslationModel && selectedTranslationModel !== 'none' && !translationKeysAvailable) {
            const isCustomSource = selectedTranslationModel === 'custom';
            const message = isCustomSource
                ? `源站 "${translationModelDisplayName}" 沒有可用的 API Key。請新增 Key 後再處理，配置後可點選右上角重新整理按鈕更新狀態。`
                : `模型 "${translationModelDisplayName}" 沒有可用的 API Key。請新增 Key 後再處理，配置後可點選右上角重新整理按鈕更新狀態。`;

            issues.push({
                type: isCustomSource ? 'no-custom-translation-key' : 'no-translation-key',
                title: isCustomSource ? `缺少源站 Key` : `缺少翻譯模型 Key`,
                message: message,
                icon: 'carbon:warning-alt',
                actions: [
                    { text: isCustomSource ? '去配置該源站 Key' : '去配置 Key', onClick: () => {
                        const btn = document.getElementById('modelKeyManagerBtn');
                        if (btn) btn.click();
                    }},
                    { text: '關閉翻譯', onClick: () => {
                        const select = document.getElementById('translationModel');
                        if (select) {
                            select.value = 'none';
                            select.dispatchEvent(new Event('change'));
                        }
                    }}
                ]
            });
        }

        // 如果沒有問題，隱藏提示
        if (issues.length === 0) {
            validationAlert.classList.add('hidden');
            return;
        }

        // 顯示問題
        if (issues.length > 1) {
            // 多個問題：合併顯示
            validationIcon.setAttribute('icon', 'carbon:warning-alt');
            validationTitle.textContent = '配置檢查';
            validationMessage.innerHTML = issues.map(issue => `• ${issue.message}`).join('<br>');

            validationActions.innerHTML = '';
            const addedButtons = new Set();
            issues.forEach(issue => {
                issue.actions.forEach(action => {
                    if (!addedButtons.has(action.text)) {
                        addedButtons.add(action.text);
                        const btn = document.createElement('button');
                        btn.className = 'text-xs px-3 py-1.5 bg-white/80 hover:bg-white border border-current/20 hover:border-current/40 rounded-md transition-all font-medium shadow-sm';
                        btn.textContent = action.text;
                        if (action.onClick) btn.onclick = action.onClick;
                        validationActions.appendChild(btn);
                    }
                });
            });
        } else {
            // 單個問題：正常顯示
            const issue = issues[0];
            validationIcon.setAttribute('icon', issue.icon);
            validationTitle.textContent = issue.title;
            validationMessage.textContent = issue.message;

            validationActions.innerHTML = '';
            issue.actions.forEach(action => {
                const btn = document.createElement('button');
                btn.className = 'text-xs px-3 py-1.5 bg-white/80 hover:bg-white border border-current/20 hover:border-current/40 rounded-md transition-all font-medium shadow-sm';
                btn.textContent = action.text;
                if (action.onClick) btn.onclick = action.onClick;
                validationActions.appendChild(btn);
            });
        }

        // 設定樣式
        validationAlert.className = 'mt-6 mb-4 p-3.5 rounded-lg border transition-all shadow-sm border-amber-400 bg-amber-50/50 text-amber-900';
        validationAlert.classList.remove('hidden');
    }

    function showResultsSection(successCount, skippedCount, errorCount, pdfFilesLength) {
        if (!progressSection || !resultsSection || !resultsSummary || !downloadAllBtn || !concurrentProgressText) return;
        progressSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        concurrentProgressText.textContent = '';

        const totalAttempted = successCount + skippedCount + errorCount;
        resultsSummary.innerHTML = `
        <p><strong>處理總結:</strong></p>
        <ul class="list-disc list-inside ml-4">
            <li>成功處理: ${successCount} 檔案</li>
            <li>跳過 (已處理): ${skippedCount} 檔案</li>
            <li>處理失敗 (含重試): ${errorCount} 檔案</li>
        </ul>
        <p class="mt-2">在 ${pdfFilesLength} 個選定檔案中，嘗試處理了 ${totalAttempted} 個。</p>
    `;

        downloadAllBtn.disabled = successCount === 0;

        window.scrollTo({
            top: resultsSection.offsetTop - 20,
            behavior: 'smooth'
        });
    }

    function showProgressSection() {
        if (!resultsSection || !progressSection || !progressLog || !batchProgressText || !concurrentProgressText) return;
        resultsSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        progressLog.innerHTML = '';
        batchProgressText.textContent = '';
        concurrentProgressText.textContent = '';
        updateProgress('初始化...', 0);

        window.scrollTo({
            top: progressSection.offsetTop - 20,
            behavior: 'smooth'
        });
    }

    function updateConcurrentProgress(count) {
        if (concurrentProgressText) {
            concurrentProgressText.textContent = `當前並行任務數: ${count}`;
        }
    }

    function updateOverallProgress(success, skipped, errors, totalFiles) {
        if (!batchProgressText || !progressPercentage || !progressBar) return;
        const completedCount = success + skipped + errors;
        if (totalFiles > 0) {
            const percentage = totalFiles > 0 ? Math.round((completedCount / totalFiles) * 100) : 0;
            batchProgressText.textContent = `整體進度: ${completedCount} / ${totalFiles} 完成`;
            progressPercentage.textContent = `${percentage}%`;
            progressBar.style.width = `${percentage}%`;
        } else {
            batchProgressText.textContent = '';
            progressPercentage.textContent = '0%';
            progressBar.style.width = '0%';
        }
    }

    function updateProgress(stepText, percentage) {
        if (progressStep) {
            progressStep.textContent = stepText;
        }
    }

    function addProgressLog(text) {
        if (!progressLog) return;
        const timestamp = new Date().toLocaleTimeString();
        const logLine = document.createElement('div');
        logLine.textContent = `[${timestamp}] ${text}`;
        progressLog.appendChild(logLine);
        progressLog.scrollTop = progressLog.scrollHeight;
    }

    /**
     * 檔案預覽功能
     * @param {File} file - 要預覽的檔案物件
     */
    function previewFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        // 建立預覽模態框
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm';
        modal.style.animation = 'fadeIn 0.2s ease-out';

        const modalContent = document.createElement('div');
        modalContent.className = 'relative bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] flex flex-col';
        modalContent.style.animation = 'slideUp 0.3s ease-out';

        // 標頭
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between px-6 py-4 border-b border-gray-200';
        header.innerHTML = `
            <div class="flex items-center gap-3">
                <iconify-icon icon="carbon:view" class="text-blue-500" width="24"></iconify-icon>
                <h3 class="text-lg font-semibold text-gray-800">檔案預覽</h3>
            </div>
            <button class="preview-close-btn text-gray-400 hover:text-gray-600 transition-colors">
                <iconify-icon icon="carbon:close" width="24"></iconify-icon>
            </button>
        `;

        // 檔案資訊和控制元件整合到一行（僅針對 PDF）
        let fileInfoAndControls = null;
        if (ext === 'pdf') {
            fileInfoAndControls = document.createElement('div');
            fileInfoAndControls.className = 'px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between';
            fileInfoAndControls.innerHTML = `
                <div class="flex items-center gap-6 text-sm text-gray-700">
                    <div class="flex items-center gap-2">
                        <iconify-icon icon="carbon:document-pdf" class="text-red-500" width="18"></iconify-icon>
                        <span class="font-medium">${file.name}</span>
                    </div>
                    <div class="flex items-center gap-1 text-gray-600">
                        <iconify-icon icon="carbon:data-1" width="14"></iconify-icon>
                        <span>${global.formatFileSize ? global.formatFileSize(file.size) : (file.size / 1024).toFixed(2) + ' KB'}</span>
                    </div>
                    <div class="flex items-center gap-1 text-gray-500 text-xs">
                        <iconify-icon icon="carbon:information" width="14"></iconify-icon>
                        <span>按住 Ctrl 滾動滑鼠滾輪可縮放</span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <button class="pdf-prev-page px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-300 hover:border-blue-400 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm" title="上一頁">
                        <iconify-icon icon="carbon:chevron-left" width="16"></iconify-icon>
                    </button>
                    <span class="text-sm text-gray-700 px-2">
                        第 <span class="pdf-page-num font-semibold text-blue-600">1</span> / <span class="pdf-page-count font-semibold">-</span> 頁
                    </span>
                    <button class="pdf-next-page px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-300 hover:border-blue-400 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm" title="下一頁">
                        <iconify-icon icon="carbon:chevron-right" width="16"></iconify-icon>
                    </button>
                    <div class="w-px h-5 bg-gray-300 mx-1"></div>
                    <button class="pdf-zoom-out px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-300 hover:border-blue-400 rounded transition-all shadow-sm" title="縮小">
                        <iconify-icon icon="carbon:zoom-out" width="16"></iconify-icon>
                    </button>
                    <span class="pdf-zoom-level text-sm text-gray-700 font-semibold min-w-[50px] text-center">120%</span>
                    <button class="pdf-zoom-in px-3 py-1.5 bg-white hover:bg-blue-50 border border-gray-300 hover:border-blue-400 rounded transition-all shadow-sm" title="放大">
                        <iconify-icon icon="carbon:zoom-in" width="16"></iconify-icon>
                    </button>
                </div>
            `;
        } else {
            // 非 PDF 檔案，保持原有的檔案資訊顯示
            fileInfoAndControls = document.createElement('div');
            fileInfoAndControls.className = 'px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100';
            fileInfoAndControls.innerHTML = `
                <div class="flex items-center gap-6 text-sm text-gray-700">
                    <div class="flex items-center gap-2">
                        <iconify-icon icon="carbon:document" class="text-gray-500" width="18"></iconify-icon>
                        <span class="font-medium">${file.name}</span>
                    </div>
                    <div class="flex items-center gap-1 text-gray-600">
                        <iconify-icon icon="carbon:data-1" width="14"></iconify-icon>
                        <span>${global.formatFileSize ? global.formatFileSize(file.size) : (file.size / 1024).toFixed(2) + ' KB'}</span>
                    </div>
                    <span class="text-gray-600">${ext.toUpperCase()}</span>
                </div>
            `;
        }

        // 內容區域
        const contentArea = document.createElement('div');
        contentArea.className = 'flex-1 overflow-auto p-6';

        // 根據檔案型別生成預覽內容
        if (ext === 'pdf') {
            // PDF 預覽 - 使用 PDF.js 渲染，新增左側縮圖
            contentArea.className = 'flex-1 flex overflow-hidden';
            contentArea.innerHTML = `
                <div class="w-48 bg-gray-50 border-r border-gray-200 overflow-y-auto p-3">
                    <div class="text-xs font-semibold text-gray-600 mb-3 px-2">頁面縮圖</div>
                    <div class="pdf-thumbnails space-y-2"></div>
                </div>
                <div class="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-6">
                    <canvas class="pdf-canvas shadow-2xl bg-white"></canvas>
                </div>
            `;

            // 使用 PDF.js 渲染
            const canvas = contentArea.querySelector('.pdf-canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: false });
            const thumbnailsContainer = contentArea.querySelector('.pdf-thumbnails');
            const pageNumSpan = fileInfoAndControls.querySelector('.pdf-page-num');
            const pageCountSpan = fileInfoAndControls.querySelector('.pdf-page-count');
            const zoomLevelSpan = fileInfoAndControls.querySelector('.pdf-zoom-level');
            const prevBtn = fileInfoAndControls.querySelector('.pdf-prev-page');
            const nextBtn = fileInfoAndControls.querySelector('.pdf-next-page');
            const zoomInBtn = fileInfoAndControls.querySelector('.pdf-zoom-in');
            const zoomOutBtn = fileInfoAndControls.querySelector('.pdf-zoom-out');

            let pdfDoc = null;
            let currentPage = 1;
            let currentScale = 1.2; // 調整為更合適的預設縮放比例

            const renderPage = async (num) => {
                const page = await pdfDoc.getPage(num);
                const viewport = page.getViewport({ scale: currentScale });

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: ctx,
                    viewport: viewport
                }).promise;

                pageNumSpan.textContent = num;
                prevBtn.disabled = num <= 1;
                nextBtn.disabled = num >= pdfDoc.numPages;

                // 更新縮圖醒目提示
                document.querySelectorAll('.pdf-thumbnail').forEach((thumb, idx) => {
                    if (idx + 1 === num) {
                        thumb.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
                    } else {
                        thumb.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
                    }
                });
            };

            // 渲染縮圖
            const renderThumbnails = async () => {
                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 0.2 }); // 縮圖小比例

                    const thumbCanvas = document.createElement('canvas');
                    thumbCanvas.width = viewport.width;
                    thumbCanvas.height = viewport.height;
                    const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: false });

                    await page.render({
                        canvasContext: thumbCtx,
                        viewport: viewport
                    }).promise;

                    const thumbDiv = document.createElement('div');
                    thumbDiv.className = 'pdf-thumbnail cursor-pointer p-2 rounded border-2 border-transparent hover:border-blue-300 transition-all';
                    thumbDiv.innerHTML = `
                        <div class="relative">
                            <img src="${thumbCanvas.toDataURL()}" class="w-full rounded shadow-sm" />
                            <div class="text-center text-xs text-gray-600 mt-1">第 ${i} 頁</div>
                        </div>
                    `;
                    thumbDiv.addEventListener('click', async () => {
                        currentPage = i;
                        await renderPage(currentPage);
                    });

                    thumbnailsContainer.appendChild(thumbDiv);
                }
            };

            // 載入 PDF
            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
                try {
                    const typedArray = new Uint8Array(e.target.result);
                    pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
                    pageCountSpan.textContent = pdfDoc.numPages;

                    // 渲染第一頁
                    await renderPage(currentPage);

                    // 渲染所有縮圖（非同步進行，不阻塞）
                    renderThumbnails();
                } catch (error) {
                    console.error('[PDF Preview] Error loading PDF:', error);
                    contentArea.innerHTML = `
                        <div class="flex flex-col items-center justify-center h-full text-gray-500">
                            <iconify-icon icon="carbon:warning-alt" width="64" class="mb-4 text-red-500"></iconify-icon>
                            <p class="text-lg">PDF 載入失敗</p>
                            <p class="text-sm mt-2">${error.message}</p>
                        </div>
                    `;
                }
            };
            fileReader.readAsArrayBuffer(file);

            // 翻頁事件
            prevBtn.addEventListener('click', async () => {
                if (currentPage > 1) {
                    currentPage--;
                    await renderPage(currentPage);
                }
            });

            nextBtn.addEventListener('click', async () => {
                if (currentPage < pdfDoc.numPages) {
                    currentPage++;
                    await renderPage(currentPage);
                }
            });

            // 縮放事件
            zoomInBtn.addEventListener('click', async () => {
                currentScale += 0.25;
                zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%';
                await renderPage(currentPage);
            });

            zoomOutBtn.addEventListener('click', async () => {
                if (currentScale > 0.5) {
                    currentScale -= 0.25;
                    zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%';
                    await renderPage(currentPage);
                }
            });

            // 滾輪縮放功能（Ctrl/Cmd + 滾輪）
            const pdfContainer = contentArea.querySelector('.flex-1.overflow-auto');
            let zoomTimeout = null;

            pdfContainer.addEventListener('wheel', async (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();

                    const delta = e.deltaY;
                    const zoomStep = 0.1; // 更細膩的縮放步進

                    if (delta < 0) {
                        // 向上滾動 - 放大
                        currentScale = Math.min(currentScale + zoomStep, 5.0); // 最大 500%
                    } else {
                        // 向下滾動 - 縮小
                        currentScale = Math.max(currentScale - zoomStep, 0.5); // 最小 50%
                    }

                    // 更新顯示
                    zoomLevelSpan.textContent = Math.round(currentScale * 100) + '%';

                    // 防抖渲染：等待滾輪停止後再渲染
                    clearTimeout(zoomTimeout);
                    zoomTimeout = setTimeout(async () => {
                        await renderPage(currentPage);
                    }, 150);
                }
            }, { passive: false });
        } else if (['docx', 'doc'].includes(ext)) {
            // Word 檔案預覽 - 使用 docx-preview.js
            contentArea.className = 'flex-1 overflow-auto bg-gray-50 p-6';
            contentArea.innerHTML = `
                <div class="docx-preview-container bg-white shadow-lg mx-auto" style="max-width: 21cm; min-height: 29.7cm;"></div>
            `;

            const docxContainer = contentArea.querySelector('.docx-preview-container');

            // 檢查 docx-preview 庫是否載入
            if (typeof docx === 'undefined') {
                contentArea.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full text-gray-500">
                        <iconify-icon icon="carbon:warning-alt" width="64" class="mb-4 text-red-500"></iconify-icon>
                        <p class="text-lg">Word 預覽庫未載入</p>
                        <p class="text-sm mt-2">請重新整理頁面重試</p>
                    </div>
                `;
                return;
            }

            // 使用 docx-preview 渲染
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    await docx.renderAsync(e.target.result, docxContainer, null, {
                        className: "docx-preview",
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: true,
                        experimental: false,
                        trimXmlDeclaration: true,
                        useBase64URL: false,
                        useMathMLPolyfill: false,
                        renderHeaders: true,
                        renderFooters: true,
                        renderFootnotes: true,
                        renderEndnotes: true
                    });
                } catch (error) {
                    console.error('[Word Preview] Error rendering Word:', error);
                    contentArea.innerHTML = `
                        <div class="flex flex-col items-center justify-center h-full text-gray-500">
                            <iconify-icon icon="carbon:warning-alt" width="64" class="mb-4 text-red-500"></iconify-icon>
                            <p class="text-lg">Word 檔案載入失敗</p>
                            <p class="text-sm mt-2">${error.message}</p>
                        </div>
                    `;
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (['pptx', 'ppt'].includes(ext)) {
            // PPT 檔案預覽
            contentArea.className = 'flex-1 overflow-hidden bg-gray-100';

            contentArea.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-500 px-6">
                    <iconify-icon icon="carbon:presentation-file" width="64" class="mb-4 text-orange-500"></iconify-icon>
                    <p class="text-lg font-semibold mb-2">PowerPoint 檔案預覽</p>
                    <p class="text-sm text-gray-600 text-center max-w-md">
                        建議使用 Microsoft PowerPoint 或其他本地應用開啟此檔案。
                    </p>
                    <div class="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200 max-w-md">
                        <p class="text-xs text-gray-600">
                            <strong>檔案資訊：</strong><br>
                            名稱: ${file.name}<br>
                            大小: ${global.formatFileSize ? global.formatFileSize(file.size) : (file.size / 1024).toFixed(2) + ' KB'}
                        </p>
                    </div>
                </div>
            `;
        } else if (['txt', 'md', 'yaml', 'yml', 'html', 'htm'].includes(ext)) {
            // 文字檔案預覽
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                contentArea.innerHTML = `<pre class="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 p-4 rounded-lg border border-gray-200 font-mono">${escapeHtml(text)}</pre>`;
            };
            reader.readAsText(file);
        } else {
            // 不支援的型別
            contentArea.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-500">
                    <iconify-icon icon="carbon:document-unknown" width="64" class="mb-4"></iconify-icon>
                    <p class="text-lg">暫不支援預覽此檔案型別</p>
                    <p class="text-sm mt-2">支援的型別: PDF, Word (DOCX), TXT, MD, YAML, HTML</p>
                </div>
            `;
        }

        // 組裝模態框
        modalContent.appendChild(header);
        modalContent.appendChild(fileInfoAndControls);
        modalContent.appendChild(contentArea);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 關閉事件
        const closeModal = () => {
            modal.style.animation = 'fadeOut 0.2s ease-out';
            setTimeout(() => modal.remove(), 200);
        };

        header.querySelector('.preview-close-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // ESC 鍵關閉
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * HTML 轉義函式
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    global.updateFileListUI = updateFileListUI;
    global.updateProcessButtonState = updateProcessButtonState;
    global.showResultsSection = showResultsSection;
    global.showProgressSection = showProgressSection;
    global.updateConcurrentProgress = updateConcurrentProgress;
    global.updateOverallProgress = updateOverallProgress;
    global.updateProgress = updateProgress;
    global.addProgressLog = addProgressLog;
})(window);
