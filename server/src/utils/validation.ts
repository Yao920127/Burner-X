/**
 * 輸入驗證工具
 * 提供密碼強度驗證和基本輸入驗證功能
 */

import { VALIDATION } from './constants.js';

/**
 * 驗證密碼強度
 * @param {string} password - 要驗證的密碼
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validatePassword(password) {
  const errors = [];

  if (!password) {
    errors.push('密碼不能為空');
    return { valid: false, errors };
  }

  if (password.length < VALIDATION.PASSWORD_MIN_LENGTH) {
    errors.push(`密碼長度至少為 ${VALIDATION.PASSWORD_MIN_LENGTH} 個字元`);
  }

  if (password.length > VALIDATION.PASSWORD_MAX_LENGTH) {
    errors.push(`密碼長度不能超過 ${VALIDATION.PASSWORD_MAX_LENGTH} 個字元`);
  }

  // 檢查是否包含至少一個字母和一個數字
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasLetter) {
    errors.push('密碼必須包含至少一個字母');
  }

  if (!hasNumber) {
    errors.push('密碼必須包含至少一個數字');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 驗證郵箱格式
 * @param {string} email - 要驗證的郵箱
 * @returns {boolean}
 */
export function validateEmail(email) {
  if (!email) return false;

  // 簡單的郵箱格式驗證
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 驗證使用者註冊資料
 * @param {object} data - { email, password, name? }
 * @returns {object} - { valid: boolean, errors: object }
 */
export function validateRegisterData(data) {
  const errors = {};

  // 驗證郵箱
  if (!data.email) {
    errors.email = '郵箱不能為空';
  } else if (!validateEmail(data.email)) {
    errors.email = '郵箱格式不正確';
  }

  // 驗證密碼
  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.valid) {
    errors.password = passwordValidation.errors;
  }

  // 驗證名稱（可選）
  if (data.name && data.name.length > VALIDATION.NAME_MAX_LENGTH) {
    errors.name = `使用者名稱長度不能超過 ${VALIDATION.NAME_MAX_LENGTH} 個字元`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * 驗證日期字串格式
 * @param {string} dateStr - 日期字串
 * @returns {Date|null} - 解析後的日期物件，無效則返回 null
 */
export function validateDate(dateStr) {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 驗證 UUID 格式
 * @param {string} uuid - UUID 字串
 * @returns {boolean}
 */
export function validateUUID(uuid) {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 驗證和清理搜尋字串
 * @param {string} search - 搜尋字串
 * @param {number} maxLength - 最大長度（預設 100）
 * @returns {string}
 */
export function sanitizeSearchString(search, maxLength = 100) {
  if (!search || typeof search !== 'string') return '';
  // 移除特殊字元，防止注入攻擊
  return search.replace(/[<>\"'%;()&+]/g, '').substring(0, maxLength);
}

