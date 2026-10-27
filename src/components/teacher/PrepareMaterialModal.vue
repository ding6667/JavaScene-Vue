<script setup lang="ts">
/**
 * 备课材料卡片浮层（多卡片 Modal）
 * - 只有半透明遮罩，没有整体白色弹窗底板；1-5 张独立白卡直接浮在遮罩上
 * - PPT 卡独占一整行，支持「排版总览 / 单页放大」两种预览方式
 * - 右侧导航把对应卡片滚到屏幕中央（只滚动，不改卡片尺寸与位置）
 * - 点击遮罩 / 关闭按钮 / Esc 关闭；打开时锁定背景滚动，关闭后还原焦点
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FlaskConical,
  LayoutGrid,
  ListChecks,
  Loader2,
  Maximize2,
  Presentation,
  Target,
  X,
} from 'lucide-vue-next';
import type { Component, ComponentPublicInstance } from 'vue';
import type { PrepareRecordDetail, PrepareRecordItem } from '@/types/teacher';
import { renderMarkdown, splitMarkdownSlides } from '@/utils/markdown';

type MaterialKey = 'ppt' | 'lessonPlan' | 'keyPoints' | 'homework' | 'lab';

interface MaterialCard {
  key: MaterialKey;
  label: string;
  /** 右侧导航用的短标签，避免导航过宽遮挡卡片 */
  railLabel: string;
  desc: string;
  meta: string;
  icon: Component;
  text: string;
}

const props = defineProps<{
  open: boolean;
  loading?: boolean;
  detail: PrepareRecordDetail | null;
  /** 章节标题，由列表页统一解析，避免组件内重复请求章节 */
  chapterTitle?: string;
  /** 已格式化的备课时间 */
  timeText?: string;
  /** 列表当前行，用于判断导出 / 下载是否可用（详情接口没有这两项标记） */
  row?: PrepareRecordItem | null;
  exporting?: boolean;
  downloading?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  export: [];
  download: [];
}>();

const MD_SECTIONS: {
  key: Exclude<MaterialKey, 'ppt'>;
  label: string;
  railLabel: string;
  desc: string;
  icon: Component;
}[] = [
  { key: 'lessonPlan', label: '章节教案', railLabel: '教案', desc: '本章课堂的完整讲解稿，可导出为 Word', icon: BookOpen },
  { key: 'keyPoints', label: '重难点清单', railLabel: '重难点', desc: '本章必须掌握的知识点与常见易错项', icon: Target },
  { key: 'homework', label: '课后习题', railLabel: '习题', desc: '课后巩固练习，题干与参考答案一并整理', icon: ListChecks },
  { key: 'lab', label: '上机实训方案', railLabel: '实训', desc: '上机任务的步骤说明与参考实现', icon: FlaskConical },
];

const slides = computed(() => splitMarkdownSlides(props.detail?.pptxMd ?? ''));
/**
 * PPT 卡的出现口径与备课页保持一致：课件正文能切出页、或有课件文件，就渲染卡片。
 * 列表行的 hasPpt 只代表「.pptx 文件已产出」，只用来决定下载按钮可否点击——
 * 后端先写 pptx_md 再异步转文件，只按 hasPpt 判断会把有大纲没文件的记录判成「无 PPT」。
 */
const hasPpt = computed(
  () => !!props.row?.hasPpt || !!props.detail?.pptxUrl?.trim() || slides.value.length > 0,
);

/** 有几份材料就出几张卡；PPT 固定第一张并独占整行，其余按内容依次排列 */
const cards = computed<MaterialCard[]>(() => {
  const detail = props.detail;
  if (!detail) return [];
  const list: MaterialCard[] = [];
  if (hasPpt.value) {
    list.push({
      key: 'ppt',
      label: '课堂 PPT',
      railLabel: 'PPT',
      desc: slides.value.length
        ? '可放大逐页讲解，也可缩小总览整份课件的排版'
        : '本次备课已生成课件文件，可直接下载使用',
      meta: slides.value.length ? `${slides.value.length} 页 · 16:9` : '文件已生成',
      icon: Presentation,
      text: '',
    });
  }
  for (const s of MD_SECTIONS) {
    const text = (detail[s.key] ?? '').trim();
    if (!text) continue;
    list.push({
      key: s.key,
      label: s.label,
      railLabel: s.railLabel,
      desc: s.desc,
      meta: `${text.length} 字`,
      icon: s.icon,
      text,
    });
  }
  return list;
});

/* ---------------- 课件预览 ---------------- */
const pptMode = ref<'grid' | 'single'>('grid');
const activeSlide = ref(0);
const activeSlideMd = computed(() => slides.value[activeSlide.value] ?? '');

function openSlide(index: number) {
  activeSlide.value = index;
  pptMode.value = 'single';
}

function stepSlide(delta: number) {
  const next = activeSlide.value + delta;
  if (next < 0 || next >= slides.value.length) return;
  activeSlide.value = next;
}

watch(
  () => props.detail?.id,
  () => {
    pptMode.value = 'grid';
    activeSlide.value = 0;
  },
);

/* ---------------- 右侧导航 / 滚动定位 ---------------- */
const stageRef = ref<HTMLElement | null>(null);
const activeNav = ref<MaterialKey | null>(null);
const cardEls = new Map<MaterialKey, HTMLElement>();

let scrollRaf = 0;
let spyPaused = false;
let spyTimer: number | undefined;

function setCardRef(key: MaterialKey, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) cardEls.set(key, el);
  else cardEls.delete(key);
}

/** 滚动监听：取与视口中线最近的一张卡作为当前项 */
function onStageScroll() {
  if (!props.open || spyPaused || scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const stage = stageRef.value;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    let best: MaterialKey | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of cards.value) {
      const el = cardEls.get(c.key);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const top = Math.max(rect.top, box.top);
      const bottom = Math.min(rect.bottom, box.bottom);
      if (bottom <= top) continue;
      const dist = Math.abs((top + bottom) / 2 - middle);
      if (dist < bestDist) {
        bestDist = dist;
        best = c.key;
      }
    }
    if (best) activeNav.value = best;
  });
}

/** 把卡片滚到屏幕中央；卡片比视口还高时改为贴顶，全程不改变卡片尺寸与位置 */
function jumpTo(key: MaterialKey) {
  const stage = stageRef.value;
  const el = cardEls.get(key);
  if (!stage || !el) return;
  activeNav.value = key;
  spyPaused = true;
  const centered = el.offsetTop - (stage.clientHeight - el.offsetHeight) / 2;
  const topAligned = el.offsetTop - 20;
  const target = el.offsetHeight > stage.clientHeight - 40 ? topAligned : centered;
  stage.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  window.clearTimeout(spyTimer);
  spyTimer = window.setTimeout(() => {
    spyPaused = false;
  }, 650);
}

watch(
  cards,
  (list) => {
    if (!list.length) {
      activeNav.value = null;
      return;
    }
    if (!activeNav.value || !list.some((c) => c.key === activeNav.value)) {
      activeNav.value = list[0].key;
    }
  },
  { immediate: true },
);

/* ---------------- 焦点管理 / 滚动锁定 / Esc ---------------- */
const dialogRef = ref<HTMLElement | null>(null);
const closeBtnRef = ref<HTMLButtonElement | null>(null);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lastActiveEl: HTMLElement | null = null;
let bodyLocked = false;
let bodyOverflow = '';
let bodyPaddingRight = '';

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key !== 'Tab') return;

  const root = dialogRef.value;
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function lockBodyScroll() {
  if (bodyLocked) return;
  bodyOverflow = document.body.style.overflow;
  bodyPaddingRight = document.body.style.paddingRight;
  const gutter = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
  bodyLocked = true;
}

function unlockBodyScroll() {
  if (!bodyLocked) return;
  document.body.style.overflow = bodyOverflow;
  document.body.style.paddingRight = bodyPaddingRight;
  bodyLocked = false;
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      pptMode.value = 'grid';
      activeSlide.value = 0;
      lastActiveEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      lockBodyScroll();
      window.addEventListener('keydown', handleKeydown, true);
      await nextTick();
      closeBtnRef.value?.focus();
    } else {
      window.removeEventListener('keydown', handleKeydown, true);
      unlockBodyScroll();
      lastActiveEl?.focus();
      lastActiveEl = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true);
  unlockBodyScroll();
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  window.clearTimeout(spyTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="pv">
      <div
        v-if="open"
        ref="dialogRef"
        class="pv-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pv-modal-title"
        @click.self="emit('close')"
      >
        <button
          ref="closeBtnRef"
          class="pv-close"
          type="button"
          aria-label="关闭备课材料详情"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>

        <div ref="stageRef" class="pv-stage" @scroll.passive="onStageScroll" @click.self="emit('close')">
          <div class="pv-panel" @click.self="emit('close')">
            <header class="pv-head">
              <p class="pv-head__eyebrow">本次备课材料</p>
              <h2 id="pv-modal-title" class="pv-head__title">{{ chapterTitle || '备课材料' }}</h2>
              <p class="pv-head__meta">
                <span v-if="timeText">{{ timeText }}</span>
                <span v-if="cards.length">共 {{ cards.length }} 份材料</span>
                <span>点击空白处或按 Esc 关闭</span>
              </p>
            </header>

            <div v-if="loading" class="pv-hint">
              <Loader2 :size="18" class="pv-spin" />
              <span>正在汇总本次备课材料…</span>
            </div>

            <div v-else-if="!cards.length" class="pv-hint">
              <span>本次备课没有留下可回看的材料</span>
            </div>

            <div v-else class="pv-grid" @click.self="emit('close')">
              <article
                v-for="(c, i) in cards"
                :key="c.key"
                :ref="(el) => setCardRef(c.key, el)"
                class="pv-card"
                :class="{ 'pv-card--wide': c.key === 'ppt' }"
                :style="{ '--i': String(i) }"
              >
                <header class="pv-card__head">
                  <span class="pv-card__icon"><component :is="c.icon" :size="16" /></span>
                  <div class="pv-card__intro">
                    <h3 class="pv-card__title">{{ c.label }}</h3>
                    <p class="pv-card__desc">{{ c.desc }}</p>
                  </div>
                  <span class="pv-card__meta">{{ c.meta }}</span>
                </header>

                <!-- 课堂 PPT：排版总览 / 单页放大 -->
                <div v-if="c.key === 'ppt'" class="pv-ppt">
                  <div class="pv-ppt__bar">
                    <div class="pv-switch" role="group" aria-label="课件预览方式">
                      <button
                        class="pv-switch__btn"
                        :class="{ 'is-active': pptMode === 'grid' }"
                        type="button"
                        @click="pptMode = 'grid'"
                      >
                        <LayoutGrid :size="12" /> 排版
                      </button>
                      <button
                        class="pv-switch__btn"
                        :class="{ 'is-active': pptMode === 'single' }"
                        type="button"
                        @click="pptMode = 'single'"
                      >
                        <Maximize2 :size="12" /> 单页
                      </button>
                    </div>
                    <span class="pv-ppt__hint">
                      {{ slides.length ? '点击任意一页可放大' : '暂无正文预览' }}
                    </span>
                  </div>

                  <div v-if="slides.length && pptMode === 'grid'" class="pv-deck">
                    <button
                      v-for="(s, i) in slides"
                      :key="i"
                      class="pv-deck__item"
                      type="button"
                      :aria-label="`放大查看第 ${i + 1} 页`"
                      @click="openSlide(i)"
                    >
                      <span class="pv-deck__no">{{ i + 1 }}</span>
                      <div class="pv-md pv-md--thumb" v-html="renderMarkdown(s)" />
                    </button>
                  </div>

                  <div v-else-if="slides.length" class="pv-single">
                    <div class="pv-single__page">
                      <div class="pv-md pv-md--slide" v-html="renderMarkdown(activeSlideMd)" />
                    </div>
                    <div class="pv-single__nav">
                      <button
                        class="pv-mini"
                        type="button"
                        :disabled="activeSlide <= 0"
                        @click="stepSlide(-1)"
                      >
                        <ChevronLeft :size="13" /> 上一页
                      </button>
                      <span class="pv-single__dots">
                        <button
                          v-for="i in slides.length"
                          :key="i"
                          class="pv-dot"
                          :class="{ 'is-active': i - 1 === activeSlide }"
                          type="button"
                          :aria-label="`跳到第 ${i} 页`"
                          @click="activeSlide = i - 1"
                        />
                      </span>
                      <button
                        class="pv-mini"
                        type="button"
                        :disabled="activeSlide >= slides.length - 1"
                        @click="stepSlide(1)"
                      >
                        下一页 <ChevronRight :size="13" />
                      </button>
                    </div>
                  </div>

                  <p v-else class="pv-card__empty">
                    这次备课没有留下课件正文，只能下载已生成的课件文件。
                  </p>
                </div>

                <div v-else class="pv-card__body pv-md" v-html="renderMarkdown(c.text)" />

                <footer v-if="c.key === 'lessonPlan' || c.key === 'ppt'" class="pv-card__foot">
                  <template v-if="c.key === 'lessonPlan'">
                    <span class="pv-card__foot-hint">导出为标准 docx，可直接打印</span>
                    <button
                      class="pv-btn pv-btn--dark"
                      type="button"
                      :disabled="!row?.hasLessonPlan || exporting"
                      @click="emit('export')"
                    >
                      <Loader2 v-if="exporting" :size="13" class="pv-spin" />
                      <FileDown v-else :size="13" />
                      导出教案 Word
                    </button>
                  </template>
                  <template v-else>
                    <a
                      v-if="detail?.pptxUrl"
                      class="pv-card__foot-hint pv-link"
                      :href="detail.pptxUrl"
                      target="_blank"
                      rel="noopener"
                    >
                      查看课件文件
                    </a>
                    <span v-else class="pv-card__foot-hint">下载后可在 PowerPoint / WPS 中继续编辑</span>
                    <button
                      class="pv-btn pv-btn--dark"
                      type="button"
                      :disabled="!row?.hasPpt || downloading"
                      @click="emit('download')"
                    >
                      <Loader2 v-if="downloading" :size="13" class="pv-spin" />
                      <Download v-else :size="13" />
                      下载 PPT
                    </button>
                  </template>
                </footer>
              </article>
            </div>
          </div>
        </div>

        <nav v-if="cards.length" class="pv-rail" aria-label="材料快速定位">
          <button
            v-for="(c, i) in cards"
            :key="c.key"
            class="pv-rail__btn"
            :class="{ 'is-active': activeNav === c.key }"
            type="button"
            :aria-current="activeNav === c.key ? 'true' : undefined"
            :title="`定位到${c.label}`"
            @click="jumpTo(c.key)"
          >
            <span class="pv-rail__no">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="pv-rail__label">{{ c.railLabel }}</span>
          </button>
        </nav>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ---------- 遮罩：变暗 + 虚化，仍可隐约看到原页面 ---------- */
.pv-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
  padding-right: 148px; /* 右侧给导航条留位，遮罩本身仍铺满全屏 */
  background: rgba(20, 18, 16, 0.56);
  -webkit-backdrop-filter: blur(7px) saturate(0.86);
  backdrop-filter: blur(7px) saturate(0.86);
  overflow: hidden;
}

/* ---------- 滚动舞台：透明，卡片之间的间隙直接透出遮罩 ---------- */
.pv-stage {
  position: relative;
  height: 100%;
  padding: 44px 20px 64px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.26) transparent;
}

.pv-stage::-webkit-scrollbar {
  width: 8px;
}

.pv-stage::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 4px;
}

.pv-panel {
  max-width: 1200px;
  margin: 0 auto;
}

/* ---------- 顶部信息（直接浮在遮罩上，无白色底板） ---------- */
.pv-head {
  padding: 4px 4px 22px;
  color: #fff;
}

.pv-head__eyebrow {
  margin: 0 0 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.pv-head__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.3px;
  color: #fff;
}

.pv-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.pv-head__meta span {
  position: relative;
}

.pv-head__meta span + span::before {
  content: '·';
  position: absolute;
  left: -9px;
  color: rgba(255, 255, 255, 0.35);
}

/* ---------- 关闭按钮 ---------- */
.pv-close {
  position: fixed;
  top: 22px;
  right: 22px;
  z-index: 4;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition),
    transform var(--transition);
}

.pv-close:hover {
  background: #fff;
  border-color: #fff;
  color: var(--text-primary);
  transform: rotate(90deg);
}

.pv-close:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.85);
  outline-offset: 2px;
}

/* ---------- 卡片组 ---------- */
.pv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: start;
}

.pv-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 22px 24px;
  border-radius: 16px;
  background: var(--bg-surface);
  box-shadow: 0 12px 32px rgba(9, 8, 7, 0.22), 0 2px 6px rgba(9, 8, 7, 0.08);
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.28s ease,
    opacity 0.28s ease;
  animation: pv-card-rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
  animation-delay: calc(var(--i, 0) * 45ms + 40ms);
}

/* PPT 卡独占一整行 */
.pv-card--wide {
  grid-column: 1 / -1;
}

@keyframes pv-card-rise {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 悬停：焦点卡浮起微放大，其余卡片轻微收窄 —— 只作用于 transform，不改变布局位置 */
@media (hover: hover) and (pointer: fine) {
  .pv-card:hover {
    z-index: 2;
    transform: translateY(-6px) scale(1.015);
    box-shadow: 0 20px 48px rgba(9, 8, 7, 0.3), 0 4px 10px rgba(9, 8, 7, 0.1);
  }

  .pv-grid:has(.pv-card:hover) .pv-card:not(:hover) {
    transform: scale(0.985);
    opacity: 0.9;
  }
}

.pv-card__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pv-card__icon {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.pv-card__intro {
  flex: 1;
  min-width: 0;
}

.pv-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: var(--text-primary);
}

.pv-card__desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-tertiary);
}

.pv-card__meta {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
  color: var(--text-secondary);
}

/* 文本卡内容：按内容自然撑高，由外层浮层统一滚动，保证一个自然段能完整看到 */
.pv-card__body {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.pv-card__empty {
  margin: 0;
  padding: 20px 0 8px;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* ---------- PPT 卡 ---------- */
.pv-ppt {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.pv-ppt__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.pv-switch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
}

.pv-switch__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.pv-switch__btn:hover {
  color: var(--text-primary);
}

.pv-switch__btn.is-active {
  background: var(--text-primary);
  color: var(--bg-surface);
}

.pv-ppt__hint {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* 排版总览：16:9 缩略页，点击放大 */
.pv-deck {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  max-height: clamp(260px, 42vh, 500px);
  padding-right: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pv-deck__item {
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--bg-surface);
  overflow: hidden;
  cursor: zoom-in;
  font-family: inherit;
  text-align: left;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.pv-deck__item:hover {
  border-color: var(--text-primary);
  box-shadow: var(--shadow-md);
}

.pv-deck__no {
  position: absolute;
  top: 6px;
  right: 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10px;
  color: var(--text-tertiary);
}

/* 单页放大：16:9 大画板 + 翻页 */
.pv-single__page {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: min(56vh, 520px);
  padding: 28px 36px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: #fcfcfb;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pv-single__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.pv-single__dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

.pv-dot {
  width: 5px;
  height: 5px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--border-strong);
  cursor: pointer;
  transition: background var(--transition), transform var(--transition);
}

.pv-dot.is-active {
  background: var(--text-primary);
  transform: scale(1.5);
}

.pv-mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.pv-mini:hover:not(:disabled) {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.pv-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ---------- 卡片底部操作 ---------- */
.pv-card__foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.pv-card__foot-hint {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.pv-link {
  color: var(--text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pv-link:hover {
  color: var(--text-primary);
}

.pv-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition), opacity var(--transition);
}

.pv-btn--dark {
  border: 1px solid var(--text-primary);
  background: var(--text-primary);
  color: var(--bg-surface);
}

.pv-btn--dark:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.pv-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pv-card :focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}

/* ---------- 加载 / 空态 ---------- */
.pv-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 90px 20px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
}

.pv-spin {
  animation: pv-spin 0.9s linear infinite;
}

@keyframes pv-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- 右侧 1-5 定位按钮 ---------- */
.pv-rail {
  position: fixed;
  top: 50%;
  right: 22px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(20, 18, 16, 0.28);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  transform: translateY(-50%);
}

.pv-rail__btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.pv-rail__btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.pv-rail__btn.is-active {
  background: #fff;
  color: var(--text-primary);
}

.pv-rail__no {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10.5px;
  opacity: 0.7;
}

.pv-rail__btn.is-active .pv-rail__no {
  font-weight: 600;
  opacity: 1;
}

/* ---------- Markdown 正文 ---------- */
.pv-md {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
  word-break: break-word;
}

.pv-md :deep(.md-h) {
  margin: 12px 0 6px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.1px;
}

.pv-md :deep(.md-h:first-child) {
  margin-top: 0;
}

.pv-md :deep(.md-p) {
  margin: 3px 0;
}

.pv-md :deep(.md-list) {
  margin: 3px 0 6px 18px;
  padding: 0;
}

.pv-md :deep(.md-list li) {
  margin: 2px 0;
}

.pv-md :deep(.md-quote) {
  margin: 6px 0;
  padding: 5px 10px;
  border-left: 2px solid var(--border-strong);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.pv-md :deep(.md-pre) {
  margin: 8px 0;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  overflow-x: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.pv-md :deep(.md-code) {
  padding: 1px 5px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-subtle);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.pv-md :deep(.md-hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--border-default);
}

.pv-md :deep(.md-link) {
  color: var(--text-primary);
  text-decoration: underline;
}

/* 缩略页：只示意排版，正文超出即裁掉 */
.pv-md--thumb {
  height: 100%;
  overflow: hidden;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.pv-md--thumb :deep(.md-h) {
  margin: 2px 0;
  font-size: 11px;
}

.pv-md--thumb :deep(.md-p) {
  margin: 2px 0;
  font-size: 10.5px;
}

.pv-md--thumb :deep(.md-list) {
  margin: 2px 0 4px 14px;
  font-size: 10.5px;
}

.pv-md--thumb :deep(.md-pre) {
  margin: 4px 0;
  padding: 6px;
  font-size: 9.5px;
}

.pv-md--slide {
  font-size: 15px;
  line-height: 1.85;
}

/* ---------- 打开 / 关闭动画：淡入 + 轻微缩放 ---------- */
.pv-enter-active,
.pv-leave-active {
  transition: opacity 0.24s ease;
}

.pv-enter-from,
.pv-leave-to {
  opacity: 0;
}

.pv-enter-active .pv-panel,
.pv-leave-active .pv-panel {
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.22s ease;
}

.pv-enter-from .pv-panel,
.pv-leave-to .pv-panel {
  opacity: 0;
  transform: scale(0.97) translateY(10px);
}

/* ---------- 响应式 ---------- */
@media (max-width: 1023px) {
  .pv-overlay {
    padding-right: 0;
  }

  .pv-stage {
    padding: 48px 20px 88px;
  }

  .pv-head {
    padding-right: 40px;
  }

  /* 导航改为底部横向条，避免遮挡卡片 */
  .pv-rail {
    top: auto;
    right: 50%;
    bottom: 14px;
    flex-direction: row;
    max-width: calc(100% - 24px);
    overflow-x: auto;
    transform: translateX(50%);
  }

  .pv-rail__btn {
    padding: 6px 10px;
  }
}

@media (max-width: 860px) {
  .pv-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .pv-head__title {
    font-size: 19px;
  }

  .pv-single__page {
    padding: 18px 20px;
  }
}

@media (max-width: 560px) {
  .pv-close {
    top: 12px;
    right: 12px;
  }

  .pv-stage {
    padding: 56px 14px 82px;
  }

  .pv-head__title {
    font-size: 17px;
  }

  .pv-rail__label {
    display: none;
  }

  .pv-card {
    padding: 16px;
    border-radius: 14px;
  }

  .pv-card__meta {
    display: none;
  }

  .pv-single__dots {
    display: none;
  }

  .pv-ppt__hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pv-card {
    animation: none;
  }

  .pv-enter-active,
  .pv-leave-active,
  .pv-enter-active .pv-panel,
  .pv-leave-active .pv-panel {
    transition: none;
  }
}
</style>
