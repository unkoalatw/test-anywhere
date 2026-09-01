// 國中教育會考計分與診斷運算引擎 (CAP Scoring & Diagnostic Engine)
const ScoringEngine = {
  /**
   * 計算英語加權分數
   * @param {number} readingCorrect 閱讀答對題數
   * @param {number} readingTotal 閱讀總題數 (預設 43)
   * @param {number} listeningCorrect 聽力答對題數
   * @param {number} listeningTotal 聽力總題數 (預設 21)
   * @returns {number} 英語加權分數 (滿分 100, 四捨五入至小數第二位)
   */
  calcEnglishWeightedScore(readingCorrect, readingTotal = 43, listeningCorrect, listeningTotal = 21) {
    if (readingCorrect === undefined || readingCorrect === null || listeningCorrect === undefined || listeningCorrect === null) {
      return null;
    }
    const rScore = (Math.max(0, Math.min(readingCorrect, readingTotal)) / readingTotal) * 80;
    const lScore = (Math.max(0, Math.min(listeningCorrect, listeningTotal)) / listeningTotal) * 20;
    return Math.round((rScore + lScore) * 100) / 100;
  },

  /**
   * 計算數學加權分數
   * @param {number} choiceCorrect 選擇答對題數
   * @param {number} choiceTotal 選擇總題數 (預設 25)
   * @param {number} nonChoiceScore 非選實得分數 (0~6)
   * @param {number} nonChoiceMax 非選滿分 (預設 6)
   * @returns {number} 數學加權分數 (滿分 100, 四捨五入至小數第二位)
   */
  calcMathWeightedScore(choiceCorrect, choiceTotal = 25, nonChoiceScore, nonChoiceMax = 6) {
    if (choiceCorrect === undefined || choiceCorrect === null || nonChoiceScore === undefined || nonChoiceScore === null) {
      return null;
    }
    const cScore = (Math.max(0, Math.min(choiceCorrect, choiceTotal)) / choiceTotal) * 85;
    const ncScore = (Math.max(0, Math.min(nonChoiceScore, nonChoiceMax)) / nonChoiceMax) * 15;
    return Math.round((cScore + ncScore) * 100) / 100;
  },

  /**
   * 取得等級標示的數值權重 (7: A++, 6: A+, 5: A, 4: B++, 3: B+, 2: B, 1: C)
   * @param {string} notation 等級標示
   * @returns {number}
   */
  getNotationRank(notation) {
    const map = { 'A++': 7, 'A+': 6, 'A': 5, 'B++': 4, 'B+': 3, 'B': 2, 'C': 1 };
    return map[notation] || 0;
  },

  /**
   * 取得各考區超額比序單科順位
   */
  getTieBreakingOrder(district = 'KEELUNG_TAIPEI') {
    if (district === 'CENTRAL_TAIWAN') {
      return [
        { code: 'CHINESE', name: '國文' },
        { code: 'ENGLISH', name: '英語' },
        { code: 'MATH', name: '數學' },
        { code: 'SCIENCE', name: '自然' },
        { code: 'SOCIAL', name: '社會' },
        { code: 'WRITING', name: '寫作' }
      ];
    }
    // 預設基北區比序：國 ➔ 數 ➔ 英 ➔ 社 ➔ 自 ➔ 寫作
    return [
      { code: 'CHINESE', name: '國文' },
      { code: 'MATH', name: '數學' },
      { code: 'ENGLISH', name: '英語' },
      { code: 'SOCIAL', name: '社會' },
      { code: 'SCIENCE', name: '自然' },
      { code: 'WRITING', name: '寫作' }
    ];
  },

  /**
   * 計算非侵入式「升級臨界微提示」（差幾題升下一等級）
   * @param {string} subjectCode 
   * @param {Object} subData 
   * @returns {Object|null}
   */
  getLevelJumpHint(subjectCode, subData = {}) {
    const notation = subData.notation || 'B';
    if (notation === 'A++') return { isMax: true, text: '已達最高標 A++' };

    // 英語科微透視
    if (subjectCode === 'ENGLISH') {
      const rWrong = subData.readingTotal && subData.readingCorrect !== undefined ? (subData.readingTotal - subData.readingCorrect) : null;
      if (notation === 'A+' && rWrong && rWrong <= 2) {
        return { target: 'A++', text: `閱讀再 +1 題 ➔ A++`, isHighROI: false };
      }
      if (notation === 'B++') {
        return { target: 'A', text: `加權差 1~2 題 ➔ 晉升 A 級`, isHighROI: true };
      }
    }

    // 數學科微透視
    if (subjectCode === 'MATH') {
      const nc = subData.nonChoiceScore !== undefined ? subData.nonChoiceScore : null;
      if (notation === 'B++') {
        return { target: 'A', text: nc !== null && nc < 4 ? `非選步驟多拿 2 分 ➔ 晉升 A` : `選擇再 +1 題 ➔ 晉升 A`, isHighROI: true };
      }
      if (notation === 'A+') {
        return { target: 'A++', text: nc !== null && nc < 5 ? `非選 +1 分 ➔ A++` : `選擇 +1 題 ➔ A++`, isHighROI: false };
      }
    }

    // 國文/社會/自然通用估算
    if (notation === 'A+') return { target: 'A++', text: `再對 1~2 題 ➔ A++`, isHighROI: false };
    if (notation === 'B++') return { target: 'A', text: `再對 1~2 題 ➔ 跨入 A 精熟`, isHighROI: true };
    if (notation === 'B+') return { target: 'B++', text: `再對 2~3 題 ➔ B++`, isHighROI: false };
    if (notation === 'B') return { target: 'B+', text: `再對 2~3 題 ➔ B+`, isHighROI: false };
    if (notation === 'C') return { target: 'B', text: `掌握基礎概念題 ➔ 跨過 B 門檻`, isHighROI: true };

    return null;
  },

  /**
   * 評估考區同分超額比序優勢度
   * @param {Object} mockExam 
   * @param {string} district 
   * @returns {Object}
   */
  evaluateTieBreakingAdvantage(mockExam, district = 'KEELUNG_TAIPEI') {
    if (!mockExam || !mockExam.subjects) return null;
    const order = this.getTieBreakingOrder(district);
    const top1 = order[0]; // 國文
    const top2 = order[1]; // 數學 (基北) 或 英語 (中投)

    const not1 = (mockExam.subjects[top1.code] && mockExam.subjects[top1.code].notation) || 'B';
    const not2 = (mockExam.subjects[top2.code] && mockExam.subjects[top2.code].notation) || 'B';

    const rank1 = this.getNotationRank(not1);
    const rank2 = this.getNotationRank(not2);

    let strength = 'NORMAL';
    let text = '比序平穩';
    let badgeClass = 'text-secondary';

    if (rank1 >= 6 && rank2 >= 6) {
      strength = 'VERY_STRONG';
      text = `同分比序極具優勢 (${top1.name}${not1} • ${top2.name}${not2})`;
      badgeClass = 'text-success';
    } else if (rank1 >= 6 || rank2 >= 6) {
      strength = 'STRONG';
      text = `比序優勢 (${rank1 >= 6 ? top1.name : top2.name} 穩固)`;
      badgeClass = 'text-primary-blue';
    } else if (rank1 <= 3 || rank2 <= 3) {
      strength = 'VULNERABLE';
      text = `比序前段守備留意 (${top1.name}${not1} • ${top2.name}${not2})`;
      badgeClass = 'text-warning';
    }

    return { strength, text, badgeClass, topSubjects: [top1, top2] };
  },

  /**
   * 計算單一模擬考的完整計分指標 (含各考區總分、總積點、會考標籤)
   * @param {Object} mockExam 模擬考物件
   * @param {string} district 考區代碼 ('KEELUNG_TAIPEI', 'CENTRAL_TAIWAN', 'KAOHSIUNG', 'GENERAL_TIER')
   * @returns {Object} 完整運算結果
   */
  calculateMockMetrics(mockExam, district = 'KEELUNG_TAIPEI') {
    if (!mockExam) {
      return {
        summaryTier: '尚未錄入',
        totalPoints: 0,
        totalCredits: 0,
        countA: 0,
        countB: 0,
        countC: 0,
        countPlus: 0,
        subjectDetail: {},
        rankEstimate: this.estimateKeelungTaipeiRank(0)
      };
    }

    let subjects = mockExam.subjects || {};
    if (typeof subjects === 'string') {
      try { subjects = JSON.parse(subjects); } catch (e) { subjects = {}; }
    }
    const subCodes = ['CHINESE', 'ENGLISH', 'MATH', 'SOCIAL', 'SCIENCE'];

    let countA = 0;
    let countB = 0;
    let countC = 0;
    let countPlus = 0;
    let standardPointsSum = 0;
    let creditsSum = 0;
    let districtPointsSum = 0;

    const subjectDetail = {};

    subCodes.forEach(code => {
      const sub = subjects[code] || {};
      const notation = sub.notation || 'B';
      const rank = this.getNotationRank(notation);

      // 統計 A/B/C 與 + 數
      if (notation.startsWith('A')) {
        countA++;
        if (notation === 'A++') countPlus += 2;
        if (notation === 'A+') countPlus += 1;
      } else if (notation.startsWith('B')) {
        countB++;
        if (notation === 'B++') countPlus += 2;
        if (notation === 'B+') countPlus += 1;
      } else if (notation === 'C') {
        countC++;
      }

      // 標準積點 (基北區 7~1 點)
      const stdPoints = rank;
      // 標準積分 (A:6, B:4, C:2)
      const stdCredits = notation.startsWith('A') ? 6 : notation.startsWith('B') ? 4 : 2;

      standardPointsSum += stdPoints;
      creditsSum += stdCredits;

      // 考區專屬積點計算
      if (district === 'CENTRAL_TAIWAN') {
        // 中投區 A++=21, A+=18, A=15, B++=12, B+=9, B=6, C=3
        districtPointsSum += rank * 3;
      } else {
        // 基北區 / 高雄區
        districtPointsSum += rank;
      }

      subjectDetail[code] = {
        notation,
        rank,
        standardPoints: stdPoints,
        credits: stdCredits
      };
    });

    // 寫作測驗處理
    const writing = subjects.WRITING || {};
    const writingGrade = writing.isExempt ? 0 : (writing.grade !== undefined && writing.grade !== null ? Number(writing.grade) : 0);
    const writingConfig = CONSTANTS.WRITING_GRADES.find(g => g.grade === writingGrade) || { pointsKeelungTaipei: 0, creditsKeelungTaipei: 0, pointsCentral: 0 };

    let totalPoints = 0;
    let totalCredits = 0;

    if (district === 'CENTRAL_TAIWAN') {
      totalPoints = districtPointsSum + writingConfig.pointsCentral; // 滿分 111 點
      totalCredits = creditsSum; // 滿分 30 分
    } else if (district === 'KEELUNG_TAIPEI') {
      totalPoints = Math.round((districtPointsSum + writingConfig.pointsKeelungTaipei) * 10) / 10; // 滿分 36 點
      totalCredits = creditsSum + writingConfig.creditsKeelungTaipei; // 滿分 31~36 分
    } else {
      // 高雄區 / 通用
      totalPoints = districtPointsSum;
      totalCredits = creditsSum;
    }

    // 格式化標準標記：如 "5A 8+ (作 5 級分)"
    let summaryTier = '';
    if (countA > 0) summaryTier += `${countA}A`;
    if (countB > 0) summaryTier += `${countB}B`;
    if (countC > 0) summaryTier += `${countC}C`;
    if (countPlus > 0) summaryTier += ` ${countPlus}+`;
    if (writingGrade !== null && !writing.isExempt) {
      summaryTier += ` (作 ${writingGrade} 級分)`;
    }

    // 北北基會考/全模高仿真考區排名與市排名運算
    const rankEstimate = this.estimateKeelungTaipeiRank(totalPoints, countA, countPlus, writingGrade, mockExam.manualRank);

    return {
      summaryTier,
      countA,
      countB,
      countC,
      countPlus,
      totalPoints,
      totalCredits,
      writingGrade,
      subjectDetail,
      district,
      rankEstimate
    };
  },

  /**
   * 北北基 (基北區) 會考/模擬考常模常態分佈排名仿真估算
   * 基準常模：基北區總考生約 63,000 人 (台北市 ~21,500人, 新北市 ~36,500人, 基隆市 ~5,000人)
   */
  estimateKeelungTaipeiRank(totalPoints, countA, countPlus, writingGrade = 5, manualRank = null) {
    if (manualRank && manualRank.districtRank) {
      const dRank = parseInt(manualRank.districtRank);
      const pr = Math.round((1 - (dRank / 63000)) * 1000) / 10;
      return {
        isManual: true,
        districtRankRange: `第 ${dRank.toLocaleString()} 名`,
        districtRankMedian: dRank,
        districtPR: `PR ${Math.max(1, Math.min(99.9, pr))}`,
        cityRankTaipei: `北市約第 ${Math.round(dRank * 0.45).toLocaleString()} 名`,
        cityRankNewTaipei: `新北約第 ${Math.round(dRank * 0.50).toLocaleString()} 名`,
        percentileText: `前 ${(dRank / 63000 * 100).toFixed(1)}%`,
        targetTierText: this.getSchoolTierByPoints(totalPoints)
      };
    }

    let minRank = 1, maxRank = 200, pr = 99.8, tpeMin = 1, tpeMax = 110, ntpMin = 1, ntpMax = 80;

    if (totalPoints >= 35.8) {
      minRank = 1; maxRank = 350; pr = 99.6;
      tpeMin = 1; tpeMax = 200; ntpMin = 1; ntpMax = 130;
    } else if (totalPoints >= 34.8) {
      minRank = 351; maxRank = 850; pr = 99.0;
      tpeMin = 201; tpeMax = 510; ntpMin = 131; ntpMax = 310;
    } else if (totalPoints >= 33.8) {
      minRank = 851; maxRank = 1650; pr = 97.8;
      tpeMin = 511; tpeMax = 990; ntpMin = 311; ntpMax = 610;
    } else if (totalPoints >= 32.8) {
      minRank = 1651; maxRank = 2750; pr = 96.0;
      tpeMin = 991; tpeMax = 1650; ntpMin = 611; ntpMax = 1010;
    } else if (totalPoints >= 31.8) {
      minRank = 2751; maxRank = 4100; pr = 94.0;
      tpeMin = 1651; tpeMax = 2450; ntpMin = 1011; ntpMax = 1520;
    } else if (totalPoints >= 30.6) {
      minRank = 4101; maxRank = 5800; pr = 91.5;
      tpeMin = 2451; tpeMax = 3450; ntpMin = 1521; ntpMax = 2150;
    } else if (totalPoints >= 28.6) {
      minRank = 5801; maxRank = 8600; pr = 87.5;
      tpeMin = 3451; tpeMax = 5100; ntpMin = 2151; ntpMax = 3200;
    } else if (totalPoints >= 25.6) {
      minRank = 8601; maxRank = 13800; pr = 80.0;
      tpeMin = 5101; tpeMax = 8200; ntpMin = 3201; ntpMax = 5100;
    } else if (totalPoints >= 22.6) {
      minRank = 13801; maxRank = 21500; pr = 68.0;
      tpeMin = 8201; tpeMax = 12800; ntpMin = 5101; ntpMax = 8000;
    } else if (totalPoints >= 18.6) {
      minRank = 21501; maxRank = 31000; pr = 54.0;
      tpeMin = 12801; tpeMax = 18500; ntpMin = 8001; ntpMax = 11500;
    } else if (totalPoints >= 14.6) {
      minRank = 31001; maxRank = 43000; pr = 38.0;
      tpeMin = 18501; tpeMax = 25500; ntpMin = 11501; ntpMax = 16000;
    } else {
      minRank = 43001; maxRank = 62000; pr = 20.0;
      tpeMin = 25501; tpeMax = 37000; ntpMin = 16001; ntpMax = 23000;
    }

    const median = Math.round((minRank + maxRank) / 2);
    const pct = ((median / 63000) * 100).toFixed(1);

    return {
      isManual: false,
      districtRankRange: `約第 ${minRank.toLocaleString()} ~ ${maxRank.toLocaleString()} 名`,
      districtRankMedian: median,
      districtPR: `PR ${pr.toFixed(1)}`,
      cityRankTaipei: `北市估約 ${tpeMin.toLocaleString()} ~ ${tpeMax.toLocaleString()} 名`,
      cityRankNewTaipei: `新北估約 ${ntpMin.toLocaleString()} ~ ${ntpMax.toLocaleString()} 名`,
      percentileText: `全基北區前 ${pct}%`,
      targetTierText: this.getSchoolTierByPoints(totalPoints)
    };
  },

  getSchoolTierByPoints(points) {
    if (points >= 34.6) return '第一志願群 (建中 / 北一女 / 師大附中)';
    if (points >= 32.8) return '頂尖名校群 (成功 / 中山 / 松山)';
    if (points >= 30.6) return '前段公立高中 (市立大同 / 政大附中)';
    if (points >= 27.6) return '指標公立高中 (大直 / 板橋 / 麗山 / 和平)';
    if (points >= 23.6) return '優質社區高中 (內湖 / 海山 / 中和 / 新莊)';
    if (points >= 19.6) return '公立高中 / 熱門國立高職 (永春 / 百齡 / 陽明)';
    if (points >= 14.6) return '公立高中職 (育成 / 華江 / 三民 / 清水)';
    return '多元進路評估';
  },

  /**
   * 目標志願落點診斷 (計算與目標高中門檻差距 Δ)
   * @param {Object} metrics 本次模考計算指標
   * @param {Object} targetSchool 目標高中資料物件
   * @returns {Object} 診斷結果
   */
  diagnoseTargetSchool(metrics, targetSchool) {
    if (!targetSchool) return null;

    const currentPoints = metrics.totalPoints;
    const cutoffPoints = targetSchool.cutoffPoints;
    const delta = Math.round((currentPoints - cutoffPoints) * 10) / 10;

    let status = 'COMPETITIVE'; // SAFE, COMPETITIVE, HIGH_RISK
    let statusText = '落點競爭區間';
    let statusColor = '#F59E0B'; // Warning yellow

    if (delta >= 0.8) {
      status = 'SAFE';
      statusText = '穩健達標 (安全區)';
      statusColor = '#10B981'; // Green
    } else if (delta < -0.8) {
      status = 'HIGH_RISK';
      statusText = '尚未達標 (待衝刺)';
      statusColor = '#EF4444'; // Red
    }

    // 各科標準差距
    const subjectGaps = {};
    let subWarningCount = 0;

    if (targetSchool.subjectTargets) {
      Object.keys(targetSchool.subjectTargets).forEach(subCode => {
        const targetNotation = targetSchool.subjectTargets[subCode];
        if (subCode === 'WRITING') {
          const targetW = Number(targetNotation);
          const currentW = metrics.writingGrade;
          subjectGaps[subCode] = {
            target: `${targetW} 級分`,
            current: `${currentW} 級分`,
            isMet: currentW >= targetW,
            diff: currentW - targetW
          };
          if (currentW < targetW) subWarningCount++;
        } else {
          const targetRank = this.getNotationRank(targetNotation);
          const currentDetail = metrics.subjectDetail[subCode] || { rank: 0, notation: 'C' };
          const currentRank = currentDetail.rank;
          const isMet = currentRank >= targetRank;
          if (!isMet) subWarningCount++;

          subjectGaps[subCode] = {
            target: targetNotation,
            current: currentDetail.notation,
            targetRank,
            currentRank,
            isMet,
            rankDiff: currentRank - targetRank
          };
        }
      });
    }

    return {
      schoolId: targetSchool.id,
      schoolName: targetSchool.name,
      shortName: targetSchool.shortName,
      cutoffPoints,
      currentPoints,
      delta,
      status,
      statusText,
      statusColor,
      subjectGaps,
      subWarningCount
    };
  },

  /**
   * 智慧弱點診斷與提分策略引擎
   * 針對模考與日常小考單元交叉分析，輸出精準提分建議
   * @param {Object} latestMock 最近一次模考
   * @param {Array} allQuizzes 所有小考紀錄
   * @param {Object} targetSchool 第一志願目標學校
   * @returns {Array} 診斷提分策略清單
   */
  generateActionableStrategies(latestMock, allQuizzes = [], targetSchool = null) {
    const strategies = [];
    if (!latestMock) return strategies;

    const subjects = latestMock.subjects || {};

    // 1. 英語科閱讀/聽力提分分析
    const eng = subjects.ENGLISH;
    if (eng && eng.readingCorrect !== undefined && eng.listeningCorrect !== undefined) {
      if (eng.notation !== 'A++') {
        const rWrong = (eng.readingTotal || 43) - eng.readingCorrect;
        const lWrong = (eng.listeningTotal || 21) - eng.listeningCorrect;
        
        if (eng.notation === 'B++' || eng.notation === 'A+') {
          strategies.push({
            subject: 'ENGLISH',
            title: `英語科瓶頸突破 (${eng.notation} ➔ ${eng.notation === 'B++' ? 'A' : 'A++'})`,
            type: 'quick_jump',
            severity: 'high',
            description: `目前英語加權分數 ${eng.weightedScore} 分（閱讀錯 ${rWrong} 題，聽力錯 ${lWrong} 題）。`,
            actionPlan: `再多對 1~2 題閱讀（加權佔 80%）即可跨過等級門檻！建議加強長篇圖表克漏字與推論題題幹關鍵字抓取。`,
            icon: 'languages'
          });
        }
      }
    }

    // 2. 數學科非選/選擇提分分析
    const math = subjects.MATH;
    if (math && math.choiceCorrect !== undefined && math.nonChoiceScore !== undefined) {
      if (math.notation !== 'A++') {
        const cWrong = (math.choiceTotal || 25) - math.choiceCorrect;
        const ncScore = math.nonChoiceScore;

        if (ncScore < 5) {
          strategies.push({
            subject: 'MATH',
            title: '數學非選擇題分數提升關鍵',
            type: 'high_roi',
            severity: 'high',
            description: `非選得分為 ${ncScore}/6 分。會考非選 1 分相當於選擇題近 1.5 題加權！`,
            actionPlan: `非選步驟分掌握：每題列出已知條件、幾何幾何輔助線推導步驟，即使最後計算有誤亦可獲取 2~4 分步驟分。`,
            icon: 'calculator'
          });
        } else if (cWrong > 2) {
          strategies.push({
            subject: 'MATH',
            title: '數學選擇題失分防漏',
            type: 'accuracy',
            severity: 'medium',
            description: `選擇題錯 ${cWrong} 題。`,
            actionPlan: `建議在歷次模擬考中劃分「前 15 題基礎秒殺區」與「後 10 題素養題」，確保前 15 題 0 粗心失分。`,
            icon: 'calculator'
          });
        }
      }
    }

    // 3. 社會科/自然科細項錯題歸納分析
    ['SOCIAL', 'SCIENCE'].forEach(code => {
      const sub = subjects[code];
      if (sub && sub.errorBreakdown) {
        const eb = sub.errorBreakdown;
        let maxErrSub = '';
        let maxCount = 0;
        Object.keys(eb).forEach(k => {
          if (eb[k] > maxCount) {
            maxCount = eb[k];
            maxErrSub = k;
          }
        });

        if (maxCount >= 2) {
          const subObj = CONSTANTS.SUBJECTS.find(s => s.id === maxErrSub) || { name: maxErrSub };
          strategies.push({
            subject: code,
            title: `${sub.notation} ${code === 'SOCIAL' ? '社會科' : '自然科'} 拖累子科：【${subObj.name}】`,
            type: 'weak_sub',
            severity: 'medium',
            description: `在本次模考中，${subObj.name} 單科貢獻了 ${maxCount} 題錯題，為主要失分核心。`,
            actionPlan: `建議鎖定 ${subObj.name} 之常考觀念單元進行地毯式錯題重練，可快速拉升大考總答對題數。`,
            icon: code === 'SOCIAL' ? 'compass' : 'atom'
          });
        }
      }
    });

    // 4. 小考單元掌握度低於 70% 之 Red Flag (待強化單元)
    const redFlagQuizzes = allQuizzes.filter(q => (q.score / (q.maxScore || 100)) < 0.7);
    if (redFlagQuizzes.length > 0) {
      const groupedBySub = {};
      redFlagQuizzes.forEach(q => {
        groupedBySub[q.subject] = (groupedBySub[q.subject] || 0) + 1;
      });

      const topWeakSub = Object.keys(groupedBySub).sort((a, b) => groupedBySub[b] - groupedBySub[a])[0];
      const weakSubObj = CONSTANTS.SUBJECTS.find(s => s.id === topWeakSub) || { name: topWeakSub };

      strategies.push({
        subject: topWeakSub,
        title: `小考章節漏洞預警：${weakSubObj.name} (累計 ${groupedBySub[topWeakSub]} 次未達 70%)`,
        type: 'unit_gap',
        severity: 'high',
        description: `平常隨堂小考在 ${weakSubObj.name} 多個單元掌握度偏低，若不加強將直接反映在大範圍會考題。`,
        actionPlan: `查看多維表格「錯題筆記畫廊」或看板「待加強複習」，依單元標籤進行二度補測。`,
        icon: 'alert-triangle'
      });
    }

    // 5. 寫作測驗
    const writing = subjects.WRITING || {};
    if (!writing.isExempt && writing.grade < 5) {
      strategies.push({
        subject: 'WRITING',
        title: '寫作測驗 5 級分衝刺',
        type: 'writing_upgrade',
        severity: 'medium',
        description: `當前作文為 ${writing.grade || 4} 級分。在基北區與中投區超額比序中，作文級分為關鍵決勝分。`,
        actionPlan: `段落四段式佈局：破題引導 ➔ 個人生命經驗具體事例 ➔ 轉折思辨反思 ➔ 昇華總結。每週限時 50 分鐘手寫一篇。`,
        icon: 'pen-tool'
      });
    }

    return strategies;
  }
};
