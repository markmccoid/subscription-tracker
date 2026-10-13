import type { BillingCycle, PaymentMethod, Subscription } from './model';
import { DomainValidationError, nonBlank, utcTimestamp } from './primitives';
import { validatePricing, validateSchedule } from './recurrence';

/** The Upcoming ghost-row preference defaults on for Weekly and is meaningless otherwise. */
export function showSkippedWeeksFor(cycle: BillingCycle, requested: boolean | undefined): boolean {
  return cycle === 'weekly' ? requested ?? true : false;
}

export function normalizeOptionalText(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new DomainValidationError(`${field} must contain at most ${maxLength} characters.`);
  }
  return normalized;
}

export function normalizeOptionalHttpsUrl(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value, 'Cancellation URL', 2048);
  if (!normalized) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new DomainValidationError('Cancellation URL must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new DomainValidationError('Cancellation URL must be a valid HTTPS URL.');
  }
  return parsed.toString();
}

export function validateReminderLeadDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    throw new DomainValidationError('Reminder lead time must be an integer from 0 through 365 days.');
  }
  return value;
}

export function createPaymentMethod(input: {
  readonly id: PaymentMethod['id'];
  readonly householdListId: PaymentMethod['householdListId'];
  readonly name: string;
  readonly note?: string | null;
  readonly now: string;
}): PaymentMethod {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    householdListId: input.householdListId,
    name: nonBlank(input.name, 'Payment Method name', 120),
    note: normalizeOptionalText(input.note, 'Payment Method note', 500),
    retiredAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updatePaymentMethod(
  paymentMethod: PaymentMethod,
  input: {
    readonly name: string;
    readonly note?: string | null;
    readonly now: string;
  },
): PaymentMethod {
  return {
    ...paymentMethod,
    name: nonBlank(input.name, 'Payment Method name', 120),
    note: normalizeOptionalText(input.note, 'Payment Method note', 500),
    updatedAt: utcTimestamp(input.now),
  };
}

export function setPaymentMethodRetired(
  paymentMethod: PaymentMethod,
  retired: boolean,
  now: string,
): PaymentMethod {
  const timestamp = utcTimestamp(now);
  return {
    ...paymentMethod,
    retiredAt: retired ? timestamp : null,
    updatedAt: timestamp,
  };
}

export function updateStandardSubscription(
  current: Subscription,
  input: Omit<
    Subscription,
    'id' | 'householdListId' | 'lifecycle' | 'archivedAt' | 'createdAt' | 'updatedAt' | 'showSkippedWeeks'
  > & { readonly showSkippedWeeks?: boolean },
  now: string,
): Subscription {
  if (current.archivedAt) {
    throw new DomainValidationError('Archived Subscriptions must be restored before editing.');
  }
  if (current.pricing.kind !== 'standard' || input.pricing.kind !== 'standard') {
    throw new DomainValidationError('This editor supports Standard Subscriptions only.');
  }

  const normalized = {
    name: nonBlank(input.name, 'Subscription name'),
    categoryId: input.categoryId,
    note: normalizeOptionalText(input.note, 'Subscription note', 2000),
    cancellationUrl: normalizeOptionalHttpsUrl(input.cancellationUrl),
    defaultPaymentMethodId: input.defaultPaymentMethodId,
    schedule: validateSchedule(input.schedule),
    pricing: validatePricing(input.schedule, input.pricing),
    reminderLeadDaysOverride: validateReminderLeadDays(input.reminderLeadDaysOverride),
    notificationsMuted: input.notificationsMuted,
    showSkippedWeeks: showSkippedWeeksFor(input.schedule.cycle, input.showSkippedWeeks),
  };

  if (current.lifecycle.status === 'paused' && !sameSchedule(current, normalized)) {
    throw new DomainValidationError('Billing Schedule cannot change while a Subscription is Paused.');
  }
  if (
    current.lifecycle.status === 'canceled' &&
    (!sameSchedule(current, normalized) ||
      current.pricing.standardAmount !== normalized.pricing.standardAmount ||
      current.reminderLeadDaysOverride !== normalized.reminderLeadDaysOverride ||
      current.notificationsMuted !== normalized.notificationsMuted)
  ) {
    throw new DomainValidationError('Pricing, schedule, and reminders cannot change for a Canceled Subscription.');
  }

  return {
    ...current,
    ...normalized,
    updatedAt: utcTimestamp(now),
  };
}

function sameSchedule(
  current: Subscription,
  next: { readonly schedule: Subscription['schedule'] },
): boolean {
  return (
    current.schedule.cycle === next.schedule.cycle &&
    current.schedule.startDate === next.schedule.startDate &&
    current.schedule.anchorDay === next.schedule.anchorDay
  );
}
