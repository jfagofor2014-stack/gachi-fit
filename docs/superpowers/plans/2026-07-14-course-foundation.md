# コース機能（土台） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3〜6種目の組み合わせを「コース」として作成・保存できるようにし、記録タブでコースを選んでその種目を順にタップしながら記録できるようにする。

**Architecture:** 新規IndexedDBストア `courses` を追加する（`js/db.js`のDBバージョンを4に）。使用頻度による自動セットは新規 `js/lib/courses.js` の純粋関数で実装する。コースの作成・管理UIは `js/views/exercises.js`、記録タブでの利用は `js/views/workout.js` に追加する。

**Tech Stack:** Vanilla JS (ES Modules), IndexedDB, `node:test`。

## Global Constraints
- 新規ストア `courses`：`{id, name, exerciseIds: string[]}`
- コースの種目スロットは初期4・最小3・最大6（スーパーセットの種目スロットと同じ±ボタン方式、各スロットは全種目のフラット`<select>`）
- 「よく使う種目で自動セット」はセット記録数が多い順に種目IDを埋める（`mostUsedExerciseIds`）。自動セット後も手動で変更可能
- 記録タブでコースの種目をタップすると、既存の `renderExPartSeg`/`renderExSelect`/`refreshPR`/`refreshVolumeBar` を使ってその種目に切り替える（`categoryKey`で部位を算出）
- コースに含まれる種目が削除されている場合はスキップして表示しない
- 既存 `getAll`/`put`/`remove`/`uid`、`categoryKey`、`escapeHtml` に準拠

---

## Task 1: coursesストアの追加（db.js）

**Files:**
- Modify: `js/db.js`

**Interfaces:**
- Produces: `courses` ストアが `getAll('courses')`/`put('courses', ...)`/`remove('courses', id)` で操作可能になる

- [ ] **Step 1: STORESとDB_VERSIONを更新**

`js/db.js` の次の2行：
```js
const DB_NAME = 'gachi-fit';
const DB_VERSION = 3;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs', 'photos', 'goals', 'bodyWeights', 'setPatterns', 'places'];
```
を次に置き換え：
```js
const DB_NAME = 'gachi-fit';
const DB_VERSION = 4;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs', 'photos', 'goals', 'bodyWeights', 'setPatterns', 'places', 'courses'];
```

- [ ] **Step 2: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/db.js && echo OK`
Expected: `OK`

- [ ] **Step 3: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS（既存74件がそのまま通ること。db.jsはユニットテスト対象外）

- [ ] **Step 4: ブラウザで動作確認**

preview でアプリを開き、コンソールでエラーが出ないこと（IndexedDBのバージョンアップグレードが正常に行われること）を確認。開発者ツールのIndexedDBインスペクタで`courses`ストアが作成されていることを確認できればなお良い。

- [ ] **Step 5: コミット**

```bash
git add js/db.js
git commit -m "feat: add courses object store (DB version 4)"
```

---

## Task 2: 使用頻度による種目抽出（courses.js）

**Files:**
- Create: `js/lib/courses.js`
- Test: `test/courses.test.js`

**Interfaces:**
- Produces: `mostUsedExerciseIds(sets, count)` → `string[]`（セット記録数が多い順、上位`count`件の種目ID）

- [ ] **Step 1: 失敗するテストを書く**

`test/courses.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostUsedExerciseIds } from '../js/lib/courses.js';

test('mostUsedExerciseIds returns exercise ids ordered by set count descending', () => {
  const sets = [
    { exerciseId: 'a' }, { exerciseId: 'a' }, { exerciseId: 'a' },
    { exerciseId: 'b' }, { exerciseId: 'b' },
    { exerciseId: 'c' },
  ];
  assert.deepEqual(mostUsedExerciseIds(sets, 3), ['a', 'b', 'c']);
});

test('mostUsedExerciseIds returns only count items', () => {
  const sets = [
    { exerciseId: 'a' }, { exerciseId: 'a' },
    { exerciseId: 'b' },
    { exerciseId: 'c' },
  ];
  assert.deepEqual(mostUsedExerciseIds(sets, 2), ['a', 'b']);
});

test('mostUsedExerciseIds returns empty array for no sets', () => {
  assert.deepEqual(mostUsedExerciseIds([], 3), []);
});

test('mostUsedExerciseIds returns fewer items when fewer exercises exist than count', () => {
  const sets = [{ exerciseId: 'a' }];
  assert.deepEqual(mostUsedExerciseIds(sets, 3), ['a']);
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: FAIL（`js/lib/courses.js`が存在しない）

- [ ] **Step 3: courses.js を実装**

`js/lib/courses.js`:
```js
// セット記録数が多い順に種目IDを返す（純粋関数）
export function mostUsedExerciseIds(sets, count) {
  const counts = {};
  for (const s of sets) counts[s.exerciseId] = (counts[s.exerciseId] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
}
```

- [ ] **Step 4: テスト合格を確認**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add js/lib/courses.js test/courses.test.js
git commit -m "feat: add most-used-exercise ranking for course auto-fill"
```

---

## Task 3: コースの作成・管理UI（exercises.js）

**Files:**
- Modify: `js/views/exercises.js`

**Interfaces:**
- Consumes: `mostUsedExerciseIds(sets, count)`（`../lib/courses.js`、Task 2）
- Produces: `renderExercises(el)` の外部シグネチャは変更なし。`courses`ストアに`{id, name, exerciseIds}`を書き込む

- [ ] **Step 1: mostUsedExerciseIdsをimportし、setsを取得**

`js/views/exercises.js` の1〜9行目：
```js
import { getAll, put, remove, uid } from '../db.js';
import { searchPresets } from '../lib/exercisePresets.js';

export const BODY_PARTS = ['背中', '胸', '肩', '脚', '腕', 'その他'];

export async function renderExercises(el) {
  const exercises = await getAll('exercises');
  let patterns = (await getAll('setPatterns')).map((p) => p.name);
  if (patterns.length === 0) patterns = ['通常'];
```
を次に置き換え：
```js
import { getAll, put, remove, uid } from '../db.js';
import { searchPresets } from '../lib/exercisePresets.js';
import { mostUsedExerciseIds } from '../lib/courses.js';

export const BODY_PARTS = ['背中', '胸', '肩', '脚', '腕', 'その他'];
const COURSE_MIN_EX = 3;
const COURSE_MAX_EX = 6;
const COURSE_DEFAULT_EX = 4;

export async function renderExercises(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
  let patterns = (await getAll('setPatterns')).map((p) => p.name);
  if (patterns.length === 0) patterns = ['通常'];
```

- [ ] **Step 2: コースのHTMLを追加**

`js/views/exercises.js` の次のブロック：
```js
    <div class="card">
      <strong>場所の登録</strong>
      <div class="row" style="margin-top:8px">
        <input id="pl-name" class="input" placeholder="例: 〇〇ジム 渋谷店" />
        <button id="pl-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="pl-list"></div>
    </div>`;
```
を次に置き換え：
```js
    <div class="card">
      <strong>場所の登録</strong>
      <div class="row" style="margin-top:8px">
        <input id="pl-name" class="input" placeholder="例: 〇〇ジム 渋谷店" />
        <button id="pl-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="pl-list"></div>
    </div>
    <div class="card">
      <strong>コース</strong>
      <div class="field" style="margin-top:8px"><label>コース名</label>
        <input id="course-name" class="input" placeholder="例: 胸・肩コース" /></div>
      <div id="course-slots" style="margin-top:8px"></div>
      <div class="row" style="margin-top:8px">
        <button type="button" id="course-slot-add" class="btn">＋ 種目を追加</button>
        <button type="button" id="course-slot-remove" class="btn">− 種目を削除</button>
      </div>
      <button type="button" id="course-autofill" class="btn btn-block" style="margin-top:8px">よく使う種目で自動セット</button>
      <div id="course-error" class="error"></div>
      <button id="course-save" class="btn btn-primary btn-block" style="margin-top:8px">コースを保存</button>
      <div id="course-list" style="margin-top:12px"></div>
    </div>`;
```

- [ ] **Step 3: コースのJSロジックを追加**

`js/views/exercises.js` の次の行：
```js
  renderList(el, exercises);
```
の直前に挿入：
```js
  let courseSlots = Array.from({ length: COURSE_DEFAULT_EX }, () => (exercises[0] && exercises[0].id) || '');

  function renderCourseSlots() {
    const wrap = el.querySelector('#course-slots');
    wrap.innerHTML = courseSlots.map((exId, i) => `
      <div class="field"><label>種目 ${i + 1}</label>
        <select id="course-slot-${i}" class="input">
          ${exercises.map((e) => `<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('')}
        </select></div>`).join('');
    courseSlots.forEach((_, i) => {
      el.querySelector(`#course-slot-${i}`).addEventListener('change', (e) => {
        courseSlots[i] = e.target.value;
      });
    });
    el.querySelector('#course-slot-add').disabled = courseSlots.length >= COURSE_MAX_EX;
    el.querySelector('#course-slot-remove').disabled = courseSlots.length <= COURSE_MIN_EX;
  }

  el.querySelector('#course-slot-add').addEventListener('click', () => {
    if (courseSlots.length < COURSE_MAX_EX) courseSlots.push((exercises[0] && exercises[0].id) || '');
    renderCourseSlots();
  });
  el.querySelector('#course-slot-remove').addEventListener('click', () => {
    if (courseSlots.length > COURSE_MIN_EX) courseSlots.pop();
    renderCourseSlots();
  });

  el.querySelector('#course-autofill').addEventListener('click', () => {
    const topIds = mostUsedExerciseIds(sets, courseSlots.length);
    courseSlots = courseSlots.map((exId, i) => topIds[i] || exId);
    renderCourseSlots();
  });

  el.querySelector('#course-save').addEventListener('click', async () => {
    const name = el.querySelector('#course-name').value.trim();
    const err = el.querySelector('#course-error');
    if (!name) { err.textContent = 'コース名を入力してください'; return; }
    if (courseSlots.some((id) => !id)) { err.textContent = 'すべてのスロットで種目を選択してください'; return; }
    err.textContent = '';
    await put('courses', { id: uid(), name, exerciseIds: [...courseSlots] });
    renderExercises(el);
  });

  renderCourseSlots();

  async function renderCourseList() {
    const courses = await getAll('courses');
    const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
    el.querySelector('#course-list').innerHTML = courses.map((c) => `
      <div class="card">
        <div class="list-item" style="border:none;padding:0">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            <div class="muted">${c.exerciseIds.map((id) => escapeHtml(nameOf(id))).join('、')}</div>
          </div>
          <button class="btn btn-danger" data-course-del="${c.id}">削除</button>
        </div>
      </div>`).join('') || '<p class="muted">まだコースがありません。</p>';
    el.querySelectorAll('[data-course-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('courses', b.dataset.courseDel); renderCourseList(); }));
  }
  renderCourseList();

  renderList(el, exercises);
```

Note: この置き換えは既存の `renderList(el, exercises);` 行も含む（末尾に元の行を残す）。

- [ ] **Step 4: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/exercises.js && echo OK`
Expected: `OK`

- [ ] **Step 5: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 6: ブラウザで動作確認**

preview のその他タブ→メニュー管理で、種目を3件以上登録した状態にして：
- 「コース」カードが場所の登録の下に表示される
- 種目スロットが初期4つ表示され、＋/－で3〜6個の範囲で増減する
- 「よく使う種目で自動セット」→記録数が多い種目がスロットに反映される（記録がまだ無ければ既存の初期値のまま）
- コース名を入力し保存→コース一覧に表示される
- コース名を空にして保存→エラー表示
- コース一覧の削除ボタン→そのコースが消える
- コンソールにエラーが出ていないこと

- [ ] **Step 7: コミット**

```bash
git add js/views/exercises.js
git commit -m "feat: add course creation and management to menu view"
```

---

## Task 4: 記録タブでのコース利用（workout.js）

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `categoryKey`（既存import済み）
- Produces: `renderWorkout(el, navigate, opts)` の外部シグネチャは変更なし

- [ ] **Step 1: coursesを取得**

`js/views/workout.js` の次の行：
```js
  const places = await getAll('places');
```
の直後に追加：
```js
  const courses = await getAll('courses');
```

- [ ] **Step 2: コースカードのHTMLを追加**

`js/views/workout.js` の次のブロック：
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
を次に置き換え：
```js
    <div class="card">
      <strong>コース</strong>
      <div class="field" style="margin-top:8px"><label>今日のコース</label>
        <select id="w-course" class="input">
          <option value="">選択なし</option>
          ${courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select></div>
      <div id="w-course-exercises" style="margin-top:8px"></div>
    </div>

    <div class="card" id="w-ex-card">
      <div class="field"><label>部位</label>
        <div class="seg" id="w-ex-part-seg" style="margin-top:8px"></div></div>
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input"></select></div>
      <div id="w-pr" class="muted"></div>
      <div id="w-cues"></div>
    </div>
```

- [ ] **Step 3: コース種目タップでの切り替えロジックを追加**

`js/views/workout.js` の次の行：
```js
  el.querySelector('#w-ex').addEventListener('change', () => { refreshPR(); refreshVolumeBar(); });
```
の直後に追加：
```js

  function renderCourseExercises() {
    const box = el.querySelector('#w-course-exercises');
    const courseId = el.querySelector('#w-course').value;
    const course = courses.find((c) => c.id === courseId);
    if (!course) { box.innerHTML = ''; return; }
    const items = course.exerciseIds
      .map((id) => exercises.find((e) => e.id === id))
      .filter(Boolean);
    box.innerHTML = items
      .map((e) => `<button type="button" class="btn" data-course-ex="${e.id}" style="margin:0 6px 6px 0">${escapeHtml(e.name)}</button>`).join('');
    box.querySelectorAll('[data-course-ex]').forEach((b) =>
      b.addEventListener('click', () => {
        const exId = b.dataset.courseEx;
        const ex = exercises.find((e) => e.id === exId);
        if (!ex) return;
        currentExPart = categoryKey(ex);
        renderExPartSeg();
        renderExSelect();
        el.querySelector('#w-ex').value = exId;
        refreshPR();
        refreshVolumeBar();
      }));
  }
  el.querySelector('#w-course').addEventListener('change', renderCourseExercises);
```

- [ ] **Step 4: 構文チェック**

Run: `cd /Users/taichi/gachi-fit && node --check js/views/workout.js && echo OK`
Expected: `OK`

- [ ] **Step 5: 全テスト実行（回帰確認）**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 6: ブラウザで動作確認**

preview で、その他タブ→メニュー管理で3種目以上のコースを1つ作成した状態で記録タブを開き：
- 「本日のトレーニング」の直後に「コース」カードが表示される
- コースを選択→そのコースの種目がボタンとして一覧表示される
- 種目ボタンをタップ→上部の部位セグメント・種目セレクトがその種目に切り替わり、PR表示・ボリュームバーが更新される
- そのままセットを保存できること（既存の記録フローに回帰がないこと）
- コースに含まれる種目を削除した状態でそのコースを選択→削除済み種目のボタンが表示されないこと
- コンソールにエラーが出ていないこと

- [ ] **Step 7: コミット**

```bash
git add js/views/workout.js
git commit -m "feat: select a course in workout tab and jump to its exercises"
```

---

## Task 5: PWAキャッシュ更新

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: sw.jsのキャッシュ版と資産を更新**

`sw.js` の `const CACHE = 'gachi-fit-v19';` を次に置き換え：
```js
const CACHE = 'gachi-fit-v20';
```
`sw.js` の ASSETS 配列内、`'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js', 'js/lib/groupSets.js', 'js/lib/suggest.js',` を次に置き換え（`js/lib/courses.js` を追加）：
```js
  'js/lib/obsidian.js', 'js/lib/sound.js', 'js/lib/exercisePresets.js', 'js/lib/groupSets.js', 'js/lib/suggest.js', 'js/lib/courses.js',
```

- [ ] **Step 2: 全テスト実行**

Run: `cd /Users/taichi/gachi-fit && npm test`
Expected: 全PASS

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: PWA cache v20 for course foundation feature"
```

---

## Self-Review チェック結果
- **スペック網羅**：データモデル（Task1）・自動セットロジック（Task2）・コース作成管理UI（Task3）・記録タブでの利用（Task4）・PWA更新（Task5）すべてタスク化。削除済み種目のスキップ表示（Task4 Step3の`.filter(Boolean)`）もカバー済み。
- **プレースホルダ無し**：全コード実体記載。
- **型整合**：`courses`レコード`{id,name,exerciseIds}`がTask3・Task4で一貫。`mostUsedExerciseIds(sets,count)`のシグネチャがTask2・Task3で一致。`COURSE_MIN_EX/COURSE_MAX_EX/COURSE_DEFAULT_EX`はTask3内でのみ使用、workout.js側の`SS_MIN_EX`等とは独立した別定数で衝突なし。
