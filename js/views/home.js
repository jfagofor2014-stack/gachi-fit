import { getAll, get } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { daysUntil } from '../lib/countdown.js';
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

  const goal = await get('goals', 'main');
  const days = goal ? daysUntil(goal.competitionDate) : null;
  const countdownCard = (days != null && days >= 0)
    ? `<div class="card"><div class="muted">大会まで</div><div class="countdown">${days}<span style="font-size:24px">日</span></div></div>`
    : '';

  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    ${countdownCard}
    <div class="card">
      <div class="muted">本日のセット数</div>
      <div class="timer-big" style="font-size:40px">${todayCount}</div>
    </div>
    <div class="card">
      <strong>PR（推定1RM）</strong>
      ${prRows || '<p class="muted">まだ記録がありません。</p>'}
    </div>`;
}
