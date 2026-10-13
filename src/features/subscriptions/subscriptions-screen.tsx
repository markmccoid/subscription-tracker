import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, SectionList, Text, View } from "react-native";

import { getSubscriptionTracker } from "@/application/create-subscription-tracker";
import type { CategoryOption, SubscriptionListItem } from "@/application/subscription-tracker";
import type { CategoryId } from "@/domain/model";
import { useTheme } from "@/hooks/use-theme";

type LifecycleFilter = SubscriptionListItem["lifecycle"] | "all" | "archived";
type CategoryFilter = CategoryId | "all" | "uncategorized";

const lifecycleFilters: readonly { readonly value: LifecycleFilter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "canceled", label: "Canceled" },
  { value: "archived", label: "Archived" },
];

const lifecycleLabels: Record<SubscriptionListItem["lifecycle"], string> = {
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function SubscriptionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<readonly SubscriptionListItem[]>([]);
  const [categories, setCategories] = useState<readonly CategoryOption[]>([]);
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getSubscriptionTracker()
        .then((tracker) => Promise.all([tracker.loadSubscriptions(), tracker.loadCategories()]))
        .then(([nextItems, nextCategories]) => {
          if (!active) return;
          setItems(nextItems);
          setCategories(nextCategories);
          setCategory((current) =>
            current === "all" || current === "uncategorized" || nextCategories.some((item) => item.id === current)
              ? current
              : "all",
          );
          setError(null);
        })
        .catch((caught: unknown) => {
          if (active)
            setError(caught instanceof Error ? caught.message : "Could not load Subscriptions.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const categoryFilters: readonly { readonly value: CategoryFilter; readonly label: string }[] = [
    { value: "all", label: "Every Category" },
    ...categories.map((item) => ({ value: item.id, label: item.name })),
    { value: "uncategorized", label: "Uncategorized" },
  ];

  const sections = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      const archiveMatches = lifecycle === "archived" ? item.archived : !item.archived;
      const lifecycleMatches =
        lifecycle === "all" || lifecycle === "archived" || item.lifecycle === lifecycle;
      const categoryMatches =
        category === "all" ||
        (category === "uncategorized" ? item.categoryId === null : item.categoryId === category);
      return (
        archiveMatches &&
        lifecycleMatches &&
        categoryMatches &&
        (!normalizedSearch || item.name.toLocaleLowerCase().includes(normalizedSearch))
      );
    });
    return (["active", "paused", "canceled"] as const)
      .map((status) => ({
        title: lifecycleLabels[status],
        data: filtered.filter((item) => item.lifecycle === status),
      }))
      .filter((section) => section.data.length > 0);
  }, [category, items, lifecycle, search]);

  return (
    <>
      <Stack.SearchBar
        placeholder="Search Subscriptions"
        hideWhenScrolling
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Add Subscription"
          icon="plus"
          onPress={() => router.push("/add-subscription")}
          // variant="prominent"
        />
      </Stack.Toolbar>

      {loading ? (
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
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          style={{ flex: 1, backgroundColor: theme.background }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120, gap: 10 }}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 12 }}>
              <FilterRow options={lifecycleFilters} selected={lifecycle} onSelect={setLifecycle} />
              <FilterRow options={categoryFilters} selected={category} onSelect={setCategory} />
              {error ? (
                <Text selectable style={{ color: theme.danger }}>
                  {error}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={{ padding: 28, alignItems: "center", gap: 6 }}>
              <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
                No matching Subscriptions
              </Text>
              <Text
                selectable
                style={{ color: theme.textSecondary, fontSize: 15, textAlign: "center" }}
              >
                Change the filters or add a Subscription from the header.
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text
              selectable
              style={{
                paddingTop: 14,
                paddingBottom: 6,
                color: theme.textSecondary,
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.7,
                backgroundColor: theme.background,
              }}
            >
              {section.title.toUpperCase()}
            </Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/(subscriptions)/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => ({
                opacity: pressed ? 0.65 : 1,
                padding: 16,
                gap: 7,
                borderRadius: 20,
                borderCurve: "continuous",
                backgroundColor: theme.backgroundElement,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
                <Text
                  selectable
                  style={{ flex: 1, color: theme.text, fontSize: 17, fontWeight: "700" }}
                >
                  {item.name}
                </Text>
                <Text
                  selectable
                  style={{
                    color: theme.text,
                    fontSize: 16,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {money.format(item.amountCents / 100)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Text selectable style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {item.category ?? "Uncategorized"} · {cycleLabel(item.cycle)}
                </Text>
                {item.nextBillingDate ? (
                  <Text selectable style={{ color: theme.textSecondary, fontSize: 13 }}>
                    Next {formatDate(item.nextBillingDate)}
                  </Text>
                ) : null}
                {item.lifecycle !== "active" ? (
                  <Text selectable style={{ color: theme.accent, fontSize: 13, fontWeight: "700" }}>
                    {lifecycleLabels[item.lifecycle]}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </>
  );
}

function FilterRow<Value extends string>({
  options,
  selected,
  onSelect,
}: {
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly selected: Value;
  readonly onSelect: (value: Value) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
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
            <Text
              style={{
                color: isSelected ? theme.accentForeground : theme.text,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function cycleLabel(cycle: SubscriptionListItem["cycle"]): string {
  return cycle === "monthly" ? "Monthly" : cycle === "yearly" ? "Yearly" : "Weekly";
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day, 12),
  );
}
