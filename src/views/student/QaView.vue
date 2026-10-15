<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { CircleAlert, MessageCircleQuestion, Send } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchChapters, streamQaAnswer, streamQaConfirm } from '@/api/student';
import type { Chapter } from '@/types/student';

/** 界面会话消息 */
interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
}

const chapters = ref<Chapter[]>([]);
/**
 * 章节限定为 UI 预留项：GET /api/chat/streamChat 入参只有
 * message / conversationId / confirm / operationId，暂不支持按章节限定知识范围。
 * 接口预留：GET /api/qa/answer/stream?question&chapterId&sessionId 支持章节限定，
 * 与 POST /api/qa/ask（同步）、GET /api/qa/history（历史分页）同为后端已提供能力，待接入。
 */
const selectedChapter = ref<number | null>(null);
const inputText = ref('');
const sending = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const messages = ref<ChatMsg[]>([]);

/** 会话 ID：整页共用一个，保证多轮上下文连续 */
const conversationId = `student_qa_${Date.now()}`;

const QUICK_QUESTIONS = [
  'JDK、JRE、JVM 三者的关系是什么？',
  '重写与重载有什么区别？',
  '== 和 equals 比较字符串有什么不同？',
  'ArrayList 和 LinkedList 该怎么选？',
];

onMounted(() => {
  fetchChapters()
    .then((list) => {
      chapters.value = list;
    })
    .catch(() => {
      // 错误已由响应拦截器统一提示
    });
});

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  });
}

/** 真实流式问答：GET /api/chat/streamChat（SSE） */
function ask(question: string) {
  const q = question.trim();
  if (!q || sending.value) return;
  sending.value = true;
  messages.value.push({ id: `q_${Date.now()}`, role: 'user', text: q });
  const pendingId = `a_${Date.now()}`;
  messages.value.push({ id: pendingId, role: 'assistant', text: '', pending: true });
  inputText.value = '';
  scrollToBottom();

  const target = () => messages.value.find((m) => m.id === pendingId);

  streamQaAnswer(
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
        await streamQaConfirm(
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

            <!-- AI 回答（流式逐字输出） -->
            <div v-else class="qa-msg qa-msg--assistant">
              <div class="qa-bubble qa-bubble--assistant">
                <div v-if="m.pending" class="qa-typing">
                  <span></span><span></span><span></span>
                </div>
                <div v-else class="qa-answer-text">{{ m.text }}</div>
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
          <button class="st-btn st-btn--primary qa-input__send" :disabled="!inputText.trim() || sending" @click="ask(inputText)">
            <Send :size="14" /> 发送
          </button>
        </div>
      </section>

      <!-- 侧栏：章节限定 + 答疑记录 -->
      <aside class="qa-side">
        <section class="st-card">
          <div class="st-card__header">
            <h2 class="st-card__title">章节限定答疑</h2>
          </div>
          <div class="st-card__body">
            <p class="qa-side__hint">指定章节后，智能体严格限定在该章知识范围内作答，防止超前知识点泄露。</p>
            <el-select v-model="selectedChapter" placeholder="全书范围（不限定章节）" clearable size="default" style="width: 100%;">
              <el-option
                v-for="c in chapters"
                :key="c.id"
                :label="`${c.chapterCode} ${c.title}`"
                :value="c.id"
              />
            </el-select>
          </div>
        </section>

        <!-- 接口预留：GET /api/qa/history、POST /api/qa/ask（后端已提供，前端待接入） -->
        <section class="st-card" style="margin-top: 16px;">
          <div class="st-card__header">
            <h2 class="st-card__title">答疑记录</h2>
          </div>
          <div class="st-card__body" style="padding-top: 12px;">
            <div class="st-empty" style="padding: 28px 16px;">
              <div class="st-empty__text">暂无数据，接口待接入</div>
            </div>
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
  grid-template-columns: 1fr 300px;
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

.qa-input {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 14px 16px;
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

.qa-input__send {
  flex-shrink: 0;
  height: 38px;
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

@media (max-width: 960px) {
  .qa-grid {
    grid-template-columns: 1fr;
  }
  .qa-side {
    display: none;
  }
}
</style>
