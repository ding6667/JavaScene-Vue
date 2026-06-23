// ==================== 上传相关类型 ====================

export interface UploadProgress {
  fileName: string;
  fileSize: number;
  loaded: number;
  total: number;
  percent: number; // 0-100
}

export interface UploadResponse {
  uploadId: string;
  message: string;
}

// ==================== 批阅相关类型 ====================

export type GradingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface StudentStatus {
  studentId: string;
  studentName: string;
  status: GradingStatus;
  message?: string;
}

export interface GradingProgress {
  total: number;
  completed: number;
  processing: number;
  pending: number;
  failed: number;
  students: StudentStatus[];
}

export interface GradingResult {
  studentId: string;
  studentName: string;
  score: number;
  comment: string;
  gradingCriteria?: string; // 评分标准标识，预留扩展
}

export interface GradingCriteria {
  id: string;
  name: string;
  description: string;
  weights?: Record<string, number>; // 预留：各项权重
}

// ==================== API 通用响应 ====================

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PageResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
