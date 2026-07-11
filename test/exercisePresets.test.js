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
