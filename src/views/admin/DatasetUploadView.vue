<script setup lang="ts">
/**
 * 知识库上传留痕 —— UI 骨架页（后端无对应接口）
 *
 * 接口预留与口径说明：
 *  1) POST /api/knowledge/dataset/upload/file?chapterId=
 *     multipart/form-data，文件字段名为 `file`；按章节挂载上传文档。
 *  2) POST /api/knowledge/dataset/upload/text
 *     {chapterId,documentName,content,contentType,page}，手工录入教材原文/片段。
 *  3) 上述两个接口返回 {success,recordId,status,statusDesc,errorMsg}。
 *     ⚠ 受理成功 ≠ 入库成功：拿到 recordId 后只代表后端已登记任务，
 *     是否切分入库需凭 recordId 轮询列表接口确认。
 *  4) GET /api/knowledge/dataset/upload/list
 *     ?recordId&chapterId&status&uploadBy&startTime&endTime&pageNum&pageSize
 *     状态码值：0=处理中、1=成功、2=失败；错误信息 errorMsg 只在该列表里返回，
 *     因此上传后必须回查列表，不能只看上传响应。
 *  5) POST /api/knowledge/dataset/metadata/update {documentId,metadata}
 *     补充/修正文档元数据（如章节归属、页码范围），影响检索召回过滤。
 *  6) GET /api/knowledge/dataset/querySSE?keywords=
 *     流式检索（逐段返回）；现有非流式 /api/knowledge/dataset/query 已在前端接入，
 *     见 @/api/student 与 @/api 下的相关调用，可参照其返回结构。
 *
 * 本页不接 api / pinia：上传记录为空数组占位，表单与筛选均为 UI 局部状态。
 */
import { computed, ref } from 'vue';
import { CloudUpload, FileText, History, Info, Search, TextCursorInput } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

interface ChapterOption {
  id: number;
  title: string;
}

/** 上传记录占位行（字段对齐 upload/list 响应） */
interface UploadRecord {
  recordId: string;
  chapterId: number;
  chapterTitle: string;
  documentName: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 文档类型：文件上传来源后缀 / 文本录入的 contentType */
  contentType: string;
  /** 0=处理中 1=成功 2=失败 */
  status: number;
  statusDesc: string;
  segmentCount: number;
  /** 耗时（毫秒） */
  elapsedMs: number;
  uploadBy: string;
  errorMsg: string;
}

const uploadMode = ref<'file' | 'text'>('file');

// ---- 文件上传入口（仅本地选择状态） ----
const chapterOptions = ref<ChapterOption[]>([]);
const uploadChapterId = ref<number | null>(null);
const selectedFile = ref<{ name: string; size: number } | null>(null);

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) selectedFile.value = { name: f.name, size: f.size };
}

// ---- 文本上传入口 ----
const textForm = ref({
  documentName: '',
  contentType: 'TEXT',
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

function handleUpload() {
  // 接口预留：后端未提供知识库上传接口；接通后需凭返回的 recordId 轮询 upload/list
  ElMessage.info('接口预留：后端未提供知识库上传接口（受理成功≠入库成功，需凭 recordId 轮询状态）');
}

function handleQuery() {
  // 接口预留：GET /api/knowledge/dataset/upload/list
  ElMessage.info('接口预留：后端未提供上传记录列表接口');
}

function handleMetadata(row: UploadRecord) {
  // 接口预留：POST /api/knowledge/dataset/metadata/update {documentId,metadata}
  ElMessage.info(`接口预留：元数据更新未开放（目标文档 ${row.documentName}）`);
}

function goPage(page: number) {
  const target = Math.min(Math.max(1, page), totalPages.value);
  pageNum.value = target;
  // 接口预留：分页参数变化后应重新拉取 upload/list
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtElapsed(ms: number): string {
  if (!ms) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
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
        接口预留：POST /api/knowledge/dataset/upload/file?chapterId=（multipart，字段 <b>file</b>）、
        POST /api/knowledge/dataset/upload/text {chapterId,documentName,content,contentType,page}，
        两者返回 {success,recordId,status,statusDesc,errorMsg}；<b>受理成功不等于入库成功</b>，
        需凭 recordId 轮询 GET /api/knowledge/dataset/upload/list（status 0=处理中 1=成功 2=失败，errorMsg 仅在列表返回）。
        元数据修正：POST /api/knowledge/dataset/metadata/update {documentId,metadata}；
        流式检索：GET /api/knowledge/dataset/querySSE?keywords=（现有非流式 /api/knowledge/dataset/query 已在前端接入）。
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
            <el-select v-model="uploadChapterId" placeholder="选择章节" style="width: 100%;" no-data-text="章节数据待接口提供">
              <el-option v-for="c in chapterOptions" :key="c.id" :label="c.title" :value="c.id" />
            </el-select>
          </div>
          <div class="form-item form-item--sm">
            <label class="form-label">文档类型 contentType</label>
            <el-select v-model="textForm.contentType" :disabled="uploadMode === 'file'" style="width: 100%;">
              <el-option value="TEXT" label="正文" />
              <el-option value="EXAMPLE" label="代码示例" />
              <el-option value="DIAGRAM" label="图表说明" />
            </el-select>
          </div>
          <div class="form-item form-item--sm">
            <label class="form-label">起始页码 page</label>
            <el-input-number v-model="textForm.page" :min="1" :disabled="uploadMode === 'file'" style="width: 100%;" />
          </div>
        </div>

        <!-- 文件入口 -->
        <label v-if="uploadMode === 'file'" class="upload-drop">
          <CloudUpload :size="24" style="color: var(--text-tertiary);" />
          <span v-if="!selectedFile">点击选择教材文件（PDF / DOCX / MD / TXT）</span>
          <span v-else class="upload-file">{{ selectedFile.name }}（{{ fmtSize(selectedFile.size) }}）</span>
          <input type="file" accept=".pdf,.docx,.md,.txt" style="display: none;" @change="onFileChange" />
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
          <button class="st-btn st-btn--primary" :disabled="!canSubmit" @click="handleUpload">
            <CloudUpload :size="14" /> 提交上传
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
          <p class="st-card__hint">命中 {{ records.length }} 条 · 接口预留，暂无数据来源</p>
        </div>
      </div>
      <div class="st-card__body filter-row">
        <div class="search-box">
          <Search :size="14" />
          <input v-model="filter.recordId" class="search-input" placeholder="按 recordId 追溯" />
        </div>
        <el-select v-model="filter.status" placeholder="状态" style="width: 130px;">
          <el-option value="" label="全部状态" />
          <el-option value="0" label="处理中" />
          <el-option value="1" label="成功" />
          <el-option value="2" label="失败" />
        </el-select>
        <input v-model="filter.uploadBy" class="form-input form-input--w" placeholder="操作人 uploadBy" />
        <input v-model="filter.startTime" class="form-input form-input--w" type="date" />
        <input v-model="filter.endTime" class="form-input form-input--w" type="date" />
        <button class="st-btn st-btn--secondary" @click="handleQuery">查询</button>
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
              <th style="width: 80px;">耗时</th>
              <th style="width: 100px;">操作人</th>
              <th style="width: 200px;">错误信息</th>
              <th style="width: 110px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="r.recordId">
              <td class="muted">{{ r.chapterTitle || '—' }}</td>
              <td>
                <div>{{ r.documentName }}</div>
                <div class="record-id">{{ r.recordId }}</div>
              </td>
              <td class="muted mono">{{ fmtSize(r.fileSize) }}</td>
              <td><span class="st-badge st-badge--outline">{{ r.contentType }}</span></td>
              <td>
                <span class="st-badge" :class="STATUS_META[r.status]?.badge ?? 'st-badge--neutral'">
                  {{ r.statusDesc || STATUS_META[r.status]?.label || '未知' }}
                </span>
              </td>
              <td class="mono">{{ r.segmentCount }}</td>
              <td class="muted mono">{{ fmtElapsed(r.elapsedMs) }}</td>
              <td class="muted">{{ r.uploadBy || '—' }}</td>
              <td class="error-cell">{{ r.errorMsg || '—' }}</td>
              <td style="text-align: right;">
                <button class="st-text-btn" @click="handleMetadata(r)">元数据</button>
              </td>
            </tr>
            <template v-if="records.length === 0">
              <tr v-for="n in 4" :key="`du-ph-${n}`">
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar skeleton-bar--wide" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="records.length === 0" class="st-empty">
          <History :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无上传记录 · 接口预留：GET /api/knowledge/dataset/upload/list</div>
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
  justify-content: flex-end;
  gap: 10px;
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

.skeleton-bar {
  display: inline-block;
  height: 10px;
  width: 100%;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
}

.skeleton-bar--sm {
  width: 70%;
}

.skeleton-bar--xs {
  width: 45%;
}

.skeleton-bar--wide {
  width: 85%;
}
</style>
