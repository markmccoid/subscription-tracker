import { Image } from 'expo-image';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface PlannedScreenProps {
  readonly description: string;
  readonly symbol: string;
}

export function PlannedScreen({ description, symbol }: PlannedScreenProps) {
  const theme = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28 }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 64,
            height: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: theme.accentMuted,
          }}>
          <Image source={`sf:${symbol}`} style={{ width: 28, height: 28 }} tintColor={theme.accent} />
        </View>
        <Text selectable style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>
          Planned for a later slice
        </Text>
        <Text
          selectable
          style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
          {description}
        </Text>
      </View>
    </ScrollView>
  );
}
