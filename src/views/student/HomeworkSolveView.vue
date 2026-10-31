<script setup lang="ts">
/**
 * 作业作答页（独立页面，从「我的作业」新窗口打开）
 *
 * 布局：挂在 StandaloneLayout 下（无侧边栏）。左栏作业信息 + 题目导航，右栏逐题作答；
 * 作答控件由 <AnswerArea> 渲染（与刷题作答页共用）。
 *
 * 已对接：
 *   GET  /api/teach/homework/student/brief      作业元信息 + 题目快照 ID 列表
 *   GET  /api/teach/homework/student/question   按快照 ID 懒加载单题（不含答案）
 *   POST /api/exam/homework/submit              整份 answers[] 一次提交
 *
 * ★ 两套 ID 别混用（混了就报 code=1001「题目不属于该作业」）：
 *   - 拉题干：questionId 查询参数 = **快照 ID**（teach_homework_question.id），也就是 brief.questionIds；
 *   - 提交答案：answers[].questionId = **题库 ID**（exam_question.id），取自题目返回的 questionId 字段；
 *     同时带 answers[].snapshotId = 快照 ID（可选），让错题钉在发布那一版题上。
 *
 * 口径：
 *   - 题目逐题懒加载并缓存，切题不重复请求
 *   - 作业没有草稿接口，答案只留在本页内存里，离开前请一次提交完
 *   - 是否截止以 brief 的 status / deadline 为准，允许逾期时仍可提交
 *   - 老快照可能缺题库 ID（questionId 为 null），该题只能看不能交
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Clock,
  Lightbulb,
  Loader2,
  ListOrdered,
  Send,
} from 'lucide-vue-next';
import AnswerArea from '@/components/student/AnswerArea.vue';
import {
  fetchStudentHomeworkBrief,
  fetchStudentHomeworkQuestion,
  submitHomework,
} from '@/api/exam';
import type {
  AnswerAreaQuestion,
  HomeworkAnswer,
  StudentHomeworkBrief,
  StudentHomeworkQuestion,
} from '@/types/exam';

const props = defineProps<{ homeworkId: string }>();
const router = useRouter();

const homeworkId = computed(() => Number(props.homeworkId) || 0);

const brief = ref<StudentHomeworkBrief | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

/** 题目缓存：快照 ID → 题目（懒加载，切题不重复请求） */
const questions = ref<Record<number, StudentHomeworkQuestion>>({});
const questionLoading = ref<Record<number, boolean>>({});
const questionError = ref<Record<number, string>>({});

/** 答案：快照 ID → 规范答案串 */
const answers = ref<Record<number, string>>({});

const currentId = ref(0);

/** 当前题的答案（v-model 用）：读写都落到 answers 里，切题不丢 */
const currentAnswer = computed({
  get: () => answers.value[currentId.value] ?? '',
  set: (value: string) => {
    answers.value = { ...answers.value, [currentId.value]: value };
  },
});

const questionIds = computed(() => brief.value?.questionIds ?? []);

const currentQuestion = computed<StudentHomeworkQuestion | null>(
  () => questions.value[currentId.value] ?? null,
);

const currentIndex = computed(() => Math.max(0, questionIds.value.indexOf(currentId.value)));

const answerQuestion = computed<AnswerAreaQuestion>(() => {
  const q = currentQuestion.value;
  if (!q) return { id: 0, type: 0, content: '' };
  return {
    id: Number(q.id),
    type: Number(q.type),
    content: q.content,
    options: (q.options ?? []).map((o) => String(o?.value ?? '')),
    optionKeys: (q.options ?? []).map((o) => String(o?.key ?? '')),
    renderConfig: q.renderConfig ?? null,
    // 编程题用发布时固化的框架代码初始化编辑器
    codeFramework: q.codeFramework ?? undefined,
  };
});

/** 提交用的题库 ID：快照可能缺题库 ID（老数据），此时该题不可提交 */
const currentBankId = computed(() => currentQuestion.value?.questionId ?? null);

// ==================== 阶梯提示（逐条展开，不计分） ====================
const hintShown = ref<Record<number, number>>({});

const hintList = computed(() => currentQuestion.value?.hints ?? []);
const hintsShownCount = computed(() => hintShown.value[currentId.value] ?? 0);
const visibleHints = computed(() => hintList.value.slice(0, hintsShownCount.value));

function showOneMoreHint() {
  const id = currentId.value;
  if (!id || hintsShownCount.value >= hintList.value.length) return;
  hintShown.value = { ...hintShown.value, [id]: hintsShownCount.value + 1 };
}

function collapseHints() {
  const id = currentId.value;
  if (!id) return;
  hintShown.value = { ...hintShown.value, [id]: 0 };
}

/** 已作答题数：按「答案串非空」算，与提交时的过滤口径一致 */
const answeredCount = computed(
  () => questionIds.value.filter((id) => String(answers.value[id] ?? '').trim() !== '').length,
);

const progressPercent = computed(() => {
  const total = questionIds.value.length;
  if (!total) return 0;
  return Math.round((answeredCount.value / total) * 100);
});

function isAnswered(id: number): boolean {
  return String(answers.value[id] ?? '').trim() !== '';
}

const expired = computed(() => {
  const b = brief.value;
  if (!b) return false;
  if (b.status === 3) return true;
  const at = Date.parse(String(b.deadline ?? ''));
  return Number.isFinite(at) && at < Date.now();
});

const canSubmit = computed(() => !!brief.value && (!expired.value || brief.value.allowLateSubmit === 1));

const statusText = computed(() => {
  const b = brief.value;
  if (!b) return '';
  if (b.statusName) return b.statusName;
  return b.status === 3 || expired.value ? '已截止' : '已发布';
});

// ==================== 展示口径 ====================
function formatDateTime(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '—';
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : text;
}

/** 截止倒计时：只负责「还剩多久」的观感，能否提交仍以 expired 为准 */
const countdownText = computed(() => {
  const b = brief.value;
  if (!b || expired.value) return '';
  const at = Date.parse(String(b.deadline ?? ''));
  if (!Number.isFinite(at)) return '';
  const diff = at - Date.now();
  if (diff <= 0) return '';
  const day = Math.floor(diff / 86400000);
  if (day >= 1) return `剩 ${day} 天`;
  const hour = Math.floor(diff / 3600000);
  if (hour >= 1) return `剩 ${hour} 小时`;
  return `剩 ${Math.max(1, Math.floor(diff / 60000))} 分钟`;
});

function questionTitle(q: StudentHomeworkQuestion | null, fallbackId: number): string {
  const name = String(q?.shortTitle ?? '').trim();
  if (name) return name;
  const index = questionIds.value.indexOf(fallbackId);
  return `第 ${index >= 0 ? index + 1 : 1} 题`;
}

// ==================== 题目加载 ====================
async function ensureQuestion(id: number) {
  if (!id || questions.value[id] || questionLoading.value[id]) return;
  questionLoading.value = { ...questionLoading.value, [id]: true };
  questionError.value = { ...questionError.value, [id]: '' };
  try {
    const q = await fetchStudentHomeworkQuestion(id);
    questions.value = { ...questions.value, [id]: q };
  } catch (e) {
    questionError.value = {
      ...questionError.value,
      [id]: `题目加载失败：${(e as Error)?.message ?? '未知错误'}`,
    };
  } finally {
    questionLoading.value = { ...questionLoading.value, [id]: false };
  }
}

function goQuestion(id: number) {
  if (!id || id === currentId.value) return;
  currentId.value = id;
  void ensureQuestion(id);
}

function goStep(offset: number) {
  const list = questionIds.value;
  const next = list[currentIndex.value + offset];
  if (next) goQuestion(next);
}

function reloadQuestion() {
  const id = currentId.value;
  if (!id) return;
  const next = { ...questions.value };
  delete next[id];
  questions.value = next;
  void ensureQuestion(id);
}

watch(currentId, (id) => {
  if (id) void ensureQuestion(id);
});

// ==================== 加载作业 ====================
async function loadBrief() {
  loading.value = true;
  loadError.value = null;
  try {
    const data = await fetchStudentHomeworkBrief(homeworkId.value);
    brief.value = data;
    currentId.value = data.questionIds[0] ?? 0;
    if (currentId.value) await ensureQuestion(currentId.value);
  } catch (e) {
    brief.value = null;
    loadError.value = `作业加载失败：${(e as Error)?.message ?? '未知错误'}`;
  } finally {
    loading.value = false;
  }
}

onMounted(loadBrief);

// ==================== 提交 ====================
const submitting = ref(false);
const submitted = ref(false);
const submittedAt = ref('');
const submitError = ref<string | null>(null);

async function handleSubmit() {
  const b = brief.value;
  if (!b || submitting.value) return;
  if (!canSubmit.value) {
    ElMessage.info(expired.value ? '该作业已截止，无法再提交' : '该作业当前不可提交');
    return;
  }

  /** 已作答的题（按快照 ID 收集，答案串为空的直接丢弃） */
  const filled = b.questionIds
    .map((snapshotId) => ({
      snapshotId,
      answerContent: String(answers.value[snapshotId] ?? '').trim(),
    }))
    .filter((it) => it.answerContent !== '');

  if (!filled.length) {
    ElMessage.warning('还没有作答任何题目');
    return;
  }

  // 提交要带题库 ID，先把已作答的题补齐（正常情况下都已经缓存过，这里只是兜底）
  await Promise.all(filled.map((it) => ensureQuestion(it.snapshotId)));

  /**
   * ★ 提交口径：answers[].questionId 用**题库 ID**，snapshotId 用**快照 ID**。
   * 缺题库 ID 的老快照交不上去，单独挑出来提示，不能让整份提交失败。
   */
  const payload: HomeworkAnswer[] = [];
  let blockedCount = 0;
  for (const it of filled) {
    const bankId = questions.value[it.snapshotId]?.questionId ?? 0;
    if (!bankId) {
      blockedCount += 1;
      continue;
    }
    payload.push({
      questionId: bankId,
      snapshotId: it.snapshotId,
      answerContent: it.answerContent,
    });
  }

  if (!payload.length) {
    ElMessage.warning('已作答的题目暂时无法在线提交，请联系老师处理');
    return;
  }
  if (blockedCount > 0) {
    ElMessage.warning(`有 ${blockedCount} 道题缺少题目信息，本次不会提交`);
  }

  const missing = b.questionIds.length - filled.length;
  const tip = submitted.value ? '这是重新提交，新提交会覆盖上一次的作答。' : '';
  if (missing > 0) {
    try {
      await ElMessageBox.confirm(
        `还有 ${missing} 题没有作答，未作答的题目不计分。${tip}确认提交整份作业？`,
        '提交作业',
        { confirmButtonText: '确认提交', cancelButtonText: '再检查一下', type: 'warning' },
      );
    } catch {
      return;
    }
  } else if (submitted.value) {
    try {
      await ElMessageBox.confirm('新提交会覆盖上一次的作答，确认重新提交？', '重新提交', {
        confirmButtonText: '确认提交',
        cancelButtonText: '取消',
        type: 'warning',
      });
    } catch {
      return;
    }
  }

  submitting.value = true;
  submitError.value = null;
  try {
    await submitHomework({ homeworkId: b.homeworkId, answers: payload });
    submitted.value = true;
    submittedAt.value = new Date().toLocaleString();
    // 提交后由后端异步批改，分数在「我的作业」里看
    ElMessage.success('作业已提交，批改完成后可在「我的作业」查看得分');
  } catch (e) {
    submitError.value = `提交失败：${(e as Error)?.message ?? '未知错误'}`;
  } finally {
    submitting.value = false;
  }
}

/** 返回列表：本页是新标签打开，先试关闭，关不掉再退回我的作业 */
function goBack() {
  window.close();
  window.setTimeout(() => {
    void router.push('/student/homework');
  }, 120);
}
</script>

<template>
  <div class="hw-page">
    <header class="hw-topbar">
      <button class="st-btn st-btn--ghost" @click="goBack">
        <ArrowLeft :size="14" /> 返回我的作业
      </button>
      <div class="hw-topbar__main">
        <h1 class="hw-title">{{ brief?.title || '作业作答' }}</h1>
        <p class="hw-subtitle">
          <span v-if="brief">
            {{ brief.chapterName || (brief.chapterId ? `章节 ${brief.chapterId}` : '未关联章节') }}
            · {{ statusText }}
            · 共 {{ questionIds.length }} 题 / {{ brief.totalScore }} 分
          </span>
          <span v-else>作业信息加载中</span>
        </p>
      </div>
      <div class="hw-topbar__actions">
        <span class="progress-pill">{{ answeredCount }} / {{ questionIds.length }} 题已答</span>
        <button
          class="st-btn st-btn--primary"
          :disabled="!brief || submitting || !canSubmit"
          @click="handleSubmit"
        >
          <Loader2 v-if="submitting" :size="14" class="spin" />
          <Send v-else :size="13" />
          {{ submitting ? '提交中…' : submitted ? '重新提交' : '提交作业' }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="st-empty hw-loading">
      <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
      <div class="st-empty__text">作业加载中…</div>
    </div>

    <div v-else-if="loadError" class="st-empty hw-loading">
      <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
      <div class="st-empty__text">{{ loadError }}</div>
      <button class="st-btn st-btn--secondary" @click="loadBrief">重新加载</button>
    </div>

    <div v-else-if="brief" class="hw-grid">
      <!-- 左：作业信息 + 题目导航 -->
      <aside class="st-card hw-side">
        <div class="side-head">
          <span class="side-head__icon"><ClipboardList :size="15" /></span>
          <div class="side-head__meta">
            <h2 class="side-head__title">作业信息</h2>
            <p class="side-head__sub">{{ formatDateTime(brief.publishTime) }} 发布</p>
          </div>
        </div>

        <div class="hw-side__body">
          <div class="side-meta">
            <div class="side-meta__cell">
              <span class="side-meta__label">题量</span>
              <span class="side-meta__value">{{ questionIds.length }} 题</span>
            </div>
            <div class="side-meta__cell">
              <span class="side-meta__label">总分</span>
              <span class="side-meta__value">{{ brief.totalScore }} 分</span>
            </div>
            <div class="side-meta__cell">
              <span class="side-meta__label">截止</span>
              <span class="side-meta__value">{{ formatDateTime(brief.deadline) }}</span>
            </div>
            <div class="side-meta__cell">
              <span class="side-meta__label">逾期提交</span>
              <span class="side-meta__value">{{ brief.allowLateSubmit ? '允许' : '不允许' }}</span>
            </div>
          </div>

          <div v-if="countdownText" class="deadline-note">
            <Clock :size="13" /> 距离截止{{ countdownText }}
          </div>
          <div v-else-if="expired" class="deadline-note deadline-note--muted">
            <Clock :size="13" /> 已过截止时间{{ brief.allowLateSubmit ? '，仍可提交（记为逾期）' : '，已不能提交' }}
          </div>

          <section v-if="brief.content" class="side-section">
            <div class="side-section__head">作业要求</div>
            <p class="side-text">{{ brief.content }}</p>
          </section>

          <section class="side-section">
            <div class="side-section__head">
              <ListOrdered :size="13" /> 题目导航
              <span class="nav-hint">{{ answeredCount }} / {{ questionIds.length }}</span>
            </div>
            <span class="progress-bar"><i :style="{ width: `${progressPercent}%` }"></i></span>
            <div v-if="questionIds.length" class="nav-grid">
              <button
                v-for="(id, i) in questionIds"
                :key="id"
                type="button"
                class="nav-btn"
                :class="{
                  'nav-btn--active': id === currentId,
                  'nav-btn--answered': isAnswered(id),
                }"
                @click="goQuestion(id)"
              >
                {{ i + 1 }}
              </button>
            </div>
            <p v-else class="side-text side-text--muted">这份作业还没有题目。</p>
          </section>
        </div>
      </aside>

      <!-- 右：当前题 -->
      <section class="st-card hw-main">
        <div class="hw-main__head">
          <div class="hw-main__meta">
            <span class="q-index">{{ currentIndex + 1 }}</span>
            <div>
              <h2 class="q-title">{{ questionTitle(currentQuestion, currentId) }}</h2>
              <p class="q-sub">
                <template v-if="currentQuestion">
                  {{ currentQuestion.typeName || '题目' }} · {{ currentQuestion.score }} 分 · 第
                  {{ currentIndex + 1 }} / {{ questionIds.length }} 题
                </template>
                <template v-else>第 {{ currentIndex + 1 }} / {{ questionIds.length }} 题</template>
              </p>
            </div>
          </div>
          <span
            class="st-badge"
            :class="isAnswered(currentId) ? 'st-badge--success' : 'st-badge--neutral'"
          >
            {{ isAnswered(currentId) ? '已作答' : '未作答' }}
          </span>
        </div>

        <div class="hw-main__body">
          <div v-if="questionLoading[currentId]" class="st-empty question-loading">
            <Loader2 :size="24" :stroke-width="1.4" class="st-empty__icon spin" />
            <div class="st-empty__text">题目加载中…</div>
          </div>

          <div v-else-if="questionError[currentId]" class="st-empty question-loading">
            <CircleAlert :size="26" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">{{ questionError[currentId] }}</div>
            <button class="st-btn st-btn--secondary" @click="reloadQuestion">重新加载</button>
          </div>

          <template v-else-if="currentQuestion">
            <div class="stem-text">{{ currentQuestion.content || '—' }}</div>

            <!-- 作答要求（主观题 / 编程题，发布时固化的快照） -->
            <section v-if="currentQuestion.requirements?.length" class="q-note">
              <div class="q-note__head">作答要求</div>
              <ul class="q-note__list">
                <li v-for="(item, i) in currentQuestion.requirements" :key="i">{{ item }}</li>
              </ul>
            </section>

            <div v-if="!currentBankId" class="q-note q-note--warn">
              <CircleAlert :size="13" />
              这道题暂不支持在线提交，可以先写在纸上，提交后与老师沟通补交。
            </div>

            <AnswerArea
              :key="currentQuestion.id"
              v-model="currentAnswer"
              :question="answerQuestion"
              :show-code-tools="!!currentBankId"
              :run-question-id="currentBankId"
              :chapter-id="brief.chapterId || undefined"
              code-tip="提交前可以先自测代码；正式分数以提交后的批改结果为准。"
            />

            <!-- 阶梯提示：逐条展开，不计分 -->
            <section v-if="hintList.length" class="q-hints">
              <div class="q-hints__head">
                <Lightbulb :size="13" /> 提示
                <span class="q-hints__count">{{ hintsShownCount }} / {{ hintList.length }}</span>
                <span class="q-hints__actions">
                  <button
                    v-if="hintsShownCount < hintList.length"
                    type="button"
                    class="st-text-btn"
                    @click="showOneMoreHint"
                  >
                    再给一条提示
                  </button>
                  <button v-else type="button" class="st-text-btn" @click="collapseHints">
                    收起提示
                  </button>
                </span>
              </div>
              <ol v-if="visibleHints.length" class="q-hints__list">
                <li v-for="(hint, i) in visibleHints" :key="i">{{ hint }}</li>
              </ol>
            </section>

            <div class="step-row">
              <button class="st-btn st-btn--secondary" :disabled="currentIndex <= 0" @click="goStep(-1)">
                上一题
              </button>
              <span class="step-hint">切题不会丢答案，最后统一提交</span>
              <button
                class="st-btn st-btn--secondary"
                :disabled="currentIndex >= questionIds.length - 1"
                @click="goStep(1)"
              >
                下一题
              </button>
            </div>
          </template>

          <div v-else class="st-empty question-loading">
            <ClipboardList :size="30" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">这份作业还没有题目</div>
          </div>

          <!-- 提交状态 -->
          <div v-if="submitError" class="submit-note submit-note--danger">
            <CircleAlert :size="13" /> {{ submitError }}
          </div>
          <div v-else-if="submitted" class="submit-note submit-note--ok">
            <CircleCheck :size="13" />
            已于 {{ submittedAt }} 提交，等老师批改后可在「我的作业」查看得分。
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 画布底色 / 留白 / 滚动 / 宽度上限都由 StandaloneLayout 提供，本页只管栅格 */
.hw-page {
  width: 100%;
}

.hw-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.hw-topbar__main {
  min-width: 0;
  flex: 1;
}

.hw-title {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hw-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.hw-topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.progress-pill {
  font-size: 11.5px;
  color: var(--text-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
}

.hw-loading {
  padding: 120px 16px;
}

.hw-grid {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 1100px) {
  .hw-grid {
    grid-template-columns: 1fr;
  }
}

.hw-side {
  position: sticky;
  top: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-md);
}

@media (max-width: 1100px) {
  .hw-side {
    position: static;
  }
}

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
}

.hw-side__body {
  padding: 16px 18px 20px;
  max-height: calc(100vh - 168px);
  overflow: auto;
  scrollbar-gutter: stable;
}

@media (max-width: 1100px) {
  .hw-side__body {
    max-height: none;
  }
}

.side-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
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

.deadline-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--status-warning-bg, #fffbeb);
  font-size: 11.5px;
  color: var(--status-warning, #b45309);
}

.deadline-note--muted {
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.side-section {
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

.nav-hint {
  margin-left: auto;
  font-weight: 400;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.side-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.side-text--muted {
  color: var(--text-tertiary);
}

.progress-bar {
  display: block;
  height: 5px;
  border-radius: 999px;
  background: var(--bg-subtle);
  overflow: hidden;
}

.progress-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent, #1f2937);
  transition: width var(--transition);
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.nav-btn {
  height: 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface, #fff);
  font-family: inherit;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), color var(--transition);
}

.nav-btn:hover {
  border-color: var(--border-strong, rgba(87, 83, 78, 0.35));
}

.nav-btn--answered {
  background: var(--bg-subtle);
  color: var(--text-primary);
  font-weight: 600;
}

.nav-btn--active {
  border-color: var(--accent, #1f2937);
  color: #fff;
  background: var(--accent, #1f2937);
}

/* 右栏 */
.hw-main__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.hw-main__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.q-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.q-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.q-sub {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.hw-main__body {
  padding: 18px 20px 22px;
}

.question-loading {
  padding: 80px 16px;
}

.stem-text {
  padding: 14px 16px;
  margin-bottom: 18px;
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

.step-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.step-hint {
  margin: 0 auto;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 作答要求 / 不可提交提示 */
.q-note {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #fcfcfb;
}

.q-note--warn {
  display: flex;
  align-items: center;
  gap: 6px;
  border-color: rgba(180, 83, 9, 0.25);
  background: var(--status-warning-bg, #fffbeb);
  color: var(--status-warning, #b45309);
  font-size: 12px;
  line-height: 1.6;
}

.q-note__head {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.q-note__list {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-secondary);
}

/* 阶梯提示 */
.q-hints {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.q-hints__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.q-hints__count {
  font-weight: 400;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.q-hints__actions {
  margin-left: auto;
}

.q-hints__list {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.submit-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
}

.submit-note--ok {
  border: 1px solid rgba(21, 128, 61, 0.2);
  background: var(--status-success-bg, #f0fdf4);
  color: var(--status-success, #15803d);
}

.submit-note--danger {
  border: 1px solid rgba(185, 28, 28, 0.2);
  background: var(--status-danger-bg);
  color: var(--status-danger);
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
