import type { CalendarDate, Cents, EntityId, UtcTimestamp } from './primitives';

export type HouseholdListId = EntityId<'HouseholdList'>;
export type SubscriptionId = EntityId<'Subscription'>;
export type BillingOccurrenceId = EntityId<'BillingOccurrence'>;
export type PaymentId = EntityId<'Payment'>;
export type ChargeExceptionId = EntityId<'ChargeException'>;
export type LifecycleEventId = EntityId<'LifecycleEvent'>;
export type PaymentMethodId = EntityId<'PaymentMethod'>;
export type CategoryId = EntityId<'Category'>;
export type SkippedWeekId = EntityId<'SkippedWeek'>;

export const starterCategories = [
  { id: '20000000-0000-4000-8000-000000000001', name: 'Entertainment' },
  { id: '20000000-0000-4000-8000-000000000002', name: 'Finance' },
  { id: '20000000-0000-4000-8000-000000000003', name: 'Health' },
  { id: '20000000-0000-4000-8000-000000000004', name: 'News' },
  { id: '20000000-0000-4000-8000-000000000005', name: 'Other' },
  { id: '20000000-0000-4000-8000-000000000006', name: 'Software' },
  { id: '20000000-0000-4000-8000-000000000007', name: 'Utilities' },
] as const;
export type BillingCycle = 'monthly' | 'yearly' | 'weekly';

export interface BillingSchedule {
  readonly cycle: BillingCycle;
  readonly startDate: CalendarDate;
  readonly anchorDay: number;
}

export type PricingArrangement =
  | { readonly kind: 'standard'; readonly standardAmount: Cents }
  | {
      readonly kind: 'trial';
      readonly trialConversionDate: CalendarDate;
      readonly standardAmount: Cents;
    }
  | {
      readonly kind: 'promotion';
      readonly promotionalAmount: Cents;
      readonly promotionEndDate: CalendarDate;
      readonly standardAmount: Cents;
    };

export type SubscriptionLifecycle =
  | { readonly status: 'active' }
  | { readonly status: 'paused'; readonly pauseEndDate: CalendarDate | null }
  | {
      readonly status: 'canceled';
      readonly cancellationConfirmationDate: CalendarDate;
      readonly accessEndDate: CalendarDate | null;
    };

export interface Subscription {
  readonly id: SubscriptionId;
  readonly householdListId: HouseholdListId;
  readonly name: string;
  readonly categoryId: CategoryId | null;
  readonly note: string | null;
  readonly cancellationUrl: string | null;
  readonly defaultPaymentMethodId: PaymentMethodId | null;
  readonly schedule: BillingSchedule;
  readonly pricing: PricingArrangement;
  readonly lifecycle: SubscriptionLifecycle;
  readonly reminderLeadDaysOverride: number | null;
  readonly notificationsMuted: boolean;
  /** Weekly Subscriptions only: render planned Skipped Weeks as ghost rows in Upcoming. */
  readonly showSkippedWeeks: boolean;
  readonly archivedAt: UtcTimestamp | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

/** A user-planned suppression of one projected weekly Billing Occurrence. */
export interface SkippedWeek {
  readonly id: SkippedWeekId;
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: CalendarDate;
  readonly createdAt: UtcTimestamp;
}

export interface HouseholdList {
  readonly id: HouseholdListId;
  readonly currency: 'USD';
  readonly defaultReminderLeadDays: number;
  readonly reminderTime: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface BillingOccurrence {
  readonly id: BillingOccurrenceId;
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: CalendarDate;
  readonly expectedAmount: Cents;
  readonly createdAt: UtcTimestamp;
}

export interface Payment {
  readonly id: PaymentId;
  readonly billingOccurrenceId: BillingOccurrenceId;
  readonly amount: Cents;
  readonly paymentDate: CalendarDate;
  readonly paymentMethodId: PaymentMethodId | null;
  readonly note: string | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface ChargeException {
  readonly id: ChargeExceptionId;
  readonly billingOccurrenceId: BillingOccurrenceId;
  readonly reason: string | null;
  /** At most one of the two generator links is non-null. */
  readonly generatedByLifecycleEventId: LifecycleEventId | null;
  readonly generatedBySkippedWeekId: SkippedWeekId | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

interface LifecycleEventBase {
  readonly id: LifecycleEventId;
  readonly subscriptionId: SubscriptionId;
  readonly effectiveDate: CalendarDate;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export type LifecycleEvent =
  | (LifecycleEventBase & {
      readonly kind: 'paused';
      readonly pauseEndDate: CalendarDate | null;
    })
  | (LifecycleEventBase & {
      readonly kind: 'resumed';
      readonly nextBillingDate: CalendarDate;
    })
  | (LifecycleEventBase & {
      readonly kind: 'canceled';
      readonly accessEndDate: CalendarDate | null;
    })
  | (LifecycleEventBase & {
      readonly kind: 'reactivated';
      readonly nextBillingDate: CalendarDate;
      readonly pricing: PricingArrangement;
    });

export interface PaymentMethod {
  readonly id: PaymentMethodId;
  readonly householdListId: HouseholdListId;
  readonly name: string;
  readonly note: string | null;
  readonly retiredAt: UtcTimestamp | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface Category {
  readonly id: CategoryId;
  readonly householdListId: HouseholdListId;
  readonly name: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface HouseholdSnapshot {
  readonly household: HouseholdList;
  readonly subscriptions: readonly Subscription[];
  readonly billingOccurrences: readonly BillingOccurrence[];
  readonly payments: readonly Payment[];
  readonly chargeExceptions: readonly ChargeException[];
  readonly lifecycleEvents: readonly LifecycleEvent[];
  readonly skippedWeeks: readonly SkippedWeek[];
  readonly paymentMethods: readonly PaymentMethod[];
  readonly categories: readonly Category[];
}
