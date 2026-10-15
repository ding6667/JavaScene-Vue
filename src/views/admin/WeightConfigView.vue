<script setup lang="ts">
/**
 * 知识点权重配置 —— UI 骨架页（后端无对应接口）
 *
 * 接口预留：
 *  1) GET  /api/knowledge/weight/list?chapterId=
 *     按章节拉取权重配置列表（含知识点名称，用于表格回显）。
 *  2) POST /api/knowledge/weight/save
 *     {chapterId,knowledgePointId,weight,baseQuestionCount,maxQuestionCount,difficultyDistribution,isActive}
 *     单条保存（新增时不传 id / 编辑时传 id，以后端最终约定为准）。
 *  3) POST /api/knowledge/weight/batch
 *     数组体，元素字段同上；运维端「批量保存」与系统参数的「评分权重」共用该入口。
 *
 * 章节下拉数据可用 @/api/student 的 fetchChapters()（只读）填充，本页保持纯 UI 壳不发起请求。
 * 表内的增删改均为本地草稿状态，不向后端提交。
 */
import { computed, ref } from 'vue';
import { Info, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

/** 章节下拉占位（待章节接口接入后填充 id + 标题） */
interface ChapterOption {
  id: number;
  title: string;
}

/** 权重行占位结构（字段对齐 POST /api/knowledge/weight/batch 数组元素） */
interface WeightRow {
  knowledgePointId: number;
  knowledgePointName: string;
  /** 权重百分比 */
  weight: number;
  /** 基础题量 */
  baseQuestionCount: number;
  /** 最大题量 */
  maxQuestionCount: number;
  /** 难度分布，如 "3:5:2"（易:中:难），最终以接口约定为准 */
  difficultyDistribution: string;
  /** 是否启用：1=启用 0=停用 */
  isActive: number;
}

const chapterOptions = ref<ChapterOption[]>([]);
const chapterId = ref<number | null>(null);
const rows = ref<WeightRow[]>([]);

const weightTotal = computed(() => rows.value.reduce((sum, r) => sum + r.weight, 0));

/** 权重合计应为 100%，仅前端校验 */
const canSave = computed(() => rows.value.length > 0 && weightTotal.value === 100);

function addRow() {
  rows.value.push({
    knowledgePointId: 0,
    knowledgePointName: '',
    weight: 10,
    baseQuestionCount: 5,
    maxQuestionCount: 20,
    difficultyDistribution: '3:5:2',
    isActive: 1,
  });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

function handleLoad() {
  // 接口预留：GET /api/knowledge/weight/list?chapterId=
  ElMessage.info('接口预留：后端未提供权重列表接口');
}

function handleBatchSave() {
  // 接口预留：POST /api/knowledge/weight/batch（数组体，元素字段同 weight/save）
  ElMessage.info(`接口预留：后端未提供权重批量保存接口（当前草稿 ${rows.value.length} 条）`);
}

function fmtChapter(): string {
  const c = chapterOptions.value.find((x) => x.id === chapterId.value);
  return c ? c.title : '未选择章节';
}
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
        接口预留：GET /api/knowledge/weight/list?chapterId=、
        POST /api/knowledge/weight/save {chapterId,knowledgePointId,weight,baseQuestionCount,maxQuestionCount,difficultyDistribution,isActive}、
        POST /api/knowledge/weight/batch（数组同上）。本页为界面骨架，表内编辑为本地草稿。
      </span>
    </div>

    <!-- 章节选择 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="field">
          <label class="field-label">教材章节</label>
          <el-select v-model="chapterId" placeholder="选择章节" style="width: 280px;" no-data-text="章节数据待接口提供">
            <el-option v-for="c in chapterOptions" :key="c.id" :label="c.title" :value="c.id" />
          </el-select>
        </div>
        <div class="field">
          <label class="field-label">当前章节</label>
          <span class="field-static">{{ fmtChapter() }}</span>
        </div>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" @click="handleLoad">读取已有配置</button>
          <button class="st-btn st-btn--primary" @click="addRow">
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
          <p class="st-card__hint">共 {{ rows.length }} 条 · 权重合计 {{ weightTotal }}%（建议为 100%）</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="wc-table">
          <thead>
            <tr>
              <th>知识点</th>
              <th style="width: 150px;">权重（%）</th>
              <th style="width: 130px;">基础题量</th>
              <th style="width: 130px;">最大题量</th>
              <th style="width: 160px;">难度分布</th>
              <th style="width: 100px;">是否启用</th>
              <th style="width: 80px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="`${r.knowledgePointId}-${i}`">
              <td>
                <input v-model="r.knowledgePointName" class="cell-input" placeholder="知识点名称" />
              </td>
              <td><el-input-number v-model="r.weight" :min="0" :max="100" style="width: 100%;" /></td>
              <td><el-input-number v-model="r.baseQuestionCount" :min="0" :max="999" style="width: 100%;" /></td>
              <td><el-input-number v-model="r.maxQuestionCount" :min="0" :max="999" style="width: 100%;" /></td>
              <td><input v-model="r.difficultyDistribution" class="cell-input" placeholder="易:中:难，如 3:5:2" /></td>
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
            <template v-if="rows.length === 0">
              <tr v-for="n in 4" :key="`wc-ph-${n}`">
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="rows.length === 0" class="st-empty">
          <SlidersHorizontal :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无权重配置 · 接口预留：后端未提供权重列表接口，可先「新增权重行」编辑草稿</div>
        </div>
      </div>
    </section>

    <div class="save-bar">
      <span class="save-hint" :class="{ 'save-hint--bad': rows.length > 0 && !canSave }">
        {{ rows.length === 0 ? '草稿为空，批量保存不会提交任何内容' : `权重合计 ${weightTotal}%${canSave ? '' : '，需调整为 100% 后再保存'}` }}
      </span>
      <button class="st-btn st-btn--primary" :disabled="!canSave" @click="handleBatchSave">
        <Save :size="14" /> 批量保存权重
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

/* 骨架占位 */
.skeleton-bar {
  display: inline-block;
  height: 10px;
  width: 100%;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
}

.skeleton-bar--sm {
  width: 65%;
}

.skeleton-bar--xs {
  width: 40%;
}
</style>
