/**
 * 答疑服务 DTO（后端 /api/qa/*，契约见 openapi-qa.json）
 * 文件负责人：【A 答疑与知识】
 * 问答只有一个通道：GET /api/qa/answer/stream（SSE 流式，后端推 Markdown 源文本）；
 * 没有同步 ask 接口。GET /api/qa/history 提供历史问答分页。
 */

/** GET /api/qa/history 查询参数 —— TODO 待接 */
export interface QaHistoryQuery {
  chapterId?: number;
  sessionId?: string;
  pageNum?: number;
  pageSize?: number;
}

/** GET /api/qa/history 记录项 —— TODO 待接 */
export interface QaHistoryItem {
  id: number;
  /** 章节 ID，自由提问为 null */
  chapterId: number | null;
  sessionId: string;
  roundNo: number;
  question: string;
  answer: string;
  knowledgePoints: string;
  referenceText: string;
  /** 1=贴合 0=超纲 null=未判定 */
  isTextbookMatch: number | null;
  tokensUsed: number;
  /** 端到端响应耗时（毫秒） */
  responseTime: number;
  createTime: string;
}

/** GET /api/qa/answer/stream 查询参数 */
export interface QaStreamQuery {
  question: string;
  /** 章节 ID（可选），传了则按该章教材限定作答范围 */
  chapterId?: number | string;
  /** 会话 ID（可选），首轮不传，由 meta 事件回传后续问带上 */
  sessionId?: string;
}

/**
 * 后端 SSE 事件名（本接口的固定协议）
 * 顺序：meta →（think-start → think* → think-end）* → message* → 结束；异常时只发一个 error
 */
export type QaStreamEvent =
  | 'meta'
  | 'think-start'
  | 'think'
  | 'think-end'
  | 'message'
  | 'error';

/** meta 事件的 data（JSON） */
export interface QaStreamMeta {
  sessionId: string;
  roundNo: number;
}

/** 单个已解析的 SSE 帧 */
export interface QaSseFrame {
  event: string;
  data: string;
}

/** 流式问答的回调（全部可选，按需监听） */
export interface QaStreamHandlers {
  /** 首个事件，携带 sessionId / roundNo */
  onMeta?: (meta: QaStreamMeta) => void;
  /** 思考过程开始（data 通常为空） */
  onThinkStart?: () => void;
  /** 思考过程文本片段，可能多次 */
  onThink?: (chunk: string) => void;
  /** 思考过程结束（data 通常为空） */
  onThinkEnd?: () => void;
  /** 正式答案片段，可能多次 */
  onMessage?: (chunk: string) => void;
  /** 后端显式错误事件，收到后流即终止 */
  onError?: (message: string) => void;
  /** 未识别的事件名，便于后端加事件时前端不至于静默 */
  onUnknown?: (event: string, data: string) => void;
  /** 连接正常结束、error 终止或主动取消后都会触发一次 */
  onDone?: () => void;
}

/** 一次流式问答的汇总结果 */
export interface QaStreamOutcome {
  /** 拼接后的完整答案 */
  answer: string;
  /** 拼接后的完整思考过程 */
  thinking: string;
  /** meta 事件回传的会话信息；未收到 meta 时为 null */
  meta: QaStreamMeta | null;
  /** 是否收到过 error 事件 */
  failed: boolean;
  /** 是否被前端主动取消（AbortSignal） */
  aborted: boolean;
}
