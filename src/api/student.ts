/**
 * 学生端 API 层
 * 只保留真实请求：路径、请求体与响应字段一律以 openapi.json 为准。
 */
import axiosInstance from '@/api';
import type {
  Chapter,
  CodeDebugResult,
  CodeRunRequest,
  CodeRunResult,
  HomeworkSubmitRequest,
  ProgressSaveRequest,
  QuestionGenerateRequest,
} from '@/types/student';

/** Java 程序设计基础课程 ID（当前后端唯一课程，多课程时需接入课程列表） */
export const DEFAULT_COURSE_ID = 1;

// ---------- GET /api/knowledge/chapter/list?courseId ----------

let chaptersCache: Chapter[] | null = null;
let chaptersInflight: Promise<Chapter[]> | null = null;

/**
 * 章节列表（真实接口）。章节结构会话内基本不变，
 * 用内存缓存 + 单飞复用，避免多个视图重复请求同一接口。
 */
export async function fetchChapters(force = false): Promise<Chapter[]> {
  if (!force && chaptersCache) return chaptersCache;
  if (!force && chaptersInflight) return chaptersInflight;

  const request = (async () => {
    const res = await axiosInstance.get('/api/knowledge/chapter/list', {
      params: { courseId: DEFAULT_COURSE_ID },
    });
    return (res.data ?? res ?? []) as Chapter[];
  })();

  chaptersInflight = request;
  try {
    chaptersCache = await request;
    return chaptersCache;
  } catch (e) {
    chaptersCache = null;
    throw e;
  } finally {
    chaptersInflight = null;
  }
}

/** 单章查询（从章节列表取，命中缓存则不额外请求） */
export async function fetchChapter(chapterId: number): Promise<Chapter | null> {
  const list = await fetchChapters();
  return list.find((c) => c.id === chapterId) ?? null;
}

// ---------- GET /api/knowledge/dataset/query?keywords ----------

/** 单条检索结果 */
export interface KnowledgeSegment {
  segmentId: string;
  content: string;
  score: number;
  documentId: string;
  documentName: string;
  chapterId: number | null;
  page: number;
}

/** 知识点检索 / 教材原文检索（Dify 混合检索，真实接口） */
export async function queryKnowledge(keywords: string): Promise<KnowledgeSegment[]> {
  const res = await axiosInstance.get('/api/knowledge/dataset/query', { params: { keywords } });
  const data = res.data ?? res;
  return (data?.items ?? []) as KnowledgeSegment[];
}

// ---------- POST /api/study/progress/save ----------

/** 保存当前登录学生的学习进度，返回受影响记录数 */
export async function saveProgress(data: ProgressSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/study/progress/save', data);
  return Number(res.data ?? res ?? 0);
}

// ---------- POST /api/study/code/run ----------

/** 提交 Java 代码，后端编译运行后返回结果 */
export async function runCode(data: CodeRunRequest): Promise<CodeRunResult> {
  const res = await axiosInstance.post('/api/study/code/run', data);
  return (res.data ?? res) as CodeRunResult;
}

// ---------- POST /api/study/code/debug ----------

/** 调试模式：编译运行后无论成败都调用代码调试智能体 */
export async function debugCode(data: CodeRunRequest): Promise<CodeDebugResult> {
  const res = await axiosInstance.post('/api/study/code/debug', data);
  return (res.data ?? res) as CodeDebugResult;
}

// ---------- POST /api/exam/question/generate ----------

/**
 * AI 生成题目（真实接口）。后端异步出题并直接落库，data 仅返回批次标识，
 * 生成的题目需通过题库列表接口回读，响应体不含题目内容。
 */
export async function generateQuestions(data: QuestionGenerateRequest): Promise<number> {
  const res = await axiosInstance.post('/api/exam/question/generate', data);
  return Number(res.data ?? res ?? 0);
}

// ---------- POST /api/exam/homework/submit ----------

/** 学生提交作业答案，返回后端提示信息 */
export async function submitHomework(data: HomeworkSubmitRequest): Promise<string> {
  const res = await axiosInstance.post('/api/exam/homework/submit', data);
  return String(res.data ?? res ?? '');
}

// ---------- GET /api/chat/streamChat（SSE 流式对话） ----------

export interface QaStreamHandlers {
  onMessage: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  /** 收到二次确认事件（携带 operationId，需用户确认后以 confirm=true 重发） */
  onReconfirm?: (operationId: string, content: string) => void;
}

/**
 * 通用对话流式接口（真实接口，SSE）
 * 事件协议：data 行为 JSON { event: message | done | error | reconfirm, content, operationId }
 */
export async function streamQaAnswer(
  question: string,
  handlers: QaStreamHandlers,
  conversationId?: string,
): Promise<void> {
  return doStreamQa(question, handlers, conversationId, false, undefined);
}

/**
 * 二次确认重发（真实接口）
 * 收到 reconfirm 事件后，用同一 conversationId 与返回的 operationId、confirm=true 再次请求。
 */
export async function streamQaConfirm(
  question: string,
  handlers: QaStreamHandlers,
  params: { conversationId?: string; operationId: string },
): Promise<void> {
  return doStreamQa(question, handlers, params.conversationId, true, params.operationId);
}

/** 逐条收集流式回答为完整文本（非流式场景降级用） */
export function streamChatCollect(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let full = '';
    streamQaAnswer(
      question,
      {
        onMessage: (chunk) => (full += chunk),
        onDone: () => resolve(full),
        onError: (m) => reject(new Error(m)),
      },
      `qa_${Date.now()}`,
    ).catch(reject);
  });
}

async function doStreamQa(
  question: string,
  handlers: QaStreamHandlers,
  conversationId: string | undefined,
  confirm: boolean,
  operationId: string | undefined,
): Promise<void> {
  const params = new URLSearchParams({ message: question, confirm: String(confirm) });
  if (conversationId) params.set('conversationId', conversationId);
  if (operationId) params.set('operationId', operationId);

  const token = localStorage.getItem('auth_token') ?? '';
  const response = await fetch(`/api/chat/streamChat?${params.toString()}`, {
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
  });
  if (!response.ok || !response.body) {
    handlers.onError(`答疑服务连接失败（HTTP ${response.status}）`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  const handleEvent = (rawData: string) => {
    let parsed: { event?: string; content?: string; operationId?: string };
    try {
      parsed = JSON.parse(rawData);
    } catch {
      // 非 JSON 数据按纯文本消息处理
      parsed = { event: 'message', content: rawData };
    }
    switch (parsed.event) {
      case 'message':
        handlers.onMessage(parsed.content ?? '');
        break;
      case 'done':
        finished = true;
        handlers.onDone();
        break;
      case 'error':
        finished = true;
        handlers.onError(parsed.content || '答疑服务异常');
        break;
      case 'reconfirm':
        handlers.onReconfirm?.(parsed.operationId ?? '', parsed.content ?? '');
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).replace(/^ /, '');
        if (data) handleEvent(data);
      }
    }
  }
  if (!finished) handlers.onDone();
}
