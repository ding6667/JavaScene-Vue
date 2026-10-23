<script setup lang="ts">
/**
 * AI 智能答疑（学生端）
 *
 * 问答只有一个通道：GET /api/qa/answer/stream（SSE 流式，见 @/api/qa）
 * 后端推的是 Markdown 源文本，事件名为 think-start / think / think-end / message，
 * 所以本页把 message 片段累积成 raw 文本，每帧经 renderMarkdownStreaming 重新渲染，
 * 做到「实时出排版」，同时处理代码围栏被劈成两半的情况。
 *
 * 会话连续：进入页面先生成 sessionId 并随每次请求带上；后端若下发 meta 就用回传值覆盖。
 * 历史面板：GET /api/qa/history（@/api/qa.fetchQaHistory）。
 * 说明：不使用通用对话流 /api/chat/streamChat（那是悬浮助手 dialogue 模块的通道），也不存在同步 ask 接口。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  BookMarked,
  Brain,
  CircleAlert,
  Eraser,
  History,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  Send,
  Sparkles,
  Square,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapters } from '@/api/knowledge';
import { createQaSessionId, fetchQaHistory, streamQaAnswer } from '@/api/qa';
import type { Chapter } from '@/types/knowledge';
import type { QaHistoryItem, QaStreamMeta } from '@/types/qa';
import { renderMarkdownStreaming } from '@/utils/markdown';

/** 界面消息：assistant 走流式，同时保存 Markdown 源文本与渲染结果 */
interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  /** 学生提问原文 */
  text?: string;
  /** 累积的 Markdown 源文本（正式答案） */
  raw: string;
  /** 渲染出的 HTML，按动画帧节流更新 */
  html: string;
  /** 累积的思考过程文本 */
  thinking: string;
  /** 思考面板是否展开：think-start 置真，think-end 置假 */
  thinkingOpen: boolean;
  /** 是否仍在接收 */
  pending: boolean;
  /** 后端 error 事件或连接异常 */
  error?: string;
}

const chapters = ref<Chapter[]>([]);
const selectedChapter = ref<number | null>(null);
const inputText = ref('');
const sending = ref(false);
const messages = ref<ChatMsg[]>([]);
const messagesEl = ref<HTMLElement | null>(null);

/** 会话 ID：首轮本地生成，收到 meta 后被后端值覆盖 */
const qaSessionId = ref<string>(createQaSessionId());
const roundNo = ref(0);

/** 流式控制 */
let abortCtrl: AbortController | null = null;
let rafId = 0;
/** 当前正在流式接收的消息 id */
let activeId = '';

const QUICK_QUESTIONS = [
  'JDK、JRE、JVM 三者的关系是什么？',
  '重写与重载有什么区别？',
  '== 和 equals 比较字符串有什么不同？',
  'ArrayList 和 LinkedList 该怎么选？',
];

function chapterLabel(id: number | null | undefined): string {
  if (id == null) return '全书范围';
  const c = chapters.value.find((x) => x.id === id);
  return c ? `${c.chapterCode} ${c.title}` : `章节 ${id}`;
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** knowledgePoints 是逗号分隔字符串（中英文逗号都可能出现） */
function splitPoints(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 历史接口的贴合判定是 1/0/null 码值 */
function itemMatch(item: QaHistoryItem): { label: string; badge: string } {
  if (item.isTextbookMatch === 1) return { label: '贴合教材', badge: 'st-badge--success' };
  if (item.isTextbookMatch === 0) return { label: '超出教材范围', badge: 'st-badge--danger' };
  return { label: '未判定', badge: 'st-badge--neutral' };
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  });
}

const activeMsg = computed(() => messages.value.find((m) => m.id === activeId) ?? null);

/**
 * 帧级节流渲染：一个动画周期内不管来多少 token 只解析一次 Markdown。
 * 每帧都跑解析器在长回答 + 弱机上是肉眼可见的掉帧。
 */
function scheduleRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const m = activeMsg.value;
    if (!m) return;
    m.html = renderMarkdownStreaming(m.raw);
    scrollToBottom();
  });
}

/** 收尾或中断时立即出最终结果，不等下一帧 */
function flushRender() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  const m = activeMsg.value;
  if (m) m.html = renderMarkdownStreaming(m.raw);
}

/** 发送提问：唯一的答疑通道就是这条流式接口 */
async function ask(question: string) {
  const q = question.trim();
  if (!q || sending.value) return;

  const stamp = Date.now();
  messages.value.push({
    id: `q_${stamp}`,
    role: 'user',
    text: q,
    raw: '',
    html: '',
    thinking: '',
    thinkingOpen: false,
    pending: false,
  });
  messages.value.push({
    id: `a_${stamp}`,
    role: 'assistant',
    raw: '',
    html: '',
    thinking: '',
    thinkingOpen: false,
    pending: true,
  });
  activeId = `a_${stamp}`;
  inputText.value = '';
  sending.value = true;
  scrollToBottom();

  abortCtrl = new AbortController();

  await streamQaAnswer(
    q,
    {
      onMeta: (meta: QaStreamMeta) => {
        // 后端回了会话信息就以它为准，后续请求带着它连轮次
        if (meta.sessionId) qaSessionId.value = meta.sessionId;
        roundNo.value = meta.roundNo;
      },
      onThinkStart: () => {
        const m = activeMsg.value;
        if (m) m.thinkingOpen = true;
      },
      onThink: (chunk) => {
        const m = activeMsg.value;
        if (m) {
          m.thinking += chunk;
          scrollToBottom();
        }
      },
      onThinkEnd: () => {
        const m = activeMsg.value;
        if (m) m.thinkingOpen = false;
      },
      onMessage: (chunk) => {
        const m = activeMsg.value;
        if (!m) return;
        m.pending = false;
        m.raw += chunk;
        scheduleRender();
      },
      onError: (msg) => {
        const m = activeMsg.value;
        if (m) {
          m.pending = false;
          m.error = msg;
          m.thinkingOpen = false;
        }
        ElMessage.error(msg);
      },
      onDone: () => {
        flushRender();
        const m = activeMsg.value;
        if (m) {
          m.pending = false;
          m.thinkingOpen = false;
        }
        sending.value = false;
        abortCtrl = null;
        void loadHistory(1);
      },
    },
    {
      chapterId: selectedChapter.value ?? undefined,
      sessionId: qaSessionId.value,
      signal: abortCtrl.signal,
    },
  );
}

/** 停止生成：断开当前流，已渲染的内容保留 */
function stop() {
  if (!abortCtrl) return;
  abortCtrl.abort();
  abortCtrl = null;
  flushRender();
  const m = activeMsg.value;
  if (m) {
    m.pending = false;
    m.thinkingOpen = false;
  }
  sending.value = false;
  ElMessage.info('已停止本次生成');
}

function clearConversation() {
  stop();
  messages.value = [];
  activeId = '';
  qaSessionId.value = createQaSessionId();
  roundNo.value = 0;
}

// ==================== 答疑记录（GET /api/qa/history） ====================

const historyItems = ref<QaHistoryItem[]>([]);
const loadingHistory = ref(false);
const historyError = ref('');
const historyPageNum = ref(1);
const historyPageSize = ref(5);
const historyTotal = ref(0);
const historyTotalPages = computed(() =>
  Math.max(1, Math.ceil(historyTotal.value / historyPageSize.value)),
);

async function loadHistory(page = historyPageNum.value) {
  loadingHistory.value = true;
  historyError.value = '';
  try {
    const res = await fetchQaHistory({
      chapterId: selectedChapter.value ?? undefined,
      pageNum: page,
      pageSize: historyPageSize.value,
    });
    historyItems.value = res.records ?? [];
    historyTotal.value = res.total ?? 0;
    historyPageNum.value = res.current ?? page;
  } catch (e) {
    historyItems.value = [];
    historyTotal.value = 0;
    historyError.value = (e as Error).message || '历史问答加载失败';
  } finally {
    loadingHistory.value = false;
  }
}

/** 点击历史记录：把该轮问答回填会话区，并沿用它的会话 ID 继续追问 */
function replay(item: QaHistoryItem) {
  const base = Date.now();
  messages.value.push({
    id: `rq_${base}`,
    role: 'user',
    text: item.question,
    raw: '',
    html: '',
    thinking: '',
    thinkingOpen: false,
    pending: false,
  });
  messages.value.push({
    id: `rq_${base + 1}`,
    role: 'assistant',
    raw: item.answer ?? '',
    html: renderMarkdownStreaming(item.answer ?? ''),
    thinking: '',
    thinkingOpen: false,
    pending: false,
  });
  if (item.sessionId) qaSessionId.value = item.sessionId;
  roundNo.value = item.roundNo ?? 0;
  scrollToBottom();
}

onMounted(() => {
  fetchChapters()
    .then((list) => {
      chapters.value = list;
    })
    .catch(() => {
      // 错误已由响应拦截器统一提示
    });
  void loadHistory(1);
});

watch(selectedChapter, () => void loadHistory(1));

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  abortCtrl?.abort();
});
</script>

<template>
  <div class="st-view qa-view">
    <header class="st-page-header">
      <h1 class="st-page-title">AI 智能答疑</h1>
      <p class="st-page-subtitle">
        教材知识答疑智能体 · 流式输出并实时渲染 Markdown · 当前范围：{{ chapterLabel(selectedChapter) }}
      </p>
    </header>

    <div class="qa-grid">
      <!-- 会话区 -->
      <section class="st-card qa-main">
        <div class="st-card__header">
          <MessageCircleQuestion :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">提问</h2>
            <p class="st-card__hint">
              GET /api/qa/answer/stream · 会话 {{ qaSessionId }}
              <span v-if="roundNo"> · 第 {{ roundNo }} 轮</span>
            </p>
          </div>
          <div class="head-ops">
            <el-select v-model="selectedChapter" placeholder="全书范围" clearable filterable style="width: 190px;">
              <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode} ${c.title}`" :value="c.id" />
            </el-select>
            <button class="st-btn st-btn--ghost" :disabled="!messages.length" @click="clearConversation">
              <Eraser :size="13" /> 清空
            </button>
          </div>
        </div>

        <div ref="messagesEl" class="qa-stream">
          <div v-if="!messages.length" class="st-empty qa-empty">
            <Sparkles :size="26" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">提出一个问题，答案会逐字流式返回并实时渲染</div>
            <div class="quick-row">
              <button
                v-for="qq in QUICK_QUESTIONS"
                :key="qq"
                class="st-btn st-btn--secondary quick-btn"
                @click="ask(qq)"
              >
                {{ qq }}
              </button>
            </div>
          </div>

          <div
            v-for="m in messages"
            :key="m.id"
            :class="['turn', m.role === 'user' ? 'turn--user' : 'turn--ai']"
          >
            <div v-if="m.role === 'user'" class="turn__q">{{ m.text }}</div>

            <template v-else>
              <!-- 思考过程：think-start / think / think-end -->
              <div v-if="m.thinking || m.thinkingOpen" :class="['think', { 'think--open': m.thinkingOpen }]">
                <div class="think__head">
                  <Brain :size="13" />
                  <span>{{ m.thinkingOpen ? '思考中…' : '思考过程' }}</span>
                  <Loader2 v-if="m.thinkingOpen" :size="12" class="spin" />
                </div>
                <div class="think__body">{{ m.thinking }}</div>
              </div>

              <!-- 正文：message 片段累积后渲染 -->
              <div v-if="m.html" class="md answer" v-html="m.html" />
              <div v-else-if="m.pending && !m.thinkingOpen" class="answer-pending">
                <Loader2 :size="14" class="spin" /> 正在等待首个片段…
              </div>

              <div v-if="m.error" class="answer-error">
                <CircleAlert :size="13" />
                <span>{{ m.error }}</span>
              </div>

              <div v-if="m.pending" class="answer-pending">
                <Loader2 :size="13" class="spin" /> 生成中…
                <button class="st-text-btn" @click="stop">
                  <Square :size="11" /> 停止生成
                </button>
              </div>
            </template>
          </div>
        </div>

        <div class="qa-input">
          <textarea
            v-model="inputText"
            class="qa-textarea"
            rows="2"
            placeholder="例如：多态的“编译看左、运行看右”是什么意思？（Ctrl+Enter 发送）"
            @keydown.ctrl.enter.prevent="ask(inputText)"
          ></textarea>
          <div class="qa-input__foot">
            <span class="qa-input__hint">接口：GET /api/qa/answer/stream?question&chapterId&sessionId</span>
            <button class="st-btn st-btn--primary" :disabled="!inputText.trim() || sending" @click="ask(inputText)">
              <Loader2 v-if="sending" :size="14" class="spin" />
              <Send v-else :size="14" />
              {{ sending ? '生成中' : '提问' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 侧栏：答疑记录 -->
      <aside class="st-card">
        <div class="st-card__header">
          <History :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">答疑记录</h2>
            <p class="st-card__hint">
              GET /api/qa/history · 共 {{ historyTotal }} 条
              <span v-if="historyError"> · {{ historyError }}</span>
            </p>
          </div>
          <button class="st-text-btn" :disabled="loadingHistory" title="重新加载历史" @click="loadHistory(1)">
            <RefreshCw :size="13" :class="{ spin: loadingHistory }" />
          </button>
        </div>
        <div class="st-card__body">
          <div v-if="!loadingHistory && !historyItems.length" class="st-empty">
            <BookMarked :size="22" class="st-empty__icon" />
            <div class="st-empty__text">{{ historyError || '暂无答疑记录' }}</div>
          </div>
          <ul v-else class="hist-list">
            <li v-for="item in historyItems" :key="item.id" class="hist-item" @click="replay(item)">
              <div class="hist-item__q">{{ item.question }}</div>
              <div class="hist-item__meta">
                <span :class="['st-badge', itemMatch(item).badge]">{{ itemMatch(item).label }}</span>
                <span class="hist-item__time">{{ fmtTime(item.createTime) }}</span>
                <span v-if="item.responseTime" class="hist-item__cost">{{ item.responseTime }}ms</span>
              </div>
              <div v-if="splitPoints(item.knowledgePoints).length" class="hist-item__points">
                <span v-for="p in splitPoints(item.knowledgePoints)" :key="p" class="st-badge st-badge--outline">
                  {{ p }}
                </span>
              </div>
            </li>
          </ul>

          <div v-if="historyTotalPages > 1" class="hist-pager">
            <button
              class="st-btn st-btn--secondary"
              :disabled="historyPageNum <= 1 || loadingHistory"
              @click="loadHistory(historyPageNum - 1)"
            >
              上一页
            </button>
            <span class="hist-pager__info">{{ historyPageNum }} / {{ historyTotalPages }}</span>
            <button
              class="st-btn st-btn--secondary"
              :disabled="historyPageNum >= historyTotalPages || loadingHistory"
              @click="loadHistory(historyPageNum + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* 页面撑满一屏，消息区内部滚动（学生端答疑的一贯布局，不做整页滚动） */
.qa-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.qa-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
}

.head-ops {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 会话卡片：头部 + 滚动消息区 + 底部输入区 */
.qa-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.qa-stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qa-empty {
  padding: 32px 16px;
}

/* 快捷问题竖排列表，宽度受控避免拉满整栏 */
.quick-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
  margin-top: 14px;
}

.quick-btn {
  font-size: 12.5px;
  height: auto;
  padding: 8px 14px;
  justify-content: flex-start;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border-default);
  text-align: left;
}

.quick-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-subtle);
}

.turn--user {
  display: flex;
  justify-content: flex-end;
}

.turn__q {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border-bottom-right-radius: 4px;
  background: var(--text-primary);
  color: var(--bg-surface);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.turn--ai {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

/* 回答气泡：浅底细边，与用户气泡成对 */
.answer {
  width: 100%;
  max-width: 92%;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border-bottom-left-radius: 4px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
}

/* 思考过程 */
.think {
  border-left: 2px solid var(--border-default);
  padding: 6px 0 6px 12px;
  color: var(--text-tertiary);
}

.think--open {
  border-left-color: var(--border-strong);
}

.think__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.think__body {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  max-height: 140px;
  overflow-y: auto;
}

.answer-pending {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.answer-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 12.5px;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

/* 输入区：贴在卡片底部，不参与滚动 */
.qa-input {
  flex-shrink: 0;
  border-top: 1px solid var(--border-subtle);
  padding: 12px 16px 14px;
}

.qa-textarea {
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 9px 12px;
  resize: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.qa-textarea:focus {
  outline: none;
  border-color: var(--border-strong);
  box-shadow: 0 0 0 3px rgba(87, 83, 78, 0.1);
}

.qa-textarea::placeholder {
  color: var(--text-tertiary);
}

.qa-input__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.qa-input__hint {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

/* 侧栏：整卡不滚动，记录列表内部滚动，与左栏同高 */
.qa-view aside.st-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.qa-view aside.st-card > .st-card__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 历史记录 */
.hist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hist-item {
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.hist-item:hover {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.hist-item__q {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hist-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.hist-item__time,
.hist-item__cost {
  font-size: 11px;
  color: var(--text-tertiary);
}

.hist-item__points {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.hist-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.hist-pager__info {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Markdown 渲染（后端推送的就是 md 源文本） */
.md {
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--text-primary);
  word-break: break-word;
}

.md :deep(.md-h) {
  margin: 14px 0 6px;
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.md :deep(.md-p) {
  margin: 5px 0;
}

.md :deep(.md-list) {
  margin: 5px 0 9px 20px;
  padding: 0;
}

.md :deep(.md-list li) {
  margin: 2px 0;
}

.md :deep(.md-quote) {
  margin: 9px 0;
  padding: 6px 12px;
  border-left: 2px solid var(--border-strong);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.md :deep(.md-pre) {
  margin: 9px 0;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.65;
}

.md :deep(.md-code) {
  padding: 1px 5px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.md :deep(.md-hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--border-default);
}

.md :deep(.md-link) {
  color: var(--text-primary);
  text-decoration: underline;
}

.md :deep(strong) {
  font-weight: 600;
}

.spin {
  animation: qa-spin 0.9s linear infinite;
}

@keyframes qa-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 窄屏改单列：解除整屏锁定，让页面正常滚动，消息区改为限高内滚 */
@media (max-width: 960px) {
  .qa-view {
    height: auto;
    overflow: visible;
  }

  .qa-grid {
    grid-template-columns: 1fr;
  }

  .qa-stream {
    max-height: 60vh;
  }

  .qa-view aside.st-card > .st-card__body {
    max-height: 40vh;
  }

  .head-ops {
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .qa-stream {
    padding: 16px;
  }

  .turn__q,
  .answer {
    max-width: 100%;
  }
}
</style>
