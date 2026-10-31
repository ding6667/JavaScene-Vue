<script setup lang="ts">
/**
 * 题库选题面板（作业发布页、题库页共用）
 * - 按条件选题：章节树（与备课页同一套逻辑）/ 题型 / 难度 / 关键词，逐题勾选
 * - 随机抽题：按「题型 + 难度档 + 数量」配比抽题，勾中即并入已选
 * - 已选题目通过 v-model 交给父级，由父级决定是布置作业还是直接发布
 * 难度一律来自 /api/exam/difficulty-config/list，前端不硬编码档位。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Loader2, Plus, Search, Shuffle, Trash2 } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchQuestionAdminList, randomQuestions } from '@/api/exam';
import ChapterSelect from '@/components/ChapterSelect.vue';
import { useChapters } from '@/composables/useChapters';
import { useDifficultyConfigs } from '@/composables/useDifficultyConfigs';
import type { QuestionAdminItem, RandomDifficultyAllocation, RandomTypeAllocation } from '@/types/exam';
import { TYPE_LABELS, toEntries, typeLabel } from '@/utils/questionCode';

const props = defineProps<{
  /** 已选题目（父级持有，面板只负责增删） */
  modelValue: QuestionAdminItem[];
  /** 默认按这个章节筛选题目 / 抽题 */
  initialChapterId?: number | null;
}>();

const emit = defineEmits<{ 'update:modelValue': [QuestionAdminItem[]] }>();

const TYPE_OPTIONS = toEntries(TYPE_LABELS);

const tab = ref<'pick' | 'random'>('pick');
/** 章节数据由 useChapters 统一提供（<ChapterSelect> 内部也会自动加载） */
const { load: loadChapters } = useChapters();

const difficultyStore = useDifficultyConfigs();
const difficultyOptions = difficultyStore.options;
const difficultyText = difficultyStore.difficultyText;

const selected = computed(() => props.modelValue);
const selectedIds = computed(() => new Set(selected.value.map((q) => Number(q.id))));
const selectedScore = computed(() =>
  selected.value.reduce((sum, q) => sum + (Number(q.score) || 0), 0),
);

// ==================== 按条件选题 ====================
const filters = reactive({
  chapterId: (props.initialChapterId ?? null) as number | null,
  type: 0,
  difficultyConfigId: 0,
  keyword: '',
});
const records = ref<QuestionAdminItem[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const listLoading = ref(false);
const listError = ref('');
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));

async function loadList() {
  listLoading.value = true;
  listError.value = '';
  try {
    const res = await fetchQuestionAdminList({
      chapterId: filters.chapterId ?? undefined,
      type: filters.type || undefined,
      difficultyConfigId: filters.difficultyConfigId || undefined,
      keyword: filters.keyword.trim() || undefined,
      pageNum: page.value,
      pageSize: size.value,
    });
    records.value = res.records ?? [];
    total.value = res.total ?? 0;
    if (res.current) page.value = res.current;
    if (res.size) size.value = res.size;
  } catch (e: unknown) {
    records.value = [];
    total.value = 0;
    listError.value = (e as Error)?.message ?? '题目列表加载失败';
  } finally {
    listLoading.value = false;
  }
}

function search() {
  page.value = 1;
  loadList();
}

function goPage(next: number) {
  if (next < 1 || next > pageCount.value || listLoading.value) return;
  page.value = next;
  loadList();
}

// ==================== 随机抽题（题型 + 难度档配比） ====================
interface AllocationRow {
  type: number;
  /** null = 不限难度，按该题型整体随机 */
  difficultyConfigId: number | null;
  count: number;
}

const randChapterId = ref<number | null>(props.initialChapterId ?? null);
const allocRows = reactive<AllocationRow[]>([{ type: 1, difficultyConfigId: null, count: 5 }]);
const randResult = ref<QuestionAdminItem[]>([]);
const randLoading = ref(false);
const randError = ref('');
const randSummary = ref('');
/** 配比里请求的总题数，用于提示「实抽 / 请求」 */
const requestedTotal = computed(() =>
  allocRows.reduce((sum, r) => sum + (Number(r.count) || 0), 0),
);

function addAllocRow() {
  if (allocRows.length >= 12) return;
  allocRows.push({ type: 1, difficultyConfigId: null, count: 1 });
}

function removeAllocRow(index: number) {
  if (allocRows.length <= 1) return;
  allocRows.splice(index, 1);
}

/** 同一题型的多行合成一个 typeAllocations 元素：有难度档就带 difficultyAllocations */
function buildAllocations(): RandomTypeAllocation[] {
  const byType = new Map<number, { plain: number; diffs: RandomDifficultyAllocation[] }>();
  for (const row of allocRows) {
    const count = Number(row.count) || 0;
    if (count <= 0) continue;
    const bucket = byType.get(row.type) ?? { plain: 0, diffs: [] };
    if (row.difficultyConfigId == null) bucket.plain += count;
    else bucket.diffs.push({ difficultyConfigId: row.difficultyConfigId, count });
    byType.set(row.type, bucket);
  }
  return [...byType.entries()].map(([type, v]) => ({
    type,
    // 配了难度档时后端以各档数量为准，顶层 count 忽略；没配就用整体随机
    count: v.diffs.length ? undefined : v.plain,
    difficultyAllocations: v.diffs.length ? v.diffs : undefined,
  }));
}

async function runRandom() {
  if (randLoading.value) return;
  if (randChapterId.value == null) {
    ElMessage.warning('随机抽题前请先选择章节');
    return;
  }
  const typeAllocations = buildAllocations();
  if (!typeAllocations.length || typeAllocations.every((t) => !t.count && !t.difficultyAllocations?.length)) {
    ElMessage.warning('请至少配置一条题量（题型 + 数量）');
    return;
  }
  randLoading.value = true;
  randError.value = '';
  randSummary.value = '';
  try {
    const list = await randomQuestions({ chapterId: randChapterId.value, typeAllocations });
    randResult.value = list ?? [];
    const wanted = requestedTotal.value;
    randSummary.value = `请求 ${wanted} 道 · 实际抽到 ${randResult.value.length} 道`;
    if (!randResult.value.length) ElMessage.info('该条件下没有可抽取的题目');
    else if (randResult.value.length < wanted) ElMessage.warning(`题量不足：${randSummary.value}`);
  } catch (e: unknown) {
    randResult.value = [];
    randError.value = (e as Error)?.message ?? '随机抽题失败';
  } finally {
    randLoading.value = false;
  }
}

// ==================== 勾选 ====================
const rows = computed(() => (tab.value === 'pick' ? records.value : randResult.value));
const busy = computed(() => (tab.value === 'pick' ? listLoading.value : randLoading.value));
const panelError = computed(() => (tab.value === 'pick' ? listError.value : randError.value));

const isSelected = (q: QuestionAdminItem) => selectedIds.value.has(Number(q.id));

function toggle(q: QuestionAdminItem) {
  const id = Number(q.id);
  emit(
    'update:modelValue',
    isSelected(q)
      ? selected.value.filter((x) => Number(x.id) !== id)
      : [...selected.value, q],
  );
}

/** 本页全选 / 全取消：抽题模式下顺手把这一组勾上 */
function toggleCurrentPage() {
  const unselected = rows.value.filter((r) => !isSelected(r));
  if (unselected.length) {
    emit('update:modelValue', [...selected.value, ...unselected]);
    return;
  }
  const ids = new Set(rows.value.map((r) => Number(r.id)));
  emit('update:modelValue', selected.value.filter((x) => !ids.has(Number(x.id))));
}

function removeSelected(id: number) {
  emit('update:modelValue', selected.value.filter((x) => Number(x.id) !== id));
}

function clearSelected() {
  emit('update:modelValue', []);
}

/** 题型 / 难度：VO 给码值 + 名称，实体给枚举名 + 只有难度 ID，两种口径都能显示 */
const rowTypeText = (q: QuestionAdminItem) => q.typeDesc?.trim() || typeLabel(q.type);
const rowDifficultyText = (q: QuestionAdminItem) => difficultyText(q);

onMounted(() => {
  difficultyStore.load();
  void loadChapters();
  loadList();
});
</script>

<template>
  <div class="qp">
    <div class="qp-tabs">
      <button
        type="button"
        :class="['qp-tab', tab === 'pick' && 'qp-tab--on']"
        @click="tab = 'pick'"
      >
        按条件选题
      </button>
      <button
        type="button"
        :class="['qp-tab', tab === 'random' && 'qp-tab--on']"
        @click="tab = 'random'"
      >
        <Shuffle :size="13" /> 随机抽题
      </button>
      <span class="qp-count">已选 {{ selected.length }} 题 · 总分 {{ selectedScore }}</span>
    </div>

    <div v-if="tab === 'pick'" class="qp-filters">
      <div class="qp-field">
        <label class="qp-label">教材章节</label>
        <ChapterSelect v-model="filters.chapterId" placeholder="全部章节" clearable style="width: 220px;" />
      </div>
      <div class="qp-field">
        <label class="qp-label">题型</label>
        <el-select v-model="filters.type" style="width: 120px;">
          <el-option label="全部题型" :value="0" />
          <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </div>
      <div class="qp-field">
        <label class="qp-label">难度</label>
        <el-select v-model="filters.difficultyConfigId" style="width: 120px;">
          <el-option label="全部难度" :value="0" />
          <el-option
            v-for="d in difficultyOptions"
            :key="d.value"
            :label="d.label"
            :value="d.value"
          />
        </el-select>
      </div>
      <div class="qp-field qp-field--grow">
        <label class="qp-label">题干关键词</label>
        <input v-model="filters.keyword" class="qp-input" placeholder="模糊匹配题干" @keyup.enter="search" />
      </div>
      <button class="st-btn st-btn--primary" :disabled="listLoading" @click="search">
        <Loader2 v-if="listLoading" :size="14" class="qp-spin" />
        <Search v-else :size="14" />
        查询
      </button>
    </div>

    <template v-else>
      <div class="qp-filters">
        <div class="qp-field qp-field--grow">
          <label class="qp-label">教材章节（必选）</label>
          <ChapterSelect v-model="randChapterId" placeholder="选择章节" style="width: 100%;" />
        </div>
        <button class="st-btn st-btn--primary" :disabled="randLoading" @click="runRandom">
          <Loader2 v-if="randLoading" :size="14" class="qp-spin" />
          <Shuffle v-else :size="14" />
          开始抽题
        </button>
      </div>

      <div class="qp-alloc">
        <div v-for="(row, i) in allocRows" :key="i" class="qp-alloc__row">
          <el-select v-model="row.type" style="width: 130px;">
            <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-select v-model="row.difficultyConfigId" placeholder="不限难度" clearable style="width: 150px;">
            <el-option
              v-for="d in difficultyOptions"
              :key="d.value"
              :label="d.label"
              :value="d.value"
            />
          </el-select>
          <el-input-number v-model="row.count" :min="1" :max="50" style="width: 110px;" />
          <span class="qp-alloc__unit">道</span>
          <button
            type="button"
            class="qp-alloc__del"
            :disabled="allocRows.length <= 1"
            title="删除这条配比"
            @click="removeAllocRow(i)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
        <div class="qp-alloc__foot">
          <button type="button" class="st-btn st-btn--ghost" :disabled="allocRows.length >= 12" @click="addAllocRow">
            <Plus :size="13" /> 添加一档
          </button>
          <span class="qp-alloc__hint">
            同一题型可以配多条：留「不限难度」按该题型整体随机，选了难度就按档抽；共请求 {{ requestedTotal }} 道
          </span>
        </div>
      </div>
    </template>

    <p v-if="panelError" class="qp-error">{{ panelError }}</p>
    <p v-else-if="tab === 'random' && randSummary" class="qp-summary">{{ randSummary }}</p>

    <div class="qp-tablewrap">
      <div v-if="busy" class="qp-blank">
        <Loader2 :size="18" class="qp-spin" />
        {{ tab === 'pick' ? '正在加载题目…' : '正在抽题…' }}
      </div>
      <div v-else-if="!rows.length" class="qp-blank">
        {{ tab === 'pick' ? '当前条件下没有题目' : '还没有抽题结果，配好题型与数量后点「开始抽题」' }}
      </div>
      <table v-else class="qp-table">
        <thead>
          <tr>
            <th class="qp-col-check">
              <el-checkbox :model-value="rows.every(isSelected)" @change="toggleCurrentPage" />
            </th>
            <th>题干</th>
            <th class="qp-col-tag">题型</th>
            <th class="qp-col-tag">难度</th>
            <th class="qp-col-tag">分值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.id)" @click="toggle(row)">
            <td class="qp-col-check" @click.stop>
              <el-checkbox :model-value="isSelected(row)" @change="toggle(row)" />
            </td>
            <td class="qp-content" :title="row.content">
              <span v-if="row.shortTitle" class="qp-short-title">{{ row.shortTitle }}</span>
              <span class="qp-stem">{{ row.content || '—' }}</span>
            </td>
            <td class="qp-col-tag"><span class="st-badge st-badge--outline">{{ rowTypeText(row) }}</span></td>
            <td class="qp-col-tag">{{ rowDifficultyText(row) }}</td>
            <td class="qp-col-tag">{{ row.score ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tab === 'pick' && total > 0" class="qp-pager">
      <button class="qp-pagebtn" :disabled="page <= 1 || listLoading" @click="goPage(page - 1)">上一页</button>
      <span class="qp-pageinfo">第 {{ page }} / {{ pageCount }} 页 · 共 {{ total }} 题</span>
      <button class="qp-pagebtn" :disabled="page >= pageCount || listLoading" @click="goPage(page + 1)">下一页</button>
    </div>

    <footer class="qp-foot">
      <div class="qp-tags">
        <span v-for="q in selected" :key="String(q.id)" class="qp-tag">
          {{ (q.shortTitle || q.content || '').slice(0, 12) || '题目' }}
          <button type="button" class="qp-tag-x" title="移出已选" @click="removeSelected(Number(q.id))">
            ×
          </button>
        </span>
        <span v-if="!selected.length" class="qp-hint">还没勾选题目</span>
      </div>
      <button class="st-btn st-btn--ghost" :disabled="!selected.length" @click="clearSelected">
        <Trash2 :size="13" /> 清空已选
      </button>
    </footer>
  </div>
</template>

<style scoped>
.qp {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qp-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 10px;
}

.qp-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.qp-tab--on {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: #fff;
}

.qp-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}

.qp-filters {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.qp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.qp-field--grow {
  flex: 1;
  min-width: 200px;
}

.qp-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.qp-input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.qp-input:focus {
  border-color: var(--border-strong);
}

/* 抽题配比 */
.qp-alloc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-subtle);
}

.qp-alloc__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.qp-alloc__unit {
  font-size: 12px;
  color: var(--text-tertiary);
}

.qp-alloc__del {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
}

.qp-alloc__del:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.qp-alloc__del:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.qp-alloc__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.qp-alloc__hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.qp-error {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.qp-summary {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.qp-tablewrap {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.qp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.qp-table th,
.qp-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.qp-table th {
  background: var(--bg-subtle);
  font-weight: 500;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.qp-table tbody tr {
  cursor: pointer;
}

.qp-table tbody tr:hover {
  background: var(--bg-subtle);
}

.qp-col-check {
  width: 42px;
}

.qp-col-tag {
  width: 96px;
  white-space: nowrap;
}

.qp-content {
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.qp-short-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-right: 6px;
}

.qp-blank {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 26px 16px;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.qp-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.qp-pagebtn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  font-size: 12.5px;
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
}

.qp-pagebtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qp-pageinfo {
  font-size: 12px;
  color: var(--text-tertiary);
}

.qp-foot {
  display: flex;
  align-items: center;
  gap: 12px;
}

.qp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.qp-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--bg-subtle);
  font-size: 11.5px;
  color: var(--text-secondary);
}

.qp-tag-x {
  border: none;
  background: none;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.qp-tag-x:hover {
  color: var(--text-primary);
}

.qp-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.qp-spin {
  animation: qp-spin 0.9s linear infinite;
}

@keyframes qp-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
