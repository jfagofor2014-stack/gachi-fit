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

const VIEW_W = 140;
const VIEW_H = 150;
const EPS = 0.01;
const numAttr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}="(-?[\\d.]+)"`));
  return m ? parseFloat(m[1]) : null;
};

test('monsterSvg keeps every rect, circle and ellipse inside the viewBox', () => {
  for (let stage = 0; stage <= 5; stage++) {
    for (const mood of MOODS) {
      const svg = monsterSvg(stage, mood);
      for (const tag of svg.match(/<(?:rect|circle|ellipse)\b[^>]*>/g) || []) {
        let box;
        if (tag.startsWith('<rect')) {
          const x = numAttr(tag, 'x');
          const y = numAttr(tag, 'y');
          box = [x, y, x + numAttr(tag, 'width'), y + numAttr(tag, 'height')];
        } else {
          const isCircle = tag.startsWith('<circle');
          const cx = numAttr(tag, 'cx');
          const cy = numAttr(tag, 'cy');
          const rx = numAttr(tag, isCircle ? 'r' : 'rx');
          const ry = isCircle ? rx : numAttr(tag, 'ry');
          box = [cx - rx, cy - ry, cx + rx, cy + ry];
        }
        assert.ok(box.every((v) => Number.isFinite(v)), `${stage}/${mood}: unreadable ${tag}`);
        assert.ok(box[0] >= -EPS && box[1] >= -EPS && box[2] <= VIEW_W + EPS && box[3] <= VIEW_H + EPS,
          `${stage}/${mood}: ${tag} sticks out of the viewBox: ${box.map((v) => v.toFixed(1)).join(',')}`);
      }
    }
  }
});

test('monsterSvg marks every picture as decorative', () => {
  for (let stage = 0; stage <= 5; stage++) {
    for (const mood of MOODS) {
      const svg = monsterSvg(stage, mood);
      assert.ok(svg.includes('aria-hidden="true"') && svg.includes('focusable="false"'), `${stage}/${mood}`);
    }
  }
});

test('monsterSvg holds the weights up when upbeat and drops them when dispirited', () => {
  // 段階4: 持ち上げたダンベルのバーは 4×32、床に落としたものは 26×4
  assert.ok(monsterSvg(4, 'genki').includes('width="4" height="32"'));
  assert.ok(!monsterSvg(4, 'genki').includes('width="26" height="4"'));
  assert.ok(monsterSvg(4, 'shobori').includes('width="26" height="4"'));
  assert.ok(!monsterSvg(4, 'shobori').includes('width="4" height="32"'));
  // 段階5: 頭上のバーベルは幅124、床に落としたものは幅116
  assert.ok(monsterSvg(5, 'genki').includes('width="124" height="5"'));
  assert.ok(monsterSvg(5, 'shobori').includes('width="116" height="4"'));
  assert.ok(!monsterSvg(5, 'shobori').includes('width="124" height="5"'));
});

test('monsterSvg treats object prototype keys as an unknown mood', () => {
  for (const mood of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(monsterSvg(2, mood), monsterSvg(2, 'normal'), mood);
  }
});

test('monsterSvg draws sparkles only for the genki mood', () => {
  const STAR_COLOR = '#ffd24a';
  for (const stage of [0, 3, 4]) {
    assert.ok(monsterSvg(stage, 'genki').includes(STAR_COLOR), `${stage}/genki has sparkles`);
    assert.ok(!monsterSvg(stage, 'normal').includes(STAR_COLOR), `${stage}/normal has no sparkles`);
    assert.ok(!monsterSvg(stage, 'shobori').includes(STAR_COLOR), `${stage}/shobori has no sparkles`);
  }
});
