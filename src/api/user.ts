/**
 * 用户权限模块 API（后端 /api/user/*）
 * 负责人：【D 用户权限与运维】
 */
import axiosInstance from '@/api';
import type {
  AdminRegisterRequest,
  AdminUser,
  UserCreateRequest,
  UserPageData,
  UserQuery,
  UserRoleName,
} from '@/types/user';

/** 初始密码（重置密码时写入，后端加密存储） */
export const INIT_PASSWORD = 'Java@123456';

// ==================== 已对接 ====================

/** GET /api/user/records —— 分页查询用户列表（仅管理员） */
export async function fetchUsers(params: UserQuery): Promise<UserPageData> {
  const res = await axiosInstance.get('/api/user/records', { params });
  return (res.data ?? res) as UserPageData;
}

/** POST /api/user/create —— 新增用户（仅管理员）。注意：不含学号/班级等字段，需创建后 update 补全 */
export async function createUser(data: UserCreateRequest): Promise<AdminUser> {
  const res = await axiosInstance.post('/api/user/create', data);
  return (res.data ?? res) as AdminUser;
}

/** PUT /api/user/update —— 更新用户（仅管理员，username 不可改） */
export async function updateUser(data: Partial<AdminUser> & { id: number }): Promise<AdminUser> {
  const res = await axiosInstance.put('/api/user/update', data);
  return (res.data ?? res) as AdminUser;
}

/** DELETE /api/user/delete/{id} —— 逻辑删除用户 */
export async function deleteUser(id: number): Promise<string> {
  const res = await axiosInstance.delete(`/api/user/delete/${id}`);
  return String(res.data ?? res ?? '');
}

/** PUT /api/user/update（password 字段）—— 重置为初始密码，返回新密码 */
export async function resetPassword(id: number): Promise<string> {
  await axiosInstance.put('/api/user/update', { id, password: INIT_PASSWORD });
  return INIT_PASSWORD;
}

/** 角色码值转换（前端下拉标签 → 后端 roleName） */
export function toRoleName(role: string): UserRoleName {
  return role === 'TEACHER' || role === 'ADMIN' ? (role as UserRoleName) : 'STUDENT';
}

// ==================== 未实现 ====================

/**
 * GET /api/user/info —— 获取当前登录用户信息
 */
export async function fetchUserInfo(): Promise<AdminUser> {
  const res = await axiosInstance.get('/api/user/info');
  return (res.data ?? res) as AdminUser;
}

/**
 * POST /api/user/auth/admin/register —— 管理员注册（注册即登录，data 为 token 字符串）
 * 需要系统初始化密钥 app.admin.init-key（后端配置项，非请求头）。
 */
export async function adminRegister(data: AdminRegisterRequest): Promise<string> {
  const res = await axiosInstance.post('/api/user/auth/admin/register', data);
  return String(res.data ?? res ?? '');
}
