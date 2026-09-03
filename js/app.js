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
    
    // 1. 初始化本地資料庫 (IndexedDB / LocalStorage)
    await DB.init();
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

  async loadAllData() {
    const [quizzes, termExams, mockExams, targetSchools, settings] = await Promise.all([
      DB.getAll('quizzes'),
      DB.getAll('termExams'),
      DB.getAll('mockExams'),
      DB.getAll('targetSchools'),
      DB.get('settings', 'main')
    ]);

    this.cachedData = {
      quizzes: quizzes || [],
      termExams: termExams || [],
      mockExams: mockExams || [],
      targetSchools: targetSchools && targetSchools.length > 0 ? targetSchools : CONSTANTS.TARGET_SCHOOLS_DB,
      settings: settings || SEED_DATA.settings
    };

    // 更新使用者標題
    this.updateUserHeader();
  },

  updateUserHeader() {
    const st = this.cachedData.settings || {};
    const nameEl = document.getElementById('header-student-name');
    const schEl = document.getElementById('header-school-info');
    if (nameEl) nameEl.textContent = st.studentName ? st.studentName : '考生檔案';
    if (schEl) {
      if (st.schoolName || st.gradeClass) {
        schEl.textContent = [st.schoolName, st.gradeClass].filter(Boolean).join(' • ');
      } else {
        schEl.textContent = '點擊設定填寫基本資料';
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
   * 切換主模組 (模考 / 段考 / 小考)
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

    const { quizzes, termExams, mockExams, targetSchools, settings } = this.cachedData;

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

    // 3. 錯題筆記畫廊視圖
    if (this.currentView === 'gallery') {
      BitableGallery.renderGallery('view-content-area', quizzes);
      return;
    }

    // 4. 表格視圖 (依照當前模組渲染)
    if (this.currentView === 'grid') {
      if (this.currentModule === 'mock') {
        BitableGrid.renderMockExamGrid('view-content-area', mockExams, settings.district || 'KEELUNG_TAIPEI');
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
                  <h4 class="font-bold text-sm text-primary group-hover:text-primary-blue transition-colors">會考模擬考評量</h4>
                  <p class="text-2xs text-muted">10 秒快速矩陣點選 • 換算 36 點與雙北落點排名</p>
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
