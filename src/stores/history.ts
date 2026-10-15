import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getZipTaskList, getFileTaskList, getTaskDetail } from '@/api/history';
import type { GradingTask, TaskQuery, TaskDetail } from '@/types/history';
import { FileType } from '@/types/history';

export const useHistoryStore = defineStore('history', () => {
  const tasks = ref<GradingTask[]>([]);
  const total = ref(0);
  const current = ref(1);
  const size = ref(10);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const taskDetail = ref<TaskDetail | null>(null);
  const detailLoading = ref(false);

  /**
   * 获取任务列表
   * fileType 为 undefined 时同时拉取 ZIP + WORD 两种类型并合并
   */
  async function fetchTasks(query: TaskQuery, fileType?: FileType) {
    loading.value = true;
    error.value = null;

    try {
      if (fileType === undefined) {
        // 同时拉取两种类型，合并结果
        const [zipRes, fileRes] = await Promise.all([
          getZipTaskList(query),
          getFileTaskList(query),
        ]);

        const zipRecords = zipRes.data?.records || [];
        const fileRecords = fileRes.data?.records || [];

        // 合并并按 createTime 降序排序
        const merged = [...zipRecords, ...fileRecords].sort((a, b) => {
          return (b.createTime || '').localeCompare(a.createTime || '');
        });

        tasks.value = merged;
        total.value = Number(zipRes.data?.total || 0) + Number(fileRes.data?.total || 0);
        current.value = query.page;
        size.value = query.size;
      } else if (fileType === FileType.ZIP) {
        const res = await getZipTaskList(query);
        tasks.value = res.data?.records || [];
        total.value = Number(res.data?.total || 0);
        current.value = Number(res.data?.current || query.page);
        size.value = Number(res.data?.size || query.size);
      } else {
        const res = await getFileTaskList(query);
        tasks.value = res.data?.records || [];
        total.value = Number(res.data?.total || 0);
        current.value = Number(res.data?.current || query.page);
        size.value = Number(res.data?.size || query.size);
      }
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  /** 获取任务详情 */
  async function fetchTaskDetail(taskId: string) {
    detailLoading.value = true;
    try {
      const res = await getTaskDetail(taskId);
      taskDetail.value = res.data;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      detailLoading.value = false;
    }
  }

  function reset() {
    tasks.value = [];
    total.value = 0;
    current.value = 1;
    size.value = 10;
    loading.value = false;
    error.value = null;
    taskDetail.value = null;
  }

  return {
    tasks,
    total,
    current,
    size,
    loading,
    error,
    taskDetail,
    detailLoading,
    fetchTasks,
    fetchTaskDetail,
    reset,
  };
});
