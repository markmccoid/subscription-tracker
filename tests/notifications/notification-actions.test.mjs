import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BILLING_REMINDER_KIND,
  billingReminderActions,
  REMIND_IN_ONE_HOUR_ACTION,
} from '../../src/notifications/notification-actions.ts';
import { rescheduleBillingReminder } from '../../src/notifications/notification-snooze.ts';

test('Billing Reminder actions run without foregrounding the app', () => {
  assert.ok(
    billingReminderActions.every((action) => action.options.opensAppToForeground === false),
  );
});

test('snoozing reschedules the reminder and dismisses the delivered notification', async () => {
  const scheduled = [];
  const dismissed = [];
  const response = {
    actionIdentifier: REMIND_IN_ONE_HOUR_ACTION,
    notification: {
      date: Date.now(),
      request: {
        identifier: 'delivered-reminder',
        trigger: null,
        content: {
          title: 'Example is due soon',
          body: 'Billing is due Aug 15, 2026.',
          data: { kind: BILLING_REMINDER_KIND, subscriptionId: 'subscription-1' },
        },
      },
    },
  };

  const handled = await rescheduleBillingReminder(response, {
    async scheduleNotificationAsync(request) {
      scheduled.push(request);
      return 'snoozed-reminder';
    },
    async dismissNotificationAsync(identifier) {
      dismissed.push(identifier);
    },
  });

  assert.equal(handled, true);
  assert.equal(scheduled[0].trigger.seconds, 60 * 60);
  assert.equal(scheduled[0].content.data.kind, 'billingReminderSnooze');
  assert.deepEqual(dismissed, ['delivered-reminder']);
});

test('tapping the notification itself does not enter the snooze path', async () => {
  let called = false;
  const handled = await rescheduleBillingReminder({
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date: Date.now(),
      request: {
        identifier: 'delivered-reminder',
        trigger: null,
        content: { data: { kind: BILLING_REMINDER_KIND } },
      },
    },
  }, {
    async scheduleNotificationAsync() {
      called = true;
      return 'unexpected';
    },
    async dismissNotificationAsync() {
      called = true;
    },
  });

  assert.equal(handled, false);
  assert.equal(called, false);
});
