// 學業成績智慧彙整系統 - 本地資料庫 (IndexedDB / LocalStorage Local-First Engine)
const DB = {
  dbName: 'CAP_AcademicTracker_DB',
  dbVersion: 1,
  dbInstance: null,
  listeners: [],

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
        cb({ collection, action, data, timestamp: Date.now() });
      } catch (err) {
        console.error('DB notify error:', err);
      }
    });
  },

  // 初始化資料庫
  async init() {
    // 若尚未執行過 v2 清除，自動徹底清空舊版 IndexedDB 與 LocalStorage 殘留假資料
    const isPurged = localStorage.getItem('CAP_V2_PURGED') === 'true';
    if (!isPurged) {
      console.log('Purging legacy dummy data from browser cache...');
      localStorage.clear();
      localStorage.setItem('CAP_V2_PURGED', 'true');
      if (window.indexedDB) {
        await new Promise((resolve) => {
          const delReq = indexedDB.deleteDatabase(this.dbName);
          delReq.onsuccess = () => resolve(true);
          delReq.onerror = () => resolve(true);
          delReq.onblocked = () => resolve(true);
        });
      }
    }

    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to LocalStorage');
        this.initFallback();
        resolve(true);
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

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

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      };

      request.onsuccess = async (event) => {
        this.dbInstance = event.target.result;
        // 檢查是否需導入初始展示資料
        await this.checkAndSeedDefaultData();
        resolve(true);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        this.initFallback();
        resolve(true);
      };
    });
  },

  // LocalStorage 回退方案
  initFallback() {
    this.useLocalStorage = true;
    const seeded = localStorage.getItem('CAP_TRACKER_INIT');
    if (!seeded) {
      localStorage.setItem('CAP_quizzes', JSON.stringify([]));
      localStorage.setItem('CAP_termExams', JSON.stringify([]));
      localStorage.setItem('CAP_mockExams', JSON.stringify([]));
      localStorage.setItem('CAP_targetSchools', JSON.stringify(CONSTANTS.TARGET_SCHOOLS_DB));
      localStorage.setItem('CAP_settings', JSON.stringify(SEED_DATA.settings));
      localStorage.setItem('CAP_TRACKER_INIT', 'true');
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
      const data = JSON.parse(localStorage.getItem(`CAP_${storeName}`) || '[]');
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
      const data = localStorage.getItem(`CAP_${storeName}`);
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
      if (storeName === 'settings') {
        return JSON.parse(localStorage.getItem('CAP_settings') || '{}');
      }
      const list = JSON.parse(localStorage.getItem(`CAP_${storeName}`) || '[]');
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
      if (storeName === 'settings') {
        localStorage.setItem('CAP_settings', JSON.stringify(item));
      } else {
        const list = JSON.parse(localStorage.getItem(`CAP_${storeName}`) || '[]');
        const idx = list.findIndex(i => i.id === item.id);
        if (idx >= 0) list[idx] = item;
        else list.push(item);
        localStorage.setItem(`CAP_${storeName}`, JSON.stringify(list));
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
      localStorage.setItem(`CAP_${storeName}`, JSON.stringify(items));
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
      localStorage.setItem(`CAP_${storeName}`, JSON.stringify([]));
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
      const list = JSON.parse(localStorage.getItem(`CAP_${storeName}`) || '[]');
      const filtered = list.filter(i => i.id !== id);
      localStorage.setItem(`CAP_${storeName}`, JSON.stringify(filtered));
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

  // 清除全部資料並重設為範本
  async resetToDefault() {
    if (this.useLocalStorage) {
      localStorage.clear();
      this.initFallback();
      this.notify('all', 'reset', null);
      return true;
    }

    const stores = ['quizzes', 'termExams', 'mockExams', 'targetSchools', 'settings'];
    const transaction = this.dbInstance.transaction(stores, 'readwrite');
    stores.forEach(s => transaction.objectStore(s).clear());

    await new Promise(res => { transaction.oncomplete = res; });
    await this.checkAndSeedDefaultData();
    this.notify('all', 'reset', null);
    return true;
  },

  // 取得完整匯出 JSON
  async exportAllData() {
    const [quizzes, termExams, mockExams, targetSchools, settings] = await Promise.all([
      this.getAll('quizzes'),
      this.getAll('termExams'),
      this.getAll('mockExams'),
      this.getAll('targetSchools'),
      this.get('settings', 'main')
    ]);

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      quizzes,
      termExams,
      mockExams,
      targetSchools,
      settings: settings || SEED_DATA.settings
    };
  },

  // 匯入完整 JSON 資料 (含健全性校驗與標準結構修復)
  async importAllData(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('無效的備份檔案格式');
    }

    if (this.useLocalStorage) {
      if (Array.isArray(payload.quizzes)) localStorage.setItem('CAP_quizzes', JSON.stringify(payload.quizzes));
      if (Array.isArray(payload.termExams)) localStorage.setItem('CAP_termExams', JSON.stringify(payload.termExams));
      if (Array.isArray(payload.mockExams)) localStorage.setItem('CAP_mockExams', JSON.stringify(payload.mockExams));
      if (Array.isArray(payload.targetSchools)) localStorage.setItem('CAP_targetSchools', JSON.stringify(payload.targetSchools));
      if (payload.settings) localStorage.setItem('CAP_settings', JSON.stringify(payload.settings));
      this.notify('all', 'import', null);
      return true;
    }

    if (Array.isArray(payload.quizzes)) {
      await this.clear('quizzes');
      if (payload.quizzes.length > 0) await this.bulkPut('quizzes', payload.quizzes);
    }
    if (Array.isArray(payload.termExams)) {
      await this.clear('termExams');
      if (payload.termExams.length > 0) await this.bulkPut('termExams', payload.termExams);
    }
    if (Array.isArray(payload.mockExams)) {
      await this.clear('mockExams');
      const cleanMocks = payload.mockExams.map((m, idx) => ({
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
      }));
      if (cleanMocks.length > 0) await this.bulkPut('mockExams', cleanMocks);
    }
    if (Array.isArray(payload.targetSchools) && payload.targetSchools.length > 0) {
      await this.clear('targetSchools');
      await this.bulkPut('targetSchools', payload.targetSchools);
    }
    if (payload.settings) {
      const curSettings = (await this.get('settings', 'main')) || {};
      await this.put('settings', { id: 'main', ...curSettings, ...payload.settings });
    }

    this.notify('all', 'import', null);
    return true;
  }
};
