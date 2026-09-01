# 記録まわりの使い勝手改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** コースをゼロから組まずに使えるようにし、数値入力から不要な操作を省き、開閉矢印と休憩タイマーを指と目に合うサイズにする。

**Architecture:** コースプリセットのデータと純粋関数を `js/lib/coursePresets.js` に置き、UI は既存の `js/views/courses.js` に節を足す。ステッパーの空欄化は `js/views/components.js` の1関数に閉じ、読み取り API を変えないので保存ロジックは無変更。矢印とタイマーは `css/style.css` の数値変更が主体。

**Tech Stack:** Vanilla JS（ESモジュール、ビルドなし）、IndexedDB（`js/db.js`）、Node標準 `node:test`。

## Global Constraints

- 既存の記録挙動を変えない：通常モードの重量自動追従（`weightTouched`）、ドロップセットの保存後重量引き継ぎ、ビープ（残り1〜10秒は880Hz/150ms、0秒は1200Hz/400ms）、`patchTodayWorkout` の直列化キュー
- `createStepper` の `read()` の戻り値の意味を変えない（空欄は 0 として読む既存挙動をそのまま使う）
- 保存側のロジック（`rv.weight > 0 && rv.reps > 0` の絞り込み、推定1RM算出）を変更しない
- IndexedDB のストア・レコード形状・`DB_VERSION` を変更しない
- 起動時のコース自動投入（seed）は行わない。ユーザーが明示的にタップしたときだけ作成する
- スマホ幅375pxで横スクロールを発生させない
- 新規JSファイルは必ず `sw.js` の `ASSETS` 配列に追加する
- `--tap` は 56px（`css/style.css` の `:root` で定義済み）

---

### Task 1: コースプリセットのデータと純粋関数

**Files:**
- Create: `js/lib/coursePresets.js`
- Test: `test/coursePresets.test.js`
- Modify: `sw.js`

**Interfaces:**
- Consumes: `DEFAULT_EXERCISE_PRESETS`（`js/lib/exercisePresets.js`）、`COURSE_MIN_EX` / `COURSE_MAX_EX`（`js/lib/constants.js`）
- Produces: `DEFAULT_COURSE_PRESETS: {name: string, exercises: string[]}[]`、`missingExerciseNames(names, exercises): string[]`。Task 2（`js/views/courses.js`）が両方を使う。

- [ ] **Step 1: Write the failing tests**

`test/coursePresets.test.js` を新規作成:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COURSE_PRESETS, missingExerciseNames } from '../js/lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../js/lib/exercisePresets.js';
import { COURSE_MIN_EX, COURSE_MAX_EX } from '../js/lib/constants.js';

test('missingExerciseNames returns all names when none are registered', () => {
  assert.deepEqual(missingExerciseNames(['A', 'B'], []), ['A', 'B']);
});

test('missingExerciseNames returns empty when all are registered', () => {
  const exercises = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
  assert.deepEqual(missingExerciseNames(['A', 'B'], exercises), []);
});

test('missingExerciseNames returns only the unregistered ones, keeping order', () => {
  const exercises = [{ id: '1', name: 'B' }];
  assert.deepEqual(missingExerciseNames(['A', 'B', 'C'], exercises), ['A', 'C']);
});

test('missingExerciseNames dedupes repeated names', () => {
  assert.deepEqual(missingExerciseNames(['A', 'A', 'B'], []), ['A', 'B']);
});

test('missingExerciseNames returns empty array for empty input', () => {
  assert.deepEqual(missingExerciseNames([], [{ id: '1', name: 'A' }]), []);
});

test('every course preset exercise exists in the exercise presets', () => {
  const known = new Set(DEFAULT_EXERCISE_PRESETS.map((p) => p.name));
  for (const course of DEFAULT_COURSE_PRESETS) {
    for (const name of course.exercises) {
      assert.ok(known.has(name), `${course.name} の「${name}」が種目プリセットに存在しない`);
    }
  }
});

test('every course preset has between COURSE_MIN_EX and COURSE_MAX_EX exercises', () => {
  for (const course of DEFAULT_COURSE_PRESETS) {
    assert.ok(course.exercises.length >= COURSE_MIN_EX,
      `${course.name} の種目数が ${COURSE_MIN_EX} 未満`);
    assert.ok(course.exercises.length <= COURSE_MAX_EX,
      `${course.name} の種目数が ${COURSE_MAX_EX} 超過`);
  }
});

test('no course preset repeats an exercise', () => {
  for (const course of DEFAULT_COURSE_PRESETS) {
    assert.equal(new Set(course.exercises).size, course.exercises.length,
      `${course.name} に重複した種目がある`);
  }
});

test('course preset names are unique', () => {
  const names = DEFAULT_COURSE_PRESETS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL（`Cannot find module '../js/lib/coursePresets.js'`）

- [ ] **Step 3: Implement**

`js/lib/coursePresets.js` を新規作成:

```js
// よく使う組み合わせのコース。種目名は DEFAULT_EXERCISE_PRESETS に実在するものだけを使う
export const DEFAULT_COURSE_PRESETS = [
  { name: '胸・肩', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ショルダープレス', 'サイドレイズ'] },
  { name: '背中・腕', exercises: ['デッドリフト', 'ラットプルダウン', 'ベントオーバーロウ', 'バーベルカール', 'ケーブルプッシュダウン'] },
  { name: '脚', exercises: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール', 'カーフレイズ'] },
  { name: '胸のみ', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ディップス'] },
  { name: 'プッシュ', exercises: ['ベンチプレス', 'ショルダープレス', 'サイドレイズ', 'ケーブルプッシュダウン'] },
  { name: 'プル', exercises: ['懸垂', 'ラットプルダウン', 'シーテッドロウ', 'バーベルカール'] },
];

// names のうち exercises に同名が存在しないものを、順序を保ち重複を除いて返す（純粋関数）
export function missingExerciseNames(names, exercises) {
  const registered = new Set(exercises.map((e) => e.name));
  const seen = new Set();
  const out = [];
  for (const name of names) {
    if (registered.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -10`
Expected: 全件PASS（既存93件＋新規9件＝102件）

- [ ] **Step 5: `sw.js` の ASSETS に追加**

`sw.js` の `js/lib/...` が並ぶ行の末尾に `'js/lib/coursePresets.js',` を追加する。

- [ ] **Step 6: Commit**

```bash
git add js/lib/coursePresets.js test/coursePresets.test.js sw.js
git commit -m "feat: add course presets and a helper for unregistered exercise names"
```

---

### Task 2: コースの「プリセットから作成」UI

**Files:**
- Modify: `js/views/courses.js`

**Interfaces:**
- Consumes: `DEFAULT_COURSE_PRESETS` / `missingExerciseNames`（`js/lib/coursePresets.js`、Task 1）、`DEFAULT_EXERCISE_PRESETS`（`js/lib/exercisePresets.js`）、`matchExerciseNamesToIds`（`js/lib/courses.js`）、`escapeHtml`（`js/lib/html.js`）、`getAll` / `put` / `uid`（`js/db.js`）
- Produces: なし（末端のビュー）

- [ ] **Step 1: import を追加**

`js/views/courses.js` の先頭の import 群に次の2行を追加する:

```js
import { DEFAULT_COURSE_PRESETS, missingExerciseNames } from '../lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../lib/exercisePresets.js';
```

既存の `import { mostUsedExerciseIds } from '../lib/courses.js';` を次に変更して `matchExerciseNamesToIds` も取り込む:

```js
import { mostUsedExerciseIds, matchExerciseNamesToIds } from '../lib/courses.js';
```

- [ ] **Step 2: プリセット節の HTML を追加**

`js/views/courses.js` の `el.innerHTML` テンプレートの中で、`<strong>コース</strong>` の**直後**（`<div class="field mt-2"><label>コース名</label>` の前）に次を挿入する:

```js
      <div class="field mt-2"><label>プリセットから作成</label>
        <div id="course-presets"></div></div>
      <div id="course-preset-msg" class="muted mt-1"></div>
```

- [ ] **Step 3: プリセットのチップを描画して結線する**

`js/views/courses.js` の `renderCourses` 関数の末尾、既存の

```js
  renderCourseSlots();
  renderCourseList();
}
```

を次に置き換える:

```js
  renderPresets();
  renderCourseSlots();
  renderCourseList();
}
```

そして `renderCourses` 関数の中（`export async function renderCourses(el) {` の内側であればどこでもよいが、既存の `async function renderCourseList()` の定義の直後が読みやすい）に、次の2つの関数宣言を追加する:

```js
  function renderPresets() {
    el.querySelector('#course-presets').innerHTML = DEFAULT_COURSE_PRESETS
      .map((c) => `<span class="chip chip-tag" data-preset-course="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>`).join('');
    el.querySelectorAll('[data-preset-course]').forEach((chip) =>
      chip.addEventListener('click', () => createFromPreset(chip.dataset.presetCourse)));
  }

  async function createFromPreset(presetName) {
    const preset = DEFAULT_COURSE_PRESETS.find((c) => c.name === presetName);
    if (!preset) return;

    // 未登録の種目を種目プリセットから補って登録する
    const current = await getAll('exercises');
    const missing = missingExerciseNames(preset.exercises, current);
    for (const name of missing) {
      const src = DEFAULT_EXERCISE_PRESETS.find((p) => p.name === name);
      if (!src) continue;
      await put('exercises', {
        id: uid(), name: src.name, bodyPart: src.bodyPart, category: src.category,
        cuePresets: [], setPattern: '通常',
      });
    }

    const after = await getAll('exercises');
    const exerciseIds = matchExerciseNamesToIds(preset.exercises, after);
    await put('courses', { id: uid(), name: preset.name, exerciseIds });

    // 画面全体を作り直したあとにメッセージを入れる（再描画で消えないようにするため）
    await renderCourses(el);
    el.querySelector('#course-preset-msg').textContent = missing.length
      ? `${preset.name}コースを作成しました（種目${missing.length}件を追加）`
      : `${preset.name}コースを作成しました`;
  }
```

- [ ] **Step 4: 種目0件のときもプリセットを使えるようにする**

`js/views/courses.js` には種目が0件のときの早期 return がある（28〜35行目付近）:

```js
  if (!exercises.length) {
    el.querySelector('#course-slots').innerHTML = '<p class="muted">先に種目を登録してください。</p>';
    el.querySelector('#course-save').disabled = true;
    el.querySelector('#course-autofill').disabled = true;
    el.querySelector('#course-slot-add').disabled = true;
    el.querySelector('#course-slot-remove').disabled = true;
    return;
  }
```

プリセットは種目が0件でも使える（不足種目ごと自動登録するため）ので、`return;` の直前に次の2行を追加する:

```js
    renderPresets();
    renderCourseList();
```

`renderPresets` / `createFromPreset` / `renderCourseList` はいずれも `function` または `async function` の宣言なので、この早期 return より後ろに定義されていても巻き上げにより呼び出せる。ただし `renderCourseSlots` は `let courseSlots` を参照し、その `let` は早期 return より後ろにあるため、**早期 return のブロック内で `renderCourseSlots()` を呼んではならない**（一時的死角に入る）。

- [ ] **Step 5: テスト**

Run: `npm test 2>&1 | tail -10`
Expected: 102件すべてPASS（ビュー層のためテスト追加なし）

- [ ] **Step 6: ブラウザで確認**

リポジトリルートで `python3 -m http.server 8830` をバックグラウンド起動し、`preview_start` で `{"url":"http://localhost:8830"}` を開く。`resize_window` で `{"preset":"mobile"}`。

1. 種目を1件も登録していない状態から、管理→コースで「プリセットから作成」のチップが6つ出ること
2. 「胸・肩」をタップ→「胸・肩コースを作成しました（種目5件を追加）」が出て、コース一覧に「胸・肩」が現れること
3. 管理→種目で、追加された5種目（ベンチプレス／インクラインベンチプレス／ダンベルフライ／ショルダープレス／サイドレイズ）が一覧にあること
4. 続けて「プッシュ」をタップ→ベンチプレス・ショルダープレス・サイドレイズは既に登録済みなので「（種目1件を追加）」（ケーブルプッシュダウンのみ）と出ること
5. `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 7: Commit**

```bash
git add js/views/courses.js
git commit -m "feat: create a course from a preset, registering missing exercises"
```

---

### Task 3: ステッパーの初期値を空欄にする

**Files:**
- Modify: `js/views/components.js`

**Interfaces:**
- Consumes: なし
- Produces: `createStepper` の外部 API（`get()` / `set(v)`）は変更しない。呼び出し側8箇所（`js/views/set-editor.js` に3、`js/views/workout/set-entry.js` に5）は無変更。

- [ ] **Step 1: `createStepper` を変更**

`js/views/components.js` の全体を次に置き換える:

```js
// [−] 数値input [＋] のステッパーを container に描画する。
// 0 は空欄で表示し、プレースホルダの 0 を見せる（手入力時に 0 を消す手間をなくすため）
export function createStepper(container, { value = 0, step = 1, min = 0, onChange } = {}) {
  container.classList.add('stepper');
  const display = (v) => (v === 0 ? '' : v);
  container.innerHTML = `
    <button type="button" class="stepper-btn" data-dir="-1">−</button>
    <input class="stepper-input" type="number" inputmode="decimal" placeholder="0" value="${display(value)}" />
    <button type="button" class="stepper-btn" data-dir="1">＋</button>`;
  const input = container.querySelector('.stepper-input');
  const fix = (n) => Math.round(n * 100) / 100;
  const read = () => { const n = parseFloat(input.value); return Number.isFinite(n) ? n : 0; };
  const emit = () => onChange && onChange(read());
  container.querySelectorAll('.stepper-btn').forEach((b) =>
    b.addEventListener('click', () => {
      let n = read() + step * Number(b.dataset.dir);
      if (n < min) n = min;
      input.value = display(fix(n));
      emit();
    }));
  input.addEventListener('input', emit);
  return {
    get: read,
    set: (v) => { input.value = display(v); },
  };
}
```

変更点は3つだけ。`display` ヘルパの追加、`placeholder="0"` と `value="${display(value)}"`、`＋`/`−` と `set` での `display()` 適用。`read()` は一切変更しない。

- [ ] **Step 2: テスト**

Run: `npm test 2>&1 | tail -10`
Expected: 102件すべてPASS（ビュー層のためテスト追加なし）

- [ ] **Step 3: ブラウザで確認（既存挙動の回帰確認が主眼）**

`python3 -m http.server 8831` を起動し `preview_start` で開く。`resize_window` で `{"preset":"mobile"}`。種目を2〜3件登録した状態を作る。

1. 記録タブの重量・回数の入力欄が**空欄**で、薄い `0` がプレースホルダとして見えること
2. 空欄をタップして `100` と直接打てること（先頭の 0 を消す操作が不要）
3. `＋` を押すと 1 になり、`−` で 0 に戻ると再び空欄になること
4. **通常モードの重量自動追従（回帰確認）**: セット1の重量に 60 を入れると、未編集のセット2・3にも 60 が入ること。セット2を 55 に手で変えたあと、セット1を 70 にしても**セット2は 55 のまま**であること
5. **ドロップセットの重量引き継ぎ（回帰確認）**: ドロップセットモードで重量 100/90/80・回数を入れて保存し、保存後に**重量は 100/90/80 のまま、回数だけ空欄**になること
6. 補助ありトグルをONにした補助回数の欄も空欄始まりであること
7. 「本日のセット」から編集モーダルを開き、既存の重量・回数が正しく入っていること（0 でない値は表示される）
8. スーパーセットモードの重量・回数も空欄始まりであること

- [ ] **Step 4: Commit**

```bash
git add js/views/components.js
git commit -m "feat: show an empty stepper instead of a literal zero"
```

---

### Task 4: 矢印の視認性と休憩タイマーの拡大

**Files:**
- Modify: `css/style.css`
- Modify: `js/views/workout/exercise-panel.js`

**Interfaces:**
- Consumes: `--tap`（56px、`css/style.css` の `:root`）
- Produces: `.caret` クラス

- [ ] **Step 1: 折りたたみ矢印を大きくする**

`css/style.css` の次の2行:

```css
.fold > summary { list-style: none; display: flex; justify-content: space-between;
  align-items: center; min-height: 32px; cursor: pointer; }
```
```css
.fold > summary::after { content: '▸'; color: var(--muted); font-size: 14px; }
```

をそれぞれ次に変更する:

```css
.fold > summary { list-style: none; display: flex; justify-content: space-between;
  align-items: center; min-height: 44px; cursor: pointer; }
```
```css
.fold > summary::after { content: '▸'; color: var(--text); font-size: 20px; }
```

- [ ] **Step 2: 種目ヘッダーの矢印用クラスを追加し、タップ領域を広げる**

`css/style.css` の次の行:

```css
.ex-header-main { display: flex; justify-content: space-between; align-items: center;
  min-height: 32px; cursor: pointer; gap: 10px; }
```

を次に変更する:

```css
.ex-header-main { display: flex; justify-content: space-between; align-items: center;
  min-height: 44px; cursor: pointer; gap: 10px; }
.caret { font-size: 20px; color: var(--text); }
```

- [ ] **Step 3: 種目ヘッダーの矢印に `.caret` を適用する**

`js/views/workout/exercise-panel.js` の次の行:

```js
      <span class="muted" id="w-ex-caret">▾</span>
```

を次に変更する:

```js
      <span class="caret" id="w-ex-caret">▾</span>
```

同ファイル内の `#w-ex-caret` の `textContent` を書き換えている2箇所（`▾` / `▴` の切り替え）は変更しない。

- [ ] **Step 4: 休憩タイマーを大きくする**

`css/style.css` の次のブロック:

```css
.interval-bar { position: fixed; left: 12px; right: 12px;
  bottom: calc(68px + env(safe-area-inset-bottom)); z-index: var(--z-fixed);
  background: #0d0d0d; border: 1px solid #333; border-radius: 14px;
  padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
.interval-time { font-size: 22px; font-weight: 800; color: var(--accent);
  font-variant-numeric: tabular-nums; min-width: 62px; }
.interval-btn { flex: 1; min-height: 44px; font-size: 14px; padding: 0 10px; }
body.has-interval-bar { padding-bottom: calc(148px + env(safe-area-inset-bottom)); }
```

を次に置き換える:

```css
.interval-bar { position: fixed; left: 12px; right: 12px;
  bottom: calc(68px + env(safe-area-inset-bottom)); z-index: var(--z-fixed);
  background: #0d0d0d; border: 1px solid #333; border-radius: 14px;
  padding: 14px 12px; display: flex; align-items: center; gap: 10px; }
.interval-time { font-size: 28px; font-weight: 800; color: var(--accent);
  font-variant-numeric: tabular-nums; min-width: 76px; }
.interval-btn { flex: 1; min-height: var(--tap); font-size: 16px; padding: 0 10px; }
body.has-interval-bar { padding-bottom: calc(170px + env(safe-area-inset-bottom)); }
```

- [ ] **Step 5: テスト**

Run: `npm test 2>&1 | tail -10`
Expected: 102件すべてPASS（CSS とビュー層のためテスト追加なし）

- [ ] **Step 6: ブラウザで確認**

`python3 -m http.server 8832` を起動し `preview_start` で開く。`resize_window` で `{"preset":"mobile"}`。種目を1件以上登録した状態にする。

1. 記録タブの「本日のセット」「本日の感想」「場所・時間」の矢印が以前より大きく、白系の色で見えること
2. 種目ヘッダー右端の `▾` が大きくなり、タップで開閉すると `▴` に変わること
3. 休憩タイマーのバーが大きくなっていること。`javascript_tool` で次を実行し、バー高さが 80px 以上、かつタブバーと重なっていないことを確認する:

```js
(() => {
  const bar = document.querySelector('.interval-bar');
  const tab = document.querySelector('.tabbar');
  const b = bar.getBoundingClientRect(), t = tab.getBoundingClientRect();
  return { barHeight: Math.round(b.height), barBottom: Math.round(b.bottom),
           tabTop: Math.round(t.top), overlaps: b.bottom > t.top };
})()
```

4. 記録タブを一番下までスクロールしても、最後の折りたたみがタイマーバーに隠れないこと
5. 開始／停止ボタンが押しやすい大きさになっていること（`.interval-btn` の高さが 56px であること）
6. `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 7: Commit**

```bash
git add css/style.css js/views/workout/exercise-panel.js
git commit -m "style: enlarge disclosure carets and the rest timer bar"
```

---

### Task 5: PWAキャッシュの更新と全体確認

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

差分があれば `ASSETS` を修正する。特に `js/lib/coursePresets.js` が含まれること。

- [ ] **Step 2: cache version を上げる**

`sw.js` の1行目 `const CACHE = 'gachi-fit-v24';` を `const CACHE = 'gachi-fit-v25';` に変更する。

- [ ] **Step 3: 全体動作確認**

Run: `npm test 2>&1 | tail -10`
Expected: 102件すべてPASS

`python3 -m http.server 8833` を起動し `preview_start` で開く。`resize_window` で `{"preset":"mobile"}`。全4タブを一巡する:

1. ホーム：カレンダー・日タップでの詳細・推定1RM が従来どおり。「みんなの予定」カードは出ない（Firebase 未設定のため）
2. 記録：種目ヘッダー、空欄始まりのステッパー、セット保存、大きくなったタイマーバー
3. 分析：履歴・インサイト・ボディの切替
4. 管理：種目・コース・場所・設定の切替。コースで「プリセットから作成」が動く
5. `read_console_messages` でエラーがないこと（Service Worker 登録エラーはこの環境の既知の制約で無関係）
6. 各タブで `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: PWA cache v25 for record usability improvements"
```

## Self-Review Notes

- **Spec coverage**: ①コースプリセット→Task 1（データ・純粋関数・整合性テスト）＋Task 2（UI・未登録種目の自動登録）、②ステッパーの0→Task 3、③矢印→Task 4 Step 1-3、④休憩タイマー→Task 4 Step 4、`sw.js` 追従→Task 1 Step 5 で追加し Task 5 で最終突合。
- **Placeholder scan**: なし。
- **Type consistency**: `DEFAULT_COURSE_PRESETS` の要素形 `{name, exercises: string[]}`（Task 1 で定義、Task 2 で `preset.name` / `preset.exercises` として使用）、`missingExerciseNames(names, exercises): string[]`（Task 1 定義、Task 2 使用）、`matchExerciseNamesToIds(names, exercises): string[]`（既存、Task 2 使用）、`createStepper` の `get()` / `set(v)`（Task 3 で外部 API 不変）、`.caret` クラス（Task 4 Step 2 で定義、Step 3 で適用）— いずれも一致を確認済み。
