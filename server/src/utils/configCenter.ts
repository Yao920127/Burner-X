import { prisma } from './prisma.js';

// 簡單記憶體快取（可配置 TTL）
const TTL_MS = parseInt(process.env.CONFIG_CACHE_TTL_MS || '30000', 10);
const cache = new Map(); // key -> { value, expireAt }

function now() { return Date.now(); }

function getCached(key) {
  const item = cache.get(key);
  if (!item) return undefined;
  if (item.expireAt <= now()) {
    cache.delete(key);
    return undefined;
  }
  return item.value;
}

function setCached(key, value) {
  cache.set(key, { value, expireAt: now() + TTL_MS });
}

export async function getSystemConfigValue(key) {
  const cached = getCached(`cfg:${key}`);
  if (cached !== undefined) return cached;
  try {
    const rec = await prisma.systemConfig.findUnique({ where: { key } });
    const value = rec ? rec.value : null;
    setCached(`cfg:${key}`, value);
    return value;
  } catch {
    // 查詢失敗時不快取，避免長時間錯誤
    return null;
  }
}

function parseDomainList(input) {
  if (!input || typeof input !== 'string') return [];
  return input
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function extractHostFromUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function getProxySettings() {
  // 讀取系統配置（DB 優先，ENV 兜底）
  const [dbWhitelist, dbAllowHttp, dbTimeout, dbMaxMb, dbWorkerDomains] = await Promise.all([
    getSystemConfigValue('PROXY_WHITELIST_DOMAINS'),
    getSystemConfigValue('ALLOW_HTTP_PROXY'),
    getSystemConfigValue('OCR_UPSTREAM_TIMEOUT_MS'),
    getSystemConfigValue('MAX_PROXY_DOWNLOAD_MB'),
    getSystemConfigValue('WORKER_PROXY_DOMAINS'),
  ]);

  // 手動配置域
  const manualWhitelist = parseDomainList((dbWhitelist ?? process.env.PROXY_WHITELIST_DOMAINS) || '');
  const workerDomains = parseDomainList((dbWorkerDomains ?? process.env.WORKER_PROXY_DOMAINS) || '');

  // 全域自定義源站（管理員配置）
  let customSiteDomains = [];
  try {
    const globalSites = await prisma.customSourceSite.findMany({ where: { userId: null }, select: { apiBaseUrl: true } });
    const set = new Set();
    for (const s of globalSites) {
      const host = extractHostFromUrl(s.apiBaseUrl);
      if (host) set.add(host);
    }
    customSiteDomains = Array.from(set);
  } catch {
    customSiteDomains = [];
  }

  // 常用第三方預設域（可按需擴充）
  const defaultVendors = ['mineru.net', 'v2.doc2x.noedgeai.com'];

  // 合併域名集合
  const domainSet = new Set([
    ...defaultVendors,
    ...manualWhitelist,
    ...workerDomains,
    ...customSiteDomains,
  ].map(d => d.toLowerCase()));

  const whitelist = Array.from(domainSet);
  const allowHttp = String((dbAllowHttp ?? process.env.ALLOW_HTTP_PROXY) || 'false').toLowerCase() === 'true';
  const timeoutMs = parseInt((dbTimeout ?? process.env.OCR_UPSTREAM_TIMEOUT_MS) || '30000', 10);
  const maxMb = parseInt((dbMaxMb ?? process.env.MAX_PROXY_DOWNLOAD_MB) || '100', 10);

  const maxDownloadBytes = Math.max(1, maxMb) * 1024 * 1024;
  const finalTimeout = Math.max(1000, timeoutMs);

  return { whitelist, allowHttp, timeoutMs: finalTimeout, maxDownloadBytes };
}

// 返回帶來源拆解的詳細設定，便於管理端展示
export async function getProxySettingsDetailed() {
  const [dbWhitelist, dbAllowHttp, dbTimeout, dbMaxMb, dbWorkerDomains] = await Promise.all([
    getSystemConfigValue('PROXY_WHITELIST_DOMAINS'),
    getSystemConfigValue('ALLOW_HTTP_PROXY'),
    getSystemConfigValue('OCR_UPSTREAM_TIMEOUT_MS'),
    getSystemConfigValue('MAX_PROXY_DOWNLOAD_MB'),
    getSystemConfigValue('WORKER_PROXY_DOMAINS'),
  ]);

  const manualWhitelist = parseDomainList((dbWhitelist ?? process.env.PROXY_WHITELIST_DOMAINS) || '');
  const workerDomains = parseDomainList((dbWorkerDomains ?? process.env.WORKER_PROXY_DOMAINS) || '');

  let customSiteDomains = [];
  try {
    const globalSites = await prisma.customSourceSite.findMany({ where: { userId: null }, select: { apiBaseUrl: true } });
    const set = new Set();
    for (const s of globalSites) {
      const host = extractHostFromUrl(s.apiBaseUrl);
      if (host) set.add(host);
    }
    customSiteDomains = Array.from(set);
  } catch {
    customSiteDomains = [];
  }

  const defaultVendors = ['mineru.net', 'v2.doc2x.noedgeai.com'];
  const merged = Array.from(new Set([...defaultVendors, ...manualWhitelist, ...workerDomains, ...customSiteDomains].map(d => d.toLowerCase())));

  const allowHttp = String((dbAllowHttp ?? process.env.ALLOW_HTTP_PROXY) || 'false').toLowerCase() === 'true';
  const timeoutMs = Math.max(1000, parseInt((dbTimeout ?? process.env.OCR_UPSTREAM_TIMEOUT_MS) || '30000', 10));
  const maxMb = parseInt((dbMaxMb ?? process.env.MAX_PROXY_DOWNLOAD_MB) || '100', 10);
  const maxDownloadBytes = Math.max(1, maxMb) * 1024 * 1024;

  return {
    sources: {
      defaults: defaultVendors,
      manualWhitelist,
      workerDomains,
      customSiteDomains,
    },
    effective: {
      whitelist: merged,
      allowHttp,
      timeoutMs,
      maxDownloadBytes,
    }
  };
}

// 使配置快取立即失效（便於“立即應用配置”）
export function invalidateAllConfigCache() {
  cache.clear();
}

export default {
  getSystemConfigValue,
  getProxySettings,
};
