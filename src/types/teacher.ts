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
}

/** GET /api/teach/homework/list 返回项（后端作业实体，无班级/题数等冗余字段） */
export interface PublishedHomework {
  id: number;
  title: string;
  content: string;
  chapterId: number;
  deadline: string;
  status: number;
  createTime: string;
}

// ==================== 班级学情 ====================

/** GET /api/teach/class/stats 返回：总人数 + 平均进度 */
export interface ClassStats {
  totalStudents: number;
  averageProgress: number;
  message?: string;
}
