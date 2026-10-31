<script setup lang="ts">
/**
 * 分层刷题练习 —— 题目列表页
 *
 * 已对接：
 *   GET /api/exam/question/practice/list    刷题列表
 *   GET /api/knowledge/chapter/list         章节下拉
 *   GET /api/exam/difficulty-config/list    难度下拉（只读，403 时降级为空，不踢人）
 *
 * 作答已抽离成独立页面（PracticeSolveView）：点击题目在新标签页打开，
 * 一面放题目信息、一面放作答区，编程题在作答页里直接跑代码与智能纠错。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { CircleAlert, ExternalLink, ListChecks, Loader2, RotateCcw } from 'lucide-vue-next';
import { fetchPracticeList } from '@/api/exam';
import ChapterSelect from '@/components/ChapterSelect.vue';
import { useChapters } from '@/composables/useChapters';
import { useDifficultyConfigs } from '@/composables/useDifficultyConfigs';
import type { PracticeQuestionItem } from '@/types/exam';

/** 题型码值 → 中文标签（与后端 QuestionTypeEnum 一致） */
const TYPE_LABELS: Record<number, string> = {
  1: '选择题',
  2: '填空题',
  3: '判断题',
  4: '程序阅读题',
  5: '编程题',
  6: '简答题',
};

const PRACTICE_MODES = [
  { value: 1, label: '章节专项' },
  { value: 2, label: '随机刷题' },
  { value: 3, label: '模拟考试' },
];

const PAGE_SIZES = [10, 20, 50];

const route = useRoute();
const router = useRouter();

const difficultyStore = useDifficultyConfigs();
const difficultyOptions = difficultyStore.options;
const difficultyError = difficultyStore.error;
const difficultyText = difficultyStore.difficultyText;

function describeError(what: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return /未实现/.test(msg) ? `${what}暂未开放` : `${what}失败：${msg}`;
}

// ==================== 筛选与列表 ====================

/** 章节数据（<ChapterSelect> 也会自动加载，这里只是等它就绪再出列表，避免下拉空一帧） */
const { load: chaptersReady } = useChapters();

const filters = reactive({
  chapterId: 0,
  type: 0,
  difficultyConfigId: 0,
  onlyUndone: false,
  pageNum: 1,
  pageSize: 10,
  practiceMode: 1,
});

const questions = ref<PracticeQuestionItem[]>([]);
const total = ref<number | null>(null);
const loadingList = ref(false);
const listError = ref<string | null>(null);

const pageCount = computed(() => {
  const t = total.value;
  if (t === null || t <= 0) return 0;
  return Math.max(1, Math.ceil(t / filters.pageSize));
});

function typeLabel(v: number): string {
  return TYPE_LABELS[v] ?? `题型 ${v}`;
}

function acceptanceText(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '—';
  return `${Math.max(0, Math.min(100, Math.round(Number(rate))))}%`;
}

/** 标题口径：shortTitle 优先，为空退回题干截断 */
function questionTitle(q: PracticeQuestionItem): string {
  const short = String(q.shortTitle ?? '').trim();
  if (short) return short;
  const text = String(q.content ?? '').trim() || '—';
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

async function loadQuestions() {
  loadingList.value = true;
  listError.value = null;
  try {
    const page = await fetchPracticeList({
      chapterId: filters.chapterId || undefined,
      type: filters.type || undefined,
      difficultyConfigId: filters.difficultyConfigId || undefined,
      onlyUndone: filters.onlyUndone,
      pageNum: filters.pageNum,
      pageSize: filters.pageSize,
    });
    questions.value = Array.isArray(page?.records) ? page.records.map(normalizePracticeItem) : [];
    total.value = Number(page?.total ?? questions.value.length);
  } catch (e) {
    questions.value = [];
    total.value = null;
    listError.value = describeError('练习列表加载', e);
  } finally {
    loadingList.value = false;
  }
}

/**
 * 列表项兜底：个别后端版本把主键叫 questionId。
 * 主键为空时整行链接就没法生成，表现成「点了没反应」，这里先补齐。
 */
function normalizePracticeItem(raw: PracticeQuestionItem): PracticeQuestionItem {
  const src = raw as PracticeQuestionItem & { questionId?: number | string | null };
  if (!src.id && src.questionId) {
    return { ...raw, id: src.questionId as number };
  }
  return raw;
}

function applyFilters() {
  filters.pageNum = 1;
  void loadQuestions();
}

function goPage(next: number) {
  const max = pageCount.value || 1;
  if (next < 1 || next > max || next === filters.pageNum) return;
  filters.pageNum = next;
  void loadQuestions();
}

// ==================== 打开作答页（新标签） ====================

/**
 * 作答页链接。
 *
 * id 可能是 number，也可能是后端把 Long 序列化成字符串后的 "1943..."：
 * 统一按字符串原样透传，不做 Number.isFinite 之类的数值校验——
 * 字符串 id 一旦被数值校验判成非法，点击就会静默无反应。
 */
function solveHref(id: number | string | null | undefined): string {
  const raw = String(id ?? '').trim();
  if (!raw) return '';
  try {
    return router.resolve({
      name: 'StudentPracticeSolve',
      params: { questionId: raw },
      query: { practiceMode: String(filters.practiceMode) },
    }).href;
  } catch {
    // 路由表异常时的手工兜底，保证入口始终可用
    return `/student/practice/solve/${encodeURIComponent(raw)}?practiceMode=${filters.practiceMode}`;
  }
}

/**
 * 行点击兜底：正常情况下 <a target="_blank"> 自己完成跳转，这里不拦截；
 * 只有生成不出链接（题目编号缺失）时才拦下并给一句人话，避免「点了没反应」。
 */
function onItemClick(event: MouseEvent, id: number | string | null | undefined) {
  if (solveHref(id)) return;
  event.preventDefault();
  ElMessage.warning('该题目缺少编号，暂时无法打开作答页');
}

onMounted(async () => {
  const paramChapter = Number(route.params.chapterId);
  if (Number.isFinite(paramChapter) && paramChapter > 0) filters.chapterId = paramChapter;
  difficultyStore.load();
  await chaptersReady();
  await loadQuestions();

  // 兼容旧链接（如从错题本带到 /student/practice?questionId=5）：直接替换到作答页。
  // 这里不能用 window.open——onMounted 已脱离用户手势，新标签会被浏览器拦掉，看着像没反应。
  const queryQuestion = String(route.query.questionId ?? '').trim();
  if (queryQuestion) {
    const href = solveHref(queryQuestion);
    if (href) {
      void router.replace(href);
      return;
    }
  }
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">自由刷题</h1>
      <p class="st-page-subtitle">你可以自由选择刷题</p>
    </header>

    <!-- ==================== 筛选 ==================== -->
    <div class="st-card filter-card">
      <div class="st-card__body">
        <div class="filter-grid">
          <div class="filter-item">
            <label class="filter-label">章节</label>
            <ChapterSelect v-model="filters.chapterId" allow-all style="width: 100%;" @change="applyFilters" />
          </div>
          <div class="filter-item">
            <label class="filter-label">题型</label>
            <el-select v-model="filters.type" style="width: 100%;" @change="applyFilters">
              <el-option label="全部题型" :value="0" />
              <el-option v-for="(label, key) in TYPE_LABELS" :key="key" :label="`${key} · ${label}`" :value="Number(key)" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label">难度</label>
            <el-select
              v-model="filters.difficultyConfigId"
              style="width: 100%;"
              :disabled="!difficultyOptions.length"
              @change="applyFilters"
            >
              <el-option label="全部难度" :value="0" />
              <el-option v-for="d in difficultyOptions" :key="d.value" :label="d.label" :value="d.value" />
            </el-select>
            <!-- 难度档位来自后端配置表，学生端只读；拿不到时不阻塞刷题，按章节/题型筛选照样可用 -->
            <p v-if="difficultyError && !difficultyOptions.length" class="filter-note">
              难度筛选项暂不可用
            </p>
          </div>
          <div class="filter-item">
            <label class="filter-label">练习模式</label>
            <div class="st-seg">
              <div
                class="st-seg__slider"
                :style="{
                  left: `calc(${Math.max(0, PRACTICE_MODES.findIndex((m) => m.value === filters.practiceMode))} * 33.333% + 3px)`,
                  width: 'calc(33.333% - 4px)',
                }"
              ></div>
              <button
                v-for="m in PRACTICE_MODES"
                :key="m.value"
                class="st-seg__option"
                :style="{ flex: 1 }"
                :class="{ 'st-seg__option--active': filters.practiceMode === m.value }"
                @click="filters.practiceMode = m.value"
              >
                {{ m.label }}
              </button>
            </div>
          </div>
          <div class="filter-item">
            <label class="filter-label">每页条数</label>
            <el-select v-model="filters.pageSize" style="width: 100%;" @change="applyFilters">
              <el-option v-for="s in PAGE_SIZES" :key="s" :label="`${s} 条/页`" :value="s" />
            </el-select>
          </div>
          <div class="filter-item filter-item--switch">
            <label class="filter-label">仅刷未做</label>
            <el-switch v-model="filters.onlyUndone" @change="applyFilters" />
          </div>
        </div>

        <div class="filter-actions">
          <button class="st-btn st-btn--secondary" :disabled="loadingList" @click="loadQuestions">
            <Loader2 v-if="loadingList" :size="14" class="spin" />
            <RotateCcw v-else :size="13" />
            重新加载列表
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== 题目列表 ==================== -->
    <section class="st-card">
      <div class="st-card__header">
        <ListChecks :size="15" class="card-icon" />
        <div>
          <h2 class="st-card__title">题目列表</h2>
        </div>
        <span class="list-count">共 {{ total === null ? '—' : total }} 题</span>
      </div>
      <div class="st-card__body" style="padding-top: 12px;">
        <div v-if="loadingList" class="st-empty">
          <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
          <div class="st-empty__text">列表加载中…</div>
        </div>
        <div v-else-if="listError" class="st-empty">
          <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">{{ listError }}</div>
          <button class="st-btn st-btn--secondary" @click="loadQuestions">重新加载</button>
        </div>
        <div v-else-if="questions.length === 0" class="st-empty">
          <ListChecks :size="32" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">该筛选条件下暂无题目</div>
          <button class="st-btn st-btn--secondary" @click="loadQuestions">重新加载</button>
        </div>

        <div v-else class="question-list">
          <!-- 每行是原生链接：点击/中键/右键新标签都由浏览器处理，不会被弹窗拦截吃掉 -->
          <a
            v-for="(q, i) in questions"
            :key="q.id"
            class="question-item"
            :href="solveHref(q.id)"
            target="_blank"
            rel="noopener noreferrer"
            :title="`在新标签页作答：${questionTitle(q)}`"
            @click="onItemClick($event, q.id)"
          >
            <span class="question-no">{{ (filters.pageNum - 1) * filters.pageSize + i + 1 }}</span>
            <div class="question-item__main">
              <div class="question-item__title">
                {{ questionTitle(q) }}
                <ExternalLink :size="12" class="open-icon" />
              </div>
              <div v-if="q.shortTitle" class="question-item__content">{{ q.content || '—' }}</div>
              <div class="question-item__badges">
                <span class="st-badge st-badge--outline">{{ typeLabel(q.type) }}</span>
                <span class="st-badge st-badge--neutral">{{ difficultyText(q) }}</span>
                <span class="st-badge st-badge--neutral">{{ q.score ?? '—' }} 分</span>
                <span class="st-badge" :class="q.done ? 'st-badge--info' : 'st-badge--neutral'">
                  {{ q.done ? '已做过' : '未做' }}
                </span>
              </div>
            </div>
            <div class="question-item__rate">
              <span>通过率 {{ acceptanceText(q.acceptanceRate) }}</span>
              <span>提交 {{ q.submitCount ?? 0 }} 次</span>
            </div>
          </a>
        </div>

        <div v-if="!loadingList && pageCount > 0" class="pager">
          <button class="st-text-btn" :disabled="filters.pageNum <= 1" @click="goPage(filters.pageNum - 1)">上一页</button>
          <span class="pager__info">第 {{ filters.pageNum }} / {{ pageCount }} 页</span>
          <button class="st-text-btn" :disabled="filters.pageNum >= pageCount" @click="goPage(filters.pageNum + 1)">下一页</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 20px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 900px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}

.filter-item--switch {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.filter-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.list-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}

.filter-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.list-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* 列表 */
.question-list {
  display: flex;
  flex-direction: column;
}

.question-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  /* 行是 <a>：清掉浏览器默认的下划线与链接色，外观与卡片一致 */
  color: inherit;
  text-decoration: none;
  transition: background var(--transition);
}

.question-item:focus-visible {
  outline: 2px solid var(--border-strong);
  outline-offset: -2px;
}

.question-item:last-child {
  border-bottom: none;
}

.question-item:hover {
  background: var(--bg-subtle);
}

.question-item__main {
  flex: 1;
  min-width: 0;
}

.question-item__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.6;
}

.open-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition);
}

.question-item:hover .open-icon {
  opacity: 1;
}

.question-item__content {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.question-item__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.question-item__rate {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.question-no {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--text-primary);
  color: var(--bg-surface);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.pager__info {
  font-size: 12px;
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
