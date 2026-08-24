import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upcomingPlans, groupPlansByDate, canEditPlan } from '../js/lib/plans.js';

const p = (id, date, startTime, ownerEmail = 'a@example.com') =>
  ({ id, date, startTime, ownerEmail, ownerName: 'A', placeName: 'ジム', note: '' });

test('upcomingPlans excludes past dates', () => {
  const plans = [p('1', '2026-08-23', '19:00'), p('2', '2026-08-24', '19:00')];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['2']);
});

test('upcomingPlans includes today', () => {
  const plans = [p('1', '2026-08-24', '07:00')];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['1']);
});

test('upcomingPlans includes the last day of the window but not the day after', () => {
  const plans = [p('1', '2026-08-30', '19:00'), p('2', '2026-08-31', '19:00')];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['1']);
});

test('upcomingPlans sorts by date then start time', () => {
  const plans = [
    p('1', '2026-08-26', '19:00'),
    p('2', '2026-08-24', '20:00'),
    p('3', '2026-08-24', '07:00'),
  ];
  assert.deepEqual(upcomingPlans(plans, '2026-08-24', 7).map((x) => x.id), ['3', '2', '1']);
});

test('upcomingPlans returns empty array for no plans', () => {
  assert.deepEqual(upcomingPlans([], '2026-08-24', 7), []);
});

test('groupPlansByDate groups by date in ascending order', () => {
  const plans = [
    p('1', '2026-08-24', '07:00'),
    p('2', '2026-08-26', '19:00'),
    p('3', '2026-08-24', '20:00'),
  ];
  const groups = groupPlansByDate(plans);
  assert.deepEqual(groups.map((g) => g.date), ['2026-08-24', '2026-08-26']);
  assert.deepEqual(groups[0].plans.map((x) => x.id), ['1', '3']);
  assert.deepEqual(groups[1].plans.map((x) => x.id), ['2']);
});

test('groupPlansByDate returns empty array for no plans', () => {
  assert.deepEqual(groupPlansByDate([]), []);
});

test('canEditPlan is true for own plan', () => {
  assert.equal(canEditPlan(p('1', '2026-08-24', '19:00', 'me@example.com'), 'me@example.com'), true);
});

test('canEditPlan is false for someone elses plan', () => {
  assert.equal(canEditPlan(p('1', '2026-08-24', '19:00', 'other@example.com'), 'me@example.com'), false);
});

test('canEditPlan is false when ownerEmail is missing', () => {
  assert.equal(canEditPlan({ id: '1', date: '2026-08-24', startTime: '19:00' }, 'me@example.com'), false);
});
