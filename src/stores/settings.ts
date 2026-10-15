import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getCommonSettings, updateCommonSettings, defaultSettings } from '@/api/settings';
import type { CommonSetting } from '@/types/settings';

export const useSettingsStore = defineStore('settings', () => {
  // ==================== State ====================
  const settings = ref<CommonSetting[]>([]);
  const loading = ref(false);

  // ==================== Actions ====================
  /**
   * 拉取常规设置；若返回 settings 为空（新用户未初始化），自动调用 defaultSettings 初始化
   */
  async function fetch() {
    loading.value = true;
    try {
      const res = await getCommonSettings();
      let list = res.data?.settings ?? [];
      // 查询返回空则调用 defaultSettings 初始化
      if (list.length === 0) {
        const def = await defaultSettings();
        list = def.data?.settings ?? [];
      }
      settings.value = list;
    } finally {
      loading.value = false;
    }
  }

  /** 更新单个配置项，并用返回的最新 settings 刷新本地状态 */
  async function update(configKey: number, configValue: string) {
    const res = await updateCommonSettings(configKey, configValue);
    if (res.data?.settings) {
      settings.value = res.data.settings;
    }
  }

  /** 恢复默认设置 */
  async function reset() {
    const res = await defaultSettings();
    settings.value = res.data?.settings ?? [];
  }

  return {
    settings,
    loading,
    fetch,
    update,
    reset,
  };
});
