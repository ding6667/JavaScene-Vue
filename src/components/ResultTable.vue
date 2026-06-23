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
        <button class="btn btn-primary" @click="$emit('export')">
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
            <th @click="sortBy('studentId')" class="sortable">
              学号
              <svg class="sort-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            </th>
            <th>姓名</th>
            <th @click="sortBy('score')" class="sortable">
              评分
              <svg class="sort-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
            </th>
            <th>评语</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in displayData" :key="row.studentId">
            <td class="cell-id">{{ row.studentId }}</td>
            <td class="cell-name">{{ row.studentName }}</td>
            <td>
              <span :class="['score-badge', scoreBadgeClass(row.score)]">
                {{ formatScore(row.score) }}
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
        共 {{ displayData.length }} 条 · 第 {{ currentPage }} / {{ Math.ceil(displayData.length / pageSize) }} 页
      </span>
      <div class="pagination-controls">
        <select v-model="pageSize" class="page-size-select">
          <option :value="10">10/页</option>
          <option :value="20">20/页</option>
          <option :value="50">50/页</option>
          <option :value="100">100/页</option>
        </select>
        <button
          class="page-btn"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          上一页
        </button>
        <button
          class="page-btn"
          :disabled="currentPage >= Math.ceil(displayData.length / pageSize)"
          @click="currentPage++"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 详情抽屉 -->
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
                <span class="detail-label">学号</span>
                <span class="detail-value">{{ currentDetail.studentId }}</span>
              </div>
              <div class="detail-section">
                <span class="detail-label">姓名</span>
                <span class="detail-value">{{ currentDetail.studentName }}</span>
              </div>
              <div class="detail-section">
                <span class="detail-label">评分</span>
                <span :class="['detail-value', 'detail-score', scoreBadgeClass(currentDetail.score)]">
                  {{ formatScore(currentDetail.score) }}
                </span>
              </div>
              <div class="detail-section">
                <span class="detail-label">评语</span>
                <p class="detail-comment">{{ currentDetail.comment }}</p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { GradingResult } from '@/types';
import { formatScore } from '@/utils/format';

const props = defineProps<{
  results: GradingResult[];
  loading: boolean;
}>();

defineEmits<{
  export: [];
}>();

const filterMinScore = ref<number | undefined>(undefined);
const filterMaxScore = ref<number | undefined>(undefined);
const sortField = ref<string | null>(null);
const sortOrder = ref<'asc' | 'desc' | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);
const drawerVisible = ref(false);
const currentDetail = ref<GradingResult | null>(null);

const filteredData = computed(() => {
  let data = [...props.results];
  if (filterMinScore.value !== undefined) {
    data = data.filter((r) => r.score >= filterMinScore.value!);
  }
  if (filterMaxScore.value !== undefined) {
    data = data.filter((r) => r.score <= filterMaxScore.value!);
  }
  return data;
});

const sortedData = computed(() => {
  const data = [...filteredData.value];
  if (sortField.value) {
    const field = sortField.value as keyof GradingResult;
    data.sort((a, b) => {
      const aVal = a[field] as number | string;
      const bVal = b[field] as number | string;
      return sortOrder.value === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  }
  return data;
});

const displayData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return sortedData.value.slice(start, end);
});

function applyFilter() { currentPage.value = 1; }
function resetFilter() {
  filterMinScore.value = undefined;
  filterMaxScore.value = undefined;
  currentPage.value = 1;
}

function sortBy(field: string) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = 'asc';
  }
}

function showDetail(row: GradingResult) {
  currentDetail.value = row;
  drawerVisible.value = true;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}

function scoreBadgeClass(score: number): string {
  if (score >= 90) return 'score-excellent';
  if (score >= 60) return 'score-pass';
  return 'score-fail';
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
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
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
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s;
}

.filter-input:focus {
  border-color: #818cf8;
}

.filter-sep {
  color: #94a3b8;
  font-size: 13px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-ghost {
  background: transparent;
  color: #64748b;
}

.btn-ghost:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
  box-shadow: 0 1px 3px rgba(99, 102, 241, 0.3);
}

.btn-primary:hover {
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
  transform: translateY(-1px);
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.data-table th {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.data-table th.sortable:hover {
  color: #0f172a;
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
  background: #f8fafc;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: #64748b;
}

.cell-name {
  font-weight: 500;
  color: #0f172a;
}

.score-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  min-width: 48px;
  text-align: center;
}

.score-excellent {
  background: #dcfce7;
  color: #16a34a;
}

.score-pass {
  background: #fef3c7;
  color: #d97706;
}

.score-fail {
  background: #fee2e2;
  color: #dc2626;
}

.cell-comment {
  color: #64748b;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-link {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}

.btn-link:hover {
  background: #f5f3ff;
}

.table-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
  flex-wrap: wrap;
  gap: 12px;
}

.pagination-info {
  font-size: 13px;
  color: #94a3b8;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size-select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
  outline: none;
  cursor: pointer;
}

.page-btn {
  height: 34px;
  padding: 0 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Drawer */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: 400px;
  max-width: 100%;
  height: 100%;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
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
  border-bottom: 1px solid #e2e8f0;
}

.drawer-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.drawer-close {
  width: 32px;
  height: 32px;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-close svg {
  width: 16px;
  height: 16px;
  color: #64748b;
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
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.detail-value {
  font-size: 15px;
  color: #0f172a;
}

.detail-score {
  font-size: 24px;
  font-weight: 700;
  display: inline-block;
  padding: 6px 16px;
  border-radius: 12px;
}

.detail-comment {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
  color: #475569;
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
