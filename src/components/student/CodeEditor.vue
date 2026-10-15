<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { highlightJava } from '@/utils/javaHighlight';

/**
 * 轻量 Java 代码编辑器
 * - textarea（透明文字）叠在高亮 pre 上，实现基础语法高亮
 * - 行号栏 + 错误行标注（红点）
 */
const props = defineProps<{
  modelValue: string;
  /** 需要标注的错误行（1-based） */
  errorLines?: number[];
  height?: string;
  readOnly?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const scrollTop = ref(0);
const scrollLeft = ref(0);

const lines = computed(() => props.modelValue.split('\n'));

const highlighted = computed(() => highlightJava(props.modelValue) + '\n');

const lineMeta = computed(() =>
  lines.value.map((_, i) => ({ no: i + 1, isError: props.errorLines?.includes(i + 1) ?? false })),
);

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
}

function onScroll(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  scrollTop.value = el.scrollTop;
  scrollLeft.value = el.scrollLeft;
}

/** Tab 键插入两个空格 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const el = e.target as HTMLTextAreaElement;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = props.modelValue.slice(0, start) + '  ' + props.modelValue.slice(end);
    emit('update:modelValue', next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  }
}

watch(
  () => props.modelValue,
  () => {
    // 内容变化时保持滚动位置
  },
);
</script>

<template>
  <div class="code-editor" :style="{ height: height ?? '360px' }">
    <!-- 行号栏 -->
    <div class="code-editor__gutter" :style="{ transform: `translateY(-${scrollTop}px)` }">
      <div
        v-for="l in lineMeta"
        :key="l.no"
        class="code-editor__lineno"
        :class="{ 'code-editor__lineno--error': l.isError }"
      >
        {{ l.no }}
      </div>
    </div>

    <!-- 编辑区 -->
    <div class="code-editor__area">
      <pre class="code-editor__highlight st-code" aria-hidden="true"><div :style="{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }" v-html="highlighted"></div></pre>
      <textarea
        ref="textareaRef"
        class="code-editor__input st-code"
        :value="modelValue"
        spellcheck="false"
        :readonly="readOnly"
        @input="onInput"
        @scroll="onScroll"
        @keydown="onKeydown"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
.code-editor {
  display: flex;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #fbfbfa;
}

.code-editor__gutter {
  width: 44px;
  background: var(--bg-subtle);
  border-right: 1px solid var(--border-subtle);
  padding: 12px 0;
  text-align: right;
  flex-shrink: 0;
  overflow: hidden;
  user-select: none;
}

.code-editor__lineno {
  height: 20.6px; /* 与 12.5px * 1.65 行高一致 */
  padding-right: 10px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  position: relative;
}

.code-editor__lineno--error {
  color: var(--status-danger);
  font-weight: 600;
}

.code-editor__lineno--error::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--status-danger);
}

.code-editor__area {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.code-editor__highlight {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px 14px;
  overflow: hidden;
  pointer-events: none;
  white-space: pre;
}

.code-editor__highlight > div {
  will-change: transform;
}

.code-editor__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 12px 14px;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  color: transparent;
  caret-color: var(--text-primary);
  white-space: pre;
  overflow: auto;
}

.code-editor__input::selection {
  background: rgba(87, 83, 78, 0.25);
}
</style>
