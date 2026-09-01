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
  }
};
