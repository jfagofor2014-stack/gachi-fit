// 対象日まで残り日数（当日=0、過去は負）。dateStr は 'YYYY-MM-DD'。
export function daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = target - base;
  return Math.round(ms / 86400000);
}
