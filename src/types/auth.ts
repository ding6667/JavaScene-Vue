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
