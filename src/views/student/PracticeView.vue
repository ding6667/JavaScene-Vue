<script setup lang="ts">
/**
 * 分层刷题练习 —— 当前为 UI 壳（只保留界面状态，不接 api / pinia）
 *
 * 接口预留：GET  /api/exam/question/practice/list          练习题列表（按章节 / 难度 / 题型筛选）
 * 接口预留：GET  /api/exam/question/practice/detail/{id}    单题详情（题干、选项、答案、解析）
 * 接口预留：POST /api/study/practice/submit                提交作答并判分
 * 接口预留：POST /api/study/practice/draft                 保存作答草稿（中途退出续答）
 * 接口预留：GET  /api/study/practice/detail                回读练习记录（题量、正确率）
 * 章节下拉数据源：GET /api/knowledge/chapter/list（已实现，本视图尚未接入）
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  ArrowLeft,
  BookMarked,
  CircleCheck,
  CircleX,
  Dices,
  ListChecks,
  Save,
  Send,
  Swords,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

type PracticeMode = 'chapter' | 'random' | 'exam';

/** 题目视图模型（字段按 practice/detail 返回结构预留） */
interface PracticeQuestion {
  questionId: number;
  stem: string;
  questionType: string;
  difficulty: string;
  options: string[] | null;
  answer: string;
  analysis: string;
  knowledgePoint: string;
}

const route = useRoute();

const MODES: { key: PracticeMode; label: string; icon: unknown }[] = [
  { key: 'chapter', label: '章节专项', icon: ListChecks },
  { key: 'random', label: '随机刷题', icon: Dices },
  { key: 'exam', label: '模拟考试', icon: Swords },
];

/** 难度 UI 值，接入后映射为 difficultyConfigId */
const DIFFICULTY_OPTIONS = [
  { value: 'all', label: '全部难度' },
  { value: 'basic', label: '基础题（教材原题）' },
  { value: 'advanced', label: '进阶题（知识点延伸）' },
  { value: 'expert', label: '拔高题（综合应用）' },
];

/** 题型 UI 值，接入后映射为后端 questionType 编码 1~7 */
const QUESTION_TYPE_OPTIONS = [
  { value: 'all', label: '全部题型' },
  { value: '1', label: '单选题' },
  { value: '2', label: '多选题' },
  { value: '3', label: '判断题' },
  { value: '4', label: '填空题' },
  { value: '5', label: '简答题' },
  { value: '6', label: '编程题' },
  { value: '7', label: '阅读程序题' },
];

const mode = ref<PracticeMode>((route.query.mode as PracticeMode) || 'chapter');
const chapterId = ref<number | null>(route.params.chapterId ? Number(route.params.chapterId) : null);
const difficulty = ref<string>('all');
const questionType = ref<string>('all');
const num = ref(5);

/** 章节下拉（接口预留：GET /api/knowledge/chapter/list） */
const chapters = ref<{ id: number; title: string }[]>([]);

const started = ref(false);
/** 题目列表（接口预留：GET /api/exam/question/practice/list） */
const questions = ref<PracticeQuestion[]>([]);
const currentIndex = ref(0);
const answers = ref<Record<number, string>>({});
const revealed = ref<Record<number, boolean>>({});

const current = computed(() => questions.value[currentIndex.value] ?? null);
const currentAnswer = computed(() => (current.value ? answers.value[current.value.questionId] ?? '' : ''));
const isRevealed = computed(() => (current.value ? revealed.value[current.value.questionId] === true : false));

function start() {
  if (mode.value === 'chapter' && !chapterId.value) {
    ElMessage.warning('章节专项模式请先选择章节');
    return;
  }
  // 接口预留：GET /api/exam/question/practice/list —— 取数后填充 questions
  questions.value = [];
  currentIndex.value = 0;
  started.value = true;
  ElMessage.info('题目列表接口待接入');
}

function exit() {
  started.value = false;
}

function submitAnswer() {
  if (!current.value) return;
  // 接口预留：POST /api/study/practice/submit
  ElMessage.info('作答提交接口待接入');
}

function saveDraft() {
  // 接口预留：POST /api/study/practice/draft
  ElMessage.info('草稿保存接口待接入');
}

function selectOption(letter: string) {
  const q = current.value;
  if (!q || revealed.value[q.questionId]) return;
  answers.value[q.questionId] = letter;
}

function onAnswerInput(value: string) {
  const q = current.value;
  if (!q) return;
  answers.value[q.questionId] = value;
}

function nextQuestion() {
  if (currentIndex.value < questions.value.length - 1) currentIndex.value += 1;
}

function prevQuestion() {
  if (currentIndex.value > 0) currentIndex.value -= 1;
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">分层刷题练习</h1>
      <p class="st-page-subtitle">同步教材课后习题 · 基础 / 进阶 / 拔高三层难度 · 答错自动收录错题本</p>
    </header>

    <!-- ==================== 配置面板 ==================== -->
    <div v-if="!started" class="st-card">
      <div class="st-card__body">
        <!-- 模式滑块 -->
        <div class="st-seg" style="margin-bottom: 20px;">
          <div class="st-seg__slider" :style="{ left: `calc(${MODES.findIndex((m) => m.key === mode)} * 33.333% + 3px)`, width: 'calc(33.333% - 4px)' }"></div>
          <button
            v-for="m in MODES"
            :key="m.key"
            class="st-seg__option"
            :style="{ flex: 1 }"
            :class="{ 'st-seg__option--active': mode === m.key }"
            @click="mode = m.key"
          >
            <component :is="m.icon" :size="13" style="vertical-align: -2px; margin-right: 4px;" />
            {{ m.label }}
          </button>
        </div>

        <!-- 筛选条件 -->
        <div class="filter-grid">
          <div v-if="mode === 'chapter'" class="filter-item">
            <label class="filter-label">选择章节</label>
            <el-select v-model="chapterId" placeholder="请选择章节" style="width: 100%;">
              <el-option v-for="c in chapters" :key="c.id" :label="c.title" :value="c.id" />
            </el-select>
          </div>
          <div v-if="mode === 'random'" class="filter-item">
            <label class="filter-label">范围</label>
            <div class="filter-static">全书随机抽题</div>
          </div>
          <div v-if="mode === 'exam'" class="filter-item">
            <label class="filter-label">范围</label>
            <div class="filter-static">全书综合模拟卷（至少 10 题）</div>
          </div>
          <div class="filter-item">
            <label class="filter-label">难度</label>
            <el-select v-model="difficulty" style="width: 100%;">
              <el-option v-for="d in DIFFICULTY_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label">题型</label>
            <el-select v-model="questionType" style="width: 100%;">
              <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
          </div>
          <div class="filter-item">
            <label class="filter-label">题量</label>
            <el-input-number v-model="num" :min="3" :max="20" style="width: 100%;" />
          </div>
        </div>

        <p class="st-card__hint" style="margin-top: 14px;">
          题目数据源待接入：GET /api/exam/question/practice/list
        </p>

        <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
          <button class="st-btn st-btn--primary" @click="start">
            <ListChecks :size="14" />
            {{ mode === 'exam' ? '开始模拟考试' : '开始练习' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== 作答面板 ==================== -->
    <template v-else>
      <!-- 顶部进度 -->
      <div class="st-card practice-top">
        <div class="st-card__body practice-top__row">
          <button class="st-text-btn" @click="exit">
            <ArrowLeft :size="14" style="margin-right: 4px;" /> 退出练习
          </button>
          <div class="practice-top__meta">
            <span class="st-badge st-badge--outline">{{ MODES.find((m) => m.key === mode)?.label }}</span>
            <span class="st-badge st-badge--neutral">
              {{ DIFFICULTY_OPTIONS.find((d) => d.value === difficulty)?.label }}
            </span>
            <span class="st-badge st-badge--neutral">
              {{ QUESTION_TYPE_OPTIONS.find((t) => t.value === questionType)?.label }}
            </span>
          </div>
          <div class="practice-top__progress">
            <template v-if="questions.length">
              第 {{ currentIndex + 1 }} / {{ questions.length }} 题
            </template>
            <template v-else>— / — 题</template>
          </div>
        </div>
        <div class="st-progress" style="border-radius: 0;">
          <div
            class="st-progress__bar"
            :style="{ width: questions.length ? ((currentIndex + 1) / questions.length) * 100 + '%' : '0%' }"
          ></div>
        </div>
      </div>

      <!-- 题目卡 -->
      <div class="st-card question-card">
        <div class="st-card__body">
          <template v-if="current">
            <div class="question-stem">
              <span class="question-no">{{ currentIndex + 1 }}</span>
              <div class="question-stem__text">{{ current.stem }}</div>
            </div>

            <!-- 选项 -->
            <div v-if="current.options" class="options">
              <button
                v-for="opt in current.options"
                :key="opt"
                class="option-item"
                :class="{ 'option-item--selected': currentAnswer === opt.slice(0, 1) }"
                :disabled="isRevealed"
                @click="selectOption(opt.slice(0, 1))"
              >
                {{ opt }}
              </button>
            </div>

            <!-- 主观题输入（填空 / 编程 / 阅读题） -->
            <div v-else class="text-answer">
              <textarea
                :value="currentAnswer"
                class="text-answer__input"
                :disabled="isRevealed"
                rows="6"
                placeholder="输入你的答案…"
                @input="onAnswerInput(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>

            <!-- 提交 / 草稿 -->
            <div class="question-actions">
              <button class="st-btn st-btn--secondary" @click="saveDraft">
                <Save :size="13" /> 保存草稿
              </button>
              <button class="st-btn st-btn--primary" :disabled="!currentAnswer.trim()" @click="submitAnswer">
                <Send :size="13" /> 提交答案
              </button>
            </div>

            <!-- 判分与解析（提交后展示） -->
            <div v-if="isRevealed" class="analysis-box">
              <div class="analysis-verdict analysis-verdict--bad">
                <CircleX v-if="current.answer" :size="16" />
                <CircleCheck v-else :size="16" />
                判分结果待接入
                <span class="analysis-verdict__answer">正确答案：{{ current.answer || '—' }}</span>
              </div>
              <div class="analysis-body">
                <div class="analysis-body__head"><BookMarked :size="13" /> 教材级解析 · {{ current.knowledgePoint }}</div>
                <div class="analysis-body__text">{{ current.analysis }}</div>
              </div>
              <div class="question-actions">
                <button v-if="currentIndex > 0" class="st-btn st-btn--secondary" @click="prevQuestion">上一题</button>
                <button v-if="currentIndex < questions.length - 1" class="st-btn st-btn--primary" @click="nextQuestion">下一题</button>
              </div>
            </div>
          </template>

          <!-- 无题目时的卡片骨架 -->
          <template v-else>
            <div class="skeleton-head">
              <span class="question-no question-no--skeleton">?</span>
              <div class="skeleton-lines">
                <span class="skeleton-line" style="width: 78%;"></span>
                <span class="skeleton-line" style="width: 54%;"></span>
              </div>
            </div>
            <div class="skeleton-options">
              <span v-for="i in 4" :key="i" class="skeleton-option"></span>
            </div>
            <div class="st-empty" style="padding: 28px 16px;">
              <ListChecks :size="34" :stroke-width="1.2" class="st-empty__icon" />
              <div class="st-empty__text">暂无数据，接口待接入</div>
            </div>
            <div class="question-actions">
              <button class="st-btn st-btn--primary" disabled>
                <Send :size="13" /> 提交答案
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.filter-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 768px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}

.filter-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.filter-static {
  font-size: 13px;
  color: var(--text-tertiary);
  padding: 8px 0;
}

/* ==================== 作答区 ==================== */
.practice-top {
  margin-bottom: 16px;
}

.practice-top__row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 14px;
  padding-bottom: 14px;
}

.practice-top__meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.practice-top__progress {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.question-card {
  margin-top: 16px;
}

.question-stem {
  display: flex;
  gap: 14px;
}

.question-no {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--text-primary);
  color: var(--bg-surface);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.question-stem__text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 18px 0 0 42px;
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

.option-item:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.option-item--selected {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
  font-weight: 500;
}

.text-answer {
  margin: 18px 0 0 42px;
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

.question-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* 解析 */
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
}

.analysis-verdict--ok { color: var(--status-success); }
.analysis-verdict--bad { color: var(--text-secondary); }

.analysis-verdict__answer {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 8px;
}

.analysis-body {
  margin-top: 12px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.analysis-body__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.analysis-body__text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.7;
}

/* 骨架屏（仅使用既有 CSS 变量） */
.skeleton-head {
  display: flex;
  gap: 14px;
}

.question-no--skeleton {
  background: var(--bg-muted);
  color: var(--text-tertiary);
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.skeleton-line {
  height: 12px;
  background: var(--bg-muted);
  border-radius: 999px;
}

.skeleton-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 18px 0 0 42px;
}

.skeleton-option {
  height: 38px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}
</style>
