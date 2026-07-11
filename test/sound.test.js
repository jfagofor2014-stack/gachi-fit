import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBeep } from '../js/lib/sound.js';

test('shouldBeep is true exactly at threshold', () => {
  assert.equal(shouldBeep(10), true);
  assert.equal(shouldBeep(10, 10), true);
});

test('shouldBeep is false elsewhere', () => {
  assert.equal(shouldBeep(11), false);
  assert.equal(shouldBeep(9), false);
  assert.equal(shouldBeep(0), false);
});

test('shouldBeep respects custom threshold', () => {
  assert.equal(shouldBeep(5, 5), true);
  assert.equal(shouldBeep(10, 5), false);
});
