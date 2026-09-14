/**
 * @file js/ui/glossary-editor-enhanced.js
 * @description 增強版術語庫編輯器 - 支援大資料量、搜尋、分頁、批次操作
 */

(function() {
  const ITEMS_PER_PAGE = 20; // 每頁顯示條數

  // 編輯器狀態
  const editorState = {
    currentSetId: null,
    allEntries: [],
    filteredEntries: [],
    currentPage: 1,
    totalPages: 0,
    searchQuery: '',
    selectedIds: new Set(),
    selectAll: false
  };

  /**
   * 開啟增強版編輯器
   * @param {string} setId - 術語庫 ID
   */
  async function openEnhancedEditor(setId) {
    if (!setId) return;

    editorState.currentSetId = setId;
    editorState.currentPage = 1;
    editorState.searchQuery = '';
    editorState.selectedIds.clear();
    editorState.selectAll = false;

    // 顯示載入提示
    showEditorLoading();

    try {
      // 從快取載入資料
      const sets = window._glossarySetsCache || {};
      const set = sets[setId];

      if (!set) {
        throw new Error('術語庫不存在');
      }

      editorState.allEntries = Array.isArray(set.entries) ? set.entries : [];
      editorState.filteredEntries = [...editorState.allEntries];
      editorState.totalPages = Math.ceil(editorState.filteredEntries.length / ITEMS_PER_PAGE);

      // 渲染編輯器
      renderEnhancedEditor(set);
    } catch (err) {
      console.error('Failed to open enhanced editor:', err);
      alert('開啟術語庫失敗: ' + err.message);
    }
  }

  /**
   * 顯示載入提示
   */
  function showEditorLoading() {
    const container = document.getElementById('glossaryEntriesTable');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-12">
        <iconify-icon icon="carbon:hourglass" width="32" class="text-gray-400 animate-pulse mb-2"></iconify-icon>
        <p class="text-gray-500">正在載入術語庫資料...</p>
      </div>
    `;
  }

  /**
   * 渲染增強版編輯器
   * @param {Object} set - 術語庫物件
   */
  function renderEnhancedEditor(set) {
    const panel = document.getElementById('glossaryEditorPanel');
    if (!panel) return;

    panel.dataset.editingId = set.id;
    panel.classList.remove('hidden');

    // 渲染頂部工具列
    renderToolbar(set);

    // 渲染條目列表
    renderEntriesList();

    // 渲染分頁控制元件
    renderPagination();
  }

  /**
   * 渲染工具列
   * @param {Object} set - 術語庫物件
   */
  function renderToolbar(set) {
    const toolbarContainer = document.getElementById('glossaryEditorToolbar');
    if (!toolbarContainer) return;

    const totalEntries = editorState.allEntries.length;
    const filteredCount = editorState.filteredEntries.length;
    const selectedCount = editorState.selectedIds.size;

    toolbarContainer.innerHTML = `
      <div class="flex flex-col gap-4 mb-4">
        <!-- 標題和統計 -->
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800">${escapeHtml(set.name)}</h3>
            <p class="text-sm text-gray-500">
              共 ${totalEntries.toLocaleString()} 條
              ${filteredCount !== totalEntries ? `，篩選後 ${filteredCount.toLocaleString()} 條` : ''}
              ${selectedCount > 0 ? `，已選擇 ${selectedCount} 條` : ''}
            </p>
          </div>
          <button onclick="window.glossaryEditorEnhanced.close()"
                  class="text-gray-400 hover:text-gray-600">
            <iconify-icon icon="carbon:close" width="24"></iconify-icon>
          </button>
        </div>

        <!-- 操作按鈕欄 -->
        <div class="flex flex-wrap items-center gap-2 justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="window.glossaryEditorEnhanced.addNewEntry()"
                    class="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm">
              <iconify-icon icon="carbon:add-alt" width="16"></iconify-icon>
              新增條目
            </button>
            <button onclick="window.glossaryEditorEnhanced.openImport()"
                    class="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 transition text-sm">
              <iconify-icon icon="carbon:import" width="16"></iconify-icon>
              匯入
            </button>
            <button onclick="window.glossaryEditorEnhanced.openExport()"
                    class="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 transition text-sm">
              <iconify-icon icon="carbon:export" width="16"></iconify-icon>
              匯出
            </button>
          </div>

          <!-- 智慧過濾配置 -->
          <div class="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:border-blue-400 transition text-sm ${set.enableSmartFilter ? 'bg-blue-50 border-blue-400' : ''}">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox"
                     ${set.enableSmartFilter ? 'checked' : ''}
                     onchange="window.glossaryEditorEnhanced.toggleSmartFilter(this.checked)"
                     class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
              <iconify-icon icon="carbon:filter" width="16" class="${set.enableSmartFilter ? 'text-blue-600' : 'text-gray-600'}"></iconify-icon>
              <span class="${set.enableSmartFilter ? 'text-blue-700 font-medium' : 'text-gray-700'}">智慧過濾</span>
            </label>
            <span class="text-gray-300">|</span>
            <label class="inline-flex items-center gap-1">
              <span class="text-xs text-gray-600">限制</span>
              <input type="number"
                     value="${set.maxTermsInPrompt || 50}"
                     min="1"
                     max="500"
                     onchange="window.glossaryEditorEnhanced.updateMaxTerms(parseInt(this.value))"
                     class="w-14 px-2 py-0.5 text-center border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm">
              <span class="text-xs text-gray-600">條</span>
            </label>
          </div>
        </div>

        <!-- 搜尋欄 -->
        <div class="flex gap-2">
          <div class="flex-1 relative">
            <iconify-icon icon="carbon:search" width="20"
                          class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></iconify-icon>
            <input type="text"
                   id="glossarySearchInput"
                   placeholder="搜尋術語或譯文..."
                   value="${escapeHtml(editorState.searchQuery)}"
                   class="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                   oninput="window.glossaryEditorEnhanced.handleSearch(this.value)">
            ${editorState.searchQuery ? `
              <button onclick="window.glossaryEditorEnhanced.clearSearch()"
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <iconify-icon icon="carbon:close-filled" width="20"></iconify-icon>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 批次操作欄 -->
        ${selectedCount > 0 ? `
          <div class="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <span class="text-sm text-blue-700 font-medium">已選擇 ${selectedCount} 條</span>
            <div class="flex-1"></div>
            <button onclick="window.glossaryEditorEnhanced.bulkEnable(true)"
                    class="text-sm text-blue-600 hover:text-blue-700 px-3 py-1 rounded hover:bg-blue-100">
              <iconify-icon icon="carbon:checkmark" width="16" class="inline-block"></iconify-icon>
              批次啟用
            </button>
            <button onclick="window.glossaryEditorEnhanced.bulkEnable(false)"
                    class="text-sm text-gray-600 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100">
              <iconify-icon icon="carbon:close" width="16" class="inline-block"></iconify-icon>
              批次禁用
            </button>
            <button onclick="window.glossaryEditorEnhanced.bulkDelete()"
                    class="text-sm text-red-600 hover:text-red-700 px-3 py-1 rounded hover:bg-red-100">
              <iconify-icon icon="carbon:trash-can" width="16" class="inline-block"></iconify-icon>
              批次刪除
            </button>
            <button onclick="window.glossaryEditorEnhanced.clearSelection()"
                    class="text-sm text-gray-600 hover:text-gray-700 px-3 py-1 rounded hover:bg-gray-100">
              取消選擇
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 渲染條目列表（分頁）
   */
  function renderEntriesList() {
    const container = document.getElementById('glossaryEntriesTable');
    if (!container) return;

    const start = (editorState.currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, editorState.filteredEntries.length);
    const pageEntries = editorState.filteredEntries.slice(start, end);

    if (pageEntries.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <iconify-icon icon="carbon:search" width="32" class="text-gray-300 mb-2"></iconify-icon>
          <p class="text-gray-500">${editorState.searchQuery ? '未找到比對的術語' : '暫無術語條目'}</p>
        </div>
      `;
      return;
    }

    const rows = pageEntries.map((entry, index) => {
      const globalIndex = start + index;
      const isSelected = editorState.selectedIds.has(entry.id);

      return `
        <tr class="border-b border-gray-100 hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}">
          <td class="px-3 py-2 text-center">
            <input type="checkbox"
                   ${isSelected ? 'checked' : ''}
                   onchange="window.glossaryEditorEnhanced.toggleSelection('${entry.id}')"
                   class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
          </td>
          <td class="px-3 py-2 text-gray-600 text-sm">${globalIndex + 1}</td>
          <td class="px-3 py-2">
            <input type="text"
                   value="${escapeHtml(entry.term)}"
                   onchange="window.glossaryEditorEnhanced.updateEntry('${entry.id}', 'term', this.value)"
                   class="w-full px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent">
          </td>
          <td class="px-3 py-2">
            <input type="text"
                   value="${escapeHtml(entry.translation)}"
                   onchange="window.glossaryEditorEnhanced.updateEntry('${entry.id}', 'translation', this.value)"
                   class="w-full px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent">
          </td>
          <td class="px-3 py-2 text-center">
            <input type="checkbox"
                   ${entry.caseSensitive ? 'checked' : ''}
                   onchange="window.glossaryEditorEnhanced.updateEntry('${entry.id}', 'caseSensitive', this.checked)"
                   class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
          </td>
          <td class="px-3 py-2 text-center">
            <input type="checkbox"
                   ${entry.wholeWord ? 'checked' : ''}
                   onchange="window.glossaryEditorEnhanced.updateEntry('${entry.id}', 'wholeWord', this.checked)"
                   class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
          </td>
          <td class="px-3 py-2 text-center">
            <input type="checkbox"
                   ${entry.enabled !== false ? 'checked' : ''}
                   onchange="window.glossaryEditorEnhanced.updateEntry('${entry.id}', 'enabled', this.checked)"
                   class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
          </td>
          <td class="px-3 py-2 text-center">
            <button onclick="window.glossaryEditorEnhanced.deleteEntry('${entry.id}')"
                    class="text-red-500 hover:text-red-700">
              <iconify-icon icon="carbon:trash-can" width="18"></iconify-icon>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-3 py-2 text-center w-12">
                <input type="checkbox"
                       ${editorState.selectAll ? 'checked' : ''}
                       onchange="window.glossaryEditorEnhanced.toggleSelectAll(this.checked)"
                       class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
              </th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase w-16">#</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">術語</th>
              <th class="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">譯文</th>
              <th class="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase w-24">區分大小寫</th>
              <th class="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase w-24">全詞比對</th>
              <th class="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase w-20">啟用</th>
              <th class="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="mt-4 text-sm text-gray-500 text-center">
        顯示 ${start + 1} - ${end} 條，共 ${editorState.filteredEntries.length.toLocaleString()} 條
      </div>
    `;
  }

  /**
   * 渲染分頁控制元件
   */
  function renderPagination() {
    const container = document.getElementById('glossaryEditorPagination');
    if (!container) return;

    if (editorState.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const currentPage = editorState.currentPage;
    const totalPages = editorState.totalPages;

    // 生成頁碼按鈕
    const pageButtons = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      // 顯示所有頁碼
      for (let i = 1; i <= totalPages; i++) {
        pageButtons.push(i);
      }
    } else {
      // 智慧顯示頁碼
      if (currentPage <= 4) {
        pageButtons.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pageButtons.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pageButtons.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }

    const buttonsHTML = pageButtons.map(page => {
      if (page === '...') {
        return '<span class="px-3 py-1 text-gray-400">...</span>';
      }

      const isActive = page === currentPage;
      return `
        <button onclick="window.glossaryEditorEnhanced.goToPage(${page})"
                class="px-3 py-1 rounded ${isActive
                  ? 'bg-blue-500 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'}">
          ${page}
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <div class="flex items-center justify-center gap-2 py-4">
        <button onclick="window.glossaryEditorEnhanced.goToPage(${currentPage - 1})"
                ${currentPage === 1 ? 'disabled' : ''}
                class="px-3 py-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <iconify-icon icon="carbon:chevron-left" width="20"></iconify-icon>
        </button>

        ${buttonsHTML}

        <button onclick="window.glossaryEditorEnhanced.goToPage(${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}
                class="px-3 py-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <iconify-icon icon="carbon:chevron-right" width="20"></iconify-icon>
        </button>
      </div>
    `;
  }

  /**
   * 處理搜尋
   * @param {string} query - 搜尋關鍵詞
   */
  function handleSearch(query) {
    editorState.searchQuery = query.trim();
    editorState.currentPage = 1;

    if (!editorState.searchQuery) {
      editorState.filteredEntries = [...editorState.allEntries];
    } else {
      const lowerQuery = editorState.searchQuery.toLowerCase();
      editorState.filteredEntries = editorState.allEntries.filter(entry => {
        return entry.term.toLowerCase().includes(lowerQuery) ||
               entry.translation.toLowerCase().includes(lowerQuery);
      });
    }

    editorState.totalPages = Math.ceil(editorState.filteredEntries.length / ITEMS_PER_PAGE);

    // 重新渲染
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
      renderPagination();
    }
  }

  /**
   * 清除搜尋
   */
  function clearSearch() {
    document.getElementById('glossarySearchInput').value = '';
    handleSearch('');
  }

  /**
   * 跳轉到指定頁
   * @param {number} page - 頁碼
   */
  function goToPage(page) {
    if (page < 1 || page > editorState.totalPages) return;
    editorState.currentPage = page;
    renderEntriesList();
    renderPagination();

    // 滾動到頂部
    const container = document.getElementById('glossaryEntriesTable');
    if (container) {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * 切換選擇
   * @param {string} entryId - 條目 ID
   */
  function toggleSelection(entryId) {
    if (editorState.selectedIds.has(entryId)) {
      editorState.selectedIds.delete(entryId);
    } else {
      editorState.selectedIds.add(entryId);
    }

    // 更新全選狀態
    editorState.selectAll = editorState.selectedIds.size === editorState.filteredEntries.length;

    // 重新渲染
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
    }
  }

  /**
   * 全選/取消全選
   * @param {boolean} checked - 是否選中
   */
  function toggleSelectAll(checked) {
    editorState.selectAll = checked;

    if (checked) {
      editorState.filteredEntries.forEach(entry => {
        editorState.selectedIds.add(entry.id);
      });
    } else {
      editorState.selectedIds.clear();
    }

    // 重新渲染
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
    }
  }

  /**
   * 清除選擇
   */
  function clearSelection() {
    editorState.selectedIds.clear();
    editorState.selectAll = false;

    // 重新渲染
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
    }
  }

  /**
   * 更新條目
   * @param {string} entryId - 條目 ID
   * @param {string} field - 欄位名
   * @param {any} value - 新值
   */
  function updateEntry(entryId, field, value) {
    const entry = editorState.allEntries.find(e => e.id === entryId);
    if (!entry) return;

    entry[field] = value;

    // 儲存到快取和 IndexedDB
    saveCurrentSet();
  }

  /**
   * 刪除條目
   * @param {string} entryId - 條目 ID
   */
  function deleteEntry(entryId) {
    if (!confirm('確認刪除該條目？')) return;

    editorState.allEntries = editorState.allEntries.filter(e => e.id !== entryId);
    editorState.filteredEntries = editorState.filteredEntries.filter(e => e.id !== entryId);
    editorState.selectedIds.delete(entryId);
    editorState.totalPages = Math.ceil(editorState.filteredEntries.length / ITEMS_PER_PAGE);

    // 調整當前頁
    if (editorState.currentPage > editorState.totalPages && editorState.totalPages > 0) {
      editorState.currentPage = editorState.totalPages;
    }

    // 儲存並重新渲染
    saveCurrentSet();
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
      renderPagination();
    }
  }

  /**
   * 批次啟用/禁用
   * @param {boolean} enabled - 是否啟用
   */
  function bulkEnable(enabled) {
    let count = 0;
    editorState.selectedIds.forEach(entryId => {
      const entry = editorState.allEntries.find(e => e.id === entryId);
      if (entry) {
        entry.enabled = enabled;
        count++;
      }
    });

    if (count > 0) {
      saveCurrentSet();
      renderEntriesList();
      alert(`已${enabled ? '啟用' : '禁用'} ${count} 條術語`);
    }
  }

  /**
   * 批次刪除
   */
  function bulkDelete() {
    const count = editorState.selectedIds.size;
    if (count === 0) return;

    if (!confirm(`確認刪除選中的 ${count} 條術語？此操作不可撤銷。`)) return;

    editorState.allEntries = editorState.allEntries.filter(e => !editorState.selectedIds.has(e.id));
    editorState.filteredEntries = editorState.filteredEntries.filter(e => !editorState.selectedIds.has(e.id));
    editorState.selectedIds.clear();
    editorState.selectAll = false;
    editorState.totalPages = Math.ceil(editorState.filteredEntries.length / ITEMS_PER_PAGE);

    // 調整當前頁
    if (editorState.currentPage > editorState.totalPages && editorState.totalPages > 0) {
      editorState.currentPage = editorState.totalPages;
    }

    // 儲存並重新渲染
    saveCurrentSet();
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
      renderPagination();
    }

    alert(`已刪除 ${count} 條術語`);
  }

  /**
   * 新增條目
   */
  function addNewEntry() {
    const newEntry = {
      id: generateUUID(),
      term: '',
      translation: '',
      caseSensitive: false,
      wholeWord: false,
      enabled: true
    };

    editorState.allEntries.unshift(newEntry); // 新增到開頭
    editorState.filteredEntries.unshift(newEntry);
    editorState.totalPages = Math.ceil(editorState.filteredEntries.length / ITEMS_PER_PAGE);
    editorState.currentPage = 1; // 跳轉到第一頁

    // 儲存並重新渲染
    saveCurrentSet();
    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (set) {
      renderToolbar(set);
      renderEntriesList();
      renderPagination();
    }
  }

  /**
   * 開啟匯入功能（複用舊版的匯入模態框）
   */
  function openImport() {
    if (typeof openGlossaryImportModal === 'function') {
      openGlossaryImportModal(editorState.currentSetId);
    } else {
      alert('匯入功能暫不可用');
    }
  }

  /**
   * 開啟匯出功能（複用舊版的匯出模態框）
   */
  function openExport() {
    if (typeof openGlossaryExportModal === 'function') {
      openGlossaryExportModal(editorState.currentSetId);
    } else {
      alert('匯出功能暫不可用');
    }
  }

  /**
   * 切換智慧過濾開關
   * @param {boolean} enabled - 是否啟用智慧過濾
   */
  function toggleSmartFilter(enabled) {
    if (!editorState.currentSetId) return;

    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (!set) return;

    // 更新配置
    set.enableSmartFilter = enabled;

    // 儲存到儲存（使用同步函式，會自動觸發非同步儲存）
    if (typeof renameGlossarySet === 'function') {
      // 觸發儲存（名稱不變，只更新後設資料）
      renameGlossarySet(editorState.currentSetId, set.name);
    }

    // 重新渲染工具列以顯示新狀態
    renderToolbar(set);

    // 提示使用者
    const message = enabled
      ? '已啟用智慧過濾：翻譯時自動過濾通用詞彙，只保留專業術語'
      : '已禁用智慧過濾：翻譯時使用所有比對的術語';

    if (typeof showNotification === 'function') {
      showNotification(message, 'success');
    } else {
      console.log(message);
    }
  }

  /**
   * 更新術語數量限制
   * @param {number} maxTerms - 最大術語數量
   */
  function updateMaxTerms(maxTerms) {
    if (!editorState.currentSetId) return;

    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (!set) return;

    // 驗證數值範圍
    if (isNaN(maxTerms) || maxTerms < 1) {
      maxTerms = 1;
    } else if (maxTerms > 500) {
      maxTerms = 500;
    }

    // 更新配置
    set.maxTermsInPrompt = maxTerms;

    // 儲存到儲存
    if (typeof renameGlossarySet === 'function') {
      renameGlossarySet(editorState.currentSetId, set.name);
    }

    // 重新渲染工具列
    renderToolbar(set);

    // 提示使用者
    const message = `已設定術語數量限制為 ${maxTerms} 條`;
    if (typeof showNotification === 'function') {
      showNotification(message, 'success');
    } else {
      console.log(message);
    }
  }

  /**
   * 儲存當前術語庫
   */
  function saveCurrentSet() {
    if (!editorState.currentSetId) return;

    const sets = window._glossarySetsCache || {};
    const set = sets[editorState.currentSetId];
    if (!set) return;

    // 更新條目
    set.entries = editorState.allEntries;

    // 儲存（使用 storage.js 的函式）
    if (typeof updateGlossarySetEntries === 'function') {
      updateGlossarySetEntries(editorState.currentSetId, editorState.allEntries);
    }
  }

  /**
   * 關閉編輯器
   */
  function closeEditor() {
    const panel = document.getElementById('glossaryEditorPanel');
    if (panel) {
      panel.classList.add('hidden');
      panel.dataset.editingId = '';
    }

    // 清空狀態
    editorState.currentSetId = null;
    editorState.allEntries = [];
    editorState.filteredEntries = [];
    editorState.selectedIds.clear();
    editorState.selectAll = false;
  }

  /**
   * HTML 轉義
   */
  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 暴露到全域
  window.glossaryEditorEnhanced = {
    open: openEnhancedEditor,
    close: closeEditor,
    handleSearch,
    clearSearch,
    goToPage,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    updateEntry,
    deleteEntry,
    bulkEnable,
    bulkDelete,
    addNewEntry,
    openImport,
    openExport,
    toggleSmartFilter,
    updateMaxTerms
  };

  console.log('[GlossaryEditorEnhanced] Enhanced editor loaded');
})();
