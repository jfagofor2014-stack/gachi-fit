import { categoryKey } from './volume.js';
import { daysUntil } from './countdown.js';

// 部位ごとの最終トレーニング日（'YYYY-MM-DD'）を返す。記録がない部位はキーなし
export function lastTrainedDateByCategory(sets, exById, wkById) {
  const out = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk) continue;
    const cat = categoryKey(exById[s.exerciseId]);
    if (!out[cat] || wk.date > out[cat]) out[cat] = wk.date;
  }
  return out;
}

// 登録済み種目がある部位（その他は除く）のうち、直近しばらく鍛えていない順にcount件を提案する
export function suggestBodyParts(categories, lastTrainedByCategory, today, count = 2) {
  const candidates = categories.filter((c) => c !== 'その他');
  const scored = candidates.map((cat) => {
    const last = lastTrainedByCategory[cat];
    const gap = last ? -daysUntil(last, today) : Number.MAX_SAFE_INTEGER;
    return { cat, gap };
  });
  scored.sort((a, b) => b.gap - a.gap);
  return scored.slice(0, count).map((s) => s.cat);
}
