// ==================== 认证相关类型 ====================

/** 登录/注册请求体 */
export interface AuthRequest {
  username: string;
  password: string;
}

/** 后端统一响应格式：code / message / data
 *  登录与注册接口中 data 为 token 字符串 */
export interface AuthResponse {
  code: number;
  message: string;
  data: string;
}

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
