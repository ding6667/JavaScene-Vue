<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

/**
 * 全局三端切换滑块（开发调试用）
 * - 固定于页面右上角，z-index 9999，独立于所有页面内容
 * - 三个档位：学生端 / 教师端 / 运维端，切换即跳转对应主页
 */
type Portal = 'student' | 'teacher' | 'admin';

const PORTALS: { key: Portal; label: string; route: string }[] = [
  { key: 'student', label: '学生端', route: '/student/dashboard' },
  { key: 'teacher', label: '教师端', route: '/' },
  { key: 'admin', label: '运维端', route: '/admin/dashboard' },
];

function currentPortal(): Portal {
  const path = window.location.pathname;
  if (path.startsWith('/student')) return 'student';
  if (path.startsWith('/admin')) return 'admin';
  return 'teacher';
}

const active = ref<Portal>(currentPortal());
const router = useRouter();

function switchTo(portal: Portal) {
  if (active.value === portal) return;
  active.value = portal;
  const target = PORTALS.find((p) => p.key === portal);
  if (target) router.push(target.route);
}
</script>

<template>
  <div class="portal-switcher" title="开发调试：切换三端视角">
    <div class="portal-switcher__track">
      <div
        class="portal-switcher__slider"
        :style="{ transform: `translateX(${PORTALS.findIndex((p) => p.key === active) * 100}%)` }"
      ></div>
      <button
        v-for="p in PORTALS"
        :key="p.key"
        type="button"
        class="portal-switcher__option"
        :class="{ 'portal-switcher__option--active': active === p.key }"
        @click="switchTo(p.key)"
      >
        {{ p.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.portal-switcher {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 9999;
}

.portal-switcher__track {
  position: relative;
  display: inline-flex;
  width: 210px;
  height: 30px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--border-default);
  border-radius: 15px;
  padding: 3px;
  box-sizing: border-box;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(6px);
}

.portal-switcher__slider {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(33.333% - 2px);
  height: calc(100% - 6px);
  background: var(--text-primary);
  border-radius: 12px;
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.portal-switcher__option {
  flex: 1;
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.24s ease;
  font-family: inherit;
  padding: 0;
}

.portal-switcher__option--active {
  color: var(--bg-surface);
  font-weight: 600;
}
</style>
