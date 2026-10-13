import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type {
  DashboardProjection,
  UpcomingCharge,
  UpcomingChargeGroupKey,
} from '@/application/subscription-tracker';
import { useTheme } from '@/hooks/use-theme';
import { reconcileBillingReminders } from '@/notifications/billing-notifications';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const groupLabels: Record<UpcomingChargeGroupKey, string> = {
  actionNeeded: 'Action Needed',
  next7Days: 'Next 7 Days',
  laterThisMonth: 'Later This Month',
  later: 'Later',
};

export function SubscriptionDashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const tracker = await getSubscriptionTracker();
      setDashboard(await tracker.loadDashboard());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the Household List.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const planWeek = async (charge: UpcomingCharge, skipped: boolean) => {
    try {
      const tracker = await getSubscriptionTracker();
      const command = { subscriptionId: charge.subscriptionId, billingDate: charge.billingDate };
      await (skipped ? tracker.skipWeek(command) : tracker.unskipWeek(command));
      await reconcileBillingReminders().catch(() => undefined);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this week.');
    }
  };

  const openWeekMenu = (charge: UpcomingCharge) => {
    Alert.alert(charge.name, formatDate(charge.billingDate), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Skip this week', onPress: () => void planWeek(charge, true) },
      {
        text: 'Plan weeks…',
        onPress: () =>
          router.push({
            pathname: '/plan-weeks/[id]',
            params: { id: charge.subscriptionId },
          } as unknown as Href),
      },
    ]);
  };

  if (!dashboard && !error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      contentContainerStyle={styles.content}>

      {error ? <Text selectable style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

      {dashboard ? (
        <>
          <View style={[styles.metricCard, { backgroundColor: theme.accent, boxShadow: `0 10px 22px ${theme.accent}33` }]}>
            <Metric label="MONTHLY COMMITMENT" value={formatCents(dashboard.monthlyCommitmentCents)} foreground={theme.accentForeground} />
            <View style={styles.metricDivider} />
            <Metric label="NEXT 30 DAYS" value={formatCents(dashboard.dueNext30DaysCents)} foreground={theme.accentForeground} />
          </View>

          <View style={styles.timeline}>
            {dashboard.upcomingChargeGroups.length === 0 ? (
              <View
                style={[styles.emptyState, { backgroundColor: theme.backgroundElement }]}
              >
                <Text selectable style={[styles.emptyTitle, { color: theme.text }]}>No subscriptions yet</Text>
                <Text selectable style={[styles.emptyBody, { color: theme.textSecondary }]}>
                  Add the first recurring commitment to begin projecting upcoming charges.
                </Text>
              </View>
            ) : (
              dashboard.upcomingChargeGroups.map((group) => (
                <View key={group.key} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text
                      selectable
                      style={[
                        styles.sectionTitle,
                        { color: group.key === 'actionNeeded' ? theme.danger : theme.textSecondary },
                      ]}>
                      {groupLabels[group.key].toUpperCase()}
                    </Text>
                    <Text
                      selectable
                      style={[styles.sectionTotal, { color: theme.textSecondary }]}
                    >
                      {formatCents(group.charges.reduce(
                        (total, charge) => total + (charge.skipped ? 0 : charge.amountCents),
                        0,
                      ))}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.rowGroup,
                      {
                        backgroundColor: groupBackground(group.key, theme),
                        borderColor: theme.border,
                      },
                    ]}>
                    {group.charges.map((charge, index) => (
                      <View key={`${charge.subscriptionId}:${charge.billingDate}`}>
                        <ChargeRow
                          charge={charge}
                          groupKey={group.key}
                          onPress={() => router.push({
                            pathname: '/(tabs)/(index)/occurrence/[subscriptionId]/[billingDate]',
                            params: {
                              subscriptionId: charge.subscriptionId,
                              billingDate: charge.billingDate,
                            },
                          } as unknown as Href)}
                          onLongPress={
                            charge.cycle === 'weekly' && group.key !== 'actionNeeded'
                              ? () => openWeekMenu(charge)
                              : undefined
                          }
                          onResume={() => void planWeek(charge, false)}
                        />
                        {index < group.charges.length - 1 ? (
                          <View style={[styles.rowSeparator, { backgroundColor: theme.border }]} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function ChargeRow({
  charge,
  groupKey,
  onPress,
  onLongPress,
  onResume,
}: {
  readonly charge: UpcomingCharge;
  readonly groupKey: UpcomingChargeGroupKey;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  readonly onResume: () => void;
}) {
  const theme = useTheme();
  if (charge.skipped) return <SkippedChargeRow charge={charge} onResume={onResume} />;
  const weekly = charge.cycle === 'weekly';
  const urgent = groupKey === 'actionNeeded';
  const nearTerm = groupKey === 'next7Days';
  const daysUntilRenewal = nearTerm ? calendarDaysFromToday(charge.billingDate) : null;
  const renewalIsClose = daysUntilRenewal !== null && daysUntilRenewal < 4;
  const warmForeground = theme.scheme === 'dark' ? '#FFBF69' : '#9A5700';
  const accent = urgent || renewalIsClose
    ? theme.danger
    : weekly
      ? theme.weekly
      : nearTerm
        ? warmForeground
        : theme.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nearTerm
        ? `${charge.name}, ${formatCents(charge.amountCents)}, renews ${renewalDistanceLabel(daysUntilRenewal!)}`
        : undefined}
      accessibilityHint={onLongPress ? 'Touch and hold to skip this week or plan upcoming weeks.' : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.chargeRow,
        renewalIsClose ? { backgroundColor: `${theme.danger}1F` } : null,
        { opacity: pressed ? 0.62 : 1 },
      ]}>
      {weekly ? <View style={[styles.weeklyStripe, { backgroundColor: theme.weekly }]} /> : null}
      <View style={[styles.monogram, { backgroundColor: `${accent}22` }]}>
        <Text style={[styles.monogramText, { color: accent }]}>{charge.name.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.chargeDetails}>
        <View style={styles.chargeNameRow}>
          <Text selectable numberOfLines={1} style={[styles.chargeName, { color: theme.text }]}>{charge.name}</Text>
          {weekly ? (
            <View style={[styles.weeklyChip, { backgroundColor: theme.weeklySoft }]}>
              <Text style={[styles.weeklyChipText, { color: theme.weekly }]}>WEEKLY</Text>
            </View>
          ) : null}
        </View>
        <Text selectable numberOfLines={1} style={[styles.chargeDate, { color: theme.textSecondary }]}>
          {urgent
            ? `Due ${formatDate(charge.billingDate)}`
            : weekly
              ? `${formatDate(charge.billingDate)} · Delivery week`
              : formatDate(charge.billingDate)}
        </Text>
      </View>
      <View style={styles.chargeSummary}>
        <Text selectable numberOfLines={1} style={[styles.chargeAmount, { color: theme.text }]}>{formatCents(charge.amountCents)}</Text>
        {daysUntilRenewal !== null ? (
          <View
            style={[
              styles.renewalBadge,
              { backgroundColor: renewalIsClose ? `${theme.danger}26` : `${warmForeground}1F` },
            ]}>
            <Text
              selectable
              style={[
                styles.renewalBadgeText,
                { color: renewalIsClose ? theme.danger : warmForeground },
              ]}>
              {renewalDistanceLabel(daysUntilRenewal).toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.disclosure, { color: theme.textSecondary }]}>›</Text>
    </Pressable>
  );
}

/** A planned Skipped Week: no charge is expected, and one tap returns the week to delivering. */
function SkippedChargeRow({
  charge,
  onResume,
}: {
  readonly charge: UpcomingCharge;
  readonly onResume: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${charge.name}, skipped week, ${formatDate(charge.billingDate)}`}
      style={[styles.chargeRow, styles.skippedRow, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.weeklyStripe, { backgroundColor: theme.weekly, opacity: 0.4 }]} />
      <View style={[styles.monogram, { backgroundColor: `${theme.textSecondary}1A` }]}>
        <Text style={[styles.monogramText, { color: theme.textSecondary }]}>
          {charge.name.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.chargeDetails}>
        <Text selectable numberOfLines={1} style={[styles.chargeName, { color: theme.textSecondary }]}>
          {charge.name}
        </Text>
        <Text selectable numberOfLines={1} style={[styles.chargeDate, { color: theme.textSecondary }]}>
          {formatDate(charge.billingDate)} · Skipped week
        </Text>
      </View>
      <View style={styles.chargeSummary}>
        <Text
          selectable
          numberOfLines={1}
          style={[styles.chargeAmount, styles.skippedAmount, { color: theme.textSecondary }]}>
          {formatCents(charge.amountCents)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Resume ${charge.name} on ${formatDate(charge.billingDate)}`}
          onPress={onResume}
          hitSlop={8}
          style={({ pressed }) => [
            styles.resumePill,
            { borderColor: theme.weekly, opacity: pressed ? 0.6 : 1 },
          ]}>
          <Text style={[styles.resumePillText, { color: theme.weekly }]}>RESUME</Text>
        </Pressable>
      </View>
    </View>
  );
}

function groupBackground(
  key: UpcomingChargeGroupKey,
  theme: ReturnType<typeof useTheme>,
): string {
  if (key === 'actionNeeded') return `${theme.danger}14`;
  if (key === 'next7Days') return theme.scheme === 'dark' ? '#352B1D' : '#FFF8EA';
  return theme.backgroundElement;
}

function Metric({ label, value, foreground }: { readonly label: string; readonly value: string; readonly foreground: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: foreground, opacity: 0.82 }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: foreground }]}>{value}</Text>
    </View>
  );
}

function formatCents(value: number): string {
  return money.format(value / 100);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(year, month - 1, day, 12),
  );
}

function calendarDaysFromToday(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const renewalUtc = Date.UTC(year, month - 1, day);
  return Math.round((renewalUtc - todayUtc) / 86_400_000);
}

function renewalDistanceLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 140, gap: 22 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 15 },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 28,
    padding: 20,
  },
  metric: { flex: 1, gap: 7 },
  metricDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: 16, backgroundColor: '#FFFFFF55' },
  metricLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  metricValue: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeline: { gap: 22 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  sectionTotal: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  emptyState: { padding: 24, gap: 6, borderRadius: 22 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 15, lineHeight: 21 },
  rowGroup: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 70,
  },
  chargeRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  weeklyStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  weeklyChip: { flexShrink: 0, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  weeklyChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  skippedRow: { opacity: 0.85 },
  skippedAmount: { textDecorationLine: 'line-through', fontWeight: '600' },
  resumePill: {
    flexShrink: 0,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  resumePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  monogram: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontSize: 14, fontWeight: '800' },
  chargeDetails: { flex: 1, minWidth: 0, gap: 3 },
  chargeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chargeName: { flexShrink: 1, fontSize: 16, fontWeight: '700' },
  chargeDate: { fontSize: 13 },
  chargeSummary: { flexShrink: 0, alignItems: 'flex-end', gap: 5 },
  chargeAmount: { flexShrink: 0, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  renewalBadge: { minHeight: 20, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 10 },
  renewalBadgeText: { fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  disclosure: { flexShrink: 0, fontSize: 24, fontWeight: '300', lineHeight: 26 },
});
