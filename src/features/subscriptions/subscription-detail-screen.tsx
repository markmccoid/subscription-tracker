import { Stack, useFocusEffect, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { getSubscriptionTracker } from "@/application/create-subscription-tracker";
import type { SubscriptionDetail } from "@/application/subscription-tracker";
import type { SubscriptionId } from "@/domain/model";
import { useTheme } from "@/hooks/use-theme";

const lifecycleLabels = {
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
} as const;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function SubscriptionDetailScreen({ id }: { readonly id: SubscriptionId }) {
  const theme = useTheme();
  const router = useRouter();
  const [detail, setDetail] = useState<SubscriptionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSubscriptionTracker()
        .then((tracker) => tracker.loadSubscriptionDetail(id))
        .then((next) => {
          if (!active) return;
          setDetail(next);
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
              {detail.schedule.cycle === "monthly" ? "monthly" : "yearly"}
            </Text>
          </Text>
          {detail.lifecycle.status === "canceled" ? (
            <Text selectable style={{ color: theme.textSecondary }}>
              Canceled {formatDate(detail.lifecycle.cancellationConfirmationDate)}
              {detail.lifecycle.accessEndDate
                ? ` · Access through ${formatDate(detail.lifecycle.accessEndDate)}`
                : ""}
            </Text>
          ) : detail.nextBillingDate ? (
            <Text selectable style={{ color: theme.textSecondary }}>
              Next expected charge {formatDate(detail.nextBillingDate)}
            </Text>
          ) : null}
        </View>

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
          rows={[
            ["Cycle", detail.schedule.cycle === "monthly" ? "Monthly" : "Yearly"],
            ["Schedule Start", formatDate(detail.schedule.startDate)],
            ["Billing Day", String(detail.schedule.anchorDay)],
          ]}
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
        {!detail.archived ? (
          <View style={{ gap: 10 }}>
            {detail.lifecycle.status === "canceled" ? (
              <>
                <LifecycleButton
                  label="Edit Cancellation Details"
                  onPress={() =>
                    router.push({ pathname: "/edit-cancellation/[id]", params: { id: detail.id } })
                  }
                  theme={theme}
                />
                <LifecycleButton
                  label="Reactivate Subscription"
                  onPress={() =>
                    router.push({ pathname: "/reactivate-subscription/[id]", params: { id: detail.id } })
                  }
                  theme={theme}
                />
              </>
            ) : (
              <LifecycleButton
                label="Mark as Canceled"
                destructive
                onPress={() =>
                  router.push({ pathname: "/cancel-subscription/[id]", params: { id: detail.id } })
                }
                theme={theme}
              />
            )}
          </View>
        ) : null}
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
      <Text selectable style={{ color: destructive ? theme.danger : theme.accent, fontSize: 17, fontWeight: "700" }}>
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
