// セット記録数が多い順に種目IDを返す（純粋関数）
export function mostUsedExerciseIds(sets, count) {
  const counts = {};
  for (const s of sets) counts[s.exerciseId] = (counts[s.exerciseId] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
}
