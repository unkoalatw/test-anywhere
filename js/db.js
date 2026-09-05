// 學業成績智慧彙整系統 - 本地資料庫 (IndexedDB / LocalStorage Local-First Engine - 多租戶隔離版)
const DB = {
  dbVersion: 1,
  dbInstance: null,
  currentUserEmail: 'littletiger0815@gmail.com',
  useLocalStorage: false,
  listeners: [],

  // 取得特定使用者的專屬獨立資料庫名稱
  getUserDbName(email) {
    const safe = (email || 'littletiger0815@gmail.com').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
    return `CAP_DB_${safe}`;
  },

  // 取得 LocalStorage 前綴
  getStoragePrefix() {
    const safe = (this.currentUserEmail || 'littletiger0815@gmail.com').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
    return `CAP_USER_${safe}_`;
  },

  // 註冊資料變更監聽器
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  },

  // 觸發資料變更通知
  notify(collection, action, data) {
    this.listeners.forEach(cb => {
      try {
        cb({ collection, action, data, userEmail: this.currentUserEmail, timestamp: Date.now() });
      } catch (err) {
        console.error('DB notify error:', err);
      }
    });
  },

  // 初始化當前使用者的獨立資料庫
  async init(userEmail) {
    if (userEmail) {
      this.currentUserEmail = String(userEmail).trim().toLowerCase();
    } else if (window.Auth) {
      const u = Auth.getCurrentUser();
      if (u && u.email) this.currentUserEmail = u.email;
    }

    const targetDbName = this.getUserDbName(this.currentUserEmail);

    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to LocalStorage');
        this.initFallback();
        resolve(true);
        return;
      }

      const request = indexedDB.open(targetDbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('quizzes')) {
          const quizStore = db.createObjectStore('quizzes', { keyPath: 'id' });
          quizStore.createIndex('subject', 'subject', { unique: false });
          quizStore.createIndex('date', 'date', { unique: false });
        }

        if (!db.objectStoreNames.contains('termExams')) {
          const termStore = db.createObjectStore('termExams', { keyPath: 'id' });
          termStore.createIndex('date', 'date', { unique: false });
        }

        if (!db.objectStoreNames.contains('mockExams')) {
          const mockStore = db.createObjectStore('mockExams', { keyPath: 'id' });
          mockStore.createIndex('date', 'date', { unique: false });
        }

        if (!db.objectStoreNames.contains('targetSchools')) {
          db.createObjectStore('targetSchools', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('mistakes')) {
          const mistakeStore = db.createObjectStore('mistakes', { keyPath: 'id' });
          mistakeStore.createIndex('examId', 'examId', { unique: false });
          mistakeStore.createIndex('examType', 'examType', { unique: false });
          mistakeStore.createIndex('subject', 'subject', { unique: false });
          mistakeStore.createIndex('date', 'date', { unique: false });
          mistakeStore.createIndex('masteryLevel', 'masteryLevel', { unique: false });
          mistakeStore.createIndex('errorType', 'errorType', { unique: false });
          mistakeStore.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      };

      request.onsuccess = async (event) => {
        this.dbInstance = event.target.result;
        
        // 若當前為主帳號 littletiger0815@gmail.com，執行舊資料安全自動移轉
        if (this.currentUserEmail === 'littletiger0815@gmail.com') {
          await this.migrateLegacyDataIfNeeded();
        }
        
        await this.checkAndSeedDefaultData();
        resolve(true);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error for user ' + this.currentUserEmail + ':', event.target.error);
        this.initFallback();
        resolve(true);
      };
    });
  },

  // 切換使用者（物理關閉當前庫並開啟新使用者的獨立資料庫）
  async switchUser(newEmail) {
    if (!newEmail) return;
    const cleanEmail = String(newEmail).trim().toLowerCase();
    if (this.dbInstance) {
      try {
        this.dbInstance.close();
      } catch (e) {}
      this.dbInstance = null;
    }
    this.currentUserEmail = cleanEmail;
    await this.init(cleanEmail);
    this.notify('all', 'switch_user', { userEmail: cleanEmail });
    return true;
  },

  // 自動將歷史舊資料庫 (CAP_AcademicTracker_DB) 無縫移轉至主帳號 littletiger0815@gmail.com
  async migrateLegacyDataIfNeeded() {
    const isMigrated = localStorage.getItem('CAP_LEGACY_MIGRATED_TO_LITTLETIGER') === 'true';
    if (isMigrated) return;

    try {
      if (window.indexedDB) {
        const legacyReq = indexedDB.open('CAP_AcademicTracker_DB', 1);
        const legacyDb = await new Promise((res) => {
          legacyReq.onsuccess = () => res(legacyReq.result);
          legacyReq.onerror = () => res(null);
        });

        if (legacyDb) {
          const stores = ['quizzes', 'termExams', 'mockExams', 'targetSchools', 'settings'];
          const payload = {};
          for (const s of stores) {
            if (legacyDb.objectStoreNames.contains(s)) {
              payload[s] = await new Promise(r => {
                const tx = legacyDb.transaction(s, 'readonly');
                const req = tx.objectStore(s).getAll();
                req.onsuccess = () => r(req.result || []);
                req.onerror = () => r([]);
              });
            }
          }
          legacyDb.close();

          const hasData = (payload.mockExams && payload.mockExams.length > 0) ||
                          (payload.quizzes && payload.quizzes.length > 0) ||
                          (payload.termExams && payload.termExams.length > 0);

          if (hasData) {
            console.log('Migrating legacy data to master account:', this.currentUserEmail);
            await this.importAllData(payload);
          }
        }
      }
      localStorage.setItem('CAP_LEGACY_MIGRATED_TO_LITTLETIGER', 'true');
    } catch (err) {
      console.warn('Legacy migration check exception:', err);
      localStorage.setItem('CAP_LEGACY_MIGRATED_TO_LITTLETIGER', 'true');
    }
  },

  // LocalStorage 回退方案 (加入使用者前綴隔離)
  initFallback() {
    this.useLocalStorage = true;
    const p = this.getStoragePrefix();
    const seeded = localStorage.getItem(`${p}INIT`);
    if (!seeded) {
      localStorage.setItem(`${p}quizzes`, JSON.stringify([]));
      localStorage.setItem(`${p}termExams`, JSON.stringify([]));
      localStorage.setItem(`${p}mockExams`, JSON.stringify([]));
      localStorage.setItem(`${p}targetSchools`, JSON.stringify(CONSTANTS.TARGET_SCHOOLS_DB));
      localStorage.setItem(`${p}mistakes`, JSON.stringify([]));
      localStorage.setItem(`${p}settings`, JSON.stringify(SEED_DATA.settings));
      localStorage.setItem(`${p}INIT`, 'true');
    }
  },

  // 檢查並建立初始乾淨設定 (不填入任何假資料)
  async checkAndSeedDefaultData() {
    if (this.useLocalStorage) return;

    const settings = await this.get('settings', 'main');
    if (!settings) {
      await this.put('settings', { id: 'main', ...SEED_DATA.settings });
    }

    const targetCount = await this.count('targetSchools');
    if (targetCount === 0) {
      await this.bulkPut('targetSchools', CONSTANTS.TARGET_SCHOOLS_DB);
    }
  },

  // 計算筆數
  async count(storeName) {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      const data = JSON.parse(localStorage.getItem(`${p}${storeName}`) || '[]');
      return Array.isArray(data) ? data.length : 1;
    }

    return new Promise((resolve) => {
      const transaction = this.dbInstance.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  },

  // 取得全部資料
  async getAll(storeName) {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      const data = localStorage.getItem(`${p}${storeName}`);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [parsed];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.dbInstance.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // 取得單筆資料
  async get(storeName, id) {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      if (storeName === 'settings') {
        return JSON.parse(localStorage.getItem(`${p}settings`) || '{}');
      }
      const list = JSON.parse(localStorage.getItem(`${p}${storeName}`) || '[]');
      return list.find(item => item.id === id) || null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.dbInstance.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // 新增或更新單筆資料
  async put(storeName, item) {
    if (!item.id && storeName !== 'settings') {
      item.id = `${storeName.slice(0, 2)}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    }
    if (!item.updatedAt) item.updatedAt = new Date().toISOString();

    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      if (storeName === 'settings') {
        localStorage.setItem(`${p}settings`, JSON.stringify(item));
      } else {
        const list = JSON.parse(localStorage.getItem(`${p}${storeName}`) || '[]');
        const idx = list.findIndex(i => i.id === item.id);
        if (idx >= 0) list[idx] = item;
        else list.push(item);
        localStorage.setItem(`${p}${storeName}`, JSON.stringify(list));
      }
      this.notify(storeName, 'put', item);
      return item;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.dbInstance.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => {
        this.notify(storeName, 'put', item);
        resolve(item);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // 批次寫入
  async bulkPut(storeName, items) {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      localStorage.setItem(`${p}${storeName}`, JSON.stringify(items));
      this.notify(storeName, 'bulkPut', items);
      return items;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.dbInstance.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      items.forEach(item => store.put(item));
      transaction.oncomplete = () => {
        this.notify(storeName, 'bulkPut', items);
        resolve(items);
      };
      transaction.onerror = (e) => reject(e.target.error);
    });
  },

  // 清空特定 store 所有資料
  async clear(storeName) {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      localStorage.setItem(`${p}${storeName}`, JSON.stringify([]));
      this.notify(storeName, 'clear', null);
      return true;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.dbInstance.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => {
          this.notify(storeName, 'clear', null);
          resolve(true);
        };
        req.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  // 刪除單筆資料
  async delete(storeName, id) {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      const list = JSON.parse(localStorage.getItem(`${p}${storeName}`) || '[]');
      const filtered = list.filter(i => i.id !== id);
      localStorage.setItem(`${p}${storeName}`, JSON.stringify(filtered));
      this.notify(storeName, 'delete', { id });
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.dbInstance.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => {
        this.notify(storeName, 'delete', { id });
        resolve(true);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  // 清除當前使用者資料並重設為範本
  async resetToDefault() {
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      localStorage.removeItem(`${p}INIT`);
      this.initFallback();
      this.notify('all', 'reset', null);
      return true;
    }

    const stores = ['quizzes', 'termExams', 'mockExams', 'targetSchools', 'mistakes', 'settings'];
    const transaction = this.dbInstance.transaction(stores, 'readwrite');
    stores.forEach(s => transaction.objectStore(s).clear());

    await new Promise(res => { transaction.oncomplete = res; });
    await this.checkAndSeedDefaultData();
    this.notify('all', 'reset', null);
    return true;
  },

  // 取得完整匯出 JSON (含全考種錯題本)
  async exportAllData() {
    const [quizzes, termExams, mockExams, targetSchools, mistakes, settings] = await Promise.all([
      this.getAll('quizzes'),
      this.getAll('termExams'),
      this.getAll('mockExams'),
      this.getAll('targetSchools'),
      this.getAll('mistakes'),
      this.get('settings', 'main')
    ]);

    return {
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      quizzes,
      termExams,
      mockExams,
      targetSchools,
      mistakes: mistakes || [],
      settings: settings || SEED_DATA.settings
    };
  },

  // 匯入完整 JSON 資料 (含健全性校驗與標準結構修復)
  async importAllData(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('無效的備份檔案格式');
    }

    const incomingMocks = Array.isArray(payload.mockExams) ? payload.mockExams : [];
    const incomingQuizzes = Array.isArray(payload.quizzes) ? payload.quizzes : [];
    const incomingTerms = Array.isArray(payload.termExams) ? payload.termExams : [];
    const incomingMistakes = Array.isArray(payload.mistakes) ? payload.mistakes : [];
    const totalIncoming = incomingMocks.length + incomingQuizzes.length + incomingTerms.length + incomingMistakes.length;

    const curMocks = await this.getAll('mockExams');
    const curQuizzes = await this.getAll('quizzes');
    const curTerms = await this.getAll('termExams');
    const curMistakes = await this.getAll('mistakes');
    const totalLocal = curMocks.length + curQuizzes.length + curTerms.length + curMistakes.length;

    // 若雲端為空 (0筆) 但本地有成績，不要清空本地，保留現存紀錄
    if (totalIncoming === 0 && totalLocal > 0) {
      console.warn('雲端試算表目前為空，保留本地成績資料。');
      return { status: 'cloud_empty', incomingCount: 0, localCount: totalLocal };
    }

    // 1. 智慧合併小考 (Merge Quizzes by ID)
    const quizMap = new Map();
    curQuizzes.forEach(q => { if (q && q.id) quizMap.set(String(q.id), q); });
    incomingQuizzes.forEach(q => {
      if (q && q.id) {
        quizMap.set(String(q.id), { ...(quizMap.get(String(q.id)) || {}), ...q });
      }
    });
    const mergedQuizzes = Array.from(quizMap.values());

    // 2. 智慧合併定期段考 (Merge Term Exams by ID)
    const termMap = new Map();
    curTerms.forEach(t => { if (t && t.id) termMap.set(String(t.id), t); });
    incomingTerms.forEach(t => {
      if (t && t.id) {
        termMap.set(String(t.id), { ...(termMap.get(String(t.id)) || {}), ...t });
      }
    });
    const mergedTerms = Array.from(termMap.values());

    // 3. 智慧合併模擬考 (Merge Mock Exams by ID or Title+Date)
    const mockMap = new Map();
    curMocks.forEach(m => {
      if (m && m.id) mockMap.set(String(m.id), m);
    });
    incomingMocks.forEach((m, idx) => {
      const cleanM = {
        id: m.id ? String(m.id) : `mock_${Date.now()}_${idx}`,
        title: m.title ? String(m.title) : '模擬考評量',
        date: m.date || new Date().toISOString().slice(0, 10),
        organizer: m.organizer || '模擬考',
        scope: m.scope || '全範圍',
        district: m.district || 'KEELUNG_TAIPEI',
        blindspot: m.blindspot || '',
        subjects: m.subjects || {
          CHINESE: { notation: 'B' },
          ENGLISH: { notation: 'B' },
          MATH: { notation: 'B' },
          SOCIAL: { notation: 'B' },
          SCIENCE: { notation: 'B' },
          WRITING: { grade: 4 }
        },
        notes: m.notes || ''
      };
      let foundKey = cleanM.id;
      for (const [existingId, existingMock] of mockMap.entries()) {
        if (existingMock.title === cleanM.title && existingMock.date === cleanM.date) {
          foundKey = existingId;
          break;
        }
      }
      mockMap.set(foundKey, { ...(mockMap.get(foundKey) || {}), ...cleanM });
    });
    const mergedMocks = Array.from(mockMap.values());

    // 4. 智慧合併目標學校
    const curSchools = await this.getAll('targetSchools');
    const schoolMap = new Map();
    curSchools.forEach(s => { if (s && s.id) schoolMap.set(String(s.id), s); });
    if (Array.isArray(payload.targetSchools)) {
      payload.targetSchools.forEach(s => {
        if (s && s.id) schoolMap.set(String(s.id), { ...(schoolMap.get(String(s.id)) || {}), ...s });
      });
    }
    const mergedSchools = Array.from(schoolMap.values());

    // 5. 智慧合併錯題庫 (Merge Mistakes by ID)
    const mistakeMap = new Map();
    curMistakes.forEach(m => { if (m && m.id) mistakeMap.set(String(m.id), m); });
    incomingMistakes.forEach(m => {
      if (m && m.id) {
        mistakeMap.set(String(m.id), { ...(mistakeMap.get(String(m.id)) || {}), ...m });
      }
    });
    const mergedMistakes = Array.from(mistakeMap.values());

    // 寫入儲存
    if (this.useLocalStorage) {
      const p = this.getStoragePrefix();
      localStorage.setItem(`${p}quizzes`, JSON.stringify(mergedQuizzes));
      localStorage.setItem(`${p}termExams`, JSON.stringify(mergedTerms));
      localStorage.setItem(`${p}mockExams`, JSON.stringify(mergedMocks));
      localStorage.setItem(`${p}mistakes`, JSON.stringify(mergedMistakes));
      if (mergedSchools.length > 0) localStorage.setItem(`${p}targetSchools`, JSON.stringify(mergedSchools));
      if (payload.settings) {
        const curSettings = JSON.parse(localStorage.getItem(`${p}settings`) || '{}');
        localStorage.setItem(`${p}settings`, JSON.stringify({ ...curSettings, ...payload.settings }));
      }
      this.notify('all', 'import', null);
      return { status: 'success', incomingCount: totalIncoming };
    }

    // IndexedDB: 清空並寫入合併後的完整集合 (保證不遺失任何本地或雲端成績)
    await this.clear('quizzes');
    if (mergedQuizzes.length > 0) await this.bulkPut('quizzes', mergedQuizzes);

    await this.clear('termExams');
    if (mergedTerms.length > 0) await this.bulkPut('termExams', mergedTerms);

    await this.clear('mockExams');
    if (mergedMocks.length > 0) await this.bulkPut('mockExams', mergedMocks);

    await this.clear('mistakes');
    if (mergedMistakes.length > 0) await this.bulkPut('mistakes', mergedMistakes);

    if (mergedSchools.length > 0) {
      await this.clear('targetSchools');
      await this.bulkPut('targetSchools', mergedSchools);
    }

    if (payload.settings) {
      const curSettings = (await this.get('settings', 'main')) || {};
      await this.put('settings', { id: 'main', ...curSettings, ...payload.settings });
    }

    this.notify('all', 'import', null);
    return { status: 'success', incomingCount: totalIncoming };
  }
};
