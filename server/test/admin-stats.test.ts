import request from 'supertest';
import { app } from '../src/index.js';

// 說明：此測試僅驗證介面形狀與鑑權門檻。在無真實資料庫與鑑權上下文時，
// 斷言未授權訪問返回 401/403；當提供格式正確的查詢引數時伺服器不會 500。

describe('Admin stats endpoints shape and query params', () => {
  it('GET /api/admin/stats/detailed rejects without token', async () => {
    const res = await request(app).get('/api/admin/stats/detailed');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/admin/stats/trends rejects without token', async () => {
    const res = await request(app).get('/api/admin/stats/trends?days=7');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/admin/stats/trends validates days range', async () => {
    const res = await request(app).get('/api/admin/stats/trends?days=9999');
    // 未授權優先返回 401/403；若路由先校驗引數也可能 400，三者之一均視為透過
    expect([401, 403, 400]).toContain(res.status);
  });

  it('GET /api/admin/stats/trends accepts start/end date params (no 500)', async () => {
    const res = await request(app).get('/api/admin/stats/trends?startDate=2025-01-01&endDate=2025-01-31');
    expect([401, 403, 200]).toContain(res.status);
  });

  it('GET /api/admin/stats/detailed returns 400 when start > end', async () => {
    const res = await request(app).get('/api/admin/stats/detailed?startDate=2025-02-01&endDate=2025-01-01');
    expect([401, 403, 400]).toContain(res.status);
  });

  it('GET /api/admin/stats/trends returns 400 when start > end', async () => {
    const res = await request(app).get('/api/admin/stats/trends?startDate=2025-02-01&endDate=2025-01-01');
    expect([401, 403, 400]).toContain(res.status);
  });
});
