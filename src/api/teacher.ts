/**
 * teach 模块 API 层
 * 负责人：【C 教师教学】
 * 覆盖：备课材料生成、作业发布/列表/关闭/详情、班级学情汇总、PPT 主题与模板、备课记录与导出下载。
 * 说明：POST /api/agent/teach/prepare 虽在 /api/agent 前缀下，但属于备课需求，按模块归属并入 teach。
 */
import axiosInstance from '@/api';
import type {
  ClassStats,
  HomeworkCloseRequest,
  HomeworkDetail,
  HomeworkPublishRequest,
  PrepareRecordDetail,
  PrepareRecordPage,
  PrepareRecordQuery,
  PptTemplate,
  PptTemplateDetail,
  PptTemplateSaveRequest,
  PptTheme,
  PublishedHomework,
  TeachPrepareRequest,
  TeachPrepareResult,
} from '@/types/teacher';

// ---------- GET /api/class/records ----------

/**
 * 教师所辖班级（后端 ClassResponse 仅含基础字段）
 * 注意：`/api/class/records` 不在本次给出的 7 份模块文档内（班级管理页已随 class 模块下线），
 * 但作业发布接口的 classId 与班级学情的 classId 都依赖它，联调时需确认该接口是否仍可用。
 */
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

// ---------- POST /api/agent/teach/prepare（备课，归 teach 模块） ----------

/**
 * 备课材料生成（教案/PPT/重难点/课后习题/上机实训）
 * 开关字段是字符串 '1'/'0'；返回五类材料的 Markdown、PPT 路径与备课记录 ID。
 */
export async function generateTeachPrepare(
  data: TeachPrepareRequest,
): Promise<TeachPrepareResult> {
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

// ---------- 作业关闭与详情 ----------

/** POST /api/teach/homework/close —— 截止收题，返回后端提示语 */
export async function closeHomework(data: HomeworkCloseRequest): Promise<string> {
  const res = await axiosInstance.post('/api/teach/homework/close', data);
  return String(res.data ?? res ?? '');
}

/** GET /api/teach/homework/detail?homeworkId —— 作业详情（含题目完整快照），非本人作业后端拒绝访问 */
export async function fetchHomeworkDetail(homeworkId: number): Promise<HomeworkDetail> {
  const res = await axiosInstance.get('/api/teach/homework/detail', { params: { homeworkId } });
  return (res.data ?? res) as HomeworkDetail;
}

// ---------- PPT 模板与主题 ----------

/** GET /api/teach/ppt/template —— 4 套预置外观主题（后端常量返回，不查库） */
export async function fetchPptThemes(): Promise<PptTheme[]> {
  const res = await axiosInstance.get('/api/teach/ppt/template');
  return (res.data ?? res ?? []) as PptTheme[];
}

/** GET /api/teach/ppt/template/list —— 系统模板 + 本人自定义模板，按 sortOrder 升序 */
export async function fetchPptTemplates(): Promise<PptTemplate[]> {
  const res = await axiosInstance.get('/api/teach/ppt/template/list');
  return (res.data ?? res ?? []) as PptTemplate[];
}

/** GET /api/teach/ppt/template/detail/{id} —— 模板详情（含 structure_md 骨架全文） */
export async function fetchPptTemplateDetail(id: number): Promise<PptTemplateDetail> {
  const res = await axiosInstance.get(`/api/teach/ppt/template/detail/${id}`);
  return (res.data ?? res) as PptTemplateDetail;
}

/** POST /api/teach/ppt/template/save —— id 为空新增，非空改本人模板，返回模板 ID */
export async function savePptTemplate(data: PptTemplateSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/teach/ppt/template/save', data);
  return Number(res.data ?? res ?? 0);
}

// ---------- 备课记录 ----------

/** GET /api/teach/prepare/record/list —— 本人成功备课记录分页 */
export async function fetchPrepareRecords(params: PrepareRecordQuery): Promise<PrepareRecordPage> {
  const res = await axiosInstance.get('/api/teach/prepare/record/list', { params });
  return (res.data ?? res) as PrepareRecordPage;
}

/** GET /api/teach/prepare/record/detail?id= —— 五类材料全文 */
export async function fetchPrepareRecordDetail(id: number): Promise<PrepareRecordDetail> {
  const res = await axiosInstance.get('/api/teach/prepare/record/detail', { params: { id } });
  return (res.data ?? res) as PrepareRecordDetail;
}

/**
 * GET /api/teach/prepare/record/export?recordId= —— 教案导出 Word 文件流（.docx）
 * Blob 响应由拦截器原样返回，调用方负责 createObjectURL 与下载
 */
export async function exportLessonPlan(recordId: number): Promise<Blob> {
  return (await axiosInstance.get('/api/teach/prepare/record/export', {
    params: { recordId },
    responseType: 'blob',
  })) as unknown as Blob;
}

/** GET /api/teach/ppt/download?recordId= —— 下载本人备课生成的 PPT（成功后后端自增下载计数） */
export async function downloadPpt(recordId: number): Promise<Blob> {
  return (await axiosInstance.get('/api/teach/ppt/download', {
    params: { recordId },
    responseType: 'blob',
  })) as unknown as Blob;
}
