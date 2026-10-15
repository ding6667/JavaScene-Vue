import { defineStore } from 'pinia';
import { ref } from 'vue';
import { uploadFile } from '@/api/upload';
import { startProject, startCommon } from '@/api/grading';
import type { UploadProgress, StartGradingBase } from '@/types';

export const useUploadStore = defineStore('upload', () => {
  // ==================== State ====================
  const uploading = ref(false);
  const progress = ref<UploadProgress | null>(null);
  const uploadError = ref<string | null>(null);
  /** 多文件上传时当前正在上传的索引（从 1 开始） */
  const currentIndex = ref(0);
  /** 多文件上传总数 */
  const totalCount = ref(0);

  // ==================== Actions ====================
  /** ZIP 模式：只上传单个 zip 文件，返回文件 id（uploadId），失败返回 null */
  async function uploadZipOnly(file: File): Promise<string | null> {
    uploading.value = true;
    uploadError.value = null;
    totalCount.value = 1;
    currentIndex.value = 1;
    progress.value = null;
    try {
      const uploadRes = await uploadFile(file, (p) => { progress.value = p; }, 'ZIP');
      return uploadRes.data;
    } catch (e) {
      uploadError.value = (e as Error).message;
      return null;
    } finally {
      uploading.value = false;
    }
  }

  /** Word 模式：上传多个 word 文件，串行逐个上传，返回文件 id 列表，失败返回 null */
  async function uploadWordsOnly(files: File[]): Promise<string[] | null> {
    uploading.value = true;
    uploadError.value = null;
    totalCount.value = files.length;
    currentIndex.value = 0;
    progress.value = null;
    const uploadIds: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        currentIndex.value = i + 1;
        const res = await uploadFile(files[i], (p) => { progress.value = p; }, 'WORD');
        uploadIds.push(res.data);
      }
      return uploadIds;
    } catch (e) {
      uploadError.value = (e as Error).message;
      return null;
    } finally {
      uploading.value = false;
    }
  }

  /** ZIP 模式：上传成功后 → 调 startProject 启动批阅（由页面在“开始批阅”按钮时调用） */
  async function startZipGrading(uploadId: string, params: StartGradingBase): Promise<string | null> {
    try {
      const gradeRes = await startProject({ ...params, uploadId });
      return gradeRes.data;
    } catch (e) {
      uploadError.value = (e as Error).message;
      return null;
    }
  }

  /** Word 模式：上传成功后 → 调 startCommon 启动批阅 */
  async function startWordGrading(uploadIds: string[], params: StartGradingBase): Promise<string | null> {
    try {
      const gradeRes = await startCommon({ ...params, uploadIds });
      return gradeRes.data;
    } catch (e) {
      uploadError.value = (e as Error).message;
      return null;
    }
  }

  /** 【兼容旧调用】ZIP：上传 + 启动批阅 串联 */
  async function uploadZipAndStart(file: File, params: StartGradingBase): Promise<string | null> {
    const uploadId = await uploadZipOnly(file);
    if (!uploadId) return null;
    return startZipGrading(uploadId, params);
  }

  /** 【兼容旧调用】Word：上传 + 启动批阅 串联 */
  async function uploadWordAndStart(files: File[], params: StartGradingBase): Promise<string | null> {
    const uploadIds = await uploadWordsOnly(files);
    if (!uploadIds || uploadIds.length === 0) return null;
    return startWordGrading(uploadIds, params);
  }

  function reset() {
    uploading.value = false;
    progress.value = null;
    uploadError.value = null;
    currentIndex.value = 0;
    totalCount.value = 0;
  }

  return {
    uploading,
    progress,
    uploadError,
    currentIndex,
    totalCount,
    uploadZipOnly,
    uploadWordsOnly,
    startZipGrading,
    startWordGrading,
    uploadZipAndStart,
    uploadWordAndStart,
    reset,
  };
});
