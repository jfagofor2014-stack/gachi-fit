import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toSlots, lastSessionSlots, initialSetValues, previousForSet, lastDropChain, nextDropWeight, parseNumberInput,
} from '../js/lib/logging.js';

const set = (id, exerciseId, workoutId, weight, reps, createdAt, extra = {}) =>
  ({ id, exerciseId, workoutId, weight, reps, assistedReps: 0, createdAt, ...extra });

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
