import { DatePicker, Form, Host, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import {
  localCalendarDate,
  type CancellationPreview,
  type SubscriptionDetail,
} from '@/application/subscription-tracker';
import type { SubscriptionId } from '@/domain/model';
import { calendarDate, calendarParts, daysInMonth } from '@/domain/primitives';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelBillingRemindersForSubscription,
  reconcileBillingReminders,
} from '@/notifications/billing-notifications';

export function CancelSubscriptionScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [today] = useState(startOfToday);
  const [confirmationDate, setConfirmationDate] = useState(today);
  const [hasAccessEndDate, setHasAccessEndDate] = useState(false);
  const [accessEndDate, setAccessEndDate] = useState(today);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadCancellationPreview(id, localCalendarDate(confirmationDate)))
      .then((next) => {
        if (!active) return;
        setPreview(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Could not prepare cancellation.'));
      });
    return () => {
      active = false;
    };
  }, [confirmationDate, id]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.cancelSubscription({
        subscriptionId: id,
        confirmationDate: localCalendarDate(confirmationDate),
        accessEndDate: hasAccessEndDate ? localCalendarDate(accessEndDate) : null,
      });
      await cancelBillingRemindersForSubscription(id).catch(() => undefined);
      await reconcileBillingReminders().catch(() => undefined);
      router.dismissTo('/(tabs)/(index)');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not cancel this Subscription.'));
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Keep Subscription</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          disabled={saving || !preview}
          onPress={() => void submit()}
          variant="prominent">
          {saving ? 'Saving…' : 'Mark as Canceled'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section
            title={preview?.subscriptionName ?? 'Subscription'}
            footer={<Text>Cancellation stops future Billing Occurrences and reminders.</Text>}>
            <DatePicker
              title="Confirmation Date"
              selection={confirmationDate}
              displayedComponents={['date']}
              range={{ end: today }}
              onDateChange={(date) => {
                const next = atNoon(date);
                setPreview(null);
                setConfirmationDate(next);
                if (accessEndDate < next) setAccessEndDate(next);
              }}
            />
            <Toggle
              label="Access Ends Later"
              isOn={hasAccessEndDate}
              onIsOnChange={setHasAccessEndDate}
            />
            {hasAccessEndDate ? (
              <DatePicker
                title="Access End Date"
                selection={accessEndDate}
                displayedComponents={['date']}
                range={{ start: confirmationDate }}
                onDateChange={(date) => setAccessEndDate(atNoon(date))}
              />
            ) : null}
          </Section>

          {preview?.affectedOccurrences.length ? (
            <Section
              title="Will Be Marked No Charge"
              footer={
                <Text>
                  To record any of these as paid instead, keep the Subscription and resolve them before canceling.
                </Text>
              }>
              {preview.affectedOccurrences.map((occurrence) => (
                <Text key={occurrence.billingDate}>
                  {formatDate(occurrence.billingDate)} · {formatCents(occurrence.expectedAmountCents)}
                </Text>
              ))}
            </Section>
          ) : preview ? (
            <Section>
              <Text>No unresolved Billing Occurrences will be changed.</Text>
            </Section>
          ) : null}

          {error ? (
            <Section>
              <Text modifiers={[foregroundStyle('red')]}>{error}</Text>
            </Section>
          ) : null}
        </Form>
      </Host>
    </>
  );
}

export function EditCancellationDetailsScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [today] = useState(startOfToday);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [confirmationDate, setConfirmationDate] = useState(today);
  const [hasAccessEndDate, setHasAccessEndDate] = useState(false);
  const [accessEndDate, setAccessEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadSubscriptionDetail(id))
      .then((next) => {
        if (next.lifecycle.status !== 'canceled') throw new Error('Subscription is not Canceled.');
        setDetail(next);
        setConfirmationDate(dateFromCalendar(next.lifecycle.cancellationConfirmationDate));
        setHasAccessEndDate(next.lifecycle.accessEndDate !== null);
        setAccessEndDate(
          dateFromCalendar(next.lifecycle.accessEndDate ?? next.lifecycle.cancellationConfirmationDate),
        );
      })
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not load cancellation details.')));
  }, [id]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.editCancellationDetails({
        subscriptionId: id,
        confirmationDate: localCalendarDate(confirmationDate),
        accessEndDate: hasAccessEndDate ? localCalendarDate(accessEndDate) : null,
      });
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update cancellation details.'));
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={saving || !detail} onPress={() => void submit()} variant="prominent">
          {saving ? 'Saving…' : 'Save'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section
            title={detail?.name ?? 'Cancellation Details'}
            footer={<Text>Changing these dates does not alter billing history.</Text>}>
            <DatePicker
              title="Confirmation Date"
              selection={confirmationDate}
              displayedComponents={['date']}
              range={{ end: today }}
              onDateChange={(date) => {
                const next = atNoon(date);
                setConfirmationDate(next);
                if (accessEndDate < next) setAccessEndDate(next);
              }}
            />
            <Toggle
              label="Access Ends Later"
              isOn={hasAccessEndDate}
              onIsOnChange={setHasAccessEndDate}
            />
            {hasAccessEndDate ? (
              <DatePicker
                title="Access End Date"
                selection={accessEndDate}
                displayedComponents={['date']}
                range={{ start: confirmationDate }}
                onDateChange={(date) => setAccessEndDate(atNoon(date))}
              />
            ) : null}
          </Section>
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

export function ReactivateSubscriptionScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [minimumDate] = useState(tomorrow);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [nextBillingDate, setNextBillingDate] = useState(() => clampedNextMonth(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadSubscriptionDetail(id))
      .then((next) => {
        if (next.lifecycle.status !== 'canceled') throw new Error('Subscription is not Canceled.');
        setDetail(next);
      })
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not load this Subscription.')));
  }, [id]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.reactivateSubscription({
        subscriptionId: id,
        nextBillingDate: localCalendarDate(nextBillingDate),
      });
      await reconcileBillingReminders().catch(() => undefined);
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not reactivate this Subscription.'));
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={saving || !detail} onPress={() => void submit()} variant="prominent">
          {saving ? 'Saving…' : 'Reactivate'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section
            title={detail?.name ?? 'Subscription'}
            footer={<Text>Reactivation keeps all existing Payment and No Charge history.</Text>}>
            <DatePicker
              title="Next Billing Date"
              selection={nextBillingDate}
              displayedComponents={['date']}
              range={{ start: minimumDate }}
              onDateChange={(date) => setNextBillingDate(atNoon(date))}
            />
          </Section>
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

export function PauseSubscriptionScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [today] = useState(startOfToday);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [hasPauseEndDate, setHasPauseEndDate] = useState(false);
  const [pauseEndDate, setPauseEndDate] = useState(tomorrow);
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadSubscriptionDetail(id))
      .then((next) => {
        if (next.lifecycle.status !== 'active') throw new Error('Only an Active Subscription can be paused.');
        setDetail(next);
      })
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not load this Subscription.')));
  }, [id]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.pauseSubscription({
        subscriptionId: id,
        effectiveDate: localCalendarDate(effectiveDate),
        pauseEndDate: hasPauseEndDate ? localCalendarDate(pauseEndDate) : null,
      });
      await cancelBillingRemindersForSubscription(id).catch(() => undefined);
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not pause this Subscription.'));
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left"><Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button></Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={saving || !detail} onPress={() => void submit()} variant="prominent">
          {saving ? 'Saving…' : 'Pause'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title={detail?.name ?? 'Subscription'} footer={<Text>No Billing Occurrences or reminders are produced while paused.</Text>}>
            <DatePicker
              title="Effective Date"
              selection={effectiveDate}
              displayedComponents={['date']}
              range={{ end: today }}
              onDateChange={(date) => {
                const next = atNoon(date);
                setEffectiveDate(next);
                if (pauseEndDate <= next) {
                  const end = new Date(next);
                  end.setDate(end.getDate() + 1);
                  setPauseEndDate(atNoon(end));
                }
              }}
            />
            <Toggle label="Plan Resume Date" isOn={hasPauseEndDate} onIsOnChange={setHasPauseEndDate} />
            {hasPauseEndDate ? (
              <DatePicker
                title="Resume Date"
                selection={pauseEndDate}
                displayedComponents={['date']}
                range={{ start: dayAfter(effectiveDate) }}
                onDateChange={(date) => setPauseEndDate(atNoon(date))}
              />
            ) : null}
          </Section>
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

export function ResumeSubscriptionScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [minimumDate] = useState(tomorrow);
  const [nextBillingDate, setNextBillingDate] = useState(() => clampedNextMonth(new Date()));
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadSubscriptionDetail(id))
      .then((next) => {
        if (next.lifecycle.status !== 'paused') throw new Error('Only a Paused Subscription can be resumed.');
        setDetail(next);
      })
      .catch((caught: unknown) => setError(errorMessage(caught, 'Could not load this Subscription.')));
  }, [id]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.resumeSubscription({ subscriptionId: id, nextBillingDate: localCalendarDate(nextBillingDate) });
      await reconcileBillingReminders().catch(() => undefined);
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not resume this Subscription.'));
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left"><Stack.Toolbar.Button onPress={() => router.back()}>Cancel</Stack.Toolbar.Button></Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={saving || !detail} onPress={() => void submit()} variant="prominent">
          {saving ? 'Saving…' : 'Resume'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section title={detail?.name ?? 'Subscription'} footer={<Text>Resuming establishes a new billing schedule and Billing Anchor Day.</Text>}>
            <DatePicker
              title="Next Billing Date"
              selection={nextBillingDate}
              displayedComponents={['date']}
              range={{ start: minimumDate }}
              onDateChange={(date) => setNextBillingDate(atNoon(date))}
            />
          </Section>
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

function dateFromCalendar(value: string): Date {
  const { year, month, day } = calendarParts(calendarDate(value));
  return new Date(year, month - 1, day, 12);
}

function startOfToday(): Date {
  return atNoon(new Date());
}

function tomorrow(): Date {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

function dayAfter(value: Date): Date {
  const date = atNoon(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function atNoon(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function clampedNextMonth(value: Date): Date {
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = month % 12;
  return new Date(
    targetYear,
    targetMonth,
    Math.min(value.getDate(), daysInMonth(targetYear, targetMonth + 1)),
    12,
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(dateFromCalendar(value));
}

function formatCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
