# 部位別ボリューム成長曲線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム画面の「部位別最高ボリューム」カードの各部位行を展開した時に、自己ベストの更新推移を階段状の折れ線グラフで表示する。

**Architecture:** `js/lib/volume.js` に日別集計とPR抽出の純粋関数を追加し、`js/lib/chart.js` に階段グラフ用のSVG path生成関数を追加する（既存の`sparklinePath`と同じ軽量方式）。`js/views/home.js` の既存タップ展開ハンドラにグラフ描画を組み込む。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- `VOLUME_START_DATE`（`'2026-06-28'`）以降のみ集計対象（既存の部位別ボリューム機能と同じ基準）
- グラフは自己ベストが更新された点のみを結ぶ階段状（水平→垂直の順）
- 自己ベスト更新点が2点未満の部位はグラフ・キャプションを表示せず、既存のセット内訳のみ表示
- 外部チャートライブラリは使わない（既存`sparklinePath`と同じSVG手書き方式）
- 既存 `categoryKey`/`setVolume`/`maxCategoryVolumeWithDate` 等の関数・`.vol-row`/`.vol-breakdown`のタップ展開動作に準拠、変更しない

---

## Task 1: 日別ボリューム集計とPR推移抽出（volume.js）

**Files:**
- Modify: `js/lib/volume.js`
- Modify: `test/volume.test.js`

**Interfaces:**
- Produces: `dailyCategoryVolumes(sets, exById, wkById, cat, sinceDate)` → `Array<{date: string, volume: number}>`（日付昇順）、`categoryPRProgression(dailyVolumes)` → `Array<{date: string, volume: number}>`（volumeが単調増加する部分列）

- [ ] **Step 1: 失敗するテストを書く**

`test/volume.test.js` の末尾に追加：
```js
import { dailyCategoryVolumes, categoryPRProgression } from '../js/lib/volume.js';

test('dailyCategoryVolumes filters by category and sinceDate, sorted ascending', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' }, e2: { id: 'e2', bodyPart: '背中' } };
  const wkById = {
    w0: { id: 'w0', date: '2026-06-27' },
    w1: { id: 'w1', date: '2026-06-30' },
    w2: { id: 'w2', date: '2026-06-28' },
  };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w0', weight: 100, reps: 10, assistedReps: 0 }, // sinceDate前なので除外
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e2', workoutId: 'w1', weight: 80, reps: 5, assistedReps: 0 }, // 別部位なので除外
    { exerciseId: 'e1', workoutId: 'w2', weight: 50, reps: 4, assistedReps: 0 },
  ];
  const result = dailyCategoryVolumes(sets, exById, wkById, '胸', '2026-06-28');
  assert.deepEqual(result, [
    { date: '2026-06-28', volume: 200 },
    { date: '2026-06-30', volume: 500 },
  ]);
});

test('dailyCategoryVolumes returns empty array when no matching data', () => {
  const result = dailyCategoryVolumes([], {}, {}, '胸', '2026-06-28');
  assert.deepEqual(result, []);
});

test('categoryPRProgression keeps only monotonically increasing points', () => {
  const daily = [
    { date: '2026-06-28', volume: 200 },
    { date: '2026-06-29', volume: 150 },
    { date: '2026-06-30', volume: 500 },
    { date: '2026-07-01', volume: 500 },
    { date: '2026-07-02', volume: 800 },
  ];
  assert.deepEqual(categoryPRProgression(daily), [
    { date: '2026-06-28', volume: 200 },
    { date: '2026-06-30', volume: 500 },
    { date: '2026-07-02', volume: 800 },
  ]);
});

test('categoryPRProgression with a single point returns that point', () => {
  const daily = [{ date: '2026-06-28', volume: 200 }];
  assert.deepEqual(categoryPRProgression(daily), daily);
});

test('categoryPRProgression with empty input returns empty array', () => {
  assert.deepEqual(categoryPRProgression([]), []);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`dailyCategoryVolumes`/`categoryPRProgression`が存在しない）

- [ ] **Step 3: volume.js に実装を追加**

`js/lib/volume.js` の末尾に追加：
```js

// 指定部位の日別ボリューム合計を日付昇順で返す（sinceDate以降のみ）
export function dailyCategoryVolumes(sets, exById, wkById, cat, sinceDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk) continue;
    if (sinceDate && wk.date < sinceDate) continue;
    if (categoryKey(exById[s.exerciseId]) !== cat) continue;
    perDate[wk.date] = (perDate[wk.date] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  return Object.entries(perDate)
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 日別ボリューム列から、自己ベストが更新された点だけを時系列順に残す（階段状の推移）
export function categoryPRProgression(dailyVolumes) {
  const out = [];
  let best = -Infinity;
  for (const point of dailyVolumes) {
    if (point.volume > best) {
      best = point.volume;
      out.push(point);
    }
  }
  return out;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/volume.js test/volume.test.js
git commit -m "feat: add daily category volume and PR progression extraction"
```

---

## Task 2: 階段グラフのSVGパス生成（chart.js）

**Files:**
- Modify: `js/lib/chart.js`
- Modify: `test/chart.test.js`

**Interfaces:**
- Produces: `stepPath(values, width, height, pad=2)` → string（SVG path `d` 属性値）

- [ ] **Step 1: 失敗するテストを書く**

`test/chart.test.js` の末尾に追加：
```js
import { stepPath } from '../js/lib/chart.js';

test('stepPath returns empty string for empty input', () => {
  assert.equal(stepPath([], 100, 40), '');
});

test('stepPath single point draws a centered horizontal dot path', () => {
  const d = stepPath([50], 100, 40);
  assert.match(d, /^M0,20/);
});

test('stepPath connects two points with a horizontal then vertical segment', () => {
  const d = stepPath([0, 10], 100, 40);
  assert.equal(d, 'M0,38 L100,38 L100,2');
});

test('stepPath connects three points in a staircase pattern', () => {
  const d = stepPath([0, 5, 10], 100, 40);
  assert.equal(d, 'M0,38 L50,38 L50,20 L100,20 L100,2');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`stepPath`が存在しない）

- [ ] **Step 3: chart.js に実装を追加**

`js/lib/chart.js` の末尾に追加：
```js

// 数値配列から階段状（水平→垂直の順に繋ぐ）SVG path の d 文字列を生成。
// min/max→y座標のマッピングは sparklinePath と同じ。
export function stepPath(values, width, height, pad = 2) {
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
  let d = `M${xOf(0)},${yOf(values[0])}`;
  for (let i = 1; i < n; i++) {
    d += ` L${xOf(i)},${yOf(values[i - 1])} L${xOf(i)},${yOf(values[i])}`;
  }
  return d;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/chart.js test/chart.test.js
git commit -m "feat: add step-chart SVG path generator"
```

---

## Task 3: ホーム画面に成長曲線グラフを組み込み（home.js）

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `dailyCategoryVolumes`/`categoryPRProgression`（`../lib/volume.js`、Task 1）、`stepPath`（`../lib/chart.js`、Task 2）
- Produces: `renderHome(el)` の外部シグネチャは変更なし

- [ ] **Step 1: importを追加**

`js/views/home.js` の9行目を次に置き換え：
```js
import { maxCategoryVolumeWithDate, categoryVolumeForDate, categoryKey, setVolume, VOLUME_START_DATE, dailyCategoryVolumes, categoryPRProgression } from '../lib/volume.js';
```
10行目（`import { workoutToMarkdown, buildObsidianUri, downloadText } from '../lib/obsidian.js';`）の直後に追加：
```js
import { stepPath } from '../lib/chart.js';
```

- [ ] **Step 2: 部位行タップ時のハンドラにグラフ描画を追加**

`js/views/home.js` の次のブロック（`.vol-row`のクリックイベントハンドラ）：
```js
  el.querySelectorAll('.vol-row').forEach((row) => {
    row.querySelector('.list-item').addEventListener('click', () => {
      const bd = row.querySelector('.vol-breakdown');
      if (bd.style.display === 'block') { bd.style.display = 'none'; return; }
      const cat = row.dataset.cat;
      const date = row.dataset.date;
      const dayWk = workouts.find((w) => w.date === date);
      const daySets = dayWk
        ? sets.filter((s) => s.workoutId === dayWk.id && categoryKey(exById[s.exerciseId]) === cat)
        : [];
      bd.innerHTML = daySets.length
        ? daySets.map((s) => `<div class="list-item" style="font-size:13px">
            <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}</span>
            <span class="muted">${Math.round(setVolume(s.weight, s.reps, s.assistedReps))}</span>
          </div>`).join('')
        : '<p class="muted">内訳なし</p>';
      bd.style.display = 'block';
    });
  });
```
を次に置き換え：
```js
  el.querySelectorAll('.vol-row').forEach((row) => {
    row.querySelector('.list-item').addEventListener('click', () => {
      const bd = row.querySelector('.vol-breakdown');
      if (bd.style.display === 'block') { bd.style.display = 'none'; return; }
      const cat = row.dataset.cat;
      const date = row.dataset.date;
      const dayWk = workouts.find((w) => w.date === date);
      const daySets = dayWk
        ? sets.filter((s) => s.workoutId === dayWk.id && categoryKey(exById[s.exerciseId]) === cat)
        : [];

      const progression = categoryPRProgression(dailyCategoryVolumes(sets, exById, wkById, cat, VOLUME_START_DATE));
      let chartHtml = '';
      if (progression.length >= 2) {
        const d = stepPath(progression.map((p) => p.volume), 300, 44);
        const first = progression[0];
        const last = progression[progression.length - 1];
        chartHtml = `<svg class="spark" viewBox="0 0 300 44" preserveAspectRatio="none"><path d="${d}" /></svg>
          <div class="muted" style="font-size:12px;margin:2px 0 8px">${first.date} ${Math.round(first.volume)}kg → ${last.date} ${Math.round(last.volume)}kg</div>`;
      }

      const breakdownHtml = daySets.length
        ? daySets.map((s) => `<div class="list-item" style="font-size:13px">
            <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}</span>
            <span class="muted">${Math.round(setVolume(s.weight, s.reps, s.assistedReps))}</span>
          </div>`).join('')
        : '<p class="muted">内訳なし</p>';

      bd.innerHTML = chartHtml + breakdownHtml;
      bd.style.display = 'block';
    });
  });
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/home.js && echo OK`
Expected: `OK`

- [ ] **Step 4: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存57件＋Task1・Task2の追加分がそのまま通ること）

- [ ] **Step 5: ブラウザで動作確認**

preview で、同じ部位（例：胸）のセットを異なる日に複数回記録した状態を作り、ホーム画面で：
- 「部位別最高ボリューム」カードのその部位行をタップ→階段グラフと「開始日 ○kg → 現在 △kg」のキャプションが、既存のセット内訳の上に表示される
- 1回しか記録していない部位（自己ベスト更新点が1点のみ）の行をタップ→グラフは表示されず、既存のセット内訳のみ表示される
- 同じ行をもう一度タップ→展開が閉じる（既存動作に回帰がないこと）
- コンソールにエラーが出ていないこと

- [ ] **Step 6: コミット**

```bash
git add js/views/home.js
git commit -m "feat: show volume PR progression chart in home category breakdown"
```

---

## Task 4: PWAキャッシュ更新

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.jsのキャッシュ版を更新**

`sw.js` の `const CACHE = 'gachi-fit-v16';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v17';
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: PWA cache v17 for volume growth chart"
```

---

## Self-Review チェック結果
- **スペック網羅**：日別集計・PR推移抽出（Task1）・階段グラフSVG生成（Task2）・ホーム画面組み込み（Task3）・2点未満は非表示（Task3 Step2の`progression.length >= 2`）・PWA更新（Task4）すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`dailyCategoryVolumes(sets, exById, wkById, cat, sinceDate)`→`{date,volume}[]`、`categoryPRProgression(dailyVolumes)`→`{date,volume}[]`、`stepPath(values, width, height, pad=2)`→string、がTask1・Task2・Task3で一貫。Task3での呼び出し `stepPath(progression.map((p) => p.volume), 300, 44)` は Task2 のシグネチャと一致（`pad`省略でデフォルト2を使用）。
