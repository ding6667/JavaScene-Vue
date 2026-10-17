/**
 * 教师端类型定义（字段以 openapi.json 为准）
 * 备课材料、作业发布/列表、班级学情汇总三块有后端接口，其余能力暂无接口，页面仅保留 UI。
 */

// ==================== AI 智能备课 ====================

/**
 * POST /api/agent/teach/prepare 请求体
 * 生成开关后端声明为字符串：'1'=开启，'0'=关闭，缺省按开启处理。
 */
export interface TeachPrepareRequest {
  chapterId: number;
  /** 是否生成 PPT */
  pptx?: string;
  /** 是否生成教案 */
  lessonPlan?: string;
  /** 是否生成课后习题 */
  homework?: string;
  /** 是否生成上机实训方案 */
  lab?: string;
  /** 是否提炼重难点 */
  keyPoints?: string;
  /** 用户额外指令 */
  userMessage?: string;
}

/** 备课材料生成结果（Markdown 文本 + PPT 路径 + 备课记录 ID） */
export interface TeachPrepareResult {
  chapterId: number;
  lessonPlan: string;
  /** PPT 文件路径，转换失败或未开启时为 null */
  pptxUrl: string | null;
  keyPoints: string;
  homework: string;
  lab: string;
  /** 备课记录 ID，落库后回填，供查询追溯 */
  recordId: number;
  generateTime: string;
}

// ==================== 作业 ====================

/** POST /api/teach/homework/publish 请求体 */
export interface HomeworkPublishRequest {
  title: string;
  /** 作业要求正文 */
  content: string;
  chapterId: number;
  /** 截止时间 */
  deadline: string;
  /** 指定班级发布时必填（与 grade 二选一） */
  classId?: number;
  /** 全年级发布时必填 */
  grade?: string;
  /** 是否允许迟交：0=否 1=是，默认 0 */
  allowLateSubmit?: number;
  /** 作业总分，默认 0 */
  totalScore?: number;
}

/** POST /api/teach/homework/close 请求体 */
export interface HomeworkCloseRequest {
  homeworkId: number;
  /** 关闭原因，可选（库表列长 200） */
  closeReason?: string;
}

/** GET /api/teach/homework/list 返回项（列表字段较薄，班级/总分/状态名等需调详情接口取） */
export interface PublishedHomework {
  id: number;
  title: string;
  content: string;
  chapterId: number;
  deadline: string;
  /** 见 HOMEWORK_STATUS_LABELS */
  status: number;
  createTime: string;
}

/**
 * 作业状态码值（openapi 对 teach/homework 的 status 列注明）
 * 详情接口会另给中文 statusName，列表只能拿到码值，故在此维护一份映射。
 */
export const HOMEWORK_STATUS_LABELS: Record<number, string> = {
  1: '未发布',
  2: '已发布',
  3: '已截止',
  4: '已归档',
};

/** 已截止/已归档的作业不可再关闭 */
export function isHomeworkClosed(status: number): boolean {
  return status === 3 || status === 4;
}

/** 作业详情中的题目快照项（options / answer / knowledgePoints 均为 JSON 字符串，需前端自行解析） */
export interface HomeworkQuestionSnapshot {
  id: number;
  questionId: number;
  sourceType: number;
  content: string;
  type: number;
  typeName: string;
  options: string;
  answer: string;
  analysis: string;
  difficulty: number;
  chapterId: number;
  knowledgePoints: string;
  defaultScore: number;
  page: number;
  score: number;
  sortOrder: number;
}

/** GET /api/teach/homework/detail 返回（含题目完整快照，非本人作业后端拒绝访问） */
export interface HomeworkDetail {
  id: number;
  title: string;
  content: string;
  chapterId: number;
  classId: number;
  grade: string;
  status: number;
  /** 状态名（已发布 / 已截止等），直接展示无需前端映射 */
  statusName: string;
  totalScore: number;
  questionCount: number;
  allowLateSubmit: number;
  deadline: string;
  publishTime: string | null;
  closeTime: string | null;
  closeReason: string | null;
  createTime: string;
  questions: HomeworkQuestionSnapshot[];
}

// ==================== PPT 模板与主题 ====================

/** GET /api/teach/ppt/template 返回项：预置外观主题（常量，4 套） */
export interface PptTheme {
  /** 主题编码，同时是 CSS 文件名与模板 theme_code 的合法取值 */
  code: string;
  name: string;
  description: string;
}

/** GET /api/teach/ppt/template/list 返回项 */
export interface PptTemplate {
  id: number;
  name: string;
  description: string;
  /** 视觉主题编码：java-default / java-dark / java-uncover / java-minimal */
  themeCode: string;
  previewImage: string;
  /** 0=教师自定义，1=系统预设 */
  isSystem: number;
  sortOrder: number;
}

/** GET /api/teach/ppt/template/detail/{id} 返回（多 structureMd 骨架全文） */
export interface PptTemplateDetail extends PptTemplate {
  structureMd: string;
  teacherId: number | null;
}

/** POST /api/teach/ppt/template/save 请求体（id 为空新增，非空改本人模板；系统模板一律拒绝） */
export interface PptTemplateSaveRequest {
  id?: number;
  name: string;
  description?: string;
  themeCode: string;
  structureMd: string;
}

// ==================== 备课记录 ====================

/** GET /api/teach/prepare/record/list 查询参数 */
export interface PrepareRecordQuery {
  chapterId?: number;
  pageNum: number;
  pageSize: number;
}

/** 备课记录列表项（五类材料以布尔标记呈现有无） */
export interface PrepareRecordItem {
  id: number;
  chapterId: number;
  createTime: string;
  hasLessonPlan: boolean;
  hasKeyPoints: boolean;
  hasHomework: boolean;
  hasLab: boolean;
  /** 是否已生成 PPT 文件，决定"下载 PPT"是否可用 */
  hasPpt: boolean;
}

/** GET /api/teach/prepare/record/list 分页数据（注意页码字段是 pageNum，不是 current） */
export interface PrepareRecordPage {
  records: PrepareRecordItem[];
  total: number;
  pageNum: number;
  pageSize: number;
}

/** GET /api/teach/prepare/record/detail 返回（五类材料全文） */
export interface PrepareRecordDetail {
  id: number;
  chapterId: number;
  lessonPlan: string;
  keyPoints: string;
  homework: string;
  lab: string;
  /** PPT 原始 Markdown 内容 */
  pptxMd: string;
  pptxUrl: string;
  /** 生成所用模板 ID：后端列未就绪，当前恒为 null */
  templateId: number | null;
  createTime: string;
}

// ==================== 班级学情 ====================

/** GET /api/teach/class/stats 返回：总人数 + 平均进度 */
export interface ClassStats {
  totalStudents: number;
  averageProgress: number;
  message?: string;
}
