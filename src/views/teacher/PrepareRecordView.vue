<script setup lang="ts">
/**
 * 备课记录（接真实接口）
 * - GET /api/teach/prepare/record/list     本人成功备课记录分页（chapterId 可选筛选）
 * - GET /api/teach/prepare/record/detail   五类材料全文（教案/重难点/课后习题/上机实训/PPT 原文）
 * - GET /api/teach/prepare/record/export   教案导出 Word 文件流（.docx）
 * - GET /api/teach/ppt/download            下载备课生成的 PPT（成功后后端自增下载计数）
 *
 * 分页口径注意：本模块返回的是 pageNum / pageSize，与 class、upload 等模块的 current / size 不同。
 */
import { computed, onMounted, ref } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileDown,
  Loader2,
  Search,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapters } from '@/api/knowledge';
import { downloadPpt, exportLessonPlan, fetchPrepareRecordDetail, fetchPrepareRecords } from '@/api/teacher';
import type { Chapter } from '@/types/knowledge';
import type { PrepareRecordDetail, PrepareRecordItem } from '@/types/teacher';
import { renderMarkdown } from '@/utils/markdown';

const chapters = ref<Chapter[]>([]);
const records = ref<PrepareRecordItem[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const filterChapterId = ref<number | null>(null);

const listLoading = ref(false);
const exportingId = ref<number | null>(null);
const downloadingId = ref<number | null>(null);

const detailVisible = ref(false);
const detail = ref<PrepareRecordDetail | null>(null);
const detailLoading = ref(false);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function chapterTitle(id: number): string {
  const c = chapters.value.find((x) => x.id === id);
  return c ? c.title : `章节 ${id}`;
}

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadRecords() {
  listLoading.value = true;
  try {
    const page = await fetchPrepareRecords({
      chapterId: filterChapterId.value ?? undefined,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    });
    records.value = page.records ?? [];
    total.value = page.total ?? 0;
    pageNum.value = page.pageNum ?? pageNum.value;
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    listLoading.value = false;
  }
}

function search() {
  pageNum.value = 1;
  loadRecords();
}

function goPage(next: number) {
  if (next < 1 || next > pageCount.value) return;
  pageNum.value = next;
  loadRecords();
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleExport(row: PrepareRecordItem) {
  if (!row.hasLessonPlan) {
    ElMessage.info('该记录没有教案内容，无法导出');
    return;
  }
  exportingId.value = row.id;
  try {
    const blob = await exportLessonPlan(row.id);
    saveBlob(blob, `教案_第${row.chapterId}章_${row.id}.docx`);
    ElMessage.success('教案已导出');
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    exportingId.value = null;
  }
}

async function handleDownloadPpt(row: PrepareRecordItem) {
  if (!row.hasPpt) {
    ElMessage.info('该记录尚未生成 PPT 文件');
    return;
  }
  downloadingId.value = row.id;
  try {
    const blob = await downloadPpt(row.id);
    saveBlob(blob, `备课PPT_第${row.chapterId}章_${row.id}.pptx`);
    ElMessage.success('PPT 已下载');
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    downloadingId.value = null;
  }
}

async function openDetail(row: PrepareRecordItem) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await fetchPrepareRecordDetail(row.id);
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    detailLoading.value = false;
  }
}

/** 详情弹窗里的当前行，用于复用列表行的导出 / 下载处理 */
const detailRow = computed(() => (detail.value ? records.value.find((r) => r.id === detail.value!.id) ?? null : null));

const SECTIONS: { key: keyof PrepareRecordDetail; label: string }[] = [
  { key: 'lessonPlan', label: '章节教案' },
  { key: 'keyPoints', label: '重难点清单' },
  { key: 'homework', label: '课后习题' },
  { key: 'lab', label: '上机实训方案' },
  { key: 'pptxMd', label: 'PPT 原始内容' },
];

onMounted(async () => {
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 错误已由响应拦截器统一提示
  }
  loadRecords();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">备课记录</h1>
      <p class="st-page-subtitle">
        只列本人生成成功的备课记录 · 可回看五类材料全文、导出教案 Word、下载课堂 PPT
      </p>
    </header>

    <section class="st-card">
      <div class="st-card__header">
        <ClipboardList :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">记录列表</h2>
          <p class="st-card__hint">GET /api/teach/prepare/record/list · 共 {{ total }} 条</p>
        </div>
        <div class="header-actions">
          <el-select v-model="filterChapterId" placeholder="全部章节" clearable filterable style="width: 200px;">
            <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode || c.id} ${c.title}`" :value="c.id" />
          </el-select>
          <button class="st-btn st-btn--secondary" :disabled="listLoading" @click="search">
            <Loader2 v-if="listLoading" :size="14" class="spin" />
            <Search v-else :size="14" />
            查询
          </button>
        </div>
      </div>

      <div class="st-card__body">
        <div v-if="!listLoading && records.length === 0" class="st-empty">
          <ClipboardList :size="22" class="st-empty__icon" />
          <p class="st-empty__text">该条件下暂无备课记录</p>
        </div>

        <table v-else class="rec-table">
          <thead>
            <tr>
              <th class="col-id">记录 ID</th>
              <th>章节</th>
              <th class="col-time">备课时间</th>
              <th class="col-flags">材料有无</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="r.id">
              <td class="cell-mono">{{ r.id }}</td>
              <td class="cell-name">{{ chapterTitle(r.chapterId) }}</td>
              <td class="cell-secondary">{{ fmt(r.createTime) }}</td>
              <td>
                <div class="flags">
                  <span :class="['st-badge', r.hasLessonPlan ? 'st-badge--neutral' : 'st-badge--outline']">教案</span>
                  <span :class="['st-badge', r.hasKeyPoints ? 'st-badge--neutral' : 'st-badge--outline']">重难点</span>
                  <span :class="['st-badge', r.hasHomework ? 'st-badge--neutral' : 'st-badge--outline']">习题</span>
                  <span :class="['st-badge', r.hasLab ? 'st-badge--neutral' : 'st-badge--outline']">实训</span>
                  <span :class="['st-badge', r.hasPpt ? 'st-badge--dark' : 'st-badge--outline']">
                    {{ r.hasPpt ? 'PPT 已生成' : '无 PPT' }}
                  </span>
                </div>
              </td>
              <td class="cell-ops">
                <button class="st-text-btn" @click="openDetail(r)">详情</button>
                <button
                  class="st-text-btn"
                  :disabled="!r.hasLessonPlan || exportingId === r.id"
                  title="GET /api/teach/prepare/record/export?recordId="
                  @click="handleExport(r)"
                >
                  <Loader2 v-if="exportingId === r.id" :size="12" class="spin" />
                  <FileDown v-else :size="12" />
                  导出教案
                </button>
                <button
                  class="st-text-btn"
                  :disabled="!r.hasPpt || downloadingId === r.id"
                  title="GET /api/teach/ppt/download?recordId="
                  @click="handleDownloadPpt(r)"
                >
                  <Loader2 v-if="downloadingId === r.id" :size="12" class="spin" />
                  <Download v-else :size="12" />
                  下载 PPT
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <footer class="pager">
          <span class="pager__info">第 {{ pageNum }} / {{ pageCount }} 页 · 每页 {{ pageSize }} 条</span>
          <div class="pager__btns">
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1 || listLoading" @click="goPage(pageNum - 1)">
              <ChevronLeft :size="14" /> 上一页
            </button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= pageCount || listLoading" @click="goPage(pageNum + 1)">
              下一页 <ChevronRight :size="14" />
            </button>
          </div>
        </footer>
      </div>
    </section>

    <!-- 详情 -->
    <div v-if="detailVisible" class="overlay" @click.self="detailVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">
              备课记录 #{{ detail?.id }}
              <span v-if="detail" class="dialog__chapter">{{ chapterTitle(detail.chapterId) }}</span>
            </h3>
            <p class="dialog__sub">GET /api/teach/prepare/record/detail?id={{ detail?.id }}</p>
          </div>
          <div class="dialog__head-ops">
            <button
              v-if="detailRow"
              class="st-btn st-btn--ghost"
              :disabled="!detailRow.hasLessonPlan"
              @click="handleExport(detailRow)"
            >
              <FileDown :size="13" /> 导出教案
            </button>
            <button
              v-if="detailRow"
              class="st-btn st-btn--ghost"
              :disabled="!detailRow.hasPpt"
              @click="handleDownloadPpt(detailRow)"
            >
              <Download :size="13" /> 下载 PPT
            </button>
            <button class="st-btn st-btn--secondary" @click="detailVisible = false">关闭</button>
          </div>
        </header>

        <div class="dialog__body">
          <Loader2 v-if="detailLoading" :size="18" class="spin" />
          <template v-else-if="detail">
            <p class="detail-meta">
              备课时间 {{ fmt(detail.createTime) }} ·
              模板 ID {{ detail.templateId ?? '后端未落库（templateId 当前恒为 null）' }}
            </p>
            <a
              v-if="detail.pptxUrl"
              class="detail-path"
              :href="detail.pptxUrl"
              target="_blank"
              rel="noopener"
              title="文件路径直链，下载请走上方的 /api/teach/ppt/download"
            >
              PPT 文件路径：{{ detail.pptxUrl }}
            </a>
            <section v-for="s in SECTIONS" :key="s.key" class="detail-section">
              <h4 class="detail-section__title">{{ s.label }}</h4>
              <div v-if="(detail[s.key] as string)" class="md" v-html="renderMarkdown(detail[s.key] as string)" />
              <p v-else class="detail-section__empty">该记录未生成此类材料</p>
            </section>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 列表 */
.rec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.rec-table th {
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 0 10px 8px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.rec-table td {
  padding: 11px 10px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.rec-table tr:last-child td {
  border-bottom: none;
}

.col-id {
  width: 74px;
}

.col-time {
  width: 140px;
}

.col-flags {
  width: 260px;
}

.col-ops {
  width: 250px;
}

.cell-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.cell-name {
  font-weight: 500;
  color: var(--text-primary);
}

.cell-secondary {
  color: var(--text-secondary);
  font-size: 12.5px;
}

.cell-ops {
  white-space: nowrap;
}

.flags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.pager__info {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.pager__btns {
  display: flex;
  gap: 8px;
}

/* 弹层 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 24px;
}

.dialog {
  width: min(900px, 100%);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
}

.dialog__head > div:first-child {
  flex: 1;
  min-width: 0;
}

.dialog__head-ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.dialog__chapter {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.dialog__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.dialog__body {
  padding: 20px 22px;
  overflow-y: auto;
}

.detail-meta {
  margin: 0 0 6px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.detail-path {
  display: block;
  margin: 0 0 14px;
  font-size: 12px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--text-secondary);
  word-break: break-all;
}

.detail-path:hover {
  color: var(--text-primary);
}

.detail-section {
  padding: 14px 0;
  border-top: 1px solid var(--border-subtle);
}

.detail-section__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.detail-section__empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* Markdown */
.md {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-primary);
  word-break: break-word;
}

.md :deep(.md-h) {
  margin: 14px 0 6px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.md :deep(.md-p) {
  margin: 4px 0;
}

.md :deep(.md-list) {
  margin: 4px 0 8px 20px;
  padding: 0;
}

.md :deep(.md-list li) {
  margin: 2px 0;
}

.md :deep(.md-quote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 2px solid var(--border-strong);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.md :deep(.md-pre) {
  margin: 8px 0;
  padding: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
}

.md :deep(.md-code) {
  padding: 1px 5px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.md :deep(.md-hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--border-default);
}

.md :deep(.md-link) {
  color: var(--text-primary);
  text-decoration: underline;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .st-view {
    padding: 24px 16px;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .dialog__head {
    flex-direction: column;
  }
}
</style>
