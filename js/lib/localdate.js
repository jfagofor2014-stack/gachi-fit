// ローカル時刻の日付を 'YYYY-MM-DD' で返す（UTC変換しないので0時で切り替わる）
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
