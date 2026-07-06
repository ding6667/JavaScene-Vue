<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Delete, RefreshCw, Search } from 'lucide-vue-next';
import { useUploadFileStore } from '@/stores/uploadFile';
import { formatFileSize } from '@/utils/format';
import type { UploadFileRecord } from '@/types/uploadFile';

const store = useUploadFileStore();

const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  fileName: '',
  isAsc: false,
});

const selectedIds = ref<string[]>([]);
const uploading = ref(false);

// 上传文件输入
const fileInput = ref<HTMLInputElement | null>(null);

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    uploadFile(file);
  }
  target.value = '';
}

async function uploadFile(file: File) {
  uploading.value = true;
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload/zip', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    if (result.code === 0 || result.code === 200) {
      ElMessage.success('上传成功');
      refreshList();
    } else {
      ElMessage.error(result.message || '上传失败');
    }
  } catch (e) {
    ElMessage.error('上传失败：' + (e as Error).message);
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
  } else {
    ElMessage.error('下载失败');
  }
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
  } else {
    ElMessage.error('删除失败');
  }
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
  } else {
    ElMessage.error('批量删除失败');
  }
}

function triggerUpload() {
  fileInput.value?.click();
}

onMounted(() => {
  refreshList();
});
</script>

<template>
  <div class="upload-files-view">
    <header class="page-header">
      <div class="header-content">
        <h1 class="page-title">上传文件管理</h1>
        <p class="page-subtitle">查看和管理已上传的作业压缩包</p>
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
      </div>
      <div class="toolbar-right">
        <button
          class="btn btn-primary"
          :disabled="selectedIds.length === 0"
          @click="handleBatchDelete"
        >
          <Delete :size="14" /> 批量删除{{ selectedIds.length > 0 ? `(${selectedIds.length})` : '' }}
        </button>
        <button class="btn btn-success" @click="triggerUpload">
          上传文件
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".zip"
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
        <el-table-column prop="expireTime" label="过期时间" width="180" align="center">
          <template #default="{ row }">
            <span :class="['expire-time', isExpiring(row.expireTime) ? 'expiring' : '']">
              {{ row.expireTime }}
              <span v-if="isExpiring(row.expireTime)" class="expire-tag">即将过期</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
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
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 15px;
  color: #64748b;
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
  gap: 10px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #94a3b8;
  pointer-events: none;
}

.search-input {
  width: 240px;
  height: 38px;
  padding: 0 12px 0 36px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #93c5fd;
}

/* Buttons */
.btn {
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  border: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.3);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(96, 165, 250, 0.4);
  transform: translateY(-1px);
}

.btn-success {
  background: linear-gradient(135deg, #86efac 0%, #4ade80 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(74, 222, 128, 0.3);
}

.btn-success:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(74, 222, 128, 0.4);
  transform: translateY(-1px);
}

.btn-search {
  background: #f1f5f9;
  color: #475569;
}

.btn-search:hover {
  background: #e2e8f0;
}

.btn-outline {
  background: transparent;
  border: 1px solid #e2e8f0;
  color: #475569;
}

.btn-outline:hover {
  background: #f8fafc;
  border-color: #93c5fd;
  color: #60a5fa;
}

.btn-outline.sort-active {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #93c5fd;
  color: #3b82f6;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(147, 197, 253, 0.2);
}

.sort-icon {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sort-asc {
  transform: rotate(180deg);
}

.sort-text {
  transition: color 0.2s ease;
}

/* Table Card */
.table-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #e2e8f0;
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
  color: #60a5fa;
  flex-shrink: 0;
}

.expire-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.expire-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fef3c7;
  color: #d97706;
  font-weight: 500;
}

.expiring {
  color: #d97706;
  font-weight: 500;
}

/* Action Buttons */
.action-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
  margin: 0 3px;
}

.action-download {
  background: #eff6ff;
  color: #3b82f6;
}

.action-download:hover {
  background: #dbeafe;
}

.action-delete {
  background: #fef2f2;
  color: #ef4444;
}

.action-delete:hover {
  background: #fee2e2;
}

/* Pagination */
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.pagination-info {
  font-size: 13px;
  color: #64748b;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-size-select {
  width: 100px;
}

.page-size-select :deep(.el-input__wrapper) {
  border-radius: 8px;
  transition: all 0.2s ease;
}

.page-size-select :deep(.el-input__inner) {
  font-size: 13px;
  color: #475569;
}

.page-size-select:hover :deep(.el-input__wrapper) {
  border-color: #93c5fd;
}

.page-size-select :deep(.el-input__wrapper.is-focused) {
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.2) !important;
  border-color: #93c5fd;
}

.page-size-select :deep(.el-select__caret) {
  color: #94a3b8;
  transition: transform 0.2s ease;
}

.page-size-select :deep(.el-select__caret.is-reverse) {
  transform: rotate(180deg);
}

.page-size-select :deep(.el-select-dropdown__item) {
  font-size: 13px;
  padding: 8px 16px;
}

.page-size-select :deep(.el-select-dropdown__item.selected) {
  color: #3b82f6;
  font-weight: 600;
}

.page-size-select :deep(.el-select-dropdown__item:hover) {
  background: #eff6ff;
}
</style>
