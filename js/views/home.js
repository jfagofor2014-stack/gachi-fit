import { getAll } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';

export async function renderHome(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
  const prs = computePRs(sets);
  const today = new Date().toISOString().slice(0, 10);
  const workouts = await getAll('workouts');
  const todayWorkout = workouts.find((w) => w.date === today);
  const todayCount = todayWorkout ? sets.filter((s) => s.workoutId === todayWorkout.id).length : 0;
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';

  const prRows = Object.entries(prs)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => `<div class="list-item"><span>${escapeHtml(nameOf(id))}</span>
      <span class="pr-badge">${v.toFixed(1)}kg</span></div>`).join('');

  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    <div class="card">
      <div class="muted">本日のセット数</div>
      <div class="timer-big" style="font-size:40px">${todayCount}</div>
    </div>
    <div class="card">
      <strong>PR（推定1RM）</strong>
      ${prRows || '<p class="muted">まだ記録がありません。</p>'}
    </div>`;
}
