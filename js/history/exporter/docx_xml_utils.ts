/**
 * DOCX XML 工具函式模組
 * 提供 XML 轉義、驗證和模板構建功能
 */

(function(window) {
  'use strict';

  /**
   * 轉義 XML 特殊字元
   * @param {string} str - 要轉義的字串
   * @returns {string} 轉義後的字串
   */
  function escapeXml(str) {
    if (!str) return '';
    let result = String(str);
    // 移除 XML 非法控制字元
    // XML 1.0 允許的字元: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD]
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');
    // 轉義 XML 特殊字元
    return result.replace(/[&<>"']/g, function(ch) {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }

  /**
   * 轉義 HTML 特殊字元
   * @param {string} str - 要轉義的字串
   * @returns {string} 轉義後的字串
   */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function(ch) {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }

  /**
   * 清理 XML 內容，修復常見問題
   * @param {string} xmlStr - XML 字串
   * @param {Object} options - 選項
   * @returns {string} 清理後的 XML
   */
  function sanitizeXmlContent(xmlStr, options = {}) {
    if (!xmlStr) return '';

    if (options.debug) {
      console.log('🔧 sanitizeXmlContent called, input length:', xmlStr.length);
    }

    let cleaned = String(xmlStr);

    // 檢查輸入
    const hasUnescapedAmp = cleaned.match(/<w:t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;|#)[^<]*<\/w:t>/);
    if (hasUnescapedAmp) {
      console.warn('🔧 sanitizeXmlContent found unescaped & in <w:t>:', hasUnescapedAmp[0]);
    } else if (options.debug) {
      console.log('✓ No unescaped & found in initial check');
    }

    // 移除 XML 非法控制字元
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');

    // 修復未轉義的 & 符號
    const AMP_PLACEHOLDER = '\u0001AMP\u0001';
    const LT_PLACEHOLDER = '\u0002LT\u0002';
    const GT_PLACEHOLDER = '\u0003GT\u0003';
    const QUOT_PLACEHOLDER = '\u0004QUOT\u0004';
    const APOS_PLACEHOLDER = '\u0005APOS\u0005';

    // 保護已經正確轉義的實體
    cleaned = cleaned.replace(/&amp;/g, AMP_PLACEHOLDER);
    cleaned = cleaned.replace(/&lt;/g, LT_PLACEHOLDER);
    cleaned = cleaned.replace(/&gt;/g, GT_PLACEHOLDER);
    cleaned = cleaned.replace(/&quot;/g, QUOT_PLACEHOLDER);
    cleaned = cleaned.replace(/&apos;/g, APOS_PLACEHOLDER);
    cleaned = cleaned.replace(/&#([0-9]+);/g, '\u0006NUM$1\u0006');
    cleaned = cleaned.replace(/&#x([0-9a-fA-F]+);/g, '\u0007HEX$1\u0007');

    // 轉義所有剩餘的 & 符號
    cleaned = cleaned.replace(/&/g, '&amp;');

    // 還原之前保護的實體
    cleaned = cleaned.replace(new RegExp(AMP_PLACEHOLDER, 'g'), '&amp;');
    cleaned = cleaned.replace(new RegExp(LT_PLACEHOLDER, 'g'), '&lt;');
    cleaned = cleaned.replace(new RegExp(GT_PLACEHOLDER, 'g'), '&gt;');
    cleaned = cleaned.replace(new RegExp(QUOT_PLACEHOLDER, 'g'), '&quot;');
    cleaned = cleaned.replace(new RegExp(APOS_PLACEHOLDER, 'g'), '&apos;');
    cleaned = cleaned.replace(/\u0006NUM([0-9]+)\u0006/g, '&#$1;');
    cleaned = cleaned.replace(/\u0007HEX([0-9a-fA-F]+)\u0007/g, '&#x$1;');

    // 檢查輸出
    if (options.debug && hasUnescapedAmp) {
      const stillHasUnescaped = cleaned.match(/<w:t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;|#)[^<]*<\/w:t>/);
      if (stillHasUnescaped) {
        console.error('❌ sanitizeXmlContent FAILED to fix &:', stillHasUnescaped[0]);
      } else {
        console.log('✅ sanitizeXmlContent successfully fixed unescaped &');
      }
    }

    // 移除空標籤
    cleaned = cleaned.replace(/<m:oMath>\s*<\/m:oMath>/g, '');
    cleaned = cleaned.replace(/<m:oMathPara>\s*<\/m:oMathPara>/g, '');
    cleaned = cleaned.replace(/<w:r>\s*<\/w:r>/g, '');
    cleaned = cleaned.replace(/<w:r><w:rPr[^>]*\/><\/w:r>/g, '');
    cleaned = cleaned.replace(/<w:t[^>]*>\s*<\/w:t>/g, '');
    cleaned = cleaned.replace(/(<w:p[^>]*>)(<w:pPr[^>]*>.*?<\/w:pPr>)?<w:r><w:t[^>]*><\/w:t><\/w:r>(<\/w:p>)/g, '$1$2$3');

    return cleaned;
  }

  /**
   * 驗證 XML 結構
   * @param {string} xmlString - XML 字串
   * @returns {boolean} 驗證是否透過
   */
  function validateXmlStructure(xmlString) {
    if (!xmlString || typeof xmlString !== 'string') {
      throw new Error('XML 內容為空或型別錯誤');
    }

    if (!xmlString.includes('<?xml')) {
      throw new Error('缺少 XML 宣告');
    }

    if (!xmlString.includes('<w:document') || !xmlString.includes('</w:document>')) {
      throw new Error('缺少或未閉合的 document 根元素');
    }

    if (!xmlString.includes('<w:body>') || !xmlString.includes('</w:body>')) {
      throw new Error('缺少或未閉合的 body 元素');
    }

    // 檢查非法字元
    const illegalCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/;
    if (illegalCharsRegex.test(xmlString)) {
      const match = xmlString.match(illegalCharsRegex);
      const charCode = match ? match[0].charCodeAt(0) : 'unknown';
      throw new Error(`包含非法 XML 控制字元: 0x${charCode.toString(16)}`);
    }

    // 檢查標籤平衡
    const criticalTags = ['w:document', 'w:body'];
    for (const tag of criticalTags) {
      const openCount = (xmlString.match(new RegExp(`<${tag}[> ]`, 'g')) || []).length;
      const closeCount = (xmlString.match(new RegExp(`</${tag}>`, 'g')) || []).length;

      if (openCount !== closeCount) {
        throw new Error(`標籤 ${tag} 未正確閉合 (開啟:${openCount}, 關閉:${closeCount})`);
      }
    }

    // 檢查尖括號比對
    const openBrackets = (xmlString.match(/</g) || []).length;
    const closeBrackets = (xmlString.match(/>/g) || []).length;
    if (openBrackets !== closeBrackets) {
      throw new Error(`尖括號不比對 (<: ${openBrackets}, >: ${closeBrackets})`);
    }

    return true;
  }

  /**
   * 基礎 XML 驗證
   * @param {string} xmlString - XML 字串
   * @param {string} fileName - 檔名（用於錯誤提示）
   * @returns {boolean} 驗證是否透過
   */
  function validateBasicXml(xmlString, fileName) {
    if (!xmlString || typeof xmlString !== 'string') {
      throw new Error(`${fileName}: XML 內容為空`);
    }

    if (!xmlString.includes('<?xml')) {
      throw new Error(`${fileName}: 缺少 XML 宣告`);
    }

    const illegalCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/;
    if (illegalCharsRegex.test(xmlString)) {
      throw new Error(`${fileName}: 包含非法 XML 控制字元`);
    }

    return true;
  }

  /**
   * 構建 [Content_Types].xml
   * @param {Array} mediaExtensions - 媒體副檔名列表
   * @returns {string} XML 字串
   */
  function buildContentTypesXml(mediaExtensions) {
    const defaults = [
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>'
    ];

    const mediaTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp'
    };

    const seenExts = new Set();
    (mediaExtensions || []).forEach(function(ext) {
      const normalized = String(ext || '').toLowerCase().replace(/^\./, '');
      if (normalized && !seenExts.has(normalized) && mediaTypes[normalized]) {
        defaults.push(`<Default Extension="${escapeXml(normalized)}" ContentType="${mediaTypes[normalized]}"/>`);
        seenExts.add(normalized);
      }
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
${defaults.join('\n')}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  /**
   * 構建 _rels/.rels
   * @returns {string} XML 字串
   */
  function buildPackageRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  /**
   * 構建 docProps/core.xml
   * @param {Object} payload - 匯出資料
   * @param {string} iso - ISO 時間字串
   * @returns {string} XML 字串
   */
  function buildCorePropsXml(payload, iso) {
    const title = payload && payload.data && payload.data.name ? escapeXml(payload.data.name) : 'PaperBurner X 匯出';
    const creator = 'PaperBurner X';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${title}</dc:title>
<dc:creator>${creator}</dc:creator>
<cp:lastModifiedBy>${creator}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>`;
  }

  /**
   * 構建 docProps/app.xml
   * @returns {string} XML 字串
   */
  function buildAppPropsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>PaperBurner X</Application>
</Properties>`;
  }

  /**
   * 構建 word/_rels/document.xml.rels
   * @param {Array} relationships - 關係陣列
   * @returns {string} XML 字串
   */
  function buildDocumentRelsXml(relationships) {
    const rels = relationships || [];
    let relsXml = rels.map(function(rel) {
      return `<Relationship Id="${escapeXml(rel.id)}" Type="${escapeXml(rel.type)}" Target="${escapeXml(rel.target)}"${rel.targetMode ? ` TargetMode="${escapeXml(rel.targetMode)}"` : ''}/>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relsXml}
</Relationships>`;
  }

  // 匯出到全域
  window.PBXDocxXmlUtils = {
    escapeXml,
    escapeHtml,
    sanitizeXmlContent,
    validateXmlStructure,
    validateBasicXml,
    buildContentTypesXml,
    buildPackageRelsXml,
    buildCorePropsXml,
    buildAppPropsXml,
    buildDocumentRelsXml
  };

})(window);
