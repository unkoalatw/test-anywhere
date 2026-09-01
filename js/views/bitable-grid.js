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

    // 1. 桌面端表格 (Hidden on mobile)
    html += `
      <div class="table-responsive hidden md:block">
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

    // 2. 手機版卡片流 (Visible on mobile md:hidden)
    html += `<div class="mobile-quiz-cards md:hidden space-y-3">`;

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
          ${exam.notes ? `<div class="term-notes mt-2.5 text-xs text-muted"><i data-lucide="file-text" class="w-3.5 h-3.5 inline mr-1 text-secondary"></i>${exam.notes}</div>` : ''}
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
      <div class="table-responsive hidden md:block">
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
              <th class="text-right">總積分</th>
              <th class="text-center w-20">操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    sorted.forEach(exam => {
      const metrics = ScoringEngine.calculateMockMetrics(exam, currentDistrict);
      const sub = exam.subjects || {};

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

          <!-- 總積分 -->
          <td class="text-right font-mono text-secondary">${metrics.totalCredits} 分</td>

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

    // 2. 手機版模考卡片流 (Mobile Card List)
    html += `<div class="mobile-mock-cards md:hidden space-y-3">`;

    sorted.forEach(exam => {
      const metrics = ScoringEngine.calculateMockMetrics(exam, currentDistrict);
      const sub = exam.subjects || {};

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
