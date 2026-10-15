import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getClassRecords,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
} from '@/api/class';
import type {
  ClassRecord,
  ClassSaveRequest,
  ClassQuery,
} from '@/types/class';

export const useClassStore = defineStore('class', () => {
  const records = ref<ClassRecord[]>([]);
  const total = ref(0);
  const current = ref(1);
  const size = ref(10);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchRecords(params: ClassQuery) {
    loading.value = true;
    error.value = null;

    try {
      // 业务错误由拦截器统一提示，到达此处说明 code 为 0/200
      const response = await getClassRecords(params);
      records.value = response.data.records;
      total.value = response.data.total;
      current.value = response.data.current;
      size.value = response.data.size;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchById(id: number) {
    try {
      const response = await getClassById(id);
      return response.data;
    } catch (e) {
      error.value = (e as Error).message;
      return null;
    }
  }

  async function save(data: ClassSaveRequest) {
    try {
      const response = data.id
        ? await updateClass(data)
        : await createClass(data);
      return !!response.data;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function remove(id: number) {
    try {
      await deleteClass(id);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  function reset() {
    records.value = [];
    total.value = 0;
    current.value = 1;
    size.value = 10;
    loading.value = false;
    error.value = null;
  }

  return {
    records,
    total,
    current,
    size,
    loading,
    error,
    fetchRecords,
    fetchById,
    save,
    remove,
    reset,
  };
});
