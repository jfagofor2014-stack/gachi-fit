# 記録タブの作り直し（1セットずつ記録） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録タブを「今のセットだけを大きく表示し、1セットずつ記録する」形に作り直し、種目選びを部位→種目の2タップにする。

**Architecture:** 初期値・前回値・ドロップの下げ幅・よく使う順・「次はこれ？」はすべて純粋関数（`js/lib/logging.js`）に置いてテストする。重量の刻みは `js/lib/prefs.js`（localStorage）、その日の組・連なり・コースは `js/lib/logState.js`（sessionStorage、日付付き）に持つ。画面は「今のセット」カード（`current-set.js`）と種目選択シート（`exercise-sheet.js`）を新設し、`workout.js` がつなぐ。複数行入力の `set-entry.js` は削除する。セットの保存形式は変えない。

**Tech Stack:** Vanilla JS（ES modules・ビルドなし）、IndexedDB、Service Worker、`node --test`

**Spec:** `docs/superpowers/specs/2026-10-23-one-set-logging-design.md`（「7. 細部の決定」を含めて読むこと）

## Global Constraints

- ビルドなし・ES modules。純粋関数は `node:test` で単体テストし、`npm test` が全件PASS（開始時221件）
- IndexedDB のストア構成・`DB_VERSION`（4）とセットの保存形式 `{ id, workoutId, exerciseId, weight, reps, assistedReps, estimated1RM, targetWeight, createdAt }`（＋ドロップ／スーパーセットは `groupId` と `groupType: 'dropset'|'superset'`）は変えない。補助回数を引いた回数で `estimated1RM` を計算するのも今と同じ。メモは `sensoryLogs` にセットごと1件
- 保存できるのは重量・回数がどちらも0より大きいときだけ。保存に失敗したら札を増やさずエラーを表示する
- 重量の刻みは設定値（初期値 **2.5**、選択肢 **0.5／1／1.25／2／2.5／5**、localStorage キー `weight_step`）。回数は ±1
- 記録したら休憩タイマーを自動開始。ただしドロップの途中と、スーパーセットの組の最後以外では動かさない
- ドロップの連なりは1セットとして数え、値として使うのは連なりの最初の重量
- 自宅/ジムの絞り込みは選択（種目シート・提案・音声の種目名照合）だけに効かせ、名前の解決・集計（「本日のセット」、PR、部位別ボリューム）は全種目を使う
- タップ対象は ±ボタン 48px 以上、記録ボタンは画面幅いっぱい。375px 幅で横スクロールを出さない
- UI文言は仕様書の文字列を使う（日本語）。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 最終タスクで `sw.js` のキャッシュを `gachi-fit-v29` にし、新規ファイルを `ASSETS` に入れ、削除したファイルを抜く

## Review Focus

1. **「記録する」の連打**: 保存中は記録・ドロップボタンを無効にし、同じセットを二重に保存しない（Task 4 のブラウザ確認に含める）
2. **日付をまたいだ状態**: 昨日のスーパーセットの組やドロップの連なりが今日に持ち越されない（Task 3 の `loadLogState` のテスト）
3. **タブ移動・再読み込みをまたいだドロップ／スーパーセット**: 同じ `groupId` が続き、「本日のセット」で1つにまとまる（Task 4・6 のブラウザ確認）
4. **重量欄の入力ゆれ**: 空欄・`26.`・全角数字・負数は0扱いで保存できない、`26.5` は保存できる（Task 1 の `parseNumberInput` のテスト）
5. **消えた種目**: コースや状態に残った削除済みの種目IDは黙って飛ばす（Task 2 の `suggestNext` のテスト、Task 5 の確認）

---

### Task 1: セットの並びと初期値（純粋関数）

**Files:**
- Create: `js/lib/logging.js`
- Test: `test/logging.test.js`

**Interfaces:**
- Produces（以降のタスクはこの名前と形で使う）:
  - `Slot = { weight: number, reps: number, assistedReps: number, drops: { weight: number, reps: number }[], setIds: string[] }`
  - `toSlots(sets): Slot[]` — 1種目・1日分のセットを `createdAt` 昇順に並べ、同じ `groupId` かつ `groupType === 'dropset'` の連続を1スロット（最初のセットが値、残りが `drops`）にまとめる。それ以外（スーパーセットを含む）は1件1スロット
  - `lastSessionSlots(sets, workouts, exerciseId, today): Slot[]` — `today` より前で、その種目のセットがある直近の日のスロット。なければ `[]`
  - `initialSetValues({ todaySlots, lastSlots, bodyWeight, isBodyweight }): { weight, reps }`
  - `previousForSet(lastSlots, setNumber): { weight, reps } | null`（`setNumber` は1始まり）
  - `lastDropChain(sets, workouts, exerciseId, today): number[]` — `today` より前でその種目のドロップの連なりがある直近の日の、最初の連なりの重量列（例 `[26, 20, 16]`）。なければ `[]`
  - `nextDropWeight({ currentWeight, dropIndex, lastChain, step }): number` — `dropIndex` は1始まり（最初のドロップが1）
  - `parseNumberInput(text): number` — 入力欄の文字列を数値に。全角数字を半角に、解釈できない・負数は0、小数は小数第2位で丸める

- [ ] **Step 1: 失敗するテストを書く**（`test/logging.test.js`）

ヘルパー: `const set = (id, exerciseId, workoutId, weight, reps, createdAt, extra = {}) => ({ id, exerciseId, workoutId, weight, reps, assistedReps: 0, createdAt, ...extra });`

```js
test('toSlots makes one slot per normal set in time order', () => {
  const s = [set('b', 'e', 'w', 26, 9, 2), set('a', 'e', 'w', 26, 10, 1)];
  assert.deepEqual(toSlots(s).map((x) => [x.weight, x.reps, x.setIds]), [[26, 10, ['a']], [26, 9, ['b']]]);
});
test('toSlots folds a dropset chain into one slot keyed by its first set', () => {
  const g = { groupId: 'g1', groupType: 'dropset' };
  const s = [set('a', 'e', 'w', 26, 10, 1, g), set('b', 'e', 'w', 20, 6, 2, g), set('c', 'e', 'w', 16, 5, 3, g), set('d', 'e', 'w', 26, 8, 4)];
  const out = toSlots(s);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].weight, out[0].reps, out[0].setIds], [26, 10, ['a', 'b', 'c']]);
  assert.deepEqual(out[0].drops, [{ weight: 20, reps: 6 }, { weight: 16, reps: 5 }]);
  assert.deepEqual(out[1].drops, []);
});
test('toSlots keeps superset sets as separate slots', () => {
  const g = { groupId: 'g2', groupType: 'superset' };
  assert.equal(toSlots([set('a', 'e', 'w', 20, 10, 1, g), set('b', 'e', 'w', 20, 9, 3, g)]).length, 2);
});
test('lastSessionSlots returns the latest earlier day only', () => {
  const workouts = [{ id: 'w1', date: '2026-10-10' }, { id: 'w2', date: '2026-10-15' }, { id: 'w3', date: '2026-10-23' }];
  const s = [set('a', 'e', 'w1', 20, 10, 1), set('b', 'e', 'w2', 24, 8, 2), set('c', 'x', 'w2', 50, 5, 3), set('d', 'e', 'w3', 26, 6, 4)];
  assert.deepEqual(lastSessionSlots(s, workouts, 'e', '2026-10-23').map((x) => x.weight), [24]);
  assert.deepEqual(lastSessionSlots(s, workouts, 'e', '2026-10-10'), []);
});
test('initialSetValues prefers the last slot recorded today, using a chain first weight', () => {
  const today = [{ weight: 26, reps: 10, drops: [] }, { weight: 24, reps: 8, drops: [{ weight: 18, reps: 6 }] }];
  assert.deepEqual(initialSetValues({ todaySlots: today, lastSlots: [{ weight: 30, reps: 5, drops: [] }], bodyWeight: 70, isBodyweight: true }), { weight: 24, reps: 8 });
});
test('initialSetValues falls back to the first slot of the last session', () => {
  assert.deepEqual(initialSetValues({ todaySlots: [], lastSlots: [{ weight: 26, reps: 10, drops: [] }, { weight: 24, reps: 9, drops: [] }], bodyWeight: null, isBodyweight: false }), { weight: 26, reps: 10 });
});
test('initialSetValues starts empty, or at body weight for a bodyweight exercise', () => {
  assert.deepEqual(initialSetValues({ todaySlots: [], lastSlots: [], bodyWeight: 69.5, isBodyweight: false }), { weight: 0, reps: 0 });
  assert.deepEqual(initialSetValues({ todaySlots: [], lastSlots: [], bodyWeight: 69.5, isBodyweight: true }), { weight: 69.5, reps: 0 });
  assert.deepEqual(initialSetValues({ todaySlots: [], lastSlots: [], bodyWeight: null, isBodyweight: true }), { weight: 0, reps: 0 });
});
test('previousForSet returns the same set number of the last session or null', () => {
  const last = [{ weight: 26, reps: 10, drops: [] }, { weight: 24, reps: 9, drops: [] }];
  assert.deepEqual(previousForSet(last, 2), { weight: 24, reps: 9 });
  assert.equal(previousForSet(last, 3), null);
  assert.equal(previousForSet([], 1), null);
});
test('lastDropChain returns the first chain of the latest earlier day that had one', () => {
  const g = { groupId: 'g', groupType: 'dropset' };
  const workouts = [{ id: 'w1', date: '2026-10-10' }, { id: 'w2', date: '2026-10-15' }];
  const s = [set('a', 'e', 'w1', 30, 8, 1, g), set('b', 'e', 'w1', 24, 6, 2, g), set('c', 'e', 'w2', 26, 10, 3)];
  assert.deepEqual(lastDropChain(s, workouts, 'e', '2026-10-23'), [30, 24]);
  assert.deepEqual(lastDropChain(s, workouts, 'x', '2026-10-23'), []);
});
test('nextDropWeight reuses last time drop size, else two steps down, never below one step', () => {
  assert.equal(nextDropWeight({ currentWeight: 30, dropIndex: 1, lastChain: [26, 20, 16], step: 2.5 }), 24);
  assert.equal(nextDropWeight({ currentWeight: 24, dropIndex: 2, lastChain: [26, 20, 16], step: 2.5 }), 20);
  assert.equal(nextDropWeight({ currentWeight: 20, dropIndex: 3, lastChain: [26, 20, 16], step: 2.5 }), 15);
  assert.equal(nextDropWeight({ currentWeight: 26, dropIndex: 1, lastChain: [], step: 2.5 }), 21);
  assert.equal(nextDropWeight({ currentWeight: 4, dropIndex: 1, lastChain: [], step: 2.5 }), 2.5);
});
test('parseNumberInput accepts decimals and full-width digits, rejects junk and negatives', () => {
  assert.equal(parseNumberInput('26.5'), 26.5);
  assert.equal(parseNumberInput('２６'), 26);
  assert.equal(parseNumberInput('26.'), 26);
  assert.equal(parseNumberInput(''), 0);
  assert.equal(parseNumberInput('abc'), 0);
  assert.equal(parseNumberInput('-5'), 0);
  assert.equal(parseNumberInput('62.556'), 62.56);
});
```

- [ ] **Step 2: 失敗を確認する** — `node --test test/logging.test.js` → モジュールが見つからず FAIL
- [ ] **Step 3: `js/lib/logging.js` に上記の関数を実装する**（日付比較は `'YYYY-MM-DD'` の文字列比較。`workoutId` から日付を引けないセットは無視する。`nextDropWeight` の結果は小数第2位で丸める）
- [ ] **Step 4: 通過を確認する** — `node --test test/logging.test.js` と `npm test` が `fail 0`
- [ ] **Step 5: コミット** — `feat: add pure helpers for one-set logging (slots, initial values, drops)`

---

### Task 2: よく使う順と「次はこれ？」（純粋関数）

**Files:**
- Modify: `js/lib/logging.js`
- Test: `test/logging.test.js`

**Interfaces:**
- Consumes: `addDays(dateStr, n)`（`js/lib/creature.js`）
- Produces:
  - `exerciseUsage(sets, workouts, today, days = 28): Map<string, number>` — `addDays(today, -(days - 1))` 〜 `today` の日付のセット数を種目ごとに数える
  - `sortByUsage(exercises, usage): Exercise[]` — 回数の多い順、同数は `name` の `localeCompare(…, 'ja')` 順。元の配列は変えない
  - `suggestNext({ courseIds, currentExerciseId, doneTodayIds, sets, workouts, today, availableIds }): string | null`
    - `courseIds` が空でなければ、その順で「今日まだやっていない・今の種目でない・`availableIds` に含まれる」最初の種目
    - 空なら、`today` より前で今の種目をやった直近の日に、その日の種目を最初の記録時刻順に並べ、今の種目より後で条件を満たす最初の種目
    - 見つからなければ `null`

- [ ] **Step 1: 失敗するテストを書く**

```js
test('exerciseUsage counts sets in the last 28 days including today', () => {
  const workouts = [{ id: 'a', date: '2026-10-23' }, { id: 'b', date: '2026-09-26' }, { id: 'c', date: '2026-09-25' }];
  const s = [set('1', 'e1', 'a', 1, 1, 1), set('2', 'e1', 'a', 1, 1, 2), set('3', 'e2', 'b', 1, 1, 3), set('4', 'e3', 'c', 1, 1, 4)];
  const u = exerciseUsage(s, workouts, '2026-10-23');
  assert.equal(u.get('e1'), 2);
  assert.equal(u.get('e2'), 1);
  assert.equal(u.get('e3') || 0, 0);
});
test('sortByUsage orders by count then name without mutating input', () => {
  const ex = [{ id: 'x', name: 'ダンベルフライ' }, { id: 'y', name: 'ディップス' }, { id: 'z', name: 'アーノルドプレス' }];
  const out = sortByUsage(ex, new Map([['y', 3]]));
  assert.deepEqual(out.map((e) => e.id), ['y', 'z', 'x']);
  assert.equal(ex[0].id, 'x');
});
test('suggestNext follows the course order, skipping done, current and unavailable ids', () => {
  const base = { sets: [], workouts: [], today: '2026-10-23', availableIds: ['a', 'b', 'c'] };
  assert.equal(suggestNext({ ...base, courseIds: ['a', 'b', 'c'], currentExerciseId: 'a', doneTodayIds: ['a'] }), 'b');
  assert.equal(suggestNext({ ...base, courseIds: ['a', 'gone', 'c'], currentExerciseId: 'a', doneTodayIds: ['a'] }), 'c');
  assert.equal(suggestNext({ ...base, courseIds: ['a', 'b'], currentExerciseId: 'b', doneTodayIds: ['a', 'b'] }), null);
});
test('suggestNext without a course follows the order of the last day the current exercise was done', () => {
  const workouts = [{ id: 'old', date: '2026-10-08' }, { id: 'w', date: '2026-10-15' }];
  const s = [set('1', 'a', 'w', 1, 1, 10), set('2', 'b', 'w', 1, 1, 20), set('3', 'c', 'w', 1, 1, 30), set('4', 'a', 'old', 1, 1, 1), set('5', 'x', 'old', 1, 1, 2)];
  const args = { courseIds: [], currentExerciseId: 'a', sets: s, workouts, today: '2026-10-23', availableIds: ['a', 'b', 'c', 'x'] };
  assert.equal(suggestNext({ ...args, doneTodayIds: ['a'] }), 'b');
  assert.equal(suggestNext({ ...args, doneTodayIds: ['a', 'b'] }), 'c');
  assert.equal(suggestNext({ ...args, currentExerciseId: 'zzz', doneTodayIds: [] }), null);
});
```

- [ ] **Step 2: 失敗を確認する** — 関数が export されておらず FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が `fail 0`**
- [ ] **Step 5: コミット** — `feat: rank exercises by recent use and suggest the next one`

---

### Task 3: 重量の刻みとその日の記録状態、設定画面

**Files:**
- Create: `js/lib/prefs.js`、`js/lib/logState.js`
- Modify: `js/views/settings.js`（「既定インターバル秒数」のカードの直後に「重量の刻み」のカード）
- Test: `test/prefs.test.js`、`test/logState.test.js`

**Interfaces:**
- Produces:
  - `WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5]`、`DEFAULT_WEIGHT_STEP = 2.5`
  - `getWeightStep(): number` — localStorage `weight_step` を数値にし、`WEIGHT_STEPS` にあればそれ、なければ・読めなければ 2.5
  - `setWeightStep(v): void` — `WEIGHT_STEPS` にある値だけ保存。例外は握りつぶす
  - `LogState = { date, courseIds: string[], courseName: string, superset: null | { exerciseIds: string[], index: number, groupId: string }, drop: null | { exerciseId: string, groupId: string, dropIndex: number } }`
  - `loadLogState(today, storage = defaultSession()): LogState` — sessionStorage キー `gachi_log_state` の JSON。日付が違う・壊れている・読めないときは `{ date: today, courseIds: [], courseName: '', superset: null, drop: null }`
  - `saveLogState(state, storage = defaultSession()): void` — 例外は握りつぶす
  （`defaultSession()` は `globalThis.sessionStorage` を返し、ない環境では読めない扱い）

- [ ] **Step 1: 失敗するテストを書く**
  - prefs（`test/env.test.js` と同じ `withLocalStorage` の差し替えを使う）: 未保存→2.5、`'1.25'`→1.25、`'3'`→2.5、getItem が例外→2.5、`setWeightStep(2)` 後に 2、`setWeightStep(7)` は保存されず直前の値のまま、setItem が例外でも投げない
  - logState（`{ getItem, setItem }` のオブジェクトを渡す）: 空→初期状態（上の形と `deepEqual`）、別の日付の保存→初期状態、壊れたJSON→初期状態、保存→読み込みで同じ内容、getItem/setItem が例外でも初期状態・投げない
- [ ] **Step 2: 失敗を確認する**
- [ ] **Step 3: 実装する。設定画面には `WEIGHT_STEPS` を `.seg` のボタンで並べ、選択中を `sel`、タップで `setWeightStep` → 表示更新**
- [ ] **Step 4: `npm test` が `fail 0`。ブラウザで 管理 > 設定 の刻みを 2 にして再読み込み → 2 が選択されたまま**
- [ ] **Step 5: コミット** — `feat: add a weight step setting and per-day logging state`

---

### Task 4: 「今のセット」カードで1セットずつ記録する（通常・ドロップ）

**Files:**
- Create: `js/views/workout/current-set.js`
- Modify: `js/views/workout.js`、`js/views/workout/interval-bar.js`（`startRest()` を export）、`js/views/set-editor.js`（「このセットを削除」）、`css/style.css`
- Delete: `js/views/workout/set-entry.js`（と workout.js からの参照）

**Interfaces:**
- Consumes: Task 1〜3 の関数、`latestBodyWeight`、`parseSetUtterance`、既存の `patchTodayWorkout` / `renderToday` / `createExercisePanel`
- Produces:
  - `currentSetHtml(): string` と `createCurrentSet(el, { getStep, onRecord, onDrop, onChipTap }): CurrentSet`
  - `CurrentSet = { setValues({ weight, reps }), values(): { weight, reps, assistedReps, note }, setHeading(text), setChips(slots), setMode({ showDrop, showAssist }), setBusy(bool), setError(text), setHint(text), clearDetails() }`
  - `startRest(): void`（`interval-bar.js`。今の秒数設定で休憩タイマーを開始。止まっていれば開始、動いていれば最初から）
  - `openSetEditor(setId, onDone)` に削除ボタン（`confirm` で確認 → `sets` と、その `setId` の `sensoryLogs` を消す → `onDone()`）

**画面と動き**（仕様書「1〜3」「7」）:
- 記録タブは上から、今の種目ヘッダー（この Task では既存の `createExercisePanel` をそのまま使う。種目の変更は Task 5 で置き換える）、札、今のセットのカード、「記録する」＋「ドロップ」、🎤、詳細（補助回数・メモ）、既存の「本日のセット」「本日の感想」「場所・時間」、休憩タイマー
- 種目が決まるたびに、`toSlots`（今日のその種目のセット）、`lastSessionSlots`、`initialSetValues`（自重種目は `latestBodyWeight`）でカードを埋め、見出しを `セット{n}（前回 {w}kg×{r}）`（前回がなければ `セット{n}`）にする。`n` は今日のスロット数＋1
- 「記録する」: 値を検証（重量・回数 > 0。足りなければ `setError('重量と回数を入れてください')`）→ `setBusy(true)` → セットと `sensoryLogs` を保存 → 札を更新 → 状態の `drop` を閉じる → `startRest()` → 次のセットの値を「いま記録した値」で入れる → `clearDetails()` → `setBusy(false)`。保存が例外なら札は変えず `setError('保存できませんでした: ' + message)`
- 「ドロップ」: 今のセットを `groupType: 'dropset'` で保存（状態の `drop` がなければ新しい `groupId` を作り `saveLogState`）→ 札の同じ札に追記 → 休憩タイマーは動かさない → 重量に `nextDropWeight({ currentWeight, dropIndex, lastChain: lastDropChain(...), step })` を入れる → `dropIndex` を進める。連なり中の「記録する」は同じ `groupId` で保存して連なりを閉じ、休憩タイマーを動かす。連なり中は補助回数を出さない。別の種目に切り替えたら `drop` を閉じる
- 再描画・再読み込み後も、状態の `drop` が今の種目なら同じ `groupId` と `dropIndex` で続ける
- 札（`setChips`）は記録済みのセットを「① 26kg×10」の形で並べ、連なりは「② 24→18→14kg」のように1枚にまとめる。札の中の各セットをタップすると `openSetEditor`（閉じたら札・本日のセット・ヘッダーを描き直す）
- 🎤: 既存の `parseSetUtterance` を使い、種目名があれば種目を切り替え、重量・回数をカードに入れる（「プラス」は体重への上乗せ、今の Task 9 の規則のまま）。保存はしない
- ヘッダーの PR・部位別ボリュームは記録するたびに `exPanel.refresh()` で更新

- [ ] **Step 1: 実装する**（純粋な部分は Task 1〜3 の関数を使い、新しい判断を足さない）
- [ ] **Step 2: `node --check` を全変更ファイルに、`npm test` が `fail 0`**
- [ ] **Step 3: ブラウザで確認する**（375×812、DB初期化、種目1つと前回の記録 26×10, 24×9 を投入）
  1. 見出しが `セット1（前回 26kg×10）`、カードに 26／10
  2. 「記録する」を3回 → 札が ①②③、3件保存、休憩タイマーが毎回開始。ボタン連打（同じ tick で2回 `click()`）しても1件しか増えない
  3. ②の前に重量を 24 に下げて記録 → ③の初期値は 24（①の 26 に戻らない、後のセットに影響しない）
  4. 「ドロップ」→ 重量が下がる、タイマーは動かない、札が1枚にまとまる、他のタブに移って戻っても同じ `groupId` で続く、「記録する」で閉じてタイマーが動く。「本日のセット」で連なりが1つのドロップセットにまとまる
  5. 札をタップ → 編集で 25 に直す → 札が更新。「このセットを削除」→ 札と本日のセットから消える
  6. 重量欄を空にして記録 → エラー表示で保存されない。`26.5` は保存される
  7. 自重種目は体重から始まる。自宅環境では絞り込みが効く。🎤（両方の SpeechRecognition を差し替えたスタブ）で「懸垂 8回」→ カードに反映、保存されない
  8. 横スクロールなし、±ボタン 48px 以上
- [ ] **Step 4: コミット** — `feat: log one set at a time with a large current-set card and drop sets`

---

### Task 5: 種目選択シートと「次はこれ？」、コースの引き継ぎ

**Files:**
- Create: `js/views/workout/exercise-sheet.js`
- Modify: `js/views/workout/exercise-panel.js`（ヘッダーは種目名・部位・PR・ボリュームバー・意識ポイントだけにし、部位セグメント・セレクト・コースのセレクトを取り除く。タップでシートを開く）、`js/views/workout.js`、`css/style.css`

**Interfaces:**
- Consumes: `exerciseUsage`、`sortByUsage`、`suggestNext`、`loadLogState`/`saveLogState`、`categoryKey`、`BODY_PARTS`
- Produces:
  - `openExerciseSheet({ exercises, usage, currentExerciseId, suggestionId, courses, logState, onPick, onCourse, onStartSuperset }): void` — 画面を覆うシートを開く。`exercises` は絞り込み後
  - `onPick(exerciseId)`、`onCourse({ courseIds, courseName })`（「選択なし」は空配列と空文字）、`onStartSuperset(exerciseIds)`（Task 6 で使う。この Task ではボタンだけ置いて無効にしてよい）

**画面と動き**（仕様書「5」「7」）:
- シートは上から「次はこれ？」（`suggestionId` があるとき、大きく1つ）、コースの切替（選択なし／登録コース）、部位タブ（登録がある部位だけ、`BODY_PARTS` 順。コース選択中は先頭に「コース」タブ）、種目タイル（2列、`sortByUsage` 順、`usage` が1以上なら「最近」）、閉じるボタン
- 開いたときの部位タブは今の種目の部位。タイルを押すとシートを閉じて `onPick`
- `workout.js`: 状態の `courseIds` を `suggestNext` に渡す。種目を選ぶと Task 4 の初期値でカードを作り直す
- ホームからの遷移: `opts.initialCourseId` → そのコースの `exerciseIds` と名前を状態に保存し、今日まだやっていない最初の種目を選んだ状態で開く。`opts.initialExerciseIds`（AIの提案）→ 同じく一時コース（名前は `AIおすすめ`）として保存
- 状態やコースに残った、存在しない・絞り込みで見えない種目IDは飛ばす

- [ ] **Step 1: 実装する**
- [ ] **Step 2: `node --check`、`npm test` が `fail 0`**
- [ ] **Step 3: ブラウザで確認する**: ヘッダーをタップ→部位→種目の2タップで切り替わる／よく使う種目が先頭で「最近」付き／前回 A→B→C の順でやった日があり、今日 A を記録したら「次はこれ？」が B／ホームのコースボタンから入るとコースの最初の種目が選ばれていて、「次はこれ？」がコース順／AIの提案から入っても同様／自宅環境でジム専用種目が出ない／375px で横スクロールなし、タイル・タブが押しやすい
- [ ] **Step 4: コミット** — `feat: pick exercises from a two-tap sheet with a next-up suggestion`

---

### Task 6: スーパーセット

**Files:**
- Modify: `js/views/workout/exercise-sheet.js`、`js/views/workout.js`、`js/views/workout/exercise-panel.js`、`css/style.css`

**Interfaces:**
- Consumes: Task 3 の `LogState.superset`、Task 5 の `onStartSuperset`
- Produces: 状態 `superset = { exerciseIds, index, groupId }` を使う記録の流れ

**動き**（仕様書「4」「7」）:
- シートの「スーパーセットを組む」で複数選択モードにし、今の種目を1番目に、2〜4種目を選んで「この組で始める」→ 新しい `groupId` で `superset` を保存
- ヘッダーは「A ⇄ B（⇄ C ⇄ D）」と今の種目を強調し、「組を解く」で `superset = null`
- 組の間の「記録する」: `groupType: 'superset'` と組の `groupId` で保存 → 組の最後でなければ次の種目へ切り替え（タイマーは動かさない）、最後なら `startRest()` して最初の種目へ。切り替えた種目のカードは Task 4 の初期値の規則で埋める
- 組の間は「ドロップ」を出さない。シートで組にない種目を選ぶと組を解く
- タブ移動・再読み込み後も同じ組・`index`・`groupId` で続く

- [ ] **Step 1: 実装する**
- [ ] **Step 2: `node --check`、`npm test` が `fail 0`**
- [ ] **Step 3: ブラウザで確認する**: A・Bで組み、A記録→Bに切り替わりタイマーは動かない→B記録でタイマーが動きAへ／3周で6件、すべて同じ `groupId`・`groupType: 'superset'`、「本日のセット」で1つのスーパーセットにまとまる／途中でタブを移って戻っても同じ組の続き／「組を解く」で通常に戻り、ドロップが出る／3種目の組でも一周する
- [ ] **Step 4: コミット** — `feat: alternate superset exercises automatically in one-set logging`

---

### Task 7: 仕上げとキャッシュ更新

**Files:**
- Modify: `sw.js`（`gachi-fit-v29`、`ASSETS` に `js/lib/logging.js`・`js/lib/prefs.js`・`js/lib/logState.js`・`js/views/workout/current-set.js`・`js/views/workout/exercise-sheet.js` を足し、`js/views/workout/set-entry.js` を抜く）、必要なら `css/style.css`

- [ ] **Step 1: `sw.js` を更新し、`find js -name '*.js'` の全ファイルが `ASSETS` にあり、`ASSETS` に存在しないファイルがないことを確かめる**
- [ ] **Step 2: `npm test` が `fail 0`**
- [ ] **Step 3: 通しで確認する**（DB初期化、375×812）: 自宅で一括追加 → コース「自宅 プッシュ」→ 1種目目を3セット（記録3回）→ 「次はこれ？」で2種目目 → ドロップ1回 → スーパーセット2周 → 「本日のセット」とホームのカレンダー・キャラのカードに反映（記録時刻から所要時間が出る）。コンソールのエラーは Service Worker の登録失敗（ペインの制約）だけ
- [ ] **Step 4: コミット** — `chore: PWA cache v29 for one-set logging`

---

## Self-Review

- **仕様の網羅**: 画面構成・記録・初期値・前回・刻み・保存条件・札の編集削除（Task 4）、ドロップ（Task 1・4）、スーパーセット（Task 6）、種目シート・よく使う順・次はこれ？・コース・AI（Task 2・5）、設定（Task 3）、細部の決定（Task 1・3〜6）、確認事項（各 Task の確認と Task 7）
- **名前の一致**: `Slot`・`toSlots`・`lastSessionSlots`・`initialSetValues`・`previousForSet`・`lastDropChain`・`nextDropWeight`・`parseNumberInput`・`exerciseUsage`・`sortByUsage`・`suggestNext`・`getWeightStep`・`loadLogState`/`saveLogState`・`createCurrentSet`・`startRest`・`openExerciseSheet` を Task 間で同じ名前で使っている
- **Review Focus**: 1→Task 4 確認2、2→Task 3 テスト、3→Task 4 確認4・Task 6 確認、4→Task 1 テスト、5→Task 2 テスト・Task 5
