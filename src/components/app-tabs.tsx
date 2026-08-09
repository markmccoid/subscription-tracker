import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const theme = useTheme();

  return (
    <NativeTabs
      backgroundColor={theme.background}
      iconColor={{ default: theme.textSecondary, selected: theme.accent }}
      indicatorColor={theme.accentMuted}
      labelStyle={{
        default: { color: theme.textSecondary },
        selected: { color: theme.accent },
      }}>
      <NativeTabs.Trigger name="(index)">
        <NativeTabs.Trigger.Label>Upcoming</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar.circle.fill' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(subscriptions)">
        <NativeTabs.Trigger.Label>Subscriptions</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
