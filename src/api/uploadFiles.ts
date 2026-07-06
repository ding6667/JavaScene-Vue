import type { ApiResponse, PageResponse } from '@/types';
import axiosInstance from './index';

export interface UploadFile {
  id: string;
  fileName: string;
  fileSize: number;
  uploadTime: string;
  expireTime: string;
}

export interface UploadFileQuery {
  pageNum: number;
  pageSize: number;
  fileName?: string;
  isAsc?: boolean;
}

// ==================== 获取上传文件列表 ====================
// ⚠️ 后端接口：GET /upload/records
// 查询参数：pageNum, pageSize, fileName(可选), isAsc(可选)
export async function getUploadFiles(params: UploadFileQuery): Promise<ApiResponse<PageResponse<UploadFile>>> {
  const response = await axiosInstance.get<ApiResponse<PageResponse<UploadFile>>>('/upload/records', { params });
  return response.data;
}

// ==================== 下载上传文件 ====================
// ⚠️ 后端接口：GET /upload/files/:id/download
export async function downloadUploadFile(id: string): Promise<Blob> {
  const response = await axiosInstance.get(`/upload/files/${id}/download`, {
    responseType: 'blob',
  });
  return response.data;
}

// ==================== 删除单个上传文件 ====================
// ⚠️ 后端接口：DELETE /upload/files/:id
export async function deleteUploadFile(id: string): Promise<ApiResponse<void>> {
  const response = await axiosInstance.delete<ApiResponse<void>>(`/upload/delete/${id}`);
  return response.data;
}

// ==================== 批量删除上传文件 ====================
// ⚠️ 后端接口：POST /upload/files/batch-delete
// 请求体：{ ids: string[] }
export async function batchDeleteUploadFiles(ids: string[]): Promise<ApiResponse<void>> {
  const response = await axiosInstance.post<ApiResponse<void>>('/upload/files/batch-delete', { ids });
  return response.data;
}
