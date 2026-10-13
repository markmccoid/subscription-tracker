import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { getSubscriptionTracker } from "@/application/create-subscription-tracker";
import type { HistoryActivityItem, SubscriptionDetail } from "@/application/subscription-tracker";
import type { LifecycleEventId, SubscriptionId } from "@/domain/model";
import { useTheme } from "@/hooks/use-theme";
import { cancelBillingRemindersForSubscription } from "@/notifications/billing-notifications";

const lifecycleLabels = {
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
} as const;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type LifecycleActivity = Extract<HistoryActivityItem, { kind: 'paused' | 'resumed' | 'canceled' | 'reactivated' }>;

export function SubscriptionDetailScreen({ id, highlightedEventId }: {
  readonly id: SubscriptionId;
  readonly highlightedEventId?: LifecycleEventId;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [lifecycleEvents, setLifecycleEvents] = useState<readonly LifecycleActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSubscriptionTracker()
        .then((tracker) => Promise.all([
          tracker.loadSubscriptionDetail(id),
          tracker.loadHistory({ subscriptionId: id }),
        ]))
        .then(([next, history]) => {
          if (!active) return;
          setDetail(next);
          setLifecycleEvents(history.activities.filter(
            (item): item is LifecycleActivity => item.kind !== 'payment' && item.kind !== 'noCharge',
          ));
          setError(null);
        })
        .catch((caught: unknown) => {
          if (active)
            setError(
              caught instanceof Error ? caught.message : "Could not load this Subscription.",
            );
        });
      return () => {
        active = false;
      };
    }, [id]),
  );

  if (!detail && !error) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (!detail) {
    return (
      <View
        style={{
          flex: 1,
          padding: 24,
          justifyContent: "center",
          backgroundColor: theme.background,
        }}
      >
        <Text selectable style={{ color: theme.danger, textAlign: "center" }}>
          {error}
        </Text>
      </View>
    );
  }

  const amount = detail.pricing.standardAmount;
  const canEdit = !detail.archived && detail.pricing.kind === "standard";
  const confirmDelete = () => {
    Alert.alert(
      "Delete Subscription?",
      `“${detail.name}” and all of its Payments, No Charge records, and lifecycle history will be permanently deleted. This cannot be undone.`,
      [
        { text: "Keep Subscription", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setError(null);
            void getSubscriptionTracker()
              .then((tracker) => tracker.deleteSubscription(detail.id))
              .then(() => cancelBillingRemindersForSubscription(detail.id).catch(() => undefined))
              .then(() => router.dismissTo("/(tabs)/(subscriptions)"))
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : "Could not delete this Subscription.",
                ),
              );
          },
        },
      ],
    );
  };

  return (
    <>
      {canEdit ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            onPress={() =>
              router.push({ pathname: "/edit-subscription/[id]", params: { id: detail.id } })
            }
          >
            Edit
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 18, paddingBottom: 80, gap: 14 }}
      >
        <View
          style={{
            padding: 20,
            borderRadius: 24,
            borderCurve: "continuous",
            gap: 8,
            backgroundColor: theme.backgroundElement,
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <Text
              selectable
              style={{ flex: 1, color: theme.text, fontSize: 28, fontWeight: "800" }}
            >
              {detail.name}
            </Text>
            <Text selectable style={{ color: theme.accent, fontSize: 14, fontWeight: "700" }}>
              {detail.archived ? "Archived" : lifecycleLabels[detail.lifecycle.status]}
            </Text>
          </View>
          <Text
            selectable
            style={{
              color: theme.text,
              fontSize: 22,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
            }}
          >
            {money.format(amount / 100)}{" "}
            <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: "500" }}>
              {cycleAdverb(detail.schedule.cycle)}
            </Text>
          </Text>
          {detail.lifecycle.status === "canceled" ? (
            <Text selectable style={{ color: theme.textSecondary }}>
              Canceled {formatDate(detail.lifecycle.cancellationConfirmationDate)}
              {detail.lifecycle.accessEndDate
                ? ` · Access through ${formatDate(detail.lifecycle.accessEndDate)}`
                : ""}
            </Text>
          ) : detail.lifecycle.status === "paused" ? (
            <Text selectable style={{ color: theme.textSecondary }}>
              {detail.lifecycle.pauseEndDate
                ? `Paused through ${formatDate(detail.lifecycle.pauseEndDate)}`
                : "Paused indefinitely"}
            </Text>
          ) : detail.nextBillingDate ? (
            <Text selectable style={{ color: theme.textSecondary }}>
              {detail.schedule.cycle === "weekly" ? "Next delivery" : "Next expected charge"}{" "}
              {formatDate(detail.nextBillingDate)}
            </Text>
          ) : null}
        </View>

        {lifecycleEvents.length ? (
          <View style={{ padding: 18, borderRadius: 20, borderCurve: "continuous", gap: 12, backgroundColor: theme.backgroundElement }}>
            <Text selectable style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.7 }}>
              LIFECYCLE HISTORY
            </Text>
            {lifecycleEvents.map((event, index) => (
              <View
                key={event.id}
                style={{
                  padding: 12,
                  gap: 5,
                  borderRadius: 14,
                  borderCurve: "continuous",
                  borderWidth: highlightedEventId === event.id ? 2 : 0,
                  borderColor: theme.accent,
                  backgroundColor: highlightedEventId === event.id ? theme.accentMuted : theme.background,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text selectable style={{ flex: 1, color: theme.text, fontWeight: "700" }}>
                    {lifecycleEventTitle(event.kind)} · {formatDate(event.activityDate)}
                  </Text>
                  {event.kind === 'canceled' && index === 0 && detail.lifecycle.status === 'canceled' ? (
                    <Pressable onPress={() => router.push({ pathname: "/edit-cancellation/[id]", params: { id: detail.id } })}>
                      <Text selectable style={{ color: theme.accent, fontWeight: "700" }}>Edit</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => confirmDeleteLifecycleEvent(event.id as LifecycleEventId, detail.id, detail.name, router, setError)}>
                    <Text selectable style={{ color: theme.danger, fontWeight: "700" }}>Delete</Text>
                  </Pressable>
                </View>
                <Text selectable style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {lifecycleEventSummary(event)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <DetailSection
          title="Profile"
          theme={theme}
          rows={[
            ["Category", detail.category ?? "Uncategorized"],
            [
              "Default Payment Method",
              detail.defaultPaymentMethodName
                ? `${detail.defaultPaymentMethodName}${detail.defaultPaymentMethodRetired ? " — Retired" : ""}`
                : "None",
            ],
          ]}
        />
        <DetailSection
          title="Billing Schedule"
          theme={theme}
          rows={
            detail.schedule.cycle === "weekly"
              ? [
                  ["Cycle", `Weekly · every ${weekdayName(detail.schedule.startDate)}`],
                  ["Schedule Start", formatDate(detail.schedule.startDate)],
                  ["Next Delivery", detail.nextBillingDate ? formatDate(detail.nextBillingDate) : "None"],
                  ["Skipped Weeks", detail.showSkippedWeeks ? "Shown in Upcoming" : "Hidden in Upcoming"],
                ]
              : [
                  ["Cycle", detail.schedule.cycle === "monthly" ? "Monthly" : "Yearly"],
                  ["Schedule Start", formatDate(detail.schedule.startDate)],
                  ["Billing Day", String(detail.schedule.anchorDay)],
                ]
          }
        />
        <DetailSection
          title="Reminders"
          theme={theme}
          rows={[
            [
              "Lead Time",
              detail.reminderLeadDaysOverride === null
                ? `Household Default — ${detail.householdReminderLeadDays} days`
                : `${detail.reminderLeadDaysOverride} days before`,
            ],
            ["Notifications", detail.notificationsMuted ? "Muted" : "On"],
          ]}
        />
        {detail.note || detail.cancellationUrl ? (
          <View
            style={{
              padding: 18,
              borderRadius: 20,
              borderCurve: "continuous",
              gap: 10,
              backgroundColor: theme.backgroundElement,
            }}
          >
            <Text
              selectable
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.7,
              }}
            >
              ADDITIONAL DETAILS
            </Text>
            {detail.note ? (
              <Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 22 }}>
                {detail.note}
              </Text>
            ) : null}
            {detail.cancellationUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(detail.cancellationUrl!).catch((caught: unknown) =>
                    setError(caught instanceof Error ? caught.message : "Could not open the Cancellation Website."),
                  );
                }}
              >
                <Text selectable style={{ color: theme.accent, fontSize: 16 }}>
                  Open Cancellation Website
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {!detail.archived ? (
            detail.lifecycle.status === "canceled" ? (
              <>
                <LifecycleButton
                  label="Edit Cancel"
                  onPress={() =>
                    router.push({ pathname: "/edit-cancellation/[id]", params: { id: detail.id } })
                  }
                  theme={theme}
                />
                <LifecycleButton
                  label="Reactivate"
                  onPress={() =>
                    router.push({ pathname: "/reactivate-subscription/[id]", params: { id: detail.id } })
                  }
                  theme={theme}
                />
              </>
            ) : detail.lifecycle.status === "paused" ? (
              <>
                <LifecycleButton
                  label="Resume Sub"
                  onPress={() => router.push({ pathname: "/resume-subscription/[id]" as never, params: { id: detail.id } })}
                  theme={theme}
                />
                <LifecycleButton
                  label="Cancel Sub"
                  destructive
                  onPress={() => router.push({ pathname: "/cancel-subscription/[id]", params: { id: detail.id } })}
                  theme={theme}
                />
              </>
            ) : (
              <>
                {detail.schedule.cycle === "weekly" ? (
                  <LifecycleButton
                    label="Plan Weeks"
                    onPress={() => router.push({ pathname: "/plan-weeks/[id]" as never, params: { id: detail.id } })}
                    theme={theme}
                  />
                ) : null}
                <LifecycleButton
                  label="Pause Sub"
                  onPress={() => router.push({ pathname: "/pause-subscription/[id]" as never, params: { id: detail.id } })}
                  theme={theme}
                />
                <LifecycleButton
                  label="Cancel Sub"
                  destructive
                  onPress={() => router.push({ pathname: "/cancel-subscription/[id]", params: { id: detail.id } })}
                  theme={theme}
                />
              </>
            )
          ) : null}
          <LifecycleButton label="Delete Sub" destructive onPress={confirmDelete} theme={theme} />
        </View>
        <DetailSection
          title="Record"
          theme={theme}
          rows={[
            ["Created", formatTimestamp(detail.createdAt)],
            ["Updated", formatTimestamp(detail.updatedAt)],
          ]}
        />
        {error ? (
          <Text selectable style={{ color: theme.danger }}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function confirmDeleteLifecycleEvent(
  eventId: LifecycleEventId,
  subscriptionId: SubscriptionId,
  subscriptionName: string,
  router: ReturnType<typeof useRouter>,
  setError: (value: string | null) => void,
) {
  Alert.alert(
    "Delete Lifecycle Event?",
    `This corrects ${subscriptionName} history and may change its current status or restore overdue charges.`,
    [
      { text: "Keep Event", style: "cancel" },
      {
        text: "Delete Event",
        style: "destructive",
        onPress: () => {
          void getSubscriptionTracker()
            .then((tracker) => tracker.deleteLifecycleEvent(eventId))
            .then(() => router.replace({ pathname: "/(tabs)/(subscriptions)/[id]", params: { id: subscriptionId } }))
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not delete Lifecycle Event."));
        },
      },
    ],
  );
}

function lifecycleEventTitle(kind: LifecycleActivity['kind']): string {
  return kind === 'paused' ? 'Paused' : kind === 'resumed' ? 'Resumed' : kind === 'canceled' ? 'Canceled' : 'Reactivated';
}

function lifecycleEventSummary(event: LifecycleActivity): string {
  if (event.kind === 'paused') return event.pauseEndDate ? `Planned through ${formatDate(event.pauseEndDate)}` : 'No planned end date';
  if (event.kind === 'canceled') return event.accessEndDate ? `Access through ${formatDate(event.accessEndDate)}` : 'Provider confirmed';
  return event.nextBillingDate ? `Next billing ${formatDate(event.nextBillingDate)}` : '';
}

function LifecycleButton({
  label,
  onPress,
  destructive = false,
  theme,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
  readonly theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 52,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: destructive ? theme.danger : theme.border,
        backgroundColor: theme.backgroundElement,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text
        selectable
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: destructive ? theme.danger : theme.accent, fontSize: 15, fontWeight: "700" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DetailSection({
  title,
  rows,
  theme,
}: {
  readonly title: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        padding: 18,
        borderRadius: 20,
        borderCurve: "continuous",
        gap: 12,
        backgroundColor: theme.backgroundElement,
      }}
    >
      <Text
        selectable
        style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.7 }}
      >
        {title.toUpperCase()}
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", gap: 16 }}>
          <Text selectable style={{ flex: 1, color: theme.textSecondary, fontSize: 15 }}>
            {label}
          </Text>
          <Text
            selectable
            style={{ flex: 1.4, color: theme.text, fontSize: 15, textAlign: "right" }}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function cycleAdverb(cycle: SubscriptionDetail["schedule"]["cycle"]): string {
  return cycle === "monthly" ? "monthly" : cycle === "yearly" ? "yearly" : "per week";
}

function weekdayName(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    new Date(year, month - 1, day, 12),
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
