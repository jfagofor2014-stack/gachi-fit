// 推定1RM（Epley式）: weight * (1 + reps/30)
export function estimate1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (r <= 0) return w;
  return w * (1 + r / 30);
}

// ROM係数
const ROM_FACTOR = { full: 1.0, partial: 0.7, cheating: 0.4 };

// セット品質スコア: muscleLoad*romFactor + core*Wcore
// Score = Σ ( V_volume × W_form + I_intensity × W_core )
// V=muscleLoad, W_form=romFactor, I=core, W_core=1.0
export function sensoryScore({ core = 0, muscleLoad = 0, rom = 'full' } = {}) {
  const romFactor = ROM_FACTOR[rom] ?? 1.0;
  const wCore = 1.0;
  return muscleLoad * romFactor + core * wCore;
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
