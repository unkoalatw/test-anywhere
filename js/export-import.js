// 系統資料備份、還原、CSV 同步與 PDF 診斷報表生成模組
const ExportImport = {
  /**
   * 匯出完整 JSON 備份檔案
   */
  async exportJSON() {
    try {
      const data = await DB.exportAllData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `CAP_Academic_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      App.showToast('JSON 完整備份檔案已成功下載！', 'success');
    } catch (err) {
      console.error('Export JSON error:', err);
      App.showToast(`匯出失敗: ${err.message}`, 'danger');
    }
  },

  /**
   * 匯入 JSON 備份檔案
   */
  importJSON(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const parsed = JSON.parse(content);
        
        if (confirm('確定要匯入此備份檔案嗎？現有資料將會被備份檔內容合併/更新。')) {
          await DB.importAllData(parsed);
          App.showToast('備份資料匯入成功！', 'success');
          App.refreshCurrentView();
        }
      } catch (err) {
        console.error('Import JSON error:', err);
        App.showToast(`JSON 解析失敗: ${err.message}`, 'danger');
      }
    };
    reader.readAsText(file);
  },

  /**
   * 匯出 CSV 檔案 (加入 UTF-8 BOM 以免 Excel 開啟亂碼)
   */
  async exportCSV(type = 'quizzes') {
    try {
      let csvContent = '\uFEFF'; // UTF-8 BOM
      const dateStr = new Date().toISOString().slice(0, 10);

      if (type === 'quizzes') {
        const items = await DB.getAll('quizzes');
        const headers = ['測驗日期', '科目代碼', '單元章節名稱', '測驗類型', '實得分數', '滿分標準', '得分率%', '錯題標籤', '訂正狀態', '備註'];
        csvContent += headers.join(',') + '\n';

        items.forEach(q => {
          const max = q.maxScore || 100;
          const rate = Math.round(((q.score || 0) / max) * 100);
          const tags = (q.errorTags || []).join(';');
          const row = [
            q.date,
            q.subject,
            `"${(q.unitName || '').replace(/"/g, '""')}"`,
            `"${(q.quizType || '').replace(/"/g, '""')}"`,
            q.score,
            max,
            rate + '%',
            `"${tags}"`,
            q.correctionStatus || 'corrected',
            `"${(q.notes || '').replace(/"/g, '""')}"`
          ];
          csvContent += row.join(',') + '\n';
        });

        this.downloadBlob(csvContent, `小考評量清單_${dateStr}.csv`, 'text/csv;charset=utf-8;');
      } else if (type === 'mockExams') {
        const items = await DB.getAll('mockExams');
        const headers = ['考次名稱', '測驗日期', '主辦單位', '範圍', '國文等級', '英語等級', '英語加權', '數學等級', '數學加權', '社會等級', '自然等級', '寫作級分', '總標示', '總積點', '總積分', '備註'];
        csvContent += headers.join(',') + '\n';

        items.forEach(m => {
          const metrics = ScoringEngine.calculateMockMetrics(m, m.district || 'KEELUNG_TAIPEI');
          const sub = m.subjects || {};
          const row = [
            `"${(m.title || '').replace(/"/g, '""')}"`,
            m.date,
            `"${(m.organizer || '').replace(/"/g, '""')}"`,
            `"${(m.scope || '').replace(/"/g, '""')}"`,
            (sub.CHINESE && sub.CHINESE.notation) || '',
            (sub.ENGLISH && sub.ENGLISH.notation) || '',
            (sub.ENGLISH && sub.ENGLISH.weightedScore) || '',
            (sub.MATH && sub.MATH.notation) || '',
            (sub.MATH && sub.MATH.weightedScore) || '',
            (sub.SOCIAL && sub.SOCIAL.notation) || '',
            (sub.SCIENCE && sub.SCIENCE.notation) || '',
            (sub.WRITING && sub.WRITING.grade) || 0,
            `"${metrics.summaryTier}"`,
            metrics.totalPoints,
            metrics.totalCredits,
            `"${(m.notes || '').replace(/"/g, '""')}"`
          ];
          csvContent += row.join(',') + '\n';
        });

        this.downloadBlob(csvContent, `國中會考模擬考紀錄_${dateStr}.csv`, 'text/csv;charset=utf-8;');
      }

      App.showToast('CSV 試算表已成功匯出！', 'success');
    } catch (err) {
      console.error('Export CSV error:', err);
      App.showToast(`CSV 匯出失敗: ${err.message}`, 'danger');
    }
  },

  downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * 開啟個人會考升學診斷報告列印視窗
   */
  async printDiagnosticReport() {
    window.print();
  },

  // ========================================================
  // AI 錯題深度診斷、變形題出題 Prompt 生成與匯出引擎
  // ========================================================

  /**
   * 產生針對 LLM (ChatGPT / Claude / Gemini / DeepSeek) 優化之結構化 Markdown Prompt
   * @param {Array} mistakes 錯題物件陣列
   * @param {Object} options 考卷資訊與附加條件
   * @returns {string} 結構化 Markdown 字串
   */
  generateAIMistakePrompt(mistakes = [], options = {}) {
    if (!mistakes || mistakes.length === 0) {
      return '# 錯題清單為空\n請先在系統中新增或收錄該次測驗之錯題。';
    }

    const studentName = (window.Auth && Auth.getCurrentUser()?.studentName) || '考生';
    const examTitle = options.title || '學業評量錯題深度分析';
    const dateStr = options.date || new Date().toISOString().slice(0, 10);
    const subjectName = options.subjectName || '綜合考科';

    let prompt = `# 【國中會考名師專屬診斷】${studentName} 的 ${examTitle} 錯題深度剖析與仿題練習\n\n`;
    prompt += `> **測驗日期**：${dateStr}  \n`;
    prompt += `> **目標考區/科別**：${subjectName}  \n`;
    prompt += `> **錯題總數**：共 ${mistakes.length} 題  \n\n`;

    prompt += `## 🧑‍🏫 指令與角色設定 (System Instruction)\n`;
    prompt += `你是一位精通台灣教育部「國中教育會考（CAP）」命題規範、108課綱核心素養導向、以及各考科（國、英、數、社、自）核心概念的頂尖升學輔導名師與命題專家。\n`;
    prompt += `請依據下方提供的「錯題清單、學生原先錯誤思路、題型與關鍵盲點」，進行深度專業診斷，並依序完成以下 **四大任務**：\n\n`;

    prompt += `### 🎯 請依序輸出四大核心分析：\n`;
    prompt += `1. **【底層盲點深入診斷 (Root Cause Analysis)】**：\n`;
    prompt += `   - 分析學生在各題犯錯的根本認知盲區（例如：是概念定義不清、圖表變因混淆、題意陷阱誘答、還是公式推導未熟？）。\n`;
    prompt += `   - 指出這些錯題之間是否存在「跨題目的共通底層思維漏洞」。\n\n`;

    prompt += `2. **【核心破題關鍵與防陷阱金鑰 (Key Insights & Mnemonics)】**：\n`;
    prompt += `   - 針對每一道錯題，給出 1~2 句直擊核心的「破題直覺、思考流程圖或記憶口訣」，讓學生下一次看到類似題目能在 10 秒內找到解題切入點。\n\n`;

    prompt += `3. **【黃金搶分複習行動計畫 (Action Plan)】**：\n`;
    prompt += `   - 具體列出學生接下來 3 天應優先重讀的「課本章節單元、核心定理/定義、必記圖表實驗」，並給予精準複習順序。\n\n`;

    prompt += `4. **【同概念高仿會考變形題 (3~5 題實戰測驗)】**：\n`;
    prompt += `   - 針對上述暴露的核心盲點，量身設計 **3~5 題同等難度、同核心觀念但不同情境的「全新會考素養題」**。\n`;
    prompt += `   - 每題必須包含：【題目題幹（結合生活情境或圖表描述）】、【四個選項 A/B/C/D】、【標準答案】、【詳細防陷阱解析與命題思維】。\n\n`;

    prompt += `---\n\n`;
    prompt += `## 📋 本次測驗錯題詳細清單 (Question Bank)\n\n`;

    mistakes.forEach((m, idx) => {
      const subObj = CONSTANTS.SUBJECTS.find(s => s.id === m.subject) || { name: m.subject || '考科' };
      const qTypeObj = CONSTANTS.QUESTION_TYPES.find(t => t.id === m.questionType) || { name: m.questionType || '觀念題' };
      const masteryObj = CONSTANTS.MASTERY_LEVELS.find(l => l.level === Number(m.masteryLevel)) || { name: '需加強' };
      const tagsStr = Array.isArray(m.errorTags) && m.errorTags.length > 0 
        ? m.errorTags.map(t => {
            const found = CONSTANTS.ERROR_TAGS.find(tag => tag.id === t);
            return found ? found.name : t;
          }).join('、')
        : '觀念待釐清';

      prompt += `### 第 ${idx + 1} 題：【${subObj.name}】${m.unitName ? `《${m.unitName}》` : ''} - ${m.title || `錯題 #${idx + 1}`}\n`;
      prompt += `- **題目類型**：${qTypeObj.name}\n`;
      prompt += `- **掌握度**：${masteryObj.name}\n`;
      prompt += `- **錯題歸因標籤**：${tagsStr}\n`;
      if (m.questionText) {
        prompt += `- **題目內容/題幹**：\n  \`\`\`\n  ${m.questionText.trim()}\n  \`\`\`\n`;
      }
      if (m.studentAnswer) {
        prompt += `- **學生當時作答/錯誤想法**：${m.studentAnswer}\n`;
      }
      if (m.correctAnswer) {
        prompt += `- **標準答案與正確解法**：${m.correctAnswer}\n`;
      }
      if (m.blindspot) {
        prompt += `- **記錄的觀念盲點/卡關處**：${m.blindspot}\n`;
      }
      prompt += `\n`;
    });

    prompt += `---\n`;
    prompt += `*(請開始您的專業名師診斷與變形題出題)*\n`;

    return prompt;
  },

  /**
   * 一鍵複製 AI 診斷 Prompt 到剪貼簿
   */
  async copyAIPromptToClipboard(mistakes = [], options = {}) {
    try {
      const text = this.generateAIMistakePrompt(mistakes, options);
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      App.showToast('🎉 已成功複製 AI 診斷 Prompt！可直接貼至 ChatGPT / Claude / Gemini 進行深度分析與出題', 'success');
      return true;
    } catch (err) {
      console.error('Copy prompt error:', err);
      App.showToast(`複製失敗: ${err.message}`, 'danger');
      return false;
    }
  },

  /**
   * 下載 AI 診斷 Prompt 為 Markdown (.md) 檔案
   */
  downloadAIMarkdown(mistakes = [], options = {}) {
    const text = this.generateAIMistakePrompt(mistakes, options);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cleanTitle = (options.title || '錯題AI診斷Prompt').replace(/[\s\/\\]/g, '_');
    this.downloadBlob(text, `${cleanTitle}_${dateStr}.md`, 'text/markdown;charset=utf-8;');
    App.showToast('📄 Markdown 檔案已成功下載！', 'success');
  },

  /**
   * 列印 / 產生 PDF 專屬錯題試卷 (支援「考前空白重考卷」與「含詳解診斷卷」雙模式)
   * @param {Array} mistakes 錯題清單
   * @param {Object} options 設定選項 (includeAnswers, title 等)
   */
  printMistakeSheet(mistakes = [], options = {}) {
    if (!mistakes || mistakes.length === 0) {
      App.showToast('目前無錯題可供產生試卷', 'warning');
      return;
    }

    const includeAnswers = Boolean(options.includeAnswers);
    const studentName = (window.Auth && Auth.getCurrentUser()?.studentName) || '考生';
    const title = options.title || (includeAnswers ? '學業評量錯題深度解析與盲點診斷書' : '考前專屬「盲點消滅」二次實戰重測卷');
    const dateStr = options.date || new Date().toISOString().slice(0, 10);

    const printWin = window.open('', '_blank', 'width=900,height=950');
    if (!printWin) {
      App.showToast('瀏覽器已阻擋彈出視窗，請允許彈出視窗以列印試卷', 'danger');
      return;
    }

    let itemsHtml = '';
    mistakes.forEach((m, idx) => {
      const subObj = CONSTANTS.SUBJECTS.find(s => s.id === m.subject) || { name: m.subject || '考科' };
      const qTypeObj = CONSTANTS.QUESTION_TYPES.find(t => t.id === m.questionType) || { name: '觀念題' };
      const tagsStr = Array.isArray(m.errorTags) && m.errorTags.length > 0
        ? m.errorTags.map(t => {
            const found = CONSTANTS.ERROR_TAGS.find(tag => tag.id === t);
            return found ? found.name : t;
          }).join('、')
        : '';

      itemsHtml += `
        <div class="question-box">
          <div class="q-header">
            <span class="q-num">第 ${idx + 1} 題</span>
            <span class="q-badge">${subObj.name}</span>
            ${m.unitName ? `<span class="q-unit">${m.unitName}</span>` : ''}
            <span class="q-type">${qTypeObj.name}</span>
            ${tagsStr ? `<span class="q-tags">盲點：${tagsStr}</span>` : ''}
          </div>

          <div class="q-body">
            <div class="q-title"><b>【${m.title || `題目 #${idx + 1}`}】</b></div>
            <div class="q-text">${(m.questionText || '(未填寫題幹描述，請參照原考卷題目)').replace(/\n/g, '<br>')}</div>
          </div>

          ${!includeAnswers ? `
            <!-- 空白二次作答作答區 (Blank Re-Test Mode) -->
            <div class="q-answer-area">
              <div class="retest-label">✍️ 實戰重新作答與推導過程：</div>
              <div class="blank-lines"></div>
              <div class="retest-footer">
                <span>最終答案：[ &nbsp;&nbsp;&nbsp;&nbsp; ]</span>
                <span>再次訂正心得：_______________________________</span>
                <span>掌握度檢核：□ 🔴仍需加強 &nbsp; □ 🟡有印象但猶豫 &nbsp; □ 🟢已完全精通</span>
              </div>
            </div>
          ` : `
            <!-- 含解析診斷模式 (Diagnostic Report Mode) -->
            <div class="q-analysis-area">
              <div class="analysis-row">
                <span class="ans-label student-ans">❌ 學生當時作答：</span>
                <span class="ans-val">${m.studentAnswer || '無紀錄'}</span>
              </div>
              <div class="analysis-row">
                <span class="ans-label correct-ans">✅ 標準答案與解法：</span>
                <div class="ans-val">${(m.correctAnswer || '無詳解紀錄').replace(/\n/g, '<br>')}</div>
              </div>
              ${m.blindspot ? `
                <div class="analysis-row blindspot-row">
                  <span class="ans-label blindspot-lbl">💡 核心觀念盲點：</span>
                  <div class="ans-val blindspot-text">${m.blindspot.replace(/\n/g, '<br>')}</div>
                </div>
              ` : ''}
            </div>
          `}
        </div>
      `;
    });

    const docHtml = `
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <title>${title} - ${studentName}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif;
            color: #1E293B;
            line-height: 1.5;
            margin: 0;
            padding: 20px;
            background: #FFF;
          }
          .header-banner {
            border-bottom: 2px solid #0F172A;
            padding-bottom: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .title { font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 4px 0; }
          .subtitle { font-size: 12px; color: #64748B; }
          .meta-info { text-align: right; font-size: 12px; color: #334155; }
          .question-box {
            border: 1px solid #CBD5E1;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 18px;
            page-break-inside: avoid;
            background: #FAFAFA;
          }
          .q-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
          .q-num { background: #0F172A; color: #FFF; font-weight: bold; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
          .q-badge { background: #E0E7FF; color: #3730A3; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 4px; }
          .q-unit { font-size: 11px; color: #475569; font-weight: 600; }
          .q-type { background: #F1F5F9; color: #475569; font-size: 10px; padding: 2px 6px; border-radius: 4px; }
          .q-tags { font-size: 10px; color: #DC2626; font-weight: bold; margin-left: auto; }
          .q-body { font-size: 13px; color: #0F172A; margin-bottom: 12px; }
          .q-title { margin-bottom: 4px; }
          .q-text { background: #FFF; border: 1px solid #E2E8F0; padding: 10px; border-radius: 6px; font-size: 13px; }
          
          /* Blank Retest Styles */
          .q-answer-area { background: #FFF; border: 1px dashed #94A3B8; border-radius: 6px; padding: 10px; margin-top: 8px; }
          .retest-label { font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 6px; }
          .blank-lines { height: 60px; border-bottom: 1px dotted #CBD5E1; margin-bottom: 8px; }
          .retest-footer { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: #334155; }
          
          /* Diagnostic Report Styles */
          .q-analysis-area { background: #FFF; border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px; margin-top: 8px; }
          .analysis-row { margin-bottom: 6px; font-size: 12px; }
          .ans-label { font-weight: bold; display: inline-block; width: 140px; }
          .student-ans { color: #DC2626; }
          .correct-ans { color: #16A34A; }
          .blindspot-row { background: #FEF3C7; padding: 8px; border-radius: 4px; margin-top: 6px; }
          .blindspot-lbl { color: #D97706; }
          .blindspot-text { color: #92400E; font-weight: 600; display: inline-block; }
          
          .no-print-bar {
            background: #1E293B; color: #FFF; padding: 10px 20px;
            display: flex; justify-content: space-between; align-items: center;
            border-radius: 8px; margin-bottom: 20px;
          }
          .btn-print { background: #3B82F6; color: #FFF; border: none; padding: 6px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
          @media print {
            .no-print-bar { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <div>
            <b>${title}</b> (${mistakes.length} 題) - 模式：${includeAnswers ? '含詳解診斷報告' : '考前空白重測模式 (無解答)'}
          </div>
          <button class="btn-print" onclick="window.print()">🖨️ 立即列印 / 存為 PDF</button>
        </div>

        <div class="header-banner">
          <div>
            <h1 class="title">${title}</h1>
            <div class="subtitle">國中教育會考專用 • 盲點徹底清零</div>
          </div>
          <div class="meta-info">
            <div><b>考生姓名</b>：${studentName}</div>
            <div><b>產卷日期</b>：${dateStr}</div>
            <div><b>題數共計</b>：${mistakes.length} 題</div>
          </div>
        </div>

        <div class="items-list">
          ${itemsHtml}
        </div>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(docHtml);
    printWin.document.close();
  }
};

