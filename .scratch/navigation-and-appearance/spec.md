# Navigation and appearance foundation

Status: ready-for-agent

## Problem Statement

The user needs a predictable app structure for understanding upcoming financial commitments, managing Subscriptions, and configuring household and device preferences. The current app still exposes starter navigation and hard-coded accents, so its information architecture does not express the Subscription Tracking domain and its appearance cannot be personalized consistently.

## Solution

Provide three stable native tabs—Upcoming, Subscriptions, and Settings—each backed by its own stack and a consistent transparent-header treatment. Make Upcoming the action-oriented default, make Subscriptions the authoritative management destination, and organize Settings by household data, notifications, appearance, data, and app information. Provide System, Light, and Dark React Navigation themes plus six persisted Accent Color choices that consistently drive native tabs, buttons, links, and other accent surfaces.

This implementation slice establishes the navigation and appearance foundation, presents Add Subscription from the Subscriptions header, and creates the agreed destinations. Domain workflows that have not yet been implemented remain follow-on work behind those destinations.

## User Stories

1. As a household member, I want the app to open on Upcoming, so that I immediately see commitments requiring attention.
2. As a household member, I want three stable tabs, so that expected charges, Subscription management, and settings have predictable homes.
3. As a household member, I want each tab to preserve its own navigation stack, so that switching tabs does not discard my place.
4. As a household member, I want native tab presentation, so that navigation behaves like the rest of iOS.
5. As a household member, I want no tab badges in version one, so that routine financial activity does not create notification pressure.
6. As a household member, I want Action Needed above future charges, so that unresolved Billing Occurrences are not hidden by the word “Upcoming.”
7. As a household member, I want upcoming charges divided into Next 7 Days, Later This Month, and Later, so that urgency is legible without financial noise.
8. As a household member, I want the rolling summary to cover 30 days, so that it matches Due in the Next 30 Days.
9. As a household member, I want a later charge retained for Subscriptions outside the window, so that yearly commitments do not disappear.
10. As a household member, I want selecting an upcoming charge to open its Billing Occurrence, so that I can resolve the expected charge directly.
11. As a household member, I want to Record Payment from a Billing Occurrence, so that Recorded Spend reflects confirmed charges.
12. As a household member, I want Payment amount and Payment Date prefilled from the Billing Occurrence, so that routine recording is fast and historically accurate.
13. As a household member, I want a Default Payment Method suggested but editable, so that the actual Payment remains authoritative.
14. As a household member, I want to create a Payment Method while recording a Payment, so that setup does not interrupt the task.
15. As a household member, I want to record No Charge with an optional reason, so that an expected charge can be resolved without changing its Subscription schedule.
16. As a household member, I want History reachable from Upcoming, so that Recorded Spend remains available without becoming a permanent tab.
17. As a household member, I want all non-archived Subscriptions shown by default, so that Paused and Canceled commitments remain discoverable.
18. As a household member, I want Subscriptions grouped by lifecycle state, so that Active, Paused, and Canceled commitments remain distinct.
19. As a household member, I want Archived Subscriptions behind an explicit filter, so that normal lists stay focused while retaining history.
20. As a household member, I want to search Subscriptions by name, so that a growing Household List remains manageable.
21. As a household member, I want lifecycle and Category filters, so that I can narrow the Subscription list intentionally.
22. As a household member, I want each Subscription row to show its name, Category, current amount, Billing Cycle, and applicable Next Billing Date, so that the list is useful without opening every record.
23. As a household member, I want Add Subscription in the Subscriptions header, so that creation lives beside the records it creates.
24. As a household member, I want Add Subscription presented as a native form sheet, so that creation feels focused without losing list context.
25. As a household member, I want Subscription lifecycle actions on its detail screen, so that state changes have adequate context and confirmation.
26. As a household member, I want Settings grouped into Household, Notifications, Appearance, Data, and About, so that unlike concerns are easy to distinguish.
27. As a household member, I want Appearance on its own screen, so that theme and Accent Color choices have room for clear previews.
28. As a household member, I want System, Light, and Dark Theme Modes, so that I can follow the device or retain an explicit appearance.
29. As a household member, I want System selected by default, so that the app respects my device preference without setup.
30. As a household member, I want six curated Accent Color swatches, so that I can personalize the app without producing unreadable controls.
31. As a household member, I want my Theme Mode and Accent Color persisted, so that appearance survives relaunches.
32. As a household member, I want accent text to remain readable, so that bright and dark accent choices both meet practical contrast needs.
33. As a household member, I want appearance excluded from Backup, so that restoring Household List data does not restyle a device unexpectedly.
34. As a household member, I want Reset Household Data to preserve appearance, so that financial deletion and visual preferences remain separate operations.
35. As a household member, I want a harmless Restore Defaults action for appearance, so that I can undo customization independently.
36. As a household member, I want transparent navigation headers and automatically adjusted content, so that every tab uses the same native visual hierarchy.

## Implementation Decisions

- Use Expo Router native tabs in the fixed order Upcoming, Subscriptions, Settings. Do not dynamically add, remove, or badge tabs in version one.
- Give every tab its own nested stack. Root screens use transparent large-title headers; child screens use compact transparent headers and minimal back buttons.
- Keep route files thin and keep screen implementations outside the route tree.
- Use SubscriptionTracker as the primary external seam for Household List behavior. Screens receive projections and submit commands without learning repository records, recurrence rules, or persistence ordering.
- Keep HouseholdRepository as an internal persistence seam with SQLite and in-memory adapters. Do not expose it to screens.
- Extend SubscriptionTracker incrementally as Upcoming, Subscription management, Billing Occurrence resolution, History, Payment Methods, reminders, Backup, and reset behavior are implemented.
- Keep appearance in a separate deep module because it is non-domain device state. Its interface exposes Theme Mode, Accent Color, mutations, and restoring defaults while hiding Zustand, serialization, and MMKV.
- Use MMKV as the production appearance storage adapter and an in-memory storage adapter for tests.
- Persist only Theme Mode and Accent Color. Household List data remains authoritative in SQLite in accordance with the storage ADR.
- Use React Navigation ThemeProvider as the navigation appearance source. Derive light and dark semantic app colors from the resolved Theme Mode and map Accent Color to navigation primary and notification colors.
- Do not add NativeWind. React Native styles and centralized semantic theme tokens are sufficient for the current application.
- Offer exactly six version-one Accent Color swatches: indigo, blue, green, orange, magenta, and red. Choose readable black or white accent foreground automatically.
- Present Add Subscription from a header button in the Subscriptions stack as a native form sheet. Saving dismisses the sheet and refreshes affected projections.
- The initial navigation slice may use clearly labeled unavailable destinations for domain workflows that are not yet implemented, but must not simulate stored data or claim those workflows are functional.
- Upcoming ultimately groups nonempty content into Action Needed, Next 7 Days, Later This Month, and Later. The current Dashboard projection can remain as an incremental implementation until occurrence-resolution projections are added.
- Subscription lifecycle actions live on the detail screen, are conditional on current lifecycle state, and do not use list swipe gestures in version one.
- Backup includes the Household List and excludes appearance preferences. Reset Household Data preserves appearance; Restore Defaults affects appearance only.

## Testing Decisions

- Good tests assert observable behavior through a module's interface and survive internal refactors. Tests must not inspect Zustand internals, SQLite rows, route implementation details, or private recurrence helpers.
- Test Household List behavior through SubscriptionTracker using the in-memory HouseholdRepository adapter. Existing initialization, creation, projection, and reconciliation coverage is the prior art.
- Test the appearance module through its small interface with an in-memory StateStorage adapter. Cover default values, persistence, rehydration, valid Accent Color updates, invalid color rejection, Theme Mode changes, restoring defaults, and readable foreground selection.
- Test route and header wiring with focused navigation tests or device-level UI flows. These tests should verify visible tab names, tab order, transparent headers, the Subscriptions Add button, form-sheet presentation, Settings navigation, and immediate theme updates.
- Run TypeScript validation and the existing domain/application test suite after route restructuring.
- Use an iOS simulator smoke test for NativeTabs, transparent headers, SwiftUI form presentation, light/dark switching, and all six accent swatches because those behaviors depend on native presentation.

## Out of Scope

- Implementing every Subscription lifecycle transition.
- Completing Payment and Charge Exception persistence and forms.
- Completing Recorded Spend History.
- Completing Payment Method management.
- Scheduling or reconciling Billing Reminders.
- Implementing Backup, restore, or Reset Household Data.
- Adding custom Accent Colors beyond the six curated swatches.
- Tab badges, dynamic tabs, authentication, synchronization, Android-specific product work, or a backend.
- Adding NativeWind or another styling framework.

## Further Notes

- The app targets Expo SDK 57 and iPhone first. Consult the exact versioned Expo documentation before implementation changes.
- MMKV contains only non-domain appearance preferences. SQLite remains authoritative for the Household List.
- The agreed interaction details and tab ownership are also summarized in `docs/NAVIGATION-DESIGN.md`.
