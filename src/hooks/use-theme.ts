/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { createAppTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearanceStore } from '@/stores/appearance-store';

export function useTheme() {
  const systemScheme = useColorScheme();
  const accentColor = useAppearanceStore((state) => state.accentColor);
  const themeMode = useAppearanceStore((state) => state.themeMode);
  const scheme = themeMode === 'system' ? systemScheme : themeMode;
  const resolvedScheme = scheme === 'dark' ? 'dark' : 'light';

  return createAppTheme(resolvedScheme, accentColor);
}
