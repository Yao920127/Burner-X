// js/chatbot/utils/drawio-lite-parser.js

/**
 * DrawioLite DSL Parser
 * 將極簡文字語法轉換為 Draw.io mxGraph XML
 *
 * 支援功能：
 * - 基本節點和連線
 * - 分組/容器 (swimlane)
 * - 圖例 (legend)
 * - 並列子圖 (subgraph) - 複雜多圖支援
 * - 多頁圖表 (page) - 複雜多圖支援
 *
 * @version 1.1.0 - 支援複雜多圖
 * @date 2025-01-16
 */

/**
 * 顏色預設（學術標準）
 */
const COLOR_PRESETS = {
  gray: { fill: '#F7F9FC', stroke: '#2C3E50' },
  blue: { fill: '#dae8fc', stroke: '#3498DB' },
  lightblue: { fill: '#dae8fc', stroke: '#6c8ebf' },
  green: { fill: '#d5e8d4', stroke: '#82b366' },
  yellow: { fill: '#fff2cc', stroke: '#d6b656' },
  red: { fill: '#f8cecc', stroke: '#E74C3C' },
  orange: { fill: '#ffe6cc', stroke: '#d79b00' }
};

/**
 * 形狀預設
 */
const SHAPE_PRESETS = {
  rect: 'rounded=1;whiteSpace=wrap;html=1',
  ellipse: 'ellipse;whiteSpace=wrap;html=1',
  diamond: 'rhombus;whiteSpace=wrap;html=1',
  circle: 'ellipse;aspect=fixed;whiteSpace=wrap;html=1',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1'
};

/**
 * 解析 DrawioLite DSL
 * @param {string} dsl - DSL 文字
 * @returns {Object} { pages, hasMultiPage, nodes, edges, groups, subgraphs, legend }
 */
function parseDrawioLite(dsl) {
  // 邊界檢查
  if (!dsl || typeof dsl !== 'string') {
    console.warn('[DrawioLite] 解析失敗：輸入為空或非字串');
    return {
      pages: [],
      hasMultiPage: false,
      nodes: [],
      edges: [],
      groups: [],
      subgraphs: [],
      legend: []
    };
  }

  const lines = dsl.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  // 全域容器
  const result = {
    pages: [],
    hasMultiPage: false,
    nodes: [],
    edges: [],
    groups: [],
    subgraphs: [],
    legend: []
  };

  // 狀態追蹤
  let currentContext = result; // 當前上下文（全域、頁面、子圖）
  let inGroup = null;
  let inLegend = false;

  const contextStack = []; // 上下文堆疊
  const seenNodeIds = new Set(); // 節點 ID 去重

  for (let line of lines) {
    // 1. 多頁：page "標題" {
    const pageMatch = line.match(/^page\s+"([^"]+)"\s*\{/);
    if (pageMatch) {
      result.hasMultiPage = true;
      const page = {
        title: pageMatch[1],
        nodes: [],
        edges: [],
        groups: [],
        subgraphs: [],
        legend: []
      };
      result.pages.push(page);
      contextStack.push(currentContext);
      currentContext = page;
      seenNodeIds.clear(); // 重置節點 ID 追蹤（每個頁面有獨立的名稱空間）
      continue;
    }

    // 2. 子圖：subgraph ID "標題" {
    const subgraphMatch = line.match(/^subgraph\s+(\w+)\s+"([^"]+)"\s*\{/);
    if (subgraphMatch) {
      const [, id, title] = subgraphMatch;
      const subgraph = { id, title, nodes: [], edges: [] };
      currentContext.subgraphs.push(subgraph);
      contextStack.push(currentContext);
      currentContext = subgraph;
      continue;
    }

    // 3. 分組：group ID "標題" {
    const groupMatch = line.match(/^group\s+(\w+)\s+"([^"]+)"\s*\{/);
    if (groupMatch) {
      const [, id, title] = groupMatch;
      inGroup = { id, title, members: [] };
      continue;
    }

    // 4. 圖例：legend {
    if (line === 'legend {') {
      inLegend = true;
      continue;
    }

    // 5. 閉合：}
    if (line === '}') {
      if (inGroup) {
        currentContext.groups.push(inGroup);
        inGroup = null;
      } else if (inLegend) {
        inLegend = false;
      } else if (contextStack.length > 0) {
        currentContext = contextStack.pop();
      }
      continue;
    }

    // 6. 節點：node ID "文字" 形狀 [顏色]
    const nodeMatch = line.match(/^node\s+(\w+)\s+"([^"]*)"\s+(\w+)(?:\s+(\w+))?/);
    if (nodeMatch) {
      const [, id, label, shape, color = 'gray'] = nodeMatch;

      // 檢測 ID 重複
      if (seenNodeIds.has(id)) {
        console.warn(`[DrawioLite] 警告：節點 ID "${id}" 重複，可能導致連線錯誤`);
      }
      seenNodeIds.add(id);

      // 檢測空標籤
      if (!label || label.trim() === '') {
        console.warn(`[DrawioLite] 警告：節點 "${id}" 標籤為空`);
      }

      currentContext.nodes.push({ id, label: label || id, shape, color });
      continue;
    }

    // 7. 連線：A -> B ["標籤"]  或 S1.A -> S2.B "跨子圖"
    const edgeMatch = line.match(/^([\w.]+)\s*->\s*([\w.]+)(?:\s+"([^"]+)")?/);
    if (edgeMatch) {
      const [, from, to, label = ''] = edgeMatch;
      currentContext.edges.push({ from, to, label });
      continue;
    }

    // 8. 分組成員：A, B, C
    if (inGroup && line.match(/^[\w\s,]+$/)) {
      const members = line.split(',').map(m => m.trim()).filter(m => m);
      inGroup.members.push(...members);
      continue;
    }

    // 9. 圖例項：形狀 顏色 "說明"
    if (inLegend) {
      const legendMatch = line.match(/^(\w+)\s+(\w+)\s+"([^"]+)"/);
      if (legendMatch) {
        const [, shape, color, text] = legendMatch;
        currentContext.legend.push({ shape, color, text });
      }
      continue;
    }
  }

  return result;
}

/**
 * 生成單個圖表頁面的 XML
 */
function generatePageXml(pageData, pageId, cellIdStart) {
  const { nodes, edges, groups, subgraphs, legend } = pageData;
  let cellId = cellIdStart;
  const nodeIdMap = new Map();

  let xml = '';

  // 0. 預處理：識別哪些節點屬於 group
  const nodeToGroup = new Map(); // 節點ID -> group ID
  groups.forEach(group => {
    group.members.forEach(memberId => {
      nodeToGroup.set(memberId, group.id);
    });
  });

  // 1. 處理子圖（並列版面）
  if (subgraphs.length > 0) {
    let offsetX = 50;
    subgraphs.forEach(subgraph => {
      // 子圖容器
      const containerCellId = cellId++;
      xml += `        <mxCell id="${containerCellId}" value="${escapeXml(subgraph.title)}" style="swimlane;fontStyle=1;align=center;verticalAlign=top;startSize=30;fillColor=#F7F9FC;strokeColor=#2C3E50;fontSize=14;fontFamily=Arial;" vertex="1" parent="${pageId}">
          <mxGeometry x="${offsetX}" y="50" width="300" height="400" as="geometry"/>
        </mxCell>
`;

      // 子圖內的節點
      let nodeY = 80;
      subgraph.nodes.forEach(node => {
        const { id, label, shape, color } = node;

        // 顏色 fallback 檢查
        if (!COLOR_PRESETS[color]) {
          console.warn(`[DrawioLite] 未知顏色 "${color}"，使用預設 gray`);
        }
        const colors = COLOR_PRESETS[color] || COLOR_PRESETS.gray;

        // 形狀 fallback 檢查
        if (!SHAPE_PRESETS[shape]) {
          console.warn(`[DrawioLite] 未知形狀 "${shape}"，使用預設 rect`);
        }
        const shapeStyle = SHAPE_PRESETS[shape] || SHAPE_PRESETS.rect;

        const style = `${shapeStyle};fillColor=${colors.fill};strokeColor=${colors.stroke};strokeWidth=2;fontSize=12;fontFamily=Arial;`;

        const mxCellId = cellId++;
        nodeIdMap.set(`${subgraph.id}.${id}`, mxCellId);
        nodeIdMap.set(id, mxCellId); // 也支援簡寫

        const width = shape === 'diamond' ? 140 : 120;
        const height = shape === 'diamond' ? 100 : 60;

        xml += `        <mxCell id="${mxCellId}" value="${escapeXml(label)}" style="${style}" vertex="1" parent="${containerCellId}">
          <mxGeometry x="80" y="${nodeY}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>
`;
        nodeY += height + 60;
      });

      // 子圖內的連線
      subgraph.edges.forEach(edge => {
        const { from, to, label } = edge;
        const sourceId = nodeIdMap.get(from) || nodeIdMap.get(`${subgraph.id}.${from}`);
        const targetId = nodeIdMap.get(to) || nodeIdMap.get(`${subgraph.id}.${to}`);

        if (!sourceId || !targetId) {
          console.warn(`[DrawioLite] 跳過無效連線: ${from} -> ${to}`);
          return;
        }

        const mxCellId = cellId++;
        const style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#2C3E50;strokeWidth=2;fontSize=10;fontFamily=Arial;endArrow=classicBlock;';

        xml += `        <mxCell id="${mxCellId}" value="${escapeXml(label)}" style="${style}" edge="1" parent="${pageId}" source="${sourceId}" target="${targetId}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
`;
      });

      offsetX += 350; // 下一個子圖的橫向偏移
    });
  } else {
    // 2. 普通節點（無子圖）- 使用改進的初始版面

    // 2.1 先建立 group 容器（如果有）
    const groupContainers = new Map(); // group ID -> 容器 mxCell ID
    groups.forEach(group => {
      const containerCellId = cellId++;
      groupContainers.set(group.id, containerCellId);

      // 建立 group 容器（初始尺寸，後面會調整）
      xml += `        <mxCell id="${containerCellId}" value="${escapeXml(group.title)}" style="swimlane;fontStyle=0;align=center;verticalAlign=top;startSize=30;fillColor=#F7F9FC;strokeColor=#2C3E50;fontSize=12;fontFamily=Arial;" vertex="1" parent="${pageId}">
          <mxGeometry x="50" y="50" width="400" height="300" as="geometry"/>
        </mxCell>
`;
    });

    // 2.2 渲染節點
    let nodeX = 80;  // 初始 X 座標
    let nodeY = 80;  // 初始 Y 座標
    const columnWidth = 200;  // 每列的寬度
    const rowHeight = 140;    // 每行的高度
    const nodesPerRow = 4;    // 每行最多節點數

    // 按 group 分組節點
    const groupedNodes = new Map(); // group ID -> nodes[]
    const ungroupedNodes = [];

    nodes.forEach(node => {
      const groupId = nodeToGroup.get(node.id);
      if (groupId) {
        if (!groupedNodes.has(groupId)) {
          groupedNodes.set(groupId, []);
        }
        groupedNodes.get(groupId).push(node);
      } else {
        ungroupedNodes.push(node);
      }
    });

    // 2.3 渲染不屬於 group 的節點
    ungroupedNodes.forEach((node, index) => {
      const { id, label, shape, color } = node;

      // 顏色 fallback 檢查
      if (!COLOR_PRESETS[color]) {
        console.warn(`[DrawioLite] 未知顏色 "${color}"，使用預設 gray`);
      }
      const colors = COLOR_PRESETS[color] || COLOR_PRESETS.gray;

      // 形狀 fallback 檢查
      if (!SHAPE_PRESETS[shape]) {
        console.warn(`[DrawioLite] 未知形狀 "${shape}"，使用預設 rect`);
      }
      const shapeStyle = SHAPE_PRESETS[shape] || SHAPE_PRESETS.rect;

      const style = `${shapeStyle};fillColor=${colors.fill};strokeColor=${colors.stroke};strokeWidth=2;fontSize=12;fontFamily=Arial;`;

      const mxCellId = cellId++;
      nodeIdMap.set(id, mxCellId);

      const width = shape === 'diamond' ? 140 : 120;
      const height = shape === 'diamond' ? 100 : 60;

      // 計算當前節點的位置（網格版面）
      const row = Math.floor(index / nodesPerRow);
      const col = index % nodesPerRow;
      const x = nodeX + col * columnWidth;
      const y = nodeY + row * rowHeight;

      xml += `        <mxCell id="${mxCellId}" value="${escapeXml(label)}" style="${style}" vertex="1" parent="${pageId}">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>
`;
    });

    // 2.4 渲染屬於 group 的節點（相對於容器座標）
    groups.forEach(group => {
      const groupNodes = groupedNodes.get(group.id) || [];
      const containerCellId = groupContainers.get(group.id);

      let groupNodeY = 60; // 起始Y（容器內相對座標，標題下方）

      groupNodes.forEach(node => {
        const { id, label, shape, color } = node;

        // 顏色 fallback 檢查
        if (!COLOR_PRESETS[color]) {
          console.warn(`[DrawioLite] 未知顏色 "${color}"，使用預設 gray`);
        }
        const colors = COLOR_PRESETS[color] || COLOR_PRESETS.gray;

        // 形狀 fallback 檢查
        if (!SHAPE_PRESETS[shape]) {
          console.warn(`[DrawioLite] 未知形狀 "${shape}"，使用預設 rect`);
        }
        const shapeStyle = SHAPE_PRESETS[shape] || SHAPE_PRESETS.rect;

        const style = `${shapeStyle};fillColor=${colors.fill};strokeColor=${colors.stroke};strokeWidth=2;fontSize=12;fontFamily=Arial;`;

        const mxCellId = cellId++;
        nodeIdMap.set(id, mxCellId);

        const width = shape === 'diamond' ? 140 : 120;
        const height = shape === 'diamond' ? 100 : 60;

        xml += `        <mxCell id="${mxCellId}" value="${escapeXml(label)}" style="${style}" vertex="1" parent="${containerCellId}">
          <mxGeometry x="80" y="${groupNodeY}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>
`;
        groupNodeY += height + 60;
      });
    });

    // 3. 連線（包括跨子圖連線）
    edges.forEach(edge => {
      const { from, to, label } = edge;
      const sourceId = nodeIdMap.get(from);
      const targetId = nodeIdMap.get(to);

      if (!sourceId || !targetId) {
        console.warn(`[DrawioLite] 跳過無效連線: ${from} -> ${to}`);
        return;
      }

      const mxCellId = cellId++;
      const style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#2C3E50;strokeWidth=2;fontSize=10;fontFamily=Arial;endArrow=classicBlock;';

      xml += `        <mxCell id="${mxCellId}" value="${escapeXml(label)}" style="${style}" edge="1" parent="${pageId}" source="${sourceId}" target="${targetId}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
`;
    });
  }

  // 4. 圖例 - 動態計算位置避免重疊
  if (legend.length > 0) {
    // 估算圖表的最大範圍
    let maxX = 0;

    if (subgraphs.length > 0) {
      // 有子圖：每個子圖寬度約350px
      maxX = 100 + subgraphs.length * 350;
    } else {
      // 網格版面：4列 * 200px列寬 + 節點寬度 + 起始X
      const numNodes = nodes.length;
      const nodesPerRow = 4;
      const columnWidth = 200;
      const maxNodeWidth = 140; // diamond 最寬
      maxX = 80 + Math.min(numNodes, nodesPerRow) * columnWidth + maxNodeWidth;
    }

    // 圖例放在圖表右側，留100px間距
    const legendX = maxX + 100;
    const legendY = 80; // 與節點起始Y對齊

    legend.forEach((item, index) => {
      const { shape, color, text } = item;

      // 圖例項驗證
      if (!COLOR_PRESETS[color]) {
        console.warn(`[DrawioLite] 圖例中未知顏色 "${color}"，使用預設 gray`);
      }
      if (!SHAPE_PRESETS[shape]) {
        console.warn(`[DrawioLite] 圖例中未知形狀 "${shape}"，使用預設 rect`);
      }

      const colors = COLOR_PRESETS[color] || COLOR_PRESETS.gray;
      const shapeStyle = SHAPE_PRESETS[shape] || SHAPE_PRESETS.rect;
      const yOffset = index * 40;

      const shapeCellId = cellId++;
      xml += `        <mxCell id="${shapeCellId}" value="" style="${shapeStyle};fillColor=${colors.fill};strokeColor=${colors.stroke};strokeWidth=2;" vertex="1" parent="${pageId}">
          <mxGeometry x="${legendX}" y="${legendY + yOffset}" width="30" height="30" as="geometry"/>
        </mxCell>
`;

      const textCellId = cellId++;
      xml += `        <mxCell id="${textCellId}" value="${escapeXml(text)}" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=10;fontFamily=Arial;" vertex="1" parent="${pageId}">
          <mxGeometry x="${legendX + 40}" y="${legendY + yOffset}" width="150" height="30" as="geometry"/>
        </mxCell>
`;
    });
  }

  return { xml, nextCellId: cellId };
}

/**
 * 將 DrawioLite AST 轉換為 Draw.io XML
 */
function drawioLiteToXml(ast) {
  const { pages, hasMultiPage } = ast;

  let xml = '<mxfile>\n';
  let cellId = 2;

  if (hasMultiPage && pages.length > 0) {
    // 多頁模式
    pages.forEach((page, index) => {
      const pageId = `page-${index + 1}`;
      xml += `  <diagram id="${pageId}" name="${escapeXml(page.title)}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
`;
      const result = generatePageXml(page, '1', cellId);
      xml += result.xml;
      cellId = result.nextCellId;

      xml += `      </root>
    </mxGraphModel>
  </diagram>
`;
    });
  } else {
    // 單頁模式
    xml += `  <diagram id="drawio-lite-diagram" name="Page-1">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
`;
    const result = generatePageXml(ast, '1', cellId);
    xml += result.xml;

    xml += `      </root>
    </mxGraphModel>
  </diagram>
`;
  }

  xml += '</mxfile>';
  return xml;
}

/**
 * XML 特殊字元轉義
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 驗證 AST 的有效性
 * @param {Object} ast - 解析後的抽象語法樹
 * @returns {Object} { valid: boolean, warnings: string[] }
 */
function validateAST(ast) {
  const warnings = [];

  // 檢查是否有內容（包括多頁圖表）
  let totalNodes = ast.nodes.length + ast.subgraphs.reduce((sum, sg) => sum + sg.nodes.length, 0);
  let totalEdges = ast.edges.length + ast.subgraphs.reduce((sum, sg) => sum + sg.edges.length, 0);

  // 如果是多頁圖表，統計所有頁面的節點和邊
  if (ast.hasMultiPage && ast.pages) {
    ast.pages.forEach(page => {
      totalNodes += page.nodes.length + page.subgraphs.reduce((sum, sg) => sum + sg.nodes.length, 0);
      totalEdges += page.edges.length + page.subgraphs.reduce((sum, sg) => sum + sg.edges.length, 0);
    });
  }

  if (totalNodes === 0) {
    warnings.push('圖表中沒有節點');
  }

  if (totalEdges === 0 && totalNodes > 1) {
    warnings.push('圖表中沒有連線線，節點可能孤立');
  }

  // 檢查連線密度（對多頁圖表放寬要求）
  if (totalNodes > 0) {
    const ratio = totalEdges / totalNodes;
    const threshold = ast.hasMultiPage ? 0.1 : 0.3; // 多頁圖表連線密度要求更低
    if (ratio < threshold) {
      warnings.push(`連線密度過低 (${ratio.toFixed(2)})，建議增加連線`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * 主轉換函式：DrawioLite → Draw.io XML（帶自動版面）
 */
function convertDrawioLite(dslText) {
  try {
    console.log('[DrawioLite] 🎯 開始解析 DSL...');

    const ast = parseDrawioLite(dslText);
    console.log('[DrawioLite] ✅ 解析完成:', ast);

    // 驗證 AST
    const validation = validateAST(ast);
    if (validation.warnings.length > 0) {
      console.warn('[DrawioLite] ⚠️ 發現問題:', validation.warnings.join('; '));
    }

    let xml = drawioLiteToXml(ast);
    console.log('[DrawioLite] ✅ XML 生成完成');

    // 應用 Dagre 自動版面（現已支援多頁圖表）
    if (window.DrawioLayoutOptimizer) {
      console.log('[DrawioLite] 🎨 應用自動版面最佳化（多頁支援）...');
      xml = window.DrawioLayoutOptimizer.optimizeDrawioLayout(xml, {
        dagreLayout: true,     // 使用 Dagre 演算法
        gridAlignment: true,   // 網格對齊
        connections: true,     // 連線最佳化
        spacing: false,        // 禁用間距最佳化（Dagre 已處理）
        styles: false,         // 保留 DSL 定義的顏色
        layoutDirection: 'TB'  // 使用 TB（從上到下）版面，更緊湊
      });
      console.log('[DrawioLite] ✅ 版面最佳化完成');
    } else {
      console.warn('[DrawioLite] ⚠️ DrawioLayoutOptimizer 未載入，跳過版面最佳化');
    }

    return xml;

  } catch (error) {
    console.error('[DrawioLite] ❌ 轉換失敗:', error);
    throw error;
  }
}

// 匯出到全域
window.DrawioLiteParser = {
  parseDrawioLite,
  drawioLiteToXml,
  convertDrawioLite
};

console.log('[DrawioLite] ✅ Parser 已載入（v1.1.0 - 支援複雜多圖）');
