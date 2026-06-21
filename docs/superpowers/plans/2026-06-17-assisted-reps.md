# 補助ありレップ機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** セット記録に「補助あり」と補助回数（repsの内訳）を追加し、推定1RMを自力回数（reps − 補助回数）で算出する。

**Architecture:** Phase1-3＋記録改善を踏襲。`sets` に `assistedReps` を加算的に追加（DBバージョン変更なし）。`computePRs` を自力回数換算に更新しユニットテスト。記録フォーム・編集モーダル・本日/履歴表示に反映。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- スキーマ変更は加算的（`sets.assistedReps`、既存データは0扱い）
- 補助回数 ≤ reps を保存・編集時に強制
- 推定1RMは `estimate1RM(weight, reps - assistedReps)` で算出
- 既存 `get`/`getAll`/`put`/`remove`/`uid`（db.js）に準拠

---

## Task 1: computePRs を自力回数換算に更新（calc.js）

**Files:**
- Modify: `js/lib/calc.js`
- Test: `test/calc.test.js`

**Interfaces:**
- Produces: `computePRs(sets)` が `reps - (assistedReps||0)` で推定1RMを算出

- [ ] **Step 1: 失敗するテストを追加**

`test/calc.test.js` の末尾に追加：
```js
test('computePRs subtracts assistedReps for self reps', () => {
  const sets = [
    { exerciseId: 'a', weight: 100, reps: 8, assistedReps: 2 },
  ];
  const prs = computePRs(sets);
  assert.ok(Math.abs(prs.a - estimate1RM(100, 6)) < 1e-9);
});

test('computePRs treats missing assistedReps as 0', () => {
  const sets = [
    { exerciseId: 'b', weight: 60, reps: 10 },
  ];
  const prs = computePRs(sets);
  assert.ok(Math.abs(prs.b - estimate1RM(60, 10)) < 1e-9);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`computePRs` がまだ assistedReps を引かない）

- [ ] **Step 3: computePRs を更新**

`js/lib/calc.js` の `computePRs` を次に置き換え：
```js
export function computePRs(sets = []) {
  const prs = {};
  for (const s of sets) {
    const selfReps = (Number(s.reps) || 0) - (Number(s.assistedReps) || 0);
    const e = estimate1RM(s.weight, selfReps);
    if (prs[s.exerciseId] === undefined || e > prs[s.exerciseId]) {
      prs[s.exerciseId] = e;
    }
  }
  return prs;
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/calc.js test/calc.test.js
git commit -m "feat: compute PRs from self reps (excluding assisted reps)"
```

---

## Task 2: 記録フォームに補助あり入力を追加（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `createStepper`（components.js）、`estimate1RM`（calc.js）
- Produces: `set` レコードに `assistedReps`（数値）を保存、`estimated1RM` は自力回数で算出

- [ ] **Step 1: 補助ありUIをフォームに追加**

`js/views/workout.js` の記録カード内、`<div class="muted">推定1RM: <span id="w-1rm" class="pr-badge">-</span></div>` の直後に挿入：
```js
      <div class="field" style="margin-top:12px">
        <button type="button" id="w-assist-toggle" class="btn btn-block">補助あり：OFF</button>
        <div id="w-assist-wrap" style="display:none;margin-top:8px">
          <label>補助回数</label><div id="w-assist"></div>
        </div>
      </div>
```

- [ ] **Step 2: 補助ステッパーとトグルを実装**

`js/views/workout.js` の `const repsStepper = createStepper(...)` 行の直後に追加：
```js
  const assistStepper = createStepper(el.querySelector('#w-assist'), { value: 0, step: 1, min: 0, onChange: refresh1RM });
  let assistOn = false;
  el.querySelector('#w-assist-toggle').addEventListener('click', () => {
    assistOn = !assistOn;
    el.querySelector('#w-assist-toggle').textContent = '補助あり：' + (assistOn ? 'ON' : 'OFF');
    el.querySelector('#w-assist-wrap').style.display = assistOn ? 'block' : 'none';
    if (!assistOn) assistStepper.set(0);
    refresh1RM();
  });
```

- [ ] **Step 3: refresh1RM を自力回数換算に更新**

`js/views/workout.js` の `function refresh1RM()` を次に置き換え：
```js
  function refresh1RM() {
    const w = weightStepper.get();
    const r = repsStepper.get();
    const a = assistOn ? assistStepper.get() : 0;
    const selfReps = r - a;
    el.querySelector('#w-1rm').textContent =
      w > 0 && selfReps > 0 ? estimate1RM(w, selfReps).toFixed(1) + 'kg' : '-';
  }
```

- [ ] **Step 4: 保存処理に補助回数を反映**

`js/views/workout.js` の保存ハンドラ（`#w-save`）内、`const reps = repsStepper.get();` の直後に追加：
```js
    const assistedReps = assistOn ? assistStepper.get() : 0;
    if (assistedReps > reps) { err.textContent = '補助回数は回数以下にしてください'; return; }
```
同ハンドラ内の `const est = estimate1RM(weight, reps);` を次に置き換え：
```js
    const est = estimate1RM(weight, reps - assistedReps);
```
同ハンドラ内の `await put('sets', { id: setId, workoutId: workout.id, exerciseId, weight, reps,` で始まる行を次に置き換え（`assistedReps` を追加）：
```js
    await put('sets', { id: setId, workoutId: workout.id, exerciseId, weight, reps, assistedReps,
```

- [ ] **Step 5: 保存後に補助入力をリセット**

`js/views/workout.js` の保存ハンドラ内、`el.querySelector('#w-note').value = '';` の直後に追加：
```js
    assistOn = false;
    assistStepper.set(0);
    el.querySelector('#w-assist-toggle').textContent = '補助あり：OFF';
    el.querySelector('#w-assist-wrap').style.display = 'none';
```

- [ ] **Step 6: 本日のセット表示に補助を併記**

`js/views/workout.js` の `renderToday` 内、セット行テンプレートの先頭 span 行
`<span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}<br>` を次に置き換え：
```js
      <span>${escapeHtml(nameOf(s.exerciseId))} ${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}<br>
```

- [ ] **Step 7: 構文チェック＋ブラウザ確認**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`
サーバ起動中の preview をリロードし、記録タブで「補助あり」トグル→補助回数入力で推定1RMが自力回数に変わること、保存後に本日のセットに「（補助N）」が併記されること、補助回数>回数で警告が出ることを確認。

- [ ] **Step 8: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: add assisted reps input to workout recording"
```

---

## Task 3: セット編集モーダルに補助ありを追加（set-editor.js）

**Files:**
- Modify: `js/views/set-editor.js`

**Interfaces:**
- Consumes: `createStepper`、`estimate1RM`
- Produces: 編集時に `set.assistedReps` を保存し `estimated1RM` を自力回数で再計算

- [ ] **Step 1: 補助ありUIをモーダルに追加**

`js/views/set-editor.js` の modal テンプレート内、`<div class="field"><label>回数</label><div id="e-reps"></div></div>` の直後に挿入：
```js
    <div class="field">
      <button type="button" id="e-assist-toggle" class="btn btn-block">補助あり：OFF</button>
      <div id="e-assist-wrap" style="display:none;margin-top:8px"><label>補助回数</label><div id="e-assist"></div></div>
    </div>
```

- [ ] **Step 2: 補助ステッパーと初期状態を実装**

`js/views/set-editor.js` の `const repsStepper = createStepper(modal.querySelector('#e-reps'), { value: set.reps, step: 1, min: 0 });` の直後に追加：
```js
  const assistStepper = createStepper(modal.querySelector('#e-assist'), { value: set.assistedReps || 0, step: 1, min: 0 });
  let assistOn = !!(set.assistedReps && set.assistedReps > 0);
  function syncAssist() {
    modal.querySelector('#e-assist-toggle').textContent = '補助あり：' + (assistOn ? 'ON' : 'OFF');
    modal.querySelector('#e-assist-wrap').style.display = assistOn ? 'block' : 'none';
  }
  syncAssist();
  modal.querySelector('#e-assist-toggle').addEventListener('click', () => {
    assistOn = !assistOn;
    if (!assistOn) assistStepper.set(0);
    syncAssist();
  });
```

- [ ] **Step 3: 保存処理に補助回数を反映**

`js/views/set-editor.js` の保存ハンドラ内、`const reps = repsStepper.get();` の直後に追加：
```js
    const assistedReps = assistOn ? assistStepper.get() : 0;
```
同ハンドラ内の検証行 `if (!(weight > 0) || !(reps > 0)) { err.textContent = '重量と回数を正しく入力してください'; return; }` の直後に追加：
```js
    if (assistedReps > reps) { err.textContent = '補助回数は回数以下にしてください'; return; }
```
同ハンドラ内の `set.weight = weight; set.reps = reps; set.estimated1RM = estimate1RM(weight, reps);` を次に置き換え：
```js
    set.weight = weight; set.reps = reps; set.assistedReps = assistedReps;
    set.estimated1RM = estimate1RM(weight, reps - assistedReps);
```

- [ ] **Step 4: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/set-editor.js && echo OK`
Expected: `OK`

- [ ] **Step 5: コミット**

```bash
git add js/views/set-editor.js
git commit -m "feat: add assisted reps to set editor"
```

---

## Task 4: 履歴表示に補助を併記（history.js）

**Files:**
- Modify: `js/views/history.js`

- [ ] **Step 1: 履歴のセット行に補助を併記**

`js/views/history.js` のセット行テンプレート `<span>${s.weight}kg × ${s.reps}</span>` を次に置き換え：
```js
            <span>${s.weight}kg × ${s.reps}${s.assistedReps ? `（補助${s.assistedReps}）` : ''}</span>
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/history.js && echo OK`
Expected: `OK`

- [ ] **Step 3: コミット**

```bash
git add js/views/history.js
git commit -m "feat: show assisted reps in history view"
```

---

## Task 5: PWA キャッシュ更新・全体確認

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.js のキャッシュ版を更新**

`sw.js` の `const CACHE = 'gachi-fit-v5';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v6';
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全 PASS（既存25 + calc追加2 = 27 tests）

- [ ] **Step 3: 全フロー手動確認**

preview で：記録タブで補助ありON→補助回数入力→推定1RMが自力回数換算→保存→本日のセットに「（補助N）」併記→履歴にも併記→振り返り/記録の編集で補助を変更→PR・グラフが自力換算で更新、を確認。補助回数>回数で警告。

- [ ] **Step 4: コミット**

```bash
git add sw.js
git commit -m "chore: bump PWA cache to v6 for assisted reps"
```

---

## Self-Review チェック結果
- **スペック網羅**：補助入力(T2)/1RM自力換算(T1,T2,T3)/編集(T3)/本日表示(T2)/履歴表示(T4)/検証 reps制限(T2,T3)/SW更新(T5) すべてタスク化。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`sets.assistedReps`（数値）、`computePRs` の `reps - (assistedReps||0)`、`estimate1RM(weight, reps - assistedReps)`、`createStepper(container,{value,step,min,onChange})` が全タスクで一致。記録フォームと編集モーダルで `assistOn`/`assistStepper` の命名一致。
