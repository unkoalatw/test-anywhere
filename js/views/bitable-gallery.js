// 飛書多維表格視圖引擎 - 錯題筆記畫廊視圖 (Mistake Book & Gallery View Component)
const BitableGallery = {
  searchQuery: '',
  selectedSubject: 'ALL',
  selectedMastery: 'ALL',
  selectedQuestionType: 'ALL',

  renderGallery(containerId, cachedData = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const mistakes = cachedData.mistakes || [];
    let items = [...mistakes];

    // 1. 搜尋過濾 (題目、標題、盲點、單元)
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(m => 
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.questionText && m.questionText.toLowerCase().includes(q)) ||
        (m.unitName && m.unitName.toLowerCase().includes(q)) ||
        (m.blindspot && m.blindspot.toLowerCase().includes(q)) ||
        (m.studentAnswer && m.studentAnswer.toLowerCase().includes(q)) ||
        (m.correctAnswer && m.correctAnswer.toLowerCase().includes(q))
      );
    }

    // 2. 科目過濾
    if (this.selectedSubject !== 'ALL') {
      items = items.filter(m => m.subject === this.selectedSubject);
    }

    // 3. 掌握度過濾
    if (this.selectedMastery !== 'ALL') {
      items = items.filter(m => Number(m.masteryLevel) === Number(this.selectedMastery));
    }

    // 4. 題型過濾
    if (this.selectedQuestionType !== 'ALL') {
      items = items.filter(m => m.questionType === this.selectedQuestionType);
    }

    // 依日期與掌握度排序 (生疏者優先，日期近者優先)
    items.sort((a, b) => {
      const mDiff = (Number(a.masteryLevel) || 1) - (Number(b.masteryLevel) || 1);
      if (mDiff !== 0) return mDiff;
      return new Date(b.date) - new Date(a.date);
    });

    // 統計指標
    const totalCount = mistakes.length;
    const needReviewCount = mistakes.filter(m => (Number(m.masteryLevel) || 1) < 3).length;
    const masteredCount = mistakes.filter(m => Number(m.masteryLevel) === 3).length;

    let html = `
      <!-- 頂部統計指標卡 -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div class="p-3.5 rounded-lg bg-surface border border-border flex items-center justify-between">
          <div>
            <div class="text-3xs text-muted font-medium">錯題總收錄量</div>
            <div class="text-xl font-bold font-mono text-primary">${totalCount} <span class="text-xs text-muted font-normal">題</span></div>
          </div>
          <div class="w-9 h-9 rounded-lg bg-primary-blue/15 text-primary-blue flex items-center justify-center font-bold">
            <i data-lucide="book-open" class="w-5 h-5"></i>
          </div>
        </div>

        <div class="p-3.5 rounded-lg bg-surface border border-border flex items-center justify-between">
          <div>
            <div class="text-3xs text-muted font-medium">待複習 / 生疏</div>
            <div class="text-xl font-bold font-mono text-warning">${needReviewCount} <span class="text-xs text-muted font-normal">題</span></div>
          </div>
          <div class="w-9 h-9 rounded-lg bg-amber-500/15 text-warning flex items-center justify-center font-bold">
            <i data-lucide="clock" class="w-5 h-5"></i>
          </div>
        </div>

        <div class="p-3.5 rounded-lg bg-surface border border-border flex items-center justify-between">
          <div>
            <div class="text-3xs text-muted font-medium">已完全熟練</div>
            <div class="text-xl font-bold font-mono text-success">${masteredCount} <span class="text-xs text-muted font-normal">題</span></div>
          </div>
          <div class="w-9 h-9 rounded-lg bg-emerald-500/15 text-success flex items-center justify-center font-bold">
            <i data-lucide="check-circle" class="w-5 h-5"></i>
          </div>
        </div>
      </div>

      <!-- 工具列：搜尋、科目快篩、掌握度快篩、題型快篩與新增按鈕 -->
      <div class="grid-toolbar mb-4 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <!-- 搜尋框 -->
          <div class="relative flex-1 sm:flex-initial">
            <input type="text" class="form-input-inline pl-7 text-xs w-full sm:w-48" placeholder="搜尋錯題、盲點、觀念..." value="${this.searchQuery}" oninput="BitableGallery.onSearch(this.value)" />
            <i data-lucide="search" class="w-3.5 h-3.5 text-muted absolute left-2 top-2"></i>
          </div>

          <!-- 科目篩選 -->
          <select class="select-2xs w-28" onchange="BitableGallery.onFilterChange('subject', this.value)">
            <option value="ALL" ${this.selectedSubject === 'ALL' ? 'selected' : ''}>全部科目</option>
            ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${this.selectedSubject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>

          <!-- 掌握度篩選 -->
          <select class="select-2xs w-32" onchange="BitableGallery.onFilterChange('mastery', this.value)">
            <option value="ALL" ${this.selectedMastery === 'ALL' ? 'selected' : ''}>全部掌握度</option>
            ${CONSTANTS.MASTERY_LEVELS.map(l => `<option value="${l.level}" ${Number(this.selectedMastery) === l.level ? 'selected' : ''}>${l.badge}</option>`).join('')}
          </select>

          <!-- 題型篩選 -->
          <select class="select-2xs w-32" onchange="BitableGallery.onFilterChange('qType', this.value)">
            <option value="ALL" ${this.selectedQuestionType === 'ALL' ? 'selected' : ''}>全部題型</option>
            ${CONSTANTS.QUESTION_TYPES.map(q => `<option value="${q.id}" ${this.selectedQuestionType === q.id ? 'selected' : ''}>${q.name}</option>`).join('')}
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-2xs text-muted hidden sm:inline">共 <b class="font-mono text-secondary">${items.length}</b> 道錯題</span>
          <button class="btn-primary text-xs py-1.5 px-3 shadow-sm flex items-center gap-1" onclick="App.openAddMistakeModal()">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>收錄錯題</span>
          </button>
        </div>
      </div>
    `;

    if (items.length === 0) {
      html += `
        <div class="empty-state py-16 text-center bg-surface/30 rounded-lg border border-dashed border-border">
          <i data-lucide="book-open" class="w-12 h-12 text-muted mb-3 mx-auto"></i>
          <p class="text-secondary text-sm font-bold">目前無符合條件的錯題筆記</p>
          <p class="text-muted text-xs mt-1">點擊上方「收錄錯題」按鈕，記錄考卷中做錯的題目、學生思路與核心盲點！</p>
          <button class="btn-primary text-xs mt-4 py-1.5 px-4" onclick="App.openAddMistakeModal()">
            <i data-lucide="plus" class="w-3.5 h-3.5 inline mr-1"></i>立即收錄第一道錯題
          </button>
        </div>
      `;
      container.innerHTML = html;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // 畫廊網格卡片列表 (Gallery Cards Grid)
    html += `<div class="gallery-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">`;

    items.forEach(item => {
      const subObj = CONSTANTS.SUBJECTS.find(s => s.id === item.subject) || { name: item.subject, color: '#3B82F6' };
      const qTypeObj = CONSTANTS.QUESTION_TYPES.find(q => q.id === item.questionType) || { name: '綜合題型' };
      const mastery = CONSTANTS.MASTERY_LEVELS.find(l => l.level === (Number(item.masteryLevel) || 1)) || CONSTANTS.MASTERY_LEVELS[0];
      const examTypeMap = { mock: '會考全模', term: '定期段考', quiz: '隨堂小考', other: '其他測驗' };

      html += `
        <div class="mistake-card p-4 rounded-xl border border-border bg-card/90 hover:border-primary-blue/40 transition-all flex flex-col justify-between shadow-sm">
          <div>
            <!-- 卡片頂部資訊列 -->
            <div class="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-border/60">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="subject-pill text-2xs" style="border-left-color: ${subObj.color};">${subObj.name}</span>
                <span class="badge badge-secondary text-3xs">${qTypeObj.name}</span>
                <span class="text-3xs text-muted font-mono">${item.date || ''}</span>
              </div>
              <button type="button" class="cursor-pointer select-none" onclick="App.toggleMistakeMastery('${item.id}')" title="點擊循環切換掌握度 (🔴生疏 ➔ 🟡複習中 ➔ 🟢熟練)">
                <span class="cap-tier-badge text-3xs py-0.5 px-2" style="background: ${mastery.color}20; color: ${mastery.color}; border: 1px solid ${mastery.color}40;">
                  ${mastery.badge}
                </span>
              </button>
            </div>

            <!-- 標題與所屬考卷/單元 -->
            <div class="mb-2">
              <h4 class="font-bold text-sm text-primary line-clamp-1">${item.title || '無標題題目'}</h4>
              <div class="text-3xs text-muted flex items-center gap-1 mt-0.5">
                <span class="text-primary-blue">${examTypeMap[item.examType] || '測驗'}</span>
                ${item.unitName ? `<span>• ${item.unitName}</span>` : ''}
              </div>
            </div>

            <!-- 題目主文 -->
            ${item.questionText ? `
              <div class="p-2.5 rounded-lg bg-surface/70 border border-border/50 text-2xs text-secondary leading-relaxed mb-2.5 max-h-28 overflow-y-auto font-sans whitespace-pre-wrap">
                ${item.questionText}
              </div>
            ` : ''}

            <!-- 學生答案 vs 正確答案對比 -->
            <div class="grid grid-cols-2 gap-2 p-2 rounded-lg bg-surface/50 border border-border/40 text-2xs mb-2.5">
              <div>
                <span class="text-3xs text-rose-400 block font-medium">學生錯誤思路 / 答案：</span>
                <span class="font-mono text-xs font-bold text-rose-300">${item.studentAnswer || '(未填)'}</span>
              </div>
              <div>
                <span class="text-3xs text-emerald-400 block font-medium">標準正確答案：</span>
                <span class="font-mono text-xs font-bold text-emerald-300">${item.correctAnswer || '(未填)'}</span>
              </div>
            </div>

            <!-- 盲點備註 -->
            ${item.blindspot ? `
              <div class="text-2xs text-warning bg-amber-500/10 border border-amber-500/25 p-2 rounded-lg mb-2 leading-relaxed">
                💡 <b>核心盲點：</b>${item.blindspot}
              </div>
            ` : ''}

            <!-- 錯題標籤清單 -->
            ${Array.isArray(item.errorTags) && item.errorTags.length > 0 ? `
              <div class="flex flex-wrap gap-1 mb-2">
                ${item.errorTags.map(tag => {
                  const tagObj = CONSTANTS.ERROR_TAGS.find(t => t.id === tag) || { name: tag, color: '#6B7280' };
                  return `<span class="badge text-3xs py-0.5 px-1.5" style="background: ${tagObj.color}15; color: ${tagObj.color}; border: 1px solid ${tagObj.color}35;">${tagObj.name}</span>`;
                }).join('')}
              </div>
            ` : ''}
          </div>

          <!-- 卡片底部操作列與下次複習排程 -->
          <div class="flex items-center justify-between pt-2.5 mt-1 border-t border-border/40 text-3xs text-muted">
            <span class="flex items-center gap-1 font-mono">
              <i data-lucide="calendar" class="w-3 h-3 text-muted"></i>
              下次複習：<b>${item.nextReviewDate || '今日'}</b>
            </span>
            <div class="flex items-center gap-1.5">
              <button class="btn-secondary text-2xs py-1 px-2" onclick="App.openAddMistakeModal('${item.id}')">
                <i data-lucide="edit-2" class="w-3 h-3 inline mr-0.5"></i>編輯
              </button>
              <button class="btn-danger-outline text-2xs py-1 px-2" onclick="App.deleteMistake('${item.id}')">
                <i data-lucide="trash-2" class="w-3 h-3 inline mr-0.5"></i>刪除
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  onSearch(val) {
    this.searchQuery = val;
    this.renderGallery('view-content-area', App.cachedData);
  },

  onFilterChange(type, val) {
    if (type === 'subject') this.selectedSubject = val;
    if (type === 'mastery') this.selectedMastery = val;
    if (type === 'qType') this.selectedQuestionType = val;
    this.renderGallery('view-content-area', App.cachedData);
  }
};
