import Constants from 'expo-constants';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export default function AboutRoute() {
  const theme = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 24 }}>
      <View style={{ gap: 6, padding: 20, borderRadius: 20, borderCurve: 'continuous', backgroundColor: theme.backgroundElement }}>
        <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>Subscription Tracker</Text>
        <Text selectable style={{ color: theme.textSecondary, fontSize: 15 }}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text selectable style={{ color: theme.textSecondary, fontSize: 15 }}>Your Household List stays on this device in version one.</Text>
      </View>
    </ScrollView>
  );
}
