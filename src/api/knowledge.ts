/**
 * 教材知识模块 API（后端 /api/knowledge/*）
 * 负责人：【A 教材知识库】
 *
 * 约定：标了「未实现」的函数已经把路径、入参、出参类型定死，
 * 实现方只需把注释里的两行请求代码替换掉 throw，页面侧不用再改签名。
 */
import axiosInstance from '@/api';
import type { PageResponse } from '@/types';
import type {
  Chapter,
  ChapterSaveRequest,
  ChapterTreeNode,
  ContentVerifyRequest,
  ContentVerifyResult,
  DatasetMetadataUpdateRequest,
  DatasetUploadAck,
  DatasetUploadPage,
  DatasetUploadQuery,
  DatasetUploadTextRequest,
  KnowledgePoint,
  KnowledgePointSaveRequest,
  KnowledgeSearchResult,
  QuestionWeight,
  QuestionWeightSaveRequest,
  TextbookContentPage,
  TextbookContentSaveRequest,
} from '@/types/knowledge';

/** Java 程序设计基础课程 ID（当前后端唯一课程，多课程时需接入课程列表） */
export const DEFAULT_COURSE_ID = 1;

// ==================== 已对接 ====================

let chaptersCache: Chapter[] | null = null;
let chaptersInflight: Promise<Chapter[]> | null = null;

/**
 * GET /api/knowledge/chapter/list?courseId —— 章节列表（真实接口）
 * 章节结构会话内基本不变，用内存缓存 + 单飞复用，避免多个视图重复请求。
 */
export async function fetchChapters(force = false): Promise<Chapter[]> {
  if (!force && chaptersCache) return chaptersCache;
  if (!force && chaptersInflight) return chaptersInflight;

  const request = (async () => {
    const res = await axiosInstance.get('/api/knowledge/chapter/list', {
      params: { courseId: DEFAULT_COURSE_ID },
    });
    return (res.data ?? res ?? []) as Chapter[];
  })();

  chaptersInflight = request;
  try {
    chaptersCache = await request;
    return chaptersCache;
  } catch (e) {
    chaptersCache = null;
    throw e;
  } finally {
    chaptersInflight = null;
  }
}

/** 单章查询（从章节列表取，命中缓存则不额外请求；后端无单章接口） */
export async function fetchChapter(chapterId: number): Promise<Chapter | null> {
  const list = await fetchChapters();
  return list.find((c) => c.id === chapterId) ?? null;
}

/** GET /api/knowledge/dataset/query?keywords —— Dify 混合检索（真实接口） */
export async function queryKnowledge(keywords: string): Promise<KnowledgeSearchResult> {
  const res = await axiosInstance.get('/api/knowledge/dataset/query', { params: { keywords } });
  return (res.data ?? res) as KnowledgeSearchResult;
}

// ==================== 章节维护（未实现） ====================

/** 未实现：章节树 GET /api/knowledge/chapter/tree?courseId= */
export async function fetchChapterTree(
  _courseId: number = DEFAULT_COURSE_ID): Promise<ChapterTreeNode[]> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/knowledge/chapter/tree', { params: { courseId } });
  // return (res.data ?? res) as ChapterTreeNode[];
  throw new Error('未实现：GET /api/knowledge/chapter/tree');
}

/** 未实现：新增/更新章节 POST /api/knowledge/chapter/save（返回记录 ID） */
export async function saveChapter(_data: ChapterSaveRequest): Promise<number> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/chapter/save', data);
  // return Number(res.data ?? res ?? 0);
  throw new Error('未实现：POST /api/knowledge/chapter/save');
}

// ==================== 知识点（未实现） ====================

/** 未实现：GET /api/knowledge/point/list?chapterId=（后端直接返回数组，不分页） */
export async function fetchKnowledgePoints(_chapterId: number): Promise<KnowledgePoint[]> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/knowledge/point/list', { params: { chapterId } });
  // return (res.data ?? res ?? []) as KnowledgePoint[];
  throw new Error('未实现：GET /api/knowledge/point/list');
}

/** 未实现：POST /api/knowledge/point/save（返回记录 ID） */
export async function saveKnowledgePoint(_data: KnowledgePointSaveRequest): Promise<number> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/point/save', data);
  // return Number(res.data ?? res ?? 0);
  throw new Error('未实现：POST /api/knowledge/point/save');
}

// ==================== 教材原文（未实现） ====================

/** 未实现：GET /api/knowledge/content/list（分页，字段见 TextbookContent） */
export async function fetchTextbookContent(_params: {
  chapterId: number;
  contentType?: number;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
}): Promise<TextbookContentPage> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/knowledge/content/list', { params });
  // return (res.data ?? res) as TextbookContentPage;
  throw new Error('未实现：GET /api/knowledge/content/list');
}

/** 未实现：POST /api/knowledge/content/save（同步 Dify，返回记录 ID） */
export async function saveTextbookContent(_data: TextbookContentSaveRequest): Promise<number> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/content/save', data);
  // return Number(res.data ?? res ?? 0);
  throw new Error('未实现：POST /api/knowledge/content/save');
}

/** 未实现：PUT /api/knowledge/content/delete?id=（逻辑删除并归档删除 Dify 文档） */
export async function deleteTextbookContent(_id: number): Promise<string> {
  // TODO(学生实现)：
  // const res = await axiosInstance.put('/api/knowledge/content/delete', null, { params: { id } });
  // return String(res.data ?? res ?? '');
  throw new Error('未实现：PUT /api/knowledge/content/delete');
}

// ==================== 出题权重（未实现） ====================

/** 未实现：GET /api/knowledge/weight/list?chapterId=（后端返回数组） */
export async function fetchWeights(_chapterId: number): Promise<QuestionWeight[]> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/knowledge/weight/list', { params: { chapterId } });
  // return (res.data ?? res ?? []) as QuestionWeight[];
  throw new Error('未实现：GET /api/knowledge/weight/list');
}

/** 未实现：POST /api/knowledge/weight/save（单条，返回记录 ID） */
export async function saveWeight(_data: QuestionWeightSaveRequest): Promise<number> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/weight/save', data);
  // return Number(res.data ?? res ?? 0);
  throw new Error('未实现：POST /api/knowledge/weight/save');
}

/** 未实现：POST /api/knowledge/weight/batch（请求体是数组，返回受影响条数） */
export async function saveWeightsBatch(_list: QuestionWeightSaveRequest[]): Promise<number> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/weight/batch', list);
  // return Number(res.data ?? res ?? 0);
  throw new Error('未实现：POST /api/knowledge/weight/batch');
}

// ==================== 知识库录入与留痕（未实现） ====================

/** 未实现：POST /api/knowledge/dataset/upload/file?chapterId=（multipart，字段名 file） */
export async function uploadDatasetFile(_chapterId: number,  _file: File): Promise<DatasetUploadAck> {
  // TODO(学生实现)：
  // const formData = new FormData();
  // formData.append('file', file);
  // const res = await axiosInstance.post('/api/knowledge/dataset/upload/file', formData, {
  //   params: { chapterId },
  //   headers: { 'Content-Type': 'multipart/form-data' },
  // });
  // return (res.data ?? res) as DatasetUploadAck;
  throw new Error('未实现：POST /api/knowledge/dataset/upload/file');
}

/** 未实现：POST /api/knowledge/dataset/upload/text（受理响应，非最终成败） */
export async function uploadDatasetText(_data: DatasetUploadTextRequest): Promise<DatasetUploadAck> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/dataset/upload/text', data);
  // return (res.data ?? res) as DatasetUploadAck;
  throw new Error('未实现：POST /api/knowledge/dataset/upload/text');
}

/** 未实现：GET /api/knowledge/dataset/upload/list（留痕分页；上传是异步的，需凭 recordId 轮询 status） */
export async function fetchDatasetUploadList(
  _params: DatasetUploadQuery): Promise<DatasetUploadPage> {
  // TODO(学生实现)：
  // const res = await axiosInstance.get('/api/knowledge/dataset/upload/list', { params });
  // return (res.data ?? res) as DatasetUploadPage;
  throw new Error('未实现：GET /api/knowledge/dataset/upload/list');
}

/** 未实现：POST /api/knowledge/dataset/metadata/update（运维用，仅教师） */
export async function updateDatasetMetadata(_data: DatasetMetadataUpdateRequest): Promise<string> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/dataset/metadata/update', data);
  // return String(res.data ?? res ?? '');
  throw new Error('未实现：POST /api/knowledge/dataset/metadata/update');
}

/**
 * 未实现：GET /api/knowledge/dataset/querySSE?keywords=（流式检索）
 * 返回原生 Response，交由调用方按 SSE 逐块解析（参考 api/chat.ts 的流式实现）。
 */
export async function searchDatasetStream(_keywords: string): Promise<Response> {
  // TODO(学生实现)：
  // const token = localStorage.getItem('auth_token') ?? '';
  // return fetch(`/api/knowledge/dataset/querySSE?${new URLSearchParams({ keywords })}`, {
  //   headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
  // });
  throw new Error('未实现：GET /api/knowledge/dataset/querySSE');
}

// ==================== AI 内容校验（未实现） ====================

/** 未实现：POST /api/knowledge/verify/content {chapterId, aiAnswer} */
export async function verifyContent(_data: ContentVerifyRequest): Promise<ContentVerifyResult> {
  // TODO(学生实现)：
  // const res = await axiosInstance.post('/api/knowledge/verify/content', data);
  // return (res.data ?? res) as ContentVerifyResult;
  throw new Error('未实现：POST /api/knowledge/verify/content');
}

/** 分页壳类型（供列表页复用；实际分页由各自接口返回） */
export type KnowledgePage<T> = PageResponse<T>;
