// ==================== 认证相关类型 ====================

import type { ApiResponse } from './index';
import type { UserRoleName } from './user';

/** 登录/注册请求体 */
export interface AuthRequest {
  username: string;
  password: string;
}

/**
 * POST /api/user/auth/login | /register | /admin/register 的 data
 * roles 为裸角色码值数组（STUDENT/TEACHER/ADMIN），一个账号可挂多个；
 * defaultRoute 由后端 RouteResolver 按角色算出，前端优先按它跳转。
 */
export interface LoginResult {
  token: string;
  userId: number;
  username: string;
  roles: UserRoleName[];
  defaultRoute: string;
}

/** 统一响应格式：登录类接口 data 为 LoginResult */
export type AuthResponse = ApiResponse<LoginResult>;

/** 认证模式 */
export type AuthMode = 'login' | 'register';

// ==================== 登出 ====================

/** POST /api/user/auth/logout 请求体 */
export interface LogoutRequest {
  /** true = 吊销该用户全部设备会话；false = 只吊销当前 token */
  allDevices: boolean;
}

/** POST /api/user/auth/logout 响应：data 为后端回执，前端只用作日志 */
export interface LogoutResponse {
  code: number;
  message: string;
  data?: unknown;
}
