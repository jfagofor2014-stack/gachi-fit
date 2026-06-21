import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarWeeks } from '../js/lib/calendar.js';

test('buildCalendarWeeks aligns first day under correct weekday (Sunday start)', () => {
  const weeks = buildCalendarWeeks(2026, 6);
  assert.equal(weeks[0][0], null);
  assert.equal(weeks[0][1], '2026-06-01');
});

test('buildCalendarWeeks has all days of the month', () => {
  const weeks = buildCalendarWeeks(2026, 6);
  const flat = weeks.flat().filter(Boolean);
  assert.equal(flat.length, 30);
  assert.equal(flat[0], '2026-06-01');
  assert.equal(flat[flat.length - 1], '2026-06-30');
});

test('buildCalendarWeeks rows are length 7', () => {
  const weeks = buildCalendarWeeks(2026, 6);
  for (const w of weeks) assert.equal(w.length, 7);
});

test('buildCalendarWeeks handles February non-leap year', () => {
  const weeks = buildCalendarWeeks(2026, 2);
  const flat = weeks.flat().filter(Boolean);
  assert.equal(flat.length, 28);
  assert.equal(flat[flat.length - 1], '2026-02-28');
});
