/**
 * 学生学习模块 API（后端 /api/study/*）
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

/**
 * POST /api/study/code/run —— 提交 Java 代码，后端编译运行后返回结果
 * 请求体 { codeContent, chapterId?, questionId? }
 */
export async function runCode(data: CodeRunRequest): Promise<CodeRunResult> {
  const res = await axiosInstance.post('/api/study/code/run', data);
  return (res.data ?? res) as CodeRunResult;
}

/**
 * POST /api/study/code/debug —— 调试模式，无论成败都调用代码调试智能体
 * 请求体与出参同 code/run
 */
export async function debugCode(data: CodeRunRequest): Promise<CodeDebugResult> {
  const res = await axiosInstance.post('/api/study/code/debug', data);
  return (res.data ?? res) as CodeDebugResult;
}

/**
 * POST /api/study/progress/save —— 保存当前登录学生的章节进度
 * 请求体 { chapterId, progressRate, studyDuration, isCompleted }，用户身份由登录态推断；返回受影响记录数
 */
export async function saveProgress(data: ProgressSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/study/progress/save', data);
  return Number(res.data ?? res ?? 0);
}

/**
 * GET /api/study/progress/get?courseId —— 当前登录学生在该课程下的所有章节进度
 */
export async function fetchProgress(courseId: number): Promise<StudyProgress[]> {
  const res = await axiosInstance.get('/api/study/progress/get', { params: { courseId } });
  return (res.data ?? res ?? []) as StudyProgress[];
}

/**
 * POST /api/study/practice/submit —— 正式提交作答
 * 请求体 { questionId, answerContent?, duration?, attemptCount?, practiceMode? }，questionId 必填
 * 后端流程：判题 → 调调试智能体 → 写运行记录 → upsert 练习记录与题目状态
 */
export async function submitPractice(data: PracticeSubmitRequest): Promise<PracticeSubmitResult> {
  const res = await axiosInstance.post('/api/study/practice/submit', data);
  return (res.data ?? res) as PracticeSubmitResult;
}

/**
 * POST /api/study/practice/draft —— 保存草稿，不判题、不调智能体、不产生运行记录
 * 接口幂等，重复提交同一内容无副作用；调用方需自行节流（如 1s 内合并）
 * openapi 未声明该接口的请求体，字段名以联调结果为准
 */
export async function savePracticeDraft(data: PracticeDraftRequest): Promise<string> {
  const res = await axiosInstance.post('/api/study/practice/draft', data);
  return String(res.data ?? res ?? '');
}

/**
 * GET /api/study/practice/detail?questionId —— 某题作答详情（含最新一次运行结果摘要）
 * 未作答时返回空结构而非 404
 * openapi 把该 data 声明为 string，实际为 JSON 对象，故以 unknown 承接并由调用方逐字段容错
 */
export async function fetchPracticeDetail(questionId: number): Promise<PracticeRecordDetail> {
  const res = await axiosInstance.get('/api/study/practice/detail', { params: { questionId } });
  return (res.data ?? res) as PracticeRecordDetail;
}

/**
 * GET /api/study/code/record/list —— 本人代码运行记录分页
 * 查询参数 { chapterId?, questionId?, pageNum?, pageSize? }；列表不含代码大字段
 */
export async function fetchCodeRecords(params: CodeRecordQuery): Promise<PageResponse<CodeRecordItem>> {
  const res = await axiosInstance.get('/api/study/code/record/list', { params });
  return (res.data ?? res) as PageResponse<CodeRecordItem>;
}

/**
 * GET /api/study/code/record/detail?recordId —— 单条运行记录详情
 * 含代码、用例明细与 AI 调试字段；openapi 同样把 data 声明为 string，需联调后收紧类型
 */
export async function fetchCodeRecordDetail(recordId: number): Promise<CodeRecordDetail> {
  const res = await axiosInstance.get('/api/study/code/record/detail', { params: { recordId } });
  return (res.data ?? res) as CodeRecordDetail;
}
