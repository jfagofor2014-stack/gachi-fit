export const DEFAULT_EXERCISE_PRESETS = [
  { name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸' },
  { name: 'インクラインベンチプレス', bodyPart: '胸/上部', category: '胸' },
  { name: 'ダンベルフライ', bodyPart: '胸/内側', category: '胸' },
  { name: 'ディップス', bodyPart: '胸/下部', category: '胸' },
  { name: 'プッシュアップ', bodyPart: '胸/全体', category: '胸' },
  { name: 'スクワット', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'レッグプレス', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'レッグエクステンション', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'レッグカール', bodyPart: '脚/ハムストリング', category: '脚' },
  { name: 'ルーマニアンデッドリフト', bodyPart: '脚/ハムストリング', category: '脚' },
  { name: 'カーフレイズ', bodyPart: '脚/カーフ', category: '脚' },
  { name: 'ブルガリアンスクワット', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'デッドリフト', bodyPart: '背中/下部', category: '背中' },
  { name: 'ラットプルダウン', bodyPart: '背中/広背筋', category: '背中' },
  { name: '懸垂', bodyPart: '背中/広背筋', category: '背中' },
  { name: 'ベントオーバーロウ', bodyPart: '背中/中部', category: '背中' },
  { name: 'シーテッドロウ', bodyPart: '背中/中部', category: '背中' },
  { name: 'Tバーロウ', bodyPart: '背中/中部', category: '背中' },
  { name: 'ショルダープレス', bodyPart: '肩/前部', category: '肩' },
  { name: 'サイドレイズ', bodyPart: '肩/側部', category: '肩' },
  { name: 'リアレイズ', bodyPart: '肩/後部', category: '肩' },
  { name: 'アップライトロウ', bodyPart: '肩/側部', category: '肩' },
  { name: 'バーベルカール', bodyPart: '腕/上腕二頭筋', category: '腕' },
  { name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕' },
  { name: 'トライセプスエクステンション', bodyPart: '腕/上腕三頭筋', category: '腕' },
  { name: 'ケーブルプッシュダウン', bodyPart: '腕/上腕三頭筋', category: '腕' },
  { name: 'プランク', bodyPart: '体幹/腹筋', category: 'その他' },
  { name: 'クランチ', bodyPart: '体幹/腹筋', category: 'その他' },
];

// name/bodyPart部分一致（大小無視）でプリセットを検索する（純粋関数）
export function searchPresets(query, presets = DEFAULT_EXERCISE_PRESETS) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return presets.filter((p) =>
    p.name.toLowerCase().includes(q) || p.bodyPart.toLowerCase().includes(q));
}
