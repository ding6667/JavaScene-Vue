import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getUploadFiles, deleteUploadFile, batchDeleteUploadFiles, downloadUploadFile } from '@/api/uploadFiles';
import type { UploadFileRecord, UploadFileQuery } from '@/types/uploadFile';

export const useUploadFileStore = defineStore('uploadFile', () => {
  const records = ref<UploadFileRecord[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchFiles(params: UploadFileQuery) {
    loading.value = true;
    error.value = null;

    try {
      // 业务错误由拦截器统一提示
      const response = await getUploadFiles(params);
      // 调试日志：确认后端实际返回结构
      console.log('[uploadFile] fetchFiles 完整响应:', response);
      // 兼容两种结构：
      // 1) 拦截器返回业务体 { code, message, data: { records, total, ... } }
      // 2) 后端直接返回分页对象 { records, total, ... }（无 code 包装）
      const page = (response.data ?? response) as { records?: UploadFileRecord[]; total?: number };
      records.value = page.records ?? [];
      total.value = Number(page.total ?? 0);
      console.log('[uploadFile] 解析结果 records:', records.value, 'total:', total.value);
    } catch (e) {
      console.error('[uploadFile] fetchFiles 异常:', e);
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function deleteFile(id: string) {
    try {
      await deleteUploadFile(id);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function batchDelete(ids: string[]) {
    try {
      await batchDeleteUploadFiles(ids);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function downloadFile(id: string, fileName: string) {
    try {
      const blob = await downloadUploadFile(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  function reset() {
    records.value = [];
    total.value = 0;
    loading.value = false;
    error.value = null;
  }

  return {
    records,
    total,
    loading,
    error,
    fetchFiles,
    deleteFile,
    batchDelete,
    downloadFile,
    reset,
  };
});
