// 全角数字・全角スペースを半角に揃え、前後の空白を落とす（純粋関数）
export function normalizeUtterance(text) {
  return String(text || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripSpaces = (s) => s.replace(/\s+/g, '');

// 発話に含まれる登録済み種目名のうち最も長いものを返す（純粋関数）
export function matchExerciseName(text, names) {
  const hay = stripSpaces(normalizeUtterance(text));
  let best = null;
  for (const name of names) {
    const needle = stripSpaces(name);
    if (needle && hay.includes(needle) && (!best || needle.length > stripSpaces(best).length)) {
      best = name;
    }
  }
  return best;
}

// 発話を {種目名, 重量, 回数} に解析する（純粋関数）
export function parseSetUtterance(text, exerciseNames = []) {
  let rest = normalizeUtterance(text);
  const exerciseName = matchExerciseName(rest, exerciseNames);

  // 種目名に含まれる数字を重量・回数として拾わないよう、一致部分を除去する。
  // 文字間に空白が入った発話にも当たるよう1文字ずつ \s* でつなぐ。
  // 文字列全体から空白を落として除去すると「100 8」が「1008」に化けるため、この方式を使う
  if (exerciseName) {
    const pattern = stripSpaces(exerciseName)
      .split('')
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    rest = rest.replace(new RegExp(pattern), ' ');
  }

  let weight = null;
  let reps = null;

  const weightMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:キロ|㌔|kg)/i);
  if (weightMatch) {
    weight = parseFloat(weightMatch[1]);
    rest = rest.replace(weightMatch[0], ' ');
  }

  const repsMatch = rest.match(/(\d+)\s*(?:回|レップ|reps?)/i);
  if (repsMatch) {
    reps = parseInt(repsMatch[1], 10);
    rest = rest.replace(repsMatch[0], ' ');
  }

  // 残った裸の数値を、埋まっていない項目に前から順に割り当てる
  const bare = rest.match(/\d+(?:\.\d+)?/g) || [];
  for (const n of bare) {
    if (weight === null) weight = parseFloat(n);
    else if (reps === null) reps = parseInt(n, 10);
  }

  return { exerciseName, weight, reps };
}
