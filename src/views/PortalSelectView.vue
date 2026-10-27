<script setup lang="ts">
/**
 * 选端页：账号拥有多个角色时，登录后先选要进哪个端。
 * 卡片只渲染该账号有权限的端为可点状态，其余置灰，避免手输 URL 再被守卫拦。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Activity, GraduationCap, LogOut, Presentation } from 'lucide-vue-next';
import PortalCard from '@/components/PortalCard.vue';
import { ROLE_HOME, useAuthStore } from '@/stores/auth';
import { useLogout } from '@/composables/useLogout';
import type { UserRoleName } from '@/types/user';
import type { Component } from 'vue';

const router = useRouter();
const auth = useAuthStore();
const { loggingOut, logout } = useLogout();

const PORTALS: { role: UserRoleName; title: string; description: string; icon: Component }[] = [
  {
    role: 'STUDENT',
    title: '学生端',
    description: '章节学习、AI 答疑、代码实操与刷题错题本',
    icon: GraduationCap,
  },
  {
    role: 'TEACHER',
    title: '教师端',
    description: '智能备课、作业发布、题库管理与班级学情',
    icon: Presentation,
  },
  {
    role: 'ADMIN',
    title: '运维端',
    description: '用户管理、教材知识库维护与出题权重配置',
    icon: Activity,
  },
];

/** token 里没带角色声明时（后端未下发）三端都放开，越权由后端 403 兜底 */
const unrestricted = computed(() => auth.portals.length === 0);

const cards = computed(() =>
  PORTALS.map((p) => ({
    ...p,
    enabled: unrestricted.value || auth.portals.includes(p.role),
    disabledReason: '该账号无此端权限',
  })),
);

/** 未登录直接来这个页面（手输 URL）时回登录页 */
if (!auth.isAuthenticated) {
  router.replace({ path: '/login', query: { redirect: '/choose-portal' } });
}

function select(role: string) {
  const home = ROLE_HOME[role as UserRoleName];
  if (home) router.replace(home);
}
</script>

<template>
  <div class="choose-view">
    <div class="choose-inner">
      <header class="choose-head">
        <h1 class="st-page-title">选择进入的端口</h1>
        <p class="st-page-subtitle">
          {{
            unrestricted
              ? `${auth.displayName}，请选择要进入的端口`
              : `${auth.displayName}，你的账号有 ${auth.portals.length} 个角色，选一个进入`
          }}
        </p>
      </header>

      <div class="choose-list">
        <PortalCard
          v-for="c in cards"
          :key="c.role"
          :title="c.title"
          :description="c.description"
          :disabled-reason="c.disabledReason"
          :icon="c.icon"
          :role="c.role"
          :disabled="!c.enabled"
          @select="select"
        />
      </div>

      <button class="st-text-btn choose-logout" :disabled="loggingOut" @click="logout">
        <LogOut :size="13" />
        换个账号登录
      </button>
    </div>
  </div>
</template>

<style scoped>
.choose-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--bg-canvas);
}

.choose-inner {
  width: 100%;
  max-width: 520px;
}

.choose-head {
  margin-bottom: 22px;
  text-align: center;
}

.choose-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.choose-logout {
  width: 100%;
  margin-top: 18px;
}
</style>
