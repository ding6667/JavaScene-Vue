// ==================== 班级管理相关类型 ====================
// 对应 openapi.json 中 com.amlve.system.vo.ClassResponse

/** 班级状态枚举（status 字段） */
export enum ClassStatus {
  /** 启用 */
  ACTIVE = 1,
  /** 停用 */
  INACTIVE = 0,
}

/** 班级信息（响应/列表项） */
export interface ClassRecord {
  id: number;
  /** 班级名称 */
  className: string;
  /** 班级代码 */
  classCode: string;
  /** 年级 */
  grade: number;
  /** 创建用户 ID */
  userId: number;
  /** 学期，如 "2025-2026-1" */
  semester?: string;
  /** 状态：1 启用 / 0 停用 */
  status: number;
  createTime?: string;
  updateTime?: string;
}

/** 创建/更新班级请求体（参考 openapi.json create / update） */
export interface ClassSaveRequest {
  id?: number;
  className: string;
  classCode: string;
  grade: number;
  userId: number;
  semester?: string;
  status?: number;
}

/** 班级列表查询参数（参考 GET /api/class/records） */
export interface ClassQuery {
  pageNum: number;
  pageSize: number;
  /** 班级名称模糊查询 */
  className?: string;
  /** 是否升序 */
  isAsc: boolean;
}

/** 班级列表分页响应（参考 openapi.json records.data） */
export interface ClassPageData {
  records: ClassRecord[];
  total: number;
  current: number;
  size: number;
}
