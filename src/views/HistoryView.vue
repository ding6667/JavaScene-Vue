<template>
  <div class="history-view">
    <!-- 页面标题 -->
    <header class="page-header">
      <h1 class="page-title">历史任务</h1>
      <p class="page-subtitle">查看和管理历史批阅记录</p>
    </header>

    <!-- 模式滑块切换 -->
    <div class="mode-toggle-wrapper">
      <div class="mode-toggle">
        <div
          class="toggle-slider"
          :style="{ transform: `translateX(${modeIndex * 100}%)` }"
        ></div>
        <button
          v-for="mode in modes"
          :key="mode.key"
          type="button"
          :class="['toggle-option', { 'toggle-option--active': activeMode === mode.key }]"
          @click="switchMode(mode.key)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <!-- 共有筛选条件 -->
      <el-select v-model="filters.taskCategory" placeholder="任务类型" clearable class="filter-item" @change="handleFilterChange">
        <el-option label="作业" value="HOMEWORK" />
        <el-option label="期中" value="MIDTERM" />
        <el-option label="期末" value="FINAL" />
        <el-option label="项目" value="PROJECT" />
      </el-select>

      <el-input-number
        v-model="filters.taskSequence"
        :min="1"
        :controls="false"
        placeholder="任务频率"
        class="filter-item filter-item--sm"
        @change="handleFilterChange"
      />

      <el-select v-model="filters.status" placeholder="批阅状态" clearable class="filter-item" @change="handleFilterChange">
        <el-option label="待处理" :value="0" />
        <el-option label="处理中" :value="1" />
        <el-option label="已完成" :value="2" />
        <el-option label="已过期" :value="3" />
        <el-option label="失败" :value="4" />
        <el-option label="已取消" :value="5" />
      </el-select>

      <el-input v-model="filters.semester" placeholder="学期" clearable class="filter-item filter-item--sm" @clear="handleFilterChange" @keyup.enter="handleFilterChange" />

      <!-- ZIP 专属 -->
      <el-input v-if="activeMode === 'zip'" v-model="filters.classId" placeholder="班级 ID" clearable class="filter-item filter-item--sm" @clear="handleFilterChange" @keyup.enter="handleFilterChange" />

      <!-- Word 专属 -->
      <el-input v-if="activeMode === 'word'" v-model="filters.studentId" placeholder="学生 ID" clearable class="filter-item filter-item--sm" @clear="handleFilterChange" @keyup.enter="handleFilterChange" />

      <el-select v-model="filters.sortOrder" class="filter-item filter-item--xs" @change="handleFilterChange">
        <el-option label="最新优先" value="desc" />
        <el-option label="最早优先" value="asc" />
      </el-select>
    </div>

    <!-- 列表卡片 -->
    <div class="table-card" v-loading="store.loading">
      <el-table :data="store.tasks" style="width: 100%" @row-click="handleViewDetail">
        <!-- 文件类型图标 -->
        <el-table-column width="56" align="center">
          <template #default="{ row }">
            <div :class="['file-type-icon', isZip(row.fileType) ? 'file-type-icon--zip' : 'file-type-icon--word']">
              <Archive v-if="isZip(row.fileType)" :size="20" />
              <FileText v-else :size="20" />
            </div>
          </template>
        </el-table-column>

        <!-- 文件名称 -->
        <el-table-column label="文件名称" prop="fileName" min-width="160" show-overflow-tooltip />

        <!-- 任务类别 -->
        <el-table-column label="任务类别" min-width="120">
          <template #default="{ row }">
            <span class="task-category">{{ categoryMap[row.taskCategory as TaskCategory] || row.taskCategory }}</span>
            <span v-if="row.taskSequence" class="task-sequence">第{{ row.taskSequence }}次</span>
          </template>
        </el-table-column>

        <!-- 学期 -->
        <el-table-column label="学期" prop="semester" min-width="100" />

        <!-- 文件类型（仅"全部"模式显示） -->
        <el-table-column v-if="activeMode === 'all'" label="文件类型" min-width="90">
          <template #default="{ row }">
            <span class="file-type-text">{{ isZip(row.fileType) ? 'ZIP' : 'Word' }}</span>
          </template>
        </el-table-column>

        <!-- 进度 -->
        <el-table-column label="处理进度" min-width="110">
          <template #default="{ row }">
            <span class="progress-text">{{ row.processedStudentCount }} / {{ row.studentCount }}</span>
          </template>
        </el-table-column>

        <!-- 状态 -->
        <el-table-column label="状态" min-width="100">
          <template #default="{ row }">
            <span :class="['status-tag', `status-tag--${String(row.status).toLowerCase()}`]">
              {{ statusMap[row.status as GradingTaskStatus]?.label || row.status }}
            </span>
          </template>
        </el-table-column>

        <!-- 创建时间 -->
        <el-table-column label="创建时间" prop="createTime" min-width="170" />

        <!-- 操作 -->
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <button type="button" class="btn btn-ghost btn-sm" @click.stop="handleViewDetail(row)">查看详情</button>
          </template>
        </el-table-column>

        <template #empty>
          <div class="empty-state">
            <p class="empty-text">暂无历史任务</p>
          </div>
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.size"
          :total="store.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </div>

    <!-- ==================== 详情弹窗 ==================== -->
    <el-dialog v-model="detailVisible" title="任务详情" width="640px" destroy-on-close>
      <div v-loading="store.detailLoading" class="detail-content">
        <el-descriptions v-if="store.taskDetail" :column="2" border>
          <el-descriptions-item label="文件名称" :span="2">{{ store.taskDetail.fileName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="任务类别">
            {{ categoryMap[store.taskDetail.taskCategory] || store.taskDetail.taskCategory }}
            <span v-if="store.taskDetail.taskSequence">（第{{ store.taskDetail.taskSequence }}次）</span>
          </el-descriptions-item>
          <el-descriptions-item label="学期">{{ store.taskDetail.semester || '-' }}</el-descriptions-item>
          <el-descriptions-item label="文件类型">
            <span :class="['file-type-icon', 'file-type-icon--inline', isZip(store.taskDetail.fileType) ? 'file-type-icon--zip' : 'file-type-icon--word']">
              <Archive v-if="isZip(store.taskDetail.fileType)" :size="14" />
              <FileText v-else :size="14" />
              {{ isZip(store.taskDetail.fileType) ? 'ZIP 压缩包' : 'Word 文件' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="任务状态">
            <span :class="['status-tag', `status-tag--${String(store.taskDetail.status).toLowerCase()}`]">
              {{ statusMap[store.taskDetail.status]?.label || store.taskDetail.status }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="班级ID">{{ store.taskDetail.classId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="学生ID">{{ store.taskDetail.studentId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="学生总数">{{ store.taskDetail.studentCount }}</el-descriptions-item>
          <el-descriptions-item label="已处理数">{{ store.taskDetail.processedStudentCount }}</el-descriptions-item>
          <el-descriptions-item label="重试次数">{{ store.taskDetail.retryCount }}</el-descriptions-item>
          <el-descriptions-item label="评分标准ID">{{ store.taskDetail.rubricId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">{{ store.taskDetail.createTime || '-' }}</el-descriptions-item>
          <el-descriptions-item label="完成时间" :span="2">{{ store.taskDetail.finishTime || '-' }}</el-descriptions-item>
          <el-descriptions-item v-if="store.taskDetail.errorMessage" label="错误信息" :span="2">
            <span class="error-message">{{ store.taskDetail.errorMessage }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <div class="detail-actions">
          <button type="button" class="btn btn-ghost" @click="handleReGrade">
            <RefreshCw :size="16" />
            <span>重新批阅</span>
          </button>
          <div class="action-right">
            <button type="button" class="btn btn-ghost" @click="handleExportExcel">
              <FileSpreadsheet :size="16" />
              <span>导出 Excel</span>
            </button>
            <button type="button" class="btn btn-ghost" @click="handleExportWord">
              <FileType :size="16" />
              <span>导出 Word</span>
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { Archive, FileText, RefreshCw, FileSpreadsheet, FileType } from 'lucide-vue-next';
import { useHistoryStore } from '@/stores/history';
import {
  GradingTaskStatus,
  TaskCategory,
  FileType as FileTypeEnum,
  statusMap,
  categoryMap,
  type GradingTask,
  type TaskQuery,
} from '@/types/history';

const store = useHistoryStore();

// ==================== 工具函数 ====================
/** 大小写不敏感判断是否为 ZIP 类型 */
function isZip(fileType: string): boolean {
  return String(fileType).toUpperCase() === 'ZIP';
}

// ==================== 模式滑块 ====================
type HistoryMode = 'all' | 'zip' | 'word';

const modes: { key: HistoryMode; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'zip', label: 'ZIP' },
  { key: 'word', label: 'Word' },
];

const activeMode = ref<HistoryMode>('all');

const modeIndex = computed(() => {
  return modes.findIndex((m) => m.key === activeMode.value);
});

function switchMode(mode: HistoryMode) {
  if (activeMode.value === mode) return;
  activeMode.value = mode;
  // 切换模式时清除模式专属字段
  filters.classId = '';
  filters.studentId = '';
  pagination.page = 1;
  loadData();
}

// ==================== 筛选 ====================
const filters = reactive({
  semester: '',
  taskCategory: undefined as TaskCategory | undefined,
  taskSequence: undefined as number | undefined,
  classId: '',
  studentId: '',
  status: undefined as number | undefined,
  sortOrder: 'desc' as 'asc' | 'desc',
});

const pagination = reactive({
  page: 1,
  size: 10,
});

function buildQuery(): TaskQuery {
  const query: TaskQuery = {
    page: pagination.page,
    size: pagination.size,
    sortOrder: filters.sortOrder,
    semester: filters.semester || undefined,
    taskCategory: filters.taskCategory,
    taskSequence: filters.taskSequence,
    status: filters.status,
  };

  if (activeMode.value === 'zip') {
    query.classId = filters.classId || undefined;
  } else if (activeMode.value === 'word') {
    query.studentId = filters.studentId || undefined;
  }

  return query;
}

async function loadData() {
  const query = buildQuery();
  const fileType = activeMode.value === 'zip' ? FileTypeEnum.ZIP
    : activeMode.value === 'word' ? FileTypeEnum.WORD
    : undefined;
  await store.fetchTasks(query, fileType);
}

function handleFilterChange() {
  pagination.page = 1;
  loadData();
}

function handlePageChange(page: number) {
  pagination.page = page;
  loadData();
}

function handleSizeChange(size: number) {
  pagination.size = size;
  pagination.page = 1;
  loadData();
}

// ==================== 详情 ====================
const detailVisible = ref(false);

async function handleViewDetail(row: GradingTask) {
  detailVisible.value = true;
  await store.fetchTaskDetail(row.id);
}

// ==================== 操作按钮（逻辑待实现） ====================
function handleReGrade() {}
function handleExportExcel() {}
function handleExportWord() {}

// ==================== 生命周期 ====================
onMounted(() => {
  loadData();
});
</script>

<style scoped>
.history-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

/* ==================== 页面标题 ==================== */
.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  letter-spacing: -0.3px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* ==================== 模式滑块 ==================== */
.mode-toggle-wrapper {
  margin-bottom: 20px;
}

.mode-toggle {
  position: relative;
  display: inline-flex;
  width: 288px;
  height: 40px;
  background: var(--bg);
  border-radius: 8px;
  padding: 4px;
  box-sizing: border-box;
}

.toggle-slider {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc((100% - 8px) / 3);
  height: calc(100% - 8px);
  background: var(--text-primary);
  border-radius: 6px;
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-option {
  position: relative;
  z-index: 1;
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.3s;
}

.toggle-option--active {
  color: #ffffff;
}

/* ==================== 筛选栏 ==================== */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.filter-item {
  width: 150px;
}

.filter-item--sm {
  width: 120px;
}

.filter-item--xs {
  width: 110px;
}

/* ==================== 下拉框优化 ==================== */
.filter-bar :deep(.el-select__wrapper) {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: none !important;
  min-height: 34px;
  transition: border-color 0.2s;
}

.filter-bar :deep(.el-select__wrapper:hover) {
  border-color: var(--border-hover);
}

.filter-bar :deep(.el-select__wrapper.is-focused) {
  border-color: var(--text-primary) !important;
}

.filter-bar :deep(.el-select__placeholder),
.filter-bar :deep(.el-select__selected-item) {
  font-size: 13px;
  color: var(--text-secondary);
}

.filter-bar :deep(.el-input__wrapper) {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: none !important;
  min-height: 34px;
  transition: border-color 0.2s;
}

.filter-bar :deep(.el-input__wrapper:hover) {
  border-color: var(--border-hover);
}

.filter-bar :deep(.el-input__wrapper.is-focus) {
  border-color: var(--text-primary) !important;
}

.filter-bar :deep(.el-input__inner) {
  font-size: 13px;
  color: var(--text-secondary);
}

.filter-bar :deep(.el-input-number) {
  width: 100%;
}

.filter-bar :deep(.el-input-number .el-input__inner) {
  text-align: left;
}

/* ==================== 表格卡片 ==================== */
.table-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.table-card :deep(.el-table) {
  --el-table-border-color: var(--border);
  --el-table-header-bg-color: var(--bg);
  --el-table-row-hover-bg-color: var(--bg);
}

.table-card :deep(.el-table th) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.table-card :deep(.el-table td) {
  font-size: 13px;
  color: var(--text-secondary);
}

.table-card :deep(.el-table__row) {
  cursor: pointer;
}

/* ==================== 文件类型图标 ==================== */
.file-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.file-type-icon--zip {
  color: var(--accent);
  background: var(--bg);
}

.file-type-icon--word {
  color: var(--text-secondary);
  background: var(--bg);
}

.file-type-icon--inline {
  width: auto;
  height: auto;
  padding: 2px 8px;
  gap: 4px;
  font-size: 13px;
}

/* ==================== 任务类别 ==================== */
.task-category {
  font-weight: 500;
  color: var(--text-primary);
}

.task-sequence {
  margin-left: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.file-type-text {
  font-size: 13px;
  color: var(--text-secondary);
}

.progress-text {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

/* ==================== 状态标签 ==================== */
.status-tag {
  display: inline-block;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
}

.status-tag--pending {
  color: var(--text-tertiary);
  background: var(--bg);
}

.status-tag--processing {
  color: #92400e;
  background: #fef3c7;
}

.status-tag--success {
  color: #166534;
  background: #dcfce7;
}

.status-tag--expired {
  color: var(--text-tertiary);
  background: var(--bg);
}

.status-tag--failed {
  color: #991b1b;
  background: #fee2e2;
}

.status-tag--cancelled {
  color: var(--text-tertiary);
  background: var(--bg);
}

/* ==================== 空状态 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.empty-text {
  font-size: 14px;
  color: var(--text-tertiary);
}

/* ==================== 分页 ==================== */
.pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
  border-top: 1px solid var(--border);
}

/* ==================== 按钮 ==================== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.btn-ghost {
  background: var(--surface);
  color: var(--text-secondary);
  border-color: var(--border);
}

.btn-ghost:hover {
  background: var(--bg);
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
}

/* ==================== 详情弹窗 ==================== */
.detail-content {
  min-height: 100px;
}

.detail-content :deep(.el-descriptions__label) {
  width: 100px;
  font-size: 13px;
  color: var(--text-tertiary);
  background: var(--bg);
}

.detail-content :deep(.el-descriptions__content) {
  font-size: 13px;
  color: var(--text-primary);
}

.error-message {
  color: var(--status-error);
  font-size: 13px;
  line-height: 1.6;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.action-right {
  display: flex;
  gap: 8px;
}
</style>
