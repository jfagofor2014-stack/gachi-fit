// 推定1RM（Epley式）: weight * (1 + reps/30)
export function estimate1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (r <= 0) return w;
  return w * (1 + r / 30);
}

// 種目ごとの最大推定1RM
export function computePRs(sets = []) {
  const prs = {};
  for (const s of sets) {
    const selfReps = (Number(s.reps) || 0) - (Number(s.assistedReps) || 0);
    const e = estimate1RM(s.weight, selfReps);
    if (prs[s.exerciseId] === undefined || e > prs[s.exerciseId]) {
      prs[s.exerciseId] = e;
    }
  }
  return prs;
}
