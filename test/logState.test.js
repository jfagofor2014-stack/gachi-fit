import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogState, saveLogState } from '../js/lib/logState.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m };
};
const fresh = (date) => ({ date, courseIds: [], courseName: '', superset: null, drop: null });

test('loadLogState starts fresh when nothing is stored', () => {
  assert.deepEqual(loadLogState('2026-10-23', memory()), fresh('2026-10-23'));
});
test('loadLogState ignores a state saved on another day', () => {
  const st = memory();
  saveLogState({ ...fresh('2026-10-22'), courseIds: ['a'], drop: { exerciseId: 'e', groupId: 'g', dropIndex: 1 } }, st);
  assert.deepEqual(loadLogState('2026-10-23', st), fresh('2026-10-23'));
});
test('loadLogState starts fresh on malformed JSON', () => {
  const st = memory();
  st.setItem('gachi_log_state', '{oops');
  assert.deepEqual(loadLogState('2026-10-23', st), fresh('2026-10-23'));
});
test('saveLogState and loadLogState round-trip the same day', () => {
  const st = memory();
  const state = { ...fresh('2026-10-23'), courseIds: ['a', 'b'], courseName: '自宅 プッシュ',
    superset: { exerciseIds: ['a', 'b'], index: 1, groupId: 'g1' }, drop: null };
  saveLogState(state, st);
  assert.deepEqual(loadLogState('2026-10-23', st), state);
});
test('loadLogState and saveLogState tolerate a throwing storage', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(loadLogState('2026-10-23', bad), fresh('2026-10-23'));
  assert.doesNotThrow(() => saveLogState(fresh('2026-10-23'), bad));
});
