// ==================== 常规设置类型 ====================

/** 单条常规配置项 */
export interface CommonSetting {
  /** 配置键（整数） */
  configKey: number;
  /** 配置值 */
  configValue: string;
  /** 配置项名称（展示用） */
  configKeyName: string;
}

/** 常规设置响应（getCommonSettings / updateCommonSettings / defaultSettings 返回） */
export interface CommonSettingsResponse {
  /** 用户 id */
  userId: number;
  /** 配置项列表 */
  settings: CommonSetting[];
}
