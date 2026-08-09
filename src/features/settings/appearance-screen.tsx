import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { accentColorOptions, type ThemeMode } from '@/appearance/appearance';
import { useTheme } from '@/hooks/use-theme';
import { useAppearanceStore } from '@/stores/appearance-store';

const modes: readonly { readonly value: ThemeMode; readonly label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const accentNames = ['Indigo', 'Blue', 'Green', 'Orange', 'Magenta', 'Red'] as const;

export function AppearanceScreen() {
  const theme = useTheme();
  const accentColor = useAppearanceStore((state) => state.accentColor);
  const themeMode = useAppearanceStore((state) => state.themeMode);
  const setAccentColor = useAppearanceStore((state) => state.setAccentColor);
  const setThemeMode = useAppearanceStore((state) => state.setThemeMode);
  const restoreDefaults = useAppearanceStore((state) => state.restoreDefaults);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 18, paddingBottom: 80, gap: 26 }}>
      <View style={{ gap: 9 }}>
        <Text selectable style={{ paddingHorizontal: 4, color: theme.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 }}>
          THEME
        </Text>
        <View
          style={{
            flexDirection: 'row',
            gap: 5,
            padding: 5,
            borderRadius: 16,
            borderCurve: 'continuous',
            backgroundColor: theme.backgroundElement,
          }}>
          {modes.map((mode) => {
            const selected = mode.value === themeMode;
            return (
              <Pressable
                key={mode.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setThemeMode(mode.value)}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.7 : 1,
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderCurve: 'continuous',
                  backgroundColor: selected ? theme.accent : 'transparent',
                })}>
                <Text style={{ color: selected ? theme.accentForeground : theme.text, fontSize: 14, fontWeight: '700' }}>
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 12 }}>
        <Text selectable style={{ paddingHorizontal: 4, color: theme.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 }}>
          ACCENT COLOR
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          {accentColorOptions.map((color, index) => {
            const selected = color === accentColor;
            return (
              <Pressable
                key={color}
                accessibilityRole="button"
                accessibilityLabel={`${accentNames[index]} accent`}
                accessibilityState={{ selected }}
                onPress={() => setAccentColor(color)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.65 : 1,
                  width: 46,
                  height: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 23,
                  backgroundColor: color,
                  borderWidth: selected ? 3 : 0,
                  borderColor: theme.text,
                })}>
                {selected ? (
                  <Image source="sf:checkmark" style={{ width: 18, height: 18 }} tintColor={theme.accentForeground} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={{
          padding: 20,
          gap: 14,
          borderRadius: 24,
          borderCurve: 'continuous',
          backgroundColor: theme.accent,
          boxShadow: `0 10px 24px ${theme.accent}33`,
        }}>
        <Text selectable style={{ color: theme.accentForeground, opacity: 0.8, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 }}>
          LIVE PREVIEW
        </Text>
        <Text selectable style={{ color: theme.accentForeground, fontSize: 24, fontWeight: '800' }}>
          $48.97 due soon
        </Text>
        <View
          style={{ alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.accentForeground }}>
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '800' }}>Review charges</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={restoreDefaults}
        style={({ pressed }) => ({
          opacity: pressed ? 0.65 : 1,
          alignItems: 'center',
          padding: 15,
          borderRadius: 16,
          borderCurve: 'continuous',
          backgroundColor: theme.backgroundElement,
        })}>
        <Text style={{ color: theme.accent, fontSize: 15, fontWeight: '700' }}>Restore Defaults</Text>
      </Pressable>
    </ScrollView>
  );
}
