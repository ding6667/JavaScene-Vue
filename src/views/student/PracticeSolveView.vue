<script setup lang="ts">
/**
 * 题目作答页（独立页面，从刷题列表新窗口打开）
 *
 * 布局：挂在 StandaloneLayout 下（无侧边栏），本页只负责「左题目信息 + 右作答区」这层栅格。
 * 作答控件本身由 <AnswerArea> 统一渲染（与作业作答页共用一份实现）。
 *
 * 已对接：
 *   GET  /api/exam/question/practice/detail/{id}   题目详情（不含答案）
 *   POST /api/study/practice/draft                 草稿（1s 节流，幂等）
 *   POST /api/study/practice/submit                正式提交判题
 *
 * 渲染与提交口径见 <AnswerArea>：选择题提交字母、填空题用 "|" 拼接、判断题 true/false、
 * 程序阅读/简答原文、编程题源码。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  CircleX,
  ListTree,
  Loader2,
  Save,
  Send,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import AnswerArea from '@/components/student/AnswerArea.vue';
import { fetchPracticeDetail } from '@/api/exam';
import { savePracticeDraft, submitPractice } from '@/api/study';
import { useDifficultyConfigs } from '@/composables/useDifficultyConfigs';
import type { AnswerAreaQuestion, PracticeQuestionDetail } from '@/types/exam';
import type { PracticeSubmitResult } from '@/types/study';

const props = defineProps<{ questionId: string }>();

const router = useRouter();
const route = useRoute();
/** 练习模式由列表页透传，缺省按「章节专项」 */
const practiceMode = computed(() => Number(route.query.practiceMode) || 1);
const difficultyStore = useDifficultyConfigs();
const difficultyText = difficultyStore.difficultyText;

/**
 * 返回列表。
 *
 * 列表页用 <a target="_blank" rel="noopener"> 打开本科，opener 是被主动切断的，
 * 所以不能再靠 window.opener 判断「是不是新标签」——统一先试 window.close()，
 * 关不掉（直接输网址进来、或被浏览器拒绝）再退回列表页。
 */
function goBack() {
  window.close();
  // 关闭成功的页面不会跑到这里；走到这里说明窗口还在，退回列表
  window.setTimeout(() => {
    void router.push('/student/practice');
  }, 120);
}

/** 草稿节流窗口（毫秒）：窗口内连续输入合并成一次请求 */
const DRAFT_THROTTLE_MS = 1000;

const TYPE_LABELS: Record<number, string> = {
  1: '选择题',
  2: '填空题',
  3: '判断题',
  4: '程序阅读题',
  5: '编程题',
  6: '简答题',
};

const qid = computed(() => Number(props.questionId));

const detail = ref<PracticeQuestionDetail | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

/** 规范答案串：由 <AnswerArea> 维护，本页只负责存草稿 / 提交 */
const answerContent = ref('');

const answerQuestion = computed<AnswerAreaQuestion>(() => {
  const d = detail.value;
  if (!d) return { id: 0, type: 0, content: '' };
  return {
    id: Number(d.id),
    type: Number(d.type),
    content: d.content,
    options: Array.isArray(d.options) ? d.options.map((o) => String(o ?? '')) : [],
    renderConfig: d.renderConfig ?? null,
    codeFramework: d.codeFramework ?? '',
  };
});

const typeLabel = computed(() => TYPE_LABELS[Number(detail.value?.type)] ?? '题目');
const title = computed(() => detail.value?.shortTitle?.trim() || `题目 ${qid.value}`);
const acceptanceText = computed(() => {
  const rate = detail.value?.acceptanceRate;
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '—';
  return `${Math.max(0, Math.min(100, Math.round(Number(rate))))}%`;
});

// ==================== 草稿（1s 节流） ====================
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

function scheduleDraftSave() {
  if (!detail.value) return;
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
  if (!d) return;
  if (draftInFlight) {
    if (manual) ElMessage.info('草稿保存中，请稍候');
    return;
  }
  const content = answerContent.value;
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
      questionId: qid.value,
      answerContent: content,
      chapterId: typeof d.chapterId === 'number' ? d.chapterId : undefined,
    });
    lastSavedDraftContent = content;
    lastDraftAt = Date.now();
    draftState.value = 'saved';
    draftHint.value = `草稿已于 ${new Date().toLocaleTimeString()} 保存`;
    if (manual) ElMessage.success('草稿已保存');
  } catch (e) {
    lastDraftAt = Date.now();
    draftState.value = 'error';
    draftHint.value = `草稿保存失败：${(e as Error)?.message ?? '未知错误'}`;
    if (manual) ElMessage.error(draftHint.value);
  } finally {
    draftInFlight = false;
  }
}

// ==================== 提交 ====================
const submitting = ref(false);
const result = ref<PracticeSubmitResult | null>(null);
const submitError = ref<string | null>(null);
const attemptCount = ref(0);
let startedAt = Date.now();

const resultPassed = computed(() => Number(result.value?.isCorrect) === 1);
const canSubmit = computed(
  () => !!detail.value && answerContent.value.trim() !== '' && !submitting.value,
);

function casePassed(c: { passed?: number }): boolean {
  return Number(c.passed) === 1;
}

async function handleSubmit() {
  if (!detail.value) return;
  const content = answerContent.value;
  if (content.trim() === '') {
    ElMessage.warning('请先作答再提交');
    return;
  }
  clearDraftTimer();
  submitting.value = true;
  submitError.value = null;
  result.value = null;
  const nextAttempt = attemptCount.value + 1;
  try {
    const r = await submitPractice({
      questionId: qid.value,
      answerContent: content,
      duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      attemptCount: nextAttempt,
      practiceMode: practiceMode.value,
    });
    result.value = r;
    attemptCount.value = nextAttempt;
    lastSavedDraftContent = content;
    if (Number(r.isCorrect) === 1) ElMessage.success(`判题通过，得分 ${r.score ?? 0}`);
    else ElMessage.warning('本题判错，已记入错题本');
  } catch (e) {
    attemptCount.value = nextAttempt;
    submitError.value = `提交失败：${(e as Error)?.message ?? '未知错误'}`;
    ElMessage.error(submitError.value);
  } finally {
    submitting.value = false;
  }
}

// ==================== 生命周期 ====================
async function loadDetail() {
  loading.value = true;
  loadError.value = null;
  try {
    const d = await fetchPracticeDetail(qid.value);
    detail.value = d;
    // 回填上次作答（可能是字母、选项原文、多空分隔串或源码，AnswerArea 会按题型解析）
    answerContent.value = String(d.lastAnswer ?? '');
    await nextTick();
    startedAt = Date.now();
    lastSavedDraftContent = '';
    draftState.value = 'idle';
    draftHint.value = '编辑内容后 1s 内自动保存草稿';
  } catch (e) {
    detail.value = null;
    loadError.value = `题目加载失败：${(e as Error)?.message ?? '未知错误'}`;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadDetail();
  void difficultyStore.load();
});

onBeforeUnmount(clearDraftTimer);
</script>

<template>
  <div class="solve-page">
    <!-- 顶部：返回 + 标题 -->
    <header class="solve-topbar">
      <button class="st-btn st-btn--ghost" @click="goBack">
        <ArrowLeft :size="14" /> 返回刷题列表
      </button>
      <div class="solve-topbar__main">
        <h1 class="solve-title">{{ title }}</h1>
        <p class="solve-subtitle">
          <span v-if="detail">题号 {{ detail.id }} · {{ typeLabel }}</span>
          <span v-else>题目加载中</span>
        </p>
      </div>
      <div class="solve-topbar__actions">
        <span class="draft-pill" :class="{ 'draft-pill--error': draftState === 'error' }">
          {{
            draftState === 'saving'
              ? '草稿保存中'
              : draftState === 'queued'
                ? '待保存'
                : draftState === 'saved'
                  ? '草稿已保存'
                  : draftState === 'error'
                    ? '草稿失败'
                    : '草稿未开始'
          }}
        </span>
        <button class="st-btn st-btn--secondary" :disabled="!detail || draftState === 'saving'" @click="flushDraft(true)">
          <Save :size="13" /> 保存草稿
        </button>
        <button class="st-btn st-btn--primary" :disabled="!canSubmit" @click="handleSubmit">
          <Loader2 v-if="submitting" :size="14" class="spin" />
          <Send v-else :size="13" />
          {{ submitting ? '提交中…' : '提交作答' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="st-empty solve-loading">
      <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
      <div class="st-empty__text">题目加载中…</div>
    </div>

    <div v-else-if="loadError" class="st-empty solve-loading">
      <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
      <div class="st-empty__text">{{ loadError }}</div>
      <button class="st-btn st-btn--secondary" @click="loadDetail">重新加载</button>
    </div>

    <!-- 左：题目信息｜右：作答区 -->
    <div v-else-if="detail" class="solve-grid">
      <aside class="st-card solve-side">
        <div class="side-head">
          <span class="side-head__icon">
            <ListTree :size="15" />
          </span>
          <div class="side-head__meta">
            <h2 class="side-head__title">题目信息</h2>
            <p class="side-head__sub">题号 {{ detail.id }}</p>
          </div>
          <span class="st-badge" :class="detail.done ? 'st-badge--info' : 'st-badge--neutral'">
            {{ detail.done ? '已做过' : '未做' }}
          </span>
        </div>

        <div class="solve-side__body">
          <!-- 关键指标：2×2 网格，比一排胶囊更易扫读 -->
          <div class="side-meta">
            <div class="side-meta__cell">
              <span class="side-meta__label">题型</span>
              <span class="side-meta__value">{{ typeLabel }}</span>
            </div>
            <div class="side-meta__cell">
              <span class="side-meta__label">难度</span>
              <span class="side-meta__value">{{ difficultyText(detail) }}</span>
            </div>
            <div class="side-meta__cell">
              <span class="side-meta__label">分值</span>
              <span class="side-meta__value">{{ detail.score ?? '—' }} 分</span>
            </div>
            <div class="side-meta__cell">
              <span class="side-meta__label">通过率</span>
              <span class="side-meta__value">{{ acceptanceText }}</span>
            </div>
          </div>

          <section class="side-section">
            <div class="side-section__head">题干</div>
            <div class="stem-text">{{ detail.content || '—' }}</div>
          </section>

          <section v-if="detail.requirements?.length" class="side-section">
            <div class="side-section__head">作答要求</div>
            <ol class="req-list">
              <li v-for="(r, i) in detail.requirements" :key="i">{{ r }}</li>
            </ol>
          </section>

          <section v-if="detail.sampleTestCases?.length" class="side-section">
            <div class="side-section__head">示例用例</div>
            <div v-for="(c, i) in detail.sampleTestCases" :key="i" class="case-item">
              <div class="case-item__desc">用例 {{ i + 1 }} · {{ c.description || '示例' }}</div>
              <div class="case-item__row">
                <span class="case-item__label">输入</span>
                <pre class="st-code">{{ c.input || '—' }}</pre>
              </div>
              <div class="case-item__row">
                <span class="case-item__label">期望输出</span>
                <pre class="st-code">{{ c.expectedOutput || '—' }}</pre>
              </div>
            </div>
          </section>

          <section v-if="detail.lastAnswer" class="side-section">
            <div class="side-section__head">上次作答</div>
            <pre class="last-answer st-code">{{ detail.lastAnswer.slice(0, 300) }}{{ detail.lastAnswer.length > 300 ? '…' : '' }}</pre>
          </section>
        </div>
      </aside>

      <section class="st-card solve-main">
        <div class="st-card__header">
          <h2 class="st-card__title">作答区</h2>
          <span class="st-card__hint">本题已提交 {{ attemptCount }} 次</span>
        </div>
        <div class="st-card__body">
          <AnswerArea
            v-model="answerContent"
            :question="answerQuestion"
            show-code-tools
            :run-question-id="qid"
            :chapter-id="detail.chapterId"
            editor-height="460px"
            @change="scheduleDraftSave"
          />

          <!-- 提交结果 -->
          <div v-if="submitError" class="result-card result-card--error">
            <div class="block-head"><CircleAlert :size="14" /> 提交失败</div>
            <p class="detail-text">{{ submitError }}</p>
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
              <span v-if="!resultPassed" class="wrongbook-tip">已计入错题本</span>
            </div>

            <div v-if="result.output" class="detail-block">
              <div class="block-head">运行输出</div>
              <pre class="code-panel st-code">{{ result.output }}</pre>
            </div>

            <div v-if="result.errorMsg" class="detail-block">
              <div class="block-head">
                <CircleX :size="14" /> 错误信息<template v-if="result.errorLine"> · 第 {{ result.errorLine }} 行</template>
              </div>
              <pre class="code-panel code-panel--error st-code">{{ result.errorMsg }}</pre>
              <p v-if="result.errorReason" class="detail-text">{{ result.errorReason }}</p>
            </div>

            <div v-if="result.caseResults?.length" class="detail-block">
              <div class="block-head">逐用例通过情况</div>
              <table class="case-table">
                <thead>
                  <tr>
                    <th>用例</th>
                    <th>结果</th>
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

          <p class="draft-foot">{{ draftHint }}</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 画布底色 / 统一留白 / 滚动容器 / 宽度上限都由 StandaloneLayout 提供，
   本页只管「左题目信息 + 右作答区」这层栅格，不要再写 padding 与视口高度 */
.solve-page {
  width: 100%;
}

.solve-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.solve-topbar__main {
  min-width: 0;
  flex: 1;
}

.solve-title {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.solve-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.solve-topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.draft-pill {
  font-size: 11.5px;
  color: var(--text-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 3px 10px;
}

.draft-pill--error {
  color: var(--status-danger);
  border-color: rgba(185, 28, 28, 0.3);
}

.solve-loading {
  padding: 120px 16px;
}

.solve-grid {
  display: grid;
  grid-template-columns: minmax(380px, 470px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 1100px) {
  .solve-grid {
    grid-template-columns: 1fr;
  }
}

.solve-side {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-md);
}

@media (max-width: 1100px) {
  .solve-side {
    position: static;
  }
}

/* 面板头部：图标 + 标题 + 状态胶囊 */
.side-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, #ffffff 0%, #fcfcfb 100%);
}

.side-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.side-head__meta {
  flex: 1;
  min-width: 0;
}

.side-head__title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.side-head__sub {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.solve-side__body {
  padding: 16px 18px 20px;
  max-height: calc(100vh - 168px);
  overflow: auto;
  scrollbar-gutter: stable;
}

@media (max-width: 1100px) {
  .solve-side__body {
    max-height: none;
  }
}

/* 关键指标 2×2 网格 */
.side-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 18px;
}

.side-meta__cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #fcfcfb;
  min-width: 0;
}

.side-meta__label {
  font-size: 11px;
  letter-spacing: 0.3px;
  color: var(--text-tertiary);
}

.side-meta__value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-section + .side-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.side-section__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-secondary);
}

.side-section__head::before {
  content: '';
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--text-secondary);
  opacity: 0.55;
}

/* 题干：纸面感的一块，左侧加重竖条引导视线 */
.stem-text {
  padding: 14px 16px;
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, #fdfdfc 0%, #fbfbfa 100%);
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.req-list {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: req;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.req-list li {
  position: relative;
  counter-increment: req;
  padding-left: 26px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-secondary);
}

.req-list li::before {
  content: counter(req);
  position: absolute;
  left: 0;
  top: 2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 示例用例：卡片化，表头 + 两行代码 */
.case-item {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow: hidden;
}

.case-item + .case-item {
  margin-top: 10px;
}

.case-item__desc {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.case-item__row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 12px;
}

.case-item__row + .case-item__row {
  border-top: 1px dashed var(--border-subtle);
}

.case-item__label {
  flex-shrink: 0;
  width: 52px;
  padding-top: 1px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.case-item__row pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
}

.last-answer {
  margin: 0;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
}

/* 结果 */
.analysis-box,
.result-card {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.result-card--error .block-head {
  color: var(--status-danger);
}

.analysis-verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 14px;
}

.analysis-verdict--ok {
  color: var(--status-success);
}

.analysis-verdict--bad {
  color: var(--status-danger);
}

.wrongbook-tip {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-tertiary);
}

.detail-block + .detail-block {
  margin-top: 14px;
}

.detail-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

.code-panel {
  margin: 0;
  padding: 12px 14px;
  background: #fbfbfa;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  max-height: 320px;
  overflow: auto;
}

.code-panel--error {
  background: var(--status-danger-bg);
  border-color: rgba(185, 28, 28, 0.18);
  color: var(--status-danger);
}

.case-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}

.case-table th,
.case-table td {
  border: 1px solid var(--border-subtle);
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
}

.case-table th {
  background: var(--bg-subtle);
  font-weight: 600;
  color: var(--text-secondary);
}

.cell-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--text-tertiary);
}

.cell-code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}

.kp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.draft-foot {
  margin: 16px 0 0;
  font-size: 11.5px;
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
