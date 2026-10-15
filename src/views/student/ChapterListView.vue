<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { BookOpenCheck, ChevronRight, CircleDashed, Layers } from 'lucide-vue-next';
import { fetchChapters } from '@/api/student';
import type { Chapter } from '@/types/student';

const router = useRouter();
const loading = ref(true);
const chapters = ref<Chapter[]>([]);

/**
 * 以下三块区域的后端接口已存在，但前端尚未实现取数，这里只保留 UI 骨架：
 * 接口预留：GET /api/knowledge/point/list    （章节知识点列表 / 数量）
 * 接口预留：GET /api/knowledge/content/list  （章节案例代码列表 / 数量）
 * 接口预留：GET /api/study/progress/get      （章节学习进度 / 最后学习时间）
 */
const knowledgePointCount = ref<number | null>(null);
const caseCodeCount = ref<number | null>(null);
const progressRate = ref<number | null>(null);

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

onMounted(async () => {
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">章节同步学习</h1>
      <p class="st-page-subtitle">按《Java 程序设计基础》教材章节顺序学习 · 进度可上报后端</p>
    </header>

    <!-- 进度概览（接口预留：GET /api/study/progress/get） -->
    <div class="st-card progress-card">
      <div class="st-card__body" style="padding: 16px 24px;">
        <div class="progress-row">
          <span class="progress-text">总进度</span>
          <div class="st-progress" style="flex: 1;">
            <div class="st-progress__bar" :style="{ width: (progressRate ?? 0) + '%' }"></div>
          </div>
          <span class="progress-value">
            {{ progressRate === null ? '暂无数据，接口待接入' : `${progressRate}%` }}
          </span>
        </div>
      </div>
    </div>

    <!-- 章节列表 -->
    <div class="st-card chapter-card">
      <div v-if="loading" class="st-empty" style="padding: 60px 16px;">
        <div class="st-empty__text">正在加载章节…</div>
      </div>
      <div v-else-if="chapterRows.length === 0" class="st-empty" style="padding: 60px 16px;">
        <Layers :size="36" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">暂无数据，接口待接入</div>
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
              <span class="chapter-item__kp">
                知识点 {{ knowledgePointCount ?? '—' }} 个 · 案例 {{ caseCodeCount ?? '—' }} 个
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

.chapter-item__kp,
.chapter-item__progress {
  font-size: 12px;
  color: var(--text-tertiary);
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
</style>
