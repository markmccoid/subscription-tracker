import type { SkippedWeek, SkippedWeekId, Subscription, SubscriptionId } from './model';
import {
  calendarDate,
  compareCalendarDates,
  type CalendarDate,
  DomainValidationError,
  utcTimestamp,
} from './primitives';
import { nextOccurrenceOnOrAfter } from './recurrence';

/** How a materialized Skipped Week's Billing Occurrence is currently resolved. */
export type SkipResolution =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'payment' }
  | { readonly kind: 'exception'; readonly generatedBySkippedWeekId: SkippedWeekId | null };

export function createSkippedWeek(input: {
  readonly id: SkippedWeekId;
  readonly subscription: Subscription;
  readonly billingDate: string;
  readonly existingSkips: readonly SkippedWeek[];
  readonly asOf: CalendarDate;
  /** True when a Billing Occurrence row already exists for this date. */
  readonly occurrenceMaterialized?: boolean;
  readonly now: string;
}): SkippedWeek {
  const { subscription } = input;
  if (subscription.schedule.cycle !== 'weekly') {
    throw new DomainValidationError('Only a Weekly Subscription can have Skipped Weeks.');
  }
  if (subscription.archivedAt) {
    throw new DomainValidationError('Archived Subscriptions cannot plan Skipped Weeks.');
  }
  if (subscription.lifecycle.status !== 'active') {
    throw new DomainValidationError('Only an Active Subscription can plan Skipped Weeks.');
  }
  const billingDate = calendarDate(input.billingDate);
  if (compareCalendarDates(billingDate, input.asOf) < 0) {
    throw new DomainValidationError('A past week can no longer be skipped.');
  }
  if (input.occurrenceMaterialized) {
    throw new DomainValidationError(
      'This week has already been billed. Record what happened on it instead.',
    );
  }
  if (nextOccurrenceOnOrAfter(subscription.schedule, billingDate) !== billingDate) {
    throw new DomainValidationError('Only a projected Billing Date can be skipped.');
  }
  if (isDateSkipped(input.existingSkips, subscription.id, billingDate)) {
    throw new DomainValidationError('This week is already skipped.');
  }
  return {
    id: input.id,
    subscriptionId: subscription.id,
    billingDate,
    createdAt: utcTimestamp(input.now),
  };
}

/**
 * A Skipped Week's own Generated Charge Exception cascades when the skip is deleted, so removal is
 * blocked only when some other resolution now owns the Billing Occurrence.
 */
export function assertSkipRemovable(skip: SkippedWeek, resolution: SkipResolution): void {
  if (resolution.kind === 'payment') {
    throw new DomainValidationError(
      'This week has a recorded Payment. Delete the Payment before removing the skip.',
    );
  }
  if (resolution.kind === 'exception' && resolution.generatedBySkippedWeekId !== skip.id) {
    throw new DomainValidationError(
      'This week has a separately recorded No Charge. Delete that record before removing the skip.',
    );
  }
}

export function isDateSkipped(
  skips: readonly SkippedWeek[],
  subscriptionId: SubscriptionId,
  date: CalendarDate,
): boolean {
  return skips.some((skip) => skip.subscriptionId === subscriptionId && skip.billingDate === date);
}

/**
 * Skips whose billingDate is on or after `asOf` but no longer falls on a projected occurrence of
 * the Subscription's current schedule, because the schedule was edited, resumed, or reactivated.
 */
export function staleFutureSkips(
  skips: readonly SkippedWeek[],
  subscription: Subscription,
  asOf: CalendarDate,
): readonly SkippedWeek[] {
  return skips.filter((skip) => {
    if (skip.subscriptionId !== subscription.id) return false;
    if (compareCalendarDates(skip.billingDate, asOf) < 0) return false;
    if (subscription.schedule.cycle !== 'weekly') return true;
    return nextOccurrenceOnOrAfter(subscription.schedule, skip.billingDate) !== skip.billingDate;
  });
}
