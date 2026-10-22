// 記録画面の設定（端末ごと・localStorage）
const WEIGHT_STEP_KEY = 'weight_step';
export const WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5];
export const DEFAULT_WEIGHT_STEP = 2.5;

// 重量の ± の刻み。選択肢にない値・読めないときは既定値
export function getWeightStep() {
  try {
    const v = Number(localStorage.getItem(WEIGHT_STEP_KEY));
    return WEIGHT_STEPS.includes(v) ? v : DEFAULT_WEIGHT_STEP;
  } catch {
    return DEFAULT_WEIGHT_STEP;
  }
}

export function setWeightStep(v) {
  if (!WEIGHT_STEPS.includes(Number(v))) return;
  try {
    localStorage.setItem(WEIGHT_STEP_KEY, String(Number(v)));
  } catch { /* 保存できなくても画面は続ける */ }
}
