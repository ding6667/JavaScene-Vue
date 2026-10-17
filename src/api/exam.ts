/**
 * 智能考评模块 API（后端 /api/exam/*）
 * 负责人：【B 考核题库与作业】
 * 标了「未实现」的函数已固定路径 / 入参 / 出参类型，实现方替换 throw 即可，页面侧无需改签名。
 */
import axiosInstance from '@/api';
import type {
  HomeworkGradingResult,
  HomeworkSubmitRequest,
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

// ==================== 已对接 ====================

/**
 * POST /api/exam/question/generate —— AI 生成题目（真实接口）
 * 后端异步出题并直接落库，data 只返回批次标识，题目内容需通过下面的题库列表接口回读。
 */
export async function generateQuestions(data: QuestionGenerateRequest): Promise<number> {
  const res = await axiosInstance.post('/api/exam/question/generate', data);
  return Number(res.data ?? res ?? 0);
}

/** POST /api/exam/homework/submit —— 学生提交作业答案，返回后端提示语 */
export async function submitHomework(data: HomeworkSubmitRequest): Promise<string> {
  const res = await axiosInstance.post('/api/exam/homework/submit', data);
  return String(res.data ?? res ?? '');
}

// ==================== 题库管理（未实现，管理端） ====================

/** 未实现：GET /api/exam/question/admin/list?chapterId&type&page&size */
export async function fetchQuestionAdminList(
  _params: QuestionAdminQuery): Promise<QuestionAdminPage> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/exam/question/admin/list', { params });
  // return (res.data ?? res) as QuestionAdminPage;
  throw new Error('未实现：GET /api/exam/question/admin/list');
}

/** 未实现：GET /api/exam/question/admin/{id}（含答案与解析） */
export async function fetchQuestionAdminDetail(_id: number): Promise<QuestionAdminItem> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get(`/api/exam/question/admin/${id}`);
  // return (res.data ?? res) as QuestionAdminItem;
  throw new Error('未实现：GET /api/exam/question/admin/{id}');
}

/** 未实现：POST /api/exam/question/admin/save（新增，返回题目 ID） */
export async function createQuestion(_data: QuestionSaveRequest): Promise<number> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/exam/question/admin/save', data);
  // return Number(res.data ?? res ?? 0);
  throw new Error('未实现：POST /api/exam/question/admin/save');
}

/** 未实现：PUT /api/exam/question/admin/update（修改，请求体需带 id，返回提示语） */
export async function updateQuestion(_data: QuestionSaveRequest): Promise<string> {
  // TODO(学生实现)：
  // const res = await axiosInstance.put('/api/exam/question/admin/update', data);
  // return String(res.data ?? res ?? '');
  throw new Error('未实现：PUT /api/exam/question/admin/update');
}

/** 未实现：DELETE /api/exam/question/admin/delete/{id}（逻辑删除） */
export async function deleteQuestion(_id: number): Promise<string> {
  // TODO(学生实现)：
  // const res = await axiosInstance.delete(`/api/exam/question/admin/delete/${id}`);
  // return String(res.data ?? res ?? '');
  throw new Error('未实现：DELETE /api/exam/question/admin/delete/{id}');
}

/** 未实现：POST /api/exam/question/admin/random（按章节随机抽题，不调智能体，返回题目数组） */
export async function randomQuestions(_data: RandomQuestionRequest): Promise<QuestionAdminItem[]> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/exam/question/admin/random', data);
  // return (res.data ?? res ?? []) as QuestionAdminItem[];
  throw new Error('未实现：POST /api/exam/question/admin/random');
}

// ==================== 学生刷题（未实现） ====================

/** 未实现：GET /api/exam/question/practice/list（不含答案，只下发示例用例） */
export async function fetchPracticeList(_params: PracticeQuestionQuery): Promise<PracticeQuestionPage> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/exam/question/practice/list', { params });
  // return (res.data ?? res) as PracticeQuestionPage;
  throw new Error('未实现：GET /api/exam/question/practice/list');
}

/** 未实现：GET /api/exam/question/practice/detail/{id} */
export async function fetchPracticeDetail(_id: number): Promise<PracticeQuestionDetail> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get(`/api/exam/question/practice/detail/${id}`);
  // return (res.data ?? res) as PracticeQuestionDetail;
  throw new Error('未实现：GET /api/exam/question/practice/detail/{id}');
}

// ==================== 错题本（未实现） ====================

/** 未实现：GET /api/exam/wrong-question/list（后端直接返回数组，不分页） */
export async function fetchWrongQuestions(): Promise<WrongQuestionItem[]> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/exam/wrong-question/list');
  // return (res.data ?? res ?? []) as WrongQuestionItem[];
  throw new Error('未实现：GET /api/exam/wrong-question/list');
}

/** 未实现：PUT /api/exam/wrong-question/mastered/{questionId}（标记已掌握） */
export async function markWrongQuestionMastered(_questionId: number): Promise<string> {
  // TODO(学生实现)：
  // const res = await axiosInstance.put(`/api/exam/wrong-question/mastered/${questionId}`);
  // return String(res.data ?? res ?? '');
  throw new Error('未实现：PUT /api/exam/wrong-question/mastered/{questionId}');
}

// ==================== 作业批改结果（未实现） ====================

/** 未实现：GET /api/exam/grading/result/{homeworkId}（当前登录学生该次作业的批改结果） */
export async function fetchHomeworkGradingResult(
  _homeworkId: number): Promise<HomeworkGradingResult> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get(`/api/exam/grading/result/${homeworkId}`);
  // return (res.data ?? res) as HomeworkGradingResult;
  throw new Error('未实现：GET /api/exam/grading/result/{homeworkId}');
}
