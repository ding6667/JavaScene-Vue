/**
 * 题库题型等码值映射（与后端枚举一致）。
 * 题型 1=选择 2=填空 3=判断 4=程序阅读 5=编程 6=简答；判题方式 1=AI批改 2=测试用例判题 3=混合。
 * 难度不再是码值：改成指向难度配置表，见 api/exam.fetchDifficultyConfigs，前端不做硬编码。
 */

export const TYPE_LABELS: Record<number, string> = {
  1: '选择题',
  2: '填空题',
  3: '判断题',
  4: '程序阅读题',
  5: '编程题',
  6: '简答题',
};

/** 后端实体（详情 / 随机抽题）直出枚举名，VO 出码值，这里统一转成码值 */
export const TYPE_ENUM_CODES: Record<string, number> = {
  CHOICE: 1,
  FILL_IN: 2,
  JUDGE: 3,
  PROGRAM_READ: 4,
  PROGRAMMING: 5,
  SHORT_ANSWER: 6,
};

export const JUDGE_MODE_LABELS: Record<number, string> = {
  1: 'AI 批改',
  2: '测试用例判题',
  3: '混合',
};

/** 认知层级：后端为中文描述（如“理解”） */
export const COGNITIVE_OPTIONS = ['记忆', '理解', '应用', '分析', '评价', '创造'];

export function toEntries(map: Record<number, string>) {
  return Object.entries(map).map(([k, v]) => ({ value: Number(k), label: v }));
}

/** 题型枚举名 → 码值；已经是数字或未知值原样返回 */
export function typeCodeOf(raw: string | number | null | undefined): string | number {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const n = Number(text);
  if (Number.isFinite(n)) return n;
  return TYPE_ENUM_CODES[text.toUpperCase()] ?? text;
}

/** 码值 → 中文；后端回中文时原样展示，不做二次猜测 */
export function labelOf(map: Record<number, string>, raw: string | number | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '—';
  const n = Number(text);
  if (Number.isFinite(n) && map[n]) return map[n];
  return text;
}

export const typeLabel = (raw: string | number | null | undefined) =>
  labelOf(TYPE_LABELS, typeCodeOf(raw));

/**
 * 回显方向：码值或中文标签 → 码值（下拉是码值）。
 * 映射不到就退回默认值，避免把后端文本写进 number 字段。
 */
export function codeFrom(
  map: Record<number, string>,
  raw: string | number | null | undefined,
  fallback: number,
): number {
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  const n = Number(text);
  if (Number.isFinite(n) && map[n]) return n;
  const hit = Object.entries(map).find(([, label]) => label === text);
  return hit ? Number(hit[0]) : fallback;
}
