/**
 * 会话存储：localStorage 里跟登录态有关的键只在这里声明。
 * 鉴权凭证只有 token 一项，roles/userId 一律从 token 实时解码；
 * username/realName/role 只为界面回显（首屏不等接口），改名/删字段只动这里。
 */
export const TOKEN_KEY = 'auth_token';
export const USERNAME_KEY = 'auth_username';
export const REALNAME_KEY = 'auth_real_name';
/** 兜底角色：仅当 JWT 未带 roles 声明时使用 */
export const ROLE_KEY = 'auth_role_name';

/** 拦截器强制下线时要清干净的键 */
export const SESSION_KEYS = [TOKEN_KEY, USERNAME_KEY, REALNAME_KEY, ROLE_KEY] as const;

/** 清本地会话（不调后端）：拦截器与 store 共用，避免两份键清单漂移 */
export function clearSessionStorage(): void {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}
