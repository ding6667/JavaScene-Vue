<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { cn } from '@/lib/utils';
import {
  Activity,
  CloudUpload,
  DatabaseBackup,
  BookOpen,
  KeyRound,
  LayoutDashboard,
  ServerCog,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-vue-next';

const route = useRoute();
const isCollapsed = ref(true);

const navItems = [
  { path: '/admin/dashboard', icon: LayoutDashboard, label: '运维仪表盘', exact: true },
  { path: '/admin/users', icon: KeyRound, label: '用户管理' },
  { path: '/admin/knowledge', icon: BookOpen, label: '知识库维护' },
  { path: '/admin/weights', icon: SlidersHorizontal, label: '权重配置' },
  { path: '/admin/dataset', icon: CloudUpload, label: '知识库上传' },
  { path: '/admin/logs', icon: ScrollText, label: '日志审计' },
  { path: '/admin/backup', icon: DatabaseBackup, label: '数据备份' },
  { path: '/admin/settings', icon: ServerCog, label: '系统参数' },
  { path: '/admin/register', icon: ShieldCheck, label: '管理员注册' },
];

function isActive(item: typeof navItems[0]): boolean {
  if (item.exact) return route.path === item.path;
  return route.path.startsWith(item.path);
}
</script>

<template>
  <div class="admin-layout">
    <aside
      class="admin-sidebar"
      :class="{ 'admin-sidebar--collapsed': isCollapsed }"
      @mouseenter="isCollapsed = false"
      @mouseleave="isCollapsed = true"
    >
      <div class="admin-sidebar__header">
        <div class="admin-sidebar__logo" @click="$router.push('/admin/dashboard')">
          <div class="logo-icon">
            <Activity :size="18" />
          </div>
          <span v-if="!isCollapsed" class="logo-text">系统运维平台</span>
        </div>
      </div>

      <nav class="admin-sidebar__nav">
        <ul class="nav-list">
          <li v-for="item in navItems" :key="item.path">
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

      <div class="admin-sidebar__footer">
        <div class="admin-user">
          <div class="admin-user__avatar">A</div>
          <div v-if="!isCollapsed" class="admin-user__meta">
            <div class="admin-user__name">系统管理员</div>
            <div class="admin-user__org">信息中心</div>
          </div>
        </div>
      </div>
    </aside>

    <main class="admin-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-canvas);
}

.admin-sidebar {
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

.admin-sidebar--collapsed {
  width: 60px;
}

.admin-sidebar__header {
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.admin-sidebar__logo {
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

.admin-sidebar__logo:hover .logo-icon {
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

.admin-sidebar__nav {
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

.admin-sidebar__footer {
  padding: 12px 10px;
  border-top: 1px solid var(--border-subtle);
}

.admin-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
}

.admin-user__avatar {
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

.admin-user__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.admin-user__org {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.admin-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  margin-left: 220px;
  transition: margin-left var(--transition);
}

@media (max-width: 768px) {
  .admin-main {
    margin-left: 60px;
  }
}
</style>
