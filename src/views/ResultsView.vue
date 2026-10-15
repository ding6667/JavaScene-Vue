<template>
  <div class="results-view">
    <header class="page-header">
      <h1 class="page-title">批阅结果</h1>
      <p class="page-subtitle">查看历史批阅记录和成绩详情</p>
    </header>

    <div class="empty-state">
      <p class="empty-text">暂无批阅结果</p>
      <p class="empty-hint">请先上传作业进行批阅</p>
      <button class="btn-primary" @click="goToUpload">
        去上传作业
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goToUpload() {
  router.push('/');
}
</script>

<style scoped>
.results-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  letter-spacing: -0.3px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 96px 24px;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0 0 6px 0;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0 0 24px 0;
}

.btn-primary {
  height: 36px;
  padding: 0 18px;
  background: var(--text-primary);
  color: var(--bg-surface);
  border: 1px solid var(--text-primary);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
}

.btn-primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

@media (max-width: 640px) {
  .results-view {
    padding: 24px 16px;
  }

  .page-title {
    font-size: 20px;
  }
}
</style>
