# Subscription Tracking

This context describes recurring financial commitments, their expected charges, and the payments a user records against them.

## Language

**Household List**:
The complete set of Subscriptions, related history, Payment Methods, and household-wide settings managed for one household from a single authoritative device in version one.
_Avoid_: Account, shared workspace

**Backup**:
A versioned, restorable representation of the complete Household List. Restoring a Backup replaces the current Household List after explicit confirmation.
_Avoid_: Report, CSV export, synchronization

**Household Currency**:
The currency used by every monetary amount in a Household List. Version one supports USD only.
_Avoid_: Display currency, converted currency

**Monthly Commitment**:
The normalized monthly cost of all Active Subscriptions, including post-trial recurring amounts. A yearly amount contributes one twelfth of its value; Paused and Canceled Subscriptions contribute nothing.
_Avoid_: Monthly burn, amount due this month

**Due in the Next 30 Days**:
The sum of Billing Occurrences expected during the next rolling 30 days, without normalizing their billing cycles.
_Avoid_: Monthly commitment, calendar-month spend

**Recorded Spend**:
The sum of user-confirmed Payments in a selected period, using each Payment's actual amount and Payment Date. Subscription edits and projected Billing Occurrences do not rewrite Recorded Spend.
_Avoid_: Expected spend, Monthly Commitment

**Subscription**:
A recurring financial commitment tracked by the user, including the terms used to predict future charges.
_Avoid_: Bill, payment, recurring payment

**Active Subscription**:
A Subscription expected to continue producing Billing Occurrences. It is the default state of a newly saved Subscription.
_Avoid_: Enabled subscription, current subscription

**Minimum Subscription**:
A valid Subscription containing a nonblank name, a positive recurring amount, a Monthly or Yearly Billing Cycle, and a user-selected Next Billing Date. Trial Subscriptions use their Trial Conversion Date as the Next Billing Date.
_Avoid_: Draft subscription, guessed schedule

**Pricing Arrangement**:
The pricing terms of a Subscription. Version one assigns exactly one of Standard, Trial-to-Standard, or Promotion-to-Standard pricing to each Subscription.
_Avoid_: Billing status, stacked pricing phases

**Possible Duplicate**:
A Subscription being added or edited that matches another non-archived Subscription by case-insensitive trimmed name, amount, and Billing Cycle, with a Next Billing Date no more than three calendar days apart. It triggers a warning but remains a distinct commitment and may still be saved.
_Avoid_: Same subscription, merged subscription

**Archived Subscription**:
A Canceled Subscription hidden from normal lists while retaining its Payments, Charge Exceptions, notes, and Recorded Spend history. Cancellation does not archive it automatically.
_Avoid_: Deleted subscription, canceled subscription

**Deleted Subscription**:
An erroneous Subscription permanently removed with all associated history after explicit confirmation.
_Avoid_: Archived subscription, canceled subscription

**Trial Subscription**:
A Subscription that costs nothing before its Trial Conversion Date and then begins charging its stated recurring amount. Its post-trial amount contributes to Monthly Commitment.
_Avoid_: Paused subscription, promotional rate

**Trial Conversion Date**:
The first Billing Date of a Trial Subscription, when its stated recurring charge is expected and its paid billing schedule begins.
_Avoid_: Trial reminder date, signup date

**Promotional Subscription**:
A Subscription charged a Promotional Amount until its Promotion End Date, beginning with which its Standard Amount applies.
_Avoid_: Trial subscription, discounted billing occurrence

**Promotional Amount**:
The recurring amount charged before a Promotional Subscription's Promotion End Date.
_Avoid_: Standard amount, trial amount

**Standard Amount**:
The recurring amount charged on and after a Promotional Subscription's Promotion End Date.
_Avoid_: Promotional amount

**Promotion End Date**:
The first Billing Date on which a Promotional Subscription is charged its Standard Amount.
_Avoid_: Last discounted date, cancellation date

**Billing Cycle**:
The cadence at which a Subscription produces Billing Occurrences. Version one supports Monthly and Yearly cycles only.
_Avoid_: Notification frequency, payment history

**Billing Schedule Start Date**:
The first Billing Date from which a Subscription's current recurring schedule is projected. Establishing or resetting a schedule requires the user to select this date.
_Avoid_: Next Billing Date, signup date

**Next Billing Date**:
The nearest future Billing Date projected from a Subscription's current schedule. It is user-selected when establishing the schedule and subsequently calculated rather than advanced as stored state.
_Avoid_: Billing Schedule Start Date, reminder date

**Billing Occurrence**:
A Subscription's expected charge on a particular date. Future Billing Occurrences are projected from current terms; once a Billing Date arrives, the occurrence is retained so later term changes cannot erase or rewrite it.
_Avoid_: Bill, invoice, payment

**Overdue Billing Occurrence**:
A past Billing Occurrence for which the user has recorded neither a Payment nor a reason that no charge occurred.
_Avoid_: Late payment, failed payment

**Payment**:
A user-confirmed record that money was actually charged for a Billing Occurrence, optionally identifying the Payment Method actually used. A Billing Occurrence can have at most one Payment, and cannot also have a Charge Exception.
_Avoid_: Billing Occurrence, expected charge

**Payment Date**:
The calendar date on which a Payment actually occurred, which may differ from its Billing Occurrence's Billing Date.
_Avoid_: Billing date, confirmation date

**Charge Exception**:
A user-recorded resolution indicating that an expected Billing Occurrence did not result in a charge. It may include a reason, does not alter future scheduling, and cannot coexist with a Payment for the same occurrence.
_Avoid_: Deleted occurrence, payment, canceled subscription

**Category**:
An optional, household-managed, case-insensitively unique classification assigned to a Subscription for spending analysis. A new Household List starts with Entertainment, Finance, Health, News, Other, Software, and Utilities; an unassigned Subscription appears as Uncategorized.
_Avoid_: Tag, multiple categories

**Uncategorized**:
The display state of a Subscription with no assigned Category. It is not itself a Category and cannot be renamed or deleted.
_Avoid_: Default category, category

**Payment Method**:
A reusable, case-insensitively unique user-defined name and optional note identifying how one or more Subscriptions are paid. It contains no payment credentials or financial identifiers.
_Avoid_: Card, bank account, payment credentials

**Default Payment Method**:
The optional Payment Method assigned to a Subscription and suggested when recording a Payment. Changing it does not alter the Payment Method recorded on earlier Payments.
_Avoid_: Payment credential, required payment method

**Retired Payment Method**:
A Payment Method no longer offered for new assignments but retained for existing Subscription and Payment history. An unreferenced Payment Method may instead be permanently deleted after confirmation.
_Avoid_: Deleted payment method, expired card

**Cancellation URL**:
An HTTPS website address saved for a Subscription's cancellation process and opened only in the system's external browser.
_Avoid_: In-app browser link, app deep link, stored login

**Notifications Off**:
The state in which iOS has not authorized the app to deliver alerts. Subscription tracking remains available, but the app must not represent calculated reminders as scheduled.
_Avoid_: No upcoming charges, reminders scheduled

**Billing Reminder**:
The single local alert associated with a Billing Occurrence. It uses the Subscription's lead-time override when present and otherwise uses the Default Lead Time.
_Avoid_: Billing occurrence, push notification

**Default Lead Time**:
The number of calendar days before a Billing Date when its Billing Reminder is delivered, initially five days. A value of zero means the Billing Date itself.
_Avoid_: Reminder time, billing cycle

**Reminder Coverage**:
The set of next eligible Billing Reminders successfully registered with iOS. Version one guarantees coverage for each Subscription's next Billing Occurrence and reconciles coverage whenever the app opens or relevant data changes.
_Avoid_: Calculated reminder, indefinite reminder guarantee

**Paused Subscription**:
A Subscription whose provider has temporarily suspended billing. It produces no Billing Occurrences and is excluded from Monthly Commitment while paused.
_Avoid_: Muted subscription, snoozed subscription

**Pause End Date**:
The optional date on which a Paused Subscription automatically resumes billing. It becomes the next Billing Date and establishes the resumed Billing Anchor Day; manually resuming an indefinite pause requires the user to select a new Next Billing Date.
_Avoid_: Reminder date, access end date

**Muted Notifications**:
A notification preference that suppresses alerts without changing a Subscription's billing status, Billing Occurrences, or contribution to monthly burn.
_Avoid_: Paused subscription

**Canceled Subscription**:
A Subscription the user has explicitly marked as provider-confirmed, preventing future renewals. Cancellation is a direct transition with no intermediate cancellation state. It produces no future Billing Occurrences and is excluded from Monthly Commitment, even when service access continues temporarily.
_Avoid_: Cancellation pending, expired subscription

**Reactivated Subscription**:
A previously Canceled Subscription returned to Active with a user-selected Next Billing Date and current Pricing Arrangement. It keeps its identity and history while beginning a new billing schedule.
_Avoid_: New subscription, resumed subscription

**Cancellation Confirmation Date**:
The user-recorded calendar date on which the provider confirmed a Subscription's cancellation. It may predate the day the user enters it in the app.
_Avoid_: Cancellation Initiated Date, Access End Date

**Access End Date**:
The optional final date on which a user can access a Canceled Subscription's service.
_Avoid_: Cancellation date, final billing date

**Billing Anchor Day**:
The explicitly stored original calendar day used to derive a Subscription's recurring Billing Occurrences. It defaults to the selected Billing Schedule Start Date's day but may be adjusted; when absent from a month or year, the occurrence falls on the final day of that period without changing the anchor.
_Avoid_: Last billing date

**Billing Date**:
The timezone-independent calendar date on which a Billing Occurrence is expected.
_Avoid_: Billing timestamp, notification time

**Reminder Time**:
The local wall-clock time at which the user wants an alert delivered before a Billing Date. It follows the user's current timezone when pending reminders are rescheduled.
_Avoid_: Billing date
