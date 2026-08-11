import assert from 'node:assert/strict';
import test from 'node:test';

import { createStandardSubscription } from '../../src/domain/create-subscription.ts';
import { entityId } from '../../src/domain/primitives.ts';
import {
  cancelSubscription,
  editCancellationDetails,
  reactivateSubscription,
} from '../../src/domain/subscription-lifecycle.ts';

function activeSubscription() {
  return createStandardSubscription({
    id: entityId('50000000-0000-4000-8000-000000000001'),
    householdListId: entityId('50000000-0000-4000-8000-000000000002'),
    name: 'Example',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-10',
    now: '2026-08-10T15:00:00.000Z',
  });
}

test('Active and Paused Subscriptions cancel directly with validated dates', () => {
  const paused = {
    ...activeSubscription(),
    lifecycle: { status: 'paused', pauseEndDate: null },
  };
  const canceled = cancelSubscription(paused, {
    confirmationDate: '2026-08-09',
    accessEndDate: '2026-08-31',
    asOf: '2026-08-10',
    now: '2026-08-10T15:00:00.000Z',
  });
  assert.deepEqual(canceled.lifecycle, {
    status: 'canceled',
    cancellationConfirmationDate: '2026-08-09',
    accessEndDate: '2026-08-31',
  });
  assert.throws(
    () => cancelSubscription(activeSubscription(), {
      confirmationDate: '2026-08-11',
      asOf: '2026-08-10',
      now: '2026-08-10T15:00:00.000Z',
    }),
    /cannot be in the future/,
  );
  assert.throws(
    () => cancelSubscription(activeSubscription(), {
      confirmationDate: '2026-08-10',
      accessEndDate: '2026-08-09',
      asOf: '2026-08-10',
      now: '2026-08-10T15:00:00.000Z',
    }),
    /on or after/,
  );
});

test('editing cancellation dates is metadata-only and reactivation requires a future schedule', () => {
  const canceled = cancelSubscription(activeSubscription(), {
    confirmationDate: '2026-08-10',
    asOf: '2026-08-10',
    now: '2026-08-10T15:00:00.000Z',
  });
  const edited = editCancellationDetails(canceled, {
    confirmationDate: '2026-08-09',
    accessEndDate: '2026-08-31',
    asOf: '2026-08-10',
    now: '2026-08-10T16:00:00.000Z',
  });
  assert.deepEqual(edited.schedule, canceled.schedule);
  assert.throws(
    () => reactivateSubscription(edited, {
      nextBillingDate: '2026-08-10',
      asOf: '2026-08-10',
      now: '2026-08-10T17:00:00.000Z',
    }),
    /after today/,
  );
  const active = reactivateSubscription(edited, {
    nextBillingDate: '2026-09-15',
    asOf: '2026-08-10',
    now: '2026-08-10T17:00:00.000Z',
  });
  assert.equal(active.lifecycle.status, 'active');
  assert.deepEqual(active.schedule, {
    cycle: 'monthly',
    startDate: '2026-09-15',
    anchorDay: 15,
  });
});
