import { getAll } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { buildInsightPrompt, callGemini } from '../lib/gemini.js';

export async function renderInsights(el) {
  const sets = await getAll('sets');

  if (!sets.length) {
    el.innerHTML = `<h2 class="view-title">インサイト</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="view-title">インサイト</h2>
    <div class="card">
      <strong>AIインサイト（Gemini）</strong>
      <p class="muted">蓄積データを分析し具体的な改善提案を生成します。</p>
      <button id="ai-run" class="btn btn-primary btn-block">AIで分析</button>
      <div id="ai-out" class="muted" style="margin-top:10px;white-space:pre-wrap"></div>
    </div>`;

  el.querySelector('#ai-run').addEventListener('click', async () => {
    const out = el.querySelector('#ai-out');
    const key = localStorage.getItem('gemini_api_key') || '';
    if (!key) { out.textContent = '設定でGemini APIキーを登録してください。'; return; }
    out.textContent = '分析中…';
    try {
      const exercises = await getAll('exercises');
      const workouts = (await getAll('workouts')).sort((a, b) => (a.date < b.date ? 1 : -1));
      const workoutNotes = workouts.map((w) => w.note).filter((n) => n && n.trim()).slice(0, 10);
      const prs = computePRs(sets);
      const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
      const stats = {
        prs: Object.entries(prs).map(([id, pr]) => ({ name: nameOf(id), pr })),
        recentCount: sets.length,
        workoutNotes,
      };
      const prompt = buildInsightPrompt(stats);
      out.textContent = await callGemini(prompt, key, {});
    } catch (e) { out.textContent = 'エラー: ' + e.message; }
  });
}
