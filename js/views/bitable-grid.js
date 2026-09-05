// 飛書多維表格視圖引擎 - 表格與手機自適應卡片視圖 (Grid & Mobile Responsive View)
const BitableGrid = {
  currentSort: { column: 'date', order: 'desc' },
  searchQuery: '',
  selectedSubject: 'ALL',
  selectedFilter: 'ALL',
  groupBy: 'none',

  /**
   * 渲染小考表格與手機自適應卡片 (Quiz Grid & Mobile Cards)
   */
  renderQuizGrid(containerId, quizzes = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let items = [...quizzes];

    // 1. 搜尋過濾
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(item => 
        (item.unitName && item.unitName.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.quizType && item.quizType.toLowerCase().includes(q))
      );
    }

    // 2. 科目過濾
    if (this.selectedSubject !== 'ALL') {
      items = items.filter(item => item.subject === this.selectedSubject);
    }

    // 3. 訂正狀態過濾
    if (this.selectedFilter !== 'ALL') {
      items = items.filter(item => item.correctionStatus === this.selectedFilter);
    }

    // 4. 排序
    items.sort((a, b) => {
      let valA = a[this.currentSort.column];
      let valB = b[this.currentSort.column];
      if (this.currentSort.column === 'scoreRate') {
        valA = (a.score || 0) / (a.maxScore || 100);
        valB = (b.score || 0) / (b.maxScore || 100);
      }
      if (valA < valB) return this.currentSort.order === 'asc' ? -1 : 1;
      if (valA > valB) return this.currentSort.order === 'asc' ? 1 : -1;
      return 0;
    });

    let html = `
      <!-- 表格上方多維控制工具列 (Lark Bitable Toolbar) -->
      <div class="grid-toolbar mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <!-- 搜尋框 -->
          <div class="relative flex-1 sm:flex-initial">
            <input type="text" class="form-input-inline pl-7 text-xs w-full sm:w-44" placeholder="搜尋單元 / 筆記..." value="${this.searchQuery}" oninput="BitableGrid.onSearch(this.value)" />
            <i data-lucide="search" class="w-3.5 h-3.5 text-muted absolute left-2 top-2"></i>
          </div>

          <!-- 科目快篩 -->
          <select class="select-2xs w-28 sm:w-32" onchange="BitableGrid.onFilterSubject(this.value)">
            <option value="ALL" ${this.selectedSubject === 'ALL' ? 'selected' : ''}>全部考科</option>
            ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${this.selectedSubject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>

          <!-- 訂正狀態快篩 -->
          <select class="select-2xs w-24 sm:w-28" onchange="BitableGrid.onFilterStatus(this.value)">
            <option value="ALL" ${this.selectedFilter === 'ALL' ? 'selected' : ''}>全部狀態</option>
            <option value="need_help" ${this.selectedFilter === 'need_help' ? 'selected' : ''}>需請教</option>
            <option value="uncorrected" ${this.selectedFilter === 'uncorrected' ? 'selected' : ''}>未訂正</option>
            <option value="corrected" ${this.selectedFilter === 'corrected' ? 'selected' : ''}>已訂正</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-2xs text-muted hidden sm:inline">共 <b class="font-mono text-secondary">${items.length}</b> 筆</span>
          <button class="btn-secondary text-2xs py-1 px-2" onclick="ExportImport.exportCSV('quizzes')">
            <i data-lucide="download" class="w-3 h-3 inline mr-1"></i>匯出
          </button>
          <button class="btn-primary text-2xs py-1 px-2.5" onclick="App.openQuizModal()">
            <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>新增
          </button>
        </div>
      </div>
    `;

    if (items.length === 0) {
      html += `
        <div class="empty-state py-12 text-center">
          <i data-lucide="inbox" class="w-12 h-12 text-muted mb-3 mx-auto"></i>
          <p class="text-secondary text-sm">無符合條件的小考紀錄</p>
          <button class="btn-primary text-xs mt-3" onclick="App.openQuizModal()">+ 錄入第一筆小考成績</button>
        </div>
      `;
      container.innerHTML = html;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // 1. 桌面端表格 (Desktop Table)
    html += `
      <div class="table-responsive table-desktop-only">
        <table class="bitable-table">
          <thead>
            <tr>
              <th class="cursor-pointer" onclick="BitableGrid.toggleSort('date')">
                <div class="th-content">測驗日期 ${this.getSortIcon('date')}</div>
              </th>
              <th class="cursor-pointer" onclick="BitableGrid.toggleSort('subject')">
                <div class="th-content">科目 ${this.getSortIcon('subject')}</div>
              </th>
              <th>單元 / 章節名稱</th>
              <th>測驗類型</th>
              <th class="cursor-pointer text-right" onclick="BitableGrid.toggleSort('scoreRate')">
                <div class="th-content justify-end">實得分數 / 得分率 ${this.getSortIcon('scoreRate')}</div>
              </th>
              <th>錯題歸因標籤</th>
              <th>訂正狀態</th>
              <th class="text-warning">💡 核心盲點 (複習破口)</th>
              <th>備註與筆記</th>
              <th class="text-center w-20">操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach(q => {
      const subObj = CONSTANTS.SUBJECTS.find(s => s.id === q.subject) || { name: q.subject, color: '#3B82F6' };
      const maxScore = q.maxScore || 100;
      const rate = Math.round(((q.score || 0) / maxScore) * 100);
      const isRedFlag = rate < 70;

      const tagsHtml = (q.errorTags || []).map(tagId => {
        const tag = CONSTANTS.ERROR_TAGS.find(t => t.id === tagId) || { name: tagId, color: '#6B7280' };
        return `<span class="tag-badge" style="border-color: ${tag.color}40; color: ${tag.color}; background: ${tag.color}15;">${tag.name}</span>`;
      }).join(' ');

      const statusMap = {
        'corrected': { text: '已訂正', class: 'badge-success' },
        'need_help': { text: '需請教老師', class: 'badge-warning' },
        'uncorrected': { text: '未訂正', class: 'badge-danger' }
      };
      const status = statusMap[q.correctionStatus] || statusMap.corrected;

      html += `
        <tr class="table-row ${isRedFlag ? 'row-red-flag' : ''}">
          <td class="font-mono text-sm text-secondary">${q.date}</td>
          <td>
            <span class="subject-pill" style="border-left-color: ${subObj.color};">
              ${subObj.name}
            </span>
          </td>
          <td class="font-medium text-primary">
            ${q.unitName}
            ${isRedFlag ? '<span class="red-flag-badge ml-1.5"><i data-lucide="alert-circle" class="w-3 h-3 inline"></i> 待強化 (<70%)</span>' : ''}
          </td>
          <td class="text-sm text-secondary">${q.quizType || '隨堂測驗'}</td>
          <td class="text-right font-mono">
            <span class="score-text ${isRedFlag ? 'text-danger font-bold' : rate >= 90 ? 'text-success' : 'text-primary'}">
              ${q.score}
            </span>
            <span class="text-muted text-xs">/${maxScore} (${rate}%)</span>
          </td>
          <td><div class="tags-container flex flex-wrap gap-1">${tagsHtml || '<span class="text-muted text-xs">無標籤</span>'}</div></td>
          <td><span class="status-badge ${status.class}">${status.text}</span></td>
          <td class="text-xs font-medium max-w-xs text-warning/90 truncate" title="${q.blindspot || ''}">
            ${q.blindspot ? `💡 ${q.blindspot}` : '<span class="text-muted">-</span>'}
          </td>
          <td class="text-sm text-secondary max-w-xs truncate" title="${q.notes || ''}">${q.notes || '-'}</td>
          <td class="text-center">
            <div class="action-btn-group">
              <button class="btn-icon" title="編輯" onclick="App.openQuizModal('${q.id}')">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button class="btn-icon text-danger" title="刪除" onclick="App.deleteItem('quizzes', '${q.id}')">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;

    // 2. 手機版卡片流 (Mobile Cards)
    html += `<div class="mobile-quiz-cards cards-mobile-only space-y-3">`;

    items.forEach(q => {
      const subObj = CONSTANTS.SUBJECTS.find(s => s.id === q.subject) || { name: q.subject, color: '#3B82F6' };
      const maxScore = q.maxScore || 100;
      const rate = Math.round(((q.score || 0) / maxScore) * 100);
      const isRedFlag = rate < 70;

      const tagsHtml = (q.errorTags || []).map(tagId => {
        const tag = CONSTANTS.ERROR_TAGS.find(t => t.id === tagId) || { name: tagId, color: '#6B7280' };
        return `<span class="tag-badge-sm" style="color: ${tag.color}; background: ${tag.color}15;">${tag.name}</span>`;
      }).join(' ');

      const statusMap = {
        'corrected': { text: '已訂正', class: 'badge-success' },
        'need_help': { text: '需請教', class: 'badge-warning' },
        'uncorrected': { text: '未訂正', class: 'badge-danger' }
      };
      const status = statusMap[q.correctionStatus] || statusMap.corrected;

      html += `
        <div class="mobile-record-card p-3.5 rounded-lg border border-border bg-card">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="subject-pill text-xs" style="border-left-color: ${subObj.color};">${subObj.name}</span>
              <span class="text-3xs text-muted font-mono">${q.date}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-sm font-bold ${isRedFlag ? 'text-danger' : rate >= 90 ? 'text-success' : 'text-primary'}">
                ${q.score} <span class="text-xs text-muted font-normal">/ ${maxScore} (${rate}%)</span>
              </span>
              <span class="status-badge ${status.class} text-3xs">${status.text}</span>
            </div>
          </div>

          <div class="font-medium text-sm text-primary mb-1.5">
            ${q.unitName}
            ${isRedFlag ? '<span class="red-flag-badge ml-1 text-3xs">待強化</span>' : ''}
          </div>

          ${tagsHtml ? `<div class="flex flex-wrap gap-1 mb-2">${tagsHtml}</div>` : ''}
          ${q.blindspot ? `<div class="text-2xs text-warning bg-amber-500/10 border border-amber-500/30 p-2 rounded mb-2 font-medium">💡 <b>盲點：</b>${q.blindspot}</div>` : ''}
          ${q.notes ? `<div class="text-2xs text-secondary bg-surface/60 p-2 rounded mb-2">${q.notes}</div>` : ''}

          <div class="flex items-center justify-between pt-2 border-t border-border/50 text-2xs text-muted">
            <span>${q.quizType || '隨堂測驗'}</span>
            <div class="action-btn-group">
              <button class="btn-icon" onclick="App.openQuizModal('${q.id}')"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></button>
              <button class="btn-icon text-danger" onclick="App.deleteItem('quizzes', '${q.id}')"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  /**
   * 渲染定期段考表格 (Term Exam Grid - 支援空值自適應與無空白欄位乾淨折疊)
   */
  renderTermExamGrid(containerId, termExams = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = `
      <div class="grid-toolbar mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border">
        <div class="flex items-center gap-2">
          <i data-lucide="award" class="w-4 h-4 text-primary-blue"></i>
          <span class="text-xs font-bold text-primary">定期段考指標總覽</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-primary text-2xs py-1 px-2.5" onclick="App.openTermModal()">
            <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>新增段考
          </button>
        </div>
      </div>
    `;

    if (termExams.length === 0) {
      html += `
        <div class="empty-state py-12 text-center">
          <i data-lucide="calendar" class="w-12 h-12 text-muted mb-3 mx-auto"></i>
          <p class="text-secondary text-sm">尚無段考評量資料</p>
          <button class="btn-primary text-xs mt-3" onclick="App.openTermModal()">+ 錄入第一次段考成績</button>
        </div>
      `;
      container.innerHTML = html;
      if (window.lucide) lucide.createIcons();
      return;
    }

    html += `<div class="term-exams-container space-y-4">`;

    // 依日期排序
    const sorted = [...termExams].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(exam => {
      const subjects = exam.subjects || {};
      const activeSubjects = Object.keys(subjects).filter(k => subjects[k] && subjects[k].score !== undefined && subjects[k].score !== null);

      html += `
        <div class="term-card">
          <!-- 段考頂部摘要資訊列 -->
          <div class="term-header flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-border">
            <div class="flex items-center gap-2">
              <div class="term-badge flex items-center gap-1.5">
                <i data-lucide="award" class="w-4 h-4 text-primary-blue"></i>
                <span class="font-bold text-sm text-primary">${exam.termName}</span>
              </div>
              <span class="text-3xs text-muted font-mono">${exam.date}</span>
            </div>
            
            <div class="flex items-center gap-3 text-sm flex-wrap">
              <div class="metric-pill">
                <span class="text-muted text-3xs">班級排名</span>
                <span class="font-bold font-mono text-primary">${exam.classRank ? `第 ${exam.classRank} 名` : '-'}</span>
              </div>
              ${exam.gradeRank ? `
                <div class="metric-pill">
                  <span class="text-muted text-3xs">校排名</span>
                  <span class="font-bold font-mono text-primary">第 ${exam.gradeRank} 名</span>
                </div>
              ` : ''}
              <div class="metric-pill">
                <span class="text-muted text-3xs">總分</span>
                <span class="font-bold font-mono text-primary-blue">${exam.totalScore || '-'}</span>
              </div>
              <div class="metric-pill">
                <span class="text-muted text-3xs">總平均</span>
                <span class="font-bold font-mono text-success">${exam.averageScore || '-'}</span>
              </div>
              <div class="action-btn-group ml-1">
                <button class="btn-icon" title="編輯段考" onclick="App.openTermModal('${exam.id}')">
                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                </button>
                <button class="btn-icon text-danger" title="刪除段考" onclick="App.deleteItem('termExams', '${exam.id}')">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- 段考分科卡片自適應展示 (空值自動折疊，完全不渲染空標籤) -->
          <div class="term-subjects-grid mt-3">
      `;

      activeSubjects.forEach(subCode => {
        const subData = subjects[subCode];
        const subInfo = CONSTANTS.SUBJECTS.find(s => s.id === subCode) || { name: subCode, color: '#3B82F6' };
        
        const hasClassAvg = subData.classAvg !== null && subData.classAvg !== undefined && subData.classAvg !== '';
        const hasHigh = subData.highBenchmark !== null && subData.highBenchmark !== undefined && subData.highBenchmark !== '';
        const hasLow = subData.lowBenchmark !== null && subData.lowBenchmark !== undefined && subData.lowBenchmark !== '';
        const hasPR = subData.prEstimate !== null && subData.prEstimate !== undefined && subData.prEstimate !== '';

        html += `
          <div class="subject-stat-card">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold text-secondary" style="color: ${subInfo.color};">${subInfo.name}</span>
              <span class="text-sm font-bold font-mono text-primary">${subData.score} 分</span>
            </div>

            <div class="sub-metrics-row flex flex-wrap gap-1.5 text-2xs text-muted">
              ${hasClassAvg ? `<span class="badge-sub-metric">班均: <b class="text-secondary font-mono">${subData.classAvg}</b></span>` : ''}
              ${hasHigh ? `<span class="badge-sub-metric text-success">高標: <b class="font-mono">${subData.highBenchmark}</b></span>` : ''}
              ${hasLow ? `<span class="badge-sub-metric text-danger">低標: <b class="font-mono">${subData.lowBenchmark}</b></span>` : ''}
              ${hasPR ? `<span class="badge-sub-metric text-primary-blue">PR: <b class="font-mono">${subData.prEstimate}</b></span>` : ''}
            </div>
          </div>
        `;
      });

      html += `
          </div>
          ${exam.blindspot ? `<div class="term-blindspot mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-warning font-medium"><i data-lucide="lightbulb" class="w-3.5 h-3.5 inline mr-1 text-warning"></i><b>段考盲點複習：</b>${exam.blindspot}</div>` : ''}
          ${exam.notes ? `<div class="term-notes mt-2 text-xs text-muted"><i data-lucide="file-text" class="w-3.5 h-3.5 inline mr-1 text-secondary"></i>${exam.notes}</div>` : ''}
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  /**
   * 渲染國中會考模擬考總覽 (CAP Mock Exam Desktop Table + Mobile Cards)
   */
  renderMockExamGrid(containerId, mockExams = [], currentDistrict = 'KEELUNG_TAIPEI') {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = `
      <div class="grid-toolbar mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border">
        <div class="flex items-center gap-2">
          <i data-lucide="target" class="w-4 h-4 text-primary-blue"></i>
          <span class="text-xs font-bold text-primary">會考模擬考等級總覽</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-2xs py-1 px-2" onclick="ExportImport.exportCSV('mockExams')">
            <i data-lucide="download" class="w-3 h-3 inline mr-1"></i>匯出
          </button>
          <button class="btn-primary text-2xs py-1 px-2.5" onclick="App.openMockModal()">
            <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>錄入模考
          </button>
        </div>
      </div>
    `;

    if (mockExams.length === 0) {
      html += `
        <div class="empty-state py-12 text-center">
          <i data-lucide="target" class="w-12 h-12 text-muted mb-3 mx-auto"></i>
          <p class="text-secondary text-sm">尚無會考模擬考紀錄</p>
          <button class="btn-primary text-xs mt-3" onclick="App.openMockModal()">+ 10 秒快速錄入第一場模考</button>
        </div>
      `;
      container.innerHTML = html;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const sorted = [...mockExams].sort((a, b) => new Date(b.date) - new Date(a.date));

    // 1. 桌面端表格 (Desktop Table)
    html += `
      <div class="table-responsive table-desktop-only">
        <table class="bitable-table">
          <thead>
            <tr>
              <th>考次與卷別</th>
              <th>測驗日期</th>
              <th>國文</th>
              <th>英語 (加權)</th>
              <th>數學 (加權)</th>
              <th>社會</th>
              <th>自然</th>
              <th>寫作</th>
              <th class="text-center">會考總標示</th>
              <th class="text-right">總積點</th>
              <th class="text-right">基北區排名 / 市排名預估</th>
              <th class="text-center w-20">操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    sorted.forEach(exam => {
      const metrics = ScoringEngine.calculateMockMetrics(exam, currentDistrict);
      const sub = exam.subjects || {};
      const rankEst = metrics.rankEstimate || {};

      const renderBadge = (notation) => {
        const not = CONSTANTS.CAP_NOTATIONS.find(n => n.notation === notation) || { color: '#6B7280', notation: notation || '-' };
        return `<span class="cap-tier-badge" style="background: ${not.color}20; color: ${not.color}; border: 1px solid ${not.color}40;">${notation || '-'}</span>`;
      };

      html += `
        <tr class="table-row">
          <td>
            <div class="font-medium text-primary">${exam.title}</div>
            <div class="text-2xs text-muted flex items-center gap-2 mt-0.5">
              <span>${exam.organizer || '模擬考'}</span>
              <span>•</span>
              <span>${exam.scope || '全範圍'}</span>
            </div>
            ${exam.blindspot ? `<div class="text-3xs text-warning bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded mt-1.5 font-medium inline-block"><i data-lucide="lightbulb" class="w-2.5 h-2.5 inline mr-1 text-warning"></i><b>盲點：</b>${exam.blindspot}</div>` : ''}
          </td>
          <td class="font-mono text-sm text-secondary">${exam.date}</td>
          
          <!-- 國文 -->
          <td>
            <div class="flex items-center gap-1.5">
              ${renderBadge(sub.CHINESE ? sub.CHINESE.notation : '')}
              ${sub.CHINESE && sub.CHINESE.rawCorrect !== undefined ? `<span class="text-2xs text-muted font-mono">(${sub.CHINESE.rawCorrect}/${sub.CHINESE.totalItems || 42})</span>` : ''}
            </div>
          </td>

          <!-- 英語 -->
          <td>
            <div class="flex flex-col gap-0.5">
              <div class="flex items-center gap-1.5">
                ${renderBadge(sub.ENGLISH ? sub.ENGLISH.notation : '')}
                ${sub.ENGLISH && sub.ENGLISH.weightedScore ? `<span class="text-2xs text-primary-blue font-mono font-bold">${sub.ENGLISH.weightedScore}分</span>` : ''}
              </div>
              ${sub.ENGLISH && sub.ENGLISH.readingCorrect !== undefined ? `<span class="text-3xs text-muted font-mono">閱${sub.ENGLISH.readingCorrect} 聽${sub.ENGLISH.listeningCorrect}</span>` : ''}
            </div>
          </td>

          <!-- 數學 -->
          <td>
            <div class="flex flex-col gap-0.5">
              <div class="flex items-center gap-1.5">
                ${renderBadge(sub.MATH ? sub.MATH.notation : '')}
                ${sub.MATH && sub.MATH.weightedScore ? `<span class="text-2xs text-primary-purple font-mono font-bold">${sub.MATH.weightedScore}分</span>` : ''}
              </div>
              ${sub.MATH && sub.MATH.choiceCorrect !== undefined ? `<span class="text-3xs text-muted font-mono">選${sub.MATH.choiceCorrect} 非選${sub.MATH.nonChoiceScore || 0}</span>` : ''}
            </div>
          </td>

          <!-- 社會 -->
          <td>
            <div class="flex items-center gap-1.5">
              ${renderBadge(sub.SOCIAL ? sub.SOCIAL.notation : '')}
              ${sub.SOCIAL && sub.SOCIAL.rawCorrect !== undefined ? `<span class="text-2xs text-muted font-mono">(${sub.SOCIAL.rawCorrect})</span>` : ''}
            </div>
          </td>

          <!-- 自然 -->
          <td>
            <div class="flex items-center gap-1.5">
              ${renderBadge(sub.SCIENCE ? sub.SCIENCE.notation : '')}
              ${sub.SCIENCE && sub.SCIENCE.rawCorrect !== undefined ? `<span class="text-2xs text-muted font-mono">(${sub.SCIENCE.rawCorrect})</span>` : ''}
            </div>
          </td>

          <!-- 寫作 -->
          <td class="font-mono text-sm text-secondary">
            ${sub.WRITING && !sub.WRITING.isExempt ? `<span class="writing-badge">${sub.WRITING.grade || 0} 級分</span>` : '<span class="text-muted text-xs">免計</span>'}
          </td>

          <!-- 總標示 -->
          <td class="text-center font-bold text-success font-mono">${metrics.summaryTier}</td>

          <!-- 總積點 -->
          <td class="text-right font-bold font-mono text-primary-blue text-base">${metrics.totalPoints} 點</td>

          <!-- 基北區排名 / 市排名預估 -->
          <td class="text-right">
            <div class="font-mono font-bold text-xs text-primary">${rankEst.districtRankRange || '-'}</div>
            <div class="text-3xs text-muted">
              <span class="badge-success-subtle px-1 py-0.2">${rankEst.districtPR || '-'}</span>
              <span title="${rankEst.cityRankTaipei} • ${rankEst.cityRankNewTaipei}">${rankEst.percentileText || ''}</span>
            </div>
          </td>

          <td class="text-center">
            <div class="action-btn-group">
              <button class="btn-icon" title="編輯模考" onclick="App.openMockModal('${exam.id}')">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button class="btn-icon text-danger" title="刪除模考" onclick="App.deleteItem('mockExams', '${exam.id}')">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;

    // 2. 手機版模考卡片流 (Mobile Card List with Keelung-Taipei / City Ranks)
    html += `<div class="mobile-mock-cards cards-mobile-only space-y-3">`;

    sorted.forEach(exam => {
      const metrics = ScoringEngine.calculateMockMetrics(exam, currentDistrict);
      const sub = exam.subjects || {};
      const rankEst = metrics.rankEstimate || {};

      const renderBadge = (label, notation, extra = '') => {
        const not = CONSTANTS.CAP_NOTATIONS.find(n => n.notation === notation) || { color: '#6B7280', notation: notation || '-' };
        return `
          <div class="flex items-center justify-between p-1.5 rounded bg-surface/70 border border-border/50">
            <span class="text-2xs text-secondary font-medium">${label}</span>
            <div class="flex items-center gap-1">
              <span class="cap-tier-badge text-3xs py-0.5 px-1.5" style="background: ${not.color}20; color: ${not.color}; border: 1px solid ${not.color}40;">${notation || '-'}</span>
              ${extra ? `<span class="text-3xs font-mono text-muted">${extra}</span>` : ''}
            </div>
          </div>
        `;
      };

      html += `
        <div class="mobile-mock-card p-3.5 rounded-lg border border-border bg-card">
          <!-- 頂部標題與總標示 -->
          <div class="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-border/60">
            <div>
              <h4 class="font-bold text-sm text-primary line-clamp-1">${exam.title}</h4>
              <div class="text-3xs text-muted flex items-center gap-1.5 mt-0.5">
                <span>${exam.organizer || '模擬考'}</span>
                <span>•</span>
                <span>${exam.scope || '全範圍'}</span>
                <span>•</span>
                <span class="font-mono">${exam.date}</span>
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="font-bold font-mono text-success text-sm">${metrics.summaryTier}</div>
              <div class="text-2xs font-mono font-bold text-primary-blue">${metrics.totalPoints} 點 <span class="text-muted font-normal">(${metrics.totalCredits}分)</span></div>
            </div>
          </div>

          <!-- 北北基考區排名與市排名仿真預估卡片列 -->
          <div class="p-2 rounded bg-surface/80 border border-border/60 mb-2.5 space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-primary flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-primary-blue"></i>
                基北全區排名
              </span>
              <span class="font-mono font-bold text-warning">${rankEst.districtRankRange || '-'} <span class="text-2xs text-success">(${rankEst.districtPR || '-'})</span></span>
            </div>
            <div class="flex items-center justify-between text-3xs text-muted pt-1 border-t border-border/40">
              <span>${rankEst.cityRankTaipei || ''}</span>
              <span>${rankEst.cityRankNewTaipei || ''}</span>
            </div>
          </div>

          <!-- 5 科 + 作文等級網格 (2 欄流動) -->
          <div class="grid grid-cols-2 gap-1.5 mb-2.5">
            ${renderBadge('國文', sub.CHINESE ? sub.CHINESE.notation : '')}
            ${renderBadge('英語', sub.ENGLISH ? sub.ENGLISH.notation : '', sub.ENGLISH && sub.ENGLISH.weightedScore ? `${sub.ENGLISH.weightedScore}分` : '')}
            ${renderBadge('數學', sub.MATH ? sub.MATH.notation : '', sub.MATH && sub.MATH.weightedScore ? `${sub.MATH.weightedScore}分` : '')}
            ${renderBadge('社會', sub.SOCIAL ? sub.SOCIAL.notation : '')}
            ${renderBadge('自然', sub.SCIENCE ? sub.SCIENCE.notation : '')}
            <div class="flex items-center justify-between p-1.5 rounded bg-surface/70 border border-border/50">
              <span class="text-2xs text-secondary font-medium">寫作</span>
              <span class="writing-badge text-3xs py-0.5 px-1.5">${sub.WRITING && !sub.WRITING.isExempt ? `${sub.WRITING.grade || 0} 級分` : '免計'}</span>
            </div>
          </div>

          ${exam.blindspot ? `<div class="text-2xs text-warning bg-amber-500/10 border border-amber-500/30 p-2 rounded mb-2 font-medium">💡 <b>模考盲點：</b>${exam.blindspot}</div>` : ''}
          ${exam.notes ? `<div class="text-2xs text-secondary bg-surface/60 p-2 rounded mb-2">${exam.notes}</div>` : ''}

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-border/40 text-2xs">
            <button class="btn-secondary text-2xs py-1 px-2.5" onclick="App.openMockModal('${exam.id}')">
              <i data-lucide="edit-2" class="w-3 h-3 inline mr-1"></i>編輯
            </button>
            <button class="btn-danger-outline text-2xs py-1 px-2.5" onclick="App.deleteItem('mockExams', '${exam.id}')">
              <i data-lucide="trash-2" class="w-3 h-3 inline mr-1"></i>刪除
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  /**
   * 渲染單科模模考表格與手機卡片視圖 (Mini Mock Grid & Mobile Cards)
   */
  renderMiniMockGrid(containerId, miniMocks = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let items = [...miniMocks];

    // 1. 搜尋過濾
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(item => 
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.scope && item.scope.toLowerCase().includes(q)) ||
        (item.blindspot && item.blindspot.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    }

    // 2. 科目過濾
    if (this.selectedSubject !== 'ALL') {
      items = items.filter(item => item.subject === this.selectedSubject);
    }

    // 3. 等級標示過濾
    if (this.selectedFilter !== 'ALL') {
      if (this.selectedFilter === 'TIER_A') items = items.filter(item => item.notation && item.notation.startsWith('A'));
      else if (this.selectedFilter === 'TIER_B') items = items.filter(item => item.notation && item.notation.startsWith('B'));
      else if (this.selectedFilter === 'TIER_C') items = items.filter(item => item.notation === 'C');
      else items = items.filter(item => item.notation === this.selectedFilter);
    }

    // 4. 排序
    items.sort((a, b) => {
      let valA = a[this.currentSort.column];
      let valB = b[this.currentSort.column];
      if (valA < valB) return this.currentSort.order === 'asc' ? -1 : 1;
      if (valA > valB) return this.currentSort.order === 'asc' ? 1 : -1;
      return 0;
    });

    let html = `
      <!-- 工具列 -->
      <div class="grid-toolbar mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <!-- 搜尋框 -->
          <div class="relative flex-1 sm:flex-initial">
            <input type="text" class="form-input-inline pl-7 text-xs w-full sm:w-48" placeholder="搜尋考卷名稱 / 範圍 / 盲點..." value="${this.searchQuery}" oninput="BitableGrid.onSearch(this.value)" />
            <i data-lucide="search" class="w-3.5 h-3.5 text-muted absolute left-2 top-2"></i>
          </div>

          <!-- 科目過濾 -->
          <select class="select-sm text-2xs" onchange="BitableGrid.onFilterSubject(this.value)">
            <option value="ALL" ${this.selectedSubject === 'ALL' ? 'selected' : ''}>所有考科</option>
            ${CONSTANTS.CAP_SUBJECTS.map(s => `<option value="${s.id}" ${this.selectedSubject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>

          <!-- 等級標示過濾 -->
          <select class="select-sm text-2xs" onchange="BitableGrid.onFilterStatus(this.value)">
            <option value="ALL" ${this.selectedFilter === 'ALL' ? 'selected' : ''}>全部等級標示</option>
            <option value="TIER_A" ${this.selectedFilter === 'TIER_A' ? 'selected' : ''}>精熟 A 級 (A++/A+/A)</option>
            <option value="TIER_B" ${this.selectedFilter === 'TIER_B' ? 'selected' : ''}>基礎 B 級 (B++/B+/B)</option>
            <option value="TIER_C" ${this.selectedFilter === 'TIER_C' ? 'selected' : ''}>待加強 C 級</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <button class="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm" onclick="App.openMiniMockModal()">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
            <span>錄入單科模模考</span>
          </button>
        </div>
      </div>

      <!-- 桌面版精緻數據表格 -->
      <div class="bitable-table-container hidden md:block overflow-x-auto rounded-lg border border-border bg-card">
        <table class="bitable-table w-full text-xs">
          <thead>
            <tr class="bg-surface border-b border-border text-muted">
              <th class="cursor-pointer text-left py-2.5 px-3" onclick="BitableGrid.toggleSort('date')">測驗日期 ${this.getSortIcon('date')}</th>
              <th class="cursor-pointer text-left py-2.5 px-3" onclick="BitableGrid.toggleSort('subject')">考科 ${this.getSortIcon('subject')}</th>
              <th class="text-left py-2.5 px-3">考卷名稱 / 單元範圍</th>
              <th class="text-center py-2.5 px-3">答對題數 / 得分率</th>
              <th class="cursor-pointer text-center py-2.5 px-3" onclick="BitableGrid.toggleSort('weightedScore')">加權/實得分數 ${this.getSortIcon('weightedScore')}</th>
              <th class="text-center py-2.5 px-3">會考等級標示</th>
              <th class="text-center py-2.5 px-3">換算積點</th>
              <th class="text-left py-2.5 px-3 min-w-[180px]">💡 核心觀念盲點</th>
              <th class="text-center py-2.5 px-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/60">
    `;

    if (items.length === 0) {
      html += `
        <tr>
          <td colspan="9" class="py-12 text-center text-muted">
            <i data-lucide="calculator" class="w-8 h-8 text-muted mx-auto mb-2 opacity-50"></i>
            <div>無符合條件的單科模模考紀錄</div>
            <button class="btn-secondary text-xs mt-3 py-1 px-3 text-primary-blue border-primary-blue/30" onclick="App.openMiniMockModal()">
              <i data-lucide="plus" class="w-3 h-3 inline mr-1"></i>錄入第一筆單科測驗
            </button>
          </td>
        </tr>
      `;
    } else {
      items.forEach(m => {
        const subObj = CONSTANTS.SUBJECTS.find(s => s.id === m.subject) || { name: m.subject, color: '#3B82F6' };
        const notObj = CONSTANTS.CAP_NOTATIONS.find(n => n.notation === m.notation) || { color: '#3B82F6', badgeClass: 'badge-primary' };
        const linkedMistakeCount = (window.App && App.cachedData && App.cachedData.mistakes ? App.cachedData.mistakes.filter(mk => mk.examId === m.id).length : 0);

        html += `
          <tr class="hover:bg-surface/50 transition-colors">
            <td class="py-2.5 px-3 font-mono text-secondary">${m.date}</td>
            <td class="py-2.5 px-3">
              <span class="subject-pill font-bold" style="border-left-color: ${subObj.color};">${subObj.name}</span>
            </td>
            <td class="py-2.5 px-3">
              <div class="font-bold text-primary">${m.title || '單科模擬測驗'}</div>
              ${m.scope ? `<div class="text-3xs text-muted">${m.scope}</div>` : ''}
            </td>
            <td class="py-2.5 px-3 text-center font-mono">
              <span class="text-primary font-bold">${m.rawCorrect !== undefined ? m.rawCorrect : '-'}</span>
              <span class="text-muted"> / ${m.totalItems || '-'}</span>
              ${m.rate !== undefined ? `<div class="text-3xs text-muted">(${m.rate}%)</div>` : ''}
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold text-primary-blue text-sm">
              ${m.weightedScore !== undefined ? m.weightedScore : '-'}
            </td>
            <td class="py-2.5 px-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-xs font-bold border font-mono" style="color: ${notObj.color}; background: ${notObj.color}15; border-color: ${notObj.color}40;">
                ${m.notation || 'B'}
              </span>
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-bold text-amber-400">
              ${m.standardPoints !== undefined ? `${m.standardPoints} 點` : '-'}
            </td>
            <td class="py-2.5 px-3">
              ${m.blindspot ? `
                <div class="text-2xs text-warning leading-tight flex items-start gap-1">
                  <i data-lucide="lightbulb" class="w-3 h-3 text-warning shrink-0 mt-0.5"></i>
                  <span class="line-clamp-2">${m.blindspot}</span>
                </div>
              ` : '<span class="text-3xs text-muted italic">無盲點備註</span>'}
            </td>
            <td class="py-2.5 px-3 text-center">
              <div class="flex items-center justify-center gap-1">
                <button class="btn-icon" title="收錄本卷錯題" onclick="App.openAddMistakeModal(null, { examId: '${m.id}', examType: 'mini_mock', date: '${m.date}', subject: '${m.subject}', title: '${m.title}' })">
                  <i data-lucide="plus" class="w-3.5 h-3.5 text-rose-400"></i>
                </button>
                <button class="btn-icon" title="編輯" onclick="App.openMiniMockModal('${m.id}')">
                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                </button>
                <button class="btn-icon text-danger" title="刪除" onclick="App.deleteItem('miniMocks', '${m.id}')">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>

      <!-- 手機版自適應卡片列表 (Mobile Card View) -->
      <div class="mobile-cards-list md:hidden space-y-3">
    `;

    if (items.length === 0) {
      html += `
        <div class="empty-state py-12 text-center bg-surface/30 rounded-lg border border-dashed border-border">
          <i data-lucide="calculator" class="w-10 h-10 text-muted mx-auto mb-2 opacity-50"></i>
          <div class="text-secondary text-sm font-bold">無符合條件的單科模模考紀錄</div>
          <button class="btn-primary text-xs mt-3 py-1.5 px-4" onclick="App.openMiniMockModal()">
            <i data-lucide="plus" class="w-3.5 h-3.5 inline mr-1"></i>錄入單科成績
          </button>
        </div>
      `;
    } else {
      items.forEach(m => {
        const subObj = CONSTANTS.SUBJECTS.find(s => s.id === m.subject) || { name: m.subject, color: '#3B82F6' };
        const notObj = CONSTANTS.CAP_NOTATIONS.find(n => n.notation === m.notation) || { color: '#3B82F6' };

        html += `
          <div class="mobile-exam-card p-3.5 rounded-lg border border-border bg-card shadow-sm space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="subject-pill font-bold" style="border-left-color: ${subObj.color};">${subObj.name}</span>
                <span class="text-3xs font-mono text-muted">${m.date}</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold border font-mono" style="color: ${notObj.color}; background: ${notObj.color}15; border-color: ${notObj.color}40;">
                ${m.notation || 'B'} (${m.standardPoints || 4} 點)
              </span>
            </div>

            <div class="font-bold text-sm text-primary">${m.title || '單科模擬測驗'}</div>
            ${m.scope ? `<div class="text-3xs text-secondary">${m.scope}</div>` : ''}

            <div class="grid grid-cols-2 gap-2 p-2 rounded bg-surface/80 text-xs font-mono">
              <div>
                <span class="text-3xs text-muted block">答對題數 / 率</span>
                <b class="text-primary">${m.rawCorrect !== undefined ? m.rawCorrect : '-'}</b> / ${m.totalItems || '-'} (${m.rate || 0}%)
              </div>
              <div>
                <span class="text-3xs text-muted block">加權/實得分</span>
                <b class="text-primary-blue text-sm">${m.weightedScore !== undefined ? m.weightedScore : '-'}</b>
              </div>
            </div>

            ${m.blindspot ? `
              <div class="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-2xs text-warning flex items-start gap-1.5">
                <i data-lucide="lightbulb" class="w-3.5 h-3.5 shrink-0 text-warning mt-0.5"></i>
                <div class="min-w-0 font-medium">${m.blindspot}</div>
              </div>
            ` : ''}

            <div class="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
              <button class="btn-secondary text-2xs py-1 px-2 text-rose-400 border-rose-500/30" onclick="App.openAddMistakeModal(null, { examId: '${m.id}', examType: 'mini_mock', date: '${m.date}', subject: '${m.subject}', title: '${m.title}' })">
                <i data-lucide="plus" class="w-3 h-3 inline mr-0.5"></i>收錄錯題
              </button>
              <div class="flex items-center gap-2">
                <button class="btn-secondary text-2xs py-1 px-2" onclick="App.openMiniMockModal('${m.id}')">
                  <i data-lucide="edit-2" class="w-3 h-3 inline mr-1"></i>編輯
                </button>
                <button class="btn-danger-outline text-2xs py-1 px-2" onclick="App.deleteItem('miniMocks', '${m.id}')">
                  <i data-lucide="trash-2" class="w-3 h-3 inline mr-1"></i>刪除
                </button>
              </div>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  onSearch(query) {
    this.searchQuery = query;
    App.refreshCurrentView();
  },

  onFilterSubject(subject) {
    this.selectedSubject = subject;
    App.refreshCurrentView();
  },

  onFilterStatus(status) {
    this.selectedFilter = status;
    App.refreshCurrentView();
  },

  toggleSort(col) {
    if (this.currentSort.column === col) {
      this.currentSort.order = this.currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.column = col;
      this.currentSort.order = 'desc';
    }
    App.refreshCurrentView();
  },

  getSortIcon(col) {
    if (this.currentSort.column !== col) return '<i data-lucide="chevrons-up-down" class="w-3 h-3 inline text-muted"></i>';
    return this.currentSort.order === 'asc' 
      ? '<i data-lucide="chevron-up" class="w-3.5 h-3.5 inline text-primary-blue"></i>' 
      : '<i data-lucide="chevron-down" class="w-3.5 h-3.5 inline text-primary-blue"></i>';
  }
};
