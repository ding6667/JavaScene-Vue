import type { CommonSetting } from '@/types/settings';

/** 控件类型：根据配置项名称自动识别 */
export type ControlKind =
  | 'exportPath'
  | 'enableToggle'
  | 'retryPolicy'
  | 'cleanupPeriod'
  | 'expiryRemind'
  | 'apiKey'
  | 'text'

/** 四大分区（浅灰横线划分） */
export type SectionGroup = 'export' | 'file' | 'api' | 'notify';

export const SECTION_META: Record<SectionGroup, { title: string; hint?: string }> = {
  export: { title: '导出设置区', hint: '批阅结果导出相关配置' },
  file:   { title: '文件管理区', hint: '历史文件、清理与存储策略' },
  api:    { title: 'API 配置区', hint: '批阅请求与失败重试相关配置' },
  notify: { title: '通知与发送区', hint: '提醒、通知与发送相关设置' },
};

/* 分区判定规则（按名字匹配，优先级从上到下） */
const GROUP_RULES: { group: SectionGroup; pattern: RegExp }[] = [
  // 导出：路径、导出目录、导出文件名
  { group: 'export', pattern: /(导出|路径|目录|导出文件名|export|output)/i },
  // 文件管理：清理周期、保留天数、历史文件、存储、文件夹、自动清理(周期类归到文件，启用类稍后如果是启用清理也归文件)
  { group: 'file',   pattern: /(清理周期|保留天|历史文件|自动清理.*(天|周期|策略)|过期.*(文件|保留)|存储(位置|路径|大小)|文件.*(大小|限制)|归档)/i },
  // API：重试、超时、连接、频率、并发、token、密钥
  { group: 'api',    pattern: /(重试|超时|连接|频率|并发|token|密钥|api.*key|请求.*(限|次)|批量)/i },
  // 通知与发送：过期提醒、到期提醒、通知、发送、邮件、消息、提醒
  { group: 'notify', pattern: /(过期提醒|到期提醒|通知|发送|邮件|消息|提醒|webhook|钉钉|飞书)/i },
  // 启用类二次细分：启用备份/文件相关 → file；启用重试/API → api；启用通知/提醒 → notify；其他默认 notify
];

/* 控件识别规则（按名字匹配，优先级从上到下；精确匹配放最前） */
const CONTROL_RULES: { kind: ControlKind; pattern: RegExp; description?: string }[] = [
  { kind: 'apiKey', pattern: /对话.*api.*密钥|对话.*密钥|chat.*api.*key|对话大模型.*密钥/i, description: '用于调用对话批阅模型的 API 密钥（由服务方提供）' },
  { kind: 'apiKey', pattern: /向量.*api.*密钥|向量.*密钥|embedding.*key|向量模型.*密钥/i,  description: '用于文本向量化 / 语义检索模型的 API 密钥（由服务方提供）' },
  { kind: 'exportPath',    pattern: /(导出|路径|目录|导出文件名|export|output)/i,            description: '批阅结果导出的文件路径或目录' },
  { kind: 'cleanupPeriod', pattern: /(清理周期|保留天|历史.*清理|自动清理.*天)/i,               description: '超过多少天未使用的历史文件将自动清理' },
  { kind: 'retryPolicy',   pattern: /(重试)/i,                                                  description: '批阅失败时的最大重试次数' },
  { kind: 'expiryRemind',  pattern: /(过期提醒|到期提醒|提醒.*天)/i,                             description: '文件过期前多少天开始显示提醒' },
  { kind: 'enableToggle',  pattern: /(启用|开启|是否.*启用|自动备份|自动清理|自动保存|自动|开启.*(备份|清理|通知|重试|保存))/i, description: '开启后自动执行对应操作' },
];

/** 根据配置项名称识别控件类型与描述文案 */
export function detectControl(setting: CommonSetting): { kind: ControlKind; description: string } {
  for (const r of CONTROL_RULES) {
    if (r.pattern.test(setting.configKeyName)) {
      return { kind: r.kind, description: r.description ?? '' };
    }
  }
  return { kind: 'text', description: '' };
}

/**
 * 根据配置项名称与控件类型分区到四个区块。
 * - enableToggle 再结合内容关键词细分类；
 * - 其余命中分组规则直接归类；
 * - 兜底归到 通知与发送区。
 */
export function detectGroup(setting: CommonSetting, kind: ControlKind): SectionGroup {
  const name = setting.configKeyName;
  // 先试精确分组规则（与顺序无关）
  for (const r of GROUP_RULES) {
    if (r.pattern.test(name)) return r.group;
  }
  // 启用类：按语义二次细分
  if (kind === 'enableToggle') {
    if (/(备份|文件|清理|存储|归档)/i.test(name)) return 'file';
    if (/(重试|连接|api|超时|密钥|token|频率|并发)/i.test(name)) return 'api';
    if (/(通知|提醒|发送|邮件|消息|webhook)/i.test(name)) return 'notify';
    return 'file'; // 其他启用归到文件管理
  }
  // 兜底
  return 'notify';
}

/** 重试策略下拉选项（请求值为字符串 "0"-"3"） */
export const RETRY_OPTIONS = [
  { value: '0', label: '0 次（不重试）' },
  { value: '1', label: '1 次' },
  { value: '2', label: '2 次' },
  { value: '3', label: '3 次' },
];

/** 清理周期下拉选项（字符串 "3"|"7"|"15"|"30"） */
export const CLEANUP_OPTIONS = [
  { value: '3',  label: '3 天' },
  { value: '7',  label: '7 天（一周）' },
  { value: '15', label: '15 天（半个月）' },
  { value: '30', label: '30 天（一个月）' },
];

/** 过期提醒数字范围 */
export const EXPIRY_MIN = 1;
export const EXPIRY_MAX = 15;

/** 字符串 "1"/"0" → boolean */
export function strToBool(v: string): boolean {
  return v === '1';
}

/** boolean → 字符串 "1"/"0" */
export function boolToStr(v: boolean): '1' | '0' {
  return v ? '1' : '0';
}

/** 字符串 → number，无法解析时返回 fallback */
export function strToNum(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** number → 字符串 */
export function numToStr(n: number): string {
  return String(Math.trunc(n));
}