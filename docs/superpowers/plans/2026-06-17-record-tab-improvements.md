# 記録タブ改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録タブに重量・回数のステッパー、セット記録/インターバルの分離、本日セットの編集・削除、トレーニング時間・場所・感想の記録を追加し、感想をAI分析に反映する。

**Architecture:** Phase1-3 を踏襲。純粋ロジック（時間整形・プロンプト）を `js/lib/` でテスト。DOM共通部品（ステッパー・セット編集モーダル）を `js/views/` に切り出してDRY化。DBは加算的に version 3。

**Tech Stack:** Vanilla JS (ES Modules), HTML/CSS, IndexedDB, Service Worker, `node:test`。

## Global Constraints
- DB スキーマ変更は加算的（既存データ保持、DB_VERSION=3）
- 設定値はlocalStorage（既定インターバル秒数キー `default_interval_sec`、初期90）
- 純粋ロジックは `js/lib/` に置きユニットテスト、DOM部品はブラウザ確認
- 既存の `get`/`getAll`/`put`/`remove`/`uid`（db.js）シグネチャに準拠

---

## Task 1: 時間整形の純粋ロジック（duration.js）

**Files:**
- Create: `js/lib/duration.js`
- Test: `test/duration.test.js`

**Interfaces:**
- Produces: `formatMinutes(sec) -> string`（秒を「M分」に整形、floor）

- [ ] **Step 1: 失敗するテストを書く**

`test/duration.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinutes } from '../js/lib/duration.js';

test('formatMinutes floors seconds to minutes', () => {
  assert.equal(formatMinutes(0), '0分');
  assert.equal(formatMinutes(59), '0分');
  assert.equal(formatMinutes(60), '1分');
  assert.equal(formatMinutes(3600), '60分');
});

test('formatMinutes handles invalid input as 0', () => {
  assert.equal(formatMinutes(undefined), '0分');
  assert.equal(formatMinutes(-5), '0分');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`duration.js` が存在しない）

- [ ] **Step 3: duration.js を実装**

`js/lib/duration.js`:
```js
// 秒を「M分」に整形（floor、不正・負値は0分）
export function formatMinutes(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return '0分';
  return `${Math.floor(s / 60)}分`;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/duration.js test/duration.test.js
git commit -m "feat: add formatMinutes duration logic with tests"
```

---

## Task 2: Gemini プロンプトに感想を追加

**Files:**
- Modify: `js/lib/gemini.js`
- Modify: `test/gemini.test.js`

**Interfaces:**
- Consumes: `buildInsightPrompt(stats)`（既存）
- Produces: `buildInsightPrompt(stats)` が `stats.workoutNotes`（string[]）をプロンプトに含める

- [ ] **Step 1: テストに感想ケースを追加**

`test/gemini.test.js` の最初の `test('buildInsightPrompt includes PR and tag stats', ...)` の直後に追加：
```js
test('buildInsightPrompt includes workout notes', () => {
  const stats = {
    prs: [], tagFreq: [], scoreCorr: [], recentCount: 3,
    workoutNotes: ['今日は調子が良かった', '腰に張りがある'],
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /今日は調子が良かった/);
  assert.match(p, /腰に張りがある/);
  assert.match(p, /感想/);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（感想がプロンプトに含まれない）

- [ ] **Step 3: buildInsightPrompt を更新**

`js/lib/gemini.js` の `buildInsightPrompt` を次に置き換え：
```js
export function buildInsightPrompt(stats) {
  const prs = (stats.prs || []).map((p) => `- ${p.name}: 推定1RM ${p.pr.toFixed(1)}kg`).join('\n');
  const tags = (stats.tagFreq || []).map((t) => `- ${t.tag}（${t.count}回）`).join('\n');
  const corr = (stats.scoreCorr || [])
    .map((c) => `- ${c.tag}: 品質スコアが${c.direction === 'lower' ? '低い' : '高い'}傾向`)
    .join('\n');
  const notes = (stats.workoutNotes || []).map((n) => `- ${n}`).join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下のトレーニング記録の傾向を踏まえ、弱点の克服に向けた具体的な改善提案を3つ、簡潔な日本語で提示してください。',
    'ストレッチ・フォーム・インターバル・重量設定など実践的な内容にしてください。',
    '',
    `直近の記録セット数: ${stats.recentCount || 0}`,
    '【種目別PR】', prs || '（なし）',
    '【よく使うタグ】', tags || '（なし）',
    '【タグと品質スコアの傾向】', corr || '（なし）',
    '【最近の感想】', notes || '（なし）',
  ].join('\n');
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/gemini.js test/gemini.test.js
git commit -m "feat: include workout notes in Gemini insight prompt"
```

---

## Task 3: DB スキーマ拡張（version 3・places ストア）

**Files:**
- Modify: `js/db.js`

**Interfaces:**
- Produces: 新ストア `places` が利用可能（`get`/`getAll`/`put`/`remove` 経由）

- [ ] **Step 1: STORES と DB_VERSION を更新**

`js/db.js` 冒頭の定数を次に置き換え：
```js
const DB_NAME = 'gachi-fit';
const DB_VERSION = 3;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs', 'photos', 'goals', 'bodyWeights', 'setPatterns', 'places'];
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/db.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/db.js
git commit -m "feat: extend DB schema to v3 with places store"
```

---

## Task 4: ステッパー共通部品（components.js）

**Files:**
- Create: `js/views/components.js`

**Interfaces:**
- Produces: `createStepper(container, { value, step, min, onChange }) -> { get: () => number, set: (v) => void }`
  - `container` 要素の innerHTML に `[−] <input> [＋]` を描画。`get()` は現在値（数値）、`set(v)` で値更新。値変更時に `onChange(value)` を呼ぶ。

> DOM部品のためユニットテストせず、Task 8 のブラウザ確認でカバーする。

- [ ] **Step 1: components.js を実装**

`js/views/components.js`:
```js
// [−] 数値input [＋] のステッパーを container に描画する
export function createStepper(container, { value = 0, step = 1, min = 0, onChange } = {}) {
  container.classList.add('stepper');
  container.innerHTML = `
    <button type="button" class="stepper-btn" data-dir="-1">−</button>
    <input class="stepper-input" type="number" inputmode="decimal" value="${value}" />
    <button type="button" class="stepper-btn" data-dir="1">＋</button>`;
  const input = container.querySelector('.stepper-input');
  const fix = (n) => Math.round(n * 100) / 100;
  const read = () => { const n = parseFloat(input.value); return Number.isFinite(n) ? n : 0; };
  const emit = () => onChange && onChange(read());
  container.querySelectorAll('.stepper-btn').forEach((b) =>
    b.addEventListener('click', () => {
      let n = read() + step * Number(b.dataset.dir);
      if (n < min) n = min;
      input.value = fix(n);
      emit();
    }));
  input.addEventListener('input', emit);
  return {
    get: read,
    set: (v) => { input.value = v; },
  };
}
```

- [ ] **Step 2: ステッパーのスタイルを追加**

`css/style.css` の末尾に追加：
```css
.stepper { display: flex; align-items: stretch; gap: 8px; }
.stepper-btn { flex: 0 0 56px; min-height: var(--tap); font-size: 26px; font-weight: 800;
  border: 1px solid #2c2c2c; border-radius: 12px; background: var(--surface-2); color: var(--text); cursor: pointer; }
.stepper-input { flex: 1; min-width: 0; text-align: center; min-height: var(--tap);
  background: var(--surface-2); border: 1px solid #2c2c2c; border-radius: 12px; color: var(--text);
  font-size: 22px; font-weight: 700; }
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/components.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/components.js css/style.css
git commit -m "feat: add reusable stepper component"
```

---

## Task 5: セット編集モーダルの共通化（set-editor.js）

**Files:**
- Create: `js/views/set-editor.js`
- Modify: `js/views/review.js`

**Interfaces:**
- Consumes: `createStepper`（Task 4）、`SENSORY_TAGS`（workout.js, 既存 export）
- Produces: `openSetEditor(setId, onDone)` — body にモーダルを追加し、保存/削除後に `onDone()` を呼ぶ

- [ ] **Step 1: set-editor.js を実装**

`js/views/set-editor.js`:
```js
import { get, getAll, put, uid } from '../db.js';
import { estimate1RM, sensoryScore } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';
import { SENSORY_TAGS } from './workout.js';
import { createStepper } from './components.js';

// セット編集モーダルを開く。保存/キャンセルで閉じ、変更時に onDone() を呼ぶ。
export async function openSetEditor(setId, onDone) {
  const set = await get('sets', setId);
  const logs = await getAll('sensoryLogs');
  const log = logs.find((l) => l.setId === setId) || { core: 3, muscleLoad: 3, rom: 'full', tags: [], note: '' };
  const tagSet = new Set(log.tags || []);

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:10;background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">セット編集</h2>
    <div class="field"><label>重量(kg)</label><div id="e-weight"></div></div>
    <div class="field"><label>回数</label><div id="e-reps"></div></div>
    <div class="field"><label>腹圧保持(1-5)</label><input id="e-core" class="input" type="number" min="1" max="5" value="${log.core}" /></div>
    <div class="field"><label>対象筋への負荷(1-5)</label><input id="e-load" class="input" type="number" min="1" max="5" value="${log.muscleLoad}" /></div>
    <div class="field"><label>可動域 ROM</label>
      <div class="seg" id="e-rom">
        <button data-v="full" class="${log.rom === 'full' ? 'sel' : ''}">フル</button>
        <button data-v="partial" class="${log.rom === 'partial' ? 'sel' : ''}">部分</button>
        <button data-v="cheating" class="${log.rom === 'cheating' ? 'sel' : ''}">チーティング</button>
      </div></div>
    <div class="field"><label>定型タグ</label><div id="e-tags">
      ${SENSORY_TAGS.map((t) => `<button type="button" class="chip chip-tag ${tagSet.has(t) ? 'sel' : ''}" data-tag="${t}">${t}</button>`).join('')}
    </div></div>
    <div class="field"><label>メモ</label><input id="e-note" class="input" value="${escapeHtml(log.note || '')}" /></div>
    <div id="e-error" class="error"></div>
    <button id="e-save" class="btn btn-primary btn-block">保存</button>
    <button id="e-cancel" class="btn btn-block" style="margin-top:8px">キャンセル</button>`;
  document.body.appendChild(modal);

  const weightStepper = createStepper(modal.querySelector('#e-weight'), { value: set.weight, step: 2.5, min: 0 });
  const repsStepper = createStepper(modal.querySelector('#e-reps'), { value: set.reps, step: 1, min: 0 });

  let rom = log.rom;
  modal.querySelectorAll('#e-rom button').forEach((bb) =>
    bb.addEventListener('click', () => {
      modal.querySelectorAll('#e-rom button').forEach((x) => x.classList.remove('sel'));
      bb.classList.add('sel'); rom = bb.dataset.v;
    }));
  modal.querySelectorAll('#e-tags .chip-tag').forEach((bb) =>
    bb.addEventListener('click', () => {
      const t = bb.dataset.tag;
      if (tagSet.has(t)) { tagSet.delete(t); bb.classList.remove('sel'); }
      else { tagSet.add(t); bb.classList.add('sel'); }
    }));

  modal.querySelector('#e-cancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#e-save').addEventListener('click', async () => {
    const weight = weightStepper.get();
    const reps = repsStepper.get();
    const core = parseInt(modal.querySelector('#e-core').value, 10);
    const load = parseInt(modal.querySelector('#e-load').value, 10);
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    set.weight = weight; set.reps = reps; set.estimated1RM = estimate1RM(weight, reps);
    await put('sets', set);
    const newLog = { id: log.id || uid(), setId, core, muscleLoad: load, rom,
      score: sensoryScore({ core, muscleLoad: load, rom }),
      note: modal.querySelector('#e-note').value, tags: [...tagSet] };
    await put('sensoryLogs', newLog);
    modal.remove();
    onDone && onDone();
  });
}
```

- [ ] **Step 2: review.js を set-editor 利用に変更**

`js/views/review.js` の import 群から `import { estimate1RM, sensoryScore } from '../lib/calc.js';` と `import { SENSORY_TAGS } from './workout.js';` を削除し、先頭に追加：
```js
import { openSetEditor } from './set-editor.js';
```
`review.js` 内の `b.addEventListener('click', () => openEditor(el, b.dataset.edit))` を次に置き換え：
```js
    b.addEventListener('click', () => openSetEditor(b.dataset.edit, () => renderReview(el))));
```
さらに `review.js` 末尾の `async function openEditor(el, setId) { ... }` 関数全体を削除する。

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/set-editor.js && node --check js/views/review.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/set-editor.js js/views/review.js
git commit -m "refactor: extract shared set editor module with stepper inputs"
```

---

## Task 6: メニュー管理に場所の登録を追加（exercises.js）

**Files:**
- Modify: `js/views/exercises.js`

**Interfaces:**
- Consumes: `getAll`/`put`/`remove`/`uid`（既存 import）
- Produces: `places` ストアの CRUD UI（メニュー管理画面）

- [ ] **Step 1: 場所セクションの描画を追加**

`js/views/exercises.js` の `renderExercises` 内、`<div id="ex-list"></div>` を次に置き換え：
```js
    <div id="ex-list"></div>
    <div class="card">
      <strong>場所の登録</strong>
      <div class="row" style="margin-top:8px">
        <input id="pl-name" class="input" placeholder="例: 〇〇ジム 渋谷店" />
        <button id="pl-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="pl-list"></div>
    </div>`;
```

- [ ] **Step 2: 場所の追加・一覧・削除・編集を実装**

`js/views/exercises.js` の `renderList(el, exercises);` 行の直後に追加：
```js
  async function renderPlaces() {
    const places = await getAll('places');
    el.querySelector('#pl-list').innerHTML = places.map((p) => `
      <div class="list-item">
        <span>${escapeHtml(p.name)}</span>
        <span>
          <button class="btn btn-edit" data-pl-edit="${p.id}" style="min-height:40px;padding:0 12px">編集</button>
          <button class="btn btn-danger" data-pl-del="${p.id}" style="min-height:40px;padding:0 12px">削除</button>
        </span>
      </div>`).join('') || '<p class="muted">場所がありません。</p>';
    el.querySelectorAll('[data-pl-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('places', b.dataset.plDel); renderPlaces(); }));
    el.querySelectorAll('[data-pl-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = (await getAll('places')).find((x) => x.id === b.dataset.plEdit);
        const name = prompt('場所名を編集', p.name);
        if (name && name.trim()) { p.name = name.trim(); await put('places', p); renderPlaces(); }
      }));
  }
  el.querySelector('#pl-add').addEventListener('click', async () => {
    const name = el.querySelector('#pl-name').value.trim();
    if (!name) return;
    await put('places', { id: uid(), name });
    el.querySelector('#pl-name').value = '';
    renderPlaces();
  });
  renderPlaces();
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/exercises.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/exercises.js
git commit -m "feat: add place management to menu screen"
```

---

## Task 7: 設定に既定インターバル秒数を追加（settings.js）

**Files:**
- Modify: `js/views/settings.js`

**Interfaces:**
- Produces: localStorage キー `default_interval_sec`（数値文字列、初期90）の保存UI

- [ ] **Step 1: 既定秒数カードを追加**

`js/views/settings.js` の `renderSettings` 内、最初の `<div class="card">`（Gemini APIキー）の **直前** に挿入する。`el.innerHTML = ` テンプレート内 `<h2 class="view-title">設定</h2>` の直後に追加：
```js

    <div class="card">
      <strong>既定インターバル秒数</strong>
      <p class="muted">記録タブのインターバルの初期値。</p>
      <input id="s-int" type="number" class="input" value="${localStorage.getItem('default_interval_sec') || '90'}" min="1" max="600" />
      <button id="s-int-save" class="btn btn-primary btn-block" style="margin-top:10px">秒数を保存</button>
    </div>
```

- [ ] **Step 2: 保存ハンドラを追加**

`js/views/settings.js` の `el.querySelector('#s-key-save').addEventListener(...)` ブロックの直前に追加：
```js
  el.querySelector('#s-int-save').addEventListener('click', () => {
    const v = parseInt(el.querySelector('#s-int').value, 10);
    if (v >= 1 && v <= 600) {
      localStorage.setItem('default_interval_sec', String(v));
      el.querySelector('#s-msg').textContent = '既定インターバル秒数を保存しました。';
    } else {
      el.querySelector('#s-msg').textContent = '1〜600の範囲で入力してください。';
    }
  });
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/settings.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/settings.js
git commit -m "feat: add default interval seconds setting"
```

---

## Task 8: 記録タブの全面改修（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `createStepper`（Task 4）、`openSetEditor`（Task 5）、`formatTime`（timer.js）、`formatMinutes`（Task 1）、`places` ストア（Task 3）
- Produces: `renderWorkout(el)`、`SENSORY_TAGS`（export 維持）

- [ ] **Step 1: workout.js 全体を置き換え**

`js/views/workout.js` 全体を次に置き換え：
```js
import { getAll, get, put, remove, uid } from '../db.js';
import { estimate1RM, sensoryScore, computePRs } from '../lib/calc.js';
import { createTimer, formatTime } from '../timer.js';
import { formatMinutes } from '../lib/duration.js';
import { escapeHtml } from './exercises.js';
import { createStepper } from './components.js';
import { openSetEditor } from './set-editor.js';

export const SENSORY_TAGS = ['調子良い', '腹圧抜けた', 'フォーム崩れ', '対象筋に効いた', '関節に違和感', '軽く感じた'];

let intervalTimer;
let durationTicker;

const todayStr = () => new Date().toISOString().slice(0, 10);

async function patchTodayWorkout(patch = {}) {
  const today = todayStr();
  const workouts = await getAll('workouts');
  let w = workouts.find((x) => x.date === today);
  if (!w) w = { id: uid(), date: today, note: '' };
  Object.assign(w, patch);
  await put('workouts', w);
  return w;
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
      <div class="field"><label>場所</label>
        <select id="w-place" class="input">
          <option value="">未選択</option>
          ${places.map((p) => `<option value="${p.id}" ${todayWorkout && todayWorkout.placeId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input">
          ${exercises.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>

    <div class="card">
      <div class="field"><label>重量(kg)</label><div id="w-weight"></div></div>
      <div class="field"><label>回数</label><div id="w-reps"></div></div>
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
      <strong>トレーニング時間</strong>
      <div id="w-dur" class="muted" style="margin-top:8px">${todayWorkout && todayWorkout.durationSec ? '記録: ' + formatMinutes(todayWorkout.durationSec) : '未記録'}</div>
      <div class="row" style="margin-top:8px">
        <button id="w-dur-start" class="btn btn-primary">開始</button>
        <button id="w-dur-stop" class="btn">終了</button>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="w-dur-min" type="number" class="input" placeholder="分（手動）" />
        <button id="w-dur-save" class="btn" style="flex:0 0 auto">手動保存</button>
      </div>
    </div>

    <div class="card">
      <strong>本日の感想</strong>
      <p class="muted">AI分析の対象になります。</p>
      <textarea id="w-impression" class="input" rows="3" style="resize:vertical">${todayWorkout ? escapeHtml(todayWorkout.note || '') : ''}</textarea>
      <button id="w-impression-save" class="btn btn-block" style="margin-top:8px">感想を保存</button>
    </div>

    <div class="card"><strong>本日のセット</strong><div id="w-today"></div></div>`;

  const state = { core: null, load: null, rom: 'full', tags: new Set(), note: '', interval: defaultSec };

  const weightStepper = createStepper(el.querySelector('#w-weight'), { value: 0, step: 2.5, min: 0, onChange: refresh1RM });
  const repsStepper = createStepper(el.querySelector('#w-reps'), { value: 0, step: 1, min: 0, onChange: refresh1RM });

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
    el.querySelector('#w-1rm').textContent =
      w > 0 && r > 0 ? estimate1RM(w, r).toFixed(1) + 'kg' : '-';
  }

  el.querySelector('#w-ex').addEventListener('change', refreshPR);
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

  // 場所
  el.querySelector('#w-place').addEventListener('change', async (e) => {
    await patchTodayWorkout({ placeId: e.target.value || null });
  });

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

  // トレーニング時間
  function stopDurationTicker() { if (durationTicker) { clearInterval(durationTicker); durationTicker = null; } }
  el.querySelector('#w-dur-start').addEventListener('click', async () => {
    const w = await patchTodayWorkout({ startedAt: Date.now() });
    stopDurationTicker();
    const durEl = el.querySelector('#w-dur');
    durationTicker = setInterval(() => {
      durEl.textContent = '計測中: ' + formatTime(Math.floor((Date.now() - w.startedAt) / 1000));
    }, 1000);
  });
  el.querySelector('#w-dur-stop').addEventListener('click', async () => {
    stopDurationTicker();
    const today = todayStr();
    const w = (await getAll('workouts')).find((x) => x.date === today);
    if (w && w.startedAt) {
      const sec = Math.floor((Date.now() - w.startedAt) / 1000);
      await patchTodayWorkout({ durationSec: sec });
      el.querySelector('#w-dur').textContent = '記録: ' + formatMinutes(sec);
    }
  });
  el.querySelector('#w-dur-save').addEventListener('click', async () => {
    const min = parseFloat(el.querySelector('#w-dur-min').value);
    if (!(min >= 0)) return;
    const sec = Math.round(min * 60);
    await patchTodayWorkout({ durationSec: sec });
    el.querySelector('#w-dur').textContent = '記録: ' + formatMinutes(sec);
  });

  // 感想
  el.querySelector('#w-impression-save').addEventListener('click', async () => {
    await patchTodayWorkout({ note: el.querySelector('#w-impression').value });
    el.querySelector('#w-dur'); // no-op anchor
    el.querySelector('#w-impression-save').textContent = '保存しました';
    setTimeout(() => { el.querySelector('#w-impression-save').textContent = '感想を保存'; }, 1500);
  });

  // セット記録（保存のみ・タイマー起動しない）
  el.querySelector('#w-save').addEventListener('click', async () => {
    const err = el.querySelector('#w-error');
    const weight = weightStepper.get();
    const reps = repsStepper.get();
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    if (state.core === null || state.load === null) { err.textContent = '腹圧と対象筋負荷を選択してください'; return; }
    err.textContent = '';
    const exerciseId = el.querySelector('#w-ex').value;
    const workout = await patchTodayWorkout();
    const est = estimate1RM(weight, reps);
    const setId = uid();
    await put('sets', { id: setId, workoutId: workout.id, exerciseId, weight, reps,
      estimated1RM: est, targetWeight: prs[exerciseId] || null, createdAt: Date.now() });
    const score = sensoryScore({ core: state.core, muscleLoad: state.load, rom: state.rom });
    await put('sensoryLogs', { id: uid(), setId, core: state.core, muscleLoad: state.load,
      rom: state.rom, score, note: state.note, tags: [...state.tags] });
    state.tags.clear();
    state.note = '';
    el.querySelectorAll('#w-tags .chip-tag').forEach((b) => b.classList.remove('sel'));
    el.querySelector('#w-note').value = '';
    await renderToday(el, exercises);
  });

  refreshPR();
  await renderToday(el, exercises);
}

function seg(n) {
  return Array.from({ length: n }, (_, i) => `<button data-v="${i + 1}">${i + 1}</button>`).join('');
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
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}<br>
        <span class="muted" style="font-size:12px">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span></span>
      <span>
        <button class="btn btn-edit" data-edit="${s.id}" style="min-height:40px;padding:0 12px">編集</button>
        <button class="btn btn-danger" data-del="${s.id}" style="min-height:40px;padding:0 12px">削除</button>
      </span>
    </div>`;
  }).join('') || '<p class="muted">まだ記録なし</p>';

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

- [ ] **Step 3: ブラウザ確認**

サーバ起動中の preview をリロードし、記録タブで以下を確認：
- 重量・回数が −/＋ ステッパーで増減でき、推定1RMが更新される
- 「セット記録」でタイマーが起動しないこと、本日のセットに追加され編集/削除できること
- 「インターバル」で秒数選択→開始でカウントダウン、停止で止まること
- 「トレーニング時間」開始で計測表示→終了で「記録: N分」、手動保存も反映
- 場所セレクト変更が保持される（タブ移動して戻ると選択維持）
- 感想を保存できること

- [ ] **Step 4: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: revamp workout tab with steppers, separate interval, inline edit, time/place/impression"
```

---

## Task 9: AI分析に感想を渡す（insights.js）

**Files:**
- Modify: `js/views/insights.js`

**Interfaces:**
- Consumes: `buildInsightPrompt`（Task 2 で workoutNotes 対応）、`getAll('workouts')`

- [ ] **Step 1: 感想収集を AI 統計に追加**

`js/views/insights.js` の AI 分析ハンドラ内、`const stats = {` のオブジェクトに `workoutNotes` を追加する。`const exercises = await getAll('exercises');` の直後に追加：
```js
        const workouts = (await getAll('workouts')).sort((a, b) => (a.date < b.date ? 1 : -1));
        const workoutNotes = workouts.map((w) => w.note).filter((n) => n && n.trim()).slice(0, 10);
```
そして `recentCount: recent.length,` の直後に追加：
```js
          workoutNotes,
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/insights.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/views/insights.js
git commit -m "feat: feed workout impressions into AI analysis"
```

---

## Task 10: PWA キャッシュ更新・README・全体確認

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

- [ ] **Step 1: sw.js のキャッシュ資産と版を更新**

`sw.js` の `CACHE` と `ASSETS` を次に置き換え：
```js
const CACHE = 'gachi-fit-v4';
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js',
  'js/lib/calc.js', 'js/lib/chart.js', 'js/lib/insights.js',
  'js/lib/gemini.js', 'js/lib/countdown.js', 'js/lib/seed.js', 'js/lib/image.js', 'js/lib/duration.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js',
  'js/views/history.js', 'js/views/insights.js', 'js/views/review.js', 'js/views/settings.js',
  'js/views/body.js', 'js/views/more.js', 'js/views/components.js', 'js/views/set-editor.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];
```

- [ ] **Step 2: README の機能セクションを更新**

`README.md` の `## 機能` リストの末尾に追加：
```markdown
- 記録タブ: 重量/回数ステッパー、独立インターバル、本日セットの編集/削除、トレーニング時間・場所・感想の記録
```

- [ ] **Step 3: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（calc 5 + chart 4 + insights 4 + countdown 4 + seed 2 + gemini 4 + duration 2 = 25 tests）

- [ ] **Step 4: 全フロー手動確認**

preview で：その他→メニュー管理で場所登録 → 設定で既定インターバル秒数変更 → 記録タブでステッパー記録・インターバル・時間・場所・感想 → 本日セット編集/削除 → 振り返りタブ編集（共通エディタ）→ インサイトでAI分析（感想反映）→ リロードでデータ永続を確認。

- [ ] **Step 5: コミット**

```bash
git add sw.js README.md
git commit -m "chore: update PWA cache v4 and README for record tab improvements"
```

---

## Self-Review チェック結果
- **スペック網羅**：ステッパー(T4,T8)/セット記録・インターバル分離(T8)/本日セット編集削除(T5,T8)/トレーニング時間(T1,T8)/場所(T3,T6,T8)/感想＋AI(T2,T8,T9)/既定秒数設定(T7)/PWA(T10) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`createStepper(container,{value,step,min,onChange})→{get,set}`、`openSetEditor(setId,onDone)`、`formatMinutes(sec)`、`patchTodayWorkout(patch)`、`bindSeg(el,sel,cb,initial,attr)`（attr追加・既存呼び出しは默认'v'で互換）、`places` ストア、workout の `placeId`/`durationSec`/`startedAt`/`note`、localStorage `default_interval_sec`、`buildInsightPrompt` の `workoutNotes` が全タスクで一致。`SENSORY_TAGS` は workout.js から export 維持し set-editor.js が import。
