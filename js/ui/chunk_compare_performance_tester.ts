/**
 * 分塊對比效能測試腳本
 * 用於測試和驗證分塊對比預覽的效能改進
 */

class ChunkComparePerformanceTester {
    constructor() {
        this.testResults = [];
        this.isRunning = false;
    }

    /**
     * 執行完整的效能測試套件
     */
    async runFullTestSuite() {
        if (this.isRunning) {
            console.warn('[PerformanceTest] 測試正在進行中，請等待完成');
            return;
        }

        this.isRunning = true;
        console.log('[PerformanceTest] 開始執行效能測試套件');

        try {
            const results = {
                testTime: new Date().toISOString(),
                browser: this.getBrowserInfo(),
                device: this.getDeviceInfo(),
                tests: {}
            };

            // 測試不同數量的分塊
            const chunkCounts = [5, 10, 20, 50, 100];
            
            for (const count of chunkCounts) {
                console.log(`[PerformanceTest] 測試 ${count} 個分塊的效能`);
                results.tests[`chunks_${count}`] = await this.testChunkRendering(count);
                
                // 讓瀏覽器有時間清理
                await this.delay(1000);
            }

            // 測試記憶體使用情況
            results.memoryTest = this.testMemoryUsage();

            // 測試滾動效能
            results.scrollTest = await this.testScrollPerformance();

            // 生成測試報告
            this.generateTestReport(results);

            console.log('[PerformanceTest] 效能測試套件完成');
            return results;

        } catch (error) {
            console.error('[PerformanceTest] 測試過程中出錯:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 測試分塊渲染效能
     */
    async testChunkRendering(chunkCount) {
        const testData = this.generateTestData(chunkCount);
        const container = this.createTestContainer();
        
        // 測試原有渲染方法
        const originalResult = await this.testOriginalRendering(testData, container);
        
        // 清理
        container.innerHTML = '';
        await this.delay(100);
        
        // 測試最佳化後的渲染方法
        const optimizedResult = await this.testOptimizedRendering(testData, container);
        
        // 清理
        container.remove();
        
        const improvement = {
            renderTime: {
                original: originalResult.renderTime,
                optimized: optimizedResult.renderTime,
                improvement: ((originalResult.renderTime - optimizedResult.renderTime) / originalResult.renderTime * 100).toFixed(2) + '%'
            },
            memoryUsage: {
                original: originalResult.memoryUsage,
                optimized: optimizedResult.memoryUsage,
                reduction: originalResult.memoryUsage > 0 ? ((originalResult.memoryUsage - optimizedResult.memoryUsage) / originalResult.memoryUsage * 100).toFixed(2) + '%' : 'N/A'
            },
            domNodes: {
                original: originalResult.domNodes,
                optimized: optimizedResult.domNodes,
                reduction: ((originalResult.domNodes - optimizedResult.domNodes) / originalResult.domNodes * 100).toFixed(2) + '%'
            }
        };

        console.log(`[PerformanceTest] ${chunkCount}個分塊測試結果:`, improvement);
        return improvement;
    }

    /**
     * 生成測試資料
     */
    generateTestData(chunkCount) {
        const ocrChunks = [];
        const translatedChunks = [];

        for (let i = 0; i < chunkCount; i++) {
            // 生成不同長度的測試內容
            const contentLength = Math.floor(Math.random() * 1000) + 200; // 200-1200字元
            
            const ocrContent = this.generateTestContent(contentLength, 'ocr', i);
            const transContent = this.generateTestContent(contentLength, 'translation', i);
            
            ocrChunks.push(ocrContent);
            translatedChunks.push(transContent);
        }

        return {
            ocrChunks,
            translatedChunks,
            images: []
        };
    }

    /**
     * 生成測試內容
     */
    generateTestContent(length, type, index) {
        const headings = [
            '# 主要標題',
            '## 次要標題', 
            '### 三級標題'
        ];
        
        const paragraphs = [
            '這是一段測試文字，用於驗證分塊對比功能的效能表現。',
            '本段包含**粗體文字**和*斜體文字*，以及`程式碼片段`。',
            '測試內容包括數學公式：$E = mc^2$，以及更復雜的公式：$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$',
            '這裡有一個程式碼塊：\n```javascript\nfunction test() {\n  console.log("Hello World");\n}\n```',
            '列表專案：\n- 第一項\n- 第二項\n- 第三項',
            '表格測試：\n| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 值1 | 值2 | 值3 |'
        ];

        let content = `${headings[index % headings.length]} (${type} #${index + 1})\n\n`;
        
        while (content.length < length) {
            content += paragraphs[Math.floor(Math.random() * paragraphs.length)] + '\n\n';
        }

        return content.substring(0, length);
    }

    /**
     * 建立測試容器
     */
    createTestContainer() {
        const container = document.createElement('div');
        container.id = 'performance-test-container';
        container.style.cssText = `
            position: absolute;
            top: -10000px;
            left: -10000px;
            width: 1000px;
            height: 600px;
            overflow: hidden;
        `;
        document.body.appendChild(container);
        return container;
    }

    /**
     * 測試原有渲染方法
     */
    async testOriginalRendering(testData, container) {
        const startTime = performance.now();
        const startMemory = this.getMemoryUsage();

        // 模擬原有的同步渲染
        let html = '<div class="chunk-compare-container">';
        
        for (let i = 0; i < testData.ocrChunks.length; i++) {
            html += `
                <div class="chunk-pair">
                    <div class="block-outer" id="block-${i}">
                        <h4>分塊 ${i + 1}</h4>
                        <div class="original-chunk-content">
                            <div class="ocr-content">${this.renderMarkdownSync(testData.ocrChunks[i])}</div>
                            <div class="trans-content">${this.renderMarkdownSync(testData.translatedChunks[i])}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;

        const endTime = performance.now();
        const endMemory = this.getMemoryUsage();
        const domNodes = container.querySelectorAll('*').length;

        return {
            renderTime: endTime - startTime,
            memoryUsage: endMemory - startMemory,
            domNodes: domNodes
        };
    }

    /**
     * 測試最佳化後的渲染方法
     */
    async testOptimizedRendering(testData, container) {
        const startTime = performance.now();
        const startMemory = this.getMemoryUsage();

        // 使用最佳化器進行渲染
        if (window.ChunkCompareOptimizer && window.ChunkCompareOptimizer.instance) {
            const optimizedHTML = window.ChunkCompareOptimizer.instance.optimizeChunkComparison(
                testData.ocrChunks,
                testData.translatedChunks,
                { images: testData.images, isOriginalFirst: true }
            );
            container.innerHTML = optimizedHTML;

            // 等待非同步渲染完成
            await this.waitForOptimizedRendering(container);
        } else {
            // 回退到預覽模式
            let html = '<div class="chunk-compare-container">';
            
            for (let i = 0; i < Math.min(testData.ocrChunks.length, 5); i++) {
                html += `
                    <div class="chunk-pair optimized-chunk">
                        <div class="chunk-header">
                            <h4>分塊 ${i + 1}</h4>
                        </div>
                        <div class="chunk-preview-container" data-lazy-load="true">
                            <div class="chunk-preview">${this.getContentPreview(testData.ocrChunks[i])}</div>
                            <div class="load-full-content-btn">點選載入完整內容</div>
                        </div>
                    </div>
                `;
            }
            
            html += '</div>';
            container.innerHTML = html;
        }

        const endTime = performance.now();
        const endMemory = this.getMemoryUsage();
        const domNodes = container.querySelectorAll('*').length;

        return {
            renderTime: endTime - startTime,
            memoryUsage: endMemory - startMemory,
            domNodes: domNodes
        };
    }

    /**
     * 等待最佳化後的渲染完成
     */
    async waitForOptimizedRendering(container) {
        let maxWait = 5000; // 最多等待5秒
        const interval = 100;
        
        while (maxWait > 0) {
            const loadingIndicators = container.querySelectorAll('.chunk-loading-indicator');
            if (loadingIndicators.length === 0) {
                break;
            }
            
            await this.delay(interval);
            maxWait -= interval;
        }
    }

    /**
     * 同步渲染Markdown（簡化版）
     */
    renderMarkdownSync(content) {
        if (!content) return '';
        
        // 簡化的Markdown渲染，避免複雜的非同步操作
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    /**
     * 獲取內容預覽
     */
    getContentPreview(content) {
        if (!content) return '(空內容)';
        return content.length > 100 ? content.substring(0, 100) + '...' : content;
    }

    /**
     * 測試記憶體使用情況
     */
    testMemoryUsage() {
        if (!performance.memory) {
            return { 
                error: '瀏覽器不支援記憶體監控',
                supported: false 
            };
        }

        const memory = performance.memory;
        return {
            supported: true,
            usedJSHeapSize: (memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
            totalJSHeapSize: (memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
            jsHeapSizeLimit: (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB',
            usage: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
        };
    }

    /**
     * 測試滾動效能
     */
    async testScrollPerformance() {
        const container = document.querySelector('.chunk-compare-container');
        if (!container) {
            return { error: '未找到分塊對比容器' };
        }

        const scrollTests = [];
        const scrollDistance = 100;
        const testCount = 10;

        for (let i = 0; i < testCount; i++) {
            const startTime = performance.now();
            
            // 模擬滾動
            container.scrollTop += scrollDistance;
            
            // 等待渲染完成
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            const endTime = performance.now();
            scrollTests.push(endTime - startTime);
        }

        // 重置滾動位置
        container.scrollTop = 0;

        const avgScrollTime = scrollTests.reduce((a, b) => a + b, 0) / scrollTests.length;
        const maxScrollTime = Math.max(...scrollTests);
        const minScrollTime = Math.min(...scrollTests);

        return {
            averageTime: avgScrollTime.toFixed(2) + 'ms',
            maxTime: maxScrollTime.toFixed(2) + 'ms',
            minTime: minScrollTime.toFixed(2) + 'ms',
            testCount: testCount
        };
    }

    /**
     * 獲取記憶體使用量
     */
    getMemoryUsage() {
        if (performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }

    /**
     * 獲取瀏覽器資訊
     */
    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        
        if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
        else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
        else if (ua.indexOf('Safari') > -1) browser = 'Safari';
        else if (ua.indexOf('Edge') > -1) browser = 'Edge';
        
        return {
            name: browser,
            userAgent: ua,
            vendor: navigator.vendor,
            language: navigator.language
        };
    }

    /**
     * 獲取裝置資訊
     */
    getDeviceInfo() {
        return {
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || 'Unknown',
            deviceMemory: navigator.deviceMemory || 'Unknown',
            screenResolution: `${screen.width}x${screen.height}`,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`
        };
    }

    /**
     * 生成測試報告
     */
    generateTestReport(results) {
        console.group('[PerformanceTest] 效能測試報告');
        
        console.log('測試時間:', results.testTime);
        console.log('瀏覽器資訊:', results.browser);
        console.log('裝置資訊:', results.device);
        
        console.group('分塊渲染測試結果:');
        Object.entries(results.tests).forEach(([testName, result]) => {
            console.group(testName);
            console.log('渲染時間改善:', result.renderTime.improvement);
            console.log('記憶體使用減少:', result.memoryUsage.reduction);
            console.log('DOM節點減少:', result.domNodes.reduction);
            console.groupEnd();
        });
        console.groupEnd();
        
        console.log('記憶體測試:', results.memoryTest);
        console.log('滾動效能測試:', results.scrollTest);
        
        console.groupEnd();

        // 將結果儲存到 localStorage
        localStorage.setItem('chunkComparePerformanceResults', JSON.stringify(results));
        
        // 顯示使用者友好的報告
        this.showUserReport(results);
    }

    /**
     * 顯示使用者友好的測試報告
     */
    showUserReport(results) {
        const reportEl = document.createElement('div');
        reportEl.className = 'performance-report-modal';
        reportEl.innerHTML = `
            <div class="report-overlay">
                <div class="report-content">
                    <h3>分塊對比效能測試報告</h3>
                    <div class="report-summary">
                        <div class="summary-item">
                            <span class="label">測試時間:</span>
                            <span class="value">${new Date(results.testTime).toLocaleString()}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">瀏覽器:</span>
                            <span class="value">${results.browser.name}</span>
                        </div>
                        <div class="summary-item">
                            <span class="label">總體評價:</span>
                            <span class="value performance-grade">${this.calculateOverallGrade(results)}</span>
                        </div>
                    </div>
                    <div class="test-results">
                        <h4>效能改進詳情</h4>
                        ${this.generateResultsHTML(results.tests)}
                    </div>
                    <div class="report-actions">
                        <button id="close-performance-report">關閉</button>
                        <button id="export-performance-report">匯出報告</button>
                    </div>
                </div>
            </div>
        `;
        
        // 新增樣式
        const style = document.createElement('style');
        style.id = 'performance-report-style'; // 新增ID以便後續清理
        style.textContent = `
            .performance-report-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
            }
            .report-overlay {
                background: rgba(0,0,0,0.5);
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .report-content {
                background: white;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                border-radius: 8px;
                padding: 24px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .report-summary {
                margin: 16px 0;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 16px;
            }
            .summary-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            .performance-grade {
                font-weight: bold;
                color: #059669;
            }
            .test-results {
                margin: 16px 0;
            }
            .result-item {
                padding: 8px;
                border-bottom: 1px solid #f1f5f9;
            }
            .report-actions {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                margin-top: 20px;
            }
            .report-actions button {
                padding: 8px 16px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                background: white;
                cursor: pointer;
            }
            .report-actions button:first-child {
                background: #f3f4f6;
            }
            .report-actions button:last-child {
                background: #3b82f6;
                color: white;
                border-color: #3b82f6;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(reportEl);
        
        // 新增事件監聽器
        const closeBtn = document.getElementById('close-performance-report');
        const exportBtn = document.getElementById('export-performance-report');
        const overlay = reportEl.querySelector('.report-overlay');
        
        // 關閉按鈕事件
        closeBtn.addEventListener('click', () => {
            this.closeReport();
        });
        
        // 匯出按鈕事件
        exportBtn.addEventListener('click', () => {
            this.exportReport();
        });
        
        // 點選遮罩層關閉
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeReport();
            }
        });
        
        // ESC鍵關閉
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeReport();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * 關閉效能報告
     */
    closeReport() {
        const reportEl = document.querySelector('.performance-report-modal');
        const styleEl = document.getElementById('performance-report-style');
        
        if (reportEl) {
            reportEl.remove();
        }
        
        if (styleEl) {
            styleEl.remove();
        }
    }

    /**
     * 計算總體評分
     */
    calculateOverallGrade(results) {
        let totalImprovement = 0;
        let testCount = 0;

        Object.values(results.tests).forEach(test => {
            const improvement = parseFloat(test.renderTime.improvement);
            if (!isNaN(improvement)) {
                totalImprovement += improvement;
                testCount++;
            }
        });

        const avgImprovement = testCount > 0 ? totalImprovement / testCount : 0;

        if (avgImprovement >= 50) return '優秀 (A)';
        if (avgImprovement >= 30) return '良好 (B)';
        if (avgImprovement >= 10) return '一般 (C)';
        return '需改進 (D)';
    }

    /**
     * 生成結果HTML
     */
    generateResultsHTML(tests) {
        return Object.entries(tests).map(([testName, result]) => `
            <div class="result-item">
                <strong>${testName.replace('chunks_', '')}個分塊:</strong>
                <div>渲染速度提升: ${result.renderTime.improvement}</div>
                <div>記憶體使用減少: ${result.memoryUsage.reduction}</div>
                <div>DOM節點減少: ${result.domNodes.reduction}</div>
            </div>
        `).join('');
    }

    /**
     * 匯出測試報告
     */
    exportReport() {
        const results = localStorage.getItem('chunkComparePerformanceResults');
        if (!results) {
            alert('沒有可匯出的測試結果');
            return;
        }

        const blob = new Blob([results], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chunk-compare-performance-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 延遲函式
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 建立全域測試例項
window.ChunkComparePerformanceTester = new ChunkComparePerformanceTester();

// 新增主控台快捷命令
console.log('%c分塊對比效能測試器已載入', 'color: #059669; font-weight: bold');
console.log('使用 window.ChunkComparePerformanceTester.runFullTestSuite() 執行完整測試');

// 如果在開發環境，自動執行測試
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // 頁面載入完成後自動執行測試
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (document.querySelector('.chunk-compare-container')) {
                console.log('[PerformanceTest] 檢測到分塊對比頁面，自動執行效能測試');
                window.ChunkComparePerformanceTester.runFullTestSuite();
            }
        }, 2000);
    });
}