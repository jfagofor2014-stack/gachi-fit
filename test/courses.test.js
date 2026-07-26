import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostUsedExerciseIds, matchExerciseNamesToIds } from '../js/lib/courses.js';

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
