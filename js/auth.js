// 學業成績智慧彙整系統 - 多使用者認證與身分管理引擎 (Auth Engine)
const Auth = {
  SESSION_KEY: 'CAP_AUTH_SESSION',
  OFFLINE_USERS_KEY: 'CAP_OFFLINE_USERS',

  // 系統預設主帳號（舊資料自動無縫移轉至此帳號）
  DEFAULT_USER: {
    email: 'littletiger0815@gmail.com',
    studentName: '小虎',
    password: 'little07928'
  },

  /**
   * 初始化認證服務
   */
  init() {
    // 確保本地帳號快取庫中存在預設主帳號
    const users = this.getOfflineUsers();
    if (!users.some(u => u.email === this.DEFAULT_USER.email)) {
      users.push({ ...this.DEFAULT_USER, registeredAt: new Date().toISOString() });
      localStorage.setItem(this.OFFLINE_USERS_KEY, JSON.stringify(users));
    }

    // 若尚未登入過任何帳號，自動登入至預設主帳號，確保既有資料零延遲銜接
    const current = this.getCurrentUser();
    if (!current || !current.email) {
      console.log('No active session, auto-binding to master account:', this.DEFAULT_USER.email);
      this.saveSession(this.DEFAULT_USER);
    }
  },

  /**
   * 取得當前登入者資訊
   * @returns {Object|null}
   */
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(this.SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * 檢查是否已登入
   * @returns {boolean}
   */
  isLoggedIn() {
    const u = this.getCurrentUser();
    return Boolean(u && u.email);
  },

  /**
   * 儲存登入會話
   */
  saveSession(user) {
    if (!user || !user.email) return;
    const cleanUser = {
      email: String(user.email).trim().toLowerCase(),
      studentName: user.studentName || '學生',
      password: user.password || ''
    };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(cleanUser));

    // 同步記錄至本地已知使用者庫
    const users = this.getOfflineUsers();
    const idx = users.findIndex(u => u.email === cleanUser.email);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...cleanUser, lastLogin: new Date().toISOString() };
    } else {
      users.push({ ...cleanUser, registeredAt: new Date().toISOString(), lastLogin: new Date().toISOString() });
    }
    localStorage.setItem(this.OFFLINE_USERS_KEY, JSON.stringify(users));
  },

  /**
   * 取得本地已知使用者清單
   */
  getOfflineUsers() {
    try {
      const raw = localStorage.getItem(this.OFFLINE_USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  /**
   * 使用者登入 (支援雲端驗證與離線快取驗證)
   */
  async login(email, password) {
    if (!email || !password) {
      throw new Error('請輸入帳號與密碼');
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const gasUrl = (window.App && App.cachedData && App.cachedData.settings && App.cachedData.settings.gasUrl) 
      || CONSTANTS.DEFAULT_SETTINGS.gasUrl;

    let userObj = null;

    // 1. 若有網路且有 GAS 網址，優先至雲端驗證
    if (navigator.onLine && gasUrl) {
      try {
        const res = await GasSync.postRequest(gasUrl, {
          action: 'login',
          userEmail: cleanEmail,
          password: password
        });

        if (res && res.status === 'success' && res.user) {
          userObj = {
            email: cleanEmail,
            studentName: res.user.studentName || '學生',
            password: password
          };
        } else if (res && res.status === 'error') {
          throw new Error(res.message || '帳號或密碼錯誤');
        }
      } catch (err) {
        // 若雲端回報明確密碼錯誤，直接丟出
        if (err.message && err.message.includes('密碼不正確')) {
          throw err;
        }
        console.warn('Cloud login failed or network issue, checking offline store:', err);
      }
    }

    // 2. 離線或容錯降級比對
    if (!userObj) {
      const users = this.getOfflineUsers();
      const localMatch = users.find(u => u.email === cleanEmail);
      if (localMatch) {
        if (localMatch.password === password) {
          userObj = { ...localMatch };
        } else {
          throw new Error('帳號或密碼不正確');
        }
      } else if (cleanEmail === this.DEFAULT_USER.email && password === this.DEFAULT_USER.password) {
        userObj = { ...this.DEFAULT_USER };
      } else {
        throw new Error('查無此帳號，請先點擊「立即註冊」建立帳號');
      }
    }

    // 3. 儲存會話並切換資料庫
    this.saveSession(userObj);
    await DB.switchUser(userObj.email);
    if (window.App) {
      await App.onUserSwitched(userObj);
    }
    return userObj;
  },

  /**
   * 使用者註冊 (建立獨立新使用者與專屬資料空間)
   */
  async register(email, password, studentName = '') {
    if (!email || !password) {
      throw new Error('請填寫有效的帳號 Email 與密碼');
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const gasUrl = (window.App && App.cachedData && App.cachedData.settings && App.cachedData.settings.gasUrl) 
      || CONSTANTS.DEFAULT_SETTINGS.gasUrl;

    const users = this.getOfflineUsers();
    if (users.some(u => u.email === cleanEmail)) {
      throw new Error('此帳號已存在，請直接登入');
    }

    // 1. 嘗試向雲端註冊
    if (navigator.onLine && gasUrl) {
      try {
        const res = await GasSync.postRequest(gasUrl, {
          action: 'register',
          userEmail: cleanEmail,
          password: password,
          studentName: studentName
        });

        if (res && res.status === 'error') {
          throw new Error(res.message || '註冊失敗');
        }
      } catch (err) {
        console.warn('Cloud registration error:', err);
        // 若非重複帳號之連線異常，允許離線註冊
      }
    }

    const newUser = {
      email: cleanEmail,
      studentName: studentName || '新學生',
      password: password
    };

    // 2. 儲存會話並切換至全新空白獨立資料庫
    this.saveSession(newUser);
    await DB.switchUser(newUser.email);
    if (window.App) {
      await App.onUserSwitched(newUser);
    }
    return newUser;
  },

  /**
   * 登出
   */
  async logout() {
    localStorage.removeItem(this.SESSION_KEY);
    if (window.App) {
      App.showToast('已安全登出', 'info');
      App.openAuthModal('login');
    }
  }
};
