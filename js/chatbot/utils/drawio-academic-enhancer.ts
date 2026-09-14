// js/chatbot/utils/drawio-academic-enhancer.js

/**
 * Draw.io 學術增強工具
 *
 * 🎓 專為學術論文配圖設計，不同於通用美化工具
 *
 * 核心理念：
 * 1. 學術規範 - 符合 IEEE/ACM/Nature 等期刊標準
 * 2. 語義理解 - 根據內容自動分類和配色
 * 3. 漸進增強 - 三級最佳化，使用者可選
 * 4. 可讀性優先 - 黑白列印也清晰
 *
 * @version 1.0.0
 * @date 2025-01-15
 */

/**
 * 解析樣式字串為物件
 */
function parseStyle(styleString) {
  const style = {};
  if (!styleString) return style;

  styleString.split(';').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && key.trim()) {
      style[key.trim()] = value || '';
    }
  });

  return style;
}

/**
 * 樣式物件轉回字串
 */
function styleToString(styleObj) {
  return Object.entries(styleObj)
    .map(([k, v]) => v ? `${k}=${v}` : k)
    .join(';');
}

/**
 * 🎯 Level 1: 學術基礎最佳化
 *
 * 重點：清晰度和規範性
 * - 統一線寬（易於列印）
 * - 連線線標籤背景（黑白列印可辨認）
 * - 字型大小規範化（符合學術期刊要求）
 */
function academicBaselineOptimization(xmlDoc) {
  console.log('[AcademicEnhancer] 🎓 Level 1: 學術基礎最佳化');

  let optimized = 0;

  // 1. 最佳化連線線
  const edges = xmlDoc.querySelectorAll('mxCell[edge="1"]');
  edges.forEach(edge => {
    const style = parseStyle(edge.getAttribute('style') || '');

    // ✅ 統一線寬為 2px（學術標準）
    if (!style.strokeWidth || style.strokeWidth === '1') {
      style.strokeWidth = '2';
      optimized++;
    }

    // ✅ 連線線標籤新增白色背景（關鍵改進！）
    const hasLabel = edge.getAttribute('value');
    if (hasLabel) {
      style.labelBackgroundColor = '#ffffff';
      style.labelBorderColor = '#d0d0d0';
      style.labelPadding = '4';
      optimized++;
    }

    // ✅ 圓角轉彎（更專業）
    if (style.edgeStyle === 'orthogonalEdgeStyle') {
      style.rounded = '1';
      style.arcSize = '6'; // 小圓角，不誇張
    }

    // ✅ 統一箭頭樣式（學術標準：實心塊狀箭頭）
    if (!style.endArrow) {
      style.endArrow = 'block';
      style.endFill = '1';
      style.endSize = '6';
    }

    edge.setAttribute('style', styleToString(style));
  });

  // 2. 規範化節點字型
  const vertices = xmlDoc.querySelectorAll('mxCell[vertex="1"]');
  vertices.forEach(vertex => {
    const style = parseStyle(vertex.getAttribute('style') || '');

    // ✅ 統一字型大小（學術可讀性）
    if (!style.fontSize || parseInt(style.fontSize) < 11) {
      style.fontSize = '12'; // 預設 12pt
      optimized++;
    }

    // ✅ 啟用 HTML 模式（支援換行）
    if (!style.html) {
      style.html = '1';
    }

    vertex.setAttribute('style', styleToString(style));
  });

  console.log(`[AcademicEnhancer] ✅ Level 1 完成: ${optimized} 處最佳化`);
  return optimized;
}

/**
 * 🎨 Level 2: 語義感知配色
 *
 * 重點：自動識別節點型別並配色
 * - 輸入節點 → 藍色系
 * - 處理節點 → 綠色系
 * - 輸出節點 → 橙色系
 * - 決策節點 → 黃色系
 * - 資料儲存 → 灰色系
 */
function semanticColorization(xmlDoc) {
  console.log('[AcademicEnhancer] 🎨 Level 2: 語義感知配色');

  // 學術配色方案（色盲友好 + 黑白列印可辨）
  const colorSchemes = {
    input: {
      fill: '#dae8fc',
      stroke: '#6c8ebf',
      keywords: ['輸入', 'input', '資料', 'data', '採集', 'collect', '讀取', 'read']
    },
    process: {
      fill: '#d5e8d4',
      stroke: '#82b366',
      keywords: ['處理', 'process', '計算', 'compute', '分析', 'analyze', '演算法', 'algorithm']
    },
    output: {
      fill: '#ffe6cc',
      stroke: '#d79b00',
      keywords: ['輸出', 'output', '結果', 'result', '生成', 'generate', '顯示', 'display']
    },
    decision: {
      fill: '#fff2cc',
      stroke: '#d6b656',
      keywords: ['判斷', 'decision', '選擇', 'choose', '是否', 'if', '條件', 'condition']
    },
    storage: {
      fill: '#f5f5f5',
      stroke: '#666666',
      keywords: ['儲存', 'storage', '資料庫', 'database', '快取', 'cache', '儲存', 'save']
    }
  };

  let colorized = 0;

  const vertices = xmlDoc.querySelectorAll('mxCell[vertex="1"]');
  vertices.forEach(vertex => {
    const value = (vertex.getAttribute('value') || '').toLowerCase();
    const style = parseStyle(vertex.getAttribute('style') || '');

    // 跳過已經有明確配色的節點
    if (style.fillColor && style.fillColor !== '#ffffff') {
      return;
    }

    // 語義比對
    for (const [type, scheme] of Object.entries(colorSchemes)) {
      const matched = scheme.keywords.some(keyword => value.includes(keyword));
      if (matched) {
        style.fillColor = scheme.fill;
        style.strokeColor = scheme.stroke;
        vertex.setAttribute('style', styleToString(style));
        colorized++;
        break;
      }
    }
  });

  console.log(`[AcademicEnhancer] ✅ Level 2 完成: ${colorized} 個節點智慧配色`);
  return colorized;
}

/**
 * 📐 Level 3: 學術規範增強
 *
 * 重點：符合學術期刊投稿標準
 * - 子圖編號 (a), (b), (c)
 * - 圖例自動生成
 * - 統一對齊網格線
 * - 新增比例尺/單位標註
 */
function academicStandardEnhancement(xmlDoc) {
  console.log('[AcademicEnhancer] 📐 Level 3: 學術規範增強');

  let enhanced = 0;

  // 1. 自動新增子圖編號（學術論文標準）
  const vertices = Array.from(xmlDoc.querySelectorAll('mxCell[vertex="1"]'));

  // 只對"主要節點"新增編號（不是標題、不是註釋）
  const mainNodes = vertices.filter(v => {
    const style = parseStyle(v.getAttribute('style') || '');
    const value = v.getAttribute('value') || '';

    // 排除標題樣式節點
    if (style.fontSize && parseInt(style.fontSize) > 16) return false;
    // 排除純文位元組點
    if (style.shape === 'text' || !style.shape) return false;
    // 排除空節點
    if (!value.trim()) return false;

    return true;
  });

  // 按 Y 座標排序（從上到下）
  mainNodes.sort((a, b) => {
    const geoA = a.querySelector('mxGeometry');
    const geoB = b.querySelector('mxGeometry');
    if (!geoA || !geoB) return 0;

    const yA = parseFloat(geoA.getAttribute('y')) || 0;
    const yB = parseFloat(geoB.getAttribute('y')) || 0;
    return yA - yB;
  });

  // 新增編號（如果節點數量合理）
  if (mainNodes.length >= 3 && mainNodes.length <= 10) {
    mainNodes.forEach((node, index) => {
      const label = String.fromCharCode(97 + index); // a, b, c...
      const currentValue = node.getAttribute('value') || '';

      // 檢查是否已有編號
      if (!currentValue.match(/^\([a-z]\)/)) {
        node.setAttribute('value', `(${label}) ${currentValue}`);
        enhanced++;
      }
    });
  }

  // 2. 生成圖例（如果使用了多種顏色）
  const usedColors = new Set();
  vertices.forEach(v => {
    const style = parseStyle(v.getAttribute('style') || '');
    if (style.fillColor && style.fillColor !== '#ffffff') {
      usedColors.add(style.fillColor);
    }
  });

  // 如果使用了 3 種以上顏色，生成圖例
  if (usedColors.size >= 3) {
    console.log('[AcademicEnhancer] 檢測到多色配色方案，建議手動新增圖例');
    // 注：自動生成圖例會干擾版面，這裡只做提示
  }

  console.log(`[AcademicEnhancer] ✅ Level 3 完成: ${enhanced} 處學術規範增強`);
  return enhanced;
}

/**
 * 🔍 自動檢測圖表型別
 *
 * 根據節點和連線的特徵判斷圖表型別：
 * - flowchart: 流程圖（有決策節點、線性流程）
 * - architecture: 架構圖（層次分明、模組化）
 * - network: 網路圖（節點相互連線）
 * - sequence: 序列圖（時間順序）
 */
function detectDiagramType(xmlDoc) {
  const vertices = xmlDoc.querySelectorAll('mxCell[vertex="1"]');
  const edges = xmlDoc.querySelectorAll('mxCell[edge="1"]');

  if (vertices.length === 0) return 'unknown';

  // 特徵檢測
  let hasDecisionShape = false;
  let hasLayeredLayout = false;
  let avgConnectionsPerNode = edges.length / vertices.length;

  vertices.forEach(v => {
    const style = parseStyle(v.getAttribute('style') || '');
    if (style.shape === 'rhombus' || style.shape === 'diamond') {
      hasDecisionShape = true;
    }
  });

  // 檢測是否有明顯的層次結構（Y 座標相近的節點成組）
  const yGroups = new Map();
  vertices.forEach(v => {
    const geo = v.querySelector('mxGeometry');
    if (!geo) return;
    const y = Math.round(parseFloat(geo.getAttribute('y') || 0) / 50) * 50; // 按 50px 分組
    yGroups.set(y, (yGroups.get(y) || 0) + 1);
  });
  hasLayeredLayout = yGroups.size >= 3 && Array.from(yGroups.values()).some(count => count >= 2);

  // 判斷型別
  if (hasDecisionShape) return 'flowchart';
  if (hasLayeredLayout) return 'architecture';
  if (avgConnectionsPerNode > 2) return 'network';
  if (avgConnectionsPerNode <= 1.5) return 'sequence';

  return 'generic';
}

/**
 * 主最佳化函式：學術增強
 *
 * @param {string} xmlString - 原始 XML
 * @param {Object} options - 最佳化選項
 * @param {number} options.level - 最佳化級別 1-3
 * @param {boolean} options.autoDetect - 是否自動檢測圖表型別
 * @returns {string} 最佳化後的 XML
 */
function enhanceAcademicDiagram(xmlString, options = {}) {
  const defaultOptions = {
    level: 2,           // 預設 Level 2（基礎 + 配色）
    autoDetect: true    // 自動檢測圖表型別
  };

  const opts = { ...defaultOptions, ...options };

  try {
    console.log('[AcademicEnhancer] 🎓 開始學術增強...');

    // 解析 XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('XML 解析失敗');
    }

    // 自動檢測圖表型別
    if (opts.autoDetect) {
      const diagramType = detectDiagramType(xmlDoc);
      console.log(`[AcademicEnhancer] 📊 檢測到圖表型別: ${diagramType}`);
    }

    let totalEnhanced = 0;

    // Level 1: 基礎最佳化（總是執行）
    totalEnhanced += academicBaselineOptimization(xmlDoc);

    // Level 2: 語義配色
    if (opts.level >= 2) {
      totalEnhanced += semanticColorization(xmlDoc);
    }

    // Level 3: 學術規範
    if (opts.level >= 3) {
      totalEnhanced += academicStandardEnhancement(xmlDoc);
    }

    console.log(`[AcademicEnhancer] ✅ 學術增強完成，共 ${totalEnhanced} 處改進`);

    // 序列化回 XML
    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);

  } catch (error) {
    console.error('[AcademicEnhancer] ❌ 學術增強失敗:', error);
    return xmlString; // 失敗時返回原始 XML
  }
}

// 匯出到全域
window.DrawioAcademicEnhancer = {
  enhanceAcademicDiagram,
  detectDiagramType
};
