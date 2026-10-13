import type { SQLiteDatabase } from 'expo-sqlite';

const schemaVersion = 7;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion > schemaVersion) {
    throw new Error(`Database version ${currentVersion} is newer than supported version ${schemaVersion}.`);
  }
  if (currentVersion === schemaVersion) return;

  // Version seven rebuilds `subscriptions`, which other tables reference. SQLite's documented table
  // rebuild requires foreign keys disabled outside the transaction, and legacy rename semantics so
  // the interim drop does not rewrite the referencing tables. Integrity is re-checked before commit.
  await db.execAsync('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  try {
    await runMigrations(db, currentVersion);
  } finally {
    await db.execAsync('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;');
  }
}

async function runMigrations(db: SQLiteDatabase, currentVersion: number): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const migration of schemaMigrations) {
      if (currentVersion >= migration.version) continue;
      await transaction.execAsync(migration.sql);
      if (migration.version === 7) {
        const violations = await transaction.getAllAsync('PRAGMA foreign_key_check');
        if (violations.length > 0) {
          throw new Error('Rebuilding the subscriptions table left foreign key violations behind.');
        }
      }
    }
    await transaction.execAsync(`PRAGMA user_version = ${schemaVersion};`);
  });
}

/** Ordered, append-only schema steps. Each entry is frozen once it ships. */
export const schemaMigrations: readonly { readonly version: number; readonly sql: string }[] = [
  {
    version: 1,
    sql: `
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
`,
  },
  {
    version: 2,
    sql: `
        CREATE UNIQUE INDEX payment_methods_name_unique_idx
        ON payment_methods (household_list_id, lower(trim(name)));
`,
  },
  {
    version: 3,
    sql: `
        UPDATE household_lists
        SET default_reminder_lead_days = 5
        WHERE default_reminder_lead_days = 3;
`,
  },
  {
    version: 4,
    sql: `
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
`,
  },
  {
    version: 5,
    sql: `
        UPDATE subscriptions
        SET lifecycle_status = 'active', cancellation_initiated_date = NULL
        WHERE lifecycle_status = 'cancellationPending';
`,
  },
  {
    version: 6,
    sql: `
        CREATE TABLE lifecycle_events (
          id TEXT PRIMARY KEY NOT NULL,
          subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('paused','resumed','canceled','reactivated')),
          effective_date TEXT NOT NULL,
          pause_end_date TEXT,
          next_billing_date TEXT,
          access_end_date TEXT,
          pricing_kind TEXT CHECK (pricing_kind IN ('standard','trial','promotion')),
          standard_amount_cents INTEGER,
          promotional_amount_cents INTEGER,
          trial_conversion_date TEXT,
          promotion_end_date TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX lifecycle_events_subscription_date_idx
        ON lifecycle_events (subscription_id, effective_date DESC, created_at DESC);

        ALTER TABLE charge_exceptions
        ADD COLUMN generated_by_lifecycle_event_id TEXT
        REFERENCES lifecycle_events(id) ON DELETE CASCADE;

        INSERT INTO lifecycle_events (
          id, subscription_id, kind, effective_date, pause_end_date, access_end_date,
          created_at, updated_at
        )
        SELECT id, id, 'canceled', cancellation_confirmation_date, NULL, access_end_date,
          updated_at, updated_at
        FROM subscriptions
        WHERE lifecycle_status = 'canceled' AND cancellation_confirmation_date IS NOT NULL;

        INSERT INTO lifecycle_events (
          id, subscription_id, kind, effective_date, pause_end_date, access_end_date,
          created_at, updated_at
        )
        SELECT id, id, 'paused', substr(updated_at, 1, 10), pause_end_date, NULL,
          updated_at, updated_at
        FROM subscriptions
        WHERE lifecycle_status = 'paused';
`,
  },
  {
    version: 7,
    sql: `
        CREATE TABLE subscriptions_new (
          id TEXT PRIMARY KEY NOT NULL,
          household_list_id TEXT NOT NULL REFERENCES household_lists(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
          category TEXT CHECK (category IN ('entertainment','software','news','health','utilities','finance','other')),
          category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
          note TEXT,
          cancellation_url TEXT,
          default_payment_method_id TEXT REFERENCES payment_methods(id) ON DELETE SET NULL,
          billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly','weekly')),
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
          show_skipped_weeks INTEGER NOT NULL DEFAULT 0 CHECK (show_skipped_weeks IN (0,1)),
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

        INSERT INTO subscriptions_new (
          id, household_list_id, name, category, category_id, note, cancellation_url,
          default_payment_method_id, billing_cycle, schedule_start_date, billing_anchor_day,
          pricing_kind, standard_amount_cents, promotional_amount_cents, trial_conversion_date,
          promotion_end_date, lifecycle_status, pause_end_date, cancellation_initiated_date,
          cancellation_confirmation_date, access_end_date, reminder_lead_days_override,
          notifications_muted, show_skipped_weeks, archived_at, created_at, updated_at
        )
        SELECT
          id, household_list_id, name, category, category_id, note, cancellation_url,
          default_payment_method_id, billing_cycle, schedule_start_date, billing_anchor_day,
          pricing_kind, standard_amount_cents, promotional_amount_cents, trial_conversion_date,
          promotion_end_date, lifecycle_status, pause_end_date, cancellation_initiated_date,
          cancellation_confirmation_date, access_end_date, reminder_lead_days_override,
          notifications_muted, 0, archived_at, created_at, updated_at
        FROM subscriptions;

        DROP TABLE subscriptions;
        ALTER TABLE subscriptions_new RENAME TO subscriptions;
        CREATE INDEX subscriptions_household_idx ON subscriptions(household_list_id);

        CREATE TABLE skipped_weeks (
          id TEXT PRIMARY KEY NOT NULL,
          subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
          billing_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (subscription_id, billing_date)
        );

        ALTER TABLE charge_exceptions
        ADD COLUMN generated_by_skipped_week_id TEXT
        REFERENCES skipped_weeks(id) ON DELETE CASCADE;
`,
  },
];
