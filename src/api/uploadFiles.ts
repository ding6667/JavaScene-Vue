import type { ApiResponse, PageResponse } from '@/types';
import type { UploadFileRecord, UploadFileQuery } from '@/types/uploadFile';
import axiosInstance from './index';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 获取上传文件列表 ====================
// 后端接口：GET /api/upload/records（参考 fileopenapi.json）
// 查询参数：pageNum, pageSize, fileName(可选), isAsc(可选)
// 返回分页结构：{ records, total, current, size }
export async function getUploadFiles(params: UploadFileQuery): Promise<ApiResponse<PageResponse<UploadFileRecord>>> {
  return (await axiosInstance.get<ApiResponse<PageResponse<UploadFileRecord>>>('/api/upload/records', { params })) as unknown as ApiResponse<PageResponse<UploadFileRecord>>;
}

// ==================== 下载上传文件 ====================
// 后端接口：GET /api/upload/files/:id/download
// Blob 类型响应拦截器直接返回 response.data（即 Blob）
export async function downloadUploadFile(id: string): Promise<Blob> {
  return (await axiosInstance.get(`/api/upload/${id}/download`, {
    responseType: 'blob',
  })) as unknown as Blob;
}

// ==================== 删除单个上传文件 ====================
// 后端接口：DELETE /api/upload/delete/{id}（参考 fileopenapi.json）
export async function deleteUploadFile(id: string): Promise<ApiResponse<void>> {
  return (await axiosInstance.delete<ApiResponse<void>>(`/api/upload/delete/${id}`)) as unknown as ApiResponse<void>;
}

// ==================== 批量删除上传文件 ====================
// 后端未提供批量删除接口：循环调用单文件删除 DELETE /api/upload/delete/{id}
// 部分失败时抛错（含成功/失败计数），由调用方 store 统一提示；函数签名不变
export async function batchDeleteUploadFiles(ids: string[]): Promise<void> {
  const results = await Promise.allSettled(ids.map((id) => deleteUploadFile(id)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    throw new Error(`批量删除完成：${ids.length - failed} 个成功，${failed} 个失败`);
  }
}
