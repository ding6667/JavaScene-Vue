<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  BookOpen,
  CircleAlert,
  CircleUser,
  ClipboardList,
  Code2,
  GraduationCap,
  History,
  Home,
  ListChecks,
  LogOut,
  MessageCircleQuestion,
  MonitorOff,
} from 'lucide-vue-next';
import ChatWidget from '@/components/chat/ChatWidget.vue';
import { useAuthStore } from '@/stores/auth';
import { useLogout } from '@/composables/useLogout';

const route = useRoute();
const authStore = useAuthStore();
const isCollapsed = ref(true);

const navItems = [
  { path: '/student/dashboard', icon: Home, label: '学习仪表盘', exact: true },
  { path: '/student/learn', icon: BookOpen, label: '章节学习' },
  { path: '/student/qa', icon: MessageCircleQuestion, label: 'AI 智能答疑' },
  { path: '/student/code', icon: Code2, label: '代码实操' },
  { path: '/student/records', icon: History, label: '运行记录' },
  { path: '/student/practice', icon: ListChecks, label: '刷题练习' },
  { path: '/student/homework', icon: ClipboardList, label: '我的作业' },
  { path: '/student/wrong', icon: CircleAlert, label: '错题本' },
  { path: '/student/report', icon: BarChart3, label: '学习报告' },
  { path: '/student/account', icon: CircleUser, label: '账号中心' },
];

function isActive(item: typeof navItems[0]): boolean {
  if (item.exact) {
    return route.path === item.path;
  }
  return route.path.startsWith(item.path);
}

// 登出：先让后端吊销 token（Redis 黑名单），失败也照样清本地并回登录页
const { loggingOut, logout, logoutAllDevices } = useLogout();
</script>

<template>
  <div class="student-layout">
    <aside
      class="student-sidebar"
      :class="{ 'student-sidebar--collapsed': isCollapsed }"
      @mouseenter="isCollapsed = false"
      @mouseleave="isCollapsed = true"
    >
      <!-- Logo -->
      <div class="student-sidebar__header">
        <div class="student-sidebar__logo" @click="$router.push('/student/dashboard')">
          <div class="logo-icon">
            <GraduationCap :size="18" />
          </div>
          <span v-if="!isCollapsed" class="logo-text">智能学习平台</span>
        </div>
      </div>

      <!-- 导航菜单 -->
      <nav class="student-sidebar__nav">
        <ul class="nav-list">
          <li v-for="item in navItems" :key="item.path" class="nav-item">
            <a
              href="#"
              :class="cn('nav-link', isActive(item) && 'nav-link--active')"
              @click.prevent="$router.push(item.path)"
            >
              <component :is="item.icon" :size="16" class="nav-icon" />
              <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
            </a>
          </li>
        </ul>
      </nav>

      <!-- 底部：当前登录学生 + 退出当前设备 / 吊销全部设备 -->
      <div class="student-sidebar__footer">
        <div class="student-user">
          <div class="student-user__avatar">{{ authStore.displayName.slice(0, 1) }}</div>
          <div v-if="!isCollapsed" class="student-user__meta">
            <div class="student-user__name">{{ authStore.displayName }}</div>
            <div class="student-user__class">学生端</div>
          </div>
        </div>
        <button type="button" class="student-logout" :disabled="loggingOut" @click="logout">
          <LogOut :size="16" class="nav-icon" />
          <span v-if="!isCollapsed" class="nav-label">退出登录</span>
        </button>
        <button type="button" class="student-logout" :disabled="loggingOut" @click="logoutAllDevices">
          <MonitorOff :size="16" class="nav-icon" />
          <span v-if="!isCollapsed" class="nav-label">退出所有设备</span>
        </button>
      </div>
    </aside>

    <main class="student-main">
      <router-view />
    </main>

    <ChatWidget />
  </div>
</template>

<style scoped>
.student-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-canvas);
}

.student-sidebar {
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

.student-sidebar--collapsed {
  width: 60px;
}

.student-sidebar__header {
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.student-sidebar__logo {
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

.student-sidebar__logo:hover .logo-icon {
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

.student-sidebar__nav {
  flex: 1;
  padding: 12px 10px;
  overflow-y: auto;
}

.nav-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  transition: background var(--transition), color var(--transition);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
}

.nav-link:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.nav-link--active,
.nav-link--active:hover {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
  font-weight: 600;
}

.nav-icon {
  flex-shrink: 0;
}

.nav-label {
  font-size: 13.5px;
  white-space: nowrap;
}

.student-sidebar__footer {
  padding: 12px 10px;
  border-top: 1px solid var(--border-subtle);
}

.student-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
}

.student-user__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--text-primary);
  color: var(--bg-surface);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.student-user__meta {
  min-width: 0;
}

.student-user__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.student-user__class {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 退出登录：与教师端 sidebar 同款，hover 转 --status-danger */
.student-logout {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.student-logout:hover:not(:disabled) {
  background: var(--bg-subtle);
  color: var(--status-danger);
}

.student-logout:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.student-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  margin-left: 220px;
  transition: margin-left var(--transition);
}

@media (max-width: 768px) {
  .student-main {
    margin-left: 60px;
  }
}
</style>
