import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../utils/prisma.js';
import { AppErrors, HTTP_STATUS } from '../utils/errors.js';
import { validateUUID } from '../utils/validation.js';

const router = express.Router();

// 獲取文件的所有參考
router.get('/:documentId/references', requireAuth, async (req, res, next) => {
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

    const references = await prisma.reference.findMany({
      where: {
        documentId,
        userId: req.user.id
      },
      orderBy: { citationKey: 'asc' }
    });

    res.status(HTTP_STATUS.OK).json(references);
  } catch (error) {
    next(error);
  }
});

// 新增單個參考
router.post('/:documentId/references', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { citationKey, doi, title, authors, year, journal, volume, pages, url, metadata } = req.body;

    // 驗證 UUID 格式
    if (!validateUUID(documentId)) {
      throw AppErrors.validation('Invalid document ID format');
    }

    // 輸入驗證
    if (!citationKey || typeof citationKey !== 'string') {
      throw AppErrors.validation('citationKey is required');
    }

    // 限制字串長度（防止過大的資料）
    const maxLength = 1000;
    if (citationKey.length > maxLength) {
      throw AppErrors.validation(`Citation key too long (max ${maxLength} characters)`);
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

    const reference = await prisma.reference.create({
      data: {
        documentId,
        userId: req.user.id,
        citationKey: citationKey.substring(0, maxLength),
        doi: doi ? String(doi).substring(0, maxLength) : null,
        title: title ? String(title).substring(0, maxLength * 2) : null,
        authors: authors ? String(authors).substring(0, maxLength * 2) : null,
        year: year ? parseInt(year) : null,
        journal: journal ? String(journal).substring(0, maxLength * 2) : null,
        volume: volume ? String(volume).substring(0, 100) : null,
        pages: pages ? String(pages).substring(0, 100) : null,
        url: url ? String(url).substring(0, maxLength * 2) : null,
        metadata
      }
    });

    res.status(HTTP_STATUS.CREATED).json(reference);
  } catch (error) {
    // 處理唯一性約束錯誤
    if (error.code === 'P2002') {
      throw AppErrors.conflict('Citation key already exists for this document');
    }
    next(error);
  }
});

// 批次新增參考（用於匯入）
router.post('/:documentId/references/batch', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    const { references } = req.body;

    // 驗證 UUID 格式
    if (!validateUUID(documentId)) {
      throw AppErrors.validation('Invalid document ID format');
    }

    // 輸入驗證
    if (!Array.isArray(references)) {
      throw AppErrors.validation('references must be an array');
    }

    // 限制批次大小
    const maxBatchSize = 1000;
    if (references.length > maxBatchSize) {
      throw AppErrors.validation(`Batch size too large (max ${maxBatchSize} references)`);
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

    // 驗證並清理參考資料
    const validReferences = references.filter(ref => {
      return ref && typeof ref === 'object' && ref.citationKey;
    });

    if (validReferences.length !== references.length) {
      throw AppErrors.validation('Some references have invalid format');
    }

    const createdReferences = await prisma.reference.createMany({
      data: validReferences.map(ref => ({
        documentId,
        userId: req.user.id,
        citationKey: String(ref.citationKey).substring(0, 1000),
        doi: ref.doi ? String(ref.doi).substring(0, 1000) : null,
        title: ref.title ? String(ref.title).substring(0, 2000) : null,
        authors: ref.authors ? String(ref.authors).substring(0, 2000) : null,
        year: ref.year ? parseInt(ref.year) : null,
        journal: ref.journal ? String(ref.journal).substring(0, 2000) : null,
        volume: ref.volume ? String(ref.volume).substring(0, 100) : null,
        pages: ref.pages ? String(ref.pages).substring(0, 100) : null,
        url: ref.url ? String(ref.url).substring(0, 2000) : null,
        metadata: ref.metadata
      })),
      skipDuplicates: true
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      count: createdReferences.count
    });
  } catch (error) {
    next(error);
  }
});

// 更新參考
router.put('/:documentId/references/:refId', requireAuth, async (req, res, next) => {
  try {
    const { documentId, refId } = req.params;

    // 驗證 UUID 格式
    if (!validateUUID(documentId) || !validateUUID(refId)) {
      throw AppErrors.validation('Invalid document or reference ID format');
    }

    // 驗證參考所有權
    const reference = await prisma.reference.findFirst({
      where: {
        id: refId,
        documentId,
        userId: req.user.id
      }
    });

    if (!reference) {
      throw AppErrors.notFound('Reference');
    }

    const updated = await prisma.reference.update({
      where: { id: refId },
      data: req.body
    });

    res.status(HTTP_STATUS.OK).json(updated);
  } catch (error) {
    next(error);
  }
});

// 刪除參考
router.delete('/:documentId/references/:refId', requireAuth, async (req, res, next) => {
  try {
    const { documentId, refId } = req.params;

    // 驗證 UUID 格式
    if (!validateUUID(documentId) || !validateUUID(refId)) {
      throw AppErrors.validation('Invalid document or reference ID format');
    }

    await prisma.reference.deleteMany({
      where: {
        id: refId,
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
