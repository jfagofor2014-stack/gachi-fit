// 秒を「M分」に整形（floor、不正・負値は0分）
export function formatMinutes(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return '0分';
  return `${Math.floor(s / 60)}分`;
}
