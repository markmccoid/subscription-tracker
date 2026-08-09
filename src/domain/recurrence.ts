import type { BillingSchedule, PricingArrangement } from './model';
import {
  calendarParts,
  compareCalendarDates,
  daysInMonth,
  formatCalendarDate,
  type CalendarDate,
  type Cents,
  DomainValidationError,
} from './primitives';

export function validateSchedule(schedule: BillingSchedule): BillingSchedule {
  if (!Number.isInteger(schedule.anchorDay) || schedule.anchorDay < 1 || schedule.anchorDay > 31) {
    throw new DomainValidationError('Billing Anchor Day must be an integer from 1 through 31.');
  }
  const { year, month, day } = calendarParts(schedule.startDate);
  const expectedStartDay = Math.min(schedule.anchorDay, daysInMonth(year, month));
  if (day !== expectedStartDay) {
    throw new DomainValidationError(
      'Billing Schedule Start Date must match the selected Billing Anchor Day for that period.',
    );
  }
  return schedule;
}

export function occurrenceAt(schedule: BillingSchedule, index: number): CalendarDate {
  validateSchedule(schedule);
  if (!Number.isInteger(index) || index < 0) {
    throw new DomainValidationError('Occurrence index must be a non-negative integer.');
  }
  const start = calendarParts(schedule.startDate);
  if (schedule.cycle === 'monthly') {
    const absoluteMonth = start.year * 12 + (start.month - 1) + index;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    return formatCalendarDate(year, month, Math.min(schedule.anchorDay, daysInMonth(year, month)));
  }
  const year = start.year + index;
  return formatCalendarDate(
    year,
    start.month,
    Math.min(schedule.anchorDay, daysInMonth(year, start.month)),
  );
}

export function occurrencesInRange(
  schedule: BillingSchedule,
  fromInclusive: CalendarDate,
  toInclusive: CalendarDate,
): readonly CalendarDate[] {
  if (compareCalendarDates(fromInclusive, toInclusive) > 0) return [];
  const result: CalendarDate[] = [];
  const hardLimit = schedule.cycle === 'monthly' ? 2400 : 400;
  for (let index = 0; index < hardLimit; index += 1) {
    const date = occurrenceAt(schedule, index);
    if (compareCalendarDates(date, toInclusive) > 0) break;
    if (compareCalendarDates(date, fromInclusive) >= 0) result.push(date);
  }
  return result;
}

export function nextOccurrenceOnOrAfter(
  schedule: BillingSchedule,
  date: CalendarDate,
): CalendarDate {
  const searchEnd = formatCalendarDate(calendarParts(date).year + 200, 12, 31);
  const [next] = occurrencesInRange(schedule, date, searchEnd);
  if (!next) throw new DomainValidationError('Could not project the next Billing Occurrence.');
  return next;
}

export function amountForOccurrence(
  pricing: PricingArrangement,
  billingDate: CalendarDate,
): Cents {
  if (pricing.kind !== 'promotion') return pricing.standardAmount;
  return compareCalendarDates(billingDate, pricing.promotionEndDate) < 0
    ? pricing.promotionalAmount
    : pricing.standardAmount;
}

export function validatePricing(
  schedule: BillingSchedule,
  pricing: PricingArrangement,
): PricingArrangement {
  validateSchedule(schedule);
  if (pricing.kind === 'trial' && pricing.trialConversionDate !== schedule.startDate) {
    throw new DomainValidationError('Trial Conversion Date must equal Billing Schedule Start Date.');
  }
  if (pricing.kind === 'promotion') {
    if (compareCalendarDates(pricing.promotionEndDate, schedule.startDate) <= 0) {
      throw new DomainValidationError('Promotion End Date must follow Billing Schedule Start Date.');
    }
    const projected = nextOccurrenceOnOrAfter(schedule, pricing.promotionEndDate);
    if (projected !== pricing.promotionEndDate) {
      throw new DomainValidationError('Promotion End Date must be a Billing Date.');
    }
  }
  return pricing;
}
