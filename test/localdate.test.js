import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateStr } from '../js/lib/localdate.js';

test('localDateStr formats local date as YYYY-MM-DD', () => {
  // ローカル時刻の構成要素で判定するためタイムゾーン非依存
  assert.equal(localDateStr(new Date(2026, 5, 17, 8, 39)), '2026-06-17');
  assert.equal(localDateStr(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('localDateStr does not roll over near UTC midnight in +0900-like local morning', () => {
  // ローカルの朝でも当日になる（UTC変換しない）
  assert.equal(localDateStr(new Date(2026, 5, 17, 0, 0)), '2026-06-17');
});
