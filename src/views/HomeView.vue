<template>
  <div class="home-view">
    <!-- 页面标题 -->
    <header class="page-header">
      <div class="header-content">
        <h1 class="page-title">作业批阅</h1>
        <p class="page-subtitle">上传学生作业压缩包，系统将自动完成批阅</p>
      </div>
    </header>

    <div class="home-grid">
      <!-- 上传区域 -->
      <section class="card upload-card">
        <div class="card-header">
          <div class="card-icon upload-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h2 class="card-title">上传作业</h2>
        </div>

        <div class="card-body">
          <UploadArea
            :uploading="uploadStore.uploading"
            :progress="uploadStore.progress"
            @upload="handleUpload"
          />
          <div v-if="uploadError" class="error-text">{{ uploadError }}</div>
        </div>
      </section>

      <!-- 状态概览 -->
      <section class="card status-card">
        <div class="card-header">
          <div class="card-icon status-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <h2 class="card-title">当前状态</h2>
        </div>

        <div class="card-body">
          <div v-if="!gradingStore.gradingId" class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <p class="empty-text">暂无批阅任务</p>
            <p class="empty-hint">上传 .zip 文件开始批阅</p>
          </div>

          <div v-else class="status-info">
            <div class="status-item">
              <span class="status-label">批阅 ID</span>
              <code class="status-value status-id">{{ gradingStore.gradingId }}</code>
            </div>
            <div class="status-item">
              <span class="status-label">状态</span>
              <span :class="['status-badge', gradingStore.gradingActive ? 'status-badge--warning' : 'status-badge--success']">
                {{ gradingStore.gradingActive ? '批阅中' : '已完成' }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">进度</span>
              <span class="status-value">
                {{ gradingStore.statusCounts.completed }} / {{ gradingStore.progress?.total ?? 0 }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 批阅进度 -->
    <section v-if="gradingStore.progress" class="card progress-card">
      <div class="card-header">
        <div class="card-icon progress-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h2 class="card-title">批阅进度</h2>
      </div>
      <div class="card-body">
        <ProgressPanel
          :progress="gradingStore.progress"
          :progress-percent="gradingStore.progressPercent"
          @refresh="gradingStore.fetchProgress()"
        />
      </div>
    </section>

    <!-- 批阅结果 -->
    <section v-if="gradingStore.results.length > 0" class="card results-card">
      <div class="card-header">
        <div class="card-icon results-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2 class="card-title">批阅结果</h2>
      </div>
      <div class="card-body">
        <ResultTable
          :results="gradingStore.results"
          :loading="gradingStore.loading"
          @export="gradingStore.handleExport()"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import UploadArea from '@/components/UploadArea.vue';
import ProgressPanel from '@/components/ProgressPanel.vue';
import ResultTable from '@/components/ResultTable.vue';
import { useUploadStore } from '@/stores/upload';
import { useGradingStore } from '@/stores/grading';

const uploadStore = useUploadStore();
const gradingStore = useGradingStore();

const uploadError = computed(() => uploadStore.uploadError);

watch(
  () => uploadStore.uploadId,
  async (id) => {
    if (id) {
      const success = await uploadStore.triggerGrading();
      if (success) {
        ElMessage.success('上传成功，开始批阅');
        gradingStore.setGradingId(id);
        gradingStore.fetchProgress();
        gradingStore.startPolling(2000);
      } else {
        ElMessage.error('启动批阅失败');
      }
    }
  }
);

async function handleUpload(file: File) {
  if (!file.name.endsWith('.zip')) {
    ElMessage.error('请上传 .zip 格式的文件');
    return;
  }

  gradingStore.reset();
  const success = await uploadStore.handleUpload(file);
  if (!success) {
    ElMessage.error('上传失败');
  }
}
</script>

<style scoped>
.home-view {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px;
}

.page-header {
  margin-bottom: 32px;
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

.home-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
}

/* Card 基础样式 */
.card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 0;
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon svg {
  width: 20px;
  height: 20px;
}

.upload-icon {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #3b82f6;
}

.status-icon {
  background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
  color: #22c55e;
}

.progress-icon {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #f59e0b;
}

.results-icon {
  background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
  color: #8b5cf6;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin: 0;
}

.card-body {
  padding: 20px 24px 24px;
}

/* Upload Card */
.upload-card {
  min-height: 320px;
}

/* Status Card */
.status-card {
  min-height: 320px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.empty-icon svg {
  width: 28px;
  height: 28px;
  color: #94a3b8;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: #475569;
  margin: 0 0 4px 0;
}

.empty-hint {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 8px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-label {
  font-size: 14px;
  color: #64748b;
}

.status-value {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.status-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 6px;
  color: #475569;
}

.status-badge {
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 20px;
}

.status-badge--warning {
  background: #fef3c7;
  color: #d97706;
}

.status-badge--success {
  background: #dcfce7;
  color: #16a34a;
}

.error-text {
  margin-top: 12px;
  color: #ef4444;
  font-size: 14px;
}

/* Progress & Results Cards */
.progress-card,
.results-card {
  margin-bottom: 24px;
}

/* 响应式 */
@media (max-width: 1024px) {
  .home-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .home-view {
    padding: 16px;
  }

  .page-title {
    font-size: 22px;
  }

  .card-header {
    padding: 16px 16px 0;
  }

  .card-body {
    padding: 16px;
  }
}
</style>
