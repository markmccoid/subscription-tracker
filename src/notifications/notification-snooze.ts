import type {
  NotificationRequestInput,
  NotificationResponse,
  SchedulableTriggerInputTypes,
} from 'expo-notifications';

import {
  BILLING_REMINDER_KIND,
  BILLING_REMINDER_SNOOZE_KIND,
  REMIND_IN_ONE_DAY_ACTION,
  REMIND_IN_ONE_HOUR_ACTION,
} from './notification-actions';

interface SnoozeNotificationApi {
  scheduleNotificationAsync(request: NotificationRequestInput): Promise<string>;
  dismissNotificationAsync(identifier: string): Promise<void>;
}

export async function rescheduleBillingReminder(
  response: NotificationResponse,
  notifications: SnoozeNotificationApi,
  channelId?: string,
): Promise<boolean> {
  const seconds = response.actionIdentifier === REMIND_IN_ONE_HOUR_ACTION
    ? 60 * 60
    : response.actionIdentifier === REMIND_IN_ONE_DAY_ACTION
      ? 24 * 60 * 60
      : null;
  const kind = response.notification.request.content.data?.kind;
  if (
    seconds === null ||
    (kind !== BILLING_REMINDER_KIND && kind !== BILLING_REMINDER_SNOOZE_KIND)
  ) {
    return false;
  }

  const { title, body, data } = response.notification.request.content;
  await notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { ...data, kind: BILLING_REMINDER_SNOOZE_KIND },
      sound: 'default',
      categoryIdentifier: 'billingReminder',
    },
    trigger: {
      type: 'timeInterval' as SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      ...(channelId ? { channelId } : {}),
    },
  });
  await notifications.dismissNotificationAsync(response.notification.request.identifier);
  return true;
}
