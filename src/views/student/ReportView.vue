<script setup lang="ts">
/**
 * 个人学习报告 —— 当前为 UI 壳（只保留界面状态，不接 api / pinia）
 *
 * 接口预留：GET /api/study/progress/get        章节掌握度 / 完成度 / 学习时长
 * 接口预留：GET /api/study/code/record/list    代码实操次数 / 耗时统计
 * 接口预留：GET /api/exam/wrong-question/list  错题与薄弱知识点聚合
 * 后端未提供学情报告汇总接口，上述三处需前端组合或由后端补充报告接口
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookOpen,
  CircleAlert,
  Clock,
  ListChecks,
  Target,
  TrendingUp,
  Wrench,
} from 'lucide-vue-next';

interface TrendPoint {
  date: string;
  rate: number;
}

interface ChapterMastery {
  chapterId: number;
  chapterTitle: string;
  accuracyRate: number;
}

interface WeakPoint {
  knowledgePoint: string;
  masterRate: number;
  suggestion: string;
  chapterId: number;
}

const router = useRouter();

/** 以下区域数据源均为接口预留，保持空数组占位 */
const totalStudyMinutes = ref<number | null>(null);
const masterRate = ref<number | null>(null);
const practiceCount = ref<number | null>(null);
const codeRunCount = ref<number | null>(null);
const completedChapters = ref<number | null>(null);
const totalChapters = ref<number | null>(null);
const trend = ref<TrendPoint[]>([]);
const chapterMastery = ref<ChapterMastery[]>([]);
const weakPoints = ref<WeakPoint[]>([]);
const reportText = ref<string | null>(null);

const stats = computed(() => [
  {
    icon: Clock,
    label: '学习总时长',
    value: totalStudyMinutes.value === null ? '—' : `${Math.floor(totalStudyMinutes.value / 60)}h ${totalStudyMinutes.value % 60}m`,
  },
  {
    icon: BookOpen,
    label: '章节完成度',
    value:
      completedChapters.value === null || totalChapters.value === null
        ? '—'
        : `${completedChapters.value}/${totalChapters.value} 章`,
  },
  { icon: Target, label: '综合掌握率', value: masterRate.value === null ? '—' : `${masterRate.value}%` },
  { icon: ListChecks, label: '累计刷题', value: practiceCount.value === null ? '—' : `${practiceCount.value} 题` },
  { icon: Wrench, label: '代码实操', value: codeRunCount.value === null ? '—' : `${codeRunCount.value} 次` },
]);

// ==================== 折线图（正确率趋势） ====================
const TREND_W = 560;
const TREND_H = 180;

const hasTrend = computed(() => trend.value.length >= 2);

const trendPath = computed(() => {
  const data = trend.value;
  if (data.length < 2) return { line: '', area: '', points: [] as { x: number; y: number; label: string; rate: number }[] };
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * (TREND_W - 60) + 40,
    y: TREND_H - 30 - (d.rate / 100) * (TREND_H - 50),
    label: d.date,
    rate: d.rate,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x} ${TREND_H - 30} L ${pts[0].x} ${TREND_H - 30} Z`;
  return { line, area, points: pts };
});

// ==================== 雷达图（知识点掌握） ====================
const RADAR_CX = 130;
const RADAR_CY = 120;
const RADAR_R = 88;

const hasRadar = computed(() => weakPoints.value.length >= 3);

const radarAxes = computed(() => {
  const data = weakPoints.value.slice(0, 6);
  if (data.length < 3) return [];
  return data.map((w, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    return {
      label: w.knowledgePoint,
      rate: w.masterRate,
      angle,
      x: RADAR_CX + Math.cos(angle) * RADAR_R,
      y: RADAR_CY + Math.sin(angle) * RADAR_R,
    };
  });
});

const radarPolygon = computed(() =>
  radarAxes.value
    .map((a) => {
      const r = (a.rate / 100) * RADAR_R;
      return `${RADAR_CX + Math.cos(a.angle) * r} ${RADAR_CY + Math.sin(a.angle) * r}`;
    })
    .join(' '),
);

const radarGrid = computed(() =>
  [0.25, 0.5, 0.75, 1].map((ratio) => ({
    points: radarAxes.value
      .map((a) => `${RADAR_CX + Math.cos(a.angle) * RADAR_R * ratio} ${RADAR_CY + Math.sin(a.angle) * RADAR_R * ratio}`)
      .join(' '),
  })),
);

// ==================== 柱状图（各章掌握度） ====================
const barItems = computed(() =>
  chapterMastery.value.map((c) => ({
    ...c,
    height: Math.max((c.accuracyRate / 100) * 120, 2),
    low: c.accuracyRate < 70,
  })),
);
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">个人学习报告</h1>
      <p class="st-page-subtitle">学情分析 · 数据维度精准到每章每个知识点</p>
    </header>

    <!-- 统计卡（总分 / 时长 / 掌握率） -->
    <div class="stat-grid">
      <div v-for="s in stats" :key="s.label" class="st-card stat-card">
        <div class="st-card__body">
          <div class="stat-icon"><component :is="s.icon" :size="16" /></div>
          <div class="st-stat-value">{{ s.value }}</div>
          <div class="st-stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <div class="report-grid">
      <!-- 正确率趋势 -->
      <section class="st-card">
        <div class="st-card__header">
          <TrendingUp :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">刷题正确率趋势</h2>
            <p class="st-card__hint">接口预留：GET /api/exam/wrong-question/list</p>
          </div>
        </div>
        <div class="st-card__body">
          <svg v-if="hasTrend" :viewBox="`0 0 ${TREND_W} ${TREND_H}`" class="chart-svg">
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#1c1917" stop-opacity="0.14" />
                <stop offset="100%" stop-color="#1c1917" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line v-for="i in 4" :key="i" :x1="40" :x2="TREND_W - 20" :y1="TREND_H - 30 - ((TREND_H - 50) / 4) * (i - 1)" :y2="TREND_H - 30 - ((TREND_H - 50) / 4) * (i - 1)" stroke="#e7e5e4" stroke-width="1" stroke-dasharray="3 3" />
            <path :d="trendPath.area" fill="url(#trendFill)" />
            <path :d="trendPath.line" fill="none" stroke="#1c1917" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <g v-for="p in trendPath.points" :key="p.label">
              <circle :cx="p.x" :cy="p.y" r="3.2" fill="#1c1917" />
              <text :x="p.x" :y="p.y - 9" text-anchor="middle" font-size="10" fill="#57534e">{{ p.rate }}%</text>
              <text :x="p.x" :y="TREND_H - 12" text-anchor="middle" font-size="10" fill="#a8a29e">{{ p.label }}</text>
            </g>
          </svg>
          <div v-else class="st-empty">
            <TrendingUp :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
        </div>
      </section>

      <!-- 知识点掌握雷达图 -->
      <section class="st-card">
        <div class="st-card__header">
          <Target :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">知识点掌握情况</h2>
            <p class="st-card__hint">薄弱知识点掌握率雷达图</p>
          </div>
        </div>
        <div class="st-card__body radar-wrap">
          <svg v-if="hasRadar" viewBox="0 0 260 240" class="chart-svg" style="max-height: 240px;">
            <polygon v-for="(ring, i) in radarGrid" :key="i" :points="ring.points" fill="none" stroke="#e7e5e4" stroke-width="1" />
            <line v-for="(a, i) in radarAxes" :key="'ax' + i" :x1="RADAR_CX" :y1="RADAR_CY" :x2="a.x" :y2="a.y" stroke="#e7e5e4" stroke-width="1" />
            <polygon :points="radarPolygon" fill="#1c1917" fill-opacity="0.1" stroke="#1c1917" stroke-width="1.6" stroke-linejoin="round" />
            <circle v-for="(a, i) in radarAxes" :key="'pt' + i" :cx="RADAR_CX + Math.cos(a.angle) * RADAR_R * (a.rate / 100)" :cy="RADAR_CY + Math.sin(a.angle) * RADAR_R * (a.rate / 100)" r="2.6" fill="#1c1917" />
            <text
              v-for="(a, i) in radarAxes"
              :key="'lb' + i"
              :x="RADAR_CX + Math.cos(a.angle) * (RADAR_R + 22)"
              :y="RADAR_CY + Math.sin(a.angle) * (RADAR_R + 16) + 3"
              text-anchor="middle"
              font-size="9.5"
              fill="#57534e"
            >
              {{ a.label.length > 6 ? a.label.slice(0, 6) + '…' : a.label }} {{ a.rate }}%
            </text>
          </svg>
          <div v-else class="st-empty">
            <Target :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
        </div>
      </section>
    </div>

    <!-- 各章掌握度（接口预留：GET /api/study/progress/get） -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <ListChecks :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">各章掌握度</h2>
          <p class="st-card__hint">低于 70%（浅色柱）的章节建议重点巩固</p>
        </div>
      </div>
      <div class="st-card__body">
        <div v-if="barItems.length === 0" class="st-empty">
          <ListChecks :size="34" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无数据，接口待接入</div>
        </div>
        <div v-else class="bar-chart">
          <div v-for="b in barItems" :key="b.chapterId" class="bar-item">
            <span class="bar-item__rate" :class="{ 'bar-item__rate--low': b.low }">{{ b.accuracyRate }}%</span>
            <div class="bar-item__track">
              <div class="bar-item__fill" :class="{ 'bar-item__fill--low': b.low }" :style="{ height: b.height + 'px' }"></div>
            </div>
            <span class="bar-item__name">{{ b.chapterTitle }}</span>
          </div>
        </div>
      </div>
    </section>

    <div class="report-grid" style="margin-top: 20px;">
      <!-- 薄弱知识点 + 复习建议 -->
      <section class="st-card">
        <div class="st-card__header">
          <CircleAlert :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">薄弱知识点与复习建议</h2>
            <p class="st-card__hint">按掌握率升序排列</p>
          </div>
        </div>
        <div class="st-card__body">
          <div v-if="weakPoints.length === 0" class="st-empty">
            <CircleAlert :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
          <div v-else>
            <div v-for="w in weakPoints" :key="w.knowledgePoint" class="weak-item">
              <div class="weak-item__top">
                <span class="weak-item__name">{{ w.knowledgePoint }}</span>
                <span class="weak-item__rate">{{ w.masterRate }}%</span>
              </div>
              <div class="st-progress" style="margin: 8px 0;">
                <div class="st-progress__bar st-progress__bar--warn" :style="{ width: w.masterRate + '%' }"></div>
              </div>
              <div class="weak-item__suggestion">{{ w.suggestion }}</div>
              <div class="weak-item__actions">
                <button class="st-text-btn" @click="router.push(`/student/learn/${w.chapterId}`)">复习第 {{ w.chapterId }} 章 →</button>
                <button class="st-text-btn" @click="router.push(`/student/practice/${w.chapterId}`)">刷题巩固 →</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 代码实操统计 + 报告文本 -->
      <section class="st-card">
        <div class="st-card__header">
          <BookOpen :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">学情报告</h2>
            <p class="st-card__hint">接口预留：GET /api/study/code/record/list</p>
          </div>
        </div>
        <div class="st-card__body">
          <div v-if="reportText" class="report-text">{{ reportText }}</div>
          <div v-else class="st-empty">
            <BookOpen :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

@media (max-width: 1080px) {
  .stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.stat-card .st-card__body {
  padding: 16px 18px;
}

.stat-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.report-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 20px;
}

@media (max-width: 960px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}

.chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.radar-wrap {
  display: flex;
  justify-content: center;
}

/* 柱状图 */
.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  overflow-x: auto;
  padding: 6px 2px 0;
}

.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 56px;
}

.bar-item__rate {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.bar-item__rate--low {
  color: var(--status-warning);
}

.bar-item__track {
  height: 120px;
  width: 26px;
  background: var(--bg-muted);
  border-radius: 4px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-item__fill {
  width: 100%;
  background: var(--text-primary);
  border-radius: 4px 4px 0 0;
  transition: height 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.bar-item__fill--low {
  background: var(--status-warning);
  opacity: 0.75;
}

.bar-item__name {
  font-size: 10.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 薄弱知识点 */
.weak-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.weak-item:last-child {
  border-bottom: none;
}

.weak-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.weak-item__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.weak-item__rate {
  font-size: 13px;
  font-weight: 600;
  color: var(--status-warning);
}

.st-progress__bar--warn {
  background: var(--status-warning);
}

.weak-item__suggestion {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.weak-item__actions {
  margin-top: 6px;
  display: flex;
  gap: 8px;
}

/* 报告文本 */
.report-text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.85;
  white-space: pre-wrap;
}
</style>
