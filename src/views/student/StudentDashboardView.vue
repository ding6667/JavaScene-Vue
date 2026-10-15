<script setup lang="ts">
/**
 * 学习仪表盘 —— 当前为 UI 壳（只保留界面状态，不接 api / pinia）
 *
 * 后端未提供仪表盘聚合接口，本视图需由前端组合以下接口或由后端补充聚合接口：
 * 接口预留：GET /api/study/progress/get        章节完成度 / 整体进度
 * 接口预留：GET /api/exam/wrong-question/list  错题数量 / 薄弱知识点
 * 接口预留：GET /api/teach/homework/list       待完成作业（后端暂无学生维度作业列表，需后端补充按当前用户过滤）
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookOpen,
  CircleAlert,
  ClipboardList,
  Clock,
  FileEdit,
  ListChecks,
  Sparkles,
  TrendingUp,
} from 'lucide-vue-next';

/** 统计卡：数据源接口预留，null 一律显示占位符 */
interface StatCard {
  icon: unknown;
  label: string;
  value: string;
  sub: string;
  route: string;
}

interface TodoItem {
  id: number;
  title: string;
  deadline: string | null;
  route: string;
}

interface Recommendation {
  id: number;
  type: 'review' | 'practice' | 'chapter';
  title: string;
  reason: string;
  route: string;
}

const router = useRouter();

const chapterProgressRate = ref<number | null>(null);
const completedChapters = ref<number | null>(null);
const totalChapters = ref<number | null>(null);

const stats = ref<StatCard[]>([
  { icon: BookOpen, label: '章节完成度', value: '—', sub: '接口待接入', route: '/student/learn' },
  { icon: FileEdit, label: '待完成作业', value: '—', sub: '份作业待提交', route: '/student/homework' },
  { icon: CircleAlert, label: '错题数量', value: '—', sub: '道待复盘巩固', route: '/student/wrong' },
  { icon: ListChecks, label: '累计刷题', value: '—', sub: '道题目已练习', route: '/student/practice' },
]);

/** 待办（作业 / 错题复盘），接口预留 */
const todos = ref<TodoItem[]>([]);

/** 推荐学习位，接口预留（后端暂无推荐接口，需由错题与进度组合） */
const recommendations = ref<Recommendation[]>([]);

const weakPoints = ref<{ knowledgePoint: string; masterRate: number; suggestion: string }[]>([]);

function recBadge(type: Recommendation['type']) {
  if (type === 'review') return 'st-badge--dark';
  return 'st-badge--outline';
}

function recLabel(type: Recommendation['type']) {
  return type === 'review' ? '补弱' : type === 'practice' ? '刷题' : '章节';
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">学习仪表盘</h1>
      <p class="st-page-subtitle">基于《Java 程序设计基础》教材同步学习</p>
    </header>

    <!-- 学习进度总览（接口预留：GET /api/study/progress/get） -->
    <div class="st-card overview-card">
      <div class="st-card__body">
        <div class="overview-top">
          <div>
            <div class="overview-title">本学期学习进度</div>
            <div class="overview-sub">
              {{
                completedChapters === null || totalChapters === null
                  ? '暂无数据，接口待接入'
                  : `已完成 ${completedChapters} / ${totalChapters} 章`
              }}
            </div>
          </div>
          <div class="st-stat-value">{{ chapterProgressRate === null ? '—' : `${chapterProgressRate}%` }}</div>
        </div>
        <div class="st-progress" style="margin-top: 12px;">
          <div class="st-progress__bar" :style="{ width: (chapterProgressRate ?? 0) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="stat-grid">
      <div
        v-for="s in stats"
        :key="s.label"
        class="st-card stat-card"
        role="button"
        tabindex="0"
        @click="router.push(s.route)"
        @keydown.enter="router.push(s.route)"
      >
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
      <!-- 待办事项 -->
      <section class="st-card">
        <div class="st-card__header">
          <ClipboardList :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">待办事项</h2>
            <p class="st-card__hint">接口预留：GET /api/teach/homework/list</p>
          </div>
        </div>
        <div class="st-card__body">
          <div v-if="todos.length === 0" class="st-empty">
            <ClipboardList :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
          <div v-else class="todo-list">
            <div
              v-for="t in todos"
              :key="t.id"
              class="todo-item"
              role="button"
              tabindex="0"
              @click="router.push(t.route)"
              @keydown.enter="router.push(t.route)"
            >
              <FileEdit :size="14" class="todo-item__icon" />
              <div class="todo-item__title">{{ t.title }}</div>
              <div class="todo-item__deadline">{{ t.deadline ?? '—' }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 个人学情简况（接口预留：GET /api/exam/wrong-question/list） -->
      <section class="st-card">
        <div class="st-card__header">
          <TrendingUp :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">个人学情简况</h2>
            <p class="st-card__hint">低于 70% 掌握率标记为薄弱</p>
          </div>
        </div>
        <div class="st-card__body">
          <div v-if="weakPoints.length === 0" class="st-empty">
            <TrendingUp :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
          <div v-else class="weak-list">
            <div v-for="w in weakPoints" :key="w.knowledgePoint" class="weak-item">
              <div class="weak-item__top">
                <span class="weak-item__name">{{ w.knowledgePoint }}</span>
                <span class="weak-item__rate">{{ w.masterRate }}%</span>
              </div>
              <div class="st-progress" style="margin: 8px 0;">
                <div class="st-progress__bar" :class="{ 'st-progress__bar--warn': w.masterRate < 70 }" :style="{ width: w.masterRate + '%' }"></div>
              </div>
              <div class="weak-item__suggestion">{{ w.suggestion }}</div>
            </div>
          </div>
          <button class="st-text-btn" style="margin-top: 8px;" @click="router.push('/student/report')">
            查看完整学情报告 →
          </button>
        </div>
      </section>
    </div>

    <!-- 推荐学习内容 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <Sparkles :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">推荐学习内容</h2>
          <p class="st-card__hint">依据学习进度与薄弱点组合推荐（后端暂无推荐接口）</p>
        </div>
      </div>
      <div class="st-card__body">
        <div v-if="recommendations.length === 0" class="st-empty">
          <Sparkles :size="34" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无数据，接口待接入</div>
        </div>
        <div v-else class="rec-grid">
          <div
            v-for="r in recommendations"
            :key="r.id"
            class="rec-item"
            role="button"
            tabindex="0"
            @click="router.push(r.route)"
            @keydown.enter="router.push(r.route)"
          >
            <span class="st-badge" :class="recBadge(r.type)">{{ recLabel(r.type) }}</span>
            <div class="rec-item__title">{{ r.title }}</div>
            <div class="rec-item__reason">{{ r.reason }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 近期动态（后端未提供学习行为流水接口） -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <Clock :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">近期学习动态</h2>
          <p class="st-card__hint">后端未提供行为流水接口，需前端组合进度与代码记录</p>
        </div>
      </div>
      <div class="st-card__body">
        <div class="st-empty">
          <Clock :size="34" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无数据，接口待接入</div>
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

.overview-card {
  margin-bottom: 20px;
}

.overview-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.overview-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.overview-sub {
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  cursor: pointer;
  transition: box-shadow var(--transition), border-color var(--transition), transform var(--transition);
}

.stat-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
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
  grid-template-columns: 1.1fr 1fr;
  gap: 20px;
}

@media (max-width: 960px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .dash-grid {
    grid-template-columns: 1fr;
  }
}

/* 待办 */
.todo-list {
  display: flex;
  flex-direction: column;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item__icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.todo-item__title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.todo-item__deadline {
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* 薄弱知识点 */
.weak-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  line-height: 1.55;
}

/* 推荐内容 */
.rec-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 960px) {
  .rec-grid {
    grid-template-columns: 1fr;
  }
}

.rec-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.rec-item:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
}

.rec-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 10px;
}

.rec-item__reason {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.5;
}
</style>
