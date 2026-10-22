import { getAll, put, remove, uid } from '../db.js';
import { estimate1RM, computePRs } from '../lib/calc.js';
import { formatMinutes } from '../lib/duration.js';
import { durationMinutes } from '../lib/timerange.js';
import { localDateStr } from '../lib/localdate.js';
import { groupConsecutiveSets } from '../lib/groupSets.js';
import { escapeHtml } from '../lib/html.js';
import { openSetEditor } from './set-editor.js';
import { intervalSecsHtml, intervalBarHtml, initIntervalBar, startRest } from './workout/interval-bar.js';
import { exerciseHeaderHtml, createExercisePanel } from './workout/exercise-panel.js';
import { currentSetHtml, createCurrentSet } from './workout/current-set.js';
import { toSlots, lastSessionSlots, initialSetValues, previousForSet, lastDropChain, nextDropWeight } from '../lib/logging.js';
import { getWeightStep } from '../lib/prefs.js';
import { loadLogState, saveLogState } from '../lib/logState.js';
import { getEnv, visibleExercises, courseAvailable } from '../lib/env.js';
import { latestBodyWeight } from '../lib/bodyweight.js';
import { parseSetUtterance } from '../lib/voiceParse.js';
import { isVoiceSupported, startListening, stopVoiceInput } from '../lib/voice.js';

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

// renderWorkout 1回分のローカル変数に持つと、タブを離れたあとも認識が止まらず
// 古いコールバックが別画面のDOMを触って例外になる（interval-bar.js と同じ方式で防ぐ）
let stopVoiceListening = null;
let voiceSession = null;

export async function renderWorkout(el, navigate, opts = {}) {
  if (stopVoiceListening) { stopVoiceListening(); stopVoiceListening = null; }
  voiceSession = null;
  const allExercises = await getAll('exercises');
  const env = getEnv();
  // 選択・提案には環境で絞った種目、名前の解決（本日のセットなど）には全種目を使う
  const exercises = visibleExercises(allExercises, env);
  const allSets = await getAll('sets');
  const prs = computePRs(allSets);
  const places = await getAll('places');
  const courses = (await getAll('courses')).filter((c) => courseAvailable(c, allExercises, env));
  const bodyWeightNow = latestBodyWeight(await getAll('bodyWeights'));
  const todayWorkout = (await getAll('workouts')).find((w) => w.date === todayStr());
  const defaultSec = parseInt(localStorage.getItem('default_interval_sec') || '90', 10);
  const intervalChoices = [60, 90, 120, 180];

  if (!exercises.length) {
    // 絞り込みで0件になった（登録はある）場合と、そもそも未登録の場合で案内を分ける
    const msg = allExercises.length
      ? '自宅でできる種目がありません。ホームの「自宅向けの種目とコースをまとめて追加」を押してください。'
      : '先に「管理」タブで種目を登録してください。';
    el.innerHTML = `<h2 class="view-title">記録</h2>
      <div class="card"><p class="muted">${msg}</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="view-title">記録</h2>
    ${exerciseHeaderHtml(courses)}
    ${currentSetHtml()}

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

  // ---- 1セットずつ記録する ----
  const today = todayStr();
  let workouts = await getAll('workouts');
  let todayWorkoutId = todayWorkout ? todayWorkout.id : null;
  const logState = loadLogState(today);
  let currentExId = null;
  let busy = false;

  const exById = (id) => allExercises.find((e) => e.id === id);
  const todaySetsOf = (exId) => (todayWorkoutId
    ? allSets.filter((s) => s.workoutId === todayWorkoutId && s.exerciseId === exId) : []);
  const dropActiveFor = (exId) => Boolean(logState.drop && logState.drop.exerciseId === exId);
  const closeDrop = () => { if (logState.drop) { logState.drop = null; saveLogState(logState); } };

  // 種目が決まったら、今日の札・前回の値・初期値でカードを作り直す
  function loadCard(exId) {
    currentExId = exId;
    const ex = exById(exId);
    const isBodyweight = Boolean(ex && ex.bodyweight);
    const todaySlots = toSlots(todaySetsOf(exId));
    const lastSlots = lastSessionSlots(allSets, workouts, exId, today);
    card.setChips(todaySlots);
    card.setError('');
    if (dropActiveFor(exId) && todaySlots.length) {
      const sets = todaySetsOf(exId).sort((a, b) => a.createdAt - b.createdAt);
      const last = sets[sets.length - 1];
      card.setValues({
        weight: nextDropWeight({ currentWeight: last.weight, dropIndex: logState.drop.dropIndex,
          lastChain: lastDropChain(allSets, workouts, exId, today), step: getWeightStep() }),
        reps: last.reps,
      });
      card.setHeading(`セット${todaySlots.length}・ドロップ${logState.drop.dropIndex}`);
      card.setMode({ showDrop: true, showAssist: false });
    } else {
      if (dropActiveFor(exId)) closeDrop();
      card.setValues(initialSetValues({ todaySlots, lastSlots, bodyWeight: bodyWeightNow, isBodyweight }));
      const n = todaySlots.length + 1;
      const prev = previousForSet(lastSlots, n);
      card.setHeading(prev ? `セット${n}（前回 ${prev.weight}kg×${prev.reps}）` : `セット${n}`);
      card.setMode({ showDrop: true, showAssist: true });
    }
    card.setHint(isBodyweight && !bodyWeightNow ? '体重が未登録です。重量欄に体重を入力してください' : '');
  }

  async function record(isDrop) {
    if (busy || !currentExId) return;
    const v = card.values();
    if (!(v.weight > 0) || !(v.reps > 0)) { card.setError('重量と回数を入れてください'); return; }
    const assisted = dropActiveFor(currentExId) || isDrop ? 0 : v.assistedReps;
    if (assisted > v.reps) { card.setError('補助回数は回数以下にしてください'); return; }
    busy = true;
    card.setBusy(true);
    card.setError('');
    try {
      const workout = await patchTodayWorkout();
      todayWorkoutId = workout.id;
      if (!workouts.some((w) => w.id === workout.id)) workouts = [...workouts, workout];
      const set = {
        id: uid(), workoutId: workout.id, exerciseId: currentExId, weight: v.weight, reps: v.reps,
        assistedReps: assisted, estimated1RM: estimate1RM(v.weight, v.reps - assisted),
        targetWeight: prs[currentExId] || null, createdAt: Date.now(),
      };
      if (dropActiveFor(currentExId)) {
        set.groupId = logState.drop.groupId; set.groupType = 'dropset';
      } else if (isDrop) {
        logState.drop = { exerciseId: currentExId, groupId: uid(), dropIndex: 0 };
        set.groupId = logState.drop.groupId; set.groupType = 'dropset';
      }
      await put('sets', set);
      await put('sensoryLogs', { id: uid(), setId: set.id, note: v.note });
      allSets.push(set);
      const est = set.estimated1RM;
      if (!(prs[currentExId] >= est)) prs[currentExId] = est;
      if (isDrop) {
        logState.drop.dropIndex += 1;
        saveLogState(logState);
      } else {
        closeDrop();
        startRest();
      }
      card.clearDetails();
      loadCard(currentExId);
      await renderToday(el, allExercises, reloadAfterEdit);
      await exPanel.refresh();
    } catch (e) {
      // 札は増やさない。保存できたかどうかは「本日のセット」で確かめられる
      if (isDrop && logState.drop && logState.drop.dropIndex === 0) closeDrop();
      card.setError('保存できませんでした: ' + e.message);
    } finally {
      busy = false;
      card.setBusy(false);
    }
  }

  // 札や「本日のセット」で編集・削除したら、DBから読み直して描き直す
  async function reloadAfterEdit() {
    allSets.splice(0, allSets.length, ...(await getAll('sets')));
    Object.assign(prs, computePRs(allSets));
    loadCard(currentExId);
    await renderToday(el, allExercises, reloadAfterEdit);
    await exPanel.refresh();
  }

  const card = createCurrentSet(el, {
    getStep: getWeightStep,
    onRecord: () => record(false),
    onDrop: () => record(true),
    onChipTap: (setId) => openSetEditor(setId, reloadAfterEdit),
  });

  const exPanel = createExercisePanel(el, {
    exercises, allExercises, courses, prs,
    // 種目が変わったときだけカードを作り直す（記録後の再描画では作り直さない）
    onExerciseChange: (exId) => {
      if (exId === currentExId) return;
      if (logState.drop && logState.drop.exerciseId !== exId) closeDrop();
      loadCard(exId);
    },
  });

  // 音声・コースのボタンなどから種目を切り替える
  function switchExercise(exId) {
    if (exId === currentExId) return;
    if (logState.drop && logState.drop.exerciseId !== exId) closeDrop();
    loadCard(exId);
    exPanel.selectExercise(exId);
  }

  initIntervalBar(el, defaultSec);
  // 開いたときの種目: 続いているドロップの種目 → 今日最後に記録した種目 → 一覧の先頭。
  // 先頭の種目で開くと、続いていたドロップの連なりが途切れてしまう
  const lastToday = todayWorkoutId
    ? allSets.filter((s) => s.workoutId === todayWorkoutId && exercises.some((e) => e.id === s.exerciseId))
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    : null;
  const resumeExId = (logState.drop && exercises.some((e) => e.id === logState.drop.exerciseId))
    ? logState.drop.exerciseId : (lastToday ? lastToday.exerciseId : null);
  if (resumeExId) {
    loadCard(resumeExId);
    exPanel.selectExercise(resumeExId);
  }
  await exPanel.refresh();

  // 音声入力(未対応環境ではボタンごと出さない)。今のセットを埋めるだけで保存はしない
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
        if (ex) switchExercise(ex.id);
      }
      if (parsed.weight === null && parsed.reps === null) {
        voiceStatus.textContent = `${parsed.exerciseName} に切り替えました`;
        return;
      }
      const cur = exById(currentExId);
      // 自重種目の「プラス◯キロ」は体重への上乗せ。体重が取れないときは数値をそのまま重量にする
      let weight = parsed.weight;
      let weightLabel = parsed.weight !== null ? `${parsed.weight}kg` : null;
      let tail = '';
      if (parsed.added && parsed.weight !== null && cur && cur.bodyweight) {
        if (bodyWeightNow) {
          weight = Math.round((bodyWeightNow + parsed.weight) * 100) / 100;
          weightLabel = `体重＋${parsed.weight}kg`;
        } else {
          tail = `（体重が未登録のため、${parsed.weight}kgをそのまま入力しました）`;
        }
      }
      card.setValues({ weight, reps: parsed.reps });
      const parts = [cur ? cur.name : null, weightLabel, parsed.reps !== null ? `${parsed.reps}回` : null].filter(Boolean);
      voiceStatus.textContent = `${parts.join(' / ')} を入力しました。「記録する」で保存します${tail}`;
    };

    const ERROR_TEXT = {
      'not-allowed': 'マイクの使用を許可してください',
      'service-not-allowed': 'マイクの使用を許可してください',
      'audio-capture': 'マイクを利用できません',
      'no-speech': '聞き取れませんでした',
      network: '通信できませんでした。手入力で記録できます',
    };

    voiceBtn.addEventListener('click', () => {
      if (stopVoiceListening) { stopVoiceListening(); idle(); return; }
      voiceStatus.textContent = '';
      voiceBtn.textContent = '聞いています…';
      const session = {};
      voiceSession = session;
      stopVoiceListening = startListening({
        onInterim: (t) => { if (voiceSession !== session) return; voiceStatus.textContent = t; },
        onResult: (t) => { if (voiceSession !== session) return; idle(); applyUtterance(t); },
        onError: (code) => {
          if (voiceSession !== session) return;
          idle();
          voiceStatus.textContent = ERROR_TEXT[code] || '認識できませんでした';
        },
      });
    });
  }

  await renderToday(el, allExercises, reloadAfterEdit);

  if (opts.initialCourseId && courses.some((c) => c.id === opts.initialCourseId)) {
    exPanel.setCourse(opts.initialCourseId);
    exPanel.openPicker();
  } else if (Array.isArray(opts.initialExerciseIds) && opts.initialExerciseIds.length) {
    const validIds = opts.initialExerciseIds.filter((id) => exercises.some((e) => e.id === id));
    if (validIds.length) { exPanel.showExerciseButtons(validIds); exPanel.openPicker(); }
  }
}

async function renderToday(el, exercises, onChanged) {
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
    b.addEventListener('click', () => openSetEditor(b.dataset.edit, () => (onChanged ? onChanged() : renderToday(el, exercises)))));
  box.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const setId = b.dataset.del;
      await remove('sets', setId);
      const allLogs = await getAll('sensoryLogs');
      for (const l of allLogs.filter((l) => l.setId === setId)) await remove('sensoryLogs', l.id);
      if (onChanged) onChanged(); else renderToday(el, exercises);
    }));
}
