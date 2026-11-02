<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Component } from 'vue';
import { cn } from '@/lib/utils';
import {
  Activity,
  CircleUser,
  CloudUpload,
  DatabaseBackup,
  BookOpen,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MonitorOff,
  ServerCog,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
} from 'lucide-vue-next';
import ChatWidget from '@/components/chat/ChatWidget.vue';
import { useAuthStore } from '@/stores/auth';
import { useLogout } from '@/composables/useLogout';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isCollapsed = ref(true);

interface AdminNavItem {
  path: string;
  icon: Component;
  label: string;
  /** true 时只在路径完全匹配时高亮（仪表板这类根路径） */
  exact?: boolean;
}

interface AdminNavGroup {
  key: string;
  label: string;
  icon: Component;
  /** 只有一项时一级菜单直接跳转，不铺二级列表 */
  items: AdminNavItem[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    key: 'dashboard',
    label: '运维仪表盘',
    icon: LayoutDashboard,
    items: [{ path: '/admin/dashboard', icon: LayoutDashboard, label: '运维仪表盘', exact: true }],
  },
  {
    key: 'people',
    label: '人员管理',
    icon: Users,
    items: [
      { path: '/admin/users', icon: KeyRound, label: '用户管理' },
      { path: '/admin/classes', icon: Users, label: '班级管理' },
      { path: '/admin/students', icon: UserRound, label: '学生名单' },
    ],
  },
  {
    key: 'knowledge',
    label: '知识库管理',
    icon: BookOpen,
    items: [
      { path: '/admin/knowledge', icon: BookOpen, label: '知识库维护' },
      { path: '/admin/dataset', icon: CloudUpload, label: '知识库上传' },
      { path: '/admin/weights', icon: SlidersHorizontal, label: '权重配置' },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    icon: ServerCog,
    items: [
      { path: '/admin/logs', icon: ScrollText, label: '日志审计' },
      { path: '/admin/backup', icon: DatabaseBackup, label: '数据备份' },
      { path: '/admin/settings', icon: ServerCog, label: '系统参数' },
      { path: '/admin/account', icon: CircleUser, label: '账号中心' },
      { path: '/admin/register', icon: ShieldCheck, label: '管理员注册' },
    ],
  },
];

function isActive(item: AdminNavItem): boolean {
  if (item.exact) return route.path === item.path;
  return route.path.startsWith(item.path);
}

const groupActive = (group: AdminNavGroup) => group.items.some(isActive);

/** 进入某个二级页面时，它所属的一级分组自动展开 */
const expandedKeys = ref<Set<string>>(
  new Set(NAV_GROUPS.filter((g) => g.items.length > 1 && groupActive(g)).map((g) => g.key)),
);

const isExpanded = (key: string) => expandedKeys.value.has(key);

function toggleGroup(group: AdminNavGroup) {
  // 收起状态（只剩图标）下先展开侧栏，否则点了看不到二级
  if (isCollapsed.value) {
    isCollapsed.value = false;
    if (!isExpanded(group.key)) {
      const next = new Set(expandedKeys.value);
      next.add(group.key);
      expandedKeys.value = next;
    }
    return;
  }
  const next = new Set(expandedKeys.value);
  if (next.has(group.key)) next.delete(group.key);
  else next.add(group.key);
  expandedKeys.value = next;
}

function go(path: string) {
  if (route.path !== path) router.push(path);
}

watch(
  () => route.path,
  () => {
    const active = NAV_GROUPS.find((g) => g.items.length > 1 && groupActive(g));
    if (!active || isExpanded(active.key)) return;
    const next = new Set(expandedKeys.value);
    next.add(active.key);
    expandedKeys.value = next;
  },
);

const showLabel = computed(() => !isCollapsed.value);

// 登出：先让后端吊销 token（Redis 黑名单），失败也照样清本地并回登录页
const { loggingOut, logout, logoutAllDevices } = useLogout();
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
          <li v-for="group in NAV_GROUPS" :key="group.key" class="nav-group">
            <!-- 单页一级菜单：直接跳转 -->
            <a
              v-if="group.items.length === 1"
              href="#"
              :class="cn('nav-link', isActive(group.items[0]!) && 'nav-link--active')"
              @click.prevent="go(group.items[0]!.path)"
            >
              <component :is="group.icon" :size="16" class="nav-icon" />
              <span v-if="showLabel" class="nav-label">{{ group.label }}</span>
            </a>

            <!-- 分组一级菜单：点击折叠 / 展开二级 -->
            <template v-else>
              <a
                href="#"
                :class="cn(
                  'nav-link',
                  'nav-link--group',
                  groupActive(group) && 'nav-link--parent-active',
                  isExpanded(group.key) && 'nav-link--open',
                )"
                @click.prevent="toggleGroup(group)"
              >
                <component :is="group.icon" :size="16" class="nav-icon" />
                <span v-if="showLabel" class="nav-label">{{ group.label }}</span>
                <ChevronDown v-if="showLabel" :size="13" :class="cn('nav-arrow', isExpanded(group.key) && 'nav-arrow--open')" />
              </a>
              <ul v-show="isExpanded(group.key) && showLabel" class="sub-list">
                <li v-for="item in group.items" :key="item.path">
                  <a
                    href="#"
                    :class="cn('sub-link', isActive(item) && 'sub-link--active')"
                    @click.prevent="go(item.path)"
                  >
                    <span class="sub-dot"></span>
                    <span class="nav-label">{{ item.label }}</span>
                  </a>
                </li>
              </ul>
            </template>
          </li>
        </ul>
      </nav>

      <div class="admin-sidebar__footer">
        <div class="admin-user">
          <div class="admin-user__avatar">{{ authStore.displayName.slice(0, 1) }}</div>
          <div v-if="!isCollapsed" class="admin-user__meta">
            <div class="admin-user__name">{{ authStore.displayName }}</div>
            <div class="admin-user__org">{{ authStore.roleLabel }}</div>
          </div>
        </div>
        <button type="button" class="admin-logout" :disabled="loggingOut" @click="logout">
          <LogOut :size="16" class="admin-logout__icon" />
          <span v-if="!isCollapsed" class="admin-logout__label">退出登录</span>
        </button>
        <button type="button" class="admin-logout" :disabled="loggingOut" @click="logoutAllDevices">
          <MonitorOff :size="16" class="admin-logout__icon" />
          <span v-if="!isCollapsed" class="admin-logout__label">退出所有设备</span>
        </button>
      </div>
    </aside>

    <main class="admin-main">
      <router-view />
    </main>

    <ChatWidget />
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

.nav-group + .nav-group {
  margin-top: 6px;
}

.nav-link--group {
  color: var(--text-primary);
  font-weight: 600;
}

.nav-link--parent-active {
  color: var(--text-primary);
}

.nav-arrow {
  margin-left: auto;
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: transform var(--transition), color var(--transition);
}

.nav-arrow--open {
  transform: rotate(180deg);
  color: var(--text-primary);
}

.sub-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 2px 0 6px;
}

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

.admin-user__meta {
  min-width: 0;
}

.admin-user__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-user__org {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 退出登录：与教师端 sidebar 同款，hover 转 --status-danger */
.admin-logout {
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

.admin-logout:hover:not(:disabled) {
  background: var(--bg-subtle);
  color: var(--status-danger);
}

.admin-logout:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-logout__icon {
  flex-shrink: 0;
}

.admin-logout__label {
  font-size: 13.5px;
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
