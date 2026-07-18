import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setVolume, categoryVolumeForDate, maxCategoryVolumeExcludingDate, dailyCategoryVolumes, categoryPRProgression } from '../js/lib/volume.js';

test('setVolume without assist is weight*reps', () => {
  assert.equal(setVolume(100, 8, 0), 800);
});

test('setVolume halves weight per assisted rep', () => {
  assert.equal(setVolume(100, 8, 2), 675);
  assert.ok(Math.abs(setVolume(100, 5, 5) - 96.875) < 1e-9);
});

test('categoryVolumeForDate sums volume per category on a date', () => {
  const exById = { e1: { id: 'e1', category: '胸' }, e2: { id: 'e2', category: '背中' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-21' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e2', workoutId: 'w1', weight: 80, reps: 5, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w2', weight: 100, reps: 5, assistedReps: 0 },
  ];
  const v = categoryVolumeForDate(sets, exById, wkById, '2026-06-20');
  assert.equal(v['胸'], 1000);
  assert.equal(v['背中'], 400);
  assert.equal(v['脚'], undefined);
});

test('categoryVolumeForDate treats missing category as その他', () => {
  const exById = { e1: { id: 'e1' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' } };
  const sets = [{ exerciseId: 'e1', workoutId: 'w1', weight: 50, reps: 4, assistedReps: 0 }];
  const v = categoryVolumeForDate(sets, exById, wkById, '2026-06-20');
  assert.equal(v['その他'], 200);
});

test('maxCategoryVolumeExcludingDate returns max daily total excluding a date', () => {
  const exById = { e1: { id: 'e1', category: '胸' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-21' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w2', weight: 100, reps: 8, assistedReps: 0 },
  ];
  const m = maxCategoryVolumeExcludingDate(sets, exById, wkById, '2026-06-21');
  assert.equal(m['胸'], 500);
  const all = maxCategoryVolumeExcludingDate(sets, exById, wkById, null);
  assert.equal(all['胸'], 800);
});

import { categoryKey, maxCategoryVolumeWithDate, VOLUME_START_DATE, categoriesWithExercises } from '../js/lib/volume.js';

test('categoryKey uses bodyPart prefix before slash', () => {
  assert.equal(categoryKey({ bodyPart: '胸/上部' }), '胸');
  assert.equal(categoryKey({ bodyPart: '背中' }), '背中');
  assert.equal(categoryKey({ bodyPart: '', category: '肩' }), '肩');
  assert.equal(categoryKey({}), 'その他');
});

test('VOLUME_START_DATE is 2026-06-28', () => {
  assert.equal(VOLUME_START_DATE, '2026-06-28');
});

test('maxCategoryVolumeExcludingDate honors sinceDate filter', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' } };
  const wkById = { w0: { id: 'w0', date: '2026-06-27' }, w1: { id: 'w1', date: '2026-06-29' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w0', weight: 100, reps: 10, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
  ];
  const m = maxCategoryVolumeExcludingDate(sets, exById, wkById, null, '2026-06-28');
  assert.equal(m['胸'], 500);
});

test('maxCategoryVolumeWithDate returns max daily total and its date', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸/上部' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-28' }, w2: { id: 'w2', date: '2026-06-30' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e1', workoutId: 'w2', weight: 100, reps: 8, assistedReps: 0 },
  ];
  const r = maxCategoryVolumeWithDate(sets, exById, wkById, '2026-06-28');
  assert.equal(r['胸'].volume, 800);
  assert.equal(r['胸'].date, '2026-06-30');
});

test('dailyCategoryVolumes filters by category and sinceDate, sorted ascending', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' }, e2: { id: 'e2', bodyPart: '背中' } };
  const wkById = {
    w0: { id: 'w0', date: '2026-06-27' },
    w1: { id: 'w1', date: '2026-06-30' },
    w2: { id: 'w2', date: '2026-06-28' },
  };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w0', weight: 100, reps: 10, assistedReps: 0 }, // sinceDate前なので除外
    { exerciseId: 'e1', workoutId: 'w1', weight: 100, reps: 5, assistedReps: 0 },
    { exerciseId: 'e2', workoutId: 'w1', weight: 80, reps: 5, assistedReps: 0 }, // 別部位なので除外
    { exerciseId: 'e1', workoutId: 'w2', weight: 50, reps: 4, assistedReps: 0 },
  ];
  const result = dailyCategoryVolumes(sets, exById, wkById, '胸', '2026-06-28');
  assert.deepEqual(result, [
    { date: '2026-06-28', volume: 200 },
    { date: '2026-06-30', volume: 500 },
  ]);
});

test('dailyCategoryVolumes returns empty array when no matching data', () => {
  const result = dailyCategoryVolumes([], {}, {}, '胸', '2026-06-28');
  assert.deepEqual(result, []);
});

test('categoryPRProgression keeps only monotonically increasing points', () => {
  const daily = [
    { date: '2026-06-28', volume: 200 },
    { date: '2026-06-29', volume: 150 },
    { date: '2026-06-30', volume: 500 },
    { date: '2026-07-01', volume: 500 },
    { date: '2026-07-02', volume: 800 },
  ];
  assert.deepEqual(categoryPRProgression(daily), [
    { date: '2026-06-28', volume: 200 },
    { date: '2026-06-30', volume: 500 },
    { date: '2026-07-02', volume: 800 },
  ]);
});

test('categoryPRProgression with a single point returns that point', () => {
  const daily = [{ date: '2026-06-28', volume: 200 }];
  assert.deepEqual(categoryPRProgression(daily), daily);
});

test('categoryPRProgression with empty input returns empty array', () => {
  assert.deepEqual(categoryPRProgression([]), []);
});

test('categoriesWithExercises orders by bodyParts then leftovers, excludes empty categories', () => {
  const exercises = [
    { bodyPart: '腕/上腕二頭筋' },
    { bodyPart: '胸/上部' },
    { bodyPart: 'カスタム部位' },
  ];
  const bodyParts = ['背中', '胸', '肩', '脚', '腕', 'その他'];
  assert.deepEqual(categoriesWithExercises(exercises, bodyParts), ['胸', '腕', 'カスタム部位']);
});

test('categoriesWithExercises returns empty array for no exercises', () => {
  assert.deepEqual(categoriesWithExercises([], ['胸', '背中']), []);
});
