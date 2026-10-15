<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { cn } from '@/lib/utils';
import {
  Bot,
  ChevronDown,
  Database,
  FileClock,
  FileEdit,
  GraduationCap,
  History,
  Home,
  LogOut,
  Settings,
  Upload,
  Users,
} from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isCollapsed = ref(false);

/** 一级菜单分组 + 二级菜单 */
const menuGroups = [
  {
    key: 'grading',
    label: '作业批阅',
    icon: FileEdit,
    children: [
      { path: '/', icon: Home, label: '开始批阅', exact: true },
      { path: '/results', icon: FileClock, label: '批阅结果' },
      { path: '/upload-files', icon: Upload, label: '上传管理' },
      { path: '/history', icon: History, label: '历史任务' },
      { path: '/classes', icon: Users, label: '班级管理' },
    ],
  },
  {
    key: 'teach',
    label: '智能教学',
    icon: Bot,
    children: [
      { path: '/teach/prepare', icon: GraduationCap, label: 'AI 智能备课' },
      { path: '/teach/homework', icon: FileEdit, label: '作业发布' },
      { path: '/teach/questions', icon: Database, label: '题库管理' },
      { path: '/teach/grading', icon: FileClock, label: '智能批改' },
      { path: '/teach/learning', icon: Users, label: '班级学情' },
      { path: '/teach/intervention', icon: Bot, label: '教学干预' },
      { path: '/teach/resources', icon: Upload, label: '资源管理' },
    ],
  },
];

/** 当前激活的一级分组（按路由前缀推断） */
const activeGroupKey = computed(() => {
  if (route.path.startsWith('/teach')) return 'teach';
  if (route.path.startsWith('/settings')) return null;
  return 'grading';
});

/** 展开的分组（默认展开激活组；手动切换后以手动为准） */
const expanded = ref<Record<string, boolean>>({});

function isExpanded(key: string): boolean {
  if (expanded.value[key] !== undefined) return expanded.value[key];
  return activeGroupKey.value === key;
}

function toggleGroup(key: string) {
  expanded.value = { ...expanded.value, [key]: !isExpanded(key) };
}

function isActive(item: { path: string; exact?: boolean }): boolean {
  if (item.exact) return route.path === item.path;
  return route.path.startsWith(item.path);
}

function navigate(path: string) {
  router.push(path);
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
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
        <span v-if="!isCollapsed" class="logo-text">智能教学系统</span>
      </div>
    </div>

    <!-- 分组导航菜单 -->
    <nav class="sidebar__nav">
      <div v-for="group in menuGroups" :key="group.key" class="menu-group">
        <!-- 一级菜单 -->
        <a
          href="#"
          :class="cn(
            'group-link',
            activeGroupKey === group.key && 'group-link--active',
          )"
          @click.prevent="toggleGroup(group.key)"
        >
          <component :is="group.icon" :size="16" class="nav-icon" />
          <span v-if="!isCollapsed" class="nav-label">{{ group.label }}</span>
          <ChevronDown
            v-if="!isCollapsed"
            :size="13"
            class="group-arrow"
            :class="{ 'group-arrow--open': isExpanded(group.key) }"
          />
        </a>

        <!-- 二级菜单 -->
        <ul v-show="isExpanded(group.key) && !isCollapsed" class="sub-list">
          <li v-for="item in group.children" :key="item.path">
            <a
              href="#"
              :class="cn('sub-link', isActive(item) && 'sub-link--active')"
              @click.prevent="navigate(item.path)"
            >
              <span class="sub-dot"></span>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          </li>
        </ul>
      </div>

      <!-- 独立项：个人设置 -->
      <ul class="sub-list" style="margin-top: 4px;">
        <li>
          <a
            href="#"
            :class="cn('group-link', route.path.startsWith('/settings') && 'group-link--active')"
            @click.prevent="navigate('/settings')"
          >
            <Settings :size="16" class="nav-icon" />
            <span v-if="!isCollapsed" class="nav-label">个人设置</span>
          </a>
        </li>
      </ul>
    </nav>

    <!-- 底部退出登录 -->
    <div class="sidebar__footer">
      <button class="group-link group-link--logout" @click="handleLogout">
        <LogOut :size="16" class="nav-icon" />
        <span v-if="!isCollapsed" class="nav-label">退出登录</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 220px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  transition: width var(--transition);
  z-index: 50;
  overflow: hidden;
}

.sidebar--collapsed {
  width: 60px;
}

.sidebar__header {
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.logo-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  flex-shrink: 0;
  transition: background var(--transition), border-color var(--transition);
}

.sidebar__logo:hover .logo-icon {
  background: var(--bg-muted);
  border-color: var(--border-strong);
}

.logo-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.1px;
  white-space: nowrap;
}

.sidebar__nav {
  flex: 1;
  padding: 12px 10px;
  overflow-y: auto;
}

.menu-group {
  margin-bottom: 4px;
}

.sub-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* 一级菜单 */
.group-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  text-decoration: none;
  transition: background var(--transition), color var(--transition);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
}

.group-link:hover {
  background: var(--bg-subtle);
}

.group-link--active {
  color: var(--text-primary);
}

.group-arrow {
  margin-left: auto;
  color: var(--text-tertiary);
  transition: transform var(--transition);
}

.group-arrow--open {
  transform: rotate(180deg);
}

/* 二级菜单 */
.sub-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px 7px 24px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  transition: background var(--transition), color var(--transition);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.sub-link:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.sub-link--active,
.sub-link--active:hover {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
  font-weight: 600;
}

.sub-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
  transition: background var(--transition);
}

.sub-link--active .sub-dot {
  background: var(--text-primary);
}

.nav-icon {
  flex-shrink: 0;
}

.nav-label {
  font-size: inherit;
  white-space: nowrap;
  transition: opacity var(--transition);
}

.sidebar__footer {
  padding: 12px 10px;
  border-top: 1px solid var(--border-subtle);
}

.group-link--logout {
  width: 100%;
  border: none;
  font-family: inherit;
  background: transparent;
}

.group-link--logout:hover {
  color: var(--status-danger);
}
</style>
