<script setup lang="ts">
/**
 * AI 智能备课（接真实接口 POST /api/agent/teach/prepare）
 *
 * 后端契约要点：
 * - 生成开关是字符串：'1' 开启 / '0' 关闭；
 * - 返回的教案、重难点、课后习题、上机实训均为 Markdown 文本，不再是结构化数组；
 * - pptxUrl 为 PPT 文件路径（转换失败或未开启时为 null），recordId 为备课记录追溯号。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  ClipboardCheck,
  Download,
  FileText,
  Lightbulb,
  ListTree,
  Loader2,
  Presentation,
  ScrollText,
  Sparkles,
  Wrench,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapters } from '@/api/student';
import { generateTeachPrepare } from '@/api/teacher';
import type { Chapter } from '@/types/student';
import type { TeachPrepareResult } from '@/types/teacher';

/** 生成开关字段名（与 TeachPrepareRequest 的字符串开关一一对应） */
type SwitchKey = 'lessonPlan' | 'pptx' | 'keyPoints' | 'homework' | 'lab';

const SWITCHES: { key: SwitchKey; label: string }[] = [
  { key: 'lessonPlan', label: '章节教案' },
  { key: 'pptx', label: '课堂 PPT' },
  { key: 'keyPoints', label: '重难点' },
  { key: 'homework', label: '课后习题' },
  { key: 'lab', label: '上机实训' },
];

const chapters = ref<Chapter[]>([]);
const chapterId = ref<number | null>(null);
const generating = ref(false);
const result = ref<TeachPrepareResult | null>(null);
/** 本次生成实际勾选的开关，用于决定结果区展示哪几块 */
const requested = reactive<Record<SwitchKey, boolean>>({
  lessonPlan: true,
  pptx: true,
  keyPoints: true,
  homework: true,
  lab: true,
});
/** 额外指令 → userMessage */
const userMessage = ref('');

const selectedChapter = computed(() => chapters.value.find((c) => c.id === chapterId.value) ?? null);

/** 章节下拉标签：按 level 缩进，体现章/节/小节层级 */
function chapterLabel(c: Chapter): string {
  const indent = c.level > 1 ? '　'.repeat(c.level - 1) : '';
  return `${indent}${c.title}`;
}

onMounted(async () => {
  try {
    chapters.value = await fetchChapters();
  } catch {
    // 错误由响应拦截器统一提示
  }
});

const anySwitchOn = computed(() => SWITCHES.some((s) => requested[s.key]));

async function handleGenerate() {
  if (!chapterId.value) {
    ElMessage.warning('请先选择章节');
    return;
  }
  if (!anySwitchOn.value) {
    ElMessage.warning('请至少勾选一项要生成的内容');
    return;
  }
  generating.value = true;
  result.value = null;
  try {
    result.value = await generateTeachPrepare({
      chapterId: chapterId.value,
      // 后端要求字符串开关：'1' 生成、'0' 跳过
      lessonPlan: requested.lessonPlan ? '1' : '0',
      pptx: requested.pptx ? '1' : '0',
      keyPoints: requested.keyPoints ? '1' : '0',
      homework: requested.homework ? '1' : '0',
      lab: requested.lab ? '1' : '0',
      userMessage: userMessage.value.trim() || undefined,
    });
    ElMessage.success('备课材料已生成');
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    generating.value = false;
  }
}

/** 某一 Markdown 分区是否有内容（未勾选或后端返回空串都按空处理） */
function sectionText(key: 'lessonPlan' | 'keyPoints' | 'homework' | 'lab'): string {
  return (result.value?.[key] ?? '').trim();
}

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==================== Markdown 渲染（备课结果为 Markdown 文本） ====================
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>',
    );
}

/** 轻量 Markdown → HTML：标题 / 有序无序列表 / 引用 / 代码块 / 分隔线 / 段落 */
function renderMarkdown(src: string): string {
  if (!src) return '';
  const out: string[] = [];
  let inCode = false;
  let listTag: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };
  const openList = (tag: 'ul' | 'ol') => {
    if (listTag !== tag) {
      closeList();
      out.push(`<${tag} class="md-list">`);
      listTag = tag;
    }
  };

  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      closeList();
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        out.push('<pre class="md-pre"><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(`${escapeHtml(raw)}\n`);
      continue;
    }
    if (!line) {
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 3, 6);
      out.push(`<h${level} class="md-h">${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      closeList();
      out.push('<hr class="md-hr" />');
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote class="md-quote">${renderInline(quote[1])}</blockquote>`);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      openList('ul');
      out.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      openList('ol');
      out.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="md-p">${renderInline(line)}</p>`);
  }
  if (inCode) out.push('</code></pre>');
  closeList();
  return out.join('');
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">AI 智能备课</h1>
      <p class="st-page-subtitle">教学备课辅助智能体 · 按教材章节生成教案、PPT、重难点、课后习题与上机实训方案</p>
    </header>

    <!-- 配置 -->
    <div class="st-card">
      <div class="st-card__body config-body">
        <div class="config-row">
          <div class="config-item">
            <label class="config-label">教材章节</label>
            <el-select v-model="chapterId" placeholder="选择章节" filterable style="width: 300px;">
              <el-option
                v-for="c in chapters"
                :key="c.id"
                :label="chapterLabel(c)"
                :value="c.id"
              />
            </el-select>
          </div>
          <button
            class="st-btn st-btn--primary generate-btn"
            :disabled="generating || !chapterId || !anySwitchOn"
            @click="handleGenerate"
          >
            <Loader2 v-if="generating" :size="14" class="spin" />
            <Sparkles v-else :size="14" />
            {{ generating ? '智能体生成中…' : '一键生成备课材料' }}
          </button>
        </div>

        <!-- 生成开关：勾选状态映射为后端字符串开关 '1' / '0' -->
        <div class="config-item" style="margin-top: 4px;">
          <label class="config-label">生成内容</label>
          <div class="switch-list">
            <el-checkbox v-for="s in SWITCHES" :key="s.key" v-model="requested[s.key]">
              {{ s.label }}
            </el-checkbox>
          </div>
        </div>

        <div class="config-item" style="margin-top: 4px;">
          <label class="config-label">额外指令（选填，对应接口 userMessage）</label>
          <textarea
            v-model="userMessage"
            class="form-textarea"
            rows="2"
            placeholder="如：面向零基础本科一年级，教案多用生活化类比；习题侧重继承与多态的辨析题。"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- 空态 -->
    <div v-if="!result && !generating" class="st-card" style="margin-top: 20px;">
      <div class="st-card__body st-empty" style="padding: 90px 16px;">
        <Presentation :size="44" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">选择章节并勾选要生成的内容，备课智能体将基于教材本章内容生成材料</div>
      </div>
    </div>

    <!-- 生成中 -->
    <div v-else-if="generating" class="st-card" style="margin-top: 20px;">
      <div class="st-card__body st-empty" style="padding: 90px 16px;">
        <Loader2 :size="26" class="spin" />
        <div class="st-empty__text">备课智能体正在研读教材本章内容并生成材料…</div>
      </div>
    </div>

    <!-- 结果 -->
    <template v-else-if="result">
      <!-- 结果元信息 -->
      <div class="st-card meta-card">
        <div class="st-card__body meta-body">
          <div class="meta-group">
            <span class="meta-label">追溯备课记录</span>
            <code class="meta-id">recordId {{ result.recordId }}</code>
            <span class="meta-sub">{{ selectedChapter?.title ?? `章节 ${result.chapterId}` }}</span>
            <span class="meta-sub">生成时间 {{ fmt(result.generateTime) }}</span>
          </div>
          <a
            v-if="result.pptxUrl"
            class="st-btn st-btn--secondary"
            :href="result.pptxUrl"
            target="_blank"
            rel="noopener"
          >
            <Download :size="14" /> 下载课堂 PPT
          </a>
          <span v-else class="meta-tip">本次未生成 PPT（未勾选或后端转换失败）</span>
        </div>
      </div>

      <div class="result-grid">
        <!-- 教案 -->
        <section v-if="requested.lessonPlan" class="st-card">
          <div class="st-card__header">
            <FileText :size="16" class="card-icon" />
            <h2 class="st-card__title">章节教案</h2>
          </div>
          <div class="st-card__body">
            <div v-if="sectionText('lessonPlan')" class="md" v-html="renderMarkdown(result.lessonPlan)" />
            <div v-else class="st-empty" style="padding: 32px 16px;">
              <div class="st-empty__text">本节未生成教案内容</div>
            </div>
          </div>
        </section>

        <!-- 重难点 -->
        <section v-if="requested.keyPoints" class="st-card">
          <div class="st-card__header">
            <ListTree :size="16" class="card-icon" />
            <h2 class="st-card__title">重难点清单</h2>
          </div>
          <div class="st-card__body">
            <div v-if="sectionText('keyPoints')" class="md" v-html="renderMarkdown(result.keyPoints)" />
            <div v-else class="st-empty" style="padding: 32px 16px;">
              <div class="st-empty__text">本节未生成重难点内容</div>
            </div>
          </div>
        </section>
      </div>

      <div class="result-grid" style="margin-top: 20px;">
        <!-- 课后习题 -->
        <section v-if="requested.homework" class="st-card">
          <div class="st-card__header">
            <Lightbulb :size="16" class="card-icon" />
            <h2 class="st-card__title">课后习题</h2>
            <p class="st-card__hint title-hint">可直接用于作业发布环节</p>
          </div>
          <div class="st-card__body">
            <div v-if="sectionText('homework')" class="md" v-html="renderMarkdown(result.homework)" />
            <div v-else class="st-empty" style="padding: 32px 16px;">
              <div class="st-empty__text">本节未生成课后习题</div>
            </div>
          </div>
        </section>

        <!-- 上机实训 -->
        <section v-if="requested.lab" class="st-card">
          <div class="st-card__header">
            <Wrench :size="16" class="card-icon" />
            <h2 class="st-card__title">上机实训方案</h2>
          </div>
          <div class="st-card__body">
            <div v-if="sectionText('lab')" class="md" v-html="renderMarkdown(result.lab)" />
            <div v-else class="st-empty" style="padding: 32px 16px;">
              <div class="st-empty__text">本节未生成上机实训方案</div>
            </div>
          </div>
        </section>
      </div>

      <!-- AI 内容校验：仅保留入口，逻辑待后端接口 -->
      <section class="st-card" style="margin-top: 20px;">
        <div class="st-card__header">
          <ClipboardCheck :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">AI 内容校验</h2>
            <p class="st-card__hint">
              接口预留：POST /api/knowledge/verify/content {chapterId, aiAnswer}
            </p>
          </div>
        </div>
        <div class="st-card__body verify-body">
          <div class="verify-item">
            <span class="verify-label">待校验内容</span>
            <el-select :model-value="null" placeholder="选择上方已生成的分区" disabled style="width: 200px;">
              <el-option label="章节教案" value="lessonPlan" />
              <el-option label="重难点清单" value="keyPoints" />
              <el-option label="课后习题" value="homework" />
              <el-option label="上机实训方案" value="lab" />
            </el-select>
            <span class="verify-hint">
              <ScrollText :size="13" /> 校验将比对教材原文，标记与教材不符的题目与表述
            </span>
          </div>
          <div class="verify-actions">
            <button class="st-btn st-btn--secondary" disabled>
              <ClipboardCheck :size="13" /> 发起内容校验
            </button>
            <button class="st-btn st-btn--ghost" disabled>查看校验报告</button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-row {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.switch-list {
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
}

.generate-btn {
  margin-left: auto;
  height: 36px;
}

.form-textarea {
  width: 100%;
  max-width: 720px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.form-textarea:focus {
  border-color: var(--border-strong);
}

/* ---------- 结果元信息 ---------- */
.meta-card {
  margin-top: 20px;
}

.meta-body {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.meta-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.meta-label {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.meta-id {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
}

.meta-sub {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.meta-tip {
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-left: auto;
}

/* ---------- 布局 ---------- */
.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .result-grid {
    grid-template-columns: 1fr;
  }
}

.title-hint {
  margin-left: auto;
}

/* ---------- 内容校验（UI 骨架） ---------- */
.verify-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.verify-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.verify-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.verify-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.verify-actions {
  display: flex;
  gap: 10px;
}

/* ---------- Markdown 渲染 ---------- */
.md {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.8;
}

.md :deep(.md-h) {
  font-weight: 600;
  color: var(--text-primary);
  margin: 18px 0 8px;
  letter-spacing: -0.2px;
}

.md :deep(.md-h:first-child) {
  margin-top: 0;
}

.md :deep(h4.md-h) { font-size: 15px; }
.md :deep(h5.md-h) { font-size: 13.5px; }
.md :deep(h6.md-h) { font-size: 13px; color: var(--text-secondary); }

.md :deep(.md-p) {
  margin: 6px 0;
}

.md :deep(.md-list) {
  margin: 8px 0 8px 20px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.md :deep(.md-list li) {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.md :deep(.md-quote) {
  margin: 10px 0;
  padding: 8px 14px;
  border-left: 2px solid var(--border-strong);
  background: var(--bg-subtle);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}

.md :deep(.md-pre) {
  margin: 10px 0;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.md :deep(.md-pre code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  color: #44403c;
  white-space: pre;
}

.md :deep(.md-code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 1px 5px;
  color: #1c1917;
}

.md :deep(.md-hr) {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 14px 0;
}

.md :deep(.md-link) {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.md :deep(strong) {
  font-weight: 600;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
