<script setup lang="ts">
/**
 * 管理员注册独立页（公开路由 /admin/register）
 * 不再挂在 AdminLayout 下：未登录访问时只看到这张注册卡，看不到运维端内部导航。
 * 登录页内的管理员注册卡片复用同一个组件，两处不会出现两套逻辑。
 */
import { useRouter } from 'vue-router';
import AdminRegisterCard from '@/components/auth/AdminRegisterCard.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

function handleBack() {
  router.push(authStore.isAuthenticated ? '/admin/dashboard' : '/login');
}
</script>

<template>
  <div class="auth-page">
    <div class="register-stage">
      <AdminRegisterCard :active="true" @back="handleBack" />
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 24px;
  background: var(--bg-canvas);
}

.register-stage {
  width: 100%;
  max-width: 420px;
  margin: auto 0;
}
</style>
