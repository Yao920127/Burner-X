import { prisma } from './prisma.js';
import bcrypt from 'bcryptjs';
import { CRYPTO, ROLES } from './constants.js';

export async function initializeAdmin() {
  try {
    // 檢查是否已有管理員
    const adminCount = await prisma.user.count({
      where: { role: ROLES.ADMIN }
    });

    if (adminCount > 0) {
      console.log('✓ Admin account already exists');
      return;
    }

    // 從環境變數獲取管理員配置
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@paperburner.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    const adminName = process.env.ADMIN_NAME || 'Administrator';

    // 建立管理員賬戶
    const hashedPassword = await bcrypt.hash(adminPassword, CRYPTO.BCRYPT_ROUNDS);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: ROLES.ADMIN,
        isActive: true
      }
    });

    // 建立預設設定
    await prisma.userSettings.create({
      data: {
        userId: admin.id
      }
    });

    console.log('✓ Admin account created successfully');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log('  ⚠️  Please change the default password after first login!');

  } catch (error) {
    if (error.code === 'P2002') {
      // Unique constraint violation - admin already exists
      console.log('✓ Admin account already exists');
    } else {
      throw error;
    }
  }
}
