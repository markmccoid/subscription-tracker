import {
  DatePicker,
  DisclosureGroup,
  Form,
  Host,
  Picker,
  Section,
  Text,
  TextField,
  Toggle,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  disabled,
  foregroundStyle,
  keyboardType,
  lineLimit,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import * as Notifications from 'expo-notifications';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  getSubscriptionTracker,
} from '@/application/create-subscription-tracker';
import {
  localCalendarDate,
  type AddStandardSubscriptionCommand,
  type EditStandardSubscriptionCommand,
  type PaymentMethodOption,
  type SaveSubscriptionResult,
  type SubscriptionDetail,
} from '@/application/subscription-tracker';
import { categories, type BillingCycle, type Category, type PaymentMethodId } from '@/domain/model';
import { calendarDate, calendarParts, daysInMonth } from '@/domain/primitives';
import { useTheme } from '@/hooks/use-theme';

const categoryLabels: Record<Category, string> = {
  entertainment: 'Entertainment',
  software: 'Software',
  news: 'News',
  health: 'Health',
  utilities: 'Utilities',
  finance: 'Finance',
  other: 'Other',
};

type ReminderChoice = 'default' | '0' | '1' | '3' | '7' | 'custom';

interface FormValues {
  readonly name: string;
  readonly amount: string;
  readonly cycle: BillingCycle;
  readonly category: Category | 'uncategorized';
  readonly billingDate: Date;
  readonly anchorDay: string;
  readonly defaultPaymentMethodId: PaymentMethodId | null;
  readonly reminderChoice: ReminderChoice;
  readonly reminderDays: string;
  readonly notificationsMuted: boolean;
  readonly note: string;
  readonly cancellationUrl: string;
}

export function AddSubscriptionScreen() {
  const initialDate = clampedNextMonth(new Date());
  return (
    <SubscriptionForm
      mode="add"
      initial={{
        name: '',
        amount: '',
        cycle: 'monthly',
        category: 'uncategorized',
        billingDate: initialDate,
        anchorDay: String(initialDate.getDate()),
        defaultPaymentMethodId: null,
        reminderChoice: 'default',
        reminderDays: '3',
        notificationsMuted: false,
        note: '',
        cancellationUrl: '',
      }}
    />
  );
}

export function EditSubscriptionScreen({ detail }: { readonly detail: SubscriptionDetail }) {
  const override = detail.reminderLeadDaysOverride;
  const reminderChoice: ReminderChoice =
    override === null
      ? 'default'
      : [0, 1, 3, 7].includes(override)
        ? (String(override) as ReminderChoice)
        : 'custom';
  return (
    <SubscriptionForm
      mode="edit"
      detail={detail}
      initial={{
        name: detail.name,
        amount: formatCents(detail.pricing.standardAmount),
        cycle: detail.schedule.cycle,
        category: detail.category ?? 'uncategorized',
        billingDate: dateFromCalendar(detail.nextBillingDate ?? detail.schedule.startDate),
        anchorDay: String(detail.schedule.anchorDay),
        defaultPaymentMethodId: detail.defaultPaymentMethodId,
        reminderChoice,
        reminderDays: String(override ?? detail.householdReminderLeadDays),
        notificationsMuted: detail.notificationsMuted,
        note: detail.note ?? '',
        cancellationUrl: detail.cancellationUrl ?? '',
      }}
    />
  );
}

function SubscriptionForm({
  mode,
  initial,
  detail,
}: {
  readonly mode: 'add' | 'edit';
  readonly initial: FormValues;
  readonly detail?: SubscriptionDetail;
}) {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const nameState = useNativeState(initial.name);
  const amountState = useNativeState(initial.amount);
  const anchorState = useNativeState(initial.anchorDay);
  const reminderDaysState = useNativeState(initial.reminderDays);
  const noteState = useNativeState(initial.note);
  const urlState = useNativeState(initial.cancellationUrl);
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(initial.amount);
  const [cycle, setCycle] = useState(initial.cycle);
  const [category, setCategory] = useState(initial.category);
  const [billingDate, setBillingDate] = useState(initial.billingDate);
  const [anchorDay, setAnchorDay] = useState(initial.anchorDay);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState(initial.defaultPaymentMethodId);
  const [reminderChoice, setReminderChoice] = useState(initial.reminderChoice);
  const [reminderDays, setReminderDays] = useState(initial.reminderDays);
  const [notificationsMuted, setNotificationsMuted] = useState(initial.notificationsMuted);
  const [note, setNote] = useState(initial.note);
  const [cancellationUrl, setCancellationUrl] = useState(initial.cancellationUrl);
  const [additionalExpanded, setAdditionalExpanded] = useState(mode === 'edit' && Boolean(initial.note || initial.cancellationUrl));
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethodOption[]>([]);
  const [notificationsDenied, setNotificationsDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const allowExit = useRef(false);
  const awaitingPaymentMethod = useRef<Set<string> | null>(null);

  const values: FormValues = {
    name,
    amount,
    cycle,
    category,
    billingDate,
    anchorDay,
    defaultPaymentMethodId,
    reminderChoice,
    reminderDays,
    notificationsMuted,
    note,
    cancellationUrl,
  };
  const dirty = serializeValues(values) !== serializeValues(initial);
  const validation = validateForm(values, mode, detail);
  const saveDisabled = saving || !dirty || validation !== null;
  const visibleError = dirty && validation ? validation : error;
  const scheduleEditable =
    mode === 'add' || detail?.lifecycle.status === 'active' || detail?.lifecycle.status === 'cancellationPending';
  const pricingEditable = mode === 'add' || detail?.lifecycle.status !== 'canceled';
  const remindersEditable = mode === 'add' || detail?.lifecycle.status !== 'canceled';

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSubscriptionTracker()
        .then((tracker) => tracker.loadPaymentMethods())
        .then((next) => {
          if (!active) return;
          const previous = awaitingPaymentMethod.current;
          setPaymentMethods(next);
          if (previous) {
            const created = next.find((item) => !previous.has(item.id));
            if (created) setDefaultPaymentMethodId(created.id);
            awaitingPaymentMethod.current = null;
          }
        })
        .catch((caught: unknown) => {
          if (active) setError(errorMessage(caught, 'Could not load Payment Methods.'));
        });
      return () => {
        active = false;
      };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Notifications.getPermissionsAsync()
        .then((permission) => {
          if (!active) return;
          setNotificationsDenied(
            permission.ios?.status === Notifications.IosAuthorizationStatus.DENIED,
          );
        })
        .catch(() => {
          if (active) setNotificationsDenied(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!dirty || allowExit.current) return;
      event.preventDefault();
      Alert.alert('Discard changes?', 'Your Subscription changes have not been saved.', [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            allowExit.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
  }, [dirty, navigation]);

  const cancel = () => {
    if (!dirty) {
      allowExit.current = true;
      router.back();
      return;
    }
    Alert.alert('Discard changes?', 'Your Subscription changes have not been saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          allowExit.current = true;
          router.back();
        },
      },
    ]);
  };

  const submit = async (savePossibleDuplicate = false) => {
    const issue = validateForm(values, mode, detail);
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      const scheduleInputsChanged =
        cycle !== initial.cycle ||
        localCalendarDate(billingDate) !== localCalendarDate(initial.billingDate) ||
        Number(anchorDay) !== Number(initial.anchorDay);
      const base: AddStandardSubscriptionCommand = {
        name,
        amountCents: parseDollarsToCents(amount),
        cycle,
        category: category === 'uncategorized' ? null : category,
        scheduleStartDate:
          mode === 'edit' && detail && !scheduleInputsChanged
            ? detail.schedule.startDate
            : localCalendarDate(billingDate),
        anchorDay:
          mode === 'edit' && detail && !scheduleInputsChanged
            ? detail.schedule.anchorDay
            : cycle === 'monthly'
              ? Number(anchorDay)
              : billingDate.getDate(),
        defaultPaymentMethodId,
        reminderLeadDaysOverride:
          reminderChoice === 'default'
            ? null
            : reminderChoice === 'custom'
              ? Number(reminderDays)
              : Number(reminderChoice),
        notificationsMuted,
        note,
        cancellationUrl,
        savePossibleDuplicate,
      };
      const result =
        mode === 'edit' && detail
          ? await tracker.editStandardSubscription({
              ...base,
              subscriptionId: detail.id,
            } satisfies EditStandardSubscriptionCommand)
          : await tracker.addStandardSubscription(base);
      handleSaveResult(result);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save this Subscription.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveResult = (result: SaveSubscriptionResult) => {
    if (result.status === 'saved') {
      allowExit.current = true;
      router.back();
      return;
    }
    const candidate = result.candidate;
    Alert.alert(
      'Possible Duplicate',
      `${candidate.name} · ${formatCents(candidate.amountCents)} · ${candidate.cycle === 'monthly' ? 'Monthly' : 'Yearly'} · ${candidate.nextBillingDate}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Review Existing',
          onPress: () =>
            router.push({ pathname: '/(tabs)/(subscriptions)/[id]', params: { id: candidate.id } }),
        },
        { text: 'Save Anyway', onPress: () => void submit(true) },
      ],
    );
  };

  const currentPaymentMethod = paymentMethods.find((item) => item.id === defaultPaymentMethodId);
  const visiblePaymentMethods = paymentMethods.filter(
    (item) => !item.retired || item.id === detail?.defaultPaymentMethodId,
  );
  const changeSummary = detail ? describeNextChargeChange(detail, values) : null;

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={cancel}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={saveDisabled} onPress={() => void submit()} variant="prominent">
          {saving ? 'Saving…' : 'Save'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title="Subscription">
            <TextField text={nameState} placeholder="Name" onTextChange={setName} maxLength={200} />
            <Picker<Category | 'uncategorized'> label="Category" selection={category} onSelectionChange={setCategory}>
              <Text modifiers={[tag('uncategorized')]}>Uncategorized</Text>
              {categories.map((option) => (
                <Text key={option} modifiers={[tag(option)]}>{categoryLabels[option]}</Text>
              ))}
            </Picker>
          </Section>

          <Section title="Pricing">
            <TextField
              text={amountState}
              placeholder="USD amount"
              onTextChange={setAmount}
              modifiers={[keyboardType('decimal-pad'), disabled(!pricingEditable)]}
            />
            <Picker<BillingCycle>
              label="Billing Cycle"
              selection={cycle}
              onSelectionChange={(next) => {
                setCycle(next);
                if (next !== initial.cycle && mode === 'edit') {
                  const reset = clampedNextMonth(new Date());
                  setBillingDate(reset);
                  setAnchorDay(String(reset.getDate()));
                  anchorState.set(String(reset.getDate()));
                }
              }}
              modifiers={[pickerStyle('segmented'), disabled(!pricingEditable || !scheduleEditable)]}>
              <Text modifiers={[tag('monthly')]}>Monthly</Text>
              <Text modifiers={[tag('yearly')]}>Yearly</Text>
            </Picker>
          </Section>

          <Section title="Billing Schedule" footer={<Text>{scheduleEditable ? 'Days missing from a month use that month’s final day.' : 'The schedule changes when this Subscription is resumed or reactivated.'}</Text>}>
            <DatePicker
              title={mode === 'add' ? 'First Billing Date' : 'Next Billing Date'}
              selection={billingDate}
              range={{ start: startOfToday() }}
              displayedComponents={['date']}
              onDateChange={(date) => {
                setBillingDate(date);
                setAnchorDay(String(date.getDate()));
                anchorState.set(String(date.getDate()));
              }}
              modifiers={[disabled(!scheduleEditable)]}
            />
            {cycle === 'monthly' ? (
              <TextField
                text={anchorState}
                placeholder="Billing Day (1–31)"
                onTextChange={setAnchorDay}
                maxLength={2}
                modifiers={[keyboardType('numeric'), disabled(!scheduleEditable)]}
              />
            ) : null}
            {changeSummary ? <Text modifiers={[foregroundStyle(theme.textSecondary)]}>{changeSummary}</Text> : null}
          </Section>

          <Section title="Payment">
            <Picker<string>
              label="Default Payment Method"
              selection={defaultPaymentMethodId ?? 'none'}
              onSelectionChange={(selection) => {
                if (selection === 'add') {
                  awaitingPaymentMethod.current = new Set(paymentMethods.map((item) => item.id));
                  router.push('/add-payment-method');
                } else {
                  setDefaultPaymentMethodId(selection === 'none' ? null : (selection as PaymentMethodId));
                }
              }}>
              <Text modifiers={[tag('none')]}>None</Text>
              {visiblePaymentMethods.map((item) => (
                <Text key={item.id} modifiers={[tag(item.id)]}>
                  {item.name}{item.retired ? ' — Retired' : ''}
                </Text>
              ))}
              <Text modifiers={[tag('add')]}>Add Payment Method…</Text>
            </Picker>
            {currentPaymentMethod?.retired ? <Text>This Retired Payment Method may be retained, cleared, or replaced.</Text> : null}
          </Section>

          <Section title="Reminders">
            <Picker<ReminderChoice>
              label="Reminder"
              selection={reminderChoice}
              onSelectionChange={setReminderChoice}
              modifiers={[disabled(!remindersEditable)]}>
              <Text modifiers={[tag('default')]}>Household Default</Text>
              <Text modifiers={[tag('0')]}>On Billing Date</Text>
              <Text modifiers={[tag('1')]}>1 day before</Text>
              <Text modifiers={[tag('3')]}>3 days before</Text>
              <Text modifiers={[tag('7')]}>7 days before</Text>
              <Text modifiers={[tag('custom')]}>Custom…</Text>
            </Picker>
            {reminderChoice === 'custom' ? (
              <TextField
                text={reminderDaysState}
                placeholder="Days before (0–365)"
                onTextChange={setReminderDays}
                maxLength={3}
                modifiers={[keyboardType('numeric'), disabled(!remindersEditable)]}
              />
            ) : null}
            <Toggle
              label="Mute Notifications"
              isOn={notificationsMuted}
              onIsOnChange={setNotificationsMuted}
              modifiers={[disabled(!remindersEditable)]}
            />
            {notificationsDenied ? (
              <Text modifiers={[foregroundStyle(theme.textSecondary)]}>
                Notifications are off in iOS Settings. These preferences will be preserved.
              </Text>
            ) : null}
          </Section>

          <Section>
            <DisclosureGroup label="Additional Details" isExpanded={additionalExpanded} onIsExpandedChange={setAdditionalExpanded}>
              <TextField
                text={noteState}
                placeholder="Note"
                axis="vertical"
                maxLength={2000}
                onTextChange={setNote}
                modifiers={[lineLimit({ min: 2, max: 6 })]}
              />
              <TextField
                text={urlState}
                placeholder="Cancellation URL (https://…)"
                maxLength={2048}
                onTextChange={setCancellationUrl}
                modifiers={[keyboardType('url')]}
              />
            </DisclosureGroup>
          </Section>

          {visibleError ? <Section><Text modifiers={[foregroundStyle('red')]}>{visibleError}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

function validateForm(values: FormValues, mode: 'add' | 'edit', detail?: SubscriptionDetail): string | null {
  if (!values.name.trim()) return 'Enter a Subscription name.';
  if (values.name.trim().length > 200) return 'Subscription name must contain at most 200 characters.';
  try {
    parseDollarsToCents(values.amount);
  } catch (caught) {
    return errorMessage(caught, 'Enter a valid USD amount.');
  }
  const anchor = Number(values.anchorDay);
  if (values.cycle === 'monthly' && (!Number.isInteger(anchor) || anchor < 1 || anchor > 31)) {
    return 'Billing Day must be an integer from 1 through 31.';
  }
  const selectedDay = values.billingDate.getDate();
  const expectedDay = Math.min(anchor, daysInMonth(values.billingDate.getFullYear(), values.billingDate.getMonth() + 1));
  if (values.cycle === 'monthly' && selectedDay !== expectedDay) {
    return 'Billing Date must match the selected Billing Day.';
  }
  const minimum = startOfToday();
  if (mode === 'edit') minimum.setDate(minimum.getDate() + 1);
  const scheduleChanged = detail
    ? values.cycle !== detail.schedule.cycle ||
      localCalendarDate(values.billingDate) !== (detail.nextBillingDate ?? detail.schedule.startDate) ||
      Number(values.anchorDay) !== detail.schedule.anchorDay
    : true;
  if (scheduleChanged && values.billingDate < minimum) {
    return mode === 'add' ? 'First Billing Date cannot be in the past.' : 'Next Billing Date must be after today.';
  }
  if (values.reminderChoice === 'custom') {
    const days = Number(values.reminderDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) return 'Reminder must be from 0 through 365 days before.';
  }
  if (values.note.trim().length > 2000) return 'Subscription note must contain at most 2,000 characters.';
  if (values.cancellationUrl.trim()) {
    try {
      const url = new URL(values.cancellationUrl.trim());
      if (url.protocol !== 'https:' || !url.hostname) throw new Error();
    } catch {
      return 'Cancellation URL must be a valid HTTPS URL.';
    }
  }
  return null;
}

export function parseDollarsToCents(value: string): number {
  const normalized = value.trim().replace(/^\$/, '').replaceAll(',', '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error('Enter a positive USD amount with no more than two decimal places.');
  const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Amount must be greater than zero.');
  return result;
}

function serializeValues(values: FormValues): string {
  return JSON.stringify({ ...values, billingDate: localCalendarDate(values.billingDate) });
}

function describeNextChargeChange(detail: SubscriptionDetail, values: FormValues): string | null {
  if (!detail.nextBillingDate) return null;
  const next = localCalendarDate(values.billingDate);
  let nextAmount: number;
  try {
    nextAmount = parseDollarsToCents(values.amount);
  } catch {
    return null;
  }
  const currentAmount = detail.pricing.standardAmount;
  if (next === detail.nextBillingDate && nextAmount === currentAmount) return null;
  return `Next expected charge changes from ${formatCents(currentAmount)} on ${detail.nextBillingDate} to ${formatCents(nextAmount)} on ${next}.`;
}

function formatCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
}

function dateFromCalendar(value: string): Date {
  const { year, month, day } = calendarParts(calendarDate(value));
  return new Date(year, month - 1, day, 12);
}

function startOfToday(): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

function clampedNextMonth(date: Date): Date {
  const year = date.getFullYear();
  const nextMonthIndex = date.getMonth() + 1;
  const targetYear = year + Math.floor(nextMonthIndex / 12);
  const targetMonth = nextMonthIndex % 12;
  return new Date(targetYear, targetMonth, Math.min(date.getDate(), daysInMonth(targetYear, targetMonth + 1)), 12);
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
