# 自宅トレーニングの土台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 環境（自宅／ジム）の切替、体重込みの自重種目記録、自宅の器具で組んだ種目・コースのプリセットを加え、ジムをやめても記録・コース・AI提案が使えるようにする。

**Architecture:** 種目に `homeOk` / `bodyweight` の2フィールドを足し、`localStorage.training_env` で環境を持つ。絞り込みは純粋関数（`js/lib/env.js`）に集め、選択・提案の画面だけに適用する（履歴・集計は全種目）。自重種目は `createSetEntry` の `baseWeight` で重量欄に体重を入れる。DBスキーマは変えない。

**Tech Stack:** Vanilla JS（ES modules・ビルドなし）、IndexedDB、Service Worker、`node --test`

**Spec:** `docs/superpowers/specs/2026-10-06-home-training-foundation-design.md`

## Global Constraints

- ビルドなし・ES modules。純粋関数は `node:test` で単体テストし、`npm test`（= `node --test`）が全件PASSすること
- IndexedDB のストア構成・`DB_VERSION`（4）は変えない
- `homeOk` が欠落した種目は `true`、`bodyweight` が欠落した種目は `false` として扱う
- 環境は `localStorage.training_env`（`'home'` / `'gym'`）。**初期値と読み取り失敗時は `'gym'`**。読み書きは try/catch で囲む
- **絞り込むのは選択・提案だけ**。履歴・分析・PR・部位別ボリューム・カレンダー日別詳細・「本日のセット」の種目名には全種目を使う
- ヘッダーの環境切替ボタンは高さ 40px 以上、375px 幅で折り返さない
- 新規JSファイルは `sw.js` の `ASSETS` に必ず追加する。最終タスクでキャッシュ名を `gachi-fit-v27` にする
- UI文言は計画書の文字列をそのまま使う（日本語）
- コミットメッセージの末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける
- 既存の挙動（通常モードの重量自動追従、ドロップセットの重量引き継ぎ、音声入力のガード）を壊さない

## 作業環境

コントローラーが `git worktree add .worktrees/home-foundation -b home-foundation` で作業ツリーを作る。実装者は `/Users/taichi/gachi-fit/.worktrees/home-foundation` で作業する。

**ブラウザ確認の共通手順**（UIタスクで使う）:

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation && python3 -m http.server 8123
```

`preview_start` に `{"url":"http://localhost:8123"}` を渡して開く（`name` 指定は起動設定がないため失敗する）。このブラウザペインは Service Worker を登録できないが、環境上の制約であり不具合ではない。スクリーンショットは空白になることがあるので、`get_page_text` / `read_page` / `javascript_tool` で確認する。

DBの初期化（毎回この状態から検証する）:

```js
for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name);
localStorage.clear();
location.reload();
```

DBへの直接投入（検証用）:

```js
const db = await import('/js/db.js');
await db.put('exercises', { id: 'x1', name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸', cuePresets: [], setPattern: '通常', homeOk: false, bodyweight: false });
```

## ファイル構成

| ファイル | 責務 |
|---|---|
| `js/lib/env.js`（新規） | 環境の読み書きと、種目・コース・プリセットの絞り込み |
| `js/lib/exerciseMeta.js`（新規） | 起動時に既存種目へ `homeOk` / `bodyweight` を写す |
| `js/lib/bodyweight.js`（新規） | 直近の体重を返す |
| `js/lib/exercisePresets.js` | 種目プリセット（50件）と各フラグ |
| `js/lib/coursePresets.js` | コースプリセット（13件）と、プリセット登録・一括登録 |
| `js/lib/voiceParse.js` | 「プラス」指定（`added`）の解析 |
| `js/views/workout.js` | 記録タブの絞り込み、体重の自動入力、`added` の適用 |
| `js/views/workout/set-entry.js` | `baseWeight` と `setBaseWeight` / `setHint` |
| `js/views/home.js` | コース・AI提案の絞り込み、一括追加ボタン |
| `js/views/courses.js` / `js/views/exercises.js` | 管理画面の絞り込み、種目のフラグ編集 |
| `js/app.js` / `index.html` / `css/style.css` | ヘッダーの環境切替、起動時の印付け |

## タスク依存

Task 1 → (Task 2, Task 3, Task 4 は互いに独立) → Task 5 → Task 6 → Task 7 / Task 8 → Task 9 → Task 10

---

### Task 1: 種目・コースのプリセットデータ

**Files:**
- Modify: `js/lib/exercisePresets.js`（配列全体）
- Modify: `js/lib/coursePresets.js`（`DEFAULT_COURSE_PRESETS` のみ。関数部分は触らない）
- Test: `test/exercisePresets.test.js`、`test/coursePresets.test.js`

**Interfaces:**
- Produces: `DEFAULT_EXERCISE_PRESETS` の各要素 `{ name, bodyPart, category, homeOk: boolean, bodyweight?: true }`（全50件）。`DEFAULT_COURSE_PRESETS` の各要素 `{ name, env: 'gym'|'home', exercises: string[] }`（gym 6件・home 7件）

- [ ] **Step 1: 失敗するテストを書く**

`test/exercisePresets.test.js` の末尾に追記:

```js
const GYM_ONLY = [
  'ベンチプレス', 'インクラインベンチプレス', 'スクワット', 'デッドリフト',
  'ルーマニアンデッドリフト', 'バーベルカール', 'レッグプレス', 'レッグエクステンション',
  'レッグカール', 'ラットプルダウン', 'シーテッドロウ', 'Tバーロウ', 'ケーブルプッシュダウン',
];
const BODYWEIGHT = [
  '懸垂', 'チンアップ', 'ディップス', 'プッシュアップ', '足上げプッシュアップ',
  'ぶら下がりレッグレイズ', 'クランチ', 'プランク',
];

test('every exercise preset has a boolean homeOk', () => {
  for (const p of DEFAULT_EXERCISE_PRESETS) {
    assert.equal(typeof p.homeOk, 'boolean', `${p.name} の homeOk が boolean ではない`);
  }
});

test('exercise preset names are unique', () => {
  const names = DEFAULT_EXERCISE_PRESETS.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
});

test('there are 50 exercise presets in total', () => {
  assert.equal(DEFAULT_EXERCISE_PRESETS.length, 50);
});

test('exactly the 13 gym-only exercises are homeOk:false', () => {
  const names = DEFAULT_EXERCISE_PRESETS.filter((p) => !p.homeOk).map((p) => p.name).sort();
  assert.deepEqual(names, [...GYM_ONLY].sort());
});

test('bodyweight is only ever true and implies homeOk', () => {
  for (const p of DEFAULT_EXERCISE_PRESETS) {
    if (p.bodyweight === undefined) continue;
    assert.equal(p.bodyweight, true, `${p.name} の bodyweight は true か未定義のみ`);
    assert.equal(p.homeOk, true, `${p.name} は自重種目なので homeOk が必要`);
  }
});

test('the bodyweight exercises are exactly the expected eight', () => {
  const names = DEFAULT_EXERCISE_PRESETS.filter((p) => p.bodyweight).map((p) => p.name).sort();
  assert.deepEqual(names, [...BODYWEIGHT].sort());
});
```

`test/coursePresets.test.js` の末尾に追記:

```js
test('every course preset declares env gym or home', () => {
  for (const c of DEFAULT_COURSE_PRESETS) {
    assert.ok(c.env === 'gym' || c.env === 'home', `${c.name} の env が不正`);
  }
});

test('there are 6 gym and 7 home course presets', () => {
  assert.equal(DEFAULT_COURSE_PRESETS.filter((c) => c.env === 'gym').length, 6);
  assert.equal(DEFAULT_COURSE_PRESETS.filter((c) => c.env === 'home').length, 7);
});

test('home course presets are prefixed with 自宅 and use only home-ok exercises', () => {
  const byName = new Map(DEFAULT_EXERCISE_PRESETS.map((p) => [p.name, p]));
  for (const c of DEFAULT_COURSE_PRESETS.filter((x) => x.env === 'home')) {
    assert.ok(c.name.startsWith('自宅 '), `${c.name} は「自宅 」で始める`);
    for (const name of c.exercises) {
      assert.equal(byName.get(name).homeOk, true, `${c.name} の「${name}」は自宅でできない種目`);
    }
  }
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --test test/exercisePresets.test.js test/coursePresets.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)|not ok" | head -20`
Expected: `fail` が 1 件以上（`homeOk` / `env` が未定義のため）

- [ ] **Step 3: `js/lib/exercisePresets.js` を実装する**

ファイル全体を次の内容に置き換える（`searchPresets` は変更なし）:

```js
// homeOk: 自宅の器具（可変ダンベル最大30kg・EZバー・可変ベンチ・懸垂＋ディップスのマシン）でできるか
// bodyweight: 自重種目。重量欄に体重を入れて記録する（true のものだけ持つ）
export const DEFAULT_EXERCISE_PRESETS = [
  { name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸', homeOk: false },
  { name: 'インクラインベンチプレス', bodyPart: '胸/上部', category: '胸', homeOk: false },
  { name: 'ダンベルフライ', bodyPart: '胸/内側', category: '胸', homeOk: true },
  { name: 'ディップス', bodyPart: '胸/下部', category: '胸', homeOk: true, bodyweight: true },
  { name: 'プッシュアップ', bodyPart: '胸/全体', category: '胸', homeOk: true, bodyweight: true },
  { name: 'スクワット', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: false },
  { name: 'レッグプレス', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: false },
  { name: 'レッグエクステンション', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: false },
  { name: 'レッグカール', bodyPart: '脚/ハムストリング', category: '脚', homeOk: false },
  { name: 'ルーマニアンデッドリフト', bodyPart: '脚/ハムストリング', category: '脚', homeOk: false },
  { name: 'カーフレイズ', bodyPart: '脚/カーフ', category: '脚', homeOk: true },
  { name: 'ブルガリアンスクワット', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'デッドリフト', bodyPart: '背中/下部', category: '背中', homeOk: false },
  { name: 'ラットプルダウン', bodyPart: '背中/広背筋', category: '背中', homeOk: false },
  { name: '懸垂', bodyPart: '背中/広背筋', category: '背中', homeOk: true, bodyweight: true },
  { name: 'ベントオーバーロウ', bodyPart: '背中/中部', category: '背中', homeOk: true },
  { name: 'シーテッドロウ', bodyPart: '背中/中部', category: '背中', homeOk: false },
  { name: 'Tバーロウ', bodyPart: '背中/中部', category: '背中', homeOk: false },
  { name: 'ショルダープレス', bodyPart: '肩/前部', category: '肩', homeOk: true },
  { name: 'サイドレイズ', bodyPart: '肩/側部', category: '肩', homeOk: true },
  { name: 'リアレイズ', bodyPart: '肩/後部', category: '肩', homeOk: true },
  { name: 'アップライトロウ', bodyPart: '肩/側部', category: '肩', homeOk: true },
  { name: 'バーベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: false },
  { name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'トライセプスエクステンション', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: true },
  { name: 'ケーブルプッシュダウン', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: false },
  { name: 'プランク', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true, bodyweight: true },
  { name: 'クランチ', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true, bodyweight: true },

  // 自宅向け（ここから22件）
  { name: 'ダンベルベンチプレス', bodyPart: '胸/上部', category: '胸', homeOk: true },
  { name: 'インクラインダンベルプレス', bodyPart: '胸/上部', category: '胸', homeOk: true },
  { name: 'EZバーフロアプレス', bodyPart: '胸/全体', category: '胸', homeOk: true },
  { name: '足上げプッシュアップ', bodyPart: '胸/上部', category: '胸', homeOk: true, bodyweight: true },
  { name: 'ダンベルプルオーバー', bodyPart: '胸/全体', category: '胸', homeOk: true },
  { name: 'チンアップ', bodyPart: '背中/広背筋', category: '背中', homeOk: true, bodyweight: true },
  { name: 'ワンハンドダンベルロウ', bodyPart: '背中/広背筋', category: '背中', homeOk: true },
  { name: 'チェストサポートダンベルロウ', bodyPart: '背中/中部', category: '背中', homeOk: true },
  { name: 'ダンベルシュラッグ', bodyPart: '背中/上部', category: '背中', homeOk: true },
  { name: 'アーノルドプレス', bodyPart: '肩/前部', category: '肩', homeOk: true },
  { name: 'EZバーカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'インクラインダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'ハンマーカール', bodyPart: '腕/上腕二頭筋', category: '腕', homeOk: true },
  { name: 'EZバーライイングトライセプスエクステンション', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: true },
  { name: 'フレンチプレス', bodyPart: '腕/上腕三頭筋', category: '腕', homeOk: true },
  { name: 'ゴブレットスクワット', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'ダンベルランジ', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'ステップアップ', bodyPart: '脚/大腿四頭筋', category: '脚', homeOk: true },
  { name: 'ダンベルルーマニアンデッドリフト', bodyPart: '脚/ハムストリング', category: '脚', homeOk: true },
  { name: 'ダンベルヒップスラスト', bodyPart: '脚/殿筋', category: '脚', homeOk: true },
  { name: 'ぶら下がりレッグレイズ', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true, bodyweight: true },
  { name: 'ロシアンツイスト', bodyPart: '体幹/腹筋', category: 'その他', homeOk: true },
];

// name/bodyPart部分一致（大小無視）でプリセットを検索する（純粋関数）
export function searchPresets(query, presets = DEFAULT_EXERCISE_PRESETS) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return presets.filter((p) =>
    p.name.toLowerCase().includes(q) || p.bodyPart.toLowerCase().includes(q));
}
```

- [ ] **Step 4: `js/lib/coursePresets.js` の `DEFAULT_COURSE_PRESETS` を置き換える**

ファイル冒頭の `DEFAULT_COURSE_PRESETS` 定義（コメント行を含む `export const ... ];` まで）を次に置き換える。`missingExerciseNames` 以降は触らない:

```js
// よく使う組み合わせのコース。種目名は DEFAULT_EXERCISE_PRESETS に実在するものだけを使う。
// env: 'gym' はジム用、'home' は自宅用（自宅用は homeOk の種目だけで組む）
export const DEFAULT_COURSE_PRESETS = [
  { name: '胸・肩', env: 'gym', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ショルダープレス', 'サイドレイズ'] },
  { name: '背中・腕', env: 'gym', exercises: ['デッドリフト', 'ラットプルダウン', 'ベントオーバーロウ', 'バーベルカール', 'ケーブルプッシュダウン'] },
  { name: '脚', env: 'gym', exercises: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール', 'カーフレイズ'] },
  { name: '胸のみ', env: 'gym', exercises: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルフライ', 'ディップス'] },
  { name: 'プッシュ', env: 'gym', exercises: ['ベンチプレス', 'ショルダープレス', 'サイドレイズ', 'ケーブルプッシュダウン'] },
  { name: 'プル', env: 'gym', exercises: ['懸垂', 'ラットプルダウン', 'シーテッドロウ', 'バーベルカール'] },

  { name: '自宅 プッシュ', env: 'home', exercises: ['ダンベルベンチプレス', 'ディップス', 'ショルダープレス', 'サイドレイズ', 'EZバーライイングトライセプスエクステンション'] },
  { name: '自宅 プル', env: 'home', exercises: ['懸垂', 'チンアップ', 'ワンハンドダンベルロウ', 'リアレイズ', 'インクラインダンベルカール'] },
  { name: '自宅 脚・お尻', env: 'home', exercises: ['ゴブレットスクワット', 'ブルガリアンスクワット', 'ダンベルルーマニアンデッドリフト', 'ダンベルヒップスラスト', 'カーフレイズ'] },
  { name: '自宅 胸・三頭', env: 'home', exercises: ['ダンベルベンチプレス', 'インクラインダンベルプレス', 'ダンベルフライ', 'ディップス', 'EZバーライイングトライセプスエクステンション'] },
  { name: '自宅 背中・二頭', env: 'home', exercises: ['懸垂', 'ワンハンドダンベルロウ', 'チェストサポートダンベルロウ', 'EZバーカール', 'ハンマーカール'] },
  { name: '自宅 肩・腕', env: 'home', exercises: ['ショルダープレス', 'アーノルドプレス', 'サイドレイズ', 'リアレイズ', 'EZバーカール', 'フレンチプレス'] },
  { name: '自宅 全身', env: 'home', exercises: ['ゴブレットスクワット', 'ダンベルベンチプレス', 'ワンハンドダンベルロウ', 'ダンベルルーマニアンデッドリフト', 'ショルダープレス', '懸垂'] },
];
```

- [ ] **Step 5: 全テストが通ることを確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`（既存の「全コースの種目がプリセットに実在」「3〜6種目」「重複なし」「名前の一意」も通ること）

- [ ] **Step 6: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/lib/exercisePresets.js js/lib/coursePresets.js test/exercisePresets.test.js test/coursePresets.test.js
git commit -m "$(cat <<'EOF'
feat: add home exercise and course presets with homeOk and bodyweight flags

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 環境・種目メタ・体重の純粋関数

**Files:**
- Create: `js/lib/env.js`、`js/lib/exerciseMeta.js`、`js/lib/bodyweight.js`
- Create: `test/env.test.js`、`test/exerciseMeta.test.js`、`test/bodyweight.test.js`
- Modify: `sw.js`（`ASSETS` に3ファイルを追加。`CACHE` はまだ変えない）

**Interfaces:**
- Produces:
  - `visibleExercises(exercises, env): Exercise[]`
  - `courseAvailable(course, exercises, env): boolean`
  - `visibleCoursePresets(presets, env): Preset[]`
  - `getEnv(): 'home'|'gym'`、`setEnv(env): void`
  - `ensureExerciseMeta(getAllFn, putFn, presets): Promise<number>`（更新した件数を返す）
  - `latestBodyWeight(records): number|null`

- [ ] **Step 1: 失敗するテストを書く**

`test/env.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleExercises, courseAvailable, visibleCoursePresets, getEnv, setEnv } from '../js/lib/env.js';

const EX = [
  { id: 'a', name: 'ベンチプレス', homeOk: false },
  { id: 'b', name: 'ダンベルカール', homeOk: true },
  { id: 'c', name: '自作種目' }, // homeOk 未設定
];

// localStorage を差し替えて、終わったら元に戻す
function withLocalStorage(stub, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  try { fn(); } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

test('visibleExercises returns every exercise in the gym env', () => {
  assert.deepEqual(visibleExercises(EX, 'gym').map((e) => e.id), ['a', 'b', 'c']);
});

test('visibleExercises drops homeOk:false but keeps unset ones in the home env', () => {
  assert.deepEqual(visibleExercises(EX, 'home').map((e) => e.id), ['b', 'c']);
});

test('courseAvailable is always true in the gym env', () => {
  assert.equal(courseAvailable({ exerciseIds: ['a', 'b'] }, EX, 'gym'), true);
});

test('courseAvailable is false in the home env when a member is homeOk:false', () => {
  assert.equal(courseAvailable({ exerciseIds: ['a', 'b'] }, EX, 'home'), false);
});

test('courseAvailable is true in the home env when every member is usable', () => {
  assert.equal(courseAvailable({ exerciseIds: ['b', 'c'] }, EX, 'home'), true);
});

test('courseAvailable ignores ids of deleted exercises', () => {
  assert.equal(courseAvailable({ exerciseIds: ['b', 'gone'] }, EX, 'home'), true);
});

test('visibleCoursePresets keeps only the presets for the env', () => {
  const presets = [{ name: 'A', env: 'gym' }, { name: 'B', env: 'home' }];
  assert.deepEqual(visibleCoursePresets(presets, 'home').map((p) => p.name), ['B']);
  assert.deepEqual(visibleCoursePresets(presets, 'gym').map((p) => p.name), ['A']);
});

test('getEnv falls back to gym when localStorage throws', () => {
  withLocalStorage({ getItem() { throw new Error('blocked'); } }, () => {
    assert.equal(getEnv(), 'gym');
  });
});

test('getEnv defaults to gym when nothing is stored', () => {
  withLocalStorage({ getItem: () => null }, () => {
    assert.equal(getEnv(), 'gym');
  });
});

test('setEnv and getEnv round-trip, and unknown values collapse to gym', () => {
  const store = new Map();
  const stub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  withLocalStorage(stub, () => {
    setEnv('home');
    assert.equal(getEnv(), 'home');
    setEnv('gym');
    assert.equal(getEnv(), 'gym');
    store.set('training_env', 'bogus');
    assert.equal(getEnv(), 'gym');
  });
});

test('setEnv does not throw when localStorage is unavailable', () => {
  withLocalStorage({ setItem() { throw new Error('quota'); } }, () => {
    assert.doesNotThrow(() => setEnv('home'));
  });
});
```

`test/exerciseMeta.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureExerciseMeta } from '../js/lib/exerciseMeta.js';

const PRESETS = [
  { name: 'ベンチプレス', homeOk: false },
  { name: '懸垂', homeOk: true, bodyweight: true },
  { name: 'ダンベルカール', homeOk: true },
];

function makeStore(initial) {
  const store = initial.map((x) => ({ ...x }));
  let writes = 0;
  return {
    store,
    getAllFn: async () => store.map((x) => ({ ...x })),
    putFn: async (v) => {
      writes++;
      const i = store.findIndex((x) => x.id === v.id);
      store[i] = v;
    },
    writes: () => writes,
  };
}

test('ensureExerciseMeta copies flags from the matching preset', async () => {
  const s = makeStore([
    { id: '1', name: 'ベンチプレス' },
    { id: '2', name: '懸垂' },
    { id: '3', name: 'ダンベルカール' },
  ]);
  const n = await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(n, 3);
  assert.deepEqual(s.store.map((e) => [e.homeOk, e.bodyweight]),
    [[false, false], [true, true], [true, false]]);
});

test('ensureExerciseMeta marks custom exercises homeOk:true, bodyweight:false', async () => {
  const s = makeStore([{ id: '1', name: '自作リストカール' }]);
  await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(s.store[0].homeOk, true);
  assert.equal(s.store[0].bodyweight, false);
});

test('ensureExerciseMeta keeps every other field intact', async () => {
  const s = makeStore([{ id: '1', name: '懸垂', bodyPart: '背中/広背筋', cuePresets: ['肩甲骨'], setPattern: '通常' }]);
  await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(s.store[0].bodyPart, '背中/広背筋');
  assert.deepEqual(s.store[0].cuePresets, ['肩甲骨']);
  assert.equal(s.store[0].setPattern, '通常');
});

test('ensureExerciseMeta does not overwrite an exercise that already has homeOk', async () => {
  const s = makeStore([{ id: '1', name: 'ベンチプレス', homeOk: true, bodyweight: false }]);
  const n = await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(n, 0);
  assert.equal(s.writes(), 0);
  assert.equal(s.store[0].homeOk, true);
});

test('ensureExerciseMeta is a no-op on the second run', async () => {
  const s = makeStore([{ id: '1', name: 'ベンチプレス' }]);
  await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  const before = s.writes();
  const n = await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(n, 0);
  assert.equal(s.writes(), before);
});
```

`test/bodyweight.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestBodyWeight } from '../js/lib/bodyweight.js';

test('latestBodyWeight returns the weight of the newest date', () => {
  const records = [
    { date: '2026-10-01', weight: 70 },
    { date: '2026-10-05', weight: 69.5 },
    { date: '2026-10-03', weight: 70.2 },
  ];
  assert.equal(latestBodyWeight(records), 69.5);
});

test('latestBodyWeight prefers the later entry when dates tie', () => {
  const records = [
    { date: '2026-10-05', weight: 70 },
    { date: '2026-10-05', weight: 69.8 },
  ];
  assert.equal(latestBodyWeight(records), 69.8);
});

test('latestBodyWeight ignores zero, negative and non-numeric weights', () => {
  const records = [
    { date: '2026-10-01', weight: 70 },
    { date: '2026-10-05', weight: 0 },
    { date: '2026-10-06', weight: 'abc' },
    { date: '2026-10-07', weight: -3 },
  ];
  assert.equal(latestBodyWeight(records), 70);
});

test('latestBodyWeight returns null for empty or missing input', () => {
  assert.equal(latestBodyWeight([]), null);
  assert.equal(latestBodyWeight(undefined), null);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --test test/env.test.js test/exerciseMeta.test.js test/bodyweight.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)|Cannot find" | head`
Expected: モジュールが見つからず FAIL

- [ ] **Step 3: 実装する**

`js/lib/env.js`:

```js
// トレーニング環境（自宅／ジム）。種目・コースの「選択・提案」を環境で絞り込む。
// 履歴や集計は絞り込まない（呼び出し側で全種目を使う）。
const STORAGE_KEY = 'training_env';
export const ENV_HOME = 'home';
export const ENV_GYM = 'gym';

// 自宅では homeOk が false の種目を除く。未設定は隠さない。ジムは全種目
export function visibleExercises(exercises, env) {
  if (env !== ENV_HOME) return exercises;
  return exercises.filter((e) => e.homeOk !== false);
}

// 自宅では、コースに含まれる実在の種目がすべて使えるときだけ出す。削除済みのIDは判定から除く
export function courseAvailable(course, exercises, env) {
  if (env !== ENV_HOME) return true;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const id of course.exerciseIds || []) {
    const ex = byId.get(id);
    if (ex && ex.homeOk === false) return false;
  }
  return true;
}

export function visibleCoursePresets(presets, env) {
  return presets.filter((p) => p.env === env);
}

// 初期値と読み取り失敗時は 'gym'（更新しても従来の挙動のまま）
export function getEnv() {
  try {
    return localStorage.getItem(STORAGE_KEY) === ENV_HOME ? ENV_HOME : ENV_GYM;
  } catch {
    return ENV_GYM;
  }
}

export function setEnv(env) {
  try {
    localStorage.setItem(STORAGE_KEY, env === ENV_HOME ? ENV_HOME : ENV_GYM);
  } catch { /* 保存できなくても画面の動作は続ける */ }
}
```

`js/lib/exerciseMeta.js`:

```js
// homeOk が未設定の登録済み種目に、同名プリセットの homeOk / bodyweight を写す。
// 一致しない自作種目は「自宅可・自重なし」にして隠さない。
// 既に homeOk がある種目には書き込まないので、2回目以降は何もしない（依存注入でテスト可能）
export async function ensureExerciseMeta(getAllFn, putFn, presets) {
  const exercises = await getAllFn();
  const byName = new Map(presets.map((p) => [p.name, p]));
  let updated = 0;
  for (const ex of exercises) {
    if (typeof ex.homeOk === 'boolean') continue;
    const preset = byName.get(ex.name);
    await putFn({
      ...ex,
      homeOk: preset ? preset.homeOk !== false : true,
      bodyweight: preset ? preset.bodyweight === true : false,
    });
    updated++;
  }
  return updated;
}
```

`js/lib/bodyweight.js`:

```js
// 体重記録から直近の体重を返す（純粋関数）。日付が最大のもの、同日なら配列の後ろのもの。
// 0以下・数値でない記録は無視し、なければ null
export function latestBodyWeight(records) {
  let best = null;
  for (const r of records || []) {
    const w = Number(r.weight);
    if (!(w > 0)) continue;
    if (best === null || r.date >= best.date) best = { date: r.date, weight: w };
  }
  return best ? best.weight : null;
}
```

- [ ] **Step 4: `sw.js` の `ASSETS` に3ファイルを追加する**

`'js/lib/firebase-config.js',` の直後に次を足す（同じ行に続けてよい）:

```js
 'js/lib/env.js', 'js/lib/exerciseMeta.js', 'js/lib/bodyweight.js',
```

具体的には、6行目の末尾 `'js/lib/firebase-config.js',` を `'js/lib/firebase-config.js', 'js/lib/env.js', 'js/lib/exerciseMeta.js', 'js/lib/bodyweight.js',` に変える。

- [ ] **Step 5: 全テストが通ることを確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)" && node --check sw.js && echo "sw OK"`
Expected: `fail 0`、`sw OK`

- [ ] **Step 6: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/lib/env.js js/lib/exerciseMeta.js js/lib/bodyweight.js test/env.test.js test/exerciseMeta.test.js test/bodyweight.test.js sw.js
git commit -m "$(cat <<'EOF'
feat: add env filtering, exercise meta migration and latest body weight helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: プリセット登録の共通化と一括追加

**Files:**
- Modify: `js/lib/coursePresets.js`（import 追加と、末尾に2関数を追加）
- Test: `test/coursePresets.test.js`（追記）

**Interfaces:**
- Consumes: `matchExerciseNamesToIds(names, exercises)`（`js/lib/courses.js`）、`DEFAULT_COURSE_PRESETS` / `missingExerciseNames`（同ファイル）
- Produces:
  - `registerCoursePreset(preset, deps): Promise<{ added: number }>` — `deps = { getAll, put, uid, exercisePresets }`。未登録の種目を `{id, name, bodyPart, category, cuePresets: [], setPattern: '通常', homeOk, bodyweight}` で登録し、コースを1件作る。`added` は実際に登録した種目数
  - `registerHomeCoursePack(deps): Promise<{ exercises: number, courses: number }>` — 同名コースが既にあれば作らない（冪等）

- [ ] **Step 1: 失敗するテストを書く**

`test/coursePresets.test.js` の import 行を次に置き換える:

```js
import { DEFAULT_COURSE_PRESETS, missingExerciseNames, registerCoursePreset, registerHomeCoursePack } from '../js/lib/coursePresets.js';
```

末尾に追記:

```js
function makeDeps(initial = {}) {
  const stores = { exercises: [...(initial.exercises || [])], courses: [...(initial.courses || [])] };
  let n = 0;
  return {
    stores,
    deps: {
      getAll: async (name) => stores[name].map((x) => ({ ...x })),
      put: async (name, v) => {
        const i = stores[name].findIndex((x) => x.id === v.id);
        if (i >= 0) stores[name][i] = v; else stores[name].push(v);
      },
      uid: () => 'id' + (n++),
      exercisePresets: DEFAULT_EXERCISE_PRESETS,
    },
  };
}

test('registerCoursePreset registers missing exercises with their flags and creates the course', async () => {
  const { stores, deps } = makeDeps();
  const preset = DEFAULT_COURSE_PRESETS.find((c) => c.name === '自宅 プル');
  const r = await registerCoursePreset(preset, deps);
  assert.equal(r.added, 5);
  assert.equal(stores.exercises.length, 5);
  const kenSui = stores.exercises.find((e) => e.name === '懸垂');
  assert.equal(kenSui.homeOk, true);
  assert.equal(kenSui.bodyweight, true);
  assert.equal(kenSui.setPattern, '通常');
  assert.deepEqual(kenSui.cuePresets, []);
  const row = stores.exercises.find((e) => e.name === 'ワンハンドダンベルロウ');
  assert.equal(row.bodyweight, false);
  assert.equal(stores.courses.length, 1);
  assert.equal(stores.courses[0].name, '自宅 プル');
  const nameById = Object.fromEntries(stores.exercises.map((e) => [e.id, e.name]));
  assert.deepEqual(stores.courses[0].exerciseIds.map((id) => nameById[id]), preset.exercises);
});

test('registerCoursePreset does not register an exercise that already exists', async () => {
  const { stores, deps } = makeDeps({ exercises: [{ id: 'k', name: '懸垂' }] });
  const preset = DEFAULT_COURSE_PRESETS.find((c) => c.name === '自宅 プル');
  const r = await registerCoursePreset(preset, deps);
  assert.equal(r.added, 4);
  assert.equal(stores.exercises.filter((e) => e.name === '懸垂').length, 1);
  assert.ok(stores.courses[0].exerciseIds.includes('k'));
});

test('registerHomeCoursePack creates every home course and the exercises they need', async () => {
  const { stores, deps } = makeDeps();
  const r = await registerHomeCoursePack(deps);
  assert.equal(r.courses, 7);
  assert.equal(stores.courses.length, 7);
  assert.equal(r.exercises, stores.exercises.length);
  assert.ok(stores.courses.every((c) => c.name.startsWith('自宅 ')));
  assert.ok(stores.exercises.every((e) => e.homeOk === true));
  const names = stores.exercises.map((e) => e.name);
  assert.equal(new Set(names).size, names.length);
});

test('registerHomeCoursePack is idempotent', async () => {
  const { stores, deps } = makeDeps();
  await registerHomeCoursePack(deps);
  const exCount = stores.exercises.length;
  const r = await registerHomeCoursePack(deps);
  assert.deepEqual(r, { exercises: 0, courses: 0 });
  assert.equal(stores.exercises.length, exCount);
  assert.equal(stores.courses.length, 7);
});

test('registerHomeCoursePack skips a course whose name already exists', async () => {
  const { stores, deps } = makeDeps({ courses: [{ id: 'c0', name: '自宅 プル', exerciseIds: [] }] });
  const r = await registerHomeCoursePack(deps);
  assert.equal(r.courses, 6);
  assert.equal(stores.courses.filter((c) => c.name === '自宅 プル').length, 1);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --test test/coursePresets.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)|does not provide" | head`
Expected: `registerCoursePreset` が export されておらず FAIL

- [ ] **Step 3: 実装する**

`js/lib/coursePresets.js` の1行目（コメント）の前に import を足す:

```js
import { matchExerciseNamesToIds } from './courses.js';

```

ファイル末尾（`missingExerciseNames` の後）に追記:

```js

// コースプリセットを1件登録する。未登録の種目は種目プリセットから補って登録し
// （homeOk / bodyweight も引き継ぐ）、コースを作る。依存注入でテスト可能
// deps: { getAll, put, uid, exercisePresets }
export async function registerCoursePreset(preset, { getAll, put, uid, exercisePresets }) {
  const current = await getAll('exercises');
  let added = 0;
  for (const name of missingExerciseNames(preset.exercises, current)) {
    const src = exercisePresets.find((p) => p.name === name);
    if (!src) continue;
    await put('exercises', {
      id: uid(), name: src.name, bodyPart: src.bodyPart, category: src.category,
      cuePresets: [], setPattern: '通常',
      homeOk: src.homeOk !== false, bodyweight: src.bodyweight === true,
    });
    added++;
  }
  const after = await getAll('exercises');
  const exerciseIds = matchExerciseNamesToIds(preset.exercises, after);
  await put('courses', { id: uid(), name: preset.name, exerciseIds });
  return { added };
}

// 自宅コースのプリセットをまとめて登録する。同名のコースが既にあれば作らない（何度呼んでも重複しない）
export async function registerHomeCoursePack(deps) {
  const have = new Set((await deps.getAll('courses')).map((c) => c.name));
  let exercises = 0;
  let courses = 0;
  for (const preset of DEFAULT_COURSE_PRESETS.filter((p) => p.env === 'home')) {
    if (have.has(preset.name)) continue;
    const { added } = await registerCoursePreset(preset, deps);
    exercises += added;
    courses++;
  }
  return { exercises, courses };
}
```

- [ ] **Step 4: 全テストが通ることを確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 5: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/lib/coursePresets.js test/coursePresets.test.js
git commit -m "$(cat <<'EOF'
feat: share preset registration and add a one-shot home course pack

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 音声の「プラス」指定

**Files:**
- Modify: `js/lib/voiceParse.js`（`parseSetUtterance` のみ）
- Test: `test/voiceParse.test.js`

**Interfaces:**
- Produces: `parseSetUtterance(text, names): { exerciseName, weight, reps, added }`。`added` は boolean（重量の直前に `プラス` / `＋` / `+` / `追加` があるとき `true`）。`weight` の値自体は `added` で変えない

- [ ] **Step 1: 既存テストの期待値に `added: false` を足し、新しいテストを書く**

`test/voiceParse.test.js` の `parseSetUtterance` の `deepEqual` をすべて更新する。次の置き換えをそのまま行う:

| 変更前（期待値） | 変更後 |
|---|---|
| `{ exerciseName: 'ベンチプレス', weight: 100, reps: 8 }`（2か所） | `{ exerciseName: 'ベンチプレス', weight: 100, reps: 8, added: false }` |
| `{ exerciseName: null, weight: 100, reps: 8 }`（4か所：種目なし／kg／レップ） | `{ exerciseName: null, weight: 100, reps: 8, added: false }` |
| `{ exerciseName: null, weight: null, reps: 8 }` | `{ exerciseName: null, weight: null, reps: 8, added: false }` |
| `{ exerciseName: 'スクワット', weight: null, reps: null }` | `{ exerciseName: 'スクワット', weight: null, reps: null, added: false }` |
| `{ exerciseName: null, weight: 62.5, reps: 10 }` | `{ exerciseName: null, weight: 62.5, reps: 10, added: false }` |
| `{ exerciseName: null, weight: null, reps: null }` | `{ exerciseName: null, weight: null, reps: null, added: false }` |
| `{ exerciseName: 'Tバーロウ', weight: 60, reps: 12 }` | `{ exerciseName: 'Tバーロウ', weight: 60, reps: 12, added: false }` |

末尾に追記:

```js
const HOME_NAMES = ['ディップス', '懸垂', 'ダンベルカール'];

test('parseSetUtterance marks プラス as an added weight', () => {
  assert.deepEqual(parseSetUtterance('ディップス プラス10キロ 8回', HOME_NAMES),
    { exerciseName: 'ディップス', weight: 10, reps: 8, added: true });
});

test('parseSetUtterance accepts ＋, + and 追加 as added markers', () => {
  for (const marker of ['＋', '+', '追加']) {
    assert.deepEqual(parseSetUtterance(`ディップス${marker}10キロ8回`, HOME_NAMES),
      { exerciseName: 'ディップス', weight: 10, reps: 8, added: true }, marker);
  }
});

test('parseSetUtterance allows a space between the marker and the number', () => {
  assert.deepEqual(parseSetUtterance('懸垂 プラス 5 キロ 6回', HOME_NAMES),
    { exerciseName: '懸垂', weight: 5, reps: 6, added: true });
});

test('parseSetUtterance reads a decimal added weight', () => {
  assert.deepEqual(parseSetUtterance('懸垂 プラス2.5キロ 6回', HOME_NAMES),
    { exerciseName: '懸垂', weight: 2.5, reps: 6, added: true });
});

test('parseSetUtterance does not mark a plain weight or bare numbers as added', () => {
  assert.equal(parseSetUtterance('ダンベルカール20キロ10回', HOME_NAMES).added, false);
  assert.equal(parseSetUtterance('ダンベルカール 20 10', HOME_NAMES).added, false);
});

test('parseSetUtterance reads reps only when a bodyweight set has no weight', () => {
  assert.deepEqual(parseSetUtterance('懸垂 8回', HOME_NAMES),
    { exerciseName: '懸垂', weight: null, reps: 8, added: false });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --test test/voiceParse.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail` が複数（`added` が返らない）

- [ ] **Step 3: `parseSetUtterance` を修正する**

`js/lib/voiceParse.js` の次の部分:

```js
  let weight = null, reps = null;
  const wm = rest.match(/(\d+(?:\.\d+)?)\s*(?:キロ|㌔|kg)/i);
  if (wm) { weight = parseFloat(wm[1]); rest = rest.replace(wm[0], ' '); }
```

を次に置き換える:

```js
  let weight = null, reps = null, added = false;
  // 重量の直前の「プラス / ＋ / + / 追加」は、体重などへの上乗せを表す
  const wm = rest.match(/((?:プラス|＋|\+|追加)\s*)?(\d+(?:\.\d+)?)\s*(?:キロ|㌔|kg)/i);
  if (wm) { weight = parseFloat(wm[2]); added = Boolean(wm[1]); rest = rest.replace(wm[0], ' '); }
```

さらに末尾の `return { exerciseName, weight, reps };` を `return { exerciseName, weight, reps, added };` に変える。

- [ ] **Step 4: 全テストが通ることを確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 5: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/lib/voiceParse.js test/voiceParse.test.js
git commit -m "$(cat <<'EOF'
feat: parse an added-weight marker (プラス) in voice utterances

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ヘッダーの環境切替と起動時の印付け

**Files:**
- Modify: `index.html`（ヘッダー）、`css/style.css`、`js/app.js`（全体を置き換える）

**Interfaces:**
- Consumes: `getEnv` / `setEnv`（Task 2）、`ensureExerciseMeta`（Task 2）、`DEFAULT_EXERCISE_PRESETS`（Task 1）
- Produces: ヘッダーの `#env-seg`（`button[data-env="home"|"gym"]`）。切替で `localStorage.training_env` を更新し、現在のタブを `navigate(currentRoute)` で描き直す

- [ ] **Step 1: `index.html` のヘッダーを置き換える**

次の1行:

```html
  <header class="app-header"><span class="logo">GACHI<span class="accent">-FIT</span></span></header>
```

を次に置き換える:

```html
  <header class="app-header">
    <span class="logo">GACHI<span class="accent">-FIT</span></span>
    <div class="env-seg" id="env-seg" role="group" aria-label="トレーニング環境">
      <button type="button" data-env="home" aria-pressed="false">🏠 自宅</button>
      <button type="button" data-env="gym" aria-pressed="true">🏋 ジム</button>
    </div>
  </header>
```

- [ ] **Step 2: `css/style.css` を修正する**

次の1行:

```css
.app-header { padding: 14px 16px; border-bottom: 1px solid #222; }
```

を次に置き換える:

```css
.app-header { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid #222; }
```

`.accent { color: var(--accent); }` の直後に追記:

```css
.env-seg { display: flex; gap: 6px; flex: 0 0 auto; }
.env-seg button { min-height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid #2c2c2c;
  background: var(--surface-2); color: var(--muted); font-size: 14px; font-weight: 700; cursor: pointer; }
.env-seg button.sel { background: var(--accent); color: #0a0a0a; border-color: var(--accent); }
```

- [ ] **Step 3: `js/app.js` 全体を次の内容に置き換える**

```js
import { renderHome } from './views/home.js';
import { renderWorkout } from './views/workout.js';
import { renderAnalysis } from './views/analysis.js';
import { renderManage } from './views/manage.js';
import { getAll, put, uid } from './db.js';
import { ensureDefaultSetPatterns } from './lib/seed.js';
import { stopVoiceInput } from './lib/voice.js';
import { ensureExerciseMeta } from './lib/exerciseMeta.js';
import { DEFAULT_EXERCISE_PRESETS } from './lib/exercisePresets.js';
import { getEnv, setEnv } from './lib/env.js';

const TAB_ROUTES = ['home', 'workout', 'analysis', 'manage'];

const routes = {
  home: renderHome,
  workout: renderWorkout,
  analysis: renderAnalysis,
  manage: renderManage,
};

// 環境を切り替えたときに現在の画面を描き直すため、直近の route を覚えておく
let currentRoute = 'home';

async function navigate(route, opts) {
  currentRoute = route;
  const el = document.getElementById('view');
  stopVoiceInput();
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.route === route && TAB_ROUTES.includes(route)));
  document.body.classList.toggle('has-interval-bar', route === 'workout');
  const render = routes[route] || renderHome;
  await render(el, navigate, opts);
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

// ヘッダーの環境切替（自宅／ジム）
function renderEnvSwitch() {
  const env = getEnv();
  document.querySelectorAll('#env-seg button').forEach((b) => {
    const on = b.dataset.env === env;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
document.querySelectorAll('#env-seg button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.env === getEnv()) return;
    setEnv(b.dataset.env);
    renderEnvSwitch();
    navigate(currentRoute);
  }));
renderEnvSwitch();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// どちらかが失敗しても画面は開く
ensureDefaultSetPatterns(() => getAll('setPatterns'), (v) => put('setPatterns', v), uid)
  .catch(() => {})
  .then(() => ensureExerciseMeta(() => getAll('exercises'), (v) => put('exercises', v), DEFAULT_EXERCISE_PRESETS))
  .catch(() => {})
  .finally(() => navigate('home'));
```

- [ ] **Step 4: 構文チェックとテスト**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --check js/app.js && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 5: ブラウザで確認する**

「ブラウザ確認の共通手順」でサーバーを起動して開く。DBを初期化してから、次を `javascript_tool` で実行して再読み込みする:

```js
const db = await import('/js/db.js');
await db.put('exercises', { id: 'x1', name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸', cuePresets: [], setPattern: '通常' });
await db.put('exercises', { id: 'x2', name: '懸垂', bodyPart: '背中/広背筋', category: '背中', cuePresets: [], setPattern: '通常' });
await db.put('exercises', { id: 'x3', name: '自作リストカール', bodyPart: '腕/前腕', category: '腕', cuePresets: [], setPattern: '通常' });
location.reload();
```

再読み込み後に確認:

```js
const db = await import('/js/db.js');
(await db.getAll('exercises')).map((e) => [e.name, e.homeOk, e.bodyweight]);
```

Expected: `[["ベンチプレス",false,false],["懸垂",true,true],["自作リストカール",true,false]]`

さらに:
- `read_page` でヘッダーに `🏠 自宅` / `🏋 ジム` の2ボタンがあり、初期は `ジム` が `aria-pressed="true"`
- 自宅ボタンをクリック → `localStorage.getItem('training_env')` が `'home'`、`自宅` が `sel`、ホームが描き直される
- `resize_window` で 375×667 にして、`document.querySelector('.env-seg').getBoundingClientRect()` の高さが 40 以上、`document.documentElement.scrollWidth <= innerWidth`（横スクロールなし）、ロゴとボタンが1行に収まる
- 終わったら `resize_window` の preset `desktop` に戻す

- [ ] **Step 6: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add index.html css/style.css js/app.js
git commit -m "$(cat <<'EOF'
feat: add a home/gym switch to the header and tag existing exercises on startup

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 記録タブを環境で絞り込む

**Files:**
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `getEnv` / `visibleExercises` / `courseAvailable`（Task 2）
- Produces: `renderWorkout` 内の `allExercises`（全種目）と `exercises`（絞り込み後）。以降のタスクはこの2つの名前を前提にする

- [ ] **Step 1: import を足す**

`import { parseSetUtterance } from '../lib/voiceParse.js';` の直前に追加:

```js
import { getEnv, visibleExercises, courseAvailable } from '../lib/env.js';
```

- [ ] **Step 2: `renderWorkout` の冒頭を置き換える**

次の部分:

```js
  const exercises = await getAll('exercises');
  const allSets = await getAll('sets');
  const prs = computePRs(allSets);
  const places = await getAll('places');
  const courses = await getAll('courses');
```

を次に置き換える:

```js
  const allExercises = await getAll('exercises');
  const env = getEnv();
  // 選択・提案には環境で絞った種目、名前の解決（本日のセットなど）には全種目を使う
  const exercises = visibleExercises(allExercises, env);
  const allSets = await getAll('sets');
  const prs = computePRs(allSets);
  const places = await getAll('places');
  const courses = (await getAll('courses')).filter((c) => courseAvailable(c, allExercises, env));
```

- [ ] **Step 3: 種目がないときの案内を置き換える**

次の部分:

```js
  if (!exercises.length) {
    el.innerHTML = `<h2 class="view-title">記録</h2>
      <div class="card"><p class="muted">先に「管理」タブで種目を登録してください。</p></div>`;
    return;
  }
```

を次に置き換える:

```js
  if (!exercises.length) {
    // 絞り込みで0件になった（登録はある）場合と、そもそも未登録の場合で案内を分ける
    const msg = allExercises.length
      ? '自宅でできる種目がありません。ホームの「自宅向けの種目とコースをまとめて追加」を押してください。'
      : '先に「管理」タブで種目を登録してください。';
    el.innerHTML = `<h2 class="view-title">記録</h2>
      <div class="card"><p class="muted">${msg}</p></div>`;
    return;
  }
```

- [ ] **Step 4: 「本日のセット」には全種目を渡す**

`await renderToday(el, exercises);` は3か所（スーパーセット保存後、通常保存後、保存ハンドラの直後の初回描画）にある。`grep -n "await renderToday(el, exercises);" js/views/workout.js` で3件であることを確かめ、すべて `await renderToday(el, allExercises);` に置き換える。`renderToday` 関数の中にある `renderToday(el, exercises)`（`await` なし、編集・削除のコールバック）は引数名が違うので触らない。

- [ ] **Step 5: 構文チェックとテスト**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --check js/views/workout.js && grep -c "await renderToday(el, allExercises);" js/views/workout.js && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `3`、`fail 0`

- [ ] **Step 6: ブラウザで確認する**

DBを初期化し、次を投入して再読み込みする（Task 5 の確認と同じ3種目に加え、コースとセットを作る）:

```js
const db = await import('/js/db.js');
await db.put('exercises', { id: 'x1', name: 'ベンチプレス', bodyPart: '胸/上部', category: '胸', cuePresets: [], setPattern: '通常', homeOk: false, bodyweight: false });
await db.put('exercises', { id: 'x2', name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', cuePresets: [], setPattern: '通常', homeOk: true, bodyweight: false });
await db.put('courses', { id: 'c1', name: 'ジム胸', exerciseIds: ['x1', 'x2'] });
await db.put('courses', { id: 'c2', name: '自宅腕', exerciseIds: ['x2'] });
await db.put('workouts', { id: 'w1', date: new Date().toLocaleDateString('sv-SE'), note: '' });
await db.put('sets', { id: 's1', workoutId: 'w1', exerciseId: 'x1', weight: 80, reps: 8, assistedReps: 0, estimated1RM: 100, targetWeight: null, createdAt: Date.now() });
location.reload();
```

確認（記録タブを開き、ヘッダーで環境を切り替えながら）:
- ジム環境: 種目セレクトに `ベンチプレス` と `ダンベルカール` の両方、コースセレクトに `ジム胸` と `自宅腕`
- 自宅環境: 種目セレクト（`#w-ex` の option）が `ダンベルカール` のみ、コースセレクトが `自宅腕` のみ
- 自宅環境でも「本日のセット」に `ベンチプレス 80kg × 8` と**種目名つき**で出る（`?` にならない）
- 自宅環境で `x2` の `homeOk` を `false` にして再読み込み → 記録タブに「自宅でできる種目がありません。ホームの「自宅向けの種目とコースをまとめて追加」を押してください。」が出る

- [ ] **Step 7: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/views/workout.js
git commit -m "$(cat <<'EOF'
feat: filter the record tab exercises and courses by environment

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ホームの絞り込みと一括追加ボタン

**Files:**
- Modify: `js/views/home.js`

**Interfaces:**
- Consumes: `getEnv` / `visibleExercises` / `courseAvailable`（Task 2）、`registerHomeCoursePack`（Task 3）、`DEFAULT_EXERCISE_PRESETS`（Task 1）

- [ ] **Step 1: import を足す**

`import { openPlanEditor } from './plan-editor.js';` の直後に追加:

```js
import { getEnv, visibleExercises, courseAvailable } from '../lib/env.js';
import { registerHomeCoursePack } from '../lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../lib/exercisePresets.js';
```

- [ ] **Step 2: `renderHome` の冒頭を置き換える**

次の部分:

```js
export async function renderHome(el, navigate) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
  const prs = computePRs(sets);
  const today = localDateStr();
  const workouts = await getAll('workouts');
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
```

を次に置き換える:

```js
export async function renderHome(el, navigate) {
  // 名前の解決と集計には全種目、コース選択とAI提案には環境で絞った種目を使う
  const allExercises = await getAll('exercises');
  const env = getEnv();
  const exercises = visibleExercises(allExercises, env);
  const sets = await getAll('sets');
  const prs = computePRs(sets);
  const today = localDateStr();
  const workouts = await getAll('workouts');
  const nameOf = (id) => allExercises.find((e) => e.id === id)?.name || '?';
```

- [ ] **Step 3: 集計用の `exById` を全種目にする**

`const exById = Object.fromEntries(exercises.map((e) => [e.id, e]));` を `const exById = Object.fromEntries(allExercises.map((e) => [e.id, e]));` に置き換える。

- [ ] **Step 4: コースを絞り込む**

`  const courses = await getAll('courses');` を次に置き換える:

```js
  const courses = (await getAll('courses')).filter((c) => courseAvailable(c, allExercises, env));
```

- [ ] **Step 5: コースカードを置き換える**

次の部分:

```js
  const suggestCard = exercises.length
    ? `<div class="card">
        <strong>お帰りなさい。今日はどんなトレーニングをしますか？</strong>
        ${courseButtons}
        <button type="button" id="ai-course-btn" class="btn btn-block" style="margin-top:10px">AIが今日のコースを提案</button>
        <div id="ai-course-out" style="margin-top:10px"></div>
      </div>`
    : '';
```

を次に置き換える:

```js
  // 自宅環境で表示できるコースがないときは、自宅コースを一括で入れるボタンを出す
  const showPackBtn = env === 'home' && courses.length === 0;
  const suggestCard = (exercises.length || env === 'home')
    ? `<div class="card">
        <strong>お帰りなさい。今日はどんなトレーニングをしますか？</strong>
        ${courseButtons}
        ${showPackBtn ? '<button type="button" id="home-pack-btn" class="btn btn-block" style="margin-top:10px">自宅向けの種目とコースをまとめて追加</button>' : ''}
        ${exercises.length ? `<button type="button" id="ai-course-btn" class="btn btn-block" style="margin-top:10px">AIが今日のコースを提案</button>
        <div id="ai-course-out" style="margin-top:10px"></div>` : ''}
        <div id="home-msg" class="muted" style="margin-top:8px"></div>
      </div>`
    : '';
```

- [ ] **Step 6: カレンダーの日別詳細には全種目を渡す**

`onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises, nameOf }),` を `onSelect: (date) => renderDayDetail(el.querySelector('#home-day'), date, { exercises: allExercises, nameOf }),` に置き換える。

- [ ] **Step 7: 一括追加ボタンのハンドラを足す**

`  el.querySelectorAll('[data-select-course]').forEach((b) =>` で始まる2行のブロック（`navigate('workout', { initialCourseId: ... })` で終わる）の直後に追加:

```js

  const packBtn = el.querySelector('#home-pack-btn');
  if (packBtn) {
    packBtn.addEventListener('click', async () => {
      const msg = el.querySelector('#home-msg');
      packBtn.disabled = true;
      msg.textContent = '追加中…';
      try {
        const r = await registerHomeCoursePack({ getAll, put, uid, exercisePresets: DEFAULT_EXERCISE_PRESETS });
        // 描き直すとボタンもメッセージも消えるので、描き直したあとにメッセージを入れる
        await renderHome(el, navigate);
        el.querySelector('#home-msg').textContent = `種目${r.exercises}件・コース${r.courses}件を追加しました`;
      } catch (e) {
        packBtn.disabled = false;
        msg.textContent = '追加できませんでした: ' + e.message;
      }
    });
  }
```

- [ ] **Step 8: 構文チェックとテスト**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --check js/views/home.js && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 9: ブラウザで確認する**

DBを初期化する（種目なし）。ヘッダーを `自宅` にして確認:
- ホームのコースカードが出て、「自宅向けの種目とコースをまとめて追加」ボタンがあり、`AIが今日のコースを提案` は出ない
- ボタンを押す → 「種目N件・コース7件を追加しました」が出て、コースボタンが7つ（`自宅 プッシュ` … `自宅 全身`）並び、ボタンは消える。`await (await import('/js/db.js')).getAll('exercises')` の全件が `homeOk === true`、`懸垂` と `ディップス` の `bodyweight === true`
- ジム環境に切り替える → コースボタンは同じ7つ＋既存コースのまま（ジム環境は絞らない）、`AIが今日のコースを提案` が出る
- 自宅環境に戻し、再度ボタンを出すためにコースを全削除して押し直しても、種目は重複しない（`getAll('exercises')` の名前が一意）。コースを残したまま2回押せないこと（ボタンがない）も確認する
- ジム環境のとき、ボタンは出ない
- 履歴: ジム用の種目（`homeOk:false`）の記録がある日をカレンダーで選ぶと、自宅環境でも種目名が `?` にならない

- [ ] **Step 10: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/views/home.js
git commit -m "$(cat <<'EOF'
feat: filter home course buttons and AI input by environment, add one-tap home pack

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 管理画面（コース・種目）

**Files:**
- Modify: `js/views/courses.js`
- Modify: `js/views/exercises.js`（全体を置き換える）

**Interfaces:**
- Consumes: `registerCoursePreset`（Task 3）、`getEnv` / `visibleExercises` / `courseAvailable` / `visibleCoursePresets`（Task 2）

- [ ] **Step 1: `js/views/courses.js` の import と冒頭を置き換える**

次の部分:

```js
import { mostUsedExerciseIds, matchExerciseNamesToIds } from '../lib/courses.js';
import { DEFAULT_COURSE_PRESETS, missingExerciseNames } from '../lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../lib/exercisePresets.js';

const COURSE_DEFAULT_EX = 4;

export async function renderCourses(el) {
  const exercises = await getAll('exercises');
  const sets = await getAll('sets');
```

を次に置き換える:

```js
import { mostUsedExerciseIds } from '../lib/courses.js';
import { DEFAULT_COURSE_PRESETS, registerCoursePreset } from '../lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../lib/exercisePresets.js';
import { getEnv, visibleExercises, courseAvailable, visibleCoursePresets } from '../lib/env.js';

const COURSE_DEFAULT_EX = 4;

export async function renderCourses(el) {
  const allExercises = await getAll('exercises');
  const env = getEnv();
  // コース作成の選択肢は環境で絞り、名前の解決には全種目を使う
  const exercises = visibleExercises(allExercises, env);
  const sets = await getAll('sets');
```

- [ ] **Step 2: 種目がないときの案内を置き換える**

`    el.querySelector('#course-slots').innerHTML = '<p class="muted">先に種目を登録してください。</p>';` を次に置き換える:

```js
    el.querySelector('#course-slots').innerHTML = allExercises.length
      ? '<p class="muted">自宅でできる種目がありません。上のプリセットからコースを作ると、種目も自動で登録されます。</p>'
      : '<p class="muted">先に種目を登録してください。</p>';
```

- [ ] **Step 3: コース一覧を絞り込む**

`renderCourseList` の中の次の2行:

```js
    const courses = await getAll('courses');
    const nameOf = (id) => exercises.find((e) => e.id === id)?.name || '?';
```

を次に置き換える:

```js
    const courses = (await getAll('courses')).filter((c) => courseAvailable(c, allExercises, env));
    const nameOf = (id) => allExercises.find((e) => e.id === id)?.name || '?';
```

- [ ] **Step 4: プリセットチップを環境で絞る**

`renderPresets` の中の `el.querySelector('#course-presets').innerHTML = DEFAULT_COURSE_PRESETS` を `el.querySelector('#course-presets').innerHTML = visibleCoursePresets(DEFAULT_COURSE_PRESETS, env)` に置き換える（続く `.map(...)` の行はそのまま）。

- [ ] **Step 5: プリセットからの作成を共通関数に置き換える**

`createFromPreset` の `try {` から `} catch (e) {` の直前までを次に置き換える（`presetBusy` の扱い・`catch`・`finally` はそのまま）:

```js
    try {
      // 未登録の種目は種目プリセットから補って登録する（homeOk / bodyweight も引き継ぐ）
      const { added } = await registerCoursePreset(preset, {
        getAll, put, uid, exercisePresets: DEFAULT_EXERCISE_PRESETS,
      });

      // 画面全体を作り直したあとにメッセージを入れる（再描画で消えないようにするため）
      await renderCourses(el);
      el.querySelector('#course-preset-msg').textContent = added
        ? `${preset.name}コースを作成しました（種目${added}件を追加）`
        : `${preset.name}コースを作成しました`;
    } catch (e) {
```

- [ ] **Step 6: `js/views/exercises.js` 全体を次の内容に置き換える**

```js
import { getAll, put, remove, uid } from '../db.js';
import { searchPresets } from '../lib/exercisePresets.js';
import { escapeHtml } from '../lib/html.js';
import { BODY_PARTS } from '../lib/constants.js';

export async function renderExercises(el) {
  const exercises = await getAll('exercises');
  let patterns = (await getAll('setPatterns')).map((p) => p.name);
  if (patterns.length === 0) patterns = ['通常'];
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
      <div class="field"><label>
        <input type="checkbox" id="ex-homeok" checked style="width:22px;height:22px;vertical-align:middle;margin-right:8px" />自宅でできる（自宅環境の選択・提案に出す）</label></div>
      <div class="field"><label>
        <input type="checkbox" id="ex-bw" style="width:22px;height:22px;vertical-align:middle;margin-right:8px" />自重種目（重量欄に体重が入る）</label></div>
      <div class="field"><label>セットパターン</label>
        <div class="seg" id="ex-pattern">
          ${patterns.map((p, i) => `<button data-p="${p}" class="${i === 0 ? 'sel' : ''}">${p}</button>`).join('')}
        </div></div>
      <div id="ex-error" class="error"></div>
      <button id="ex-save" class="btn btn-primary btn-block">種目を追加</button>
    </div>
    <div id="ex-list"></div>`;

  let pattern = patterns[0];
  el.querySelectorAll('#ex-pattern button').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('#ex-pattern button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      pattern = b.dataset.p;
    }));

  el.querySelector('#ex-search').addEventListener('input', (e) => {
    const results = searchPresets(e.target.value);
    el.querySelector('#ex-search-results').innerHTML = results.length
      ? results.map((p) => `<span class="chip chip-tag" data-preset-name="${escapeHtml(p.name)}" data-preset-part="${escapeHtml(p.bodyPart)}" data-preset-cat="${escapeHtml(p.category)}" data-preset-home="${p.homeOk !== false ? '1' : '0'}" data-preset-bw="${p.bodyweight ? '1' : '0'}">${escapeHtml(p.name)}</span>`).join('')
      : (e.target.value.trim() ? '<p class="muted">候補がありません。</p>' : '');
    el.querySelectorAll('#ex-search-results [data-preset-name]').forEach((chip) =>
      chip.addEventListener('click', () => {
        el.querySelector('#ex-name').value = chip.dataset.presetName;
        el.querySelector('#ex-cat').value = chip.dataset.presetCat;
        el.querySelector('#ex-detail').value = chip.dataset.presetPart.split('/').slice(1).join('/');
        el.querySelector('#ex-homeok').checked = chip.dataset.presetHome === '1';
        el.querySelector('#ex-bw').checked = chip.dataset.presetBw === '1';
        el.querySelector('#ex-search').value = '';
        el.querySelector('#ex-search-results').innerHTML = '';
      }));
  });

  el.querySelector('#ex-save').addEventListener('click', async () => {
    const name = el.querySelector('#ex-name').value.trim();
    const category = el.querySelector('#ex-cat').value;
    const detail = el.querySelector('#ex-detail').value.trim();
    const bodyPart = detail ? `${category}/${detail}` : category;
    const cuePresets = el.querySelector('#ex-cues').value
      .split(',').map((s) => s.trim()).filter(Boolean);
    const homeOk = el.querySelector('#ex-homeok').checked;
    const bodyweight = el.querySelector('#ex-bw').checked;
    if (!name) { el.querySelector('#ex-error').textContent = '種目名を入力してください'; return; }
    await put('exercises', { id: uid(), name, bodyPart, cuePresets, setPattern: pattern, category, homeOk, bodyweight });
    renderExercises(el);
  });

  renderList(el, exercises);
}

function renderList(el, exercises) {
  const list = el.querySelector('#ex-list');
  if (!exercises.length) {
    list.innerHTML = '<p class="muted">まだ種目がありません。</p>';
    return;
  }
  list.innerHTML = exercises.map((e) => `
    <div class="card">
      <div class="list-item" style="border:none;padding:0">
        <div>
          <strong>${escapeHtml(e.name)}</strong>
          <span class="muted"> ${escapeHtml(e.bodyPart || '')}</span>
          <div>${(e.cuePresets || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</div>
          <span class="chip">${escapeHtml(e.setPattern || '通常')}</span>
          <div style="margin-top:8px">
            <span class="chip chip-tag ${e.homeOk !== false ? 'sel' : ''}" role="button" data-toggle="homeOk" data-id="${e.id}">🏠 自宅可</span>
            <span class="chip chip-tag ${e.bodyweight ? 'sel' : ''}" role="button" data-toggle="bodyweight" data-id="${e.id}">自重</span>
          </div>
        </div>
        <button class="btn btn-danger btn-sm" data-del="${e.id}">削除</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await remove('exercises', b.dataset.del);
      renderExercises(el);
    }));
  // 「自宅可」「自重」のチップをタップして切り替える
  list.querySelectorAll('[data-toggle]').forEach((chip) =>
    chip.addEventListener('click', async () => {
      const ex = exercises.find((e) => e.id === chip.dataset.id);
      if (!ex) return;
      const key = chip.dataset.toggle;
      const current = key === 'homeOk' ? ex.homeOk !== false : ex.bodyweight === true;
      await put('exercises', { ...ex, [key]: !current });
      renderExercises(el);
    }));
}
```

- [ ] **Step 7: 構文チェックとテスト**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --check js/views/courses.js && node --check js/views/exercises.js && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 8: ブラウザで確認する**

DBを初期化する。管理タブで確認:
- **コース**（ジム環境）: プリセットチップが6つ（`胸・肩` `背中・腕` `脚` `胸のみ` `プッシュ` `プル`）。`自宅 …` は出ない。自宅環境に切り替えると7つ（`自宅 …`）だけになる
- 自宅環境で種目が0件のとき、コースのスロット欄に「先に種目を登録してください。」が出る（DBが空のため）。種目を `homeOk:false` のものだけ入れた状態では「自宅でできる種目がありません。上のプリセットからコースを作ると、種目も自動で登録されます。」が出る
- 自宅環境で `自宅 プル` チップをタップ → 「自宅 プルコースを作成しました（種目5件を追加）」。`getAll('exercises')` の `懸垂` が `homeOk:true, bodyweight:true`
- **種目**: 追加フォームに2つのチェック（「自宅でできる…」は初期オン、「自重種目…」は初期オフ）。プリセット検索で `懸垂` をタップ → 自重がオンになる。`ベンチプレス` をタップ → 自宅でできるがオフになる。保存すると `getAll('exercises')` に反映される
- 種目一覧のカードに `🏠 自宅可` と `自重` のチップ。`🏠 自宅可` をタップ → `homeOk` が反転して保存され、チップの見た目（`sel`）が変わる。`自重` も同様
- 自宅環境で、`homeOk:false` にした種目を含むコースが管理>コースの一覧から消える（ジム環境では出る）

- [ ] **Step 9: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/views/courses.js js/views/exercises.js
git commit -m "$(cat <<'EOF'
feat: filter course management by environment and edit homeOk/bodyweight per exercise

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 自重種目の体重自動入力と「プラス」の適用

**Files:**
- Modify: `js/views/workout/set-entry.js`
- Modify: `js/views/workout.js`

**Interfaces:**
- Consumes: `latestBodyWeight`（Task 2）、`parseSetUtterance` の `added`（Task 4）、Task 6 の `allExercises` / `exercises`
- Produces: `createSetEntry` の返り値に `setBaseWeight(bw: number|null): void` と `setHint(text: string): void`。`resetRows(false)` は行の重量の初期値に `baseWeight` を使う

- [ ] **Step 1: `set-entry.js` — 行の初期値に重量を渡せるようにする**

次の部分:

```js
function defaultRowValues(n) {
  return Array.from({ length: n }, () => ({ weight: 0, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }));
}
```

を次に置き換える:

```js
function defaultRowValues(n, weight = 0) {
  return Array.from({ length: n }, () => ({ weight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }));
}
```

- [ ] **Step 2: `set-entry.js` — 案内用の要素を足す**

`setEntryHtml` の中の次の部分:

```html
      <div id="w-rows" class="mt-2"></div>
```

の直前に次の1行を挿入する:

```html
      <div id="w-bw-hint" class="muted mt-1"></div>
```

- [ ] **Step 3: `set-entry.js` — `baseWeight` の状態を足す**

次の部分:

```js
  let mode = 'normal';
  let rowValues = defaultRowValues(DEFAULT_ROWS);
  let rowSteppers = [];
```

を次に置き換える:

```js
  let mode = 'normal';
  let rowValues = defaultRowValues(DEFAULT_ROWS);
  let rowSteppers = [];
  // 自重種目で重量欄に自動入力する体重（0 は自動入力なし）
  let baseWeight = 0;
```

- [ ] **Step 4: `set-entry.js` — `resetRows` を直し、`setBaseWeight` と `setHint` を足す**

次の部分:

```js
    resetRows: (keepWeights) => {
      rowValues = keepWeights
        ? rowValues.map((rv) => ({ weight: rv.weight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }))
        : defaultRowValues(DEFAULT_ROWS);
      renderRows();
    },
```

を次に置き換える:

```js
    resetRows: (keepWeights) => {
      rowValues = keepWeights
        ? rowValues.map((rv) => ({ weight: rv.weight, reps: 0, assistedReps: 0, assistOn: false, weightTouched: false }))
        : defaultRowValues(DEFAULT_ROWS, baseWeight);
      renderRows();
    },
    // 自重種目では直近の体重を重量欄に入れる。null / 0 で自動入力を解除する。
    // 手で変えた重量・音声で明示した重量（weightTouched）は消さない
    setBaseWeight: (bw) => {
      syncRowValuesFromSteppers();
      const next = bw > 0 ? bw : 0;
      if (baseWeight > 0) {
        for (const rv of rowValues) {
          if (rv.weight === baseWeight && !rv.weightTouched) rv.weight = 0;
        }
      }
      if (next > 0) {
        for (const rv of rowValues) {
          if (rv.weight === 0) rv.weight = next;
        }
      }
      baseWeight = next;
      renderRows();
    },
    setHint: (text) => {
      el.querySelector('#w-bw-hint').textContent = text;
    },
```

- [ ] **Step 5: `workout.js` — import を足す**

`import { getEnv, visibleExercises, courseAvailable } from '../lib/env.js';` の直後に追加:

```js
import { latestBodyWeight } from '../lib/bodyweight.js';
```

- [ ] **Step 6: `workout.js` — 体重を読み込む**

`  const todayWorkout = (await getAll('workouts')).find((w) => w.date === todayStr());` の直前に追加:

```js
  const bodyWeightNow = latestBodyWeight(await getAll('bodyWeights'));
```

- [ ] **Step 7: `workout.js` — 種目が変わったら体重を入れる**

次の1行:

```js
  const exPanel = createExercisePanel(el, { exercises, courses, prs });
```

を次に置き換える（`setEntry` はこの直後に作られるが、コールバックは `refresh()` からしか呼ばれず、最初の `refresh()` は `setEntry` の生成後なので参照できる）:

```js
  const exPanel = createExercisePanel(el, {
    exercises, courses, prs,
    // 自重種目では重量欄に直近の体重を入れる。種目が変わるたびに呼ばれる
    onExerciseChange: (exId) => {
      const ex = exercises.find((e) => e.id === exId);
      const isBodyweight = Boolean(ex && ex.bodyweight);
      setEntry.setBaseWeight(isBodyweight ? bodyWeightNow : null);
      setEntry.setHint(isBodyweight && !bodyWeightNow
        ? '体重が未登録です。重量欄に体重を入力してください' : '');
    },
  });
```

- [ ] **Step 8: `workout.js` — 音声の「プラス」を適用する**

`applyUtterance` の末尾にある次の部分:

```js
      const row = setEntry.fillNextRow({ weight: parsed.weight, reps: parsed.reps });
      if (row === null) {
        voiceStatus.textContent = '行がいっぱいです。記録してから続けてください';
        return;
      }
      const cur = exercises.find((e) => e.id === exPanel.currentExerciseId());
      const parts = [
        cur ? cur.name : null,
        parsed.weight !== null ? `${parsed.weight}kg` : null,
        parsed.reps !== null ? `${parsed.reps}回` : null,
      ].filter(Boolean);
      voiceStatus.textContent = `セット${row + 1}: ${parts.join(' / ')} を入力しました`;
```

を次に置き換える:

```js
      const cur = exercises.find((e) => e.id === exPanel.currentExerciseId());
      // 自重種目の「プラス◯キロ」は体重への上乗せ。体重が取れないときは数値をそのまま重量にする
      let weight = parsed.weight;
      let weightLabel = parsed.weight !== null ? `${parsed.weight}kg` : null;
      let tail = '';
      if (parsed.added && parsed.weight !== null && cur && cur.bodyweight) {
        if (bodyWeightNow) {
          weight = Math.round((bodyWeightNow + parsed.weight) * 100) / 100;
          weightLabel = `体重＋${parsed.weight}kg`;
        } else {
          tail = `（体重が未登録のため、${parsed.weight}kgをそのまま入力しました）`;
        }
      }
      const row = setEntry.fillNextRow({ weight, reps: parsed.reps });
      if (row === null) {
        voiceStatus.textContent = '行がいっぱいです。記録してから続けてください';
        return;
      }
      const parts = [
        cur ? cur.name : null,
        weightLabel,
        parsed.reps !== null ? `${parsed.reps}回` : null,
      ].filter(Boolean);
      voiceStatus.textContent = `セット${row + 1}: ${parts.join(' / ')} を入力しました${tail}`;
```

- [ ] **Step 9: 構文チェックとテスト**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && node --check js/views/workout/set-entry.js && node --check js/views/workout.js && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 10: ブラウザで確認する**

DBを初期化し、次を投入して再読み込みする:

```js
const db = await import('/js/db.js');
await db.put('exercises', { id: 'bw1', name: '懸垂', bodyPart: '背中/広背筋', category: '背中', cuePresets: [], setPattern: '通常', homeOk: true, bodyweight: true });
await db.put('exercises', { id: 'bw2', name: 'ディップス', bodyPart: '胸/下部', category: '胸', cuePresets: [], setPattern: '通常', homeOk: true, bodyweight: true });
await db.put('exercises', { id: 'n1', name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', cuePresets: [], setPattern: '通常', homeOk: true, bodyweight: false });
await db.put('bodyWeights', { id: 'b1', date: '2026-10-01', weight: 70 });
await db.put('bodyWeights', { id: 'b2', date: '2026-10-05', weight: 69.5 });
location.reload();
```

行の値を読む補助:

```js
const rows = () => [...document.querySelectorAll('#w-rows .stepper-input')].map((i) => i.value);
```

（重量・回数が交互に並ぶ。重量は偶数番目）

確認（自宅環境、記録タブ）:
1. 種目セレクトで `懸垂` を選ぶ（`#w-ex` の value を `bw1` にして `change` を発火）→ 3行すべての重量欄が `69.5`、回数は空。保存ボタンは回数だけ入れれば成功する（回数 `8` を入れて保存 → `getAll('sets')` に `weight:69.5, reps:8`）
2. 保存後、次の3行にも重量 `69.5` が入った状態に戻る
3. `ダンベルカール` に切り替える → 自動入力された `69.5` が消え、重量欄が空に戻る
4. 再度 `懸垂` を選び、セット1の重量を `74.5` に直す → 触っていない後続行が `74.5` に追従する（既存挙動）
5. `bodyWeights` を空にして `懸垂` を選ぶ → 重量欄は空のまま、`#w-bw-hint` に「体重が未登録です。重量欄に体重を入力してください」が出る。`ダンベルカール` に切り替えると案内が消える
6. 音声スタブ（下記）で:
   - 「ディップス プラス10キロ 8回」→ 種目が `ディップス` に切り替わり、セット1が重量 `79.5`・回数 `8`、ステータスが「セット1: ディップス / 体重＋10kg / 8回 を入力しました」
   - 続けて「ディップス 8回」→ セット2が重量 `69.5`（体重のまま）・回数 `8`
   - `ダンベルカール` に切り替えたあと「ダンベルカール プラス5キロ 10回」→ 重量 `5`（自重でないので `added` は無視）
   - 体重未登録で「懸垂 プラス10キロ 8回」→ 重量 `10`、ステータス末尾に「（体重が未登録のため、10kgをそのまま入力しました）」
7. 通常モード→スーパーセット→通常モードと往復しても、行の値が壊れない

音声スタブ（記録タブを開いたあと、`#w-voice-btn` をクリックしてから発話を流す。**`SpeechRecognition` と `webkitSpeechRecognition` の両方を差し替える**。ブラウザ側にネイティブの `SpeechRecognition` があり、`webkit` だけ差し替えても使われない）:

```js
class FakeRec { start() { FakeRec.last = this; } abort() {} stop() {} }
window.SpeechRecognition = FakeRec;
window.webkitSpeechRecognition = FakeRec;
// 差し替えたあと、記録タブを開き直す（navigate で再描画する）
const say = (t) => FakeRec.last.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] });
// 使い方: #w-voice-btn をクリック → say('ディップス プラス10キロ 8回')
```

- [ ] **Step 11: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add js/views/workout/set-entry.js js/views/workout.js
git commit -m "$(cat <<'EOF'
feat: prefill body weight for bodyweight exercises and apply spoken plus-weights

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: キャッシュ更新と通し確認

**Files:**
- Modify: `sw.js`（`CACHE` のみ）

- [ ] **Step 1: キャッシュ名を更新する**

`const CACHE = 'gachi-fit-v26';` を `const CACHE = 'gachi-fit-v27';` に置き換える。

- [ ] **Step 2: `ASSETS` が実ファイルと一致することを確認する**

Run:
```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
node --check sw.js
for f in $(find js -name '*.js' | sort); do grep -q "'$f'" sw.js || echo "MISSING in ASSETS: $f"; done
echo done
```
Expected: `MISSING in ASSETS:` の行が出ない（`done` だけ）

- [ ] **Step 3: 全テスト**

Run: `cd /Users/taichi/gachi-fit/.worktrees/home-foundation && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 4: 通しでブラウザ確認する**

DBを初期化し、新規利用者の流れで確認する:
1. ジム環境のまま、ホーム・記録・管理が従来どおり表示される（初期環境が `gym`、切替ボタンの `ジム` が `sel`）
2. `自宅` に切り替え → ホームに「自宅向けの種目とコースをまとめて追加」ボタン。押すと種目とコース7件が入る
3. `自宅 プル` を選んで記録タブへ → コース内の種目ボタンに `懸垂` `チンアップ` …。`懸垂` を選ぶと体重が入る（体重を `管理`/`分析` 側の体重登録で先に入れておく）
4. ジム環境に切り替えると、同じ種目が全部出る。履歴・PRは両環境で同じ
5. 375×667 で、ヘッダー・記録タブ・ホームに横スクロールがない（`document.documentElement.scrollWidth <= innerWidth`）。確認後 `resize_window` の `desktop` に戻す
6. `read_console_messages`（`onlyErrors: true`）にエラーがない

- [ ] **Step 5: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/home-foundation
git add sw.js
git commit -m "$(cat <<'EOF'
chore: PWA cache v27 for the home training foundation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review（計画の作成者による確認）

**1. 仕様の網羅**

| 仕様の項目 | タスク |
|---|---|
| データモデル（`homeOk` / `bodyweight` / `training_env`） | Task 1, 2 |
| ① `visibleExercises` / `courseAvailable` / `visibleCoursePresets` / `getEnv` / `setEnv` | Task 2 |
| ① ヘッダーの切替UI（40px以上・375px） | Task 5 |
| ① 絞り込みの適用（記録・ホーム・管理>コース） | Task 6, 7, 8 |
| ① 自宅で0件のときの案内（記録タブ） | Task 6 |
| ① 既存種目の印付け（起動時1回） | Task 2（関数）, Task 5（起動時の呼び出し） |
| ① 管理>種目のチェックとチップ | Task 8 |
| ① 一括追加ボタンとカード表示条件の拡張 | Task 7 |
| ① `registerCoursePreset` の切り出し | Task 3, Task 8 |
| ② `latestBodyWeight` | Task 2 |
| ② `setBaseWeight` / `resetRows` / `onExerciseChange` / 体重未登録の案内 | Task 9 |
| ② 音声の `added` と適用（体重未登録時の文言を含む） | Task 4, Task 9 |
| ③ 種目プリセット（28件への印、新規22件）、コースプリセット（`env`、新規7件） | Task 1 |
| AI提案（プロンプト変更なし、入力を絞る） | Task 7（`exercises` を絞り込み後にしたことで成立） |
| `sw.js`（新規3ファイル、v27） | Task 2（ASSETS）, Task 10（CACHE） |
| テスト（env / exerciseMeta / bodyweight / voiceParse / プリセット整合性） | Task 1〜4 |

**仕様との意図的な差異**: 体重未登録の案内を、仕様書の「音声ステータス欄」ではなく、専用の `#w-bw-hint` に出す。音声が使えない環境でも案内が見えるようにするため。

**2. プレースホルダ確認**: 「TBD」「適宜」「同様に」はない。コード手順にはすべてコードを載せた。Task 6 Step 4 の3か所置換は、件数を確認するコマンドを添えた。

**3. 型・名前の一致**: `allExercises` / `exercises`（Task 6 → 7, 8, 9）、`setBaseWeight(bw)` / `setHint(text)`（Task 9 内で定義と使用が一致）、`registerCoursePreset(preset, { getAll, put, uid, exercisePresets })` と `registerHomeCoursePack(deps)`（Task 3 → 7, 8 の呼び出しが同じ依存オブジェクト）、`added`（Task 4 → 9）、`bodyWeights`（ストア名、Wが大文字）。
