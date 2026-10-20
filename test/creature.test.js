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

// ---- 境界・補強 ----

test('progressExerciseIds compares reps only against earlier sets at the same or a heavier weight', () => {
  // 30kg×10 は、より重い 40kg×12 に回数で負ける。比較の向きが逆だと 30kg×8 に勝って誤判定になる
  const sets = [ds('2026-10-06', 'x', 40, 12), ds('2026-10-06', 'x', 30, 8), ds('2026-10-13', 'x', 30, 10)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), []);
});

test('progressExerciseIds needs at least one comparable earlier set for the reps rule', () => {
  const sets = [ds('2026-10-06', 'x', 20, 30), ds('2026-10-13', 'x', 30, 2)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), []);
});

test('progressExerciseIds does not let a lighter high-rep earlier set block the reps rule', () => {
  // 25kg×15 は 30kg の比較対象に入らない。30kg×5 に対して 30kg×6 は更新
  const sets = [ds('2026-10-06', 'x', 25, 15), ds('2026-10-06', 'x', 30, 5), ds('2026-10-13', 'x', 30, 6)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), ['x']);
});

test('progressExerciseIds applies the body weight tolerance exactly at the boundary', () => {
  const ex = [{ id: 'bw', bodyweight: true }];
  assert.deepEqual(progressExerciseIds([ds('2026-10-06', 'bw', 69, 8), ds('2026-10-13', 'bw', 72, 8)], ex, WS), []);
  assert.deepEqual(progressExerciseIds([ds('2026-10-06', 'bw', 69, 8), ds('2026-10-13', 'bw', 73, 8)], ex, WS), ['bw']);
});

test('progressExerciseIds ignores sets after the week', () => {
  const sets = [ds('2026-10-06', 'x', 60, 8), ds('2026-10-13', 'x', 60, 8), ds('2026-10-20', 'x', 90, 8)];
  assert.deepEqual(progressExerciseIds(sets, [{ id: 'x' }], WS), []);
});

test('computeCreature normalizes a start week that is not a Monday', () => {
  const c = run([], { startWeek: '2026-10-07', today: '2026-10-20' });
  assert.deepEqual(c.weeks.map((w) => w.weekStart), ['2026-10-05', '2026-10-12', '2026-10-19']);
  assert.equal(c.current.closed, false);
});

test('computeCreature uses records before the start week as the personal best baseline', () => {
  const items = [
    mk('2026-09-29', 40, [{ exerciseId: 'e2', weight: 50, reps: 10 }]),
    mk('2026-10-06', 40, [{ exerciseId: 'e2', weight: 50, reps: 12 }]), mk('2026-10-08', 40),
  ];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-12' });
  assert.deepEqual(c.weeks[0].events, ['e2']);
  assert.equal(c.weeks[0].delta, 12);
});

test('computeCreature puts Sunday in its own week and Monday in the next', () => {
  const c = run([mk('2026-10-11', 40), mk('2026-10-12', 40)], { startWeek: '2026-10-05', today: '2026-10-19' });
  assert.deepEqual(c.weeks[0].sessions.map((s) => s.date), ['2026-10-11']);
  assert.deepEqual(c.weeks[1].sessions.map((s) => s.date), ['2026-10-12']);
});

test('computeCreature can come out ahead in a week with one qualifying day when the bonus is full', () => {
  const ids = ['e3', 'e4', 'e5'];
  const items = [
    mk('2026-10-06', 40, ids.map((exerciseId) => ({ exerciseId, weight: 50, reps: 10 }))), mk('2026-10-08', 40),
    mk('2026-10-13', 40, ids.map((exerciseId) => ({ exerciseId, weight: 50, reps: 11 }))),
  ];
  const c = run(items, { startWeek: '2026-10-05', today: '2026-10-19' });
  assert.equal(c.weeks[1].qualified, 1);
  assert.equal(c.weeks[1].delta, 1);
  assert.equal(c.power, 21);
});

test('computeCreature rejects a malformed date instead of looping forever', () => {
  assert.throws(() => run([], { startWeek: '2026-10-05', today: '' }), /invalid date/);
  assert.throws(() => run([], { startWeek: 'abc', today: '2026-10-05' }), /invalid date/);
});
