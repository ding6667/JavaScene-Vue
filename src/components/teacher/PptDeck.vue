<script setup lang="ts">
/**
 * 课件预览：把 PPT 的 Markdown 正文按分页符切成一页页 16:9 画板直接渲染。
 * 备课结果页与备课记录详情共用。
 */
import { computed } from 'vue';
import { renderMarkdown, splitMarkdownSlides } from '@/utils/markdown';

const props = defineProps<{ md: string }>();

const slides = computed(() => splitMarkdownSlides(props.md ?? ''));
</script>

<template>
  <div v-if="slides.length" class="deck">
    <article v-for="(slide, i) in slides" :key="i" class="deck__slide">
      <span class="deck__no">{{ i + 1 }}</span>
      <div class="md md--slide" v-html="renderMarkdown(slide)" />
    </article>
  </div>
  <p v-else class="deck__empty">这次备课没有留下课件正文，只能下载已生成的课件文件。</p>
</template>

<style scoped>
.deck {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.deck__slide {
  position: relative;
  aspect-ratio: 16 / 9;
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow-y: auto;
}

.deck__no {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.md--slide {
  font-size: 12px;
}

.deck__empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
}
</style>
