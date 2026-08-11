# アプリ全体の整理・UI刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 9個に分散した遷移先を4タブに統合し、記録タブを「種目ヘッダー固定＋セット入力＋下部タイマー固定」の1画面に再構成し、633行の `workout.js` と221行の `exercises.js` を責務ごとに分割する。

**Architecture:** データモデルは一切変更しない。共通ユーティリティを `js/lib/` に切り出してビュー間の依存を切り、分析・管理タブはセグメント切替のハブビューとして既存 render 関数を使い回す。記録タブは3モジュール（種目パネル／セット入力／インターバルバー）に分割し、`workout.js` はオーケストレーションに専念する。

**Tech Stack:** Vanilla JS（ESモジュール、ビルドなし）、IndexedDB（`js/db.js`）、Service Worker、Node標準 `node:test`。

## Global Constraints

- IndexedDBのストア・レコード形状・`DB_VERSION` は変更しない（データ移行を発生させない）
- 既存の記録挙動を維持する：通常モードの重量自動追従（`weightTouched`）、ドロップセットの保存後重量引き継ぎ、ビープ（残り1〜10秒は880Hz/150ms、0秒は1200Hz/400ms）、`patchTodayWorkout` の直列化キュー
- 新機能は追加しない。機能の削除は「振り返りタブ」「その他タブ」「`suggestBodyParts`」「`opts.initialPart`」のみ
- スマホ幅375pxで横スクロールを発生させない
- 純粋関数の追加はないため新規ユニットテストは追加しない。既存テストは `suggestBodyParts` の4件削除以外そのまま通ること
- 新規JSファイルは必ず `sw.js` の `ASSETS` 配列に追加する（PWAキャッシュ漏れ防止）

---

### Task 1: 共通ユーティリティの切り出し

**Files:**
- Create: `js/lib/html.js`
- Create: `js/lib/constants.js`
- Modify: `js/views/exercises.js`, `js/views/home.js`, `js/views/workout.js`, `js/views/history.js`, `js/views/review.js`, `js/views/body.js`, `js/views/set-editor.js`

**Interfaces:**
- Produces: `escapeHtml(s): string`（`js/lib/html.js`）、`BODY_PARTS: string[]` / `COURSE_MIN_EX: number` / `COURSE_MAX_EX: number`（`js/lib/constants.js`）。以降の全タスクがこの2ファイルから import する。

- [ ] **Step 1: `js/lib/html.js` を作成**

```js
// HTMLに埋め込む文字列をエスケープする
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 2: `js/lib/constants.js` を作成**

```js
// 主要部位。種目登録の選択肢と、部位別の並び順の基準に使う
export const BODY_PARTS = ['背中', '胸', '肩', '脚', '腕', 'その他'];

// 1コースに含められる種目数
export const COURSE_MIN_EX = 3;
export const COURSE_MAX_EX = 6;
```

- [ ] **Step 3: `js/views/exercises.js` から定義を削除し import に置換**

`js/views/exercises.js` の先頭にある以下3行（5〜7行目付近）を削除する:

```js
export const BODY_PARTS = ['背中', '胸', '肩', '脚', '腕', 'その他'];
export const COURSE_MIN_EX = 3;
export const COURSE_MAX_EX = 6;
```

ファイル末尾にある `escapeHtml` の定義（`export function escapeHtml(s) {` から閉じ括弧まで）も削除する。

先頭の import 群に次の2行を追加する:

```js
import { escapeHtml } from '../lib/html.js';
import { BODY_PARTS, COURSE_MIN_EX, COURSE_MAX_EX } from '../lib/constants.js';
```

- [ ] **Step 4: 残り6ファイルの import を差し替え**

以下のファイルで `from './exercises.js'` から `escapeHtml` / `BODY_PARTS` / `COURSE_MAX_EX` を import している行を、新しい2ファイルからの import に書き換える。

`js/views/home.js` の現在の行:
```js
import { escapeHtml, BODY_PARTS, COURSE_MAX_EX } from './exercises.js';
```
を次に置換:
```js
import { escapeHtml } from '../lib/html.js';
import { BODY_PARTS, COURSE_MAX_EX } from '../lib/constants.js';
```

`js/views/workout.js` の現在の行:
```js
import { escapeHtml, BODY_PARTS } from './exercises.js';
```
を次に置換:
```js
import { escapeHtml } from '../lib/html.js';
import { BODY_PARTS } from '../lib/constants.js';
```

`js/views/history.js`、`js/views/review.js`、`js/views/body.js`、`js/views/set-editor.js` はいずれも `import { escapeHtml } from './exercises.js';` の形なので、次に置換:
```js
import { escapeHtml } from '../lib/html.js';
```

- [ ] **Step 5: `sw.js` の ASSETS に新ファイルを追加**

`sw.js` の `js/lib/...` が並ぶ行の末尾に `'js/lib/html.js', 'js/lib/constants.js',` を追加する。

- [ ] **Step 6: テストとブラウザで確認**

Run: `npm test`
Expected: 87件すべてPASS（このタスクではテストの増減なし）

ブラウザ確認（`python3 -m http.server 8801` を起動し `preview_start` で `{"url":"http://localhost:8801"}`）：全5タブを開き、コンソールに import エラーが出ないこと。`read_console_messages` で確認する。

- [ ] **Step 7: Commit**

```bash
git add js/lib/html.js js/lib/constants.js js/views/exercises.js js/views/home.js js/views/workout.js js/views/history.js js/views/review.js js/views/body.js js/views/set-editor.js sw.js
git commit -m "refactor: extract escapeHtml and constants out of the exercises view"
```

---

### Task 2: CSS ユーティリティと新コンポーネントクラス

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Produces: 以降のタスクが使うクラス — `.mt-1` `.mt-2` `.mt-3` `.btn-sm` `.ex-header` `.ex-header-main` `.ex-header-name` `.ex-header-stats` `.ex-picker` `.subseg` `.fold` `.interval-bar` `.interval-time` `.interval-btn` `body.has-interval-bar`

- [ ] **Step 1: `css/style.css` の末尾に追記**

```css
/* --- 余白ユーティリティ --- */
.mt-1 { margin-top: 6px; }
.mt-2 { margin-top: 10px; }
.mt-3 { margin-top: 14px; }
.btn-sm { min-height: 40px; padding: 0 12px; }

/* --- サブタブ（分析・管理） --- */
.subseg { display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.subseg button { flex: 1 0 auto; min-height: 44px; padding: 0 14px; border-radius: 12px;
  border: 1px solid #2c2c2c; background: var(--surface-2); color: var(--text);
  font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.subseg button.sel { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }

/* --- 折りたたみカード --- */
.fold > summary { list-style: none; display: flex; justify-content: space-between;
  align-items: center; min-height: 32px; cursor: pointer; }
.fold > summary::-webkit-details-marker { display: none; }
.fold > summary::after { content: '▸'; color: var(--muted); font-size: 14px; }
.fold[open] > summary::after { content: '▾'; }

/* --- 記録タブ：上部固定の種目ヘッダー --- */
.ex-header { position: sticky; top: 0; z-index: 20; background: #141400;
  border: 1px solid var(--accent); border-radius: 14px; padding: 12px; margin-bottom: 12px; }
.ex-header-main { display: flex; justify-content: space-between; align-items: center;
  min-height: 32px; cursor: pointer; gap: 10px; }
.ex-header-name { font-weight: 800; font-size: 17px; }
.ex-header-stats { display: flex; justify-content: space-between; font-size: 13px; margin-top: 4px; gap: 10px; }
.ex-picker { border-top: 1px solid #333; margin-top: 10px; padding-top: 10px; }

/* --- 記録タブ：下部固定インターバルバー --- */
.interval-bar { position: fixed; left: 12px; right: 12px;
  bottom: calc(68px + env(safe-area-inset-bottom)); z-index: 30;
  background: #0d0d0d; border: 1px solid #333; border-radius: 14px;
  padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
.interval-time { font-size: 22px; font-weight: 800; color: var(--accent);
  font-variant-numeric: tabular-nums; min-width: 62px; }
.interval-btn { flex: 1; min-height: 44px; font-size: 14px; padding: 0 10px; }
body.has-interval-bar { padding-bottom: 148px; }
```

- [ ] **Step 2: ブラウザで既存画面が壊れていないことを確認**

`python3 -m http.server 8802` を起動し `preview_start` で開く。全タブを表示し、追加は純粋に加算的なので既存の見た目が変わっていないことを確認する。`resize_window` で `{"preset":"mobile"}` にし、`document.body.scrollWidth <= window.innerWidth` を `javascript_tool` で確認する。

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: add layout utilities and classes for the new tab and record UI"
```

---

### Task 3: 分析タブ（履歴 / インサイト / ボディ の統合）

**Files:**
- Create: `js/views/analysis.js`
- Modify: `js/views/history.js`, `js/views/insights.js`, `js/views/body.js`, `sw.js`

**Interfaces:**
- Consumes: `escapeHtml`（`js/lib/html.js`、Task 1）、`.subseg` クラス（Task 2）
- Produces: `renderAnalysis(el, navigate, opts = {}): Promise<void>`。`opts.section` に `'history'|'insights'|'body'` を渡すと初期表示セクションを指定できる。Task 5 の `app.js` が `routes.analysis` として登録する。

- [ ] **Step 1: サブビューから自前のビュータイトルを削除**

`js/views/history.js` の中にある2箇所の `<h2 class="view-title">履歴 / PR</h2>` を削除する（データなし時の早期returnブロックと通常描画の両方にある）。テンプレートリテラルの構造は保つこと。例えば通常描画側の

```js
  el.innerHTML = `<h2 class="view-title">履歴 / PR</h2>` +
    Object.entries(byEx).map(([id, list]) => {
```

は次のようにする:

```js
  el.innerHTML =
    Object.entries(byEx).map(([id, list]) => {
```

早期return側の

```js
    el.innerHTML = `<h2 class="view-title">履歴 / PR</h2>
      <div class="card"><p class="muted">まだ記録がありません。</p></div>`;
```

は次のようにする:

```js
    el.innerHTML = `<div class="card"><p class="muted">まだ記録がありません。</p></div>`;
```

`js/views/insights.js` でも同様に、2箇所の `<h2 class="view-title">インサイト</h2>` を削除する。

`js/views/body.js` でも同様に `<h2 class="view-title">ボディ</h2>` を削除する。

- [ ] **Step 2: `js/views/analysis.js` を作成**

```js
import { renderHistory } from './history.js';
import { renderInsights } from './insights.js';
import { renderBody } from './body.js';

const SECTIONS = [
  { key: 'history', label: '履歴 / PR', render: renderHistory },
  { key: 'insights', label: 'インサイト', render: renderInsights },
  { key: 'body', label: 'ボディ', render: renderBody },
];

export async function renderAnalysis(el, navigate, opts = {}) {
  const initial = SECTIONS.some((s) => s.key === opts.section) ? opts.section : SECTIONS[0].key;
  el.innerHTML = `
    <h2 class="view-title">分析</h2>
    <div class="subseg" id="an-seg">
      ${SECTIONS.map((s) => `<button data-k="${s.key}" class="${s.key === initial ? 'sel' : ''}">${s.label}</button>`).join('')}
    </div>
    <div id="an-body"></div>`;

  const body = el.querySelector('#an-body');
  const show = async (key) => {
    const sec = SECTIONS.find((s) => s.key === key);
    await sec.render(body, navigate);
  };
  el.querySelectorAll('#an-seg button').forEach((b) =>
    b.addEventListener('click', async () => {
      el.querySelectorAll('#an-seg button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      await show(b.dataset.k);
    }));
  await show(initial);
}
```

- [ ] **Step 3: `sw.js` の ASSETS に `js/views/analysis.js` を追加**

`js/views/...` が並ぶ行に `'js/views/analysis.js',` を追加する。

- [ ] **Step 4: テスト**

Run: `npm test`
Expected: 87件すべてPASS

- [ ] **Step 5: Commit**

```bash
git add js/views/analysis.js js/views/history.js js/views/insights.js js/views/body.js sw.js
git commit -m "feat: add analysis tab combining history, insights and body"
```

（この時点ではまだ `app.js` に登録していないため画面からは到達できない。Task 5 で結線する。）

---

### Task 4: 管理タブと `exercises.js` の分割

**Files:**
- Create: `js/views/manage.js`, `js/views/courses.js`, `js/views/places.js`
- Modify: `js/views/exercises.js`, `js/views/settings.js`, `sw.js`

**Interfaces:**
- Consumes: `escapeHtml`（`js/lib/html.js`）、`BODY_PARTS` / `COURSE_MIN_EX` / `COURSE_MAX_EX`（`js/lib/constants.js`）、`mostUsedExerciseIds`（`js/lib/courses.js`）、`.subseg` クラス
- Produces: `renderManage(el, navigate, opts = {}): Promise<void>`（`opts.section` に `'exercises'|'courses'|'places'|'settings'`）、`renderCourses(el): Promise<void>`、`renderPlaces(el): Promise<void>`。`renderExercises(el)` は種目セクション専用に縮小される。

- [ ] **Step 1: `js/views/places.js` を作成**

現在の `js/views/exercises.js` にある「場所の登録」カードと `renderPlaces` 関数のロジックをそのまま移す。

```js
import { getAll, put, remove, uid } from '../db.js';
import { escapeHtml } from '../lib/html.js';

export async function renderPlaces(el) {
  el.innerHTML = `
    <div class="card">
      <strong>場所の登録</strong>
      <div class="row mt-2">
        <input id="pl-name" class="input" placeholder="例: 〇〇ジム 渋谷店" />
        <button id="pl-add" class="btn btn-primary" style="flex:0 0 auto">追加</button>
      </div>
      <div id="pl-list"></div>
    </div>`;

  async function renderList() {
    const places = await getAll('places');
    el.querySelector('#pl-list').innerHTML = places.map((p) => `
      <div class="list-item">
        <span>${escapeHtml(p.name)}</span>
        <span>
          <button class="btn btn-edit btn-sm" data-pl-edit="${p.id}">編集</button>
          <button class="btn btn-danger btn-sm" data-pl-del="${p.id}">削除</button>
        </span>
      </div>`).join('') || '<p class="muted">場所がありません。</p>';
    el.querySelectorAll('[data-pl-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('places', b.dataset.plDel); renderList(); }));
    el.querySelectorAll('[data-pl-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        const p = (await getAll('places')).find((x) => x.id === b.dataset.plEdit);
        const name = prompt('場所名を編集', p.name);
        if (name && name.trim()) { p.name = name.trim(); await put('places', p); renderList(); }
      }));
  }

  el.querySelector('#pl-add').addEventListener('click', async () => {
    const name = el.querySelector('#pl-name').value.trim();
    if (!name) return;
    await put('places', { id: uid(), name });
    el.querySelector('#pl-name').value = '';
    renderList();
  });
  renderList();
}
```

- [ ] **Step 2: `js/views/courses.js` を作成**

現在の `js/views/exercises.js` にある「コース」カード、`courseSlots` の状態、`renderCourseSlots`、`renderCourseList`、および自動セット・保存の各ハンドラをそのまま移す。自動セット時に現存する種目のセットのみに絞り込む既存の防御ロジックを必ず維持すること。

```js
import { getAll, put, remove, uid } from '../db.js';
import { escapeHtml } from '../lib/html.js';
import { COURSE_MIN_EX, COURSE_MAX_EX } from '../lib/constants.js';
import { mostUsedExerciseIds } from '../lib/courses.js';

const COURSE_DEFAULT_EX = 4;

export async function renderCourses(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');

  el.innerHTML = `
    <div class="card">
      <strong>コース</strong>
      <div class="field mt-2"><label>コース名</label>
        <input id="course-name" class="input" placeholder="例: 胸・肩コース" /></div>
      <div id="course-slots" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="course-slot-add" class="btn">＋ 種目を追加</button>
        <button type="button" id="course-slot-remove" class="btn">− 種目を削除</button>
      </div>
      <button type="button" id="course-autofill" class="btn btn-block mt-2">よく使う種目で自動セット</button>
      <div id="course-error" class="error"></div>
      <button id="course-save" class="btn btn-primary btn-block mt-2">コースを保存</button>
      <div id="course-list" class="mt-3"></div>
    </div>`;

  if (!exercises.length) {
    el.querySelector('#course-slots').innerHTML = '<p class="muted">先に種目を登録してください。</p>';
    el.querySelector('#course-save').disabled = true;
    el.querySelector('#course-autofill').disabled = true;
    return;
  }

  let courseSlots = Array.from({ length: COURSE_DEFAULT_EX }, () => exercises[0].id);

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
    if (courseSlots.length < COURSE_MAX_EX) courseSlots.push(exercises[0].id);
    renderCourseSlots();
  });
  el.querySelector('#course-slot-remove').addEventListener('click', () => {
    if (courseSlots.length > COURSE_MIN_EX) courseSlots.pop();
    renderCourseSlots();
  });

  el.querySelector('#course-autofill').addEventListener('click', () => {
    const validExerciseIds = new Set(exercises.map((e) => e.id));
    const usableSets = sets.filter((s) => validExerciseIds.has(s.exerciseId));
    const topIds = mostUsedExerciseIds(usableSets, courseSlots.length);
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
    renderCourses(el);
  });

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
          <button class="btn btn-danger btn-sm" data-course-del="${c.id}">削除</button>
        </div>
      </div>`).join('') || '<p class="muted">まだコースがありません。</p>';
    el.querySelectorAll('[data-course-del]').forEach((b) =>
      b.addEventListener('click', async () => { await remove('courses', b.dataset.courseDel); renderCourseList(); }));
  }

  renderCourseSlots();
  renderCourseList();
}
```

- [ ] **Step 3: `js/views/exercises.js` を種目セクション専用に縮小**

`renderExercises` から「場所の登録」カードと「コース」カードのHTMLおよび対応する全ロジック（`courseSlots`、`renderCourseSlots`、`renderCourseList`、`renderPlaces`、およびそれらのイベント登録）を削除する。冒頭の `<h2 class="view-title">メニュー管理</h2>` も削除する（管理タブ側でタイトルを出すため）。`mostUsedExerciseIds` の import も不要になるので削除する。

残すのは：プリセット検索、種目名、主要部位、詳細、意識ポイント、セットパターン、`#ex-save` ハンドラ、`renderList`（種目一覧）。`renderList` 内の削除ボタンは `btn-sm` を使うよう `class="btn btn-danger"` を `class="btn btn-danger btn-sm"` に変更する。

縮小後の `renderExercises` の `el.innerHTML` は次の形になる:

```js
  el.innerHTML = `
    <div class="card">
      <div class="field"><label>プリセット検索</label>
        <input id="ex-search" class="input" placeholder="例: ベンチ / 胸" /></div>
      <div id="ex-search-results" style="margin-bottom:8px"></div>
      <div class="field"><label>種目名</label>
        <input id="ex-name" class="input" placeholder="例: ベンチプレス" /></div>
      <div class="field"><label>主要部位</label>
        <select id="ex-cat" class="input">
          ${BODY_PARTS.map((p) => `<option value="${p}">${p}</option>`).join('')}
        </select></div>
      <div class="field"><label>詳細（任意）</label>
        <input id="ex-detail" class="input" placeholder="例: 上部" /></div>
      <div class="field"><label>意識ポイント（カンマ区切り）</label>
        <input id="ex-cues" class="input" placeholder="例: 肩甲骨下制, 腹圧" /></div>
      <div class="field"><label>セットパターン</label>
        <div class="seg" id="ex-pattern">
          ${patterns.map((p, i) => `<button data-p="${p}" class="${i === 0 ? 'sel' : ''}">${p}</button>`).join('')}
        </div></div>
      <div id="ex-error" class="error"></div>
      <button id="ex-save" class="btn btn-primary btn-block">種目を追加</button>
    </div>
    <div id="ex-list"></div>`;
```

`const sets = await getAll('sets');` はコース用だったので削除する。

- [ ] **Step 4: `js/views/settings.js` からビュータイトルを削除**

`js/views/settings.js` の `<h2 class="view-title">設定</h2>` の行を削除する（テンプレートリテラルの構造は保つ）。

- [ ] **Step 5: `js/views/manage.js` を作成**

```js
import { renderExercises } from './exercises.js';
import { renderCourses } from './courses.js';
import { renderPlaces } from './places.js';
import { renderSettings } from './settings.js';

const SECTIONS = [
  { key: 'exercises', label: '種目', render: renderExercises },
  { key: 'courses', label: 'コース', render: renderCourses },
  { key: 'places', label: '場所', render: renderPlaces },
  { key: 'settings', label: '設定', render: renderSettings },
];

export async function renderManage(el, navigate, opts = {}) {
  const initial = SECTIONS.some((s) => s.key === opts.section) ? opts.section : SECTIONS[0].key;
  el.innerHTML = `
    <h2 class="view-title">管理</h2>
    <div class="subseg" id="mg-seg">
      ${SECTIONS.map((s) => `<button data-k="${s.key}" class="${s.key === initial ? 'sel' : ''}">${s.label}</button>`).join('')}
    </div>
    <div id="mg-body"></div>`;

  const body = el.querySelector('#mg-body');
  const show = async (key) => {
    const sec = SECTIONS.find((s) => s.key === key);
    await sec.render(body, navigate);
  };
  el.querySelectorAll('#mg-seg button').forEach((b) =>
    b.addEventListener('click', async () => {
      el.querySelectorAll('#mg-seg button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      await show(b.dataset.k);
    }));
  await show(initial);
}
```

- [ ] **Step 6: `sw.js` の ASSETS に追加**

`'js/views/manage.js', 'js/views/courses.js', 'js/views/places.js',` を `js/views/...` の行に追加する。

- [ ] **Step 7: テスト**

Run: `npm test`
Expected: 87件すべてPASS

- [ ] **Step 8: Commit**

```bash
git add js/views/manage.js js/views/courses.js js/views/places.js js/views/exercises.js js/views/settings.js sw.js
git commit -m "feat: add manage tab and split the exercises view by responsibility"
```

---

### Task 5: ナビゲーションを4タブに切り替え

**Files:**
- Modify: `index.html`, `js/app.js`, `js/views/home.js`, `js/views/workout.js`, `sw.js`
- Delete: `js/views/more.js`, `js/views/review.js`

**Interfaces:**
- Consumes: `renderAnalysis(el, navigate, opts)`（Task 3）、`renderManage(el, navigate, opts)`（Task 4）
- Produces: 4タブのルーティング。`navigate(route, opts)` の呼び出し規約は変更しない。

- [ ] **Step 1: `index.html` のタブを4つにする**

現在の `<nav class="tabbar">` ブロックを次に置換する:

```html
  <nav class="tabbar">
    <button data-route="home" class="tab active">ホーム</button>
    <button data-route="workout" class="tab">記録</button>
    <button data-route="analysis" class="tab">分析</button>
    <button data-route="manage" class="tab">管理</button>
  </nav>
```

- [ ] **Step 2: `js/app.js` を書き換え**

```js
import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderAnalysis } from './views/analysis.js';
import { renderManage } from './views/manage.js';
import { getAll, put, uid } from './db.js';
import { ensureDefaultSetPatterns } from './lib/seed.js';

const TAB_ROUTES = ['home', 'workout', 'analysis', 'manage'];

const routes = {
  home: renderHome,
  workout: renderWorkout,
  analysis: renderAnalysis,
  manage: renderManage,
};

async function navigate(route, opts) {
  const el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route && TAB_ROUTES.includes(route)));
  document.body.classList.toggle('has-interval-bar', route === 'workout');
  const render = routes[route] || renderHome;
  await render(el, navigate, opts);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

ensureDefaultSetPatterns(() => getAll('setPatterns'), (v) => put('setPatterns', v), uid)
  .finally(() => navigate('home'));
```

- [ ] **Step 3: 旧タブのファイルを削除**

```bash
git rm js/views/more.js js/views/review.js
```

- [ ] **Step 4: 案内文言を新タブ名に更新**

`js/views/workout.js` の種目未登録時の案内:
```js
      <div class="card"><p class="muted">先に「メニュー」で種目を登録してください。</p></div>`;
```
を次に置換:
```js
      <div class="card"><p class="muted">先に「管理」タブで種目を登録してください。</p></div>`;
```

`js/views/home.js` のコース未登録時の案内:
```js
    : '<p class="muted" style="margin-top:10px">メニュー管理でコースを登録すると、ここから選べます。</p>';
```
を次に置換:
```js
    : '<p class="muted mt-2">「管理」タブでコースを登録すると、ここから選べます。</p>';
```

- [ ] **Step 5: `sw.js` の ASSETS から削除ファイルを除く**

`'js/views/more.js'` と `'js/views/review.js'` の記載を `ASSETS` 配列から削除する。

- [ ] **Step 6: テストとブラウザで確認**

Run: `npm test`
Expected: 87件すべてPASS

ブラウザ確認（`python3 -m http.server 8805`）：
1. タブが4つ（ホーム/記録/分析/管理）表示される
2. 分析タブで履歴・インサイト・ボディの3セグメントが切り替わる
3. 管理タブで種目・コース・場所・設定の4セグメントが切り替わる
4. 管理タブ→種目で種目を1件登録できる
5. 管理タブ→コースでコースを1件作成でき、一覧に出る
6. `read_console_messages` でエラーが出ていないこと

スクリーンショットが真っ黒／空で返る場合は `get_page_text` と `javascript_tool` で確認する（この環境の既知の不安定さであり実装の問題ではない）。

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js js/views/workout.js js/views/home.js sw.js
git commit -m "feat: consolidate nine destinations into four tabs"
```

---

### Task 6: 記録タブ — 下部固定インターバルバー

**Files:**
- Create: `js/views/workout/interval-bar.js`
- Modify: `js/views/workout.js`, `css/style.css`, `sw.js`

**Interfaces:**
- Consumes: `createTimer` / `formatTime`（`js/timer.js`）、`shouldBeep` / `shouldFinalBeep` / `playBeep`（`js/lib/sound.js`）、`.interval-bar` `.interval-time` `.interval-btn` クラス（Task 2）
- Produces: `intervalBarHtml(choices, defaultSec): string`（秒数セグメントとバーのHTMLを返す）、`initIntervalBar(el, defaultSec): void`（イベント結線とタイマー生成）。Task 8 の `workout.js` 最終形もこの2つを使う。

- [ ] **Step 1: `js/views/workout/interval-bar.js` を作成**

```js
import { createTimer, formatTime } from '../../timer.js';
import { shouldBeep, shouldFinalBeep, playBeep } from '../../lib/sound.js';

let intervalTimer;

// 折りたたみ内に置く秒数セグメント
export function intervalSecsHtml(choices, defaultSec) {
  return `<div class="seg" id="w-int-secs">
    ${choices.map((s) => `<button data-s="${s}" class="${s === defaultSec ? 'sel' : ''}">${s}秒</button>`).join('')}
  </div>`;
}

// 画面下部に固定するタイマーバー
export function intervalBarHtml(defaultSec) {
  return `<div class="interval-bar">
    <span class="interval-time" id="w-timer">${formatTime(defaultSec)}</span>
    <button id="w-int-start" class="btn btn-primary interval-btn">開始</button>
    <button id="w-int-stop" class="btn interval-btn">停止</button>
  </div>`;
}

// 秒数セグメントとバーを結線する。再描画時は前のタイマーを止めてから作り直す
export function initIntervalBar(el, defaultSec) {
  if (intervalTimer) intervalTimer.stop();
  const state = { interval: defaultSec };
  const timerEl = el.querySelector('#w-timer');

  el.querySelectorAll('#w-int-secs button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('#w-int-secs button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      state.interval = Number(b.dataset.s);
      timerEl.textContent = formatTime(state.interval);
    }));

  intervalTimer = createTimer({
    onTick: (s) => {
      timerEl.textContent = formatTime(s);
      if (shouldFinalBeep(s)) playBeep({ frequency: 1200, durationMs: 400 });
      else if (shouldBeep(s)) playBeep();
    },
    onDone: () => { timerEl.textContent = formatTime(state.interval); },
  });

  el.querySelector('#w-int-start').addEventListener('click', () => intervalTimer.start(state.interval));
  el.querySelector('#w-int-stop').addEventListener('click', () => {
    intervalTimer.stop();
    timerEl.textContent = formatTime(state.interval);
  });
}
```

- [ ] **Step 2: `js/views/workout.js` の旧インターバルカードを差し替え**

先頭の import に次を追加する:

```js
import { intervalSecsHtml, intervalBarHtml, initIntervalBar } from './workout/interval-bar.js';
```

`el.innerHTML` テンプレート内の「インターバル」カード全体（`<div class="card">` から `<strong>インターバル</strong>` を含み対応する `</div>` まで）を削除し、代わりに「場所・時間」を扱うカード（現状の「本日のトレーニング」カード）の `#w-dur` の直後に次を追加する:

```js
      <div class="field mt-2"><label>インターバル秒数</label>
        ${intervalSecsHtml(intervalChoices, defaultSec)}</div>
```

テンプレートの末尾（`<div class="card"><strong>本日のセット</strong><div id="w-today"></div></div>` の直後）に次を追加する:

```js
    ${intervalBarHtml(defaultSec)}
```

- [ ] **Step 3: 旧タイマー結線コードを削除して新関数を呼ぶ**

`js/views/workout.js` の以下のブロックを丸ごと削除する:

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
  el.querySelector('#w-int-start').addEventListener('click', () => {
    el.querySelector('#w-timer').style.display = 'block';
    intervalTimer.start(state.interval);
  });
  el.querySelector('#w-int-stop').addEventListener('click', () => {
    intervalTimer.stop();
    el.querySelector('#w-timer').style.display = 'none';
  });
```

代わりに同じ位置に次の1行を置く:

```js
  initIntervalBar(el, defaultSec);
```

不要になった import を削除する: `createTimer`, `formatTime`（`js/timer.js` から）、`shouldBeep`, `shouldFinalBeep`, `playBeep`（`js/lib/sound.js` から）。モジュールレベルの `let intervalTimer;` の宣言も削除する。`const state = { interval: defaultSec };` が他で使われていなければ削除する（`state` の他の用途がないことを確認してから消すこと）。

`bindSeg` 関数がこの削除で未使用になる場合は、`bindSeg` の定義も削除する。

- [ ] **Step 4: `css/style.css` から未使用になった `.timer-big` を削除**

```css
.timer-big { font-size: 64px; font-weight: 800; text-align: center; color: var(--accent);
  font-variant-numeric: tabular-nums; }
```
の2行を削除する。

- [ ] **Step 5: `sw.js` の ASSETS に `js/views/workout/interval-bar.js` を追加**

- [ ] **Step 6: テストとブラウザで確認**

Run: `npm test`
Expected: 87件すべてPASS

ブラウザ確認（`python3 -m http.server 8806`、`resize_window` で `{"preset":"mobile"}`）：
1. 記録タブの最下部にタイマーバーが固定表示され、タブバーに重ならない
2. 「開始」でカウントダウンが始まり、「停止」で初期秒数に戻る
3. 「本日のトレーニング」カード内の秒数セグメントを押すとバーの表示秒数が変わる
4. 他タブに移動するとバーが消える（`document.querySelector('.interval-bar')` が `null`）
5. `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 7: Commit**

```bash
git add js/views/workout/interval-bar.js js/views/workout.js css/style.css sw.js
git commit -m "refactor: move interval timer into a fixed bottom bar module"
```

---

### Task 7: 記録タブ — 上部固定の種目ヘッダー

**Files:**
- Create: `js/views/workout/exercise-panel.js`
- Modify: `js/views/workout.js`, `sw.js`

**Interfaces:**
- Consumes: `escapeHtml`（`js/lib/html.js`）、`BODY_PARTS`（`js/lib/constants.js`）、`categoryKey` / `categoriesWithExercises` / `categoryVolumeForDate` / `maxCategoryVolumeExcludingDate` / `VOLUME_START_DATE`（`js/lib/volume.js`）、`.ex-header` 系クラス（Task 2）
- Produces: `exerciseHeaderHtml(courses): string`、`createExercisePanel(el, { exercises, courses, prs, onExerciseChange }): { refresh(): Promise<void>, selectExercise(id): void, currentExerciseId(): string }`。Task 8 の `workout.js` がこのオブジェクト経由で現在の種目IDを取得する。

- [ ] **Step 1: `js/views/workout/exercise-panel.js` を作成**

```js
import { getAll } from '../../db.js';
import { escapeHtml } from '../../lib/html.js';
import { BODY_PARTS } from '../../lib/constants.js';
import { localDateStr } from '../../lib/localdate.js';
import { categoryKey, categoriesWithExercises, categoryVolumeForDate,
  maxCategoryVolumeExcludingDate, VOLUME_START_DATE } from '../../lib/volume.js';

export function exerciseHeaderHtml(courses) {
  return `<div class="ex-header" id="w-ex-header">
    <div class="ex-header-main" id="w-ex-toggle">
      <div><span class="ex-header-name" id="w-ex-name">—</span>
        <span class="muted" id="w-ex-part"></span></div>
      <span class="muted" id="w-ex-caret">▾</span>
    </div>
    <div class="ex-header-stats">
      <span class="muted" id="w-pr">PR: —</span>
      <span class="muted" id="w-vol-text"></span>
    </div>
    <div class="volbar"><div class="volbar-fill" id="w-vol-fill" style="width:0%"></div></div>
    <div class="ex-picker" id="w-ex-picker" hidden>
      <div class="field"><label>今日のコース</label>
        <select id="w-course" class="input">
          <option value="">選択なし</option>
          ${courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select></div>
      <div id="w-course-exercises" class="mt-1"></div>
      <div class="field mt-2"><label>部位</label>
        <div class="seg" id="w-ex-part-seg"></div></div>
      <div class="field"><label>種目</label>
        <select id="w-ex" class="input"></select></div>
      <div id="w-cues"></div>
    </div>
  </div>`;
}

export function createExercisePanel(el, { exercises, courses, prs, onExerciseChange }) {
  const partGroups = {};
  for (const e of exercises) (partGroups[categoryKey(e)] ||= []).push(e);
  const parts = categoriesWithExercises(exercises, BODY_PARTS);
  let currentPart = parts[0];

  const picker = el.querySelector('#w-ex-picker');
  const exSelect = el.querySelector('#w-ex');

  function renderPartSeg() {
    el.querySelector('#w-ex-part-seg').innerHTML = parts
      .map((p) => `<button data-p="${escapeHtml(p)}" class="${p === currentPart ? 'sel' : ''}">${escapeHtml(p)}</button>`).join('');
    el.querySelectorAll('#w-ex-part-seg button').forEach((b) =>
      b.addEventListener('click', () => {
        currentPart = b.dataset.p;
        renderPartSeg();
        renderExSelect();
        refresh();
      }));
  }

  function renderExSelect() {
    const list = partGroups[currentPart] || [];
    exSelect.innerHTML = list
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.bodyPart ? ' / ' + escapeHtml(e.bodyPart) : ''}</option>`).join('');
  }

  function showExerciseButtons(ids) {
    const box = el.querySelector('#w-course-exercises');
    const items = ids.map((id) => exercises.find((e) => e.id === id)).filter(Boolean);
    box.innerHTML = items
      .map((e) => `<button type="button" class="btn btn-sm" data-course-ex="${e.id}" style="margin:0 6px 6px 0">${escapeHtml(e.name)}</button>`).join('');
    box.querySelectorAll('[data-course-ex]').forEach((b) =>
      b.addEventListener('click', () => selectExercise(b.dataset.courseEx)));
  }

  function selectExercise(exId) {
    const ex = exercises.find((e) => e.id === exId);
    if (!ex) return;
    currentPart = categoryKey(ex);
    renderPartSeg();
    renderExSelect();
    exSelect.value = exId;
    refresh();
  }

  async function refresh() {
    const exId = exSelect.value;
    const ex = exercises.find((e) => e.id === exId);
    el.querySelector('#w-ex-name').textContent = ex ? ex.name : '—';
    el.querySelector('#w-ex-part').textContent = ex ? categoryKey(ex) : '';

    const pr = prs[exId];
    el.querySelector('#w-pr').innerHTML = pr
      ? `PR <span class="pr-badge">${pr.toFixed(1)}kg</span>`
      : 'PR: 記録なし';
    el.querySelector('#w-cues').innerHTML =
      (ex?.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('');

    const cat = categoryKey(ex);
    const sets = await getAll('sets');
    const workouts = await getAll('workouts');
    const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));
    const wkById = Object.fromEntries(workouts.map((w) => [w.id, w]));
    const today = localDateStr();
    const todayVol = categoryVolumeForDate(sets, exById, wkById, today)[cat] || 0;
    const pastMax = maxCategoryVolumeExcludingDate(sets, exById, wkById, today, VOLUME_START_DATE)[cat] || 0;
    const pct = pastMax > 0 ? Math.min(100, (todayVol / pastMax) * 100) : (todayVol > 0 ? 100 : 0);
    const beat = todayVol > pastMax && todayVol > 0;
    el.querySelector('#w-vol-fill').style.width = `${pct}%`;
    el.querySelector('#w-vol-text').innerHTML =
      `${escapeHtml(cat)} ${Math.round(todayVol)} / ${pastMax > 0 ? Math.round(pastMax) : '—'}${beat ? ' <span class="pr-badge">自己ベスト！</span>' : ''}`;

    if (onExerciseChange) onExerciseChange(exId);
  }

  el.querySelector('#w-ex-toggle').addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    el.querySelector('#w-ex-caret').textContent = picker.hidden ? '▾' : '▴';
  });
  exSelect.addEventListener('change', refresh);
  el.querySelector('#w-course').addEventListener('change', () => {
    const course = courses.find((c) => c.id === el.querySelector('#w-course').value);
    if (!course) { el.querySelector('#w-course-exercises').innerHTML = ''; return; }
    showExerciseButtons(course.exerciseIds);
  });

  renderPartSeg();
  renderExSelect();

  return {
    refresh,
    selectExercise,
    currentExerciseId: () => exSelect.value,
    openPicker: () => { picker.hidden = false; el.querySelector('#w-ex-caret').textContent = '▴'; },
    setCourse: (courseId) => {
      const course = courses.find((c) => c.id === courseId);
      if (!course) return;
      el.querySelector('#w-course').value = courseId;
      showExerciseButtons(course.exerciseIds);
    },
    showExerciseButtons,
  };
}
```

- [ ] **Step 2: `js/views/workout.js` で旧3カードを新ヘッダーに差し替え**

先頭の import に追加:

```js
import { exerciseHeaderHtml, createExercisePanel } from './workout/exercise-panel.js';
```

`el.innerHTML` テンプレートから次の3ブロックを削除する:
- 「コース」カード（`<strong>コース</strong>` を含むカード）
- 種目選択カード（`<div class="card" id="w-ex-card">` のブロック）
- ボリュームカード（`<div class="card" id="w-volume"></div>`）

削除した位置（`<h2 class="view-title">記録</h2>` の直後）に次を挿入する:

```js
    ${exerciseHeaderHtml(courses)}
```

- [ ] **Step 3: 旧ロジックを削除してパネルを生成**

`js/views/workout.js` から次の関数・変数の定義を削除する: `exPartGroups`、`exParts`、`currentExPart`、`renderExPartSeg`、`renderExSelect`、`refreshPR`、`refreshVolumeBar`、`showExerciseButtons`、`renderCourseExercises`、および `#w-ex` / `#w-course` の `addEventListener` 行。

`renderToday` 呼び出しの直前に次を追加する:

```js
  const exPanel = createExercisePanel(el, { exercises, courses, prs });
  await exPanel.refresh();
```

これまで `refreshPR()` / `refreshVolumeBar()` / `renderExPartSeg()` / `renderExSelect()` を呼んでいた箇所は、すべて `await exPanel.refresh()` に置き換える。保存処理内の `const exerciseId = el.querySelector('#w-ex').value;` は `const exerciseId = exPanel.currentExerciseId();` に置き換える。

`applyMode` 内の `#w-ex-card` / `#w-volume` の表示切替は、スーパーセット時にヘッダーを隠す必要があるため、次のように `#w-ex-header` を対象にする:

```js
    el.querySelector('#w-ex-header').style.display = mode === 'superset' ? 'none' : 'block';
```

（旧2行 `#w-ex-card` と `#w-volume` の切替行を、この1行に置き換える。）

`opts.initialCourseId` / `opts.initialExerciseIds` の適用ブロックを次に置き換える:

```js
  if (opts.initialCourseId && courses.some((c) => c.id === opts.initialCourseId)) {
    exPanel.setCourse(opts.initialCourseId);
    exPanel.openPicker();
  } else if (Array.isArray(opts.initialExerciseIds) && opts.initialExerciseIds.length) {
    const validIds = opts.initialExerciseIds.filter((id) => exercises.some((e) => e.id === id));
    if (validIds.length) { exPanel.showExerciseButtons(validIds); exPanel.openPicker(); }
  }
```

不要になった import（`categoryVolumeForDate`, `maxCategoryVolumeExcludingDate`, `categoryKey`, `categoriesWithExercises`, `VOLUME_START_DATE`, `BODY_PARTS`）のうち、`workout.js` 内で他に使われていないものを削除する。

- [ ] **Step 4: `sw.js` の ASSETS に `js/views/workout/exercise-panel.js` を追加**

- [ ] **Step 5: テストとブラウザで確認**

Run: `npm test`
Expected: 87件すべてPASS

ブラウザ確認（`python3 -m http.server 8807`、mobile幅、種目を3件・コースを1件登録した状態で）：
1. 記録タブ最上部に種目ヘッダーが出て、スクロールしても上部に貼り付く（`javascript_tool` で `window.scrollTo(0, 600)` 後に `document.querySelector('.ex-header').getBoundingClientRect().top` が小さい値であること）
2. ヘッダーをタップすると選択パネルが開き、もう一度タップで閉じる
3. 部位セグメントを切り替えると種目セレクトの中身が変わる
4. 種目を変えるとヘッダーの種目名・部位・PR・ボリューム表示が更新される
5. コースを選ぶと種目ボタンが出て、タップするとその種目に切り替わる
6. スーパーセットモードにするとヘッダーが消え、通常モードに戻すと出る
7. ホームのコースボタンから記録タブに来ると、そのコースが選択済みでパネルが開いている

- [ ] **Step 6: Commit**

```bash
git add js/views/workout/exercise-panel.js js/views/workout.js sw.js
git commit -m "refactor: replace three record-tab cards with a sticky exercise header"
```

---

### Task 8: 記録タブ — セット入力の抽出と折りたたみ化

**Files:**
- Create: `js/views/workout/set-entry.js`
- Modify: `js/views/workout.js`, `sw.js`

**Interfaces:**
- Consumes: `createStepper`（`js/views/components.js`）、`estimate1RM`（`js/lib/calc.js`）、`escapeHtml`（`js/lib/html.js`）、`exPanel`（Task 7）
- Produces: `setEntryHtml(exercises): string`、`createSetEntry(el, { exercises, onModeChange }): { mode(): string, setMode(m): void, rows(): object[], resetRows(keepWeights): void, ssExerciseIds(): string[], ssRounds(): object[][], resetSuperset(): void, syncFromSteppers(): void }`

- [ ] **Step 1: `js/views/workout/set-entry.js` を作成**

`js/views/workout.js` の現在のセット入力ロジックをそのまま移設する。移すのは次の定義：定数 `MIN_ROWS` / `MAX_ROWS` / `DEFAULT_ROWS` / `SS_MIN_EX` / `SS_MAX_EX` / `SS_DEFAULT_EX` / `SS_MIN_ROUNDS` / `SS_MAX_ROUNDS` / `SS_DEFAULT_ROUNDS`、関数 `defaultRowValues` / `refreshRow1RM` / `syncRowValuesFromSteppers` / `renderRows` / `defaultSSExerciseIds` / `defaultSSRounds` / `syncSSValuesFromSteppers` / `renderSSExercises` / `renderSSRounds`、および行増減・スーパーセット増減の各イベント登録と `applyMode`。

モジュールの外形は次のとおり:

```js
import { createStepper } from '../components.js';
import { estimate1RM } from '../../lib/calc.js';
import { escapeHtml } from '../../lib/html.js';

const MIN_ROWS = 1;
const MAX_ROWS = 6;
const DEFAULT_ROWS = 3;
const SS_MIN_EX = 2;
const SS_MAX_EX = 4;
const SS_DEFAULT_EX = 2;
const SS_MIN_ROUNDS = 1;
const SS_MAX_ROUNDS = 6;
const SS_DEFAULT_ROUNDS = 3;

export function setEntryHtml() {
  return `<div class="card">
    <div class="seg" id="w-mode-seg">
      <button data-m="normal" class="sel">通常</button>
      <button data-m="superset">スーパーセット</button>
      <button data-m="dropset">ドロップセット</button>
    </div>
    <div id="w-normal-block">
      <div id="w-rows" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="w-row-add" class="btn">＋ 行を追加</button>
        <button type="button" id="w-row-remove" class="btn">− 行を削除</button>
      </div>
    </div>
    <div id="w-ss-block" style="display:none">
      <div id="w-ss-exercises" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="w-ss-ex-add" class="btn">＋ 種目を追加</button>
        <button type="button" id="w-ss-ex-remove" class="btn">− 種目を削除</button>
      </div>
      <div id="w-ss-rounds" class="mt-2"></div>
      <div class="row mt-2">
        <button type="button" id="w-ss-round-add" class="btn">＋ ラウンドを追加</button>
        <button type="button" id="w-ss-round-remove" class="btn">− ラウンドを削除</button>
      </div>
    </div>
    <div class="field mt-3"><label>メモ（任意・全セット共通）</label>
      <input id="w-note" class="input" placeholder="例: 3セット目から効きが浅い" /></div>
    <div id="w-error" class="error"></div>
    <button id="w-save" class="btn btn-primary btn-block mt-2">まとめて記録</button>
  </div>`;
}

export function createSetEntry(el, { exercises, onModeChange }) {
  // ここに defaultRowValues / rowValues / rowSteppers / renderRows /
  // ss* 一式 / applyMode を移設する（既存コードをそのまま使う）
  // ...
  return {
    mode: () => mode,
    rows: () => rowValues,
    resetRows: (keepWeights) => {
      rowValues = keepWeights
        ? rowValues.map((rv) => ({ weight: rv.weight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }))
        : defaultRowValues(DEFAULT_ROWS);
      renderRows();
    },
    ssExerciseIds: () => ssExerciseIds,
    ssRounds: () => ssRounds,
    resetSuperset: () => {
      ssExerciseIds = defaultSSExerciseIds();
      ssRounds = defaultSSRounds(ssExerciseIds);
      renderSSExercises();
      renderSSRounds();
    },
    syncFromSteppers: () => {
      syncRowValuesFromSteppers();
      if (mode === 'superset') syncSSValuesFromSteppers();
    },
    applyMode,
  };
}
```

`applyMode` は種目ヘッダーの表示切替を `workout.js` 側に委ねるため、`onModeChange(newMode)` コールバックを呼ぶ形にする。`applyMode` 内の `#w-ex-header` を直接触る行は削除し、代わりに `if (onModeChange) onModeChange(mode);` を呼ぶ。`refreshVolumeBar()` の呼び出しも削除する（`workout.js` 側が `onModeChange` で `exPanel.refresh()` を呼ぶ）。

- [ ] **Step 2: `js/views/workout.js` を最終形に整理**

import に追加:

```js
import { setEntryHtml, createSetEntry } from './workout/set-entry.js';
```

`el.innerHTML` を次の構成にする（`exerciseHeaderHtml` と `intervalBarHtml` は既存のもの）:

```js
  el.innerHTML = `
    <h2 class="view-title">記録</h2>
    ${exerciseHeaderHtml(courses)}
    ${setEntryHtml()}

    <details class="card fold">
      <summary><strong>本日のセット</strong></summary>
      <div id="w-today" class="mt-2"></div>
    </details>

    <details class="card fold">
      <summary><strong>本日の感想</strong></summary>
      <textarea id="w-impression" class="input mt-2" rows="3" style="resize:vertical">${todayWorkout ? escapeHtml(todayWorkout.note || '') : ''}</textarea>
      <button id="w-impression-save" class="btn btn-block mt-2">感想を保存</button>
    </details>

    <details class="card fold">
      <summary><strong>場所・時間</strong></summary>
      <div class="field mt-2"><label>場所</label>
        <select id="w-place" class="input">
          <option value="">未選択</option>
          ${places.map((p) => `<option value="${p.id}" ${todayWorkout && todayWorkout.placeId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select></div>
      <div class="row">
        <div class="field"><label>開始</label>
          <input id="w-start" type="time" class="input" value="${todayWorkout && todayWorkout.startTime ? todayWorkout.startTime : ''}" /></div>
        <div class="field"><label>終了</label>
          <input id="w-end" type="time" class="input" value="${todayWorkout && todayWorkout.endTime ? todayWorkout.endTime : ''}" /></div>
      </div>
      <div id="w-dur" class="muted">${todayWorkout && todayWorkout.durationSec ? '所要: ' + formatMinutes(todayWorkout.durationSec) : '所要: —'}</div>
      <div class="field mt-2"><label>インターバル秒数</label>
        ${intervalSecsHtml(intervalChoices, defaultSec)}</div>
    </details>

    ${intervalBarHtml(defaultSec)}`;
```

パネル生成部を次のようにする:

```js
  const exPanel = createExercisePanel(el, { exercises, courses, prs });
  const setEntry = createSetEntry(el, {
    exercises,
    onModeChange: (m) => {
      el.querySelector('#w-ex-header').style.display = m === 'superset' ? 'none' : 'block';
      if (m !== 'superset') exPanel.refresh();
    },
  });
  initIntervalBar(el, defaultSec);
  await exPanel.refresh();
  setEntry.applyMode('normal');
```

保存ハンドラは `setEntry` のAPI経由に書き換える。スーパーセット分岐は `setEntry.syncFromSteppers()` → `flattenRounds(setEntry.ssExerciseIds(), setEntry.ssRounds())` → 保存 → `setEntry.resetSuperset()`。通常/ドロップ分岐は `setEntry.syncFromSteppers()` → `setEntry.rows()` を検証 → 保存 → `setEntry.resetRows(mode === 'dropset')` → `await exPanel.refresh()`。保存後は毎回 `await renderToday(el, exercises)` を呼ぶ。

**ドロップセットの重量引き継ぎと通常モードの重量自動追従は必ず維持すること。**

- [ ] **Step 3: `sw.js` の ASSETS に `js/views/workout/set-entry.js` を追加**

- [ ] **Step 4: テストとブラウザで確認**

Run: `npm test`
Expected: 87件すべてPASS

ブラウザ確認（`python3 -m http.server 8808`、mobile幅、種目3件登録済み）：
1. 記録タブの縦の高さが従来（3026px）から大きく縮む。`document.body.scrollHeight` を記録して報告する
2. 通常モードでセット1の重量を変えると、未編集のセット2・3の重量が追従する
3. 通常モードで保存すると全行が0にリセットされる
4. ドロップセットモードで重量100/90/80・回数を入れて保存すると、重量が残り回数だけ0になる
5. スーパーセットモードで種目スロットとラウンド表が出て保存できる
6. 保存後に「本日のセット」折りたたみを開くと保存分が並んでいる
7. 「本日の感想」「場所・時間」の折りたたみが開閉し、感想の保存と場所・時刻の保存が効く
8. `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 5: Commit**

```bash
git add js/views/workout/set-entry.js js/views/workout.js sw.js
git commit -m "refactor: extract set entry module and collapse secondary record cards"
```

---

### Task 9: デッドコードの削除

**Files:**
- Modify: `js/lib/suggest.js`, `test/suggest.test.js`, `js/views/workout.js`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: `js/lib/suggest.js` から `suggestBodyParts` を削除**

`export function suggestBodyParts(...)` の定義全体を削除する。`lastTrainedDateByCategory` は残す。未使用になる `import { daysUntil } from './countdown.js';` も削除する（`daysUntil` が `suggestBodyParts` でのみ使われていたことを確認してから消すこと）。

- [ ] **Step 2: `test/suggest.test.js` から該当テストを削除**

`suggestBodyParts` を参照する4つの `test(...)` ブロック（`prioritizes the longest gap since last trained`、`prioritizes never-trained categories first`、`excludes その他`、`keeps input order on ties`）を削除する。import 行から `suggestBodyParts` を外し、`lastTrainedDateByCategory` の2テストは残す。

- [ ] **Step 3: `js/views/workout.js` から `opts.initialPart` 分岐を削除**

`opts.initialPart` を参照している箇所が残っていれば削除する（Task 7 で `currentExPart` ごと消えている想定だが、`renderWorkout` のシグネチャ `opts` の扱いに残骸がないか確認する）。`opts.initialCourseId` と `opts.initialExerciseIds` は残す。

- [ ] **Step 4: テスト**

Run: `npm test`
Expected: 83件すべてPASS（87件から `suggestBodyParts` の4件が減る）

- [ ] **Step 5: Commit**

```bash
git add js/lib/suggest.js test/suggest.test.js js/views/workout.js
git commit -m "chore: remove dead suggestBodyParts and initialPart code paths"
```

---

### Task 10: PWAキャッシュの更新と全体動作確認

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: `sw.js` の ASSETS を実ファイルと突き合わせる**

次のコマンドで実在ファイルと `ASSETS` の差分を確認する:

```bash
comm -3 <(find js -name '*.js' | sort) <(grep -o "js/[a-z/-]*\.js" sw.js | sort -u)
```

出力が空になるよう `ASSETS` を修正する。特に `js/views/workout/interval-bar.js`、`js/views/workout/exercise-panel.js`、`js/views/workout/set-entry.js`、`js/views/analysis.js`、`js/views/manage.js`、`js/views/courses.js`、`js/views/places.js`、`js/lib/html.js`、`js/lib/constants.js` が含まれ、削除した `js/views/more.js`、`js/views/review.js` が含まれないこと。

- [ ] **Step 2: cache version を上げる**

`sw.js` の1行目 `const CACHE = 'gachi-fit-v22';` を `const CACHE = 'gachi-fit-v23';` に変更する。

- [ ] **Step 3: 全体動作確認**

Run: `npm test`
Expected: 83件すべてPASS

ブラウザ確認（`python3 -m http.server 8810`、mobile幅）で全タブを一巡する：
1. ホーム：カレンダー表示、日タップで詳細、コースボタン、AI提案ボタン（APIキー未設定時のメッセージ）
2. 記録：種目ヘッダー、セット保存、インターバルバー
3. 分析：履歴・インサイト・ボディの切替
4. 管理：種目・コース・場所・設定の切替と、種目登録・コース作成
5. `read_console_messages` でエラーゼロ
6. 各タブで `document.body.scrollWidth <= window.innerWidth`

- [ ] **Step 4: Commit**

```bash
git add sw.js
git commit -m "chore: PWA cache v23 for the restructured app"
```

## Self-Review Notes

- **Spec coverage**：①ナビ4タブ→Task 3/4/5、②記録タブ案A→Task 6/7/8、③ファイル分割→Task 1/4/6/7/8、④CSS整理→Task 2（＋各タスクでの `mt-*` / `btn-sm` 適用）、⑤到達経路の変化→Task 5の文言更新、デッドコード削除→Task 9、`sw.js` 追従→各タスク＋Task 10で最終突合。
- **Placeholder scan**：Task 8 Step 1 の `createSetEntry` 本体は「既存コードをそのまま移設」と指示しており、移設元は `js/views/workout.js` の現行コードとして実在する。新規に書き起こす必要はないため、実装者が参照すべき具体物がある。
- **Type consistency**：`exPanel.refresh()` / `exPanel.currentExerciseId()` / `exPanel.setCourse()` / `exPanel.openPicker()` / `exPanel.showExerciseButtons()`（Task 7 で定義、Task 8 で使用）、`setEntry.applyMode()` / `.rows()` / `.resetRows(keepWeights)` / `.syncFromSteppers()` / `.ssExerciseIds()` / `.ssRounds()` / `.resetSuperset()`（Task 8 内で定義・使用）、`intervalSecsHtml` / `intervalBarHtml` / `initIntervalBar`（Task 6 で定義、Task 8 で再利用）— いずれも名称一致を確認済み。
