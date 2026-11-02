/**
 * 教材知识模块 API（后端 /api/knowledge/*）
 * 负责人：【A 教材知识库】
 *
 * 约定：api/index.ts 的响应拦截器已经把 axios 响应拆成后端 Result 外壳
 * （{ code, message, data }），并且对 code≠200 统一弹错 + reject。
 * 所以这里每个函数拿到的 res 就是 Result，业务数据在 res.data；
 * `?? res` 是兜底：后端个别接口直接返回裸数组时调用方不用改。
 *
 * ID 口径（重要）：knowledge_* 主键是雪花 ID（19 位，见 docs/sql/table.sql 里
 * `id bigint not null` 无 auto_increment），超过 JS Number.MAX_SAFE_INTEGER(2^53≈9.0e15)。
 * JSON 一旦按数字解析就会静默变成邻近值，编辑/删除会打到不存在的行上。
 * 因此后端把这些 ID 以**字符串**下发，本文件也一律**不做 Number() 强转**，原样透传。
 * 需要拼查询参数或回传给保存接口时直接用字符串即可（Spring/Jackson 会自动转 Long）。
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

/** Result 外壳（拦截器已保证 code 为 200，这里只负责取 data） */
interface ApiResult<T> {
  data?: T;
}

/** 取业务数据：res 已是 Result 外壳，data 缺失时退回 res 本身（与既有真实实现同一写法） */
function unwrap<T>(res: unknown): T {
  const envelope = res as ApiResult<T>;
  return (envelope?.data ?? (res as T)) as T;
}

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

// ==================== 章节维护 ====================

/**
 * GET /api/knowledge/chapter/tree?courseId= —— 章节树（父子层级组装）
 */
export async function fetchChapterTree(
  courseId: number = DEFAULT_COURSE_ID): Promise<ChapterTreeNode[]> {
  const res = await axiosInstance.get('/api/knowledge/chapter/tree', { params: { courseId } });
  return unwrap<ChapterTreeNode[]>(res);
}

/**
 * POST /api/knowledge/chapter/save —— 新增/更新章节（id 为空即新增）
 * 返回记录 ID。**不要 Number(id)**：雪花 ID 转数字会丢精度，直接返回字符串。
 */
export async function saveChapter(data: ChapterSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/knowledge/chapter/save', data);
  return unwrap<number>(res);
}

// ==================== 知识点 ====================

/** GET /api/knowledge/point/list?chapterId=（后端直接返回数组，不分页） */
export async function fetchKnowledgePoints(chapterId: number | string): Promise<KnowledgePoint[]> {
  const res = await axiosInstance.get('/api/knowledge/point/list', { params: { chapterId } });
  return unwrap<KnowledgePoint[]>(res);
}

/** POST /api/knowledge/point/save（返回记录 ID，口径同 saveChapter） */
export async function saveKnowledgePoint(data: KnowledgePointSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/knowledge/point/save', data);
  return unwrap<number>(res);
}

// ==================== 教材原文 ====================

/**
 * GET /api/knowledge/content/list（分页）
 * 出参已冗余 chapterName / knowledgePointName / contentTypeName，列表页无需二次查询。
 */
export async function fetchTextbookContent(params: {
  chapterId: number | string;
  contentType?: number;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
}): Promise<TextbookContentPage> {
  const res = await axiosInstance.get('/api/knowledge/content/list', { params });
  return unwrap<TextbookContentPage>(res);
}

/** POST /api/knowledge/content/save（syncDify=false 时只落本地、不动 Dify） */
export async function saveTextbookContent(data: TextbookContentSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/knowledge/content/save', data);
  return unwrap<number>(res);
}

/** PUT /api/knowledge/content/delete?id=（逻辑删除，并归档删除 Dify 侧文档） */
export async function deleteTextbookContent(id: number | string): Promise<string> {
  const res = await axiosInstance.put('/api/knowledge/content/delete', null, { params: { id } });
  return String(unwrap<string>(res) ?? '');
}

// ==================== 出题权重 ====================

/** GET /api/knowledge/weight/list?chapterId=（后端返回数组，仅 ADMIN） */
export async function fetchWeights(chapterId: number | string): Promise<QuestionWeight[]> {
  const res = await axiosInstance.get('/api/knowledge/weight/list', { params: { chapterId } });
  return unwrap<QuestionWeight[]>(res);
}

/** POST /api/knowledge/weight/save（同章节+知识点重复提交即更新） */
export async function saveWeight(data: QuestionWeightSaveRequest): Promise<number> {
  const res = await axiosInstance.post('/api/knowledge/weight/save', data);
  return unwrap<number>(res);
}

/**
 * POST /api/knowledge/weight/batch（请求体是数组，返回受影响条数）
 * 后端一个事务包住，任一条失败整批回滚——所以调用方不必自己做逐条容错。
 */
export async function saveWeightsBatch(list: QuestionWeightSaveRequest[]): Promise<number> {
  const res = await axiosInstance.post('/api/knowledge/weight/batch', list);
  return unwrap<number>(res);
}

// ==================== 知识库录入与留痕 ====================

/**
 * POST /api/knowledge/dataset/upload/file?chapterId=（multipart，字段名 file）
 *
 * 异步受理：返回的 recordId + status=0 只代表"已入队"，**不代表知识库里有内容**。
 * 真正成败要轮询 fetchDatasetUploadList({ recordId })，看 status 变成 1 还是 2。
 * 文件类型白名单（txt/md/pdf/docx/…）由后端拦截，不在名单内直接返回明确文案。
 */
export async function uploadDatasetFile(
  chapterId: number | string,
  file: File,
): Promise<DatasetUploadAck> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await axiosInstance.post('/api/knowledge/dataset/upload/file', formData, {
    params: { chapterId },
    // 覆盖实例默认的 application/json，否则 Spring 解析不到 multipart 边界
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrap<DatasetUploadAck>(res);
}

/** POST /api/knowledge/dataset/upload/text（受理响应，口径同 upload/file） */
export async function uploadDatasetText(data: DatasetUploadTextRequest): Promise<DatasetUploadAck> {
  const res = await axiosInstance.post('/api/knowledge/dataset/upload/text', data);
  return unwrap<DatasetUploadAck>(res);
}

/** GET /api/knowledge/dataset/upload/list（上传留痕分页；教师只见本人，管理员见全部） */
export async function fetchDatasetUploadList(
  params: DatasetUploadQuery): Promise<DatasetUploadPage> {
  const res = await axiosInstance.get('/api/knowledge/dataset/upload/list', { params });
  return unwrap<DatasetUploadPage>(res);
}

/** POST /api/knowledge/dataset/metadata/update（运维补元数据，仅教师/管理员） */
export async function updateDatasetMetadata(data: DatasetMetadataUpdateRequest): Promise<string> {
  const res = await axiosInstance.post('/api/knowledge/dataset/metadata/update', data);
  return String(unwrap<string>(res) ?? '');
}

/**
 * GET /api/knowledge/dataset/querySSE?keywords=（流式检索）
 * 返回原生 Response 交由调用方逐块解析：EventSource 不能带 Authorization 头，
 * 所以和 api/qa.ts 一样走 fetch + ReadableStream。事件名：item / done / error。
 */
export async function searchDatasetStream(keywords: string): Promise<Response> {
  const token = localStorage.getItem('auth_token') ?? '';
  return fetch(`/api/knowledge/dataset/querySSE?${new URLSearchParams({ keywords })}`, {
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
  });
}

// ==================== AI 内容校验 ====================

/**
 * POST /api/knowledge/verify/content {chapterId, aiAnswer}
 * 后端返回 hitRate（0~1，两位小数）、isMatch（阈值 0.6）、命中的教材原文片段与修改建议。
 * 注意：该章没配关键词或没有教材原文时后端会返回业务错误（拦截器已弹提示并 reject），
 * 调用方 catch 住即可，不要当成"不贴合"。
 */
export async function verifyContent(data: ContentVerifyRequest): Promise<ContentVerifyResult> {
  const res = await axiosInstance.post('/api/knowledge/verify/content', data);
  return unwrap<ContentVerifyResult>(res);
}

/** 分页壳类型（供列表页复用；实际分页由各自接口返回） */
export type KnowledgePage<T> = PageResponse<T>;
