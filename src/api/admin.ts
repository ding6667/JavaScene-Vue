/**
 * 运维端 API 层
 * 后端目前仅开放用户模块（/api/user/*），监控 / 日志 / 备份 / 系统参数均无接口，
 * 对应页面只保留 UI，此处不再提供伪造请求。
 */
import axiosInstance from '@/api';
import type {
  AdminUser,
  UserCreateRequest,
  UserPageData,
  UserQuery,
  UserRoleName,
} from '@/types/admin';

/** 初始密码（重置密码时写入，后端 BCrypt 加密存储） */
export const INIT_PASSWORD = 'Java@123456';

/** GET /api/user/records —— 分页查询用户列表（仅管理员） */
export async function fetchUsers(params: UserQuery): Promise<UserPageData> {
  const res = await axiosInstance.get('/api/user/records', { params });
  return (res.data ?? res) as UserPageData;
}

/** POST /api/user/create —— 新增用户（仅管理员） */
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

/** PUT /api/user/update（password 字段）—— 重置为初始密码 */
export async function resetPassword(id: number): Promise<string> {
  await axiosInstance.put('/api/user/update', { id, password: INIT_PASSWORD });
  return INIT_PASSWORD;
}

/** 角色取值转换（前端下拉标签 → 后端 roleName 码值） */
export function toRoleName(role: string): UserRoleName {
  return role === 'TEACHER' || role === 'ADMIN' ? role : 'STUDENT';
}
