import { DatePicker, Form, Host, Picker, Section, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import { foregroundStyle, keyboardType, lineLimit, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import { localCalendarDate, type BillingOccurrenceDetail, type PaymentMethodOption } from '@/application/subscription-tracker';
import type { PaymentMethodId, SubscriptionId } from '@/domain/model';
import { calendarDate, calendarParts } from '@/domain/primitives';
import { useTheme } from '@/hooks/use-theme';

export function RecordPaymentScreen({
  subscriptionId,
  billingDate,
}: {
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const amountState = useNativeState('');
  const noteState = useNativeState('');
  const [detail, setDetail] = useState<BillingOccurrenceDetail | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethodOption[]>([]);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [paymentMethodId, setPaymentMethodId] = useState<PaymentMethodId | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const awaitingPaymentMethod = useRef<Set<string> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSubscriptionTracker()
        .then((tracker) => Promise.all([
          tracker.loadBillingOccurrenceDetail(subscriptionId, billingDate),
          tracker.loadPaymentMethods(),
        ]))
        .then(([nextDetail, nextMethods]) => {
          if (!active) return;
          if (nextDetail.resolution.kind !== 'unresolved') {
            throw new Error('Billing Occurrence has already been resolved.');
          }
          const selectable = nextMethods.filter((item) => !item.retired);
          const previous = awaitingPaymentMethod.current;
          setDetail(nextDetail);
          setPaymentMethods(selectable);
          if (!initialized.current) {
            const nextAmount = dollarsForInput(nextDetail.expectedAmountCents);
            setAmount(nextAmount);
            amountState.set(nextAmount);
            setPaymentDate(dateFromCalendar(nextDetail.billingDate));
            const suggested = selectable.find((item) => item.id === nextDetail.defaultPaymentMethodId);
            setPaymentMethodId(suggested?.id ?? null);
            initialized.current = true;
          } else if (previous) {
            const created = selectable.find((item) => !previous.has(item.id));
            if (created) setPaymentMethodId(created.id);
            awaitingPaymentMethod.current = null;
          }
        })
        .catch((caught: unknown) => {
          if (active) setError(errorMessage(caught, 'Could not load Payment Methods.'));
        });
      return () => {
        active = false;
      };
    }, [amountState, billingDate, subscriptionId]),
  );

  const validation = validateAmount(amount);

  const save = async () => {
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.recordPayment({
        subscriptionId,
        billingDate,
        amountCents: parseDollarsToCents(amount),
        paymentDate: localCalendarDate(paymentDate),
        paymentMethodId,
        note,
      });
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not record this Payment.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={saving || !detail || Boolean(validation)} onPress={() => void save()} variant="prominent">
          {saving ? 'Saving…' : 'Save'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title={detail?.subscriptionName ?? 'Payment'} footer={<Text>The amount and date are prefilled from the Billing Occurrence and may be changed to match the actual charge.</Text>}>
            <TextField
              text={amountState}
              placeholder="USD amount"
              onTextChange={setAmount}
              modifiers={[keyboardType('decimal-pad')]}
            />
            <DatePicker
              title="Payment Date"
              selection={paymentDate}
              displayedComponents={['date']}
              onDateChange={setPaymentDate}
            />
          </Section>
          <Section title="Payment Method">
            <Picker<string>
              label="Method"
              selection={paymentMethodId ?? 'none'}
              onSelectionChange={(selection) => {
                if (selection === 'add') {
                  awaitingPaymentMethod.current = new Set(paymentMethods.map((item) => item.id));
                  router.push('/add-payment-method');
                } else {
                  setPaymentMethodId(selection === 'none' ? null : (selection as PaymentMethodId));
                }
              }}>
              <Text modifiers={[tag('none')]}>None</Text>
              {paymentMethods.map((item) => <Text key={item.id} modifiers={[tag(item.id)]}>{item.name}</Text>)}
              <Text modifiers={[tag('add')]}>Add Payment Method…</Text>
            </Picker>
          </Section>
          <Section title="Note">
            <TextField
              text={noteState}
              placeholder="Optional note"
              axis="vertical"
              maxLength={500}
              onTextChange={setNote}
              modifiers={[lineLimit({ min: 2, max: 5 })]}
            />
          </Section>
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

function validateAmount(value: string): string | null {
  try {
    parseDollarsToCents(value);
    return null;
  } catch (caught) {
    return errorMessage(caught, 'Enter a valid USD amount.');
  }
}

function parseDollarsToCents(value: string): number {
  const normalized = value.trim().replace(/^\$/, '').replaceAll(',', '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error('Enter a positive USD amount with no more than two decimal places.');
  const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Amount must be greater than zero.');
  return result;
}

function dollarsForInput(value: number): string {
  return (value / 100).toFixed(2);
}

function dateFromCalendar(value: string): Date {
  const { year, month, day } = calendarParts(calendarDate(value));
  return new Date(year, month - 1, day, 12);
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
