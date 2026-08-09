import { Stack, useRouter } from "expo-router";

import { SubscriptionDashboardScreen } from "@/features/dashboard/subscription-dashboard-screen";

export default function UpcomingRoute() {
  const router = useRouter();
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Open payment history"
          icon="clock.arrow.circlepath"
          onPress={() => router.push("/(tabs)/(index)/history")}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Add Subscription"
          icon="plus"
          onPress={() => router.push("/add-subscription")}
          variant="plain"
        />
      </Stack.Toolbar>
      <SubscriptionDashboardScreen />
    </>
  );
}
