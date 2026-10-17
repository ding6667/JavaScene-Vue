/**
 * 答疑服务 API（后端 /api/qa/*，契约见 openapi-qa.json）
 * 负责人：【A 答疑与知识】
 * 三个接口后端均已提供，前端目前走通用对话流 /api/chat/streamChat（见 api/chat.ts），以下均为待实现桩。
 */
import type {
  QaAnswerResult,
  QaAskRequest,
  QaHistoryItem,
  QaHistoryQuery,
} from '@/types/qa';
import type { PageResponse } from '@/types';

/**
 * 未实现：POST /api/qa/ask —— 学生提问，同步返回完整答案
 * 首轮不传 sessionId，后端生成后在响应里回传，续问需带上以便 roundNo 连续。
 */
export async function askQuestion(_data: QaAskRequest): Promise<QaAnswerResult> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/qa/ask', data);
  // return (res.data ?? res) as QaAnswerResult;
  throw new Error('未实现：POST /api/qa/ask');
}

/** 未实现：GET /api/qa/history —— 分页查询本人历史问答 */
export async function fetchQaHistory(_params: QaHistoryQuery): Promise<PageResponse<QaHistoryItem>> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/qa/history', { params });
  // return (res.data ?? res) as PageResponse<QaHistoryItem>;
  throw new Error('未实现：GET /api/qa/history');
}

/**
 * 未实现：GET /api/qa/answer/stream —— 答疑流式问答（SSE，支持 chapterId 章节限定）
 * 与 chat.ts 的 streamChat 用法一致，返回原生 Response 供调用方逐块解析；
 * 需要 axios 时请 import axiosInstance，SSE 场景直接用 fetch + Authorization 头。
 */
export async function streamQaAnswer(
  _question: string, 
  _chapterId?: number, 
  _sessionId?: string): Promise<Response> {
  // TODO(学生实现)：
  // const params = new URLSearchParams({ question });
  // if (chapterId != null) params.set('chapterId', String(chapterId));
  // if (sessionId) params.set('sessionId', sessionId);
  // const token = localStorage.getItem('auth_token') ?? '';
  // return fetch(`/api/qa/answer/stream?${params.toString()}`, {
  //   headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
  // });
  throw new Error('未实现：GET /api/qa/answer/stream');
}
