/**
 * 教师端类型定义（字段以 openapi.json 为准）
 * 备课材料、作业发布/列表、班级学情汇总三块有后端接口，其余能力暂无接口，页面仅保留 UI。
 */

// ==================== AI 智能备课 ====================

/**
 * POST /api/agent/teach/prepare 请求体
 * 生成开关后端声明为字符串：'1'=开启，'0'=关闭，缺省按开启处理。
 * 三组 config 与后端 DTO 一致，字段全为 String，未传的字段由备课工作流兜底默认值。
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
  /** 用户其他要求 */
  userMessage?: string;
  /** PPT 模板 ID，为空时使用系统默认模板 */
  templateId?: number;
  /** PPT 生成配置 */
  pptConfig?: PptGenerateConfig;
  /** 教案生成配置 */
  lessonPlanConfig?: LessonPlanGenerateConfig;
  /** 课后习题配置（题库题目由后端拉取，前端不传） */
  homeworkConfig?: HomeworkGenerateConfig;
}

/**
 * POST /api/agent/teach/prepare 受理回执
 * 后端受理后立即返回，不等待材料生成：status 恒为 2（生成中），
 * 五类材料由后台工作流异步写进同一条备课记录，用 recordId 轮询状态接口，状态转 1 后再取详情。
 */
export interface PrepareAcceptedResponse {
  chapterId: number;
  /** 备课记录编号；Long 可能超出 Number 安全整数，使用时统一转字符串 */
  recordId: number | string;
  /** 2=生成中（受理回执恒为该值） */
  status: number;
  /** 状态中文描述，如「生成中」 */
  statusDesc: string;
  /** 失败原因，受理回执为空 */
  errorMsg?: string | null;
  /** 受理时间 */
  generateTime: string;
}

/** PPT 生成配置：字段全 String，与智能体 api 契约一致 */
export interface PptGenerateConfig {
  /** 页数范围，如 "10-14" */
  pageRange?: string;
  /** 是否包含目录页：1=是 0=否 */
  includeOutline?: string;
  /** 是否包含总结页：1=是 0=否 */
  includeSummary?: string;
  /** 每页代码块上限 */
  codeBlockMax?: string;
}

/** 教案生成配置 */
export interface LessonPlanGenerateConfig {
  /** 课型：new=新授课，review=复习课 */
  courseType?: string;
  /** 课时分钟数，如 "45" */
  duration?: string;
  /** 详细度：brief=简案，medium=标准，detailed=详案 */
  detailLevel?: string;
  /** 是否包含板书设计：1=是 0=否 */
  includeBoardDesign?: string;
  /** 是否包含课堂练习环节：1=是 0=否 */
  includeExercise?: string;
}

/** 课后习题配置 */
export interface HomeworkGenerateConfig {
  /** 题目数量，如 "5" */
  questionCount?: string;
  /** 难度分布（易,中,难），如 "2,2,1" */
  difficultyDistribution?: string;
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

/**
 * GET /api/teach/ppt/themes 返回项：主题简要信息（不含 CSS 全文）
 * 主题由后端 teach_ppt_theme 表管理，前端只按 code + version 拉取
 */
export interface PptTheme {
  /** 主题编码，被模板的 themeCode 引用 */
  code: string;
  name: string;
  /** 版本号：CSS 更新时后端 +1，前端据此让本地缓存失效 */
  version: number;
  /** 兼容旧接口的说明字段，新接口可能不返回 */
  description?: string;
}

/** GET /api/teach/ppt/themes/{code} 返回项：主题完整信息（含 CSS 全文） */
export interface PptThemeDetail extends PptTheme {
  /** 主题 CSS 全文，直接注入 Shadow DOM */
  cssText: string;
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
  /** 雪花 ID 是 19 位 Long，后端按字符串直出；前端全程按原值透传，不做数字转换以免丢精度 */
  id: number | string;
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
  id: number | string;
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
