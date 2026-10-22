import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWeightStep, setWeightStep, WEIGHT_STEPS, DEFAULT_WEIGHT_STEP } from '../js/lib/prefs.js';

function withLocalStorage(stub, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  try { fn(); } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
};

test('WEIGHT_STEPS and the default match the spec', () => {
  assert.deepEqual(WEIGHT_STEPS, [0.5, 1, 1.25, 2, 2.5, 5]);
  assert.equal(DEFAULT_WEIGHT_STEP, 2.5);
});
test('getWeightStep defaults to 2.5 when nothing is stored', () => {
  withLocalStorage(memory(), () => assert.equal(getWeightStep(), 2.5));
});
test('getWeightStep reads an allowed stored value', () => {
  withLocalStorage(memory({ weight_step: '1.25' }), () => assert.equal(getWeightStep(), 1.25));
});
test('getWeightStep ignores a value outside the list', () => {
  withLocalStorage(memory({ weight_step: '3' }), () => assert.equal(getWeightStep(), 2.5));
});
test('getWeightStep falls back when localStorage throws', () => {
  withLocalStorage({ getItem() { throw new Error('blocked'); } }, () => assert.equal(getWeightStep(), 2.5));
});
test('setWeightStep stores allowed values only', () => {
  withLocalStorage(memory(), () => {
    setWeightStep(2);
    assert.equal(getWeightStep(), 2);
    setWeightStep(7);
    assert.equal(getWeightStep(), 2);
  });
});
test('setWeightStep does not throw when localStorage is unavailable', () => {
  withLocalStorage({ setItem() { throw new Error('quota'); } }, () => assert.doesNotThrow(() => setWeightStep(2)));
});
