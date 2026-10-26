import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupConsecutiveSets } from '../js/lib/groupSets.js';

test('groupConsecutiveSets returns one entry per set when ungrouped', () => {
  const sets = [{ id: 'a' }, { id: 'b' }];
  const groups = groupConsecutiveSets(sets);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { groupId: null, groupType: null, sets: [sets[0]] });
  assert.deepEqual(groups[1], { groupId: null, groupType: null, sets: [sets[1]] });
});

test('groupConsecutiveSets merges consecutive sets sharing groupId', () => {
  const sets = [
    { id: 'a', groupId: 'g1', groupType: 'superset' },
    { id: 'b', groupId: 'g1', groupType: 'superset' },
    { id: 'c' },
  ];
  const groups = groupConsecutiveSets(sets);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].groupType, 'superset');
  assert.equal(groups[0].sets.length, 2);
  assert.equal(groups[1].groupId, null);
});

test('groupConsecutiveSets does not merge same groupId across a gap', () => {
  const sets = [
    { id: 'a', groupId: 'g1', groupType: 'dropset' },
    { id: 'b' },
    { id: 'c', groupId: 'g1', groupType: 'dropset' },
  ];
  const groups = groupConsecutiveSets(sets);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].sets.length, 1);
  assert.equal(groups[2].sets.length, 1);
});

test('groupConsecutiveSets returns empty array for empty input', () => {
  assert.deepEqual(groupConsecutiveSets([]), []);
});
