/**
 * 教材知识模块 DTO（后端 /api/knowledge/*）
 * 文件负责人：【A 教材知识库】
 * 字段一律以 openapi.json 为准；标注 TODO 的接口尚未在前端接入，类型先冻结好供实现方直接引用。
 */

import type { PageResponse } from './index';

/** GET /api/knowledge/chapter/list 返回项（扁平结构，靠 parentId 组织层级） */
export interface Chapter {
  id: number;
  courseId: number;
  parentId: number;
  chapterCode: string;
  /** 章节标题（后端列名是 title，不是 chapterName） */
  title: string;
  /** 1=章 2=节 3=小节 */
  level: number;
  sortOrder: number;
  description: string;
  createTime?: string;
  updateTime?: string;
}

/** GET /api/knowledge/chapter/tree 返回项（父子层级组装）—— TODO 待接 */
export interface ChapterTreeNode {
  id: number;
  courseId: number;
  parentId: number;
  chapterCode: string;
  title: string;
  level: number;
  sortOrder: number;
  children: ChapterTreeNode[];
}

/** POST /api/knowledge/chapter/save 请求体 —— TODO 待接 */
export interface ChapterSaveRequest {
  /** 为空表示新增 */
  id?: number;
  courseId: number;
  parentId?: number;
  chapterCode: string;
  title: string;
  level: number;
  sortOrder: number;
  description?: string;
  summary?: string;
}

/** GET /api/knowledge/point/list 返回项 —— TODO 待接 */
export interface KnowledgePoint {
  id: number;
  chapterId: number;
  name: string;
  description: string;
  /** 难度（后端为整数码值） */
  difficulty: number;
  keyword: string;
  pageRef: string;
  createTime: string;
  updateTime: string;
}

/** POST /api/knowledge/point/save 请求体 —— TODO 待接 */
export interface KnowledgePointSaveRequest {
  id?: number;
  chapterId: number;
  name: string;
  description?: string;
  difficulty?: number;
  keyword?: string;
  pageRef?: string;
  pageOrder?: number;
}

/** GET /api/knowledge/content/list 返回项 —— TODO 待接 */
export interface TextbookContent {
  id: number;
  chapterId: number;
  /** 关联查询的冗余字段，前端无需再查名称 */
  chapterName: string;
  knowledgePointId: number;
  knowledgePointName: string;
  /** 1=概念定义 2=例题 3=代码案例 4=习题 */
  contentType: number;
  contentTypeName: string;
  content: string;
  page: number;
  pageOrder: number;
  difyDocumentId: string;
  createTime: string;
}

/** POST /api/knowledge/content/save 请求体 —— TODO 待接 */
export interface TextbookContentSaveRequest {
  id?: number;
  chapterId: number;
  knowledgePointId?: number;
  contentType?: number;
  content: string;
  page?: number;
  pageOrder?: number;
  /** 是否同步写入 Dify 知识库 */
  syncDify?: boolean;
}

/** GET /api/knowledge/content/list 分页数据 —— TODO 待接 */
export type TextbookContentPage = PageResponse<TextbookContent>;

/** GET /api/knowledge/weight/list 返回项 —— TODO 待接 */
export interface QuestionWeight {
  id: number;
  chapterId: number;
  knowledgePointId: number;
  knowledgePointName: string;
  weight: number;
  baseQuestionCount: number;
  maxQuestionCount: number;
  /** 难度分布（后端为字符串，如 "basic:5,advanced:3,expert:2"） */
  difficultyDistribution: string;
  isActive: boolean;
}

/** POST /api/knowledge/weight/save|batch 元素 —— TODO 待接 */
export interface QuestionWeightSaveRequest {
  chapterId: number;
  knowledgePointId: number;
  weight: number;
  baseQuestionCount?: number;
  maxQuestionCount?: number;
  difficultyDistribution?: string;
  isActive?: boolean;
}

/** GET /api/knowledge/dataset/query 单条检索结果（已对接） */
export interface KnowledgeSegment {
  segmentId: string;
  content: string;
  score: number;
  documentId: string;
  documentName: string;
  chapterId: number | null;
  page: number;
}

/** GET /api/knowledge/dataset/query 完整响应（已对接） */
export interface KnowledgeSearchResult {
  query: string;
  items: KnowledgeSegment[];
  message: string;
}

/**
 * POST /api/knowledge/dataset/upload/file|text 受理响应 —— TODO 待接
 * success 只代表"受理入队成功"，真正成败以 upload/list 记录的 status 为准（0 处理中 / 1 成功 / 2 失败）。
 */
export interface DatasetUploadAck {
  success: boolean;
  recordId: number;
  status: number;
  statusDesc: string;
  errorMsg: string | null;
}

/** POST /api/knowledge/dataset/upload/text 请求体 —— TODO 待接 */
export interface DatasetUploadTextRequest {
  chapterId: number;
  documentName: string;
  content: string;
  /** 1=概念定义 2=例题 3=代码案例 4=习题 */
  contentType?: number;
  page?: number;
}

/** GET /api/knowledge/dataset/upload/list 返回项 —— TODO 待接 */
export interface DatasetUploadRecord {
  id: number;
  chapterId: number;
  chapterName: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadType: number;
  uploadTypeDesc: string;
  /** 0=处理中 1=成功 2=失败 */
  status: number;
  statusDesc: string;
  totalSegments: number;
  documentId: string;
  batch: string;
  errorMsg: string;
  uploadByName: string;
  uploadTime: string;
  finishTime: string;
  durationSeconds: number;
}

/** GET /api/knowledge/dataset/upload/list 查询参数 —— TODO 待接 */
export interface DatasetUploadQuery {
  recordId?: number;
  chapterId?: number;
  status?: number;
  uploadBy?: number;
  /** 时间格式以联调为准（后端为 date-time 字符串） */
  startTime?: string;
  endTime?: string;
  pageNum?: number;
  pageSize?: number;
}

/** GET /api/knowledge/dataset/upload/list 分页数据 —— TODO 待接 */
export type DatasetUploadPage = PageResponse<DatasetUploadRecord>;

/** POST /api/knowledge/dataset/metadata/update 请求体 —— TODO 待接（metadata 内层结构后端未展开） */
export interface DatasetMetadataUpdateRequest {
  documentId: string;
  metadata: Record<string, unknown>;
}

/** POST /api/knowledge/verify/content 请求体 —— TODO 待接 */
export interface ContentVerifyRequest {
  chapterId: number;
  aiAnswer: string;
}

/** POST /api/knowledge/verify/content 返回 —— TODO 待接 */
export interface ContentVerifyResult {
  isMatch: boolean;
  /** 命中率 0~1，保留两位小数 */
  hitRate: number;
  standardAnswer: string;
  suggestRevision: string;
}
