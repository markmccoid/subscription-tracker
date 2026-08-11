import { Button, Form, Host, Section, Text, TextField, Toggle, useNativeState } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle, keyboardType } from '@expo/ui/swift-ui/modifiers';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import {
  notificationsAreAuthorized,
  reconcileBillingReminders,
  setBillingNotificationsEnabled,
} from '@/notifications/billing-notifications';
import { useNotificationPreferenceStore } from '@/stores/notification-preference-store';

export function NotificationsScreen() {
  const enabledPreference = useNotificationPreferenceStore((state) => state.enabled);
  const leadDaysState = useNativeState('5');
  const [leadDays, setLeadDays] = useState('5');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setBusy(true);
      void Promise.all([
        getSubscriptionTracker().then((tracker) => tracker.loadNotificationSettings()),
        Notifications.getPermissionsAsync(),
      ])
        .then(([settings, permissions]) => {
          if (!active) return;
          const value = String(settings.defaultReminderLeadDays);
          leadDaysState.set(value);
          setLeadDays(value);
          setPermissionDenied(!notificationsAreAuthorized(permissions));
          setError(null);
        })
        .catch((caught: unknown) => {
          if (active) setError(errorMessage(caught, 'Could not load notification settings.'));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [leadDaysState]),
  );

  const changeEnabled = (enabled: boolean) => {
    setBusy(true);
    setError(null);
    void setBillingNotificationsEnabled(enabled)
      .then((authorized) => setPermissionDenied(enabled && !authorized))
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not update notifications.')))
      .finally(() => setBusy(false));
  };

  const saveLeadDays = () => {
    const value = Number(leadDays);
    if (!Number.isInteger(value) || value < 0 || value > 365) {
      setError('Days before billing must be a whole number from 0 to 365.');
      return;
    }
    setBusy(true);
    setError(null);
    void getSubscriptionTracker()
      .then((tracker) => tracker.updateDefaultReminderLeadDays(value))
      .then(() => reconcileBillingReminders())
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not save the lead time.')))
      .finally(() => setBusy(false));
  };

  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section footer={<Text>Billing Reminders are scheduled locally on this device.</Text>}>
          <Toggle
            label="Allow Notifications"
            isOn={enabledPreference === true && !permissionDenied}
            onIsOnChange={changeEnabled}
            modifiers={[disabled(busy)]}
          />
        </Section>

        <Section
          title="Default Lead Time"
          footer={<Text>Each Subscription can override this default. Enter 0 for the Billing Date.</Text>}>
          <TextField
            text={leadDaysState}
            placeholder="Days before billing"
            maxLength={3}
            onTextChange={setLeadDays}
            onFocusChange={(focused) => {
              if (!focused) saveLeadDays();
            }}
            modifiers={[keyboardType('numeric'), disabled(busy)]}
          />
        </Section>

        {permissionDenied ? (
          <Section footer={<Text>Notification permission is off. You can enable it in iOS Settings.</Text>}>
            <Button label="Open iOS Settings" onPress={() => void Linking.openSettings()} />
          </Section>
        ) : null}

        {error ? (
          <Section>
            <Text modifiers={[foregroundStyle('red')]}>{error}</Text>
          </Section>
        ) : null}
      </Form>
    </Host>
  );
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
