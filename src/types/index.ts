// ==================== 上传相关类型 ====================

export interface UploadProgress {
  fileName: string;
  fileSize: number;
  loaded: number;
  total: number;
  percent: number; // 0-100
}

// ==================== 批阅启动参数 ====================

/** 批阅任务类别 */
export type TaskCategory = 'HOMEWORK' | 'MIDTERM' | 'FINAL' | 'PROJECT';

/** 启动批阅通用参数（ZIP / Word 共有字段） */
export interface StartGradingBase {
  /** 班级 id（后端为字符串） */
  classId: string;
  /** 评分标准模板 id（settings/getStandard 返回的 id） */
  standardConfigId: number;
  taskCategory: TaskCategory;
  taskSequence: number;
}

/** 启动项目批阅（ZIP）参数 —— POST /api/grading/startProject */
export interface StartProjectRequest extends StartGradingBase {
  uploadId: string;
}

/** 启动普通文件批阅（Word）参数 —— POST /api/grading/startCommon */
export interface StartCommonRequest extends StartGradingBase {
  uploadIds: string[];
}

// ==================== API 通用响应 ====================

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PageResponse<T> {
  records: T[];
  total: number;
  current: number;
  size: number;
}
