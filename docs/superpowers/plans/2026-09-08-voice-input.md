# 音声によるセット記録 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「ベンチプレス100キロ8回」と話すだけでセット入力欄が埋まり、1タップで記録できるようにする。

**Architecture:** 発話の解析は `js/lib/voiceParse.js` に純粋関数として隔離してユニットテストする。ブラウザの音声認識APIは `js/lib/voice.js` に薄いラッパーとして閉じ込め、ロジックを持たせない。セット入力欄への反映は `createSetEntry` に `fillNextRow` を1つ足すだけで済ませ、既存の行データ構造と保存処理には触れない。

**Tech Stack:** Vanilla JS（ESモジュール、ビルドなし）、Web Speech API（`webkitSpeechRecognition`、`ja-JP`）、Node標準 `node:test`。

## Global Constraints

- **既存の記録挙動を変えない**：通常モードの重量自動追従（`weightTouched`）、ドロップセットの保存後重量引き継ぎ、ビープ（残り1〜10秒は880Hz/150ms、0秒は1200Hz/400ms）、`patchTodayWorkout` の直列化キュー
- **手入力（ステッパー）を削除しない。** 音声は主動線になるが、ステッパーは訂正手段として残る
- **音声で自動保存しない。** 音声はセット入力欄を埋めるところまで。保存はユーザーの明示的な1タップ
- 音声は通常・ドロップセットモードのみ。スーパーセットモードでは表示しない
- `isVoiceSupported()` が偽のときは音声ボタンを描画せず、UIは従来と完全に同じになる
- 保存側のロジック（`rv.weight > 0 && rv.reps > 0` の絞り込み、推定1RM算出）を変更しない
- IndexedDB のストア・レコード形状・`DB_VERSION` を変更しない
- スマホ幅375pxで横スクロールを発生させない
- 新規JSファイルは必ず `sw.js` の `ASSETS` 配列に追加する
- 音声認識の言語は `ja-JP` 固定

---

### Task 1: 発話の解析（純粋関数）

**Files:**
- Create: `js/lib/voiceParse.js`
- Test: `test/voiceParse.test.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし（純粋関数）
- Produces:
  - `normalizeUtterance(text): string`
  - `matchExerciseName(text, names): string | null`
  - `parseSetUtterance(text, exerciseNames): {exerciseName: string|null, weight: number|null, reps: number|null}`
  
  Task 3（`js/views/workout.js`）が `parseSetUtterance` を使う。

- [ ] **Step 1: Write the failing tests**

`test/voiceParse.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUtterance, matchExerciseName, parseSetUtterance } from '../js/lib/voiceParse.js';

const NAMES = ['ベンチプレス', 'インクラインベンチプレス', 'スクワット', 'ラットプルダウン'];

test('normalizeUtterance converts full-width digits to half-width', () => {
  assert.equal(normalizeUtterance('２００キロ'), '200キロ');
});

test('normalizeUtterance converts full-width spaces and trims', () => {
  assert.equal(normalizeUtterance('　ベンチプレス　100　'), 'ベンチプレス 100');
});

test('matchExerciseName finds an exact name', () => {
  assert.equal(matchExerciseName('ベンチプレス100キロ', NAMES), 'ベンチプレス');
});

test('matchExerciseName finds a name split by spaces', () => {
  assert.equal(matchExerciseName('ベンチ プレス を100キロ', NAMES), 'ベンチプレス');
});

test('matchExerciseName prefers the longest match', () => {
  assert.equal(matchExerciseName('インクラインベンチプレス80キロ', NAMES), 'インクラインベンチプレス');
});

test('matchExerciseName returns null when nothing matches', () => {
  assert.equal(matchExerciseName('デッドリフト100キロ', NAMES), null);
});

test('matchExerciseName returns null for an empty name list', () => {
  assert.equal(matchExerciseName('ベンチプレス100キロ', []), null);
});

test('parseSetUtterance reads exercise, weight and reps with units', () => {
  assert.deepEqual(parseSetUtterance('ベンチプレス100キロ8回', NAMES),
    { exerciseName: 'ベンチプレス', weight: 100, reps: 8 });
});

test('parseSetUtterance reads two bare numbers as weight then reps', () => {
  assert.deepEqual(parseSetUtterance('ベンチプレス 100 8', NAMES),
    { exerciseName: 'ベンチプレス', weight: 100, reps: 8 });
});

test('parseSetUtterance works without an exercise name', () => {
  assert.deepEqual(parseSetUtterance('100キロ8回', NAMES),
    { exerciseName: null, weight: 100, reps: 8 });
});

test('parseSetUtterance reads reps only', () => {
  assert.deepEqual(parseSetUtterance('8回', NAMES),
    { exerciseName: null, weight: null, reps: 8 });
});

test('parseSetUtterance reads an exercise only', () => {
  assert.deepEqual(parseSetUtterance('スクワット', NAMES),
    { exerciseName: 'スクワット', weight: null, reps: null });
});

test('parseSetUtterance reads a decimal weight', () => {
  assert.deepEqual(parseSetUtterance('62.5キロ10回', NAMES),
    { exerciseName: null, weight: 62.5, reps: 10 });
});

test('parseSetUtterance accepts kg notation', () => {
  assert.deepEqual(parseSetUtterance('100kg8回', NAMES),
    { exerciseName: null, weight: 100, reps: 8 });
});

test('parseSetUtterance accepts レップ notation', () => {
  assert.deepEqual(parseSetUtterance('100キロ8レップ', NAMES),
    { exerciseName: null, weight: 100, reps: 8 });
});

test('parseSetUtterance returns all null when nothing is recognized', () => {
  assert.deepEqual(parseSetUtterance('えーっと', NAMES),
    { exerciseName: null, weight: null, reps: null });
});

test('parseSetUtterance is not confused by digits inside an exercise name', () => {
  const names = ['Tバーロウ'];
  assert.deepEqual(parseSetUtterance('Tバーロウ60キロ12回', names),
    { exerciseName: 'Tバーロウ', weight: 60, reps: 12 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL（`Cannot find module '../js/lib/voiceParse.js'`）

- [ ] **Step 3: Implement**

`js/lib/voiceParse.js` を新規作成:

```js
// 全角数字・全角スペースを半角に揃え、前後の空白を落とす（純粋関数）
export function normalizeUtterance(text) {
  return String(text || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripSpaces = (s) => s.replace(/\s+/g, '');

// 発話に含まれる登録済み種目名のうち最も長いものを返す（純粋関数）
export function matchExerciseName(text, names) {
  const hay = stripSpaces(normalizeUtterance(text));
  let best = null;
  for (const name of names) {
    const needle = stripSpaces(name);
    if (needle && hay.includes(needle) && (!best || needle.length > stripSpaces(best).length)) {
      best = name;
    }
  }
  return best;
}

// 発話を {種目名, 重量, 回数} に解析する（純粋関数）
export function parseSetUtterance(text, exerciseNames = []) {
  let rest = normalizeUtterance(text);
  const exerciseName = matchExerciseName(rest, exerciseNames);

  // 種目名に含まれる数字を重量・回数として拾わないよう、一致部分を除去する。
  // 文字間に空白が入った発話にも当たるよう1文字ずつ \s* でつなぐ。
  // 文字列全体から空白を落として除去すると「100 8」が「1008」に化けるため、この方式を使う
  if (exerciseName) {
    const pattern = stripSpaces(exerciseName)
      .split('')
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    rest = rest.replace(new RegExp(pattern), ' ');
  }

  let weight = null;
  let reps = null;

  const weightMatch = rest.match(/(\d+(?:\.\d+)?)\s*(?:キロ|㌔|kg)/i);
  if (weightMatch) {
    weight = parseFloat(weightMatch[1]);
    rest = rest.replace(weightMatch[0], ' ');
  }

  const repsMatch = rest.match(/(\d+)\s*(?:回|レップ|reps?)/i);
  if (repsMatch) {
    reps = parseInt(repsMatch[1], 10);
    rest = rest.replace(repsMatch[0], ' ');
  }

  // 残った裸の数値を、埋まっていない項目に前から順に割り当てる
  const bare = rest.match(/\d+(?:\.\d+)?/g) || [];
  for (const n of bare) {
    if (weight === null) weight = parseFloat(n);
    else if (reps === null) reps = parseInt(n, 10);
  }

  return { exerciseName, weight, reps };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -10`
Expected: 全件PASS（既存102件＋新規16件＝118件）

- [ ] **Step 5: `sw.js` の ASSETS に追加**

`sw.js` の `js/lib/...` が並ぶ行の末尾に `'js/lib/voiceParse.js',` を追加する。

- [ ] **Step 6: Commit**

```bash
git add js/lib/voiceParse.js test/voiceParse.test.js sw.js
git commit -m "feat: parse spoken set utterances into exercise, weight and reps"
```

---

### Task 2: 音声認識のラッパーと行への反映

**Files:**
- Create: `js/lib/voice.js`
- Modify: `js/views/workout/set-entry.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `isVoiceSupported(): boolean`（`js/lib/voice.js`）
  - `startListening({onInterim, onResult, onError}): () => void`（`js/lib/voice.js`）— 停止関数を返す
  - `createSetEntry` の返り値に `fillNextRow({weight, reps}): number | null` が加わる
  
  Task 3（`js/views/workout.js`）が3つとも使う。

- [ ] **Step 1: `js/lib/voice.js` を作成**

```js
function getRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// この端末・ブラウザで音声認識が使えるか
export function isVoiceSupported() {
  return Boolean(getRecognitionCtor());
}

// 音声認識を1回分開始する。停止関数を返す（未対応なら何もしない関数）
export function startListening({ onInterim, onResult, onError }) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) { if (onError) onError('unsupported'); return () => {}; }

  const rec = new Ctor();
  rec.lang = 'ja-JP';
  rec.continuous = false;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { if (onResult) onResult(r[0].transcript); return; }
      interim += r[0].transcript;
    }
    if (interim && onInterim) onInterim(interim);
  };
  rec.onerror = (e) => { if (onError) onError(e.error || 'unknown'); };

  try { rec.start(); } catch { if (onError) onError('unknown'); }
  return () => { try { rec.stop(); } catch { /* 停止済みなら無視 */ } };
}
```

- [ ] **Step 2: `createSetEntry` に `fillNextRow` を追加**

`js/views/workout/set-entry.js` の `createSetEntry` の返り値オブジェクトに、次のメソッドを追加する（既存の `resetRows` の直後に置くと読みやすい）:

```js
    fillNextRow: ({ weight, reps }) => {
      // 重量か回数のどちらかが未入力の最初の行を対象にする。
      // 「完全に空の行」ではないため、「100キロ」「8回」と分けて話しても同じ行が補完される
      let i = rowValues.findIndex((rv) => rv.weight === 0 || rv.reps === 0);
      if (i === -1) {
        if (rowValues.length >= MAX_ROWS) return null;
        rowValues.push({ weight: 0, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false });
        i = rowValues.length - 1;
      }
      if (weight !== null && weight !== undefined) rowValues[i].weight = weight;
      if (reps !== null && reps !== undefined) rowValues[i].reps = reps;
      renderRows();
      return i;
    },
```

`rowValues` を直接更新してから `renderRows()` を呼ぶのは既存の `resetRows` と同じ方式である。`createStepper` の `set()` は `onChange` を発火しないため、この経路で通常モードの重量自動追従は起きない（音声入力が他の行に波及しないので望ましい）。

- [ ] **Step 3: `sw.js` の ASSETS に `js/lib/voice.js` を追加**

- [ ] **Step 4: テスト**

Run: `npm test 2>&1 | tail -10`
Expected: 118件すべてPASS（`voice.js` はブラウザAPI、`set-entry.js` はビュー層のためテスト追加なし）

- [ ] **Step 5: Commit**

```bash
git add js/lib/voice.js js/views/workout/set-entry.js sw.js
git commit -m "feat: add speech recognition wrapper and row filling"
```

---

### Task 3: 記録タブへの音声UIの組み込み

**Files:**
- Modify: `js/views/workout/set-entry.js`
- Modify: `js/views/workout.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `parseSetUtterance`（Task 1）、`isVoiceSupported` / `startListening` / `fillNextRow`（Task 2）、既存の `exPanel.selectExercise(exerciseId)`
- Produces: なし（末端のUI）

- [ ] **Step 1: 音声ブロックのHTMLを追加**

`js/views/workout/set-entry.js` の `setEntryHtml()` の中、`<div id="w-normal-block">` の**開始タグ直後**（`<div id="w-rows" class="mt-2"></div>` の前）に次を挿入する:

```js
      <div id="w-voice" style="display:none">
        <button type="button" id="w-voice-btn" class="btn btn-primary voice-btn">🎤 音声で入力</button>
        <div id="w-voice-status" class="muted mt-1"></div>
      </div>
```

初期状態は `display:none` とし、Task 3 Step 3 で音声が使える場合だけ表示する。

- [ ] **Step 2: CSS を追加**

`css/style.css` の末尾に追記する:

```css
/* --- 記録タブ：音声入力 --- */
.voice-btn { width: 100%; min-height: 64px; font-size: 18px; }
```

- [ ] **Step 3: `js/views/workout.js` に結線処理を追加**

先頭の import 群に次の2行を追加する:

```js
import { parseSetUtterance } from './lib/voiceParse.js';
import { isVoiceSupported, startListening } from './lib/voice.js';
```

`renderWorkout` 関数の中、`const setEntry = createSetEntry(...)` の呼び出しより**後ろ**（`initIntervalBar(el, defaultSec);` の前後どちらでもよい）に次を追加する:

```js
  // 音声入力（未対応環境ではボタンごと出さない）
  if (isVoiceSupported()) {
    const voiceBox = el.querySelector('#w-voice');
    const voiceBtn = el.querySelector('#w-voice-btn');
    const voiceStatus = el.querySelector('#w-voice-status');
    voiceBox.style.display = 'block';

    let stopListening = null;
    const idle = () => {
      voiceBtn.textContent = '🎤 音声で入力';
      stopListening = null;
    };

    const applyUtterance = (text) => {
      const parsed = parseSetUtterance(text, exercises.map((e) => e.name));
      if (parsed.exerciseName === null && parsed.weight === null && parsed.reps === null) {
        voiceStatus.textContent = '聞き取れませんでした';
        return;
      }
      if (parsed.exerciseName) {
        const ex = exercises.find((e) => e.name === parsed.exerciseName);
        if (ex) exPanel.selectExercise(ex.id);
      }
      if (parsed.weight === null && parsed.reps === null) {
        voiceStatus.textContent = `${parsed.exerciseName} に切り替えました`;
        return;
      }
      const row = setEntry.fillNextRow({ weight: parsed.weight, reps: parsed.reps });
      if (row === null) {
        voiceStatus.textContent = '行がいっぱいです。記録してから続けてください';
        return;
      }
      const parts = [
        parsed.exerciseName,
        parsed.weight !== null ? `${parsed.weight}kg` : null,
        parsed.reps !== null ? `${parsed.reps}回` : null,
      ].filter(Boolean);
      voiceStatus.textContent = `${parts.join(' / ')} を入力しました`;
    };

    const ERROR_TEXT = {
      'not-allowed': 'マイクの使用を許可してください',
      'no-speech': '聞き取れませんでした',
      network: '通信できませんでした。手入力で記録できます',
    };

    voiceBtn.addEventListener('click', () => {
      if (stopListening) { stopListening(); idle(); return; }
      voiceStatus.textContent = '';
      voiceBtn.textContent = '聞いています…';
      stopListening = startListening({
        onInterim: (t) => { voiceStatus.textContent = t; },
        onResult: (t) => { idle(); applyUtterance(t); },
        onError: (code) => { idle(); voiceStatus.textContent = ERROR_TEXT[code] || '認識できませんでした'; },
      });
    });
  }
```

`exercises` と `exPanel` と `setEntry` はいずれも `renderWorkout` のスコープに既にある。

- [ ] **Step 4: スーパーセットモードで音声が隠れることの確認**

`#w-voice` は `#w-normal-block` の内側にあり、既存の `applyMode` がスーパーセット時に `#w-normal-block` 全体を `display:none` にするため、追加のコードなしでモード連動する。**この点をブラウザで実際に確認すること**（コードを足す必要はない）。

- [ ] **Step 5: テスト**

Run: `npm test 2>&1 | tail -10`
Expected: 118件すべてPASS（UI層のためテスト追加なし）

- [ ] **Step 6: ブラウザで確認**

リポジトリルートで `python3 -m http.server 8850` をバックグラウンド起動し、`preview_start` で `{"url":"http://localhost:8850"}` を開く。`resize_window` で `{"preset":"mobile"}`。種目を数件登録した状態にする（管理→コースのプリセット「胸・肩」をタップすると5種目入る）。

**この検証環境にはマイクがないため、実際の発話はできない。** 代わりに `applyUtterance` と同じ経路を `javascript_tool` から直接叩いて反映を確認する。音声認識そのもの（`startListening`）はユーザーが実機で確認する。

1. 音声ボタンが通常モードで表示されること:
```js
(() => {
  const box = document.querySelector('#w-voice');
  return { visible: box && getComputedStyle(box).display !== 'none',
           btnHeight: Math.round(document.querySelector('#w-voice-btn').getBoundingClientRect().height) };
})()
```
`visible: true`、`btnHeight` が 64 以上であること。

2. スーパーセットモードで消えること:
```js
(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  document.querySelector('#w-mode-seg button[data-m="superset"]').click();
  await sleep(400);
  const hidden = getComputedStyle(document.querySelector('#w-voice')).display === 'none'
    || document.querySelector('#w-normal-block').style.display === 'none';
  document.querySelector('#w-mode-seg button[data-m="normal"]').click();
  await sleep(400);
  return { hiddenInSuperset: hidden };
})()
```

3. 解析→反映が正しく動くこと。`parseSetUtterance` と `fillNextRow` を直接呼んで確認する:
```js
(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  const vp = await import('/js/lib/voiceParse.js');
  const names = [...document.querySelectorAll('#w-ex option')].map(o => o.textContent.split(' / ')[0]);
  const cases = ['ベンチプレス100キロ8回', '90キロ6回', '80キロ'];
  const parsed = cases.map(c => vp.parseSetUtterance(c, names));
  return { names, parsed };
})()
```
発話3件が期待どおりに解析されることを確認する。

4. 実際にボタンを押して行が埋まる経路は、マイクがないため `onResult` を直接呼べない。代わりに**マイク権限がない状態でボタンを押し、エラーメッセージが出てボタンが「🎤 音声で入力」に戻ること**を確認する:
```js
(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  document.querySelector('#w-voice-btn').click();
  await sleep(2500);
  return { btnText: document.querySelector('#w-voice-btn').textContent,
           status: document.querySelector('#w-voice-status').textContent };
})()
```
（この環境でマイクが使えない場合、`status` に何らかのエラーメッセージが入り、`btnText` が「🎤 音声で入力」に戻っていればよい。エラーが出ずに「聞いています…」のままなら、それはこの環境がマイクを持たないだけなので、その旨をレポートに記録する。）

5. **既存挙動の回帰確認**（重要）:
   - 通常モードでセット1の重量に 60 を入れると、未編集のセット2・3にも 60 が入ること。セット2を 55 に手で変えたあと、セット1を 70 にしてもセット2は 55 のままであること
   - ドロップセットモードで重量 100/90/80・回数を入れて保存し、保存後に重量は 100/90/80 のまま、回数だけ空欄になること
6. `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 7: Commit**

```bash
git add js/views/workout/set-entry.js js/views/workout.js css/style.css
git commit -m "feat: add a voice button that fills the set entry row"
```

---

### Task 4: PWAキャッシュの更新と全体確認

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: ASSETS を実ファイルと突き合わせる**

次のコマンドで差分がないことを確認する（出力が空になること）:

```bash
diff <(find js -name '*.js' | sort) <(grep -o "js/[A-Za-z0-9/_-]*\.js" sw.js | sort -u)
```

差分があれば `ASSETS` を修正する。特に `js/lib/voiceParse.js` と `js/lib/voice.js` が含まれること。

- [ ] **Step 2: cache version を上げる**

`sw.js` の1行目 `const CACHE = 'gachi-fit-v25';` を `const CACHE = 'gachi-fit-v26';` に変更する。

- [ ] **Step 3: 全体動作確認**

Run: `npm test 2>&1 | tail -10`
Expected: 118件すべてPASS

`python3 -m http.server 8851` を起動し `preview_start` で開く。`resize_window` で `{"preset":"mobile"}`。全4タブを一巡する:

1. ホーム：カレンダー・日タップでの詳細・推定1RM が従来どおり。「みんなの予定」カードは出ない（Firebase 未設定のため）
2. 記録：音声ボタンが出る、種目ヘッダー、空欄始まりのステッパー、セット保存、タイマーバー
3. 分析：履歴・インサイト・ボディの切替
4. 管理：種目・コース・場所・設定の切替。コースの「プリセットから作成」が動く
5. `read_console_messages` でエラーがないこと（Service Worker 登録エラーはこの環境の既知の制約で無関係）
6. 各タブで `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: PWA cache v26 for voice set logging"
```

## Self-Review Notes

- **Spec coverage**: ①音声認識ラッパー→Task 2 Step 1、②解析→Task 1、③`fillNextRow`→Task 2 Step 2、④記録タブUI→Task 3、エラーハンドリング表→Task 3 Step 3 の `ERROR_TEXT` と `applyUtterance` 内の分岐、`sw.js` 追従→Task 1/2 で追加し Task 4 で最終突合。
- **Placeholder scan**: なし。Task 3 Step 6 の項目4はマイクのない検証環境での代替手順を明示しており、未定事項ではない。
- **Type consistency**: `parseSetUtterance(text, exerciseNames)` の戻り値 `{exerciseName, weight, reps}`（Task 1 定義、Task 3 使用）、`fillNextRow({weight, reps}): number|null`（Task 2 定義、Task 3 使用）、`startListening({onInterim, onResult, onError}): () => void`（Task 2 定義、Task 3 使用）、`isVoiceSupported(): boolean`（Task 2 定義、Task 3 使用）、既存の `exPanel.selectExercise(exerciseId)`（Task 3 使用）— いずれも一致を確認済み。
- **既知の制限**: 実際の音声認識はマイクのない検証環境では確認できない。解析ロジックはユニットテストで、UIの表示・モード連動・エラー経路はブラウザで確認し、発話からの実動作はユーザーが Pixel 8a で確認する。
