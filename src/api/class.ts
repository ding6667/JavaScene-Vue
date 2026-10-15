import type { ApiResponse } from '@/types';
import type {
  ClassRecord,
  ClassSaveRequest,
  ClassQuery,
  ClassPageData,
} from '@/types/class';
import axiosInstance from './index';

// 注意：响应拦截器已返回 response.data（即 { code, message, data }），此处无需再 .data

// ==================== 班级列表分页查询 ====================
// 后端接口：GET /api/class/records
// 查询参数：pageNum, pageSize, className(可选), isAsc
export async function getClassRecords(
  params: ClassQuery
): Promise<ApiResponse<ClassPageData>> {
  return (await axiosInstance.get<ApiResponse<ClassPageData>>(
    '/api/class/records',
    { params }
  )) as unknown as ApiResponse<ClassPageData>;
}

// ==================== 获取班级详情 ====================
// 后端接口：GET /api/class/get/{id}
export async function getClassById(id: number): Promise<ApiResponse<ClassRecord>> {
  return (await axiosInstance.get<ApiResponse<ClassRecord>>(
    `/api/class/get/${id}`
  )) as unknown as ApiResponse<ClassRecord>;
}

// ==================== 创建班级 ====================
// 后端接口：POST /api/class/create
export async function createClass(
  data: ClassSaveRequest
): Promise<ApiResponse<ClassRecord>> {
  return (await axiosInstance.post<ApiResponse<ClassRecord>>(
    '/api/class/create',
    data
  )) as unknown as ApiResponse<ClassRecord>;
}

// ==================== 更新班级 ====================
// 后端接口：PUT /api/class/update
export async function updateClass(
  data: ClassSaveRequest
): Promise<ApiResponse<ClassRecord>> {
  return (await axiosInstance.put<ApiResponse<ClassRecord>>(
    '/api/class/update',
    data
  )) as unknown as ApiResponse<ClassRecord>;
}

// ==================== 删除班级 ====================
// 后端接口：DELETE /api/class/delete/{id}
export async function deleteClass(id: number): Promise<ApiResponse<string>> {
  return (await axiosInstance.delete<ApiResponse<string>>(
    `/api/class/delete/${id}`
  )) as unknown as ApiResponse<string>;
}
