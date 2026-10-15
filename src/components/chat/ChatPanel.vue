<template>
  <div class="chat-panel" @click.stop>
    <div class="chat-panel__header">
      <span class="chat-panel__title">AI 助手</span>
      <button class="chat-panel__close" @click="store.togglePanel">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="1" y1="1" x2="13" y2="13" />
          <line x1="13" y1="1" x2="1" y2="13" />
        </svg>
      </button>
    </div>

    <div class="chat-panel__messages" ref="messagesContainer">
      <div v-if="store.messages.length === 0" class="chat-panel__empty">
        <div class="chat-panel__empty-icon">
          <svg width="40" height="33" viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="30" y1="25" x2="18" y2="8" stroke-width="2.5" />
            <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="none" />
            <line x1="90" y1="25" x2="102" y2="8" stroke-width="2.5" />
            <circle cx="103" cy="7" r="2.5" fill="currentColor" stroke="none" />
            <rect x="12" y="25" width="96" height="60" rx="10" stroke-width="2.5" />
            <path d="M 42 55 Q 48 49 54 55" stroke-width="3.5" />
            <path d="M 66 55 Q 72 49 78 55" stroke-width="3.5" />
          </svg>
        </div>
        <p class="chat-panel__empty-text">有什么可以帮助你的？</p>
      </div>

      <div
        v-for="msg in store.messages"
        :key="msg.id"
        class="chat-message"
        :class="`chat-message--${msg.role}`"
      >
        <div class="chat-message__bubble">
          <span class="chat-message__text">{{ msg.content }}</span>
          <span v-if="!msg.isComplete" class="chat-message__cursor">|</span>
        </div>
      </div>
    </div>

    <div class="chat-panel__input">
      <textarea
        v-model="inputText"
        class="chat-panel__textarea"
        placeholder="输入消息..."
        :disabled="store.iconState === 'thinking' || store.isPendingConfirm"
        rows="1"
        @keydown.enter.exact.prevent="handleSend"
        @input="autoResize"
      ></textarea>
      <button
        class="chat-panel__send"
        :disabled="!inputText.trim() || store.iconState === 'thinking' || store.isPendingConfirm"
        @click="handleSend"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="2" x2="8" y2="14" />
          <polyline points="4 6 8 2 12 6" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <ConfirmDialog
        v-if="store.isPendingConfirm"
        :content="store.pendingConfirmContent"
        @confirm="store.confirmOperation()"
        @cancel="store.cancelOperation()"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useChatStore()
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

function autoResize(e: Event) {
  const target = e.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = Math.min(target.scrollHeight, 100) + 'px'
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  if (store.iconState === 'thinking' || store.isPendingConfirm) return
  store.sendMessage(text)
  inputText.value = ''
  const textarea = document.querySelector('.chat-panel__textarea') as HTMLTextAreaElement
  if (textarea) {
    textarea.style.height = 'auto'
  }
}

watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
)

watch(
  () => {
    const msgs = store.messages
    if (msgs.length > 0) {
      return msgs[msgs.length - 1].content
    }
    return ''
  },
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
)
</script>

<style scoped>
.chat-panel {
  position: absolute;
  right: 0;
  bottom: 58px;
  width: 350px;
  height: 480px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 24px rgba(28, 25, 23, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.chat-panel__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-panel__close {
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition), background var(--transition);
}

.chat-panel__close:hover {
  color: var(--text-primary);
  background: var(--bg-subtle);
}

.chat-panel__messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-panel__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.chat-panel__empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.chat-panel__empty-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.chat-message {
  display: flex;
  max-width: 100%;
}

.chat-message--user {
  justify-content: flex-end;
}

.chat-message--assistant {
  justify-content: flex-start;
}

.chat-message__bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-message--user .chat-message__bubble {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-bottom-right-radius: 4px;
}

.chat-message--assistant .chat-message__bubble {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 4px;
}

.chat-message__text {
  display: inline;
}

.chat-message__cursor {
  display: inline;
  color: var(--accent);
  animation: cursor-blink 0.8s step-end infinite;
  font-weight: 300;
  margin-left: 1px;
}

@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.chat-panel__input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.chat-panel__textarea {
  flex: 1;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
  max-height: 100px;
}

.chat-panel__textarea:focus {
  border-color: var(--border-strong);
}

.chat-panel__textarea:disabled {
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.chat-panel__textarea::placeholder {
  color: var(--text-tertiary);
}

.chat-panel__send {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}

.chat-panel__send:hover:not(:disabled) {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-color: var(--text-primary);
}

.chat-panel__send:disabled {
  color: var(--text-tertiary);
  border-color: var(--border-subtle);
  cursor: not-allowed;
}
</style>