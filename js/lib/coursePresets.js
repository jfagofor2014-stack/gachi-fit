// よく使う組み合わせのコース。種目名は DEFAULT_EXERCISE_PRESETS に実在するものだけを使う
export const DEFAULT_COURSE_PRESETS = [
  { name: '胸・肩', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ショルダープレス', 'サイドレイズ'] },
  { name: '背中・腕', exercises: ['デッドリフト', 'ラットプルダウン', 'ベントオーバーロウ', 'バーベルカール', 'ケーブルプッシュダウン'] },
  { name: '脚', exercises: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール', 'カーフレイズ'] },
  { name: '胸のみ', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ディップス'] },
  { name: 'プッシュ', exercises: ['ベンチプレス', 'ショルダープレス', 'サイドレイズ', 'ケーブルプッシュダウン'] },
  { name: 'プル', exercises: ['懸垂', 'ラットプルダウン', 'シーテッドロウ', 'バーベルカール'] },
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
