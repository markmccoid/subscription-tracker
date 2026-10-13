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
const softwareCategoryId = '20000000-0000-4000-8000-000000000006';

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
    categoryId: softwareCategoryId,
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
      categoryId: softwareCategoryId,
      category: 'Software',
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

test('notification settings default to five days and produce one future reminder per eligible Subscription', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `15000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => new Date(2026, 7, 9, 8, 0, 0),
  });

  await tracker.initialize();
  assert.deepEqual(await tracker.loadNotificationSettings(), {
    defaultReminderLeadDays: 5,
    reminderTime: '09:00',
  });
  await tracker.addStandardSubscription({
    name: 'Included',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-20',
  });
  await tracker.addStandardSubscription({
    name: 'Muted',
    amountCents: 999,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-21',
    notificationsMuted: true,
  });

  const [plan] = await tracker.loadBillingReminderPlans();
  assert.equal(plan.subscriptionName, 'Included');
  assert.equal(plan.billingDate, '2026-08-20');
  assert.deepEqual(
    [plan.triggerDate.getFullYear(), plan.triggerDate.getMonth() + 1, plan.triggerDate.getDate(), plan.triggerDate.getHours()],
    [2026, 8, 15, 9],
  );

  await tracker.updateDefaultReminderLeadDays(7);
  assert.equal((await tracker.loadNotificationSettings()).defaultReminderLeadDays, 7);
  await assert.rejects(() => tracker.updateDefaultReminderLeadDays(366), /whole number from 0 to 365/);
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

test('cancellation resolves backdated uncharged occurrences and removes every future projection', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  let now = new Date('2026-08-09T15:00:00.000Z');
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `30000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => now,
  });

  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Late Cancellation',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    cancellationUrl: 'https://example.com/cancel',
  });
  assert.equal(added.status, 'saved');
  await tracker.recordPayment({
    subscriptionId: added.subscriptionId,
    billingDate: '2026-08-09',
    amountCents: 1299,
    paymentDate: '2026-08-09',
  });

  now = new Date('2026-10-09T15:00:00.000Z');
  await tracker.initialize();
  const preview = await tracker.loadCancellationPreview(added.subscriptionId, '2026-09-01');
  assert.deepEqual(preview.affectedOccurrences, [
    { billingDate: '2026-09-09', expectedAmountCents: 1299 },
    { billingDate: '2026-10-09', expectedAmountCents: 1299 },
  ]);

  await tracker.cancelSubscription({
    subscriptionId: added.subscriptionId,
    confirmationDate: '2026-09-01',
    accessEndDate: '2026-10-31',
  });

  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.payments.length, 1);
  assert.equal(snapshot.chargeExceptions.length, 2);
  assert.ok(snapshot.chargeExceptions.every((item) => item.reason === 'Subscription canceled before charge'));
  const detail = await tracker.loadSubscriptionDetail(added.subscriptionId);
  assert.deepEqual(detail.lifecycle, {
    status: 'canceled',
    cancellationConfirmationDate: '2026-09-01',
    accessEndDate: '2026-10-31',
  });
  assert.equal(detail.nextBillingDate, null);
  assert.equal((await tracker.loadBillingReminderPlans()).length, 0);
  const dashboard = await tracker.loadDashboard();
  assert.equal(dashboard.monthlyCommitmentCents, 0);
  assert.equal(dashboard.dueNext30DaysCents, 0);
  assert.deepEqual(dashboard.upcomingChargeGroups, []);
});

test('cancellation details can be corrected and reactivation starts a new schedule without rewriting history', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  let now = new Date('2026-08-09T15:00:00.000Z');
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `40000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => now,
  });
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Return Later',
    amountCents: 900,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
  });
  assert.equal(added.status, 'saved');
  await tracker.cancelSubscription({
    subscriptionId: added.subscriptionId,
    confirmationDate: '2026-08-09',
  });
  const exceptionsBefore = (await repository.loadSnapshot()).chargeExceptions;

  await tracker.editCancellationDetails({
    subscriptionId: added.subscriptionId,
    confirmationDate: '2026-08-08',
    accessEndDate: '2026-08-31',
  });
  assert.deepEqual((await tracker.loadSubscriptionDetail(added.subscriptionId)).lifecycle, {
    status: 'canceled',
    cancellationConfirmationDate: '2026-08-08',
    accessEndDate: '2026-08-31',
  });
  assert.deepEqual((await repository.loadSnapshot()).chargeExceptions, exceptionsBefore);

  now = new Date('2026-08-10T15:00:00.000Z');
  await tracker.reactivateSubscription({
    subscriptionId: added.subscriptionId,
    nextBillingDate: '2026-09-15',
  });
  const reactivated = await tracker.loadSubscriptionDetail(added.subscriptionId);
  assert.equal(reactivated.lifecycle.status, 'active');
  assert.equal(reactivated.nextBillingDate, '2026-09-15');
  assert.equal(reactivated.schedule.anchorDay, 15);
  assert.deepEqual((await repository.loadSnapshot()).chargeExceptions, exceptionsBefore);
});

test('deleting a Subscription permanently removes its complete history', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  let now = new Date('2026-08-09T15:00:00.000Z');
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `45000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => now,
  });
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Entered By Mistake',
    amountCents: 1200,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
  });
  assert.equal(added.status, 'saved');
  await tracker.recordPayment({
    subscriptionId: added.subscriptionId,
    billingDate: '2026-08-09',
    amountCents: 1200,
    paymentDate: '2026-08-09',
  });
  now = new Date('2026-10-09T15:00:00.000Z');
  await tracker.initialize();
  await tracker.cancelSubscription({
    subscriptionId: added.subscriptionId,
    confirmationDate: '2026-09-01',
  });

  const before = await repository.loadSnapshot();
  assert.equal(before.subscriptions.length, 1);
  assert.equal(before.billingOccurrences.length, 3);
  assert.equal(before.payments.length, 1);
  assert.equal(before.chargeExceptions.length, 2);
  assert.equal(before.lifecycleEvents.length, 1);

  await tracker.deleteSubscription(added.subscriptionId);

  const after = await repository.loadSnapshot();
  assert.equal(after.subscriptions.length, 0);
  assert.equal(after.billingOccurrences.length, 0);
  assert.equal(after.payments.length, 0);
  assert.equal(after.chargeExceptions.length, 0);
  assert.equal(after.lifecycleEvents.length, 0);
  await assert.rejects(
    () => tracker.loadSubscriptionDetail(added.subscriptionId),
    /Subscription not found/,
  );
});

test('History uses Payment Date, current Category settings, and keeps Charge Exceptions out of Recorded Spend', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `50000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => new Date('2026-08-10T15:00:00.000Z'),
  });
  await tracker.initialize();
  const entertainment = (await tracker.loadCategories()).find((item) => item.name === 'Entertainment');
  assert.ok(entertainment);
  const added = await tracker.addStandardSubscription({
    name: 'Streaming',
    amountCents: 1500,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-10',
    categoryId: entertainment.id,
  });
  assert.equal(added.status, 'saved');
  await tracker.recordPayment({
    subscriptionId: added.subscriptionId,
    billingDate: '2026-08-10',
    amountCents: 1200,
    paymentDate: '2026-08-09',
  });

  const august = await tracker.loadHistory({ from: '2026-08-01', to: '2026-08-31' });
  assert.equal(august.recordedSpendCents, 1200);
  assert.equal(august.activities[0].activityDate, '2026-08-09');
  assert.equal(august.categoryBreakdown[0].name, 'Entertainment');

  await tracker.updateCategory({ categoryId: entertainment.id, name: 'Media' });
  const regrouped = await tracker.loadHistory({ from: '2026-08-01', to: '2026-08-31' });
  assert.equal(regrouped.recordedSpendCents, 1200);
  assert.equal(regrouped.categoryBreakdown[0].name, 'Media');
});

test('pause and resume retain Lifecycle Events and a planned pause resumes on initialization', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  let now = new Date('2026-08-10T15:00:00.000Z');
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `60000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => now,
  });
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Gym',
    amountCents: 3000,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-01',
  });
  assert.equal(added.status, 'saved');
  await tracker.pauseSubscription({
    subscriptionId: added.subscriptionId,
    effectiveDate: '2026-08-10',
    pauseEndDate: '2026-09-10',
  });
  assert.equal((await tracker.loadSubscriptionDetail(added.subscriptionId)).lifecycle.status, 'paused');

  now = new Date('2026-09-12T15:00:00.000Z');
  await tracker.initialize();
  const detail = await tracker.loadSubscriptionDetail(added.subscriptionId);
  assert.equal(detail.lifecycle.status, 'active');
  assert.equal(detail.schedule.startDate, '2026-09-10');
  const history = await tracker.loadHistory({ from: '2026-08-01', to: '2026-09-30' });
  assert.deepEqual(history.activities.map((item) => item.kind), ['resumed', 'paused']);
  assert.equal((await repository.loadSnapshot()).lifecycleEvents.length, 2);
});

test('deleting a Cancellation event restores the prior lifecycle and removes only its generated exceptions', async () => {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `70000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => new Date('2026-08-10T15:00:00.000Z'),
  });
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Correction',
    amountCents: 1100,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-10',
  });
  assert.equal(added.status, 'saved');
  await tracker.cancelSubscription({
    subscriptionId: added.subscriptionId,
    confirmationDate: '2026-08-10',
  });
  const canceled = await repository.loadSnapshot();
  assert.equal(canceled.lifecycleEvents.length, 1);
  assert.equal(canceled.chargeExceptions.length, 1);

  await tracker.deleteLifecycleEvent(canceled.lifecycleEvents[0].id);
  const corrected = await repository.loadSnapshot();
  assert.equal(corrected.lifecycleEvents.length, 0);
  assert.equal(corrected.chargeExceptions.length, 0);
  assert.equal((await tracker.loadSubscriptionDetail(added.subscriptionId)).lifecycle.status, 'active');
});

/** Today is Sunday 2026-08-09; the weekly schedules below deliver on Fridays. */
function weeklyTracker(start = new Date('2026-08-09T15:00:00.000Z')) {
  const repository = new InMemoryHouseholdRepository();
  let idSequence = 1;
  const clock = { now: start };
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `30000000-0000-4000-8000-${String(idSequence++).padStart(12, '0')}`,
    now: () => clock.now,
  });
  return { repository, tracker, clock };
}

test('a weekly Subscription excludes its planned Skipped Weeks from Upcoming totals', async () => {
  const { tracker } = weeklyTracker();
  await tracker.initialize();

  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-21'],
  });
  assert.equal(added.status, 'saved');

  const dashboard = await tracker.loadDashboard();
  // Three of the four in-window Fridays still deliver.
  assert.equal(dashboard.dueNext30DaysCents, 8999 * 3);
  // A weekly amount normalizes as 52/12 regardless of skips.
  assert.equal(dashboard.monthlyCommitmentCents, Math.round((8999 * 52) / 12));
  assert.deepEqual(
    dashboard.upcomingChargeGroups.map(({ key, charges }) => ({
      key,
      charges: charges.map(({ billingDate, cycle, skipped }) => ({ billingDate, cycle, skipped })),
    })),
    [
      {
        key: 'next7Days',
        charges: [{ billingDate: '2026-08-14', cycle: 'weekly', skipped: false }],
      },
      {
        key: 'laterThisMonth',
        charges: [
          { billingDate: '2026-08-21', cycle: 'weekly', skipped: true },
          { billingDate: '2026-08-28', cycle: 'weekly', skipped: false },
          { billingDate: '2026-09-04', cycle: 'weekly', skipped: false },
        ],
      },
    ],
  );

  const [listItem] = await tracker.loadSubscriptions();
  assert.equal(listItem.cycle, 'weekly');
  assert.equal(listItem.nextBillingDate, '2026-08-14');

  const detail = await tracker.loadSubscriptionDetail(added.subscriptionId);
  assert.equal(detail.showSkippedWeeks, true);
  assert.equal(detail.schedule.anchorDay, 14);
});

test('ghost rows disappear when a weekly Subscription hides its Skipped Weeks', async () => {
  const { tracker } = weeklyTracker();
  await tracker.initialize();

  await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-21'],
    showSkippedWeeks: false,
  });

  const dashboard = await tracker.loadDashboard();
  const charges = dashboard.upcomingChargeGroups.flatMap((group) => group.charges);
  assert.equal(charges.some((charge) => charge.skipped), false);
  assert.deepEqual(charges.map((charge) => charge.billingDate), [
    '2026-08-14',
    '2026-08-28',
    '2026-09-04',
  ]);
  assert.equal(dashboard.dueNext30DaysCents, 8999 * 3);
});

test('a fully skipped window moves a weekly Subscription to Later at its next delivery', async () => {
  const { tracker } = weeklyTracker();
  await tracker.initialize();

  await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04'],
  });

  const dashboard = await tracker.loadDashboard();
  assert.equal(dashboard.dueNext30DaysCents, 0);
  const later = dashboard.upcomingChargeGroups.find((group) => group.key === 'later');
  assert.deepEqual(later.charges.map((charge) => charge.billingDate), ['2026-09-11']);
  assert.equal(later.charges[0].skipped, false);
  // The skipped weeks still render as ghosts inside the rolling window only.
  const ghosts = dashboard.upcomingChargeGroups
    .flatMap((group) => group.charges)
    .filter((charge) => charge.skipped)
    .map((charge) => charge.billingDate);
  assert.deepEqual(ghosts, ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04']);

  const [listItem] = await tracker.loadSubscriptions();
  assert.equal(listItem.nextBillingDate, '2026-09-11');
});

test('skipping and resuming a week round-trips and retargets the Billing Reminder', async () => {
  const { repository, tracker } = weeklyTracker(new Date(2026, 7, 9, 8, 0, 0));
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
  });

  const [before] = await tracker.loadBillingReminderPlans();
  assert.equal(before.billingDate, '2026-08-14');

  await tracker.skipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-14' });
  assert.equal((await repository.loadSnapshot()).skippedWeeks.length, 1);
  const [after] = await tracker.loadBillingReminderPlans();
  assert.equal(after.billingDate, '2026-08-21');

  await assert.rejects(
    () => tracker.skipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-14' }),
    /already skipped/,
  );
  await assert.rejects(
    () => tracker.skipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-15' }),
    /projected Billing Date/,
  );

  await tracker.unskipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-14' });
  assert.equal((await repository.loadSnapshot()).skippedWeeks.length, 0);
  await assert.rejects(
    () => tracker.unskipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-14' }),
    /not skipped/,
  );
});

test('an elapsed Skipped Week resolves itself instead of becoming Action Needed', async () => {
  const { repository, tracker, clock } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-14'],
  });

  clock.now = new Date('2026-08-15T15:00:00.000Z');
  await tracker.initialize();

  const snapshot = await repository.loadSnapshot();
  const occurrence = snapshot.billingOccurrences.find((item) => item.billingDate === '2026-08-14');
  assert.ok(occurrence);
  assert.equal(occurrence.expectedAmount, 8999);
  assert.equal(snapshot.chargeExceptions.length, 1);
  assert.equal(snapshot.chargeExceptions[0].reason, 'Skipped week');
  assert.equal(snapshot.chargeExceptions[0].generatedBySkippedWeekId, snapshot.skippedWeeks[0].id);
  assert.equal(snapshot.chargeExceptions[0].generatedByLifecycleEventId, null);
  assert.equal(snapshot.chargeExceptions[0].billingOccurrenceId, occurrence.id);

  const dashboard = await tracker.loadDashboard();
  assert.equal(dashboard.upcomingChargeGroups.some((group) => group.key === 'actionNeeded'), false);

  const detail = await tracker.loadBillingOccurrenceDetail(added.subscriptionId, '2026-08-14');
  assert.equal(detail.resolution.kind, 'noCharge');
  assert.equal(detail.resolution.reason, 'Skipped week');
  assert.equal(detail.resolution.generatedBySkippedWeekId, snapshot.skippedWeeks[0].id);

  // Reconciling again neither duplicates the occurrence nor its Generated Charge Exception.
  await tracker.initialize();
  const reconciled = await repository.loadSnapshot();
  assert.equal(reconciled.billingOccurrences.length, 1);
  assert.equal(reconciled.chargeExceptions.length, 1);
});

test('removing a materialized skip returns the week to Action Needed so a Payment can be recorded', async () => {
  const { repository, tracker, clock } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-14'],
  });
  clock.now = new Date('2026-08-15T15:00:00.000Z');
  await tracker.initialize();

  const [skippedWeek] = (await repository.loadSnapshot()).skippedWeeks;
  await tracker.removeMaterializedSkip({ skippedWeekId: skippedWeek.id });

  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.skippedWeeks.length, 0);
  assert.equal(snapshot.chargeExceptions.length, 0);
  assert.equal(snapshot.billingOccurrences.length, 1);

  const dashboard = await tracker.loadDashboard();
  const actionNeeded = dashboard.upcomingChargeGroups.find((group) => group.key === 'actionNeeded');
  assert.deepEqual(actionNeeded.charges.map((charge) => charge.billingDate), ['2026-08-14']);

  await tracker.recordPayment({
    subscriptionId: added.subscriptionId,
    billingDate: '2026-08-14',
    amountCents: 8999,
    paymentDate: '2026-08-14',
  });
  assert.equal((await repository.loadSnapshot()).payments.length, 1);

  // A week the provider actually charged can no longer be skipped again.
  await assert.rejects(
    () => tracker.skipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-14' }),
    /past week/,
  );
});

test('editing a weekly schedule prunes only the future skips it no longer projects', async () => {
  const { repository, tracker, clock } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-14', '2026-08-21'],
  });

  // Let the first skip elapse so it becomes retained history.
  clock.now = new Date('2026-08-15T15:00:00.000Z');
  await tracker.initialize();

  // Moving the schedule from Friday to Monday strands the remaining Friday skip.
  await tracker.editStandardSubscription({
    subscriptionId: added.subscriptionId,
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-17',
  });

  const snapshot = await repository.loadSnapshot();
  assert.deepEqual(snapshot.skippedWeeks.map((skip) => skip.billingDate), ['2026-08-14']);
  assert.equal(snapshot.chargeExceptions.length, 1);
  assert.equal(snapshot.chargeExceptions[0].reason, 'Skipped week');
});

test('leaving the Weekly cycle clears future Skipped Weeks but keeps their history', async () => {
  const { repository, tracker, clock } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-14', '2026-08-21', '2026-08-28'],
  });
  clock.now = new Date('2026-08-15T15:00:00.000Z');
  await tracker.initialize();

  await tracker.editStandardSubscription({
    subscriptionId: added.subscriptionId,
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-14',
    anchorDay: 14,
  });

  const snapshot = await repository.loadSnapshot();
  assert.deepEqual(snapshot.skippedWeeks.map((skip) => skip.billingDate), ['2026-08-14']);
  assert.equal(snapshot.subscriptions[0].showSkippedWeeks, false);
  assert.equal((await tracker.loadSubscriptionDetail(added.subscriptionId)).showSkippedWeeks, false);
});

test('resuming a paused weekly Subscription strands the skips its new schedule misses', async () => {
  const { repository, tracker, clock } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-21', '2026-08-28'],
  });

  await tracker.pauseSubscription({ subscriptionId: added.subscriptionId, effectiveDate: '2026-08-09' });
  // Pausing leaves the planned skips in place because they project nothing while paused.
  assert.equal((await repository.loadSnapshot()).skippedWeeks.length, 2);

  await tracker.resumeSubscription({
    subscriptionId: added.subscriptionId,
    nextBillingDate: '2026-08-17',
  });
  assert.equal((await repository.loadSnapshot()).skippedWeeks.length, 0);
});

test('canceling a weekly Subscription does not re-resolve weeks a skip already settled', async () => {
  const { repository, tracker, clock } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-21'],
  });

  clock.now = new Date('2026-08-25T15:00:00.000Z');
  await tracker.initialize();

  const preview = await tracker.loadCancellationPreview(added.subscriptionId, '2026-08-10');
  assert.deepEqual(preview.affectedOccurrences.map((item) => item.billingDate), ['2026-08-14']);

  await tracker.cancelSubscription({
    subscriptionId: added.subscriptionId,
    confirmationDate: '2026-08-10',
  });

  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.chargeExceptions.length, 2);
  assert.deepEqual(
    [...snapshot.chargeExceptions]
      .sort((left, right) => left.reason.localeCompare(right.reason))
      .map((exception) => exception.reason),
    ['Skipped week', 'Subscription canceled before charge'],
  );
  const skipException = snapshot.chargeExceptions.find((item) => item.reason === 'Skipped week');
  assert.equal(skipException.generatedBySkippedWeekId, snapshot.skippedWeeks[0].id);
  assert.equal(skipException.generatedByLifecycleEventId, null);
});

test('the Week Planner offers the next eight weeks with a live thirty-day summary', async () => {
  const { tracker } = weeklyTracker();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    initialSkippedDates: ['2026-08-21'],
  });

  const planner = await tracker.loadWeekPlanner(added.subscriptionId);
  assert.equal(planner.name, 'Meal Kit');
  assert.equal(planner.weekday, 'Friday');
  assert.equal(planner.perWeekAmountCents, 8999);
  assert.equal(planner.weeks.length, 8);
  assert.deepEqual(planner.weeks.map((week) => week.billingDate), [
    '2026-08-14',
    '2026-08-21',
    '2026-08-28',
    '2026-09-04',
    '2026-09-11',
    '2026-09-18',
    '2026-09-25',
    '2026-10-02',
  ]);
  assert.deepEqual(planner.weeks.map((week) => week.skipped), [
    false, true, false, false, false, false, false, false,
  ]);
  assert.equal(planner.weeks.every((week) => week.togglable), true);
  assert.equal(planner.next30DaysDeliveries, 3);
  assert.equal(planner.next30DaysCents, 8999 * 3);

  await tracker.skipWeek({ subscriptionId: added.subscriptionId, billingDate: '2026-08-28' });
  const replanned = await tracker.loadWeekPlanner(added.subscriptionId);
  assert.equal(replanned.next30DaysDeliveries, 2);
  assert.equal(replanned.next30DaysCents, 8999 * 2);
});

test('the Week Planner is unavailable for non-weekly and non-active Subscriptions', async () => {
  const { tracker } = weeklyTracker();
  await tracker.initialize();
  const monthly = await tracker.addStandardSubscription({
    name: 'Streaming',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-14',
  });
  const weekly = await tracker.addStandardSubscription({
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
  });

  await assert.rejects(() => tracker.loadWeekPlanner(monthly.subscriptionId), /Weekly Subscription/);
  await tracker.pauseSubscription({ subscriptionId: weekly.subscriptionId, effectiveDate: '2026-08-09' });
  await assert.rejects(() => tracker.loadWeekPlanner(weekly.subscriptionId), /Active Subscriptions only/);
});
