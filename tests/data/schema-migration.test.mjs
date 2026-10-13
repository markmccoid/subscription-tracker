import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { migrateDatabase, schemaMigrations } from '../../src/data/sqlite/schema.ts';

/** Adapts node:sqlite to the slice of the expo-sqlite surface the migration uses. */
class NodeSQLiteDatabase {
  constructor(database) {
    this.database = database;
  }

  async execAsync(sql) {
    this.database.exec(sql);
  }

  async getFirstAsync(sql) {
    return this.database.prepare(sql).get() ?? null;
  }

  async getAllAsync(sql) {
    return this.database.prepare(sql).all();
  }

  async runAsync(sql, ...args) {
    const result = this.database.prepare(sql).run(...args);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async withExclusiveTransactionAsync(callback) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await callback(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const timestamp = '2026-08-09T15:00:00.000Z';

/** Builds a populated version-six database using the frozen historical migration steps. */
function seedVersionSixDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  for (const migration of schemaMigrations) {
    if (migration.version > 6) break;
    database.exec(migration.sql);
  }
  database.exec(`
    INSERT INTO household_lists (id, currency, default_reminder_lead_days, reminder_time, created_at, updated_at)
    VALUES ('household-1', 'USD', 5, '09:00', '${timestamp}', '${timestamp}');

    INSERT INTO payment_methods (id, household_list_id, name, note, retired_at, created_at, updated_at)
    VALUES ('method-1', 'household-1', 'Household Visa', NULL, NULL, '${timestamp}', '${timestamp}');

    INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
    VALUES ('20000000-0000-4000-8000-000000000001', 'household-1', 'Entertainment', '${timestamp}', '${timestamp}');

    INSERT INTO subscriptions (
      id, household_list_id, name, category, category_id, note, cancellation_url,
      default_payment_method_id, billing_cycle, schedule_start_date, billing_anchor_day,
      pricing_kind, standard_amount_cents, lifecycle_status, reminder_lead_days_override,
      notifications_muted, archived_at, created_at, updated_at
    ) VALUES (
      'subscription-1', 'household-1', 'Streaming', NULL, '20000000-0000-4000-8000-000000000001',
      'A note', 'https://example.com/cancel', 'method-1', 'monthly', '2026-08-09', 9,
      'standard', 1299, 'active', 3, 1, NULL, '${timestamp}', '${timestamp}'
    );

    INSERT INTO billing_occurrences (id, subscription_id, billing_date, expected_amount_cents, created_at)
    VALUES ('occurrence-1', 'subscription-1', '2026-08-09', 1299, '${timestamp}');

    INSERT INTO charge_exceptions (id, billing_occurrence_id, reason, created_at, updated_at)
    VALUES ('exception-1', 'occurrence-1', 'Provider skipped', '${timestamp}', '${timestamp}');

    INSERT INTO lifecycle_events (id, subscription_id, kind, effective_date, created_at, updated_at)
    VALUES ('event-1', 'subscription-1', 'paused', '2026-08-01', '${timestamp}', '${timestamp}');

    PRAGMA user_version = 6;
  `);
  return database;
}

test('version seven rebuilds subscriptions without losing rows, columns, or referential integrity', async () => {
  const database = seedVersionSixDatabase();

  await migrateDatabase(new NodeSQLiteDatabase(database));

  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 7);
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);

  const subscription = database.prepare('SELECT * FROM subscriptions').get();
  assert.equal(subscription.id, 'subscription-1');
  assert.equal(subscription.name, 'Streaming');
  assert.equal(subscription.note, 'A note');
  assert.equal(subscription.cancellation_url, 'https://example.com/cancel');
  assert.equal(subscription.default_payment_method_id, 'method-1');
  assert.equal(subscription.category_id, '20000000-0000-4000-8000-000000000001');
  assert.equal(subscription.billing_anchor_day, 9);
  assert.equal(subscription.reminder_lead_days_override, 3);
  assert.equal(subscription.notifications_muted, 1);
  assert.equal(subscription.show_skipped_weeks, 0);

  // The children of the rebuilt table survive, and its index is restored.
  assert.equal(database.prepare('SELECT count(*) AS total FROM billing_occurrences').get().total, 1);
  assert.equal(database.prepare('SELECT count(*) AS total FROM lifecycle_events').get().total, 1);
  assert.equal(database.prepare('SELECT count(*) AS total FROM charge_exceptions').get().total, 1);
  assert.equal(
    database
      .prepare("SELECT count(*) AS total FROM sqlite_master WHERE type = 'index' AND name = 'subscriptions_household_idx'")
      .get().total,
    1,
  );

  database.close();
});

test('version seven accepts the Weekly Billing Cycle and enforces one Skipped Week per date', async () => {
  const database = seedVersionSixDatabase();
  await migrateDatabase(new NodeSQLiteDatabase(database));

  database.exec(`
    INSERT INTO subscriptions (
      id, household_list_id, name, category_id, billing_cycle, schedule_start_date,
      billing_anchor_day, pricing_kind, standard_amount_cents, lifecycle_status,
      notifications_muted, show_skipped_weeks, created_at, updated_at
    ) VALUES (
      'subscription-2', 'household-1', 'Meal Kit', NULL, 'weekly', '2026-08-14', 14,
      'standard', 8999, 'active', 0, 1, '${timestamp}', '${timestamp}'
    );

    INSERT INTO skipped_weeks (id, subscription_id, billing_date, created_at)
    VALUES ('skip-1', 'subscription-2', '2026-08-21', '${timestamp}');
  `);

  assert.throws(
    () =>
      database.exec(`
        INSERT INTO skipped_weeks (id, subscription_id, billing_date, created_at)
        VALUES ('skip-2', 'subscription-2', '2026-08-21', '${timestamp}');
      `),
    /UNIQUE/,
  );
  assert.throws(
    () =>
      database.exec(`
        UPDATE subscriptions SET billing_cycle = 'daily' WHERE id = 'subscription-2';
      `),
    /CHECK/,
  );

  database.close();
});

test('deleting a Skipped Week cascades to its Generated Charge Exception', async () => {
  const database = seedVersionSixDatabase();
  await migrateDatabase(new NodeSQLiteDatabase(database));

  database.exec(`
    INSERT INTO subscriptions (
      id, household_list_id, name, billing_cycle, schedule_start_date, billing_anchor_day,
      pricing_kind, standard_amount_cents, lifecycle_status, notifications_muted,
      show_skipped_weeks, created_at, updated_at
    ) VALUES (
      'subscription-2', 'household-1', 'Meal Kit', 'weekly', '2026-08-14', 14,
      'standard', 8999, 'active', 0, 1, '${timestamp}', '${timestamp}'
    );

    INSERT INTO skipped_weeks (id, subscription_id, billing_date, created_at)
    VALUES ('skip-1', 'subscription-2', '2026-08-21', '${timestamp}');

    INSERT INTO billing_occurrences (id, subscription_id, billing_date, expected_amount_cents, created_at)
    VALUES ('occurrence-2', 'subscription-2', '2026-08-21', 8999, '${timestamp}');

    INSERT INTO charge_exceptions (
      id, billing_occurrence_id, reason, generated_by_skipped_week_id, created_at, updated_at
    ) VALUES ('exception-2', 'occurrence-2', 'Skipped week', 'skip-1', '${timestamp}', '${timestamp}');
  `);

  database.exec("DELETE FROM skipped_weeks WHERE id = 'skip-1'");
  assert.equal(
    database.prepare("SELECT count(*) AS total FROM charge_exceptions WHERE id = 'exception-2'").get().total,
    0,
  );
  // The Billing Occurrence itself returns to unresolved rather than disappearing.
  assert.equal(
    database.prepare("SELECT count(*) AS total FROM billing_occurrences WHERE id = 'occurrence-2'").get().total,
    1,
  );

  // Deleting the Subscription still removes its Skipped Weeks.
  database.exec(`
    INSERT INTO skipped_weeks (id, subscription_id, billing_date, created_at)
    VALUES ('skip-3', 'subscription-2', '2026-08-28', '${timestamp}');
  `);
  database.exec("DELETE FROM subscriptions WHERE id = 'subscription-2'");
  assert.equal(database.prepare('SELECT count(*) AS total FROM skipped_weeks').get().total, 0);

  database.close();
});
