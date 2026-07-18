import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastTrainedDateByCategory, suggestBodyParts } from '../js/lib/suggest.js';

test('lastTrainedDateByCategory picks the latest date per category', () => {
  const exById = { e1: { id: 'e1', bodyPart: '胸' }, e2: { id: 'e2', bodyPart: '背中' } };
  const wkById = { w1: { id: 'w1', date: '2026-06-20' }, w2: { id: 'w2', date: '2026-06-25' } };
  const sets = [
    { exerciseId: 'e1', workoutId: 'w1' },
    { exerciseId: 'e1', workoutId: 'w2' },
    { exerciseId: 'e2', workoutId: 'w1' },
  ];
  const result = lastTrainedDateByCategory(sets, exById, wkById);
  assert.equal(result['胸'], '2026-06-25');
  assert.equal(result['背中'], '2026-06-20');
});

test('lastTrainedDateByCategory returns empty object for no sets', () => {
  assert.deepEqual(lastTrainedDateByCategory([], {}, {}), {});
});

test('suggestBodyParts prioritizes the longest gap since last trained', () => {
  const lastTrained = { '胸': '2026-07-10', '背中': '2026-07-05', '肩': '2026-07-12' };
  const today = new Date(2026, 6, 13); // 2026-07-13
  const result = suggestBodyParts(['胸', '背中', '肩'], lastTrained, today, 2);
  assert.deepEqual(result, ['背中', '胸']);
});

test('suggestBodyParts prioritizes never-trained categories first', () => {
  const lastTrained = { '胸': '2026-07-10' };
  const today = new Date(2026, 6, 13);
  const result = suggestBodyParts(['胸', '腕'], lastTrained, today, 2);
  assert.deepEqual(result, ['腕', '胸']);
});

test('suggestBodyParts excludes その他', () => {
  const lastTrained = {};
  const today = new Date(2026, 6, 13);
  const result = suggestBodyParts(['胸', 'その他'], lastTrained, today, 2);
  assert.deepEqual(result, ['胸']);
});

test('suggestBodyParts keeps input order on ties', () => {
  const lastTrained = {};
  const today = new Date(2026, 6, 13);
  const result = suggestBodyParts(['背中', '胸', '肩'], lastTrained, today, 2);
  assert.deepEqual(result, ['背中', '胸']);
});
