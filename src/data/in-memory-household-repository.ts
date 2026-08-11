import type { HouseholdRepository } from './household-repository';
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

/** Test adapter for exercising the same repository seam used by SQLite and a future Convex adapter. */
export class InMemoryHouseholdRepository implements HouseholdRepository {
  private household: HouseholdList | null = null;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly billingOccurrences = new Map<string, BillingOccurrence>();
  private readonly payments = new Map<string, Payment>();
  private readonly chargeExceptions = new Map<string, ChargeException>();
  private readonly paymentMethods = new Map<string, PaymentMethod>();
  private readonly categories = new Map<string, Category>();

  async migrate(): Promise<void> {}

  async getHousehold(): Promise<HouseholdList | null> {
    return this.household;
  }

  async createHousehold(household: HouseholdList): Promise<void> {
    if (this.household) throw new Error('Household List already exists.');
    this.household = household;
  }

  async saveHousehold(household: HouseholdList): Promise<void> {
    if (!this.household || this.household.id !== household.id) {
      throw new Error('Household List has not been initialized.');
    }
    this.household = household;
  }

  async loadSnapshot(): Promise<HouseholdSnapshot> {
    if (!this.household) throw new Error('Household List has not been initialized.');
    return {
      household: this.household,
      subscriptions: [...this.subscriptions.values()],
      billingOccurrences: [...this.billingOccurrences.values()],
      payments: [...this.payments.values()],
      chargeExceptions: [...this.chargeExceptions.values()],
      paymentMethods: [...this.paymentMethods.values()],
      categories: [...this.categories.values()].sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  async saveSubscription(subscription: Subscription): Promise<void> {
    this.subscriptions.set(subscription.id, subscription);
  }

  async saveSubscriptionWithOccurrences(
    subscription: Subscription,
    occurrences: readonly BillingOccurrence[],
  ): Promise<void> {
    this.subscriptions.set(subscription.id, subscription);
    await this.saveBillingOccurrences(occurrences);
  }

  async saveSubscriptionCancellation(
    subscription: Subscription,
    exceptions: readonly ChargeException[],
  ): Promise<void> {
    for (const exception of exceptions) {
      const occurrence = this.billingOccurrences.get(exception.billingOccurrenceId);
      if (!occurrence || occurrence.subscriptionId !== subscription.id) {
        throw new Error('Cancellation resolution does not belong to this Subscription.');
      }
      if (
        [...this.payments.values(), ...this.chargeExceptions.values()].some(
          (resolution) => resolution.billingOccurrenceId === exception.billingOccurrenceId,
        )
      ) {
        throw new Error('Billing Occurrence has already been resolved.');
      }
    }
    this.subscriptions.set(subscription.id, subscription);
    for (const exception of exceptions) this.chargeExceptions.set(exception.id, exception);
  }

  async saveBillingOccurrences(occurrences: readonly BillingOccurrence[]): Promise<void> {
    for (const occurrence of occurrences) {
      const key = `${occurrence.subscriptionId}:${occurrence.billingDate}`;
      if (![...this.billingOccurrences.values()].some((current) =>
        `${current.subscriptionId}:${current.billingDate}` === key
      )) {
        this.billingOccurrences.set(occurrence.id, occurrence);
      }
    }
  }

  async saveCategory(category: Category): Promise<void> {
    const duplicate = [...this.categories.values()].find(
      (current) =>
        current.id !== category.id &&
        current.name.trim().toLocaleLowerCase() === category.name.trim().toLocaleLowerCase(),
    );
    if (duplicate) throw new Error('A Category with this name already exists.');
    this.categories.set(category.id, category);
  }

  async deleteCategory(categoryId: Category['id']): Promise<void> {
    if (!this.categories.has(categoryId)) throw new Error('Category not found.');
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.categoryId === categoryId) {
        this.subscriptions.set(id, { ...subscription, categoryId: null });
      }
    }
    this.categories.delete(categoryId);
  }

  async savePaymentMethod(paymentMethod: PaymentMethod): Promise<void> {
    const duplicate = [...this.paymentMethods.values()].find(
      (current) =>
        current.id !== paymentMethod.id &&
        current.name.trim().toLocaleLowerCase() === paymentMethod.name.trim().toLocaleLowerCase(),
    );
    if (duplicate) throw new Error('A Payment Method with this name already exists.');
    this.paymentMethods.set(paymentMethod.id, paymentMethod);
  }

  async deletePaymentMethod(paymentMethodId: PaymentMethod['id']): Promise<void> {
    if (!this.paymentMethods.has(paymentMethodId)) throw new Error('Payment Method not found.');
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.defaultPaymentMethodId === paymentMethodId) {
        this.subscriptions.set(id, { ...subscription, defaultPaymentMethodId: null });
      }
    }
    for (const [id, payment] of this.payments) {
      if (payment.paymentMethodId === paymentMethodId) {
        this.payments.set(id, { ...payment, paymentMethodId: null });
      }
    }
    this.paymentMethods.delete(paymentMethodId);
  }

  async saveOccurrenceResolution(
    occurrence: BillingOccurrence,
    resolution: Payment | ChargeException,
  ): Promise<void> {
    const existingOccurrence = [...this.billingOccurrences.values()].find(
      (current) =>
        current.subscriptionId === occurrence.subscriptionId &&
        current.billingDate === occurrence.billingDate,
    );
    const retainedOccurrence = existingOccurrence ?? occurrence;
    if (resolution.billingOccurrenceId !== retainedOccurrence.id) {
      throw new Error('Resolution does not belong to the retained Billing Occurrence.');
    }
    if (
      [...this.payments.values(), ...this.chargeExceptions.values()].some(
        (current) => current.billingOccurrenceId === retainedOccurrence.id,
      )
    ) {
      throw new Error('Billing Occurrence has already been resolved.');
    }
    this.billingOccurrences.set(retainedOccurrence.id, retainedOccurrence);
    if ('paymentDate' in resolution) this.payments.set(resolution.id, resolution);
    else this.chargeExceptions.set(resolution.id, resolution);
  }
}
