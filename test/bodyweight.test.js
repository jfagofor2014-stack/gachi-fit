import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestBodyWeight } from '../js/lib/bodyweight.js';

test('latestBodyWeight returns the weight of the newest date', () => {
  const records = [
    { date: '2026-10-01', weight: 70 },
    { date: '2026-10-05', weight: 69.5 },
    { date: '2026-10-03', weight: 70.2 },
  ];
  assert.equal(latestBodyWeight(records), 69.5);
});

test('latestBodyWeight prefers the later entry when dates tie', () => {
  const records = [
    { date: '2026-10-05', weight: 70 },
    { date: '2026-10-05', weight: 69.8 },
  ];
  assert.equal(latestBodyWeight(records), 69.8);
});

test('latestBodyWeight ignores zero, negative and non-numeric weights', () => {
  const records = [
    { date: '2026-10-01', weight: 70 },
    { date: '2026-10-05', weight: 0 },
    { date: '2026-10-06', weight: 'abc' },
    { date: '2026-10-07', weight: -3 },
  ];
  assert.equal(latestBodyWeight(records), 70);
});

test('latestBodyWeight returns null for empty or missing input', () => {
  assert.equal(latestBodyWeight([]), null);
  assert.equal(latestBodyWeight(undefined), null);
});
