import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as loginApi, register as registerApi } from '@/api/auth';
import { defaultSettings } from '@/api/settings';
import { fetchUserInfo } from '@/api/user';
import type { AuthRequest, AuthResponse } from '@/types/auth';
import type { UserRoleName } from '@/types/user';
import { ROLE_LABELS } from '@/types/user';

const TOKEN_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';
const REALNAME_KEY = 'auth_real_name';
const ROLE_KEY = 'auth_role_name';
const USERID_KEY = 'auth_user_id';

/** @/api/user 的桩函数固定抛「未实现：...」；据此区分「接口待实现」与「会话真失效」 */
const STUB_ERROR_MARK = '未实现';

/** 会话恢复结果：成功 / 桩未实现（保留本地登录态）/ 会话失效（已清 token） */
export type SessionRestoreState = 'idle' | 'restored' | 'pending-api' | 'expired';

/**
 * 登录态与当前用户档案。
 * 已接桩：待实现 @/api/user.fetchUserInfo —— 该函数当前必定 throw，
 * restoreSession() 因此走 'pending-api' 分支：只信任本地 token，不清登录态、不弹错，
 * 学生实现 /api/user/info 后无需改动本 store 即可拿到 realName / roleName。
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(localStorage.getItem(USERNAME_KEY));
  const realName = ref<string | null>(localStorage.getItem(REALNAME_KEY));
  const roleName = ref<UserRoleName | null>((localStorage.getItem(ROLE_KEY) as UserRoleName | null) ?? null);
  const userId = ref<number | null>(Number(localStorage.getItem(USERID_KEY)) || null);

  /** 会话恢复状态，供导航/端口判断与调试提示使用 */
  const sessionState = ref<SessionRestoreState>('idle');
  /** 会话恢复失败原因（桩未实现时为「接口待实现：@/api/user.fetchUserInfo」） */
  const sessionError = ref<string | null>(null);
  const restoring = ref(false);

  const isAuthenticated = computed(() => !!token.value);
  const roleLabel = computed(() => (roleName.value ? ROLE_LABELS[roleName.value] : '未知角色'));
  /** 展示名：优先真实姓名，降级为登录用户名 */
  const displayName = computed(() => realName.value || username.value || '未登录');
  const isStudent = computed(() => roleName.value === 'STUDENT');
  const isTeacher = computed(() => roleName.value === 'TEACHER');
  const isAdmin = computed(() => roleName.value === 'ADMIN');

  /** 写入用户档案（state + localStorage），/user/info 未实现时保持本地值 */
  function persistProfile(name: string, name2: string | null, role: UserRoleName | null, id: number | null) {
    username.value = name;
    localStorage.setItem(USERNAME_KEY, name);
    if (name2 !== null) {
      realName.value = name2;
      localStorage.setItem(REALNAME_KEY, name2);
    }
    if (role !== null) {
      roleName.value = role;
      localStorage.setItem(ROLE_KEY, role);
    }
    if (id !== null) {
      userId.value = id;
      localStorage.setItem(USERID_KEY, String(id));
    }
  }

  /** 暂存 token 到内存与 localStorage（登录 / 注册 / 管理员注册共用） */
  function persistToken(t: string, name: string) {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
    persistProfile(name, null, null, null);
  }

  /**
   * 刷新页面 / 首次进入时校验会话：调用 /api/user/info 拉当前登录用户。
   * - 成功：写入 username/realName/roleName（+ userId）
   * - 桩未实现：标记 'pending-api'，保留本地 token（否则每次刷新都会把人踢回登录页）
   * - 其他失败（含 401）：视为会话失效，清空 token，由路由守卫把用户放行到登录页
   */
  async function restoreSession(): Promise<boolean> {
    if (!token.value) {
      sessionState.value = 'idle';
      sessionError.value = null;
      return false;
    }
    restoring.value = true;
    try {
      const user = await fetchUserInfo();
      persistProfile(user.username || username.value || '', user.realName ?? null, user.roleName ?? null, user.id ?? null);
      sessionState.value = 'restored';
      sessionError.value = null;
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e ?? '');
      if (message.includes(STUB_ERROR_MARK)) {
        sessionState.value = 'pending-api';
        sessionError.value = '接口待实现：@/api/user.fetchUserInfo';
        return false;
      }
      logout();
      sessionState.value = 'expired';
      sessionError.value = message || '会话已失效，请重新登录';
      return false;
    } finally {
      restoring.value = false;
    }
  }

  async function login(data: AuthRequest) {
    // 业务错误由响应拦截器统一提示，此处只需捕获并返回 false
    try {
      const res: AuthResponse = await loginApi(data);
      if (res.data) {
        persistToken(res.data, data.username);
        // 拿到 token 后立即补全会话档案（失败不影响登录跳转）
        void restoreSession();
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
        void restoreSession();
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
    realName.value = null;
    roleName.value = null;
    userId.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(REALNAME_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USERID_KEY);
    sessionState.value = 'idle';
    sessionError.value = null;
  }

  return {
    token,
    username,
    realName,
    roleName,
    roleLabel,
    userId,
    displayName,
    sessionState,
    sessionError,
    restoring,
    isAuthenticated,
    isStudent,
    isTeacher,
    isAdmin,
    persistToken,
    persistProfile,
    restoreSession,
    login,
    register,
    logout,
  };
});
