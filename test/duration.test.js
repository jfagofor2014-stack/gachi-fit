import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinutes } from '../js/lib/duration.js';

test('formatMinutes floors seconds to minutes', () => {
  assert.equal(formatMinutes(0), '0分');
  assert.equal(formatMinutes(59), '0分');
  assert.equal(formatMinutes(60), '1分');
  assert.equal(formatMinutes(3600), '60分');
});

test('formatMinutes handles invalid input as 0', () => {
  assert.equal(formatMinutes(undefined), '0分');
  assert.equal(formatMinutes(-5), '0分');
});
