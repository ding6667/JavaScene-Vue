/**
 * 用户权限模块 DTO（后端 /api/user/*）
 * 文件负责人：【D 用户权限与运维】
 */

import type { PageResponse } from './index';

/** 后端 roleName 取值 */
export type UserRoleName = 'STUDENT' | 'TEACHER' | 'ADMIN';

/** 角色码值 → 中文标签（后端只给码值） */
export const ROLE_LABELS: Record<UserRoleName, string> = {
  STUDENT: '学生',
  TEACHER: '教师',
  ADMIN: '管理员',
};

/** 用户信息响应（不含密码等敏感字段，已对接 / 待接 /user/info 同结构） */
export interface AdminUser {
  id: number;
  username: string;
  realName: string;
  email: string;
  phone: string;
  /** 学号（学生） */
  studentNo: string;
  /** 班级名（学生） */
  className: string;
  /** 专业（学生） */
  major: string;
  /** 职称（教师） */
  title: string;
  roleId: string;
  roleName: UserRoleName;
  /** 是否启用：1=启用 0=禁用 */
  enabled: number;
  createTime: string;
}

/** GET /api/user/records 查询参数（已对接；后端暂无角色筛选参数，需前端分页过滤） */
export interface UserQuery {
  pageNum: number;
  pageSize: number;
  /** 用户名/姓名模糊查询 */
  keyword?: string;
}

/** GET /api/user/records 分页数据（已对接） */
export type UserPageData = PageResponse<AdminUser>;

/** POST /api/user/create 请求体（已对接；不含 studentNo/className 等，需创建后再 update 补全） */
export interface UserCreateRequest {
  username: string;
  /** 明文提交，由服务端加密存储 */
  password: string;
  realName: string;
  email?: string;
  phone?: string;
  roleName: UserRoleName;
}

/** PUT /api/user/update 请求体（已对接，username 不可改） */
export interface UserUpdateRequest {
  id: number;
  realName?: string;
  email?: string;
  phone?: string;
  studentNo?: string;
  className?: string;
  major?: string;
  title?: string;
  roleName?: UserRoleName;
  enabled?: number;
  /** 传入即重置密码 */
  password?: string;
}

/**
 * POST /api/user/auth/admin/register 请求体 —— TODO 待接
 * 需系统初始化密钥 app.admin.init-key，注册即登录，响应 data 为 token 字符串。
 */
export interface AdminRegisterRequest {
  username: string;
  password: string;
  adminKey: string;
}
