import * as Notifications from 'expo-notifications';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import { notificationPreferenceStore } from '@/stores/notification-preference-store';
import {
  BILLING_REMINDER_KIND,
  BILLING_REMINDER_SNOOZE_KIND,
  billingReminderActions,
} from './notification-actions';
import { rescheduleBillingReminder } from './notification-snooze';

export const BILLING_REMINDER_CATEGORY = 'billingReminder';
export { REMIND_IN_ONE_DAY_ACTION, REMIND_IN_ONE_HOUR_ACTION } from './notification-actions';

const BILLING_REMINDER_CHANNEL = 'billing-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function notificationsAreAuthorized(
  permissions: Notifications.NotificationPermissionsStatus,
): boolean {
  const iosStatus = permissions.ios?.status;
  if (iosStatus !== undefined) {
    return (
      iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
    );
  }
  return permissions.granted;
}

export function notificationsAreUndetermined(
  permissions: Notifications.NotificationPermissionsStatus,
): boolean {
  return permissions.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED ||
    permissions.status === 'undetermined';
}

export async function requestNotificationAuthorization(): Promise<boolean> {
  await configureNotificationInteractions();
  const permissions = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  const authorized = notificationsAreAuthorized(permissions);
  notificationPreferenceStore.getState().setEnabled(authorized);
  if (authorized) await reconcileBillingReminders();
  else await cancelBillingReminders(true);
  return authorized;
}

export async function setBillingNotificationsEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    notificationPreferenceStore.getState().setEnabled(false);
    await cancelBillingReminders(true);
    return false;
  }
  const current = await Notifications.getPermissionsAsync();
  const authorized = notificationsAreAuthorized(current)
    ? true
    : await requestNotificationAuthorization();
  notificationPreferenceStore.getState().setEnabled(authorized);
  if (authorized) await reconcileBillingReminders();
  return authorized;
}

export async function reconcileBillingReminders(): Promise<void> {
  const permissions = await Notifications.getPermissionsAsync();
  if (
    !notificationsAreAuthorized(permissions) ||
    notificationPreferenceStore.getState().enabled !== true
  ) {
    await cancelBillingReminders(true);
    return;
  }

  await configureNotificationInteractions();
  const tracker = await getSubscriptionTracker();
  const plans = await tracker.loadBillingReminderPlans();
  await cancelBillingReminders();
  for (const plan of plans) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${plan.subscriptionName} is due soon`,
        body: `Billing is due ${formatBillingDate(plan.billingDate)}.`,
        sound: 'default',
        categoryIdentifier: BILLING_REMINDER_CATEGORY,
        data: {
          kind: BILLING_REMINDER_KIND,
          subscriptionId: plan.subscriptionId,
          billingDate: plan.billingDate,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.triggerDate,
        ...(process.env.EXPO_OS === 'android' ? { channelId: BILLING_REMINDER_CHANNEL } : {}),
      },
    });
  }
}

export async function cancelBillingRemindersForSubscription(
  subscriptionId: string,
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => {
        const data = request.content.data;
        const kind = data?.kind;
        return (
          data?.subscriptionId === subscriptionId &&
          (kind === BILLING_REMINDER_KIND || kind === BILLING_REMINDER_SNOOZE_KIND)
        );
      })
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export async function startNotificationSystem(): Promise<() => void> {
  await configureNotificationInteractions();
  let permissions = await Notifications.getPermissionsAsync();
  if (notificationsAreUndetermined(permissions)) {
    permissions = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    notificationPreferenceStore.getState().setEnabled(notificationsAreAuthorized(permissions));
  } else if (!notificationsAreAuthorized(permissions)) {
    notificationPreferenceStore.getState().setEnabled(false);
  } else if (notificationPreferenceStore.getState().enabled === null) {
    notificationPreferenceStore.getState().setEnabled(true);
  }

  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse) {
    await handleNotificationResponse(lastResponse);
    Notifications.clearLastNotificationResponse();
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void handleNotificationResponse(response).finally(() => {
      Notifications.clearLastNotificationResponse();
    });
  });
  await reconcileBillingReminders();
  return () => subscription.remove();
}

async function configureNotificationInteractions(): Promise<void> {
  if (process.env.EXPO_OS === 'android') {
    await Notifications.setNotificationChannelAsync(BILLING_REMINDER_CHANNEL, {
      name: 'Billing reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(BILLING_REMINDER_CATEGORY, [
    ...billingReminderActions,
  ]);
}

async function cancelBillingReminders(includeSnoozed = false): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => {
        const kind = request.content.data?.kind;
        return kind === BILLING_REMINDER_KIND ||
          (includeSnoozed && kind === BILLING_REMINDER_SNOOZE_KIND);
      })
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

async function handleNotificationResponse(response: Notifications.NotificationResponse): Promise<boolean> {
  return rescheduleBillingReminder(
    response,
    Notifications,
    process.env.EXPO_OS === 'android' ? BILLING_REMINDER_CHANNEL : undefined,
  );
}

function formatBillingDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}
