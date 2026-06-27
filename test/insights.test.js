import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagFrequency, tag1RMCorrelation } from '../js/lib/insights.js';

test('tagFrequency counts tags descending', () => {
  const logs = [
    { tags: ['調子良い', '腹圧抜けた'] },
    { tags: ['腹圧抜けた'] },
    { tags: [] },
  ];
  assert.deepEqual(tagFrequency(logs), [
    { tag: '腹圧抜けた', count: 2 },
    { tag: '調子良い', count: 1 },
  ]);
});

test('tag1RMCorrelation compares avg estimated1RM per tag', () => {
  const logs = [
    { tags: ['軽く感じた'], setId: 's1' },
    { tags: ['軽く感じた'], setId: 's2' },
    { tags: ['重い'], setId: 's3' },
  ];
  const sets = [
    { id: 's1', estimated1RM: 100 },
    { id: 's2', estimated1RM: 110 },
    { id: 's3', estimated1RM: 80 },
  ];
  const res = tag1RMCorrelation(logs, sets, 5);
  const light = res.find((r) => r.tag === '軽く感じた');
  assert.equal(light.direction, 'higher');
});
