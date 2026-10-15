import type { ApiResponse } from '@/types';
import type { CommonSettingsResponse } from '@/types/settings';
import axiosInstance from './index';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 获取常规设置 ====================
// 后端接口：GET /api/settings/getCommonSettings
// 返回：data 为 { userId, settings: [{ configKey, configValue, configKeyName }] }
export async function getCommonSettings(): Promise<ApiResponse<CommonSettingsResponse>> {
  return (await axiosInstance.get<ApiResponse<CommonSettingsResponse>>('/api/settings/getCommonSettings')) as unknown as ApiResponse<CommonSettingsResponse>;
}

// ==================== 更新单个常规配置 ====================
// 后端接口：PUT /api/settings/updateCommonSettings
// 请求体：{ configKey, configValue }
export async function updateCommonSettings(configKey: number, configValue: string): Promise<ApiResponse<CommonSettingsResponse>> {
  return (await axiosInstance.put<ApiResponse<CommonSettingsResponse>>('/api/settings/updateCommonSettings', { configKey, configValue })) as unknown as ApiResponse<CommonSettingsResponse>;
}

// ==================== 恢复默认常规设置 ====================
// 后端接口：PUT /api/settings/defaultSettings
// 无请求体，返回重置后的完整 settings
export async function defaultSettings(): Promise<ApiResponse<CommonSettingsResponse>> {
  return (await axiosInstance.put<ApiResponse<CommonSettingsResponse>>('/api/settings/defaultSettings')) as unknown as ApiResponse<CommonSettingsResponse>;
}
