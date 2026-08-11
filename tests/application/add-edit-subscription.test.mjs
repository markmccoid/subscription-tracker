import assert from 'node:assert/strict';
import test from 'node:test';

import { SubscriptionTracker } from '../../src/application/subscription-tracker.ts';
import { InMemoryHouseholdRepository } from '../../src/data/in-memory-household-repository.ts';

function createHarness() {
  const repository = new InMemoryHouseholdRepository();
  let id = 1;
  let now = new Date('2026-08-09T15:00:00.000Z');
  const tracker = new SubscriptionTracker({
    repository,
    createId: () => `10000000-0000-4000-8000-${(id++).toString(16).padStart(12, '0')}`,
    now: () => now,
  });
  return { repository, tracker, setNow: (value) => { now = new Date(value); } };
}

test('adds a complete Standard Subscription, Default Payment Method, and today occurrence', async () => {
  const { repository, tracker } = createHarness();
  await tracker.initialize();
  const paymentMethod = await tracker.addPaymentMethod({ name: 'Household Visa', note: 'Shared bills' });

  const result = await tracker.addStandardSubscription({
    name: 'Example Cloud',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    anchorDay: 9,
    categoryId: '20000000-0000-4000-8000-000000000006',
    defaultPaymentMethodId: paymentMethod.id,
    reminderLeadDaysOverride: 7,
    notificationsMuted: true,
    note: 'Family storage',
    cancellationUrl: 'https://example.com/cancel',
  });

  assert.equal(result.status, 'saved');
  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.paymentMethods.length, 1);
  assert.equal(snapshot.billingOccurrences.length, 1);
  assert.equal(snapshot.billingOccurrences[0].expectedAmount, 1299);

  const detail = await tracker.loadSubscriptionDetail(result.subscriptionId);
  assert.equal(detail.defaultPaymentMethodName, 'Household Visa');
  assert.equal(detail.note, 'Family storage');
  assert.equal(detail.cancellationUrl, 'https://example.com/cancel');
  assert.equal(detail.reminderLeadDaysOverride, 7);
  assert.equal(detail.notificationsMuted, true);
});

test('warns for a Possible Duplicate and allows an explicit Save Anyway', async () => {
  const { tracker } = createHarness();
  await tracker.initialize();
  await tracker.addStandardSubscription({
    name: 'Video Plus',
    amountCents: 999,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-10',
  });

  const duplicate = await tracker.addStandardSubscription({
    name: '  video plus  ',
    amountCents: 999,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-13',
  });
  assert.equal(duplicate.status, 'possibleDuplicate');

  const saved = await tracker.addStandardSubscription({
    name: 'video plus',
    amountCents: 999,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-13',
    savePossibleDuplicate: true,
  });
  assert.equal(saved.status, 'saved');
  assert.equal((await tracker.loadSubscriptions()).length, 2);
});

test('editing current terms retains elapsed occurrence amount and identity', async () => {
  const { repository, tracker, setNow } = createHarness();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'Music',
    amountCents: 1099,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    anchorDay: 9,
  });
  assert.equal(added.status, 'saved');
  const before = (await repository.loadSnapshot()).billingOccurrences[0];

  setNow('2026-09-09T15:00:00.000Z');
  const edited = await tracker.editStandardSubscription({
    subscriptionId: added.subscriptionId,
    name: 'Music Family',
    amountCents: 1599,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    anchorDay: 9,
  });
  assert.equal(edited.status, 'saved');

  const occurrences = (await repository.loadSnapshot()).billingOccurrences;
  const after = occurrences[0];
  assert.equal(after.id, before.id);
  assert.equal(after.expectedAmount, 1099);
  assert.deepEqual(occurrences.map(({ billingDate, expectedAmount }) => ({ billingDate, expectedAmount })), [
    { billingDate: '2026-08-09', expectedAmount: 1099 },
    { billingDate: '2026-09-09', expectedAmount: 1099 },
  ]);
  const detail = await tracker.loadSubscriptionDetail(added.subscriptionId);
  assert.equal(detail.name, 'Music Family');
  assert.equal(detail.pricing.standardAmount, 1599);
});

test('schedule edits require a future date and preserve the former schedule occurrence', async () => {
  const { repository, tracker, setNow } = createHarness();
  await tracker.initialize();
  const added = await tracker.addStandardSubscription({
    name: 'News',
    amountCents: 500,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    anchorDay: 9,
  });
  assert.equal(added.status, 'saved');
  setNow('2026-08-10T15:00:00.000Z');

  await assert.rejects(() => tracker.editStandardSubscription({
    subscriptionId: added.subscriptionId,
    name: 'News',
    amountCents: 500,
    cycle: 'yearly',
    scheduleStartDate: '2026-08-10',
    anchorDay: 10,
  }), /after today/);

  const edited = await tracker.editStandardSubscription({
    subscriptionId: added.subscriptionId,
    name: 'News',
    amountCents: 5000,
    cycle: 'yearly',
    scheduleStartDate: '2026-09-10',
    anchorDay: 10,
  });
  assert.equal(edited.status, 'saved');
  const snapshot = await repository.loadSnapshot();
  assert.deepEqual(snapshot.billingOccurrences.map(({ billingDate, expectedAmount }) => ({ billingDate, expectedAmount })), [
    { billingDate: '2026-08-09', expectedAmount: 500 },
  ]);
  assert.equal((await tracker.loadSubscriptionDetail(added.subscriptionId)).nextBillingDate, '2026-09-10');
});

test('Payment Method names are case-insensitively unique', async () => {
  const { tracker } = createHarness();
  await tracker.initialize();
  await tracker.addPaymentMethod({ name: 'Amex' });
  await assert.rejects(() => tracker.addPaymentMethod({ name: '  AMEX  ' }), /already exists/);
});

test('Categories start alphabetized and enforce case-insensitive unique names', async () => {
  const { tracker } = createHarness();
  await tracker.initialize();

  assert.deepEqual(
    (await tracker.loadCategories()).map((category) => category.name),
    ['Entertainment', 'Finance', 'Health', 'News', 'Other', 'Software', 'Utilities'],
  );

  await tracker.addCategory({ name: '  Personal  ' });
  await assert.rejects(() => tracker.addCategory({ name: 'PERSONAL' }), /already exists/);
  await assert.rejects(() => tracker.addCategory({ name: 'uncategorized' }), /reserved/);

  assert.deepEqual(
    (await tracker.loadCategories()).map((category) => category.name),
    ['Entertainment', 'Finance', 'Health', 'News', 'Other', 'Personal', 'Software', 'Utilities'],
  );
});

test('renaming a Category preserves assignments and deleting it moves Subscriptions to Uncategorized', async () => {
  const { repository, tracker } = createHarness();
  await tracker.initialize();
  const category = await tracker.addCategory({ name: 'Streaming' });
  const subscription = await tracker.addStandardSubscription({
    name: 'Movie Club',
    amountCents: 1299,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-09',
    categoryId: category.id,
  });
  assert.equal(subscription.status, 'saved');
  assert.equal((await tracker.loadCategories()).find((item) => item.id === category.id).subscriptionCount, 1);

  await tracker.updateCategory({ categoryId: category.id, name: 'Video Streaming' });
  const renamed = await tracker.loadSubscriptionDetail(subscription.subscriptionId);
  assert.equal(renamed.categoryId, category.id);
  assert.equal(renamed.category, 'Video Streaming');

  await tracker.deleteCategory(category.id);
  const uncategorized = await tracker.loadSubscriptionDetail(subscription.subscriptionId);
  assert.equal(uncategorized.categoryId, null);
  assert.equal(uncategorized.category, null);
  assert.equal((await repository.loadSnapshot()).subscriptions[0].categoryId, null);
});

test('updates, retires, restores, and deletes a Payment Method without rewriting history', async () => {
  const { repository, tracker, setNow } = createHarness();
  await tracker.initialize();
  const paymentMethod = await tracker.addPaymentMethod({ name: 'Everyday Visa', note: 'Old note' });
  const subscription = await tracker.addStandardSubscription({
    name: 'Music',
    amountCents: 1099,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    defaultPaymentMethodId: paymentMethod.id,
  });
  assert.equal(subscription.status, 'saved');
  await tracker.recordPayment({
    subscriptionId: subscription.subscriptionId,
    billingDate: '2026-08-09',
    amountCents: 1099,
    paymentDate: '2026-08-09',
    paymentMethodId: paymentMethod.id,
  });

  assert.deepEqual(await tracker.updatePaymentMethod({
    paymentMethodId: paymentMethod.id,
    name: 'Daily Visa',
    note: 'Primary card',
  }), {
    id: paymentMethod.id,
    name: 'Daily Visa',
    note: 'Primary card',
    retired: false,
    subscriptionCount: 1,
    paymentCount: 1,
  });

  setNow('2026-08-10T15:00:00.000Z');
  await tracker.setPaymentMethodRetired(paymentMethod.id, true);
  const retired = (await tracker.loadPaymentMethods())[0];
  assert.equal(retired.retired, true);
  assert.equal((await tracker.loadSubscriptionDetail(subscription.subscriptionId)).defaultPaymentMethodId, paymentMethod.id);
  await assert.rejects(() => tracker.addStandardSubscription({
    name: 'News',
    amountCents: 500,
    cycle: 'monthly',
    scheduleStartDate: '2026-09-10',
    defaultPaymentMethodId: paymentMethod.id,
  }), /Retired Payment Method/);

  await tracker.setPaymentMethodRetired(paymentMethod.id, false);
  assert.equal((await tracker.loadPaymentMethods())[0].retired, false);

  await tracker.deletePaymentMethod(paymentMethod.id);
  const snapshot = await repository.loadSnapshot();
  assert.equal(snapshot.paymentMethods.length, 0);
  assert.equal(snapshot.subscriptions[0].defaultPaymentMethodId, null);
  assert.equal(snapshot.payments[0].paymentMethodId, null);
  assert.equal(snapshot.payments[0].amount, 1099);
});

test('updating a Payment Method preserves case-insensitive uniqueness', async () => {
  const { tracker } = createHarness();
  await tracker.initialize();
  const visa = await tracker.addPaymentMethod({ name: 'Visa' });
  await tracker.addPaymentMethod({ name: 'Amex' });
  await assert.rejects(
    () => tracker.updatePaymentMethod({ paymentMethodId: visa.id, name: ' AMEX ' }),
    /already exists/,
  );
});
