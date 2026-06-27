# 記録タブ刷新＋部位別ボリューム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録タブを簡素化（時間は開始〜終了の手入力で自動算出、感覚3項目＋品質スコア廃止、保存フィードバック）し、部位別の過去最高ボリュームを可視化する。

**Architecture:** 純粋ロジック（時間差・ボリューム）を `js/lib/` でテスト。感覚スコア関連を削除し依存箇所を更新。記録タブとホームにボリューム可視化を追加。加算的スキーマ（exercise.category / workout.startTime,endTime / sensoryLogs簡素化）。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 主要部位リストは `['背中', '胸', '肩', '脚', '腕', 'その他']`、未設定は `'その他'` 扱い
- ボリューム式：`volume = weight * (selfReps + (1 - 0.5^assistedReps))`、`selfReps = reps - assistedReps`
- 加算的スキーマ変更（DBバージョン変更なし）、既存 sensoryLog の欠損は無視
- 既存 `get`/`getAll`/`put`/`remove`/`uid`、`localDateStr`、`createStepper`、`SENSORY_TAGS`（workout.js export）に準拠

---

## Task 1: 時間差の純粋ロジック（timerange.js）

**Files:**
- Create: `js/lib/timerange.js`
- Test: `test/timerange.test.js`

**Interfaces:**
- Produces: `durationMinutes(start, end)` → 数値（分）。`'HH:MM'` 2つ。終了≤開始・空は0

- [ ] **Step 1: 失敗するテストを書く**

`test/timerange.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationMinutes } from '../js/lib/timerange.js';

test('durationMinutes computes minute difference', () => {
  assert.equal(durationMinutes('09:00', '10:30'), 90);
  assert.equal(durationMinutes('18:15', '19:00'), 45);
});

test('durationMinutes returns 0 for end <= start or empty', () => {
  assert.equal(durationMinutes('10:00', '09:00'), 0);
  assert.equal(durationMinutes('10:00', '10:00'), 0);
  assert.equal(durationMinutes('', '10:00'), 0);
  assert.equal(durationMinutes('10:00', ''), 0);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`timerange.js` が存在しない）

- [ ] **Step 3: timerange.js を実装**

`js/lib/timerange.js`:
```js
// 'HH:MM' 2つから所要分を返す。終了≤開始・空は0。
export function durationMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/timerange.js test/timerange.test.js
git commit -m "feat: add durationMinutes time-range logic with tests"
```

---

## Task 2: ボリューム純粋ロジック（volume.js）

**Files:**
- Create: `js/lib/volume.js`
- Test: `test/volume.test.js`

**Interfaces:**
- Produces:
  - `setVolume(weight, reps, assistedReps)` → 数値
  - `categoryVolumeForDate(sets, exById, wkById, date)` → `{ category: number }`
  - `maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate)` → `{ category: number }`
  - `exById` は `{exerciseId: exercise}`、`wkById` は `{workoutId: workout}`

- [ ] **Step 1: 失敗するテストを書く**

`test/volume.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setVolume, categoryVolumeForDate, maxCategoryVolumeExcludingDate } from '../js/lib/volume.js';

test('setVolume without assist is weight*reps', () => {
  assert.equal(setVolume(100, 8, 0), 800);
});

test('setVolume halves weight per assisted rep', () => {
  // selfReps=6, assistFactor=1-0.5^2=0.75 -> 100*6.75
  assert.equal(setVolume(100, 8, 2), 675);
  // selfReps=0, factor=1-0.5^5=0.96875 -> 96.875
  assert.ok(Math.abs(setVolume(100, 5, 5) - 96.875) < 1e-9);
});

test('categoryVolumeForDate sums volume per category on a date', () => {
  const exById = { e1: { id: 'e1', category: '胸' }, e2: { id: 'e2', category: '背中' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-21' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e2', workoutId: 'w1', weight: 80, reps: 5, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w2', weight: 100, reps: 5, assistedReps: 0 },
  ];
  const v = categoryVolumeForDate(sets, exById, wkById, '2026-06-20');
  assert.equal(v['胸'], 1000);
  assert.equal(v['背中'], 400);
  assert.equal(v['脚'], undefined);
});

test('categoryVolumeForDate treats missing category as その他', () => {
  const exById = { e1: { id: 'e1' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' } };
  const sets = [{ exerciseId: 'e1', workoutId: 'w1', weight: 50, reps: 4, assistedReps: 0 }];
  const v = categoryVolumeForDate(sets, exById, wkById, '2026-06-20');
  assert.equal(v['その他'], 200);
});

test('maxCategoryVolumeExcludingDate returns max daily total excluding a date', () => {
  const exById = { e1: { id: 'e1', category: '胸' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-21' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 }, // 500
    { exerciseId: 'e1', workoutId: 'w2', weight: 100, reps: 8, assistedReps: 0 }, // 800 (today)
  ];
  // exclude 2026-06-21 -> only 6/20's 500
  const m = maxCategoryVolumeExcludingDate(sets, exById, wkById, '2026-06-21');
  assert.equal(m['胸'], 500);
  // exclude nothing -> 800
  const all = maxCategoryVolumeExcludingDate(sets, exById, wkById, null);
  assert.equal(all['胸'], 800);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`volume.js` が存在しない）

- [ ] **Step 3: volume.js を実装**

`js/lib/volume.js`:
```js
// 1セットのボリューム。補助回数は重量を半減ずつ計上：係数 1 - 0.5^assistedReps
export function setVolume(weight, reps, assistedReps = 0) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  const a = Math.min(Number(assistedReps) || 0, r);
  const selfReps = r - a;
  const assistFactor = a > 0 ? (1 - Math.pow(0.5, a)) : 0;
  return w * (selfReps + assistFactor);
}

function catOf(ex) {
  return (ex && ex.category) || 'その他';
}

// 指定日の部位別ボリューム合計
export function categoryVolumeForDate(sets, exById, wkById, date) {
  const out = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date !== date) continue;
    const cat = catOf(exById[s.exerciseId]);
    out[cat] = (out[cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  return out;
}

// excludeDate の日を除いた、部位別「日合計」の最大
export function maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date === excludeDate) continue;
    const cat = catOf(exById[s.exerciseId]);
    (perDate[wk.date] ||= {});
    perDate[wk.date][cat] = (perDate[wk.date][cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  const max = {};
  for (const date in perDate) {
    for (const cat in perDate[date]) {
      if (max[cat] === undefined || perDate[date][cat] > max[cat]) max[cat] = perDate[date][cat];
    }
  }
  return max;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/volume.js test/volume.test.js
git commit -m "feat: add volume calc logic (assist-weighted, per-category) with tests"
```

---

## Task 3: 品質スコア関連の削除（calc / insights lib / gemini）

**Files:**
- Modify: `js/lib/calc.js`
- Modify: `test/calc.test.js`
- Modify: `js/lib/insights.js`
- Modify: `test/insights.test.js`
- Modify: `js/lib/gemini.js`

**Interfaces:**
- Produces: `sensoryScore` 削除、`tagScoreCorrelation` 削除、`buildInsightPrompt` から品質スコア節を除去

- [ ] **Step 1: calc.js から sensoryScore と ROM_FACTOR を削除**

`js/lib/calc.js` の以下のブロックを削除：
```js
// ROM係数
const ROM_FACTOR = { full: 1.0, partial: 0.7, cheating: 0.4 };

// セット品質スコア: muscleLoad*romFactor + core*Wcore
// Score = Σ ( V_volume × W_form + I_intensity × W_core )
// V=muscleLoad, W_form=romFactor, I=core, W_core=1.0
export function sensoryScore({ core = 0, muscleLoad = 0, rom = 'full' } = {}) {
  const romFactor = ROM_FACTOR[rom] ?? 1.0;
  const wCore = 1.0;
  return muscleLoad * romFactor + core * wCore;
}
```
（`estimate1RM` と `computePRs` は残す）

- [ ] **Step 2: calc.test.js から sensoryScore テストを削除**

`test/calc.test.js` の以下2テストを削除：
```js
test('sensoryScore weights core and rom', () => {
  const s = sensoryScore({ core: 4, muscleLoad: 5, rom: 'full' });
  assert.equal(s, 5 * 1 * 1.0 + 4 * 1.0);
});

test('sensoryScore reduces score for partial/cheating rom', () => {
  const full = sensoryScore({ core: 3, muscleLoad: 3, rom: 'full' });
  const partial = sensoryScore({ core: 3, muscleLoad: 3, rom: 'partial' });
  const cheating = sensoryScore({ core: 3, muscleLoad: 3, rom: 'cheating' });
  assert.ok(full > partial && partial > cheating);
});
```
`test/calc.test.js` の import 行から `sensoryScore` を外す：
```js
import { estimate1RM, computePRs } from '../js/lib/calc.js';
```

- [ ] **Step 3: insights.js（lib）から tagScoreCorrelation を削除**

`js/lib/insights.js` の `tagScoreCorrelation` 関数全体を削除（`tagFrequency`・`avg`・`tag1RMCorrelation` は残す）。`avg` が `tag1RMCorrelation` でも使われていることを確認し残す。

- [ ] **Step 4: insights.test.js から tagScoreCorrelation テストを削除**

`test/insights.test.js` の import を次に変更：
```js
import { tagFrequency, tag1RMCorrelation } from '../js/lib/insights.js';
```
`tagScoreCorrelation` を使う2テスト（`flags tags whose avg score deviates...` と `ignores tags within threshold`）を削除。

- [ ] **Step 5: gemini.js のプロンプトから品質スコア節を削除**

`js/lib/gemini.js` の `buildInsightPrompt` 内、`const corr = ...` の定義行と、配列内の `'【タグと品質スコアの傾向】', corr || '（なし）',` 行を削除する。結果：
```js
export function buildInsightPrompt(stats) {
  const prs = (stats.prs || []).map((p) => `- ${p.name}: 推定1RM ${p.pr.toFixed(1)}kg`).join('\n');
  const tags = (stats.tagFreq || []).map((t) => `- ${t.tag}（${t.count}回）`).join('\n');
  const notes = (stats.workoutNotes || []).map((n) => `- ${n}`).join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下のトレーニング記録の傾向を踏まえ、弱点の克服に向けた具体的な改善提案を3つ、簡潔な日本語で提示してください。',
    'ストレッチ・フォーム・インターバル・重量設定など実践的な内容にしてください。',
    '',
    `直近の記録セット数: ${stats.recentCount || 0}`,
    '【種目別PR】', prs || '（なし）',
    '【よく使うタグ】', tags || '（なし）',
    '【最近の感想】', notes || '（なし）',
  ].join('\n');
}
```

- [ ] **Step 6: テスト全体を実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS（gemini の既存テストは tagFreq/PR/notes を検証しており品質スコア節に依存しないため通る）

- [ ] **Step 7: コミット**

```bash
git add js/lib/calc.js test/calc.test.js js/lib/insights.js test/insights.test.js js/lib/gemini.js
git commit -m "refactor: remove sensory quality score (calc/insights/gemini)"
```

---

## Task 4: メニュー管理に主要部位セレクトを追加（exercises.js）

**Files:**
- Modify: `js/views/exercises.js`

**Interfaces:**
- Produces: `exercise.category`（`'背中'|'胸'|'肩'|'脚'|'腕'|'その他'`）を保存

- [ ] **Step 1: 部位定数と入力欄を追加**

`js/views/exercises.js` の先頭（import 群の直後）に追加：
```js
export const BODY_PARTS = ['背中', '胸', '肩', '脚', '腕', 'その他'];
```
`renderExercises` 内 `el.innerHTML` の「部位（細分化可）」フィールドの直後に主要部位セレクトを追加。`<div class="field"><label>意識ポイント（カンマ区切り）</label>` の直前に挿入：
```js
      <div class="field"><label>主要部位</label>
        <select id="ex-cat" class="input">
          ${BODY_PARTS.map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select></div>
```

- [ ] **Step 2: 保存時に category を含める**

`js/views/exercises.js` の追加保存処理 `await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern });` を次に置き換え：
```js
    const category = el.querySelector('#ex-cat').value;
    await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern, category });
```

- [ ] **Step 3: 一覧に部位を併記**

`js/views/exercises.js` の種目一覧の `<span class="chip">${escapeHtml(e.setPattern || '通常')}</span>` の直前に追加：
```js
          ${e.category ? `<span class="chip">${escapeHtml(e.category)}</span>` : ''}
```

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/exercises.js && echo OK`
Expected: `OK`
preview のメニュー管理で主要部位を選んで種目追加→一覧に部位チップ表示を確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/exercises.js
git commit -m "feat: add major body-part category to exercises"
```

---

## Task 5: 記録タブの刷新（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `durationMinutes`（timerange.js）、`setVolume`/`categoryVolumeForDate`/`maxCategoryVolumeExcludingDate`（volume.js）、`createStepper`、`openSetEditor`
- Produces: `renderWorkout`、`SENSORY_TAGS`（export 維持）。`sensoryLogs` は `{id,setId,note,tags}`

- [ ] **Step 1: workout.js 全体を置き換え**

`js/views/workout.js` 全体を次に置き換え：
```js
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
```

- [ ] **Step 2: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`
preview の記録タブで：開始/終了時刻入力→所要表示、感覚3項目が無いこと、保存後「保存しました」表示、ボリュームバー更新を確認。

- [ ] **Step 3: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: overhaul record tab (time range, drop sensory score, save feedback, volume bar)"
```

---

## Task 6: セット編集から感覚3項目を削除（set-editor.js）

**Files:**
- Modify: `js/views/set-editor.js`

**Interfaces:**
- Produces: `sensoryLogs` を `{id,setId,note,tags}` で保存

- [ ] **Step 1: import から sensoryScore を外す**

`js/views/set-editor.js` の import 行を次に変更：
```js
import { estimate1RM } from '../lib/calc.js';
```

- [ ] **Step 2: モーダルから腹圧・対象筋・ROM を削除**

`js/views/set-editor.js` の modal テンプレート内、以下の3ブロックを削除：
```js
    <div class="field"><label>腹圧保持(1-5)</label><input id="e-core" class="input" type="number" min="1" max="5" value="${log.core}" /></div>
    <div class="field"><label>対象筋への負荷(1-5)</label><input id="e-load" class="input" type="number" min="1" max="5" value="${log.muscleLoad}" /></div>
    <div class="field"><label>可動域 ROM</label>
      <div class="seg" id="e-rom">
        <button data-v="full" class="${log.rom === 'full' ? 'sel' : ''}">フル</button>
        <button data-v="partial" class="${log.rom === 'partial' ? 'sel' : ''}">部分</button>
        <button data-v="cheating" class="${log.rom === 'cheating' ? 'sel' : ''}">チーティング</button>
      </div></div>
```

- [ ] **Step 3: ROM/タグのバインドから ROM を削除**

`js/views/set-editor.js` の以下のブロックを削除：
```js
  let rom = log.rom;
  modal.querySelectorAll('#e-rom button').forEach((bb) =>
    bb.addEventListener('click', () => {
      modal.querySelectorAll('#e-rom button').forEach((x) => x.classList.remove('sel'));
      bb.classList.add('sel'); rom = bb.dataset.v;
    }));
```

- [ ] **Step 4: 保存処理を簡素化**

`js/views/set-editor.js` の保存ハンドラ内、`const core = ...` 〜 `set.estimated1RM = ...` の検証・保存部分を次に置き換え（core/load/rom/score を除去）：
```js
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    if (assistedReps > reps) { err.textContent = '補助回数は回数以下にしてください'; return; }
    set.weight = weight; set.reps = reps; set.assistedReps = assistedReps;
    set.estimated1RM = estimate1RM(weight, reps - assistedReps);
    await put('sets', set);
    const newLog = { id: log.id || uid(), setId,
      note: modal.querySelector('#e-note').value, tags: [...tagSet] };
    await put('sensoryLogs', newLog);
    modal.remove();
    onDone && onDone();
```
（既存の `const core = parseInt(...)`・`const load = parseInt(...)` 行、および旧 `set.estimated1RM = estimate1RM(weight, reps - assistedReps);` 以降の重複を削除して上記に統合する）

- [ ] **Step 5: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/set-editor.js && echo OK`
Expected: `OK`

- [ ] **Step 6: コミット**

```bash
git add js/views/set-editor.js
git commit -m "feat: simplify set editor (remove sensory score fields)"
```

---

## Task 7: インサイトから品質スコア節を削除（insights.js view）

**Files:**
- Modify: `js/views/insights.js`

- [ ] **Step 1: import と算出から scoreCorr を除去**

`js/views/insights.js` の import を次に変更：
```js
import { tagFrequency, tag1RMCorrelation } from '../lib/insights.js';
```
`const scoreCorr = tagScoreCorrelation(recent, 1.0);` 行を削除。

- [ ] **Step 2: scoreHtml と該当カードを削除**

`js/views/insights.js` の `const scoreHtml = scoreCorr.length ...` ブロック全体を削除。`el.innerHTML` 内の `<div class="card"><strong>タグ × 品質スコア</strong>${scoreHtml}</div>` 行を削除。

- [ ] **Step 3: AI統計から scoreCorr を除去**

`js/views/insights.js` の AI ハンドラ内 `stats` オブジェクトから `scoreCorr,` 行を削除。

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/insights.js && echo OK`
Expected: `OK`
preview のインサイトで「タグ×品質スコア」カードが無いこと、タグ頻度・タグ×1RM・AIが残ることを確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/insights.js
git commit -m "feat: remove tag-score insight card"
```

---

## Task 8: Q表示の削除と部位別ボリューム一覧（history.js / home.js）

**Files:**
- Modify: `js/views/history.js`
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `maxCategoryVolumeExcludingDate`（volume.js）

- [ ] **Step 1: history.js から Q 表示を削除**

`js/views/history.js` のセット行内 `<span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>` を次に置き換え：
```js
            <span class="muted">1RM ${s.estimated1RM.toFixed(0)}</span>
```
`js/views/history.js` で `logs` を使うのが上記のみになる場合、`const logs = await getAll('sensoryLogs');` 行と `const log = logs.find(...)` 行を削除する（未使用変数の除去）。

- [ ] **Step 2: home.js の日詳細から Q を削除**

`js/views/home.js` の `renderDayDetail` 内、セット行 `<span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>` を次に置き換え：
```js
      <span class="muted">1RM ${s.estimated1RM.toFixed(0)}</span>
```
同関数内の `const logs = await getAll('sensoryLogs');` と `const log = logs.find((l) => l.setId === s.id);` を削除する。

- [ ] **Step 3: home.js に部位別最高ボリューム一覧を追加**

`js/views/home.js` の import に追加：
```js
import { maxCategoryVolumeExcludingDate } from '../lib/volume.js';
```
`renderHome` 内、カレンダーカードの `el.innerHTML` への連結（`<div class="card"><strong>トレーニングカレンダー</strong>...`）の直前に、ボリュームカードのHTMLを組み立てる。`el.innerHTML = ` の前に次を追加：
```js
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
```
`el.innerHTML` テンプレート内、PRカードの直後（トレーニングカレンダーカードの直前）に `${volCard}` を挿入する。

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/history.js && node --check js/views/home.js && echo OK`
Expected: `OK`
preview の履歴・ホーム日詳細に Q が無いこと、ホームに部位別最高ボリューム一覧（バー）が出ることを確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/history.js js/views/home.js
git commit -m "feat: drop quality score display; add per-category max volume on home"
```

---

## Task 9: スタイル・PWA キャッシュ・全体確認

**Files:**
- Modify: `css/style.css`
- Modify: `sw.js`

- [ ] **Step 1: ボリュームバーのスタイルを追加**

`css/style.css` の末尾に追加：
```css
.volbar { background: var(--surface-2); border-radius: 999px; height: 12px; overflow: hidden; margin: 4px 0; }
.volbar-fill { background: var(--accent); height: 100%; border-radius: 999px; }
```

- [ ] **Step 2: sw.js のキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v9';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v10';
```
`sw.js` の ASSETS 内、`'js/lib/duration.js', 'js/lib/calendar.js', 'js/lib/localdate.js',` の行を次に置き換え：
```js
  'js/lib/duration.js', 'js/lib/calendar.js', 'js/lib/localdate.js', 'js/lib/timerange.js', 'js/lib/volume.js',
```

- [ ] **Step 3: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（既存33 − calc2 − insights2 + timerange2 + volume5 = 36 tests）

- [ ] **Step 4: 全フロー手動確認**

preview で：メニューで種目に部位設定 → 記録タブで時間入力・感覚3項目なし・タグ/メモ・保存フィードバック・ボリュームバー（過去最高超えで「自己ベスト更新！」）→ 履歴/ホームでQなし → ホームに部位別最高ボリューム一覧 → インサイトに品質スコアカードなし → リロードでデータ永続を確認。

- [ ] **Step 5: コミット**

```bash
git add css/style.css sw.js
git commit -m "chore: volume bar styles and PWA cache v10"
```

---

## Self-Review チェック結果
- **スペック網羅**：時間レンジ(T1,T5)/ボリューム計算(T2)/感覚スコア廃止(T3,T5,T6,T7,T8)/部位category(T4)/保存フィードバック(T5)/記録タブ刷新(T5)/部位別可視化 記録タブ＋ホーム(T5,T8)/スタイル・SW(T9) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`durationMinutes(start,end)`、`setVolume(weight,reps,assistedReps)`、`categoryVolumeForDate(sets,exById,wkById,date)`、`maxCategoryVolumeExcludingDate(sets,exById,wkById,excludeDate)`、`exercise.category`、`workout.startTime/endTime/durationSec`、`sensoryLogs={id,setId,note,tags}`、`BODY_PARTS`、`SENSORY_TAGS` が全タスクで一致。`sensoryScore`/`tagScoreCorrelation` は全呼び出し元（workout/set-editor/insights/gemini）から除去済み。
