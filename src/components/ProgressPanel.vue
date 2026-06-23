<template>
  <div class="progress-panel">
    <div class="panel-header">
      <h3>批阅进度</h3>
      <button class="refresh-btn" @click="$emit('refresh')" title="刷新">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
    </div>

    <!-- 总体进度 -->
    <div class="overall-progress">
      <div class="progress-ring-wrapper">
        <svg class="progress-ring" viewBox="0 0 120 120">
          <circle
            class="progress-ring-bg"
            cx="60"
            cy="60"
            r="52"
          />
          <circle
            class="progress-ring-fill"
            cx="60"
            cy="60"
            r="52"
            :style="{
              strokeDasharray: `${progressPercent * 3.27} 327`,
            }"
          />
        </svg>
        <div class="progress-ring-content">
          <span class="progress-num">{{ progressPercent }}</span>
          <span class="progress-unit">%</span>
        </div>
      </div>

      <div class="progress-stats">
        <div class="stat-item">
          <span class="stat-value">{{ progress?.total ?? 0 }}</span>
          <span class="stat-label">总人数</span>
        </div>
        <div class="stat-item stat-completed">
          <span class="stat-value">{{ progress?.completed ?? 0 }}</span>
          <span class="stat-label">已完成</span>
        </div>
        <div class="stat-item stat-processing">
          <span class="stat-value">{{ progress?.processing ?? 0 }}</span>
          <span class="stat-label">处理中</span>
        </div>
        <div class="stat-item stat-pending">
          <span class="stat-value">{{ progress?.pending ?? 0 }}</span>
          <span class="stat-label">待处理</span>
        </div>
        <div v-if="(progress?.failed ?? 0) > 0" class="stat-item stat-failed">
          <span class="stat-value">{{ progress?.failed ?? 0 }}</span>
          <span class="stat-label">失败</span>
        </div>
      </div>
    </div>

    <!-- 学生状态列表 -->
    <div v-if="progress?.students?.length" class="student-list">
      <div class="list-header">
        <span>学号</span>
        <span>姓名</span>
        <span>状态</span>
      </div>
      <div
        v-for="student in progress.students"
        :key="student.studentId"
        class="student-item"
      >
        <span class="student-id">{{ student.studentId }}</span>
        <span class="student-name">{{ student.studentName }}</span>
        <span :class="['student-status', 'status-' + student.status]">
          {{ statusText(student.status) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GradingProgress, GradingStatus } from '@/types';

defineProps<{
  progress: GradingProgress | null;
  progressPercent: number;
}>();

defineEmits<{
  refresh: [];
}>();

const statusMap: Record<GradingStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

function statusText(status: GradingStatus): string {
  return statusMap[status];
}
</script>

<style scoped>
.progress-panel {
  padding: 4px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.refresh-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.refresh-btn:hover {
  background: #e2e8f0;
}

.refresh-btn svg {
  width: 16px;
  height: 16px;
  color: #64748b;
}

.refresh-btn.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.overall-progress {
  display: flex;
  align-items: center;
  gap: 48px;
  margin-bottom: 24px;
  padding: 24px;
  background: #f8fafc;
  border-radius: 12px;
}

.progress-ring-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.progress-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.progress-ring-bg {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 8;
}

.progress-ring-fill {
  fill: none;
  stroke: url(#gradient);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}

.progress-ring-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.progress-num {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
}

.progress-unit {
  font-size: 12px;
  color: #94a3b8;
}

.progress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
}

.stat-completed .stat-value { color: #16a34a; }
.stat-processing .stat-value { color: #f59e0b; }
.stat-pending .stat-value { color: #64748b; }
.stat-failed .stat-value { color: #ef4444; }

.student-list {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
}

.list-header {
  display: grid;
  grid-template-columns: 120px 100px 80px;
  gap: 16px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.student-item {
  display: grid;
  grid-template-columns: 120px 100px 80px;
  gap: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  transition: background 0.15s;
}

.student-item:hover {
  background: #f8fafc;
}

.student-id {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: #475569;
}

.student-name {
  font-size: 14px;
  color: #0f172a;
}

.student-status {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 20px;
  display: inline-block;
  width: fit-content;
}

.status-pending {
  background: #f1f5f9;
  color: #64748b;
}

.status-processing {
  background: #fef3c7;
  color: #d97706;
}

.status-completed {
  background: #dcfce7;
  color: #16a34a;
}

.status-failed {
  background: #fee2e2;
  color: #dc2626;
}
</style>
