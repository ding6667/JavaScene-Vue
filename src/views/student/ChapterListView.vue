<script setup lang="ts">
/**
 * 章节同步学习列表（学生端）
 * 真实接口：GET /api/knowledge/chapter/list（@/api/knowledge.fetchChapters）
 * 已接桩：待实现 @/api/study.fetchProgress（GET /api/study/progress/get?courseId=）
 *   —— 每个章节按 chapterId 匹配，渲染 progressRate / isCompleted / lastStudyTime，
 *      顶部汇总卡由同一份进度数组聚合（已完成数 / 总数、平均进度）。
 * 说明：知识点数与案例数需按章逐条调用 fetchKnowledgePoints / fetchTextbookContent（N+1 请求），
 *   列表页不做，改由详情页展示（已接桩：待实现 @/api/knowledge.fetchKnowledgePoints、
 *   @/api/knowledge.fetchTextbookContent）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookOpenCheck,
  ChevronRight,
  CircleDashed,
  Layers,
  Loader2,
  RefreshCw,
} from 'lucide-vue-next';
import { DEFAULT_COURSE_ID, fetchChapters } from '@/api/knowledge';
import { fetchProgress } from '@/api/study';
import type { Chapter } from '@/types/knowledge';
import type { StudyProgress } from '@/types/study';

const router = useRouter();
const loading = ref(true);
const chapters = ref<Chapter[]>([]);

/** 学习进度（已接桩：待实现 GET /api/study/progress/get） */
const progressList = ref<StudyProgress[]>([]);
const loadingProgress = ref(false);
const progressError = ref('');

/** chapterId → 进度，列表项按 id 取用 */
const progressMap = computed<Record<number, StudyProgress>>(() => {
  const map: Record<number, StudyProgress> = {};
  for (const p of progressList.value) map[p.chapterId] = p;
  return map;
});

const completedCount = computed(
  () => progressList.value.filter((p) => p.isCompleted === 1 || p.progressRate >= 100).length,
);

const avgRate = computed(() => {
  const list = progressList.value;
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, p) => sum + (p.progressRate ?? 0), 0) / list.length);
});

/** 章 / 节 / 小节 的层级标签（Chapter.level） */
const LEVEL_META: Record<number, { label: string; badge: string; icon: unknown }> = {
  1: { label: '章', badge: 'st-badge--dark', icon: BookOpenCheck },
  2: { label: '节', badge: 'st-badge--neutral', icon: CircleDashed },
  3: { label: '小节', badge: 'st-badge--outline', icon: CircleDashed },
};

function levelMeta(level: number) {
  return LEVEL_META[level] ?? { label: '章节', badge: 'st-badge--neutral', icon: CircleDashed };
}

/** 后端返回扁平结构，按 sortOrder 排列展示 */
const chapterRows = computed(() =>
  [...chapters.value].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
);

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function progressOf(id: number): StudyProgress | null {
  return progressMap.value[id] ?? null;
}

function rateOf(id: number): number {
  return progressOf(id)?.progressRate ?? 0;
}

function isDone(id: number): boolean {
  const p = progressOf(id);
  if (!p) return false;
  return p.isCompleted === 1 || p.progressRate >= 100;
}

async function loadChapters() {
  loading.value = true;
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 真实只读接口：错误已由响应拦截器统一提示，保持空列表骨架
    chapters.value = [];
  } finally {
    loading.value = false;
  }
}

/** 已接桩：待实现 @/api/study.fetchProgress */
async function loadProgress() {
  loadingProgress.value = true;
  progressError.value = '';
  try {
    progressList.value = (await fetchProgress(DEFAULT_COURSE_ID)) ?? [];
  } catch {
    progressList.value = [];
    progressError.value = '接口待实现：fetchProgress（GET /api/study/progress/get?courseId=）';
  } finally {
    loadingProgress.value = false;
  }
}

onMounted(async () => {
  await loadChapters();
  void loadProgress();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">章节同步学习</h1>
      <p class="st-page-subtitle">按《Java 程序设计基础》教材章节顺序学习 · 进度可上报后端</p>
    </header>

    <!-- 进度概览（已接桩：待实现 @/api/study.fetchProgress，聚合自本章全部章节进度） -->
    <div class="st-card progress-card">
      <div class="st-card__body" style="padding: 18px 24px;">
        <div class="sum-row">
          <div class="sum-stat">
            <div class="st-stat-value">
              {{ progressError || loadingProgress ? '—' : `${completedCount} / ${chapterRows.length}` }}
            </div>
            <div class="st-stat-label">已完成章节 / 全部章节</div>
          </div>
          <div class="sum-stat">
            <div class="st-stat-value">{{ progressError || loadingProgress ? '—' : `${avgRate}%` }}</div>
            <div class="st-stat-label">平均进度</div>
          </div>
          <div class="sum-progress">
            <div class="progress-row">
              <span class="progress-text">总进度</span>
              <div class="st-progress" style="flex: 1;">
                <div class="st-progress__bar" :style="{ width: (progressError ? 0 : avgRate) + '%' }"></div>
              </div>
              <span class="progress-value">
                {{ loadingProgress ? '正在读取…' : progressError ? '暂无数据' : `${avgRate}%` }}
              </span>
            </div>
            <p v-if="progressError" class="progress-error">{{ progressError }}</p>
            <p v-else class="progress-error">
              已取到 {{ progressList.length }} 条进度记录 · 未开始学习的章节不入库，故不进列表
            </p>
          </div>
          <button class="st-btn st-btn--secondary" :disabled="loadingProgress" @click="loadProgress">
            <RefreshCw :size="14" /> 重新加载
          </button>
        </div>
      </div>
    </div>

    <!-- 章节列表 -->
    <div class="st-card chapter-card">
      <div v-if="loading" class="st-empty" style="padding: 60px 16px;">
        <Loader2 :size="20" class="spin" />
        <div class="st-empty__text">正在加载章节…</div>
      </div>
      <div v-else-if="chapterRows.length === 0" class="st-empty" style="padding: 60px 16px;">
        <Layers :size="36" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">暂无章节数据（GET /api/knowledge/chapter/list 未返回记录）</div>
      </div>
      <div v-else class="chapter-list">
        <div
          v-for="chapter in chapterRows"
          :key="chapter.id"
          class="chapter-item"
          role="button"
          tabindex="0"
          @click="router.push(`/student/learn/${chapter.id}`)"
          @keydown.enter="router.push(`/student/learn/${chapter.id}`)"
        >
          <div class="chapter-item__no">{{ chapter.chapterCode }}</div>
          <div class="chapter-item__main">
            <div class="chapter-item__name">{{ chapter.title }}</div>
            <div class="chapter-item__desc">{{ chapter.description }}</div>
            <div class="chapter-item__meta">
              <span class="st-badge" :class="levelMeta(chapter.level).badge">
                <component :is="levelMeta(chapter.level).icon" :size="11" style="margin-right: 4px;" />
                {{ levelMeta(chapter.level).label }}
              </span>
              <span class="st-badge" :class="isDone(chapter.id) ? 'st-badge--dark' : 'st-badge--neutral'">
                {{ isDone(chapter.id) ? '已学' : rateOf(chapter.id) > 0 ? '学习中' : '未学' }}
              </span>
              <span v-if="progressOf(chapter.id)" class="chapter-item__kp">
                最后学习 {{ fmtTime(progressOf(chapter.id)?.lastStudyTime) }}
              </span>
            </div>
            <div class="chapter-item__progress-row">
              <div class="st-progress" style="flex: 1;">
                <div
                  class="st-progress__bar"
                  :style="{ width: (progressError ? 0 : rateOf(chapter.id)) + '%' }"
                ></div>
              </div>
              <span class="chapter-item__progress">
                {{ progressError ? '—' : `${rateOf(chapter.id)}%` }}
              </span>
            </div>
          </div>
          <div class="chapter-item__right">
            <ChevronRight :size="16" class="chapter-item__arrow" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-card {
  margin-bottom: 16px;
}

.sum-row {
  display: flex;
  align-items: center;
  gap: 28px;
  flex-wrap: wrap;
}

.sum-stat {
  min-width: 110px;
}

.sum-progress {
  flex: 1;
  min-width: 260px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-text {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.progress-value {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.progress-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.chapter-card :deep(.chapter-item:first-child) {
  border-top: none;
}

.chapter-list {
  display: flex;
  flex-direction: column;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition);
}

.chapter-item:hover {
  background: var(--bg-subtle);
}

.chapter-item__no {
  min-width: 44px;
  height: 36px;
  padding: 0 8px;
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.chapter-item__main {
  flex: 1;
  min-width: 0;
}

.chapter-item__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.chapter-item__desc {
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-top: 3px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chapter-item__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.chapter-item__kp {
  font-size: 12px;
  color: var(--text-tertiary);
}

.chapter-item__progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}

.chapter-item__progress {
  font-size: 12px;
  color: var(--text-tertiary);
  min-width: 38px;
  text-align: right;
}

.chapter-item__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.chapter-item__arrow {
  color: var(--text-tertiary);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
