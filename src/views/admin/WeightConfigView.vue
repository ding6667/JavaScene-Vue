<script setup lang="ts">
/**
 * 知识点权重配置 —— 已接后端 /api/knowledge/weight/*
 *
 * 三个接口（后端 KnowledgeWeightConfigController，写操作限 ADMIN）：
 *  1) GET  /api/knowledge/weight/list?chapterId=     读取该章已配置的权重
 *  2) POST /api/knowledge/weight/batch               整批保存（后端一个事务，任一条失败全批回滚）
 *  3) POST /api/knowledge/weight/save                单条保存（本页用不到，智能体/其它页面可用）
 *
 * 保存是 upsert：以「章节 + 知识点」为唯一键，重复提交即更新，所以新增行不需要传 id。
 * 难度分布口径以库内实际值为准：逗号分隔的三段百分比（如 "30,50,20" = 易,中,难），
 * 备课智能体直接把这串原样透传给 Dify（agent-prepare 的 PrepareRequest.difficultyDistribution），
 * 所以这里不做格式转换，只做前端校验。
 */
import { computed, onMounted, ref } from 'vue';
import { Info, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import ChapterSelect from '@/components/ChapterSelect.vue';
import {
  fetchKnowledgePoints,
  fetchWeights,
  saveWeightsBatch,
} from '@/api/knowledge';
import { useChapters } from '@/composables/useChapters';
import type { QuestionWeight } from '@/types/knowledge';

/** ID 一律按字符串比对：knowledge_* 主键是雪花 ID，转成 JS number 会丢精度 */
type RowId = number | string;

/** 权重行：字段对齐 POST /api/knowledge/weight/batch 数组元素 */
interface WeightRow {
  knowledgePointId: RowId | '';
  knowledgePointName: string;
  /** 权重百分比 */
  weight: number;
  /** 基础题量 */
  baseQuestionCount: number;
  /** 最大题量 */
  maxQuestionCount: number;
  /** 难度分布："易,中,难" 三段百分比，如 "30,50,20" */
  difficultyDistribution: string;
  /** 是否启用：提交时转成后端的 boolean */
  isActive: 1 | 0;
}

/** 难度分布必须是三段 0~100 的数字，逗号分隔 */
const DIFFICULTY_PATTERN = /^\d{1,3},\d{1,3},\d{1,3}$/;

const chapterId = ref<RowId | null>(null);
const rows = ref<WeightRow[]>([]);
/** 当前章节的知识点，供「知识点」列下拉选择（后端按 knowledgePointId 关联，手输名字没用） */
const pointOptions = ref<{ id: RowId; name: string }[]>([]);
const loading = ref(false);
const saving = ref(false);

const weightTotal = computed(() => rows.value.reduce((sum, r) => sum + r.weight, 0));

/**
 * 权重是**相对系数**，不是百分比：出题时按 count × weight / Σweight 归一分配
 * （见 exam 的 ExamQuestionGenerator），所以前端不校验"合计必须 100%"——
 * 那条规则会把库里 weight=1,1,1 的既有配置全部锁死，谁都保存不了。
 * 这里只校验后端真正会拒绝的三件事：行非空、知识点已选、难度分布格式合法；
 * 后端还会校验"最大题量 ≥ 基础题量"和"知识点属于该章节"，失败时由拦截器弹出原文案。
 */
const rowsValid = computed(() =>
  rows.value.length > 0 &&
  rows.value.every(
    (r) =>
      r.knowledgePointId !== '' &&
      r.baseQuestionCount >= 0 &&
      r.maxQuestionCount >= r.baseQuestionCount &&
      DIFFICULTY_PATTERN.test(r.difficultyDistribution.trim()),
  ),
);

const savable = computed(() => rowsValid.value && !saving.value);

/** 章节数据统一走 useChapters（下拉用 <ChapterSelect>，这里只需按 id 回显名字） */
const { labelOf, load: loadChapters } = useChapters();

onMounted(() => void loadChapters());

async function loadPointOptions(id: RowId) {
  try {
    const points = await fetchKnowledgePoints(id);
    pointOptions.value = points.map((p) => ({ id: p.id, name: p.name }));
  } catch {
    pointOptions.value = [];
  }
}

/** 换章节：知识点与已有配置都属于旧章节，必须一起重取，否则会把 A 章的知识点 ID 存到 B 章上 */
async function onChapterChange(id: number | string | null) {
  // 该下拉不可清空，null 只是 ChapterSelect 的类型全集，这里直接忽略
  if (id === null) return;
  chapterId.value = id;
  rows.value = [];
  await loadPointOptions(id);
}

function addRow() {
  rows.value.push({
    knowledgePointId: '',
    knowledgePointName: '',
    weight: 10,
    baseQuestionCount: 5,
    maxQuestionCount: 20,
    difficultyDistribution: '30,50,20',
    isActive: 1,
  });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

/** 选中知识点时把名字一起带上，表格里既提交 ID 也能回显名称 */
function onPointChange(row: WeightRow, id: RowId) {
  row.knowledgePointId = id;
  row.knowledgePointName = pointOptions.value.find((p) => String(p.id) === String(id))?.name ?? '';
}

async function handleLoad() {
  if (chapterId.value === null) {
    ElMessage.warning('请先选择章节');
    return;
  }
  loading.value = true;
  try {
    const list: QuestionWeight[] = await fetchWeights(chapterId.value);
    rows.value = list.map((w) => ({
      knowledgePointId: w.knowledgePointId,
      knowledgePointName: w.knowledgePointName,
      weight: Number(w.weight),
      baseQuestionCount: w.baseQuestionCount,
      maxQuestionCount: w.maxQuestionCount,
      difficultyDistribution: w.difficultyDistribution ?? '30,50,20',
      isActive: w.isActive ? 1 : 0,
    }));
    ElMessage.success(`已读取 ${list.length} 条权重配置`);
  } catch {
    // 拦截器已提示，这里保持表格为空态
  } finally {
    loading.value = false;
  }
}

async function handleBatchSave() {
  if (chapterId.value === null) {
    ElMessage.warning('请先选择章节');
    return;
  }
  if (!rowsValid.value) {
    ElMessage.error('每行都要选知识点、最大题量不小于基础题量，难度分布写成「易,中,难」三段数字，如 30,50,20');
    return;
  }
  saving.value = true;
  try {
    const count = await saveWeightsBatch(
      rows.value.map((r) => ({
        chapterId: chapterId.value as number | string,
        knowledgePointId: r.knowledgePointId as number | string,
        weight: r.weight,
        baseQuestionCount: r.baseQuestionCount,
        maxQuestionCount: r.maxQuestionCount,
        difficultyDistribution: r.difficultyDistribution.trim(),
        isActive: r.isActive === 1,
      })),
    );
    ElMessage.success(`已保存 ${count ?? rows.value.length} 条权重配置`);
    await handleLoad();
  } catch {
    // 后端整批回滚，拦截器已给出失败原因，表格保留草稿便于修改后重试
  } finally {
    saving.value = false;
  }
}

function fmtChapter(): string {
  return chapterId.value === null ? '未选择章节' : labelOf(chapterId.value);
}

/** 空态文案：没选章节 / 选了章节但没配置，提示语不一样 */
const emptyText = computed(() =>
  chapterId.value === null
    ? '先选择章节，再「读取已有配置」或「新增权重行」'
    : '该章节暂无权重配置 · 点「新增权重行」添加后批量保存',
);

/** 保存条下的提示：只报"能不能提交"与后端会拒绝的硬伤，不再拿合计当门槛 */
const saveHintText = computed(() => {
  if (rows.value.length === 0) return '没有可提交的权重行';
  if (!rowsValid.value) {
    const badPoint = rows.value.some((r) => r.knowledgePointId === '');
    if (badPoint) return '有行的知识点还没选择';
    const badCount = rows.value.some((r) => r.maxQuestionCount < r.baseQuestionCount);
    if (badCount) return '最大题量不能小于基础题量';
    return '难度分布格式不对（应为「易,中,难」三段数字，如 30,50,20）';
  }
  return `权重为相对系数（合计 ${weightTotal.value}，出题时按比例分配），可保存 ${rows.value.length} 条`;
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">知识点权重配置</h1>
      <p class="st-page-subtitle">按章节配置知识点的出题权重、基础题量与难度分布 · 智能体组卷依据</p>
    </header>

    <div class="wc-notice">
      <Info :size="14" />
      <span>
        保存时会按「章节 + 知识点」逐行更新，整批一起成功或一起失败；
        <b>权重是相对系数</b>（出题时按各行占比分配，不要求合计 100）；
        难度分布写三段数字「易,中,难」，如 <code>30,50,20</code>，备课智能体原样取用。
      </span>
    </div>

    <!-- 章节选择 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="field">
          <label class="field-label">教材章节</label>
          <ChapterSelect
            :model-value="chapterId"
            placeholder="选择章节"
            style="width: 300px;"
            @update:model-value="onChapterChange"
          />
        </div>
        <div class="field">
          <label class="field-label">当前章节</label>
          <span class="field-static">{{ fmtChapter() }}</span>
        </div>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" :disabled="loading || chapterId === null" @click="handleLoad">
            {{ loading ? '读取中…' : '读取已有配置' }}
          </button>
          <button class="st-btn st-btn--primary" :disabled="chapterId === null" @click="addRow">
            <Plus :size="14" /> 新增权重行
          </button>
        </div>
      </div>
    </div>

    <!-- 权重表 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <SlidersHorizontal :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">权重配置表</h2>
          <p class="st-card__hint">共 {{ rows.length }} 条 · 权重为相对系数，当前合计 {{ weightTotal }}（出题按各行占比分配）</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="wc-table">
          <thead>
            <tr>
              <th style="width: 240px;">知识点</th>
              <th style="width: 150px;">权重（系数）</th>
              <th style="width: 130px;">基础题量</th>
              <th style="width: 130px;">最大题量</th>
              <th style="width: 180px;">难度分布（易,中,难）</th>
              <th style="width: 110px;">是否启用</th>
              <th style="width: 80px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="`${String(r.knowledgePointId)}-${i}`">
              <td>
                <el-select
                  :model-value="r.knowledgePointId"
                  class="cell-select"
                  placeholder="选择本章知识点"
                  no-data-text="该章节还没配知识点"
                  @update:model-value="(v: RowId) => onPointChange(r, v)"
                >
                  <el-option
                    v-for="p in pointOptions"
                    :key="String(p.id)"
                    :label="p.name"
                    :value="p.id"
                  />
                </el-select>
              </td>
              <td><el-input-number v-model="r.weight" :min="1" :max="999" style="width: 100%;" /></td>
              <td><el-input-number v-model="r.baseQuestionCount" :min="0" :max="999" style="width: 100%;" /></td>
              <td><el-input-number v-model="r.maxQuestionCount" :min="0" :max="999" style="width: 100%;" /></td>
              <td>
                <input
                  v-model="r.difficultyDistribution"
                  class="cell-input"
                  :class="{ 'cell-input--bad': !DIFFICULTY_PATTERN.test(r.difficultyDistribution.trim()) }"
                  placeholder="30,50,20"
                />
              </td>
              <td>
                <el-select v-model="r.isActive" style="width: 100%;">
                  <el-option :value="1" label="启用" />
                  <el-option :value="0" label="停用" />
                </el-select>
              </td>
              <td style="text-align: right;">
                <button class="st-text-btn st-text-btn--danger" @click="removeRow(i)">
                  <Trash2 :size="12" style="vertical-align: -2px;" /> 移除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="rows.length === 0" class="st-empty">
          <SlidersHorizontal :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">{{ emptyText }}</div>
        </div>
      </div>
    </section>

    <div class="save-bar">
      <span class="save-hint" :class="{ 'save-hint--bad': rows.length > 0 && !savable }">
        {{ saveHintText }}
      </span>
      <button class="st-btn st-btn--primary" :disabled="!savable" @click="handleBatchSave">
        <Save :size="14" /> {{ saving ? '保存中…' : '批量保存权重' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.wc-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
  padding: 10px 14px;
  background: var(--status-info-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.wc-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--status-info);
}

.toolbar-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.field-static {
  height: 34px;
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.table-wrap {
  padding: 0 24px 20px;
  overflow-x: auto;
}

.wc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.wc-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.wc-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.wc-table tr:hover td {
  background: var(--bg-subtle);
}

.cell-input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 10px;
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
}

.cell-input:focus {
  border-color: var(--border-strong);
}

/* 难度分布写错时只变边框，不引入新色调，保持黑白基调 */
.cell-input--bad {
  border-color: var(--status-danger);
}

.cell-select {
  width: 100%;
}

.wc-notice code {
  font-size: 11.5px;
  padding: 1px 4px;
  background: var(--bg-muted);
  border-radius: var(--radius-sm);
}

.save-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  margin-top: 20px;
}

.save-hint {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.save-hint--bad {
  color: var(--status-danger);
}
</style>
