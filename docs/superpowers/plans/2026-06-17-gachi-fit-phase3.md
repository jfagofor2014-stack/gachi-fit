# GACHI-FIT Phase3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini AIインサイト・体形比較写真・大会カウントダウン/目標体重・セットパターンのカスタム管理を追加し、GitHub Pages で公開してスマホで利用可能にする。

**Architecture:** Phase1/2 を踏襲。純粋ロジック（プロンプト構築・日数計算・デフォルト投入）を `js/lib/` に分離し `node --test`。Gemini はユーザー自身のAPIキーをlocalStorage保存しクライアント直叩き（fetch注入でテスト可能）。DBは加算的にversion 2へ拡張。下部タブを5つに再編。

**Tech Stack:** Vanilla JS (ES Modules), HTML/CSS, IndexedDB, Service Worker, Gemini REST API (gemini-2.5-flash), `node:test`。

---

## File Structure
- `js/lib/gemini.js` — `buildInsightPrompt(stats)`, `callGemini(prompt, apiKey, {fetchImpl})`
- `js/lib/countdown.js` — `daysUntil(dateStr, today)`
- `js/lib/seed.js` — `ensureDefaultSetPatterns(getAllFn, putFn, uidFn)`
- `js/lib/image.js` — `compressImage(file, maxEdge, quality)`（ブラウザ専用）
- `js/views/body.js` — 体形写真＋体重＋目標
- `js/views/more.js` — その他メニュー
- `js/db.js` — DB_VERSION=2、新ストア追加
- `js/views/insights.js` / `settings.js` / `exercises.js` / `home.js` — 機能追加
- `index.html` / `js/app.js` / `sw.js` — タブ再編・ルート・キャッシュ
- `test/gemini.test.js`, `test/countdown.test.js`, `test/seed.test.js`

---

## Task 1: カウントダウン純粋ロジック（countdown.js）

**Files:**
- Create: `js/lib/countdown.js`
- Test: `test/countdown.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/countdown.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil } from '../js/lib/countdown.js';

test('daysUntil returns 0 for same day', () => {
  assert.equal(daysUntil('2026-06-17', new Date('2026-06-17T09:00:00')), 0);
});

test('daysUntil returns positive for future', () => {
  assert.equal(daysUntil('2026-06-20', new Date('2026-06-17T23:00:00')), 3);
});

test('daysUntil returns negative for past', () => {
  assert.equal(daysUntil('2026-06-15', new Date('2026-06-17T00:00:00')), -2);
});

test('daysUntil returns null for empty input', () => {
  assert.equal(daysUntil('', new Date('2026-06-17')), null);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`countdown.js` が存在しない）

- [ ] **Step 3: countdown.js を実装**

`js/lib/countdown.js`:
```js
// 対象日まで残り日数（当日=0、過去は負）。dateStr は 'YYYY-MM-DD'。
export function daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ms = target - base;
  return Math.round(ms / 86400000);
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/countdown.js test/countdown.test.js
git commit -m "feat: add daysUntil countdown logic with tests"
```

---

## Task 2: デフォルト投入ロジック（seed.js）

**Files:**
- Create: `js/lib/seed.js`
- Test: `test/seed.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/seed.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultSetPatterns, DEFAULT_SET_PATTERNS } from '../js/lib/seed.js';

test('ensureDefaultSetPatterns seeds defaults when store empty', async () => {
  const store = [];
  const getAllFn = async () => store;
  const putFn = async (v) => { store.push(v); };
  let counter = 0;
  const uidFn = () => 'id' + (counter++);
  await ensureDefaultSetPatterns(getAllFn, putFn, uidFn);
  assert.equal(store.length, DEFAULT_SET_PATTERNS.length);
  assert.deepEqual(store.map((s) => s.name), DEFAULT_SET_PATTERNS);
});

test('ensureDefaultSetPatterns does nothing when store has items', async () => {
  const store = [{ id: 'x', name: '通常' }];
  const getAllFn = async () => store;
  const putFn = async (v) => { store.push(v); };
  await ensureDefaultSetPatterns(getAllFn, putFn, () => 'id');
  assert.equal(store.length, 1);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`seed.js` が存在しない）

- [ ] **Step 3: seed.js を実装**

`js/lib/seed.js`:
```js
export const DEFAULT_SET_PATTERNS = ['通常', 'ピラミッド', 'ドロップ', 'レストポーズ'];

// setPatterns ストアが空ならデフォルトを投入する（依存注入でテスト可能）
export async function ensureDefaultSetPatterns(getAllFn, putFn, uidFn) {
  const existing = await getAllFn();
  if (existing && existing.length > 0) return;
  for (const name of DEFAULT_SET_PATTERNS) {
    await putFn({ id: uidFn(), name });
  }
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/seed.js test/seed.test.js
git commit -m "feat: add setPatterns default seed logic with tests"
```

---

## Task 3: Gemini ロジック（gemini.js）

**Files:**
- Create: `js/lib/gemini.js`
- Test: `test/gemini.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/gemini.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsightPrompt, callGemini } from '../js/lib/gemini.js';

test('buildInsightPrompt includes PR and tag stats', () => {
  const stats = {
    prs: [{ name: 'ベンチプレス', pr: 126.7 }],
    tagFreq: [{ tag: '腹圧抜けた', count: 3 }],
    scoreCorr: [{ tag: '腹圧抜けた', direction: 'lower' }],
    recentCount: 12,
  };
  const p = buildInsightPrompt(stats);
  assert.match(p, /ベンチプレス/);
  assert.match(p, /126\.7/);
  assert.match(p, /腹圧抜けた/);
});

test('callGemini posts to endpoint and extracts text', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '改善案です' }] } }] }),
    };
  };
  const out = await callGemini('プロンプト', 'KEY123', { fetchImpl: fakeFetch });
  assert.equal(out, '改善案です');
  assert.match(captured.url, /gemini-2\.5-flash/);
  assert.match(captured.url, /key=KEY123/);
});

test('callGemini throws on http error', async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await assert.rejects(() => callGemini('p', 'k', { fetchImpl: fakeFetch }), /429/);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`gemini.js` が存在しない）

- [ ] **Step 3: gemini.js を実装**

`js/lib/gemini.js`:
```js
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// 蓄積統計から日本語プロンプトを生成（純粋関数）
export function buildInsightPrompt(stats) {
  const prs = (stats.prs || []).map((p) => `- ${p.name}: 推定1RM ${p.pr.toFixed(1)}kg`).join('\n');
  const tags = (stats.tagFreq || []).map((t) => `- ${t.tag}（${t.count}回）`).join('\n');
  const corr = (stats.scoreCorr || [])
    .map((c) => `- ${c.tag}: 品質スコアが${c.direction === 'lower' ? '低い' : '高い'}傾向`)
    .join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下のトレーニング記録の傾向を踏まえ、弱点の克服に向けた具体的な改善提案を3つ、簡潔な日本語で提示してください。',
    'ストレッチ・フォーム・インターバル・重量設定など実践的な内容にしてください。',
    '',
    `直近の記録セット数: ${stats.recentCount || 0}`,
    '【種目別PR】', prs || '（なし）',
    '【よく使うタグ】', tags || '（なし）',
    '【タグと品質スコアの傾向】', corr || '（なし）',
  ].join('\n');
}

// Gemini を呼び生成テキストを返す。fetchImpl 注入でテスト可能。
export async function callGemini(prompt, apiKey, { fetchImpl = fetch } = {}) {
  const resp = await fetchImpl(ENDPOINT(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!resp.ok) throw new Error(`Gemini APIエラー: ${resp.status}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/gemini.js test/gemini.test.js
git commit -m "feat: add Gemini prompt builder and API client with tests"
```

---

## Task 4: DB スキーマ拡張（version 2・新ストア）

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: STORES と DB_VERSION を更新**

`js/db.js` 冒頭の定数を次に置き換え：
```js
const DB_NAME = 'gachi-fit';
const DB_VERSION = 2;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs', 'photos', 'goals', 'bodyWeights', 'setPatterns'];
```

> 既存 `open()` の `onupgradeneeded` は不足ストアのみ作成するため、version を上げるだけで新ストアが追加され既存データは保持される。

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/db.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/db.js
git commit -m "feat: extend IndexedDB schema to v2 with photos/goals/bodyWeights/setPatterns"
```

---

## Task 5: 画像圧縮ユーティリティ（image.js）

**Files:**
- Create: `js/lib/image.js`

> canvas 依存のためユニットテストせず、体形ビューでブラウザ確認する。

- [ ] **Step 1: image.js を実装**

`js/lib/image.js`:
```js
// 画像ファイルを長辺 maxEdge に縮小し JPEG dataURL を返す
export function compressImage(file, maxEdge = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像の解析に失敗しました'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxEdge) { height = height * maxEdge / width; width = maxEdge; }
        else if (height > maxEdge) { width = width * maxEdge / height; height = maxEdge; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/lib/image.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/lib/image.js
git commit -m "feat: add image compression utility"
```

---

## Task 6: タブ再編＋その他ビュー＋起動シード

**Files:**
- Modify: `index.html`
- Create: `js/views/more.js`
- Modify: `js/app.js`

- [ ] **Step 1: index.html のタブを5つに再編**

`index.html` の `<nav class="tabbar">` 全体を次に置き換え：
```html
  <nav class="tabbar">
    <button data-route="home" class="tab active">ホーム</button>
    <button data-route="workout" class="tab">記録</button>
    <button data-route="body" class="tab">ボディ</button>
    <button data-route="insights" class="tab">インサイト</button>
    <button data-route="more" class="tab">その他</button>
  </nav>
```

- [ ] **Step 2: more.js を実装**

`js/views/more.js`:
```js
const ITEMS = [
  { route: 'exercises', label: 'メニュー管理', desc: '種目・部位・セットパターン' },
  { route: 'history', label: '履歴 / PR', desc: '推移グラフ' },
  { route: 'review', label: '振り返り', desc: 'セット編集・削除' },
  { route: 'settings', label: '設定', desc: 'APIキー・目標・バックアップ' },
];

export async function renderMore(el, navigate) {
  el.innerHTML = `<h2 class="view-title">その他</h2>` +
    ITEMS.map((it) => `<div class="card more-item" data-route="${it.route}">
      <strong>${it.label}</strong>
      <div class="muted">${it.desc}</div>
    </div>`).join('');
  el.querySelectorAll('.more-item').forEach((c) =>
    c.addEventListener('click', () => navigate(c.dataset.route)));
}
```

- [ ] **Step 3: app.js を更新（navigate を渡す・新ルート・起動シード）**

`js/app.js` 全体を次に置き換え：
```js
import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderExercises } from './views/exercises.js';
import { renderHistory } from './views/history.js';
import { renderInsights } from './views/insights.js';
import { renderReview } from './views/review.js';
import { renderSettings } from './views/settings.js';
import { renderBody } from './views/body.js';
import { renderMore } from './views/more.js';
import { getAll, put, uid } from './db.js';
import { ensureDefaultSetPatterns } from './lib/seed.js';

const TAB_ROUTES = ['home', 'workout', 'body', 'insights', 'more'];

const routes = {
  home: renderHome,
  workout: renderWorkout,
  exercises: renderExercises,
  history: renderHistory,
  insights: renderInsights,
  review: renderReview,
  settings: renderSettings,
  body: renderBody,
  more: renderMore,
};

async function navigate(route) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route && TAB_ROUTES.includes(route)));
  const render = routes[route] || renderHome;
  await render(el, navigate);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

ensureDefaultSetPatterns(() => getAll('setPatterns'), (v) => put('setPatterns', v), uid)
  .finally(() => navigate('home'));
```

> 全ビューの `render(el)` は第2引数 `navigate` を無視するため後方互換。`more.js` のみ利用する。

- [ ] **Step 4: more-item のスタイルを追加**

`css/style.css` の末尾に追加：
```css
.more-item { cursor: pointer; }
.more-item:active { border-color: var(--accent); }
.countdown { font-size: 52px; font-weight: 800; color: var(--accent); text-align: center;
  font-variant-numeric: tabular-nums; }
.photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.photo-grid img { width: 100%; border-radius: 12px; }
.photo-thumb { position: relative; }
.photo-thumb img { width: 100%; border-radius: 12px; display: block; }
.photo-thumb.sel { outline: 3px solid var(--accent); border-radius: 12px; }
```

- [ ] **Step 5: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/more.js && node --check js/app.js && echo OK`
Expected: `OK`
（この時点では `body.js` 未作成のためブラウザ確認は Task 8 後に行う）

- [ ] **Step 6: コミット**

```bash
git add index.html js/views/more.js js/app.js css/style.css
git commit -m "feat: restructure tabs to 5 with more-menu and startup seed"
```

---

## Task 7: セットパターン管理＋APIキー＋目標設定（settings.js / exercises.js）

**Files:**
- Modify: `js/views/settings.js`
- Modify: `js/views/exercises.js`

- [ ] **Step 1: settings.js に APIキー・目標・パターン管理を追加**

`js/views/settings.js` 全体を次に置き換え：
```js
import { exportAll, importAll, getAll, put, remove, uid, get } from '../db.js';

export async function renderSettings(el) {
  const key = localStorage.getItem('gemini_api_key') || '';
  const goal = (await get('goals', 'main')) || { id: 'main', competitionDate: '', targetWeight: '' };
  const patterns = await getAll('setPatterns');

  el.innerHTML = `
    <h2 class="view-title">設定</h2>

    <div class="card">
      <strong>Gemini APIキー</strong>
      <p class="muted">AI分析に使用。キーはこの端末内のみに保存されます。</p>
      <input id="s-key" type="password" class="input" value="${key}" placeholder="AIza..." />
      <button id="s-key-save" class="btn btn-primary btn-block" style="margin-top:10px">キーを保存</button>
    </div>

    <div class="card">
      <strong>大会・目標</strong>
      <div class="field" style="margin-top:8px"><label>大会日</label>
        <input id="s-comp" type="date" class="input" value="${goal.competitionDate || ''}" /></div>
      <div class="field"><label>目標体重(kg)</label>
        <input id="s-target" type="number" class="input" value="${goal.targetWeight || ''}" /></div>
      <button id="s-goal-save" class="btn btn-primary btn-block">目標を保存</button>
    </div>

    <div class="card">
      <strong>セットパターン管理</strong>
      <div class="row" style="margin-top:8px">
        <input id="s-pat" class="input" placeholder="新しいパターン名" />
        <button id="s-pat-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="s-pat-list"></div>
    </div>

    <div class="card">
      <strong>データのバックアップ</strong>
      <p class="muted">全データをJSONで書き出し・読み込みします。</p>
      <button id="s-export" class="btn btn-primary btn-block" style="margin-bottom:10px">エクスポート</button>
      <input id="s-file" type="file" accept="application/json" style="display:none" />
      <button id="s-import" class="btn btn-block">インポート</button>
      <div id="s-msg" class="muted" style="margin-top:10px"></div>
    </div>`;

  el.querySelector('#s-key-save').addEventListener('click', () => {
    localStorage.setItem('gemini_api_key', el.querySelector('#s-key').value.trim());
    el.querySelector('#s-msg').textContent = 'APIキーを保存しました。';
  });

  el.querySelector('#s-goal-save').addEventListener('click', async () => {
    await put('goals', { id: 'main',
      competitionDate: el.querySelector('#s-comp').value,
      targetWeight: parseFloat(el.querySelector('#s-target').value) || '' });
    el.querySelector('#s-msg').textContent = '目標を保存しました。';
  });

  function renderPatterns(list) {
    el.querySelector('#s-pat-list').innerHTML = list.map((p) => `
      <div class="list-item">
        <span class="pat-name" data-id="${p.id}">${p.name}</span>
        <span>
          <button class="btn btn-edit" data-edit="${p.id}" style="min-height:40px;padding:0 12px">編集</button>
          <button class="btn btn-danger" data-del="${p.id}" style="min-height:40px;padding:0 12px">削除</button>
        </span>
      </div>`).join('') || '<p class="muted">パターンがありません。</p>';
    el.querySelectorAll('#s-pat-list [data-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('setPatterns', b.dataset.del); renderPatterns(await getAll('setPatterns')); }));
    el.querySelectorAll('#s-pat-list [data-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = (await getAll('setPatterns')).find((x) => x.id === b.dataset.edit);
        const name = prompt('パターン名を編集', p.name);
        if (name && name.trim()) { p.name = name.trim(); await put('setPatterns', p); renderPatterns(await getAll('setPatterns')); }
      }));
  }

  el.querySelector('#s-pat-add').addEventListener('click', async () => {
    const name = el.querySelector('#s-pat').value.trim();
    if (!name) return;
    await put('setPatterns', { id: uid(), name });
    el.querySelector('#s-pat').value = '';
    renderPatterns(await getAll('setPatterns'));
  });

  renderPatterns(patterns);

  el.querySelector('#s-export').addEventListener('click', async () => {
    const obj = await exportAll();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gachi-fit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    el.querySelector('#s-msg').textContent = 'エクスポートしました。';
  });

  const fileInput = el.querySelector('#s-file');
  el.querySelector('#s-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const msg = el.querySelector('#s-msg');
    try {
      const obj = JSON.parse(await file.text());
      await importAll(obj);
      msg.textContent = 'インポートが完了しました。';
    } catch (e) { msg.textContent = 'インポート失敗: ' + e.message; }
    fileInput.value = '';
  });
}
```

- [ ] **Step 2: exercises.js をストアからパターン取得に変更**

`js/views/exercises.js` の `const SET_PATTERNS = [...]` 行を削除し、`renderExercises` 冒頭を次に変更：
```js
export async function renderExercises(el) {
  const exercises = await getAll('exercises');
  let patterns = (await getAll('setPatterns')).map((p) => p.name);
  if (patterns.length === 0) patterns = ['通常'];
```
そして `el.innerHTML` 内のパターン `seg` 生成を次に置き換え（`${SET_PATTERNS.map(...)}` の箇所）：
```js
          ${patterns.map((p, i) => `<button data-p="${p}" class="${i === 0 ? 'sel' : ''}">${p}</button>`).join('')}
```
さらに `let pattern = SET_PATTERNS[0];` を次に変更：
```js
  let pattern = patterns[0];
```
`getAll` は既存 import に含まれる（`import { getAll, put, remove, uid } from '../db.js';`）ため変更不要。

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/settings.js && node --check js/views/exercises.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/settings.js js/views/exercises.js
git commit -m "feat: add API key, goals, and set pattern management to settings"
```

---

## Task 8: ボディビュー（写真・体重・目標）

**Files:**
- Create: `js/views/body.js`
- Modify: `js/views/home.js`

- [ ] **Step 1: body.js を実装**

`js/views/body.js`:
```js
import { getAll, get, put, remove, uid } from '../db.js';
import { compressImage } from '../lib/image.js';
import { sparklinePath } from '../lib/chart.js';
import { escapeHtml } from './exercises.js';

export async function renderBody(el) {
  const goal = (await get('goals', 'main')) || { targetWeight: '' };
  const weights = (await getAll('bodyWeights')).sort((a, b) => (a.date < b.date ? -1 : 1));
  const photos = (await getAll('photos')).sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = weights.length ? weights[weights.length - 1].weight : null;
  const diff = (latest != null && goal.targetWeight) ? (latest - goal.targetWeight) : null;
  const series = weights.map((w) => w.weight);
  const wPath = sparklinePath(series, 300, 44);

  el.innerHTML = `
    <h2 class="view-title">ボディ</h2>

    <div class="card">
      <strong>体重</strong>
      <div class="row" style="margin-top:8px">
        <input id="b-weight" class="input" type="number" inputmode="decimal" placeholder="kg" />
        <button id="b-weight-add" class="btn btn-primary" style="flex:0 0 auto">記録</button>
      </div>
      <div class="muted" style="margin-top:8px">
        現在: ${latest != null ? latest + 'kg' : '-'}
        ${diff != null ? ` / 目標まで ${diff > 0 ? diff.toFixed(1) + 'kg減' : Math.abs(diff).toFixed(1) + 'kg増'}` : ''}
      </div>
      ${wPath ? `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="${wPath}" /></svg>` : ''}
    </div>

    <div class="card">
      <strong>体形写真</strong>
      <div class="field" style="margin-top:8px"><label>部位</label>
        <input id="b-part" class="input" placeholder="例: 背中" /></div>
      <input id="b-file" type="file" accept="image/*" capture="environment" style="display:none" />
      <button id="b-shoot" class="btn btn-primary btn-block">写真を追加</button>
      <div id="b-msg" class="muted" style="margin-top:8px"></div>
      <div id="b-compare" class="muted" style="margin-top:8px">比較したい写真を2枚タップ</div>
      <div id="b-compare-view"></div>
      <div id="b-photos" class="photo-grid" style="margin-top:10px"></div>
    </div>`;

  el.querySelector('#b-weight-add').addEventListener('click', async () => {
    const w = parseFloat(el.querySelector('#b-weight').value);
    if (!(w > 0)) { el.querySelector('#b-msg').textContent = '体重を正しく入力してください'; return; }
    await put('bodyWeights', { id: uid(), date: new Date().toISOString().slice(0, 10), weight: w });
    renderBody(el);
  });

  const fileInput = el.querySelector('#b-file');
  el.querySelector('#b-shoot').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const msg = el.querySelector('#b-msg');
    try {
      const dataUrl = await compressImage(file);
      await put('photos', { id: uid(), date: new Date().toISOString().slice(0, 10),
        bodyPart: el.querySelector('#b-part').value.trim(), dataUrl, note: '' });
      msg.textContent = '写真を保存しました。';
      renderBody(el);
    } catch (e) { msg.textContent = '保存失敗: ' + e.message; }
    fileInput.value = '';
  });

  const selected = [];
  const grid = el.querySelector('#b-photos');
  grid.innerHTML = photos.map((p) => `
    <div class="photo-thumb" data-id="${p.id}">
      <img src="${p.dataUrl}" alt="${escapeHtml(p.bodyPart || '')}" />
      <div class="muted" style="font-size:12px">${p.date} ${escapeHtml(p.bodyPart || '')}</div>
      <button class="btn btn-danger" data-del="${p.id}" style="min-height:36px;padding:0 10px;margin-top:4px">削除</button>
    </div>`).join('') || '<p class="muted">まだ写真がありません。</p>';

  grid.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async (ev) => { ev.stopPropagation(); await remove('photos', b.dataset.del); renderBody(el); }));

  grid.querySelectorAll('.photo-thumb').forEach((thumb) =>
    thumb.querySelector('img').addEventListener('click', () => {
      const id = thumb.dataset.id;
      const idx = selected.indexOf(id);
      if (idx >= 0) { selected.splice(idx, 1); thumb.classList.remove('sel'); }
      else { selected.push(id); thumb.classList.add('sel'); if (selected.length > 2) {
        const removeId = selected.shift();
        grid.querySelector(`.photo-thumb[data-id="${removeId}"]`)?.classList.remove('sel');
      } }
      const cmp = el.querySelector('#b-compare-view');
      if (selected.length === 2) {
        const a = photos.find((p) => p.id === selected[0]);
        const b = photos.find((p) => p.id === selected[1]);
        cmp.innerHTML = `<div class="photo-grid" style="margin-top:8px">
          <div><img src="${a.dataUrl}" /><div class="muted" style="font-size:12px">${a.date}</div></div>
          <div><img src="${b.dataUrl}" /><div class="muted" style="font-size:12px">${b.date}</div></div>
        </div>`;
      } else { cmp.innerHTML = ''; }
    }));
}
```

- [ ] **Step 2: home.js に大会カウントダウンを追加**

`js/views/home.js` の import に追加：
```js
import { get } from '../db.js';
import { daysUntil } from '../lib/countdown.js';
```
（既存の `import { getAll } from '../db.js';` は `import { getAll, get } from '../db.js';` に変更）

`renderHome` 内、`el.innerHTML = ` の直前に追加：
```js
  const goal = await get('goals', 'main');
  const days = goal ? daysUntil(goal.competitionDate) : null;
  const countdownCard = (days != null && days >= 0)
    ? `<div class="card"><div class="muted">大会まで</div><div class="countdown">${days}<span style="font-size:24px">日</span></div></div>`
    : '';
```
そして `el.innerHTML` の `<h2 class="view-title">ホーム</h2>` の直後に `${countdownCard}` を挿入：
```js
  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    ${countdownCard}
    <div class="card">
      <div class="muted">本日のセット数</div>
      <div class="timer-big" style="font-size:40px">${todayCount}</div>
    </div>
    <div class="card">
      <strong>PR（推定1RM）</strong>
      ${prRows || '<p class="muted">まだ記録がありません。</p>'}
    </div>`;
```

- [ ] **Step 3: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/body.js && node --check js/views/home.js && echo OK`
Expected: `OK`
サーバ起動中の preview をリロードし：ボディタブで体重記録（推移グラフ）・写真追加・2枚比較・削除、設定で大会日設定→ホームにカウントダウン表示、を確認。

- [ ] **Step 4: コミット**

```bash
git add js/views/body.js js/views/home.js
git commit -m "feat: add body view (photos, weight, compare) and home countdown"
```

---

## Task 9: インサイトに AI 分析ボタンを追加

**Files:**
- Modify: `js/views/insights.js`

- [ ] **Step 1: insights.js に AI 分析を追加**

`js/views/insights.js` の import 群に追加：
```js
import { computePRs } from '../lib/calc.js';
import { buildInsightPrompt, callGemini } from '../lib/gemini.js';
```
`renderInsights` の `el.innerHTML = ` テンプレートの末尾（最後の `</div>` の後ろ、テンプレートリテラル内）に AI カードを追加：
```js
    <div class="card">
      <strong>AIインサイト（Gemini）</strong>
      <p class="muted">蓄積データを分析し具体的な改善提案を生成します。</p>
      <button id="ai-run" class="btn btn-primary btn-block">AIで分析</button>
      <div id="ai-out" class="muted" style="margin-top:10px;white-space:pre-wrap"></div>
    </div>`;
```
（既存テンプレートの最後 `<div class="card"><strong>タグ × 推定1RM</strong>${rmHtml}</div>` の直後に連結する）

`renderInsights` 関数末尾（`el.innerHTML = ...;` の後）に処理を追加：
```js
  const aiBtn = el.querySelector('#ai-run');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
      const out = el.querySelector('#ai-out');
      const key = localStorage.getItem('gemini_api_key') || '';
      if (!key) { out.textContent = '設定でGemini APIキーを登録してください。'; return; }
      out.textContent = '分析中…';
      try {
        const exercises = await getAll('exercises');
        const prs = computePRs(sets);
        const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
        const stats = {
          prs: Object.entries(prs).map(([id, pr]) => ({ name: nameOf(id), pr })),
          tagFreq: freq,
          scoreCorr,
          recentCount: recent.length,
        };
        const prompt = buildInsightPrompt(stats);
        out.textContent = await callGemini(prompt, key, {});
      } catch (e) { out.textContent = 'エラー: ' + e.message; }
    });
  }
```

> `sets`, `freq`, `scoreCorr`, `recent` は `renderInsights` 内の既存変数（5セット以上のときに定義済み）。AIカードは早期returnの後＝データ十分時のみ描画されるため参照可能。

- [ ] **Step 2: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/insights.js && echo OK`
Expected: `OK`
preview で、5セット以上記録後にインサイトタブの「AIで分析」を押下 → キー未設定なら案内、キー設定済みなら生成結果表示を確認（実APIキーがある場合）。

- [ ] **Step 3: コミット**

```bash
git add js/views/insights.js
git commit -m "feat: add Gemini AI analysis button to insights view"
```

---

## Task 10: PWA キャッシュ更新・相対パス確認・README・全体確認

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

- [ ] **Step 1: sw.js のキャッシュ資産と版を更新**

`sw.js` の `CACHE` と `ASSETS` を次に置き換え：
```js
const CACHE = 'gachi-fit-v3';
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js',
  'js/lib/calc.js', 'js/lib/chart.js', 'js/lib/insights.js',
  'js/lib/gemini.js', 'js/lib/countdown.js', 'js/lib/seed.js', 'js/lib/image.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js',
  'js/views/history.js', 'js/views/insights.js', 'js/views/review.js', 'js/views/settings.js',
  'js/views/body.js', 'js/views/more.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];
```

- [ ] **Step 2: 相対パスを確認**

Run: `cd /Users/taichi/gachi-fit && grep -nE 'href="/|src="/|register\(.?/' index.html sw.js; echo "exit=$?"`
Expected: 出力なし（先頭スラッシュの絶対パスが無いこと）。`grep` がマッチ0で終了コード1でも問題なし。

- [ ] **Step 3: README を更新**

`README.md` の `## 機能` リストの末尾に追加：
```markdown
- Gemini による AI インサイト（APIキーは端末内に保存）
- 体形比較写真（IndexedDB保存・2枚並列比較）
- 大会カウントダウン・目標体重トラッキング
- セットパターンのカスタム管理
```
さらに `## 開発` セクションの後に追加：
```markdown
## 公開（GitHub Pages）
リポジトリ Settings → Pages → Source を `main` / `(root)` に設定すると
`https://jfagofor2014-stack.github.io/gachi-fit/` で公開される。

## AI機能の利用
[Google AI Studio](https://aistudio.google.com/apikey) でGemini APIキーを取得し、
アプリの「その他 → 設定」で登録する。
```

- [ ] **Step 4: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（calc 5 + chart 4 + insights 4 + countdown 4 + seed 2 + gemini 3 = 22 tests）

- [ ] **Step 5: 全フロー手動確認**

preview で：その他→設定でAPIキー/大会日/目標体重/パターン追加 → メニューに新パターン反映 → ホームにカウントダウン → ボディで体重・写真・比較 → 記録5セット以上 → インサイトでAI分析 → リロードでデータ永続を確認。

- [ ] **Step 6: コミット**

```bash
git add sw.js README.md
git commit -m "chore: update PWA cache v3 and README for Phase3"
```

---

## Self-Review チェック結果
- **スペック網羅**：AIインサイト(T3,T9)/体形写真(T5,T8)/カウントダウン・目標体重(T1,T8)/セットパターン管理(T2,T7)/タブ再編(T6)/DB拡張(T4)/Pages公開準備(T10) すべてタスク化済み。Pages有効化はユーザー操作（README案内）。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`daysUntil(dateStr, today)`、`ensureDefaultSetPatterns(getAllFn, putFn, uidFn)`/`DEFAULT_SET_PATTERNS`、`buildInsightPrompt(stats)`/`callGemini(prompt, apiKey, {fetchImpl})`、`compressImage(file, maxEdge, quality)`、新ストア `photos`/`goals`(`id:'main'`)/`bodyWeights`/`setPatterns`、`localStorage` キー `gemini_api_key`、`renderMore(el, navigate)` の引数が全タスクで一致。`get`/`getAll`/`put`/`remove`/`uid` は db.js 既存シグネチャに準拠。
