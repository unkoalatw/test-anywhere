// 飛書多維表格視圖引擎 - 看板視圖 (Kanban View Component)
const BitableKanban = {
  kanbanMode: 'quizzes', // 'quizzes' or 'mock_subjects'

  renderKanban(containerId, quizzes = [], mockExams = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (this.kanbanMode === 'quizzes') {
      this.renderQuizKanban(container, quizzes);
    } else {
      this.renderMockSubjectKanban(container, mockExams);
    }
  },

  setMode(mode) {
    this.kanbanMode = mode;
    App.refreshCurrentView();
  },

  /**
   * 渲染小考單元掌握度看板 (依得分率分為 精熟/基礎/待加強)
   */
  renderQuizKanban(container, quizzes) {
    const cols = {
      mastery: { title: '完全精熟 (85% ~ 100%)', icon: 'check-circle-2', color: '#10B981', items: [] },
      basic: { title: '基礎良好 (70% ~ 84%)', icon: 'circle-dot', color: '#3B82F6', items: [] },
      needsReview: { title: '待強化複習 (< 70% Red Flag)', icon: 'alert-triangle', color: '#EF4444', items: [] }
    };

    quizzes.forEach(q => {
      const max = q.maxScore || 100;
      const rate = ((q.score || 0) / max) * 100;
      if (rate >= 85) cols.mastery.items.push(q);
      else if (rate >= 70) cols.basic.items.push(q);
      else cols.needsReview.items.push(q);
    });

    let html = `
      <!-- 各科掌握度堆疊分佈長條圖 (Stacked Bar Chart) -->
      <div class="dashboard-card p-4 mb-5">
        <div class="card-header flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <i data-lucide="bar-chart-3" class="w-4 h-4 text-success"></i>
            <h3 class="font-bold text-xs text-primary">各科單元掌握度堆疊分佈 (長條圖)</h3>
          </div>
          <span class="text-3xs text-muted">精熟 vs 基礎 vs 待加強</span>
        </div>
        <div class="chart-container" style="height: 180px; position: relative;">
          <canvas id="kanban-chart-mastery-stack"></canvas>
        </div>
      </div>

      <div class="kanban-toolbar mb-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">看板分組依據：</span>
          <button class="tab-btn ${this.kanbanMode === 'quizzes' ? 'active' : ''}" onclick="BitableKanban.setMode('quizzes')">
            <i data-lucide="list-checks" class="w-3.5 h-3.5 inline mr-1"></i>小考單元掌握度
          </button>
          <button class="tab-btn ${this.kanbanMode === 'mock_subjects' ? 'active' : ''}" onclick="BitableKanban.setMode('mock_subjects')">
            <i data-lucide="target" class="w-3.5 h-3.5 inline mr-1"></i>模考科目標示掌握
          </button>
        </div>
        <div class="text-xs text-muted">共 ${quizzes.length} 個評量單元</div>
      </div>

      <div class="kanban-grid grid grid-cols-1 md:grid-cols-3 gap-4">
    `;

    Object.keys(cols).forEach(key => {
      const col = cols[key];
      html += `
        <div class="kanban-column" style="border-top: 3px solid ${col.color};">
          <div class="kanban-col-header flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <i data-lucide="${col.icon}" class="w-4 h-4" style="color: ${col.color};"></i>
              <h3 class="font-bold text-sm text-primary">${col.title}</h3>
            </div>
            <span class="kanban-counter font-mono text-xs" style="background: ${col.color}20; color: ${col.color};">
              ${col.items.length}
            </span>
          </div>

          <div class="kanban-cards-stack space-y-2.5">
      `;

      if (col.items.length === 0) {
        html += `<div class="kanban-empty text-center py-8 text-xs text-muted">此分類目前無卡片</div>`;
      } else {
        col.items.forEach(item => {
          const subObj = CONSTANTS.SUBJECTS.find(s => s.id === item.subject) || { name: item.subject, color: '#3B82F6' };
          const max = item.maxScore || 100;
          const rate = Math.round(((item.score || 0) / max) * 100);

          const tagsHtml = (item.errorTags || []).map(tId => {
            const tag = CONSTANTS.ERROR_TAGS.find(t => t.id === tId) || { name: tId, color: '#6B7280' };
            return `<span class="tag-badge-sm" style="color: ${tag.color}; background: ${tag.color}15;">${tag.name}</span>`;
          }).join(' ');

          html += `
            <div class="kanban-card group">
              <div class="flex items-center justify-between mb-1.5">
                <span class="subject-pill-sm" style="color: ${subObj.color};">${subObj.name}</span>
                <span class="font-mono text-xs font-bold ${rate < 70 ? 'text-danger' : rate >= 85 ? 'text-success' : 'text-primary-blue'}">
                  ${item.score} / ${max} (${rate}%)
                </span>
              </div>
              <div class="kanban-card-title text-sm font-medium text-primary mb-1">
                ${item.unitName}
              </div>
              ${tagsHtml ? `<div class="flex flex-wrap gap-1 mb-2">${tagsHtml}</div>` : ''}
              <div class="flex items-center justify-between pt-2 border-t border-border/50 text-2xs text-muted">
                <span class="font-mono">${item.date}</span>
                <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                  <button class="text-secondary hover:text-primary mr-1.5" onclick="App.openQuizModal('${item.id}')">
                    <i data-lucide="edit-2" class="w-3 h-3 inline"></i>
                  </button>
                  <button class="text-danger hover:text-red-400" onclick="App.deleteItem('quizzes', '${item.id}')">
                    <i data-lucide="trash-2" class="w-3 h-3 inline"></i>
                  </button>
                </div>
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      ChartEngine.renderKanbanMasteryStackedBar('kanban-chart-mastery-stack', quizzes);
    }, 50);
  },

  /**
   * 渲染模考考科等級掌握看板
   */
  renderMockSubjectKanban(container, mockExams) {
    if (mockExams.length === 0) {
      container.innerHTML = `<div class="empty-state text-center py-12 text-muted">尚無模擬考紀錄</div>`;
      return;
    }

    // 取得最新一場模考
    const sorted = [...mockExams].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = sorted[0];
    const subjects = latest.subjects || {};

    const cols = {
      mastery: { title: '精熟等級 (A++ / A+ / A)', icon: 'check-circle-2', color: '#10B981', items: [] },
      basic: { title: '基礎良好 (B++ / B+)', icon: 'circle-dot', color: '#3B82F6', items: [] },
      needsReview: { title: '基礎普通 / 待加強 (B / C)', icon: 'alert-triangle', color: '#EF4444', items: [] }
    };

    ['CHINESE', 'ENGLISH', 'MATH', 'SOCIAL', 'SCIENCE'].forEach(k => {
      const sub = subjects[k] || { notation: 'B' };
      const subObj = CONSTANTS.CAP_SUBJECTS.find(s => s.id === k) || { name: k };
      const not = sub.notation || 'B';
      const itemData = { key: k, name: subObj.name, notation: not, detail: sub, examTitle: latest.title };

      if (not.startsWith('A')) cols.mastery.items.push(itemData);
      else if (not === 'B++' || not === 'B+') cols.basic.items.push(itemData);
      else cols.needsReview.items.push(itemData);
    });

    let html = `
      <div class="kanban-toolbar mb-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xs text-muted">看板分組依據：</span>
          <button class="tab-btn" onclick="BitableKanban.setMode('quizzes')">
            <i data-lucide="list-checks" class="w-3.5 h-3.5 inline mr-1"></i>小考單元掌握度
          </button>
          <button class="tab-btn active" onclick="BitableKanban.setMode('mock_subjects')">
            <i data-lucide="target" class="w-3.5 h-3.5 inline mr-1"></i>模考科目標示掌握
          </button>
        </div>
        <div class="text-xs text-secondary">基準模考：${latest.title} (${latest.date})</div>
      </div>

      <div class="kanban-grid grid grid-cols-1 md:grid-cols-3 gap-4">
    `;

    Object.keys(cols).forEach(key => {
      const col = cols[key];
      html += `
        <div class="kanban-column" style="border-top: 3px solid ${col.color};">
          <div class="kanban-col-header flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <i data-lucide="${col.icon}" class="w-4 h-4" style="color: ${col.color};"></i>
              <h3 class="font-bold text-sm text-primary">${col.title}</h3>
            </div>
            <span class="kanban-counter font-mono text-xs" style="background: ${col.color}20; color: ${col.color};">
              ${col.items.length} 科
            </span>
          </div>

          <div class="kanban-cards-stack space-y-2.5">
      `;

      if (col.items.length === 0) {
        html += `<div class="kanban-empty text-center py-8 text-xs text-muted">此等級無考科</div>`;
      } else {
        col.items.forEach(item => {
          html += `
            <div class="kanban-card">
              <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-sm text-primary">${item.name}</span>
                <span class="cap-tier-badge font-bold" style="background: ${col.color}20; color: ${col.color}; border: 1px solid ${col.color}40;">
                  ${item.notation}
                </span>
              </div>
              <div class="text-xs text-muted space-y-1">
                ${item.detail.weightedScore ? `<div>加權得分：<b class="text-primary font-mono">${item.detail.weightedScore} 分</b></div>` : ''}
                ${item.detail.rawCorrect !== undefined ? `<div>答對題數：<b class="text-secondary font-mono">${item.detail.rawCorrect} 題</b></div>` : ''}
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }
};
