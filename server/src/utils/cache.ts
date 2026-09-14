// 輕量 TTL 快取：預設使用程式內 Map；如配置了 REDIS_URL，則優先使用 Redis。
// 多例項生產建議配置 Redis，以獲得跨例項共享快取；未配置則自動降級為記憶體快取（開箱即用）。

let useRedis = !!process.env.REDIS_URL;
let redisClient = null;
let redisReady = false;

if (useRedis) {
  try {
    // 延遲載入依賴，避免未安裝時報錯；無 REDIS_URL 時不觸發
    const { createClient } = await import('redis');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      console.warn('[cache] Redis error, fallback to memory:', err?.message || err);
      useRedis = false;
      redisReady = false;
    });
    await redisClient.connect();
    redisReady = true;
    console.log('[cache] Redis connected for admin stats cache');
  } catch (e) {
    // 未安裝 redis 包或連線失敗，降級
    useRedis = false;
    redisReady = false;
    if (process.env.REDIS_URL) {
      console.warn('[cache] Redis not available, fallback to memory:', e?.message || e);
    }
  }
}

const store = new Map(); // key -> { value, expiresAt }
const epochStore = new Map(); // ns -> number

/**
 * 讀取快取
 * @param {string} key
 * @returns {any|null}
 */
export function cacheGet(key) {
  try {
    if (useRedis && redisReady) {
      return redisClient.get(key).then((val) => {
        if (val == null) return null;
        try { return JSON.parse(val); } catch { return null; }
      }).catch(() => null);
    }
    const hit = store.get(key);
    if (!hit) return null;
    if (hit.expiresAt && hit.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return hit.value;
  } catch {
    return null;
  }
}

/**
 * 寫入快取
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs - 過期時間（毫秒）
 */
export function cacheSet(key, value, ttlMs = 30000) {
  if (useRedis && redisReady) {
    try {
      const payload = JSON.stringify(value);
      if (ttlMs > 0) {
        // PX 以毫秒為單位
        return redisClient.set(key, payload, { PX: ttlMs });
      }
      return redisClient.set(key, payload);
    } catch {
      // ignore and fallback
    }
  }
  const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
  store.set(key, { value, expiresAt });
}

/**
 * 刪除快取（單鍵）
 * @param {string} key
 */
export function cacheDel(key) {
  if (useRedis && redisReady) {
    try { return redisClient.del(key); } catch { /* ignore */ }
  }
  store.delete(key);
}

/**
 * 按字首刪除快取（批次）
 * @param {string} prefix
 * @returns {number} 刪除條數
 */
export function cacheDelByPrefix(prefix) {
  let count = 0;
  if (useRedis && redisReady) {
    // 注意：SCAN 按需實現，這裡不強求；若使用 Redis，建議使用規範化 key 字首
    // 為避免高複雜度，這裡只清理記憶體副本；Redis 端清理依賴上層採用版本號或更細粒度 key
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) { store.delete(key); count++; }
  }
  return count;
}

/**
 * 獲取名稱空間的 epoch（用於全域失效）。
 * Redis 存在時讀取 `${ns}:epoch`，否則使用記憶體 Map。
 */
export async function cacheGetEpoch(ns) {
  if (useRedis && redisReady) {
    try {
      const v = await redisClient.get(`${ns}:epoch`);
      return Number.isFinite(parseInt(v)) ? parseInt(v) : 0;
    } catch { return 0; }
  }
  return epochStore.get(ns) || 0;
}

/**
 * 遞增名稱空間的 epoch（寫操作後呼叫）。
 */
export async function cacheBumpEpoch(ns) {
  if (useRedis && redisReady) {
    try {
      await redisClient.incr(`${ns}:epoch`);
      return;
    } catch { /* ignore */ }
  }
  const cur = epochStore.get(ns) || 0;
  epochStore.set(ns, cur + 1);
}
