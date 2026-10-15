<template>
  <div class="progress-panel">
    <div class="panel-header">
      <h3>批阅进度</h3>
      <div class="panel-header__right">
        <!-- 数据来源：GET /api/grading/task/detail/{taskId} 的 studentCount / processedStudentCount / status -->
        <span v-if="task" class="task-name" :title="task.fileName">{{ task.fileName || task.id }}</span>
        <button class="refresh-btn" title="刷新" @click="$emit('refresh')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 总体进度 -->
    <div class="overall-progress">
      <div class="progress-ring-wrapper">
        <svg class="progress-ring" viewBox="0 0 120 120">
          <circle class="progress-ring-bg" cx="60" cy="60" r="52" />
          <circle
            class="progress-ring-fill"
            cx="60"
            cy="60"
            r="52"
            :style="{ strokeDasharray: `${clampedPercent * 3.27} 327` }"
          />
        </svg>
        <div class="progress-ring-content">
          <span class="progress-num">{{ clampedPercent }}</span>
          <span class="progress-unit">%</span>
        </div>
      </div>

      <div class="progress-stats">
        <div class="stat-item">
          <span class="stat-value">{{ task?.studentCount ?? 0 }}</span>
          <span class="stat-label">应交总人数</span>
        </div>
        <div class="stat-item stat-completed">
          <span class="stat-value">{{ task?.processedStudentCount ?? 0 }}</span>
          <span class="stat-label">已批阅</span>
        </div>
        <div class="stat-item stat-pending">
          <span class="stat-value">{{ remaining }}</span>
          <span class="stat-label">待批阅</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">
            <span :class="['status-badge', `status-badge--${statusType}`]">{{ statusLabel }}</span>
          </span>
          <span class="stat-label">任务状态</span>
        </div>
        <div v-if="(task?.retryCount ?? 0) > 0" class="stat-item stat-failed">
          <span class="stat-value">{{ task?.retryCount }}</span>
          <span class="stat-label">已重试次数</span>
        </div>
      </div>
    </div>

    <!-- 失败原因（后端 GradingTask.errorMessage） -->
    <div v-if="task?.errorMessage" class="error-box">
      <span class="error-box__label">失败原因</span>
      <span class="error-box__text">{{ task.errorMessage }}</span>
    </div>

    <!-- 任务控制：暂停 / 继续 / 取消 / 重试，均由父级回调 store -->
    <div class="control-actions">
      <template v-if="task">
        <button v-if="isActive" class="btn-control" @click="$emit('pause')">暂停</button>
        <button v-if="isActive" class="btn-control btn-control--danger" @click="$emit('cancel')">取消</button>
        <button v-if="!isActive" class="btn-control" @click="$emit('resume')">继续</button>
        <button v-if="task.status === 'FAILED'" class="btn-control" @click="$emit('retry')">重试任务</button>
      </template>
      <span v-else class="control-hint">选择批阅任务后可进行暂停 / 继续 / 取消 / 重试操作</span>
    </div>

    <!--
      接口预留：后端未提供按批阅任务查询各学生批阅状态的接口，
      此处不再渲染逐学生状态明细列表（原 progress.students）。
    -->
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { GradingTask } from '@/types/history';
import { statusMap, GradingTaskStatus } from '@/types/history';

const props = defineProps<{
  /** 批阅任务详情（进度口径：processedStudentCount / studentCount） */
  task: GradingTask | null;
}>();

defineEmits<{
  refresh: [];
  pause: [];
  resume: [];
  cancel: [];
  retry: [];
}>();

/** 任务是否处于进行中（PENDING / PROCESSING） */
const isActive = computed(
  () => props.task?.status === GradingTaskStatus.PENDING || props.task?.status === GradingTaskStatus.PROCESSING,
);

/** 进度百分比：由任务详情两个计数字段就地推导，不依赖父级传参 */
const clampedPercent = computed(() => {
  const t = props.task;
  if (!t || !t.studentCount) return 0;
  return Math.max(0, Math.min(100, Math.round((t.processedStudentCount / t.studentCount) * 100)));
});

const remaining = computed(() => {
  const t = props.task;
  if (!t) return 0;
  return Math.max(0, t.studentCount - t.processedStudentCount);
});

const statusLabel = computed(() => {
  const t = props.task;
  return t ? (statusMap[t.status]?.label ?? t.status) : '未开始';
});

/** statusMap 的 type 取值与本页 st-badge / status-badge 后缀同名 */
const statusType = computed(() => {
  const t = props.task;
  return t ? (statusMap[t.status]?.type ?? 'info') : 'info';
});
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
  gap: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.panel-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.task-name {
  font-size: 12.5px;
  color: var(--text-tertiary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.refresh-btn {
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
  flex-shrink: 0;
}

.refresh-btn:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.refresh-btn svg {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
}

.overall-progress {
  display: flex;
  align-items: center;
  gap: 48px;
  margin-bottom: 20px;
  padding: 24px;
  background: var(--bg-subtle);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}

.progress-ring-wrapper {
  position: relative;
  width: 110px;
  height: 110px;
  flex-shrink: 0;
}

.progress-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.progress-ring-bg {
  fill: none;
  stroke: var(--border-default);
  stroke-width: 8;
}

.progress-ring-fill {
  fill: none;
  stroke: var(--text-primary);
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
  font-size: 26px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.progress-unit {
  font-size: 12px;
  color: var(--text-tertiary);
}

.progress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-completed .stat-value { color: var(--status-success); }
.stat-pending .stat-value { color: var(--text-secondary); }
.stat-failed .stat-value { color: var(--status-danger); }

/* 状态徽章（与 types/history statusMap 的 type 对应） */
.status-badge {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  line-height: 1.5;
}

.status-badge--success { background: var(--status-success-bg); color: var(--status-success); }
.status-badge--warning { background: var(--status-warning-bg); color: var(--status-warning); }
.status-badge--danger { background: var(--status-danger-bg); color: var(--status-danger); }
.status-badge--info { background: var(--status-info-bg); color: var(--status-info); }

/* 失败原因 */
.error-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--status-danger-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.error-box__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--status-danger);
  flex-shrink: 0;
}

.error-box__text {
  font-size: 12.5px;
  color: var(--status-danger);
  line-height: 1.6;
  word-break: break-all;
}

/* 控制按钮 */
.control-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.control-hint {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.btn-control {
  height: 32px;
  padding: 0 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
  font-family: inherit;
}

.btn-control:hover {
  background: var(--bg-muted);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn-control--danger:hover {
  background: var(--status-danger-bg);
  border-color: var(--status-danger);
  color: var(--status-danger);
}

@media (max-width: 640px) {
  .overall-progress {
    gap: 24px;
  }
}
</style>
