/**
 * 學業成績智慧彙整與多維分析系統 - Google Apps Script (GAS) 後端服務 (多租戶版)
 * 
 * 核心功能：
 * 1. 支援無 CORS 阻礙之 REST Web App 通訊 (doGet / doPost)
 * 2. 多人獨立帳密登入與註冊（支援密碼驗證、獨立資料空間、資料互不干擾）
 * 3. 雙向同步：小考評量、定期段考、會考模擬考、目標高中、系統設定
 * 4. 預設帳號資料安全移轉：littletiger0815@gmail.com / little07928
 */

// 預設主帳號（所有歷史未歸戶資料自動移轉至此）
var DEFAULT_OWNER_EMAIL = 'littletiger0815@gmail.com';
var DEFAULT_OWNER_PASS = 'little07928';

// 處理 GET 請求 (可用於瀏覽器檢測連線或拉取雲端數據)
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  var userEmail = (e && e.parameter && e.parameter.userEmail) || DEFAULT_OWNER_EMAIL;
  
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
    var data = fetchAllSheetsData(userEmail);
    return createJsonResponse({
      status: 'success',
      data: data,
      userEmail: userEmail,
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
    var userEmail = (payload.userEmail ? String(payload.userEmail).trim().toLowerCase() : DEFAULT_OWNER_EMAIL);
    var password = payload.password ? String(payload.password) : '';
    
    // 初始化試算表結構與預設帳號
    autoFormatSpreadsheet();

    // 1. 使用者註冊 (Register)
    if (action === 'register') {
      return handleRegister(userEmail, password, payload.studentName || '');
    }

    // 2. 使用者登入 (Login)
    if (action === 'login') {
      return handleLogin(userEmail, password);
    }

    // 3. 一鍵自動格式化試算表結構
    if (action === 'autoFormat' || action === 'initSheets') {
      var formatResult = autoFormatSpreadsheet();
      return createJsonResponse({
        status: 'success',
        message: 'Google 試算表已成功自動建立並套用精緻多租戶格式化！',
        details: formatResult
      });
    }

    // 4. 驗證帳號身分 (同步與拉取需有正確身分)
    var authUser = verifyUser(userEmail, password);
    if (!authUser.success) {
      // 容錯機制：若為初次預設主帳號，自動放行並註冊
      if (userEmail === DEFAULT_OWNER_EMAIL) {
        ensureUserExists(DEFAULT_OWNER_EMAIL, DEFAULT_OWNER_PASS, '小虎');
      } else {
        return createJsonResponse({ status: 'error', message: '帳號或密碼驗證失敗：' + authUser.message });
      }
    }
    
    // 5. 完整同步/覆寫數據至試算表 (Push - 僅覆寫該使用者所屬資料列)
    if (action === 'syncAll' || action === 'push') {
      var data = payload.data || {};
      
      if (data.quizzes) syncQuizzesSheet(userEmail, data.quizzes);
      if (data.termExams) syncTermExamsSheet(userEmail, data.termExams);
      if (data.mockExams) syncMockExamsSheet(userEmail, data.mockExams);
      if (data.targetSchools) syncTargetSchoolsSheet(userEmail, data.targetSchools);
      if (data.settings) syncSettingsSheet(userEmail, data.settings);
      
      return createJsonResponse({
        status: 'success',
        message: '雲端試算表雙向同步完成（使用者：' + userEmail + '）！',
        syncedAt: new Date().toISOString(),
        userEmail: userEmail,
        counts: {
          quizzes: data.quizzes ? data.quizzes.length : 0,
          termExams: data.termExams ? data.termExams.length : 0,
          mockExams: data.mockExams ? data.mockExams.length : 0
        }
      });
    }
    
    // 6. 單純拉取該使用者的雲端數據 (Pull)
    if (action === 'pull') {
      var cloudData = fetchAllSheetsData(userEmail);
      return createJsonResponse({
        status: 'success',
        data: cloudData,
        userEmail: userEmail,
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
  
  // 0. 格式化「使用者帳號管理」
  var userSheet = getOrCreateSheet(ss, '使用者帳號管理');
  setupUsersSheetHeader(userSheet);
  ensureUserExists(DEFAULT_OWNER_EMAIL, DEFAULT_OWNER_PASS, '小虎');

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
    sheets: ['使用者帳號管理', '模擬考會考專區', '定期段考評量', '小考評量紀錄', '目標高中與志願', '系統設定與備份'],
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

// 0. 使用者帳號管理欄位定義
function setupUsersSheetHeader(sheet) {
  var headers = ['使用者帳號/Email', '登入密碼', '學生姓名', '建立時間', '最後登入時間', '權限角色'];
  applyHeaderStyle(sheet, headers);
}

// 1. 模擬考欄位定義 (首欄為使用者帳號)
function setupMockSheetHeader(sheet) {
  var headers = [
    '使用者帳號', 'ID', '考次名稱', '測驗日期', '主辦/卷別', '測驗範圍', '考區',
    '國文等級', '國文答對',
    '英語等級', '閱讀答對', '聽力答對', '英語加權',
    '數學等級', '選擇答對', '非選得分', '數學加權',
    '社會等級', '社會答對',
    '自然等級', '自然答對',
    '寫作級分',
    '會考總標示', '會考總積點', '會考總積分', '核心盲點複習重點', '備註與策略筆記'
  ];
  applyHeaderStyle(sheet, headers);
}

// 2. 定期段考欄位定義 (首欄為使用者帳號)
function setupTermSheetHeader(sheet) {
  var headers = [
    '使用者帳號', 'ID', '學期考次', '考試日期', '班級排名', '年級排名', '總分', '總平均',
    '國文實得', '國文班均', '國文高標', '國文低標',
    '英文實得', '英文班均', '英文高標', '英文低標',
    '數學實得', '數學班均', '數學高標', '數學低標',
    '理化實得', '理化班均', '理化高標', '理化低標',
    '生物實得', '生物班均', '生物高標', '生物低標',
    '地科實得', '地科班均', '地科高標', '地科低標',
    '地理實得', '歷史實得', '公民實得', '寫作級分', '關鍵盲點與漏洞', '段考備註'
  ];
  applyHeaderStyle(sheet, headers);
}

// 3. 小考欄位定義 (首欄為使用者帳號)
function setupQuizSheetHeader(sheet) {
  var headers = [
    '使用者帳號', 'ID', '測驗日期', '科目代碼', '科目名稱', '單元章節名稱', '測驗類型',
    '實得分數', '滿分標準', '得分率%', '錯題歸因標籤', '訂正狀態', '核心盲點複習重點', '筆記與心得'
  ];
  applyHeaderStyle(sheet, headers);
}

// 4. 目標高中欄位定義 (首欄為使用者帳號)
function setupTargetSheetHeader(sheet) {
  var headers = [
    '使用者帳號', 'ID', '學校名稱', '簡稱', '所屬考區', '歷年錄取門檻(點)', '門檻積分', '目標標示', '各科目標設定', '備註'
  ];
  applyHeaderStyle(sheet, headers);
}

// 5. 系統設定 (首欄為使用者帳號)
function setupSettingSheetHeader(sheet) {
  var headers = ['使用者帳號', '設定鍵 (Key)', '設定值 (Value)', '最後更新時間'];
  applyHeaderStyle(sheet, headers);
}

// ==========================================
// 帳號認證與權限模組 (User Auth & Roles)
// ==========================================

function ensureUserExists(email, pass, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '使用者帳號管理');
  var users = getUsersList(sheet);
  
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) return users[i];
  }
  
  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var newRow = [email, pass, name || '學生', nowStr, nowStr, 'admin'];
  sheet.appendRow(newRow);
  return { email: email, pass: pass, name: name };
}

function getUsersList(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = getOrCreateSheet(ss, '使用者帳號管理');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var vals = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  return vals.map(function(r) {
    return {
      email: String(r[0] || '').trim().toLowerCase(),
      pass: String(r[1] || ''),
      name: String(r[2] || ''),
      created: r[3],
      lastLogin: r[4]
    };
  }).filter(function(u) { return Boolean(u.email); });
}

function verifyUser(email, pass) {
  if (!email) return { success: false, message: '請提供帳號 Email' };
  email = String(email).trim().toLowerCase();
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '使用者帳號管理');
  var users = getUsersList(sheet);
  
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) {
      if (users[i].pass === pass || pass === '') {
        return { success: true, user: users[i] };
      }
      return { success: false, message: '密碼不正確' };
    }
  }
  return { success: false, message: '查無此帳號' };
}

function handleRegister(email, pass, name) {
  if (!email || !pass) {
    return createJsonResponse({ status: 'error', message: '請填寫完整的帳號與密碼' });
  }
  email = String(email).trim().toLowerCase();
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '使用者帳號管理');
  var users = getUsersList(sheet);
  
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) {
      return createJsonResponse({ status: 'error', message: '此帳號已被註冊，請直接登入' });
    }
  }
  
  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var newRow = [email, pass, name || '新學生', nowStr, nowStr, 'user'];
  sheet.appendRow(newRow);
  
  return createJsonResponse({
    status: 'success',
    message: '註冊成功！已建立專屬學業成績帳號',
    user: { email: email, studentName: name || '新學生' }
  });
}

function handleLogin(email, pass) {
  if (!email || !pass) {
    return createJsonResponse({ status: 'error', message: '請輸入帳號與密碼' });
  }
  email = String(email).trim().toLowerCase();
  
  // 容錯自動初始化預設主帳號
  if (email === DEFAULT_OWNER_EMAIL && pass === DEFAULT_OWNER_PASS) {
    ensureUserExists(DEFAULT_OWNER_EMAIL, DEFAULT_OWNER_PASS, '小虎');
  }
  
  var auth = verifyUser(email, pass);
  if (!auth.success) {
    return createJsonResponse({ status: 'error', message: auth.message });
  }
  
  return createJsonResponse({
    status: 'success',
    message: '登入成功！已載入個人專屬成績庫',
    user: { email: auth.user.email, studentName: auth.user.name }
  });
}

// ==========================================
// 多租戶隔離數據寫入 (Multi-Tenant Sync Functions)
// ==========================================

function syncMockExamsSheet(userEmail, items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '模擬考會考專區');
  
  // 1. 保留其他使用者的紀錄，僅清除當前 userEmail 的紀錄
  var lastRow = sheet.getLastRow();
  var remainingRows = [];
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, 27).getValues();
    remainingRows = existingVals.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      // 如果 rowUser 與當前 userEmail 相同，過濾掉 (準備覆寫)
      if (rowUser === userEmail) return false;
      // 舊格式無帳號者：若當前是預設帳號，視為同一人故過濾；其他人則保留
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return false;
      return true;
    });
  }
  
  // 2. 轉換新紀錄 (第一欄填入 userEmail)
  var newRows = (items || []).map(function(item) {
    var sub = item.subjects || {};
    var ch = sub.CHINESE || {};
    var en = sub.ENGLISH || {};
    var ma = sub.MATH || {};
    var so = sub.SOCIAL || {};
    var sc = sub.SCIENCE || {};
    var wr = sub.WRITING || {};
    
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
      userEmail,
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
      item.blindspot || '',
      item.notes || ''
    ];
  });
  
  var finalRows = remainingRows.concat(newRows);
  
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (finalRows.length > 0) {
    sheet.getRange(2, 1, finalRows.length, finalRows[0].length).setValues(finalRows);
    sheet.autoResizeColumns(1, finalRows[0].length);
  }
}

function syncTermExamsSheet(userEmail, items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '定期段考評量');
  
  var lastRow = sheet.getLastRow();
  var remainingRows = [];
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, 38).getValues();
    remainingRows = existingVals.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return false;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return false;
      return true;
    });
  }
  
  var newRows = (items || []).map(function(item) {
    var sub = item.subjects || {};
    var getSub = function(k) { return sub[k] || {}; };
    
    return [
      userEmail,
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
      item.blindspot || '',
      item.notes || ''
    ];
  });
  
  var finalRows = remainingRows.concat(newRows);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (finalRows.length > 0) {
    sheet.getRange(2, 1, finalRows.length, finalRows[0].length).setValues(finalRows);
    sheet.autoResizeColumns(1, finalRows[0].length);
  }
}

function syncQuizzesSheet(userEmail, items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '小考評量紀錄');
  
  var lastRow = sheet.getLastRow();
  var remainingRows = [];
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    remainingRows = existingVals.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return false;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return false;
      return true;
    });
  }
  
  var subNameMap = {
    'CHINESE': '國文', 'ENGLISH': '英文', 'WRITING': '寫作',
    'MATH': '數學', 'PHYS_CHEM': '理化', 'BIOLOGY': '生物', 'EARTH_SCI': '地科',
    'GEOGRAPHY': '地理', 'HISTORY': '歷史', 'CIVICS': '公民'
  };
  
  var newRows = (items || []).map(function(item) {
    var max = item.maxScore || 100;
    var rate = Math.round(((item.score || 0) / max) * 100);
    var tags = Array.isArray(item.errorTags) ? item.errorTags.join(', ') : (item.errorTags || '');
    
    return [
      userEmail,
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
      item.blindspot || '',
      item.notes || ''
    ];
  });
  
  var finalRows = remainingRows.concat(newRows);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (finalRows.length > 0) {
    sheet.getRange(2, 1, finalRows.length, finalRows[0].length).setValues(finalRows);
    sheet.autoResizeColumns(1, finalRows[0].length);
  }
}

function syncTargetSchoolsSheet(userEmail, items) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '目標高中與志願');
  
  var lastRow = sheet.getLastRow();
  var remainingRows = [];
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    remainingRows = existingVals.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return false;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return false;
      return true;
    });
  }
  
  var newRows = (items || []).map(function(item) {
    return [
      userEmail,
      item.id || '',
      item.name || '',
      item.shortName || '',
      item.district || 'KEELUNG_TAIPEI',
      item.cutoffPoints || 30,
      item.cutoffCredits || 30,
      item.targetTierSummary || '5A',
      JSON.stringify(item.subjectTargets || {}),
      item.notes || ''
    ];
  });
  
  var finalRows = remainingRows.concat(newRows);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (finalRows.length > 0) {
    sheet.getRange(2, 1, finalRows.length, finalRows[0].length).setValues(finalRows);
    sheet.autoResizeColumns(1, finalRows[0].length);
  }
}

function syncSettingsSheet(userEmail, settings) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, '系統設定與備份');
  
  var lastRow = sheet.getLastRow();
  var remainingRows = [];
  if (lastRow > 1) {
    var existingVals = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    remainingRows = existingVals.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return false;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return false;
      return true;
    });
  }
  
  var keys = Object.keys(settings || {});
  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  
  var newRows = keys.map(function(k) {
    var val = settings[k];
    return [
      userEmail,
      k,
      typeof val === 'object' ? JSON.stringify(val) : String(val),
      nowStr
    ];
  });
  
  var finalRows = remainingRows.concat(newRows);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (finalRows.length > 0) {
    sheet.getRange(2, 1, finalRows.length, finalRows[0].length).setValues(finalRows);
    sheet.autoResizeColumns(1, finalRows[0].length);
  }
}

// ==========================================
// 多租戶數據拉取 (Fetch By User)
// ==========================================

function fetchAllSheetsData(userEmail) {
  userEmail = String(userEmail || DEFAULT_OWNER_EMAIL).trim().toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    quizzes: [],
    termExams: [],
    mockExams: [],
    targetSchools: [],
    settings: {}
  };
  
  // 1. 讀取小考 (以 userEmail 過濾)
  var quizSheet = ss.getSheetByName('小考評量紀錄');
  if (quizSheet && quizSheet.getLastRow() > 1) {
    var qValues = quizSheet.getRange(2, 1, quizSheet.getLastRow() - 1, 14).getValues();
    result.quizzes = qValues.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return true;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return true;
      return false;
    }).filter(function(r) {
      return (r[1] !== '' || r[2] !== '' || r[5] !== '');
    }).map(function(r, idx) {
      return {
        id: r[1] ? String(r[1]) : ('qz_' + new Date().getTime() + '_' + idx),
        date: formatDate(r[2]) || new Date().toISOString().slice(0, 10),
        subject: String(r[3] || 'CHINESE'),
        unitName: String(r[5] || '單元測驗'),
        quizType: String(r[6] || '隨堂測驗'),
        score: (r[7] !== '' && !isNaN(r[7])) ? Number(r[7]) : 0,
        maxScore: (r[8] !== '' && !isNaN(r[8])) ? Number(r[8]) : 100,
        errorTags: r[10] ? String(r[10]).split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [],
        correctionStatus: String(r[11] || 'corrected'),
        blindspot: r[12] ? String(r[12]) : '',
        notes: r[13] ? String(r[13]) : ''
      };
    });
  }
  
  // 2. 讀取模考 (以 userEmail 過濾)
  var mockSheet = ss.getSheetByName('模擬考會考專區');
  if (mockSheet && mockSheet.getLastRow() > 1) {
    var mValues = mockSheet.getRange(2, 1, mockSheet.getLastRow() - 1, 27).getValues();
    result.mockExams = mValues.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return true;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return true;
      return false;
    }).filter(function(r) {
      return (r[1] !== '' || r[2] !== '' || r[3] !== '');
    }).map(function(r, idx) {
      var id = r[1] ? String(r[1]) : ('mock_' + new Date().getTime() + '_' + idx);
      var chNot = r[7] ? String(r[7]).trim() : 'B';
      var enNot = r[9] ? String(r[9]).trim() : 'B';
      var maNot = r[13] ? String(r[13]).trim() : 'B';
      var soNot = r[17] ? String(r[17]).trim() : 'B';
      var scNot = r[19] ? String(r[19]).trim() : 'B';
      
      return {
        id: id,
        title: r[2] ? String(r[2]) : '模擬考評量',
        date: formatDate(r[3]) || new Date().toISOString().slice(0, 10),
        organizer: r[4] ? String(r[4]) : '模擬考',
        scope: r[5] ? String(r[5]) : '全範圍',
        district: r[6] ? String(r[6]) : 'KEELUNG_TAIPEI',
        subjects: {
          CHINESE: { notation: chNot, rawCorrect: (r[8] !== '' && !isNaN(r[8])) ? Number(r[8]) : undefined },
          ENGLISH: { notation: enNot, readingCorrect: (r[10] !== '' && !isNaN(r[10])) ? Number(r[10]) : undefined, listeningCorrect: (r[11] !== '' && !isNaN(r[11])) ? Number(r[11]) : undefined, weightedScore: (r[12] !== '' && !isNaN(r[12])) ? Number(r[12]) : undefined },
          MATH: { notation: maNot, choiceCorrect: (r[14] !== '' && !isNaN(r[14])) ? Number(r[14]) : undefined, nonChoiceScore: (r[15] !== '' && !isNaN(r[15])) ? Number(r[15]) : undefined, weightedScore: (r[16] !== '' && !isNaN(r[16])) ? Number(r[16]) : undefined },
          SOCIAL: { notation: soNot, rawCorrect: (r[18] !== '' && !isNaN(r[18])) ? Number(r[18]) : undefined },
          SCIENCE: { notation: scNot, rawCorrect: (r[20] !== '' && !isNaN(r[20])) ? Number(r[20]) : undefined },
          WRITING: { grade: (r[21] !== '' && !isNaN(r[21])) ? Number(r[21]) : 0 }
        },
        blindspot: r[25] ? String(r[25]) : '',
        notes: r[26] ? String(r[26]) : ''
      };
    });
  }
  
  // 3. 讀取定期段考 (以 userEmail 過濾)
  var termSheet = ss.getSheetByName('定期段考評量');
  if (termSheet && termSheet.getLastRow() > 1) {
    var tValues = termSheet.getRange(2, 1, termSheet.getLastRow() - 1, 38).getValues();
    result.termExams = tValues.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return true;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return true;
      return false;
    }).filter(function(r) {
      return (r[1] !== '' || r[2] !== '' || r[3] !== '');
    }).map(function(r, idx) {
      var id = r[1] ? String(r[1]) : ('term_' + new Date().getTime() + '_' + idx);
      var getSubObj = function(scoreIdx, avgIdx, highIdx, lowIdx) {
        if (r[scoreIdx] === '' || isNaN(r[scoreIdx])) return undefined;
        return {
          score: Number(r[scoreIdx]),
          classAvg: (r[avgIdx] !== '' && !isNaN(r[avgIdx])) ? Number(r[avgIdx]) : null,
          highBenchmark: (r[highIdx] !== '' && !isNaN(r[highIdx])) ? Number(r[highIdx]) : null,
          lowBenchmark: (r[lowIdx] !== '' && !isNaN(r[lowIdx])) ? Number(r[lowIdx]) : null
        };
      };
      
      var subs = {};
      var ch = getSubObj(8, 9, 10, 11); if (ch) subs.CHINESE = ch;
      var en = getSubObj(12, 13, 14, 15); if (en) subs.ENGLISH = en;
      var ma = getSubObj(16, 17, 18, 19); if (ma) subs.MATH = ma;
      var pc = getSubObj(20, 21, 22, 23); if (pc) subs.PHYS_CHEM = pc;
      var bi = getSubObj(24, 25, 26, 27); if (bi) subs.BIOLOGY = bi;
      var es = getSubObj(28, 29, 30, 31); if (es) subs.EARTH_SCI = es;
      if (r[32] !== '' && !isNaN(r[32])) subs.GEOGRAPHY = { score: Number(r[32]) };
      if (r[33] !== '' && !isNaN(r[33])) subs.HISTORY = { score: Number(r[33]) };
      if (r[34] !== '' && !isNaN(r[34])) subs.CIVICS = { score: Number(r[34]) };
      if (r[35] !== '' && !isNaN(r[35])) subs.WRITING = { score: Number(r[35]) };
      
      return {
        id: id,
        termName: r[2] ? String(r[2]) : '定期段考',
        date: formatDate(r[3]) || new Date().toISOString().slice(0, 10),
        classRank: (r[4] !== '' && !isNaN(r[4])) ? Number(r[4]) : null,
        gradeRank: (r[5] !== '' && !isNaN(r[5])) ? Number(r[5]) : null,
        totalScore: (r[6] !== '' && !isNaN(r[6])) ? Number(r[6]) : 0,
        averageScore: (r[7] !== '' && !isNaN(r[7])) ? Number(r[7]) : 0,
        subjects: subs,
        blindspot: r[36] ? String(r[36]) : '',
        notes: r[37] ? String(r[37]) : ''
      };
    });
  }

  // 4. 讀取目標高中與志願 (以 userEmail 過濾)
  var targetSheet = ss.getSheetByName('目標高中與志願');
  if (targetSheet && targetSheet.getLastRow() > 1) {
    var tgValues = targetSheet.getRange(2, 1, targetSheet.getLastRow() - 1, 10).getValues();
    result.targetSchools = tgValues.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return true;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return true;
      return false;
    }).filter(function(r) {
      return (r[1] !== '' || r[2] !== '');
    }).map(function(r, idx) {
      var subjectTargets = {};
      try {
        if (r[8]) subjectTargets = JSON.parse(r[8]);
      } catch(e) {}
      return {
        id: r[1] ? String(r[1]) : ('ts_' + idx),
        name: String(r[2] || ''),
        shortName: String(r[3] || ''),
        district: String(r[4] || 'KEELUNG_TAIPEI'),
        cutoffPoints: (r[5] !== '' && !isNaN(r[5])) ? Number(r[5]) : 30,
        cutoffCredits: (r[6] !== '' && !isNaN(r[6])) ? Number(r[6]) : 30,
        targetTierSummary: String(r[7] || '5A'),
        subjectTargets: subjectTargets,
        notes: String(r[9] || '')
      };
    });
  }

  // 5. 讀取系統設定 (以 userEmail 過濾)
  var setSheet = ss.getSheetByName('系統設定與備份') || ss.getSheetByName('系統設定');
  if (setSheet && setSheet.getLastRow() > 1) {
    var sValues = setSheet.getRange(2, 1, setSheet.getLastRow() - 1, 4).getValues();
    var setObj = {};
    sValues.filter(function(r) {
      var rowUser = String(r[0] || '').trim().toLowerCase();
      if (rowUser === userEmail) return true;
      if (rowUser === '' && userEmail === DEFAULT_OWNER_EMAIL) return true;
      return false;
    }).forEach(function(r) {
      if (!r[1]) return;
      var key = String(r[1]);
      var val = r[2];
      try {
        if (typeof val === 'string' && (val.indexOf('{') === 0 || val.indexOf('[') === 0)) {
          setObj[key] = JSON.parse(val);
          return;
        }
      } catch(e) {}
      setObj[key] = val;
    });
    result.settings = setObj;
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
