import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { BillingOccurrenceDetail } from '@/application/subscription-tracker';
import type { SubscriptionId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSubscriptionTracker()
        .then((tracker) => tracker.loadBillingOccurrenceDetail(subscriptionId, billingDate))
        .then((next) => {
          if (!active) return;
          setDetail(next);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Could not load this Billing Occurrence.');
        });
      return () => {
        active = false;
      };
    }, [billingDate, subscriptionId]),
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

          {detail.resolution.kind === 'unresolved' ? (
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
