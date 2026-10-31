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

/**
 * 前端渲染参数（后端补齐后下发，老数据也补）。
 * - 选择题：choiceMode 决定单选 / 多选，**不要**再按答案个数猜；
 * - 填空题：blankCount 决定输入框个数，**不要**再数题干下划线；
 * - 其它题型可能为 null，按题型默认渲染。
 */
export interface QuestionRenderConfig {
  choiceMode?: 'single' | 'multiple';
  blankCount?: number;
  /** 编程题语言，默认 java */
  language?: string;
}

/**
 * 难度配置（exam_question_difficulty_config）
 * 难度已从 1/2/3 枚举码改成指向这张表：筛选与保存用 id，展示用 name。
 */
export interface DifficultyConfig {
  id: number;
  /** 难度编码：basic / intermediate / advanced */
  code: string;
  /** 难度名称，如「简单 / 进阶 / 拔高」 */
  name: string;
  description?: string;
  example?: string;
  /** 难度排序，1 最简单 */
  levelOrder: number;
  cognitiveLevels?: string[];
  scoreMin?: number;
  scoreMax?: number;
  /** 1=系统预设 0=教师自建 */
  isSystem?: number;
  /** 绑定章节 ID，null 表示通用 */
  chapterId?: number | null;
}

/** GET /api/exam/question/practice/list 列表项（不含答案） */
export interface PracticeQuestionItem {
  id: number;
  /** 题干 */
  content: string;
  /** 一话题名（≤100 字），列表/卡片优先展示，为空退回题干 */
  shortTitle?: string | null;
  /** 渲染参数：选择题 choiceMode、填空题 blankCount */
  renderConfig?: QuestionRenderConfig | null;
  /** 题型码值 1~6 */
  type: number;
  options: string[];
  chapterId: number;
  /** 难度配置 ID */
  difficultyConfigId: number;
  /** 难度名称，直接展示 */
  difficultyName?: string;
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
  difficultyConfigId?: number;
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
  /** 一话题名，详情页标题优先用它 */
  shortTitle?: string | null;
  /** 渲染参数：选择题 choiceMode、填空题 blankCount */
  renderConfig?: QuestionRenderConfig | null;
  type: number;
  options: string[];
  chapterId: number;
  difficultyConfigId: number;
  difficultyName?: string;
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
  /** 一话题名，错题列表优先展示 */
  shortTitle?: string | null;
  type: number;
  difficultyConfigId: number;
  difficultyName?: string;
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
  /** 难度配置 ID（取自 /api/exam/difficulty-config/list） */
  difficultyConfigId?: number;
  /** 题干关键字（后端模糊匹配） */
  keyword?: string;
  pageNum: number;
  pageSize: number;
}

/** GET /api/exam/question/admin/list 分页数据 */
export type QuestionAdminPage = PageResponse<QuestionAdminItem>;

/**
 * 题目答案（后端 exam_question.answer 是 JSON 列，用 JsonNode 存取）
 * 赋值口径按题型区分：
 * - 选择题：{ correct: ["B"] }（正确选项字母，多选多个）
 * - 判断题：{ correct: true }（布尔值）
 * - 填空题：{ blanks: ["length()", "equals()"] }（按空顺序）
 * - 程序阅读题：{ output: "9" }
 * - 编程题 / 简答题：{ reference: "参考实现或参考答案" }
 */
export interface QuestionAnswer {
  correct?: string[] | boolean;
  blanks?: string[];
  reference?: string;
  output?: string;
}

/** 管理端题目（含答案与解析，字段最完整） */
export interface QuestionAdminItem {
  id: number;
  createTime?: string;
  updateTime?: string;
  deleted?: number;
  content: string;
  /** 一话题名，表格与抽题面板优先展示，为空退回题干截断 */
  shortTitle?: string | null;
  /** 渲染参数：选择题 choiceMode、填空题 blankCount */
  renderConfig?: QuestionRenderConfig | null;
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
  /** 答案对象（api 层已把 JSON 字符串解析成对象） */
  answer?: QuestionAnswer;
  analysis?: string;
  solutionOutline?: string;
  chapterId?: number;
  /** 难度配置 ID；列表 VO 与实体都有 */
  difficultyConfigId?: number;
  /** 难度名称；只有走 VO 的接口（列表）会返回，实体接口需用难度配置映射 */
  difficultyName?: string;
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
  /** 一话题名，≤100 字；不传由后端留空 */
  shortTitle?: string | null;
  /** 渲染参数：选择题建议显式传 choiceMode（多选只勾一个时无法推断），填空题传 blankCount */
  renderConfig?: QuestionRenderConfig | null;
  type: number;
  /** 后端 DTO 为 List<String>，必须传数组而不是 JSON 字符串 */
  options?: string[];
  /** 答案对象，键按题型取（见 QuestionAnswer），原样作为对象提交 */
  answer?: QuestionAnswer;
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
  /** 难度配置 ID，取自 /api/exam/difficulty-config/list */
  difficultyConfigId?: number;
  difficultyScore?: number;
  score?: number;
  cognitiveLevel?: string;
  abilityDimensions?: string[];
  commonMistakes?: string[];
  relatedQuestionIds?: number[];
}

/** 抽题：难度档配比，count 为空表示该档全取 */
export interface RandomDifficultyAllocation {
  difficultyConfigId: number;
  count?: number;
}

/** 抽题：一个题型一组题量；配了 difficultyAllocations 时以各档数量为准，顶层 count 被忽略 */
export interface RandomTypeAllocation {
  /** 题型码值：1=选择 2=填空 3=判断 4=程序阅读 5=编程 */
  type: number;
  count?: number;
  difficultyAllocations?: RandomDifficultyAllocation[];
}

/** POST /api/exam/question/admin/random 请求体 */
export interface RandomQuestionRequest {
  chapterId: number;
  typeAllocations: RandomTypeAllocation[];
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

/**
 * 单题作答 —— POST /api/exam/homework/submit（已对接）
 *
 * ★ 两个 ID 不是一套，混用会报「题目不存在」（code=1001）：
 *   - questionId：**题库题目 ID**（exam_question.id），取自 /student/question 返回的 questionId；
 *   - snapshotId：**作业题目快照 ID**（teach_homework_question.id），就是 /student/question 返回的 id。
 * 快照 ID 当 questionId 提交会被后端判为「题目不属于该作业」。
 */
export interface HomeworkAnswer {
  /** 题库题目 ID（exam_question.id） */
  questionId: number;
  /**
   * 作业题目快照 ID，可选。
   * 传了之后，本次批改出的错题会钉在发布那一版题上，题库事后改题不影响学生回看；
   * 不传时后端按 homeworkId + questionId 回查快照补上。
   */
  snapshotId?: number;
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

// ==================== 我的作业（学生本人） ====================

/**
 * GET /api/exam/homework/my-list 查询参数
 *
 * 注意：classId / grade 不要传。后端用 UserApi.getUserById 从 sys_student_info
 * 取当前学生的班级与年级，传了也不生效（防止越权查别班作业）。
 */
export interface MyHomeworkQuery {
  /** 2=已发布 3=已截止；不传等价于 2+3 */
  status?: number;
  /** 按章节筛选 */
  chapterId?: number;
  /** true 只返回 deadline > now 的作业 */
  onlyNotExpired?: boolean;
  /** 小于 1 时后端按 1 处理 */
  pageNum: number;
  /** 小于 1 时后端按 10 处理 */
  pageSize: number;
}

/** GET /api/exam/homework/my-list 列表项（StudentHomeworkItemVO） */
export interface StudentHomeworkItem {
  homeworkId: number;
  title: string;
  /** 作业说明 */
  content: string;
  chapterId: number;
  /** 后端可能给 null，展示时回退到 chapterId */
  chapterName: string | null;
  questionCount: number;
  totalScore: number;
  deadline: string | null;
  /** 1=允许逾期提交 */
  allowLateSubmit: number;
  publishTime: string | null;
  /** 2=已发布 3=已截止 */
  status: number;
  statusName: string;
  /** 是否已提交过 */
  submitted: boolean;
  /** 已提交题目数 */
  submittedQuestionCount: number;
  lastSubmitTime: string | null;
  /** 0=待批改 1=批改完成 2=批改失败 */
  gradingStatus: number;
  gradingStatusName: string;
  /** 批改完成前为 null */
  studentScore: number | null;
  /** 是否已过截止时间（后端按服务器时间判定，前端不再自己算） */
  expired: boolean;
  /** 当前是否还能提交 */
  canSubmit: boolean;
}

/** GET /api/exam/homework/my-list 分页数据 */
export type StudentHomeworkPage = PageResponse<StudentHomeworkItem>;

// ==================== 学生端作业作答（teach 模块） ====================

/**
 * GET /api/teach/homework/student/brief 返回
 * 只给作业元信息与题目快照 ID 列表，题干要按 ID 逐题懒加载。
 * 注意 questionIds 里是**作业题目快照 ID**（teach_homework_question.id），不是题库题目 ID。
 */
export interface StudentHomeworkBrief {
  homeworkId: number;
  title: string;
  /** 作业要求 / 说明 */
  content: string;
  chapterId: number;
  /** 后端目前恒为 null，展示时回退到 chapterId */
  chapterName: string | null;
  questionCount: number;
  totalScore: number;
  deadline: string | null;
  /** 1=允许逾期提交 */
  allowLateSubmit: number;
  publishTime: string | null;
  /** 2=已发布 3=已截止 */
  status: number;
  statusName: string;
  /** 题目快照 ID，按 sortOrder 升序 */
  questionIds: number[];
}

/** 作业题目选项（选择题才有） */
export interface HomeworkQuestionOption {
  /** 选项标识 A/B/C/D */
  key: string;
  value: string;
}

/**
 * GET /api/teach/homework/student/question 返回（去答案）
 *
 * ★ id 是作业题目快照 ID，只用于列表 key / 排序 / 翻页，**不要**拿它提交答案；
 *   提交用的题库 ID 在 questionId 字段（老数据快照可能缺失题库 ID，此时为 null）。
 */
export interface StudentHomeworkQuestion {
  /** 作业题目快照 ID（teach_homework_question.id）——列表 key / 排序用，不是提交用的 ID */
  id: number;
  /**
   * 题库题目 ID（exam_question.id）。
   * 提交作业时 answers[].questionId 必须填这个；为 null 说明是缺题库 ID 的老快照，该题不可提交。
   */
  questionId: number | null;
  content: string;
  /** 一话题名，可为空 */
  shortTitle?: string | null;
  /** 渲染参数：选择题 choiceMode、填空题 blankCount */
  renderConfig?: QuestionRenderConfig | null;
  /** 题型码值 1~6 */
  type: number;
  typeName?: string;
  /** 非选择题为 null */
  options: HomeworkQuestionOption[] | null;
  /** 编程题代码框架（发布时固化的快照），用于初始化编辑器 */
  codeFramework?: string | null;
  /** 作答要求（主观题/编程题），未配置为 null */
  requirements?: string[] | null;
  /** 阶梯提示，由浅入深，不计分；未配置为 null */
  hints?: string[] | null;
  score: number;
  /** 从 1 开始 */
  sortOrder: number;
}

/**
 * 作答区组件（AnswerArea）渲染所需要的题目形状。
 * 刷题详情、作业作答两处的题目结构不同（选项一个是字符串数组、一个是 {key,value}），
 * 页面各自映射成这个形状再传给组件，组件不关心题目从哪来。
 */
export interface AnswerAreaQuestion {
  id: number;
  /** 题型码值 1~6 */
  type: number;
  content: string;
  /** 选项文本，可带「A.」前缀（渲染时去掉后统一编号） */
  options?: string[];
  /** 选项标识，缺省按 A/B/C 顺序生成 */
  optionKeys?: string[];
  renderConfig?: QuestionRenderConfig | null;
  /** 编程题的初始框架代码 */
  codeFramework?: string;
}

