// ==================== 历史任务相关类型 ====================

/** 任务状态 */
export enum GradingTaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** 任务类型 */
export enum TaskCategory {
  HOMEWORK = 'HOMEWORK',
  MIDTERM = 'MIDTERM',
  FINAL = 'FINAL',
  PROJECT = 'PROJECT',
}

/** 文件类型 */
export enum FileType {
  WORD = 'WORD',
  ZIP = 'ZIP',
}

/** 批阅任务响应 */
export interface GradingTask {
  id: string;
  fileId: string;
  fileName: string;
  userId: number;
  rubricId: number;
  studentCount: number;
  processedStudentCount: number;
  status: GradingTaskStatus;
  retryCount: number;
  errorMessage: string;
  createTime: string;
  finishTime: string;
  taskCategory: TaskCategory;
  taskSequence: number;
  classId: string;
  semester: string;
  studentId: string;
  fileType: FileType;
}

/** 分页查询参数 */
export interface TaskQuery {
  semester?: string;
  taskCategory?: TaskCategory;
  taskSequence?: number;
  classId?: string;
  studentId?: string;
  status?: number;
  page: number;
  size: number;
  sortOrder: 'asc' | 'desc';
}

/** 分页数据 */
export interface TaskPageData {
  records: GradingTask[];
  total: number;
  current: number;
  size: number;
}

/** 任务详情 */
export type TaskDetail = GradingTask;

// ==================== 枚举映射 ====================

export const statusMap: Record<GradingTaskStatus, { label: string; type: string }> = {
  [GradingTaskStatus.PENDING]: { label: '待处理', type: 'info' },
  [GradingTaskStatus.PROCESSING]: { label: '处理中', type: 'warning' },
  [GradingTaskStatus.SUCCESS]: { label: '已完成', type: 'success' },
  [GradingTaskStatus.EXPIRED]: { label: '已过期', type: 'info' },
  [GradingTaskStatus.FAILED]: { label: '失败', type: 'danger' },
  [GradingTaskStatus.CANCELLED]: { label: '已取消', type: 'info' },
};

export const categoryMap: Record<TaskCategory, string> = {
  [TaskCategory.HOMEWORK]: '作业',
  [TaskCategory.MIDTERM]: '期中',
  [TaskCategory.FINAL]: '期末',
  [TaskCategory.PROJECT]: '项目',
};
