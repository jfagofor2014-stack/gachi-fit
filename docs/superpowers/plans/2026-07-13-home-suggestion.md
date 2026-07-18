# ホーム画面の挨拶＋部位提案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム画面に「お帰りなさい。今日はどんなトレーニングをしますか？」の挨拶と、直近しばらく鍛えていない部位2つの提案を表示し、提案部位をタップすると記録タブがその部位選択状態で開くようにする。

**Architecture:** 部位抽出ロジックを `js/lib/volume.js` の共通関数に切り出し、新規 `js/lib/suggest.js` で「最終トレーニング日」「提案部位」の純粋関数を実装する。`js/app.js` の `navigate` に任意の `opts` を渡せるようにし、`js/views/home.js` から `js/views/workout.js` へ初期選択部位を伝える。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- `categoriesWithExercises(exercises, bodyParts)` は種目が1件以上ある部位を `bodyParts` 順→それ以外の順で返す（`js/lib/volume.js`）
- `suggestBodyParts` は「その他」を除外し、経過日数が長い部位を優先、記録が一度もない部位は最優先、同点は入力順を維持
- 提案数は常に2部位
- 種目が1件も登録されていない場合、ホームに提案カードを表示しない
- 提案部位のタップで `navigate('workout', { initialPart: 部位名 })` を呼び、`renderWorkout` は `opts.initialPart` が現在の部位一覧に含まれていればそれを初期選択、含まれなければ従来どおり先頭の部位を選択
- 既存 `categoryKey`、`daysUntil`、`BODY_PARTS`、`localDateStr` に準拠

---

## Task 1: 部位抽出ロジックの共通化（volume.js）

**Files:**
- Modify: `js/lib/volume.js`
- Modify: `test/volume.test.js`

**Interfaces:**
- Produces: `categoriesWithExercises(exercises, bodyParts)` → `string[]`（`bodyParts`順→それ以外の順、種目のある部位のみ）

- [ ] **Step 1: 失敗するテストを書く**

`test/volume.test.js` の末尾に追加：
```js
import { categoriesWithExercises } from '../js/lib/volume.js';

test('categoriesWithExercises orders by bodyParts then leftovers, excludes empty categories', () => {
  const exercises = [
    { bodyPart: '腕/上腕二頭筋' },
    { bodyPart: '胸/上部' },
    { bodyPart: 'カスタム部位' },
  ];
  const bodyParts = ['背中', '胸', '肩', '脚', '腕', 'その他'];
  assert.deepEqual(categoriesWithExercises(exercises, bodyParts), ['胸', '腕', 'カスタム部位']);
});

test('categoriesWithExercises returns empty array for no exercises', () => {
  assert.deepEqual(categoriesWithExercises([], ['胸', '背中']), []);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`categoriesWithExercises`が存在しない）

- [ ] **Step 3: volume.js に実装を追加**

`js/lib/volume.js` の末尾に追加：
```js

// 種目が1件以上ある部位を bodyParts の順→それ以外の順で返す
export function categoriesWithExercises(exercises, bodyParts) {
  const set = new Set(exercises.map((e) => categoryKey(e)));
  return [
    ...bodyParts.filter((p) => set.has(p)),
    ...[...set].filter((p) => !bodyParts.includes(p)),
  ];
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/volume.js test/volume.test.js
git commit -m "feat: extract categoriesWithExercises helper for body-part grouping"
```

---

## Task 2: 最終トレーニング日と提案部位のロジック（suggest.js）

**Files:**
- Create: `js/lib/suggest.js`
- Test: `test/suggest.test.js`

**Interfaces:**
- Consumes: `categoryKey`（`./volume.js`）、`daysUntil`（`./countdown.js`）
- Produces: `lastTrainedDateByCategory(sets, exById, wkById)` → `{[category]: 'YYYY-MM-DD'}`、`suggestBodyParts(categories, lastTrainedByCategory, today, count=2)` → `string[]`

- [ ] **Step 1: 失敗するテストを書く**

`test/suggest.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastTrainedDateByCategory, suggestBodyParts } from '../js/lib/suggest.js';

test('lastTrainedDateByCategory picks the latest date per category', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' }, e2: { id: 'e2', bodyPart: '背中' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-25' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1' },
    { exerciseId: 'e1', workoutId: 'w2' },
    { exerciseId: 'e2', workoutId: 'w1' },
  ];
  const result = lastTrainedDateByCategory(sets, exById, wkById);
  assert.equal(result['胸'], '2026-06-25');
  assert.equal(result['背中'], '2026-06-20');
});

test('lastTrainedDateByCategory returns empty object for no sets', () => {
  assert.deepEqual(lastTrainedDateByCategory([], {}, {}), {});
});

test('suggestBodyParts prioritizes the longest gap since last trained', () => {
  const lastTrained = { '胸': '2026-07-10', '背中': '2026-07-05', '肩': '2026-07-12' };
  const today = new Date(2026, 6, 13); // 2026-07-13
  const result = suggestBodyParts(['胸', '背中', '肩'], lastTrained, today, 2);
  assert.deepEqual(result, ['背中', '胸']);
});

test('suggestBodyParts prioritizes never-trained categories first', () => {
  const lastTrained = { '胸': '2026-07-10' };
  const today = new Date(2026, 6, 13);
  const result = suggestBodyParts(['胸', '腕'], lastTrained, today, 2);
  assert.deepEqual(result, ['腕', '胸']);
});

test('suggestBodyParts excludes その他', () => {
  const lastTrained = {};
  const today = new Date(2026, 6, 13);
  const result = suggestBodyParts(['胸', 'その他'], lastTrained, today, 2);
  assert.deepEqual(result, ['胸']);
});

test('suggestBodyParts keeps input order on ties', () => {
  const lastTrained = {};
  const today = new Date(2026, 6, 13);
  const result = suggestBodyParts(['背中', '胸', '肩'], lastTrained, today, 2);
  assert.deepEqual(result, ['背中', '胸']);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`js/lib/suggest.js`が存在しない）

- [ ] **Step 3: suggest.js を実装**

`js/lib/suggest.js`:
```js
import { categoryKey } from './volume.js';
import { daysUntil } from './countdown.js';

// 部位ごとの最終トレーニング日（'YYYY-MM-DD'）を返す。記録がない部位はキーなし
export function lastTrainedDateByCategory(sets, exById, wkById) {
  const out = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk) continue;
    const cat = categoryKey(exById[s.exerciseId]);
    if (!out[cat] || wk.date > out[cat]) out[cat] = wk.date;
  }
  return out;
}

// 登録済み種目がある部位（その他は除く）のうち、直近しばらく鍛えていない順にcount件を提案する
export function suggestBodyParts(categories, lastTrainedByCategory, today, count = 2) {
  const candidates = categories.filter((c) => c !== 'その他');
  const scored = candidates.map((cat) => {
    const last = lastTrainedByCategory[cat];
    const gap = last ? -daysUntil(last, today) : Number.MAX_SAFE_INTEGER;
    return { cat, gap };
  });
  scored.sort((a, b) => b.gap - a.gap);
  return scored.slice(0, count).map((s) => s.cat);
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/suggest.js test/suggest.test.js
git commit -m "feat: add last-trained-date tracking and body-part suggestion logic"
```

---

## Task 3: 記録タブが初期選択部位を受け取れるようにする（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `categoriesWithExercises`（`../lib/volume.js`、Task 1）
- Produces: `renderWorkout(el, navigate, opts = {})`。`opts.initialPart` が現在の部位一覧に含まれていればそれを初期選択

- [ ] **Step 1: categoriesWithExercisesをimport**

`js/views/workout.js` の6行目を次に置き換え：
```js
import { categoryVolumeForDate, maxCategoryVolumeExcludingDate, categoryKey, categoriesWithExercises, VOLUME_START_DATE } from '../lib/volume.js';
```

- [ ] **Step 2: renderWorkoutのシグネチャを変更**

`js/views/workout.js` の次の行：
```js
export async function renderWorkout(el) {
```
を次に置き換え：
```js
export async function renderWorkout(el, navigate, opts = {}) {
```

- [ ] **Step 3: 部位抽出ロジックを共通関数に置き換え、initialPartに対応**

`js/views/workout.js` の次のブロック：
```js
  const exPartGroups = {};
  for (const e of exercises) {
    const cat = categoryKey(e);
    (exPartGroups[cat] ||= []).push(e);
  }
  const exParts = [
    ...BODY_PARTS.filter((p) => exPartGroups[p]),
    ...Object.keys(exPartGroups).filter((p) => !BODY_PARTS.includes(p)),
  ];
  let currentExPart = exParts[0];
```
を次に置き換え：
```js
  const exPartGroups = {};
  for (const e of exercises) {
    const cat = categoryKey(e);
    (exPartGroups[cat] ||= []).push(e);
  }
  const exParts = categoriesWithExercises(exercises, BODY_PARTS);
  let currentExPart = (opts.initialPart && exParts.includes(opts.initialPart)) ? opts.initialPart : exParts[0];
```

- [ ] **Step 4: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 5: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存テストがそのまま通ること。workout.jsはビュー層のため新規テストなし）

- [ ] **Step 6: コミット**

```bash
git add js/views/workout.js
git commit -m "refactor: reuse categoriesWithExercises and accept initial body-part selection"
```

---

## Task 4: ホーム画面の挨拶＋提案カードとタブ間ナビゲーション連携（app.js / home.js）

**Files:**
- Modify: `js/app.js`
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `categoriesWithExercises`（`../lib/volume.js`、Task 1）、`lastTrainedDateByCategory`/`suggestBodyParts`（`../lib/suggest.js`、Task 2）、`renderWorkout(el, navigate, opts)`（Task 3、`opts.initialPart`）
- Produces: `renderHome(el, navigate)`。`navigate(route, opts)` が `opts` を描画関数に渡す

- [ ] **Step 1: app.jsのnavigateがoptsを渡すよう変更**

`js/app.js` の次のブロック：
```js
async function navigate(route) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route && TAB_ROUTES.includes(route)));
  const render = routes[route] || renderHome;
  await render(el, navigate);
}
```
を次に置き換え：
```js
async function navigate(route, opts) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route && TAB_ROUTES.includes(route)));
  const render = routes[route] || renderHome;
  await render(el, navigate, opts);
}
```

- [ ] **Step 2: home.jsのimportとシグネチャを変更**

`js/views/home.js` の1〜13行目：
```js
import { getAll, get, put, remove } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { daysUntil } from '../lib/countdown.js';
import { formatMinutes } from '../lib/duration.js';
import { escapeHtml } from './exercises.js';
import { renderCalendar } from './calendar.js';
import { openSetEditor } from './set-editor.js';
import { localDateStr } from '../lib/localdate.js';
import { maxCategoryVolumeWithDate, categoryVolumeForDate, categoryKey, setVolume, VOLUME_START_DATE, dailyCategoryVolumes, categoryPRProgression } from '../lib/volume.js';
import { workoutToMarkdown, buildObsidianUri, downloadText } from '../lib/obsidian.js';
import { stepPath } from '../lib/chart.js';

export async function renderHome(el) {
```
を次に置き換え：
```js
import { getAll, get, put, remove } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { daysUntil } from '../lib/countdown.js';
import { formatMinutes } from '../lib/duration.js';
import { escapeHtml, BODY_PARTS } from './exercises.js';
import { renderCalendar } from './calendar.js';
import { openSetEditor } from './set-editor.js';
import { localDateStr } from '../lib/localdate.js';
import { maxCategoryVolumeWithDate, categoryVolumeForDate, categoryKey, setVolume, VOLUME_START_DATE, dailyCategoryVolumes, categoryPRProgression, categoriesWithExercises } from '../lib/volume.js';
import { workoutToMarkdown, buildObsidianUri, downloadText } from '../lib/obsidian.js';
import { stepPath } from '../lib/chart.js';
import { lastTrainedDateByCategory, suggestBodyParts } from '../lib/suggest.js';

export async function renderHome(el, navigate) {
```

- [ ] **Step 3: 挨拶＋提案カードの算出を追加**

`js/views/home.js` の次のブロック：
```js
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
  const maxVol = maxCategoryVolumeWithDate(sets, exById, wkById, VOLUME_START_DATE);
```
を次に置き換え：
```js
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));

  const suggestCategories = categoriesWithExercises(exercises, BODY_PARTS);
  const lastTrained = lastTrainedDateByCategory(sets, exById, wkById);
  const suggested = suggestBodyParts(suggestCategories, lastTrained, new Date());
  const suggestCard = suggested.length
    ? `<div class="card">
        <strong>お帰りなさい。今日はどんなトレーニングをしますか？</strong>
        <div class="row" style="margin-top:10px">
          ${suggested.map((cat) => `<button type="button" class="btn btn-primary" data-suggest-part="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')}
        </div>
      </div>`
    : '';

  const maxVol = maxCategoryVolumeWithDate(sets, exById, wkById, VOLUME_START_DATE);
```

- [ ] **Step 4: テンプレートに提案カードを挿入**

`js/views/home.js` の次のブロック：
```js
  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    <div class="card">
      <strong>トレーニングカレンダー</strong>
      <div id="home-cal" style="margin-top:10px"></div>
      <div id="home-day" style="margin-top:12px"></div>
    </div>
    ${countdownCard}
```
を次に置き換え：
```js
  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    ${suggestCard}
    <div class="card">
      <strong>トレーニングカレンダー</strong>
      <div id="home-cal" style="margin-top:10px"></div>
      <div id="home-day" style="margin-top:12px"></div>
    </div>
    ${countdownCard}
```

- [ ] **Step 5: 提案ボタンのタップでrecordタブに遷移**

`js/views/home.js` の次のブロック：
```js
  renderCalendar(el.querySelector('#home-cal'), {
    trainedDates,
    initialDate: new Date(),
    onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises, nameOf }),
  });
```
を次に置き換え：
```js
  renderCalendar(el.querySelector('#home-cal'), {
    trainedDates,
    initialDate: new Date(),
    onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises, nameOf }),
  });

  el.querySelectorAll('[data-suggest-part]').forEach((b) =>
    b.addEventListener('click', () => navigate('workout', { initialPart: b.dataset.suggestPart })));
```

- [ ] **Step 6: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/app.js && node --check js/views/home.js && echo OK`
Expected: `OK`

- [ ] **Step 7: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 8: ブラウザで動作確認**

preview で、複数部位の種目を登録し、うち1部位だけ直近数日以内にセットを記録した状態にして：
- ホーム画面のカレンダー上部に「お帰りなさい。今日はどんなトレーニングをしますか？」と2つの部位ボタンが表示される
- 直近記録した部位より、記録していない・記録が古い部位が優先的に提案されていること
- 提案ボタンをタップ→記録タブに遷移し、その部位がセグメントボタンで選択された状態で、種目セレクトがその部位の種目に絞り込まれていること
- 種目を一切登録していない状態（`exercises`が空）ではホームに提案カードが表示されないこと（既存の「先に種目を登録してください」動作に影響しないこと）
- その他タブ→メニュー管理・振り返りなど、`navigate`を使う既存の画面遷移が壊れていないこと
- コンソールにエラーが出ていないこと

- [ ] **Step 9: コミット**

```bash
git add js/app.js js/views/home.js
git commit -m "feat: greet and suggest under-trained body parts on home, link to record tab"
```

---

## Task 5: PWAキャッシュ更新

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.jsのキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v18';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v19';
```
`sw.js` の ASSETS 配列内、`'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js', 'js/lib/groupSets.js',` を次に置き換え（`js/lib/suggest.js` を追加）：
```js
  'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js', 'js/lib/groupSets.js', 'js/lib/suggest.js',
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: PWA cache v19 for home suggestion feature"
```

---

## Self-Review チェック結果
- **スペック網羅**：部位抽出共通化（Task1）・提案ロジック（Task2）・記録タブの初期部位対応（Task3）・ホーム挨拶＋提案カード＋タブ遷移（Task4）・PWA更新（Task5）すべてタスク化。種目0件時の非表示・その他除外・同点時の順序保持もすべてテスト化済み。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`categoriesWithExercises(exercises, bodyParts)`→`string[]`、`lastTrainedDateByCategory(sets,exById,wkById)`→`{[cat]:date}`、`suggestBodyParts(categories,lastTrainedByCategory,today,count=2)`→`string[]`が全タスクで一致。`renderWorkout(el, navigate, opts={})`と`renderHome(el, navigate)`のシグネチャがTask3・Task4・`js/app.js`の呼び出し側で一致。`navigate('workout', {initialPart})`のキー名`initialPart`がTask3・Task4で一致。
