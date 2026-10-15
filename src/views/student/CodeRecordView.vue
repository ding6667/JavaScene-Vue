<script setup lang="ts">
/**
 * 代码运行记录 —— 当前为 UI 壳（只保留界面状态，不接 api）
 *
 * 接口预留：GET /api/study/code/record/list          运行记录分页列表（章节 / 状态筛选）
 * 接口预留：GET /api/study/code/record/detail?recordId=  单条记录详情（代码、输出、判题结果、智能体建议）
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  BookMarked,
  CircleAlert,
  CircleCheck,
  Clock,
  Code2,
  History,
  Sprout,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import type { CodeRunResult, RunStatus } from '@/types/student';

/** 运行记录列表项（字段按 code/record/list 返回结构预留） */
interface CodeRecordItem {
  recordId: number;
  chapterId: number | null;
  chapterTitle: string;
  status: RunStatus;
  statusDesc: string;
  score: number;
  runDuration: number;
  memoryUsed: number;
  createTime: string | null;
}

/**
 * 详情出参：运行结果同构字段 + 记录的代码原文。
 * codeContent 不在 CodeRunResult 中，需由 record/detail 详情接口补充返回。
 */
interface CodeRecordDetail extends CodeRunResult {
  codeContent: string;
}

const router = useRouter();

/** 判题状态中文口径（与代码实操页一致） */
const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  AC: '通过',
  WA: '答案错误',
  TLE: '运行超时',
  MLE: '内存超限',
  RE: '运行异常',
  CE: '编译错误',
  OLE: '输出超限',
  SV: '安全违规',
  SE: '系统错误',
};

const RUN_STATUS_BADGE: Record<RunStatus, string> = {
  AC: 'st-badge--success',
  WA: 'st-badge--danger',
  TLE: 'st-badge--warning',
  MLE: 'st-badge--warning',
  RE: 'st-badge--danger',
  CE: 'st-badge--danger',
  OLE: 'st-badge--warning',
  SV: 'st-badge--danger',
  SE: 'st-badge--danger',
};

function statusLabel(status: RunStatus) {
  return RUN_STATUS_LABEL[status] ?? status;
}

function statusBadge(status: RunStatus) {
  return RUN_STATUS_BADGE[status] ?? 'st-badge--neutral';
}

/** 筛选条件（章节下拉数据源：GET /api/knowledge/chapter/list，本视图未接入） */
const filterChapter = ref<number | 'all'>('all');
const filterStatus = ref<RunStatus | 'all'>('all');
const chapters = ref<{ id: number; title: string }[]>([]);

/** 列表与详情（接口预留，空态占位） */
const records = ref<CodeRecordItem[]>([]);
const total = ref<number | null>(null);
const activeRecordId = ref<number | null>(null);
const detail = ref<CodeRecordDetail | null>(null);

function openRecord(r: CodeRecordItem) {
  activeRecordId.value = r.recordId;
  detail.value = null;
  // 接口预留：GET /api/study/code/record/detail?recordId=
  ElMessage.info('运行记录详情接口待接入');
}

function reloadList() {
  // 接口预留：GET /api/study/code/record/list
  ElMessage.info('运行记录列表接口待接入');
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <div class="st-view">
    <div class="detail-topbar">
      <button class="st-text-btn" @click="router.push('/student/code')">
        <ArrowLeft :size="14" style="margin-right: 4px;" /> 返回代码实操
      </button>
    </div>

    <header class="st-page-header">
      <h1 class="st-page-title">代码运行记录</h1>
      <p class="st-page-subtitle">每次提交后端编译运行的判题留痕 · 可查看历史输出与智能体建议</p>
    </header>

    <!-- 筛选 -->
    <div class="st-card filter-card">
      <div class="st-card__body filter-row">
        <el-select v-model="filterChapter" style="width: 220px;" size="default">
          <el-option label="全部章节" value="all" />
          <el-option v-for="c in chapters" :key="c.id" :label="c.title" :value="c.id" />
        </el-select>
        <el-select v-model="filterStatus" style="width: 160px;" size="default">
          <el-option label="全部状态" value="all" />
          <el-option v-for="(label, key) in RUN_STATUS_LABEL" :key="key" :label="label" :value="key" />
        </el-select>
        <span class="filter-count">共 {{ total === null ? '—' : total }} 条记录</span>
        <button class="st-btn st-btn--secondary" @click="reloadList">
          <History :size="13" /> 刷新列表
        </button>
      </div>
    </div>

    <div class="record-grid">
      <!-- 列表 -->
      <section class="st-card">
        <div class="st-card__header">
          <Code2 :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">运行记录</h2>
            <p class="st-card__hint">接口预留：GET /api/study/code/record/list</p>
          </div>
        </div>
        <div class="st-card__body" style="padding-top: 12px;">
          <div v-if="records.length === 0" class="st-empty" style="padding: 48px 16px;">
            <History :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
          <div v-else class="record-list">
            <div
              v-for="r in records"
              :key="r.recordId"
              class="record-item"
              :class="{ 'record-item--active': r.recordId === activeRecordId }"
              role="button"
              tabindex="0"
              @click="openRecord(r)"
              @keydown.enter="openRecord(r)"
            >
              <div class="record-item__main">
                <div class="record-item__title">{{ r.chapterTitle || '未关联章节' }}</div>
                <div class="record-item__meta">
                  <span class="st-badge" :class="statusBadge(r.status)">{{ statusLabel(r.status) }}</span>
                  <span class="record-item__time"><Clock :size="11" style="vertical-align: -1px;" /> {{ fmt(r.createTime) }}</span>
                </div>
              </div>
              <div class="record-item__nums">
                <span>{{ r.runDuration }} ms</span>
                <span>{{ r.memoryUsed }} KB</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 详情 -->
      <section class="st-card">
        <div class="st-card__header">
          <BookMarked :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">运行详情</h2>
            <p class="st-card__hint">接口预留：GET /api/study/code/record/detail?recordId=</p>
          </div>
        </div>
        <div class="st-card__body">
          <template v-if="detail">
            <div class="detail-metrics">
              <span class="st-badge" :class="statusBadge(detail.status)">{{ statusLabel(detail.status) }}</span>
              <span class="st-badge st-badge--neutral">{{ detail.statusDesc }}</span>
              <span class="st-badge st-badge--outline">{{ detail.passedCount }}/{{ detail.totalCount }} 用例</span>
              <span class="st-badge st-badge--outline">{{ detail.score }} 分</span>
            </div>

            <div class="detail-block">
              <div class="detail-block__head">提交的代码</div>
              <div class="case-code-box st-code">
                <pre>{{ detail.codeContent || '—' }}</pre>
              </div>
            </div>

            <div class="detail-block">
              <div class="detail-block__head">标准输出</div>
              <div class="case-code-box st-code">
                <pre>{{ detail.output || '—' }}</pre>
              </div>
            </div>

            <div v-if="detail.errorMsg" class="detail-block">
              <div class="detail-block__head"><CircleAlert :size="13" /> 错误信息</div>
              <div class="error-text">{{ detail.errorMsg }}</div>
            </div>

            <div class="detail-block">
              <div class="detail-block__head"><CircleCheck :size="13" /> 智能体建议</div>
              <p class="detail-text">{{ detail.optimizeSuggest }}</p>
              <p class="detail-text">{{ detail.learningSuggestion }}</p>
              <div v-if="detail.knowledgePoints.length" class="kp-row">
                <span v-for="kp in detail.knowledgePoints" :key="kp" class="st-badge st-badge--neutral">{{ kp }}</span>
              </div>
            </div>
          </template>

          <div v-else class="st-empty" style="padding: 48px 16px;">
            <Sprout :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-topbar {
  margin-bottom: 12px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 14px;
  padding-bottom: 14px;
}

.filter-count {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.record-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1080px) {
  .record-grid {
    grid-template-columns: 1fr;
  }
}

/* 列表 */
.record-list {
  display: flex;
  flex-direction: column;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition);
}

.record-item:last-child {
  border-bottom: none;
}

.record-item--active {
  background: var(--bg-subtle);
}

.record-item__main {
  flex: 1;
  min-width: 0;
}

.record-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.record-item__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.record-item__time {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.record-item__nums {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 详情 */
.detail-metrics {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-block {
  margin-bottom: 18px;
}

.detail-block__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.case-code-box {
  background: #f8f8f7;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  overflow-x: auto;
}

.case-code-box pre {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
}

.error-text {
  font-size: 12.5px;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  white-space: pre-wrap;
}

.detail-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 8px;
}

.kp-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
