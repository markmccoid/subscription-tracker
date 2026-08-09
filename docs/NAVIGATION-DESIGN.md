# Navigation design

Version one uses three stable native tabs in this order: Upcoming, Subscriptions, and Settings. Each tab owns a stack with a transparent header, large root title, minimal back buttons, and automatically adjusted scrolling. Child screens use compact titles while retaining transparent headers. Version one does not display tab badges.

## Upcoming

Upcoming is the default tab and is organized around Billing Occurrences rather than Subscription records. Its rolling 30-day timeline omits empty sections and uses this order:

1. Action Needed — Overdue Billing Occurrences that have neither a Payment nor a Charge Exception.
2. Next 7 Days — near-term expected charges, with a restrained warm treatment.
3. Later This Month — the remainder of the rolling 30-day window.
4. Later — the next Billing Occurrence beyond the window for every remaining Subscription.

Selecting a charge opens its Billing Occurrence, where the user can Record Payment or record No Charge. The occurrence screen provides a secondary route to its Subscription. A History header action opens Recorded Spend totals and chronological Payment history.

## Subscriptions

Subscriptions shows every non-archived Subscription by default, grouped by lifecycle state: Active and Cancellation Pending first, Paused next, and Canceled last. Archived Subscriptions appear only through an explicit filter.

The root supports native name search plus lifecycle and Category filters. Each row shows the Subscription name and Category, its current recurring amount and Billing Cycle, its Next Billing Date when applicable, and a lifecycle label only when it is not Active.

The transparent stack header contains an Add Subscription button. It presents creation as a native form sheet; saving dismisses the sheet and adds the Subscription to the current list. Selecting an existing Subscription pushes its detail screen. Valid lifecycle actions appear contextually on that detail screen rather than as list swipe actions, and permanent deletion is visually separated from other actions.

## Settings

Settings groups destinations into these sections:

- Household — Payment Methods and the version-one USD Household Currency.
- Notifications — authorization state, Default Lead Time, and Reminder Time.
- Appearance — Theme Mode and Accent Color.
- Data — Backup, restore, and destructive reset.
- About — app version and support information.

Appearance is a dedicated child screen. Theme Mode offers System, Light, and Dark, with System as the default. Accent Color offers six curated swatches in version one: indigo, blue, green, orange, magenta, and red. The selected accent is used for tab icons, buttons, links, and other accent surfaces.

Backup excludes Theme Mode and Accent Color because they are device preferences rather than Household List data. Reset Household Data replaces the SQLite Household List after typed confirmation while preserving appearance preferences. Appearance provides a separate, non-destructive Restore Defaults action.

## Occurrence resolution

Recording a Payment prefills the Billing Occurrence's expected amount and Billing Date, and suggests the Subscription's Default Payment Method. All three remain editable before confirmation. A new Payment Method may be created inline, while complete Payment Method management remains in Settings.

Recording No Charge creates a Charge Exception without changing future scheduling. The optional reason may be Canceled before renewal, Trial remained free, Provider waived charge, or Other with an optional note.
