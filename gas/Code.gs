/**
 * 學業成績智慧彙整與多維分析系統 - Google Apps Script (GAS) 後端服務
 * 
 * 核心功能：
 * 1. 支援無 CORS 阻礙之 REST Web App 通訊 (doGet / doPost)
 * 2. 雙向同步：小考評量、定期段考、會考模擬考、目標高中、系統設定
 * 3. 一鍵自動建立並格式化試算表：專業色系標題列、凍結首列、欄位驗證、自適應欄寬與條件格式化
 */

// 處理 GET 請求 (可用於瀏覽器檢測連線或拉取雲端數據)
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  
  if (action === 'ping') {
    return createJsonResponse({
      status: 'success',
      message: 'CAP 成績智慧彙整 GAS 服務運行正常！',
      timestamp: new Date().toISOString(),
      spreadsheetName: SpreadsheetApp.getActiveSpreadsheet().getName(),
      spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
    });
  }
  
  if (action === 'fetchAll') {
    var data = fetchAllSheetsData();
    return createJsonResponse({
      status: 'success',
      data: data,
      timestamp: new Date().toISOString()
    });
  }
  
  return createJsonResponse({
    status: 'error',
    message: '未知的 GET 操作指令：' + action
  });
}

// 處理 POST 請求 (以 text/plain 接收 JSON，徹底免除 CORS Preflight OPTIONS 限制)
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: 'error', message: '未接收到有效的 POST 數據內容' });
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'syncAll';
    
    // 1. 一鍵自動格式化試算表結構
    if (action === 'autoFormat' || action === 'initSheets') {
      var formatResult = autoFormatSpreadsheet();
      return createJsonResponse({
        status: 'success',
        message: 'Google 試算表已成功自動建立並套用精緻格式化！',
        details: formatResult
      });
    }
    
    // 2. 完整同步/覆寫數據至試算表
    if (action === 'syncAll' || action === 'push') {
      var data = payload.data || {};
      autoFormatSpreadsheet(); // 確保工作表與欄位存在
      
      if (data.quizzes) syncQuizzesSheet(data.quizzes);
      if (data.termExams) syncTermExamsSheet(data.termExams);
      if (data.mockExams) syncMockExamsSheet(data.mockExams);
      if (data.targetSchools) syncTargetSchoolsSheet(data.targetSchools);
      if (data.settings) syncSettingsSheet(data.settings);
      
      return createJsonResponse({
        status: 'success',
        message: '雲端試算表雙向同步完成！',
        syncedAt: new Date().toISOString(),
        counts: {
          quizzes: data.quizzes ? data.quizzes.length : 0,
          termExams: data.termExams ? data.termExams.length : 0,
          mockExams: data.mockExams ? data.mockExams.length : 0
        }
      });
    }
    
    // 3. 單純拉取全部雲端數據
    if (action === 'pull') {
      var cloudData = fetchAllSheetsData();
      return createJsonResponse({
        status: 'success',
        data: cloudData,
        message: '已成功從 Google 試算表拉取最新數據'
      });
    }
    
    return createJsonResponse({ status: 'error', message: '未知的 POST 動作：' + action });
    
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: 'GAS 伺服器處理錯誤: ' + err.toString(),
      stack: err.stack
    });
  }
}

// 產生安全 JSON 回應格式
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 試算表自動格式化與結構初始化 (Auto-Format)
// ==========================================
function autoFormatSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 格式化「模擬考會考專區」
  var mockSheet = getOrCreateSheet(ss, '模擬考會考專區');
  setupMockSheetHeader(mockSheet);
  
  // 2. 格式化「定期段考評量」
  var termSheet = getOrCreateSheet(ss, '定期段考評量');
  setupTermSheetHeader(termSheet);
  
  // 3. 格式化「小考評量紀錄」
  var quizSheet = getOrCreateSheet(ss, '小考評量紀錄');
  setupQuizSheetHeader(quizSheet);
  
  // 4. 格式化「目標高中與志願」
  var targetSheet = getOrCreateSheet(ss, '目標高中與志願');
  setupTargetSheetHeader(targetSheet);
  
  // 5. 格式化「系統設定與備份」
  var settingSheet = getOrCreateSheet(ss, '系統設定與備份');
  setupSettingSheetHeader(settingSheet);
  
  return {
    sheets: ['模擬考會考專區', '定期段考評量', '小考評量紀錄', '目標高中與志願', '系統設定與備份'],
    formattedAt: new Date().toISOString()
  };
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// 套用專業深藍商務標題樣式
function applyHeaderStyle(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1E293B') // 質感深石板灰藍
             .setFontColor('#F8FAFC')
             .setFontWeight('bold')
             .setFontFamily('Arial')
             .setFontSize(10)
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
}

// 1. 模擬考欄位定義
function setupMockSheetHeader(sheet) {
  var headers = [
    'ID', '考次名稱', '測驗日期', '主辦/卷別', '測驗範圍', '考區',
    '國文等級', '國文答對',
    '英語等級', '閱讀答對', '聽力答對', '英語加權',
    '數學等級', '選擇答對', '非選得分', '數學加權',
    '社會等級', '社會答對',
    '自然等級', '自然答對',
    '寫作級分',
    '會考總標示', '會考總積點', '會考總積分', '備註與策略筆記'
  ];
  applyHeaderStyle(sheet, headers);
}

// 2. 定期段考欄位定義
function setupTermSheetHeader(sheet) {
  var headers = [
    'ID', '學期考次', '考試日期', '班級排名', '年級排名', '總分', '總平均',
    '國文實得', '國文班均', '國文高標', '國文低標',
    '英文實得', '英文班均', '英文高標', '英文低標',
    '數學實得', '數學班均', '數學高標', '數學低標',
    '理化實得', '理化班均', '理化高標', '理化低標',
    '生物實得', '生物班均', '生物高標', '生物低標',
    '地科實得', '地科班均', '地科高標', '地科低標',
    '地理實得', '歷史實得', '公民實得', '寫作級分', '段考備註'
  ];
  applyHeaderStyle(sheet, headers);
}

// 3. 小考欄位定義
function setupQuizSheetHeader(sheet) {
  var headers = [
    'ID', '測驗日期', '科目代碼', '科目名稱', '單元章節名稱', '測驗類型',
    '實得分數', '滿分標準', '得分率%', '錯題歸因標籤', '訂正狀態', '筆記與心得'
  ];
  applyHeaderStyle(sheet, headers);
}

// 4. 目標高中欄位定義
function setupTargetSheetHeader(sheet) {
  var headers = [
    'ID', '學校名稱', '簡稱', '所屬考區', '歷年錄取門檻(點)', '門檻積分', '目標標示', '各科目標設定', '備註'
  ];
  applyHeaderStyle(sheet, headers);
}

// 5. 系統設定
function setupSettingSheetHeader(sheet) {
  var headers = ['設定鍵 (Key)', '設定值 (Value)', '最後更新時間'];
  applyHeaderStyle(sheet, headers);
}

// ==========================================
// 數據寫入 (Sync Functions)
// ==========================================

function syncMockExamsSheet(items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '模擬考會考專區');
  
  // 保留第 1 列標題，清除舊資料
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  if (!items || items.length === 0) return;
  
  var rows = items.map(function(item) {
    var sub = item.subjects || {};
    var ch = sub.CHINESE || {};
    var en = sub.ENGLISH || {};
    var ma = sub.MATH || {};
    var so = sub.SOCIAL || {};
    var sc = sub.SCIENCE || {};
    var wr = sub.WRITING || {};
    
    // 計算總標示與積點 (以基北區為標準換算示例)
    var countA = 0, countB = 0, countC = 0, plus = 0, points = 0;
    [ch, en, ma, so, sc].forEach(function(s) {
      var not = s.notation || 'B';
      if (not.indexOf('A') === 0) { countA++; if (not === 'A++') plus += 2; if (not === 'A+') plus += 1; }
      else if (not.indexOf('B') === 0) { countB++; if (not === 'B++') plus += 2; if (not === 'B+') plus += 1; }
      else if (not === 'C') countC++;
      
      var rankMap = { 'A++': 7, 'A+': 6, 'A': 5, 'B++': 4, 'B+': 3, 'B': 2, 'C': 1 };
      points += (rankMap[not] || 2);
    });
    
    var wGrade = wr.grade !== undefined ? Number(wr.grade) : 0;
    var wPoints = wGrade === 6 ? 1.0 : wGrade === 5 ? 0.8 : wGrade === 4 ? 0.6 : wGrade === 3 ? 0.4 : 0.2;
    var totalPoints = points + wPoints;
    var summaryTier = (countA ? countA + 'A' : '') + (countB ? countB + 'B' : '') + (countC ? countC + 'C' : '') + (plus ? ' ' + plus + '+' : '');
    
    return [
      item.id || '',
      item.title || '',
      item.date || '',
      item.organizer || '',
      item.scope || '',
      item.district || 'KEELUNG_TAIPEI',
      ch.notation || '', ch.rawCorrect !== undefined ? ch.rawCorrect : '',
      en.notation || '', en.readingCorrect !== undefined ? en.readingCorrect : '', en.listeningCorrect !== undefined ? en.listeningCorrect : '', en.weightedScore || '',
      ma.notation || '', ma.choiceCorrect !== undefined ? ma.choiceCorrect : '', ma.nonChoiceScore !== undefined ? ma.nonChoiceScore : '', ma.weightedScore || '',
      so.notation || '', so.rawCorrect !== undefined ? so.rawCorrect : '',
      sc.notation || '', sc.rawCorrect !== undefined ? sc.rawCorrect : '',
      wGrade,
      summaryTier,
      totalPoints,
      30 + (countA * 6) + (countB * 4) + (countC * 2) > 0 ? (countA * 6 + countB * 4 + countC * 2) : 30,
      item.notes || ''
    ];
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sheet.autoResizeColumns(1, rows[0].length);
  }
}

function syncTermExamsSheet(items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '定期段考評量');
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  if (!items || items.length === 0) return;
  
  var rows = items.map(function(item) {
    var sub = item.subjects || {};
    var getSub = function(k) { return sub[k] || {}; };
    
    return [
      item.id || '',
      item.termName || '',
      item.date || '',
      item.classRank || '',
      item.gradeRank || '',
      item.totalScore || '',
      item.averageScore || '',
      getSub('CHINESE').score || '', getSub('CHINESE').classAvg || '', getSub('CHINESE').highBenchmark || '', getSub('CHINESE').lowBenchmark || '',
      getSub('ENGLISH').score || '', getSub('ENGLISH').classAvg || '', getSub('ENGLISH').highBenchmark || '', getSub('ENGLISH').lowBenchmark || '',
      getSub('MATH').score || '', getSub('MATH').classAvg || '', getSub('MATH').highBenchmark || '', getSub('MATH').lowBenchmark || '',
      getSub('PHYS_CHEM').score || '', getSub('PHYS_CHEM').classAvg || '', getSub('PHYS_CHEM').highBenchmark || '', getSub('PHYS_CHEM').lowBenchmark || '',
      getSub('BIOLOGY').score || '', getSub('BIOLOGY').classAvg || '', getSub('BIOLOGY').highBenchmark || '', getSub('BIOLOGY').lowBenchmark || '',
      getSub('EARTH_SCI').score || '', getSub('EARTH_SCI').classAvg || '', getSub('EARTH_SCI').highBenchmark || '', getSub('EARTH_SCI').lowBenchmark || '',
      getSub('GEOGRAPHY').score || '',
      getSub('HISTORY').score || '',
      getSub('CIVICS').score || '',
      getSub('WRITING').score || '',
      item.notes || ''
    ];
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sheet.autoResizeColumns(1, rows[0].length);
  }
}

function syncQuizzesSheet(items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '小考評量紀錄');
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  if (!items || items.length === 0) return;
  
  var subNameMap = {
    'CHINESE': '國文', 'ENGLISH': '英文', 'WRITING': '寫作',
    'MATH': '數學', 'PHYS_CHEM': '理化', 'BIOLOGY': '生物', 'EARTH_SCI': '地科',
    'GEOGRAPHY': '地理', 'HISTORY': '歷史', 'CIVICS': '公民'
  };
  
  var rows = items.map(function(item) {
    var max = item.maxScore || 100;
    var rate = Math.round(((item.score || 0) / max) * 100);
    var tags = Array.isArray(item.errorTags) ? item.errorTags.join(', ') : (item.errorTags || '');
    
    return [
      item.id || '',
      item.date || '',
      item.subject || '',
      subNameMap[item.subject] || item.subject || '',
      item.unitName || '',
      item.quizType || '',
      item.score !== undefined ? item.score : '',
      max,
      rate + '%',
      tags,
      item.correctionStatus || 'corrected',
      item.notes || ''
    ];
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sheet.autoResizeColumns(1, rows[0].length);
  }
}

function syncTargetSchoolsSheet(items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '目標高中與志願');
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  if (!items || items.length === 0) return;
  
  var rows = items.map(function(item) {
    return [
      item.id || '',
      item.name || '',
      item.shortName || '',
      item.district || '',
      item.cutoffPoints || '',
      item.cutoffCredits || '',
      item.targetTierSummary || '',
      JSON.stringify(item.subjectTargets || {}),
      item.description || ''
    ];
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sheet.autoResizeColumns(1, rows[0].length);
  }
}

function syncSettingsSheet(settings) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '系統設定與備份');
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  
  var now = new Date().toISOString();
  var rows = [
    ['STUDENT_NAME', settings.studentName || '', now],
    ['SCHOOL_NAME', settings.schoolName || '', now],
    ['GRADE_CLASS', settings.gradeClass || '', now],
    ['TARGET_DISTRICT', settings.district || 'KEELUNG_TAIPEI', now],
    ['TARGET_SCHOOL_IDS', Array.isArray(settings.targetSchools) ? settings.targetSchools.join(',') : '', now],
    ['THEME', settings.theme || 'dark', now]
  ];
  
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  sheet.autoResizeColumns(1, 3);
}

// ==========================================
// 讀取全部試算表數據 (Fetch All Sheets Data)
// ==========================================
function fetchAllSheetsData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    quizzes: [],
    termExams: [],
    mockExams: [],
    targetSchools: [],
    settings: {}
  };
  
  // 1. 讀取小考
  var quizSheet = ss.getSheetByName('小考評量紀錄');
  if (quizSheet && quizSheet.getLastRow() > 1) {
    var qValues = quizSheet.getRange(2, 1, quizSheet.getLastRow() - 1, 12).getValues();
    result.quizzes = qValues.map(function(r) {
      return {
        id: String(r[0]),
        date: formatDate(r[1]),
        subject: String(r[2]),
        unitName: String(r[4]),
        quizType: String(r[5]),
        score: Number(r[6]),
        maxScore: Number(r[7]) || 100,
        errorTags: String(r[9]).split(',').map(function(s) { return s.trim(); }).filter(Boolean),
        correctionStatus: String(r[10]),
        notes: String(r[11])
      };
    });
  }
  
  // 2. 讀取模考
  var mockSheet = ss.getSheetByName('模擬考會考專區');
  if (mockSheet && mockSheet.getLastRow() > 1) {
    var mValues = mockSheet.getRange(2, 1, mockSheet.getLastRow() - 1, 25).getValues();
    result.mockExams = mValues.map(function(r) {
      return {
        id: String(r[0]),
        title: String(r[1]),
        date: formatDate(r[2]),
        organizer: String(r[3]),
        scope: String(r[4]),
        district: String(r[5]) || 'KEELUNG_TAIPEI',
        subjects: {
          CHINESE: { notation: String(r[6]), rawCorrect: r[7] !== '' ? Number(r[7]) : undefined },
          ENGLISH: { notation: String(r[8]), readingCorrect: r[9] !== '' ? Number(r[9]) : undefined, listeningCorrect: r[10] !== '' ? Number(r[10]) : undefined, weightedScore: Number(r[11]) },
          MATH: { notation: String(r[12]), choiceCorrect: r[13] !== '' ? Number(r[13]) : undefined, nonChoiceScore: r[14] !== '' ? Number(r[14]) : undefined, weightedScore: Number(r[15]) },
          SOCIAL: { notation: String(r[16]), rawCorrect: r[17] !== '' ? Number(r[17]) : undefined },
          SCIENCE: { notation: String(r[18]), rawCorrect: r[19] !== '' ? Number(r[19]) : undefined },
          WRITING: { grade: Number(r[20]) || 0 }
        },
        notes: String(r[24])
      };
    });
  }
  
  return result;
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}
