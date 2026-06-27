import { getAll } from '../db.js';
import { tagFrequency, tag1RMCorrelation } from '../lib/insights.js';
import { computePRs } from '../lib/calc.js';
import { buildInsightPrompt, callGemini } from '../lib/gemini.js';
import { escapeHtml } from './exercises.js';

export async function renderInsights(el) {
  const logs = await getAll('sensoryLogs');
  const sets = await getAll('sets');

  if (sets.length < 5) {
    el.innerHTML = `<h2 class="view-title">インサイト</h2>
      <div class="card"><p class="muted">データを蓄積中です（5セット以上で分析を表示）。現在 ${sets.length} セット。</p></div>`;
    return;
  }

  const recent = logs.slice(-30);
  const freq = tagFrequency(recent);
  const rmCorr = tag1RMCorrelation(logs, sets, 5);

  const freqHtml = freq.length
    ? freq.map((f) => `<span class="chip">${escapeHtml(f.tag)} ×${f.count}</span>`).join('')
    : '<p class="muted">タグの記録がありません。</p>';

  const rmHtml = rmCorr.length
    ? rmCorr.map((c) => `<div class="list-item">
        <span>${escapeHtml(c.tag)}</span>
        <span class="muted">推定1RMが全体より${c.direction === 'higher' ? '高い' : '低い'}傾向（平均 ${c.avg.toFixed(1)}kg / 全体 ${c.overall.toFixed(1)}kg）</span>
      </div>`).join('')
    : '<p class="muted">際立った傾向はまだありません。</p>';

  el.innerHTML = `
    <h2 class="view-title">インサイト</h2>
    <div class="card"><strong>よく使うタグ（直近30件）</strong><div style="margin-top:8px">${freqHtml}</div></div>
    <div class="card"><strong>タグ × 推定1RM</strong>${rmHtml}</div>
    <div class="card">
      <strong>AIインサイト（Gemini）</strong>
      <p class="muted">蓄積データを分析し具体的な改善提案を生成します。</p>
      <button id="ai-run" class="btn btn-primary btn-block">AIで分析</button>
      <div id="ai-out" class="muted" style="margin-top:10px;white-space:pre-wrap"></div>
    </div>`;

  const aiBtn = el.querySelector('#ai-run');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
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
          tagFreq: freq,
          recentCount: recent.length,
          workoutNotes,
        };
        const prompt = buildInsightPrompt(stats);
        out.textContent = await callGemini(prompt, key, {});
      } catch (e) { out.textContent = 'エラー: ' + e.message; }
    });
  }
}
