import type { HouseholdRepository } from '@/data/household-repository';
import { createCategory, updateCategory as renameCategory } from '@/domain/category';
import { createStandardSubscription } from '@/domain/create-subscription';
import type {
  BillingCycle,
  BillingOccurrence,
  BillingOccurrenceId,
  CategoryId,
  ChargeExceptionId,
  HouseholdList,
  HouseholdListId,
  PaymentId,
  PaymentMethodId,
  PricingArrangement,
  Subscription,
  SubscriptionLifecycle,
  SubscriptionId,
} from '@/domain/model';
import { starterCategories } from '@/domain/model';
import { createChargeException, createPayment } from '@/domain/occurrence-resolution';
import {
  calendarDate,
  calendarParts,
  cents,
  compareCalendarDates,
  entityId,
  formatCalendarDate,
  utcTimestamp,
  type CalendarDate,
  DomainValidationError,
} from '@/domain/primitives';
import {
  amountForOccurrence,
  nextOccurrenceOnOrAfter,
  occurrencesInRange,
} from '@/domain/recurrence';
import {
  createPaymentMethod,
  setPaymentMethodRetired,
  updatePaymentMethod,
  updateStandardSubscription,
} from '@/domain/subscription-profile';
import {
  cancelSubscription as markSubscriptionCanceled,
  editCancellationDetails as updateCancellationDetails,
  reactivateSubscription as returnSubscriptionToActive,
} from '@/domain/subscription-lifecycle';

export interface TrackerDependencies {
  readonly repository: HouseholdRepository;
  readonly createId: () => string;
  readonly now: () => Date;
}

export interface AddStandardSubscriptionCommand {
  readonly name: string;
  readonly amountCents: number;
  readonly cycle: BillingCycle;
  readonly scheduleStartDate: string;
  readonly anchorDay?: number;
  readonly categoryId?: CategoryId | null;
  readonly note?: string | null;
  readonly cancellationUrl?: string | null;
  readonly defaultPaymentMethodId?: PaymentMethodId | null;
  readonly reminderLeadDaysOverride?: number | null;
  readonly notificationsMuted?: boolean;
  readonly savePossibleDuplicate?: boolean;
}

export interface EditStandardSubscriptionCommand extends AddStandardSubscriptionCommand {
  readonly subscriptionId: SubscriptionId;
}

export interface AddPaymentMethodCommand {
  readonly name: string;
  readonly note?: string | null;
}

export interface UpdatePaymentMethodCommand extends AddPaymentMethodCommand {
  readonly paymentMethodId: PaymentMethodId;
}

export interface AddCategoryCommand {
  readonly name: string;
}

export interface UpdateCategoryCommand extends AddCategoryCommand {
  readonly categoryId: CategoryId;
}

export interface CategoryOption {
  readonly id: CategoryId;
  readonly name: string;
  readonly subscriptionCount: number;
}

export interface PaymentMethodOption {
  readonly id: PaymentMethodId;
  readonly name: string;
  readonly note: string | null;
  readonly retired: boolean;
  readonly subscriptionCount: number;
  readonly paymentCount: number;
}

export interface PossibleDuplicateSummary {
  readonly id: SubscriptionId;
  readonly name: string;
  readonly amountCents: number;
  readonly cycle: BillingCycle;
  readonly nextBillingDate: CalendarDate;
}

export type SaveSubscriptionResult =
  | { readonly status: 'saved'; readonly subscriptionId: SubscriptionId }
  | { readonly status: 'possibleDuplicate'; readonly candidate: PossibleDuplicateSummary };

export interface SubscriptionDetail {
  readonly id: SubscriptionId;
  readonly name: string;
  readonly categoryId: CategoryId | null;
  readonly category: string | null;
  readonly note: string | null;
  readonly cancellationUrl: string | null;
  readonly defaultPaymentMethodId: PaymentMethodId | null;
  readonly defaultPaymentMethodName: string | null;
  readonly defaultPaymentMethodRetired: boolean;
  readonly schedule: Subscription['schedule'];
  readonly pricing: PricingArrangement;
  readonly lifecycle: SubscriptionLifecycle;
  readonly reminderLeadDaysOverride: number | null;
  readonly householdReminderLeadDays: number;
  readonly notificationsMuted: boolean;
  readonly archived: boolean;
  readonly nextBillingDate: CalendarDate | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpcomingCharge {
  readonly billingOccurrenceId: BillingOccurrenceId | null;
  readonly subscriptionId: SubscriptionId;
  readonly name: string;
  readonly billingDate: CalendarDate;
  readonly amountCents: number;
  readonly category: string | null;
}

export type UpcomingChargeGroupKey =
  | 'actionNeeded'
  | 'next7Days'
  | 'laterThisMonth'
  | 'later';

export interface UpcomingChargeGroup {
  readonly key: UpcomingChargeGroupKey;
  readonly charges: readonly UpcomingCharge[];
}

export interface DashboardProjection {
  readonly monthlyCommitmentCents: number;
  readonly dueNext30DaysCents: number;
  readonly upcomingChargeGroups: readonly UpcomingChargeGroup[];
}

export type BillingOccurrenceResolution =
  | { readonly kind: 'unresolved' }
  | {
      readonly kind: 'paid';
      readonly amountCents: number;
      readonly paymentDate: CalendarDate;
      readonly paymentMethodName: string | null;
      readonly note: string | null;
    }
  | { readonly kind: 'noCharge'; readonly reason: string | null };

export interface BillingOccurrenceDetail {
  readonly billingOccurrenceId: BillingOccurrenceId | null;
  readonly subscriptionId: SubscriptionId;
  readonly subscriptionName: string;
  readonly billingDate: CalendarDate;
  readonly expectedAmountCents: number;
  readonly defaultPaymentMethodId: PaymentMethodId | null;
  readonly cancellationUrl: string | null;
  readonly canCancelSubscription: boolean;
  readonly resolution: BillingOccurrenceResolution;
}

export interface CancellationOccurrenceSummary {
  readonly billingDate: CalendarDate;
  readonly expectedAmountCents: number;
}

export interface CancellationPreview {
  readonly subscriptionId: SubscriptionId;
  readonly subscriptionName: string;
  readonly confirmationDate: CalendarDate;
  readonly affectedOccurrences: readonly CancellationOccurrenceSummary[];
}

export interface CancelSubscriptionCommand {
  readonly subscriptionId: SubscriptionId;
  readonly confirmationDate: string;
  readonly accessEndDate?: string | null;
}

export type EditCancellationDetailsCommand = CancelSubscriptionCommand;

export interface ReactivateSubscriptionCommand {
  readonly subscriptionId: SubscriptionId;
  readonly nextBillingDate: string;
}

export interface RecordPaymentCommand {
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: string;
  readonly amountCents: number;
  readonly paymentDate: string;
  readonly paymentMethodId?: PaymentMethodId | null;
  readonly note?: string | null;
}

export interface RecordNoChargeCommand {
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: string;
  readonly reason?: string | null;
}

export interface SubscriptionListItem {
  readonly id: SubscriptionId;
  readonly name: string;
  readonly categoryId: CategoryId | null;
  readonly category: string | null;
  readonly lifecycle: SubscriptionLifecycle['status'];
  readonly amountCents: number;
  readonly cycle: BillingCycle;
  readonly nextBillingDate: CalendarDate | null;
  readonly archived: boolean;
}

export interface NotificationSettings {
  readonly defaultReminderLeadDays: number;
  readonly reminderTime: string;
}

export interface BillingReminderPlan {
  readonly subscriptionId: SubscriptionId;
  readonly subscriptionName: string;
  readonly billingDate: CalendarDate;
  readonly triggerDate: Date;
}

/** App-facing module: coordinates domain behavior while hiding persistence details from screens. */
export class SubscriptionTracker {
  private householdId: HouseholdListId | null = null;

  constructor(private readonly dependencies: TrackerDependencies) {}

  async initialize(): Promise<void> {
    await this.dependencies.repository.migrate();
    let household = await this.dependencies.repository.getHousehold();
    if (!household) {
      household = this.createDefaultHousehold();
      await this.dependencies.repository.createHousehold(household);
      for (const starter of starterCategories) {
        await this.dependencies.repository.saveCategory(createCategory({
          id: entityId<'Category'>(starter.id),
          householdListId: household.id,
          name: starter.name,
          now: household.createdAt,
        }));
      }
    }
    this.householdId = household.id;
    await this.reconcileDueOccurrences(localCalendarDate(this.dependencies.now()));
  }

  async addStandardSubscription(command: AddStandardSubscriptionCommand): Promise<SaveSubscriptionResult> {
    const householdId = this.requireHouseholdId();
    const asOf = localCalendarDate(this.dependencies.now());
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const subscription = createStandardSubscription({
      ...command,
      id: entityId<'Subscription'>(this.dependencies.createId()),
      householdListId: householdId,
      categoryId: validateCategoryAssignment(snapshot, command.categoryId),
      now: this.dependencies.now().toISOString(),
    });
    if (compareCalendarDates(subscription.schedule.startDate, asOf) < 0) {
      throw new DomainValidationError('First Billing Date cannot be in the past.');
    }
    validateDefaultPaymentMethod(snapshot, subscription.defaultPaymentMethodId, null);
    const duplicate = findPossibleDuplicate(snapshot.subscriptions, subscription, asOf);
    if (duplicate && !command.savePossibleDuplicate) {
      return { status: 'possibleDuplicate', candidate: duplicate };
    }
    const occurrences = this.missingOccurrences(snapshot, subscription, asOf);
    await this.dependencies.repository.saveSubscriptionWithOccurrences(subscription, occurrences);
    return { status: 'saved', subscriptionId: subscription.id };
  }

  async editStandardSubscription(command: EditStandardSubscriptionCommand): Promise<SaveSubscriptionResult> {
    const asOf = localCalendarDate(this.dependencies.now());
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = snapshot.subscriptions.find((item) => item.id === command.subscriptionId);
    if (!current) throw new Error('Subscription not found.');
    const elapsedOccurrences = this.missingOccurrences(snapshot, current, asOf);
    const schedule = {
      cycle: command.cycle,
      startDate: calendarDate(command.scheduleStartDate),
      anchorDay: command.anchorDay ?? calendarParts(calendarDate(command.scheduleStartDate)).day,
    };
    const scheduleChanged =
      schedule.cycle !== current.schedule.cycle ||
      schedule.startDate !== current.schedule.startDate ||
      schedule.anchorDay !== current.schedule.anchorDay;
    if (scheduleChanged && compareCalendarDates(schedule.startDate, asOf) <= 0) {
      throw new DomainValidationError('A changed Next Billing Date must be after today.');
    }
    const subscription = updateStandardSubscription(
      current,
      {
        name: command.name,
        categoryId: validateCategoryAssignment(snapshot, command.categoryId),
        note: command.note ?? null,
        cancellationUrl: command.cancellationUrl ?? null,
        defaultPaymentMethodId: command.defaultPaymentMethodId ?? null,
        schedule,
        pricing: { kind: 'standard', standardAmount: cents(command.amountCents) },
        reminderLeadDaysOverride: command.reminderLeadDaysOverride ?? null,
        notificationsMuted: command.notificationsMuted ?? false,
      },
      this.dependencies.now().toISOString(),
    );
    validateDefaultPaymentMethod(snapshot, subscription.defaultPaymentMethodId, current.defaultPaymentMethodId);
    const duplicate = findPossibleDuplicate(
      snapshot.subscriptions,
      subscription,
      asOf,
      subscription.id,
    );
    if (duplicate && !command.savePossibleDuplicate) {
      return { status: 'possibleDuplicate', candidate: duplicate };
    }
    await this.dependencies.repository.saveSubscriptionWithOccurrences(subscription, elapsedOccurrences);
    return { status: 'saved', subscriptionId: subscription.id };
  }

  async addCategory(command: AddCategoryCommand): Promise<CategoryOption> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    validateUniqueCategoryName(snapshot, command.name);
    const category = createCategory({
      id: entityId<'Category'>(this.dependencies.createId()),
      householdListId: this.requireHouseholdId(),
      name: command.name,
      now: this.dependencies.now().toISOString(),
    });
    await this.dependencies.repository.saveCategory(category);
    return categoryOption(category, snapshot);
  }

  async loadCategories(): Promise<readonly CategoryOption[]> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    return snapshot.categories
      .map((category) => categoryOption(category, snapshot))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  }

  async updateCategory(command: UpdateCategoryCommand): Promise<CategoryOption> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requireCategory(snapshot, command.categoryId);
    validateUniqueCategoryName(snapshot, command.name, current.id);
    const category = renameCategory(current, command.name, this.dependencies.now().toISOString());
    await this.dependencies.repository.saveCategory(category);
    return categoryOption(category, snapshot);
  }

  async deleteCategory(categoryId: CategoryId): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    requireCategory(snapshot, categoryId);
    await this.dependencies.repository.deleteCategory(categoryId);
  }

  async addPaymentMethod(command: AddPaymentMethodCommand): Promise<PaymentMethodOption> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const normalizedName = command.name.trim().toLocaleLowerCase();
    if (snapshot.paymentMethods.some((item) => item.name.trim().toLocaleLowerCase() === normalizedName)) {
      throw new DomainValidationError('A Payment Method with this name already exists.');
    }
    const paymentMethod = createPaymentMethod({
      id: entityId<'PaymentMethod'>(this.dependencies.createId()),
      householdListId: this.requireHouseholdId(),
      name: command.name,
      note: command.note,
      now: this.dependencies.now().toISOString(),
    });
    await this.dependencies.repository.savePaymentMethod(paymentMethod);
    return paymentMethodOption(paymentMethod, snapshot);
  }

  async loadPaymentMethods(): Promise<readonly PaymentMethodOption[]> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    return snapshot.paymentMethods
      .map((paymentMethod) => paymentMethodOption(paymentMethod, snapshot))
      .sort((left, right) => Number(left.retired) - Number(right.retired) || left.name.localeCompare(right.name));
  }

  async updatePaymentMethod(command: UpdatePaymentMethodCommand): Promise<PaymentMethodOption> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requirePaymentMethod(snapshot, command.paymentMethodId);
    validateUniquePaymentMethodName(snapshot, command.name, current.id);
    const paymentMethod = updatePaymentMethod(current, {
      name: command.name,
      note: command.note,
      now: this.dependencies.now().toISOString(),
    });
    await this.dependencies.repository.savePaymentMethod(paymentMethod);
    return paymentMethodOption(paymentMethod, snapshot);
  }

  async setPaymentMethodRetired(paymentMethodId: PaymentMethodId, retired: boolean): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requirePaymentMethod(snapshot, paymentMethodId);
    if ((current.retiredAt !== null) === retired) return;
    await this.dependencies.repository.savePaymentMethod(
      setPaymentMethodRetired(current, retired, this.dependencies.now().toISOString()),
    );
  }

  async deletePaymentMethod(paymentMethodId: PaymentMethodId): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    requirePaymentMethod(snapshot, paymentMethodId);
    await this.dependencies.repository.deletePaymentMethod(paymentMethodId);
  }

  async loadSubscriptionDetail(subscriptionId: SubscriptionId): Promise<SubscriptionDetail> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const subscription = snapshot.subscriptions.find((item) => item.id === subscriptionId);
    if (!subscription) throw new Error('Subscription not found.');
    const paymentMethod = subscription.defaultPaymentMethodId
      ? snapshot.paymentMethods.find((item) => item.id === subscription.defaultPaymentMethodId)
      : null;
    return {
      id: subscription.id,
      name: subscription.name,
      categoryId: subscription.categoryId,
      category: categoryName(snapshot, subscription.categoryId),
      note: subscription.note,
      cancellationUrl: subscription.cancellationUrl,
      defaultPaymentMethodId: subscription.defaultPaymentMethodId,
      defaultPaymentMethodName: paymentMethod?.name ?? null,
      defaultPaymentMethodRetired: Boolean(paymentMethod?.retiredAt),
      schedule: subscription.schedule,
      pricing: subscription.pricing,
      lifecycle: subscription.lifecycle,
      reminderLeadDaysOverride: subscription.reminderLeadDaysOverride,
      householdReminderLeadDays: snapshot.household.defaultReminderLeadDays,
      notificationsMuted: subscription.notificationsMuted,
      archived: subscription.archivedAt !== null,
      nextBillingDate: nextBillingDateFor(subscription, localCalendarDate(this.dependencies.now())),
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  async loadBillingOccurrenceDetail(
    subscriptionId: SubscriptionId,
    billingDateInput: string,
  ): Promise<BillingOccurrenceDetail> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const billingDate = calendarDate(billingDateInput);
    const subscription = snapshot.subscriptions.find((item) => item.id === subscriptionId);
    if (!subscription) throw new Error('Subscription not found.');
    const occurrence = findOccurrence(snapshot, subscriptionId, billingDate);
    if (!occurrence && !isProjectedOccurrence(subscription, billingDate)) {
      throw new DomainValidationError('Billing Occurrence does not belong to this Subscription schedule.');
    }
    const payment = occurrence
      ? snapshot.payments.find((item) => item.billingOccurrenceId === occurrence.id)
      : null;
    const exception = occurrence
      ? snapshot.chargeExceptions.find((item) => item.billingOccurrenceId === occurrence.id)
      : null;
    const paymentMethod = payment?.paymentMethodId
      ? snapshot.paymentMethods.find((item) => item.id === payment.paymentMethodId)
      : null;
    const resolution: BillingOccurrenceResolution = payment
      ? {
          kind: 'paid',
          amountCents: payment.amount,
          paymentDate: payment.paymentDate,
          paymentMethodName: paymentMethod?.name ?? null,
          note: payment.note,
        }
      : exception
        ? { kind: 'noCharge', reason: exception.reason }
        : { kind: 'unresolved' };
    return {
      billingOccurrenceId: occurrence?.id ?? null,
      subscriptionId,
      subscriptionName: subscription.name,
      billingDate,
      expectedAmountCents:
        occurrence?.expectedAmount ?? amountForOccurrence(subscription.pricing, billingDate),
      defaultPaymentMethodId: subscription.defaultPaymentMethodId,
      cancellationUrl: subscription.cancellationUrl,
      canCancelSubscription:
        !subscription.archivedAt && subscription.lifecycle.status !== 'canceled',
      resolution,
    };
  }

  async loadCancellationPreview(
    subscriptionId: SubscriptionId,
    confirmationDateInput: string,
  ): Promise<CancellationPreview> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const subscription = requireSubscription(snapshot, subscriptionId);
    const asOf = localCalendarDate(this.dependencies.now());
    const confirmationDate = calendarDate(confirmationDateInput);
    markSubscriptionCanceled(subscription, {
      confirmationDate,
      asOf,
      now: this.dependencies.now().toISOString(),
    });
    return {
      subscriptionId,
      subscriptionName: subscription.name,
      confirmationDate,
      affectedOccurrences: unresolvedCancellationOccurrences(
        snapshot,
        subscriptionId,
        confirmationDate,
        asOf,
      ).map((occurrence) => ({
        billingDate: occurrence.billingDate,
        expectedAmountCents: occurrence.expectedAmount,
      })),
    };
  }

  async cancelSubscription(command: CancelSubscriptionCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requireSubscription(snapshot, command.subscriptionId);
    const now = this.dependencies.now();
    const asOf = localCalendarDate(now);
    const subscription = markSubscriptionCanceled(current, {
      confirmationDate: command.confirmationDate,
      accessEndDate: command.accessEndDate,
      asOf,
      now: now.toISOString(),
    });
    const exceptions = unresolvedCancellationOccurrences(
      snapshot,
      current.id,
      calendarDate(command.confirmationDate),
      asOf,
    ).map((occurrence) =>
      createChargeException({
        id: entityId<'ChargeException'>(this.dependencies.createId()) as ChargeExceptionId,
        billingOccurrenceId: occurrence.id,
        reason: 'Subscription canceled before charge',
        now: now.toISOString(),
      }),
    );
    await this.dependencies.repository.saveSubscriptionCancellation(subscription, exceptions);
  }

  async editCancellationDetails(command: EditCancellationDetailsCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requireSubscription(snapshot, command.subscriptionId);
    const now = this.dependencies.now();
    const subscription = updateCancellationDetails(current, {
      confirmationDate: command.confirmationDate,
      accessEndDate: command.accessEndDate,
      asOf: localCalendarDate(now),
      now: now.toISOString(),
    });
    await this.dependencies.repository.saveSubscription(subscription);
  }

  async reactivateSubscription(command: ReactivateSubscriptionCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requireSubscription(snapshot, command.subscriptionId);
    const now = this.dependencies.now();
    const subscription = returnSubscriptionToActive(current, {
      nextBillingDate: command.nextBillingDate,
      asOf: localCalendarDate(now),
      now: now.toISOString(),
    });
    await this.dependencies.repository.saveSubscription(subscription);
  }

  async recordPayment(command: RecordPaymentCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const billingDate = calendarDate(command.billingDate);
    const occurrence = this.occurrenceForResolution(snapshot, command.subscriptionId, billingDate);
    assertUnresolved(snapshot, occurrence.id);
    const paymentMethodId = command.paymentMethodId ?? null;
    if (paymentMethodId) {
      const method = snapshot.paymentMethods.find((item) => item.id === paymentMethodId);
      if (!method) throw new DomainValidationError('Selected Payment Method does not exist.');
      if (method.retiredAt) {
        throw new DomainValidationError('A Retired Payment Method cannot be used for a new Payment.');
      }
    }
    const payment = createPayment({
      id: entityId<'Payment'>(this.dependencies.createId()) as PaymentId,
      billingOccurrenceId: occurrence.id,
      amountCents: command.amountCents,
      paymentDate: command.paymentDate,
      paymentMethodId,
      note: command.note,
      now: this.dependencies.now().toISOString(),
    });
    await this.dependencies.repository.saveOccurrenceResolution(occurrence, payment);
  }

  async recordNoCharge(command: RecordNoChargeCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const billingDate = calendarDate(command.billingDate);
    const occurrence = this.occurrenceForResolution(snapshot, command.subscriptionId, billingDate);
    assertUnresolved(snapshot, occurrence.id);
    const exception = createChargeException({
      id: entityId<'ChargeException'>(this.dependencies.createId()) as ChargeExceptionId,
      billingOccurrenceId: occurrence.id,
      reason: command.reason,
      now: this.dependencies.now().toISOString(),
    });
    await this.dependencies.repository.saveOccurrenceResolution(occurrence, exception);
  }

  async loadDashboard(asOf = localCalendarDate(this.dependencies.now())): Promise<DashboardProjection> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const visibleSubscriptions = snapshot.subscriptions.filter(
      (subscription) => subscription.archivedAt === null,
    );
    const activeSubscriptions = snapshot.subscriptions.filter(
      (subscription) =>
        subscription.archivedAt === null &&
        subscription.lifecycle.status === 'active',
    );
    const subscriptionsById = new Map(
      visibleSubscriptions.map((subscription) => [subscription.id, subscription]),
    );
    const resolvedOccurrenceIds = new Set([
      ...snapshot.payments.map((payment) => payment.billingOccurrenceId),
      ...snapshot.chargeExceptions.map((exception) => exception.billingOccurrenceId),
    ]);
    const actionNeeded = snapshot.billingOccurrences
      .filter(
        (occurrence) =>
          compareCalendarDates(occurrence.billingDate, asOf) < 0 &&
          !resolvedOccurrenceIds.has(occurrence.id) &&
          subscriptionsById.has(occurrence.subscriptionId),
      )
      .map((occurrence): UpcomingCharge => {
        const subscription = subscriptionsById.get(occurrence.subscriptionId)!;
        return {
          billingOccurrenceId: occurrence.id,
          subscriptionId: subscription.id,
          name: subscription.name,
          billingDate: occurrence.billingDate,
          amountCents: occurrence.expectedAmount,
          category: categoryName(snapshot, subscription.categoryId),
        };
      });
    const next7DaysEnd = addCalendarDays(asOf, 6);
    const rollingWindowEnd = addCalendarDays(asOf, 29);
    const chargesInWindow = activeSubscriptions.flatMap((subscription) =>
      occurrencesInRange(subscription.schedule, asOf, rollingWindowEnd)
        .map((billingDate) => upcomingChargeFor(snapshot, subscription, billingDate))
        .filter((charge) => !chargeIsResolved(charge, resolvedOccurrenceIds)),
    );
    const next7Days = chargesInWindow.filter(
      (charge) => compareCalendarDates(charge.billingDate, next7DaysEnd) <= 0,
    );
    const laterThisMonth = chargesInWindow.filter(
      (charge) => compareCalendarDates(charge.billingDate, next7DaysEnd) > 0,
    );
    const subscriptionsInWindow = new Set(
      chargesInWindow.map((charge) => charge.subscriptionId),
    );
    const later = activeSubscriptions
      .filter((subscription) => !subscriptionsInWindow.has(subscription.id))
      .map((subscription) => {
        const billingDate = nextUnresolvedBillingDate(
          snapshot,
          subscription,
          asOf,
          resolvedOccurrenceIds,
        );
        return upcomingChargeFor(snapshot, subscription, billingDate);
      });
    const upcomingChargeGroups = (
      [
        { key: 'actionNeeded', charges: actionNeeded },
        { key: 'next7Days', charges: next7Days },
        { key: 'laterThisMonth', charges: laterThisMonth },
        { key: 'later', charges: later },
      ] satisfies UpcomingChargeGroup[]
    )
      .map((group) => ({ ...group, charges: [...group.charges].sort(compareUpcomingCharges) }))
      .filter((group) => group.charges.length > 0);
    const dueNext30DaysCents = chargesInWindow.reduce(
      (total, charge) => total + charge.amountCents,
      0,
    );
    const monthlyCommitmentCents = activeSubscriptions.reduce((total, subscription) => {
      const next = nextOccurrenceOnOrAfter(subscription.schedule, asOf);
      const amount = amountForOccurrence(subscription.pricing, next);
      return total + (subscription.schedule.cycle === 'yearly' ? Math.round(amount / 12) : amount);
    }, 0);
    return { monthlyCommitmentCents, dueNext30DaysCents, upcomingChargeGroups };
  }

  async loadSubscriptions(
    asOf = localCalendarDate(this.dependencies.now()),
  ): Promise<readonly SubscriptionListItem[]> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    return snapshot.subscriptions
      .map((subscription): SubscriptionListItem => {
        const nextBillingDate =
          subscription.lifecycle.status === 'active'
            ? nextOccurrenceOnOrAfter(subscription.schedule, asOf)
            : subscription.lifecycle.status === 'paused'
              ? subscription.lifecycle.pauseEndDate
              : null;
        const amountDate = nextBillingDate ?? asOf;
        return {
          id: subscription.id,
          name: subscription.name,
          categoryId: subscription.categoryId,
          category: categoryName(snapshot, subscription.categoryId),
          lifecycle: subscription.lifecycle.status,
          amountCents: amountForOccurrence(subscription.pricing, amountDate),
          cycle: subscription.schedule.cycle,
          nextBillingDate,
          archived: subscription.archivedAt !== null,
        };
      })
      .sort((left, right) => {
        const lifecycleDifference = lifecycleRank(left.lifecycle) - lifecycleRank(right.lifecycle);
        return lifecycleDifference || left.name.localeCompare(right.name);
      });
  }

  async loadNotificationSettings(): Promise<NotificationSettings> {
    const { household } = await this.dependencies.repository.loadSnapshot();
    return {
      defaultReminderLeadDays: household.defaultReminderLeadDays,
      reminderTime: household.reminderTime,
    };
  }

  async updateDefaultReminderLeadDays(defaultReminderLeadDays: number): Promise<void> {
    if (!Number.isInteger(defaultReminderLeadDays) || defaultReminderLeadDays < 0 || defaultReminderLeadDays > 365) {
      throw new DomainValidationError('Default Lead Time must be a whole number from 0 to 365.');
    }
    const { household } = await this.dependencies.repository.loadSnapshot();
    if (household.defaultReminderLeadDays === defaultReminderLeadDays) return;
    await this.dependencies.repository.saveHousehold({
      ...household,
      defaultReminderLeadDays,
      updatedAt: utcTimestamp(this.dependencies.now().toISOString()),
    });
  }

  async loadBillingReminderPlans(): Promise<readonly BillingReminderPlan[]> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const now = this.dependencies.now();
    const asOf = localCalendarDate(now);
    return snapshot.subscriptions.flatMap((subscription) => {
      if (
        subscription.archivedAt ||
        subscription.notificationsMuted ||
        subscription.lifecycle.status !== 'active'
      ) {
        return [];
      }
      const leadDays = subscription.reminderLeadDaysOverride ?? snapshot.household.defaultReminderLeadDays;
      let billingDate = nextOccurrenceOnOrAfter(subscription.schedule, asOf);
      let triggerDate = localReminderDate(billingDate, leadDays, snapshot.household.reminderTime);
      if (triggerDate <= now) {
        billingDate = nextOccurrenceOnOrAfter(subscription.schedule, addCalendarDays(billingDate, 1));
        triggerDate = localReminderDate(billingDate, leadDays, snapshot.household.reminderTime);
      }
      return [{
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        billingDate,
        triggerDate,
      }];
    });
  }

  private async reconcileDueOccurrences(asOf: CalendarDate): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const existing = new Set(
      snapshot.billingOccurrences.map(
        (occurrence) => `${occurrence.subscriptionId}:${occurrence.billingDate}`,
      ),
    );
    const createdAt = utcTimestamp(this.dependencies.now().toISOString());
    const missing: BillingOccurrence[] = [];
    for (const subscription of snapshot.subscriptions) {
      if (
        subscription.lifecycle.status !== 'active'
      ) {
        continue;
      }
      for (const billingDate of occurrencesInRange(
        subscription.schedule,
        subscription.schedule.startDate,
        asOf,
      )) {
        const key = `${subscription.id}:${billingDate}`;
        if (existing.has(key)) continue;
        missing.push({
          id: entityId<'BillingOccurrence'>(this.dependencies.createId()) as BillingOccurrenceId,
          subscriptionId: subscription.id,
          billingDate,
          expectedAmount: amountForOccurrence(subscription.pricing, billingDate),
          createdAt,
        });
      }
    }
    await this.dependencies.repository.saveBillingOccurrences(missing);
  }

  private occurrenceForResolution(
    snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
    subscriptionId: SubscriptionId,
    billingDate: CalendarDate,
  ): BillingOccurrence {
    const existing = findOccurrence(snapshot, subscriptionId, billingDate);
    if (existing) return existing;
    const subscription = snapshot.subscriptions.find((item) => item.id === subscriptionId);
    if (!subscription) throw new Error('Subscription not found.');
    if (!isProjectedOccurrence(subscription, billingDate)) {
      throw new DomainValidationError('Billing Occurrence does not belong to this Subscription schedule.');
    }
    return {
      id: entityId<'BillingOccurrence'>(this.dependencies.createId()) as BillingOccurrenceId,
      subscriptionId,
      billingDate,
      expectedAmount: amountForOccurrence(subscription.pricing, billingDate),
      createdAt: utcTimestamp(this.dependencies.now().toISOString()),
    };
  }

  private missingOccurrences(
    snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
    subscription: Subscription,
    asOf: CalendarDate,
  ): readonly BillingOccurrence[] {
    if (
      subscription.lifecycle.status !== 'active'
    ) {
      return [];
    }
    const existing = new Set(
      snapshot.billingOccurrences.map((item) => `${item.subscriptionId}:${item.billingDate}`),
    );
    const createdAt = utcTimestamp(this.dependencies.now().toISOString());
    return occurrencesInRange(subscription.schedule, subscription.schedule.startDate, asOf)
      .filter((billingDate) => !existing.has(`${subscription.id}:${billingDate}`))
      .map((billingDate) => ({
        id: entityId<'BillingOccurrence'>(this.dependencies.createId()) as BillingOccurrenceId,
        subscriptionId: subscription.id,
        billingDate,
        expectedAmount: amountForOccurrence(subscription.pricing, billingDate),
        createdAt,
      }));
  }

  private createDefaultHousehold(): HouseholdList {
    const timestamp = utcTimestamp(this.dependencies.now().toISOString());
    return {
      id: entityId<'HouseholdList'>(this.dependencies.createId()),
      currency: 'USD',
      defaultReminderLeadDays: 5,
      reminderTime: '09:00',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private requireHouseholdId(): HouseholdListId {
    if (!this.householdId) throw new Error('SubscriptionTracker must be initialized before use.');
    return this.householdId;
  }
}

type Snapshot = Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>;

function categoryOption(category: Snapshot['categories'][number], snapshot: Snapshot): CategoryOption {
  return {
    id: category.id,
    name: category.name,
    subscriptionCount: snapshot.subscriptions.filter(
      (subscription) => subscription.categoryId === category.id,
    ).length,
  };
}

function requireCategory(snapshot: Snapshot, categoryId: CategoryId) {
  const category = snapshot.categories.find((item) => item.id === categoryId);
  if (!category) throw new DomainValidationError('Category not found.');
  return category;
}

function validateUniqueCategoryName(
  snapshot: Snapshot,
  name: string,
  excludedId?: CategoryId,
): void {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (normalizedName === 'uncategorized') {
    throw new DomainValidationError('Uncategorized is reserved for Subscriptions without a Category.');
  }
  if (snapshot.categories.some(
    (item) => item.id !== excludedId && item.name.trim().toLocaleLowerCase() === normalizedName,
  )) {
    throw new DomainValidationError('A Category with this name already exists.');
  }
}

function validateCategoryAssignment(
  snapshot: Snapshot,
  categoryId: CategoryId | null | undefined,
): CategoryId | null {
  if (!categoryId) return null;
  if (!snapshot.categories.some((item) => item.id === categoryId)) {
    throw new DomainValidationError('Selected Category does not exist.');
  }
  return categoryId;
}

function categoryName(snapshot: Snapshot, categoryId: CategoryId | null): string | null {
  if (!categoryId) return null;
  return snapshot.categories.find((item) => item.id === categoryId)?.name ?? null;
}

function paymentMethodOption(paymentMethod: Snapshot['paymentMethods'][number], snapshot: Snapshot): PaymentMethodOption {
  return {
    id: paymentMethod.id,
    name: paymentMethod.name,
    note: paymentMethod.note,
    retired: paymentMethod.retiredAt !== null,
    subscriptionCount: snapshot.subscriptions.filter(
      (subscription) => subscription.defaultPaymentMethodId === paymentMethod.id,
    ).length,
    paymentCount: snapshot.payments.filter((payment) => payment.paymentMethodId === paymentMethod.id).length,
  };
}

function requirePaymentMethod(snapshot: Snapshot, paymentMethodId: PaymentMethodId) {
  const paymentMethod = snapshot.paymentMethods.find((item) => item.id === paymentMethodId);
  if (!paymentMethod) throw new DomainValidationError('Payment Method not found.');
  return paymentMethod;
}

function validateUniquePaymentMethodName(
  snapshot: Snapshot,
  name: string,
  excludedId?: PaymentMethodId,
): void {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (snapshot.paymentMethods.some(
    (item) => item.id !== excludedId && item.name.trim().toLocaleLowerCase() === normalizedName,
  )) {
    throw new DomainValidationError('A Payment Method with this name already exists.');
  }
}

function validateDefaultPaymentMethod(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  paymentMethodId: PaymentMethodId | null,
  existingPaymentMethodId: PaymentMethodId | null,
): void {
  if (!paymentMethodId) return;
  const paymentMethod = snapshot.paymentMethods.find((item) => item.id === paymentMethodId);
  if (!paymentMethod) throw new DomainValidationError('Selected Default Payment Method does not exist.');
  if (paymentMethod.retiredAt && paymentMethodId !== existingPaymentMethodId) {
    throw new DomainValidationError('A Retired Payment Method cannot be newly assigned.');
  }
}

function findPossibleDuplicate(
  subscriptions: readonly Subscription[],
  draft: Subscription,
  asOf: CalendarDate,
  excludedId?: SubscriptionId,
): PossibleDuplicateSummary | null {
  const draftDate = nextBillingDateFor(draft, asOf);
  if (!draftDate || draft.pricing.kind !== 'standard') return null;
  const normalizedName = draft.name.trim().toLocaleLowerCase();
  for (const candidate of subscriptions) {
    if (candidate.id === excludedId || candidate.archivedAt || candidate.pricing.kind !== 'standard') continue;
    const candidateDate = nextBillingDateFor(candidate, asOf);
    if (!candidateDate) continue;
    if (
      candidate.name.trim().toLocaleLowerCase() === normalizedName &&
      candidate.pricing.standardAmount === draft.pricing.standardAmount &&
      candidate.schedule.cycle === draft.schedule.cycle &&
      calendarDayDistance(candidateDate, draftDate) <= 3
    ) {
      return {
        id: candidate.id,
        name: candidate.name,
        amountCents: candidate.pricing.standardAmount,
        cycle: candidate.schedule.cycle,
        nextBillingDate: candidateDate,
      };
    }
  }
  return null;
}

function nextBillingDateFor(subscription: Subscription, asOf: CalendarDate): CalendarDate | null {
  if (
    subscription.lifecycle.status === 'active'
  ) {
    return nextOccurrenceOnOrAfter(subscription.schedule, asOf);
  }
  return subscription.lifecycle.status === 'paused' ? subscription.lifecycle.pauseEndDate : null;
}

function calendarDayDistance(left: CalendarDate, right: CalendarDate): number {
  const leftParts = calendarParts(left);
  const rightParts = calendarParts(right);
  const leftTime = Date.UTC(leftParts.year, leftParts.month - 1, leftParts.day);
  const rightTime = Date.UTC(rightParts.year, rightParts.month - 1, rightParts.day);
  return Math.abs(Math.round((leftTime - rightTime) / 86_400_000));
}

function upcomingChargeFor(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  subscription: Subscription,
  billingDate: CalendarDate,
): UpcomingCharge {
  const occurrence = snapshot.billingOccurrences.find(
    (item) => item.subscriptionId === subscription.id && item.billingDate === billingDate,
  );
  return {
    billingOccurrenceId: occurrence?.id ?? null,
    subscriptionId: subscription.id,
    name: subscription.name,
    billingDate,
    amountCents: occurrence?.expectedAmount ?? amountForOccurrence(subscription.pricing, billingDate),
    category: categoryName(snapshot, subscription.categoryId),
  };
}

function findOccurrence(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  subscriptionId: SubscriptionId,
  billingDate: CalendarDate,
): BillingOccurrence | undefined {
  return snapshot.billingOccurrences.find(
    (item) => item.subscriptionId === subscriptionId && item.billingDate === billingDate,
  );
}

function isProjectedOccurrence(
  subscription: Subscription,
  billingDate: CalendarDate,
): boolean {
  if (
    subscription.lifecycle.status !== 'active'
  ) {
    return false;
  }
  return occurrencesInRange(subscription.schedule, billingDate, billingDate).length === 1;
}

function assertUnresolved(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  billingOccurrenceId: BillingOccurrenceId,
): void {
  if (
    snapshot.payments.some((item) => item.billingOccurrenceId === billingOccurrenceId) ||
    snapshot.chargeExceptions.some((item) => item.billingOccurrenceId === billingOccurrenceId)
  ) {
    throw new DomainValidationError('Billing Occurrence has already been resolved.');
  }
}

function chargeIsResolved(
  charge: UpcomingCharge,
  resolvedOccurrenceIds: ReadonlySet<BillingOccurrenceId>,
): boolean {
  return charge.billingOccurrenceId !== null && resolvedOccurrenceIds.has(charge.billingOccurrenceId);
}

function nextUnresolvedBillingDate(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  subscription: Subscription,
  asOf: CalendarDate,
  resolvedOccurrenceIds: ReadonlySet<BillingOccurrenceId>,
): CalendarDate {
  let billingDate = nextOccurrenceOnOrAfter(subscription.schedule, asOf);
  while (true) {
    const occurrence = findOccurrence(snapshot, subscription.id, billingDate);
    if (!occurrence || !resolvedOccurrenceIds.has(occurrence.id)) return billingDate;
    billingDate = nextOccurrenceOnOrAfter(subscription.schedule, addCalendarDays(billingDate, 1));
  }
}

function compareUpcomingCharges(left: UpcomingCharge, right: UpcomingCharge): number {
  return (
    compareCalendarDates(left.billingDate, right.billingDate) ||
    left.name.localeCompare(right.name)
  );
}

export function localCalendarDate(date: Date): CalendarDate {
  return formatCalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function addCalendarDays(date: CalendarDate, count: number): CalendarDate {
  let { year, month, day } = calendarParts(date);
  for (let index = 0; index < count; index += 1) {
    day += 1;
    const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > monthDays) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return formatCalendarDate(year, month, day);
}

function localReminderDate(billingDate: CalendarDate, leadDays: number, reminderTime: string): Date {
  const { year, month, day } = calendarParts(billingDate);
  const [hour, minute] = reminderTime.split(':').map(Number);
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  result.setDate(result.getDate() - leadDays);
  return result;
}

function lifecycleRank(status: SubscriptionLifecycle['status']): number {
  return status === 'active' ? 0 : status === 'paused' ? 1 : 2;
}

function requireSubscription(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  subscriptionId: SubscriptionId,
): Subscription {
  const subscription = snapshot.subscriptions.find((item) => item.id === subscriptionId);
  if (!subscription) throw new Error('Subscription not found.');
  return subscription;
}

function unresolvedCancellationOccurrences(
  snapshot: Awaited<ReturnType<HouseholdRepository['loadSnapshot']>>,
  subscriptionId: SubscriptionId,
  confirmationDate: CalendarDate,
  asOf: CalendarDate,
): readonly BillingOccurrence[] {
  const resolvedIds = new Set([
    ...snapshot.payments.map((payment) => payment.billingOccurrenceId),
    ...snapshot.chargeExceptions.map((exception) => exception.billingOccurrenceId),
  ]);
  return snapshot.billingOccurrences
    .filter(
      (occurrence) =>
        occurrence.subscriptionId === subscriptionId &&
        compareCalendarDates(occurrence.billingDate, confirmationDate) >= 0 &&
        compareCalendarDates(occurrence.billingDate, asOf) <= 0 &&
        !resolvedIds.has(occurrence.id),
    )
    .sort((left, right) => compareCalendarDates(left.billingDate, right.billingDate));
}
