import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBeep, shouldFinalBeep } from '../js/lib/sound.js';

test('shouldBeep is true for every second from 1 through the threshold', () => {
  assert.equal(shouldBeep(10), true);
  assert.equal(shouldBeep(5), true);
  assert.equal(shouldBeep(1), true);
});

test('shouldBeep is false outside the countdown range', () => {
  assert.equal(shouldBeep(11), false);
  assert.equal(shouldBeep(0), false);
  assert.equal(shouldBeep(-1), false);
});

test('shouldBeep respects a custom threshold', () => {
  assert.equal(shouldBeep(5, 5), true);
  assert.equal(shouldBeep(6, 5), false);
  assert.equal(shouldBeep(1, 5), true);
});

test('shouldFinalBeep is true only when remaining is exactly 0', () => {
  assert.equal(shouldFinalBeep(0), true);
  assert.equal(shouldFinalBeep(1), false);
  assert.equal(shouldFinalBeep(-1), false);
});
