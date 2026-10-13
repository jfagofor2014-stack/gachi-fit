import { matchExerciseNamesToIds } from './courses.js';

// よく使う組み合わせのコース。種目名は DEFAULT_EXERCISE_PRESETS に実在するものだけを使う。
// env: 'gym' はジム用、'home' は自宅用（自宅用は homeOk の種目だけで組む）
export const DEFAULT_COURSE_PRESETS = [
  { name: '胸・肩', env: 'gym', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ショルダープレス', 'サイドレイズ'] },
  { name: '背中・腕', env: 'gym', exercises: ['デッドリフト', 'ラットプルダウン', 'ベントオーバーロウ', 'バーベルカール', 'ケーブルプッシュダウン'] },
  { name: '脚', env: 'gym', exercises: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール', 'カーフレイズ'] },
  { name: '胸のみ', env: 'gym', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ディップス'] },
  { name: 'プッシュ', env: 'gym', exercises: ['ベンチプレス', 'ショルダープレス', 'サイドレイズ', 'ケーブルプッシュダウン'] },
  { name: 'プル', env: 'gym', exercises: ['懸垂', 'ラットプルダウン', 'シーテッドロウ', 'バーベルカール'] },

  { name: '自宅 プッシュ', env: 'home', exercises: ['ダンベルベンチプレス', 'ディップス', 'ショルダープレス', 'サイドレイズ', 'EZバーライイングトライセプスエクステンション'] },
  { name: '自宅 プル', env: 'home', exercises: ['懸垂', 'チンアップ', 'ワンハンドダンベルロウ', 'リアレイズ', 'インクラインダンベルカール'] },
  { name: '自宅 脚・お尻', env: 'home', exercises: ['ゴブレットスクワット', 'ブルガリアンスクワット', 'ダンベルルーマニアンデッドリフト', 'ダンベルヒップスラスト', 'カーフレイズ'] },
  { name: '自宅 胸・三頭', env: 'home', exercises: ['ダンベルベンチプレス', 'インクラインダンベルプレス', 'ダンベルフライ', 'ディップス', 'EZバーライイングトライセプスエクステンション'] },
  { name: '自宅 背中・二頭', env: 'home', exercises: ['懸垂', 'ワンハンドダンベルロウ', 'チェストサポートダンベルロウ', 'EZバーカール', 'ハンマーカール'] },
  { name: '自宅 肩・腕', env: 'home', exercises: ['ショルダープレス', 'アーノルドプレス', 'サイドレイズ', 'リアレイズ', 'EZバーカール', 'フレンチプレス'] },
  { name: '自宅 全身', env: 'home', exercises: ['ゴブレットスクワット', 'ダンベルベンチプレス', 'ワンハンドダンベルロウ', 'ダンベルルーマニアンデッドリフト', 'ショルダープレス', '懸垂'] },
];

// names のうち exercises に同名が存在しないものを、順序を保ち重複を除いて返す（純粋関数）
export function missingExerciseNames(names, exercises) {
  const registered = new Set(exercises.map((e) => e.name));
  const seen = new Set();
  const out = [];
  for (const name of names) {
    if (registered.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

// コースプリセットを1件登録する。未登録の種目は種目プリセットから補って登録し
// （homeOk / bodyweight も引き継ぐ）、コースを作る。依存注入でテスト可能
// deps: { getAll, put, uid, exercisePresets }
export async function registerCoursePreset(preset, { getAll, put, uid, exercisePresets }) {
  const current = await getAll('exercises');
  let added = 0;
  for (const name of missingExerciseNames(preset.exercises, current)) {
    const src = exercisePresets.find((p) => p.name === name);
    if (!src) continue;
    await put('exercises', {
      id: uid(), name: src.name, bodyPart: src.bodyPart, category: src.category,
      cuePresets: [], setPattern: '通常',
      homeOk: src.homeOk !== false, bodyweight: src.bodyweight === true,
    });
    added++;
  }
  const after = await getAll('exercises');
  const exerciseIds = matchExerciseNamesToIds(preset.exercises, after);
  await put('courses', { id: uid(), name: preset.name, exerciseIds });
  return { added };
}

// 自宅コースのプリセットをまとめて登録する。同名のコースが既にあれば作らない（何度呼んでも重複しない）
export async function registerHomeCoursePack(deps) {
  const have = new Set((await deps.getAll('courses')).map((c) => c.name));
  let exercises = 0;
  let courses = 0;
  for (const preset of DEFAULT_COURSE_PRESETS.filter((p) => p.env === 'home')) {
    if (have.has(preset.name)) continue;
    const { added } = await registerCoursePreset(preset, deps);
    exercises += added;
    courses++;
  }
  return { exercises, courses };
}
