# キャラクター育成（ジムモン） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 週2回×30分以上のトレーニングを続けるとモンスターが進化し、サボると弱くなる育成機能を、ホームの最上部に加える。

**Architecture:** 強さ・段階・気分は保存せず、`workouts` / `sets` / 開始週 / お休み週から純粋関数 `computeCreature` で毎回計算する。保存するのは既存の `goals` ストアの1件（開始週・お休み週・最後に見た段階）だけ。絵は外部画像を使わず、純粋関数 `monsterSvg` が返すインラインSVG。

**Tech Stack:** Vanilla JS（ES modules・ビルドなし）、IndexedDB、Service Worker、`node --test`

**Spec:** `docs/superpowers/specs/2026-10-13-creature-growth-design.md`

**前提:** 「自宅の土台」（`docs/superpowers/plans/2026-10-06-home-training-foundation.md`）が main にマージ済みで、`sw.js` のキャッシュ名が `gachi-fit-v27`、`js/views/home.js` に `allExercises`・`workouts`・`sets` の変数があること。

## Global Constraints

- ビルドなし・ES modules。純粋関数は `node:test` で単体テストし、`npm test`（= `node --test`）が全件PASSすること
- IndexedDB のストア構成・`DB_VERSION`（4）は変えない。保存は `goals` ストアの `{ id: 'creature', startWeek, restWeeks, lastSeenStage }` の1件だけ
- 週は月曜始まり。日付は `workout.date`（ローカル `YYYY-MM-DD`）で扱い、UTC変換しない。日付の文字列比較は ISO 形式なので辞書順でよい
- 定数は `js/lib/creature.js` に集約する: `WEEKLY_GOAL=2`、`SESSION_MIN=30`、`LEAD_IN_MIN=5`、`START_POWER=10`、`GAIN_FULL=10`、`LOSS_ONE=5`、`LOSS_ZERO=15`、`BONUS_PER_EVENT=2`、`MAX_EVENTS=3`、`BW_TOLERANCE=3`
- 強さは 0〜100 に丸める。段階の下限は `[0, 10, 30, 50, 70, 90]`、名前は `['たまご','ベビー','こども','ヤング','マッスル','レジェンド']`
- 今週（未終了の週）は強さを動かさない。開始週より前の記録は増減に使わない（自己ベスト更新の比較対象には全履歴を使う）
- 新規JSファイルは `sw.js` の `ASSETS` に必ず追加する。最終タスクでキャッシュ名を `gachi-fit-v28` にする
- 操作ボタンの高さは 40px 以上。375px 幅で横スクロールを出さない
- UI文言は計画書の文字列をそのまま使う（日本語）
- コミットメッセージの末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける

## 作業環境

コントローラーが `git worktree add .worktrees/creature -b creature` で作業ツリーを作る。実装者は `/Users/taichi/gachi-fit/.worktrees/creature` で作業する。

**ブラウザ確認の共通手順**:

```bash
cd /Users/taichi/gachi-fit/.worktrees/creature && python3 -m http.server 8124
```

`preview_start` に `{"url":"http://localhost:8124"}` を渡して開く。このブラウザペインは Service Worker を登録できないが環境の制約であり不具合ではない。スクリーンショットは空白になることがあるので、`get_page_text` / `read_page` / `javascript_tool` で確認する。DBの初期化:

```js
for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name);
localStorage.clear();
location.reload();
```

## タスク依存

Task 1 と Task 2 は独立 → Task 3（Task 1・2 を使う）

---

### Task 1: 育成の計算（純粋関数）

**Files:**
- Create: `js/lib/creature.js`
- Test: `test/creature.test.js`

**Interfaces:**
- Consumes: `estimate1RM(weight, reps)`（`js/lib/calc.js`）、`localDateStr(date)`（`js/lib/localdate.js`）
- Produces:
  - 定数（上記）と `STAGE_NAMES`
  - `addDays(dateStr, n): string`、`weekStart(dateStr): string`、`daysLeftInWeek(dateStr): number`
  - `stageFor(power): number`、`nextEvolutionIn(power): number|null`
  - `sessionMinutes(sets, workouts): number`
  - `buildSessions(workouts, sets): { date, minutes, qualifies }[]`（日付昇順）
  - `progressExerciseIds(datedSets, exercises, weekStartStr): string[]`（`datedSets` の各要素は `date` を持つ）
  - `computeCreature({ workouts, sets, exercises, startWeek, restWeeks, today }): Creature`
    - `Creature = { power, stage, mood, weeks, current }`、`mood` は `'genki'|'normal'|'shobori'`
    - `Week = { weekStart, rest, closed, sessions, qualified, events, delta }`、`weeks` は開始週から今週まで昇順、`current` は最後の要素

- [ ] **Step 1: 失敗するテストを書く**

`test/creature.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekStart, addDays, daysLeftInWeek, stageFor, nextEvolutionIn, sessionMinutes, buildSessions,
  progressExerciseIds, computeCreature, STAGE_NAMES,
} from '../js/lib/creature.js';

const MIN = 60000;
const T0 = 1_760_000_000_000;

// ---- 日付 ----

test('weekStart returns the Monday of the week', () => {
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // 月
  assert.equal(weekStart('2026-10-08'), '2026-10-05'); // 木
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // 日
  assert.equal(weekStart('2026-10-12'), '2026-10-12'); // 次の月
});

test('weekStart crosses month and year boundaries', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
});

test('addDays moves across month and year boundaries and backwards', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-10-05', -1), '2026-10-04');
});

test('daysLeftInWeek counts today and the rest of the week', () => {
  assert.equal(daysLeftInWeek('2026-10-05'), 7); // 月
  assert.equal(daysLeftInWeek('2026-10-08'), 4); // 木
  assert.equal(daysLeftInWeek('2026-10-11'), 1); // 日
});

// ---- 段階 ----

test('stageFor maps power to stage at every boundary', () => {
  const cases = [[0, 0], [9, 0], [10, 1], [29, 1], [30, 2], [49, 2], [50, 3], [69, 3], [70, 4], [89, 4], [90, 5], [100, 5]];
  for (const [power, stage] of cases) assert.equal(stageFor(power), stage, `power ${power}`);
});

test('STAGE_NAMES has one name per stage', () => {
  assert.deepEqual(STAGE_NAMES, ['たまご', 'ベビー', 'こども', 'ヤング', 'マッスル', 'レジェンド']);
});

test('nextEvolutionIn returns the points to the next stage, or null at the top', () => {
  assert.equal(nextEvolutionIn(10), 20);
  assert.equal(nextEvolutionIn(29), 1);
  assert.equal(nextEvolutionIn(0), 10);
  assert.equal(nextEvolutionIn(90), null);
  assert.equal(nextEvolutionIn(100), null);
});

// ---- 所要時間 ----

test('sessionMinutes prefers the manually entered duration', () => {
  assert.equal(sessionMinutes([{ createdAt: 0 }], [{ durationSec: 2400 }]), 40);
});

test('sessionMinutes takes the longest manual duration when a day has several workouts', () => {
  assert.equal(sessionMinutes([{ createdAt: 0 }], [{ durationSec: 600 }, { durationSec: 2400 }]), 40);
});

test('sessionMinutes estimates from the first and last set plus the lead-in', () => {
  const sets = [{ createdAt: 0 }, { createdAt: 10 * MIN }, { createdAt: 25 * MIN }];
  assert.equal(sessionMinutes(sets, [{}]), 30);
});

test('sessionMinutes of a single set is just the lead-in', () => {
  assert.equal(sessionMinutes([{ createdAt: 123456 }], [{}]), 5);
});

test('sessionMinutes ignores a zero or missing manual duration', () => {
  assert.equal(sessionMinutes([{ createdAt: 0 }, { createdAt: 20 * MIN }], [{ durationSec: 0 }, {}]), 25);
});

// ---- トレーニングした日 ----

test('buildSessions groups sets by the date of their workout and judges the 30 minute threshold', () => {
  const workouts = [{ id: 'a', date: '2026-10-06' }, { id: 'b', date: '2026-10-07' }];
  const sets = [
    { workoutId: 'a', createdAt: 0 }, { workoutId: 'a', createdAt: 25 * MIN }, // 30分
    { workoutId: 'b', createdAt: 0 }, { workoutId: 'b', createdAt: 24 * MIN }, // 29分
  ];
  assert.deepEqual(buildSessions(workouts, sets), [
    { date: '2026-10-06', minutes: 30, qualifies: true },
    { date: '2026-10-07', minutes: 29, qualifies: false },
  ]);
});

test('buildSessions merges two workouts on the same date', () => {
  const workouts = [{ id: 'a', date: '2026-10-06' }, { id: 'b', date: '2026-10-06' }];
  const sets = [{ workoutId: 'a', createdAt: 0 }, { workoutId: 'b', createdAt: 30 * MIN }];
  const out = buildSessions(workouts, sets);
  assert.equal(out.length, 1);
  assert.equal(out[0].minutes, 35);
});

test('buildSessions ignores workouts without sets and sets of unknown workouts', () => {
  const workouts = [{ id: 'a', date: '2026-10-06' }];
  assert.deepEqual(buildSessions(workouts, []), []);
  assert.deepEqual(buildSessions(workouts, [{ workoutId: 'zzz', createdAt: 0 }]), []);
});

test('buildSessions returns the days in ascending order', () => {
  const workouts = [{ id: 'b', date: '2026-10-09' }, { id: 'a', date: '2026-10-06' }];
  const sets = [{ workoutId: 'b', createdAt: 0 }, { workoutId: 'a', createdAt: 0 }];
  assert.deepEqual(buildSessions(workouts, sets).map((s) => s.date), ['2026-10-06', '2026-10-09']);
});

// ---- 自己ベスト更新 ----

const ds = (date, exerciseId, weight, reps, assistedReps = 0) => ({ date, exerciseId, weight, reps, assistedReps });
const WS = '2026-10-12';

test('progressExerciseIds ignores an exercise that has no earlier record', () => {
  assert.deepEqual(progressExerciseIds([ds('2026-10-13', 'x', 60, 8)], [{ id: 'x' }], WS), []);
});

test('progressExerciseIds ignores an exercise with no set in the week', () => {
  assert.deepEqual(progressExerciseIds([ds('2026-10-06', 'x', 60, 8)], [{ id: 'x' }], WS), []);
});

test('progressExerciseIds detects an estimated 1RM improvement', () => {
  const sets = [ds('2026-10-06', 'x', 60, 8), ds('2026-10-13', 'x', 65, 8)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), ['x']);
});

test('progressExerciseIds does not count an identical set', () => {
  const sets = [ds('2026-10-06', 'x', 60, 8), ds('2026-10-13', 'x', 60, 8)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), []);
});

test('progressExerciseIds detects more reps at the same weight even when the 1RM does not improve', () => {
  // 30kg×11 の推定1RMは41で、過去の 40kg×3（44）には届かない。回数だけが更新
  const sets = [ds('2026-10-06', 'x', 30, 10), ds('2026-10-06', 'x', 40, 3), ds('2026-10-13', 'x', 30, 11)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), ['x']);
});

test('progressExerciseIds does not count a lighter set that a heavier earlier set beats on reps', () => {
  const sets = [ds('2026-10-06', 'x', 40, 12), ds('2026-10-13', 'x', 30, 10)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), []);
});

test('progressExerciseIds subtracts assisted reps before comparing', () => {
  const sets = [ds('2026-10-06', 'x', 60, 8), ds('2026-10-13', 'x', 60, 9, 3)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), []);
});

test('progressExerciseIds ignores a body weight gain on a bodyweight exercise', () => {
  // 体重が69→70kgになっただけ（回数は同じ）
  const sets = [ds('2026-10-06', 'bw', 69, 8), ds('2026-10-13', 'bw', 70, 8)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'bw', bodyweight: true }], WS), []);
});

test('progressExerciseIds detects more reps on a bodyweight exercise despite a small weight change', () => {
  const sets = [ds('2026-10-06', 'bw', 69, 8), ds('2026-10-13', 'bw', 70, 9)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'bw', bodyweight: true }], WS), ['bw']);
});

test('progressExerciseIds detects added weight on a bodyweight exercise', () => {
  const sets = [ds('2026-10-06', 'bw', 69, 8), ds('2026-10-13', 'bw', 79, 8)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'bw', bodyweight: true }], WS), ['bw']);
});

test('progressExerciseIds treats a set on the first day of the week as in-week, and the day before as earlier', () => {
  const sets = [ds('2026-10-11', 'x', 60, 8), ds('2026-10-12', 'x', 65, 8)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), ['x']);
});

// ---- 育成の計算 ----

let seq = 0;
const EXERCISES = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'].map((id) => ({ id }));

// その日に所要 minutes 分（5以上）のトレーニングを1回作る。e1 を 50kg×10 で2セット。
// extra は { exerciseId, weight, reps } の追加セット（最初のセットと同時刻）
function mk(date, minutes, extra = []) {
  const id = `w${seq++}`;
  const base = { workoutId: id, assistedReps: 0 };
  return {
    workout: { id, date },
    sets: [
      { ...base, id: `${id}a`, exerciseId: 'e1', weight: 50, reps: 10, createdAt: T0 },
      { ...base, id: `${id}b`, exerciseId: 'e1', weight: 50, reps: 10, createdAt: T0 + (minutes - 5) * MIN },
      ...extra.map((x, i) => ({ ...base, id: `${id}x${i}`, createdAt: T0, ...x })),
    ],
  };
}
const build = (items) => ({ workouts: items.map((i) => i.workout), sets: items.flatMap((i) => i.sets) });
const run = (items, args) => computeCreature({ ...build(items), exercises: EXERCISES, restWeeks: [], ...args });

test('computeCreature starts at the starting power and does not move during the first week', () => {
  const c = run([], { startWeek: '2026-10-05', today: '2026-10-07' });
  assert.equal(c.power, 10);
  assert.equal(c.stage, 1);
  assert.equal(c.weeks.length, 1);
  assert.equal(c.current.closed, false);
  assert.equal(c.current.delta, 0);
  assert.equal(c.mood, 'normal');
});

test('computeCreature gains power for each week that reached the goal', () => {
  const items = [mk('2026-10-06', 40), mk('2026-10-09', 35), mk('2026-10-13', 40), mk('2026-10-16', 40)];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-19' });
  assert.equal(c.power, 30);
  assert.equal(c.stage, 2);
  assert.equal(c.mood, 'genki');
  assert.equal(c.weeks.length, 3);
  assert.deepEqual(c.weeks.map((w) => w.weekStart), ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.deepEqual(c.weeks.map((w) => w.closed), [true, true, false]);
  assert.equal(c.weeks[0].delta, 10);
  assert.equal(c.current, c.weeks[2]);
});

test('computeCreature loses a little for a week with one qualifying day', () => {
  const c = run([mk('2026-10-06', 40)], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(c.power, 5);
  assert.equal(c.weeks[0].delta, -5);
  assert.equal(c.mood, 'normal');
});

test('computeCreature loses a lot for a week with no qualifying day, and floors at zero', () => {
  const c = run([], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(c.power, 0);
  assert.equal(c.stage, 0);
  assert.equal(c.mood, 'shobori');
});

test('computeCreature does not count a short day as qualifying', () => {
  const c = run([mk('2026-10-06', 29), mk('2026-10-08', 29)], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(c.weeks[0].qualified, 0);
  assert.equal(c.weeks[0].delta, -15);
  assert.equal(c.weeks[0].sessions.length, 2);
});

test('computeCreature counts exactly 30 minutes as qualifying', () => {
  const c = run([mk('2026-10-06', 30), mk('2026-10-08', 30)], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(c.weeks[0].qualified, 2);
});

test('computeCreature adds a bonus for an exercise that set a personal best', () => {
  const items = [
    mk('2026-10-06', 40, [{ exerciseId: 'e2', weight: 50, reps: 10 }]), mk('2026-10-09', 40),
    mk('2026-10-13', 40, [{ exerciseId: 'e2', weight: 50, reps: 12 }]), mk('2026-10-16', 40),
  ];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-19' });
  assert.deepEqual(c.weeks[0].events, []);
  assert.deepEqual(c.weeks[1].events, ['e2']);
  assert.equal(c.weeks[1].delta, 12);
  assert.equal(c.power, 32);
});

test('computeCreature caps the bonus at three exercises', () => {
  const ids = ['e3', 'e4', 'e5', 'e6', 'e7'];
  const items = [
    mk('2026-10-06', 40, ids.map((exerciseId) => ({ exerciseId, weight: 50, reps: 10 }))), mk('2026-10-09', 40),
    mk('2026-10-13', 40, ids.map((exerciseId) => ({ exerciseId, weight: 50, reps: 11 }))), mk('2026-10-16', 40),
  ];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-19' });
  assert.equal(c.weeks[1].events.length, 5);
  assert.equal(c.weeks[1].delta, 16);
  assert.equal(c.power, 36);
});

test('computeCreature gives no bonus in a week without a qualifying day', () => {
  const items = [
    mk('2026-10-06', 40, [{ exerciseId: 'e2', weight: 50, reps: 10 }]), mk('2026-10-09', 40),
    mk('2026-10-13', 5, [{ exerciseId: 'e2', weight: 60, reps: 10 }]),
  ];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-19' });
  assert.deepEqual(c.weeks[1].events, ['e2']);
  assert.equal(c.weeks[1].delta, -15);
  assert.equal(c.power, 5);
});

test('computeCreature gives the same gain for three qualifying days as for two', () => {
  const items = [mk('2026-10-06', 40), mk('2026-10-08', 40), mk('2026-10-10', 40)];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(c.weeks[0].qualified, 3);
  assert.equal(c.power, 20);
});

test('computeCreature leaves power alone in a rest week and skips it when judging the mood', () => {
  const c = run([], { startWeek: '2026-10-05', today: '2026-10-12', restWeeks: ['2026-10-05'] });
  assert.equal(c.power, 10);
  assert.equal(c.weeks[0].rest, true);
  assert.equal(c.weeks[0].delta, 0);
  assert.equal(c.mood, 'normal');
});

test('computeCreature clamps power at 100', () => {
  const items = [];
  for (let k = 0; k < 10; k++) {
    const ws = addDays('2026-07-27', k * 7);
    items.push(mk(addDays(ws, 1), 40), mk(addDays(ws, 3), 40));
  }
  const c = run(items, { startWeek: '2026-07-27', today: '2026-10-05' });
  assert.equal(c.power, 100);
  assert.equal(c.stage, 5);
});

test('computeCreature ignores records before the start week', () => {
  const items = [mk('2026-10-06', 40), mk('2026-10-08', 40)];
  const c = run(items, { startWeek: '2026-10-12', today: '2026-10-19' });
  assert.equal(c.weeks[0].weekStart, '2026-10-12');
  assert.equal(c.weeks[0].sessions.length, 0);
  assert.equal(c.power, 0);
});

test('computeCreature is happy when the current week already reached the goal', () => {
  const items = [mk('2026-10-13', 40), mk('2026-10-14', 40)];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-15' });
  assert.equal(c.power, 0); // 1週目が0回で下がり、今週はまだ動かない
  assert.equal(c.mood, 'genki');
});

test('computeCreature takes the mood from the last closed non-rest week otherwise', () => {
  const one = run([mk('2026-10-06', 40)], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(one.mood, 'normal');
  const none = run([], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.equal(none.mood, 'shobori');
});

test('computeCreature treats a start week in the future as the current week', () => {
  const c = run([], { startWeek: '2026-12-07', today: '2026-10-07' });
  assert.equal(c.weeks.length, 1);
  assert.equal(c.weeks[0].weekStart, '2026-10-05');
  assert.equal(c.power, 10);
});

test('computeCreature lists the sessions of each week with their minutes', () => {
  const c = run([mk('2026-10-06', 38), mk('2026-10-09', 24)], { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.deepEqual(c.weeks[0].sessions, [
    { date: '2026-10-06', minutes: 38, qualifies: true },
    { date: '2026-10-09', minutes: 24, qualifies: false },
  ]);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/creature && node --test test/creature.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)|Cannot find" | head`
Expected: `js/lib/creature.js` が見つからず FAIL

- [ ] **Step 3: `js/lib/creature.js` を実装する**

```js
// キャラクター育成の計算（すべて純粋関数）。
// 強さ・段階・気分は保存せず、履歴（workouts / sets）・開始週・お休み週から毎回計算する。
import { estimate1RM } from './calc.js';
import { localDateStr } from './localdate.js';

// ---- 調整用の定数（ルールを変えるときはここだけ直す） ----
export const WEEKLY_GOAL = 2;       // 週の目標回数
export const SESSION_MIN = 30;      // 達成とみなす所要時間（分）
export const LEAD_IN_MIN = 5;       // 自動推定に足す分（最初の種目をやっている間は記録が出ないため）
export const START_POWER = 10;      // 開始時の強さ（ベビー）
export const GAIN_FULL = 10;        // 目標回数を達成した週の増加
export const LOSS_ONE = 5;          // 1回だけの週の減少
export const LOSS_ZERO = 15;        // 0回の週の減少
export const BONUS_PER_EVENT = 2;   // 自己ベスト更新1種目あたりの加点
export const MAX_EVENTS = 3;        // 1週に加点する更新種目数の上限
export const BW_TOLERANCE = 3;      // 自重種目で「同じ重量以上」を判定するときの許容（kg）

export const STAGE_NAMES = ['たまご', 'ベビー', 'こども', 'ヤング', 'マッスル', 'レジェンド'];
const STAGE_FLOORS = [0, 10, 30, 50, 70, 90];

const num = (v) => Number(v) || 0;

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

// 月曜=0 … 日曜=6
function weekdayIndex(dateStr) {
  return (parseDate(dateStr).getDay() + 6) % 7;
}

// その日を含む週の月曜
export function weekStart(dateStr) {
  return addDays(dateStr, -weekdayIndex(dateStr));
}

// 今日を含む、その週の残り日数（月曜は7、日曜は1）
export function daysLeftInWeek(dateStr) {
  return 7 - weekdayIndex(dateStr);
}

export function stageFor(power) {
  let stage = 0;
  for (let i = 0; i < STAGE_FLOORS.length; i++) {
    if (power >= STAGE_FLOORS[i]) stage = i;
  }
  return stage;
}

// 次の進化までの残り（最高段階では null）
export function nextEvolutionIn(power) {
  const stage = stageFor(power);
  return stage >= STAGE_FLOORS.length - 1 ? null : STAGE_FLOORS[stage + 1] - power;
}

// 1日分のセット（createdAt を持つ）とその日の workout 群から所要時間（分）を返す。
// 手入力の所要時間があれば最大値を優先し、なければ最初と最後のセット保存の間隔 + LEAD_IN_MIN
export function sessionMinutes(sets, workouts) {
  const manual = Math.max(0, ...workouts.map((w) => num(w.durationSec)));
  if (manual > 0) return manual / 60;
  if (!sets.length) return 0;
  const times = sets.map((s) => num(s.createdAt));
  return (Math.max(...times) - Math.min(...times)) / 60000 + LEAD_IN_MIN;
}

// セットのある日ごとの所要時間と、達成したか。日付昇順
export function buildSessions(workouts, sets) {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const byDate = new Map();
  for (const w of workouts) {
    if (!byDate.has(w.date)) byDate.set(w.date, { sets: [], workouts: [] });
    byDate.get(w.date).workouts.push(w);
  }
  for (const s of sets) {
    const date = dateOf.get(s.workoutId);
    if (date !== undefined) byDate.get(date).sets.push(s);
  }
  const out = [];
  for (const [date, g] of byDate) {
    if (!g.sets.length) continue;
    const minutes = sessionMinutes(g.sets, g.workouts);
    out.push({ date, minutes, qualifies: minutes >= SESSION_MIN });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ある週（weekStartStr から7日間）に自己ベストを更新した種目のID。
// datedSets は date を持つ全セット。その週より前に記録がない種目は対象外
export function progressExerciseIds(datedSets, exercises, weekStartStr) {
  const weekEnd = addDays(weekStartStr, 6);
  const bodyweightIds = new Set(exercises.filter((e) => e.bodyweight).map((e) => e.id));
  const netReps = (s) => num(s.reps) - num(s.assistedReps);
  const oneRM = (s) => estimate1RM(num(s.weight), netReps(s));

  const byExercise = new Map();
  for (const s of datedSets) {
    if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, { prior: [], week: [] });
    const g = byExercise.get(s.exerciseId);
    if (s.date < weekStartStr) g.prior.push(s);
    else if (s.date <= weekEnd) g.week.push(s);
  }

  const out = [];
  for (const [id, g] of byExercise) {
    if (!g.prior.length || !g.week.length) continue;
    const tol = bodyweightIds.has(id) ? BW_TOLERANCE : 0;
    const priorBest = Math.max(...g.prior.map(oneRM));
    const priorMaxWeight = Math.max(...g.prior.map((p) => num(p.weight)));
    // (a) 推定1RMの更新。自重種目は、ウェイトを足したときだけ有効（体重の増減を成長と誤判定しない）
    const improved1RM = g.week.some((s) =>
      oneRM(s) > priorBest && (tol === 0 || num(s.weight) > priorMaxWeight + tol));
    // (b) 同じ重量以上での最大回数の更新
    const improvedReps = g.week.some((s) => {
      const comparable = g.prior.filter((p) => num(p.weight) >= num(s.weight) - tol);
      return comparable.length > 0 && netReps(s) > Math.max(...comparable.map(netReps));
    });
    if (improved1RM || improvedReps) out.push(id);
  }
  return out;
}

// 今週が目標達成済みなら元気。そうでなければ、直近の終了した非お休み週の結果で決める
function moodFor(weeks) {
  const current = weeks[weeks.length - 1];
  if (current.qualified >= WEEKLY_GOAL) return 'genki';
  for (let i = weeks.length - 2; i >= 0; i--) {
    const w = weeks[i];
    if (w.rest) continue;
    if (w.qualified >= WEEKLY_GOAL) return 'genki';
    return w.qualified === 1 ? 'normal' : 'shobori';
  }
  return 'normal';
}

// 履歴から、強さ・段階・気分と、週ごとの結果を計算する。
// workouts / sets / exercises は全件、startWeek と restWeeks は月曜の 'YYYY-MM-DD'、today は 'YYYY-MM-DD'
export function computeCreature({ workouts, sets, exercises, startWeek, restWeeks = [], today }) {
  const dateOf = new Map(workouts.map((w) => [w.id, w.date]));
  const datedSets = sets
    .filter((s) => dateOf.has(s.workoutId))
    .map((s) => ({ ...s, date: dateOf.get(s.workoutId) }));
  const sessionsAll = buildSessions(workouts, sets);
  const rest = new Set(restWeeks);
  const currentWeek = weekStart(today);
  const first = startWeek <= currentWeek ? startWeek : currentWeek;

  const weeks = [];
  let power = START_POWER;
  for (let ws = first; ws <= currentWeek; ws = addDays(ws, 7)) {
    const weekEnd = addDays(ws, 6);
    const sessions = sessionsAll.filter((s) => s.date >= ws && s.date <= weekEnd);
    const qualified = sessions.filter((s) => s.qualifies).length;
    const closed = ws < currentWeek;
    const isRest = rest.has(ws);
    const events = progressExerciseIds(datedSets, exercises, ws);

    let delta = 0;
    if (closed && !isRest) {
      const bonus = Math.min(events.length, MAX_EVENTS) * BONUS_PER_EVENT;
      if (qualified >= WEEKLY_GOAL) delta = GAIN_FULL + bonus;
      else if (qualified === 1) delta = -LOSS_ONE + bonus;
      else delta = -LOSS_ZERO;
    }
    if (closed) power = Math.max(0, Math.min(100, power + delta));
    weeks.push({ weekStart: ws, rest: isRest, closed, sessions, qualified, events, delta });
  }

  return { power, stage: stageFor(power), mood: moodFor(weeks), weeks, current: weeks[weeks.length - 1] };
}
```

- [ ] **Step 4: 全テストが通ることを確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/creature && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 5: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/creature
git add js/lib/creature.js test/creature.test.js
git commit -m "$(cat <<'EOF'
feat: compute creature power, stage and mood from workout history

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: キャラクターの絵（SVG）

**Files:**
- Create: `js/lib/creatureArt.js`
- Test: `test/creatureArt.test.js`

**Interfaces:**
- Produces: `monsterSvg(stage: number, mood: 'genki'|'normal'|'shobori'): string` — `<svg viewBox="0 0 140 150" ...>` の文字列。範囲外の `stage` は 0〜5 に丸め、不明な `mood` は `'normal'` として描く

- [ ] **Step 1: 失敗するテストを書く**

`test/creatureArt.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monsterSvg } from '../js/lib/creatureArt.js';

const MOODS = ['genki', 'normal', 'shobori'];

test('monsterSvg returns a well-formed svg string for every stage and mood', () => {
  for (let stage = 0; stage <= 5; stage++) {
    for (const mood of MOODS) {
      const svg = monsterSvg(stage, mood);
      assert.ok(svg.startsWith('<svg '), `${stage}/${mood} starts with <svg`);
      assert.ok(svg.endsWith('</svg>'), `${stage}/${mood} ends with </svg>`);
      assert.ok(svg.includes('viewBox="0 0 140 150"'), `${stage}/${mood} has the viewBox`);
      assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `${stage}/${mood} has no NaN or undefined`);
      assert.equal(svg.split('<svg').length, 2, `${stage}/${mood} has one svg element`);
    }
  }
});

test('monsterSvg draws a different picture for every stage and mood', () => {
  const all = new Set();
  for (let stage = 0; stage <= 5; stage++) for (const mood of MOODS) all.add(monsterSvg(stage, mood));
  assert.equal(all.size, 18);
});

test('monsterSvg clamps an out-of-range stage and falls back to normal for an unknown mood', () => {
  assert.equal(monsterSvg(99, 'genki'), monsterSvg(5, 'genki'));
  assert.equal(monsterSvg(-3, 'genki'), monsterSvg(0, 'genki'));
  assert.equal(monsterSvg(2, 'bogus'), monsterSvg(2, 'normal'));
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/creature && node --test test/creatureArt.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)|Cannot find" | head`
Expected: モジュールが見つからず FAIL

- [ ] **Step 3: `js/lib/creatureArt.js` を実装する**

```js
// キャラクター（ジムモン）の絵。段階 0〜5 × 気分 3種類のインラインSVGを返す純粋関数。
// 外部画像は使わない。背景が暗い前提（ライム色のアクセント色が映える）
const W = 140;
const G = 138; // 地面のy
const CX = 70;
const INK = '#141414';

const PALETTE = {
  genki: { body: '#ccff00', shade: '#9ccc00' },
  normal: { body: '#b9d83a', shade: '#8cab22' },
  shobori: { body: '#8e9a7c', shade: '#6c7760' },
};

function star(x, y, r) {
  return `<path d="M${x} ${y - r} l${r * 0.3} ${r * 0.7} l${r * 0.7} ${r * 0.3} l${-r * 0.7} ${r * 0.3} l${-r * 0.3} ${r * 0.7} l${-r * 0.3} ${-r * 0.7} l${-r * 0.7} ${-r * 0.3} l${r * 0.7} ${-r * 0.3}z" fill="#ffd24a"/>`;
}

function flatDumbbell(x, y) {
  return `<rect x="${x}" y="${y}" width="26" height="4" rx="2" fill="#bdbdbd"/><rect x="${x - 3}" y="${y - 6}" width="6" height="16" rx="2" fill="#2b2b2b"/><rect x="${x + 23}" y="${y - 6}" width="6" height="16" rx="2" fill="#2b2b2b"/>`;
}

function wrap(inner) {
  return `<svg viewBox="0 0 ${W} 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><ellipse cx="${CX}" cy="143" rx="36" ry="4" fill="#000" opacity=".4"/>${inner}</svg>`;
}

function egg(P, sad, mood) {
  const cy = G - 38;
  let s = `<g transform="rotate(${sad ? -9 : 0} ${CX} ${G})">`;
  if (mood === 'genki') s += `<circle cx="${CX}" cy="${cy}" r="52" fill="#ccff00" opacity=".12"/>`;
  s += `<ellipse cx="${CX}" cy="${cy}" rx="30" ry="38" fill="${P.body}"/>`;
  s += `<ellipse cx="${CX - 10}" cy="${cy - 14}" rx="6" ry="11" fill="#fff" opacity=".25"/>`;
  s += `<circle cx="${CX + 12}" cy="${cy + 10}" r="5" fill="${P.shade}"/><circle cx="${CX - 14}" cy="${cy + 18}" r="4" fill="${P.shade}"/><circle cx="${CX + 10}" cy="${cy - 14}" r="3.5" fill="${P.shade}"/>`;
  s += `<path d="M${CX - 28} ${cy} l8 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 l7 -9" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += '</g>';
  s += sad
    ? `<path d="M${CX + 34} ${cy - 26} q6 9 0 14 q-6 -5 0 -14z" fill="#7fc8ff"/>`
    : star(CX + 40, cy - 34, 7);
  return wrap(s);
}

export function monsterSvg(stage, mood) {
  const st = Math.max(0, Math.min(5, Math.round(Number(stage) || 0)));
  const md = PALETTE[mood] ? mood : 'normal';
  const P = PALETTE[md];
  const sad = md === 'shobori';
  if (st === 0) return egg(P, sad, md);

  const r = [0, 27, 31, 34, 37, 40][st];
  const cy = G - r;
  const wide = st >= 4;
  const rx = wide ? r * 1.1 : r;
  const D = [-1, 1];
  const barY = cy - r - 22;
  let s = `<g transform="translate(0 ${G}) scale(1 ${sad ? 0.94 : 1}) translate(0 ${-G})">`;

  // 背景（オーラ・マント）
  if (st === 5 && !sad) {
    s += `<circle cx="${CX}" cy="${cy}" r="${r + 30}" fill="#ccff00" opacity=".10"/><circle cx="${CX}" cy="${cy}" r="${r + 18}" fill="#ccff00" opacity=".13"/>`;
  }
  if (st === 5) {
    s += `<path d="M${CX - rx + 6} ${cy - r * 0.35} L${CX - rx - 16} ${G - 2} L${CX + rx + 16} ${G - 2} L${CX + rx - 6} ${cy - r * 0.35} Z" fill="${sad ? '#8a4a4d' : '#d9363e'}"/>`;
  }

  // 足・体
  s += `<ellipse cx="${CX - r * 0.5}" cy="${G - 3}" rx="${9 + st}" ry="5.5" fill="${P.shade}"/><ellipse cx="${CX + r * 0.5}" cy="${G - 3}" rx="${9 + st}" ry="5.5" fill="${P.shade}"/>`;
  s += wide
    ? `<ellipse cx="${CX}" cy="${cy}" rx="${rx}" ry="${r}" fill="${P.body}"/>`
    : `<circle cx="${CX}" cy="${cy}" r="${r}" fill="${P.body}"/>`;
  s += `<ellipse cx="${CX}" cy="${cy + r * 0.3}" rx="${rx * 0.55}" ry="${r * 0.5}" fill="#fff" opacity=".16"/>`;

  // 腕
  if (st === 1) for (const d of D) s += `<ellipse cx="${CX + d * (rx - 1)}" cy="${cy + 8}" rx="4.5" ry="7" fill="${P.shade}"/>`;
  if (st === 2) for (const d of D) s += `<ellipse cx="${CX + d * (rx + 2)}" cy="${cy + 6}" rx="6.5" ry="10" fill="${P.body}"/>`;
  if (st === 3) {
    for (const d of D) s += `<circle cx="${CX + d * (rx + 4)}" cy="${cy + 2}" r="9" fill="${P.body}"/><ellipse cx="${CX + d * (rx + 5)}" cy="${cy + 17}" rx="7" ry="9" fill="${P.body}"/>`;
  }
  if (st === 4) {
    for (const d of D) s += `<circle cx="${CX + d * (rx + 7)}" cy="${cy - 2}" r="14" fill="${P.body}"/><circle cx="${CX + d * (rx + 9)}" cy="${cy + 16}" r="10" fill="${P.body}"/>`;
  }
  if (st === 5) {
    if (!sad) {
      for (const d of D) {
        s += `<path d="M${CX + d * (rx + 8)} ${cy - 4} L${CX + d * 34} ${barY + 2}" stroke="${P.body}" stroke-width="16" stroke-linecap="round"/><circle cx="${CX + d * (rx + 8)}" cy="${cy - 4}" r="15" fill="${P.body}"/>`;
      }
    } else {
      for (const d of D) {
        s += `<circle cx="${CX + d * (rx + 8)}" cy="${cy + 2}" r="15" fill="${P.body}"/><circle cx="${CX + d * (rx + 10)}" cy="${cy + 22}" r="11" fill="${P.body}"/>`;
      }
    }
  }

  // 顔
  const ex = r * 0.36;
  const ey = cy - r * 0.1;
  const er = Math.max(3.4, r * 0.15);
  const my = ey + er + 7;
  for (const d of D) {
    const x = CX + d * ex;
    if (sad) {
      s += `<circle cx="${x}" cy="${ey}" r="${er * 0.85}" fill="${INK}"/><rect x="${x - er - 1}" y="${ey - er - 2}" width="${er * 2 + 2}" height="${er + 1.2}" fill="${P.body}"/>`;
      s += `<path d="M${CX + d * (ex + er + 2)} ${ey - er - 4} L${CX + d * (ex - er)} ${ey - er - 9}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    } else {
      s += `<circle cx="${x}" cy="${ey}" r="${er}" fill="${INK}"/><circle cx="${x + er * 0.35}" cy="${ey - er * 0.35}" r="${er * 0.38}" fill="#fff"/>`;
      s += `<ellipse cx="${CX + d * (ex + er + 5)}" cy="${ey + er + 4}" rx="4" ry="2.6" fill="#ff8fa3" opacity=".55"/>`;
      if (st >= 4) s += `<path d="M${CX + d * (ex + er + 2)} ${ey - er - 8} L${CX + d * (ex - er)} ${ey - er - 3}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
    }
  }
  if (md === 'genki') {
    s += `<path d="M${CX - 8} ${my} Q${CX} ${my + 11} ${CX + 8} ${my} Z" fill="${INK}"/><ellipse cx="${CX}" cy="${my + 6}" rx="3.5" ry="2" fill="#ff7a8a"/>`;
  } else if (md === 'normal') {
    s += `<path d="M${CX - 6} ${my + 1} Q${CX} ${my + 6} ${CX + 6} ${my + 1}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  } else {
    s += `<path d="M${CX - 6} ${my + 5} Q${CX} ${my - 1} ${CX + 6} ${my + 5}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  // 頭の飾り
  if (st === 2 || st === 3) {
    for (const d of D) s += `<path d="M${CX + d * r * 0.42} ${cy - r * 0.9} L${CX + d * r * 0.62} ${cy - r * 1.32} L${CX + d * r * 0.1} ${cy - r * 1.0} Z" fill="#f2efe6"/>`;
  }
  if (st === 3) {
    s += `<path d="M${CX - r * 0.93} ${cy - r * 0.4} Q${CX} ${cy - r * 0.72} ${CX + r * 0.93} ${cy - r * 0.4} L${CX + r * 0.9} ${cy - r * 0.22} Q${CX} ${cy - r * 0.54} ${CX - r * 0.9} ${cy - r * 0.22} Z" fill="#e5383b"/><path d="M${CX + r * 0.9} ${cy - r * 0.3} l12 -4 l-3 8 l11 3 l-14 2z" fill="#e5383b"/>`;
  }
  if (st === 4) {
    s += `<path d="M${CX - r * 0.5} ${cy - r * 0.82} L${CX - r * 0.38} ${cy - r * 1.38} L${CX - r * 0.08} ${cy - r * 0.95}Z M${CX - r * 0.2} ${cy - r * 0.95} L${CX} ${cy - r * 1.5} L${CX + r * 0.2} ${cy - r * 0.95}Z M${CX + r * 0.5} ${cy - r * 0.82} L${CX + r * 0.38} ${cy - r * 1.38} L${CX + r * 0.08} ${cy - r * 0.95}Z" fill="${P.shade}"/>`;
  }
  if (st === 5) {
    const base = cy - r * 0.88;
    s += `<g transform="rotate(${sad ? -14 : 0} ${CX} ${cy - r})"><path d="M${CX - 17} ${base} L${CX - 19} ${base - 17} L${CX - 9} ${base - 8} L${CX} ${base - 20} L${CX + 9} ${base - 8} L${CX + 19} ${base - 17} L${CX + 17} ${base} Z" fill="#ffd24a" stroke="#b8860b" stroke-width="1.5" stroke-linejoin="round"/></g>`;
  }

  // 持ち物（元気なときだけ持ち上げる。しょんぼりは床に落とす）
  if (st === 4 && !sad) {
    for (const d of D) {
      const hx = CX + d * (rx + 9);
      const hy = cy + 16;
      s += `<rect x="${hx - 2}" y="${hy - 16}" width="4" height="32" fill="#bdbdbd"/><rect x="${hx - 9}" y="${hy - 20}" width="18" height="6" rx="2" fill="#2b2b2b"/><rect x="${hx - 9}" y="${hy + 14}" width="18" height="6" rx="2" fill="#2b2b2b"/>`;
    }
  }
  if (st === 5 && !sad) {
    s += `<rect x="8" y="${barY - 2}" width="124" height="5" rx="2" fill="#d0d0d0"/><rect x="14" y="${barY - 14}" width="8" height="30" rx="2" fill="#2b2b2b"/><rect x="118" y="${barY - 14}" width="8" height="30" rx="2" fill="#2b2b2b"/><rect x="23" y="${barY - 9}" width="6" height="20" rx="2" fill="#555"/><rect x="111" y="${barY - 9}" width="6" height="20" rx="2" fill="#555"/>`;
    for (const d of D) s += `<circle cx="${CX + d * 34}" cy="${barY + 1}" r="7" fill="${P.body}"/>`;
  }
  if (!sad && (st === 3 || st === 4)) s += star(CX - rx - 16, cy - r * 0.95, 6) + star(CX + rx + 16, cy - r * 1.05, 5);
  s += '</g>';

  if (sad) {
    s += `<path d="M${CX + r * 0.78} ${cy - r * 0.72} q5 8 0 12 q-5 -4 0 -12z" fill="#7fc8ff"/>`;
    if (st === 4) s += flatDumbbell(CX - rx - 34, G - 8) + flatDumbbell(CX + rx + 8, G - 8);
    if (st === 5) {
      s += `<rect x="12" y="${G - 8}" width="116" height="4" rx="2" fill="#bdbdbd"/><rect x="14" y="${G - 16}" width="7" height="20" rx="2" fill="#2b2b2b"/><rect x="119" y="${G - 16}" width="7" height="20" rx="2" fill="#2b2b2b"/>`;
    }
  }
  return wrap(s);
}
```

- [ ] **Step 4: 全テストが通ることを確認する**

Run: `cd /Users/taichi/gachi-fit/.worktrees/creature && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0`

- [ ] **Step 5: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/creature
git add js/lib/creatureArt.js test/creatureArt.test.js
git commit -m "$(cat <<'EOF'
feat: draw the creature as inline SVG for six stages and three moods

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ホームのカードとキャッシュ更新

**Files:**
- Create: `js/views/creature.js`
- Modify: `js/views/home.js`（カードの置き場と呼び出し）
- Modify: `css/style.css`（末尾に追記）
- Modify: `sw.js`（`ASSETS` に3ファイル、`CACHE` を `gachi-fit-v28` に）

**Interfaces:**
- Consumes: `computeCreature` / `weekStart` / `addDays` / `daysLeftInWeek` / `nextEvolutionIn` / `STAGE_NAMES` / 定数（Task 1）、`monsterSvg`（Task 2）、`get` / `put`（`js/db.js`）、`escapeHtml`、`localDateStr`
- Produces: `renderCreatureCard(box, { workouts, sets, exercises, silent? }): Promise<void>` — `box` の中身を描き直す。`silent: true` のときは進化・退化のお知らせを出さず、`lastSeenStage` だけ更新する（お休み切替後の再描画で使う）

- [ ] **Step 1: `js/views/creature.js` を作る**

```js
import { get, put } from '../db.js';
import { escapeHtml } from '../lib/html.js';
import { localDateStr } from '../lib/localdate.js';
import {
  computeCreature, weekStart, addDays, daysLeftInWeek, nextEvolutionIn, STAGE_NAMES,
  WEEKLY_GOAL, SESSION_MIN, LEAD_IN_MIN, GAIN_FULL, LOSS_ONE, LOSS_ZERO, BONUS_PER_EVENT, MAX_EVENTS,
} from '../lib/creature.js';
import { monsterSvg } from '../lib/creatureArt.js';

const DOC_ID = 'creature';
const MOOD_LABEL = { genki: '元気', normal: 'ふつう', shobori: 'しょんぼり' };
const HISTORY_WEEKS = 8;

const md = (dateStr) => {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
};

function weekIcon(w) {
  if (w.rest) return '休';
  if (!w.closed) return '進行中';
  if (w.qualified >= WEEKLY_GOAL) return '✔';
  return w.qualified === 1 ? '△' : '✕';
}

function deltaText(w) {
  if (w.rest) return '±0';
  if (!w.closed) return '集計中';
  return `${w.delta > 0 ? '+' : ''}${w.delta}`;
}

function weekMessage(c, today) {
  const w = c.current;
  if (w.rest) return '今週はお休み';
  if (w.qualified >= WEEKLY_GOAL) return '今週の目標達成！';
  return `あと${WEEKLY_GOAL - w.qualified}回で今週達成（残り${daysLeftInWeek(today)}日）`;
}

function weekRowHtml(w) {
  const sessions = w.sessions.length
    ? w.sessions.map((s) => `${md(s.date)} ${Math.round(s.minutes)}分${s.qualifies ? ' ✔' : ''}`).join('　')
    : '記録なし';
  return `<div class="creature-week-row">
    <div class="list-item" style="border:none;padding:0">
      <span><strong>${md(w.weekStart)}〜${md(addDays(w.weekStart, 6))}</strong> ${weekIcon(w)}</span>
      <span class="muted">${deltaText(w)}</span>
    </div>
    <div class="muted">${escapeHtml(sessions)}</div>
    <button type="button" class="btn creature-rest" data-rest-week="${w.weekStart}">${w.rest ? 'お休みを戻す' : 'お休みにする'}</button>
  </div>`;
}

const RULES_HTML = `<div class="muted" style="margin-top:10px;font-size:13px;line-height:1.7">
  <div>・週は月曜〜日曜。週が終わってから強さが増減します</div>
  <div>・トレーニングした日の所要時間が${SESSION_MIN}分以上で「達成」。手入力の開始・終了があればそれを使い、なければ最初と最後の記録の間隔に${LEAD_IN_MIN}分を足します</div>
  <div>・週${WEEKLY_GOAL}回以上で＋${GAIN_FULL}、1回で−${LOSS_ONE}、0回で−${LOSS_ZERO}。お休みの週は増減なし</div>
  <div>・自己ベスト（推定1RMか、同じ重量以上での最大回数）を更新した種目1つにつき＋${BONUS_PER_EVENT}（週${MAX_EVENTS}種目まで。1回以上達成した週のみ）</div>
</div>`;

// ホームの最上部にキャラのカードを描く。状態は保存せず、履歴から毎回計算する
export async function renderCreatureCard(box, { workouts, sets, exercises, silent = false }) {
  const wasOpen = Boolean(box.querySelector('#creature-details')?.open);
  const today = localDateStr();

  let doc = await get('goals', DOC_ID);
  if (!doc) {
    doc = { id: DOC_ID, startWeek: weekStart(today), restWeeks: [], lastSeenStage: null };
    await put('goals', doc);
  }
  const c = computeCreature({
    workouts, sets, exercises, startWeek: doc.startWeek, restWeeks: doc.restWeeks || [], today,
  });

  // 段階が変わっていたら、一度だけお知らせする（初回は黙って保存）
  let notice = '';
  if (doc.lastSeenStage !== c.stage) {
    if (!silent && typeof doc.lastSeenStage === 'number') {
      notice = c.stage > doc.lastSeenStage
        ? `進化した！ ${STAGE_NAMES[doc.lastSeenStage]} → ${STAGE_NAMES[c.stage]}`
        : `弱くなってしまった… ${STAGE_NAMES[c.stage]}に戻った`;
    }
    doc = { ...doc, lastSeenStage: c.stage };
    await put('goals', doc);
  }

  const next = nextEvolutionIn(c.power);
  const dots = Array.from({ length: WEEKLY_GOAL }, (_, i) => (i < Math.min(c.current.qualified, WEEKLY_GOAL) ? '●' : '○')).join(' ');
  const weeks = c.weeks.slice(-HISTORY_WEEKS).reverse();

  box.innerHTML = `
    ${notice ? `<div class="creature-notice">${escapeHtml(notice)}</div>` : ''}
    <div class="card creature">
      <div class="creature-main">
        <div class="creature-art" role="img" aria-label="${STAGE_NAMES[c.stage]}（${MOOD_LABEL[c.mood]}）">${monsterSvg(c.stage, c.mood)}</div>
        <div class="creature-info">
          <div class="creature-stage">${STAGE_NAMES[c.stage]} <span class="muted" style="font-size:14px;font-weight:600">${MOOD_LABEL[c.mood]}</span></div>
          <div class="creature-power"><div class="creature-power-fill" style="width:${c.power}%"></div></div>
          <div class="muted">強さ ${c.power}・${next === null ? '最高の姿' : `次の進化まであと${next}`}</div>
        </div>
      </div>
      <div class="creature-week">
        <span>今週</span><span class="creature-dots">${dots}</span><span>${escapeHtml(weekMessage(c, today))}</span>
      </div>
      <details id="creature-details">
        <summary>くわしく</summary>
        ${weeks.map(weekRowHtml).join('')}
        ${RULES_HTML}
      </details>
    </div>`;
  box.querySelector('#creature-details').open = wasOpen;

  box.querySelectorAll('[data-rest-week]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ws = btn.dataset.restWeek;
      const rest = new Set(doc.restWeeks || []);
      if (rest.has(ws)) rest.delete(ws); else rest.add(ws);
      await put('goals', { ...doc, restWeeks: [...rest].sort() });
      await renderCreatureCard(box, { workouts, sets, exercises, silent: true });
    }));
}
```

- [ ] **Step 2: `js/views/home.js` に呼び出しを足す**

import の並びの末尾（`registerHomeCoursePack` などの import の直後）に追加:

```js
import { renderCreatureCard } from './creature.js';
```

`el.innerHTML = \`` で始まるホームの組み立てで、次の2行:

```js
    <h2 class="view-title">ホーム</h2>
    ${suggestCard}
```

を次に置き換える:

```js
    <h2 class="view-title">ホーム</h2>
    <div id="creature-card"></div>
    ${suggestCard}
```

`  const setWorkoutIds = new Set(sets.map((s) => s.workoutId));` の直前に追加（描画の失敗でホーム全体を止めないよう、待たずに起動して握りつぶす）:

```js
  renderCreatureCard(el.querySelector('#creature-card'), { workouts, sets, exercises: allExercises })
    .catch(() => {});
```

- [ ] **Step 3: `css/style.css` の末尾に追記する**

```css
.creature-notice { background: var(--accent); color: #0a0a0a; font-weight: 800; border-radius: 12px;
  padding: 12px 14px; margin-bottom: 10px; }
.creature-main { display: flex; align-items: center; gap: 12px; }
.creature-art { flex: 0 0 112px; width: 112px; }
.creature-art svg { width: 100%; height: auto; display: block; }
.creature-info { flex: 1; min-width: 0; }
.creature-stage { font-size: 20px; font-weight: 800; }
.creature-power { height: 10px; background: var(--surface-2); border-radius: 999px; overflow: hidden; margin: 8px 0 6px; }
.creature-power-fill { height: 100%; background: var(--accent); border-radius: 999px; }
.creature-week { margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-weight: 700; }
.creature-dots { letter-spacing: 4px; color: var(--accent); font-size: 20px; }
.creature details { margin-top: 10px; }
.creature summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-weight: 700; }
.creature-week-row { padding: 10px 0; border-bottom: 1px solid #1f1f1f; }
.creature-rest { min-height: 40px; margin-top: 6px; font-size: 14px; }
```

- [ ] **Step 4: `sw.js` を更新する**

`'js/lib/firebase-config.js',` を含む `ASSETS` の行の末尾（`'js/lib/bodyweight.js',` の後）に `'js/lib/creature.js', 'js/lib/creatureArt.js',` を足し、`'js/views/places.js',` の後に `'js/views/creature.js',` を足す。`const CACHE = 'gachi-fit-v27';` を `const CACHE = 'gachi-fit-v28';` に置き換える。

確認:

```bash
cd /Users/taichi/gachi-fit/.worktrees/creature
node --check sw.js && node --check js/views/creature.js && node --check js/views/home.js
for f in $(find js -name '*.js' | sort); do grep -q "'$f'" sw.js || echo "MISSING in ASSETS: $f"; done
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: `MISSING` の行なし、`fail 0`

- [ ] **Step 5: ブラウザで確認する**

DBを初期化してホームを開く。

1. **初回**: 最上部にカードが出る。段階「ベビー」、気分「ふつう」、強さ 10、今週「○ ○ あと2回で今週達成（残り◯日）」。`await (await import('/js/db.js')).get('goals', 'creature')` が `{ startWeek: <今週の月曜>, restWeeks: [], lastSeenStage: 1 }`。お知らせは出ない
2. **今週の達成**: 次を実行して再読み込み → 今週が `● ●`、「今週の目標達成！」、気分「元気」

   ```js
   const db = await import('/js/db.js');
   const { localDateStr } = await import('/js/lib/localdate.js');
   const { weekStart, addDays } = await import('/js/lib/creature.js');
   const ws = weekStart(localDateStr());
   await db.put('exercises', { id: 'e1', name: 'ダンベルカール', bodyPart: '腕/上腕二頭筋', category: '腕', cuePresets: [], setPattern: '通常', homeOk: true, bodyweight: false });
   const T = Date.now();
   for (const [i, off] of [[1, 0], [2, 1]]) {
     await db.put('workouts', { id: 'w' + i, date: addDays(ws, off), note: '' });
     await db.put('sets', { id: 's' + i + 'a', workoutId: 'w' + i, exerciseId: 'e1', weight: 20, reps: 10, assistedReps: 0, estimated1RM: 26, targetWeight: null, createdAt: T });
     await db.put('sets', { id: 's' + i + 'b', workoutId: 'w' + i, exerciseId: 'e1', weight: 20, reps: 10, assistedReps: 0, estimated1RM: 26, targetWeight: null, createdAt: T + 40 * 60000 });
   }
   location.reload();
   ```

   （今日が月曜のときは `off` が今日より未来の日付にならないよう、`[[1, 0], [2, 0]]` にして同じ日に2件作るのではなく、前週に作る側を使うこと。確認が難しければ `startWeek` を2週前にして過去の週で検証する）
3. **過去の週で強さが動く**: 次で開始週を2週前にし、前々週に2回達成、前週は0回にして再読み込み。強さが `10 + 10 − 15 = 5`、段階「たまご」、気分「しょんぼり」

   ```js
   const db = await import('/js/db.js');
   const { localDateStr } = await import('/js/lib/localdate.js');
   const { weekStart, addDays } = await import('/js/lib/creature.js');
   const ws = weekStart(localDateStr());
   await db.put('goals', { id: 'creature', startWeek: addDays(ws, -14), restWeeks: [], lastSeenStage: 1 });
   const T = Date.now();
   for (const [i, off] of [[3, -13], [4, -11]]) {
     await db.put('workouts', { id: 'w' + i, date: addDays(ws, off), note: '' });
     await db.put('sets', { id: 's' + i + 'a', workoutId: 'w' + i, exerciseId: 'e1', weight: 20, reps: 10, assistedReps: 0, estimated1RM: 26, targetWeight: null, createdAt: T });
     await db.put('sets', { id: 's' + i + 'b', workoutId: 'w' + i, exerciseId: 'e1', weight: 20, reps: 10, assistedReps: 0, estimated1RM: 26, targetWeight: null, createdAt: T + 40 * 60000 });
   }
   location.reload();
   ```

   このとき `lastSeenStage` が 1 で現在の段階が 0 なので、「弱くなってしまった… たまごに戻った」のお知らせが**一度だけ**出る。もう一度再読み込みすると出ない
4. **くわしく**: `<summary>` をタップすると開き、週の一覧（日付範囲・結果アイコン・増減）、各日の所要時間（`◯/◯ 40分 ✔`）、ルールの説明が出る。前々週が `✔ +10`、前週が `✕ -15`
5. **お休み**: 前週の「お休みにする」をタップ → 強さが `20` に戻り、前週のアイコンが `休`、増減が `±0`、`<details>` は開いたまま、お知らせは出ない。「お休みを戻す」で元に戻る。`goals.creature.restWeeks` が更新される
6. **見た目**: 段階を変えて（`startWeek` と記録で）たまご〜レジェンドを順に出し、カードの絵が段階に合っている。しょんぼりでは色が褪せている
7. 375×667 で、カードが横スクロールを出さず、`くわしく` のボタン類の高さが 40px 以上（`document.querySelector('.creature-rest').getBoundingClientRect().height >= 40`）。確認後 `resize_window` の `desktop` に戻す
8. `read_console_messages`（`onlyErrors: true`）にエラーがない

- [ ] **Step 6: コミットする**

```bash
cd /Users/taichi/gachi-fit/.worktrees/creature
git add js/views/creature.js js/views/home.js css/style.css sw.js
git commit -m "$(cat <<'EOF'
feat: show the growing creature card at the top of the home screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review（計画の作成者による確認）

**1. 仕様の網羅**

| 仕様の項目 | タスク |
|---|---|
| 定数の集約 | Task 1 |
| 所要時間（手入力優先／自動＋5分） | Task 1（`sessionMinutes`） |
| 自己ベスト更新（(a)(b)、自重の許容、補助回数、初回対象外） | Task 1（`progressExerciseIds`） |
| 週の増減、加点（q≥1、上限3）、お休み、丸め、今週は動かさない、開始週より前を使わない | Task 1（`computeCreature`） |
| 段階・気分・次の進化までの残り | Task 1 |
| `goals` の1件（開始週・お休み週・最後に見た段階）、初回の自動作成 | Task 3 |
| カード（絵・段階・強さバー・今週の●○・メッセージ） | Task 3 |
| くわしく（直近8週、所要時間の判定表示、お休み切替、ルール） | Task 3 |
| 進化・退化のお知らせ（一度だけ、初回は黙って保存） | Task 3 |
| 絵（6段階×3気分、しょんぼりで持ち物を落とす） | Task 2 |
| `sw.js`（新規3ファイル、v28） | Task 3 |
| テスト | Task 1, 2 |

**仕様との意図的な差異**: お休み切替後の再描画では、段階が変わってもお知らせを出さない（`silent`）。お休みを戻したのに「進化した！」と出るのは紛らわしいため。

**2. プレースホルダ確認**: 「TBD」「適宜」「同様に」はない。コード手順にはすべてコードを載せた。

**3. 型・名前の一致**: `computeCreature` の返り値 `{ power, stage, mood, weeks, current }` と `Week` の項目（`weekStart` / `rest` / `closed` / `sessions` / `qualified` / `events` / `delta`）は Task 1 の定義と Task 3 の使用が一致。`renderCreatureCard(box, { workouts, sets, exercises, silent })` は Task 3 内で定義と呼び出しが一致。`monsterSvg(stage, mood)` は Task 2 の定義と Task 3 の使用が一致。
