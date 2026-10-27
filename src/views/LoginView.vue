<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { GraduationCap, ShieldCheck } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import AdminRegisterCard from '@/components/auth/AdminRegisterCard.vue';
import type { AuthMode, LoginResult } from '@/types/auth';
import type { UserRoleName } from '@/types/user';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

/** 当前展示的卡片：登录 / 管理员注册。两者同页切换，不跳路由、不进运维端布局 */
const view = ref<'login' | 'admin'>('login');
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

/** 被拦截器踢回登录页时带上原因，这里只负责把话说明白 */
onMounted(() => {
  const reason = route.query.reason as string | undefined;
  if (reason === 'expired') ElMessage.warning('登录已过期，请重新登录');
  else if (reason === 'forbidden') ElMessage.error('检测到越权访问，已强制退出');
  // 改密码 / 封号 / 服务端主动吊销：用户是「突然」被下线的，必须给个说法
  else if (reason === 'kicked') ElMessage.warning('账号状态已变更，请重新登录');

  nextTick(() => moveSlider(false));
  window.addEventListener('resize', handleResize);
});

function switchMode(target: AuthMode) {
  if (mode.value === target) return;
  mode.value = target;
}

/* ---------------- Liquid tab indicator ---------------- */
const sliderRef = ref<HTMLElement | null>(null);
const loginTabRef = ref<HTMLButtonElement | null>(null);
const registerTabRef = ref<HTMLButtonElement | null>(null);

let sliderAnimation: Animation | null = null;

function currentSliderFrame(): { left: number; width: number } {
  const slider = sliderRef.value;
  if (!slider) return { left: 0, width: 0 };
  const styles = getComputedStyle(slider);
  return { left: parseFloat(styles.left), width: parseFloat(styles.width) };
}

/**
 * Liquid indicator: the pill stretches along its travel direction, lands with a
 * subtle overshoot, compresses a touch, then settles back to the tab width.
 * WAAPI (instead of CSS transition) lets rapid clicks continue from the exact
 * current frame instead of snapping back to the previous target.
 */
function moveSlider(animate = true) {
  const slider = sliderRef.value;
  const target = mode.value === 'login' ? loginTabRef.value : registerTabRef.value;
  if (!slider || !target) return;

  const toLeft = target.offsetLeft;
  const toWidth = target.offsetWidth;

  if (!animate) {
    sliderAnimation?.cancel();
    sliderAnimation = null;
    slider.style.left = `${toLeft}px`;
    slider.style.width = `${toWidth}px`;
    return;
  }

  // Read the live frame first, then cancel the old animation and continue from it.
  const current = currentSliderFrame();
  sliderAnimation?.cancel();
  sliderAnimation = null;

  const fromLeft = Number.isFinite(current.left) ? current.left : toLeft;
  const fromWidth = Number.isFinite(current.width) ? current.width : toWidth;
  const distance = toLeft - fromLeft;

  if (Math.abs(distance) < 0.5 && Math.abs(toWidth - fromWidth) < 0.5) {
    slider.style.left = `${toLeft}px`;
    slider.style.width = `${toWidth}px`;
    return;
  }

  const stretch = Math.min(24, Math.max(12, Math.abs(distance) * 0.22));
  const overshoot = Math.min(4, Math.max(2, Math.abs(distance) * 0.04));
  const dir = distance >= 0 ? 1 : -1;

  sliderAnimation = slider.animate(
    [
      { left: `${fromLeft}px`, width: `${fromWidth}px`, offset: 0 },
      { left: `${fromLeft + distance * 0.68}px`, width: `${fromWidth + stretch}px`, offset: 0.46 },
      { left: `${toLeft + overshoot * dir}px`, width: `${Math.max(20, toWidth - 3)}px`, offset: 0.76 },
      { left: `${toLeft - overshoot * 0.3 * dir}px`, width: `${toWidth + 1.5}px`, offset: 0.9 },
      { left: `${toLeft}px`, width: `${toWidth}px`, offset: 1 },
    ],
    {
      duration: 460,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      fill: 'forwards',
    },
  );

  sliderAnimation.onfinish = () => {
    slider.style.left = `${toLeft}px`;
    slider.style.width = `${toWidth}px`;
    sliderAnimation?.cancel();
    sliderAnimation = null;
  };
}

watch(mode, () => nextTick(() => moveSlider(true)));

function handleResize() {
  moveSlider(false);
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  sliderAnimation?.cancel();
  sliderAnimation = null;
});

/**
 * 登录后去向：redirect > 多角色选端页 > 后端算好的 defaultRoute > 按角色兜底。
 * 只接受站内绝对路径，`//evil.com` 这类协议相对地址一律忽略，防 open redirect。
 * 还要按路由 meta.roles 校验落点：登录页可能带着上一次访问学生页留下的
 * redirect（如 /student/dashboard），教师登录后直接跳过去只会得到 403。
 */
function isKnownRole(role: unknown): role is UserRoleName {
  return role === 'ADMIN' || role === 'TEACHER' || role === 'STUDENT';
}

function canEnter(path: string, roles: string[]): boolean {
  const resolved = router.resolve(path);
  const required = (resolved.meta.roles as string[] | undefined) ?? [];
  if (!required.length) return true;
  // 角色未知时不再“放行”：否则可能把教师送进学生页，随后被守卫 403 拦下
  return roles.length > 0 && required.some((role) => roles.includes(role));
}

function isInternalPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

/** 登录落点不接受 403 / 登录页本身，避免登录后立刻又被送回 403 或登录页 */
function isUsableTarget(path: unknown): path is string {
  return isInternalPath(path) && path !== '/403' && !path.startsWith('/login');
}

function resolveTarget(session: LoginResult) {
  // 落点必须和路由守卫用同一份角色数据（守卫读 store；token 声明优先于登录响应），
  // 否则会出现“按登录响应跳到教师页、守卫按 token 角色判成越权”的 403。
  // 登录响应里的角色先做白名单过滤：后端若下发 ROLE_TEACHER / 小写 teacher 这类值，
  // 不能被当成有效角色，更不能让 resolveHome 落到 /403。
  const sessionRoles = (Array.isArray(session.roles) ? session.roles : [])
    .map((role) => String(role).trim().replace(/^ROLE_/i, ''))
    .filter(isKnownRole);
  const roles: UserRoleName[] = authStore.roles.length ? authStore.roles : sessionRoles;
  const redirect = route.query.redirect;

  // 多角色 / 角色未知一律先进选端页，避免带着跨端 redirect 直接进某个端
  if (roles.length !== 1) return '/choose-portal';

  if (isUsableTarget(redirect) && canEnter(redirect, roles)) {
    return redirect;
  }

  const fallback = isUsableTarget(session.defaultRoute) && canEnter(session.defaultRoute, roles)
    ? session.defaultRoute
    : authStore.resolveHome(roles);
  return fallback;
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
    const session = mode.value === 'login'
      ? await authStore.login({ ...form })
      : await authStore.register({ ...form });
    // store 内已等过 /user/info，角色就位后才能算出该跳哪个端
    if (session) {
      ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功');
      await router.replace(resolveTarget(session));
    }
    // 失败时错误提示由响应拦截器统一渲染后端 message
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-stage">
      <!-- 登录 / 普通注册卡片：切到管理员注册时上移缩小淡出 -->
      <div class="auth-slot auth-slot--login" :class="{ 'is-off': view === 'admin' }">
        <div class="auth-card">
      <!-- 品牌区 -->
      <div class="brand">
        <div class="brand-icon">
          <GraduationCap :size="22" />
        </div>
        <h1 class="brand-title">智能教学系统</h1>
        <p class="brand-subtitle">
          {{ mode === 'login' ? '登录以继续使用' : '创建新账户' }}
        </p>
      </div>

      <!-- 模式切换器 -->
      <div class="mode-toggle">
        <div ref="sliderRef" class="toggle-slider" aria-hidden="true"></div>
        <button
          ref="loginTabRef"
          type="button"
          class="toggle-option"
          :class="{ 'toggle-option--active': mode === 'login' }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          ref="registerTabRef"
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

      <!-- 管理员注册入口：同页切换卡片，不跳转，避免落进运维端布局 -->
      <div class="auth-foot">
        <button type="button" class="foot-link" @click="view = 'admin'">
          <ShieldCheck :size="13" />
          管理员注册（需系统初始化密钥）
        </button>
      </div>
        </div>
      </div>

      <!-- 管理员注册卡片：从右侧滑入，返回登录时反向滑出 -->
      <div class="auth-slot auth-slot--admin" :class="{ 'is-on': view === 'admin' }">
        <AdminRegisterCard :active="view === 'admin'" @back="view = 'login'" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  background: var(--bg-canvas);
  padding: 24px;
}

/* 两张卡片叠在同一个网格单元：切换时高度不跳动，只做位移与淡入淡出 */
.auth-stage {
  display: grid;
  width: 100%;
  max-width: 420px;
  margin: auto 0;
}

.auth-slot {
  grid-area: 1 / 1;
  align-self: center;
  width: 100%;
}

/* 登录卡：上移 + 轻微缩小 + 淡出 */
.auth-slot--login {
  opacity: 1;
  transform: translateY(0) scale(1);
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.28s ease 0.06s, transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) 0.04s,
    visibility 0s;
}

.auth-slot--login.is-off {
  opacity: 0;
  transform: translateY(-14px) scale(0.96);
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.24s ease, transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1),
    visibility 0s linear 0.34s;
}

/* 管理员注册卡：默认停在右侧，切到前台时滑入 */
.auth-slot--admin {
  opacity: 0;
  transform: translateX(64px);
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.24s ease, transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1),
    visibility 0s linear 0.36s;
}

.auth-slot--admin.is-on {
  opacity: 1;
  transform: translateX(0);
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.3s ease 0.06s, transform 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) 0.04s,
    visibility 0s;
}

.auth-card {
  width: 100%;
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

/* 指示条：left / width 由 WAAPI 驱动，圆角始终跟随尺寸，不靠 scaleX 拉伸 */
.toggle-slider {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: var(--text-primary);
  border-radius: calc(var(--radius-md) - 2px);
  box-shadow: 0 1px 3px rgba(28, 25, 23, 0.12);
  will-change: left, width;
  pointer-events: none;
  z-index: 0;
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
