<script setup lang="ts">
/**
 * StandaloneLayout —— 独立页模板（无侧边栏 / 无导航）
 *
 * 适用：所有「新标签页打开」的页面，例如作答页、试卷预览页、打印页、大图查看页。
 * 这类页面没有来路上下文，用户也不在这里做多级导航，挂侧边栏只会白占宽度、
 * 还会带来「收起后左边空 160px」的老问题，所以统一套这层空画布。
 *
 * 用法（src/router/index.ts）：
 *   {
 *     path: '/student/practice/solve/:questionId',
 *     component: () => import('@/views/StandaloneLayout.vue'),
 *     meta: { roles: ['STUDENT'], standalone: true, assistant: true, title: '题目作答' },
 *     children: [
 *       { path: '', name: 'StudentPracticeSolve', component: ..., props: true },
 *     ],
 *   }
 *
 * meta 约定：
 *   standalone: true     标记这是独立页（仅作语义标识，便于检索/埋点）
 *   standaloneFluid: true 取消 1680px 的内容上限，页面自己铺满整个窗口（画布类页面用）
 *   assistant: true      右下角挂 AI 答疑浮窗（学生端页面用）
 *
 * 约束：画布底色、视口高度、统一留白、滚动容器都在这里；页面自身不要再写
 * padding / min-height:100vh，只负责内容与栅格。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ChatWidget from '@/components/chat/ChatWidget.vue';

const route = useRoute();

/** 是否铺满窗口（默认居中并限制最大阅读宽度） */
const fluid = computed(() => route.meta.standaloneFluid === true);
/** 是否挂 AI 答疑浮窗 */
const showAssistant = computed(() => route.meta.assistant === true);
</script>

<template>
  <div class="standalone-shell">
    <main class="standalone-body">
      <div class="standalone-canvas" :class="{ 'standalone-canvas--fluid': fluid }">
        <router-view />
      </div>
    </main>

    <ChatWidget v-if="showAssistant" />
  </div>
</template>

<style scoped>
.standalone-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-canvas);
}

/* 滚动容器：整页只有这一处滚动，页面内的 sticky 以它为参照 */
.standalone-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 22px 28px 32px;
}

.standalone-canvas {
  width: 100%;
  max-width: 1680px;
  margin: 0 auto;
}

/* 画布类页面（白板 / 编辑器 / 大图）用：铺满窗口，不留统一上限 */
.standalone-canvas--fluid {
  max-width: none;
}
</style>
