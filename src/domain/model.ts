import type { CalendarDate, Cents, EntityId, UtcTimestamp } from './primitives';

export type HouseholdListId = EntityId<'HouseholdList'>;
export type SubscriptionId = EntityId<'Subscription'>;
export type BillingOccurrenceId = EntityId<'BillingOccurrence'>;
export type PaymentId = EntityId<'Payment'>;
export type ChargeExceptionId = EntityId<'ChargeException'>;
export type PaymentMethodId = EntityId<'PaymentMethod'>;

export const categories = [
  'entertainment',
  'software',
  'news',
  'health',
  'utilities',
  'finance',
  'other',
] as const;

export type Category = (typeof categories)[number];
export type BillingCycle = 'monthly' | 'yearly';

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
      readonly status: 'cancellationPending';
      readonly cancellationInitiatedDate: CalendarDate;
    }
  | {
      readonly status: 'canceled';
      readonly cancellationConfirmationDate: CalendarDate;
      readonly accessEndDate: CalendarDate | null;
    };

export interface Subscription {
  readonly id: SubscriptionId;
  readonly householdListId: HouseholdListId;
  readonly name: string;
  readonly category: Category | null;
  readonly note: string | null;
  readonly cancellationUrl: string | null;
  readonly defaultPaymentMethodId: PaymentMethodId | null;
  readonly schedule: BillingSchedule;
  readonly pricing: PricingArrangement;
  readonly lifecycle: SubscriptionLifecycle;
  readonly reminderLeadDaysOverride: number | null;
  readonly notificationsMuted: boolean;
  readonly archivedAt: UtcTimestamp | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
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
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface PaymentMethod {
  readonly id: PaymentMethodId;
  readonly householdListId: HouseholdListId;
  readonly name: string;
  readonly note: string | null;
  readonly retiredAt: UtcTimestamp | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface HouseholdSnapshot {
  readonly household: HouseholdList;
  readonly subscriptions: readonly Subscription[];
  readonly billingOccurrences: readonly BillingOccurrence[];
  readonly payments: readonly Payment[];
  readonly chargeExceptions: readonly ChargeException[];
  readonly paymentMethods: readonly PaymentMethod[];
}
