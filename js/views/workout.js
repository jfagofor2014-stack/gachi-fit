import { getAll, get, put, remove, uid } from '../db.js';
import { estimate1RM, computePRs } from '../lib/calc.js';
import { formatMinutes } from '../lib/duration.js';
import { durationMinutes } from '../lib/timerange.js';
import { localDateStr } from '../lib/localdate.js';
import { groupConsecutiveSets, flattenRounds } from '../lib/groupSets.js';
import { escapeHtml } from '../lib/html.js';
import { createStepper } from './components.js';
import { openSetEditor } from './set-editor.js';
import { intervalSecsHtml, intervalBarHtml, initIntervalBar } from './workout/interval-bar.js';
import { exerciseHeaderHtml, createExercisePanel } from './workout/exercise-panel.js';

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const DEFAULT_ROWS = 3;

const SS_MIN_EX = 2;
const SS_MAX_EX = 4;
const SS_DEFAULT_EX = 2;
const SS_MIN_ROUNDS = 1;
const SS_MAX_ROUNDS = 6;
const SS_DEFAULT_ROUNDS = 3;

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

function defaultRowValues(n) {
  return Array.from({ length: n }, () => ({ weight: 0, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }));
}

export async function renderWorkout(el, navigate, opts = {}) {
  const exercises = await getAll('exercises');
  const allSets = await getAll('sets');
  const prs = computePRs(allSets);
  const places = await getAll('places');
  const courses = await getAll('courses');
  const todayWorkout = (await getAll('workouts')).find((w) => w.date === todayStr());
  const defaultSec = parseInt(localStorage.getItem('default_interval_sec') || '90', 10);
  const intervalChoices = [60, 90, 120, 180];

  if (!exercises.length) {
    el.innerHTML = `<h2 class="view-title">記録</h2>
      <div class="card"><p class="muted">先に「管理」タブで種目を登録してください。</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="view-title">記録</h2>
    ${exerciseHeaderHtml(courses)}
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
      <div class="field mt-2"><label>インターバル秒数</label>
        ${intervalSecsHtml(intervalChoices, defaultSec)}</div>
    </div>

    <div class="card">
      <strong>セット入力</strong>
      <div class="seg" id="w-mode-seg" style="margin-top:8px">
        <button data-m="normal" class="sel">通常</button>
        <button data-m="superset">スーパーセット</button>
        <button data-m="dropset">ドロップセット</button>
      </div>

      <div id="w-normal-block">
        <div id="w-rows" style="margin-top:10px"></div>
        <div class="row" style="margin-top:8px">
          <button type="button" id="w-row-add" class="btn">＋ 行を追加</button>
          <button type="button" id="w-row-remove" class="btn">− 行を削除</button>
        </div>
      </div>

      <div id="w-ss-block" style="display:none">
        <div id="w-ss-exercises" style="margin-top:10px"></div>
        <div class="row" style="margin-top:8px">
          <button type="button" id="w-ss-ex-add" class="btn">＋ 種目を追加</button>
          <button type="button" id="w-ss-ex-remove" class="btn">− 種目を削除</button>
        </div>
        <div id="w-ss-rounds" style="margin-top:10px"></div>
        <div class="row" style="margin-top:8px">
          <button type="button" id="w-ss-round-add" class="btn">＋ ラウンドを追加</button>
          <button type="button" id="w-ss-round-remove" class="btn">− ラウンドを削除</button>
        </div>
      </div>

      <div class="field" style="margin-top:12px"><label>メモ（任意・全セット共通）</label>
        <input id="w-note" class="input" placeholder="例: 3セット目から効きが浅い" /></div>
      <div id="w-error" class="error"></div>
      <button id="w-save" class="btn btn-primary btn-block" style="margin-top:8px">まとめて記録</button>
    </div>

    <div class="card">
      <strong>本日の感想</strong>
      <p class="muted">AI分析の対象になります。</p>
      <textarea id="w-impression" class="input" rows="3" style="resize:vertical">${todayWorkout ? escapeHtml(todayWorkout.note || '') : ''}</textarea>
      <button id="w-impression-save" class="btn btn-block" style="margin-top:8px">感想を保存</button>
    </div>

    <div class="card"><strong>本日のセット</strong><div id="w-today"></div></div>
    ${intervalBarHtml(defaultSec)}`;

  let mode = 'normal';
  let rowValues = defaultRowValues(DEFAULT_ROWS);
  let rowSteppers = [];

  const exerciseName = (id) => exercises.find((e) => e.id === id)?.name || '?';

  function defaultSSExerciseIds() {
    const ids = exercises.slice(0, SS_DEFAULT_EX).map((e) => e.id);
    while (ids.length < SS_DEFAULT_EX) ids.push(exercises[0].id);
    return ids;
  }
  function defaultSSRounds(exIds) {
    return Array.from({ length: SS_DEFAULT_ROUNDS }, () => exIds.map(() => ({ weight: 0, reps: 0 })));
  }
  let ssExerciseIds = defaultSSExerciseIds();
  let ssRounds = defaultSSRounds(ssExerciseIds);
  let ssSteppers = [];

  function refreshRow1RM(i) {
    const rs = rowSteppers[i];
    const w = rs.weight.get();
    const r = rs.reps.get();
    const a = rs.assist && rs.assistOn ? rs.assist.get() : 0;
    const selfReps = r - a;
    el.querySelector(`#w-row-1rm-${i}`).textContent =
      '推定1RM: ' + (w > 0 && selfReps > 0 ? estimate1RM(w, selfReps).toFixed(1) + 'kg' : '-');
  }

  function syncRowValuesFromSteppers() {
    rowSteppers.forEach((rs, i) => {
      rowValues[i] = {
        weight: rs.weight.get(), reps: rs.reps.get(),
        assistedReps: rs.assist && rs.assistOn ? rs.assist.get() : 0,
        assistOn: rs.assist ? rs.assistOn : false,
        weightTouched: rowValues[i] ? rowValues[i].weightTouched : false,
      };
    });
  }

  function renderRows() {
    const wrap = el.querySelector('#w-rows');
    const showAssist = mode !== 'dropset';
    wrap.innerHTML = rowValues.map((rv, i) => `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1f1f1f">
        <div class="muted" style="margin-bottom:6px">セット ${i + 1}</div>
        <div class="field"><label>重量(kg)</label><div id="w-row-weight-${i}"></div></div>
        <div class="field"><label>回数</label><div id="w-row-reps-${i}"></div></div>
        ${showAssist ? `
        <button type="button" id="w-row-assist-toggle-${i}" class="btn btn-block">補助あり：${rv.assistOn ? 'ON' : 'OFF'}</button>
        <div id="w-row-assist-wrap-${i}" style="display:${rv.assistOn ? 'block' : 'none'};margin-top:8px">
          <label>補助回数</label><div id="w-row-assist-${i}"></div>
        </div>` : ''}
        <div class="muted" id="w-row-1rm-${i}" style="margin-top:6px">推定1RM: -</div>
      </div>`).join('');

    rowSteppers = rowValues.map((rv, i) => {
      const weight = createStepper(el.querySelector(`#w-row-weight-${i}`), {
        value: rv.weight, step: 0.5, min: 0,
        onChange: (v) => {
          refreshRow1RM(i);
          if (mode !== 'normal') return;
          if (i === 0) {
            rowSteppers.forEach((otherRs, j) => {
              if (j > 0 && !rowValues[j].weightTouched) {
                otherRs.weight.set(v);
                rowValues[j].weight = v;
                refreshRow1RM(j);
              }
            });
          } else {
            rowValues[i].weightTouched = true;
          }
        },
      });
      const reps = createStepper(el.querySelector(`#w-row-reps-${i}`), { value: rv.reps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      if (!showAssist) return { weight, reps, assist: null, assistOn: false };
      const assist = createStepper(el.querySelector(`#w-row-assist-${i}`), { value: rv.assistedReps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      const rs = { weight, reps, assist, assistOn: rv.assistOn };
      el.querySelector(`#w-row-assist-toggle-${i}`).addEventListener('click', () => {
        rs.assistOn = !rs.assistOn;
        el.querySelector(`#w-row-assist-toggle-${i}`).textContent = '補助あり：' + (rs.assistOn ? 'ON' : 'OFF');
        el.querySelector(`#w-row-assist-wrap-${i}`).style.display = rs.assistOn ? 'block' : 'none';
        if (!rs.assistOn) assist.set(0);
        refreshRow1RM(i);
      });
      return rs;
    });
    rowValues.forEach((_, i) => refreshRow1RM(i));
    el.querySelector('#w-row-add').disabled = rowValues.length >= MAX_ROWS;
    el.querySelector('#w-row-remove').disabled = rowValues.length <= MIN_ROWS;
  }

  el.querySelector('#w-row-add').addEventListener('click', () => {
    syncRowValuesFromSteppers();
    if (rowValues.length < MAX_ROWS) {
      const initialWeight = mode === 'normal' ? rowValues[0].weight : 0;
      rowValues.push({ weight: initialWeight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false });
    }
    renderRows();
  });
  el.querySelector('#w-row-remove').addEventListener('click', () => {
    syncRowValuesFromSteppers();
    if (rowValues.length > MIN_ROWS) rowValues.pop();
    renderRows();
  });

  function syncSSValuesFromSteppers() {
    ssSteppers.forEach((round, r) => {
      round.forEach((cell, e) => {
        ssRounds[r][e] = { weight: cell.weight.get(), reps: cell.reps.get() };
      });
    });
  }

  function renderSSExercises() {
    const wrap = el.querySelector('#w-ss-exercises');
    wrap.innerHTML = ssExerciseIds.map((exId, i) => `
      <div class="field"><label>種目 ${i + 1}</label>
        <select id="w-ss-ex-${i}" class="input">
          ${exercises.map((e) => `<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>`).join('');
    ssExerciseIds.forEach((_, i) => {
      el.querySelector(`#w-ss-ex-${i}`).addEventListener('change', (e) => {
        ssExerciseIds[i] = e.target.value;
      });
    });
    el.querySelector('#w-ss-ex-add').disabled = ssExerciseIds.length >= SS_MAX_EX;
    el.querySelector('#w-ss-ex-remove').disabled = ssExerciseIds.length <= SS_MIN_EX;
  }

  function renderSSRounds() {
    const wrap = el.querySelector('#w-ss-rounds');
    wrap.innerHTML = ssRounds.map((round, r) => `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1f1f1f">
        <div class="muted" style="margin-bottom:6px">ラウンド ${r + 1}</div>
        ${ssExerciseIds.map((exId, e) => `
          <div style="margin-bottom:10px">
            <div class="muted" style="margin-bottom:4px">${escapeHtml(exerciseName(exId))}</div>
            <div class="field"><label>重量(kg)</label><div id="w-ss-weight-${r}-${e}"></div></div>
            <div class="field"><label>回数</label><div id="w-ss-reps-${r}-${e}"></div></div>
          </div>`).join('')}
      </div>`).join('');

    ssSteppers = ssRounds.map((round, r) =>
      ssExerciseIds.map((exId, e) => ({
        weight: createStepper(el.querySelector(`#w-ss-weight-${r}-${e}`), { value: round[e].weight, step: 0.5, min: 0 }),
        reps: createStepper(el.querySelector(`#w-ss-reps-${r}-${e}`), { value: round[e].reps, step: 1, min: 0 }),
      })));
    el.querySelector('#w-ss-round-add').disabled = ssRounds.length >= SS_MAX_ROUNDS;
    el.querySelector('#w-ss-round-remove').disabled = ssRounds.length <= SS_MIN_ROUNDS;
  }

  el.querySelector('#w-ss-ex-add').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssExerciseIds.length < SS_MAX_EX) {
      const nextId = exercises.find((e) => !ssExerciseIds.includes(e.id))?.id || exercises[0].id;
      ssExerciseIds.push(nextId);
      ssRounds.forEach((round) => round.push({ weight: 0, reps: 0 }));
    }
    renderSSExercises();
    renderSSRounds();
  });
  el.querySelector('#w-ss-ex-remove').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssExerciseIds.length > SS_MIN_EX) {
      ssExerciseIds.pop();
      ssRounds.forEach((round) => round.pop());
    }
    renderSSExercises();
    renderSSRounds();
  });
  el.querySelector('#w-ss-round-add').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssRounds.length < SS_MAX_ROUNDS) ssRounds.push(ssExerciseIds.map(() => ({ weight: 0, reps: 0 })));
    renderSSRounds();
  });
  el.querySelector('#w-ss-round-remove').addEventListener('click', () => {
    syncSSValuesFromSteppers();
    if (ssRounds.length > SS_MIN_ROUNDS) ssRounds.pop();
    renderSSRounds();
  });

  async function applyMode(newMode) {
    syncRowValuesFromSteppers();
    if (mode === 'superset') syncSSValuesFromSteppers();
    mode = newMode;
    el.querySelector('#w-ex-header').style.display = mode === 'superset' ? 'none' : 'block';
    el.querySelector('#w-normal-block').style.display = mode === 'superset' ? 'none' : 'block';
    el.querySelector('#w-ss-block').style.display = mode === 'superset' ? 'block' : 'none';
    el.querySelector('#w-error').textContent = '';
    renderRows();
    if (mode === 'superset') {
      renderSSExercises();
      renderSSRounds();
    } else {
      await exPanel.refresh();
    }
  }
  el.querySelector('#w-mode-seg').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelector('#w-mode-seg').querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      applyMode(b.dataset.m);
    }));

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

  initIntervalBar(el, defaultSec);

  // 感想
  el.querySelector('#w-impression-save').addEventListener('click', async () => {
    await patchTodayWorkout({ note: el.querySelector('#w-impression').value });
    el.querySelector('#w-impression-save').textContent = '保存しました';
    setTimeout(() => { el.querySelector('#w-impression-save').textContent = '感想を保存'; }, 1500);
  });

  // まとめて記録
  el.querySelector('#w-save').addEventListener('click', async () => {
    const err = el.querySelector('#w-error');
    err.textContent = '';

    if (mode === 'superset') {
      syncSSValuesFromSteppers();
      const entries = flattenRounds(ssExerciseIds, ssRounds);
      if (!entries.length) { err.textContent = '少なくとも1セット入力してください'; return; }
      const workout = await patchTodayWorkout();
      const note = el.querySelector('#w-note').value;
      const groupId = uid();
      const base = Date.now();
      let i = 0;
      for (const en of entries) {
        const est = estimate1RM(en.weight, en.reps);
        const setId = uid();
        await put('sets', { id: setId, workoutId: workout.id, exerciseId: en.exerciseId, weight: en.weight, reps: en.reps,
          assistedReps: 0, estimated1RM: est, targetWeight: prs[en.exerciseId] || null, createdAt: base + i,
          groupId, groupType: 'superset' });
        await put('sensoryLogs', { id: uid(), setId, note });
        i++;
      }
      el.querySelector('#w-note').value = '';
      ssExerciseIds = defaultSSExerciseIds();
      ssRounds = defaultSSRounds(ssExerciseIds);
      renderSSExercises();
      renderSSRounds();
      const saveBtn = el.querySelector('#w-save');
      saveBtn.textContent = `保存しました（${entries.length}セット）`;
      setTimeout(() => { saveBtn.textContent = 'まとめて記録'; }, 1500);
      await renderToday(el, exercises);
      return;
    }

    syncRowValuesFromSteppers();
    const filled = rowValues.filter((rv) => rv.weight > 0 && rv.reps > 0);
    if (!filled.length) { err.textContent = '少なくとも1セット入力してください'; return; }
    for (const rv of rowValues) {
      if (rv.weight > 0 && rv.reps > 0 && rv.assistedReps > rv.reps) {
        err.textContent = '補助回数は回数以下にしてください'; return;
      }
    }
    const exerciseId = exPanel.currentExerciseId();
    const workout = await patchTodayWorkout();
    const note = el.querySelector('#w-note').value;
    const isDropset = mode === 'dropset';
    const groupId = isDropset ? uid() : undefined;
    const base = Date.now();
    let i = 0;
    for (const rv of filled) {
      const est = estimate1RM(rv.weight, rv.reps - rv.assistedReps);
      const setId = uid();
      const set = { id: setId, workoutId: workout.id, exerciseId, weight: rv.weight, reps: rv.reps,
        assistedReps: rv.assistedReps, estimated1RM: est, targetWeight: prs[exerciseId] || null, createdAt: base + i };
      if (isDropset) { set.groupId = groupId; set.groupType = 'dropset'; }
      await put('sets', set);
      await put('sensoryLogs', { id: uid(), setId, note });
      i++;
    }
    el.querySelector('#w-note').value = '';
    rowValues = isDropset
      ? rowValues.map((rv) => ({ weight: rv.weight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }))
      : defaultRowValues(DEFAULT_ROWS);
    renderRows();
    const saveBtn = el.querySelector('#w-save');
    saveBtn.textContent = `保存しました（${filled.length}セット）`;
    setTimeout(() => { saveBtn.textContent = 'まとめて記録'; }, 1500);
    await renderToday(el, exercises);
    await exPanel.refresh();
  });

  const exPanel = createExercisePanel(el, { exercises, courses, prs });
  await applyMode('normal');
  await exPanel.refresh();
  await renderToday(el, exercises);

  if (opts.initialCourseId && courses.some((c) => c.id === opts.initialCourseId)) {
    exPanel.setCourse(opts.initialCourseId);
    exPanel.openPicker();
  } else if (Array.isArray(opts.initialExerciseIds) && opts.initialExerciseIds.length) {
    const validIds = opts.initialExerciseIds.filter((id) => exercises.some((e) => e.id === id));
    if (validIds.length) { exPanel.showExerciseButtons(validIds); exPanel.openPicker(); }
  }
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
  const setRow = (s) => `<div class="list-item">
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}<br>
        <span class="muted" style="font-size:12px">1RM ${s.estimated1RM.toFixed(0)}</span></span>
      <span>
        <button class="btn btn-edit" data-edit="${s.id}" style="min-height:40px;padding:0 12px">編集</button>
        <button class="btn btn-danger" data-del="${s.id}" style="min-height:40px;padding:0 12px">削除</button>
      </span>
    </div>`;
  const groupLabel = { superset: '🔗 スーパーセット', dropset: '🔻 ドロップセット' };
  const groups = groupConsecutiveSets(sets);
  box.innerHTML = groups.map((g) => g.groupType
    ? `<div style="border:1px solid #333;border-radius:8px;padding:8px;margin-bottom:8px">
         <div class="muted" style="margin-bottom:4px">${groupLabel[g.groupType]}</div>
         ${g.sets.map(setRow).join('')}
       </div>`
    : setRow(g.sets[0])
  ).join('') || '<p class="muted">まだ記録なし</p>';

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
