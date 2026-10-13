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
    { exerciseName: 'ベンチプレス', weight: 100, reps: 8, added: false });
});

test('parseSetUtterance reads two bare numbers as weight then reps', () => {
  assert.deepEqual(parseSetUtterance('ベンチプレス 100 8', NAMES),
    { exerciseName: 'ベンチプレス', weight: 100, reps: 8, added: false });
});

test('parseSetUtterance works without an exercise name', () => {
  assert.deepEqual(parseSetUtterance('100キロ8回', NAMES),
    { exerciseName: null, weight: 100, reps: 8, added: false });
});

test('parseSetUtterance reads reps only', () => {
  assert.deepEqual(parseSetUtterance('8回', NAMES),
    { exerciseName: null, weight: null, reps: 8, added: false });
});

test('parseSetUtterance reads an exercise only', () => {
  assert.deepEqual(parseSetUtterance('スクワット', NAMES),
    { exerciseName: 'スクワット', weight: null, reps: null, added: false });
});

test('parseSetUtterance reads a decimal weight', () => {
  assert.deepEqual(parseSetUtterance('62.5キロ10回', NAMES),
    { exerciseName: null, weight: 62.5, reps: 10, added: false });
});

test('parseSetUtterance accepts kg notation', () => {
  assert.deepEqual(parseSetUtterance('100kg8回', NAMES),
    { exerciseName: null, weight: 100, reps: 8, added: false });
});

test('parseSetUtterance accepts レップ notation', () => {
  assert.deepEqual(parseSetUtterance('100キロ8レップ', NAMES),
    { exerciseName: null, weight: 100, reps: 8, added: false });
});

test('parseSetUtterance returns all null when nothing is recognized', () => {
  assert.deepEqual(parseSetUtterance('えーっと', NAMES),
    { exerciseName: null, weight: null, reps: null, added: false });
});

test('parseSetUtterance is not confused by digits inside an exercise name', () => {
  const names = ['Tバーロウ'];
  assert.deepEqual(parseSetUtterance('Tバーロウ60キロ12回', names),
    { exerciseName: 'Tバーロウ', weight: 60, reps: 12, added: false });
});

const HOME_NAMES = ['ディップス', '懸垂', 'ダンベルカール'];

test('parseSetUtterance marks プラス as an added weight', () => {
  assert.deepEqual(parseSetUtterance('ディップス プラス10キロ 8回', HOME_NAMES),
    { exerciseName: 'ディップス', weight: 10, reps: 8, added: true });
});

test('parseSetUtterance accepts ＋, + and 追加 as added markers', () => {
  for (const marker of ['＋', '+', '追加']) {
    assert.deepEqual(parseSetUtterance(`ディップス${marker}10キロ8回`, HOME_NAMES),
      { exerciseName: 'ディップス', weight: 10, reps: 8, added: true }, marker);
  }
});

test('parseSetUtterance allows a space between the marker and the number', () => {
  assert.deepEqual(parseSetUtterance('懸垂 プラス 5 キロ 6回', HOME_NAMES),
    { exerciseName: '懸垂', weight: 5, reps: 6, added: true });
});

test('parseSetUtterance reads a decimal added weight', () => {
  assert.deepEqual(parseSetUtterance('懸垂 プラス2.5キロ 6回', HOME_NAMES),
    { exerciseName: '懸垂', weight: 2.5, reps: 6, added: true });
});

test('parseSetUtterance does not mark a plain weight or bare numbers as added', () => {
  assert.equal(parseSetUtterance('ダンベルカール20キロ10回', HOME_NAMES).added, false);
  assert.equal(parseSetUtterance('ダンベルカール 20 10', HOME_NAMES).added, false);
});

test('parseSetUtterance reads reps only when a bodyweight set has no weight', () => {
  assert.deepEqual(parseSetUtterance('懸垂 8回', HOME_NAMES),
    { exerciseName: '懸垂', weight: null, reps: 8, added: false });
});
