<!-- 在現有的分頁導航後新增新分頁 -->

<!-- 在第 81-93 行之間插入以下按鈕 -->
<button onclick="switchTab('overview')" id="tab-overview"
    class="tab-button px-6 py-3 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap">
    概覽
</button>

<!-- 在使用者管理按鈕後新增 -->
<button onclick="switchTab('quotas')" id="tab-quotas"
    class="tab-button px-6 py-3 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap">
    配額管理
</button>

<button onclick="switchTab('activity')" id="tab-activity"
    class="tab-button px-6 py-3 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap">
    活動日誌
</button>


<!-- ======================== 概覽分頁內容 ======================== -->
<!-- 在現有分頁內容區域新增 -->

<div id="content-overview" class="p-6 hidden">
    <!-- 使用趨勢圖表 -->
    <div class="mb-8">
        <h3 class="text-lg font-medium mb-4">使用趨勢（最近30天）</h3>
        <div class="bg-white p-4 rounded-lg border">
            <canvas id="trendChart" height="80"></canvas>
        </div>
    </div>

    <!-- 文件狀態統計 -->
    <div class="mb-8">
        <h3 class="text-lg font-medium mb-4">文件狀態分佈</h3>
        <div id="documentsByStatus" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <!-- 動態載入 -->
        </div>
    </div>

    <!-- 最活躍使用者 -->
    <div>
        <h3 class="text-lg font-medium mb-4">Top 10 活躍使用者（本月）</h3>
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">排名</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">使用者</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">郵箱</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">文件數</th>
                    </tr>
                </thead>
                <tbody id="topUsersList" class="bg-white divide-y divide-gray-200">
                    <!-- 動態載入 -->
                </tbody>
            </table>
        </div>
    </div>
</div>


<!-- ======================== 配額管理分頁內容 ======================== -->

<div id="content-quotas" class="p-6 hidden">
    <div class="mb-4">
        <h3 class="text-lg font-medium mb-2">配額管理</h3>
        <p class="text-sm text-gray-600">為使用者設定文件數量和儲存空間限制（-1 表示無限制）</p>
    </div>

    <!-- 使用者選擇 -->
    <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">選擇使用者</label>
        <select id="quotaUserId" onchange="loadUserQuota()"
            class="block w-full px-3 py-2 border border-gray-300 rounded-md">
            <option value="">請選擇使用者...</option>
        </select>
    </div>

    <!-- 配額設定表單 -->
    <div id="quotaForm" class="hidden space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label class="block text-sm font-medium text-gray-700">每日文件限制</label>
                <input type="number" id="maxDocumentsPerDay"
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                <p class="mt-1 text-xs text-gray-500">-1 表示無限制</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">每月文件限制</label>
                <input type="number" id="maxDocumentsPerMonth"
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                <p class="mt-1 text-xs text-gray-500">-1 表示無限制</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">儲存空間限制（MB）</label>
                <input type="number" id="maxStorageSize"
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                <p class="mt-1 text-xs text-gray-500">-1 表示無限制</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">API Keys 數量限制</label>
                <input type="number" id="maxApiKeysCount"
                    class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                <p class="mt-1 text-xs text-gray-500">-1 表示無限制</p>
            </div>
        </div>

        <!-- 當前使用量 -->
        <div class="bg-gray-50 p-4 rounded-lg">
            <h4 class="text-sm font-medium text-gray-700 mb-3">當前使用量</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <div class="text-sm text-gray-600">本月文件數</div>
                    <div id="documentsThisMonthQuota" class="text-lg font-semibold">0</div>
                    <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div id="documentsProgressBar" class="bg-blue-600 h-2 rounded-full transition-all" style="width: 0%"></div>
                    </div>
                </div>
                <div>
                    <div class="text-sm text-gray-600">儲存使用（MB）</div>
                    <div id="currentStorageUsed" class="text-lg font-semibold">0</div>
                    <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div id="storageProgressBar" class="bg-green-600 h-2 rounded-full transition-all" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex space-x-4">
            <button onclick="saveUserQuota()"
                class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700">
                儲存配額
            </button>
            <button onclick="resetUserQuota()"
                class="bg-gray-200 px-6 py-2 rounded-md hover:bg-gray-300">
                重置使用量
            </button>
        </div>
    </div>
</div>


<!-- ======================== 活動日誌分頁內容 ======================== -->

<div id="content-activity" class="p-6 hidden">
    <div class="mb-6">
        <h3 class="text-lg font-medium mb-2">使用者活動日誌</h3>
        <div class="flex items-center space-x-4">
            <div class="flex-1">
                <label class="block text-sm font-medium text-gray-700 mb-2">選擇使用者</label>
                <select id="activityUserId" onchange="loadUserActivity()"
                    class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">請選擇使用者...</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">顯示條數</label>
                <select id="activityLimit" onchange="loadUserActivity()"
                    class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                </select>
            </div>
        </div>
    </div>

    <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">時間</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">資源ID</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">詳情</th>
                </tr>
            </thead>
            <tbody id="activityLogsList" class="bg-white divide-y divide-gray-200">
                <tr>
                    <td colspan="4" class="px-6 py-4 text-center text-gray-500">
                        請選擇使用者檢視活動日誌
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>


<!-- ======================== 在統計卡片下方新增額外統計 ======================== -->
<!-- 在第 75 行的統計卡片後新增 -->

<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm mb-2">本週處理</div>
        <div id="documentsThisWeek" class="text-2xl font-bold">-</div>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm mb-2">本月處理</div>
        <div id="documentsThisMonth" class="text-2xl font-bold">-</div>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm mb-2">總儲存使用</div>
        <div id="totalStorageMB" class="text-2xl font-bold">- MB</div>
    </div>
</div>
