// js/chatbot/utils/drawio-layout-optimizer.js

/**
 * Draw.io XML 版面最佳化工具
 *
 * 參考 smart-drawio-next 的最佳化思路，針對 draw.io XML 格式設計
 * 主要最佳化：
 * 0. Dagre 版面 - 使用標準 Sugiyama 演算法進行層次化版面（推薦，顯著減少交叉）
 * 1. 網格對齊 - 確保所有座標對齊到網格
 * 2. 自動間距 - 避免節點重疊和擁擠，考慮連線關係智慧排列
 * 3. 避免穿透 - 檢測連線是否穿過節點，調整節點位置避讓
 * 4. 智慧連線 - 最佳化箭頭的出入點位置，移除錯誤的 mxPoint 子元素
 * 5. 連線理線 - 檢測交叉並透過調整節點位置減少交叉
 * 6. 樣式統一 - 統一相同型別元素的樣式
 *
 * @version 1.3.0 - 整合 Dagre.js 標準版面演算法
 * @date 2025-01-16
 */

/**
 * 從 XML 字串解析出 mxCell 節點
 * @param {string} xmlString - draw.io XML 字串
 * @returns {Document} 解析後的 XML 文件物件
 */
function parseDrawioXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // 檢查解析錯誤
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML 解析失敗: ' + parserError.textContent);
  }

  return xmlDoc;
}

/**
 * 將 XML 文件序列化回字串
 * @param {Document} xmlDoc - XML 文件物件
 * @returns {string} XML 字串
 */
function serializeDrawioXml(xmlDoc) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

/**
 * 獲取節點的幾何資訊
 * @param {Element} cell - mxCell 元素
 * @returns {Object|null} {x, y, width, height} 或 null
 */
function getCellGeometry(cell) {
  const geometry = cell.querySelector('mxGeometry');
  if (!geometry) return null;

  return {
    x: parseFloat(geometry.getAttribute('x')) || 0,
    y: parseFloat(geometry.getAttribute('y')) || 0,
    width: parseFloat(geometry.getAttribute('width')) || 100,
    height: parseFloat(geometry.getAttribute('height')) || 100
  };
}

/**
 * 設定節點的幾何資訊
 * @param {Element} cell - mxCell 元素
 * @param {Object} geometry - {x, y, width, height}
 */
function setCellGeometry(cell, geometry) {
  let geometryElem = cell.querySelector('mxGeometry');
  if (!geometryElem) {
    geometryElem = cell.ownerDocument.createElement('mxGeometry');
    geometryElem.setAttribute('as', 'geometry');
    cell.appendChild(geometryElem);
  }

  if (geometry.x !== undefined) geometryElem.setAttribute('x', geometry.x);
  if (geometry.y !== undefined) geometryElem.setAttribute('y', geometry.y);
  if (geometry.width !== undefined) geometryElem.setAttribute('width', geometry.width);
  if (geometry.height !== undefined) geometryElem.setAttribute('height', geometry.height);
}

/**
 * 網格對齊最佳化
 * 確保所有座標都對齊到網格（預設 10px）
 *
 * @param {Document} xmlDoc - XML 文件物件
 * @param {number} gridSize - 網格大小，預設 10
 */
function optimizeGridAlignment(xmlDoc, gridSize = 10) {
  const cells = xmlDoc.querySelectorAll('mxCell[vertex="1"]');
  let optimizedCount = 0;

  cells.forEach(cell => {
    const geometry = getCellGeometry(cell);
    if (!geometry) return;

    // 對齊到網格
    const alignedX = Math.round(geometry.x / gridSize) * gridSize;
    const alignedY = Math.round(geometry.y / gridSize) * gridSize;

    if (alignedX !== geometry.x || alignedY !== geometry.y) {
      setCellGeometry(cell, {
        x: alignedX,
        y: alignedY,
        width: geometry.width,
        height: geometry.height
      });
      optimizedCount++;
    }
  });

  console.log(`[DrawioOptimizer] 網格對齊: ${optimizedCount} 個節點已最佳化`);
  return optimizedCount;
}

/**
 * 檢測節點重疊
 * @param {Object} rect1 - {x, y, width, height}
 * @param {Object} rect2 - {x, y, width, height}
 * @param {number} minSpacing - 最小間距
 * @returns {boolean} 是否重疊或過近
 */
function isOverlapping(rect1, rect2, minSpacing = 20) {
  return !(
    rect1.x + rect1.width + minSpacing < rect2.x ||
    rect2.x + rect2.width + minSpacing < rect1.x ||
    rect1.y + rect1.height + minSpacing < rect2.y ||
    rect2.y + rect2.height + minSpacing < rect1.y
  );
}

/**
 * 使用 Dagre 演算法進行層次化版面（Sugiyama 演算法）
 * 這是圖版面的標準演算法，能顯著減少連線交叉
 *
 * @param {Document} xmlDoc - XML 文件物件
 * @param {Object} options - 版面選項
 * @returns {number} 調整的節點數量
 */
function applyDagreLayout(xmlDoc, options = {}) {
  // 檢查 dagre 和 graphlib 是否可用（它們是兩個獨立的全域變數）
  if (typeof window.dagre === 'undefined') {
    console.warn('[DrawioOptimizer] ❌ Dagre 庫未載入，跳過 Dagre 版面');
    return 0;
  }
  if (typeof window.graphlib === 'undefined') {
    console.warn('[DrawioOptimizer] ❌ Graphlib 庫未載入，跳過 Dagre 版面');
    return 0;
  }

  console.log('[DrawioOptimizer] 🎯 應用 Dagre 層次化版面演算法 (LR 模式)...');

  const defaultOptions = {
    rankdir: 'LR',      // 方向：LR (從左到右) - 層級橫向展開，同層節點縱向排列
    nodesep: 100,       // 同層節點間距（LR模式下是垂直間距）- 增加以減少交叉
    ranksep: 180,       // 不同層間距（LR模式下是水平間距）- 增加以減少交叉
    edgesep: 20,        // 邊之間的間距
    ranker: 'network-simplex',  // 使用 network-simplex 演算法（最佳層分配）
    marginx: 20,        // 水平邊距
    marginy: 20         // 垂直邊距
  };

  const opts = { ...defaultOptions, ...options };

  try {
    const allCells = Array.from(xmlDoc.querySelectorAll('mxCell[vertex="1"]'));
    const allEdges = Array.from(xmlDoc.querySelectorAll('mxCell[edge="1"]'));
    const cellMap = new Map();

    // 構建 ID -> Cell 對映
    xmlDoc.querySelectorAll('mxCell[id]').forEach(cell => {
      cellMap.set(cell.getAttribute('id'), cell);
    });

    let adjustedCount = 0;

    // 1. 識別 subgraph 容器（swimlane）和頂層節點
    const subgraphContainers = [];
    const topLevelCells = [];
    const subgraphMembers = new Set(); // 記錄 subgraph 內部節點

    allCells.forEach(cell => {
      const style = cell.getAttribute('style') || '';
      const parent = cell.getAttribute('parent');

      if (style.includes('swimlane')) {
        // 這是一個 subgraph 容器
        subgraphContainers.push(cell);
      } else {
        // 檢查是否是 subgraph 內部節點
        const parentCell = cellMap.get(parent);
        if (parentCell && (parentCell.getAttribute('style') || '').includes('swimlane')) {
          // 這是 subgraph 內部的節點
          subgraphMembers.add(cell.getAttribute('id'));
        } else {
          // 這是頂層節點
          topLevelCells.push(cell);
        }
      }
    });

    console.log(`[DrawioOptimizer] 📊 發現 ${subgraphContainers.length} 個子圖, ${topLevelCells.length} 個頂層節點`);

    // 2. 對每個 subgraph 內部單獨進行 Dagre 版面
    subgraphContainers.forEach(container => {
      const containerId = container.getAttribute('id');
      const containerGeo = getCellGeometry(container);
      if (!containerGeo) return;

      // 找出屬於這個 subgraph 的所有節點
      const members = allCells.filter(cell =>
        cell.getAttribute('parent') === containerId
      );

      if (members.length === 0) return;

      console.log(`[DrawioOptimizer]   🔹 子圖 "${containerId}" 內部版面 (${members.length} 個節點)...`);

      // 建立子圖的 Dagre 圖
      const subG = new graphlib.Graph();
      subG.setGraph({
        ...opts,
        marginx: 20,
        marginy: 30  // 頂部留空間給 swimlane 標題
      });
      subG.setDefaultEdgeLabel(() => ({}));

      // 新增成員節點
      members.forEach(cell => {
        const id = cell.getAttribute('id');
        const geo = getCellGeometry(cell);
        if (!geo) return;

        subG.setNode(id, {
          width: geo.width,
          height: geo.height,
          originalGeo: geo,
          cell: cell
        });
      });

      // 新增子圖內部的邊
      allEdges.forEach(edge => {
        const source = edge.getAttribute('source');
        const target = edge.getAttribute('target');
        if (source && target && subG.hasNode(source) && subG.hasNode(target)) {
          subG.setEdge(source, target);
        }
      });

      // 執行子圖版面
      dagre.layout(subG);

      // 應用版面結果（相對於 subgraph 容器的座標）
      // 先收集所有節點的原始座標
      const nodePositions = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      subG.nodes().forEach(nodeId => {
        const node = subG.node(nodeId);
        if (!node) return;

        const { cell, width, height } = node;
        const rawX = Math.round(node.x - width / 2);
        const rawY = Math.round(node.y - height / 2);

        nodePositions.push({ cell, width, height, rawX, rawY });

        minX = Math.min(minX, rawX);
        minY = Math.min(minY, rawY);
        maxX = Math.max(maxX, rawX + width);
        maxY = Math.max(maxY, rawY + height);
      });

      console.log(`[DrawioOptimizer]     📍 原始節點範圍: (${minX}, ${minY}) 到 (${maxX}, ${maxY})`);

      // 計算需要的偏移量，確保節點在容器內正確位置
      // swimlane 標題高度是 30px，左邊距至少 20px
      const targetMinX = 20;  // 左邊距
      const targetMinY = 40;  // 標題欄30px + 頂部邊距10px

      // 只在節點座標異常時才應用偏移量
      // 如果節點已經在合理位置（正數且接近目標），保持原位
      let offsetX = 0;
      let offsetY = 0;

      // 只在節點出現負座標或嚴重偏移時才修正
      if (minX < 0) {
        offsetX = targetMinX - minX;  // 修正負座標
      } else if (minX < 10) {
        offsetX = targetMinX - minX;  // 太靠近邊緣，加點邊距
      }

      if (minY < 0) {
        offsetY = targetMinY - minY;  // 修正負座標
      } else if (minY < 30) {
        offsetY = targetMinY - minY;  // 太靠近標題欄，加點邊距
      }

      console.log(`[DrawioOptimizer]     📐 應用偏移量: (${offsetX}, ${offsetY}) ${offsetX === 0 && offsetY === 0 ? '(無需調整)' : ''}`);

      // 應用偏移後的座標
      let finalMinX = Infinity, finalMinY = Infinity, finalMaxX = -Infinity, finalMaxY = -Infinity;

      nodePositions.forEach(({ cell, width, height, rawX, rawY }) => {
        const finalX = rawX + offsetX;
        const finalY = rawY + offsetY;

        finalMinX = Math.min(finalMinX, finalX);
        finalMinY = Math.min(finalMinY, finalY);
        finalMaxX = Math.max(finalMaxX, finalX + width);
        finalMaxY = Math.max(finalMaxY, finalY + height);

        setCellGeometry(cell, {
          x: finalX,
          y: finalY,
          width: width,
          height: height
        });

        adjustedCount++;
      });

      console.log(`[DrawioOptimizer]     ✅ 最終節點範圍: (${finalMinX}, ${finalMinY}) 到 (${finalMaxX}, ${finalMaxY})`);

      // 調整 subgraph 容器大小以包含所有成員
      if (finalMinX !== Infinity && finalMinY !== Infinity) {
        // 容器需要的尺寸 = 節點最大範圍 + 底部/右側邊距
        const requiredWidth = Math.ceil(finalMaxX + 20);   // 右側留20px邊距
        const requiredHeight = Math.ceil(finalMaxY + 20);  // 底部留20px邊距

        setCellGeometry(container, {
          x: containerGeo.x,
          y: containerGeo.y,
          width: Math.max(requiredWidth, 300),   // 最小300px
          height: Math.max(requiredHeight, 200)  // 最小200px
        });

        console.log(`[DrawioOptimizer]     📏 容器調整: ${requiredWidth}x${requiredHeight}`);
      }
    });

    // 3. 對頂層節點 + subgraph 容器進行全域 Dagre 版面
    if (topLevelCells.length > 0 || subgraphContainers.length > 0) {
      console.log(`[DrawioOptimizer] 🌍 全域版面 (${topLevelCells.length + subgraphContainers.length} 個頂層元素)...`);

      const g = new graphlib.Graph();
      g.setGraph(opts);
      g.setDefaultEdgeLabel(() => ({}));

      // 新增頂層節點和 subgraph 容器
      [...topLevelCells, ...subgraphContainers].forEach(cell => {
        const id = cell.getAttribute('id');
        const geo = getCellGeometry(cell);
        if (!geo) return;

        g.setNode(id, {
          width: geo.width,
          height: geo.height,
          originalGeo: geo,
          cell: cell
        });
      });

      // 新增頂層的邊（不包括 subgraph 內部的邊）
      allEdges.forEach(edge => {
        const source = edge.getAttribute('source');
        const target = edge.getAttribute('target');

        // 只新增至少有一端是頂層節點的邊
        if (source && target && g.hasNode(source) && g.hasNode(target)) {
          g.setEdge(source, target);
        }
      });

      // 執行全域版面
      dagre.layout(g);

      // 應用全域版面結果
      g.nodes().forEach(nodeId => {
        const node = g.node(nodeId);
        if (!node) return;

        const { cell, width, height } = node;
        const newX = Math.round(node.x - width / 2);
        const newY = Math.round(node.y - height / 2);

        const geo = getCellGeometry(cell);
        if (!geo) return;

        // 直接設定容器位置
        // 注意：subgraph 容器內的節點座標是相對的，容器移動時會自動跟隨，不需要單獨調整
        setCellGeometry(cell, {
          x: newX,
          y: newY,
          width: width,
          height: height
        });

        adjustedCount++;
      });
    }

    console.log(`[DrawioOptimizer] ✅ Dagre 版面完成: ${adjustedCount} 個節點已最佳化`);
    return adjustedCount;

  } catch (error) {
    console.error('[DrawioOptimizer] ❌ Dagre 版面失敗:', error);
    return 0;
  }
}

/**
 * 自動間距最佳化（增強版 - 考慮連線關係）
 * 檢測並修復節點重疊問題，同時儘量減少連線交叉
 *
 * @param {Document} xmlDoc - XML 文件物件
 * @param {number} minSpacing - 最小間距，預設 30px
 */
function optimizeSpacing(xmlDoc, minSpacing = 30) {
  const cells = Array.from(xmlDoc.querySelectorAll('mxCell[vertex="1"]'));
  const geometries = cells.map(cell => ({
    cell,
    id: cell.getAttribute('id'),
    ...getCellGeometry(cell)
  })).filter(g => g.x !== undefined);

  // 構建連線關係圖
  const edges = xmlDoc.querySelectorAll('mxCell[edge="1"]');
  const connections = new Map(); // nodeId -> [targetIds]

  edges.forEach(edge => {
    const sourceId = edge.getAttribute('source');
    const targetId = edge.getAttribute('target');
    if (sourceId && targetId) {
      if (!connections.has(sourceId)) {
        connections.set(sourceId, []);
      }
      connections.get(sourceId).push(targetId);
    }
  });

  let adjustedCount = 0;

  // 按 Y 座標分層
  const layers = new Map();
  geometries.forEach(g => {
    const layerY = Math.round(g.y / 50) * 50; // 按 50px 分層
    if (!layers.has(layerY)) {
      layers.set(layerY, []);
    }
    layers.get(layerY).push(g);
  });

  // 對每一層進行排序最佳化，減少交叉
  layers.forEach((nodesInLayer, layerY) => {
    if (nodesInLayer.length <= 1) return;

    // 按連線關係排序：如果節點有共同的目標，應該相鄰放置
    nodesInLayer.sort((a, b) => {
      const aTargets = connections.get(a.id) || [];
      const bTargets = connections.get(b.id) || [];

      // 如果有共同目標，按第一個目標的 X 座標排序
      if (aTargets.length > 0 && bTargets.length > 0) {
        // 簡化：按第一個目標的 ID 字母序排序
        return aTargets[0].localeCompare(bTargets[0]);
      }

      // 否則按當前 X 座標排序
      return a.x - b.x;
    });

    // 重新分配 X 座標，保持間距
    let currentX = nodesInLayer[0].x;
    nodesInLayer.forEach((g, index) => {
      if (index > 0) {
        currentX += nodesInLayer[index - 1].width + minSpacing;
      }

      if (Math.abs(g.x - currentX) > 5) {
        setCellGeometry(g.cell, {
          x: currentX,
          y: g.y,
          width: g.width,
          height: g.height
        });
        adjustedCount++;
      }

      g.x = currentX;
    });
  });

  // 傳統的重疊檢測（跨層）
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      const g1 = geometries[i];
      const g2 = geometries[j];

      // 如果在不同層，跳過（已經在上面處理了）
      const layer1 = Math.round(g1.y / 50) * 50;
      const layer2 = Math.round(g2.y / 50) * 50;
      if (layer1 === layer2) continue;

      if (isOverlapping(g1, g2, minSpacing)) {
        // 橫向推開第二個節點
        const newX = g1.x + g1.width + minSpacing;
        setCellGeometry(g2.cell, {
          x: newX,
          y: g2.y,
          width: g2.width,
          height: g2.height
        });
        g2.x = newX; // 更新快取
        adjustedCount++;
      }
    }
  }

  console.log(`[DrawioOptimizer] 間距最佳化: ${adjustedCount} 個節點已調整`);
  return adjustedCount;
}

/**
 * 計算兩個節點的最佳連線邊緣
 * 根據相對位置判斷應該從哪條邊連線
 *
 * 對於 LR 版面（從左到右）：強制從左右邊連線，不使用上下邊
 *
 * @param {Object} sourceGeometry - 源節點幾何資訊
 * @param {Object} targetGeometry - 目標節點幾何資訊
 * @param {string} layoutDirection - 版面方向：'LR' 或 'TB'，預設 'LR'
 * @returns {Object} {exitX, exitY, entryX, entryY} - 歸一化座標 (0-1)
 */
function calculateOptimalConnection(sourceGeometry, targetGeometry, layoutDirection = 'LR') {
  if (!sourceGeometry || !targetGeometry) {
    return { exitX: 0.5, exitY: 0.5, entryX: 0.5, entryY: 0.5 };
  }

  // 計算中心點
  const sourceCenterX = sourceGeometry.x + sourceGeometry.width / 2;
  const sourceCenterY = sourceGeometry.y + sourceGeometry.height / 2;
  const targetCenterX = targetGeometry.x + targetGeometry.width / 2;
  const targetCenterY = targetGeometry.y + targetGeometry.height / 2;

  // 計算相對位置
  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;

  let exitX = 0.5, exitY = 0.5, entryX = 0.5, entryY = 0.5;

  if (layoutDirection === 'LR') {
    // LR 版面：強制使用左右邊連線
    if (dx > 0) {
      // 目標在右側 - 標準流向
      exitX = 1; exitY = 0.5;   // 從右邊出發
      entryX = 0; entryY = 0.5; // 從左邊進入
    } else {
      // 目標在左側 - 反向連線
      exitX = 0; exitY = 0.5;   // 從左邊出發
      entryX = 1; entryY = 0.5; // 從右邊進入
    }
  } else {
    // TB 版面：根據相對位置自動選擇
    const isHorizontal = Math.abs(dx) > Math.abs(dy);

    if (isHorizontal) {
      if (dx > 0) {
        exitX = 1; exitY = 0.5;
        entryX = 0; entryY = 0.5;
      } else {
        exitX = 0; exitY = 0.5;
        entryX = 1; entryY = 0.5;
      }
    } else {
      if (dy > 0) {
        exitX = 0.5; exitY = 1;
        entryX = 0.5; entryY = 0;
      } else {
        exitX = 0.5; exitY = 0;
        entryX = 0.5; entryY = 1;
      }
    }
  }

  return { exitX, exitY, entryX, entryY };
}

/**
 * 檢測兩條連線是否交叉
 * @param {Object} edge1 - {source, target, sourceGeo, targetGeo}
 * @param {Object} edge2 - {source, target, sourceGeo, targetGeo}
 * @returns {boolean} 是否交叉
 */
function detectEdgeCrossing(edge1, edge2) {
  // 簡化：檢測線段的包圍盒是否重疊
  const box1 = {
    minX: Math.min(edge1.sourceGeo.x, edge1.targetGeo.x),
    maxX: Math.max(edge1.sourceGeo.x + edge1.sourceGeo.width, edge1.targetGeo.x + edge1.targetGeo.width),
    minY: Math.min(edge1.sourceGeo.y, edge1.targetGeo.y),
    maxY: Math.max(edge1.sourceGeo.y + edge1.sourceGeo.height, edge1.targetGeo.y + edge1.targetGeo.height)
  };

  const box2 = {
    minX: Math.min(edge2.sourceGeo.x, edge2.targetGeo.x),
    maxX: Math.max(edge2.sourceGeo.x + edge2.sourceGeo.width, edge2.targetGeo.x + edge2.targetGeo.width),
    minY: Math.min(edge2.sourceGeo.y, edge2.targetGeo.y),
    maxY: Math.max(edge2.sourceGeo.y + edge2.sourceGeo.height, edge2.targetGeo.y + edge2.targetGeo.height)
  };

  // 包圍盒重疊檢測
  const overlapping = !(box1.maxX < box2.minX || box2.maxX < box1.minX ||
                        box1.maxY < box2.minY || box2.maxY < box1.minY);

  if (!overlapping) return false;

  // 進一步檢測：如果是垂直版面（上下關係），檢查是否交叉連線
  const edge1IsVertical = Math.abs(edge1.targetGeo.y - edge1.sourceGeo.y) > 50;
  const edge2IsVertical = Math.abs(edge2.targetGeo.y - edge2.sourceGeo.y) > 50;

  if (edge1IsVertical && edge2IsVertical) {
    // 檢查交叉連線模式：A→C 和 B→D，如果 A 在 B 右側但 C 在 D 左側
    const edge1SourceCenter = edge1.sourceGeo.x + edge1.sourceGeo.width / 2;
    const edge1TargetCenter = edge1.targetGeo.x + edge1.targetGeo.width / 2;
    const edge2SourceCenter = edge2.sourceGeo.x + edge2.sourceGeo.width / 2;
    const edge2TargetCenter = edge2.targetGeo.x + edge2.targetGeo.width / 2;

    // 交叉模式檢測
    if ((edge1SourceCenter > edge2SourceCenter && edge1TargetCenter < edge2TargetCenter) ||
        (edge1SourceCenter < edge2SourceCenter && edge1TargetCenter > edge2TargetCenter)) {
      return true;
    }
  }

  return false;
}

/**
 * 避免連線穿過節點的最佳化
 * 檢測連線路徑是否穿過其他節點，並調整節點位置來避讓
 *
 * @param {Document} xmlDoc - XML 文件物件
 * @returns {number} 調整的節點數量
 */
function optimizeEdgeNodeAvoidance(xmlDoc) {
  console.log('[DrawioOptimizer] 🎯 檢測連線-節點衝突...');

  const edges = xmlDoc.querySelectorAll('mxCell[edge="1"]');
  const vertices = Array.from(xmlDoc.querySelectorAll('mxCell[vertex="1"]'));
  const cellMap = new Map();

  // 構建 ID -> Cell 的對映
  xmlDoc.querySelectorAll('mxCell[id]').forEach(cell => {
    cellMap.set(cell.getAttribute('id'), cell);
  });

  // 收集所有節點的幾何資訊
  const nodeGeometries = vertices.map(cell => ({
    cell,
    id: cell.getAttribute('id'),
    ...getCellGeometry(cell)
  })).filter(g => g.x !== undefined);

  let adjustedCount = 0;

  // 檢測每條連線
  edges.forEach(edge => {
    const sourceId = edge.getAttribute('source');
    const targetId = edge.getAttribute('target');
    if (!sourceId || !targetId) return;

    const sourceCell = cellMap.get(sourceId);
    const targetCell = cellMap.get(targetId);
    if (!sourceCell || !targetCell) return;

    const sourceGeo = getCellGeometry(sourceCell);
    const targetGeo = getCellGeometry(targetCell);
    if (!sourceGeo || !targetGeo) return;

    // 計算連線的包圍盒（簡化的正交路徑）
    // 正交路徑：source中心 → 垂直移動 → 水平移動 → 垂直移動 → target中心
    const sourceCenterX = sourceGeo.x + sourceGeo.width / 2;
    const sourceCenterY = sourceGeo.y + sourceGeo.height / 2;
    const targetCenterX = targetGeo.x + targetGeo.width / 2;
    const targetCenterY = targetGeo.y + targetGeo.height / 2;

    // 連線的包圍盒（留10px餘量）
    const edgeBox = {
      minX: Math.min(sourceCenterX, targetCenterX) - 10,
      maxX: Math.max(sourceCenterX, targetCenterX) + 10,
      minY: Math.min(sourceCenterY, targetCenterY) - 10,
      maxY: Math.max(sourceCenterY, targetCenterY) + 10
    };

    // 檢測是否有其他節點在連線路徑上
    nodeGeometries.forEach(node => {
      // 跳過連線的起點和終點
      if (node.id === sourceId || node.id === targetId) return;

      // 檢測節點是否在連線的包圍盒內
      const nodeBox = {
        minX: node.x,
        maxX: node.x + node.width,
        minY: node.y,
        maxY: node.y + node.height
      };

      // 包圍盒相交檢測
      const isIntersecting = !(
        nodeBox.maxX < edgeBox.minX ||
        nodeBox.minX > edgeBox.maxX ||
        nodeBox.maxY < edgeBox.minY ||
        nodeBox.minY > edgeBox.minY
      );

      if (isIntersecting) {
        // 檢測節點是否在連線的"中間區域"（不是起點或終點附近）
        const isInMiddleRegion =
          nodeBox.minX > Math.min(sourceGeo.x + sourceGeo.width, targetGeo.x + targetGeo.width) &&
          nodeBox.maxX < Math.max(sourceGeo.x, targetGeo.x);

        if (isInMiddleRegion) {
          // 需要調整節點位置
          // 策略：將節點向左或向右移動，偏離連線路徑
          const edgeCenterX = (sourceCenterX + targetCenterX) / 2;
          const nodeCenterX = node.x + node.width / 2;

          // 計算移動方向（遠離連線中心）
          let newX;
          if (nodeCenterX < edgeCenterX) {
            // 節點在連線左側，繼續向左移
            newX = edgeBox.minX - node.width - 30;
          } else {
            // 節點在連線右側，繼續向右移
            newX = edgeBox.maxX + 30;
          }

          // 確保新位置不是負數
          newX = Math.max(0, newX);

          // 更新節點位置
          setCellGeometry(node.cell, {
            x: newX,
            y: node.y,
            width: node.width,
            height: node.height
          });

          node.x = newX; // 更新快取
          adjustedCount++;

          console.log(`[DrawioOptimizer] 調整節點 ${node.id}，避讓連線 ${sourceId}->${targetId}`);
        }
      }
    });
  });

  console.log(`[DrawioOptimizer] ✅ 連線-節點避讓: ${adjustedCount} 個節點已調整`);
  return adjustedCount;
}

/**
 * 智慧連線最佳化（增強版 - 包含理線功能）
 * 自動設定連線線的出入點，並嘗試減少交叉
 *
 * @param {Document} xmlDoc - XML 文件物件
 * @param {string} layoutDirection - 版面方向：'LR' 或 'TB'，預設 'LR'
 */
function optimizeConnections(xmlDoc, layoutDirection = 'LR') {
  const edges = xmlDoc.querySelectorAll('mxCell[edge="1"]');
  const cellMap = new Map();

  // 構建 ID -> Cell 的對映
  xmlDoc.querySelectorAll('mxCell[id]').forEach(cell => {
    cellMap.set(cell.getAttribute('id'), cell);
  });

  // 收集所有連線資訊
  const edgeInfos = [];
  edges.forEach(edge => {
    const sourceId = edge.getAttribute('source');
    const targetId = edge.getAttribute('target');

    if (!sourceId || !targetId) return;

    const sourceCell = cellMap.get(sourceId);
    const targetCell = cellMap.get(targetId);

    if (!sourceCell || !targetCell) return;

    const sourceGeo = getCellGeometry(sourceCell);
    const targetGeo = getCellGeometry(targetCell);

    if (!sourceGeo || !targetGeo) return;

    edgeInfos.push({
      edge,
      sourceId,
      targetId,
      sourceCell,
      targetCell,
      sourceGeo,
      targetGeo
    });
  });

  // 檢測交叉並記錄
  let crossingCount = 0;
  const crossingPairs = [];

  for (let i = 0; i < edgeInfos.length; i++) {
    for (let j = i + 1; j < edgeInfos.length; j++) {
      if (detectEdgeCrossing(edgeInfos[i], edgeInfos[j])) {
        crossingCount++;
        crossingPairs.push([i, j]);
      }
    }
  }

  if (crossingCount > 0) {
    console.log(`[DrawioOptimizer] 檢測到 ${crossingCount} 處連線交叉，嘗試最佳化...`);
  }

  let optimizedCount = 0;

  // 為每條連線設定最佳連線點
  edgeInfos.forEach(info => {
    const { edge, sourceGeo, targetGeo } = info;

    // 計算最佳連線點（傳入版面方向）
    const connection = calculateOptimalConnection(sourceGeo, targetGeo, layoutDirection);

    // 獲取或建立 mxGeometry（必須是自閉合標籤，不能有子元素）
    let geometry = edge.querySelector('mxGeometry');
    if (!geometry) {
      geometry = xmlDoc.createElement('mxGeometry');
      geometry.setAttribute('relative', '1');
      geometry.setAttribute('as', 'geometry');
      edge.appendChild(geometry);
    }

    // ❌ 刪除任何 mxPoint 子元素（這會導致 "Could not add object mxGeometry" 錯誤）
    const mxPoints = geometry.querySelectorAll('mxPoint');
    mxPoints.forEach(point => point.remove());

    // ✅ 連線點資訊應該只放在 style 屬性中，不要建立 mxPoint 子元素
    // 更新樣式：新增 exitX/exitY/entryX/entryY
    const style = edge.getAttribute('style') || '';
    const styleMap = new Map();
    style.split(';').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) styleMap.set(key.trim(), value || '');
    });

    styleMap.set('exitX', connection.exitX);
    styleMap.set('exitY', connection.exitY);
    styleMap.set('entryX', connection.entryX);
    styleMap.set('entryY', connection.entryY);

    // 新增正交路由樣式（美觀且減少交叉）
    if (!styleMap.has('edgeStyle')) {
      styleMap.set('edgeStyle', 'orthogonalEdgeStyle');
    }
    if (!styleMap.has('rounded')) {
      styleMap.set('rounded', '0');
    }

    const newStyle = Array.from(styleMap.entries())
      .map(([k, v]) => v ? `${k}=${v}` : k)
      .join(';');

    edge.setAttribute('style', newStyle);
    optimizedCount++;
  });

  console.log(`[DrawioOptimizer] 連線最佳化: ${optimizedCount} 條連線線已最佳化`);
  return optimizedCount;
}

/**
 * 樣式統一最佳化
 * 為相同型別的節點應用一致的樣式
 *
 * @param {Document} xmlDoc - XML 文件物件
 */
function optimizeStyles(xmlDoc) {
  const cells = xmlDoc.querySelectorAll('mxCell[vertex="1"]');

  // 按節點型別分組（根據 style 中的 shape 或預設形狀）
  const typeGroups = new Map();

  cells.forEach(cell => {
    const style = cell.getAttribute('style') || '';
    let type = 'default';

    // 提取形狀型別
    const shapeMatch = style.match(/shape=([^;]+)/);
    if (shapeMatch) {
      type = shapeMatch[1];
    } else if (style.includes('rounded=1')) {
      type = 'rounded';
    } else if (style.includes('ellipse')) {
      type = 'ellipse';
    }

    if (!typeGroups.has(type)) {
      typeGroups.set(type, []);
    }
    typeGroups.get(type).push(cell);
  });

  let optimizedCount = 0;

  // 為每個型別組應用統一樣式
  typeGroups.forEach((cells, type) => {
    if (cells.length < 2) return; // 少於2個節點，無需統一

    // 收集第一個節點的樣式作為基準
    const referenceStyle = cells[0].getAttribute('style') || '';
    const styleMap = new Map();
    referenceStyle.split(';').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) styleMap.set(key.trim(), value || '');
    });

    // 確保有基本樣式
    if (!styleMap.has('fillColor')) {
      // 根據型別設定預設顏色
      const colors = {
        'default': '#dae8fc',
        'rounded': '#d5e8d4',
        'ellipse': '#ffe6cc',
        'swimlane': '#f5f5f5'
      };
      styleMap.set('fillColor', colors[type] || '#ffffff');
    }

    if (!styleMap.has('strokeColor')) {
      styleMap.set('strokeColor', '#6c8ebf');
    }

    // 應用到所有同型別節點
    const unifiedStyle = Array.from(styleMap.entries())
      .map(([k, v]) => v ? `${k}=${v}` : k)
      .join(';');

    cells.forEach((cell, index) => {
      if (index === 0) return; // 跳過參考節點
      cell.setAttribute('style', unifiedStyle);
      optimizedCount++;
    });
  });

  console.log(`[DrawioOptimizer] 樣式統一: ${optimizedCount} 個節點已最佳化`);
  return optimizedCount;
}

/**
 * 主最佳化函式
 * 依次執行所有最佳化步驟
 *
 * @param {string} xmlString - 原始 draw.io XML 字串
 * @param {Object} options - 最佳化選項
 * @param {boolean} options.gridAlignment - 是否網格對齊，預設 true
 * @param {boolean} options.spacing - 是否間距最佳化，預設 true
 * @param {boolean} options.connections - 是否連線最佳化，預設 true
 * @param {boolean} options.styles - 是否樣式統一，預設 false
 * @returns {string} 最佳化後的 XML 字串
 */
function optimizeDrawioLayout(xmlString, options = {}) {
  const defaultOptions = {
    dagreLayout: true,     // 使用 Dagre 演算法進行層次化版面（新增，預設開啟）
    gridAlignment: true,
    spacing: true,
    connections: true,
    styles: false // 預設關閉，避免覆蓋使用者自定義樣式
  };

  const opts = { ...defaultOptions, ...options };

  try {
    console.log('[DrawioOptimizer] 開始最佳化版面...');

    // 解析 XML
    const xmlDoc = parseDrawioXml(xmlString);

    let totalOptimized = 0;

    // 0. Dagre 層次化版面（優先順序最高，使用標準 Sugiyama 演算法）
    if (opts.dagreLayout) {
      totalOptimized += applyDagreLayout(xmlDoc, {
        rankdir: 'LR',   // 從左到右版面，層級橫向展開
        nodesep: 100,    // 同層節點垂直間距 - 增加以減少交叉
        ranksep: 180,    // 不同層水平間距 - 增加以減少交叉
        edgesep: 20,     // 邊之間的間距
        ranker: 'network-simplex'  // 最佳層分配演算法
      });
    }

    // 1. 網格對齊
    if (opts.gridAlignment) {
      totalOptimized += optimizeGridAlignment(xmlDoc, 10);
    }

    // 2. 間距最佳化（如果沒有使用 dagre，則進行間距最佳化）
    if (opts.spacing && !opts.dagreLayout) {
      totalOptimized += optimizeSpacing(xmlDoc, 30);
    }

    // 3. 避免連線穿過節點
    if (opts.spacing) {
      totalOptimized += optimizeEdgeNodeAvoidance(xmlDoc);
    }

    // 4. 連線最佳化（傳入版面方向）
    if (opts.connections) {
      totalOptimized += optimizeConnections(xmlDoc, 'LR');
    }

    // 5. 樣式統一
    if (opts.styles) {
      totalOptimized += optimizeStyles(xmlDoc);
    }

    console.log(`[DrawioOptimizer] ✅ 最佳化完成，共最佳化 ${totalOptimized} 處`);

    // 序列化回 XML
    return serializeDrawioXml(xmlDoc);

  } catch (error) {
    console.error('[DrawioOptimizer] ❌ 最佳化失敗:', error);
    return xmlString; // 失敗時返回原始 XML
  }
}

/**
 * 對單個 diagram 進行最佳化（多頁支援）
 * @param {Element} diagram - diagram 元素
 * @param {Object} opts - 最佳化選項
 * @returns {number} 最佳化次數
 */
function optimizeDiagram(diagram, opts) {
  const diagramName = diagram.getAttribute('name') || 'Unnamed';

  // 建立臨時文件，只包含當前 diagram
  const tempDoc = document.implementation.createDocument(null, 'mxfile', null);
  const tempDiagram = diagram.cloneNode(true);
  tempDoc.documentElement.appendChild(tempDiagram);

  let optimized = 0;

  // 獲取版面方向（預設 TB）
  const layoutDir = opts.layoutDirection || 'TB';

  // 應用所有最佳化（使用臨時文件）
  if (opts.dagreLayout) {
    // 根據版面方向調整引數
    const dagreOpts = layoutDir === 'TB' ? {
      rankdir: 'TB',       // 從上到下
      nodesep: 80,         // 同層節點橫向間距
      ranksep: 120,        // 不同層縱向間距（更緊湊）
      edgesep: 10,
      ranker: 'network-simplex'
    } : {
      rankdir: 'LR',       // 從左到右
      nodesep: 100,        // 同層節點縱向間距
      ranksep: 180,        // 不同層橫向間距
      edgesep: 20,
      ranker: 'network-simplex'
    };

    optimized += applyDagreLayout(tempDoc, dagreOpts);
  }

  if (opts.gridAlignment) {
    optimized += optimizeGridAlignment(tempDoc, 10);
  }

  if (opts.spacing && !opts.dagreLayout) {
    optimized += optimizeSpacing(tempDoc, 30);
  }

  if (opts.spacing) {
    optimized += optimizeEdgeNodeAvoidance(tempDoc);
  }

  if (opts.connections) {
    optimized += optimizeConnections(tempDoc, layoutDir);
  }

  if (opts.styles) {
    optimized += optimizeStyles(tempDoc);
  }

  // 將最佳化後的節點同步回原始 diagram
  const optimizedDiagram = tempDoc.querySelector('diagram');
  const originalCells = diagram.querySelectorAll('mxCell[id]');
  const optimizedCells = optimizedDiagram.querySelectorAll('mxCell[id]');

  const cellMap = new Map();
  optimizedCells.forEach(cell => {
    cellMap.set(cell.getAttribute('id'), cell);
  });

  originalCells.forEach(originalCell => {
    const id = originalCell.getAttribute('id');
    const optimizedCell = cellMap.get(id);
    if (!optimizedCell) return;

    // 同步幾何資訊和樣式
    const originalGeo = originalCell.querySelector('mxGeometry');
    const optimizedGeo = optimizedCell.querySelector('mxGeometry');

    if (originalGeo && optimizedGeo) {
      // 同步所有屬性
      ['x', 'y', 'width', 'height', 'relative', 'as', 'exitX', 'exitY', 'entryX', 'entryY'].forEach(attr => {
        if (optimizedGeo.hasAttribute(attr)) {
          originalGeo.setAttribute(attr, optimizedGeo.getAttribute(attr));
        }
      });
    }

    // 同步樣式
    if (optimizedCell.hasAttribute('style')) {
      originalCell.setAttribute('style', optimizedCell.getAttribute('style'));
    }
  });

  return optimized;
}

/**
 * 主最佳化函式（支援多頁圖表）
 * @param {string} xmlString - 原始 draw.io XML 字串
 * @param {Object} options - 最佳化選項
 * @returns {string} 最佳化後的 XML 字串
 */
function optimizeDrawioLayoutMultiPage(xmlString, options = {}) {
  const defaultOptions = {
    dagreLayout: true,
    gridAlignment: true,
    spacing: true,
    connections: true,
    styles: false
  };

  const opts = { ...defaultOptions, ...options };

  try {
    const xmlDoc = parseDrawioXml(xmlString);
    const diagrams = Array.from(xmlDoc.querySelectorAll('diagram'));

    if (diagrams.length === 0) {
      console.warn('[DrawioOptimizer] ⚠️ 未找到 diagram 元素，使用舊版單頁最佳化');
      return optimizeDrawioLayout(xmlString, options);
    }

    console.log(`[DrawioOptimizer] 🎯 檢測到 ${diagrams.length} 個頁面，開始獨立最佳化...`);

    let totalOptimized = 0;

    diagrams.forEach((diagram, index) => {
      const name = diagram.getAttribute('name') || `Page ${index + 1}`;
      console.log(`[DrawioOptimizer] 📄 最佳化頁面 "${name}"...`);
      const count = optimizeDiagram(diagram, opts);
      console.log(`[DrawioOptimizer] ✅ 頁面 "${name}" 完成，最佳化 ${count} 處`);
      totalOptimized += count;
    });

    console.log(`[DrawioOptimizer] ✅ 全部完成，共最佳化 ${totalOptimized} 處`);
    return serializeDrawioXml(xmlDoc);

  } catch (error) {
    console.error('[DrawioOptimizer] ❌ 多頁最佳化失敗，回退到單頁模式:', error);
    return optimizeDrawioLayout(xmlString, options);
  }
}

// 匯出到全域
window.DrawioLayoutOptimizer = {
  optimizeDrawioLayout: optimizeDrawioLayoutMultiPage,  // 使用新的多頁版本
  optimizeDrawioLayoutLegacy: optimizeDrawioLayout      // 保留舊版本
};
