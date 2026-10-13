import assert from 'node:assert/strict';
import test from 'node:test';

import { createStandardSubscription } from '../../src/domain/create-subscription.ts';
import { calendarDate, entityId } from '../../src/domain/primitives.ts';
import {
  assertSkipRemovable,
  createSkippedWeek,
  isDateSkipped,
  staleFutureSkips,
} from '../../src/domain/week-skips.ts';

const ids = {
  household: entityId('10000000-0000-4000-8000-000000000001'),
  subscription: entityId('10000000-0000-4000-8000-000000000002'),
  skip: entityId('10000000-0000-4000-8000-000000000003'),
  otherSkip: entityId('10000000-0000-4000-8000-000000000004'),
};
const now = '2026-08-09T15:00:00.000Z';
const asOf = calendarDate('2026-08-09');

function weeklySubscription(overrides = {}) {
  return {
    ...createStandardSubscription({
      id: ids.subscription,
      householdListId: ids.household,
      name: 'Meal Kit',
      amountCents: 8999,
      cycle: 'weekly',
      scheduleStartDate: '2026-08-14',
      now,
    }),
    ...overrides,
  };
}

function skipInput(overrides = {}) {
  return {
    id: ids.skip,
    subscription: weeklySubscription(),
    billingDate: '2026-08-21',
    existingSkips: [],
    asOf,
    now,
    ...overrides,
  };
}

test('a planned Skipped Week records the subscription, date, and creation time', () => {
  const skip = createSkippedWeek(skipInput());

  assert.equal(skip.id, ids.skip);
  assert.equal(skip.subscriptionId, ids.subscription);
  assert.equal(skip.billingDate, '2026-08-21');
  assert.equal(skip.createdAt, now);
});

test('only an active, unarchived, weekly Subscription can plan a Skipped Week', () => {
  const monthly = createStandardSubscription({
    id: ids.subscription,
    householdListId: ids.household,
    name: 'Streaming',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-14',
    now,
  });

  assert.throws(
    () => createSkippedWeek(skipInput({ subscription: monthly, billingDate: '2026-09-14' })),
    /Weekly Subscription/,
  );
  assert.throws(
    () =>
      createSkippedWeek(
        skipInput({ subscription: weeklySubscription({ lifecycle: { status: 'paused', pauseEndDate: null } }) }),
      ),
    /Active Subscription/,
  );
  assert.throws(
    () =>
      createSkippedWeek(
        skipInput({
          subscription: weeklySubscription({
            lifecycle: {
              status: 'canceled',
              cancellationConfirmationDate: calendarDate('2026-08-01'),
              accessEndDate: null,
            },
          }),
        }),
      ),
    /Active Subscription/,
  );
  assert.throws(
    () => createSkippedWeek(skipInput({ subscription: weeklySubscription({ archivedAt: now }) })),
    /Archived/,
  );
});

test('a Skipped Week must fall on an unbilled, future, not-yet-skipped projected date', () => {
  assert.throws(() => createSkippedWeek(skipInput({ billingDate: '2026-08-20' })), /projected Billing Date/);
  assert.throws(
    () =>
      createSkippedWeek(
        skipInput({
          subscription: weeklySubscription({
            schedule: { cycle: 'weekly', startDate: calendarDate('2026-07-03'), anchorDay: 3 },
          }),
          billingDate: '2026-08-07',
        }),
      ),
    /past week/,
  );
  assert.throws(
    () => createSkippedWeek(skipInput({ occurrenceMaterialized: true })),
    /already been billed/,
  );

  const existing = createSkippedWeek(skipInput());
  assert.throws(
    () => createSkippedWeek(skipInput({ id: ids.otherSkip, existingSkips: [existing] })),
    /already skipped/,
  );
});

test('today may be skipped while its Billing Occurrence has not materialized', () => {
  const subscription = weeklySubscription({
    schedule: { cycle: 'weekly', startDate: calendarDate('2026-08-09'), anchorDay: 9 },
  });

  const skip = createSkippedWeek(skipInput({ subscription, billingDate: '2026-08-09' }));
  assert.equal(skip.billingDate, '2026-08-09');
});

test('skip lookup matches on Subscription and date together', () => {
  const skip = createSkippedWeek(skipInput());

  assert.equal(isDateSkipped([skip], ids.subscription, calendarDate('2026-08-21')), true);
  assert.equal(isDateSkipped([skip], ids.subscription, calendarDate('2026-08-28')), false);
  assert.equal(isDateSkipped([skip], ids.otherSkip, calendarDate('2026-08-21')), false);
});

test('a schedule change that shifts the weekday strands its future skips', () => {
  const skips = [
    createSkippedWeek(skipInput()),
    createSkippedWeek(skipInput({ id: ids.otherSkip, billingDate: '2026-08-28', existingSkips: [] })),
  ];
  const past = { ...skips[0], billingDate: calendarDate('2026-08-01') };

  // Friday schedule resumed onto a Monday: neither Friday remains projected.
  const moved = weeklySubscription({
    schedule: { cycle: 'weekly', startDate: calendarDate('2026-08-17'), anchorDay: 17 },
  });
  assert.deepEqual(
    staleFutureSkips([...skips, past], moved, asOf).map((skip) => skip.billingDate),
    ['2026-08-21', '2026-08-28'],
  );

  // The unchanged schedule strands nothing, and elapsed skips are never pruned.
  assert.deepEqual(staleFutureSkips([...skips, past], weeklySubscription(), asOf), []);

  // Leaving the Weekly cycle strands every future skip.
  const monthly = weeklySubscription({
    schedule: { cycle: 'monthly', startDate: calendarDate('2026-09-14'), anchorDay: 14 },
  });
  assert.equal(staleFutureSkips(skips, monthly, asOf).length, 2);
});

test('a skip is removable unless another resolution owns its Billing Occurrence', () => {
  const skip = createSkippedWeek(skipInput());

  assert.doesNotThrow(() => assertSkipRemovable(skip, { kind: 'unresolved' }));
  assert.doesNotThrow(() =>
    assertSkipRemovable(skip, { kind: 'exception', generatedBySkippedWeekId: skip.id }),
  );
  assert.throws(() => assertSkipRemovable(skip, { kind: 'payment' }), /recorded Payment/);
  assert.throws(
    () => assertSkipRemovable(skip, { kind: 'exception', generatedBySkippedWeekId: null }),
    /separately recorded No Charge/,
  );
});
