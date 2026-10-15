/**
 * 学生端类型定义
 * 字段名与取值口径以 openapi.json 为准，不再保留架构文档草案期的别名。
 */

// ==================== 教材章节 ====================

/** GET /api/knowledge/chapter/list 返回项（扁平结构，靠 parentId 组织层级） */
export interface Chapter {
  id: number;
  courseId: number;
  parentId: number;
  chapterCode: string;
  /** 章节标题（后端列名为 title，不是 chapterName） */
  title: string;
  /** 1=章 2=节 3=小节 */
  level: number;
  sortOrder: number;
  description: string;
  createTime?: string;
  updateTime?: string;
}

// ==================== 学习进度上报 ====================

/** POST /api/study/progress/save 请求体（用户身份由登录态推断，无需传 userId） */
export interface ProgressSaveRequest {
  chapterId: number;
  /** 完成度 0-100 */
  progressRate: number;
  /** 累计学习时长（秒） */
  studyDuration: number;
  /** 是否已完成：1=是 0=否 */
  isCompleted: number;
}

// ==================== 代码运行 / 调试 ====================

/**
 * 运行状态口径（后端已由 1/2/3 数字改为力扣式字符串）
 * AC 通过 / WA 答案错误 / TLE 超时 / MLE 超内存 / RE 运行异常
 * CE 编译错误 / OLE 输出超限 / SV 安全违规 / SE 系统错误
 */
export type RunStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'OLE' | 'SV' | 'SE';

/** POST /api/study/code/run 与 POST /api/study/code/debug 的请求体 */
export interface CodeRunRequest {
  codeContent: string;
  chapterId?: number;
  questionId?: number;
}

/** 代码运行结果响应（后端 → 前端） */
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
  /** 判题结果 */
  judgeResult: number;
  passedCount: number;
  totalCount: number;
  score: number;
  testResults: unknown[];
  /** 出错行清单（后端为字符串数组） */
  errorLineList: string[];
  // ---------- 智能体丰富字段 ----------
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

/** 调试出参与运行出参同构（调试模式无论成败都会调用调试智能体） */
export type CodeDebugResult = CodeRunResult;

// ==================== 出题 ====================

/** POST /api/exam/question/generate 请求体 */
export interface QuestionGenerateRequest {
  chapterId?: number;
  /** 难度配置 ID（关联 exam_question_difficulty_config.id） */
  difficultyConfigId?: number;
  /** 题型：1~7，'all' 表示全部 */
  questionType?: string;
  count?: number;
  userInstruction?: string;
}

// ==================== 作业提交 ====================

/** 单题作答 —— POST /api/exam/homework/submit 的 answers 元素 */
export interface HomeworkAnswer {
  questionId: number;
  answerContent: string;
}

/** POST /api/exam/homework/submit 请求体 */
export interface HomeworkSubmitRequest {
  homeworkId: number;
  answers: HomeworkAnswer[];
}
