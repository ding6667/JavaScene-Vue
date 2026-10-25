/**
 * 学生学习模块 DTO（后端 /api/study/*）
 * 文件负责人：【B 学生学习】
 */

/**
 * 运行状态口径（后端已由数字改为力扣式字符串）
 * AC 通过 / WA 答案错误 / TLE 超时 / MLE 超内存 / RE 运行异常
 * CE 编译错误 / OLE 输出超限 / SV 安全违规 / SE 系统错误
 */
export type RunStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'OLE' | 'SV' | 'SE';

/** POST /api/study/code/run 与 /code/debug 请求体（code/run 与 code/debug 共用） */
export interface CodeRunRequest {
  codeContent: string;
  chapterId?: number;
  questionId?: number;
}

/** 代码运行结果；调试模式出参与之同构 */
export interface CodeRunResult {
  runId: number;
  status: RunStatus;
  statusDesc: string;
  /** 标准输出 */
  output: string;
  errorMsg: string;
  errorLine: number;
  /** 运行耗时（毫秒） */
  runDuration: number;
  /** 占用内存（KB） */
  memoryUsed: number;
  judgeResult: number;
  passedCount: number;
  totalCount: number;
  score: number;
  testResults: unknown[];
  /** 出错行清单（后端为字符串数组） */
  errorLineList: string[];
  // ---------- 调试智能体丰富字段（后端一律组装落库） ----------
  errorReason: string;
  optimizeSuggest: string;
  standardIdea: string;
  knowledgePoints: string[];
  codeQuality?: unknown;
  complexity?: unknown;
  steps?: unknown[];
  commonMistakes?: unknown[];
  improvements?: unknown[];
  relatedKnowledge?: unknown[];
  similarQuestions?: unknown[];
  encouragement: string;
  learningSuggestion: string;
}

/** POST /api/study/code/debug 出参，与 code/run 同构 */
export type CodeDebugResult = CodeRunResult;

/** POST /api/study/progress/save 请求体（用户身份由登录态推断，不传 userId） */
export interface ProgressSaveRequest {
  chapterId: number;
  /** 完成度 0-100 */
  progressRate: number;
  /** 累计学习时长（秒） */
  studyDuration: number;
  /** 是否已完成：1=是 0=否 */
  isCompleted: number;
}

/** GET /api/study/progress/get 返回项 */
export interface StudyProgress {
  id: number;
  chapterId: number;
  chapterName: string;
  progressRate: number;
  studyDuration: number;
  isCompleted: number;
  lastStudyTime: string;
  updateTime: string;
}

/** POST /api/study/practice/submit 请求体 */
export interface PracticeSubmitRequest {
  questionId: number;
  /** 作答内容：客观题为选项/文本，编程题为源码 */
  answerContent?: string;
  /** 作答耗时（秒） */
  duration?: number;
  /** 第几次尝试 */
  attemptCount?: number;
  /** 练习模式码值 */
  practiceMode?: number;
}

/** 提交结果的单用例执行情况 */
export interface PracticeCaseResult {
  caseIndex: number;
  /** 1=通过 0=未通过 */
  passed: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  errorMsg: string;
}

/** POST /api/study/practice/submit 返回 */
export interface PracticeSubmitResult {
  practiceId: number;
  runId: number;
  /** 1=正确 0=错误 */
  isCorrect: number;
  score: number;
  output: string;
  errorMsg: string;
  errorLine: number;
  errorReason: string;
  optimizeSuggest: string;
  standardIdea: string;
  knowledgePoints: string[];
  passedCount: number;
  totalCount: number;
  caseResults: PracticeCaseResult[];
}

/**
 * POST /api/study/practice/draft 请求体
 * openapi 未声明该接口的 body（文档缺口），按语义先占位，实现时与后端确认字段名。
 */
export interface PracticeDraftRequest {
  questionId: number;
  answerContent: string;
  chapterId?: number;
}

/**
 * GET /api/study/practice/detail?questionId= 返回
 * openapi 该接口 data 被声明成 string（文档缺口），实现时按后端真实 JSON 修正本类型。
 */
export type PracticeRecordDetail = unknown;

/**
 * GET /api/study/code/record/list 列表项
 * 后端 schema 里 records 元素为空对象（文档缺口），按"列表不含代码大字段"的描述
 * 先以运行结果的可选形态占位，联调后按真实字段收紧。
 */
export interface CodeRecordItem extends Partial<CodeRunResult> {
  codeContent?: string;
}

/** GET /api/study/code/record/list 查询参数（可按 chapterId / questionId 筛选） */
export interface CodeRecordQuery {
  chapterId?: number;
  questionId?: number;
  pageNum?: number;
  pageSize?: number;
}

/**
 * GET /api/study/code/record/detail?recordId= 返回
 * openapi 同样把 data 声明为 string；按描述应含代码、用例明细与 AI 调试字段。
 */
export type CodeRecordDetail = unknown;
