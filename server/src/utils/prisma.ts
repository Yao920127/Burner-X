import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient 單例模式
 * 避免多個例項導致資料庫連線洩漏
 *
 * 根據 Prisma 最佳實踐：
 * - 在開發環境中，PrismaClient 例項會在程式碼更改時重新建立
 * - 在生產環境中，應該重用同一個例項
 */
let prismaInstance = null;

/**
 * 獲取 PrismaClient 單例
 * @returns {PrismaClient} PrismaClient 例項
 */
export function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    });

    // 優雅關閉處理
    process.on('beforeExit', async () => {
      await prismaInstance.$disconnect();
    });
  }

  return prismaInstance;
}

// 匯出單例例項（向後相容）
export const prisma = getPrisma();

// 預設匯出
export default prisma;

