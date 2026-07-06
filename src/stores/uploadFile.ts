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
      const response = await getUploadFiles(params);
      if (response.code === 0 || response.code === 200) {
        records.value = response.data.list;
        total.value = response.data.total;
      } else {
        error.value = response.message;
      }
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      loading.value = false;
    }
  }

  async function deleteFile(id: string) {
    try {
      const response = await deleteUploadFile(id);
      return response.code === 0 || response.code === 200;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function batchDelete(ids: string[]) {
    try {
      const response = await batchDeleteUploadFiles(ids);
      return response.code === 0 || response.code === 200;
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
