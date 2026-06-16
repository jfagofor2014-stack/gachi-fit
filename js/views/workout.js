import { getAll, put, uid } from '../db.js';
import { estimate1RM, sensoryScore, computePRs } from '../lib/calc.js';
import { createTimer, formatTime } from '../timer.js';
import { escapeHtml } from './exercises.js';

const INTERVAL_SEC = 90;
let timer;

export const SENSORY_TAGS = ['調子良い', '腹圧抜けた', 'フォーム崩れ', '対象筋に効いた', '関節に違和感', '軽く感じた'];

export async function renderWorkout(el) {
  const exercises = await getAll('exercises');
  const allSets = await getAll('sets');
  const prs = computePRs(allSets);

  if (!exercises.length) {
    el.innerHTML = `<h2 class="view-title">記録</h2>
      <div class="card"><p class="muted">先に「メニュー」で種目を登録してください。</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="view-title">記録</h2>
    <div class="card">
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input">
          ${exercises.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>
    <div class="card">
      <div class="row">
        <div class="field"><label>重量(kg)</label><input id="w-weight" class="input" type="number" inputmode="decimal" /></div>
        <div class="field"><label>回数</label><input id="w-reps" class="input" type="number" inputmode="numeric" /></div>
      </div>
      <div class="muted">推定1RM: <span id="w-1rm" class="pr-badge">-</span></div>
      <div class="field" style="margin-top:12px"><label>腹圧保持 (1-5)</label>
        <div class="seg" id="w-core">${seg(5)}</div></div>
      <div class="field"><label>対象筋への負荷 (1-5)</label>
        <div class="seg" id="w-load">${seg(5)}</div></div>
      <div class="field"><label>可動域 ROM</label>
        <div class="seg" id="w-rom">
          <button data-v="full" class="sel">フル</button>
          <button data-v="partial">部分</button>
          <button data-v="cheating">チーティング</button>
        </div></div>
      <div class="field"><label>定型タグ（複数可）</label>
        <div id="w-tags">
          ${SENSORY_TAGS.map((t) => `<button type="button" class="chip chip-tag" data-tag="${t}">${t}</button>`).join('')}
        </div></div>
      <div class="field"><label>メモ（任意）</label>
        <input id="w-note" class="input" placeholder="例: 3セット目から効きが浅い" /></div>
      <div id="w-error" class="error"></div>
      <button id="w-save" class="btn btn-primary btn-block">セット記録 + インターバル開始</button>
    </div>
    <div class="card" id="w-timer-card" style="display:none">
      <div class="timer-big" id="w-timer">1:30</div>
      <button id="w-timer-stop" class="btn btn-block">タイマー停止</button>
    </div>
    <div class="card"><strong>本日のセット</strong><div id="w-today"></div></div>`;

  const state = { core: null, load: null, rom: 'full', tags: new Set(), note: '' };

  function refreshPR() {
    const exId = el.querySelector('#w-ex').value;
    const pr = prs[exId];
    el.querySelector('#w-pr').innerHTML = pr
      ? `PR(推定1RM): <span class="pr-badge">${pr.toFixed(1)}kg</span>`
      : 'PR: <span class="muted">記録なし</span>';
    const ex = exercises.find((e) => e.id === exId);
    el.querySelector('#w-cues').innerHTML =
      (ex?.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('');
  }

  function refresh1RM() {
    const w = parseFloat(el.querySelector('#w-weight').value);
    const r = parseInt(el.querySelector('#w-reps').value, 10);
    el.querySelector('#w-1rm').textContent =
      w > 0 && r > 0 ? estimate1RM(w, r).toFixed(1) + 'kg' : '-';
  }

  el.querySelector('#w-ex').addEventListener('change', refreshPR);
  el.querySelector('#w-weight').addEventListener('input', refresh1RM);
  el.querySelector('#w-reps').addEventListener('input', refresh1RM);
  bindSeg(el, '#w-core', (v) => (state.core = v));
  bindSeg(el, '#w-load', (v) => (state.load = v));
  bindSeg(el, '#w-rom', (v) => (state.rom = v), 'full');
  el.querySelectorAll('#w-tags .chip-tag').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (state.tags.has(t)) { state.tags.delete(t); b.classList.remove('sel'); }
      else { state.tags.add(t); b.classList.add('sel'); }
    }));
  el.querySelector('#w-note').addEventListener('input', (e) => (state.note = e.target.value));

  timer = createTimer({
    onTick: (s) => (el.querySelector('#w-timer').textContent = formatTime(s)),
    onDone: () => (el.querySelector('#w-timer-card').style.display = 'none'),
  });
  el.querySelector('#w-timer-stop').addEventListener('click', () => {
    timer.stop();
    el.querySelector('#w-timer-card').style.display = 'none';
  });

  el.querySelector('#w-save').addEventListener('click', async () => {
    const err = el.querySelector('#w-error');
    const weight = parseFloat(el.querySelector('#w-weight').value);
    const reps = parseInt(el.querySelector('#w-reps').value, 10);
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    if (state.core === null || state.load === null) { err.textContent = '腹圧と対象筋負荷を選択してください'; return; }
    err.textContent = '';
    const exerciseId = el.querySelector('#w-ex').value;
    const today = new Date().toISOString().slice(0, 10);
    let workouts = await getAll('workouts');
    let workout = workouts.find((w) => w.date === today);
    if (!workout) { workout = { id: uid(), date: today, note: '' }; await put('workouts', workout); }
    const est = estimate1RM(weight, reps);
    const setId = uid();
    await put('sets', { id: setId, workoutId: workout.id, exerciseId, weight, reps,
      estimated1RM: est, targetWeight: prs[exerciseId] || null, createdAt: Date.now() });
    const score = sensoryScore({ core: state.core, muscleLoad: state.load, rom: state.rom });
    await put('sensoryLogs', { id: uid(), setId, core: state.core, muscleLoad: state.load,
      rom: state.rom, score, note: state.note, tags: [...state.tags] });
    el.querySelector('#w-timer-card').style.display = 'block';
    state.tags.clear();
    state.note = '';
    el.querySelectorAll('#w-tags .chip-tag').forEach((b) => b.classList.remove('sel'));
    el.querySelector('#w-note').value = '';
    timer.start(INTERVAL_SEC);
    await renderToday(el, exercises);
  });

  refreshPR();
  await renderToday(el, exercises);
}

function seg(n) {
  return Array.from({ length: n }, (_, i) => `<button data-v="${i + 1}">${i + 1}</button>`).join('');
}

function bindSeg(el, sel, cb, initial) {
  const wrap = el.querySelector(sel);
  if (initial !== undefined) cb(initial);
  wrap.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      const v = b.dataset.v;
      cb(isNaN(Number(v)) ? v : Number(v));
    }));
}

async function renderToday(el, exercises) {
  const today = new Date().toISOString().slice(0, 10);
  const workouts = await getAll('workouts');
  const workout = workouts.find((w) => w.date === today);
  const box = el.querySelector('#w-today');
  if (!workout) { box.innerHTML = '<p class="muted">まだ記録なし</p>'; return; }
  const sets = (await getAll('sets')).filter((s) => s.workoutId === workout.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const logs = await getAll('sensoryLogs');
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
  box.innerHTML = sets.map((s) => {
    const log = logs.find((l) => l.setId === s.id);
    return `<div class="list-item">
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}</span>
      <span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>
    </div>`;
  }).join('') || '<p class="muted">まだ記録なし</p>';
}
