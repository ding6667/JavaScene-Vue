import type { ApiResponse } from '@/types';
import type { CommonSettingsResponse } from '@/types/settings';
import type {
  StandardConfig,
  StandardCreateRequest,
  StandardUpdateRequest,
} from '@/types/standard';
import axiosInstance from './index';

/**
 * 系统设置模块 API（后端 /api/settings/*）
 * 负责人：【D 用户权限与运维】—— 常规设置与评分标准模板同属该模块，合并为一个文件。
 * 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data。
 */

// ==================== 常规设置（按登录用户，已对接） ====================

/** GET /api/settings/getCommonSettings */
export async function getCommonSettings(): Promise<ApiResponse<CommonSettingsResponse>> {
  return (await axiosInstance.get<ApiResponse<CommonSettingsResponse>>('/api/settings/getCommonSettings')) as unknown as ApiResponse<CommonSettingsResponse>;
}

/** PUT /api/settings/updateCommonSettings —— 单条键值提交（不是整对象） */
export async function updateCommonSettings(
  configKey: number,
  configValue: string,
): Promise<ApiResponse<CommonSettingsResponse>> {
  return (await axiosInstance.put<ApiResponse<CommonSettingsResponse>>('/api/settings/updateCommonSettings', { configKey, configValue })) as unknown as ApiResponse<CommonSettingsResponse>;
}

/** PUT /api/settings/defaultSettings —— 无请求体，返回重置后的完整 settings */
export async function defaultSettings(): Promise<ApiResponse<CommonSettingsResponse>> {
  return (await axiosInstance.put<ApiResponse<CommonSettingsResponse>>('/api/settings/defaultSettings')) as unknown as ApiResponse<CommonSettingsResponse>;
}

// ==================== 评分标准模板（已对接） ====================

/** GET /api/settings/getStandard —— standardContent 为 RubricItem[]，不是字符串 */
export async function getStandards(): Promise<ApiResponse<StandardConfig[]>> {
  return (await axiosInstance.get<ApiResponse<StandardConfig[]>>('/api/settings/getStandard')) as unknown as ApiResponse<StandardConfig[]>;
}

/** POST /api/settings/createStandard */
export async function createStandard(data: StandardCreateRequest): Promise<ApiResponse<StandardConfig>> {
  return (await axiosInstance.post<ApiResponse<StandardConfig>>('/api/settings/createStandard', data)) as unknown as ApiResponse<StandardConfig>;
}

/** PUT /api/settings/updateStandard/{id} */
export async function updateStandard(id: number, data: StandardUpdateRequest): Promise<ApiResponse<StandardConfig>> {
  return (await axiosInstance.put<ApiResponse<StandardConfig>>(`/api/settings/updateStandard/${id}`, data)) as unknown as ApiResponse<StandardConfig>;
}

/** DELETE /api/settings/deleteStandard/{id} */
export async function deleteStandard(id: number): Promise<ApiResponse<string>> {
  return (await axiosInstance.delete<ApiResponse<string>>(`/api/settings/deleteStandard/${id}`)) as unknown as ApiResponse<string>;
}
