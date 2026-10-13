# Subscription History

Status: confirmed

## Goal

Deliver History as the Household List's unified Subscription Activity ledger and Recorded Spend analysis surface. The feature must preserve lifecycle transitions, distinguish actual Payments from expected or waived charges, and keep route files thin.

## Activity model

- Subscription Activity combines Payments, Charge Exceptions, and Lifecycle Events in one newest-first timeline.
- Activity Date is Payment Date for Payments, Billing Date for Charge Exceptions, and the effective transition date for Lifecycle Events. Recorded timestamps break same-date ties.
- Lifecycle Events retain pauses, resumptions, cancellations, and reactivations with the dates and terms relevant to the transition.
- Future Billing Occurrences and future planned resume dates are metadata or Upcoming content, not completed activity.
- Unresolved overdue Billing Occurrences stay out of History and appear in an Action Needed banner.
- Permanent Subscription deletion removes related activity. Archival and later lifecycle changes do not.

## Spending analysis

- Recorded Spend is the sum of actual Payment amounts by Payment Date.
- History opens on This Year and offers This Month, This Year, All Time, and a custom inclusive calendar-date range.
- The summary shows the period total and ranked breakdowns by current Category or current Subscription.
- Subscription breakdown rows may expand into calendar-month Payment totals with separate Payment and Charge Exception counts.
- Current Subscription name and Category settings intentionally regroup older Payments after edits.
- Charge Exceptions show their expected amount as Not charged and are excluded from Recorded Spend. The screen may show a no-charge count but not a money-saved total.

## Filtering and navigation

- Date, Subscription, Category, and Subscription-name search constrain both analytics and timeline.
- Activity-type filtering constrains only the timeline so the spending summary remains useful.
- Selecting a breakdown applies the corresponding filter with a visible one-tap reset.
- Payment and Charge Exception rows open Billing Occurrence detail.
- Lifecycle rows open Subscription detail with the selected event highlighted and expose correction or deletion when valid.
- Archived and Canceled Subscription activity is included by default.

## Lifecycle behavior

- Pause records an effective date and optional planned Pause End Date. Paused Subscriptions produce no Billing Occurrences.
- An indefinite Pause resumes manually with a newly selected Next Billing Date. A dated Pause automatically resumes on its Pause End Date when the tracker next initializes.
- Cancellation-created Charge Exceptions link to the Cancellation Lifecycle Event that generated them.
- Correcting or deleting a Lifecycle Event reconciles only its linked Generated Charge Exceptions and never changes user-recorded Charge Exceptions.
- Corrections and deletions require confirmation and update the Subscription's current lifecycle state atomically when the affected event is current.
- Migration creates reconstructable events for current Canceled and Paused states from available stored dates; it does not invent earlier transitions.

## Screen structure

1. Recorded Spend summary for the selected period.
2. Category/Subscription ranked breakdown selector and expandable rows.
3. Date, entity, and activity filters.
4. Action Needed banner when unresolved elapsed occurrences exist.
5. Month-grouped unified activity timeline.

## Acceptance

The vertical slice includes the SQLite migration, in-memory and SQLite repository support, application commands and projection, pause/resume controls, the feature screen and thin route, lifecycle navigation/correction behavior, and focused domain, application, data, and presentation tests. TypeScript, lint, and the complete automated test suite must pass.
