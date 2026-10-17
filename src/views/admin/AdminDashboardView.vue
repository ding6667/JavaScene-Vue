<script setup lang="ts">
/**
 * 运维仪表盘 —— UI 骨架页（后端无对应接口）
 *
 * 接口预留：后端未提供系统监控聚合接口（服务健康度 / 异常告警 / 访问趋势一类能力），
 * 需后端补充；或由前端组合已有的 GET /api/user/records、GET /api/knowledge/dataset/upload/list 自行计算。
 * 因此本文件不接 api / pinia，以下所有列表均为空数组占位，仅保留交互与样式。
 */
import { computed, ref } from 'vue';
import {
  AlertTriangle,
  Bot,
  CircleSlash,
  HardDrive,
  RefreshCw,
  Server,
  Users,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

/** 统计卡占位（待后端监控接口就绪后填充） */
interface StatCard {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
}

/** 服务状态占位行 */
interface ServiceRow {
  serviceName: string;
  kind: 'business' | 'agent';
  online: boolean;
  load: number;
  callCount: number;
  avgResponseMs: number;
}

/** 访问趋势占位点 */
interface TrendPoint {
  date: string;
  count: number;
}

/** 异常告警占位行 */
interface AlertRow {
  id: string;
  level: 'danger' | 'warning';
  title: string;
  detail: string;
  time: string;
}

const services = ref<ServiceRow[]>([]);
const trend = ref<TrendPoint[]>([]);
const alerts = ref<AlertRow[]>([]);

const statCards: StatCard[] = [
  { icon: Users, label: '系统用户量', value: '—', sub: '学生 · 教师 · 管理员' },
  { icon: Server, label: '今日访问量', value: '—', sub: '人次 · 含三端 Web 访问' },
  { icon: Bot, label: '智能体调用量', value: '—', sub: '累计次 · 六大智能体' },
  { icon: HardDrive, label: '存储使用量', value: '—', sub: '教材资源 + 教学数据' },
];

const businessServices = computed(() => services.value.filter((s) => s.kind === 'business'));
const agentServices = computed(() => services.value.filter((s) => s.kind === 'agent'));
const onlineCount = computed(() => services.value.filter((s) => s.online).length);

// 访问趋势折线图的绘制区尺寸（网格常显，无数据时仅显示占位说明）
const TREND_W = 640;
const TREND_H = 170;

/** 折线 + 面积路径：数据为空时返回空串，模板据此只显示坐标网格 */
const trendPath = computed(() => {
  const data = trend.value;
  if (!data.length) return { line: '', area: '', points: [] as { x: number; y: number; label: string; count: number }[] };
  const max = Math.max(...data.map((d) => d.count)) * 1.1;
  const pts = data.map((d, i) => ({
    x: (i / Math.max(1, data.length - 1)) * (TREND_W - 60) + 40,
    y: TREND_H - 28 - (d.count / max) * (TREND_H - 46),
    label: d.date,
    count: d.count,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x} ${TREND_H - 28} L ${pts[0].x} ${TREND_H - 28} Z`;
  return { line, area, points: pts };
});

function handleRefresh() {
  // 接口预留：监控数据聚合接口未开放，此处不发起请求
  ElMessage.info('接口预留：后端未提供监控数据聚合接口');
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header dash-header">
      <div>
        <h1 class="st-page-title">运维仪表盘</h1>
        <p class="st-page-subtitle">系统运行状态 · 服务健康度 · 智能体调用监控 · 异常告警</p>
      </div>
      <button class="st-btn st-btn--secondary" @click="handleRefresh">
        <RefreshCw :size="14" /> 刷新数据
      </button>
    </header>

    <div class="dash-notice">
      <AlertTriangle :size="14" />
      <span>
        接口预留：本页所需监控聚合能力（服务健康度、访问趋势、异常告警）后端尚未开放，当前为界面骨架。
        待后端补充接口，或由前端组合 GET /api/user/records 与 GET /api/knowledge/dataset/upload/list 计算得出。
      </span>
    </div>

    <!-- 统计卡 -->
    <div class="stat-grid">
      <div v-for="s in statCards" :key="s.label" class="st-card">
        <div class="st-card__body">
          <div class="stat-top">
            <div class="stat-icon"><component :is="s.icon" :size="17" /></div>
            <span class="st-stat-value">{{ s.value }}</span>
          </div>
          <div class="st-stat-label">{{ s.label }}</div>
          <div class="stat-sub">{{ s.sub }}</div>
        </div>
      </div>
    </div>

    <div class="dash-grid">
      <!-- 访问趋势 -->
      <section class="st-card">
        <div class="st-card__header">
          <div>
            <h2 class="st-card__title">近 7 日访问趋势</h2>
            <p class="st-card__hint">三端 Web 访问人次 · 接口预留，暂无数据</p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="chart-box">
            <svg :viewBox="`0 0 ${TREND_W} ${TREND_H}`" class="chart-svg">
              <defs>
                <linearGradient id="adminTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#1c1917" stop-opacity="0.14" />
                  <stop offset="100%" stop-color="#1c1917" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line
                v-for="i in 4"
                :key="i"
                :x1="40"
                :x2="TREND_W - 20"
                :y1="TREND_H - 28 - ((TREND_H - 46) / 4) * (i - 1)"
                :y2="TREND_H - 28 - ((TREND_H - 46) / 4) * (i - 1)"
                stroke="#e7e5e4"
                stroke-width="1"
                stroke-dasharray="3 3"
              />
              <line :x1="40" :x2="TREND_W - 20" :y1="TREND_H - 28" :y2="TREND_H - 28" stroke="#d6d3d1" stroke-width="1" />
              <template v-if="trendPath.line">
                <path :d="trendPath.area" fill="url(#adminTrendFill)" />
                <path :d="trendPath.line" fill="none" stroke="#1c1917" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <g v-for="p in trendPath.points" :key="p.label">
                  <circle :cx="p.x" :cy="p.y" r="3.2" fill="#1c1917" />
                  <text :x="p.x" :y="p.y - 9" text-anchor="middle" font-size="10" fill="#57534e">{{ p.count }}</text>
                  <text :x="p.x" :y="TREND_H - 10" text-anchor="middle" font-size="10" fill="#a8a29e">{{ p.label }}</text>
                </g>
              </template>
            </svg>
            <div v-if="!trend.length" class="chart-empty">
              <span class="st-empty__text">暂无趋势数据 · 接口预留</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 异常告警 -->
      <section class="st-card">
        <div class="st-card__header">
          <AlertTriangle :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">异常告警</h2>
            <p class="st-card__hint">需关注的运行风险（{{ alerts.length }} 条）· 接口预留</p>
          </div>
        </div>
        <div class="st-card__body alert-list">
          <div v-for="a in alerts" :key="a.id" class="alert-item">
            <div class="alert-item__head">
              <span class="st-badge" :class="a.level === 'danger' ? 'st-badge--danger' : 'st-badge--warning'">
                {{ a.level === 'danger' ? '严重' : '警告' }}
              </span>
              <span class="alert-item__title">{{ a.title }}</span>
              <span class="alert-item__time">{{ a.time }}</span>
            </div>
            <div class="alert-item__detail">{{ a.detail }}</div>
          </div>
          <div v-if="!alerts.length" class="skeleton-row" />
          <div v-if="!alerts.length" class="skeleton-row skeleton-row--short" />
          <div v-if="!alerts.length" class="placeholder-tip">接口预留：后端未提供告警查询接口</div>
        </div>
      </section>
    </div>

    <!-- 服务状态 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <Server :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">服务运行状态</h2>
          <p class="st-card__hint">{{ onlineCount }} / {{ services.length }} 个服务在线 · 含限流熔断监控（接口预留）</p>
        </div>
      </div>
      <div class="st-card__body">
        <div class="svc-section-title">核心业务微服务</div>
        <div class="svc-grid">
          <div v-for="s in businessServices" :key="s.serviceName" class="svc-item">
            <div class="svc-item__top">
              <span class="svc-dot" :class="s.online ? 'svc-dot--ok' : 'svc-dot--bad'"></span>
              <span class="svc-item__name">{{ s.serviceName }}</span>
              <span class="st-badge" :class="s.online ? 'st-badge--success' : 'st-badge--danger'">{{ s.online ? '在线' : '熔断' }}</span>
            </div>
            <div class="svc-item__meta">负载 {{ s.load }}% · 调用 {{ s.callCount.toLocaleString() }} 次 · 均响 {{ s.avgResponseMs }}ms</div>
            <div class="st-progress" style="margin-top: 6px;">
              <div class="st-progress__bar" :class="{ 'st-progress__bar--warn': s.load > 75 }" :style="{ width: s.load + '%' }"></div>
            </div>
          </div>
          <div v-for="n in 3" :key="`biz-ph-${n}`" class="svc-item svc-item--placeholder">
            <div class="skeleton-row skeleton-row--head" />
            <div class="skeleton-row" />
            <div class="st-progress" style="margin-top: 8px;">
              <div class="st-progress__bar" style="width: 0%;"></div>
            </div>
          </div>
        </div>

        <div class="svc-section-title" style="margin-top: 18px;">AI 智能体服务（Dify）</div>
        <div class="svc-grid">
          <div
            v-for="s in agentServices"
            :key="s.serviceName"
            class="svc-item"
            :class="{ 'svc-item--offline': !s.online }"
          >
            <div class="svc-item__top">
              <span class="svc-dot" :class="s.online ? 'svc-dot--ok' : 'svc-dot--bad'"></span>
              <span class="svc-item__name">
                <Bot v-if="s.online" :size="13" style="vertical-align: -2px; margin-right: 4px;" />
                <CircleSlash v-else :size="13" style="vertical-align: -2px; margin-right: 4px;" />
                {{ s.serviceName }}
              </span>
              <span class="st-badge" :class="s.online ? 'st-badge--success' : 'st-badge--danger'">{{ s.online ? '在线' : '熔断降级' }}</span>
            </div>
            <div class="svc-item__meta">
              {{ s.online ? `负载 ${s.load}% · 调用 ${s.callCount.toLocaleString()} 次 · 均响 ${s.avgResponseMs}ms` : '已返回教材标准兜底提示，建议检查 Dify 工作流' }}
            </div>
            <div class="st-progress" style="margin-top: 6px;">
              <div class="st-progress__bar" :class="{ 'st-progress__bar--warn': s.load > 75 }" :style="{ width: s.load + '%' }"></div>
            </div>
          </div>
          <div v-for="n in 3" :key="`agent-ph-${n}`" class="svc-item svc-item--placeholder">
            <div class="skeleton-row skeleton-row--head" />
            <div class="skeleton-row" />
            <div class="st-progress" style="margin-top: 8px;">
              <div class="st-progress__bar" style="width: 0%;"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.dash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.dash-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 10px 14px;
  background: var(--status-warning-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.dash-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--status-warning);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 960px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.stat-sub {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
}

.dash-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}

.chart-box {
  position: relative;
}

.chart-svg {
  width: 100%;
  height: auto;
  display: block;
}

.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 告警 */
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.alert-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.alert-item__time {
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.alert-item__detail {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-top: 6px;
}

/* 服务状态 */
.svc-section-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.svc-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 1080px) {
  .svc-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.svc-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.svc-item--offline {
  background: var(--status-danger-bg);
  border-color: rgba(185, 28, 28, 0.18);
}

.svc-item--placeholder {
  background: var(--bg-subtle);
}

.svc-item__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.svc-item__name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.svc-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.svc-dot--ok {
  background: var(--status-success);
}

.svc-dot--bad {
  background: var(--status-danger);
}

.svc-item__meta {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 8px;
}

.st-progress__bar--warn {
  background: var(--status-warning);
}

/* 骨架占位条 */
.skeleton-row {
  height: 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
}

.skeleton-row--head {
  height: 12px;
  width: 60%;
  margin-bottom: 10px;
}

.skeleton-row--short {
  width: 45%;
}

.placeholder-tip {
  font-size: 11.5px;
  color: var(--text-tertiary);
  text-align: center;
  padding-top: 4px;
}
</style>
