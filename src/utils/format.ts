/** 格式化文件大小 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/** 格式化百分比 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** 格式化分数 */
export function formatScore(score: number): string {
  return score.toFixed(1);
}
