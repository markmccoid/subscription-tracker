import type {
  LifecycleEvent,
  LifecycleEventId,
  PricingArrangement,
  SubscriptionId,
} from './model';
import { calendarDate, utcTimestamp } from './primitives';

type CommonInput = {
  readonly id: LifecycleEventId;
  readonly subscriptionId: SubscriptionId;
  readonly effectiveDate: string;
  readonly now: string;
};

export function createPauseEvent(
  input: CommonInput & { readonly pauseEndDate?: string | null },
): LifecycleEvent {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    subscriptionId: input.subscriptionId,
    kind: 'paused',
    effectiveDate: calendarDate(input.effectiveDate),
    pauseEndDate: input.pauseEndDate ? calendarDate(input.pauseEndDate) : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createResumeEvent(
  input: CommonInput & { readonly nextBillingDate: string },
): LifecycleEvent {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    subscriptionId: input.subscriptionId,
    kind: 'resumed',
    effectiveDate: calendarDate(input.effectiveDate),
    nextBillingDate: calendarDate(input.nextBillingDate),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createCancellationEvent(
  input: CommonInput & { readonly accessEndDate?: string | null },
): LifecycleEvent {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    subscriptionId: input.subscriptionId,
    kind: 'canceled',
    effectiveDate: calendarDate(input.effectiveDate),
    accessEndDate: input.accessEndDate ? calendarDate(input.accessEndDate) : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createReactivationEvent(
  input: CommonInput & {
    readonly nextBillingDate: string;
    readonly pricing: PricingArrangement;
  },
): LifecycleEvent {
  const timestamp = utcTimestamp(input.now);
  return {
    id: input.id,
    subscriptionId: input.subscriptionId,
    kind: 'reactivated',
    effectiveDate: calendarDate(input.effectiveDate),
    nextBillingDate: calendarDate(input.nextBillingDate),
    pricing: input.pricing,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
