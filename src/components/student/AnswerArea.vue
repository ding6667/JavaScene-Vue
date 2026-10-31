<script setup lang="ts">
/**
 * 作答区（按题型渲染输入控件）—— 刷题详情页与作业作答页共用。
 *
 * 对外只有一个 v-model：**规范的答案字符串**，与后端判分口径一致：
 *   - 选择题：选项字母，多选按字母升序逗号拼接（"A" / "A,C"）
 *   - 填空题：各空答案用 "|" 拼接，顺序与题干一致
 *   - 判断题："true" / "false"
 *   - 程序阅读 / 简答：原文
 *   - 编程题：源码
 *
 * 渲染依据只认 renderConfig（选择题 choiceMode、填空题 blankCount），
 * 缺失时兜底为单选 / 1 空，不按答案个数或题干下划线猜。
 *
 * 代码运行与智能纠错是可选项：只有传了 runQuestionId（题库题目 ID）才显示，
 * 作业题目的快照 ID 不属于题库，跑不了这两项。
 */
import { computed, ref, watch } from 'vue';
import {
  Bug,
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import CodeEditor from '@/components/student/CodeEditor.vue';
import { debugCode, runCode } from '@/api/study';
import type { AnswerAreaQuestion } from '@/types/exam';
import type { CodeRunResult } from '@/types/study';

const props = withDefaults(
  defineProps<{
    question: AnswerAreaQuestion;
    modelValue: string;
    /** 是否显示「运行代码 / 智能纠错」，需要 runQuestionId 才生效 */
    showCodeTools?: boolean;
    /** 题库题目 ID：运行与纠错都按它调后端 */
    runQuestionId?: number | null;
    chapterId?: number;
    editorHeight?: string;
    /** 代码区下方的一句话说明 */
    codeTip?: string;
  }>(),
  {
    showCodeTools: false,
    runQuestionId: null,
    chapterId: undefined,
    editorHeight: '440px',
    codeTip: '代码可直接运行或交给智能纠错分析；正式分数以「提交」的判题结果为准。',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type AnswerKind = 'choice' | 'fill' | 'judge' | 'text' | 'code';

const kind = computed<AnswerKind>(() => {
  const t = Number(props.question.type);
  if (t === 1) return 'choice';
  if (t === 2) return 'fill';
  if (t === 3) return 'judge';
  if (t === 5) return 'code';
  return 'text';
});

/** 多选只看 choiceMode，不按答案个数猜 */
const isMultiple = computed(() => props.question.renderConfig?.choiceMode === 'multiple');

/** 填空空数只看 blankCount，兜底 1 空 */
const blankTotal = computed(() => {
  const n = Number(props.question.renderConfig?.blankCount);
  return Number.isFinite(n) && n > 0 ? n : 1;
});

const optionList = computed(() => (props.question.options ?? []).map((o) => String(o ?? '')));

function optionKey(index: number): string {
  const custom = props.question.optionKeys?.[index];
  return (custom && String(custom).trim()) || LETTERS[index] || '';
}

function stripOptionPrefix(raw: string): string {
  return raw.replace(/^\s*[A-Za-z]\s*[.、)．）:：]\s*/, '');
}

function optionText(index: number): string {
  return `${optionKey(index)}. ${stripOptionPrefix(optionList.value[index] ?? '')}`;
}

// ==================== 作答状态 ====================
const selected = ref<string[]>([]);
const blanks = ref<string[]>(['']);
const judge = ref<'' | 'true' | 'false'>('');
const text = ref('');
const code = ref('');

function buildAnswer(): string {
  switch (kind.value) {
    case 'choice':
      return [...selected.value].sort().join(',');
    case 'fill':
      return blanks.value.map((v) => v.trim()).join('|');
    case 'judge':
      return judge.value;
    case 'code':
      return code.value;
    default:
      return text.value;
  }
}

/** 回填：兼容「字母」「选项原文」「多空 | 分隔」「true/false」等历史形态 */
function applyValue(raw: string) {
  const value = String(raw ?? '').trim();
  const options = optionList.value;
  selected.value = [];
  blanks.value = Array.from({ length: blankTotal.value }, (_, i) => blanks.value[i] ?? '');
  judge.value = '';
  text.value = '';
  code.value = props.question.codeFramework ?? '';
  if (!value) return;

  const t = Number(props.question.type);
  if (t === 1) {
    const parts = value.split(/[,，|、\s]+/).map((s) => s.trim()).filter(Boolean);
    const letters: string[] = [];
    for (const part of parts) {
      const matchedIndex = options.findIndex(
        (o) => o === part || stripOptionPrefix(o) === part,
      );
      if (matchedIndex >= 0) {
        letters.push(optionKey(matchedIndex));
        continue;
      }
      const upper = part.toUpperCase();
      const index = LETTERS.indexOf(upper);
      if (upper.length === 1 && index >= 0 && index < Math.max(options.length, 1)) {
        letters.push(upper);
      }
    }
    selected.value = [...new Set(letters)];
  } else if (t === 2) {
    const parts = value.split(/[|;；\n]/).map((s) => s.trim());
    blanks.value = Array.from({ length: blankTotal.value }, (_, i) => parts[i] ?? '');
  } else if (t === 3) {
    if (/^(true|1|对|正确|t|yes)$/i.test(value)) judge.value = 'true';
    else if (/^(false|0|错|错误|f|no)$/i.test(value)) judge.value = 'false';
  } else if (t === 5) {
    code.value = value || (props.question.codeFramework ?? '');
  } else {
    text.value = value;
  }
}

function commit() {
  const value = buildAnswer();
  emit('update:modelValue', value);
  emit('change', value);
}

applyValue(props.modelValue);

// 外部值变化（页面重置、切题）时重新回填；自己 emit 出去的值原样跳过，避免来回覆盖
watch(
  () => props.modelValue,
  (value) => {
    if (String(value ?? '') !== buildAnswer()) applyValue(String(value ?? ''));
  },
);

watch(
  () => [props.question.id, props.question.type] as const,
  () => applyValue(props.modelValue),
);

watch(blankTotal, (n) => {
  blanks.value = Array.from({ length: n }, (_, i) => blanks.value[i] ?? '');
});

// ==================== 交互 ====================
function toggleChoice(key: string) {
  if (isMultiple.value) {
    const set = new Set(selected.value);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    selected.value = [...set];
  } else {
    selected.value = [key];
  }
  commit();
}

function onBlankInput(index: number, e: Event) {
  const next = [...blanks.value];
  next[index] = (e.target as HTMLInputElement).value;
  blanks.value = next;
  commit();
}

function onTextInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value;
  commit();
}

function pickJudge(value: 'true' | 'false') {
  judge.value = value;
  commit();
}

function onCodeInput(value: string) {
  code.value = value;
  commit();
}

// ==================== 代码运行 / 智能纠错（可选） ====================
const toolsEnabled = computed(
  () => props.showCodeTools && Number(props.runQuestionId) > 0 && kind.value === 'code',
);

const running = ref(false);
const debugging = ref(false);
const runResult = ref<CodeRunResult | null>(null);
const aiResult = ref<CodeRunResult | null>(null);

const RUN_STATUS_META: Record<string, { label: string; badge: string }> = {
  AC: { label: '通过', badge: 'st-badge--success' },
  WA: { label: '答案错误', badge: 'st-badge--danger' },
  TLE: { label: '运行超时', badge: 'st-badge--warning' },
  MLE: { label: '内存超限', badge: 'st-badge--warning' },
  RE: { label: '运行异常', badge: 'st-badge--danger' },
  CE: { label: '编译错误', badge: 'st-badge--danger' },
  OLE: { label: '输出超限', badge: 'st-badge--warning' },
  SV: { label: '安全违规', badge: 'st-badge--danger' },
  SE: { label: '系统错误', badge: 'st-badge--danger' },
};

const runMeta = computed(() =>
  runResult.value
    ? RUN_STATUS_META[runResult.value.status] ?? {
        label: runResult.value.status,
        badge: 'st-badge--neutral',
      }
    : undefined,
);

/** 错误行（供 CodeEditor 标红） */
const errorLines = computed<number[]>(() => {
  const r = runResult.value;
  if (!r) return [];
  const raw: unknown[] = [r.errorLine, ...(r.errorLineList ?? [])];
  const lines = new Set<number>();
  for (const v of raw) {
    const n = Number.parseInt(String(v).replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) lines.add(n);
  }
  return [...lines].sort((a, b) => a - b);
});

function codeRequest() {
  return {
    codeContent: code.value,
    questionId: Number(props.runQuestionId),
    chapterId: props.chapterId,
  };
}

async function handleRun() {
  if (!code.value.trim() || running.value) return;
  running.value = true;
  runResult.value = null;
  try {
    runResult.value = await runCode(codeRequest());
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    running.value = false;
  }
}

/** 智能纠错：与运行不同，不论成败都让调试智能体给出错因 / 优化建议 / 参考思路 */
async function handleDebug() {
  if (!code.value.trim() || debugging.value) return;
  debugging.value = true;
  aiResult.value = null;
  try {
    aiResult.value = await debugCode(codeRequest());
    if (!aiResult.value) ElMessage.warning('智能纠错暂未返回内容，请稍后重试');
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    debugging.value = false;
  }
}

function resetToFramework() {
  code.value = props.question.codeFramework ?? '';
  runResult.value = null;
  aiResult.value = null;
  commit();
}
</script>

<template>
  <div class="answer-area">
    <!-- 选择题 -->
    <div v-if="kind === 'choice'" class="answer-zone">
      <div class="block-head">
        选择答案
        <span class="zone-tip">{{ isMultiple ? '可多选，提交时按字母拼接（如 A,C）' : '单选' }}</span>
      </div>
      <div class="options">
        <button
          v-for="(_, i) in optionList"
          :key="i"
          type="button"
          class="option-item"
          :class="{ 'option-item--selected': selected.includes(optionKey(i)) }"
          @click="toggleChoice(optionKey(i))"
        >
          <span class="option-item__mark" :class="{ 'option-item__mark--multi': isMultiple }">
            {{ selected.includes(optionKey(i)) ? '✓' : '' }}
          </span>
          <span>{{ optionText(i) }}</span>
        </button>
      </div>
    </div>

    <!-- 填空题 -->
    <div v-else-if="kind === 'fill'" class="answer-zone">
      <div class="block-head">
        填写答案
        <span class="zone-tip">共 {{ blankTotal }} 空，按题干顺序填写</span>
      </div>
      <div class="blanks">
        <label v-for="(_, i) in blanks" :key="i" class="blank-item">
          <span class="blank-item__label">第 {{ i + 1 }} 空</span>
          <input
            class="blank-item__input"
            :value="blanks[i]"
            type="text"
            :placeholder="`输入第 ${i + 1} 空答案`"
            @input="onBlankInput(i, $event)"
          />
        </label>
      </div>
    </div>

    <!-- 判断题 -->
    <div v-else-if="kind === 'judge'" class="answer-zone">
      <div class="block-head">判断对错</div>
      <div class="judge-row">
        <button
          type="button"
          class="judge-btn"
          :class="{ 'judge-btn--active': judge === 'true' }"
          @click="pickJudge('true')"
        >
          <CircleCheck :size="16" /> 正确
        </button>
        <button
          type="button"
          class="judge-btn judge-btn--bad"
          :class="{ 'judge-btn--active': judge === 'false' }"
          @click="pickJudge('false')"
        >
          <CircleX :size="16" /> 错误
        </button>
      </div>
    </div>

    <!-- 程序阅读 / 简答 -->
    <div v-else-if="kind === 'text'" class="answer-zone">
      <div class="block-head">
        {{ Number(question.type) === 4 ? '写出程序输出' : '作答内容' }}
        <span class="zone-tip">按题目要求作答，提交后自动判分</span>
      </div>
      <textarea
        :value="text"
        class="text-answer__input"
        rows="10"
        placeholder="输入你的答案…"
        @input="onTextInput"
      ></textarea>
    </div>

    <!-- 编程题 -->
    <div v-else class="answer-zone">
      <div class="block-head">
        Java 代码作答
        <span class="zone-tip">
          <button type="button" class="st-text-btn" @click="resetToFramework">
            <RotateCcw :size="11" style="margin-right: 2px;" /> 重置为框架代码
          </button>
        </span>
      </div>

      <div v-if="toolsEnabled" class="code-toolbar">
        <button class="st-btn st-btn--secondary" :disabled="running || !code.trim()" @click="handleRun">
          <Loader2 v-if="running" :size="14" class="spin" />
          <Play v-else :size="13" />
          {{ running ? '运行中…' : '运行代码' }}
        </button>
        <button class="st-btn st-btn--secondary" :disabled="debugging || !code.trim()" @click="handleDebug">
          <Loader2 v-if="debugging" :size="14" class="spin" />
          <Bug v-else :size="13" />
          {{ debugging ? '分析中…' : '智能纠错' }}
        </button>
        <span v-if="runResult" class="st-badge" :class="runMeta?.badge">
          {{ runMeta?.label }}<template v-if="runResult.statusDesc"> · {{ runResult.statusDesc }}</template>
        </span>
        <span v-if="runResult?.totalCount" class="code-metric">
          <Timer :size="12" /> {{ runResult.passedCount }}/{{ runResult.totalCount }} 用例
          · {{ runResult.runDuration }} ms · {{ runResult.memoryUsed }} KB
        </span>
      </div>

      <CodeEditor
        :model-value="code"
        :error-lines="errorLines"
        :height="editorHeight"
        @update:model-value="onCodeInput"
      />

      <!-- 运行输出 -->
      <div v-if="runResult" class="run-panel">
        <div v-if="runResult.output" class="detail-block">
          <div class="block-head">运行输出</div>
          <pre class="code-panel st-code">{{ runResult.output }}</pre>
        </div>
        <div v-if="runResult.errorMsg" class="detail-block">
          <div class="block-head">
            <CircleAlert :size="13" /> 错误信息<template v-if="runResult.errorLine"> · 第 {{ runResult.errorLine }} 行</template>
          </div>
          <pre class="code-panel code-panel--error st-code">{{ runResult.errorMsg }}</pre>
        </div>
      </div>

      <!-- 智能纠错结果 -->
      <div v-if="aiResult" class="ai-panel">
        <div class="ai-panel__head">
          <Sparkles :size="14" /> 智能纠错
          <span v-if="aiResult.status" class="st-badge st-badge--neutral">
            {{ RUN_STATUS_META[aiResult.status]?.label ?? aiResult.status }}
          </span>
        </div>
        <div v-if="aiResult.errorReason" class="detail-block">
          <div class="block-head">问题定位</div>
          <p class="detail-text">{{ aiResult.errorReason }}</p>
        </div>
        <div v-if="aiResult.optimizeSuggest" class="detail-block">
          <div class="block-head">优化建议</div>
          <p class="detail-text">{{ aiResult.optimizeSuggest }}</p>
        </div>
        <div v-if="aiResult.standardIdea" class="detail-block">
          <div class="block-head">参考思路</div>
          <p class="detail-text">{{ aiResult.standardIdea }}</p>
        </div>
        <div v-if="aiResult.encouragement" class="ai-panel__foot">{{ aiResult.encouragement }}</div>
      </div>

      <p class="attempt-tip">{{ codeTip }}</p>
    </div>
  </div>
</template>

<style scoped>
.answer-zone {
  padding-bottom: 4px;
}

.answer-zone + .answer-zone {
  margin-top: 16px;
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

.zone-tip {
  margin-left: auto;
  font-weight: 400;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 选项 */
.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface, #fff);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}

.option-item:hover {
  border-color: var(--border-strong, rgba(87, 83, 78, 0.35));
}

.option-item--selected {
  border-color: var(--accent, #1f2937);
  background: var(--bg-subtle);
  box-shadow: inset 0 0 0 1px var(--accent, #1f2937);
}

.option-item__mark {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-default);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: #fff;
  background: transparent;
  margin-top: 1px;
}

.option-item__mark--multi {
  border-radius: 5px;
}

.option-item--selected .option-item__mark {
  background: var(--accent, #1f2937);
  border-color: var(--accent, #1f2937);
}

/* 填空 */
.blanks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.blank-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.blank-item__label {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.blank-item__input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface, #fff);
  outline: none;
}

.blank-item__input:focus {
  border-color: var(--accent, #1f2937);
}

/* 判断 */
.judge-row {
  display: flex;
  gap: 12px;
}

.judge-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface, #fff);
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.judge-btn--active {
  border-color: var(--status-success);
  color: var(--status-success);
  background: var(--status-success-bg, #f0fdf4);
}

.judge-btn--bad.judge-btn--active {
  border-color: var(--status-danger);
  color: var(--status-danger);
  background: var(--status-danger-bg);
}

/* 文本 */
.text-answer__input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  background: var(--bg-surface, #fff);
  outline: none;
  resize: vertical;
}

.text-answer__input:focus {
  border-color: var(--accent, #1f2937);
}

/* 代码 */
.code-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.code-metric {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.run-panel,
.ai-panel {
  margin-top: 14px;
}

.ai-panel {
  padding: 14px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.ai-panel__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.ai-panel__foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-subtle);
  font-size: 12px;
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

.attempt-tip {
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
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
