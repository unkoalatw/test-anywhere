// 飛書多維表格視圖引擎 - 戰情儀表板視圖 (Analytics Dashboard Component)
const BitableDashboard = {
  currentQuizTrendSub: 'ALL',

  renderDashboard(containerId, data = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { mockExams = [], quizzes = [], termExams = [], targetSchools = [], settings = {} } = data;

    // 取得最新一場模考與運算指標
    const sortedMocks = [...mockExams].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestMock = sortedMocks[0];
    const district = settings.district || 'KEELUNG_TAIPEI';
    const latestMetrics = latestMock ? ScoringEngine.calculateMockMetrics(latestMock, district) : null;

    // 第一志願目標學校比對
    const primaryTargetId = (settings.targetSchools && settings.targetSchools[0]) || 'sch_1';
    const primaryTarget = targetSchools.find(s => s.id === primaryTargetId) || targetSchools[0];
    const targetDiag = latestMetrics && primaryTarget ? ScoringEngine.diagnoseTargetSchool(latestMetrics, primaryTarget) : null;

    // 取得診斷提分策略清單
    const strategies = latestMock ? ScoringEngine.generateActionableStrategies(latestMock, quizzes, primaryTarget) : [];

    // 計算穩定 A++ 與弱點考科
    const stableAplusPlus = [];
    const vulnerableSubs = [];

    if (latestMock && latestMock.subjects) {
      Object.keys(latestMock.subjects).forEach(k => {
        if (k === 'WRITING') return;
        const sub = latestMock.subjects[k];
        const subObj = CONSTANTS.CAP_SUBJECTS.find(s => s.id === k) || { name: k };
        if (sub.notation === 'A++') stableAplusPlus.push(subObj.name);
        else if (sub.notation && (sub.notation.startsWith('B') || sub.notation === 'C')) vulnerableSubs.push(subObj.name);
      });
    }

    // 小考待強化 (得分率 < 70%) 筆數
    const redFlagCount = quizzes.filter(q => ((q.score || 0) / (q.maxScore || 100)) < 0.7).length;

    let html = `
      <div class="dashboard-wrapper space-y-6">
        <!-- 頂部戰情核心 KPI 總覽卡片列 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <!-- KPI 1: 最新會考組合標示 -->
          <div class="stat-card">
            <div class="flex items-center justify-between text-muted mb-2">
              <span class="text-xs font-medium">最新會考組合標示</span>
              <i data-lucide="award" class="w-4 h-4 text-primary-blue"></i>
            </div>
            <div class="text-2xl font-black font-mono text-primary mb-1">
              ${latestMetrics ? latestMetrics.summaryTier : '尚未錄入'}
            </div>
            <div class="text-2xs text-muted flex items-center gap-1.5">
              <span class="badge-success-subtle font-mono">${latestMetrics ? `${latestMetrics.countA}A ${latestMetrics.countPlus}+` : '-'}</span>
              <span>•</span>
              <span class="truncate">${latestMock ? latestMock.title.replace(/114學年度\s*/, '') : '-'}</span>
            </div>
          </div>

          <!-- KPI 2: 當前總積點 (考區換算) -->
          <div class="stat-card">
            <div class="flex items-center justify-between text-muted mb-2">
              <span class="text-xs font-medium">會考總積點 (${district === 'CENTRAL_TAIWAN' ? '中投區' : '基北區'})</span>
              <i data-lucide="zap" class="w-4 h-4 text-warning"></i>
            </div>
            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-2xl font-black font-mono text-warning">
                ${latestMetrics ? latestMetrics.totalPoints : 0}
              </span>
              <span class="text-xs text-muted font-mono">/ ${district === 'CENTRAL_TAIWAN' ? '111 點' : '36 點'}</span>
            </div>
            <div class="text-2xs text-muted">
              總積分：<b class="text-secondary font-mono">${latestMetrics ? latestMetrics.totalCredits : 0} 分</b>
            </div>
          </div>

          <!-- KPI 3: 第一志願落點差距 -->
          <div class="stat-card">
            <div class="flex items-center justify-between text-muted mb-2">
              <span class="text-xs font-medium">第一志願落點差距</span>
              <i data-lucide="compass" class="w-4 h-4 text-success"></i>
            </div>
            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-2xl font-black font-mono" style="color: ${targetDiag ? targetDiag.statusColor : '#9CA3AF'};">
                ${targetDiag ? (targetDiag.delta > 0 ? `+${targetDiag.delta}` : targetDiag.delta) : '-'} 點
              </span>
              <span class="text-xs font-bold" style="color: ${targetDiag ? targetDiag.statusColor : '#9CA3AF'};">
                ${targetDiag ? targetDiag.statusText : ''}
              </span>
            </div>
            <div class="text-2xs text-muted truncate">
              目標：<b class="text-secondary">${primaryTarget ? (primaryTarget.shortName || primaryTarget.name) : '尚未設定'}</b> (${primaryTarget ? primaryTarget.cutoffPoints : 0}點)
            </div>
          </div>

          <!-- KPI 4: 弱點單元與瓶頸預警 -->
          <div class="stat-card">
            <div class="flex items-center justify-between text-muted mb-2">
              <span class="text-xs font-medium">學習漏洞待強化</span>
              <i data-lucide="alert-triangle" class="w-4 h-4 text-danger"></i>
            </div>
            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-2xl font-black font-mono ${redFlagCount > 0 ? 'text-danger' : 'text-success'}">
                ${redFlagCount}
              </span>
              <span class="text-xs text-muted">個小考單元 (&lt;70%)</span>
            </div>
            <div class="text-2xs text-muted truncate">
              穩定 A++：<b class="text-success">${stableAplusPlus.length > 0 ? stableAplusPlus.join(', ') : '無'}</b>
            </div>
          </div>

        </div>

        <!-- 志願落點與雷達差距診斷區塊 -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- 目標高中落點門檻比對卡片 -->
          <div class="dashboard-card lg:col-span-1 flex flex-col justify-between">
            <div>
              <div class="card-header flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <i data-lucide="school" class="w-4 h-4 text-primary-blue"></i>
                  <h3 class="font-bold text-sm text-primary">目標高中志願落點診斷</h3>
                </div>
                <button class="text-xs text-primary-blue hover:underline" onclick="App.openTargetSchoolsModal()">
                  設定志願
                </button>
              </div>

              <div class="target-schools-list space-y-3">
      `;

      // 渲染前 3 個目標志願
      const activeTargets = (settings.targetSchools || ['sch_1', 'sch_3', 'sch_6']).map(id => targetSchools.find(s => s.id === id)).filter(Boolean);
      
      if (activeTargets.length === 0) {
        html += `<div class="text-xs text-muted py-4 text-center">尚未設定目標學校</div>`;
      } else {
        activeTargets.forEach((sch, index) => {
          const diag = latestMetrics ? ScoringEngine.diagnoseTargetSchool(latestMetrics, sch) : null;
          html += `
            <div class="target-item-card p-3 rounded-lg border border-border bg-card/60">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2">
                  <span class="rank-circle text-xs font-bold">${index + 1}</span>
                  <span class="font-bold text-sm text-primary">${sch.shortName || sch.name}</span>
                </div>
                <span class="status-pill text-xs font-bold" style="background: ${diag ? diag.statusColor : '#6B7280'}20; color: ${diag ? diag.statusColor : '#9CA3AF'};">
                  ${diag ? diag.statusText : '-'}
                </span>
              </div>
              <div class="flex items-center justify-between text-2xs text-muted">
                <span>門檻：<b class="font-mono text-secondary">${sch.cutoffPoints} 點</b> (${sch.targetTierSummary || '5A'})</span>
                <span>當前差距：<b class="font-mono font-bold" style="color: ${diag ? diag.statusColor : '#9CA3AF'};">${diag ? (diag.delta >= 0 ? `+${diag.delta}` : diag.delta) : '-'} 點</b></span>
              </div>
            </div>
          `;
        });
      }

      html += `
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-border/50 text-2xs text-muted flex items-center justify-between">
              <span>考區採計：${CONSTANTS.DISTRICT_MODELS.find(d => d.id === district)?.name.split(' ')[0] || '基北區'}</span>
              <span class="text-success font-bold font-mono">最新考點 ${latestMetrics ? latestMetrics.totalPoints : 0} 點</span>
            </div>
          </div>

          <!-- 各科達標差距雷達圖 -->
          <div class="dashboard-card lg:col-span-2">
            <div class="card-header flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <i data-lucide="radar" class="w-4 h-4 text-warning"></i>
                <h3 class="font-bold text-sm text-primary">五大考科目標差距雷達圖</h3>
              </div>
              <span class="text-xs text-muted">基準志願：${primaryTarget ? (primaryTarget.shortName || primaryTarget.name) : '第一志願'}</span>
            </div>
            <div class="chart-container" style="height: 260px; position: relative;">
              <canvas id="chart-radar-gap"></canvas>
            </div>
          </div>

        </div>

        <!-- 歷次模擬考積點走勢圖 & 小考單元進步折線圖 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <!-- 圖表 1: 模考積點走勢折線圖 -->
          <div class="dashboard-card">
            <div class="card-header flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <i data-lucide="trending-up" class="w-4 h-4 text-success"></i>
                <h3 class="font-bold text-sm text-primary">歷次模考積點跨越走勢</h3>
              </div>
              <span class="text-xs text-muted">對照志願門檻線</span>
            </div>
            <div class="chart-container" style="height: 250px; position: relative;">
              <canvas id="chart-mock-trajectory"></canvas>
            </div>
          </div>

          <!-- 圖表 2: 小考單元掌握度與進步曲線 (含科目篩選) -->
          <div class="dashboard-card">
            <div class="card-header flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <i data-lucide="line-chart" class="w-4 h-4 text-primary-purple"></i>
                <h3 class="font-bold text-sm text-primary">小考單元得分率進步軌跡</h3>
              </div>
              <select id="select-quiz-trend-sub" class="select-sm" onchange="BitableDashboard.onQuizTrendSubjectChange(this.value)">
                <option value="ALL" ${this.currentQuizTrendSub === 'ALL' ? 'selected' : ''}>全部科目</option>
                ${CONSTANTS.SUBJECTS.map(s => `<option value="${s.id}" ${this.currentQuizTrendSub === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="chart-container" style="height: 250px; position: relative;">
              <canvas id="chart-quiz-trend"></canvas>
            </div>
          </div>

        </div>

        <!-- 智慧弱點診斷與提分策略引擎輸出 -->
        <div class="dashboard-card">
          <div class="card-header flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <i data-lucide="sparkles" class="w-4 h-4 text-warning"></i>
              <h3 class="font-bold text-sm text-primary">智慧弱點診斷與提分衝刺策略</h3>
            </div>
            <span class="text-xs text-muted">基於模考錯題細項與小考掌握度交叉推導</span>
          </div>

          <div class="strategies-grid grid grid-cols-1 md:grid-cols-2 gap-4">
      `;

      if (strategies.length === 0) {
        html += `<div class="col-span-2 text-center py-6 text-xs text-muted">目前表現優異，無迫切提分預警！</div>`;
      } else {
        strategies.forEach(st => {
          html += `
            <div class="strategy-card p-4 rounded-lg border border-border bg-card/40 hover:bg-card/70 transition-colors">
              <div class="flex items-start gap-3">
                <div class="strategy-icon-box p-2.5 rounded-md bg-primary-blue/10 text-primary-blue">
                  <i data-lucide="${st.icon || 'lightbulb'}" class="w-5 h-5"></i>
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between mb-1">
                    <h4 class="font-bold text-sm text-primary">${st.title}</h4>
                    <span class="badge-${st.severity === 'high' ? 'danger' : 'warning'}-subtle text-3xs font-mono uppercase">
                      ${st.severity === 'high' ? '關鍵突破' : '提分推薦'}
                    </span>
                  </div>
                  <p class="text-xs text-secondary mb-2">${st.description}</p>
                  <div class="strategy-action p-2 rounded bg-surface/80 border border-border/60 text-xs text-primary-blue font-medium">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5 inline mr-1 text-success"></i>${st.actionPlan}
                  </div>
                </div>
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>

      </div>
    `;

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // 延遲渲染圖表確保 Canvas 已在 DOM 中就緒
    setTimeout(() => {
      ChartEngine.renderMockTrajectoryChart('chart-mock-trajectory', mockExams, activeTargets);
      ChartEngine.renderTargetGapRadarChart('chart-radar-gap', latestMock, primaryTarget);
      ChartEngine.renderQuizUnitTrendChart('chart-quiz-trend', quizzes, this.currentQuizTrendSub);
    }, 50);
  },

  onQuizTrendSubjectChange(subId) {
    this.currentQuizTrendSub = subId;
    App.refreshCurrentView();
  }
};
