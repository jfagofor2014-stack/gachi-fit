import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setVolume, categoryVolumeForDate, maxCategoryVolumeExcludingDate } from '../js/lib/volume.js';

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
