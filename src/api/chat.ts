const CONVERSATION_ID_KEY = 'chat_conversation_id'

export function getConversationId(): string {
  let id = localStorage.getItem(CONVERSATION_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CONVERSATION_ID_KEY, id)
  }
  return id
}

export interface StreamChatParams {
  message: string
  conversationId?: string
  confirm?: boolean
  operationId?: string
}

export function buildStreamUrl(params: StreamChatParams): string {
  const url = new URL('/api/chat/streamChat', window.location.origin)
  url.searchParams.set('message', params.message)
  if (params.conversationId) {
    url.searchParams.set('conversationId', params.conversationId)
  }
  if (params.confirm) {
    url.searchParams.set('confirm', 'true')
  }
  if (params.operationId) {
    url.searchParams.set('operationId', params.operationId)
  }
  return url.toString()
}