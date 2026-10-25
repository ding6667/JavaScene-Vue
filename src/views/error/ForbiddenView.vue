<script setup lang="ts">
/**
 * 403：角色不足被路由守卫拦下时落到这里。
 * 只提示，不清登录态 —— 误输 URL 不该被惩罚；真正的越权请求由后端 403 触发拦截器强制下线。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, LogOut } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { useLogout } from '@/composables/useLogout';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { loggingOut, logout } = useLogout();

const from = computed(() => (route.query.from as string) || '');

function goHome() {
  router.replace(auth.resolveHome());
}
</script>

<template>
  <div class="forbidden-view">
    <div class="forbidden-inner">
      <div class="forbidden-code">403</div>
      <h1 class="st-page-title">没有权限访问该页面</h1>
      <p class="st-page-subtitle">
        当前账号的角色进不去这个端{{ from ? `：${from}` : '' }}
      </p>
      <div class="forbidden-actions">
        <button class="st-btn st-btn--primary" @click="goHome">
          <ArrowLeft :size="14" />
          返回我的首页
        </button>
        <button class="st-btn st-btn--secondary" :disabled="loggingOut" @click="logout">
          <LogOut :size="14" />
          退出登录
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forbidden-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--bg-canvas);
}

.forbidden-inner {
  text-align: center;
}

.forbidden-code {
  font-size: 72px;
  font-weight: 700;
  letter-spacing: -2px;
  line-height: 1;
  color: var(--border-default);
  margin-bottom: 18px;
}

.forbidden-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 24px;
}
</style>
