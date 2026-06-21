import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate1RM, sensoryScore, computePRs } from '../js/lib/calc.js';

test('estimate1RM uses Epley formula', () => {
  assert.ok(Math.abs(estimate1RM(100, 8) - 126.6667) < 0.01);
  assert.ok(Math.abs(estimate1RM(100, 1) - (100 + 100 / 30)) < 1e-9);
});

test('estimate1RM returns weight for 0 reps guard', () => {
  assert.equal(estimate1RM(80, 0), 80);
});

test('sensoryScore weights core and rom', () => {
  const s = sensoryScore({ core: 4, muscleLoad: 5, rom: 'full' });
  assert.equal(s, 5 * 1 * 1.0 + 4 * 1.0);
});

test('sensoryScore reduces score for partial/cheating rom', () => {
  const full = sensoryScore({ core: 3, muscleLoad: 3, rom: 'full' });
  const partial = sensoryScore({ core: 3, muscleLoad: 3, rom: 'partial' });
  const cheating = sensoryScore({ core: 3, muscleLoad: 3, rom: 'cheating' });
  assert.ok(full > partial && partial > cheating);
});

test('computePRs returns max estimated1RM per exercise', () => {
  const sets = [
    { exerciseId: 'a', weight: 100, reps: 5 },
    { exerciseId: 'a', weight: 110, reps: 3 },
    { exerciseId: 'b', weight: 60, reps: 10 },
  ];
  const prs = computePRs(sets);
  assert.ok(Math.abs(prs.a - estimate1RM(110, 3)) < 0.01);
  assert.ok(Math.abs(prs.b - estimate1RM(60, 10)) < 0.01);
});

test('computePRs subtracts assistedReps for self reps', () => {
  const sets = [
    { exerciseId: 'a', weight: 100, reps: 8, assistedReps: 2 },
  ];
  const prs = computePRs(sets);
  assert.ok(Math.abs(prs.a - estimate1RM(100, 6)) < 1e-9);
});

test('computePRs treats missing assistedReps as 0', () => {
  const sets = [
    { exerciseId: 'b', weight: 60, reps: 10 },
  ];
  const prs = computePRs(sets);
  assert.ok(Math.abs(prs.b - estimate1RM(60, 10)) < 1e-9);
});
