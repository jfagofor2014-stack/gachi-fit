import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPresets, DEFAULT_EXERCISE_PRESETS } from '../js/lib/exercisePresets.js';

test('searchPresets matches by name substring case-insensitively', () => {
  const res = searchPresets('ベンチ');
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.name.includes('ベンチ')));
});

test('searchPresets matches by bodyPart substring', () => {
  const res = searchPresets('大腿四頭筋');
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.bodyPart.includes('大腿四頭筋')));
});

test('searchPresets returns empty array for empty query', () => {
  assert.deepEqual(searchPresets(''), []);
  assert.deepEqual(searchPresets('   '), []);
});

test('searchPresets returns empty array when nothing matches', () => {
  assert.deepEqual(searchPresets('xyz-nonexistent'), []);
});

test('DEFAULT_EXERCISE_PRESETS entries have name, bodyPart, category', () => {
  assert.ok(DEFAULT_EXERCISE_PRESETS.length >= 20);
  for (const p of DEFAULT_EXERCISE_PRESETS) {
    assert.ok(p.name && p.bodyPart && p.category);
  }
});

const GYM_ONLY = [
  'ベンチプレス', 'インクラインベンチプレス', 'スクワット', 'デッドリフト',
  'ルーマニアンデッドリフト', 'バーベルカール', 'レッグプレス', 'レッグエクステンション',
  'レッグカール', 'ラットプルダウン', 'シーテッドロウ', 'Tバーロウ', 'ケーブルプッシュダウン',
];
const BODYWEIGHT = [
  '懸垂', 'チンアップ', 'ディップス', 'プッシュアップ', '足上げプッシュアップ',
  'ぶら下がりレッグレイズ', 'クランチ', 'プランク',
];

test('every exercise preset has a boolean homeOk', () => {
  for (const p of DEFAULT_EXERCISE_PRESETS) {
    assert.equal(typeof p.homeOk, 'boolean', `${p.name} の homeOk が boolean ではない`);
  }
});

test('exercise preset names are unique', () => {
  const names = DEFAULT_EXERCISE_PRESETS.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
});

test('there are 50 exercise presets in total', () => {
  assert.equal(DEFAULT_EXERCISE_PRESETS.length, 50);
});

test('exactly the 13 gym-only exercises are homeOk:false', () => {
  const names = DEFAULT_EXERCISE_PRESETS.filter((p) => !p.homeOk).map((p) => p.name).sort();
  assert.deepEqual(names, [...GYM_ONLY].sort());
});

test('bodyweight is only ever true and implies homeOk', () => {
  for (const p of DEFAULT_EXERCISE_PRESETS) {
    if (p.bodyweight === undefined) continue;
    assert.equal(p.bodyweight, true, `${p.name} の bodyweight は true か未定義のみ`);
    assert.equal(p.homeOk, true, `${p.name} は自重種目なので homeOk が必要`);
  }
});

test('the bodyweight exercises are exactly the expected eight', () => {
  const names = DEFAULT_EXERCISE_PRESETS.filter((p) => p.bodyweight).map((p) => p.name).sort();
  assert.deepEqual(names, [...BODYWEIGHT].sort());
});
