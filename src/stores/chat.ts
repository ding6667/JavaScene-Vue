import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatMessage, ChatIconState, ChatStreamResponse } from '@/types/chat'
import { buildStreamUrl, getConversationId } from '@/api/chat'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const iconState = ref<ChatIconState>('sleeping')
  const isPanelOpen = ref(false)
  const isPendingConfirm = ref(false)
  const pendingOperationId = ref<string | null>(null)
  const pendingConfirmContent = ref('')

  let abortController: AbortController | null = null

  function closeStream() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  function togglePanel() {
    if (isPanelOpen.value) {
      isPanelOpen.value = false
      iconState.value = 'sleeping'
    } else {
      isPanelOpen.value = true
      iconState.value = 'open'
    }
  }

  async function sendMessage(
    message: string,
    options?: { confirm?: boolean; operationId?: string }
  ) {
    closeStream()
    iconState.value = 'thinking'

    const conversationId = getConversationId()
    const url = buildStreamUrl({
      message,
      conversationId,
      confirm: options?.confirm,
      operationId: options?.operationId,
    })

    console.log('[Chat] 请求 URL:', url)

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      isComplete: true,
    }
    messages.value = [...messages.value, userMsg]

    const assistantMsgId = `assistant-${Date.now()}`
    messages.value = [
      ...messages.value,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        isComplete: false,
      },
    ]

    const ac = new AbortController()
    abortController = ac

    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = { Accept: 'text/event-stream' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: ac.signal,
      })

      console.log('[Chat] 响应状态:', response.status, response.statusText)

      if (!response.ok) {
        const errText = response.status === 401
          ? '\u274C 认证失败，请检查 API Key 配置'
          : response.status === 404
            ? '\u274C 接口未找到 (404)，请确认后端 /api/chat/streamChat 已注册'
            : `\u274C 请求失败 (${response.status})`
        closeStream()
        iconState.value = 'open'
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant' && last.id === assistantMsgId) {
          messages.value = [
            ...messages.value.slice(0, -1),
            { ...last, content: errText, isComplete: true },
          ]
        }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        let data = ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            data += line.slice(5).replace(/^ /, '')
          } else if (line === '') {
            if (data) {
              handleSSEEvent(eventType, data, assistantMsgId)
            }
            eventType = ''
            data = ''
          }
        }
      }

      closeStream()
      iconState.value = 'open'
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'assistant' && !last.isComplete) {
        messages.value = [
          ...messages.value.slice(0, -1),
          { ...last, isComplete: true },
        ]
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      console.error('[Chat] 连接失败:', err)
      closeStream()
      iconState.value = 'open'
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'assistant' && last.id === assistantMsgId) {
        const errText = last.content
          ? last.content + '\n\n\u274C 连接中断'
          : '\u274C 无法连接到服务，请确认后端已启动'
        messages.value = [
          ...messages.value.slice(0, -1),
          { ...last, content: errText, isComplete: true },
        ]
      }
    }
  }

  function handleSSEEvent(eventType: string, data: string, assistantMsgId: string) {
    console.log('[Chat SSE] event:', eventType || '(message)', 'data:', data)
    try {
      const parsed: ChatStreamResponse = JSON.parse(data)

      if (eventType === 'reconfirm') {
        closeStream()
        iconState.value = 'open'
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant' && last.id === assistantMsgId) {
          const newContent = last.content ? last.content + '\n\n' + parsed.content : parsed.content
          messages.value = [
            ...messages.value.slice(0, -1),
            { ...last, content: newContent, isComplete: true },
          ]
        }
        pendingOperationId.value = parsed.operationId || null
        pendingConfirmContent.value = parsed.content
        isPendingConfirm.value = true
      } else if (eventType === 'error') {
        closeStream()
        iconState.value = 'open'
        isPendingConfirm.value = false
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant' && last.id === assistantMsgId) {
          messages.value = [
            ...messages.value.slice(0, -1),
            { ...last, content: '\u274C ' + (parsed.content || '连接出错，请重试'), isComplete: true },
          ]
        }
      } else if (eventType === 'done') {
        closeStream()
        iconState.value = 'open'
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant' && !last.isComplete) {
          messages.value = [
            ...messages.value.slice(0, -1),
            { ...last, isComplete: true },
          ]
        }
        isPendingConfirm.value = false
      } else {
        updateAssistantContent(assistantMsgId, parsed.content)
      }
    } catch {
      console.warn('[Chat SSE] JSON parse failed for data:', data)
    }
  }

  function updateAssistantContent(msgId: string, chunk: string) {
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant' && last.id === msgId) {
      messages.value = [
        ...messages.value.slice(0, -1),
        { ...last, content: last.content + chunk },
      ]
    }
  }

  function confirmOperation() {
    if (!pendingOperationId.value) return
    const opId = pendingOperationId.value
    isPendingConfirm.value = false
    pendingOperationId.value = null
    pendingConfirmContent.value = ''
    sendMessage('\u786E\u8BA4', { confirm: true, operationId: opId })
  }

  function cancelOperation() {
    isPendingConfirm.value = false
    pendingOperationId.value = null
    pendingConfirmContent.value = ''
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant' && !last.isComplete) {
      messages.value = [
        ...messages.value.slice(0, -1),
        { ...last, content: last.content + '\n\n\u23F9\uFE0F \u64CD\u4F5C\u5DF2\u53D6\u6D88', isComplete: true },
      ]
    }
  }

  return {
    messages,
    iconState,
    isPanelOpen,
    isPendingConfirm,
    pendingOperationId,
    pendingConfirmContent,
    sendMessage,
    togglePanel,
    confirmOperation,
    cancelOperation,
    closeStream,
  }
})