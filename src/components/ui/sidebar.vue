<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cn } from '@/lib/utils';
import {
  FileClock,
  GraduationCap,
  History,
  Home,
  Upload,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const isCollapsed = ref(false);

const navItems = [
  { path: '/', icon: Home, label: '作业批阅', exact: true },
  { path: '/results', icon: FileClock, label: '批阅结果' },
  { path: '/upload-files', icon: Upload, label: '上传管理' },
  { path: '/history', icon: History, label: '历史任务' },
];

function isActive(item: typeof navItems[0]): boolean {
  if (item.exact) {
    return route.path === item.path;
  }
  return route.path.startsWith(item.path);
}

function navigate(path: string) {
  router.push(path);
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'sidebar--collapsed': isCollapsed }"
    @mouseenter="isCollapsed = false"
    @mouseleave="isCollapsed = true"
  >
    <!-- Logo -->
    <div class="sidebar__header">
      <div class="sidebar__logo" @click="navigate('/')">
        <div class="logo-icon">
          <GraduationCap :size="18" />
        </div>
        <span v-if="!isCollapsed" class="logo-text">作业批阅系统</span>
      </div>
    </div>

    <!-- 导航菜单 -->
    <nav class="sidebar__nav">
      <ul class="nav-list">
        <li
          v-for="item in navItems"
          :key="item.path"
          class="nav-item"
        >
          <a
            href="#"
            :class="cn('nav-link', isActive(item) && 'nav-link--active')"
            @click.prevent="navigate(item.path)"
          >
            <component :is="item.icon" :size="18" class="nav-icon" />
            <span v-if="!isCollapsed" class="nav-label">
              {{ item.label }}
            </span>
          </a>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 220px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 50;
  overflow: hidden;
}

.sidebar--collapsed {
  width: 60px;
}

.sidebar__header {
  padding: 16px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.logo-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.logo-text {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.sidebar__nav {
  flex: 1;
  padding: 12px 10px;
  overflow-y: auto;
}

.nav-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  margin-bottom: 2px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  color: #475569;
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.nav-link:hover {
  background: #f8fafc;
  color: #334155;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}

.nav-link--active {
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(96, 165, 250, 0.35);
}

.nav-link--active:hover {
  box-shadow: 0 5px 14px rgba(96, 165, 250, 0.45);
  transform: translateY(-1px);
}

.nav-icon {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.nav-link:hover .nav-icon {
  transform: scale(1.08);
}

.nav-label {
  font-size: 13px;
  white-space: nowrap;
  transition: opacity 0.2s ease;
}
</style>
