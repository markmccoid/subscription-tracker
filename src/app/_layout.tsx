import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useTheme } from '@/hooks/use-theme';
import { useAppearanceStore } from '@/stores/appearance-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const appTheme = useTheme();
  const themeMode = useAppearanceStore((state) => state.themeMode);
  const baseTheme = appTheme.scheme === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'unspecified' : themeMode);
  }, [themeMode]);

  const navigationTheme: Theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: appTheme.accent,
      background: appTheme.background,
      card: appTheme.backgroundElement,
      text: appTheme.text,
      border: appTheme.border,
      notification: appTheme.accent,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={appTheme.scheme === 'dark' ? 'light' : 'dark'} />
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-subscription"
          options={{
            title: 'Add Subscription',
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: appTheme.background },
          }}
        />
        <Stack.Screen
          name="edit-subscription/[id]"
          options={{
            title: 'Edit Subscription',
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: appTheme.background },
          }}
        />
        <Stack.Screen
          name="add-payment-method"
          options={{
            title: 'Add Payment Method',
            presentation: 'formSheet',
            sheetAllowedDetents: [0.55, 1],
            sheetGrabberVisible: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: appTheme.background },
          }}
        />
        <Stack.Screen
          name="edit-payment-method/[id]"
          options={{
            title: 'Edit Payment Method',
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1],
            sheetGrabberVisible: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: appTheme.background },
          }}
        />
        <Stack.Screen
          name="record-payment/[subscriptionId]/[billingDate]"
          options={{
            title: 'Record Payment',
            presentation: 'formSheet',
            sheetAllowedDetents: [1],
            sheetGrabberVisible: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: appTheme.background },
          }}
        />
        <Stack.Screen
          name="record-no-charge/[subscriptionId]/[billingDate]"
          options={{
            title: 'No Charge',
            presentation: 'formSheet',
            sheetAllowedDetents: [0.55, 1],
            sheetGrabberVisible: true,
            headerTransparent: true,
            contentStyle: { backgroundColor: appTheme.background },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
