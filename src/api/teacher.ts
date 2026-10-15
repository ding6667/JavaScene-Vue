/**
 * 教师端智能教学 API 层
 * 只保留后端已提供的接口：班级列表、AI 备课、作业发布与列表、班级学情汇总。
 */
import axiosInstance from '@/api';
import type {
  ClassStats,
  HomeworkPublishRequest,
  PublishedHomework,
  TeachPrepareRequest,
  TeachPrepareResult,
} from '@/types/teacher';

// ---------- GET /api/class/records ----------

/** 教师所辖班级（后端 ClassResponse 仅含班级基础字段） */
export interface TeacherClass {
  id: number;
  className: string;
}

/** 班级列表（分页取全量，后端无"按教师过滤"参数） */
export async function fetchTeacherClasses(): Promise<TeacherClass[]> {
  const res = await axiosInstance.get('/api/class/records', {
    params: { pageNum: 1, pageSize: 100, isAsc: false },
  });
  const page = (res.data ?? res) as { records?: { id: number; className: string }[] };
  return (page.records ?? []).map((c) => ({ id: c.id, className: c.className }));
}

// ---------- POST /api/agent/teach/prepare ----------

/** 备课材料生成（教案/PPT/重难点/课后习题/上机实训） */
export async function generateTeachPrepare(data: TeachPrepareRequest): Promise<TeachPrepareResult> {
  const res = await axiosInstance.post('/api/agent/teach/prepare', data);
  return (res.data ?? res) as TeachPrepareResult;
}

// ---------- POST /api/teach/homework/publish ----------

/** 发布作业，返回后端作业 ID */
export async function publishHomework(data: HomeworkPublishRequest): Promise<number> {
  const res = await axiosInstance.post('/api/teach/homework/publish', data);
  return Number(res.data ?? res ?? 0);
}

// ---------- GET /api/teach/homework/list ----------

/** 教师查询自己发布的作业列表 */
export async function fetchPublishedHomeworks(): Promise<PublishedHomework[]> {
  const res = await axiosInstance.get('/api/teach/homework/list');
  return (res.data ?? res ?? []) as PublishedHomework[];
}

// ---------- GET /api/teach/class/stats ----------

/** 班级学情：总人数 + 平均学习进度 */
export async function fetchClassStats(classId: number): Promise<ClassStats> {
  const res = await axiosInstance.get('/api/teach/class/stats', { params: { classId } });
  return (res.data ?? res ?? {}) as ClassStats;
}
