import { prisma } from './prisma.js';

/**
 * 記錄使用者使用量日誌
 * @param {string} userId - 使用者ID
 * @param {string} action - 操作型別
 * @param {string} resourceId - 資源ID（可選）
 * @param {object} metadata - 後設資料（可選）
 */
export async function logUsage(userId, action, resourceId = null, metadata = null) {
  try {
    await prisma.usageLog.create({
      data: {
        userId,
        action,
        resourceId,
        metadata
      }
    });
  } catch (error) {
    console.error('Failed to log usage:', error);
    // 不丟擲錯誤，避免影響主業務流程
  }
}

/**
 * 檢查使用者是否超過配額
 * @param {string} userId - 使用者ID
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkQuota(userId) {
  try {
    const quota = await prisma.userQuota.findUnique({
      where: { userId }
    });

    // 如果沒有配額設定，預設允許
    if (!quota) {
      return { allowed: true };
    }

    // 檢查日度配額
    if (quota.maxDocumentsPerDay > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await prisma.document.count({
        where: { userId, createdAt: { gte: todayStart } }
      });
      if (todayCount >= quota.maxDocumentsPerDay) {
        return { allowed: false, reason: `Daily document quota exceeded (${quota.maxDocumentsPerDay} documents)` };
      }
    }

    // 檢查月度配額
    if (quota.maxDocumentsPerMonth > 0) {
      // 檢查是否需要重置
      const now = new Date();
      const lastReset = new Date(quota.lastMonthlyReset);
      if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        // 重置月度計數
        await prisma.userQuota.update({
          where: { userId },
          data: {
            documentsThisMonth: 0,
            lastMonthlyReset: now
          }
        });
      } else if (quota.documentsThisMonth >= quota.maxDocumentsPerMonth) {
        return {
          allowed: false,
          reason: `Monthly document quota exceeded (${quota.maxDocumentsPerMonth} documents)`
        };
      }
    }

    // 檢查儲存配額
    if (quota.maxStorageSize > 0 && quota.currentStorageUsed >= quota.maxStorageSize) {
      return {
        allowed: false,
        reason: `Storage quota exceeded (${quota.maxStorageSize} MB)`
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Failed to check quota:', error);
    // 出錯時預設允許，避免影響使用者體驗
    return { allowed: true };
  }
}

/**
 * 增加文件計數
 * @param {string} userId - 使用者ID
 * @param {number} fileSize - 檔案大小（位元組）
 */
export async function incrementDocumentCount(userId, fileSize = 0) {
  try {
    const fileSizeMB = Math.ceil(fileSize / 1024 / 1024);

    await prisma.userQuota.upsert({
      where: { userId },
      update: {
        documentsThisMonth: {
          increment: 1
        },
        currentStorageUsed: {
          increment: fileSizeMB
        }
      },
      create: {
        userId,
        documentsThisMonth: 1,
        currentStorageUsed: fileSizeMB
      }
    });
  } catch (error) {
    console.error('Failed to increment document count:', error);
  }
}

/**
 * 減少文件計數（刪除文件時）
 * @param {string} userId - 使用者ID
 * @param {number} fileSize - 檔案大小（位元組）
 */
export async function decrementDocumentCount(userId, fileSize = 0) {
  try {
    const fileSizeMB = Math.ceil(fileSize / 1024 / 1024);

    const quota = await prisma.userQuota.findUnique({
      where: { userId }
    });

    if (quota) {
      await prisma.userQuota.update({
        where: { userId },
        data: {
          documentsThisMonth: Math.max(0, quota.documentsThisMonth - 1),
          currentStorageUsed: Math.max(0, quota.currentStorageUsed - fileSizeMB)
        }
      });
    }
  } catch (error) {
    console.error('Failed to decrement document count:', error);
  }
}
