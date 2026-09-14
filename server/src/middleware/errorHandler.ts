import { AppError } from '../utils/errors.js';

/**
 * 統一錯誤處理中介軟體
 * 處理應用錯誤和未知錯誤
 */
export const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // 如果是 AppError，使用其狀態碼和訊息
  if (err instanceof AppError) {
    console.error(`[AppError] ${err.statusCode} ${err.message}`);

    return res.status(err.statusCode).json({
      error: err.message,
      // 開發環境返回詳細錯誤資訊
      ...(isProduction ? {} : {
        stack: err.stack,
        ...(req.id && { requestId: req.id })
      })
    });
  }

  // Prisma 錯誤處理
  if (err.code && err.code.startsWith('P')) {
    console.error('[Prisma Error]', err);

    // 常見的 Prisma 錯誤
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Unique constraint violation',
        ...(isProduction ? {} : { details: err.meta })
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Record not found',
        ...(isProduction ? {} : { details: err.meta })
      });
    }
  }

  // 未知錯誤
  console.error('[Unknown Error]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    // 明確檢查生產環境：僅開發環境返回 stack trace
    ...(isProduction ? {} : {
      stack: err.stack,
      // 可以新增請求 ID 用於追蹤（如果中介軟體新增了 req.id）
      ...(req.id && { requestId: req.id })
    })
  });
};
