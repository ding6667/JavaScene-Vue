import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getStandards, createStandard, updateStandard, deleteStandard } from '@/api/standard';
import type { StandardConfig, StandardCreateRequest, StandardUpdateRequest } from '@/types/standard';

export const useStandardStore = defineStore('standard', () => {
  const standards = ref<StandardConfig[]>([]);
  const currentStandard = ref<StandardConfig | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** 获取所有评分标准模板，默认选中第一个 */
  async function fetchStandards() {
    loading.value = true;
    error.value = null;

    try {
      // 业务错误由拦截器统一提示
      const response = await getStandards();
      standards.value = response.data || [];
      // 默认选中第一个模板
      currentStandard.value = standards.value.length > 0 ? standards.value[0] : null;
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  /** 选择某个模板 */
  function selectStandard(id: number) {
    currentStandard.value = standards.value.find((s) => s.id === id) ?? null;
  }

  /** 创建评分标准模板，成功后刷新列表并选中新模板 */
  async function create(data: StandardCreateRequest) {
    try {
      const response = await createStandard(data);
      await fetchStandards();
      // 选中新创建的模板
      const newId = response.data?.id;
      if (newId) {
        selectStandard(newId);
      }
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  /** 更新评分标准模板，成功后刷新列表 */
  async function update(id: number, data: StandardUpdateRequest) {
    try {
      await updateStandard(id, data);
      await fetchStandards();
      selectStandard(id);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  /** 删除评分标准模板，成功后刷新列表并选中第一个 */
  async function remove(id: number) {
    try {
      await deleteStandard(id);
      await fetchStandards();
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  function reset() {
    standards.value = [];
    currentStandard.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    standards,
    currentStandard,
    loading,
    error,
    fetchStandards,
    selectStandard,
    create,
    update,
    remove,
    reset,
  };
});
