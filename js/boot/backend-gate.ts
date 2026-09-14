// backend-gate.js — 在“後端模式”未登入時，攔截並跳轉到登入頁
// 適用範圍：主站/落地頁/其他靜態頁面（不影響 /admin 管理臺）

(function () {
  try {
    var loc = window.location;
    var path = loc.pathname || '';

    // 純本地檔案訪問（file://）時，強制視為前端模式：不做任何後端探測或跳轉
    if (loc.protocol === 'file:') return;

    // 排除管理臺與登入頁自身
    if (path.startsWith('/admin') || path.endsWith('/login.html')) return;

    function q(key) {
      try { return new URLSearchParams(loc.search).get(key); } catch { return null; }
    }

    function normalizeRedirectParam(urlObj) {
      try {
        var red = urlObj.searchParams.get('redirect');
        if (!red) return;
        function deepDecode(s, limit) {
          var i = 0, prev = s;
          while (i++ < (limit || 8)) {
            try {
              var next = decodeURIComponent(prev);
              if (next === prev) break;
              prev = next;
            } catch { break; }
          }
          return prev;
        }
        var decoded = deepDecode(red, 8);
        // 連續巢狀或超長，直接歸一為首頁
        if (red.length > 512 || decoded.length > 512 || decoded.indexOf('/login.html?redirect=') !== -1) {
          urlObj.searchParams.set('redirect', '/');
          return;
        }
        var target = null;
        try { target = new URL(decoded, urlObj.origin); } catch {}
        if (!target || target.origin !== urlObj.origin || target.pathname.endsWith('/login.html')) {
          urlObj.searchParams.set('redirect', '/');
        }
      } catch {}
    }

    function modeForced() {
      var m = (q('mode') || '').toLowerCase();
      if (m === 'backend') return true;
      var env = (window.ENV_DEPLOYMENT_MODE || '').toLowerCase();
      return env === 'backend';
    }

    function modeFrontendForced() {
      var m = (q('mode') || '').toLowerCase();
      return m === 'frontend';
    }

    function hasToken() {
      try { return !!localStorage.getItem('auth_token'); } catch { return false; }
    }

    function buildSafeRedirectTarget() {
      try {
        var u = new URL(window.location.href);
        // 避免遞迴巢狀：去除已有的 redirect 引數
        u.searchParams.delete('redirect');
        // 若當前已是登入頁，則回首頁
        if (u.pathname.endsWith('/login.html')) {
          u.pathname = '/';
          u.search = '';
        }
        // 限制同源
        if (u.origin !== window.location.origin) return '/';
        return u.toString();
      } catch { return '/'; }
    }

    function redirectToLogin() {
      // 如果當前 URL 已包含 redirect 指向 login.html（異常巢狀），則強制回首頁
      try {
        var current = new URL(window.location.href);
        normalizeRedirectParam(current);
        // 將標準化後的當前 URL 寫回，避免下次讀取到異常 redirect
        history.replaceState(null, '', current.toString());
      } catch {}
      var safe = encodeURIComponent(buildSafeRedirectTarget());
      window.location.replace('/login.html?redirect=' + safe);
    }

    function gateIfBackendKnown() {
      // 若明確為後端模式，且未登入且未顯式前端繞過 → 跳轉登入
      if (modeFrontendForced()) return; // 允許 ?mode=frontend 繞過
      if (hasToken()) return;
      redirectToLogin();
    }

    async function healthCheck(timeoutMs) {
      try {
        var ctrl = new AbortController();
        var id = setTimeout(function(){ try{ctrl.abort();}catch{} }, timeoutMs);
        var base = window.ENV_API_BASE_URL || '/api';
        var res = await fetch(base + '/health', { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(id);
        return !!(res && res.ok);
      } catch { return false; }
    }

    // 情況 1：已強制後端 → 立即門禁
    if (modeForced()) {
      gateIfBackendKnown();
      return;
    }

    // 情況 2：依賴 storage-adapter 的自動切換事件（若其已載入）
    if (typeof window !== 'undefined') {
      window.addEventListener('pb:storage-mode-changed', function (evt) {
        if (evt && evt.detail && evt.detail.mode === 'backend') gateIfBackendKnown();
      });
    }

    // 情況 3：頁面未載入 storage-adapter（例如落地頁）→ 自行做一次短健康檢查
    // 僅當未顯式前端繞過時執行
    if (!modeFrontendForced()) {
      healthCheck(700).then(function (hasBackend) {
        if (hasBackend) gateIfBackendKnown();
      });
    }
  } catch (e) {
    // 忽略所有門禁過程中的異常，避免影響前端模式體驗
  }
})();
