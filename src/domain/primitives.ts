export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type CalendarDate = Brand<string, 'CalendarDate'>;
export type Cents = Brand<number, 'Cents'>;
export type UtcTimestamp = Brand<string, 'UtcTimestamp'>;
export type EntityId<Entity extends string> = Brand<string, `${Entity}Id`>;

export class DomainValidationError extends Error {
  readonly name = 'DomainValidationError';
}

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new DomainValidationError('Invalid calendar year or month.');
  }
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function calendarParts(value: CalendarDate): { year: number; month: number; day: number } {
  const match = calendarDatePattern.exec(value);
  if (!match) {
    throw new DomainValidationError(`Invalid calendar date: ${value}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function calendarDate(value: string): CalendarDate {
  const match = calendarDatePattern.exec(value);
  if (!match) {
    throw new DomainValidationError('Calendar dates must use YYYY-MM-DD.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || day < 1 || day > daysInMonth(year, month)) {
    throw new DomainValidationError(`Invalid calendar date: ${value}`);
  }
  return value as CalendarDate;
}

export function formatCalendarDate(year: number, month: number, day: number): CalendarDate {
  return calendarDate(
    `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`,
  );
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return left.localeCompare(right);
}

const weekdayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function addCalendarDays(date: CalendarDate, count: number): CalendarDate {
  if (!Number.isInteger(count)) {
    throw new DomainValidationError('Calendar day offsets must be whole days.');
  }
  const { year, month, day } = calendarParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + count));
  return formatCalendarDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function calendarWeekdayName(date: CalendarDate): string {
  const { year, month, day } = calendarParts(date);
  return weekdayNames[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValidationError('Money must be a positive safe integer number of cents.');
  }
  return value as Cents;
}

export function utcTimestamp(value: string): UtcTimestamp {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new DomainValidationError('Metadata timestamps must be canonical UTC ISO timestamps.');
  }
  return value as UtcTimestamp;
}

export function entityId<Entity extends string>(value: string): EntityId<Entity> {
  if (!uuidV4Pattern.test(value)) {
    throw new DomainValidationError(`Invalid UUIDv4 entity identifier: ${value}`);
  }
  return value as EntityId<Entity>;
}

export function nonBlank(value: string, field: string, maxLength = 200): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new DomainValidationError(`${field} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}
