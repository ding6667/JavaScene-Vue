<script setup lang="ts">
/**
 * 章节详情（学生端）—— 数据流已接桩
 * 已接桩：待实现 @/api/knowledge.fetchKnowledgePoints（GET /api/knowledge/point/list?chapterId=）
 * 已接桩：待实现 @/api/knowledge.fetchTextbookContent（GET /api/knowledge/content/list?chapterId&contentType&keyword&pageNum&pageSize）
 * 已接桩：待实现 @/api/knowledge.fetchChapterTree（GET /api/knowledge/chapter/tree?courseId=）
 * 已接桩：待实现 @/api/study.fetchProgress（GET /api/study/progress/get?courseId=，按 chapterId 匹配本章）
 * 真实接口：GET /api/knowledge/chapter/list（章节与同级切换）、POST /api/study/progress/save（进度上报）
 */
import { computed, onMounted, ref, watch } from 'vue';
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
  Loader2,
  Play,
  RefreshCw,
  Save,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import {
  DEFAULT_COURSE_ID,
  fetchChapter,
  fetchChapterTree,
  fetchChapters,
  fetchKnowledgePoints,
  fetchTextbookContent,
} from '@/api/knowledge';
import { fetchProgress } from '@/api/study';
import { useStudentStore } from '@/stores/student';
import { highlightJava } from '@/utils/javaHighlight';
import type { Chapter, ChapterTreeNode, KnowledgePoint, TextbookContent } from '@/types/knowledge';
import type { StudyProgress } from '@/types/study';

/** 知识点难度码值 → 界面层级（后端 difficulty 为整数码值，无层级文案） */
type KpLevel = '了解' | '理解' | '掌握' | '重难点';

const route = useRoute();
const router = useRouter();
const studentStore = useStudentStore();

const chapterId = computed(() => Number(route.params.chapterId));
const courseId = computed(() => chapter.value?.courseId ?? DEFAULT_COURSE_ID);

const loading = ref(true);
const saving = ref(false);
const chapter = ref<Chapter | null>(null);
const activeTab = ref<'content' | 'cases' | 'tree' | 'summary'>('content');
const activeCaseIdx = ref(0);

/** 知识点（已接桩：待实现 GET /api/knowledge/point/list） */
const knowledgePoints = ref<KnowledgePoint[]>([]);
const loadingPoints = ref(false);
const pointsError = ref('');

/** 教材原文 / 案例（已接桩：待实现 GET /api/knowledge/content/list，分页） */
const contents = ref<TextbookContent[]>([]);
const loadingContents = ref(false);
const contentsError = ref('');
const contentPageNum = ref(1);
const contentPageSize = ref(5);
const contentTotal = ref(0);
const contentFilterType = ref<number | undefined>(undefined);
const contentKeyword = ref('');

/** 章节树（已接桩：待实现 GET /api/knowledge/chapter/tree） */
const treeNodes = ref<ChapterTreeNode[]>([]);
const loadingTree = ref(false);
const treeError = ref('');

/** 学习进度（已接桩：待实现 GET /api/study/progress/get） */
const serverProgress = ref<StudyProgress | null>(null);
const loadingProgress = ref(false);
const progressError = ref('');

/** 同级章节（用于上一章 / 下一章切换，数据来自真实章节列表） */
const siblings = ref<Chapter[]>([]);

const CONTENT_TYPES = [
  { value: 1, label: '概念定义' },
  { value: 2, label: '例题' },
  { value: 3, label: '代码案例' },
  { value: 4, label: '习题' },
];

const LEVEL_BADGE: Record<KpLevel, string> = {
  了解: 'st-badge--neutral',
  理解: 'st-badge--outline',
  掌握: 'st-badge--info',
  重难点: 'st-badge--dark',
};

function levelOf(difficulty: number): KpLevel {
  if (difficulty >= 5) return '重难点';
  if (difficulty === 4) return '掌握';
  if (difficulty >= 3) return '理解';
  return '了解';
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 本次会话已上报的进度（store.savedChapters 回显），null 表示尚未上报 */
const savedRate = computed<number | null>(() => {
  const map = studentStore.savedChapters as Record<number, number | undefined>;
  const v = map[chapterId.value];
  return typeof v === 'number' ? v : null;
});

/** 进度条展示值：本次上报优先，其次后端进度 */
const displayRate = computed(() => savedRate.value ?? serverProgress.value?.progressRate ?? 0);

const isLearned = computed(
  () => (serverProgress.value?.isCompleted ?? 0) === 1 || displayRate.value >= 100,
);

const statusText = computed(() => {
  if (savedRate.value !== null) {
    return savedRate.value >= 100 ? '已学完' : savedRate.value > 0 ? '学习中' : '未学';
  }
  if (serverProgress.value) return isLearned.value ? '已学' : '未学';
  return progressError.value ? '进度未同步' : '未学';
});

const statusBadge = computed(() => {
  if (isLearned.value) return 'st-badge--dark';
  if (displayRate.value > 0) return 'st-badge--info';
  return 'st-badge--neutral';
});

/** 案例区只展示代码案例（contentType=3）；其余类型在原文列表里直接给出 */
const caseCodes = computed(() => contents.value);
const activeCase = computed(() => caseCodes.value[activeCaseIdx.value] ?? null);
const contentTotalPages = computed(() =>
  Math.max(1, Math.ceil(contentTotal.value / contentPageSize.value)),
);

/** 重难点总结：取难度码值 ≥4 的知识点，由后端知识点列表归纳，不额外请求 */
const hardPoints = computed(() => knowledgePoints.value.filter((p) => p.difficulty >= 4));
const keyPointSummary = computed(() => {
  if (!hardPoints.value.length) return null;
  return hardPoints.value
    .map((p) => `${p.name}：${p.description || '（后端未填写描述）'}${p.pageRef ? `（${p.pageRef}）` : ''}`)
    .join('\n');
});

function findNode(nodes: ChapterTreeNode[], id: number): ChapterTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

const currentNode = computed(() => findNode(treeNodes.value, chapterId.value));
const childNodes = computed<ChapterTreeNode[]>(() => currentNode.value?.children ?? []);

/** 已接桩：待实现 @/api/knowledge.fetchKnowledgePoints */
async function loadKnowledgePoints() {
  loadingPoints.value = true;
  pointsError.value = '';
  try {
    knowledgePoints.value = await fetchKnowledgePoints(chapterId.value);
  } catch {
    knowledgePoints.value = [];
    pointsError.value = '接口待实现：fetchKnowledgePoints（GET /api/knowledge/point/list?chapterId=）';
  } finally {
    loadingPoints.value = false;
  }
}

/** 已接桩：待实现 @/api/knowledge.fetchTextbookContent（分页） */
async function loadContents() {
  loadingContents.value = true;
  contentsError.value = '';
  try {
    const page = await fetchTextbookContent({
      chapterId: chapterId.value,
      contentType: contentFilterType.value,
      keyword: contentKeyword.value.trim() || undefined,
      pageNum: contentPageNum.value,
      pageSize: contentPageSize.value,
    });
    contents.value = page?.records ?? [];
    contentTotal.value = page?.total ?? 0;
    if (activeCaseIdx.value >= contents.value.length) activeCaseIdx.value = 0;
  } catch {
    contents.value = [];
    contentTotal.value = 0;
    contentsError.value =
      '接口待实现：fetchTextbookContent（GET /api/knowledge/content/list?chapterId&contentType&keyword&pageNum&pageSize）';
  } finally {
    loadingContents.value = false;
  }
}

/** 已接桩：待实现 @/api/knowledge.fetchChapterTree */
async function loadTree() {
  loadingTree.value = true;
  treeError.value = '';
  try {
    treeNodes.value = await fetchChapterTree(courseId.value);
  } catch {
    treeNodes.value = [];
    treeError.value = '接口待实现：fetchChapterTree（GET /api/knowledge/chapter/tree?courseId=）';
  } finally {
    loadingTree.value = false;
  }
}

/** 已接桩：待实现 @/api/study.fetchProgress（按 chapterId 匹配本章） */
async function loadProgress() {
  loadingProgress.value = true;
  progressError.value = '';
  try {
    const list = await fetchProgress(courseId.value);
    serverProgress.value = (list ?? []).find((p) => p.chapterId === chapterId.value) ?? null;
  } catch {
    serverProgress.value = null;
    progressError.value = '接口待实现：fetchProgress（GET /api/study/progress/get?courseId=）';
  } finally {
    loadingProgress.value = false;
  }
}

async function loadChapter() {
  loading.value = true;
  try {
    const [detail, list] = await Promise.all([fetchChapter(chapterId.value), fetchChapters()]);
    chapter.value = detail;
    if (detail) {
      siblings.value = list
        .filter((c) => c.level === detail.level && c.parentId === detail.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    } else {
      siblings.value = [];
    }
  } catch {
    // 章节只读接口为真实请求，失败提示由 axios 响应拦截器给出
    chapter.value = null;
  } finally {
    loading.value = false;
  }
}

function reloadAll() {
  activeCaseIdx.value = 0;
  contentPageNum.value = 1;
  void loadChapter();
  void loadKnowledgePoints();
  void loadContents();
  void loadTree();
  void loadProgress();
}

/** 上报学习进度（真实写入：POST /api/study/progress/save），成功后回读进度 */
async function reportProgress(rate: number) {
  if (saving.value) return;
  saving.value = true;
  try {
    await studentStore.markProgress(chapterId.value, rate);
    ElMessage.success(rate >= 100 ? '已上报：本章学完' : rate > 0 ? '已上报：学习中' : '已上报：重置为未学');
    await loadProgress();
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    saving.value = false;
  }
}

function goChapter(delta: number) {
  const idx = siblings.value.findIndex((c) => c.id === chapterId.value);
  if (idx < 0) return;
  const target = siblings.value[idx + delta];
  if (target) router.push(`/student/learn/${target.id}`);
}

const prevDisabled = computed(() => {
  const idx = siblings.value.findIndex((c) => c.id === chapterId.value);
  return idx <= 0;
});

const nextDisabled = computed(() => {
  const idx = siblings.value.findIndex((c) => c.id === chapterId.value);
  return idx < 0 || idx >= siblings.value.length - 1;
});

function applyContentFilter() {
  contentPageNum.value = 1;
  void loadContents();
}

function goContentPage(delta: number) {
  const target = Math.min(Math.max(1, contentPageNum.value + delta), contentTotalPages.value);
  if (target === contentPageNum.value) return;
  contentPageNum.value = target;
  void loadContents();
}

onMounted(reloadAll);
watch(chapterId, reloadAll);
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

      <!-- 学习进度（已接桩：待实现 @/api/study.fetchProgress；上报走 POST /api/study/progress/save） -->
      <div class="st-card mark-card">
        <div class="st-card__body">
          <div class="mark-row">
            <span class="mark-label">本章进度</span>
            <div class="st-progress" style="flex: 1;">
              <div class="st-progress__bar" :style="{ width: displayRate + '%' }"></div>
            </div>
            <span class="mark-rate">{{ progressError ? '—' : `${displayRate}%` }}</span>
            <button class="st-text-btn" :disabled="loadingProgress" @click="loadProgress">
              <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
            </button>
          </div>
          <p v-if="progressError" class="mark-hint mark-hint--warn">{{ progressError }}</p>
          <p v-else-if="serverProgress" class="mark-hint">
            最后学习 {{ fmtTime(serverProgress.lastStudyTime) }} · 累计
            {{ Math.round((serverProgress.studyDuration ?? 0) / 60) }} 分钟 ·
            {{ serverProgress.chapterName || '本章' }}
          </p>
          <p v-else-if="loadingProgress" class="mark-hint">正在读取本章进度…</p>
          <p v-else class="mark-hint">后端无该章进度记录，上报后此处会显示学习情况</p>

          <div class="mark-row" style="margin-top: 12px;">
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
      </div>

      <!-- Tab 切换 -->
      <div class="detail-tabs">
        <button
          v-for="t in [
            { key: 'content', label: '知识点讲解', icon: ListTree },
            { key: 'cases', label: '教材原文 / 案例', icon: Code2 },
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

      <!-- 知识点讲解（已接桩：待实现 @/api/knowledge.fetchKnowledgePoints） -->
      <template v-if="activeTab === 'content'">
        <div class="section-bar">
          <span class="section-bar__hint">
            已接桩：待实现 @/api/knowledge.fetchKnowledgePoints · GET /api/knowledge/point/list?chapterId=
          </span>
          <button class="st-text-btn" :disabled="loadingPoints" @click="loadKnowledgePoints">
            <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
          </button>
        </div>

        <div v-if="loadingPoints" class="st-card">
          <div class="st-card__body st-empty" style="padding: 60px 16px;">
            <Loader2 :size="20" class="spin" />
            <div class="st-empty__text">正在加载知识点…</div>
          </div>
        </div>

        <div v-else-if="pointsError" class="st-card">
          <div class="st-card__body st-empty" style="padding: 70px 16px;">
            <ListTree :size="40" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">{{ pointsError }}</div>
          </div>
        </div>

        <div v-else-if="knowledgePoints.length === 0" class="st-card">
          <div class="st-card__body st-empty" style="padding: 70px 16px;">
            <ListTree :size="40" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">本章暂无知识点记录</div>
          </div>
        </div>

        <div v-for="kp in knowledgePoints" :key="kp.id" class="st-card kp-card">
          <div class="st-card__header">
            <h2 class="st-card__title">{{ kp.name }}</h2>
            <span class="st-badge" :class="LEVEL_BADGE[levelOf(kp.difficulty)]">
              {{ levelOf(kp.difficulty) }}
            </span>
            <span v-if="kp.pageRef" class="st-badge st-badge--neutral">{{ kp.pageRef }}</span>
          </div>
          <div class="st-card__body">
            <p class="kp-content">{{ kp.description || '后端未填写该知识点描述' }}</p>
            <div v-if="kp.keyword" class="kp-pitfall">
              <CircleAlert :size="14" class="kp-pitfall__icon" />
              <div>
                <div class="kp-pitfall__label">关键词</div>
                <div class="kp-pitfall__text">{{ kp.keyword }}</div>
              </div>
            </div>
            <div class="kp-actions">
              <button class="st-btn st-btn--secondary" @click="activeTab = 'cases'">
                <Play :size="13" /> 查看配套案例
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- 教材原文 / 案例（已接桩：待实现 @/api/knowledge.fetchTextbookContent） -->
      <template v-else-if="activeTab === 'cases'">
        <div class="st-card">
          <div class="st-card__header" style="flex-wrap: wrap;">
            <div class="case-filter">
              <el-select
                v-model="contentFilterType"
                placeholder="全部类型"
                clearable
                size="small"
                style="width: 130px;"
                @change="applyContentFilter"
              >
                <el-option v-for="t in CONTENT_TYPES" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
              <input
                v-model="contentKeyword"
                class="case-search"
                placeholder="按关键词过滤原文"
                @keydown.enter="applyContentFilter"
              />
              <button class="st-text-btn" :disabled="loadingContents" @click="applyContentFilter">
                查询
              </button>
              <button class="st-text-btn" :disabled="loadingContents" @click="loadContents">
                <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
              </button>
            </div>
            <div v-if="caseCodes.length" class="case-chips">
              <button
                v-for="(c, i) in caseCodes"
                :key="c.id"
                class="case-chip"
                :class="{ 'case-chip--active': activeCaseIdx === i }"
                @click="activeCaseIdx = i"
              >
                {{ c.contentTypeName || `#${c.id}` }}
              </button>
            </div>
          </div>

          <div class="st-card__body">
            <div v-if="loadingContents" class="st-empty" style="padding: 60px 16px;">
              <Loader2 :size="20" class="spin" />
              <div class="st-empty__text">正在加载教材原文…</div>
            </div>

            <div v-else-if="contentsError" class="st-empty" style="padding: 70px 16px;">
              <Code2 :size="40" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">{{ contentsError }}</div>
            </div>

            <div v-else-if="caseCodes.length === 0" class="st-empty" style="padding: 70px 16px;">
              <Code2 :size="40" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">本章暂无教材原文 / 案例记录</div>
            </div>

            <div v-else-if="activeCase">
              <p class="case-desc">
                {{ activeCase.contentTypeName || '原文' }}
                <template v-if="activeCase.knowledgePointName"> · {{ activeCase.knowledgePointName }}</template>
                <template v-if="activeCase.page"> · 第 {{ activeCase.page }} 页</template>
              </p>
              <div v-if="activeCase.contentType === 3" class="case-code-box st-code">
                <pre v-html="highlightJava(activeCase.content)"></pre>
              </div>
              <p v-else class="kp-content" style="white-space: pre-wrap;">{{ activeCase.content }}</p>
              <div class="kp-actions">
                <button
                  class="st-btn st-btn--primary"
                  @click="router.push({ path: '/student/code', query: { chapterId: chapter.id, caseId: activeCase.id } })"
                >
                  <Play :size="14" /> 在代码实操中运行
                </button>
              </div>
            </div>

            <div class="pager">
              <span class="pager__total">
                共 {{ contentTotal }} 条 · 第 {{ contentPageNum }} / {{ contentTotalPages }} 页
              </span>
              <div class="pager__ctrl">
                <button class="st-btn st-btn--secondary" :disabled="contentPageNum <= 1" @click="goContentPage(-1)">
                  上一页
                </button>
                <button
                  class="st-btn st-btn--secondary"
                  :disabled="contentPageNum >= contentTotalPages"
                  @click="goContentPage(1)"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 章节结构（已接桩：待实现 @/api/knowledge.fetchChapterTree） -->
      <template v-else-if="activeTab === 'tree'">
        <div class="st-card">
          <div class="st-card__header">
            <h2 class="st-card__title">本章小节</h2>
            <p class="st-card__hint">
              已接桩：待实现 @/api/knowledge.fetchChapterTree · GET /api/knowledge/chapter/tree?courseId=
            </p>
            <button class="st-text-btn tree-reload" :disabled="loadingTree" @click="loadTree">
              <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
            </button>
          </div>
          <div class="st-card__body" style="padding-top: 12px;">
            <div v-if="loadingTree" class="st-empty" style="padding: 44px 16px;">
              <Loader2 :size="20" class="spin" />
              <div class="st-empty__text">正在加载章节树…</div>
            </div>
            <div v-else-if="treeError" class="st-empty" style="padding: 44px 16px;">
              <GitBranch :size="40" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">{{ treeError }}</div>
            </div>
            <div v-else-if="childNodes.length === 0" class="st-empty" style="padding: 44px 16px;">
              <GitBranch :size="40" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">章节树中没有本章的子节记录</div>
            </div>

            <template v-else>
              <div v-for="child in childNodes" :key="child.id" class="tree-node">
                <ChevronRight :size="14" class="tree-node__icon" />
                <div class="tree-node__main">
                  <div class="tree-node__title">{{ child.chapterCode }} {{ child.title }}</div>
                  <div class="tree-node__desc">
                    {{ (child.children ?? []).length ? `含 ${child.children.length} 个小节` : '无下级小节' }}
                  </div>
                </div>
                <button class="st-text-btn" @click="router.push(`/student/learn/${child.id}`)">进入小节 →</button>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- 重难点总结（由 @/api/knowledge.fetchKnowledgePoints 的难度码值归纳） -->
      <template v-else>
        <div class="st-card">
          <div class="st-card__header">
            <h2 class="st-card__title">本章重难点总结</h2>
            <p class="st-card__hint">取 difficulty ≥ 4 的知识点，数据源同知识点列表接口</p>
          </div>
          <div class="st-card__body">
            <p v-if="keyPointSummary" class="kp-content" style="white-space: pre-wrap;">{{ keyPointSummary }}</p>
            <div v-else class="st-empty" style="padding: 24px 0;">
              <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">
                {{ pointsError ? pointsError : '本章暂无难度 ≥ 4 的知识点记录' }}
              </div>
            </div>

            <div v-if="knowledgePoints.length" class="summary-quick">
              <div class="summary-quick__label">本章知识点速览</div>
              <div class="summary-quick__list">
                <span
                  v-for="kp in knowledgePoints"
                  :key="kp.id"
                  class="st-badge"
                  :class="LEVEL_BADGE[levelOf(kp.difficulty)]"
                >
                  {{ kp.name }} · {{ levelOf(kp.difficulty) }}
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
        <Loader2 v-if="loading" :size="20" class="spin" />
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
}

.mark-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.mark-rate {
  font-size: 12.5px;
  color: var(--text-primary);
  min-width: 42px;
  text-align: right;
}

.mark-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.mark-hint--warn {
  color: var(--status-warning);
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

/* 分区提示条 */
.section-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.section-bar__hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', Consolas, monospace;
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

/* 教材原文 / 案例 */
.case-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-right: auto;
}

.case-search {
  height: 30px;
  width: 170px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 10px;
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.case-search:focus {
  border-color: var(--border-strong);
}

.case-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0 0;
  flex-basis: 100%;
}

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

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.pager__total {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.pager__ctrl {
  display: flex;
  gap: 10px;
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

.tree-reload {
  margin-left: auto;
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

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
