<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, RefreshCw, Plus, Pencil, Trash2, ArrowDownUp } from 'lucide-vue-next';
import { useClassStore } from '@/stores/class';
import { ClassStatus, type ClassRecord, type ClassSaveRequest } from '@/types/class';

const store = useClassStore();

const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  className: '',
  isAsc: false,
});

// 创建/编辑弹窗状态
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const submitting = ref(false);
const formRef = ref();

const defaultForm = (): ClassSaveRequest => ({
  className: '',
  classCode: '',
  grade: 1,
  userId: 0,
  semester: '',
  status: ClassStatus.ACTIVE,
});

const form = ref<ClassSaveRequest>(defaultForm());

const formRules = {
  className: [{ required: true, message: '请输入班级名称', trigger: 'blur' }],
  classCode: [{ required: true, message: '请输入班级代码', trigger: 'blur' }],
  grade: [{ required: true, message: '请选择年级', trigger: 'change' }],
  userId: [{ required: true, message: '请输入用户 ID', trigger: 'blur' }],
};

const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function refreshList() {
  store.fetchRecords({ ...queryParams });
}

function handleSearch() {
  queryParams.pageNum = 1;
  refreshList();
}

function handleSort() {
  queryParams.isAsc = !queryParams.isAsc;
  refreshList();
}

function handlePageChange(page: number) {
  queryParams.pageNum = page;
  refreshList();
}

function handlePageSizeChange() {
  queryParams.pageNum = 1;
  refreshList();
}

function openCreate() {
  dialogMode.value = 'create';
  form.value = defaultForm();
  dialogVisible.value = true;
}

async function openEdit(row: ClassRecord) {
  dialogMode.value = 'edit';
  form.value = {
    id: row.id,
    className: row.className,
    classCode: row.classCode,
    grade: row.grade,
    userId: row.userId,
    semester: row.semester ?? '',
    status: row.status,
  };
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }

  submitting.value = true;
  const ok = await store.save(form.value);
  submitting.value = false;

  if (ok) {
    ElMessage.success(dialogMode.value === 'create' ? '创建成功' : '更新成功');
    dialogVisible.value = false;
    refreshList();
  }
  // 失败时错误提示由响应拦截器统一渲染后端 message
}

async function handleDelete(row: ClassRecord) {
  try {
    await ElMessageBox.confirm(
      `确定要删除班级 "${row.className}" 吗？`,
      '确认删除',
      { type: 'warning' }
    );
  } catch {
    return;
  }

  const ok = await store.remove(row.id);
  if (ok) {
    ElMessage.success('删除成功');
    refreshList();
  }
  // 失败时错误提示由响应拦截器统一渲染后端 message
}

function statusText(status: number): string {
  return status === ClassStatus.ACTIVE ? '启用' : '停用';
}

onMounted(() => {
  refreshList();
});
</script>

<template>
  <div class="class-view">
    <header class="page-header">
      <h1 class="page-title">班级管理</h1>
      <p class="page-subtitle">维护班级信息，包含班级名称、代码、年级与学期</p>
    </header>

    <!-- 操作栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <Search :size="15" class="search-icon" />
          <input
            v-model="queryParams.className"
            type="text"
            placeholder="搜索班级名称..."
            class="search-input"
            @keyup.enter="handleSearch"
          />
        </div>
        <button class="btn btn-ghost" @click="handleSearch">搜索</button>
        <button class="btn btn-ghost" @click="refreshList">
          <RefreshCw :size="14" /> 刷新
        </button>
        <button class="btn btn-ghost" :class="{ 'sort-active': queryParams.isAsc }" @click="handleSort">
          <ArrowDownUp :size="14" />
          {{ queryParams.isAsc ? '升序' : '降序' }}
        </button>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary" @click="openCreate">
          <Plus :size="14" /> 新建班级
        </button>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-card">
      <el-table
        :data="store.records"
        v-loading="store.loading"
        stripe
      >
        <el-table-column prop="className" label="班级名称" min-width="160">
          <template #default="{ row }">
            <span class="cell-strong">{{ row.className }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="classCode" label="班级代码" width="140">
          <template #default="{ row }">
            <code class="cell-code">{{ row.classCode }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="grade" label="年级" width="90" align="center">
          <template #default="{ row }">
            {{ row.grade }} 年级
          </template>
        </el-table-column>
        <el-table-column prop="semester" label="学期" width="160">
          <template #default="{ row }">
            <span class="cell-muted">{{ row.semester || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" align="center">
          <template #default="{ row }">
            <span :class="['status-tag', row.status === 1 ? 'status-active' : 'status-inactive']">
              {{ statusText(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="180" align="center">
          <template #default="{ row }">
            <span class="cell-muted">{{ row.createTime || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <button class="action-btn" @click="openEdit(row)">
              <Pencil :size="13" /> 编辑
            </button>
            <button class="action-btn action-danger" @click="handleDelete(row)">
              <Trash2 :size="13" /> 删除
            </button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-bar">
        <div class="pagination-info">
          共 {{ store.total }} 条记录
        </div>
        <div class="pagination-controls">
          <el-select
            v-model="queryParams.pageSize"
            @change="handlePageSizeChange"
            class="page-size-select"
            size="small"
          >
            <el-option :value="10" label="10条/页" />
            <el-option :value="20" label="20条/页" />
            <el-option :value="50" label="50条/页" />
          </el-select>
          <el-pagination
            v-model:current-page="queryParams.pageNum"
            :page-size="queryParams.pageSize"
            :total="store.total"
            layout="prev, pager, next"
            @current-change="handlePageChange"
          />
        </div>
      </div>
    </div>

    <!-- 创建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建班级' : '编辑班级'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="class-form"
      >
        <el-form-item label="班级名称" prop="className">
          <el-input v-model="form.className" placeholder="请输入班级名称" />
        </el-form-item>
        <el-form-item label="班级代码" prop="classCode">
          <el-input v-model="form.classCode" placeholder="请输入班级代码" />
        </el-form-item>
        <div class="form-row">
          <el-form-item label="年级" prop="grade">
            <el-select v-model="form.grade" placeholder="请选择年级" class="full-width">
              <el-option
                v-for="g in gradeOptions"
                :key="g"
                :value="g"
                :label="`${g} 年级`"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" class="full-width">
              <el-option :value="1" label="启用" />
              <el-option :value="0" label="停用" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="所属用户 ID" prop="userId">
          <el-input-number v-model="form.userId" :min="0" controls-position="right" class="full-width" />
        </el-form-item>
        <el-form-item label="学期" prop="semester">
          <el-input v-model="form.semester" placeholder="如 2025-2026-1" />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn btn-ghost" @click="dialogVisible = false">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '保存' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.class-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

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

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 240px;
  height: 36px;
  padding: 0 12px 0 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
  transition: border-color var(--transition), background var(--transition);
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.search-input:focus {
  border-color: var(--border-strong);
  background: var(--bg-surface);
}

/* Buttons */
.btn {
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
  border: 1px solid transparent;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.btn-ghost.sort-active {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

/* Table Card */
.table-card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
  padding: 20px;
}

.cell-strong {
  font-weight: 500;
  color: var(--text-primary);
}

.cell-code {
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
}

.cell-muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.status-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
}

.status-active {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.status-inactive {
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

/* Action Buttons */
.action-btn {
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background var(--transition), color var(--transition);
  margin: 0 3px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.action-btn:hover {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
}

.action-btn.action-danger:hover {
  background: var(--status-danger-bg);
  color: var(--status-danger);
}

/* Pagination */
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.pagination-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-size-select {
  width: 110px;
}

.page-size-select :deep(.el-input__wrapper) {
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: 0 0 0 1px var(--border-default) inset;
  transition: box-shadow var(--transition);
}

.page-size-select :deep(.el-input__inner) {
  font-size: 13px;
  color: var(--text-primary);
}

.page-size-select :deep(.el-input__wrapper.is-focused) {
  box-shadow: 0 0 0 1px var(--border-strong) inset !important;
}

.page-size-select :deep(.el-select__caret) {
  color: var(--text-tertiary);
}

.page-size-select :deep(.el-select-dropdown__item) {
  font-size: 13px;
}

.page-size-select :deep(.el-select-dropdown__item.selected) {
  color: var(--text-primary);
  font-weight: 600;
}

.page-size-select :deep(.el-select-dropdown__item.hover),
.page-size-select :deep(.el-select-dropdown__item:hover) {
  background: var(--bg-subtle);
}

/* Form */
.class-form {
  padding: 4px 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.full-width {
  width: 100%;
}

.class-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  padding-bottom: 4px;
}

.class-form :deep(.el-input__wrapper),
.class-form :deep(.el-input-number) {
  border-radius: var(--radius-md);
}

.class-form :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  box-shadow: 0 0 0 1px var(--border-default) inset;
  transition: box-shadow var(--transition);
}

.class-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--border-strong) inset !important;
}

.class-form :deep(.el-input__inner) {
  font-size: 13px;
  color: var(--text-primary);
}

.class-form :deep(.el-input__inner::placeholder) {
  color: var(--text-tertiary);
}

/* Dialog */
:deep(.el-dialog) {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  box-shadow: 0 12px 32px rgba(28, 25, 23, 0.08);
}

:deep(.el-dialog__header) {
  padding: 20px 24px 12px;
  margin-right: 0;
  border-bottom: 1px solid var(--border-subtle);
}

:deep(.el-dialog__title) {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

:deep(.el-dialog__body) {
  padding: 24px;
}

:deep(.el-dialog__footer) {
  padding: 16px 24px 20px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 响应式 */
@media (max-width: 640px) {
  .class-view {
    padding: 24px 16px;
  }

  .page-title {
    font-size: 20px;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-left,
  .toolbar-right {
    flex-wrap: wrap;
  }

  .search-input {
    width: 100%;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
