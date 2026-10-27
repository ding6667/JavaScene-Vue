/**
 * 用户权限模块 API（后端 /api/user/*）
 * 负责人：【D 用户权限与运维】
 */
import axiosInstance from '@/api';
import type { LoginResult } from '@/types/auth';
import type {
  AdminRegisterRequest,
  AdminUserCreateRequest,
  AdminUserQuery,
  AdminUserUpdateRequest,
  BatchImportResult,
  PasswordChangeRequest,
  StudentInfoResponse,
  StudentInfoUpdateRequest,
  StudentListQuery,
  StudentPageData,
  TeacherInfoResponse,
  TeacherInfoUpdateRequest,
  UserDetailResponse,
  UserInfoResponse,
  UserInfoUpdateRequest,
  UserPageData,
} from '@/types/user';

/** 响应拦截器已剥到 { code, message, data }，这里统一取 data；无 data 的后端返回空串 */
const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

// ==================== 当前登录用户 ====================

/** GET /api/user/info —— 基础信息 + 按角色挂载的 extInfo */
export async function fetchUserInfo(): Promise<UserInfoResponse> {
  return unwrap<UserInfoResponse>(await axiosInstance.get('/api/user/info'));
}

/** PUT /api/user/info/update —— 仅 realName / email / phone / avatar 可改 */
export async function updateUserInfo(data: UserInfoUpdateRequest): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put('/api/user/info/update', data)) ?? '');
}

/**
 * PUT /api/user/password/change —— 本人改密。
 * 成功后旧 token 立即失效：调用方必须清会话并跳登录页，不能继续留在原页面。
 */
export async function changePassword(data: PasswordChangeRequest): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put('/api/user/password/change', data)) ?? '');
}

/** PUT /api/user/password/reset/{userId} —— 管理员重置，返回后端给的新初始密码（不在前端硬编码） */
export async function resetPassword(userId: number): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put(`/api/user/password/reset/${userId}`)) ?? '');
}

// ==================== 管理端用户 CRUD ====================

/** GET /api/user/admin/list —— 分页 + roleId/enabled/keyword/classId 筛选（筛选全在后端做） */
export async function fetchUsers(params: AdminUserQuery): Promise<UserPageData> {
  return unwrap<UserPageData>(await axiosInstance.get('/api/user/admin/list', { params }));
}

/** POST /api/user/admin/add —— 返回新 userId；学号/班级等扩展档案要建号后再补 */
export async function createUser(data: AdminUserCreateRequest): Promise<number> {
  return Number(unwrap<number>(await axiosInstance.post('/api/user/admin/add', data)));
}

/** GET /api/user/admin/detail/{userId} */
export async function fetchUserDetail(userId: number): Promise<UserDetailResponse> {
  return unwrap<UserDetailResponse>(await axiosInstance.get(`/api/user/admin/detail/${userId}`));
}

/** PUT /api/user/admin/{userId} —— userId 走路径，body 不带 username */
export async function updateUser(userId: number, data: AdminUserUpdateRequest): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put(`/api/user/admin/${userId}`, data)) ?? '');
}

/** DELETE /api/user/admin/delete/{userId} */
export async function deleteUser(userId: number): Promise<string> {
  return String(unwrap<string>(await axiosInstance.delete(`/api/user/admin/delete/${userId}`)) ?? '');
}

/** PUT /api/user/admin/toggle-status/{userId} —— 启停账号，后端拒绝作用于自己 */
export async function toggleUserStatus(userId: number): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put(`/api/user/admin/toggle-status/${userId}`)) ?? '');
}

/** POST /api/user/auth/admin/register —— 注册即登录，返回会话；adminKey 是后端配置项，不得对学生暴露 */
export async function adminRegister(data: AdminRegisterRequest): Promise<LoginResult> {
  return unwrap<LoginResult>(await axiosInstance.post('/api/user/auth/admin/register', data));
}

// ==================== 学生名册（TEACHER 只读，ADMIN 可写） ====================

/** GET /api/user/student/list —— 只含用户信息，学习进度不在本模块 */
export async function fetchStudents(params: StudentListQuery): Promise<StudentPageData> {
  return unwrap<StudentPageData>(await axiosInstance.get('/api/user/student/list', { params }));
}

/**
 * GET /api/user/student/export —— CSV 下载，筛选参数与 /list 完全一致（所见即所得）。
 * 用 blob 收，避免中文按文本解析乱码；后端若把错误包成 JSON，拦截器会识别成失败。
 */
export async function exportStudents(params: StudentListQuery): Promise<Blob> {
  const res = await axiosInstance.get('/api/user/student/export', { params, responseType: 'blob' });
  return (res instanceof Blob ? res : (res as { data: Blob }).data) as Blob;
}

/** GET /api/user/student/import-template —— 导入模板（txt）下载 */
export async function downloadStudentTemplate(): Promise<Blob> {
  const res = await axiosInstance.get('/api/user/student/import-template', { responseType: 'blob' });
  return (res instanceof Blob ? res : (res as { data: Blob }).data) as Blob;
}

/**
 * POST /api/user/student/batch-add?classId= —— multipart 上传，一行一名学生「学号,姓名[,初始密码]」。
 * 单条失败不回滚整批，失败清单在返回值的 failList 里原样给出。
 */
export async function batchAddStudents(classId: number, file: File): Promise<BatchImportResult> {
  const form = new FormData();
  form.append('file', file);
  return unwrap<BatchImportResult>(
    await axiosInstance.post('/api/user/student/batch-add', form, {
      params: { classId },
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
}

/** GET /api/user/student/info —— 学生扩展档案（权限 STUDENT） */
export async function fetchStudentInfo(): Promise<StudentInfoResponse> {
  return unwrap<StudentInfoResponse>(await axiosInstance.get('/api/user/student/info'));
}

/** PUT /api/user/student/info/update —— 仅 studentNo/major/college/enrollYear */
export async function updateStudentInfo(data: StudentInfoUpdateRequest): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put('/api/user/student/info/update', data)) ?? '');
}

// ==================== 教师扩展档案 ====================

/** GET /api/user/teacher/info —— 教师扩展档案（权限 TEACHER） */
export async function fetchTeacherInfo(): Promise<TeacherInfoResponse> {
  return unwrap<TeacherInfoResponse>(await axiosInstance.get('/api/user/teacher/info'));
}

/** PUT /api/user/teacher/info/update */
export async function updateTeacherInfo(data: TeacherInfoUpdateRequest): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put('/api/user/teacher/info/update', data)) ?? '');
}
