import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil } from '../js/lib/countdown.js';

test('daysUntil returns 0 for same day', () => {
  assert.equal(daysUntil('2026-06-17', new Date('2026-06-17T09:00:00')), 0);
});

test('daysUntil returns positive for future', () => {
  assert.equal(daysUntil('2026-06-20', new Date('2026-06-17T23:00:00')), 3);
});

test('daysUntil returns negative for past', () => {
  assert.equal(daysUntil('2026-06-15', new Date('2026-06-17T00:00:00')), -2);
});

test('daysUntil returns null for empty input', () => {
  assert.equal(daysUntil('', new Date('2026-06-17')), null);
});
