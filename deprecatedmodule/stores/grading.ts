import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { pauseGrading, resumeGrading, cancelGrading, retryGrading } from '@/api/grading';
import { getTaskDetail } from '@/api/history';
import type { GradingTask } from '@/types/history';

/**
 * 批阅任务状态
 * 进度来源：GET /api/grading/task/detail/{taskId}（studentCount / processedStudentCount / status）
 * 说明：后端未提供"按任务查各学生成绩"的接口，成绩明细列表留待页面按 UI 占位。
 */
export const useGradingStore = defineStore('grading', () => {
  const taskId = ref<string | null>(null);
  const task = ref<GradingTask | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** 任务是否仍在进行中 */
  const gradingActive = computed(() => task.value?.status === 'PENDING' || task.value?.status === 'PROCESSING');

  const progressPercent = computed(() => {
    const t = task.value;
    if (!t || !t.studentCount) return 0;
    return Math.round((t.processedStudentCount / t.studentCount) * 100);
  });

  function setTaskId(id: string) {
    taskId.value = id;
  }

  /** GET /api/grading/task/detail/{taskId} —— 拉取任务进度 */
  async function fetchProgress() {
    if (!taskId.value) return;
    loading.value = true;
    try {
      const res = await getTaskDetail(taskId.value);
      task.value = res.data;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  function startPolling(interval = 2000) {
    stopPolling();
    pollTimer = setInterval(() => {
      fetchProgress();
      if (!gradingActive.value) stopPolling();
    }, interval);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pause() {
    if (!taskId.value) return false;
    try {
      await pauseGrading(taskId.value);
      await fetchProgress();
      stopPolling();
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function resume() {
    if (!taskId.value) return false;
    try {
      await resumeGrading(taskId.value);
      await fetchProgress();
      startPolling(2000);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function cancel() {
    if (!taskId.value) return false;
    try {
      await cancelGrading(taskId.value);
      stopPolling();
      await fetchProgress();
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function retry() {
    if (!taskId.value) return false;
    try {
      await retryGrading(taskId.value);
      await fetchProgress();
      startPolling(2000);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  function reset() {
    taskId.value = null;
    task.value = null;
    loading.value = false;
    error.value = null;
    stopPolling();
  }

  return {
    taskId,
    task,
    loading,
    error,
    gradingActive,
    progressPercent,
    setTaskId,
    fetchProgress,
    startPolling,
    stopPolling,
    pause,
    resume,
    cancel,
    retry,
    reset,
  };
});
