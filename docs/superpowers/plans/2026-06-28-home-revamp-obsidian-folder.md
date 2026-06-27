# ホーム再構成＋部位集計変更＋Obsidianフォルダ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームを再構成（カレンダー最上部・本日セット数廃止・推定1RMアコーディオン・部位別最高ボリュームを日付付き数値＋内訳タップ）し、部位キーを bodyPart の「/より前」に変更、測定開始日を 2026-06-28 に、Obsidian出力フォルダを指定可能にする。

**Architecture:** ボリューム集計ロジック（部位キー・開始日フィルタ・最高日付）を `js/lib/volume.js` に集約しテスト。home/workout/settings の表示・設定を更新。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 部位キー：`bodyPart` の `/` より前（trim）。空なら `category`、それも無ければ `その他`
- 測定開始日 `VOLUME_START_DATE = '2026-06-28'`
- 加算的変更・新規ストアなし
- 既存 `getAll`、`setVolume`、`localDateStr`、`escapeHtml` に準拠

---

## Task 1: ボリューム集計ロジックの拡張（volume.js）

**Files:**
- Modify: `js/lib/volume.js`
- Test: `test/volume.test.js`

**Interfaces:**
- Produces:
  - `VOLUME_START_DATE` (string)
  - `categoryKey(ex)` → string
  - `maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate, sinceDate?)` → `{cat:number}`（sinceDate 以前を除外）
  - `maxCategoryVolumeWithDate(sets, exById, wkById, sinceDate?)` → `{cat:{volume:number, date:string}}`

- [ ] **Step 1: 失敗するテストを追加**

`test/volume.test.js` の末尾に追加：
```js
import { categoryKey, maxCategoryVolumeWithDate, VOLUME_START_DATE } from '../js/lib/volume.js';

test('categoryKey uses bodyPart prefix before slash', () => {
  assert.equal(categoryKey({ bodyPart: '胸/上部' }), '胸');
  assert.equal(categoryKey({ bodyPart: '背中' }), '背中');
  assert.equal(categoryKey({ bodyPart: '', category: '肩' }), '肩');
  assert.equal(categoryKey({}), 'その他');
});

test('VOLUME_START_DATE is 2026-06-28', () => {
  assert.equal(VOLUME_START_DATE, '2026-06-28');
});

test('maxCategoryVolumeExcludingDate honors sinceDate filter', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' } };
  const wkById = { w0: { id: 'w0', date: '2026-06-27' }, w1: { id: 'w1', date: '2026-06-29' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w0', weight: 100, reps: 10, assistedReps: 0 }, // before start
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },  // counted
  ];
  const m = maxCategoryVolumeExcludingDate(sets, exById, wkById, null, '2026-06-28');
  assert.equal(m['胸'], 500);
});

test('maxCategoryVolumeWithDate returns max daily total and its date', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸/上部' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-28' }, w2: { id: 'w2', date: '2026-06-30' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 }, // 500
    { exerciseId: 'e1', workoutId: 'w2', weight: 100, reps: 8, assistedReps: 0 }, // 800
  ];
  const r = maxCategoryVolumeWithDate(sets, exById, wkById, '2026-06-28');
  assert.equal(r['胸'].volume, 800);
  assert.equal(r['胸'].date, '2026-06-30');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`categoryKey` 等が無い）

- [ ] **Step 3: volume.js を更新**

`js/lib/volume.js` 全体を次に置き換え：
```js
export const VOLUME_START_DATE = '2026-06-28';

// 1セットのボリューム。補助回数は重量を半減ずつ計上：係数 1 - 0.5^assistedReps
export function setVolume(weight, reps, assistedReps = 0) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  const a = Math.min(Number(assistedReps) || 0, r);
  const selfReps = r - a;
  const assistFactor = a > 0 ? (1 - Math.pow(0.5, a)) : 0;
  return w * (selfReps + assistFactor);
}

// 部位キー：bodyPart の「/」より前。空なら category、無ければ その他
export function categoryKey(ex) {
  if (ex && ex.bodyPart) {
    const head = ex.bodyPart.split('/')[0].trim();
    if (head) return head;
  }
  return (ex && ex.category) || 'その他';
}

// 指定日の部位別ボリューム合計
export function categoryVolumeForDate(sets, exById, wkById, date) {
  const out = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date !== date) continue;
    const cat = categoryKey(exById[s.exerciseId]);
    out[cat] = (out[cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  return out;
}

// excludeDate の日を除き、sinceDate 以前も除いた、部位別「日合計」の最大
export function maxCategoryVolumeExcludingDate(sets, exById, wkById, excludeDate, sinceDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk || wk.date === excludeDate) continue;
    if (sinceDate && wk.date < sinceDate) continue;
    const cat = categoryKey(exById[s.exerciseId]);
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

// 部位別に「日合計が最大の日」とその合計を返す（sinceDate 以降のみ）
export function maxCategoryVolumeWithDate(sets, exById, wkById, sinceDate) {
  const perDate = {};
  for (const s of sets) {
    const wk = wkById[s.workoutId];
    if (!wk) continue;
    if (sinceDate && wk.date < sinceDate) continue;
    const cat = categoryKey(exById[s.exerciseId]);
    (perDate[wk.date] ||= {});
    perDate[wk.date][cat] = (perDate[wk.date][cat] || 0) + setVolume(s.weight, s.reps, s.assistedReps);
  }
  const out = {};
  for (const date in perDate) {
    for (const cat in perDate[date]) {
      const v = perDate[date][cat];
      if (!out[cat] || v > out[cat].volume) out[cat] = { volume: v, date };
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
git commit -m "feat: volume categoryKey (bodyPart prefix), sinceDate filter, max-with-date"
```

---

## Task 2: ホーム画面の再構成（home.js）

**Files:**
- Modify: `js/views/home.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `maxCategoryVolumeWithDate`/`categoryKey`/`setVolume`/`VOLUME_START_DATE`（volume.js）

- [ ] **Step 1: import を更新**

`js/views/home.js` の volume import 行を次に置き換え：
```js
import { maxCategoryVolumeWithDate, categoryKey, setVolume, VOLUME_START_DATE } from '../lib/volume.js';
```
（`categoryVolumeForDate` は renderDayDetail/buildDayData でも使うため、別途下の Task 5 で扱う。ここでは home 冒頭の import を上記へ置換し、`categoryVolumeForDate` も併記する）
最終的な import 行：
```js
import { maxCategoryVolumeWithDate, categoryVolumeForDate, categoryKey, setVolume, VOLUME_START_DATE } from '../lib/volume.js';
```

- [ ] **Step 2: 集計と描画を再構成**

`js/views/home.js` の `const exById = ...` から `el.innerHTML = ...;`（カレンダーカードまで）のブロックを次に置き換え：
```js
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
  const maxVol = maxCategoryVolumeWithDate(sets, exById, wkById, VOLUME_START_DATE);
  const volEntries = Object.entries(maxVol).sort((a, b) => b[1].volume - a[1].volume);
  const volRows = volEntries.map(([cat, info]) => {
    const [, m, d] = info.date.split('-');
    return `<div class="vol-row" data-cat="${escapeHtml(cat)}" data-date="${info.date}">
      <div class="list-item">
        <span>${escapeHtml(cat)}</span>
        <span class="pr-badge">${Math.round(info.volume)}kg（${Number(m)}/${Number(d)}）</span>
      </div>
      <div class="vol-breakdown muted" style="display:none"></div>
    </div>`;
  }).join('');
  const volCard = volRows
    ? `<div class="card"><strong>部位別 最高ボリューム</strong>${volRows}</div>`
    : '';

  el.innerHTML = `
    <h2 class="view-title">ホーム</h2>
    <div class="card">
      <strong>トレーニングカレンダー</strong>
      <div id="home-cal" style="margin-top:10px"></div>
      <div id="home-day" style="margin-top:12px"></div>
    </div>
    ${countdownCard}
    <details class="card">
      <summary><strong>推定1RM</strong></summary>
      <div style="margin-top:10px">${prRows || '<p class="muted">まだ記録がありません。</p>'}</div>
    </details>
    ${volCard}`;
```

- [ ] **Step 3: 部位別ボリュームの内訳タップを実装**

`js/views/home.js` の `renderCalendar(...)` 呼び出しの後（`renderHome` 関数の閉じ括弧の直前）に追加：
```js
  el.querySelectorAll('.vol-row').forEach((row) => {
    row.querySelector('.list-item').addEventListener('click', async () => {
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

- [ ] **Step 4: 不要変数の削除**

`js/views/home.js` の `const todayCount = ...` 行を削除（本日セット数カードを廃止したため未使用）。

- [ ] **Step 5: スタイルを追加**

`css/style.css` の末尾に追加：
```css
.vol-row { border-bottom: 1px solid #1f1f1f; }
.vol-row .list-item { cursor: pointer; }
.vol-breakdown { padding: 4px 0 8px; }
details > summary { cursor: pointer; list-style: revert; }
```

- [ ] **Step 6: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/home.js && echo OK`
Expected: `OK`
preview のホームで：カレンダーが最上部、本日セット数なし、推定1RMがタップ展開、部位別最高ボリュームが「kg（M/D）」表示でバーなし、行タップで内訳展開を確認。

- [ ] **Step 7: コミット**

```bash
git add js/views/home.js css/style.css
git commit -m "feat: revamp home layout (calendar top, 1RM accordion, volume list with date/breakdown)"
```

---

## Task 3: 記録タブのバーを測定開始日基準に（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `maxCategoryVolumeExcludingDate(..., sinceDate)`、`VOLUME_START_DATE`

- [ ] **Step 1: import に VOLUME_START_DATE を追加**

`js/views/workout.js` の volume import 行を次に置き換え：
```js
import { categoryVolumeForDate, maxCategoryVolumeExcludingDate, categoryKey, VOLUME_START_DATE } from '../lib/volume.js';
```

- [ ] **Step 2: バーの部位判定と過去最高を更新**

`js/views/workout.js` の `refreshVolumeBar` 内、`const cat = (ex && ex.category) || 'その他';` を次に置き換え：
```js
    const cat = categoryKey(ex);
```
同関数内、`const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today)[cat] || 0;` を次に置き換え：
```js
    const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today, VOLUME_START_DATE)[cat] || 0;
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: record-tab volume bar uses bodyPart key and 2026-06-28 start"
```

---

## Task 4: 設定に Obsidian フォルダを追加（settings.js）

**Files:**
- Modify: `js/views/settings.js`

**Interfaces:**
- Produces: localStorage `obsidian_folder`

- [ ] **Step 1: フォルダ入力をvaultカードに追加**

`js/views/settings.js` の Obsidian vault カード内、`<button id="s-vault-save" ...>vault名を保存</button>` の直前に挿入：
```js
      <div class="field" style="margin-top:8px"><label>フォルダ（任意）</label>
        <input id="s-folder" type="text" class="input" value="${(localStorage.getItem('obsidian_folder') || '').replace(/"/g, '&quot;')}" placeholder="例: Training/GACHI-FIT" /></div>
```

- [ ] **Step 2: 保存ハンドラでフォルダも保存**

`js/views/settings.js` の `#s-vault-save` ハンドラを次に置き換え：
```js
  el.querySelector('#s-vault-save').addEventListener('click', () => {
    localStorage.setItem('obsidian_vault', el.querySelector('#s-vault').value.trim());
    localStorage.setItem('obsidian_folder', el.querySelector('#s-folder').value.trim().replace(/^\/+|\/+$/g, ''));
    el.querySelector('#s-msg').textContent = 'Obsidian設定を保存しました。';
  });
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/settings.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/settings.js
git commit -m "feat: add Obsidian output folder setting"
```

---

## Task 5: 日詳細のObsidian送信にフォルダを適用＋PWA更新（home.js / sw.js / README）

**Files:**
- Modify: `js/views/home.js`
- Modify: `sw.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: localStorage `obsidian_folder`

- [ ] **Step 1: renderDayDetail の Obsidian送信でフォルダを使う**

`js/views/home.js` の `#day-obsidian` クリックハンドラを次に置き換え：
```js
  box.querySelector('#day-obsidian').addEventListener('click', () => {
    const vault = (localStorage.getItem('obsidian_vault') || '').trim();
    if (!vault) { box.querySelector('#day-export-msg').textContent = '設定でvault名を登録してください。'; return; }
    const folder = (localStorage.getItem('obsidian_folder') || '').trim().replace(/^\/+|\/+$/g, '');
    const obsidianFile = folder ? `${folder}/${fileName}` : fileName;
    location.href = buildObsidianUri(vault, obsidianFile, workoutToMarkdown(data));
  });
```

- [ ] **Step 2: sw.js のキャッシュ版を更新**

`sw.js` の `const CACHE = 'gachi-fit-v11';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v12';
```

- [ ] **Step 3: README を更新**

`README.md` の Obsidian の行を次に置き換え：
```markdown
- Obsidian共有：日別トレーニングをMarkdownで送信／ダウンロード（設定でvault名・出力フォルダを登録）
```

- [ ] **Step 4: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（既存39 + volume追加4 = 43 tests）

- [ ] **Step 5: 全フロー手動確認**

preview で：設定でvault名＋フォルダ保存 → ホーム日詳細の「Obsidianに送る」で `file` に `フォルダ/gachi-fit-<日付>.md` が入ること（URIを確認）→ ホーム再構成（カレンダー最上部/1RMアコーディオン/部位別ボリューム日付＋内訳）→ 記録タブのバーが6/28以降基準、を確認。

- [ ] **Step 6: コミット**

```bash
git add js/views/home.js sw.js README.md
git commit -m "feat: apply Obsidian folder to send; bump cache v12; README"
```

---

## Self-Review チェック結果
- **スペック網羅**：部位キー(T1)/開始日フィルタ・最高日付(T1)/ホーム再構成・1RMアコーディオン・部位別日付＋内訳・本日セット数廃止(T2)/記録タブバー開始日(T3)/Obsidianフォルダ設定(T4)/送信適用・PWA(T5) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`categoryKey(ex)`、`VOLUME_START_DATE`、`maxCategoryVolumeExcludingDate(...,excludeDate,sinceDate)`、`maxCategoryVolumeWithDate(...)→{cat:{volume,date}}`、`setVolume`、localStorage `obsidian_folder`、`fileName`/`obsidianFile` が全タスクで一致。home の `categoryVolumeForDate` は Task 5 で renderDayDetail/buildDayData が引き続き使用（import に含む）。
