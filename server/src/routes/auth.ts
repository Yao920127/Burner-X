import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validateRegisterData } from '../utils/validation.js';
import { AppErrors, HTTP_STATUS } from '../utils/errors.js';
import { JWT, CRYPTO, ROLES } from '../utils/constants.js';

const router = express.Router();

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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || JWT.DEFAULT_EXPIRES_IN;

// 註冊
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // 使用驗證工具驗證輸入
    const validation = validateRegisterData({ email, password, name });
    if (!validation.valid) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    // 檢查使用者是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw AppErrors.conflict('User already exists');
    }

    // 密碼加密
    const hashedPassword = await bcrypt.hash(password, CRYPTO.BCRYPT_ROUNDS);

    // 建立使用者
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: ROLES.USER
      }
    });

    // 建立預設設定
    await prisma.userSettings.create({
      data: {
        userId: user.id
      }
    });

    // 生成 JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    next(error);
  }
});

// 登入
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw AppErrors.validation('Email and password are required');
    }

    // 查詢使用者
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw AppErrors.unauthorized('Invalid credentials');
    }

    // 驗證密碼
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw AppErrors.unauthorized('Invalid credentials');
    }

    // 檢查賬戶狀態
    if (!user.isActive) {
      throw AppErrors.forbidden('Account is disabled');
    }

    // 生成 JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    next(error);
  }
});

// 獲取當前使用者資訊
router.get('/me', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw AppErrors.unauthorized('Authentication required');
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      throw AppErrors.notFound('User');
    }

    res.status(HTTP_STATUS.OK).json({ user });

  } catch (error) {
    next(error);
  }
});

export default router;
