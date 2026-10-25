<script setup lang="ts">
import type { Component } from 'vue';

/**
 * 端口卡片：选端页与后续"切换端口"入口共用。
 * 三端各摆一张长方形卡片，无权限的那张置灰并说明原因，不给可点的错觉。
 */
const props = defineProps<{
  /** 端名称，如「学生端」 */
  title: string;
  /** 一句话说明该端能做什么 */
  description: string;
  /** 图标组件（lucide-vue-next） */
  icon: Component;
  /** 该端对应的角色码值，仅用于展示与埋点 */
  role: string;
  /** 无权限时置灰禁用 */
  disabled?: boolean;
  /** 禁用原因文案 */
  disabledReason?: string;
}>();

const emit = defineEmits<{ (e: 'select', role: string): void }>();

function onClick() {
  if (props.disabled) return;
  emit('select', props.role);
}
</script>

<template>
  <button
    :class="['portal-card', disabled && 'portal-card--disabled']"
    type="button"
    :disabled="disabled"
    :aria-disabled="disabled ? 'true' : 'false'"
    @click="onClick"
  >
    <span class="portal-card__icon">
      <component :is="icon" :size="22" :stroke-width="1.4" />
    </span>
    <span class="portal-card__body">
      <span class="portal-card__title">{{ title }}</span>
      <span class="portal-card__desc">{{ disabled && disabledReason ? disabledReason : description }}</span>
    </span>
    <span class="portal-card__go" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M5 12h13M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.portal-card {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 108px;
  padding: 20px 22px;
  text-align: left;
  font-family: inherit;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), transform var(--transition);
}

.portal-card:hover:not(.portal-card--disabled) {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.portal-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(87, 83, 78, 0.14);
}

.portal-card--disabled {
  cursor: not-allowed;
  background: var(--bg-canvas);
}

.portal-card--disabled .portal-card__title,
.portal-card--disabled .portal-card__go {
  color: var(--text-tertiary);
}

.portal-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  color: var(--text-primary);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.portal-card--disabled .portal-card__icon {
  color: var(--text-tertiary);
  background: transparent;
}

.portal-card__body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.portal-card__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.portal-card__desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.portal-card__go {
  flex-shrink: 0;
  color: var(--text-tertiary);
  transition: color var(--transition), transform var(--transition);
}

.portal-card:hover:not(.portal-card--disabled) .portal-card__go {
  color: var(--text-primary);
  transform: translateX(2px);
}
</style>
