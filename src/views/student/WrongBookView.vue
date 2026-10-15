<script setup lang="ts">
/**
 * 错题智能管理 —— 当前为 UI 壳（只保留界面状态，不接 api / pinia）
 *
 * 接口预留：GET /api/exam/wrong-question/list              错题分页列表（章节 / 知识点筛选）
 * 接口预留：PUT /api/exam/wrong-question/mastered/{questionId} 标记错题已掌握
 * 章节下拉数据源：GET /api/knowledge/chapter/list（已实现，本视图尚未接入）
 * 薄弱知识点分析：由 GET /api/exam/wrong-question/list 聚合，后端暂无独立统计接口
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookMarked,
  CircleAlert,
  CircleCheck,
  CircleX,
  Filter,
  Redo2,
  Send,
  ShieldCheck,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

/** 错题视图模型（字段按 wrong-question/list 返回结构预留） */
interface WrongQuestionItem {
  id: number;
  questionId: number;
  chapterId: number | null;
  chapterTitle: string;
  questionTypeLabel: string;
  difficultyLabel: string;
  knowledgePoint: string;
  stem: string;
  studentAnswer: string;
  rightAnswer: string;
  analysis: string;
  redoCount: number;
  lastRedoCorrect: boolean | null;
  createTime: string | null;
}

const router = useRouter();

const filterChapter = ref<number | 'all'>('all');
const filterKnowledge = ref<string>('all');

/** 章节 / 知识点筛选项（接口预留，暂不取数） */
const chapters = ref<{ id: number; title: string }[]>([]);
const knowledgeOptions = ref<string[]>([]);

/** 错题列表（接口预留：GET /api/exam/wrong-question/list） */
const wrongQuestions = ref<WrongQuestionItem[]>([]);
const total = ref<number | null>(null);
/** 薄弱知识点（同上列表聚合，接口预留） */
const weakPoints = ref<{ knowledgePoint: string; count: number }[]>([]);

const redoState = ref<{ id: number | null; answer: string }>({ id: null, answer: '' });

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startRedo(w: WrongQuestionItem) {
  redoState.value = { id: w.id, answer: '' };
}

function submitRedo(w: WrongQuestionItem) {
  if (!redoState.value.answer.trim()) return;
  // 接口预留：重做作答提交后端未提供独立接口，需复用练习提交或补充错题重做接口
  ElMessage.info(`错题重做接口待接入（${w.questionId}）`);
  redoState.value = { id: null, answer: '' };
}

function markMastered(w: WrongQuestionItem) {
  // 接口预留：PUT /api/exam/wrong-question/mastered/{questionId}
  ElMessage.info(`标记已掌握接口待接入（${w.questionId}）`);
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">错题智能管理</h1>
      <p class="st-page-subtitle">刷题答错自动收录 · 支持错题重做与「已掌握」标记</p>
    </header>

    <!-- 薄弱知识点提示（接口预留：由错题列表聚合） -->
    <div class="st-card weak-card">
      <div class="st-card__header">
        <CircleAlert :size="15" class="weak-icon" />
        <div>
          <h2 class="st-card__title">薄弱知识点提示</h2>
          <p class="st-card__hint">按错题数量排序，点击标签可筛选对应错题</p>
        </div>
      </div>
      <div class="st-card__body">
        <div v-if="weakPoints.length === 0" class="st-empty" style="padding: 20px 16px;">
          <div class="st-empty__text">暂无数据，接口待接入</div>
        </div>
        <div v-else class="weak-list">
          <button
            v-for="w in weakPoints"
            :key="w.knowledgePoint"
            class="weak-tag"
            :class="{ 'weak-tag--active': filterKnowledge === w.knowledgePoint }"
            @click="filterKnowledge = filterKnowledge === w.knowledgePoint ? 'all' : w.knowledgePoint"
          >
            {{ w.knowledgePoint }}
            <span class="weak-tag__count">{{ w.count }} 错</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="st-card filter-card">
      <div class="st-card__body filter-row">
        <Filter :size="14" class="filter-icon" />
        <el-select v-model="filterChapter" style="width: 220px;" size="default">
          <el-option label="全部章节" value="all" />
          <el-option v-for="c in chapters" :key="c.id" :label="c.title" :value="c.id" />
        </el-select>
        <el-select v-model="filterKnowledge" style="width: 200px;" size="default">
          <el-option label="全部知识点" value="all" />
          <el-option v-for="k in knowledgeOptions" :key="k" :label="k" :value="k" />
        </el-select>
        <span class="filter-count">共 {{ total === null ? '—' : total }} 道错题</span>
      </div>
    </div>

    <!-- 错题列表（接口预留：GET /api/exam/wrong-question/list） -->
    <div v-if="wrongQuestions.length === 0" class="st-card">
      <div class="st-card__body st-empty" style="padding: 70px 16px;">
        <CircleCheck :size="42" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">暂无数据，接口待接入</div>
        <button class="st-btn st-btn--secondary" @click="router.push('/student/practice')">去刷题 →</button>
      </div>
    </div>

    <div v-else class="wrong-list">
      <div v-for="w in wrongQuestions" :key="w.id" class="st-card wrong-card">
        <div class="st-card__header" style="flex-wrap: wrap;">
          <span class="st-badge st-badge--neutral">{{ w.chapterTitle || '未关联章节' }}</span>
          <span class="st-badge st-badge--outline">{{ w.difficultyLabel }}</span>
          <span class="st-badge st-badge--neutral">{{ w.questionTypeLabel }}</span>
          <span class="st-badge st-badge--dark">{{ w.knowledgePoint }}</span>

          <div class="wrong-card__actions">
            <span v-if="w.redoCount > 0" class="st-badge" :class="w.lastRedoCorrect ? 'st-badge--success' : 'st-badge--danger'">
              重做 {{ w.redoCount }} 次 · {{ w.lastRedoCorrect ? '最近正确' : '最近仍错' }}
            </span>
            <button class="st-text-btn" @click="startRedo(w)"><Redo2 :size="12" style="margin-right: 2px;" /> 重做</button>
            <button class="st-text-btn" @click="markMastered(w)">
              <ShieldCheck :size="12" style="margin-right: 2px;" /> 已掌握
            </button>
          </div>
        </div>

        <div class="st-card__body">
          <div class="wrong-stem">{{ w.stem }}</div>

          <!-- 作答对比 -->
          <div class="answer-compare">
            <div class="answer-row answer-row--wrong">
              <CircleX :size="13" />
              <span class="answer-row__label">我的答案</span>
              <span class="answer-row__value">{{ w.studentAnswer || '（未作答）' }}</span>
            </div>
            <div class="answer-row answer-row--correct">
              <CircleCheck :size="13" />
              <span class="answer-row__label">正确答案</span>
              <span class="answer-row__value">{{ w.rightAnswer }}</span>
            </div>
          </div>

          <!-- 重做输入区 -->
          <div v-if="redoState.id === w.id" class="redo-box">
            <input
              v-model="redoState.answer"
              class="redo-input"
              placeholder="重新作答…"
              @keydown.enter="submitRedo(w)"
            />
            <button class="st-btn st-btn--primary" :disabled="!redoState.answer.trim()" @click="submitRedo(w)">
              <Send :size="12" /> 校验
            </button>
          </div>

          <!-- 教材解析 -->
          <div class="wrong-analysis">
            <div class="wrong-analysis__head"><BookMarked :size="12" /> 教材解析</div>
            <div class="wrong-analysis__text">{{ w.analysis }}</div>
          </div>

          <div class="wrong-meta">收录时间 {{ fmt(w.createTime) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weak-card {
  margin-bottom: 16px;
}

.weak-icon {
  color: var(--status-warning);
  flex-shrink: 0;
}

.weak-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.weak-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition);
}

.weak-tag:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.weak-tag--active {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: var(--bg-surface);
}

.weak-tag__count {
  font-size: 11px;
  opacity: 0.75;
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

.filter-icon {
  color: var(--text-tertiary);
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

.answer-row--correct {
  color: var(--status-success);
  background: var(--status-success-bg);
}

.answer-row__label {
  font-weight: 600;
  flex-shrink: 0;
}

.answer-row__value {
  font-weight: 500;
  word-break: break-all;
}

.redo-box {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.redo-input {
  flex: 1;
  height: 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.redo-input:focus {
  border-color: var(--border-strong);
}

.wrong-analysis {
  margin-top: 14px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}

.wrong-analysis__head {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.wrong-analysis__text {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.65;
}

.wrong-meta {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}
</style>
