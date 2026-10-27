/**
 * 班级模块 DTO（后端 /api/class/*）
 * 文件负责人：【D 用户权限与运维】
 */

/** GET /api/class/list 列表项（courseName 由课程侧回填，无名称时为空） */
export interface ClassResponse {
  classId: number;
  className: string;
  grade: string;
  courseId: number;
  courseName: string;
  teacherId: number;
  teacherName: string;
  /** 冗余计数，名单以 /api/class/students 实时结果为准 */
  studentCount: number;
}

/** POST /api/class 与 PUT /api/class/{id} 请求体 */
export interface ClassSaveRequest {
  className: string;
  teacherId: number;
  grade: string;
  courseId: number;
}

/** 班级下的学生（GET /api/class/students） */
export interface ClassStudentItem {
  userId: number;
  studentNo: string;
  realName: string;
  classId: number;
  className: string;
  grade: string;
  enabled: number;
}
