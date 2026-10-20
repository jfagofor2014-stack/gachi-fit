// homeOk: 自宅の器具（可変ダンベル最大30kg・EZバー・可変ベンチ・懸垂＋ディップスのマシン）でできるか
// bodyweight: 自重種目。重量欄に体重を入れて記録する（true のものだけ持つ）
export const DEFAULT_EXERCISE_PRESETS = [
  { name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸', homeOk: false },
  { name: 'インクラインベンチプレス', bodyPart: '胸/上部', category: '胸', homeOk: false },
  { name: 'ダンベルフライ', bodyPart: '胸/内側', category: '胸', homeOk: true },
  { name: 'ディップス', bodyPart: '胸/下部', category: '胸', homeOk: true, bodyweight: true },
  { name: 'プッシュアップ', bodyPart: '胸/全体', category: '胸', homeOk: true, bodyweight: true },
  { name: 'スクワット', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: false },
  { name: 'レッグプレス', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: false },
  { name: 'レッグエクステンション', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: false },
  { name: 'レッグカール', bodyPart: '脚/ハムストリング', category: '脚', homeOk: false },
  { name: 'ルーマニアンデッドリフト', bodyPart: '脚/ハムストリング', category: '脚', homeOk: false },
  { name: 'カーフレイズ', bodyPart: '脚/カーフ', category: '脚', homeOk: true },
  { name: 'ブルガリアンスクワット', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'デッドリフト', bodyPart: '背中/下部', category: '背中', homeOk: false },
  { name: 'ラットプルダウン', bodyPart: '背中/広背筋', category: '背中', homeOk: false },
  { name: '懸垂', bodyPart: '背中/広背筋', category: '背中', homeOk: true, bodyweight: true },
  { name: 'ベントオーバーロウ', bodyPart: '背中/中部', category: '背中', homeOk: true },
  { name: 'シーテッドロウ', bodyPart: '背中/中部', category: '背中', homeOk: false },
  { name: 'Tバーロウ', bodyPart: '背中/中部', category: '背中', homeOk: false },
  { name: 'ショルダープレス', bodyPart: '肩/前部', category: '肩', homeOk: true },
  { name: 'サイドレイズ', bodyPart: '肩/側部', category: '肩', homeOk: true },
  { name: 'リアレイズ', bodyPart: '肩/後部', category: '肩', homeOk: true },
  { name: 'アップライトロウ', bodyPart: '肩/側部', category: '肩', homeOk: true },
  { name: 'バーベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: false },
  { name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'トライセプスエクステンション', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: true },
  { name: 'ケーブルプッシュダウン', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: false },
  { name: 'プランク', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true, bodyweight: true },
  { name: 'クランチ', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true, bodyweight: true },

  // 自宅向け（ここから22件）
  { name: 'ダンベルベンチプレス', bodyPart: '胸/上部', category: '胸', homeOk: true },
  { name: 'インクラインダンベルプレス', bodyPart: '胸/上部', category: '胸', homeOk: true },
  { name: 'EZバーフロアプレス', bodyPart: '胸/全体', category: '胸', homeOk: true },
  { name: '足上げプッシュアップ', bodyPart: '胸/上部', category: '胸', homeOk: true, bodyweight: true },
  { name: 'ダンベルプルオーバー', bodyPart: '胸/全体', category: '胸', homeOk: true },
  { name: 'チンアップ', bodyPart: '背中/広背筋', category: '背中', homeOk: true, bodyweight: true },
  { name: 'ワンハンドダンベルロウ', bodyPart: '背中/広背筋', category: '背中', homeOk: true },
  { name: 'チェストサポートダンベルロウ', bodyPart: '背中/中部', category: '背中', homeOk: true },
  { name: 'ダンベルシュラッグ', bodyPart: '背中/上部', category: '背中', homeOk: true },
  { name: 'アーノルドプレス', bodyPart: '肩/前部', category: '肩', homeOk: true },
  { name: 'EZバーカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'インクラインダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'ハンマーカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'EZバーライイングトライセプスエクステンション', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: true },
  { name: 'フレンチプレス', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: true },
  { name: 'ゴブレットスクワット', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'ダンベルランジ', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'ステップアップ', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'ダンベルルーマニアンデッドリフト', bodyPart: '脚/ハムストリング', category: '脚', homeOk: true },
  { name: 'ダンベルヒップスラスト', bodyPart: '脚/殿筋', category: '脚', homeOk: true },
  { name: 'ぶら下がりレッグレイズ', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true, bodyweight: true },
  { name: 'ロシアンツイスト', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true },
];

// name/bodyPart部分一致（大小無視）でプリセットを検索する（純粋関数）
export function searchPresets(query, presets = DEFAULT_EXERCISE_PRESETS) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return presets.filter((p) =>
    p.name.toLowerCase().includes(q) || p.bodyPart.toLowerCase().includes(q));
}
