/**
 * 答疑服务 API（后端 /api/qa/*，契约见 openapi-qa.json）
 * 负责人：【A 答疑与知识】
 *
 * 答疑只有一个问答通道：GET /api/qa/answer/stream（SSE 流式），没有同步 ask 接口。
 * 另有 GET /api/qa/history 供历史问答分页。
 *
 * 事件名以后端常量为准：think-start / think / think-end / message
 *（meta、error 若下发也能被下面解析处理；无 meta 时会话 ID 由前端自己维护）。
 *
 * 为什么不用 EventSource：
 * 本项目登录态放在 `Authorization: Bearer <token>` 请求头里（见 api/index.ts），
 * 而 EventSource 无法自定义请求头，连上必然 401；且 EventSource 断线会自动重连，
 * 答疑场景下重连会让同一个问题被后端重复计轮次、重复调用 Dify。
 * 所以这里统一用 fetch + ReadableStream 手写 SSE 解析：不自动重连，可用 AbortSignal 主动停止。
 */
import type {
  QaHistoryItem,
  QaHistoryQuery,
  QaSseFrame,
  QaStreamHandlers,
  QaStreamMeta,
  QaStreamOutcome,
} from '@/types/qa';
import type { PageResponse } from '@/types';
import axiosInstance from './index';

/** GET /api/qa/history —— 本人历史问答分页（已实现） */
export async function fetchQaHistory(params: QaHistoryQuery): Promise<PageResponse<QaHistoryItem>> {
  const res = await axiosInstance.get('/api/qa/history', { params });
  return (res.data ?? res) as PageResponse<QaHistoryItem>;
}

/**
 * 生成前端侧会话 ID。
 * 后端若不通过 meta 事件回传 sessionId，就用这个值贯穿多轮；
 * 若后端有 meta，则以 meta.sessionId 为准（onMeta 里覆盖掉即可）。
 */
export function createQaSessionId(): string {
  return `qa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== GET /api/qa/answer/stream（SSE 流式答疑） ====================

/**
 * 解析一个 SSE 帧：多行 data 用换行拼接，忽略以 ':' 开头的心跳注释。
 *
 * 兼容处理：若后端把一段多行文本直接写进单条 data: 里（后续行没带 data: 前缀），
 * 这些裸行按内容续行处理，避免直接丢字。但要注意 —— Markdown 里的**空行**在 SSE 中
 * 是帧分隔符，后端必须按规范逐行加 data: 前缀，否则空行会提前结束这一帧（无法在前端补救）。
 */
function parseSseFrame(raw: string): QaSseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  let hasField = false;

  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith(':')) continue; // 心跳/注释行
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      hasField = true;
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
      hasField = true;
    } else if (/^(?:id|retry):/.test(line)) {
      hasField = true; // 本接口用不到，占位避免被当成正文
    } else {
      // 无字段前缀的裸行：按 data 续行兜底
      dataLines.push(line);
      hasField = true;
    }
  }

  if (!hasField) return null;
  return { event, data: dataLines.join('\n') };
}

/** meta 的 data 是 JSON；万一后端给了非 JSON，也不让整条流崩掉 */
function parseMeta(data: string): QaStreamMeta | null {
  try {
    const parsed = JSON.parse(data) as Partial<QaStreamMeta>;
    if (parsed && typeof parsed.sessionId === 'string') {
      return { sessionId: parsed.sessionId, roundNo: Number(parsed.roundNo) || 1 };
    }
  } catch {
    // 非 JSON 的 meta 忽略
  }
  return null;
}

export interface QaStreamOptions {
  chapterId?: number | string;
  sessionId?: string;
  /** 传 AbortController.signal，用于页面上的「停止生成」按钮 */
  signal?: AbortSignal;
}

/**
 * 流式答疑：逐事件回调，返回拼接好的完整结果
 *
 * 用法：
 * ```ts
 * const ctrl = new AbortController();
 * await streamQaAnswer(
 *   question,
 *   {
 *     onMeta: (m) => (sessionId.value = m.sessionId),  // 存起来，续问要带上
 *     onThinkStart: () => (thinkingVisible.value = true),
 *     onThink: (chunk) => (thinking.value += chunk),
 *     onThinkEnd: () => (thinkingVisible.value = false),
 *     onMessage: (chunk) => (answer.value += chunk),   // 建议先按纯文本追加
 *     onError: (msg) => ElMessage.error(msg),
 *     onDone: () => (sending.value = false),           // 结束后可再做 Markdown 渲染
 *   },
 *   { chapterId: 7, sessionId: sessionId.value, signal: ctrl.signal },
 * );
 * ```
 *
 * 注意两点：
 * 1. question 由 URLSearchParams 编码，中文与特殊字符不用自己处理；
 * 2. 收到 error 事件后不会再有 message，函数会立即收尾并 close 连接（不会自动重连）。
 */
export async function streamQaAnswer(
  question: string,
  handlers: QaStreamHandlers,
  options: QaStreamOptions = {},
): Promise<QaStreamOutcome> {
  const outcome: QaStreamOutcome = {
    answer: '',
    thinking: '',
    meta: null,
    failed: false,
    aborted: false,
  };

  const params = new URLSearchParams({ question });
  if (options.chapterId !== undefined && options.chapterId !== '') {
    params.set('chapterId', String(options.chapterId));
  }
  if (options.sessionId) params.set('sessionId', options.sessionId);

  const token = localStorage.getItem('auth_token') ?? '';
  let response: Response;
  try {
    response = await fetch(`/api/qa/answer/stream?${params.toString()}`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      signal: options.signal,
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      outcome.aborted = true;
      handlers.onDone?.();
      return outcome;
    }
    outcome.failed = true;
    handlers.onError?.(err.message || '答疑服务连接失败');
    return outcome;
  }

  if (!response.ok || !response.body) {
    outcome.failed = true;
    handlers.onError?.(`答疑服务连接失败（HTTP ${response.status}）`);
    handlers.onDone?.();
    return outcome;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopped = false;

  const dispatch = (frame: QaSseFrame) => {
    switch (frame.event) {
      case 'meta': {
        const meta = parseMeta(frame.data);
        if (meta) {
          outcome.meta = meta;
          handlers.onMeta?.(meta);
        }
        break;
      }
      case 'think-start':
        handlers.onThinkStart?.();
        break;
      case 'think':
        outcome.thinking += frame.data;
        handlers.onThink?.(frame.data);
        break;
      case 'think-end':
        handlers.onThinkEnd?.();
        break;
      case 'message':
        outcome.answer += frame.data;
        handlers.onMessage?.(frame.data);
        break;
      case 'error':
        outcome.failed = true;
        handlers.onError?.(frame.data || '答疑服务异常');
        stopped = true; // 后端已判定失败，不必再等
        break;
      default:
        handlers.onUnknown?.(frame.event, frame.data);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 以空行分隔事件；最后一段留在 buffer 里等下一个分包
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const raw of frames) {
        const frame = parseSseFrame(raw);
        if (frame) dispatch(frame);
        if (stopped) break;
      }
      if (stopped) {
        // 主动取消底层流，避免连接挂着
        await reader.cancel().catch(() => undefined);
        break;
      }
    }

    // 收尾：流结束时缓冲区里可能还剩最后一个未带空行分隔的帧
    if (!stopped && buffer.trim()) {
      const frame = parseSseFrame(buffer.trim());
      if (frame) dispatch(frame);
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      outcome.aborted = true;
    } else {
      outcome.failed = true;
      handlers.onError?.(err.message || '答疑流中断');
    }
  } finally {
    reader.releaseLock?.();
  }

  handlers.onDone?.();
  return outcome;
}
