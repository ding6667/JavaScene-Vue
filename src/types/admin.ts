/**
 * 运维端类型定义（字段以 openapi.json 的用户模块为准）
 * 监控、日志审计、数据备份、系统参数、知识库维护在后端暂无接口，页面仅保留 UI。
 */

// ==================== 用户管理 ====================

/** 后端 roleName 取值 */
export type UserRoleName = 'STUDENT' | 'TEACHER' | 'ADMIN';

/** 用户信息响应（不含密码等敏感字段） */
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

/** GET /api/user/records 查询参数 */
export interface UserQuery {
  pageNum: number;
  pageSize: number;
  /** 用户名/姓名模糊查询 */
  keyword?: string;
}

/** GET /api/user/records 分页数据 */
export interface UserPageData {
  records: AdminUser[];
  total: number;
  current: number;
  size: number;
}

/** POST /api/user/create 请求体 */
export interface UserCreateRequest {
  username: string;
  /** 明文提交，由服务端加密存储 */
  password: string;
  realName: string;
  email?: string;
  phone?: string;
  roleName: UserRoleName;
}

/** PUT /api/user/update 请求体（后端不支持修改 username） */
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
