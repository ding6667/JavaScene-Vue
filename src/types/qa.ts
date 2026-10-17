/**
 * 答疑服务 DTO（后端 /api/qa/*，契约见 openapi-qa.json）
 * 文件负责人：【A 答疑与知识】
 * 三个接口后端均已提供，前端尚未接入（现走通用对话流 /api/chat/streamChat）。
 */

/** POST /api/qa/ask 请求体 —— TODO 待接 */
export interface QaAskRequest {
  /** 问题内容，最长 2000 */
  question: string;
  /** 章节 ID（可选）。传了则按该章教材作答，不传走"未指定章节"逻辑 */
  chapterId?: number;
  /** 会话 ID（可选）。首轮不传，后端生成 UUID 并在响应回传，续问带上它 roundNo 才连续 */
  sessionId?: string;
}

/** POST /api/qa/ask 返回 —— TODO 待接 */
export interface QaAnswerResult {
  /** AI 回答（已剥除思考链） */
  answer: string;
  /** 教材原文引用（最多 500 字），可能为空 */
  references: string[];
  /** 是否贴合教材；null 表示该章未配关键词/原文，无法判定 */
  isTextbookMatch: boolean | null;
  /** 关键词命中率，保留两位小数 */
  hitRate: number;
  /** 命中的本章知识点名称，逗号分隔 */
  knowledgePoints: string;
  sessionId: string;
  /** 同一会话内的轮次序号，从 1 递增 */
  roundNo: number;
}

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

/** GET /api/qa/answer/stream 查询参数 —— TODO 待接 */
export interface QaStreamQuery {
  question: string;
  /** 后端该参数虽在 query 里，但类型为字符串，传数字前先与后端确认 */
  chapterId?: number;
  sessionId?: string;
}
