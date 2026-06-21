# ホームカレンダー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム画面に月間カレンダーを表示し、トレーニング実施日をマーク、日タップでその日の記録を下に展開する。

**Architecture:** 純粋ロジック `js/lib/calendar.js` で月グリッドを生成しテスト。表示部品 `js/views/calendar.js` が月切替・実施日マーク・日選択コールバックを担う。`home.js` が実施日Setを算出してカレンダーを描画し、選択日の詳細を描画する。新規ストアなし（読み取りのみ）。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 新規ストアなし（既存 `workouts`/`sets`/`sensoryLogs`/`places` の読み取りのみ）
- 週は日曜始まり
- 既存 `get`/`getAll`（db.js）、`formatMinutes`（lib/duration.js）に準拠

---

## Task 1: カレンダー純粋ロジック（calendar.js）

**Files:**
- Create: `js/lib/calendar.js`
- Test: `test/calendar.test.js`

**Interfaces:**
- Produces: `buildCalendarWeeks(year, month)` → `Array<Array<string|null>>`。`month` は 1-12、各セルは `'YYYY-MM-DD'` または `null`、各週は長さ7、日曜始まり

- [ ] **Step 1: 失敗するテストを書く**

`test/calendar.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarWeeks } from '../js/lib/calendar.js';

test('buildCalendarWeeks aligns first day under correct weekday (Sunday start)', () => {
  // 2026-06-01 は月曜。日曜始まりなので先頭セル(日)はnull、次が6/1
  const weeks = buildCalendarWeeks(2026, 6);
  assert.equal(weeks[0][0], null);
  assert.equal(weeks[0][1], '2026-06-01');
});

test('buildCalendarWeeks has all days of the month', () => {
  const weeks = buildCalendarWeeks(2026, 6);
  const flat = weeks.flat().filter(Boolean);
  assert.equal(flat.length, 30);
  assert.equal(flat[0], '2026-06-01');
  assert.equal(flat[flat.length - 1], '2026-06-30');
});

test('buildCalendarWeeks rows are length 7', () => {
  const weeks = buildCalendarWeeks(2026, 6);
  for (const w of weeks) assert.equal(w.length, 7);
});

test('buildCalendarWeeks handles February non-leap year', () => {
  const weeks = buildCalendarWeeks(2026, 2);
  const flat = weeks.flat().filter(Boolean);
  assert.equal(flat.length, 28);
  assert.equal(flat[flat.length - 1], '2026-02-28');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`calendar.js` が存在しない）

- [ ] **Step 3: calendar.js を実装**

`js/lib/calendar.js`:
```js
// 月のカレンダーグリッドを返す（日曜始まり）。month は 1-12。
// 各セルは 'YYYY-MM-DD' または null。各週は長さ7。
export function buildCalendarWeeks(year, month) {
  const pad = (n) => String(n).padStart(2, '0');
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstDay.getUTCDay(); // 0=日
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${pad(month)}-${pad(d)}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/calendar.js test/calendar.test.js
git commit -m "feat: add buildCalendarWeeks calendar grid logic with tests"
```

---

## Task 2: カレンダー表示部品（calendar.js view）＋スタイル

**Files:**
- Create: `js/views/calendar.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `buildCalendarWeeks`（Task 1）
- Produces: `renderCalendar(container, { trainedDates, initialDate, onSelect })` — `trainedDates` は `Set<string>`、`initialDate` は `Date`、`onSelect(dateStr)` をタップ時に呼ぶ。表示月は内部状態で前後月ボタンにより変化

- [ ] **Step 1: calendar.js を実装**

`js/views/calendar.js`:
```js
import { buildCalendarWeeks } from '../lib/calendar.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

// container に月カレンダーを描画。trainedDates の日はマーク、タップで onSelect(date)。
export function renderCalendar(container, { trainedDates = new Set(), initialDate = new Date(), onSelect } = {}) {
  let year = initialDate.getFullYear();
  let month = initialDate.getMonth() + 1; // 1-12
  const todayStr = `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`;
  let selected = null;

  function draw() {
    const weeks = buildCalendarWeeks(year, month);
    container.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1">‹</button>
        <strong>${year}年${month}月</strong>
        <button type="button" class="cal-nav" data-nav="1">›</button>
      </div>
      <div class="cal-grid cal-wd">${WD.map((w) => `<div class="cal-wdcell">${w}</div>`).join('')}</div>
      <div class="cal-grid">
        ${weeks.flat().map((d) => {
          if (!d) return '<div class="cal-cell cal-empty"></div>';
          const day = Number(d.slice(8, 10));
          const cls = ['cal-cell'];
          if (trainedDates.has(d)) cls.push('cal-trained');
          if (d === todayStr) cls.push('cal-today');
          if (d === selected) cls.push('cal-sel');
          return `<button type="button" class="${cls.join(' ')}" data-date="${d}">${day}</button>`;
        }).join('')}
      </div>`;

    container.querySelectorAll('.cal-nav').forEach((b) =>
      b.addEventListener('click', () => {
        month += Number(b.dataset.nav);
        if (month < 1) { month = 12; year -= 1; }
        else if (month > 12) { month = 1; year += 1; }
        draw();
      }));
    container.querySelectorAll('[data-date]').forEach((b) =>
      b.addEventListener('click', () => {
        selected = b.dataset.date;
        draw();
        onSelect && onSelect(selected);
      }));
  }

  draw();
}
```

- [ ] **Step 2: カレンダーのスタイルを追加**

`css/style.css` の末尾に追加：
```css
.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.cal-nav { min-width: 44px; min-height: 44px; font-size: 22px; font-weight: 800;
  background: var(--surface-2); color: var(--text); border: 1px solid #2c2c2c; border-radius: 10px; cursor: pointer; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-wd { margin-bottom: 4px; }
.cal-wdcell { text-align: center; font-size: 12px; color: var(--muted); padding: 4px 0; }
.cal-cell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  background: var(--surface-2); border: 1px solid #2c2c2c; border-radius: 10px;
  color: var(--text); font-size: 15px; font-weight: 700; cursor: pointer; }
.cal-empty { background: transparent; border: none; }
.cal-trained { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }
.cal-today { box-shadow: inset 0 0 0 2px var(--muted); }
.cal-sel { outline: 2px solid var(--text); }
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/calendar.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/calendar.js css/style.css
git commit -m "feat: add calendar view component with month navigation"
```

---

## Task 3: ホームにカレンダーと日詳細を統合（home.js）

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `renderCalendar`（Task 2）、`formatMinutes`（lib/duration.js）、`escapeHtml`（exercises.js）

- [ ] **Step 1: import を追加**

`js/views/home.js` の import 群を次に置き換え：
```js
import { getAll, get } from '../db.js';
import { computePRs } from '../lib/calc.js';
import { daysUntil } from '../lib/countdown.js';
import { formatMinutes } from '../lib/duration.js';
import { escapeHtml } from './exercises.js';
import { renderCalendar } from './calendar.js';
```

- [ ] **Step 2: カレンダーと詳細コンテナを描画に追加**

`js/views/home.js` の `el.innerHTML = ` テンプレートの、PR カード（`<div class="card"><strong>PR（推定1RM）</strong> ... </div>`）の直後（テンプレートリテラル末尾）に追加：
```js
    <div class="card">
      <strong>トレーニングカレンダー</strong>
      <div id="home-cal" style="margin-top:10px"></div>
      <div id="home-day" style="margin-top:12px"></div>
    </div>`;
```
（既存テンプレートの最後の `` ` `` の直前に上記カードを連結する。元の `${prRows ...}</div>\`;` を `${prRows ...}</div>` ＋ 上記カード ＋ `` ` `` の順にする）

- [ ] **Step 3: 実施日Set算出とカレンダー描画を追加**

`js/views/home.js` の `el.innerHTML = ...;` の直後（関数末尾）に追加：
```js
  const setWorkoutIds = new Set(sets.map((s) => s.workoutId));
  const trainedDates = new Set(
    workouts.filter((w) => setWorkoutIds.has(w.id)).map((w) => w.date)
  );

  renderCalendar(el.querySelector('#home-cal'), {
    trainedDates,
    initialDate: new Date(),
    onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises, nameOf }),
  });
}

async function renderDayDetail(box, date, { exercises, nameOf }) {
  const workouts = await getAll('workouts');
  const workout = workouts.find((w) => w.date === date);
  if (!workout) { box.innerHTML = `<p class="muted">${date}：この日の記録はありません</p>`; return; }
  const sets = (await getAll('sets')).filter((s) => s.workoutId === workout.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const logs = await getAll('sensoryLogs');
  let placeName = '';
  if (workout.placeId) {
    const place = (await getAll('places')).find((p) => p.id === workout.placeId);
    placeName = place ? place.name : '';
  }
  const meta = [
    placeName ? `場所: ${escapeHtml(placeName)}` : '',
    workout.durationSec ? `時間: ${formatMinutes(workout.durationSec)}` : '',
  ].filter(Boolean).join(' / ');

  const rows = sets.map((s) => {
    const log = logs.find((l) => l.setId === s.id);
    return `<div class="list-item">
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}</span>
      <span class="muted">1RM ${s.estimated1RM.toFixed(0)} / Q ${log ? log.score.toFixed(1) : '-'}</span>
    </div>`;
  }).join('') || '<p class="muted">セットなし</p>';

  box.innerHTML = `<strong>${date}</strong>
    ${meta ? `<div class="muted" style="margin:4px 0">${meta}</div>` : ''}
    ${rows}
    ${workout.note ? `<div class="muted" style="margin-top:8px">感想: ${escapeHtml(workout.note)}</div>` : ''}`;
}
```

> 注意：`renderHome` 内の既存変数 `nameOf` と `exercises` を `onSelect` クロージャ経由で `renderDayDetail` に渡す。`renderHome` の `}` は既存の関数終端を上記ブロックの `renderDayDetail` 定義前で閉じる形に置き換わる（Step 2 で innerHTML 後に処理を足すため、既存の関数末尾 `}` を削除し本ブロックで閉じる）。

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/home.js && echo OK`
Expected: `OK`
サーバ起動中の preview をリロードし、ホームにカレンダーが表示され、実施日がライムでマークされ、前後月ボタンで移動でき、日タップで下にその日の記録（無い日は「記録はありません」）が出ることを確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/home.js
git commit -m "feat: integrate training calendar and day detail into home"
```

---

## Task 4: PWA キャッシュ更新・全体確認

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.js のキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v6';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v7';
```
`sw.js` の ASSETS 内、`'js/lib/duration.js',` を含む行を次に置き換え（`calendar.js` を追加）：
```js
  'js/lib/gemini.js', 'js/lib/countdown.js', 'js/lib/seed.js', 'js/lib/image.js', 'js/lib/duration.js', 'js/lib/calendar.js',
```
`sw.js` の ASSETS 内、`'js/views/body.js', 'js/views/more.js', 'js/views/components.js', 'js/views/set-editor.js',` の行を次に置き換え（`calendar.js` view を追加）：
```js
  'js/views/body.js', 'js/views/more.js', 'js/views/components.js', 'js/views/set-editor.js', 'js/views/calendar.js',
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（既存27 + calendar 4 = 31 tests）

- [ ] **Step 3: 全フロー手動確認**

preview で：記録を数日分作成 → ホームのカレンダーで該当日がマーク → 前月/翌月移動 → 実施日タップで記録展開（場所・時間・感想・補助併記）→ 記録なし日タップで案内表示、を確認。

- [ ] **Step 4: コミット**

```bash
git add sw.js
git commit -m "chore: bump PWA cache v7 with calendar assets"
```

---

## Self-Review チェック結果
- **スペック網羅**：月グリッド生成(T1)/月表示・前後移動・実施日マーク・日タップ(T2)/ホーム統合・日詳細展開(T3)/SW更新(T4) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`buildCalendarWeeks(year, month)→週配列`、`renderCalendar(container,{trainedDates:Set,initialDate:Date,onSelect})`、`renderDayDetail(box,date,{exercises,nameOf})`、`formatMinutes`、`escapeHtml`、実施日Setは `'YYYY-MM-DD'` 文字列で一致。
