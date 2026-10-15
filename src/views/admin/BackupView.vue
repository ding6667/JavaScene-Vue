<script setup lang="ts">
/**
 * 数据备份与恢复 —— UI 骨架页（后端无对应接口）
 *
 * 接口预留：后端未提供数据备份接口（备份列表 / 手动备份 / 按备份点恢复均未开放），
 * 需后端补充：定时任务产出备份记录并开放查询、手动触发备份、恢复前的一致性校验。
 * 本文件不接 api / pinia，备份列表为空数组占位。
 */
import { ref } from 'vue';
import {
  CalendarClock,
  DatabaseBackup,
  Download,
  HardDriveDownload,
  RotateCcw,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

/** 备份记录占位结构 */
interface BackupRow {
  id: string;
  time: string;
  type: 'manual' | 'auto';
  dataSize: string;
  status: 'success' | 'failed';
  note: string;
}

const backups = ref<BackupRow[]>([]);

/** 备份范围（仅界面勾选状态） */
const scope = ref<string[]>(['business', 'knowledge', 'file']);

const SCOPE_OPTIONS = [
  { value: 'business', label: '业务库（用户 / 学习记录 / 作业）' },
  { value: 'knowledge', label: '知识库（章节 / 知识点 / 教材原文）' },
  { value: 'file', label: '资源文件（上传附件 / 图片）' },
];

function handleBackup() {
  // 接口预留：后端未提供数据备份接口，此处不发起请求
  ElMessage.info('接口预留：后端未提供数据备份接口');
}

function handleRestore(r: BackupRow) {
  ElMessage.info(`接口预留：后端未提供数据恢复接口（目标备份点 ${fmt(r.time)}）`);
}

function handleDownload() {
  // 接口预留：后端未提供备份文件下载接口
  ElMessage.info('接口预留：后端未提供备份文件下载接口');
}

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">数据备份与恢复</h1>
      <p class="st-page-subtitle">教学数据、用户数据、资源数据定时备份 · 支持手动备份与异常恢复</p>
    </header>

    <!-- 备份策略 + 手动备份 -->
    <div class="st-card">
      <div class="st-card__body policy-row">
        <div class="policy-info">
          <CalendarClock :size="16" class="policy-icon" />
          <div>
            <div class="policy-title">定时备份策略</div>
            <div class="policy-desc">
              规划：每日 03:00 自动全量备份，保留最近 30 份；周期可在「系统参数」中调整。
              接口预留：后端未提供数据备份接口，以下操作仅保留界面骨架。
            </div>
            <el-checkbox-group v-model="scope" class="scope-group">
              <el-checkbox v-for="o in SCOPE_OPTIONS" :key="o.value" :value="o.value" :label="o.value">
                {{ o.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </div>
        <button class="st-btn st-btn--primary" @click="handleBackup">
          <HardDriveDownload :size="14" /> 立即手动备份
        </button>
      </div>
    </div>

    <!-- 备份记录 -->
    <div class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <DatabaseBackup :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">备份记录</h2>
          <p class="st-card__hint">共 {{ backups.length }} 份 · 接口预留，暂无数据来源</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="bk-table">
          <thead>
            <tr>
              <th style="width: 170px;">备份时间</th>
              <th style="width: 90px;">类型</th>
              <th style="width: 110px;">数据量</th>
              <th style="width: 90px;">状态</th>
              <th>备注</th>
              <th style="width: 170px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in backups" :key="r.id">
              <td class="mono">{{ fmt(r.time) }}</td>
              <td>
                <span class="st-badge" :class="r.type === 'manual' ? 'st-badge--outline' : 'st-badge--neutral'">
                  {{ r.type === 'manual' ? '手动' : '定时' }}
                </span>
              </td>
              <td class="muted mono">{{ r.dataSize }}</td>
              <td>
                <span class="st-badge" :class="r.status === 'success' ? 'st-badge--success' : 'st-badge--danger'">
                  {{ r.status === 'success' ? '成功' : '失败' }}
                </span>
              </td>
              <td class="muted">{{ r.note || '—' }}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="handleDownload">
                  <Download :size="12" style="vertical-align: -2px; margin-right: 2px;" /> 下载
                </button>
                <button class="st-text-btn" @click="handleRestore(r)">
                  <RotateCcw :size="12" style="vertical-align: -2px; margin-right: 2px;" /> 恢复
                </button>
              </td>
            </tr>
            <!-- 无数据时保留表格骨架 -->
            <template v-if="backups.length === 0">
              <tr v-for="n in 4" :key="`ph-${n}`">
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--wide" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="backups.length === 0" class="st-empty">
          <DatabaseBackup :size="38" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无备份记录 · 接口预留：后端未提供数据备份接口</div>
        </div>
      </div>
    </div>

    <!-- 恢复须知 -->
    <div class="st-card restore-note" style="margin-top: 20px;">
      <div class="st-card__body">
        <div class="restore-note__title">恢复须知</div>
        <ul class="restore-note__list">
          <li>恢复将覆盖当前业务数据，需二次确认并记录操作人。</li>
          <li>恢复期间建议暂停写入，预计耗时约 1 分钟。</li>
          <li>接口预留：后端需提供备份可用性校验与恢复进度回调，前端方可安全开放该入口。</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.policy-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.policy-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 280px;
}

.policy-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}

.policy-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.policy-desc {
  font-size: 12.5px;
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-top: 2px;
  max-width: 620px;
}

.scope-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 10px;
}

/* 表格 */
.table-wrap {
  padding: 0 24px 20px;
  overflow-x: auto;
}

.bk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.bk-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.bk-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.bk-table tr:hover td {
  background: var(--bg-subtle);
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12.5px;
}

.muted {
  color: var(--text-tertiary);
  font-size: 12.5px;
}

/* 骨架占位 */
.skeleton-bar {
  display: inline-block;
  height: 10px;
  width: 100%;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
}

.skeleton-bar--sm {
  width: 70%;
}

.skeleton-bar--xs {
  width: 45%;
}

.skeleton-bar--wide {
  width: 85%;
}

/* 恢复须知 */
.restore-note__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.restore-note__list {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: var(--text-tertiary);
  line-height: 1.9;
}
</style>
