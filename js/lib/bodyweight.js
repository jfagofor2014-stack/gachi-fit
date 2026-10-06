// 体重記録から直近の体重を返す（純粋関数）。日付が最大のもの、同日なら配列の後ろのもの。
// 0以下・数値でない記録は無視し、なければ null
export function latestBodyWeight(records) {
  let best = null;
  for (const r of records || []) {
    const w = Number(r.weight);
    if (!(w > 0)) continue;
    if (best === null || r.date >= best.date) best = { date: r.date, weight: w };
  }
  return best ? best.weight : null;
}
