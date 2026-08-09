import type { SQLiteDatabase } from 'expo-sqlite';

import type { HouseholdRepository } from '@/data/household-repository';
import {
  categories,
  type BillingOccurrence,
  type Category,
  type ChargeException,
  type ChargeExceptionId,
  type HouseholdList,
  type HouseholdSnapshot,
  type Payment,
  type PaymentId,
  type PaymentMethod,
  type PaymentMethodId,
  type Subscription,
} from '@/domain/model';
import {
  calendarDate,
  cents,
  entityId,
  utcTimestamp,
  type CalendarDate,
} from '@/domain/primitives';
import { validatePricing, validateSchedule } from '@/domain/recurrence';

import { migrateDatabase } from './schema';

type HouseholdRow = {
  id: string;
  currency: 'USD';
  default_reminder_lead_days: number;
  reminder_time: string;
  created_at: string;
  updated_at: string;
};

type SubscriptionRow = {
  id: string;
  household_list_id: string;
  name: string;
  category: string | null;
  note: string | null;
  cancellation_url: string | null;
  default_payment_method_id: string | null;
  billing_cycle: 'monthly' | 'yearly';
  schedule_start_date: string;
  billing_anchor_day: number;
  pricing_kind: 'standard' | 'trial' | 'promotion';
  standard_amount_cents: number;
  promotional_amount_cents: number | null;
  trial_conversion_date: string | null;
  promotion_end_date: string | null;
  lifecycle_status: 'active' | 'paused' | 'cancellationPending' | 'canceled';
  pause_end_date: string | null;
  cancellation_initiated_date: string | null;
  cancellation_confirmation_date: string | null;
  access_end_date: string | null;
  reminder_lead_days_override: number | null;
  notifications_muted: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type OccurrenceRow = {
  id: string;
  subscription_id: string;
  billing_date: string;
  expected_amount_cents: number;
  created_at: string;
};

type PaymentMethodRow = {
  id: string;
  household_list_id: string;
  name: string;
  note: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  billing_occurrence_id: string;
  amount_cents: number;
  payment_date: string;
  payment_method_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type ChargeExceptionRow = {
  id: string;
  billing_occurrence_id: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export class SQLiteHouseholdRepository implements HouseholdRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  migrate(): Promise<void> {
    return migrateDatabase(this.db);
  }

  async getHousehold(): Promise<HouseholdList | null> {
    const row = await this.db.getFirstAsync<HouseholdRow>('SELECT * FROM household_lists LIMIT 1');
    return row ? householdFromRow(row) : null;
  }

  async createHousehold(household: HouseholdList): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO household_lists
       (id, currency, default_reminder_lead_days, reminder_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      household.id,
      household.currency,
      household.defaultReminderLeadDays,
      household.reminderTime,
      household.createdAt,
      household.updatedAt,
    );
  }

  async loadSnapshot(): Promise<HouseholdSnapshot> {
    const household = await this.getHousehold();
    if (!household) throw new Error('Household List has not been initialized.');
    const [subscriptionRows, occurrenceRows, paymentRows, exceptionRows, paymentMethodRows] = await Promise.all([
      this.db.getAllAsync<SubscriptionRow>('SELECT * FROM subscriptions ORDER BY name COLLATE NOCASE'),
      this.db.getAllAsync<OccurrenceRow>(
        'SELECT * FROM billing_occurrences ORDER BY billing_date, subscription_id',
      ),
      this.db.getAllAsync<PaymentRow>('SELECT * FROM payments ORDER BY payment_date DESC, created_at DESC'),
      this.db.getAllAsync<ChargeExceptionRow>('SELECT * FROM charge_exceptions ORDER BY created_at DESC'),
      this.db.getAllAsync<PaymentMethodRow>(
        'SELECT * FROM payment_methods ORDER BY name COLLATE NOCASE',
      ),
    ]);
    return {
      household,
      subscriptions: subscriptionRows.map(subscriptionFromRow),
      billingOccurrences: occurrenceRows.map(occurrenceFromRow),
      payments: paymentRows.map(paymentFromRow),
      chargeExceptions: exceptionRows.map(chargeExceptionFromRow),
      paymentMethods: paymentMethodRows.map(paymentMethodFromRow),
    };
  }

  async saveSubscription(subscription: Subscription): Promise<void> {
    await this.saveSubscriptionWithOccurrences(subscription, []);
  }

  async saveSubscriptionWithOccurrences(
    subscription: Subscription,
    occurrences: readonly BillingOccurrence[],
  ): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      await upsertSubscription(transaction, subscription);
      for (const occurrence of occurrences) {
        await insertOccurrence(transaction, occurrence);
      }
      await transaction.runAsync(
        `UPDATE device_state SET value = 'true' WHERE key = 'reminderReconciliationNeeded'`,
      );
    });
  }

  async saveBillingOccurrences(occurrences: readonly BillingOccurrence[]): Promise<void> {
    if (occurrences.length === 0) return;
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      for (const occurrence of occurrences) {
        await insertOccurrence(transaction, occurrence);
      }
    });
  }

  async savePaymentMethod(paymentMethod: PaymentMethod): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO payment_methods
       (id, household_list_id, name, note, retired_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, note=excluded.note, retired_at=excluded.retired_at,
         updated_at=excluded.updated_at`,
      paymentMethod.id,
      paymentMethod.householdListId,
      paymentMethod.name,
      paymentMethod.note,
      paymentMethod.retiredAt,
      paymentMethod.createdAt,
      paymentMethod.updatedAt,
    );
  }

  async deletePaymentMethod(paymentMethodId: PaymentMethodId): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        'UPDATE subscriptions SET default_payment_method_id = NULL WHERE default_payment_method_id = ?',
        paymentMethodId,
      );
      await transaction.runAsync(
        'UPDATE payments SET payment_method_id = NULL WHERE payment_method_id = ?',
        paymentMethodId,
      );
      const result = await transaction.runAsync('DELETE FROM payment_methods WHERE id = ?', paymentMethodId);
      if (result.changes === 0) throw new Error('Payment Method not found.');
    });
  }

  async saveOccurrenceResolution(
    occurrence: BillingOccurrence,
    resolution: Payment | ChargeException,
  ): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      await insertOccurrence(transaction, occurrence);
      if ('paymentDate' in resolution) {
        await transaction.runAsync(
          `INSERT INTO payments
           (id, billing_occurrence_id, amount_cents, payment_date, payment_method_id, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          resolution.id,
          resolution.billingOccurrenceId,
          resolution.amount,
          resolution.paymentDate,
          resolution.paymentMethodId,
          resolution.note,
          resolution.createdAt,
          resolution.updatedAt,
        );
      } else {
        await transaction.runAsync(
          `INSERT INTO charge_exceptions
           (id, billing_occurrence_id, reason, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          resolution.id,
          resolution.billingOccurrenceId,
          resolution.reason,
          resolution.createdAt,
          resolution.updatedAt,
        );
      }
    });
  }
}

function householdFromRow(row: HouseholdRow): HouseholdList {
  return {
    id: entityId<'HouseholdList'>(row.id),
    currency: 'USD',
    defaultReminderLeadDays: row.default_reminder_lead_days,
    reminderTime: row.reminder_time,
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
  };
}

function subscriptionFromRow(row: SubscriptionRow): Subscription {
  const schedule = validateSchedule({
    cycle: row.billing_cycle,
    startDate: calendarDate(row.schedule_start_date),
    anchorDay: row.billing_anchor_day,
  });
  const pricing = validatePricing(
    schedule,
    row.pricing_kind === 'trial'
      ? {
          kind: 'trial',
          trialConversionDate: requiredDate(row.trial_conversion_date, 'trial conversion'),
          standardAmount: cents(row.standard_amount_cents),
        }
      : row.pricing_kind === 'promotion'
        ? {
            kind: 'promotion',
            promotionalAmount: cents(requiredNumber(row.promotional_amount_cents, 'promotional amount')),
            promotionEndDate: requiredDate(row.promotion_end_date, 'promotion end'),
            standardAmount: cents(row.standard_amount_cents),
          }
        : { kind: 'standard', standardAmount: cents(row.standard_amount_cents) },
  );
  const lifecycle =
    row.lifecycle_status === 'paused'
      ? { status: 'paused' as const, pauseEndDate: nullableDate(row.pause_end_date) }
      : row.lifecycle_status === 'cancellationPending'
        ? {
            status: 'cancellationPending' as const,
            cancellationInitiatedDate: requiredDate(
              row.cancellation_initiated_date,
              'cancellation initiated',
            ),
          }
        : row.lifecycle_status === 'canceled'
          ? {
              status: 'canceled' as const,
              cancellationConfirmationDate: requiredDate(
                row.cancellation_confirmation_date,
                'cancellation confirmation',
              ),
              accessEndDate: nullableDate(row.access_end_date),
            }
          : { status: 'active' as const };
  return {
    id: entityId<'Subscription'>(row.id),
    householdListId: entityId<'HouseholdList'>(row.household_list_id),
    name: row.name,
    category: parseCategory(row.category),
    note: row.note,
    cancellationUrl: row.cancellation_url,
    defaultPaymentMethodId: row.default_payment_method_id
      ? entityId<'PaymentMethod'>(row.default_payment_method_id)
      : null,
    schedule,
    pricing,
    lifecycle,
    reminderLeadDaysOverride: row.reminder_lead_days_override,
    notificationsMuted: row.notifications_muted === 1,
    archivedAt: row.archived_at ? utcTimestamp(row.archived_at) : null,
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
  };
}

function occurrenceFromRow(row: OccurrenceRow): BillingOccurrence {
  return {
    id: entityId<'BillingOccurrence'>(row.id),
    subscriptionId: entityId<'Subscription'>(row.subscription_id),
    billingDate: calendarDate(row.billing_date),
    expectedAmount: cents(row.expected_amount_cents),
    createdAt: utcTimestamp(row.created_at),
  };
}

function paymentMethodFromRow(row: PaymentMethodRow): PaymentMethod {
  return {
    id: entityId<'PaymentMethod'>(row.id) as PaymentMethodId,
    householdListId: entityId<'HouseholdList'>(row.household_list_id),
    name: row.name,
    note: row.note,
    retiredAt: row.retired_at ? utcTimestamp(row.retired_at) : null,
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
  };
}

function paymentFromRow(row: PaymentRow): Payment {
  return {
    id: entityId<'Payment'>(row.id) as PaymentId,
    billingOccurrenceId: entityId<'BillingOccurrence'>(row.billing_occurrence_id),
    amount: cents(row.amount_cents),
    paymentDate: calendarDate(row.payment_date),
    paymentMethodId: row.payment_method_id
      ? entityId<'PaymentMethod'>(row.payment_method_id)
      : null,
    note: row.note,
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
  };
}

function chargeExceptionFromRow(row: ChargeExceptionRow): ChargeException {
  return {
    id: entityId<'ChargeException'>(row.id) as ChargeExceptionId,
    billingOccurrenceId: entityId<'BillingOccurrence'>(row.billing_occurrence_id),
    reason: row.reason,
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
  };
}

async function insertOccurrence(
  database: Pick<SQLiteDatabase, 'runAsync'>,
  occurrence: BillingOccurrence,
): Promise<void> {
  await database.runAsync(
    `INSERT OR IGNORE INTO billing_occurrences
     (id, subscription_id, billing_date, expected_amount_cents, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    occurrence.id,
    occurrence.subscriptionId,
    occurrence.billingDate,
    occurrence.expectedAmount,
    occurrence.createdAt,
  );
}

async function upsertSubscription(
  database: Pick<SQLiteDatabase, 'runAsync'>,
  subscription: Subscription,
): Promise<void> {
  await database.runAsync(
    `INSERT INTO subscriptions (
      id, household_list_id, name, category, note, cancellation_url, default_payment_method_id,
      billing_cycle, schedule_start_date, billing_anchor_day, pricing_kind, standard_amount_cents,
      promotional_amount_cents, trial_conversion_date, promotion_end_date, lifecycle_status,
      pause_end_date, cancellation_initiated_date, cancellation_confirmation_date, access_end_date,
      reminder_lead_days_override, notifications_muted, archived_at, created_at, updated_at
    ) VALUES (
      $id, $household_list_id, $name, $category, $note, $cancellation_url, $default_payment_method_id,
      $billing_cycle, $schedule_start_date, $billing_anchor_day, $pricing_kind, $standard_amount_cents,
      $promotional_amount_cents, $trial_conversion_date, $promotion_end_date, $lifecycle_status,
      $pause_end_date, $cancellation_initiated_date, $cancellation_confirmation_date, $access_end_date,
      $reminder_lead_days_override, $notifications_muted, $archived_at, $created_at, $updated_at
    ) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, category=excluded.category, note=excluded.note,
      cancellation_url=excluded.cancellation_url, default_payment_method_id=excluded.default_payment_method_id,
      billing_cycle=excluded.billing_cycle, schedule_start_date=excluded.schedule_start_date,
      billing_anchor_day=excluded.billing_anchor_day, pricing_kind=excluded.pricing_kind,
      standard_amount_cents=excluded.standard_amount_cents,
      promotional_amount_cents=excluded.promotional_amount_cents,
      trial_conversion_date=excluded.trial_conversion_date, promotion_end_date=excluded.promotion_end_date,
      lifecycle_status=excluded.lifecycle_status, pause_end_date=excluded.pause_end_date,
      cancellation_initiated_date=excluded.cancellation_initiated_date,
      cancellation_confirmation_date=excluded.cancellation_confirmation_date,
      access_end_date=excluded.access_end_date,
      reminder_lead_days_override=excluded.reminder_lead_days_override,
      notifications_muted=excluded.notifications_muted, archived_at=excluded.archived_at,
      updated_at=excluded.updated_at`,
    subscriptionToRow(subscription),
  );
}

function subscriptionToRow(subscription: Subscription): Record<string, string | number | null> {
  const pricing = subscription.pricing;
  const lifecycle = subscription.lifecycle;
  return {
    $id: subscription.id,
    $household_list_id: subscription.householdListId,
    $name: subscription.name,
    $category: subscription.category,
    $note: subscription.note,
    $cancellation_url: subscription.cancellationUrl,
    $default_payment_method_id: subscription.defaultPaymentMethodId,
    $billing_cycle: subscription.schedule.cycle,
    $schedule_start_date: subscription.schedule.startDate,
    $billing_anchor_day: subscription.schedule.anchorDay,
    $pricing_kind: pricing.kind,
    $standard_amount_cents: pricing.standardAmount,
    $promotional_amount_cents: pricing.kind === 'promotion' ? pricing.promotionalAmount : null,
    $trial_conversion_date: pricing.kind === 'trial' ? pricing.trialConversionDate : null,
    $promotion_end_date: pricing.kind === 'promotion' ? pricing.promotionEndDate : null,
    $lifecycle_status: lifecycle.status,
    $pause_end_date: lifecycle.status === 'paused' ? lifecycle.pauseEndDate : null,
    $cancellation_initiated_date:
      lifecycle.status === 'cancellationPending' ? lifecycle.cancellationInitiatedDate : null,
    $cancellation_confirmation_date:
      lifecycle.status === 'canceled' ? lifecycle.cancellationConfirmationDate : null,
    $access_end_date: lifecycle.status === 'canceled' ? lifecycle.accessEndDate : null,
    $reminder_lead_days_override: subscription.reminderLeadDaysOverride,
    $notifications_muted: subscription.notificationsMuted ? 1 : 0,
    $archived_at: subscription.archivedAt,
    $created_at: subscription.createdAt,
    $updated_at: subscription.updatedAt,
  };
}

function parseCategory(value: string | null): Category | null {
  return value && categories.includes(value as Category) ? (value as Category) : null;
}

function nullableDate(value: string | null): CalendarDate | null {
  return value ? calendarDate(value) : null;
}

function requiredDate(value: string | null, field: string): CalendarDate {
  if (!value) throw new Error(`Missing ${field} date in persisted Subscription.`);
  return calendarDate(value);
}

function requiredNumber(value: number | null, field: string): number {
  if (value === null) throw new Error(`Missing ${field} in persisted Subscription.`);
  return value;
}
