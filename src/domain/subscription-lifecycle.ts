import type { Subscription } from './model';
import {
  calendarDate,
  calendarParts,
  compareCalendarDates,
  type CalendarDate,
  DomainValidationError,
  utcTimestamp,
} from './primitives';
import { validateSchedule } from './recurrence';

export function pauseSubscription(
  subscription: Subscription,
  input: {
    readonly effectiveDate: string;
    readonly pauseEndDate?: string | null;
    readonly asOf: CalendarDate;
    readonly now: string;
  },
): Subscription {
  if (subscription.archivedAt) {
    throw new DomainValidationError('Archived Subscriptions cannot be paused.');
  }
  if (subscription.lifecycle.status !== 'active') {
    throw new DomainValidationError('Only an Active Subscription can be paused.');
  }
  const effectiveDate = calendarDate(input.effectiveDate);
  if (compareCalendarDates(effectiveDate, input.asOf) > 0) {
    throw new DomainValidationError('Pause effective date cannot be in the future.');
  }
  const pauseEndDate = input.pauseEndDate ? calendarDate(input.pauseEndDate) : null;
  if (pauseEndDate && compareCalendarDates(pauseEndDate, effectiveDate) <= 0) {
    throw new DomainValidationError('Pause End Date must be after the pause effective date.');
  }
  return {
    ...subscription,
    lifecycle: { status: 'paused', pauseEndDate },
    updatedAt: utcTimestamp(input.now),
  };
}

export function resumeSubscription(
  subscription: Subscription,
  input: {
    readonly effectiveDate: string;
    readonly nextBillingDate: string;
    readonly asOf: CalendarDate;
    readonly now: string;
  },
): Subscription {
  if (subscription.archivedAt) {
    throw new DomainValidationError('Archived Subscriptions cannot be resumed.');
  }
  if (subscription.lifecycle.status !== 'paused') {
    throw new DomainValidationError('Only a Paused Subscription can be resumed.');
  }
  const effectiveDate = calendarDate(input.effectiveDate);
  const nextBillingDate = calendarDate(input.nextBillingDate);
  if (compareCalendarDates(effectiveDate, input.asOf) > 0) {
    throw new DomainValidationError('Resume effective date cannot be in the future.');
  }
  if (compareCalendarDates(nextBillingDate, effectiveDate) < 0) {
    throw new DomainValidationError('Next Billing Date cannot be before the resume effective date.');
  }
  const schedule = validateSchedule({
    cycle: subscription.schedule.cycle,
    startDate: nextBillingDate,
    anchorDay: calendarParts(nextBillingDate).day,
  });
  return {
    ...subscription,
    schedule,
    lifecycle: { status: 'active' },
    updatedAt: utcTimestamp(input.now),
  };
}

export function cancelSubscription(
  subscription: Subscription,
  input: {
    readonly confirmationDate: string;
    readonly accessEndDate?: string | null;
    readonly asOf: CalendarDate;
    readonly now: string;
  },
): Subscription {
  if (subscription.archivedAt) {
    throw new DomainValidationError('Archived Subscriptions cannot be canceled.');
  }
  if (subscription.lifecycle.status === 'canceled') {
    throw new DomainValidationError('Subscription is already Canceled.');
  }
  const confirmationDate = calendarDate(input.confirmationDate);
  if (compareCalendarDates(confirmationDate, input.asOf) > 0) {
    throw new DomainValidationError('Cancellation Confirmation Date cannot be in the future.');
  }
  const accessEndDate = input.accessEndDate ? calendarDate(input.accessEndDate) : null;
  validateAccessEndDate(confirmationDate, accessEndDate);
  return {
    ...subscription,
    lifecycle: { status: 'canceled', cancellationConfirmationDate: confirmationDate, accessEndDate },
    updatedAt: utcTimestamp(input.now),
  };
}

export function editCancellationDetails(
  subscription: Subscription,
  input: {
    readonly confirmationDate: string;
    readonly accessEndDate?: string | null;
    readonly asOf: CalendarDate;
    readonly now: string;
  },
): Subscription {
  if (subscription.lifecycle.status !== 'canceled') {
    throw new DomainValidationError('Only a Canceled Subscription has cancellation details.');
  }
  const confirmationDate = calendarDate(input.confirmationDate);
  if (compareCalendarDates(confirmationDate, input.asOf) > 0) {
    throw new DomainValidationError('Cancellation Confirmation Date cannot be in the future.');
  }
  const accessEndDate = input.accessEndDate ? calendarDate(input.accessEndDate) : null;
  validateAccessEndDate(confirmationDate, accessEndDate);
  return {
    ...subscription,
    lifecycle: { status: 'canceled', cancellationConfirmationDate: confirmationDate, accessEndDate },
    updatedAt: utcTimestamp(input.now),
  };
}

export function reactivateSubscription(
  subscription: Subscription,
  input: { readonly nextBillingDate: string; readonly asOf: CalendarDate; readonly now: string },
): Subscription {
  if (subscription.archivedAt) {
    throw new DomainValidationError('Archived Subscriptions must be restored before reactivation.');
  }
  if (subscription.lifecycle.status !== 'canceled') {
    throw new DomainValidationError('Only a Canceled Subscription can be reactivated.');
  }
  const nextBillingDate = calendarDate(input.nextBillingDate);
  if (compareCalendarDates(nextBillingDate, input.asOf) <= 0) {
    throw new DomainValidationError('Next Billing Date must be after today.');
  }
  if (subscription.pricing.kind !== 'standard') {
    throw new DomainValidationError('Only Standard Subscriptions can currently be reactivated.');
  }
  const schedule = validateSchedule({
    cycle: subscription.schedule.cycle,
    startDate: nextBillingDate,
    anchorDay: calendarParts(nextBillingDate).day,
  });
  return {
    ...subscription,
    schedule,
    lifecycle: { status: 'active' },
    updatedAt: utcTimestamp(input.now),
  };
}

function validateAccessEndDate(
  confirmationDate: CalendarDate,
  accessEndDate: CalendarDate | null,
): void {
  if (accessEndDate && compareCalendarDates(accessEndDate, confirmationDate) < 0) {
    throw new DomainValidationError(
      'Access End Date must be on or after the Cancellation Confirmation Date.',
    );
  }
}
