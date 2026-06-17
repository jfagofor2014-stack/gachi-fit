import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultSetPatterns, DEFAULT_SET_PATTERNS } from '../js/lib/seed.js';

test('ensureDefaultSetPatterns seeds defaults when store empty', async () => {
  const store = [];
  const getAllFn = async () => store;
  const putFn = async (v) => { store.push(v); };
  let counter = 0;
  const uidFn = () => 'id' + (counter++);
  await ensureDefaultSetPatterns(getAllFn, putFn, uidFn);
  assert.equal(store.length, DEFAULT_SET_PATTERNS.length);
  assert.deepEqual(store.map((s) => s.name), DEFAULT_SET_PATTERNS);
});

test('ensureDefaultSetPatterns does nothing when store has items', async () => {
  const store = [{ id: 'x', name: '通常' }];
  const getAllFn = async () => store;
  const putFn = async (v) => { store.push(v); };
  await ensureDefaultSetPatterns(getAllFn, putFn, () => 'id');
  assert.equal(store.length, 1);
});
