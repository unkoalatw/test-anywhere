// 學業成績智慧彙整與多維分析系統 - 主控制器 (Main Application Controller)
const App = {
  currentModule: 'mock', // 'mock', 'term', 'quiz'
  currentView: 'dashboard', // 'dashboard', 'grid', 'kanban', 'gallery'
  activeModal: null,
  cachedData: {
    quizzes: [],
    termExams: [],
    mockExams: [],
    targetSchools: [],
    settings: {}
  },
  deferredInstallPrompt: null,

  async init() {
    console.log('Initializing Academic Tracker System...');
    
    // 0. 初始化認證引擎與當前使用者
    if (window.Auth) {
      Auth.init();
    }
    const currentUser = (window.Auth && Auth.getCurrentUser()) || null;

    // 1. 初始化本地資料庫 (指定當前使用者專屬獨立庫)
    await DB.init(currentUser ? currentUser.email : 'littletiger0815@gmail.com');
    await this.loadAllData();

    // 2. 註冊資料變更事件監聽
    DB.subscribe(async (event) => {
      console.log('DB Event received:', event);
      await this.loadAllData();
      this.refreshCurrentView();
    });

    // 3. 註冊 PWA 安裝提示事件
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const installBtn = document.getElementById('btn-pwa-install');
      if (installBtn) installBtn.style.display = 'inline-flex';
    });

    // 4. 註冊 Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker registered successfully'))
        .catch(err => console.warn('Service Worker registration failed:', err));
    }

    // 5. 渲染初始畫面
    this.setupEventListeners();
    this.refreshCurrentView();
    if (window.lucide) lucide.createIcons();

    // 6. 啟動高頻背景雲端自動同步引擎
    this.initBackgroundSync();
  },

  // 當切換登入使用者時重新載入資料庫並刷新視圖
  async onUserSwitched(user) {
    await this.loadAllData();
    this.refreshCurrentView();
    // 切換後自動嘗試從雲端拉取該帳號最新資料
    const currentUrl = this.cachedData.settings?.gasUrl;
    if (currentUrl && navigator.onLine) {
      GasSync.pullFromCloud(currentUrl, { silent: true }).then(async (res) => {
        if (res && res.data) {
          await this.loadAllData();
          this.refreshCurrentView();
        }
      }).catch(() => {});
    }
  },

  async loadAllData() {
    const [quizzes, termExams, mockExams, miniMocks, targetSchools, mistakes, settings] = await Promise.all([
      DB.getAll('quizzes'),
      DB.getAll('termExams'),
      DB.getAll('mockExams'),
      DB.getAll('miniMocks'),
      DB.getAll('targetSchools'),
      DB.getAll('mistakes'),
      DB.get('settings', 'main')
    ]);

    this.cachedData = {
      quizzes: quizzes || [],
      termExams: termExams || [],
      mockExams: mockExams || [],
      miniMocks: miniMocks || [],
      targetSchools: targetSchools && targetSchools.length > 0 ? targetSchools : CONSTANTS.TARGET_SCHOOLS_DB,
      mistakes: mistakes || [],
      settings: settings || SEED_DATA.settings
    };

    // 更新使用者標題
    this.updateUserHeader();
  },

  updateUserHeader() {
    const st = this.cachedData.settings || {};
    const currentUser = (window.Auth && Auth.getCurrentUser()) || null;
    const nameEl = document.getElementById('header-student-name');
    const schEl = document.getElementById('header-school-info');
    if (nameEl) {
      nameEl.textContent = currentUser?.studentName || st.studentName || '考生檔案';
    }
    if (schEl) {
      if (currentUser?.email) {
        schEl.textContent = currentUser.email;
      } else if (st.schoolName || st.gradeClass) {
        schEl.textContent = `${st.schoolName || ''} ${st.gradeClass || ''}`.trim();
      } else {
        schEl.textContent = '點擊切換帳號或設定';
      }
    }
  },

  setupEventListeners() {
    // 監聽鍵盤 ESC 關閉 Modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal();
      }
    });
  },

  /**
   * 切換主模組 (全模 / 單科模模考 / 段考 / 小考)
   */
  switchModule(moduleId) {
    this.currentModule = moduleId;
    
    // 如果當前在 Dashboard 且使用者切換了特定評量模組，自動切換至該模組的表格視圖
    if (this.currentView === 'dashboard') {
      this.currentView = 'grid';
      document.querySelectorAll('.view-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === 'grid');
      });
    }

    // 更新按鈕樣式
    document.querySelectorAll('.module-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.module === moduleId);
    });

    this.refreshCurrentView();
  },

  /**
   * 切換多維表格視圖 (Dashboard / Grid / Kanban / Gallery)
   */
  switchView(viewId) {
    this.currentView = viewId;

    // 更新視圖按鈕樣式 (頂部按鈕 + 手機版底部導覽按鈕)
    document.querySelectorAll('.view-tab-btn, .mobile-nav-btn').forEach(btn => {
      if (btn.dataset.view) {
        btn.classList.toggle('active', btn.dataset.view === viewId);
      }
    });

    this.refreshCurrentView();
  },

  /**
   * 根據當前選取的模組與視圖重新渲染主畫面
   */
  refreshCurrentView() {
    const mainContainer = document.getElementById('view-content-area');
    if (!mainContainer) return;

    const { quizzes, termExams, mockExams, miniMocks, targetSchools, settings } = this.cachedData;

    // 1. 儀表板視圖
    if (this.currentView === 'dashboard') {
      BitableDashboard.renderDashboard('view-content-area', this.cachedData);
      return;
    }

    // 2. 看板視圖
    if (this.currentView === 'kanban') {
      BitableKanban.renderKanban('view-content-area', quizzes, mockExams);
      return;
    }

    // 3. 錯題筆記與 AI 診斷畫廊視圖
    if (this.currentView === 'gallery') {
      BitableGallery.renderGallery('view-content-area', this.cachedData);
      return;
    }

    // 4. 表格視圖 (依照當前模組渲染)
    if (this.currentView === 'grid') {
      if (this.currentModule === 'mock') {
        BitableGrid.renderMockExamGrid('view-content-area', mockExams, settings.district || 'KEELUNG_TAIPEI');
      } else if (this.currentModule === 'mini_mock') {
        BitableGrid.renderMiniMockGrid('view-content-area', miniMocks);
      } else if (this.currentModule === 'term') {
        BitableGrid.renderTermExamGrid('view-content-area', termExams);
      } else if (this.currentModule === 'quiz') {
        BitableGrid.renderQuizGrid('view-content-area', quizzes);
      }
    }
  },

  /**
   * 快速新增資料分發 (點擊右上角新增按鈕或手機底部 FAB)
   */
  openQuickAddModal() {
    if (this.currentView === 'grid') {
      if (this.currentModule === 'mock') return this.openMockModal();
      if (this.currentModule === 'mini_mock') return this.openMiniMockModal();
      if (this.currentModule === 'term') return this.openTermModal();
      if (this.currentModule === 'quiz') return this.openQuizModal();
    }

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-md" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="plus-circle" class="w-5 h-5 text-primary-blue"></i>
              <h3 class="font-bold text-base text-primary">選擇錄入成績類型</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <div class="modal-body py-4 space-y-3">
            <div class="p-3.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-primary-blue/50 transition-all cursor-pointer flex items-center justify-between group" onclick="App.closeModal(); App.openMockModal();">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary-blue/15 text-primary-blue flex items-center justify-center font-bold">
                  <i data-lucide="target" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="font-bold text-sm text-primary group-hover:text-primary-blue transition-colors">會考全真模擬考</h4>
                  <p class="text-2xs text-muted">全科矩陣點選 • 換算 36 點/積分與高中志願落點</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-muted group-hover:text-primary transition-transform group-hover:translate-x-1"></i>
            </div>

            <div class="p-3.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-rose-400/50 transition-all cursor-pointer flex items-center justify-between group" onclick="App.closeModal(); App.openMiniMockModal();">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold">
                  <i data-lucide="calculator" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="font-bold text-sm text-primary group-hover:text-rose-400 transition-colors">🎯 單科模模考 (即時算分)</h4>
                  <p class="text-2xs text-muted">輸入單科答對題數 • 即時推算等級標示 (A++~C) 與換算積點</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-muted group-hover:text-primary transition-transform group-hover:translate-x-1"></i>
            </div>

            <div class="p-3.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-primary-purple/50 transition-all cursor-pointer flex items-center justify-between group" onclick="App.closeModal(); App.openQuizModal();">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-primary-purple/15 text-primary-purple flex items-center justify-center font-bold">
                  <i data-lucide="file-check" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="font-bold text-sm text-primary group-hover:text-primary-purple transition-colors">隨堂小考評量</h4>
                  <p class="text-2xs text-muted">單元章節掌握度 • 錯題歸因分類與訂正追蹤</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-muted group-hover:text-primary transition-transform group-hover:translate-x-1"></i>
            </div>

            <div class="p-3.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-success/50 transition-all cursor-pointer flex items-center justify-between group" onclick="App.closeModal(); App.openTermModal();">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-success/15 text-success flex items-center justify-center font-bold">
                  <i data-lucide="award" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="font-bold text-sm text-primary group-hover:text-success transition-colors">定期段考評量</h4>
                  <p class="text-2xs text-muted">9 大考科分科實得分數 • 班平均 / 高低標 / 排名</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-muted group-hover:text-primary transition-transform group-hover:translate-x-1"></i>
            </div>

            <div class="p-3.5 rounded-lg border border-border bg-card/60 hover:bg-card hover:border-warning/50 transition-all cursor-pointer flex items-center justify-between group" onclick="App.closeModal(); App.openAddMistakeModal();">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-warning/15 text-warning flex items-center justify-center font-bold">
                  <i data-lucide="book-open" class="w-5 h-5"></i>
                </div>
                <div>
                  <h4 class="font-bold text-sm text-primary group-hover:text-warning transition-colors">收錄各考種錯題與盲點</h4>
                  <p class="text-2xs text-muted">記錄題型、思路障礙與核心盲點 • 匯出 AI 深度診斷與變形題出題</p>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-muted group-hover:text-primary transition-transform group-hover:translate-x-1"></i>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  // ==========================================
  // 1. 模擬考 10 秒快速點選錄入彈窗
  // ==========================================
  openMockModal(editId = null) {
    const isEdit = Boolean(editId);
    const item = isEdit ? this.cachedData.mockExams.find(m => m.id === editId) : null;
    const sub = (item && item.subjects) || {};

    const chNotation = (sub.CHINESE && sub.CHINESE.notation) || 'A';
    const enNotation = (sub.ENGLISH && sub.ENGLISH.notation) || 'A';
    const maNotation = (sub.MATH && sub.MATH.notation) || 'A';
    const soNotation = (sub.SOCIAL && sub.SOCIAL.notation) || 'A';
    const scNotation = (sub.SCIENCE && sub.SCIENCE.notation) || 'A';
    const wrGrade = (sub.WRITING && sub.WRITING.grade !== undefined) ? sub.WRITING.grade : 5;

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="target" class="w-5 h-5 text-primary-blue"></i>
              <h3 class="font-bold text-base text-primary">${isEdit ? '編輯會考模擬考紀錄' : '會考模擬考 10 秒快速點選錄入'}</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <form id="form-mock-exam" onsubmit="App.saveMockExam(event, '${editId || ''}')" class="modal-body py-4 space-y-4 max-h-[78vh] overflow-y-auto">
            
            <!-- 基礎資訊 -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="form-label">考次名稱 / 梯次 *</label>
                <input type="text" id="mock-title" required class="form-input" value="${item ? item.title : '114學年度 第 4 次國中教育會考全模'}" placeholder="如：114-1 全國模擬考" />
              </div>
              <div>
                <label class="form-label">測驗日期 *</label>
                <input type="date" id="mock-date" required class="form-input" value="${item ? item.date : new Date().toISOString().slice(0, 10)}" />
              </div>
              <div>
                <label class="form-label">主辦單位 / 卷別</label>
                <select id="mock-organizer" class="form-input">
                  ${CONSTANTS.MOCK_ORGANIZERS.map(org => `<option value="${org}" ${item && item.organizer === org ? 'selected' : ''}>${org}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="form-label">測驗範圍</label>
                <select id="mock-scope" class="form-input">
                  ${CONSTANTS.MOCK_SCOPES.map(sc => `<option value="${sc}" ${item && item.scope === sc ? 'selected' : ''}>${sc}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">計分考區</label>
                <select id="mock-district" class="form-input" onchange="App.onFastEntryRecalculate()">
                  ${CONSTANTS.DISTRICT_MODELS.map(d => `<option value="${d.id}" ${item && item.district === d.id ? 'selected' : (this.cachedData.settings.district === d.id ? 'selected' : '')}>${d.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- 5 科等級點選矩陣 (Matrix Selector) -->
            <div class="border border-border/80 rounded-lg p-3 bg-surface/50 space-y-3">
              <div class="text-xs font-bold text-secondary flex items-center justify-between">
                <span>🎯 五大考科等級矩陣一鍵點選</span>
                <span class="text-2xs text-muted font-normal">點選對應等級即可極速換算</span>
              </div>

              <!-- 國文 -->
              <div class="subject-entry-row p-2.5 rounded-lg bg-card/70 border border-border/50">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-bold text-xs text-primary">國文科</span>
                  <input type="number" id="mock-ch-correct" class="form-input-inline w-24 text-xs text-right" placeholder="答對題數(42)" value="${sub.CHINESE && sub.CHINESE.rawCorrect !== undefined ? sub.CHINESE.rawCorrect : ''}" min="0" max="42" />
                </div>
                <div class="matrix-btn-group" data-subject="CHINESE">
                  ${this.renderNotationButtons('CHINESE', chNotation)}
                </div>
              </div>

              <!-- 英語 (含聽力與閱讀加權計算) -->
              <div class="subject-entry-row p-2.5 rounded-lg bg-card/70 border border-border/50">
                <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs text-primary">英語科</span>
                    <span id="mock-en-weighted-preview" class="text-primary-blue font-mono font-bold text-2xs"></span>
                  </div>
                  <div class="flex items-center gap-1.5 text-2xs">
                    <input type="number" id="mock-en-reading" class="form-input-inline w-16 text-xs text-right" placeholder="閱(43)" value="${sub.ENGLISH && sub.ENGLISH.readingCorrect !== undefined ? sub.ENGLISH.readingCorrect : ''}" min="0" max="43" oninput="App.onFastEntryRecalculate()" />
                    <input type="number" id="mock-en-listening" class="form-input-inline w-16 text-xs text-right" placeholder="聽(21)" value="${sub.ENGLISH && sub.ENGLISH.listeningCorrect !== undefined ? sub.ENGLISH.listeningCorrect : ''}" min="0" max="21" oninput="App.onFastEntryRecalculate()" />
                  </div>
                </div>
                <div class="matrix-btn-group" data-subject="ENGLISH">
                  ${this.renderNotationButtons('ENGLISH', enNotation)}
                </div>
              </div>

              <!-- 數學 (含選擇與非選加權計算) -->
              <div class="subject-entry-row p-2.5 rounded-lg bg-card/70 border border-border/50">
                <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs text-primary">數學科</span>
                    <span id="mock-ma-weighted-preview" class="text-primary-purple font-mono font-bold text-2xs"></span>
                  </div>
                  <div class="flex items-center gap-1.5 text-2xs">
                    <input type="number" id="mock-ma-choice" class="form-input-inline w-16 text-xs text-right" placeholder="選(25)" value="${sub.MATH && sub.MATH.choiceCorrect !== undefined ? sub.MATH.choiceCorrect : ''}" min="0" max="25" oninput="App.onFastEntryRecalculate()" />
                    <input type="number" id="mock-ma-nonchoice" class="form-input-inline w-16 text-xs text-right" placeholder="非選(6)" value="${sub.MATH && sub.MATH.nonChoiceScore !== undefined ? sub.MATH.nonChoiceScore : ''}" min="0" max="6" step="0.5" oninput="App.onFastEntryRecalculate()" />
                  </div>
                </div>
                <div class="matrix-btn-group" data-subject="MATH">
                  ${this.renderNotationButtons('MATH', maNotation)}
                </div>
              </div>

              <!-- 社會 -->
              <div class="subject-entry-row p-2.5 rounded-lg bg-card/70 border border-border/50">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-bold text-xs text-primary">社會科</span>
                  <input type="number" id="mock-so-correct" class="form-input-inline w-24 text-xs text-right" placeholder="答對題數(54)" value="${sub.SOCIAL && sub.SOCIAL.rawCorrect !== undefined ? sub.SOCIAL.rawCorrect : ''}" min="0" max="54" />
                </div>
                <div class="matrix-btn-group" data-subject="SOCIAL">
                  ${this.renderNotationButtons('SOCIAL', soNotation)}
                </div>
              </div>

              <!-- 自然 -->
              <div class="subject-entry-row p-2.5 rounded-lg bg-card/70 border border-border/50">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-bold text-xs text-primary">自然科</span>
                  <input type="number" id="mock-sc-correct" class="form-input-inline w-24 text-xs text-right" placeholder="答對題數(50)" value="${sub.SCIENCE && sub.SCIENCE.rawCorrect !== undefined ? sub.SCIENCE.rawCorrect : ''}" min="0" max="50" />
                </div>
                <div class="matrix-btn-group" data-subject="SCIENCE">
                  ${this.renderNotationButtons('SCIENCE', scNotation)}
                </div>
              </div>

              <!-- 寫作測驗 -->
              <div class="subject-entry-row p-2.5 rounded-lg bg-card/70 border border-border/50">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-bold text-xs text-primary">寫作測驗</span>
                  <span class="text-3xs text-muted">0 ~ 6 級分</span>
                </div>
                <div class="writing-btn-group">
                  ${[6, 5, 4, 3, 2, 1, 0].map(g => `
                    <button type="button" class="btn-tier ${wrGrade === g ? 'active' : ''}" data-grade="${g}" onclick="App.selectWritingGrade(${g})">
                      ${g}級
                    </button>
                  `).join('')}
                </div>
                <input type="hidden" id="mock-writing-grade" value="${wrGrade}" />
              </div>

            </div>

            <!-- 即時動態計分預覽條 -->
            <div id="fast-entry-summary-bar" class="p-3 rounded-lg bg-primary-blue/10 border border-primary-blue/30 flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <i data-lucide="zap" class="w-4 h-4 text-warning"></i>
                <span class="text-secondary">即時運算：</span>
                <b id="preview-summary-tier" class="text-success font-bold font-mono text-sm">5A 8+</b>
              </div>
              <div class="flex items-center gap-3">
                <span>總積點：<b id="preview-total-points" class="text-primary-blue font-bold font-mono text-sm">34.8 點</b></span>
                <span>總積分：<b id="preview-total-credits" class="text-primary font-bold font-mono text-sm">36 分</b></span>
              </div>
            </div>

            <!-- 核心盲點與複習重點 -->
            <div>
              <label class="form-label text-warning flex items-center gap-1.5">
                <i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>
                <span>本次模考關鍵盲點與複習核心 (考前速覽)</span>
              </label>
              <input type="text" id="mock-blindspot" class="form-input border-warning/40 focus:border-warning" value="${item ? (item.blindspot || '') : ''}" placeholder="例如：英文閱讀題組時間分配、數學幾何輔助線構思、自然電磁感應右手定則判斷..." />
            </div>

            <!-- 策略備註 -->
            <div>
              <label class="form-label">模考總結與弱點筆記</label>
              <textarea id="mock-notes" class="form-input" rows="2" placeholder="紀錄本次模考失分原因、非選步驟、時間分配心得...">${item ? (item.notes || '') : ''}</textarea>
            </div>

            <!-- 本卷錯題收錄與 AI 深度診斷快捷入口 -->
            ${isEdit ? `
              <div class="p-3 rounded-lg bg-surface/70 border border-border flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <i data-lucide="book-open" class="w-4 h-4 text-rose-400"></i>
                  <span class="text-xs font-bold text-primary">本次模考收錄錯題：</span>
                  <span class="badge badge-primary text-3xs font-mono">${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length} 題</span>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-primary-blue border-primary-blue/40" onclick="App.openAddMistakeModal(null, { examId: '${editId}', examType: 'mock', date: '${item.date}', title: '${item.title}' })">
                    <i data-lucide="plus" class="w-3 h-3 inline mr-0.5"></i>收錄本卷錯題
                  </button>
                  ${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length > 0 ? `
                    <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-warning border-warning/40" onclick="App.openAIExportModal('${editId}', 'mock')">
                      <i data-lucide="sparkles" class="w-3 h-3 inline mr-0.5"></i>AI 診斷本卷
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button type="button" class="btn-secondary" onclick="App.closeModal()">取消</button>
              <button type="submit" class="btn-primary">儲存模考紀錄</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
    this.onFastEntryRecalculate();
  },

  renderNotationButtons(subjectCode, currentNotation) {
    const notations = ['A++', 'A+', 'A', 'B++', 'B+', 'B', 'C'];
    return notations.map(not => {
      const isSelected = not === currentNotation;
      return `
        <button type="button" class="btn-tier ${isSelected ? 'active' : ''}" data-subject="${subjectCode}" data-notation="${not}" onclick="App.selectNotation('${subjectCode}', '${not}')">
          ${not}
        </button>
      `;
    }).join('');
  },

  selectNotation(subjectCode, notation) {
    const group = document.querySelector(`.matrix-btn-group[data-subject="${subjectCode}"]`);
    if (group) {
      group.querySelectorAll('.btn-tier').forEach(b => {
        b.classList.toggle('active', b.dataset.notation === notation);
      });
    }
    this.onFastEntryRecalculate();
  },

  selectWritingGrade(grade) {
    const input = document.getElementById('mock-writing-grade');
    if (input) input.value = grade;
    document.querySelectorAll('.writing-btn-group .btn-tier').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.grade) === grade);
    });
    this.onFastEntryRecalculate();
  },

  onFastEntryRecalculate() {
    const getSubNotation = (code) => {
      const activeBtn = document.querySelector(`.matrix-btn-group[data-subject="${code}"] .btn-tier.active`);
      return activeBtn ? activeBtn.dataset.notation : 'B';
    };

    // 英語加權
    const rCor = document.getElementById('mock-en-reading')?.value;
    const lCor = document.getElementById('mock-en-listening')?.value;
    const enWScore = ScoringEngine.calcEnglishWeightedScore(
      rCor !== '' && rCor !== undefined ? Number(rCor) : null,
      43,
      lCor !== '' && lCor !== undefined ? Number(lCor) : null,
      21
    );
    const enWPreview = document.getElementById('mock-en-weighted-preview');
    if (enWPreview) enWPreview.textContent = enWScore !== null ? `加權 ${enWScore}分` : '';

    // 數學加權
    const cCor = document.getElementById('mock-ma-choice')?.value;
    const ncScore = document.getElementById('mock-ma-nonchoice')?.value;
    const maWScore = ScoringEngine.calcMathWeightedScore(
      cCor !== '' && cCor !== undefined ? Number(cCor) : null,
      25,
      ncScore !== '' && ncScore !== undefined ? Number(ncScore) : null,
      6
    );
    const maWPreview = document.getElementById('mock-ma-weighted-preview');
    if (maWPreview) maWPreview.textContent = maWScore !== null ? `加權 ${maWScore}分` : '';

    const district = document.getElementById('mock-district')?.value || 'KEELUNG_TAIPEI';
    const writingGrade = Number(document.getElementById('mock-writing-grade')?.value || 5);

    const tempMock = {
      subjects: {
        CHINESE: { notation: getSubNotation('CHINESE') },
        ENGLISH: { notation: getSubNotation('ENGLISH') },
        MATH: { notation: getSubNotation('MATH') },
        SOCIAL: { notation: getSubNotation('SOCIAL') },
        SCIENCE: { notation: getSubNotation('SCIENCE') },
        WRITING: { grade: writingGrade }
      }
    };

    const metrics = ScoringEngine.calculateMockMetrics(tempMock, district);

    const tierEl = document.getElementById('preview-summary-tier');
    const ptsEl = document.getElementById('preview-total-points');
    const crEl = document.getElementById('preview-total-credits');

    if (tierEl) tierEl.textContent = metrics.summaryTier;
    if (ptsEl) ptsEl.textContent = `${metrics.totalPoints} 點`;
    if (crEl) crEl.textContent = `${metrics.totalCredits} 分`;
  },

  async saveMockExam(event, editId) {
    event.preventDefault();
    const getSubNotation = (code) => {
      const activeBtn = document.querySelector(`.matrix-btn-group[data-subject="${code}"] .btn-tier.active`);
      return activeBtn ? activeBtn.dataset.notation : 'B';
    };

    const rCor = document.getElementById('mock-en-reading').value;
    const lCor = document.getElementById('mock-en-listening').value;
    const enWScore = ScoringEngine.calcEnglishWeightedScore(
      rCor ? Number(rCor) : null, 43, lCor ? Number(lCor) : null, 21
    );

    const cCor = document.getElementById('mock-ma-choice').value;
    const ncScore = document.getElementById('mock-ma-nonchoice').value;
    const maWScore = ScoringEngine.calcMathWeightedScore(
      cCor ? Number(cCor) : null, 25, ncScore ? Number(ncScore) : null, 6
    );

    const chCor = document.getElementById('mock-ch-correct').value;
    const soCor = document.getElementById('mock-so-correct').value;
    const scCor = document.getElementById('mock-sc-correct').value;

    const mockItem = {
      id: editId || `me_${Date.now()}`,
      title: document.getElementById('mock-title').value,
      date: document.getElementById('mock-date').value,
      organizer: document.getElementById('mock-organizer').value,
      scope: document.getElementById('mock-scope').value,
      district: document.getElementById('mock-district').value,
      blindspot: document.getElementById('mock-blindspot')?.value || '',
      subjects: {
        CHINESE: { notation: getSubNotation('CHINESE'), rawCorrect: chCor ? Number(chCor) : undefined },
        ENGLISH: { notation: getSubNotation('ENGLISH'), readingCorrect: rCor ? Number(rCor) : undefined, listeningCorrect: lCor ? Number(lCor) : undefined, weightedScore: enWScore },
        MATH: { notation: getSubNotation('MATH'), choiceCorrect: cCor ? Number(cCor) : undefined, nonChoiceScore: ncScore ? Number(ncScore) : undefined, weightedScore: maWScore },
        SOCIAL: { notation: getSubNotation('SOCIAL'), rawCorrect: soCor ? Number(soCor) : undefined },
        SCIENCE: { notation: getSubNotation('SCIENCE'), rawCorrect: scCor ? Number(scCor) : undefined },
        WRITING: { grade: Number(document.getElementById('mock-writing-grade').value || 5) }
      },
      notes: document.getElementById('mock-notes').value
    };

    await DB.put('mockExams', mockItem);
    await this.loadAllData();
    this.refreshCurrentView();
    BitableGrid.selectedSubject = 'ALL';
    BitableGrid.selectedFilter = 'ALL';
    BitableGrid.searchQuery = '';
    this.closeModal();
    this.showToast('會考模擬考成績儲存成功！', 'success');
    this.triggerBackgroundSyncPush();
  },

  // ==========================================
  // 1.5 單科模模考錄入彈窗 (即時換算會考標示與積點)
  // ==========================================
  openMiniMockModal(editId = null) {
    const isEdit = Boolean(editId);
    const item = isEdit ? this.cachedData.miniMocks.find(m => m.id === editId) : null;
    const currentSubject = item ? item.subject : 'CHINESE';

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="target" class="w-5 h-5 text-indigo-400"></i>
              <h3 class="font-bold text-base text-primary">${isEdit ? '編輯單科模模考紀錄' : '新增單科模模考 (即時算分)'}</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <form id="form-mini-mock" onsubmit="App.saveMiniMockExam(event, '${editId || ''}')" class="modal-body py-4 space-y-4 max-h-[75vh] overflow-y-auto">
            
            <!-- 基本資訊：科目、考次名稱、測驗日期 -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="form-label">測驗學科 (會考考科) *</label>
                <select id="mini-mock-subject" class="form-input font-bold" required onchange="App.onMiniMockSubjectChange(this.value)">
                  ${CONSTANTS.SUBJECTS.map(s => `
                    <option value="${s.id}" ${currentSubject === s.id ? 'selected' : ''}>${s.name} (${s.group})</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">單元或試卷名稱 *</label>
                <input type="text" id="mini-mock-title" required class="form-input" value="${item ? (item.title || item.unitName || '') : ''}" placeholder="如：歷屆112會考單科、1~4冊複習卷" />
              </div>
              <div>
                <label class="form-label">測驗日期 *</label>
                <input type="date" id="mini-mock-date" required class="form-input" value="${item ? item.date : new Date().toISOString().slice(0, 10)}" />
              </div>
            </div>

            <!-- 動態題數輸入欄位 (切換科目時自動抽換) -->
            <div id="mini-mock-inputs-container" class="p-3.5 rounded-lg bg-surface/70 border border-border space-y-3">
              <!-- 由 onMiniMockSubjectChange 動態渲染 -->
            </div>

            <!-- 即時會考等級標示與加權算分預覽看板 (Live Preview) -->
            <div class="p-4 rounded-xl bg-gradient-to-r from-card to-surface border border-primary-blue/30 shadow-sm space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-secondary flex items-center gap-1.5">
                  <i data-lucide="activity" class="w-4 h-4 text-primary-blue"></i>
                  即時會考等級推估看板 (國中教育會考常模)
                </span>
                <span id="mini-mock-upgrade-hint" class="text-3xs text-warning font-medium"></span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div class="p-2.5 rounded-lg bg-card/80 border border-border">
                  <div class="text-3xs text-muted">推估等級標示</div>
                  <div id="mini-mock-preview-notation" class="text-xl font-black text-primary font-mono mt-0.5">--</div>
                </div>
                <div class="p-2.5 rounded-lg bg-card/80 border border-border">
                  <div class="text-3xs text-muted">加權/實得分數</div>
                  <div id="mini-mock-preview-weighted" class="text-xl font-bold text-primary font-mono mt-0.5">--</div>
                </div>
                <div class="p-2.5 rounded-lg bg-card/80 border border-border">
                  <div class="text-3xs text-muted">換算積點 (基北/各區)</div>
                  <div id="mini-mock-preview-points" class="text-xl font-bold text-primary-blue font-mono mt-0.5">-- 點</div>
                </div>
                <div class="p-2.5 rounded-lg bg-card/80 border border-border">
                  <div class="text-3xs text-muted">積分等級</div>
                  <div id="mini-mock-preview-credits" class="text-xl font-bold text-success font-mono mt-0.5">-- 分</div>
                </div>
              </div>
            </div>

            <!-- 核心觀念盲點與解題漏洞 -->
            <div>
              <label class="form-label text-warning flex items-center gap-1.5">
                <i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>
                <span>單科失分盲點與易混淆觀念</span>
              </label>
              <input type="text" id="mini-mock-blindspot" class="form-input border-warning/40 focus:border-warning font-medium" value="${item ? (item.blindspot || '') : ''}" placeholder="例如：克漏字時態推論失誤、二次函數配方法計算粗心、力與運動圖形判讀混淆..." />
            </div>

            <div>
              <label class="form-label">檢討與備註</label>
              <textarea id="mini-mock-notes" class="form-input" rows="2" placeholder="記錄時間分配、答題節奏、手感等...">${item ? (item.notes || '') : ''}</textarea>
            </div>

            <!-- 本次模模考收錄錯題快捷入口 -->
            ${isEdit ? `
              <div class="p-3 rounded-lg bg-surface/70 border border-border flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <i data-lucide="book-open" class="w-4 h-4 text-rose-400"></i>
                  <span class="text-xs font-bold text-primary">本次單科模模考錯題：</span>
                  <span class="badge badge-primary text-3xs font-mono">${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length} 題</span>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-primary-blue border-primary-blue/40" onclick="App.openAddMistakeModal(null, { examId: '${editId}', examType: 'mini_mock', date: '${item.date}', subject: '${item.subject}', unitName: '${item.title || item.unitName}' })">
                    <i data-lucide="plus" class="w-3.5 h-3.5 inline mr-0.5"></i>收錄本卷錯題
                  </button>
                  ${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length > 0 ? `
                    <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-warning border-warning/40" onclick="App.openAIExportModal('${editId}', 'mini_mock')">
                      <i data-lucide="sparkles" class="w-3.5 h-3.5 inline mr-0.5"></i>AI 診斷本卷
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button type="button" class="btn-secondary" onclick="App.closeModal()">取消</button>
              <button type="submit" class="btn-primary">儲存單科模模考紀錄</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
    this.onMiniMockSubjectChange(currentSubject, item);
  },

  onMiniMockSubjectChange(subject, existingItem = null) {
    const container = document.getElementById('mini-mock-inputs-container');
    if (!container) return;

    let inputsHtml = '';

    if (subject === 'ENGLISH') {
      const rCor = existingItem ? (existingItem.readingCorrect ?? '') : '';
      const rTot = existingItem ? (existingItem.readingTotal ?? 43) : 43;
      const lCor = existingItem ? (existingItem.listeningCorrect ?? '') : '';
      const lTot = existingItem ? (existingItem.listeningTotal ?? 21) : 21;

      inputsHtml = `
        <div class="flex items-center justify-between pb-1.5 border-b border-border/50">
          <span class="text-xs font-bold text-primary flex items-center gap-1.5">
            <i data-lucide="headphones" class="w-3.5 h-3.5 text-primary-blue"></i>
            英語科題數輸入 (閱讀 80% + 聽力 20%)
          </span>
          <span class="text-3xs text-muted">滿分100加權分</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label class="form-label">閱讀答對題數 *</label>
            <input type="number" id="mini-en-reading-correct" min="0" max="${rTot}" class="form-input" value="${rCor}" placeholder="如 38" oninput="App.onMiniMockRecalculate()" required />
          </div>
          <div>
            <label class="form-label">閱讀總題數</label>
            <input type="number" id="mini-en-reading-total" min="1" class="form-input" value="${rTot}" oninput="App.onMiniMockRecalculate()" />
          </div>
          <div>
            <label class="form-label">聽力答對題數 *</label>
            <input type="number" id="mini-en-listening-correct" min="0" max="${lTot}" class="form-input" value="${lCor}" placeholder="如 20" oninput="App.onMiniMockRecalculate()" required />
          </div>
          <div>
            <label class="form-label">聽力總題數</label>
            <input type="number" id="mini-en-listening-total" min="1" class="form-input" value="${lTot}" oninput="App.onMiniMockRecalculate()" />
          </div>
        </div>
      `;
    } else if (subject === 'MATH') {
      const cCor = existingItem ? (existingItem.choiceCorrect ?? '') : '';
      const cTot = existingItem ? (existingItem.choiceTotal ?? 25) : 25;
      const ncSc = existingItem ? (existingItem.nonChoiceScore ?? '') : '';
      const ncTot = existingItem ? (existingItem.nonChoiceMaxScore ?? 6) : 6;

      inputsHtml = `
        <div class="flex items-center justify-between pb-1.5 border-b border-border/50">
          <span class="text-xs font-bold text-primary flex items-center gap-1.5">
            <i data-lucide="calculator" class="w-3.5 h-3.5 text-primary-blue"></i>
            數學科題數與非選得分輸入 (選擇 85% + 非選 15%)
          </span>
          <span class="text-3xs text-muted">滿分100加權分</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label class="form-label">選擇題答對題數 *</label>
            <input type="number" id="mini-ma-choice-correct" min="0" max="${cTot}" class="form-input" value="${cCor}" placeholder="如 23" oninput="App.onMiniMockRecalculate()" required />
          </div>
          <div>
            <label class="form-label">選擇總題數</label>
            <input type="number" id="mini-ma-choice-total" min="1" class="form-input" value="${cTot}" oninput="App.onMiniMockRecalculate()" />
          </div>
          <div>
            <label class="form-label">非選擇題得分 (0~${ncTot}) *</label>
            <input type="number" step="0.5" id="mini-ma-nonchoice-score" min="0" max="${ncTot}" class="form-input" value="${ncSc}" placeholder="如 5" oninput="App.onMiniMockRecalculate()" required />
          </div>
          <div>
            <label class="form-label">非選擇題滿分</label>
            <input type="number" id="mini-ma-nonchoice-total" min="1" class="form-input" value="${ncTot}" oninput="App.onMiniMockRecalculate()" />
          </div>
        </div>
      `;
    } else if (subject === 'WRITING') {
      const wGrade = existingItem ? (existingItem.writingGrade ?? 5) : 5;
      inputsHtml = `
        <div class="flex items-center justify-between pb-1.5 border-b border-border/50">
          <span class="text-xs font-bold text-primary flex items-center gap-1.5">
            <i data-lucide="feather" class="w-3.5 h-3.5 text-primary-blue"></i>
            寫作測驗級分 (0~6 級分)
          </span>
        </div>
        <div class="space-y-2">
          <input type="hidden" id="mini-writing-grade" value="${wGrade}" />
          <div class="writing-btn-group grid grid-cols-7 gap-1">
            ${[0, 1, 2, 3, 4, 5, 6].map(g => `
              <button type="button" class="btn-tier ${g === Number(wGrade) ? 'active' : ''}" data-grade="${g}" onclick="App.selectMiniWritingGrade(${g})">
                ${g}級分
              </button>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      // 國文、自然、社會或分科
      let defaultTotal = 50;
      if (subject === 'CHINESE') defaultTotal = 42;
      else if (subject === 'SOCIAL' || subject === 'HISTORY' || subject === 'GEOGRAPHY' || subject === 'CIVICS') defaultTotal = 54;
      else if (subject === 'SCIENCE' || subject === 'PHYSICS_CHEM' || subject === 'BIOLOGY' || subject === 'EARTH_SCI') defaultTotal = 50;

      const rawCor = existingItem ? (existingItem.rawCorrect ?? '') : '';
      const totQ = existingItem ? (existingItem.totalQuestions ?? defaultTotal) : defaultTotal;

      inputsHtml = `
        <div class="flex items-center justify-between pb-1.5 border-b border-border/50">
          <span class="text-xs font-bold text-primary flex items-center gap-1.5">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-primary-blue"></i>
            ${CONSTANTS.SUBJECTS.find(s => s.id === subject)?.name || '單科'} 答對題數輸入
          </span>
          <span class="text-3xs text-muted">標準會考常模約 ${defaultTotal} 題</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="form-label">答對題數 *</label>
            <input type="number" id="mini-raw-correct" min="0" max="${totQ}" class="form-input text-lg font-bold" value="${rawCor}" placeholder="如 40" oninput="App.onMiniMockRecalculate()" required />
          </div>
          <div>
            <label class="form-label">試卷總題數</label>
            <input type="number" id="mini-total-questions" min="1" class="form-input" value="${totQ}" oninput="App.onMiniMockRecalculate()" />
          </div>
        </div>
      `;
    }

    container.innerHTML = inputsHtml;
    lucide.createIcons();
    this.onMiniMockRecalculate();
  },

  selectMiniWritingGrade(grade) {
    const input = document.getElementById('mini-writing-grade');
    if (input) input.value = grade;
    document.querySelectorAll('.writing-btn-group .btn-tier').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.grade) === grade);
    });
    this.onMiniMockRecalculate();
  },

  onMiniMockRecalculate() {
    const subject = document.getElementById('mini-mock-subject')?.value || 'CHINESE';
    let params = {};

    if (subject === 'ENGLISH') {
      const rEl = document.getElementById('mini-en-reading-correct');
      const rtEl = document.getElementById('mini-en-reading-total');
      const lEl = document.getElementById('mini-en-listening-correct');
      const ltEl = document.getElementById('mini-en-listening-total');

      params = {
        readingCorrect: rEl && rEl.value !== '' ? Number(rEl.value) : 0,
        readingTotal: rtEl && rtEl.value !== '' ? Number(rtEl.value) : 43,
        listeningCorrect: lEl && lEl.value !== '' ? Number(lEl.value) : 0,
        listeningTotal: ltEl && ltEl.value !== '' ? Number(ltEl.value) : 21
      };
    } else if (subject === 'MATH') {
      const cEl = document.getElementById('mini-ma-choice-correct');
      const ctEl = document.getElementById('mini-ma-choice-total');
      const ncEl = document.getElementById('mini-ma-nonchoice-score');
      const nctEl = document.getElementById('mini-ma-nonchoice-total');

      params = {
        choiceCorrect: cEl && cEl.value !== '' ? Number(cEl.value) : 0,
        choiceTotal: ctEl && ctEl.value !== '' ? Number(ctEl.value) : 25,
        nonChoiceScore: ncEl && ncEl.value !== '' ? Number(ncEl.value) : 0,
        nonChoiceMaxScore: nctEl && nctEl.value !== '' ? Number(nctEl.value) : 6
      };
    } else if (subject === 'WRITING') {
      const wEl = document.getElementById('mini-writing-grade');
      params = {
        writingGrade: wEl ? Number(wEl.value || 5) : 5
      };
    } else {
      const rcEl = document.getElementById('mini-raw-correct');
      const tqEl = document.getElementById('mini-total-questions');
      params = {
        rawCorrect: rcEl && rcEl.value !== '' ? Number(rcEl.value) : 0,
        totalQuestions: tqEl && tqEl.value !== '' ? Number(tqEl.value) : 50
      };
    }

    const res = ScoringEngine.estimateSingleMockScore(subject, params);

    const notEl = document.getElementById('mini-mock-preview-notation');
    const wtEl = document.getElementById('mini-mock-preview-weighted');
    const ptEl = document.getElementById('mini-mock-preview-points');
    const crEl = document.getElementById('mini-mock-preview-credits');
    const hintEl = document.getElementById('mini-mock-upgrade-hint');

    if (notEl) {
      notEl.innerHTML = `<span class="badge ${res.notation.startsWith('A') ? 'badge-primary' : res.notation.startsWith('B') ? 'badge-success' : 'badge-danger'} text-base">${res.notation}</span>`;
    }
    if (wtEl) wtEl.textContent = res.weightedScore !== null ? `${res.weightedScore} 分` : '--';
    if (ptEl) ptEl.textContent = `${res.points} 點`;
    if (crEl) crEl.textContent = `${res.credits} 分`;
    if (hintEl) hintEl.textContent = res.upgradeHint || '';
  },

  async saveMiniMockExam(event, editId) {
    event.preventDefault();
    const subject = document.getElementById('mini-mock-subject').value;
    const title = document.getElementById('mini-mock-title').value;
    const date = document.getElementById('mini-mock-date').value;
    const blindspot = document.getElementById('mini-mock-blindspot')?.value || '';
    const notes = document.getElementById('mini-mock-notes')?.value || '';

    let params = {};
    let itemExtra = {};

    if (subject === 'ENGLISH') {
      const rCor = Number(document.getElementById('mini-en-reading-correct').value || 0);
      const rTot = Number(document.getElementById('mini-en-reading-total').value || 43);
      const lCor = Number(document.getElementById('mini-en-listening-correct').value || 0);
      const lTot = Number(document.getElementById('mini-en-listening-total').value || 21);

      params = { readingCorrect: rCor, readingTotal: rTot, listeningCorrect: lCor, listeningTotal: lTot };
      itemExtra = { readingCorrect: rCor, readingTotal: rTot, listeningCorrect: lCor, listeningTotal: lTot };
    } else if (subject === 'MATH') {
      const cCor = Number(document.getElementById('mini-ma-choice-correct').value || 0);
      const cTot = Number(document.getElementById('mini-ma-choice-total').value || 25);
      const ncSc = Number(document.getElementById('mini-ma-nonchoice-score').value || 0);
      const ncTot = Number(document.getElementById('mini-ma-nonchoice-total').value || 6);

      params = { choiceCorrect: cCor, choiceTotal: cTot, nonChoiceScore: ncSc, nonChoiceMaxScore: ncTot };
      itemExtra = { choiceCorrect: cCor, choiceTotal: cTot, nonChoiceScore: ncSc, nonChoiceMaxScore: ncTot };
    } else if (subject === 'WRITING') {
      const wGrade = Number(document.getElementById('mini-writing-grade')?.value || 5);
      params = { writingGrade: wGrade };
      itemExtra = { writingGrade: wGrade };
    } else {
      const rc = Number(document.getElementById('mini-raw-correct').value || 0);
      const tq = Number(document.getElementById('mini-total-questions').value || 50);

      params = { rawCorrect: rc, totalQuestions: tq };
      itemExtra = { rawCorrect: rc, totalQuestions: tq };
    }

    const calcRes = ScoringEngine.estimateSingleMockScore(subject, params);

    const miniMockItem = {
      id: editId || `mm_${Date.now()}`,
      title,
      unitName: title,
      date,
      subject,
      notation: calcRes.notation,
      weightedScore: calcRes.weightedScore,
      points: calcRes.points,
      credits: calcRes.credits,
      upgradeHint: calcRes.upgradeHint,
      blindspot,
      notes,
      ...itemExtra
    };

    await DB.put('miniMocks', miniMockItem);
    await this.loadAllData();
    this.refreshCurrentView();
    BitableGrid.selectedSubject = 'ALL';
    BitableGrid.selectedFilter = 'ALL';
    BitableGrid.searchQuery = '';
    this.closeModal();
    this.showToast('單科模模考紀錄儲存成功！', 'success');
    this.triggerBackgroundSyncPush();
  },

  // ==========================================
  // 2. 小考評量錄入彈窗
  // ==========================================
  openQuizModal(editId = null) {
    const isEdit = Boolean(editId);
    const item = isEdit ? this.cachedData.quizzes.find(q => q.id === editId) : null;
    const selectedTags = (item && item.errorTags) || [];

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-md" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="file-check" class="w-5 h-5 text-primary-purple"></i>
              <h3 class="font-bold text-base text-primary">${isEdit ? '編輯小考評量' : '新增小考評量紀錄'}</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <form id="form-quiz" onsubmit="App.saveQuiz(event, '${editId || ''}')" class="modal-body py-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="form-label">測驗日期 *</label>
                <input type="date" id="quiz-date" required class="form-input" value="${item ? item.date : new Date().toISOString().slice(0, 10)}" />
              </div>
              <div>
                <label class="form-label">學科領域 (9大考科) *</label>
                <select id="quiz-subject" class="form-input" required>
                  ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${item && item.subject === s.id ? 'selected' : ''}>${s.name} (${s.group})</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label class="form-label">單元 / 章節名稱 *</label>
                <input type="text" id="quiz-unit" required class="form-input" value="${item ? item.unitName : ''}" placeholder="如：第 2 章 直角坐標與二元一次方程式" />
              </div>
              <div>
                <label class="form-label">測驗類型</label>
                <select id="quiz-type" class="form-input">
                  ${CONSTANTS.QUIZ_TYPES.map(t => `<option value="${t}" ${item && item.quizType === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="form-label">個人得分 *</label>
                <input type="number" id="quiz-score" required class="form-input" min="0" step="0.5" value="${item ? item.score : ''}" placeholder="如: 85" />
              </div>
              <div>
                <label class="form-label">滿分標準</label>
                <input type="number" id="quiz-max-score" class="form-input" min="1" value="${item ? item.maxScore : 100}" />
              </div>
            </div>

            <!-- 錯題歸因標籤 (Multi-Select) -->
            <div>
              <label class="form-label">錯題歸因標籤 (可複選)</label>
              <div class="flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface/50 border border-border">
                ${CONSTANTS.ERROR_TAGS.map(t => {
                  const isChecked = selectedTags.includes(t.id);
                  return `
                    <label class="tag-checkbox-label">
                      <input type="checkbox" name="quiz-error-tags" value="${t.id}" ${isChecked ? 'checked' : ''} class="hidden tag-checkbox-input" />
                      <span class="tag-checkbox-pill" style="border-color: ${t.color}40; color: ${t.color};">${t.name}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- 訂正狀態 -->
            <div>
              <label class="form-label">訂正狀態</label>
              <select id="quiz-correction-status" class="form-input">
                <option value="corrected" ${item && item.correctionStatus === 'corrected' ? 'selected' : ''}>✅ 已訂正完成</option>
                <option value="need_help" ${item && item.correctionStatus === 'need_help' ? 'selected' : ''}>❓ 需向老師請教</option>
                <option value="uncorrected" ${item && item.correctionStatus === 'uncorrected' ? 'selected' : ''}>❌ 尚未訂正</option>
              </select>
            </div>

            <!-- 核心觀念盲點與複習重點 -->
            <div>
              <label class="form-label text-warning flex items-center gap-1.5">
                <i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>
                <span>核心觀念盲點與複習破口 (考前必看)</span>
              </label>
              <input type="text" id="quiz-blindspot" class="form-input border-warning/40 focus:border-warning font-medium" value="${item ? (item.blindspot || '') : ''}" placeholder="例如：動詞三態不規則變化、浮力沉底時支撐力不可忽略、移項變號漏負號..." />
            </div>

            <div>
              <label class="form-label">備註與觀念筆記</label>
              <textarea id="quiz-notes" class="form-input" rows="2" placeholder="記錄重要公式推導、容易混淆的關鍵字...">${item ? (item.notes || '') : ''}</textarea>
            </div>

            <!-- 本小考錯題收錄與 AI 深度診斷快捷入口 -->
            ${isEdit ? `
              <div class="p-3 rounded-lg bg-surface/70 border border-border flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <i data-lucide="book-open" class="w-4 h-4 text-rose-400"></i>
                  <span class="text-xs font-bold text-primary">本次小考收錄錯題：</span>
                  <span class="badge badge-primary text-3xs font-mono">${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length} 題</span>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-primary-blue border-primary-blue/40" onclick="App.openAddMistakeModal(null, { examId: '${editId}', examType: 'quiz', date: '${item.date}', subject: '${item.subject}', unitName: '${item.unitName}' })">
                    <i data-lucide="plus" class="w-3 h-3 inline mr-0.5"></i>收錄本卷錯題
                  </button>
                  ${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length > 0 ? `
                    <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-warning border-warning/40" onclick="App.openAIExportModal('${editId}', 'quiz')">
                      <i data-lucide="sparkles" class="w-3 h-3 inline mr-0.5"></i>AI 診斷本卷
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button type="button" class="btn-secondary" onclick="App.closeModal()">取消</button>
              <button type="submit" class="btn-primary">儲存小考紀錄</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  async saveQuiz(event, editId) {
    event.preventDefault();
    const tagInputs = document.querySelectorAll('input[name="quiz-error-tags"]:checked');
    const tags = Array.from(tagInputs).map(i => i.value);

    const item = {
      id: editId || `qz_${Date.now()}`,
      date: document.getElementById('quiz-date').value,
      subject: document.getElementById('quiz-subject').value,
      unitName: document.getElementById('quiz-unit').value,
      quizType: document.getElementById('quiz-type').value,
      score: Number(document.getElementById('quiz-score').value),
      maxScore: Number(document.getElementById('quiz-max-score').value || 100),
      errorTags: tags,
      blindspot: document.getElementById('quiz-blindspot')?.value || '',
      correctionStatus: document.getElementById('quiz-correction-status').value,
      notes: document.getElementById('quiz-notes').value
    };

    await DB.put('quizzes', item);
    await this.loadAllData();
    this.refreshCurrentView();
    BitableGrid.selectedSubject = 'ALL';
    BitableGrid.selectedFilter = 'ALL';
    BitableGrid.searchQuery = '';
    this.closeModal();
    this.showToast('小考評量紀錄儲存成功！', 'success');
    this.triggerBackgroundSyncPush();
  },

  async updateQuizStatus(quizId, status) {
    const item = await DB.get('quizzes', quizId);
    if (item) {
      item.correctionStatus = status;
      await DB.put('quizzes', item);
      this.showToast('訂正狀態已更新', 'success');
      this.triggerBackgroundSyncPush();
    }
  },

  // ==========================================
  // 3. 定期段考錄入彈窗 (含分科高低標)
  // ==========================================
  openTermModal(editId = null) {
    const isEdit = Boolean(editId);
    const item = isEdit ? this.cachedData.termExams.find(t => t.id === editId) : null;
    const subjects = (item && item.subjects) || {};

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="award" class="w-5 h-5 text-success"></i>
              <h3 class="font-bold text-base text-primary">${isEdit ? '編輯定期段考評量' : '新增定期段考評量'}</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <form id="form-term" onsubmit="App.saveTermExam(event, '${editId || ''}')" class="modal-body py-4 space-y-4 max-h-[75vh] overflow-y-auto">
            
            <!-- 考次與排名概況 -->
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div class="sm:col-span-2">
                <label class="form-label">學期與考次 *</label>
                <input type="text" id="term-name" required class="form-input" value="${item ? item.termName : '114學年度 上學期 第一次段考'}" />
              </div>
              <div>
                <label class="form-label">考試日期 *</label>
                <input type="date" id="term-date" required class="form-input" value="${item ? item.date : new Date().toISOString().slice(0, 10)}" />
              </div>
              <div>
                <label class="form-label">班級排名</label>
                <input type="number" id="term-class-rank" class="form-input" min="1" value="${item ? (item.classRank || '') : ''}" placeholder="第幾名" />
              </div>
            </div>

            <!-- 9 大學科分科成績 (實得 / 班均 / 高標 / 低標 - 留空自動自適應折疊) -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-secondary">
                <span>📊 各科實得分數與常模指標 (未填寫之指標或未考科目系統將自動乾淨隱藏)</span>
              </div>

              <div class="border border-border/80 rounded-lg overflow-hidden">
                <table class="w-full text-xs">
                  <thead class="bg-surface/80 text-muted">
                    <tr>
                      <th class="p-2 text-left">科目</th>
                      <th class="p-2">個人得分</th>
                      <th class="p-2">班級平均</th>
                      <th class="p-2">班級高標</th>
                      <th class="p-2">班級低標</th>
                      <th class="p-2">PR 估算</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border/40">
                    ${CONSTANTS.SUBJECTS.map(s => {
                      const subData = subjects[s.id] || {};
                      return `
                        <tr class="hover:bg-card/40">
                          <td class="p-2 font-bold" style="color: ${s.color};">${s.name}</td>
                          <td class="p-1"><input type="number" step="0.5" class="form-input-table" id="term-sub-${s.id}-score" value="${subData.score !== undefined ? subData.score : ''}" placeholder="得分" /></td>
                          <td class="p-1"><input type="number" step="0.1" class="form-input-table" id="term-sub-${s.id}-avg" value="${subData.classAvg !== undefined ? subData.classAvg : ''}" placeholder="選填" /></td>
                          <td class="p-1"><input type="number" step="0.1" class="form-input-table" id="term-sub-${s.id}-high" value="${subData.highBenchmark !== undefined ? subData.highBenchmark : ''}" placeholder="選填" /></td>
                          <td class="p-1"><input type="number" step="0.1" class="form-input-table" id="term-sub-${s.id}-low" value="${subData.lowBenchmark !== undefined ? subData.lowBenchmark : ''}" placeholder="選填" /></td>
                          <td class="p-1"><input type="number" class="form-input-table" id="term-sub-${s.id}-pr" value="${subData.prEstimate !== undefined ? subData.prEstimate : ''}" placeholder="PR" /></td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 核心盲點與失分漏洞檢討 -->
            <div>
              <label class="form-label text-warning flex items-center gap-1.5">
                <i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>
                <span>段考關鍵盲點與考前漏洞檢討 (複習必背)</span>
              </label>
              <input type="text" id="term-blindspot" class="form-input border-warning/40 focus:border-warning font-medium" value="${item ? (item.blindspot || '') : ''}" placeholder="例如：理化電路串並聯總電阻混淆、歷史年代順序易錯、幾何證明未寫理由..." />
            </div>

            <div>
              <label class="form-label">備註與檢討</label>
              <textarea id="term-notes" class="form-input" rows="2" placeholder="記錄段考整體表現、時間分配...">${item ? (item.notes || '') : ''}</textarea>
            </div>

            <!-- 本段考錯題收錄與 AI 深度診斷快捷入口 -->
            ${isEdit ? `
              <div class="p-3 rounded-lg bg-surface/70 border border-border flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <i data-lucide="book-open" class="w-4 h-4 text-rose-400"></i>
                  <span class="text-xs font-bold text-primary">本次段考收錄錯題：</span>
                  <span class="badge badge-primary text-3xs font-mono">${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length} 題</span>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-primary-blue border-primary-blue/40" onclick="App.openAddMistakeModal(null, { examId: '${editId}', examType: 'term', date: '${item.date}', title: '${item.termName}' })">
                    <i data-lucide="plus" class="w-3.5 h-3.5 inline mr-0.5"></i>收錄本卷錯題
                  </button>
                  ${(this.cachedData.mistakes || []).filter(m => m.examId === editId).length > 0 ? `
                    <button type="button" class="btn-secondary text-2xs py-1 px-2.5 text-warning border-warning/40" onclick="App.openAIExportModal('${editId}', 'term')">
                      <i data-lucide="sparkles" class="w-3.5 h-3.5 inline mr-0.5"></i>AI 診斷本卷
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button type="button" class="btn-secondary" onclick="App.closeModal()">取消</button>
              <button type="submit" class="btn-primary">儲存段考紀錄</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  async saveTermExam(event, editId) {
    event.preventDefault();
    const subjects = {};
    let totalScore = 0;
    let validCount = 0;

    CONSTANTS.SUBJECTS.forEach(s => {
      const scoreVal = document.getElementById(`term-sub-${s.id}-score`)?.value;
      if (scoreVal !== '' && scoreVal !== undefined) {
        const score = Number(scoreVal);
        const avgVal = document.getElementById(`term-sub-${s.id}-avg`)?.value;
        const highVal = document.getElementById(`term-sub-${s.id}-high`)?.value;
        const lowVal = document.getElementById(`term-sub-${s.id}-low`)?.value;
        const prVal = document.getElementById(`term-sub-${s.id}-pr`)?.value;

        subjects[s.id] = {
          score,
          classAvg: avgVal !== '' ? Number(avgVal) : null,
          highBenchmark: highVal !== '' ? Number(highVal) : null,
          lowBenchmark: lowVal !== '' ? Number(lowVal) : null,
          prEstimate: prVal !== '' ? Number(prVal) : null
        };
        totalScore += score;
        validCount++;
      }
    });

    const averageScore = validCount > 0 ? Math.round((totalScore / validCount) * 100) / 100 : 0;
    const rankVal = document.getElementById('term-class-rank').value;

    const item = {
      id: editId || `te_${Date.now()}`,
      termName: document.getElementById('term-name').value,
      date: document.getElementById('term-date').value,
      classRank: rankVal ? Number(rankVal) : null,
      totalScore,
      averageScore,
      subjects,
      blindspot: document.getElementById('term-blindspot')?.value || '',
      notes: document.getElementById('term-notes').value
    };

    await DB.put('termExams', item);
    await this.loadAllData();
    this.refreshCurrentView();
    BitableGrid.selectedSubject = 'ALL';
    BitableGrid.selectedFilter = 'ALL';
    BitableGrid.searchQuery = '';
    this.closeModal();
    this.showToast('定期段考紀錄儲存成功！', 'success');
    this.triggerBackgroundSyncPush();
  },

  // ==========================================
  // 4. 目標高中志願設定彈窗
  // ==========================================
  openTargetSchoolsModal() {
    const settings = this.cachedData.settings;
    const targets = this.cachedData.targetSchools;
    const currentSelected = settings.targetSchools || ['sch_1', 'sch_3', 'sch_6'];

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-md" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="school" class="w-5 h-5 text-primary-blue"></i>
              <h3 class="font-bold text-base text-primary">設定目標高中志願 (1~3 所)</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <form id="form-targets" onsubmit="App.saveTargetSchools(event)" class="modal-body py-4 space-y-4">
            <p class="text-xs text-secondary">
              選定目標學校後，系統將自動比對歷次模擬考成績，計算錄取門檻差距 $\\Delta$ 並繪製達標差距雷達圖。
            </p>

            ${[0, 1, 2].map(idx => `
              <div>
                <label class="form-label">第 ${idx + 1} 志願目標學校</label>
                <select id="target-school-select-${idx}" class="form-input">
                  <option value="">-- 未設定 --</option>
                  ${targets.map(sch => `
                    <option value="${sch.id}" ${currentSelected[idx] === sch.id ? 'selected' : ''}>
                      ${sch.shortName || sch.name} (門檻 ${sch.cutoffPoints} 點 / ${sch.targetTierSummary || '5A'})
                    </option>
                  `).join('')}
                </select>
              </div>
            `).join('')}

            <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button type="button" class="btn-secondary" onclick="App.closeModal()">取消</button>
              <button type="submit" class="btn-primary">儲存志願設定</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  async saveTargetSchools(event) {
    event.preventDefault();
    const sel0 = document.getElementById('target-school-select-0').value;
    const sel1 = document.getElementById('target-school-select-1').value;
    const sel2 = document.getElementById('target-school-select-2').value;

    const chosen = [sel0, sel1, sel2].filter(Boolean);
    const settings = this.cachedData.settings;
    settings.targetSchools = chosen;

    await DB.put('settings', { id: 'main', ...settings });
    await this.loadAllData();
    this.refreshCurrentView();
    this.closeModal();
    this.showToast('目標志願設定儲存成功！', 'success');
    this.triggerBackgroundSyncPush();
  },

  // ==========================================
  // 5. 雲端同步與系統設定彈窗 (GAS Cloud Settings)
  // ==========================================
  openSettingsModal() {
    const settings = this.cachedData.settings || {};

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="settings" class="w-5 h-5 text-primary-blue"></i>
              <h3 class="font-bold text-base text-primary">系統設定與 Google Apps Script 雲端同步</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <div class="modal-body py-4 space-y-5 max-h-[75vh] overflow-y-auto">
            
            <!-- 當前登入帳號狀態與切換 (多租戶隔離保護) -->
            <div class="p-3 rounded-lg bg-primary-blue/10 border border-primary-blue/30 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-full bg-primary-blue/20 text-primary-blue flex items-center justify-center font-bold text-base shadow-sm">
                  <i data-lucide="user-check" class="w-5 h-5"></i>
                </div>
                <div>
                  <div class="text-xs font-bold text-primary flex items-center gap-1.5">
                    <span>${(window.Auth && Auth.getCurrentUser()?.studentName) || settings.studentName || '小虎'}</span>
                    <span class="badge-success text-3xs">已登入專屬資料庫</span>
                  </div>
                  <div class="text-3xs font-mono text-muted">${(window.Auth && Auth.getCurrentUser()?.email) || 'littletiger0815@gmail.com'}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-secondary text-2xs py-1.5 px-2.5" onclick="App.openAuthModal('login')">
                  <i data-lucide="refresh-cw" class="w-3 h-3 inline mr-1 text-primary-blue"></i>切換帳號
                </button>
                <button type="button" class="btn-secondary text-2xs py-1.5 px-2.5 text-rose-400 hover:text-rose-300" onclick="Auth.logout()">
                  <i data-lucide="log-out" class="w-3 h-3 inline mr-1"></i>登出
                </button>
              </div>
            </div>

            <!-- 學生基本檔案 -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-secondary uppercase tracking-wider">個人檔案設定</h4>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="form-label">學生姓名</label>
                  <input type="text" id="setting-student-name" class="form-input" value="${settings.studentName || ''}" placeholder="學生姓名" />
                </div>
                <div>
                  <label class="form-label">就讀國中</label>
                  <input type="text" id="setting-school-name" class="form-input" value="${settings.schoolName || ''}" placeholder="學校名稱" />
                </div>
                <div>
                  <label class="form-label">年級與班級</label>
                  <input type="text" id="setting-grade-class" class="form-input" value="${settings.gradeClass || ''}" placeholder="如：九年三班" />
                </div>
              </div>
              <div>
                <label class="form-label">主要採計就學考區</label>
                <select id="setting-district" class="form-input">
                  ${CONSTANTS.DISTRICT_MODELS.map(d => `<option value="${d.id}" ${settings.district === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Google Apps Script 雲端試算表串接 (CORS-Safe) -->
            <div class="p-4 rounded-lg bg-surface/70 border border-border space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <i data-lucide="cloud" class="w-4 h-4 text-primary-blue"></i>
                  <h4 class="text-xs font-bold text-primary">Google Apps Script (GAS) 雲端試算表同步</h4>
                </div>
                <span class="badge-success text-2xs">已支援 CORS 規避</span>
              </div>
              
              <p class="text-2xs text-muted">
                請輸入已部署為 Web 應用程式的 Apps Script 網址（部署權限請設為「任何人 (Anyone)」）。
              </p>

              <div>
                <label class="form-label">GAS Web App 網址 (URL)</label>
                <input type="url" id="setting-gas-url" class="form-input font-mono text-xs" value="${settings.gasUrl || ''}" placeholder="https://script.google.com/macros/s/AKfycb.../exec" />
              </div>

              <!-- GAS 操作按鈕列 -->
              <div class="flex flex-wrap items-center gap-2 pt-2">
                <button type="button" class="btn-secondary text-xs" onclick="App.testGasConnection()">
                  <i data-lucide="activity" class="w-3.5 h-3.5 inline mr-1"></i>測試連線 (Ping)
                </button>
                <button type="button" class="btn-secondary text-xs text-primary-blue" onclick="App.triggerGasAutoFormat()">
                  <i data-lucide="sparkles" class="w-3.5 h-3.5 inline mr-1"></i>一鍵格式化雲端試算表
                </button>
                <button type="button" class="btn-primary text-xs" onclick="App.syncToCloud()">
                  <i data-lucide="upload-cloud" class="w-3.5 h-3.5 inline mr-1"></i>同步至雲端 (Push)
                </button>
                <button type="button" class="btn-secondary text-xs" onclick="App.pullFromCloud()">
                  <i data-lucide="download-cloud" class="w-3.5 h-3.5 inline mr-1"></i>從雲端拉取 (Pull)
                </button>
              </div>

              <div id="gas-status-msg" class="text-xs font-mono hidden pt-1"></div>
            </div>

            <!-- 本地資料備份、還原與重置 -->
            <div class="p-4 rounded-lg bg-surface/50 border border-border space-y-3">
              <h4 class="text-xs font-bold text-secondary uppercase tracking-wider">本機資料管理與匯出入</h4>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-secondary text-xs" onclick="ExportImport.exportJSON()">
                  <i data-lucide="download" class="w-3.5 h-3.5 inline mr-1"></i>匯出 JSON 全量備份
                </button>
                <label class="btn-secondary text-xs cursor-pointer">
                  <i data-lucide="upload" class="w-3.5 h-3.5 inline mr-1"></i>匯入 JSON 備份
                  <input type="file" accept=".json" class="hidden" onchange="ExportImport.importJSON(this.files[0])" />
                </label>
                <button type="button" class="btn-secondary text-xs" onclick="ExportImport.exportCSV('quizzes')">
                  <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 inline mr-1"></i>匯出小考 CSV
                </button>
                <button type="button" class="btn-secondary text-xs" onclick="ExportImport.exportCSV('mockExams')">
                  <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5 inline mr-1"></i>匯出模考 CSV
                </button>
                <button type="button" class="btn-danger-outline text-xs" onclick="App.resetDefaultData()">
                  <i data-lucide="refresh-cw" class="w-3.5 h-3.5 inline mr-1"></i>重設為示範資料
                </button>
              </div>
            </div>

          </div>

          <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button type="button" class="btn-secondary" onclick="App.closeModal()">取消</button>
            <button type="button" class="btn-primary" onclick="App.saveGeneralSettings()">儲存系統設定</button>
          </div>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  async saveGeneralSettings() {
    const sName = document.getElementById('setting-student-name').value;
    const schName = document.getElementById('setting-school-name').value;
    const gClass = document.getElementById('setting-grade-class').value;
    const dist = document.getElementById('setting-district').value;
    const gasUrl = document.getElementById('setting-gas-url').value;

    const settings = {
      ...this.cachedData.settings,
      studentName: sName,
      schoolName: schName,
      gradeClass: gClass,
      district: dist,
      gasUrl: gasUrl
    };

    await DB.put('settings', { id: 'main', ...settings });
    this.closeModal();
    this.showToast('系統設定已成功儲存！', 'success');
    this.triggerBackgroundSyncPush();
  },

  // GAS 互動方法
  async testGasConnection() {
    const url = document.getElementById('setting-gas-url')?.value;
    const statusEl = document.getElementById('gas-status-msg');
    if (!url) {
      this.showToast('請先填入 GAS Web App 網址', 'warning');
      return;
    }

    if (statusEl) {
      statusEl.className = 'text-xs font-mono text-warning';
      statusEl.textContent = '連線測試中...';
      statusEl.classList.remove('hidden');
    }

    try {
      const res = await GasSync.testConnection(url);
      if (statusEl) {
        statusEl.className = 'text-xs font-mono text-success';
        statusEl.textContent = `✅ 連線成功！試算表名稱：${res.spreadsheetName || '已連線'}`;
      }
      this.showToast('GAS 雲端服務連線成功！', 'success');
    } catch (err) {
      if (statusEl) {
        statusEl.className = 'text-xs font-mono text-danger';
        statusEl.textContent = `❌ ${err.message}`;
      }
      this.showToast(err.message, 'danger');
    }
  },

  async triggerGasAutoFormat() {
    const url = document.getElementById('setting-gas-url')?.value || this.cachedData.settings.gasUrl;
    if (!url) {
      this.showToast('請先設定 GAS Web App 網址', 'warning');
      return;
    }

    this.showToast('正在自動建立並套用試算表格式化...', 'info');
    try {
      const res = await GasSync.triggerAutoFormat(url);
      this.showToast(res.message || 'Google 試算表格式化完成！', 'success');
    } catch (err) {
      this.showToast(`格式化失敗: ${err.message}`, 'danger');
    }
  },

  async syncToCloud() {
    const url = document.getElementById('setting-gas-url')?.value || this.cachedData.settings.gasUrl;
    if (!url) {
      this.showToast('請先設定 GAS Web App 網址', 'warning');
      return;
    }

    this.showToast('正在推送數據至 Google 試算表...', 'info');
    try {
      const res = await GasSync.syncToCloud(url);
      this.showToast(res ? (res.message || '同步完成！') : '已同步至 Google 試算表', 'success');
    } catch (err) {
      this.showToast(`同步失敗: ${err.message}`, 'danger');
    }
  },

  async pullFromCloud() {
    const url = document.getElementById('setting-gas-url')?.value || this.cachedData.settings.gasUrl;
    if (!url) {
      this.showToast('請先設定 GAS Web App 網址', 'warning');
      return;
    }

    this.showToast('正在從 Google 試算表拉取最新數據...', 'info');
    try {
      const res = await GasSync.pullFromCloud(url);
      await this.loadAllData();
      this.refreshCurrentView();

      const totalCount = (this.cachedData.mockExams?.length || 0) + (this.cachedData.quizzes?.length || 0) + (this.cachedData.termExams?.length || 0);

      if (res && res.importResult && res.importResult.status === 'cloud_empty') {
        this.showToast('⚠️ 雲端目前為 0 筆資料。已保留本機現有紀錄，若電腦端有資料請在電腦端先按【同步至雲端】！', 'warning', 8000);
      } else if (totalCount === 0) {
        this.showToast('雲端目前尚無成績紀錄（0 筆）。請先在有成績的裝置上點擊【同步至雲端 (Push)】！', 'warning', 7000);
      } else {
        this.showToast(`拉取完成！已成功同步載入 ${totalCount} 筆最新成績`, 'success');
      }
    } catch (err) {
      this.showToast(`拉取失敗: ${err.message}`, 'danger');
    }
  },

  // ==========================================
  // 高頻背景自動同步引擎 (Background Auto-Sync)
  // ==========================================
  bgPushTimer: null,

  initBackgroundSync() {
    // 監聽 GAS 狀態變更更新導覽列小指示燈
    GasSync.subscribeStatus((status, detail) => {
      const badge = document.getElementById('cloud-sync-badge');
      const textEl = document.getElementById('cloud-sync-text');
      if (!badge) return;
      
      const dot = badge.querySelector('.sync-dot');
      if (status === 'syncing') {
        if (dot) dot.className = 'sync-dot sync-dot-blue';
        if (textEl) textEl.textContent = '同步中...';
      } else if (status === 'synced') {
        if (dot) dot.className = 'sync-dot sync-dot-green';
        if (textEl) textEl.textContent = '已連線';
      } else if (status === 'error') {
        if (dot) dot.className = 'sync-dot sync-dot-red';
        if (textEl) textEl.textContent = '同步異常';
      } else if (status === 'offline') {
        if (dot) dot.className = 'sync-dot sync-dot-yellow';
        if (textEl) textEl.textContent = '離線中';
      }
    });

    // 1. 初次啟動時，若有 GAS 網址，立即靜默在背景從雲端拉取最新資料
    const gasUrl = this.cachedData.settings.gasUrl;
    if (gasUrl && navigator.onLine) {
      GasSync.pullFromCloud(gasUrl, { silent: true }).then(async (res) => {
        if (res && res.data) {
          await this.loadAllData();
          this.refreshCurrentView();
        }
      }).catch(() => {});
    }

    // 2. 每 25 秒進行高頻背景自動檢查與拉取 (輪詢)
    setInterval(() => {
      const currentUrl = this.cachedData.settings.gasUrl;
      if (currentUrl && navigator.onLine && !GasSync.isSyncing) {
        GasSync.pullFromCloud(currentUrl, { silent: true }).then(async (res) => {
          if (res && res.data) {
            await this.loadAllData();
            this.refreshCurrentView();
          }
        }).catch(() => {});
      }
    }, 25000);

    // 3. 當使用者切換分頁回到 App 時，立即觸發背景同步
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const currentUrl = this.cachedData.settings.gasUrl;
        if (currentUrl && navigator.onLine && !GasSync.isSyncing) {
          GasSync.pullFromCloud(currentUrl, { silent: true }).then(async (res) => {
            if (res && res.data) {
              await this.loadAllData();
              this.refreshCurrentView();
            }
          }).catch(() => {});
        }
      }
    });

    // 4. 當網路重新連線時立即背景同步
    window.addEventListener('online', () => {
      const currentUrl = this.cachedData.settings.gasUrl;
      if (currentUrl) {
        GasSync.syncToCloud(currentUrl, { silent: true }).catch(() => {});
      }
    });

    // 5. 當頁面隱藏或關閉時，立即刷出尚未推播的更新，避免因防抖未觸發而漏存
    window.addEventListener('pagehide', () => this.flushPendingSyncPush());
    window.addEventListener('beforeunload', () => this.flushPendingSyncPush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushPendingSyncPush();
      }
    });
  },

  // 本地資料異動時觸發防抖背景推播至雲端 (Auto Push on Save)
  triggerBackgroundSyncPush() {
    const gasUrl = this.cachedData.settings.gasUrl;
    if (!gasUrl || !navigator.onLine) return;

    clearTimeout(this.bgPushTimer);
    this.bgPushTimer = setTimeout(() => {
      this.bgPushTimer = null;
      GasSync.syncToCloud(gasUrl, { silent: true }).catch(err => {
        console.warn('Background auto push error:', err);
      });
    }, 1500); // 1.5 秒防抖
  },

  // 立即刷出並送出推播 (防止手機切換 App 時被系統凍結計時器)
  flushPendingSyncPush() {
    if (this.bgPushTimer) {
      clearTimeout(this.bgPushTimer);
      this.bgPushTimer = null;
      const gasUrl = this.cachedData.settings.gasUrl;
      if (gasUrl && navigator.onLine) {
        GasSync.syncToCloud(gasUrl, { silent: true }).catch(() => {});
      }
    }
  },

  async resetDefaultData() {
    if (confirm('確定要將系統資料重置為預設示範資料嗎？現有自訂內容將會被替換。')) {
      await DB.resetToDefault();
      this.closeModal();
      this.showToast('已重設為預設展示資料', 'success');
      this.triggerBackgroundSyncPush();
    }
  },

  async deleteItem(collection, id) {
    if (confirm('確定要刪除這筆紀錄嗎？')) {
      await DB.delete(collection, id);
      this.showToast('已成功刪除', 'success');
      this.triggerBackgroundSyncPush();
    }
  },

  // ==========================================
  // Modal 與 Toast 輔助工具
  // ==========================================
  renderModal(html) {
    this.closeModal();
    const modalHost = document.getElementById('modal-host');
    if (modalHost) {
      modalHost.innerHTML = html;
      this.activeModal = true;
      if (window.lucide) lucide.createIcons();
    }
  },

  closeModal(event) {
    if (event && event.target && !event.target.classList.contains('modal-backdrop')) {
      return;
    }
    const modalHost = document.getElementById('modal-host');
    if (modalHost) {
      modalHost.innerHTML = '';
      this.activeModal = false;
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide-in`;
    
    const iconMap = {
      success: 'check-circle',
      warning: 'alert-triangle',
      danger: 'alert-octagon',
      info: 'info'
    };

    toast.innerHTML = `
      <i data-lucide="${iconMap[type] || 'info'}" class="w-4 h-4 inline mr-2"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  /**
   * 8. 會考容錯題數與量尺升級模擬器 (What-if Simulator Modal)
   * 低干涉、按需取用：讓考生自由拖曳滑桿模擬「差幾題上第一志願」
   */
  openSimulatorModal() {
    const mocks = this.cachedData.mockExams || [];
    const latestMock = mocks.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const sub = latestMock ? latestMock.subjects || {} : {};
    const district = this.cachedData.settings.district || 'KEELUNG_TAIPEI';

    const defCh = (sub.CHINESE && sub.CHINESE.rawCorrect !== undefined) ? sub.CHINESE.rawCorrect : 38;
    const defEnR = (sub.ENGLISH && sub.ENGLISH.readingCorrect !== undefined) ? sub.ENGLISH.readingCorrect : 40;
    const defEnL = (sub.ENGLISH && sub.ENGLISH.listeningCorrect !== undefined) ? sub.ENGLISH.listeningCorrect : 21;
    const defMaC = (sub.MATH && sub.MATH.choiceCorrect !== undefined) ? sub.MATH.choiceCorrect : 22;
    const defMaNC = (sub.MATH && sub.MATH.nonChoiceScore !== undefined) ? sub.MATH.nonChoiceScore : 4.5;
    const defSo = (sub.SOCIAL && sub.SOCIAL.rawCorrect !== undefined) ? sub.SOCIAL.rawCorrect : 48;
    const defSc = (sub.SCIENCE && sub.SCIENCE.rawCorrect !== undefined) ? sub.SCIENCE.rawCorrect : 45;
    const defWr = (sub.WRITING && sub.WRITING.grade !== undefined) ? sub.WRITING.grade : 5;

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="sliders" class="w-5 h-5 text-warning"></i>
              <h3 class="font-bold text-base text-primary">會考容錯題數與量尺升級模擬器</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <div class="modal-body py-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <p class="text-xs text-secondary">
              💡 <b>自由調整各科答對題數或非選得分</b>，即時試算會考等級躍升幅度與目標志願解鎖狀況（不影響現存紀錄）。
            </p>

            <!-- 即時試算戰情報告列 (Sticky KPI Header) -->
            <div class="p-3.5 rounded-lg bg-card border border-border flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 shadow-md">
              <div>
                <span class="text-3xs text-muted block">試算總標示</span>
                <span id="sim-tier-summary" class="text-xl font-black font-mono text-success">5A 6+</span>
              </div>
              <div>
                <span class="text-3xs text-muted block">試算總積點 (${district === 'CENTRAL_TAIWAN' ? '中投區' : '基北區'})</span>
                <div class="flex items-baseline gap-1">
                  <span id="sim-total-points" class="text-2xl font-black font-mono text-warning">32.8</span>
                  <span class="text-xs text-muted font-mono">點</span>
                </div>
              </div>
              <div>
                <span class="text-3xs text-muted block">試算總積分</span>
                <span id="sim-total-credits" class="text-lg font-bold font-mono text-primary-blue">32 分</span>
              </div>
              <div id="sim-top-target-status" class="px-2.5 py-1 rounded bg-surface border border-border text-xs">
                <!-- 動態注入目標高中解鎖狀態 -->
              </div>
            </div>

            <!-- 各科滑桿模擬器 -->
            <div class="space-y-3">
              
              <!-- 國文 -->
              <div class="p-3 rounded-lg bg-surface/60 border border-border/70">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-primary">國文科</span>
                    <span id="sim-ch-tier" class="cap-tier-badge text-3xs">A+</span>
                  </div>
                  <span class="text-xs font-mono text-secondary"><b id="sim-ch-val" class="text-primary font-bold">${defCh}</b> / 42 題</span>
                </div>
                <input type="range" id="sim-ch-range" min="0" max="42" value="${defCh}" class="w-full accent-primary-blue cursor-pointer" oninput="App.onSimulateRecalculate()" />
              </div>

              <!-- 英語 (閱讀 + 聽力) -->
              <div class="p-3 rounded-lg bg-surface/60 border border-border/70">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-primary">英語科 (閱讀+聽力)</span>
                    <span id="sim-en-tier" class="cap-tier-badge text-3xs">A++</span>
                    <span id="sim-en-weighted" class="text-2xs text-primary-blue font-mono font-bold">98.14分</span>
                  </div>
                  <span class="text-2xs font-mono text-muted">閱 <b id="sim-en-r-val" class="text-primary">${defEnR}</b>/43 • 聽 <b id="sim-en-l-val" class="text-primary">${defEnL}</b>/21</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="text-3xs text-muted block mb-1">閱讀答對題數</label>
                    <input type="range" id="sim-en-r-range" min="0" max="43" value="${defEnR}" class="w-full accent-primary-blue cursor-pointer" oninput="App.onSimulateRecalculate()" />
                  </div>
                  <div>
                    <label class="text-3xs text-muted block mb-1">聽力答對題數</label>
                    <input type="range" id="sim-en-l-range" min="0" max="21" value="${defEnL}" class="w-full accent-primary-blue cursor-pointer" oninput="App.onSimulateRecalculate()" />
                  </div>
                </div>
              </div>

              <!-- 數學 (選擇 + 非選) -->
              <div class="p-3 rounded-lg bg-surface/60 border border-border/70">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-primary">數學科 (選擇+非選)</span>
                    <span id="sim-ma-tier" class="cap-tier-badge text-3xs">A+</span>
                    <span id="sim-ma-weighted" class="text-2xs text-primary-purple font-mono font-bold">92.0分</span>
                  </div>
                  <span class="text-2xs font-mono text-muted">選 <b id="sim-ma-c-val" class="text-primary">${defMaC}</b>/25 • 非選 <b id="sim-ma-nc-val" class="text-primary">${defMaNC}</b>/6</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="text-3xs text-muted block mb-1">選擇答對題數 (佔85%)</label>
                    <input type="range" id="sim-ma-c-range" min="0" max="25" value="${defMaC}" class="w-full accent-primary-purple cursor-pointer" oninput="App.onSimulateRecalculate()" />
                  </div>
                  <div>
                    <label class="text-3xs text-muted block mb-1">非選實得分數 (佔15%)</label>
                    <input type="range" id="sim-ma-nc-range" min="0" max="6" step="0.5" value="${defMaNC}" class="w-full accent-primary-purple cursor-pointer" oninput="App.onSimulateRecalculate()" />
                  </div>
                </div>
              </div>

              <!-- 社會 -->
              <div class="p-3 rounded-lg bg-surface/60 border border-border/70">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-primary">社會科</span>
                    <span id="sim-so-tier" class="cap-tier-badge text-3xs">A</span>
                  </div>
                  <span class="text-xs font-mono text-secondary"><b id="sim-so-val" class="text-primary font-bold">${defSo}</b> / 54 題</span>
                </div>
                <input type="range" id="sim-so-range" min="0" max="54" value="${defSo}" class="w-full accent-primary-blue cursor-pointer" oninput="App.onSimulateRecalculate()" />
              </div>

              <!-- 自然 -->
              <div class="p-3 rounded-lg bg-surface/60 border border-border/70">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-primary">自然科</span>
                    <span id="sim-sc-tier" class="cap-tier-badge text-3xs">A</span>
                  </div>
                  <span class="text-xs font-mono text-secondary"><b id="sim-sc-val" class="text-primary font-bold">${defSc}</b> / 50 題</span>
                </div>
                <input type="range" id="sim-sc-range" min="0" max="50" value="${defSc}" class="w-full accent-primary-blue cursor-pointer" oninput="App.onSimulateRecalculate()" />
              </div>

              <!-- 寫作 -->
              <div class="p-3 rounded-lg bg-surface/60 border border-border/70">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-primary">寫作測驗</span>
                    <span id="sim-wr-tier" class="writing-badge text-3xs">${defWr} 級分</span>
                  </div>
                  <span class="text-xs font-mono text-secondary"><b id="sim-wr-val" class="text-primary font-bold">${defWr}</b> 級分</span>
                </div>
                <input type="range" id="sim-wr-range" min="0" max="6" value="${defWr}" class="w-full accent-warning cursor-pointer" oninput="App.onSimulateRecalculate()" />
              </div>

            </div>

            <!-- 目標志願解鎖比對矩陣 (Live Unlocked Target List) -->
            <div class="p-3 rounded-lg bg-card border border-border">
              <h4 class="font-bold text-xs text-primary mb-2 flex items-center gap-1.5">
                <i data-lucide="school" class="w-3.5 h-3.5 text-primary-blue"></i>
                目標高中解鎖狀態即時預覽
              </h4>
              <div id="sim-target-school-list" class="space-y-1.5 text-xs">
                <!-- 動態注入各校解鎖狀態 -->
              </div>
            </div>

            <div class="modal-footer flex items-center justify-end gap-3 pt-3 border-t border-border">
              <button type="button" class="btn-secondary" onclick="App.closeModal()">完成試算</button>
            </div>

          </div>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
    setTimeout(() => this.onSimulateRecalculate(), 50);
  },

  /**
   * 模擬器即時運算
   */
  onSimulateRecalculate() {
    const ch = parseInt(document.getElementById('sim-ch-range')?.value || 38);
    const enR = parseInt(document.getElementById('sim-en-r-range')?.value || 40);
    const enL = parseInt(document.getElementById('sim-en-l-range')?.value || 21);
    const maC = parseInt(document.getElementById('sim-ma-c-range')?.value || 22);
    const maNC = parseFloat(document.getElementById('sim-ma-nc-range')?.value || 4.5);
    const so = parseInt(document.getElementById('sim-so-range')?.value || 48);
    const sc = parseInt(document.getElementById('sim-sc-range')?.value || 45);
    const wr = parseInt(document.getElementById('sim-wr-range')?.value || 5);

    // 更新顯示數值
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('sim-ch-val', ch);
    setTxt('sim-en-r-val', enR);
    setTxt('sim-en-l-val', enL);
    setTxt('sim-ma-c-val', maC);
    setTxt('sim-ma-nc-val', maNC);
    setTxt('sim-so-val', so);
    setTxt('sim-sc-val', sc);
    setTxt('sim-wr-val', wr);

    // 換算各科標示
    const enWeighted = ScoringEngine.calcEnglishWeightedScore(enR, 43, enL, 21);
    const maWeighted = ScoringEngine.calcMathWeightedScore(maC, 25, maNC, 6);

    setTxt('sim-en-weighted', `${enWeighted}分`);
    setTxt('sim-ma-weighted', `${maWeighted}分`);

    const chNot = this.rawToNotation('CHINESE', ch);
    const enNot = this.rawToNotation('ENGLISH', enWeighted);
    const maNot = this.rawToNotation('MATH', maWeighted);
    const soNot = this.rawToNotation('SOCIAL', so);
    const scNot = this.rawToNotation('SCIENCE', sc);

    setTxt('sim-ch-tier', chNot);
    setTxt('sim-en-tier', enNot);
    setTxt('sim-ma-tier', maNot);
    setTxt('sim-so-tier', soNot);
    setTxt('sim-sc-tier', scNot);
    setTxt('sim-wr-tier', `${wr} 級分`);

    // 組裝 Mock 物件進行全考區指標計算
    const simMock = {
      title: '量尺模擬試算',
      date: new Date().toISOString().slice(0, 10),
      district: this.cachedData.settings.district || 'KEELUNG_TAIPEI',
      subjects: {
        CHINESE: { notation: chNot, rawCorrect: ch },
        ENGLISH: { notation: enNot, weightedScore: enWeighted, readingCorrect: enR, listeningCorrect: enL },
        MATH: { notation: maNot, weightedScore: maWeighted, choiceCorrect: maC, nonChoiceScore: maNC },
        SOCIAL: { notation: soNot, rawCorrect: so },
        SCIENCE: { notation: scNot, rawCorrect: sc },
        WRITING: { grade: wr, isExempt: false }
      }
    };

    const metrics = ScoringEngine.calculateMockMetrics(simMock, simMock.district);
    setTxt('sim-tier-summary', metrics.summaryTier);
    setTxt('sim-total-points', metrics.totalPoints);
    setTxt('sim-total-credits', `${metrics.totalCredits} 分`);

    // 比對目標高中
    const targetSchools = this.cachedData.targetSchools || [];
    const activeTargets = (this.cachedData.settings.targetSchools || ['sch_1', 'sch_3', 'sch_6']).map(id => targetSchools.find(s => s.id === id)).filter(Boolean);

    const listEl = document.getElementById('sim-target-school-list');
    const topStatusEl = document.getElementById('sim-top-target-status');

    if (activeTargets.length > 0 && topStatusEl) {
      const primary = activeTargets[0];
      const diag = ScoringEngine.diagnoseTargetSchool(metrics, primary);
      topStatusEl.innerHTML = `
        <span class="text-3xs text-muted block">第一志願：${primary.shortName} (${primary.cutoffPoints}點)</span>
        <span class="font-bold" style="color: ${diag.statusColor};">${diag.statusText} (${diag.delta >= 0 ? `+${diag.delta}` : diag.delta}點)</span>
      `;
    }

    if (listEl) {
      listEl.innerHTML = activeTargets.map(sch => {
        const diag = ScoringEngine.diagnoseTargetSchool(metrics, sch);
        return `
          <div class="flex items-center justify-between p-2 rounded bg-surface/70 border border-border/50">
            <div class="flex items-center gap-2">
              <span class="font-bold text-primary">${sch.shortName}</span>
              <span class="text-2xs text-muted font-mono">門檻 ${sch.cutoffPoints} 點</span>
            </div>
            <span class="font-bold text-2xs px-2 py-0.5 rounded" style="background: ${diag.statusColor}15; color: ${diag.statusColor};">
              ${diag.statusText} (${diag.delta >= 0 ? `+${diag.delta}` : diag.delta}點)
            </span>
          </div>
        `;
      }).join('');
    }
  },

  /**
   * 容錯題數轉換標準標示
   */
  rawToNotation(subCode, val) {
    if (subCode === 'CHINESE') {
      if (val >= 40) return 'A++';
      if (val >= 38) return 'A+';
      if (val >= 36) return 'A';
      if (val >= 32) return 'B++';
      if (val >= 28) return 'B+';
      if (val >= 19) return 'B';
      return 'C';
    }
    if (subCode === 'ENGLISH') {
      if (val >= 98.05) return 'A++';
      if (val >= 95.45) return 'A+';
      if (val >= 89.55) return 'A';
      if (val >= 79.5) return 'B++';
      if (val >= 68.0) return 'B+';
      if (val >= 38.5) return 'B';
      return 'C';
    }
    if (subCode === 'MATH') {
      if (val >= 96.5) return 'A++';
      if (val >= 91.5) return 'A+';
      if (val >= 80.5) return 'A';
      if (val >= 70.5) return 'B++';
      if (val >= 58.5) return 'B+';
      if (val >= 36.5) return 'B';
      return 'C';
    }
    if (subCode === 'SOCIAL') {
      if (val >= 52) return 'A++';
      if (val >= 50) return 'A+';
      if (val >= 48) return 'A';
      if (val >= 42) return 'B++';
      if (val >= 36) return 'B+';
      if (val >= 23) return 'B';
      return 'C';
    }
    if (subCode === 'SCIENCE') {
      if (val >= 48) return 'A++';
      if (val >= 46) return 'A+';
      if (val >= 43) return 'A';
      if (val >= 37) return 'B++';
      if (val >= 31) return 'B+';
      if (val >= 20) return 'B';
      return 'C';
    }
    return 'B';
  },

  // ==========================================
  // 6. 使用者帳號登入與註冊彈窗 (Multi-Tenant Auth Modal)
  // ==========================================
  openAuthModal(defaultTab = 'login') {
    const currentUser = (window.Auth && Auth.getCurrentUser()) || null;
    const offlineUsers = (window.Auth && Auth.getOfflineUsers()) || [];

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-md" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-primary-blue/20 text-primary-blue flex items-center justify-center font-bold">
                <i data-lucide="shield-check" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="font-bold text-sm text-primary">學業成績系統 • 帳號登入與註冊</h3>
                <p class="text-3xs text-muted">多使用者獨立資料庫 • 數據嚴格分區隔離</p>
              </div>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <div class="modal-body py-4 space-y-4">
            <!-- 登入/註冊分頁標籤 -->
            <div class="flex rounded-lg bg-surface border border-border p-1">
              <button type="button" id="tab-btn-login" class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${defaultTab === 'login' ? 'bg-primary-blue text-white shadow-sm' : 'text-muted hover:text-primary'}" onclick="App.switchAuthTab('login')">
                <i data-lucide="log-in" class="w-3.5 h-3.5 inline mr-1"></i>帳號登入
              </button>
              <button type="button" id="tab-btn-register" class="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${defaultTab === 'register' ? 'bg-primary-blue text-white shadow-sm' : 'text-muted hover:text-primary'}" onclick="App.switchAuthTab('register')">
                <i data-lucide="user-plus" class="w-3.5 h-3.5 inline mr-1"></i>註冊新帳號 (全新獨立空間)
              </button>
            </div>

            <!-- 當前登入狀態提示 -->
            ${currentUser ? `
              <div class="p-2.5 rounded-lg bg-primary-blue/10 border border-primary-blue/30 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <div class="text-xs">
                    <span class="text-muted">目前使用中：</span>
                    <span class="font-bold text-primary">${currentUser.studentName || '學生'}</span>
                    <span class="font-mono text-3xs text-muted block">${currentUser.email}</span>
                  </div>
                </div>
                <button type="button" class="btn-secondary text-3xs text-rose-400 hover:text-rose-300 py-1 px-2" onclick="Auth.logout()">
                  <i data-lucide="log-out" class="w-3 h-3 inline mr-0.5"></i>登出
                </button>
              </div>
            ` : ''}

            <!-- 登入/註冊表單 -->
            <form id="auth-form" onsubmit="App.handleAuthSubmit(event)" class="space-y-3">
              <div>
                <label class="form-label">帳號 Email <span class="text-rose-400">*</span></label>
                <input type="email" id="auth-email" class="form-input text-xs" required placeholder="例如: littletiger0815@gmail.com" value="${defaultTab === 'login' ? (currentUser?.email || 'littletiger0815@gmail.com') : ''}" />
              </div>

              <div>
                <label class="form-label">登入密碼 <span class="text-rose-400">*</span></label>
                <div class="relative">
                  <input type="password" id="auth-password" class="form-input text-xs pr-9" required placeholder="請輸入密碼" value="${defaultTab === 'login' && (!currentUser || currentUser.email === 'littletiger0815@gmail.com') ? 'little07928' : ''}" />
                  <button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary" onclick="App.togglePasswordVisibility('auth-password')">
                    <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <div id="auth-field-student-name" class="${defaultTab === 'register' ? 'block' : 'hidden'}">
                <label class="form-label">學生姓名 (選填)</label>
                <input type="text" id="auth-student-name" class="form-input text-xs" placeholder="例如: 小虎、陳小明" />
              </div>

              <div class="pt-2">
                <button type="submit" id="auth-submit-btn" class="btn-primary w-full py-2 text-xs font-bold justify-center shadow-lg">
                  <i data-lucide="${defaultTab === 'login' ? 'log-in' : 'user-plus'}" class="w-4 h-4 mr-1"></i>
                  <span id="auth-submit-text">${defaultTab === 'login' ? '立即登入專屬成績庫' : '立即註冊並啟用獨立空間'}</span>
                </button>
              </div>
            </form>

            <!-- 曾在此裝置登入過的帳號快速切換 -->
            ${offlineUsers.length > 1 ? `
              <div class="pt-2 border-t border-border">
                <div class="text-3xs text-muted mb-1.5 flex items-center justify-between">
                  <span>此裝置記住的帳號 (點擊快速切換)：</span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  ${offlineUsers.map(u => `
                    <button type="button" class="text-2xs px-2.5 py-1 rounded bg-surface border border-border hover:border-primary-blue text-secondary hover:text-primary flex items-center gap-1.5 transition-colors" onclick="App.quickSwitchUser('${u.email}')">
                      <i data-lucide="user" class="w-3 h-3 text-primary-blue"></i>
                      <span>${u.studentName || u.email.split('@')[0]}</span>
                      <span class="text-3xs text-muted">(${u.email.slice(0, 8)}...)</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- 提示與隱私安全 -->
            <div class="p-2.5 rounded-lg bg-surface/50 border border-border/60 text-3xs text-muted space-y-1">
              <div class="font-bold text-secondary flex items-center gap-1">
                <i data-lucide="lock" class="w-3 h-3 text-primary-blue"></i> 多人使用資料隔離說明：
              </div>
              <p>• 每個帳號在本機均享有 100% 隔離的獨立資料庫，切換帳號時完全看不到他人的成績。</p>
              <p>• 雲端 Google 試算表亦依帳號自動分區，多人同步時互不覆蓋、互不漏存。</p>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modal-host').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  },

  switchAuthTab(tab) {
    const loginBtn = document.getElementById('tab-btn-login');
    const registerBtn = document.getElementById('tab-btn-register');
    const studentNameField = document.getElementById('auth-field-student-name');
    const submitText = document.getElementById('auth-submit-text');

    if (tab === 'login') {
      loginBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-md transition-all bg-primary-blue text-white shadow-sm';
      registerBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-md transition-all text-muted hover:text-primary';
      if (studentNameField) studentNameField.classList.add('hidden');
      if (submitText) submitText.textContent = '立即登入專屬成績庫';
    } else {
      registerBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-md transition-all bg-primary-blue text-white shadow-sm';
      loginBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-md transition-all text-muted hover:text-primary';
      if (studentNameField) studentNameField.classList.remove('hidden');
      if (submitText) submitText.textContent = '立即註冊並啟用獨立空間';
    }
  },

  togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  },

  async handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const studentNameField = document.getElementById('auth-field-student-name');
    const isRegister = studentNameField && !studentNameField.classList.contains('hidden');
    const studentName = document.getElementById('auth-student-name')?.value?.trim() || '';

    const submitBtn = document.getElementById('auth-submit-btn');
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-70');

    try {
      if (isRegister) {
        await Auth.register(email, password, studentName);
        this.showToast(`註冊成功！已建立專屬獨立帳號：${email}`, 'success');
      } else {
        await Auth.login(email, password);
        this.showToast(`登入成功！已載入專屬成績資料庫`, 'success');
      }
      this.closeModal();
    } catch (err) {
      this.showToast(err.message || '驗證失敗，請檢查帳密', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-70');
    }
  },

  async quickSwitchUser(email) {
    const users = Auth.getOfflineUsers();
    const target = users.find(u => u.email === email);
    if (!target) return;
    try {
      await Auth.login(target.email, target.password);
      this.showToast(`已切換至：${target.studentName || target.email}`, 'success');
      this.closeModal();
    } catch (err) {
      this.showToast(`切換失敗: ${err.message}`, 'error');
    }
  },

  // ==========================================
  // 全考種錯題收錄與 AI 深度診斷模組 (Universal Mistake Bank & AI Export)
  // ==========================================

  /**
   * 開啟收錄/編輯錯題彈窗
   */
  openAddMistakeModal(editId = null, presetData = null) {
    const isEdit = Boolean(editId);
    const item = isEdit ? this.cachedData.mistakes.find(m => m.id === editId) : presetData;
    const selectedTags = (item && item.errorTags) || [];
    const currentMastery = (item && item.masteryLevel) ? Number(item.masteryLevel) : 1;
    const currentExamType = (item && item.examType) || 'quiz';
    const currentQuestionType = (item && item.questionType) || 'concept';
    const currentSubject = (item && item.subject) || 'CHINESE';

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="book-open" class="w-5 h-5 text-rose-400"></i>
              <h3 class="font-bold text-base text-primary">${isEdit ? '編輯錯題與盲點分析' : '收錄錯題與觀念盲點'}</h3>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <form id="form-mistake" onsubmit="App.handleMistakeFormSubmit(event, '${editId || ''}')" class="modal-body py-4 space-y-4 max-h-[78vh] overflow-y-auto">
            
            <!-- 考種、科目與測驗日期 -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="form-label">測驗日期 *</label>
                <input type="date" id="mk-date" required class="form-input" value="${item ? (item.date || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10)}" />
              </div>
              <div>
                <label class="form-label">學科領域 (考科) *</label>
                <select id="mk-subject" class="form-input" required>
                  ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${currentSubject === s.id ? 'selected' : ''}>${s.name} (${s.group})</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">考試來源 / 考種 *</label>
                <select id="mk-exam-type" class="form-input">
                  ${CONSTANTS.EXAM_TYPES.map(e => `<option value="${e.id}" ${currentExamType === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- 單元名稱與題型 -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label class="form-label">單元 / 章節 / 知識點名稱 *</label>
                <input type="text" id="mk-unit-name" required class="form-input" value="${item ? (item.unitName || '') : ''}" placeholder="例如：第 3 章 浮力與沉浮條件、二次函數極值判斷、文言文判讀" />
              </div>
              <div>
                <label class="form-label">題目類型 *</label>
                <select id="mk-question-type" class="form-input">
                  ${CONSTANTS.QUESTION_TYPES.map(t => `<option value="${t.id}" ${currentQuestionType === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- 題號 / 標題 -->
            <div>
              <label class="form-label">題號或題目摘要 *</label>
              <input type="text" id="mk-title" required class="form-input" value="${item ? (item.title || '') : ''}" placeholder="例如：第 18 題 - 鹽水浮雞蛋實驗、第 24 題 - 雙曲線圖表判讀" />
            </div>

            <!-- 題目完整內容 / 題幹描述 -->
            <div>
              <label class="form-label">題目內容 / 題幹描述 (供 AI 深度診斷與變形題出題)</label>
              <textarea id="mk-question-text" class="form-input font-sans text-xs leading-relaxed" rows="3" placeholder="請將題目描述貼上（含關鍵數據、選項或圖表描述，越詳細 AI 分析與出題越精準）...">${item ? (item.questionText || '') : ''}</textarea>
            </div>

            <!-- 學生錯誤思路 vs 正確解法 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="form-label text-rose-400">❌ 當時作答 / 錯誤思路障礙</label>
                <textarea id="mk-student-answer" class="form-input border-rose-500/30 focus:border-rose-500 text-xs" rows="2" placeholder="當時選了什麼？思考卡在哪裡？例如：選了 B，誤以為物體下沉時浮力等於重力">${item ? (item.studentAnswer || '') : ''}</textarea>
              </div>
              <div>
                <label class="form-label text-emerald-400">✅ 標準答案與正確解法</label>
                <textarea id="mk-correct-answer" class="form-input border-emerald-500/30 focus:border-emerald-500 text-xs" rows="2" placeholder="標準答案為 D。物體沉底時 F浮 < W，且浮力等於排開液重...">${item ? (item.correctAnswer || '') : ''}</textarea>
              </div>
            </div>

            <!-- 錯題歸因標籤多選 -->
            <div>
              <label class="form-label">錯題根本歸因標籤 (可複選)</label>
              <div class="flex flex-wrap gap-1.5 p-2 rounded bg-surface border border-border">
                ${CONSTANTS.ERROR_TAGS.map(t => {
                  const isChecked = selectedTags.includes(t.id);
                  return `
                    <label class="inline-flex items-center gap-1 text-2xs px-2.5 py-1 rounded cursor-pointer transition-colors ${isChecked ? 'bg-primary-blue text-white font-bold' : 'bg-card text-muted hover:text-primary'}">
                      <input type="checkbox" name="mk-error-tags" value="${t.id}" ${isChecked ? 'checked' : ''} class="hidden" onchange="this.parentElement.classList.toggle('bg-primary-blue', this.checked); this.parentElement.classList.toggle('text-white', this.checked); this.parentElement.classList.toggle('font-bold', this.checked); this.parentElement.classList.toggle('bg-card', !this.checked); this.parentElement.classList.toggle('text-muted', !this.checked);" />
                      <span>${t.name}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- 掌握度等級與艾賓浩斯排程 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-surface/50 border border-border">
              <div>
                <label class="form-label font-bold">精通掌握度等級</label>
                <div class="flex items-center gap-2 mt-1">
                  ${CONSTANTS.MASTERY_LEVELS.map(l => `
                    <label class="flex-1 text-center py-1.5 px-2 rounded-lg border text-2xs font-bold cursor-pointer transition-all ${currentMastery === l.level ? 'bg-primary-blue/20 border-primary-blue text-primary-blue' : 'border-border text-muted hover:border-primary-blue/40'}" onclick="document.querySelectorAll('.mastery-opt').forEach(el=>el.classList.remove('bg-primary-blue/20','border-primary-blue','text-primary-blue')); this.classList.add('bg-primary-blue/20','border-primary-blue','text-primary-blue');">
                      <input type="radio" name="mk-mastery" value="${l.level}" ${currentMastery === l.level ? 'checked' : ''} class="hidden mastery-opt-radio" />
                      <div class="mastery-opt">${l.badge}</div>
                    </label>
                  `).join('')}
                </div>
              </div>

              <div>
                <label class="form-label font-bold text-warning flex items-center gap-1">
                  <i data-lucide="lightbulb" class="w-3.5 h-3.5"></i>
                  <span>💡 核心觀念盲點 (考前複習精華)</span>
                </label>
                <input type="text" id="mk-blindspot" class="form-input border-warning/40 text-xs" value="${item ? (item.blindspot || '') : ''}" placeholder="例如：沉浮條件判斷先看密度，浮力計算先看排開液體積！" />
              </div>
            </div>

            <!-- 隱藏關聯 ID -->
            <input type="hidden" id="mk-exam-id" value="${(item && item.examId) || ''}" />

            <div class="modal-footer flex items-center justify-between pt-3 border-t border-border">
              <button type="button" class="btn-secondary text-xs" onclick="App.closeModal()">取消</button>
              <div class="flex items-center gap-2">
                ${isEdit ? `
                  <button type="button" class="btn-secondary text-xs text-primary-blue border-primary-blue/40" onclick="ExportImport.copyAIPromptToClipboard([BitableGallery.getMistakeById('${editId}')])">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5 inline mr-1"></i>複製 AI Prompt
                  </button>
                ` : ''}
                <button type="submit" class="btn-primary text-xs px-4">儲存錯題與盲點</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  /**
   * 處理錯題表單提交
   */
  async handleMistakeFormSubmit(e, editId) {
    e.preventDefault();

    const checkedTags = Array.from(document.querySelectorAll('input[name="mk-error-tags"]:checked')).map(cb => cb.value);
    const masteryRadio = document.querySelector('input[name="mk-mastery"]:checked');
    const masteryLevel = masteryRadio ? Number(masteryRadio.value) : 1;

    // 計算下次複習日期 (艾賓浩斯間隔)
    const reviewIntervalDays = masteryLevel === 3 ? 15 : (masteryLevel === 2 ? 3 : 1);
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + reviewIntervalDays);
    const nextReviewDateStr = nextDate.toISOString().slice(0, 10);

    const mistakeItem = {
      id: editId || `mk_${Date.now()}`,
      examId: document.getElementById('mk-exam-id')?.value || '',
      examType: document.getElementById('mk-exam-type').value,
      date: document.getElementById('mk-date').value,
      subject: document.getElementById('mk-subject').value,
      unitName: document.getElementById('mk-unit-name').value.trim(),
      questionType: document.getElementById('mk-question-type').value,
      title: document.getElementById('mk-title').value.trim(),
      questionText: document.getElementById('mk-question-text').value.trim(),
      studentAnswer: document.getElementById('mk-student-answer').value.trim(),
      correctAnswer: document.getElementById('mk-correct-answer').value.trim(),
      errorTags: checkedTags,
      masteryLevel: masteryLevel,
      blindspot: document.getElementById('mk-blindspot')?.value.trim() || '',
      nextReviewDate: nextReviewDateStr,
      createdAt: editId ? (this.cachedData.mistakes.find(m => m.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    await DB.put('mistakes', mistakeItem);
    await this.loadAllData();
    this.refreshCurrentView();
    this.closeModal();
    this.showToast('🎉 錯題與盲點已成功收錄至錯題庫！', 'success');
    this.triggerBackgroundSyncPush();
  },

  /**
   * 刪除錯題
   */
  async deleteMistake(id) {
    if (!id) return;
    if (confirm('確定要從錯題庫中移除此道錯題紀錄嗎？')) {
      await DB.delete('mistakes', id);
      await this.loadAllData();
      this.refreshCurrentView();
      this.showToast('錯題已刪除', 'info');
      this.triggerBackgroundSyncPush();
    }
  },

  /**
   * 點擊循環切換掌握度 (🔴 ➔ 🟡 ➔ 🟢)
   */
  async toggleMistakeMastery(id) {
    const item = this.cachedData.mistakes.find(m => m.id === id);
    if (!item) return;

    let nextLevel = (Number(item.masteryLevel) || 1) + 1;
    if (nextLevel > 3) nextLevel = 1;
    item.masteryLevel = nextLevel;

    // 更新下次複習日期
    const reviewIntervalDays = nextLevel === 3 ? 15 : (nextLevel === 2 ? 3 : 1);
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + reviewIntervalDays);
    item.nextReviewDate = nextDate.toISOString().slice(0, 10);

    await DB.put('mistakes', item);
    await this.loadAllData();
    this.refreshCurrentView();
    
    const masteryObj = CONSTANTS.MASTERY_LEVELS.find(l => l.level === nextLevel);
    this.showToast(`掌握度已切換為：${masteryObj.badge}`, 'success');
    this.triggerBackgroundSyncPush();
  },

  /**
   * 開啟 AI 深度診斷與變形題出題 Prompt 匯出彈窗
   */
  openAIExportModal(examId = null, examType = null) {
    let mistakes = [];
    let title = '全考種精選錯題 AI 深度診斷';

    if (examId) {
      mistakes = this.cachedData.mistakes.filter(m => m.examId === examId);
      const examTitle = (examType === 'mock' ? this.cachedData.mockExams.find(m => m.id === examId)?.title : (examType === 'term' ? this.cachedData.termExams.find(t => t.id === examId)?.examName : this.cachedData.quizzes.find(q => q.id === examId)?.unitName)) || '本次測驗';
      title = `${examTitle} 錯題 AI 深度診斷`;
    } else {
      mistakes = BitableGallery.getCurrentFilteredMistakes();
      if (mistakes.length === 0) {
        mistakes = this.cachedData.mistakes;
      }
    }

    if (mistakes.length === 0) {
      this.showToast('目前尚無錯題紀錄可供 AI 分析，請先收錄錯題！', 'warning');
      return;
    }

    const previewPrompt = ExportImport.generateAIMistakePrompt(mistakes, { title });

    const modalHtml = `
      <div class="modal-backdrop" onclick="App.closeModal(event)">
        <div class="modal-card modal-lg" onclick="event.stopPropagation()">
          <div class="modal-header flex items-center justify-between pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <i data-lucide="sparkles" class="w-5 h-5 text-primary-blue"></i>
              <div>
                <h3 class="font-bold text-base text-primary">🤖 AI 深度診斷 & 變形題出題中心</h3>
                <p class="text-3xs text-muted">一鍵將錯題轉換為針對 ChatGPT / Claude / Gemini 最優化之名師診斷提示詞</p>
              </div>
            </div>
            <button class="btn-icon" onclick="App.closeModal()"><i data-lucide="x" class="w-4 h-4"></i></button>
          </div>

          <div class="modal-body py-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <!-- 資訊橫幅 -->
            <div class="p-3 rounded-lg bg-primary-blue/10 border border-primary-blue/30 flex items-start gap-2.5">
              <i data-lucide="bot" class="w-5 h-5 text-primary-blue shrink-0 mt-0.5"></i>
              <div class="text-xs space-y-1">
                <div class="font-bold text-primary">已為您打包 ${mistakes.length} 道錯題的完整結構化數據！</div>
                <div class="text-secondary text-2xs leading-relaxed">
                  點擊下方「<b>複製 AI Prompt</b>」後，直接貼至 <b>ChatGPT / Claude / Gemini / DeepSeek</b>，AI 名師將立即為您輸出：
                  <span class="text-primary-blue font-semibold">① 底層思維盲點診斷</span>、
                  <span class="text-primary-blue font-semibold">② 關鍵破題金鑰</span>、
                  <span class="text-primary-blue font-semibold">③ 3天黃金搶分複習清單</span>、
                  <span class="text-primary-blue font-semibold">④ 3~5 題同概念高仿會考變形題</span>。
                </div>
              </div>
            </div>

            <!-- Prompt 即時預覽區 -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="form-label text-xs font-bold text-secondary">AI Prompt 提示詞預覽 (Markdown 格式)：</label>
                <span class="text-3xs text-muted font-mono">${previewPrompt.length} 字元</span>
              </div>
              <textarea readonly class="form-input font-mono text-2xs text-secondary bg-surface/90 border-border/80 leading-relaxed cursor-text select-all" rows="10">${previewPrompt}</textarea>
            </div>

            <!-- 實戰操作按鈕群組 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2">
              <button type="button" class="btn-primary text-xs py-2.5 flex items-center justify-center gap-1.5 font-bold shadow-md" onclick="ExportImport.copyAIPromptToClipboard(BitableGallery.getCurrentFilteredMistakes(), { title: '${title}' })">
                <i data-lucide="copy" class="w-4 h-4"></i>
                <span>一鍵複製 Prompt</span>
              </button>

              <button type="button" class="btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5" onclick="ExportImport.downloadAIMarkdown(BitableGallery.getCurrentFilteredMistakes(), { title: '${title}' })">
                <i data-lucide="download" class="w-4 h-4"></i>
                <span>下載 .md 檔案</span>
              </button>

              <button type="button" class="btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5 text-warning border-warning/40" onclick="ExportImport.printMistakeSheet(BitableGallery.getCurrentFilteredMistakes(), { includeAnswers: false, title: '考前專屬「盲點消滅」二次實戰重測卷' })">
                <i data-lucide="printer" class="w-4 h-4"></i>
                <span>印考前空白重刷卷</span>
              </button>

              <button type="button" class="btn-secondary text-xs py-2.5 flex items-center justify-center gap-1.5 text-secondary" onclick="ExportImport.printMistakeSheet(BitableGallery.getCurrentFilteredMistakes(), { includeAnswers: true, title: '學業評量錯題深度解析與盲點診斷書' })">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>印含詳解診斷書</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderModal(modalHtml);
  },

  // PWA 安裝觸發
  installPWA() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      this.deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          console.log('User accepted PWA installation');
        }
        this.deferredInstallPrompt = null;
        const installBtn = document.getElementById('btn-pwa-install');
        if (installBtn) installBtn.style.display = 'none';
      });
    }
  }
};

// 頁面載入完成後啟動應用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
