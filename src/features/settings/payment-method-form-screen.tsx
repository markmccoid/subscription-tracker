import { Button, Form, Host, Section, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import { foregroundStyle, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { PaymentMethodOption } from '@/application/subscription-tracker';
import type { PaymentMethodId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';

type PaymentMethodFormMode = 'add' | 'edit';

export function PaymentMethodFormScreen({ mode }: { readonly mode: PaymentMethodFormMode }) {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const nameState = useNativeState('');
  const noteState = useNativeState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodOption | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let active = true;
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadPaymentMethods())
      .then((paymentMethods) => {
        const current = paymentMethods.find((item) => item.id === id);
        if (!current) throw new Error('Payment Method not found.');
        if (!active) return;
        setPaymentMethod(current);
        setName(current.name);
        setNote(current.note ?? '');
        nameState.set(current.name);
        noteState.set(current.note ?? '');
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load this Payment Method.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, mode, nameState, noteState]);

  const save = async () => {
    if (mode === 'edit' && !id) return;
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      if (mode === 'add') await tracker.addPaymentMethod({ name, note });
      else await tracker.updatePaymentMethod({ paymentMethodId: id as PaymentMethodId, name, note });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${mode === 'add' ? 'add' : 'update'} this Payment Method.`);
    } finally {
      setSaving(false);
    }
  };

  const changeRetirement = (retired: boolean) => {
    if (!id) return;
    Alert.alert(
      retired ? 'Retire Payment Method?' : 'Restore Payment Method?',
      retired
        ? 'It will no longer be offered for new Subscriptions or Payments. Existing assignments and payment history will be preserved.'
        : 'It will be available for new Subscriptions and Payments again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: retired ? 'Retire' : 'Restore',
          onPress: () => {
            void getSubscriptionTracker()
              .then((tracker) => tracker.setPaymentMethodRetired(id as PaymentMethodId, retired))
              .then(() => router.back())
              .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not update this Payment Method.'));
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert(
      'Delete Payment Method?',
      'All Subscriptions and past Payments that use this Payment Method will be set to None. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void getSubscriptionTracker()
              .then((tracker) => tracker.deletePaymentMethod(id as PaymentMethodId))
              .then(() => router.back())
              .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not delete this Payment Method.'));
          },
        },
      ],
    );
  };

  const unchanged = mode === 'edit' && paymentMethod
    ? name.trim() === paymentMethod.name && note.trim() === (paymentMethod.note ?? '')
    : false;

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={saving ? 'Saving Payment Method' : 'Save Payment Method'}
          disabled={loading || saving || !name.trim() || unchanged}
          onPress={() => void save()}
          variant="prominent">
          Save
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title="Payment Method" footer={<Text>Use a recognizable name only. Do not enter card or bank credentials.</Text>}>
            <TextField text={nameState} placeholder="Name" maxLength={120} onTextChange={setName} />
            <TextField text={noteState} placeholder="Optional note" axis="vertical" maxLength={500} onTextChange={setNote} modifiers={[lineLimit({ min: 2, max: 5 })]} />
          </Section>
          {mode === 'edit' && paymentMethod ? (
            <Section title="Usage" footer={<Text>Retiring preserves these references. Deleting clears them.</Text>}>
              <Text>{`${paymentMethod.subscriptionCount} ${paymentMethod.subscriptionCount === 1 ? 'Subscription' : 'Subscriptions'}`}</Text>
              <Text>{`${paymentMethod.paymentCount} past ${paymentMethod.paymentCount === 1 ? 'Payment' : 'Payments'}`}</Text>
            </Section>
          ) : null}
          {mode === 'edit' && paymentMethod ? (
            <Section>
              <Button
                label={paymentMethod.retired ? 'Restore Payment Method' : 'Retire Payment Method'}
                onPress={() => changeRetirement(!paymentMethod.retired)}
              />
              <Button label="Delete Payment Method" role="destructive" onPress={confirmDelete} />
            </Section>
          ) : null}
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}
