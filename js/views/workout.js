import { getAll, put, remove, uid } from '../db.js';
import { estimate1RM, computePRs } from '../lib/calc.js';
import { formatMinutes } from '../lib/duration.js';
import { durationMinutes } from '../lib/timerange.js';
import { localDateStr } from '../lib/localdate.js';
import { groupConsecutiveSets, flattenRounds } from '../lib/groupSets.js';
import { escapeHtml } from '../lib/html.js';
import { openSetEditor } from './set-editor.js';
import { intervalSecsHtml, intervalBarHtml, initIntervalBar } from './workout/interval-bar.js';
import { exerciseHeaderHtml, createExercisePanel } from './workout/exercise-panel.js';
import { setEntryHtml, createSetEntry } from './workout/set-entry.js';
import { parseSetUtterance } from '../lib/voiceParse.js';
import { isVoiceSupported, startListening } from '../lib/voice.js';

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

// renderWorkout 1回分のローカルに持つと、タブを離れたあとも認識が止まらず
// 古いコールバックが別画面のDOMを触って例外になる（interval-bar.js と同じ方式で防ぐ）
let stopVoiceListening = null;

export async function renderWorkout(el, navigate, opts = {}) {
  if (stopVoiceListening) { stopVoiceListening(); stopVoiceListening = null; }
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
    ${setEntryHtml()}

    <details class="card fold">
      <summary><strong>本日のセット</strong></summary>
      <div id="w-today" class="mt-2"></div>
    </details>

    <details class="card fold">
      <summary><strong>本日の感想</strong></summary>
      <p class="muted mt-2">AI分析の対象になります。</p>
      <textarea id="w-impression" class="input mt-2" rows="3" style="resize:vertical">${todayWorkout ? escapeHtml(todayWorkout.note || '') : ''}</textarea>
      <button id="w-impression-save" class="btn btn-block mt-2">感想を保存</button>
    </details>

    <details class="card fold">
      <summary><strong>場所・時間</strong></summary>
      <div class="field mt-2"><label>場所</label>
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
    </details>

    ${intervalBarHtml(defaultSec)}`;

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

  // 感想
  el.querySelector('#w-impression-save').addEventListener('click', async () => {
    await patchTodayWorkout({ note: el.querySelector('#w-impression').value });
    el.querySelector('#w-impression-save').textContent = '保存しました';
    setTimeout(() => { el.querySelector('#w-impression-save').textContent = '感想を保存'; }, 1500);
  });

  const exPanel = createExercisePanel(el, { exercises, courses, prs });
  const setEntry = createSetEntry(el, {
    exercises,
    onModeChange: (m) => {
      el.querySelector('#w-ex-header').style.display = m === 'superset' ? 'none' : 'block';
      if (m !== 'superset') exPanel.refresh();
    },
  });
  initIntervalBar(el, defaultSec);
  await exPanel.refresh();
  setEntry.applyMode('normal');

  // 音声入力(未対応環境ではボタンごと出さない)
  if (isVoiceSupported()) {
    const voiceBox = el.querySelector('#w-voice');
    const voiceBtn = el.querySelector('#w-voice-btn');
    const voiceStatus = el.querySelector('#w-voice-status');
    voiceBox.style.display = 'block';

    const idle = () => {
      voiceBtn.textContent = '🎤 音声で入力';
      stopVoiceListening = null;
    };

    const applyUtterance = (text) => {
      const parsed = parseSetUtterance(text, exercises.map((e) => e.name));
      if (parsed.exerciseName === null && parsed.weight === null && parsed.reps === null) {
        voiceStatus.textContent = '聞き取れませんでした';
        return;
      }
      if (parsed.exerciseName) {
        const ex = exercises.find((e) => e.name === parsed.exerciseName);
        if (ex) exPanel.selectExercise(ex.id);
      }
      if (parsed.weight === null && parsed.reps === null) {
        voiceStatus.textContent = `${parsed.exerciseName} に切り替えました`;
        return;
      }
      const row = setEntry.fillNextRow({ weight: parsed.weight, reps: parsed.reps });
      if (row === null) {
        voiceStatus.textContent = '行がいっぱいです。記録してから続けてください';
        return;
      }
      const parts = [
        parsed.exerciseName,
        parsed.weight !== null ? `${parsed.weight}kg` : null,
        parsed.reps !== null ? `${parsed.reps}回` : null,
      ].filter(Boolean);
      voiceStatus.textContent = `${parts.join(' / ')} を入力しました`;
    };

    const ERROR_TEXT = {
      'not-allowed': 'マイクの使用を許可してください',
      'no-speech': '聞き取れませんでした',
      network: '通信できませんでした。手入力で記録できます',
    };

    voiceBtn.addEventListener('click', () => {
      if (stopVoiceListening) { stopVoiceListening(); idle(); return; }
      voiceStatus.textContent = '';
      voiceBtn.textContent = '聞いています…';
      stopVoiceListening = startListening({
        onInterim: (t) => { voiceStatus.textContent = t; },
        onResult: (t) => { idle(); applyUtterance(t); },
        onError: (code) => { idle(); voiceStatus.textContent = ERROR_TEXT[code] || '認識できませんでした'; },
      });
    });
  }

  // まとめて記録
  el.querySelector('#w-save').addEventListener('click', async () => {
    const err = el.querySelector('#w-error');
    err.textContent = '';

    if (setEntry.mode() === 'superset') {
      setEntry.syncFromSteppers();
      const entries = flattenRounds(setEntry.ssExerciseIds(), setEntry.ssRounds());
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
      setEntry.resetSuperset();
      const saveBtn = el.querySelector('#w-save');
      saveBtn.textContent = `保存しました（${entries.length}セット）`;
      setTimeout(() => { saveBtn.textContent = 'まとめて記録'; }, 1500);
      await renderToday(el, exercises);
      return;
    }

    setEntry.syncFromSteppers();
    const rowValues = setEntry.rows();
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
    const isDropset = setEntry.mode() === 'dropset';
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
    setEntry.resetRows(isDropset);
    const saveBtn = el.querySelector('#w-save');
    saveBtn.textContent = `保存しました（${filled.length}セット）`;
    setTimeout(() => { saveBtn.textContent = 'まとめて記録'; }, 1500);
    await renderToday(el, exercises);
    await exPanel.refresh();
  });

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
