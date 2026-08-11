import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastTrainedDateByCategory } from '../js/lib/suggest.js';

test('lastTrainedDateByCategory picks the latest date per category', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' }, e2: { id: 'e2', bodyPart: '背中' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-25' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1' },
    { exerciseId: 'e1', workoutId: 'w2' },
    { exerciseId: 'e2', workoutId: 'w1' },
  ];
  const result = lastTrainedDateByCategory(sets, exById, wkById);
  assert.equal(result['胸'], '2026-06-25');
  assert.equal(result['背中'], '2026-06-20');
});

test('lastTrainedDateByCategory returns empty object for no sets', () => {
  assert.deepEqual(lastTrainedDateByCategory([], {}, {}), {});
});
