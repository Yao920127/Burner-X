import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { AppErrors, HTTP_STATUS } from '../utils/errors.js';
import { PAGINATION } from '../utils/constants.js';
import { validateUUID, validateDate } from '../utils/validation.js';

const router = express.Router();

// 允許的聊天角色
const ALLOWED_ROLES = ['user', 'assistant'];

// 獲取文件的聊天曆史
router.get('/:documentId/history', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { limit = 100, before } = req.query;

    // 驗證 UUID 格式
    if (!validateUUID(documentId)) {
      throw AppErrors.validation('Invalid document ID format');
    }

    // 驗證和規範化引數
    const limitNum = Math.min(Math.max(parseInt(limit) || 100, 1), PAGINATION.MAX_LIMIT);
    const beforeDate = before ? validateDate(before) : null;

    if (before && !beforeDate) {
      throw AppErrors.validation('Invalid before date format');
    }

    // 驗證文件所有權
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: req.user.id
      }
    });

    if (!document) {
      throw AppErrors.notFound('Document');
    }

    // 構建查詢條件
    const where = {
      documentId,
      userId: req.user.id
    };

    if (beforeDate) {
      where.timestamp = { lt: beforeDate };
    }

    // 獲取訊息
    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limitNum,
      select: {
        id: true,
        role: true,
        content: true,
        timestamp: true,
        metadata: true
      }
    });

    // 反轉順序，使最早的訊息在前
    const sortedMessages = messages.reverse();

    res.status(HTTP_STATUS.OK).json({
      messages: sortedMessages,
      hasMore: messages.length === limitNum
    });
  } catch (error) {
    next(error);
  }
});

// 新增聊天訊息
router.post('/:documentId/history', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { role, content, metadata } = req.body;

    // 驗證 UUID 格式
    if (!validateUUID(documentId)) {
      throw AppErrors.validation('Invalid document ID format');
    }

    // 輸入驗證
    if (!role || typeof role !== 'string') {
      throw AppErrors.validation('Role is required');
    }

    if (!ALLOWED_ROLES.includes(role)) {
      throw AppErrors.validation(`Role must be one of: ${ALLOWED_ROLES.join(', ')}`);
    }

    if (!content || typeof content !== 'string') {
      throw AppErrors.validation('Content is required');
    }

    // 限制內容長度（防止過大的訊息）
    const maxContentLength = 100000; // 100KB
    if (content.length > maxContentLength) {
      throw AppErrors.validation(`Content too long (max ${maxContentLength} characters)`);
    }

    // 驗證文件所有權
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: req.user.id
      }
    });

    if (!document) {
      throw AppErrors.notFound('Document');
    }

    // 建立訊息
    const message = await prisma.chatMessage.create({
      data: {
        documentId,
        userId: req.user.id,
        role,
        content,
        metadata
      }
    });

    res.status(HTTP_STATUS.CREATED).json(message);
  } catch (error) {
    next(error);
  }
});

// 批次新增聊天訊息（用於匯入）
router.post('/:documentId/history/batch', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { messages } = req.body;

    // 驗證 UUID 格式
    if (!validateUUID(documentId)) {
      throw AppErrors.validation('Invalid document ID format');
    }

    // 輸入驗證
    if (!Array.isArray(messages)) {
      throw AppErrors.validation('Messages must be an array');
    }

    // 限制批次大小（防止過大的批次請求）
    const maxBatchSize = 1000;
    if (messages.length > maxBatchSize) {
      throw AppErrors.validation(`Batch size too large (max ${maxBatchSize} messages)`);
    }

    // 驗證文件所有權
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: req.user.id
      }
    });

    if (!document) {
      throw AppErrors.notFound('Document');
    }

    // 驗證每條訊息的基本格式
    const validMessages = messages.filter(msg => {
      return msg && typeof msg === 'object' &&
             ALLOWED_ROLES.includes(msg.role) &&
             typeof msg.content === 'string';
    });

    if (validMessages.length !== messages.length) {
      throw AppErrors.validation('Some messages have invalid format');
    }

    // 批次建立訊息
    const createdMessages = await prisma.chatMessage.createMany({
      data: validMessages.map(msg => ({
        documentId,
        userId: req.user.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp ? validateDate(msg.timestamp) || new Date() : undefined,
        metadata: msg.metadata
      })),
      skipDuplicates: true
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      count: createdMessages.count
    });
  } catch (error) {
    next(error);
  }
});

// 清空文件的聊天曆史
router.delete('/:documentId/history', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;

    // 驗證 UUID 格式
    if (!validateUUID(documentId)) {
      throw AppErrors.validation('Invalid document ID format');
    }

    // 驗證文件所有權
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: req.user.id
      }
    });

    if (!document) {
      throw AppErrors.notFound('Document');
    }

    await prisma.chatMessage.deleteMany({
      where: {
        documentId,
        userId: req.user.id
      }
    });

    res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
