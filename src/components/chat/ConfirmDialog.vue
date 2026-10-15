<template>
  <div class="confirm-overlay" @click.self="emit('cancel')">
    <div class="confirm-dialog">
      <div class="confirm-dialog__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div class="confirm-dialog__title">操作确认</div>
      <div class="confirm-dialog__body">{{ content }}</div>
      <div class="confirm-dialog__actions">
        <button class="confirm-dialog__btn confirm-dialog__btn--cancel" @click="emit('cancel')">取消</button>
        <button class="confirm-dialog__btn confirm-dialog__btn--confirm" @click="emit('confirm')">确认执行</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  content: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(28, 25, 23, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlay-fade-in 0.15s ease;
}

@keyframes overlay-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.confirm-dialog {
  width: 380px;
  max-width: 90vw;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(28, 25, 23, 0.12);
  padding: 24px;
  animation: dialog-scale-in 0.18s ease;
}

@keyframes dialog-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.confirm-dialog__icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--status-warning-bg);
  color: var(--status-warning);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.confirm-dialog__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: 10px;
}

.confirm-dialog__body {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.6;
  margin-bottom: 20px;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirm-dialog__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.confirm-dialog__btn {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-default);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}

.confirm-dialog__btn--cancel {
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.confirm-dialog__btn--cancel:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.confirm-dialog__btn--confirm {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-color: var(--text-primary);
}

.confirm-dialog__btn--confirm:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
</style>