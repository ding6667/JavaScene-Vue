<script setup lang="ts">
/**
 * 分层刷题练习
 *
 * 数据源：
 * - GET  /api/exam/question/practice/list      题目列表（不含答案）
 * - GET  /api/exam/question/practice/detail/{id}  单题详情与示例用例
 * - POST /api/study/practice/draft             草稿（接口幂等，本页做 1s 节流合并连续输入）
 * - POST /api/study/practice/submit            正式提交（判题 + 调调试智能体 + 写运行记录）
 * - GET  /api/knowledge/chapter/list           章节下拉
 *
 * 说明：
 * 1. 题型 / 难度后端只下发码值（数字），中文标签在本页映射表内维护，与教师端题库页口径一致，
 *    码值语义待与后端确认；practiceMode（练习模式）同为码值，默认 1。
 * 2. 错题本由后端在判错时自动写入（practice/submit 的副作用），前端只做提示，不重复上报。
 * 3. 支持从错题本跳转：/student/practice?questionId=xxx 直接打开指定题目。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  BookMarked,
  CircleAlert,
  CircleCheck,
  CircleX,
  History,
  ListChecks,
  Loader2,
  RotateCcw,
  Save,
  Send,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import CodeEditor from '@/components/student/CodeEditor.vue';
import { fetchChapters } from '@/api/knowledge';
import { fetchPracticeDetail, fetchPracticeList } from '@/api/exam';
import { savePracticeDraft, submitPractice } from '@/api/study';
import type { Chapter } from '@/types/knowledge';
import type { PracticeQuestionDetail, PracticeQuestionItem } from '@/types/exam';
import type { PracticeSubmitResult } from '@/types/study';

/** 草稿节流窗口（毫秒）：窗口内的连续输入合并为一次 savePracticeDraft */
const DRAFT_THROTTLE_MS = 1000;

/** 题型码值 → 中文标签（码值语义待与后端确认，与教师端题库页同一份口径） */
const TYPE_LABELS: Record<number, string> = {
  1: '单选题',
  2: '多选题',
  3: '判断题',
  4: '填空题',
  5: '简答题',
  6: '编程题',
  7: '阅读程序题',
};

/** 难度码值 → 中文标签（码值语义待与后端确认） */
const DIFFICULTY_LABELS: Record<number, string> = {
  1: '入门',
  2: '简单',
  3: '中等',
  4: '较难',
  5: '困难',
};

/** 练习模式码值（practiceMode，后端未给出语义，待确认） */
const PRACTICE_MODES = [
  { value: 1, label: '章节专项' },
  { value: 2, label: '随机刷题' },
  { value: 3, label: '模拟考试' },
];

const PAGE_SIZES = [10, 20, 50];

/** 作答控件类型：由题型码值 + 下发数据（options / codeFramework）共同决定 */
type AnswerKind = 'choice' | 'text' | 'code';

const route = useRoute();
const router = useRouter();

/** 桩抛错与真实请求失败的统一文案 */
function describeError(apiPath: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return /未实现/.test(msg) ? `接口待实现：${apiPath}` : `接口调用失败：${apiPath}（${msg}）`;
}

// ==================== 筛选与列表 ====================

const chapters = ref<Chapter[]>([]);

const filters = reactive({
  chapterId: 0,
  type: 0,
  difficulty: 0,
  onlyUndone: false,
  pageNum: 1,
  pageSize: 10,
  practiceMode: 1,
});

const questions = ref<PracticeQuestionItem[]>([]);
const total = ref<number | null>(null);
const loadingList = ref(false);
const listError = ref<string | null>(null);

/** 总页数（后端未返回 total 时按当前页条数推算） */
const pageCount = computed(() => {
  const t = total.value;
  if (t === null || t <= 0) return 0;
  return Math.max(1, Math.ceil(t / filters.pageSize));
});

function typeLabel(v: number): string {
  return TYPE_LABELS[v] ?? `题型 ${v}`;
}

function difficultyLabel(v: number): string {
  return DIFFICULTY_LABELS[v] ?? `难度 ${v}`;
}

function acceptanceText(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '—';
  const n = Number(rate);
  // 后端通过率口径为 0~1，兼容直接给百分数的情况
  return `${Math.round(n <= 1 ? n * 100 : n)}%`;
}

async function loadChapters() {
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 真实接口失败，错误已由响应拦截器统一提示，章节下拉保持为空
    chapters.value = [];
  }
}

async function loadQuestions() {
  loadingList.value = true;
  listError.value = null;
  try {
    const page = await fetchPracticeList({
      chapterId: filters.chapterId || undefined,
      type: filters.type || undefined,
      difficulty: filters.difficulty || undefined,
      onlyUndone: filters.onlyUndone,
      pageNum: filters.pageNum,
      pageSize: filters.pageSize,
    });
    questions.value = Array.isArray(page?.records) ? page.records : [];
    total.value = Number(page?.total ?? questions.value.length);
  } catch (e) {
    questions.value = [];
    total.value = null;
    listError.value = describeError('@/api/exam.fetchPracticeList', e);
  } finally {
    loadingList.value = false;
  }
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

// ==================== 详情与作答 ====================

const selectedId = ref<number | null>(null);
const detail = ref<PracticeQuestionDetail | null>(null);
const loadingDetail = ref(false);
const detailError = ref<string | null>(null);

const selectedChoice = ref<string[]>([]);
const textAnswer = ref('');
const code = ref('');

/** 每题提交次数（提交时作为 attemptCount 上报） */
const attemptCounts = reactive<Record<number, number>>({});
/** 当前题目开始作答时间，用于 duration */
let answerStartedAt = Date.now();

const answerKind = computed<AnswerKind>(() => {
  const d = detail.value;
  if (!d) return 'text';
  const t = Number(d.type);
  if (Array.isArray(d.options) && d.options.length > 0) return 'choice';
  if (t === 6 || (typeof d.codeFramework === 'string' && d.codeFramework.trim() !== '')) return 'code';
  return 'text';
});

const isMultiChoice = computed(() => Number(detail.value?.type) === 2);

/** 选项展示字母（后端 options 为字符串数组，可能自带 "A." 前缀） */
function optionText(opt: string, idx: number): string {
  const raw = typeof opt === 'string' ? opt : String(opt ?? '');
  const stripped = raw.replace(/^\s*[A-Za-z]\s*[.、)．）:：]\s*/, '');
  return `${String.fromCharCode(65 + idx)}. ${stripped}`;
}

/** 作答内容：客观题存选项原文（多选用英文逗号拼接），填空题存文本，编程题存源码 */
function buildAnswerContent(): string {
  switch (answerKind.value) {
    case 'choice':
      return selectedChoice.value.join(',');
    case 'code':
      return code.value;
    default:
      return textAnswer.value;
  }
}

const answerContent = computed(() => buildAnswerContent());
const canSubmit = computed(() => !!detail.value && answerContent.value.trim() !== '' && !submitting.value);

function resetAnswerBoxes(d: PracticeQuestionDetail) {
  const last = typeof d.lastAnswer === 'string' ? d.lastAnswer : '';
  selectedChoice.value = last.includes(',') ? last.split(',').map((s) => s.trim()).filter(Boolean) : last ? [last] : [];
  textAnswer.value = answerKind.value === 'text' ? last : '';
  code.value = answerKind.value === 'code' ? last || (d.codeFramework ?? '') : '';
  answerStartedAt = Date.now();
}

async function selectQuestion(id: number) {
  // 切换题目时丢弃尚未发出的节流草稿，避免把上一题的内容写进新题
  clearDraftTimer();
  loadingDetail.value = true;
  detailError.value = null;
  detail.value = null;
  result.value = null;
  submitError.value = null;
  selectedId.value = id;
  draftState.value = 'idle';
  draftHint.value = '编辑内容后 1s 内自动保存草稿';
  try {
    const d = await fetchPracticeDetail(id);
    detail.value = d;
    resetAnswerBoxes(d);
  } catch (e) {
    detailError.value = describeError('@/api/exam.fetchPracticeDetail', e);
  } finally {
    loadingDetail.value = false;
  }
}

// ==================== 草稿（1s 节流，接口幂等） ====================

type DraftState = 'idle' | 'queued' | 'saving' | 'saved' | 'error';

const draftState = ref<DraftState>('idle');
const draftHint = ref('编辑内容后 1s 内自动保存草稿');

let draftTimer: ReturnType<typeof setTimeout> | null = null;
let draftInFlight = false;
let lastDraftAt = 0;
let lastSavedDraftContent = '';

function clearDraftTimer() {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
}

/**
 * 输入即触发：距上次保存已满 1s 立即发；未满 1s 只挂一个尾部定时器，
 * 窗口内的多次输入合并成一次请求（接口幂等，重复内容直接跳过）。
 */
function scheduleDraftSave() {
  if (!detail.value || !selectedId.value) return;
  const elapsed = Date.now() - lastDraftAt;
  if (elapsed >= DRAFT_THROTTLE_MS && !draftInFlight) {
    void flushDraft(false);
    return;
  }
  draftState.value = 'queued';
  if (draftTimer) return;
  draftTimer = setTimeout(() => {
    draftTimer = null;
    void flushDraft(false);
  }, DRAFT_THROTTLE_MS - elapsed);
}

async function flushDraft(manual: boolean) {
  const d = detail.value;
  const qid = selectedId.value;
  if (!d || !qid) return;
  if (draftInFlight) {
    if (manual) ElMessage.info('草稿保存中，请稍候');
    return;
  }
  const content = buildAnswerContent();
  if (content.trim() === '') {
    if (manual) ElMessage.warning('作答内容为空，未保存草稿');
    return;
  }
  if (content === lastSavedDraftContent && !manual) return;
  clearDraftTimer();
  draftInFlight = true;
  draftState.value = 'saving';
  try {
    await savePracticeDraft({
      questionId: qid,
      answerContent: content,
      chapterId: typeof d.chapterId === 'number' ? d.chapterId : undefined,
    });
    lastSavedDraftContent = content;
    lastDraftAt = Date.now();
    draftState.value = 'saved';
    draftHint.value = `草稿已于 ${new Date().toLocaleTimeString()} 保存（1s 节流）`;
    if (manual) ElMessage.success('草稿已保存');
  } catch (e) {
    lastDraftAt = Date.now();
    draftState.value = 'error';
    draftHint.value = describeError('@/api/study.savePracticeDraft', e);
    if (manual) ElMessage.error(draftHint.value);
  } finally {
    draftInFlight = false;
  }
}

function onAnswerChanged() {
  scheduleDraftSave();
}

/** 代码编辑器回传：先落值再进入节流窗口，保证草稿内容与提交内容一致 */
function onCodeInput(value: string) {
  code.value = value;
  scheduleDraftSave();
}

/** 文本作答回传：同上，先落值再节流保存 */
function onTextInput(e: Event) {
  textAnswer.value = (e.target as HTMLTextAreaElement).value;
  scheduleDraftSave();
}

function toggleChoice(value: string) {
  if (isMultiChoice.value) {
    const set = new Set(selectedChoice.value);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    selectedChoice.value = [...set];
  } else {
    selectedChoice.value = [value];
  }
  onAnswerChanged();
}

// ==================== 正式提交 ====================

const submitting = ref(false);
const result = ref<PracticeSubmitResult | null>(null);
const submitError = ref<string | null>(null);

const resultPassed = computed(() => Number(result.value?.isCorrect) === 1);

/** 判题状态里的错误行（供 CodeEditor 标注） */
const errorLines = computed<number[]>(() => {
  const line = Number(result.value?.errorLine);
  return Number.isFinite(line) && line > 0 ? [line] : [];
});

function casePassed(c: { passed?: number }): boolean {
  return Number(c.passed) === 1;
}

async function handleSubmit() {
  const qid = selectedId.value;
  if (!qid || !detail.value) {
    ElMessage.warning('请先在左侧选择题目');
    return;
  }
  const content = buildAnswerContent();
  if (content.trim() === '') {
    ElMessage.warning('请先作答再提交');
    return;
  }
  clearDraftTimer();
  submitting.value = true;
  submitError.value = null;
  result.value = null;
  const attemptCount = (attemptCounts[qid] ?? 0) + 1;
  try {
    const r = await submitPractice({
      questionId: qid,
      answerContent: content,
      duration: Math.max(0, Math.round((Date.now() - answerStartedAt) / 1000)),
      attemptCount,
      practiceMode: filters.practiceMode,
    });
    result.value = r;
    attemptCounts[qid] = attemptCount;
    lastSavedDraftContent = content;
    if (Number(r.isCorrect) === 1) {
      ElMessage.success(`判题通过，得分 ${r.score ?? 0}`);
    } else {
      ElMessage.warning('本题判错，已由后端计入错题本');
    }
  } catch (e) {
    attemptCounts[qid] = attemptCount;
    submitError.value = describeError('@/api/study.submitPractice', e);
    ElMessage.error(submitError.value);
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const paramChapter = Number(route.params.chapterId);
  if (Number.isFinite(paramChapter) && paramChapter > 0) filters.chapterId = paramChapter;
  await loadChapters();
  await loadQuestions();

  const queryQuestion = Number(route.query.questionId);
  if (Number.isFinite(queryQuestion) && queryQuestion > 0) void selectQuestion(queryQuestion);
});

onBeforeUnmount(() => {
  clearDraftTimer();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">分层刷题练习</h1>
      <p class="st-page-subtitle">同步教材课后习题 · 题型 / 难度按码值筛选 · 答错自动收录错题本</p>
    </header>

    <!-- ==================== 筛选 ==================== -->
    <div class="st-card filter-card">
      <div class="st-card__body">
        <div class="filter-grid">
          <div class="filter-item">
            <label class="filter-label">章节（chapterId）</label>
            <el-select v-model="filters.chapterId" style="width: 100%;" @change="applyFilters">
              <el-option label="全部章节" :value="0" />
              <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode} ${c.title}`" :value="c.id" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label">题型（type 码值）</label>
            <el-select v-model="filters.type" style="width: 100%;" @change="applyFilters">
              <el-option label="全部题型" :value="0" />
              <el-option v-for="(label, key) in TYPE_LABELS" :key="key" :label="`${key} · ${label}`" :value="Number(key)" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label">难度（difficulty 码值）</label>
            <el-select v-model="filters.difficulty" style="width: 100%;" @change="applyFilters">
              <el-option label="全部难度" :value="0" />
              <el-option v-for="(label, key) in DIFFICULTY_LABELS" :key="key" :label="`${key} · ${label}`" :value="Number(key)" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label">练习模式（practiceMode 码值，仅随提交上报）</label>
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
            <label class="filter-label">每页条数（pageSize）</label>
            <el-select v-model="filters.pageSize" style="width: 100%;" @change="applyFilters">
              <el-option v-for="s in PAGE_SIZES" :key="s" :label="`${s} 条/页`" :value="s" />
            </el-select>
          </div>
          <div class="filter-item filter-item--switch">
            <label class="filter-label">仅刷未做（onlyUndone）</label>
            <el-switch v-model="filters.onlyUndone" @change="applyFilters" />
          </div>
        </div>

        <p class="code-value-note">
          题型 / 难度 / 练习模式后端只下发码值（数字），本页标签映射表与教师端题库页一致，码值语义待与后端确认。
        </p>

        <div class="filter-actions">
          <button class="st-btn st-btn--secondary" :disabled="loadingList" @click="loadQuestions">
            <Loader2 v-if="loadingList" :size="14" class="spin" />
            <RotateCcw v-else :size="13" />
            重新加载列表
          </button>
        </div>
      </div>
    </div>

    <div class="practice-grid">
      <!-- ==================== 题目列表 ==================== -->
      <section class="st-card">
        <div class="st-card__header">
          <ListChecks :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">题目列表</h2>
            <p class="st-card__hint">已接桩：待实现 @/api/exam.fetchPracticeList</p>
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
            <div
              v-for="(q, i) in questions"
              :key="q.id"
              class="question-item"
              :class="{ 'question-item--active': q.id === selectedId }"
              role="button"
              tabindex="0"
              @click="selectQuestion(q.id)"
              @keydown.enter="selectQuestion(q.id)"
            >
              <span class="question-no">{{ (filters.pageNum - 1) * filters.pageSize + i + 1 }}</span>
              <div class="question-item__main">
                <div class="question-item__content">{{ q.content || '—' }}</div>
                <div class="question-item__badges">
                  <span class="st-badge st-badge--outline">{{ typeLabel(q.type) }}</span>
                  <span class="st-badge st-badge--neutral">{{ difficultyLabel(q.difficulty) }}</span>
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
            </div>
          </div>

          <div v-if="!loadingList && pageCount > 0" class="pager">
            <button class="st-text-btn" :disabled="filters.pageNum <= 1" @click="goPage(filters.pageNum - 1)">上一页</button>
            <span class="pager__info">第 {{ filters.pageNum }} / {{ pageCount }} 页</span>
            <button class="st-text-btn" :disabled="filters.pageNum >= pageCount" @click="goPage(filters.pageNum + 1)">下一页</button>
          </div>
        </div>
      </section>

      <!-- ==================== 详情 + 作答 ==================== -->
      <section class="st-card">
        <div class="st-card__header">
          <BookMarked :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">题目与作答</h2>
            <p class="st-card__hint">已接桩：待实现 @/api/exam.fetchPracticeDetail</p>
          </div>
          <button
            v-if="detail"
            class="st-text-btn"
            style="margin-left: auto;"
            @click="router.push({ path: '/student/wrong' })"
          >
            <History :size="12" style="margin-right: 2px;" /> 错题本
          </button>
        </div>
        <div class="st-card__body">
          <div v-if="loadingDetail" class="st-empty">
            <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
            <div class="st-empty__text">题目详情加载中…</div>
          </div>
          <div v-else-if="detailError" class="st-empty">
            <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">{{ detailError }}</div>
            <button class="st-btn st-btn--secondary" :disabled="!selectedId" @click="selectedId && selectQuestion(selectedId)">
              重新加载
            </button>
          </div>
          <div v-else-if="!detail" class="st-empty">
            <BookMarked :size="34" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">请先在左侧列表选择题目</div>
          </div>

          <template v-else>
            <!-- 题干 -->
            <div class="question-stem">
              <span class="question-no question-no--lg">{{ detail.id }}</span>
              <div>
                <div class="question-stem__text">{{ detail.content || '—' }}</div>
                <div class="question-item__badges" style="margin-top: 10px;">
                  <span class="st-badge st-badge--outline">{{ typeLabel(detail.type) }}</span>
                  <span class="st-badge st-badge--neutral">{{ difficultyLabel(detail.difficulty) }}</span>
                  <span class="st-badge st-badge--neutral">{{ detail.score ?? '—' }} 分</span>
                  <span class="st-badge st-badge--neutral">通过率 {{ acceptanceText(detail.acceptanceRate) }}</span>
                  <span class="st-badge" :class="detail.done ? 'st-badge--info' : 'st-badge--neutral'">
                    {{ detail.done ? '已做过' : '未做' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 作答要求 -->
            <div v-if="detail.requirements?.length" class="req-box">
              <div class="block-head">作答要求</div>
              <ol class="req-list">
                <li v-for="(r, i) in detail.requirements" :key="i">{{ r }}</li>
              </ol>
            </div>

            <!-- 示例用例 -->
            <div v-if="detail.sampleTestCases?.length" class="case-box">
              <div class="block-head">示例用例</div>
              <div v-for="(c, i) in detail.sampleTestCases" :key="i" class="case-item">
                <div class="case-item__desc">{{ c.description || `用例 ${i + 1}` }}</div>
                <div class="case-item__row st-code">
                  <span class="case-item__label">输入</span>
                  <pre>{{ c.input || '—' }}</pre>
                </div>
                <div class="case-item__row st-code">
                  <span class="case-item__label">期望输出</span>
                  <pre>{{ c.expectedOutput || '—' }}</pre>
                </div>
              </div>
            </div>

            <p v-if="detail.lastAnswer" class="last-answer">
              上次作答：{{ detail.lastAnswer.slice(0, 120) }}{{ detail.lastAnswer.length > 120 ? '…' : '' }}
            </p>

            <!-- 作答区：客观题 -->
            <div v-if="answerKind === 'choice'" class="answer-zone">
              <div class="block-head">
                选择答案
                <span v-if="isMultiChoice" class="zone-tip">多选，以英文逗号拼接提交</span>
                <span v-else class="zone-tip">单选</span>
              </div>
              <div class="options">
                <button
                  v-for="(opt, i) in detail.options"
                  :key="i"
                  class="option-item"
                  :class="{ 'option-item--selected': selectedChoice.includes(opt) }"
                  @click="toggleChoice(opt)"
                >
                  {{ optionText(opt, i) }}
                </button>
              </div>
            </div>

            <!-- 作答区：填空 / 简答 / 阅读题 -->
            <div v-else-if="answerKind === 'text'" class="answer-zone">
              <div class="block-head">
                文本作答
                <span class="zone-tip">多空请按题目顺序用英文逗号分隔（口径待与后端确认）</span>
              </div>
              <textarea
                :value="textAnswer"
                class="text-answer__input"
                rows="6"
                placeholder="输入你的答案…"
                @input="onTextInput"
              ></textarea>
            </div>

            <!-- 作答区：编程题 -->
            <div v-else class="answer-zone">
              <div class="block-head">
                Java 代码作答
                <span class="zone-tip">
                  已用后端 codeFramework 初始化
                  <button class="st-text-btn" @click="code = detail.codeFramework || ''">重置为框架代码</button>
                </span>
              </div>
              <CodeEditor :model-value="code" :error-lines="errorLines" height="420px" @update:model-value="onCodeInput" />
            </div>

            <!-- 草稿 + 提交 -->
            <div class="draft-row">
              <span class="draft-hint" :class="{ 'draft-hint--error': draftState === 'error' }">
                <span class="st-badge" :class="draftState === 'error' ? 'st-badge--danger' : 'st-badge--neutral'">
                  {{ draftState === 'saving' ? '草稿保存中' : draftState === 'queued' ? '待保存（1s 节流）' : draftState === 'saved' ? '草稿已保存' : draftState === 'error' ? '草稿失败' : '草稿未开始' }}
                </span>
                {{ draftHint }}
              </span>
              <button class="st-btn st-btn--secondary" :disabled="!detail || draftState === 'saving'" @click="flushDraft(true)">
                <Save :size="13" /> 立即保存草稿
              </button>
              <button class="st-btn st-btn--primary" :disabled="!canSubmit" @click="handleSubmit">
                <Loader2 v-if="submitting" :size="14" class="spin" />
                <Send v-else :size="13" />
                {{ submitting ? '提交中…' : '提交作答' }}
              </button>
            </div>
            <p class="attempt-tip">
              本题本会话已提交 {{ attemptCounts[detail.id] ?? 0 }} 次 · 提交耗时按当前题目打开后的实际秒数上报
            </p>

            <!-- 提交结果 -->
            <div v-if="submitError" class="result-error-card">
              <div class="block-head"><CircleAlert :size="14" /> 提交结果</div>
              <p class="result-error-text">{{ submitError }}</p>
              <button class="st-btn st-btn--secondary" @click="handleSubmit">重新提交</button>
            </div>

            <div v-else-if="result" class="analysis-box">
              <div class="analysis-verdict" :class="resultPassed ? 'analysis-verdict--ok' : 'analysis-verdict--bad'">
                <CircleCheck v-if="resultPassed" :size="16" />
                <CircleX v-else :size="16" />
                {{ resultPassed ? '判题通过' : '判为错题' }}
                <span class="st-badge st-badge--outline">{{ result.score ?? 0 }} 分</span>
                <span class="st-badge st-badge--neutral">
                  用例 {{ result.passedCount ?? 0 }} / {{ result.totalCount ?? 0 }}
                </span>
                <span v-if="!resultPassed" class="wrongbook-tip">已计入错题本（后端记录，可在错题本复盘）</span>
              </div>

              <div v-if="result.output" class="detail-block">
                <div class="block-head">运行输出</div>
                <pre class="code-panel st-code">{{ result.output }}</pre>
              </div>

              <div v-if="result.errorMsg" class="detail-block">
                <div class="block-head"><CircleX :size="14" /> 错误信息<template v-if="result.errorLine"> · 第 {{ result.errorLine }} 行</template></div>
                <pre class="code-panel code-panel--error st-code">{{ result.errorMsg }}</pre>
                <p v-if="result.errorReason" class="detail-text">{{ result.errorReason }}</p>
              </div>

              <!-- 逐用例通过情况 -->
              <div v-if="result.caseResults?.length" class="detail-block">
                <div class="block-head">逐用例通过情况</div>
                <table class="case-table">
                  <thead>
                    <tr>
                      <th class="col-idx">用例</th>
                      <th class="col-res">结果</th>
                      <th>输入</th>
                      <th>期望输出</th>
                      <th>实际输出</th>
                      <th>错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(c, i) in result.caseResults" :key="c.caseIndex ?? i">
                      <td class="cell-mono">{{ c.caseIndex ?? i + 1 }}</td>
                      <td>
                        <span class="st-badge" :class="casePassed(c) ? 'st-badge--success' : 'st-badge--danger'">
                          {{ casePassed(c) ? '通过' : '未通过' }}
                        </span>
                      </td>
                      <td class="cell-code st-code">{{ c.input || '—' }}</td>
                      <td class="cell-code st-code">{{ c.expectedOutput || '—' }}</td>
                      <td class="cell-code st-code">{{ c.actualOutput || '—' }}</td>
                      <td class="cell-code">{{ c.errorMsg || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-if="result.knowledgePoints?.length" class="kp-row">
                <span v-for="kp in result.knowledgePoints" :key="kp" class="st-badge st-badge--neutral">{{ kp }}</span>
              </div>

              <div v-if="result.optimizeSuggest" class="detail-block">
                <div class="block-head">优化建议</div>
                <p class="detail-text">{{ result.optimizeSuggest }}</p>
              </div>

              <div v-if="result.standardIdea" class="detail-block">
                <div class="block-head">参考思路</div>
                <p class="detail-text">{{ result.standardIdea }}</p>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
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

.code-value-note {
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

.practice-grid {
  display: grid;
  grid-template-columns: 1fr 1.45fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1080px) {
  .practice-grid {
    grid-template-columns: 1fr;
  }
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
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition);
}

.question-item:last-child {
  border-bottom: none;
}

.question-item--active {
  background: var(--bg-subtle);
}

.question-item__main {
  flex: 1;
  min-width: 0;
}

.question-item__content {
  font-size: 13px;
  color: var(--text-primary);
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

.question-no--lg {
  width: 34px;
  height: 34px;
  font-size: 12.5px;
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

/* 详情与作答 */
.question-stem {
  display: flex;
  gap: 14px;
}

.question-stem__text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.zone-tip {
  font-weight: 400;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.req-box,
.case-box {
  margin-top: 16px;
}

.req-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
}

.case-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 10px;
}

.case-item__desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.case-item__row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.case-item__label {
  color: var(--text-tertiary);
  font-size: 11.5px;
  min-width: 60px;
  flex-shrink: 0;
}

.case-item__row pre {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.last-answer {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}

.answer-zone {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-item {
  text-align: left;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 13.5px;
  font-family: inherit;
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition);
  line-height: 1.55;
}

.option-item:hover {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.option-item--selected {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
  font-weight: 500;
}

.text-answer__input {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 13px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.text-answer__input:focus {
  border-color: var(--border-strong);
}

.draft-row {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.draft-hint {
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.draft-hint--error {
  color: var(--status-danger);
}

.attempt-tip {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.result-error-card {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.result-error-text {
  font-size: 12.5px;
  color: var(--status-danger);
  margin: 0 0 10px;
}

/* 结果 */
.analysis-box {
  margin-top: 18px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 16px;
}

.analysis-verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  flex-wrap: wrap;
}

.analysis-verdict--ok {
  color: var(--status-success);
}

.analysis-verdict--bad {
  color: var(--status-danger);
}

.wrongbook-tip {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.detail-block {
  margin-top: 14px;
}

.code-panel {
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin: 0;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.code-panel--error {
  background: var(--status-danger-bg);
  border-color: rgba(185, 28, 28, 0.18);
  color: var(--status-danger);
}

.detail-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.case-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.case-table th {
  text-align: left;
  font-weight: 600;
  font-size: 11.5px;
  color: var(--text-tertiary);
  padding: 0 10px 8px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.case-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
}

.col-idx {
  width: 52px;
}

.col-res {
  width: 84px;
}

.cell-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.cell-code {
  word-break: break-all;
  line-height: 1.55;
}

.kp-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
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
