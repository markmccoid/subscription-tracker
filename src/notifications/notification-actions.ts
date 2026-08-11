export const REMIND_IN_ONE_HOUR_ACTION = 'REMIND_IN_ONE_HOUR';
export const REMIND_IN_ONE_DAY_ACTION = 'REMIND_IN_ONE_DAY';
export const BILLING_REMINDER_KIND = 'billingReminder';
export const BILLING_REMINDER_SNOOZE_KIND = 'billingReminderSnooze';

export const billingReminderActions = [
  {
    identifier: REMIND_IN_ONE_HOUR_ACTION,
    buttonTitle: 'Remind me again in 1 hour',
    options: { opensAppToForeground: false },
  },
  {
    identifier: REMIND_IN_ONE_DAY_ACTION,
    buttonTitle: 'Remind me again in 1 day',
    options: { opensAppToForeground: false },
  },
] as const;
