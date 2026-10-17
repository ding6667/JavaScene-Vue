<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { GraduationCap, ShieldCheck } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import type { AuthMode } from '@/types/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const mode = ref<AuthMode>('login');
const loading = ref(false);
const formRef = ref();

const form = reactive({
  username: '',
  password: '',
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
};

// 切换模式时清空表单
watch(mode, () => {
  form.username = '';
  form.password = '';
  formRef.value?.clearValidate();
});

function switchMode(target: AuthMode) {
  if (mode.value === target) return;
  mode.value = target;
}

/** 管理员注册入口：已对接路由 /admin/register（注册提交逻辑在该页，见 @/api/user.adminRegister） */
function gotoAdminRegister() {
  router.push('/admin/register');
}

async function handleSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }

  loading.value = true;
  try {
    if (mode.value === 'login') {
      const ok = await authStore.login({ ...form });
      if (ok) {
        ElMessage.success('登录成功');
        const redirect = (route.query.redirect as string) || '/';
        router.push(redirect);
      }
      // 失败时错误提示由响应拦截器统一渲染后端 message
    } else {
      const ok = await authStore.register({ ...form });
      if (ok) {
        // 注册成功后后端直接返回 token，直接进入主页面
        ElMessage.success('注册成功');
        router.push('/');
      }
      // 失败时错误提示由响应拦截器统一渲染后端 message
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <!-- 品牌区 -->
      <div class="brand">
        <div class="brand-icon">
          <GraduationCap :size="22" />
        </div>
        <h1 class="brand-title">作业批阅系统</h1>
        <p class="brand-subtitle">
          {{ mode === 'login' ? '登录以继续使用' : '创建新账户' }}
        </p>
      </div>

      <!-- 模式切换器 -->
      <div class="mode-toggle">
        <div
          class="toggle-slider"
          :class="{ 'toggle-slider--right': mode === 'register' }"
        ></div>
        <button
          type="button"
          class="toggle-option"
          :class="{ 'toggle-option--active': mode === 'login' }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          class="toggle-option"
          :class="{ 'toggle-option--active': mode === 'register' }"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <!-- 表单 -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="auth-form"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            size="large"
            :prefix-icon="null"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>
      </el-form>

      <!-- 提交按钮 -->
      <button
        class="submit-btn"
        :disabled="loading"
        @click="handleSubmit"
      >
        {{ loading ? '处理中...' : (mode === 'login' ? '登录' : '注册') }}
      </button>

      <!-- 管理员注册入口：本页不实现管理员注册提交，统一跳转 /admin/register -->
      <div class="auth-foot">
        <button type="button" class="foot-link" @click="gotoAdminRegister">
          <ShieldCheck :size="13" />
          管理员注册（需系统初始化密钥）
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-canvas);
  padding: 24px;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: 40px 36px;
}

/* 品牌区 */
.brand {
  text-align: center;
  margin-bottom: 32px;
}

.brand-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
}

.brand-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  letter-spacing: -0.2px;
}

.brand-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

/* 模式切换器：方块滑动 */
.mode-toggle {
  position: relative;
  display: flex;
  width: 100%;
  height: 44px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 4px;
  margin-bottom: 28px;
  overflow: hidden;
}

/* 滑动方块主体 */
.toggle-slider {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: var(--text-primary);
  border-radius: calc(var(--radius-md) - 2px);
  box-shadow: 0 1px 3px rgba(28, 25, 23, 0.12);
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}

.toggle-slider--right {
  transform: translateX(100%);
}

/* 切换选项 */
.toggle-option {
  flex: 1;
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.28s ease;
  font-family: inherit;
}

.toggle-option--active {
  color: var(--bg-surface);
  font-weight: 600;
}

/* 表单 */
.auth-form {
  margin-bottom: 24px;
}

.auth-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.auth-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  padding-bottom: 6px;
  line-height: 1.4;
}

.auth-form :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  box-shadow: 0 0 0 1px var(--border-default) inset;
  transition: box-shadow var(--transition);
  padding: 4px 14px;
}

.auth-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--border-strong) inset !important;
}

.auth-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--border-strong) inset;
}

.auth-form :deep(.el-input__inner) {
  font-size: 14px;
  color: var(--text-primary);
  height: 40px;
}

.auth-form :deep(.el-input__inner::placeholder) {
  color: var(--text-tertiary);
}

/* 提交按钮 */
.submit-btn {
  width: 100%;
  height: 44px;
  background: var(--text-primary);
  color: var(--bg-surface);
  border: 1px solid var(--text-primary);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition), transform 0.1s ease;
  font-family: inherit;
}

.submit-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 管理员注册入口 */
.auth-foot {
  margin-top: 18px;
  display: flex;
  justify-content: center;
}

.foot-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition), color var(--transition);
}

.foot-link:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

/* 响应式 */
@media (max-width: 480px) {
  .auth-card {
    padding: 32px 24px;
  }

  .brand-title {
    font-size: 18px;
  }
}
</style>
