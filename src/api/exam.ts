/**
 * 智能考评模块 API（后端 /api/exam/*）
 * 负责人：【B 考核题库与作业】
 */
import axiosInstance from '@/api';
import type {
  HomeworkGradingResult,
  HomeworkSubmitRequest,
  JudgeTestCase,
  PracticeQuestionDetail,
  PracticeQuestionPage,
  PracticeQuestionQuery,
  QuestionAdminItem,
  QuestionAdminPage,
  QuestionAdminQuery,
  QuestionGenerateRequest,
  QuestionSaveRequest,
  RandomQuestionRequest,
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

function toNumberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

/** 管理端列表 VO / 详情实体 / 随机抽题实体 → 统一的前端展示结构 */
function normalizeAdminItem(raw: unknown): QuestionAdminItem {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(src.id ?? 0),
    content: String(src.content ?? ''),
    type: (src.type as string | number | undefined) ?? '',
    typeDesc: toStringValue(src.typeDesc),
    options: toOptions(src.options),
    requirements: toStringList(src.requirements),
    codeFramework: toStringValue(src.codeFramework),
    hints: toStringList(src.hints),
    relatedQuestionIds: toNumberList(src.relatedQuestionIds),
    answer: toStringValue(src.answer),
    analysis: toStringValue(src.analysis),
    solutionOutline: toStringValue(src.solutionOutline),
    chapterId: toNumber(src.chapterId),
    difficulty: (src.difficulty as string | number | undefined) ?? undefined,
    difficultyScore: toNumber(src.difficultyScore),
    cognitiveLevel: toStringValue(src.cognitiveLevel),
    abilityDimensions: toStringList(src.abilityDimensions),
    commonMistakes: toStringList(src.commonMistakes),
    knowledgePointIds: toNumberList(src.knowledgePointIds),
    score: toNumber(src.score),
    weight: toNumber(src.weight),
    judgeMode: toNumber(src.judgeMode),
    testCases: Array.isArray(src.testCases) ? (src.testCases as JudgeTestCase[]) : [],
    submitCount: toNumber(src.submitCount),
    acceptedCount: toNumber(src.acceptedCount),
    acceptanceRate: toNumber(src.acceptanceRate),
    createTime: toStringValue(src.createTime),
    updateTime: toStringValue(src.updateTime),
    deleted: toNumber(src.deleted) ?? 0,
  };
}

// ==================== AI 出题 / 作业提交 ====================

/**
 * POST /api/exam/question/generate —— AI 生成题目
 * 后端异步出题并直接落库，data 只返回批次标识，题目内容需通过题库列表接口回读。
 */
export async function generateQuestions(data: QuestionGenerateRequest): Promise<number> {
  const res = await axiosInstance.post('/api/exam/question/generate', data);
  return Number(unwrap<number>(res) ?? 0);
}

/** POST /api/exam/homework/submit —— 学生提交作业答案，返回后端提示语 */
export async function submitHomework(data: HomeworkSubmitRequest): Promise<string> {
  const res = await axiosInstance.post('/api/exam/homework/submit', data);
  return apiMessage(res);
}

// ==================== 题库管理（管理端） ====================

/** GET /api/exam/question/admin/list?chapterId&type&difficulty&keyword&pageNum&pageSize */
export async function fetchQuestionAdminList(
  params: QuestionAdminQuery,
): Promise<QuestionAdminPage> {
  const res = await axiosInstance.get('/api/exam/question/admin/list', { params });
  const page = unwrap<QuestionAdminPage>(res);
  return {
    records: (page?.records ?? []).map(normalizeAdminItem),
    total: Number(page?.total ?? 0),
    current: Number(page?.current ?? params.pageNum),
    size: Number(page?.size ?? params.pageSize),
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

/** PUT /api/exam/question/admin/update（修改，请求体需带 id，返回提示语） */
export async function updateQuestion(data: QuestionSaveRequest): Promise<string> {
  const res = await axiosInstance.put('/api/exam/question/admin/update', data);
  return apiMessage(res);
}

/** DELETE /api/exam/question/admin/delete/{id}（逻辑删除） */
export async function deleteQuestion(id: number): Promise<string> {
  const res = await axiosInstance.delete(`/api/exam/question/admin/delete/${id}`);
  return apiMessage(res);
}

/** POST /api/exam/question/admin/random（按章节随机抽题，不调智能体，返回题目数组） */
export async function randomQuestions(data: RandomQuestionRequest): Promise<QuestionAdminItem[]> {
  const res = await axiosInstance.post('/api/exam/question/admin/random', data);
  const list = unwrap<unknown[]>(res);
  return Array.isArray(list) ? list.map(normalizeAdminItem) : [];
}

// ==================== 学生刷题 ====================

/** GET /api/exam/question/practice/list（不含答案，只下发示例用例） */
export async function fetchPracticeList(
  params: PracticeQuestionQuery,
): Promise<PracticeQuestionPage> {
  const res = await axiosInstance.get('/api/exam/question/practice/list', { params });
  const page = unwrap<PracticeQuestionPage>(res);
  return {
    records: page?.records ?? [],
    total: Number(page?.total ?? 0),
    current: Number(page?.current ?? params.pageNum ?? 1),
    size: Number(page?.size ?? params.pageSize ?? 10),
  };
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
