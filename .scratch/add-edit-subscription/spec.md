# Add and Edit Subscription

## Goal

Deliver a complete version-one vertical slice for adding, viewing, and editing a Standard Subscription while preserving historical Billing Occurrences and keeping lifecycle workflows separate.

## Scope

- Add an Active Standard Subscription from a native form sheet.
- Show a read-only Subscription Detail screen with an Edit toolbar action.
- Edit supported Subscription profile fields in a native form sheet.
- Select an optional Default Payment Method or create one inline.
- Warn about Possible Duplicates without preventing Save Anyway.
- Reconcile Billing Occurrences immediately after a successful add or edit.
- Persist Subscription and Payment Method changes through the Household Repository and SQLite.

Trial and Promotional pricing, Payments and payment history, Payment Method management or retirement, lifecycle actions, archival, deletion, and notification scheduling are follow-on work.

## Form

Add and Edit share one form organized into Subscription, Pricing, Billing Schedule, Payment, Reminders, and Additional Details. Additional Details starts collapsed on Add and expanded on Edit when it contains values.

The fields are name, Category, Standard Amount, Billing Cycle, First or Next Billing Date, monthly Billing Day, Default Payment Method, reminder lead-time override, Muted Notifications, note, and Cancellation URL. Add defaults to Monthly, one clamped calendar month ahead, Uncategorized, no Default Payment Method, the Household Default reminder, notifications unmuted, and empty optional details.

Cancel and Save live in the sheet toolbar. Save is enabled only for a valid changed form. Attempting to dismiss a dirty form requires discard confirmation. Validation appears after a field is touched and loses focus and is repeated across the form when Save is attempted.

## Validation

- Name is trimmed, nonblank, and at most 200 characters.
- USD amounts accept common dollar formatting and persist as positive integer cents.
- Add may select today or a future First Billing Date; Edit must select a future Next Billing Date when changing the schedule.
- Monthly Billing Day is 1 through 31 and clamps to the final day of shorter months. Yearly Billing Day is derived from the selected date.
- Subscription notes are trimmed and at most 2,000 characters.
- Cancellation URL is absent or an HTTPS URL of at most 2,048 characters.
- Reminder overrides are absent or 0 through 365 calendar days.
- Payment Method names are trimmed, case-insensitively unique, and at most 120 characters; notes are at most 500 characters.

## Editing rules

- Active and Cancellation Pending Subscriptions allow the complete profile to be edited.
- Paused Subscriptions allow profile and pricing edits but keep Billing Schedule read-only until Resume establishes a new schedule.
- Canceled Subscriptions allow descriptive fields only; Pricing and Billing Schedule remain read-only until Reactivation.
- Archived Subscriptions remain read-only until restored.
- Changes never rewrite a Billing Occurrence whose Billing Date has arrived. New terms apply only to future projected occurrences.
- Changing Billing Cycle requires a newly confirmed Next Billing Date. Changing the date resets Billing Day before the user may adjust it.
- The form summarizes changes to the next expected charge before Save.

## Default Payment Method

The picker offers None, every non-retired Payment Method, and Add Payment Method. A currently assigned Retired Payment Method remains visible and may be retained, cleared, or replaced, but cannot be newly assigned. A separately confirmed inline-created Payment Method remains in the Household List even if the Subscription form is later discarded.

## Possible Duplicates

Add and Edit warn when another non-archived Subscription has the same case-insensitive trimmed name, amount, and Billing Cycle and a Next Billing Date within three calendar days. Edit excludes itself. The warning identifies the candidate and offers Review Existing, Save Anyway, and Cancel while preserving the unfinished form.

## Detail

Subscription Detail prioritizes name, lifecycle, amount and Billing Cycle, next expected charge, Category, Default Payment Method, Billing Schedule, reminders, note, Cancellation URL, and creation/update timestamps. A Canceled Subscription shows cancellation and access-end dates instead of a next charge. Unimplemented follow-up features are omitted.

## Persistence and acceptance

Subscription edits, occurrence reconciliation, and reminder-reconciliation state are atomic. A failed Save leaves the sheet open with entered values intact. Success dismisses the sheet and refreshes the detail or list without an extra success message.

Automated coverage must exercise domain validation, add/edit application behavior, Possible Duplicate detection, Payment Method uniqueness, immutable elapsed occurrences, immediate occurrence reconciliation, and SQLite persistence behavior.
