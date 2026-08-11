import { categoryKey } from './volume.js';

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
