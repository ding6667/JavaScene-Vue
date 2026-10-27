<template>
  <el-config-provider :message="messageConfig">
    <div class="app">
      <router-view />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
// App.vue - 极简根组件：只负责挂载路由出口，三端入口由登录后的选端页决定
import { ElConfigProvider } from 'element-plus';

/**
 * 全局消息配置：相同文案在展示期内重复触发时合并为一条（带重复次数）。
 * 并发请求同时失败（例如章节 + 模板同时拉取）只会弹一次，避免同一个网络错误说两遍。
 */
const messageConfig = { grouping: true, max: 5 };
</script>

<style>
/* ==================== 设计令牌 ==================== */
/* 中性暖灰底色 + 单一低饱和度强调色，遵循简约低调、现代留白风格 */
:root {
  /* 背景层级 */
  --bg-canvas: #fafaf9;        /* 页面底色 stone-50 */
  --bg-surface: #ffffff;       /* 卡片/表面 */
  --bg-subtle: #f5f5f4;        /* 次级背景 stone-100 */
  --bg-muted: #f0eeec;         /* 悬停态 stone-200/50 */

  /* 边框 */
  --border-default: #e7e5e4;   /* stone-200 */
  --border-subtle: #f0eeec;    /* 更浅的分割线 */
  --border-strong: #d6d3d1;    /* stone-300，用于激活态 */

  /* 文本 */
  --text-primary: #1c1917;     /* stone-900 */
  --text-secondary: #57534e;   /* stone-600 */
  --text-tertiary: #a8a29e;    /* stone-400 */

  /* 强调色（低饱和度暖灰） */
  --accent: #57534e;           /* stone-600 */
  --accent-hover: #44403c;     /* stone-700 */
  --accent-bg: #f5f5f4;        /* stone-100 */
  --accent-bg-strong: #e7e5e4; /* stone-200 */

  /* 状态色（均降低饱和度） */
  --status-success: #4d7c0f;   /* lime-700 */
  --status-success-bg: #f7fee7;/* lime-100 */
  --status-warning: #b45309;   /* amber-700 */
  --status-warning-bg: #fef3c7;/* amber-100 */
  --status-danger: #b91c1c;    /* red-700 */
  --status-danger-bg: #fef2f2; /* red-50 */
  --status-info: #475569;      /* slate-600 */
  --status-info-bg: #f1f5f9;   /* slate-100 */

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* 阴影（低强度、暖色调） */
  --shadow-sm: 0 1px 2px rgba(28, 25, 23, 0.04);
  --shadow-md: 0 1px 3px rgba(28, 25, 23, 0.05), 0 1px 2px rgba(28, 25, 23, 0.03);

  /* 过渡 */
  --transition: 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ==================== 全局重置 ==================== */
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: var(--bg-canvas);
  color: var(--text-primary);
  line-height: 1.6;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(28, 25, 23, 0.12);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(28, 25, 23, 0.2);
}

/* 选中文本 */
::selection {
  background: rgba(87, 83, 78, 0.15);
  color: var(--text-primary);
}

/* 链接默认样式 */
a {
  color: inherit;
  text-decoration: none;
}

/* 按钮基础重置 */
button {
  font-family: inherit;
}
</style>
