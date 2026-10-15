import axiosInstance from './index';
import type { AuthRequest, AuthResponse } from '@/types/auth';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 登录 ====================
// 后端接口：POST /api/user/auth/login（学生端登录）
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
