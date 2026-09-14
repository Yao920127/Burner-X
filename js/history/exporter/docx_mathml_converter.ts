/**
 * DOCX MathML to OMML 轉換器模組
 * 將 MathML 格式轉換為 Word 的 OMML (Office Math Markup Language) 格式
 */

(function(window) {
  'use strict';

  /**
   * MathML 到 OMML 轉換器類
   * 支援常見的數學元素，包括上下標、分數、根式等
   */
  class MathMlToOmmlConverter {
    /**
     * 轉換 MathML 元素為 OMML
     * @param {Element} mathEl - MathML math 元素
     * @returns {string} OMML XML 字串
     */
    convert(mathEl) {
      if (!mathEl) return '';
      try {
        const inner = this.convertChildren(mathEl.childNodes);
        if (!inner || !inner.trim()) return '';
        // 驗證生成的 OMML 不包含非法字元
        const sanitized = this.sanitizeOmml(inner);
        if (!sanitized) return '';
        return `<m:oMath>${sanitized}</m:oMath>`;
      } catch (error) {
        console.warn('MathML to OMML conversion failed:', error);
        return '';
      }
    }

    /**
     * 清理 OMML 內容，移除非法字元
     * @param {string} omml - OMML 字串
     * @returns {string} 清理後的 OMML
     */
    sanitizeOmml(omml) {
      if (!omml) return '';
      // 移除控制字元，但保留換行字元和製表符
      return String(omml).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');
    }

    /**
     * 轉換子節點列表
     * @param {NodeList} nodeList - 子節點列表
     * @returns {string} 轉換後的 OMML
     */
    convertChildren(nodeList) {
      let result = '';
      try {
        Array.from(nodeList || []).forEach(node => {
          const converted = this.convertNode(node);
          if (converted) result += converted;
        });
      } catch (error) {
        console.warn('Error converting MathML children:', error);
      }
      return result;
    }

    /**
     * 轉換單個節點
     * @param {Node} node - DOM 節點
     * @returns {string} 轉換後的 OMML
     */
    convertNode(node) {
      if (!node) return '';
      try {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          if (!text || !text.trim()) return '';
          return this.createTextRun(text.trim());
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return '';
        }
        const tag = node.tagName.toLowerCase();
        const childNodes = node.childNodes;

        // 為所有可能訪問 childNodes 的情況新增邊界檢查
        switch (tag) {
          case 'math':
            return this.convertChildren(childNodes);
          case 'mrow':
          case 'semantics':
            return this.convertChildren(childNodes);
          case 'annotation':
            return '';
          case 'mi':
          case 'mn':
          case 'mo':
          case 'mtext':
            return this.createTextRun(node.textContent || '');
          case 'msup':
            if (childNodes.length < 2) return this.convertChildren(childNodes);
            return `<m:sSup>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sup', this.convertNode(childNodes[1]))}</m:sSup>`;
          case 'msub':
            if (childNodes.length < 2) return this.convertChildren(childNodes);
            return `<m:sSub>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sub', this.convertNode(childNodes[1]))}</m:sSub>`;
          case 'msubsup':
            if (childNodes.length < 3) return this.convertChildren(childNodes);
            return `<m:sSubSup>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sub', this.convertNode(childNodes[1]))}${this.wrapWith('m:sup', this.convertNode(childNodes[2]))}</m:sSubSup>`;
          case 'mfrac':
            if (childNodes.length < 2) return this.convertChildren(childNodes);
            return `<m:f>${this.wrapWith('m:num', this.convertNode(childNodes[0]))}${this.wrapWith('m:den', this.convertNode(childNodes[1]))}</m:f>`;
          case 'msqrt':
            return `<m:rad><m:deg><m:degHide/></m:deg>${this.wrapWith('m:e', this.convertChildren(childNodes))}</m:rad>`;
          case 'mroot':
            if (childNodes.length < 2) return this.convertChildren(childNodes);
            return `<m:rad>${this.wrapWith('m:deg', this.convertNode(childNodes[1]))}${this.wrapWith('m:e', this.convertNode(childNodes[0]))}</m:rad>`;
          case 'mfenced':
            return `${this.createTextRun('(')}${this.convertChildren(childNodes)}${this.createTextRun(')')}`;
          case 'mover':
            if (childNodes.length < 2) return this.convertChildren(childNodes);
            return `<m:sSup>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sup', this.convertNode(childNodes[1]))}</m:sSup>`;
          case 'munder':
            if (childNodes.length < 2) return this.convertChildren(childNodes);
            return `<m:sSub>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sub', this.convertNode(childNodes[1]))}</m:sSub>`;
          case 'munderover':
            if (childNodes.length < 3) return this.convertChildren(childNodes);
            return `<m:sSubSup>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sub', this.convertNode(childNodes[1]))}${this.wrapWith('m:sup', this.convertNode(childNodes[2]))}</m:sSubSup>`;
          default:
            return this.convertChildren(childNodes);
        }
      } catch (error) {
        console.warn('Error converting MathML node:', error);
        return '';
      }
    }

    /**
     * 用標籤包裹內容
     * @param {string} tag - 標籤名
     * @param {string} content - 內容
     * @returns {string} 包裹後的 XML
     */
    wrapWith(tag, content) {
      if (!content || !content.trim()) {
        // 空內容時返回空格佔位，防止生成空標籤
        return `<${tag}>${this.createTextRun(' ')}</${tag}>`;
      }
      return `<${tag}>${content}</${tag}>`;
    }

    /**
     * 建立文字執行
     * @param {string} text - 文字內容
     * @returns {string} OMML 文字執行 XML
     */
    createTextRun(text) {
      const normalized = text ? text.replace(/\s+/g, ' ').trim() : '';
      if (!normalized) {
        // 返回一個空格，而不是空字串
        return '<m:r><m:t xml:space="preserve"> </m:t></m:r>';
      }
      // 使用全域的 escapeXml 函式
      const escapeXml = window.PBXDocxXmlUtils?.escapeXml || function(str) {
        if (!str) return '';
        let result = String(str);
        result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');
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
      };
      return `<m:r><m:t xml:space="preserve">${escapeXml(normalized)}</m:t></m:r>`;
    }
  }

  // 匯出到全域
  window.PBXMathMlToOmmlConverter = MathMlToOmmlConverter;

})(window);
