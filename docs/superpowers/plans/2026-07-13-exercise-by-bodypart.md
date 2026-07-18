# 種目登録フォーム整理・記録タブの部位→種目2段選択 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メニュー管理の種目登録フォームを「主要部位＋詳細」の2段構成に統一し、記録タブの通常/ドロップセットのメイン種目選択を部位→種目の2段選択に変更する。

**Architecture:** `js/views/exercises.js` の登録フォーム・保存ロジック・一覧表示を変更する。`js/views/workout.js` の `#w-ex-card` に部位セグメントボタンを追加し、既存の `categoryKey`（`js/lib/volume.js`）でグルーピングして種目セレクトを絞り込む。データ構造（`exercises`ストアのフィールド）は変更しない。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- `exercises` ストアのフィールドは `{id, name, bodyPart, category, cuePresets, setPattern}` のまま変更しない
- 保存時、`bodyPart` は `category + (detail ? '/' + detail : '')` として組み立てる
- 記録タブの部位→種目2段選択は通常/ドロップセットのメイン種目選択（`#w-ex-card`）のみが対象。スーパーセットの各スロット選択は変更しない
- 部位のグルーピングは既存の `categoryKey(ex)`（`js/lib/volume.js`）を再利用する
- 既存データの移行は行わない
- 既存 `BODY_PARTS`（`js/views/exercises.js` からexport済み）、`searchPresets`、`put`/`getAll`/`remove`/`uid` に準拠

---

## Task 1: 種目登録フォームを主要部位＋詳細の2段構成に整理（exercises.js）

**Files:**
- Modify: `js/views/exercises.js`

**Interfaces:**
- Produces: `renderExercises(el)` の外部シグネチャは変更なし。`exercises`ストアに書き込む `bodyPart` は常に `category`（詳細なしなら`category`単体、ありなら`category/detail`）になる

- [ ] **Step 1: フォームのフィールドを入れ替え**

`js/views/exercises.js` の次のブロック：
```js
      <div class="field"><label>種目名</label>
        <input id="ex-name" class="input" placeholder="例: ベンチプレス" /></div>
      <div class="field"><label>部位（細分化可）</label>
        <input id="ex-part" class="input" placeholder="例: 胸 / 上部" /></div>
      <div class="field"><label>主要部位</label>
        <select id="ex-cat" class="input">
          ${BODY_PARTS.map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select></div>
```
を次に置き換え：
```js
      <div class="field"><label>種目名</label>
        <input id="ex-name" class="input" placeholder="例: ベンチプレス" /></div>
      <div class="field"><label>主要部位</label>
        <select id="ex-cat" class="input">
          ${BODY_PARTS.map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select></div>
      <div class="field"><label>詳細（任意）</label>
        <input id="ex-detail" class="input" placeholder="例: 上部" /></div>
```

- [ ] **Step 2: プリセットチップの反映先を変更**

`js/views/exercises.js` の次のブロック：
```js
    el.querySelectorAll('#ex-search-results [data-preset-name]').forEach((chip) =>
      chip.addEventListener('click', () => {
        el.querySelector('#ex-name').value = chip.dataset.presetName;
        el.querySelector('#ex-part').value = chip.dataset.presetPart;
        el.querySelector('#ex-cat').value = chip.dataset.presetCat;
        el.querySelector('#ex-search').value = '';
        el.querySelector('#ex-search-results').innerHTML = '';
      }));
```
を次に置き換え：
```js
    el.querySelectorAll('#ex-search-results [data-preset-name]').forEach((chip) =>
      chip.addEventListener('click', () => {
        el.querySelector('#ex-name').value = chip.dataset.presetName;
        el.querySelector('#ex-cat').value = chip.dataset.presetCat;
        el.querySelector('#ex-detail').value = chip.dataset.presetPart.split('/').slice(1).join('/');
        el.querySelector('#ex-search').value = '';
        el.querySelector('#ex-search-results').innerHTML = '';
      }));
```

- [ ] **Step 3: 保存ロジックでbodyPartを組み立てる**

`js/views/exercises.js` の次のブロック：
```js
  el.querySelector('#ex-save').addEventListener('click', async () => {
    const name = el.querySelector('#ex-name').value.trim();
    const bodyPart = el.querySelector('#ex-part').value.trim();
    const cuePresets = el.querySelector('#ex-cues').value
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (!name) { el.querySelector('#ex-error').textContent = '種目名を入力してください'; return; }
    const category = el.querySelector('#ex-cat').value;
    await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern, category });
    renderExercises(el);
  });
```
を次に置き換え：
```js
  el.querySelector('#ex-save').addEventListener('click', async () => {
    const name = el.querySelector('#ex-name').value.trim();
    const category = el.querySelector('#ex-cat').value;
    const detail = el.querySelector('#ex-detail').value.trim();
    const bodyPart = detail ? `${category}/${detail}` : category;
    const cuePresets = el.querySelector('#ex-cues').value
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (!name) { el.querySelector('#ex-error').textContent = '種目名を入力してください'; return; }
    await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern, category });
    renderExercises(el);
  });
```

- [ ] **Step 4: 一覧表示の重複した部位チップを削除**

`js/views/exercises.js` の次のブロック：
```js
  list.innerHTML = exercises.map((e) => `
    <div class="card">
      <div class="list-item" style="border:none;padding:0">
        <div>
          <strong>${escapeHtml(e.name)}</strong>
          <span class="muted"> ${escapeHtml(e.bodyPart || '')}</span>
          <div>${(e.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</div>
          ${e.category ? `<span class="chip">${escapeHtml(e.category)}</span>` : ''}
          <span class="chip">${escapeHtml(e.setPattern || '通常')}</span>
        </div>
        <button class="btn btn-danger" data-del="${e.id}">削除</button>
      </div>
    </div>`).join('');
```
を次に置き換え：
```js
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
```

- [ ] **Step 5: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/exercises.js && echo OK`
Expected: `OK`

- [ ] **Step 6: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存66件がそのまま通ること。exercises.jsはビュー層のため新規テストなし）

- [ ] **Step 7: ブラウザで動作確認**

preview のその他タブ→メニュー管理で：
- フォームが「種目名」「主要部位」「詳細（任意）」の順で表示される
- 主要部位「肩」・詳細「前部」で登録→一覧に「肩/前部」と表示され、部位チップの重複がないこと
- 詳細を空のまま主要部位「胸」で登録→一覧に「胸」とだけ表示されること
- プリセット検索で「ベンチ」をタップ→主要部位に「胸」、詳細に「上部」が自動入力されること
- コンソールにエラーが出ていないこと

- [ ] **Step 8: コミット**

```bash
git add js/views/exercises.js
git commit -m "feat: unify exercise registration form into category select plus optional detail"
```

---

## Task 2: 記録タブのメイン種目選択を部位→種目の2段に変更（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `BODY_PARTS`（`./exercises.js`、Task 1で変更なし・既存export）、`categoryKey`（`../lib/volume.js`、既存）
- Produces: `renderWorkout(el)` の外部シグネチャは変更なし

- [ ] **Step 1: BODY_PARTSをimport**

`js/views/workout.js` の10行目を次に置き換え：
```js
import { escapeHtml, BODY_PARTS } from './exercises.js';
```

- [ ] **Step 2: 種目選択カードのHTMLを部位セグメント＋種目セレクトに変更**

`js/views/workout.js` の次のブロック：
```js
    <div class="card" id="w-ex-card">
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input">
          ${exercises.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>
```
を次に置き換え：
```js
    <div class="card" id="w-ex-card">
      <div class="field"><label>部位</label>
        <div class="seg" id="w-ex-part-seg" style="margin-top:8px"></div></div>
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input"></select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>
```

- [ ] **Step 3: 部位グルーピング・部位セグメント・種目セレクトの描画関数を追加**

`js/views/workout.js` の次の行：
```js
  const exerciseName = (id) => exercises.find((e) => e.id === id)?.name || '?';

  function defaultSSExerciseIds() {
```
を次に置き換え（`exerciseName` の行と `defaultSSExerciseIds` の間に挿入）：
```js
  const exerciseName = (id) => exercises.find((e) => e.id === id)?.name || '?';

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

  function renderExPartSeg() {
    el.querySelector('#w-ex-part-seg').innerHTML = exParts
      .map((p) => `<button data-p="${escapeHtml(p)}" class="${p === currentExPart ? 'sel' : ''}">${escapeHtml(p)}</button>`).join('');
    el.querySelectorAll('#w-ex-part-seg button').forEach((b) =>
      b.addEventListener('click', () => {
        currentExPart = b.dataset.p;
        renderExPartSeg();
        renderExSelect();
        refreshPR();
        refreshVolumeBar();
      }));
  }

  function renderExSelect() {
    const list = exPartGroups[currentExPart] || [];
    el.querySelector('#w-ex').innerHTML = list
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('');
  }

  function defaultSSExerciseIds() {
```

- [ ] **Step 4: 初期描画時に部位セグメント・種目セレクトを描画**

`js/views/workout.js` の次のブロック：
```js
  applyMode('normal');
  refreshPR();
  await renderToday(el, exercises);
}
```
を次に置き換え：
```js
  renderExPartSeg();
  renderExSelect();
  applyMode('normal');
  refreshPR();
  await renderToday(el, exercises);
}
```

- [ ] **Step 5: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 6: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存66件がそのまま通ること）

- [ ] **Step 7: ブラウザで動作確認**

preview で、複数の部位にまたがる種目（例：胸の種目2つ、背中の種目1つ）を登録した状態で記録タブを開き：
- 「部位」に、種目が登録されている部位だけボタンとして表示される（種目のない部位は出ない）
- 初期状態で最初の部位が選択され、その部位の種目だけが「種目」セレクトに表示される
- 別の部位ボタンをタップ→「種目」セレクトの中身が切り替わり、先頭の種目が自動選択される。PR表示・部位別ボリュームバーもその種目・部位に応じて更新される
- 通常モードでセットを保存→保存された種目が正しい（選択中の種目のまま）
- スーパーセットモードに切り替え→各スロットの種目選択は従来どおり全種目のフラットなリストのままであること（回帰がないこと）
- コンソールにエラーが出ていないこと

- [ ] **Step 8: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: pick main exercise via body-part then filtered exercise list"
```

---

## Task 3: PWAキャッシュ更新

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.jsのキャッシュ版を更新**

`sw.js` の `const CACHE = 'gachi-fit-v17';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v18';
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: PWA cache v18 for exercise form and body-part picker"
```

---

## Self-Review チェック結果
- **スペック網羅**：登録フォームの主要部位＋詳細統一（Task1）・プリセットチップ反映（Task1 Step2）・一覧表示の重複解消（Task1 Step4）・記録タブの部位→種目2段選択（Task2）・スーパーセット非対象（Task2はメインの`#w-ex-card`のみ変更、`#w-ss-exercises`は無変更）・PWA更新（Task3）すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`exercises`ストアのフィールド名（`bodyPart`/`category`）はTask1・Task2で一貫。Task2の`exPartGroups`/`exParts`/`currentExPart`はTask2内でのみ使用される新規変数で、他タスクとの型衝突なし。`categoryKey(ex)`・`BODY_PARTS`のシグネチャは既存のまま変更していない。
