import express from 'express';

const router = express.Router();

// 翻譯路由暫時為空，可以根據需要新增翻譯 API 代理

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'translation' });
});

export default router;
