import type {
  ApiResponse,
  StartProjectRequest,
  StartCommonRequest,
} from '@/types';
import axiosInstance from './index';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data
// 批阅进度与结果列表由 @/api/history 的 grading/task/* 提供，本模块只负责发起与控制。

// ==================== 启动项目批阅（ZIP） ====================
// 后端接口：POST /api/grading/startProject
// 请求体：{ uploadId, standardConfigId, classId, taskCategory, taskSequence }
// 响应 data 为批阅任务 ID（字符串），后续用于查询进度与控制
export async function startProject(data: StartProjectRequest): Promise<ApiResponse<string>> {
  return (await axiosInstance.post<ApiResponse<string>>('/api/grading/startProject', data)) as unknown as ApiResponse<string>;
}

// ==================== 启动普通文件批阅（Word） ====================
// 后端接口：POST /api/grading/startCommon
// 请求体：{ uploadIds, standardConfigId, classId, taskCategory, taskSequence }
export async function startCommon(data: StartCommonRequest): Promise<ApiResponse<string>> {
  return (await axiosInstance.post<ApiResponse<string>>('/api/grading/startCommon', data)) as unknown as ApiResponse<string>;
}

// ==================== 暂停批阅 ====================
// 后端接口：POST /api/grading/pause，请求体为任务 ID 字符串
export async function pauseGrading(taskId: string): Promise<ApiResponse<string>> {
  return (await axiosInstance.post<ApiResponse<string>>('/api/grading/pause', taskId)) as unknown as ApiResponse<string>;
}

// ==================== 继续批阅 ====================
// 后端接口：POST /api/grading/resume，请求体为任务 ID 字符串
export async function resumeGrading(taskId: string): Promise<ApiResponse<string>> {
  return (await axiosInstance.post<ApiResponse<string>>('/api/grading/resume', taskId)) as unknown as ApiResponse<string>;
}

// ==================== 取消批阅 ====================
// 后端接口：POST /api/grading/cancel，请求体为任务 ID 字符串
export async function cancelGrading(taskId: string): Promise<ApiResponse<string>> {
  return (await axiosInstance.post<ApiResponse<string>>('/api/grading/cancel', taskId)) as unknown as ApiResponse<string>;
}

// ==================== 重试失败任务 ====================
// 后端接口：POST /api/grading/retry，请求体为任务 ID 字符串
export async function retryGrading(taskId: string): Promise<ApiResponse<string>> {
  return (await axiosInstance.post<ApiResponse<string>>('/api/grading/retry', taskId)) as unknown as ApiResponse<string>;
}
