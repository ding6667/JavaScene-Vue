<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Code2,
  GitBranch,
  ListTree,
  Play,
  RefreshCw,
  Save,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapter, fetchChapters } from '@/api/student';
import { useStudentStore } from '@/stores/student';
import { highlightJava } from '@/utils/javaHighlight';
import type { Chapter } from '@/types/student';

/** 知识点视图模型（接口待接入，仅描述卡片所需字段） */
interface KnowledgePointItem {
  pointId: string;
  name: string;
  level: '了解' | '理解' | '掌握' | '重难点';
  content: string;
  pitfalls: string;
  caseId: string | null;
}

/** 章节案例代码视图模型（接口待接入） */
interface CaseCodeItem {
  caseId: string;
  caseName: string;
  description: string;
  codeContent: string;
}

const route = useRoute();
const router = useRouter();
const studentStore = useStudentStore();

const chapterId = Number(route.params.chapterId);
const loading = ref(true);
const saving = ref(false);
const chapter = ref<Chapter | null>(null);
const activeTab = ref<'content' | 'cases' | 'tree' | 'summary'>('content');
const activeCaseIdx = ref(0);

/**
 * 以下区域后端已提供接口，前端尚未实现取数，只保留卡片与空态骨架：
 * 接口预留：GET /api/knowledge/point/list    （知识点列表 / 重难点总结）
 * 接口预留：GET /api/knowledge/content/list  （章节案例代码）
 * 接口预留：GET /api/knowledge/chapter/tree   （章节树 / 子节结构）
 * 接口预留：GET /api/study/progress/get      （学习进度读取，进度上报已接 POST /api/study/progress/save）
 */
const knowledgePoints = ref<KnowledgePointItem[]>([]);
const caseCodes = ref<CaseCodeItem[]>([]);
const childChapters = ref<Chapter[]>([]);
const keyPointSummary = ref<string | null>(null);

/** 同级章节（用于上一章 / 下一章切换，数据来自真实章节列表） */
const siblings = ref<Chapter[]>([]);

const LEVEL_BADGE: Record<KnowledgePointItem['level'], string> = {
  了解: 'st-badge--neutral',
  理解: 'st-badge--outline',
  掌握: 'st-badge--info',
  重难点: 'st-badge--dark',
};

/** 本次会话已上报的进度（store.savedChapters 回显），null 表示尚未上报 */
const savedRate = computed<number | null>(() => {
  const map = studentStore.savedChapters as Record<number, number | undefined>;
  const v = map[chapterId];
  return typeof v === 'number' ? v : null;
});

const statusText = computed(() => {
  if (savedRate.value === null) return '进度未同步';
  if (savedRate.value >= 100) return '已学完';
  return savedRate.value > 0 ? '学习中' : '未学';
});

const statusBadge = computed(() => {
  if (savedRate.value === null) return 'st-badge--neutral';
  if (savedRate.value >= 100) return 'st-badge--dark';
  return savedRate.value > 0 ? 'st-badge--info' : 'st-badge--neutral';
});

const activeCase = computed(() => caseCodes.value[activeCaseIdx.value] ?? null);

/** 上报学习进度（真实写入：POST /api/study/progress/save） */
async function reportProgress(rate: number) {
  if (saving.value) return;
  saving.value = true;
  try {
    await studentStore.markProgress(chapterId, rate);
    ElMessage.success(rate >= 100 ? '已上报：本章学完' : rate > 0 ? '已上报：学习中' : '已上报：重置为未学');
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const [detail, list] = await Promise.all([fetchChapter(chapterId), fetchChapters()]);
    chapter.value = detail;
    if (detail) {
      siblings.value = list
        .filter((c) => c.level === detail.level && c.parentId === detail.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    loading.value = false;
  }
});

function goChapter(delta: number) {
  const idx = siblings.value.findIndex((c) => c.id === chapterId);
  if (idx < 0) return;
  const target = siblings.value[idx + delta];
  if (target) router.push(`/student/learn/${target.id}`);
}

const prevDisabled = computed(() => {
  const idx = siblings.value.findIndex((c) => c.id === chapterId);
  return idx <= 0;
});

const nextDisabled = computed(() => {
  const idx = siblings.value.findIndex((c) => c.id === chapterId);
  return idx < 0 || idx >= siblings.value.length - 1;
});
</script>

<template>
  <div class="st-view">
    <!-- 顶部导航 -->
    <div class="detail-topbar">
      <button class="st-text-btn" @click="router.push('/student/learn')">
        <ArrowLeft :size="14" style="margin-right: 4px;" /> 返回章节列表
      </button>
      <div class="detail-switch">
        <button class="st-text-btn" :disabled="prevDisabled" @click="goChapter(-1)">
          <ChevronLeft :size="14" /> 上一章
        </button>
        <button class="st-text-btn" :disabled="nextDisabled" @click="goChapter(1)">
          下一章 <ChevronRight :size="14" />
        </button>
      </div>
    </div>

    <div v-if="!loading && chapter">
      <!-- 章节头部 -->
      <header class="st-page-header">
        <div class="detail-title-row">
          <h1 class="st-page-title">{{ chapter.chapterCode }} · {{ chapter.title }}</h1>
          <span class="st-badge" :class="statusBadge">{{ statusText }}</span>
        </div>
        <p class="st-page-subtitle">{{ chapter.description }}</p>
      </header>

      <!-- 进度上报（真实接口：POST /api/study/progress/save） -->
      <div class="st-card mark-card">
        <div class="st-card__body mark-row">
          <span class="mark-label">上报本章学习进度：</span>
          <button class="st-btn st-btn--secondary" :disabled="saving" @click="reportProgress(0)">
            未学
          </button>
          <button class="st-btn st-btn--secondary" :disabled="saving" @click="reportProgress(50)">
            <RefreshCw :size="14" /> 学习中
          </button>
          <button class="st-btn st-btn--primary" :disabled="saving" @click="reportProgress(100)">
            <Save :size="14" /> 已学完并上报
          </button>
          <span v-if="savedRate !== null" class="mark-saved">本次会话已上报 {{ savedRate }}%</span>
        </div>
      </div>

      <!-- Tab 切换 -->
      <div class="detail-tabs">
        <button
          v-for="t in [
            { key: 'content', label: '知识点讲解', icon: ListTree },
            { key: 'cases', label: '案例代码', icon: Code2 },
            { key: 'tree', label: '章节结构', icon: GitBranch },
            { key: 'summary', label: '重难点总结', icon: CircleAlert },
          ]"
          :key="t.key"
          class="detail-tab"
          :class="{ 'detail-tab--active': activeTab === t.key }"
          @click="activeTab = t.key as typeof activeTab"
        >
          <component :is="t.icon" :size="14" /> {{ t.label }}
        </button>
      </div>

      <!-- 知识点讲解（接口预留：GET /api/knowledge/point/list） -->
      <template v-if="activeTab === 'content'">
        <div v-if="knowledgePoints.length === 0" class="st-card">
          <div class="st-card__body st-empty" style="padding: 70px 16px;">
            <ListTree :size="40" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
        </div>

        <div v-for="kp in knowledgePoints" :key="kp.pointId" class="st-card kp-card">
          <div class="st-card__header">
            <h2 class="st-card__title">{{ kp.name }}</h2>
            <span class="st-badge" :class="LEVEL_BADGE[kp.level]">{{ kp.level }}</span>
          </div>
          <div class="st-card__body">
            <p class="kp-content">{{ kp.content }}</p>
            <div v-if="kp.pitfalls" class="kp-pitfall">
              <CircleAlert :size="14" class="kp-pitfall__icon" />
              <div>
                <div class="kp-pitfall__label">易错提示</div>
                <div class="kp-pitfall__text">{{ kp.pitfalls }}</div>
              </div>
            </div>
            <div v-if="kp.caseId" class="kp-actions">
              <button class="st-btn st-btn--secondary" @click="activeTab = 'cases'">
                <Play :size="13" /> 查看配套案例
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- 案例代码（接口预留：GET /api/knowledge/content/list） -->
      <template v-else-if="activeTab === 'cases'">
        <div class="st-card">
          <div v-if="caseCodes.length === 0" class="st-card__body st-empty" style="padding: 70px 16px;">
            <Code2 :size="40" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>

          <template v-else>
            <div class="st-card__header" style="flex-wrap: wrap;">
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button
                  v-for="(c, i) in caseCodes"
                  :key="c.caseId"
                  class="case-chip"
                  :class="{ 'case-chip--active': activeCaseIdx === i }"
                  @click="activeCaseIdx = i"
                >
                  {{ c.caseName }}
                </button>
              </div>
            </div>
            <div class="st-card__body">
              <div v-if="activeCase">
                <p class="case-desc">{{ activeCase.description }}</p>
                <div class="case-code-box st-code">
                  <pre v-html="highlightJava(activeCase.codeContent)"></pre>
                </div>
                <div class="kp-actions">
                  <button
                    class="st-btn st-btn--primary"
                    @click="router.push({ path: '/student/code', query: { chapterId: chapter.id, caseId: activeCase.caseId } })"
                  >
                    <Play :size="14" /> 在代码实操中运行
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- 章节结构（接口预留：GET /api/knowledge/chapter/tree） -->
      <template v-else-if="activeTab === 'tree'">
        <div class="st-card">
          <div class="st-card__header">
            <h2 class="st-card__title">本章小节</h2>
            <p class="st-card__hint">树形结构由后端章节树接口提供</p>
          </div>
          <div class="st-card__body" style="padding-top: 12px;">
            <div v-if="childChapters.length === 0" class="st-empty" style="padding: 44px 16px;">
              <GitBranch :size="40" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">暂无数据，接口待接入</div>
            </div>

            <div v-for="child in childChapters" :key="child.id" class="tree-node">
              <ChevronRight :size="14" class="tree-node__icon" />
              <div class="tree-node__main">
                <div class="tree-node__title">{{ child.chapterCode }} {{ child.title }}</div>
                <div class="tree-node__desc">{{ child.description }}</div>
              </div>
              <button class="st-text-btn" @click="router.push(`/student/learn/${child.id}`)">进入小节 →</button>
            </div>
          </div>
        </div>
      </template>

      <!-- 重难点总结（接口预留：GET /api/knowledge/point/list） -->
      <template v-else>
        <div class="st-card">
          <div class="st-card__header">
            <h2 class="st-card__title">本章重难点总结</h2>
          </div>
          <div class="st-card__body">
            <p v-if="keyPointSummary" class="kp-content">{{ keyPointSummary }}</p>
            <div v-else class="st-empty" style="padding: 24px 0;">
              <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">暂无数据，接口待接入</div>
            </div>

            <div v-if="knowledgePoints.length" class="summary-quick">
              <div class="summary-quick__label">本章知识点速览</div>
              <div class="summary-quick__list">
                <span v-for="kp in knowledgePoints" :key="kp.pointId" class="st-badge" :class="LEVEL_BADGE[kp.level]">
                  {{ kp.name }} · {{ kp.level }}
                </span>
              </div>
            </div>

            <div class="kp-actions" style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="st-btn st-btn--primary" :disabled="saving" @click="reportProgress(100)">
                <BookOpenCheck :size="14" /> 学完了，上报本章进度
              </button>
              <button class="st-btn st-btn--secondary" @click="router.push(`/student/practice/${chapter.id}`)">
                去刷本章习题 →
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-else class="st-card" style="margin-top: 12px;">
      <div class="st-card__body st-empty" style="padding: 80px 16px;">
        <div class="st-empty__text">{{ loading ? '正在加载章节内容…' : '章节不存在' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.detail-switch {
  display: flex;
  gap: 4px;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mark-card {
  margin-bottom: 20px;
}

.mark-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.mark-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.mark-saved {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

/* Tabs */
.detail-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-default);
}

.detail-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13.5px;
  font-weight: 500;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 10px 14px;
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition);
}

.detail-tab:hover {
  color: var(--text-primary);
}

.detail-tab--active {
  color: var(--text-primary);
  font-weight: 600;
  border-bottom-color: var(--text-primary);
}

/* 知识点卡片 */
.kp-card {
  margin-bottom: 16px;
}

.kp-content {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-primary);
}

.kp-pitfall {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.kp-pitfall__icon {
  color: var(--status-warning);
  flex-shrink: 0;
  margin-top: 2px;
}

.kp-pitfall__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.kp-pitfall__text {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-top: 2px;
}

.kp-actions {
  margin-top: 16px;
}

/* 案例代码 */
.case-chip {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 4px 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.case-chip:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.case-chip--active {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: var(--bg-surface);
  font-weight: 600;
}

.case-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.case-code-box {
  background: #f8f8f7;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 16px;
  overflow-x: auto;
}

.case-code-box pre {
  margin: 0;
  font-family: inherit;
}

/* 章节树节点 */
.tree-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.tree-node:last-child {
  border-bottom: none;
}

.tree-node__icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.tree-node__main {
  flex: 1;
  min-width: 0;
}

.tree-node__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.tree-node__desc {
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-top: 3px;
  line-height: 1.55;
}

/* 总结 */
.summary-quick {
  margin-top: 20px;
  padding: 14px 16px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
}

.summary-quick__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.summary-quick__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
