/**
 * 根據 Markdown 文字生成思維導圖的靜態 HTML 預覽（虛影效果）。
 *
 * 主要功能與實現邏輯：
 * 1. 解析 Markdown 為樹結構（parseTree）：
 *    - 按行分割 Markdown 文字。
 *    - 識別 #、##、### 標題，構建多級節點樹。
 *    - 返回包含 text 和 children 的樹狀物件。
 * 2. 遞迴渲染樹節點（renderNode）：
 *    - 根據層級渲染不同樣式的節點（背景色、圓點、字型等）。
 *    - 透過絕對定位和縮排實現層級視覺。
 *    - 遞迴渲染所有子節點。
 * 3. 入口與返回：
 *    - 先 parseTree，再 renderNode。
 *    - 若無內容，返回"暫無結構化內容"。
 *
 * @param {string} md - Markdown 格式的思維導圖文字。
 * @returns {string} 生成的思維導圖預覽 HTML 字串。
 */
function renderMindmapShadowInternal(md) {
  /**
   * 解析 Markdown 文字為樹結構。
   *
   * @param {string} md - Markdown 文字。
   * @returns {object} 樹結構物件。
   */
  function parseTree(md) {
    const lines = md.split(/\r?\n/).filter(l => l.trim());
    const root = { text: '', children: [] };
    let last1 = null, last2 = null;
    lines.forEach(line => {
      let m1 = line.match(/^# (.+)/);
      let m2 = line.match(/^## (.+)/);
      let m3 = line.match(/^### (.+)/);
      if (m1) {
        last1 = { text: m1[1], children: [] };
        root.children.push(last1);
        last2 = null;
      } else if (m2 && last1) {
        last2 = { text: m2[1], children: [] };
        last1.children.push(last2);
      } else if (m3 && last2) {
        last2.children.push({ text: m3[1], children: [] });
      }
    });
    return root;
  }

  /**
   * 遞迴渲染樹節點為 HTML。
   *
   * @param {object} node - 當前節點。
   * @param {number} level - 當前層級。
   * @param {boolean} isLast - 是否為同級最後一個節點。
   * @returns {string} HTML 字串。
   */
  function renderNode(node, level = 0, isLast = true) {
    if (!node.text && node.children.length === 0) return '';
    if (!node.text) {
      // 根節點
      return `<div class=\"mindmap-shadow-root\">${node.children.map((c,i,a)=>renderNode(c,0,i===a.length-1)).join('')}</div>`;
    }
    // 節點樣式定義
    const colors = [
      'rgba(59,130,246,0.13)', // 主節點
      'rgba(59,130,246,0.09)', // 二級
      'rgba(59,130,246,0.06)'  // 三級
    ];
    const dotColors = [
      'rgba(59,130,246,0.35)',
      'rgba(59,130,246,0.22)',
      'rgba(59,130,246,0.15)'
    ];
    let html = `<div class=\"mindmap-shadow-node level${level}\" style=\"position:relative;margin-left:${level*28}px;padding:3px 8px 3px 12px;background:${colors[level]||colors[2]};border-radius:8px;min-width:60px;max-width:260px;margin-bottom:2px;opacity:0.7;border:1px dashed rgba(59,130,246,0.2);\">`;
    // 圓點
    html += `<span style=\"position:absolute;left:-10px;top:50%;transform:translateY(-50%);width:7px;height:7px;border-radius:4px;background:${dotColors[level]||dotColors[2]};box-shadow:0 0 0 1px #e0e7ef;\"></span>`;
    // 連線線（非根節點且非最後一個兄弟）
    if (level > 0) {
      html += `<span style=\"position:absolute;left:-6px;top:0;height:100%;width:1.5px;background:linear-gradient(to bottom,rgba(59,130,246,0.10),rgba(59,130,246,0.03));z-index:0;\"></span>`;
    }
    html += `<span style=\"color:#2563eb;font-weight:${level===0?'bold':'normal'};font-size:${level===0?'1.08em':'1em'};\">${window.ChatbotUtils.escapeHtml(node.text)}</span>`;
    if (node.children && node.children.length > 0) {
      html += `<div class=\"mindmap-shadow-children\" style=\"margin-top:4px;\">${node.children.map((c,i,a)=>renderNode(c,level+1,i===a.length-1)).join('')}</div>`;
    }
    html += '</div>';
    return html;
  }

  // 入口：解析並渲染
  const tree = parseTree(md);
  const html = renderNode(tree);
  return html || '<div style=\"color:#94a3b8;opacity:0.5;\">暫無結構化內容</div>';
}

// 掛載到全域名稱空間
if (typeof window.ChatbotRenderingUtils === 'undefined') {
  window.ChatbotRenderingUtils = {};
}
window.ChatbotRenderingUtils.renderMindmapShadow = renderMindmapShadowInternal;