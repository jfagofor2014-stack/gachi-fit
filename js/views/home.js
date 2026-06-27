import { getAll, get } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { daysUntil } from '../lib/countdown.js';
import { formatMinutes } from '../lib/duration.js';
import { escapeHtml } from './exercises.js';
import { renderCalendar } from './calendar.js';
import { localDateStr } from '../lib/localdate.js';
import { maxCategoryVolumeWithDate, categoryVolumeForDate, categoryKey, setVolume, VOLUME_START_DATE } from '../lib/volume.js';
import { workoutToMarkdown, buildObsidianUri, downloadText } from '../lib/obsidian.js';

export async function renderHome(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
  const prs = computePRs(sets);
  const today = localDateStr();
  const workouts = await getAll('workouts');
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
  const maxVol = maxCategoryVolumeWithDate(sets, exById, wkById, VOLUME_START_DATE);
  const volEntries = Object.entries(maxVol).sort((a, b) => b[1].volume - a[1].volume);
  const volRows = volEntries.map(([cat, info]) => {
    const [, m, d] = info.date.split('-');
    return `<div class="vol-row" data-cat="${escapeHtml(cat)}" data-date="${info.date}">
      <div class="list-item">
        <span>${escapeHtml(cat)}</span>
        <span class="pr-badge">${Math.round(info.volume)}kg（${Number(m)}/${Number(d)}）</span>
      </div>
      <div class="vol-breakdown muted" style="display:none"></div>
    </div>`;
  }).join('');
  const volCard = volRows
    ? `<div class="card"><strong>部位別 最高ボリューム</strong>${volRows}</div>`
    : '';

  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    <div class="card">
      <strong>トレーニングカレンダー</strong>
      <div id="home-cal" style="margin-top:10px"></div>
      <div id="home-day" style="margin-top:12px"></div>
    </div>
    ${countdownCard}
    <details class="card">
      <summary><strong>推定1RM</strong></summary>
      <div style="margin-top:10px">${prRows || '<p class="muted">まだ記録がありません。</p>'}</div>
    </details>
    ${volCard}`;

  const setWorkoutIds = new Set(sets.map((s) => s.workoutId));
  const trainedDates = new Set(
    workouts.filter((w) => setWorkoutIds.has(w.id)).map((w) => w.date)
  );

  renderCalendar(el.querySelector('#home-cal'), {
    trainedDates,
    initialDate: new Date(),
    onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises, nameOf }),
  });

  el.querySelectorAll('.vol-row').forEach((row) => {
    row.querySelector('.list-item').addEventListener('click', () => {
      const bd = row.querySelector('.vol-breakdown');
      if (bd.style.display === 'block') { bd.style.display = 'none'; return; }
      const cat = row.dataset.cat;
      const date = row.dataset.date;
      const dayWk = workouts.find((w) => w.date === date);
      const daySets = dayWk
        ? sets.filter((s) => s.workoutId === dayWk.id && categoryKey(exById[s.exerciseId]) === cat)
        : [];
      bd.innerHTML = daySets.length
        ? daySets.map((s) => `<div class="list-item" style="font-size:13px">
            <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}</span>
            <span class="muted">${Math.round(setVolume(s.weight, s.reps, s.assistedReps))}</span>
          </div>`).join('')
        : '<p class="muted">内訳なし</p>';
      bd.style.display = 'block';
    });
  });
}

async function renderDayDetail(box, date, { exercises, nameOf }) {
  const workouts = await getAll('workouts');
  const workout = workouts.find((w) => w.date === date);
  if (!workout) { box.innerHTML = `<p class="muted">${date}：この日の記録はありません</p>`; return; }
  const sets = (await getAll('sets')).filter((s) => s.workoutId === workout.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const logs = await getAll('sensoryLogs');
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
    ${workout.note ? `<div class="muted" style="margin-top:8px">感想: ${escapeHtml(workout.note)}</div>` : ''}
    <div class="row" style="margin-top:10px">
      <button id="day-obsidian" class="btn btn-primary">Obsidianに送る</button>
      <button id="day-md" class="btn">Markdown DL</button>
    </div>
    <div id="day-export-msg" class="muted" style="margin-top:6px"></div>`;

  const data = buildDayData(date, workout, sets, exercises, placeName, logs);
  const fileName = `gachi-fit-${date}.md`;
  box.querySelector('#day-obsidian').addEventListener('click', () => {
    const vault = (localStorage.getItem('obsidian_vault') || '').trim();
    if (!vault) { box.querySelector('#day-export-msg').textContent = '設定でvault名を登録してください。'; return; }
    location.href = buildObsidianUri(vault, fileName, workoutToMarkdown(data));
  });
  box.querySelector('#day-md').addEventListener('click', () => {
    downloadText(workoutToMarkdown(data), fileName);
  });
}

function buildDayData(date, workout, sets, exercises, placeName, logs) {
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const wkById = { [workout.id]: workout };
  const volRaw = categoryVolumeForDate(sets, exById, wkById, date);
  const volume = {};
  for (const [c, v] of Object.entries(volRaw)) volume[c] = Math.round(v);

  const order = [];
  const grouped = {};
  for (const s of sets) {
    if (!grouped[s.exerciseId]) { grouped[s.exerciseId] = []; order.push(s.exerciseId); }
    const log = logs.find((l) => l.setId === s.id) || {};
    grouped[s.exerciseId].push({
      weight: s.weight, reps: s.reps, assistedReps: s.assistedReps || 0,
      estimated1RM: s.estimated1RM, tags: log.tags || [], note: log.note || '',
    });
  }
  const exercisesData = order.map((id) => ({
    name: exById[id]?.name || '?', category: exById[id]?.category || '', sets: grouped[id],
  }));
  return {
    date,
    place: placeName || '',
    durationMin: workout.durationSec ? Math.round(workout.durationSec / 60) : 0,
    note: workout.note || '',
    volume,
    exercises: exercisesData,
  };
}
