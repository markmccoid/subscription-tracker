import { Stack } from 'expo-router';

import { useTabStackOptions } from '@/navigation/use-tab-stack-options';

export default function SubscriptionsLayout() {
  const screenOptions = useTabStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Subscriptions' }} />
      <Stack.Screen name="[id]" options={{ title: 'Subscription', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
