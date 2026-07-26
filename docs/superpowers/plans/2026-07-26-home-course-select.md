# ホーム画面コース選択・AI提案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム画面から登録済みコースを選んで記録タブへ進めるようにし、AIが登録種目から今日のコースを提案できるようにする。

**Architecture:** 純粋関数（マッチング・プロンプト生成・パース）を`js/lib/courses.js`と`js/lib/gemini.js`に追加し、`js/views/workout.js`のコース種目表示ロジックを共通関数に切り出して`opts.initialExerciseIds`/`opts.initialCourseId`から呼べるようにする。`js/views/home.js`はこれらを組み合わせてUIを構築する。

**Tech Stack:** Vanilla JS（ESモジュール、ビルドなし）、IndexedDB（`js/db.js`）、Gemini API（`js/lib/gemini.js`の既存`callGemini`）、Node標準`node:test`によるユニットテスト。

## Global Constraints

- 新規ストア追加なし（`courses`ストアは既存、コース保存時のスキーマも既存通り`{id, name, exerciseIds}`）
- AI提案結果の自動コース選択・自動保存は行わない（ユーザーの明示操作でのみ記録/保存に進む）
- コース名未入力・種目0件マッチ時はエラー表示のみで保存/記録に進めない
- Gemini APIキーは既存の`localStorage.getItem('gemini_api_key')`を使う（新しい保存先を作らない）
- PWA cache version は最終タスクで1つ上げる（現在`gachi-fit-v21`）

---

### Task 1: `matchExerciseNamesToIds` の追加

**Files:**
- Modify: `js/lib/courses.js`
- Test: `test/courses.test.js`

**Interfaces:**
- Consumes: なし（純粋関数、`exercises`は`[{id, name, ...}]`形式の既存データ構造）
- Produces: `matchExerciseNamesToIds(names: string[], exercises: {id, name}[]): string[]` — Task 4（home.js）がAI応答の種目名配列をID配列に変換するために使う

- [ ] **Step 1: Write the failing tests**

`test/courses.test.js`の末尾に追記:

```js
import { matchExerciseNamesToIds } from '../js/lib/courses.js';

test('matchExerciseNamesToIds converts matching names to ids in order', () => {
  const exercises = [
    { id: 'e1', name: 'ベンチプレス' },
    { id: 'e2', name: 'スクワット' },
    { id: 'e3', name: 'デッドリフト' },
  ];
  assert.deepEqual(
    matchExerciseNamesToIds(['スクワット', 'ベンチプレス'], exercises),
    ['e2', 'e1']
  );
});

test('matchExerciseNamesToIds skips unmatched names', () => {
  const exercises = [{ id: 'e1', name: 'ベンチプレス' }];
  assert.deepEqual(
    matchExerciseNamesToIds(['ベンチプレス', '存在しない種目'], exercises),
    ['e1']
  );
});

test('matchExerciseNamesToIds dedupes repeated names', () => {
  const exercises = [{ id: 'e1', name: 'ベンチプレス' }];
  assert.deepEqual(
    matchExerciseNamesToIds(['ベンチプレス', 'ベンチプレス'], exercises),
    ['e1']
  );
});

test('matchExerciseNamesToIds returns empty array for empty input', () => {
  const exercises = [{ id: 'e1', name: 'ベンチプレス' }];
  assert.deepEqual(matchExerciseNamesToIds([], exercises), []);
});
```

(既存の`import`は`../js/lib/courses.js`から`mostUsedExerciseIds`を読み込んでいるので、同じ行に`matchExerciseNamesToIds`を追加してよい: `import { mostUsedExerciseIds, matchExerciseNamesToIds } from '../js/lib/courses.js';`)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -A2 "matchExerciseNamesToIds"`
Expected: FAIL（`matchExerciseNamesToIds is not a function` 等）

- [ ] **Step 3: Implement**

`js/lib/courses.js`の末尾に追記:

```js
// AIが返した種目名配列を、登録済み種目の完全一致でID配列に変換する（順序維持・重複除去・未一致はスキップ）
export function matchExerciseNamesToIds(names, exercises) {
  const byName = new Map(exercises.map((e) => [e.name, e.id]));
  const seen = new Set();
  const out = [];
  for (const name of names) {
    const id = byName.get(name);
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -10`
Expected: 全件PASS（既存78件＋新規4件＝82件）

- [ ] **Step 5: Commit**

```bash
git add js/lib/courses.js test/courses.test.js
git commit -m "feat: add matchExerciseNamesToIds for AI course suggestion"
```

---

### Task 2: Gemini コース提案プロンプト生成・パース関数の追加

**Files:**
- Modify: `js/lib/gemini.js`
- Test: `test/gemini.test.js`

**Interfaces:**
- Consumes: なし（純粋関数）
- Produces:
  - `buildCourseSuggestionPrompt({ exercises, gaps }): string` — `exercises: {name, bodyPart}[]`、`gaps: {category, days}[]`（`days`は`number|null`、`null`は未実施）。Task 4（home.js）が呼ぶ。
  - `parseCourseSuggestion(text: string): string[]` — Gemini応答テキストから種目名配列を返す（失敗時`[]`）。Task 4が呼ぶ。

- [ ] **Step 1: Write the failing tests**

`test/gemini.test.js`の`import`行を次のように変更:

```js
import { buildInsightPrompt, buildCourseSuggestionPrompt, parseCourseSuggestion, callGemini } from '../js/lib/gemini.js';
```

末尾に追記:

```js
test('buildCourseSuggestionPrompt includes exercise names and gap info', () => {
  const stats = {
    exercises: [{ name: 'ベンチプレス', bodyPart: '胸' }, { name: 'スクワット', bodyPart: '脚' }],
    gaps: [{ category: '胸', days: 5 }, { category: '脚', days: null }],
  };
  const p = buildCourseSuggestionPrompt(stats);
  assert.match(p, /ベンチプレス/);
  assert.match(p, /スクワット/);
  assert.match(p, /胸/);
  assert.match(p, /5/);
  assert.match(p, /JSON/);
});

test('parseCourseSuggestion parses plain JSON', () => {
  const text = '{"exercises": ["ベンチプレス", "スクワット"]}';
  assert.deepEqual(parseCourseSuggestion(text), ['ベンチプレス', 'スクワット']);
});

test('parseCourseSuggestion parses JSON wrapped in code fences', () => {
  const text = '```json\n{"exercises": ["デッドリフト"]}\n```';
  assert.deepEqual(parseCourseSuggestion(text), ['デッドリフト']);
});

test('parseCourseSuggestion returns empty array for invalid text', () => {
  assert.deepEqual(parseCourseSuggestion('すみません、提案できません'), []);
});

test('parseCourseSuggestion returns empty array when exercises field is not an array', () => {
  assert.deepEqual(parseCourseSuggestion('{"exercises": "ベンチプレス"}'), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -B2 -A2 "buildCourseSuggestionPrompt\|parseCourseSuggestion"`
Expected: FAIL（未定義エラー）

- [ ] **Step 3: Implement**

`js/lib/gemini.js`の`buildInsightPrompt`の下に追記（`callGemini`の前）:

```js
// 登録種目と部位別の未トレーニング日数から、今日のコース提案プロンプトを生成（純粋関数）
export function buildCourseSuggestionPrompt(stats) {
  const exerciseList = (stats.exercises || [])
    .map((e) => `- ${e.name}（${e.bodyPart || '部位未設定'}）`).join('\n');
  const gapList = (stats.gaps || [])
    .map((g) => `- ${g.category}: ${g.days == null ? '未実施' : `${g.days}日前に実施`}`).join('\n');
  return [
    'あなたは中・上級トレーニーを指導するパーソナルトレーナーです。',
    '以下の登録種目一覧の中から3〜6種目を選び、部位のバランスと各部位の直近の実施状況を考慮して、今日行うのに適したトレーニングコースを組んでください。',
    '登録種目一覧に存在する種目名のみを、他の説明文やコードフェンスを含めずに以下のJSON形式のみで出力してください。',
    '{"exercises": ["種目名1", "種目名2", ...]}',
    '',
    '【登録種目一覧】', exerciseList || '（なし）',
    '【部位別の直近実施状況】', gapList || '（記録なし）',
  ].join('\n');
}

// Gemini応答テキストから提案種目名の配列を抽出する（純粋関数、失敗時は空配列）
export function parseCourseSuggestion(text) {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleaned);
    return Array.isArray(data.exercises) ? data.exercises : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -10`
Expected: 全件PASS（82件＋新規5件＝87件）

- [ ] **Step 5: Commit**

```bash
git add js/lib/gemini.js test/gemini.test.js
git commit -m "feat: add Gemini prompt builder and parser for AI course suggestion"
```

---

### Task 3: `workout.js` の `opts.initialCourseId` / `opts.initialExerciseIds` 対応

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: 既存の`renderWorkout(el, navigate, opts = {})`、既存の`categoryKey`、`renderExPartSeg`、`renderExSelect`、`refreshPR`、`refreshVolumeBar`（すべて同ファイル内で既に定義済み）
- Produces: `renderWorkout`が`opts.initialCourseId`（string）と`opts.initialExerciseIds`（string[]）を受け取れるようになる。Task 5（home.js）がこれらを`navigate('workout', {...})`経由で渡す。

- [ ] **Step 1: `renderCourseExercises`を`showExerciseButtons`に切り出す**

`js/views/workout.js`の現在の`renderCourseExercises`（404〜426行目付近）を次のように置き換える:

```js
  function showExerciseButtons(ids) {
    const box = el.querySelector('#w-course-exercises');
    const items = ids.map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
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

  function renderCourseExercises() {
    const courseId = el.querySelector('#w-course').value;
    const course = courses.find((c) => c.id === courseId);
    if (!course) { el.querySelector('#w-course-exercises').innerHTML = ''; return; }
    showExerciseButtons(course.exerciseIds);
  }
  el.querySelector('#w-course').addEventListener('change', renderCourseExercises);
```

（`el.querySelector('#w-course').addEventListener('change', renderCourseExercises);`の行は既存のまま変更不要 — 既にこの直後にある場合は重複させない）

- [ ] **Step 2: 初期表示時に`opts.initialCourseId`/`opts.initialExerciseIds`を適用**

`renderWorkout`関数の末尾（現在の`renderExPartSeg(); renderExSelect(); applyMode('normal'); refreshPR(); await renderToday(el, exercises);`の直後、関数の閉じ`}`の直前）に追記:

```js
  if (opts.initialCourseId && courses.some((c) => c.id === opts.initialCourseId)) {
    el.querySelector('#w-course').value = opts.initialCourseId;
    renderCourseExercises();
  } else if (Array.isArray(opts.initialExerciseIds) && opts.initialExerciseIds.length) {
    const validIds = opts.initialExerciseIds.filter((id) => exercises.some((e) => e.id === id));
    if (validIds.length) showExerciseButtons(validIds);
  }
```

- [ ] **Step 3: テスト実行（既存テストの回帰確認）**

Run: `npm test 2>&1 | tail -10`
Expected: 87件全件PASS（`workout.js`はビュー層でユニットテスト対象外のため件数は変わらない）

- [ ] **Step 4: ブラウザで手動確認**

`python3 -m http.server 8765`をリポジトリルートで起動し、Browserツールで`http://localhost:8765`を開く。メニュー管理で種目を1件登録→コースを1件作成（種目を含める）→記録タブに直接`javascript_tool`で以下を実行して動作確認する:

```js
import('./js/app.js').then(() => {});
// 実際には app.js の navigate 経由で確認する必要があるため、代わりに以下の手順を使う:
```

実際の確認手順（javascript_toolではなくUI操作で行う）:
1. 記録タブを開き、「コース」セレクトで作成したコースを選択→種目ボタンが表示されることを確認（既存動作の回帰確認）
2. ブラウザのURLバーではなく、開発者コンソールで `window.location.hash` 等は使わず、次のTaskでhome.js側の導線ができてから統合確認する（このタスク単体では上記1のみで十分）

- [ ] **Step 5: Commit**

```bash
git add js/views/workout.js
git commit -m "feat: support initialCourseId/initialExerciseIds opts in workout view"
```

---

### Task 4: ホーム画面のコース選択＋AI提案カード

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes:
  - `matchExerciseNamesToIds(names, exercises)`（Task 1、`js/lib/courses.js`）
  - `buildCourseSuggestionPrompt({exercises, gaps})` / `parseCourseSuggestion(text)` / 既存`callGemini(prompt, key, {})`（Task 2、`js/lib/gemini.js`）
  - 既存`lastTrainedDateByCategory(sets, exById, wkById)`（`js/lib/suggest.js`、変更なし・gaps算出に再利用）
  - 既存`categoriesWithExercises(exercises, bodyParts)`（`js/lib/volume.js`）
  - `navigate('workout', { initialCourseId })` / `navigate('workout', { initialExerciseIds })`（Task 3で対応済み）
- Produces: なし（末端のビュー）

- [ ] **Step 1: import文の更新**

`js/views/home.js`の先頭付近、既存の

```js
import { lastTrainedDateByCategory, suggestBodyParts } from '../lib/suggest.js';
```

を次に置き換える（`suggestBodyParts`は使わなくなるため削除、`lastTrainedDateByCategory`は継続使用）:

```js
import { lastTrainedDateByCategory } from '../lib/suggest.js';
import { matchExerciseNamesToIds } from '../lib/courses.js';
import { buildCourseSuggestionPrompt, parseCourseSuggestion, callGemini } from '../lib/gemini.js';
```

- [ ] **Step 2: `renderHome`内でコース一覧を取得しカードHTMLを差し替える**

`js/views/home.js`の`renderHome`関数内、既存の

```js
  const suggestCategories = categoriesWithExercises(exercises, BODY_PARTS);
  const lastTrained = lastTrainedDateByCategory(sets, exById, wkById);
  const suggested = suggestBodyParts(suggestCategories, lastTrained, new Date());
  const suggestCard = suggested.length
    ? `<div class="card">
        <strong>お帰りなさい。今日はどんなトレーニングをしますか？</strong>
        <div class="row" style="margin-top:10px">
          ${suggested.map((cat) => `<button type="button" class="btn btn-primary" data-suggest-part="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('')}
        </div>
      </div>`
    : '';
```

を次に置き換える:

```js
  const courses = await getAll('courses');
  const suggestCategories = categoriesWithExercises(exercises, BODY_PARTS);
  const lastTrained = lastTrainedDateByCategory(sets, exById, wkById);

  const courseButtons = courses.length
    ? `<div class="row" style="margin-top:10px">
        ${courses.map((c) => `<button type="button" class="btn btn-primary" data-select-course="${c.id}">${escapeHtml(c.name)}</button>`).join('')}
      </div>`
    : '<p class="muted" style="margin-top:10px">メニュー管理でコースを登録すると、ここから選べます。</p>';

  const suggestCard = exercises.length
    ? `<div class="card">
        <strong>お帰りなさい。今日はどんなトレーニングをしますか？</strong>
        ${courseButtons}
        <button type="button" id="ai-course-btn" class="btn btn-block" style="margin-top:10px">AIが今日のコースを提案</button>
        <div id="ai-course-out" style="margin-top:10px"></div>
      </div>`
    : '';
```

- [ ] **Step 3: コースボタンとAI提案ボタンのイベントハンドラを追加**

`js/views/home.js`の既存の

```js
  el.querySelectorAll('[data-suggest-part]').forEach((b) =>
    b.addEventListener('click', () => navigate('workout', { initialPart: b.dataset.suggestPart })));
```

を次に置き換える:

```js
  el.querySelectorAll('[data-select-course]').forEach((b) =>
    b.addEventListener('click', () => navigate('workout', { initialCourseId: b.dataset.selectCourse })));

  const aiCourseBtn = el.querySelector('#ai-course-btn');
  if (aiCourseBtn) {
    aiCourseBtn.addEventListener('click', async () => {
      const out = el.querySelector('#ai-course-out');
      const key = localStorage.getItem('gemini_api_key') || '';
      if (!key) { out.innerHTML = '<p class="muted">設定でGemini APIキーを登録してください。</p>'; return; }
      out.innerHTML = '<p class="muted">提案中…</p>';
      try {
        const gaps = suggestCategories
          .filter((c) => c !== 'その他')
          .map((cat) => ({ cat, date: lastTrained[cat] }))
          .map(({ cat, date }) => ({ category: cat, days: date ? -daysUntil(date) : null }));
        const prompt = buildCourseSuggestionPrompt({
          exercises: exercises.map((e) => ({ name: e.name, bodyPart: e.bodyPart })),
          gaps,
        });
        const text = await callGemini(prompt, key, {});
        const names = parseCourseSuggestion(text);
        const matchedIds = matchExerciseNamesToIds(names, exercises);
        if (!matchedIds.length) {
          out.innerHTML = '<p class="muted">AIの提案を解析できませんでした。もう一度お試しください。</p>';
          return;
        }
        const now = new Date();
        const defaultName = `AIおすすめ ${now.getMonth() + 1}/${now.getDate()}`;
        out.innerHTML = `
          <div class="muted">${matchedIds.map((id) => escapeHtml(nameOf(id))).join('、')}</div>
          <div class="field" style="margin-top:8px"><label>コース名</label>
            <input id="ai-course-name" class="input" value="${escapeHtml(defaultName)}" /></div>
          <div class="row" style="margin-top:8px">
            <button type="button" id="ai-course-go" class="btn btn-primary">この内容で記録する</button>
            <button type="button" id="ai-course-save" class="btn">この内容でコース保存</button>
          </div>
          <div id="ai-course-save-msg" class="muted" style="margin-top:6px"></div>`;
        out.querySelector('#ai-course-go').addEventListener('click', () =>
          navigate('workout', { initialExerciseIds: matchedIds }));
        out.querySelector('#ai-course-save').addEventListener('click', async () => {
          const name = out.querySelector('#ai-course-name').value.trim();
          const msg = out.querySelector('#ai-course-save-msg');
          if (!name) { msg.textContent = 'コース名を入力してください'; return; }
          await put('courses', { id: uid(), name, exerciseIds: matchedIds });
          msg.textContent = '保存しました';
        });
      } catch (e) {
        out.innerHTML = `<p class="muted">エラー: ${escapeHtml(e.message)}</p>`;
      }
    });
  }
```

- [ ] **Step 4: 依存関数の追加import**

`js/views/home.js`の先頭に既存の`import { daysUntil } from '../lib/countdown.js';`があることを確認する（Step 3で`daysUntil`をそのまま使用するため）。

`js/db.js`からのimportに`uid`が含まれているか確認し、なければ追加する。現在の1行目:

```js
import { getAll, get, put, remove } from '../db.js';
```

を次に置き換える:

```js
import { getAll, get, put, remove, uid } from '../db.js';
```

- [ ] **Step 5: テスト実行（回帰確認）**

Run: `npm test 2>&1 | tail -10`
Expected: 87件全件PASS（`home.js`はビュー層のためユニットテスト対象外、件数不変）

- [ ] **Step 6: ブラウザで手動確認**

`python3 -m http.server 8765`をリポジトリルートで起動し、Browserツールで確認:
1. メニュー管理で種目を2〜3件登録
2. メニュー管理でコースを1件作成
3. ホームを開き、コースボタンが表示されることを確認→タップ→記録タブでそのコースが選択済み・種目ボタンが表示されることを確認
4. 設定でGemini APIキーが未設定の状態でホームの「AIが今日のコースを提案」をタップ→「設定でGemini APIキーを登録してください。」が表示されることを確認
5. （可能であれば）設定でAPIキーを登録し、「AIが今日のコースを提案」をタップ→提案結果（種目名・コース名入力・2ボタン）が表示されることを確認→「この内容で記録する」→記録タブで種目ボタンが表示されタップで種目が選択できることを確認→ホームに戻り再度AI提案→「この内容でコース保存」→メニュー管理のコース一覧に追加されていることを確認

- [ ] **Step 7: Commit**

```bash
git add js/views/home.js
git commit -m "feat: add course selection and AI course suggestion to home screen"
```

---

### Task 5: PWA cache version bump

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし
- Produces: なし（最終タスク）

- [ ] **Step 1: cache version を上げる**

`sw.js`の1行目:

```js
const CACHE = 'gachi-fit-v21';
```

を次に置き換える:

```js
const CACHE = 'gachi-fit-v22';
```

- [ ] **Step 2: `ASSETS`配列の確認**

`sw.js`の`ASSETS`配列に`js/lib/gemini.js`、`js/lib/courses.js`、`js/lib/suggest.js`、`js/lib/volume.js`、`js/views/home.js`、`js/views/workout.js`、`js/views/exercises.js`が含まれていることを確認する（すべて既存ファイルへの変更のみで新規ファイルはないため、通常は変更不要。含まれていなければ追加する）。

- [ ] **Step 3: テスト実行**

Run: `npm test 2>&1 | tail -10`
Expected: 87件全件PASS

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: PWA cache v22 for home course selection + AI suggestion"
```

## Self-Review Notes

- **Spec coverage**: spec の①ホームコースカード→Task4、②プロンプト・パース→Task2、③種目名→ID照合→Task1、④workout.js拡張→Task3、⑤エラーハンドリング→Task4 Step3内、⑥テスト→Task1/2の各Stepでカバー。
- **Placeholder scan**: なし。
- **Type consistency**: `matchExerciseNamesToIds(names, exercises): string[]`、`buildCourseSuggestionPrompt({exercises, gaps}): string`、`parseCourseSuggestion(text): string[]`、`showExerciseButtons(ids: string[])`—Task間で名称・シグネチャ一致を確認済み。
