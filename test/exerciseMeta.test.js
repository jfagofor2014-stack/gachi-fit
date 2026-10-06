import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureExerciseMeta } from '../js/lib/exerciseMeta.js';

const PRESETS = [
  { name: 'ベンチプレス', homeOk: false },
  { name: '懸垂', homeOk: true, bodyweight: true },
  { name: 'ダンベルカール', homeOk: true },
];

function makeStore(initial) {
  const store = initial.map((x) => ({ ...x }));
  let writes = 0;
  return {
    store,
    getAllFn: async () => store.map((x) => ({ ...x })),
    putFn: async (v) => {
      writes++;
      const i = store.findIndex((x) => x.id === v.id);
      store[i] = v;
    },
    writes: () => writes,
  };
}

test('ensureExerciseMeta copies flags from the matching preset', async () => {
  const s = makeStore([
    { id: '1', name: 'ベンチプレス' },
    { id: '2', name: '懸垂' },
    { id: '3', name: 'ダンベルカール' },
  ]);
  const n = await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(n, 3);
  assert.deepEqual(s.store.map((e) => [e.homeOk, e.bodyweight]),
    [[false, false], [true, true], [true, false]]);
});

test('ensureExerciseMeta marks custom exercises homeOk:true, bodyweight:false', async () => {
  const s = makeStore([{ id: '1', name: '自作リストカール' }]);
  await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(s.store[0].homeOk, true);
  assert.equal(s.store[0].bodyweight, false);
});

test('ensureExerciseMeta keeps every other field intact', async () => {
  const s = makeStore([{ id: '1', name: '懸垂', bodyPart: '背中/広背筋', cuePresets: ['肩甲骨'], setPattern: '通常' }]);
  await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(s.store[0].bodyPart, '背中/広背筋');
  assert.deepEqual(s.store[0].cuePresets, ['肩甲骨']);
  assert.equal(s.store[0].setPattern, '通常');
});

test('ensureExerciseMeta does not overwrite an exercise that already has homeOk', async () => {
  const s = makeStore([{ id: '1', name: 'ベンチプレス', homeOk: true, bodyweight: false }]);
  const n = await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(n, 0);
  assert.equal(s.writes(), 0);
  assert.equal(s.store[0].homeOk, true);
});

test('ensureExerciseMeta is a no-op on the second run', async () => {
  const s = makeStore([{ id: '1', name: 'ベンチプレス' }]);
  await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  const before = s.writes();
  const n = await ensureExerciseMeta(s.getAllFn, s.putFn, PRESETS);
  assert.equal(n, 0);
  assert.equal(s.writes(), before);
});
