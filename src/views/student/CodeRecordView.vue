<script setup lang="ts">
/**
 * 代码运行记录（数据流已接入）
 *
 * 已接桩：待实现 @/api/study.fetchCodeRecords        GET /api/study/code/record/list（分页，列表不含代码大字段）
 * 已接桩：待实现 @/api/study.fetchCodeRecordDetail    GET /api/study/code/record/detail?recordId=
 * 已对接：@/api/knowledge.fetchChapters              GET /api/knowledge/chapter/list（章节筛选下拉）
 *
 * 文档缺口（重要）：后端 openapi 对这两个接口的返回体没有可用描述——
 * 列表项 schema 是空对象、detail 的 data 直接声明成 string，
 * 所以 @/types/study 的 CodeRecordItem / CodeRecordDetail 只是占位类型。
 * 本页对每个字段都做容错取值（对象/别名都试一遍，取不到显示「—」），
 * 界面上也明确标注「字段以联调结果为准」，联调后请收紧类型与取值键名。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Clock,
  Code2,
  History,
  Loader2,
  RotateCcw,
  Search,
  X,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapters } from '@/api/knowledge';
import { fetchCodeRecordDetail, fetchCodeRecords } from '@/api/study';
import type { Chapter } from '@/types/knowledge';
import type { CodeRecordItem } from '@/types/study';

/** 判题状态中文口径（与代码实操页一致），后端为力扣式字符串 */
const STATUS_META: Record<string, { label: string; badge: string }> = {
  AC: { label: '通过', badge: 'st-badge--success' },
  WA: { label: '答案错误', badge: 'st-badge--danger' },
  TLE: { label: '运行超时', badge: 'st-badge--warning' },
  MLE: { label: '内存超限', badge: 'st-badge--warning' },
  RE: { label: '运行异常', badge: 'st-badge--danger' },
  CE: { label: '编译错误', badge: 'st-badge--danger' },
  OLE: { label: '输出超限', badge: 'st-badge--warning' },
  SV: { label: '安全违规', badge: 'st-badge--danger' },
  SE: { label: '系统错误', badge: 'st-badge--danger' },
};

const PAGE_SIZES = [10, 20, 50];

const router = useRouter();

const chapters = ref<Chapter[]>([]);

/** 筛选：章节 / 题目 ID（CodeRecordQuery 只支持这两个维度） */
const filters = ref({ chapterId: 0 as number, questionId: undefined as number | undefined, pageNum: 1, pageSize: 10 });

const records = ref<CodeRecordItem[]>([]);
const total = ref<number | null>(null);
const loading = ref(false);
const listError = ref<string | null>(null);

const detailVisible = ref(false);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);
const detail = ref<unknown>(null);
const activeRecordId = ref<number | null>(null);

const pageCount = computed(() => {
  const t = total.value;
  if (t === null || t <= 0) return 0;
  return Math.max(1, Math.ceil(t / filters.value.pageSize));
});

// ==================== 逐字段容错取值 ====================

type Loose = Record<string, unknown>;

function describeError(apiPath: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return /未实现/.test(msg) ? `接口待实现：${apiPath}` : `接口调用失败：${apiPath}（${msg}）`;
}

function asLoose(v: unknown): Loose | null {
  return v !== null && typeof v === 'object' ? (v as Loose) : null;
}

/** 依次尝试多个候选键名（后端字段名未定，联调后收敛成单一键名） */
function pick(rec: unknown, keys: string[]): unknown {
  const o = asLoose(rec);
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** 文本字段：取不到给「—」；对象/数组转成可读 JSON 片段 */
function fieldText(rec: unknown, keys: string[], fallback = '—'): string {
  const v = pick(rec, keys);
  if (v === undefined) return fallback;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function fieldNum(rec: unknown, keys: string[]): number | null {
  const v = pick(rec, keys);
  if (v === undefined) return null;
  const n = Number(typeof v === 'string' ? v.replace(/[^\d.-]/g, '') : v);
  return Number.isFinite(n) ? n : null;
}

function fieldArray(rec: unknown, keys: string[]): unknown[] {
  const v = pick(rec, keys);
  return Array.isArray(v) ? v : [];
}

/** 记录主键：列表项 schema 为空对象，id / recordId / runId 都可能是真身 */
function recordIdOf(rec: unknown): number | null {
  return fieldNum(rec, ['recordId', 'id', 'runId', 'codeRecordId']);
}

function chapterNameOf(rec: unknown): string {
  const name = fieldText(rec, ['chapterName', 'chapterTitle', 'title'], '');
  if (name) return name;
  const cid = fieldNum(rec, ['chapterId']);
  if (cid === null) return '未关联章节';
  return chapters.value.find((c) => c.id === cid)?.title ?? `章节 ${cid}`;
}

function statusOf(rec: unknown): string {
  return fieldText(rec, ['status'], '');
}

function statusLabel(status: string): string {
  if (!status) return '—';
  return STATUS_META[status]?.label ?? status;
}

function statusBadge(status: string): string {
  if (!status) return 'st-badge--neutral';
  return STATUS_META[status]?.badge ?? 'st-badge--neutral';
}

function fmt(iso: unknown): string {
  const raw = typeof iso === 'string' || typeof iso === 'number' ? iso : undefined;
  if (raw === undefined) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==================== 取数 ====================

async function loadChapters() {
  try {
    chapters.value = await fetchChapters();
  } catch {
    chapters.value = [];
  }
}

async function loadList() {
  loading.value = true;
  listError.value = null;
  try {
    const page = await fetchCodeRecords({
      chapterId: filters.value.chapterId || undefined,
      questionId: filters.value.questionId || undefined,
      pageNum: filters.value.pageNum,
      pageSize: filters.value.pageSize,
    });
    records.value = Array.isArray(page?.records) ? page.records : [];
    total.value = Number(page?.total ?? records.value.length);
  } catch (e) {
    records.value = [];
    total.value = null;
    listError.value = describeError('@/api/study.fetchCodeRecords', e);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  filters.value.pageNum = 1;
  void loadList();
}

function goPage(next: number) {
  const max = pageCount.value || 1;
  if (next < 1 || next > max || next === filters.value.pageNum) return;
  filters.value.pageNum = next;
  void loadList();
}

/** 详情：data 被后端声明成 string，先原样收下，能解析成对象再走容错取值 */
async function openDetail(rec: unknown) {
  const id = recordIdOf(rec);
  if (id === null) {
    ElMessage.warning('该记录缺少主键（后端列表 schema 为空对象），无法查详情');
    return;
  }
  activeRecordId.value = id;
  detailVisible.value = true;
  detailLoading.value = true;
  detailError.value = null;
  detail.value = null;
  try {
    const data = await fetchCodeRecordDetail(id);
    const parsed = typeof data === 'string' ? parseMaybeJson(data) : data;
    detail.value = parsed ?? data;
    if (parsed === null && typeof data === 'string') {
      detailError.value = '详情返回的是纯文本（openapi 把 data 声明成 string），已按原文展示';
    }
  } catch (e) {
    detailError.value = describeError('@/api/study.fetchCodeRecordDetail', e);
  } finally {
    detailLoading.value = false;
  }
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const detailAsText = computed(() => (typeof detail.value === 'string' ? detail.value : ''));

/** 用例明细：键名与元素结构都未定，逐项容错 */
const detailCases = computed(() =>
  fieldArray(detail.value, ['testResults', 'caseResults', 'cases', 'testCases']).map((c, i) => ({
    index: fieldNum(c, ['caseIndex', 'index', 'no', 'id']) ?? i + 1,
    passed: fieldNum(c, ['passed', 'pass', 'result']),
    input: fieldText(c, ['input', 'stdin']),
    expected: fieldText(c, ['expectedOutput', 'expected', 'output']),
    actual: fieldText(c, ['actualOutput', 'userOutput', 'output']),
    error: fieldText(c, ['errorMsg', 'error', 'message']),
    raw: typeof c === 'string' ? c : '',
  })),
);

const detailKnowledgePoints = computed(() =>
  fieldArray(detail.value, ['knowledgePoints', 'knowledgePointList'])
    .map((k) => (typeof k === 'string' ? k : fieldText(k, ['name', 'title'])))
    .filter((k) => k && k !== '—'),
);

const detailErrorLines = computed<number[]>(() => {
  const single = fieldNum(detail.value, ['errorLine']);
  const list = fieldArray(detail.value, ['errorLineList']);
  const set = new Set<number>();
  if (single !== null && single > 0) set.add(single);
  for (const v of list) {
    const n = Number(String(v).replace(/[^\d]/g, ''));
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
});

onMounted(async () => {
  await loadChapters();
  await loadList();
});
</script>

<template>
  <div class="st-view">
    <div class="detail-topbar">
      <button class="st-text-btn" @click="router.push('/student/code')">
        <ArrowLeft :size="14" style="margin-right: 4px;" /> 返回代码实操
      </button>
    </div>

    <header class="st-page-header">
      <h1 class="st-page-title">代码运行记录</h1>
      <p class="st-page-subtitle">每次提交后端编译运行的判题留痕 · 可查看历史代码、用例明细与 AI 调试字段</p>
    </header>

    <!-- 文档缺口提示 -->
    <div class="st-card notice-card">
      <div class="st-card__body notice-row">
        <CircleAlert :size="15" class="notice-icon" />
        <p class="notice-text">
          后端 openapi 对 code/record/list 的列表项 schema 是空对象、code/record/detail 的 data 声明成 string，
          属文档缺口。本页字段全部按候选键名容错取值，取不到即显示「—」，
          <strong>具体字段以联调结果为准</strong>；列表接口也不返回代码大字段，代码只在详情里给出。
        </p>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="st-card filter-card">
      <div class="st-card__body filter-row">
        <el-select v-model="filters.chapterId" style="width: 220px;" size="default" @change="applyFilters">
          <el-option label="全部章节" :value="0" />
          <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode} ${c.title}`" :value="c.id" />
        </el-select>
        <el-input-number
          v-model="filters.questionId"
          :min="1"
          :controls="false"
          placeholder="questionId"
          style="width: 140px;"
        />
        <el-select v-model="filters.pageSize" style="width: 120px;" size="default" @change="applyFilters">
          <el-option v-for="s in PAGE_SIZES" :key="s" :label="`${s} 条/页`" :value="s" />
        </el-select>
        <button class="st-btn st-btn--secondary" :disabled="loading" @click="applyFilters">
          <Search :size="13" /> 查询
        </button>
        <span class="filter-count">共 {{ total === null ? '—' : total }} 条</span>
        <button class="st-btn st-btn--secondary" :disabled="loading" @click="loadList">
          <Loader2 v-if="loading" :size="14" class="spin" />
          <RotateCcw v-else :size="13" />
          重新加载
        </button>
      </div>
    </div>

    <!-- 列表 -->
    <section class="st-card">
      <div class="st-card__header">
        <Code2 :size="15" class="card-icon" />
        <div>
          <h2 class="st-card__title">运行记录列表</h2>
          <p class="st-card__hint">已接桩：待实现 @/api/study.fetchCodeRecords · PageResponse&lt;CodeRecordItem&gt;</p>
        </div>
      </div>
      <div class="st-card__body" style="padding-top: 12px;">
        <div v-if="loading" class="st-empty">
          <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
          <div class="st-empty__text">加载中…</div>
        </div>
        <div v-else-if="listError" class="st-empty">
          <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">{{ listError }}</div>
          <button class="st-btn st-btn--secondary" @click="loadList">重新加载</button>
        </div>
        <div v-else-if="records.length === 0" class="st-empty">
          <History :size="32" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">该筛选条件下暂无运行记录</div>
          <button class="st-btn st-btn--secondary" @click="loadList">重新加载</button>
        </div>

        <table v-else class="record-table">
          <thead>
            <tr>
              <th class="col-id">记录 ID</th>
              <th>章节</th>
              <th class="col-status">状态</th>
              <th class="col-case">用例</th>
              <th class="col-score">得分</th>
              <th class="col-num">耗时</th>
              <th class="col-num">内存</th>
              <th class="col-time">时间</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in records" :key="recordIdOf(r) ?? i">
              <td class="cell-mono">{{ recordIdOf(r) ?? '—' }}</td>
              <td class="cell-name">{{ chapterNameOf(r) }}</td>
              <td>
                <span class="st-badge" :class="statusBadge(statusOf(r))">{{ statusLabel(statusOf(r)) }}</span>
              </td>
              <td class="cell-mono">{{ fieldNum(r, ['passedCount', 'passCount']) ?? '—' }} / {{ fieldNum(r, ['totalCount', 'caseCount']) ?? '—' }}</td>
              <td class="cell-mono">{{ fieldNum(r, ['score']) ?? '—' }}</td>
              <td class="cell-mono">{{ fieldNum(r, ['runDuration', 'duration', 'timeUsed']) ?? '—' }} ms</td>
              <td class="cell-mono">{{ fieldNum(r, ['memoryUsed', 'memory']) ?? '—' }} KB</td>
              <td class="cell-secondary">
                <Clock :size="11" style="vertical-align: -1px;" />
                {{ fmt(pick(r, ['createTime', 'runTime', 'lastRunTime', 'updateTime'])) }}
              </td>
              <td class="cell-ops">
                <button class="st-text-btn" @click="openDetail(r)">查看详情</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!loading && pageCount > 0" class="pager">
          <button class="st-text-btn" :disabled="filters.pageNum <= 1" @click="goPage(filters.pageNum - 1)">上一页</button>
          <span class="pager__info">第 {{ filters.pageNum }} / {{ pageCount }} 页</span>
          <button class="st-text-btn" :disabled="filters.pageNum >= pageCount" @click="goPage(filters.pageNum + 1)">下一页</button>
        </div>
      </div>
    </section>

    <!-- 详情弹窗 -->
    <div v-if="detailVisible" class="overlay" @click.self="detailVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">运行详情 #{{ activeRecordId ?? '—' }}</h3>
            <p class="dialog__sub">
              已接桩：待实现 @/api/study.fetchCodeRecordDetail · 字段以联调结果为准
            </p>
          </div>
          <button class="st-btn st-btn--ghost" @click="detailVisible = false">
            <X :size="14" /> 关闭
          </button>
        </header>

        <div class="dialog__body">
          <div v-if="detailLoading" class="st-empty">
            <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
            <div class="st-empty__text">详情加载中…</div>
          </div>
          <div v-else-if="detailError && detail === null" class="st-empty">
            <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">{{ detailError }}</div>
            <button class="st-btn st-btn--secondary" @click="loadList">重新加载列表</button>
          </div>

          <template v-else>
            <p v-if="detailError" class="notice-inline">{{ detailError }}</p>

            <!-- 判题指标 -->
            <div class="detail-metrics">
              <span class="st-badge" :class="statusBadge(statusOf(detail))">{{ statusLabel(statusOf(detail)) }}</span>
              <span class="st-badge st-badge--neutral">{{ fieldText(detail, ['statusDesc'], '—') }}</span>
              <span class="st-badge st-badge--outline">
                用例 {{ fieldNum(detail, ['passedCount', 'passCount']) ?? '—' }} / {{ fieldNum(detail, ['totalCount', 'caseCount']) ?? '—' }}
              </span>
              <span class="st-badge st-badge--outline">得分 {{ fieldNum(detail, ['score']) ?? '—' }}</span>
              <span class="st-badge st-badge--outline">{{ fieldNum(detail, ['runDuration', 'duration']) ?? '—' }} ms</span>
              <span class="st-badge st-badge--outline">{{ fieldNum(detail, ['memoryUsed']) ?? '—' }} KB</span>
            </div>

            <!-- 代码 -->
            <div class="detail-block">
              <div class="detail-block__head">提交的代码</div>
              <div class="code-box st-code">
                <pre>{{ fieldText(detail, ['codeContent', 'code', 'sourceCode'], '— 后端未返回代码内容 —') }}</pre>
              </div>
            </div>

            <!-- 输出 -->
            <div class="detail-block">
              <div class="detail-block__head">标准输出</div>
              <div class="code-box st-code">
                <pre>{{ fieldText(detail, ['output', 'standardOutput']) }}</pre>
              </div>
            </div>

            <!-- 错误 -->
            <div class="detail-block">
              <div class="detail-block__head">
                <CircleAlert :size="13" /> 错误信息
                <span v-if="detailErrorLines.length" class="head-tip">第 {{ detailErrorLines.join('、') }} 行</span>
              </div>
              <div class="error-text">{{ fieldText(detail, ['errorMsg', 'errorMessage'], '无') }}</div>
              <p v-if="fieldText(detail, ['errorReason']) !== '—'" class="detail-text">{{ fieldText(detail, ['errorReason']) }}</p>
            </div>

            <!-- 用例明细 -->
            <div class="detail-block">
              <div class="detail-block__head">
                用例明细
                <span v-if="detailCases.length === 0" class="head-tip">后端未返回用例数组</span>
              </div>
              <div v-if="detailCases.length === 0" class="st-empty" style="padding: 16px;">
                <div class="st-empty__text">—</div>
              </div>
              <table v-else class="case-table">
                <thead>
                  <tr>
                    <th class="col-id2">用例</th>
                    <th class="col-res2">结果</th>
                    <th>输入</th>
                    <th>期望输出</th>
                    <th>实际输出</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in detailCases" :key="c.index">
                    <td class="cell-mono">{{ c.index }}</td>
                    <td>
                      <span
                        v-if="c.passed !== null"
                        class="st-badge"
                        :class="Number(c.passed) === 1 ? 'st-badge--success' : 'st-badge--danger'"
                      >
                        {{ Number(c.passed) === 1 ? '通过' : '未通过' }}
                      </span>
                      <span v-else class="st-badge st-badge--neutral">—</span>
                    </td>
                    <td class="cell-code st-code">{{ c.input }}</td>
                    <td class="cell-code st-code">{{ c.expected }}</td>
                    <td class="cell-code st-code">{{ c.actual }}</td>
                    <td class="cell-code">{{ c.raw || c.error }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- AI 调试字段 -->
            <div class="detail-block">
              <div class="detail-block__head">
                <CircleCheck :size="13" /> AI 调试与学习建议
              </div>
              <div class="ai-grid">
                <div class="ai-item">
                  <div class="ai-item__label">优化建议 optimizeSuggest</div>
                  <div class="ai-item__value">{{ fieldText(detail, ['optimizeSuggest']) }}</div>
                </div>
                <div class="ai-item">
                  <div class="ai-item__label">参考思路 standardIdea</div>
                  <div class="ai-item__value">{{ fieldText(detail, ['standardIdea']) }}</div>
                </div>
                <div class="ai-item">
                  <div class="ai-item__label">学习建议 learningSuggestion</div>
                  <div class="ai-item__value">{{ fieldText(detail, ['learningSuggestion']) }}</div>
                </div>
                <div class="ai-item">
                  <div class="ai-item__label">鼓励语 encouragement</div>
                  <div class="ai-item__value">{{ fieldText(detail, ['encouragement']) }}</div>
                </div>
              </div>
              <div v-if="detailKnowledgePoints.length" class="kp-row">
                <span v-for="kp in detailKnowledgePoints" :key="kp" class="st-badge st-badge--neutral">{{ kp }}</span>
              </div>
            </div>

            <!-- 原文兜底：data 是字符串时给出裸文本 -->
            <div v-if="detailAsText" class="detail-block">
              <div class="detail-block__head">后端原始返回（data 为 string）</div>
              <div class="code-box st-code"><pre>{{ detailAsText }}</pre></div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-topbar {
  margin-bottom: 12px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.notice-card {
  margin-bottom: 16px;
}

.notice-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding-top: 16px;
  padding-bottom: 16px;
}

.notice-icon {
  color: var(--status-warning);
  flex-shrink: 0;
  margin-top: 2px;
}

.notice-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.notice-inline {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--status-warning);
  background: var(--status-warning-bg);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}

.filter-card {
  margin-bottom: 16px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 14px;
  padding-bottom: 14px;
}

.filter-count {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* 表格 */
.record-table,
.case-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.record-table th,
.case-table th {
  text-align: left;
  font-weight: 600;
  font-size: 11.5px;
  color: var(--text-tertiary);
  padding: 0 10px 8px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.record-table td,
.case-table td {
  padding: 10px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
}

.record-table tr:last-child td,
.case-table tr:last-child td {
  border-bottom: none;
}

.col-id {
  width: 78px;
}

.col-id2 {
  width: 60px;
}

.col-status {
  width: 96px;
}

.col-case,
.col-score,
.col-num {
  width: 88px;
}

.col-time {
  width: 132px;
}

.col-ops,
.col-res2 {
  width: 90px;
}

.cell-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.cell-ops {
  white-space: nowrap;
}

.cell-code {
  word-break: break-all;
  line-height: 1.55;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.pager__info {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 弹窗 */
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
  width: min(940px, 100%);
  max-height: 86vh;
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

.dialog__head > div {
  flex: 1;
  min-width: 0;
}

.dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.dialog__body {
  padding: 20px 22px;
  overflow-y: auto;
}

.detail-metrics {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-block {
  margin-bottom: 18px;
}

.detail-block__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.head-tip {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.code-box {
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  max-height: 280px;
  overflow: auto;
}

.code-box pre {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.error-text {
  font-size: 12.5px;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  white-space: pre-wrap;
}

.detail-text {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
}

.ai-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

@media (max-width: 768px) {
  .ai-grid {
    grid-template-columns: 1fr;
  }
}

.ai-item {
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.ai-item__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 6px;
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.ai-item__value {
  font-size: 12.5px;
  color: var(--text-primary);
  line-height: 1.65;
  white-space: pre-wrap;
}

.kp-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
