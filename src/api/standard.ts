import axiosInstance from './index';
import type { ApiResponse } from '@/types';
import type {
  StandardConfig,
  StandardCreateRequest,
  StandardUpdateRequest,
} from '@/types/standard';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 获取所有评分标准模板 ====================
// 后端接口：GET /api/settings/getStandard
// 返回：StandardConfig 数组
export async function getStandards(): Promise<ApiResponse<StandardConfig[]>> {
  return (await axiosInstance.get<ApiResponse<StandardConfig[]>>('/api/settings/getStandard')) as unknown as ApiResponse<StandardConfig[]>;
}

// ==================== 创建评分标准模板 ====================
// 后端接口：POST /api/settings/createStandard
export async function createStandard(data: StandardCreateRequest): Promise<ApiResponse<StandardConfig>> {
  return (await axiosInstance.post<ApiResponse<StandardConfig>>('/api/settings/createStandard', data)) as unknown as ApiResponse<StandardConfig>;
}

// ==================== 更新评分标准模板 ====================
// 后端接口：PUT /api/settings/updateStandard/{id}
export async function updateStandard(id: number, data: StandardUpdateRequest): Promise<ApiResponse<StandardConfig>> {
  return (await axiosInstance.put<ApiResponse<StandardConfig>>(`/api/settings/updateStandard/${id}`, data)) as unknown as ApiResponse<StandardConfig>;
}

// ==================== 删除评分标准模板 ====================
// 后端接口：DELETE /api/settings/deleteStandard/{id}
export async function deleteStandard(id: number): Promise<ApiResponse<string>> {
  return (await axiosInstance.delete<ApiResponse<string>>(`/api/settings/deleteStandard/${id}`)) as unknown as ApiResponse<string>;
}
