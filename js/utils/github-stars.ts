/**
 * GitHub Stars 統一獲取模組
 * 支援本地快取和智慧更新策略
 */
(function(window) {
  'use strict';

  const CACHE_KEY = 'pbx_github_stars_cache';
  const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3小時（毫秒）
  const REPO_OWNER = 'Feather-2';
  const REPO_NAME = 'paper-burner';

  /**
   * 從 localStorage 獲取快取的 stars 資料
   * @returns {Object|null} 快取資料 {stars: number, timestamp: number} 或 null
   */
  function getCachedStars() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const data = JSON.parse(cached);
      if (!data || typeof data.stars !== 'number' || typeof data.timestamp !== 'number') {
        return null;
      }

      return data;
    } catch (e) {
      console.warn('[GitHubStars] Failed to read cache:', e);
      return null;
    }
  }

  /**
   * 將 stars 資料儲存到 localStorage
   * @param {number} stars - stars 數量
   */
  function setCachedStars(stars) {
    try {
      const data = {
        stars: stars,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[GitHubStars] Failed to save cache:', e);
    }
  }

  /**
   * 檢查快取是否過期
   * @param {number} timestamp - 快取時間戳
   * @returns {boolean} 是否過期
   */
  function isCacheExpired(timestamp) {
    return (Date.now() - timestamp) >= CACHE_DURATION;
  }

  /**
   * 格式化 stars 數量顯示
   * @param {number} stars - stars 數量
   * @returns {string} 格式化後的字串（如 "5.5k"）
   */
  function formatStars(stars) {
    if (stars >= 1000) {
      return (stars / 1000).toFixed(1) + 'k';
    }
    return stars.toString();
  }

  /**
   * 從 GitHub API 獲取 stars 數量
   * @returns {Promise<number>} stars 數量
   */
  function fetchStarsFromAPI() {
    return fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data && typeof data.stargazers_count === 'number') {
          return data.stargazers_count;
        }
        throw new Error('Invalid API response');
      });
  }

  /**
   * 獲取 GitHub stars 數量（帶快取）
   * @param {Object} options - 配置選項
   * @param {boolean} options.forceRefresh - 是否強制重新整理（忽略快取）
   * @returns {Promise<{stars: number, formatted: string, fromCache: boolean}>}
   */
  function getStars(options = {}) {
    const { forceRefresh = false } = options;

    return new Promise((resolve, reject) => {
      // 1. 嘗試從快取讀取
      const cached = getCachedStars();

      if (cached && !forceRefresh && !isCacheExpired(cached.timestamp)) {
        // 快取有效，直接返回
        console.log('[GitHubStars] Using cached data:', cached.stars);
        resolve({
          stars: cached.stars,
          formatted: formatStars(cached.stars),
          fromCache: true
        });
        return;
      }

      // 2. 如果有快取但已過期，先返回快取資料，然後在後臺更新
      if (cached && !forceRefresh) {
        console.log('[GitHubStars] Cache expired, returning cached data and updating in background');
        resolve({
          stars: cached.stars,
          formatted: formatStars(cached.stars),
          fromCache: true
        });

        // 後臺更新
        fetchStarsFromAPI()
          .then(stars => {
            setCachedStars(stars);
            console.log('[GitHubStars] Background update completed:', stars);
          })
          .catch(error => {
            console.warn('[GitHubStars] Background update failed:', error);
          });
        return;
      }

      // 3. 沒有快取或強制重新整理，從 API 獲取
      console.log('[GitHubStars] Fetching from API...');
      fetchStarsFromAPI()
        .then(stars => {
          setCachedStars(stars);
          resolve({
            stars: stars,
            formatted: formatStars(stars),
            fromCache: false
          });
        })
        .catch(error => {
          console.error('[GitHubStars] Failed to fetch from API:', error);

          // 如果有快取（即使過期），作為後備返回
          if (cached) {
            console.log('[GitHubStars] Using expired cache as fallback');
            resolve({
              stars: cached.stars,
              formatted: formatStars(cached.stars),
              fromCache: true
            });
          } else {
            reject(error);
          }
        });
    });
  }

  /**
   * 清除快取
   */
  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
      console.log('[GitHubStars] Cache cleared');
    } catch (e) {
      console.warn('[GitHubStars] Failed to clear cache:', e);
    }
  }

  // 暴露到全域
  window.GitHubStars = {
    getStars: getStars,
    clearCache: clearCache,
    formatStars: formatStars
  };

})(window);
