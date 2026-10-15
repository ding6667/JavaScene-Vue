import type { UploadProgress, ApiResponse } from '@/types';
import axiosInstance from './index';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 上传任意文件（ZIP / Word 统一接口） ====================
// 后端接口：POST /api/upload/file（参考 openapi.json）
// 请求体：multipart/form-data，字段 file
// 查询参数：fileType（可选，"WORD" | "ZIP"），由调用方根据文件类型/滑块选择传入
// 返回：data 为字符串（上传后的文件 id），zip/word 均走此接口
export async function uploadFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  fileType?: 'WORD' | 'ZIP'
): Promise<ApiResponse<string>> {
  const formData = new FormData();
  formData.append('file', file);

  return (await axiosInstance.post<ApiResponse<string>>('/api/upload/file', formData, {
    params: fileType ? { fileType } : undefined,
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
  })) as unknown as ApiResponse<string>;
}
