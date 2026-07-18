export const VOLUME_START_DATE = '2026-06-28';

// 1セットのボリューム。補助回数は重量を半減ずつ計上：係数 1 - 0.5^assistedReps
export function setVolume(weight, reps, assistedReps = 0) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  const a = Math.min(Number(assistedReps) || 0, r);
  const selfReps = r - a;
  const assistFactor = a > 0 ? (1 - Math.pow(0.5, a)) : 0;
  return w * (selfReps + assistFactor);
}

// 部位キー：bodyPart の「/」より前。空なら category、無ければ その他
export function categoryKey(ex) {
  if (ex && ex.bodyPart) {
    const head = ex.bodyPart.split('/')[0].trim();
    if (head) return head;
  }
  return (ex && ex.category) || 'その他';
}

// 指定日の部位別ボリューム合計
export function categoryVolumeForDate(sets, exById, wkById, date) {
  const out = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date !== date) continue;
    const cat = categoryKey(exById[s.exerciseId]);
    out[cat] = (out[cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  return out;
}

// excludeDate の日を除き、sinceDate 以前も除いた、部位別「日合計」の最大
export function maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate, sinceDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date === excludeDate) continue;
    if (sinceDate && wk.date < sinceDate) continue;
    const cat = categoryKey(exById[s.exerciseId]);
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

// 部位別に「日合計が最大の日」とその合計を返す（sinceDate 以降のみ）
export function maxCategoryVolumeWithDate(sets, exById, wkById, sinceDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk) continue;
    if (sinceDate && wk.date < sinceDate) continue;
    const cat = categoryKey(exById[s.exerciseId]);
    (perDate[wk.date] ||= {});
    perDate[wk.date][cat] = (perDate[wk.date][cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  const out = {};
  for (const date in perDate) {
    for (const cat in perDate[date]) {
      const v = perDate[date][cat];
      if (!out[cat] || v > out[cat].volume) out[cat] = { volume: v, date };
    }
  }
  return out;
}

// 指定部位の日別ボリューム合計を日付昇順で返す（sinceDate以降のみ）
export function dailyCategoryVolumes(sets, exById, wkById, cat, sinceDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk) continue;
    if (sinceDate && wk.date < sinceDate) continue;
    if (categoryKey(exById[s.exerciseId]) !== cat) continue;
    perDate[wk.date] = (perDate[wk.date] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  return Object.entries(perDate)
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 日別ボリューム列から、自己ベストが更新された点だけを時系列順に残す（階段状の推移）
export function categoryPRProgression(dailyVolumes) {
  const out = [];
  let best = -Infinity;
  for (const point of dailyVolumes) {
    if (point.volume > best) {
      best = point.volume;
      out.push(point);
    }
  }
  return out;
}

// 種目が1件以上ある部位を bodyParts の順→それ以外の順で返す
export function categoriesWithExercises(exercises, bodyParts) {
  const set = new Set(exercises.map((e) => categoryKey(e)));
  return [
    ...bodyParts.filter((p) => set.has(p)),
    ...[...set].filter((p) => !bodyParts.includes(p)),
  ];
}
