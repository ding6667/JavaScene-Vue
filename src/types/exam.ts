/**
 * 智能考评模块 DTO（后端 /api/exam/*）
 * 文件负责人：【B 考核题库与作业】
 */

import type { PageResponse } from './index';

/** 测试用例（管理端题目 / 随机抽题返回项） */
export interface JudgeTestCase {
  caseIndex: number;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  caseType: string;
  weight: number;
  timeLimit: number;
  memoryLimit: number;
  description: string;
}

/** GET /api/exam/question/practice/list 列表项（不含答案） */
export interface PracticeQuestionItem {
  id: number;
  /** 题干 */
  content: string;
  /** 题型码值 1~6 */
  type: number;
  options: string[];
  chapterId: number;
  /** 难度码值 */
  difficulty: number;
  score: number;
  codeFramework: string;
  requirements: string[];
  /** 通过率（百分数，0~100） */
  acceptanceRate: number;
  submitCount: number;
  /** 是否已做过 */
  done: boolean;
  correct: boolean | null;
  attemptCount: number;
  favorited: boolean;
}

/** GET /api/exam/question/practice/list 查询参数 */
export interface PracticeQuestionQuery {
  chapterId?: number;
  type?: number;
  difficulty?: number;
  onlyUndone?: boolean;
  pageNum?: number;
  pageSize?: number;
}

/** GET /api/exam/question/practice/list 分页数据 */
export type PracticeQuestionPage = PageResponse<PracticeQuestionItem>;

/** 刷题详情的示例用例（不含完整用例集） */
export interface PracticeSampleCase {
  input: string;
  expectedOutput: string;
  description: string;
}

/** GET /api/exam/question/practice/detail/{id} 返回 */
export interface PracticeQuestionDetail {
  id: number;
  content: string;
  type: number;
  options: string[];
  chapterId: number;
  difficulty: number;
  score: number;
  codeFramework: string;
  requirements: string[];
  sampleTestCases: PracticeSampleCase[];
  /** 通过率（百分数，0~100） */
  acceptanceRate: number;
  done: boolean;
  /** 上次作答（后端可能为 null） */
  lastAnswer: string | null;
}

/** GET /api/exam/wrong-question/list 返回项（扁平错题条目） */
export interface WrongQuestionItem {
  id: number;
  questionId: number;
  content: string;
  type: number;
  difficulty: number;
  wrongCount: number;
  lastAnswer: string;
  /** 1=已掌握 0=未掌握 */
  mastered: number;
  lastWrongTime: string;
}

/** GET /api/exam/question/admin/list 查询参数 */
export interface QuestionAdminQuery {
  chapterId?: number;
  /** 题型码值 */
  type?: number;
  /** 难度码值 */
  difficulty?: number;
  /** 题干关键字（后端模糊匹配） */
  keyword?: string;
  pageNum: number;
  pageSize: number;
}

/** GET /api/exam/question/admin/list 分页数据 */
export type QuestionAdminPage = PageResponse<QuestionAdminItem>;

/** 管理端题目（含答案与解析，字段最完整） */
export interface QuestionAdminItem {
  id: number;
  createTime?: string;
  updateTime?: string;
  deleted?: number;
  content: string;
  /** 题型：列表接口返回码值，详情/随机抽题返回中文描述 */
  type: string | number;
  /** 题型中文描述（列表接口附带） */
  typeDesc?: string;
  /** 选项数组（api 层已统一把 JSON 字符串解析为数组） */
  options: string[];
  requirements?: string[];
  codeFramework?: string;
  hints?: string[];
  relatedQuestionIds?: number[];
  answer?: string;
  analysis?: string;
  solutionOutline?: string;
  chapterId?: number;
  /** 难度：列表接口返回码值，详情/随机抽题返回中文描述 */
  difficulty?: string | number;
  difficultyScore?: number;
  /** 认知层级：中文描述，如“理解” */
  cognitiveLevel?: string;
  abilityDimensions?: string[];
  commonMistakes?: string[];
  knowledgePointIds?: number[];
  score?: number;
  weight?: number;
  judgeMode?: number;
  testCases?: JudgeTestCase[];
  submitCount?: number;
  acceptedCount?: number;
  /** 通过率（百分数，0~100） */
  acceptanceRate?: number;
}

/** POST /api/exam/question/admin/save 与 PUT /admin/update 请求体 */
export interface QuestionSaveRequest {
  /** update 必填；save 为空表示新增 */
  id?: number;
  content: string;
  type: number;
  /** 后端 DTO 为 List<String>，必须传数组而不是 JSON 字符串 */
  options?: string[];
  answer?: string;
  analysis?: string;
  requirements?: string[];
  codeFramework?: string;
  hints?: string[];
  knowledgePointIds?: number[];
  solutionOutline?: string;
  weight?: number;
  judgeMode?: number;
  testCases?: JudgeTestCase[];
  chapterId?: number;
  difficulty?: number;
  difficultyScore?: number;
  score?: number;
  cognitiveLevel?: string;
  abilityDimensions?: string[];
  commonMistakes?: string[];
  relatedQuestionIds?: number[];
}

/** POST /api/exam/question/admin/random 请求体 */
export interface RandomQuestionRequest {
  chapterId: number;
  count: number;
  type?: number;
  difficulty?: number;
}

/** POST /api/exam/question/generate 请求体（已对接） */
export interface QuestionGenerateRequest {
  chapterId?: number;
  /** 难度配置 ID（关联 exam_question_difficulty_config.id） */
  difficultyConfigId?: number;
  /** 题型：1~6，'all' 表示全部 */
  questionType?: string;
  count?: number;
  userInstruction?: string;
}

/** 单题作答 —— POST /api/exam/homework/submit（已对接） */
export interface HomeworkAnswer {
  questionId: number;
  answerContent: string;
}

/** POST /api/exam/homework/submit 请求体（已对接） */
export interface HomeworkSubmitRequest {
  homeworkId: number;
  answers: HomeworkAnswer[];
}

/** GET /api/exam/grading/result/{homeworkId} 的单题明细 */
export interface GradingScoreDetail {
  questionId: number;
  questionContent: string;
  fullScore: number;
  score: number;
  errorReason: string;
}

/** GET /api/exam/grading/result/{homeworkId} 返回 */
export interface HomeworkGradingResult {
  id: number;
  homeworkId: number;
  userId: number;
  totalScore: number;
  studentScore: number;
  scoreDetail: GradingScoreDetail[];
  status: string;
  errorMessage: string;
}
