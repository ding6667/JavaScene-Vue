import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as loginApi, register as registerApi } from '@/api/auth';
import { defaultSettings } from '@/api/settings';
import type { AuthRequest, AuthResponse } from '@/types/auth';

const TOKEN_KEY = 'auth_token';

/**
 * 接口预留：GET /api/user/info（返回 id/username/realName/email/phone/
 * studentNo/className/major/title/roleId/roleName/enabled/createTime）
 * 尚未接入。当前登录态只凭本地 token 推断，刷新页面无法校验会话是否仍有效，
 * 角色/班级等信息也拿不到，需由学生在此补 fetchUserInfo 后驱动各端展示。
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(localStorage.getItem('auth_username'));

  const isAuthenticated = computed(() => !!token.value);

  /** 暂存 token 到内存与 localStorage */
  function persistToken(t: string, name: string) {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
    username.value = name;
    localStorage.setItem('auth_username', name);
  }

  async function login(data: AuthRequest) {
    // 业务错误由响应拦截器统一提示，此处只需捕获并返回 false
    try {
      const res: AuthResponse = await loginApi(data);
      if (res.data) {
        persistToken(res.data, data.username);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function register(data: AuthRequest) {
    try {
      const res: AuthResponse = await registerApi(data);
      // 注册成功后后端直接返回 token，暂存并进入登录态
      if (res.data) {
        persistToken(res.data, data.username);
        // 新用户注册后自动初始化默认常规设置（失败不影响注册流程）
        try {
          await defaultSettings();
        } catch {
          // 忽略初始化失败，不影响注册成功
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function logout() {
    token.value = null;
    username.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('auth_username');
  }

  return {
    token,
    username,
    isAuthenticated,
    login,
    register,
    logout,
  };
});
