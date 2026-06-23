import type { GradingProgress, GradingResult, ApiResponse } from '@/types';
import axiosInstance from './index';

// ==================== 获取批阅进度 ====================
// ⚠️ 后端接口：GET /grading/progress?gradingId=xxx
export async function getGradingProgress(gradingId: string): Promise<ApiResponse<GradingProgress>> {
  const response = await axiosInstance.get<ApiResponse<GradingProgress>>('/grading/progress', {
    params: { gradingId },
  });
  return response.data;
}

// ==================== 获取批阅结果 ====================
// ⚠️ 后端接口：GET /grading/results?gradingId=xxx
export async function getGradingResults(gradingId: string): Promise<ApiResponse<GradingResult[]>> {
  const response = await axiosInstance.get<ApiResponse<GradingResult[]>>('/grading/results', {
    params: { gradingId },
  });
  return response.data;
}

// ==================== 导出 Excel ====================
// ⚠️ 后端接口：GET /grading/export?gradingId=xxx&format=xlsx
export async function exportExcel(gradingId: string, format = 'xlsx'): Promise<Blob> {
  const response = await axiosInstance.get('/grading/export', {
    params: { gradingId, format },
    responseType: 'blob',
  });
  return response.data;
}

// ==================== WebSocket 预留接口 ====================
// ⚠️ 后续如需 WebSocket 实时推送进度，在此处扩展
// export function initGradingWebSocket(gradingId: string, onProgress: (data: GradingProgress) => void) {
//   // WebSocket 实现
// }
