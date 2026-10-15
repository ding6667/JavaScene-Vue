export type ChatEventType = 'message' | 'reconfirm' | 'done' | 'error'

export interface ChatStreamResponse {
  event: ChatEventType
  content: string
  operationId?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isComplete: boolean
}

export type ChatIconState = 'sleeping' | 'open' | 'thinking'