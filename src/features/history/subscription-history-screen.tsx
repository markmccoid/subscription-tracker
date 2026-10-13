import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, Text, View } from 'react-native';

import { getSubscriptionTracker } from '@/application/create-subscription-tracker';
import type {
  HistoryActivityItem,
  HistoryCategoryFilter,
  HistoryProjection,
} from '@/application/subscription-tracker';
import type { CategoryId, SubscriptionId } from '@/domain/model';
import { useTheme } from '@/hooks/use-theme';

type Period = 'month' | 'year' | 'all' | 'custom';
type BreakdownMode = 'category' | 'subscription';
type ActivityFilter = HistoryActivityItem['kind'] | 'all' | 'lifecycle';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const periodOptions = [
  { value: 'month' as const, label: 'This Month' },
  { value: 'year' as const, label: 'This Year' },
  { value: 'all' as const, label: 'All Time' },
  { value: 'custom' as const, label: 'Custom' },
];
const activityOptions = [
  { value: 'all' as const, label: 'All Activity' },
  { value: 'payment' as const, label: 'Payments' },
  { value: 'noCharge' as const, label: 'No Charge' },
  { value: 'lifecycle' as const, label: 'Lifecycle' },
];

export function SubscriptionHistoryScreen({
  customFrom,
  customTo,
}: {
  readonly customFrom?: string;
  readonly customTo?: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(customFrom && customTo ? 'custom' : 'year');
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>('category');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [subscriptionId, setSubscriptionId] = useState<SubscriptionId | null>(null);
  const [categoryId, setCategoryId] = useState<HistoryCategoryFilter>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [projection, setProjection] = useState<HistoryProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => historyRange(period, customFrom, customTo),
    [customFrom, customTo, period],
  );


  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void getSubscriptionTracker()
        .then((tracker) => tracker.loadHistory({
          from: range.from,
          to: range.to,
          subscriptionId,
          categoryId,
          search,
        }))
        .then((next) => {
          if (!active) return;
          setProjection(next);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Could not load History.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [categoryId, range.from, range.to, search, subscriptionId]),
  );

  const activities = useMemo(() => {
    const items = projection?.activities ?? [];
    if (activityFilter === 'all') return items;
    if (activityFilter === 'lifecycle') {
      return items.filter((item) => !['payment', 'noCharge'].includes(item.kind));
    }
    return items.filter((item) => item.kind === activityFilter);
  }, [activityFilter, projection?.activities]);
  const sections = useMemo(() => groupActivities(activities), [activities]);

  const selectPeriod = (next: Period) => {
    if (next === 'custom') {
      router.push({
        pathname: '/history-range' as never,
        params: { from: range.from ?? '', to: range.to ?? localDate(new Date()) },
      });
      return;
    }
    setPeriod(next);
  };

  return (
    <>
      <Stack.SearchBar
        placeholder="Search Subscriptions"
        hideWhenScrolling
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
      />
      {loading && !projection ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1, backgroundColor: theme.background }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, gap: 10 }}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={{ gap: 14, paddingBottom: 8 }}>
              <FilterRow options={periodOptions} selected={period} onSelect={selectPeriod} />
              <SpendCard projection={projection} theme={theme} />
              <BreakdownCard
                projection={projection}
                mode={breakdownMode}
                onModeChange={setBreakdownMode}
                expanded={expanded}
                onToggleExpanded={(id) => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
                onSelectSubscription={(id) => {
                  setSubscriptionId(id);
                  setCategoryId(null);
                }}
                onSelectCategory={(id) => {
                  setCategoryId(id ?? 'uncategorized');
                  setSubscriptionId(null);
                }}
                theme={theme}
              />
              <View style={{ gap: 9 }}>
                <FilterRow options={activityOptions} selected={activityFilter} onSelect={setActivityFilter} />
                {projection?.subscriptionOptions.length ? (
                  <FilterRow
                    options={[
                      { value: 'all', label: 'Every Subscription' },
                      ...projection.subscriptionOptions.map((item) => ({ value: item.id, label: item.name })),
                    ]}
                    selected={subscriptionId ?? 'all'}
                    onSelect={(value) => setSubscriptionId(value === 'all' ? null : value as SubscriptionId)}
                  />
                ) : null}
                {projection?.categoryOptions.length ? (
                  <FilterRow
                    options={[
                      { value: 'all', label: 'Every Category' },
                      ...projection.categoryOptions.map((item) => ({
                        value: item.id ?? 'uncategorized',
                        label: item.name,
                      })),
                    ]}
                    selected={categoryId ?? 'all'}
                    onSelect={(value) => setCategoryId(
                      value === 'all' ? null : value === 'uncategorized' ? 'uncategorized' : value as CategoryId,
                    )}
                  />
                ) : null}
                {subscriptionId || categoryId ? (
                  <Pressable onPress={() => { setSubscriptionId(null); setCategoryId(null); }}>
                    <Text selectable style={{ color: theme.accent, fontWeight: '700' }}>Clear breakdown filter</Text>
                  </Pressable>
                ) : null}
              </View>
              {projection?.actionNeededCount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/(tabs)/(index)')}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    padding: 16,
                    borderRadius: 18,
                    borderCurve: 'continuous',
                    backgroundColor: theme.accentMuted,
                  })}
                >
                  <Text selectable style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>
                    {projection.actionNeededCount} {projection.actionNeededCount === 1 ? 'charge needs' : 'charges need'} attention
                  </Text>
                  <Text selectable style={{ color: theme.textSecondary, paddingTop: 3 }}>
                    Resolve overdue Billing Occurrences from Upcoming.
                  </Text>
                </Pressable>
              ) : null}
              {error ? <Text selectable style={{ color: theme.danger }}>{error}</Text> : null}
              <Text selectable style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingTop: 4 }}>
                Activity
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={{ padding: 26, alignItems: 'center', gap: 6 }}>
              <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>No matching activity</Text>
              <Text selectable style={{ color: theme.textSecondary, textAlign: 'center' }}>
                Try another period or clear a filter.
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text selectable style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, paddingTop: 12, paddingBottom: 4 }}>
              {formatMonth(section.title).toUpperCase()}
            </Text>
          )}
          renderItem={({ item }) => <ActivityRow item={item} theme={theme} />}
        />
      )}
    </>
  );
}

function SpendCard({ projection, theme }: { readonly projection: HistoryProjection | null; readonly theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ padding: 20, gap: 6, borderRadius: 24, borderCurve: 'continuous', backgroundColor: theme.backgroundElement }}>
      <Text selectable style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.7 }}>RECORDED SPEND</Text>
      <Text selectable style={{ color: theme.text, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {money.format((projection?.recordedSpendCents ?? 0) / 100)}
      </Text>
      <Text selectable style={{ color: theme.textSecondary }}>
        {projection?.noChargeCount ?? 0} {(projection?.noChargeCount ?? 0) === 1 ? 'occurrence' : 'occurrences'} not charged
      </Text>
    </View>
  );
}

function BreakdownCard({ projection, mode, onModeChange, expanded, onToggleExpanded, onSelectSubscription, onSelectCategory, theme }: {
  readonly projection: HistoryProjection | null;
  readonly mode: BreakdownMode;
  readonly onModeChange: (value: BreakdownMode) => void;
  readonly expanded: ReadonlySet<string>;
  readonly onToggleExpanded: (id: string) => void;
  readonly onSelectSubscription: (id: SubscriptionId) => void;
  readonly onSelectCategory: (id: CategoryId | null) => void;
  readonly theme: ReturnType<typeof useTheme>;
}) {
  const rows = mode === 'category' ? projection?.categoryBreakdown ?? [] : projection?.subscriptionBreakdown ?? [];
  const maximum = Math.max(1, ...rows.map((item) => item.totalCents));
  return (
    <View style={{ padding: 17, gap: 13, borderRadius: 22, borderCurve: 'continuous', backgroundColor: theme.backgroundElement }}>
      <FilterRow
        options={[{ value: 'category' as const, label: 'Categories' }, { value: 'subscription' as const, label: 'Subscriptions' }]}
        selected={mode}
        onSelect={onModeChange}
      />
      {rows.length === 0 ? (
        <Text selectable style={{ color: theme.textSecondary }}>Record a Payment to see spending breakdowns.</Text>
      ) : rows.map((row) => {
        const isSubscription = 'subscriptionId' in row;
        const id = isSubscription ? row.subscriptionId : row.categoryId ?? 'uncategorized';
        return (
          <View key={id} style={{ gap: 7 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => isSubscription ? onSelectSubscription(row.subscriptionId) : onSelectCategory(row.categoryId)}
              onLongPress={() => { if (isSubscription) onToggleExpanded(row.subscriptionId); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1, gap: 6 })}
            >
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Text selectable style={{ flex: 1, color: theme.text, fontWeight: '700' }}>{row.name}</Text>
                <Text selectable style={{ color: theme.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money.format(row.totalCents / 100)}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 999, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(3, row.totalCents / maximum * 100)}%`, height: 6, borderRadius: 999, backgroundColor: theme.accent }} />
              </View>
            </Pressable>
            {isSubscription ? (
              <Pressable onPress={() => onToggleExpanded(row.subscriptionId)}>
                <Text selectable style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {row.paymentCount} paid · {row.noChargeCount} not charged · {expanded.has(row.subscriptionId) ? 'Hide months' : 'Show months'}
                </Text>
              </Pressable>
            ) : null}
            {isSubscription && expanded.has(row.subscriptionId) ? row.months.map((month) => (
              <View key={month.month} style={{ flexDirection: 'row', gap: 8, paddingLeft: 10 }}>
                <Text selectable style={{ flex: 1, color: theme.textSecondary }}>{formatMonth(month.month)}</Text>
                <Text selectable style={{ color: theme.textSecondary, fontVariant: ['tabular-nums'] }}>
                  {money.format(month.paymentTotalCents / 100)} · {month.paymentCount} paid · {month.noChargeCount} not charged
                </Text>
              </View>
            )) : null}
          </View>
        );
      })}
    </View>
  );
}

function ActivityRow({ item, theme }: { readonly item: HistoryActivityItem; readonly theme: ReturnType<typeof useTheme> }) {
  const router = useRouter();
  const isBilling = item.kind === 'payment' || item.kind === 'noCharge';
  const title = item.kind === 'payment' ? 'Payment'
    : item.kind === 'noCharge' ? 'Not charged'
      : item.kind === 'paused' ? 'Paused'
        : item.kind === 'resumed' ? 'Resumed'
          : item.kind === 'canceled' ? 'Canceled' : 'Reactivated';
  const detail = item.kind === 'payment'
    ? `${money.format(item.amountCents / 100)}${item.paymentMethodName ? ` · ${item.paymentMethodName}` : ''}`
    : item.kind === 'noCharge'
      ? `${money.format(item.expectedAmountCents / 100)} not charged${item.reason ? ` · ${item.reason}` : ''}`
      : lifecycleDetail(item);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => isBilling
        ? router.push({ pathname: '/(tabs)/(index)/occurrence/[subscriptionId]/[billingDate]', params: { subscriptionId: item.subscriptionId, billingDate: item.billingDate } })
        : router.push({ pathname: '/(tabs)/(subscriptions)/[id]', params: { id: item.subscriptionId, lifecycleEventId: item.id } })}
      style={({ pressed }) => ({
        opacity: pressed ? 0.65 : 1,
        padding: 16,
        gap: 5,
        borderRadius: 18,
        borderCurve: 'continuous',
        backgroundColor: theme.backgroundElement,
      })}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Text selectable style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: '800' }}>{item.subscriptionName}</Text>
        <Text selectable style={{ color: item.kind === 'noCharge' ? theme.textSecondary : theme.accent, fontWeight: '700' }}>{title}</Text>
      </View>
      <Text selectable style={{ color: theme.textSecondary }}>{detail}</Text>
      <Text selectable style={{ color: theme.textSecondary, fontSize: 12 }}>{formatDate(item.activityDate)} · {item.categoryName}</Text>
    </Pressable>
  );
}

function FilterRow<Value extends string>({ options, selected, onSelect }: {
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly selected: Value;
  readonly onSelect: (value: Value) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: 13,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: isSelected ? theme.accent : theme.backgroundElement,
            })}
          >
            <Text style={{ color: isSelected ? theme.accentForeground : theme.text, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function historyRange(period: Period, customFrom?: string, customTo?: string): { from: string | null; to: string } {
  const today = new Date();
  const to = localDate(today);
  if (period === 'all') return { from: null, to };
  if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
  const from = period === 'month'
    ? new Date(today.getFullYear(), today.getMonth(), 1, 12)
    : new Date(today.getFullYear(), 0, 1, 12);
  return { from: localDate(from), to };
}

function groupActivities(items: readonly HistoryActivityItem[]) {
  const groups = new Map<string, HistoryActivityItem[]>();
  for (const item of items) {
    const key = item.activityDate.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([title, data]) => ({ title, data }));
}

function lifecycleDetail(item: Extract<HistoryActivityItem, { kind: 'paused' | 'resumed' | 'canceled' | 'reactivated' }>): string {
  if (item.kind === 'paused') return item.pauseEndDate ? `Planned through ${formatDate(item.pauseEndDate)}` : 'No planned end date';
  if (item.kind === 'canceled') return item.accessEndDate ? `Access through ${formatDate(item.accessEndDate)}` : 'Provider confirmed';
  return item.nextBillingDate ? `Next billing ${formatDate(item.nextBillingDate)}` : '';
}

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function dateFromString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(dateFromString(value));
}

function formatMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1, 12));
}
