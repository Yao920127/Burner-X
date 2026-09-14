/**
 * Cloudflare Worker - Academic Search API Proxy
 * 解決瀏覽器 CORS 限制，支援：
 * - Semantic Scholar
 * - PubMed
 * - CrossRef
 * - OpenAlex
 * - arXiv
 *
 * 特性：
 * - 速率限制（TPS/TPM）
 * - 每 IP 限制
 * - 服務級別限制
 */

// 簡單的記憶體速率限制器（生產環境建議使用 Durable Objects）
class RateLimiter {
  constructor() {
    this.requests = new Map(); // key -> { count, resetTime }
  }

  /**
   * 檢查是否超過速率限制
   * @param {string} key - 限制鍵（如 IP、服務名）
   * @param {number} limit - 限制數量
   * @param {number} windowMs - 時間視窗（毫秒）
   * @returns {Object} { allowed: boolean, remaining: number, resetIn: number }
   */
  check(key, limit, windowMs) {
    const now = Date.now();
    const record = this.requests.get(key);

    // 清理過期記錄
    if (record && now > record.resetTime) {
      this.requests.delete(key);
    }

    const current = this.requests.get(key);

    if (!current) {
      // 首次請求
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return {
        allowed: true,
        remaining: limit - 1,
        resetIn: windowMs
      };
    }

    if (current.count >= limit) {
      // 超過限制
      return {
        allowed: false,
        remaining: 0,
        resetIn: current.resetTime - now
      };
    }

    // 增加計數
    current.count++;
    this.requests.set(key, current);

    return {
      allowed: true,
      remaining: limit - current.count,
      resetIn: current.resetTime - now
    };
  }

  /**
   * 定期清理過期記錄（防止記憶體洩漏）
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// 全域速率限制器例項
const rateLimiter = new RateLimiter();

// Cloudflare Workers 中不需要定期清理，Worker 例項是短暫的
// 如果需要持久化速率限制，建議使用 Durable Objects

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // OPTIONS 預檢請求
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    // 身份驗證
    const authResult = await authenticate(request, env);
    if (!authResult.success) {
      return jsonResponse({ error: authResult.error }, 401, request, env);
    }

    // 速率限制檢查
    const rateLimitResult = await checkRateLimit(request, env, url.pathname);
    if (!rateLimitResult.allowed) {
      return jsonResponse({
        error: 'Rate limit exceeded',
        message: rateLimitResult.message,
        retryAfter: Math.ceil(rateLimitResult.resetIn / 1000)
      }, 429, request, env, {
        'X-RateLimit-Limit': rateLimitResult.limit,
        'X-RateLimit-Remaining': rateLimitResult.remaining,
        'X-RateLimit-Reset': new Date(Date.now() + rateLimitResult.resetIn).toISOString(),
        'Retry-After': Math.ceil(rateLimitResult.resetIn / 1000)
      });
    }

    // 路由處理
    try {
      // ===== Semantic Scholar 路由 =====
      if (url.pathname.startsWith('/api/semanticscholar/')) {
        const path = url.pathname.replace('/api/semanticscholar/', '');
        return await proxySemanticScholar(path, url.searchParams, request, env);
      }

      // ===== PubMed 路由 =====
      if (url.pathname.startsWith('/api/pubmed/')) {
        const path = url.pathname.replace('/api/pubmed/', '');
        return await proxyPubMed(path, url.searchParams, request, env);
      }

      // ===== CrossRef 路由 =====
      if (url.pathname.startsWith('/api/crossref/')) {
        const path = url.pathname.replace('/api/crossref/', '');
        return await proxyCrossRef(path, url.searchParams, request, env);
      }

      // ===== OpenAlex 路由 =====
      if (url.pathname.startsWith('/api/openalex/')) {
        const path = url.pathname.replace('/api/openalex/', '');
        return await proxyOpenAlex(path, url.searchParams, request, env);
      }

      // ===== arXiv 路由 =====
      if (url.pathname.startsWith('/api/arxiv/')) {
        const path = url.pathname.replace('/api/arxiv/', '');
        return await proxyArXiv(path, url.searchParams, request, env);
      }

      // ===== PDF 下載代理（支援 Range 請求，用於分片下載） =====
      if (url.pathname === '/api/pdf/download' && (request.method === 'GET' || request.method === 'HEAD')) {
        const pdfUrl = url.searchParams.get('url');
        return await proxyPdfDownload(pdfUrl, request, env);
      }

      // ===== 健康檢查 =====
      if (url.pathname === '/health' && request.method === 'GET') {
        // 檢查透傳的 API Key（前端在健康檢查時可帶上）
        const hasTransmittedApiKey = request.headers.get('X-Api-Key');

        return jsonResponse({
          status: 'ok',
          timestamp: Date.now(),
          services: {
            semanticscholar: {
              enabled: true,
              hasApiKey: !!env.SEMANTIC_SCHOLAR_API_KEY || !!hasTransmittedApiKey
            },
            pubmed: {
              enabled: true,
              hasApiKey: !!env.PUBMED_API_KEY || !!hasTransmittedApiKey
            },
            crossref: { enabled: true },
            openalex: { enabled: true },
            arxiv: { enabled: true }
          },
          // 認證與金鑰來源資訊
          authentication: {
            hasTransmittedApiKey: !!hasTransmittedApiKey,
            hasEnvironmentKey: !!env.SEMANTIC_SCHOLAR_API_KEY || !!env.PUBMED_API_KEY,
            source: hasTransmittedApiKey
              ? 'transmitted'
              : (env.SEMANTIC_SCHOLAR_API_KEY || env.PUBMED_API_KEY)
                ? 'environment'
                : 'none',
            required: env.ENABLE_AUTH === 'true'
          },
          rateLimit: {
            enabled: env.RATE_LIMIT_ENABLED === 'true',
            tps: parseInt(env.RATE_LIMIT_TPS) || 10,
            tpm: parseInt(env.RATE_LIMIT_TPM) || 300,
            perIpTps: parseInt(env.RATE_LIMIT_PER_IP_TPS) || 5,
            perIpTpm: parseInt(env.RATE_LIMIT_PER_IP_TPM) || 100,
            // 服務級別速率限制
            services: {
              pubmed: {
                tps: parseInt(env.RATE_LIMIT_PUBMED_TPS) || 10,
                tpm: parseInt(env.RATE_LIMIT_PUBMED_TPM) || 300
              },
              semanticscholar: {
                tps: parseInt(env.RATE_LIMIT_SEMANTICSCHOLAR_TPS) || 10,
                tpm: parseInt(env.RATE_LIMIT_SEMANTICSCHOLAR_TPM) || 300
              }
            }
          }
        }, 200, request, env);
      }

      return jsonResponse({ error: 'Not Found' }, 404, request, env);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: error.message || 'Internal Server Error' }, 500, request, env);
    }
  },
};

/**
 * 速率限制檢查
 */
async function checkRateLimit(request, env, pathname) {
  if (env.RATE_LIMIT_ENABLED !== 'true') {
    return { allowed: true };
  }

  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  // 1. 全域 TPS 限制
  const globalTps = parseInt(env.RATE_LIMIT_TPS) || 10;
  const globalTpsResult = rateLimiter.check('global:tps', globalTps, 1000);
  if (!globalTpsResult.allowed) {
    return {
      allowed: false,
      message: 'Global TPS limit exceeded',
      limit: globalTps,
      remaining: 0,
      resetIn: globalTpsResult.resetIn
    };
  }

  // 2. 全域 TPM 限制
  const globalTpm = parseInt(env.RATE_LIMIT_TPM) || 300;
  const globalTpmResult = rateLimiter.check('global:tpm', globalTpm, 60000);
  if (!globalTpmResult.allowed) {
    return {
      allowed: false,
      message: 'Global TPM limit exceeded',
      limit: globalTpm,
      remaining: 0,
      resetIn: globalTpmResult.resetIn
    };
  }

  // 3. 每 IP TPS 限制
  const perIpTps = parseInt(env.RATE_LIMIT_PER_IP_TPS) || 5;
  const perIpTpsResult = rateLimiter.check(`ip:${clientIP}:tps`, perIpTps, 1000);
  if (!perIpTpsResult.allowed) {
    return {
      allowed: false,
      message: 'IP TPS limit exceeded',
      limit: perIpTps,
      remaining: 0,
      resetIn: perIpTpsResult.resetIn
    };
  }

  // 4. 每 IP TPM 限制
  const perIpTpm = parseInt(env.RATE_LIMIT_PER_IP_TPM) || 100;
  const perIpTpmResult = rateLimiter.check(`ip:${clientIP}:tpm`, perIpTpm, 60000);
  if (!perIpTpmResult.allowed) {
    return {
      allowed: false,
      message: 'IP TPM limit exceeded',
      limit: perIpTpm,
      remaining: 0,
      resetIn: perIpTpmResult.resetIn
    };
  }

  // 5. 服務級別限制
  let serviceName = null;
  if (pathname.startsWith('/api/pubmed/')) {
    serviceName = 'pubmed';
  } else if (pathname.startsWith('/api/semanticscholar/')) {
    serviceName = 'semanticscholar';
  }

  if (serviceName) {
    const serviceTpsKey = `RATE_LIMIT_${serviceName.toUpperCase()}_TPS`;
    const serviceTpmKey = `RATE_LIMIT_${serviceName.toUpperCase()}_TPM`;
    const serviceTps = parseInt(env[serviceTpsKey]) || 10;
    const serviceTpm = parseInt(env[serviceTpmKey]) || 300;

    const serviceTpsResult = rateLimiter.check(`service:${serviceName}:tps`, serviceTps, 1000);
    if (!serviceTpsResult.allowed) {
      return {
        allowed: false,
        message: `${serviceName} TPS limit exceeded`,
        limit: serviceTps,
        remaining: 0,
        resetIn: serviceTpsResult.resetIn
      };
    }

    const serviceTpmResult = rateLimiter.check(`service:${serviceName}:tpm`, serviceTpm, 60000);
    if (!serviceTpmResult.allowed) {
      return {
        allowed: false,
        message: `${serviceName} TPM limit exceeded`,
        limit: serviceTpm,
        remaining: 0,
        resetIn: serviceTpmResult.resetIn
      };
    }
  }

  return {
    allowed: true,
    remaining: Math.min(globalTpsResult.remaining, perIpTpsResult.remaining),
    resetIn: Math.max(globalTpsResult.resetIn, perIpTpsResult.resetIn)
  };
}

/**
 * 身份驗證
 */
async function authenticate(request, env) {
  if (env.ENABLE_AUTH !== 'true') {
    return { success: true };
  }

  if (env.ALLOWED_ORIGINS) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    if (!origin || !allowedOrigins.includes(origin)) {
      return { success: false, error: 'Origin not allowed' };
    }
  }

  if (env.AUTH_SECRET) {
    const authKey = request.headers.get('X-Auth-Key');
    if (!authKey || authKey !== env.AUTH_SECRET) {
      return { success: false, error: 'Invalid auth key' };
    }
  }

  return { success: true };
}

/**
 * Semantic Scholar 代理
 */
async function proxySemanticScholar(path, searchParams, request, env) {
  const apiKey = request.headers.get('X-Api-Key') || env.SEMANTIC_SCHOLAR_API_KEY;

  const url = `https://api.semanticscholar.org/${path}?${searchParams.toString()}`;

  const headers = {
    'User-Agent': 'Academic-Search-Proxy/1.0'
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  console.log(`[Semantic Scholar] Proxying: ${request.method} ${url}`);

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: headers
    });

    const data = await response.json();
    return jsonResponse(data, response.status, request, env);
  } catch (error) {
    console.error('[Semantic Scholar] Proxy error:', error);
    return jsonResponse({
      error: 'Semantic Scholar upstream error',
      message: error.message
    }, 503, request, env);
  }
}

/**
 * PubMed 代理
 */
async function proxyPubMed(path, searchParams, request, env) {
  const apiKey = request.headers.get('X-Api-Key') || env.PUBMED_API_KEY;

  if (apiKey) {
    searchParams.set('api_key', apiKey);
  }

  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${path}?${searchParams.toString()}`;

  console.log(`[PubMed] Proxying: ${request.method} ${url}`);

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: {
        'User-Agent': 'Academic-Search-Proxy/1.0'
      }
    });

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('xml')) {
      const text = await response.text();
      return new Response(text, {
        status: response.status,
        headers: addCORSHeaders({
          'Content-Type': 'application/xml'
        }, request, env)
      });
    } else if (contentType && contentType.includes('json')) {
      const data = await response.json();
      return jsonResponse(data, response.status, request, env);
    }

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: addCORSHeaders({}, request, env)
    });
  } catch (error) {
    console.error('[PubMed] Proxy error:', error);
    return jsonResponse({
      error: 'PubMed upstream error',
      message: error.message
    }, 503, request, env);
  }
}

/**
 * CrossRef 代理
 */
async function proxyCrossRef(path, searchParams, request, env) {
  const url = `https://api.crossref.org/${path}?${searchParams.toString()}`;

  console.log(`[CrossRef] Proxying: ${request.method} ${url}`);

  const response = await fetch(url, {
    method: request.method,
    headers: {
      'User-Agent': 'Academic-Search-Proxy/1.0'
    }
  });

  const data = await response.json();
  return jsonResponse(data, response.status, request, env);
}

/**
 * OpenAlex 代理
 */
async function proxyOpenAlex(path, searchParams, request, env) {
  const url = `https://api.openalex.org/${path}?${searchParams.toString()}`;

  console.log(`[OpenAlex] Proxying: ${request.method} ${url}`);

  const response = await fetch(url, {
    method: request.method,
    headers: {
      'User-Agent': 'Academic-Search-Proxy/1.0'
    }
  });

  const data = await response.json();
  return jsonResponse(data, response.status, request, env);
}

/**
 * arXiv 代理
 */
async function proxyArXiv(path, searchParams, request, env) {
  const url = `http://export.arxiv.org/api/${path}?${searchParams.toString()}`;

  console.log(`[arXiv] Proxying: ${request.method} ${url}`);

  try {
    const response = await fetch(url, {
      method: request.method
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: addCORSHeaders({
        'Content-Type': 'application/xml'
      }, request, env)
    });
  } catch (error) {
    console.error('[arXiv] Proxy error:', error);
    return jsonResponse({
      error: 'arXiv upstream error',
      message: error.message
    }, 503, request, env);
  }
}

/**
 * PDF 下載代理（支援 Range 請求，用於大檔案分片下載）
 * @param {string} pdfUrl - PDF 檔案的遠端 URL
 * @param {Request} request - 請求物件
 * @param {Object} env - 環境變數
 * @returns {Response} - 響應物件
 */
async function proxyPdfDownload(pdfUrl, request, env) {
  try {
    if (!pdfUrl) {
      return jsonResponse({ error: 'url parameter is required' }, 400, request, env);
    }

    // 驗證 URL 格式
    let targetUrl;
    try {
      targetUrl = new URL(pdfUrl);
    } catch (e) {
      return jsonResponse({ error: 'Invalid URL format' }, 400, request, env);
    }

    // 構建上游請求頭，透傳 Range 頭（支援分片下載）
    const upstreamHeaders = {
      'User-Agent': 'Academic-Search-Proxy/1.0',
    };

    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
      console.log('[PDF Download] Proxying Range request:', rangeHeader);
    }

    console.log(`[PDF Download] Fetching: ${request.method} ${pdfUrl}`);

    const response = await fetch(pdfUrl, {
      method: request.method || 'GET',
      headers: upstreamHeaders,
      redirect: 'follow'
    });

    if (!response.ok && response.status !== 206) {
      console.error(`[PDF Download] Upstream fetch failed: ${response.status} ${response.statusText}`);
      return jsonResponse({
        error: `Upstream fetch failed: ${response.status} ${response.statusText}`
      }, 502, request, env);
    }

    const upstreamContentType = response.headers.get('Content-Type');
    console.log(`[PDF Download] Upstream Content-Type: ${upstreamContentType}, Status: ${response.status}`);

    // 構建響應頭
    const responseHeaders = addCORSHeaders({
      'Content-Type': upstreamContentType || 'application/pdf',
      'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment',
      'Cache-Control': 'no-store',
    }, request, env);

    // 透傳 Range 相關標頭
    if (response.headers.has('Content-Length')) {
      responseHeaders['Content-Length'] = response.headers.get('Content-Length');
    }
    if (response.headers.has('Content-Range')) {
      responseHeaders['Content-Range'] = response.headers.get('Content-Range');
    }
    if (response.headers.has('Accept-Ranges')) {
      responseHeaders['Accept-Ranges'] = response.headers.get('Accept-Ranges');
    }

    // 暴露必要的標頭給前端
    responseHeaders['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition';

    console.log(`[PDF Download] Proxying successful: ${response.status} ${response.statusText}`);

    return new Response(response.body, {
      status: response.status, // 保持原始狀態碼（200 或 206）
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[PDF Download] Proxy error:', error);
    return jsonResponse({
      error: 'PDF download proxy error',
      message: error.message
    }, 500, request, env);
  }
}

/**
 * 處理 CORS 預檢請求
 */
function handleCORS(request, env) {
  return new Response(null, {
    status: 204,
    headers: addCORSHeaders({}, request, env)
  });
}

/**
 * 新增 CORS 頭
 */
function addCORSHeaders(headers, request, env) {
  const origin = request.headers.get('Origin') || '*';

  return {
    ...headers,
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, X-Auth-Key, X-Api-Key',
    'Access-Control-Max-Age': '86400'
  };
}

/**
 * 返回 JSON 響應
 */
function jsonResponse(data, status, request, env, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: addCORSHeaders({
      'Content-Type': 'application/json',
      ...additionalHeaders
    }, request, env)
  });
}
