/**
 * @file js/storage/storage-adapter.js
 * @description
 * 儲存介面卡 - 支援 localStorage（前端模式）和 Backend API（後端模式）雙模式
 *
 * 使用方式:
 * 1. 前端模式（Vercel/靜態/直接開啟 index.html）: 使用 localStorage + IndexedDB
 * 2. 後端模式（Docker/自建後端）: 使用 Backend API + 資料庫
 */

// ---------------- 部署模式與後端探測 ----------------
// 優先順序（高→低）：URL 查詢引數 ?mode=backend|frontend → window.ENV_DEPLOYMENT_MODE → 自動探測 /api/health → 預設 frontend
function getQueryModeOverride() {
  try {
    const p = new URLSearchParams(window.location.search);
    const m = (p.get('mode') || '').toLowerCase();
    if (m === 'backend' || m === 'frontend') return m;
  } catch {}
  return null;
}

let DEPLOYMENT_MODE = (getQueryModeOverride() || (window.ENV_DEPLOYMENT_MODE && window.ENV_DEPLOYMENT_MODE !== 'auto'
  ? window.ENV_DEPLOYMENT_MODE
  : 'frontend'));

const API_BASE_URL = window.ENV_API_BASE_URL || '/api';

async function autoDetectBackendAvailability(timeoutMs = 900) {
  // file:// 明確無後端
  if (window.location.protocol === 'file:') return false;
  // 顯式覆蓋不探測
  if (getQueryModeOverride() || (window.ENV_DEPLOYMENT_MODE && window.ENV_DEPLOYMENT_MODE !== 'auto')) {
    return DEPLOYMENT_MODE === 'backend';
  }
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------- 認證 Token 管理 ----------------
class AuthManager {
  static getToken() {
    return localStorage.getItem('auth_token');
  }

  static setToken(token) {
    localStorage.setItem('auth_token', token);
  }

  static removeToken() {
    localStorage.removeItem('auth_token');
  }

  static isAuthenticated() {
    return !!this.getToken();
  }

  static getHeaders() {
    const token = this.getToken();
    return token
      ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }
}

// ---------------- 後端儲存實現 ----------------
class BackendStorage {
  async fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...AuthManager.getHeaders(),
        ...options.headers
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token 過期，需要重新登入
        AuthManager.removeToken();
        window.location.href = '/login.html';
      }
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }

  // 使用者設定
  async loadSettings() {
    try {
      if (!AuthManager.isAuthenticated()) return this._getDefaultSettings();
      const data = await this.fetchAPI('/user/settings');
      return data;
    } catch (error) {
      console.error('Failed to load settings from backend:', error);
      return this._getDefaultSettings();
    }
  }

  async saveSettings(settings) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI('/user/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
    } catch (error) {
      console.error('Failed to save settings to backend:', error);
      throw error;
    }
  }

  // API Keys
  async loadModelKeys(provider) {
    try {
      if (!AuthManager.isAuthenticated()) return [];
      const keys = await this.fetchAPI(`/user/api-keys?provider=${provider}`);
      return keys;
    } catch (error) {
      console.error('Failed to load API keys:', error);
      return [];
    }
  }

  async saveModelKeys(provider, keys) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI('/user/api-keys', {
        method: 'POST',
        body: JSON.stringify({ provider, keys })
      });
    } catch (error) {
      console.error('Failed to save API keys:', error);
      throw error;
    }
  }

  // 文件歷史
  async saveResultToDB(document) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI('/documents', { method: 'POST', body: JSON.stringify(document) });
    } catch (error) {
      console.error('Failed to save document:', error);
      throw error;
    }
  }

  async getAllResultsFromDB() {
    try {
      if (!AuthManager.isAuthenticated()) return [];
      const data = await this.fetchAPI('/documents');
      return data.documents || [];
    } catch (error) {
      console.error('Failed to load documents:', error);
      return [];
    }
  }

  async getResultFromDB(id) {
    try {
      if (!AuthManager.isAuthenticated()) return null;
      return await this.fetchAPI(`/documents/${id}`);
    } catch (error) {
      console.error('Failed to load document:', error);
      return null;
    }
  }

  async deleteResultFromDB(id) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI(`/documents/${id}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  // 術語庫
  async loadGlossarySets() {
    try {
      if (!AuthManager.isAuthenticated()) return {};
      const glossaries = await this.fetchAPI('/user/glossaries');
      const sets = {};
      glossaries.forEach(g => { sets[g.id] = g; });
      return sets;
    } catch (error) {
      console.error('Failed to load glossaries:', error);
      return {};
    }
  }

  async saveGlossarySets(sets) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      // 批次儲存（簡化實現）
      for (const [id, set] of Object.entries(sets)) {
        if (set._isNew) {
          await this.fetchAPI('/user/glossaries', { method: 'POST', body: JSON.stringify(set) });
        } else {
          await this.fetchAPI(`/user/glossaries/${id}`, { method: 'PUT', body: JSON.stringify(set) });
        }
      }
    } catch (error) {
      console.error('Failed to save glossaries:', error);
      throw error;
    }
  }

  // 標註
  async saveAnnotationToDB(annotation) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI(`/documents/${annotation.documentId}/annotations`, { method: 'POST', body: JSON.stringify(annotation) });
    } catch (error) {
      console.error('Failed to save annotation:', error);
      throw error;
    }
  }

  async getAnnotationsForDocFromDB(docId) {
    try {
      if (!AuthManager.isAuthenticated()) return [];
      return await this.fetchAPI(`/documents/${docId}/annotations`);
    } catch (error) {
      console.error('Failed to load annotations:', error);
      return [];
    }
  }

  // 聊天曆史
  async loadChatHistory(docId) {
    try {
      if (!AuthManager.isAuthenticated()) return [];
      const data = await this.fetchAPI(`/chat/${docId}/history`);
      return data.messages || [];
    } catch (error) {
      console.error('Failed to load chat history:', error);
      return [];
    }
  }

  async saveChatMessage(docId, message) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI(`/chat/${docId}/history`, {
        method: 'POST',
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error('Failed to save chat message:', error);
      throw error;
    }
  }

  async clearChatHistory(docId) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI(`/chat/${docId}/history`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      throw error;
    }
  }

  // 文獻參考
  async loadReferences(docId) {
    try {
      if (!AuthManager.isAuthenticated()) return [];
      return await this.fetchAPI(`/references/${docId}/references`);
    } catch (error) {
      console.error('Failed to load references:', error);
      return [];
    }
  }

  async saveReference(docId, reference) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI(`/references/${docId}/references`, {
        method: 'POST',
        body: JSON.stringify(reference)
      });
    } catch (error) {
      console.error('Failed to save reference:', error);
      throw error;
    }
  }

  async deleteReference(docId, refId) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI(`/references/${docId}/references/${refId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete reference:', error);
      throw error;
    }
  }

  // Prompt Pool
  async loadPromptPool() {
    try {
      if (!AuthManager.isAuthenticated()) return { prompts: [], healthConfig: null };
      return await this.fetchAPI('/prompt-pool');
    } catch (error) {
      console.error('Failed to load prompt pool:', error);
      return { prompts: [], healthConfig: null };
    }
  }

  async savePromptPool(data) {
    try {
      if (!AuthManager.isAuthenticated()) return;
      await this.fetchAPI('/prompt-pool', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Failed to save prompt pool:', error);
      throw error;
    }
  }

  _getDefaultSettings() {
    return {
      maxTokensPerChunk: 2000,
      skipProcessedFiles: false,
      selectedTranslationModel: 'none',
      concurrencyLevel: 1,
      translationConcurrencyLevel: 15,
      targetLanguage: 'chinese',
      customTargetLanguageName: '',
      enableGlossary: false,
      batchModeEnabled: false,
      batchModeTemplate: '{original_name}_{output_language}_{processing_time:YYYYMMDD-HHmmss}.{original_type}',
      batchModeFormats: ['original', 'markdown'],
      batchModeZipEnabled: false
    };
  }
}

// ---------------- 儲存介面卡工廠 ----------------
class StorageAdapterFactory {
  static create(mode) {
    if (mode === 'backend') {
      console.log('[Storage] Using Backend Storage Mode');
      const instance = new BackendStorage();
      instance.isFrontendMode = false; // 供其他模組探測
      return instance;
    }
    console.log('[Storage] Using Local Storage Mode');
    // 返回 storage.js 中的函式包裝（保持現有呼叫不變）
    const adapter = {
      loadSettings: window.loadSettings,
      saveSettings: window.saveSettings,
      loadModelKeys: window.loadModelKeys,
      saveModelKeys: window.saveModelKeys,
      saveResultToDB: window.saveResultToDB,
      getAllResultsFromDB: window.getAllResultsFromDB,
      getResultFromDB: window.getResultFromDB,
      deleteResultFromDB: window.deleteResultFromDB,
      clearAllResultsFromDB: window.clearAllResultsFromDB,
      loadGlossarySets: window.loadGlossarySets,
      saveGlossarySets: window.saveGlossarySets,
      saveAnnotationToDB: window.saveAnnotationToDB,
      getAnnotationsForDocFromDB: window.getAnnotationsForDocFromDB,
      updateAnnotationInDB: window.updateAnnotationInDB,
      deleteAnnotationFromDB: window.deleteAnnotationFromDB,
      loadProcessedFilesRecord: window.loadProcessedFilesRecord,
      saveProcessedFilesRecord: window.saveProcessedFilesRecord,
      // Prompt Pool（前端模式：落地到 localStorage，鍵與 process/prompt-pool.js 一致）
      loadPromptPool: async function () {
        try {
          const prompts = JSON.parse(localStorage.getItem('paperBurnerPromptPool') || '[]');
          const healthConfig = JSON.parse(localStorage.getItem('paperBurnerPromptHealthConfig') || 'null');
          return { prompts, healthConfig };
        } catch (e) {
          console.warn('[StorageAdapter] loadPromptPool(local) 失敗，返回空集合:', e);
          return { prompts: [], healthConfig: null };
        }
      },
      savePromptPool: async function (data) {
        try {
          if (!data || typeof data !== 'object') return;
          if (Array.isArray(data.prompts)) {
            localStorage.setItem('paperBurnerPromptPool', JSON.stringify(data.prompts));
          }
          if (data.healthConfig) {
            localStorage.setItem('paperBurnerPromptHealthConfig', JSON.stringify(data.healthConfig));
          }
        } catch (e) {
          console.warn('[StorageAdapter] savePromptPool(local) 失敗:', e);
        }
      }
    };
    adapter.isFrontendMode = true; // 供其他模組探測
    return adapter;
  }
}

// ---------------- 初始化與自動切換 ----------------
function printBanner() {
  const logoStyle = 'font-size: 16px; font-weight: bold; color: #3b82f6;';
  const infoStyle = 'font-size: 14px; color: #10b981;';
  const modeStyle = 'font-size: 14px; font-weight: bold; color: #f59e0b;';
  const borderStyle = 'color: #6366f1;';
  const linkStyle = 'font-size: 13px; color: #06b6d4; text-decoration: underline;';

  const logo = `
  ____                          ____                              __  __
 |  _ \\ __ _ _ __   ___ _ __   | __ ) _   _ _ __ _ __   ___ _ __ \\ \\/ /
 | |_) / _\` | '_ \\ / _ \\ '__|  |  _ \\| | | | '__| '_ \\ / _ \\ '__| \\  /
 |  __/ (_| | |_) |  __/ |     | |_) | |_| | |  | | | |  __/ |    /  \\
 |_|   \\__,_| .__/ \\___|_|     |____/ \\__,_|_|  |_| |_|\\___|_|   /_/\\_\\
            |_|
  `;

  const mode = DEPLOYMENT_MODE === 'backend' ? '後端模式 (Backend Mode)' : '前端模式 (Frontend Mode)';
  const storage = DEPLOYMENT_MODE === 'backend' ? 'Backend API + PostgreSQL' : 'localStorage + IndexedDB';
  const auth = DEPLOYMENT_MODE === 'backend' ? 'JWT Authentication' : 'No Authentication';

  console.log('%c' + logo, logoStyle);
  console.log('%c╔════════════════════════════════════════════════════════════╗', borderStyle);
  console.log('%c║                   系統資訊 / System Info                   ║', borderStyle);
  console.log('%c╠════════════════════════════════════════════════════════════╣', borderStyle);
  console.log('%c║ %c執行模式: ' + mode + '                                  %c║', borderStyle, modeStyle, borderStyle);
  console.log('%c║ %c儲存方式: ' + storage + '                %c║', borderStyle, infoStyle, borderStyle);
  console.log('%c║ %c認證方式: ' + auth + '                         %c║', borderStyle, infoStyle, borderStyle);
  console.log('%c╚════════════════════════════════════════════════════════════╝', borderStyle);
  console.log('%c\n🚀 Paper Burner X 已就緒！Ready to burn papers!\n', 'font-size: 14px; color: #8b5cf6; font-weight: bold;');
  console.log('%c→ GitHub: %chttps://github.com/Feather-2/paper-burner-x', 'font-size: 13px; color: #64748b;', linkStyle);
}

// 初始例項（預設前端/顯式覆蓋），隨後可能自動切換為 backend
window.storageAdapter = StorageAdapterFactory.create(DEPLOYMENT_MODE);
window.AuthManager = AuthManager;
window.DEPLOYMENT_MODE = DEPLOYMENT_MODE;
printBanner();

// 自動探測，有後端則無縫切換（不阻塞靜態模式渲染）
autoDetectBackendAvailability().then((hasBackend) => {
  if (hasBackend && DEPLOYMENT_MODE !== 'backend') {
    DEPLOYMENT_MODE = 'backend';
    window.DEPLOYMENT_MODE = DEPLOYMENT_MODE;
    window.storageAdapter = StorageAdapterFactory.create('backend');
    try { window.dispatchEvent(new CustomEvent('pb:storage-mode-changed', { detail: { mode: 'backend' } })); } catch {}
    console.log('[Storage] Auto-switched to Backend mode (health check passed)');
  }
}).catch(() => {/* ignore */});
