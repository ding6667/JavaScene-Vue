import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { login as loginApi, logout as logoutApi, register as registerApi } from '@/api/auth';
import { defaultSettings } from '@/api/settings';
import { fetchUserInfo } from '@/api/user';
import { clearSessionStorage, REALNAME_KEY, ROLES_KEY, TOKEN_KEY, USERID_KEY, USERNAME_KEY } from '@/utils/session';
import { decodeJwt, getRolesFromToken, isTokenExpired } from '@/utils/jwt';
import type { JwtPayload } from '@/utils/jwt';
import type { AuthRequest, AuthResponse, LoginResult } from '@/types/auth';
import type { UserRoleName } from '@/types/user';
import { ROLE_LABELS } from '@/types/user';

export type SessionRestoreState = 'idle' | 'restored' | 'expired';

/** 角色 → 该角色的默认落地页，与后端 RouteResolver 保持一致 */
export const ROLE_HOME: Record<UserRoleName, string> = {
  ADMIN: '/admin/dashboard',
  TEACHER: '/teach/prepare',
  STUDENT: '/student/dashboard',
};

/** 多角色时的优先级：权限高的端在前 */
export const ROLE_PRIORITY: UserRoleName[] = ['ADMIN', 'TEACHER', 'STUDENT'];

const isRoleName = (v: unknown): v is UserRoleName => v === 'ADMIN' || v === 'TEACHER' || v === 'STUDENT';

/** 兜底角色列表：登录接口下发的 roles[]，逗号存 localStorage */
function readStoredRoles(): UserRoleName[] {
  return (localStorage.getItem(ROLES_KEY) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isRoleName);
}

/**
 * 登录响应 / 档案接口的角色可能带 ROLE_ 前缀，或干脆是逗号串。
 * 统一成裸角色（TEACHER 等），否则会被 isRoleName 过滤成空集合，
 * 导致登录后算不出该进哪个端。
 */
function normalizeRoles(value: unknown): UserRoleName[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return list
    .map((r) => String(r).trim().replace(/^ROLE_/i, ''))
    .filter(isRoleName);
}

function readStoredUserId(): number | null {
  const n = Number(localStorage.getItem(USERID_KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 登录态与当前用户档案。
 *
 * 唯一持久化的凭证是 token：roles 与 userId 一律从 token 实时解码，
 * localStorage 里没有 roles 键可改，改 token 则签名作废、后端直接 401。
 * 401（会话失效）与 403（越权）的提示、登出、跳转统一由 api/index.ts 拦截器负责，
 * 本 store 不自行清 token，免得把「后端重启 / 网络抖动」误判成会话失效。
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const username = ref<string | null>(localStorage.getItem(USERNAME_KEY));
  const realName = ref<string | null>(localStorage.getItem(REALNAME_KEY));
  /** 登录接口/档案接口给的兜底值：仅在 token 不带对应声明时参与界面显示与跳转判定 */
  const cachedRoles = ref<UserRoleName[]>(readStoredRoles());
  const cachedUserId = ref<number | null>(readStoredUserId());

  const sessionState = ref<SessionRestoreState>('idle');
  /** 会话恢复失败原因 */
  const sessionError = ref<string | null>(null);
  const restoring = ref(false);

  const payload = computed<JwtPayload | null>(() => decodeJwt(token.value));

  /** token 自带的角色声明；存在时忽略一切缓存值 */
  const tokenRoles = computed<UserRoleName[]>(() => getRolesFromToken(token.value).filter(isRoleName));

  /** 鉴权用的角色集合 */
  const roles = computed<UserRoleName[]>(() => (tokenRoles.value.length ? tokenRoles.value : cachedRoles.value));

  /** 主角色（按优先级取第一个），用于文案与图标 */
  const roleName = computed<UserRoleName | null>(() => {
    for (const r of ROLE_PRIORITY) if (roles.value.includes(r)) return r;
    return roles.value[0] ?? null;
  });

  const roleLabel = computed(() => (roleName.value ? ROLE_LABELS[roleName.value] : '未知角色'));
  const userId = computed<number | null>(() => {
    const raw = payload.value?.userId ?? payload.value?.sub;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : cachedUserId.value;
  });

  const isAuthenticated = computed(() => !!token.value && !isTokenExpired(token.value));
  /** 账号挂了多个角色：登录成功后要先选端 */
  const hasMultipleRoles = computed(() => roles.value.length > 1);
  /** 该账号可进入的端，选端页据此渲染卡片 */
  const portals = computed<UserRoleName[]>(() => ROLE_PRIORITY.filter((r) => roles.value.includes(r)));
  const displayName = computed(() => realName.value || username.value || payload.value?.username || '未登录');

  const isStudent = computed(() => roles.value.includes('STUDENT'));
  const isTeacher = computed(() => roles.value.includes('TEACHER'));
  const isAdmin = computed(() => roles.value.includes('ADMIN'));

  /** 按角色算默认首页；token 里读不到角色时先去选端页，此时三张卡片都可点 */
  function resolveHome(list: UserRoleName[] = roles.value): string {
    for (const r of ROLE_PRIORITY) if (list.includes(r)) return ROLE_HOME[r];
    return list.length ? '/403' : '/choose-portal';
  }

  function setToken(t: string) {
    token.value = t;
    localStorage.setItem(TOKEN_KEY, t);
  }

  /** 写档案（只有显示用字段落盘；token 自带声明时以 token 为准） */
  function cacheProfile(profile: {
    username?: string | null;
    realName?: string | null;
    roles?: UserRoleName[] | null;
    userId?: number | null;
  }) {
    if (profile.username) {
      username.value = profile.username;
      localStorage.setItem(USERNAME_KEY, profile.username);
    }
    if (profile.realName) {
      realName.value = profile.realName;
      localStorage.setItem(REALNAME_KEY, profile.realName);
    }
    const roles2 = normalizeRoles(profile.roles);
    if (roles2.length) {
      cachedRoles.value = roles2;
      localStorage.setItem(ROLES_KEY, roles2.join(','));
    }
    if (profile.userId) {
      cachedUserId.value = profile.userId;
      localStorage.setItem(USERID_KEY, String(profile.userId));
    }
  }

  /**
   * 登录 / 注册 / 管理员注册成功后写入会话。
   * token 是唯一凭证；userId 与 roles 只作为「JWT 未带声明时」的兜底缓存。
   */
  function applySession(result: LoginResult) {
    setToken(result.token);
    // 新会话没带角色时，先清掉上一个账号遗留的角色缓存，避免把学生角色带进教师会话
    if (!result.roles?.length) {
      cachedRoles.value = [];
      localStorage.removeItem(ROLES_KEY);
    }
    cacheProfile({
      username: result.username,
      roles: result.roles,
      userId: result.userId,
    });
  }

  /**
   * 用 GET /api/user/info 校验会话并补档案（realName/userId/roleName）。
   * 失败只记状态、不清 token；真失效由后端 401 触发拦截器登出。
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
      cacheProfile({
        username: user.username || username.value,
        realName: user.realName ?? null,
        // /user/info 只回当前主角色，不能把登录接口给的完整角色集合降级成单个
        roles: cachedRoles.value.length ? null : user.roleName ? [user.roleName] : null,
        userId: user.userId ?? null,
      });
      sessionState.value = 'restored';
      sessionError.value = null;
      return true;
    } catch (e: unknown) {
      sessionState.value = 'expired';
      sessionError.value = e instanceof Error ? e.message : String(e ?? '') || '会话校验失败';
      return false;
    } finally {
      restoring.value = false;
    }
  }

  /** 成功返回后端给的会话（含 defaultRoute，登录页要靠它决定跳哪），失败返回 null */
  async function login(data: AuthRequest): Promise<LoginResult | null> {
    // 业务错误由响应拦截器统一提示，此处只负责写入会话
    try {
      const res: AuthResponse = await loginApi(data);
      if (!res?.data?.token) return null;
      applySession(res.data);
      // 登录页要靠角色决定跳哪个端，所以这里必须等档案回来再返回
      await restoreSession();
      return res.data;
    } catch {
      return null;
    }
  }

  async function register(data: AuthRequest): Promise<LoginResult | null> {
    try {
      const res: AuthResponse = await registerApi(data);
      // 注册即登录；新用户顺带初始化默认常规设置（失败不影响注册结果）
      if (!res?.data?.token) return null;
      applySession(res.data);
      try {
        await defaultSettings();
      } catch {
        // 忽略初始化失败
      }
      await restoreSession();
      return res.data;
    } catch {
      return null;
    }
  }

  /**
   * 只清本地会话，不打后端。
   * 命名成 clearAuth 就是为了提醒：真正的「登出」= 调后端吊销 + clearAuth，
   * token 已经废掉的场景（401 拦截、守卫清过期 token）才只调这里。
   */
  function clearAuth() {
    token.value = null;
    username.value = null;
    realName.value = null;
    cachedRoles.value = [];
    cachedUserId.value = null;
    clearSessionStorage();
    sessionState.value = 'idle';
    sessionError.value = null;
  }

  /**
   * 完整登出：先让后端把 token 拉黑（Redis 黑名单），无论成败都清本地并返回。
   * 契约是「用户永远能登出」，所以后端 500（Redis 挂了）也只影响旧 token 的剩余有效期，
   * 这种情况要让调用方给出提示，不能静默。
   */
  async function signOut(opts: { allDevices?: boolean } = {}): Promise<'revoked' | 'server-failed'> {
    // 请求拦截器要带上待吊销的 token，所以必须等接口发出去再清本地
    try {
      await logoutApi({ allDevices: !!opts.allDevices });
      clearAuth();
      return 'revoked';
    } catch (e: unknown) {
      clearAuth();
      // 401/403：token 本来就已失效，没什么可拉黑的，视同登出成功
      const status = (e as { response?: { status?: number } })?.response?.status;
      return status === 401 || status === 403 ? 'revoked' : 'server-failed';
    }
  }

  return {
    token,
    username,
    realName,
    payload,
    roles,
    roleName,
    roleLabel,
    userId,
    portals,
    hasMultipleRoles,
    displayName,
    isAuthenticated,
    isStudent,
    isTeacher,
    isAdmin,
    sessionState,
    sessionError,
    restoring,
    setToken,
    applySession,
    cacheProfile,
    resolveHome,
    restoreSession,
    login,
    register,
    clearAuth,
    signOut,
  };
});
