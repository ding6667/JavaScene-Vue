import type { UploadProgress, UploadResponse, ApiResponse } from '@/types';
import axiosInstance from './index';

// ==================== 上传压缩包 ====================
// ⚠️ 后端接口：POST /upload
export async function uploadZip(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<ApiResponse<UploadResponse>> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axiosInstance.post<ApiResponse<UploadResponse>>('/upload/zip', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        onProgress({
          fileName: file.name,
          fileSize: file.size,
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          percent: Math.round((progressEvent.loaded / progressEvent.total) * 100),
        });
      }
    },
  });

  return response.data;
}

// ==================== 启动批阅 ====================
// ⚠️ 后端接口：POST /grading/start
// 参数 uploadId 来自 uploadZip 的响应
export async function startGrading(uploadId: string): Promise<ApiResponse<void>> {
  const response = await axiosInstance.post<ApiResponse<void>>('/marking/start', { uploadId });
  return response.data;
}
