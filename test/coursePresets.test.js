import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COURSE_PRESETS, missingExerciseNames } from '../js/lib/coursePresets.js';
import { DEFAULT_EXERCISE_PRESETS } from '../js/lib/exercisePresets.js';
import { COURSE_MIN_EX, COURSE_MAX_EX } from '../js/lib/constants.js';

test('missingExerciseNames returns all names when none are registered', () => {
  assert.deepEqual(missingExerciseNames(['A', 'B'], []), ['A', 'B']);
});

test('missingExerciseNames returns empty when all are registered', () => {
  const exercises = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
  assert.deepEqual(missingExerciseNames(['A', 'B'], exercises), []);
});

test('missingExerciseNames returns only the unregistered ones, keeping order', () => {
  const exercises = [{ id: '1', name: 'B' }];
  assert.deepEqual(missingExerciseNames(['A', 'B', 'C'], exercises), ['A', 'C']);
});

test('missingExerciseNames dedupes repeated names', () => {
  assert.deepEqual(missingExerciseNames(['A', 'A', 'B'], []), ['A', 'B']);
});

test('missingExerciseNames returns empty array for empty input', () => {
  assert.deepEqual(missingExerciseNames([], [{ id: '1', name: 'A' }]), []);
});

test('every course preset exercise exists in the exercise presets', () => {
  const known = new Set(DEFAULT_EXERCISE_PRESETS.map((p) => p.name));
  for (const course of DEFAULT_COURSE_PRESETS) {
    for (const name of course.exercises) {
      assert.ok(known.has(name), `${course.name} の「${name}」が種目プリセットに存在しない`);
    }
  }
});

test('every course preset has between COURSE_MIN_EX and COURSE_MAX_EX exercises', () => {
  for (const course of DEFAULT_COURSE_PRESETS) {
    assert.ok(course.exercises.length >= COURSE_MIN_EX,
      `${course.name} の種目数が ${COURSE_MIN_EX} 未満`);
    assert.ok(course.exercises.length <= COURSE_MAX_EX,
      `${course.name} の種目数が ${COURSE_MAX_EX} 超過`);
  }
});

test('no course preset repeats an exercise', () => {
  for (const course of DEFAULT_COURSE_PRESETS) {
    assert.equal(new Set(course.exercises).size, course.exercises.length,
      `${course.name} に重複した種目がある`);
  }
});

test('course preset names are unique', () => {
  const names = DEFAULT_COURSE_PRESETS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});
