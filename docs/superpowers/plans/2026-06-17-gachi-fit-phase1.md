# GACHI-FIT Phase1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 中・上級トレーニー向け「感覚同期型」トレーニング記録 PWA のコア機能（カスタムメニュー・セット記録・RM自動計算・Sensory Log・インターバルタイマー）を構築する。

**Architecture:** Vanilla JS の ES モジュール構成。純粋ロジック（1RM計算・スコア算出・PR算出）を `lib/` に分離してユニットテスト可能にし、IndexedDB アクセスを `db.js` に集約。UI は SPA で下部タブ切替。PWA 化で完全オフライン動作。

**Tech Stack:** Vanilla JS (ES Modules), HTML/CSS, IndexedDB, Service Worker + manifest.json, テストは Node.js 標準 `node:test`。

---

## File Structure

- `index.html` — SPA ルート、下部タブ・各ビューのコンテナ
- `css/style.css` — 黒×ライム、大型タップUIのスタイル
- `js/lib/calc.js` — 純粋ロジック：`estimate1RM`, `sensoryScore`, `computePRs`
- `js/db.js` — IndexedDB ラッパー（exercises/workouts/sets/sensoryLogs CRUD）
- `js/timer.js` — インターバルタイマー（状態管理 + コールバック）
- `js/views/home.js` — ホームビュー描画
- `js/views/workout.js` — 記録ビュー（セット入力・Sensory Log・タイマー連動）
- `js/views/exercises.js` — メニュー管理ビュー
- `js/views/history.js` — 履歴／PRビュー
- `js/app.js` — ルーティング・タブ切替・初期化
- `manifest.json` / `sw.js` — PWA
- `test/calc.test.js` — calc.js のユニットテスト
- `package.json` — テストスクリプト

---

## Task 1: プロジェクト雛形と純粋ロジック（calc.js）

**Files:**
- Create: `package.json`
- Create: `js/lib/calc.js`
- Test: `test/calc.test.js`

- [ ] **Step 1: package.json 作成**

```json
{
  "name": "gachi-fit",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/calc.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate1RM, sensoryScore, computePRs } from '../js/lib/calc.js';

test('estimate1RM uses Epley formula', () => {
  // 100kg x 8reps => 100 * (1 + 8/30) = 126.67
  assert.ok(Math.abs(estimate1RM(100, 8) - 126.6667) < 0.01);
  assert.equal(estimate1RM(100, 1), 100 + 100 / 30);
});

test('estimate1RM returns weight for 0 reps guard', () => {
  assert.equal(estimate1RM(80, 0), 80);
});

test('sensoryScore weights core and rom', () => {
  // core=4, muscleLoad=5, rom full(1.0)
  // V=muscleLoad=5, I=romFactor=1.0, Wform=1, Wcore? formula: muscleLoad*Wform + core*Wcore
  const s = sensoryScore({ core: 4, muscleLoad: 5, rom: 'full' });
  assert.equal(s, 5 * 1 * 1.0 + 4 * 1.0); // 9
});

test('sensoryScore reduces score for partial/cheating rom', () => {
  const full = sensoryScore({ core: 3, muscleLoad: 3, rom: 'full' });
  const partial = sensoryScore({ core: 3, muscleLoad: 3, rom: 'partial' });
  const cheating = sensoryScore({ core: 3, muscleLoad: 3, rom: 'cheating' });
  assert.ok(full > partial && partial > cheating);
});

test('computePRs returns max estimated1RM per exercise', () => {
  const sets = [
    { exerciseId: 'a', weight: 100, reps: 5 },
    { exerciseId: 'a', weight: 110, reps: 3 },
    { exerciseId: 'b', weight: 60, reps: 10 },
  ];
  const prs = computePRs(sets);
  assert.ok(Math.abs(prs.a - estimate1RM(110, 3)) < 0.01);
  assert.ok(Math.abs(prs.b - estimate1RM(60, 10)) < 0.01);
});
```

- [ ] **Step 3: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`calc.js` が存在しない / 関数未定義）

- [ ] **Step 4: calc.js を実装**

`js/lib/calc.js`:
```js
// 推定1RM（Epley式）: weight * (1 + reps/30)
export function estimate1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (r <= 0) return w;
  return w * (1 + r / 30);
}

// ROM係数
const ROM_FACTOR = { full: 1.0, partial: 0.7, cheating: 0.4 };

// セット品質スコア: muscleLoad*Wform + core*Wcore（romで重み調整）
// Score = Σ ( V_volume × W_form + I_intensity × W_core )
// V=muscleLoad, W_form=romFactor, I=core, W_core=1.0
export function sensoryScore({ core = 0, muscleLoad = 0, rom = 'full' } = {}) {
  const romFactor = ROM_FACTOR[rom] ?? 1.0;
  const wCore = 1.0;
  return muscleLoad * romFactor + core * wCore;
}

// 種目ごとの最大推定1RM
export function computePRs(sets = []) {
  const prs = {};
  for (const s of sets) {
    const e = estimate1RM(s.weight, s.reps);
    if (prs[s.exerciseId] === undefined || e > prs[s.exerciseId]) {
      prs[s.exerciseId] = e;
    }
  }
  return prs;
}
```

- [ ] **Step 5: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS（全テスト green）

- [ ] **Step 6: コミット**

```bash
git add package.json js/lib/calc.js test/calc.test.js
git commit -m "feat: add pure calc logic (1RM, sensory score, PRs) with tests"
```

---

## Task 2: IndexedDB ラッパー（db.js）

**Files:**
- Create: `js/db.js`

> ブラウザ専用（IndexedDB）のためユニットテストはせず、UI統合で動作確認する。

- [ ] **Step 1: db.js を実装**

`js/db.js`:
```js
const DB_NAME = 'gachi-fit';
const DB_VERSION = 1;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode) {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function put(store, value) {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = os.put(value);
    r.onsuccess = () => resolve(value);
    r.onerror = () => reject(r.error);
  });
}

export async function getAll(store) {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = os.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function get(store, id) {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = os.get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function remove(store, id) {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = os.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
```

- [ ] **Step 2: コミット**

```bash
git add js/db.js
git commit -m "feat: add IndexedDB wrapper"
```

---

## Task 3: インターバルタイマー（timer.js）

**Files:**
- Create: `js/timer.js`

- [ ] **Step 1: timer.js を実装**

`js/timer.js`:
```js
// 残り秒のカウントダウン。onTick(remaining)/onDone を呼ぶ。
export function createTimer({ onTick, onDone } = {}) {
  let intervalId = null;
  let remaining = 0;

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function start(seconds) {
    stop();
    remaining = seconds;
    onTick?.(remaining);
    intervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        stop();
        onTick?.(0);
        onDone?.();
      } else {
        onTick?.(remaining);
      }
    }, 1000);
  }

  return {
    start,
    stop,
    isRunning: () => intervalId !== null,
    getRemaining: () => remaining,
  };
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 2: コミット**

```bash
git add js/timer.js
git commit -m "feat: add interval timer module"
```

---

## Task 4: アプリ骨格・ルーティング・スタイル

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js`
- Create: `js/views/home.js` (スタブ)

- [ ] **Step 1: index.html を作成**

`index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0a0a" />
  <link rel="manifest" href="manifest.json" />
  <title>GACHI-FIT</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header class="app-header"><span class="logo">GACHI<span class="accent">-FIT</span></span></header>
  <main id="view"></main>
  <nav class="tabbar">
    <button data-route="home" class="tab active">ホーム</button>
    <button data-route="workout" class="tab">記録</button>
    <button data-route="exercises" class="tab">メニュー</button>
    <button data-route="history" class="tab">履歴</button>
  </nav>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: css/style.css を作成**

`css/style.css`:
```css
:root {
  --bg: #0a0a0a;
  --surface: #161616;
  --surface-2: #1f1f1f;
  --text: #f5f5f5;
  --muted: #9a9a9a;
  --accent: #ccff00;
  --danger: #ff5252;
  --tap: 56px;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
body { padding-bottom: 72px; }
.app-header { padding: 14px 16px; border-bottom: 1px solid #222; }
.logo { font-weight: 800; font-size: 20px; letter-spacing: .5px; }
.accent { color: var(--accent); }
#view { padding: 16px; }
h2.view-title { font-size: 22px; margin: 4px 0 16px; }
.card { background: var(--surface); border: 1px solid #242424; border-radius: 14px;
  padding: 16px; margin-bottom: 14px; }
.muted { color: var(--muted); }
.btn { display: inline-flex; align-items: center; justify-content: center;
  min-height: var(--tap); padding: 0 18px; border-radius: 12px; border: none;
  font-size: 16px; font-weight: 700; background: var(--surface-2); color: var(--text); cursor: pointer; }
.btn-primary { background: var(--accent); color: #0a0a0a; }
.btn-block { display: flex; width: 100%; }
.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.field { margin-bottom: 12px; }
.field label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
.input { width: 100%; min-height: var(--tap); background: var(--surface-2);
  border: 1px solid #2c2c2c; border-radius: 12px; color: var(--text);
  font-size: 18px; padding: 0 14px; }
.seg { display: flex; gap: 8px; }
.seg button { flex: 1; min-height: var(--tap); border-radius: 12px; border: 1px solid #2c2c2c;
  background: var(--surface-2); color: var(--text); font-size: 16px; font-weight: 700; cursor: pointer; }
.seg button.sel { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }
.row { display: flex; gap: 10px; }
.row > * { flex: 1; }
.pr-badge { color: var(--accent); font-weight: 800; }
.error { color: var(--danger); font-size: 13px; margin-top: 6px; }
.tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex;
  background: #0d0d0d; border-top: 1px solid #222; padding-bottom: env(safe-area-inset-bottom); }
.tab { flex: 1; min-height: 60px; background: none; border: none; color: var(--muted);
  font-size: 13px; font-weight: 700; cursor: pointer; }
.tab.active { color: var(--accent); }
.timer-big { font-size: 64px; font-weight: 800; text-align: center; color: var(--accent);
  font-variant-numeric: tabular-nums; }
.list-item { display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid #1f1f1f; }
.chip { display: inline-block; background: var(--surface-2); border-radius: 999px;
  padding: 4px 10px; font-size: 12px; margin: 2px 4px 2px 0; color: var(--muted); }
```

- [ ] **Step 3: home.js スタブを作成**

`js/views/home.js`:
```js
export async function renderHome(el) {
  el.innerHTML = `<h2 class="view-title">ホーム</h2>
    <div class="card"><p class="muted">ようこそ。下部タブから記録を開始できます。</p></div>`;
}
```

- [ ] **Step 4: app.js を作成**

`js/app.js`:
```js
import { renderHome } from './views/home.js';

const routes = { home: renderHome };

async function navigate(route) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route));
  const render = routes[route] || renderHome;
  await render(el);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

navigate('home');
```

- [ ] **Step 5: ブラウザで動作確認**

`cd /Users/taichi/gachi-fit && python3 -m http.server 8765` を起動し、preview_start で `http://localhost:8765` を開く。ホーム表示とタブ表示を確認。

- [ ] **Step 6: コミット**

```bash
git add index.html css/style.css js/app.js js/views/home.js
git commit -m "feat: add app shell, routing, and base styles"
```

---

## Task 5: メニュー管理ビュー（exercises.js）

**Files:**
- Create: `js/views/exercises.js`
- Modify: `js/app.js`（ルート登録）

- [ ] **Step 1: exercises.js を実装**

`js/views/exercises.js`:
```js
import { getAll, put, remove, uid } from '../db.js';

const SET_PATTERNS = ['通常', 'ピラミッド', 'ドロップ', 'レストポーズ'];

export async function renderExercises(el) {
  const exercises = await getAll('exercises');
  el.innerHTML = `
    <h2 class="view-title">メニュー管理</h2>
    <div class="card">
      <div class="field"><label>種目名</label>
        <input id="ex-name" class="input" placeholder="例: ベンチプレス" /></div>
      <div class="field"><label>部位（細分化可）</label>
        <input id="ex-part" class="input" placeholder="例: 胸 / 上部" /></div>
      <div class="field"><label>意識ポイント（カンマ区切り）</label>
        <input id="ex-cues" class="input" placeholder="例: 肩甲骨下制, 腹圧" /></div>
      <div class="field"><label>セットパターン</label>
        <div class="seg" id="ex-pattern">
          ${SET_PATTERNS.map((p, i) => `<button data-p="${p}" class="${i === 0 ? 'sel' : ''}">${p}</button>`).join('')}
        </div></div>
      <div id="ex-error" class="error"></div>
      <button id="ex-save" class="btn btn-primary btn-block">種目を追加</button>
    </div>
    <div id="ex-list"></div>`;

  let pattern = SET_PATTERNS[0];
  el.querySelectorAll('#ex-pattern button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('#ex-pattern button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      pattern = b.dataset.p;
    }));

  el.querySelector('#ex-save').addEventListener('click', async () => {
    const name = el.querySelector('#ex-name').value.trim();
    const bodyPart = el.querySelector('#ex-part').value.trim();
    const cuePresets = el.querySelector('#ex-cues').value
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (!name) { el.querySelector('#ex-error').textContent = '種目名を入力してください'; return; }
    await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern });
    renderExercises(el);
  });

  renderList(el, exercises);
}

function renderList(el, exercises) {
  const list = el.querySelector('#ex-list');
  if (!exercises.length) {
    list.innerHTML = '<p class="muted">まだ種目がありません。</p>';
    return;
  }
  list.innerHTML = exercises.map((e) => `
    <div class="card">
      <div class="list-item" style="border:none;padding:0">
        <div>
          <strong>${escapeHtml(e.name)}</strong>
          <span class="muted"> ${escapeHtml(e.bodyPart || '')}</span>
          <div>${(e.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</div>
          <span class="chip">${escapeHtml(e.setPattern || '通常')}</span>
        </div>
        <button class="btn btn-danger" data-del="${e.id}">削除</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await remove('exercises', b.dataset.del);
      renderExercises(el);
    }));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 2: app.js にルート登録**

`js/app.js` の import と routes を更新：
```js
import { renderHome } from './views/home.js';
import { renderExercises } from './views/exercises.js';

const routes = { home: renderHome, exercises: renderExercises };
```

- [ ] **Step 3: ブラウザで動作確認**

サーバ起動中に preview をリロードし、メニュータブで種目を追加・削除できることを確認。

- [ ] **Step 4: コミット**

```bash
git add js/views/exercises.js js/app.js
git commit -m "feat: add exercise management view"
```

---

## Task 6: 記録ビュー（workout.js）— セット記録・RM・Sensory・タイマー

**Files:**
- Create: `js/views/workout.js`
- Modify: `js/app.js`（ルート登録）

- [ ] **Step 1: workout.js を実装**

`js/views/workout.js`:
```js
import { getAll, put, uid } from '../db.js';
import { estimate1RM, sensoryScore, computePRs } from '../lib/calc.js';
import { createTimer, formatTime } from '../timer.js';
import { escapeHtml } from './exercises.js';

const INTERVAL_SEC = 90;
let timer;

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
      <div id="w-error" class="error"></div>
      <button id="w-save" class="btn btn-primary btn-block">セット記録 + インターバル開始</button>
    </div>
    <div class="card" id="w-timer-card" style="display:none">
      <div class="timer-big" id="w-timer">1:30</div>
      <button id="w-timer-stop" class="btn btn-block">タイマー停止</button>
    </div>
    <div class="card"><strong>本日のセット</strong><div id="w-today"></div></div>`;

  const state = { core: null, load: null, rom: 'full' };

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
    await put('sensoryLogs', { id: uid(), setId, core: state.core, muscleLoad: state.load, rom: state.rom, score });
    el.querySelector('#w-timer-card').style.display = 'block';
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
```

- [ ] **Step 2: app.js にルート登録**

```js
import { renderWorkout } from './views/workout.js';
// routes に追加:
const routes = { home: renderHome, workout: renderWorkout, exercises: renderExercises };
```

- [ ] **Step 3: ブラウザで動作確認**

種目を登録 → 記録タブで重量・回数入力 → 推定1RM即時表示 → Sensory選択 → 保存でインターバルタイマー開始＆本日のセットに追加されることを確認。

- [ ] **Step 4: コミット**

```bash
git add js/views/workout.js js/app.js
git commit -m "feat: add workout recording view with 1RM, sensory log, timer"
```

---

## Task 7: ホーム＆履歴/PRビュー

**Files:**
- Modify: `js/views/home.js`
- Create: `js/views/history.js`
- Modify: `js/app.js`

- [ ] **Step 1: home.js を実装（直近PR・本日サマリ）**

`js/views/home.js`:
```js
import { getAll } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';

export async function renderHome(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
  const prs = computePRs(sets);
  const today = new Date().toISOString().slice(0, 10);
  const workouts = await getAll('workouts');
  const todayWorkout = workouts.find((w) => w.date === today);
  const todayCount = todayWorkout ? sets.filter((s) => s.workoutId === todayWorkout.id).length : 0;
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';

  const prRows = Object.entries(prs)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => `<div class="list-item"><span>${escapeHtml(nameOf(id))}</span>
      <span class="pr-badge">${v.toFixed(1)}kg</span></div>`).join('');

  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    <div class="card">
      <div class="muted">本日のセット数</div>
      <div class="timer-big" style="font-size:40px">${todayCount}</div>
    </div>
    <div class="card">
      <strong>PR（推定1RM）</strong>
      ${prRows || '<p class="muted">まだ記録がありません。</p>'}
    </div>`;
}
```

- [ ] **Step 2: history.js を実装（種目別の推移）**

`js/views/history.js`:
```js
import { getAll } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';

export async function renderHistory(el) {
  const exercises = await getAll('exercises');
  const sets = (await getAll('sets')).sort((a, b) => b.createdAt - a.createdAt);
  const logs = await getAll('sensoryLogs');
  const prs = computePRs(sets);
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';

  if (!sets.length) {
    el.innerHTML = `<h2 class="view-title">履歴 / PR</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
    return;
  }

  const byEx = {};
  for (const s of sets) (byEx[s.exerciseId] ||= []).push(s);

  el.innerHTML = `<h2 class="view-title">履歴 / PR</h2>` +
    Object.entries(byEx).map(([id, list]) => `
      <div class="card">
        <div class="list-item" style="border:none;padding:0 0 8px">
          <strong>${escapeHtml(nameOf(id))}</strong>
          <span class="pr-badge">PR ${prs[id].toFixed(1)}kg</span>
        </div>
        ${list.slice(0, 8).map((s) => {
          const log = logs.find((l) => l.setId === s.id);
          const d = new Date(s.createdAt);
          return `<div class="list-item">
            <span class="muted">${d.getMonth() + 1}/${d.getDate()}</span>
            <span>${s.weight}kg × ${s.reps}</span>
            <span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>
          </div>`;
        }).join('')}
      </div>`).join('');
}
```

- [ ] **Step 3: app.js に全ルート登録**

`js/app.js` 最終形：
```js
import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderExercises } from './views/exercises.js';
import { renderHistory } from './views/history.js';

const routes = {
  home: renderHome,
  workout: renderWorkout,
  exercises: renderExercises,
  history: renderHistory,
};

async function navigate(route) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route));
  const render = routes[route] || renderHome;
  await render(el);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

navigate('home');
```

- [ ] **Step 4: ブラウザで動作確認**

ホームにPR・本日セット数、履歴タブに種目別の推移が表示されることを確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/home.js js/views/history.js js/app.js
git commit -m "feat: add home summary and history/PR views"
```

---

## Task 8: PWA 化（manifest + Service Worker）

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon-192.png`, `icons/icon-512.png`

- [ ] **Step 1: manifest.json を作成**

`manifest.json`:
```json
{
  "name": "GACHI-FIT",
  "short_name": "GACHI-FIT",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: アイコンを生成**

Run:
```bash
cd /Users/taichi/gachi-fit && mkdir -p icons && python3 -c "
import struct, zlib
def png(path, size, rgb):
    w=h=size
    raw=bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw += bytes(rgb)
    def chunk(t,d):
        c=t+d
        return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
    sig=b'\x89PNG\r\n\x1a\n'
    ihdr=struct.pack('>IIBBBBB',w,h,8,2,0,0,0)
    idat=zlib.compress(bytes(raw),9)
    open(path,'wb').write(sig+chunk(b'IHDR',ihdr)+chunk(b'IDAT',idat)+chunk(b'IEND',b''))
png('icons/icon-192.png',192,(204,255,0))
png('icons/icon-512.png',512,(204,255,0))
print('icons done')
"
```
Expected: `icons done`

- [ ] **Step 3: sw.js を作成**

`sw.js`:
```js
const CACHE = 'gachi-fit-v1';
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js', 'js/lib/calc.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js', 'js/views/history.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached))
  );
});
```

- [ ] **Step 4: ブラウザで動作確認**

preview をリロード。コンソールに SW 登録エラーが無いこと、Application タブで manifest が認識されることを確認。オフライン（サーバ停止）でも再読込で表示されることを確認。

- [ ] **Step 5: コミット**

```bash
git add manifest.json sw.js icons
git commit -m "feat: add PWA manifest, service worker, and icons"
```

---

## Task 9: 仕上げ・README・全体動作確認

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md を作成**

`README.md`:
```markdown
# GACHI-FIT

中・上級トレーニー向け「感覚同期型」トレーニング記録 PWA（Phase1）。

## 機能
- ハイパーカスタムメニュー（部位細分化・意識ポイント・セットパターン）
- セット記録 + 推定1RM自動計算（Epley式）
- Sensory Log（腹圧/対象筋負荷/ROM）とセット品質スコア
- インターバルタイマー
- ホーム/履歴でPR・推移を確認
- IndexedDB ローカル保存・PWA オフライン動作

## 開発
```bash
npm test                 # 純粋ロジックのユニットテスト
python3 -m http.server 8765   # http://localhost:8765 で起動
```

## 構成
- `js/lib/calc.js` 純粋ロジック / `js/db.js` IndexedDB / `js/timer.js` タイマー
- `js/views/*` 各画面 / `js/app.js` ルーティング
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS

- [ ] **Step 3: 全フロー手動確認**

種目登録 → 記録（1RM・Sensory・タイマー）→ ホームPR → 履歴推移 → リロードでデータ永続を確認。

- [ ] **Step 4: コミット**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review チェック結果
- スペック網羅：カスタムメニュー(T5)/RM計算(T1,T6)/Sensory Log(T1,T6)/タイマー(T3,T6)/PR表示(T6,T7)/IndexedDB(T2)/PWA(T8) すべてタスク化済み。
- プレースホルダ無し：全コード実体記載。
- 型整合：`estimate1RM/sensoryScore/computePRs`、`put/getAll/get/remove/uid`、`createTimer/formatTime`、`escapeHtml` の呼び出し名が全タスクで一致。
