// セット記録数が多い順に種目IDを返す（純粋関数）
export function mostUsedExerciseIds(sets, count) {
  const counts = {};
  for (const s of sets) counts[s.exerciseId] = (counts[s.exerciseId] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
}

// AIが返した種目名配列を、登録済み種目の完全一致でID配列に変換する（順序維持・重複除去・未一致はスキップ）
export function matchExerciseNamesToIds(names, exercises) {
  const byName = new Map(exercises.map((e) => [e.name, e.id]));
  const seen = new Set();
  const out = [];
  for (const name of names) {
    const id = byName.get(name);
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}
