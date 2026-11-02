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
 *   GET  /api/exam/homework/my-answers          本人该作业的全部作答（草稿 + 已提交），用于回填续做
 *   POST /api/exam/homework/draft               保存草稿（不判卷，3s 节流，只传变化的题）
 *   POST /api/exam/homework/submit              交卷（本次作答 + 剩余草稿一并转正，全量重批）
 *
 * ★ 两套 ID 别混用（混了就报 code=1001「题目不属于该作业」）：
 *   - 拉题干：questionId 查询参数 = **快照 ID**（teach_homework_question.id），也就是 brief.questionIds；
 *   - 草稿 / 交卷：answers[].questionId = **题库 ID**（exam_question.id），取自题目返回的 questionId；
 *     answers[].snapshotId = 快照 ID（可选），让错题钉在发布那一版题上。
 *
 * 口径：
 *   - 题目逐题懒加载并缓存，切题不重复请求
 *   - 边做边存：编辑后 3s 落一次草稿，退出重进用 my-answers 回填
 *   - 已交卷的题按只读展示；要改先点「修改作答」解锁，改完重新提交（后端会全量重批）
 *   - 截止只约束交卷，不约束草稿：过期了还能存草稿，但提交会被拒
 *   - 老快照可能缺题库 ID（questionId 为 null），该题只能看不能交
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  Pencil,
  Send,
} from 'lucide-vue-next';
import AnswerArea from '@/components/student/AnswerArea.vue';
import {
  fetchMyHomeworkAnswers,
  fetchStudentHomeworkBrief,
  fetchStudentHomeworkQuestion,
  saveHomeworkDraft,
  submitHomework,
} from '@/api/exam';
import type {
  AnswerAreaQuestion,
  HomeworkAnswer,
  HomeworkAnswers,
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

/**
 * 作答状态：快照 ID → 1=已交卷，0/undefined=草稿或未作答。
 * 已交卷的题按只读渲染，要改先解锁（后端对已提交题的草稿会忽略）。
 */
const answerStatus = ref<Record<number, number>>({});

/** 是否已经交过卷（至少有 1 题已提交） */
const hasSubmitted = computed(() => Object.values(answerStatus.value).some((s) => s === 1));

/** 解锁已交卷题目：默认 false，点「修改作答」才置 true，避免误改已交内容 */
const editMode = ref(false);

/** my-answers 给的交卷许可：null 表示后端拿不到（teach 不可用），此时按 brief 自己判断 */
const serverCanSubmit = ref<boolean | null>(null);

/**
 * 回填时还不知道快照 ID 的作答（my-answers 的 snapshotId 可能为 0）。
 * 按题库 ID 暂存，等这道题加载出来、拿到它的 questionId 再挂到快照 ID 上。
 */
const pendingByBankId = ref<Record<number, { content: string; status: number }>>({});

const currentId = ref(0);

/** 当前题的答案（v-model 用）：读写都落到 answers 里，切题不丢；写入时排一次草稿保存 */
const currentAnswer = computed({
  get: () => answers.value[currentId.value] ?? '',
  set: (value: string) => {
    const id = currentId.value;
    answers.value = { ...answers.value, [id]: value };
    scheduleDraft(id);
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

/** 单题是否只读：已交卷且没点「修改作答」解锁 */
function isLocked(id: number): boolean {
  return answerStatus.value[id] === 1 && !editMode.value;
}

const currentLocked = computed(() => isLocked(currentId.value));

/** 单题状态：已交卷 / 有内容（草稿） / 未作答 */
function questionState(id: number): 'submitted' | 'draft' | 'empty' {
  if (answerStatus.value[id] === 1) return 'submitted';
  return isAnswered(id) ? 'draft' : 'empty';
}

function statusLabel(id: number): string {
  const state = questionState(id);
  if (state === 'submitted') return '已交卷';
  return state === 'draft' ? '草稿' : '未作答';
}

// ==================== 草稿自动保存 ====================
/**
 * 只累积「本次变化」的题，3s 后合并成一次请求。
 * 已交卷的题不发（后端会忽略），缺题库 ID 的题也发不出去。
 */
const pendingDraft = new Set<number>();
const draftState = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
const draftSavedAt = ref('');
let draftTimer: number | null = null;

function formatClock(raw: string | null): string {
  const m = String(raw ?? '').match(/(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

const draftHint = computed(() => {
  switch (draftState.value) {
    case 'pending':
      return '有改动待保存';
    case 'saving':
      return '正在保存草稿…';
    case 'saved':
      return `草稿已保存 ${draftSavedAt.value}`;
    case 'error':
      return '草稿保存失败，下次编辑会重试';
    default:
      return '';
  }
});

function scheduleDraft(snapshotId: number) {
  if (!snapshotId) return;
  const q = questions.value[snapshotId];
  // 没题库 ID 存不了；已交卷的题后端会忽略草稿，改动只在重新交卷时生效
  if (!q?.questionId || answerStatus.value[snapshotId] === 1) return;
  pendingDraft.add(snapshotId);
  draftState.value = 'pending';
  if (draftTimer !== null) window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => void flushDraft(), 3000);
}

/** 把后端判定「已交卷」的题库 ID 同步成本地只读态 */
function markSubmittedByBankIds(bankIds: number[]): void {
  if (!bankIds.length) return;
  const next = { ...answerStatus.value };
  for (const [rawId, q] of Object.entries(questions.value)) {
    if (q.questionId && bankIds.includes(q.questionId)) next[Number(rawId)] = 1;
  }
  answerStatus.value = next;
}

async function flushDraft(): Promise<void> {
  if (draftTimer !== null) {
    window.clearTimeout(draftTimer);
    draftTimer = null;
  }
  const b = brief.value;
  if (!b || !pendingDraft.size) return;

  const ids = [...pendingDraft];
  pendingDraft.clear();

  const payload: HomeworkAnswer[] = [];
  for (const snapshotId of ids) {
    const bankId = questions.value[snapshotId]?.questionId;
    if (!bankId) continue;
    // 空串是「清空该题」的合法语义，原样提交，别 trim 掉
    payload.push({
      questionId: bankId,
      snapshotId,
      answerContent: String(answers.value[snapshotId] ?? ''),
    });
  }
  if (!payload.length) return;

  draftState.value = 'saving';
  try {
    const res = await saveHomeworkDraft({ homeworkId: b.homeworkId, answers: payload });
    draftSavedAt.value = formatClock(res.lastDraftTime);
    draftState.value = 'saved';

    // 后端已有这些题的行（草稿）：记成 0，后面清空时才记得显式提交空串，
    // 否则交卷「剩余草稿一并转正」会把清空前的旧内容当成有效答案。
    const nextStatus = { ...answerStatus.value };
    for (const item of payload) {
      const snapshotId = item.snapshotId as number;
      if (nextStatus[snapshotId] !== 1) nextStatus[snapshotId] = 0;
    }
    answerStatus.value = nextStatus;

    markSubmittedByBankIds(res.ignoredQuestionIds);
  } catch {
    // 失败把题放回队列，下次编辑顺带重试，不清空学生刚写的内容
    ids.forEach((id) => pendingDraft.add(id));
    draftState.value = 'error';
  }
}

/** 离开前尽量把未落库的改动送出去（关标签页时请求可能被中断，属尽力而为） */
function flushOnLeave() {
  if (pendingDraft.size) void flushDraft();
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!pendingDraft.size && draftState.value !== 'saving') return;
  e.preventDefault();
  e.returnValue = '';
}

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

const canSubmit = computed(() => {
  const b = brief.value;
  if (!b) return false;
  const byBrief = !expired.value || b.allowLateSubmit === 1;
  // my-answers 明确说不能交就以它为准；给 null（后端拿不到）时只看 brief
  return byBrief && serverCanSubmit.value !== false;
});

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
/**
 * 回填里快照 ID 缺失的作答，等题目加载出来、拿到题库 ID 后再挂上。
 * 只在本地没有答案时写入，避免覆盖学生正在写的内容。
 */
function mountPendingAnswer(snapshotId: number, q: StudentHomeworkQuestion) {
  const bankId = q.questionId ?? 0;
  if (!bankId) return;
  const pending = pendingByBankId.value[bankId];
  if (!pending) return;

  if (pending.content && !answers.value[snapshotId]) {
    answers.value = { ...answers.value, [snapshotId]: pending.content };
  }
  if (pending.status === 1) {
    answerStatus.value = { ...answerStatus.value, [snapshotId]: 1 };
  }
  const next = { ...pendingByBankId.value };
  delete next[bankId];
  pendingByBankId.value = next;
}

async function ensureQuestion(id: number) {
  if (!id || questions.value[id] || questionLoading.value[id]) return;
  questionLoading.value = { ...questionLoading.value, [id]: true };
  questionError.value = { ...questionError.value, [id]: '' };
  try {
    const q = await fetchStudentHomeworkQuestion(id);
    questions.value = { ...questions.value, [id]: q };
    mountPendingAnswer(id, q);
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

// ==================== 加载作业 + 回填上次作答 ====================
/**
 * 回填：my-answers 里已出现的题直接用保存的内容，未出现的题就是没做过。
 * 已提交（status=1）的题同步成只读态。
 */
function applySavedAnswers(b: StudentHomeworkBrief, saved: HomeworkAnswers): void {
  const idSet = new Set(b.questionIds);
  const nextAnswers = { ...answers.value };
  const nextStatus = { ...answerStatus.value };
  const pending: Record<number, { content: string; status: number }> = {};

  for (const row of saved.answers) {
    const content = String(row.answerContent ?? '');
    if (row.snapshotId && idSet.has(row.snapshotId)) {
      if (content) nextAnswers[row.snapshotId] = content;
      nextStatus[row.snapshotId] = row.status === 1 ? 1 : 0;
      continue;
    }
    // snapshotId 缺失或不在本作业里：按题库 ID 暂存，题目加载后再挂
    if (row.questionId) pending[row.questionId] = { content, status: row.status };
  }

  answers.value = nextAnswers;
  answerStatus.value = nextStatus;
  pendingByBankId.value = pending;
  serverCanSubmit.value = saved.canSubmit;

  if (saved.lastDraftTime) {
    draftSavedAt.value = formatClock(saved.lastDraftTime);
    draftState.value = 'saved';
  }
}

async function loadBrief() {
  loading.value = true;
  loadError.value = null;
  try {
    // 作答记录拉不到不影响答题（只是没法回填），单独 catch 降级
    const [data, saved] = await Promise.all([
      fetchStudentHomeworkBrief(homeworkId.value),
      fetchMyHomeworkAnswers(homeworkId.value).catch(() => null),
    ]);
    brief.value = data;
    if (saved) applySavedAnswers(data, saved);
    currentId.value = data.questionIds[0] ?? 0;
    if (currentId.value) await ensureQuestion(currentId.value);
  } catch (e) {
    brief.value = null;
    loadError.value = `作业加载失败：${(e as Error)?.message ?? '未知错误'}`;
  } finally {
    loading.value = false;
  }
}

/** 切到后台 / 最小化时也落一次草稿，比只在卸载时保存可靠 */
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushOnLeave();
}

onMounted(() => {
  void loadBrief();
  window.addEventListener('beforeunload', onBeforeUnload);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  flushOnLeave();
});

// ==================== 提交 ====================
const submitting = ref(false);
const submitted = ref(false);
const submittedAt = ref('');
const submitError = ref<string | null>(null);

/** 解锁已交卷题目：允许修改，改完需要重新提交（后端会覆盖并全量重批） */
function unlockEditing() {
  editMode.value = true;
  ElMessage.info('已解锁已交卷的题目，修改后请重新提交');
}

async function handleSubmit() {
  const b = brief.value;
  if (!b || submitting.value) return;
  if (!canSubmit.value) {
    ElMessage.info(expired.value ? '该作业已截止，无法再提交' : '该作业当前不可提交');
    return;
  }

  /**
   * 本次要交给后端的题：
   *   - 有内容的题全部交；
   *   - 本地清空、但后端已经有记录的题交空串（交卷会把剩余草稿转正，
   *     不显式清空的话旧内容会被当成有效答案提交）；
   *   - 已交卷、这次又没解锁的题不重发（后端已存着，避免无谓覆盖）。
   */
  const answered = b.questionIds.filter((id) => String(answers.value[id] ?? '').trim() !== '');
  if (!answered.length && !Object.keys(answerStatus.value).length) {
    ElMessage.warning('还没有作答任何题目');
    return;
  }

  const toSend = b.questionIds.filter((snapshotId) => {
    if (answerStatus.value[snapshotId] === 1 && !editMode.value) return false;
    const content = String(answers.value[snapshotId] ?? '');
    if (content.trim() !== '') return true;
    return answerStatus.value[snapshotId] !== undefined;
  });

  if (!toSend.length) {
    ElMessage.info('本次没有新的作答，无需重新提交');
    return;
  }

  // 提交要带题库 ID，先把要提交的题补齐（正常情况下都已经缓存过，这里只是兜底）
  await Promise.all(toSend.map((id) => ensureQuestion(id)));

  /**
   * ★ 提交口径：answers[].questionId 用**题库 ID**，snapshotId 用**快照 ID**。
   * 缺题库 ID 的老快照交不上去，单独挑出来提示，不能让整份提交失败。
   */
  const payload: HomeworkAnswer[] = [];
  let blockedCount = 0;
  for (const snapshotId of toSend) {
    const bankId = questions.value[snapshotId]?.questionId ?? 0;
    if (!bankId) {
      blockedCount += 1;
      continue;
    }
    payload.push({
      questionId: bankId,
      snapshotId,
      answerContent: String(answers.value[snapshotId] ?? ''),
    });
  }

  if (!payload.length) {
    ElMessage.warning('已作答的题目暂时无法在线提交，请联系老师处理');
    return;
  }
  if (blockedCount > 0) {
    ElMessage.warning(`有 ${blockedCount} 道题缺少题目信息，本次不会提交`);
  }

  const missing = b.questionIds.length - answered.length;
  const tip = hasSubmitted.value ? '这是重新提交，会覆盖上一次的作答并重新批改。' : '';
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
  } else if (hasSubmitted.value) {
    try {
      await ElMessageBox.confirm('新提交会覆盖上一次的作答并重新批改，确认重新提交？', '重新提交', {
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

    // 交卷会把这批题置为已提交、其余草稿一并转正 → 本地全部同步成只读
    const nextStatus = { ...answerStatus.value };
    for (const item of payload) nextStatus[item.snapshotId as number] = 1;
    answerStatus.value = nextStatus;
    editMode.value = false;
    pendingDraft.clear();
    if (draftTimer !== null) {
      window.clearTimeout(draftTimer);
      draftTimer = null;
    }
    draftState.value = 'idle';
    draftSavedAt.value = '';

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
        <span
          v-if="draftHint"
          class="progress-pill"
          :class="{ 'progress-pill--warn': draftState === 'error' }"
        >
          {{ draftHint }}
        </span>
        <span class="progress-pill">{{ answeredCount }} / {{ questionIds.length }} 题已答</span>
        <button
          v-if="hasSubmitted && !editMode"
          class="st-btn st-btn--secondary"
          @click="unlockEditing"
        >
          <Pencil :size="13" /> 修改作答
        </button>
        <button
          class="st-btn st-btn--primary"
          :disabled="!brief || submitting || !canSubmit"
          @click="handleSubmit"
        >
          <Loader2 v-if="submitting" :size="14" class="spin" />
          <Send v-else :size="13" />
          {{ submitting ? '提交中…' : hasSubmitted ? '重新提交' : '提交作业' }}
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
                  'nav-btn--answered': questionState(id) === 'draft',
                  'nav-btn--submitted': questionState(id) === 'submitted',
                }"
                :title="statusLabel(id)"
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
            :class="{
              'st-badge--success': questionState(currentId) === 'submitted',
              'st-badge--warning': questionState(currentId) === 'draft',
              'st-badge--neutral': questionState(currentId) === 'empty',
            }"
          >
            {{ statusLabel(currentId) }}
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

            <div v-if="currentLocked" class="q-note q-note--muted">
              <CircleCheck :size="13" />
              这道题已交卷，内容只读。需要修改请点右上角「修改作答」。
            </div>
            <div v-else-if="editMode && answerStatus[currentId] === 1" class="q-note q-note--muted">
              <Pencil :size="13" />
              已进入修改模式：已交卷题目的改动不会另存草稿，改完请点「重新提交」。
            </div>

            <AnswerArea
              :key="currentQuestion.id"
              v-model="currentAnswer"
              :question="answerQuestion"
              :readonly="currentLocked"
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
              <span class="step-hint">切题不会丢答案，作答会自动保存草稿</span>
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

.progress-pill--warn {
  border-color: rgba(180, 83, 9, 0.28);
  background: var(--status-warning-bg, #fffbeb);
  color: var(--status-warning, #b45309);
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

/* 已交卷的题：绿底，和「草稿」区分开 */
.nav-btn--submitted {
  border-color: rgba(21, 128, 61, 0.32);
  background: var(--status-success-bg, #f0fdf4);
  color: var(--status-success, #15803d);
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

.q-note--muted {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-subtle);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
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
