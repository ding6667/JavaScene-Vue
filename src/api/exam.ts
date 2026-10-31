/**
 * 智能考评模块 API（后端 /api/exam/*）
 * 负责人：【B 考核题库与作业】
 */
import axiosInstance from '@/api';
import { typeCodeOf } from '@/utils/questionCode';
import type {
  DifficultyConfig,
  HomeworkGradingResult,
  HomeworkSubmitRequest,
  JudgeTestCase,
  MyHomeworkQuery,
  PracticeQuestionDetail,
  PracticeQuestionItem,
  PracticeQuestionPage,
  PracticeQuestionQuery,
  QuestionAdminItem,
  QuestionAdminPage,
  QuestionAdminQuery,
  QuestionAnswer,
  QuestionGenerateRequest,
  QuestionRenderConfig,
  QuestionSaveRequest,
  RandomQuestionRequest,
  HomeworkQuestionOption,
  StudentHomeworkBrief,
  StudentHomeworkItem,
  StudentHomeworkPage,
  StudentHomeworkQuestion,
  WrongQuestionItem,
} from '@/types/exam';

// ==================== 响应解包 ====================
// 响应拦截器已把 AxiosResponse 替换为后端响应体 { code, message, data }
function unwrap<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as { data?: T }).data as T;
  }
  return res as T;
}

function apiMessage(res: unknown): string {
  if (res && typeof res === 'object' && 'message' in res) {
    return String((res as { message?: unknown }).message ?? '');
  }
  return '';
}

/**
 * 写接口的成功提示一律用本地文案，不再透传后端 message。
 *
 * 这几个写接口的成功响应是 `{ code, data: null }` 的空 Result，本身不携带可展示的提示；
 * 之前把 message 直接弹出来，出现过「保存题目却提示登录成功」这类串台文案——
 * 提示语和动作对不上，老师会以为点击保存触发了登录。
 * 开发环境把后端 message 打到控制台，方便核对接口实际返回了什么（不参与 UI 决策）。
 */
function traceSuccess(api: string, res: unknown): void {
  if (!import.meta.env.DEV) return;
  const raw = apiMessage(res).trim();
  if (raw) console.info(`[${api}] 后端 message：${raw}（已忽略，成功提示使用本地文案）`);
}

/** 管理端 options 在列表接口是数组、详情/随机抽题是 JSON 字符串，统一转数组 */
function toOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? ''));
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? ''));
    return [String(parsed)];
  } catch {
    return [text];
  }
}

function toNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function toStringValue(raw: unknown): string | undefined {
  return raw === null || raw === undefined ? undefined : String(raw);
}

function toStringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((item) => String(item ?? '')) : [];
}

/** 可选字符串列表：未配置给 null（不让页面区分「空数组」与「未配置」） */
function toStringListOrNull(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map((item) => String(item ?? '').trim()).filter(Boolean);
  return list.length ? list : null;
}

function toNumberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

/**
 * 管理端 answer 现在是结构化对象（/list、/admin/{id}、/random 一致）：
 * {"correct":["A"]} / {"correct":true} / {"blanks":[...]} / {"output":"9"} / {"reference":"..."}。
 * 这里再兜一层历史数据：早期存的是 "A,B" 这类纯文本或 JSON 字符串，同样解析成对象。
 */
function normalizeAnswer(raw: unknown): QuestionAnswer | undefined {
  let data = raw;
  if (typeof data === 'string') {
    const text = data.trim();
    if (!text) return undefined;
    try {
      data = JSON.parse(text);
    } catch {
      // 旧数据是纯文本答案：按参考答案处理
      return { reference: text };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;

  const src = data as Record<string, unknown>;
  const answer: QuestionAnswer = {};
  if (typeof src.correct === 'boolean') answer.correct = src.correct;
  else if (Array.isArray(src.correct)) answer.correct = src.correct.map((v) => String(v));
  else if (typeof src.correct === 'string') answer.correct = [src.correct];
  if (Array.isArray(src.blanks)) answer.blanks = src.blanks.map((v) => String(v));
  if (typeof src.reference === 'string') answer.reference = src.reference;
  if (typeof src.output === 'string') answer.output = src.output;
  return Object.keys(answer).length ? answer : undefined;
}

/**
 * 测试用例：管理端 VO（QuestionTestCaseVO）字段比学生端多 weight / description，
 * 且可能缺项或给 null；统一补齐成 JudgeTestCase，保证抽屉回填的 JSON 干净、再提交不丢用例配置。
 */
function toTestCases(raw: unknown): JudgeTestCase[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const src = (item ?? {}) as Record<string, unknown>;
    return {
      caseIndex: toNumber(src.caseIndex) ?? index + 1,
      input: String(src.input ?? ''),
      expectedOutput: String(src.expectedOutput ?? ''),
      isSample: Boolean(src.isSample),
      caseType: String(src.caseType ?? 'normal'),
      weight: toNumber(src.weight) ?? 1,
      timeLimit: toNumber(src.timeLimit) ?? 1000,
      memoryLimit: toNumber(src.memoryLimit) ?? 256,
      description: String(src.description ?? ''),
    };
  });
}

/** 渲染参数：只保留认识的键，缺项/null 一律给 undefined（页面按题型兜底） */
function toRenderConfig(raw: unknown): QuestionRenderConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const config: QuestionRenderConfig = {};
  const mode = String(src.choiceMode ?? '').trim().toLowerCase();
  if (mode === 'single' || mode === 'multiple') config.choiceMode = mode;
  const blankCount = toNumber(src.blankCount);
  if (blankCount !== undefined && blankCount > 0) config.blankCount = blankCount;
  if (typeof src.language === 'string' && src.language.trim()) config.language = src.language.trim();
  return Object.keys(config).length ? config : undefined;
}

/** 管理端列表 VO / 详情 VO / 随机抽题 VO → 统一的前端展示结构 */
function normalizeAdminItem(raw: unknown): QuestionAdminItem {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(src.id ?? 0),
    content: String(src.content ?? ''),
    shortTitle: toStringValue(src.shortTitle) ?? null,
    renderConfig: toRenderConfig(src.renderConfig) ?? null,
    // VO 给码值，实体给 CHOICE/FILL_IN 这类枚举名，统一成码值
    type: typeCodeOf(src.type as string | number | undefined),
    typeDesc: toStringValue(src.typeDesc),
    options: toOptions(src.options),
    requirements: toStringList(src.requirements),
    codeFramework: toStringValue(src.codeFramework),
    hints: toStringList(src.hints),
    relatedQuestionIds: toNumberList(src.relatedQuestionIds),
    answer: normalizeAnswer(src.answer),
    analysis: toStringValue(src.analysis),
    solutionOutline: toStringValue(src.solutionOutline),
    chapterId: toNumber(src.chapterId),
    difficultyConfigId: toNumber(src.difficultyConfigId),
    difficultyName: toStringValue(src.difficultyName),
    difficultyScore: toNumber(src.difficultyScore),
    cognitiveLevel: toStringValue(src.cognitiveLevel),
    abilityDimensions: toStringList(src.abilityDimensions),
    commonMistakes: toStringList(src.commonMistakes),
    knowledgePointIds: toNumberList(src.knowledgePointIds),
    score: toNumber(src.score),
    weight: toNumber(src.weight),
    judgeMode: toNumber(src.judgeMode),
    testCases: toTestCases(src.testCases),
    submitCount: toNumber(src.submitCount),
    acceptedCount: toNumber(src.acceptedCount),
    acceptanceRate: toNumber(src.acceptanceRate),
    createTime: toStringValue(src.createTime),
    updateTime: toStringValue(src.updateTime),
    deleted: toNumber(src.deleted) ?? 0,
  };
}

/**
 * 分页结构兼容：后端 PageResult 两种形态都见过——{ list, total } 与 { records, total, current, size }，
 * 页码字段也可能是 pageNum / pageSize，这里统一成前端口径，避免列表莫名空白。
 */
function normalizePage<T>(
  raw: unknown,
  fallbackNum: number,
  fallbackSize: number,
): { records: T[]; total: number; current: number; size: number } {
  const src = (raw ?? {}) as Record<string, unknown>;
  const rawList = src.records ?? src.list ?? src.rows;
  const list = Array.isArray(rawList) ? (rawList as T[]) : [];
  return {
    records: list,
    total: Number(src.total ?? list.length) || 0,
    current: Number(src.current ?? src.pageNum ?? fallbackNum) || fallbackNum,
    size: Number(src.size ?? src.pageSize ?? fallbackSize) || fallbackSize,
  };
}

// ==================== 难度配置 ====================

/**
 * GET /api/exam/difficulty-config/list?chapterId= —— 可选难度列表
 * 只返回启用中的配置（系统预设 + 当前教师自建）；所有难度下拉框都由这里渲染，
 * 前端不再硬编码 1/2/3 或名称。chapterId 传入时附带该章节的专属配置。
 */
export async function fetchDifficultyConfigs(chapterId?: number): Promise<DifficultyConfig[]> {
  const res = await axiosInstance.get('/api/exam/difficulty-config/list', {
    params: chapterId ? { chapterId } : {},
    // 学生端练习页 / 错题本也用它渲染难度下拉。后端若只对教师、管理员开放这个只读接口，
    // 学生拿到的是 403；这属于角色不匹配而非越权，不许触发强制下线，下拉留空即可。
    skipForbiddenLogout: true,
  });
  const list = unwrap<unknown>(res);
  return Array.isArray(list) ? (list as DifficultyConfig[]) : [];
}

// ==================== AI 出题 / 作业提交 ====================

/**
 * POST /api/exam/question/generate —— AI 生成题目
 * 后端异步出题并直接落库，data 是 1=已受理 / 0=失败（不是批次号），题目内容要通过题库列表接口回读。
 */
export async function generateQuestions(data: QuestionGenerateRequest): Promise<number> {
  const res = await axiosInstance.post('/api/exam/question/generate', data);
  return Number(unwrap<number>(res) ?? 0);
}

/**
 * POST /api/exam/homework/submit —— 学生提交作业答案（整份 answers[] 一次提交）
 * 成功响应 data 为 null，没有可展示文本；提示语由页面用固定文案。
 */
export async function submitHomework(data: HomeworkSubmitRequest): Promise<void> {
  const res = await axiosInstance.post('/api/exam/homework/submit', data);
  traceSuccess('exam/homework/submit', res);
}

// ==================== 我的作业（学生本人） ====================

/**
 * 列表项兜底：字段可能缺项或给 null，统一补齐成前端可安全渲染的结构。
 * submitted / canSubmit / expired 后端给的是布尔，个别版本会给 0/1，这里一并兼容。
 */
function normalizeHomeworkItem(raw: unknown): StudentHomeworkItem {
  const src = (raw ?? {}) as Record<string, unknown>;
  const num = toNumber(src.totalScore);
  const score = toNumber(src.studentScore);
  return {
    homeworkId: (src.homeworkId as number) ?? 0,
    title: String(src.title ?? '').trim(),
    content: String(src.content ?? ''),
    chapterId: toNumber(src.chapterId) ?? 0,
    chapterName: toStringValue(src.chapterName) ?? null,
    questionCount: toNumber(src.questionCount) ?? 0,
    totalScore: num ?? 0,
    deadline: toStringValue(src.deadline) ?? null,
    allowLateSubmit: toNumber(src.allowLateSubmit) ?? 0,
    publishTime: toStringValue(src.publishTime) ?? null,
    status: toNumber(src.status) ?? 0,
    statusName: String(src.statusName ?? ''),
    submitted: Boolean(src.submitted),
    submittedQuestionCount: toNumber(src.submittedQuestionCount) ?? 0,
    lastSubmitTime: toStringValue(src.lastSubmitTime) ?? null,
    gradingStatus: toNumber(src.gradingStatus) ?? 0,
    gradingStatusName: String(src.gradingStatusName ?? ''),
    studentScore: score === undefined ? null : score,
    expired: Boolean(src.expired),
    canSubmit: Boolean(src.canSubmit),
  };
}

/**
 * GET /api/exam/homework/my-list —— 当前登录学生的作业列表
 *
 * 口径（与后端约定一致）：
 *   - 不带 status = 已发布 + 已截止（2+3）
 *   - classId / grade 一律不传：后端按当前登录学生补，传了也不生效
 *   - pageNum / pageSize < 1 时后端按 1 / 10 兜底，这里先归一化，避免 null 值被拼进 query
 */
export async function fetchMyHomeworks(params: MyHomeworkQuery): Promise<StudentHomeworkPage> {
  const pageNum = Math.max(1, Number(params.pageNum) || 1);
  const pageSize = Math.max(1, Number(params.pageSize) || 10);
  const query: Record<string, unknown> = { pageNum, pageSize };
  if (Number(params.status) === 2 || Number(params.status) === 3) query.status = Number(params.status);
  if (Number(params.chapterId) > 0) query.chapterId = Number(params.chapterId);
  if (params.onlyNotExpired) query.onlyNotExpired = true;

  const res = await axiosInstance.get('/api/exam/homework/my-list', { params: query });
  const page = normalizePage<unknown>(unwrap<unknown>(res), pageNum, pageSize);
  return {
    records: page.records.map(normalizeHomeworkItem),
    total: page.total,
    current: page.current,
    size: page.size,
  };
}


// ==================== 学生端作业作答（teach 模块） ====================

/** 作业题目：选项是 {key,value} 对象数组，非选择题给 null，这里统一成对象数组 */
function toHomeworkOptions(raw: unknown): HomeworkQuestionOption[] | null {
  if (!Array.isArray(raw)) return null;
  const list: HomeworkQuestionOption[] = [];
  raw.forEach((item, index) => {
    if (item === null || item === undefined) return;
    if (typeof item === 'string') {
      list.push({ key: String.fromCharCode(65 + index), value: item });
      return;
    }
    const src = item as Record<string, unknown>;
    list.push({
      key: String(src.key ?? '').trim() || String.fromCharCode(65 + index),
      value: String(src.value ?? ''),
    });
  });
  return list.length ? list : null;
}

/**
 * GET /api/teach/homework/student/brief —— 作业简短信息 + 题目快照 ID 列表
 * 只有 status 2（已发布）/ 3（已截止）可查，草稿与归档会返回 400。
 */
export async function fetchStudentHomeworkBrief(
  homeworkId: number,
): Promise<StudentHomeworkBrief> {
  const res = await axiosInstance.get('/api/teach/homework/student/brief', {
    params: { homeworkId },
  });
  const data = unwrap<Record<string, unknown>>(res);
  if (!data) throw new Error('作业不存在或不可查看');
  const src = data as Record<string, unknown>;
  const ids = Array.isArray(src.questionIds)
    ? src.questionIds.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
    : [];
  return {
    homeworkId: toNumber(src.homeworkId) ?? homeworkId,
    title: String(src.title ?? '').trim(),
    content: String(src.content ?? ''),
    chapterId: toNumber(src.chapterId) ?? 0,
    chapterName: toStringValue(src.chapterName) ?? null,
    questionCount: toNumber(src.questionCount) ?? ids.length,
    totalScore: toNumber(src.totalScore) ?? 0,
    deadline: toStringValue(src.deadline) ?? null,
    allowLateSubmit: toNumber(src.allowLateSubmit) ?? 0,
    publishTime: toStringValue(src.publishTime) ?? null,
    status: toNumber(src.status) ?? 0,
    statusName: String(src.statusName ?? ''),
    questionIds: ids,
  };
}

/**
 * GET /api/teach/homework/student/question —— 按快照 ID 查单题（不含答案/解析）
 * 逐题懒加载，避免一次把整份作业的题干全拉下来。
 *
 * 注意入参是**作业题目快照 ID**，返回里的 `id` 也是快照 ID；
 * 提交答案要用的题库 ID 是返回里的 `questionId`（老数据可能为 null）。
 */
export async function fetchStudentHomeworkQuestion(
  questionId: number,
): Promise<StudentHomeworkQuestion> {
  const res = await axiosInstance.get('/api/teach/homework/student/question', {
    params: { questionId },
  });
  const data = unwrap<Record<string, unknown>>(res);
  if (!data) throw new Error('题目不存在或不可查看');
  const src = data as Record<string, unknown>;
  const bankId = toNumber(src.questionId);
  return {
    id: toNumber(src.id) ?? questionId,
    // only 正数才算合法题库 ID；缺失/0 视为老快照，该题不可提交
    questionId: bankId && bankId > 0 ? bankId : null,
    content: String(src.content ?? ''),
    shortTitle: toStringValue(src.shortTitle) ?? null,
    renderConfig: toRenderConfig(src.renderConfig) ?? null,
    type: toNumber(src.type) ?? 0,
    typeName: toStringValue(src.typeName),
    options: toHomeworkOptions(src.options),
    codeFramework: toStringValue(src.codeFramework) ?? null,
    requirements: toStringListOrNull(src.requirements),
    hints: toStringListOrNull(src.hints),
    score: toNumber(src.score) ?? 0,
    sortOrder: toNumber(src.sortOrder) ?? 0,
  };
}



// ==================== 题库管理（管理端） ====================

/** GET /api/exam/question/admin/list?chapterId&type&difficulty&keyword&pageNum&pageSize */
export async function fetchQuestionAdminList(
  params: QuestionAdminQuery,
): Promise<QuestionAdminPage> {
  const res = await axiosInstance.get('/api/exam/question/admin/list', { params });
  const page = normalizePage<unknown>(unwrap<unknown>(res), params.pageNum, params.pageSize);
  return {
    records: page.records.map(normalizeAdminItem),
    total: page.total,
    current: page.current,
    size: page.size,
  };
}

/** GET /api/exam/question/admin/{id}（含答案与解析） */
export async function fetchQuestionAdminDetail(id: number): Promise<QuestionAdminItem> {
  const res = await axiosInstance.get(`/api/exam/question/admin/${id}`);
  const data = unwrap<unknown>(res);
  if (!data) throw new Error('题目不存在');
  return normalizeAdminItem(data);
}

/** POST /api/exam/question/admin/save（新增，返回题目 ID） */
export async function createQuestion(data: QuestionSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/exam/question/admin/save', data);
  return Number(unwrap<number>(res) ?? 0);
}

/**
 * PUT /api/exam/question/admin/update（修改，请求体需带 id）
 * 成功提示由页面使用固定文案，接口这里返回空串（后端 data 为 null，没有可展示文本）。
 */
export async function updateQuestion(data: QuestionSaveRequest): Promise<void> {
  const res = await axiosInstance.put('/api/exam/question/admin/update', data);
  traceSuccess('exam/question/admin/update', res);
}

/** DELETE /api/exam/question/admin/delete/{id}（逻辑删除） */
export async function deleteQuestion(id: number): Promise<void> {
  const res = await axiosInstance.delete(`/api/exam/question/admin/delete/${id}`);
  traceSuccess('exam/question/admin/delete', res);
}

/**
 * POST /api/exam/question/admin/random —— 按题型（可选再按难度档）配比抽题
 * 返回体是 Map<题型码, 题目数组>，这里按返回顺序拍平；某档题量不足时后端按实际数量给，
 * 调用方要拿「请求数 vs 实抽数」自己比对提示。
 * 注意：这里返回的是数据库实体，type 是枚举名、options 是 JSON 字符串、answer 是 JSON 对象，
 * 且只有 difficultyConfigId 没有 difficultyName。
 */
export async function randomQuestions(data: RandomQuestionRequest): Promise<QuestionAdminItem[]> {
  const res = await axiosInstance.post('/api/exam/question/admin/random', data);
  const map = unwrap<Record<string, unknown>>(res);
  if (!map || typeof map !== 'object') return [];
  const list: QuestionAdminItem[] = [];
  for (const group of Object.values(map)) {
    if (Array.isArray(group)) list.push(...group.map(normalizeAdminItem));
  }
  return list;
}

// ==================== 学生刷题 ====================

/** GET /api/exam/question/practice/list（不含答案，只下发示例用例） */
export async function fetchPracticeList(
  params: PracticeQuestionQuery,
): Promise<PracticeQuestionPage> {
  const res = await axiosInstance.get('/api/exam/question/practice/list', { params });
  const page = normalizePage<PracticeQuestionItem>(
    unwrap<unknown>(res),
    params.pageNum ?? 1,
    params.pageSize ?? 10,
  );
  return page;
}

/** GET /api/exam/question/practice/detail/{id} */
export async function fetchPracticeDetail(id: number): Promise<PracticeQuestionDetail> {
  const res = await axiosInstance.get(`/api/exam/question/practice/detail/${id}`);
  const data = unwrap<PracticeQuestionDetail>(res);
  if (!data) throw new Error('题目不存在');
  return data;
}

// ==================== 错题本 ====================

/** GET /api/exam/wrong-question/list（后端直接返回数组，不分页） */
export async function fetchWrongQuestions(): Promise<WrongQuestionItem[]> {
  const res = await axiosInstance.get('/api/exam/wrong-question/list');
  const list = unwrap<WrongQuestionItem[]>(res);
  return Array.isArray(list) ? list : [];
}

/** PUT /api/exam/wrong-question/mastered/{questionId}（标记已掌握） */
export async function markWrongQuestionMastered(questionId: number): Promise<string> {
  const res = await axiosInstance.put(`/api/exam/wrong-question/mastered/${questionId}`);
  return apiMessage(res);
}

// ==================== 作业批改结果 ====================

/** GET /api/exam/grading/result/{homeworkId}（当前登录学生该次作业的批改结果） */
export async function fetchHomeworkGradingResult(
  homeworkId: number,
): Promise<HomeworkGradingResult> {
  const res = await axiosInstance.get(`/api/exam/grading/result/${homeworkId}`);
  const data = unwrap<HomeworkGradingResult>(res);
  if (!data) throw new Error('批改结果不存在');
  return data;
}
