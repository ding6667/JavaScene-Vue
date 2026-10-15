// ==================== 评分标准模板类型 ====================

/** 评分项（RubricItem） */
export interface RubricItem {
  /** 模块名称 */
  moduleName: string;
  /** 详细说明（Markdown） */
  detail: string;
  /** 分值 */
  score: string;
}

/** 评分标准配置响应 */
export interface StandardConfig {
  id?: number;
  /** 标准名称 */
  standardName: string;
  /** 评分标准内容 */
  standardContent: RubricItem[];
  /** 是否当前使用: 0=否, 1=是 */
  isCurrent: number;
  /** 创建人/来源 */
  userId?: number;
  /** 创建时间 */
  createTime?: string;
  /** 更新时间 */
  updateTime?: string;
}

/** 创建评分标准请求体 */
export interface StandardCreateRequest {
  standardName: string;
  standardContent: RubricItem[];
  isCurrent: number;
  userId: string;
}

/** 更新评分标准请求体 */
export interface StandardUpdateRequest {
  standardName: string;
  standardContent: RubricItem[];
  isCurrent: number;
}

/** 设置页二级菜单 */
export type SettingsTab = 'general' | 'template';
