<script setup lang="ts">
/**
 * 管理员注册（已接桩：待实现 @/api/user.adminRegister）
 *
 * 口径说明：
 *   - POST /api/user/auth/admin/register {username,password,adminKey}；
 *   - 需系统初始化密钥 app.admin.init-key（后端配置项，运维现场输入，不得对学生暴露）；
 *   - 注册即登录：成功时 data 直接返回 token 字符串（不是对象），
 *     写入 authStore 持久化方法后跳 /admin/users；
 *   - 失败（密钥错误等）由 axios 响应拦截器统一提示后端 message。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { adminRegister } from '@/api/user';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const form = ref({
  username: '',
  password: '',
  confirmPassword: '',
  adminKey: '',
});

const showPassword = ref(false);
const showKey = ref(false);
const submitting = ref(false);
/** 接口未连通时的提示（桩抛错时保留表单内容供重试） */
const apiError = ref<string | null>(null);

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

async function handleSubmit() {
  if (!canSubmit.value) {
    if (passwordMismatch.value) ElMessage.warning('两次输入的密码不一致');
    return;
  }
  apiError.value = null;
  submitting.value = true;
  try {
    // 后端成功时 data 为 token 字符串
    const token = await adminRegister({
      username: form.value.username.trim(),
      password: form.value.password,
      adminKey: form.value.adminKey.trim(),
    });
    if (!token) {
      apiError.value = '注册接口未返回 token，请确认后端 POST /api/user/auth/admin/register 实现';
      return;
    }
    authStore.persistToken(token, form.value.username.trim());
    ElMessage.success('管理员账号注册成功，已自动登录');
    await router.push('/admin/users');
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e ?? '');
    // 桩必定抛「未实现：...」，此处转成统一的待实现口径，其余错误已由拦截器提示
    apiError.value = message.includes('未实现')
      ? '接口待实现：@/api/user.adminRegister'
      : message || '注册失败，请检查初始化密钥';
  } finally {
    submitting.value = false;
  }
}

function backToLogin() {
  if (authStore.isAuthenticated) {
    router.push('/admin/dashboard');
    return;
  }
  router.push('/login');
}
</script>

<template>
  <div class="st-view register-view">
    <div class="register-card st-card">
      <div class="st-card__header">
        <ShieldCheck :size="18" class="card-icon" />
        <div>
          <h2 class="st-card__title">管理员注册</h2>
          <p class="st-card__hint">需系统初始化密钥 app.admin.init-key · 注册成功后直接登录进入运维端</p>
        </div>
      </div>

      <div class="st-card__body">
        <div class="form-item">
          <label class="form-label">用户名</label>
          <input v-model="form.username" class="form-input" placeholder="登录账号，如：admin_js" maxlength="32" />
        </div>

        <div class="form-item">
          <label class="form-label">密码</label>
          <div class="input-with-action">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              maxlength="32"
              placeholder="6-32 位，后端 BCrypt 加密存储"
            />
            <button class="icon-btn" type="button" @click="showPassword = !showPassword">
              <Eye v-if="!showPassword" :size="14" />
              <EyeOff v-else :size="14" />
            </button>
          </div>
          <p v-if="form.password && !passwordValid" class="form-hint form-hint--bad">密码长度需为 6-32 位</p>
        </div>

        <div class="form-item">
          <label class="form-label">确认密码</label>
          <input
            v-model="form.confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            class="form-input"
            maxlength="32"
            placeholder="再次输入密码"
          />
          <p v-if="passwordMismatch" class="form-hint form-hint--bad">两次输入的密码不一致</p>
        </div>

        <div class="form-item">
          <label class="form-label">初始化密钥 adminKey</label>
          <div class="input-with-action">
            <input
              v-model="form.adminKey"
              :type="showKey ? 'text' : 'password'"
              class="form-input"
              placeholder="由运维现场输入的 app.admin.init-key"
            />
            <button class="icon-btn" type="button" @click="showKey = !showKey">
              <Eye v-if="!showKey" :size="14" />
              <EyeOff v-else :size="14" />
            </button>
          </div>
          <p class="form-hint">
            已接桩：待实现 @/api/user.adminRegister —— POST /api/user/auth/admin/register
            {username,password,adminKey}；密钥来自后端配置 app.admin.init-key，注册即登录，data 返回 token 字符串。
          </p>
        </div>

        <!-- 接口未连通 / 注册失败提示：保留表单内容，可直接重试 -->
        <div v-if="apiError" class="api-error">
          <div class="api-error__text">{{ apiError }}</div>
          <button class="st-text-btn" type="button" @click="apiError = null">收起提示</button>
        </div>

        <button class="st-btn st-btn--primary st-btn--block" :disabled="!canSubmit" @click="handleSubmit">
          <Loader2 v-if="submitting" :size="14" class="spin" />
          <KeyRound v-else :size="14" />
          {{ submitting ? '注册中…' : '注册并登录' }}
        </button>

        <button class="st-text-btn back-btn" @click="backToLogin">
          <ArrowLeft :size="12" style="vertical-align: -2px;" />
          {{ authStore.isAuthenticated ? '返回运维端首页' : '返回登录页' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-view {
  display: flex;
  justify-content: center;
  padding-top: 60px;
}

.register-card {
  width: 440px;
  max-width: 100%;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.form-item {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin: 6px 0 0;
  line-height: 1.6;
}

.form-hint--bad {
  color: var(--status-danger);
}

.input-with-action {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  height: 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 36px 0 12px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--border-strong);
}

.icon-btn {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.icon-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.back-btn {
  width: 100%;
  margin-top: 12px;
}

.api-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0 14px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.api-error__text {
  flex: 1;
  min-width: 0;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
