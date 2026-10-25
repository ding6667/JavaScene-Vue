<script setup lang="ts">
/**
 * 知识库上传留痕 —— 已接后端 /api/knowledge/dataset/*
 *
 *  1) POST /api/knowledge/dataset/upload/file?chapterId=   multipart，文件字段名 file
 *  2) POST /api/knowledge/dataset/upload/text              {chapterId,documentName,content,contentType,page}
 *     两个接口都是**异步受理**：返回 {success,recordId,status:0,statusDesc:"处理中"}，
 *     只代表任务已入队。后端把 Dify 建档 + 索引轮询（最长 5 分钟）放到后台线程池跑，
 *     所以这里必须凭 recordId 轮询列表接口确认最终成败——受理成功 ≠ 入库成功。
 *  3) GET  /api/knowledge/dataset/upload/list?recordId&chapterId&status&uploadBy&startTime&endTime&pageNum&pageSize
 *     status：0=处理中、1=成功、2=失败；errorMsg 只在列表里返回。
 *     教师只能看到自己的记录（服务端强制覆盖 uploadBy），管理员可查全部。
 *  4) POST /api/knowledge/dataset/metadata/update          {documentId,metadata}
 *
 * 文件类型白名单与后端 KnowledgeConstant.UPLOAD_FILE_ALLOWED_EXTENSIONS 同口径，
 * 不在名单内（如 zip）后端直接返回明确文案，不会打到 Dify 再报 400。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CloudUpload, FileText, History, Info, Search, TextCursorInput } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchChapters,
  fetchDatasetUploadList,
  updateDatasetMetadata,
  uploadDatasetFile,
  uploadDatasetText,
} from '@/api/knowledge';
import type { DatasetUploadRecord } from '@/types/knowledge';

/** ID 一律按字符串比对：knowledge_* 主键是雪花 ID，转 number 会丢精度 */
type RowId = number | string;

interface ChapterOption {
  id: RowId;
  title: string;
  code: string;
}

/** 列表行视图模型：字段来自后端 DatasetUploadRecord，只做展示层改名 */
interface UploadRecord {
  recordId: RowId;
  chapterId: RowId;
  chapterTitle: string;
  documentName: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 文件类型（后端 fileType 列，如 txt/md/pdf） */
  contentType: string;
  /** 0=处理中 1=成功 2=失败 */
  status: number;
  statusDesc: string;
  segmentCount: number;
  /** 处理耗时（秒）：finishTime - uploadTime，处理中为 0 */
  durationSeconds: number;
  uploadBy: string;
  /** 新增=1 / 更新=2（同名文档命中已有记录即为更新） */
  uploadTypeDesc: string;
  errorMsg: string;
  /** Dify 文档ID，元数据修正要用 */
  documentId: string;
  uploadTime: string;
}

/** 与后端白名单保持一致，避免选了才发现被拒 */
const ALLOWED_EXT = '.txt,.md,.markdown,.pdf,.html,.htm,.docx,.xlsx,.csv,.pptx,.xml,.epub';

/** 内容类型码值对齐后端 ContentTypeEnum（1=概念定义 2=例题 3=代码案例 4=习题） */
const CONTENT_TYPES = [
  { value: 1, label: '概念定义' },
  { value: 2, label: '例题' },
  { value: 3, label: '代码案例' },
  { value: 4, label: '习题' },
];

/** 轮询：后端索引最长等 5 分钟，这里 3 秒一次、最多 110 次（多给一点余量） */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TIMES = 110;

const uploadMode = ref<'file' | 'text'>('file');

// ---- 章节下拉 ----
const chapterOptions = ref<ChapterOption[]>([]);
const uploadChapterId = ref<RowId | null>(null);

// ---- 文件上传入口（要留原始 File，不能只存名字） ----
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
  selectedFile.value = f;
}

// ---- 文本上传入口 ----
const textForm = ref({
  documentName: '',
  contentType: 1,
  page: 1,
  content: '',
});

// ---- 上传记录筛选（对应 upload/list 查询参数） ----
const records = ref<UploadRecord[]>([]);
const filter = ref({
  recordId: '',
  status: '' as '' | '0' | '1' | '2',
  uploadBy: '',
  startTime: '',
  endTime: '',
});
const pageNum = ref(1);
const pageSize = ref(10);
const total = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const listLoading = ref(false);
const submitting = ref(false);

/** 轮询状态提示文案（null 表示没有在轮询） */
const pollingText = ref<string | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const STATUS_META: Record<number, { label: string; badge: string }> = {
  0: { label: '处理中', badge: 'st-badge--warning' },
  1: { label: '成功', badge: 'st-badge--success' },
  2: { label: '失败', badge: 'st-badge--danger' },
};

const canSubmit = computed(() => {
  if (uploadChapterId.value === null) return false;
  if (uploadMode.value === 'file') return selectedFile.value !== null;
  return textForm.value.documentName.trim() !== '' && textForm.value.content.trim() !== '';
});

onMounted(async () => {
  try {
    const list = await fetchChapters();
    chapterOptions.value = list.map((c) => ({ id: c.id, title: c.title, code: c.chapterCode }));
  } catch {
    chapterOptions.value = [];
  }
  await loadRecords();
});

// 离开页面必须停掉轮询，否则定时器一直跑并会对已卸载的组件赋值
onBeforeUnmount(stopPolling);

function stopPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollingText.value = null;
}

function toRecord(r: DatasetUploadRecord): UploadRecord {
  return {
    recordId: r.id,
    chapterId: r.chapterId,
    chapterTitle: r.chapterName,
    documentName: r.fileName,
    fileSize: r.fileSize,
    contentType: r.fileType,
    status: r.status,
    statusDesc: r.statusDesc,
    segmentCount: r.totalSegments,
    durationSeconds: r.durationSeconds,
    uploadBy: r.uploadByName,
    uploadTypeDesc: r.uploadTypeDesc,
    errorMsg: r.errorMsg,
    documentId: r.documentId,
    uploadTime: r.uploadTime,
  };
}

/** 组装列表查询参数：空串一律不传，否则后端会把 "" 当条件 */
function buildQuery(overrides: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {
    pageNum: pageNum.value,
    pageSize: pageSize.value,
    ...overrides,
  };
  if (filter.value.recordId.trim()) q.recordId = filter.value.recordId.trim();
  if (filter.value.status !== '') q.status = Number(filter.value.status);
  if (filter.value.uploadBy.trim()) q.uploadBy = filter.value.uploadBy.trim();
  if (filter.value.startTime) q.startTime = `${filter.value.startTime}T00:00:00`;
  if (filter.value.endTime) q.endTime = `${filter.value.endTime}T23:59:59`;
  return q;
}

async function loadRecords(overrides: Record<string, unknown> = {}) {
  listLoading.value = true;
  try {
    const page = await fetchDatasetUploadList(buildQuery(overrides));
    records.value = (page.records ?? []).map(toRecord);
    total.value = Number(page.total ?? 0);
  } catch {
    // 拦截器已弹错，这里保留上一次列表，不清空表格
  } finally {
    listLoading.value = false;
  }
}

function handleQuery() {
  pageNum.value = 1;
  return loadRecords();
}

function goPage(page: number) {
  pageNum.value = Math.min(Math.max(1, page), totalPages.value);
  return loadRecords();
}

/**
 * 凭 recordId 轮询列表，直到 status≠0。
 * 单独查一条而不是刷整页：新记录未必在第一页（按上传时间倒序通常在，但筛选条件可能已变）。
 */
function pollUntilSettled(recordId: RowId) {
  let times = 0;
  stopPolling();
  pollingText.value = '已受理，正在等待知识库切分入库…';

  const tick = async () => {
    times += 1;
    try {
      const page = await fetchDatasetUploadList({ recordId });
      const row = (page.records ?? [])[0];
      if (row && row.status !== 0) {
        pollingText.value = null;
        pollTimer = null;
        if (row.status === 1) {
          ElMessage.success(`入库完成：${row.fileName} 切分 ${row.totalSegments} 段`);
        } else {
          // 后端已把异常文档从 Dify 删掉，失败原因只在 errorMsg 里
          ElMessage.error(`入库失败：${row.errorMsg || '未知原因'}`);
        }
        await loadRecords();
        return;
      }
    } catch {
      // 单次查询失败不停止轮询，等下一轮（网络抖动不该放弃追踪）
    }
    if (times >= POLL_MAX_TIMES) {
      pollingText.value = null;
      pollTimer = null;
      ElMessage.warning('等待超过 5 分钟仍未回传结果，请稍后在列表中查看该记录状态');
      return;
    }
    pollingText.value = `已受理，正在等待知识库切分入库…（第 ${times} 次查询）`;
    pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
  };

  pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
}

async function handleUpload() {
  if (uploadChapterId.value === null) {
    ElMessage.warning('请先选择挂载章节');
    return;
  }
  submitting.value = true;
  try {
    const ack = uploadMode.value === 'file'
      ? await uploadDatasetFile(uploadChapterId.value, selectedFile.value as File)
      : await uploadDatasetText({
          chapterId: uploadChapterId.value,
          documentName: textForm.value.documentName.trim(),
          content: textForm.value.content,
          contentType: textForm.value.contentType,
          page: textForm.value.page,
        });
    ElMessage.success(`已受理（记录 ${ack.recordId}）：${ack.statusDesc}`);
    // 受理完就清掉本地输入，避免同一份内容被重复提交一次
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
    textForm.value.content = '';
    await loadRecords({ recordId: ack.recordId, pageNum: 1 });
    if (ack.status === 0) pollUntilSettled(ack.recordId);
  } catch {
    // 校验类失败（章节不存在/文件类型不支持/内容为空）后端给了明确文案，拦截器已弹
  } finally {
    submitting.value = false;
  }
}

/**
 * 元数据修正：后端入参是 {documentId, metadata}，metadata 为任意键值。
 * 这里用 JSON 输入框而不是逐字段表单——Dify 侧元数据字段由知识库配置决定，
 * 前端写死字段名反而容易和知识库不一致。
 */
async function handleMetadata(row: UploadRecord) {
  if (!row.documentId) {
    ElMessage.warning('该记录还没有 Dify 文档ID（可能入库失败），无法修正元数据');
    return;
  }
  let text: string;
  try {
    const input = await ElMessageBox.prompt(
      `目标文档：${row.documentName}<br/>元数据键值会追加写入 Dify（如 chapter_id / chapter_name / page）`,
      '修正文档元数据',
      {
        inputValue: JSON.stringify({ chapter_id: String(row.chapterId) }),
        inputType: 'textarea',
        confirmButtonText: '提交',
        cancelButtonText: '取消',
      },
    );
    text = input.value;
  } catch {
    return; // 用户取消
  }
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(text) as Record<string, unknown>;
  } catch {
    ElMessage.error('不是合法 JSON，示例：{"chapter_id": 88, "page": "12"}');
    return;
  }
  await updateDatasetMetadata({ documentId: row.documentId, metadata });
  ElMessage.success('元数据已提交');
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 耗时单位是秒（后端 finish_time - upload_time），处理中还没落 finish_time 时显示占位 */
function fmtDuration(seconds: number): string {
  if (!seconds) return '—';
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function fmtTime(value: string): string {
  return value ? value.replace('T', ' ').slice(0, 19) : '—';
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">知识库上传留痕</h1>
      <p class="st-page-subtitle">教材文档 / 原文片段上传入口与切分入库全过程留痕 · 支持状态轮询与错误追溯</p>
    </header>

    <div class="du-notice">
      <Info :size="14" />
      <span>
        上传接口是<b>异步受理</b>：返回 <code>{success, recordId, status:0}</code> 只代表后端已登记任务，
        <b>受理成功不等于入库成功</b>。本页会在提交后凭 recordId 每 3 秒回查
        <code>GET /api/knowledge/dataset/upload/list</code>（status 0=处理中 1=成功 2=失败，
        失败原因 <code>errorMsg</code> 只在列表里返回）。后端索引最长等 5 分钟，
        空壳（切分 0 段）、报错、超时三种情况后端会自动把异常文档从知识库删掉，无需人工清理。
        教师只能看到自己的记录，管理员可查全部。
      </span>
    </div>

    <!-- 上传入口 -->
    <section class="st-card">
      <div class="st-card__header">
        <CloudUpload :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">上传入口</h2>
          <p class="st-card__hint">二选一：上传教材文件 / 手工录入原文文本</p>
        </div>
        <div class="mode-tabs">
          <button class="mode-tab" :class="{ 'mode-tab--active': uploadMode === 'file' }" @click="uploadMode = 'file'">
            <FileText :size="13" style="vertical-align: -2px; margin-right: 4px;" /> 上传文件
          </button>
          <button class="mode-tab" :class="{ 'mode-tab--active': uploadMode === 'text' }" @click="uploadMode = 'text'">
            <TextCursorInput :size="13" style="vertical-align: -2px; margin-right: 4px;" /> 上传文本
          </button>
        </div>
      </div>
      <div class="st-card__body">
        <div class="form-row">
          <div class="form-item">
            <label class="form-label">挂载章节 chapterId</label>
            <el-select
              v-model="uploadChapterId"
              placeholder="选择章节"
              style="width: 100%;"
              filterable
              no-data-text="章节数据加载失败"
            >
              <el-option
                v-for="c in chapterOptions"
                :key="String(c.id)"
                :label="`${c.code} ${c.title}`"
                :value="c.id"
              />
            </el-select>
          </div>
          <div class="form-item form-item--sm">
            <label class="form-label">内容类型 contentType</label>
            <el-select v-model="textForm.contentType" :disabled="uploadMode === 'file'" style="width: 100%;">
              <el-option v-for="t in CONTENT_TYPES" :key="t.value" :value="t.value" :label="t.label" />
            </el-select>
          </div>
          <div class="form-item form-item--sm">
            <label class="form-label">起始页码 page</label>
            <el-input-number v-model="textForm.page" :min="0" :disabled="uploadMode === 'file'" style="width: 100%;" />
          </div>
        </div>

        <!-- 文件入口 -->
        <label v-if="uploadMode === 'file'" class="upload-drop">
          <CloudUpload :size="24" style="color: var(--text-tertiary);" />
          <span v-if="!selectedFile">
            点击选择教材文件（txt / md / pdf / docx / xlsx / csv / pptx / html / xml / epub，单文件上限 50MB）
          </span>
          <span v-else class="upload-file">{{ selectedFile.name }}（{{ fmtSize(selectedFile.size) }}）</span>
          <input ref="fileInput" type="file" :accept="ALLOWED_EXT" style="display: none;" @change="onFileChange" />
        </label>

        <!-- 文本入口 -->
        <template v-else>
          <div class="form-item">
            <label class="form-label">文档名称 documentName</label>
            <input v-model="textForm.documentName" class="form-input" placeholder="如：第三章 面向对象" />
          </div>
          <div class="form-item">
            <label class="form-label">原文内容 content</label>
            <textarea v-model="textForm.content" class="form-textarea" rows="6" placeholder="粘贴教材原文片段，提交后由后端切分并向量化"></textarea>
          </div>
        </template>

        <div class="panel-actions">
          <span v-if="pollingText" class="polling-hint">{{ pollingText }}</span>
          <button class="st-btn st-btn--primary" :disabled="!canSubmit || submitting" @click="handleUpload">
            <CloudUpload :size="14" /> {{ submitting ? '提交中…' : '提交上传' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 上传记录 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <History :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">上传记录</h2>
          <p class="st-card__hint">
            共 {{ total }} 条 · 本页 {{ records.length }} 条{{ listLoading ? ' · 读取中…' : '' }}
          </p>
        </div>
      </div>
      <div class="st-card__body filter-row">
        <div class="search-box">
          <Search :size="14" />
          <input
            v-model="filter.recordId"
            class="search-input"
            placeholder="按 recordId 追溯"
            @keyup.enter="handleQuery"
          />
        </div>
        <el-select v-model="filter.status" placeholder="状态" style="width: 130px;">
          <el-option value="" label="全部状态" />
          <el-option value="0" label="处理中" />
          <el-option value="1" label="成功" />
          <el-option value="2" label="失败" />
        </el-select>
        <input
          v-model="filter.uploadBy"
          class="form-input form-input--w"
          placeholder="操作人 uploadBy（仅管理员）"
          @keyup.enter="handleQuery"
        />
        <input v-model="filter.startTime" class="form-input form-input--w" type="date" />
        <input v-model="filter.endTime" class="form-input form-input--w" type="date" />
        <button class="st-btn st-btn--secondary" :disabled="listLoading" @click="handleQuery">查询</button>
      </div>
      <div class="table-wrap">
        <table class="du-table">
          <thead>
            <tr>
              <th style="width: 150px;">章节</th>
              <th>文件名 / 文档名</th>
              <th style="width: 90px;">大小</th>
              <th style="width: 90px;">类型</th>
              <th style="width: 90px;">状态</th>
              <th style="width: 80px;">分段数</th>
              <th style="width: 90px;">耗时</th>
              <th style="width: 100px;">操作人</th>
              <th style="width: 150px;">上传时间</th>
              <th style="width: 200px;">错误信息</th>
              <th style="width: 110px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="String(r.recordId)">
              <td class="muted">{{ r.chapterTitle || '—' }}</td>
              <td>
                <div>{{ r.documentName }}</div>
                <div class="record-id">{{ r.recordId }} · {{ r.uploadTypeDesc }}</div>
              </td>
              <td class="muted mono">{{ fmtSize(r.fileSize) }}</td>
              <td><span class="st-badge st-badge--outline">{{ r.contentType || '—' }}</span></td>
              <td>
                <span class="st-badge" :class="STATUS_META[r.status]?.badge ?? 'st-badge--neutral'">
                  {{ r.statusDesc || STATUS_META[r.status]?.label || '未知' }}
                </span>
              </td>
              <td class="mono">{{ r.status === 1 ? r.segmentCount : '—' }}</td>
              <td class="muted mono">{{ fmtDuration(r.durationSeconds) }}</td>
              <td class="muted">{{ r.uploadBy || '—' }}</td>
              <td class="muted mono">{{ fmtTime(r.uploadTime) }}</td>
              <td class="error-cell">{{ r.errorMsg || '—' }}</td>
              <td style="text-align: right;">
                <button class="st-text-btn" :disabled="!r.documentId" @click="handleMetadata(r)">元数据</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="records.length === 0" class="st-empty">
          <History :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">
            {{ listLoading ? '正在读取上传记录…' : '暂无上传记录 · 上传后这里能看到切分入库的全过程' }}
          </div>
        </div>
        <div class="pager">
          <span class="pager__total">共 {{ total }} 条 · 第 {{ pageNum }} / {{ totalPages }} 页</span>
          <div class="pager__ctrl">
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">上一页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">下一页</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.du-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.75;
  padding: 10px 14px;
  background: var(--status-info-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.du-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--status-info);
}

.du-notice b {
  color: var(--text-primary);
}

.mode-tabs {
  margin-left: auto;
  display: inline-flex;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.mode-tab {
  background: transparent;
  border: none;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 5px 12px;
  border-radius: calc(var(--radius-md) - 2px);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}

.mode-tab:hover {
  color: var(--text-primary);
}

.mode-tab--active {
  background: var(--text-primary);
  color: var(--bg-surface);
  font-weight: 600;
}

/* 表单 */
.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.form-item {
  margin-bottom: 14px;
  flex: 1;
  min-width: 180px;
}

.form-item--sm {
  flex: 0 0 170px;
  min-width: 170px;
}

.form-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  height: 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--border-strong);
}

.form-input--w {
  width: 150px;
}

.form-textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.65;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-textarea:focus {
  border-color: var(--border-strong);
}

.upload-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 32px 16px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-secondary);
  transition: all var(--transition);
  margin-bottom: 14px;
}

.upload-drop:hover {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
}

.upload-file {
  color: var(--text-primary);
  font-weight: 500;
}

.panel-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* 轮询提示：处理中才出现，靠右按钮左侧 */
.polling-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.du-notice code {
  font-size: 11.5px;
  padding: 1px 4px;
  background: var(--bg-muted);
  border-radius: var(--radius-sm);
}

/* 筛选 */
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 8px;
  padding-bottom: 8px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
  height: 34px;
  color: var(--text-tertiary);
  background: var(--bg-surface);
}

.search-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  width: 190px;
}

/* 表格 */
.table-wrap {
  padding: 0 24px 20px;
  overflow-x: auto;
}

.du-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.du-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.du-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
}

.du-table tr:hover td {
  background: var(--bg-subtle);
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12px;
}

.muted {
  color: var(--text-tertiary);
}

.record-id {
  font-family: Consolas, monospace;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.error-cell {
  font-size: 11.5px;
  color: var(--status-danger);
  font-family: Consolas, monospace;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.pager__total {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.pager__ctrl {
  display: flex;
  gap: 10px;
}
</style>
