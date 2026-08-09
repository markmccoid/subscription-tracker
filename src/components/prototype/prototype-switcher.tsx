import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomTabInset, Fonts } from '@/constants/theme';

export type PrototypeVariant = 'A' | 'B' | 'C';

const variants: { key: PrototypeVariant; name: string }[] = [
  { key: 'A', name: 'Chronological calm' },
  { key: 'B', name: 'Decision first' },
  { key: 'C', name: 'Compact ledger' },
];

function isEditableTarget(target: EventTarget | null) {
  if (process.env.EXPO_OS !== 'web' || !(target instanceof HTMLElement)) {
    return false;
  }

  return target.matches('input, textarea, [contenteditable="true"]');
}

export function PrototypeSwitcher({ current }: { current: PrototypeVariant }) {
  const currentIndex = variants.findIndex((variant) => variant.key === current);

  function select(offset: number) {
    const nextIndex = (currentIndex + offset + variants.length) % variants.length;
    router.setParams({ variant: variants[nextIndex].key });
  }

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        select(-1);
      }
      if (event.key === 'ArrowRight') {
        select(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!__DEV__) {
    return null;
  }

  const selected = variants[currentIndex];

  return (
    <View
      style={{
        position: 'absolute',
        bottom: BottomTabInset + 14,
        left: 20,
        right: 20,
        alignItems: 'center',
        pointerEvents: 'box-none',
      }}>
      <View
        style={{
          minHeight: 50,
          maxWidth: 390,
          width: '100%',
          padding: 5,
          borderRadius: 28,
          borderCurve: 'continuous',
          backgroundColor: '#111318',
          flexDirection: 'row',
          alignItems: 'center',
          boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
        }}>
        <SwitcherButton label="Previous variant" symbol="‹" onPress={() => select(-1)} />
        <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
          <Text
            selectable
            style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: Fonts.rounded }}>
            {selected.key} — {selected.name}
          </Text>
          <Text selectable style={{ color: '#A7ABB4', fontSize: 10, fontWeight: '600' }}>
            PROTOTYPE · use ← → on web
          </Text>
        </View>
        <SwitcherButton label="Next variant" symbol="›" onPress={() => select(1)} />
      </View>
    </View>
  );
}

function SwitcherButton({
  label,
  symbol,
  onPress,
}: {
  label: string;
  symbol: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? '#373A42' : '#24262C',
      })}>
      <Text style={{ color: '#FFFFFF', fontSize: 31, lineHeight: 34, fontWeight: '400' }}>{symbol}</Text>
    </Pressable>
  );
}
