/**
 * JWT 前端解码（只读，不验签）
 *
 * 安全边界始终在后端（验签 + @PreAuthorize）。这里解码仅用于 UI 判断与路由守卫，
 * 目的是让「角色」不落在 localStorage 里 —— 学生改不到一个叫 roles 的键，
 * 想改只能改 token，而 token 一改签名就废，后端直接 401。
 */

/** token 第二段解出来的声明集合 */
export interface JwtPayload {
  exp?: number;
  iat?: number;
  userId?: number | string;
  username?: string;
  roles?: string[] | string;
  authorities?: string[] | string;
  [key: string]: unknown;
}

export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    // 非标准 JWT 或字段被改坏
    return null;
  }
}

/** 取角色数组，统一去掉 ROLE_ / ROLE_ 前缀，与后端 hasRole('STUDENT') 的裸角色对齐 */
export function getRolesFromToken(token: string | null | undefined): string[] {
  const payload = decodeJwt(token);
  if (!payload) return [];
  const raw = payload.roles ?? payload.authorities ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((r) => String(r).replace(/^ROLE_/, ''))
    .filter(Boolean)
    // 去重，避免后端同时给了 roles 和 authorities 时重复计数
    .filter((r, i, arr) => arr.indexOf(r) === i);
}

/** exp 为秒级时间戳；无 exp 视为已过期（不是标准登录态就别放行） */
export function isTokenExpired(token: string | null | undefined): boolean {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return true;
  return Number(payload.exp) * 1000 <= Date.now();
}
