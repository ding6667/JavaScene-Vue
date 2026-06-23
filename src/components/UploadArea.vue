<template>
  <div class="upload-area" :class="{ 'is-dragover': isDragover, 'is-uploading': uploading }" @click="handleClick" @drop="handleDrop" @dragover.prevent @dragenter.prevent="isDragover = true" @dragleave.prevent="isDragover = false">
    <input
      ref="inputRef"
      type="file"
      accept=".zip"
      class="upload-input"
      @change="handleFileChange"
    />

    <div v-if="!uploading" class="upload-placeholder">
      <div class="upload-icon-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <p class="upload-text">点击或拖拽上传 .zip 压缩包</p>
      <p class="upload-hint">支持文件拖放，仅接受 .zip 格式</p>
    </div>

    <div v-else-if="progress" class="upload-progress">
      <div class="file-info">
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
          <div class="progress-fill" :style="{ width: progress.percent + '%' }" />
        </div>
        <span class="progress-text">{{ progress.percent }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { formatFileSize } from '@/utils/format';

defineProps<{
  uploading: boolean;
  progress: {
    fileName: string;
    fileSize: number;
    loaded: number;
    total: number;
    percent: number;
  } | null;
}>();

const emit = defineEmits<{
  upload: [file: File];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isDragover = ref(false);

function handleClick() {
  inputRef.value?.click();
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    emit('upload', file);
  }
  target.value = '';
}

function handleDrop(e: DragEvent) {
  isDragover.value = false;
  const file = e.dataTransfer?.files[0];
  if (file && file.name.endsWith('.zip')) {
    emit('upload', file);
  }
}
</script>

<style scoped>
.upload-area {
  border: 2px dashed #cbd5e1;
  border-radius: 16px;
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fafafa;
}

.upload-area:hover,
.upload-area.is-dragover {
  border-color: #818cf8;
  background: #f5f3ff;
}

.upload-input {
  display: none;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.upload-icon {
  width: 28px;
  height: 28px;
  color: #3b82f6;
}

.upload-text {
  font-size: 15px;
  font-weight: 500;
  color: #475569;
  margin: 0;
}

.upload-hint {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

.upload-progress {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: center;
}

.file-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-icon svg {
  width: 22px;
  height: 22px;
  color: #d97706;
}

.file-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.file-size {
  font-size: 13px;
  color: #64748b;
}

.progress-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #6366f1;
  min-width: 48px;
  text-align: right;
}
</style>
