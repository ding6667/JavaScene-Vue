<script setup lang="ts">
/**
 * AI 智能答疑（学生端）
 * 真实接口：GET /api/chat/streamChat（流式，含二次确认重发，见 @/api/chat）
 * 已接桩：待实现 @/api/qa.askQuestion（POST /api/qa/ask {question,chapterId?,sessionId?}）
 *   —— 「同步提问」开关开启时走该接口，渲染 references / isTextbookMatch / hitRate / knowledgePoints 溯源区，
 *      并用响应回传的 sessionId 续接会话（首轮不传，续问带上后 roundNo 连续）。
 * 已接桩：待实现 @/api/qa.fetchQaHistory（GET /api/qa/history?chapterId&sessionId&pageNum&pageSize）
 *   —— 右侧「答疑记录」面板分页拉取本人历史，点击记录回填到会话区。
 * 章节下拉对 qa 接口生效（askQuestion / history 查询参数）；通用流式通道不接收 chapterId。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  CircleAlert,
  History,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  Send,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchChapters } from '@/api/knowledge';
import { streamChatAnswer, streamChatConfirm } from '@/api/chat';
import { askQuestion, fetchQaHistory } from '@/api/qa';
import type { Chapter } from '@/types/knowledge';
import type { QaHistoryItem } from '@/types/qa';

/** 溯源区视图模型（同步问答与历史记录共用） */
interface TraceInfo {
  references: string[];
  /** null 表示该章未配关键词/原文，无法判定 */
  isTextbookMatch: boolean | null;
  /** 命中率 0~1；history 接口不返回，置 null */
  hitRate: number | null;
  knowledgePoints: string;
  roundNo?: number;
  source: 'ask' | 'history';
}

/** 界面会话消息 */
interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  trace?: TraceInfo | null;
}

const chapters = ref<Chapter[]>([]);
const selectedChapter = ref<number | null>(null);
const inputText = ref('');
const sending = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const messages = ref<ChatMsg[]>([]);

/** 「同步提问」开关：开启后走 POST /api/qa/ask 而非流式通道 */
const syncMode = ref(false);
/** qa 会话 ID：由 askQuestion / 历史记录回填，续问带上以连轮次 */
const qaSessionId = ref<string | null>(null);

/** 答疑记录（已接桩：待实现 GET /api/qa/history） */
const historyItems = ref<QaHistoryItem[]>([]);
const loadingHistory = ref(false);
const historyError = ref('');
const historyPageNum = ref(1);
const historyPageSize = ref(5);
const historyTotal = ref(0);
const historyTotalPages = computed(() =>
  Math.max(1, Math.ceil(historyTotal.value / historyPageSize.value)),
);

/** 会话 ID：整页共用一个，保证通用对话流多轮上下文连续 */
const conversationId = `student_qa_${Date.now()}`;

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

const matchMeta = (v: boolean | null) => {
  if (v === true) return { label: '贴合教材', badge: 'st-badge--success' };
  if (v === false) return { label: '超出教材范围', badge: 'st-badge--danger' };
  return { label: '未判定', badge: 'st-badge--neutral' };
};

/** 历史记录的贴合判定是 1/0/null 码值，转成布尔口径复用同一套徽章 */
function itemMatch(item: QaHistoryItem): boolean | null {
  if (item.isTextbookMatch === 1) return true;
  if (item.isTextbookMatch === 0) return false;
  return null;
}

/** knowledgePoints 为逗号分隔字符串（中英文逗号均可能出现） */
function splitPoints(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

onMounted(() => {
  fetchChapters()
    .then((list) => {
      chapters.value = list;
    })
    .catch(() => {
      // 真实只读接口：错误已由响应拦截器统一提示
    });
  void loadHistory();
});

/** 章节筛选变化后重新按章查历史 */
watch(selectedChapter, () => {
  historyPageNum.value = 1;
  void loadHistory();
});

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  });
}

/** 已接桩：待实现 @/api/qa.fetchQaHistory（GET /api/qa/history） */
async function loadHistory() {
  loadingHistory.value = true;
  historyError.value = '';
  try {
    const page = await fetchQaHistory({
      chapterId: selectedChapter.value ?? undefined,
      pageNum: historyPageNum.value,
      pageSize: historyPageSize.value,
    });
    historyItems.value = page?.records ?? [];
    historyTotal.value = page?.total ?? 0;
  } catch {
    historyItems.value = [];
    historyTotal.value = 0;
    historyError.value = '接口待实现：fetchQaHistory（GET /api/qa/history?chapterId&sessionId&pageNum&pageSize）';
  } finally {
    loadingHistory.value = false;
  }
}

function goHistoryPage(delta: number) {
  const target = Math.min(Math.max(1, historyPageNum.value + delta), historyTotalPages.value);
  if (target === historyPageNum.value) return;
  historyPageNum.value = target;
  void loadHistory();
}

/** 点击历史记录：回填问答到会话区，并续接该记录的 sessionId */
function fillFromHistory(item: QaHistoryItem) {
  const stamp = Date.now();
  messages.value = [
    { id: `h_q_${stamp}`, role: 'user', text: item.question },
    {
      id: `h_a_${stamp}`,
      role: 'assistant',
      text: item.answer,
      trace: {
        references: item.referenceText ? [item.referenceText] : [],
        isTextbookMatch: itemMatch(item),
        hitRate: null,
        knowledgePoints: item.knowledgePoints ?? '',
        roundNo: item.roundNo,
        source: 'history',
      },
    },
  ];
  qaSessionId.value = item.sessionId;
  if (item.chapterId != null) selectedChapter.value = item.chapterId;
  scrollToBottom();
  ElMessage.success(`已回填第 ${item.roundNo} 轮问答，续问将沿用该 sessionId`);
}

/** 发送入口：按开关分流到同步问答或流式对话 */
function ask(question: string) {
  const q = question.trim();
  if (!q || sending.value) return;
  if (syncMode.value) void askSync(q);
  else askStream(q);
}

/** 已接桩：待实现 @/api/qa.askQuestion（POST /api/qa/ask） */
async function askSync(q: string) {
  sending.value = true;
  const stamp = Date.now();
  messages.value.push({ id: `q_${stamp}`, role: 'user', text: q });
  const pendingId = `a_${stamp}`;
  messages.value.push({ id: pendingId, role: 'assistant', text: '', pending: true });
  inputText.value = '';
  scrollToBottom();

  try {
    const res = await askQuestion({
      question: q,
      chapterId: selectedChapter.value ?? undefined,
      sessionId: qaSessionId.value ?? undefined,
    });
    qaSessionId.value = res.sessionId;
    const t = messages.value.find((m) => m.id === pendingId);
    if (t) {
      t.pending = false;
      t.text = res.answer;
      t.trace = {
        references: res.references ?? [],
        isTextbookMatch: res.isTextbookMatch,
        hitRate: res.hitRate,
        knowledgePoints: res.knowledgePoints ?? '',
        roundNo: res.roundNo,
        source: 'ask',
      };
    }
    void loadHistory();
  } catch {
    const t = messages.value.find((m) => m.id === pendingId);
    if (t) {
      t.pending = false;
      t.text = '接口待实现：askQuestion（POST /api/qa/ask）';
    }
    ElMessage.warning('同步问答接口待实现：askQuestion');
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

/** 真实流式问答：GET /api/chat/streamChat（SSE，不接收章节参数） */
function askStream(q: string) {
  sending.value = true;
  messages.value.push({ id: `q_${Date.now()}`, role: 'user', text: q });
  const pendingId = `a_${Date.now()}`;
  messages.value.push({ id: pendingId, role: 'assistant', text: '', pending: true });
  inputText.value = '';
  scrollToBottom();

  const target = () => messages.value.find((m) => m.id === pendingId);

  streamChatAnswer(
    q,
    {
      onMessage: (chunk) => {
        const t = target();
        if (t) {
          t.pending = false;
          t.text += chunk;
          scrollToBottom();
        }
      },
      onDone: () => {
        const t = target();
        if (t) t.pending = false;
        sending.value = false;
      },
      onError: (msg) => {
        const t = target();
        if (t) {
          t.pending = false;
          t.text = t.text || msg;
        }
        sending.value = false;
      },
      /** 后端二次确认事件：提示用户确认后重发 */
      onReconfirm: async (operationId, content) => {
        const t = target();
        if (t) {
          t.pending = false;
          t.text = t.text || content;
        }
        sending.value = false;
        try {
          await ElMessageBox.confirm(content || '智能体需要你的二次确认后才继续执行。', '需要二次确认', {
            confirmButtonText: '确认',
            cancelButtonText: '取消',
            type: 'warning',
          });
        } catch {
          ElMessage.info('已取消该操作');
          return;
        }
        // 以 confirm=true + operationId 重发，回答续接在新的气泡里
        const contId = `a_${Date.now()}_c`;
        messages.value.push({ id: contId, role: 'assistant', text: '', pending: true });
        sending.value = true;
        const cont = () => messages.value.find((m) => m.id === contId);
        await streamChatConfirm(
          q,
          {
            onMessage: (chunk) => {
              const c = cont();
              if (c) {
                c.pending = false;
                c.text += chunk;
                scrollToBottom();
              }
            },
            onDone: () => {
              const c = cont();
              if (c) c.pending = false;
              sending.value = false;
            },
            onError: (msg) => {
              const c = cont();
              if (c) {
                c.pending = false;
                c.text = c.text || msg;
              }
              sending.value = false;
            },
          },
          { conversationId, operationId },
        ).catch(() => {
          const c = cont();
          if (c) c.pending = false;
          sending.value = false;
        });
      },
    },
    conversationId,
  ).catch(() => {
    const t = target();
    if (t) t.pending = false;
    sending.value = false;
  });
}
</script>

<template>
  <div class="st-view qa-view">
    <header class="st-page-header">
      <h1 class="st-page-title">AI 智能答疑</h1>
      <p class="st-page-subtitle">教材知识答疑智能体 · 严格依据《Java 程序设计基础》作答，杜绝超纲内容</p>
    </header>

    <div class="qa-grid">
      <!-- 会话区 -->
      <section class="st-card qa-main">
        <!-- 消息列表 -->
        <div ref="messagesEl" class="qa-messages">
          <div v-if="messages.length === 0" class="st-empty" style="flex: 1; padding: 60px 16px;">
            <div class="st-empty__icon"><MessageCircleQuestion :size="44" :stroke-width="1.2" /></div>
            <div class="st-empty__text">有任何教材知识点、代码或习题疑问，尽管问我</div>
            <div class="qa-quick">
              <button v-for="q in QUICK_QUESTIONS" :key="q" class="qa-quick__item" @click="ask(q)">
                {{ q }}
              </button>
            </div>
          </div>

          <template v-for="m in messages" :key="m.id">
            <!-- 用户消息 -->
            <div v-if="m.role === 'user'" class="qa-msg qa-msg--user">
              <div class="qa-bubble qa-bubble--user">{{ m.text }}</div>
            </div>

            <!-- AI 回答（流式逐字输出 / 同步整段返回） -->
            <div v-else class="qa-msg qa-msg--assistant">
              <div class="qa-bubble qa-bubble--assistant">
                <div v-if="m.pending" class="qa-typing">
                  <span></span><span></span><span></span>
                </div>
                <div v-else class="qa-answer-text">{{ m.text }}</div>

                <!-- 溯源区：references / isTextbookMatch / hitRate / knowledgePoints -->
                <div v-if="!m.pending && m.trace" class="trace">
                  <div class="trace__head">
                    <span class="trace__title">
                      {{ m.trace.source === 'ask' ? '教材溯源' : '历史记录溯源' }}
                    </span>
                    <span class="st-badge" :class="matchMeta(m.trace.isTextbookMatch).badge">
                      {{ matchMeta(m.trace.isTextbookMatch).label }}
                    </span>
                    <span v-if="m.trace.roundNo" class="trace__round">第 {{ m.trace.roundNo }} 轮</span>
                  </div>

                  <div v-if="m.trace.hitRate !== null" class="trace__rate">
                    <span class="trace__rate-label">关键词命中率</span>
                    <div class="st-progress" style="flex: 1;">
                      <div class="st-progress__bar" :style="{ width: `${Math.round(m.trace.hitRate * 100)}%` }"></div>
                    </div>
                    <span class="trace__rate-value">{{ (m.trace.hitRate * 100).toFixed(0) }}%</span>
                  </div>

                  <div v-if="m.trace.knowledgePoints" class="trace__kp">
                    <span
                      v-for="(name, i) in splitPoints(m.trace.knowledgePoints)"
                      :key="`${name}-${i}`"
                      class="st-badge st-badge--outline"
                    >
                      {{ name }}
                    </span>
                  </div>

                  <ul v-if="m.trace.references.length" class="trace__refs">
                    <li v-for="(r, i) in m.trace.references" :key="i">{{ r }}</li>
                  </ul>
                  <p v-else class="trace__noref">
                    {{ m.trace.source === 'ask' ? '本次未命中教材原文引用' : '该记录未保存原文引用' }}
                  </p>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 输入区 -->
        <div class="qa-input">
          <textarea
            v-model="inputText"
            class="qa-input__textarea"
            placeholder="输入你的问题，Enter 发送…"
            rows="2"
            :disabled="sending"
            @keydown.enter.exact.prevent="ask(inputText)"
          ></textarea>
          <div class="qa-input__side">
            <label class="qa-sync">
              <span>同步提问</span>
              <el-switch v-model="syncMode" size="small" :disabled="sending" />
            </label>
            <button
              class="st-btn st-btn--primary qa-input__send"
              :disabled="!inputText.trim() || sending"
              @click="ask(inputText)"
            >
              <Loader2 v-if="sending && syncMode" :size="14" class="spin" />
              <Send v-else :size="14" /> 发送
            </button>
          </div>
        </div>
        <p class="qa-mode-hint">
          <template v-if="syncMode">
            已接桩：待实现 @/api/qa.askQuestion · POST /api/qa/ask —— 按
            {{ chapterLabel(selectedChapter) }} 限定，返回溯源区与 sessionId
          </template>
          <template v-else>
            当前走通用对话流 GET /api/chat/streamChat（真实接口，不接收 chapterId）；
            开启「同步提问」后才会按章节限定并给出溯源
          </template>
        </p>
      </section>

      <!-- 侧栏：章节限定 + 答疑记录 -->
      <aside class="qa-side">
        <section class="st-card">
          <div class="st-card__header">
            <h2 class="st-card__title">章节限定答疑</h2>
          </div>
          <div class="st-card__body">
            <p class="qa-side__hint">
              选择章节后随 qa 接口一起提交（askQuestion / history 查询参数），
              智能体严格限定在该章知识范围内作答，防止超前知识点泄露。
            </p>
            <el-select
              v-model="selectedChapter"
              placeholder="全书范围（不限定章节）"
              clearable
              size="default"
              style="width: 100%;"
            >
              <el-option
                v-for="c in chapters"
                :key="c.id"
                :label="`${c.chapterCode} ${c.title}`"
                :value="c.id"
              />
            </el-select>
            <p v-if="qaSessionId" class="qa-session">会话 sessionId：{{ qaSessionId }}</p>
          </div>
        </section>

        <!-- 已接桩：待实现 @/api/qa.fetchQaHistory（GET /api/qa/history，分页 records/total/current/size） -->
        <section class="st-card" style="margin-top: 16px;">
          <div class="st-card__header">
            <History :size="15" class="qa-side__icon" />
            <div>
              <h2 class="st-card__title">答疑记录</h2>
              <p class="st-card__hint">
                {{ loadingHistory ? '正在加载…' : historyError ? '暂无数据' : `共 ${historyTotal} 条` }}
              </p>
            </div>
            <button class="st-text-btn qa-side__reload" :disabled="loadingHistory" @click="loadHistory">
              <RefreshCw :size="12" /> 重新加载
            </button>
          </div>
          <div class="st-card__body" style="padding-top: 12px;">
            <div v-if="loadingHistory" class="st-empty" style="padding: 28px 16px;">
              <Loader2 :size="18" class="spin" />
              <div class="st-empty__text">正在读取答疑记录…</div>
            </div>
            <div v-else-if="historyError" class="st-empty" style="padding: 28px 16px;">
              <div class="st-empty__text">{{ historyError }}</div>
            </div>
            <div v-else-if="historyItems.length === 0" class="st-empty" style="padding: 28px 16px;">
              <div class="st-empty__text">该章节下暂无答疑记录</div>
            </div>

            <template v-else>
              <button
                v-for="item in historyItems"
                :key="item.id"
                class="qa-record"
                @click="fillFromHistory(item)"
              >
                <div class="qa-record__q">{{ item.question }}</div>
                <div class="qa-record__meta">
                  <span class="st-badge st-badge--neutral">{{ chapterLabel(item.chapterId) }}</span>
                  <span class="qa-record__round">第 {{ item.roundNo }} 轮</span>
                  <span class="qa-record__time">{{ fmtTime(item.createTime) }}</span>
                  <span class="st-badge" :class="matchMeta(itemMatch(item)).badge">
                    {{ matchMeta(itemMatch(item)).label }}
                  </span>
                </div>
              </button>
              <div class="qa-record__pager">
                <button class="st-text-btn" :disabled="historyPageNum <= 1" @click="goHistoryPage(-1)">
                  上一页
                </button>
                <span class="qa-record__page">{{ historyPageNum }} / {{ historyTotalPages }}</span>
                <button
                  class="st-text-btn"
                  :disabled="historyPageNum >= historyTotalPages"
                  @click="goHistoryPage(1)"
                >
                  下一页
                </button>
              </div>
            </template>
          </div>
        </section>

        <div class="qa-notice">
          <CircleAlert :size="13" />
          <span>答疑智能体只讲思路与教材原文，不直接代写作业代码。</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.qa-view {
  height: calc(100vh - 0px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.qa-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  min-height: 0;
}

.qa-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.qa-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qa-quick {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
  max-width: 420px;
}

.qa-quick__item {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 8px 14px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition);
}

.qa-quick__item:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-subtle);
}

.qa-msg {
  display: flex;
}

.qa-msg--user {
  justify-content: flex-end;
}

.qa-msg--assistant {
  justify-content: flex-start;
}

.qa-bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.65;
}

.qa-bubble--user {
  background: var(--text-primary);
  color: var(--bg-surface);
  border-bottom-right-radius: 4px;
  white-space: pre-wrap;
}

.qa-bubble--assistant {
  background: var(--bg-subtle);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 4px;
}

.qa-typing {
  display: inline-flex;
  gap: 4px;
  padding: 4px 0;
}

.qa-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: qa-bounce 1.2s ease-in-out infinite;
}

.qa-typing span:nth-child(2) { animation-delay: 0.15s; }
.qa-typing span:nth-child(3) { animation-delay: 0.3s; }

@keyframes qa-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.qa-answer-text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* 溯源区 */
.trace {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-strong);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trace__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.trace__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.trace__round {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.trace__rate {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trace__rate-label {
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.trace__rate-value {
  font-size: 11.5px;
  color: var(--text-secondary);
  min-width: 34px;
  text-align: right;
}

.trace__kp {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.trace__refs {
  margin: 0;
  padding: 10px 12px 10px 26px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.trace__noref {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 输入区 */
.qa-input {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 14px 16px 6px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.qa-input__textarea {
  flex: 1;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 9px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.qa-input__textarea:focus {
  border-color: var(--border-strong);
}

.qa-input__textarea::placeholder {
  color: var(--text-tertiary);
}

.qa-input__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.qa-sync {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.qa-input__send {
  height: 38px;
}

.qa-mode-hint {
  margin: 0;
  padding: 0 16px 12px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* 侧栏 */
.qa-side {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}

.qa-side__hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.55;
  margin-bottom: 12px;
}

.qa-side__icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.qa-side__reload {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.qa-session {
  margin: 10px 0 0;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  color: var(--text-tertiary);
  word-break: break-all;
}

.qa-record {
  display: block;
  width: 100%;
  text-align: left;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.qa-record:hover {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.qa-record__q {
  font-size: 12.5px;
  color: var(--text-primary);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.qa-record__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.qa-record__round,
.qa-record__time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.qa-record__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
}

.qa-record__page {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.qa-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  padding: 10px 12px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.5;
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-md);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .qa-grid {
    grid-template-columns: 1fr;
  }
  .qa-side {
    display: none;
  }
}
</style>
