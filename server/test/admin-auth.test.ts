import request from 'supertest';
import { app } from '../src/index.js';

describe('Admin routes require auth', () => {
  it('GET /api/admin/stats should 401 without token', async () => {
    const res = await request(app).get('/api/admin/stats');
    // 統一鑑權中介軟體返回 401 或 403，取其一斷言
    expect([401, 403]).toContain(res.status);
  });

  it('PUT /api/admin/config should 401 without token', async () => {
    const res = await request(app)
      .put('/api/admin/config')
      .send({ key: 'ALLOW_REGISTRATION', value: 'false' });
    expect([401, 403]).toContain(res.status);
  });
});
