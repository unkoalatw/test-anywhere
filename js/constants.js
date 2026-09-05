// 學業成績智慧彙整與多維分析系統 - 常數與資料字典
const CONSTANTS = {
  // 9 大學科字典
  SUBJECTS: [
    { id: 'CHINESE', name: '國文', group: '語文領域', maxScore: 100, capCode: 'CHINESE', capName: '國文科', color: '#3B82F6', icon: 'book-open' },
    { id: 'ENGLISH', name: '英文 (含聽力)', group: '語文領域', maxScore: 100, capCode: 'ENGLISH', capName: '英語科', color: '#6366F1', icon: 'languages' },
    { id: 'WRITING', name: '寫作測驗', group: '語文領域', maxScore: 6, capCode: 'WRITING', capName: '寫作測驗', color: '#8B5CF6', icon: 'pen-tool' },
    { id: 'MATH', name: '數學 (含非選)', group: '數理領域', maxScore: 100, capCode: 'MATH', capName: '數學科', color: '#EC4899', icon: 'calculator' },
    { id: 'PHYS_CHEM', name: '理化', group: '數理領域', maxScore: 100, capCode: 'SCIENCE', capName: '自然科', color: '#10B981', icon: 'flask-conical' },
    { id: 'BIOLOGY', name: '生物', group: '數理領域', maxScore: 100, capCode: 'SCIENCE', capName: '自然科', color: '#059669', icon: 'dna' },
    { id: 'EARTH_SCI', name: '地科', group: '數理領域', maxScore: 100, capCode: 'SCIENCE', capName: '自然科', color: '#14B8A6', icon: 'globe-2' },
    { id: 'GEOGRAPHY', name: '地理', group: '社會領域', maxScore: 100, capCode: 'SOCIAL', capName: '社會科', color: '#F59E0B', icon: 'map' },
    { id: 'HISTORY', name: '歷史', group: '社會領域', maxScore: 100, capCode: 'SOCIAL', capName: '社會科', color: '#D97706', icon: 'landmark' },
    { id: 'CIVICS', name: '公民', group: '社會領域', maxScore: 100, capCode: 'SOCIAL', capName: '社會科', color: '#EA580C', icon: 'scale' }
  ],

  // 會考 5 大考科 (加寫作)
  CAP_SUBJECTS: [
    { id: 'CHINESE', name: '國文科', totalItems: 42, maxScore: 100, color: '#3B82F6', icon: 'book-open' },
    { id: 'ENGLISH', name: '英語科', readingItems: 43, listeningItems: 21, maxScore: 100, color: '#6366F1', icon: 'languages' },
    { id: 'MATH', name: '數學科', choiceItems: 25, nonChoiceScore: 6, maxScore: 100, color: '#EC4899', icon: 'calculator' },
    { id: 'SOCIAL', name: '社會科', totalItems: 54, subCategories: ['GEOGRAPHY', 'HISTORY', 'CIVICS'], maxScore: 100, color: '#F59E0B', icon: 'compass' },
    { id: 'SCIENCE', name: '自然科', totalItems: 50, subCategories: ['PHYS_CHEM', 'BIOLOGY', 'EARTH_SCI'], maxScore: 100, color: '#10B981', icon: 'atom' },
    { id: 'WRITING', name: '寫作測驗', maxGrade: 6, maxScore: 6, color: '#8B5CF6', icon: 'pen-tool' }
  ],

  // 三等七標示定義
  CAP_NOTATIONS: [
    { tier: 'A', notation: 'A++', name: '精熟 A++', standardPoints: 7, credits: 6, tierRank: 7, color: '#10B981', badgeClass: 'badge-a-plus-plus' },
    { tier: 'A', notation: 'A+', name: '精熟 A+', standardPoints: 6, credits: 6, tierRank: 6, color: '#059669', badgeClass: 'badge-a-plus' },
    { tier: 'A', notation: 'A', name: '精熟 A', standardPoints: 5, credits: 6, tierRank: 5, color: '#34D399', badgeClass: 'badge-a' },
    { tier: 'B', notation: 'B++', name: '基礎 B++', standardPoints: 4, credits: 4, tierRank: 4, color: '#3B82F6', badgeClass: 'badge-b-plus-plus' },
    { tier: 'B', notation: 'B+', name: '基礎 B+', standardPoints: 3, credits: 4, tierRank: 3, color: '#60A5FA', badgeClass: 'badge-b-plus' },
    { tier: 'B', notation: 'B', name: '基礎 B', standardPoints: 2, credits: 4, tierRank: 2, color: '#93C5FD', badgeClass: 'badge-b' },
    { tier: 'C', notation: 'C', name: '待加強 C', standardPoints: 1, credits: 2, tierRank: 1, color: '#EF4444', badgeClass: 'badge-c' }
  ],

  // 寫作測驗轉換表
  WRITING_GRADES: [
    { grade: 6, name: '6 級分 (立意深遠、結構嚴謹)', pointsKeelungTaipei: 1.0, creditsKeelungTaipei: 1.0, pointsCentral: 6 },
    { grade: 5, name: '5 級分 (立意清晰、結構完整)', pointsKeelungTaipei: 0.8, creditsKeelungTaipei: 0.8, pointsCentral: 5 },
    { grade: 4, name: '4 級分 (立意尚可、表達清楚)', pointsKeelungTaipei: 0.6, creditsKeelungTaipei: 0.6, pointsCentral: 4 },
    { grade: 3, name: '3 級分 (立意平淡、結構鬆散)', pointsKeelungTaipei: 0.4, creditsKeelungTaipei: 0.4, pointsCentral: 3 },
    { grade: 2, name: '2 級分 (詞不達意、結構殘缺)', pointsKeelungTaipei: 0.2, creditsKeelungTaipei: 0.2, pointsCentral: 2 },
    { grade: 1, name: '1 級分 (僅能辨識少量字詞)', pointsKeelungTaipei: 0.1, creditsKeelungTaipei: 0.1, pointsCentral: 1 },
    { grade: 0, name: '0 級分 (缺考/未作答)', pointsKeelungTaipei: 0, creditsKeelungTaipei: 0, pointsCentral: 0 }
  ],

  // 考區計分模式定義
  DISTRICT_MODELS: [
    {
      id: 'KEELUNG_TAIPEI',
      name: '基北區 (108 方案 36.8分 / 36點制)',
      maxPoints: 36.0,
      maxCredits: 36.0,
      description: '五科每科 A=6分, B=4分, C=2分 (滿分30) + 作文滿分 1分(換算加總36分)；積點 A++=7點, A+=6, A=5, B++=4, B+=3, B=2, C=1 + 作文 6級分=1點 (滿分36點)'
    },
    {
      id: 'CENTRAL_TAIWAN',
      name: '中投區 (111 點制 / 30 分制)',
      maxPoints: 111.0,
      maxCredits: 30.0,
      description: '五科積分 A=6, B=4, C=2 (滿分30分)；積點 A++=21, A+=18, A=15, B++=12, B+=9, B=6, C=3 (滿分105點) + 作文 6級分=6點 (滿點111點)'
    },
    {
      id: 'KAOHSIUNG',
      name: '高雄區 (30 分 / 35 點制)',
      maxPoints: 35.0,
      maxCredits: 30.0,
      description: '五科每科 A=6分, B=4分, C=2分；積點 A++=7, A+=6, A=5, B++=4, B+=3, B=2, C=1 (滿分35點)'
    },
    {
      id: 'GENERAL_TIER',
      name: '通用精簡制 (5A / 4A1B 標示統計)',
      maxPoints: 35.0,
      maxCredits: 30.0,
      description: '統計 A/B/C 科數與 + 號數量，如 5A 8+ (作 5 級分)'
    }
  ],

  // 錯題歸因標籤
  ERROR_TAGS: [
    { id: 'concept_unclear', name: '觀念不清', color: '#EF4444' },
    { id: 'calculation_careless', name: '計算粗心', color: '#F59E0B' },
    { id: 'misread_question', name: '審題不周', color: '#EC4899' },
    { id: 'formula_unfamiliar', name: '公式未熟', color: '#8B5CF6' },
    { id: 'time_out', name: '作答逾時', color: '#3B82F6' },
    { id: 'distractor_trap', name: '選項誘答', color: '#14B8A6' },
    { id: 'non_choice_incomplete', name: '非選表達不完整', color: '#6366F1' },
    { id: 'unfamiliar_vocabulary', name: '單字文法盲區', color: '#10B981' }
  ],

  // 錯題題目類型 (題型分類)
  QUESTION_TYPES: [
    { id: 'concept', name: '觀念概念題', icon: 'lightbulb', color: '#3B82F6' },
    { id: 'calculation', name: '計算推演題', icon: 'calculator', color: '#EC4899' },
    { id: 'diagram', name: '圖表判讀題', icon: 'pie-chart', color: '#10B981' },
    { id: 'reading', name: '素養閱讀題', icon: 'file-text', color: '#8B5CF6' },
    { id: 'experiment', name: '實驗探究題', icon: 'flask-conical', color: '#F59E0B' },
    { id: 'group_set', name: '跨科/題組題', icon: 'layers', color: '#6366F1' },
    { id: 'trap_detail', name: '陷阱細節題', icon: 'alert-triangle', color: '#EF4444' }
  ],

  // 錯題精通掌握度等級 (Mastery Levels)
  MASTERY_LEVELS: [
    { id: 'level_1', level: 1, name: '需加強', badge: '🔴 需加強', color: '#EF4444', reviewDays: 1, desc: '剛錯/尚未真正弄懂' },
    { id: 'level_2', level: 2, name: '複習中', badge: '🟡 複習中', color: '#F59E0B', reviewDays: 3, desc: '已看過詳解，需再次驗證' },
    { id: 'level_3', level: 3, name: '已精通', badge: '🟢 已精通', color: '#10B981', reviewDays: 15, desc: '能自主解出且能向他人講解' }
  ],

  // 考試類別 (Exam Source)
  EXAM_TYPES: [
    { id: 'mock', name: '會考模擬考', badgeClass: 'badge-primary' },
    { id: 'term', name: '定期段考', badgeClass: 'badge-success' },
    { id: 'quiz', name: '小考評量', badgeClass: 'badge-warning' },
    { id: 'practice', name: '平時刷題/自訂', badgeClass: 'badge-info' }
  ],

  // 小考測驗類型
  QUIZ_TYPES: [
    '隨堂小考', '週考', '單元總結測驗', '章節複習考', '補救測驗', '課後評量'
  ],

  // 模考主辦單位 / 卷別
  MOCK_ORGANIZERS: [
    '翰林全模', '康軒全模', '南一全模', '中模 (中投區聯模)', '北模 (基北區聯模)', '南模 (高雄/台南聯模)', '學思達模擬考'
  ],

  // 模考範圍
  MOCK_SCOPES: [
    '第 1 冊', '第 1~2 冊', '第 1~3 冊', '第 1~4 冊', '第 1~5 冊', '第 1~6 冊 (全範圍總複習)'
  ],

  // 預設目標高中參考庫
  TARGET_SCHOOLS_DB: [
    {
      id: 'sch_1',
      name: '台北市立建國高級中學',
      shortName: '建國中學',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 34.6,
      cutoffCredits: 36,
      targetTierSummary: '5A 5+',
      subjectTargets: { CHINESE: 'A+', ENGLISH: 'A++', MATH: 'A++', SOCIAL: 'A++', SCIENCE: 'A++', WRITING: 5 },
      description: '歷年錄取門檻約 34.6 點 (5A 5+ 作 5 級分)'
    },
    {
      id: 'sch_2',
      name: '台北市立第一女子高級中學',
      shortName: '北一女中',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 33.8,
      cutoffCredits: 36,
      targetTierSummary: '5A 4+',
      subjectTargets: { CHINESE: 'A++', ENGLISH: 'A++', MATH: 'A++', SOCIAL: 'A+', SCIENCE: 'A+', WRITING: 5 },
      description: '歷年錄取門檻約 33.8 點 (5A 4+ 作 5 級分)'
    },
    {
      id: 'sch_3',
      name: '國立臺灣師範大學附屬高級中學',
      shortName: '師大附中',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 33.6,
      cutoffCredits: 36,
      targetTierSummary: '5A 4+',
      subjectTargets: { CHINESE: 'A+', ENGLISH: 'A++', MATH: 'A++', SOCIAL: 'A+', SCIENCE: 'A++', WRITING: 5 },
      description: '歷年錄取門檻約 33.6 點 (5A 4+)'
    },
    {
      id: 'sch_4',
      name: '台北市立成功高級中學',
      shortName: '成功高中',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 31.6,
      cutoffCredits: 36,
      targetTierSummary: '5A 1+',
      subjectTargets: { CHINESE: 'A', ENGLISH: 'A+', MATH: 'A+', SOCIAL: 'A', SCIENCE: 'A+', WRITING: 5 },
      description: '歷年錄取門檻約 31.6 點 (5A 1+)'
    },
    {
      id: 'sch_5',
      name: '台北市立中山女子高級中學',
      shortName: '中山女高',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 30.8,
      cutoffCredits: 36,
      targetTierSummary: '5A',
      subjectTargets: { CHINESE: 'A+', ENGLISH: 'A', MATH: 'A', SOCIAL: 'A', SCIENCE: 'A', WRITING: 5 },
      description: '歷年錄取門檻約 30.8 點 (5A)'
    },
    {
      id: 'sch_6',
      name: '台北市立松山高級中學',
      shortName: '松山高中',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 30.6,
      cutoffCredits: 36,
      targetTierSummary: '5A',
      subjectTargets: { CHINESE: 'A', ENGLISH: 'A+', MATH: 'A', SOCIAL: 'A', SCIENCE: 'A', WRITING: 5 },
      description: '歷年錄取門檻約 30.6 點 (5A)'
    },
    {
      id: 'sch_7',
      name: '台北市立大同高級中學',
      shortName: '市立大同',
      district: 'KEELUNG_TAIPEI',
      cutoffPoints: 29.8,
      cutoffCredits: 34,
      targetTierSummary: '4A1B 5+',
      subjectTargets: { CHINESE: 'A', ENGLISH: 'A', MATH: 'A', SOCIAL: 'B++', SCIENCE: 'A', WRITING: 5 },
      description: '歷年錄取門檻約 29.8 點 (4A1B 5+)'
    },
    {
      id: 'sch_8',
      name: '台中市立台中第一高級中等學校',
      shortName: '台中一中',
      district: 'CENTRAL_TAIWAN',
      cutoffPoints: 97.0,
      cutoffCredits: 30,
      targetTierSummary: '5A 5+',
      subjectTargets: { CHINESE: 'A+', ENGLISH: 'A++', MATH: 'A++', SOCIAL: 'A+', SCIENCE: 'A++', WRITING: 5 },
      description: '歷年門檻約 97 點 (5A 5+)'
    },
    {
      id: 'sch_9',
      name: '台中市立台中女子高級中等學校',
      shortName: '台中女中',
      district: 'CENTRAL_TAIWAN',
      cutoffPoints: 95.0,
      cutoffCredits: 30,
      targetTierSummary: '5A 4+',
      subjectTargets: { CHINESE: 'A++', ENGLISH: 'A++', MATH: 'A+', SOCIAL: 'A+', SCIENCE: 'A+', WRITING: 5 },
      description: '歷年門檻約 95 點 (5A 4+)'
    },
    {
      id: 'sch_10',
      name: '高雄市立高雄高級中學',
      shortName: '高雄中學',
      district: 'KAOHSIUNG',
      cutoffPoints: 30.0,
      cutoffCredits: 30,
      targetTierSummary: '5A 5+',
      subjectTargets: { CHINESE: 'A+', ENGLISH: 'A++', MATH: 'A++', SOCIAL: 'A+', SCIENCE: 'A++', WRITING: 5 },
      description: '歷年門檻約 30分 30點'
    }
  ]
};

// 系統初始設定 (乾淨無假資料版本)
const SEED_DATA = {
  settings: {
    district: 'KEELUNG_TAIPEI',
    studentName: '',
    schoolName: '',
    gradeClass: '',
    targetSchools: ['sch_1', 'sch_2', 'sch_3'],
    gasUrl: 'https://script.google.com/macros/s/AKfycbyrffuoxnvgVP1kAhNtxv_t7-hiLscXsN5jECMCRwi3-Olw_WlN-UvEPr0ceQAHEQ89/exec',
    gasSyncEnabled: true,
    autoSyncInterval: 0,
    theme: 'dark'
  },
  quizzes: [],
  termExams: [],
  mockExams: []
};

