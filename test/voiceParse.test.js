import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUtterance, matchExerciseName, parseSetUtterance } from '../js/lib/voiceParse.js';

const NAMES = ['ベンチプレス', 'インクラインベンチプレス', 'スクワット', 'ラットプルダウン'];

test('normalizeUtterance converts full-width digits to half-width', () => {
  assert.equal(normalizeUtterance('２００キロ'), '200キロ');
});

test('normalizeUtterance converts full-width spaces and trims', () => {
  assert.equal(normalizeUtterance('　ベンチプレス　100　'), 'ベンチプレス 100');
});

test('matchExerciseName finds an exact name', () => {
  assert.equal(matchExerciseName('ベンチプレス100キロ', NAMES), 'ベンチプレス');
});

test('matchExerciseName finds a name split by spaces', () => {
  assert.equal(matchExerciseName('ベンチ プレス を100キロ', NAMES), 'ベンチプレス');
});

test('matchExerciseName prefers the longest match', () => {
  assert.equal(matchExerciseName('インクラインベンチプレス80キロ', NAMES), 'インクラインベンチプレス');
});

test('matchExerciseName returns null when nothing matches', () => {
  assert.equal(matchExerciseName('デッドリフト100キロ', NAMES), null);
});

test('matchExerciseName returns null for an empty name list', () => {
  assert.equal(matchExerciseName('ベンチプレス100キロ', []), null);
});

test('parseSetUtterance reads exercise, weight and reps with units', () => {
  assert.deepEqual(parseSetUtterance('ベンチプレス100キロ8回', NAMES),
    { exerciseName: 'ベンチプレス', weight: 100, reps: 8 });
});

test('parseSetUtterance reads two bare numbers as weight then reps', () => {
  assert.deepEqual(parseSetUtterance('ベンチプレス 100 8', NAMES),
    { exerciseName: 'ベンチプレス', weight: 100, reps: 8 });
});

test('parseSetUtterance works without an exercise name', () => {
  assert.deepEqual(parseSetUtterance('100キロ8回', NAMES),
    { exerciseName: null, weight: 100, reps: 8 });
});

test('parseSetUtterance reads reps only', () => {
  assert.deepEqual(parseSetUtterance('8回', NAMES),
    { exerciseName: null, weight: null, reps: 8 });
});

test('parseSetUtterance reads an exercise only', () => {
  assert.deepEqual(parseSetUtterance('スクワット', NAMES),
    { exerciseName: 'スクワット', weight: null, reps: null });
});

test('parseSetUtterance reads a decimal weight', () => {
  assert.deepEqual(parseSetUtterance('62.5キロ10回', NAMES),
    { exerciseName: null, weight: 62.5, reps: 10 });
});

test('parseSetUtterance accepts kg notation', () => {
  assert.deepEqual(parseSetUtterance('100kg8回', NAMES),
    { exerciseName: null, weight: 100, reps: 8 });
});

test('parseSetUtterance accepts レップ notation', () => {
  assert.deepEqual(parseSetUtterance('100キロ8レップ', NAMES),
    { exerciseName: null, weight: 100, reps: 8 });
});

test('parseSetUtterance returns all null when nothing is recognized', () => {
  assert.deepEqual(parseSetUtterance('えーっと', NAMES),
    { exerciseName: null, weight: null, reps: null });
});

test('parseSetUtterance is not confused by digits inside an exercise name', () => {
  const names = ['Tバーロウ'];
  assert.deepEqual(parseSetUtterance('Tバーロウ60キロ12回', names),
    { exerciseName: 'Tバーロウ', weight: 60, reps: 12 });
});
