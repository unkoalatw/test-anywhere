// 飛書多維表格視圖引擎 - 全考種錯題收錄與 AI 深度分析畫廊 (Universal Error Bank & AI Diagnostic View)
const BitableGallery = {
  selectedSubject: 'ALL',
  selectedExamType: 'ALL',
  selectedQuestionType: 'ALL',
  selectedMastery: 'ALL',
  selectedTag: 'ALL',
  onlyDueToday: false,

  renderGallery(containerId, data = {}, onEdit, onDelete) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 取得所有收錄錯題 (若無獨立錯題，以小考評量為輔助資料來源)
    let mistakes = Array.isArray(data.mistakes) ? [...data.mistakes] : [];
    
    // 如果目前尚未錄入專屬錯題，但小考有錯題標籤/盲點，自動格式化合成顯示以利無痛銜接
    if (mistakes.length === 0 && Array.isArray(data.quizzes)) {
      mistakes = data.quizzes.filter(q => q.blindspot || (q.errorTags && q.errorTags.length > 0)).map(q => ({
        id: `virtual_${q.id}`,
        examId: q.id,
        examType: 'quiz',
        date: q.date,
        subject: q.subject,
        unitName: q.unitName,
        questionType: 'concept',
        title: `${q.unitName || '小考'} 盲點`,
        questionText: q.notes || '隨堂測驗錯題與觀念盲點',
        studentAnswer: `實得分數: ${q.score}/${q.maxScore || 100}`,
        correctAnswer: '詳見課本單元或向老師請教訂正',
        errorTags: q.errorTags || [],
        masteryLevel: q.correctionStatus === 'corrected' ? 3 : 1,
        blindspot: q.blindspot || '',
        nextReviewDate: q.date
      }));
    }

    // 計算統計數據
    const totalCount = mistakes.length;
    const level1Count = mistakes.filter(m => Number(m.masteryLevel) === 1).length;
    const level2Count = mistakes.filter(m => Number(m.masteryLevel) === 2).length;
    const level3Count = mistakes.filter(m => Number(m.masteryLevel) === 3).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const dueTodayCount = mistakes.filter(m => m.nextReviewDate && m.nextReviewDate <= todayStr && Number(m.masteryLevel) < 3).length;

    // 依篩選條件過濾
    let items = [...mistakes];

    if (this.onlyDueToday) {
      items = items.filter(m => m.nextReviewDate && m.nextReviewDate <= todayStr && Number(m.masteryLevel) < 3);
    }
    if (this.selectedSubject !== 'ALL') {
      items = items.filter(m => m.subject === this.selectedSubject);
    }
    if (this.selectedExamType !== 'ALL') {
      items = items.filter(m => m.examType === this.selectedExamType);
    }
    if (this.selectedQuestionType !== 'ALL') {
      items = items.filter(m => m.questionType === this.selectedQuestionType);
    }
    if (this.selectedMastery !== 'ALL') {
      items = items.filter(m => Number(m.masteryLevel) === Number(this.selectedMastery));
    }
    if (this.selectedTag !== 'ALL') {
      items = items.filter(m => Array.isArray(m.errorTags) && m.errorTags.includes(this.selectedTag));
    }

    // 依日期遞減排序 (未掌握度高的優先置前)
    items.sort((a, b) => {
      if (Number(a.masteryLevel) !== Number(b.masteryLevel)) {
        return Number(a.masteryLevel) - Number(b.masteryLevel);
      }
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    let html = `
      <!-- 頂部統計指標看板 (Mastery KPI & Spaced Repetition) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div class="dashboard-card p-3 flex items-center justify-between border-l-4 border-l-rose-500">
          <div>
            <div class="text-3xs text-muted font-bold uppercase">🔴 需加強 (Level 1)</div>
            <div class="text-lg font-black text-rose-400 font-mono">${level1Count} <span class="text-3xs text-muted font-normal">題</span></div>
          </div>
          <i data-lucide="alert-circle" class="w-5 h-5 text-rose-500/40"></i>
        </div>

        <div class="dashboard-card p-3 flex items-center justify-between border-l-4 border-l-amber-500">
          <div>
            <div class="text-3xs text-muted font-bold uppercase">🟡 複習中 (Level 2)</div>
            <div class="text-lg font-black text-amber-400 font-mono">${level2Count} <span class="text-3xs text-muted font-normal">題</span></div>
          </div>
          <i data-lucide="clock" class="w-5 h-5 text-amber-500/40"></i>
        </div>

        <div class="dashboard-card p-3 flex items-center justify-between border-l-4 border-l-emerald-500">
          <div>
            <div class="text-3xs text-muted font-bold uppercase">🟢 已精通 (Level 3)</div>
            <div class="text-lg font-black text-emerald-400 font-mono">${level3Count} <span class="text-3xs text-muted font-normal">題</span></div>
          </div>
          <i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-500/40"></i>
        </div>

        <div class="dashboard-card p-3 flex items-center justify-between border-l-4 border-l-primary-blue cursor-pointer hover:border-primary-blue/80 transition-colors" onclick="BitableGallery.toggleDueTodayFilter()" title="點擊切換今日待複習清單">
          <div>
            <div class="text-3xs text-muted font-bold uppercase">📅 艾賓浩斯今日待複習</div>
            <div class="text-lg font-black text-primary-blue font-mono">${dueTodayCount} <span class="text-3xs text-muted font-normal">題</span></div>
          </div>
          <i data-lucide="calendar" class="w-5 h-5 text-primary-blue/40"></i>
        </div>
      </div>

      <!-- 錯題視覺化統計圖表：歸因佔比 + 各科錯題頻率 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div class="dashboard-card p-3.5">
          <div class="card-header flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <i data-lucide="pie-chart" class="w-4 h-4 text-warning"></i>
              <h3 class="font-bold text-xs text-primary">錯題盲點歸因佔比 (圓餅圖)</h3>
            </div>
            <span class="text-3xs text-muted">弱點成因分析</span>
          </div>
          <div class="chart-container" style="height: 180px; position: relative;">
            <canvas id="gallery-chart-error-pie"></canvas>
          </div>
        </div>

        <div class="dashboard-card p-3.5">
          <div class="card-header flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <i data-lucide="bar-chart-2" class="w-4 h-4 text-primary-blue"></i>
              <h3 class="font-bold text-xs text-primary">各科錯題與標記頻率 (直方圖)</h3>
            </div>
            <span class="text-3xs text-muted">失分考科定位</span>
          </div>
          <div class="chart-container" style="height: 180px; position: relative;">
            <canvas id="gallery-chart-subject-errors"></canvas>
          </div>
        </div>
      </div>

      <!-- 工具列與 AI 匯出 / 空白重測卷功能列 -->
      <div class="gallery-toolbar mb-4 flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-surface/70 border border-border">
        <div class="flex flex-wrap items-center gap-2">
          <!-- 新增錯題按鈕 -->
          <button class="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm" onclick="App.openAddMistakeModal()">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
            <span>收錄錯題</span>
          </button>

          <!-- 🤖 匯出至 AI 深度分析按鈕 -->
          <button class="btn-secondary text-xs py-1.5 px-3 text-primary-blue border-primary-blue/40 flex items-center gap-1.5 hover:bg-primary-blue/10" onclick="App.openAIExportModal()" title="將目前篩選的錯題打包並複製/下載 AI 名師診斷 Prompt">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
            <span>🤖 AI 深度診斷 & 變形題出題</span>
          </button>

          <!-- 🖨️ 考前空白重刷卷 -->
          <button class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 text-secondary" onclick="ExportImport.printMistakeSheet(BitableGallery.getCurrentFilteredMistakes(), { includeAnswers: false, title: '考前專屬「盲點消滅」二次實戰重測卷' })" title="隱藏答案，列印成考前空白重刷試卷">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
            <span>考前空白重刷卷</span>
          </button>

          <!-- 📑 含解析診斷書 -->
          <button class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 text-secondary hidden sm:inline-flex" onclick="ExportImport.printMistakeSheet(BitableGallery.getCurrentFilteredMistakes(), { includeAnswers: true, title: '學業評量錯題深度解析與盲點診斷書' })" title="列印包含詳解與核心盲點之診斷報告">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            <span>含詳解診斷書</span>
          </button>
        </div>

        <!-- 篩選器群組 -->
        <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <!-- 今日待複習快篩 -->
          <button class="btn-sm text-2xs flex items-center gap-1 ${this.onlyDueToday ? 'btn-primary bg-primary-blue text-white' : 'btn-secondary text-muted'}" onclick="BitableGallery.toggleDueTodayFilter()">
            <i data-lucide="calendar-check" class="w-3 h-3"></i>
            <span>今日待複習 (${dueTodayCount})</span>
          </button>

          <!-- 科目過濾 -->
          <select class="select-sm text-2xs" onchange="BitableGallery.onFilterChange('subject', this.value)">
            <option value="ALL" ${this.selectedSubject === 'ALL' ? 'selected' : ''}>所有考科</option>
            ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${this.selectedSubject === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>

          <!-- 考種過濾 -->
          <select class="select-sm text-2xs" onchange="BitableGallery.onFilterChange('examType', this.value)">
            <option value="ALL" ${this.selectedExamType === 'ALL' ? 'selected' : ''}>所有考試來源</option>
            ${CONSTANTS.EXAM_TYPES.map(e => `<option value="${e.id}" ${this.selectedExamType === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
          </select>

          <!-- 題型過濾 -->
          <select class="select-sm text-2xs" onchange="BitableGallery.onFilterChange('questionType', this.value)">
            <option value="ALL" ${this.selectedQuestionType === 'ALL' ? 'selected' : ''}>全部題目類型</option>
            ${CONSTANTS.QUESTION_TYPES.map(t => `<option value="${t.id}" ${this.selectedQuestionType === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>

          <!-- 掌握度等級過濾 -->
          <select class="select-sm text-2xs" onchange="BitableGallery.onFilterChange('mastery', this.value)">
            <option value="ALL" ${this.selectedMastery === 'ALL' ? 'selected' : ''}>全部掌握度</option>
            <option value="1" ${this.selectedMastery === '1' ? 'selected' : ''}>🔴 需加強 (Level 1)</option>
            <option value="2" ${this.selectedMastery === '2' ? 'selected' : ''}>🟡 複習中 (Level 2)</option>
            <option value="3" ${this.selectedMastery === '3' ? 'selected' : ''}>🟢 已精通 (Level 3)</option>
          </select>
        </div>
      </div>

      <!-- 錯題卡片網格 -->
      <div class="gallery-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    `;

    if (items.length === 0) {
      html += `
        <div class="col-span-full empty-state py-12 text-center bg-surface/30 rounded-lg border border-dashed border-border">
          <i data-lucide="book-open-check" class="w-12 h-12 text-muted mb-3 mx-auto"></i>
          <p class="text-secondary text-sm font-bold">目前無符合條件的錯題紀錄</p>
          <p class="text-muted text-xs mt-1">點擊上方「收錄錯題」按鈕，立即將模擬考、段考或小考中做錯的題目建檔！</p>
          <button class="btn-primary text-xs mt-4 py-1.5 px-4" onclick="App.openAddMistakeModal()">
            <i data-lucide="plus" class="w-3.5 h-3.5 inline mr-1"></i>立即新增第一道錯題
          </button>
        </div>
      `;
    } else {
      items.forEach(item => {
        const subObj = CONSTANTS.SUBJECTS.find(s => s.id === item.subject) || { name: item.subject, color: '#3B82F6' };
        const qTypeObj = CONSTANTS.QUESTION_TYPES.find(t => t.id === item.questionType) || { name: '觀念題', color: '#3B82F6' };
        const examObj = CONSTANTS.EXAM_TYPES.find(e => e.id === item.examType) || { name: '測驗', badgeClass: 'badge-info' };
        
        const mLevel = Number(item.masteryLevel) || 1;
        const masteryObj = CONSTANTS.MASTERY_LEVELS.find(l => l.level === mLevel) || CONSTANTS.MASTERY_LEVELS[0];

        const tagsHtml = (item.errorTags || []).map(tId => {
          const tag = CONSTANTS.ERROR_TAGS.find(t => t.id === tId) || { name: tId, color: '#6B7280' };
          return `<span class="tag-badge text-3xs" style="color: ${tag.color}; background: ${tag.color}15; border-color: ${tag.color}40;">${tag.name}</span>`;
        }).join(' ');

        html += `
          <div class="gallery-card p-4 rounded-lg border border-border bg-card hover:border-primary-blue/40 transition-all flex flex-col justify-between shadow-sm">
            <div>
              <!-- 頂部資訊列：考科、考種與掌握度標籤 -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                  <span class="subject-pill" style="border-left-color: ${subObj.color};">${subObj.name}</span>
                  <span class="text-3xs px-1.5 py-0.5 rounded bg-surface border border-border font-medium text-muted">${examObj.name}</span>
                  <span class="text-3xs px-1.5 py-0.5 rounded bg-primary-blue/10 text-primary-blue border border-primary-blue/30">${qTypeObj.name}</span>
                </div>
                <!-- 點擊一鍵循環切換掌握度 -->
                <button type="button" class="text-3xs font-bold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity" style="background: ${masteryObj.color}15; color: ${masteryObj.color}; border-color: ${masteryObj.color}40;" onclick="App.toggleMistakeMastery('${item.id}')" title="點擊切換掌握度等級 (需加強 ➔ 複習中 ➔ 已精通)">
                  ${masteryObj.badge}
                </button>
              </div>

              <!-- 標題與單元 -->
              <h4 class="font-bold text-sm text-primary mb-1 line-clamp-1" title="${item.title}">
                ${item.title || '錯題紀錄'}
              </h4>
              ${item.unitName ? `<div class="text-3xs text-secondary mb-2 flex items-center gap-1"><i data-lucide="bookmark" class="w-3 h-3 text-primary-blue"></i>${item.unitName}</div>` : ''}

              <!-- 題目題幹內容摘要 -->
              ${item.questionText ? `
                <div class="p-2.5 rounded bg-surface/90 border border-border/60 text-xs text-primary mb-2.5 line-clamp-3 leading-relaxed font-sans" title="${item.questionText}">
                  ${item.questionText.replace(/\n/g, '<br>')}
                </div>
              ` : ''}

              <!-- 學生作答 vs 正確答案 -->
              <div class="grid grid-cols-2 gap-2 mb-2.5 text-2xs">
                <div class="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  <span class="font-bold block text-3xs text-rose-400 mb-0.5">❌ 當時作答/思路：</span>
                  <div class="line-clamp-2">${item.studentAnswer || '未記錄'}</div>
                </div>
                <div class="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <span class="font-bold block text-3xs text-emerald-400 mb-0.5">✅ 標準解法：</span>
                  <div class="line-clamp-2">${item.correctAnswer || '未記錄'}</div>
                </div>
              </div>

              <!-- 錯題歸因標籤 -->
              <div class="flex flex-wrap gap-1 mb-2.5">
                ${tagsHtml || '<span class="text-3xs text-muted">無歸因標籤</span>'}
              </div>

              <!-- 💡 核心觀念盲點高亮區塊 (Spaced Repetition Review Card) -->
              ${item.blindspot ? `
                <div class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs mb-2 flex items-start gap-2">
                  <i data-lucide="lightbulb" class="w-3.5 h-3.5 shrink-0 text-warning mt-0.5"></i>
                  <div class="min-w-0">
                    <div class="text-3xs uppercase font-bold text-warning tracking-wider mb-0.5">💡 核心觀念盲點</div>
                    <div class="text-primary text-2xs font-medium leading-relaxed">${item.blindspot}</div>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- 底部操作列：單題 AI 診斷、編輯與刪除 -->
            <div class="flex items-center justify-between pt-2.5 border-t border-border/40 text-xs mt-2">
              <button class="btn-secondary text-3xs py-1 px-2 text-primary-blue hover:text-white hover:bg-primary-blue transition-colors flex items-center gap-1" onclick="ExportImport.copyAIPromptToClipboard([BitableGallery.getMistakeById('${item.id}')], { title: '${item.title || '單題錯題'}' })" title="複製此題之專屬 AI 診斷與變形題出題 Prompt">
                <i data-lucide="sparkles" class="w-3 h-3"></i>
                <span>單題 AI 分析</span>
              </button>

              <div class="flex items-center gap-1">
                <button class="btn-icon" title="編輯錯題" onclick="App.openAddMistakeModal('${item.id}')">
                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                </button>
                <button class="btn-icon text-danger" title="刪除錯題" onclick="App.deleteMistake('${item.id}')">
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

    // 儲存當前渲染項目供匯出功能使用
    this.currentRenderedItems = items;

    setTimeout(() => {
      ChartEngine.renderErrorTagsBreakdownChart('gallery-chart-error-pie', items);
      ChartEngine.renderSubjectErrorFrequencyBarChart('gallery-chart-subject-errors', items);
    }, 50);
  },

  getCurrentFilteredMistakes() {
    return this.currentRenderedItems || (window.App && App.cachedData && App.cachedData.mistakes) || [];
  },

  getMistakeById(id) {
    const list = (window.App && App.cachedData && App.cachedData.mistakes) || [];
    return list.find(m => m.id === id) || (this.currentRenderedItems && this.currentRenderedItems.find(m => m.id === id)) || null;
  },

  toggleDueTodayFilter() {
    this.onlyDueToday = !this.onlyDueToday;
    App.refreshCurrentView();
  },

  onFilterChange(type, value) {
    if (type === 'subject') this.selectedSubject = value;
    if (type === 'examType') this.selectedExamType = value;
    if (type === 'questionType') this.selectedQuestionType = value;
    if (type === 'mastery') this.selectedMastery = value;
    if (type === 'tag') this.selectedTag = value;
    App.refreshCurrentView();
  }
};

