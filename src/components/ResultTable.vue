<!--
  批阅成绩明细表 —— 当前为 UI 骨架。
  接口预留：后端未提供批阅结果明细接口（无"按批阅任务查询各学生得分/评语"的路径），
  也未提供成绩 Excel 导出接口，因此本组件不自行取数：
  父级传入 results 时正常渲染，未传入时展示完整表头 + 空态。
-->
<template>
  <div class="result-table">
    <div class="table-header">
      <h3>学生成绩</h3>
      <div class="header-actions">
        <div class="filter-group">
          <input
            v-model.number="filterMinScore"
            type="number"
            min="0"
            max="100"
            placeholder="最低分"
            class="filter-input"
          />
          <span class="filter-sep">-</span>
          <input
            v-model.number="filterMaxScore"
            type="number"
            min="0"
            max="100"
            placeholder="最高分"
            class="filter-input"
          />
          <button class="btn btn-ghost" @click="applyFilter">筛选</button>
          <button class="btn btn-ghost" @click="resetFilter">重置</button>
        </div>
        <!-- 接口预留：后端未提供成绩导出 Excel 接口 -->
        <button class="btn btn-primary" disabled title="后端未提供导出接口">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          导出 Excel
        </button>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th @click="sortBy('studentNo')" class="sortable">
              学生
              <svg class="sort-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            </th>
            <th @click="sortBy('className')" class="sortable">
              班级
              <svg class="sort-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            </th>
            <th>批阅任务</th>
            <th>状态</th>
            <th @click="sortBy('score')" class="sortable">
              得分
              <svg class="sort-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            </th>
            <th>AI 评语</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr>
            <td colspan="7">
              <div class="st-empty" style="padding: 48px 16px;">
                <div class="st-empty__text">正在加载成绩明细…</div>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="displayData.length === 0">
          <tr>
            <td colspan="7">
              <div class="st-empty" style="padding: 56px 16px;">
                <FileClock :size="34" :stroke-width="1.2" class="st-empty__icon" />
                <div class="st-empty__text">暂无成绩明细</div>
                <div class="shell-note">接口预留：后端未提供按批阅任务查询各学生得分明细的接口</div>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="row in displayData" :key="row.studentNo">
            <td class="cell-name">
              {{ row.studentName }}
              <span class="cell-id">{{ row.studentNo }}</span>
            </td>
            <td class="cell-secondary">{{ row.className || '—' }}</td>
            <td class="cell-secondary">{{ row.taskName || '—' }}</td>
            <td>
              <span class="st-badge" :class="row.statusBadge ?? 'st-badge--neutral'">{{ row.statusLabel }}</span>
            </td>
            <td>
              <span :class="['score-badge', scoreBadgeClass(row.score)]">
                {{ displayScore(row.score) }}
              </span>
            </td>
            <td class="cell-comment">{{ truncate(row.comment, 40) }}</td>
            <td>
              <button class="btn-link" @click="showDetail(row)">查看详情</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="table-pagination">
      <span class="pagination-info">
        共 {{ sortedData.length }} 条 · 第 {{ currentPage }} / {{ totalPage }} 页
      </span>
      <div class="pagination-controls">
        <select v-model.number="pageSize" class="page-size-select">
          <option :value="10">10/页</option>
          <option :value="20">20/页</option>
          <option :value="50">50/页</option>
          <option :value="100">100/页</option>
        </select>
        <button class="page-btn" :disabled="currentPage === 1" @click="currentPage--">上一页</button>
        <button class="page-btn" :disabled="currentPage >= totalPage" @click="currentPage++">下一页</button>
      </div>
    </div>

    <!-- 详情抽屉（骨架，数据随明细接口一并补齐） -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="drawerVisible" class="drawer-overlay" @click.self="drawerVisible = false">
          <div class="drawer">
            <div class="drawer-header">
              <h3>评语详情</h3>
              <button class="drawer-close" @click="drawerVisible = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div v-if="currentDetail" class="drawer-body">
              <div class="detail-section">
                <span class="detail-label">学生</span>
                <span class="detail-value">{{ currentDetail.studentName }}（{{ currentDetail.studentNo }}）</span>
              </div>
              <div class="detail-section">
                <span class="detail-label">班级 / 任务</span>
                <span class="detail-value">{{ currentDetail.className || '—' }} · {{ currentDetail.taskName || '—' }}</span>
              </div>
              <div class="detail-section">
                <span class="detail-label">得分</span>
                <span :class="['detail-value', 'detail-score', scoreBadgeClass(currentDetail.score)]">
                  {{ displayScore(currentDetail.score) }}
                </span>
              </div>
              <div class="detail-section">
                <span class="detail-label">评语</span>
                <p class="detail-comment">{{ currentDetail.comment || '暂无评语' }}</p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { FileClock } from 'lucide-vue-next';
import { formatScore } from '@/utils/format';
/**
 * 成绩明细行（UI 壳数据结构）。
 * 接口预留：后端未提供批阅结果明细接口，字段待后端补齐后与本类型对齐。
 */
interface ResultRow {
  studentNo: string;
  studentName: string;
  className: string;
  taskName: string;
  statusLabel: string;
  /** st-badge 修饰类，缺省用中性样式 */
  statusBadge?: string;
  score: number | null;
  comment: string;
}

const props = withDefaults(
  defineProps<{
    /** 明细列表；后端无接口时父级可不传，组件展示空态 */
    results?: ResultRow[];
    loading?: boolean;
  }>(),
  { results: () => [], loading: false },
);

const filterMinScore = ref<number | undefined>(undefined);
const filterMaxScore = ref<number | undefined>(undefined);
const sortField = ref<keyof ResultRow | null>(null);
const sortOrder = ref<'asc' | 'desc' | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);
const drawerVisible = ref(false);
const currentDetail = ref<ResultRow | null>(null);

const filteredData = computed<ResultRow[]>(() => {
  let data = [...props.results];
  if (filterMinScore.value !== undefined && !Number.isNaN(filterMinScore.value)) {
    data = data.filter((r) => (r.score ?? -1) >= filterMinScore.value!);
  }
  if (filterMaxScore.value !== undefined && !Number.isNaN(filterMaxScore.value)) {
    data = data.filter((r) => (r.score ?? Number.MAX_SAFE_INTEGER) <= filterMaxScore.value!);
  }
  return data;
});

const sortedData = computed<ResultRow[]>(() => {
  const data = [...filteredData.value];
  if (sortField.value) {
    const field = sortField.value;
    data.sort((a, b) => {
      const aVal = a[field] ?? '';
      const bVal = b[field] ?? '';
      const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortOrder.value === 'asc' ? cmp : -cmp;
    });
  }
  return data;
});

const totalPage = computed(() => Math.max(1, Math.ceil(sortedData.value.length / pageSize.value)));

const displayData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedData.value.slice(start, start + pageSize.value);
});

function applyFilter() {
  currentPage.value = 1;
}

function resetFilter() {
  filterMinScore.value = undefined;
  filterMaxScore.value = undefined;
  currentPage.value = 1;
}

function sortBy(field: keyof ResultRow) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = 'asc';
  }
}

function showDetail(row: ResultRow) {
  currentDetail.value = row;
  drawerVisible.value = true;
}

function truncate(str: string, len: number): string {
  if (!str) return '—';
  return str.length <= len ? str : `${str.slice(0, len)}...`;
}

function scoreBadgeClass(score: number | null): string {
  if (score === null || score === undefined) return 'score-none';
  if (score >= 90) return 'score-excellent';
  if (score >= 60) return 'score-pass';
  return 'score-fail';
}

/** 得分展示：明细接口未就绪时 score 为空，用 — 占位 */
function displayScore(score: number | null): string {
  return score === null || score === undefined ? '—' : formatScore(score);
}
</script>

<style scoped>
.result-table {
  padding: 4px;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.table-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-input {
  width: 80px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
  transition: border-color var(--transition);
}

.filter-input::placeholder {
  color: var(--text-tertiary);
}

.filter-input:focus {
  border-color: var(--border-strong);
}

.filter-sep {
  color: var(--text-tertiary);
  font-size: 13px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-ghost {
  background: var(--bg-surface);
  border-color: var(--border-default);
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.btn-primary {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-color: var(--text-primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.data-table th {
  background: var(--bg-subtle);
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.data-table th.sortable:hover {
  color: var(--text-primary);
}

.sort-icon {
  width: 14px;
  height: 14px;
  vertical-align: middle;
  margin-left: 4px;
  opacity: 0.4;
}

.data-table th.sortable:hover .sort-icon {
  opacity: 0.8;
}

.data-table tbody tr:hover {
  background: var(--bg-subtle);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-id {
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 6px;
}

.cell-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.cell-secondary {
  color: var(--text-secondary);
}

.shell-note {
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.6;
  max-width: 520px;
}

.score-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  min-width: 48px;
  text-align: center;
}

.score-excellent {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.score-pass {
  background: var(--status-warning-bg);
  color: var(--status-warning);
}

.score-fail {
  background: var(--status-danger-bg);
  color: var(--status-danger);
}

.score-none {
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.cell-comment {
  color: var(--text-secondary);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition), color var(--transition);
}

.btn-link:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.table-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  flex-wrap: wrap;
  gap: 12px;
}

.pagination-info {
  font-size: 13px;
  color: var(--text-tertiary);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size-select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
  cursor: pointer;
}

.page-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.page-btn:hover:not(:disabled) {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Drawer */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: 400px;
  max-width: 100%;
  height: 100%;
  background: var(--bg-surface);
  box-shadow: -4px 0 24px rgba(28, 25, 23, 0.08);
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.drawer-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition), border-color var(--transition);
}

.drawer-close:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.drawer-close svg {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
}

.drawer-body {
  padding: 24px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}

.detail-value {
  font-size: 14px;
  color: var(--text-primary);
}

.detail-score {
  font-size: 22px;
  font-weight: 600;
  display: inline-block;
  padding: 6px 16px;
  border-radius: var(--radius-md);
}

.detail-comment {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* Drawer transitions */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s;
}

.drawer-enter-active .drawer {
  animation: slideIn 0.3s ease;
}

.drawer-leave-active .drawer {
  animation: slideOut 0.3s ease;
}

@keyframes slideOut {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
