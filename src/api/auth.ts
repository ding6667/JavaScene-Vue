import axiosInstance from './index';
import type { AuthRequest, AuthResponse, LogoutRequest, LogoutResponse } from '@/types/auth';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 登录 ====================
// 后端接口：POST /api/user/auth/login（三端共用同一个登录入口，角色由 token 携带）
// 请求体：{ username, password }
// 响应：{ code, message, data } 其中 data 为 token 字符串
export async function login(data: AuthRequest): Promise<AuthResponse> {
  return (await axiosInstance.post<AuthResponse>('/api/user/auth/login', data)) as unknown as AuthResponse;
}

// ==================== 注册 ====================
// 后端接口：POST /api/user/auth/register（学生端注册，成功即返回 token，无需再登录）
// 请求体：{ username, password }
export async function register(data: AuthRequest): Promise<AuthResponse> {
  return (await axiosInstance.post<AuthResponse>('/api/user/auth/register', data)) as unknown as AuthResponse;
}

// ==================== 登出 ====================
// 后端接口：POST /api/user/auth/logout —— 把当前 token 的 jti 写进 Redis 黑名单（TTL = token 剩余有效期）
// 请求体：{ allDevices }  true = 吊销该用户全部会话，false = 只吊销当前这一台
// 语义：幂等 —— 重复调用、token 已失效都返回 200；Redis 挂掉返回 500（此时旧 token 到 exp 前仍可用）
// 注意：调用方必须在清本地 token 之后再 await 结果也行，但请求头要带上待吊销的 token，所以先调本接口、后清会话
export async function logout(data: LogoutRequest = { allDevices: false }): Promise<LogoutResponse> {
  return (await axiosInstance.post<LogoutResponse>('/api/user/auth/logout', {
    allDevices: !!data.allDevices,
  })) as unknown as LogoutResponse;
}
