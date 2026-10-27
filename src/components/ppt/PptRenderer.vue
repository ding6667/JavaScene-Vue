<script setup lang="ts">
/**
 * PPT 幻灯片渲染器
 * - Markdown 骨架按 `---` 分页，每页渲染成 1280×720 画板，按容器宽度等比缩放
 * - 主题 CSS 由 usePptTheme 动态拉取，注入 Shadow DOM，样式不会污染全局
 * - 主题变更 / 骨架编辑都会实时重绘；主题缓存在内存 + localStorage（version 失效）
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadPptThemeCss, readCachedPptThemeCss } from '@/composables/usePptTheme';
import { renderMarkdown, splitMarkdownSlides } from '@/utils/markdown';

const props = defineProps<{
  /** 幻灯片 Markdown 骨架（可为空） */
  structureMd: string;
  /** 后端主题编码，空字符串时只渲染基础样式 */
  themeCode: string;
  /** 主题版本号：用于本地缓存失效 */
  themeVersion?: number;
}>();

const hostRef = ref<HTMLElement | null>(null);

let shadow: ShadowRoot | null = null;
let themeStyle: HTMLStyleElement | null = null;
let stage: HTMLElement | null = null;
let observer: ResizeObserver | null = null;
/** 异步主题请求序号：切换主题/骨架后丢弃过期结果 */
let renderSeq = 0;

const SLIDE_WIDTH = 1280;

/**
 * 画板基础样式。
 * 这里的字号、间距只是主题加载失败时的兜底，全部用元素选择器（不加类/后代限定），
 * 保证随后注入的主题 CSS 以相同优先级覆盖它们。
 */
const BASE_CSS = `
:host {
  display: block;
  width: 100%;
}

.ppt-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  transition: opacity 0.2s ease;
}

.ppt-stage.is-loading {
  opacity: 0.45;
}

.ppt-stage.is-error::before {
  content: '主题加载失败，当前显示基础样式';
  display: block;
  margin-bottom: 8px;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 12px;
  color: #b45309;
}

.ppt-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid #e7e5e4;
  border-radius: 10px;
  background: #ffffff;
}

.ppt-slide {
  position: absolute;
  top: 0;
  left: 0;
  width: ${SLIDE_WIDTH}px;
  height: 720px;
  box-sizing: border-box;
  overflow: hidden;
  transform-origin: top left;
}

.ppt-empty {
  padding: 32px 20px;
  border: 1px dashed #d6d3d1;
  border-radius: 10px;
  text-align: center;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 13px;
  color: #a8a29e;
}

/* ---------- 无主题时的基础排版（会被主题 CSS 覆盖） ---------- */
section {
  padding: 64px 72px;
  background: #ffffff;
  color: #333333;
  font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", sans-serif;
  font-size: 26px;
  line-height: 1.6;
}

h1 { margin: 0 0 18px; font-size: 44px; }
h2 { margin: 22px 0 10px; font-size: 32px; }
h3 { margin: 18px 0 8px; font-size: 28px; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0 8px 28px; padding: 0; }
li { margin: 6px 0; }
strong { font-weight: 700; }
blockquote { margin: 12px 0; padding-left: 16px; border-left: 4px solid #d6d3d1; color: #666666; }
pre { margin: 16px 0; padding: 18px 20px; background: #f5f5f4; border-radius: 8px; overflow: hidden; font-family: Consolas, "Courier New", monospace; font-size: 20px; line-height: 1.5; }
code { font-family: Consolas, "Courier New", monospace; }
pre code { padding: 0; background: none; }
table { border-collapse: collapse; }
th, td { padding: 8px 14px; border: 1px solid #d6d3d1; }
`;

/** Markdown 骨架 → 多张 16:9 画板 */
function slidesMarkup(markdown: string): string {
  const slides = splitMarkdownSlides(markdown.trim());
  if (!slides.length) return '<div class="ppt-empty">暂无可渲染的幻灯片内容</div>';
  return slides
    .map(
      (md) =>
        `<div class="ppt-frame"><section class="ppt-slide">${renderMarkdown(md, { headingOffset: 0 })}</section></div>`,
    )
    .join('');
}

/** 按容器实际宽度等比缩放 1280×720 画板 */
function fitSlides() {
  if (!shadow) return;
  shadow.querySelectorAll<HTMLElement>('.ppt-frame').forEach((frame) => {
    const slide = frame.querySelector<HTMLElement>('.ppt-slide');
    if (!slide) return;
    const width = frame.clientWidth;
    if (!width) return;
    slide.style.transform = `scale(${width / SLIDE_WIDTH})`;
  });
}

function ensureShadow(host: HTMLElement) {
  if (shadow) return;
  shadow = host.attachShadow({ mode: 'open' });

  const base = document.createElement('style');
  base.textContent = BASE_CSS;
  shadow.appendChild(base);

  themeStyle = document.createElement('style');
  shadow.appendChild(themeStyle);

  stage = document.createElement('div');
  stage.className = 'ppt-stage';
  shadow.appendChild(stage);
}

async function render() {
  const host = hostRef.value;
  if (!host) return;

  const seq = ++renderSeq;
  ensureShadow(host);
  if (!stage || !themeStyle) return;

  stage.classList.remove('is-error');
  stage.innerHTML = slidesMarkup(props.structureMd);
  await nextTick();
  fitSlides();

  if (!props.themeCode) {
    themeStyle.textContent = '';
    stage.classList.remove('is-loading');
    return;
  }

  // 首帧命中缓存时同步注入，避免主题异步到达前的样式闪烁
  const cached = readCachedPptThemeCss(props.themeCode, props.themeVersion);
  if (cached != null) {
    themeStyle.textContent = cached;
    stage.classList.remove('is-loading');
    fitSlides();
    return;
  }

  themeStyle.textContent = '';
  stage.classList.add('is-loading');
  try {
    const css = await loadPptThemeCss(props.themeCode, props.themeVersion);
    if (seq !== renderSeq) return;
    themeStyle.textContent = css;
    stage.classList.remove('is-loading');
    fitSlides();
  } catch {
    if (seq !== renderSeq) return;
    stage.classList.remove('is-loading');
    stage.classList.add('is-error');
  }
}

onMounted(() => {
  if (hostRef.value) {
    observer = new ResizeObserver(() => fitSlides());
    observer.observe(hostRef.value);
  }
  render();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  renderSeq += 1;
});

watch(
  () => [props.structureMd, props.themeCode, props.themeVersion],
  () => render(),
);
</script>

<template>
  <div ref="hostRef" class="ppt-renderer"></div>
</template>

<style scoped>
.ppt-renderer {
  width: 100%;
}
</style>
