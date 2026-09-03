// Google Apps Script (GAS) 雲端通訊與高頻背景同步模組 (Background Cloud Sync Engine)
const GasSync = {
  isSyncing: false,
  lastSyncTime: null,
  syncStatus: 'idle', // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  listeners: [],

  subscribeStatus(fn) {
    this.listeners.push(fn);
  },

  notifyStatus(status, detail = '') {
    this.syncStatus = status;
    this.listeners.forEach(fn => fn(status, detail));
  },

  /**
   * 測試 GAS 伺服器連線狀態
   * @param {string} url GAS Web App URL
   * @returns {Promise<Object>}
   */
  async testConnection(url) {
    if (!url || !url.startsWith('http')) {
      throw new Error('請輸入正確的 Google Apps Script Web App 網址 (https://script.google.com/...)');
    }

    const testUrl = url.includes('?') ? `${url}&action=ping&_t=${Date.now()}` : `${url}?action=ping&_t=${Date.now()}`;
    
    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`伺服器回應錯誤狀態碼: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (err) {
      console.error('GAS connection test error:', err);
      throw new Error(`連線失敗: ${err.message}。請確認 GAS 是否部署為「任何人 (Anyone)」皆可存取。`);
    }
  },

  /**
   * 觸發 Google 試算表一鍵自動格式化與建表
   * @param {string} url 
   * @returns {Promise<Object>}
   */
  async triggerAutoFormat(url) {
    if (!url) throw new Error('尚未設定 GAS Web App 網址');

    return this.postRequest(url, {
      action: 'autoFormat'
    });
  },

  /**
   * 將本地完整成績資料推送到 Google 試算表 (Push)
   * @param {string} url 
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async syncToCloud(url, options = {}) {
    if (!url) return;
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.notifyStatus('syncing', '正在同步至雲端試算表...');
    try {
      const currentUser = (window.Auth && Auth.getCurrentUser()) || { email: 'littletiger0815@gmail.com' };
      const localData = await DB.exportAllData();
      const payload = {
        action: 'syncAll',
        userEmail: currentUser.email,
        password: currentUser.password || '',
        data: localData
      };

      const result = await this.postRequest(url, payload);
      this.lastSyncTime = new Date();
      this.notifyStatus('synced', '雲端同步完成');
      return result;
    } catch (err) {
      this.notifyStatus('error', err.message);
      if (!options.silent) throw err;
    } finally {
      this.isSyncing = false;
    }
  },

  /**
   * 從 Google 試算表拉取資料至本地 (Pull)
   * @param {string} url 
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async pullFromCloud(url, options = {}) {
    if (!url) return;
    if (this.isSyncing) return;

    this.isSyncing = true;
    this.notifyStatus('syncing', '正在從雲端拉取最新數據...');
    try {
      const currentUser = (window.Auth && Auth.getCurrentUser()) || { email: 'littletiger0815@gmail.com' };
      const payload = {
        action: 'pull',
        userEmail: currentUser.email,
        password: currentUser.password || ''
      };
      const result = await this.postRequest(url, payload);

      if (result && result.status === 'success' && result.data) {
        const importRes = await DB.importAllData(result.data);
        result.importResult = importRes;
        this.lastSyncTime = new Date();
        this.notifyStatus('synced', '最新雲端數據已就緒');
      }
      return result;
    } catch (err) {
      this.notifyStatus('error', err.message);
      if (!options.silent) throw err;
    } finally {
      this.isSyncing = false;
    }
  },

  /**
   * 核心 POST 傳輸：以 text/plain 形式傳送 JSON，徹底規避 CORS Preflight OPTIONS 阻礙
   * @param {string} url 
   * @param {Object} bodyObject 
   * @returns {Promise<Object>}
   */
  async postRequest(url, bodyObject = {}) {
    try {
      // 自動補齊當前使用者身分憑證
      if (window.Auth) {
        const currentUser = Auth.getCurrentUser();
        if (currentUser) {
          if (!bodyObject.userEmail) bodyObject.userEmail = currentUser.email;
          if (!bodyObject.password && currentUser.password) bodyObject.password = currentUser.password;
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        // 極關鍵：採用 text/plain 避免觸發 OPTIONS preflight 請求，GAS 可透過 e.postData.contents 正確解析 JSON
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(bodyObject),
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP 請求失敗，狀態代碼: ${response.status}`);
      }

      const text = await response.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (parseErr) {
        console.warn('Response was not valid JSON, raw:', text);
        return { status: 'success', raw: text };
      }
    } catch (err) {
      console.error('GAS POST Error:', err);
      throw new Error(`GAS 通訊異常: ${err.message}`);
    }
  }
};
