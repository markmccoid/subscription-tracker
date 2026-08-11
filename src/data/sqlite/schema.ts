import type { SQLiteDatabase } from 'expo-sqlite';

const schemaVersion = 5;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion > schemaVersion) {
    throw new Error(`Database version ${currentVersion} is newer than supported version ${schemaVersion}.`);
  }
  if (currentVersion === schemaVersion) return;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (currentVersion < 1) {
      await transaction.execAsync(`
        CREATE TABLE household_lists (
          id TEXT PRIMARY KEY NOT NULL,
          currency TEXT NOT NULL CHECK (currency = 'USD'),
          default_reminder_lead_days INTEGER NOT NULL CHECK (default_reminder_lead_days BETWEEN 0 AND 365),
          reminder_time TEXT NOT NULL CHECK (length(reminder_time) = 5),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE payment_methods (
          id TEXT PRIMARY KEY NOT NULL,
          household_list_id TEXT NOT NULL REFERENCES household_lists(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
          note TEXT,
          retired_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE subscriptions (
          id TEXT PRIMARY KEY NOT NULL,
          household_list_id TEXT NOT NULL REFERENCES household_lists(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
          category TEXT CHECK (category IN ('entertainment','software','news','health','utilities','finance','other')),
          note TEXT,
          cancellation_url TEXT,
          default_payment_method_id TEXT REFERENCES payment_methods(id) ON DELETE SET NULL,
          billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
          schedule_start_date TEXT NOT NULL,
          billing_anchor_day INTEGER NOT NULL CHECK (billing_anchor_day BETWEEN 1 AND 31),
          pricing_kind TEXT NOT NULL CHECK (pricing_kind IN ('standard','trial','promotion')),
          standard_amount_cents INTEGER NOT NULL CHECK (standard_amount_cents > 0),
          promotional_amount_cents INTEGER CHECK (promotional_amount_cents > 0),
          trial_conversion_date TEXT,
          promotion_end_date TEXT,
          lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('active','paused','canceled')),
          pause_end_date TEXT,
          cancellation_initiated_date TEXT,
          cancellation_confirmation_date TEXT,
          access_end_date TEXT,
          reminder_lead_days_override INTEGER CHECK (reminder_lead_days_override BETWEEN 0 AND 365),
          notifications_muted INTEGER NOT NULL DEFAULT 0 CHECK (notifications_muted IN (0,1)),
          archived_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (archived_at IS NULL OR lifecycle_status = 'canceled'),
          CHECK (
            (pricing_kind = 'standard' AND promotional_amount_cents IS NULL AND trial_conversion_date IS NULL AND promotion_end_date IS NULL)
            OR (pricing_kind = 'trial' AND promotional_amount_cents IS NULL AND trial_conversion_date IS NOT NULL AND promotion_end_date IS NULL)
            OR (pricing_kind = 'promotion' AND promotional_amount_cents IS NOT NULL AND trial_conversion_date IS NULL AND promotion_end_date IS NOT NULL)
          )
        );

        CREATE INDEX subscriptions_household_idx ON subscriptions(household_list_id);

        CREATE TABLE billing_occurrences (
          id TEXT PRIMARY KEY NOT NULL,
          subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
          billing_date TEXT NOT NULL,
          expected_amount_cents INTEGER NOT NULL CHECK (expected_amount_cents > 0),
          created_at TEXT NOT NULL,
          UNIQUE (subscription_id, billing_date)
        );

        CREATE TABLE payments (
          id TEXT PRIMARY KEY NOT NULL,
          billing_occurrence_id TEXT NOT NULL UNIQUE REFERENCES billing_occurrences(id) ON DELETE CASCADE,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          payment_date TEXT NOT NULL,
          payment_method_id TEXT REFERENCES payment_methods(id) ON DELETE RESTRICT,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE charge_exceptions (
          id TEXT PRIMARY KEY NOT NULL,
          billing_occurrence_id TEXT NOT NULL UNIQUE REFERENCES billing_occurrences(id) ON DELETE CASCADE,
          reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TRIGGER payment_resolution_exclusive
        BEFORE INSERT ON payments
        WHEN EXISTS (SELECT 1 FROM charge_exceptions WHERE billing_occurrence_id = NEW.billing_occurrence_id)
        BEGIN SELECT RAISE(ABORT, 'Billing Occurrence already has a Charge Exception'); END;

        CREATE TRIGGER exception_resolution_exclusive
        BEFORE INSERT ON charge_exceptions
        WHEN EXISTS (SELECT 1 FROM payments WHERE billing_occurrence_id = NEW.billing_occurrence_id)
        BEGIN SELECT RAISE(ABORT, 'Billing Occurrence already has a Payment'); END;

        CREATE TABLE device_state (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        INSERT INTO device_state (key, value) VALUES ('reminderReconciliationNeeded', 'true');
      `);
    }
    if (currentVersion < 2) {
      await transaction.execAsync(`
        CREATE UNIQUE INDEX payment_methods_name_unique_idx
        ON payment_methods (household_list_id, lower(trim(name)));
      `);
    }
    if (currentVersion < 3) {
      await transaction.execAsync(`
        UPDATE household_lists
        SET default_reminder_lead_days = 5
        WHERE default_reminder_lead_days = 3;
      `);
    }
    if (currentVersion < 4) {
      await transaction.execAsync(`
        CREATE TABLE categories (
          id TEXT PRIMARY KEY NOT NULL,
          household_list_id TEXT NOT NULL REFERENCES household_lists(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX categories_name_unique_idx
        ON categories (household_list_id, lower(trim(name)));

        ALTER TABLE subscriptions
        ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;

        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000001', id, 'Entertainment', created_at, updated_at
        FROM household_lists;
        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000002', id, 'Finance', created_at, updated_at
        FROM household_lists;
        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000003', id, 'Health', created_at, updated_at
        FROM household_lists;
        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000004', id, 'News', created_at, updated_at
        FROM household_lists;
        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000005', id, 'Other', created_at, updated_at
        FROM household_lists;
        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000006', id, 'Software', created_at, updated_at
        FROM household_lists;
        INSERT INTO categories (id, household_list_id, name, created_at, updated_at)
        SELECT '20000000-0000-4000-8000-000000000007', id, 'Utilities', created_at, updated_at
        FROM household_lists;

        UPDATE subscriptions
        SET category_id = CASE lower(category)
          WHEN 'entertainment' THEN '20000000-0000-4000-8000-000000000001'
          WHEN 'finance' THEN '20000000-0000-4000-8000-000000000002'
          WHEN 'health' THEN '20000000-0000-4000-8000-000000000003'
          WHEN 'news' THEN '20000000-0000-4000-8000-000000000004'
          WHEN 'other' THEN '20000000-0000-4000-8000-000000000005'
          WHEN 'software' THEN '20000000-0000-4000-8000-000000000006'
          WHEN 'utilities' THEN '20000000-0000-4000-8000-000000000007'
          ELSE NULL
        END;
      `);
    }
    if (currentVersion < 5) {
      await transaction.execAsync(`
        UPDATE subscriptions
        SET lifecycle_status = 'active', cancellation_initiated_date = NULL
        WHERE lifecycle_status = 'cancellationPending';
      `);
    }
    await transaction.execAsync(`PRAGMA user_version = ${schemaVersion};`);
  });
}
