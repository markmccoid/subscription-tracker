import assert from 'node:assert/strict';
import test from 'node:test';

import { SubscriptionTracker } from '../../src/application/subscription-tracker.ts';
import { InMemoryHouseholdRepository } from '../../src/data/in-memory-household-repository.ts';

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
];

test('initialization, creation, projection, and due reconciliation cross one repository seam', async () => {
  const repository = new InMemoryHouseholdRepository();
  const queue = [...ids];
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => queue.shift(),
    now: () => new Date('2026-08-09T15:00:00.000Z'),
  });

  await tracker.initialize();
  await tracker.addStandardSubscription({
    name: 'Example Monthly',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    anchorDay: 9,
    category: 'software',
  });

  const dashboard = await tracker.loadDashboard();
  assert.equal(dashboard.monthlyCommitmentCents, 1299);
  assert.equal(dashboard.dueNext30DaysCents, 1299);
  assert.deepEqual(dashboard.upcomingChargeGroups.map(({ key, charges }) => ({
    key,
    charges: charges.map(({ name, billingDate, amountCents }) => ({
      name,
      billingDate,
      amountCents,
    })),
  })), [{
    key: 'next7Days',
    charges: [{ name: 'Example Monthly', billingDate: '2026-08-09', amountCents: 1299 }],
  }]);

  assert.deepEqual(await tracker.loadSubscriptions(), [
    {
      id: ids[1],
      name: 'Example Monthly',
      category: 'software',
      lifecycle: 'active',
      amountCents: 1299,
      cycle: 'monthly',
      nextBillingDate: '2026-08-09',
      archived: false,
    },
  ]);

  // Reinitializing reconciles the elapsed occurrence without duplicating it.
  await tracker.initialize();
  await tracker.initialize();
  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.billingOccurrences.length, 1);
  assert.equal(snapshot.billingOccurrences[0].billingDate, '2026-08-09');
});

test('groups unresolved and future Billing Occurrences by the Upcoming time horizons', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  let now = new Date('2026-08-09T15:00:00.000Z');
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `10000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => now,
  });

  await tracker.initialize();
  await tracker.addStandardSubscription({
    name: 'Already Due',
    amountCents: 1000,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
  });

  now = new Date('2026-08-10T15:00:00.000Z');
  await tracker.initialize();
  await tracker.addStandardSubscription({
    name: 'Due Soon',
    amountCents: 2000,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-16',
  });
  await tracker.addStandardSubscription({
    name: 'Inside Rolling Window',
    amountCents: 3000,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-17',
  });
  await tracker.addStandardSubscription({
    name: 'Annual Later',
    amountCents: 12000,
    cycle: 'yearly',
    scheduleStartDate: '2026-12-01',
  });

  const dashboard = await tracker.loadDashboard();

  assert.equal(dashboard.dueNext30DaysCents, 5000);
  assert.deepEqual(
    dashboard.upcomingChargeGroups.map(({ key, charges }) => ({
      key,
      charges: charges.map(({ name, billingDate }) => ({ name, billingDate })),
    })),
    [
      {
        key: 'actionNeeded',
        charges: [{ name: 'Already Due', billingDate: '2026-08-09' }],
      },
      {
        key: 'next7Days',
        charges: [{ name: 'Due Soon', billingDate: '2026-08-16' }],
      },
      {
        key: 'laterThisMonth',
        charges: [{ name: 'Inside Rolling Window', billingDate: '2026-08-17' }],
      },
      {
        key: 'later',
        charges: [
          { name: 'Already Due', billingDate: '2026-09-09' },
          { name: 'Annual Later', billingDate: '2026-12-01' },
        ],
      },
    ],
  );
});

test('records mutually exclusive Payment and No Charge resolutions and removes them from Upcoming', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `20000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => new Date('2026-08-09T15:00:00.000Z'),
  });

  await tracker.initialize();
  const method = await tracker.addPaymentMethod({ name: 'Household Visa' });
  const paidSubscription = await tracker.addStandardSubscription({
    name: 'Paid Today',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    defaultPaymentMethodId: method.id,
  });
  assert.equal(paidSubscription.status, 'saved');

  const before = await tracker.loadBillingOccurrenceDetail(
    paidSubscription.subscriptionId,
    '2026-08-09',
  );
  assert.equal(before.resolution.kind, 'unresolved');
  assert.equal(before.expectedAmountCents, 1299);
  assert.equal(before.defaultPaymentMethodId, method.id);

  await tracker.recordPayment({
    subscriptionId: paidSubscription.subscriptionId,
    billingDate: '2026-08-09',
    amountCents: 1199,
    paymentDate: '2026-08-08',
    paymentMethodId: method.id,
    note: 'Annual credit applied',
  });
  const paid = await tracker.loadBillingOccurrenceDetail(
    paidSubscription.subscriptionId,
    '2026-08-09',
  );
  assert.deepEqual(paid.resolution, {
    kind: 'paid',
    amountCents: 1199,
    paymentDate: '2026-08-08',
    paymentMethodName: 'Household Visa',
    note: 'Annual credit applied',
  });
  await assert.rejects(
    () => tracker.recordNoCharge({
      subscriptionId: paidSubscription.subscriptionId,
      billingDate: '2026-08-09',
      reason: 'Provider waived charge',
    }),
    /already been resolved/,
  );

  const noChargeSubscription = await tracker.addStandardSubscription({
    name: 'Canceled Before Renewal',
    amountCents: 999,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-10',
  });
  assert.equal(noChargeSubscription.status, 'saved');
  await tracker.recordNoCharge({
    subscriptionId: noChargeSubscription.subscriptionId,
    billingDate: '2026-08-10',
    reason: 'Canceled before renewal',
  });

  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.payments.length, 1);
  assert.equal(snapshot.chargeExceptions.length, 1);
  assert.equal(snapshot.billingOccurrences.length, 2);
  assert.equal(snapshot.chargeExceptions[0].reason, 'Canceled before renewal');

  const dashboard = await tracker.loadDashboard();
  assert.equal(dashboard.dueNext30DaysCents, 0);
  assert.deepEqual(
    dashboard.upcomingChargeGroups.flatMap((group) => group.charges).map((charge) => charge.name),
    ['Paid Today', 'Canceled Before Renewal'],
  );
  assert.ok(
    dashboard.upcomingChargeGroups
      .flatMap((group) => group.charges)
      .every((charge) => charge.billingDate.startsWith('2026-09')),
  );
});
