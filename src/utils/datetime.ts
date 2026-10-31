/** 日期默认值等小组件，避免每页各写一份 */

/** 默认的作业截止时间：7 天后的 23:59:59，格式与 el-date-picker 的 value-format 一致 */
export function defaultDeadline(days = 7): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 23:59:59`;
}
