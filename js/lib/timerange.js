// 'HH:MM' 2つから所要分を返す。終了≤開始・空は0。
export function durationMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}
