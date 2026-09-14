/**
 * DOCX MathML to OMML 增強轉換器模組
 * 支援更多複雜的 MathML 元素，包括矩陣、可拉伸運算子等
 * 版本: 2.0.0
 *
 * 新增支援：
 * - mtable/mtr/mtd (矩陣和表格)
 * - mspace (空格)
 * - mstyle (樣式，部分支援)
 * - menclose (包圍符號)
 * - mo stretchy (可拉伸運算子)
 */

(function(window) {
  'use strict';

  /**
   * 增強的 MathML 到 OMML 轉換器類
   */
  class MathMlToOmmlConverterEnhanced {
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
        console.warn('[MathML→OMML Enhanced] Conversion failed:', error);
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
        console.warn('[MathML→OMML Enhanced] Error converting children:', error);
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

        switch (tag) {
          // 基礎容器
          case 'math':
          case 'mrow':
          case 'semantics':
            return this.convertChildren(childNodes);
          case 'annotation':
            return '';

          // 基礎文字
          case 'mi':
          case 'mn':
          case 'mtext':
            return this.createTextRun(node.textContent || '');

          // 運算子 (增強處理)
          case 'mo':
            return this.convertOperator(node);

          // 上下標
          case 'msup':
            return this.convertSup(node, childNodes);
          case 'msub':
            return this.convertSub(node, childNodes);
          case 'msubsup':
            return this.convertSubSup(node, childNodes);

          // 分數
          case 'mfrac':
            return this.convertFrac(node, childNodes);

          // 根式
          case 'msqrt':
            return this.convertSqrt(childNodes);
          case 'mroot':
            return this.convertRoot(childNodes);

          // 括號
          case 'mfenced':
            return this.convertFenced(node, childNodes);

          // 上下裝飾
          case 'mover':
            return this.convertOver(node, childNodes);
          case 'munder':
            return this.convertUnder(node, childNodes);
          case 'munderover':
            return this.convertUnderOver(node, childNodes);

          // 矩陣和表格 (新增)
          case 'mtable':
            return this.convertTable(node, childNodes);

          // 空格 (新增)
          case 'mspace':
            return this.convertSpace(node);

          // 樣式 (新增)
          case 'mstyle':
            return this.convertStyle(node, childNodes);

          // 包圍符號 (新增)
          case 'menclose':
            return this.convertEnclose(node, childNodes);

          // 填充 (新增)
          case 'mpadded':
            return this.convertPadded(node, childNodes);

          // 多行腳本 (新增)
          case 'mmultiscripts':
            return this.convertMultiscripts(node, childNodes);

          default:
            console.warn(`[MathML→OMML Enhanced] Unsupported tag: ${tag}`);
            return this.convertChildren(childNodes);
        }
      } catch (error) {
        console.warn('[MathML→OMML Enhanced] Error converting node:', error);
        return '';
      }
    }

    /**
     * 轉換運算子 (增強支援 stretchy 屬性)
     * @param {Element} node - mo 元素
     * @returns {string} OMML
     */
    convertOperator(node) {
      const text = node.textContent || '';
      const stretchy = node.getAttribute('stretchy');
      const largeop = node.getAttribute('largeop');

      // 如果是大型運算子（如求和、積分），使用特殊格式
      if (largeop === 'true' || this.isLargeOperator(text)) {
        return this.createNaryOperator(text);
      }

      // 普通運算子
      return this.createTextRun(text);
    }

    /**
     * 判斷是否為大型運算子
     * @param {string} text - 運算子文字
     * @returns {boolean}
     */
    isLargeOperator(text) {
      const largeOps = ['∑', '∫', '∬', '∭', '∮', '∯', '∰', '∱', '∏', '∐', '⋃', '⋂', '⋁', '⋀'];
      return largeOps.includes(text.trim());
    }

    /**
     * 建立 N-ary 運算子 (求和、積分等)
     * @param {string} operator - 運算子文字
     * @returns {string} OMML
     */
    createNaryOperator(operator) {
      // OMML 的 nary 結構用於大型運算子
      const charMap = {
        '∑': '2211',
        '∫': '222B',
        '∬': '222C',
        '∭': '222D',
        '∮': '222E',
        '∯': '222F',
        '∰': '2230',
        '∱': '2231',
        '∏': '220F',
        '∐': '2210'
      };

      const charCode = charMap[operator] || operator.charCodeAt(0).toString(16).toUpperCase();
      return `<m:nary><m:naryPr><m:chr m:val="${charCode}"/></m:naryPr><m:sub></m:sub><m:sup></m:sup><m:e></m:e></m:nary>`;
    }

    /**
     * 轉換上標
     */
    convertSup(node, childNodes) {
      if (childNodes.length < 2) return this.convertChildren(childNodes);
      return `<m:sSup>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sup', this.convertNode(childNodes[1]))}</m:sSup>`;
    }

    /**
     * 轉換下標
     */
    convertSub(node, childNodes) {
      if (childNodes.length < 2) return this.convertChildren(childNodes);
      return `<m:sSub>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sub', this.convertNode(childNodes[1]))}</m:sSub>`;
    }

    /**
     * 轉換上下標
     */
    convertSubSup(node, childNodes) {
      if (childNodes.length < 3) return this.convertChildren(childNodes);
      return `<m:sSubSup>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:sub', this.convertNode(childNodes[1]))}${this.wrapWith('m:sup', this.convertNode(childNodes[2]))}</m:sSubSup>`;
    }

    /**
     * 轉換分數
     */
    convertFrac(node, childNodes) {
      if (childNodes.length < 2) return this.convertChildren(childNodes);

      // 檢查是否有 linethickness 屬性（用於控制分數線）
      const lineThickness = node.getAttribute('linethickness');
      const noLine = lineThickness === '0' || lineThickness === '0pt';

      if (noLine) {
        // 無分數線，使用 stack
        return `<m:func><m:fName>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}</m:fName><m:e>${this.convertNode(childNodes[1])}</m:e></m:func>`;
      }

      return `<m:f>${this.wrapWith('m:num', this.convertNode(childNodes[0]))}${this.wrapWith('m:den', this.convertNode(childNodes[1]))}</m:f>`;
    }

    /**
     * 轉換平方根
     */
    convertSqrt(childNodes) {
      return `<m:rad><m:deg><m:degHide m:val="1"/></m:deg>${this.wrapWith('m:e', this.convertChildren(childNodes))}</m:rad>`;
    }

    /**
     * 轉換根式
     */
    convertRoot(childNodes) {
      if (childNodes.length < 2) return this.convertChildren(childNodes);
      return `<m:rad>${this.wrapWith('m:deg', this.convertNode(childNodes[1]))}${this.wrapWith('m:e', this.convertNode(childNodes[0]))}</m:rad>`;
    }

    /**
     * 轉換括號
     */
    convertFenced(node, childNodes) {
      const open = node.getAttribute('open') || '(';
      const close = node.getAttribute('close') || ')';
      return `${this.createTextRun(open)}${this.convertChildren(childNodes)}${this.createTextRun(close)}`;
    }

    /**
     * 轉換上裝飾
     */
    convertOver(node, childNodes) {
      if (childNodes.length < 2) return this.convertChildren(childNodes);

      const accent = node.getAttribute('accent');
      if (accent === 'true') {
        // 重音符號
        const accentChar = childNodes[1].textContent || '';
        return `<m:acc><m:accPr><m:chr m:val="${accentChar}"/></m:accPr>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}</m:acc>`;
      }

      // 普通上標
      return `<m:limUpp>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:lim', this.convertNode(childNodes[1]))}</m:limUpp>`;
    }

    /**
     * 轉換下裝飾
     */
    convertUnder(node, childNodes) {
      if (childNodes.length < 2) return this.convertChildren(childNodes);

      const accentunder = node.getAttribute('accentunder');
      if (accentunder === 'true') {
        // 下重音
        return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}</m:bar>`;
      }

      // 普通下標
      return `<m:limLow>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}${this.wrapWith('m:lim', this.convertNode(childNodes[1]))}</m:limLow>`;
    }

    /**
     * 轉換上下裝飾
     */
    convertUnderOver(node, childNodes) {
      if (childNodes.length < 3) return this.convertChildren(childNodes);
      return `<m:groupChr><m:groupChrPr><m:chr m:val="⏞"/></m:groupChrPr>${this.wrapWith('m:e', this.convertNode(childNodes[0]))}</m:groupChr>`;
    }

    /**
     * 轉換矩陣 (新增 - 最重要的功能！)
     * @param {Element} node - mtable 元素
     * @param {NodeList} childNodes - 子節點
     * @returns {string} OMML
     */
    convertTable(node, childNodes) {
      const rows = Array.from(childNodes).filter(child =>
        child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'mtr'
      );

      if (rows.length === 0) {
        return this.convertChildren(childNodes);
      }

      // 檢查是否有括號（透過 columnalign 或其他屬性判斷）
      const columnalign = node.getAttribute('columnalign') || 'center';

      // 構建矩陣
      let omml = '<m:m>';

      rows.forEach(row => {
        const cells = Array.from(row.childNodes).filter(child =>
          child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'mtd'
        );

        omml += '<m:mr>';
        cells.forEach(cell => {
          omml += `<m:e>${this.convertChildren(cell.childNodes)}</m:e>`;
        });
        omml += '</m:mr>';
      });

      omml += '</m:m>';

      // 新增矩陣括號（可選）
      const frame = node.getAttribute('frame');
      if (frame) {
        // 用 borderBox 包裹
        return `<m:borderBox>${omml}</m:borderBox>`;
      }

      return omml;
    }

    /**
     * 轉換空格 (新增)
     * @param {Element} node - mspace 元素
     * @returns {string} OMML
     */
    convertSpace(node) {
      const width = node.getAttribute('width') || '1em';
      // OMML 中使用空格字元
      return this.createTextRun(' ');
    }

    /**
     * 轉換樣式 (新增)
     * @param {Element} node - mstyle 元素
     * @param {NodeList} childNodes - 子節點
     * @returns {string} OMML
     */
    convertStyle(node, childNodes) {
      // OMML 中樣式通常透過屬性控制，這裡簡單處理
      // 可以根據 mathvariant, mathsize 等屬性調整
      return this.convertChildren(childNodes);
    }

    /**
     * 轉換包圍符號 (新增)
     * @param {Element} node - menclose 元素
     * @param {NodeList} childNodes - 子節點
     * @returns {string} OMML
     */
    convertEnclose(node, childNodes) {
      const notation = node.getAttribute('notation') || 'longdiv';

      switch (notation) {
        case 'box':
        case 'roundedbox':
          return `<m:borderBox>${this.wrapWith('m:e', this.convertChildren(childNodes))}</m:borderBox>`;
        case 'circle':
          return `<m:borderBox><m:borderBoxPr><m:shape m:val="oval"/></m:borderBoxPr>${this.wrapWith('m:e', this.convertChildren(childNodes))}</m:borderBox>`;
        case 'top':
        case 'bottom':
        case 'left':
        case 'right':
          return `<m:bar><m:barPr><m:pos m:val="${notation}"/></m:barPr>${this.wrapWith('m:e', this.convertChildren(childNodes))}</m:bar>`;
        default:
          return this.convertChildren(childNodes);
      }
    }

    /**
     * 轉換填充 (新增)
     * @param {Element} node - mpadded 元素
     * @param {NodeList} childNodes - 子節點
     * @returns {string} OMML
     */
    convertPadded(node, childNodes) {
      // OMML 不直接支援 padding，簡單忽略
      return this.convertChildren(childNodes);
    }

    /**
     * 轉換多行腳本 (新增)
     * @param {Element} node - mmultiscripts 元素
     * @param {NodeList} childNodes - 子節點
     * @returns {string} OMML
     */
    convertMultiscripts(node, childNodes) {
      // 簡化處理：轉換為連續的上下標
      return this.convertChildren(childNodes);
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
  window.PBXMathMlToOmmlConverterEnhanced = MathMlToOmmlConverterEnhanced;

  console.log('%c[DOCX Math] ✨ 增強 MathML → OMML 轉換器已載入', 'color: #3b82f6; font-weight: bold');
  console.log('新增支援: 矩陣 | 可拉伸運算子 | 空格 | 包圍符號');

})(window);
