import type { ChatStreamResponse } from '@/types/chat';

const CONVERSATION_ID_KEY = 'chat_conversation_id';

export function getConversationId(): string {
  let id = localStorage.getItem(CONVERSATION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CONVERSATION_ID_KEY, id);
  }
  return id;
}

export interface StreamChatParams {
  message: string;
  conversationId?: string;
  confirm?: boolean;
  operationId?: string;
}

export function buildStreamUrl(params: StreamChatParams): string {
  const url = new URL('/api/chat/streamChat', window.location.origin);
  url.searchParams.set('message', params.message);
  if (params.conversationId) {
    url.searchParams.set('conversationId', params.conversationId);
  }
  if (params.confirm) {
    url.searchParams.set('confirm', 'true');
  }
  if (params.operationId) {
    url.searchParams.set('operationId', params.operationId);
  }
  return url.toString();
}

// ==================== SSE 流式对话（真实接口 GET /api/chat/streamChat） ====================

export interface ChatStreamHandlers {
  onMessage: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  /** 收到二次确认事件（携带 operationId，需用户确认后以 confirm=true 重发） */
  onReconfirm?: (operationId: string, content: string) => void;
}

/** 发起流式对话 */
export async function streamChatAnswer(
  question: string,
  handlers: ChatStreamHandlers,
  conversationId?: string,
): Promise<void> {
  return doStreamChat(question, handlers, conversationId, false, undefined);
}

/**
 * 二次确认重发：收到 reconfirm 后，用同一 conversationId 与返回的 operationId、confirm=true 再次请求。
 * 后端未提供独立的确认接口，确认动作就是带 operationId 重发同一个 streamChat。
 */
export async function streamChatConfirm(
  question: string,
  handlers: ChatStreamHandlers,
  params: { conversationId?: string; operationId: string },
): Promise<void> {
  return doStreamChat(question, handlers, params.conversationId, true, params.operationId);
}

/** 逐条收集流式回答为完整文本（非流式场景降级用） */
export function streamChatCollect(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let full = '';
    streamChatAnswer(
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

async function doStreamChat(
  question: string,
  handlers: ChatStreamHandlers,
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
    handlers.onError(`对话服务连接失败（HTTP ${response.status}）`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  // 事件协议：data 行为 JSON { event: message | done | error | reconfirm, content, operationId }
  const handleEvent = (rawData: string) => {
    let parsed: ChatStreamResponse;
    try {
      parsed = JSON.parse(rawData) as ChatStreamResponse;
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
        handlers.onError(parsed.content || '对话服务异常');
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
