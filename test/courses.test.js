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
