import type { ChargeException, Payment } from './model';
import { calendarDate, cents, DomainValidationError, utcTimestamp } from './primitives';
import { normalizeOptionalText } from './subscription-profile';

export function createPayment(input: {
  readonly id: Payment['id'];
  readonly billingOccurrenceId: Payment['billingOccurrenceId'];
  readonly amountCents: number;
  readonly paymentDate: string;
  readonly paymentMethodId?: Payment['paymentMethodId'];
  readonly note?: string | null;
  readonly now: string;
}): Payment {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    billingOccurrenceId: input.billingOccurrenceId,
    amount: cents(input.amountCents),
    paymentDate: calendarDate(input.paymentDate),
    paymentMethodId: input.paymentMethodId ?? null,
    note: normalizeOptionalText(input.note, 'Payment note', 500),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createChargeException(input: {
  readonly id: ChargeException['id'];
  readonly billingOccurrenceId: ChargeException['billingOccurrenceId'];
  readonly reason?: string | null;
  readonly generatedByLifecycleEventId?: ChargeException['generatedByLifecycleEventId'];
  readonly generatedBySkippedWeekId?: ChargeException['generatedBySkippedWeekId'];
  readonly now: string;
}): ChargeException {
  const timestamp = utcTimestamp(input.now);
  if (input.generatedByLifecycleEventId && input.generatedBySkippedWeekId) {
    throw new DomainValidationError(
      'A Generated Charge Exception belongs to either a Lifecycle Event or a Skipped Week.',
    );
  }
  return {
    id: input.id,
    billingOccurrenceId: input.billingOccurrenceId,
    reason: normalizeOptionalText(input.reason, 'No Charge reason', 500),
    generatedByLifecycleEventId: input.generatedByLifecycleEventId ?? null,
    generatedBySkippedWeekId: input.generatedBySkippedWeekId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
