// 飛書多維表格視圖引擎 - 錯題筆記畫廊視圖 (Gallery View Component)
const BitableGallery = {
  selectedTag: 'ALL',
  selectedStatus: 'ALL',
  selectedSubject: 'ALL',

  renderGallery(containerId, quizzes = [], onEdit, onDelete) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let items = [...quizzes];

    // 篩選
    if (this.selectedSubject !== 'ALL') {
      items = items.filter(q => q.subject === this.selectedSubject);
    }
    if (this.selectedStatus !== 'ALL') {
      items = items.filter(q => q.correctionStatus === this.selectedStatus);
    }
    if (this.selectedTag !== 'ALL') {
      items = items.filter(q => Array.isArray(q.errorTags) && q.errorTags.includes(this.selectedTag));
    }

    // 依日期遞減排序
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = `
      <!-- 錯題視覺化統計分佈：圓餅圖 (歸因佔比) + 柱狀直方圖 (分科頻率) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="dashboard-card p-3.5">
          <div class="card-header flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <i data-lucide="pie-chart" class="w-4 h-4 text-warning"></i>
              <h3 class="font-bold text-xs text-primary">錯題盲點歸因佔比 (圓餅圖)</h3>
            </div>
            <span class="text-3xs text-muted">歸因分析</span>
          </div>
          <div class="chart-container" style="height: 180px; position: relative;">
            <canvas id="gallery-chart-error-pie"></canvas>
          </div>
        </div>

        <div class="dashboard-card p-3.5">
          <div class="card-header flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <i data-lucide="bar-chart-2" class="w-4 h-4 text-primary-blue"></i>
              <h3 class="font-bold text-xs text-primary">各科錯題與標記頻率 (直方長條圖)</h3>
            </div>
            <span class="text-3xs text-muted">弱點科目定位</span>
          </div>
          <div class="chart-container" style="height: 180px; position: relative;">
            <canvas id="gallery-chart-subject-errors"></canvas>
          </div>
        </div>
      </div>

      <div class="gallery-toolbar mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <!-- 科目過濾 -->
          <select class="select-sm" onchange="BitableGallery.onFilterChange('subject', this.value)">
            <option value="ALL" ${this.selectedSubject === 'ALL' ? 'selected' : ''}>所有考科</option>
            ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${this.selectedSubject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>

          <!-- 訂正狀態過濾 -->
          <select class="select-sm" onchange="BitableGallery.onFilterChange('status', this.value)">
            <option value="ALL" ${this.selectedStatus === 'ALL' ? 'selected' : ''}>全部訂正狀態</option>
            <option value="need_help" ${this.selectedStatus === 'need_help' ? 'selected' : ''}>需請教老師</option>
            <option value="uncorrected" ${this.selectedStatus === 'uncorrected' ? 'selected' : ''}>未訂正</option>
            <option value="corrected" ${this.selectedStatus === 'corrected' ? 'selected' : ''}>已訂正</option>
          </select>

          <!-- 錯題標籤過濾 -->
          <select class="select-sm" onchange="BitableGallery.onFilterChange('tag', this.value)">
            <option value="ALL" ${this.selectedTag === 'ALL' ? 'selected' : ''}>全部錯題歸因標籤</option>
            ${CONSTANTS.ERROR_TAGS.map(t => `<option value="${t.id}" ${this.selectedTag === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>

        <div class="text-xs text-muted">
          共 <b class="text-secondary font-mono">${items.length}</b> 則錯題複習筆記
        </div>
      </div>

      <div class="gallery-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    `;

    if (items.length === 0) {
      html += `
        <div class="col-span-full empty-state py-12 text-center">
          <i data-lucide="book-open-check" class="w-12 h-12 text-muted mb-3 mx-auto"></i>
          <p class="text-secondary text-sm">無符合篩選條件的錯題筆記</p>
        </div>
      `;
    } else {
      items.forEach(item => {
        const subObj = CONSTANTS.SUBJECTS.find(s => s.id === item.subject) || { name: item.subject, color: '#3B82F6' };
        const max = item.maxScore || 100;
        const rate = Math.round(((item.score || 0) / max) * 100);
        const isRedFlag = rate < 70;

        const tagsHtml = (item.errorTags || []).map(tId => {
          const tag = CONSTANTS.ERROR_TAGS.find(t => t.id === tId) || { name: tId, color: '#6B7280' };
          return `<span class="tag-badge" style="color: ${tag.color}; background: ${tag.color}15; border-color: ${tag.color}40;">${tag.name}</span>`;
        }).join(' ');

        const statusMap = {
          'corrected': { text: '已訂正完成', class: 'badge-success', icon: 'check-circle-2' },
          'need_help': { text: '需向老師請教', class: 'badge-warning', icon: 'help-circle' },
          'uncorrected': { text: '尚未訂正', class: 'badge-danger', icon: 'alert-circle' }
        };
        const status = statusMap[item.correctionStatus] || statusMap.corrected;

        html += `
          <div class="gallery-card p-4 rounded-lg border border-border bg-card hover:border-primary-blue/40 transition-all flex flex-col justify-between">
            <div>
              <!-- 頂部資訊 -->
              <div class="flex items-center justify-between mb-2">
                <span class="subject-pill" style="border-left-color: ${subObj.color};">${subObj.name}</span>
                <span class="font-mono text-xs font-bold ${isRedFlag ? 'text-danger' : 'text-primary'}">
                  ${item.score} / ${max} 分 (${rate}%)
                </span>
              </div>

              <!-- 單元名稱 -->
              <h4 class="font-bold text-sm text-primary mb-1.5 line-clamp-1" title="${item.unitName}">
                ${item.unitName}
              </h4>

              <!-- 錯題歸因標籤 -->
              <div class="flex flex-wrap gap-1.5 mb-3">
                ${tagsHtml || '<span class="text-3xs text-muted">無歸因標籤</span>'}
              </div>

              <!-- 筆記內文區塊 -->
              <div class="gallery-note-box p-2.5 rounded bg-surface/80 border border-border/50 text-xs text-secondary mb-3 min-h-[60px]">
                ${item.notes ? item.notes : '<span class="text-muted italic">無詳細筆記內容...</span>'}
              </div>
            </div>

            <!-- 底部狀態切換與操作列 -->
            <div class="flex items-center justify-between pt-2.5 border-t border-border/40 text-xs">
              <!-- 快速切換訂正狀態下拉 -->
              <select class="select-2xs" onchange="App.updateQuizStatus('${item.id}', this.value)">
                <option value="corrected" ${item.correctionStatus === 'corrected' ? 'selected' : ''}>✅ 已訂正</option>
                <option value="need_help" ${item.correctionStatus === 'need_help' ? 'selected' : ''}>❓ 需請教</option>
                <option value="uncorrected" ${item.correctionStatus === 'uncorrected' ? 'selected' : ''}>❌ 未訂正</option>
              </select>

              <div class="action-btn-group">
                <button class="btn-icon" title="編輯" onclick="App.openQuizModal('${item.id}')">
                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                </button>
                <button class="btn-icon text-danger" title="刪除" onclick="App.deleteItem('quizzes', '${item.id}')">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
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

    setTimeout(() => {
      ChartEngine.renderErrorTagsBreakdownChart('gallery-chart-error-pie', quizzes);
      ChartEngine.renderSubjectErrorFrequencyBarChart('gallery-chart-subject-errors', quizzes);
    }, 50);
  },

  onFilterChange(type, value) {
    if (type === 'subject') this.selectedSubject = value;
    if (type === 'status') this.selectedStatus = value;
    if (type === 'tag') this.selectedTag = value;
    App.refreshCurrentView();
  }
};
