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
  PrepareAcceptedResponse,
  PrepareRecordDetail,
  PrepareRecordPage,
  PrepareRecordQuery,
  PptTemplate,
  PptTemplateDetail,
  PptTemplateSaveRequest,
  PptTheme,
  PptThemeDetail,
  PublishedHomework,
  TeachPrepareRequest,
} from '@/types/teacher';

// ---------- POST /api/agent/teach/prepare（备课，归 teach 模块） ----------

/**
 * 备课材料生成（教案/PPT/重难点/课后习题/上机实训）
 * 开关字段是字符串 '1'/'0'；本接口只落一条备课记录并立即返回受理回执
 * { chapterId, recordId, status: 2 生成中, statusDesc, generateTime }，
 * 五类材料由后台工作流异步写入，先用 recordId 轮询 GET /api/teach/prepare/record/status，
 * 状态变 1 再拉 GET /api/teach/prepare/record/detail 取全文。
 */
export async function generateTeachPrepare(data: TeachPrepareRequest): Promise<PrepareAcceptedResponse> {
  const res = await axiosInstance.post('/api/agent/teach/prepare', data);
  return (res.data ?? res) as PrepareAcceptedResponse;
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

/** 后端主题 VO 可能用 code / themeCode / theme_code 三种命名，统一成 code */
type RawThemeFields = {
  code?: string;
  themeCode?: string;
  theme_code?: string;
};

function normalizeThemeBase<T extends RawThemeFields>(theme: T): T & { code: string } {
  return { ...theme, code: theme.code || theme.themeCode || theme.theme_code || '' };
}

/**
 * GET /api/teach/ppt/template/themes —— 可用主题简要信息（code / name / version）
 * 列表接口不返回 cssText，避免一次拉回所有主题大字段
 */
export async function fetchPptThemes(): Promise<PptTheme[]> {
  const res = await axiosInstance.get('/api/teach/ppt/template/themes');
  const list = (res.data ?? res ?? []) as (PptTheme & RawThemeFields)[];
  return list.map((t) => normalizeThemeBase(t));
}

/** GET /api/teach/ppt/template/themes/{code} —— 单个主题完整信息（含 CSS 全文） */
export async function fetchPptThemeDetail(code: string): Promise<PptThemeDetail> {
  const res = await axiosInstance.get(`/api/teach/ppt/template/themes/${encodeURIComponent(code)}`);
  const detail = (res.data ?? res) as PptThemeDetail & RawThemeFields;
  return normalizeThemeBase(detail);
}

/** GET /api/teach/ppt/template/list —— 系统模板 + 本人自定义模板，按 sortOrder 升序 */
export async function fetchPptTemplates(): Promise<PptTemplate[]> {
  const res = await axiosInstance.get('/api/teach/ppt/template/list');
  return (res.data ?? res ?? []) as PptTemplate[];
}

/** GET /api/teach/ppt/template/detail/{id} —— 模板详情（含 structure_md 骨架全文） */
export async function fetchPptTemplateDetail(id: number): Promise<PptTemplateDetail> {
  const res = await axiosInstance.get(`/api/teach/ppt/template/detail/${normalizeId(id, '模板')}`);
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

/** GET /api/teach/prepare/record/status?id= —— 备课记录状态：2 生成中 / 1 成功 / 0 失败 */
export async function fetchPrepareRecordStatus(id: number | string): Promise<number> {
  const res = await axiosInstance.get('/api/teach/prepare/record/status', {
    params: { id: normalizeId(id, '备课记录') },
  });
  return Number((res.data ?? res) as unknown);
}

/** GET /api/teach/prepare/record/detail?id= —— 五类材料全文 */
export async function fetchPrepareRecordDetail(id: number | string): Promise<PrepareRecordDetail> {
  const res = await axiosInstance.get('/api/teach/prepare/record/detail', {
    params: { id: normalizeId(id, '备课记录') },
  });
  return (res.data ?? res) as PrepareRecordDetail;
}

/**
 * GET /api/teach/prepare/record/export?recordId= —— 教案导出 Word 文件流（.docx）
 * Blob 响应由拦截器原样返回，调用方负责 createObjectURL 与下载
 */
export async function exportLessonPlan(recordId: number | string): Promise<Blob> {
  return (await axiosInstance.get('/api/teach/prepare/record/export', {
    params: { recordId: normalizeId(recordId, '备课记录') },
    responseType: 'blob',
  })) as unknown as Blob;
}

/**
 * GET /api/teach/ppt/download?recordId= —— 下载本人备课生成的 PPT（成功后后端自增下载计数）
 * 记录只有 pptx_md、文件还没转出来时，后端会现场生成再回文件流，耗时可能超过默认 30s，
 * 所以这里单独放宽超时。
 */
export async function downloadPpt(recordId: number | string): Promise<Blob> {
  return (await axiosInstance.get('/api/teach/ppt/download', {
    params: { recordId: normalizeId(recordId, '备课记录') },
    responseType: 'blob',
    timeout: 120000,
  })) as unknown as Blob;
}

/**
 * 记录 / 模板主键校验
 * 后端这些参数都是 Long，一旦前端把整个响应对象当成 ID 传出去，
 * String(obj) 会得到 "[object Object]"，Spring 抛类型转换异常，前端只看到「查不到记录」。
 * 在这里挡住并带上调用方名字，坏数据一出页就能定位。
 */
function normalizeId(value: number | string, who: string): string {
  const id = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`${who}编号不合法：${id || '(空)'}（调用处传的不是主键值）`);
  }
  return id;
}
