<script setup lang="ts">
/**
 * 班级学情分析
 *
 * 数据来源：
 * - GET /api/class/list                → fetchClasses()       班级下拉
 * - GET /api/teach/class/stats         → fetchClassStats(id)  总人数 + 平均学习进度
 *
 * 后端缺口（保持空态，不用假数据）：
 * - 知识点维度掌握率：进度接口只到章节，知识点级需后端聚合 knowledge/point/list + exam 作答记录
 * - 学生个体排行与班级学情报告：progress / wrong-question 都只返回当前登录用户数据，
 *   教师取不到全班明细，需后端补 per-student 接口
 */
import { computed, onMounted, ref } from 'vue';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FileText,
  Loader2,
  Users,
} from 'lucide-vue-next';
import { fetchClassStats } from '@/api/teacher';
import { fetchClasses } from '@/api/class';
import type { ClassResponse } from '@/types/class';
import type { ClassStats } from '@/types/teacher';
import type { StudyProgress } from '@/types/study';
import type { WrongQuestionItem } from '@/types/exam';

const classes = ref<ClassResponse[]>([]);
const classId = ref<number | null>(null);
/** 后端 stats 接口无时间范围参数，此控件仅保留 UI */
const timeRange = ref('all');
const loading = ref(false);
const stats = ref<ClassStats | null>(null);
const statsError = ref('');

/** 章节进度 */
const chapterProgress = ref<StudyProgress[]>([]);
const chapterError = ref('');
/** 错题列表 */
const wrongList = ref<WrongQuestionItem[]>([]);
const wrongError = ref('');

const TIME_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: 'week', label: '最近一周' },
  { value: 'month', label: '最近一月' },
];

/** 章节进度柱状：按进度升序，落后的排前面 */
const chapterBars = computed(() =>
  chapterProgress.value
    .slice()
    .sort((a, b) => (a.progressRate ?? 0) - (b.progressRate ?? 0))
    .slice(0, 12)
    .map((p) => ({
      key: p.id ?? p.chapterId,
      label: p.chapterName || `章节 ${p.chapterId}`,
      rate: Math.max(0, Math.min(100, p.progressRate ?? 0)),
      done: p.isCompleted === 1,
    })),
);

/** 高频错题 Top5（按错误次数） */
const hotWrong = computed(() =>
  wrongList.value
    .slice()
    .sort((a, b) => (b.wrongCount ?? 0) - (a.wrongCount ?? 0))
    .slice(0, 5)
    .map((w) => ({
      key: w.id,
      stem: w.content && w.content.trim() ? w.content.trim().slice(0, 48) : `题目 #${w.questionId}`,
      count: w.wrongCount ?? 0,
      meta: `题型 ${w.type ?? '—'} · 难度 ${w.difficulty ?? '—'} · ${w.mastered === 1 ? '已掌握' : '未掌握'}`,
    })),
);

async function load() {
  if (!classId.value) return;
  loading.value = true;
  statsError.value = '';
  try {
    stats.value = await fetchClassStats(classId.value);
    if (stats.value?.message) statsError.value = stats.value.message;
  } catch {
    stats.value = null;
    // 错误由响应拦截器统一提示
  }

  // 章节进度与错题本都是「当前登录学生本人」的接口（STUDENT 权限），教师调用会被后端判为越权并 403，
  // 所以这里不再发请求；教师视角要看整班，需要后端提供按 classId 聚合的接口。
  chapterProgress.value = [];
  chapterError.value = '暂不提供班级维度的章节进度统计';
  wrongList.value = [];
  wrongError.value = '暂不提供班级维度的错题统计';
  loading.value = false;
}

onMounted(async () => {
  try {
    classes.value = await fetchClasses();
  } catch {
    // 错误由响应拦截器统一提示
    return;
  }
  if (classes.value.length) {
    classId.value = classes.value[0].classId;
    load();
  }
});

/** 后端 averageProgress 口径未明确（0-1 或 0-100），统一归一到百分比 */
const progressPercent = (value: number) => {
  const n = Number(value) || 0;
  return Math.max(0, Math.min(100, n <= 1 ? Math.round(n * 100) : Math.round(n)));
};
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">班级学情分析</h1>
      <p class="st-page-subtitle">班级整体学习进度概览 · 明细维度暂未开放</p>
    </header>

    <!-- 筛选 -->
    <div class="st-card">
      <div class="st-card__body filter-row">
        <el-select v-model="classId" placeholder="选择班级" style="width: 220px;" @change="load">
          <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
        </el-select>
        <el-select v-model="timeRange" style="width: 140px;" disabled>
          <el-option v-for="t in TIME_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <span class="filter-hint">时间范围筛选暂未开放</span>
        <button class="st-btn st-btn--secondary" style="margin-left: auto;" :disabled="loading || !classId" @click="load">
          <Loader2 v-if="loading" :size="13" class="spin" />
          查询学情
        </button>
      </div>
    </div>

    <div v-if="loading" class="st-card" style="margin-top: 20px;">
      <div class="st-card__body st-empty" style="padding: 80px;">
        <Loader2 :size="24" class="spin" />
        <div class="st-empty__text">正在汇总班级学情数据…</div>
      </div>
    </div>

    <template v-else-if="classId">
      <!-- 概览指标 -->
      <div class="overview-grid">
        <div class="st-card overview-card">
          <div class="st-card__body">
            <div class="st-stat-value">{{ stats?.totalStudents ?? '—' }}</div>
            <div class="st-stat-label">班级总人数</div>
            <div class="overview-src">统计本班全体学生</div>
          </div>
        </div>
        <div class="st-card overview-card">
          <div class="st-card__body">
            <div class="st-stat-value">
              {{ stats ? `${progressPercent(stats.averageProgress)}%` : '—' }}
            </div>
            <div class="st-stat-label">平均学习进度</div>
            <div class="st-progress" style="margin-top: 10px;">
              <div class="st-progress__bar" :style="{ width: (stats ? progressPercent(stats.averageProgress) : 0) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="statsError" class="stats-message">{{ statsError }}</p>

      <div class="report-grid" style="margin-top: 20px;">
        <!-- 章节进度 -->
        <section class="st-card">
          <div class="st-card__header">
            <BarChart3 :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">章节学习进度分布</h2>
              <p class="st-card__hint">
                按班级汇总的章节进度还在建设中
              </p>
            </div>
            <span :class="['st-badge', chapterError ? 'st-badge--warning' : 'st-badge--neutral']">
              {{ chapterError ? '暂未开放' : '已有数据' }}
            </span>
          </div>
          <div class="st-card__body">
            <div v-if="chapterBars.length" class="bar-chart">
              <div v-for="c in chapterBars" :key="c.key" class="bar-col">
                <div class="bar-placeholder">
                  <div class="bar-fill" :style="{ height: c.rate + '%' }"></div>
                </div>
                <span class="bar-axis" :title="c.label">{{ c.label }}</span>
                <span class="bar-value">{{ c.rate }}%</span>
              </div>
            </div>
            <div v-else class="st-empty" style="padding: 20px 16px;">
              <div class="st-empty__text">{{ chapterError || '暂无章节进度数据' }}</div>
              <div class="st-empty__hint">
                这里只能看到单个学生自己的进度，全班进度汇总待上线
              </div>
            </div>
          </div>
        </section>

        <!-- 知识点掌握（UI 骨架） -->
        <section class="st-card">
          <div class="st-card__header">
            <ClipboardList :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">知识点掌握率排行（由弱到强）</h2>
              <p class="st-card__hint">
                知识点维度的掌握率还在建设中，目前只能看到章节进度
              </p>
            </div>
            <span class="st-badge st-badge--neutral shell-badge">暂未开放</span>
          </div>
          <div class="st-card__body">
            <div class="mastery-item" v-for="i in 4" :key="i" aria-hidden="true">
              <div class="mastery-item__top">
                <span class="mastery-item__name skeleton-text">知识点名称</span>
                <span class="mastery-item__rate">—</span>
              </div>
              <div class="st-progress" style="margin-top: 6px;">
                <div class="st-progress__bar" style="width: 0%;"></div>
              </div>
            </div>
            <div class="st-empty" style="padding: 20px 16px;">
              <div class="st-empty__text">暂不提供班级维度的知识点掌握率</div>
            </div>
          </div>
        </section>
      </div>

      <div class="report-grid" style="margin-top: 20px;">
        <!-- 高频错题 -->
        <section class="st-card">
          <div class="st-card__header">
            <AlertTriangle :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">高频错题排行</h2>
              <p class="st-card__hint">
                按错误次数由多到少排列，最多展示前 5 条
              </p>
            </div>
            <span :class="['st-badge', wrongError ? 'st-badge--warning' : 'st-badge--neutral']">
              {{ wrongError ? '暂未开放' : '已有数据' }}
            </span>
          </div>
          <div class="st-card__body hot-list">
            <div v-for="(w, idx) in hotWrong" :key="w.key" class="hot-item">
              <span class="hot-item__rank" :class="{ 'hot-item__rank--top': idx === 0 }">{{ idx + 1 }}</span>
              <div class="hot-item__main">
                <div class="hot-item__stem">{{ w.stem }}</div>
                <div class="hot-item__meta">{{ w.meta }}</div>
              </div>
              <span class="hot-item__count">{{ w.count }} 次</span>
            </div>
            <div v-if="!hotWrong.length" class="st-empty" style="padding: 20px 16px;">
              <div class="st-empty__text">{{ wrongError || '暂无错题记录' }}</div>
              <div v-if="wrongError" class="st-empty__hint">
                这里只能看到单个学生的错题，全班热点错题待上线
              </div>
            </div>
          </div>
        </section>

        <!-- 学生排行 + 报告（UI 骨架） -->
        <section class="st-card">
          <div class="st-card__header">
            <Users :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">学生正确率排行 / 学情报告</h2>
              <p class="st-card__hint">
                班级名单里没有答题正确率，学生排行与班级学情报告待上线
              </p>
            </div>
            <span class="st-badge st-badge--neutral shell-badge">暂未开放</span>
          </div>
          <div class="st-card__body">
            <div class="rank-list">
              <div v-for="i in 4" :key="i" class="rank-item" aria-hidden="true">
                <span class="rank-item__no" :class="{ 'rank-item__no--top': i < 3 }">{{ i }}</span>
                <span class="rank-item__name skeleton-text">学生姓名</span>
                <div class="st-progress" style="flex: 1;">
                  <div class="st-progress__bar" style="width: 0%;"></div>
                </div>
                <span class="rank-item__rate">—</span>
              </div>
            </div>
            <div class="report-placeholder">
              <div class="report-head">
                <FileText :size="14" class="card-icon" />
                <span>班级学情报告</span>
              </div>
              <div class="report-lines" aria-hidden="true">
                <div v-for="w in ['92%', '76%', '88%', '64%']" :key="w" class="report-line" :style="{ width: w }"></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="st-card" style="margin-top: 20px;">
      <div class="st-card__body st-empty" style="padding: 80px;">
        <Users :size="40" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">
          暂无班级数据：当前账号还没有被设为任何班级的任课教师，
          请确认班级信息后再来查看
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 16px;
  padding-bottom: 16px;
  flex-wrap: wrap;
}

.filter-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}

.overview-src {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}

.stats-message {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--status-warning);
}

.report-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}

.shell-badge {
  margin-left: auto;
  flex-shrink: 0;
}

/* 图表占位 */
.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 130px;
  padding: 0 4px 0 4px;
  border-bottom: 1px solid var(--border-default);
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
  justify-content: flex-end;
}

.bar-placeholder {
  position: relative;
  width: 100%;
  height: 120px;
  display: flex;
  align-items: flex-end;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  overflow: hidden;
}

/* 真实进度条：从底部填充 */
.bar-fill {
  width: 100%;
  min-height: 2px;
  background: var(--text-primary);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.bar-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.st-empty__hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
  max-width: 460px;
}

.bar-axis {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* 掌握率占位 */
.mastery-item {
  padding: 8px 0;
}

.mastery-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mastery-item__name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
}

.mastery-item__rate {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.skeleton-text {
  color: var(--text-tertiary);
}

/* 高频错题占位 */
.hot-list {
  display: flex;
  flex-direction: column;
}

.hot-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.hot-item__main {
  flex: 1;
  min-width: 0;
}

.hot-item__stem {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.55;
}

.hot-item__meta {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 3px;
}

.hot-item__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  white-space: nowrap;
  margin-top: 2px;
}

.hot-item__rank {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.hot-item__rank--top {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-color: var(--text-primary);
}

.hot-list code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 11px;
  background: var(--bg-subtle);
  padding: 1px 5px;
  border-radius: 4px;
}

/* 排行占位 */
.rank-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 0;
}

.rank-item__no {
  width: 22px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-align: center;
  flex-shrink: 0;
}

.rank-item__no--top {
  color: var(--text-primary);
}

.rank-item__name {
  width: 84px;
  font-size: 13px;
  color: var(--text-primary);
  flex-shrink: 0;
}

.rank-item__rate {
  width: 44px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-align: right;
  flex-shrink: 0;
}

/* 报告占位 */
.report-placeholder {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.report-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.report-lines {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.report-line {
  height: 10px;
  background: var(--bg-muted);
  border-radius: 5px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
