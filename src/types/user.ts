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

/** 后端 roleId 码值表：1=学生，2=教师，3=管理员（列表筛选、新增用户都用它，不传 roleName） */
export const ROLE_IDS: Record<UserRoleName, number> = {
  STUDENT: 1,
  TEACHER: 2,
  ADMIN: 3,
};

/** roleId → 角色名；认不出返回 null（列表行仍可用后端回的 roleName 显示） */
export function roleCodeOf(roleId?: number | null): UserRoleName | null {
  const entry = (Object.entries(ROLE_IDS) as [UserRoleName, number][]).find(([, id]) => id === roleId);
  return entry ? entry[0] : null;
}

// ==================== 当前登录用户 ====================

/** 学生扩展档案（GET /api/user/student/info、/user/info 的 extInfo） */
export interface StudentInfoResponse {
  userId: number;
  studentNo: string;
  classId: number;
  className: string;
  grade: string;
  major: string;
  college: string;
  enrollYear: number;
  /** 后端算出的应届年份，只读 */
  graduationYear: number;
}

/** 教师扩展档案（GET /api/user/teacher/info、/user/info 的 extInfo） */
export interface TeacherInfoResponse {
  userId: number;
  teacherNo: string;
  title: string;
  college: string;
  department: string;
  office: string;
  researchArea: string;
}

/**
 * GET /api/user/info —— 基础信息 + 按角色挂载的扩展信息。
 * extInfo 缺扩展记录时是该角色的空对象而非 null，取值时不必判空分支。
 */
export interface UserInfoResponse {
  userId: number;
  username: string;
  realName: string;
  email: string;
  phone: string;
  avatar: string;
  roleId: number;
  roleName: UserRoleName;
  roleDesc: string;
  /** 1=启用 0=禁用 */
  enabled: number;
  lastLoginTime: string;
  extInfo: Partial<StudentInfoResponse & TeacherInfoResponse>;
}

/** PUT /api/user/info/update 请求体 —— 只允许这四个字段，其余一律不接收 */
export interface UserInfoUpdateRequest {
  realName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

/** PUT /api/user/student/info/update 请求体（学号可改，班级/入学年走管理端） */
export interface StudentInfoUpdateRequest {
  studentNo?: string;
  major?: string;
  college?: string;
  enrollYear?: number;
}

/** PUT /api/user/teacher/info/update 请求体 */
export interface TeacherInfoUpdateRequest {
  teacherNo?: string;
  title?: string;
  college?: string;
  department?: string;
  office?: string;
  researchArea?: string;
}

/** PUT /api/user/password/change 请求体。成功即旧 token 失效，前端必须清会话回登录页 */
export interface PasswordChangeRequest {
  oldPassword: string;
  newPassword: string;
}

// ==================== 管理端用户 CRUD ====================

/** 用户列表项（GET /api/user/admin/list） */
export interface UserListResponse {
  userId: number;
  username: string;
  realName: string;
  phone: string;
  email: string;
  roleId: number;
  roleName: UserRoleName;
  roleDesc: string;
  /** 1=启用 0=禁用 */
  enabled: number;
  /** 学生=学号，教师=工号，管理员为空 */
  userNo: string;
  className: string;
  lastLoginTime: string;
  createTime: string;
}

/** GET /api/user/admin/list 查询参数 */
export interface AdminUserQuery {
  pageNum: number;
  pageSize: number;
  /** 1=学生 2=教师 3=管理员 */
  roleId?: number;
  /** 0=禁用 1=启用 */
  enabled?: number;
  /** 用户名/姓名/学号工号模糊查询 */
  keyword?: string;
  classId?: number;
}

export type UserPageData = PageResponse<UserListResponse>;

/** GET /api/user/admin/detail/{userId} */
export interface UserDetailResponse {
  userId: number;
  username: string;
  realName: string;
  email: string;
  phone: string;
  avatar: string;
  roleId: number;
  roleName: UserRoleName;
  enabled: number;
  extInfo: Partial<StudentInfoResponse & TeacherInfoResponse>;
}

/** POST /api/user/admin/add 请求体（返回新 userId；学号/班级等扩展档案不在这里，建号后再补） */
export interface AdminUserCreateRequest {
  username: string;
  /** 明文提交，后端加密存储 */
  password: string;
  realName: string;
  email?: string;
  phone?: string;
  roleId: number;
  /** 不传默认启用 */
  enabled?: number;
}

/** PUT /api/user/admin/{userId} 请求体（userId 在路径上，body 不再带；username 不可改） */
export interface AdminUserUpdateRequest {
  realName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  roleId?: number;
  enabled?: number;
}

/** POST /api/user/auth/admin/register 请求体：需系统初始化密钥 app.admin.init-key（后端配置项） */
export interface AdminRegisterRequest {
  username: string;
  password: string;
  adminKey: string;
}

// ==================== 学生名册（TEACHER 只读，ADMIN 可写） ====================

/** 学生列表项（GET /api/user/student/list）：仅用户信息，学习进度不在本模块 */
export interface StudentListItem {
  userId: number;
  studentNo: string;
  realName: string;
  classId: number;
  className: string;
  grade: string;
  enabled: number;
}

/** GET /api/user/student/list 与 /export 共用查询参数（导出与列表可见范围完全一致） */
export interface StudentListQuery {
  classId?: number;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
}

export type StudentPageData = PageResponse<StudentListItem>;

/** 批量导入的单条失败项（原样返回，不回滚整批） */
export interface BatchImportFailItem {
  line: number;
  studentNo: string;
  realName: string;
  reason: string;
}

/** POST /api/user/student/batch-add 结果：multipart 上传，一行一名学生「学号,姓名[,初始密码]」 */
export interface BatchImportResult {
  total: number;
  successNum: number;
  failNum: number;
  failList: BatchImportFailItem[];
}
