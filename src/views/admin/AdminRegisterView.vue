<script setup lang="ts">
/**
 * 管理员注册 —— UI 骨架页（后端无对应接口）
 *
 * 接口预留：POST /api/user/auth/admin/register {username,password,adminKey}
 *  口径说明：
 *   - 需系统初始化密钥 app.admin.init-key（由后端配置文件下发，运维现场输入，不得对学生暴露）；
 *   - 注册即登录：校验通过后后端创建 ADMIN 角色账号，data 直接返回 token 字符串（不是对象），
 *     前端拿到后应写入用户态并跳转 /admin/dashboard；
 *   - 与普通用户注册的区别：不返回 AdminUser，只有 token；失败时由 message 提示密钥错误。
 *
 * 本页不接 api / pinia，仅保留表单与前端校验状态，提交按钮不发起请求。
 */
import { computed, ref } from 'vue';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

const form = ref({
  username: '',
  password: '',
  confirmPassword: '',
  adminKey: '',
});

const showPassword = ref(false);
const showKey = ref(false);

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
    form.value.adminKey.trim() !== '',
);

function handleSubmit() {
  if (passwordMismatch.value) {
    ElMessage.warning('两次输入的密码不一致');
    return;
  }
  // 接口预留：后端未提供管理员注册接口，此处不发起请求
  ElMessage.info('接口预留：后端未提供 POST /api/user/auth/admin/register 接口');
}

function backToLogin() {
  ElMessage.info('接口预留：管理员注册页待接入路由后可返回登录入口');
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
            接口预留：POST /api/user/auth/admin/register {username,password,adminKey}；
            密钥来自后端配置 app.admin.init-key，注册即登录，data 返回 token 字符串。
          </p>
        </div>

        <button class="st-btn st-btn--primary st-btn--block" :disabled="!canSubmit" @click="handleSubmit">
          <KeyRound :size="14" /> 注册并登录
        </button>

        <button class="st-text-btn back-btn" @click="backToLogin">
          <ArrowLeft :size="12" style="vertical-align: -2px;" /> 返回运维端首页
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
</style>
