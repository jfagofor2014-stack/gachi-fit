# スーパーセット/ドロップセット記録（サイクルB） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録タブに「通常／スーパーセット／ドロップセット」の3モードを追加し、複数種目を連続実施するスーパーセットと、同種目の重量を連続で下げるドロップセットを記録できるようにする。

**Architecture:** グルーピング・保存対象抽出の純粋ロジックを新規 `js/lib/groupSets.js` に切り出しテストする。`js/views/workout.js` にモード切替セグメントを追加し、通常/ドロップセットは既存の行UIを流用（ドロップセットは補助UIのみ非表示）、スーパーセットは種目2〜4×ラウンドの表UIを新設。保存時に `sets` へ `groupId`/`groupType` を付与し、「本日のセット」表示でグルーピングする。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 加算的スキーマ変更（DBバージョン変更なし）。`sets` に任意フィールド `groupId`（uid）・`groupType`（`'superset' | 'dropset'`）を追加。通常セットは両方 `undefined` のまま
- スーパーセット：種目2〜4（初期2）、ラウンド初期3・最小1・最大6、補助レップ入力なし、PR表示・部位別ボリュームバーは非表示
- ドロップセット：既存の行UI（初期3行・最小1行・最大6行）をそのまま流用、補助レップUIのみ非表示、重量減少のバリデーションなし
- 「本日のセット」表示で同一 `groupId` の連続するセットを1つの枠にまとめ、`groupType` に応じたラベルを表示
- 履歴/振り返り/Obsidian/AIインサイトのグループ表示は対象外（次サイクル）
- 既存 `getAll`/`put`/`remove`/`uid`、`createStepper`、`estimate1RM`、`computePRs`、`categoryKey`、`categoryVolumeForDate`、`maxCategoryVolumeExcludingDate`、`VOLUME_START_DATE`、`shouldBeep`/`playBeep`、`openSetEditor` に準拠

---

## Task 1: グルーピング・保存抽出の純粋ロジック（groupSets.js）

**Files:**
- Create: `js/lib/groupSets.js`
- Test: `test/groupSets.test.js`

**Interfaces:**
- Produces: `groupConsecutiveSets(sets)` → `Array<{groupId: string|null, groupType: string|null, sets: object[]}>`、`flattenRounds(exerciseIds, rounds)` → `Array<{exerciseId, weight, reps}>`

- [ ] **Step 1: 失敗するテストを書く**

`test/groupSets.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupConsecutiveSets, flattenRounds } from '../js/lib/groupSets.js';

test('groupConsecutiveSets returns one entry per set when ungrouped', () => {
  const sets = [{ id: 'a' }, { id: 'b' }];
  const groups = groupConsecutiveSets(sets);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { groupId: null, groupType: null, sets: [sets[0]] });
  assert.deepEqual(groups[1], { groupId: null, groupType: null, sets: [sets[1]] });
});

test('groupConsecutiveSets merges consecutive sets sharing groupId', () => {
  const sets = [
    { id: 'a', groupId: 'g1', groupType: 'superset' },
    { id: 'b', groupId: 'g1', groupType: 'superset' },
    { id: 'c' },
  ];
  const groups = groupConsecutiveSets(sets);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].groupType, 'superset');
  assert.equal(groups[0].sets.length, 2);
  assert.equal(groups[1].groupId, null);
});

test('groupConsecutiveSets does not merge same groupId across a gap', () => {
  const sets = [
    { id: 'a', groupId: 'g1', groupType: 'dropset' },
    { id: 'b' },
    { id: 'c', groupId: 'g1', groupType: 'dropset' },
  ];
  const groups = groupConsecutiveSets(sets);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].sets.length, 1);
  assert.equal(groups[2].sets.length, 1);
});

test('groupConsecutiveSets returns empty array for empty input', () => {
  assert.deepEqual(groupConsecutiveSets([]), []);
});

test('flattenRounds returns filled cells in round-major, exercise order', () => {
  const entries = flattenRounds(['ex1', 'ex2'], [
    [{ weight: 100, reps: 5 }, { weight: 50, reps: 8 }],
    [{ weight: 90, reps: 6 }, { weight: 40, reps: 10 }],
  ]);
  assert.deepEqual(entries, [
    { exerciseId: 'ex1', weight: 100, reps: 5 },
    { exerciseId: 'ex2', weight: 50, reps: 8 },
    { exerciseId: 'ex1', weight: 90, reps: 6 },
    { exerciseId: 'ex2', weight: 40, reps: 10 },
  ]);
});

test('flattenRounds skips cells with zero weight or reps', () => {
  const entries = flattenRounds(['ex1', 'ex2'], [
    [{ weight: 0, reps: 5 }, { weight: 50, reps: 0 }],
    [{ weight: 90, reps: 6 }, { weight: 40, reps: 10 }],
  ]);
  assert.deepEqual(entries, [
    { exerciseId: 'ex1', weight: 90, reps: 6 },
    { exerciseId: 'ex2', weight: 40, reps: 10 },
  ]);
});

test('flattenRounds returns empty array for empty rounds', () => {
  assert.deepEqual(flattenRounds(['ex1'], []), []);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`js/lib/groupSets.js` が存在しない）

- [ ] **Step 3: groupSets.js を実装**

`js/lib/groupSets.js`:
```js
// 連続する同一groupIdのセットを1つのグループにまとめる（純粋関数）
// sets は既にソート済みの配列を想定し、順序は保持する
export function groupConsecutiveSets(sets) {
  const result = [];
  for (const s of sets) {
    const last = result[result.length - 1];
    if (s.groupId && last && last.groupId === s.groupId) {
      last.sets.push(s);
    } else {
      result.push({ groupId: s.groupId || null, groupType: s.groupType || null, sets: [s] });
    }
  }
  return result;
}

// 種目×ラウンドの入力値を、ラウンド→種目の順で埋まっているセルだけ抽出する（純粋関数）
// exerciseIds: string[] / rounds: Array<Array<{weight:number, reps:number}>>（rounds[roundIndex][exerciseIndex]）
export function flattenRounds(exerciseIds, rounds) {
  const entries = [];
  rounds.forEach((round) => {
    exerciseIds.forEach((exerciseId, exIndex) => {
      const cell = round[exIndex];
      if (cell && cell.weight > 0 && cell.reps > 0) {
        entries.push({ exerciseId, weight: cell.weight, reps: cell.reps });
      }
    });
  });
  return entries;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/groupSets.js test/groupSets.test.js
git commit -m "feat: add set-grouping and round-flattening pure logic with tests"
```

---

## Task 2: 記録タブにスーパーセット/ドロップセットモードを追加（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `groupConsecutiveSets`/`flattenRounds`（groupSets.js）、`shouldBeep`/`playBeep`（sound.js）、`createStepper`、`estimate1RM`、`computePRs`、`categoryKey`/`categoryVolumeForDate`/`maxCategoryVolumeExcludingDate`/`VOLUME_START_DATE`（volume.js）、`durationMinutes`、`localDateStr`、`openSetEditor`
- Produces: `renderWorkout(el)`。保存される `sets` は通常モードで `groupId`/`groupType` を持たず、スーパーセット/ドロップセットでは両方を持つ

- [ ] **Step 1: workout.js 全体を置き換え**

`js/views/workout.js` 全体を次に置き換え：
```js
import { getAll, get, put, remove, uid } from '../db.js';
import { estimate1RM, computePRs } from '../lib/calc.js';
import { createTimer, formatTime } from '../timer.js';
import { formatMinutes } from '../lib/duration.js';
import { durationMinutes } from '../lib/timerange.js';
import { categoryVolumeForDate, maxCategoryVolumeExcludingDate, categoryKey, VOLUME_START_DATE } from '../lib/volume.js';
import { localDateStr } from '../lib/localdate.js';
import { shouldBeep, playBeep } from '../lib/sound.js';
import { groupConsecutiveSets, flattenRounds } from '../lib/groupSets.js';
import { escapeHtml } from './exercises.js';
import { createStepper } from './components.js';
import { openSetEditor } from './set-editor.js';

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const DEFAULT_ROWS = 3;

const SS_MIN_EX = 2;
const SS_MAX_EX = 4;
const SS_DEFAULT_EX = 2;
const SS_MIN_ROUNDS = 1;
const SS_MAX_ROUNDS = 6;
const SS_DEFAULT_ROUNDS = 3;

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

function defaultRowValues(n) {
  return Array.from({ length: n }, () => ({ weight: 0, reps: 0, assistedReps: 0, assistOn: false }));
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

    <div class="card" id="w-ex-card">
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input">
          ${exercises.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>

    <div class="card" id="w-volume"></div>

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

  const state = { interval: defaultSec };
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
      };
    });
  }

  function renderRows() {
    const wrap = el.querySelector('#w-rows');
    const showAssist = mode !== 'dropset';
    wrap.innerHTML = rowValues.map((rv, i) => `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1f1f1f">
        <div class="muted" style="margin-bottom:6px">セット ${i + 1}</div>
        <div class="row">
          <div class="field"><label>重量(kg)</label><div id="w-row-weight-${i}"></div></div>
          <div class="field"><label>回数</label><div id="w-row-reps-${i}"></div></div>
        </div>
        ${showAssist ? `
        <button type="button" id="w-row-assist-toggle-${i}" class="btn btn-block">補助あり：${rv.assistOn ? 'ON' : 'OFF'}</button>
        <div id="w-row-assist-wrap-${i}" style="display:${rv.assistOn ? 'block' : 'none'};margin-top:8px">
          <label>補助回数</label><div id="w-row-assist-${i}"></div>
        </div>` : ''}
        <div class="muted" id="w-row-1rm-${i}" style="margin-top:6px">推定1RM: -</div>
      </div>`).join('');

    rowSteppers = rowValues.map((rv, i) => {
      const weight = createStepper(el.querySelector(`#w-row-weight-${i}`), { value: rv.weight, step: 0.5, min: 0, onChange: () => refreshRow1RM(i) });
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
    if (rowValues.length < MAX_ROWS) rowValues.push({ weight: 0, reps: 0, assistedReps: 0, assistOn: false });
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
          <div class="row">
            <div class="field"><label>${escapeHtml(exerciseName(exId))} 重量(kg)</label><div id="w-ss-weight-${r}-${e}"></div></div>
            <div class="field"><label>${escapeHtml(exerciseName(exId))} 回数</label><div id="w-ss-reps-${r}-${e}"></div></div>
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

  async function refreshVolumeBar() {
    const box = el.querySelector('#w-volume');
    const exId = el.querySelector('#w-ex').value;
    const ex = exercises.find((e) => e.id === exId);
    const cat = categoryKey(ex);
    const sets = await getAll('sets');
    const workouts = await getAll('workouts');
    const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
    const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
    const today = localDateStr();
    const todayVol = categoryVolumeForDate(sets, exById, wkById, today)[cat] || 0;
    const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today, VOLUME_START_DATE)[cat] || 0;
    const pct = pastMax > 0 ? Math.min(100, (todayVol / pastMax) * 100) : (todayVol > 0 ? 100 : 0);
    const beat = todayVol > pastMax && todayVol > 0;
    box.innerHTML = `
      <div class="muted">部位「${escapeHtml(cat)}」の本日ボリューム</div>
      <div class="volbar"><div class="volbar-fill" style="width:${pct}%"></div></div>
      <div class="muted">本日 ${Math.round(todayVol)} / 過去最高 ${pastMax > 0 ? Math.round(pastMax) : '—'}${beat ? ' <span class="pr-badge">自己ベスト更新！</span>' : ''}</div>`;
  }

  el.querySelector('#w-ex').addEventListener('change', () => { refreshPR(); refreshVolumeBar(); });

  function applyMode(newMode) {
    syncRowValuesFromSteppers();
    if (mode === 'superset') syncSSValuesFromSteppers();
    mode = newMode;
    el.querySelector('#w-ex-card').style.display = mode === 'superset' ? 'none' : 'block';
    el.querySelector('#w-volume').style.display = mode === 'superset' ? 'none' : 'block';
    el.querySelector('#w-normal-block').style.display = mode === 'superset' ? 'none' : 'block';
    el.querySelector('#w-ss-block').style.display = mode === 'superset' ? 'block' : 'none';
    el.querySelector('#w-error').textContent = '';
    renderRows();
    if (mode === 'superset') {
      renderSSExercises();
      renderSSRounds();
    } else {
      refreshVolumeBar();
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

  // インターバル（独立、終了10秒前にビープ）
  bindSeg(el, '#w-int-secs', (v) => (state.interval = Number(v)), defaultSec, 's');
  intervalTimer = createTimer({
    onTick: (s) => {
      el.querySelector('#w-timer').textContent = formatTime(s);
      if (shouldBeep(s)) playBeep();
    },
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
    const exerciseId = el.querySelector('#w-ex').value;
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
    rowValues = defaultRowValues(DEFAULT_ROWS);
    renderRows();
    const saveBtn = el.querySelector('#w-save');
    saveBtn.textContent = `保存しました（${filled.length}セット）`;
    setTimeout(() => { saveBtn.textContent = 'まとめて記録'; }, 1500);
    await renderToday(el, exercises);
    await refreshVolumeBar();
  });

  applyMode('normal');
  refreshPR();
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
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 3: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（既存49件＋Task1の7件）

- [ ] **Step 4: ブラウザで動作確認**

preview で記録タブを開き：
- モード切替ボタンで「通常／スーパーセット／ドロップセット」が切り替わり、表示されるUIが変わる
- 通常モード：既存どおり行UIが動作し、保存したセットに `groupId` が付かない
- スーパーセットモード：種目選択カード・ボリュームバーが非表示になる。種目±（2〜4）・ラウンド±（1〜6）が機能する。まとめて記録すると、入力済みセルのみ複数種目分のセットが保存され、行がリセットされる
- ドロップセットモード：既存の行UIが表示されるが補助トグルが出ない。まとめて記録するとセットに `groupType: 'dropset'` が付く
- 「本日のセット」で、スーパーセット/ドロップセットで保存した一連のセットが枠でまとまり、ラベル（🔗/🔻）が表示される。編集・削除は個別に機能する
- 通常モードの一覧表示に回帰がないこと

- [ ] **Step 5: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: add superset and dropset recording modes to workout tab"
```

---

## Task 3: PWA キャッシュ更新・README・全体確認

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

- [ ] **Step 1: sw.js のキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v13';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v14';
```
`sw.js` の ASSETS 配列内、`'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js',` を次に置き換え（`js/lib/groupSets.js` を追加）：
```js
  'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js', 'js/lib/groupSets.js',
```

- [ ] **Step 2: README を更新**

`README.md` の `## 機能` リストに追加（末尾）：
```markdown
- 記録タブ: スーパーセット（種目2〜4を連続実施）・ドロップセット（同種目の重量を連続実施）モード、本日のセット一覧でグループ表示
```

- [ ] **Step 3: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS

- [ ] **Step 4: 全フロー手動確認**

preview で：スーパーセットモードで2種目×2ラウンド記録→本日のセットにグループ表示→編集で1セットだけ修正→削除で1セットだけ削除しても他のセットは残ることを確認。ドロップセットモードでも同様に保存・グループ表示・個別編集削除を確認。通常モードのタグなし・0.5kg刻み・プリセット検索など既存機能に回帰がないことも確認。

- [ ] **Step 5: コミット**

```bash
git add sw.js README.md
git commit -m "chore: PWA cache v14 for superset/dropset recording"
```

---

## Self-Review チェック結果
- **スペック網羅**：モード切替(T2)/スーパーセット入力(T2)/ドロップセット入力(T2)/データモデル`groupId`/`groupType`(T2)/本日のセット表示グルーピング(T2)/PWA更新(T3) すべてタスク化。スコープ外項目（履歴/振り返り/Obsidian/AI、補助レップ、ドロップ検証）はGlobal Constraintsに明記し実装対象外であることを明示。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`groupConsecutiveSets(sets)`→`{groupId,groupType,sets}[]`、`flattenRounds(exerciseIds, rounds)`→`{exerciseId,weight,reps}[]`、`sets`レコードの`groupId`/`groupType`（`superset`|`dropset`|undefined）がTask1・Task2で一致。`SS_MIN_EX/SS_MAX_EX/SS_DEFAULT_EX/SS_MIN_ROUNDS/SS_MAX_ROUNDS/SS_DEFAULT_ROUNDS`はTask2内で定義・使用が一致。既存`MIN_ROWS/MAX_ROWS/DEFAULT_ROWS`は変更なし。
