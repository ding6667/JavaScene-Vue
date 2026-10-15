<script setup lang="ts">
/**
 * 我的作业 —— 当前为 UI 壳（只保留界面状态，不接 api / pinia）
 *
 * 接口预留：POST /api/exam/homework/submit
 *   请求体 { homeworkId: number, answers: [{ questionId: number, answerContent: string }] }
 *   （@/api/student 已有 submitHomework()，本视图尚未接入）
 * 接口预留：GET /api/exam/grading/result/{homeworkId}
 *   返回 { id, homeworkId, userId, totalScore, studentScore,
 *          scoreDetail: [{ questionId, questionContent, fullScore, score, errorReason }],
 *          status, errorMessage }
 * 说明：学生作业列表后端未提供，需后端按当前登录用户补充 GET /api/exam/homework/list
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  CheckCheck,
  ClipboardList,
  CircleAlert,
  Clock,
  Save,
  Send,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

/** 作业条目（接口预留：学生作业列表后端未提供） */
interface HomeworkItem {
  homeworkId: number;
  title: string;
  taskCategory: string;
  publishTime: string | null;
  deadline: string | null;
  /** 0 未提交 / 1 已提交待批改 / 2 已批改 */
  status: number;
}

/** 作业内的作答题目（接口预留：GET /api/exam/homework/detail） */
interface HomeworkQuestion {
  questionId: number;
  questionContent: string;
  fullScore: number;
}

/** 批改结果单题明细（接口预留：GET /api/exam/grading/result/{homeworkId}） */
interface ScoreDetailItem {
  questionId: number;
  questionContent: string;
  fullScore: number;
  score: number;
  errorReason: string;
}

/** 批改结果（同上接口出参） */
interface GradingResult {
  id: number;
  homeworkId: number;
  userId: number;
  totalScore: number;
  studentScore: number;
  scoreDetail: ScoreDetailItem[];
  status: string;
  errorMessage: string;
}

const router = useRouter();

const homeworks = ref<HomeworkItem[]>([]);
const activeHomeworkId = ref<number | null>(null);

/** 当前作业的题目与作答内容 */
const questions = ref<HomeworkQuestion[]>([]);
const answers = ref<Record<number, string>>({});
const submitting = ref(false);

/** 批改结果（接口预留：GET /api/exam/grading/result/{homeworkId}） */
const result = ref<GradingResult | null>(null);

const activeHomework = computed(
  () => homeworks.value.find((h) => h.homeworkId === activeHomeworkId.value) ?? null,
);

const answeredCount = computed(
  () => Object.values(answers.value).filter((v) => (v ?? '').trim()).length,
);

const canSubmit = computed(
  () => !!activeHomeworkId.value && !submitting.value && answeredCount.value > 0,
);

function statusBadge(status: number) {
  if (status === 2) return 'st-badge--success';
  if (status === 1) return 'st-badge--info';
  return 'st-badge--neutral';
}

function statusLabel(status: number) {
  if (status === 2) return '已批改';
  if (status === 1) return '待批改';
  return '未提交';
}

function openHomework(h: HomeworkItem) {
  activeHomeworkId.value = h.homeworkId;
  answers.value = {};
  questions.value = [];
  result.value = null;
  // 接口预留：GET /api/exam/homework/detail —— 作业题目列表后端未提供
}

function onAnswerInput(questionId: number, value: string) {
  answers.value[questionId] = value;
}

function saveDraft() {
  // 接口预留：后端未提供作业草稿接口
  ElMessage.info('作业草稿接口待接入');
}

async function submitHomework() {
  if (!canSubmit.value || !activeHomeworkId.value) return;
  submitting.value = true;
  // 接口预留：POST /api/exam/homework/submit
  //   { homeworkId: activeHomeworkId.value, answers: [{ questionId, answerContent }] }
  ElMessage.info('作业提交接口待接入');
  submitting.value = false;
}

function loadResult() {
  // 接口预留：GET /api/exam/grading/result/{homeworkId}
  ElMessage.info('批改结果接口待接入');
}
</script>

<template>
  <div class="st-view">
    <div class="detail-topbar">
      <button class="st-text-btn" @click="router.push('/student/dashboard')">
        <ArrowLeft :size="14" style="margin-right: 4px;" /> 返回仪表盘
      </button>
    </div>

    <header class="st-page-header">
      <h1 class="st-page-title">我的作业</h1>
      <p class="st-page-subtitle">课程作业作答与批改结果查看 · 智能批阅逐题给分与错因说明</p>
    </header>

    <div class="hw-grid">
      <!-- ========== 1. 作业列表 ========== -->
      <section class="st-card">
        <div class="st-card__header">
          <ClipboardList :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">作业列表</h2>
            <p class="st-card__hint">学生作业列表后端未提供，需后端补充</p>
          </div>
        </div>
        <div class="st-card__body" style="padding-top: 12px;">
          <div v-if="homeworks.length === 0" class="st-empty" style="padding: 36px 16px;">
            <ClipboardList :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
          <div v-else class="hw-list">
            <div
              v-for="h in homeworks"
              :key="h.homeworkId"
              class="hw-item"
              :class="{ 'hw-item--active': h.homeworkId === activeHomeworkId }"
              role="button"
              tabindex="0"
              @click="openHomework(h)"
              @keydown.enter="openHomework(h)"
            >
              <div class="hw-item__main">
                <div class="hw-item__title">{{ h.title }}</div>
                <div class="hw-item__meta">
                  <span class="st-badge" :class="statusBadge(h.status)">{{ statusLabel(h.status) }}</span>
                  <span class="hw-item__time"><Clock :size="11" style="vertical-align: -1px;" /> 截止 {{ h.deadline ?? '—' }}</span>
                </div>
              </div>
              <span class="st-badge st-badge--outline">{{ h.taskCategory }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ========== 2. 作答提交区 ========== -->
      <section class="st-card">
        <div class="st-card__header">
          <Send :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">作答提交</h2>
            <p class="st-card__hint">
              {{ activeHomework ? `${activeHomework.title} · 已作答 ${answeredCount} 题` : '请先在左侧选择作业' }}
            </p>
          </div>
          <button class="st-btn st-btn--secondary" style="margin-left: auto;" :disabled="!activeHomeworkId" @click="saveDraft">
            <Save :size="13" /> 存草稿
          </button>
        </div>
        <div class="st-card__body">
          <div v-if="questions.length === 0" class="st-empty" style="padding: 36px 16px;">
            <CircleAlert :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>

          <template v-else>
            <div v-for="(q, i) in questions" :key="q.questionId" class="answer-item">
              <div class="answer-item__stem">
                <span class="answer-no">{{ i + 1 }}</span>
                <span class="answer-item__text">{{ q.questionContent }}</span>
                <span class="st-badge st-badge--neutral">{{ q.fullScore }} 分</span>
              </div>
              <textarea
                class="answer-item__input"
                rows="4"
                placeholder="输入你的作答…"
                :value="answers[q.questionId] ?? ''"
                @input="onAnswerInput(q.questionId, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>

            <div class="submit-row">
              <button class="st-btn st-btn--primary" :disabled="!canSubmit" @click="submitHomework">
                <Send :size="13" /> 提交作业
              </button>
            </div>
          </template>
        </div>
      </section>

      <!-- ========== 3. 批改结果区 ========== -->
      <section class="st-card result-card">
        <div class="st-card__header">
          <CheckCheck :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">批改结果</h2>
            <p class="st-card__hint">接口预留：GET /api/exam/grading/result/{homeworkId}</p>
          </div>
          <button class="st-text-btn" style="margin-left: auto;" :disabled="!activeHomeworkId" @click="loadResult">
            刷新结果
          </button>
        </div>
        <div class="st-card__body">
          <template v-if="result">
            <div class="score-row">
              <div class="score-box">
                <div class="st-stat-value">{{ result.studentScore }}</div>
                <div class="st-stat-label">得分 / {{ result.totalScore }}</div>
              </div>
              <div class="score-box">
                <div class="st-stat-value">{{ result.status }}</div>
                <div class="st-stat-label">批阅状态</div>
              </div>
            </div>
            <div v-if="result.errorMessage" class="result-error">{{ result.errorMessage }}</div>

            <div v-for="d in result.scoreDetail" :key="d.questionId" class="detail-item">
              <div class="detail-item__head">
                <span class="detail-item__q">{{ d.questionContent }}</span>
                <span class="st-badge" :class="d.score >= d.fullScore ? 'st-badge--success' : 'st-badge--warning'">
                  {{ d.score }} / {{ d.fullScore }}
                </span>
              </div>
              <div class="detail-item__reason">{{ d.errorReason }}</div>
            </div>
          </template>

          <div v-else class="st-empty" style="padding: 36px 16px;">
            <CheckCheck :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">暂无数据，接口待接入</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-topbar {
  margin-bottom: 12px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.hw-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 20px;
  align-items: start;
}

.result-card {
  grid-column: 1 / -1;
}

@media (max-width: 1080px) {
  .hw-grid {
    grid-template-columns: 1fr;
  }
}

/* 作业列表 */
.hw-list {
  display: flex;
  flex-direction: column;
}

.hw-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition);
}

.hw-item:last-child {
  border-bottom: none;
}

.hw-item--active {
  background: var(--bg-subtle);
}

.hw-item__main {
  flex: 1;
  min-width: 0;
}

.hw-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.hw-item__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.hw-item__time {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 作答区 */
.answer-item {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.answer-item:last-of-type {
  border-bottom: none;
}

.answer-item__stem {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.answer-no {
  width: 22px;
  height: 22px;
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

.answer-item__text {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--text-primary);
  line-height: 1.65;
}

.answer-item__input {
  width: 100%;
  margin-top: 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.answer-item__input:focus {
  border-color: var(--border-strong);
}

.submit-row {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 批改结果 */
.score-row {
  display: flex;
  gap: 32px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.score-box {
  min-width: 120px;
}

.result-error {
  font-size: 12.5px;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 14px;
}

.detail-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.detail-item__q {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--text-primary);
  line-height: 1.6;
}

.detail-item__reason {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.65;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
</style>
