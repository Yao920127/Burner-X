const annotationsSummaryModal = document.getElementById('annotations-summary-modal');
const annotationsSummaryCloseBtn = document.getElementById('annotations-summary-close-btn');
const annotationsFilterTypeSelect = document.getElementById('annotations-filter-type');
const annotationsFilterContentSelect = document.getElementById('annotations-filter-content');
const annotationsSummaryTableBody = document.getElementById('annotations-summary-table-body');
const annotationsSummaryColorFilter = document.getElementById('annotations-summary-color-filter');

// 獲取所有出現過的醒目提示顏色
function getAllHighlightColors() {
  if (!window.data || !window.data.annotations) return [];
  const colorSet = new Set();
  window.data.annotations.forEach(ann => {
    if (ann.highlightColor) colorSet.add(ann.highlightColor);
  });
  return Array.from(colorSet);
}

// 渲染顏色多選區
function renderColorFilter(selectedColors) {
  const allColors = getAllHighlightColors();
  annotationsSummaryColorFilter.innerHTML = '';
  if (allColors.length === 0) return;
  allColors.forEach(color => {
    const label = document.createElement('label');
    label.className = 'annotations-summary-color-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = color;
    checkbox.checked = selectedColors.includes(color);
    checkbox.addEventListener('change', () => {
      // 重新渲染表格
      const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
      populateAnnotationsSummaryTable(
        annotationsFilterTypeSelect.value,
        annotationsFilterContentSelect.value,
        checkedColors
      );
    });
    const swatch = document.createElement('span');
    swatch.className = 'annotations-summary-color-swatch';
    swatch.style.backgroundColor = typeof getHighlightColor === 'function' ? getHighlightColor(color) : color;
    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(' '));
    annotationsSummaryColorFilter.appendChild(label);
  });
}

// 主表格渲染函式，增加顏色篩選引數
function populateAnnotationsSummaryTable(typeFilter = 'all', contentFilter = 'all', colorFilter = null) {
  console.log('[除錯] populateAnnotationsSummaryTable called, data:', window.data, 'tocStructure:', (typeof window.getCurrentTocStructure === 'function') ? window.getCurrentTocStructure() : null);

  if (!window.data || !window.data.annotations || !annotationsSummaryTableBody) {
    annotationsSummaryTableBody.innerHTML = '<tr><td colspan="7">暫無資料或批註未載入。</td></tr>';
    return;
  }

  // 預設全選所有顏色
  let allColors = getAllHighlightColors();
  if (!colorFilter) colorFilter = allColors;
  renderColorFilter(colorFilter);

  // 清空表格內容，防止重複
  annotationsSummaryTableBody.innerHTML = '';

  // 對批註資料進行去重處理
  // 建立一個 Map 用於檢測重複的批註
  const uniqueAnnotations = new Map();

  // 走訪所有批註，按照目標識別符號和內容型別進行去重
  window.data.annotations.forEach(ann => {
    // 獲取批註的唯一標識
    let targetSelector = ann.target && ann.target.selector && ann.target.selector[0];
    let uniqueKey = '';

    if (targetSelector) {
      // 使用 subBlockId 或 blockIndex 作為唯一標識的一部分
      if (targetSelector.subBlockId) {
        uniqueKey = `${ann.targetType}_subBlock_${targetSelector.subBlockId}`;
      } else if (targetSelector.blockIndex !== undefined) {
        uniqueKey = `${ann.targetType}_block_${targetSelector.blockIndex}`;
      }
    }

    // 如果有有效的唯一標識，則新增到 Map 中
    if (uniqueKey) {
      // 如果是相同位置的批註，保留最新的（假設 id 越大越新）
      if (!uniqueAnnotations.has(uniqueKey) ||
          (ann.id && uniqueAnnotations.get(uniqueKey).id && ann.id > uniqueAnnotations.get(uniqueKey).id)) {
        uniqueAnnotations.set(uniqueKey, ann);
      }
    } else {
      // 對於沒有有效唯一標識的批註，使用 id 作為鍵
      uniqueAnnotations.set(ann.id || _page_generateUUID(), ann);
    }
  });

  // 將去重後的批註轉換為陣列並應用篩選條件
  const filteredAnnotations = Array.from(uniqueAnnotations.values()).filter(ann => {
    const typeMatch = typeFilter === 'all' || ann.motivation === typeFilter;
    const contentMatch = contentFilter === 'all' || ann.targetType === contentFilter;
    const colorMatch = !ann.highlightColor || colorFilter.includes(ann.highlightColor);
    return typeMatch && contentMatch && colorMatch;
  });

  // 按照位置排序（先按內容型別，再按塊索引或子塊ID）
  filteredAnnotations.sort((a, b) => {
    // 先按內容型別排序
    if (a.targetType !== b.targetType) {
      return a.targetType === 'ocr' ? -1 : 1;
    }

    // 再按塊索引或子塊ID排序
    const aSel = a.target && a.target.selector && a.target.selector[0];
    const bSel = b.target && b.target.selector && b.target.selector[0];

    if (aSel && bSel) {
      // 如果都有 blockIndex，按 blockIndex 排序
      if (aSel.blockIndex !== undefined && bSel.blockIndex !== undefined) {
        return aSel.blockIndex - bSel.blockIndex;
      }

      // 如果都有 subBlockId，按 subBlockId 排序
      if (aSel.subBlockId && bSel.subBlockId) {
        const aIds = aSel.subBlockId.split('.');
        const bIds = bSel.subBlockId.split('.');

        // 先比較主塊索引
        const aMainBlock = parseInt(aIds[0]);
        const bMainBlock = parseInt(bIds[0]);
        if (aMainBlock !== bMainBlock) {
          return aMainBlock - bMainBlock;
        }

        // 再比較子塊索引
        if (aIds.length > 1 && bIds.length > 1) {
          return parseInt(aIds[1]) - parseInt(bIds[1]);
        }
      }
    }

    // 預設按 id 排序（如果有）
    return (a.id || '') < (b.id || '') ? -1 : 1;
  });

  // ========== TOC 分組渲染 ===========
  let tocStructure = (typeof window.getCurrentTocStructure === 'function') ? window.getCurrentTocStructure() : null;
  let grouped = {};
  let ungrouped = [];
  // 輔助：遞迴查詢批註屬於哪個 TOC 節點，並返回完整路徑
  function findTocPathForAnnotation(tocNodes, blockIndex, subBlockId, path = []) {
    let found = null;
    for (let node of tocNodes) {
      // 判斷 blockIndex 是否在本節點範圍內
      let inRange = false;
      if (blockIndex !== null && node.startBlockIndex !== undefined) {
        if (node.endBlockIndex !== null && node.endBlockIndex !== undefined) {
          inRange = blockIndex >= node.startBlockIndex && blockIndex <= node.endBlockIndex;
        } else {
          inRange = blockIndex >= node.startBlockIndex;
        }
      }
      // 判斷 subBlockId 是否屬於本節點（可擴充）
      // 這裡只做 blockIndex 比對，subBlockId 可按需擴充
      if (inRange) {
        // 遞迴查詢更小的子節點
        let childFound = null;
        if (node.children && node.children.length > 0) {
          childFound = findTocPathForAnnotation(node.children, blockIndex, subBlockId, path.concat([node]));
        }
        if (childFound) return childFound;
        return path.concat([node]);
      }
    }
    return null;
  }
  if (tocStructure && tocStructure.children && tocStructure.children.length > 0) {
    console.log('[批註分組] TOC結構節點數:', tocStructure.children.length);
    filteredAnnotations.forEach(ann => {
      let targetSelector = ann.target && ann.target.selector && ann.target.selector[0];
      let blockIndex = targetSelector && targetSelector.blockIndex !== undefined ? parseInt(targetSelector.blockIndex, 10) : null;
      let subBlockId = targetSelector && targetSelector.subBlockId ? String(targetSelector.subBlockId) : null;
      // 新增：如果 blockIndex 為空但 subBlockId 存在，自動用 subBlockId 的前半部分
      if (blockIndex === null && subBlockId) {
        const parts = subBlockId.split('.');
        if (parts.length > 0 && !isNaN(parseInt(parts[0], 10))) {
          blockIndex = parseInt(parts[0], 10);
        }
      }
      let tocPath = findTocPathForAnnotation(tocStructure.children, blockIndex, subBlockId);
      if (tocPath && tocPath.length > 0) {
        let groupKey = tocPath.map(n => n.text).join(' > ');
        if (!grouped[groupKey]) grouped[groupKey] = { path: tocPath, items: [] };
        grouped[groupKey].items.push(ann);
        console.log(`[批註分組] blockIndex: ${blockIndex}, subBlockId: ${subBlockId}, 分組到: ${groupKey}`);
      } else {
        ungrouped.push(ann);
        console.log(`[批註分組] blockIndex: ${blockIndex}, subBlockId: ${subBlockId}, 未分組`);
      }
    });
  } else {
    ungrouped = filteredAnnotations;
  }
  // ========== 渲染分組 ===========
  let groupCount = 0;
  for (let key in grouped) {
    if (!grouped[key].items.length) continue;
    groupCount += grouped[key].items.length;
    const groupRow = document.createElement('tr');
    groupRow.className = 'toc-group';
    // XSS 防護：使用 textContent 而不是 innerHTML
    // key 來自文件標題，可能包含惡意 HTML
    const td = document.createElement('td');
    td.setAttribute('colspan', '7');
    td.textContent = `${key}（${grouped[key].items.length}）`;
    groupRow.appendChild(td);
    annotationsSummaryTableBody.appendChild(groupRow);
    grouped[key].items.forEach(ann => {
      const row = annotationsSummaryTableBody.insertRow();
      row.insertCell().textContent = ann.motivation === 'commenting' ? '批註' : (ann.motivation === 'highlighting' ? '醒目提示' : ann.motivation);
      row.insertCell().textContent = ann.targetType ? ann.targetType.toUpperCase() : 'N/A';

      let identifierText = 'N/A';
      let targetSelector = ann.target && ann.target.selector && ann.target.selector[0];
      if (targetSelector) {
        if (targetSelector.subBlockId) {
          identifierText = `子塊: ${targetSelector.subBlockId}`;
        } else if (targetSelector.blockIndex !== undefined) {
          identifierText = `塊: ${targetSelector.blockIndex}`;
        }
      }
      row.insertCell().textContent = identifierText;

      // 增強文字片段預覽（優先原始 Markdown，再回退 exact）
      const textCell = row.insertCell();
      let textSnippet = '[無文字片段]';

      if (targetSelector) {
        // 優先：以所屬塊的原始 Markdown 作為預覽
        let preferredBlockIndex = null;
        if (targetSelector.blockIndex !== undefined && targetSelector.blockIndex !== null) {
          preferredBlockIndex = parseInt(targetSelector.blockIndex, 10);
        } else if (targetSelector.subBlockId) {
          const parts = String(targetSelector.subBlockId).split('.');
          if (parts.length > 0 && !isNaN(parseInt(parts[0], 10))) preferredBlockIndex = parseInt(parts[0], 10);
        }
        if (preferredBlockIndex !== null &&
            window.currentBlockTokensForCopy &&
            window.currentBlockTokensForCopy[ann.targetType] &&
            window.currentBlockTokensForCopy[ann.targetType][preferredBlockIndex] &&
            typeof window.currentBlockTokensForCopy[ann.targetType][preferredBlockIndex].raw === 'string') {
          textSnippet = window.currentBlockTokensForCopy[ann.targetType][preferredBlockIndex].raw;
        } else if (targetSelector.exact) {
          // 回退：展示 exact（渲染後的文字片段）
          textSnippet = targetSelector.exact;
        }
      }

      // 限制顯示長度，但保留更多內容
      if (textSnippet && textSnippet.length > 150) {
        textCell.textContent = textSnippet.substring(0, 150) + '...';
        textCell.title = textSnippet; // 滑鼠懸停時顯示完整內容
      } else {
        textCell.textContent = textSnippet || '[無文字片段]';
      }

      // 新增檢視完整內容的功能
      if (textSnippet && textSnippet.length > 50) {
        textCell.style.cursor = 'pointer';
        textCell.addEventListener('click', function() {
          const fullTextDialog = document.createElement('div');
          fullTextDialog.className = 'full-text-dialog';
          fullTextDialog.style.position = 'fixed';
          fullTextDialog.style.top = '50%';
          fullTextDialog.style.left = '50%';
          fullTextDialog.style.transform = 'translate(-50%, -50%)';
          fullTextDialog.style.maxWidth = '80%';
          fullTextDialog.style.maxHeight = '80%';
          fullTextDialog.style.backgroundColor = 'white';
          fullTextDialog.style.padding = '20px';
          fullTextDialog.style.borderRadius = '8px';
          fullTextDialog.style.boxShadow = '0 0 20px rgba(0,0,0,0.3)';
          fullTextDialog.style.zIndex = '10000';
          fullTextDialog.style.overflow = 'auto';

          const closeBtn = document.createElement('button');
          closeBtn.textContent = '關閉';
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '10px';
          closeBtn.style.right = '10px';
          closeBtn.style.padding = '5px 10px';
          closeBtn.style.cursor = 'pointer';

          const content = document.createElement('pre');
          content.style.whiteSpace = 'pre-wrap';
          content.style.wordBreak = 'break-word';
          content.style.margin = '10px 0';
          content.style.padding = '10px';
          content.style.backgroundColor = '#f5f5f5';
          content.style.border = '1px solid #ddd';
          content.style.borderRadius = '4px';
          content.textContent = textSnippet;

          fullTextDialog.appendChild(closeBtn);
          fullTextDialog.appendChild(content);
          document.body.appendChild(fullTextDialog);

          closeBtn.onclick = function() {
            if (fullTextDialog.parentNode === document.body) {
              document.body.removeChild(fullTextDialog);
            }
          };

          // 點選對話方塊外部關閉
          document.addEventListener('click', function closeDialog(e) {
            if (!fullTextDialog.contains(e.target) && e.target !== textCell) {
              // 新增檢查確保對話方塊仍然存在於文件中
              if (fullTextDialog.parentNode === document.body) {
                document.body.removeChild(fullTextDialog);
              }
              document.removeEventListener('click', closeDialog);
            }
          });
        });
      }

      // ======= 可編輯筆記列 =======
      const noteCell = row.insertCell();
      const noteText = ann.body && ann.body.length > 0 && ann.body[0].value ? ann.body[0].value : '';
      noteCell.textContent = noteText;
      // 帶批註型別 或 僅醒目提示型別都可編輯/新增
      if (ann.motivation === 'commenting' || ann.motivation === 'highlighting') {
        noteCell.style.cursor = 'pointer';
        noteCell.title = noteText ? '點選編輯批註' : '點選新增批註';
        if (!noteText && ann.motivation === 'highlighting') {
          noteCell.style.color = '#aaa';
          noteCell.textContent = '點選新增批註';
        }
        noteCell.addEventListener('click', function onEditNoteCell(e) {
          if (noteCell.querySelector('textarea')) return; // 已經在編輯
          const textarea = document.createElement('textarea');
          textarea.value = noteText;
          textarea.style.width = '98%';
          textarea.style.minHeight = '40px';
          textarea.style.fontSize = '13px';
          textarea.style.fontFamily = 'inherit';
          textarea.style.resize = 'vertical';
          textarea.autofocus = true;
          noteCell.innerHTML = '';
          noteCell.appendChild(textarea);
          textarea.focus();
          // 儲存函式
          const saveNote = async () => {
            const newVal = textarea.value.trim();
            if (newVal === noteText || (!newVal && !noteText)) {
              noteCell.textContent = noteText || '點選新增批註';
              if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa';
              return;
            }
            if (!newVal) {
              noteCell.textContent = '內容不能為空';
              setTimeout(() => { noteCell.textContent = noteText || '點選新增批註'; if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa'; }, 1200);
              return;
            }
            noteCell.textContent = '儲存中...';
            try {
              ann.body = [{ type: 'TextualBody', value: newVal, format: 'text/plain', purpose: 'commenting' }];
              ann.modified = new Date().toISOString();
              ann.motivation = 'commenting'; // 升級為批註

              // 檢查 updateAnnotationInDB 函式是否可用
              if (typeof updateAnnotationInDB !== 'function') {
                console.error('updateAnnotationInDB 函式未定義，請確保 storage.js 已正確載入');
                throw new Error('儲存批註的函式未定義');
              }

              await updateAnnotationInDB(ann);
              // 更新window.data.annotations
              const idx = window.data.annotations.findIndex(a => a.id === ann.id);
              if (idx > -1) window.data.annotations[idx] = { ...ann };
              // 重新整理表格，保持篩選
              const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
              populateAnnotationsSummaryTable(annotationsFilterTypeSelect.value, annotationsFilterContentSelect.value, checkedColors);
            } catch (err) {
              console.error('儲存批註失敗:', err);
              noteCell.textContent = '[儲存失敗]';
              setTimeout(() => { noteCell.textContent = noteText || '點選新增批註'; if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa'; }, 1500);
            }
          };
          textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveNote();
            } else if (e.key === 'Escape') {
              noteCell.textContent = noteText || '點選新增批註';
              if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa';
            }
          });
          textarea.addEventListener('blur', saveNote);
        });
      }

      // ======= 可編輯顏色列 =======
      const colorCell = row.insertCell();
      if (ann.highlightColor) {
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = typeof getHighlightColor === 'function' ? getHighlightColor(ann.highlightColor) : ann.highlightColor;
        swatch.style.cursor = 'pointer';
        swatch.title = '點選更改醒目提示顏色';
        colorCell.appendChild(swatch);
        // 點選彈出下拉
        swatch.addEventListener('click', function onEditColor(e) {
          if (colorCell.querySelector('select')) return;
          // 顏色選項：常用色+所有已用色
          const commonColors = ['yellow','pink','lightblue','lightgreen','purple','orange','red','cyan','blue','green'];
          const allColors = Array.from(new Set([...commonColors, ...getAllHighlightColors()]));
          const select = document.createElement('select');
          select.style.marginLeft = '6px';
          allColors.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            opt.style.backgroundColor = typeof getHighlightColor === 'function' ? getHighlightColor(c) : c;
            if (c === ann.highlightColor) opt.selected = true;
            select.appendChild(opt);
          });
          colorCell.appendChild(select);
          select.focus();
          // 儲存顏色
          const saveColor = async () => {
            const newColor = select.value;
            if (newColor === ann.highlightColor) {
              colorCell.innerHTML = '';
              colorCell.appendChild(swatch);
              return;
            }
            colorCell.textContent = '儲存中...';
            try {
              ann.highlightColor = newColor;
              ann.modified = new Date().toISOString();
              if (ann.motivation !== 'commenting') ann.motivation = 'highlighting';

              // 檢查 updateAnnotationInDB 函式是否可用
              if (typeof updateAnnotationInDB !== 'function') {
                console.error('updateAnnotationInDB 函式未定義，請確保 storage.js 已正確載入');
                throw new Error('儲存批註顏色的函式未定義');
              }

              await updateAnnotationInDB(ann);
              // 更新window.data.annotations
              const idx = window.data.annotations.findIndex(a => a.id === ann.id);
              if (idx > -1) window.data.annotations[idx] = { ...ann };
              // 重新整理表格，保持篩選
              const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
              populateAnnotationsSummaryTable(annotationsFilterTypeSelect.value, annotationsFilterContentSelect.value, checkedColors);
            } catch (err) {
              console.error('儲存批註顏色失敗:', err);
              colorCell.textContent = '[儲存失敗]';
              setTimeout(() => { colorCell.innerHTML = ''; colorCell.appendChild(swatch); }, 1500);
            }
          };
          select.addEventListener('change', saveColor);
          select.addEventListener('blur', saveColor);
        });
      } else {
        colorCell.textContent = '-';
      }

      const actionsCell = row.insertCell();
      const jumpButton = document.createElement('button');
      jumpButton.textContent = '跳轉';
      jumpButton.className = 'action-btn';
      jumpButton.dataset.annotationId = ann.id;
      jumpButton.dataset.targetType = ann.targetType;
      // 為跨子塊批註提供回退子塊ID與塊索引
      let dataBlockIndex = (targetSelector && targetSelector.blockIndex !== undefined) ? String(targetSelector.blockIndex) : '';
      let dataSubBlockId = (targetSelector && targetSelector.subBlockId !== undefined) ? String(targetSelector.subBlockId) : '';
      if (!dataSubBlockId && targetSelector && targetSelector.type === 'CrossBlockRangeSelector') {
        if (Array.isArray(targetSelector.affectedSubBlocks) && targetSelector.affectedSubBlocks.length > 0) {
          dataSubBlockId = String(targetSelector.affectedSubBlocks[0]);
        } else if (targetSelector.startSubBlockId) {
          dataSubBlockId = String(targetSelector.startSubBlockId);
        }
      }
      if (!dataBlockIndex && dataSubBlockId) {
        const parts = dataSubBlockId.split('.');
        if (parts.length > 0 && parts[0]) dataBlockIndex = parts[0];
      }
      jumpButton.dataset.blockIndex = dataBlockIndex;
      jumpButton.dataset.subBlockId = dataSubBlockId;

      // 僅在分塊對比模式禁用跳轉；其餘場景即使缺少定位資訊也嘗試按 annotationId 跳轉
      if (window.currentVisibleTabId === 'chunk-compare') {
          jumpButton.disabled = true;
          jumpButton.title = '分塊對比模式下禁用跳轉';
      }


      jumpButton.onclick = async function() {
        closeAnnotationsSummaryModal(); // Close modal before jumping

        const targetType = this.dataset.targetType;
        const blockIndex = this.dataset.blockIndex;
        const subBlockId = this.dataset.subBlockId;
        if (!targetType) return;

        // Switch tab if necessary
        if (window.currentVisibleTabId !== targetType && window.currentVisibleTabId !== `${targetType}-content-wrapper`) { // Check against common tab ID patterns
          if (typeof showTab === 'function') {
            console.log(`Switching to tab: ${targetType} for jump action.`);
            await Promise.resolve(showTab(targetType)); // Ensure tab switch completes
             // Wait a brief moment for DOM updates after tab switch, if showTab involves async rendering.
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            alert('無法切換分頁。');
            return;
          }
        }


        // 優先：等待目標醒目提示/元素出現後再跳轉（處理分批渲染/分塊延時）
        if (typeof window.scrollToAnnotationAsync === 'function') {
          const okAsync = await window.scrollToAnnotationAsync(this.dataset.annotationId, {
            targetType,
            subBlockId,
            blockIndex,
            timeoutMs: 5000,
            pollIntervalMs: 120
          });
          if (okAsync) return;
        } else if (typeof window.scrollToAnnotation === 'function') {
          const ok = window.scrollToAnnotation(this.dataset.annotationId, true);
          if (ok) return;
        }

        // 回退：按 subBlockId 或 blockIndex 定位
        let elementToJump = null;
        const contentWrapperId = `${targetType}-content-wrapper`;
        const contentWrapper = document.getElementById(contentWrapperId);
        if (contentWrapper) {
          if (subBlockId && subBlockId !== 'undefined' && subBlockId !== '') {
            elementToJump = contentWrapper.querySelector(`.sub-block[data-sub-block-id="${subBlockId}"]`);
          } else if (blockIndex !== '') {
            elementToJump = contentWrapper.querySelector(`[data-block-index="${blockIndex}"]`);
          }
        }
        if (elementToJump) {
          elementToJump.scrollIntoView({ behavior: 'smooth', block: 'center' });
          elementToJump.classList.add('jump-to-highlight-effect');
          setTimeout(() => elementToJump.classList.remove('jump-to-highlight-effect'), 2500);
        } else {
          alert('在當前檢視中未找到目標元素。它可能已被過濾或不存在。');
          console.warn('Element not found for jump:', {targetType, blockIndex, subBlockId});
        }
      };
      actionsCell.appendChild(jumpButton);
    });
  }
  if (ungrouped.length) {
    const groupRow = document.createElement('tr');
    groupRow.className = 'toc-group';
    // XSS 防護：使用 textContent（雖然 length 是數字，但保持一致性）
    const td = document.createElement('td');
    td.setAttribute('colspan', '7');
    td.textContent = `未分組（${ungrouped.length}）`;
    groupRow.appendChild(td);
    annotationsSummaryTableBody.appendChild(groupRow);
    ungrouped.forEach(ann => {
      const row = annotationsSummaryTableBody.insertRow();
      row.insertCell().textContent = ann.motivation === 'commenting' ? '批註' : (ann.motivation === 'highlighting' ? '醒目提示' : ann.motivation);
      row.insertCell().textContent = ann.targetType ? ann.targetType.toUpperCase() : 'N/A';

      let identifierText = 'N/A';
      let targetSelector = ann.target && ann.target.selector && ann.target.selector[0];
      if (targetSelector) {
        if (targetSelector.subBlockId) {
          identifierText = `子塊: ${targetSelector.subBlockId}`;
        } else if (targetSelector.blockIndex !== undefined) {
          identifierText = `塊: ${targetSelector.blockIndex}`;
        }
      }
      row.insertCell().textContent = identifierText;

      // 增強文字片段預覽（優先原始 Markdown，再回退 exact）
      const textCell = row.insertCell();
      let textSnippet = '[無文字片段]';

      if (targetSelector) {
        // 優先：以所屬塊的原始 Markdown 作為預覽
        let preferredBlockIndex = null;
        if (targetSelector.blockIndex !== undefined && targetSelector.blockIndex !== null) {
          preferredBlockIndex = parseInt(targetSelector.blockIndex, 10);
        } else if (targetSelector.subBlockId) {
          const parts = String(targetSelector.subBlockId).split('.');
          if (parts.length > 0 && !isNaN(parseInt(parts[0], 10))) preferredBlockIndex = parseInt(parts[0], 10);
        }
        if (preferredBlockIndex !== null &&
            window.currentBlockTokensForCopy &&
            window.currentBlockTokensForCopy[ann.targetType] &&
            window.currentBlockTokensForCopy[ann.targetType][preferredBlockIndex] &&
            typeof window.currentBlockTokensForCopy[ann.targetType][preferredBlockIndex].raw === 'string') {
          textSnippet = window.currentBlockTokensForCopy[ann.targetType][preferredBlockIndex].raw;
        } else if (targetSelector.exact) {
          // 回退：展示 exact（渲染後的文字片段）
          textSnippet = targetSelector.exact;
        }
      }

      // 限制顯示長度，但保留更多內容
      if (textSnippet && textSnippet.length > 150) {
        textCell.textContent = textSnippet.substring(0, 150) + '...';
        textCell.title = textSnippet; // 滑鼠懸停時顯示完整內容
      } else {
        textCell.textContent = textSnippet || '[無文字片段]';
      }

      // 新增檢視完整內容的功能
      if (textSnippet && textSnippet.length > 50) {
        textCell.style.cursor = 'pointer';
        textCell.addEventListener('click', function() {
          const fullTextDialog = document.createElement('div');
          fullTextDialog.className = 'full-text-dialog';
          fullTextDialog.style.position = 'fixed';
          fullTextDialog.style.top = '50%';
          fullTextDialog.style.left = '50%';
          fullTextDialog.style.transform = 'translate(-50%, -50%)';
          fullTextDialog.style.maxWidth = '80%';
          fullTextDialog.style.maxHeight = '80%';
          fullTextDialog.style.backgroundColor = 'white';
          fullTextDialog.style.padding = '20px';
          fullTextDialog.style.borderRadius = '8px';
          fullTextDialog.style.boxShadow = '0 0 20px rgba(0,0,0,0.3)';
          fullTextDialog.style.zIndex = '10000';
          fullTextDialog.style.overflow = 'auto';

          const closeBtn = document.createElement('button');
          closeBtn.textContent = '關閉';
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '10px';
          closeBtn.style.right = '10px';
          closeBtn.style.padding = '5px 10px';
          closeBtn.style.cursor = 'pointer';

          const content = document.createElement('pre');
          content.style.whiteSpace = 'pre-wrap';
          content.style.wordBreak = 'break-word';
          content.style.margin = '10px 0';
          content.style.padding = '10px';
          content.style.backgroundColor = '#f5f5f5';
          content.style.border = '1px solid #ddd';
          content.style.borderRadius = '4px';
          content.textContent = textSnippet;

          fullTextDialog.appendChild(closeBtn);
          fullTextDialog.appendChild(content);
          document.body.appendChild(fullTextDialog);

          closeBtn.onclick = function() {
            if (fullTextDialog.parentNode === document.body) {
              document.body.removeChild(fullTextDialog);
            }
          };

          // 點選對話方塊外部關閉
          document.addEventListener('click', function closeDialog(e) {
            if (!fullTextDialog.contains(e.target) && e.target !== textCell) {
              // 新增檢查確保對話方塊仍然存在於文件中
              if (fullTextDialog.parentNode === document.body) {
                document.body.removeChild(fullTextDialog);
              }
              document.removeEventListener('click', closeDialog);
            }
          });
        });
      }

      // ======= 可編輯筆記列 =======
      const noteCell = row.insertCell();
      const noteText = ann.body && ann.body.length > 0 && ann.body[0].value ? ann.body[0].value : '';
      noteCell.textContent = noteText;
      // 帶批註型別 或 僅醒目提示型別都可編輯/新增
      if (ann.motivation === 'commenting' || ann.motivation === 'highlighting') {
        noteCell.style.cursor = 'pointer';
        noteCell.title = noteText ? '點選編輯批註' : '點選新增批註';
        if (!noteText && ann.motivation === 'highlighting') {
          noteCell.style.color = '#aaa';
          noteCell.textContent = '點選新增批註';
        }
        noteCell.addEventListener('click', function onEditNoteCell(e) {
          if (noteCell.querySelector('textarea')) return; // 已經在編輯
          const textarea = document.createElement('textarea');
          textarea.value = noteText;
          textarea.style.width = '98%';
          textarea.style.minHeight = '40px';
          textarea.style.fontSize = '13px';
          textarea.style.fontFamily = 'inherit';
          textarea.style.resize = 'vertical';
          textarea.autofocus = true;
          noteCell.innerHTML = '';
          noteCell.appendChild(textarea);
          textarea.focus();
          // 儲存函式
          const saveNote = async () => {
            const newVal = textarea.value.trim();
            if (newVal === noteText || (!newVal && !noteText)) {
              noteCell.textContent = noteText || '點選新增批註';
              if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa';
              return;
            }
            if (!newVal) {
              noteCell.textContent = '內容不能為空';
              setTimeout(() => { noteCell.textContent = noteText || '點選新增批註'; if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa'; }, 1200);
              return;
            }
            noteCell.textContent = '儲存中...';
            try {
              ann.body = [{ type: 'TextualBody', value: newVal, format: 'text/plain', purpose: 'commenting' }];
              ann.modified = new Date().toISOString();
              ann.motivation = 'commenting'; // 升級為批註

              // 檢查 updateAnnotationInDB 函式是否可用
              if (typeof updateAnnotationInDB !== 'function') {
                console.error('updateAnnotationInDB 函式未定義，請確保 storage.js 已正確載入');
                throw new Error('儲存批註的函式未定義');
              }

              await updateAnnotationInDB(ann);
              // 更新window.data.annotations
              const idx = window.data.annotations.findIndex(a => a.id === ann.id);
              if (idx > -1) window.data.annotations[idx] = { ...ann };
              // 重新整理表格，保持篩選
              const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
              populateAnnotationsSummaryTable(annotationsFilterTypeSelect.value, annotationsFilterContentSelect.value, checkedColors);
            } catch (err) {
              console.error('儲存批註失敗:', err);
              noteCell.textContent = '[儲存失敗]';
              setTimeout(() => { noteCell.textContent = noteText || '點選新增批註'; if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa'; }, 1500);
            }
          };
          textarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveNote();
            } else if (e.key === 'Escape') {
              noteCell.textContent = noteText || '點選新增批註';
              if (!noteText && ann.motivation === 'highlighting') noteCell.style.color = '#aaa';
            }
          });
          textarea.addEventListener('blur', saveNote);
        });
      }

      // ======= 可編輯顏色列 =======
      const colorCell = row.insertCell();
      if (ann.highlightColor) {
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = typeof getHighlightColor === 'function' ? getHighlightColor(ann.highlightColor) : ann.highlightColor;
        swatch.style.cursor = 'pointer';
        swatch.title = '點選更改醒目提示顏色';
        colorCell.appendChild(swatch);
        // 點選彈出下拉
        swatch.addEventListener('click', function onEditColor(e) {
          if (colorCell.querySelector('select')) return;
          // 顏色選項：常用色+所有已用色
          const commonColors = ['yellow','pink','lightblue','lightgreen','purple','orange','red','cyan','blue','green'];
          const allColors = Array.from(new Set([...commonColors, ...getAllHighlightColors()]));
          const select = document.createElement('select');
          select.style.marginLeft = '6px';
          allColors.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            opt.style.backgroundColor = typeof getHighlightColor === 'function' ? getHighlightColor(c) : c;
            if (c === ann.highlightColor) opt.selected = true;
            select.appendChild(opt);
          });
          colorCell.appendChild(select);
          select.focus();
          // 儲存顏色
          const saveColor = async () => {
            const newColor = select.value;
            if (newColor === ann.highlightColor) {
              colorCell.innerHTML = '';
              colorCell.appendChild(swatch);
              return;
            }
            colorCell.textContent = '儲存中...';
            try {
              ann.highlightColor = newColor;
              ann.modified = new Date().toISOString();
              if (ann.motivation !== 'commenting') ann.motivation = 'highlighting';

              // 檢查 updateAnnotationInDB 函式是否可用
              if (typeof updateAnnotationInDB !== 'function') {
                console.error('updateAnnotationInDB 函式未定義，請確保 storage.js 已正確載入');
                throw new Error('儲存批註顏色的函式未定義');
              }

              await updateAnnotationInDB(ann);
              // 更新window.data.annotations
              const idx = window.data.annotations.findIndex(a => a.id === ann.id);
              if (idx > -1) window.data.annotations[idx] = { ...ann };
              // 重新整理表格，保持篩選
              const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
              populateAnnotationsSummaryTable(annotationsFilterTypeSelect.value, annotationsFilterContentSelect.value, checkedColors);
            } catch (err) {
              console.error('儲存批註顏色失敗:', err);
              colorCell.textContent = '[儲存失敗]';
              setTimeout(() => { colorCell.innerHTML = ''; colorCell.appendChild(swatch); }, 1500);
            }
          };
          select.addEventListener('change', saveColor);
          select.addEventListener('blur', saveColor);
        });
      } else {
        colorCell.textContent = '-';
      }

      const actionsCell = row.insertCell();
      const jumpButton = document.createElement('button');
      jumpButton.textContent = '跳轉';
      jumpButton.className = 'action-btn';
      jumpButton.dataset.annotationId = ann.id;
      jumpButton.dataset.targetType = ann.targetType;
      // 為跨子塊批註提供回退子塊ID與塊索引（未分組場景）
      let dataBlockIndex2 = (targetSelector && targetSelector.blockIndex !== undefined) ? String(targetSelector.blockIndex) : '';
      let dataSubBlockId2 = (targetSelector && targetSelector.subBlockId !== undefined) ? String(targetSelector.subBlockId) : '';
      if (!dataSubBlockId2 && targetSelector && targetSelector.type === 'CrossBlockRangeSelector') {
        if (Array.isArray(targetSelector.affectedSubBlocks) && targetSelector.affectedSubBlocks.length > 0) {
          dataSubBlockId2 = String(targetSelector.affectedSubBlocks[0]);
        } else if (targetSelector.startSubBlockId) {
          dataSubBlockId2 = String(targetSelector.startSubBlockId);
        }
      }
      if (!dataBlockIndex2 && dataSubBlockId2) {
        const parts = dataSubBlockId2.split('.');
        if (parts.length > 0 && parts[0]) dataBlockIndex2 = parts[0];
      }
      jumpButton.dataset.blockIndex = dataBlockIndex2;
      jumpButton.dataset.subBlockId = dataSubBlockId2;

      // 僅在分塊對比模式禁用跳轉
      if (window.currentVisibleTabId === 'chunk-compare') {
          jumpButton.disabled = true;
          jumpButton.title = '分塊對比模式下禁用跳轉';
      }


      jumpButton.onclick = async function() {
        closeAnnotationsSummaryModal(); // Close modal before jumping

        const targetType = this.dataset.targetType;
        const blockIndex = this.dataset.blockIndex;
        const subBlockId = this.dataset.subBlockId;
        if (!targetType) return;

        // Switch tab if necessary
        if (window.currentVisibleTabId !== targetType && window.currentVisibleTabId !== `${targetType}-content-wrapper`) { // Check against common tab ID patterns
          if (typeof showTab === 'function') {
            console.log(`Switching to tab: ${targetType} for jump action.`);
            await Promise.resolve(showTab(targetType)); // Ensure tab switch completes
             // Wait a brief moment for DOM updates after tab switch, if showTab involves async rendering.
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            alert('無法切換分頁。');
            return;
          }
        }


        // 優先：等待目標醒目提示/元素出現後再跳轉（處理分批渲染/分塊延時）
        if (typeof window.scrollToAnnotationAsync === 'function') {
          const okAsync = await window.scrollToAnnotationAsync(this.dataset.annotationId, {
            targetType,
            subBlockId,
            blockIndex,
            timeoutMs: 5000,
            pollIntervalMs: 120
          });
          if (okAsync) return;
        } else if (typeof window.scrollToAnnotation === 'function') {
          const ok = window.scrollToAnnotation(this.dataset.annotationId, true);
          if (ok) return;
        }

        // 回退：按 subBlockId 或 blockIndex 定位
        let elementToJump = null;
        const contentWrapperId = `${targetType}-content-wrapper`;
        const contentWrapper = document.getElementById(contentWrapperId);
        if (contentWrapper) {
          if (subBlockId && subBlockId !== 'undefined' && subBlockId !== '') {
            elementToJump = contentWrapper.querySelector(`.sub-block[data-sub-block-id="${subBlockId}"]`);
          } else if (blockIndex !== '') {
            elementToJump = contentWrapper.querySelector(`[data-block-index="${blockIndex}"]`);
          }
        }
        if (elementToJump) {
          elementToJump.scrollIntoView({ behavior: 'smooth', block: 'center' });
          elementToJump.classList.add('jump-to-highlight-effect');
          setTimeout(() => elementToJump.classList.remove('jump-to-highlight-effect'), 2500);
        } else {
          alert('在當前檢視中未找到目標元素。它可能已被過濾或不存在。');
          console.warn('Element not found for jump:', {targetType, blockIndex, subBlockId});
        }
      };
      actionsCell.appendChild(jumpButton);
    });
  }
  if (!groupCount && !ungrouped.length) {
    annotationsSummaryTableBody.innerHTML = '<tr><td colspan="7">沒有符合篩選條件的批註或醒目提示。</td></tr>';
    return;
  }
}

window.openAnnotationsSummaryModal = function(filterByType = 'all', filterByContent = 'all') {
    if (!annotationsSummaryModal) return;

    // Set initial filter values from parameters
    annotationsFilterTypeSelect.value = filterByType;
    annotationsFilterContentSelect.value = filterByContent;

    // 預設全選所有顏色
    const allColors = getAllHighlightColors();
    populateAnnotationsSummaryTable(filterByType, filterByContent, allColors);
    annotationsSummaryModal.classList.add('visible');
};

function closeAnnotationsSummaryModal() {
    if (annotationsSummaryModal) {
        annotationsSummaryModal.classList.remove('visible');
    }
}

if (annotationsSummaryCloseBtn) {
    annotationsSummaryCloseBtn.onclick = closeAnnotationsSummaryModal;
}
if (annotationsSummaryModal) {
    annotationsSummaryModal.addEventListener('click', function(event) {
        if (event.target === annotationsSummaryModal) { // Click on overlay
            closeAnnotationsSummaryModal();
        }
    });
}
if (annotationsFilterTypeSelect && annotationsFilterContentSelect) {
    annotationsFilterTypeSelect.addEventListener('change', () => {
        // 顏色多選保持當前選中
        const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        populateAnnotationsSummaryTable(annotationsFilterTypeSelect.value, annotationsFilterContentSelect.value, checkedColors);
    });
    annotationsFilterContentSelect.addEventListener('change', () => {
        const checkedColors = Array.from(annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        populateAnnotationsSummaryTable(annotationsFilterTypeSelect.value, annotationsFilterContentSelect.value, checkedColors);
    });
}

// 儲存上次看到的顏色集合，用於檢測新顏色
let lastSeenColors = new Set();

// 定期檢查是否有新顏色出現
function checkForNewColors() {
    const currentColors = new Set(getAllHighlightColors());

    // 找出新增的顏色
    const newColors = Array.from(currentColors).filter(color => !lastSeenColors.has(color));

    // 如果有新顏色且模態框當前可見
    if (newColors.length > 0 && annotationsSummaryModal && annotationsSummaryModal.classList.contains('visible')) {
        console.log('檢測到新顏色:', newColors);

        // 獲取當前已選中的顏色
        const currentlyCheckedColors = Array.from(
            annotationsSummaryColorFilter.querySelectorAll('input[type="checkbox"]:checked')
        ).map(cb => cb.value);

        // 合併當前選中的顏色和新顏色
        const updatedSelection = [...currentlyCheckedColors, ...newColors];

        // 重新渲染表格，確保新顏色被選中
        populateAnnotationsSummaryTable(
            annotationsFilterTypeSelect.value,
            annotationsFilterContentSelect.value,
            updatedSelection
        );
    }

    // 更新已知顏色集合
    lastSeenColors = currentColors;
}

// 初始化已知顏色集合
lastSeenColors = new Set(getAllHighlightColors());

// 每秒檢查一次新顏色
// 效能最佳化：頁面隱藏時暫停輪詢
(function() {
    let timerId = null;
    let isActive = false;

    function poll() {
        if (!isActive) return;
        if (!document.hidden) {
            checkForNewColors();
        }
        timerId = setTimeout(poll, 1000);
    }

    function start() {
        if (isActive) return;
        isActive = true;
        poll();
    }

    function stop() {
        isActive = false;
        if (timerId) {
            clearTimeout(timerId);
            timerId = null;
        }
    }

    document.addEventListener('visibilitychange', () => {
        // 頁面隱藏/顯示時無需額外操作，poll 函式會自動跳過
    });

    window.addEventListener('beforeunload', stop);

    start();
})();
