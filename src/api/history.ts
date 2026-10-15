import http from './index';
import type { TaskQuery, TaskPageData, TaskDetail } from '@/types/history';
import type { ApiResponse } from '@/types';

const BASE = '/api/grading/task';

/** 获取 ZIP 类型任务列表 */
export function getZipTaskList(params: TaskQuery): Promise<ApiResponse<TaskPageData>> {
  return http.get(`${BASE}/zipList`, { params }) as unknown as Promise<ApiResponse<TaskPageData>>;
}

/** 获取 Word/文件类型任务列表 */
export function getFileTaskList(params: TaskQuery): Promise<ApiResponse<TaskPageData>> {
  return http.get(`${BASE}/fileList`, { params }) as unknown as Promise<ApiResponse<TaskPageData>>;
}

/** 获取任务详情 */
export function getTaskDetail(taskId: string): Promise<ApiResponse<TaskDetail>> {
  return http.get(`${BASE}/detail/${taskId}`) as unknown as Promise<ApiResponse<TaskDetail>>;
}
