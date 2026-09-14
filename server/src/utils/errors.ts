/**
 * 應用錯誤類
 * 用於統一錯誤處理，支援 HTTP 狀態碼
 */
export class AppError extends Error {
  /**
   * @param {string} message - 錯誤訊息
   * @param {number} statusCode - HTTP 狀態碼（預設 500）
   * @param {boolean} isOperational - 是否為操作錯誤（預設 true）
   */
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = 'AppError';

    // 保持正確的堆疊跟蹤
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * HTTP 狀態碼常量（用於匯出）
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * 常用錯誤工廠函式
 */
export const AppErrors = {
  /**
   * 未找到資源錯誤
   */
  notFound: (resource = 'Resource') => {
    return new AppError(`${resource} not found`, HTTP_STATUS.NOT_FOUND);
  },

  /**
   * 未授權錯誤
   */
  unauthorized: (message = 'Unauthorized') => {
    return new AppError(message, HTTP_STATUS.UNAUTHORIZED);
  },

  /**
   * 禁止訪問錯誤
   */
  forbidden: (message = 'Forbidden') => {
    return new AppError(message, HTTP_STATUS.FORBIDDEN);
  },

  /**
   * 驗證錯誤
   */
  validation: (message = 'Validation failed') => {
    return new AppError(message, HTTP_STATUS.BAD_REQUEST);
  },

  /**
   * 衝突錯誤
   */
  conflict: (message = 'Resource conflict') => {
    return new AppError(message, HTTP_STATUS.CONFLICT);
  },

  /**
   * 內部伺服器錯誤
   */
  internal: (message = 'Internal server error') => {
    return new AppError(message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

