import crypto from 'crypto';
import { CRYPTO } from './constants.js';

/**
 * 加密工具模組
 * 用於安全地加密和解密敏感資料（如 API Keys）
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = CRYPTO.IV_LENGTH;
const TAG_LENGTH = CRYPTO.TAG_LENGTH;
const KEY_LENGTH = CRYPTO.KEY_LENGTH;

/**
 * 獲取加密 salt
 * - 生產環境：必須設定 ENCRYPTION_SALT 環境變數
 * - 開發環境：如果未設定，使用固定 salt（便於開發）
 */
function getEncryptionSalt() {
  if (process.env.ENCRYPTION_SALT) {
    return process.env.ENCRYPTION_SALT;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_SALT must be set in production environment');
  }

  // 開發環境：使用固定 salt（便於開發，但給出警告）
  console.warn('⚠️  Using default encryption salt for development. Set ENCRYPTION_SALT for production.');
  return 'dev-salt-fixed-for-development';
}

/**
 * 從環境變數獲取加密金鑰，如果不存在則使用預設值（僅用於開發）
 */
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'default-encryption-key-change-in-production';

  // 使用 PBKDF2 從金鑰生成固定長度的加密金鑰
  // 使用環境變數或開發環境固定 salt
  return crypto.pbkdf2Sync(secret, getEncryptionSalt(), CRYPTO.PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * 加密文字
 * @param {string} text - 要加密的明文
 * @returns {string} 加密後的資料（Base64 編碼）
 */
export function encrypt(text) {
  if (!text) return text;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // 組合 IV + 加密資料 + 認證標籤
    const combined = Buffer.concat([
      iv,
      Buffer.from(encrypted, 'hex'),
      tag
    ]);

    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * 解密文字
 * @param {string} encryptedData - 加密的資料（Base64 編碼）
 * @returns {string} 解密後的明文
 */
export function decrypt(encryptedData) {
  if (!encryptedData) return encryptedData;

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    // 提取 IV、加密資料和認證標籤
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * 生成隨機加密金鑰（用於初始化）
 * @returns {string} Base64 編碼的隨機金鑰
 */
export function generateEncryptionSecret() {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * 雜湊敏感資料（單向，用於比較）
 * @param {string} data - 要雜湊的資料
 * @returns {string} 雜湊值
 */
export function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
