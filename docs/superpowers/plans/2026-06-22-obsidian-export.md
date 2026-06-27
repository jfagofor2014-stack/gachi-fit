# Obsidian共有 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1日のトレーニングをMarkdown化し、ホーム日詳細から Obsidian に送る／.md ダウンロードできるようにする。

**Architecture:** Markdown生成とURI構築を純粋関数 `js/lib/obsidian.js` に置きテスト。設定にvault名入力、ホーム日詳細に2ボタンを追加。読み取りのみ（新規ストアなし）。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- vault名は localStorage `obsidian_vault`
- ファイル名は `gachi-fit-<date>.md`、フロントマター tags は `[gachi-fit]`
- Voice Journal方式（`obsidian://new?vault=&file=&content=`）
- 既存 `getAll`、`categoryVolumeForDate`（lib/volume.js）、`formatMinutes`、`escapeHtml` に準拠

---

## Task 1: Markdown生成とURI（obsidian.js）

**Files:**
- Create: `js/lib/obsidian.js`
- Test: `test/obsidian.test.js`

**Interfaces:**
- Produces:
  - `workoutToMarkdown(data)` → string（フロントマター＋本文）
  - `buildObsidianUri(vault, fileName, content)` → string
  - `downloadText(text, fileName, mime?)` → void（ブラウザ専用、テスト対象外）
  - `data` の形：`{ date, place, durationMin, note, volume:{cat:num}, exercises:[{name,category,sets:[{weight,reps,assistedReps,estimated1RM,tags:[],note}]}] }`

- [ ] **Step 1: 失敗するテストを書く**

`test/obsidian.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutToMarkdown, buildObsidianUri } from '../js/lib/obsidian.js';

const sample = {
  date: '2026-06-22',
  place: '〇〇ジム',
  durationMin: 90,
  note: '胸の張りが良い',
  volume: { 胸: 600 },
  exercises: [
    { name: 'ベンチプレス', category: '胸', sets: [
      { weight: 100, reps: 6, assistedReps: 0, estimated1RM: 120, tags: ['調子良い'], note: '' },
      { weight: 100, reps: 5, assistedReps: 2, estimated1RM: 116, tags: [], note: '効き浅い' },
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
  assert.match(md, /- 100kg × 5（補助2）（推定1RM 116）/);
  assert.match(md, /タグ: 調子良い/);
  assert.match(md, /メモ: 効き浅い/);
  assert.match(md, /## 感想\n胸の張りが良い/);
});

test('workoutToMarkdown omits empty place and note', () => {
  const md = workoutToMarkdown({ date: '2026-06-22', place: '', durationMin: 0, note: '', volume: {}, exercises: [] });
  assert.doesNotMatch(md, /place:/);
  assert.doesNotMatch(md, /duration_min:/);
  assert.doesNotMatch(md, /## 感想/);
  assert.match(md, /# 2026-06-22 トレーニング/);
});

test('buildObsidianUri encodes vault, file, content', () => {
  const uri = buildObsidianUri('My Vault', 'gachi-fit-2026-06-22.md', '# 見出し');
  assert.match(uri, /^obsidian:\/\/new\?/);
  assert.match(uri, /vault=My%20Vault/);
  assert.match(uri, /file=gachi-fit-2026-06-22\.md/);
  assert.match(uri, /content=%23%20/);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`obsidian.js` が存在しない）

- [ ] **Step 3: obsidian.js を実装**

`js/lib/obsidian.js`:
```js
// 1日分の整形済みデータから Obsidian 用 Markdown を生成する（純粋関数）
export function workoutToMarkdown(data) {
  const fm = ['---', `date: ${data.date}`];
  if (data.place) fm.push(`place: ${data.place}`);
  if (data.durationMin) fm.push(`duration_min: ${data.durationMin}`);
  for (const [cat, v] of Object.entries(data.volume || {})) fm.push(`volume_${cat}: ${v}`);
  fm.push('tags: [gachi-fit]');
  fm.push('---');

  const body = [`# ${data.date} トレーニング`];
  const meta = [];
  if (data.place) meta.push(`場所: ${data.place}`);
  if (data.durationMin) meta.push(`時間: ${data.durationMin}分`);
  if (meta.length) { body.push(''); body.push(meta.join(' / ')); }

  for (const ex of data.exercises || []) {
    body.push('');
    body.push(`## ${ex.name}${ex.category ? `（${ex.category}）` : ''}`);
    for (const s of ex.sets) {
      let line = `- ${s.weight}kg × ${s.reps}`;
      if (s.assistedReps) line += `（補助${s.assistedReps}）`;
      line += `（推定1RM ${Math.round(s.estimated1RM)}）`;
      const extras = [];
      if (s.tags && s.tags.length) extras.push(`タグ: ${s.tags.join('、')}`);
      if (s.note) extras.push(`メモ: ${s.note}`);
      if (extras.length) line += ` — ${extras.join(' / ')}`;
      body.push(line);
    }
  }
  if (data.note) { body.push(''); body.push('## 感想'); body.push(data.note); }

  return fm.join('\n') + '\n\n' + body.join('\n') + '\n';
}

export function buildObsidianUri(vault, fileName, content) {
  const enc = encodeURIComponent;
  return `obsidian://new?vault=${enc(vault)}&file=${enc(fileName)}&content=${enc(content)}`;
}

// ブラウザ専用：テキストを .md としてダウンロード
export function downloadText(text, fileName, mime = 'text/markdown') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/obsidian.js test/obsidian.test.js
git commit -m "feat: add Obsidian markdown/uri builders with tests"
```

---

## Task 2: 設定に Obsidian vault名を追加（settings.js）

**Files:**
- Modify: `js/views/settings.js`

**Interfaces:**
- Produces: localStorage `obsidian_vault` の保存UI

- [ ] **Step 1: vault入力カードを追加**

`js/views/settings.js` の `renderSettings` 内、`<strong>Gemini APIキー</strong>` のカードの直後（`</div>` の後）に挿入する。Gemini APIキーカードを閉じる `</div>` の直後、目標カードの前に追加：
```js
    <div class="card">
      <strong>Obsidian vault名</strong>
      <p class="muted">「Obsidianに送る」で使用します。</p>
      <input id="s-vault" type="text" class="input" value="${(localStorage.getItem('obsidian_vault') || '').replace(/"/g, '&quot;')}" placeholder="例: MyVault" />
      <button id="s-vault-save" class="btn btn-primary btn-block" style="margin-top:10px">vault名を保存</button>
    </div>
```

- [ ] **Step 2: 保存ハンドラを追加**

`js/views/settings.js` の `#s-key-save` のハンドラ登録の直後に追加：
```js
  el.querySelector('#s-vault-save').addEventListener('click', () => {
    localStorage.setItem('obsidian_vault', el.querySelector('#s-vault').value.trim());
    el.querySelector('#s-msg').textContent = 'Obsidian vault名を保存しました。';
  });
```

- [ ] **Step 3: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/settings.js && echo OK`
Expected: `OK`

- [ ] **Step 4: コミット**

```bash
git add js/views/settings.js
git commit -m "feat: add Obsidian vault setting"
```

---

## Task 3: ホーム日詳細にエクスポートボタンを追加（home.js）

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `workoutToMarkdown`/`buildObsidianUri`/`downloadText`（obsidian.js）、`categoryVolumeForDate`（volume.js）

- [ ] **Step 1: import を追加**

`js/views/home.js` の import 群に追加：
```js
import { categoryVolumeForDate } from '../lib/volume.js';
import { workoutToMarkdown, buildObsidianUri, downloadText } from '../lib/obsidian.js';
```
（既存の `import { maxCategoryVolumeExcludingDate } from '../lib/volume.js';` はそのまま残す）

- [ ] **Step 2: renderDayDetail に整形・ボタンを追加**

`js/views/home.js` の `renderDayDetail` 内、`const sets = (await getAll('sets')).filter(...)` の直後に sensoryLogs 取得を追加：
```js
  const logs = await getAll('sensoryLogs');
```
`renderDayDetail` 末尾の `box.innerHTML = ...;` を次に置き換え（ボタン追加とハンドラ）：
```js
  box.innerHTML = `<strong>${date}</strong>
    ${meta ? `<div class="muted" style="margin:4px 0">${meta}</div>` : ''}
    ${rows}
    ${workout.note ? `<div class="muted" style="margin-top:8px">感想: ${escapeHtml(workout.note)}</div>` : ''}
    <div class="row" style="margin-top:10px">
      <button id="day-obsidian" class="btn btn-primary">Obsidianに送る</button>
      <button id="day-md" class="btn">Markdown DL</button>
    </div>
    <div id="day-export-msg" class="muted" style="margin-top:6px"></div>`;

  const data = buildDayData(date, workout, sets, exercises, placeName, logs);
  const fileName = `gachi-fit-${date}.md`;
  box.querySelector('#day-obsidian').addEventListener('click', () => {
    const vault = (localStorage.getItem('obsidian_vault') || '').trim();
    if (!vault) { box.querySelector('#day-export-msg').textContent = '設定でvault名を登録してください。'; return; }
    location.href = buildObsidianUri(vault, fileName, workoutToMarkdown(data));
  });
  box.querySelector('#day-md').addEventListener('click', () => {
    downloadText(workoutToMarkdown(data), fileName);
  });
```

- [ ] **Step 3: buildDayData ヘルパーを追加**

`js/views/home.js` の `renderDayDetail` 関数の閉じ括弧 `}` の直後に追加：
```js
function buildDayData(date, workout, sets, exercises, placeName, logs) {
  const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const wkById = { [workout.id]: workout };
  const volRaw = categoryVolumeForDate(sets, exById, wkById, date);
  const volume = {};
  for (const [c, v] of Object.entries(volRaw)) volume[c] = Math.round(v);

  const order = [];
  const grouped = {};
  for (const s of sets) {
    if (!grouped[s.exerciseId]) { grouped[s.exerciseId] = []; order.push(s.exerciseId); }
    const log = logs.find((l) => l.setId === s.id) || {};
    grouped[s.exerciseId].push({
      weight: s.weight, reps: s.reps, assistedReps: s.assistedReps || 0,
      estimated1RM: s.estimated1RM, tags: log.tags || [], note: log.note || '',
    });
  }
  const exercisesData = order.map((id) => ({
    name: exById[id]?.name || '?', category: exById[id]?.category || '', sets: grouped[id],
  }));
  return {
    date,
    place: placeName || '',
    durationMin: workout.durationSec ? Math.round(workout.durationSec / 60) : 0,
    note: workout.note || '',
    volume,
    exercises: exercisesData,
  };
}
```

- [ ] **Step 4: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/home.js && echo OK`
Expected: `OK`
preview で記録のある日をタップ→「Obsidianに送る」「Markdown DL」が出る、vault未設定でメッセージ、Markdown DL でファイル取得を確認。

- [ ] **Step 5: コミット**

```bash
git add js/views/home.js
git commit -m "feat: add Obsidian send and markdown download to home day detail"
```

---

## Task 4: PWA キャッシュ更新・全体確認

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.js のキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v10';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v11';
```
`sw.js` の ASSETS 内、`'js/lib/timerange.js', 'js/lib/volume.js',` の行を次に置き換え：
```js
  'js/lib/duration.js', 'js/lib/calendar.js', 'js/lib/localdate.js', 'js/lib/timerange.js', 'js/lib/volume.js', 'js/lib/obsidian.js',
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（既存36 + obsidian 3 = 39 tests）

- [ ] **Step 3: README にObsidian項を追加**

`README.md` の `## 機能` リスト末尾に追加：
```markdown
- Obsidian共有：日別トレーニングをMarkdownで送信／ダウンロード（設定でvault名を登録）
```

- [ ] **Step 4: 全フロー手動確認**

preview で：設定でvault名保存 → 記録のある日をホームカレンダーでタップ → Markdown DL の内容（フロントマター・種目・セット・ボリューム・感想）確認 → 「Obsidianに送る」でURI遷移（実機はObsidianが開く）。

- [ ] **Step 5: コミット**

```bash
git add sw.js README.md
git commit -m "chore: PWA cache v11 and README for Obsidian export"
```

---

## Self-Review チェック結果
- **スペック網羅**：Markdown生成(T1)/URI(T1)/DL(T1)/vault設定(T2)/日詳細ボタン＋整形(T3)/SW・README(T4) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`workoutToMarkdown(data)`、`buildObsidianUri(vault,fileName,content)`、`downloadText(text,fileName,mime?)`、`buildDayData(...)→data`、`categoryVolumeForDate`、localStorage `obsidian_vault`、ファイル名 `gachi-fit-<date>.md` が全タスクで一致。`data` の構造（volume/exercises/sets フィールド）が T1 テストと T3 整形で一致。
