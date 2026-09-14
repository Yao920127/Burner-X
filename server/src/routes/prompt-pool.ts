import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { AppErrors, HTTP_STATUS } from '../utils/errors.js';

const router = express.Router();

// 限制陣列大小
const MAX_PROMPTS_ARRAY_SIZE = 1000;

// 獲取使用者的 Prompt Pool
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const promptPool = await prisma.promptPool.findUnique({
      where: { userId: req.user.id }
    });

    if (!promptPool) {
      // 返回預設空結構
      return res.status(HTTP_STATUS.OK).json({
        prompts: [],
        healthConfig: null
      });
    }

    res.status(HTTP_STATUS.OK).json({
      prompts: promptPool.prompts,
      healthConfig: promptPool.healthConfig
    });
  } catch (error) {
    next(error);
  }
});

// 更新 Prompt Pool（全量）
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { prompts, healthConfig } = req.body;

    // 輸入驗證
    if (!Array.isArray(prompts)) {
      throw AppErrors.validation('prompts must be an array');
    }

    // 限制陣列大小
    if (prompts.length > MAX_PROMPTS_ARRAY_SIZE) {
      throw AppErrors.validation(`Too many prompts (max ${MAX_PROMPTS_ARRAY_SIZE})`);
    }

    // 驗證每個 prompt 的基本格式（但保持寬鬆，不強制要求所有欄位）
    const validPrompts = prompts.filter(prompt => {
      return prompt && typeof prompt === 'object';
    });

    if (validPrompts.length !== prompts.length) {
      throw AppErrors.validation('Some prompts have invalid format');
    }

    const promptPool = await prisma.promptPool.upsert({
      where: { userId: req.user.id },
      update: {
        prompts: validPrompts,
        healthConfig
      },
      create: {
        userId: req.user.id,
        prompts: validPrompts,
        healthConfig
      }
    });

    res.status(HTTP_STATUS.OK).json({
      prompts: promptPool.prompts,
      healthConfig: promptPool.healthConfig
    });
  } catch (error) {
    next(error);
  }
});

// 新增單個 Prompt
router.post('/prompts', requireAuth, async (req, res, next) => {
  try {
    const newPrompt = req.body;

    // 輸入驗證
    if (!newPrompt || typeof newPrompt !== 'object') {
      throw AppErrors.validation('Prompt must be an object');
    }

    // 獲取當前 Prompt Pool
    let promptPool = await prisma.promptPool.findUnique({
      where: { userId: req.user.id }
    });

    let prompts = promptPool ? (promptPool.prompts || []) : [];

    // 限制陣列大小
    if (prompts.length >= MAX_PROMPTS_ARRAY_SIZE) {
      throw AppErrors.validation(`Maximum number of prompts reached (${MAX_PROMPTS_ARRAY_SIZE})`);
    }

    // 新增新 Prompt
    prompts.push(newPrompt);

    // 更新
    promptPool = await prisma.promptPool.upsert({
      where: { userId: req.user.id },
      update: { prompts },
      create: {
        userId: req.user.id,
        prompts
      }
    });

    res.status(HTTP_STATUS.CREATED).json({
      prompts: promptPool.prompts,
      healthConfig: promptPool.healthConfig
    });
  } catch (error) {
    next(error);
  }
});

// 刪除指定 Prompt（根據索引或 ID）
router.delete('/prompts/:identifier', requireAuth, async (req, res, next) => {
  try {
    const { identifier } = req.params;

    const promptPool = await prisma.promptPool.findUnique({
      where: { userId: req.user.id }
    });

    if (!promptPool) {
      throw AppErrors.notFound('Prompt pool');
    }

    let prompts = promptPool.prompts || [];

    // 嘗試作為索引解析
    const index = parseInt(identifier);
    if (!isNaN(index) && index >= 0 && index < prompts.length) {
      prompts.splice(index, 1);
    } else {
      // 嘗試作為 ID 查詢
      const initialLength = prompts.length;
      prompts = prompts.filter(p => p.id !== identifier);

      if (prompts.length === initialLength) {
        throw AppErrors.notFound('Prompt');
      }
    }

    // 更新
    const updated = await prisma.promptPool.update({
      where: { userId: req.user.id },
      data: { prompts }
    });

    res.status(HTTP_STATUS.OK).json({
      prompts: updated.prompts,
      healthConfig: updated.healthConfig
    });
  } catch (error) {
    next(error);
  }
});

export default router;
