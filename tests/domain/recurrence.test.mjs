import assert from 'node:assert/strict';
import test from 'node:test';

import { calendarDate, cents } from '../../src/domain/primitives.ts';
import {
  amountForOccurrence,
  occurrenceAt,
  occurrencesInRange,
  validatePricing,
  validateSchedule,
} from '../../src/domain/recurrence.ts';

test('a monthly 31st anchor clamps without drifting', () => {
  const schedule = {
    cycle: 'monthly',
    startDate: calendarDate('2026-01-31'),
    anchorDay: 31,
  };

  assert.equal(occurrenceAt(schedule, 1), '2026-02-28');
  assert.equal(occurrenceAt(schedule, 2), '2026-03-31');
  assert.equal(occurrenceAt(schedule, 3), '2026-04-30');
});

test('a yearly leap-day anchor returns to leap day', () => {
  const schedule = {
    cycle: 'yearly',
    startDate: calendarDate('2024-02-29'),
    anchorDay: 29,
  };

  assert.equal(occurrenceAt(schedule, 1), '2025-02-28');
  assert.equal(occurrenceAt(schedule, 4), '2028-02-29');
});

test('range projection includes every elapsed occurrence', () => {
  const schedule = {
    cycle: 'monthly',
    startDate: calendarDate('2026-05-10'),
    anchorDay: 10,
  };

  assert.deepEqual(occurrencesInRange(schedule, calendarDate('2026-06-01'), calendarDate('2026-09-10')), [
    '2026-06-10',
    '2026-07-10',
    '2026-08-10',
    '2026-09-10',
  ]);
});

test('a weekly schedule steps seven days across month and year boundaries', () => {
  const schedule = {
    cycle: 'weekly',
    startDate: calendarDate('2026-12-25'),
    anchorDay: 25,
  };

  assert.equal(occurrenceAt(schedule, 1), '2027-01-01');
  assert.equal(occurrenceAt(schedule, 2), '2027-01-08');
  assert.deepEqual(occurrencesInRange(schedule, calendarDate('2026-12-25'), calendarDate('2027-01-15')), [
    '2026-12-25',
    '2027-01-01',
    '2027-01-08',
    '2027-01-15',
  ]);
});

test('weekly projection stops at its two-hundred-year hard limit', () => {
  const schedule = {
    cycle: 'weekly',
    startDate: calendarDate('2026-08-14'),
    anchorDay: 14,
  };

  const projected = occurrencesInRange(schedule, calendarDate('2026-08-14'), calendarDate('2400-01-01'));
  assert.equal(projected.length, 10440);
});

test('a weekly start date needs no Billing Anchor Day agreement', () => {
  assert.doesNotThrow(() =>
    validateSchedule({
      cycle: 'weekly',
      startDate: calendarDate('2026-08-14'),
      anchorDay: 31,
    }),
  );
  assert.throws(
    () =>
      validateSchedule({
        cycle: 'weekly',
        startDate: calendarDate('2026-08-14'),
        anchorDay: 32,
      }),
    /1 through 31/,
  );
  // The agreement check still applies to the dated cycles.
  assert.throws(() =>
    validateSchedule({
      cycle: 'monthly',
      startDate: calendarDate('2026-08-14'),
      anchorDay: 15,
    }),
  );
});

test('promotion switches amount on its first standard Billing Date', () => {
  const pricing = {
    kind: 'promotion',
    promotionalAmount: cents(500),
    promotionEndDate: calendarDate('2026-11-15'),
    standardAmount: cents(1000),
  };

  assert.equal(amountForOccurrence(pricing, calendarDate('2026-10-15')), 500);
  assert.equal(amountForOccurrence(pricing, calendarDate('2026-11-15')), 1000);
});

test('promotion end must align with the schedule', () => {
  const schedule = {
    cycle: 'monthly',
    startDate: calendarDate('2026-08-15'),
    anchorDay: 15,
  };

  assert.throws(() =>
    validatePricing(schedule, {
      kind: 'promotion',
      promotionalAmount: cents(500),
      promotionEndDate: calendarDate('2026-11-14'),
      standardAmount: cents(1000),
    }),
  );
});

test('explicit fallback anchors must match the selected period', () => {
  assert.doesNotThrow(() =>
    validateSchedule({
      cycle: 'monthly',
      startDate: calendarDate('2026-02-28'),
      anchorDay: 31,
    }),
  );
  assert.throws(() =>
    validateSchedule({
      cycle: 'monthly',
      startDate: calendarDate('2026-02-27'),
      anchorDay: 31,
    }),
  );
});
