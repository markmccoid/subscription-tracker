import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type SettingsRow = {
  readonly title: string;
  readonly symbol: string;
  readonly symbolBackground: string;
  readonly value?: string;
  readonly href?: Href;
};

type SettingsSection = {
  readonly title: string;
  readonly rows: readonly SettingsRow[];
};

const sections: readonly SettingsSection[] = [
  {
    title: 'Household',
    rows: [
      {
        title: 'Payment Methods',
        symbol: 'creditcard.fill',
        symbolBackground: '#007AFF',
        href: '/(tabs)/(settings)/payment-methods',
      },
      {
        title: 'Household Currency',
        symbol: 'dollarsign',
        symbolBackground: '#34C759',
        value: 'USD',
      },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      {
        title: 'Notifications',
        symbol: 'bell.fill',
        symbolBackground: '#FF3B30',
        href: '/(tabs)/(settings)/notifications',
      },
      {
        title: 'Appearance',
        symbol: 'paintpalette.fill',
        symbolBackground: '#5856D6',
        href: '/(tabs)/(settings)/appearance',
      },
    ],
  },
  {
    title: 'Data',
    rows: [
      {
        title: 'Backup & Restore',
        symbol: 'externaldrive.fill',
        symbolBackground: '#FF9500',
        href: '/(tabs)/(settings)/data',
      },
    ],
  },
  {
    title: 'App',
    rows: [
      {
        title: 'About',
        symbol: 'info',
        symbolBackground: '#8E8E93',
        href: '/(tabs)/(settings)/about',
      },
    ],
  },
];

export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const groupedBackground = theme.scheme === 'dark' ? '#000000' : '#F2F2F7';
  const groupBackground = theme.scheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const separator = theme.scheme === 'dark' ? '#38383A' : '#C6C6C8';
  const tertiaryText = theme.scheme === 'dark' ? '#8E8E93' : '#6C6C70';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: groupedBackground }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 26 }}>
      {sections.map((section) => (
        <View key={section.title} style={{ gap: 7 }}>
          <Text
            selectable
            style={{ paddingHorizontal: 16, color: tertiaryText, fontSize: 13, lineHeight: 18 }}>
            {section.title.toUpperCase()}
          </Text>

          <View
            style={{
              overflow: 'hidden',
              borderRadius: 10,
              borderCurve: 'continuous',
              backgroundColor: groupBackground,
            }}>
            {section.rows.map((row, index) => (
              <View key={row.title}>
                {index > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      zIndex: 1,
                      top: 0,
                      right: 0,
                      left: 58,
                      height: 1,
                      backgroundColor: separator,
                    }}
                  />
                ) : null}

                <Pressable
                  accessibilityRole={row.href ? 'button' : undefined}
                  accessibilityLabel={row.value ? `${row.title}, ${row.value}` : row.title}
                  disabled={!row.href}
                  onPress={row.href ? () => router.push(row.href!) : undefined}
                  style={({ pressed }) => ({
                    minHeight: 50,
                    paddingLeft: 12,
                    paddingRight: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: pressed ? theme.backgroundSelected : groupBackground,
                  })}>
                  <View
                    style={{
                      width: 29,
                      height: 29,
                      borderRadius: 7,
                      borderCurve: 'continuous',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: row.symbolBackground,
                    }}>
                    <Image
                      accessibilityIgnoresInvertColors
                      source={`sf:${row.symbol}`}
                      style={{ width: 17, height: 17 }}
                      tintColor="#FFFFFF"
                    />
                  </View>

                  <Text selectable style={{ flex: 1, color: theme.text, fontSize: 17, lineHeight: 22 }}>
                    {row.title}
                  </Text>

                  {row.value ? (
                    <Text selectable style={{ color: tertiaryText, fontSize: 17, lineHeight: 22 }}>
                      {row.value}
                    </Text>
                  ) : null}

                  {row.href ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      source="sf:chevron.right"
                      style={{ width: 7, height: 12 }}
                      tintColor={tertiaryText}
                    />
                  ) : null}
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
