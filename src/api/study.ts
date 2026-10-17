/**
 * 学生学习模块 API（后端 /api/study/*）
 * 负责人：【B 学生学习】
 * 标了「未实现」的函数已固定路径 / 入参 / 出参类型，实现方替换 throw 即可，页面侧无需改签名。
 */
import axiosInstance from '@/api';
import type { PageResponse } from '@/types';
import type {
  CodeDebugResult,
  CodeRecordDetail,
  CodeRecordItem,
  CodeRecordQuery,
  CodeRunRequest,
  CodeRunResult,
  PracticeDraftRequest,
  PracticeRecordDetail,
  PracticeSubmitRequest,
  PracticeSubmitResult,
  ProgressSaveRequest,
  StudyProgress,
} from '@/types/study';

// ==================== 已对接 ====================

/** POST /api/study/code/run —— 提交 Java 代码，后端编译运行后返回结果 */
export async function runCode(data: CodeRunRequest): Promise<CodeRunResult> {
  const res = await axiosInstance.post('/api/study/code/run', data);
  return (res.data ?? res) as CodeRunResult;
}

/** POST /api/study/code/debug —— 调试模式，无论成败都调用代码调试智能体 */
export async function debugCode(data: CodeRunRequest): Promise<CodeDebugResult> {
  const res = await axiosInstance.post('/api/study/code/debug', data);
  return (res.data ?? res) as CodeDebugResult;
}

/** POST /api/study/progress/save —— 保存当前登录学生进度，返回受影响记录数 */
export async function saveProgress(data: ProgressSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/study/progress/save', data);
  return Number(res.data ?? res ?? 0);
}

// ==================== 学习进度读取（未实现） ====================

/** 未实现：GET /api/study/progress/get?courseId=（返回该课程下所有章节进度数组） */
export async function fetchProgress(
  _courseId: number): Promise<StudyProgress[]> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/study/progress/get', { params: { courseId } });
  // return (res.data ?? res ?? []) as StudyProgress[];
  throw new Error('未实现：GET /api/study/progress/get');
}

// ==================== 练习作答（未实现） ====================

/** 未实现：POST /api/study/practice/submit（判题 → 调调试智能体 → 写运行记录 → upsert 练习记录） */
export async function submitPractice(_data: PracticeSubmitRequest): Promise<PracticeSubmitResult> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/study/practice/submit', data);
  // return (res.data ?? res) as PracticeSubmitResult;
  throw new Error('未实现：POST /api/study/practice/submit');
}

/**
 * 未实现：POST /api/study/practice/draft（幂等保存草稿，不判题、不产生运行记录）
 * openapi 未声明该接口 body，实现前先与后端确认字段名；前端需自行节流（如 1s 内合并）。
 */
export async function savePracticeDraft(_data: PracticeDraftRequest): Promise<string> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/study/practice/draft', data);
  // return String(res.data ?? res ?? '');
  throw new Error('未实现：POST /api/study/practice/draft');
}

/**
 * 未实现：GET /api/study/practice/detail?questionId=
 * 后端未作答时返回空结构而非 404；openapi 把 data 声明成 string，属文档缺口，实现时按真实 JSON 收紧类型。
 */
export async function fetchPracticeDetail(_questionId: number): Promise<PracticeRecordDetail> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/study/practice/detail', { params: { questionId } });
  // return (res.data ?? res) as PracticeRecordDetail;
  throw new Error('未实现：GET /api/study/practice/detail');
}

// ==================== 代码运行记录（未实现） ====================

/** 未实现：GET /api/study/code/record/list（列表不含代码大字段） */
export async function fetchCodeRecords(
  _params: CodeRecordQuery): Promise<PageResponse<CodeRecordItem>> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/study/code/record/list', { params });
  // return (res.data ?? res) as PageResponse<CodeRecordItem>;
  throw new Error('未实现：GET /api/study/code/record/list');
}

/**
 * 未实现：GET /api/study/code/record/detail?recordId=
 * 按描述含代码、用例明细与 AI 调试字段；openapi 把 data 声明成 string，属文档缺口。
 */
export async function fetchCodeRecordDetail(_recordId: number): Promise<CodeRecordDetail> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/study/code/record/detail', { params: { recordId } });
  // return (res.data ?? res) as CodeRecordDetail;
  throw new Error('未实现：GET /api/study/code/record/detail');
}
