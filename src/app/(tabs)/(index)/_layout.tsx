import { Stack } from 'expo-router';

import { useTabStackOptions } from '@/navigation/use-tab-stack-options';

export default function UpcomingLayout() {
  const screenOptions = useTabStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Upcoming' }} />
      <Stack.Screen name="history" options={{ title: 'History', headerLargeTitleEnabled: false }} />
      <Stack.Screen
        name="occurrence/[subscriptionId]/[billingDate]"
        options={{ title: 'Billing Occurrence', headerLargeTitleEnabled: false }}
      />
    </Stack>
  );
}
