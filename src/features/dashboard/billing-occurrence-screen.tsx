import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { BillingOccurrenceDetail } from '@/application/subscription-tracker';
import type { SkippedWeekId, SubscriptionId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';
import { reconcileBillingReminders } from '@/notifications/billing-notifications';

export function BillingOccurrenceScreen({
  subscriptionId,
  billingDate,
}: {
  readonly subscriptionId: SubscriptionId;
  readonly billingDate: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [detail, setDetail] = useState<BillingOccurrenceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tracker = await getSubscriptionTracker();
      setDetail(await tracker.loadBillingOccurrenceDetail(subscriptionId, billingDate));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this Billing Occurrence.');
    }
  }, [billingDate, subscriptionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!detail && !error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      {error ? <Text selectable style={{ color: theme.danger }}>{error}</Text> : null}
      {detail ? (
        <>
          <View style={[styles.hero, { backgroundColor: theme.backgroundElement }]}>
            <Text selectable style={[styles.name, { color: theme.text }]}>{detail.subscriptionName}</Text>
            <Text selectable style={[styles.amount, { color: theme.text }]}>{formatCents(detail.expectedAmountCents)}</Text>
            <Text selectable style={[styles.date, { color: theme.textSecondary }]}>Expected {formatDate(detail.billingDate)}</Text>
          </View>

          {skipGeneratedWeekId(detail) ? (
            <SkippedWeekResolution
              skippedWeekId={skipGeneratedWeekId(detail)!}
              onRemoved={load}
              onError={setError}
            />
          ) : detail.resolution.kind === 'unresolved' ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({
                  pathname: '/record-payment/[subscriptionId]/[billingDate]',
                  params: { subscriptionId, billingDate },
                } as unknown as Href)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.accent, opacity: pressed ? 0.72 : 1 },
                ]}>
                <Text style={[styles.primaryButtonText, { color: theme.accentForeground }]}>Record Payment</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({
                  pathname: '/record-no-charge/[subscriptionId]/[billingDate]',
                  params: { subscriptionId, billingDate },
                } as unknown as Href)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 },
                ]}>
                <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>No Charge</Text>
              </Pressable>
              <Text selectable style={[styles.explanation, { color: theme.textSecondary }]}>No Charge resolves only this expected charge. It does not change the Subscription’s future schedule.</Text>
            </View>
          ) : (
            <ResolutionCard detail={detail} />
          )}

          {detail.cancellationUrl || detail.canCancelSubscription ? (
            <View style={styles.actions}>
              {detail.cancellationUrl ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => {
                    void Linking.openURL(detail.cancellationUrl!).catch((caught: unknown) =>
                      setError(caught instanceof Error ? caught.message : 'Could not open the Cancellation Website.'),
                    );
                  }}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 },
                  ]}>
                  <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>Open Cancellation Website</Text>
                </Pressable>
              ) : null}
              {detail.canCancelSubscription ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/cancel-subscription/[id]', params: { id: detail.subscriptionId } })}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: theme.danger, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 },
                  ]}>
                  <Text style={[styles.secondaryButtonText, { color: theme.danger }]}>Mark as Canceled</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/(tabs)/(subscriptions)/[id]', params: { id: detail.subscriptionId } })}
            style={({ pressed }) => [styles.subscriptionLink, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 }]}>
            <Text style={[styles.linkLabel, { color: theme.text }]}>View Subscription</Text>
            <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

function skipGeneratedWeekId(detail: BillingOccurrenceDetail): SkippedWeekId | null {
  return detail.resolution.kind === 'noCharge' ? detail.resolution.generatedBySkippedWeekId : null;
}

/** A week the user planned as skipped, with the reconciliation path for "they charged me anyway". */
function SkippedWeekResolution({
  skippedWeekId,
  onRemoved,
  onError,
}: {
  readonly skippedWeekId: SkippedWeekId;
  readonly onRemoved: () => Promise<void>;
  readonly onError: (message: string) => void;
}) {
  const theme = useTheme();
  const confirmRemove = () => {
    Alert.alert(
      'Remove Skip?',
      'This week will return to Action Needed so you can record what actually happened.',
      [
        { text: 'Keep Skip', style: 'cancel' },
        {
          text: 'Remove Skip',
          style: 'destructive',
          onPress: () => {
            void getSubscriptionTracker()
              .then((tracker) => tracker.removeMaterializedSkip({ skippedWeekId }))
              .then(() => reconcileBillingReminders().catch(() => undefined))
              .then(() => onRemoved())
              .catch((caught: unknown) =>
                onError(caught instanceof Error ? caught.message : 'Could not remove this skip.'),
              );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.actions}>
      <View style={[styles.resolutionCard, { backgroundColor: theme.backgroundElement }]}>
        <Text selectable style={[styles.resolutionTitle, { color: theme.text }]}>
          Not charged · Skipped week
        </Text>
        <Text selectable style={[styles.explanation, { color: theme.textSecondary }]}>
          You planned this delivery week as skipped, so no charge was expected.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={confirmRemove}
        style={({ pressed }) => [
          styles.secondaryButton,
          { borderColor: theme.danger, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.72 : 1 },
        ]}>
        <Text style={[styles.secondaryButtonText, { color: theme.danger }]}>Remove Skip</Text>
      </Pressable>
    </View>
  );
}

function ResolutionCard({ detail }: { readonly detail: BillingOccurrenceDetail }) {
  const theme = useTheme();
  const resolution = detail.resolution;
  if (resolution.kind === 'unresolved') return null;
  return (
    <View style={[styles.resolutionCard, { backgroundColor: theme.backgroundElement }]}>
      <Text selectable style={[styles.resolutionTitle, { color: theme.text }]}>
        {resolution.kind === 'paid' ? 'Payment Recorded' : 'No Charge Recorded'}
      </Text>
      {resolution.kind === 'paid' ? (
        <>
          <DetailRow label="Amount" value={formatCents(resolution.amountCents)} />
          <DetailRow label="Payment Date" value={formatDate(resolution.paymentDate)} />
          {resolution.paymentMethodName ? <DetailRow label="Payment Method" value={resolution.paymentMethodName} /> : null}
          {resolution.note ? <DetailRow label="Note" value={resolution.note} /> : null}
        </>
      ) : (
        <DetailRow label="Reason" value={resolution.reason ?? 'Not specified'} />
      )}
    </View>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text selectable style={{ color: theme.textSecondary }}>{label}</Text>
      <Text selectable style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function formatCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(year, month - 1, day, 12));
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingBottom: 80, gap: 18 },
  hero: { padding: 24, borderRadius: 24, gap: 6, borderCurve: 'continuous' },
  name: { fontSize: 20, fontWeight: '700' },
  amount: { fontSize: 38, fontWeight: '800', fontVariant: ['tabular-nums'] },
  date: { fontSize: 15 },
  actions: { gap: 12 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderCurve: 'continuous' },
  primaryButtonText: { fontSize: 17, fontWeight: '700' },
  secondaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, borderCurve: 'continuous' },
  secondaryButtonText: { fontSize: 17, fontWeight: '700' },
  explanation: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  resolutionCard: { padding: 20, borderRadius: 20, gap: 12, borderCurve: 'continuous' },
  resolutionTitle: { fontSize: 18, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  detailValue: { flex: 1, textAlign: 'right', fontWeight: '600' },
  subscriptionLink: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderRadius: 16, borderCurve: 'continuous' },
  linkLabel: { fontSize: 16, fontWeight: '600' },
  chevron: { marginLeft: 'auto', fontSize: 28, fontWeight: '300' },
});
