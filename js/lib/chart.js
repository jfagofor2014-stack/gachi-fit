// 数値配列から SVG path の d 文字列を生成。
// x は等間隔、y は min->bottom, max->top にマップ。pad は上下余白。
export function sparklinePath(values, width, height, pad = 2) {
  if (!values || values.length === 0) return '';
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const yOf = (v) => {
    if (span === 0) return height / 2;
    return pad + (1 - (v - min) / span) * (height - pad * 2);
  };
  const xOf = (i) => (n === 1 ? 0 : (i / (n - 1)) * width);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`)
    .join(' ');
}

// 数値配列から階段状（水平→垂直の順に繋ぐ）SVG path の d 文字列を生成。
// min/max→y座標のマッピングは sparklinePath と同じ。
export function stepPath(values, width, height, pad = 2) {
  if (!values || values.length === 0) return '';
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const yOf = (v) => {
    if (span === 0) return height / 2;
    return pad + (1 - (v - min) / span) * (height - pad * 2);
  };
  const xOf = (i) => (n === 1 ? 0 : (i / (n - 1)) * width);
  let d = `M${xOf(0)},${yOf(values[0])}`;
  for (let i = 1; i < n; i++) {
    d += ` L${xOf(i)},${yOf(values[i - 1])} L${xOf(i)},${yOf(values[i])}`;
  }
  return d;
}
