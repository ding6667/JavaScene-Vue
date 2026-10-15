<template>
  <div
    class="chat-widget"
    :style="widgetStyle"
    @pointerdown="onPointerDown"
  >
    <div
      class="chat-icon"
      :class="[`chat-icon--${store.iconState}`]"
      @click.stop="handleIconClick"
    >
      <svg
        v-if="store.iconState === 'sleeping'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 100"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon-svg"
      >
        <line x1="30" y1="25" x2="18" y2="8" stroke-width="2.5" />
        <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <line x1="90" y1="25" x2="102" y2="8" stroke-width="2.5" />
        <circle cx="103" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <rect x="12" y="25" width="96" height="60" rx="10" stroke-width="3" />
        <path d="M 42 52 Q 48 58 54 52" stroke-width="4" />
        <path d="M 66 52 Q 72 58 78 52" stroke-width="4" />
      </svg>

      <svg
        v-else-if="store.iconState === 'open'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 100"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon-svg"
      >
        <line x1="30" y1="25" x2="18" y2="8" stroke-width="2.5" />
        <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <line x1="90" y1="25" x2="102" y2="8" stroke-width="2.5" />
        <circle cx="103" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <rect x="12" y="25" width="96" height="60" rx="10" stroke-width="3" />
        <path d="M 42 55 Q 48 49 54 55" stroke-width="4" />
        <path d="M 66 55 Q 72 49 78 55" stroke-width="4" />
      </svg>

      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 100"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="icon-svg icon-svg--thinking"
      >
        <line x1="30" y1="25" x2="18" y2="8" stroke-width="2.5" />
        <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <line x1="90" y1="25" x2="102" y2="8" stroke-width="2.5" />
        <circle cx="103" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <rect x="12" y="25" width="96" height="60" rx="10" stroke-width="3" />
        <path d="M 32 55 Q 40 35 48 55 T 64 55 T 80 55 T 96 55" stroke-width="4" />
      </svg>
    </div>

    <Transition name="panel">
      <ChatPanel v-if="store.isPanelOpen" />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import ChatPanel from './ChatPanel.vue'

const store = useChatStore()

const posX = ref(window.innerWidth - 80)
const posY = ref(window.innerHeight - 80)
const dragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragOrigX = ref(0)
const dragOrigY = ref(0)
const hasMoved = ref(false)

const widgetStyle = computed(() => ({
  right: 'auto',
  bottom: 'auto',
  left: posX.value + 'px',
  top: posY.value + 'px',
}))

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.chat-panel')) return
  dragging.value = true
  hasMoved.value = false
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  dragOrigX.value = posX.value
  dragOrigY.value = posY.value

  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const dx = e.clientX - dragStartX.value
  const dy = e.clientY - dragStartY.value
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    hasMoved.value = true
  }
  posX.value = Math.max(0, Math.min(window.innerWidth - 60, dragOrigX.value + dx))
  posY.value = Math.max(0, Math.min(window.innerHeight - 60, dragOrigY.value + dy))
}

function onPointerUp() {
  dragging.value = false
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
}

function handleIconClick() {
  if (hasMoved.value) {
    hasMoved.value = false
    return
  }
  store.togglePanel()
}

function handleResize() {
  posX.value = Math.min(posX.value, window.innerWidth - 60)
  posY.value = Math.min(posY.value, window.innerHeight - 60)
}

window.addEventListener('resize', handleResize)

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.chat-widget {
  position: fixed;
  z-index: 1000;
  user-select: none;
}

.chat-icon {
  width: 60px;
  height: 50px;
  cursor: pointer;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: box-shadow var(--transition), transform var(--transition);
  touch-action: none;
}

.chat-icon:hover {
  box-shadow: 0 2px 8px rgba(28, 25, 23, 0.1);
  transform: scale(1.05);
}

.chat-icon--thinking {
  color: var(--accent);
}

.icon-svg {
  width: 44px;
  height: 37px;
}

.icon-svg--thinking {
  animation: think-pulse 1.4s ease-in-out infinite;
}

@keyframes think-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
</style>