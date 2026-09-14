/**
 * DOCX 匯出診斷工具
 * 用於檢測和診斷 DOCX 匯出中可能導致檔案無法開啟的問題
 */

(function(window) {
  'use strict';

  /**
   * 診斷 DOCX 匯出問題
   * @param {Object} payload - 匯出資料
   * @param {Object} options - 匯出選項
   * @returns {Object} 診斷報告
   */
  function diagnoseDOCXExport(payload, options = {}) {
    const report = {
      timestamp: new Date().toISOString(),
      issues: [],
      warnings: [],
      info: {},
      passed: true
    };

    console.log('🔍 開始 DOCX 匯出診斷...');

    // 1. 檢查 payload 基本結構
    if (!payload) {
      report.issues.push('payload 為空');
      report.passed = false;
    } else {
      report.info.hasBodyHtml = !!payload.bodyHtml;
      report.info.bodyHtmlLength = payload.bodyHtml ? payload.bodyHtml.length : 0;
      report.info.hasImages = Array.isArray(payload.images) && payload.images.length > 0;
      report.info.imageCount = payload.images ? payload.images.length : 0;
    }

    // 2. 檢查 HTML 內容中的潛在問題
    if (payload && payload.bodyHtml) {
      const html = payload.bodyHtml;

      // 檢查非法字元
      const illegalChars = html.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g);
      if (illegalChars) {
        report.warnings.push(`HTML 中發現 ${illegalChars.length} 個非法控制字元`);
        console.warn('⚠ 非法字元位置:', illegalChars.map(c => '0x' + c.charCodeAt(0).toString(16)).join(', '));
      }

      // 檢查公式數量
      const formulaCount = (html.match(/<math/g) || []).length;
      const katexCount = (html.match(/class="katex/g) || []).length;
      report.info.mathmlCount = formulaCount;
      report.info.katexCount = katexCount;
      report.info.totalFormulas = formulaCount + katexCount;

      if (report.info.totalFormulas > 50) {
        report.warnings.push(`包含大量公式 (${report.info.totalFormulas} 個)，可能影響轉換效能`);
      }

      // 檢查表格數量
      const tableCount = (html.match(/<table/g) || []).length;
      report.info.tableCount = tableCount;

      // 檢查特殊字元
      const ampersandCount = (html.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g) || []).length;
      if (ampersandCount > 0) {
        report.warnings.push(`發現 ${ampersandCount} 個未轉義的 & 符號`);
      }

      // 檢查標籤平衡
      const openTags = (html.match(/<[^/][^>]*>/g) || []).length;
      const closeTags = (html.match(/<\/[^>]*>/g) || []).length;
      const selfCloseTags = (html.match(/<[^>]*\/>/g) || []).length;
      report.info.tagBalance = { open: openTags, close: closeTags, selfClose: selfCloseTags };

      if (openTags - selfCloseTags !== closeTags) {
        report.warnings.push(`HTML 標籤可能不平衡 (開始:${openTags}, 結束:${closeTags}, 自閉合:${selfCloseTags})`);
      }
    }

    // 3. 嘗試模擬構建過程
    try {
      console.log('🔨 模擬構建 DOCX...');
      const parser = new DOMParser();
      const wrapped = `<div>${payload.bodyHtml || ''}</div>`;
      const dom = parser.parseFromString(wrapped, 'text/html');

      if (dom.querySelector('parsererror')) {
        report.issues.push('HTML 解析失敗，包含語法錯誤');
        report.passed = false;
      }

      const bodyNodes = Array.from(dom.body.childNodes || []);
      report.info.bodyNodeCount = bodyNodes.length;

      // 檢查是否有問題節點
      let problematicNodes = 0;
      bodyNodes.forEach((node, index) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName.toLowerCase();

          // 檢查是否有未知或問題標籤
          if (tag === 'script' || tag === 'style') {
            report.warnings.push(`發現 ${tag} 標籤，可能影響匯出`);
          }

          // 檢查深度巢狀
          const depth = getNodeDepth(node);
          if (depth > 20) {
            report.warnings.push(`節點 ${index} 巢狀過深 (${depth} 層)`);
            problematicNodes++;
          }
        }
      });

      report.info.problematicNodes = problematicNodes;

    } catch (error) {
      report.issues.push(`模擬構建失敗: ${error.message}`);
      report.passed = false;
    }

    // 4. 生成報告
    console.log('\n📊 診斷報告:');
    console.log('═'.repeat(60));

    if (report.issues.length > 0) {
      console.error('❌ 嚴重問題:');
      report.issues.forEach(issue => console.error(`  • ${issue}`));
    }

    if (report.warnings.length > 0) {
      console.warn('\n⚠ 警告:');
      report.warnings.forEach(warning => console.warn(`  • ${warning}`));
    }

    console.log('\nℹ️ 資訊:');
    Object.entries(report.info).forEach(([key, value]) => {
      console.log(`  • ${key}: ${JSON.stringify(value)}`);
    });

    console.log('\n' + '═'.repeat(60));
    console.log(report.passed ? '✅ 診斷透過' : '❌ 發現問題');

    return report;
  }

  /**
   * 計算節點深度
   */
  function getNodeDepth(node, depth = 0) {
    if (!node || !node.childNodes || node.childNodes.length === 0) {
      return depth;
    }

    let maxDepth = depth;
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childDepth = getNodeDepth(child, depth + 1);
        if (childDepth > maxDepth) {
          maxDepth = childDepth;
        }
      }
    });

    return maxDepth;
  }

  /**
   * 匯出 DOCX 並啟用詳細日誌
   */
  async function exportDOCXWithDiagnostics(payload, options = {}, helpers = {}) {
    // 先執行診斷
    const report = diagnoseDOCXExport(payload, options);

    if (!report.passed) {
      const continueExport = confirm('診斷髮現問題，是否繼續匯出？\n\n問題:\n' + report.issues.join('\n'));
      if (!continueExport) {
        throw new Error('使用者取消匯出');
      }
    }

    // 啟用除錯模式匯出
    const diagnosticOptions = {
      ...options,
      debug: true,
      strictValidation: true,
      validateXml: true
    };

    console.log('\n📦 開始匯出 DOCX (除錯模式)...');

    try {
      await exportAsDocx(payload, diagnosticOptions, helpers);
      console.log('✅ 匯出成功！');
    } catch (error) {
      console.error('❌ 匯出失敗:', error);
      throw error;
    }
  }

  // 暴露到全域
  window.diagnoseDOCXExport = diagnoseDOCXExport;
  window.exportDOCXWithDiagnostics = exportDOCXWithDiagnostics;

})(window);
