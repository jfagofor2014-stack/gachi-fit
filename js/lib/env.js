// トレーニング環境（自宅／ジム）。種目・コースの「選択・提案」を環境で絞り込む。
// 履歴や集計は絞り込まない（呼び出し側で全種目を使う）。
const STORAGE_KEY = 'training_env';
export const ENV_HOME = 'home';
export const ENV_GYM = 'gym';

// 自宅では homeOk が false の種目を除く。未設定は隠さない。ジムは全種目
export function visibleExercises(exercises, env) {
  if (env !== ENV_HOME) return exercises;
  return exercises.filter((e) => e.homeOk !== false);
}

// 自宅では、コースに含まれる実在の種目がすべて使えるときだけ出す。削除済みのIDは判定から除く
export function courseAvailable(course, exercises, env) {
  if (env !== ENV_HOME) return true;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const id of course.exerciseIds || []) {
    const ex = byId.get(id);
    if (ex && ex.homeOk === false) return false;
  }
  return true;
}

export function visibleCoursePresets(presets, env) {
  return presets.filter((p) => p.env === env);
}

// 初期値と読み取り失敗時は 'gym'（更新しても従来の挙動のまま）
export function getEnv() {
  try {
    return localStorage.getItem(STORAGE_KEY) === ENV_HOME ? ENV_HOME : ENV_GYM;
  } catch {
    return ENV_GYM;
  }
}

export function setEnv(env) {
  try {
    localStorage.setItem(STORAGE_KEY, env === ENV_HOME ? ENV_HOME : ENV_GYM);
  } catch { /* 保存できなくても画面の動作は続ける */ }
}
