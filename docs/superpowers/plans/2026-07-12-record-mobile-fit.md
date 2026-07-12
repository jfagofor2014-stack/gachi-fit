# 記録画面レイアウト修正・重量自動入力・ビープ改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録タブがスマホ縦画面で横スクロールしてしまう不具合を解消し、通常モードの重量入力を1回目からコピーできるようにし、インターバルのビープを残り10秒から毎秒＋0秒で長めの音にする。

**Architecture:** `js/lib/sound.js`（純粋関数）のビープ判定ロジックを拡張してテストする。`js/views/workout.js` は既存の行UI・スーパーセット表・インターバル呼び出しを対象箇所だけ編集する（全面書き換えではなく部分編集）。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- `shouldBeep(remaining, thresholdSec=10)` は「残り1〜thresholdSec秒なら毎秒true」に変更（0や範囲外はfalse）
- 新規 `shouldFinalBeep(remaining)` は「remaining===0でtrue」
- 0秒到達時のビープは `playBeep({ frequency: 1200, durationMs: 400 })`、それ以外の毎秒ビープは既存の `playBeep()`（880Hz・150ms）のまま
- 重量・回数ステッパーを囲んでいた `.row`（横並び2列）は全て撤去し縦積みにする（通常/ドロップセットの行UI、スーパーセットのラウンド表）。`set-editor.js` は元々縦積みなので対象外
- スーパーセットのラウンド表は種目名をラベルに重複させず、小見出し1つ＋「重量(kg)」「回数」ラベルにする
- 通常モード（`mode === 'normal'`）でのみ、セット1（`i===0`）の重量変更をまだ手動編集されていない（`weightTouched===false`）他の行へ即時反映する。一度でも自分でその行の重量を変えたら以後追従しない。ドロップセット・スーパーセットには適用しない
- 「＋ 行を追加」で作る新しい行は、通常モードならその時点のセット1の重量をコピー（`weightTouched:false`）、ドロップセットモードなら従来通り0
- 既存 `getAll`/`put`/`remove`/`uid`、`createStepper`、`estimate1RM`、`createTimer`/`formatTime` に準拠

---

## Task 1: ビープ判定ロジックの変更（sound.js）

**Files:**
- Modify: `js/lib/sound.js`
- Modify: `test/sound.test.js`

**Interfaces:**
- Produces: `shouldBeep(remaining, thresholdSec=10)` → boolean（残り1〜thresholdSec秒でtrue）、新規 `shouldFinalBeep(remaining)` → boolean（0でtrue）。`playBeep(opts?)` のシグネチャは変更なし

- [ ] **Step 1: 失敗するテストを書く**

`test/sound.test.js` を次に置き換え：
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBeep, shouldFinalBeep } from '../js/lib/sound.js';

test('shouldBeep is true for every second from 1 through the threshold', () => {
  assert.equal(shouldBeep(10), true);
  assert.equal(shouldBeep(5), true);
  assert.equal(shouldBeep(1), true);
});

test('shouldBeep is false outside the countdown range', () => {
  assert.equal(shouldBeep(11), false);
  assert.equal(shouldBeep(0), false);
  assert.equal(shouldBeep(-1), false);
});

test('shouldBeep respects a custom threshold', () => {
  assert.equal(shouldBeep(5, 5), true);
  assert.equal(shouldBeep(6, 5), false);
  assert.equal(shouldBeep(1, 5), true);
});

test('shouldFinalBeep is true only when remaining is exactly 0', () => {
  assert.equal(shouldFinalBeep(0), true);
  assert.equal(shouldFinalBeep(1), false);
  assert.equal(shouldFinalBeep(-1), false);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`shouldBeep`は現状「remaining===thresholdSecのみtrue」のため、`shouldBeep(5)`や`shouldBeep(1)`のテストが失敗。`shouldFinalBeep`は未定義でエラー）

- [ ] **Step 3: sound.js を実装**

`js/lib/sound.js` を次に置き換え：
```js
// 残り秒数がカウントダウンビープ対象か（残り1〜thresholdSec秒、純粋関数）
export function shouldBeep(remaining, thresholdSec = 10) {
  return remaining > 0 && remaining <= thresholdSec;
}

// 0秒到達時の終了ビープ対象か（純粋関数）
export function shouldFinalBeep(remaining) {
  return remaining === 0;
}

// ビープ音を1回再生する（Web Audio API、外部ファイル不要。ブラウザ専用）
export function playBeep({ frequency = 880, durationMs = 150 } = {}) {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
  osc.onended = () => ctx.close();
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS（全テスト green）

- [ ] **Step 5: コミット**

```bash
git add js/lib/sound.js test/sound.test.js
git commit -m "feat: beep every second in final countdown, distinct final beep at zero"
```

---

## Task 2: 記録タブのレイアウト縦積み化・重量自動入力・ビープ呼び出し更新（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `shouldBeep`/`shouldFinalBeep`/`playBeep`（Task 1の`sound.js`）、`createStepper`、`estimate1RM`
- Produces: `renderWorkout(el)` の外部インターフェースは変更なし。行データの内部形状に `weightTouched: boolean` が追加される（`js/views/workout.js` 内部のみで完結、他ファイルからは参照されない）

- [ ] **Step 1: import文にshouldFinalBeepを追加**

`js/views/workout.js` の8行目を次に置き換え：
```js
import { shouldBeep, shouldFinalBeep, playBeep } from '../lib/sound.js';
```

- [ ] **Step 2: defaultRowValuesにweightTouchedを追加**

`js/views/workout.js` の`defaultRowValues`関数（46-48行目）を次に置き換え：
```js
function defaultRowValues(n) {
  return Array.from({ length: n }, () => ({ weight: 0, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }));
}
```

- [ ] **Step 3: 通常/ドロップセットの行UIを縦積みに変更**

`js/views/workout.js` の`renderRows`関数内、次のブロック（195-198行目）：
```js
        <div class="row">
          <div class="field"><label>重量(kg)</label><div id="w-row-weight-${i}"></div></div>
          <div class="field"><label>回数</label><div id="w-row-reps-${i}"></div></div>
        </div>
```
を次に置き換え：
```js
        <div class="field"><label>重量(kg)</label><div id="w-row-weight-${i}"></div></div>
        <div class="field"><label>回数</label><div id="w-row-reps-${i}"></div></div>
```

- [ ] **Step 4: 重量ステッパーのonChangeに自動入力ロジックを追加**

`js/views/workout.js` の`renderRows`関数内、次のブロック（207-221行目）：
```js
    rowSteppers = rowValues.map((rv, i) => {
      const weight = createStepper(el.querySelector(`#w-row-weight-${i}`), { value: rv.weight, step: 0.5, min: 0, onChange: () => refreshRow1RM(i) });
      const reps = createStepper(el.querySelector(`#w-row-reps-${i}`), { value: rv.reps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      if (!showAssist) return { weight, reps, assist: null, assistOn: false };
      const assist = createStepper(el.querySelector(`#w-row-assist-${i}`), { value: rv.assistedReps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      const rs = { weight, reps, assist, assistOn: rv.assistOn };
      el.querySelector(`#w-row-assist-toggle-${i}`).addEventListener('click', () => {
        rs.assistOn = !rs.assistOn;
        el.querySelector(`#w-row-assist-toggle-${i}`).textContent = '補助あり：' + (rs.assistOn ? 'ON' : 'OFF');
        el.querySelector(`#w-row-assist-wrap-${i}`).style.display = rs.assistOn ? 'block' : 'none';
        if (!rs.assistOn) assist.set(0);
        refreshRow1RM(i);
      });
      return rs;
    });
```
を次に置き換え：
```js
    rowSteppers = rowValues.map((rv, i) => {
      const weight = createStepper(el.querySelector(`#w-row-weight-${i}`), {
        value: rv.weight, step: 0.5, min: 0,
        onChange: (v) => {
          refreshRow1RM(i);
          if (mode !== 'normal') return;
          if (i === 0) {
            rowSteppers.forEach((otherRs, j) => {
              if (j > 0 && !rowValues[j].weightTouched) {
                otherRs.weight.set(v);
                rowValues[j].weight = v;
                refreshRow1RM(j);
              }
            });
          } else {
            rowValues[i].weightTouched = true;
          }
        },
      });
      const reps = createStepper(el.querySelector(`#w-row-reps-${i}`), { value: rv.reps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      if (!showAssist) return { weight, reps, assist: null, assistOn: false };
      const assist = createStepper(el.querySelector(`#w-row-assist-${i}`), { value: rv.assistedReps, step: 1, min: 0, onChange: () => refreshRow1RM(i) });
      const rs = { weight, reps, assist, assistOn: rv.assistOn };
      el.querySelector(`#w-row-assist-toggle-${i}`).addEventListener('click', () => {
        rs.assistOn = !rs.assistOn;
        el.querySelector(`#w-row-assist-toggle-${i}`).textContent = '補助あり：' + (rs.assistOn ? 'ON' : 'OFF');
        el.querySelector(`#w-row-assist-wrap-${i}`).style.display = rs.assistOn ? 'block' : 'none';
        if (!rs.assistOn) assist.set(0);
        refreshRow1RM(i);
      });
      return rs;
    });
```

- [ ] **Step 5: syncRowValuesFromSteppersでweightTouchedを保持**

`js/views/workout.js` の`syncRowValuesFromSteppers`関数（179-187行目）を次に置き換え：
```js
  function syncRowValuesFromSteppers() {
    rowSteppers.forEach((rs, i) => {
      rowValues[i] = {
        weight: rs.weight.get(), reps: rs.reps.get(),
        assistedReps: rs.assist && rs.assistOn ? rs.assist.get() : 0,
        assistOn: rs.assist ? rs.assistOn : false,
        weightTouched: rowValues[i] ? rowValues[i].weightTouched : false,
      };
    });
  }
```

- [ ] **Step 6: 行追加時に通常モードならセット1の重量をコピー**

`js/views/workout.js` の`#w-row-add`クリックハンドラ（227-231行目）：
```js
  el.querySelector('#w-row-add').addEventListener('click', () => {
    syncRowValuesFromSteppers();
    if (rowValues.length < MAX_ROWS) rowValues.push({ weight: 0, reps: 0, assistedReps: 0, assistOn: false });
    renderRows();
  });
```
を次に置き換え：
```js
  el.querySelector('#w-row-add').addEventListener('click', () => {
    syncRowValuesFromSteppers();
    if (rowValues.length < MAX_ROWS) {
      const initialWeight = mode === 'normal' ? rowValues[0].weight : 0;
      rowValues.push({ weight: initialWeight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false });
    }
    renderRows();
  });
```

- [ ] **Step 7: スーパーセットのラウンド表を縦積み・種目名の重複解消に変更**

`js/views/workout.js` の`renderSSRounds`関数内、次のブロック（267-271行目）：
```js
        ${ssExerciseIds.map((exId, e) => `
          <div class="row">
            <div class="field"><label>${escapeHtml(exerciseName(exId))} 重量(kg)</label><div id="w-ss-weight-${r}-${e}"></div></div>
            <div class="field"><label>${escapeHtml(exerciseName(exId))} 回数</label><div id="w-ss-reps-${r}-${e}"></div></div>
          </div>`).join('')}
```
を次に置き換え：
```js
        ${ssExerciseIds.map((exId, e) => `
          <div style="margin-bottom:10px">
            <div class="muted" style="margin-bottom:4px">${escapeHtml(exerciseName(exId))}</div>
            <div class="field"><label>重量(kg)</label><div id="w-ss-weight-${r}-${e}"></div></div>
            <div class="field"><label>回数</label><div id="w-ss-reps-${r}-${e}"></div></div>
          </div>`).join('')}
```

- [ ] **Step 8: インターバルのビープ呼び出しを変更**

`js/views/workout.js` の次のブロック（386-394行目）：
```js
  // インターバル（独立、終了10秒前にビープ）
  bindSeg(el, '#w-int-secs', (v) => (state.interval = Number(v)), defaultSec, 's');
  intervalTimer = createTimer({
    onTick: (s) => {
      el.querySelector('#w-timer').textContent = formatTime(s);
      if (shouldBeep(s)) playBeep();
    },
    onDone: () => (el.querySelector('#w-timer').style.display = 'none'),
  });
```
を次に置き換え：
```js
  // インターバル（独立、残り10秒から毎秒ビープ、0秒で長めの音）
  bindSeg(el, '#w-int-secs', (v) => (state.interval = Number(v)), defaultSec, 's');
  intervalTimer = createTimer({
    onTick: (s) => {
      el.querySelector('#w-timer').textContent = formatTime(s);
      if (shouldFinalBeep(s)) playBeep({ frequency: 1200, durationMs: 400 });
      else if (shouldBeep(s)) playBeep();
    },
    onDone: () => (el.querySelector('#w-timer').style.display = 'none'),
  });
```

- [ ] **Step 9: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 10: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存56件がそのまま通ること。workout.jsはビュー層のため新規テストなし）

- [ ] **Step 11: ブラウザで動作確認（375px幅で必須）**

preview のビューポートを375×667程度のスマホサイズに設定し、記録タブで以下を確認：
- `document.documentElement.scrollWidth` が `window.innerWidth` 以下（横スクロールが発生しない）。JSコンソールで `document.documentElement.scrollWidth <= window.innerWidth` を実行して確認
- 通常モードの各セットで重量・回数が縦に並び、＋/－ボタンが画面内に収まっている
- 通常モードでセット1の重量を変更すると、セット2・3の重量欄が即座に同じ値になる
- セット2の重量を自分で変更した後にセット1の重量を変更しても、セット2は追従しない（セット3はまだ追従する）
- 「＋ 行を追加」で追加した新しい行の初期重量が、その時点のセット1の重量と同じになっている
- ドロップセットモードに切り替えると重量は自動入力されない（0のまま）
- スーパーセットモードのラウンド表で、種目名が1回だけ表示され、重量・回数が縦に並んでいる。横スクロールが発生しない
- インターバルを短い秒数（60秒でも開始直後に停止し手動で「開始」を連打するなどして残り10秒付近を確認、または `default_interval_sec` を一時的に11などに変更して素早く確認）で開始し、残り10秒から毎秒ビープが鳴り、0秒で少し高め・長めの音が鳴ることを確認（`js/lib/sound.js`の`shouldBeep`/`shouldFinalBeep`のロジックはTask1でテスト済みなので、ここでは実際に音が鳴るタイミングの目視確認でよい）

- [ ] **Step 12: コミット**

```bash
git add js/views/workout.js
git commit -m "fix: stack weight/reps vertically to prevent horizontal overflow on mobile, auto-fill weight from set 1 in normal mode"
```

---

## Task 3: PWAキャッシュ更新・全体確認

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.jsのキャッシュ版を更新**

`sw.js` の `const CACHE = 'gachi-fit-v14';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v15';
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 3: キャッシュ反映の確認**

preview で静的サーバーを起動し直し、`curl -s http://localhost:<port>/sw.js | head -1` で `gachi-fit-v15` が返ることを確認。

- [ ] **Step 4: コミット**

```bash
git add sw.js
git commit -m "chore: PWA cache v15 for mobile layout fix and beep changes"
```

---

## Self-Review チェック結果
- **スペック網羅**：①レイアウト縦積み（Task2 Step3,7）②重量自動入力（Task2 Step2,4,5,6）③ビープ改善（Task1、Task2 Step1,8）すべてタスク化。PWA更新（Task3）も含む。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`shouldBeep(remaining, thresholdSec)`/`shouldFinalBeep(remaining)`/`playBeep(opts)` のシグネチャがTask1・Task2で一致。行データの `{weight, reps, assistedReps, assistOn, weightTouched}` 形状がTask2内の全ステップ（defaultRowValues・syncRowValuesFromSteppers・行追加ハンドラ・onChange）で一致。
