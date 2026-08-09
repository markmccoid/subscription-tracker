import { Form, Host, Picker, Section, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import { foregroundStyle, lineLimit, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { BillingOccurrenceDetail } from '@/application/subscription-tracker';
import type { SubscriptionId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';

type ReasonChoice = 'none' | 'canceledBeforeRenewal' | 'trialRemainedFree' | 'providerWaivedCharge' | 'other';

const reasonLabels: Record<Exclude<ReasonChoice, 'none' | 'other'>, string> = {
  canceledBeforeRenewal: 'Canceled before renewal',
  trialRemainedFree: 'Trial remained free',
  providerWaivedCharge: 'Provider waived charge',
};

export function RecordNoChargeScreen({
  subscriptionId,
  billingDate,
}: {
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const noteState = useNativeState('');
  const [detail, setDetail] = useState<BillingOccurrenceDetail | null>(null);
  const [reason, setReason] = useState<ReasonChoice>('none');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSubscriptionTracker()
      .then((tracker) => tracker.loadBillingOccurrenceDetail(subscriptionId, billingDate))
      .then((next) => {
        if (!active) return;
        if (next.resolution.kind !== 'unresolved') throw new Error('Billing Occurrence has already been resolved.');
        setDetail(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load this Billing Occurrence.');
      });
    return () => {
      active = false;
    };
  }, [billingDate, subscriptionId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const tracker = await getSubscriptionTracker();
      await tracker.recordNoCharge({ subscriptionId, billingDate, reason: reasonText(reason, note) });
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record No Charge.');
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
        <Stack.Toolbar.Button disabled={saving || !detail} onPress={() => void save()} variant="prominent">
          {saving ? 'Saving…' : 'Save'}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} seedColor={theme.accent}>
        <Form>
          <Section
            title={detail?.subscriptionName ?? 'No Charge'}
            footer={<Text>This resolves only the Billing Occurrence on {billingDate}. The Subscription’s future schedule will not change.</Text>}>
            <Picker<ReasonChoice> label="Reason" selection={reason} onSelectionChange={setReason}>
              <Text modifiers={[tag('none')]}>Not specified</Text>
              <Text modifiers={[tag('canceledBeforeRenewal')]}>Canceled before renewal</Text>
              <Text modifiers={[tag('trialRemainedFree')]}>Trial remained free</Text>
              <Text modifiers={[tag('providerWaivedCharge')]}>Provider waived charge</Text>
              <Text modifiers={[tag('other')]}>Other</Text>
            </Picker>
            {reason === 'other' ? (
              <TextField
                text={noteState}
                placeholder="Optional note"
                axis="vertical"
                maxLength={480}
                onTextChange={setNote}
                modifiers={[lineLimit({ min: 2, max: 5 })]}
              />
            ) : null}
          </Section>
          {error ? <Section><Text modifiers={[foregroundStyle('red')]}>{error}</Text></Section> : null}
        </Form>
      </Host>
    </>
  );
}

function reasonText(reason: ReasonChoice, note: string): string | null {
  if (reason === 'none') return null;
  if (reason === 'other') return note.trim() ? `Other: ${note.trim()}` : 'Other';
  return reasonLabels[reason];
}
