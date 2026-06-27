// 1日分の整形済みデータから Obsidian 用 Markdown を生成する（純粋関数）
export function workoutToMarkdown(data) {
  const fm = ['---', `date: ${data.date}`];
  if (data.place) fm.push(`place: ${data.place}`);
  if (data.durationMin) fm.push(`duration_min: ${data.durationMin}`);
  for (const [cat, v] of Object.entries(data.volume || {})) fm.push(`volume_${cat}: ${v}`);
  fm.push('tags: [gachi-fit]');
  fm.push('---');

  const body = [`# ${data.date} トレーニング`];
  const meta = [];
  if (data.place) meta.push(`場所: ${data.place}`);
  if (data.durationMin) meta.push(`時間: ${data.durationMin}分`);
  if (meta.length) { body.push(''); body.push(meta.join(' / ')); }

  for (const ex of data.exercises || []) {
    body.push('');
    body.push(`## ${ex.name}${ex.category ? `（${ex.category}）` : ''}`);
    for (const s of ex.sets) {
      let line = `- ${s.weight}kg × ${s.reps}`;
      if (s.assistedReps) line += `（補助${s.assistedReps}）`;
      line += `（推定1RM ${Math.round(s.estimated1RM)}）`;
      const extras = [];
      if (s.tags && s.tags.length) extras.push(`タグ: ${s.tags.join('、')}`);
      if (s.note) extras.push(`メモ: ${s.note}`);
      if (extras.length) line += ` — ${extras.join(' / ')}`;
      body.push(line);
    }
  }
  if (data.note) { body.push(''); body.push('## 感想'); body.push(data.note); }

  return fm.join('\n') + '\n\n' + body.join('\n') + '\n';
}

export function buildObsidianUri(vault, fileName, content) {
  const enc = encodeURIComponent;
  return `obsidian://new?vault=${enc(vault)}&file=${enc(fileName)}&content=${enc(content)}`;
}

// ブラウザ専用：テキストを .md としてダウンロード
export function downloadText(text, fileName, mime = 'text/markdown') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
