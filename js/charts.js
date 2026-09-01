// 學業成績視覺化圖表引擎 (Chart.js Dark Minimalist Theme Integration)
const ChartEngine = {
  chartInstances: {},

  // 深色主題通用色彩配置
  theme: {
    textColor: '#9CA3AF',
    textMuted: '#6B7280',
    gridColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif',
    primaryBlue: '#3B82F6',
    primaryPurple: '#6366F1',
    successGreen: '#10B981',
    warningYellow: '#F59E0B',
    dangerRed: '#EF4444'
  },

  // 銷毀指定或所有舊圖表實例
  destroyChart(key) {
    if (this.chartInstances[key]) {
      this.chartInstances[key].destroy();
      delete this.chartInstances[key];
    }
  },

  destroyAll() {
    Object.keys(this.chartInstances).forEach(k => this.destroyChart(k));
  },

  /**
   * 1. 歷次模擬考積點走勢折線圖 (含目標高中門檻基準輔助線)
   */
  renderMockTrajectoryChart(canvasId, mockExams = [], targetSchools = []) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // 依日期遞增排序
    const sorted = [...mockExams].sort((a, b) => new Date(a.date) - new Date(b.date));
    const labels = sorted.map(m => m.scope || m.title.replace(/114學年度\s*/, ''));
    
    // 計算每次模考積點
    const pointsData = sorted.map(m => {
      const metrics = ScoringEngine.calculateMockMetrics(m, m.district || 'KEELUNG_TAIPEI');
      return metrics.totalPoints;
    });

    const datasets = [
      {
        label: '本次模考實得總積點',
        data: pointsData,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderWidth: 3,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.35,
        fill: true
      }
    ];

    // 加入第 1 與第 2 目標志願基準輔助線
    if (targetSchools && targetSchools.length > 0) {
      const sch1 = targetSchools[0];
      if (sch1 && sch1.cutoffPoints) {
        datasets.push({
          label: `目標1：${sch1.shortName || sch1.name} (${sch1.cutoffPoints} 點)`,
          data: Array(labels.length).fill(sch1.cutoffPoints),
          borderColor: '#F59E0B',
          borderWidth: 2,
          borderDash: [6, 6],
          pointRadius: 0,
          fill: false
        });
      }

      if (targetSchools.length > 1) {
        const sch2 = targetSchools[1];
        if (sch2 && sch2.cutoffPoints) {
          datasets.push({
            label: `目標2：${sch2.shortName || sch2.name} (${sch2.cutoffPoints} 點)`,
            data: Array(labels.length).fill(sch2.cutoffPoints),
            borderColor: '#3B82F6',
            borderWidth: 2,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
          });
        }
      }
    }

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: this.theme.textColor, font: { family: this.theme.fontFamily, size: 12 }, usePointStyle: true, boxWidth: 8 }
          },
          tooltip: {
            backgroundColor: '#1E222D',
            titleColor: '#F3F4F6',
            bodyColor: '#D1D5DB',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            usePointStyle: true
          }
        },
        scales: {
          x: {
            grid: { color: this.theme.gridColor },
            ticks: { color: this.theme.textColor, font: { family: this.theme.fontFamily } }
          },
          y: {
            grid: { color: this.theme.gridColor },
            ticks: { color: this.theme.textColor, font: { family: this.theme.fontFamily } },
            suggestedMin: 20,
            suggestedMax: 36
          }
        }
      }
    });
  },

  /**
   * 2. 各科達標差距雷達圖 (當前成績 vs 目標高中標準)
   */
  renderTargetGapRadarChart(canvasId, latestMock, targetSchool) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const subKeys = ['CHINESE', 'ENGLISH', 'MATH', 'SOCIAL', 'SCIENCE'];
    const labels = ['國文', '英文', '數學', '社會', '自然'];
    
    // 轉換數值 (7: A++, 6: A+, 5: A, 4: B++, 3: B+, 2: B, 1: C)
    const currentRanks = subKeys.map(k => {
      if (!latestMock || !latestMock.subjects) return 0;
      const sub = latestMock.subjects[k] || {};
      return ScoringEngine.getNotationRank(sub.notation || 'B');
    });

    const targetRanks = subKeys.map(k => {
      if (!targetSchool || !targetSchool.subjectTargets) return 6; // 預設 A+
      const targetNot = targetSchool.subjectTargets[k] || 'A';
      return ScoringEngine.getNotationRank(targetNot);
    });

    const rankToLabel = (val) => {
      const map = { 7: 'A++', 6: 'A+', 5: 'A', 4: 'B++', 3: 'B+', 2: 'B', 1: 'C' };
      return map[val] || '';
    };

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: `目標門檻 (${targetSchool ? targetSchool.shortName : '第一志願'})`,
            data: targetRanks,
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            borderWidth: 2,
            pointBackgroundColor: '#F59E0B',
            pointRadius: 4
          },
          {
            label: '本次模考實得分級',
            data: currentRanks,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.25)',
            borderWidth: 2.5,
            pointBackgroundColor: '#3B82F6',
            pointBorderColor: '#FFFFFF',
            pointRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: this.theme.textColor, font: { family: this.theme.fontFamily, size: 12 }, usePointStyle: true }
          },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${rankToLabel(item.raw)} (${item.raw}點)`
            }
          }
        },
        scales: {
          r: {
            min: 0,
            max: 7,
            ticks: {
              stepSize: 1,
              display: false
            },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
            pointLabels: {
              color: '#F3F4F6',
              font: { family: this.theme.fontFamily, size: 13, weight: 'bold' }
            }
          }
        }
      }
    });
  },

  /**
   * 3. 小考單元掌握度與複習進步折線圖 (支援依科目篩選與二次進步曲線)
   */
  renderQuizUnitTrendChart(canvasId, quizzes = [], selectedSubject = 'ALL') {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    let filtered = [...quizzes];
    if (selectedSubject !== 'ALL') {
      filtered = filtered.filter(q => q.subject === selectedSubject);
    }
    
    // 依測驗日期排序
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = filtered.map(q => {
      const shortUnit = q.unitName ? (q.unitName.length > 12 ? q.unitName.substring(0, 10) + '...' : q.unitName) : q.date;
      return `${q.date.substring(5)} ${shortUnit}`;
    });

    const rates = filtered.map(q => {
      const max = q.maxScore || 100;
      return Math.round(((q.score || 0) / max) * 100);
    });

    // 依得分率動態上色 (<70% 為警示紅, >=85% 綠, 其他藍)
    const pointColors = rates.map(r => r < 70 ? '#EF4444' : r >= 85 ? '#10B981' : '#3B82F6');

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '單元得分率 (%)',
            data: rates,
            borderColor: '#6366F1',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            borderWidth: 2.5,
            pointBackgroundColor: pointColors,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 1.5,
            pointRadius: 6,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: true
          },
          {
            label: '待強化門檻 (70%)',
            data: Array(labels.length).fill(70),
            borderColor: 'rgba(239, 68, 68, 0.6)',
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: this.theme.textColor, font: { family: this.theme.fontFamily, size: 12 }, usePointStyle: true }
          },
          tooltip: {
            backgroundColor: '#1E222D',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            callbacks: {
              afterLabel: (ctx) => {
                const item = filtered[ctx.dataIndex];
                let info = `得分: ${item.score}/${item.maxScore || 100} 分 (${item.quizType})`;
                if (item.correctionStatus) {
                  const statusMap = { 'corrected': '已訂正', 'need_help': '需向老師請教', 'uncorrected': '未訂正' };
                  info += `\n訂正: ${statusMap[item.correctionStatus] || item.correctionStatus}`;
                }
                return info;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: this.theme.gridColor },
            ticks: { color: this.theme.textColor, maxRotation: 45, minRotation: 20 }
          },
          y: {
            grid: { color: this.theme.gridColor },
            ticks: { color: this.theme.textColor },
            suggestedMin: 40,
            max: 100
          }
        }
      }
    });
  },

  /**
   * 4. 定期段考指標四位一體水平對比圖 (個人得分 vs 班平均 vs 高標 vs 低標)
   */
  renderTermExamComparisonChart(canvasId, termExam) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || !termExam || !termExam.subjects) return;

    const subjects = termExam.subjects;
    const activeSubKeys = Object.keys(subjects).filter(k => subjects[k] && subjects[k].score !== undefined);

    const labels = activeSubKeys.map(k => {
      const found = CONSTANTS.SUBJECTS.find(s => s.id === k);
      return found ? found.name : k;
    });

    const userScores = activeSubKeys.map(k => subjects[k].score);
    const classAvgs = activeSubKeys.map(k => subjects[k].classAvg !== null ? subjects[k].classAvg : null);
    const highMarks = activeSubKeys.map(k => subjects[k].highBenchmark !== null ? subjects[k].highBenchmark : null);
    const lowMarks = activeSubKeys.map(k => subjects[k].lowBenchmark !== null ? subjects[k].lowBenchmark : null);

    const datasets = [
      {
        label: '個人實得分數',
        data: userScores,
        backgroundColor: '#3B82F6',
        borderRadius: 4,
        barPercentage: 0.7
      }
    ];

    // 只有當至少有一科有班平均時才加入班均圖例
    if (classAvgs.some(v => v !== null)) {
      datasets.push({
        label: '班級平均',
        data: classAvgs,
        backgroundColor: 'rgba(156, 163, 175, 0.4)',
        borderRadius: 4,
        barPercentage: 0.7
      });
    }

    if (highMarks.some(v => v !== null)) {
      datasets.push({
        label: '班級高標',
        data: highMarks,
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderRadius: 4,
        barPercentage: 0.7
      });
    }

    if (lowMarks.some(v => v !== null)) {
      datasets.push({
        label: '班級低標',
        data: lowMarks,
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        borderRadius: 4,
        barPercentage: 0.7
      });
    }

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: this.theme.textColor, font: { family: this.theme.fontFamily, size: 12 }, usePointStyle: true }
          }
        },
        scales: {
          x: {
            grid: { color: this.theme.gridColor },
            ticks: { color: this.theme.textColor }
          },
          y: {
            grid: { color: this.theme.gridColor },
            ticks: { color: this.theme.textColor },
            suggestedMin: 50,
            max: 100
          }
        }
      }
    });
  },

  /**
   * 5. 錯題歸因統計長條/圓餅圖
   */
  renderErrorTagsBreakdownChart(canvasId, quizzes = []) {
    this.destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const tagCounts = {};
    quizzes.forEach(q => {
      if (Array.isArray(q.errorTags)) {
        q.errorTags.forEach(t => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      }
    });

    const tags = CONSTANTS.ERROR_TAGS.map(t => ({
      name: t.name,
      count: tagCounts[t.id] || 0,
      color: t.color
    })).filter(t => t.count > 0);

    tags.sort((a, b) => b.count - a.count);

    if (tags.length === 0) {
      // 若尚無錯題標籤
      tags.push({ name: '尚無錯題標籤紀錄', count: 1, color: '#4B5563' });
    }

    this.chartInstances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: tags.map(t => t.name),
        datasets: [{
          data: tags.map(t => t.count),
          backgroundColor: tags.map(t => t.color),
          borderColor: '#161922',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: this.theme.textColor, font: { family: this.theme.fontFamily, size: 12 }, usePointStyle: true }
          }
        },
        cutout: '65%'
      }
    });
  }
};
