<script setup lang="ts">
/**
 * 日志审计 —— UI 骨架页（后端无对应接口）
 *
 * 接口预留：后端未提供操作日志 / 智能体调用日志 / 错误日志接口，
 * 需后端补充统一日志表与查询接口（建议按 requestId 关联链路，支持类型 + 关键词 + 时间范围分页）。
 * 本文件不接 api / pinia，日志列表为空数组占位；筛选条件仅维护 UI 局部状态。
 */
import { computed, ref } from 'vue';
import { Download, ScrollText, Search } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

type LogKind = 'operate' | 'agent' | 'error';

/** 日志行占位结构（待后端接口就绪后按其字段调整） */
interface LogRow {
  id: string;
  time: string;
  type: LogKind;
  source: string;
  operator: string;
  content: string;
  requestId: string;
  errorInfo: string;
}

const TYPE_TABS: { value: LogKind | 'all'; label: string }[] = [
  { value: 'all', label: '全部日志' },
  { value: 'operate', label: '用户操作日志' },
  { value: 'agent', label: '智能体运行日志' },
  { value: 'error', label: '系统异常日志' },
];

const TYPE_META: Record<LogKind, { label: string; badge: string }> = {
  operate: { label: '操作', badge: 'st-badge--outline' },
  agent: { label: '智能体', badge: 'st-badge--info' },
  error: { label: '异常', badge: 'st-badge--danger' },
};

const logs = ref<LogRow[]>([]);
const typeFilter = ref<LogKind | 'all'>('all');
const keyword = ref('');
const range = ref<[string, string] | null>(null);

/** 空数组下的本地筛选，接口接通后可直接换成后端分页查询 */
const filtered = computed(() => {
  let list = logs.value;
  if (typeFilter.value !== 'all') list = list.filter((l) => l.type === typeFilter.value);
  if (keyword.value.trim()) {
    const kw = keyword.value.trim();
    list = list.filter(
      (l) => l.source.includes(kw) || l.content.includes(kw) || l.requestId.includes(kw) || l.errorInfo.includes(kw),
    );
  }
  return list;
});

function handleQuery() {
  ElMessage.info('日志查询暂未开放，当前展示的是示例数据');
}

function handleExport() {
  ElMessage.info('日志导出暂未开放，敬请期待');
}

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">日志审计</h1>
      <p class="st-page-subtitle">用户操作日志 · 智能体运行日志 · 系统异常日志，异常行为可逐条追溯</p>
    </header>

    <div class="log-notice">
      <ScrollText :size="14" />
      <span>日志审计功能正在建设中，上线后可在这里按类型、时间和关键词检索全部日志。</span>
    </div>

    <!-- 筛选工具栏 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="type-tabs">
          <button
            v-for="t in TYPE_TABS"
            :key="t.value"
            class="type-tab"
            :class="{ 'type-tab--active': typeFilter === t.value }"
            @click="typeFilter = t.value"
          >
            {{ t.label }}
          </button>
        </div>
        <div class="search-box">
          <Search :size="14" />
          <input v-model="keyword" class="search-input" placeholder="搜索来源 / 内容 / 追踪编号" />
        </div>
        <el-date-picker
          v-model="range"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 250px;"
        />
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" @click="handleExport">
            <Download :size="14" /> 导出
          </button>
          <button class="st-btn st-btn--primary" @click="handleQuery">查询</button>
        </div>
      </div>
    </div>

    <!-- 日志表骨架 -->
    <div class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <div>
          <h2 class="st-card__title">日志明细</h2>
          <p class="st-card__hint">命中 {{ filtered.length }} 条</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="log-table">
          <thead>
            <tr>
              <th style="width: 170px;">时间</th>
              <th style="width: 90px;">类型</th>
              <th style="width: 170px;">来源</th>
              <th style="width: 110px;">操作人</th>
              <th>内容</th>
              <th style="width: 130px;">追踪编号</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="l in filtered"
              :key="l.id"
              :class="{ 'log-row--error': l.type === 'error' }"
            >
              <td class="muted mono">{{ fmt(l.time) }}</td>
              <td><span class="st-badge" :class="TYPE_META[l.type].badge">{{ TYPE_META[l.type].label }}</span></td>
              <td>{{ l.source }}</td>
              <td class="muted">{{ l.operator || '—' }}</td>
              <td>
                <div>{{ l.content }}</div>
                <div v-if="l.errorInfo" class="error-info">{{ l.errorInfo }}</div>
              </td>
              <td class="muted mono">{{ l.requestId }}</td>
            </tr>
            <!-- 无数据时的骨架行（保持表格结构可见） -->
            <template v-if="filtered.length === 0">
              <tr v-for="n in 6" :key="`ph-${n}`">
                <td><span class="skeleton-bar" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar skeleton-bar--wide" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="filtered.length === 0" class="st-empty">
          <ScrollText :size="38" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无日志数据</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 10px 14px;
  background: var(--status-info-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.log-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--status-info);
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.type-tabs {
  display: inline-flex;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.type-tab {
  background: transparent;
  border: none;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 5px 14px;
  border-radius: calc(var(--radius-md) - 2px);
  cursor: pointer;
  transition: all var(--transition);
}

.type-tab:hover {
  color: var(--text-primary);
}

.type-tab--active {
  background: var(--text-primary);
  color: var(--bg-surface);
  font-weight: 600;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
  height: 34px;
  color: var(--text-tertiary);
  background: var(--bg-surface);
}

.search-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  width: 240px;
}

/* 表格 */
.table-wrap {
  padding: 0 24px 20px;
  overflow-x: auto;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.log-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.log-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
}

.log-table tr:hover td {
  background: var(--bg-subtle);
}

.log-row--error td {
  background: var(--status-danger-bg);
}

.log-row--error:hover td {
  background: var(--status-danger-bg);
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12px;
}

.muted {
  color: var(--text-tertiary);
}

.error-info {
  font-size: 11.5px;
  color: var(--status-danger);
  margin-top: 3px;
  font-family: Consolas, monospace;
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
  width: 55%;
}

.skeleton-bar--wide {
  width: 85%;
}
</style>
