import type {
  BillingOccurrence,
  Category,
  ChargeException,
  HouseholdList,
  HouseholdSnapshot,
  LifecycleEvent,
  Payment,
  PaymentMethod,
  SkippedWeek,
  SkippedWeekId,
  Subscription,
} from '@/domain/model';

/** Skipped Week rows written or removed as part of a larger Subscription mutation. */
export interface SkippedWeekChanges {
  readonly created?: readonly SkippedWeek[];
  readonly deletedIds?: readonly SkippedWeekId[];
}

/** The persistence seam. UI and domain modules never depend on a concrete adapter. */
export interface HouseholdRepository {
  migrate(): Promise<void>;
  getHousehold(): Promise<HouseholdList | null>;
  createHousehold(household: HouseholdList): Promise<void>;
  saveHousehold(household: HouseholdList): Promise<void>;
  loadSnapshot(): Promise<HouseholdSnapshot>;
  saveSubscription(subscription: Subscription): Promise<void>;
  saveSubscriptionWithOccurrences(
    subscription: Subscription,
    occurrences: readonly BillingOccurrence[],
    skippedWeeks?: SkippedWeekChanges,
  ): Promise<void>;
  deleteSubscription(subscriptionId: Subscription['id']): Promise<void>;
  saveLifecycleChange(
    subscription: Subscription,
    event: LifecycleEvent,
    generatedExceptions?: readonly ChargeException[],
    skippedWeeks?: SkippedWeekChanges,
  ): Promise<void>;
  deleteLifecycleEvent(eventId: LifecycleEvent['id'], subscription: Subscription): Promise<void>;
  saveBillingOccurrences(occurrences: readonly BillingOccurrence[]): Promise<void>;
  saveSkippedWeek(skippedWeek: SkippedWeek): Promise<void>;
  /** Removes the Skipped Week and cascades to any Generated Charge Exception it produced. */
  deleteSkippedWeek(skippedWeekId: SkippedWeekId): Promise<void>;
  saveCategory(category: Category): Promise<void>;
  deleteCategory(categoryId: Category['id']): Promise<void>;
  savePaymentMethod(paymentMethod: PaymentMethod): Promise<void>;
  deletePaymentMethod(paymentMethodId: PaymentMethod['id']): Promise<void>;
  saveOccurrenceResolution(
    occurrence: BillingOccurrence,
    resolution: Payment | ChargeException,
  ): Promise<void>;
}
