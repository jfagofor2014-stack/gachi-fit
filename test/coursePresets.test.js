import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_COURSE_PRESETS, missingExerciseNames, registerCoursePreset, registerHomeCoursePack } from '../js/lib/coursePresets.js';
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
