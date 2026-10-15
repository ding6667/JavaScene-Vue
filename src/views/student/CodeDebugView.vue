<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  BookMarked,
  Bug,
  Lightbulb,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sprout,
  Wrench,
} from 'lucide-vue-next';
import { debugCode, fetchChapters } from '@/api/student';
import CodeEditor from '@/components/student/CodeEditor.vue';
import type { Chapter, CodeDebugResult, RunStatus } from '@/types/student';

const route = useRoute();
const router = useRouter();

const chapterId = ref<number | null>(route.query.chapterId ? Number(route.query.chapterId) : null);
const chapters = ref<Chapter[]>([]);
/**
 * 错误类型筛选为 UI 预留项：POST /api/study/code/debug 入参只有
 * codeContent / chapterId / questionId，后端会自行判定错误类型。
 */
const errorType = ref<'auto' | 'syntax' | 'logic' | 'style'>('auto');
const code = ref('');
const analyzing = ref(false);
const result = ref<CodeDebugResult | null>(null);

const ERROR_TYPE_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: 'syntax', label: '语法错误' },
  { value: 'logic', label: '逻辑错误' },
  { value: 'style', label: '规范问题' },
] as const;

/** 预置一段带错误的教学示例（未初始化循环变量 + String 小写） */
const BROKEN_SAMPLE = `public class BrokenDemo {
    public static void main(String[] args) {
        string name = "Java";
        int total = 0;
        for (int i = 0; i < 5; i++) {
            total += i;
        }
        System.out.println(name + "总分: " + total);
        int result = 100 / 0;
        System.out.println("结果: " + result);
    }
}`;

/** 判题状态中文口径（与代码实操页一致） */
const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  AC: '通过',
  WA: '答案错误',
  TLE: '运行超时',
  MLE: '内存超限',
  RE: '运行异常',
  CE: '编译错误',
  OLE: '输出超限',
  SV: '安全违规',
  SE: '系统错误',
};

/** 关联章节名（来自真实章节列表） */
const chapterName = computed(() => {
  const ch = chapters.value.find((c) => c.id === chapterId.value);
  return ch ? `${ch.chapterCode} ${ch.title}` : '';
});

/** errorLineList 是字符串数组，编辑器需要数字行号 */
const errorLineNumbers = computed<number[]>(() => {
  const list = result.value?.errorLineList ?? [];
  const lines = new Set<number>();
  for (const raw of list) {
    const n = Number.parseInt(String(raw).replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) lines.add(n);
  }
  return [...lines].sort((a, b) => a - b);
});

const statusLabel = computed(() => {
  const r = result.value;
  if (!r) return '';
  return RUN_STATUS_LABEL[r.status] ?? r.statusDesc ?? r.status;
});

onMounted(async () => {
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 错误已由响应拦截器统一提示
  }
});

function loadSample() {
  code.value = BROKEN_SAMPLE;
  result.value = null;
}

async function handleDebug() {
  if (!code.value.trim() || analyzing.value) return;
  analyzing.value = true;
  result.value = null;
  try {
    result.value = await debugCode({
      codeContent: code.value,
      chapterId: chapterId.value ?? undefined,
    });
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    analyzing.value = false;
  }
}
</script>

<template>
  <div class="st-view debug-view">
    <div class="detail-topbar">
      <button class="st-text-btn" @click="router.push('/student/code')">
        <ArrowLeft :size="14" style="margin-right: 4px;" /> 返回代码实操
      </button>
    </div>

    <header class="st-page-header">
      <h1 class="st-page-title">智能代码纠错</h1>
      <p class="st-page-subtitle">代码实操调试智能体 · 只给修改思路，不代写完整代码，引导你自主修正</p>
    </header>

    <!-- 分析配置 -->
    <div class="st-card config-card">
      <div class="st-card__body config-row">
        <el-select
          v-model="chapterId"
          placeholder="关联章节（可选）"
          clearable
          style="width: 240px;"
        >
          <el-option
            v-for="c in chapters"
            :key="c.id"
            :label="`${c.chapterCode} ${c.title}`"
            :value="c.id"
          />
        </el-select>

        <el-select v-model="errorType" style="width: 140px;">
          <el-option v-for="o in ERROR_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>

        <button class="st-text-btn" @click="loadSample">加载一段问题示例</button>

        <div style="margin-left: auto; display: flex; align-items: center; gap: 10px;">
          <span v-if="chapterName" class="st-badge st-badge--neutral">{{ chapterName }}</span>
          <button class="st-btn st-btn--primary" :disabled="analyzing || !code.trim()" @click="handleDebug">
            <Loader2 v-if="analyzing" :size="14" class="spin" />
            <Search v-else :size="14" />
            {{ analyzing ? '分析中…' : '开始纠错分析' }}
          </button>
        </div>
      </div>
    </div>

    <div class="debug-grid">
      <!-- 左：代码 -->
      <section class="st-card">
        <div class="st-card__header">
          <h2 class="st-card__title">待分析代码</h2>
          <span v-if="result && errorLineNumbers.length" class="st-badge st-badge--danger">
            检测到 {{ errorLineNumbers.length }} 处问题
          </span>
        </div>
        <div class="st-card__body" style="padding-top: 12px;">
          <CodeEditor v-model="code" :error-lines="errorLineNumbers" height="480px" />
        </div>
      </section>

      <!-- 右：分析结果 -->
      <section class="st-card">
        <div class="st-card__header">
          <h2 class="st-card__title">分析结果</h2>
          <Bug :size="15" class="title-icon" />
        </div>
        <div class="st-card__body">
          <div v-if="!result && !analyzing" class="st-empty" style="padding: 120px 16px;">
            <Lightbulb :size="40" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">粘贴或编写代码后点击「开始纠错分析」</div>
          </div>

          <div v-else-if="analyzing" class="st-empty" style="padding: 120px 16px;">
            <Loader2 :size="28" class="spin" />
            <div class="st-empty__text">智能体正在逐行检测你的代码…</div>
          </div>

          <template v-else-if="result">
            <!-- 运行判定 -->
            <div class="result-block">
              <div class="result-block__head"><Bug :size="14" /> 运行判定</div>
              <div class="status-line">
                <span class="st-badge st-badge--outline">{{ result.status }}</span>
                <span class="status-line__text">{{ statusLabel }}</span>
                <span v-if="result.statusDesc" class="status-line__desc">{{ result.statusDesc }}</span>
              </div>
            </div>

            <!-- 错误位置 -->
            <div class="result-block">
              <div class="result-block__head"><MapPin :size="14" /> 错误位置</div>
              <div v-if="result.errorLineList.length" class="error-lines">
                <span v-for="ln in result.errorLineList" :key="ln" class="st-badge st-badge--danger">第 {{ ln }} 行</span>
              </div>
              <div v-else class="no-error">
                <ShieldCheck :size="14" /> 未检测到明显语法错误
              </div>
            </div>

            <!-- 错误原因 -->
            <div class="result-block">
              <div class="result-block__head"><Bug :size="14" /> 错误原因分析</div>
              <div class="result-block__text">{{ result.errorReason }}</div>
            </div>

            <!-- 修改思路 -->
            <div class="result-block">
              <div class="result-block__head"><Wrench :size="14" /> 修改思路提示</div>
              <div class="result-block__text">{{ result.optimizeSuggest }}</div>
            </div>

            <!-- 标准解题思路 -->
            <div class="result-block">
              <div class="result-block__head"><Lightbulb :size="14" /> 标准解题思路</div>
              <div class="result-block__text">{{ result.standardIdea }}</div>
            </div>

            <!-- 涉及知识点 -->
            <div v-if="result.knowledgePoints.length" class="result-block">
              <div class="result-block__head"><BookMarked :size="14" /> 涉及知识点</div>
              <div class="error-lines">
                <span v-for="kp in result.knowledgePoints" :key="kp" class="st-badge st-badge--neutral">{{ kp }}</span>
              </div>
            </div>

            <!-- 学习建议 + 鼓励 -->
            <div class="result-block">
              <div class="result-block__head"><Sprout :size="14" /> 学习建议</div>
              <div class="result-block__text">{{ result.learningSuggestion }}</div>
              <div v-if="result.encouragement" class="encourage">{{ result.encouragement }}</div>
            </div>

            <div class="debug-notice">
              依据教学约束，智能体不会输出完整可运行代码——请根据以上思路自行修改后，回到
              <a href="#" @click.prevent="router.push('/student/code')">代码实操</a> 页面运行验证。
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-topbar {
  margin-bottom: 12px;
}

.title-icon {
  color: var(--text-tertiary);
  margin-left: auto;
}

.config-card {
  margin-bottom: 20px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.debug-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1080px) {
  .debug-grid {
    grid-template-columns: 1fr;
  }
}

.result-block {
  margin-bottom: 18px;
}

.result-block__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.result-block__text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-line__text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-line__desc {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.error-lines {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.no-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--status-success);
}

.encourage {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  border-left: 2px solid var(--border-strong);
  padding-left: 10px;
  line-height: 1.6;
}

.debug-notice {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  border-top: 1px dashed var(--border-default);
  padding-top: 12px;
}

.debug-notice a {
  color: var(--text-primary);
  font-weight: 500;
  text-decoration: underline;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
