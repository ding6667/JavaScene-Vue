<script setup lang="ts">
/**
 * 错题智能管理（数据流已接入）
 *
 * 已对接：@/api/exam.fetchWrongQuestions          GET /api/exam/wrong-question/list（返回数组，不分页）
 * 已对接：@/api/exam.markWrongQuestionMastered    PUT /api/exam/wrong-question/mastered/{questionId}
 *
 * 说明：
 * 1. 后端该接口直接返回数组，无分页与总数，因此统计（总数 / 未掌握）在本页对数组做聚合。
 * 2. WrongQuestionItem 只有 content / type / difficulty / wrongCount / lastAnswer / mastered / lastWrongTime，
 *    没有正确答案、解析、知识点与章节名，所以本页不渲染这些字段（薄弱知识点标签同样不做，避免编数据）。
 * 3. 题型 / 难度后端只给码值，中文标签在本页映射表维护，码值语义待与后端确认。
 * 4. 「重做」跳转到刷题页并带上 questionId：/student/practice?questionId=xxx。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  ListChecks,
  Loader2,
  Redo2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchWrongQuestions, markWrongQuestionMastered } from '@/api/exam';
import type { WrongQuestionItem } from '@/types/exam';

/** 题型码值 → 中文标签（与后端 QuestionTypeEnum 一致） */
const TYPE_LABELS: Record<number, string> = {
  1: '选择题',
  2: '填空题',
  3: '判断题',
  4: '程序阅读题',
  5: '编程题',
  6: '简答题',
};

/** 难度码值 → 中文标签（与后端 QuestionDifficultyEnum 一致） */
const DIFFICULTY_LABELS: Record<number, string> = {
  1: '基础',
  2: '进阶',
  3: '拔高',
};

const router = useRouter();

const all = ref<WrongQuestionItem[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

/** 仅看未掌握（mastered === 0） */
const onlyUnmastered = ref(false);

/** 正在提交「标记已掌握」的 questionId，用于按钮禁用与 loading */
const masteringId = ref<number | null>(null);

function describeError(apiPath: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return /未实现/.test(msg) ? `接口待实现：${apiPath}` : `接口调用失败：${apiPath}（${msg}）`;
}

function typeLabel(v: number): string {
  return TYPE_LABELS[Number(v)] ?? `题型 ${v ?? '—'}`;
}

function difficultyLabel(v: number): string {
  return DIFFICULTY_LABELS[Number(v)] ?? `难度 ${v ?? '—'}`;
}

function isMastered(w: WrongQuestionItem): boolean {
  return Number(w.mastered) === 1;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const visible = computed(() =>
  onlyUnmastered.value ? all.value.filter((w) => !isMastered(w)) : all.value,
);

const unmasteredCount = computed(() => all.value.filter((w) => !isMastered(w)).length);
const masteredCount = computed(() => all.value.length - unmasteredCount.value);

/** 按错误次数降序，便于先看高频错题 */
const sorted = computed(() =>
  [...visible.value].sort((a, b) => Number(b.wrongCount ?? 0) - Number(a.wrongCount ?? 0)),
);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const list = await fetchWrongQuestions();
    all.value = Array.isArray(list) ? list : [];
  } catch (e) {
    all.value = [];
    loadError.value = describeError('@/api/exam.fetchWrongQuestions', e);
  } finally {
    loading.value = false;
  }
}

/** 标记已掌握：先本地置位回显，再重新拉取列表校正 */
async function markMastered(w: WrongQuestionItem) {
  if (masteringId.value !== null) return;
  masteringId.value = w.questionId;
  try {
    await markWrongQuestionMastered(w.questionId);
    w.mastered = 1;
    ElMessage.success('已标记为掌握，正在与后端核对');
    await load();
  } catch (e) {
    ElMessage.error(describeError('@/api/exam.markWrongQuestionMastered', e));
  } finally {
    masteringId.value = null;
  }
}

function redo(w: WrongQuestionItem) {
  router.push({ path: '/student/practice', query: { questionId: w.questionId } });
}

onMounted(load);
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">错题智能管理</h1>
      <p class="st-page-subtitle">刷题答错由后端自动收录 · 支持重做与「已掌握」标记</p>
    </header>

    <!-- 概览与数据口径说明 -->
    <div class="st-card weak-card">
      <div class="st-card__header">
        <CircleAlert :size="15" class="warn-icon" />
        <div>
          <h2 class="st-card__title">错题概览</h2>
          <p class="st-card__hint">
            已对接 @/api/exam.fetchWrongQuestions · 后端返回数组（无分页、无总数字段），统计由本页聚合
          </p>
        </div>
      </div>
      <div class="st-card__body">
        <div class="stat-row">
          <div>
            <div class="st-stat-value">{{ loading || loadError ? '—' : all.length }}</div>
            <div class="st-stat-label">错题总数</div>
          </div>
          <div>
            <div class="st-stat-value">{{ loading || loadError ? '—' : unmasteredCount }}</div>
            <div class="st-stat-label">未掌握</div>
          </div>
          <div>
            <div class="st-stat-value">{{ loading || loadError ? '—' : masteredCount }}</div>
            <div class="st-stat-label">已掌握</div>
          </div>
        </div>
        <p class="scope-note">
          后端 wrong-question/list 只下发 content / type / difficulty / wrongCount / lastAnswer / mastered / lastWrongTime，
          未提供正确答案、解析与知识点维度，因此本页不做薄弱知识点标签，也不展示正确答案。
        </p>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="st-card filter-card">
      <div class="st-card__body filter-row">
        <el-switch v-model="onlyUnmastered" active-text="仅看未掌握" />
        <span class="filter-count">当前显示 {{ sorted.length }} 条</span>
        <button class="st-btn st-btn--secondary" :disabled="loading" @click="load">
          <Loader2 v-if="loading" :size="14" class="spin" />
          <RotateCcw v-else :size="13" />
          重新加载
        </button>
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="st-card">
      <div class="st-card__body st-empty" style="padding: 60px 16px;">
        <Loader2 :size="32" :stroke-width="1.4" class="st-empty__icon spin" />
        <div class="st-empty__text">错题本加载中…</div>
      </div>
    </div>

    <div v-else-if="loadError" class="st-card">
      <div class="st-card__body st-empty" style="padding: 60px 16px;">
        <CircleAlert :size="34" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">{{ loadError }}</div>
        <button class="st-btn st-btn--secondary" @click="load">重新加载</button>
      </div>
    </div>

    <div v-else-if="sorted.length === 0" class="st-card">
      <div class="st-card__body st-empty" style="padding: 60px 16px;">
        <CircleCheck :size="38" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">{{ onlyUnmastered ? '没有未掌握的错题' : '错题本为空' }}</div>
        <button class="st-btn st-btn--secondary" @click="router.push('/student/practice')">去刷题 →</button>
      </div>
    </div>

    <div v-else class="wrong-list">
      <div v-for="w in sorted" :key="w.id ?? w.questionId" class="st-card wrong-card">
        <div class="st-card__header" style="flex-wrap: wrap;">
          <span class="st-badge st-badge--outline">{{ typeLabel(w.type) }}</span>
          <span class="st-badge st-badge--neutral">{{ difficultyLabel(w.difficulty) }}</span>
          <span class="st-badge" :class="Number(w.wrongCount) > 1 ? 'st-badge--danger' : 'st-badge--neutral'">
            错 {{ w.wrongCount ?? '—' }} 次
          </span>
          <span class="st-badge" :class="isMastered(w) ? 'st-badge--success' : 'st-badge--warning'">
            {{ isMastered(w) ? '已掌握' : '未掌握' }}
          </span>

          <div class="wrong-card__actions">
            <button class="st-text-btn" @click="redo(w)">
              <Redo2 :size="12" style="margin-right: 2px;" /> 重做
            </button>
            <button
              class="st-text-btn"
              :disabled="isMastered(w) || masteringId !== null"
              @click="markMastered(w)"
            >
              <Loader2 v-if="masteringId === w.questionId" :size="12" class="spin" style="margin-right: 2px;" />
              <ShieldCheck v-else :size="12" style="margin-right: 2px;" />
              {{ masteringId === w.questionId ? '提交中' : '标记已掌握' }}
            </button>
          </div>
        </div>

        <div class="st-card__body">
          <div class="wrong-stem">{{ w.content || '—' }}</div>

          <div class="answer-compare">
            <div class="answer-row answer-row--wrong">
              <CircleX :size="13" />
              <span class="answer-row__label">上次作答</span>
              <span class="answer-row__value">{{ w.lastAnswer || '（未作答）' }}</span>
            </div>
            <div class="answer-row answer-row--meta">
              <ListChecks :size="13" />
              <span class="answer-row__label">questionId</span>
              <span class="answer-row__value">{{ w.questionId ?? '—' }}</span>
            </div>
          </div>

          <div class="wrong-meta">最近错误时间 {{ fmt(w.lastWrongTime) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.warn-icon {
  color: var(--status-warning);
  flex-shrink: 0;
}

.weak-card {
  margin-bottom: 16px;
}

.stat-row {
  display: flex;
  gap: 40px;
  flex-wrap: wrap;
}

.scope-note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 8px 12px;
}

.filter-card {
  margin-bottom: 16px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 14px;
  padding-bottom: 14px;
}

.filter-count {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* 错题卡片 */
.wrong-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wrong-card__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wrong-stem {
  font-size: 13.5px;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
}

.answer-compare {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
}

.answer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.answer-row--wrong {
  color: var(--status-danger);
  background: var(--status-danger-bg);
}

.answer-row--meta {
  color: var(--text-secondary);
  background: var(--bg-subtle);
}

.answer-row__label {
  font-weight: 600;
  flex-shrink: 0;
}

.answer-row__value {
  font-weight: 500;
  word-break: break-all;
}

.wrong-meta {
  margin-top: 12px;
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
