// タグ出現回数を降順で返す
export function tagFrequency(logs = []) {
  const counts = {};
  for (const l of logs) for (const t of l.tags || []) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function avg(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

// タグごとの平均スコアが全体平均から threshold を超えて乖離するタグを抽出
export function tagScoreCorrelation(logs = [], threshold = 1.0) {
  const scored = logs.filter((l) => typeof l.score === 'number');
  const overall = avg(scored.map((l) => l.score));
  const byTag = {};
  for (const l of scored) for (const t of l.tags || []) (byTag[t] ||= []).push(l.score);
  const res = [];
  for (const [tag, scores] of Object.entries(byTag)) {
    const a = avg(scores);
    const diff = a - overall;
    if (Math.abs(diff) > threshold) {
      res.push({ tag, avg: a, overall, diff, direction: diff > 0 ? 'higher' : 'lower' });
    }
  }
  return res.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

// タグごとの平均推定1RMが全体平均から threshold を超えて乖離するタグを抽出
export function tag1RMCorrelation(logs = [], sets = [], threshold = 5) {
  const rmOf = {};
  for (const s of sets) rmOf[s.id] = s.estimated1RM;
  const all = sets.map((s) => s.estimated1RM).filter((v) => typeof v === 'number');
  const overall = avg(all);
  const byTag = {};
  for (const l of logs) {
    const rm = rmOf[l.setId];
    if (typeof rm !== 'number') continue;
    for (const t of l.tags || []) (byTag[t] ||= []).push(rm);
  }
  const res = [];
  for (const [tag, rms] of Object.entries(byTag)) {
    const a = avg(rms);
    const diff = a - overall;
    if (Math.abs(diff) > threshold) {
      res.push({ tag, avg: a, overall, diff, direction: diff > 0 ? 'higher' : 'lower' });
    }
  }
  return res.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}
