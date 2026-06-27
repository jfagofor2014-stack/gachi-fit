import { getAll, get, put, remove, uid } from '../db.js';
import { estimate1RM, computePRs } from '../lib/calc.js';
import { createTimer, formatTime } from '../timer.js';
import { formatMinutes } from '../lib/duration.js';
import { durationMinutes } from '../lib/timerange.js';
import { categoryVolumeForDate, maxCategoryVolumeExcludingDate } from '../lib/volume.js';
import { localDateStr } from '../lib/localdate.js';
import { escapeHtml } from './exercises.js';
import { createStepper } from './components.js';
import { openSetEditor } from './set-editor.js';

export const SENSORY_TAGS = ['調子良い', '腹圧抜けた', 'フォーム崩れ', '対象筋に効いた', '関節に違和感', '軽く感じた'];

let intervalTimer;

const todayStr = () => localDateStr();

// 連続呼び出しのread-modify-write競合を避けるため直列化する
let patchQueue = Promise.resolve();

function patchTodayWorkout(patch = {}) {
  const run = patchQueue.then(async () => {
    const today = todayStr();
    const workouts = await getAll('workouts');
    let w = workouts.find((x) => x.date === today);
    if (!w) w = { id: uid(), date: today, note: '' };
    Object.assign(w, patch);
    await put('workouts', w);
    return w;
  });
  patchQueue = run.catch(() => {});
  return run;
}

export async function renderWorkout(el) {
  const exercises = await getAll('exercises');
  const allSets = await getAll('sets');
  const prs = computePRs(allSets);
  const places = await getAll('places');
  const todayWorkout = (await getAll('workouts')).find((w) => w.date === todayStr());
  const defaultSec = parseInt(localStorage.getItem('default_interval_sec') || '90', 10);
  const intervalChoices = [60, 90, 120, 180];

  if (!exercises.length) {
    el.innerHTML = `<h2 class="view-title">記録</h2>
      <div class="card"><p class="muted">先に「メニュー」で種目を登録してください。</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="view-title">記録</h2>
    <div class="card">
      <strong>本日のトレーニング</strong>
      <div class="field" style="margin-top:10px"><label>場所</label>
        <select id="w-place" class="input">
          <option value="">未選択</option>
          ${places.map((p) => `<option value="${p.id}" ${todayWorkout && todayWorkout.placeId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select></div>
      <div class="row">
        <div class="field"><label>開始</label>
          <input id="w-start" type="time" class="input" value="${todayWorkout && todayWorkout.startTime ? todayWorkout.startTime : ''}" /></div>
        <div class="field"><label>終了</label>
          <input id="w-end" type="time" class="input" value="${todayWorkout && todayWorkout.endTime ? todayWorkout.endTime : ''}" /></div>
      </div>
      <div id="w-dur" class="muted">${todayWorkout && todayWorkout.durationSec ? '所要: ' + formatMinutes(todayWorkout.durationSec) : '所要: —'}</div>
    </div>

    <div class="card">
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input">
          ${exercises.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>

    <div class="card" id="w-volume"></div>

    <div class="card">
      <div class="field"><label>重量(kg)</label><div id="w-weight"></div></div>
      <div class="field"><label>回数</label><div id="w-reps"></div></div>
      <div class="muted">推定1RM: <span id="w-1rm" class="pr-badge">-</span></div>
      <div class="field" style="margin-top:12px">
        <button type="button" id="w-assist-toggle" class="btn btn-block">補助あり：OFF</button>
        <div id="w-assist-wrap" style="display:none;margin-top:8px">
          <label>補助回数</label><div id="w-assist"></div>
        </div>
      </div>
      <div class="field" style="margin-top:12px"><label>定型タグ（複数可）</label>
        <div id="w-tags">
          ${SENSORY_TAGS.map((t) => `<button type="button" class="chip chip-tag" data-tag="${t}">${t}</button>`).join('')}
        </div></div>
      <div class="field"><label>メモ（任意）</label>
        <input id="w-note" class="input" placeholder="例: 3セット目から効きが浅い" /></div>
      <div id="w-error" class="error"></div>
      <button id="w-save" class="btn btn-primary btn-block">セット記録</button>
    </div>

    <div class="card">
      <strong>インターバル</strong>
      <div class="seg" id="w-int-secs" style="margin-top:8px">
        ${intervalChoices.map((s) => `<button data-s="${s}" class="${s === defaultSec ? 'sel' : ''}">${s}秒</button>`).join('')}
      </div>
      <div class="timer-big" id="w-timer" style="display:none">1:30</div>
      <div class="row" style="margin-top:10px">
        <button id="w-int-start" class="btn btn-primary">開始</button>
        <button id="w-int-stop" class="btn">停止</button>
      </div>
    </div>

    <div class="card">
      <strong>本日の感想</strong>
      <p class="muted">AI分析の対象になります。</p>
      <textarea id="w-impression" class="input" rows="3" style="resize:vertical">${todayWorkout ? escapeHtml(todayWorkout.note || '') : ''}</textarea>
      <button id="w-impression-save" class="btn btn-block" style="margin-top:8px">感想を保存</button>
    </div>

    <div class="card"><strong>本日のセット</strong><div id="w-today"></div></div>`;

  const state = { tags: new Set(), note: '', interval: defaultSec };

  const weightStepper = createStepper(el.querySelector('#w-weight'), { value: 0, step: 2.5, min: 0, onChange: refresh1RM });
  const repsStepper = createStepper(el.querySelector('#w-reps'), { value: 0, step: 1, min: 0, onChange: refresh1RM });
  const assistStepper = createStepper(el.querySelector('#w-assist'), { value: 0, step: 1, min: 0, onChange: refresh1RM });
  let assistOn = false;
  el.querySelector('#w-assist-toggle').addEventListener('click', () => {
    assistOn = !assistOn;
    el.querySelector('#w-assist-toggle').textContent = '補助あり：' + (assistOn ? 'ON' : 'OFF');
    el.querySelector('#w-assist-wrap').style.display = assistOn ? 'block' : 'none';
    if (!assistOn) assistStepper.set(0);
    refresh1RM();
  });

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
    const w = weightStepper.get();
    const r = repsStepper.get();
    const a = assistOn ? assistStepper.get() : 0;
    const selfReps = r - a;
    el.querySelector('#w-1rm').textContent =
      w > 0 && selfReps > 0 ? estimate1RM(w, selfReps).toFixed(1) + 'kg' : '-';
  }

  async function refreshVolumeBar() {
    const box = el.querySelector('#w-volume');
    const exId = el.querySelector('#w-ex').value;
    const ex = exercises.find((e) => e.id === exId);
    const cat = (ex && ex.category) || 'その他';
    const sets = await getAll('sets');
    const workouts = await getAll('workouts');
    const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
    const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
    const today = localDateStr();
    const todayVol = categoryVolumeForDate(sets, exById, wkById, today)[cat] || 0;
    const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today)[cat] || 0;
    const pct = pastMax > 0 ? Math.min(100, (todayVol / pastMax) * 100) : (todayVol > 0 ? 100 : 0);
    const beat = todayVol > pastMax && todayVol > 0;
    box.innerHTML = `
      <div class="muted">部位「${escapeHtml(cat)}」の本日ボリューム</div>
      <div class="volbar"><div class="volbar-fill" style="width:${pct}%"></div></div>
      <div class="muted">本日 ${Math.round(todayVol)} / 過去最高 ${pastMax > 0 ? Math.round(pastMax) : '—'}${beat ? ' <span class="pr-badge">自己ベスト更新！</span>' : ''}</div>`;
  }

  el.querySelector('#w-ex').addEventListener('change', () => { refreshPR(); refreshVolumeBar(); });
  el.querySelectorAll('#w-tags .chip-tag').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (state.tags.has(t)) { state.tags.delete(t); b.classList.remove('sel'); }
      else { state.tags.add(t); b.classList.add('sel'); }
    }));
  el.querySelector('#w-note').addEventListener('input', (e) => (state.note = e.target.value));

  // 場所
  el.querySelector('#w-place').addEventListener('change', async (e) => {
    await patchTodayWorkout({ placeId: e.target.value || null });
  });

  // トレーニング時間（開始〜終了の手入力）
  async function saveTimeRange() {
    const start = el.querySelector('#w-start').value;
    const end = el.querySelector('#w-end').value;
    const mins = durationMinutes(start, end);
    await patchTodayWorkout({ startTime: start, endTime: end, durationSec: mins * 60 });
    el.querySelector('#w-dur').textContent = '所要: ' + (mins > 0 ? formatMinutes(mins * 60) : '—');
  }
  el.querySelector('#w-start').addEventListener('change', saveTimeRange);
  el.querySelector('#w-end').addEventListener('change', saveTimeRange);

  // インターバル（独立）
  bindSeg(el, '#w-int-secs', (v) => (state.interval = Number(v)), defaultSec, 's');
  intervalTimer = createTimer({
    onTick: (s) => (el.querySelector('#w-timer').textContent = formatTime(s)),
    onDone: () => (el.querySelector('#w-timer').style.display = 'none'),
  });
  el.querySelector('#w-int-start').addEventListener('click', () => {
    el.querySelector('#w-timer').style.display = 'block';
    intervalTimer.start(state.interval);
  });
  el.querySelector('#w-int-stop').addEventListener('click', () => {
    intervalTimer.stop();
    el.querySelector('#w-timer').style.display = 'none';
  });

  // 感想
  el.querySelector('#w-impression-save').addEventListener('click', async () => {
    await patchTodayWorkout({ note: el.querySelector('#w-impression').value });
    el.querySelector('#w-impression-save').textContent = '保存しました';
    setTimeout(() => { el.querySelector('#w-impression-save').textContent = '感想を保存'; }, 1500);
  });

  // セット記録（保存のみ）
  el.querySelector('#w-save').addEventListener('click', async () => {
    const err = el.querySelector('#w-error');
    const weight = weightStepper.get();
    const reps = repsStepper.get();
    const assistedReps = assistOn ? assistStepper.get() : 0;
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    if (assistedReps > reps) { err.textContent = '補助回数は回数以下にしてください'; return; }
    err.textContent = '';
    const exerciseId = el.querySelector('#w-ex').value;
    const workout = await patchTodayWorkout();
    const est = estimate1RM(weight, reps - assistedReps);
    const setId = uid();
    await put('sets', { id: setId, workoutId: workout.id, exerciseId, weight, reps, assistedReps,
      estimated1RM: est, targetWeight: prs[exerciseId] || null, createdAt: Date.now() });
    await put('sensoryLogs', { id: uid(), setId, note: state.note, tags: [...state.tags] });
    state.tags.clear();
    state.note = '';
    el.querySelectorAll('#w-tags .chip-tag').forEach((b) => b.classList.remove('sel'));
    el.querySelector('#w-note').value = '';
    assistOn = false;
    assistStepper.set(0);
    el.querySelector('#w-assist-toggle').textContent = '補助あり：OFF';
    el.querySelector('#w-assist-wrap').style.display = 'none';
    const saveBtn = el.querySelector('#w-save');
    saveBtn.textContent = '保存しました';
    setTimeout(() => { saveBtn.textContent = 'セット記録'; }, 1500);
    await renderToday(el, exercises);
    await refreshVolumeBar();
  });

  refreshPR();
  await refreshVolumeBar();
  await renderToday(el, exercises);
}

function bindSeg(el, sel, cb, initial, attr = 'v') {
  const wrap = el.querySelector(sel);
  if (initial !== undefined) cb(initial);
  wrap.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      const v = b.dataset[attr];
      cb(isNaN(Number(v)) ? v : Number(v));
    }));
}

async function renderToday(el, exercises) {
  const today = localDateStr();
  const workouts = await getAll('workouts');
  const workout = workouts.find((w) => w.date === today);
  const box = el.querySelector('#w-today');
  if (!workout) { box.innerHTML = '<p class="muted">まだ記録なし</p>'; return; }
  const sets = (await getAll('sets')).filter((s) => s.workoutId === workout.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
  box.innerHTML = sets.map((s) => `<div class="list-item">
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}<br>
        <span class="muted" style="font-size:12px">1RM ${s.estimated1RM.toFixed(0)}</span></span>
      <span>
        <button class="btn btn-edit" data-edit="${s.id}" style="min-height:40px;padding:0 12px">編集</button>
        <button class="btn btn-danger" data-del="${s.id}" style="min-height:40px;padding:0 12px">削除</button>
      </span>
    </div>`).join('') || '<p class="muted">まだ記録なし</p>';

  box.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openSetEditor(b.dataset.edit, () => renderToday(el, exercises))));
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const setId = b.dataset.del;
      await remove('sets', setId);
      const allLogs = await getAll('sensoryLogs');
      for (const l of allLogs.filter((l) => l.setId === setId)) await remove('sensoryLogs', l.id);
      renderToday(el, exercises);
    }));
}
