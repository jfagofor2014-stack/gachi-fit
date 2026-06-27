import { getAll, get } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { daysUntil } from '../lib/countdown.js';
import { formatMinutes } from '../lib/duration.js';
import { escapeHtml } from './exercises.js';
import { renderCalendar } from './calendar.js';
import { localDateStr } from '../lib/localdate.js';
import { maxCategoryVolumeExcludingDate } from '../lib/volume.js';

export async function renderHome(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
  const prs = computePRs(sets);
  const today = localDateStr();
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

  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
  const maxVol = maxCategoryVolumeExcludingDate(sets, exById, wkById, null);
  const maxVolEntries = Object.entries(maxVol).sort((a, b) => b[1] - a[1]);
  const topVol = maxVolEntries.length ? maxVolEntries[0][1] : 0;
  const volRows = maxVolEntries.map(([cat, v]) => {
    const pct = topVol > 0 ? Math.round((v / topVol) * 100) : 0;
    return `<div style="margin:6px 0">
      <div class="muted">${escapeHtml(cat)}：${Math.round(v)}</div>
      <div class="volbar"><div class="volbar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  const volCard = volRows
    ? `<div class="card"><strong>部位別 最高ボリューム</strong>${volRows}</div>`
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
    </div>
    ${volCard}
    <div class="card">
      <strong>トレーニングカレンダー</strong>
      <div id="home-cal" style="margin-top:10px"></div>
      <div id="home-day" style="margin-top:12px"></div>
    </div>`;

  const setWorkoutIds = new Set(sets.map((s) => s.workoutId));
  const trainedDates = new Set(
    workouts.filter((w) => setWorkoutIds.has(w.id)).map((w) => w.date)
  );

  renderCalendar(el.querySelector('#home-cal'), {
    trainedDates,
    initialDate: new Date(),
    onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises, nameOf }),
  });
}

async function renderDayDetail(box, date, { exercises, nameOf }) {
  const workouts = await getAll('workouts');
  const workout = workouts.find((w) => w.date === date);
  if (!workout) { box.innerHTML = `<p class="muted">${date}：この日の記録はありません</p>`; return; }
  const sets = (await getAll('sets')).filter((s) => s.workoutId === workout.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  let placeName = '';
  if (workout.placeId) {
    const place = (await getAll('places')).find((p) => p.id === workout.placeId);
    placeName = place ? place.name : '';
  }
  const meta = [
    placeName ? `場所: ${escapeHtml(placeName)}` : '',
    workout.durationSec ? `時間: ${formatMinutes(workout.durationSec)}` : '',
  ].filter(Boolean).join(' / ');

  const rows = sets.map((s) => `<div class="list-item">
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}</span>
      <span class="muted">1RM ${s.estimated1RM.toFixed(0)}</span>
    </div>`).join('') || '<p class="muted">セットなし</p>';

  box.innerHTML = `<strong>${date}</strong>
    ${meta ? `<div class="muted" style="margin:4px 0">${meta}</div>` : ''}
    ${rows}
    ${workout.note ? `<div class="muted" style="margin-top:8px">感想: ${escapeHtml(workout.note)}</div>` : ''}`;
}
