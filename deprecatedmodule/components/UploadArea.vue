<template>
  <div
    class="upload-area"
    :class="{
      'is-dragover': isDragover,
      'is-uploading': uploading,
      'is-completed': hasCompletedFiles,
    }"
    @click="handleClick"
    @drop.prevent="handleDrop"
    @dragover.prevent="handleDragover"
    @dragenter.prevent="handleDragenter"
    @dragleave.prevent="handleDragleave"
    @dragend="handleDragend"
  >
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="upload-input"
      @change="handleFileChange"
    />

    <!-- 状态 1：空闲（无文件、未上传） -->
    <div v-if="!uploading && !hasCompletedFiles" class="upload-placeholder">
      <div class="upload-icon-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <p class="upload-text">{{ placeholderText }}</p>
      <p class="upload-hint">{{ hintText }}</p>
    </div>

    <!-- 状态 2：上传中 — 展示当前文件名 + 进度条 -->
    <div v-else-if="uploading" class="upload-progress">
      <div class="upload-status-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="status-spinner">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span class="status-banner-text">
          {{ multiple && (totalCount ?? 0) > 1 ? `正在上传 ${currentIndex} / ${totalCount}` : '正在上传...' }}
        </span>
      </div>
      <div v-if="progress" class="file-info">
        <div class="file-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="file-details">
          <span class="file-name">{{ progress.fileName }}</span>
          <span class="file-size">{{ formatFileSize(progress.fileSize) }}</span>
        </div>
      </div>
      <div class="progress-wrapper">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (progress?.percent ?? 0) + '%' }" />
        </div>
        <span class="progress-text">{{ progress?.percent ?? 0 }}%</span>
      </div>
    </div>

    <!-- 状态 3：已上传完成 — 在上传区内直接展示已上传文件列表 -->
    <div v-else-if="hasCompletedFiles" class="upload-completed">
      <div class="completed-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="completed-check">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="completed-banner-text">
          已上传 {{ completedFiles!.length }} 个文件 — 可点击此区域重新选择文件覆盖
        </span>
      </div>
      <ul class="completed-files-list">
        <li v-for="(f, idx) in completedFiles" :key="idx" class="completed-file-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="completed-file-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div class="completed-file-info">
            <span class="completed-file-name">{{ f.name }}</span>
            <span class="completed-file-size">{{ formatFileSize(f.size) }}</span>
          </div>
          <span class="completed-file-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="badge-check">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { formatFileSize } from '@/utils/format';
import type { UploadProgress } from '@/types';

const props = defineProps<{
  uploading: boolean;
  progress: UploadProgress | null;
  /** input 的 accept 属性，如 '.zip' 或 '.docx,.doc' */
  accept?: string;
  /** 是否允许多选 */
  multiple?: boolean;
  /** 多文件上传时当前索引（从 1 开始） */
  currentIndex?: number;
  /** 多文件上传总数 */
  totalCount?: number;
  /** 占位主文案 */
  placeholder?: string;
  /** 占位提示文案 */
  hint?: string;
  /** 已上传完成的文件列表（展示在 UploadArea 内部） */
  completedFiles?: { name: string; size: number }[];
}>();

const emit = defineEmits<{
  upload: [files: File[]];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isDragover = ref(false);
/** 拖拽深度计数：解决 dragover/dragleave 在子元素间穿梭导致的闪烁 */
let dragDepth = 0;

const placeholderText = computed(() => props.placeholder || '点击或拖拽上传文件');
const hintText = computed(() => props.hint || '支持文件拖放');
const hasCompletedFiles = computed(() => (props.completedFiles?.length ?? 0) > 0);

/** 校验文件名是否符合 accept 后缀 */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const exts = accept.split(',').map((s) => s.trim().toLowerCase());
  const name = file.name.toLowerCase();
  return exts.some((ext) => name.endsWith(ext));
}

/**
 * 统一发 upload 事件。先把 FileList 复制成真数组，再过滤；
 * 注意 drop 时如果没 preventDefault，浏览器会默认把文件当 URL 打开并清空 dataTransfer.files，
 * 因此外层模板已加 @drop.prevent，此处也再防御性地把 files 拷贝出来。
 */
function emitFiles(files: FileList | File[] | undefined) {
  if (!files || files.length === 0) return;
  const arr: File[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = (files as FileList)[i];
    if (f && matchesAccept(f, props.accept)) arr.push(f);
  }
  if (arr.length === 0) return;
  emit('upload', arr);
}

function handleClick() {
  if (props.uploading) return;
  inputRef.value?.click();
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  emitFiles(target.files ?? undefined);
  target.value = '';
}

function handleDragover(e: DragEvent) {
  // dragover 过程中持续把 isDragover 拉高，保证高亮稳定
  e.preventDefault();
  if (!isDragover.value && dragDepth > 0) isDragover.value = true;
}

function handleDragenter(e: DragEvent) {
  e.preventDefault();
  dragDepth++;
  isDragover.value = true;
}

function handleDragleave(e: DragEvent) {
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDragover.value = false;
}

function handleDragend() {
  dragDepth = 0;
  isDragover.value = false;
}

function handleDrop(e: DragEvent) {
  // 保险：再防一次默认行为与副作用
  if (e.preventDefault) e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();
  dragDepth = 0;
  isDragover.value = false;
  const dt = e.dataTransfer;
  if (!dt) return;
  // 从 items 里解析文件，比直接读 files 更稳（某些浏览器 drop 后 files 会被清空）
  if (dt.items && dt.items.length > 0) {
    const picked: File[] = [];
    for (let i = 0; i < dt.items.length; i++) {
      const it = dt.items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) picked.push(f);
      }
    }
    emitFiles(picked);
    return;
  }
  // 兜底：读 files
  emitFiles(dt.files);
}
</script>

<style scoped>
.upload-area {
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 40px 28px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  background: var(--bg-subtle);
}

/* ---- 拖拽悬停高亮：用 accent 色让用户明确感知"松手即接收" ---- */
.upload-area.is-dragover {
  border-color: var(--accent, var(--text-primary));
  background: var(--accent-bg, var(--bg-muted));
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.upload-area:hover:not(.is-uploading) {
  border-color: var(--text-secondary);
  background: var(--bg-muted);
}

/* ---- 已完成态：绿色实线边框 + 成功色浅底 ---- */
.upload-area.is-completed {
  border-style: solid;
  border-color: var(--status-success, #22c55e);
  background: var(--status-success-bg, rgba(34, 197, 94, 0.08));
}

.upload-area.is-uploading {
  cursor: default;
  border-color: var(--accent, var(--text-primary));
  background: var(--accent-bg, var(--bg-muted));
}

.upload-input {
  display: none;
}

/* ==================== 状态 1：空闲占位 ==================== */
.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.upload-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  transition: background var(--transition), border-color var(--transition);
}

.upload-area:hover .upload-icon-wrapper,
.upload-area.is-dragover .upload-icon-wrapper {
  background: var(--bg-surface);
  border-color: var(--accent, var(--border-strong));
}

.upload-area.is-dragover .upload-icon {
  color: var(--accent, var(--text-primary));
}

.upload-icon {
  width: 24px;
  height: 24px;
  color: var(--text-secondary);
  transition: color var(--transition);
}

.upload-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
}

.upload-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

/* ==================== 状态 2：上传中 ==================== */
.upload-progress {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.upload-status-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  background: var(--accent-bg, rgba(59, 130, 246, 0.1));
}

.status-spinner {
  width: 16px;
  height: 16px;
  color: var(--accent, var(--text-primary));
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-banner-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, var(--text-primary));
}

.file-info {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: center;
}

.file-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-icon svg {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
}

.file-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.file-size {
  font-size: 12px;
  color: var(--text-secondary);
}

.progress-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--border-default);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent, var(--text-primary));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ==================== 状态 3：已上传完成 ==================== */
.upload-completed {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
}

.completed-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  background: var(--status-success-bg, rgba(34, 197, 94, 0.1));
}

.completed-check {
  width: 20px;
  height: 20px;
  color: var(--status-success, #22c55e);
  flex-shrink: 0;
}

.completed-banner-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--status-success, #22c55e);
}

.completed-files-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.completed-file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color var(--transition);
}

.completed-file-item:hover {
  border-color: var(--border-strong);
}

.completed-file-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.completed-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.completed-file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.completed-file-size {
  font-size: 12px;
  color: var(--text-tertiary);
}

.completed-file-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--status-success, #22c55e);
  flex-shrink: 0;
}

.badge-check {
  width: 12px;
  height: 12px;
  color: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .status-spinner { animation: none; }
  .progress-fill { transition: none; }
}
</style>
