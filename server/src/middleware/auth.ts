import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * 獲取 JWT 金鑰
 * - 生產環境：必須設定 JWT_SECRET 環境變數
 * - 開發環境：如果未設定，會生成隨機金鑰並給出警告
 */
const getJwtSecret = () => {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }

  // 開發環境：生成隨機金鑰（每次啟動會變化，但給出警告）
  const devSecret = 'dev-secret-' + crypto.randomBytes(16).toString('hex');
  console.warn('⚠️  Using auto-generated JWT_SECRET for development. Set JWT_SECRET env var for production.');
  return devSecret;
};

const JWT_SECRET = getJwtSecret();

export const requireAuth = (req, res, next) => {
  try {
    // 僅接受 Authorization 頭，避免 CSRF 混淆
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const optionalAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }
  } catch {
    // 忽略錯誤，繼續處理
  }
  next();
};
