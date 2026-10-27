<script setup lang="ts">
/**
 * 管理员注册卡片
 * - 登录页内嵌：与登录卡同页切换，不跳转、不进入运维端布局
 * - 独立公开页（/admin/register）复用同一张卡，未登录也看不到内部页面骨架
 *
 * 口径不变：
 *   - POST /api/user/auth/admin/register {username,password,adminKey}
 *   - adminKey 是后端配置项，仅运维现场使用
 *   - 注册成功只暂存新会话，用户点「进入账号主页」才切换到新账号
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { adminRegister } from '@/api/user';
import { useAuthStore } from '@/stores/auth';
import { useLogout } from '@/composables/useLogout';
import type { LoginResult } from '@/types/auth';

const props = defineProps<{
  /** 登录页里卡片被切到前台时为 true，用于每次进入时清空上一次的表单/成功态 */
  active?: boolean;
}>();

const emit = defineEmits<{
  /** 返回登录：由外层决定回登录卡还是 /login */
  back: [];
}>();

const router = useRouter();
const authStore = useAuthStore();
const { logout } = useLogout();

const form = ref({
  username: '',
  password: '',
  confirmPassword: '',
  adminKey: '',
});

const showPassword = ref(false);
const showKey = ref(false);
const submitting = ref(false);
const apiError = ref<string | null>(null);
/** 新账号会话：只在用户点「进入账号主页」时才写入 */
const pendingSession = ref<LoginResult | null>(null);
const registered = ref(false);
/** 操作者原会话：用于「返回我的主页」保持操作者身份 */
const operatorWasLoggedIn = ref(false);
const operatorHome = '/admin/dashboard';

const passwordValid = computed(() => {
  const len = form.value.password.length;
  return len >= 6 && len <= 32;
});

const passwordMismatch = computed(
  () => form.value.confirmPassword !== '' && form.value.password !== form.value.confirmPassword,
);

const canSubmit = computed(
  () =>
    form.value.username.trim() !== '' &&
    passwordValid.value &&
    !passwordMismatch.value &&
    form.value.confirmPassword !== '' &&
    form.value.adminKey.trim() !== '' &&
    !submitting.value,
);

function reset() {
  form.value = { username: '', password: '', confirmPassword: '', adminKey: '' };
  showPassword.value = false;
  showKey.value = false;
  submitting.value = false;
  apiError.value = null;
  pendingSession.value = null;
  registered.value = false;
}

watch(
  () => props.active,
  (active) => {
    if (active) reset();
  },
);

async function handleSubmit() {
  if (!canSubmit.value) {
    if (passwordMismatch.value) ElMessage.warning('两次输入的密码不一致');
    return;
  }
  apiError.value = null;
  submitting.value = true;
  try {
    const session = await adminRegister({
      username: form.value.username.trim(),
      password: form.value.password,
      adminKey: form.value.adminKey.trim(),
    });
    if (!session?.token) {
      apiError.value = '注册失败：后端未返回 token';
      return;
    }
    // 替别人开号：新会话先暂存，不覆盖操作者当前会话
    operatorWasLoggedIn.value = authStore.isAuthenticated;
    pendingSession.value = session;
    registered.value = true;
    ElMessage.success('管理员账号注册成功');
  } catch (e: unknown) {
    apiError.value = e instanceof Error ? e.message : String(e ?? '');
  } finally {
    submitting.value = false;
  }
}

function handleBack() {
  emit('back');
}

// ==================== 注册成功后的三个去向 ====================

/** 进入账号主页：以新注册账号身份进入，只有这一步才写入新会话 */
async function goAccountHome() {
  const session = pendingSession.value;
  if (session) {
    authStore.applySession(session);
    await authStore.restoreSession();
    pendingSession.value = null;
    await router.replace(session.defaultRoute || operatorHome);
    return;
  }
  await router.replace(operatorHome);
}

/** 返回首页：保持操作者原会话；原本未登录则由外层切回登录卡 */
function goSiteHome() {
  if (operatorWasLoggedIn.value) {
    router.push(operatorHome);
    return;
  }
  emit('back');
}

/** 直接退出登录：清掉当前会话并回登录页 */
async function logoutAfterRegister() {
  registered.value = false;
  pendingSession.value = null;
  await logout();
  emit('back');
}
</script>

<template>
  <section class="admin-card">
    <header class="brand">
      <span class="brand-icon">
        <ShieldCheck :size="22" />
      </span>
      <h1 class="brand-title">管理员注册</h1>
      <p class="brand-subtitle">需系统初始化密钥 · 仅运维开号使用</p>
    </header>

    <form v-if="!registered" class="admin-form" @submit.prevent="handleSubmit">
      <div class="field">
        <label class="field__label" for="admin-username">用户名</label>
        <input
          id="admin-username"
          v-model="form.username"
          class="field__input"
          maxlength="32"
          autocomplete="off"
          placeholder="登录账号，如：admin_js"
        />
      </div>

      <div class="field">
        <label class="field__label" for="admin-password">密码</label>
        <div class="field__wrap">
          <input
            id="admin-password"
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            class="field__input field__input--action"
            maxlength="32"
            autocomplete="new-password"
            placeholder="6-32 位，后端加密存储"
          />
          <button
            class="eye-btn"
            type="button"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" :size="14" />
            <Eye v-else :size="14" />
          </button>
        </div>
        <p v-if="form.password && !passwordValid" class="field__hint field__hint--bad">密码长度需为 6-32 位</p>
      </div>

      <div class="field">
        <label class="field__label" for="admin-confirm">确认密码</label>
        <input
          id="admin-confirm"
          v-model="form.confirmPassword"
          :type="showPassword ? 'text' : 'password'"
          class="field__input"
          maxlength="32"
          autocomplete="new-password"
          placeholder="再次输入密码"
        />
        <p v-if="passwordMismatch" class="field__hint field__hint--bad">两次输入的密码不一致</p>
      </div>

      <div class="field">
        <label class="field__label" for="admin-key">初始化密钥 adminKey</label>
        <div class="field__wrap">
          <input
            id="admin-key"
            v-model="form.adminKey"
            :type="showKey ? 'text' : 'password'"
            class="field__input field__input--action"
            autocomplete="off"
            placeholder="系统管理员初始化密钥"
          />
          <button
            class="eye-btn"
            type="button"
            :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
            @click="showKey = !showKey"
          >
            <EyeOff v-if="showKey" :size="14" />
            <Eye v-else :size="14" />
          </button>
        </div>
      </div>

      <div v-if="apiError" class="api-error">
        <div class="api-error__text">{{ apiError }}</div>
        <button class="text-btn" type="button" @click="apiError = null">收起提示</button>
      </div>

      <button class="submit-btn" type="submit" :disabled="!canSubmit">
        <Loader2 v-if="submitting" :size="14" class="spin" />
        <KeyRound v-else :size="14" />
        {{ submitting ? '注册中…' : '注册并登录' }}
      </button>

      <button class="back-link" type="button" @click="handleBack">
        <ArrowLeft :size="12" />
        {{ authStore.isAuthenticated ? '返回运维端首页' : '返回登录' }}
      </button>
    </form>

    <div v-else class="success">
      <span class="success__icon">
        <ShieldCheck :size="38" :stroke-width="1.4" />
      </span>
      <h3 class="success__title">注册成功</h3>
      <p class="success__desc">
        管理员账号「{{ form.username }}」已创建<br />
        当前仍是{{ operatorWasLoggedIn ? '你本人的登录态' : '未登录状态' }}，请选择下一步操作
      </p>

      <div class="success__actions">
        <button class="btn btn--dark" type="button" @click="goAccountHome">进入账号主页</button>
        <button class="btn btn--light" type="button" @click="goSiteHome">
          {{ operatorWasLoggedIn ? '返回我的主页' : '返回登录' }}
        </button>
        <button class="text-btn" type="button" @click="logoutAfterRegister">直接退出登录</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-card {
  width: 100%;
  padding: 40px 36px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

/* ---------- 品牌区 ---------- */
.brand {
  margin-bottom: 26px;
  text-align: center;
}

.brand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.brand-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.brand-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ---------- 表单 ---------- */
.field {
  margin-bottom: 16px;
}

.field__label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.field__wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field__input {
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.field__input--action {
  padding-right: 38px;
}

.field__input::placeholder {
  color: var(--text-tertiary);
}

.field__input:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 3px rgba(28, 25, 23, 0.05);
}

.field__hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.field__hint--bad {
  color: var(--status-danger);
}

.eye-btn {
  position: absolute;
  right: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.eye-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.api-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 2px 0 14px;
  padding: 9px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--status-danger-bg);
  color: var(--status-danger);
  font-size: 12px;
  line-height: 1.6;
}

.api-error__text {
  flex: 1;
  min-width: 0;
}

/* ---------- 按钮 ---------- */
.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 44px;
  margin-top: 6px;
  border: 1px solid var(--text-primary);
  border-radius: var(--radius-md);
  background: var(--text-primary);
  color: var(--bg-surface);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition), transform 0.1s ease;
}

.submit-btn:hover:not(:disabled) {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.99);
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.back-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 12px;
  padding: 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.back-link:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

/* ---------- 注册成功 ---------- */
.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 4px;
}

.success__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.success__title {
  margin: 16px 0 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.success__desc {
  margin: 8px 0 22px;
  font-size: 12.5px;
  line-height: 1.7;
  text-align: center;
  color: var(--text-secondary);
}

.success__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 42px;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}

.btn--dark {
  border: 1px solid var(--text-primary);
  background: var(--text-primary);
  color: var(--bg-surface);
}

.btn--dark:hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.btn--light {
  border: 1px solid var(--border-strong);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.btn--light:hover {
  background: var(--bg-subtle);
}

.text-btn {
  align-self: center;
  margin-top: 2px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.text-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .admin-card {
    padding: 32px 24px;
  }

  .brand-title {
    font-size: 18px;
  }
}
</style>
