/**
 * 会话存储：localStorage 里跟登录态有关的键只在这里声明。
 * 鉴权凭证只有 token 一项；roles/userId 优先从 token 实时解码，
 * 这里的 auth_roles、auth_user_id 只是「token 未带这些声明时」的回显兜底，
 * 不作为权限依据 —— 真正的判定在后端（验签 + @PreAuthorize）。
 */
export const TOKEN_KEY = 'auth_token';
export const USERNAME_KEY = 'auth_username';
export const REALNAME_KEY = 'auth_real_name';
/** 登录接口下发的角色列表，逗号分隔（仅当 JWT 无 roles 声明时用于界面与跳转） */
export const ROLES_KEY = 'auth_roles';
/** 登录接口下发的用户 ID（界面展示与操作人标识用，非鉴权依据） */
export const USERID_KEY = 'auth_user_id';

/** 拦截器强制下线时要清干净的键 */
export const SESSION_KEYS = [TOKEN_KEY, USERNAME_KEY, REALNAME_KEY, ROLES_KEY, USERID_KEY] as const;

/** 清本地会话（不调后端）：拦截器与 store 共用，避免两份键清单漂移 */
export function clearSessionStorage(): void {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}
