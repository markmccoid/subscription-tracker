import assert from 'node:assert/strict';
import test from 'node:test';

import { SQLiteHouseholdRepository } from '../../src/data/sqlite/sqlite-household-repository.ts';
import { migrateDatabase } from '../../src/data/sqlite/schema.ts';
import { createStandardSubscription } from '../../src/domain/create-subscription.ts';
import { createChargeException, createPayment } from '../../src/domain/occurrence-resolution.ts';
import { createCancellationEvent } from '../../src/domain/lifecycle-event.ts';
import { calendarDate, cents, entityId, utcTimestamp } from '../../src/domain/primitives.ts';

const ids = {
  household: entityId('10000000-0000-4000-8000-000000000001'),
  subscription: entityId('10000000-0000-4000-8000-000000000002'),
  occurrence: entityId('10000000-0000-4000-8000-000000000003'),
  payment: entityId('10000000-0000-4000-8000-000000000004'),
  lifecycleEvent: entityId('10000000-0000-4000-8000-000000000006'),
};

class FakeDatabase {
  calls = [];
  transactionCount = 0;
  userVersion = 0;
  foreignKeyViolations = [];

  async execAsync(sql) {
    this.calls.push({ method: 'exec', sql, transaction: false });
  }

  async getFirstAsync(sql) {
    this.calls.push({ method: 'first', sql, transaction: false });
    if (sql === 'PRAGMA user_version') return { user_version: this.userVersion };
    return null;
  }

  async getAllAsync(sql) {
    this.calls.push({ method: 'all', sql, transaction: false });
    return [];
  }

  async runAsync(sql, ...args) {
    this.calls.push({ method: 'run', sql, args, transaction: false });
  }

  async withExclusiveTransactionAsync(callback) {
    this.transactionCount += 1;
    const transaction = {
      execAsync: async (sql) => {
        this.calls.push({ method: 'exec', sql, transaction: true });
      },
      getAllAsync: async (sql) => {
        this.calls.push({ method: 'all', sql, transaction: true });
        return this.foreignKeyViolations;
      },
      runAsync: async (sql, ...args) => {
        this.calls.push({ method: 'run', sql, args, transaction: true });
        return { changes: 1 };
      },
    };
    await callback(transaction);
  }
}

test('schema migration creates managed Categories, Lifecycle Events, and Skipped Weeks and reaches version seven', async () => {
  const database = new FakeDatabase();
  await migrateDatabase(database);
  const transactionSql = database.calls.filter((call) => call.transaction).map((call) => call.sql).join('\n');
  assert.match(transactionSql, /CREATE TABLE payment_methods/);
  assert.match(transactionSql, /CREATE UNIQUE INDEX payment_methods_name_unique_idx/);
  assert.match(transactionSql, /SET default_reminder_lead_days = 5/);
  assert.match(transactionSql, /CREATE UNIQUE INDEX categories_name_unique_idx/);
  assert.match(transactionSql, /ADD COLUMN category_id/);
  assert.match(transactionSql, /SET category_id = CASE lower\(category\)/);
  assert.match(transactionSql, /WHERE lifecycle_status = 'cancellationPending'/);
  assert.match(transactionSql, /CREATE TABLE lifecycle_events/);
  assert.match(transactionSql, /generated_by_lifecycle_event_id/);
  assert.match(transactionSql, /CREATE TABLE subscriptions_new/);
  assert.match(transactionSql, /ALTER TABLE subscriptions_new RENAME TO subscriptions/);
  assert.match(transactionSql, /CREATE INDEX subscriptions_household_idx/);
  assert.match(transactionSql, /CREATE TABLE skipped_weeks/);
  assert.match(transactionSql, /generated_by_skipped_week_id/);
  assert.match(transactionSql, /PRAGMA user_version = 7/);
  assert.equal(database.transactionCount, 1);

  // The rebuild only runs with foreign keys disabled, and re-enables them afterwards.
  const outsideSql = database.calls.filter((call) => !call.transaction).map((call) => call.sql);
  assert.ok(outsideSql.some((sql) => /foreign_keys = OFF/.test(sql)));
  assert.match(outsideSql.at(-1), /foreign_keys = ON/);
});

test('a rebuild that breaks referential integrity aborts the migration', async () => {
  const database = new FakeDatabase();
  database.foreignKeyViolations = [{ table: 'billing_occurrences', rowid: 1 }];

  await assert.rejects(() => migrateDatabase(database), /foreign key violations/);
});

test('planning and clearing a Skipped Week each mark reminders for reconciliation', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);

  await repository.saveSkippedWeek({
    id: entityId('10000000-0000-4000-8000-000000000007'),
    subscriptionId: ids.subscription,
    billingDate: calendarDate('2026-08-21'),
    createdAt: utcTimestamp('2026-08-09T15:00:00.000Z'),
  });
  await repository.deleteSkippedWeek(entityId('10000000-0000-4000-8000-000000000007'));

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 2);
  assert.match(transactionRuns[0].sql, /INSERT INTO skipped_weeks/);
  assert.match(transactionRuns[1].sql, /reminderReconciliationNeeded/);
  assert.match(transactionRuns[2].sql, /DELETE FROM skipped_weeks WHERE id/);
  assert.match(transactionRuns[3].sql, /reminderReconciliationNeeded/);
});

test('pruning stale Skipped Weeks joins the Subscription save transaction', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);
  const subscription = createStandardSubscription({
    id: ids.subscription,
    householdListId: ids.household,
    name: 'Meal Kit',
    amountCents: 8999,
    cycle: 'weekly',
    scheduleStartDate: '2026-08-14',
    now: '2026-08-09T15:00:00.000Z',
  });

  await repository.saveSubscriptionWithOccurrences(subscription, [], {
    deletedIds: [entityId('10000000-0000-4000-8000-000000000007')],
  });

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 3);
  assert.match(transactionRuns[0].sql, /INSERT INTO subscriptions/);
  assert.match(transactionRuns[1].sql, /DELETE FROM skipped_weeks WHERE id/);
  assert.match(transactionRuns[2].sql, /reminderReconciliationNeeded/);
});

test('canceling a Subscription and recording No Charge resolutions share one transaction', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);
  const active = createStandardSubscription({
    id: ids.subscription,
    householdListId: ids.household,
    name: 'Example',
    amountCents: 1200,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    now: '2026-08-09T15:00:00.000Z',
  });
  const canceled = {
    ...active,
    lifecycle: {
      status: 'canceled',
      cancellationConfirmationDate: calendarDate('2026-08-09'),
      accessEndDate: null,
    },
  };
  const exception = createChargeException({
    id: ids.payment,
    billingOccurrenceId: ids.occurrence,
    reason: 'Subscription canceled before charge',
    generatedByLifecycleEventId: ids.lifecycleEvent,
    now: '2026-08-09T15:00:00.000Z',
  });
  const event = createCancellationEvent({
    id: ids.lifecycleEvent,
    subscriptionId: ids.subscription,
    effectiveDate: '2026-08-09',
    now: '2026-08-09T15:00:00.000Z',
  });

  await repository.saveLifecycleChange(canceled, event, [exception]);

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 5);
  assert.match(transactionRuns[0].sql, /INSERT INTO subscriptions/);
  assert.match(transactionRuns[1].sql, /INSERT INTO lifecycle_events/);
  assert.match(transactionRuns[2].sql, /DELETE FROM charge_exceptions/);
  assert.match(transactionRuns[3].sql, /INSERT INTO charge_exceptions/);
  assert.match(transactionRuns[4].sql, /reminderReconciliationNeeded/);
});

test('Subscription upsert, occurrence retention, and reminder marker share one transaction', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);
  const subscription = createStandardSubscription({
    id: ids.subscription,
    householdListId: ids.household,
    name: 'Example',
    amountCents: 1200,
    cycle: 'monthly',
    scheduleStartDate: '2026-08-09',
    now: '2026-08-09T15:00:00.000Z',
  });
  await repository.saveSubscriptionWithOccurrences(subscription, [{
    id: ids.occurrence,
    subscriptionId: ids.subscription,
    billingDate: calendarDate('2026-08-09'),
    expectedAmount: cents(1200),
    createdAt: utcTimestamp('2026-08-09T15:00:00.000Z'),
  }]);

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 3);
  assert.match(transactionRuns[0].sql, /INSERT INTO subscriptions/);
  assert.match(transactionRuns[1].sql, /INSERT OR IGNORE INTO billing_occurrences/);
  assert.match(transactionRuns[2].sql, /reminderReconciliationNeeded/);
});

test('Subscription deletion and reminder marker share one transaction', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);

  await repository.deleteSubscription(ids.subscription);

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 2);
  assert.match(transactionRuns[0].sql, /DELETE FROM subscriptions WHERE id/);
  assert.match(transactionRuns[1].sql, /reminderReconciliationNeeded/);
});

test('retaining a projected occurrence and recording its Payment share one transaction', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);
  const occurrence = {
    id: ids.occurrence,
    subscriptionId: ids.subscription,
    billingDate: calendarDate('2026-09-09'),
    expectedAmount: cents(1200),
    createdAt: utcTimestamp('2026-08-09T15:00:00.000Z'),
  };
  const payment = createPayment({
    id: ids.payment,
    billingOccurrenceId: ids.occurrence,
    amountCents: 1100,
    paymentDate: '2026-09-08',
    now: '2026-08-09T15:00:00.000Z',
  });

  await repository.saveOccurrenceResolution(occurrence, payment);

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 2);
  assert.match(transactionRuns[0].sql, /INSERT OR IGNORE INTO billing_occurrences/);
  assert.match(transactionRuns[1].sql, /INSERT INTO payments/);
});

test('Payment Method deletion clears Subscription and Payment references atomically', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);

  await repository.deletePaymentMethod(entityId('10000000-0000-4000-8000-000000000005'));

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 3);
  assert.match(transactionRuns[0].sql, /UPDATE subscriptions SET default_payment_method_id = NULL/);
  assert.match(transactionRuns[1].sql, /UPDATE payments SET payment_method_id = NULL/);
  assert.match(transactionRuns[2].sql, /DELETE FROM payment_methods/);
});

test('Category deletion moves assigned Subscriptions to Uncategorized atomically', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);

  await repository.deleteCategory(entityId('20000000-0000-4000-8000-000000000001'));

  const transactionRuns = database.calls.filter((call) => call.method === 'run' && call.transaction);
  assert.equal(database.transactionCount, 1);
  assert.equal(transactionRuns.length, 2);
  assert.match(transactionRuns[0].sql, /UPDATE subscriptions SET category_id = NULL/);
  assert.match(transactionRuns[1].sql, /DELETE FROM categories/);
});

test('Payment Method persistence upserts editable and retirement fields', async () => {
  const database = new FakeDatabase();
  const repository = new SQLiteHouseholdRepository(database);
  await repository.savePaymentMethod({
    id: entityId('10000000-0000-4000-8000-000000000005'),
    householdListId: ids.household,
    name: 'Household Visa',
    note: 'Primary',
    retiredAt: null,
    createdAt: utcTimestamp('2026-08-09T15:00:00.000Z'),
    updatedAt: utcTimestamp('2026-08-09T15:00:00.000Z'),
  });
  const run = database.calls.find((call) => call.method === 'run' && !call.transaction);
  assert.match(run.sql, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(run.sql, /retired_at=excluded.retired_at/);
});
