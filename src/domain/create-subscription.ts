import type {
  BillingCycle,
  CategoryId,
  HouseholdListId,
  PaymentMethodId,
  Subscription,
  SubscriptionId,
} from './model';
import {
  calendarDate,
  calendarParts,
  cents,
  nonBlank,
  utcTimestamp,
  type UtcTimestamp,
} from './primitives';
import { validatePricing, validateSchedule } from './recurrence';
import { normalizeOptionalText, normalizeOptionalHttpsUrl, validateReminderLeadDays } from './subscription-profile';

export interface CreateStandardSubscriptionInput {
  readonly id: SubscriptionId;
  readonly householdListId: HouseholdListId;
  readonly name: string;
  readonly amountCents: number;
  readonly cycle: BillingCycle;
  readonly scheduleStartDate: string;
  readonly anchorDay?: number;
  readonly categoryId?: CategoryId | null;
  readonly note?: string | null;
  readonly cancellationUrl?: string | null;
  readonly defaultPaymentMethodId?: PaymentMethodId | null;
  readonly reminderLeadDaysOverride?: number | null;
  readonly notificationsMuted?: boolean;
  readonly now: string;
}

export function createStandardSubscription(input: CreateStandardSubscriptionInput): Subscription {
  const startDate = calendarDate(input.scheduleStartDate);
  const schedule = validateSchedule({
    cycle: input.cycle,
    startDate,
    anchorDay: input.anchorDay ?? calendarParts(startDate).day,
  });
  const pricing = validatePricing(schedule, {
    kind: 'standard',
    standardAmount: cents(input.amountCents),
  });
  const timestamp: UtcTimestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    householdListId: input.householdListId,
    name: nonBlank(input.name, 'Subscription name'),
    categoryId: input.categoryId ?? null,
    note: normalizeOptionalText(input.note, 'Subscription note', 2000),
    cancellationUrl: normalizeOptionalHttpsUrl(input.cancellationUrl),
    defaultPaymentMethodId: input.defaultPaymentMethodId ?? null,
    schedule,
    pricing,
    lifecycle: { status: 'active' },
    reminderLeadDaysOverride: validateReminderLeadDays(input.reminderLeadDaysOverride),
    notificationsMuted: input.notificationsMuted ?? false,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
