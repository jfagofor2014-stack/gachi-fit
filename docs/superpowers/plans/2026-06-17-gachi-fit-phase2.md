# GACHI-FIT Phase2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase1 の数値記録に「メモ＋定型タグ」を統合し、API不要のルール解析・推定1RM推移グラフ・データ入出力・ワークアウト振り返り・セット編集/削除を追加する。

**Architecture:** Phase1 を踏襲。純粋ロジック（タグ集計・相関・SVGパス生成）を `js/lib/` に分離して `node --test` でユニットテスト。UI は既存 SPA に「インサイト」「設定」タブを追加。スキーマ変更は加算的（`sensoryLogs` に `note`/`tags`）で後方互換。

**Tech Stack:** Vanilla JS (ES Modules), HTML/CSS, IndexedDB, Service Worker, `node:test`。

---

## File Structure
- `js/lib/insights.js` — `tagFrequency`, `tagScoreCorrelation`, `tag1RMCorrelation`（純粋関数）
- `js/lib/chart.js` — `sparklinePath`（純粋関数）
- `js/db.js` — `exportAll` / `importAll` 追加
- `js/views/workout.js` — メモ＋タグ入力追加
- `js/views/history.js` — 1RM推移グラフ＋日付別振り返り＋編集/削除
- `js/views/insights.js` — インサイト描画（新規）
- `js/views/settings.js` — エクスポート/インポート（新規）
- `index.html` / `js/app.js` — タブ・ルート追加
- `sw.js` — キャッシュ資産追加
- `test/insights.test.js`, `test/chart.test.js` — ユニットテスト

---

## Task 1: チャート純粋ロジック（chart.js）

**Files:**
- Create: `js/lib/chart.js`
- Test: `test/chart.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`test/chart.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sparklinePath } from '../js/lib/chart.js';

test('sparklinePath returns empty string for empty input', () => {
  assert.equal(sparklinePath([], 100, 40), '');
});

test('sparklinePath single point draws a centered horizontal dot path', () => {
  // 1点は中央高さに M のみ
  const d = sparklinePath([50], 100, 40);
  assert.match(d, /^M0,20/);
});

test('sparklinePath maps min to bottom and max to top', () => {
  // values [0,10] over width=100,height=40 (pad=2): 0 -> y=38, 10 -> y=2
  const d = sparklinePath([0, 10], 100, 40);
  assert.equal(d, 'M0,38 L100,2');
});

test('sparklinePath equal values draw a flat mid line', () => {
  const d = sparklinePath([5, 5, 5], 100, 40);
  // 全て同値なら中央高さ(20)で水平
  assert.equal(d, 'M0,20 L50,20 L100,20');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`chart.js` が存在しない）

- [ ] **Step 3: chart.js を実装**

`js/lib/chart.js`:
```js
// 数値配列から SVG path の d 文字列を生成。
// x は等間隔、y は min->bottom, max->top にマップ。pad は上下余白。
export function sparklinePath(values, width, height, pad = 2) {
  if (!values || values.length === 0) return '';
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const yOf = (v) => {
    if (span === 0) return height / 2;
    return pad + (1 - (v - min) / span) * (height - pad * 2);
  };
  const xOf = (i) => (n === 1 ? 0 : (i / (n - 1)) * width);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(v)}`)
    .join(' ');
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS（全テスト green）

- [ ] **Step 5: コミット**

```bash
git add js/lib/chart.js test/chart.test.js
git commit -m "feat: add sparklinePath chart logic with tests"
```

---

## Task 2: インサイト純粋ロジック（insights.js）

**Files:**
- Create: `js/lib/insights.js`
- Test: `test/insights.test.js`

> 入力は `sensoryLogs`（`{ score, tags }`）と `sets`（`{ id, estimated1RM }`）と、各 sensoryLog が参照する `setId`。テストは関数が受ける整形済み配列を直接渡す。

- [ ] **Step 1: 失敗するテストを書く**

`test/insights.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFrequency, tagScoreCorrelation, tag1RMCorrelation } from '../js/lib/insights.js';

test('tagFrequency counts tags descending', () => {
  const logs = [
    { tags: ['調子良い', '腹圧抜けた'] },
    { tags: ['腹圧抜けた'] },
    { tags: [] },
  ];
  assert.deepEqual(tagFrequency(logs), [
    { tag: '腹圧抜けた', count: 2 },
    { tag: '調子良い', count: 1 },
  ]);
});

test('tagScoreCorrelation flags tags whose avg score deviates beyond threshold', () => {
  const logs = [
    { tags: ['腹圧抜けた'], score: 4 },
    { tags: ['腹圧抜けた'], score: 4 },
    { tags: ['調子良い'], score: 9 },
    { tags: ['調子良い'], score: 9 },
  ];
  // 全体平均=6.5。腹圧抜けた=4 (差-2.5,閾値1.0超 -> lower)、調子良い=9 (差+2.5 -> higher)
  const res = tagScoreCorrelation(logs, 1.0);
  const low = res.find((r) => r.tag === '腹圧抜けた');
  const high = res.find((r) => r.tag === '調子良い');
  assert.equal(low.direction, 'lower');
  assert.equal(high.direction, 'higher');
});

test('tagScoreCorrelation ignores tags within threshold', () => {
  const logs = [
    { tags: ['普通'], score: 6 },
    { tags: ['普通'], score: 7 },
    { tags: ['他'], score: 6.5 },
  ];
  const res = tagScoreCorrelation(logs, 1.0);
  assert.equal(res.find((r) => r.tag === '普通'), undefined);
});

test('tag1RMCorrelation compares avg estimated1RM per tag', () => {
  // logs に setId、sets に estimated1RM
  const logs = [
    { tags: ['軽く感じた'], setId: 's1' },
    { tags: ['軽く感じた'], setId: 's2' },
    { tags: ['重い'], setId: 's3' },
  ];
  const sets = [
    { id: 's1', estimated1RM: 100 },
    { id: 's2', estimated1RM: 110 },
    { id: 's3', estimated1RM: 80 },
  ];
  const res = tag1RMCorrelation(logs, sets, 5);
  const light = res.find((r) => r.tag === '軽く感じた');
  // 全体平均=(100+110+80)/3=96.67。軽く感じた平均=105 -> +8.33 (>5) higher
  assert.equal(light.direction, 'higher');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`insights.js` が存在しない）

- [ ] **Step 3: insights.js を実装**

`js/lib/insights.js`:
```js
// タグ出現回数を降順で返す
export function tagFrequency(logs = []) {
  const counts = {};
  for (const l of logs) for (const t of l.tags || []) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function avg(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}

// タグごとの平均スコアが全体平均から threshold を超えて乖離するタグを抽出
export function tagScoreCorrelation(logs = [], threshold = 1.0) {
  const scored = logs.filter((l) => typeof l.score === 'number');
  const overall = avg(scored.map((l) => l.score));
  const byTag = {};
  for (const l of scored) for (const t of l.tags || []) (byTag[t] ||= []).push(l.score);
  const res = [];
  for (const [tag, scores] of Object.entries(byTag)) {
    const a = avg(scores);
    const diff = a - overall;
    if (Math.abs(diff) > threshold) {
      res.push({ tag, avg: a, overall, diff, direction: diff > 0 ? 'higher' : 'lower' });
    }
  }
  return res.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

// タグごとの平均推定1RMが全体平均から threshold を超えて乖離するタグを抽出
export function tag1RMCorrelation(logs = [], sets = [], threshold = 5) {
  const rmOf = {};
  for (const s of sets) rmOf[s.id] = s.estimated1RM;
  const all = sets.map((s) => s.estimated1RM).filter((v) => typeof v === 'number');
  const overall = avg(all);
  const byTag = {};
  for (const l of logs) {
    const rm = rmOf[l.setId];
    if (typeof rm !== 'number') continue;
    for (const t of l.tags || []) (byTag[t] ||= []).push(rm);
  }
  const res = [];
  for (const [tag, rms] of Object.entries(byTag)) {
    const a = avg(rms);
    const diff = a - overall;
    if (Math.abs(diff) > threshold) {
      res.push({ tag, avg: a, overall, diff, direction: diff > 0 ? 'higher' : 'lower' });
    }
  }
  return res.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/insights.js test/insights.test.js
git commit -m "feat: add rule-based insights logic with tests"
```

---

## Task 3: db.js に export/import 追加

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: db.js の末尾に追記**

`js/db.js` の末尾（`remove` 関数の後）に追加：
```js
const EXPORT_VERSION = 1;

export async function exportAll() {
  const data = {};
  for (const name of STORES) data[name] = await getAll(name);
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data };
}

export async function importAll(obj) {
  if (!obj || obj.version !== EXPORT_VERSION || !obj.data) {
    throw new Error('インポート形式が不正です');
  }
  for (const name of STORES) {
    const rows = obj.data[name];
    if (!Array.isArray(rows)) throw new Error(`データが不足: ${name}`);
    for (const row of rows) {
      if (!row || typeof row.id === 'undefined') throw new Error(`id欠損: ${name}`);
      await put(name, row);
    }
  }
}
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/db.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/db.js
git commit -m "feat: add exportAll/importAll to db"
```

---

## Task 4: 記録ビューにメモ＋定型タグを追加

**Files:**
- Modify: `js/views/workout.js`

- [ ] **Step 1: タグ定数とUIを追加**

`js/views/workout.js` の先頭付近、`const INTERVAL_SEC = 90;` の下に追加：
```js
export const SENSORY_TAGS = ['調子良い', '腹圧抜けた', 'フォーム崩れ', '対象筋に効いた', '関節に違和感', '軽く感じた'];
```

- [ ] **Step 2: ROM フィールドの直後にメモ＋タグUIを挿入**

`js/views/workout.js` の `el.innerHTML` 内、`可動域 ROM` の `</div>` ブロック（`<button data-v="cheating">チーティング</button></div></div>`）の直後、`<div id="w-error"` の前に挿入：
```js
      <div class="field"><label>定型タグ（複数可）</label>
        <div id="w-tags">
          ${SENSORY_TAGS.map((t) => `<button type="button" class="chip chip-tag" data-tag="${t}">${t}</button>`).join('')}
        </div></div>
      <div class="field"><label>メモ（任意）</label>
        <input id="w-note" class="input" placeholder="例: 3セット目から効きが浅い" /></div>
```

- [ ] **Step 3: state にメモ/タグを追加しトグルを実装**

`const state = { core: null, load: null, rom: 'full' };` を次に置き換え：
```js
  const state = { core: null, load: null, rom: 'full', tags: new Set(), note: '' };
```
`bindSeg(el, '#w-rom', (v) => (state.rom = v), 'full');` の直後に追加：
```js
  el.querySelectorAll('#w-tags .chip-tag').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.tag;
      if (state.tags.has(t)) { state.tags.delete(t); b.classList.remove('sel'); }
      else { state.tags.add(t); b.classList.add('sel'); }
    }));
  el.querySelector('#w-note').addEventListener('input', (e) => (state.note = e.target.value));
```

- [ ] **Step 4: 保存時に note/tags を sensoryLogs に含める**

`await put('sensoryLogs', { id: uid(), setId, core: state.core, muscleLoad: state.load, rom: state.rom, score });` を次に置き換え：
```js
    await put('sensoryLogs', { id: uid(), setId, core: state.core, muscleLoad: state.load,
      rom: state.rom, score, note: state.note, tags: [...state.tags] });
```

- [ ] **Step 5: 保存後にタグ選択をリセット**

`timer.start(INTERVAL_SEC);` の直前に追加：
```js
    state.tags.clear();
    state.note = '';
    el.querySelectorAll('#w-tags .chip-tag').forEach((b) => b.classList.remove('sel'));
    el.querySelector('#w-note').value = '';
```

- [ ] **Step 6: タグチップ用スタイルを追加**

`css/style.css` の末尾に追加：
```css
.chip-tag { background: var(--surface-2); border: 1px solid #2c2c2c; color: var(--muted);
  border-radius: 999px; padding: 8px 12px; margin: 0 6px 6px 0; font-size: 13px; cursor: pointer; }
.chip-tag.sel { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }
.spark { width: 100%; height: 44px; display: block; }
.spark path { fill: none; stroke: var(--accent); stroke-width: 2; }
```

- [ ] **Step 7: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`
その後サーバ起動中の preview をリロードし、記録タブでタグをトグル選択・メモ入力 → 保存できることを確認。

- [ ] **Step 8: コミット**

```bash
git add js/views/workout.js css/style.css
git commit -m "feat: add sensory memo and preset tags to workout recording"
```

---

## Task 5: インサイトビュー（insights.js）

**Files:**
- Create: `js/views/insights.js`
- Modify: `index.html`, `js/app.js`

- [ ] **Step 1: insights.js を実装**

`js/views/insights.js`:
```js
import { getAll } from '../db.js';
import { tagFrequency, tagScoreCorrelation, tag1RMCorrelation } from '../lib/insights.js';
import { escapeHtml } from './exercises.js';

export async function renderInsights(el) {
  const logs = await getAll('sensoryLogs');
  const sets = await getAll('sets');

  if (sets.length < 5) {
    el.innerHTML = `<h2 class="view-title">インサイト</h2>
      <div class="card"><p class="muted">データを蓄積中です（5セット以上で分析を表示）。現在 ${sets.length} セット。</p></div>`;
    return;
  }

  const recent = logs.slice(-30);
  const freq = tagFrequency(recent);
  const scoreCorr = tagScoreCorrelation(recent, 1.0);
  const rmCorr = tag1RMCorrelation(logs, sets, 5);

  const freqHtml = freq.length
    ? freq.map((f) => `<span class="chip">${escapeHtml(f.tag)} ×${f.count}</span>`).join('')
    : '<p class="muted">タグの記録がありません。</p>';

  const scoreHtml = scoreCorr.length
    ? scoreCorr.map((c) => `<div class="list-item">
        <span>${escapeHtml(c.tag)}</span>
        <span class="muted">品質スコアが全体より${c.direction === 'higher' ? '高い' : '低い'}傾向（平均 ${c.avg.toFixed(1)} / 全体 ${c.overall.toFixed(1)}）</span>
      </div>`).join('')
    : '<p class="muted">際立った傾向はまだありません。</p>';

  const rmHtml = rmCorr.length
    ? rmCorr.map((c) => `<div class="list-item">
        <span>${escapeHtml(c.tag)}</span>
        <span class="muted">推定1RMが全体より${c.direction === 'higher' ? '高い' : '低い'}傾向（平均 ${c.avg.toFixed(1)}kg / 全体 ${c.overall.toFixed(1)}kg）</span>
      </div>`).join('')
    : '<p class="muted">際立った傾向はまだありません。</p>';

  el.innerHTML = `
    <h2 class="view-title">インサイト</h2>
    <div class="card"><strong>よく使うタグ（直近30件）</strong><div style="margin-top:8px">${freqHtml}</div></div>
    <div class="card"><strong>タグ × 品質スコア</strong>${scoreHtml}</div>
    <div class="card"><strong>タグ × 推定1RM</strong>${rmHtml}</div>`;
}
```

- [ ] **Step 2: index.html のタブに追加**

`index.html` の `<nav class="tabbar">` 内、`履歴` ボタンの後に追加：
```html
    <button data-route="insights" class="tab">インサイト</button>
```

- [ ] **Step 3: app.js にルート登録**

`js/app.js` の import 群に追加：
```js
import { renderInsights } from './views/insights.js';
```
`routes` オブジェクトに追加（`history: renderHistory,` の後）：
```js
  insights: renderInsights,
```

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/insights.js && echo OK`
Expected: `OK`
preview をリロードし、5セット未満では案内文、5セット以上でタグ集計・相関が表示されることを確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/insights.js index.html js/app.js
git commit -m "feat: add insights view with tag frequency and correlations"
```

---

## Task 6: 履歴ビューに 1RM推移グラフを追加

**Files:**
- Modify: `js/views/history.js`

- [ ] **Step 1: import を追加**

`js/views/history.js` の先頭 import 群に追加：
```js
import { sparklinePath } from '../lib/chart.js';
```

- [ ] **Step 2: 種目カード内にグラフを描画**

`js/views/history.js` の各種目カードを生成する箇所で、PR行の直後にスパークラインを挿入する。`Object.entries(byEx).map(([id, list]) => ...)` 内のテンプレートを次に置き換え：
```js
    Object.entries(byEx).map(([id, list]) => {
      const chrono = [...list].sort((a, b) => a.createdAt - b.createdAt);
      const series = chrono.map((s) => s.estimated1RM);
      const d = sparklinePath(series, 300, 44);
      const chart = d
        ? `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="${d}" /></svg>`
        : '';
      return `
      <div class="card">
        <div class="list-item" style="border:none;padding:0 0 8px">
          <strong>${escapeHtml(nameOf(id))}</strong>
          <span class="pr-badge">PR ${prs[id].toFixed(1)}kg</span>
        </div>
        ${chart}
        ${list.slice(0, 8).map((s) => {
          const log = logs.find((l) => l.setId === s.id);
          const dt = new Date(s.createdAt);
          return `<div class="list-item">
            <span class="muted">${dt.getMonth() + 1}/${dt.getDate()}</span>
            <span>${s.weight}kg × ${s.reps}</span>
            <span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
```

- [ ] **Step 3: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/history.js && echo OK`
Expected: `OK`
preview をリロードし、履歴タブの各種目に折れ線グラフが表示されることを確認（複数セット記録後）。

- [ ] **Step 4: コミット**

```bash
git add js/views/history.js
git commit -m "feat: add estimated 1RM sparkline to history view"
```

---

## Task 7: ワークアウト振り返り＋セット編集/削除

**Files:**
- Create: `js/views/review.js`
- Modify: `index.html`, `js/app.js`

> 振り返り・編集・削除は履歴とは別タブ「振り返り」に分離し、`history.js` を肥大化させない。

- [ ] **Step 1: review.js を実装**

`js/views/review.js`:
```js
import { getAll, get, put, remove } from '../db.js';
import { estimate1RM, sensoryScore } from '../lib/calc.js';
import { escapeHtml } from './exercises.js';
import { SENSORY_TAGS } from './workout.js';

export async function renderReview(el) {
  const workouts = (await getAll('workouts')).sort((a, b) => (a.date < b.date ? 1 : -1));
  const sets = await getAll('sets');
  const exercises = await getAll('exercises');
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';

  if (!workouts.length) {
    el.innerHTML = `<h2 class="view-title">振り返り</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
    return;
  }

  el.innerHTML = `<h2 class="view-title">振り返り</h2>` +
    workouts.map((w) => {
      const wSets = sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.createdAt - b.createdAt);
      return `<div class="card">
        <strong>${w.date}</strong>
        <div class="field" style="margin-top:8px"><label>ワークアウトメモ</label>
          <input class="input wnote" data-w="${w.id}" value="${escapeHtml(w.note || '')}" placeholder="この日の振り返り" /></div>
        ${wSets.map((s) => `<div class="list-item">
            <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}</span>
            <span>
              <button class="btn btn-edit" data-edit="${s.id}" style="min-height:40px;padding:0 12px">編集</button>
              <button class="btn btn-danger" data-del="${s.id}" style="min-height:40px;padding:0 12px">削除</button>
            </span>
          </div>`).join('') || '<p class="muted">セットなし</p>'}
      </div>`;
    }).join('');

  el.querySelectorAll('.wnote').forEach((inp) =>
    inp.addEventListener('change', async () => {
      const w = await get('workouts', inp.dataset.w);
      if (w) { w.note = inp.value; await put('workouts', w); }
    }));

  el.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const setId = b.dataset.del;
      await remove('sets', setId);
      const logs = await getAll('sensoryLogs');
      for (const l of logs.filter((l) => l.setId === setId)) await remove('sensoryLogs', l.id);
      renderReview(el);
    }));

  el.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openEditor(el, b.dataset.edit)));
}

async function openEditor(el, setId) {
  const set = await get('sets', setId);
  const logs = await getAll('sensoryLogs');
  const log = logs.find((l) => l.setId === setId) || { core: 3, muscleLoad: 3, rom: 'full', tags: [], note: '' };
  const tagSet = new Set(log.tags || []);

  const modal = document.createElement('div');
  modal.className = 'card';
  modal.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;bottom:12px;overflow:auto;z-index:10;background:var(--surface)';
  modal.innerHTML = `
    <h2 class="view-title">セット編集</h2>
    <div class="row">
      <div class="field"><label>重量(kg)</label><input id="e-weight" class="input" type="number" value="${set.weight}" /></div>
      <div class="field"><label>回数</label><input id="e-reps" class="input" type="number" value="${set.reps}" /></div>
    </div>
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
    const weight = parseFloat(modal.querySelector('#e-weight').value);
    const reps = parseInt(modal.querySelector('#e-reps').value, 10);
    const core = parseInt(modal.querySelector('#e-core').value, 10);
    const load = parseInt(modal.querySelector('#e-load').value, 10);
    const err = modal.querySelector('#e-error');
    if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }
    set.weight = weight; set.reps = reps; set.estimated1RM = estimate1RM(weight, reps);
    await put('sets', set);
    const newLog = { id: log.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      setId, core, muscleLoad: load, rom,
      score: sensoryScore({ core, muscleLoad: load, rom }),
      note: modal.querySelector('#e-note').value, tags: [...tagSet] };
    await put('sensoryLogs', newLog);
    modal.remove();
    renderReview(el);
  });
}
```

- [ ] **Step 2: index.html のタブに追加**

`index.html` の `<nav class="tabbar">` 内、`インサイト` ボタンの後に追加：
```html
    <button data-route="review" class="tab">振り返り</button>
```

- [ ] **Step 3: app.js にルート登録**

`js/app.js` の import 群に追加：
```js
import { renderReview } from './views/review.js';
```
`routes` に追加（`insights: renderInsights,` の後）：
```js
  review: renderReview,
```

- [ ] **Step 4: 編集ボタン用スタイルを追加**

`css/style.css` の末尾に追加：
```css
.btn-edit { background: var(--surface-2); color: var(--text); margin-right: 6px; }
```

- [ ] **Step 5: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/review.js && echo OK`
Expected: `OK`
preview をリロードし、振り返りタブで日付別セット表示・メモ追記・編集（重量変更でPR反映）・削除ができることを確認。

- [ ] **Step 6: コミット**

```bash
git add js/views/review.js index.html js/app.js css/style.css
git commit -m "feat: add workout review with set edit/delete"
```

---

## Task 8: 設定ビュー（エクスポート/インポート）

**Files:**
- Create: `js/views/settings.js`
- Modify: `index.html`, `js/app.js`

- [ ] **Step 1: settings.js を実装**

`js/views/settings.js`:
```js
import { exportAll, importAll } from '../db.js';

export async function renderSettings(el) {
  el.innerHTML = `
    <h2 class="view-title">設定</h2>
    <div class="card">
      <strong>データのバックアップ</strong>
      <p class="muted">全データをJSONで書き出し・読み込みします。</p>
      <button id="s-export" class="btn btn-primary btn-block" style="margin-bottom:10px">エクスポート</button>
      <input id="s-file" type="file" accept="application/json" style="display:none" />
      <button id="s-import" class="btn btn-block">インポート</button>
      <div id="s-msg" class="muted" style="margin-top:10px"></div>
    </div>`;

  el.querySelector('#s-export').addEventListener('click', async () => {
    const obj = await exportAll();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gachi-fit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
    } catch (e) {
      msg.textContent = 'インポート失敗: ' + e.message;
    }
    fileInput.value = '';
  });
}
```

- [ ] **Step 2: index.html のタブに追加**

`index.html` の `<nav class="tabbar">` 内、`振り返り` ボタンの後に追加：
```html
    <button data-route="settings" class="tab">設定</button>
```

- [ ] **Step 3: app.js にルート登録**

`js/app.js` の import 群に追加：
```js
import { renderSettings } from './views/settings.js';
```
`routes` に追加（`review: renderReview,` の後）：
```js
  settings: renderSettings,
```

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/settings.js && echo OK`
Expected: `OK`
preview をリロードし、設定タブでエクスポート（JSONダウンロード）→ インポート（同ファイル選択で「完了」表示）を確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/settings.js index.html js/app.js
git commit -m "feat: add settings view with data export/import"
```

---

## Task 9: PWA キャッシュ更新・仕上げ・全体確認

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

- [ ] **Step 1: sw.js のキャッシュ資産と版を更新**

`js/sw.js` の `CACHE` と `ASSETS` を更新：
```js
const CACHE = 'gachi-fit-v2';
const ASSETS = [
  '.', 'index.html', 'css/style.css',
  'js/app.js', 'js/db.js', 'js/timer.js',
  'js/lib/calc.js', 'js/lib/chart.js', 'js/lib/insights.js',
  'js/views/home.js', 'js/views/workout.js', 'js/views/exercises.js',
  'js/views/history.js', 'js/views/insights.js', 'js/views/review.js', 'js/views/settings.js',
  'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
];
```

- [ ] **Step 2: README の機能セクションを更新**

`README.md` の `## 機能` リストの末尾に追加：
```markdown
- 定型タグ＋メモとルールベースのインサイト（タグ頻度・スコア/1RM相関）
- 推定1RM推移グラフ（自前SVG）
- ワークアウト振り返り・セット編集/削除
- データのエクスポート/インポート（JSON）
```

- [ ] **Step 3: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（calc 5 + chart 4 + insights 4 = 13 tests）

- [ ] **Step 4: 全フロー手動確認**

preview で：種目登録 → 記録（タグ＋メモ）を5セット以上 → 履歴グラフ → インサイト傾向 → 振り返りで編集/削除 → 設定でエクスポート/インポート → リロードでデータ永続を確認。

- [ ] **Step 5: コミット**

```bash
git add sw.js README.md
git commit -m "chore: update PWA cache and README for Phase2"
```

---

## Self-Review チェック結果
- **スペック網羅**：メモ＋タグ(T4)/ルール解析インサイト(T2,T5)/1RM推移グラフ(T1,T6)/export-import(T3,T8)/ワークアウト振り返り＋編集削除(T7)/PWA更新(T9) すべてタスク化済み。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`sparklinePath(values,width,height)`、`tagFrequency(logs)`/`tagScoreCorrelation(logs,threshold)`/`tag1RMCorrelation(logs,sets,threshold)`、`exportAll()`/`importAll(obj)`、`SENSORY_TAGS`（workout.js から export し review.js が import）、`sensoryLogs` の `note`/`tags` フィールド名が全タスクで一致。`get`/`put`/`remove`/`getAll` は Phase1 db.js の既存シグネチャに準拠。
