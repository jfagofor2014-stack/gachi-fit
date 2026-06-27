import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationMinutes } from '../js/lib/timerange.js';

test('durationMinutes computes minute difference', () => {
  assert.equal(durationMinutes('09:00', '10:30'), 90);
  assert.equal(durationMinutes('18:15', '19:00'), 45);
});

test('durationMinutes returns 0 for end <= start or empty', () => {
  assert.equal(durationMinutes('10:00', '09:00'), 0);
  assert.equal(durationMinutes('10:00', '10:00'), 0);
  assert.equal(durationMinutes('', '10:00'), 0);
  assert.equal(durationMinutes('10:00', ''), 0);
});
