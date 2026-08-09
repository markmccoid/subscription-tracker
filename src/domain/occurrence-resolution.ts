import type { ChargeException, Payment } from './model';
import { calendarDate, cents, utcTimestamp } from './primitives';
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
  readonly now: string;
}): ChargeException {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    billingOccurrenceId: input.billingOccurrenceId,
    reason: normalizeOptionalText(input.reason, 'No Charge reason', 500),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
