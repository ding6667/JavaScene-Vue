<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CircleAlert, CircleCheck, Loader2, Play, RotateCcw, Bug } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapter, fetchChapters, runCode } from '@/api/student';
import CodeEditor from '@/components/student/CodeEditor.vue';
import type { Chapter, CodeRunResult, RunStatus } from '@/types/student';

const route = useRoute();
const router = useRouter();

const chapterId = ref<number | null>(route.query.chapterId ? Number(route.query.chapterId) : null);
const chapters = ref<Chapter[]>([]);
/**
 * 章节案例代码。
 * 接口预留：GET /api/knowledge/content/list（后端已提供，前端待接入）
 */
const cases = ref<{ caseId: string; caseName: string; codeContent: string }[]>([]);
const code = ref('');
const running = ref(false);
const runResult = ref<CodeRunResult | null>(null);

const DEFAULT_CODE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Java!");

        // 试着写点自己的代码吧
        for (int i = 1; i <= 5; i++) {
            System.out.println("第" + i + "次循环");
        }
    }
}`;

/** 力扣式判题状态 → 中文徽章（映射表按后端 openapi 的 status 取值） */
const RUN_STATUS_META: Record<RunStatus, { label: string; badge: string }> = {
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

const statusMeta = computed(() =>
  runResult.value ? RUN_STATUS_META[runResult.value.status] : undefined,
);

/** AC 视为通过，其余状态展示错误面板 */
const isPassed = computed(() => runResult.value?.status === 'AC');

const badgeClass = computed(() => statusMeta.value?.badge ?? 'st-badge--neutral');
const badgeLabel = computed(
  () => `${statusMeta.value?.label ?? runResult.value?.status ?? ''}${runResult.value?.statusDesc ? ` · ${runResult.value.statusDesc}` : ''}`,
);

/** CodeEditor 需要 1-based 数字行号，后端 errorLineList 为字符串数组，这里统一解析 */
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

onMounted(async () => {
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 错误已由响应拦截器统一提示
  }
  if (chapterId.value) await loadChapterCases();
  if (!code.value) code.value = DEFAULT_CODE;
});

async function loadChapterCases() {
  if (!chapterId.value) {
    cases.value = [];
    return;
  }
  // 先确认真实章节存在（GET /api/knowledge/chapter/list 缓存命中则不发请求）
  const ch = await fetchChapter(chapterId.value);
  if (!ch) {
    cases.value = [];
    return;
  }
  // 接口预留：GET /api/knowledge/content/list?chapterId= —— 案例列表待接入
  cases.value = [];
  const caseId = route.query.caseId as string | undefined;
  if (caseId) {
    const found = cases.value.find((c) => c.caseId === caseId);
    if (found) {
      code.value = found.codeContent;
      ElMessage.success(`已加载案例：${found.caseName}`);
    }
  }
}

function loadCase(caseId: string) {
  const found = cases.value.find((c) => c.caseId === caseId);
  if (found) {
    code.value = found.codeContent;
    runResult.value = null;
    ElMessage.info(`已加载案例：${found.caseName}`);
  }
}

async function handleRun() {
  if (!code.value.trim() || running.value) return;
  running.value = true;
  runResult.value = null;
  try {
    runResult.value = await runCode({
      codeContent: code.value,
      chapterId: chapterId.value ?? undefined,
    });
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="st-view code-view">
    <header class="st-page-header">
      <h1 class="st-page-title">在线代码实操</h1>
      <p class="st-page-subtitle">在线编写、运行 Java 代码 · 提交后端编译运行并返回判题结果</p>
    </header>

    <!-- 工具栏 -->
    <div class="st-card toolbar-card">
      <div class="st-card__body toolbar-row">
        <el-select
          v-model="chapterId"
          placeholder="选择关联章节"
          clearable
          size="default"
          style="width: 260px;"
          @change="loadChapterCases"
        >
          <el-option
            v-for="c in chapters"
            :key="c.id"
            :label="`${c.chapterCode} ${c.title}`"
            :value="c.id"
          />
        </el-select>

        <div v-if="cases.length" class="case-chips">
          <button
            v-for="c in cases"
            :key="c.caseId"
            class="st-badge st-badge--outline case-chip-btn"
            @click="loadCase(c.caseId)"
          >
            {{ c.caseName }}
          </button>
        </div>

        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" @click="router.push('/student/code/debug')">
            <Bug :size="14" /> 智能纠错
          </button>
          <button class="st-btn st-btn--primary" :disabled="running || !code.trim()" @click="handleRun">
            <Loader2 v-if="running" :size="14" class="spin" />
            <Play v-else :size="14" />
            {{ running ? '运行中…' : '运行代码' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑器 + 输出 -->
    <div class="code-grid">
      <section class="st-card">
        <div class="st-card__header">
          <h2 class="st-card__title">代码编辑器</h2>
          <button class="st-text-btn" style="margin-left: auto;" @click="runResult = null">
            <RotateCcw :size="12" style="margin-right: 2px;" /> 清空结果
          </button>
        </div>
        <div class="st-card__body" style="padding-top: 12px;">
          <CodeEditor v-model="code" :error-lines="errorLines" height="440px" />
        </div>
      </section>

      <section class="st-card">
        <div class="st-card__header">
          <h2 class="st-card__title">运行输出</h2>
          <span v-if="runResult" class="st-badge" :class="badgeClass">{{ badgeLabel }}</span>
        </div>
        <div class="st-card__body">
          <div v-if="!runResult" class="st-empty" style="padding: 120px 16px;">
            <Play :size="40" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">点击「运行代码」查看输出结果</div>
          </div>
          <template v-else>
            <!-- 判题指标 -->
            <div v-if="runResult.totalCount" class="judge-row">
              <span class="judge-item">
                <span class="judge-item__value">{{ runResult.passedCount }}/{{ runResult.totalCount }}</span>
                <span class="judge-item__label">用例通过</span>
              </span>
              <span class="judge-item">
                <span class="judge-item__value">{{ runResult.score }}</span>
                <span class="judge-item__label">得分</span>
              </span>
              <span class="judge-item">
                <span class="judge-item__value">{{ runResult.runDuration }} ms</span>
                <span class="judge-item__label">耗时</span>
              </span>
              <span class="judge-item">
                <span class="judge-item__value">{{ runResult.memoryUsed }} KB</span>
                <span class="judge-item__label">内存</span>
              </span>
            </div>

            <!-- 标准输出 -->
            <div v-if="runResult.output" class="run-output st-code">
              <div v-for="(line, i) in runResult.output.split('\n')" :key="i" class="run-output__line">
                <span class="run-output__prompt">›</span> {{ line }}
              </div>
            </div>

            <!-- 错误信息 -->
            <div v-if="!isPassed" class="run-output run-output--error st-code">
              <div class="run-output__error-head">
                <CircleAlert :size="14" />
                {{ badgeLabel }}
                <template v-if="runResult.errorLine">· 第 {{ runResult.errorLine }} 行</template>
              </div>
              <pre class="run-output__error-text">{{ runResult.errorMsg }}</pre>
            </div>

            <div class="run-actions">
              <button
                v-if="!isPassed"
                class="st-btn st-btn--secondary"
                @click="router.push({ path: '/student/code/debug', query: { chapterId: chapterId ?? undefined } })"
              >
                <Bug :size="14" /> 交给 AI 帮我分析错误
              </button>
              <div v-else class="run-ok">
                <CircleCheck :size="14" /> 程序执行完毕
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.code-view {
  max-width: 1440px;
}

.toolbar-card {
  margin-bottom: 20px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.case-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.case-chip-btn {
  cursor: pointer;
  font-family: inherit;
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.code-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1080px) {
  .code-grid {
    grid-template-columns: 1fr;
  }
}

.judge-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.judge-item {
  display: flex;
  flex-direction: column;
}

.judge-item__value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.judge-item__label {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.run-output {
  background: #fbfbfa;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  min-height: 160px;
  max-height: 380px;
  overflow: auto;
}

.run-output + .run-output {
  margin-top: 12px;
}

.run-output__line {
  white-space: pre-wrap;
}

.run-output__prompt {
  color: var(--text-tertiary);
  margin-right: 6px;
}

.run-output--error {
  background: var(--status-danger-bg);
  border-color: rgba(185, 28, 28, 0.18);
}

.run-output__error-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--status-danger);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  font-size: 13px;
  margin-bottom: 8px;
}

.run-output__error-text {
  margin: 0;
  white-space: pre-wrap;
  color: var(--status-danger);
  font-size: 12px;
}

.run-actions {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.run-ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--status-success);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
