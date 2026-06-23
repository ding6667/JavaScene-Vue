import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getGradingProgress, getGradingResults, exportExcel } from '@/api/grading';
import type { GradingProgress, GradingResult } from '@/types';

export const useGradingStore = defineStore('grading', () => {
  // ==================== State ====================
  const gradingId = ref<string | null>(null);
  const gradingActive = ref(false);
  const progress = ref<GradingProgress | null>(null);
  const results = ref<GradingResult[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // 轮询定时器
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // ==================== Getters ====================
  const progressPercent = computed(() => {
    if (!progress.value || progress.value.total === 0) return 0;
    return Math.round((progress.value.completed / progress.value.total) * 100);
  });

  const statusCounts = computed(() => ({
    pending: progress.value?.pending ?? 0,
    processing: progress.value?.processing ?? 0,
    completed: progress.value?.completed ?? 0,
    failed: progress.value?.failed ?? 0,
  }));

  // ==================== Actions ====================
  function setGradingId(id: string) {
    gradingId.value = id;
  }

  async function fetchProgress() {
    if (!gradingId.value) return;

    try {
      const response = await getGradingProgress(gradingId.value);
      if (response.code === 0 || response.code === 200) {
        progress.value = response.data;
        const p = progress.value;
        gradingActive.value =
          (p.pending ?? 0) > 0 || (p.processing ?? 0) > 0;
      } else {
        error.value = response.message;
      }
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  async function fetchResults() {
    if (!gradingId.value) return;

    loading.value = true;
    error.value = null;

    try {
      const response = await getGradingResults(gradingId.value);
      if (response.code === 0 || response.code === 200) {
        results.value = response.data;
      } else {
        error.value = response.message;
      }
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  // 开始轮询进度
  function startPolling(interval = 2000) {
    stopPolling();
    pollTimer = setInterval(() => {
      fetchProgress();

      // 如果批阅已结束，停止轮询并刷新结果
      if (!gradingActive.value) {
        stopPolling();
        fetchResults();
      }
    }, interval);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function handleExport(format = 'xlsx') {
    if (!gradingId.value) return;

    try {
      const blob = await exportExcel(gradingId.value, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grading_results.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  function refreshResults() {
    fetchResults();
  }

  function reset() {
    gradingId.value = null;
    gradingActive.value = false;
    progress.value = null;
    results.value = [];
    loading.value = false;
    error.value = null;
    stopPolling();
  }

  // 按分数筛选的辅助方法
  function filterByScore(minScore?: number, maxScore?: number): GradingResult[] {
    return results.value.filter((r) => {
      if (minScore !== undefined && r.score < minScore) return false;
      if (maxScore !== undefined && r.score > maxScore) return false;
      return true;
    });
  }

  return {
    gradingId,
    gradingActive,
    progress,
    results,
    loading,
    error,
    progressPercent,
    statusCounts,
    setGradingId,
    fetchProgress,
    fetchResults,
    startPolling,
    stopPolling,
    handleExport,
    refreshResults,
    filterByScore,
    reset,
  };
});
