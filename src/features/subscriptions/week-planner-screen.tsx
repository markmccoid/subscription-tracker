import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type { WeekPlannerProjection, WeekPlannerWeek } from '@/application/subscription-tracker';
import type { SubscriptionId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';
import { reconcileBillingReminders } from '@/notifications/billing-notifications';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function WeekPlannerScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [planner, setPlanner] = useState<WeekPlannerProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tracker = await getSubscriptionTracker();
      setPlanner(await tracker.loadWeekPlanner(id));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the Week Planner.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (week: WeekPlannerWeek, skipped: boolean) => {
    if (!planner || week.skipped === skipped) return;
    // Optimistic: the toggle is the whole interaction, so it must not wait on persistence.
    setPlanner(withWeekSkipped(planner, week.billingDate, skipped));
    try {
      const tracker = await getSubscriptionTracker();
      const command = { subscriptionId: id, billingDate: week.billingDate };
      await (skipped ? tracker.skipWeek(command) : tracker.unskipWeek(command));
      await reconcileBillingReminders().catch(() => undefined);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this week.');
    }
    await load();
  };

  if (!planner && !error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Done</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        {error ? <Text selectable style={{ color: theme.danger }}>{error}</Text> : null}
        {planner ? (
          <>
            <View style={styles.header}>
              <Text selectable style={[styles.title, { color: theme.text }]}>{planner.name}</Text>
              <Text selectable style={[styles.subtitle, { color: theme.textSecondary }]}>
                Delivers {planner.weekday}s · {formatCents(planner.perWeekAmountCents)} per week
              </Text>
            </View>

            {groupWeeksByMonth(planner.weeks).map(([month, weeks]) => (
              <View key={month} style={styles.section}>
                <Text selectable style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                  {month.toUpperCase()}
                </Text>
                <View style={[styles.rowGroup, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  {weeks.map((week, index) => (
                    <View key={week.billingDate}>
                      <WeekRow week={week} onToggle={(skipped) => void toggle(week, skipped)} />
                      {index < weeks.length - 1 ? (
                        <View style={[styles.rowSeparator, { backgroundColor: theme.border }]} />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <View style={[styles.summary, { backgroundColor: theme.weeklySoft, borderColor: theme.weekly }]}>
              <Text selectable style={[styles.summaryLabel, { color: theme.weekly }]}>NEXT 30 DAYS</Text>
              <Text selectable style={[styles.summaryValue, { color: theme.text }]}>
                {planner.next30DaysDeliveries} {planner.next30DaysDeliveries === 1 ? 'delivery' : 'deliveries'}
                {' · '}
                {formatCents(planner.next30DaysCents)}
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function WeekRow({
  week,
  onToggle,
}: {
  readonly week: WeekPlannerWeek;
  readonly onToggle: (skipped: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.weekRow}>
      <View style={styles.weekDetails}>
        <Text
          selectable
          style={[styles.weekDate, { color: week.skipped ? theme.textSecondary : theme.text }]}>
          {formatDate(week.billingDate)}
        </Text>
        <Text selectable style={[styles.weekHint, { color: theme.textSecondary }]}>
          {weekHint(week)}
        </Text>
      </View>
      <View style={[styles.segmented, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <SegmentButton
          label="Deliver"
          selected={!week.skipped}
          disabled={!week.togglable}
          onPress={() => onToggle(false)}
        />
        <SegmentButton
          label="Skip"
          selected={week.skipped}
          disabled={!week.togglable}
          onPress={() => onToggle(true)}
        />
      </View>
    </View>
  );
}

function SegmentButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        selected ? { backgroundColor: theme.weekly } : null,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <Text
        style={[
          styles.segmentText,
          { color: selected ? theme.background : theme.textSecondary },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function withWeekSkipped(
  planner: WeekPlannerProjection,
  billingDate: string,
  skipped: boolean,
): WeekPlannerProjection {
  const weeks = planner.weeks.map((week) =>
    week.billingDate === billingDate ? { ...week, skipped } : week,
  );
  const delta = skipped ? -1 : 1;
  const amount = planner.weeks.find((week) => week.billingDate === billingDate)?.amountCents ?? 0;
  return {
    ...planner,
    weeks,
    next30DaysDeliveries: planner.next30DaysDeliveries + delta,
    next30DaysCents: planner.next30DaysCents + delta * amount,
  };
}

function groupWeeksByMonth(
  weeks: readonly WeekPlannerWeek[],
): readonly (readonly [string, readonly WeekPlannerWeek[]])[] {
  const months = new Map<string, WeekPlannerWeek[]>();
  for (const week of weeks) {
    const label = formatMonth(week.billingDate);
    const bucket = months.get(label);
    if (bucket) bucket.push(week);
    else months.set(label, [week]);
  }
  return [...months.entries()];
}

function weekHint(week: WeekPlannerWeek): string {
  if (!week.togglable) return 'Already billed';
  if (week.skipped) return 'Skipped · no charge';
  const days = calendarDaysFromToday(week.billingDate);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function formatCents(value: number): string {
  return money.format(value / 100);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(year, month - 1, day, 12),
  );
}

function formatMonth(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month - 1, day, 12));
}

function calendarDaysFromToday(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(year, month - 1, day) - todayUtc) / 86_400_000);
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingBottom: 60, gap: 20 },
  header: { gap: 4 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 15 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  rowGroup: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  rowSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  weekRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  weekDetails: { flex: 1, minWidth: 0, gap: 3 },
  weekDate: { fontSize: 16, fontWeight: '700' },
  weekHint: { fontSize: 13 },
  segmented: {
    flexShrink: 0,
    flexDirection: 'row',
    padding: 2,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  segment: {
    minHeight: 30,
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  segmentText: { fontSize: 13, fontWeight: '700' },
  summary: {
    padding: 16,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  summaryLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  summaryValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
