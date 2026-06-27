// 1セットのボリューム。補助回数は重量を半減ずつ計上：係数 1 - 0.5^assistedReps
export function setVolume(weight, reps, assistedReps = 0) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  const a = Math.min(Number(assistedReps) || 0, r);
  const selfReps = r - a;
  const assistFactor = a > 0 ? (1 - Math.pow(0.5, a)) : 0;
  return w * (selfReps + assistFactor);
}

function catOf(ex) {
  return (ex && ex.category) || 'その他';
}

// 指定日の部位別ボリューム合計
export function categoryVolumeForDate(sets, exById, wkById, date) {
  const out = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date !== date) continue;
    const cat = catOf(exById[s.exerciseId]);
    out[cat] = (out[cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  return out;
}

// excludeDate の日を除いた、部位別「日合計」の最大
export function maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date === excludeDate) continue;
    const cat = catOf(exById[s.exerciseId]);
    (perDate[wk.date] ||= {});
    perDate[wk.date][cat] = (perDate[wk.date][cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  const max = {};
  for (const date in perDate) {
    for (const cat in perDate[date]) {
      if (max[cat] === undefined || perDate[date][cat] > max[cat]) max[cat] = perDate[date][cat];
    }
  }
  return max;
}
