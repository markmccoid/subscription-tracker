import { Stack } from 'expo-router';

import { useTabStackOptions } from '@/navigation/use-tab-stack-options';

export default function SettingsLayout() {
  const screenOptions = useTabStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="appearance" options={{ title: 'Appearance', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="payment-methods" options={{ title: 'Payment Methods', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="categories" options={{ title: 'Categories', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="data" options={{ title: 'Data', headerLargeTitleEnabled: false }} />
      <Stack.Screen name="about" options={{ title: 'About', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
