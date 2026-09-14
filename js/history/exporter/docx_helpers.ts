/**
 * DOCX 匯出輔助函式模組
 * 提供檔名處理、日期格式化、文字清理等工具函式
 */

(function(window) {
  'use strict';

  /**
   * 清理檔名，移除非法字元
   * @param {string} name - 原始檔名
   * @returns {string} 清理後的檔名
   */
  function sanitizeFileName(name) {
    return (name || 'document').replace(/[\\/:*?"<>|]/g, '_');
  }

  /**
   * 格式化日期時間 (YYYY-MM-DD HH:mm)
   * @param {Date} date - 日期物件
   * @returns {string} 格式化後的日期字串
   */
  function formatDateTime(date) {
    const pad = function(num) { return String(num).padStart(2, '0'); };
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * 格式化時間戳 (YYYYMMdd_HHmmss)
   * @param {Date} date - 日期物件
   * @returns {string} 格式化後的時間戳字串
   */
  function formatTimestamp(date) {
    const pad = function(num) { return String(num).padStart(2, '0'); };
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  /**
   * 安全的 URI 解碼
   * @param {string} value - 待解碼的值
   * @returns {string} 解碼後的值
   */
  function safeDecodeURIComponent(value) {
    if (typeof value !== 'string') return value;
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  /**
   * 去除重複的序列
   * @param {string} input - 輸入字串
   * @returns {string} 去重後的字串
   */
  function dedupeRepeatedSequence(input) {
    if (!input || typeof input !== 'string') return input;
    let s = input;
    const fullRepeat = /^(.{8,}?)\1+$/s.exec(s);
    if (fullRepeat) {
      return fullRepeat[1];
    }
    if (s.length % 2 === 0) {
      const mid = s.length / 2;
      const a = s.slice(0, mid);
      const b = s.slice(mid);
      if (a === b) return a;
    }
    if (s.length % 3 === 0) {
      const t = s.length / 3;
      const a = s.slice(0, t);
      const b = s.slice(t, 2 * t);
      const c = s.slice(2 * t);
      if (a === b && b === c) return a;
    }
    return s;
  }

  /**
   * 去除分割的重複短語
   * @param {string} input - 輸入字串
   * @returns {string} 去重後的字串
   */
  function dedupeSplitRepeats(input) {
    if (!input || typeof input !== 'string') return input;
    let s = input;
    const phrase = /\b([A-Za-z0-9\.\-±×·≤≥≠∞°%]+(?:\s+[A-Za-z0-9\.\-±×·≤≥≠∞°%]+){0,4})\b(?:\s+\1\b)+/g;
    for (let i = 0; i < 3; i++) {
      const next = s.replace(phrase, '$1');
      if (next === s) break;
      s = next;
    }
    return s;
  }

  /**
   * 清理行內 Markdown 格式
   * @param {string} text - 包含 Markdown 的文字
   * @returns {string} 清理後的純文字
   */
  function cleanMarkdownInline(text) {
    if (!text) return '';
    let result = String(text);
    result = result.replace(/```[\s\S]*?```/g, '');
    result = result.replace(/`([^`]+)`/g, '$1');
    result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    result = result.replace(/[*_~>#`]/g, '');
    result = result.replace(/\|/g, '');
    result = result.replace(/\r?\n+/g, ' ');
    result = result.replace(/\s+/g, ' ').trim();
    return result;
  }

  /**
   * 從 Markdown 中提取標題
   * @param {string} markdown - Markdown 文字
   * @returns {string} 提取的標題
   */
  function extractTitleFromMarkdown(markdown) {
    if (!markdown) return '';
    const blocks = String(markdown).split(/\n\s*\n+/).filter(Boolean);
    const limit = Math.min(3, blocks.length);

    for (let i = 0; i < limit; i++) {
      const block = blocks[i];
      if (!block) continue;
      const trimmed = block.trim();
      if (!trimmed) continue;
      const atxMatch = trimmed.match(/^\s{0,3}(#{1,6})\s+(.+)/);
      if (atxMatch) {
        return truncateForCard(cleanMarkdownInline(atxMatch[2]), 50);
      }
      const setextMatch = trimmed.match(/^([\s\S]+?)\n(=+|-+)\s*$/);
      if (setextMatch) {
        return truncateForCard(cleanMarkdownInline(setextMatch[1]), 50);
      }
    }

    if (blocks.length) {
      return truncateForCard(cleanMarkdownInline(blocks[0]), 50);
    }
    return '';
  }

  /**
   * 為卡片清理文字行
   * @param {string} text - 輸入文字
   * @returns {string} 清理後的文字
   */
  function sanitizeCardLine(text) {
    if (!text) return '';
    return truncateForCard(String(text).replace(/\s+/g, ' ').trim(), 60);
  }

  /**
   * 截斷文字用於卡片顯示
   * @param {string} input - 輸入文字
   * @param {number} maxLength - 最大長度
   * @returns {string} 截斷後的文字
   */
  function truncateForCard(input, maxLength) {
    if (!input) return '';
    const units = Array.from(String(input));
    if (units.length <= maxLength) {
      return units.join('');
    }
    return units.slice(0, maxLength).join('') + '…';
  }

  /**
   * 選擇卡片標題
   * @param {string} translationMarkdown - 翻譯 Markdown
   * @param {string} ocrMarkdown - OCR Markdown
   * @param {string} fallbackName - 備用名稱
   * @returns {string} 選定的標題
   */
  function selectCardTitle(translationMarkdown, ocrMarkdown, fallbackName) {
    const translationTitle = extractTitleFromMarkdown(translationMarkdown);
    if (translationTitle) return translationTitle;
    const ocrTitle = extractTitleFromMarkdown(ocrMarkdown);
    if (ocrTitle) return ocrTitle;
    if (fallbackName && fallbackName.trim()) {
      return truncateForCard(fallbackName.trim(), 50);
    }
    return 'PaperBurner X 文件';
  }

  /**
   * 獲取 OCR Markdown
   * @param {Object} data - 資料物件
   * @returns {string} OCR Markdown 文字
   */
  function getOcrMarkdown(data) {
    if (!data) return '';
    if (data.ocr && data.ocr.trim()) return data.ocr;
    if (Array.isArray(data.ocrChunks) && data.ocrChunks.length) {
      return data.ocrChunks.map(function(chunk) { return (chunk || '').trim(); }).join('\n\n');
    }
    return '';
  }

  /**
   * 獲取翻譯 Markdown
   * @param {Object} data - 資料物件
   * @returns {string} 翻譯 Markdown 文字
   */
  function getTranslationMarkdown(data) {
    if (!data) return '';
    if (data.translation && data.translation.trim()) return data.translation;
    if (Array.isArray(data.translatedChunks) && data.translatedChunks.length) {
      return data.translatedChunks.map(function(chunk) { return (chunk || '').trim(); }).join('\n\n');
    }
    return '';
  }

  /**
   * 收集介紹卡片資訊
   * @param {Object} payload - 匯出資料
   * @param {Object} helpers - 輔助函式物件
   * @returns {Object} 卡片資訊物件
   */
  function collectIntroCardInfo(payload, helpers = {}) {
    const data = payload && payload.data ? payload.data : {};
    const getTranslation = typeof helpers.getTranslationMarkdown === 'function'
      ? helpers.getTranslationMarkdown
      : getTranslationMarkdown;
    const getOcr = typeof helpers.getOcrMarkdown === 'function'
      ? helpers.getOcrMarkdown
      : getOcrMarkdown;
    const formatTime = typeof helpers.formatDateTime === 'function'
      ? helpers.formatDateTime
      : formatDateTime;
    const translationMarkdown = getTranslation(data);
    const ocrMarkdown = getOcr(data);
    const title = selectCardTitle(translationMarkdown, ocrMarkdown, data && data.name);
    return {
      title,
      sourceTitle: data && data.name ? data.name : '',
      modeLabel: payload && payload.modeLabel ? payload.modeLabel : '',
      exportedAt: payload && payload.exportTime ? formatTime(payload.exportTime) : '',
      recordId: data && data.id ? String(data.id) : ''
    };
  }

  // 匯出到全域
  window.PBXDocxHelpers = {
    sanitizeFileName,
    formatDateTime,
    formatTimestamp,
    safeDecodeURIComponent,
    dedupeRepeatedSequence,
    dedupeSplitRepeats,
    cleanMarkdownInline,
    extractTitleFromMarkdown,
    sanitizeCardLine,
    truncateForCard,
    selectCardTitle,
    getOcrMarkdown,
    getTranslationMarkdown,
    collectIntroCardInfo
  };

})(window);
