<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Delete, RefreshCw, Search } from 'lucide-vue-next';
import { useUploadFileStore } from '@/stores/uploadFile';
import { uploadFile } from '@/api/upload';
import { startProject, startCommon } from '@/api/grading';
import { getClassRecords } from '@/api/class';
import { getStandards } from '@/api/standard';
import { formatFileSize } from '@/utils/format';
import type { UploadFileRecord, UploadFileType } from '@/types/uploadFile';
import type { ClassRecord } from '@/types/class';
import type { StandardConfig } from '@/types/standard';
import type { TaskCategory } from '@/types';

const store = useUploadFileStore();

const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  fileName: '',
  isAsc: false,
  fileType: undefined as UploadFileType | undefined,
});

const selectedIds = ref<string[]>([]);
const uploading = ref(false);

// 上传文件输入
const fileInput = ref<HTMLInputElement | null>(null);

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    handleUpload(file);
  }
  target.value = '';
}

// 根据文件后缀判断 fileType（ZIP / WORD）
function detectFileType(fileName: string): UploadFileType | undefined {
  if (/\.zip$/i.test(fileName)) return 'ZIP';
  if (/\.(docx|doc)$/i.test(fileName)) return 'WORD';
  return undefined;
}

// 上传文件：仅调用上传接口，不批阅
async function handleUpload(file: File) {
  uploading.value = true;
  try {
    // 统一走 /api/upload/file，根据后缀传 fileType
    await uploadFile(file, undefined, detectFileType(file.name));
    ElMessage.success('上传成功');
    refreshList();
  } catch {
    // 错误由响应拦截器统一渲染后端 message
  } finally {
    uploading.value = false;
  }
}

function refreshList() {
  store.fetchFiles({ ...queryParams });
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

function handleSelectionChange(selection: UploadFileRecord[]) {
  selectedIds.value = selection.map(row => row.id);
}

async function handleDownload(row: UploadFileRecord) {
  const success = await store.downloadFile(row.id, row.fileName);
  if (success) {
    ElMessage.success('下载成功');
  }
  // 失败时错误提示由响应拦截器统一渲染后端 message
}

async function handleDelete(row: UploadFileRecord) {
  try {
    await ElMessageBox.confirm(`确定要删除文件 "${row.fileName}" 吗？`, '确认删除', {
      type: 'warning',
    });
  } catch {
    return;
  }

  const success = await store.deleteFile(row.id);
  if (success) {
    ElMessage.success('删除成功');
    refreshList();
  }
  // 失败时错误提示由响应拦截器统一渲染后端 message
}

async function handleBatchDelete() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请选择要删除的文件');
    return;
  }

  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 个文件吗？`, '批量删除', {
      type: 'warning',
    });
  } catch {
    return;
  }

  const success = await store.batchDelete(selectedIds.value);
  if (success) {
    ElMessage.success('批量删除成功');
    selectedIds.value = [];
    refreshList();
  }
  // 失败时错误提示由响应拦截器统一渲染后端 message
}

function triggerUpload() {
  fileInput.value?.click();
}

// ==================== 文件类型判断 ====================
function isZip(fileName: string): boolean {
  return /\.zip$/i.test(fileName);
}

function isWord(fileName: string): boolean {
  return /\.(docx|doc)$/i.test(fileName);
}

// ==================== 批阅功能 ====================
const gradeDialogVisible = ref(false);
const currentRow = ref<UploadFileRecord | null>(null);
const gradeSubmitting = ref(false);
const classList = ref<ClassRecord[]>([]);
const standardList = ref<StandardConfig[]>([]);

const gradeForm = reactive({
  classId: '',
  standardConfigId: undefined as number | undefined,
  taskCategory: undefined as TaskCategory | undefined,
  taskSequence: undefined as number | undefined,
});

async function loadOptions() {
  try {
    const [classRes, stdRes] = await Promise.all([
      getClassRecords({ pageNum: 1, pageSize: 200, isAsc: true }),
      getStandards(),
    ]);
    classList.value = classRes.data.records || [];
    standardList.value = (stdRes.data || []).filter((s) => s.id !== undefined);
  } catch {
    // 错误由拦截器统一提示
  }
}

function handleGrade(row: UploadFileRecord) {
  if (!isZip(row.fileName) && !isWord(row.fileName)) {
    ElMessage.error('仅支持对 .zip 或 .doc/.docx 文件进行批阅');
    return;
  }
  currentRow.value = row;
  gradeForm.classId = '';
  gradeForm.standardConfigId = undefined;
  gradeForm.taskCategory = undefined;
  gradeForm.taskSequence = undefined;
  gradeDialogVisible.value = true;
}

function validateGradeForm(): boolean {
  if (!gradeForm.classId) {
    ElMessage.warning('请选择班级');
    return false;
  }
  if (gradeForm.standardConfigId === undefined) {
    ElMessage.warning('请选择评分模板');
    return false;
  }
  if (!gradeForm.taskCategory) {
    ElMessage.warning('请选择任务类别');
    return false;
  }
  if (gradeForm.taskSequence === undefined || gradeForm.taskSequence < 1) {
    ElMessage.warning('请填写任务频率');
    return false;
  }
  return true;
}

async function handleGradeSubmit() {
  if (!currentRow.value || !validateGradeForm()) return;

  gradeSubmitting.value = true;
  try {
    const params = {
      classId: gradeForm.classId,
      standardConfigId: gradeForm.standardConfigId!,
      taskCategory: gradeForm.taskCategory!,
      taskSequence: gradeForm.taskSequence!,
    };

    // 根据文件类型调用对应批阅接口
    if (isZip(currentRow.value.fileName)) {
      await startProject({ ...params, uploadId: currentRow.value.id });
    } else {
      await startCommon({ ...params, uploadIds: [currentRow.value.id] });
    }

    ElMessage.success('批阅已启动');
    gradeDialogVisible.value = false;
  } catch {
    // 错误由响应拦截器统一渲染后端 message
  } finally {
    gradeSubmitting.value = false;
  }
}

onMounted(() => {
  refreshList();
  loadOptions();
});
</script>

<template>
  <div class="upload-files-view">
    <header class="page-header">
      <div class="header-content">
        <h1 class="page-title">上传文件管理</h1>
        <p class="page-subtitle">管理已上传的作业文件，可对单个文件发起批阅</p>
      </div>
    </header>

    <!-- 操作栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <Search :size="16" class="search-icon" />
          <input
            v-model="queryParams.fileName"
            type="text"
            placeholder="搜索文件名..."
            class="search-input"
            @keyup.enter="handleSearch"
          />
        </div>
        <button class="btn btn-search" @click="handleSearch">搜索</button>
        <button class="btn btn-outline" @click="refreshList">
          <RefreshCw :size="14" /> 刷新
        </button>
        <button class="btn btn-outline" @click="handleSort">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :size="14" class="sort-icon" :class="{ 'sort-asc': queryParams.isAsc }">
            <path d="M12 5v14M19 12l-7 7-7-7"/>
          </svg>
          <span class="sort-text" :class="{ 'sort-active': queryParams.isAsc }">
            {{ queryParams.isAsc ? '升序' : '降序' }}
          </span>
        </button>
        <el-select
          v-model="queryParams.fileType"
          placeholder="文件类型"
          clearable
          class="filter-select"
          @change="handleSearch"
        >
          <el-option label="ZIP" value="ZIP" />
          <el-option label="Word" value="WORD" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <button
          class="btn btn-primary"
          :disabled="selectedIds.length === 0"
          @click="handleBatchDelete"
        >
          <Delete :size="14" /> 批量删除{{ selectedIds.length > 0 ? `(${selectedIds.length})` : '' }}
        </button>
        <button class="btn btn-success" :disabled="uploading" @click="triggerUpload">
          {{ uploading ? '上传中...' : '上传文件' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".zip,.docx,.doc"
          style="display: none"
          @change="handleFileSelect"
        />
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-card">
      <el-table
        :data="store.records"
        v-loading="store.loading"
        @selection-change="handleSelectionChange"
        stripe
      >
        <el-table-column type="selection" width="48" align="center" />
        <el-table-column prop="fileName" label="文件名" min-width="200">
          <template #default="{ row }">
            <div class="file-name-cell">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>{{ row.fileName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="fileSize" label="文件大小" width="120" align="center">
          <template #default="{ row }">
            {{ formatFileSize(row.fileSize) }}
          </template>
        </el-table-column>
        <el-table-column prop="uploadTime" label="上传时间" width="180" align="center">
          <template #default="{ row }">
            {{ row.uploadTime }}
          </template>
        </el-table-column>
        <el-table-column prop="expireTime" label="过期时间" width="220" align="center">
          <template #default="{ row }">
            <span :class="['expire-time', isExpiring(row.expireTime) ? 'expiring' : '']">
              {{ row.expireTime }}
              <span v-if="isExpiring(row.expireTime)" class="expire-tag">即将过期</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right" align="center">
          <template #default="{ row }">
            <button class="action-btn action-grade" @click="handleGrade(row)">
              批阅
            </button>
            <button class="action-btn action-download" @click="handleDownload(row)">
              <Download :size="14" /> 下载
            </button>
            <button class="action-btn action-delete" @click="handleDelete(row)">
              <Delete :size="14" /> 删除
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

    <!-- ==================== 批阅参数弹窗 ==================== -->
    <el-dialog v-model="gradeDialogVisible" title="发起批阅" width="480px" destroy-on-close>
      <div v-if="currentRow" class="grade-dialog-body">
        <div class="grade-file-info">
          <span class="grade-file-label">目标文件：</span>
          <span class="grade-file-name">{{ currentRow.fileName }}</span>
          <span :class="['grade-file-type', isZip(currentRow.fileName) ? 'type-zip' : 'type-word']">
            {{ isZip(currentRow.fileName) ? 'ZIP' : 'Word' }}
          </span>
        </div>

        <el-form :model="gradeForm" label-position="top" class="grade-form">
          <el-form-item label="班级" required>
            <el-select v-model="gradeForm.classId" placeholder="请选择班级" filterable>
              <el-option
                v-for="c in classList"
                :key="c.id"
                :label="c.className"
                :value="String(c.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="评分模板" required>
            <el-select v-model="gradeForm.standardConfigId" placeholder="请选择评分模板" filterable>
              <el-option
                v-for="s in standardList"
                :key="s.id"
                :label="s.standardName"
                :value="s.id!"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="任务类别" required>
            <el-select v-model="gradeForm.taskCategory" placeholder="请选择任务类别">
              <el-option label="作业" value="HOMEWORK" />
              <el-option label="期中" value="MIDTERM" />
              <el-option label="期末" value="FINAL" />
              <el-option label="项目" value="PROJECT" />
            </el-select>
          </el-form-item>
          <el-form-item label="任务频率" required>
            <el-input-number
              v-model="gradeForm.taskSequence"
              :min="1"
              :controls="false"
              placeholder="第几次"
              class="sequence-input"
            />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <button type="button" class="btn btn-outline" @click="gradeDialogVisible = false">取消</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="gradeSubmitting"
          @click="handleGradeSubmit"
        >
          {{ gradeSubmitting ? '提交中...' : '开始批阅' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
export function isExpiring(expireTime: string): boolean {
  const now = new Date();
  const expire = new Date(expireTime);
  const diff = expire.getTime() - now.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  return days <= 7 && days > 0;
}
</script>

<style scoped>
.upload-files-view {
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
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
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

.btn-success {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-color: var(--text-primary);
}

.btn-success:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.btn-search {
  background: var(--bg-surface);
  border-color: var(--border-default);
  color: var(--text-secondary);
}

.btn-search:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.btn-outline {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.btn-outline:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn-outline.sort-active {
  background: var(--accent-bg-strong);
  border-color: var(--border-strong);
  color: var(--text-primary);
  font-weight: 600;
}

.sort-icon {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sort-asc {
  transform: rotate(180deg);
}

.sort-text {
  transition: color var(--transition);
}

.filter-select {
  width: 130px;
}

.filter-select :deep(.el-select__wrapper) {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: none !important;
  min-height: 36px;
  transition: border-color var(--transition);
}

.filter-select :deep(.el-select__wrapper:hover) {
  border-color: var(--border-strong);
}

.filter-select :deep(.el-select__wrapper.is-focused) {
  border-color: var(--text-primary) !important;
}

.filter-select :deep(.el-select__placeholder),
.filter-select :deep(.el-select__selected-item) {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Table Card */
.table-card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
  padding: 20px;
}

.file-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-icon {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.expire-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.expire-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--status-warning-bg);
  color: var(--status-warning);
  font-weight: 500;
}

.expiring {
  color: var(--status-warning);
  font-weight: 500;
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

.action-grade {
  background: var(--bg-subtle);
  color: var(--text-primary);
  font-weight: 500;
}

.action-grade:hover {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
}

.action-download:hover {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
}

.action-delete {
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.action-delete:hover {
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
  transition: transform var(--transition);
}

.page-size-select :deep(.el-select__caret.is-reverse) {
  transform: rotate(180deg);
}

.page-size-select :deep(.el-select-dropdown__item) {
  font-size: 13px;
  padding: 8px 16px;
}

.page-size-select :deep(.el-select-dropdown__item.selected) {
  color: var(--text-primary);
  font-weight: 600;
}

.page-size-select :deep(.el-select-dropdown__item.hover),
.page-size-select :deep(.el-select-dropdown__item:hover) {
  background: var(--bg-subtle);
}

/* ==================== 批阅弹窗 ==================== */
.grade-dialog-body {
  padding: 0 4px;
}

.grade-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
  font-size: 13px;
}

.grade-file-label {
  color: var(--text-secondary);
}

.grade-file-name {
  color: var(--text-primary);
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grade-file-type {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.type-zip {
  background: var(--accent-bg-strong);
  color: var(--text-primary);
}

.type-word {
  background: var(--status-warning-bg);
  color: var(--status-warning);
}

.grade-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.grade-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  padding-bottom: 6px;
  line-height: 1.4;
}

.grade-form :deep(.el-select),
.grade-form :deep(.el-input-number) {
  width: 100%;
}

.grade-form :deep(.el-select__wrapper),
.grade-form :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  box-shadow: 0 0 0 1px var(--border-default) inset;
  transition: box-shadow var(--transition);
}

.grade-form :deep(.el-select__wrapper.is-focused),
.grade-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--border-strong) inset !important;
}

.grade-form :deep(.el-select__wrapper:hover),
.grade-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--border-strong) inset;
}

.grade-form :deep(.el-input__inner) {
  font-size: 13px;
  color: var(--text-primary);
}

.sequence-input :deep(.el-input__inner) {
  text-align: left;
}

@media (max-width: 640px) {
  .upload-files-view {
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
}
</style>
