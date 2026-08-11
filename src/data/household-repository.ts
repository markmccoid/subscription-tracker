import type {
  BillingOccurrence,
  Category,
  ChargeException,
  HouseholdList,
  HouseholdSnapshot,
  Payment,
  PaymentMethod,
  Subscription,
} from '@/domain/model';

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
  ): Promise<void>;
  saveSubscriptionCancellation(
    subscription: Subscription,
    exceptions: readonly ChargeException[],
  ): Promise<void>;
  saveBillingOccurrences(occurrences: readonly BillingOccurrence[]): Promise<void>;
  saveCategory(category: Category): Promise<void>;
  deleteCategory(categoryId: Category['id']): Promise<void>;
  savePaymentMethod(paymentMethod: PaymentMethod): Promise<void>;
  deletePaymentMethod(paymentMethodId: PaymentMethod['id']): Promise<void>;
  saveOccurrenceResolution(
    occurrence: BillingOccurrence,
    resolution: Payment | ChargeException,
  ): Promise<void>;
}
