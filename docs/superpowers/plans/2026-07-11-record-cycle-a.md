# 記録改善サイクルA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** まとめ保存（最大6行）・インターバル終了10秒前の音・種目プリセット検索・タグ機能全廃・重量0.5kg刻みを実装する。

**Architecture:** 純粋ロジック（ビープ判定・プリセット検索）を `js/lib/` に追加しテスト。タグに依存する `js/lib/insights.js` は削除し、gemini/obsidian/insights viewからタグ節を除去。workout.js を行ベースのまとめ保存UIに全面書き換え。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 加算的スキーマ変更（DBバージョン変更なし）。`sensoryLogs` は今後 `{id, setId, note}` のみ書き込む
- 行UI：初期3行・最小1行・最大6行、削除は末尾行のみ
- 重量ステッパーの step は `0.5`
- 既存 `getAll`/`put`/`remove`/`uid`、`createStepper`、`estimate1RM`、`computePRs`、`categoryKey`、`categoryVolumeForDate`、`maxCategoryVolumeExcludingDate`、`VOLUME_START_DATE` に準拠

---

## Task 1: ビープ判定ロジック（sound.js）

**Files:**
- Create: `js/lib/sound.js`
- Test: `test/sound.test.js`

**Interfaces:**
- Produces: `shouldBeep(remaining, thresholdSec=10)` → boolean、`playBeep(opts?)` → void（ブラウザ専用・テスト対象外）

- [ ] **Step 1: 失敗するテストを書く**

`test/sound.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBeep } from '../js/lib/sound.js';

test('shouldBeep is true exactly at threshold', () => {
  assert.equal(shouldBeep(10), true);
  assert.equal(shouldBeep(10, 10), true);
});

test('shouldBeep is false elsewhere', () => {
  assert.equal(shouldBeep(11), false);
  assert.equal(shouldBeep(9), false);
  assert.equal(shouldBeep(0), false);
});

test('shouldBeep respects custom threshold', () => {
  assert.equal(shouldBeep(5, 5), true);
  assert.equal(shouldBeep(10, 5), false);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`sound.js` が存在しない）

- [ ] **Step 3: sound.js を実装**

`js/lib/sound.js`:
```js
// 残り秒数がアラート対象かどうか（純粋関数）
export function shouldBeep(remaining, thresholdSec = 10) {
  return remaining === thresholdSec;
}

// ビープ音を1回再生する（Web Audio API、外部ファイル不要。ブラウザ専用）
export function playBeep({ frequency = 880, durationMs = 150 } = {}) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
  osc.onended = () => ctx.close();
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/sound.js test/sound.test.js
git commit -m "feat: add interval beep-threshold logic with tests"
```

---

## Task 2: 種目プリセット検索（exercisePresets.js）

**Files:**
- Create: `js/lib/exercisePresets.js`
- Test: `test/exercisePresets.test.js`

**Interfaces:**
- Produces: `DEFAULT_EXERCISE_PRESETS`（`{name,bodyPart,category}[]`）、`searchPresets(query, presets?)` → 配列

- [ ] **Step 1: 失敗するテストを書く**

`test/exercisePresets.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPresets, DEFAULT_EXERCISE_PRESETS } from '../js/lib/exercisePresets.js';

test('searchPresets matches by name substring case-insensitively', () => {
  const res = searchPresets('ベンチ');
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.name.includes('ベンチ')));
});

test('searchPresets matches by bodyPart substring', () => {
  const res = searchPresets('大腿四頭筋');
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.bodyPart.includes('大腿四頭筋')));
});

test('searchPresets returns empty array for empty query', () => {
  assert.deepEqual(searchPresets(''), []);
  assert.deepEqual(searchPresets('   '), []);
});

test('searchPresets returns empty array when nothing matches', () => {
  assert.deepEqual(searchPresets('xyz-nonexistent'), []);
});

test('DEFAULT_EXERCISE_PRESETS entries have name, bodyPart, category', () => {
  assert.ok(DEFAULT_EXERCISE_PRESETS.length >= 20);
  for (const p of DEFAULT_EXERCISE_PRESETS) {
    assert.ok(p.name && p.bodyPart && p.category);
  }
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`exercisePresets.js` が存在しない）

- [ ] **Step 3: exercisePresets.js を実装**

`js/lib/exercisePresets.js`:
```js
export const DEFAULT_EXERCISE_PRESETS = [
  { name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸' },
  { name: 'インクラインベンチプレス', bodyPart: '胸/上部', category: '胸' },
  { name: 'ダンベルフライ', bodyPart: '胸/内側', category: '胸' },
  { name: 'ディップス', bodyPart: '胸/下部', category: '胸' },
  { name: 'プッシュアップ', bodyPart: '胸/全体', category: '胸' },
  { name: 'スクワット', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'レッグプレス', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'レッグエクステンション', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'レッグカール', bodyPart: '脚/ハムストリング', category: '脚' },
  { name: 'ルーマニアンデッドリフト', bodyPart: '脚/ハムストリング', category: '脚' },
  { name: 'カーフレイズ', bodyPart: '脚/カーフ', category: '脚' },
  { name: 'ブルガリアンスクワット', bodyPart: '脚/大腿四頭筋', category: '脚' },
  { name: 'デッドリフト', bodyPart: '背中/下部', category: '背中' },
  { name: 'ラットプルダウン', bodyPart: '背中/広背筋', category: '背中' },
  { name: '懸垂', bodyPart: '背中/広背筋', category: '背中' },
  { name: 'ベントオーバーロウ', bodyPart: '背中/中部', category: '背中' },
  { name: 'シーテッドロウ', bodyPart: '背中/中部', category: '背中' },
  { name: 'Tバーロウ', bodyPart: '背中/中部', category: '背中' },
  { name: 'ショルダープレス', bodyPart: '肩/前部', category: '肩' },
  { name: 'サイドレイズ', bodyPart: '肩/側部', category: '肩' },
  { name: 'リアレイズ', bodyPart: '肩/後部', category: '肩' },
  { name: 'アップライトロウ', bodyPart: '肩/側部', category: '肩' },
  { name: 'バーベルカール', bodyPart: '腕/上腕二頭筋', category: '腕' },
  { name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕' },
  { name: 'トライセプスエクステンション', bodyPart: '腕/上腕三頭筋', category: '腕' },
  { name: 'ケーブルプッシュダウン', bodyPart: '腕/上腕三頭筋', category: '腕' },
  { name: 'プランク', bodyPart: '体幹/腹筋', category: 'その他' },
  { name: 'クランチ', bodyPart: '体幹/腹筋', category: 'その他' },
];

// name/bodyPart部分一致（大小無視）でプリセットを検索する（純粋関数）
export function searchPresets(query, presets = DEFAULT_EXERCISE_PRESETS) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return presets.filter((p) =>
    p.name.toLowerCase().includes(q) || p.bodyPart.toLowerCase().includes(q));
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/exercisePresets.js test/exercisePresets.test.js
git commit -m "feat: add exercise preset list and keyword search with tests"
```

---

## Task 3: タグ廃止（gemini.js / obsidian.js とそのテスト）

**Files:**
- Modify: `js/lib/gemini.js`
- Modify: `test/gemini.test.js`
- Modify: `js/lib/obsidian.js`
- Modify: `test/obsidian.test.js`

**Interfaces:**
- Produces: `buildInsightPrompt(stats)` は `tagFreq` を受け取らない／使わない。`workoutToMarkdown(data)` は `set.tags` を使わない

- [ ] **Step 1: gemini.js からタグ節を削除**

`js/lib/gemini.js` の `buildInsightPrompt` を次に置き換え：
```js
export function buildInsightPrompt(stats) {
  const prs = (stats.prs || []).map((p) => `- ${p.name}: 推定1RM ${p.pr.toFixed(1)}kg`).join('\n');
  const notes = (stats.workoutNotes || []).map((n) => `- ${n}`).join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下のトレーニング記録の傾向を踏まえ、弱点の克服に向けた具体的な改善提案を3つ、簡潔な日本語で提示してください。',
    'ストレッチ・フォーム・インターバル・重量設定など実践的な内容にしてください。',
    '',
    `直近の記録セット数: ${stats.recentCount || 0}`,
    '【種目別PR】', prs || '（なし）',
    '【最近の感想】', notes || '（なし）',
  ].join('\n');
}
```

- [ ] **Step 2: gemini.test.js を更新**

`test/gemini.test.js` の最初の2テストを次に置き換え：
```js
test('buildInsightPrompt includes PR stats', () => {
  const stats = {
    prs: [{ name: 'ベンチプレス', pr: 126.7 }],
    recentCount: 12,
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /ベンチプレス/);
  assert.match(p, /126\.7/);
  assert.doesNotMatch(p, /タグ/);
});

test('buildInsightPrompt includes workout notes', () => {
  const stats = {
    prs: [], recentCount: 3,
    workoutNotes: ['今日は調子が良かった', '腰に張りがある'],
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /今日は調子が良かった/);
  assert.match(p, /腰に張りがある/);
  assert.match(p, /感想/);
});
```

- [ ] **Step 3: obsidian.js からタグ節を削除**

`js/lib/obsidian.js` の `workoutToMarkdown` 内、セット行生成部分を次に置き換え：
```js
    for (const s of ex.sets) {
      let line = `- ${s.weight}kg × ${s.reps}`;
      if (s.assistedReps) line += `（補助${s.assistedReps}）`;
      line += `（推定1RM ${Math.round(s.estimated1RM)}）`;
      if (s.note) line += ` — メモ: ${s.note}`;
      body.push(line);
    }
```

- [ ] **Step 4: obsidian.test.js を更新**

`test/obsidian.test.js` の `sample` オブジェクトと1つ目のテストを次に置き換え：
```js
const sample = {
  date: '2026-06-22',
  place: '〇〇ジム',
  durationMin: 90,
  note: '胸の張りが良い',
  volume: { 胸: 600 },
  exercises: [
    { name: 'ベンチプレス', category: '胸', sets: [
      { weight: 100, reps: 6, assistedReps: 0, estimated1RM: 120, note: '' },
      { weight: 100, reps: 5, assistedReps: 2, estimated1RM: 116, note: '効き浅い' },
    ] },
  ],
};

test('workoutToMarkdown includes frontmatter, heading, sets, volume, note', () => {
  const md = workoutToMarkdown(sample);
  assert.match(md, /^---\n/);
  assert.match(md, /date: 2026-06-22/);
  assert.match(md, /place: 〇〇ジム/);
  assert.match(md, /duration_min: 90/);
  assert.match(md, /volume_胸: 600/);
  assert.match(md, /tags: \[gachi-fit\]/);
  assert.match(md, /# 2026-06-22 トレーニング/);
  assert.match(md, /## ベンチプレス（胸）/);
  assert.match(md, /- 100kg × 6（推定1RM 120）/);
  assert.match(md, /- 100kg × 5（補助2）（推定1RM 116）ー メモ: 効き浅い/.source.replace('ー', '—'));
  assert.match(md, /## 感想\n胸の張りが良い/);
});
```

- [ ] **Step 5: テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS（全テスト green）

- [ ] **Step 6: コミット**

```bash
git add js/lib/gemini.js test/gemini.test.js js/lib/obsidian.js test/obsidian.test.js
git commit -m "refactor: drop tag sections from gemini prompt and obsidian markdown"
```

---

## Task 4: タグ集計ロジックの削除＋インサイト画面の簡素化

**Files:**
- Delete: `js/lib/insights.js`
- Delete: `test/insights.test.js`
- Modify: `js/views/insights.js`
- Modify: `js/views/home.js`

**Interfaces:**
- Produces: `renderInsights(el)` はタグに依存しない

- [ ] **Step 1: タグ集計ライブラリとテストを削除**

```bash
git rm js/lib/insights.js test/insights.test.js
```

- [ ] **Step 2: insights.js（view）を書き換え**

`js/views/insights.js` 全体を次に置き換え：
```js
import { getAll } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { buildInsightPrompt, callGemini } from '../lib/gemini.js';

export async function renderInsights(el) {
  const sets = await getAll('sets');

  if (!sets.length) {
    el.innerHTML = `<h2 class="view-title">インサイト</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
    return;
  }

  el.innerHTML = `
    <h2 class="view-title">インサイト</h2>
    <div class="card">
      <strong>AIインサイト（Gemini）</strong>
      <p class="muted">蓄積データを分析し具体的な改善提案を生成します。</p>
      <button id="ai-run" class="btn btn-primary btn-block">AIで分析</button>
      <div id="ai-out" class="muted" style="margin-top:10px;white-space:pre-wrap"></div>
    </div>`;

  el.querySelector('#ai-run').addEventListener('click', async () => {
    const out = el.querySelector('#ai-out');
    const key = localStorage.getItem('gemini_api_key') || '';
    if (!key) { out.textContent = '設定でGemini APIキーを登録してください。'; return; }
    out.textContent = '分析中…';
    try {
      const exercises = await getAll('exercises');
      const workouts = (await getAll('workouts')).sort((a, b) => (a.date < b.date ? 1 : -1));
      const workoutNotes = workouts.map((w) => w.note).filter((n) => n && n.trim()).slice(0, 10);
      const prs = computePRs(sets);
      const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
      const stats = {
        prs: Object.entries(prs).map(([id, pr]) => ({ name: nameOf(id), pr })),
        recentCount: sets.length,
        workoutNotes,
      };
      const prompt = buildInsightPrompt(stats);
      out.textContent = await callGemini(prompt, key, {});
    } catch (e) { out.textContent = 'エラー: ' + e.message; }
  });
}
```

- [ ] **Step 3: home.js の buildDayData から tags を除去**

`js/views/home.js` の `buildDayData` 内、セット整形部分を次に置き換え：
```js
    grouped[s.exerciseId].push({
      weight: s.weight, reps: s.reps, assistedReps: s.assistedReps || 0,
      estimated1RM: s.estimated1RM, note: log.note || '',
    });
```

- [ ] **Step 4: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/insights.js && node --check js/views/home.js && echo OK`
Expected: `OK`

- [ ] **Step 5: テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add js/lib/insights.js test/insights.test.js js/views/insights.js js/views/home.js
git commit -m "refactor: remove tag aggregation lib and simplify insights view to AI-only"
```

---

## Task 5: セット編集モーダルからタグ削除＋0.5kg刻み（set-editor.js）

**Files:**
- Modify: `js/views/set-editor.js`

**Interfaces:**
- Consumes: `createStepper`（変更なし）
- Produces: `openSetEditor(setId, onDone)` は `SENSORY_TAGS` に依存しない

- [ ] **Step 1: set-editor.js を書き換え**

`js/views/set-editor.js` 全体を次に置き換え：
```js
import { get, getAll, put, uid } from '../db.js';
import { estimate1RM } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';
import { createStepper } from './components.js';

// セット編集モーダルを開く。保存/キャンセルで閉じ、変更時に onDone() を呼ぶ。
export async function openSetEditor(setId, onDone) {
  const set = await get('sets', setId);
  const logs = await getAll('sensoryLogs');
  const log = logs.find((l) => l.setId === setId) || { note: '' };

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:10;background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">セット編集</h2>
    <div class="field"><label>重量(kg)</label><div id="e-weight"></div></div>
    <div class="field"><label>回数</label><div id="e-reps"></div></div>
    <div class="field">
      <button type="button" id="e-assist-toggle" class="btn btn-block">補助あり：OFF</button>
      <div id="e-assist-wrap" style="display:none;margin-top:8px"><label>補助回数</label><div id="e-assist"></div></div>
    </div>
    <div class="field"><label>メモ</label><input id="e-note" class="input" value="${escapeHtml(log.note || '')}" /></div>
    <div id="e-error" class="error"></div>
    <button id="e-save" class="btn btn-primary btn-block">保存</button>
    <button id="e-cancel" class="btn btn-block" style="margin-top:8px">キャンセル</button>`;
  document.body.appendChild(modal);

  const weightStepper = createStepper(modal.querySelector('#e-weight'), { value: set.weight, step: 0.5, min: 0 });
  const repsStepper = createStepper(modal.querySelector('#e-reps'), { value: set.reps, step: 1, min: 0 });
  const assistStepper = createStepper(modal.querySelector('#e-assist'), { value: set.assistedReps || 0, step: 1, min: 0 });
  let assistOn = !!(set.assistedReps && set.assistedReps > 0);
  function syncAssist() {
    modal.querySelector('#e-assist-toggle').textContent = '補助あり：' + (assistOn ? 'ON' : 'OFF');
    modal.querySelector('#e-assist-wrap').style.display = assistOn ? 'block' : 'none';
  }
  syncAssist();
  modal.querySelector('#e-assist-toggle').addEventListener('click', () => {
    assistOn = !assistOn;
    if (!assistOn) assistStepper.set(0);
    syncAssist();
  });

  modal.querySelector('#e-cancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#e-save').addEventListener('click', async () => {
    const weight = weightStepper.get();
    const reps = repsStepper.get();
    const assistedReps = assistOn ? assistStepper.get() : 0;
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    if (assistedReps > reps) { err.textContent = '補助回数は回数以下にしてください'; return; }
    set.weight = weight; set.reps = reps; set.assistedReps = assistedReps;
    set.estimated1RM = estimate1RM(weight, reps - assistedReps);
    await put('sets', set);
    const newLog = { id: log.id || uid(), setId, note: modal.querySelector('#e-note').value };
    await put('sensoryLogs', newLog);
    modal.remove();
    onDone && onDone();
  });
}
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/set-editor.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/views/set-editor.js
git commit -m "feat: remove tags from set editor, weight step to 0.5kg"
```

---

## Task 6: 記録タブの全面書き換え（まとめ保存・ビープ・0.5kg・タグ削除）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `shouldBeep`/`playBeep`（sound.js）、`createStepper`、`estimate1RM`、`computePRs`、`categoryKey`/`categoryVolumeForDate`/`maxCategoryVolumeExcludingDate`/`VOLUME_START_DATE`（volume.js）、`durationMinutes`、`localDateStr`、`openSetEditor`
- Produces: `renderWorkout(el)`。`SENSORY_TAGS` の export は廃止（他ファイルから参照されないことを Task 3-5 で確認済み）

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
import { escapeHtml } from './exercises.js';
import { createStepper } from './components.js';
import { openSetEditor } from './set-editor.js';

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const DEFAULT_ROWS = 3;

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
      <strong>セット入力</strong>
      <div id="w-rows" style="margin-top:10px"></div>
      <div class="row" style="margin-top:8px">
        <button type="button" id="w-row-add" class="btn">＋ 行を追加</button>
        <button type="button" id="w-row-remove" class="btn">− 行を削除</button>
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
  let rowValues = defaultRowValues(DEFAULT_ROWS);
  let rowSteppers = [];

  function refreshRow1RM(i) {
    const rs = rowSteppers[i];
    const w = rs.weight.get();
    const r = rs.reps.get();
    const a = rs.assistOn ? rs.assist.get() : 0;
    const selfReps = r - a;
    el.querySelector(`#w-row-1rm-${i}`).textContent =
      '推定1RM: ' + (w > 0 && selfReps > 0 ? estimate1RM(w, selfReps).toFixed(1) + 'kg' : '-');
  }

  function syncRowValuesFromSteppers() {
    rowSteppers.forEach((rs, i) => {
      rowValues[i] = {
        weight: rs.weight.get(), reps: rs.reps.get(),
        assistedReps: rs.assistOn ? rs.assist.get() : 0,
        assistOn: rs.assistOn,
      };
    });
  }

  function renderRows() {
    const wrap = el.querySelector('#w-rows');
    wrap.innerHTML = rowValues.map((rv, i) => `
      <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #1f1f1f">
        <div class="muted" style="margin-bottom:6px">セット ${i + 1}</div>
        <div class="row">
          <div class="field"><label>重量(kg)</label><div id="w-row-weight-${i}"></div></div>
          <div class="field"><label>回数</label><div id="w-row-reps-${i}"></div></div>
        </div>
        <button type="button" id="w-row-assist-toggle-${i}" class="btn btn-block">補助あり：${rv.assistOn ? 'ON' : 'OFF'}</button>
        <div id="w-row-assist-wrap-${i}" style="display:${rv.assistOn ? 'block' : 'none'};margin-top:8px">
          <label>補助回数</label><div id="w-row-assist-${i}"></div>
        </div>
        <div class="muted" id="w-row-1rm-${i}" style="margin-top:6px">推定1RM: -</div>
      </div>`).join('');

    rowSteppers = rowValues.map((rv, i) => {
      const weight = createStepper(el.querySelector(`#w-row-weight-${i}`), { value: rv.weight, step: 0.5, min: 0, onChange: () => refreshRow1RM(i) });
      const reps = createStepper(el.querySelector(`#w-row-reps-${i}`), { value: rv.reps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
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
    syncRowValuesFromSteppers();
    const err = el.querySelector('#w-error');
    const filled = rowValues.filter((rv) => rv.weight > 0 && rv.reps > 0);
    if (!filled.length) { err.textContent = '少なくとも1セット入力してください'; return; }
    for (const rv of rowValues) {
      if (rv.weight > 0 && rv.reps > 0 && rv.assistedReps > rv.reps) {
        err.textContent = '補助回数は回数以下にしてください'; return;
      }
    }
    err.textContent = '';
    const exerciseId = el.querySelector('#w-ex').value;
    const workout = await patchTodayWorkout();
    const note = el.querySelector('#w-note').value;
    const base = Date.now();
    let i = 0;
    for (const rv of filled) {
      const est = estimate1RM(rv.weight, rv.reps - rv.assistedReps);
      const setId = uid();
      await put('sets', { id: setId, workoutId: workout.id, exerciseId, weight: rv.weight, reps: rv.reps,
        assistedReps: rv.assistedReps, estimated1RM: est, targetWeight: prs[exerciseId] || null, createdAt: base + i });
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

  renderRows();
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

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 3: ブラウザで動作確認**

preview で記録タブを開き：3行のセット入力が表示される、＋/−で行が4〜6行/1行まで増減する、各行の推定1RMが更新される、補助回数>回数でエラー、「まとめて記録」で複数行が一括保存され本日のセットに反映、保存後に行が3行にリセットされることを確認。

- [ ] **Step 4: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: rewrite workout tab as batch-save rows with interval beep"
```

---

## Task 7: メニュー管理にプリセット検索を追加（exercises.js）

**Files:**
- Modify: `js/views/exercises.js`

**Interfaces:**
- Consumes: `searchPresets`（exercisePresets.js）

- [ ] **Step 1: 検索UIをフォームに追加**

`js/views/exercises.js` の `el.innerHTML` 内、`<div class="field"><label>種目名</label>` の直前に挿入：
```js
      <div class="field"><label>プリセット検索</label>
        <input id="ex-search" class="input" placeholder="例: ベンチ / 胸" /></div>
      <div id="ex-search-results" style="margin-bottom:8px"></div>
```

- [ ] **Step 2: import と検索ハンドラを追加**

`js/views/exercises.js` の import 行を次に置き換え：
```js
import { getAll, put, remove, uid } from '../db.js';
import { searchPresets } from '../lib/exercisePresets.js';
```
`el.querySelector('#ex-save').addEventListener(...)` ブロックの直前に追加：
```js
  el.querySelector('#ex-search').addEventListener('input', (e) => {
    const results = searchPresets(e.target.value);
    el.querySelector('#ex-search-results').innerHTML = results.length
      ? results.map((p) => `<span class="chip chip-tag" data-preset-name="${escapeHtml(p.name)}" data-preset-part="${escapeHtml(p.bodyPart)}" data-preset-cat="${escapeHtml(p.category)}">${escapeHtml(p.name)}</span>`).join('')
      : (e.target.value.trim() ? '<p class="muted">候補がありません。</p>' : '');
    el.querySelectorAll('#ex-search-results [data-preset-name]').forEach((chip) =>
      chip.addEventListener('click', () => {
        el.querySelector('#ex-name').value = chip.dataset.presetName;
        el.querySelector('#ex-part').value = chip.dataset.presetPart;
        el.querySelector('#ex-cat').value = chip.dataset.presetCat;
        el.querySelector('#ex-search').value = '';
        el.querySelector('#ex-search-results').innerHTML = '';
      }));
  });
```

- [ ] **Step 3: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/exercises.js && echo OK`
Expected: `OK`
preview のメニュー管理でプリセット検索に「ベンチ」と入力→候補チップ表示→タップで種目名/部位/主要部位が自動入力されることを確認。

- [ ] **Step 4: コミット**

```bash
git add js/views/exercises.js
git commit -m "feat: add exercise preset search to menu registration"
```

---

## Task 8: PWA キャッシュ更新・全体確認

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

- [ ] **Step 1: sw.js のキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v12';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v13';
```
`sw.js` の ASSETS 配列を次に置き換え（`js/lib/insights.js` を削除、`js/lib/sound.js`・`js/lib/exercisePresets.js` を追加）：
```js
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js',
  'js/lib/calc.js', 'js/lib/chart.js',
  'js/lib/gemini.js', 'js/lib/countdown.js', 'js/lib/seed.js', 'js/lib/image.js', 'js/lib/duration.js', 'js/lib/calendar.js', 'js/lib/localdate.js', 'js/lib/timerange.js', 'js/lib/volume.js', 'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js',
  'js/views/history.js', 'js/views/insights.js', 'js/views/review.js', 'js/views/settings.js',
  'js/views/body.js', 'js/views/more.js', 'js/views/components.js', 'js/views/set-editor.js', 'js/views/calendar.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];
```

- [ ] **Step 2: README を更新**

`README.md` の `## 機能` リストに追加（末尾）：
```markdown
- 記録タブ: 種目単位のまとめ保存（最大6セット）、インターバル終了10秒前のビープ音、種目プリセット検索、0.5kg単位の重量調整
```

- [ ] **Step 3: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS

- [ ] **Step 4: 全フロー手動確認**

preview で：メニュー管理でプリセット検索から種目登録 → 記録タブで複数行入力しまとめて記録 → インターバル開始し残り10秒でビープが鳴る（音声はconsole/挙動で確認できる範囲） → 本日のセット編集（タグUIが無いこと・0.5kg刻み） → インサイトがAIカードのみであることを確認。

- [ ] **Step 5: コミット**

```bash
git add sw.js README.md
git commit -m "chore: PWA cache v13 for record cycle A"
```

---

## Self-Review チェック結果
- **スペック網羅**：①まとめ保存(T6)/③ビープ(T1,T6)/④プリセット検索(T2,T7)/⑤タグ全廃(T3,T4,T5,T6)/⑥0.5kg(T5,T6)/PWA(T8) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`shouldBeep(remaining,thresholdSec)`/`playBeep(opts)`、`searchPresets(query,presets)`/`DEFAULT_EXERCISE_PRESETS`、`buildInsightPrompt(stats)`（tagFreqなし）、`workoutToMarkdown`（tagsなし）、`sensoryLogs={id,setId,note}`、行データ `{weight,reps,assistedReps,assistOn}`、`MIN_ROWS/MAX_ROWS/DEFAULT_ROWS` が全タスクで一致。`SENSORY_TAGS` の参照は Task 5（set-editor.js）で先に除去し、Task 6（workout.js）で export 自体を廃止するため依存順序は安全。
