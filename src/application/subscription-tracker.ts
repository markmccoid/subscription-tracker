import type { HouseholdRepository } from '@/data/household-repository';
import { createCategory, updateCategory as renameCategory } from '@/domain/category';
import { createStandardSubscription } from '@/domain/create-subscription';
import type {
  BillingCycle,
  BillingOccurrence,
  BillingOccurrenceId,
  CategoryId,
  ChargeExceptionId,
  LifecycleEvent,
  LifecycleEventId,
  HouseholdList,
  HouseholdListId,
  PaymentId,
  PaymentMethodId,
  PricingArrangement,
  SkippedWeek,
  SkippedWeekId,
  Subscription,
  SubscriptionLifecycle,
  SubscriptionId,
} from '@/domain/model';
import { starterCategories } from '@/domain/model';
import {
  createCancellationEvent,
  createPauseEvent,
  createReactivationEvent,
  createResumeEvent,
} from '@/domain/lifecycle-event';
import { createChargeException, createPayment } from '@/domain/occurrence-resolution';
import {
  addCalendarDays,
  calendarDate,
  calendarParts,
  calendarWeekdayName,
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
  anchorDayFor,
  nextOccurrenceOnOrAfter,
  occurrencesInRange,
} from '@/domain/recurrence';
import {
  assertSkipRemovable,
  createSkippedWeek,
  isDateSkipped,
  staleFutureSkips,
  type SkipResolution,
} from '@/domain/week-skips';
import {
  createPaymentMethod,
  setPaymentMethodRetired,
  updatePaymentMethod,
  updateStandardSubscription,
} from '@/domain/subscription-profile';
import {
  cancelSubscription as markSubscriptionCanceled,
  editCancellationDetails as updateCancellationDetails,
  pauseSubscription as markSubscriptionPaused,
  reactivateSubscription as returnSubscriptionToActive,
  resumeSubscription as returnPausedSubscriptionToActive,
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
  /** Weekly only: projected Billing Dates to pre-plan as Skipped Weeks. */
  readonly initialSkippedDates?: readonly string[];
  /** Weekly only: show Skipped Weeks as ghost rows in Upcoming. Defaults on for Weekly. */
  readonly showSkippedWeeks?: boolean;
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
  readonly showSkippedWeeks: boolean;
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
  readonly cycle: BillingCycle;
  /** Ghost rows for planned Skipped Weeks. They never count toward any total. */
  readonly skipped: boolean;
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
  | {
      readonly kind: 'noCharge';
      readonly reason: string | null;
      /** Set when a planned Skipped Week generated this resolution, enabling Remove Skip. */
      readonly generatedBySkippedWeekId: SkippedWeekId | null;
    };

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

export interface PauseSubscriptionCommand {
  readonly subscriptionId: SubscriptionId;
  readonly effectiveDate: string;
  readonly pauseEndDate?: string | null;
}

export interface ResumeSubscriptionCommand {
  readonly subscriptionId: SubscriptionId;
  readonly nextBillingDate: string;
}

export interface PlanWeekCommand {
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: string;
}

export interface WeekPlannerWeek {
  readonly billingDate: CalendarDate;
  readonly amountCents: number;
  readonly skipped: boolean;
  /** False once the week has been billed or otherwise resolved. */
  readonly togglable: boolean;
}

export interface WeekPlannerProjection {
  readonly subscriptionId: SubscriptionId;
  readonly name: string;
  readonly weekday: string;
  readonly perWeekAmountCents: number;
  readonly weeks: readonly WeekPlannerWeek[];
  readonly next30DaysDeliveries: number;
  readonly next30DaysCents: number;
}

/** How many projected weeks the Week Planner offers at a time. */
const weekPlannerHorizon = 8;

export type HistoryCategoryFilter = CategoryId | 'uncategorized' | null;

export interface HistoryQuery {
  readonly from?: string | null;
  readonly to?: string | null;
  readonly subscriptionId?: SubscriptionId | null;
  readonly categoryId?: HistoryCategoryFilter;
  readonly search?: string;
}

type HistoryActivityBase = {
  readonly id: string;
  readonly subscriptionId: SubscriptionId;
  readonly subscriptionName: string;
  readonly categoryId: CategoryId | null;
  readonly categoryName: string;
  readonly activityDate: CalendarDate;
  readonly recordedAt: string;
};

export type HistoryActivityItem =
  | (HistoryActivityBase & {
      readonly kind: 'payment';
      readonly billingDate: CalendarDate;
      readonly amountCents: number;
      readonly paymentMethodName: string | null;
      readonly note: string | null;
    })
  | (HistoryActivityBase & {
      readonly kind: 'noCharge';
      readonly billingDate: CalendarDate;
      readonly expectedAmountCents: number;
      readonly reason: string | null;
      readonly generated: boolean;
    })
  | (HistoryActivityBase & {
      readonly kind: 'paused' | 'resumed' | 'canceled' | 'reactivated';
      readonly pauseEndDate?: CalendarDate | null;
      readonly nextBillingDate?: CalendarDate;
      readonly accessEndDate?: CalendarDate | null;
    });

export interface HistoryBreakdownMonth {
  readonly month: string;
  readonly paymentTotalCents: number;
  readonly paymentCount: number;
  readonly noChargeCount: number;
}

export interface HistorySubscriptionBreakdown {
  readonly subscriptionId: SubscriptionId;
  readonly name: string;
  readonly totalCents: number;
  readonly paymentCount: number;
  readonly noChargeCount: number;
  readonly months: readonly HistoryBreakdownMonth[];
}

export interface HistoryCategoryBreakdown {
  readonly categoryId: CategoryId | null;
  readonly name: string;
  readonly totalCents: number;
}

export interface HistoryProjection {
  readonly recordedSpendCents: number;
  readonly noChargeCount: number;
  readonly actionNeededCount: number;
  readonly activities: readonly HistoryActivityItem[];
  readonly subscriptionBreakdown: readonly HistorySubscriptionBreakdown[];
  readonly categoryBreakdown: readonly HistoryCategoryBreakdown[];
  readonly subscriptionOptions: readonly { readonly id: SubscriptionId; readonly name: string }[];
  readonly categoryOptions: readonly { readonly id: CategoryId | null; readonly name: string }[];
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
    const asOf = localCalendarDate(this.dependencies.now());
    await this.resumeElapsedPauses(asOf);
    // Elapsed Skipped Weeks claim their Billing Occurrence before the generic reconciliation would
    // leave it unresolved in Action Needed.
    await this.resolveElapsedSkippedWeeks(asOf);
    await this.reconcileDueOccurrences(asOf);
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
    await this.dependencies.repository.saveSubscriptionWithOccurrences(subscription, occurrences, {
      created: this.plannedSkippedWeeks(subscription, command.initialSkippedDates, asOf),
    });
    return { status: 'saved', subscriptionId: subscription.id };
  }

  async editStandardSubscription(command: EditStandardSubscriptionCommand): Promise<SaveSubscriptionResult> {
    const asOf = localCalendarDate(this.dependencies.now());
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = snapshot.subscriptions.find((item) => item.id === command.subscriptionId);
    if (!current) throw new Error('Subscription not found.');
    const elapsedOccurrences = this.missingOccurrences(snapshot, current, asOf);
    const startDate = calendarDate(command.scheduleStartDate);
    const schedule = {
      cycle: command.cycle,
      startDate,
      anchorDay: anchorDayFor(command.cycle, startDate, command.anchorDay),
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
        showSkippedWeeks:
          command.showSkippedWeeks ??
          (current.schedule.cycle === 'weekly' ? current.showSkippedWeeks : undefined),
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
    await this.dependencies.repository.saveSubscriptionWithOccurrences(
      subscription,
      elapsedOccurrences,
      { deletedIds: prunedSkipIds(snapshot.skippedWeeks, subscription, asOf) },
    );
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
      showSkippedWeeks: subscription.showSkippedWeeks,
      archived: subscription.archivedAt !== null,
      nextBillingDate: nextBillingDateFor(
        subscription,
        localCalendarDate(this.dependencies.now()),
        snapshot.skippedWeeks,
      ),
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  async deleteSubscription(subscriptionId: SubscriptionId): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    requireSubscription(snapshot, subscriptionId);
    await this.dependencies.repository.deleteSubscription(subscriptionId);
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
        ? {
            kind: 'noCharge',
            reason: exception.reason,
            generatedBySkippedWeekId: exception.generatedBySkippedWeekId,
          }
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
    const event = createCancellationEvent({
      id: entityId<'LifecycleEvent'>(this.dependencies.createId()) as LifecycleEventId,
      subscriptionId: current.id,
      effectiveDate: command.confirmationDate,
      accessEndDate: command.accessEndDate,
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
        generatedByLifecycleEventId: event.id,
        now: now.toISOString(),
      }),
    );
    await this.dependencies.repository.saveLifecycleChange(subscription, event, exceptions);
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
    const existingEvent = latestLifecycleEvent(snapshot.lifecycleEvents, current.id, 'canceled');
    const event = existingEvent
      ? {
          ...existingEvent,
          effectiveDate: calendarDate(command.confirmationDate),
          accessEndDate: command.accessEndDate ? calendarDate(command.accessEndDate) : null,
          updatedAt: utcTimestamp(now.toISOString()),
        }
      : createCancellationEvent({
          id: entityId<'LifecycleEvent'>(this.dependencies.createId()) as LifecycleEventId,
          subscriptionId: current.id,
          effectiveDate: command.confirmationDate,
          accessEndDate: command.accessEndDate,
          now: now.toISOString(),
        });
    const previousGenerated = new Map(
      snapshot.chargeExceptions
        .filter((exception) => exception.generatedByLifecycleEventId === event.id)
        .map((exception) => [exception.billingOccurrenceId, exception]),
    );
    const exceptions = unresolvedCancellationOccurrences(
      snapshot,
      current.id,
      calendarDate(command.confirmationDate),
      localCalendarDate(now),
      event.id,
    ).map((occurrence) =>
      previousGenerated.get(occurrence.id) ?? createChargeException({
        id: entityId<'ChargeException'>(this.dependencies.createId()) as ChargeExceptionId,
        billingOccurrenceId: occurrence.id,
        reason: 'Subscription canceled before charge',
        generatedByLifecycleEventId: event.id,
        now: now.toISOString(),
      }),
    );
    await this.dependencies.repository.saveLifecycleChange(subscription, event, exceptions);
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
    const event = createReactivationEvent({
      id: entityId<'LifecycleEvent'>(this.dependencies.createId()) as LifecycleEventId,
      subscriptionId: current.id,
      effectiveDate: localCalendarDate(now),
      nextBillingDate: command.nextBillingDate,
      pricing: subscription.pricing,
      now: now.toISOString(),
    });
    await this.dependencies.repository.saveLifecycleChange(subscription, event, [], {
      deletedIds: prunedSkipIds(snapshot.skippedWeeks, subscription, localCalendarDate(now)),
    });
  }

  async pauseSubscription(command: PauseSubscriptionCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requireSubscription(snapshot, command.subscriptionId);
    const now = this.dependencies.now();
    const subscription = markSubscriptionPaused(current, {
      effectiveDate: command.effectiveDate,
      pauseEndDate: command.pauseEndDate,
      asOf: localCalendarDate(now),
      now: now.toISOString(),
    });
    const event = createPauseEvent({
      id: entityId<'LifecycleEvent'>(this.dependencies.createId()) as LifecycleEventId,
      subscriptionId: current.id,
      effectiveDate: command.effectiveDate,
      pauseEndDate: command.pauseEndDate,
      now: now.toISOString(),
    });
    await this.dependencies.repository.saveLifecycleChange(subscription, event);
  }

  async resumeSubscription(command: ResumeSubscriptionCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const current = requireSubscription(snapshot, command.subscriptionId);
    const now = this.dependencies.now();
    const asOf = localCalendarDate(now);
    if (compareCalendarDates(calendarDate(command.nextBillingDate), asOf) <= 0) {
      throw new DomainValidationError('Next Billing Date must be after today.');
    }
    const subscription = returnPausedSubscriptionToActive(current, {
      effectiveDate: asOf,
      nextBillingDate: command.nextBillingDate,
      asOf,
      now: now.toISOString(),
    });
    const event = createResumeEvent({
      id: entityId<'LifecycleEvent'>(this.dependencies.createId()) as LifecycleEventId,
      subscriptionId: current.id,
      effectiveDate: asOf,
      nextBillingDate: command.nextBillingDate,
      now: now.toISOString(),
    });
    await this.dependencies.repository.saveLifecycleChange(subscription, event, [], {
      deletedIds: prunedSkipIds(snapshot.skippedWeeks, subscription, asOf),
    });
  }

  async skipWeek(command: PlanWeekCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const subscription = requireSubscription(snapshot, command.subscriptionId);
    const billingDate = calendarDate(command.billingDate);
    const skippedWeek = createSkippedWeek({
      id: entityId<'SkippedWeek'>(this.dependencies.createId()) as SkippedWeekId,
      subscription,
      billingDate: command.billingDate,
      existingSkips: snapshot.skippedWeeks,
      asOf: localCalendarDate(this.dependencies.now()),
      occurrenceMaterialized: Boolean(findOccurrence(snapshot, subscription.id, billingDate)),
      now: this.dependencies.now().toISOString(),
    });
    await this.dependencies.repository.saveSkippedWeek(skippedWeek);
  }

  async unskipWeek(command: PlanWeekCommand): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const billingDate = calendarDate(command.billingDate);
    const skippedWeek = snapshot.skippedWeeks.find(
      (skip) => skip.subscriptionId === command.subscriptionId && skip.billingDate === billingDate,
    );
    if (!skippedWeek) throw new DomainValidationError('This week is not skipped.');
    assertSkipRemovable(skippedWeek, skipResolution(snapshot, skippedWeek));
    await this.dependencies.repository.deleteSkippedWeek(skippedWeek.id);
  }

  /** Reconciles a Skipped Week whose Billing Date has already passed and was charged anyway. */
  async removeMaterializedSkip(command: { readonly skippedWeekId: SkippedWeekId }): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const skippedWeek = snapshot.skippedWeeks.find((skip) => skip.id === command.skippedWeekId);
    if (!skippedWeek) throw new DomainValidationError('Skipped Week not found.');
    assertSkipRemovable(skippedWeek, skipResolution(snapshot, skippedWeek));
    await this.dependencies.repository.deleteSkippedWeek(skippedWeek.id);
  }

  async loadWeekPlanner(
    subscriptionId: SubscriptionId,
    asOf = localCalendarDate(this.dependencies.now()),
  ): Promise<WeekPlannerProjection> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const subscription = requireSubscription(snapshot, subscriptionId);
    if (subscription.schedule.cycle !== 'weekly') {
      throw new DomainValidationError('Only a Weekly Subscription has a Week Planner.');
    }
    if (subscription.archivedAt || subscription.lifecycle.status !== 'active') {
      throw new DomainValidationError('The Week Planner is available for Active Subscriptions only.');
    }
    const resolvedOccurrenceIds = resolvedOccurrenceIdSet(snapshot);
    const weeks: WeekPlannerWeek[] = [];
    let billingDate = nextOccurrenceOnOrAfter(subscription.schedule, asOf);
    for (let index = 0; index < weekPlannerHorizon; index += 1) {
      const occurrence = findOccurrence(snapshot, subscriptionId, billingDate);
      weeks.push({
        billingDate,
        amountCents: occurrence?.expectedAmount ?? amountForOccurrence(subscription.pricing, billingDate),
        skipped: isDateSkipped(snapshot.skippedWeeks, subscriptionId, billingDate),
        togglable: !occurrence || !resolvedOccurrenceIds.has(occurrence.id),
      });
      billingDate = addCalendarDays(billingDate, 7);
    }
    const windowEnd = addCalendarDays(asOf, 29);
    const deliveries = weeks.filter(
      (week) => !week.skipped && compareCalendarDates(week.billingDate, windowEnd) <= 0,
    );
    return {
      subscriptionId,
      name: subscription.name,
      weekday: calendarWeekdayName(subscription.schedule.startDate),
      perWeekAmountCents: amountForOccurrence(subscription.pricing, weeks[0].billingDate),
      weeks,
      next30DaysDeliveries: deliveries.length,
      next30DaysCents: deliveries.reduce((total, week) => total + week.amountCents, 0),
    };
  }

  async deleteLifecycleEvent(eventId: LifecycleEventId): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const event = snapshot.lifecycleEvents.find((item) => item.id === eventId);
    if (!event) throw new DomainValidationError('Lifecycle Event not found.');
    const current = requireSubscription(snapshot, event.subscriptionId);
    const remaining = snapshot.lifecycleEvents
      .filter((item) => item.subscriptionId === current.id && item.id !== eventId)
      .sort((left, right) =>
        right.effectiveDate.localeCompare(left.effectiveDate)
        || right.createdAt.localeCompare(left.createdAt),
      );
    const latest = remaining[0];
    if (current.archivedAt && (!latest || latest.kind !== 'canceled')) {
      throw new DomainValidationError('Restore this Archived Subscription before deleting its current Cancellation event.');
    }
    let lifecycle: SubscriptionLifecycle = { status: 'active' };
    let schedule = current.schedule;
    if (latest?.kind === 'paused') {
      lifecycle = { status: 'paused', pauseEndDate: latest.pauseEndDate };
    } else if (latest?.kind === 'canceled') {
      lifecycle = {
        status: 'canceled',
        cancellationConfirmationDate: latest.effectiveDate,
        accessEndDate: latest.accessEndDate,
      };
    } else if (latest?.kind === 'resumed' || latest?.kind === 'reactivated') {
      schedule = {
        ...schedule,
        startDate: latest.nextBillingDate,
        anchorDay: calendarParts(latest.nextBillingDate).day,
      };
    }
    await this.dependencies.repository.deleteLifecycleEvent(eventId, {
      ...current,
      lifecycle,
      schedule,
      updatedAt: utcTimestamp(this.dependencies.now().toISOString()),
    });
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

  async loadHistory(
    query: HistoryQuery = {},
    asOf = localCalendarDate(this.dependencies.now()),
  ): Promise<HistoryProjection> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const from = query.from ? calendarDate(query.from) : null;
    const requestedTo = query.to ? calendarDate(query.to) : asOf;
    const to = compareCalendarDates(requestedTo, asOf) > 0 ? asOf : requestedTo;
    if (from && compareCalendarDates(from, to) > 0) {
      throw new DomainValidationError('History start date must be on or before its end date.');
    }
    const subscriptionsById = new Map(snapshot.subscriptions.map((item) => [item.id, item]));
    const occurrencesById = new Map(snapshot.billingOccurrences.map((item) => [item.id, item]));
    const paymentMethodsById = new Map(snapshot.paymentMethods.map((item) => [item.id, item]));
    const matchesSubscription = (subscription: Subscription): boolean => {
      if (query.subscriptionId && subscription.id !== query.subscriptionId) return false;
      if (query.categoryId === 'uncategorized' && subscription.categoryId !== null) return false;
      if (query.categoryId && query.categoryId !== 'uncategorized' && subscription.categoryId !== query.categoryId) {
        return false;
      }
      const search = query.search?.trim().toLocaleLowerCase();
      return !search || subscription.name.toLocaleLowerCase().includes(search);
    };
    const inRange = (date: CalendarDate): boolean =>
      (!from || compareCalendarDates(date, from) >= 0) && compareCalendarDates(date, to) <= 0;
    const base = (subscription: Subscription, id: string, activityDate: CalendarDate, recordedAt: string) => ({
      id,
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      categoryId: subscription.categoryId,
      categoryName: categoryName(snapshot, subscription.categoryId) ?? 'Uncategorized',
      activityDate,
      recordedAt,
    });

    const paymentActivities = snapshot.payments.flatMap((payment): HistoryActivityItem[] => {
      const occurrence = occurrencesById.get(payment.billingOccurrenceId);
      const subscription = occurrence ? subscriptionsById.get(occurrence.subscriptionId) : null;
      if (!occurrence || !subscription || !matchesSubscription(subscription) || !inRange(payment.paymentDate)) return [];
      return [{
        ...base(subscription, payment.id, payment.paymentDate, payment.createdAt),
        kind: 'payment',
        billingDate: occurrence.billingDate,
        amountCents: payment.amount,
        paymentMethodName: payment.paymentMethodId
          ? paymentMethodsById.get(payment.paymentMethodId)?.name ?? null
          : null,
        note: payment.note,
      }];
    });
    const exceptionActivities = snapshot.chargeExceptions.flatMap((exception): HistoryActivityItem[] => {
      const occurrence = occurrencesById.get(exception.billingOccurrenceId);
      const subscription = occurrence ? subscriptionsById.get(occurrence.subscriptionId) : null;
      if (!occurrence || !subscription || !matchesSubscription(subscription) || !inRange(occurrence.billingDate)) return [];
      return [{
        ...base(subscription, exception.id, occurrence.billingDate, exception.createdAt),
        kind: 'noCharge',
        billingDate: occurrence.billingDate,
        expectedAmountCents: occurrence.expectedAmount,
        reason: exception.reason,
        generated: exception.generatedByLifecycleEventId !== null,
      }];
    });
    const lifecycleActivities = snapshot.lifecycleEvents.flatMap((event): HistoryActivityItem[] => {
      const subscription = subscriptionsById.get(event.subscriptionId);
      if (!subscription || !matchesSubscription(subscription) || !inRange(event.effectiveDate)) return [];
      const common = base(subscription, event.id, event.effectiveDate, event.createdAt);
      switch (event.kind) {
        case 'paused':
          return [{ ...common, kind: 'paused', pauseEndDate: event.pauseEndDate }];
        case 'resumed':
          return [{ ...common, kind: 'resumed', nextBillingDate: event.nextBillingDate }];
        case 'canceled':
          return [{ ...common, kind: 'canceled', accessEndDate: event.accessEndDate }];
        case 'reactivated':
          return [{ ...common, kind: 'reactivated', nextBillingDate: event.nextBillingDate }];
      }
    });
    const activities = [...paymentActivities, ...exceptionActivities, ...lifecycleActivities]
      .sort(compareHistoryActivity);

    const includedPayments = paymentActivities.filter(
      (item): item is Extract<HistoryActivityItem, { kind: 'payment' }> => item.kind === 'payment',
    );
    const includedExceptions = exceptionActivities.filter(
      (item): item is Extract<HistoryActivityItem, { kind: 'noCharge' }> => item.kind === 'noCharge',
    );
    const subscriptionBreakdown = snapshot.subscriptions
      .filter(matchesSubscription)
      .map((subscription): HistorySubscriptionBreakdown => {
        const payments = includedPayments.filter((item) => item.subscriptionId === subscription.id);
        const exceptions = includedExceptions.filter((item) => item.subscriptionId === subscription.id);
        const monthKeys = new Set([
          ...payments.map((item) => item.activityDate.slice(0, 7)),
          ...exceptions.map((item) => item.activityDate.slice(0, 7)),
        ]);
        return {
          subscriptionId: subscription.id,
          name: subscription.name,
          totalCents: payments.reduce((total, item) => total + item.amountCents, 0),
          paymentCount: payments.length,
          noChargeCount: exceptions.length,
          months: [...monthKeys].sort().reverse().map((month) => {
            const monthPayments = payments.filter((item) => item.activityDate.startsWith(month));
            return {
              month,
              paymentTotalCents: monthPayments.reduce((total, item) => total + item.amountCents, 0),
              paymentCount: monthPayments.length,
              noChargeCount: exceptions.filter((item) => item.activityDate.startsWith(month)).length,
            };
          }),
        };
      })
      .filter((item) => item.paymentCount > 0 || item.noChargeCount > 0)
      .sort((left, right) => right.totalCents - left.totalCents || left.name.localeCompare(right.name));
    const categoryTotals = new Map<string, HistoryCategoryBreakdown>();
    for (const payment of includedPayments) {
      const key = payment.categoryId ?? 'uncategorized';
      const current = categoryTotals.get(key);
      categoryTotals.set(key, {
        categoryId: payment.categoryId,
        name: payment.categoryName,
        totalCents: (current?.totalCents ?? 0) + payment.amountCents,
      });
    }
    const resolvedOccurrenceIds = new Set([
      ...snapshot.payments.map((item) => item.billingOccurrenceId),
      ...snapshot.chargeExceptions.map((item) => item.billingOccurrenceId),
    ]);
    const actionNeededCount = snapshot.billingOccurrences.filter((occurrence) => {
      const subscription = subscriptionsById.get(occurrence.subscriptionId);
      return subscription && matchesSubscription(subscription)
        && compareCalendarDates(occurrence.billingDate, asOf) < 0
        && !resolvedOccurrenceIds.has(occurrence.id);
    }).length;
    return {
      recordedSpendCents: includedPayments.reduce((total, item) => total + item.amountCents, 0),
      noChargeCount: includedExceptions.length,
      actionNeededCount,
      activities,
      subscriptionBreakdown,
      categoryBreakdown: [...categoryTotals.values()]
        .sort((left, right) => right.totalCents - left.totalCents || left.name.localeCompare(right.name)),
      subscriptionOptions: snapshot.subscriptions
        .map(({ id, name }) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      categoryOptions: [
        ...snapshot.categories.map(({ id, name }) => ({ id: id as CategoryId | null, name })),
        { id: null, name: 'Uncategorized' },
      ].sort((left, right) => left.name.localeCompare(right.name)),
    };
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
    const resolvedOccurrenceIds = resolvedOccurrenceIdSet(snapshot);
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
          cycle: subscription.schedule.cycle,
          skipped: false,
        };
      });
    const next7DaysEnd = addCalendarDays(asOf, 6);
    const rollingWindowEnd = addCalendarDays(asOf, 29);
    const windowDates = new Map(
      activeSubscriptions.map((subscription) => [
        subscription.id,
        occurrencesInRange(subscription.schedule, asOf, rollingWindowEnd),
      ]),
    );
    const chargesInWindow = activeSubscriptions.flatMap((subscription) =>
      windowDates
        .get(subscription.id)!
        .filter((billingDate) => !isDateSkipped(snapshot.skippedWeeks, subscription.id, billingDate))
        .map((billingDate) => upcomingChargeFor(snapshot, subscription, billingDate))
        .filter((charge) => !chargeIsResolved(charge, resolvedOccurrenceIds)),
    );
    // Ghost rows sit in the same date groups but never contribute to a total (D6).
    const ghostCharges = activeSubscriptions.flatMap((subscription) =>
      subscription.showSkippedWeeks
        ? windowDates
            .get(subscription.id)!
            .filter((billingDate) =>
              isDateSkipped(snapshot.skippedWeeks, subscription.id, billingDate),
            )
            .map((billingDate) => upcomingChargeFor(snapshot, subscription, billingDate, true))
        : [],
    );
    const datedCharges = [...chargesInWindow, ...ghostCharges];
    const next7Days = datedCharges.filter(
      (charge) => compareCalendarDates(charge.billingDate, next7DaysEnd) <= 0,
    );
    const laterThisMonth = datedCharges.filter(
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
      return total + normalizedMonthlyAmount(subscription.schedule.cycle, amount);
    }, 0);
    return { monthlyCommitmentCents, dueNext30DaysCents, upcomingChargeGroups };
  }

  async loadSubscriptions(
    asOf = localCalendarDate(this.dependencies.now()),
  ): Promise<readonly SubscriptionListItem[]> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    return snapshot.subscriptions
      .map((subscription): SubscriptionListItem => {
        const nextBillingDate = nextBillingDateFor(subscription, asOf, snapshot.skippedWeeks);
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
      let billingDate = nextUnskippedOccurrence(subscription, asOf, snapshot.skippedWeeks);
      let triggerDate = localReminderDate(billingDate, leadDays, snapshot.household.reminderTime);
      if (triggerDate <= now) {
        billingDate = nextUnskippedOccurrence(
          subscription,
          addCalendarDays(billingDate, 1),
          snapshot.skippedWeeks,
        );
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

  private async resumeElapsedPauses(asOf: CalendarDate): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    for (const current of snapshot.subscriptions) {
      if (
        current.lifecycle.status !== 'paused' ||
        !current.lifecycle.pauseEndDate ||
        compareCalendarDates(current.lifecycle.pauseEndDate, asOf) > 0
      ) {
        continue;
      }
      const now = this.dependencies.now();
      const effectiveDate = current.lifecycle.pauseEndDate;
      const subscription = returnPausedSubscriptionToActive(current, {
        effectiveDate,
        nextBillingDate: effectiveDate,
        asOf,
        now: now.toISOString(),
      });
      const event = createResumeEvent({
        id: entityId<'LifecycleEvent'>(this.dependencies.createId()) as LifecycleEventId,
        subscriptionId: current.id,
        effectiveDate,
        nextBillingDate: effectiveDate,
        now: now.toISOString(),
      });
      await this.dependencies.repository.saveLifecycleChange(subscription, event);
    }
  }

  /**
   * Materializes each elapsed Skipped Week as a Billing Occurrence resolved by its own Generated
   * Charge Exception, so a planned skip never surfaces as Action Needed (ADR-0006).
   */
  private async resolveElapsedSkippedWeeks(asOf: CalendarDate): Promise<void> {
    const snapshot = await this.dependencies.repository.loadSnapshot();
    const resolvedOccurrenceIds = resolvedOccurrenceIdSet(snapshot);
    for (const skippedWeek of snapshot.skippedWeeks) {
      if (compareCalendarDates(skippedWeek.billingDate, asOf) >= 0) continue;
      const subscription = snapshot.subscriptions.find(
        (item) => item.id === skippedWeek.subscriptionId,
      );
      // Paused, canceled, and archived Subscriptions project nothing, so their skips stay inert.
      if (!subscription || subscription.archivedAt || subscription.lifecycle.status !== 'active') {
        continue;
      }
      if (!isProjectedOccurrence(subscription, skippedWeek.billingDate)) continue;
      const existing = findOccurrence(snapshot, subscription.id, skippedWeek.billingDate);
      if (existing && resolvedOccurrenceIds.has(existing.id)) continue;
      const now = this.dependencies.now().toISOString();
      const occurrence: BillingOccurrence = existing ?? {
        id: entityId<'BillingOccurrence'>(this.dependencies.createId()) as BillingOccurrenceId,
        subscriptionId: subscription.id,
        billingDate: skippedWeek.billingDate,
        expectedAmount: amountForOccurrence(subscription.pricing, skippedWeek.billingDate),
        createdAt: utcTimestamp(now),
      };
      const exception = createChargeException({
        id: entityId<'ChargeException'>(this.dependencies.createId()) as ChargeExceptionId,
        billingOccurrenceId: occurrence.id,
        reason: 'Skipped week',
        generatedBySkippedWeekId: skippedWeek.id,
        now,
      });
      await this.dependencies.repository.saveOccurrenceResolution(occurrence, exception);
    }
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

  /** Validates the weekly creation form's pre-planned Skipped Weeks against the saved schedule. */
  private plannedSkippedWeeks(
    subscription: Subscription,
    billingDates: readonly string[] | undefined,
    asOf: CalendarDate,
  ): readonly SkippedWeek[] {
    if (!billingDates?.length || subscription.schedule.cycle !== 'weekly') return [];
    const now = this.dependencies.now().toISOString();
    return billingDates.reduce<SkippedWeek[]>((created, billingDate) => {
      created.push(
        createSkippedWeek({
          id: entityId<'SkippedWeek'>(this.dependencies.createId()) as SkippedWeekId,
          subscription,
          billingDate,
          existingSkips: created,
          asOf,
          now,
        }),
      );
      return created;
    }, []);
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

function nextBillingDateFor(
  subscription: Subscription,
  asOf: CalendarDate,
  skippedWeeks: readonly SkippedWeek[] = [],
): CalendarDate | null {
  if (
    subscription.lifecycle.status === 'active'
  ) {
    return nextUnskippedOccurrence(subscription, asOf, skippedWeeks);
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
  skipped = false,
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
    cycle: subscription.schedule.cycle,
    skipped,
  };
}

function resolvedOccurrenceIdSet(snapshot: Snapshot): ReadonlySet<BillingOccurrenceId> {
  return new Set([
    ...snapshot.payments.map((payment) => payment.billingOccurrenceId),
    ...snapshot.chargeExceptions.map((exception) => exception.billingOccurrenceId),
  ]);
}

function skipResolution(snapshot: Snapshot, skippedWeek: SkippedWeek): SkipResolution {
  const occurrence = findOccurrence(snapshot, skippedWeek.subscriptionId, skippedWeek.billingDate);
  if (!occurrence) return { kind: 'unresolved' };
  if (snapshot.payments.some((payment) => payment.billingOccurrenceId === occurrence.id)) {
    return { kind: 'payment' };
  }
  const exception = snapshot.chargeExceptions.find(
    (item) => item.billingOccurrenceId === occurrence.id,
  );
  return exception
    ? { kind: 'exception', generatedBySkippedWeekId: exception.generatedBySkippedWeekId }
    : { kind: 'unresolved' };
}

/** Future Skipped Weeks that a new schedule no longer projects, including a move off Weekly. */
function prunedSkipIds(
  skippedWeeks: readonly SkippedWeek[],
  subscription: Subscription,
  asOf: CalendarDate,
): readonly SkippedWeekId[] {
  return staleFutureSkips(skippedWeeks, subscription, asOf).map((skip) => skip.id);
}

/** A weekly amount contributes 52/12 of its value; planned Skipped Weeks do not reduce it (D2). */
function normalizedMonthlyAmount(cycle: BillingCycle, amountCents: number): number {
  if (cycle === 'yearly') return Math.round(amountCents / 12);
  if (cycle === 'weekly') return Math.round((amountCents * 52) / 12);
  return amountCents;
}

function nextUnskippedOccurrence(
  subscription: Subscription,
  from: CalendarDate,
  skippedWeeks: readonly SkippedWeek[],
): CalendarDate {
  let billingDate = nextOccurrenceOnOrAfter(subscription.schedule, from);
  while (isDateSkipped(skippedWeeks, subscription.id, billingDate)) {
    billingDate = nextOccurrenceOnOrAfter(subscription.schedule, addCalendarDays(billingDate, 1));
  }
  return billingDate;
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
  let billingDate = nextUnskippedOccurrence(subscription, asOf, snapshot.skippedWeeks);
  while (true) {
    const occurrence = findOccurrence(snapshot, subscription.id, billingDate);
    if (!occurrence || !resolvedOccurrenceIds.has(occurrence.id)) return billingDate;
    billingDate = nextUnskippedOccurrence(
      subscription,
      addCalendarDays(billingDate, 1),
      snapshot.skippedWeeks,
    );
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
  replacingEventId?: LifecycleEventId,
): readonly BillingOccurrence[] {
  const resolvedIds = new Set([
    ...snapshot.payments.map((payment) => payment.billingOccurrenceId),
    ...snapshot.chargeExceptions
      .filter((exception) => exception.generatedByLifecycleEventId !== replacingEventId)
      .map((exception) => exception.billingOccurrenceId),
  ]);
  return snapshot.billingOccurrences
    .filter(
      (occurrence) =>
        occurrence.subscriptionId === subscriptionId &&
        compareCalendarDates(occurrence.billingDate, confirmationDate) >= 0 &&
        compareCalendarDates(occurrence.billingDate, asOf) <= 0 &&
        !resolvedIds.has(occurrence.id) &&
        // A planned Skipped Week resolves its own date, so cancellation must not claim it too.
        !isDateSkipped(snapshot.skippedWeeks, subscriptionId, occurrence.billingDate),
    )
    .sort((left, right) => compareCalendarDates(left.billingDate, right.billingDate));
}

function latestLifecycleEvent(
  events: readonly LifecycleEvent[],
  subscriptionId: SubscriptionId,
  kind: LifecycleEvent['kind'],
): LifecycleEvent | undefined {
  return events
    .filter((event) => event.subscriptionId === subscriptionId && event.kind === kind)
    .sort((left, right) =>
      right.effectiveDate.localeCompare(left.effectiveDate)
      || right.createdAt.localeCompare(left.createdAt),
    )[0];
}

function compareHistoryActivity(left: HistoryActivityItem, right: HistoryActivityItem): number {
  return right.activityDate.localeCompare(left.activityDate)
    || right.recordedAt.localeCompare(left.recordedAt)
    || right.id.localeCompare(left.id);
}
