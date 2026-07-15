import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sparklinePath, stepPath } from '../js/lib/chart.js';

test('sparklinePath returns empty string for empty input', () => {
  assert.equal(sparklinePath([], 100, 40), '');
});

test('sparklinePath single point draws a centered horizontal dot path', () => {
  const d = sparklinePath([50], 100, 40);
  assert.match(d, /^M0,20/);
});

test('sparklinePath maps min to bottom and max to top', () => {
  const d = sparklinePath([0, 10], 100, 40);
  assert.equal(d, 'M0,38 L100,2');
});

test('sparklinePath equal values draw a flat mid line', () => {
  const d = sparklinePath([5, 5, 5], 100, 40);
  assert.equal(d, 'M0,20 L50,20 L100,20');
});

test('stepPath returns empty string for empty input', () => {
  assert.equal(stepPath([], 100, 40), '');
});

test('stepPath single point draws a centered horizontal dot path', () => {
  const d = stepPath([50], 100, 40);
  assert.match(d, /^M0,20/);
});

test('stepPath connects two points with a horizontal then vertical segment', () => {
  const d = stepPath([0, 10], 100, 40);
  assert.equal(d, 'M0,38 L100,38 L100,2');
});

test('stepPath connects three points in a staircase pattern', () => {
  const d = stepPath([0, 5, 10], 100, 40);
  assert.equal(d, 'M0,38 L50,38 L50,20 L100,20 L100,2');
});
