# Initial production design

## Scope

Version one is an iPhone-only, single-Household-List Subscription tracker. It supports USD amounts, Monthly and Yearly Billing Cycles, Standard/Trial/Promotion Pricing Arrangements, local reminders, recorded Payments, Charge Exceptions, Payment Methods, and full JSON Backup replacement. Convex, authentication, multi-device synchronization, custom recurrence, currency conversion, payment credentials, refunds, and split Payments are outside this version.

The UI targets iOS 26 and prefers native SwiftUI controls from Expo UI 57. The minimum iOS version remains Expo's generated deployment target so the app does not needlessly exclude older supported devices; newer presentation is adopted through the system components.

## Module seams

```text
Expo Router screens and SwiftUI views
                |
        SubscriptionTracker
     (commands + view projections)
                |
       HouseholdRepository
        /                \
SQLite adapter       In-memory adapter
(version one)          (tests)
        |
SQLite records and migrations
```

The domain module contains calendar, recurrence, pricing, lifecycle, and validation behavior and imports no React Native, Expo, SQLite, or Convex code. UI code sees domain values and view projections, never database rows. `HouseholdRepository` is the replacement seam: a future Convex adapter can satisfy the same interface while SQLite remains a local adapter.

## Authoritative entities

- **Household List**: UUID, USD currency, Default Lead Time, Reminder Time, metadata timestamps.
- **Subscription**: UUID, name, optional Category/note/Cancellation URL/Default Payment Method, lifecycle, Pricing Arrangement, Billing Schedule, reminder override, metadata timestamps, optional archive timestamp.
- **Billing Occurrence**: UUID, Subscription UUID, Billing Date, snapshotted expected cents, metadata timestamp. Future occurrences are projected; elapsed occurrences are retained.
- **Payment**: UUID, Billing Occurrence UUID, actual cents, Payment Date, optional Payment Method/note, metadata timestamps.
- **Charge Exception**: UUID, Billing Occurrence UUID, optional reason, metadata timestamps. Mutually exclusive with Payment.
- **Payment Method**: UUID, name, optional note, optional retirement timestamp, metadata timestamps.

Every entity uses an app-generated UUIDv4. Domain calendar dates are validated `YYYY-MM-DD` strings. Metadata uses UTC ISO timestamps. Money is positive integer cents and inherits USD from the Household List.

## Subscription shape

A Subscription has one Billing Schedule:

- `cycle`: `monthly | yearly`
- `startDate`: first Billing Date of the current schedule
- `anchorDay`: explicit stable original day, clamped only for periods where it does not exist

It has exactly one Pricing Arrangement:

- Standard: Standard Amount
- Trial: Trial Conversion Date plus Standard Amount; the conversion date equals the schedule start
- Promotion: Promotional Amount until Promotion End Date, then Standard Amount; the end date is a Billing Date

Lifecycle is independent of pricing: Active, Paused, or Canceled. Archive visibility is separate and valid only for Canceled Subscriptions.

## Persistence

Expo SQLite is authoritative. Migrations use `PRAGMA user_version`; foreign keys are enabled and WAL is used. Multi-record writes and restore use exclusive transactions. Persistence records are deliberately flat and are mapped to validated discriminated domain unions at the adapter seam.

Domain writes commit even if iOS reminder registration fails. A separate device-state record marks reminder reconciliation as required. OS notification identifiers, coverage, caches, totals, and future projections are disposable and excluded from Backup.

## Backup

Backup format version 1 is plaintext, semantic JSON. It contains the complete authoritative Household List and stable UUID relationships, plus an export timestamp. Import migrates recognized older formats, rejects newer formats, validates the complete candidate, and only then replaces all domain tables in one transaction. Failure leaves existing data untouched.

## First vertical slice

1. Initialize and migrate the SQLite store.
2. Create the root Household List if absent.
3. Add a Standard Monthly or Yearly Subscription through a native Expo UI form.
4. Project and display upcoming Billing Occurrences without advancing stored dates.
5. Retain elapsed occurrences during reconciliation.
6. Exercise recurrence/validation through pure module tests and verify the iOS build.

Trial/Promotion entry, lifecycle commands, Payment resolution, file-based Backup UI, and notification registration extend the same modules after this slice; their schema and invariants are established here.
