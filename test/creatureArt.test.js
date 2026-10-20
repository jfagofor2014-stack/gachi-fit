import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monsterSvg } from '../js/lib/creatureArt.js';

const MOODS = ['genki', 'normal', 'shobori'];

test('monsterSvg returns a well-formed svg string for every stage and mood', () => {
  for (let stage = 0; stage <= 5; stage++) {
    for (const mood of MOODS) {
      const svg = monsterSvg(stage, mood);
      assert.ok(svg.startsWith('<svg '), `${stage}/${mood} starts with <svg`);
      assert.ok(svg.endsWith('</svg>'), `${stage}/${mood} ends with </svg>`);
      assert.ok(svg.includes('viewBox="0 0 140 150"'), `${stage}/${mood} has the viewBox`);
      assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), `${stage}/${mood} has no NaN or undefined`);
      assert.equal(svg.split('<svg').length, 2, `${stage}/${mood} has one svg element`);
    }
  }
});

test('monsterSvg draws a different picture for every stage and mood', () => {
  const all = new Set();
  for (let stage = 0; stage <= 5; stage++) for (const mood of MOODS) all.add(monsterSvg(stage, mood));
  assert.equal(all.size, 18);
});

test('monsterSvg clamps an out-of-range stage and falls back to normal for an unknown mood', () => {
  assert.equal(monsterSvg(99, 'genki'), monsterSvg(5, 'genki'));
  assert.equal(monsterSvg(-3, 'genki'), monsterSvg(0, 'genki'));
  assert.equal(monsterSvg(2, 'bogus'), monsterSvg(2, 'normal'));
});
