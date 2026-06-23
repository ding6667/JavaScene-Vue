import { defineStore } from 'pinia';
import { ref } from 'vue';
import { uploadZip, startGrading } from '@/api/upload';
import type { UploadProgress } from '@/types';

export const useUploadStore = defineStore('upload', () => {
  // ==================== State ====================
  const uploading = ref(false);
  const progress = ref<UploadProgress | null>(null);
  const uploadError = ref<string | null>(null);
  const uploadId = ref<string | null>(null);

  // ==================== Actions ====================
  async function handleUpload(file: File) {
    uploading.value = true;
    uploadError.value = null;
    uploadId.value = null;

    try {
      const response = await uploadZip(file, (p) => {
        progress.value = p;
      });

      if (response.code === 0 || response.code === 200) {
        uploadId.value = response.data.uploadId;
        return true;
      } else {
        uploadError.value = response.message || '上传失败';
        return false;
      }
    } catch (e) {
      uploadError.value = (e as Error).message;
      return false;
    } finally {
      uploading.value = false;
    }
  }

  async function triggerGrading() {
    if (!uploadId.value) return false;

    try {
      const response = await startGrading(uploadId.value);
      return response.code === 0 || response.code === 200;
    } catch (e) {
      uploadError.value = (e as Error).message;
      return false;
    }
  }

  function reset() {
    uploading.value = false;
    progress.value = null;
    uploadError.value = null;
    uploadId.value = null;
  }

  return {
    uploading,
    progress,
    uploadError,
    uploadId,
    handleUpload,
    triggerGrading,
    reset,
  };
});
