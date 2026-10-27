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
import { isBlankDocx, saveBlob, saveHtmlAsWord } from '@/utils/download';
import { renderMarkdown } from '@/utils/markdown';
import PrepareMaterialModal from '@/components/teacher/PrepareMaterialModal.vue';

const chapters = ref<Chapter[]>([]);
const records = ref<PrepareRecordItem[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const filterChapterId = ref<number | null>(null);

const listLoading = ref(false);
const exportingId = ref<number | string | null>(null);
const downloadingId = ref<number | string | null>(null);

const detailVisible = ref(false);
const detail = ref<PrepareRecordDetail | null>(null);
const detailLoading = ref(false);
/** 点击「详情」时的那一行：材料有无、记录 ID 都以它为准，避免详情返回的 id 与列表不一致时取错行 */
const detailRecord = ref<PrepareRecordItem | null>(null);
/** 当前 detail 数据对应的记录 ID，用于避免把上一条记录的内容当成兜底导出素材 */
const detailForId = ref<number | string | null>(null);
/** 详情请求序号：连续点开多条记录时只认最后一次响应，防止旧响应覆盖新记录 */
let detailSeq = 0;

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

async function handleExport(row: PrepareRecordItem) {
  if (!row.hasLessonPlan) {
    ElMessage.info('该记录没有教案内容，无法导出');
    return;
  }
  exportingId.value = row.id;
  try {
    const blob = await exportLessonPlan(row.id);
    if (!(await isBlankDocx(blob))) {
      saveBlob(blob, `教案_第${row.chapterId}章_${row.id}.docx`);
      ElMessage.success('教案已导出');
      return;
    }
    // 后端返回的是空白 Word：改用本次记录已加载的教案全文在本地生成，保证文件有内容
    const markdown = await resolveLessonPlan(row.id);
    if (!markdown) {
      ElMessage.error('导出失败：该记录的教案内容为空');
      return;
    }
    saveHtmlAsWord(
      renderMarkdown(markdown),
      `教案 - ${chapterTitle(row.chapterId)}`,
      `教案_第${row.chapterId}章_${row.id}.doc`,
    );
    ElMessage.success('教案已导出');
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    exportingId.value = null;
  }
}

/** 兜底导出用的教案全文：优先复用当前详情，避免重复请求；记录不一致时再按 ID 拉取 */
async function resolveLessonPlan(recordId: number | string): Promise<string> {
  if (detailForId.value === recordId && detail.value?.lessonPlan) {
    return detail.value.lessonPlan.trim();
  }
  try {
    const fetched = await fetchPrepareRecordDetail(recordId);
    return (fetched.lessonPlan ?? '').trim();
  } catch {
    return '';
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
  detailForId.value = null;
  detailRecord.value = row;

  const seq = ++detailSeq;
  try {
    const data = await fetchPrepareRecordDetail(row.id);
    if (seq !== detailSeq) return; // 已切换到别的记录，丢弃过期响应
    detail.value = data;
    detailForId.value = row.id;
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    if (seq === detailSeq) detailLoading.value = false;
  }
}

/** 关闭时作废在途请求，下一次打开会重新拉取 */
function closeDetail() {
  detailSeq += 1;
  detailLoading.value = false;
  detailVisible.value = false;
}

function exportDetail() {
  if (detailRecord.value) handleExport(detailRecord.value);
}

function downloadDetailPpt() {
  if (detailRecord.value) handleDownloadPpt(detailRecord.value);
}

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
          <p class="st-card__hint">只列出你自己备课成功的记录 · 共 {{ total }} 条</p>
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
              <th>章节</th>
              <th class="col-time">备课时间</th>
              <th class="col-flags">材料有无</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in records" :key="String(r.id)">
              <td class="cell-name">{{ chapterTitle(r.chapterId) }}</td>
              <td class="cell-secondary">{{ fmt(r.createTime) }}</td>
              <td>
                <div class="flags">
                  <span :class="['st-badge', r.hasLessonPlan ? 'st-badge--neutral' : 'st-badge--outline']">教案</span>
                  <span :class="['st-badge', r.hasKeyPoints ? 'st-badge--neutral' : 'st-badge--outline']">重难点</span>
                  <span :class="['st-badge', r.hasHomework ? 'st-badge--neutral' : 'st-badge--outline']">习题</span>
                  <span :class="['st-badge', r.hasLab ? 'st-badge--neutral' : 'st-badge--outline']">实训</span>
                  <span :class="['st-badge', r.hasPpt ? 'st-badge--dark' : 'st-badge--outline']">
                    {{ r.hasPpt ? 'PPT 已生成' : '无 PPT 文件' }}
                  </span>
                </div>
              </td>
              <td class="cell-ops">
                <button class="st-text-btn" @click="openDetail(r)">详情</button>
                <button
                  class="st-text-btn"
                  :disabled="!r.hasLessonPlan || exportingId === r.id"
                  @click="handleExport(r)"
                >
                  <Loader2 v-if="exportingId === r.id" :size="12" class="spin" />
                  <FileDown v-else :size="12" />
                  导出教案
                </button>
                <button
                  class="st-text-btn"
                  :disabled="!r.hasPpt || downloadingId === r.id"
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

    <!-- 详情：多卡片浮层，无整体白色弹窗底板 -->
    <PrepareMaterialModal
      :open="detailVisible"
      :loading="detailLoading"
      :detail="detail"
      :chapter-title="detailRecord ? chapterTitle(detailRecord.chapterId) : ''"
      :time-text="detailRecord ? fmt(detailRecord.createTime) : ''"
      :row="detailRecord"
      :exporting="exportingId === detailRecord?.id"
      :downloading="downloadingId === detailRecord?.id"
      @close="closeDetail"
      @export="exportDetail"
      @download="downloadDetailPpt"
    />
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

.col-time {
  width: 140px;
}

.col-flags {
  width: 260px;
}

.col-ops {
  width: 250px;
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
}
</style>
