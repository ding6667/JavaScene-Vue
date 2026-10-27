/**
 * 班级模块 API（后端 /api/class/*）
 * 负责人：【D 用户权限与运维】
 */
import axiosInstance from '@/api';
import type { ClassResponse, ClassSaveRequest, ClassStudentItem } from '@/types/class';
import type { UserListResponse } from '@/types/user';
import { ROLE_IDS } from '@/types/user';

/** 响应拦截器已剥到 { code, message, data } */
const unwrap = <T,>(res: unknown): T => ((res as { data?: T })?.data ?? res) as T;

/** GET /api/class/list?courseId= —— 班级列表，courseId 不传即全部（已按登录者数据权限裁剪） */
export async function fetchClasses(courseId?: number): Promise<ClassResponse[]> {
  const data = unwrap<ClassResponse[]>(
    await axiosInstance.get('/api/class/list', { params: courseId ? { courseId } : {} }),
  );
  return Array.isArray(data) ? data : [];
}

/** GET /api/class/students?classId= —— 班级学生名单（带数据权限） */
export async function fetchClassStudents(classId: number): Promise<ClassStudentItem[]> {
  const data = unwrap<ClassStudentItem[]>(
    await axiosInstance.get('/api/class/students', { params: { classId } }),
  );
  return Array.isArray(data) ? data : [];
}

/** POST /api/class —— 新建班级，返回班级 id */
export async function createClass(data: ClassSaveRequest): Promise<number> {
  return Number(unwrap<number>(await axiosInstance.post('/api/class', data)));
}

/** PUT /api/class/{id} —— 改班级（班级名/任课教师/年级/课程） */
export async function updateClass(id: number, data: ClassSaveRequest): Promise<string> {
  return String(unwrap<string>(await axiosInstance.put(`/api/class/${id}`, data)) ?? '');
}

/** DELETE /api/class/{id} */
export async function deleteClass(id: number): Promise<string> {
  return String(unwrap<string>(await axiosInstance.delete(`/api/class/${id}`)) ?? '');
}

/**
 * 教师下拉数据源：后端没有专门的「教师简表」接口，只能借 GET /api/user/admin/list
 * 取 roleId=2（教师）的一页。权限是 ADMIN，教师端拿不到时会返回 403 并由拦截器提示。
 */
export async function fetchTeacherOptions(keyword = ''): Promise<UserListResponse[]> {
  const page = unwrap<{ records?: UserListResponse[] }>(
    await axiosInstance.get('/api/user/admin/list', {
      params: { roleId: ROLE_IDS.TEACHER, enabled: 1, pageSize: 200, pageNum: 1, keyword },
    }),
  );
  return page?.records ?? [];
}
