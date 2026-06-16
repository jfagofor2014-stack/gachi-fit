import { getAll } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { sparklinePath } from '../lib/chart.js';
import { escapeHtml } from './exercises.js';

export async function renderHistory(el) {
  const exercises = await getAll('exercises');
  const sets = (await getAll('sets')).sort((a, b) => b.createdAt - a.createdAt);
  const logs = await getAll('sensoryLogs');
  const prs = computePRs(sets);
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';

  if (!sets.length) {
    el.innerHTML = `<h2 class="view-title">履歴 / PR</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
    return;
  }

  const byEx = {};
  for (const s of sets) (byEx[s.exerciseId] ||= []).push(s);

  el.innerHTML = `<h2 class="view-title">履歴 / PR</h2>` +
    Object.entries(byEx).map(([id, list]) => {
      const chrono = [...list].sort((a, b) => a.createdAt - b.createdAt);
      const series = chrono.map((s) => s.estimated1RM);
      const d = sparklinePath(series, 300, 44);
      const chart = d
        ? `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="${d}" /></svg>`
        : '';
      return `
      <div class="card">
        <div class="list-item" style="border:none;padding:0 0 8px">
          <strong>${escapeHtml(nameOf(id))}</strong>
          <span class="pr-badge">PR ${prs[id].toFixed(1)}kg</span>
        </div>
        ${chart}
        ${list.slice(0, 8).map((s) => {
          const log = logs.find((l) => l.setId === s.id);
          const dt = new Date(s.createdAt);
          return `<div class="list-item">
            <span class="muted">${dt.getMonth() + 1}/${dt.getDate()}</span>
            <span>${s.weight}kg × ${s.reps}</span>
            <span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
}
