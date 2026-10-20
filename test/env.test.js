import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleExercises, courseAvailable, visibleCoursePresets, getEnv, setEnv } from '../js/lib/env.js';

const EX = [
  { id: 'a', name: 'ベンチプレス', homeOk: false },
  { id: 'b', name: 'ダンベルカール', homeOk: true },
  { id: 'c', name: '自作種目' }, // homeOk 未設定
];

// localStorage を差し替えて、終わったら元に戻す
function withLocalStorage(stub, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  try { fn(); } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

test('visibleExercises returns every exercise in the gym env', () => {
  assert.deepEqual(visibleExercises(EX, 'gym').map((e) => e.id), ['a', 'b', 'c']);
});

test('visibleExercises drops homeOk:false but keeps unset ones in the home env', () => {
  assert.deepEqual(visibleExercises(EX, 'home').map((e) => e.id), ['b', 'c']);
});

test('courseAvailable is always true in the gym env', () => {
  assert.equal(courseAvailable({ exerciseIds: ['a', 'b'] }, EX, 'gym'), true);
});

test('courseAvailable is false in the home env when a member is homeOk:false', () => {
  assert.equal(courseAvailable({ exerciseIds: ['a', 'b'] }, EX, 'home'), false);
});

test('courseAvailable is true in the home env when every member is usable', () => {
  assert.equal(courseAvailable({ exerciseIds: ['b', 'c'] }, EX, 'home'), true);
});

test('courseAvailable ignores ids of deleted exercises', () => {
  assert.equal(courseAvailable({ exerciseIds: ['b', 'gone'] }, EX, 'home'), true);
});

test('visibleCoursePresets keeps only the presets for the env', () => {
  const presets = [{ name: 'A', env: 'gym' }, { name: 'B', env: 'home' }];
  assert.deepEqual(visibleCoursePresets(presets, 'home').map((p) => p.name), ['B']);
  assert.deepEqual(visibleCoursePresets(presets, 'gym').map((p) => p.name), ['A']);
});

test('getEnv falls back to gym when localStorage throws', () => {
  withLocalStorage({ getItem() { throw new Error('blocked'); } }, () => {
    assert.equal(getEnv(), 'gym');
  });
});

test('getEnv defaults to gym when nothing is stored', () => {
  withLocalStorage({ getItem: () => null }, () => {
    assert.equal(getEnv(), 'gym');
  });
});

test('setEnv and getEnv round-trip, and unknown values collapse to gym', () => {
  const store = new Map();
  const stub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  withLocalStorage(stub, () => {
    setEnv('home');
    assert.equal(getEnv(), 'home');
    setEnv('gym');
    assert.equal(getEnv(), 'gym');
    store.set('training_env', 'bogus');
    assert.equal(getEnv(), 'gym');
  });
});

test('setEnv does not throw when localStorage is unavailable', () => {
  withLocalStorage({ setItem() { throw new Error('quota'); } }, () => {
    assert.doesNotThrow(() => setEnv('home'));
  });
});
